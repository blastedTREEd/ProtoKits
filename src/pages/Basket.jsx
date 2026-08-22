import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Trash2, ShoppingBag, ShelvingUnit, ShoppingBasket, PackageOpen, PackagePlus, Plus, Minus } from 'lucide-react';
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
import { findFirstAvailable, getOccupiedDates } from '../components/calculator/GarageCalendar';
// Resolves an image ID to its URL from the images array.
// Backward compatible: if the value is already a URL (base64 or http), returns it directly.
function resolveImage(idOrUrl, imagesArray) {
  if (!idOrUrl) return '';
  if (idOrUrl.startsWith('data:') || idOrUrl.startsWith('http')) return idOrUrl;
  const match = (imagesArray || []).find(img => img.id === idOrUrl);
  return match?.url || imagesArray?.[0]?.url || '';
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
  if (!deal || !['bundle_only', 'bundle_discount'].includes(deal.type) || deal.isActive === false) return false;
  const validFrom = parseBasketDealDate(deal.validFrom);
  const validUntil = parseBasketDealDate(deal.validUntil, true);
  return !(validFrom && validFrom.getTime() > now) && !(validUntil && validUntil.getTime() <= now);
}

export default function Basket() {
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    user, isAnonymousUser, basket, shelf, isAdmin, isAdminView, removeFromBasket, kits, userOffers, userOffersLoaded, addToBasket, addProjectToBasket, decrementProjectQuantity,
    guestBasket, isLoading, setLoginModalOpen, shippingSettings, loadMissingKits, keepOneOfEachToShelf, deals, loadBlueprintProductionStatuses,
    orders, printers, rates, projectVault, blueprints
  } = useStore();
  const [isKeepingOnes, setIsKeepingOnes] = useState(false);
  const [offerNow, setOfferNow] = useState(0);
  const [projectProductionStatuses, setProjectProductionStatuses] = useState({});
  const [isProjectStatusLoading, setIsProjectStatusLoading] = useState(false);
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

  const activeBasket = user && !isAnonymousUser ? ((isAdmin && isAdminView) ? shelf : basket) : guestBasket;

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

  const liveInvalidProjectBasketIds = useMemo(() => {
    const schedule = shippingSettings?.availabilitySchedule;
    const occupiedDates = getOccupiedDates(orders, schedule);
    const unavailableDates = getUnavailableDateSet(schedule, 'printing');
    const unavailableWeekdays = getUnavailableWeekdaySet(schedule, 'printing');
    const firstAvailableDate = findFirstAvailable(occupiedDates, unavailableDates, unavailableWeekdays);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const canStartToday = Boolean(firstAvailableDate && toDateKey(firstAvailableDate) === toDateKey(today));
    const activeDesignServices = rates?.['design-services'] || {};

    const isValidGdriveLink = (value) => {
      if (!value || !String(value).trim()) return false;
      try {
        const hostname = new URL(String(value).trim()).hostname;
        return hostname === 'drive.google.com' || hostname === 'docs.google.com';
      } catch {
        return false;
      }
    };

    const isPrinterAvailable = (project) => {
      const details = Array.isArray(project?.projectDetails) ? project.projectDetails : [];
      const printerIds = new Set([
        project?.printerId,
        ...details.map((detail) => detail?.printerId),
        ...details.flatMap((detail) => (detail?.productionJobs || []).map((job) => job?.printerId))
      ].filter(Boolean).map(String));
      const projectPrinters = [...printerIds]
        .map((id) => (printers || []).find((printer) => String(printer.id) === id))
        .filter(Boolean);
      if (projectPrinters.length === 0) return false;
      return projectPrinters.every((printer) => {
        const status = String(printer.status || printer.availability || '').trim().toLowerCase();
        if (['offline', 'maintenance', 'unavailable', 'disabled'].includes(status)) return false;
        return printer.available === true
          || printer.isAvailable === true
          || ['online', 'available', 'ready'].includes(status);
      });
    };

    const areMaterialsAvailable = (project) => {
      const details = Array.isArray(project?.projectDetails) ? project.projectDetails : [];
      const entries = details.flatMap((detail) => (
        Array.isArray(detail?.materials) && detail.materials.length > 0
          ? detail.materials
          : detail?.material ? [detail.material] : []
      ));
      if (entries.length === 0) return false;
      return entries.every((entry) => {
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
    };

    return activeBasket
      .filter((item) => item.type === 'project')
      .filter((item) => {
        const storedProject = item.projectData || {};
        const liveProject = storedProject.vaultId
          ? (projectVault || []).find((project) => project.vaultId === storedProject.vaultId)
          : (blueprints || []).find((project) => String(project.id) === String(storedProject.id));
        const project = liveProject || storedProject;
        const storedIndicators = storedProject.projectStatusIndicators;
        const isGarageProject = !storedProject.vaultId && Boolean(storedProject.id);

        if (!liveProject && storedIndicators) {
          // Garage Projects are governed by the persisted production switch;
          // their printer/material/calendar readiness indicators are not a
          // reason to remove an already-added public project from the basket.
          if (!isGarageProject) {
            return Object.values(storedIndicators).some((status) => status !== true);
          }
        }

        if (isGarageProject) {
          const blueprintId = String(project?.id || storedProject.id);
          return project?.canAddToBasket === false
            || projectProductionStatuses[blueprintId] === false;
        }

        const is3MF = project?.method?.name?.toUpperCase() === '3MF';
        const selectedService = project?.selectedDesignService;
        const hasActiveService = Boolean(
          selectedService
          && !is3MF
          && activeDesignServices[selectedService]
          && activeDesignServices[selectedService].status === true
        );
        const linkReady = isValidGdriveLink(project?.gdriveLink);
        const designReady = hasActiveService || linkReady;
        return project?.canAddToBasket === false
          || !isPrinterAvailable(project)
          || !areMaterialsAvailable(project)
          || !canStartToday
          || !designReady;
      })
      .map((item) => item.basketId)
      .filter(Boolean);
  }, [activeBasket, blueprints, orders, printers, projectProductionStatuses, projectVault, rates, shippingSettings?.availabilitySchedule]);

  const clearanceKitIds = useMemo(() => {
    const ids = new Set();
    (deals || []).forEach((deal) => {
      if (deal?.type !== 'clearance' || deal.isActive === false) return;
      const kitIds = deal.clearanceKitIds?.length ? deal.clearanceKitIds : (deal.kitIds || []);
      kitIds.forEach((kitId) => ids.add(kitId));
    });
    return ids;
  }, [deals]);

  const activeSelection = useMemo(() => {
    const currentBasketIds = activeBasket.map(i => i.basketId);
    return manualSelectedIds.filter(id => currentBasketIds.includes(id));
  }, [activeBasket, manualSelectedIds]);

  const selectedBundleDeal = useMemo(() => {
    const selectedItems = activeBasket.filter((item) => activeSelection.includes(item.basketId));
    if (selectedItems.length === 0 || selectedItems.some((item) => item.type === 'project')) return null;

    const selectedKitIds = [...new Set(selectedItems.map((item) => item.id).filter(Boolean))];
    return (deals || []).find((deal) => {
      if (!isBundleDealActive(deal, offerNow)) return false;
      const bundleKitIds = [...new Set((deal.kitIds || []).filter(Boolean))];
      if (bundleKitIds.length === 0 || bundleKitIds.length !== selectedItems.length) return false;
      return bundleKitIds.length === selectedKitIds.length
        && bundleKitIds.every((kitId) => selectedKitIds.includes(kitId));
    }) || null;
  }, [activeBasket, activeSelection, deals, offerNow]);

  const activeBundleDealIds = useMemo(() => (
    new Set((deals || [])
      .filter((deal) => isBundleDealActive(deal, offerNow))
      .map((deal) => String(deal.id)))
  ), [deals, offerNow]);

  const selectedBundleDealKitIds = useMemo(() => (
    new Set((selectedBundleDeal?.kitIds || []).filter(Boolean))
  ), [selectedBundleDeal]);

  const selectedClearanceKitIds = useMemo(() => (
    new Set(
      activeBasket
        .filter(item => activeSelection.includes(item.basketId) && item.type !== 'project')
        .filter(item => clearanceKitIds.has(item.id) || clearanceKitIds.has(String(item.id)))
        .map(item => String(item.id))
    )
  ), [activeBasket, activeSelection, clearanceKitIds]);

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
    if (isAdmin) {
      if (isAdminView && location.pathname !== '/shelf') {
        navigate('/shelf', { replace: true });
      } else if (!isAdminView && location.pathname !== '/basket') {
        navigate('/basket', { replace: true });
      }
    }
  }, [isAdminView, isAdmin, navigate, location.pathname]);
  
  const isOfferStateLoading = Boolean(user && !isAnonymousUser && !isAdminView && !userOffersLoaded);
  const isBasketRowsLoading = isLoading || missingKitIds.length > 0 || isOfferStateLoading || isProjectStatusLoading;

  const { handlingFee, installmentFee, transferFee } = useMemo(() => {
    return getCheckoutPaymentFees({ shippingSettings });
  }, [shippingSettings]);

  const basketOrderFees = useMemo(() => ({
    handling: Math.max(
      Number(handlingFee) || 0,
      ...activeBasket.map(item => Number(item.appliedHandlingFee) || 0)
    ),
    transfer: Math.max(
      Number(transferFee) || 0,
      ...activeBasket.map(item => Number(item.appliedTransferFee) || 0)
    )
  }), [activeBasket, handlingFee, transferFee]);

  // Handling and transfer fees are charged once per selected basket set. Use
  // the selected unit count as the denominator so a quantity of two receives
  // two shares while the order still receives only one fee of each type.
  const selectedFeeUnitCount = useMemo(() => (
    activeBasket
      .filter(item => activeSelection.includes(item.basketId))
      .reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0)
  ), [activeBasket, activeSelection]);

  const getBasketStandaloneFeeShare = useCallback((item) => {
    const isSelected = Array.isArray(item.basketIds)
      ? item.basketIds.some(id => activeSelection.includes(id))
      : activeSelection.includes(item.basketId);
    if (isSelected && selectedFeeUnitCount > 1) {
      const selectedItems = activeBasket.filter(candidate => activeSelection.includes(candidate.basketId));
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
    if (selectedItems.length < 2 || selectedBundleDeal) return { prices: new Map(), sourceBasketId: '' };

    const selectedRows = selectedItems.filter((item) => {
      if (item.type === 'project' || (item.bundleId && !item.isClearanceBundle)) return false;
      const kit = kits.find((candidate) => candidate.id === item.id);
      const stock = kit?.stocks?.[item.stockKey];
      const status = String(stock?.status || item.status || '').toLowerCase();
      return !status.includes('pre') && !status.includes('batch') && !status.includes('eta');
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
        costPrice: Number(stock?.costPrice || item.costPrice || 0)
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
          .filter((kitId) => rowsByKitId.has(kitId));
        if (selectedClearanceKitIds.length === 0) return null;

        const rows = [...rowsByKitId.values()];
        const clearanceDiscountOverrides = { ...(deal.clearanceDiscounts || {}) };
        selectedClearanceKitIds.forEach((kitId) => {
          const configuredDiscount = clearanceDiscountOverrides[kitId];
          if (configuredDiscount !== '' && configuredDiscount !== null && configuredDiscount !== undefined) return;

          const storedKitDiscount = Number(deal.kitDiscounts?.[kitId]?.discount || 0);
          const storedClearancePrice = Number(deal.kitDiscounts?.[kitId]?.clearancePrice || 0);
          const row = rows.find((candidate) => candidate.kitId === kitId);
          const storedPriceDiscount = row && storedClearancePrice > 0
            ? Math.max(0, row.refPrice - storedClearancePrice)
            : 0;
          const persistedDiscount = storedPriceDiscount || storedKitDiscount;
          if (persistedDiscount > 0) clearanceDiscountOverrides[kitId] = persistedDiscount;
        });

        const clearancePricing = getClearanceBundlePricing(
          rows,
          selectedClearanceKitIds,
          clearanceDiscountOverrides
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
  }, [activeBasket, activeSelection, deals, kits, selectedBundleDeal]);

  const selectedBundlePriceByBasketId = useMemo(() => {
    if (!selectedBundleDeal) return new Map();

    const selectedItems = activeBasket.filter((item) => activeSelection.includes(item.basketId));
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
    if (rows.length === 0 || normalTotal <= 0) return new Map();

    const discountAmount = Number(selectedBundleDeal.discountAmount ?? Math.max(0, normalTotal - Number(selectedBundleDeal.bundlePrice || 0))) || 0;
    const pricedRows = getBundleDealPricing(rows, discountAmount).rows;

    return new Map(pricedRows.map((row) => [row.item.basketId, row.finalPrice]));
  }, [activeBasket, activeSelection, kits, selectedBundleDeal]);

  const isBasketBundleFullySelected = useCallback((item) => {
    if (!isBundleOrClearanceItem(item) || !item.bundleId) return false;
    const bundleItems = activeBasket.filter(candidate => candidate.bundleId === item.bundleId);
    if (bundleItems.length === 0) return false;
    const selectedCount = bundleItems.reduce((count, candidate) => (
      activeSelection.includes(candidate.basketId) ? count + 1 : count
    ), 0);
    const expectedSize = Math.max(bundleItems.length, Number(item.bundleSize) || 0);
    const selectedItems = activeBasket.filter(candidate => activeSelection.includes(candidate.basketId));
    const onlyBundleItemsSelected = selectedItems.length === bundleItems.length &&
      selectedItems.every(candidate => candidate.bundleId === item.bundleId);
    return selectedCount === bundleItems.length &&
      bundleItems.length >= expectedSize &&
      onlyBundleItemsSelected;
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
      eta: item.eta || stock?.eta,
      minDownpayment: item.minDownpayment ?? stock?.minDownpayment,
      price: getEffectiveItemPrice(item),
      appliedHandlingFee: Number(item.appliedHandlingFee) > 0 ? Number(item.appliedHandlingFee) : handlingFee,
      appliedInstallmentFee: Number(item.appliedInstallmentFee) > 0 ? Number(item.appliedInstallmentFee) : installmentFee,
      appliedTransferFee: Number(item.appliedTransferFee) > 0 ? Number(item.appliedTransferFee) : transferFee,
      isFreeShippingEligible,
      freeShippingUntil,
      freeShippingMethod: item.freeShippingMethod || stock?.freeShippingMethod || 'All',
      freeShippingSuboption: item.freeShippingSuboption || stock?.freeShippingSuboption || 'All'
    };
  }, [getEffectiveItemPrice, handlingFee, installmentFee, transferFee, kits]);

  const openCheckoutPage = (items, isGuestPreview = !user || isAnonymousUser) => {
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
        const eta = stock?.eta ? `-${stock.eta.toLowerCase().replace(/\s+/g, '-')}` : '';
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
            const sEta = s.eta ? `-${s.eta.toLowerCase().replace(/\s+/g, '-')}` : '';
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
        const eta = stock?.eta ? `-${stock.eta.toLowerCase().replace(/\s+/g, '-')}` : '';
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

  const autoUpdatedValidationRef = useRef('');
  useEffect(() => {
    if (
      location.pathname !== '/basket'
      || (isAdmin && isAdminView)
      || isBasketRowsLoading
      || invalidBasketItemIds.length === 0
    ) return;

    const updateSignature = invalidBasketItemIds.join('|');
    if (autoUpdatedValidationRef.current === updateSignature) return;
    autoUpdatedValidationRef.current = updateSignature;

    setManualSelectedIds((currentIds) => (
      currentIds.filter((id) => !invalidBasketItemIds.includes(id))
    ));

    void (async () => {
      for (const basketId of invalidBasketItemIds) {
        await removeFromBasket(basketId);
      }
    })().catch((error) => {
      autoUpdatedValidationRef.current = '';
      console.error('SG LOG: Automatic basket update failed:', error);
    });
  }, [invalidBasketItemIds, isAdmin, isAdminView, isBasketRowsLoading, location.pathname, removeFromBasket]);

  const shelfStats = useMemo(() => {
    if (!isAdmin || !isAdminView) return null;
    const totalKits = activeBasket.filter(item => item.type !== 'project').reduce((sum, item) => sum + (item.quantity || 1), 0);
    const totalCostPrice = activeBasket.reduce((sum, item) => {
      const qty = item.quantity || 1;
      const cost = item.type === 'project'
        ? Math.max(0, Number(item.projectData?.sellPrice || 0) - (parseFloat(String(item.projectData?.totals?.totalProfit || 0).replace(/,/g, '')) || 0))
        : Number(item.costPrice || 0);
      return sum + (cost * qty);
    }, 0);
    const totalSellPrice = activeBasket.reduce((sum, item) => sum + (getBasketStandalonePrice(item) * (item.quantity || 1)), 0);
    const possibleProfit = Math.max(0, totalSellPrice - totalCostPrice);
    return { totalKits, totalCostPrice, totalSellPrice, possibleProfit };
  }, [isAdmin, isAdminView, activeBasket, getBasketStandalonePrice]);

  const toggleSelection = (basketId) => {
    setManualSelectedIds(prev => {
      return prev.includes(basketId) ? prev.filter(id => id !== basketId) : [...prev, basketId];
    });
  };

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

  const hasVisibleBasketItems = !isBasketRowsLoading && groupedItems.length > 0;

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
        <div className="sticky top-[50px] z-[90] h-[60px] w-full bg-neutral-50 dark:bg-[#0a0a0a] border-b border-black/5 dark:border-white/5">
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
                <ShoppingBasket size={68} className="mx-auto mb-4" />
              )}
              <p className="font-bold mb-6">{isAdmin && isAdminView ? "The shelf is empty.." : "Your basket is empty.."}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {basketRows.map((row, index) => {
                if (row.type === 'separator') {
                  return (
                    <div
                      key={row.key}
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

                const displayName = (item.name || '').replace(/\s*\(Pre-Order\)\s*$/i, '');
                const stock = kit?.stocks?.[item.stockKey];

                const brand = kit?.brand || item.brand;
                const line = kit?.specs?.line || item.specs?.line;
                const scale = kit?.specs?.scale || item.specs?.scale;
                
                const itemStatusLabel = String(stock?.status || item.status || '');
                const isPreOrder = /pre[-\s]?order/i.test(itemStatusLabel);
                const hasMultipleSelectedClearanceKits = selectedClearanceKitIds.size >= 2;
                const isWinningSelectedClearanceKit = item.basketIds?.includes(
                  selectedClearancePricing.sourceBasketId
                );
                const isClearanceKit = item.type !== 'project' && (
                  hasMultipleSelectedClearanceKits
                    ? isSelected && isWinningSelectedClearanceKit
                    : Boolean(item.isClearanceBundle) || clearanceKitIds.has(item.id)
                );
                const isBundleDealSelection = selectedBundleDealKitIds.has(item.id);
                const etaLabel = stock?.eta || item.eta || 'TBA';
                const offerHoursLeft = item.offerId && isOfferCheckoutActive(item, offerNow)
                  ? getOfferHoursLeft(item, offerNow)
                  : 0;
                const shelfCostPrice = Number(item.costPrice ?? stock?.costPrice ?? 0);
                const shelfSellPrice = Number(item.sellPrice ?? stock?.sellPrice ?? getBasketStandalonePrice(item));
                const basketPriceComparison = getBasketPriceComparison(item);
                
                const itemStatus = stock?.status?.toLowerCase() || 'default';
                const itemEta = stock?.eta ? `-${stock.eta.toLowerCase().replace(/\s+/g, '-')}` : '';
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
                    onClick={() => item.basketIds.forEach(toggleSelection)}
                    className={`${cardClasses} relative`}
                  >
                    {item.type !== 'project' && offerHoursLeft > 0 ? (
                      <span className="absolute left-0 bottom-5 z-10 bg-red-500 px-1.5 py-1 md:px-2 md:py-1 text-[12px] font-black uppercase tracking-wider text-white shadow-sm">
                        {offerHoursLeft} HRS LEFT
                      </span>
                    ) : isBundleDealSelection ? (
                      <span className="absolute left-0 bottom-5 z-10 bg-emerald-600 px-1.5 py-1 md:px-2 md:py-1 text-[12px] font-black uppercase tracking-wider text-white shadow-sm">
                        BUNDLE DEAL
                      </span>
                    ) : isClearanceKit ? (
                      <span className="absolute left-0 bottom-5 z-10 bg-red-500 px-1.5 py-1 md:px-2 md:py-1 text-[12px] font-black uppercase tracking-wider text-white shadow-sm">
                        CLEARANCE
                      </span>
                    ) : item.type !== 'project' && isPreOrder && etaLabel ? (
                      <span className="absolute left-0 bottom-5 z-10 bg-blue-600 px-1.5 py-1 md:px-2 md:py-1 text-[12px] font-black uppercase tracking-wider text-white shadow-sm">
                        {etaLabel}
                      </span>
                    ) : null}
                    <div className="relative flex items-center justify-center">
                      {displayImage ? (
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
                      <div className={`w-20 h-20 md:portrait:w-48 md:landscape:w-72 md:h-24 lg:w-72 xl:w-72 aspect-square md:aspect-auto object-cover object-[center_25%] rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center`} style={{ display: displayImage ? 'none' : 'flex' }}>
                          <PackageOpen size={32} className="opacity-20" />
                      </div>
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
                        {!isAdminView && basketPriceComparison.isDiscounted && (
                          <p className="text-[14px] font-black leading-none text-neutral-500 line-through dark:text-neutral-400">
                            ₱{basketPriceComparison.standalonePrice.toLocaleString()}
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addProjectToBasket(item.projectData);
                                }}
                                className="w-6 h-6 flex items-center justify-center rounded-full bg-white dark:bg-neutral-700 transition-colors hover:text-blue-500"
                                title="Increase quantity"
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
                                onClick={(e) => { e.stopPropagation(); addToBasket(item); }}
                                className="w-6 h-6 flex items-center justify-center rounded-full bg-white dark:bg-neutral-700 transition-colors hover:text-blue-500"
                                title="Increase quantity"
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
            } ${(isAdmin && isAdminView) ? 'min-h-[85px] py-4' : (activeSelection.length === 0 ? 'h-[40px]' : 'min-h-[85px] py-4')}`}
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 w-full text-left">
                    <div className="flex flex-col justify-center">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40 leading-none mb-1">Kits on Shelf</span>
                      <span className="text-lg md:text-xl font-black italic leading-none">{shelfStats?.totalKits || 0}</span>
                    </div>
                    <div className="flex flex-col justify-center">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40 leading-none mb-1">Total Cost</span>
                      <span className="text-lg md:text-xl font-black italic leading-none text-red-500">₱{(shelfStats?.totalCostPrice || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col justify-center">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40 leading-none mb-1">Possible Profit</span>
                      <span className="text-lg md:text-xl font-black italic leading-none text-emerald-500">₱{(shelfStats?.possibleProfit || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col justify-center">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40 leading-none mb-1">Total Sell Price</span>
                      <span className="text-lg md:text-xl font-black italic leading-none text-blue-500">₱{(shelfStats?.totalSellPrice || 0).toLocaleString()}</span>
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
                            const eta = stock?.eta ? `-${stock.eta.toLowerCase().replace(/\s+/g, '-')}` : '';
                            const batchKey = item.type === 'project' ? 'project' : `${status}${eta}`;
                            return { ...normalizeCheckoutItem(item), batchKey };
                        });

                        const flaggedKeys = Object.keys(validation.itemRules);
                        const hasSelectedIssues = selectedItems.some(i => flaggedKeys.includes(
                          getBasketValidationKey(i.id, i.batchKey, i.offerId)
                        ));
                        const uniqueBatches = Array.from(new Set(selectedItems.map(i => i.batchKey)));
                        const hasBatchConflict = uniqueBatches.length > 1;

                        // 3. UPDATE BASKET STATE (Issues/Conflicts)
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
                                          const eta = stock?.eta ? `-${stock.eta.toLowerCase().replace(/\s+/g, '-')}` : '';
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
                                  Update Basket
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
                                              return parseETA(kitA?.stocks?.[a.stockKey]?.eta) - parseETA(kitB?.stocks?.[b.stockKey]?.eta);
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
