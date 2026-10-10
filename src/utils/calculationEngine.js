import { getPrinterFeeders, calculateItemAdjustedPrintTime, normalizeFilamentType } from './printerCompatibility';

export const DEFAULT_SPOOL_WEIGHT = 1000;

export const formatCurrency = (value) => Number(value || 0).toFixed(2);
export const formatMinutes = (value) => {
  const total = Math.round(Number(value) || 0);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};
export const formatWeight = (value) => `${Number(value || 0).toFixed(2)}g`;

export const getProjectItemLabel = (projectCase, item) => {
  const is3MF = String(projectCase || '').toUpperCase() === '3MF';
  const prefix = is3MF ? 'Build Plate' : 'Model';
  return `${prefix} ${item?.no || (item?.index + 1) || 1}`;
};

export const firstPositiveNumber = (...values) => {
  const value = values
    .map((candidate) => Number(candidate))
    .find((candidate) => Number.isFinite(candidate) && candidate > 0);
  return value ?? 0;
};

export const getItemWeight = (item) => firstPositiveNumber(
  item?.weight,
  item?.normalizedWeight,
  item?.sliced?.weight,
  item?.volume?.total?.weight
);

export const getItemTime = (item) => firstPositiveNumber(
  item?.time,
  item?.normalizedTime,
  item?.sliced?.time,
  item?.volume?.total?.time
);

export const getItemMaterial = (item) => {
  const nested = item?.material?.material
    || item?.material
    || item?.selectedMaterial
    || item?.filament
    || item?.materials?.[0]?.material
    || item?.materialSlots?.[0]?.material;
  if (!nested) return null;
  return {
    ...nested,
    type: normalizeFilamentType(nested.type),
    id: nested.id ?? item?.material?.materialId ?? item?.materialId ?? 'unknown',
    remaining: parseFloat(nested.remaining || 0),
    price: parseFloat(nested.price || 0),
    weight: parseFloat(nested.weight || DEFAULT_SPOOL_WEIGHT),
    loadTime: parseFloat(nested.loadTime || 0),
    purgeTime: parseFloat(nested.purgeTime || nested.cleanBuffer || 0),
    status: nested.status || 'stock'
  };
};

export const getMaterialColor = (material) => {
  const namedColor = [
    material?.name,
    material?.colorLabel,
    material?.colorName,
    material?.colourName,
    material?.colour
  ].find((value) => value && !/^#?[0-9a-f]{6,8}$/i.test(String(value).trim()));
  if (namedColor) return namedColor;
  return '';
};

export const getMaterialLabel = (material) => {
  return [material?.brand, material?.type, getMaterialColor(material)]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Unknown Material';
};

/**
 * Pure calculation engine for 3D printing project costs.
 * Used by CostBreakdown (UI) and headless recomputation in useStore.
 *
 * @param {Object} params
 * @param {Object} params.data - Project object containing projectDetails, method, extras, etc.
 * @param {Object} [params.activePrinter] - Default or selected active printer
 * @param {Object} [params.dbSettings] - Optional rate overrides
 * @param {Object} [params.storeRates] - Rates collection from Firestore
 * @param {Array} [params.printers] - List of printers from Firestore
 * @param {Array} [params.feeders] - List of feeders from Firestore
 * @param {Array} [params.filamentInventory] - List of filaments from Firestore
 * @param {boolean} [params.isInventoryMode=false]
 * @returns {Object|null} Full calculations breakdown object or null if invalid inputs
 */
export const computeProjectCosts = ({
  data,
  activePrinter,
  dbSettings = {},
  storeRates = {},
  printers = [],
  feeders = [],
  filamentInventory = [],
  isInventoryMode = false
}) => {
  const sourceItems = Array.isArray(data?.projectDetails) ? data.projectDetails : [];
  if (sourceItems.length === 0 || !storeRates || Object.keys(storeRates).length === 0) return null;
  // `included` is intentionally backwards-compatible: legacy records without
  // the field remain included, while an explicit false excludes the item.
  const includedSourceItems = sourceItems.filter((item) => item?.included !== false);
  const includedItemIds = new Set(includedSourceItems.map((item) => String(item?.id)).filter(Boolean));
  const includedAssignmentKeys = new Set();
  const reprintAssignmentKeys = new Set();
  sourceItems.forEach((item, index) => {
    if (item?.included === false) return;
    const itemIsReprint = item?.isReprint === true;
    if (itemIsReprint) {
      [index, item?.id].forEach((key) => {
        if (key !== undefined && key !== null) reprintAssignmentKeys.add(String(key));
      });
    }
    [index, item?.id].forEach((key) => {
      if (key !== undefined && key !== null) includedAssignmentKeys.add(String(key));
    });
    (Array.isArray(item?.productionJobs) ? item.productionJobs : [])
      .filter((job) => job?.included !== false)
      .forEach((job) => {
        [job?.id, job?.parentId, ...(Array.isArray(job?.parentIds) ? job.parentIds.filter((key) => includedItemIds.has(String(key))) : [])].forEach((key) => {
          if (key !== undefined && key !== null) includedAssignmentKeys.add(String(key));
        });
        if (itemIsReprint || job?.isReprint === true) {
          [job?.id, job?.parentId].forEach((key) => {
            if (key !== undefined && key !== null) reprintAssignmentKeys.add(String(key));
          });
        }
      });
  });

  const getCompatibleFeeders = (printer) => getPrinterFeeders(printer, feeders);

  const items = includedSourceItems.map((item, index) => {
    const baseMaterial = getItemMaterial(item);
    const inventoryMatch = (filamentInventory || []).find((f) => String(f.id) === String(baseMaterial?.id));
    const material = baseMaterial ? { ...baseMaterial, ...(inventoryMatch || {}) } : null;
    const materialEntries = Array.isArray(item.materials) && item.materials.length > 0
      ? item.materials
      : Array.isArray(item.materialSlots) && item.materialSlots.length > 0
        ? item.materialSlots
        : [{ materialId: material?.id, material }];
    const normalizedMaterials = materialEntries
      .map((entry) => {
        const entryMaterial = entry?.material || entry;
        const inventory = (filamentInventory || []).find((f) => String(f.id) === String(entryMaterial?.id || entry?.materialId));
        const merged = entryMaterial ? { ...entryMaterial, ...(inventory || {}) } : null;
        if (!merged) return null;
        return {
          ...merged,
          type: normalizeFilamentType(merged.type),
          id: merged.id ?? entry?.materialId,
          materialId: entry?.materialId ?? merged.id,
          shareWeight: Number(entry?.shareWeight || 0),
          remaining: parseFloat(merged.remaining || 0),
          price: parseFloat(merged.price || 0),
          weight: parseFloat(merged.weight || DEFAULT_SPOOL_WEIGHT),
          loadTime: parseFloat(merged.loadTime || 0),
          purgeTime: parseFloat(merged.purgeTime || merged.cleanBuffer || 0),
          status: merged.status || 'stock'
        };
      })
      .filter(Boolean);
    return {
      ...item,
      index,
      itemName: getProjectItemLabel(data?.method?.name, { ...item, index }),
      normalizedWeight: getItemWeight(item),
      normalizedTime: getItemTime(item),
      normalizedMaterial: material,
      normalizedMaterials
    };
  });

  const seenProductionJobs = new Set();
  const validItems = items.flatMap((item) => {
    if (!Array.isArray(item.productionJobs) || item.productionJobs.length === 0) {
      const printer = item.printer || (printers || []).find((p) => String(p.id) === String(item.printerId)) || activePrinter;
      const rawTime = getItemTime(item);
      const itemMats = item.normalizedMaterials?.length ? item.normalizedMaterials : [item.normalizedMaterial].filter(Boolean);
      const { adjustedTime, effectiveAdjustmentPercent, adjustments } = calculateItemAdjustedPrintTime(
        printer,
        { ...item, materialWeights: item.materialWeights, normalizedMaterials: itemMats, normalizedWeight: getItemWeight(item) },
        rawTime
      );
      return [{
        ...item,
        rawTime,
        normalizedTime: adjustedTime,
        effectiveAdjustmentPercent,
        printTimeAdjustmentsApplied: adjustments,
        isReprint: item?.isReprint === true,
        printer,
        printerId: item.printerId || printer?.id
      }];
    }
    const includedJobs = item.productionJobs.filter((job) => job?.included !== false);
    return includedJobs.map((job, jobIndex) => {
      const jobId = String(job.id || `${item.id}-${jobIndex}`);
      if (seenProductionJobs.has(jobId)) return null;
      seenProductionJobs.add(jobId);
      const printer = job.printer || (printers || []).find((p) => String(p.id) === String(job.printerId)) || activePrinter;
      const rawTime = firstPositiveNumber(job.time, item.normalizedTime);
      const jobMaterials = item.normalizedMaterials?.length ? item.normalizedMaterials : [item.normalizedMaterial].filter(Boolean);
      const { adjustedTime, effectiveAdjustmentPercent, adjustments } = calculateItemAdjustedPrintTime(
        printer,
        { ...item, materialWeights: job.materialWeights || item.materialWeights, normalizedMaterials: jobMaterials, normalizedWeight: firstPositiveNumber(job.weight, item.normalizedWeight) },
        rawTime
      );

      return {
        ...item,
        id: job.id,
        parentId: item.id,
        parentIds: job.parentIds || [item.id],
        jobIndex,
        itemName: job.buildPlateNo ? `Build Plate ${job.buildPlateNo}` : `${item.itemName} Part ${job.no || jobIndex + 1}`,
        normalizedWeight: firstPositiveNumber(job.weight, item.normalizedWeight),
        rawTime,
        normalizedTime: adjustedTime,
        effectiveAdjustmentPercent,
        printTimeAdjustmentsApplied: adjustments,
        isReprint: item?.isReprint === true || job?.isReprint === true,
        swapMins: Number(job.swapMins || 0),
        sliced: {
          ...(item.sliced || {}),
          colorSwaps: job.colorSwaps ?? item.sliced?.colorSwaps,
          estimatedColorSwaps: job.estimatedColorSwaps ?? item.sliced?.estimatedColorSwaps,
          swapMins: job.swapMins ?? item.sliced?.swapMins
        },
        printerId: job.printerId,
        printer,
        printerName: job.printerName || [printer?.brand, printer?.model || printer?.name].filter(Boolean).join(' '),
        usesCfs: job.usesCfs === true,
        materialWeights: job.materialWeights || null,
        normalizedMaterial: item.normalizedMaterial,
        normalizedMaterials: item.normalizedMaterials
      };
    }).filter(Boolean);
  }).filter(i => i.normalizedMaterial || i.normalizedMaterials?.length);
  if (validItems.length === 0) return null;

  const matRates = storeRates['material-cost'] || {};
  const laborRates = storeRates['labor-cost'] || {};
  const printRates = storeRates['print-cost'] || {};
  const elecRates = storeRates['electricity-cost'] || {};
  const maintRates = storeRates['maintenance-cost'] || {};
  const extraRates = storeRates['extra-cost'] || {};

  const markupPercent = (parseFloat(printRates.markupRate) || 20);
  const markupMultiplier = 1 + (markupPercent / 100);
  const filamentClientShare = (parseFloat(matRates.clientShareRate) || 0) / 100;
  const extraClientShare = (parseFloat(extraRates.clientShareRate) || 0) / 100;
  const baseElecRate = parseFloat(elecRates.electricityRate) || 14.16;
  const finalElecRate = baseElecRate * (1 + ((parseFloat(elecRates.expectedIncrease) || 0) / 100));

  const supportRemovalTimeRate = parseFloat(laborRates.supportRemovalTimePerPlate);
  const supportRemovalPriceRate = parseFloat(laborRates.supportRemovalRatePerPlate ?? laborRates.supportRemovalRatePerModel);
  const supportRemovalHeatgunPower = parseFloat(elecRates.supportRemovalHeatgunPower);
  const preparationPriceRate = parseFloat(laborRates.preparationRatePerPlate ?? laborRates.preparationRatePerFile);

  const currentRates = {
    ...(dbSettings || {}),
    elecRate: finalElecRate,
    electricityRate: finalElecRate,
    laborRate: parseFloat(laborRates.laborRate) || 120,
    installationCost: parseFloat(laborRates.installationCost) || 2,
    filamentHandlingCost: parseFloat(laborRates.filamentHandlingCost) || 5,
    multicolorPenalty: parseFloat(laborRates.multicolorPenalty) || 0,
    monitoringRate: parseFloat(laborRates.monitoringRate) || 100,
    dailyPrintLimit: parseFloat(laborRates.dailyPrintLimit) || 10,
    maintRate: parseFloat(maintRates.maintenanceRate) || 5,
    maintFixed: parseFloat(maintRates.estimationCost ?? maintRates.estimationFixedCost) || 0,
    mSolderRate: parseFloat(maintRates.mSolderRate) || 2,
    ironPower: parseFloat(elecRates.solderingIronPower) || 60,
    heatgunPower: Number.isFinite(supportRemovalHeatgunPower) ? supportRemovalHeatgunPower : 300,
    prepFee: Number.isFinite(preparationPriceRate) ? preparationPriceRate : 10,
    supportRemovalTimePerPlate: Number.isFinite(supportRemovalTimeRate) ? supportRemovalTimeRate : 10,
    supportFee: Number.isFinite(supportRemovalPriceRate) ? supportRemovalPriceRate : 5,
    printStartTime: parseFloat(laborRates.printStartTime) || 9
  };

  const materialUsageRows = validItems.flatMap((item) => {
    const mats = item.normalizedMaterials?.length ? item.normalizedMaterials : [item.normalizedMaterial].filter(Boolean);
    const explicitWeights = item.materialWeights || {};
    const fallbackWeight = item.normalizedWeight / Math.max(1, mats.length);
    return mats.map((mat) => ({
      item,
      material: mat,
      weight: Number(explicitWeights[String(mat.materialId || mat.id)] ?? explicitWeights[String(mat.id)] ?? fallbackWeight)
    }));
  }).filter((row) => row.material && row.weight > 0);

  const filamentGroups = materialUsageRows.reduce((acc, row) => {
    const key = String(row.material.materialId || row.material.id);
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  const filamentSummary = Object.entries(filamentGroups).map(([id, group]) => {
    const mat = group[0].material;
    const spoolWeight = parseFloat(mat.weight || DEFAULT_SPOOL_WEIGHT);
    const pricePerGram = spoolWeight > 0 ? (parseFloat(mat.price) || 0) / spoolWeight : 0;
    const totalWeight = group.reduce((sum, row) => sum + row.weight, 0);
    const reprintWeight = group.filter((row) => row.item?.isReprint === true).reduce((sum, row) => sum + row.weight, 0);
    const standardWeight = Math.max(0, totalWeight - reprintWeight);
    const isUpfront = isInventoryMode ? false : String(mat.status || '').toLowerCase() === 'upfront';
    const shortfall = isInventoryMode ? 0 : (isUpfront ? totalWeight : Math.max(0, totalWeight - (parseFloat(mat.remaining) || 0)));
    const spoolsNeeded = shortfall > 0 ? Math.ceil(shortfall / spoolWeight) : 0;
    const excessWeight = Math.max(0, (spoolsNeeded * spoolWeight) - shortfall);
    const excessCharge = isInventoryMode ? 0 : (excessWeight * pricePerGram * filamentClientShare);
    const usageCost = totalWeight * pricePerGram;
    const reprintUsageCost = reprintWeight * pricePerGram;
    const standardUsageCost = standardWeight * pricePerGram;
    return {
      id, material: mat, name: getMaterialLabel(mat), spoolWeight, totalWeightUsed: totalWeight,
      pricePerGram, spoolsNeeded, excessWeight, excessCharge, usageCost,
      reprintUsageCost, standardUsageCost,
      totalCost: usageCost + excessCharge,
      finalCost: (standardUsageCost * markupMultiplier) + excessCharge
    };
  });

  let extrasRawSum = 0, extrasBaseSum = 0, extrasExcessSum = 0, totalHardwareMins = 0, totalHardwareQty = 0, heatsetMins = 0;
  const extrasBreakdown = [], extrasSummaryMap = {};
  const activeExtras = Array.isArray(data?.extras) ? data.extras.filter(e => e?.assignments && Object.keys(e.assignments).length > 0) : [];

  activeExtras.forEach((extra) => {
    const entries = Object.entries(extra.assignments || {}).filter(([key, q]) => (
      includedAssignmentKeys.has(String(key))
      && !reprintAssignmentKeys.has(String(key))
      && Number(q) > 0
    ));
    const totalQty = entries.reduce((s, [, q]) => s + Number(q), 0);
    if (totalQty <= 0) return;
    const type = (extra.name || '').toLowerCase().includes('magnet') ? 'magnets' : ((extra.name || '').toLowerCase().includes('heatset') ? 'heatsets' : null);
    entries.forEach(([k, q]) => {
      if (!extrasSummaryMap[k]) extrasSummaryMap[k] = { magnets: 0, heatsets: 0 };
      if (type) extrasSummaryMap[k][type] += Number(q);
    });
    const pack = Number(extra.pack) || 1;
    const pricePerPiece = pack > 0 ? (parseFloat(extra.price) || 0) / pack : (parseFloat(extra.price) || 0);
    const isUpfront = isInventoryMode ? false : String(extra.status || '').toLowerCase() === 'upfront';
    const baseCost = totalQty * pricePerPiece;
    let excessUnits = 0, purchasedPacks = 0, excessShare = 0;
    if (isInventoryMode) {
      purchasedPacks = 0;
      excessUnits = 0;
    } else if (isUpfront) {
      purchasedPacks = Math.ceil(totalQty / pack);
      excessUnits = Math.max(0, (purchasedPacks * pack) - totalQty);
    } else {
      const stock = parseFloat(extra.qty) || 0;
      if (totalQty > stock) {
        purchasedPacks = Math.ceil((totalQty - stock) / pack);
        excessUnits = Math.max(0, (stock + (purchasedPacks * pack)) - totalQty);
      }
    }
    excessShare = isInventoryMode ? 0 : (excessUnits * pricePerPiece * extraClientShare);
    extrasRawSum += (baseCost + excessShare);
    extrasBaseSum += baseCost;
    extrasExcessSum += excessShare;
    extrasBreakdown.push({
      label: extra.name,
      sub: `${totalQty} pc(s) assigned • ${purchasedPacks > 0 ? `${purchasedPacks} packs` : 'stock'}`,
      calc: `₱${formatCurrency((baseCost * markupMultiplier) + excessShare)}`
    });
    const mSet = parseFloat(extraRates.magnetSetupRate) || 0, mPlc = parseFloat(extraRates.magnetPlacementRate) || 0;
    const hSet = parseFloat(extraRates.heatsetSetupRate) || 0, hPlc = parseFloat(extraRates.heatsetPlacementRate) || 0;
    if (type === 'magnets') { totalHardwareMins += (entries.length * mSet) + (totalQty * mPlc); totalHardwareQty += totalQty; }
    else if (type === 'heatsets') { const mins = hSet + (totalQty * hPlc); totalHardwareMins += mins; totalHardwareQty += totalQty; heatsetMins += mins; }
  });

  const sessionLimitMins = currentRates.dailyPrintLimit * 60;
  const printStartMins = Math.round(currentRates.printStartTime * 60);
  const MINUTES_PER_DAY = 1440;
  const productionSchedule = [];
  let overnightIdleMins = 0;
  let totalStartupTime = 0;
  let filamentHandlingEvents = 0;

  const getJobPrinter = (item) => item.printer || (printers || []).find((p) => String(p.id) === String(item.printerId)) || activePrinter || {};
  const getPrinterKey = (printer) => String(printer?.id || printer?.model || printer?.name || 'default');
  const getPrinterLabel = (printer) => [printer?.brand, printer?.model || printer?.name].filter(Boolean).join(' ') || 'Printer';
  const getBootupTime = (printer) => (parseFloat(printer?.bootupMins) || 0) + (parseFloat(printer?.homingMins) || 0);
  const getBedLevelTime = (printer) => parseFloat(printer?.bedLevelMins ?? printer?.bootLevelMins) || 0;
  const is3MF = String(data?.method?.name || '').toUpperCase() === '3MF';
  const getCfsSwapRate = (printer) => {
    const connectedFeeders = getCompatibleFeeders(printer);
    const primaryFeeder = connectedFeeders[0];
    const configured = Number(primaryFeeder?.swapTime ?? printer?.swapTime ?? 0);
    return configured > 0 ? configured : currentRates.multicolorPenalty;
  };

  const getCfsSwapMins = (item) => {
    if (item.usesCfs !== true) return 0;
    if (Number(item.swapMins) > 0) return Number(item.swapMins);
    const printer = getJobPrinter(item);
    const swapRate = getCfsSwapRate(printer);

    if (is3MF) {
      return (Number(item.sliced?.colorSwaps) || 0) * swapRate;
    }
    
    const numColors = item.normalizedMaterials?.length || 1;
    if (numColors <= 1) return 0;

    const explicitSwaps = Number(item.sliced?.estimatedColorSwaps ?? item.sliced?.colorSwaps ?? 0);
    if (explicitSwaps > 0) return explicitSwaps * swapRate;

    let height = parseFloat(item.config?.height || item.height || 0);
    const unit = (item.config?.unit || 'mm').toLowerCase();
    if (unit === 'cm') height *= 10;
    else if (unit === 'in') height *= 25.4;

    const layerHeight = 0.2;
    const estimatedLayers = Math.ceil(height / layerHeight);
    const swapsPerLayer = numColors - 1;
    const totalSwaps = estimatedLayers * swapsPerLayer;
    
    return totalSwaps * swapRate;
  };

  const getItemExtras = (item) => {
    const keys = [
      item.parentId,
      item.id,
      item.index,
      ...(Array.isArray(item.parentIds) ? item.parentIds : [])
    ].filter((key) => key !== undefined && key !== null).map(String);
    return [...new Set(keys)].reduce((acc, key) => {
      const entry = extrasSummaryMap[key];
      if (!entry) return acc;
      return {
        magnets: acc.magnets + (Number(entry.magnets) || 0),
        heatsets: acc.heatsets + (Number(entry.heatsets) || 0)
      };
    }, { magnets: 0, heatsets: 0 });
  };

  const printerStates = {};
  const getPrinterState = (printer) => {
    const key = getPrinterKey(printer);
    if (!printerStates[key]) {
      printerStates[key] = { key, printer, currentTime: printStartMins, initializedDays: new Set(), overnightIdleMins: 0 };
    }
    return printerStates[key];
  };

  const getDayBucket = (dayNum, fil, printer) => {
    const printerKey = getPrinterKey(printer);
    let b = productionSchedule.find(e => e.day === dayNum && e.printerKey === printerKey);
    if (!b) {
      b = {
        day: dayNum,
        printerKey,
        printerName: getPrinterLabel(printer),
        totalMins: 0,
        maxPrinterMins: 0,
        gapMins: 0,
        limitMins: sessionLimitMins,
        setupMins: 0,
        installMins: 0,
        printMins: 0,
        reprintMins: 0,
        filament: fil,
        plates: []
      };
      productionSchedule.push(b);
    }
    return b;
  };

  const advanceTime = (t) => {
    const dStart = Math.floor(t / MINUTES_PER_DAY) * MINUTES_PER_DAY + printStartMins;
    if (t <= dStart + sessionLimitMins + 120 && t >= dStart) return t;
    let next = dStart;
    while (next <= t) next += MINUTES_PER_DAY;
    return next;
  };

  const injectTask = (state, id, name, time, fil, type = 'manual', skipInit = false) => {
    if (time <= 0) return;
    const start = advanceTime(state.currentTime);
    if (start > state.currentTime) {
      state.overnightIdleMins += (start - state.currentTime);
      overnightIdleMins += (start - state.currentTime);
      state.currentTime = start;
    }
    const dNum = Math.floor(state.currentTime / MINUTES_PER_DAY) + 1;
    let init = (!skipInit && !state.initializedDays.has(dNum)) ? (getBootupTime(state.printer) + getBedLevelTime(state.printer)) : 0;
    if (init > 0) {
      state.initializedDays.add(dNum);
      totalStartupTime += init;
    }
    const b = getDayBucket(dNum, fil, state.printer);
    const rounded = Math.round(time + init);
    b.totalMins += rounded;
    if (type === 'manual') b.setupMins += rounded; else b.printMins += rounded;
    b.plates.push({ id, name, time: rounded, scheduledMins: rounded, printMins: type === 'print' ? time : 0, setupMins: rounded - (type === 'print' ? time : 0), installMins: 0, postPrintHeatsetMins: 0, filament: fil, printerName: getPrinterLabel(state.printer), magnets: 0, heatsets: 0, startDay: dNum, endDay: Math.floor((state.currentTime + rounded - 0.1) / MINUTES_PER_DAY) + 1 });
    state.currentTime += rounded;
  };

  const chargeableItems = validItems.filter((item) => item?.isReprint !== true);
  const standardPrintTime = chargeableItems.reduce((s, i) => s + i.normalizedTime, 0);
  const standardSwapMins = chargeableItems.reduce((s, i) => s + getCfsSwapMins(i), 0);
  const backgroundPrepTime = chargeableItems.length * 5; 
  const backgroundSupportTime = chargeableItems.length * currentRates.supportRemovalTimePerPlate;
  const defaultState = getPrinterState(activePrinter || getJobPrinter(validItems[0]));
  injectTask(defaultState, 'batch-prep', 'Batch Preparation & Setup', backgroundPrepTime + backgroundSupportTime, 'Manual Work', 'manual', true);

  const byPrinter = validItems.reduce((acc, item) => {
    const printer = getJobPrinter(item);
    const key = getPrinterKey(printer);
    if (!acc[key]) acc[key] = { printer, items: [] };
    acc[key].items.push(item);
    return acc;
  }, {});

  Object.values(byPrinter).forEach(({ printer, items: printerItems }) => {
    const state = getPrinterState(printer);
    const cfsJobs = printerItems.filter(item => item.usesCfs === true);
    const normalJobs = printerItems.filter(item => item.usesCfs !== true);

    if (cfsJobs.length > 0) {
      const palette = [...new Map(cfsJobs.flatMap(item => item.normalizedMaterials || [item.normalizedMaterial]).filter(Boolean).map(mat => [String(mat.id), mat])).values()];
      const loadTime = palette.reduce((sum, mat) => sum + (parseFloat(mat.loadTime) || 0), 0);
      const purgeTime = palette.reduce((sum, mat) => sum + (parseFloat(mat.purgeTime) || 0), 0);
      const paletteLabel = palette.map(getMaterialLabel).join(' + ') || 'CFS Palette';
      if (cfsJobs.some((item) => item?.isReprint !== true)) filamentHandlingEvents += 2;
      injectTask(state, `load-cfs-${state.key}`, `Load CFS: ${paletteLabel}`, loadTime, paletteLabel);
      cfsJobs.sort((a, b) => (b.normalizedTime - a.normalizedTime) || (a.index - b.index)).forEach((item) => {
        const start = advanceTime(state.currentTime);
        if (start > state.currentTime) {
          state.overnightIdleMins += (start - state.currentTime);
          overnightIdleMins += (start - state.currentTime);
          state.currentTime = start;
        }
        const dNum = Math.floor(state.currentTime / MINUTES_PER_DAY) + 1;
        let init = !state.initializedDays.has(dNum) ? (getBootupTime(state.printer) + getBedLevelTime(state.printer)) : 0;
        if (init > 0) { state.initializedDays.add(dNum); totalStartupTime += init; }
        const pExtra = getItemExtras(item);
        
        const swapMins = getCfsSwapMins(item);
        const mPlcTime = pExtra.magnets * (parseFloat(extraRates.magnetPlacementRate) || 0);
        const mSetTime = pExtra.magnets > 0 ? (parseFloat(extraRates.magnetSetupRate) || 0) : 0;
        const workload = Math.round(item.normalizedTime + swapMins + mPlcTime + mSetTime + init);
        const printMonitoringMins = Math.round(item.normalizedTime + swapMins);
        const b = getDayBucket(dNum, paletteLabel, state.printer);
        b.totalMins += workload; 
        b.setupMins += (mSetTime + init); 
        b.installMins += mPlcTime; 
        if (item?.isReprint === true) b.reprintMins += printMonitoringMins;
        else b.printMins += printMonitoringMins;
        const plateId = `${String(item.id ?? item.index)}-${dNum}-${b.plates.length}`;
        b.plates.push({ 
          id: plateId, 
          itemId: item.id,
          parentId: item.parentId,
          printTimeAdjustmentsApplied: item.printTimeAdjustmentsApplied,
          name: item.itemName, 
          time: workload, 
          scheduledMins: workload, 
          printMins: printMonitoringMins, 
          setupMins: mSetTime + init, 
          installMins: mPlcTime, 
          postPrintHeatsetMins: (pExtra.heatsets > 0 ? (parseFloat(extraRates.heatsetSetupRate) || 0) : 0) + (pExtra.heatsets * (parseFloat(extraRates.heatsetPlacementRate) || 0)), 
          filament: paletteLabel, 
          printerName: getPrinterLabel(state.printer), 
          magnets: pExtra.magnets, 
          heatsets: pExtra.heatsets, 
          startDay: dNum, 
          endDay: Math.floor((state.currentTime + workload - 0.1) / MINUTES_PER_DAY) + 1 
        });
      });
      injectTask(state, `purge-cfs-${state.key}`, `Purge CFS: ${paletteLabel}`, purgeTime, paletteLabel);
    }

    const grouped = Object.values(normalJobs.reduce((acc, item) => {
      const key = String(item.normalizedMaterial.materialId || item.normalizedMaterial.id);
      if (!acc[key]) acc[key] = []; acc[key].push(item); return acc;
    }, {})).map(g => [...g].sort((a, b) => (b.normalizedTime - a.normalizedTime) || (a.index - b.index)));

    grouped.forEach((group, gIdx) => {
      const filLabel = getMaterialLabel(group[0].normalizedMaterial);
      if (group.some((item) => item?.isReprint !== true)) filamentHandlingEvents += 2;
      injectTask(state, `load-${state.key}-${gIdx}`, `Load Filament: ${filLabel}`, group[0].normalizedMaterial.loadTime, filLabel);
      group.forEach((item) => {
        const start = advanceTime(state.currentTime);
        if (start > state.currentTime) {
          state.overnightIdleMins += (start - state.currentTime);
          overnightIdleMins += (start - state.currentTime);
          state.currentTime = start;
        }
        const dNum = Math.floor(state.currentTime / MINUTES_PER_DAY) + 1;
        let init = !state.initializedDays.has(dNum) ? (getBootupTime(state.printer) + getBedLevelTime(state.printer)) : 0;
        if (init > 0) { state.initializedDays.add(dNum); totalStartupTime += init; }
        const itemKey = String(item.id || item.parentId || item.index);
        const pExtra = getItemExtras(item);
        const mPlcTime = pExtra.magnets * (parseFloat(extraRates.magnetPlacementRate) || 0);
        const mSetTime = pExtra.magnets > 0 ? (parseFloat(extraRates.magnetSetupRate) || 0) : 0;
        const workload = Math.round(item.normalizedTime + mPlcTime + mSetTime + init);
        const b = getDayBucket(dNum, filLabel, state.printer);
        b.totalMins += workload; b.setupMins += (mSetTime + init); b.installMins += mPlcTime;
        if (item?.isReprint === true) b.reprintMins += item.normalizedTime;
        else b.printMins += item.normalizedTime;
        b.plates.push({ id: itemKey, itemId: item.id, parentId: item.parentId, printTimeAdjustmentsApplied: item.printTimeAdjustmentsApplied, name: item.itemName, time: workload, scheduledMins: workload, printMins: item.normalizedTime, setupMins: mSetTime + init, installMins: mPlcTime, postPrintHeatsetMins: (pExtra.heatsets > 0 ? (parseFloat(extraRates.heatsetSetupRate) || 0) : 0) + (pExtra.heatsets * (parseFloat(extraRates.heatsetPlacementRate) || 0)), filament: filLabel, printerName: getPrinterLabel(state.printer), magnets: pExtra.magnets, heatsets: pExtra.heatsets, startDay: dNum, endDay: Math.floor((state.currentTime + workload - 0.1) / MINUTES_PER_DAY) + 1 });
        state.currentTime += workload;
      });
      injectTask(state, `purge-${state.key}-${gIdx}`, `Purge & Cleanup: ${filLabel}`, group[0].normalizedMaterial.purgeTime, filLabel);
    });
  });

  productionSchedule.sort((a, b) => (a.day - b.day) || String(a.printerName || '').localeCompare(String(b.printerName || '')));

  productionSchedule.forEach(dayBucket => {
    const dayPrinters = productionSchedule.filter(b => b.day === dayBucket.day);
    dayBucket.maxPrinterMins = Math.max(...dayPrinters.map(b => b.totalMins));
  });

  const estSessions = Math.max(1, ...productionSchedule.flatMap(day => [day.day, ...(day.plates || []).map(p => p.endDay || day.day)]));
  const totalPrintTime = validItems.reduce((s, i) => s + i.normalizedTime, 0);
  const totalSwapMins = validItems.reduce((s, i) => s + getCfsSwapMins(i), 0);
  const handlingMins = filamentHandlingEvents * 5;
  
  const printerRuntimeRows = Object.values(printerStates).map((state) => {
    const printerItems = validItems.filter((item) => getPrinterKey(getJobPrinter(item)) === state.key);
    const printMins = printerItems.reduce((sum, item) => sum + item.normalizedTime, 0);
    const swapMins = printerItems.reduce((sum, item) => sum + getCfsSwapMins(item), 0);
    const reprintPrintMins = printerItems.filter((item) => item?.isReprint === true).reduce((sum, item) => sum + item.normalizedTime, 0);
    const reprintSwapMins = printerItems.filter((item) => item?.isReprint === true).reduce((sum, item) => sum + getCfsSwapMins(item), 0);
    const startupMins = [...state.initializedDays].length * (getBootupTime(state.printer) + getBedLevelTime(state.printer));
    const hasCfsRuntime = printerItems.some((item) => item.usesCfs === true);
    const baseWattage = parseFloat(state.printer?.wattage || 0);
    let feederWattage = 0;
    if (hasCfsRuntime && state.printer) {
      const connectedFeeders = getCompatibleFeeders(state.printer);
      feederWattage = connectedFeeders.reduce((sum, unit) => sum + (parseFloat(unit.wattage) || 0), 0);
    }
    const printerWattage = baseWattage + feederWattage;

    const printerAdjustments = [...new Set(
      printerItems.flatMap((item) => (item.printTimeAdjustmentsApplied || []).filter((a) => a.percent > 0).map((a) => `+${a.percent}% ${a.type}`))
    )];

    return {
      printerName: getPrinterLabel(state.printer),
      wattage: printerWattage,
      runtimeMins: printMins + swapMins + startupMins + state.overnightIdleMins + (handlingMins / Math.max(1, Object.keys(printerStates).length)),
      printTimeOnly: printMins + swapMins,
      reprintPrintMins,
      reprintSwapMins,
      appliedAdjustments: printerAdjustments
    };
  });
  
  const costPrepFlat = chargeableItems.length * currentRates.prepFee;
  const costSupportFlat = chargeableItems.length * currentRates.supportFee;
  const costHardwareLabor = totalHardwareQty * currentRates.installationCost;
  const costFilamentHandling = filamentHandlingEvents * currentRates.filamentHandlingCost;
  
  const laborCostDoc = storeRates['labor-cost'] || {};
  const printTierMap = laborCostDoc.printTierMap || {};
  const tiers = Object.values(printTierMap).sort((a, b) => a.firstCoveredHours - b.firstCoveredHours);

  let costMonitoringLabor = 0;
  const dailyTierBreakdown = [];

  productionSchedule.forEach((dayBucket) => {
    const dayMonitoringHours = dayBucket.printMins / 60;
    if (dayMonitoringHours <= 0) return;

    let remainingHours = dayMonitoringHours;
    let dayCost = 0;
    let dayBreakdown = [];

    if (laborCostDoc.useTiers && tiers.length > 0) {
      let cycleCount = 1;
      while (remainingHours > 0) {
        let processedInCycle = 0;
        for (const tier of tiers) {
          const coveredHours = parseFloat(tier.firstCoveredHours) || 0;
          if (coveredHours <= processedInCycle) continue;

          const rate = parseFloat(tier.laborRate) || currentRates.laborRate;
          const tierCapacity = coveredHours - processedInCycle;
          const hoursInTier = Math.min(remainingHours, tierCapacity);
          
          if (hoursInTier > 0) {
            dayCost += hoursInTier * rate;
            dayBreakdown.push({ 
              tier: tier.firstCoveredHours, 
              hours: hoursInTier, 
              rate: rate, 
              cost: hoursInTier * rate,
              cycle: cycleCount > 1 ? cycleCount : null
            });
            remainingHours -= hoursInTier;
            processedInCycle += hoursInTier;
          }
          if (remainingHours <= 0) break;
        }
        if (processedInCycle === 0) {
          dayCost += remainingHours * currentRates.laborRate;
          dayBreakdown.push({ tier: 'Standard', hours: remainingHours, rate: currentRates.laborRate, cost: remainingHours * currentRates.laborRate });
          remainingHours = 0;
        }
        cycleCount++;
      }
    } else {
      dayCost = dayMonitoringHours * currentRates.laborRate;
      dayBreakdown.push({ tier: 'Standard', hours: dayMonitoringHours, rate: currentRates.laborRate, cost: dayCost });
    }

    costMonitoringLabor += dayCost;
    
    const dayAdjustments = [...new Set(
      (dayBucket.plates || []).flatMap((plate) => {
        const adjs = (Array.isArray(plate.printTimeAdjustmentsApplied) && plate.printTimeAdjustmentsApplied.length > 0)
          ? plate.printTimeAdjustmentsApplied
          : (validItems.find((vi) => String(vi.id || vi.parentId || vi.index) === String(plate.itemId || plate.id))?.printTimeAdjustmentsApplied || []);
        return adjs.filter((a) => a.percent > 0).map((a) => `+${a.percent}% ${a.type}`);
      })
    )];

    dailyTierBreakdown.push({ 
      day: dayBucket.day, 
      printer: dayBucket.printerName, 
      total: dayCost, 
      breakdown: dayBreakdown,
      adjustments: dayAdjustments
    });
  });
  
  const runtimeForElec = standardPrintTime + standardSwapMins + totalStartupTime + totalHardwareMins + handlingMins;
  
  const baseLaborTotal = costPrepFlat + costSupportFlat + costMonitoringLabor + costHardwareLabor + costFilamentHandling;
  const markupableLabor = baseLaborTotal;
  const laborFinal = markupableLabor * markupMultiplier;
  
  const kwhP = printerRuntimeRows.reduce((sum, row) => sum + ((row.wattage / 1000) * (row.runtimeMins / 60)), 0);
  const reprintKwhP = printerRuntimeRows.reduce((sum, row) => sum + ((row.wattage / 1000) * ((row.reprintPrintMins + row.reprintSwapMins) / 60)), 0);
  const markupableElectricityKwh = Math.max(0, kwhP - reprintKwhP);
  const kwhI = (currentRates.ironPower / 1000) * (heatsetMins / 60);
  const kwhH = (currentRates.heatgunPower / 1000) * (backgroundSupportTime / 60);
  const baseElecTotal = (kwhP + kwhI + kwhH) * currentRates.electricityRate;
  const markupableElectricityBase = (markupableElectricityKwh + kwhI + kwhH) * currentRates.electricityRate;
  const reprintElectricityBase = reprintKwhP * currentRates.electricityRate;
  const elecFinal = markupableElectricityBase * markupMultiplier;

  const maintFinal = ((runtimeForElec / 60) * currentRates.maintRate) + ((heatsetMins / 60) * currentRates.mSolderRate) + currentRates.maintFixed;
  
  const materialBaseSum = filamentSummary.reduce((s, f) => s + f.usageCost, 0);
  const filamentExcessSum = filamentSummary.reduce((s, f) => s + f.excessCharge, 0);
  const filamentFinal = filamentSummary.reduce((s, f) => s + f.finalCost, 0);
  const extrasFinal = (extrasBaseSum * markupMultiplier) + extrasExcessSum;
  
  const basePrice = filamentFinal + laborFinal + elecFinal + extrasFinal + maintFinal;
  const grandTotal = basePrice;

  const standardMaterialBaseSum = filamentSummary.reduce((s, f) => s + f.standardUsageCost, 0);
  const profitFilament = standardMaterialBaseSum * (markupMultiplier - 1);
  const profitLabor = markupableLabor * (markupMultiplier - 1);
  const profitElectricity = markupableElectricityBase * (markupMultiplier - 1);
  const profitExtras = extrasBaseSum * (markupMultiplier - 1);

  const reprintMaterialCost = filamentSummary.reduce((s, f) => s + f.reprintUsageCost, 0);
  const reprintElectricityCost = reprintElectricityBase;
  const totalReprintLoss = reprintMaterialCost + reprintElectricityCost;

  const standardProjectProfit = profitFilament + profitLabor + profitElectricity + profitExtras;
  const totalProjectProfit = Math.max(-totalReprintLoss, standardProjectProfit - totalReprintLoss);

  const baseTakeHome = laborFinal + profitFilament + profitElectricity + (profitExtras + extrasExcessSum) + filamentExcessSum;
  const netTakeHome = baseTakeHome - totalReprintLoss;
  const totalTakeHome = netTakeHome;

  // Capital is the actual operating cost basis, before customer-facing
  // markup and leftover-material/extra charges. Persisting this numeric value
  // lets order accounting stay accurate even after rates or inventory change.
  const capitalCost = materialBaseSum + markupableLabor + baseElecTotal + extrasBaseSum + maintFinal;
  const capitalBreakdown = {
    materials: Number(Math.max(0, materialBaseSum).toFixed(2)),
    labor: Number(Math.max(0, markupableLabor).toFixed(2)),
    electricity: Number(Math.max(0, baseElecTotal).toFixed(2)),
    extras: Number(Math.max(0, extrasBaseSum).toFixed(2)),
    maintenance: Number(Math.max(0, maintFinal).toFixed(2))
  };

  return {
    total: Math.ceil(grandTotal).toLocaleString(),
    basePrice: Math.ceil(basePrice).toLocaleString(),
    dp: (Math.ceil((
            filamentSummary.reduce((s, f) => s + f.totalCost, 0) + 
      extrasRawSum + 
      elecFinal + 
      (baseLaborTotal * 0.1) + 
      maintFinal
    ) / 10) * 10).toLocaleString(),
    timeline: { totalEffort: formatMinutes(totalPrintTime + backgroundPrepTime + backgroundSupportTime + totalStartupTime + totalHardwareMins), days: estSessions, schedule: productionSchedule },
    filament: formatCurrency(filamentFinal),
    labor: formatCurrency(laborFinal),
    electricity: formatCurrency(elecFinal),
    electricityKwh: Number((kwhP + kwhI + kwhH).toFixed(6)),
    electricityRate: Number(currentRates.elecRate),
    electricityMarkupMultiplier: Number(markupMultiplier),
    maintenance: formatCurrency(maintFinal),
    extras: formatCurrency(extrasFinal),
    capitalCost: Number(Math.max(0, capitalCost).toFixed(2)),
    capitalBreakdown,
    totalProfit: formatCurrency(totalProjectProfit),
    totalTakeHome: formatCurrency(totalTakeHome),
    reprintLoss: {
      materialLoss: formatCurrency(reprintMaterialCost),
      electricityLoss: formatCurrency(reprintElectricityCost),
      totalLoss: formatCurrency(totalReprintLoss),
      rawMaterialLossNum: reprintMaterialCost,
      electricityLossNum: reprintElectricityCost,
      totalLossNum: totalReprintLoss,
      baseTakeHome: formatCurrency(baseTakeHome),
      netTakeHome: formatCurrency(netTakeHome)
    },
    details: {
      filament: [
        {
          title: 'Usage Details',
          items: filamentSummary.map(f => ({
            label: f.name,
            sub: `${formatWeight(f.totalWeightUsed)} used • ₱${formatCurrency(f.pricePerGram)}/g`,
            calc: `₱${formatCurrency(f.usageCost)}`,
            weight: Number(f.totalWeightUsed.toFixed(2)),
            material: {
              brand: f.material?.brand || '',
              type: f.material?.type || '',
              colorName: getMaterialColor(f.material)
            }
          }))
        },
        {
          title: 'Earnings & Summary',
          items: [
            { label: 'Filament Markup', sub: `${markupPercent}% profit on usage`, calc: `₱${formatCurrency(profitFilament)}`, isProfit: true },
            { label: 'Leftover Fees', sub: 'Client share of unused material', calc: `₱${formatCurrency(filamentExcessSum)}` },
            { label: 'Filament Total', sub: 'Combined with profit and excess', calc: `₱${formatCurrency(filamentFinal)}` }
          ]
        }
      ],
      labor: [
        {
          title: 'Plate Preparation',
          items: [
            { label: 'Plate Preparation', sub: `${chargeableItems.length} plate(s) × ₱${currentRates.prepFee}/plate`, calc: `₱${formatCurrency(costPrepFlat)}` },
            { label: 'Support Removal', sub: `${chargeableItems.length} plate(s) × ₱${currentRates.supportFee}/plate`, calc: `₱${formatCurrency(costSupportFlat)}` }
          ]
        },
        {
          title: 'Print Monitoring',
          items: dailyTierBreakdown.flatMap(d => [
              { 
                label: `Day ${d.day} (${d.printer})`, 
                sub: `${(d.breakdown.reduce((s, b) => s + b.hours, 0)).toFixed(1)} hrs monitored${d.adjustments?.length > 0 ? ` • includes ${d.adjustments.join(', ')}` : ''}`, 
                calc: `₱${formatCurrency(d.total)}` 
              },
              ...d.breakdown.map(b => ({
                  label: `  - ${b.tier === 'Standard' ? 'Standard' : `Tier (${b.tier}hr)`}${b.cycle ? ` (Cycle ${b.cycle})` : ''}`,
                  sub: `${b.hours.toFixed(1)} hrs @ ₱${b.rate}/hr`,
                  calc: `₱${formatCurrency(b.cost)}`
              }))
          ])
        },
        {
          title: 'Additional Labor',
          items: [
            { label: 'Hardware Install', sub: `${totalHardwareQty} pc(s) • ₱${currentRates.installationCost}/pc`, calc: `₱${formatCurrency(costHardwareLabor)}` },
            { label: 'Filament Handling', sub: `${filamentHandlingEvents} event(s) • ₱${currentRates.filamentHandlingCost}/event`, calc: `₱${formatCurrency(costFilamentHandling)}` }
          ]
        },
        {
          title: 'Labor Summary',
          items: [
            { label: 'Print Monitoring Total', sub: 'Total tiered monitoring cost', calc: `₱${formatCurrency(costMonitoringLabor)}` },
            { label: 'Labor Markup', sub: `${markupPercent}% profit on prep & hardware`, calc: `₱${formatCurrency(profitLabor)}`, isProfit: true },
            { label: 'Labor Total', sub: 'Base labor + markup profit', calc: `₱${formatCurrency(laborFinal)}` }
          ]
        }
      ],
      electricity: [
        {
          title: 'Consumption',
          items: [
            ...(printerRuntimeRows.length === 0
              ? [{ label: 'Printer Power', sub: '0m runtime', calc: '₱0.00' }]
              : printerRuntimeRows.length === 1
                ? [{
                    label: `Printer Power (${printerRuntimeRows[0].printerName})`,
                    sub: `${formatMinutes(printerRuntimeRows[0].runtimeMins)} runtime (${printerRuntimeRows[0].wattage}W)${totalSwapMins > 0 ? ` • ${formatMinutes(totalSwapMins)} swaps` : ''}${
                      printerRuntimeRows[0].appliedAdjustments?.length > 0
                        ? ` • includes ${printerRuntimeRows[0].appliedAdjustments.join(', ')}`
                        : ''
                    }`,
                    calc: `₱${formatCurrency(kwhP * currentRates.elecRate)}`
                  }]
                : printerRuntimeRows.map((row) => {
                    const rowKwh = (row.wattage / 1000) * (row.runtimeMins / 60);
                    const rowCost = rowKwh * currentRates.elecRate;
                    const adjText = row.appliedAdjustments?.length > 0
                      ? ` • includes ${row.appliedAdjustments.join(', ')}`
                      : '';
                    return {
                      label: `Printer Power (${row.printerName})`,
                      sub: `${formatMinutes(row.runtimeMins)} runtime (${row.wattage}W)${adjText}`,
                      calc: `₱${formatCurrency(rowCost)}`
                    };
                  })
            ),
            { label: 'Soldering Iron', sub: `${currentRates.ironPower}W used for heatsets`, calc: `₱${formatCurrency(kwhI * currentRates.elecRate)}` },
            { label: 'Support Removal Heatgun', sub: `${validItems.length} plate(s) × ${currentRates.supportRemovalTimePerPlate} min at ${currentRates.heatgunPower}W`, calc: `₱${formatCurrency(kwhH * currentRates.elecRate)}` }
          ]
        },
        {
          title: 'Earnings & Summary',
          items: [
            { label: 'Utility Markup', sub: `${markupPercent}% profit on power`, calc: `₱${formatCurrency(profitElectricity)}`, isProfit: true },
            { label: 'Energy Total', sub: `₱${formatCurrency(baseElecTotal)} base + profit`, calc: `₱${formatCurrency(elecFinal)}` }
          ]
        }
      ],
      extras: [
        { title: 'Hardware Items', items: extrasBreakdown },
        {
          title: 'Earnings & Summary',
          items: [
            { label: 'Hardware Markup', sub: `${markupPercent}% profit on items`, calc: `₱${formatCurrency(profitExtras)}`, isProfit: true },
            { label: 'Extras Total', sub: 'Base items + markup profit', calc: `₱${formatCurrency(extrasFinal)}` }
          ]
        }
      ],
      maintenance: [
        {
          title: 'Component Wear',
          items: [
            { label: 'Printer Wear', sub: `₱${currentRates.maintRate}/hr`, calc: `₱${formatCurrency((runtimeForElec / 60) * currentRates.maintRate)}` },
            { label: 'Soldering Tip', sub: `₱${currentRates.mSolderRate}/hr`, calc: `₱${formatCurrency((heatsetMins / 60) * currentRates.mSolderRate)}` }
          ]
        },
        {
          title: 'Service Fees',
          items: [
            { label: 'Estimation Fee', sub: 'Project assessment', calc: `₱${formatCurrency(currentRates.maintFixed)}` }
          ]
        },
        {
          title: 'Maintenance Total',
          items: [{ label: 'Maintenance Total', sub: 'No markup applied', calc: `₱${formatCurrency(maintFinal)}` }]
        }
      ]
    }
  };
};
