import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { db, auth } from '../firebase/firebase';
import { 
  collection, onSnapshot, doc, query, orderBy, where, limit, getDocs, getDoc, setDoc, updateDoc, deleteDoc, deleteField, serverTimestamp, addDoc, writeBatch, runTransaction
} from 'firebase/firestore';
import { getCheckoutPaymentFees } from '../utils/paymentSettings';
import {
  ONHAND_BOX_CONDITION,
  ONHAND_KIT_CONDITION,
  withStockConditionDefaults
} from '../utils/stockConditions';
import { normalizeFeederRecord, normalizePrinterRecord, normalizePrinterStatus } from '../utils/printerCompatibility';
import { getStockEta } from '../utils/stockDates';

const getKitTimestamp = (kit) => {
  const timestamps = [
    kit?.lastAvailableAt,
    kit?.lastRestockedAt,
    kit?.createdAt,
    kit?.lastUpdated
  ].map(val => {
    if (!val) return 0;
    if (typeof val.toMillis === 'function') return val.toMillis();
    if (val.seconds) return val.seconds * 1000;
    return new Date(val).getTime() || 0;
  });
  return Math.max(...timestamps, 0);
};

const getAvailableStockCount = (kit) => {
  return Object.values(kit?.stocks || {}).filter((stock) => !stock?.order?.orderId && !stock?.isReserved).length;
};

const DATASET_KEYS = ['userProfile', 'stories', 'kits', 'printedProjects', 'deals', 'orders', 'basket', 'shelf', 'prints'];

const createInitialDatasetState = (value) => DATASET_KEYS.reduce((result, key) => {
  result[key] = value;
  return result;
}, {});

// Firestore may emit an empty local-cache snapshot before the server result.
// Keep that dataset in its loading state until a non-cache snapshot or an
// actual listener error arrives, so the UI cannot flash an empty state midway
// through the initial request.
const isEmptyCacheSnapshot = (snap) => Boolean(snap?.metadata?.fromCache && snap.empty);

const updateSnapshotDatasetStatus = (get, key, snap) => {
  if (isEmptyCacheSnapshot(snap)) {
    get().setDatasetStatus(key, 'loading');
    return;
  }

  get().markLoaded(key, {
    status: snap?.metadata?.fromCache ? 'cache' : (snap.empty ? 'empty' : 'ready')
  });
};

const removeUndefinedValues = (value) => {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => entry !== undefined)
      .map(removeUndefinedValues);
  }

  if (!value || typeof value !== 'object' || value instanceof Date) return value;

  // Preserve Firestore Timestamp-like values and other SDK objects.
  if (typeof value.toDate === 'function' || typeof value.toMillis === 'function') return value;

  return Object.entries(value).reduce((result, [key, entry]) => {
    if (entry !== undefined) result[key] = removeUndefinedValues(entry);
    return result;
  }, {});
};

const reconcileAdminShelfSnapshot = async (shelfSnap) => {
  const kitsSnap = await getDocs(collection(db, 'kits'));
  const kitsById = new Map(kitsSnap.docs.map((kitDoc) => [kitDoc.id, kitDoc.data()]));
  const staleShelfDocs = [];
  const validItems = [];

  shelfSnap.docs.forEach((shelfDoc) => {
    const item = shelfDoc.data();

    // Project entries do not reference a kit stock key and should not be
    // removed by stock reconciliation.
    if (item?.type === 'project' || !item?.stockKey) {
      validItems.push({ ...item, basketId: shelfDoc.id });
      return;
    }

    const stock = kitsById.get(item.id)?.stocks?.[item.stockKey];
    if (!stock) {
      staleShelfDocs.push(shelfDoc);
      return;
    }

    validItems.push({ ...item, basketId: shelfDoc.id });
  });

  for (let index = 0; index < staleShelfDocs.length; index += 450) {
    const batch = writeBatch(db);
    staleShelfDocs.slice(index, index + 450).forEach((shelfDoc) => batch.delete(shelfDoc.ref));
    await batch.commit();
  }

  if (staleShelfDocs.length > 0) {
    console.info(`SG LOG: Removed ${staleShelfDocs.length} orphaned admin shelf stock entr${staleShelfDocs.length === 1 ? 'y' : 'ies'}.`);
  }

  return validItems;
};

const getStockCostPrice = (stock) => {
  const value = Number(stock?.costPrice);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
};

const getStockSource = (stock) => {
  const status = String(stock?.status || '').trim().toLowerCase();
  return status.includes('pre') || status.includes('batch') ? 'preorder' : 'onhand';
};

const stockMatchesSource = (stock, source) => !source || getStockSource(stock) === source;

const BUNDLE_DEAL_DEFAULT_RESTART_DELAY_MS = 60 * 60 * 1000;
const BUNDLE_DEAL_DEFAULT_VALIDITY_MS = 3 * 24 * 60 * 60 * 1000;
const BUNDLE_DEAL_MIN_VALIDITY_DAYS = 3;
const BUNDLE_DEAL_MIN_RESTART_DELAY_MS = 60 * 60 * 1000;

const getDealDateMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  // Deal dates are stored as local `YYYY-MM-DDTHH:mm` values. Keep the same
  // local-time interpretation used by the customer-facing deal components.
  const [datePart, timePart = '00:00'] = String(value).split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  if (![year, month, day, hours, minutes].every(Number.isFinite)) return 0;

  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
};

const getBundleDealReactivationDelayMs = (deal) => {
  const configuredHours = Number(deal?.reactivationDelayHours);
  if (Number.isFinite(configuredHours) && configuredHours >= 0) {
    return Math.max(BUNDLE_DEAL_MIN_RESTART_DELAY_MS, configuredHours * 60 * 60 * 1000);
  }

  const configuredValue = Number(deal?.reactivationDelayValue ?? deal?.reactivationDelay);
  if (Number.isFinite(configuredValue) && configuredValue >= 0) {
    const multiplier = deal?.reactivationDelayUnit === 'days' ? 24 : 1;
    return Math.max(BUNDLE_DEAL_MIN_RESTART_DELAY_MS, configuredValue * multiplier * 60 * 60 * 1000);
  }

  // Existing deals predate the configurable cooldown and retain the original
  // one-hour behavior until they are edited and saved again.
  return BUNDLE_DEAL_DEFAULT_RESTART_DELAY_MS;
};

const getBundleDealValidityMs = (deal) => {
  const configuredDays = Number(deal?.validityDays);
  if (Number.isFinite(configuredDays) && configuredDays > 0) {
    return Math.max(BUNDLE_DEAL_MIN_VALIDITY_DAYS, configuredDays) * 24 * 60 * 60 * 1000;
  }

  const validFromMs = getDealDateMillis(deal?.validFrom);
  const validUntilMs = getDealDateMillis(deal?.validUntil);
  if (validUntilMs > validFromMs && validFromMs > 0) {
    return Math.max(BUNDLE_DEAL_MIN_VALIDITY_DAYS * 24 * 60 * 60 * 1000, validUntilMs - validFromMs);
  }

  // Existing records without a duration field retain the previous default.
  return BUNDLE_DEAL_DEFAULT_VALIDITY_MS;
};

const formatDealDateValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const compareCustomerStockEntries = ([aKey, aStock], [bKey, bStock]) => {
  const costDelta = Number(bStock?.costPrice || 0) - Number(aStock?.costPrice || 0);
  if (costDelta !== 0) return costDelta;

  const sellDelta = Number(bStock?.sellPrice || 0) - Number(aStock?.sellPrice || 0);
  if (sellDelta !== 0) return sellDelta;

  return String(aKey).localeCompare(String(bKey));
};

const getBuiltOnhandSellPrice = (costPrice) => {
  const cost = Number(costPrice);
  if (!Number.isFinite(cost) || cost <= 0) return 0;

  const lowerHundred = Math.floor(cost / 100) * 100;
  const remainder = cost - lowerHundred;
  return lowerHundred + (remainder >= 50 ? 100 : 50);
};

const parseProjectAmount = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(/[₱,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getEffectiveElectricityRate = (section = {}) => {
  const baseRate = Number(section.electricityRate);
  const expectedIncrease = Number(section.expectedIncrease);
  const safeBaseRate = Number.isFinite(baseRate) && baseRate > 0 ? baseRate : 14.16;
  const safeIncrease = Number.isFinite(expectedIncrease) ? expectedIncrease : 0;
  return safeBaseRate * (1 + (safeIncrease / 100));
};

const getProjectElectricityUsage = (project) => {
  const source = project?.projectData || project;
  const details = Array.isArray(source?.projectDetails) ? source.projectDetails : [];
  if (details.length === 0) return 0;

  const printerRows = new Map();
  details.forEach((detail) => {
    const jobs = Array.isArray(detail?.productionJobs) && detail.productionJobs.length > 0
      ? detail.productionJobs
      : [detail];
    jobs.forEach((job) => {
      const printer = job?.printer || detail?.printer || {};
      const printerKey = String(job?.printerId || detail?.printerId || printer?.id || printer?.model || 'default');
      const printMinutes = Number(job?.time ?? job?.sliced?.time ?? detail?.time ?? detail?.sliced?.time ?? 0) || 0;
      const swapMinutes = Number(job?.swapMins ?? job?.sliced?.swapMins ?? detail?.swapMins ?? detail?.sliced?.swapMins ?? 0) || 0;
      const current = printerRows.get(printerKey) || { printer, runtimeMinutes: 0 };
      current.runtimeMinutes += printMinutes + swapMinutes;
      printerRows.set(printerKey, current);
    });
  });

  let usageKwh = 0;
  printerRows.forEach(({ printer, runtimeMinutes }) => {
    const wattage = Number(printer?.wattage) || 0;
    const startupMinutes = (Number(printer?.bootupMins) || 0)
      + (Number(printer?.homingMins) || 0)
      + (Number(printer?.bedLevelMins ?? printer?.bootLevelMins) || 0);
    usageKwh += (wattage / 1000) * ((runtimeMinutes + startupMinutes) / 60);
  });

  const extras = Array.isArray(source?.extras) ? source.extras : [];
  const heatsetMinutes = extras.reduce((total, extra) => {
    if (!String(extra?.name || '').toLowerCase().includes('heatset')) return total;
    const assignedQuantity = Object.values(extra?.assignments || {})
      .reduce((sum, quantity) => sum + (Number(quantity) || 0), 0);
    return total + assignedQuantity;
  }, 0);
  const electricityRates = getProjectElectricityRateSnapshot(project);
  const ironPower = Number(electricityRates?.solderingIronPower) || 60;
  usageKwh += (ironPower / 1000) * (heatsetMinutes / 60);

  return Number.isFinite(usageKwh) ? usageKwh : 0;
};

// Project repricing is kept independent from React so the admin rate update
// can migrate persisted estimates without opening every calculator modal.
const getProjectElectricityRateSnapshot = (project) => (
  project?.rates?.['electricity-cost']
  || project?.electricityRates
  || {}
);

const repriceSavedProject = (project, previousElectricityRates, nextElectricityRates, markupPercent = 20) => {
  if (!project || typeof project !== 'object') return null;
  const nested = project?.projectData && typeof project.projectData === 'object';
  const source = nested ? project.projectData : project;
  const totals = source?.totals;
  if (!totals || typeof totals !== 'object') return null;

  const oldEffectiveRate = getEffectiveElectricityRate(previousElectricityRates);
  const newEffectiveRate = getEffectiveElectricityRate(nextElectricityRates);
  if (!oldEffectiveRate || !newEffectiveRate || oldEffectiveRate === newEffectiveRate) return null;

  const markupMultiplier = 1 + ((Number(markupPercent) || 20) / 100);
  const storedKwh = Number(totals.electricityKwh);
  const usageKwh = Number.isFinite(storedKwh) && storedKwh > 0
    ? storedKwh
    : getProjectElectricityUsage(project);
  const oldElectricity = parseProjectAmount(totals.electricity)
    || (usageKwh * oldEffectiveRate * markupMultiplier);
  if (!Number.isFinite(oldElectricity) || oldElectricity <= 0) return null;

  const newElectricity = usageKwh > 0
    ? usageKwh * newEffectiveRate * markupMultiplier
    : oldElectricity * (newEffectiveRate / oldEffectiveRate);
  const delta = newElectricity - oldElectricity;
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.005) return null;

  const oldTotal = parseProjectAmount(totals.total || source.displayPrice || project.price);
  const oldBase = parseProjectAmount(totals.basePrice || oldTotal);
  if (!oldTotal && !oldBase) return null;
  const oldDownpayment = parseProjectAmount(totals.dp || source.minDownpayment || project.minDownpayment);
  const nextTotals = {
    ...totals,
    electricity: newElectricity.toFixed(2),
    electricityKwh: Number((usageKwh || 0).toFixed(6)),
    electricityRate: Number(newEffectiveRate.toFixed(6)),
    electricityMarkupMultiplier: Number(markupMultiplier.toFixed(6)),
    total: Math.ceil(oldTotal + delta).toLocaleString(),
    basePrice: Math.ceil(oldBase + delta).toLocaleString(),
    ...(oldDownpayment > 0 ? { dp: (Math.ceil((oldDownpayment + delta) / 10) * 10).toLocaleString() } : {}),
    ...(totals.totalProfit !== undefined
      ? { totalProfit: (parseProjectAmount(totals.totalProfit) + (delta / markupMultiplier) * (markupMultiplier - 1)).toFixed(2) }
      : {})
  };

  const nextSource = {
    ...source,
    totals: nextTotals,
    sellPrice: Math.ceil(oldBase + delta),
    displayPrice: Math.ceil(oldTotal + delta),
    minDownpayment: oldDownpayment > 0 ? Math.ceil((oldDownpayment + delta) / 10) * 10 : source.minDownpayment
  };

  if (nested) {
    return {
      ...project,
      projectData: nextSource,
      price: Math.ceil(oldTotal + delta),
      minDownpayment: nextSource.minDownpayment
    };
  }
  return nextSource;
};

const commitInChunks = async (updates) => {
  for (let index = 0; index < updates.length; index += 450) {
    const batch = writeBatch(db);
    updates.slice(index, index + 450).forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
    await batch.commit();
  }
};

const repricePersistedProjects = async (previousRates, nextRates) => {
  const previousElectricityRates = previousRates?.['electricity-cost'] || {};
  const nextElectricityRates = nextRates?.['electricity-cost'] || {};
  const markupPercent = nextRates?.['print-cost']?.markupRate ?? previousRates?.['print-cost']?.markupRate ?? 20;
  const blueprintSnap = await getDocs(collection(db, 'blueprints'));
  const vaultSnap = await getDocs(collection(db, 'projectVaults'));
  const blueprintUpdates = [];
  const vaultUpdates = [];
  const nextBlueprints = [];
  const currentUid = getCurrentUserUidForPricing();
  let currentVault = null;

  blueprintSnap.docs.forEach((projectDoc) => {
    const project = { id: projectDoc.id, ...projectDoc.data() };
    const repriced = repriceSavedProject(project, previousElectricityRates, nextElectricityRates, markupPercent);
    if (!repriced) return;
    const { id, ...data } = repriced;
    blueprintUpdates.push({ ref: doc(db, 'blueprints', projectDoc.id), data: { ...data, pricingUpdatedAt: new Date().toISOString() } });
    nextBlueprints.push(repriced);
  });

  vaultSnap.docs.forEach((vaultDoc) => {
    const data = vaultDoc.data() || {};
    const items = Array.isArray(data.items) ? data.items : [];
    const nextItems = items.map((project) => repriceSavedProject(project, previousElectricityRates, nextElectricityRates, markupPercent) || project);
    if (JSON.stringify(nextItems) === JSON.stringify(items)) return;
    vaultUpdates.push({
      ref: doc(db, 'projectVaults', vaultDoc.id),
      data: { items: nextItems, pricingUpdatedAt: new Date().toISOString() }
    });
    if (vaultDoc.id === currentUid) currentVault = nextItems;
  });

  await commitInChunks([...blueprintUpdates, ...vaultUpdates]);
  useStore.setState((state) => ({
    ...(nextBlueprints.length > 0 ? { blueprints: (state.blueprints || []).map((project) => nextBlueprints.find((next) => next.id === project.id) || project) } : {}),
    ...(currentVault ? { projectVault: currentVault } : {})
  }));
  return blueprintUpdates.length + vaultUpdates.length;
};

const getCurrentUserUidForPricing = () => auth?.currentUser?.uid || null;

const getKitSortGroup = (kit) => {
  const stocks = Object.values(kit?.stocks || {});
  if (stocks.length === 0) return 1; // Group 3: No stocks at all

  const hasAvailable = stocks.some(s => !s.order?.orderId && !s.isReserved);
  if (hasAvailable) return 3; // Group 1: Has available stock

  const hasShelf = stocks.some(s => !s.order?.orderId && s.isReserved);
  if (hasShelf) return 2; // Group 2: Has stocks but reserved/in-shelf

  return 1; // Group 3: All stocks sold
};

const sortKitsByAvailability = (kits = []) => {
  return [...kits].sort((a, b) => {
    const groupA = getKitSortGroup(a);
    const groupB = getKitSortGroup(b);
    if (groupA !== groupB) return groupB - groupA;

    // Tie-breaker for same group
    if (groupA === 3) {
      const availA = getAvailableStockCount(a);
      const availB = getAvailableStockCount(b);
      if (availA !== availB) return availB - availA;
    }

    return getKitTimestamp(b) - getKitTimestamp(a);
  });
};

// A released offer is represented by the same hunt document that powers the
// user's limited-time Deals card. If its released stock is removed from the
// user's basket or the admin shelf, remove that offer record as well so the
// card disappears for every listener immediately.
const removeReleasedOffersForRemovedItem = async (item, includeAdminShelfLookup = false) => {
  if (!item?.id) return;

  let offerDocs = [];
  if (item.offerId) {
    const offerSnap = await getDoc(doc(db, 'hunts', item.offerId));
    if (offerSnap.exists()) offerDocs = [offerSnap];
  } else if (includeAdminShelfLookup && item.stockKey) {
    const offersSnap = await getDocs(query(collection(db, 'hunts'), where('kitId', '==', item.id)));
    offerDocs = offersSnap.docs;
  }

  const releasedOfferDocs = offerDocs.filter((offerDoc) => {
    const offer = offerDoc.data();
    return String(offer?.status || '').toLowerCase() === 'released'
      && offer?.kitId === item.id
      && offer?.releasedStockKey === item.stockKey;
  });

  await Promise.all(releasedOfferDocs.map((offerDoc) => deleteDoc(offerDoc.ref)));
};

const mergeKitsStable = (currentKits = [], incomingKits = []) => {
  const incomingById = new Map(incomingKits.map((kit) => [kit.id, kit]));
  const currentIds = new Set(currentKits.map((kit) => kit.id));
  const updatedExisting = currentKits.map((kit) => incomingById.get(kit.id) || kit);
  const newKits = incomingKits.filter((kit) => !currentIds.has(kit.id));

  return [...updatedExisting, ...sortKitsByAvailability(newKits)];
};

const docsToArray = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// Share identical order listeners between pages and modals so the same
// user/admin query is only billed once while multiple views are open.
const sharedOrderSubscriptions = new Map();

const buildOrderStockTargets = (order = {}) => {
  const targets = [];
  const addTarget = (kitId, stockKey) => {
    if (!kitId || !stockKey) return;
    const targetKey = `${kitId}:${stockKey}`;
    if (!targets.some((target) => target.targetKey === targetKey)) {
      targets.push({ kitId, stockKey, targetKey });
    }
  };

  (order.items || []).forEach((item) => {
    if (item?.type === 'project') return;
    addTarget(item.id || item.kitId || item.productId, item.stockKey || item.selectedStockKey);
  });

  addTarget(order.kitId || order.productId, order.selectedStockKey || order.stockKey);
  return targets;
};

const getOrderTimestampMs = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const COMPLETED_ORDER_REVERSAL_WINDOW_MS = 24 * 60 * 60 * 1000;
const CANCELLED_ORDER_DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;

const releaseStockTarget = async (kitId, stockKey, orderDocId, order = {}) => {
  const kitRef = doc(db, 'kits', kitId);
  const kitSnap = await getDoc(kitRef);
  if (!kitSnap.exists()) return false;

  const stocks = kitSnap.data().stocks || {};
  const stock = stocks[stockKey];
  if (!stock) return false;

  const matchesOrder = stock.order?.orderDocId === orderDocId || (order.orderId && stock.order?.orderId === order.orderId);
  if (!matchesOrder) return false;

  // Supplier-cancelled, fully paid pre-orders remain reserved until the
  // supplier refund is confirmed. If the linked customer order is deleted
  // or cancelled first, remove only the order link and keep the supplier
  // refund hold in place.
  if (stock.supplierRefundStatus === 'pending') {
    const nextStocks = {
      ...stocks,
      [stockKey]: {
        ...stock,
        isReserved: true,
        reservedBy: null,
        reservedAt: null,
        reservationType: 'supplier-refund'
      }
    };
    delete nextStocks[stockKey].order;
    delete nextStocks[stockKey].reservedByDealId;

    const hasAvailable = Object.values(nextStocks).some((candidate) => !candidate.order?.orderId && !candidate.isReserved);
    await updateDoc(kitRef, {
      [`stocks.${stockKey}.isReserved`]: true,
      [`stocks.${stockKey}.reservedAt`]: null,
      [`stocks.${stockKey}.reservedBy`]: null,
      [`stocks.${stockKey}.reservationType`]: 'supplier-refund',
      [`stocks.${stockKey}.reservedByDealId`]: deleteField(),
      [`stocks.${stockKey}.order`]: deleteField(),
      hasAvailableStock: hasAvailable,
      lastUpdated: serverTimestamp()
    });
    return true;
  }

  const nextStocks = {
    ...stocks,
    [stockKey]: {
      ...stocks[stockKey],
      isReserved: false
    }
  };
  delete nextStocks[stockKey].order;
  delete nextStocks[stockKey].reservationType;
  delete nextStocks[stockKey].reservedByDealId;
  nextStocks[stockKey].reservedBy = null;
  nextStocks[stockKey].reservedAt = null;

  const hasAvailable = Object.values(nextStocks).some((stock) => !stock.order?.orderId && !stock.isReserved);
  await updateDoc(kitRef, {
    [`stocks.${stockKey}.isReserved`]: false,
    [`stocks.${stockKey}.reservedAt`]: null,
    [`stocks.${stockKey}.reservedBy`]: null,
    [`stocks.${stockKey}.availableAt`]: serverTimestamp(),
    [`stocks.${stockKey}.reservationType`]: deleteField(),
    [`stocks.${stockKey}.reservedByDealId`]: deleteField(),
    [`stocks.${stockKey}.order`]: deleteField(),
    hasAvailableStock: hasAvailable,
    lastAvailableAt: serverTimestamp(),
    lastUpdated: serverTimestamp()
  });
  return true;
};

const releaseOrderStocks = async (orderDocId, order = {}, fallbackKits = []) => {
  const released = new Set();

  for (const target of buildOrderStockTargets(order)) {
    if (await releaseStockTarget(target.kitId, target.stockKey, orderDocId, order)) {
      released.add(target.targetKey);
    }
  }

  let kitsToScan = fallbackKits;
  if (!kitsToScan?.length) {
    const snap = await getDocs(collection(db, 'kits'));
    kitsToScan = docsToArray(snap);
  }

  for (const kit of kitsToScan || []) {
    for (const [key, stock] of Object.entries(kit.stocks || {})) {
      const matchesOrder = stock.order?.orderDocId === orderDocId || (order.orderId && stock.order?.orderId === order.orderId);
      const targetKey = `${kit.id}:${key}`;
      if (matchesOrder && !released.has(targetKey)) {
        await releaseStockTarget(kit.id, key, orderDocId, order);
        released.add(targetKey);
      }
    }
  }

  return released.size;
};

export const DEFAULT_PRINT_METHODS = [
  {
    id: 'stl',
    name: 'STL',
    tagline: 'Estimate',
    accuracy: 'ESTIMATE',
    description: 'Estimate print cost from model size, material, settings, and quantity.',
    requirements: ['Dimensions', 'Material', 'Settings']
  },
  {
    id: '3mf',
    name: '3MF',
    tagline: 'Plate-ready',
    accuracy: 'COST',
    description: 'Use sliced 3MF project data for a cleaner, more accurate project cost.',
    requirements: ['Print time', 'Filament weight', 'Material']
  }
];

const PRINT_METHOD_ORDER = {
  estimation: 0,
  stl: 0,
  generation: 1,
  '3mf': 1
};

const getRequirementValues = (requirements = {}) => (
  Object.entries(requirements)
    .sort(([keyA], [keyB]) => {
      const numA = Number(String(keyA).match(/\d+/)?.[0] || Number.MAX_SAFE_INTEGER);
      const numB = Number(String(keyB).match(/\d+/)?.[0] || Number.MAX_SAFE_INTEGER);
      return numA - numB || String(keyA).localeCompare(String(keyB));
    })
    .map(([, value]) => value)
);

const sortPrintMethods = (methods = []) => (
  [...methods].sort((a, b) => {
    const aKey = String(a?.id || a?.name || '').toLowerCase();
    const bKey = String(b?.id || b?.name || '').toLowerCase();
    const aOrder = PRINT_METHOD_ORDER[aKey] ?? Number.MAX_SAFE_INTEGER;
    const bOrder = PRINT_METHOD_ORDER[bKey] ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder || aKey.localeCompare(bKey);
  })
);

export const useStore = create(
  persist(
    (set, get) => ({
      garageInfo: null,
      rates: {},
      kits: [],
      printedProjects: [],
      stories: [],
      methods: sortPrintMethods(DEFAULT_PRINT_METHODS),
      printers: [],
      feeders: [],
      filamentInventory: [],
      extras: [],
      blueprints: [],
      deals: [],
      notifyList: [],
      userOffers: [],
      userOffersLoaded: false,
      orders: [],
      usersList: [],
      adminsList: [],
      projectVault: JSON.parse(localStorage.getItem('sg_guest_project_vault') || '[]'),
      shelf: [],
      shippingSettings: null, // New state
      loadedData: {},
      _loadedDatasets: createInitialDatasetState(false),
      _datasetStatus: createInitialDatasetState('loading'),
      _isInitialAuthChecked: false,
      _activePath: typeof window !== 'undefined' ? window.location.pathname : '/',
      _backgroundListenersStarted: false,
      _datasetListenerKeys: {},
      _prioUnsubs: [],
      _bgUnsubs: [],
      lastVisibleKit: null,
      isLoading: true,
      hasLoadedAllKits: false,
      isAdmin: false,
      isBanned: false,
      isAnonymousUser: false,
      isProfileIncomplete: false,
      isAdminView: false,
      user: null,
      basket: [],
      guestBasket: [],
      originalAdminUser: null,
      originalAdminBasket: [],
      adminData: null,
      pendingBasketItem: null,
      isLoginModalOpen: false,
      toastMessage: null,
      isSpectralMode: true,
      isSyncing: false,
      syncStatus: 'Syncing Profile',
      authAttemptId: 0,
      authRetry: null,
      storiesHeight: 0,
      unsubPrintResources: null,
      unsubProjectVault: null,
      unsubOffers: null,
      _syncAllDealsPromise: null,
      _bundleDealRestartTimer: null,
      setStoriesHeight: (height) => set({ storiesHeight: height }),

      cleanupFilamentsStockNo: async () => {
        const { filamentInventory } = get();
        const batch = writeBatch(db);
        let hasChanges = false;

        filamentInventory.forEach((f) => {
          if ((parseFloat(f.remaining) || 0) <= 0 && f.stockNo) {
            batch.update(doc(db, "filaments", f.id), { stockNo: deleteField() });
            hasChanges = true;
          }
        });

        if (hasChanges) {
          await batch.commit();
          console.log('Store: Bulk cleanup of stockNo completed');
        }
      },

      setLoading: (loading) => set({ isLoading: loading }),
      setDatasetStatus: (key, status) => {
        if (!DATASET_KEYS.includes(key)) return;
        set((state) => {
          if (state._datasetStatus?.[key] === status) return state;
          return { _datasetStatus: { ...state._datasetStatus, [key]: status } };
        });
      },
      setToastMessage: (message) => set({ toastMessage: message }),
      beginAuthAttempt: (retry) => {
        const authAttemptId = get().authAttemptId + 1;
        set({
          authAttemptId,
          authRetry: retry,
          isSyncing: true,
          syncStatus: 'Authorizing Session'
        });
        return authAttemptId;
      },
      isAuthAttemptActive: (authAttemptId) => (
        get().authAttemptId === authAttemptId && get().isSyncing
      ),
      setAuthAttemptStatus: (authAttemptId, syncStatus) => {
        if (get().authAttemptId !== authAttemptId) return false;
        set({ authRetry: null, syncStatus });
        return true;
      },
      failAuthAttempt: (authAttemptId, error) => {
        if (!get().isAuthAttemptActive(authAttemptId)) return false;
        const retryableCodes = new Set([
          'auth/popup-blocked',
          'auth/popup-closed-by-user',
          'auth/cancelled-popup-request'
        ]);
        const canRetry = retryableCodes.has(error?.code);
        set(canRetry
          ? { isSyncing: true, syncStatus: 'Authorization interrupted' }
          : { isSyncing: false, authRetry: null }
        );
        return canRetry;
      },
      cancelAuthAttempt: () => set((state) => ({
        authAttemptId: state.authAttemptId + 1,
        authRetry: null,
        isSyncing: false,
        syncStatus: 'Authentication cancelled'
      })),
      toggleSpectralMode: () => set((state) => ({ isSpectralMode: !state.isSpectralMode })),
      refreshKitOrder: () => set((state) => ({ kits: sortKitsByAvailability(state.kits) })),
      setAdminView: (isEnabled) => {
        console.log("SG LOG: setAdminView called with:", isEnabled, "Current:", get().isAdminView);
        if (get().isAdminView === isEnabled) return;
        set({ isAdminView: isEnabled });
      },
      setLoginModalOpen: (isOpen) => set({ isLoginModalOpen: isOpen }),
      setPendingBasketItem: (item) => set({ pendingBasketItem: item }),

      processPendingBasket: async () => {
        const { pendingBasketItem, addToBasket, huntKit } = get();
        if (pendingBasketItem) {
          if (pendingBasketItem.type === 'notify') {
            await huntKit(pendingBasketItem, pendingBasketItem.targetPrice);
          } else {
            await addToBasket(pendingBasketItem);
          }
          set({ pendingBasketItem: null });
        }
      },

      // Helper: determines which datasets a given pathname needs
      _getPageRequirements: (pathname) => {
        const { isAdmin } = get();
        return {
          stories: pathname === '/' || pathname === '',
          // The landing-page highlights can use available kits to replace
          // missing or unavailable project slots, so kits must be ready before
          // the home route is released from its loading state.
          kits: pathname === '/' || pathname === '' || pathname.startsWith('/kits') || pathname === '/cart' || pathname === '/basket' || pathname === '/shelf',
          printedProjects: pathname === '/prints' || pathname.startsWith('/prints/'),
          deals: pathname.startsWith('/kits'),
          orders: pathname === '/orders' || pathname.startsWith('/orders/'),
          basket: pathname === '/cart' || pathname === '/basket' || pathname === '/shelf',
          // Admin shelf state is also consumed by the navbar and the kit cards.
          // Keep its live listener active on every admin route so collection
          // badges/counts do not depend on opening the shelf page first.
          shelf: isAdmin,
          prints: pathname === '/' || pathname === '/prints' || pathname.startsWith('/prints/') || pathname === '/blueprints' || pathname === '/cart' || pathname === '/basket' || pathname === '/shelf'
        };
      },

      // Called from App.jsx on route change — re-shows loading if new page data isn't ready
      checkPageReady: (pathname) => {
        const ds = get()._loadedDatasets;
        const req = get()._getPageRequirements(pathname);
        set({ _activePath: pathname });

        if (get()._isInitialAuthChecked) {
          get().startBackgroundListeners();
        }

        // User profile must always be loaded
        if (!ds.userProfile) { set({ isLoading: true }); return; }

        // Check page-specific datasets
        if (req.stories && !ds.stories) { set({ isLoading: true }); return; }
        if (req.kits && !ds.kits) { set({ isLoading: true }); return; }
        if (req.deals && !ds.deals) { set({ isLoading: true }); return; }
        if (req.orders && !ds.orders) { set({ isLoading: true }); return; }
        if (req.basket && !ds.basket) { set({ isLoading: true }); return; }
        if (req.shelf && !ds.shelf) { set({ isLoading: true }); return; }
        if (req.prints && !ds.prints) { set({ isLoading: true }); return; }

        set({ isLoading: false });
        get().startBackgroundListeners();
      },

      markLoaded: (key, { status = 'ready', releasePage = true } = {}) => {
        const prev = get()._loadedDatasets;
        const statusChanged = get()._datasetStatus?.[key] !== status;
        if (statusChanged) {
          set((state) => ({
            _datasetStatus: { ...state._datasetStatus, [key]: status }
          }));
        }
        if (prev[key]) return; // already marked for page gating
        const updated = { ...prev, [key]: true };
        set({ _loadedDatasets: updated });

        // A slow listener may release the route-level gate, but its section
        // must continue showing its own skeleton until the listener settles.
        if (!releasePage) return;

        // Check if current page is ready
        const activePath = get()._activePath;
        const req = get()._getPageRequirements(activePath);

        // User profile must always be loaded first
        if (!updated.userProfile) return;

        const pageReady = 
          (!req.stories || updated.stories) &&
          (!req.kits || updated.kits) &&
          (!req.deals || updated.deals) &&
          (!req.orders || updated.orders) &&
          (!req.basket || updated.basket) &&
          (!req.shelf || updated.shelf) &&
          (!req.prints || updated.prints);

        if (pageReady) {
          set({ isLoading: false });
          get().startBackgroundListeners();
        }
      },

      startBackgroundListeners: () => {
        set({ _backgroundListenersStarted: true });

        const ds = get()._loadedDatasets;
        const req = get()._getPageRequirements(get()._activePath);
        const listenerKeys = get()._datasetListenerKeys || {};
        const unsubs = [];
        const markListener = (key, isActive = true) => {
          set((state) => ({
            _datasetListenerKeys: { ...state._datasetListenerKeys, [key]: isActive }
          }));
        };

        // 1. Stories (if not already prioritized)
        if (req.stories && !ds.stories && !listenerKeys.stories) {
          const initialStoriesQuery = query(collection(db, "stories"), orderBy("order", "asc"));
          const unsub = onSnapshot(initialStoriesQuery, (snap) => {
            set({ stories: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
            updateSnapshotDatasetStatus(get, 'stories', snap);
          }, (err) => {
            console.error("SG LOG: Stories subscription error:", err);
            markListener('stories', false);
            get().markLoaded('stories', { status: 'error' });
          });
          markListener('stories');
          unsubs.push(unsub);
        }

        // 2. Kits (if not already prioritized) — fetch ALL kits directly
        if (req.kits && !ds.kits && !listenerKeys.kits) {
          const allKitsQuery = query(collection(db, "kits"), orderBy("lastUpdated", "desc"));
          const unsub = onSnapshot(allKitsQuery, (snap) => {
            const allKits = snap.docs
              .map(doc => ({ id: doc.id, ...doc.data() }))
              .filter((kit) => kit.productType !== 'printed-project' && kit.isPrintedProject !== true);
            set({ 
              kits: sortKitsByAvailability(allKits), 
              lastVisibleKit: snap.docs[snap.docs.length - 1]
            });
            updateSnapshotDatasetStatus(get, 'kits', snap);
            get().syncAllDeals();
          }, (err) => {
            console.error("SG LOG: Kits subscription error:", err);
            markListener('kits', false);
            get().markLoaded('kits', { status: 'error' });
          });
          markListener('kits');
          unsubs.push(unsub);
        }

        // Printed projects use the kit stock schema for checkout/reservation,
        // but are loaded separately so /prints does not download every kit.
        if (req.printedProjects && !ds.printedProjects && !listenerKeys.printedProjects) {
          const printedProjectsQuery = query(
            collection(db, 'kits'),
            where('productType', '==', 'printed-project')
          );
          const unsub = onSnapshot(printedProjectsQuery, (snap) => {
            set({ printedProjects: docsToArray(snap) });
            updateSnapshotDatasetStatus(get, 'printedProjects', snap);
          }, (err) => {
            console.error('SG LOG: Printed projects subscription error:', err);
            markListener('printedProjects', false);
            get().markLoaded('printedProjects', { status: 'error' });
          });
          markListener('printedProjects');
          unsubs.push(unsub);
        }

        // 3. Blueprints (if not already prioritized)
        if (req.prints && !ds.prints && !listenerKeys.prints) {
          const unsub = onSnapshot(collection(db, "blueprints"), (snap) => {
            set({ 
              blueprints: docsToArray(snap),
              loadedData: { ...get().loadedData, blueprints: true }
            });
            updateSnapshotDatasetStatus(get, 'prints', snap);
          }, (err) => {
            console.error("SG LOG: Blueprints subscription error:", err);
            markListener('prints', false);
            get().markLoaded('prints', { status: 'error' });
          });
          markListener('prints');
          unsubs.push(unsub);
        }

        // 4. Shelf (if not already prioritized)
        if (req.shelf && !ds.shelf && get().isAdmin && !listenerKeys.shelf) {
          const unsub = onSnapshot(collection(db, "shelf"), async (snap) => {
            try {
              const items = await reconcileAdminShelfSnapshot(snap);
              set({ shelf: items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()) });
            } catch (error) {
              console.error("SG LOG: Shelf reconciliation failed:", error);
              const items = snap.docs.map(doc => ({ ...doc.data(), basketId: doc.id }));
              set({ shelf: items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()) });
            }
            get().markLoaded('shelf');
          }, (err) => {
            console.error("SG LOG: Shelf subscription error:", err);
            markListener('shelf', false);
            get().markLoaded('shelf', { status: 'error' });
          });
          if (get().unsubShelf) get().unsubShelf();
          set({ unsubShelf: unsub });
          markListener('shelf');
        }



        // 6. Deals (if not already prioritized)
        if (req.deals && !ds.deals && !listenerKeys.deals) {
          const unsubDeals = onSnapshot(collection(db, "deals"), (snap) => {
            set({ deals: docsToArray(snap) });
            updateSnapshotDatasetStatus(get, 'deals', snap);
            get().syncAllDeals();
          }, (err) => {
            console.error("SG LOG: Background Deals subscription error:", err);
            markListener('deals', false);
            get().markLoaded('deals', { status: 'error' });
          });
          markListener('deals');
          unsubs.push(unsubDeals);
        }


        set((state) => ({
          _bgUnsubs: [...state._bgUnsubs, ...unsubs]
        }));
      },

      fetchInitialData: () => {
        const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
        const priorityLoadTimeouts = [];
        set({ _activePath: pathname });

        // Public data does not depend on the signed-in user. Reset the startup
        // state and begin those listeners before Auth resolves so guest users
        // can render from Firestore cache/server data immediately.
        const prevPrioUnsubs = get()._prioUnsubs || [];
        prevPrioUnsubs.forEach(unsub => unsub && unsub());
        const prevBgUnsubs = get()._bgUnsubs || [];
        prevBgUnsubs.forEach(unsub => unsub && unsub());

        set({
          _prioUnsubs: [],
          _bgUnsubs: [],
          _datasetListenerKeys: {},
          _backgroundListenersStarted: false,
          _isInitialAuthChecked: false,
          isLoading: true,
          _loadedDatasets: createInitialDatasetState(false),
          _datasetStatus: createInitialDatasetState('loading')
        });

        const currentReq = get()._getPageRequirements(pathname);
        const priorityKeys = Object.entries(currentReq).filter(([, value]) => value).map(([key]) => key);
        priorityKeys.forEach((key) => {
          const timeoutId = setTimeout(() => {
            if (!get()._loadedDatasets[key]) {
              console.warn(`SG LOG: ${key} listener is slow; rendering page while Firestore reconnects.`);
              get().markLoaded(key, { status: 'loading' });
            }
          }, 8000);
          priorityLoadTimeouts.push(timeoutId);
        });

        // Start public listeners immediately. Auth/profile synchronization runs
        // below in parallel and adds only user-scoped listeners when needed.
        get().startBackgroundListeners();

        // Auth/profile synchronization runs in parallel with public data.
        const unsubAuth = auth.onAuthStateChanged(async (u) => {
          const isInitial = !get()._isInitialAuthChecked;
          set({ _isInitialAuthChecked: true });

          if (isInitial) {
            // Public listeners were already started above and continue running.
          } else {
            // Login/Logout transition: Keep public data listeners running.
            // Reset only user-dependent dataset statuses.
            const prevLoaded = get()._loadedDatasets;
            const hadUser = Boolean(get().user);
            set({
              isLoading: true,
              _backgroundListenersStarted: false,
              _loadedDatasets: {
                ...prevLoaded,
                userProfile: false,
                basket: false,
                shelf: false,
                orders: false
              },
              _datasetStatus: {
                ...get()._datasetStatus,
                userProfile: 'loading',
                basket: 'loading',
                shelf: 'loading',
                orders: 'loading'
              }
            });
            if (!u && hadUser) {
              set({ toastMessage: 'Welcome Guest!' });
            }
          }

          // Phase 1: Auth & profile sync (runs in parallel with public data above)
          await get().syncUserAccount(u, () => {
            get().markLoaded('userProfile');

            // A route may have changed while Auth was resolving. Reconcile the
            // current route requirements without creating duplicate listeners.
            get().startBackgroundListeners();

            // User-dependent data: only start AFTER profile is synced
            const currentReq = get()._getPageRequirements(get()._activePath);

            // 4. Shelf priority -> Shelf collection (requires admin check)
            if (currentReq.shelf) {
              const unsub = onSnapshot(collection(db, "shelf"), async (snap) => {
                try {
                  const items = await reconcileAdminShelfSnapshot(snap);
                  set({ shelf: items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()) });
                } catch (error) {
                  console.error("SG LOG: Shelf reconciliation failed:", error);
                  const items = snap.docs.map(doc => ({ ...doc.data(), basketId: doc.id }));
                  set({ shelf: items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()) });
                }
                get().markLoaded('shelf');
              }, (err) => {
                console.error("SG LOG: Shelf subscription error:", err);
                set((state) => ({ _datasetListenerKeys: { ...state._datasetListenerKeys, shelf: false } }));
                get().markLoaded('shelf', { status: 'error' });
              });
              if (get().unsubShelf) get().unsubShelf();
              set({ unsubShelf: unsub });
              set((state) => ({ _datasetListenerKeys: { ...state._datasetListenerKeys, shelf: true } }));
            }
          });
        });

        // Small, essential settings load in parallel
        const unsubInfo = onSnapshot(doc(db, "settings", "garage"), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            set({ garageInfo: data });
          }
        });
        const unsubCheckout = onSnapshot(doc(db, "settings", "checkout"), (snap) => {
          const data = snap.exists() ? snap.data() : { paymentSettings: { handlingFee: 0, installmentFee: 0 } };
          set({ shippingSettings: data });
        });

        return () => {
          unsubAuth();
          unsubInfo();
          unsubCheckout();
          
          const prioUnsubs = get()._prioUnsubs || [];
          prioUnsubs.forEach(unsub => unsub && unsub());
          set({ _prioUnsubs: [] });
          priorityLoadTimeouts.forEach(timeoutId => clearTimeout(timeoutId));

          const bgUnsubs = get()._bgUnsubs || [];
          bgUnsubs.forEach(unsub => unsub && unsub());
          set({ _bgUnsubs: [], _datasetListenerKeys: {}, _backgroundListenersStarted: false });

          const bundleDealRestartTimer = get()._bundleDealRestartTimer;
          if (bundleDealRestartTimer) clearTimeout(bundleDealRestartTimer);
          set({ _bundleDealRestartTimer: null });

          if (get().unsubUser) get().unsubUser();
          if (get().unsubShelf) get().unsubShelf();
          if (get().unsubAdmin) get().unsubAdmin();
          if (get().unsubBasket) get().unsubBasket();
          if (get().unsubProjectVault) get().unsubProjectVault();
          if (get().unsubOffers) get().unsubOffers();

          const unsubPrint = get().unsubPrintResources;
          if (unsubPrint) {
            unsubPrint();
            set((state) => ({
              loadedData: { ...state.loadedData, printResources: false },
              unsubPrintResources: null
            }));
          }
        };
      },

      getMoreKits: async () => {
        // All kits are loaded on snapshot initialization. Client-side pagination is handled in pages/Kits.jsx.
      },

      loadAllKits: async () => {
        const currentKits = get().kits || [];
        if (currentKits.length > 0 && get()._loadedDatasets.kits) return currentKits;

        get().setDatasetStatus('kits', 'loading');
        try {
          const snap = await getDocs(query(collection(db, 'kits'), orderBy('lastUpdated', 'desc')));
          const allKits = sortKitsByAvailability(snap.docs
            .map(kitDoc => ({ id: kitDoc.id, ...kitDoc.data() }))
            .filter((kit) => kit.productType !== 'printed-project' && kit.isPrintedProject !== true));
          set({ kits: allKits });
          get().markLoaded('kits', { status: allKits.length > 0 ? 'ready' : 'empty' });
          return allKits;
        } catch (error) {
          get().markLoaded('kits', { status: 'error' });
          throw error;
        }

      },

      loadAllDeals: async () => {
        const currentDeals = get().deals || [];
        if (get()._loadedDatasets.deals) return currentDeals;

        get().setDatasetStatus('deals', 'loading');
        try {
          const snap = await getDocs(collection(db, 'deals'));
          const allDeals = docsToArray(snap);
          set({ deals: allDeals });
          get().markLoaded('deals', { status: allDeals.length > 0 ? 'ready' : 'empty' });
          get().syncAllDeals();
          return allDeals;
        } catch (error) {
          get().markLoaded('deals', { status: 'error' });
          throw error;
        }
      },


      subscribeNotifyList: (scope = {}) => {
        const { uid, isAdminMode } = scope;
        const huntsQuery = isAdminMode
          ? collection(db, "hunts")
          : uid
            ? query(collection(db, "hunts"), where("uid", "==", uid))
            : null;

        if (!huntsQuery) return () => {};

        return onSnapshot(huntsQuery, (snap) => {
          set({ notifyList: docsToArray(snap) });
        }, () => set({ notifyList: [] }));
      },

      loadBlueprints: async () => {
        // No-op. Blueprints are subscribed to in real-time via fetchInitialData / startBackgroundListeners.
      },

      loadBlueprintProductionStatuses: async (blueprintIds = []) => {
        const ids = [...new Set(
          (Array.isArray(blueprintIds) ? blueprintIds : [])
            .filter(Boolean)
            .map((id) => String(id))
        )];

        if (ids.length === 0) return {};

        // Reuse the live blueprint cache whenever it is already available.
        // Basket validation otherwise falls back to batched name queries
        // instead of opening one document read per project.
        const cachedBlueprints = new Map(
          (get().blueprints || []).map((blueprint) => [String(blueprint.id), blueprint])
        );
        const cachedEntries = ids
          .filter((blueprintId) => cachedBlueprints.has(blueprintId))
          .map((blueprintId) => [
            blueprintId,
            cachedBlueprints.get(blueprintId)?.canAddToBasket !== false
          ]);
        const missingIds = ids.filter((blueprintId) => !cachedBlueprints.has(blueprintId));
        const fetchedEntries = [];

        for (let index = 0; index < missingIds.length; index += 10) {
          const batchIds = missingIds.slice(index, index + 10);
          try {
            const snapshot = await getDocs(query(
              collection(db, 'blueprints'),
              where('__name__', 'in', batchIds)
            ));
            const fetchedById = new Map(snapshot.docs.map((blueprintDoc) => [
              blueprintDoc.id,
              blueprintDoc.data()
            ]));
            batchIds.forEach((blueprintId) => {
              const blueprint = fetchedById.get(blueprintId);
              fetchedEntries.push([
                blueprintId,
                blueprint ? blueprint.canAddToBasket !== false : null
              ]);
            });
          } catch (error) {
            console.error('SG LOG: Blueprint production status lookup failed:', error);
            batchIds.forEach((blueprintId) => fetchedEntries.push([blueprintId, null]));
          }
        }

        return Object.fromEntries([...cachedEntries, ...fetchedEntries]);
      },

      loadPrintResources: () => {
        if ((get().methods || []).length === 0) {
          set({ methods: sortPrintMethods(DEFAULT_PRINT_METHODS) });
        }
        if (get().unsubPrintResources) return;

        const unsubMethods = onSnapshot(collection(db, "methods"), (snap) => {
          const methods = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            requirements: getRequirementValues(d.data().requirements || {})
          }));
          set({
            methods: methods.length > 0 ? sortPrintMethods(methods) : sortPrintMethods(DEFAULT_PRINT_METHODS)
          });
        }, (err) => {
          console.error("SG LOG: Methods subscription error:", err);
          if ((get().methods || []).length === 0) {
            set({ methods: sortPrintMethods(DEFAULT_PRINT_METHODS) });
          }
        });

        const unsubPrinters = onSnapshot(collection(db, "printers"), (snap) => {
          set({ printers: docsToArray(snap).map(normalizePrinterRecord) });
        }, (err) => {
          console.error("SG LOG: Printers subscription error:", err);
        });

        const unsubFeeders = onSnapshot(collection(db, "feeders"), (snap) => {
          set({ feeders: docsToArray(snap).map(normalizeFeederRecord) });
        }, (err) => {
          console.error("SG LOG: Feeders subscription error:", err);
        });

        const unsubFilaments = onSnapshot(collection(db, "filaments"), (snap) => {
          set({ filamentInventory: docsToArray(snap) });
        }, (err) => {
          console.error("SG LOG: Filaments subscription error:", err);
        });

        const unsubRates = onSnapshot(collection(db, "rates"), (snap) => {
          const rates = {};
          snap.forEach((d) => { rates[d.id] = d.data(); });
          set({ rates });
        }, (err) => {
          console.error("SG LOG: Rates subscription error:", err);
        });

        const unsubExtras = onSnapshot(collection(db, "extras"), (snap) => {
          set({ extras: docsToArray(snap) });
        }, (err) => {
          console.error("SG LOG: Extras subscription error:", err);
        });

        set((state) => ({
          loadedData: { ...state.loadedData, printResources: true },
          unsubPrintResources: () => {
            unsubMethods();
            unsubPrinters();
            unsubFeeders();
            unsubFilaments();
            unsubRates();
            unsubExtras();
          }
        }));
      },

      subscribeOrders: (scope = {}) => {
        const { uid, isAdminMode } = scope;

        const ordersQuery = isAdminMode
          ? query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(100))
          : uid
            ? query(collection(db, "orders"), where("userId", "==", uid))
            : null;

        if (!ordersQuery) {
          // Wag i-clear ang list, hayaan lang kung ano ang nandoon
          return () => {};
        }

        const subscriptionKey = isAdminMode ? 'admin' : `user:${uid}`;
        const existingSubscription = sharedOrderSubscriptions.get(subscriptionKey);
        if (existingSubscription) {
          existingSubscription.refCount += 1;
          return () => {
            const currentSubscription = sharedOrderSubscriptions.get(subscriptionKey);
            if (currentSubscription !== existingSubscription) return;
            currentSubscription.refCount -= 1;
            if (currentSubscription.refCount <= 0) {
              currentSubscription.unsubscribe?.();
              sharedOrderSubscriptions.delete(subscriptionKey);
            }
          };
        }

        const subscription = { refCount: 1, unsubscribe: null };
        sharedOrderSubscriptions.set(subscriptionKey, subscription);
        subscription.unsubscribe = onSnapshot(ordersQuery, (snap) => {
          const docs = docsToArray(snap);
          console.log("SG LOG: Orders fetched:", docs.length, "for UID:", uid, "Admin:", isAdminMode);
          set({ orders: docs });
          get().markLoaded('orders');
        }, (err) => {
          console.error("SG LOG: Order subscription error:", err);
          get().markLoaded('orders', { status: 'error' });
          // Wag din i-clear sa error para iwas flicker
        });

        return () => {
          const currentSubscription = sharedOrderSubscriptions.get(subscriptionKey);
          if (currentSubscription !== subscription) return;
          currentSubscription.refCount -= 1;
          if (currentSubscription.refCount <= 0) {
            currentSubscription.unsubscribe?.();
            sharedOrderSubscriptions.delete(subscriptionKey);
          }
        };
      },

      subscribeUsersList: () => {
        return onSnapshot(collection(db, "users"), (snap) => {
          set({ usersList: snap.docs.map(doc => ({ uid: doc.id, ...doc.data() })) });
        }, () => set({ usersList: [] }));
      },

      loadMissingKits: async (ids = []) => {
        if (!ids.length) return;
        const { kits } = get();
        const currentIds = new Set(kits.map(k => k.id));
        const missingIds = ids.filter(id => !currentIds.has(id));
        
        if (!missingIds.length) return;
        
        console.log("SG LOG: Fetching missing kits for basket/shelf:", missingIds.length);
        
        const fetchedKits = [];
        // Firestore 'in' query supports up to 10 IDs
        for (let i = 0; i < missingIds.length; i += 10) {
            const batch = missingIds.slice(i, i + 10);
            const q = query(collection(db, "kits"), where("__name__", "in", batch));
            const snap = await getDocs(q);
            snap.forEach(doc => fetchedKits.push({ id: doc.id, ...doc.data() }));
        }

        if (fetchedKits.length > 0) {
            const regularKits = fetchedKits.filter((kit) => (
              kit.productType !== 'printed-project' && kit.isPrintedProject !== true
            ));
            const fetchedPrintedProjects = fetchedKits.filter((kit) => (
              kit.productType === 'printed-project' || kit.isPrintedProject === true
            ));
            set((state) => ({
                kits: mergeKitsStable(state.kits, regularKits),
                printedProjects: mergeKitsStable(state.printedProjects, fetchedPrintedProjects)
            }));
        }
      },

      refreshBasket: async () => {
        const { user, isAnonymousUser, isAdmin, isAdminView } = get();

        if (!user || isAnonymousUser) {
          const guestBasket = JSON.parse(localStorage.getItem('sg_guest_basket') || '[]');
          set({ guestBasket });
          return;
        }

        const isShelf = isAdmin && isAdminView;
        const basketRef = isShelf
          ? collection(db, 'shelf')
          : collection(db, 'users', user.uid, 'basket');
        const basketSnap = await getDocs(basketRef);
        const refreshedItems = isShelf
          ? await reconcileAdminShelfSnapshot(basketSnap)
          : basketSnap.docs.map((basketDoc) => ({ ...basketDoc.data(), basketId: basketDoc.id }));
        refreshedItems.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

        set(isShelf ? { shelf: refreshedItems } : { basket: refreshedItems });
      },

      fetchAdmins: () => {
        return onSnapshot(collection(db, "admins"), (snap) => {
          set({ adminsList: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
        }, () => set({ adminsList: [] }));
      },

      repairShelfImages: async () => {
        const { user, shelf, basket, isAdmin, kits } = get();
        const isAdminContext = isAdmin; // Assuming we're targeting the admin shelf
        const itemsToRepair = isAdminContext ? (shelf || []) : (basket || []);
        
        if (!itemsToRepair.length) return;

        const batch = writeBatch(db);
        let hasChanges = false;

        for (const item of itemsToRepair) {
          if (!item.image) {
            const kit = kits.find(k => k.id === item.id) || await getDoc(doc(db, "kits", item.id)).then(s => s.exists() ? s.data() : null);
            if (kit && kit.image) {
                if (isAdminContext) {
                    batch.update(doc(db, 'shelf', item.basketId), { image: kit.image });
                } else {
                    batch.update(doc(db, 'users', user.uid, 'basket', item.basketId), { image: kit.image });
                }
                hasChanges = true;
            }
          }
        }

        if (hasChanges) {
          await batch.commit();
          console.log("SG LOG: Shelf/Basket images repaired successfully.");
        } else {
          console.log("SG LOG: No missing images found to repair.");
        }
      },

      addAllAvailableToShelf: async () => {
        const { kits, user } = get();
        console.log("SG LOG: addAllAvailableToShelf initiated with kits count:", kits.length);
        const now = new Date().toISOString();
        const { handlingFee, installmentFee, transferFee } = getCheckoutPaymentFees(get().shippingSettings);

        // Build flat list of all available stocks across all kits
        const itemsToKeep = [];
        kits.forEach(kit => {
            Object.entries(kit.stocks || {}).forEach(([key, stock]) => {
                if (!stock.isReserved && !stock.order?.orderId) {
                    itemsToKeep.push({ kit, stock, key });
                }
            });
        });

        if (itemsToKeep.length === 0) {
            console.log("SG LOG: No available stocks found to move.");
            return;
        }

        // Firestore writeBatch limit = 500 operations. Each item = 2 ops.
        // Chunk into smaller batches (30 items = 60 ops) to avoid "Transaction too big" errors.
        const CHUNK_SIZE = 30;
        for (let i = 0; i < itemsToKeep.length; i += CHUNK_SIZE) {
            const chunk = itemsToKeep.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);

            chunk.forEach(({ kit, stock, key }) => {
                const basketId = `b_kit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                const clean = {
                    id: kit.id,
                    name: (kit.name || '').replace(/\s*\(Pre-Order\)\s*$/i, ''),
                    image: kit.image || '',
                    brand: kit.brand || '',
                    specs: kit.specs || {},
                    price: Number(stock.sellPrice || 0) + handlingFee + installmentFee + transferFee,
                    costPrice: Number(stock.costPrice || 0),
                    sellPrice: Number(stock.sellPrice || 0),
                    status: stock.status || 'onhand',
                    eta: getStockEta(stock),
                    appliedHandlingFee: handlingFee,
                    appliedInstallmentFee: installmentFee,
                    appliedTransferFee: transferFee,
                    stockKey: key,
                    type: 'kit',
                    basketId,
                    minDownpayment: stock.minDownpayment || 0,
                    createdAt: now
                };
                batch.set(doc(db, 'shelf', basketId), clean);
                batch.update(doc(db, 'kits', kit.id), {
                    [`stocks.${key}.isReserved`]: true,
                    [`stocks.${key}.reservedBy`]: user.uid,
                    [`stocks.${key}.reservedAt`]: serverTimestamp(),
                    [`stocks.${key}.reservationType`]: 'admin',
                    lastUpdated: serverTimestamp(),
                    hasAvailableStock: false
                });
            });

            try {
                await batch.commit();
                console.log(`SG LOG: Batch ${Math.floor(i / CHUNK_SIZE) + 1} committed (${chunk.length} stocks).`);
            } catch (err) {
                console.error("SG LOG: addAllAvailableToShelf batch commit error:", err);
                alert("Firestore batch commit failed: " + err.message);
                throw err;
            }
        }

        console.log(`SG LOG: All available stocks moved to shelf (${itemsToKeep.length} total).`);
      },

      // Keep 1 stock per kit on the shelf — picks the cheapest available stock for each kit
      keepOneOfEachToShelf: async () => {
        const { kits, user } = get();
        console.log("SG LOG: keepOneOfEachToShelf initiated with kits count:", kits.length);
        const now = new Date().toISOString();
        const { handlingFee, installmentFee, transferFee } = getCheckoutPaymentFees(get().shippingSettings);

        // Build list of items to keep (1 per kit, cheapest available stock)
        const itemsToKeep = [];
        kits.forEach(kit => {
            const availableStocks = Object.entries(kit.stocks || {})
                .filter(([, stock]) => !stock.isReserved && !stock.order?.orderId)
                .map(([key, stock]) => ({ key, ...stock }));

            if (availableStocks.length === 0) return;

            // Sort by costPrice ascending, pick the cheapest one
            availableStocks.sort((a, b) => getStockCostPrice(a) - getStockCostPrice(b));
            const stock = availableStocks[0];
            const hasAvailable = (availableStocks.length - 1) > 0;
            itemsToKeep.push({ kit, stock, key: stock.key, hasAvailable });
        });

        if (itemsToKeep.length === 0) {
            console.log("SG LOG: No available stocks found to keep.");
            return;
        }

        // Firestore writeBatch limit = 500 operations. Each item = 2 ops (set shelf + update kit).
        // Chunk into smaller batches (30 items = 60 ops) to avoid "Transaction too big" errors.
        const CHUNK_SIZE = 30;
        for (let i = 0; i < itemsToKeep.length; i += CHUNK_SIZE) {
            const chunk = itemsToKeep.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);

            chunk.forEach(({ kit, stock, key, hasAvailable }) => {
                const basketId = `b_kit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                const clean = {
                    id: kit.id,
                    name: (kit.name || '').replace(/\s*\(Pre-Order\)\s*$/i, ''),
                    image: kit.image || '',
                    brand: kit.brand || '',
                    specs: kit.specs || {},
                    price: Number(stock.sellPrice || 0) + handlingFee + installmentFee + transferFee,
                    costPrice: Number(stock.costPrice || 0),
                    sellPrice: Number(stock.sellPrice || 0),
                    status: stock.status || 'onhand',
                    eta: getStockEta(stock),
                    appliedHandlingFee: handlingFee,
                    appliedInstallmentFee: installmentFee,
                    appliedTransferFee: transferFee,
                    stockKey: key,
                    type: 'kit',
                    basketId,
                    minDownpayment: stock.minDownpayment || 0,
                    createdAt: now
                };
                batch.set(doc(db, 'shelf', basketId), clean);
                batch.update(doc(db, 'kits', kit.id), {
                    [`stocks.${key}.isReserved`]: true,
                    [`stocks.${key}.reservedBy`]: user.uid,
                    [`stocks.${key}.reservedAt`]: serverTimestamp(),
                    [`stocks.${key}.reservationType`]: 'admin',
                    lastUpdated: serverTimestamp(),
                    hasAvailableStock: hasAvailable
                });
            });

            try {
                await batch.commit();
                console.log(`SG LOG: Batch ${Math.floor(i / CHUNK_SIZE) + 1} committed (${chunk.length} kits).`);
            } catch (err) {
                console.error("SG LOG: keepOneOfEachToShelf batch commit error:", err);
                alert("Firestore batch commit failed: " + err.message);
                throw err;
            }
        }

        console.log(`SG LOG: Done — ${itemsToKeep.length} kits moved to shelf.`);
      },

      addKit: async (kitData) => {
        console.log("SG DEBUG: addKit store action triggered with data:", kitData);
        try {
          const { stockUpdateKey, newStock, updateMasterOnly, id: oldKitId, targetId: requestedKitId, ...masterInfo } = kitData;
          const normalizedNewStock = newStock ? withStockConditionDefaults(newStock) : newStock;
          const parts = [];
          const b = (masterInfo.brand || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          if (b) parts.push(b);
          const g = (masterInfo.specs?.line || '').toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
          if (g) parts.push(g);
          const r = (masterInfo.specs?.scale || '').toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
          if (r) parts.push(r);
          const n = (masterInfo.name || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          if (n) parts.push(n);
          const targetKitId = requestedKitId || parts.join('_');
          console.log("SG DEBUG: Generated targetKitId:", targetKitId);

          const timing = new Date().toISOString();
          let stocks = {};
          let isExistingKit = false;
          let existingCreatedAt = null;
          let existingRestockedAt = null;
          let existingLastAvailableAt = null;

          if (oldKitId && oldKitId !== targetKitId) {
              console.log("SG DEBUG: ID change detected. Old:", oldKitId, "New:", targetKitId);
              const oldKitRef = doc(db, 'kits', oldKitId);
              const oldKitSnap = await getDoc(oldKitRef);
              if (oldKitSnap.exists()) {
                  const oldData = oldKitSnap.data();
                  stocks = oldData.stocks || {};
                  existingCreatedAt = oldData.createdAt || null;
                  existingRestockedAt = oldData.lastRestockedAt || null;
                  existingLastAvailableAt = oldData.lastAvailableAt || null;
                  console.log("SG DEBUG: Deleting old document:", oldKitId);
                  await deleteDoc(oldKitRef);
                  set((state) => ({ kits: state.kits.filter(k => k.id !== oldKitId) }));
              }
          } else {
              const kitRef = doc(db, 'kits', targetKitId);
              const kitSnap = await getDoc(kitRef);
              if (kitSnap.exists()) {
                  isExistingKit = true;
                  const existingData = kitSnap.data();
                  stocks = existingData.stocks || {};
                  existingCreatedAt = existingData.createdAt || null;
                  existingRestockedAt = existingData.lastRestockedAt || null;
                  existingLastAvailableAt = existingData.lastAvailableAt || null;
                  console.log("SG DEBUG: Found existing kit with targetKitId. stocks count:", Object.keys(stocks).length);
              }
          }

          const isRestock = Boolean(normalizedNewStock && (!stockUpdateKey || !stocks[stockUpdateKey]));
          // Compute stockKey ONCE so both blocks use the same key
          const resolvedStockKey = (!updateMasterOnly && normalizedNewStock) ? (stockUpdateKey || `stock_${Date.now()}`) : null;

          if (resolvedStockKey) {
            stocks[resolvedStockKey] = { ...normalizedNewStock, key: resolvedStockKey, lastUpdated: timing };
            console.log("SG DEBUG: Variant added/updated. Key:", resolvedStockKey);
          }
          
          const hasAvailable = Object.values(stocks).some(s => !s.order?.orderId && !s.isReserved);

          const cleanMaster = { 
            ...masterInfo, 
            id: targetKitId, 
            lastUpdated: serverTimestamp(), 
            createdAt: existingCreatedAt || serverTimestamp(),
            lastRestockedAt: isRestock ? serverTimestamp() : existingRestockedAt,
            lastAvailableAt: isRestock ? serverTimestamp() : existingLastAvailableAt,
            searchName: masterInfo.name.toLowerCase(),
            hasAvailableStock: hasAvailable
          };

          const kitRef = doc(db, 'kits', targetKitId);
          await setDoc(kitRef, isExistingKit ? cleanMaster : { ...cleanMaster, stocks }, { merge: true });

          if (resolvedStockKey) {
            await updateDoc(kitRef, {
              [`stocks.${resolvedStockKey}`]: stocks[resolvedStockKey],
              hasAvailableStock: hasAvailable
            });
          }
          console.log("SG DEBUG: addKit operation successful.");
          return { id: targetKitId };
        } catch (err) {
          console.error("SG DEBUG: Error in addKit store action:", err);
          throw err;
        }
      },

      deleteKit: async (kitId) => {
        if (!kitId) return;
        await deleteDoc(doc(db, 'kits', kitId));
      },

      deleteStock: async (kitId, stockKey) => {
        const kitRef = doc(db, 'kits', kitId);
        const kitSnap = await getDoc(kitRef);
        const shelfSnap = await getDocs(query(
          collection(db, 'shelf'),
          where('id', '==', kitId)
        ));
        const matchingShelfDocs = shelfSnap.docs.filter((shelfDoc) => (
          shelfDoc.data()?.stockKey === stockKey
        ));

        if (kitSnap.exists()) {
          const kit = kitSnap.data();
          const stocks = { ...kit.stocks };
          delete stocks[stockKey];
          const hasAvailable = Object.values(stocks).some(s => !s.order?.orderId && !s.isReserved);
          const batch = writeBatch(db);
          matchingShelfDocs.forEach((shelfDoc) => batch.delete(shelfDoc.ref));
          batch.update(kitRef, {
            [`stocks.${stockKey}`]: deleteField(),
            hasAvailableStock: hasAvailable
          });
          await batch.commit();
        } else {
          const batch = writeBatch(db);
          matchingShelfDocs.forEach((shelfDoc) => batch.delete(shelfDoc.ref));
          await batch.commit();
        }
      },

      addPrintedProject: async (projectData) => {
        const { user } = get();
        if (!user?.uid) throw new Error('Admin account is required to add a printed project.');

        const cleanProject = removeUndefinedValues(projectData || {});
        const ref = doc(collection(db, 'kits'));
        const record = {
          ...cleanProject,
          id: ref.id,
          productType: 'printed-project',
          isPrintedProject: true,
          listingType: 'printed-project',
          source: 'admin-printed-project',
          canAddToBasket: true,
          isPublished: true,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp()
        };

        await setDoc(ref, record);
        const localRecord = { ...cleanProject, id: ref.id };
        set((state) => ({
          printedProjects: [localRecord, ...(state.printedProjects || []).filter((item) => item.id !== ref.id)]
        }));
        return { id: ref.id };
      },

      deletePrintedProject: async (projectId) => {
        if (!projectId) return;
        await deleteDoc(doc(db, 'kits', projectId));
        set((state) => ({
          printedProjects: (state.printedProjects || []).filter((project) => project.id !== projectId),
          kits: (state.kits || []).filter((kit) => kit.id !== projectId)
        }));
      },

      updateStockPrice: async (kitId, stockKey, newPrice) => {
        await updateDoc(doc(db, 'kits', kitId), { [`stocks.${stockKey}.sellPrice`]: Number(newPrice) });
      },

      priceBuiltOnhandKits: async () => {
        const snapshot = await getDocs(collection(db, 'kits'));
        const kitUpdates = [];

        snapshot.docs.forEach((kitDoc) => {
          const kit = kitDoc.data();
          const stockPriceUpdates = {};
          let updatedStockCount = 0;

          Object.entries(kit?.stocks || {}).forEach(([stockKey, stock]) => {
            const isOnhand = String(stock?.status || '').trim().toLowerCase() === 'onhand';
            const hasNoBox = String(stock?.boxCondition || '').trim().toLowerCase() === ONHAND_BOX_CONDITION.toLowerCase();
            const isBuilt = String(stock?.kitCondition || '').trim().toLowerCase() === ONHAND_KIT_CONDITION.toLowerCase();
            const nextSellPrice = getBuiltOnhandSellPrice(stock?.costPrice);

            if (!isOnhand || !hasNoBox || !isBuilt || nextSellPrice <= 0) return;
            if (Number(stock?.sellPrice) === nextSellPrice) return;

            stockPriceUpdates[`stocks.${stockKey}.sellPrice`] = nextSellPrice;
            updatedStockCount += 1;
          });

          if (updatedStockCount > 0) {
            kitUpdates.push({
              kitId: kitDoc.id,
              stockPriceUpdates,
              updatedStockCount
            });
          }
        });

        for (let index = 0; index < kitUpdates.length; index += 450) {
          const batch = writeBatch(db);
          kitUpdates.slice(index, index + 450).forEach(({ kitId, stockPriceUpdates }) => {
            batch.update(doc(db, 'kits', kitId), {
              ...stockPriceUpdates,
              lastUpdated: serverTimestamp()
            });
          });
          await batch.commit();
        }

        const updatedStocks = kitUpdates.reduce((total, update) => total + update.updatedStockCount, 0);
        return { updatedKits: kitUpdates.length, updatedStocks };
      },

      updateAdminProfile: async (uid, data) => {
        await setDoc(doc(db, 'admins', uid), data, { merge: true });
      },

      updateGarageSettings: async (data) => {
        if (!data || typeof data !== 'object') return;
        const previousGarageInfo = get().garageInfo;
        set((state) => ({
          garageInfo: { ...(state.garageInfo || {}), ...data }
        }));
        try {
          await setDoc(doc(db, 'settings', 'garage'), data, { merge: true });
        } catch (error) {
          set({ garageInfo: previousGarageInfo });
          throw error;
        }
      },

      updateShippingSettings: async (uid, data) => {
        const docRef = doc(db, 'settings', 'checkout');
        
        if (data.shippingMethods) {
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const currentMethods = snap.data().shippingMethods || {};
            const newMethods = data.shippingMethods;
            const batchUpdates = {};
            
            // 1. Find deleted top-level methods
            Object.keys(currentMethods).forEach(mKey => {
              if (!(mKey in newMethods)) {
                batchUpdates[`shippingMethods.${mKey}`] = deleteField();
              } else {
                // 2a. Find deleted suboptions within all methods (stored in .suboptions)
                const currentSubs = currentMethods[mKey]?.suboptions || {};
                const newSubs = newMethods[mKey]?.suboptions || {};
                
                Object.keys(currentSubs).forEach(sKey => {
                  if (!(sKey in newSubs)) {
                    batchUpdates[`shippingMethods.${mKey}.suboptions.${sKey}`] = deleteField();
                  }
                });

                // 2b. Legacy flat-key cleanup para sa dating courier format (LBC/Lalamove/SPX).
                // Dati ay naka-store ang suboptions ng LBC/Lalamove/SPX Express direkta sa method object
                // (e.g. shippingMethods.LBC.cop). Sa bagong unified format, lahat ay nasa .suboptions.
                // I-delete ang mga legacy flat keys na wala na sa bagong config.
                const LEGACY_COURIER_FLAT_KEYS = ['cop', 'cod', 'self', 'seller', 'delivery'];
                LEGACY_COURIER_FLAT_KEYS.forEach(sKey => {
                  if (sKey in (currentMethods[mKey] || {}) && !(sKey in (newMethods[mKey] || {}))) {
                    batchUpdates[`shippingMethods.${mKey}.${sKey}`] = deleteField();
                  }
                });

                // 2c. Legacy flat discount keys (e.g. copHandlingDiscount) — i-delete para ma-clean ang Firestore
                const LEGACY_DISCOUNT_KEYS = ['copHandlingDiscount', 'codHandlingDiscount', 'selfHandlingDiscount', 'sellerHandlingDiscount', 'deliveryHandlingDiscount'];
                LEGACY_DISCOUNT_KEYS.forEach(dKey => {
                  if (dKey in (currentMethods[mKey] || {})) {
                    batchUpdates[`shippingMethods.${mKey}.${dKey}`] = deleteField();
                  }
                });
              }
            });
            
            if (Object.keys(batchUpdates).length > 0) {
              console.log("SG DEBUG: Deleting shipping settings keys:", Object.keys(batchUpdates));
              await updateDoc(docRef, batchUpdates);
            }
          }
        }
        
        await setDoc(docRef, data, { merge: true });
      },

      updatePaymentSetting: async (path, value) => {
        if (!path) return;
        await updateDoc(doc(db, 'settings', 'checkout'), {
          [`paymentSettings.${path}`]: value
        });
      },

      // I-delete ang specific payment method keys mula sa Firestore gamit ang deleteField().
      // Hindi pwedeng gamitin ang setDoc+merge para dito kasi hindi nito tinatanggal ang
      // mga existing keys na wala sa bagong data — nag-a-add/overwrite lang, hindi nagde-delete.
      // Katulad ng paraan ng pag-delete ng shipping methods sa itaas.
      deletePaymentMethods: async (deletedMethods = []) => {
        if (!deletedMethods.length) return;
        const docRef = doc(db, 'settings', 'checkout');
        const deletions = {};
        deletedMethods.forEach(method => {
          deletions[`paymentSettings.methods.${method}`] = deleteField();
          deletions[`paymentSettings.methods.${method}Qr`] = deleteField();
          deletions[`paymentSettings.methods.${method}TransferDiscount`] = deleteField();
          deletions[`paymentSettings.methods.${method}DiscountAmount`] = deleteField();
          deletions[`paymentSettings.methods.${method}CashTransferFee`] = deleteField();
          deletions[`paymentSettings.methods.${method}TransferFee`] = deleteField();
        });
        console.log('SG DEBUG: Deleting payment method keys from Firestore:', Object.keys(deletions));
        await updateDoc(docRef, deletions);
      },

      publishCheckoutSettings: async (partialSettings = {}) => {
        console.log("SG DEBUG: Publishing Partial Checkout Settings to settings/checkout");
        
        // Gamitin ang merge: true para sa partial update
        // Ipadala lang ang mga field na binago
        await setDoc(doc(db, 'settings', 'checkout'), partialSettings, { merge: true });
      },

      toggleStockReservation: async (kitId, stockKey, isReserved) => {
        const kitRef = doc(db, 'kits', kitId);
        const kitSnap = await getDoc(kitRef);
        if (kitSnap.exists()) {
          const kit = kitSnap.data();
          const stocks = { ...kit.stocks };
          if (stocks[stockKey]) {
            stocks[stockKey].isReserved = isReserved;
          }
          const hasAvailable = Object.values(stocks).some(s => !s.order?.orderId && !s.isReserved);
          await updateDoc(kitRef, { 
            [`stocks.${stockKey}.isReserved`]: isReserved, 
            [`stocks.${stockKey}.reservedAt`]: isReserved ? serverTimestamp() : null,
            ...(!isReserved ? {
              [`stocks.${stockKey}.availableAt`]: serverTimestamp(),
              lastAvailableAt: serverTimestamp(),
              lastUpdated: serverTimestamp()
            } : {}),
            hasAvailableStock: hasAvailable
          });
        } else {
          await updateDoc(kitRef, { [`stocks.${stockKey}.isReserved`]: isReserved, [`stocks.${stockKey}.reservedAt`]: isReserved ? serverTimestamp() : null });
        }
      },

      addDeal: async (dealData) => {
        const dealRef = dealData.id ? doc(db, "deals", dealData.id) : doc(collection(db, "deals"));
        await setDoc(dealRef, { ...dealData, id: dealRef.id, lastUpdated: serverTimestamp() }, { merge: true });
      },

      updateDeal: async (dealId, patch) => {
        await updateDoc(doc(db, "deals", dealId), { ...patch, lastUpdated: serverTimestamp() });
      },

      deleteDeal: async (dealId) => {
        // First release any stocks reserved by this mutually exclusive deal
        const { kits, user } = get();
        if (kits && user) {
          const batch = writeBatch(db);
          let hasChanges = false;
          kits.forEach(kit => {
            const dealReservedStocks = Object.entries(kit.stocks || {}).filter(
              ([, s]) => s.reservedByDealId === dealId
            );
            dealReservedStocks.forEach(([key]) => {
              const basketId = `b_kit_me_${dealId}_${key}`;
              batch.delete(doc(db, 'shelf', basketId));
              batch.update(doc(db, 'kits', kit.id), {
                [`stocks.${key}.isReserved`]: false,
                [`stocks.${key}.reservedBy`]: null,
                [`stocks.${key}.reservedAt`]: null,
                [`stocks.${key}.availableAt`]: serverTimestamp(),
                [`stocks.${key}.reservationType`]: deleteField(),
                [`stocks.${key}.reservedByDealId`]: deleteField(),
                lastAvailableAt: serverTimestamp(),
                lastUpdated: serverTimestamp()
              });
              hasChanges = true;
            });
          });
          if (hasChanges) {
            await batch.commit();
          }
        }
        await deleteDoc(doc(db, "deals", dealId));
      },

      addStory: async (storyData) => {
        const storiesCollection = collection(db, "stories");
        const snap = await getDocs(storiesCollection);
        const nextOrder = snap.size + 1;
        const storyRef = doc(storiesCollection);
        const createdAt = new Date().toISOString();
        const cleanStory = {
          ...storyData,
          id: storyRef.id,
          order: nextOrder,
          createdAt: serverTimestamp()
        };
        await setDoc(storyRef, cleanStory);
        set((state) => ({
          stories: [
            ...(state.stories || []),
            { ...storyData, id: storyRef.id, order: nextOrder, createdAt }
          ].sort((a, b) => (a.order || 0) - (b.order || 0))
        }));
        return storyRef.id;
      },

      updateStory: async (storyId, patch) => {
        const storyRef = doc(db, "stories", storyId);
        const replacesLegacyImage = Boolean(patch?.backgroundImage);
        const firestorePatch = {
          ...patch,
          ...(replacesLegacyImage ? { image: deleteField() } : {}),
          lastUpdated: serverTimestamp()
        };
        // Merge keeps edits resilient when a story was created by an older
        // client or its local cache no longer has the complete document.
        await setDoc(storyRef, firestorePatch, { merge: true });
        const lastUpdated = new Date().toISOString();
        set((state) => ({
          stories: (state.stories || []).map((story) =>
            story.id === storyId
              ? {
                  ...(replacesLegacyImage
                    ? Object.fromEntries(Object.entries(story).filter(([key]) => key !== 'image'))
                    : story),
                  ...patch,
                  id: storyId,
                  lastUpdated
                }
              : story
          )
        }));
      },

      deleteStory: async (storyId) => {
        await deleteDoc(doc(db, "stories", storyId));
      },

      deleteFromNotifyList: async (notifyId) => {
        await deleteDoc(doc(db, "hunts", notifyId));
        // Keep the derived Deals section in sync without waiting for the
        // Firestore listener round-trip.
        set((state) => ({
          notifyList: (state.notifyList || []).filter((item) => item.id !== notifyId),
          userOffers: (state.userOffers || []).filter((item) => item.id !== notifyId)
        }));
      },

      updateOfferPrice: async (notifyId, targetPrice) => {
        const price = parseFloat(targetPrice);
        if (!notifyId || Number.isNaN(price) || price <= 0) {
          throw new Error('Invalid offer price');
        }
        const expiresAt = new Date(Date.now() + (14 * 24 * 60 * 60 * 1000)).toISOString();
        await setDoc(doc(db, "hunts", notifyId), {
          targetPrice: price,
          status: 'pending',
          expiresAt,
          updatedAt: serverTimestamp(),
          declinedAt: deleteField(),
          declinedBy: deleteField(),
          releasedAt: deleteField(),
          releasedBy: deleteField(),
          offerAcceptedAt: deleteField(),
          offerExpiresAt: deleteField(),
          releasedStockKey: deleteField(),
          completedAt: deleteField()
        }, { merge: true });
      },

      declineOffer: async (notifyId) => {
        const { user } = get();
        if (!notifyId) return;
        await setDoc(doc(db, "hunts", notifyId), {
          status: 'declined',
          declinedAt: serverTimestamp(),
          declinedBy: user?.uid || 'admin',
          updatedAt: serverTimestamp()
        }, { merge: true });
      },

      releaseOffer: async (offer) => {
        const { shelf, user } = get();
        if (!offer?.id || !offer?.kitId) return;
        const shelfItem = (shelf || []).find(s => s.id === offer.kitId);
        const acceptedAt = Date.now();
        await setDoc(doc(db, "hunts", offer.id), {
          status: 'released',
          releasedAt: serverTimestamp(),
          offerAcceptedAt: serverTimestamp(),
          offerExpiresAt: new Date(acceptedAt + (12 * 60 * 60 * 1000)).toISOString(),
          releasedStockKey: shelfItem?.stockKey || null,
          releasedBy: user?.uid || 'admin',
          updatedAt: serverTimestamp()
        }, { merge: true });
      },

      completeAcceptedOffer: async ({ offerId, kitId, stockKey, offerPrice }) => {
        const price = Number(offerPrice);
        if (!offerId || !kitId || !stockKey || !Number.isFinite(price) || price <= 0) return;

        const batch = writeBatch(db);
        batch.update(doc(db, 'kits', kitId), {
          [`stocks.${stockKey}.sellPrice`]: price,
          lastUpdated: serverTimestamp()
        });
        batch.set(doc(db, 'hunts', offerId), {
          status: 'completed',
          completedAt: serverTimestamp(),
          completedOfferPrice: price,
          updatedAt: serverTimestamp()
        }, { merge: true });
        await batch.commit();
      },

      huntKit: async (kit, targetPrice) => {
        const { user, notifyList } = get();
        if (!user) { alert("Please login to Hunt this kit!"); return; }
        const existingHunt = notifyList.find(n => n.uid === user.uid && n.kitId === kit.id);
        const expiresAt = new Date(Date.now() + (14 * 24 * 60 * 60 * 1000)).toISOString();
        const huntData = {
          uid: user.uid,
          userName: (user.displayName || 'Guest').toUpperCase(),
          photoURL: user.photoURL || '',
          kitId: kit.id,
          kitName: kit.name,
          targetPrice: parseFloat(targetPrice) || 0,
          status: 'pending',
          expiresAt,
          updatedAt: serverTimestamp()
        };
        if (existingHunt) {
            await setDoc(doc(db, "hunts", existingHunt.id), {
              ...huntData,
              declinedAt: deleteField(),
              declinedBy: deleteField()
            }, { merge: true });
            alert(`Offer updated for ${kit.name}!`);
        } else {
            const huntId = `HUNT_${Date.now()}_${user.uid.slice(0, 5)}`;
            await setDoc(doc(db, "hunts", huntId), { ...huntData, id: huntId, createdAt: serverTimestamp() });
          alert(`Offer submitted for ${kit.name}!`);
        }
      },

      stopImpersonating: () => {
        const { originalAdminUser, originalAdminBasket } = get();
        if (!originalAdminUser) return;
        set({
        user: originalAdminUser,
          basket: originalAdminBasket || [],
          originalAdminUser: null,
          originalAdminBasket: []
        });
      },

      syncUserAccount: async (sgUser, onSyncComplete) => {
        // console.log("DEBUG: syncUserAccount called with:", sgUser ? sgUser.uid : "null");
        set({ syncStatus: 'Syncing Profile' });
        if (get().unsubUser) get().unsubUser();
        if (get().unsubShelf) get().unsubShelf();
        if (get().unsubAdmin) get().unsubAdmin();
        if (get().unsubBasket) get().unsubBasket();
        if (get().unsubProjectVault) get().unsubProjectVault();
        if (get().unsubOffers) get().unsubOffers();
        set((state) => ({
          unsubUser: null,
          unsubShelf: null,
          unsubAdmin: null,
          unsubBasket: null,
          unsubProjectVault: null,
          unsubOffers: null,
          _datasetListenerKeys: { ...state._datasetListenerKeys, shelf: false }
        }));

        if (!sgUser) {
          console.log("DEBUG: No sgUser found, switching to guest mode.");
          const guestProjectVault = JSON.parse(localStorage.getItem('sg_guest_project_vault') || '[]');
          const guestBasket = JSON.parse(localStorage.getItem('sg_guest_basket') || '[]');
          set({ user: null, isAnonymousUser: false, isAdmin: false, isAdminView: false, usersList: [], projectVault: guestProjectVault, guestBasket, shelf: [], userOffers: [], userOffersLoaded: true, unsubUser: null, unsubShelf: null, unsubAdmin: null, unsubBasket: null, unsubProjectVault: null, unsubOffers: null, syncStatus: 'Restoring local basket' });
          
          get().markLoaded('userProfile');
          get().markLoaded('basket');
          get().markLoaded('shelf');
          
          if (onSyncComplete) onSyncComplete();
          return;
        }

        const isAnonymousUser = sgUser.isAnonymous === true;
        set({ userOffersLoaded: isAnonymousUser });
        console.log("DEBUG: sgUser detected, syncing data for UID:", sgUser.uid);
        const userRef = doc(db, 'users', sgUser.uid);
        const adminRef = doc(db, 'admins', sgUser.uid);
        const vaultRef = doc(db, 'projectVaults', sgUser.uid);
        const [adminResult, userResult, vaultResult] = await Promise.allSettled([
          getDoc(adminRef),
          getDoc(userRef),
          getDoc(vaultRef)
        ]);
        const adminSnap = adminResult.status === 'fulfilled' ? adminResult.value : null;
        const initialDocSnap = userResult.status === 'fulfilled' ? userResult.value : null;
        const vaultSnap = vaultResult.status === 'fulfilled' ? vaultResult.value : null;
        const isActuallyAdmin = Boolean(adminSnap?.exists());
        console.log("DEBUG: Is user admin?", isActuallyAdmin);

        if (adminResult.status === 'rejected') {
          console.error("SG LOG: Admin role lookup failed:", adminResult.reason);
        }
        if (userResult.status === 'rejected') {
          console.error("SG LOG: User profile lookup failed:", userResult.reason);
        }
        if (vaultResult.status === 'rejected') {
          console.error("SG LOG: Project vault lookup failed:", vaultResult.reason);
        }

        let userData = initialDocSnap?.exists() ? initialDocSnap.data() : null;
        const initialVault = vaultSnap?.exists() ? (vaultSnap.data().items || []) : [];
        set({ projectVault: initialVault });
        const authPhotoURL = sgUser.photoURL || '';
        const storedPhotoURL = userData?.photoURL || '';

        if (authPhotoURL && storedPhotoURL !== authPhotoURL) {
          void setDoc(userRef, { photoURL: authPhotoURL }, { merge: true })
            .catch((error) => console.error("SG LOG: Profile photo sync failed:", error));
          userData = { ...(userData || {}), photoURL: authPhotoURL };
        }
        
        set({ syncStatus: 'Loading basket' });

        // Basket Migration Logic
        const rawGuestBasket = localStorage.getItem('sg_guest_basket');
        const guestBasket = JSON.parse(rawGuestBasket || '[]');
        
        if (guestBasket && guestBasket.length > 0) {
            console.log("DEBUG: Migrating guest basket items to subcollection:", guestBasket.length);
            const batch = writeBatch(db);
            for (const item of guestBasket) {
                const bId = item.basketId || `b_kit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                batch.set(doc(db, 'users', sgUser.uid, 'basket', bId), { ...item, basketId: bId });
            }
            void batch.commit()
              .then(() => {
                localStorage.removeItem('sg_guest_basket');
                set({ guestBasket: [] });
              })
              .catch((error) => console.error("SG LOG: Guest basket migration failed:", error));
        }

        // Self-Healing Migration: Migrate old user document basket (map field) to the basket subcollection
        if (userData && userData.basket && typeof userData.basket === 'object' && Object.keys(userData.basket).length > 0) {
            console.log("DEBUG: Migrating basket map from user doc to subcollection");
            const batch = writeBatch(db);
            Object.entries(userData.basket).forEach(([bId, item]) => {
                if (item) {
                    batch.set(doc(db, 'users', sgUser.uid, 'basket', bId), { ...item, basketId: bId });
                }
            });
            batch.update(userRef, { basket: deleteField() });
            void batch.commit()
              .then(() => console.log("DEBUG: Basket map migration completed successfully"))
              .catch((error) => console.error("SG LOG: Basket map migration failed:", error));
        }

        set({ syncStatus: 'Loading Projects' });

        // Kung may projectVault sa user doc (lumang format), i-migrate at i-delete doon
        if (userData?.projectVault && Array.isArray(userData.projectVault) && userData.projectVault.length > 0) {
          console.log("DEBUG: Migrating projectVault from user doc to projectVaults collection");
          const mergedVault = [...userData.projectVault];
          set({ projectVault: mergedVault });
          void setDoc(vaultRef, { items: mergedVault, uid: sgUser.uid }, { merge: true })
            .then(() => updateDoc(userRef, { projectVault: deleteField() }))
            .catch((error) => console.error("SG LOG: Project vault migration failed:", error));
        }

        const initialUser = userData || {
          uid: sgUser.uid,
          displayName: (sgUser.displayName || "Anonymous").toUpperCase(),
          photoURL: sgUser.photoURL || '',
          email: sgUser.email || '',
          role: isAnonymousUser ? 'guest' : 'customer',
          createdAt: new Date().toISOString()
        };
        set({
          user: {
            uid: sgUser.uid,
            ...initialUser,
            photoURL: initialUser.photoURL || sgUser.photoURL || '',
            displayName: (initialUser.displayName || sgUser.displayName || "Anonymous").toUpperCase()
          },
          isAnonymousUser,
          isAdmin: isActuallyAdmin,
          isBanned: initialUser.userDetails?.status === 'banned',
          isProfileIncomplete: !isAnonymousUser && !initialUser.userDetails?.welcomeSeen,
          syncStatus: 'Ready'
        });
        get().markLoaded('userProfile');
        if (onSyncComplete) onSyncComplete();

        // A successful non-anonymous sign-in resets the inactivity lifecycle.
        // Clearing the notice fields cancels an active deletion countdown.
        if (!isAnonymousUser) {
          void setDoc(userRef, {
            ...(sgUser.email ? { email: sgUser.email } : {}),
            lastLoginAt: serverTimestamp(),
            deletionNoticeSentAt: deleteField(),
            deletionScheduledAt: deleteField(),
            deletionRequestedAt: deleteField(),
            deletionReason: deleteField()
          }, { merge: true }).catch((error) => (
            console.error("SG LOG: Login activity update failed:", error)
          ));
        }

        if (!userData) {
          void setDoc(userRef, {
            uid: sgUser.uid,
            displayName: (sgUser.displayName || "Anonymous").toUpperCase(),
            photoURL: sgUser.photoURL || '',
            email: sgUser.email || '',
            role: 'customer',
            lastLoginAt: serverTimestamp(),
            createdAt: serverTimestamp()
          }, { merge: true }).catch((error) => console.error("SG LOG: Initial profile creation failed:", error));
        }

        if (isActuallyAdmin && typeof sessionStorage !== 'undefined' && !sessionStorage.getItem('sg:availability-migration-started')) {
          sessionStorage.setItem('sg:availability-migration-started', 'true');
          setTimeout(() => { void get().migrateKitsAvailabilityField(); }, 1500);
        }

        const unsubUser = onSnapshot(userRef, async (docSnap) => {
            console.log("DEBUG: User doc snapshot update for UID:", sgUser.uid);
            
            if (docSnap.exists()) {
              const data = docSnap.data();
              // IMPORTANT: Huwag i-include ang projectVault at basket sa user doc snapshot —
              // naka-store na ito sa sariling collections/subcollections para iwas sa 1MB limit
              set({ 
                user: { 
                  uid: sgUser.uid,
                  ...data,
                  photoURL: data.photoURL || sgUser.photoURL || '',
                  displayName: (data.displayName || sgUser.displayName || "Anonymous").toUpperCase() 
                }, 
              isAnonymousUser,
              isAdmin: isActuallyAdmin,
              isBanned: data.userDetails?.status === 'banned',
              isProfileIncomplete: !isAnonymousUser && !data.userDetails?.welcomeSeen
              });
              get().processPendingBasket();
            } else {
              console.log("DEBUG: User doc does not exist, creating initial doc for UID:", sgUser.uid);
              const initial = {
                uid: sgUser.uid,
                displayName: (sgUser.displayName || "Anonymous").toUpperCase(),
                photoURL: sgUser.photoURL,
                email: sgUser.email || '',
                role: 'customer',
                ...(!isAnonymousUser ? { lastLoginAt: serverTimestamp() } : {}),
                createdAt: serverTimestamp()
              };
              void setDoc(userRef, initial, { merge: true })
                .catch((error) => console.error("SG LOG: Initial profile creation failed:", error));
              set({ user: { ...initial, createdAt: new Date().toISOString() }, isAdmin: isActuallyAdmin });
            }
        }, (error) => console.error("SG LOG: User profile subscription error:", error));

        set({ syncStatus: 'Loading Basket' });

        const unsubBasket = onSnapshot(collection(db, 'users', sgUser.uid, 'basket'), (basketSnap) => {
            const basketItems = basketSnap.docs.map(doc => ({ ...doc.data(), basketId: doc.id }));
            set({ basket: basketItems.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()) });
            
            get().markLoaded('basket');
        }, (err) => {
            console.error("SG LOG: Basket subscription error:", err);
            get().markLoaded('basket', { status: 'error' });
        });

        const unsubProjectVault = onSnapshot(vaultRef, (vaultSnapshot) => {
          const items = vaultSnapshot.exists() && Array.isArray(vaultSnapshot.data()?.items)
            ? vaultSnapshot.data().items
            : [];
          set({ projectVault: items });
        }, (error) => {
          console.error('SG LOG: Project vault subscription error:', error);
        });

        const unsubOffers = onSnapshot(query(collection(db, 'hunts'), where('uid', '==', sgUser.uid)), (offersSnap) => {
          set({ userOffers: docsToArray(offersSnap), userOffersLoaded: true });
        }, (err) => {
          console.error("SG LOG: Offers subscription error:", err);
          set({ userOffers: [], userOffersLoaded: true });
        });

        let unsubAdmin = null;
        if (isActuallyAdmin) {
          unsubAdmin = onSnapshot(doc(db, 'admins', sgUser.uid), (snap) => {
            set({ adminData: snap.exists() ? snap.data() : null });
          });
        }
        set({ unsubUser, unsubAdmin, unsubBasket, unsubProjectVault, unsubOffers });
      },

      updateUserProfile: async (uid, data) => { await updateDoc(doc(db, 'users', uid), data); },
      addPrinter: async (printerData) => {
        const { id, ...data } = printerData || {};
        const existingIds = new Set((get().printers || []).map((printer) => String(printer.id)));
        const ref = id && !existingIds.has(String(id))
          ? doc(db, 'printers', id)
          : doc(collection(db, 'printers'));
        const previousPrinters = get().printers || [];
        const nextPrinter = { ...data, status: normalizePrinterStatus(data.status, data), id: ref.id };

        set((state) => ({
          printers: [nextPrinter, ...(state.printers || []).filter((printer) => String(printer.id) !== String(ref.id))]
        }));

        try {
          await setDoc(ref, nextPrinter);
        } catch (error) {
          set({ printers: previousPrinters });
          throw error;
        }
      },

      updatePrinter: async (id, patch) => {
        if (!id || !patch) return;
        const normalizedPatch = Object.prototype.hasOwnProperty.call(patch, 'status')
          ? { ...patch, status: normalizePrinterStatus(patch.status, patch) }
          : patch;
        const previousPrinters = get().printers || [];
        set((state) => ({
          printers: (state.printers || []).map((printer) => (
            String(printer.id) === String(id) ? { ...printer, ...normalizedPatch, id: printer.id } : printer
          ))
        }));

        try {
          await updateDoc(doc(db, 'printers', id), normalizedPatch);
        } catch (error) {
          set({ printers: previousPrinters });
          throw error;
        }
      },

      deletePrinter: async (id) => {
        if (!id) return;
        const previousPrinters = get().printers || [];
        set((state) => ({
          printers: (state.printers || []).filter((printer) => String(printer.id) !== String(id))
        }));

        try {
          await deleteDoc(doc(db, 'printers', id));
        } catch (error) {
          set({ printers: previousPrinters });
          throw error;
        }
      },

      addFeeder: async (feederData) => {
        const { id, ...data } = feederData || {};
        const normalizedData = {
          ...data,
          status: normalizePrinterStatus(data.status, data)
        };
        const existingIds = new Set((get().feeders || []).map((feeder) => String(feeder.id)));
        const ref = id && !existingIds.has(String(id))
          ? doc(db, 'feeders', id)
          : doc(collection(db, 'feeders'));
        const previousFeeders = get().feeders || [];
        const nextFeeder = normalizeFeederRecord({ ...normalizedData, id: ref.id });

        set((state) => ({
          feeders: [nextFeeder, ...(state.feeders || []).filter((feeder) => String(feeder.id) !== String(ref.id))]
        }));

        try {
          await setDoc(ref, normalizedData);
        } catch (error) {
          set({ feeders: previousFeeders });
          throw error;
        }
      },

      updateFeeder: async (id, patch) => {
        if (!id || !patch) return;
        const normalizedPatch = Object.prototype.hasOwnProperty.call(patch, 'status')
          ? { ...patch, status: normalizePrinterStatus(patch.status, patch) }
          : patch;
        const previousFeeders = get().feeders || [];
        set((state) => ({
          feeders: (state.feeders || []).map((feeder) => (
            String(feeder.id) === String(id) ? normalizeFeederRecord({ ...feeder, ...normalizedPatch, id: feeder.id }) : feeder
          ))
        }));

        try {
          await updateDoc(doc(db, 'feeders', id), normalizedPatch);
        } catch (error) {
          set({ feeders: previousFeeders });
          throw error;
        }
      },

      deleteFeeder: async (id) => {
        if (!id) return;
        const previousFeeders = get().feeders || [];
        set((state) => ({
          feeders: (state.feeders || []).filter((feeder) => String(feeder.id) !== String(id))
        }));

        try {
          await deleteDoc(doc(db, 'feeders', id));
        } catch (error) {
          set({ feeders: previousFeeders });
          throw error;
        }
      },

      addFilament: async (fData) => { 
        console.log('Store: addFilament called with', fData);
        const { id, ...d } = fData; 
        const existingIds = new Set((get().filamentInventory || []).map((f) => String(f.id)));
        const ref = id && !existingIds.has(String(id)) ? doc(db, "filaments", id) : doc(collection(db, "filaments")); 
        const previousInventory = get().filamentInventory || [];
        set((state) => {
          const nextFilament = { ...d, id: ref.id };
          const exists = (state.filamentInventory || []).some((f) => String(f.id) === String(ref.id));
          return {
            filamentInventory: exists
              ? state.filamentInventory.map((f) => String(f.id) === String(ref.id) ? { ...f, ...nextFilament } : f)
              : [nextFilament, ...(state.filamentInventory || [])]
          };
        });
        try {
          await setDoc(ref, { ...d, id: ref.id });
        } catch (error) {
          set({ filamentInventory: previousInventory });
          throw error;
        }
        console.log('Store: addFilament completed');
      },

      deleteOrder: async (orderDocId) => {
        const { kits, isAdmin, orders } = get();
        let order = (orders || []).find(o => o.id === orderDocId);
        if (!order) {
          try {
            const snap = await getDoc(doc(db, "orders", orderDocId));
            if (snap.exists()) {
              order = { id: snap.id, ...snap.data() };
            }
          } catch (err) {
            console.error("SG LOG: Error fetching order in deleteOrder:", err);
          }
        }

        const isCash = order?.paymentMethod === 'Cash';
        const isInstallment = order?.paymentPlan && order?.paymentPlan !== 'full';
        const isMaintenance = order?.isMaintenanceOrder || false;

        if ((isCash || isInstallment) && !isAdmin && !isMaintenance) {
          console.error("SG LOG: Unauthorized delete attempt for Cash/Installment order:", orderDocId);
          alert("Unauthorized: Only admins can delete cash or installment orders.");
          return;
        }

        await deleteDoc(doc(db, "orders", orderDocId));
        await releaseOrderStocks(orderDocId, order, kits);
      },

      reverseCompletedOrder: async (orderDocId) => {
        const { kits, isAdmin, orders } = get();
        if (!isAdmin) {
          throw new Error('Only administrators can reverse completed orders.');
        }

        let order = (orders || []).find((candidate) => candidate.id === orderDocId);
        if (!order) {
          const snap = await getDoc(doc(db, 'orders', orderDocId));
          if (snap.exists()) order = { id: snap.id, ...snap.data() };
        }

        if (!order || order.status !== 'Completed') {
          throw new Error('Only completed orders can be reversed.');
        }

        const completedAt = getOrderTimestampMs(order.completedAt || order.lastUpdated || order.createdAt);
        if (completedAt && Date.now() >= completedAt + COMPLETED_ORDER_REVERSAL_WINDOW_MS) {
          throw new Error('This completed order is now a permanent record.');
        }

        const orderRef = doc(db, 'orders', orderDocId);
        await updateDoc(orderRef, {
          status: 'Cancelled',
          cancelledAt: serverTimestamp(),
          lastUpdated: serverTimestamp()
        });

        // Release before deleting so a failed inventory write leaves a recoverable
        // cancelled order for the existing cleanup path to retry.
        await releaseOrderStocks(orderDocId, order, kits);
        await deleteDoc(orderRef);
      },

      reverseLegacyOrder: async (orderDocId) => {
        const { kits, isAdmin, orders } = get();
        if (!isAdmin) {
          throw new Error('Only administrators can reverse legacy orders.');
        }

        let order = (orders || []).find((candidate) => candidate.id === orderDocId);
        if (!order) {
          const snap = await getDoc(doc(db, 'orders', orderDocId));
          if (snap.exists()) order = { id: snap.id, ...snap.data() };
        }

        const isLegacyOrder = Boolean(
          order?.legacyOrder
          || order?.orderSource === 'legacy'
          || String(order?.orderId || '').toUpperCase().startsWith('#LG-')
        );
        if (!order || !isLegacyOrder || order.status === 'Cancelled') {
          throw new Error('Only an active legacy order can be reversed.');
        }

        const orderRef = doc(db, 'orders', orderDocId);
        await updateDoc(orderRef, {
          status: 'Cancelled',
          cancelledAt: serverTimestamp(),
          lastUpdated: serverTimestamp()
        });

        // Release first so a failed inventory write leaves a cancelled record
        // that the existing cleanup path can retry safely.
        await releaseOrderStocks(orderDocId, order, kits);
        await deleteDoc(orderRef);
      },



      updateFilament: async (id, patch, newId) => { 
        console.log('Store: updateFilament called with ID:', id, 'New ID:', newId, 'and Patch:', patch);
        
        const previousInventory = get().filamentInventory || [];
        set((state) => ({
          filamentInventory: (state.filamentInventory || []).map((f) => (
            String(f.id) === String(id) ? { ...f, ...patch, id: newId || id } : f
          ))
        }));

        try {
          if (newId && newId !== id) {
            // Document ID change: create new doc, delete old one
            await setDoc(doc(db, "filaments", newId), patch);
            await deleteDoc(doc(db, "filaments", id));
          } else {
            // Same ID: normal update
            await updateDoc(doc(db, "filaments", id), patch);
          }
          console.log('Store: updateFilament Firestore update successful');
        } catch (error) {
          console.error('Store: updateFilament Firestore error:', error);
          set({ filamentInventory: previousInventory });
          throw error;
        }
        console.log('Store: updateFilament completed');
      },

      deleteFilament: async (id) => {
        const previousInventory = get().filamentInventory || [];
        set((state) => ({ filamentInventory: (state.filamentInventory || []).filter((f) => String(f.id) !== String(id)) }));
        try {
          await deleteDoc(doc(db, "filaments", id));
        } catch (error) {
          set({ filamentInventory: previousInventory });
          throw error;
        }
      },

      updateSettings: async (rateId, patch) => {
        if (!rateId || !patch) return;
        const normalizedPatch = (
          rateId === 'electricity-cost'
          && Object.prototype.hasOwnProperty.call(patch, 'electricityRate')
        )
          ? (() => {
              const now = new Date();
              const localDate = [
                now.getFullYear(),
                String(now.getMonth() + 1).padStart(2, '0'),
                String(now.getDate()).padStart(2, '0')
              ].join('-');
              return { ...patch, rateAsOf: localDate };
            })()
          : patch;
        const previousRates = get().rates || {};
        const nextRates = {
          ...previousRates,
          [rateId]: {
            ...(previousRates[rateId] || {}),
            ...normalizedPatch
          }
        };
        set((state) => ({
          rates: nextRates
        }));
        try {
          await setDoc(doc(db, 'rates', rateId), normalizedPatch, { merge: true });

          if (
            rateId === 'electricity-cost'
            && Object.prototype.hasOwnProperty.call(normalizedPatch, 'electricityRate')
            && getEffectiveElectricityRate(previousRates['electricity-cost'] || {})
              !== getEffectiveElectricityRate(nextRates['electricity-cost'] || {})
          ) {
            try {
              const updatedProjectCount = await repricePersistedProjects(previousRates, nextRates);
              console.info(`SG LOG: Repriced ${updatedProjectCount} persisted project collection(s) after electricity rate update.`);
            } catch (pricingError) {
              // Keep the rate update successful, but surface the sync failure
              // so it can be retried without reverting the administrator's rate.
              console.error('SG LOG: Persisted project repricing failed:', pricingError);
            }
          }
        } catch (error) {
          set({ rates: previousRates });
          throw error;
        }
      },

      addToBasket: async (itemData) => {
        const { user, basket, shelf, isAdmin, isAdminView, guestBasket, kits } = get();
        const isAdminContext = isAdmin && isAdminView;
        const currentList = isAdminContext ? (shelf || []) : (user ? (basket || []) : (guestBasket || []));
        const stateField = isAdminContext ? 'shelf' : (user ? 'basket' : 'guestBasket');
        
        let kit = kits.find(k => k.id === itemData.id);
        if (!kit) {
           const snap = await getDoc(doc(db, "kits", itemData.id));
           if (snap.exists()) kit = { id: snap.id, ...snap.data() };
        }
        
        if (!kit?.stocks || typeof kit.stocks !== 'object') {
          console.error("SG LOG: Kit or stocks not found for ID:", itemData.id);
          return;
        }

        const occupied = new Set(currentList.filter(i => i.id === itemData.id).map(i => i.stockKey));
        const available = Object.entries(kit.stocks)
          .filter(([key, stock]) => !stock.isReserved && !stock.order?.orderId && !occupied.has(key));
        const requestedStock = itemData.stockKey ? kit.stocks[itemData.stockKey] : null;
        const requestedSource = itemData.stockSource || (requestedStock ? getStockSource(requestedStock) : '');
        const sourceAvailable = available.filter(([, stock]) => stockMatchesSource(stock, requestedSource));
        const customerCandidates = sourceAvailable.length > 0 ? sourceAvailable : available;
        const sortedAvailable = isAdminContext
          ? [...available].sort((a, b) => getStockCostPrice(a[1]) - getStockCostPrice(b[1]))
          : [...customerCandidates].sort(compareCustomerStockEntries);
        const isAcceptedOffer = Boolean(itemData.offerId && requestedStock);
        const targetKey = isAdminContext
          ? sortedAvailable[0]?.[0]
          : isAcceptedOffer
            ? itemData.stockKey
            : sortedAvailable[0]?.[0];

        if (!targetKey) return;

        const basketId = `b_kit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const { handlingFee: hFee, installmentFee: iFee, transferFee: tFee } = getCheckoutPaymentFees({
          garageInfo: { checkoutSettings: get().shippingSettings },
          adminData: { paymentSettings: get().shippingSettings?.paymentSettings }
        });

        const stock = kit.stocks[targetKey];
        const offerPrice = Number(itemData.offerPrice);
        const basePrice = Number.isFinite(offerPrice) && offerPrice > 0
          ? offerPrice
          : Number(stock.sellPrice || 0);
        const isBundleItem = Boolean(itemData.isBundleItem || itemData.isClearanceBundle);
        const itemHandlingFee = isBundleItem ? 0 : hFee;
        const itemInstallmentFee = isBundleItem ? 0 : iFee;
        const itemTransferFee = isBundleItem ? 0 : tFee;
        const clean = { 
          id: kit.id, 
          name: (itemData.name || kit.name || '').replace(/\s*\(Pre-Order\)\s*$/i, ''), 
          image: itemData.image || kit.image || '',
          brand: itemData.brand || kit.brand || '',
          specs: itemData.specs || kit.specs || {},
          price: isBundleItem ? Number(itemData.price ?? basePrice) : basePrice + itemHandlingFee + itemInstallmentFee + itemTransferFee,
          costPrice: Number(stock.costPrice || 0),
          sellPrice: basePrice,
          status: stock.status || 'onhand',
          eta: getStockEta(stock),
          appliedHandlingFee: itemHandlingFee, 
          appliedInstallmentFee: itemInstallmentFee, 
          appliedTransferFee: itemTransferFee,
          stockKey: targetKey, 
          stockSource: getStockSource(stock),
          type: itemData.type || 'kit', 
          basketId, 
          minDownpayment: stock.minDownpayment || 0,
          offerId: itemData.offerId || null,
          offerStatus: itemData.offerStatus || null,
          offerPrice: Number.isFinite(offerPrice) && offerPrice > 0 ? offerPrice : null,
          offerExpiresAt: itemData.offerExpiresAt || null,
          offerAcceptedAt: itemData.offerAcceptedAt || null,
          isBundleItem,
          isClearanceBundle: Boolean(itemData.isClearanceBundle),
          clearanceKitIds: itemData.clearanceKitIds || [],
          bundleId: itemData.bundleId || null,
          bundleName: itemData.bundleName || null,
          bundleSize: itemData.bundleSize || null,
          bundleFeeShare: Number(itemData.bundleFeeShare || 0),
          bundleReferencePrice: Number(itemData.bundleReferencePrice || 0),
          allowShelfBundle: Boolean(itemData.allowShelfBundle),
          appliedBundlePrice: isBundleItem ? Number(itemData.price ?? basePrice) : null,
          createdAt: new Date().toISOString() 
        };

        if (!user) { 
          const newList = [...(guestBasket || []), clean].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()); 
          localStorage.setItem('sg_guest_basket', JSON.stringify(newList)); 
          set({ guestBasket: newList }); 
          return; 
        }

        set({ [stateField]: [...currentList, clean] });
        
        if (isAdminContext) {
            const shelfCount = [...currentList, clean].filter(i => i.id === kit.id).length;
            set({ toastMessage: `${shelfCount} in shelf` });
            await setDoc(doc(db, 'shelf', basketId), clean);

            const updatedStocks = { ...kit.stocks };
            if (updatedStocks[targetKey]) {
              updatedStocks[targetKey] = {
                ...updatedStocks[targetKey],
                isReserved: true
              };
            }
            const hasAvailable = Object.values(updatedStocks).some(s => !s.order?.orderId && !s.isReserved);

            await updateDoc(doc(db, "kits", kit.id), { 
              [`stocks.${targetKey}.isReserved`]: true, 
              [`stocks.${targetKey}.reservedBy`]: user.uid, 
              [`stocks.${targetKey}.reservedAt`]: serverTimestamp(), 
              [`stocks.${targetKey}.reservationType`]: 'admin',
              lastUpdated: serverTimestamp(),
              hasAvailableStock: hasAvailable
            });
        } else {
            await setDoc(doc(db, 'users', user.uid, 'basket', basketId), clean);
        }
      },

      clearBasket: async () => {
        const { user, isAdmin, isAdminView, shelf, basket } = get();
        if (!user) { localStorage.removeItem('sg_guest_basket'); set({ guestBasket: [] }); return; }
        const field = (isAdmin && isAdminView) ? 'shelf' : 'basket';
        const removedItems = (isAdmin && isAdminView) ? shelf : basket;
        set({ [field]: [] });
        
        const batch = writeBatch(db);
        if (isAdmin && isAdminView) {
          shelf.forEach(item => {
            batch.delete(doc(db, 'shelf', item.basketId));
          });
        } else {
          basket.forEach(item => {
            batch.delete(doc(db, 'users', user.uid, 'basket', item.basketId));
          });
        }
        await batch.commit();

        await Promise.all((removedItems || []).map(async (item) => {
          try {
            await removeReleasedOffersForRemovedItem(item, isAdmin && isAdminView);
          } catch (error) {
            console.error('SG LOG: Failed to remove released offer after clearing basket:', error);
          }
        }));
      },

      removeFromBasket: async (basketId) => {
        const { user, basket, shelf, isAdmin, isAdminView, guestBasket } = get();
        const isAdminContext = isAdmin && isAdminView;
        const currentList = isAdminContext ? shelf : (user ? basket : guestBasket);
        const field = isAdminContext ? 'shelf' : (user ? 'basket' : 'guestBasket');
        
        if (!user) { 
          const newList = (guestBasket || []).filter(i => i.basketId !== basketId); 
          localStorage.setItem('sg_guest_basket', JSON.stringify(newList)); 
          set({ guestBasket: newList }); 
          return; 
        }
        
        const item = currentList.find(i => i.basketId === basketId);
        if (!item) return;
        
        const newList = currentList.filter(i => i.basketId !== basketId);
        set({ [field]: newList });
        
        try {
          if (isAdminContext) {
            const shelfCount = newList.filter(i => i.id === item.id).length;
            set({ toastMessage: `${shelfCount} in shelf` });
            await deleteDoc(doc(db, 'shelf', basketId));
            const kitSnap = await getDoc(doc(db, "kits", item.id));
            if (kitSnap.exists() && kitSnap.data().stocks?.[item.stockKey]?.reservationType === 'admin') {
              const kitData = kitSnap.data();
              const stocks = { ...kitData.stocks };
              if (stocks[item.stockKey]) {
                stocks[item.stockKey].isReserved = false;
                delete stocks[item.stockKey].reservedBy;
                delete stocks[item.stockKey].reservedAt;
                delete stocks[item.stockKey].reservationType;
              }
              const hasAvailable = Object.values(stocks).some(s => !s.order?.orderId && !s.isReserved);
              await updateDoc(doc(db, "kits", item.id), { 
                [`stocks.${item.stockKey}.isReserved`]: false, 
                [`stocks.${item.stockKey}.reservedBy`] : null, 
                [`stocks.${item.stockKey}.reservedAt`]: null, 
                [`stocks.${item.stockKey}.availableAt`]: serverTimestamp(),
                [`stocks.${item.stockKey}.reservationType`]: deleteField(),
                hasAvailableStock: hasAvailable,
                lastAvailableAt: serverTimestamp(),
                lastUpdated: serverTimestamp()
              });
            }
          } else {
            await deleteDoc(doc(db, 'users', user.uid, 'basket', basketId));
          }

          try {
            await removeReleasedOffersForRemovedItem(item, isAdminContext);
          } catch (error) {
            console.error('SG LOG: Failed to remove released offer after removing item:', error);
          }
        } catch (error) {
          console.error("SG LOG: Failed to remove basket item:", error);
          set({ [field]: currentList, toastMessage: 'Unable to update basket. Please try again.' });
          throw error;
        }
      },

      createOrder: async (oData) => {
        const { user } = get();
        const ref = doc(collection(db, "orders"));
        const order = { 
          ...oData, 
          userId: oData.userId || user?.uid || null, 
          id: ref.id, 
          createdAt: oData.createdAt || serverTimestamp(), 
          lastUpdated: serverTimestamp() 
        };
        
        // Sanitize object: remove undefined values
        Object.keys(order).forEach(key => order[key] === undefined && delete order[key]);
        
        console.log("SG DEBUG: Sanitized order object:", order);
        await setDoc(ref, order);
        return ref.id;
      },

      updateOrderStatus: async (id, status) => {
        const updateData = { status, lastUpdated: serverTimestamp() };
        if (status === 'Cancelled') {
          updateData.cancelledAt = serverTimestamp();
        } else if (status === 'Completed') {
          updateData.completedAt = serverTimestamp();
        }
        await updateDoc(doc(db, "orders", id), updateData);
      },

      updateOrderDetails: async (orderDocId, patch) => {
        const updateData = {
          ...patch,
          lastUpdated: serverTimestamp()
        };
        if (patch.status === 'Cancelled') {
          updateData.cancelledAt = serverTimestamp();
        } else if (patch.status === 'Completed') {
          updateData.completedAt = serverTimestamp();
        }
        await updateDoc(doc(db, "orders", orderDocId), updateData);
      },

      confirmOrderPayment: async (orderDocId, amount) => {
        const orderRef = doc(db, "orders", orderDocId);
        const snap = await getDoc(orderRef);
        if (!snap.exists()) return;
        const currentPaid = Number(snap.data().buyerPaid) || 0;
        await updateDoc(orderRef, {
          buyerPaid: currentPaid + Number(amount),
          lastUpdated: serverTimestamp()
        });
      },

      uploadReceipt: async (orderDocId, receiptUrl) => {
        const ids = Array.isArray(orderDocId) ? orderDocId : [orderDocId];
        for (const id of ids) {
          await updateDoc(doc(db, "orders", id), {
            receipt: receiptUrl,
            status: 'Validating',
            cancellationTimerStartedAt: deleteField(),
            lastUpdated: serverTimestamp()
          });
        }
      },

      cancelOrder: async (id) => {
        const { kits, orders } = get();
        let order = (orders || []).find(o => o.id === id);
        if (!order) {
          try {
            const snap = await getDoc(doc(db, "orders", id));
            if (snap.exists()) {
              order = { id: snap.id, ...snap.data() };
            }
          } catch (err) {
            console.error("SG LOG: Error fetching order in cancelOrder:", err);
          }
        }

        if (order) {
          await updateDoc(doc(db, "orders", id), {
            status: 'Cancelled',
            cancelledAt: serverTimestamp(),
            lastUpdated: serverTimestamp()
          });
        }

        if (order) {
          await releaseOrderStocks(id, order, kits);
        }
      },

      cleanUpCancelledOrders: async () => {
        const { user, isAdmin, kits } = get();
        if (!user) return;

        try {
          const buildStatusQuery = (status) => isAdmin
            ? query(collection(db, "orders"), where("status", "==", status))
            : query(collection(db, "orders"), where("userId", "==", user.uid), where("status", "==", status));

          const [cancelledSnap, completedSnap] = await Promise.all([
            getDocs(buildStatusQuery("Cancelled")),
            getDocs(buildStatusQuery("Completed"))
          ]);
          const now = Date.now();
          const seen = new Set();
          const docs = [...cancelledSnap.docs, ...completedSnap.docs].filter(orderDoc => {
            if (seen.has(orderDoc.id)) return false;
            seen.add(orderDoc.id);
            return true;
          });

          for (const orderDoc of docs) {
            const o = { id: orderDoc.id, ...orderDoc.data() };
            if (o.isMaintenanceOrder && o.status === 'Completed') {
              const completedTime = o.completedAt 
                ? (o.completedAt.seconds ? o.completedAt.seconds * 1000 : new Date(o.completedAt).getTime())
                : o.cancelledAt
                  ? (o.cancelledAt.seconds ? o.cancelledAt.seconds * 1000 : new Date(o.cancelledAt).getTime())
                  : o.lastUpdated
                    ? (o.lastUpdated.seconds ? o.lastUpdated.seconds * 1000 : new Date(o.lastUpdated).getTime())
                    : o.createdAt
                      ? (o.createdAt.seconds ? o.createdAt.seconds * 1000 : new Date(o.createdAt).getTime())
                      : null;

              if (completedTime && (now - completedTime >= 60000)) {
                console.log(`SG LOG: Auto-deleting invalid ${o.status} order ${o.orderId || o.id}`);
                await deleteDoc(doc(db, "orders", o.id));
                await releaseOrderStocks(o.id, o, kits);
              }
              continue;
            }

            if (o.status === 'Cancelled') {
              // Release first so a failed inventory write leaves the cancelled
              // record available for the next cleanup attempt.
              await releaseOrderStocks(o.id, o, kits);

              const cancelledTime = getOrderTimestampMs(o.cancelledAt || o.lastUpdated || o.createdAt);
              if (isAdmin && cancelledTime && (now - cancelledTime >= CANCELLED_ORDER_DELETE_WINDOW_MS)) {
                console.log(`SG LOG: Auto-deleting expired cancelled order ${o.orderId || o.id}`);
                await deleteDoc(doc(db, 'orders', o.id));
              }
            }
          }
        } catch (err) {
          console.error("SG LOG: Error cleaning up cancelled orders:", err);
        }
      },

      createDummyUser: async (name) => {
        const dummyId = `dummy_${Date.now()}`;
        await setDoc(doc(db, 'users', dummyId), {
          uid: dummyId,
          displayName: name.toUpperCase(),
          role: 'customer',
          createdAt: new Date().toISOString()
        });
        return dummyId;
      },

      assignStockToOrder: async (kitId, stockKey, orderId, options) => {
        const kitRef = doc(db, 'kits', kitId);
        const kitSnap = await getDoc(kitRef);
        if (kitSnap.exists()) {
          const kit = kitSnap.data();
          const stocks = { ...kit.stocks };
          if (stocks[stockKey]) {
            stocks[stockKey].order = { orderId, ...options };
            stocks[stockKey].isReserved = true;
          }
          const hasAvailable = Object.values(stocks).some(s => !s.order?.orderId && !s.isReserved);
          await updateDoc(kitRef, {
            [`stocks.${stockKey}.order`]: {
              orderId,
              ...options
            },
            [`stocks.${stockKey}.isReserved`]: true,
            [`stocks.${stockKey}.reservedAt`]: serverTimestamp(),
            hasAvailableStock: hasAvailable
          });
        } else {
          await updateDoc(kitRef, {
            [`stocks.${stockKey}.order`]: {
              orderId,
              ...options
            },
            [`stocks.${stockKey}.isReserved`]: true,
            [`stocks.${stockKey}.reservedAt`]: serverTimestamp()
          });
        }
      },

      reserveStockForCheckout: async (kitId, stockKey, uid, options = {}) => {
        const kitRef = doc(db, "kits", kitId);
        let allocation = null;

        await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(kitRef);
          if (!snap.exists()) return;

          const data = snap.data();
          const stockEntries = Object.entries(data.stocks || {});
          const requestedStock = stockKey ? data.stocks?.[stockKey] : null;
          let acceptedOffer = null;

          if (options.offerId) {
            const offerSnap = await transaction.get(doc(db, 'hunts', options.offerId));
            acceptedOffer = offerSnap.exists() ? offerSnap.data() : null;
          }

          const offerExpiresAt = acceptedOffer?.offerExpiresAt
            ? new Date(acceptedOffer.offerExpiresAt).getTime()
            : 0;
          const canUseAcceptedOffer = Boolean(
            options.allowAcceptedOffer
            && acceptedOffer?.uid === uid
            && acceptedOffer?.kitId === kitId
            && acceptedOffer?.status === 'released'
            && acceptedOffer?.releasedStockKey === stockKey
            && offerExpiresAt > Date.now()
          );

          // An accepted offer is tied to one released stock variant. Never
          // silently move that discounted offer onto another stock item.
          if (options.allowAcceptedOffer && options.offerId && !canUseAcceptedOffer) return;
          const requestedIsAdminShelfStock = Boolean(
            options.allowAdminShelf
            && requestedStock?.isReserved
            && requestedStock.reservationType === 'admin'
            && !requestedStock.order?.orderId
          );
          const requestedIsOwnReservation = Boolean(
            requestedStock
            && requestedStock.isReserved
            && requestedStock.reservedBy === uid
            && !requestedStock.order?.orderId
          );

          let selectedEntry = null;
          let usedAdminShelfStock = false;

          if (canUseAcceptedOffer || requestedIsAdminShelfStock || requestedIsOwnReservation) {
            selectedEntry = [stockKey, requestedStock];
            usedAdminShelfStock = requestedIsAdminShelfStock;
          } else {
            const source = options.stockSource || (requestedStock ? getStockSource(requestedStock) : '');
            const availableEntries = stockEntries
              .filter(([, stock]) => (
                !stock?.order?.orderId
                && !stock?.isReserved
                && stockMatchesSource(stock, source)
              ))
              .sort(compareCustomerStockEntries);
            selectedEntry = availableEntries[0] || null;

            // Deal items may consume an admin-held shelf stock only after all
            // ordinary customer-available stocks have been exhausted.
            if (!selectedEntry && options.allowAdminShelf) {
              const adminShelfEntries = stockEntries
                .filter(([, stock]) => (
                  !stock?.order?.orderId
                  && stock?.isReserved
                  && stock?.reservationType === 'admin'
                  && stockMatchesSource(stock, source)
                ))
                .sort(compareCustomerStockEntries);
              selectedEntry = adminShelfEntries[0] || null;
              usedAdminShelfStock = Boolean(selectedEntry);
            }
          }

          if (!selectedEntry?.[0] || !selectedEntry[1]) return;

          const [allocatedStockKey, allocatedStock] = selectedEntry;
          const nextStocks = {
            ...data.stocks,
            [allocatedStockKey]: {
              ...allocatedStock,
              isReserved: true,
              reservedBy: uid
            }
          };
          const hasAvailable = Object.values(nextStocks).some(stock => (
            !stock?.order?.orderId && !stock?.isReserved
          ));

          transaction.update(kitRef, {
            [`stocks.${allocatedStockKey}.isReserved`]: true,
            [`stocks.${allocatedStockKey}.reservedBy`]: uid,
            [`stocks.${allocatedStockKey}.reservedAt`]: serverTimestamp(),
            ...((canUseAcceptedOffer || usedAdminShelfStock)
              ? { [`stocks.${allocatedStockKey}.reservationType`]: deleteField() }
              : {}),
            lastUpdated: serverTimestamp(),
            hasAvailableStock: hasAvailable
          });

          allocation = {
            success: true,
            stockKey: allocatedStockKey,
            stock: {
              ...allocatedStock,
              isReserved: true,
              reservedBy: uid
            },
            usedAdminShelfStock,
            usedAcceptedOffer: canUseAcceptedOffer
          };
        });

        return allocation || { success: false };
      },

      publishBlueprint: async (pData) => {
        const { user } = get();
        const cleanProjectData = removeUndefinedValues(pData || {});
        const blueprintData = {
          ...cleanProjectData,
          createdAt: serverTimestamp(),
          publishedBy: user?.uid || null,
          canAddToBasket: cleanProjectData.canAddToBasket !== false,
          isPublished: true
        };
        await addDoc(collection(db, 'blueprints'), blueprintData);
      },
      updateBlueprint: async (blueprintId, pData) => {
        const { user } = get();
        if (!blueprintId) throw new Error('Missing blueprint id.');
        const cleanProjectData = removeUndefinedValues(pData || {});
        const blueprintData = {
          ...cleanProjectData,
          id: blueprintId,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid || null,
          canAddToBasket: pData.canAddToBasket !== false,
          isPublished: true
        };
        await setDoc(doc(db, 'blueprints', blueprintId), blueprintData, { merge: true });
        set((state) => ({
          blueprints: (state.blueprints || []).map((project) => project.id === blueprintId
            ? {
                ...project,
                ...cleanProjectData,
                updatedAt: new Date().toISOString(),
                updatedBy: user?.uid || null,
                canAddToBasket: pData.canAddToBasket !== false,
                isPublished: true
              }
            : project)
        }));
      },
      deleteBlueprint: async (blueprintId) => {
        if (!blueprintId) throw new Error('Missing blueprint id.');
        await deleteDoc(doc(db, 'blueprints', blueprintId));
        set((state) => ({
          blueprints: (state.blueprints || []).filter((project) => project.id !== blueprintId)
        }));
      },
      addProjectToVault: async (pData) => {
        const { user, projectVault, orders } = get();

        // Calculate limit: 3 + number of completed 3D print projects
        const completedProjectsCount = (orders || []).filter(o => 
          o.status?.toLowerCase() === 'completed' && 
          o.items?.some(item => item.type === 'project')
        ).length;
        
        const limit = 3 + completedProjectsCount;
        const savedCount = (projectVault || []).length;

        if (savedCount >= limit) {
          throw new Error(`You have reached the maximum of ${limit} saved estimates. Complete more projects to unlock more slots.`);
        }

        const newVault = [{ vaultId: `V-${Date.now()}`, ...pData, status: 'Draft', createdAt: new Date().toISOString() }, ...(projectVault || [])];
        if (!user) {
          localStorage.setItem('sg_guest_project_vault', JSON.stringify(newVault));
          set({ projectVault: newVault });
          return;
        }
        // FIXED: I-save sa projectVaults/{uid} imbes na sa user doc para iwas sa 1MB Firestore limit
        await setDoc(doc(db, 'projectVaults', user.uid), { items: newVault, uid: user.uid }, { merge: true });
        set({ projectVault: newVault });
      },

      removeFromVault: async (vId) => {
        const { user, projectVault } = get();
        const newVault = (projectVault || []).filter(p => p.vaultId !== vId);
        if (!user) {
          localStorage.setItem('sg_guest_project_vault', JSON.stringify(newVault));
          set({ projectVault: newVault });
          return;
        }
        // FIXED: I-update sa projectVaults/{uid} imbes na sa user doc
        await setDoc(doc(db, 'projectVaults', user.uid), { items: newVault, uid: user.uid }, { merge: true });
        set({ projectVault: newVault });
      },

      updateProjectInVault: async (vId, pData) => {
        const { user, projectVault } = get();
        if (!vId) throw new Error('Missing vault project id.');
        if (!user) {
          const newVault = (projectVault || []).map((project) => (
            project.vaultId === vId
              ? { ...project, ...pData, vaultId: vId, status: project.status || 'Draft', updatedAt: new Date().toISOString() }
              : project
          ));
          localStorage.setItem('sg_guest_project_vault', JSON.stringify(newVault));
          set({ projectVault: newVault });
          return;
        }

        // Read and write the vault in a transaction. Link blur and license
        // checkbox updates can happen back-to-back; rewriting a stale local
        // array allowed the second update to erase fields saved by the first.
        const vaultRef = doc(db, 'projectVaults', user.uid);
        const newVault = await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(vaultRef);
          const storedItems = snapshot.exists() && Array.isArray(snapshot.data()?.items)
            ? snapshot.data().items
            : (projectVault || []);
          const updatedVault = storedItems.map((project) => (
            project.vaultId === vId
              ? { ...project, ...pData, vaultId: vId, status: project.status || 'Draft', updatedAt: new Date().toISOString() }
              : project
          ));
          transaction.set(vaultRef, { items: updatedVault, uid: user.uid }, { merge: true });
          return updatedVault;
        });
        set({ projectVault: newVault });
      },

      decrementProjectQuantity: async (basketId) => {
        const { user, basket, shelf, isAdmin, isAdminView, guestBasket } = get();
        const field = (isAdmin && isAdminView) ? 'shelf' : 'basket';
        const list = (isAdmin && isAdminView) ? (shelf || []) : (user ? (basket || []) : (guestBasket || []));
        
        const item = list.find(i => i.basketId === basketId);
        if (!item || item.type !== 'project') return;

        if ((item.quantity || 1) > 1) {
            const updatedList = list.map(i => 
                i.basketId === basketId 
                ? { ...i, quantity: (i.quantity || 1) - 1 }
                : i
            );
            
            if (!user && !isAdminView) {
                localStorage.setItem('sg_guest_basket', JSON.stringify(updatedList));
                set({ guestBasket: updatedList });
            } else {
                set({ [field]: updatedList });
                if (user) {
                  try {
                    if (isAdmin && isAdminView) {
                        await updateDoc(doc(db, 'shelf', basketId), { quantity: (item.quantity || 1) - 1 });
                    } else {
                        await updateDoc(doc(db, 'users', user.uid, 'basket', basketId), { quantity: (item.quantity || 1) - 1 });
                    }
                  } catch (error) {
                    console.error("SG LOG: Failed to update basket quantity:", error);
                    set({ [field]: list, toastMessage: 'Unable to update basket. Please try again.' });
                    throw error;
                  }
                }
            }
        } else {
            // Quantity is 1, so remove entirely
            await get().removeFromBasket(basketId);
        }
      },

      migrateKitImages: async () => {
        const { setToastMessage } = get();
        console.log("SG LOG: migrateKitImages called");
        if (!window.confirm("Deduplicate images for all kits in Firestore? This will replace duplicate base64 image copies in flat fields with image IDs to save storage.")) {
          return;
        }
        setToastMessage("Starting image deduplication migration...");
        try {
          const snap = await getDocs(collection(db, "kits"));
          console.log(`SG LOG: Found ${snap.docs.length} kits in Firestore.`);
          let updatedCount = 0;

          for (const kitDoc of snap.docs) {
            const kit = { id: kitDoc.id, ...kitDoc.data() };
            let hasChanges = false;
            let logMsg = `SG LOG: Processing kit: ${kit.name || kit.id}`;
            const detailLogs = [];
            
            const images = Array.isArray(kit.images) ? [...kit.images] : [];
            let imageField = kit.image || '';

            if (imageField.startsWith('data:')) {
              let match = images.find(img => img.url === imageField);
              if (!match) {
                const newId = `master_migrated_${Date.now()}`;
                match = {
                  id: newId,
                  url: imageField,
                  type: 'BOX ART',
                  isGridImage: true
                };
                images.push(match);
              }
              imageField = match.id;
              hasChanges = true;
              detailLogs.push(`  -> Migrated master image to ID: ${match.id}`);
            }

            const stocks = kit.stocks ? { ...kit.stocks } : {};
            for (const [stockKey, stock] of Object.entries(stocks)) {
              let stockChanges = false;
              const stockImages = Array.isArray(stock.stockImages) ? [...stock.stockImages] : [];
              let boxImage = stock.boxImage || '';
              let kitImage = stock.kitImage || '';

              if (boxImage.startsWith('data:')) {
                let match = stockImages.find(img => img.url === boxImage);
                if (!match) {
                  const newId = `stock_box_migrated_${Date.now()}`;
                  match = {
                    id: newId,
                    url: boxImage,
                    type: 'BOX CONDITION'
                  };
                  stockImages.push(match);
                }
                boxImage = match.id;
                stockChanges = true;
                detailLogs.push(`  -> Stock [${stockKey}] Box image migrated to ID: ${match.id}`);
              }

              if (kitImage.startsWith('data:')) {
                let match = stockImages.find(img => img.url === kitImage);
                if (!match) {
                  const newId = `stock_kit_migrated_${Date.now()}`;
                  match = {
                    id: newId,
                    url: kitImage,
                    type: 'KIT CONDITION'
                  };
                  stockImages.push(match);
                }
                kitImage = match.id;
                stockChanges = true;
                detailLogs.push(`  -> Stock [${stockKey}] Kit image migrated to ID: ${match.id}`);
              }

              if (stockChanges) {
                stocks[stockKey] = {
                  ...stock,
                  stockImages,
                  boxImage,
                  kitImage
                };
                hasChanges = true;
              }
            }

            if (hasChanges) {
              console.log(logMsg);
              detailLogs.forEach(line => console.log(line));
              const kitRef = doc(db, "kits", kit.id);
              await updateDoc(kitRef, {
                image: imageField,
                images: images,
                stocks: stocks,
                lastUpdated: serverTimestamp()
              });
              console.log(`  -> Successfully updated kit doc in Firestore.`);
              updatedCount++;
            }
          }

          console.log(`SG LOG: Image deduplication complete. Updated ${updatedCount} of ${snap.docs.length} kits.`);
          setToastMessage(`Migration successful! Deduplicated images in ${updatedCount} kits.`);
        } catch (error) {
          console.error("SG LOG: Migration error:", error);
          setToastMessage("Migration failed. Check console for logs.");
        }
      },

      migrateKitsAvailabilityField: async () => {
        console.log("SG LOG: migrateKitsAvailabilityField called");
        try {
          const snap = await getDocs(collection(db, "kits"));
          const batch = writeBatch(db);
          let count = 0;
          snap.forEach(docSnap => {
            const data = docSnap.data();
            const hasAvailable = Object.values(data.stocks || {}).some(s => !s.order?.orderId && !s.isReserved);
            batch.update(docSnap.ref, { hasAvailableStock: hasAvailable });
            count++;
          });
          if (count > 0) {
            await batch.commit();
            console.log(`SG LOG: Successfully migrated ${count} kits availability field.`);
          }
        } catch (err) {
          console.error("SG LOG: Error migrating kits availability field:", err);
        }
      },

      syncMutuallyExclusiveDeals: async () => {
        const { kits, deals, user } = get();
        if (!deals || !kits || !user) return;

        const activeExclusions = deals.filter(d => d.isActive && d.type === 'mutually_exclusive');
        if (activeExclusions.length === 0) return;

        const batch = writeBatch(db);
        let hasChanges = false;
        const fees = getCheckoutPaymentFees(get().shippingSettings) || { handlingFee: 0, installmentFee: 0, transferFee: 0 };
        const handlingFee = fees.handlingFee || 0;
        const installmentFee = fees.installmentFee || 0;
        const transferFee = fees.transferFee || 0;

        for (const deal of activeExclusions) {
          if (!deal.kitIds || deal.kitIds.length < 2) continue;

          const bandaiKitIds = deal.mutuallyExclusiveGroups?.bandai || deal.bandaiKitIds || [];
          const bootlegKitIds = deal.mutuallyExclusiveGroups?.bootleg || deal.bootlegKitIds || [];
          const configuredPairs = (deal.mutuallyExclusivePairs || []).filter(pair => pair?.bandaiId && pair?.bootlegId);
          const pairGroups = configuredPairs.length > 0
            ? configuredPairs.map(pair => [[pair.bandaiId], [pair.bootlegId]])
            : [bandaiKitIds.length > 0 && bootlegKitIds.length > 0
              ? [bandaiKitIds, bootlegKitIds]
              : [[deal.kitIds[0]], [deal.kitIds[1]]]];

          for (const groups of pairGroups) {
            const groupedKits = groups.map(groupIds => groupIds
              .map(kitId => kits.find(kit => kit.id === kitId))
              .filter(Boolean));
            if (groupedKits.some(group => group.length === 0)) continue;

            // A group is considered taken when any kit in that group has a
            // customer reservation or an attached order. The opposite group is
            // then kept off the shelf until the taken group becomes available.
            const groupIsReserved = group => group.some(kit => Object.values(kit.stocks || {}).some(
              stock => (stock.isReserved && stock.reservationType !== 'admin') || stock.order?.orderId
            ));
            const isFirstGroupReserved = groupIsReserved(groupedKits[0]);
            const isSecondGroupReserved = groupIsReserved(groupedKits[1]);

          // Helper to keep a kit to shelf
          const keepToShelf = (targetKit) => {
            const availableStocks = Object.entries(targetKit.stocks || {}).filter(
              ([, s]) => !s.isReserved && !s.order?.orderId
            );
            if (availableStocks.length === 0) return;

            availableStocks.forEach(([key, stock]) => {
              const basketId = `b_kit_me_${deal.id}_${key}`;
              const clean = {
                id: targetKit.id,
                name: (targetKit.name || '').replace(/\s*\(Pre-Order\)\s*$/i, '') + ` (Excluded: ${targetKit.name})`,
                image: targetKit.image || '',
                brand: targetKit.brand || '',
                specs: targetKit.specs || {},
                price: Number(stock.sellPrice || 0) + handlingFee + installmentFee + transferFee,
                costPrice: Number(stock.costPrice || 0),
                sellPrice: Number(stock.sellPrice || 0),
                status: stock.status || 'onhand',
                eta: getStockEta(stock),
                appliedHandlingFee: handlingFee,
                appliedInstallmentFee: installmentFee,
                appliedTransferFee: transferFee,
                stockKey: key,
                type: 'kit',
                basketId,
                minDownpayment: stock.minDownpayment || 0,
                createdAt: new Date().toISOString(),
                reservedByDealId: deal.id
              };
              batch.set(doc(db, 'shelf', basketId), clean);
              batch.update(doc(db, 'kits', targetKit.id), {
                [`stocks.${key}.isReserved`]: true,
                [`stocks.${key}.reservedBy`]: user.uid,
                [`stocks.${key}.reservedAt`]: serverTimestamp(),
                [`stocks.${key}.reservationType`]: 'admin',
                [`stocks.${key}.reservedByDealId`]: deal.id,
                lastUpdated: serverTimestamp()
              });
              hasChanges = true;
            });
          };

          // Helper to release a kit from shelf
          const releaseFromShelf = (targetKit) => {
            // Find all stocks reserved by this deal
            const dealReservedStocks = Object.entries(targetKit.stocks || {}).filter(
              ([, s]) => s.reservedByDealId === deal.id
            );
            if (dealReservedStocks.length === 0) return;

            dealReservedStocks.forEach(([key]) => {
              const basketId = `b_kit_me_${deal.id}_${key}`;
              batch.delete(doc(db, 'shelf', basketId));
              batch.update(doc(db, 'kits', targetKit.id), {
                [`stocks.${key}.isReserved`]: false,
                [`stocks.${key}.reservedBy`]: null,
                [`stocks.${key}.reservedAt`]: null,
                [`stocks.${key}.availableAt`]: serverTimestamp(),
                [`stocks.${key}.reservationType`]: deleteField(),
                [`stocks.${key}.reservedByDealId`]: deleteField(),
                lastAvailableAt: serverTimestamp(),
                lastUpdated: serverTimestamp()
              });
              hasChanges = true;
            });
          };

            if (isFirstGroupReserved && !isSecondGroupReserved) {
              // A BANDAI kit is taken, so its BOOTLEG partner stays on shelf.
              groupedKits[1].forEach(kit => keepToShelf(kit));
            } else if (isSecondGroupReserved && !isFirstGroupReserved) {
              // A BOOTLEG kit is taken, so its BANDAI partner stays on shelf.
              groupedKits[0].forEach(kit => keepToShelf(kit));
            } else if (!isFirstGroupReserved && !isSecondGroupReserved) {
              // Both partners are free, release reservations created by this deal.
              groupedKits.flat().forEach(kit => releaseFromShelf(kit));
            }
          }
        }

        if (hasChanges) {
          console.log("SG LOG: Mutually exclusive deal auto-syncing Firestore updates...");
          try {
            await batch.commit();
          } catch (err) {
            console.error("SG LOG: Error syncing mutually exclusive deals:", err);
          }
        }
      },

      scheduleBundleDealRestart: (restartAt) => {
        const existingTimer = get()._bundleDealRestartTimer;
        if (existingTimer) clearTimeout(existingTimer);

        if (!Number.isFinite(restartAt)) {
          set({ _bundleDealRestartTimer: null });
          return;
        }

        // setTimeout is capped by the browser's maximum delay. A long-dated
        // deal will be rescheduled by the next timer callback if necessary.
        const maxTimeout = 2_147_483_647;
        const delay = Math.min(maxTimeout, Math.max(0, restartAt - Date.now()));
        const timer = setTimeout(() => {
          if (get()._bundleDealRestartTimer !== timer) return;
          set({ _bundleDealRestartTimer: null });
          void get().syncAllDeals();
        }, delay);

        set({ _bundleDealRestartTimer: timer });
      },

      syncBundleDealsFulfillment: async () => {
        const { kits, deals, user } = get();
        if (!deals || !kits || !user) return;

        const stockMatchesDealSource = (stock, source = 'onhand') => {
          const status = String(stock?.status || '').toLowerCase();
          const isPreOrder = status.includes('pre') || status.includes('batch');
          return source === 'preorder' ? isPreOrder : !isPreOrder;
        };

        const isBundlePurchasableStock = (stock, source = 'onhand') => {
          if (!stock || stock.order?.orderId || !stockMatchesDealSource(stock, source)) return false;
          return !stock.isReserved;
        };

        const bundleDeals = deals.filter(d => (
          d.type === 'bundle'
          || d.type === 'bundle_only'
          || d.type === 'bundle_discount'
          || d.type === 'clearance'
        ));
        if (bundleDeals.length === 0) {
          get().scheduleBundleDealRestart(Number.NaN);
          return;
        }

        const now = Date.now();
        let nextRestartAt = Number.POSITIVE_INFINITY;

        for (const deal of bundleDeals) {
          const dealKitIds = deal.type === 'clearance' && deal.clearanceKitIds?.length
            ? deal.clearanceKitIds
            : (deal.kitIds || []);
          if (dealKitIds.length === 0) continue;

          const isFulfillable = dealKitIds.every(dealKitId => {
            const dealKit = kits.find(k => k.id === dealKitId);
            if (!dealKit) return false;
            const stocks = Object.values(dealKit.stocks || {});
            return stocks.some(s => isBundlePurchasableStock(s, deal.stockSource || 'onhand'));
          });

          const currentActive = deal.isActive !== false;
          const validUntilMs = deal.type === 'clearance' ? 0 : getDealDateMillis(deal.validUntil);
          const isExpired = validUntilMs > 0 && validUntilMs <= now;
          const restartAt = validUntilMs > 0
            ? validUntilMs + getBundleDealReactivationDelayMs(deal)
            : 0;

          if (restartAt > now) {
            nextRestartAt = Math.min(nextRestartAt, restartAt);
          }

          if (isExpired && now < restartAt) {
            // Keep the expired deal inactive during the configured cooldown.
            // The timer below retries at the end of that cooldown even when
            // no stock document changes in the meantime.
            if (currentActive) {
              console.log(`SG LOG: Auto-deactivating expired deal ${deal.name} (${deal.id}) - waiting for restart window`);
              try {
                await updateDoc(doc(db, "deals", deal.id), {
                  isActive: false,
                  lastUpdated: serverTimestamp()
                });
              } catch (err) {
                console.error("SG LOG: Error auto-deactivating expired deal:", err);
              }
            }
          } else if (isExpired && isFulfillable) {
            // An expired bundle gets a fresh configured validity window only
            // after the configured cooldown has elapsed and every included
            // kit can be allocated.
            const restartedAt = new Date(now);
            const validityDurationMs = getBundleDealValidityMs(deal);
            const restartedUntil = new Date(now + validityDurationMs);
            const validityDurationDays = Math.max(1, Math.round(validityDurationMs / (24 * 60 * 60 * 1000)));
            console.log(`SG LOG: Restarting expired deal ${deal.name} (${deal.id}) - stocks available`);
            try {
              await updateDoc(doc(db, "deals", deal.id), {
                isActive: true,
                validFrom: formatDealDateValue(restartedAt),
                validUntil: formatDealDateValue(restartedUntil),
                validityDays: validityDurationDays,
                lastUpdated: serverTimestamp()
              });
            } catch (err) {
              console.error("SG LOG: Error restarting expired deal:", err);
            }
          } else if (isExpired && currentActive) {
            // Do not leave an expired deal active when it cannot currently be
            // fulfilled. A later kit snapshot can restart it once stock is
            // allocatable again.
            console.log(`SG LOG: Auto-deactivating expired deal ${deal.name} (${deal.id}) - stock(s) unavailable`);
            try {
              await updateDoc(doc(db, "deals", deal.id), {
                isActive: false,
                lastUpdated: serverTimestamp()
              });
            } catch (err) {
              console.error("SG LOG: Error auto-deactivating expired deal:", err);
            }
          } else if (isFulfillable && !currentActive) {
            console.log(`SG LOG: Auto-activating deal ${deal.name} (${deal.id}) - stocks available`);
            try {
              await updateDoc(doc(db, "deals", deal.id), { isActive: true, lastUpdated: serverTimestamp() });
            } catch (err) {
              console.error("SG LOG: Error auto-activating deal:", err);
            }
          } else if (!isFulfillable && currentActive) {
            console.log(`SG LOG: Auto-deactivating deal ${deal.name} (${deal.id}) - stock(s) unavailable`);
            try {
              await updateDoc(doc(db, "deals", deal.id), { isActive: false, lastUpdated: serverTimestamp() });
            } catch (err) {
              console.error("SG LOG: Error auto-deactivating deal:", err);
            }
          }
        }

        get().scheduleBundleDealRestart(nextRestartAt);
      },

      syncAllDeals: async () => {
        if (!get().isAdmin) return;
        const activeSync = get()._syncAllDealsPromise;
        if (activeSync) return activeSync;

        const syncPromise = Promise.allSettled([
          get().syncMutuallyExclusiveDeals(),
          get().syncBundleDealsFulfillment()
        ]);
        set({ _syncAllDealsPromise: syncPromise });

        try {
          await syncPromise;
        } finally {
          if (get()._syncAllDealsPromise === syncPromise) {
            set({ _syncAllDealsPromise: null });
          }
        }
      },

      addProjectToBasket: async (pData) => {
        if (pData?.canAddToBasket === false) {
          throw new Error('This print is public for reference only and cannot be added to basket.');
        }
        const { user, basket, shelf, isAdmin, isAdminView, guestBasket } = get();
        
        const field = (isAdmin && isAdminView) ? 'shelf' : 'basket';
        const list = (isAdmin && isAdminView) ? (shelf || []) : (user ? (basket || []) : (guestBasket || []));
        
        // Helper to compare projects
        const areProjectsEqual = (p1, p2) => {
            const getId = (p) => `${p.projectData?.projectName || ''}_${p.projectData?.method?.name || ''}`;
            return getId(p1) === getId(p2);
        };

        const existingProject = list.find(item => item.type === 'project' && areProjectsEqual(item, { projectData: pData }));

        if (existingProject) {
            // Increment quantity if exists
            const updatedList = list.map(item => 
                item.basketId === existingProject.basketId 
                ? { ...item, quantity: (item.quantity || 1) + 1 }
                : item
            );
            
            if (!user && !isAdminView) {
                localStorage.setItem('sg_guest_basket', JSON.stringify(updatedList));
                set({ guestBasket: updatedList });
            } else {
                set({ [field]: updatedList });
                if (user) {
                    if (isAdmin && isAdminView) {
                        await updateDoc(doc(db, 'shelf', existingProject.basketId), { quantity: (existingProject.quantity || 1) + 1 });
                    } else {
                        await updateDoc(doc(db, 'users', user.uid, 'basket', existingProject.basketId), { quantity: (existingProject.quantity || 1) + 1 });
                    }
                }
            }
            return;
        }
        
        const bId = `b_proj_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const { handlingFee: hFee, installmentFee: iFee, transferFee: tFee } = getCheckoutPaymentFees(get().shippingSettings);
        const projectGrandTotal = parseFloat(String(pData.totals?.total || 0).replace(/,/g, '')) || 0;
        const projectBasePrice = parseFloat(String(pData.totals?.basePrice || 0).replace(/,/g, '')) || Math.max(0, projectGrandTotal - hFee - iFee - tFee);
        const projectDownpayment = parseFloat(String(pData.totals?.dp || 0).replace(/,/g, '')) || 0;

        let name = `Custom Print: ${pData.projectName || pData.method?.name || 'Project'}`;
        if (pData.selectedDesignService) {
          const serviceId = pData.selectedDesignService;
          const serviceRates = (get().rates || {})['design-services'] || {};
          const serviceData = serviceRates[serviceId] || {};
          let label = serviceData.name || '';
          if (!label) {
            if (serviceId === '3d-cad') label = '3D CAD';
            else if (serviceId === '3d-sculpt') label = '3D Sculpting';
            else {
              label = serviceId.split('-').map(word => {
                if (word.toLowerCase() === 'cad') return 'CAD';
                return word.charAt(0).toUpperCase() + word.slice(1);
              }).join(' ');
            }
          }
          name += ` (w/ ${label})`;
        }

        const newItem = {
          id: `project_${bId}`,
          basketId: bId,
          type: 'project',
          quantity: 1,
          isFinalized: pData.method?.name === '3MF',
          gdriveLink: pData.gdriveLink || '',
          projectData: { ...pData, sellPrice: projectBasePrice, displayPrice: projectGrandTotal, minDownpayment: projectDownpayment },
          name,
          price: projectGrandTotal,
          appliedHandlingFee: hFee,
          appliedInstallmentFee: iFee,
          appliedTransferFee: tFee,
          minDownpayment: projectDownpayment,
          createdAt: new Date().toISOString()
        };
        
        if (!user) {
          const newGuestBasket = [...(guestBasket || []), newItem].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          localStorage.setItem('sg_guest_basket', JSON.stringify(newGuestBasket));
          set({ guestBasket: newGuestBasket });
          return;
        }
        set({ [field]: [...list, newItem] });
        try {
          if (isAdmin && isAdminView) {
            await setDoc(doc(db, 'shelf', bId), newItem);
          } else {
            await setDoc(doc(db, 'users', user.uid, 'basket', bId), newItem);
          }
        } catch (e) {
          set({ [field]: list });
          throw e;
        }
      }
    }),
    {
      name: 'sg-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        garageInfo: state.garageInfo,
        rates: state.rates,
        isAdminView: state.isAdminView,
        guestBasket: state.guestBasket,
      }),
    }
  )
);
