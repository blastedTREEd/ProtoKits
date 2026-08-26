import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Trash2, ShoppingBag, ShelvingUnit, ShoppingCart, PackageOpen, PackagePlus, Plus, Minus } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useTheme } from '../context/ThemeContext';
import PageTemplate from './PageTemplate';
import LoginPromptModal from '../components/menu/LoginPromptModal';
import ListItemSkeleton from '../components/common/ListItemSkeleton';
import { getCheckoutPaymentFees } from '../utils/paymentSettings';
import { isOfferCheckoutActive, valueToMillis } from '../utils/offerUtils';
import { getIntegerFeeShare, getStockStandaloneSellPrice, isBundleOrClearanceItem } from '../utils/standalonePricing';
import { getBundleDealPricing, getClearanceBundlePricing } from '../utils/bundlePricing';
import { getUnavailableDateSet, getUnavailableWeekdaySet, toDateKey } from '../utils/availabilitySchedule';
import { getStockEta } from '../utils/stockDates';
import {
  getPrinterFeeders,
  isFilamentCompatibleWithPrinter,
  isPrinterAvailableForScheduling,
  normalizePrinterRecord
} from '../utils/printerCompatibility';
import { findFirstAvailable, getOccupiedDates } from '../components/calculator/GarageCalendar';
import ProjectStatusGrid from '../components/calculator/ProjectStatusGrid';
// Resolves an image ID to its URL from the images array.
// Backward compatible: if the value is already a URL (base64 or http), returns it directly.
function resolveImage(idOrUrl, imagesArray) {
  if (!idOrUrl) return '';
  if (idOrUrl.startsWith('data:') || idOrUrl.startsWith('http')) return idOrUrl;
  const match = (imagesArray || []).find(img => img.id === idOrUrl);
  return match?.url || imagesArray?.[0]?.url || '';
}

function getProjectBasketName(project = {}) {
  const projectLabel = project.projectName || project.method?.name || 'Project';
  let name = `Custom Print: ${projectLabel}`;
  if (project.selectedDesignService) {
    const serviceId = project.selectedDesignService;
    const label = serviceId.split('-').map((word) => (
      word.toLowerCase() === 'cad'
        ? 'CAD'
        : word.charAt(0).toUpperCase() + word.slice(1)
    )).join(' ');
    name += ` (w/ ${label})`;
  }
  return name;
}

function getBasketItemTime(item) {
  const createdAtTime = new Date(item?.createdAt || 0).getTime();
  if (Number.isFinite(createdAtTime) && createdAtTime > 0) return createdAtTime;

  const idTime = String(item?.basketId || '').match(/_(\d{10,})_/);
  return idTime ? Number(idTime[1]) : 0;
}

function getBasketValidationKey(kitId, batchIdentifier, offerId) {
  return `${kitId}-${batchIdentifier}-${offerId || 'standard'}`;
}

function getBasketFee(item, field, fallback) {
  const storedFee = Number(item?.[field]);
  return storedFee > 0 ? storedFee : Number(fallback) || 0;
}

function getBasketItemGroupKey(item = {}) {
  if (item.type === 'project') return JSON.stringify(item.projectData);
  return `${item.id}-${item.stockKey}-${item.offerId || 'standard'}-${item.bundleId || 'standard'}`;
}

function isValidProjectFileLink(value) {
  if (!value || !String(value).trim()) return false;
  try {
    const hostname = new URL(String(value).trim()).hostname;
    return hostname === 'drive.google.com' || hostname === 'docs.google.com';
  } catch {
    return false;
  }
}

const toProjectMillimeters = (value, unit = 'mm') => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  const normalizedUnit = String(unit || 'mm').trim().toLowerCase();
  if (normalizedUnit === 'cm') return numericValue * 10;
  if (normalizedUnit === 'in' || normalizedUnit === 'inch' || normalizedUnit === 'inches') return numericValue * 25.4;
  return numericValue;
};

const getProjectDetailDimensions = (detail = {}) => {
  const config = detail.config || {};
  const dimensions = detail.dimensions || {};
  const unit = detail.unit || config.unit || dimensions.unit || 'mm';
  const values = [
    detail.length ?? config.length ?? dimensions.length ?? dimensions.l ?? detail.baseMM_length,
    detail.width ?? config.width ?? dimensions.width ?? dimensions.w ?? detail.baseMM_width,
    detail.height ?? config.height ?? dimensions.height ?? dimensions.h ?? detail.baseMM_height
  ].map((value) => toProjectMillimeters(value, unit));
  return values.every((value) => value > 0) ? values : null;
};

const getProjectMaterialRecords = (detail = {}, filamentInventory = []) => {
  const source = Array.isArray(detail.materials) && detail.materials.length > 0
    ? detail.materials
    : Array.isArray(detail.normalizedMaterials) && detail.normalizedMaterials.length > 0
      ? detail.normalizedMaterials
      : Array.isArray(detail.materialSlots) && detail.materialSlots.length > 0
        ? detail.materialSlots
        : [detail.material, detail.normalizedMaterial].filter(Boolean);
  return source.map((entry) => {
    const nestedMaterial = entry?.material || entry?.normalizedMaterial;
    const materialId = String(entry?.materialId || nestedMaterial?.id || entry?.id || '').trim();
    const inventoryMatch = (filamentInventory || []).find((filament) => materialId && String(filament.id) === materialId);
    return { material: { ...(nestedMaterial || entry || {}), ...(inventoryMatch || {}) }, materialId };
  }).filter(({ material, materialId }) => material && (materialId || material.type || material.name));
};

const getProjectRequiredMaterialSlots = (detail = {}, materialRecords = []) => {
  if (Array.isArray(detail.materialSlots) && detail.materialSlots.length > 0) return detail.materialSlots.length;
  if (Array.isArray(detail.materials) && detail.materials.length > 0) return detail.materials.length;
  if (Array.isArray(detail.normalizedMaterials) && detail.normalizedMaterials.length > 0) return detail.normalizedMaterials.length;
  const jobMaterialIds = (detail.productionJobs || []).flatMap((job) => job?.materialIds || []);
  if (jobMaterialIds.length > 0) return jobMaterialIds.length;
  return Math.max(1, materialRecords.length);
};

const isProjectPrinterOperational = (printer = {}) => {
  return isPrinterAvailableForScheduling(printer);
};

const printerCanAccommodateProjectDetail = (printer, detail, feeders, filamentInventory) => {
  if (!printer || !isProjectPrinterOperational(printer)) return false;
  const normalizedPrinter = normalizePrinterRecord(printer);
  const dimensions = getProjectDetailDimensions(detail);
  const capacity = normalizedPrinter.buildCapacity;
  if (dimensions && !dimensions.every((value, index) => value <= [capacity.x, capacity.y, capacity.z][index])) return false;
  const materialRecords = getProjectMaterialRecords(detail, filamentInventory);
  if (materialRecords.some(({ material }) => !isFilamentCompatibleWithPrinter(normalizedPrinter, material))) return false;
  const requiredSlots = getProjectRequiredMaterialSlots(detail, materialRecords);
  const compatibleFeeders = getPrinterFeeders(normalizedPrinter, feeders);
  if (requiredSlots > 1 && compatibleFeeders.length === 0) return false;
  const feederSlots = compatibleFeeders.reduce((total, feeder) => total + (Number(feeder.filamentSlots) || 0), 0);
  return Math.max(feederSlots || normalizedPrinter.filamentSlots || 1, 1) >= requiredSlots;
};

const getBestProjectPrinter = (printers, project, feeders, filamentInventory) => {
  const details = Array.isArray(project?.projectDetails) ? project.projectDetails : [];
  const detailsToCheck = details.length > 0 ? details : [project];
  const assignedIds = [
    project?.printerId,
    ...detailsToCheck.flatMap((detail) => [detail?.printerId, ...(detail?.productionJobs || []).map((job) => job?.printerId)])
  ].filter(Boolean).map(String);
  const assignedCandidates = [...new Set(assignedIds)]
    .map((id) => (printers || []).find((printer) => String(printer.id) === id))
    .filter(Boolean);
  const assignedCandidateIds = new Set(assignedCandidates.map((printer) => String(printer.id)));
  const candidates = [
    ...assignedCandidates,
    ...(printers || []).filter((printer) => !assignedCandidateIds.has(String(printer.id)))
  ];
  const detailSelections = detailsToCheck.map((detail) => candidates.find((printer) => (
    printerCanAccommodateProjectDetail(printer, detail, feeders, filamentInventory)
  )) || null);
  return {
    printer: detailSelections[0] || assignedCandidates[0] || null,
    isCompatible: detailSelections.length > 0 && detailSelections.every(Boolean),
    detailSelections
  };
};

function getProjectStatusIndicators(project, { printers, feeders, filamentInventory, orders, shippingSettings, rates }) {
  const details = Array.isArray(project?.projectDetails) ? project.projectDetails : [];
  const printerAvailable = getBestProjectPrinter(printers, project, feeders, filamentInventory).isCompatible;

  const materialEntries = details.flatMap((detail) => (
    Array.isArray(detail?.materials) && detail.materials.length > 0
      ? detail.materials
      : detail?.material ? [detail.material] : []
  ));
  const materialsAvailable = materialEntries.length > 0 && materialEntries.every((entry) => {
    const material = entry?.material || entry?.normalizedMaterial || entry;
    if (!material) return false;
    const status = String(material.status || '').trim().toLowerCase();
    const requiredWeight = Number(entry?.shareWeight ?? entry?.weight ?? 0);
    const remainingWeight = Number(material.remaining ?? material.weight ?? 0);
    return entry?.isUpfront !== true
      && material.isUpfront !== true
      && status !== 'upfront'
      && remainingWeight > 0
      && (requiredWeight <= 0 || remainingWeight >= requiredWeight);
  });

  const schedule = shippingSettings?.availabilitySchedule;
  const unavailableDates = getUnavailableDateSet(schedule, 'printing');
  const unavailableWeekdays = getUnavailableWeekdaySet(schedule, 'printing');
  const firstAvailable = findFirstAvailable(
    getOccupiedDates(orders, schedule),
    unavailableDates,
    unavailableWeekdays
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const canStartToday = Boolean(firstAvailable && toDateKey(firstAvailable) === toDateKey(today));

  const is3MF = project?.method?.name?.toUpperCase() === '3MF';
  const activeDesignServices = rates?.['design-services'] || {};
  const hasDesignService = Boolean(
    !is3MF
    && project?.selectedDesignService
    && activeDesignServices[project.selectedDesignService]?.status === true
  );

  return {
    printerAvailable,
    materialsAvailable,
    canStartToday,
    hasDesignService,
    fileLinkIsValid: isValidProjectFileLink(project?.gdriveLink)
  };
}

function getOfferHoursLeft(item, now) {
  const expiry = valueToMillis(item?.offerExpiresAt);
  if (!expiry || !now || expiry <= now) return 0;
  return Math.max(1, Math.ceil((expiry - now) / (60 * 60 * 1000)));
}

function parseBasketDealDate(value, endOfDay = false) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (Number.isFinite(Number(value?.seconds))) return new Date(Number(value.seconds) * 1000);
  const raw = String(value);
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T${endOfDay ? '23:59:59' : '00:00:00'}`
    : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isBundleDealActive(deal, now = Date.now()) {
  if (!deal || !['bundle', 'bundle_only', 'bundle_discount'].includes(deal.type) || deal.isActive === false) return false;
  const validFrom = parseBasketDealDate(deal.validFrom);
  const validUntil = parseBasketDealDate(deal.validUntil, true);
  return !(validFrom && validFrom.getTime() > now) && !(validUntil && validUntil.getTime() <= now);
}

function isOnHandStock(stock = {}) {
  const status = String(stock?.status || '').toLowerCase().trim();
  return status === 'onhand' || status === 'on hand';
}

function isPreOrderStock(stock = {}) {
  const status = String(stock?.status || '').toLowerCase().trim();
  return status.includes('pre') || status.includes('batch') || status.includes('eta');
}

const BASKET_SELECTION_STORAGE_KEY = 'snorlaxgarage:basket-selection-restore';
const BASKET_SCROLL_TARGET_STORAGE_KEY = 'snorlaxgarage:basket-scroll-target';

export default function Cart() {
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isCartPath = location.pathname === '/cart' || location.pathname === '/basket';
  const { 
    user, isAnonymousUser, basket, shelf, isAdmin, isAdminView, removeFromBasket, kits, userOffers, userOffersLoaded, addToBasket, addProjectToBasket, decrementProjectQuantity,
    guestBasket, isLoading, setLoginModalOpen, shippingSettings, loadMissingKits, refreshBasket, keepOneOfEachToShelf, deals, loadBlueprintProductionStatuses,
    orders, printers, feeders, filamentInventory, rates, projectVault, blueprints
  } = useStore();
  const [isKeepingOnes, setIsKeepingOnes] = useState(false);
  const [offerNow, setOfferNow] = useState(0);
  const [projectProductionStatuses, setProjectProductionStatuses] = useState({});
  const [isProjectStatusLoading, setIsProjectStatusLoading] = useState(false);
  const restoredScrollTargetRef = useRef('');
  const [manualSelectedIds, setManualSelectedIds] = useState(() => (
    Array.isArray(location.state?.restoreSelectionIds)
      ? location.state.restoreSelectionIds
      : []
  ));
  const [isLoginPromptOpen, setLoginPromptOpen] = useState(false);
  const [itemsForCheckout, setItemsForCheckout] = useState([]);

  useEffect(() => {
    const timer = window.setInterval(() => setOfferNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const storedActiveBasket = user && !isAnonymousUser
    ? ((isAdmin && isAdminView) ? shelf : basket)
    : guestBasket;

  // Cart rows are persisted snapshots, but the source kit/project records can
  // change after an item was added. Overlay the latest source data so names,
  // media, stock details, project totals, and printer assignments stay live.
  const activeBasket = useMemo(() => (
    (storedActiveBasket || []).map((item) => {
      if (item.type === 'project') {
        const storedProject = item.projectData || {};
        const liveProject = storedProject.vaultId
          ? (projectVault || []).find((project) => project.vaultId === storedProject.vaultId)
          : (blueprints || []).find((project) => String(project.id) === String(storedProject.id));

        if (!liveProject) return item;

        const projectData = { ...storedProject, ...liveProject };
        const liveTotal = projectData.totals?.total ?? projectData.displayPrice ?? projectData.price;
        const liveDownpayment = projectData.totals?.dp ?? projectData.minDownpayment;

        return {
          ...item,
          name: getProjectBasketName(projectData),
          projectData,
          ...(liveTotal != null ? { price: liveTotal } : {}),
          ...(liveDownpayment != null ? { minDownpayment: liveDownpayment } : {})
        };
      }

      const kit = (kits || []).find((candidate) => String(candidate.id) === String(item.id));
      const stock = kit?.stocks?.[item.stockKey];
      const isDealItem = isBundleOrClearanceItem(item);
      const liveSellPrice = Number(stock?.sellPrice);
      const shouldRefreshStandalonePrice = !isDealItem && !item.offerId && liveSellPrice > 0;

      return {
        ...item,
        ...(kit?.name ? { name: kit.name } : {}),
        ...(kit?.image ? { image: kit.image } : {}),
        ...(kit?.images ? { images: kit.images } : {}),
        ...(kit?.brand ? { brand: kit.brand } : {}),
        ...(kit?.specs ? { specs: kit.specs } : {}),
        ...(stock ? {
          status: stock.status || item.status,
          eta: getStockEta(stock) || item.eta,
          ...(stock.costPrice != null ? { costPrice: stock.costPrice } : {}),
          ...(shouldRefreshStandalonePrice ? {
            sellPrice: liveSellPrice,
            price: liveSellPrice
              + Number(item.appliedHandlingFee || 0)
              + Number(item.appliedInstallmentFee || 0)
              + Number(item.appliedTransferFee || 0)
          } : {})
        } : {})
      };
    })
  ), [blueprints, kits, projectVault, storedActiveBasket]);

  const restoreSelectionIdsFromLocation = location.state?.restoreSelectionIds;
  const scrollToBasketIdFromLocation = location.state?.scrollToBasketId;

  useEffect(() => {
    let restoreSelectionIds = Array.isArray(restoreSelectionIdsFromLocation)
      ? restoreSelectionIdsFromLocation
      : null;

    if (!restoreSelectionIds && typeof window !== 'undefined') {
      try {
        const storedSelection = window.sessionStorage.getItem(BASKET_SELECTION_STORAGE_KEY);
        restoreSelectionIds = storedSelection ? JSON.parse(storedSelection) : null;
      } catch (error) {
        console.warn('SG LOG: Unable to restore basket selection:', error);
      }
    }

    if (!Array.isArray(restoreSelectionIds) || activeBasket.length === 0) return;

    const availableBasketIds = new Map(
      activeBasket
        .map((item) => [String(item.basketId || ''), item.basketId])
        .filter(([basketId]) => basketId)
    );
    const restoredIds = [...new Set(
      restoreSelectionIds
        .map((basketId) => availableBasketIds.get(String(basketId || '')))
        .filter(Boolean)
    )];

    if (restoredIds.length > 0) {
      setManualSelectedIds((currentIds) => (
        currentIds.length === restoredIds.length
          && currentIds.every((basketId) => restoredIds.some((restoredId) => String(restoredId) === String(basketId)))
          ? currentIds
          : restoredIds
      ));
    }

    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(BASKET_SELECTION_STORAGE_KEY);
    }
  }, [activeBasket, restoreSelectionIdsFromLocation]);

  const projectBlueprintIds = useMemo(() => (
    [...new Set(
      activeBasket
        .filter((item) => item.type === 'project')
        .map((item) => item.projectData?.id)
        .filter(Boolean)
        .map((id) => String(id))
    )]
  ), [activeBasket]);

  useEffect(() => {
    let cancelled = false;

    if (projectBlueprintIds.length === 0) {
      setProjectProductionStatuses({});
      setIsProjectStatusLoading(false);
      return undefined;
    }

    setIsProjectStatusLoading(true);
    loadBlueprintProductionStatuses(projectBlueprintIds)
      .then((statuses) => {
        if (!cancelled) setProjectProductionStatuses(statuses || {});
      })
      .catch((error) => {
        console.error('SG LOG: Project production status refresh failed:', error);
        if (!cancelled) setProjectProductionStatuses({});
      })
      .finally(() => {
        if (!cancelled) setIsProjectStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadBlueprintProductionStatuses, projectBlueprintIds]);

  const stoppedProjectBasketIds = useMemo(() => (
    activeBasket
      .filter((item) => item.type === 'project')
      .filter((item) => {
        if (item.projectData?.canAddToBasket === false) return true;
        const blueprintId = item.projectData?.id ? String(item.projectData.id) : '';
        return Boolean(blueprintId && projectProductionStatuses[blueprintId] === false);
      })
      .map((item) => item.basketId)
      .filter(Boolean)
  ), [activeBasket, projectProductionStatuses]);

  const liveProjectIssueByBasketId = useMemo(() => {
    const issueByBasketId = new Map();

    activeBasket
      .filter((item) => item.type === 'project')
      .forEach((item) => {
        const storedProject = item.projectData || {};
        const liveProject = storedProject.vaultId
          ? (projectVault || []).find((project) => project.vaultId === storedProject.vaultId)
          : (blueprints || []).find((project) => String(project.id) === String(storedProject.id));
        const project = liveProject || storedProject;
        const isGarageProject = !storedProject.vaultId && Boolean(storedProject.id);

        if (isGarageProject) {
          const blueprintId = String(project?.id || storedProject.id);
          if (project?.canAddToBasket === false || projectProductionStatuses[blueprintId] === false) {
            issueByBasketId.set(item.basketId, 'Production Stopped');
            return;
          }
        }

        // Preserve readiness captured when this basket entry was created if
        // the source project is no longer available in the live collections.
        // This keeps older/stale basket records actionable without turning
        // missing live data into a false printer issue.
        if (!liveProject && storedProject.projectStatusIndicators) {
          const storedIndicators = storedProject.projectStatusIndicators;
          const storedIssue = storedIndicators.printer !== true
            ? 'Printer Issue'
            : storedIndicators.materials !== true
              ? 'Material Issue'
              : storedIndicators.schedule !== true
                ? 'Schedule Issue'
                : storedIndicators.design !== true && !isGarageProject
                  ? 'File Link Issue'
                  : null;

          if (storedIssue) issueByBasketId.set(item.basketId, storedIssue);
          return;
        }

        const indicators = getProjectStatusIndicators(project, {
          printers,
          feeders,
          filamentInventory,
          orders,
          shippingSettings,
          rates
        });
        const issue = !indicators.printerAvailable
          ? 'Printer Issue'
          : !indicators.materialsAvailable
            ? 'Material Issue'
            : !indicators.canStartToday
              ? 'Schedule Issue'
              : !indicators.hasDesignService && !indicators.fileLinkIsValid && !isGarageProject
                ? 'File Link Issue'
                : null;

        if (issue) issueByBasketId.set(item.basketId, issue);
      });

    return issueByBasketId;
  }, [activeBasket, blueprints, feeders, filamentInventory, orders, printers, projectProductionStatuses, projectVault, rates, shippingSettings]);

  const liveInvalidProjectBasketIds = useMemo(
    () => [...liveProjectIssueByBasketId.keys()].filter(Boolean),
    [liveProjectIssueByBasketId]
  );

  const activeSelection = useMemo(() => {
    // Restore the canonical live basket IDs. Basket IDs can arrive from
    // location/session storage as strings while Firestore-backed basket rows
    // may expose the same ID with a different primitive type.
    const selectedIds = new Set(manualSelectedIds.map((id) => String(id || '')));
    return activeBasket
      .map((item) => item.basketId)
      .filter((basketId) => basketId && selectedIds.has(String(basketId)));
  }, [activeBasket, manualSelectedIds]);

  const selectedBundleDeals = useMemo(() => {
    const selectedKitIds = new Set(
      activeBasket
        .filter((item) => activeSelection.includes(item.basketId) && item.type !== 'project')
        .map((item) => String(item.id))
        .filter(Boolean)
    );
    if (selectedKitIds.size === 0) return [];

    const completeBundles = (deals || []).filter((deal) => {
      if (!isBundleDealActive(deal, offerNow)) return false;
      const bundleKitIds = [...new Set((deal.kitIds || []).map(String).filter(Boolean))];
      return bundleKitIds.length > 1 && bundleKitIds.every((kitId) => selectedKitIds.has(kitId));
    });

    const getBundleDiscount = (deal) => {
      const configuredDiscount = Number(deal.discountAmount);
      if (Number.isFinite(configuredDiscount)) return Math.max(0, configuredDiscount);

      const bundleKitIds = [...new Set((deal.kitIds || []).map(String).filter(Boolean))];
      const normalTotal = bundleKitIds.reduce((sum, kitId) => {
        const item = activeBasket.find((candidate) => String(candidate.id) === kitId && candidate.type !== 'project');
        const kit = kits.find((candidate) => String(candidate.id) === kitId);
        const stock = kit?.stocks?.[item?.stockKey];
        return sum + Number(stock?.sellPrice || item?.sellPrice || item?.price || 0);
      }, 0);
      return Math.max(0, normalTotal - Number(deal.bundlePrice || 0));
    };

    return completeBundles
      .sort((a, b) => getBundleDiscount(b) - getBundleDiscount(a));
  }, [activeBasket, activeSelection, deals, kits, offerNow]);

  const activeBundleDealIds = useMemo(() => (
    new Set((deals || [])
      .filter((deal) => isBundleDealActive(deal, offerNow))
      .map((deal) => String(deal.id)))
  ), [deals, offerNow]);

  const bundleDealTagKitIds = useMemo(() => {
    const basketKitIds = new Set(
      activeBasket
        .filter((item) => item.type !== 'project')
        .map((item) => String(item.id))
        .filter(Boolean)
    );
    const selectedKitIds = new Set(
      activeBasket
        .filter((item) => activeSelection.includes(item.basketId) && item.type !== 'project')
        .map((item) => String(item.id))
        .filter(Boolean)
    );
    const tagKitIds = new Set();

    // Tags describe each complete bundle represented in the basket. The
    // highest-discount complete bundle is still selected separately for
    // pricing, but lower-discount bundles must remain visibly identifiable.
    (deals || []).forEach((deal) => {
      if (!isBundleDealActive(deal, offerNow)) return;
      const bundleKitIds = [...new Set((deal.kitIds || []).map(String).filter(Boolean))];
      if (
        bundleKitIds.length > 1
        && bundleKitIds.every((kitId) => basketKitIds.has(kitId))
        && bundleKitIds.some((kitId) => selectedKitIds.has(kitId))
      ) {
        bundleKitIds.forEach((kitId) => tagKitIds.add(kitId));
      }
    });

    return tagKitIds;
  }, [activeBasket, activeSelection, deals, offerNow]);

  const mutuallyExclusiveConflict = useMemo(() => {
    const selectedKitIds = new Set(
      activeBasket
        .filter(item => activeSelection.includes(item.basketId) && item.type !== 'project' && item.id)
        .map(item => item.id)
    );

    return (deals || []).find(deal => {
      if (deal?.type !== 'mutually_exclusive' || deal.isActive === false) return false;
      const dealKitIds = Array.from(new Set(deal.kitIds || []));
      const configuredPairs = (deal.mutuallyExclusivePairs || []).filter(pair => pair?.bandaiId && pair?.bootlegId);
      const bandaiKitIds = deal.mutuallyExclusiveGroups?.bandai || deal.bandaiKitIds || [];
      const bootlegKitIds = deal.mutuallyExclusiveGroups?.bootleg || deal.bootlegKitIds || [];
      const conflictingPair = configuredPairs.length > 0
        ? configuredPairs.find(pair => selectedKitIds.has(pair.bandaiId) && selectedKitIds.has(pair.bootlegId))
        : null;
      const hasGroupedRule = bandaiKitIds.length > 0 && bootlegKitIds.length > 0;
      const hasConflict = configuredPairs.length > 0
        ? Boolean(conflictingPair)
        : hasGroupedRule
          ? bandaiKitIds.some(kitId => selectedKitIds.has(kitId))
            && bootlegKitIds.some(kitId => selectedKitIds.has(kitId))
        : dealKitIds.length >= 2 && dealKitIds.every(kitId => selectedKitIds.has(kitId));
      if (!hasConflict) return false;

      const validFrom = deal.validFrom ? new Date(deal.validFrom).getTime() : 0;
      const validUntil = deal.validUntil ? new Date(deal.validUntil).getTime() : 0;
      if (validFrom > 0 && validFrom > offerNow) return false;
      if (validUntil > 0 && validUntil <= offerNow) return false;
      return {
        ...deal,
        conflictKitIds: conflictingPair
          ? [conflictingPair.bandaiId, conflictingPair.bootlegId]
          : dealKitIds
      };
    }) || null;
  }, [activeBasket, activeSelection, deals, offerNow]);

  const missingKitIds = useMemo(() => {
    const loadedKitIds = new Set((kits || []).map((kit) => kit.id));
    return [...new Set(
      activeBasket
        .filter((item) => item.type !== 'project' && item.id && !loadedKitIds.has(item.id))
        .map((item) => item.id)
    )];
  }, [activeBasket, kits]);

  useEffect(() => {
    const activeBasketIds = activeBasket.map(item => item.id);
    if (activeBasketIds.length > 0) {
      loadMissingKits(activeBasketIds);
    }
  }, [activeBasket, loadMissingKits]);

  useEffect(() => {
    if (!isCartPath && location.pathname !== '/shelf') return;

    void refreshBasket().catch((error) => {
      console.error('SG LOG: Basket refresh on return failed:', error);
    });
  }, [isAdmin, isAdminView, isAnonymousUser, isCartPath, location.pathname, refreshBasket, user?.uid]);

  useEffect(() => {
    if (isAdmin) {
      if (isAdminView && location.pathname !== '/shelf') {
        navigate('/shelf', { replace: true });
      } else if (!isAdminView && !isCartPath) {
        navigate('/cart', { replace: true });
      }
    }
  }, [isAdminView, isAdmin, isCartPath, navigate, location.pathname]);
  
  const isOfferStateLoading = Boolean(user && !isAnonymousUser && !isAdminView && !userOffersLoaded);
  const isBasketRowsLoading = isLoading || missingKitIds.length > 0 || isOfferStateLoading || isProjectStatusLoading;

  const { handlingFee, installmentFee, transferFee } = useMemo(() => {
    return getCheckoutPaymentFees({ shippingSettings });
  }, [shippingSettings]);

  const basketOrderFees = useMemo(() => ({
    handling: activeBasket.some(item => !isBundleOrClearanceItem(item))
      ? Math.max(
        Number(handlingFee) || 0,
        ...activeBasket.map(item => Number(item.appliedHandlingFee) || 0)
      )
      : 0,
    transfer: activeBasket.some(item => !isBundleOrClearanceItem(item))
      ? Math.max(
        Number(transferFee) || 0,
        ...activeBasket.map(item => Number(item.appliedTransferFee) || 0)
      )
      : 0
  }), [activeBasket, handlingFee, transferFee]);

  // Handling and transfer fees are charged once per selected basket set. Use
  // the selected unit count as the denominator so a quantity of two receives
  // two shares while the order still receives only one fee of each type.
  const selectedFeeUnitCount = useMemo(() => (
    activeBasket
      .filter(item => activeSelection.includes(item.basketId) && !isBundleOrClearanceItem(item))
      .reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0)
  ), [activeBasket, activeSelection]);

  const getBasketStandaloneFeeShare = useCallback((item) => {
    if (isBundleOrClearanceItem(item)) {
      return { handling: 0, transfer: 0 };
    }
    const isSelected = Array.isArray(item.basketIds)
      ? item.basketIds.some(id => activeSelection.includes(id))
      : activeSelection.includes(item.basketId);
    if (isSelected && selectedFeeUnitCount > 1) {
      const selectedItems = activeBasket.filter(candidate => activeSelection.includes(candidate.basketId) && !isBundleOrClearanceItem(candidate));
      const targetKey = getBasketItemGroupKey(item);
      const targetIndex = selectedItems.findIndex(candidate => getBasketItemGroupKey(candidate) === targetKey);
      const selectedFeeUnitIndex = targetIndex < 0
        ? 0
        : selectedItems
          .slice(0, targetIndex)
          .reduce((sum, candidate) => sum + Math.max(1, Number(candidate.quantity) || 1), 0);
      return {
        handling: getIntegerFeeShare(basketOrderFees.handling, selectedFeeUnitCount, selectedFeeUnitIndex),
        transfer: getIntegerFeeShare(basketOrderFees.transfer, selectedFeeUnitCount, selectedFeeUnitIndex)
      };
    }
    return {
      handling: getBasketFee(item, 'appliedHandlingFee', handlingFee),
      transfer: getBasketFee(item, 'appliedTransferFee', transferFee)
    };
  }, [activeBasket, activeSelection, basketOrderFees, handlingFee, selectedFeeUnitCount, transferFee]);

  const getBasketStandalonePrice = useCallback((item) => {
    if (item.type === 'project') return Number(item.projectData?.sellPrice || item.price || 0);
    if (isBundleOrClearanceItem(item)) return Number(item.price || item.sellPrice || 0);

    const kit = kits.find(k => k.id === item.id);
    const stockSellPrice = Number(getStockStandaloneSellPrice(item, kit) || 0);
    const itemInstallmentFee = getBasketFee(item, 'appliedInstallmentFee', installmentFee);
    const { handling: itemHandlingFee, transfer: itemTransferFee } = getBasketStandaloneFeeShare(item);
    const basePrice = stockSellPrice > 0
      ? stockSellPrice
      : Math.max(0, Number(item.price || 0) - (
        itemHandlingFee + itemInstallmentFee + itemTransferFee
      ));
    return basePrice + itemHandlingFee + itemInstallmentFee + itemTransferFee;
  }, [getBasketStandaloneFeeShare, installmentFee, kits]);

  const selectedClearancePricing = useMemo(() => {
    const selectedItems = activeBasket.filter((item) => activeSelection.includes(item.basketId));
    if (selectedItems.length < 2 || selectedBundleDeals.length > 0) return { prices: new Map(), sourceBasketId: '' };

    const selectedRows = selectedItems.filter((item) => {
      if (item.type === 'project') return false;
      const kit = kits.find((candidate) => candidate.id === item.id);
      const stock = kit?.stocks?.[item.stockKey];
      return isOnHandStock(stock || item);
    });
    if (selectedRows.length !== selectedItems.length) return { prices: new Map(), sourceBasketId: '' };

      const rowsByKitId = new Map(selectedRows.map((item) => {
        const kit = kits.find((candidate) => candidate.id === item.id);
        const stock = kit?.stocks?.[item.stockKey];
        return [String(item.id), {
        item,
        kit,
        kitId: String(item.id),
        refPrice: Number(stock?.sellPrice || item.sellPrice || kit?.sellPrice || item.price || 0),
          sellPrice: Number(stock?.sellPrice || item.sellPrice || kit?.sellPrice || item.price || 0),
          costPrice: Number(stock?.costPrice || item.costPrice || 0),
          isOnHand: isOnHandStock(stock || item)
        }];
      }));

    const candidates = (deals || [])
      .filter((deal) => deal?.type === 'clearance' && deal.isActive !== false)
      .map((deal) => {
        const configuredIds = Array.isArray(deal.clearanceKitIds) && deal.clearanceKitIds.length > 0
          ? deal.clearanceKitIds
          : deal.clearanceKitId
            ? [deal.clearanceKitId]
            : (deal.kitIds || []).slice(0, 1);
        const selectedClearanceKitIds = [...new Set(configuredIds.map(String))]
          .filter((kitId) => rowsByKitId.get(kitId)?.isOnHand);
        if (selectedClearanceKitIds.length === 0) return null;

        const rows = [...rowsByKitId.values()];
        const clearanceDiscountOverrides = { ...(deal.clearanceDiscounts || {}) };
        // Older and currently saved clearance records also persist the
        // authoritative per-kit amount under kitDiscounts. Use it whenever
        // the editable clearanceDiscounts map has no value for a kit.
        selectedClearanceKitIds.forEach((kitId) => {
          const configuredDiscount = clearanceDiscountOverrides[kitId];
          if (configuredDiscount !== '' && configuredDiscount !== null && configuredDiscount !== undefined) return;

          const storedDiscount = deal.kitDiscounts?.[kitId]?.discount;
          const storedClearancePrice = Number(deal.kitDiscounts?.[kitId]?.clearancePrice || 0);
          const row = rows.find((candidate) => candidate.kitId === kitId);
          const storedPriceDiscount = row && storedClearancePrice > 0
            ? Math.max(0, row.sellPrice - storedClearancePrice)
            : 0;
          const persistedDiscount = storedPriceDiscount || Number(storedDiscount || 0);
          if (persistedDiscount > 0) clearanceDiscountOverrides[kitId] = persistedDiscount;
        });
        // Sum the selected kits' discount ceilings into the clearance pool,
        // then distribute it across every selected row, including the
        // additional "+1 or more" kit.
        const selectedClearancePricing = getClearanceBundlePricing(
          rows,
          selectedClearanceKitIds,
          clearanceDiscountOverrides
        );
        const clearanceDistributionTotal = selectedClearancePricing.rows
          .filter(row => row.isClearance)
          .reduce((sum, row) => sum + Math.max(0, Math.round(Number(row.clearanceDiscount || 0))), 0);
        const clearancePricing = getClearanceBundlePricing(
          rows,
          selectedClearanceKitIds,
          // The summed ceilings are already captured in the distribution total
          // above. Clear row overrides here so the pool is split across all
          // selected kits instead of fixing one row.
          {},
          clearanceDistributionTotal > 0
            ? {
              distributeAcrossRows: true,
              distributionTotal: clearanceDistributionTotal
            }
            : undefined
        );
        const pricedRows = clearancePricing.rows;
        const savings = pricedRows.reduce((sum, row) => sum + Math.max(0, row.refPrice - row.finalPrice), 0);
        const clearanceDiscount = pricedRows.reduce((sum, row) => sum + Number(row.clearanceDiscount || 0), 0);
        const sourceRow = pricedRows.find(row => row.isClearance);
        return savings > 0
          ? { pricedRows, savings, clearanceDiscount, sourceBasketId: sourceRow?.item?.basketId || '' }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.clearanceDiscount - a.clearanceDiscount || b.savings - a.savings);

    const best = candidates[0];
    return best
      ? {
        prices: new Map(best.pricedRows.map((row) => [row.item.basketId, row.finalPrice])),
        sourceBasketId: best.sourceBasketId || ''
      }
      : { prices: new Map(), sourceBasketId: '' };
  }, [activeBasket, activeSelection, deals, kits, selectedBundleDeals]);

  // Tag selected on-hand rows as soon as a selected row is a member of an
  // active clearance deal. Pricing still waits for the normal distribution
  // rules above, but the tag should not disappear just because there is only
  // one selected row yet.
  const selectedClearanceTagKitIds = useMemo(() => {
    if (selectedBundleDeals.length > 0) return new Set();

    const selectedOnHandKitIds = new Set(
      activeBasket
        .filter((item) => (
          item.type !== 'project'
          && activeSelection.includes(item.basketId)
          && isOnHandStock(kits.find((kit) => kit.id === item.id)?.stocks?.[item.stockKey] || item)
        ))
        .map((item) => String(item.id))
        .filter(Boolean)
    );
    if (selectedOnHandKitIds.size === 0) return new Set();

    const tagKitIds = new Set();
    (deals || []).forEach((deal) => {
      if (deal?.type !== 'clearance' || deal.isActive === false) return;
      const eligibleKitIds = new Set(
        (deal.clearanceKitIds?.length ? deal.clearanceKitIds : deal.kitIds || [])
          .map(String)
          .filter(Boolean)
      );
      if (![...eligibleKitIds].some((kitId) => selectedOnHandKitIds.has(kitId))) return;
      selectedOnHandKitIds.forEach((kitId) => tagKitIds.add(kitId));
    });
    return tagKitIds;
  }, [activeBasket, activeSelection, deals, kits, selectedBundleDeals]);

  const selectedBundlePriceByBasketId = useMemo(() => {
    const prices = new Map();
    selectedBundleDeals.forEach((bundleDeal) => {
      const selectedBundleKitIds = new Set((bundleDeal.kitIds || []).map(String));
      const selectedItems = activeBasket.filter((item) => (
        activeSelection.includes(item.basketId)
        && selectedBundleKitIds.has(String(item.id))
      ));
      const rows = selectedItems.map((item) => {
        const kit = kits.find((candidate) => candidate.id === item.id);
        const referencePrice = Math.max(0, Number(
          getStockStandaloneSellPrice(item, kit) || item.sellPrice || item.price || 0
        ));
        return {
          item,
          kitId: item.id,
          refPrice: referencePrice,
          sellPrice: referencePrice,
          costPrice: Number(kit?.stocks?.[item.stockKey]?.costPrice || item.costPrice || 0)
        };
      });

      const normalTotal = rows.reduce((sum, row) => sum + row.sellPrice, 0);
      if (rows.length === 0 || normalTotal <= 0) return;

      const discountAmount = Number(
        bundleDeal.discountAmount
        ?? Math.max(0, normalTotal - Number(bundleDeal.bundlePrice || 0))
      ) || 0;
      const pricedRows = getBundleDealPricing(rows, discountAmount).rows;
      pricedRows.forEach((row) => {
        // Complete bundles are normally disjoint. If legacy data overlaps
        // them, keep the lower resulting price instead of double-discounting.
        const currentPrice = prices.get(row.item.basketId);
        prices.set(
          row.item.basketId,
          currentPrice === undefined ? row.finalPrice : Math.min(currentPrice, row.finalPrice)
        );
      });
    });

    return prices;
  }, [activeBasket, activeSelection, kits, selectedBundleDeals]);

  const isBasketBundleFullySelected = useCallback((item) => {
    if (!isBundleOrClearanceItem(item) || !item.bundleId) return false;
    const bundleItems = activeBasket.filter(candidate => candidate.bundleId === item.bundleId);
    if (bundleItems.length === 0) return false;
    const selectedCount = bundleItems.reduce((count, candidate) => (
      activeSelection.includes(candidate.basketId) ? count + 1 : count
    ), 0);
    const expectedSize = Math.max(bundleItems.length, Number(item.bundleSize) || 0);
    return selectedCount === bundleItems.length &&
      bundleItems.length >= expectedSize;
  }, [activeBasket, activeSelection]);

  const getBasketDiscountedPrice = useCallback((item) => {
    const standalonePrice = getBasketStandalonePrice(item);
    if (item.type === 'project') return standalonePrice;

    const { handling, transfer } = getBasketStandaloneFeeShare(item);
    const totalFees = handling
      + getBasketFee(item, 'appliedInstallmentFee', installmentFee)
      + transfer;
    const standaloneBasePrice = Math.max(0, standalonePrice - totalFees);

    const selectedBundlePrice = Array.isArray(item.basketIds)
      ? item.basketIds
        .map((basketId) => selectedBundlePriceByBasketId.get(basketId))
        .find((price) => Number.isFinite(price))
      : selectedBundlePriceByBasketId.get(item.basketId);
    if (Number.isFinite(selectedBundlePrice)) return selectedBundlePrice;

    const selectedClearancePrice = Array.isArray(item.basketIds)
      ? item.basketIds
        .map((basketId) => selectedClearancePricing.prices.get(basketId))
        .find((price) => Number.isFinite(price))
      : selectedClearancePricing.prices.get(item.basketId);
    if (Number.isFinite(selectedClearancePrice)) return selectedClearancePrice;

    if (isBasketBundleFullySelected(item) && activeBundleDealIds.has(String(item.bundleId))) {
      const dealPrice = Number(item.appliedBundlePrice || item.price || item.sellPrice || 0);
      if (dealPrice > 0) return dealPrice;
    }

    const offerPrice = Number(item.offerPrice || 0);
    const isSelected = Array.isArray(item.basketIds)
      ? item.basketIds.some(id => activeSelection.includes(id))
      : activeSelection.includes(item.basketId);
    if (offerPrice > 0 && isSelected) return offerPrice;

    return standaloneBasePrice;
  }, [activeBundleDealIds, activeSelection, getBasketStandaloneFeeShare, getBasketStandalonePrice, installmentFee, isBasketBundleFullySelected, selectedBundlePriceByBasketId, selectedClearancePricing]);

  const getBasketPriceComparison = useCallback((item) => {
    const standalonePrice = getBasketStandalonePrice(item);
    const isSelected = Array.isArray(item.basketIds)
      ? item.basketIds.some(id => activeSelection.includes(id))
      : activeSelection.includes(item.basketId);
    const discountedPrice = getBasketDiscountedPrice(item);
    const displayPrice = discountedPrice;

    return {
      discountedPrice,
      standalonePrice,
      displayPrice,
      amount: Math.max(0, standalonePrice - discountedPrice),
      isSelected,
      isDiscounted: standalonePrice > discountedPrice
    };
  }, [activeSelection, getBasketDiscountedPrice, getBasketStandalonePrice]);

  const getEffectiveItemPrice = useCallback((item) => {
    // Return displayPrice (final price)
    if (item.type === 'project') return Number(item.projectData?.displayPrice || item.projectData?.sellPrice || item.price || 0);
    if (isBundleOrClearanceItem(item)) return Number(item.price || item.sellPrice || 0);
    const kit = kits.find(k => k.id === item.id);
    const stockSellPrice = Number(item.offerPrice || kit?.stocks?.[item.stockKey]?.sellPrice || 0);
    return stockSellPrice > 0 ? stockSellPrice : Number(item.price || 0);
  }, [kits]);

  const normalizeCheckoutItem = useCallback((item) => {
    const kit = kits.find(k => k.id === item.id);
    const stock = kit?.stocks?.[item.stockKey];
    const freeShippingUntil = item.freeShippingUntil || stock?.freeShippingUntil || '';
    const expiry = freeShippingUntil ? new Date(freeShippingUntil).getTime() : 0;
    const isFreeShippingEligible = Boolean(item.isFreeShippingEligible || stock?.isFreeShippingEligible) &&
      (!freeShippingUntil || Number.isNaN(expiry) || Date.now() < expiry);

    return {
      ...item,
      status: item.status || stock?.status,
      eta: getStockEta(stock || item),
      minDownpayment: item.minDownpayment ?? stock?.minDownpayment,
      price: getEffectiveItemPrice(item),
      appliedHandlingFee: isBundleOrClearanceItem(item)
        ? 0
        : Number(item.appliedHandlingFee) > 0 ? Number(item.appliedHandlingFee) : handlingFee,
      appliedInstallmentFee: isBundleOrClearanceItem(item)
        ? 0
        : Number(item.appliedInstallmentFee) > 0 ? Number(item.appliedInstallmentFee) : installmentFee,
      appliedTransferFee: isBundleOrClearanceItem(item)
        ? 0
        : Number(item.appliedTransferFee) > 0 ? Number(item.appliedTransferFee) : transferFee,
      isFreeShippingEligible,
      freeShippingUntil,
      freeShippingMethod: item.freeShippingMethod || stock?.freeShippingMethod || 'All',
      freeShippingSuboption: item.freeShippingSuboption || stock?.freeShippingSuboption || 'All'
    };
  }, [getEffectiveItemPrice, handlingFee, installmentFee, transferFee, kits]);

  const openCheckoutPage = (items, isGuestPreview = !user || isAnonymousUser) => {
    if (typeof window !== 'undefined' && activeSelection.length > 0) {
      window.sessionStorage.setItem(
        BASKET_SELECTION_STORAGE_KEY,
        JSON.stringify(activeSelection)
      );

      const firstBasketId = items
        .flatMap((item) => Array.isArray(item?.basketIds)
          ? item.basketIds
          : item?.basketId ? [item.basketId] : [])
        .find(Boolean);
      if (firstBasketId) {
        window.sessionStorage.setItem(BASKET_SCROLL_TARGET_STORAGE_KEY, firstBasketId);
      }
    }

    navigate('/checkout', {
      state: {
        items,
        isGuestPreview,
        returnPath: location.pathname
      }
    });
  };

  const validation = useMemo(() => {
    const safeActiveBasket = activeBasket || [];
    
    const itemRules = {};
    let isValid = true;

    const grouped = safeActiveBasket.reduce((acc, item) => {
        if (item.type === 'project') {
          const key = JSON.stringify(item.projectData);
          if (!acc[key]) {
              acc[key] = { ...item, qty: 0, basketIds: [], batchKey: 'project' };
          }
          acc[key].qty += (item.quantity || 1);
          acc[key].basketIds.push(item.basketId);
          return acc;
        }
        const kit = kits.find(k => k.id === item.id);
        const stock = kit?.stocks?.[item.stockKey];
        
        const status = stock?.status?.toLowerCase() || 'default';
        const effectiveEta = getStockEta(stock || item);
        const eta = effectiveEta ? `-${effectiveEta.toLowerCase().replace(/\s+/g, '-')}` : '';
        const batchIdentifier = `${status}${eta}`;
        
        const key = getBasketValidationKey(item.id, batchIdentifier, item.offerId);
        
        if (!acc[key]) acc[key] = { ...item, qty: 0, basketIds: [], batchKey: batchIdentifier };
        acc[key].qty += Math.max(1, Number(item.quantity) || 1);
        acc[key].basketIds.push(item.basketId);
        return acc;
    }, {});

    Object.values(grouped).forEach(item => {
        if (item.type === 'project') return;
        const kitSource = kits.find(k => k.id === item.id);
        const batchIdentifier = item.batchKey;

        const currentOffer = item.offerId
          ? (userOffers || []).find((offer) => offer.id === item.offerId)
          : null;
        // Do not validate offer-backed rows until the live offers listener has
        // finished loading. Once loaded, a missing offer or a changed released
        // stock key means the item was removed or returned to the shelf.
        if (item.offerId && !userOffersLoaded) return;
        
        const availableInBatch = Object.values(kitSource?.stocks || {}).filter(s => {
            const sStatus = s.status?.toLowerCase() || 'default';
            const effectiveEta = getStockEta(s);
            const sEta = effectiveEta ? `-${effectiveEta.toLowerCase().replace(/\s+/g, '-')}` : '';
            const sBatch = `${sStatus}${sEta}`;
            return sBatch === batchIdentifier && !s.isReserved && !s.order?.orderId;
        }).length;

        const isActiveOffer = item.offerId
          ? Boolean(
              currentOffer
              && currentOffer.uid === user?.uid
              && currentOffer.kitId === item.id
              && currentOffer.releasedStockKey === item.stockKey
              && isOfferCheckoutActive(currentOffer, offerNow)
              && isOfferCheckoutActive(item, offerNow)
            )
          : isOfferCheckoutActive(item, offerNow);
        const isReservedByOthers = (item.status === 'reserved'); 
        const availableLimit = item.offerId
          ? (isActiveOffer ? 1 : 0)
          : (isReservedByOthers ? 0 : availableInBatch);
        if (item.qty > availableLimit) {
            isValid = false;
            const key = getBasketValidationKey(item.id, batchIdentifier, item.offerId);
            const unit = item.status === 'onhand' ? 'stock' : 'slot';
            const unitType = availableLimit === 1 ? unit : `${unit}s`;
            itemRules[key] = {
                message: item.offerId && !isActiveOffer
                  ? 'Offer checkout window expired'
                  : `${availableLimit} ${unitType} left`,
                status: 'error',
                limit: availableLimit 
            };
        }
        });

    let totalPrice = 0;
    const selectedItems = safeActiveBasket.filter(i => activeSelection.includes(i.basketId));
    if (selectedItems.length > 0) {
      totalPrice = selectedItems.reduce((sum, item) => sum + (getBasketDiscountedPrice(item) * (item.quantity || 1)), 0);
    }

    return { isValid, itemRules, totalPrice, selectedItems };
  }, [activeBasket, activeSelection, getBasketDiscountedPrice, isAnonymousUser, kits, offerNow, user?.uid, userOffers, userOffersLoaded]);

  const invalidBasketItemIds = useMemo(() => {
    const toRemoveIds = [];
    Object.entries(validation.itemRules).forEach(([key, rule]) => {
      const limit = rule.limit ?? 0;
      const matchingItemsInBasket = activeBasket.filter(item => {
        const kit = kits.find(k => k.id === item.id);
        const stock = kit?.stocks?.[item.stockKey];
        const status = stock?.status?.toLowerCase() || 'default';
        const effectiveEta = getStockEta(stock || item);
        const eta = effectiveEta ? `-${effectiveEta.toLowerCase().replace(/\s+/g, '-')}` : '';
        return getBasketValidationKey(item.id, `${status}${eta}`, item.offerId) === key;
      });

      if (matchingItemsInBasket.length > limit) {
        const excessCount = matchingItemsInBasket.length - limit;
        const sorted = [...matchingItemsInBasket].sort((a, b) => (
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        ));
        toRemoveIds.push(...sorted.slice(0, excessCount).map(item => item.basketId));
      }
    });
    return [...new Set([...stoppedProjectBasketIds, ...liveInvalidProjectBasketIds, ...toRemoveIds])];
  }, [activeBasket, kits, liveInvalidProjectBasketIds, stoppedProjectBasketIds, validation.itemRules]);

  const autoInvalidBasketItemIds = useMemo(
    () => invalidBasketItemIds.filter((basketId) => (
      !liveProjectIssueByBasketId.has(basketId)
      || liveProjectIssueByBasketId.get(basketId) === 'Production Stopped'
    )),
    [invalidBasketItemIds, liveProjectIssueByBasketId]
  );

  const autoUpdatedValidationRef = useRef('');
  useEffect(() => {
    if (
      !isCartPath
      || (isAdmin && isAdminView)
      || isBasketRowsLoading
      || autoInvalidBasketItemIds.length === 0
    ) return;

    const updateSignature = autoInvalidBasketItemIds.join('|');
    if (autoUpdatedValidationRef.current === updateSignature) return;
    autoUpdatedValidationRef.current = updateSignature;

    setManualSelectedIds((currentIds) => (
      currentIds.filter((id) => !autoInvalidBasketItemIds.includes(id))
    ));

    void (async () => {
      for (const basketId of autoInvalidBasketItemIds) {
        await removeFromBasket(basketId);
      }
    })().catch((error) => {
      autoUpdatedValidationRef.current = '';
      console.error('SG LOG: Automatic basket update failed:', error);
    });
  }, [autoInvalidBasketItemIds, isAdmin, isAdminView, isBasketRowsLoading, isCartPath, location.pathname, removeFromBasket]);

  const shelfStats = useMemo(() => {
    if (!isAdmin || !isAdminView) return null;
    const shelfItems = activeBasket.filter(item => item.type !== 'project');
    const shelfStockIds = new Set(
      shelfItems
        .filter(item => item.id && item.stockKey)
        .map(item => `${item.id}:${item.stockKey}`)
    );

    const summarize = (items, getCost, getSell) => {
      const totalKits = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
      const totalCostPrice = items.reduce((sum, item) => {
      const qty = item.quantity || 1;
      const cost = Number(getCost(item)) || 0;
      return sum + (cost * qty);
      }, 0);
      const totalSellPrice = items.reduce((sum, item) => sum + ((Number(getSell(item)) || 0) * (Number(item.quantity) || 1)), 0);
      const possibleProfit = Math.max(0, totalSellPrice - totalCostPrice);
      return { totalKits, totalCostPrice, totalSellPrice, possibleProfit };
    };

    const onShelf = summarize(
      shelfItems,
      item => item.costPrice,
      item => getBasketStandalonePrice(item)
    );

    const notOnShelfUnsold = [];
    (kits || []).forEach(kit => {
      Object.entries(kit?.stocks || {}).forEach(([stockKey, stock]) => {
        const stockId = `${kit.id}:${stockKey}`;
        const status = String(stock?.status || '').trim().toLowerCase();
        const isSold = stock?.isSold === true || ['sold', 'out of stock', 'out-of-stock'].includes(status);
        if (shelfStockIds.has(stockId) || stock?.order?.orderId || isSold) return;
        notOnShelfUnsold.push({ ...stock, quantity: 1 });
      });
    });

    const offShelf = summarize(
      notOnShelfUnsold,
      item => item.costPrice,
      item => item.sellPrice
    );

    return { onShelf, offShelf };
  }, [isAdmin, isAdminView, activeBasket, getBasketStandalonePrice, kits]);

  const toggleSelectionGroup = useCallback((basketIds = []) => {
    const ids = [...new Set(basketIds.filter(Boolean))];
    if (ids.length === 0) return;

    setManualSelectedIds(prev => {
      const allGroupItemsSelected = ids.every((basketId) => prev.includes(basketId));
      if (allGroupItemsSelected) {
        return prev.filter((basketId) => !ids.includes(basketId));
      }

      return [...new Set([...prev, ...ids])];
    });
  }, []);

  const toggleSelectAll = () => {
    if (activeSelection.length === activeBasket.length) {
      setManualSelectedIds([]);
    } else {
      setManualSelectedIds(activeBasket.map(i => i.basketId));
    }
  };

  const confirmShelfRelease = useCallback((count = 1) => {
    if (!(isAdmin && isAdminView)) return true;
    const label = count === 1 ? 'this item' : `${count} selected items`;
    return window.confirm(`Release ${label} from the shelf? This will unreserve the stock.`);
  }, [isAdmin, isAdminView]);

  const handleRemoveBasketItem = useCallback((basketId, count = 1) => {
    if (!confirmShelfRelease(count)) return;
    removeFromBasket(basketId);
  }, [confirmShelfRelease, removeFromBasket]);

  const handleDecrementProjectItem = useCallback((basketId, count = 1) => {
    if (!confirmShelfRelease(count)) return;
    decrementProjectQuantity(basketId);
  }, [confirmShelfRelease, decrementProjectQuantity]);

  // const groupedItems = useMemo(() => {
  //   const grouped = activeBasket.reduce((acc, item) => {
  //     if (item.type === 'project') {
  //       const key = JSON.stringify(item.projectData);
  //       console.log("SG DEBUG: Grouping project key:", key, "Qty:", item.quantity);
  //       if (!acc[key]) {
  //         acc[key] = { ...item, qty: 0, basketIds: [], batchKey: 'project' };
  //       }
  //       acc[key].qty += (item.quantity || 1);
  //       acc[key].basketIds.push(item.basketId);
  //       return acc;
  //     }
  //     const kit = kits.find(k => k.id === item.id);
  //     const stock = kit?.stocks?.[item.stockKey];
      
  //     const status = stock?.status?.toLowerCase() || 'default';
  //     const eta = stock?.eta ? `-${stock.eta.toLowerCase().replace(/\s+/g, '-')}` : '';
  //     const batchIdentifier = `${status}${eta}`;
      
  //     const key = `${item.id}-${batchIdentifier}`;
      
  //     if (!acc[key]) {
  //       acc[key] = { ...item, qty: 0, basketIds: [], batchKey: batchIdentifier };
  //     }
  //     acc[key].qty += 1;
  //     acc[key].basketIds.push(item.basketId);
  //     return acc;
  //   }, {});
  //   console.log("SG DEBUG: Grouped items:", Object.values(grouped));
  //   const groupEntries = Object.entries(grouped);

  //   // Alamin kung nagbago ba ang MGA GRUPO (bago/nawala na group) — hindi lang quantity change
  //   const currentGroupKeys = groupEntries.map(([key]) => key).sort().join(',');
  //   const groupsChanged = currentGroupKeys !== lastBasketIdsRef.current;

  //   if (groupsChanged || basketSortOrderRef.current.length === 0) {
  //     // Mag-sort kasi may bago o nawala na group
  //     const sorted = groupEntries.sort(([, a], [, b]) => {
  //       const getLatest = (group) => Math.max(...group.basketIds.map(id => {
  //           const item = activeBasket.find(i => i.basketId === id);
  //           return new Date(item?.createdAt || 0).getTime();
  //       }));
  //       return getLatest(b) - getLatest(a);
  //     });
  //     basketSortOrderRef.current = sorted.map(([key]) => key);
  //     lastBasketIdsRef.current = currentGroupKeys;
  //     return sorted.map(([, value]) => value);
  //   }

  //   // Hindi nagbago ang basket — gamitin ang cached sort order
  //   const groupMap = new Map(groupEntries);
  //   const stableResult = basketSortOrderRef.current
  //     .filter(key => groupMap.has(key))
  //     .map(key => groupMap.get(key));
  //   // Isama ang mga bago na wala pa sa cache (safety net)
  //   groupEntries.forEach(([key, value]) => {
  //     if (!basketSortOrderRef.current.includes(key)) {
  //       stableResult.push(value);
  //     }
  //   });
  //   return stableResult;
  // }, [activeBasket, kits]);

  const groupedItems = useMemo(() => {
    const grouped = activeBasket.reduce((acc, item) => {
      const itemTime = getBasketItemTime(item);

      if (item.type === 'project') {
        const key = JSON.stringify(item.projectData);

        if (!acc[key]) {
          acc[key] = {
            ...item,
            qty: 0,
            basketIds: [],
            batchKey: 'project',
            sortTime: itemTime,
          };
        }

        acc[key].qty += item.quantity || 1;
        acc[key].basketIds.push(item.basketId);
        acc[key].sortTime = Math.min(acc[key].sortTime || itemTime, itemTime);

        return acc;
      }

      // Use ONLY basket data to determine the group.
      // Do NOT use live stock data here.
      const key = getBasketItemGroupKey(item);

      if (!acc[key]) {
        acc[key] = {
          ...item,
          qty: 0,
          basketIds: [],
          batchKey: item.stockKey,
          sortTime: itemTime,
        };
      }

      acc[key].qty += 1;
      acc[key].basketIds.push(item.basketId);
      acc[key].sortTime = Math.min(acc[key].sortTime || itemTime, itemTime);

      return acc;
    }, {});

    return Object.values(grouped).sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0));
  }, [activeBasket]);

  useEffect(() => {
    let scrollTargetId = scrollToBasketIdFromLocation;
    if (!scrollTargetId && typeof window !== 'undefined') {
      scrollTargetId = window.sessionStorage.getItem(BASKET_SCROLL_TARGET_STORAGE_KEY);
    }

    if (!scrollTargetId || isBasketRowsLoading) return;
    if (restoredScrollTargetRef.current === scrollTargetId) return;

    const targetRow = [...document.querySelectorAll('[data-basket-row-ids]')]
      .find((element) => element.dataset.basketRowIds
        .split('|')
        .includes(String(scrollTargetId)));
    if (!targetRow) return;

    const frameId = window.requestAnimationFrame(() => {
      const rowRect = targetRow.getBoundingClientRect();
      const navbar = document.querySelector('nav');
      const basketHeader = document.querySelector('[data-basket-sticky-header]');
      const basketSeparator = document.querySelector('[data-basket-sticky-separator]');
      const navbarRect = navbar?.getBoundingClientRect();
      const basketHeaderRect = basketHeader?.getBoundingClientRect();
      const basketSeparatorRect = basketSeparator?.getBoundingClientRect();
      const headerOffset = Math.max(
        navbarRect?.height || 0,
        basketHeaderRect?.bottom || 0,
        basketSeparatorRect?.bottom || 0
      ) + 16;
      const nextScrollTop = Math.max(
        0,
        window.scrollY + rowRect.top - headerOffset
      );

      restoredScrollTargetRef.current = scrollTargetId;
      window.sessionStorage.removeItem(BASKET_SCROLL_TARGET_STORAGE_KEY);
      window.scrollTo({ top: nextScrollTop, behavior: 'smooth' });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [groupedItems, isBasketRowsLoading, scrollToBasketIdFromLocation]);

  const hasVisibleBasketItems = !isBasketRowsLoading && groupedItems.length > 0;

  const canIncreaseKitQuantity = useCallback((item) => {
    if (!item || item.type === 'project') return true;

    const kit = kits.find((candidate) => String(candidate.id) === String(item.id));
    const stocks = kit?.stocks && typeof kit.stocks === 'object' ? kit.stocks : {};
    const sameKitItems = activeBasket.filter((candidate) => (
      candidate.type !== 'project'
      && String(candidate.id) === String(item.id)
    ));

    // Offer-backed items are limited to the single stock released for the offer.
    if (item.offerId) return sameKitItems
      .filter((candidate) => String(candidate.offerId || '') === String(item.offerId))
      .reduce((sum, candidate) => sum + Math.max(1, Number(candidate.quantity) || 1), 0) < 1;

    if (isAdmin && isAdminView) {
      // Shelf entries reserve their allocated stock. The plus button should only
      // remain active while another unreserved, unallocated stock exists.
      const occupiedStockKeys = new Set(sameKitItems.map((candidate) => String(candidate.stockKey || '')));
      return Object.entries(stocks).some(([stockKey, stock]) => (
        !stock?.isReserved
        && !stock?.order?.orderId
        && !occupiedStockKeys.has(String(stockKey))
      ));
    }

    const getBatchIdentifier = (stock) => {
      const status = stock?.status?.toLowerCase() || 'default';
      const eta = getStockEta(stock);
      return `${status}${eta ? `-${eta.toLowerCase().replace(/\s+/g, '-')}` : ''}`;
    };
    const itemBatchIdentifier = getBatchIdentifier(
      stocks[item.stockKey] || item
    );
    const basketQuantityInBatch = sameKitItems
      .filter((candidate) => getBatchIdentifier(stocks[candidate.stockKey] || candidate) === itemBatchIdentifier)
      .reduce((sum, candidate) => sum + Math.max(1, Number(candidate.quantity) || 1), 0);
    const availableInBatch = Object.values(stocks).filter((stock) => (
      getBatchIdentifier(stock) === itemBatchIdentifier
      && !stock?.isReserved
      && !stock?.order?.orderId
    )).length;

    return basketQuantityInBatch < availableInBatch;
  }, [activeBasket, isAdmin, isAdminView, kits]);

  const basketRows = useMemo(() => {
    const projects = [];
    const preOrders = [];
    const onhand = [];

    groupedItems.forEach((item) => {
      if (item.type === 'project') {
        projects.push(item);
        return;
      }

      const stock = item.type === 'project'
        ? null
        : kits.find((kit) => kit.id === item.id)?.stocks?.[item.stockKey];
      const isOnhand = String(stock?.status || item.status || '').toLowerCase() === 'onhand';
      (isOnhand ? onhand : preOrders).push(item);
    });

    return [
      ...(projects.length > 0 ? [{ type: 'separator', key: 'projects', label: 'Projects' }] : []),
      ...projects.map((item) => ({ type: 'item', key: `project-${item.id}-${item.batchKey}`, item })),
      ...(preOrders.length > 0 ? [{ type: 'separator', key: 'pre-orders', label: 'Pre-Orders' }] : []),
      ...preOrders.map((item) => ({ type: 'item', key: `pre-order-${item.id}-${item.batchKey}-${item.offerId || 'standard'}`, item })),
      ...(onhand.length > 0 ? [{ type: 'separator', key: 'onhand', label: 'Onhand' }] : []),
      ...onhand.map((item) => ({ type: 'item', key: `onhand-${item.id}-${item.batchKey}-${item.offerId || 'standard'}`, item }))
    ];
  }, [groupedItems, kits]);

  const [isMiniNavVisible, setIsMiniNavVisible] = useState(true);

  useEffect(() => {
    const handleHide = () => setIsMiniNavVisible(false);
    const handleShow = () => setIsMiniNavVisible(true);
    const handleBottomNavVisibilityChange = (event) => {
      setIsMiniNavVisible(Boolean(event.detail?.visible));
    };
    window.addEventListener('hideNavbar', handleHide);
    window.addEventListener('showNavbar', handleShow);
    window.addEventListener('bottomNavVisibilityChange', handleBottomNavVisibilityChange);
    return () => {
      window.removeEventListener('hideNavbar', handleHide);
      window.removeEventListener('showNavbar', handleShow);
      window.removeEventListener('bottomNavVisibilityChange', handleBottomNavVisibilityChange);
    };
  }, []);


  return (
    <PageTemplate isDarkMode={isDarkMode}>
      <div className="min-h-screen flex flex-col bg-neutral-50 dark:bg-[#0a0a0a] transition-colors duration-500">
        <div data-basket-sticky-header className="sticky top-[50px] z-[90] h-[60px] w-full bg-neutral-50 dark:bg-[#0a0a0a] border-b border-black/5 dark:border-white/5">
          <div className="max-w-7xl mx-auto px-4 md:px-8 h-full flex items-center justify-between">
            <div className="flex items-center gap-4">
                {activeBasket.length > 0 && (
                    <button onClick={toggleSelectAll} className="text-[11px] font-black uppercase tracking-widest opacity-50 hover:opacity-100">
                        {activeSelection.length === activeBasket.length ? 'Unselect All' : 'Select All'}
                    </button>
                )}
            </div>
            <div className="flex items-center gap-4">
                {activeSelection.length > 0 && (
                    <>
                        <span className="text-[11px] font-black uppercase tracking-widest">{activeSelection.length} SELECTED</span>
                        <button 
                            onClick={() => {
                                if (!confirmShelfRelease(activeSelection.length)) return;
                                const selectedItems = activeBasket.filter(i => activeSelection.includes(i.basketId));
                                selectedItems.forEach(item => removeFromBasket(item.basketId));
                                setManualSelectedIds([]);
                            }}
                            className="flex items-center gap-1 text-red-500 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-colors"
                        >
                            <Trash2 size={16} />
                        </button>
                    </>
                )}
            </div>
          </div>
        </div>
        <div className={`flex-grow max-w-7xl mx-auto w-full px-4 md:px-8 pb-32`}>
          {isBasketRowsLoading ? (
            <div className="space-y-4 pt-4">
              {Array.from({ length: 4 }).map((_, index) => <ListItemSkeleton key={`basket-skeleton-${index}`} />)}
            </div>
          ) : activeBasket.length === 0 ? (
            <div className="text-center py-20 opacity-50">
              {isAdmin && isAdminView ? (
                <ShelvingUnit size={68} className="mx-auto mb-4" />
              ) : (
                <ShoppingCart size={68} className="mx-auto mb-4" />
              )}
              <p className="font-bold mb-6">{isAdmin && isAdminView ? "The shelf is empty.." : "Your cart is empty.."}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {basketRows.map((row, index) => {
                if (row.type === 'separator') {
                  return (
                    <div
                      key={row.key}
                      data-basket-sticky-separator={index === 0 ? true : undefined}
                      className={`sticky top-[110px] z-[80] -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 bg-neutral-50/90 px-4 py-2 backdrop-blur-md dark:bg-[#0a0a0a]/90 md:-mx-8 md:w-[calc(100%+4rem)] md:px-8 ${index === 0 ? 'mt-4' : ''}`}
                    >
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                      <span className="select-none bg-gradient-to-r from-[#0866FF] to-[#00CFFF] bg-clip-text text-[13px] font-black uppercase tracking-[0.2em] text-transparent">
                        {row.label}
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                    </div>
                  );
                }

                const { item } = row;
                const isSelected = item.basketIds.some(bid => activeSelection.includes(bid));
                const kit = kits.find(k => k.id === item.id);
                
                // Debugging log
                if (kit) {
                  console.log("SG DEBUG: Kit found:", kit.id, "Kit Object:", kit);
                } else {
                  console.log("SG DEBUG: Kit NOT found for item:", item.id);
                }

                // Get correct image: project-specific image or fallback to kit image
                const displayImage = item.type === 'project'
                    ? (item.projectData?.image || item.image)
                    : resolveImage(item.image, item.images)
                      || resolveImage(kit?.image, kit?.images);
                const isUserProject = item.type === 'project' && Boolean(item.projectData?.vaultId);
                const liveProject = isUserProject
                  ? (item.projectData?.vaultId
                    ? (projectVault || []).find((project) => project.vaultId === item.projectData.vaultId)
                    : (blueprints || []).find((project) => String(project.id) === String(item.projectData?.id)))
                  : null;
                const projectStatus = isUserProject
                  ? getProjectStatusIndicators(liveProject || item.projectData, {
                    printers,
                    feeders,
                    filamentInventory,
                    orders,
                    shippingSettings,
                    rates
                  })
                  : null;
                const projectIssue = item.type === 'project'
                  ? item.basketIds
                    .map((basketId) => liveProjectIssueByBasketId.get(basketId))
                    .find(Boolean)
                  : null;

                const displayName = (item.name || '').replace(/\s*\(Pre-Order\)\s*$/i, '');
                const stock = kit?.stocks?.[item.stockKey];
                const canIncreaseQuantity = canIncreaseKitQuantity(item);

                const brand = kit?.brand || item.brand;
                const line = kit?.specs?.line || item.specs?.line;
                const scale = kit?.specs?.scale || item.specs?.scale;
                
                const itemStatusLabel = String(stock?.status || item.status || '');
                const isPreOrder = isPreOrderStock(stock || item);
                const hasSelectedBundlePrice = item.basketIds.some((basketId) => (
                  selectedBundlePriceByBasketId.has(basketId)
                ));
                const hasSelectedClearancePrice = item.basketIds.some((basketId) => (
                  selectedClearancePricing.prices.has(basketId)
                ));
                const isActiveBundleDealItem = item.type !== 'project'
                  && !item.isClearanceBundle
                  && Boolean(item.bundleId)
                  && activeBundleDealIds.has(String(item.bundleId))
                  && bundleDealTagKitIds.has(String(item.id));
                const isClearanceKit = item.type !== 'project'
                  && isSelected
                  && isOnHandStock(stock || item)
                  && !isPreOrder
                  && (
                    hasSelectedClearancePrice
                    || selectedClearanceTagKitIds.has(String(item.id))
                    || Boolean(item.isClearanceBundle)
                  );
                const isBundleDealSelection = item.type !== 'project'
                  && (bundleDealTagKitIds.has(String(item.id)) || isActiveBundleDealItem)
                  && !hasSelectedClearancePrice;
                const etaLabel = getStockEta(stock || item) || 'TBA';
                const offerHoursLeft = item.offerId && isOfferCheckoutActive(item, offerNow)
                  ? getOfferHoursLeft(item, offerNow)
                  : 0;
                const shelfCostPrice = Number(item.costPrice ?? stock?.costPrice ?? 0);
                const shelfSellPrice = Number(item.sellPrice ?? stock?.sellPrice ?? getBasketStandalonePrice(item));
                const basketPriceComparison = getBasketPriceComparison(item);
                const bundleStandaloneSellPrice = Number(
                  item.sellPrice
                  ?? stock?.sellPrice
                  ?? item.bundleReferencePrice
                  ?? basketPriceComparison.standalonePrice
                  ?? 0
                );
                const hasAppliedDeal = item.type !== 'project' && (
                  isActiveBundleDealItem
                  || Boolean(item.isClearanceBundle)
                  || hasSelectedBundlePrice
                  || hasSelectedClearancePrice
                  || isClearanceKit
                );
                const showDealStrikethrough = hasAppliedDeal
                  && bundleStandaloneSellPrice > basketPriceComparison.displayPrice;
                
                const itemStatus = stock?.status?.toLowerCase() || 'default';
                const effectiveItemEta = getStockEta(stock || item);
                const itemEta = effectiveItemEta ? `-${effectiveItemEta.toLowerCase().replace(/\s+/g, '-')}` : '';
                const itemBatchIdentifier = `${itemStatus}${itemEta}`;
                const validationKey = getBasketValidationKey(item.id, itemBatchIdentifier, item.offerId);
                const itemError = validation.itemRules[validationKey];
                const uniqueGroupKey = `${item.id}-${item.batchKey}-${item.offerId || 'standard'}`;
                
                const cardClasses = `p-3 rounded-2xl border-2 cursor-pointer flex gap-4 items-center transition-all duration-300 ${
                  isSelected ? 'border-blue-500 shadow-lg' : 'border-black/5 dark:border-white/5'
                } bg-white dark:bg-neutral-900`;

                return (
                  <div 
                    key={uniqueGroupKey} 
                    data-basket-row-id={item.basketIds[0] || ''}
                    data-basket-row-ids={item.basketIds.join('|')}
                    onClick={() => toggleSelectionGroup(item.basketIds)}
                    className={`${cardClasses} relative`}
                  >
                    {item.type !== 'project' && offerHoursLeft > 0 ? (
                      <span className="absolute left-0 bottom-5 z-10 bg-emerald-600 px-1.5 py-1 md:px-2 md:py-1 text-[12px] font-black uppercase tracking-wider text-white shadow-sm">
                        {offerHoursLeft} HRS LEFT
                      </span>
                    ) : isBundleDealSelection ? (
                      <span className="absolute left-0 bottom-5 z-10 bg-emerald-600 px-1.5 py-1 md:px-2 md:py-1 text-[12px] font-black uppercase tracking-wider text-white shadow-sm">
                        BUNDLE DEAL
                      </span>
                    ) : isClearanceKit ? (
                      <span className="absolute left-0 bottom-5 z-10 bg-emerald-600 px-1.5 py-1 md:px-2 md:py-1 text-[12px] font-black uppercase tracking-wider text-white shadow-sm">
                        CLEARANCE
                      </span>
                    ) : item.type !== 'project' && isPreOrder && etaLabel ? (
                      <span className="absolute left-0 bottom-5 z-10 bg-blue-600 px-1.5 py-1 md:px-2 md:py-1 text-[12px] font-black uppercase tracking-wider text-white shadow-sm">
                        {etaLabel}
                      </span>
                    ) : null}
                    <div className="relative flex items-center justify-center">
                      {isUserProject ? (
                        <ProjectStatusGrid
                          {...projectStatus}
                          bareTiles
                          className="w-20 h-20 md:portrait:w-48 md:landscape:w-72 md:h-24 lg:w-72 xl:w-72 aspect-square md:aspect-auto rounded-xl border border-blue-100 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 shadow-sm p-1.5"
                        />
                      ) : displayImage ? (
                        <img 
                          src={displayImage} 
                          alt={displayName} 
                          loading="lazy" 
                          className={`w-20 h-20 md:portrait:w-48 md:landscape:w-72 md:h-24 lg:w-72 xl:w-72 aspect-square md:aspect-auto object-cover object-[center_25%] rounded-xl border border-neutral-100 dark:border-neutral-800 transition-opacity duration-500`}
                          onLoad={(e) => e.target.classList.remove('opacity-0')}
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      {!isUserProject && <div className={`w-20 h-20 md:portrait:w-48 md:landscape:w-72 md:h-24 lg:w-72 xl:w-72 aspect-square md:aspect-auto object-cover object-[center_25%] rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center`} style={{ display: displayImage ? 'none' : 'flex' }}>
                          <PackageOpen size={32} className="opacity-20" />
                      </div>}
                    </div>
                    <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-[80px] justify-center">
                      <div className="flex flex-col justify-center">
                        <p className="font-bold text-sm leading-tight line-clamp-1 md:line-clamp-2">{displayName}</p>
                        <p className="text-[12px] uppercase font-black tracking-widest leading-tight mt-0.5">
                            {[brand, line, scale].filter(Boolean).join(' • ')}
                        </p>
                        {itemError && !(isAdmin && isAdminView) && (
                          <p className="text-red-500 text-[10px] font-black mt-0.5 uppercase tracking-widest">{itemError.message}</p>
                        )}
                        {projectIssue && !(isAdmin && isAdminView) && (
                          <p className="text-red-500 text-[10px] font-black mt-0.5 uppercase tracking-widest">{projectIssue}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                      {isAdmin && isAdminView ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="font-black text-[14px] text-blue-600">
                            ₱{shelfCostPrice.toLocaleString()}
                          </p>
                          <p className="font-black text-[14px] text-emerald-600">
                            ₱{shelfSellPrice.toLocaleString()}
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-baseline gap-2">
                        <p className={`font-black text-[15px] ${
                            basketPriceComparison.isDiscounted || isSelected
                            ? 'text-emerald-600'
                            : 'text-neutral-900 dark:text-white'
                        }`}>₱{basketPriceComparison.displayPrice.toLocaleString()}</p>
                        {!isAdminView && showDealStrikethrough && (
                          <p className="text-[14px] font-black leading-none text-black line-through dark:text-white">
                            ₱{bundleStandaloneSellPrice.toLocaleString()}
                          </p>
                        )}
                        </div>
                      )}
                        {/* Quantity Controls for Project */}
                        {item.type === 'project' && <div className="ml-auto flex items-center gap-3 bg-neutral-100 dark:bg-neutral-800 rounded-full px-2 py-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDecrementProjectItem(item.basketIds[item.basketIds.length - 1], 1); }}
                              className="w-6 h-6 flex items-center justify-center rounded-full bg-white dark:bg-neutral-700 hover:text-red-500 transition-colors"
                              title={item.qty === 1 ? 'Remove item' : 'Decrease quantity'}
                            >
                                {item.qty === 1 ? <Trash2 size={14} /> : <Minus size={14} strokeWidth={3} />}
                            </button>
                            <span className="font-black text-[11px] w-4 text-center">{item.qty}</span>
                            <button
                                disabled={!canIncreaseQuantity}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addProjectToBasket(item.projectData);
                                }}
                                className="w-6 h-6 flex items-center justify-center rounded-full bg-white dark:bg-neutral-700 transition-colors hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-inherit"
                                title={canIncreaseQuantity ? 'Increase quantity' : 'No more stock available'}
                            >
                              <Plus size={15} strokeWidth={3} />
                            </button>
                        </div>}

                        {/* Quantity Controls for Kit */}
                        {item.type !== 'project' && <div className="ml-auto flex items-center gap-3 bg-neutral-100 dark:bg-neutral-800 rounded-full px-2 py-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemoveBasketItem(item.basketIds[0], 1); }}
                              className="w-6 h-6 flex items-center justify-center rounded-full bg-white dark:bg-neutral-700 hover:text-red-500 transition-colors"
                              title={item.qty === 1 ? 'Remove item' : 'Decrease quantity'}
                            >
                                {item.qty === 1 ? <Trash2 size={14} /> : <Minus size={14} strokeWidth={3} />}
                            </button>
                            <span className="font-black text-[14px] w-4 text-center">{item.qty}</span>
                            <button
                                disabled={!canIncreaseQuantity}
                                onClick={(e) => { e.stopPropagation(); addToBasket(item); }}
                                className="w-6 h-6 flex items-center justify-center rounded-full bg-white dark:bg-neutral-700 transition-colors hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-inherit"
                                title={canIncreaseQuantity ? 'Increase quantity' : 'No more stock available'}
                            >
                              <Plus size={15} strokeWidth={3} />
                            </button>
                        </div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Consolidated Sticky Footer */}
        {(hasVisibleBasketItems || (isAdmin && isAdminView && !isBasketRowsLoading)) && (
          <div 
            className={`sticky z-[95] bg-white dark:bg-[#121212] border-t border-black/5 dark:border-white/5 transition-all duration-300 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_6px_-1px_rgba(255,255,255,0.05)] ${
              isMiniNavVisible ? 'bottom-[56px] sm:bottom-0' : 'bottom-0'
              } ${(isAdmin && isAdminView) ? 'min-h-[100px] py-3 sm:h-[60px] sm:min-h-0 sm:py-0' : (activeSelection.length === 0 ? 'h-[40px]' : 'min-h-[85px] py-4 sm:h-[60px] sm:min-h-0 sm:py-0')}`}
          >
            <div className="max-w-7xl mx-auto h-full px-4 md:px-8 flex items-center justify-between">
              {isAdmin && isAdminView ? (
                activeBasket.length === 0 ? (
                  /* Empty shelf — KEEP ONES button */
                  <div className="w-full flex items-center justify-center">
                    <button
                      onClick={async () => {
                        setIsKeepingOnes(true);
                        try { await keepOneOfEachToShelf(); } catch (e) { console.error('SG LOG: Keep ones failed:', e); }
                        setIsKeepingOnes(false);
                      }}
                      disabled={isKeepingOnes}
                      className={`flex items-center gap-2.5 px-8 py-3.5 rounded-full font-black uppercase tracking-widest text-xs transition-all ${
                        isKeepingOnes
                          ? 'bg-neutral-200 dark:bg-white/10 text-neutral-400 dark:text-white/20 cursor-not-allowed'
                          : 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95'
                      }`}
                    >
                      <PackagePlus size={16} strokeWidth={2.5} />
                      {isKeepingOnes ? 'Keeping...' : 'Keep Ones'}
                    </button>
                  </div>
                ) : (
                  /* Admin Shelf Dashboard panel */
                  <div className="grid grid-cols-1 justify-items-center gap-y-3 w-full text-center sm:grid-cols-2 sm:justify-items-start sm:gap-x-6 sm:text-left">
                    <div className="flex flex-col justify-center">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] leading-none mb-1">Shelf / Public - Sell</span>
                      <span className="whitespace-nowrap text-lg font-black italic leading-none md:text-xl">
                        {shelfStats?.onShelf?.totalKits || 0} <span>/</span> <span className="text-blue-500">{shelfStats?.offShelf?.totalKits || 0} - ₱{(shelfStats?.offShelf?.totalSellPrice || 0).toLocaleString()}</span>
                      </span>
                    </div>
                    <div className="flex flex-col justify-center">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] leading-none mb-1">Total Cost Prices</span>
                      <span className="whitespace-nowrap text-lg font-black italic leading-none md:text-xl">
                        ₱{(shelfStats?.onShelf?.totalCostPrice || 0).toLocaleString()} <span>/</span> <span className="text-blue-500">₱{(shelfStats?.offShelf?.totalCostPrice || 0).toLocaleString()}</span>
                      </span>
                    </div>
                  </div>
                )
              ) : activeSelection.length === 0 ? (
                <div className="w-full flex justify-center items-center h-[40px]">
                  <span className="text-[10px] md:text-[12px] font-black uppercase tracking-[0.2em] opacity-90">Select items to checkout</span>
                </div>
              ) : (
                <div className="flex items-center justify-between w-full md:justify-end md:gap-6">
                    {(() => {
                        // 1. LOADING STATE
                        if (isBasketRowsLoading) {
                            const loadingTotal = activeSelection.reduce((sum, id) => {
                                const item = activeBasket.find(i => i.basketId === id);
                                return sum + (item ? getEffectiveItemPrice(item) : 0);
                            }, 0);

                            return (
                                <>
                                  <div className="flex flex-col items-start md:items-end justify-center">
                                    <span className="text-[10px] font-black uppercase opacity-40 leading-none mb-1">Total</span>
                                    <span className="text-xl font-black italic leading-none">₱{loadingTotal.toLocaleString()}</span>
                                  </div>
                                  <button disabled className="px-10 py-3.5 rounded-full font-black uppercase tracking-widest text-xs transition-all bg-neutral-200 dark:bg-white/10 text-neutral-400 dark:text-white/20 cursor-not-allowed">
                                    Checkout
                                  </button>
                                </>
                            );
                        }

                        // 2. READY STATE DATA
                        const selectedItems = activeBasket.filter(i => activeSelection.includes(i.basketId)).map(item => {
                            const kit = kits.find(k => k.id === item.id);
                            const stock = kit?.stocks?.[item.stockKey];
                            const status = stock?.status?.toLowerCase() || 'default';
                            const effectiveEta = getStockEta(stock || item);
                            const eta = effectiveEta ? `-${effectiveEta.toLowerCase().replace(/\s+/g, '-')}` : '';
                            const batchKey = item.type === 'project' ? 'project' : `${status}${eta}`;
                            return { ...normalizeCheckoutItem(item), batchKey };
                        });

                        const flaggedKeys = Object.keys(validation.itemRules);
                        const hasSelectedIssues = selectedItems.some(i => flaggedKeys.includes(
                          getBasketValidationKey(i.id, i.batchKey, i.offerId)
                        ));
                        const selectedProjectIssueItems = activeBasket.filter((item) => (
                          item.type === 'project'
                          && activeSelection.includes(item.basketId)
                          && liveProjectIssueByBasketId.has(item.basketId)
                        ));
                        const selectedProjectIssue = selectedProjectIssueItems
                          .map((item) => liveProjectIssueByBasketId.get(item.basketId))
                          .find(Boolean);
                        const uniqueBatches = Array.from(new Set(selectedItems.map(i => i.batchKey)));
                        const hasBatchConflict = uniqueBatches.length > 1;

                        // 3. UPDATE BASKET STATE (Issues/Conflicts)
                        if (selectedProjectIssue) {
                            return (
                              <>
                                <div className="flex flex-col items-start md:items-end justify-center">
                                  <span className="text-[10px] font-black uppercase opacity-40 leading-none mb-1">Status</span>
                                  <span className="text-xl font-black italic leading-none text-red-500 uppercase tracking-tighter">{selectedProjectIssue}</span>
                                </div>
                                <button
                                  onClick={() => {
                                    const issueIds = selectedProjectIssueItems.map((item) => item.basketId).filter(Boolean);
                                    issueIds.forEach((basketId) => removeFromBasket(basketId));
                                    setManualSelectedIds((prev) => prev.filter((id) => !issueIds.includes(id)));
                                  }}
                                  className="px-10 py-3.5 rounded-full font-black uppercase tracking-widest text-xs bg-red-500 text-white shadow-lg shadow-red-500/20 hover:scale-105 transition-all"
                                >
                                  Update Cart
                                </button>
                              </>
                            );
                        }

                        if (hasSelectedIssues) {
                            return (
                              <>
                                <div className="flex flex-col items-start md:items-end justify-center">
                                  <span className="text-[10px] font-black uppercase opacity-40 leading-none mb-1">Status</span>
                                  <span className="text-xl font-black italic leading-none text-amber-500 uppercase tracking-tighter">Insufficient Stock</span>
                                </div>
                                <button 
                                  onClick={() => {
                                      const toRemoveIds = [];
                                      flaggedKeys.forEach(key => {
                                        const rule = validation.itemRules[key];
                                        const limit = rule.limit ?? 0;
                                        const matchingItemsInBasket = activeBasket.filter(item => {
                                          const kit = kits.find(k => k.id === item.id);
                                          const stock = kit?.stocks?.[item.stockKey];
                                          const status = stock?.status?.toLowerCase() || 'default';
                                          const effectiveEta = getStockEta(stock || item);
                                          const eta = effectiveEta ? `-${effectiveEta.toLowerCase().replace(/\s+/g, '-')}` : '';
                                          return getBasketValidationKey(item.id, `${status}${eta}`, item.offerId) === key;
                                        });
                                        if (matchingItemsInBasket.length > limit) {
                                          const excessCount = matchingItemsInBasket.length - limit;
                                          const sorted = [...matchingItemsInBasket].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
                                          toRemoveIds.push(...sorted.slice(0, excessCount).map(i => i.basketId));
                                        }
                                      });
                                      if (toRemoveIds.length > 0) {
                                        toRemoveIds.forEach(id => removeFromBasket(id));
                                        setManualSelectedIds(prev => prev.filter(id => !toRemoveIds.includes(id)));
                                      }
                                  }}
                                  className="px-10 py-3.5 rounded-full font-black uppercase tracking-widest text-xs bg-amber-500 text-white shadow-lg shadow-amber-500/20 hover:scale-105 transition-all"
                                >
                                  Update Cart
                                </button>
                              </>
                            );
                        }

                        if (mutuallyExclusiveConflict) {
                            return (
                              <>
                                <div className="flex flex-col items-start md:items-end justify-center">
                                  <span className="text-[10px] font-black uppercase opacity-40 leading-none mb-1">Status</span>
                                  <span className="text-xl font-black italic leading-none text-red-500 uppercase tracking-tighter">Mutually Exclusive</span>
                                </div>
                                <button
                                  onClick={() => {
                                    const conflictKitIds = new Set(mutuallyExclusiveConflict.conflictKitIds || mutuallyExclusiveConflict.kitIds || []);
                                    const selectedConflictItem = activeBasket.find(item => (
                                      activeSelection.includes(item.basketId) && conflictKitIds.has(item.id)
                                    ));
                                    const keepKitId = selectedConflictItem?.id;
                                    setManualSelectedIds(prev => prev.filter(basketId => {
                                      const item = activeBasket.find(candidate => candidate.basketId === basketId);
                                      return !item || !conflictKitIds.has(item.id) || item.id === keepKitId;
                                    }));
                                  }}
                                  className="px-10 py-3.5 rounded-full font-black uppercase tracking-widest text-xs bg-red-500 text-white shadow-lg shadow-red-500/20 hover:scale-105 transition-all"
                                >
                                  Fix Conflict
                                </button>
                              </>
                            );
                        }

                        if (hasBatchConflict) {
                            return (
                              <>
                                <div className="flex flex-col items-start md:items-end justify-center">
                                  <span className="text-[10px] font-black uppercase opacity-40 leading-none mb-1">Status</span>
                                  <span className="text-xl font-black italic leading-none text-purple-600 uppercase tracking-tighter">Logistics Issue</span>
                                </div>
                                <button 
                                  onClick={() => {
                                      const hasOnhand = selectedItems.some(i => i.status?.toLowerCase() === 'onhand');
                                      let newIds = [];
                                      if (hasOnhand) {
                                          newIds = selectedItems.filter(i => i.status?.toLowerCase() === 'onhand').map(i => i.basketId);
                                      } else {
                                          const parseETA = (etaStr) => {
                                              if (!etaStr) return new Date('9999-12-31');
                                              const parts = etaStr.split(' ');
                                              if (parts.length < 2) return new Date('9999-12-31');
                                              const [month, year] = parts;
                                              const months = { 'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5, 'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV' : 10, 'DEC': 11 };
                                              return new Date(parseInt(year), months[month.toUpperCase()] || 0, 1);
                                          };
                                          const sorted = [...selectedItems].sort((a, b) => {
                                              const kitA = kits.find(k => k.id === a.id);
                                              const kitB = kits.find(k => k.id === b.id);
                                              return parseETA(getStockEta(kitA?.stocks?.[a.stockKey])) - parseETA(getStockEta(kitB?.stocks?.[b.stockKey]));
                                          });
                                          newIds = selectedItems.filter(i => i.batchKey === sorted[0].batchKey).map(i => i.basketId);
                                      }
                                      setManualSelectedIds(newIds);
                                  }}
                                  className="px-10 py-3.5 rounded-full font-black uppercase tracking-widest text-xs bg-purple-600 text-white shadow-lg shadow-purple-600/20 hover:scale-105 transition-all"
                                >
                                  Fix Conflict
                                </button>
                              </>
                            );
                        }

                        // 4. NORMAL CHECKOUT STATE
                        return (
                          <>
                            <div className="flex flex-col items-start md:items-end justify-center">
                              <span className="text-[10px] font-black uppercase opacity-40 leading-none mb-1">Total</span>
                              <span className="text-lg md:text-xl font-black italic leading-none">₱{validation.totalPrice.toLocaleString()}</span>
                            </div>
                            <button
                              onClick={() => {
                                const incompleteBundle = Object.values(
                                  activeBasket.reduce((groups, item) => {
                                    if (!isBundleOrClearanceItem(item) || !item.bundleId || !activeBundleDealIds.has(String(item.bundleId))) return groups;
                                    if (!groups[item.bundleId]) groups[item.bundleId] = { name: item.bundleName || 'this bundle', all: [], selected: [] };
                                    groups[item.bundleId].all.push(item.basketId);
                                    if (activeSelection.includes(item.basketId)) groups[item.bundleId].selected.push(item.basketId);
                                    return groups;
                                  }, {})
                                ).find(bundle => bundle.selected.length > 0 && bundle.selected.length !== bundle.all.length);

                                if (incompleteBundle) {
                                  alert(`Select every item in ${incompleteBundle.name} before checking out the bundle.`);
                                  return;
                                }

                                const checkoutItems = Object.values(groupedItems).filter(item => 
                                  item.basketIds.some(id => activeSelection.includes(id))
                                ).map(item => ({
                                  ...item,
                                  quantity: item.qty
                                }));
                                setItemsForCheckout(checkoutItems);
                                openCheckoutPage(checkoutItems, !user || isAnonymousUser);
                              }}
                              className="px-10 py-3.5 rounded-full font-black uppercase tracking-widest text-xs transition-all bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:scale-105"
                            >
                              Checkout
                            </button>
                          </>
                        );
                    })()}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <LoginPromptModal isOpen={isLoginPromptOpen} onClose={() => setLoginPromptOpen(false)} onLogin={() => { setLoginModalOpen(true); setLoginPromptOpen(false); }} onContinue={() => { setLoginPromptOpen(false); openCheckoutPage(itemsForCheckout, true); }} continueLabel="Check Price & Shipping" />
    </PageTemplate>
  );
}
