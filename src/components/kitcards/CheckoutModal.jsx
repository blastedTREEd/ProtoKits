import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { 
  X, ShoppingBag, Package, Download, CheckCircle2,
  User, Phone, Home, Building2, Map, Hash, Navigation, MapPin,
  ShieldCheck, Loader2, Settings, Info, Truck, Users, Sparkles,
  MapPinCheckInside, Store, CircleChevronLeft, ChevronDown, MapPinSearch, Eye, Upload
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { FcGoogle } from 'react-icons/fc';
import { useStore } from '../../store/useStore';
import { getCheckoutPaymentFees } from '../../utils/paymentSettings';
import { useTheme } from '../../context/ThemeContext';
import { auth, db, googleProvider } from '../../firebase/firebase';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { signInWithPopup } from 'firebase/auth';
import L from 'leaflet';
import DynamicShippingForm from './DynamicShippingForm';
import PolicyModal from '../menu/PolicyModal';
import { getIntegerFeeShare, getStockStandaloneSellPrice, isBundleOrClearanceItem } from '../../utils/standalonePricing';
import { getBundleDealPricing, getClearanceBundlePricing, getDistributedFeeShare } from '../../utils/bundlePricing';
import {
  formatAvailabilityDate,
  getNextAvailableDate,
  getUnavailableDateSet,
  getUnavailableWeekdaySet,
  toDateKey
} from '../../utils/availabilitySchedule';

// --- LEAFLET CSS & ICON FIX ---
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Resolves an image ID to its URL from the images array.
// Backward compatible: if the value is already a URL (base64 or http), returns it directly.
function resolveImage(idOrUrl, imagesArray) {
  if (!idOrUrl) return '';
  if (idOrUrl.startsWith('data:') || idOrUrl.startsWith('http')) return idOrUrl;
  const match = (imagesArray || []).find(img => img.id === idOrUrl);
  return match?.url || '';
}

const toCheckoutNumber = (value) => Number(value || 0);

// Order-level fees are paid once, but orders display individual kits. Split
// each fee by the value of every checkout line so the kit totals reconcile to
// the payable order total without charging the full fee to every kit.
const distributeFeeByLineValue = (totalFee, lineValues) => {
  const fee = Math.max(0, Math.round(Number(totalFee) || 0));
  const values = lineValues.map(value => Math.max(0, Number(value) || 0));
  const totalValue = values.reduce((sum, value) => sum + value, 0);

  if (!fee || !values.length) return values.map(() => 0);

  const rawShares = values.map((value, index) => ({
    index,
    raw: totalValue > 0 ? (fee * value) / totalValue : fee / values.length
  }));
  const shares = rawShares.map(share => Math.floor(share.raw));
  let remainder = fee - shares.reduce((sum, share) => sum + share, 0);

  rawShares
    .sort((a, b) => (b.raw - Math.floor(b.raw)) - (a.raw - Math.floor(a.raw)) || a.index - b.index)
    .forEach(({ index }) => {
      if (remainder <= 0) return;
      shares[index] += 1;
      remainder -= 1;
    });

  return shares;
};

const isProjectCheckoutItem = (item) => (
  item?.type === 'project' ||
  Boolean(item?.projectData) ||
  String(item?.basketId || '').startsWith('checkout_project_')
);

const getCheckoutItemBasePrice = (item, kit, fees = {}) => {
  if (isProjectCheckoutItem(item)) {
    return toCheckoutNumber(item.projectData?.sellPrice || item.sellPrice || item.price);
  }

  const offerPrice = toCheckoutNumber(item.offerPrice);
  if (offerPrice > 0) return offerPrice;

  const storedPrice = toCheckoutNumber(item.price);
  if (isBundleOrClearanceItem(item) && storedPrice > 0) return storedPrice;

  const stockPrice = toCheckoutNumber(kit?.stocks?.[item.stockKey]?.sellPrice);
  const itemPrice = toCheckoutNumber(item.price);
  // Preserve a deliberately discounted non-bundle price (for example an
  // accepted offer) instead of replacing it with the stock's normal price.
  if (itemPrice > 0 && stockPrice > 0 && itemPrice < stockPrice) return itemPrice;
  if (stockPrice > 0) return stockPrice;

  const itemSellPrice = toCheckoutNumber(item.sellPrice);
  const knownFees = toCheckoutNumber(fees.handling) + toCheckoutNumber(fees.installment) + toCheckoutNumber(fees.transfer);
  if (storedPrice > 0 && itemSellPrice > 0 && storedPrice > itemSellPrice) {
    return Math.max(0, storedPrice - knownFees);
  }

  return itemSellPrice || storedPrice;
};

const parseDealDate = (value, endOfDay = false) => {
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
};

const isDealActiveForCheckout = (deal, now = Date.now()) => {
  if (!deal || !['bundle_only', 'bundle_discount', 'clearance'].includes(deal.type)) return false;
  if (deal.isActive === false) return false;

  // Clearance is a permanent eligibility list. Bundle deals still honor
  // their configured validity window.
  if (deal.type !== 'clearance') {
    const validFrom = parseDealDate(deal.validFrom);
    const validUntil = parseDealDate(deal.validUntil, true);
    if (validFrom && validFrom.getTime() > now) return false;
    if (validUntil && validUntil.getTime() <= now) return false;
  }
  return true;
};

const isPreOrderStock = (stock = {}, fallbackStatus = '') => {
  const status = String(stock.status || fallbackStatus || '').toLowerCase();
  return status.includes('pre') || status.includes('batch') || status.includes('eta');
};

const stockMatchesCheckoutDealSource = (stock, item, source = 'onhand') => {
  const isPreOrder = isPreOrderStock(stock, item?.status);
  return source === 'preorder' ? isPreOrder : !isPreOrder;
};

const normalizeDealKitIds = (value) => {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map(value => String(value)).filter(Boolean);
};

const getCheckoutKitId = (item) => String(item?.id || item?.kitId || item?.productId || '');

const findCheckoutKit = (kits = [], item = {}) => {
  const kitId = getCheckoutKitId(item);
  return (kits || []).find(kit => String(kit?.id) === kitId)
    || (item?.name
      ? (kits || []).find(kit => String(kit?.name || '').trim() === String(item.name).trim())
      : null);
};

const getClearanceDealKitIds = (deal) => {
  const explicitIds = normalizeDealKitIds(deal?.clearanceKitIds);
  return explicitIds.length > 0
    ? explicitIds
    : normalizeDealKitIds(deal?.clearanceKitId).length > 0
      ? normalizeDealKitIds(deal.clearanceKitId)
      : normalizeDealKitIds(deal?.kitIds).slice(0, 1);
};

// Basket rows do not necessarily carry deal metadata that is attached by the
// direct deal checkout path. Rebuild both bundle and clearance metadata from
// the selected stocks so the checkout view is consistent regardless of where
// the user started the order.
const applyActiveBasketDeal = (normalizedItems = [], deals = [], kits = [], fees = {}) => {
  const selectedDealItems = normalizedItems.filter(item => !isProjectCheckoutItem(item));
  const selectedBasketItems = selectedDealItems.filter(item => item?.basketId || item?.basketIds?.length);
  const activeDeals = deals.filter(deal => isDealActiveForCheckout(deal));
  const selectedNormalBundleIds = new Set(
    selectedBasketItems
      .filter(item => item.bundleId && item.isClearanceBundle !== true)
      .map(item => item.bundleId)
  );
  const bundleRowsById = new globalThis.Map();
  selectedBasketItems.forEach(item => {
    if (!item.bundleId || item.isClearanceBundle === true) return;
    const rows = bundleRowsById.get(item.bundleId) || [];
    rows.push(item);
    bundleRowsById.set(item.bundleId, rows);
  });

  const validNormalBundleId = selectedNormalBundleIds.size === 1
    ? Array.from(selectedNormalBundleIds).find(bundleId => {
      const rows = bundleRowsById.get(bundleId) || [];
      const expectedSize = Math.max(
        rows.length,
        ...rows.map(row => Number(row.bundleSize) || 0)
      );
      const activeDeal = activeDeals.find(deal => String(deal.id) === String(bundleId));
      const activeDealKitIds = new Set(normalizeDealKitIds(activeDeal?.kitIds));
      const selectedKitIds = new Set(selectedBasketItems.map(getCheckoutKitId));
      const matchesActiveDeal = activeDealKitIds.size > 1
        && activeDealKitIds.size === selectedKitIds.size
        && Array.from(activeDealKitIds).every(kitId => selectedKitIds.has(kitId));
      return matchesActiveDeal && rows.length === selectedBasketItems.length && rows.length >= expectedSize;
    })
    : null;

  const resetDealItem = (item) => {
    const kit = findCheckoutKit(kits, item);
    const stock = kit?.stocks?.[item.stockKey];
    const sellPrice = Number(stock?.sellPrice || item.sellPrice || kit?.sellPrice || 0);
    const handling = Number(item.appliedHandlingFee ?? fees.handlingFee ?? 0);
    const installment = Number(item.appliedInstallmentFee ?? fees.installmentFee ?? 0);
    const transfer = Number(item.appliedTransferFee ?? fees.transferFee ?? 0);

    return {
      ...item,
      name: String(item.name || '').replace(/\s*\((?:Bundle|Clearance) Item\)\s*$/i, ''),
      sellPrice,
      price: sellPrice + handling + installment + transfer,
      isBundleItem: false,
      isClearanceBundle: false,
      clearanceKitIds: [],
      bundleId: null,
      bundleName: null,
      bundleSize: null,
      bundleFeeShare: 0,
      bundleReferencePrice: 0,
      appliedBundlePrice: null
    };
  };

  const preparedItems = normalizedItems.map(item => {
    const isInvalidNormalBundle = item.bundleId && item.isClearanceBundle !== true &&
      item.bundleId !== validNormalBundleId;
    const isStaleClearanceBundle = item.isClearanceBundle === true
      || (Array.isArray(item.clearanceKitIds) && item.clearanceKitIds.length > 0);
    return isInvalidNormalBundle || isStaleClearanceBundle ? resetDealItem(item) : item;
  });

  const basketItems = preparedItems.filter(item => item?.basketId || item?.basketIds?.length);
  if (!selectedDealItems.length || !Array.isArray(deals) || !deals.length) return preparedItems;

  const itemByKitId = new globalThis.Map();
  selectedDealItems.forEach(item => {
    const kitId = getCheckoutKitId(item);
    if (kitId && !itemByKitId.has(kitId)) itemByKitId.set(kitId, item);
  });
  const selectedOrderKitIds = new Set(
    selectedDealItems.map(getCheckoutKitId).filter(Boolean)
  );

  const bundleIsTheOnlySelectedItems = (bundleKitIds = []) => {
    const normalizedBundleKitIds = new Set(normalizeDealKitIds(bundleKitIds));
    return normalizedBundleKitIds.size > 1
      && normalizedBundleKitIds.size === selectedOrderKitIds.size
      && Array.from(normalizedBundleKitIds).every(kitId => selectedOrderKitIds.has(kitId));
  };

  const candidates = [];
  const normalBundleCandidates = [];

  activeDeals.forEach(deal => {
    const isClearanceDeal = deal.type === 'clearance';
    if (!isClearanceDeal) {
      if (!['bundle_only', 'bundle_discount'].includes(deal.type)) return;

      const bundleKitIds = Array.from(new Set(normalizeDealKitIds(deal.kitIds)));
      if (!bundleIsTheOnlySelectedItems(bundleKitIds)) return;

      const rows = bundleKitIds.map(kitId => {
        const item = itemByKitId.get(kitId);
        const kit = kits.find(candidate => String(candidate.id) === kitId);
        const stock = kit?.stocks?.[item?.stockKey];
        if (!item || !kit || !stockMatchesCheckoutDealSource(stock || {}, item, deal.stockSource || 'onhand')) {
          return null;
        }

        const sellPrice = Number(stock.sellPrice || item.sellPrice || kit.sellPrice || 0);
        return {
          item,
          kit,
          kitId,
          stock,
          refPrice: sellPrice,
          sellPrice,
          costPrice: Number(stock.costPrice || item.costPrice || 0)
        };
      });
      if (rows.some(row => !row) || rows.some(row => row.refPrice <= 0)) return;

      const normalTotal = rows.reduce((sum, row) => sum + row.refPrice, 0);
      const discountAmount = Math.max(
        0,
        Number(deal.discountAmount ?? (normalTotal - Number(deal.bundlePrice || 0))) || 0
      );
      const bundlePricing = getBundleDealPricing(rows, discountAmount);
      if (bundlePricing.bundlePrice >= normalTotal || bundlePricing.discountAmount <= 0) return;
      const pricedRows = bundlePricing.rows.map(row => ({
        ...row,
        isClearance: false
      }));

      normalBundleCandidates.push({
        deal,
        rows: pricedRows,
        savings: bundlePricing.discountAmount,
        clearanceDiscount: 0
      });
      return;
    }

    const clearanceKitIds = Array.from(new Set(getClearanceDealKitIds(deal)));

    const clearanceRows = isClearanceDeal
      ? basketItems.filter(item => {
        if (isProjectCheckoutItem(item)) return false;
        const kitId = getCheckoutKitId(item);
        const kit = kits.find(candidate => String(candidate.id) === kitId);
        const stock = kit?.stocks?.[item.stockKey];
        return stockMatchesCheckoutDealSource(stock || {}, item, 'onhand');
      })
      : [];
    const selectedClearanceKitIds = clearanceKitIds.filter(kitId => itemByKitId.has(kitId));
    if (isClearanceDeal && (selectedClearanceKitIds.length === 0 || clearanceRows.length < 2)) return;

    // A normal bundle always wins over clearance for the same kit. This
    // covers both basket rows already tagged by a bundle checkout and plain
    // basket rows where every kit in an active bundle is selected.
    const clearanceKitIsInNormalBundle = selectedClearanceKitIds.some(kitId => {
      const item = itemByKitId.get(kitId);
      if (item?.bundleId && item.isClearanceBundle !== true) return true;

      return activeDeals.some(bundleDeal => {
        if (!['bundle_only', 'bundle_discount'].includes(bundleDeal.type)) return false;
        const bundleKitIds = normalizeDealKitIds(bundleDeal.kitIds);
        return bundleKitIds.includes(kitId) &&
          bundleIsTheOnlySelectedItems(bundleKitIds);
      });
    });
    if (isClearanceDeal && clearanceKitIsInNormalBundle) return;

    const rows = clearanceRows
      // The prioritized clearance pool can be shared by ordinary selected
      // rows and other clearance rows. A normal bundle row stays protected.
      .filter(item => {
        const kitId = getCheckoutKitId(item);
        return selectedClearanceKitIds.includes(kitId) || !isBundleOrClearanceItem(item);
      })
      .map(item => {
      const kitId = getCheckoutKitId(item);
      const kit = findCheckoutKit(kits, item || { id: kitId });
      const stock = kit?.stocks?.[item.stockKey];
      if (!stockMatchesCheckoutDealSource(stock || {}, item, 'onhand')) return null;

      const sellPrice = Number(stock?.sellPrice || item.sellPrice || kit?.sellPrice || 0);
      const costPrice = Number(stock?.costPrice || item.costPrice || 0);
      return { item, kit, kitId, stock, refPrice: sellPrice, sellPrice, costPrice };
      });
    if (rows.some(row => !row) || rows.some(row => row.refPrice <= 0)) return;

    const clearanceDiscountOverrides = { ...(deal.clearanceDiscounts || {}) };
    selectedClearanceKitIds.forEach((kitId) => {
      const configuredDiscount = clearanceDiscountOverrides[kitId];
      if (configuredDiscount !== '' && configuredDiscount !== null && configuredDiscount !== undefined) return;

      const storedKitDiscount = Number(deal.kitDiscounts?.[kitId]?.discount || 0);
      const storedClearancePrice = Number(deal.kitDiscounts?.[kitId]?.clearancePrice || 0);
      const row = rows.find(candidate => candidate.kitId === kitId);
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

    const clearanceDiscount = pricedRows.reduce((sum, row) => sum + Number(row.clearanceDiscount || 0), 0);
    const savings = pricedRows.reduce((sum, row) => sum + Math.max(0, row.refPrice - row.finalPrice), 0);
    if (savings <= 0) return;
    candidates.push({
      deal,
      rows: pricedRows,
      savings,
      clearanceDiscount,
      unusedClearanceDiscount: Number(clearancePricing.unusedClearanceDiscount || 0)
    });
  });

  // A complete normal bundle takes priority over clearance pricing. If no
  // complete bundle is selected, use the best eligible clearance deal.
  const best = (normalBundleCandidates.length > 0
    ? normalBundleCandidates
    : candidates
  ).sort((a, b) => (
    b.clearanceDiscount - a.clearanceDiscount || b.savings - a.savings
  ))[0];
  if (!best) return preparedItems;

  const deal = best.deal;
  const rowByKitId = new globalThis.Map(best.rows.map(row => [row.kitId, row]));
  const bundleSize = best.rows.length;
  const bundleFeeTotal = Number(fees.handlingFee || 0) + Number(fees.transferFee || 0);
  const clearanceSourceKitId = deal.type === 'clearance'
    ? best.rows.find(row => row.isClearance)?.kitId || ''
    : '';
  const unusedClearanceDiscount = deal.type === 'clearance'
    ? Math.max(0, Number(best.unusedClearanceDiscount || 0))
    : 0;

  return preparedItems.map(item => {
    const row = rowByKitId.get(getCheckoutKitId(item));
    if (!row || isProjectCheckoutItem(item) || item.offerPrice) return item;

    const bundleFeeShare = getDistributedFeeShare(bundleFeeTotal, row._clearanceIndex ?? best.rows.indexOf(row), bundleSize);
    return {
      ...item,
      name: String(item.name || row.kit?.name || '').replace(/\s*\((?:Bundle|Clearance) Item\)\s*$/i, ''),
      isBundleItem: true,
      bundleId: deal.id,
      bundleName: deal.name || (deal.type === 'clearance' ? 'Clearance Deal' : 'Bundle Deal'),
      isClearanceBundle: deal.type === 'clearance',
      clearanceKitIds: best.rows.filter(row => row.isClearance).map(row => row.kitId),
      bundleSize,
      bundleFeeShare,
      bundleReferencePrice: row.refPrice
        + Number(item.appliedInstallmentFee || fees.installmentFee || 0)
        + Number(item.appliedHandlingFee || fees.handlingFee || 0)
        + Number(item.appliedTransferFee || fees.transferFee || 0),
      allowShelfBundle: true,
      appliedBundlePrice: row.finalPrice,
      price: row.finalPrice,
      displayPrice: row.finalPrice,
      clearanceUnusedDiscount: unusedClearanceDiscount,
      clearanceSourceKitId
    };
  });
};

const DEFAULT_DELIVERY_COORDS = { lat: 14.5995, lng: 120.9842 };
const MAP_DEFAULT_ZOOM = 17;
const MAP_MAX_PIN_ZOOM = 19;
// Ang mga locally-handled na methods na hindi gumagamit ng delivery address form
const LOCAL_METHODS = ['Seller Meetup', 'Self-Pickup'];



// Unified key resolver — i-resolve ang shorthand subKey (e.g. 'cop', 'cod', 'self') sa actual database key
// (e.g. 'cash-on-pickup', 'cash-on-delivery', 'self-booking') gamit ang fuzzy match sa suboptions
const resolveSuboptionKey = (methodConfig, subKey) => {
  if (!subKey || !methodConfig?.suboptions) return subKey;
  // Kung exact match na, return agad
  if (methodConfig.suboptions[subKey]) return subKey;
  // Fuzzy match — hanapin sa keys at labels ng suboptions
  const normalizedSub = subKey.toLowerCase().replace(/-/g, '');
  const found = Object.keys(methodConfig.suboptions).find(k => {
    const lowerKey = k.toLowerCase();
    const stripped = lowerKey.replace(/-/g, '');
    if (stripped === normalizedSub) return true;
    const label = (methodConfig.suboptions[k].label || '').toLowerCase();
    // Match common shorthands
    if (normalizedSub === 'cop' && (lowerKey.includes('pickup') || label.includes('pickup') || label.includes('cop') || lowerKey === 'standard-delivery' || label.includes('standard'))) return true;
    if (normalizedSub === 'cod' && (lowerKey.includes('delivery') || label.includes('delivery') || label.includes('cod'))) return true;
    if (normalizedSub === 'self' && (lowerKey.includes('self') || label.includes('self') || label.includes('customer'))) return true;
    if (normalizedSub === 'seller' && (lowerKey.includes('seller') || label.includes('seller') || lowerKey === 'standard-delivery' || label.includes('standard'))) return true;
    if (normalizedSub === 'delivery' && (lowerKey.includes('delivery') || label.includes('delivery') || lowerKey === 'standard-delivery' || label.includes('standard'))) return true;
    return false;
  });
  return found || subKey;
};

const checkUsesPickupPoint = (method, methodConfig, subKey) => {
  if (methodConfig && typeof methodConfig === 'object') {
    const rk = resolveSuboptionKey(methodConfig, subKey);
    if (methodConfig.hasSuboptions && rk && methodConfig.suboptions?.[rk]) {
      const sub = methodConfig.suboptions[rk];
      if (Array.isArray(sub.requiredFields)) {
        return sub.requiredFields.includes(14);
      }
      if (sub.isPickupRequired || sub.isSelfBooking) return true;
    }
    if (Array.isArray(methodConfig.requiredFields)) {
      return methodConfig.requiredFields.includes(14);
    }
  }
  if (method === 'Self-Pickup') return true;
  if (method === 'Lalamove' && subKey === 'self') return true;
  return false;
};

const checkUsesMeetupLocation = (method, methodConfig, subKey) => {
  if (methodConfig && typeof methodConfig === 'object') {
    const rk = resolveSuboptionKey(methodConfig, subKey);
    if (methodConfig.hasSuboptions && rk && methodConfig.suboptions?.[rk]) {
      const sub = methodConfig.suboptions[rk];
      if (Array.isArray(sub.requiredFields)) {
        return sub.requiredFields.includes(15);
      }
    }
    if (Array.isArray(methodConfig.requiredFields)) {
      return methodConfig.requiredFields.includes(15);
    }
  }
  if (method === 'Seller Meetup') return true;
  return false;
};

// Kuhanin ang required fields mula sa Firestore config — walang hardcoded defaults
// Ginagamit ang resolveSuboptionKey para ma-resolve ang shorthand keys (e.g. 'cop' → 'cash-on-pickup')
const getRequiredFields = (methodConfig, subKey = null) => {
  if (methodConfig && typeof methodConfig === 'object') {
    if (subKey) {
      const rk = resolveSuboptionKey(methodConfig, subKey);
      if (methodConfig.suboptions?.[rk]) {
        const subConfig = methodConfig.suboptions[rk];
        if (Array.isArray(subConfig.requiredFields)) return subConfig.requiredFields;
        // Suboption exists pero walang requiredFields — fall back to method-level
      }
    }
    if (Array.isArray(methodConfig.requiredFields)) return methodConfig.requiredFields;
    // May methodConfig pero walang kahit anong requiredFields — use default full address
    return [1, 2, 5, 6, 7, 9, 10, 11, 12];
  }
  return [1, 2, 5, 6, 7, 9, 10, 11, 12]; // fallback kung wala sa config
};

// Kuhanin ang courier name mula sa config — resolved subKey para sa suboption-level courier names
const getCourierName = (method, subKey, methodConfig) => {
  if (methodConfig && typeof methodConfig === 'object') {
    if (subKey) {
      const rk = resolveSuboptionKey(methodConfig, subKey);
      if (methodConfig.suboptions?.[rk]?.courierName) {
        return methodConfig.suboptions[rk].courierName;
      }
    }
    if (methodConfig.courierName) return methodConfig.courierName;
  }
  return method || 'Courier';
};

const isMethodEnabled = (methodConfig) => {
  // Kung wala sa Firestore (undefined/null), hindi enabled — ito ang bug fix.
  if (methodConfig === undefined || methodConfig === null) return false;
  if (typeof methodConfig === 'object') return methodConfig.active !== false;
  return methodConfig !== false;
};

const isSubMethodEnabled = (methodConfig, subKey) => {
  if (!isMethodEnabled(methodConfig)) return false;
  if (typeof methodConfig !== 'object' || methodConfig === null) return true;
  const rk = resolveSuboptionKey(methodConfig, subKey);
  const subVal = methodConfig.suboptions?.[rk] ?? methodConfig[rk];
  // Suboption can be stored as a boolean, an object with .active, or undefined (defaults to enabled)
  if (subVal === undefined) return true;
  if (subVal === false) return false;
  if (typeof subVal === 'object' && subVal !== null) return subVal.active !== false;
  return subVal !== false;
};

// Kuhanin ang handling discount setting — resolved subKey para tamang suboption ang ma-lookup
const getHandlingDiscountSetting = (shippingMethods = {}, method, subKey = null) => {
  const methodConfig = shippingMethods?.[method];
  if (typeof methodConfig !== 'object' || methodConfig === null) return false;
  const hasSuboptions = hasConfiguredSuboptions(methodConfig);
  if (subKey) {
    const rk = resolveSuboptionKey(methodConfig, subKey);
    const subConfig = methodConfig.suboptions?.[rk];
    if (subConfig?.handlingDiscount !== undefined) return subConfig.handlingDiscount;
    return false;
  }
  if (hasSuboptions) return false;
  return methodConfig.handlingDiscount === true;
};

const hasConfiguredSuboptions = (methodConfig) => (
  Object.keys(methodConfig?.suboptions || {}).length > 0
);

// I-convert ang suboption key sa display value gamit ang label mula sa config
// Para sa free shipping matching, ginagamit natin ang label ng suboption
const getSuboptionLabel = (shippingMethods, method, subKey) => {
  if (!subKey) return 'All';
  return shippingMethods?.[method]?.suboptions?.[subKey]?.label || subKey;
};

const getPaymentMethodConfig = (methods = {}, method = '') => {
  const raw = String(method || '').trim();
  if (!raw) return { active: false, transferDiscount: false, discountAmount: 0, qr: null };

  const compact = raw.replace(/\s+/g, '');
  const lower = raw.toLowerCase();
  const compactLower = compact.toLowerCase();
  const methodKey = Object.keys(methods || {}).find(key =>
    key.toLowerCase() === lower ||
    key.replace(/\s+/g, '').toLowerCase() === compactLower
  ) || lower;

  const transferDiscountKey = Object.keys(methods || {}).find(key =>
    key.toLowerCase() === `${methodKey.toLowerCase()}transferdiscount` ||
    key.toLowerCase() === `${lower}transferdiscount` ||
    key.toLowerCase() === `${compactLower}transferdiscount`
  );
  const discountAmountKey = Object.keys(methods || {}).find(key =>
    key.toLowerCase() === `${methodKey.toLowerCase()}discountamount` ||
    key.toLowerCase() === `${lower}discountamount` ||
    key.toLowerCase() === `${compactLower}discountamount`
  );
  const qrKey = Object.keys(methods || {}).find(key =>
    key.toLowerCase() === `${methodKey.replace(/\s+/g, '').toLowerCase()}qr` ||
    key.toLowerCase() === `${compactLower}qr`
  );

  return {
    key: methodKey,
    active: isMethodEnabled(methods?.[methodKey]),
    transferDiscount: transferDiscountKey ? methods[transferDiscountKey] === true : false,
    discountAmount: Math.max(0, Number(discountAmountKey ? methods[discountAmountKey] : 0) || 0),
    qr: qrKey ? methods[qrKey] : null
  };
};

const ensureStreetSuffix = (street) => {
  if (!street) return '';
  const hasSuffix = /\b(St\.?|Street|Ave\.?|Avenue|Rd\.?|Road|Blvd\.?|Boulevard|Lane|Ln\.?|Dr\.?|Drive|Ct\.?|Court)\b/i.test(street);
  return hasSuffix ? street : `${street} St.`;
};

const appendStreetSuffix = (address, street, formattedStreet) => {
  if (!address || !street || !formattedStreet || formattedStreet === street) return address;
  const startIndex = address.toLowerCase().indexOf(String(street).toLowerCase());
  if (startIndex === -1) return address;
  return `${address.slice(0, startIndex)}${formattedStreet}${address.slice(startIndex + street.length)}`;
};

const formatPlaceAddress = (place = {}) => {
  const street = ensureStreetSuffix(place.houseDetails || place.street);
  if (place.address) return appendStreetSuffix(place.address, place.houseDetails || place.street, street);
  const streetLine = [place.houseNo, street].filter(Boolean).join(' ').trim();
  return [
    place.address || place.vagueAddress,
    streetLine,
    place.subdivision,
    place.barangay,
    place.city,
    place.province,
    place.zipCode
  ].filter(Boolean).join(', ');
};

const formatPlaceAddressWithoutHouseNo = (place = {}) => {
  const street = ensureStreetSuffix(place.houseDetails || place.street);
  if (place.publicAddress) return appendStreetSuffix(place.publicAddress, place.houseDetails || place.street, street);
  let savedAddress = place.address || place.vagueAddress || '';
  const houseNo = String(place.houseNo || '').trim();
  if (houseNo && savedAddress.toLowerCase().startsWith(houseNo.toLowerCase())) {
    savedAddress = savedAddress.slice(houseNo.length).replace(/^[,\s]+/, '');
  }
  return [
    savedAddress,
    street,
    place.subdivision,
    place.barangay,
    place.city,
    place.province,
    place.zipCode
  ].filter(Boolean).join(', ');
};


const getPlaceLabel = (place = {}, fallback = 'Snorlax Garage') => {
  return place.landmark || formatPlaceAddress(place) || fallback;
};

const cleanAddressLandmark = (addressStr, landmark) => {
  if (!addressStr) return '';
  let clean = addressStr;
  if (landmark && clean.startsWith(landmark)) {
    clean = clean.substring(landmark.length).replace(/^[\s,]+/, '');
  }
  return clean;
};

const getCheckoutPlaceLabel = (place = {}, fallback = 'Pickup Point') => (
  place.landmark || formatPlaceAddressWithoutHouseNo(place) || formatPlaceAddress(place) || fallback
).replace(/^\d+\s+/, '');

const getCheckoutPlaceAddress = (place = {}, { includeHouseNo = false } = {}) => {
  const addr = (includeHouseNo ? formatPlaceAddress(place) : formatPlaceAddressWithoutHouseNo(place)).replace(/^\d+\s+/, '');
  return cleanAddressLandmark(addr, place.landmark);
};

// The admin pickup-point tag supplies the public rate-checking location.
// This keeps checkout dynamic instead of hardcoding a specific pickup point.
const getRateCheckingPickupIndex = (places = []) => {
  const rateCheckingIndex = places.findIndex(place => place.pickupAddressMode === 'rate-checking');
  return rateCheckingIndex >= 0 ? rateCheckingIndex : (places.length > 0 ? 0 : null);
};

const hasCheckoutSettings = (admin) => {
  return Boolean(admin?.shippingMethods || admin?.pickupDetails || admin?.paymentSettings);
};

const isFreeShippingActive = (item = {}, stock = null) => {
  const eligible = Boolean(item.isFreeShippingEligible || stock?.isFreeShippingEligible);
  if (!eligible) return false;
  const until = item.freeShippingUntil || stock?.freeShippingUntil || '';
  if (!until) return true;
  const expiry = new Date(until).getTime();
  return Number.isNaN(expiry) || Date.now() < expiry;
};

const normalizePromoValue = (value) => String(value ?? '').trim().toLowerCase();
const promoValuesMatch = (a, b) => normalizePromoValue(a) === normalizePromoValue(b);
const normalizeFreeShippingPromoSuboption = (suboption) => {
  const normalized = String(suboption ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized === 'cod' || normalized.includes('cashondelivery')) {
    return 'standard-delivery';
  }
  return suboption;
};

const isItemShippingEligibleForFreeShipping = (item, method, suboptionVal) => {
  if (!isFreeShippingActive(item, null)) return false;
  
  const promoMethod = item.freeShippingMethod || 'All';
  if (promoMethod === 'All') return true;
  if (!promoValuesMatch(promoMethod, method)) return false;
  
  const promoSub = normalizeFreeShippingPromoSuboption(item.freeShippingSuboption || 'All');
  if (promoSub === 'All') return true;
  const suboptionCandidates = Array.isArray(suboptionVal) ? suboptionVal : [suboptionVal];
  return suboptionCandidates.some(candidate => promoValuesMatch(candidate, promoSub));
};

const getSuboptionCandidatesFromKey = (shippingMethods, method, subKey) => {
  if (!subKey) return ['All'];
  const label = shippingMethods?.[method]?.suboptions?.[subKey]?.label;
  const normalizedKey = String(subKey || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedLabel = String(label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Legacy compatibility mappings
  let legacyVals = [];
  if (normalizedKey === 'standarddelivery' || normalizedLabel.includes('standarddelivery')) {
    legacyVals = ['cop', 'seller', 'delivery', 'cash-on-pickup', 'seller-booking', 'standard', 'COP', 'Cash On Pickup', 'Seller Booking', 'Standard Delivery'];
  } else if (normalizedKey === 'cop' || normalizedKey.includes('cashonpickup') || normalizedLabel.includes('cashonpickup') || normalizedLabel.includes('pickup')) {
    legacyVals = ['standard-delivery', 'standard', 'Standard Delivery', 'COP', 'Cash On Pickup'];
  } else if (normalizedKey === 'seller' || normalizedKey.includes('sellerbooking') || normalizedKey === 'self' || normalizedKey.includes('selfbooking') || normalizedLabel.includes('sellerbooking') || normalizedLabel.includes('selfbooking')) {
    legacyVals = ['standard-delivery', 'standard', 'Standard Delivery', 'Seller Booking', 'Self Booking'];
  } else if (
    normalizedKey === 'delivery' ||
    normalizedKey.includes('standarddelivery') ||
    (normalizedLabel.includes('delivery') && !normalizedLabel.includes('cashondelivery') && normalizedKey !== 'cod')
  ) {
    legacyVals = ['standard-delivery', 'standard', 'Standard Delivery'];
  }
  
  return Array.from(new Set([
    subKey,
    label,
    ...legacyVals
  ].filter(Boolean)));
};

const getSelectedShippingSubKey = (checkoutData = {}) => {
  return checkoutData.selectedSuboption || checkoutData.customSuboption || null;
};

const itemHasFreeShippingForSubKey = (item, method, subKey, shippingMethods) => {
  if (!isFreeShippingActive(item, null)) return false;
  const suboptionCandidates = getSuboptionCandidatesFromKey(shippingMethods, method, subKey);
  return isItemShippingEligibleForFreeShipping(item, method, suboptionCandidates);
};

function ChangeView({ center }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, MAP_DEFAULT_ZOOM);
  }, [center, map]);
  return null;
}

function MapRecenterButton({ center }) {
  const map = useMap();
  const recenter = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const maxZoom = map.getMaxZoom();
    map.setView(center, Number.isFinite(maxZoom) ? maxZoom : MAP_MAX_PIN_ZOOM, { animate: true });
  };

  return (
    <button
      type="button"
      onClick={recenter}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      className="absolute right-3 top-3 z-[1000] flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 bg-white text-blue-600 shadow-lg transition hover:scale-105 hover:bg-blue-600 hover:text-white dark:border-white/10 dark:bg-neutral-950"
      title="Back to pin"
      aria-label="Back to pin"
    >
      <MapPinSearch size={18} />
    </button>
  );
}

function CheckoutDropdown({ label, value, placeholder, options = [], onChange, disabled = false, showSelectedBadge = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const selectedOption = options.find(option => String(option.value) === String(value));
  const hasOptions = options.length > 0;

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!dropdownRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  const shellClass = "border-black/10 bg-white text-neutral-900 dark:border-white/10 dark:bg-neutral-950 dark:text-white";
  const popoverClass = "border-black/10 bg-white text-neutral-900 dark:border-white/10 dark:bg-neutral-950 dark:text-white";

  return (
    <div ref={dropdownRef} className="relative space-y-2">
      <span className="text-[12px] font-black uppercase tracking-widest opacity-40">{label}</span>
      <button
        type="button"
        onClick={() => !disabled && hasOptions && setIsOpen(prev => !prev)}
        disabled={disabled || !hasOptions}
        className={`flex h-12 w-full items-center justify-between rounded-2xl border px-4 text-left text-[13px] font-black uppercase tracking-wide transition-all ${
          isOpen ? 'border-blue-600 ring-2 ring-blue-600/15' : ''
        } ${disabled || !hasOptions ? 'cursor-not-allowed opacity-50' : 'hover:border-blue-600/40'} ${shellClass}`}
      >
        <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <span className={selectedOption ? 'min-w-0 truncate' : 'min-w-0 truncate opacity-45'}>
            {selectedOption?.label || placeholder}
          </span>
          {showSelectedBadge && selectedOption?.badge && (
            <span className="shrink-0 text-[12px] font-black text-emerald-500">
              {selectedOption.badge}
            </span>
          )}
        </span>
        <ChevronDown size={16} className={`shrink-0 opacity-55 transition-transform ${isOpen ? 'rotate-180 text-blue-600 opacity-100' : ''}`} />
      </button>

      {isOpen && !disabled && hasOptions && (
        <div className={`absolute left-0 top-full z-[650] mt-2 max-h-72 w-full overflow-y-auto rounded-[1.5rem] border p-2 shadow-2xl ${popoverClass}`}>
          {options.map(option => {
            const isSelected = String(option.value) === String(value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-black uppercase tracking-wide transition-all ${
                  isSelected ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'hover:bg-blue-600/10'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate">{option.label}</span>
                  {option.description && (
                    <span className={`mt-0.5 block truncate text-[12px] font-bold tracking-widest ${isSelected ? 'text-white/70' : 'opacity-40'}`}>
                      {option.description}
                    </span>
                  )}
                </span>
                {option.badge && (
                  <span className={`shrink-0 text-[12px] font-black ${isSelected ? 'text-emerald-200' : 'text-emerald-500'}`}>
                    {option.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const compressImage = (base64Str, maxWidth = 1024, maxHeight = 1024, quality = 0.7) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(base64Str);
  });
};


export default function CheckoutModal({ isOpen, onClose, items = [], isGuestPreview = false, variant = 'modal' }) {
  const navigate = useNavigate();
  const isPage = variant === 'page';
  const { isDarkMode } = useTheme();
  const { 
    user, reserveStockForCheckout, createOrder, completeAcceptedOffer, isAdmin, isAdminView,
    removeFromBasket, kits, deals, shelf, uploadReceipt, rates, updateUserProfile,
    adminsList, fetchAdmins, assignStockToOrder, adminData, garageInfo, orders,
    updateOrderDetails
  } = useStore();

  const [checkoutStep, setCheckoutStep] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  // const [activePreviewUrl, setActivePreviewUrl] = useState(null);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const [createdOrderIds, setCreatedOrderIds] = useState([]);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [isPaymentPolicyOpen, setIsPaymentPolicyOpen] = useState(false);
  
  const [checkoutData, setCheckoutData] = useState({
    shippingMethod: '', 
    lbcType: '', 
    lbcBranch: '',
    lalamoveType: '',
    spxType: '',
    meetupLocation: '',
    meetupLocationIndex: null,
    pickupLocation: '',
    pickupLocationIndex: null,
    paymentPlan: '', 
    paymentMethod: '',
    initialPayment: 0
  });

  const [addressStatus, setAddressStatus] = useState({
    isPinConfirmed: false,
    isEditingAddress: false
  });
  const [detailsEditSnapshot, setDetailsEditSnapshot] = useState(null);

  const mapRef = useRef(null);

  const [validationState, setValidationState] = useState({
    zipCode: true,
    province: true,
    city: true,
    barangay: true
  });

  const [deliveryData, setDeliveryData] = useState({
    receiverName: "",
    email: "",
    phoneNumber: "",
    landmark: "",
    houseNo: "",
    houseDetails: "",
    subdivision: "",
    barangay: "",
    city: "",
    province: "",
    zipCode: "",
    lat: DEFAULT_DELIVERY_COORDS.lat,
    lng: DEFAULT_DELIVERY_COORDS.lng
  });
  const deliveryDataRef = useRef(deliveryData);
  const checkoutDataRef = useRef(checkoutData);
  const hasPreselectedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      hasPreselectedRef.current = false;
    }
  }, [isOpen]);

  const updateDeliveryData = useCallback((updater) => {
    setDeliveryData(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      deliveryDataRef.current = next;
      return next;
    });
  }, []);

  const updateCheckoutData = useCallback((updater) => {
    setCheckoutData(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      checkoutDataRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    deliveryDataRef.current = deliveryData;
  }, [deliveryData]);

  useEffect(() => {
    checkoutDataRef.current = checkoutData;
  }, [checkoutData]);

  useEffect(() => {
    console.log("CheckoutModal items prop updated:", items);
  }, [items]);

  useEffect(() => {
    if (!isOpen) return;

    const details = user?.userDetails || {};
    const primaryDelivery = user?.deliveryDetails?.[0] || {};
    
    // An anonymous Firebase user is still a guest shopper, not a recipient.
    // Do not prefill the checkout form with the anonymous account label.
    const accountName = isGuestPreview ? "" : (user?.displayName || "");
    const accountEmail = isGuestPreview ? "" : (user?.email || "");

    updateDeliveryData({
      receiverName: details.receiverName || primaryDelivery.receiverName || accountName,
      email: details.email || accountEmail,
      phoneNumber: details.mobileNo || primaryDelivery.phoneNumber || "",
      landmark: primaryDelivery.landmark || "",
      houseNo: primaryDelivery.houseNo || "",
      houseDetails: primaryDelivery.houseDetails || "",
      subdivision: primaryDelivery.subdivision || "",
      barangay: primaryDelivery.barangay || "",
      city: primaryDelivery.city || "",
      province: primaryDelivery.province || "",
      zipCode: primaryDelivery.zipCode || "",
      lat: Number(primaryDelivery.lat) || DEFAULT_DELIVERY_COORDS.lat,
      lng: Number(primaryDelivery.lng) || DEFAULT_DELIVERY_COORDS.lng
    });
    
    // Batch updates using functional update to satisfy ESLint
    setAddressStatus(prev => ({
        ...prev,
        isPinConfirmed: Boolean(primaryDelivery.lat && primaryDelivery.lng),
        isEditingAddress: false
    }));
  }, [isOpen, isGuestPreview, user?.userDetails, user?.deliveryDetails, user?.displayName, user?.email, user?.mobileNo, updateDeliveryData]);

  useEffect(() => {
    if (isOpen && isAdmin) {
      const unsub = fetchAdmins();
      return () => unsub?.();
    }
    return undefined;
  }, [isOpen, isAdmin, fetchAdmins]);

  // Block browser back button kapag nasa payment step (step 2) na —
  // i-redirect sa /orders imbes na bumalik sa checkout form
  useEffect(() => {
    if (checkoutStep !== 2) return;

    const handlePopState = (e) => {
      // Kapag nag-back ang user habang nasa payment step, i-redirect sa orders
      // at i-cleanup ang checkout state
      e.preventDefault();
      setCheckoutStep(1);
      setPreviewUrl(null);
      // setActivePreviewUrl(null);
      setPaymentSubmitted(false);
      setCreatedOrderIds([]);
      setIsUploading(false);
      setIsFinalizing(false);
      if (isPage) {
        navigate('/orders', { replace: true });
      } else {
        onClose();
        navigate('/orders');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [checkoutStep, navigate, isPage, onClose]);

  const { shippingSettings } = useStore();

  const storeAdmin = useMemo(() => {
    if (hasCheckoutSettings(shippingSettings)) return shippingSettings;
    if (hasCheckoutSettings(adminData)) return adminData;
    if (hasCheckoutSettings(garageInfo?.checkoutSettings)) return garageInfo.checkoutSettings;
    return (adminsList || []).find(a => a.shippingMethods && a.pickupDetails) ||
      (adminsList || []).find(hasCheckoutSettings) ||
      null;
  }, [adminData, garageInfo, adminsList, shippingSettings]);

  const isMaintenance = useMemo(() => {
    return storeAdmin?.paymentSettings?.maintenanceMode === true;
  }, [storeAdmin]);

  const isAdminCheckoutConfigReady = Boolean(storeAdmin);

  const pickupPoints = useMemo(() => {
    const rawPickup = storeAdmin?.pickupDetails?.['pickup-point'];
    if (!rawPickup) return [];
    return (rawPickup.places || (rawPickup.landmark ? [rawPickup] : []))
      .filter(p => p.isActive !== false)
      .map(p => ({
        ...p,
        pickupAddressMode: p.pickupAddressMode === 'actual-pin' ? 'actual-pin' : 'rate-checking'
      }));
  }, [storeAdmin]);

  const rateCheckingPickupIndex = useMemo(
    () => getRateCheckingPickupIndex(pickupPoints),
    [pickupPoints]
  );

  const usesPickupPoint = useMemo(() => {
    const method = checkoutData.shippingMethod;
    if (!method) return false;
    const subKey = getSelectedShippingSubKey(checkoutData);
    const methodConfig = storeAdmin?.shippingMethods?.[method];
    return checkUsesPickupPoint(method, methodConfig, subKey);
  }, [checkoutData, storeAdmin]);

  const usesMeetupLocation = useMemo(() => {
    const method = checkoutData.shippingMethod;
    if (!method) return false;
    const subKey = getSelectedShippingSubKey(checkoutData);
    const methodConfig = storeAdmin?.shippingMethods?.[method];
    return checkUsesMeetupLocation(method, methodConfig, subKey);
  }, [checkoutData, storeAdmin]);

  // Pickup-point checkout always resolves to the active point tagged
  // Rate Checking. This supplies both the public address and map pin
  // dynamically, so a different tagged point can be configured later.
  useEffect(() => {
    if (!isOpen || !usesPickupPoint || rateCheckingPickupIndex === null) return;
    const rateCheckingPlace = pickupPoints[rateCheckingPickupIndex];
    if (!rateCheckingPlace) return;

    const rateCheckingLabel = getCheckoutPlaceLabel(
      rateCheckingPlace,
      `Pickup Point ${rateCheckingPickupIndex + 1}`
    );
    const isAlreadySelected = checkoutData.pickupLocationIndex === rateCheckingPickupIndex
      && checkoutData.pickupLocation === rateCheckingLabel;
    if (isAlreadySelected) return;

    updateCheckoutData(prev => ({
      ...prev,
      pickupLocation: rateCheckingLabel,
      pickupLocationIndex: rateCheckingPickupIndex
    }));
  }, [checkoutData.pickupLocation, checkoutData.pickupLocationIndex, isOpen, pickupPoints, rateCheckingPickupIndex, updateCheckoutData, usesPickupPoint]);

  const selectedPickupDetails = useMemo(() => {
    if (!usesPickupPoint) return null;
    const byIndex = Number.isInteger(checkoutData.pickupLocationIndex)
      ? pickupPoints[checkoutData.pickupLocationIndex]
      : null;
    if (byIndex?.pickupAddressMode === 'rate-checking' && byIndex.isActive !== false) return byIndex;
    const rateCheckingPlace = rateCheckingPickupIndex !== null ? pickupPoints[rateCheckingPickupIndex] : null;
    if (rateCheckingPlace && rateCheckingPlace.isActive !== false) return rateCheckingPlace;
    if (byIndex && byIndex.isActive !== false) return byIndex;
    return pickupPoints.find((p, idx) => {
      const fallbackLabel = `Pickup Point ${idx + 1}`;
      return [
        getCheckoutPlaceLabel(p, fallbackLabel),
        getCheckoutPlaceAddress(p),
        getPlaceLabel(p, fallbackLabel),
        formatPlaceAddressWithoutHouseNo(p),
        formatPlaceAddress(p)
      ].filter(Boolean).some(value => value === checkoutData.pickupLocation);
    }) || (rateCheckingPickupIndex !== null ? pickupPoints[rateCheckingPickupIndex] : null) || null;
  }, [pickupPoints, rateCheckingPickupIndex, checkoutData.pickupLocation, checkoutData.pickupLocationIndex, usesPickupPoint]);

  const shopDefaultLocation = useMemo(() => {
    if (selectedPickupDetails?.lat && selectedPickupDetails?.lng) return [selectedPickupDetails.lat, selectedPickupDetails.lng];
    return [14.2965, 121.1118];
  }, [selectedPickupDetails]);

  const selectedMeetupDetails = useMemo(() => {
    if (!usesMeetupLocation) return null;
    const places = storeAdmin?.pickupDetails?.meetup?.places || [];
    const activePlaces = places.filter(p => p.isActive !== false);
    const byIndex = Number.isInteger(checkoutData.meetupLocationIndex)
      ? activePlaces[checkoutData.meetupLocationIndex]
      : null;
    if (byIndex && byIndex.isActive !== false) return byIndex;
    return activePlaces.find((p, idx) => {
      const fallbackLabel = `Meetup Place ${idx + 1}`;
      return [
        getCheckoutPlaceLabel(p, fallbackLabel),
        getCheckoutPlaceAddress(p),
        getPlaceLabel(p, fallbackLabel),
        formatPlaceAddressWithoutHouseNo(p),
        formatPlaceAddress(p)
      ].filter(Boolean).some(value => value === checkoutData.meetupLocation);
    }) || activePlaces[0] || null;
  }, [storeAdmin, checkoutData.meetupLocation, checkoutData.meetupLocationIndex, usesMeetupLocation]);

  const meetupCoord = useMemo(() => {
    if (selectedMeetupDetails?.lat && selectedMeetupDetails?.lng) {
      return [selectedMeetupDetails.lat, selectedMeetupDetails.lng];
    }
    return shopDefaultLocation;
  }, [selectedMeetupDetails, shopDefaultLocation]);

  const checkoutItems = useMemo(() => {
    const checkoutFees = getCheckoutPaymentFees({ shippingSettings: storeAdmin });
    const { handlingFee, installmentFee, transferFee } = checkoutFees;
    const normalizedItems = (items || []).map(item => {
      const quantity = item.quantity || 1;
      const kit = findCheckoutKit(kits, item);
      const appliedHandlingFee = Number(item.appliedHandlingFee) > 0 ? Number(item.appliedHandlingFee) : handlingFee;
      const appliedInstallmentFee = Number(item.appliedInstallmentFee) > 0 ? Number(item.appliedInstallmentFee) : installmentFee;
      const appliedTransferFee = Number(item.appliedTransferFee) > 0 ? Number(item.appliedTransferFee) : transferFee;
      const basePrice = getCheckoutItemBasePrice(item, kit, {
        handling: appliedHandlingFee,
        installment: appliedInstallmentFee,
        transfer: appliedTransferFee
      });
      
      return {
        ...item,
        quantity,
        price: basePrice, // Unit price (base)
        sellPrice: basePrice,
        displayPrice: basePrice, // Base price per unit
        image: item.image || kit?.image || null,
        images: item.images || kit?.images || null,
        appliedHandlingFee,
        appliedInstallmentFee,
        appliedTransferFee,
        originalSellPrice: isProjectCheckoutItem(item)
          ? 0
          : getStockStandaloneSellPrice(item, kit),
        isFreeShippingEligible: isFreeShippingActive(item, kit?.stocks?.[item.stockKey]),
        freeShippingUntil: item.freeShippingUntil || kit?.stocks?.[item.stockKey]?.freeShippingUntil || '',
        freeShippingMethod: item.freeShippingMethod || kit?.stocks?.[item.stockKey]?.freeShippingMethod || 'All',
        freeShippingSuboption: item.freeShippingSuboption || kit?.stocks?.[item.stockKey]?.freeShippingSuboption || 'All'
      };
    });

    return applyActiveBasketDeal(normalizedItems, deals, kits, {
      ...checkoutFees,
      handlingFee,
      installmentFee,
      transferFee
    });
  }, [items, kits, deals, storeAdmin]);


  const hasPreOrders = useMemo(() => {
    return checkoutItems.some(item => {
      if (isProjectCheckoutItem(item)) return false;
      const itemStatus = (item.status || '').toUpperCase();
      const kit = (kits || []).find(k => k.id === item.id);
      const stockStatus = (kit?.stocks?.[item.stockKey]?.status || '').toUpperCase();
      return itemStatus.includes('PRE-ORDER') || item.isPreOrder || stockStatus.includes('PRE-ORDER');
    });
  }, [checkoutItems, kits]);

  const hasProjects = useMemo(() => {
    return checkoutItems.some(isProjectCheckoutItem);
  }, [checkoutItems]);

  const availabilityNotice = useMemo(() => {
    if (checkoutItems.length === 0) return '';

    const scheduleType = hasProjects ? 'printing' : 'shipping';
    const schedule = storeAdmin?.availabilitySchedule;
    const unavailableDates = getUnavailableDateSet(schedule, scheduleType);
    const unavailableWeekdays = getUnavailableWeekdaySet(schedule, scheduleType);
    const todayDate = new Date();
    const todayKey = toDateKey(todayDate);
    const todayIsUnavailable = unavailableDates.has(todayKey)
      || unavailableWeekdays.has(todayDate.getDay());
    const blockedKey = todayIsUnavailable ? todayKey : '';

    if (!blockedKey) return '';

    const nextAvailableDate = getNextAvailableDate(schedule, scheduleType, new Date(`${blockedKey}T00:00:00`));
    if (!nextAvailableDate) return '';
    return {
      warning: 'PLEASE EXPECT SHIPPING DELAY',
      detail: `Next ${scheduleType} will be on ${formatAvailabilityDate(nextAvailableDate)}.`
    };
  }, [checkoutItems.length, hasProjects, storeAdmin?.availabilitySchedule]);

  const isCheckoutUnderMaintenance = useMemo(() => {
    if (!isMaintenance) return false;
    const invalidTypes = storeAdmin?.paymentSettings?.maintenanceInvalidTypes || {};
    const hasKits = checkoutItems.some(item => !isProjectCheckoutItem(item));
    return (hasKits && invalidTypes.kit !== false)
      || (hasProjects && invalidTypes.prints !== false);
  }, [checkoutItems, hasProjects, isMaintenance, storeAdmin]);

  const isGuestLoginRequired = isGuestPreview;
  const shouldShowGuestSignInPrompt = isGuestLoginRequired
    && checkoutItems.length > 0
    && !isCheckoutUnderMaintenance;
  const canBypassMaintenance = import.meta.env.DEV || isAdmin;
  // Local development and authenticated admins using the public storefront can
  // test payments. Guests still sign in; regular production users are blocked.
  const isOrderInvalidForMaintenance = isCheckoutUnderMaintenance
    && !isGuestLoginRequired
    && !canBypassMaintenance;

  // Detect if selected suboption is a "Cash On" variant (COD/COP/custom)
  const isCashOnSuboption = useMemo(() => {
    const selectedSubKey = getSelectedShippingSubKey(checkoutData, storeAdmin?.shippingMethods);
    const suboptionLabel = selectedSubKey
      ? (getSuboptionLabel(storeAdmin?.shippingMethods, checkoutData.shippingMethod, selectedSubKey) || '')
      : '';
    return (selectedSubKey || '').toLowerCase() === 'cod' || 
      (selectedSubKey || '').toLowerCase() === 'cop' || 
      suboptionLabel.toLowerCase().includes('cash on');
  }, [checkoutData, storeAdmin]);


  const orderFees = useMemo(() => {
    const fallbackHandling = Math.max(0, ...(items || []).map(item => Number(item.appliedHandlingFee || 0)));
    const fallbackTransfer = Math.max(0, ...(items || []).map(item => Number(item.appliedTransferFee || 0)));
    const configuredHandling = Number(storeAdmin?.paymentSettings?.handlingFee ?? storeAdmin?.pickupDetails?.handlingFee ?? 0);
    const configuredTransfer = Number(storeAdmin?.paymentSettings?.transferFee ?? 0);
    const handling = Math.max(configuredHandling, fallbackHandling);
    const transfer = Math.max(configuredTransfer, fallbackTransfer);
    return { handling, transfer };
  }, [items, storeAdmin]);

  const totalAppliedHandlingFee = useMemo(() => orderFees.handling, [orderFees]);
  const projectInstallmentFee = useMemo(() => {
    return hasProjects ? (checkoutItems.find(isProjectCheckoutItem)?.appliedInstallmentFee || 0) : 0;
  }, [checkoutItems, hasProjects]);

  const kitInstallmentFeesTotal = useMemo(() => {
    return checkoutItems
      .filter(item => !isProjectCheckoutItem(item))
      .reduce((sum, item) => sum + (item.appliedInstallmentFee || 0) * (item.quantity || 1), 0);
  }, [checkoutItems]);

  const totalAppliedInstallmentFee = useMemo(() => kitInstallmentFeesTotal + projectInstallmentFee, [kitInstallmentFeesTotal, projectInstallmentFee]);

  const totalAppliedTransferFee = useMemo(() => orderFees.transfer, [orderFees]);

// HANAPIN AT I-UPDATE ANG BASETOTAL SA IYONG CHECKOUTMODAL.JSX
const baseTotal = useMemo(() => {
  // 1. Kunin muna ang sum ng lahat ng items (Base Price + Installment Fee * Quantity)
  const itemsTotal = checkoutItems.reduce((total, item) => {
    const basePrice = Number(item.price || item.sellPrice || item.projectData?.sellPrice || 0);
    const installmentFee = Number(item.appliedInstallmentFee) || 0;
    
    return total + (basePrice + installmentFee) * (item.quantity || 1);
  }, 0);

  // 2. I-add ang Handling at Transfer Fee ng ISANG BESES LANG (Per Order) sa pinakahuli
  // Sa ganitong paraan, hindi mababawasan ang final total mo pero hindi rin madodoble kada item!
  return itemsTotal + (orderFees.handling || 0) + (orderFees.transfer || 0);

}, [checkoutItems, orderFees]);

  const transferFeeDiscount = useMemo(() => {
    if (!checkoutData.shippingMethod || !checkoutData.paymentMethod) return 0;
    const methodConfig = getPaymentMethodConfig(storeAdmin?.paymentSettings?.methods, checkoutData.paymentMethod);
    return methodConfig.transferDiscount ? totalAppliedTransferFee : 0;
  }, [checkoutData.shippingMethod, checkoutData.paymentMethod, totalAppliedTransferFee, storeAdmin]);

  const fixedPaymentMethodDiscount = useMemo(() => {
    if (!checkoutData.paymentMethod) return 0;
    const methodConfig = getPaymentMethodConfig(storeAdmin?.paymentSettings?.methods, checkoutData.paymentMethod);
    return Math.max(0, Number(methodConfig.discountAmount || 0));
  }, [checkoutData.paymentMethod, storeAdmin?.paymentSettings?.methods]);

  const paymentMethodDiscount = useMemo(() => {
    return Math.max(transferFeeDiscount, fixedPaymentMethodDiscount);
  }, [fixedPaymentMethodDiscount, transferFeeDiscount]);

  const handlingFeeDiscount = useMemo(() => {
    if (!checkoutData.shippingMethod) return 0;
    const method = checkoutData.shippingMethod;
    const subKey = getSelectedShippingSubKey(checkoutData);
    const suboptionValue = getSuboptionCandidatesFromKey(storeAdmin?.shippingMethods, method, subKey);
    const hasFreeShipping = checkoutItems.some(item => (
      isItemShippingEligibleForFreeShipping(item, method, suboptionValue)
    ));
    const shouldDiscountHandling = hasFreeShipping
      || getHandlingDiscountSetting(storeAdmin?.shippingMethods, method, subKey);
    if (!shouldDiscountHandling) return 0;
    return totalAppliedHandlingFee;
  }, [checkoutData, checkoutItems, storeAdmin?.shippingMethods, totalAppliedHandlingFee]);

  const installmentFeeDiscount = useMemo(() => {
    const hasDiscount = checkoutData.paymentPlan === 'full';
    return hasDiscount ? totalAppliedInstallmentFee : 0;
  }, [checkoutData.paymentPlan, totalAppliedInstallmentFee]);

  // Payment-method promos apply to the cash transfer fee only. A smaller
  // promo reduces that fee; it never silently discounts the kits themselves.
  const cashTransferFeeDiscount = useMemo(() => {
    return Math.min(Math.max(0, paymentMethodDiscount), totalAppliedTransferFee);
  }, [paymentMethodDiscount, totalAppliedTransferFee]);

  const garageDiscount = useMemo(() => {
    return handlingFeeDiscount + installmentFeeDiscount + cashTransferFeeDiscount;
  }, [handlingFeeDiscount, installmentFeeDiscount, cashTransferFeeDiscount]);

  const totalToSettle = useMemo(() => {
    const result = (baseTotal || 0) - garageDiscount;
    return isNaN(result) ? 0 : Math.max(0, result);
  }, [baseTotal, garageDiscount]);

  // Keep all item installment fees visible in the subtotal. Full payment
  // removes them through its own explicit discount row below.
  const summaryItemsSubtotal = useMemo(() => {
    return checkoutItems.reduce((sum, item) => {
      const sourceKit = findCheckoutKit(kits, item);
      const standalonePrice = Number(sourceKit?.stocks?.[item.stockKey]?.sellPrice || sourceKit?.sellPrice || 0);
      const basePrice = isBundleOrClearanceItem(item) && standalonePrice > 0
        ? standalonePrice
        : Number(item.price || item.sellPrice || item.projectData?.sellPrice || 0);
      const installmentFee = Number(item.appliedInstallmentFee || 0);
      return sum + (basePrice + installmentFee) * (item.quantity || 1);
    }, 0);
  }, [checkoutItems, kits]);

  const bundleDiscount = useMemo(() => {
    return checkoutItems.reduce((sum, item) => {
      if (!isBundleOrClearanceItem(item) || item.isClearanceBundle === true) return sum;
      const sourceKit = findCheckoutKit(kits, item);
      const standalonePrice = Number(sourceKit?.stocks?.[item.stockKey]?.sellPrice || sourceKit?.sellPrice || 0);
      const dealPrice = Number(item.price || item.sellPrice || 0);
      return sum + Math.max(0, standalonePrice - dealPrice) * (item.quantity || 1);
    }, 0);
  }, [checkoutItems, kits]);

  const clearanceDiscount = useMemo(() => {
    return checkoutItems.reduce((sum, item) => {
      if (item.isClearanceBundle !== true) return sum;
      const sourceKit = findCheckoutKit(kits, item);
      const standalonePrice = Number(sourceKit?.stocks?.[item.stockKey]?.sellPrice || sourceKit?.sellPrice || 0);
      const dealPrice = Number(item.price || item.sellPrice || 0);
      return sum + Math.max(0, standalonePrice - dealPrice) * (item.quantity || 1);
    }, 0);
  }, [checkoutItems, kits]);

  const unusedClearanceDiscount = useMemo(() => (
    checkoutItems.reduce(
      (maxUnused, item) => Math.max(maxUnused, Number(item.clearanceUnusedDiscount || 0)),
      0
    )
  ), [checkoutItems]);

  const isHandlingFeeDiscounted = handlingFeeDiscount > 0 && orderFees.handling > 0;
  const isCashTransferFeeDiscounted = cashTransferFeeDiscount > 0 && orderFees.transfer > 0;
  const isCashTransferFeeFullyDiscounted = cashTransferFeeDiscount >= orderFees.transfer && orderFees.transfer > 0;
  const remainingHandlingFee = Math.max(0, orderFees.handling - handlingFeeDiscount);
  const remainingCashTransferFee = Math.max(0, orderFees.transfer - cashTransferFeeDiscount);
  const fullPaymentInstallmentDiscount = checkoutData.paymentPlan === 'full' ? totalAppliedInstallmentFee : 0;

  const distributedOrderFees = useMemo(() => {
    const lineValues = checkoutItems.map(item => {
      const sourceKit = findCheckoutKit(kits, item);
      const standaloneBasePrice = isProjectCheckoutItem(item)
        ? Number(item.projectData?.sellPrice || item.sellPrice || item.price || 0)
        : getStockStandaloneSellPrice(item, sourceKit);
      const installmentFee = Number(item.appliedInstallmentFee || 0);
      return (standaloneBasePrice + installmentFee) * (Number(item.quantity) || 1);
    });
    const handlingShares = distributeFeeByLineValue(remainingHandlingFee, lineValues);
    const transferShares = distributeFeeByLineValue(remainingCashTransferFee, lineValues);

    return checkoutItems.map((_, index) => ({
      handling: handlingShares[index] || 0,
      transfer: transferShares[index] || 0,
      total: (handlingShares[index] || 0) + (transferShares[index] || 0)
    }));
  }, [checkoutItems, kits, remainingHandlingFee, remainingCashTransferFee]);

  // The strike-through comparison represents the selected set bought
  // independently. Handling and transfer are order-level fees, so distribute
  // one fee of each type across the selected units instead of repeating both
  // fees on every line.
  const standaloneDistributedOrderFees = useMemo(() => {
    const totalUnits = checkoutItems.reduce(
      (sum, item) => sum + Math.max(1, Number(item.quantity) || 1),
      0
    );
    let unitOffset = 0;
    return checkoutItems.map(item => {
      const handling = getIntegerFeeShare(orderFees.handling, totalUnits, unitOffset);
      const transfer = getIntegerFeeShare(orderFees.transfer, totalUnits, unitOffset);
      unitOffset += Math.max(1, Number(item.quantity) || 1);
      return {
        handling,
        transfer,
        total: handling + transfer
      };
    });
  }, [checkoutItems, orderFees.handling, orderFees.transfer]);

  const isInstallmentPlan = useMemo(() => (
    checkoutData.paymentPlan === 'partial' ||
    checkoutData.paymentPlan === 'reservation'
  ), [checkoutData.paymentPlan]);

  const amountDueNow = useMemo(() => {
    return isInstallmentPlan ? Number(checkoutData.initialPayment || 0) : totalToSettle;
  }, [checkoutData.initialPayment, isInstallmentPlan, totalToSettle]);

  const minInitialPayment = useMemo(() => {
    const hasStlWithDesignService = checkoutItems.some(item => 
      isProjectCheckoutItem(item) && 
      item.projectData?.method?.name?.toUpperCase() === 'STL' && 
      item.projectData?.selectedDesignService
    );

    if (hasStlWithDesignService) {
      const sum = checkoutItems.reduce((acc, item) => {
        if (isProjectCheckoutItem(item) && item.projectData?.method?.name?.toUpperCase() === 'STL' && item.projectData?.selectedDesignService) {
          const serviceId = item.projectData.selectedDesignService;
          const dsRates = rates?.['design-services'] || {};
          const basePrice = Number(dsRates[serviceId]?.basePrice) || 0;
          return acc + basePrice;
        }
        return acc + Number(item.minDownpayment ?? item.projectData?.minDownpayment ?? 0);
      }, 0);
      return isNaN(sum) ? 0 : Math.min(Math.max(0, sum), totalToSettle);
    }

    const itemDownpayments = checkoutItems.map(item => Number(item.minDownpayment ?? item.projectData?.minDownpayment ?? 0));
    const maxItemDown = Math.max(0, ...itemDownpayments);
    const base = maxItemDown > 0 ? maxItemDown : (rates?.general?.downpayment || 500);
    // Always ceiling the base minimum by 10s
    const ceilingBase = Math.ceil(base / 10) * 10;
    // Cap the minimum by the total to settle
    return isNaN(ceilingBase) ? 0 : Math.min(Math.max(0, ceilingBase), totalToSettle);
  }, [checkoutItems, rates, totalToSettle]);

  const isMethodFreeShipping = useCallback((method, subKey = null) => {
    if (checkoutItems.length === 0) return false;
    // Gamitin ang label ng suboption para sa free shipping matching
    const suboptionVal = getSuboptionCandidatesFromKey(storeAdmin?.shippingMethods, method, subKey);
    return checkoutItems.some(item =>
      isItemShippingEligibleForFreeShipping(item, method, suboptionVal)
    );
  }, [checkoutItems, storeAdmin?.shippingMethods]);

  const isFreeShippingApplied = useMemo(() => {
    if (!checkoutData.shippingMethod) return false;
    const method = checkoutData.shippingMethod;
    const subKey = getSelectedShippingSubKey(checkoutData);
    return isMethodFreeShipping(method, subKey);
  }, [checkoutData, isMethodFreeShipping]);

  // Sync initial payment with bounds when plan, min, or total changes
  useEffect(() => {
    if (checkoutData.paymentPlan && checkoutData.paymentPlan !== 'full') {
      const current = Number(checkoutData.initialPayment) || 0;
      if (current < minInitialPayment) {
        updateCheckoutData(prev => ({ ...prev, initialPayment: minInitialPayment }));
      } else if (current > totalToSettle) {
        updateCheckoutData(prev => ({ ...prev, initialPayment: totalToSettle }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minInitialPayment, totalToSettle, checkoutData.paymentPlan, updateCheckoutData]);

  // Generic free-shipping config override para sa lahat ng methods
  // Kung ang isang item ay may free shipping para sa specific method+suboption, i-force enable ang method
  const getMethodConfigWithFreeShipping = useCallback((methodName) => {
    const baseConfig = storeAdmin?.shippingMethods?.[methodName];

    // Check if any checkout item has a free shipping promo configured for this methodName
    const hasFreeForMethod = checkoutItems.some(item => {
      if (!isFreeShippingActive(item, null)) return false;
      const promoMethod = item.freeShippingMethod || 'All';
      return promoMethod === 'All' || promoValuesMatch(promoMethod, methodName);
    });

    if (!hasFreeForMethod) {
      return baseConfig;
    }

    // Track whether the method itself was originally disabled.
    // When it was disabled, only the promo-specific suboptions should be exposed.
    const wasMethodDisabled = !isMethodEnabled(baseConfig);

    // Force active true if there is a free shipping promo
    let baseObj = typeof baseConfig === 'object' && baseConfig !== null
      ? { ...baseConfig }
      : { active: true };

    baseObj.active = true;

    // Check all suboptions (including disabled ones) for a free shipping promo.
    // If there is free shipping for a suboption, force-enable it for checkout.
    const suboptions = { ...(baseObj.suboptions || {}) };
    const freeShippingSubOverrides = {};

    Object.entries(suboptions).forEach(([subKey, subVal]) => {
      const hasFree = checkoutItems.some(item =>
        itemHasFreeShippingForSubKey(item, methodName, subKey, storeAdmin?.shippingMethods)
      );
      if (hasFree) {
        freeShippingSubOverrides[subKey] = { ...subVal, active: true, _freeShippingForced: true };
      }
    });

    // Kapag may kahit anong suboption na may free shipping, i-force-enable din ang standard-delivery
    const anyCustomSubHasFree = Object.keys(freeShippingSubOverrides).length > 0;
    if (anyCustomSubHasFree && suboptions['standard-delivery']) {
      freeShippingSubOverrides['standard-delivery'] = { 
        ...suboptions['standard-delivery'], 
        active: true, 
        _freeShippingForced: true 
      };
    }

    // Key rule: when the method itself was disabled, ONLY expose the suboptions that
    // have a free shipping promo — do NOT expose other suboptions even if they are
    // individually enabled in Firebase. The free shipping promo unlocks exactly what
    // was configured for the promotion, nothing more.
    // When the method was already enabled, keep all existing suboptions and additionally
    // unlock any disabled suboption that has a promo.
    const finalSuboptions = wasMethodDisabled
      ? freeShippingSubOverrides
      : { ...suboptions, ...freeShippingSubOverrides };

    // Para sa standard couriers (SPX, LBC, Lalamove) na nag-iimbak ng suboption state
    // bilang top-level boolean key (e.g. SPX Express.delivery = false) kaysa sa nested
    // suboptions map, i-force-enable din ang top-level key kapag may free shipping promo.
    // Ito ay para ma-enable ang Standard Delivery suboption kahit naka-disable sa Firebase
    // kapag ang courier ay may free shipping promo para doon.
    const topLevelSubKeys = methodName === 'LBC' ? ['cop', 'cod']
      : methodName === 'Lalamove' ? ['self', 'seller']
      : methodName === 'SPX Express' ? ['delivery', 'cod']
      : [];
    // Ang standard delivery key ng bawat courier
    const standardSubKey = methodName === 'LBC' ? 'cop'
      : methodName === 'Lalamove' ? 'seller'
      : methodName === 'SPX Express' ? 'delivery'
      : null;
    const topLevelOverrides = {};
    let anySubHasFree = false;
    topLevelSubKeys.forEach(subKey => {
      const hasFree = checkoutItems.some(item =>
        itemHasFreeShippingForSubKey(item, methodName, subKey, storeAdmin?.shippingMethods)
      );
      if (hasFree) {
        // I-override ang top-level key sa true para ma-enable ng isSubMethodEnabled
        topLevelOverrides[subKey] = true;
        anySubHasFree = true;
      }
    });
    // Kapag may kahit anong free shipping promo ang courier, i-force-enable din
    // ang standard delivery suboption kahit wala itong sariling promo
    if (anySubHasFree && standardSubKey && !topLevelOverrides[standardSubKey]) {
      topLevelOverrides[standardSubKey] = true;
    }

    return {
      ...baseObj,
      ...topLevelOverrides,
      suboptions: finalSuboptions,
      // Propagate the flag so downstream filters/renderers can apply the same rule
      // for standard methods whose suboptions are not stored in the suboptions map.
      _wasDisabled: wasMethodDisabled
    };
  }, [storeAdmin?.shippingMethods, checkoutItems]);

  const enabledShippingMethods = useMemo(() => {
    if (!isAdminCheckoutConfigReady) return {};
    const rawMethods = storeAdmin?.shippingMethods || {};
    const result = {};
    
    // Collect all methods from rawMethods and checkoutItems' freeShippingMethod
    const allMethodNames = new Set(Object.keys(rawMethods));
    checkoutItems.forEach(item => {
      if (isFreeShippingActive(item, null) && item.freeShippingMethod && item.freeShippingMethod !== 'All') {
        allMethodNames.add(item.freeShippingMethod);
      }
    });

    allMethodNames.forEach(m => {
      result[m] = getMethodConfigWithFreeShipping(m);
    });
    return result;
  }, [isAdminCheckoutConfigReady, storeAdmin, getMethodConfigWithFreeShipping, checkoutItems]);

  const shippingOptions = useMemo(() => {
    if (!isAdminCheckoutConfigReady) return [];
    const rawMethods = enabledShippingMethods;

    return Object.keys(rawMethods)
      .filter(m => m !== 'Free Shipping')
      .filter(m => {
        const effectiveConfig = rawMethods[m];
        if (!isMethodEnabled(effectiveConfig)) return false;

        const methodConfig = typeof effectiveConfig === 'object' ? effectiveConfig : {};

        // Local pickup/meetup methods — gated by available places
        if (m === 'Seller Meetup') return (storeAdmin?.pickupDetails?.meetup?.places || []).some(p => p.isActive !== false);
        if (m === 'Self-Pickup') return pickupPoints.length > 0;

        // Methods with suboptions: need at least one active suboption
        const hasSuboptions = methodConfig.hasSuboptions || Object.keys(methodConfig.suboptions || {}).length > 0;
        if (hasSuboptions) {
          const suboptions = methodConfig.suboptions || {};
          return Object.values(suboptions).some(sub => {
            const effectiveSub = sub; // free shipping override already applied above
            if (effectiveSub.active === false) return false;
            // If isSelfBooking: needs pickup points available
            if (effectiveSub.isSelfBooking && pickupPoints.length === 0) return false;
            return true;
          });
        }

        // Standard courier methods also might have suboptions like cop/cod directly on config
        // or we need to check if they have at least one active suboption.
        if (['SPX Express', 'LBC', 'Lalamove'].includes(m)) {
          const subKeys = m === 'LBC' ? ['cop', 'cod']
                        : m === 'Lalamove' ? ['self', 'seller']
                        : ['delivery', 'cod'];
          const methodWasDisabled = effectiveConfig?._wasDisabled;
          return subKeys.some(subKey => {
            if (m === 'Lalamove' && subKey === 'self' && pickupPoints.length === 0) return false;
            const hasFreePromo = checkoutItems.some(item => itemHasFreeShippingForSubKey(item, m, subKey, storeAdmin?.shippingMethods));
            // Kung disabled ang method, ipakita lang ang suboption na may free shipping promo
            if (methodWasDisabled && !hasFreePromo) return false;
            return isSubMethodEnabled(effectiveConfig, subKey) || hasFreePromo;
          });
        }

        return true;
      })
      .sort((a, b) => {
        const getPriority = (methodName) => {
          if (methodName === 'Self-Pickup') return 5;
          if (methodName === 'Seller Meetup') return 4;

          const config = rawMethods[methodName] || storeAdmin?.shippingMethods?.[methodName];
          const hasSuboptions = config?.hasSuboptions || Object.keys(config?.suboptions || {}).length > 0;

          // 1. Check for Free Shipping
          let isFree = isMethodFreeShipping(methodName);
          if (hasSuboptions && config.suboptions) {
            isFree = isFree || Object.keys(config.suboptions).some(subKey => {
              const sub = config.suboptions[subKey];
              if (sub.active === false) return false;
              return isMethodFreeShipping(methodName, subKey);
            });
          } else if (['SPX Express', 'LBC', 'Lalamove'].includes(methodName)) {
            const subKeys = methodName === 'LBC' ? ['cop', 'cod']
                          : methodName === 'Lalamove' ? ['self', 'seller']
                          : ['delivery', 'cod'];
            isFree = isFree || subKeys.some(subKey => {
              if (methodName === 'Lalamove' && subKey === 'self' && pickupPoints.length === 0) return false;
              const hasFreePromo = checkoutItems.some(item => itemHasFreeShippingForSubKey(item, methodName, subKey, storeAdmin?.shippingMethods));
              const isEnabled = isSubMethodEnabled(config, subKey) || hasFreePromo;
              if (!isEnabled) return false;
              return isMethodFreeShipping(methodName, subKey);
            });
          }
          if (isFree) return 1;

          // 2. Check for Discount
          let hasDiscount = getHandlingDiscountSetting(storeAdmin?.shippingMethods, methodName);
          if (hasSuboptions && config.suboptions) {
            hasDiscount = hasDiscount || Object.keys(config.suboptions).some(subKey => {
              const sub = config.suboptions[subKey];
              if (sub.active === false) return false;
              return getHandlingDiscountSetting(storeAdmin?.shippingMethods, methodName, subKey);
            });
          } else if (['SPX Express', 'LBC', 'Lalamove'].includes(methodName)) {
            const subKeys = methodName === 'LBC' ? ['cop', 'cod']
                          : methodName === 'Lalamove' ? ['self', 'seller']
                          : ['delivery', 'cod'];
            hasDiscount = hasDiscount || subKeys.some(subKey => {
              if (methodName === 'Lalamove' && subKey === 'self' && pickupPoints.length === 0) return false;
              const hasFreePromo = checkoutItems.some(item => itemHasFreeShippingForSubKey(item, methodName, subKey, storeAdmin?.shippingMethods));
              const isEnabled = isSubMethodEnabled(config, subKey) || hasFreePromo;
              if (!isEnabled) return false;
              return getHandlingDiscountSetting(storeAdmin?.shippingMethods, methodName, subKey);
            });
          }
          if (hasDiscount) return 2;

          return 3;
        };

        return getPriority(a) - getPriority(b);
      });
  }, [isAdminCheckoutConfigReady, enabledShippingMethods, pickupPoints, storeAdmin, checkoutItems, isMethodFreeShipping]);

  const preferredShippingMethod = useMemo(() => {
    const userOrders = (orders || [])
      .filter(order => !user?.uid || order.userId === user.uid)
      .slice()
      .sort((a, b) => {
        const getTime = (value) => value?.seconds ? value.seconds * 1000 : new Date(value || 0).getTime();
        return getTime(b.createdAt) - getTime(a.createdAt);
      });

    for (const order of userOrders) {
      const method = String(order.shippingMethod || '')
        .replace(/\s*\([^)]*\)/g, '')
        .split(':')[0]
        .trim();
      if (method && shippingOptions.includes(method)) return method;
    }

    if (shippingOptions.includes('Self-Pickup')) return 'Self-Pickup';
    return shippingOptions[0] || '';
  }, [orders, shippingOptions, user?.uid]);

  const getRankedSuboptions = useCallback((method, methodConfig = null) => {
    const config = methodConfig || enabledShippingMethods?.[method] || storeAdmin?.shippingMethods?.[method];
    const suboptions = Object.entries(config?.suboptions || {}).filter(([subKey, subVal]) => {
      const hasFreePromo = checkoutItems.some(item =>
        itemHasFreeShippingForSubKey(item, method, subKey, storeAdmin?.shippingMethods)
      );
      if (subVal.active === false && !hasFreePromo) return false;
      if (subVal.isSelfBooking && pickupPoints.length === 0) return false;
      return true;
    });

    return suboptions
      .map(([subKey, subVal]) => {
        const isFree = isMethodFreeShipping(method, subKey);
        const hasDiscount = getHandlingDiscountSetting(storeAdmin?.shippingMethods, method, subKey);
        let priority = 3;
        if (isFree) priority = 1;
        else if (hasDiscount) priority = 2;
        return { subKey, subVal, isFree, hasDiscount, priority };
      })
      .sort((a, b) => a.priority - b.priority);
  }, [checkoutItems, enabledShippingMethods, isMethodFreeShipping, pickupPoints.length, storeAdmin?.shippingMethods]);

  const getBestSuboptionKey = useCallback((method, methodConfig = null) => {
    return getRankedSuboptions(method, methodConfig)[0]?.subKey || '';
  }, [getRankedSuboptions]);

  const getCourierShippingBadge = useCallback((method) => {
    if (isMethodFreeShipping(method)) return 'FREE SHIPPING';
    if (getHandlingDiscountSetting(storeAdmin?.shippingMethods, method)) {
      return totalAppliedHandlingFee > 0 ? `₱${totalAppliedHandlingFee.toLocaleString()} OFF` : '';
    }

    const rankedSuboptions = getRankedSuboptions(method);
    const bestSuboption = rankedSuboptions[0];
    if (bestSuboption?.isFree) return 'FREE SHIPPING';
    if (bestSuboption?.hasDiscount) {
      return totalAppliedHandlingFee > 0 ? `₱${totalAppliedHandlingFee.toLocaleString()} OFF` : '';
    }

    if (['SPX Express', 'LBC', 'Lalamove'].includes(method)) {
      const methodConfig = enabledShippingMethods?.[method] || storeAdmin?.shippingMethods?.[method];
      const subKeys = method === 'LBC' ? ['cop', 'cod']
        : method === 'Lalamove' ? ['self', 'seller']
        : ['delivery', 'cod'];
      const availableSubKeys = subKeys.filter(subKey => {
        if (method === 'Lalamove' && subKey === 'self' && pickupPoints.length === 0) return false;
        const hasFreePromo = checkoutItems.some(item =>
          itemHasFreeShippingForSubKey(item, method, subKey, storeAdmin?.shippingMethods)
        );
        return isSubMethodEnabled(methodConfig, subKey) || hasFreePromo;
      });

      const rankedKeys = availableSubKeys
        .map(subKey => ({
          subKey,
          isFree: isMethodFreeShipping(method, subKey),
          hasDiscount: getHandlingDiscountSetting(storeAdmin?.shippingMethods, method, subKey)
        }))
        .map(option => ({
          ...option,
          priority: option.isFree ? 1 : option.hasDiscount ? 2 : 3
        }))
        .sort((a, b) => a.priority - b.priority);
      const bestLegacySuboption = rankedKeys[0];

      if (bestLegacySuboption?.isFree) return 'FREE SHIPPING';
      if (bestLegacySuboption?.hasDiscount) {
        return totalAppliedHandlingFee > 0 ? `₱${totalAppliedHandlingFee.toLocaleString()} OFF` : '';
      }
    }

    return '';
  }, [checkoutItems, enabledShippingMethods, getRankedSuboptions, isMethodFreeShipping, pickupPoints.length, storeAdmin?.shippingMethods, totalAppliedHandlingFee]);

  const buildShippingData = useCallback((m, sourceData) => {
    const methodConfig = enabledShippingMethods?.[m] || storeAdmin?.shippingMethods?.[m];
    
    // Find best suboption
    let bestSubKey = getBestSuboptionKey(m, methodConfig);
    if (!bestSubKey && ['SPX Express', 'LBC', 'Lalamove'].includes(m)) {
      const subKeys = m === 'LBC' ? ['cop', 'cod']
        : m === 'Lalamove' ? ['self', 'seller']
        : ['delivery', 'cod'];

      const rated = subKeys
        .filter(subKey => {
          if (m === 'Lalamove' && subKey === 'self' && pickupPoints.length === 0) return false;
          const hasFreePromo = checkoutItems.some(item => 
            itemHasFreeShippingForSubKey(item, m, subKey, storeAdmin?.shippingMethods)
          );
          return isSubMethodEnabled(methodConfig, subKey) || hasFreePromo;
        })
        .map(subKey => {
          const isFree = isMethodFreeShipping(m, subKey);
          const hasDiscount = getHandlingDiscountSetting(storeAdmin?.shippingMethods, m, subKey);
          let priority = 3;
          if (isFree) priority = 1;
          else if (hasDiscount) priority = 2;
          return { subKey, priority };
        });

      if (rated.length > 0) {
        rated.sort((a, b) => a.priority - b.priority);
        bestSubKey = rated[0].subKey;
      }
    }

    // Now determine pickup/meetup requirements
    const hasPickup = checkUsesPickupPoint(m, methodConfig, bestSubKey);
    const hasMeetup = checkUsesMeetupLocation(m, methodConfig, bestSubKey);

    let pickupLocation = '';
    let pickupLocationIndex = null;
    if (hasPickup && pickupPoints.length > 0) {
      const targetIdx = rateCheckingPickupIndex;
      pickupLocation = getCheckoutPlaceLabel(pickupPoints[targetIdx], `Pickup Point ${targetIdx + 1}`);
      pickupLocationIndex = targetIdx;
    }

    let meetupLocation = '';
    let meetupLocationIndex = null;
    const meetupPlaces = (storeAdmin?.pickupDetails?.meetup?.places || []).filter(p => p.isActive !== false);
    if (hasMeetup && meetupPlaces.length > 0) {
      meetupLocation = getCheckoutPlaceLabel(meetupPlaces[0], 'Meetup Place 1');
      meetupLocationIndex = 0;
    }

    return {
      ...sourceData,
      shippingMethod: m,
      selectedSuboption: bestSubKey,
      customSuboption: '',
      pickupLocation,
      pickupLocationIndex,
      meetupLocation,
      meetupLocationIndex
    };
  }, [enabledShippingMethods, getBestSuboptionKey, storeAdmin, checkoutItems, isMethodFreeShipping, pickupPoints, rateCheckingPickupIndex]);

  const handleShippingChange = useCallback((m) => {
    let newCheckoutData;
    updateCheckoutData(prev => {
      newCheckoutData = buildShippingData(m, prev);
      return newCheckoutData;
    });
    // Side effects after state update
    const methodConfig = enabledShippingMethods?.[m] || storeAdmin?.shippingMethods?.[m];
    const selectedSubConfig = newCheckoutData?.selectedSuboption
      ? methodConfig?.suboptions?.[newCheckoutData.selectedSuboption]
      : null;
      
    // Determine if the selected suboption/method requires any address inputs
    const subFields = methodConfig ? getRequiredFields(methodConfig, newCheckoutData?.selectedSuboption) : [];
    const subNeedsAddress = subFields.some(id => [5, 6, 7, 8, 9, 10, 11, 12].includes(id));

    const isNoAddressNeeded =
      m === 'Self-Pickup' ||
      m === 'Seller Meetup' ||
      checkUsesPickupPoint(m, methodConfig, newCheckoutData?.selectedSuboption) ||
      checkUsesMeetupLocation(m, methodConfig, newCheckoutData?.selectedSuboption) ||
      selectedSubConfig?.isSelfBooking === true ||
      selectedSubConfig?.isPickupRequired === true ||
      !subNeedsAddress;

    setAddressStatus(prev => ({ ...prev, isEditingAddress: !isNoAddressNeeded }));
  }, [buildShippingData, updateCheckoutData, setAddressStatus, enabledShippingMethods, storeAdmin]);





  const { zipCode, barangay, city, province } = deliveryData;

  const lookupTrigger = useRef(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const newValidation = { zipCode: true, province: true, city: true, barangay: true };
      
      // Prevent syncing if triggered by the lookup itself (prevents infinite loops)
      if (lookupTrigger.current) return;

      let hasChanges = false;
      const updatedData = { ...deliveryDataRef.current };

      // 1. ZIP -> City/Province Lookup
      if (updatedData.zipCode?.length === 4 && (!updatedData.city || !updatedData.province)) {
        console.log("Triggering ZIP -> City/Province lookup for:", updatedData.zipCode);
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${updatedData.zipCode}&country=Philippines&format=json&addressdetails=1`);
          const data = await res.json();
          if (data && data.length > 0) {
            const addr = data[0].address;
            updatedData.city = addr.city || addr.town || addr.municipality || addr.village || updatedData.city;
            updatedData.province = addr.state || addr.region || updatedData.province;
            if (!addressStatus.isPinConfirmed) {
              updatedData.lat = parseFloat(data[0].lat);
              updatedData.lng = parseFloat(data[0].lon);
            }
            hasChanges = true;
            console.log("ZIP -> City/Province updated:", updatedData.city, updatedData.province);
          }
        } catch (err) { console.warn("ZIP lookup failed", err); }
      } 
      // 2. City/Province/Barangay -> ZIP Lookup
      else if (!updatedData.zipCode && updatedData.city?.length > 2 && updatedData.province?.length > 2) {
        console.log("Triggering Location -> ZIP lookup for:", updatedData.barangay, updatedData.city, updatedData.province);
        try {
          // Include barangay in query if available
          const query = `${updatedData.barangay ? updatedData.barangay + ', ' : ''}${updatedData.city}, ${updatedData.province}, Philippines`;
          const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`);
          const data = await res.json();
          
          console.log("Location -> ZIP response:", data);
          
          const resultWithZip = data.find(item => item.address && item.address.postcode && item.address.postcode.length === 4);
          
          if (resultWithZip) {
            updatedData.zipCode = resultWithZip.address.postcode;
            if (!addressStatus.isPinConfirmed) {
              updatedData.lat = parseFloat(resultWithZip.lat);
              updatedData.lng = parseFloat(resultWithZip.lon);
            }
            hasChanges = true;
            console.log("Location -> ZIP updated:", updatedData.zipCode);
          } else {
            console.log("No ZIP found for Location.");
          }
        } catch (err) { console.warn("ZIP reverse lookup failed", err); }
      }
      // 3. Map Sync for general address change
      else if (updatedData.barangay || updatedData.city || updatedData.province) {
         try {
             const query = `${[updatedData.barangay, updatedData.city, updatedData.province, 'Philippines'].filter(Boolean).join(', ')}`;
             const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
             const data = await res.json();
             if (data && data.length > 0) {
                 if (!addressStatus.isPinConfirmed) {
                   updatedData.lat = parseFloat(data[0].lat);
                   updatedData.lng = parseFloat(data[0].lon);
                 }
                 hasChanges = true;
             }
         } catch (err) { console.warn("Map sync failed", err); }
      }

      if (hasChanges) {
        lookupTrigger.current = 'sync';
        updateDeliveryData(updatedData);
      }

      // Final ZIP/Location existence validation
      if (updatedData.zipCode?.length === 4) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${updatedData.zipCode}&country=Philippines&format=json`);
          const data = await res.json();
          newValidation.zipCode = data.length > 0;
        } catch (e) { console.warn("ZIP validation error", e); }
      }
      
      setValidationState(newValidation);
      setTimeout(() => { lookupTrigger.current = null; }, 500);
    }, 1500);
    return () => clearTimeout(timer);
  }, [zipCode, barangay, city, province, updateDeliveryData, addressStatus.isPinConfirmed]);

  const requiredFields = useMemo(() => {
    if (!checkoutData.shippingMethod) return [];
    const method = checkoutData.shippingMethod;
    const subKey = getSelectedShippingSubKey(checkoutData, storeAdmin?.shippingMethods);
    const methodConfig = storeAdmin?.shippingMethods?.[method];
    const configuredFields = methodConfig
      ? getRequiredFields(methodConfig, subKey)
      : (method === 'Seller Meetup' || method === 'Self-Pickup')
        ? [1, 2]
        : [1, 2, 5, 6, 7, 9, 10, 11, 12];

    // Guest orders must remain recoverable through genuine recipient/contact
    // details, even when a pickup method has a lighter form configuration.
    return isGuestPreview
      ? [...new Set([...configuredFields, 1, 2])]
      : configuredFields;
  }, [checkoutData, isGuestPreview, storeAdmin]);

  const courierName = useMemo(() => {
    if (!checkoutData.shippingMethod) return 'LBC';
    const method = checkoutData.shippingMethod;
    const subKey = getSelectedShippingSubKey(checkoutData, storeAdmin?.shippingMethods);
    const methodConfig = storeAdmin?.shippingMethods?.[method];
    return getCourierName(method, subKey, methodConfig);
  }, [checkoutData, storeAdmin]);

  const isNoDetailsMode = useMemo(() => {
    return requiredFields.length === 0;
  }, [requiredFields]);

  const placeFieldIds = useMemo(() => (
    new Set([14, 15])
  ), []);

  const detailsInputFields = useMemo(() => (
    requiredFields.filter(id => !placeFieldIds.has(id))
  ), [requiredFields, placeFieldIds]);

  const hasConfiguredInputFields = useMemo(() => (
    detailsInputFields.length > 0
  ), [detailsInputFields]);

  const isLocalPlaceMethod = useMemo(() => (
    checkoutData.shippingMethod === 'Seller Meetup' ||
    checkoutData.shippingMethod === 'Self-Pickup' ||
    usesPickupPoint ||
    usesMeetupLocation
  ), [checkoutData.shippingMethod, usesPickupPoint, usesMeetupLocation]);

  const selectedLocalPlaceDetails = useMemo(() => {
    if (usesMeetupLocation) return selectedMeetupDetails;
    if (usesPickupPoint) return selectedPickupDetails;
    return null;
  }, [usesMeetupLocation, usesPickupPoint, selectedMeetupDetails, selectedPickupDetails]);

  const selectedLocalPlaceCoord = useMemo(() => {
    if (selectedLocalPlaceDetails?.lat && selectedLocalPlaceDetails?.lng) {
      return [selectedLocalPlaceDetails.lat, selectedLocalPlaceDetails.lng];
    }
    if (usesMeetupLocation) return meetupCoord;
    if (usesPickupPoint && selectedPickupDetails?.lat && selectedPickupDetails?.lng) return [selectedPickupDetails.lat, selectedPickupDetails.lng];
    return [14.2965, 121.1118];
  }, [selectedLocalPlaceDetails, usesMeetupLocation, meetupCoord, usesPickupPoint, selectedPickupDetails]);

  const isDetailsFormValid = useMemo(() => {
    if (requiredFields.includes(1) && !`${deliveryData.receiverName || ''}`.trim()) return false;
    if (requiredFields.includes(2) && !`${deliveryData.phoneNumber || ''}`.trim()) return false;
    if (requiredFields.includes(2) && deliveryData.phoneNumber && deliveryData.phoneNumber.length < 11) return false;
    if (requiredFields.includes(3) && !`${deliveryData.email || ''}`.trim()) return false;
    if (requiredFields.includes(4) && !`${deliveryData.landmark || ''}`.trim()) return false;
    if (requiredFields.includes(5) && !`${deliveryData.zipCode || ''}`.trim()) return false;
    if (requiredFields.includes(6) && !`${deliveryData.houseNo || ''}`.trim()) return false;
    if (requiredFields.includes(7) && !`${deliveryData.houseDetails || ''}`.trim()) return false;
    if (requiredFields.includes(8) && !`${deliveryData.subdivision || ''}`.trim()) return false;
    if (requiredFields.includes(9) && !`${deliveryData.barangay || ''}`.trim()) return false;
    if (requiredFields.includes(10) && !`${deliveryData.city || ''}`.trim()) return false;
    if (requiredFields.includes(11) && !`${deliveryData.province || ''}`.trim()) return false;
    if (requiredFields.includes(13)) {
      if (!`${checkoutData.lbcBranch || ''}`.trim()) return false;
      const prefix = `${courierName || 'LBC'} Express - `;
      if (checkoutData.lbcBranch.trim() === prefix.trim()) return false;
    }
    if ((requiredFields.includes(14) || usesPickupPoint) && !checkoutData.pickupLocation) return false;
    if ((requiredFields.includes(15) || usesMeetupLocation) && !checkoutData.meetupLocation) return false;
    return true;
  }, [requiredFields, deliveryData, checkoutData.lbcBranch, courierName, checkoutData.pickupLocation, checkoutData.meetupLocation, usesPickupPoint, usesMeetupLocation]);

  const isFormValid = useMemo(() => {
    if (isNoDetailsMode) return true;
    const requiresAddress = requiredFields.some(id => [5, 6, 7, 8, 9, 10, 11, 12].includes(id));
    if (requiresAddress && addressStatus.isEditingAddress) return false; // Kung nag-eedit pa ng address at required, invalid
    if (requiredFields.includes(12) && !addressStatus.isPinConfirmed) return false;
    return isDetailsFormValid;
  }, [isNoDetailsMode, addressStatus.isEditingAddress, addressStatus.isPinConfirmed, isDetailsFormValid, requiredFields]);

  const hasIncompleteRequiredDetails = Boolean(user) && !isNoDetailsMode && !isFormValid;

  const currentDetailsEditSnapshot = useMemo(() => JSON.stringify({
    deliveryData,
    lbcBranch: checkoutData.lbcBranch || '',
    isPinConfirmed: addressStatus.isPinConfirmed
  }), [deliveryData, checkoutData.lbcBranch, addressStatus.isPinConfirmed]);

  const hasDetailsDraftChanged = useMemo(() => (
    detailsEditSnapshot ? currentDetailsEditSnapshot !== detailsEditSnapshot : true
  ), [currentDetailsEditSnapshot, detailsEditSnapshot]);

  const beginDetailsEdit = useCallback(() => {
    setDetailsEditSnapshot(currentDetailsEditSnapshot);
    setAddressStatus(prev => ({ ...prev, isEditingAddress: true }));
  }, [currentDetailsEditSnapshot]);

  const cancelDetailsEdit = useCallback(() => {
    setDetailsEditSnapshot(null);
    setAddressStatus(prev => ({ ...prev, isEditingAddress: false }));
  }, []);

  const buildProfileUpdates = useCallback(() => {
    if (isLocalPlaceMethod) {
      return {
        userDetails: {
          ...(user?.userDetails || {}),
          email: deliveryData.email,
          mobileNo: deliveryData.phoneNumber,
          receiverName: deliveryData.receiverName
        }
      };
    }

    const existingDetails = user?.deliveryDetails?.[0] || {};
    let updatedDelivery = { ...existingDetails, type: 'delivery', isPrimary: true };

    updatedDelivery.landmark = deliveryData.landmark || '';
    updatedDelivery.houseNo = deliveryData.houseNo || '';
    updatedDelivery.houseDetails = deliveryData.houseDetails || '';
    updatedDelivery.subdivision = deliveryData.subdivision || '';
    updatedDelivery.barangay = deliveryData.barangay || '';
    updatedDelivery.city = deliveryData.city || '';
    updatedDelivery.province = deliveryData.province || '';
    updatedDelivery.zipCode = deliveryData.zipCode || '';
    updatedDelivery.lat = Number(deliveryData.lat) || DEFAULT_DELIVERY_COORDS.lat;
    updatedDelivery.lng = Number(deliveryData.lng) || DEFAULT_DELIVERY_COORDS.lng;

    if (requiredFields.includes(13)) {
      const prefix = `${courierName || 'LBC'} Express - `;
      const value = checkoutData.lbcBranch || '';
      const cleanValue = value.replace(new RegExp(`^${prefix}`, 'i'), '').trim();
      updatedDelivery.lbcBranch = cleanValue ? `${prefix}${cleanValue}` : '';
    } else {
      updatedDelivery.lbcBranch = '';
    }

    return {
      userDetails: {
        ...(user?.userDetails || {}),
        email: deliveryData.email,
        mobileNo: deliveryData.phoneNumber,
        receiverName: deliveryData.receiverName
      },
      deliveryDetails: [updatedDelivery]
    };
  }, [user, deliveryData, checkoutData.lbcBranch, requiredFields, courierName, isLocalPlaceMethod]);

  const handleConfirmDetails = useCallback(async () => {
    try {
      if (user && !isNoDetailsMode) {
        await updateUserProfile(user.uid, buildProfileUpdates());
      }
      setAddressStatus(prev => ({
          ...prev,
          isPinConfirmed: true,
          isEditingAddress: false
      }));
      setDetailsEditSnapshot(null);
    } catch (err) {
      console.error(err);
      alert("Failed to save receiver details.");
    }
  }, [user, isNoDetailsMode, updateUserProfile, buildProfileUpdates, setAddressStatus]);

  const handleGuestGoogleLogin = async () => {
    const authAttemptId = useStore.getState().beginAuthAttempt(() => handleGuestGoogleLogin());
    try {
      await signInWithPopup(auth, googleProvider);
      if (!useStore.getState().isAuthAttemptActive(authAttemptId)) return;
      useStore.getState().setAuthAttemptStatus(authAttemptId, 'Syncing Profile');
    } catch (err) {
      console.error('SG LOG: Guest checkout Google login failed:', err);
      useStore.getState().failAuthAttempt(authAttemptId, err);
    }
  };

const handleFinalizeOrder = async () => {
    if (isOrderInvalidForMaintenance) return;

    if (isGuestLoginRequired) {
      await handleGuestGoogleLogin();
      return;
    }

    if (!isNoDetailsMode && !isFormValid) {
      alert("Please complete delivery details and confirm map pin.");
      return;
    }

    if (checkoutData.paymentPlan !== 'full') {
      const currentInitial = Number(checkoutData.initialPayment) || 0;
      if (currentInitial < minInitialPayment) {
        const planLabel = checkoutData.paymentPlan === 'partial' ? 'partial payment' : 'reservation';
        alert(`Initial payment for ${planLabel} must be at least ₱${minInitialPayment.toLocaleString()}.`);
        return;
      }
      if (currentInitial > totalToSettle) {
        alert(`Initial payment cannot exceed the total amount of ₱${totalToSettle.toLocaleString()}.`);
        return;
      }
    }

    setIsFinalizing(true);
    const checkoutUid = user?.uid || "GUEST_BYPASS";
    const checkoutName = user?.displayName || "GUEST USER";

    try {
      if (user && !isNoDetailsMode) {
        await updateUserProfile(user.uid, buildProfileUpdates());
      }
      
      await Promise.all(checkoutItems.filter(item => !isProjectCheckoutItem(item)).map(async (item) => {
        const kitRef = doc(db, "kits", item.id);
        const kitSnap = await getDoc(kitRef);
        if (!kitSnap.exists()) throw new Error(`Kit ${item.id} no longer exists.`);
        
        const stock = kitSnap.data().stocks[item.stockKey];
        if (!stock) throw new Error(`Stock variant for ${item.id} no longer exists.`);
        
        const isAcceptedOffer = Boolean(item.offerId && item.offerPrice);
        const canUseAdminShelfStock = item.allowShelfBundle && stock.isReserved && stock.reservationType === 'admin' && !stock.order?.orderId;
        if (stock.isReserved && stock.reservedBy !== checkoutUid && !canUseAdminShelfStock && !isAcceptedOffer) {
          throw new Error(`Item "${item.name}" was just taken by someone else.`);
        }
        
        const result = await reserveStockForCheckout(item.id, item.stockKey, checkoutUid, {
          allowAdminShelf: item.allowShelfBundle,
          allowAcceptedOffer: isAcceptedOffer,
          offerId: item.offerId || null
        });
        if (!result?.success) {
          throw new Error(`Item "${item.name}" was just taken by someone else.`);
        }
        if (canUseAdminShelfStock || isAcceptedOffer) {
          const shelfItem = (shelf || []).find(entry => entry.id === item.id && entry.stockKey === item.stockKey);
          if (shelfItem?.basketId) await deleteDoc(doc(db, 'shelf', shelfItem.basketId));
        }
        return result;
      }));
      
      const orderId = `#SG-${Math.floor(Math.random() * 9000) + 1000}`;
      const isPreOrder = checkoutItems.some(item => {
        if (isProjectCheckoutItem(item)) return false; // Projects are custom/MTO, not standard stock pre-orders
        const kit = (kits || []).find(k => k.id === item.id);
        return kit?.stocks?.[item.stockKey]?.status === 'PRE-ORDER';
      });
      const hasProjects = checkoutItems.some(isProjectCheckoutItem);
      const initialStatus = isPreOrder ? 'Waiting' : 'Reserved';
      const balanceDueDeadline = isPreOrder
        ? new Date(Date.now() + (14 * 24 * 60 * 60 * 1000)).toISOString()
        : null;
      
      const createdTime = new Date().toISOString();
      const expirationDate = new Date(createdTime);
      if (isOrderInvalidForMaintenance) {
        expirationDate.setHours(expirationDate.getHours() + 1);
      } else {
        expirationDate.setDate(expirationDate.getDate() + 1);
        expirationDate.setHours(20, 0, 0, 0);
      }

      const orderData = {
        orderId,
        userId: user?.uid || null,
        buyerName: checkoutName,
        isMaintenanceOrder: isOrderInvalidForMaintenance || false,
        items: checkoutItems.map((item, index) => {
          const distributedFee = distributedOrderFees[index] || { handling: 0, transfer: 0, total: 0 };
          return ({
          id: item.id,
          name: `${item.brand || ''} ${item.specs?.line || ''} ${item.name}`.trim(),
          price: item.price || 0,
          sellPrice: isBundleOrClearanceItem(item) ? (item.price || 0) : (item.sellPrice || item.price || 0),
          originalSellPrice: isProjectCheckoutItem(item)
            ? 0
            : getStockStandaloneSellPrice(item, findCheckoutKit(kits, item)),
          quantity: item.quantity || 1,
          image: item.image || null,
          images: item.images || null,
          appliedHandlingFee: item.appliedHandlingFee || 0,
          appliedInstallmentFee: item.appliedInstallmentFee || 0,
          appliedTransferFee: item.appliedTransferFee || 0,
          distributedHandlingFee: distributedFee.handling,
          distributedTransferFee: distributedFee.transfer,
          hasDistributedOrderFees: true,
          isBundleItem: isBundleOrClearanceItem(item),
          bundleId: item.bundleId || null,
          bundleName: item.bundleName || null,
          bundleSize: Number(item.bundleSize || 0) || null,
          bundleFeeShare: Number(item.bundleFeeShare || 0),
          bundleReferencePrice: Number(item.bundleReferencePrice || 0),
          offerId: item.offerId || null,
          offerPrice: item.offerPrice || null,
          offerExpiresAt: item.offerExpiresAt || null,
          isFreeShippingEligible: item.isFreeShippingEligible || false,
          freeShippingUntil: item.freeShippingUntil || '',
          freeShippingMethod: item.freeShippingMethod || 'All',
          freeShippingSuboption: item.freeShippingSuboption || 'All',
          // FIX: Prevents undefined crash on projects since they don't use shelf stock keys
          stockKey: item.stockKey || null, 
          type: isProjectCheckoutItem(item) ? 'project' : 'kit',
          projectData: isProjectCheckoutItem(item) ? (item.projectData || null) : null,
          productionJobs: isProjectCheckoutItem(item) ? (item.projectData?.productionJobs || item.projectData?.projectDetails?.flatMap(detail => detail.productionJobs || []) || []) : []
          });
        }),
        status: initialStatus,
        isPreOrder,
        hasProjects,
        isMadeToOrder: hasProjects,
        isSelfBooking: (() => {
          const subKey = checkoutData.selectedSuboption || checkoutData.customSuboption || null;
          const methodConfig = storeAdmin?.shippingMethods?.[checkoutData.shippingMethod];
          const subConfig = methodConfig?.suboptions?.[subKey];
          return subConfig?.isSelfBooking === true;
        })(),
        shippingMethodKey: checkoutData.shippingMethod || null,
        shippingSuboptionKey: checkoutData.selectedSuboption || checkoutData.customSuboption || null,
        shippingMethod: (checkoutData.selectedSuboption || checkoutData.customSuboption)
          ? `${checkoutData.shippingMethod} (${storeAdmin?.shippingMethods?.[checkoutData.shippingMethod]?.suboptions?.[checkoutData.selectedSuboption || checkoutData.customSuboption]?.label || checkoutData.selectedSuboption || checkoutData.customSuboption || 'Standard'})`
          : requiredFields.includes(13) && checkoutData.lbcBranch
            ? `${checkoutData.shippingMethod}: ${checkoutData.lbcBranch}`
            : (checkoutData.shippingMethod || 'Standard'),
        meetupLocation: usesMeetupLocation ? (checkoutData.meetupLocation || null) : null,
        pickupLocation: usesPickupPoint ? (checkoutData.pickupLocation || null) : null,
        pickupDetails: selectedLocalPlaceDetails ? (() => {
          // Use the selected pickup point for the exact address when available.
          // The fallback keeps older paired public/exact pickup-point data working.
          const exactPlace = selectedLocalPlaceDetails.houseNo
            ? selectedLocalPlaceDetails
            : pickupPoints.find(p => p.isActive !== false && p.houseNo && (
              !selectedLocalPlaceDetails.landmark || p.landmark === selectedLocalPlaceDetails.landmark
            ));
          const rawAddress = formatPlaceAddress(selectedLocalPlaceDetails) || '';
          const rawPublic = formatPlaceAddressWithoutHouseNo(selectedLocalPlaceDetails) || '';
          const rawExact = exactPlace ? formatPlaceAddress(exactPlace) : '';
          const landmark = selectedLocalPlaceDetails.landmark;
          return {
            label: getCheckoutPlaceLabel(selectedLocalPlaceDetails) || 'Pickup Point',
            address: cleanAddressLandmark(rawAddress, landmark),
            publicAddress: cleanAddressLandmark(rawPublic, landmark),
            exactAddress: cleanAddressLandmark(rawExact, exactPlace?.landmark || landmark),
            pickupAddressMode: selectedLocalPlaceDetails.pickupAddressMode === 'actual-pin' ? 'actual-pin' : 'rate-checking',
            lat: selectedLocalPlaceDetails.lat || null,
            lng: selectedLocalPlaceDetails.lng || null,
            exactLat: exactPlace?.lat || selectedLocalPlaceDetails.lat || null,
            exactLng: exactPlace?.lng || selectedLocalPlaceDetails.lng || null
          };
        })() : null,
        buyerRole: isAdmin ? 'admin' : 'customer',
        receiverDetails: isNoDetailsMode ? null : isLocalPlaceMethod ? {
            receiverName: deliveryData.receiverName || '',
            phoneNumber: deliveryData.phoneNumber || '',
            email: deliveryData.email || null
        } : {
            receiverName: deliveryData.receiverName || '',
            email: deliveryData.email || null,
            phoneNumber: deliveryData.phoneNumber || '',
            landmark: deliveryData.landmark || null,
            houseNo: deliveryData.houseNo || null,
            houseDetails: deliveryData.houseDetails || null,
            subdivision: deliveryData.subdivision || null,
            barangay: deliveryData.barangay || '',
            city: deliveryData.city || '',
            province: deliveryData.province || '',
            zipCode: deliveryData.zipCode || '',
            lat: deliveryData.lat || null,
            lng: deliveryData.lng || null,
            lbcBranch: requiredFields.includes(13) && checkoutData.lbcBranch
              ? checkoutData.lbcBranch 
              : null
        },
        paymentPlan: checkoutData.paymentPlan || 'full',
        paymentMethod: checkoutData.paymentMethod || 'Cash',
        totalPrice: Math.max(0, baseTotal - garageDiscount),
        subtotal: baseTotal,
        feesIncludedInTotal: true,
        buyerPaid: 0,
        paymentDueNow: amountDueNow || 0,
        originalPaymentDueNow: amountDueNow || 0,
        minDownpayment: checkoutItems.reduce((acc, item) => acc + Number(item.minDownpayment ?? item.projectData?.minDownpayment ?? 0), 0),
        balanceDueDeadline,
        projectProgress: hasProjects ? checkoutItems.flatMap(item => {
          if (!isProjectCheckoutItem(item)) return [];
          const jobs = item.projectData?.productionJobs || item.projectData?.projectDetails?.flatMap(detail => detail.productionJobs || []) || [];
          return jobs.map((job, idx) => ({
            id: job.id || `${item.basketId || item.id}-bp-${idx + 1}`,
            buildPlateNo: job.buildPlateNo || job.no || idx + 1,
            label: job.buildPlateNo ? `Build Plate ${job.buildPlateNo}` : `Build Plate ${idx + 1}`,
            done: false
          }));
        }) : [],
        handlingFee: totalAppliedHandlingFee || 0,
        installmentFee: totalAppliedInstallmentFee || 0,
        transferFee: totalAppliedTransferFee || 0,
        discount: garageDiscount || 0,
        discountBreakdown: {
          handlingFee: handlingFeeDiscount || 0,
          installmentFee: installmentFeeDiscount || 0,
          transferFee: transferFeeDiscount || 0,
          paymentMethod: cashTransferFeeDiscount || 0,
          fixedPaymentMethod: fixedPaymentMethodDiscount || 0
        },
        date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        createdAt: createdTime,
        expiresAt: expirationDate.toISOString()
      };
      
      const docId = await createOrder(orderData);
      console.log("SG DEBUG: Order created successfully with ID:", docId);
      
      if (assignStockToOrder) {
        for (const item of checkoutItems) {
          if (isProjectCheckoutItem(item)) continue;
          await assignStockToOrder(item.id, item.stockKey, orderId, { 
            isManualOrder: false,
            orderDocId: docId 
          });
        }
      }

      const completedOffers = new globalThis.Map();
      checkoutItems.forEach((item) => {
        if (!item.offerId || !item.offerPrice || completedOffers.has(item.offerId)) return;
        completedOffers.set(item.offerId, item);
      });
      if (completeAcceptedOffer) {
        await Promise.all([...completedOffers.values()].map((item) => completeAcceptedOffer({
          offerId: item.offerId,
          kitId: item.id,
          stockKey: item.stockKey,
          offerPrice: item.offerPrice
        })));
      }
      
      setCreatedOrderIds([docId]);
      for (const item of checkoutItems) {
        if (item.basketId) await removeFromBasket(item.basketId);
      }

      if (!isPage && isAdmin && isAdminView) { 
        onClose(); 
        navigate('/orders'); 
      } else { 
        // Push history state para ma-trap ang browser back button sa payment step
        // — hindi dapat makabalik ang user sa checkout form pagkatapos mag-finalize
        window.history.pushState({ checkoutPayment: true }, '');
        setCheckoutStep(2); 
      }
    } catch (err) { 
      console.error("SG LOG: Checkout Error:", err); 
      alert(`Checkout failed: ${err.message || "An unexpected error occurred."}`); 
      setIsFinalizing(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const compressed = await compressImage(reader.result);
          setPreviewUrl(compressed);
        } catch (err) {
          console.error("SG DEBUG: Compression failed, using original", err);
          setPreviewUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!previewUrl || createdOrderIds.length === 0) return;
    setIsUploading(true);
    try {
      await uploadReceipt(createdOrderIds, previewUrl);
      setPaymentSubmitted(true);
      setPreviewUrl(null);
      setIsUploading(false);
    } catch (err) {
      console.error(err);
      alert("Failed to upload receipt.");
      setIsUploading(false);
    }
  };

  const availablePaymentPlans = useMemo(() => {
    const hasStlWithDesignService = checkoutItems.some(item => 
      isProjectCheckoutItem(item) && 
      item.projectData?.method?.name?.toUpperCase() === 'STL' && 
      item.projectData?.selectedDesignService
    );

    if (hasStlWithDesignService) {
      return ['partial'];
    }

    const settings = { ...(storeAdmin?.paymentSettings?.plans || {}) };
    const plans = ['full'];
    
    if (settings.downpayment || settings.installment) {
      // Reservation plan para sa lahat ng kits (pre-order at on-hand)
      // PERO hindi available kung:
      // - on-hand lang at may Cash On suboption (COD/COP)
      // - ang selected suboption ay may free shipping promo
      const hasKits = checkoutItems.some(item => !isProjectCheckoutItem(item));
      const isCashOnOnhand = hasKits && !hasPreOrders && isCashOnSuboption;
      if (hasKits && !isCashOnOnhand && !isFreeShippingApplied) {
        plans.push('reservation');
      }
      // Partial plan para sa projects, at on-hand kits na may Cash On suboption
      if (hasProjects || isCashOnOnhand) {
        plans.push('partial');
      }
    }
    return plans;
  }, [storeAdmin, checkoutItems, hasProjects, hasPreOrders, isCashOnSuboption, isFreeShippingApplied]);

  const availablePaymentMethods = useMemo(() => {
    const settings = { ...(storeAdmin?.paymentSettings?.methods || {}) };
    
    const allKnownMethods = Array.from(new Set([
      ...Object.keys(settings).filter(key => {
        const normalizedKey = key.toLowerCase();
        return !normalizedKey.endsWith('qr') &&
          !normalizedKey.endsWith('fee') &&
          !normalizedKey.endsWith('transferdiscount') &&
          !normalizedKey.endsWith('discountamount') &&
          normalizedKey !== 'cash';
      }),
      'cash'
    ]));
    
    return allKnownMethods.filter(methodKey => {
      const config = getPaymentMethodConfig(settings, methodKey);
      if (!config.active) return false;
      
      // Specific logic for Cash
      if (methodKey.toLowerCase() === 'cash') {
        if (hasPreOrders || hasProjects || checkoutData.paymentPlan !== 'full') {
          return false;
        }
        // No cash payment for all couriers
        if (!['Seller Meetup', 'Self-Pickup'].includes(checkoutData.shippingMethod)) {
          return false;
        }
        // I-check ang cashEnabled flag sa shipping method config
        const selectedMethodConfig = storeAdmin?.shippingMethods?.[checkoutData.shippingMethod];
        if (selectedMethodConfig && typeof selectedMethodConfig === 'object') {
          if (selectedMethodConfig.cashEnabled === false) return false;
        }
      }
      
      return true;
    }).map(key => key.toLowerCase() === 'cash' ? 'Cash' : key);
  }, [storeAdmin, checkoutData.shippingMethod, hasPreOrders, hasProjects, checkoutData.paymentPlan]);

  const paymentPreviewUrl = useMemo(() => {
    if (checkoutStep !== 2) return '';
    if (checkoutData.paymentMethod === 'Cash' && !isOrderInvalidForMaintenance) return '';
    if (isOrderInvalidForMaintenance) {
      return garageInfo?.logoURL || "https://graph.facebook.com/SnorlaxGarage/picture?type=large";
    }
    return getPaymentMethodConfig(storeAdmin?.paymentSettings?.methods, checkoutData.paymentMethod).qr || '';
  }, [checkoutStep, checkoutData.paymentMethod, garageInfo?.logoURL, isOrderInvalidForMaintenance, storeAdmin?.paymentSettings?.methods]);

  // Preselect defaults when options become available
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {


        if (!checkoutData.shippingMethod && preferredShippingMethod) {
          handleShippingChange(preferredShippingMethod);
        }


        // ... existing payment plan/method logic
        if (availablePaymentPlans.length > 0 && !checkoutData.paymentPlan) {
          updateCheckoutData(prev => ({ 
            ...prev, 
            paymentPlan: availablePaymentPlans[0],
            initialPayment: availablePaymentPlans[0] === 'full' ? 0 : minInitialPayment
          }));
        }
        // Auto-reset kung ang current plan ay wala na sa available plans (e.g. nag-switch sa COD)
        if (checkoutData.paymentPlan && !availablePaymentPlans.includes(checkoutData.paymentPlan)) {
          updateCheckoutData(prev => ({
            ...prev,
            paymentPlan: availablePaymentPlans[0] || 'full',
            initialPayment: 0
          }));
        }
        if (availablePaymentMethods.length > 0) {
          // Select the best available discount once the checkout's shipping
          // context is known. After that, a customer's manual choice wins.
          if (!checkoutData.shippingMethod) return;

          const highestDiscountMethod = availablePaymentMethods.reduce((best, method) => {
            const config = getPaymentMethodConfig(storeAdmin?.paymentSettings?.methods, method);
            const discount = Math.max(
              config.transferDiscount ? totalAppliedTransferFee : 0,
              Number(config.discountAmount || 0)
            );
            return discount > best.discount ? { method, discount } : best;
          }, { method: availablePaymentMethods[0], discount: -1 }).method;

          // Gamitin ang case-insensitive comparison para hindi ma-reset ang user selection
          // dahil sa case mismatch (e.g. "GCash" vs "Gcash", "UnionBank" vs "Unionbank")
          const currentMethod = checkoutData.paymentMethod;
          const isCurrentValid = currentMethod && availablePaymentMethods.some(
            m => m.toLowerCase() === currentMethod.toLowerCase()
          );
          if (!hasPreselectedRef.current || !isCurrentValid) {
            updateCheckoutData(prev => ({ ...prev, paymentMethod: highestDiscountMethod }));
            hasPreselectedRef.current = true;
          }
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, shippingOptions, preferredShippingMethod, availablePaymentPlans, availablePaymentMethods, checkoutData.shippingMethod, checkoutData.paymentPlan, checkoutData.paymentMethod, minInitialPayment, handleShippingChange, updateCheckoutData, checkoutItems, enabledShippingMethods, storeAdmin, pickupPoints, isMethodFreeShipping, totalAppliedTransferFee]);



  const getPotentialDiscount = useCallback((method, subKey = null) => {
    const shouldDiscount = getHandlingDiscountSetting(storeAdmin?.shippingMethods, method, subKey);
    return shouldDiscount ? totalAppliedHandlingFee : 0;
  }, [storeAdmin?.shippingMethods, totalAppliedHandlingFee]);

  const getShippingDiscountLabel = useCallback((method, subKey = null) => {
    if (isMethodFreeShipping(method, subKey)) {
      return 'FREE SHIPPING';
    }

    const discount = getPotentialDiscount(method, subKey);
    return discount > 0 ? `₱${discount.toLocaleString()} OFF` : '';
  }, [isMethodFreeShipping, getPotentialDiscount]);

  if (!isOpen && !isPage) return null;


  const handleCloseModal = async () => {
    if (checkoutStep === 2 && createdOrderIds.length > 0 && !paymentSubmitted) {
      const cancellationTimerStartedAt = new Date().toISOString();
      try {
        await Promise.all(createdOrderIds.map(orderId => updateOrderDetails(orderId, { cancellationTimerStartedAt })));
      } catch (err) {
        console.error("SG LOG: Failed to start cancellation timer:", err);
      }
    }
    if (isPage) {
      if (checkoutStep === 2) navigate('/orders');
      else onClose();
    } else {
      onClose();
      if (checkoutStep === 2) navigate('/orders');
    }
    setCheckoutStep(1);
    setPreviewUrl(null);
    // setActivePreviewUrl(null);
    setPaymentSubmitted(false);
    setCreatedOrderIds([]);
    setIsUploading(false);
    setIsFinalizing(false);
  };

  const renderCheckoutPaymentStep = () => {
    const isCashPayment = checkoutData.paymentMethod === 'Cash' && !isOrderInvalidForMaintenance;
    const paymentLabel = isOrderInvalidForMaintenance
      ? 'Payment Placeholder'
      : isCashPayment
        ? 'Cash Payment'
        : checkoutData.paymentMethod;
    const displayPaymentImage = previewUrl || paymentPreviewUrl;
    const displayPaymentLabel = previewUrl ? 'Receipt Preview' : paymentLabel;

    if (paymentSubmitted) {
      return (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/95 p-4 text-white animate-in fade-in duration-300">
          <button
            type="button"
            onClick={handleCloseModal}
            className="absolute right-8 top-8 z-10 text-white/50 transition hover:text-white"
            aria-label="Close payment page"
          >
            <X size={40} />
          </button>
          <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
              <CheckCircle2 size={38} />
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl font-black italic uppercase tracking-tight">Thank You</h2>
              <p className="text-sm font-black uppercase leading-relaxed tracking-widest text-white/50">
                Please wait while we validate your payment.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCloseModal}
              className="rounded-xl bg-blue-600 px-10 py-4 text-[12px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500"
            >
              View Orders
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/95 p-4 text-white animate-in fade-in duration-300">
        <button
          type="button"
          onClick={handleCloseModal}
          className="absolute right-8 top-8 z-10 text-white/50 transition hover:text-white"
          aria-label="Close payment page"
        >
          <X size={40} />
        </button>
        <div className="flex flex-col items-center gap-6">
          {isCashPayment ? (
            <div className="flex max-w-[80vw] flex-col items-center gap-4 rounded-3xl bg-white p-8 text-neutral-900 shadow-2xl">
              <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-blue-600/10 text-blue-600">
                <Store size={48} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">{paymentLabel}</p>
            </div>
          ) : displayPaymentImage ? (
            <div className="flex max-w-[80vw] flex-col items-center gap-4 rounded-3xl bg-white p-6 shadow-2xl">
              <img
                src={displayPaymentImage}
                className={`h-[60vw] max-h-[320px] w-[60vw] max-w-[320px] ${previewUrl ? 'object-cover' : 'object-contain'}`}
                alt={previewUrl ? 'Receipt Preview' : 'Payment QR Code'}
              />
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">{displayPaymentLabel}</p>
            </div>
          ) : (
            <div className="flex max-w-sm flex-col items-center gap-4 rounded-3xl bg-white p-8 text-center text-neutral-900 shadow-2xl">
              <Info size={44} className="text-red-500" />
              <p className="text-[12px] font-black uppercase tracking-widest text-red-500">QR not available</p>
              <p className="text-[12px] font-bold uppercase tracking-widest text-neutral-400">Please contact admin.</p>
            </div>
          )}

          {amountDueNow > 0 && (
            <div className="flex flex-col items-center gap-1">
              <p className="text-[12px] font-black uppercase tracking-widest text-white/40">Amount to Pay</p>
              <p className="text-3xl font-black tracking-tight text-white">₱{amountDueNow.toLocaleString()}</p>
            </div>
          )}

          {!isCashPayment && (
            !previewUrl ? (
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-blue-500 bg-blue-600 px-10 py-4 text-[12px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500">
                <input type="file" className="hidden" accept="image/*" onChange={handleFileSelect} disabled={isUploading} />
                <Upload size={16} />
                Upload Receipt
              </label>
            ) : (
              <div className="flex max-w-sm flex-col items-center gap-3">
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={handleConfirmReceipt}
                    disabled={isUploading}
                    className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-8 py-4 text-[12px] font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isUploading ? 'Uploading...' : 'Submit Receipt'}
                  </motion.button>
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-white/20 bg-white/10 px-8 py-4 text-[12px] font-black uppercase tracking-widest text-white transition hover:bg-white/15">
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileSelect} disabled={isUploading} />
                    Upload
                  </label>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    );
  };

  const renderPageCheckoutStep = () => {
    const activeMethodConfig = checkoutData.shippingMethod
      ? (enabledShippingMethods?.[checkoutData.shippingMethod] || storeAdmin?.shippingMethods?.[checkoutData.shippingMethod])
      : null;
    const activeSubKey = checkoutData.selectedSuboption || checkoutData.customSuboption || '';
    const methodSuboptions = activeMethodConfig?.suboptions
      ? Object.entries(activeMethodConfig.suboptions)
          .filter(([subKey, subVal]) => {
            const hasFreePromo = checkoutItems.some(item => itemHasFreeShippingForSubKey(item, checkoutData.shippingMethod, subKey, storeAdmin?.shippingMethods));
            return subVal.active !== false || hasFreePromo;
          })
          .sort(([subKeyA], [subKeyB]) => {
            const getPriority = (subKey) => {
              if (isMethodFreeShipping(checkoutData.shippingMethod, subKey)) return 1;
              if (getHandlingDiscountSetting(storeAdmin?.shippingMethods, checkoutData.shippingMethod, subKey)) return 2;
              return 3;
            };
            return getPriority(subKeyA) - getPriority(subKeyB);
          })
      : [];
    const showLocationSelect = usesPickupPoint || usesMeetupLocation;
    // Pickup points always remain selectable in checkout. Their public address
    // is rendered without the house number; the exact pin is handled after pickup readiness.
    const filteredPickupPoints = pickupPoints;
    const locationOptions = usesMeetupLocation
      ? (storeAdmin?.pickupDetails?.meetup?.places || []).filter(p => p.isActive !== false)
      : filteredPickupPoints;
    const selectedLocationIndex = usesMeetupLocation ? checkoutData.meetupLocationIndex : checkoutData.pickupLocationIndex;
    const locationDiscountBadge = showLocationSelect && checkoutData.shippingMethod && !hasConfiguredSuboptions(activeMethodConfig)
      ? getShippingDiscountLabel(checkoutData.shippingMethod)
      : '';
    const courierDropdownOptions = shippingOptions.map(method => ({
      value: method,
      label: method,
      badge: getCourierShippingBadge(method)
    }));
    const suboptionDropdownOptions = methodSuboptions.map(([subKey, subVal]) => ({
      value: subKey,
      label: subVal.label || subKey,
      badge: getShippingDiscountLabel(checkoutData.shippingMethod, subKey)
    }));
    const locationDropdownOptions = locationOptions.map((place, idx) => {
      // Gamitin ang original index sa pickupPoints para tama ang ma-select na pickup point.
      const originalIdx = (!usesMeetupLocation && usesPickupPoint) ? pickupPoints.indexOf(place) : idx;
      return {
        value: originalIdx,
        label: getCheckoutPlaceLabel(place, usesMeetupLocation ? `Meetup Place ${idx + 1}` : `Pickup Point ${idx + 1}`),
        description: getCheckoutPlaceAddress(place, { includeHouseNo: false }),
        badge: locationDiscountBadge
      };
    });
    const shouldShowSuboptionDropdown = checkoutData.shippingMethod && methodSuboptions.length > 0;
    const shouldShowLocationDropdown = showLocationSelect && locationOptions.length > 0;
    const shippingControlCount = 1 + (shouldShowSuboptionDropdown ? 1 : 0) + (shouldShowLocationDropdown ? 1 : 0);
    const shippingGridClass = shippingControlCount >= 3
      ? 'lg:grid-cols-3'
      : shippingControlCount === 2
        ? 'lg:grid-cols-2'
        : 'lg:grid-cols-1';
    const detailsTitle = !checkoutData.shippingMethod
      ? "Receiver's Details"
      : !LOCAL_METHODS.includes(checkoutData.shippingMethod)
        ? "Receiver's Details"
        : usesMeetupLocation
          ? 'Meetup Information'
          : 'Pickup Information';
    const isBranchPickup = requiredFields.includes(13);
    const branchDestinationLine = [
      deliveryData.city,
      deliveryData.province,
      deliveryData.zipCode
    ].filter(Boolean).join(', ');

    const handleSuboptionChange = (subKey) => {
      const subConfig = activeMethodConfig?.suboptions?.[subKey] || {};
      const hasPickup = checkUsesPickupPoint(checkoutData.shippingMethod, activeMethodConfig, subKey);
      const hasMeetup = checkUsesMeetupLocation(checkoutData.shippingMethod, activeMethodConfig, subKey);
      const targetIdx = rateCheckingPickupIndex;
      const pickupLoc = hasPickup && pickupPoints.length > 0 ? getCheckoutPlaceLabel(pickupPoints[targetIdx], `Pickup Point ${targetIdx + 1}`) : '';
      const meetupPlaces = (storeAdmin?.pickupDetails?.meetup?.places || []).filter(p => p.isActive !== false);
      const meetupLoc = hasMeetup && meetupPlaces.length > 0 ? getCheckoutPlaceLabel(meetupPlaces[0], 'Meetup Place 1') : '';

      updateCheckoutData(prev => ({
        ...prev,
        selectedSuboption: subKey,
        customSuboption: subKey,
        pickupLocation: pickupLoc,
        pickupLocationIndex: hasPickup && pickupPoints.length > 0 ? targetIdx : null,
        meetupLocation: meetupLoc,
        meetupLocationIndex: hasMeetup && meetupPlaces.length > 0 ? 0 : null
      }));

      const isNoAddress = subConfig.isPickupRequired || subConfig.isSelfBooking || subConfig.requiredFields?.includes(14) || subConfig.requiredFields?.includes(15);
      setAddressStatus(prev => ({ ...prev, isEditingAddress: !isNoAddress }));
    };

    const handleLocationChange = (indexValue) => {
      const idx = Number(indexValue);
      // Para sa pickup points, idx ay original index sa pickupPoints array.
      const place = usesMeetupLocation ? locationOptions[idx] : pickupPoints[idx];
      const fallback = usesMeetupLocation ? `Meetup Place ${idx + 1}` : `Pickup Point ${idx + 1}`;
      const placeLabel = getCheckoutPlaceLabel(place, fallback);
      updateCheckoutData(prev => ({
        ...prev,
        ...(usesMeetupLocation
          ? { meetupLocation: placeLabel, meetupLocationIndex: idx }
          : { pickupLocation: placeLabel, pickupLocationIndex: idx })
      }));
    };

    const itemRows = checkoutItems.map((item, idx) => {
      const kit = findCheckoutKit(kits, item);
      const displayImage = isProjectCheckoutItem(item)
        ? (item.projectData?.image || item.image)
        : resolveImage(item.image || kit?.image, item.images || kit?.images);
      const displayGrade = item.grade || item.specs?.line || kit?.specs?.line || '';
      const displayBrand = item.brand || kit?.brand || '';
      const rawName = (item.name || item.item || item.projectData?.projectName || `Item ${idx + 1}`)
        .replace(/\s*\(Pre-Order\)\s*$/i, '')
        .replace(/\s*\((?:Bundle|Clearance) Item\)\s*$/i, '');
      const quantity = Number(item.quantity) || 1;
      const itemInstallmentFee = Number(item.appliedInstallmentFee || 0);
      const displayInstallmentFee = checkoutData.paymentPlan === 'full'
        ? 0
        : itemInstallmentFee;
      const basePrice = Number(item.price || item.sellPrice || item.projectData?.displayPrice || item.projectData?.sellPrice || 0);
      const distributedFee = distributedOrderFees[idx] || { total: 0 };
      const standaloneFee = standaloneDistributedOrderFees[idx]?.total || 0;
      const unitPrice = basePrice + displayInstallmentFee + (distributedFee.total / quantity);
      const linePrice = unitPrice * quantity;
      const standaloneBasePrice = isProjectCheckoutItem(item)
        ? Number(item.projectData?.sellPrice || item.sellPrice || item.price || 0)
        : getStockStandaloneSellPrice(item, kit);
      const standaloneUnitPrice = standaloneBasePrice + itemInstallmentFee + standaloneFee;
      const isDiscounted = standaloneUnitPrice > unitPrice;
      const itemKitId = item.id || item.kitId || item.productId;
      const clearanceKitIds = Array.isArray(item.clearanceKitIds)
        ? item.clearanceKitIds
        : item.clearanceKitIds
          ? [item.clearanceKitIds]
          : [];
      const clearanceSourceKitId = item.clearanceSourceKitId || clearanceKitIds[0];
      const isClearanceSource = item.isClearanceBundle === true
        && clearanceSourceKitId
        && String(clearanceSourceKitId) === String(itemKitId);
      const isClearanceDealItem = !isProjectCheckoutItem(item) && isClearanceSource;
      const isBundleDealItem = !isProjectCheckoutItem(item)
        && item.isBundleItem === true
        && item.isClearanceBundle !== true;
      return {
        id: item.basketId || item.stockKey || item.id || idx,
        image: displayImage,
        name: rawName,
        meta: [displayGrade, displayBrand, isProjectCheckoutItem(item) ? 'PROJECT' : item.status].filter(Boolean).join(' / '),
        quantity,
        unitPrice,
        linePrice,
        standaloneUnitPrice,
        isBundleItem: isBundleOrClearanceItem(item),
        isClearanceSource,
        dealTag: isBundleDealItem
          ? 'BUNDLE DEAL'
          : isClearanceDealItem
            ? 'CLEARANCE'
            : '',
        isClearanceDealItem,
        isDiscounted
      };
    });

    const isPaymentUnavailable = isOrderInvalidForMaintenance;
    const isDisabled = isPaymentUnavailable || isFinalizing || (!isGuestLoginRequired && (
      !checkoutData.shippingMethod ||
      (!isNoDetailsMode && !isFormValid) ||
      !checkoutData.paymentPlan ||
      !checkoutData.paymentMethod ||
      (checkoutData.paymentPlan !== 'full' && Number(checkoutData.initialPayment) > totalToSettle) ||
      (checkoutData.paymentPlan !== 'full' && !agreedToPolicy)
    ));

    return (
      <div className="space-y-8 pb-24 pt-7 lg:pt-0">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
          <div className="space-y-6">
            <section className="text-left">
              <h2 className="mb-4 text-[12px] font-black uppercase tracking-widest opacity-45">Shipping Method</h2>
              <div className={`grid grid-cols-1 gap-3 ${shippingGridClass}`}>
                <CheckoutDropdown
                  label="Courier"
                  value={checkoutData.shippingMethod || ''}
                  placeholder="Select courier"
                  options={courierDropdownOptions}
                  onChange={handleShippingChange}
                  disabled={!isAdminCheckoutConfigReady}
                />

                {shouldShowSuboptionDropdown && (
                  <CheckoutDropdown
                    label="Suboption"
                    value={activeSubKey}
                    placeholder="Select option"
                    options={suboptionDropdownOptions}
                    onChange={handleSuboptionChange}
                    showSelectedBadge
                  />
                )}

                {shouldShowLocationDropdown && (
                  <CheckoutDropdown
                    label="Location"
                    value={Number.isInteger(selectedLocationIndex) ? selectedLocationIndex : ''}
                    placeholder="Select location"
                    options={locationDropdownOptions}
                    onChange={handleLocationChange}
                    showSelectedBadge={Boolean(locationDiscountBadge)}
                  />
                )}
              </div>
            </section>

            <section className="text-left">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-[12px] font-black uppercase tracking-widest opacity-45">{detailsTitle}</h2>
                {checkoutData.shippingMethod && hasConfiguredInputFields && !addressStatus.isEditingAddress && (
                  <button onClick={beginDetailsEdit} className="rounded-xl bg-blue-600/10 px-3 py-2 text-[12px] font-black uppercase tracking-widest text-blue-600">
                    Edit
                  </button>
                )}
              </div>

              {!checkoutData.shippingMethod ? (
                <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-black/10 bg-black/[0.02] p-8 text-center opacity-40 dark:border-white/10 dark:bg-white/[0.02]">
                  <Package size={42} />
                  <p className="mt-3 text-[11px] font-black uppercase tracking-widest">Select a shipping method to continue</p>
                </div>
              ) : addressStatus.isEditingAddress && !isNoDetailsMode ? (
                <div className="rounded-2xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/5 dark:bg-white/[0.02]">
                  <DynamicShippingForm
                    requiredFields={detailsInputFields}
                    deliveryData={deliveryData}
                    updateDeliveryData={updateDeliveryData}
                    checkoutData={checkoutData}
                    updateCheckoutData={updateCheckoutData}
                    validationState={validationState}
                    setValidationState={setValidationState}
                    addressStatus={addressStatus}
                    setAddressStatus={setAddressStatus}
                    courierName={courierName}
                    isDarkMode={isDarkMode}
                  />
                  <button
                    disabled={hasDetailsDraftChanged && !isDetailsFormValid}
                    onClick={hasDetailsDraftChanged ? handleConfirmDetails : cancelDetailsEdit}
                    className={`mt-4 w-full rounded-xl py-4 text-[13px] font-black uppercase tracking-widest text-white transition ${
                      hasDetailsDraftChanged
                        ? (!isDetailsFormValid ? 'cursor-not-allowed bg-emerald-600 opacity-50' : 'bg-emerald-600 hover:bg-emerald-700')
                        : 'bg-neutral-500 hover:bg-neutral-600'
                    }`}
                  >
                    {hasDetailsDraftChanged ? 'Confirm Details' : 'Cancel'}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {requiredFields.includes(1) && (
                    <div className="rounded-2xl bg-black/[0.03] p-4 dark:bg-white/[0.04]">
                      <p className="text-[12px] font-black uppercase tracking-widest opacity-40">Recipient</p>
                      <p className="mt-1 text-[13px] font-black uppercase text-blue-600">{deliveryData.receiverName || user?.displayName || 'No name provided'}</p>
                    </div>
                  )}
                  {requiredFields.includes(2) && (
                    <div className="rounded-2xl bg-black/[0.03] p-4 dark:bg-white/[0.04]">
                      <p className="text-[12px] font-black uppercase tracking-widest opacity-40">Mobile No.</p>
                      <p className="mt-1 text-[13px] font-black uppercase text-blue-600">{deliveryData.phoneNumber || user?.mobileNo || 'No mobile provided'}</p>
                    </div>
                  )}
                  {(isLocalPlaceMethod || showLocationSelect) && (
                    <div className="rounded-2xl bg-black/[0.03] p-4 dark:bg-white/[0.04] lg:col-span-2">
                      <div className="flex items-center gap-2">
                        <p className="text-[12px] font-black uppercase tracking-widest opacity-40">{usesMeetupLocation ? 'Meetup Location' : 'Pickup Pin'}</p>
                      </div>
                      <p className="mt-1 text-[13px] font-black uppercase text-blue-600">
                        {getCheckoutPlaceLabel(selectedLocalPlaceDetails, usesMeetupLocation ? 'Meetup Place' : 'Pickup Point')}
                      </p>
                      {getCheckoutPlaceAddress(selectedLocalPlaceDetails) && (
                        <p className="mt-1 text-[13px] font-bold uppercase opacity-55">{getCheckoutPlaceAddress(selectedLocalPlaceDetails)}</p>
                      )}
                      {!usesMeetupLocation && (
                        <p className="text-[13px] font-bold uppercase text-amber-600 dark:text-amber-500 leading-tight mt-1">
                          * Complete pickup details to be available once payment receipt is validated.
                        </p>
                      )}
                    </div>
                  )}
                  {isBranchPickup && (
                    <div className="rounded-2xl bg-black/[0.03] p-4 dark:bg-white/[0.04] lg:col-span-2">
                      <p className="text-[12px] font-black uppercase tracking-widest opacity-40">{courierName} Branch</p>
                      <p className="mt-1 text-[13px] font-black uppercase text-blue-600">
                        {checkoutData.lbcBranch || 'No branch provided'}
                      </p>
                      {branchDestinationLine && (
                        <p className="mt-1 text-[13px] font-bold uppercase opacity-55">{branchDestinationLine}</p>
                      )}
                    </div>
                  )}
                  {!isLocalPlaceMethod && !showLocationSelect && !isBranchPickup && (
                    <div className="rounded-2xl bg-black/[0.03] p-4 dark:bg-white/[0.04] lg:col-span-2">
                      <p className="text-[12px] font-black uppercase tracking-widest opacity-40">Delivery Address</p>
                      <p className="mt-1 text-[13px] font-black uppercase text-blue-600">{formatPlaceAddress(deliveryData) || 'No address confirmed'}</p>
                    </div>
                  )}
                  {(isLocalPlaceMethod || showLocationSelect) && selectedLocalPlaceCoord && (
                    <div className="space-y-2 lg:col-span-2">
                      <p className="text-[12px] font-black uppercase tracking-widest opacity-40">
                        {usesMeetupLocation ? 'Meetup Map Pin' : 'Pickup Map'}
                      </p>
                      <div className="relative z-0 isolate h-64 w-full overflow-hidden rounded-2xl border border-black/5 bg-black/[0.03] dark:border-white/5 dark:bg-white/[0.04]">
                        <MapContainer
                          center={selectedLocalPlaceCoord}
                          zoom={MAP_DEFAULT_ZOOM}
                          maxZoom={MAP_MAX_PIN_ZOOM}
                          style={{ height: '100%', width: '100%' }}
                          dragging={true}
                          scrollWheelZoom={true}
                          doubleClickZoom={true}
                          touchZoom={true}
                          zoomControl={true}
                        >
                          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={MAP_MAX_PIN_ZOOM} />
                          <Marker position={selectedLocalPlaceCoord} />
                          <ChangeView center={selectedLocalPlaceCoord} />
                          <MapRecenterButton center={selectedLocalPlaceCoord} />
                        </MapContainer>
                      </div>
                    </div>
                  )}
                  {!isLocalPlaceMethod && !showLocationSelect && requiredFields.includes(12) && (
                    <div className="space-y-2 lg:col-span-2">
                      <p className="text-[12px] font-black uppercase tracking-widest opacity-40">Drop-Off Pin</p>
                      <div className="relative z-0 isolate h-64 w-full overflow-hidden rounded-2xl border border-black/5 bg-black/[0.03] dark:border-white/5 dark:bg-white/[0.04]">
                        <MapContainer
                          center={[deliveryData.lat, deliveryData.lng]}
                          zoom={MAP_DEFAULT_ZOOM}
                          maxZoom={MAP_MAX_PIN_ZOOM}
                          style={{ height: '100%', width: '100%' }}
                          dragging={false}
                          scrollWheelZoom={false}
                          doubleClickZoom={false}
                          touchZoom={false}
                          zoomControl={false}
                        >
                          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={MAP_MAX_PIN_ZOOM} />
                          <Marker position={[deliveryData.lat, deliveryData.lng]} />
                          <ChangeView center={[deliveryData.lat, deliveryData.lng]} />
                          <MapRecenterButton center={[deliveryData.lat, deliveryData.lng]} />
                        </MapContainer>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="text-left">
              <h2 className="mb-4 text-[12px] font-black uppercase tracking-widest opacity-45">Items Breakdown</h2>
              <div className="space-y-3">
                {itemRows.map((row, idx) => (
                  <div key={`${row.id}-${idx}`} className="relative grid grid-cols-[5rem_minmax(0,1fr)_auto] gap-3 rounded-2xl border border-black/5 bg-white p-3 dark:border-white/5 dark:bg-neutral-900 lg:grid-cols-[18rem_minmax(0,1fr)_auto]">
                    {row.dealTag && (
                      <span className={`absolute left-0 bottom-5 z-10 px-1.5 py-1 md:px-2 md:py-1 text-[12px] font-black uppercase tracking-wider text-white shadow-sm ${
                        row.isClearanceDealItem ? 'bg-red-500' : 'bg-emerald-600'
                      }`}>
                        {row.dealTag}
                      </span>
                    )}
                    <div className="flex items-center justify-center">
                      {row.image ? (
                        <img src={row.image} alt={row.name} loading="lazy" className="h-20 w-20 rounded-xl border border-neutral-100 object-cover object-[center_25%] dark:border-neutral-800 lg:h-24 lg:w-64 xl:w-72" />
                      ) : (
                        <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-200 dark:border-neutral-800 dark:bg-neutral-800 lg:h-24 lg:w-64 xl:w-72">
                          <Package size={32} className="opacity-20" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 pt-1">
                      <p className="truncate text-[14px] font-black uppercase tracking-tight">{row.name}</p>
                      <p className="mt-1 truncate text-[12px] font-black uppercase tracking-widest opacity-45">{row.meta || 'KIT'}</p>
                      <p className="mt-1 text-[12px] font-black uppercase tracking-widest opacity-45">x{row.quantity}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-black uppercase tracking-widest opacity-45">{row.quantity > 1 ? 'Total' : 'Unit'}</p>
                      <p className={`text-[13px] font-black ${row.isDiscounted ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>₱{row.linePrice.toLocaleString()}</p>
                      {row.isDiscounted && (
                        <p className="mt-0.5 text-[12px] font-black text-neutral-500 line-through dark:text-neutral-300">₱{(row.standaloneUnitPrice * row.quantity).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <section className="rounded-[2rem] bg-blue-600 p-5 text-left text-white shadow-2xl lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-[14px] font-black uppercase tracking-widest opacity-70">Totals</h2>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="hidden rounded-xl p-2 text-white/65 transition hover:bg-white/10 hover:text-white lg:flex"
                  aria-label="Close checkout"
                >
                  <X size={22} />
                </button>
              </div>
              <div className="space-y-3 text-[14px] font-bold">
                <div className="flex justify-between"><span>Subtotal (Items)</span><span>₱{summaryItemsSubtotal.toLocaleString()}</span></div>
                {bundleDiscount > 0 && (
                  <div className="flex justify-between text-emerald-200"><span>Bundle Discount</span><span>-₱{bundleDiscount.toLocaleString()}</span></div>
                )}
                {clearanceDiscount > 0 && (
                  <div className="flex justify-between text-emerald-200"><span>Clearance Discount</span><span>-₱{clearanceDiscount.toLocaleString()}</span></div>
                )}
                {unusedClearanceDiscount > 0 && (
                  <div className="flex justify-between text-amber-200"><span>Unused Discount (Cost Cap)</span><span>₱{unusedClearanceDiscount.toLocaleString()}</span></div>
                )}
                {fullPaymentInstallmentDiscount > 0 && (
                  <div className="flex justify-between text-emerald-200"><span>Full Payment Discount</span><span>-₱{fullPaymentInstallmentDiscount.toLocaleString()}</span></div>
                )}
                <div className="flex justify-between">
                  <span>Handling Fee</span>
                  <span className={isHandlingFeeDiscounted ? 'line-through text-emerald-200' : ''}>₱{orderFees.handling.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cash Transfer Fee</span>
                  {isCashTransferFeeFullyDiscounted ? (
                    <span className="line-through text-emerald-200">₱{orderFees.transfer.toLocaleString()}</span>
                  ) : isCashTransferFeeDiscounted ? (
                    <span>₱{remainingCashTransferFee.toLocaleString()}</span>
                  ) : (
                    <span>₱{orderFees.transfer.toLocaleString()}</span>
                  )}
                </div>
                <div className={`flex justify-between ${isFreeShippingApplied ? 'text-emerald-200' : ''}`}><span>Shipping Fee</span><span>{checkoutData.shippingMethod === 'Self-Pickup' ? 'Not Applicable' : isFreeShippingApplied ? 'Free Shipping' : 'Not Included'}</span></div>
                <div className="flex justify-between border-t border-white/15 pt-4 text-xl font-black italic"><span>Total</span><span>₱{totalToSettle.toLocaleString()}</span></div>
                {isInstallmentPlan && (
                  <div className="flex justify-between text-[13px] font-black text-emerald-200"><span>Due Now</span><span>₱{amountDueNow.toLocaleString()}</span></div>
                )}
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <p className="mb-2 text-[12px] font-black uppercase tracking-widest opacity-60">Payment Plan</p>
                  <div className="grid grid-cols-2 gap-2">
                    {availablePaymentPlans.map(plan => {
                      const label = plan === 'full' ? 'Full' : plan === 'partial' ? 'Partial' : 'Reservation';
                      const isSelected = checkoutData.paymentPlan === plan;
                      return (
                        <button key={plan} onClick={() => { setAgreedToPolicy(false); updateCheckoutData(prev => ({ ...prev, paymentPlan: plan, initialPayment: plan === 'full' ? 0 : minInitialPayment })); }} className={`rounded-xl border py-3 text-[13px] font-black uppercase ${isSelected ? 'border-white bg-white text-blue-600' : 'border-white/80 text-white'}`}>
                          {label}{plan === 'full' && totalAppliedInstallmentFee > 0 ? ` ₱${totalAppliedInstallmentFee} OFF` : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {(checkoutData.paymentPlan === 'partial' || checkoutData.paymentPlan === 'reservation') && (
                  <div className="space-y-2">
                    <p className="text-[12px] font-black uppercase tracking-widest opacity-60">Downpayment</p>
                    <input
                      type="number"
                      value={checkoutData.initialPayment || ''}
                      onChange={(e) => updateCheckoutData(prev => ({ ...prev, initialPayment: Number(e.target.value) }))}
                      onBlur={(e) => {
                        const val = Number(e.target.value) || 0;
                        updateCheckoutData(prev => ({ ...prev, initialPayment: Math.min(Math.max(Math.ceil(val / 10) * 10, minInitialPayment), totalToSettle) }));
                      }}
                      className="w-full rounded-xl border border-white/50 bg-white/10 px-4 py-3 text-[13px] font-black text-white outline-none placeholder:text-white/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <label className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 p-3 text-[12px] font-bold leading-none whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={agreedToPolicy}
                        onChange={(e) => setAgreedToPolicy(e.target.checked)}
                        className="m-0 size-4 shrink-0 accent-white"
                      />
                      <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap">
                        I agree with the{' '}
                        <a
                          href="/payment-and-refund-policy"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setIsPaymentPolicyOpen(true);
                          }}
                          className="shrink-0 font-black text-white underline-offset-2 transition-colors hover:text-emerald-300"
                        >
                          payment and reservation policy
                        </a>
                        .
                      </span>
                    </label>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-[12px] font-black uppercase tracking-widest opacity-60">Payment Method</p>
                  <div className="grid grid-cols-2 gap-2">
                    {availablePaymentMethods.map(method => {
                      const methodConfig = getPaymentMethodConfig(storeAdmin?.paymentSettings?.methods, method);
                      const methodDiscount = Math.max(
                        methodConfig.transferDiscount ? totalAppliedTransferFee : 0,
                        Number(methodConfig.discountAmount || 0)
                      );
                      const hasDiscount = methodDiscount > 0;
                      const isSelected = checkoutData.paymentMethod?.toLowerCase() === method.toLowerCase();
                      return (
                        <button key={method} onClick={() => updateCheckoutData(prev => ({ ...prev, paymentMethod: method }))} className={`rounded-xl border px-3 py-3 text-[13px] font-black uppercase ${isSelected ? 'border-white bg-white text-blue-600' : 'border-white/80 text-white'}`}>
                          {method}{hasDiscount ? ` ₱${methodDiscount.toLocaleString()} OFF` : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={handleFinalizeOrder}
                  disabled={isDisabled}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-5 text-[13px] font-black uppercase tracking-[0.2em] text-blue-600 shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isFinalizing ? 'Reserving...' : isGuestLoginRequired ? <><FcGoogle size={16} />Login with Google</> : isPaymentUnavailable ? 'Payment Unavailable' : 'Pay Now'}
                </button>
                {availabilityNotice && (
                  <div className="space-y-0.5 text-center text-[10px] font-black uppercase tracking-widest text-amber-200">
                    <p>{availabilityNotice.warning}</p>
                    <p className="text-[9px] text-white/75">{availabilityNotice.detail}</p>
                  </div>
                )}
                {hasIncompleteRequiredDetails && (
                  <p className="text-center text-[11px] font-black uppercase tracking-widest text-white/70">Details Incomplete</p>
                )}
                {shouldShowGuestSignInPrompt && (
                  <p className="text-center text-[11px] font-black uppercase tracking-widest text-white/70">Sign In To Proceed</p>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    );
  };

  return (
    <div className={isPage ? "min-h-dvh w-full font-sans text-neutral-900 dark:text-white lg:min-h-[calc(100dvh-60px)]" : "fixed inset-0 z-[500] flex items-start md:items-center justify-center md:p-4 bg-black/60 font-sans text-neutral-900 dark:text-white"}>
      <div className={isPage ? "relative min-h-dvh w-full px-4 pb-6 custom-scrollbar lg:min-h-[calc(100dvh-60px)] lg:px-10 lg:py-6" : "bg-white/90 dark:bg-[#0a0a0a]/90 backdrop-blur-xl w-full h-full md:h-auto md:max-w-5xl rounded-none md:rounded-[2.5rem] border border-black/5 dark:border-white/10 p-5 md:p-6 shadow-2xl relative overflow-y-auto md:max-h-[95vh] custom-scrollbar"}>
        {isPage ? (
          <>
            {!isPaymentPolicyOpen && (
              <div className="pointer-events-none sticky top-0 z-[1000] h-0 lg:hidden">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={handleCloseModal}
                  className="pointer-events-auto absolute right-0 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-500 text-white shadow-lg transition hover:bg-neutral-600"
                  aria-label="Close checkout"
                >
                  <X size={20} />
                </motion.button>
              </div>
            )}
          </>
        ) : (
          !isPaymentPolicyOpen && (
            <div className="sticky top-0 z-[520] h-0 w-full overflow-visible md:hidden">
              <div className="absolute top-0 -right-2 flex items-center justify-end">
                <motion.button whileTap={{ scale: 0.9 }} onClick={handleCloseModal} className="rounded-full border border-black/5 bg-black/10 p-2 text-neutral-900 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-white/10 dark:text-white"><X size={20} /></motion.button>
              </div>
            </div>
          )
        )}
        {!isPage && (
          <motion.button whileTap={{ scale: 0.9 }} onClick={handleCloseModal} className="hidden md:block absolute top-6 right-6 p-4 -m-4 opacity-30 hover:opacity-100 z-50"><X size={24}/></motion.button>
        )}
        {checkoutStep === 1 && (isPage ? renderPageCheckoutStep() : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 md:gap-6">
              <div className="lg:col-span-4 space-y-4 text-left">
                <h4 className="text-[11px] font-black uppercase tracking-widest opacity-40 mb-3">Shipping Method</h4>
                <div className="grid grid-cols-1 gap-2">
                  {!isAdminCheckoutConfigReady ? (
                    <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 text-[11px] font-black uppercase tracking-widest opacity-50 text-center">Checkout settings not published yet</div>
                  ) : (
                    <>
                      {shippingOptions.map(m => {
                        const isSelected = checkoutData.shippingMethod === m;
                        let discountLabel = '';

                        if (m === 'LBC') {
                            const lbcWasDisabled = enabledShippingMethods.LBC?._wasDisabled;
                            ['cop', 'cod'].forEach(subKey => {
                                const hasFreePromo = checkoutItems.some(item => itemHasFreeShippingForSubKey(item, 'LBC', subKey, storeAdmin?.shippingMethods));
                                // Kung disabled ang LBC, ipakita lang ang discount label ng suboption na may promo
                                if (lbcWasDisabled && !hasFreePromo) return;
                                if (isSubMethodEnabled(enabledShippingMethods.LBC, subKey) || hasFreePromo) {
                                    const label = getShippingDiscountLabel('LBC', subKey);
                                    if (!discountLabel && label) discountLabel = label;
                                    if (label === 'FREE SHIPPING') discountLabel = label;
                                }
                            });
                        } else if (m === 'Lalamove') {
                            const lalamoveWasDisabled = enabledShippingMethods.Lalamove?._wasDisabled;
                            ['self', 'seller'].forEach(subKey => {
                                if (subKey === 'self' && pickupPoints.length === 0) return;
                                const hasFreePromo = checkoutItems.some(item => itemHasFreeShippingForSubKey(item, 'Lalamove', subKey, storeAdmin?.shippingMethods));
                                if (lalamoveWasDisabled && !hasFreePromo) return;
                                if (isSubMethodEnabled(enabledShippingMethods.Lalamove, subKey) || hasFreePromo) {
                                    const label = getShippingDiscountLabel('Lalamove', subKey);
                                    if (!discountLabel && label) discountLabel = label;
                                    if (label === 'FREE SHIPPING') discountLabel = label;
                                }
                            });
                        } else if (m === 'SPX Express') {
                            const spxWasDisabled = enabledShippingMethods['SPX Express']?._wasDisabled;
                            ['delivery', 'cod'].forEach(subKey => {
                                const hasFreePromo = checkoutItems.some(item => itemHasFreeShippingForSubKey(item, 'SPX Express', subKey, storeAdmin?.shippingMethods));
                                if (spxWasDisabled && !hasFreePromo) return;
                                if (isSubMethodEnabled(enabledShippingMethods['SPX Express'], subKey) || hasFreePromo) {
                                    const label = getShippingDiscountLabel('SPX Express', subKey);
                                    if (!discountLabel || label === 'FREE SHIPPING') discountLabel = label;
                                }
                            });
                        } else {
                            // Custom methods: i-check suboptions para sa FREE SHIPPING label
                            const rawMethodConfig = storeAdmin?.shippingMethods?.[m];
                            const methodConfig = enabledShippingMethods[m];
                            const customWasDisabled = methodConfig?._wasDisabled;
                            if (methodConfig?.hasSuboptions && rawMethodConfig?.suboptions) {
                              for (const [subKey, subVal] of Object.entries(rawMethodConfig.suboptions)) {
                                const hasFreePromo = checkoutItems.some(item => itemHasFreeShippingForSubKey(item, m, subKey, storeAdmin?.shippingMethods));
                                // Kung disabled ang method, ipakita lang ang label ng promo suboption
                                if (customWasDisabled && !hasFreePromo) continue;
                                if (subVal.active !== false || hasFreePromo) {
                                  const label = getShippingDiscountLabel(m, subKey);
                                  if (!discountLabel && label) discountLabel = label;
                                  if (label === 'FREE SHIPPING') discountLabel = label;
                                }
                              }
                            } else {
                              discountLabel = getShippingDiscountLabel(m);
                            }
                        }
                        
                        return (
                          <div key={m} className="space-y-2">
                            <motion.button 
                              whileTap={{ scale: 0.98 }}
                              onClick={() => {
                                if (isSelected) {
                                  // I-deselect ang current method
                                  updateCheckoutData(prev => ({ ...prev, shippingMethod: '', lbcType: 'COP', lalamoveType: 'Seller-Booking', spxType: 'Standard Delivery', selectedSuboption: '', customSuboption: '' }));
                                } else {
                                  handleShippingChange(m);
                                }
                              }}
                              className={`w-full p-3.5 rounded-2xl border-[2px] text-[11px] font-black uppercase transition-all text-left flex items-center justify-between group ${
                                isSelected ? 'bg-white/5 dark:bg-white/5 text-neutral-900 dark:text-white border-blue-600 shadow-lg' : 'bg-black/5 dark:bg-white/5 border-transparent hover:border-blue-600/50'
                              }`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span>{m}</span>
                                {!isSelected && discountLabel && (
                                  <span className="text-[12px] font-black ml-2 text-emerald-500">
                                    {discountLabel}
                                  </span>
                                )}
                              </div>
                              {isSelected && <CheckCircle2 size={16} className="ml-2 shrink-0 text-emerald-500" />}
                            </motion.button>
                          </div>
                        );
                      })}
                    </>
                  )}
                  {enabledShippingMethods?.[checkoutData.shippingMethod]?.hasSuboptions && (() => {
                    const activeSubKey = checkoutData.selectedSuboption || checkoutData.customSuboption;
                    const activeSubConfig = activeSubKey
                      ? enabledShippingMethods?.[checkoutData.shippingMethod]?.suboptions?.[activeSubKey]
                      : null;
                    const subNeedsPickup = activeSubConfig && (
                      Array.isArray(activeSubConfig.requiredFields)
                        ? activeSubConfig.requiredFields.includes(14)
                        : (activeSubConfig.isPickupRequired || activeSubConfig.isSelfBooking)
                    );
                    const subNeedsMeetup = activeSubConfig && (
                      Array.isArray(activeSubConfig.requiredFields)
                        ? activeSubConfig.requiredFields.includes(15)
                        : false
                    );

                    return (
                      <>
                        <div className="mt-4 space-y-2 animate-in slide-in-from-top duration-300">
                          <h5 className="text-[11px] font-black uppercase opacity-40">{checkoutData.shippingMethod} Option</h5>
                          <div className="grid grid-cols-1 gap-1">
                            {Object.entries(enabledShippingMethods?.[checkoutData.shippingMethod]?.suboptions || {})
                              .filter(([subKey, subVal]) => {
                                const hasFreePromo = checkoutItems.some(item => itemHasFreeShippingForSubKey(item, checkoutData.shippingMethod, subKey, storeAdmin?.shippingMethods));
                                return subVal.active !== false || hasFreePromo;
                              })
                              .sort(([subKeyA], [subKeyB]) => {
                                const getPriority = (subKey) => {
                                  const isFree = isMethodFreeShipping(checkoutData.shippingMethod, subKey);
                                  if (isFree) return 1;
                                  const hasDiscount = getHandlingDiscountSetting(storeAdmin?.shippingMethods, checkoutData.shippingMethod, subKey);
                                  if (hasDiscount) return 2;
                                  return 3;
                                };
                                return getPriority(subKeyA) - getPriority(subKeyB);
                              })
                              .map(([subKey, subVal]) => {
                                const isSubSelected = activeSubKey === subKey;
                                const discountLabel = getShippingDiscountLabel(checkoutData.shippingMethod, subKey);

                                return (
                                  <motion.button
                                    key={subKey}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => {
                                      updateCheckoutData(prev => {
                                        const method = prev.shippingMethod;
                                        const methodConfig = storeAdmin?.shippingMethods?.[method];
                                        const hasPickup = checkUsesPickupPoint(method, methodConfig, subKey);
                                        const hasMeetup = checkUsesMeetupLocation(method, methodConfig, subKey);

                                        let pickupLoc = '';
                                        let pickupLocIndex = null;
                                        if (hasPickup && pickupPoints.length > 0) {
                                          pickupLocIndex = rateCheckingPickupIndex;
                                          pickupLoc = getCheckoutPlaceLabel(pickupPoints[pickupLocIndex], `Pickup Point ${pickupLocIndex + 1}`);
                                        }

                                        let meetupLoc = '';
                                        let meetupLocIndex = null;
                                        const meetupPlaces = (storeAdmin?.pickupDetails?.meetup?.places || []).filter(p => p.isActive !== false);
                                        if (hasMeetup && meetupPlaces.length > 0) {
                                          meetupLoc = getCheckoutPlaceLabel(meetupPlaces[0], 'Meetup Place 1');
                                          meetupLocIndex = 0;
                                        }

                                        return { 
                                          ...prev, 
                                          selectedSuboption: subKey, 
                                          customSuboption: subKey,
                                          pickupLocation: pickupLoc,
                                          pickupLocationIndex: pickupLocIndex,
                                          meetupLocation: meetupLoc,
                                          meetupLocationIndex: meetupLocIndex
                                        };
                                      });
                                      const isNoAddr = subVal.isPickupRequired || subVal.isSelfBooking || subVal.requiredFields?.includes(14) || subVal.requiredFields?.includes(15);
                                      setAddressStatus(prev => ({...prev, isEditingAddress: !isNoAddr}));
                                    }}
                                    className={`p-3 rounded-xl border-[2px] text-[11px] font-black uppercase transition-all text-left flex flex-col ${isSubSelected ? 'bg-white/5 dark:bg-white/5 text-blue-600 dark:text-white border-blue-600 shadow-lg' : 'bg-black/5 dark:bg-white/5 border-transparent'}`}
                                  >
                                    <div className="flex items-center justify-between w-full">
                                      <span>{subVal.label || subKey}</span>
                                      <div className="flex items-center gap-1.5">
                                        {discountLabel && <span className={`text-[11px] font-black text-emerald-500`}>{discountLabel}</span>}
                                        {isSubSelected && <CheckCircle2 size={14} className="text-blue-500 dark:text-white shrink-0" />}
                                      </div>
                                    </div>
                                  </motion.button>
                                );
                              })}
                          </div>
                        </div>

                        {/* Pickup Location — second-level suboption for couriers */}
                        {subNeedsPickup && pickupPoints.length > 0 && (
                          <div className="mt-3 space-y-2 animate-in slide-in-from-top duration-300">
                            <div className="flex items-center gap-2">
                              <h5 className="text-[11px] font-black uppercase opacity-40">Pickup Pin</h5>
                            </div>
                            <div className="grid grid-cols-1 gap-1">
                              {pickupPoints.map((place, idx) => {
                                const fallbackLabel = `Pickup Point ${idx + 1}`;
                                const placeLabel = getCheckoutPlaceLabel(place, fallbackLabel);
                                const isSelected = checkoutData.pickupLocationIndex === idx || checkoutData.pickupLocation === placeLabel;
                                return (
                                  <motion.button
                                    key={idx}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => updateCheckoutData(prev => ({
                                      ...prev,
                                      pickupLocation: placeLabel,
                                      pickupLocationIndex: idx
                                    }))}
                                    className={`p-3 rounded-xl border-[2px] text-[11px] font-black uppercase transition-all text-left flex flex-col ${isSelected ? 'bg-white/5 dark:bg-white/5 border-blue-600 shadow-lg' : 'bg-black/5 dark:bg-white/5 border-transparent'}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <MapPinCheckInside size={18} className="text-amber-600" />
                                      <span>{placeLabel}</span>
                                    </div>
                                  </motion.button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Meetup Location — second-level suboption for couriers */}
                        {subNeedsMeetup && (
                          <div className="mt-3 space-y-2 animate-in slide-in-from-top duration-300">
                            <h5 className="text-[11px] font-black uppercase opacity-40">Meetup Location</h5>
                            <div className="grid grid-cols-1 gap-1">
                              {(storeAdmin?.pickupDetails?.meetup?.places || [])
                                .filter(p => p.isActive !== false)
                                .map((place, idx) => {
                                  const fallbackLabel = `Meetup Place ${idx + 1}`;
                                  const placeLabel = getCheckoutPlaceLabel(place, fallbackLabel);
                                  const placeAddress = getCheckoutPlaceAddress(place, { includeHouseNo: false });
                                  const isSelected = checkoutData.meetupLocationIndex === idx || checkoutData.meetupLocation === placeLabel;
                                  return (
                                    <motion.button
                                      key={idx}
                                      whileTap={{ scale: 0.98 }}
                                      onClick={() => updateCheckoutData(prev => ({
                                        ...prev,
                                        meetupLocation: placeLabel,
                                        meetupLocationIndex: idx
                                      }))}
                                      className={`p-3 rounded-xl border-[2px] text-[11px] font-black uppercase transition-all text-left flex flex-col ${isSelected ? 'bg-white/5 dark:bg-white/5 border-blue-600 shadow-lg' : 'bg-black/5 dark:bg-white/5 border-transparent'}`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <MapPinCheckInside size={18} className="text-amber-600" />
                                        <span>{placeLabel}</span>
                                      </div>
                                      {placeAddress && (
                                        <p className={`text-[10px] font-bold mt-0.5 ml-5 leading-tight ${isSelected ? 'text-blue-600/80' : 'text-neutral-500 dark:text-neutral-400'}`}>{placeAddress}</p>
                                      )}
                                    </motion.button>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  {((checkoutData.shippingMethod === 'Seller Meetup' && usesMeetupLocation) ||
                    (checkoutData.shippingMethod === 'Self-Pickup' && usesPickupPoint) ||
                    (checkoutData.shippingMethod === 'Lalamove' && checkoutData.lalamoveType === 'Self-Booking' && usesPickupPoint)) && (
                    <div className="mt-3 space-y-2 animate-in slide-in-from-top duration-300">
                      <div className="flex items-center gap-2">
                        <h5 className="text-[11px] font-black uppercase opacity-40">
                          {checkoutData.shippingMethod === 'Seller Meetup' ? 'Meetup Location' : 'Pickup Pin'}
                        </h5>
                      </div>
                      <div className="grid grid-cols-1 gap-1">
                        {(checkoutData.shippingMethod === 'Seller Meetup'
                            ? (storeAdmin?.pickupDetails?.meetup?.places || [])
                            : pickupPoints)
                          .filter(p => p.isActive !== false)
                          .map((place, idx) => {
                            const fallbackLabel = `${checkoutData.shippingMethod === 'Seller Meetup' ? 'Meetup Place' : 'Pickup Point'} ${idx + 1}`;
                            const placeLabel = getCheckoutPlaceLabel(place, fallbackLabel);
                            const isSelected = checkoutData.shippingMethod === 'Seller Meetup'
                                              ? checkoutData.meetupLocationIndex === idx || checkoutData.meetupLocation === placeLabel
                                              : checkoutData.pickupLocationIndex === idx || checkoutData.pickupLocation === placeLabel;
                            const discountLabel = checkoutData.shippingMethod === 'Lalamove' ? '' : getShippingDiscountLabel(checkoutData.shippingMethod);

                            return (
                              <motion.button
                                key={idx}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => updateCheckoutData(prev => ({
                                  ...prev,
                                  [checkoutData.shippingMethod === 'Seller Meetup' ? 'meetupLocation' : 'pickupLocation']: placeLabel,
                                  [checkoutData.shippingMethod === 'Seller Meetup' ? 'meetupLocationIndex' : 'pickupLocationIndex']: idx
                                }))}
                                className={`p-3 rounded-xl border-[2px] text-[11px] font-black uppercase transition-all text-left flex flex-col ${isSelected ? 'bg-white/5 dark:bg-white/5  border-blue-600 shadow-lg' : 'bg-black/5 dark:bg-white/5 border-transparent'}`}
                              >
                                <div className="flex justify-between items-start">
                                  <div className="flex items-center gap-2">
                                    <MapPinCheckInside size={16} className="text-amber-600" />
                                    <span>{placeLabel}</span>
                                  </div>
                                  {discountLabel && <span className={`text-[11px] font-black ml-2 text-emerald-500`}>{discountLabel}</span>}
                                </div>
                              </motion.button>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-4 space-y-5">
                    {checkoutData.shippingMethod ? (
                      <div className="animate-in fade-in slide-in-from-right duration-500 space-y-5">
                        <h4 className="text-[11px] font-black uppercase tracking-widest opacity-40">
                          {!LOCAL_METHODS.includes(checkoutData.shippingMethod)
                            ? "Receiver's Details"
                            : usesPickupPoint
                              ? 'Pickup Information'
                              : usesMeetupLocation
                                ? 'Meetup Information'
                                : "Receiver's Details"}
                        </h4>
                        {isNoDetailsMode ? (
                          <div className="p-5 rounded-[2.5rem] bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 space-y-5 animate-in zoom-in-95 duration-300 text-left">
                            {checkoutData.shippingMethod === 'Lalamove' && checkoutData.lalamoveType === 'Self-Booking' && usesPickupPoint && (
                              <>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">Pickup Pin</p>
                                    </div>
                                  <div className="flex items-center gap-2">
                                    <MapPinCheckInside size={16} className="text-blue-600" />
                                    <p className="text-sm font-black uppercase italic text-blue-600">{selectedPickupDetails?.landmark || 'Pickup Point'}</p>
                                  </div>
                                </div>
                                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                                  <div className="flex items-center gap-2 text-amber-600"><Info size={14} /><p className="text-[11px] font-black uppercase italic">Self-Booking Instructions</p></div>
                                  <p className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200 leading-relaxed">Search for the pickup point name above for checking your Lalamove rate.</p>
                                </div>
                              </>
                            )}
                            {checkoutData.shippingMethod === 'Self-Pickup' && usesPickupPoint && (
                              <>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">Pickup Pin</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <MapPinCheckInside size={16} className="text-blue-600" />
                                    <p className="text-sm font-black uppercase italic text-blue-600">
                                      {getCheckoutPlaceAddress(selectedPickupDetails) || 'Pickup Point'}
                                    </p>
                                    <p className="text-[9px] font-black uppercase text-amber-600 dark:text-amber-500 leading-tight ml-6 mt-1 animate-in fade-in duration-300">
                                      * Actual pin and complete address will be available once payment is validated and the order is ready for pickup.
                                    </p>
                                  </div>
                                </div>
                                <div className="p-4 rounded-2xl bg-blue-600/5 border border-blue-600/10 space-y-2">
                                  <div className="flex items-center gap-2 text-blue-600"><Info size={14} /><p className="text-[9px] font-black uppercase italic">Self-Pickup Instructions</p></div>
                                  <p className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200 leading-relaxed">See the pinned location below for the pickup.</p>
                                </div>
                              </>
                            )}
                            {checkoutData.shippingMethod === 'Seller Meetup' && usesMeetupLocation && (
                              <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-3">
                                <div className="flex items-center gap-2 text-emerald-600">
                                  <MapPinCheckInside size={16} />
                                  <p className="text-[11px] font-black uppercase italic">Meetup Instruction</p>
                                </div>
                                <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200 leading-relaxed">See the pinned location below for the meetup:</p>
                              </div>
                            )}
                            {/* Dynamic courier with pickup requirement */}
                            {!LOCAL_METHODS.includes(checkoutData.shippingMethod) && !(checkoutData.shippingMethod === 'Lalamove' && checkoutData.lalamoveType === 'Self-Booking') && usesPickupPoint && selectedPickupDetails && (
                              <>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">Pickup Pin</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <MapPinCheckInside size={16} className="text-blue-600" />
                                    <p className="text-sm font-black uppercase italic text-blue-600">
                                      {getCheckoutPlaceLabel(selectedPickupDetails, 'Pickup Point')}
                                    </p>
                                  </div>
                                  {getCheckoutPlaceAddress(selectedPickupDetails) && (
                                    <>
                                    <p className="text-[11px] font-black uppercase text-neutral-500 dark:text-neutral-300 leading-tight ml-6">
                                      {getCheckoutPlaceAddress(selectedPickupDetails)}
                                    </p>
                                    <p className="text-[9px] font-black uppercase text-amber-600 dark:text-amber-500 leading-tight ml-6 mt-1 animate-in fade-in duration-300">
                                      * Actual pin and complete address will be available once payment is validated and the order is ready for pickup.
                                    </p>
                                    </>
                                  )}
                                </div>
                                <div className="p-4 rounded-2xl bg-blue-600/5 border border-blue-600/10 space-y-2">
                                  <div className="flex items-center gap-2 text-blue-600"><Info size={14} /><p className="text-[9px] font-black uppercase italic">Pickup Instructions</p></div>
                                  <p className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200 leading-relaxed">See the pinned location below for the pickup.</p>
                                </div>
                              </>
                            )}
                            {/* Dynamic courier with meetup requirement */}
                            {!LOCAL_METHODS.includes(checkoutData.shippingMethod) && usesMeetupLocation && selectedMeetupDetails && (
                              <>
                                <div className="space-y-1">
                                  <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">Meetup Location</p>
                                  <div className="flex items-center gap-2">
                                    <MapPinCheckInside size={16} className="text-blue-600" />
                                    <p className="text-sm font-black uppercase italic text-blue-600">
                                      {getCheckoutPlaceLabel(selectedMeetupDetails, 'Meetup Place')}
                                    </p>
                                  </div>
                                  {getCheckoutPlaceAddress(selectedMeetupDetails) && (
                                    <p className="text-[11px] font-black uppercase text-neutral-500 dark:text-neutral-300 leading-tight ml-6">
                                      {getCheckoutPlaceAddress(selectedMeetupDetails)}
                                    </p>
                                  )}
                                </div>
                                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                                  <div className="flex items-center gap-2 text-emerald-600"><Info size={14} /><p className="text-[9px] font-black uppercase italic">Meetup Instructions</p></div>
                                  <p className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200 leading-relaxed">See the pinned location below for the meetup.</p>
                                </div>
                              </>
                            )}
                            {/* Map — shown for local-place type methods unconditionally */}
                            {isLocalPlaceMethod && (
                              <div className="space-y-2">
                                <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">{usesMeetupLocation ? 'Meetup Map Pin' : 'Pickup Map'}</p>
                                <div className="w-full h-40 rounded-[2rem] overflow-hidden border-2 border-blue-600/10 relative">
                                    <MapContainer
                                        ref={mapRef}
                                        center={selectedLocalPlaceCoord}
                                        zoom={MAP_DEFAULT_ZOOM}
                                        maxZoom={MAP_MAX_PIN_ZOOM}
                                        style={{ height: '100%', width: '100%' }}
                                        dragging={true}
                                        scrollWheelZoom={true}
                                        doubleClickZoom={true}
                                        touchZoom={true}
                                        zoomControl={true}
                                    >
                                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={MAP_MAX_PIN_ZOOM} />
                                      <Marker position={selectedLocalPlaceCoord} />
                                      <ChangeView center={selectedLocalPlaceCoord} />
                                      <MapRecenterButton center={selectedLocalPlaceCoord} />
                                    </MapContainer>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            {!addressStatus.isEditingAddress ? (
                              <div className="p-5 rounded-[2.5rem] bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 space-y-5 relative group text-left">
                                {hasConfiguredInputFields && (
                                  <button onClick={beginDetailsEdit} className="absolute top-5 right-5 p-2.5 rounded-xl bg-blue-600/10 text-blue-600 hover:bg-blue-600 hover:text-white transition-all"><Settings size={16} /></button>
                                )}
                                
                                {requiredFields.includes(1) && (
                                  <div className="space-y-1">
                                    <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">Recipient</p>
                                    <p className="text-sm font-black uppercase italic text-blue-600">
                                      {deliveryData.receiverName || 'No Name Provided'}
                                    </p>
                                  </div>
                                )}

                                {requiredFields.includes(2) && deliveryData.phoneNumber && (
                                  <div className="space-y-1">
                                    <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">Mobile No.</p>
                                    <p className="text-sm font-black uppercase italic text-blue-600">{deliveryData.phoneNumber}</p>
                                  </div>
                                )}

                                {isLocalPlaceMethod && (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">
                                        {checkoutData.shippingMethod === 'Seller Meetup' ? 'Meetup Location' : 'Pickup Pin'}
                                      </p>
                                    </div>
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <MapPinCheckInside size={16} className="text-blue-600" />
                                        <p className="text-sm font-black uppercase italic text-blue-600">
                                          {getCheckoutPlaceLabel(
                                            selectedLocalPlaceDetails,
                                            checkoutData.shippingMethod === 'Seller Meetup' ? 'Meetup Place' : 'Pickup Point'
                                          )}
                                        </p>
                                      </div>
                                      {getCheckoutPlaceAddress(selectedLocalPlaceDetails) && (
                                        <p className="text-[11px] font-black uppercase text-neutral-500 dark:text-neutral-300 leading-tight ml-6">
                                          {getCheckoutPlaceAddress(selectedLocalPlaceDetails)}
                                        </p>
                                      )}
                                      {checkoutData.shippingMethod !== 'Seller Meetup' && (
                                        <p className="text-[9px] font-black uppercase text-amber-600 dark:text-amber-500 leading-tight ml-6 mt-1">
                                          * Actual pin and complete address will be available once payment is validated and the order is ready for pickup.
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {isLocalPlaceMethod && (
                                  <div className="space-y-2">
                                    <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">
                                      {checkoutData.shippingMethod === 'Seller Meetup' ? 'Meetup Map Pin' : 'Pickup Map'}
                                    </p>
                                    <div className="w-full h-40 rounded-[2rem] overflow-hidden border-2 border-blue-600/20 relative">
                                      <MapContainer center={selectedLocalPlaceCoord} zoom={MAP_DEFAULT_ZOOM} maxZoom={MAP_MAX_PIN_ZOOM} style={{ height: '100%', width: '100%' }} dragging={false} scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false} zoomControl={false}>
                                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={MAP_MAX_PIN_ZOOM} />
                                        <Marker position={selectedLocalPlaceCoord} />
                                        <ChangeView center={selectedLocalPlaceCoord} />
                                        <MapRecenterButton center={selectedLocalPlaceCoord} />
                                      </MapContainer>
                                    </div>
                                  </div>
                                )}

                                {requiredFields.includes(3) && deliveryData.email && (
                                  <div className="space-y-1">
                                    <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">Email</p>
                                    <p className="text-sm font-black uppercase italic text-blue-600">{deliveryData.email}</p>
                                  </div>
                                )}

                                {(() => {
                                  const isBranchPickup = requiredFields.includes(13);
                                  const branchDestinationLine = [
                                    deliveryData.city,
                                    deliveryData.province,
                                    deliveryData.zipCode
                                  ].filter(Boolean).join(', ');
                                  return (
                                    <>
                                      {isBranchPickup && checkoutData.lbcBranch && (
                                        <div className="space-y-1">
                                          <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">{courierName} Branch</p>
                                          <p className="text-sm font-black uppercase italic text-blue-600">{checkoutData.lbcBranch}</p>
                                          {branchDestinationLine && (
                                            <p className="text-[11px] font-black uppercase text-neutral-500 dark:text-neutral-300 leading-tight">
                                              {branchDestinationLine}
                                            </p>
                                          )}
                                        </div>
                                      )}

                                      {!isLocalPlaceMethod && !isBranchPickup && (requiredFields.includes(5) || requiredFields.includes(6) || requiredFields.includes(7) || requiredFields.includes(8) || requiredFields.includes(4) || requiredFields.includes(9) || requiredFields.includes(10) || requiredFields.includes(11)) && (
                                  <div className="space-y-1">
                                    <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">Delivery Address</p>
                                    <div className="space-y-0.5">
                                      {deliveryData.landmark && <p className="text-[9px] font-black uppercase italic text-garage-blue leading-none mb-1">Landmark: {deliveryData.landmark}</p>}
                                      <p className="text-sm font-black uppercase italic text-blue-600 leading-tight">
                                        {formatPlaceAddress(deliveryData) || 'No Address Pinpointed'}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {!isLocalPlaceMethod && requiredFields.includes(12) && (
                                  <div className="space-y-2">
                                    <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">Drop-Off Pin</p>
                                    <div className="w-full h-40 rounded-[2rem] overflow-hidden border-2 border-blue-600/20 relative">
                                      <MapContainer center={[deliveryData.lat, deliveryData.lng]} zoom={MAP_DEFAULT_ZOOM} maxZoom={MAP_MAX_PIN_ZOOM} style={{ height: '100%', width: '100%' }} dragging={false} scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false} zoomControl={false}>
                                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={MAP_MAX_PIN_ZOOM} />
                                        <Marker position={[deliveryData.lat, deliveryData.lng]} />
                                        <ChangeView center={[deliveryData.lat, deliveryData.lng]} />
                                        <MapRecenterButton center={[deliveryData.lat, deliveryData.lng]} />
                                      </MapContainer>
                                    </div>
                                  </div>
                                )}
                                    </>
                                  );
                                })()}
                              </div>
                            ) : (
                              <div className="p-5 rounded-[2.5rem] bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 space-y-5 animate-in zoom-in-95 duration-300 text-left">
                                <DynamicShippingForm
                                  requiredFields={detailsInputFields}
                                  deliveryData={deliveryData}
                                  updateDeliveryData={updateDeliveryData}
                                  checkoutData={checkoutData}
                                  updateCheckoutData={updateCheckoutData}
                                  validationState={validationState}
                                  setValidationState={setValidationState}
                                  addressStatus={addressStatus}
                                  setAddressStatus={setAddressStatus}
                                  courierName={courierName}
                                  isDarkMode={isDarkMode}
                                />
                                <button 
                                  disabled={hasDetailsDraftChanged && !isDetailsFormValid}
                                  onClick={hasDetailsDraftChanged ? handleConfirmDetails : cancelDetailsEdit} 
                                  className={`w-full py-4 rounded-2xl text-white font-black uppercase text-xs tracking-widest transition-all ${
                                    hasDetailsDraftChanged
                                      ? (!isDetailsFormValid ? 'opacity-50 cursor-not-allowed bg-emerald-600' : 'bg-emerald-600 hover:bg-emerald-700')
                                      : 'bg-neutral-500 hover:bg-neutral-600'
                                  }`}
                                >
                                  {hasDetailsDraftChanged ? 'Confirm Details' : 'Cancel'}
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center opacity-20 text-center space-y-4 py-20 animate-in fade-in duration-700">
                        <Package size={48} /><p className="text-[11px] font-black uppercase tracking-widest">Select a shipping method<br/>to provide receiver info</p>
                      </div>
                    )}
              </div>

              <div className="lg:col-span-4 space-y-5">
                <h4 className="text-[11px] font-black uppercase tracking-widest opacity-40">Final Review</h4>
                <div className="p-5 rounded-[2.5rem] bg-blue-600 text-white shadow-2xl space-y-5">
                  <div className="space-y-3 text-left">
                      {checkoutItems.map((item, idx) => {
  // 1. Kunin ang totoong base price ng item (Gagana sa parehong Kit at Project!)
  // Kung project ito, kukunin nito ang malinis na ₱2,100 mula sa projectData?.sellPrice
  const basePrice = Number(item.price || item.sellPrice || item.projectData?.sellPrice || 0);
  
  // 2. I-add ang installment fee (₱2,100 + ₱100 = ₱2,200)
  const itemInstallmentFee = Number(item.appliedInstallmentFee || 0);
  const displayInstallmentFee = checkoutData.paymentPlan === 'full'
    ? 0
    : itemInstallmentFee;
  const quantity = Number(item.quantity) || 1;
  const distributedFee = distributedOrderFees[idx] || { total: 0 };
  const itemPrice = basePrice + displayInstallmentFee + (distributedFee.total / quantity);
  const itemLinePrice = itemPrice * quantity;
  const sourceKit = findCheckoutKit(kits, item);
  const standaloneFee = standaloneDistributedOrderFees[idx]?.total || 0;
  const standaloneBasePrice = isProjectCheckoutItem(item)
    ? Number(item.projectData?.sellPrice || item.sellPrice || item.price || 0)
    : getStockStandaloneSellPrice(item, sourceKit);
  const standalonePrice = standaloneBasePrice + itemInstallmentFee + standaloneFee;
  const isDiscountedItem = standalonePrice > itemPrice;

  // 3. Resolve the image
  const displayImage = item.type === 'project'
    ? (item.projectData?.image || item.image)
    : resolveImage(item.image, item.images);

  return (
    <div key={idx} className="flex flex-col gap-1 text-left">
      <div className="flex justify-between items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {displayImage ? (
            <img 
              src={displayImage} 
              alt="" 
              className="w-8 h-8 rounded-lg object-cover bg-neutral-200 dark:bg-neutral-800 shrink-0" 
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <Package size={14} className="text-white" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase line-clamp-1 opacity-100">
              {(item.quantity || 1) > 1 ? `(${item.quantity}x) ` : ''}
              {item.name}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/60">{(item.quantity || 1) > 1 ? 'Total' : 'Unit'}</p>
          <p className={`text-[10px] font-black ${isDiscountedItem ? 'text-emerald-200' : ''}`}>₱{itemLinePrice.toLocaleString()}</p>
          {isDiscountedItem && (
            <p className="text-[9px] font-black line-through text-white/65">₱{(standalonePrice * (item.quantity || 1)).toLocaleString()}</p>
          )}
        </div>
      </div>
    </div>
  );
})}
                  </div>
                  <div className="pt-3 border-t border-white/20 space-y-1 text-[10px] font-bold text-left">
                      <div className="flex justify-between uppercase opacity-100">
                        <span>Subtotal (Items)</span>
                        <span>₱{summaryItemsSubtotal.toLocaleString()}</span>
                      </div>
                      {bundleDiscount > 0 && (
                        <div className="flex justify-between uppercase font-black text-emerald-300">
                          <span>Bundle Discount</span>
                          <span>-₱{bundleDiscount.toLocaleString()}</span>
                        </div>
                      )}
                      {clearanceDiscount > 0 && (
                        <div className="flex justify-between uppercase font-black text-emerald-300">
                          <span>Clearance Discount</span>
                          <span>-₱{clearanceDiscount.toLocaleString()}</span>
                        </div>
                      )}
                      {unusedClearanceDiscount > 0 && (
                        <div className="flex justify-between uppercase font-black text-amber-200">
                          <span>Unused Discount (Cost Cap)</span>
                          <span>₱{unusedClearanceDiscount.toLocaleString()}</span>
                        </div>
                      )}
                      {fullPaymentInstallmentDiscount > 0 && (
                        <div className="flex justify-between uppercase font-black text-emerald-300">
                          <span>Full Payment Discount</span>
                          <span>-₱{fullPaymentInstallmentDiscount.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between uppercase opacity-100">
                        <span>Handling Fee</span>
                        <span className={isHandlingFeeDiscounted ? 'line-through text-emerald-300' : ''}>₱{orderFees.handling.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between uppercase opacity-100">
                        <span>Cash Transfer Fee</span>
                        {isCashTransferFeeFullyDiscounted ? (
                          <span className="line-through text-emerald-300">₱{orderFees.transfer.toLocaleString()}</span>
                        ) : isCashTransferFeeDiscounted ? (
                          <span>₱{remainingCashTransferFee.toLocaleString()}</span>
                        ) : (
                          <span>₱{orderFees.transfer.toLocaleString()}</span>
                        )}
                      </div>
                      <div className={`flex justify-between uppercase ${isFreeShippingApplied ? 'text-emerald-300' : 'text-white/60'}`}>
                        <span>Shipping Fee</span>
                        <span>{checkoutData.shippingMethod === 'Self-Pickup' ? 'NOT APPLICABLE' : isFreeShippingApplied ? 'FREE SHIPPING' : 'NOT INCLUDED'}</span>
                      </div>
                      <div className="flex justify-between text-lg font-black italic uppercase pt-2"><span>Total</span><span>₱{totalToSettle.toLocaleString()}</span></div>
                  </div>
                  <div className="space-y-5 pt-5 border-t border-white/10">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <p className="text-[10px] font-black uppercase opacity-60 tracking-widest">Payment Plan</p>
                          <div className="grid grid-cols-2 gap-2">
                            {availablePaymentPlans.map(plan => {
                              const isSelected = checkoutData.paymentPlan === plan;
                              const label = plan === 'full' ? 'Full' : plan === 'reservation' ? 'Reservation' : 'Partial';
                              return (
                                <motion.button
                                  key={plan}
                                  whileTap={{ scale: 0.98 }}
                                  onClick={() => { setAgreedToPolicy(false); updateCheckoutData(prev => ({ ...prev, paymentPlan: plan, initialPayment: plan === 'full' ? 0 : minInitialPayment })); }}
                                  className={`w-full py-3 rounded-xl text-[11px] font-black uppercase border transition-all flex items-center justify-center gap-1.5 ${
                                    isSelected ? 'bg-white text-blue-600 border-white shadow-lg' : 'bg-transparent text-white border-white hover:bg-white/5'
                                  }`}
                                >
                                  <span>{label}</span>
                                  {plan === 'full' && totalAppliedInstallmentFee > 0 && <span className={`text-[11px] font-black ${isSelected ? 'text-black/80' : 'text-emerald-300'}`}>₱{totalAppliedInstallmentFee} OFF</span>}
                                </motion.button>
                              );
                            })}
                          </div>
                        </div>
                        <AnimatePresence>
                          {(checkoutData.paymentPlan === 'partial' || checkoutData.paymentPlan === 'reservation') && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0, marginTop: 0 }}
                              animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                              exit={{ opacity: 0, height: 0, marginTop: 0 }}
                              transition={{ duration: 0.3, ease: "easeInOut" }}
                              className="space-y-2 overflow-hidden"
                            >
                              <p className="text-[10px] font-black uppercase tracking-widest">
                                  DOWNPAYMENT
                              </p>
                              <div className="relative group">
                                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white font-black text-xs">₱</span>
                                  <motion.input 
                                    whileTap={{ scale: 0.99 }}
                                    whileFocus={{ scale: 1.01 }}
                                    transition={{ duration: 0.1 }}
                                    type="number" 
                                    placeholder={minInitialPayment.toString()}
                                    value={checkoutData.initialPayment || ''} 
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      updateCheckoutData(prev => ({...prev, initialPayment: val}));
                                    }}
                                    onBlur={(e) => {
                                      let val = Number(e.target.value) || 0;
                                      // Always apply ceiling by 10s to user input
                                      const ceilingVal = Math.ceil(val / 10) * 10;
                                      
                                      // Clamp within valid range [minInitialPayment, totalToSettle]
                                      const clampedVal = Math.min(Math.max(ceilingVal, minInitialPayment), totalToSettle);
                                      
                                      updateCheckoutData(prev => ({...prev, initialPayment: clampedVal}));
                                    }}
                                    min={minInitialPayment}
                                    max={totalToSettle}
                                    className="w-full pl-8 pr-4 py-3 rounded-xl text-xs font-black focus:outline-none focus:ring-2 focus:ring-white bg-white/10 text-white placeholder:text-white/20 border border-white/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                              </div>
                              <p className="text-[10px] font-bold uppercase">
                              {checkoutData.initialPayment <= minInitialPayment
                              ? `Minimum ${checkoutData.paymentPlan === 'partial' ? 'downpayment amount' : 'reservation fee'} is ₱${minInitialPayment.toLocaleString()}`
                              : checkoutData.initialPayment >= totalToSettle
                                ? 'Why not grab that discount?'
                                : `This is more than minimum ${checkoutData.paymentPlan === 'partial' ? 'project downpayment' : 'reservation fee'}`}
                              </p>
                              <label className="mt-4 flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/5 p-4 text-[11px] leading-none whitespace-nowrap transition-all hover:border-white/20 hover:bg-white/10 cursor-pointer select-none group">
                                <input
                                  type="checkbox"
                                  checked={agreedToPolicy}
                                  onChange={(e) => setAgreedToPolicy(e.target.checked)}
                                  className="sr-only"
                                />
                                <motion.div 
                                  animate={{
                                    backgroundColor: agreedToPolicy ? 'rgb(16 185 129)' : 'rgba(255, 255, 255, 0.05)',
                                    borderColor: agreedToPolicy ? 'rgb(16 185 129)' : 'rgba(255, 255, 255, 0.3)',
                                  }}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  transition={{ duration: 0.15 }}
                                  className="flex size-5 min-w-[20px] shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 shadow-inner transition-all"
                                >
                                  {agreedToPolicy && (
                                    <motion.svg 
                                      initial={{ scale: 0, rotate: -45 }}
                                      animate={{ scale: 1, rotate: 0 }}
                                      transition={{ type: "spring", stiffness: 500, damping: 20 }}
                                      className="w-3 h-3 text-white stroke-[3.5px]" 
                                      fill="none" 
                                      viewBox="0 0 24 24" 
                                      stroke="currentColor"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </motion.svg>
                                  )}
                                </motion.div>
                                <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap text-[11px] font-medium text-white/90">
                                  {(() => {
                                    const garageName = garageInfo?.name || garageInfo?.garageName || garageInfo?.displayName || 'SnorlaxGarage';
                                    const policyType = checkoutData.paymentPlan === 'partial' ? 'project downpayment' : 'reservation';
                                    return (
                                      <>
                                        I agree with the{' '}
                                        <a
                                          href="/payment-and-refund-policy"
                                          onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            setIsPaymentPolicyOpen(true);
                                          }}
                                          className="shrink-0 font-black text-emerald-300 underline underline-offset-2 transition-colors hover:text-white"
                                        >
                                          <strong className="font-extrabold">{garageName}</strong> {policyType} policies
                                        </a>.
                                      </>
                                    );
                                  })()}
                                  {Number(checkoutData.initialPayment) > minInitialPayment && (
                                    <span className="ml-1.5 text-emerald-300 font-bold">(*Excess is refundable)</span>
                                  )}
                                </span>
                              </label>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] font-black uppercase opacity-60 tracking-widest">Payment Method</p>
                        <div className="grid grid-cols-2 gap-2">
                          {/* Gamitin ang availablePaymentMethods na naka-compute na sa useMemo —
                              hindi na kailangan ng duplicate filter logic dito. Naka-apply na
                              ang cash restriction, pre-order check, at active/disabled check. */}
                          {availablePaymentMethods.map(method => {
                            const methodConfig = getPaymentMethodConfig(storeAdmin?.paymentSettings?.methods, method);
                            const methodDiscount = Math.max(
                              methodConfig.transferDiscount ? totalAppliedTransferFee : 0,
                              Number(methodConfig.discountAmount || 0)
                            );
                            const hasDiscount = methodDiscount > 0;
                            const isSelected = checkoutData.paymentMethod?.toLowerCase() === method.toLowerCase();

                            return (
                               <motion.button
                                 key={method}
                                 whileTap={{ scale: 0.98 }}
                                 onClick={() => updateCheckoutData(prev => ({ ...prev, paymentMethod: method }))}
                                 className={`w-full py-3 px-4 rounded-xl text-[10px] font-black uppercase border transition-all flex items-center ${hasDiscount ? 'justify-between' : 'justify-center'} ${
                                   isSelected
                                   ? 'bg-white text-blue-600 border-white shadow-lg'
                                   : 'bg-transparent text-white border-white hover:bg-white/5'
                                 }`}
                               >
                                 <span>{method}</span>
                                 {hasDiscount && (
                                   <span className={`text-[10px] font-black ${isSelected ? 'text-black/80' : 'text-emerald-300'}`}>
                                     ₱{methodDiscount.toLocaleString()} OFF
                                   </span>
                                 )}
                               </motion.button>
                             );
                          })}
                        </div>
                      </div>
                  </div>
                    {(() => {
                      const isPaymentUnavailable = isOrderInvalidForMaintenance;
                      const isDisabled = isPaymentUnavailable || isFinalizing || (!isGuestLoginRequired && (
                        !checkoutData.shippingMethod ||
                        (!isNoDetailsMode && !isFormValid) ||
                        !checkoutData.paymentPlan ||
                        !checkoutData.paymentMethod ||
                        (checkoutData.paymentPlan !== 'full' && Number(checkoutData.initialPayment) > totalToSettle) ||
                        (checkoutData.paymentPlan !== 'full' && !agreedToPolicy)
                      ));
                      const buttonDisabled = isDisabled;
                      return (
                        <>
                          <motion.button
                            onClick={handleFinalizeOrder}
                            disabled={buttonDisabled}
                            animate={buttonDisabled ? { scale: 0.96, opacity: 0.5 } : { scale: 1.0, opacity: 1 }}
                            whileHover={buttonDisabled ? {} : { scale: 1.03, y: -2 }}
                            whileTap={buttonDisabled ? {} : { scale: 0.95, y: 1 }}
                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                            className="w-full py-5 rounded-2xl bg-white text-blue-600 font-black uppercase text-xs tracking-[0.2em] shadow-xl flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                          >
                            {isFinalizing ? (
                              <>
                                <Loader2 className="animate-spin" size={18} />
                                <span>Reserving...</span>
                              </>
                            ) : isGuestLoginRequired ? (
                              <><FcGoogle size={16} />Login with Google</>
                            ) : isPaymentUnavailable ? (
                              'Payment Unavailable'
                            ) : (
                              'Pay Now'
                            )}
                          </motion.button>
                          {availabilityNotice && (
                            <div className="space-y-0.5 text-center text-[10px] font-black uppercase tracking-widest text-amber-200">
                              <p>{availabilityNotice.warning}</p>
                              <p className="text-[9px] text-white/75">{availabilityNotice.detail}</p>
                            </div>
                          )}
                          {hasIncompleteRequiredDetails && (
                            <p className="text-center text-[10px] font-black uppercase tracking-widest text-white/70">Details Incomplete</p>
                          )}
                          {shouldShowGuestSignInPrompt && (
                            <p className="text-center text-[10px] font-black uppercase tracking-widest text-white/70">Sign In To Proceed</p>
                          )}
                        </>
                      );
                    })()}
                </div>
              </div>
            </div>
        ))}
        {checkoutStep === 2 && renderCheckoutPaymentStep()}
        {/* DISABLED: Old Order Reserved step (kept for reference)
          <div className="max-w-4xl mx-auto py-2 md:py-4 animate-in zoom-in-95 duration-500">
             <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 mx-auto mb-2"><CheckCircle2 size={28} /></div>
                <h2 className="text-xl md:text-2xl font-black italic uppercase tracking-tighter">Order Reserved</h2>
             </div>

             {checkoutData.paymentMethod === 'Cash' && !isOrderInvalidForMaintenance ? (
                <div className="max-w-xl mx-auto w-full p-8 bg-black/5 dark:bg-white/5 rounded-[2.5rem] border border-black/5 dark:border-white/10 flex flex-col items-center text-center gap-6 animate-in fade-in duration-300">
                  <div className="p-4 bg-blue-600/10 text-blue-600 rounded-full">
                    <Store size={40} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-black uppercase tracking-wider">Cash Payment Selected</h3>
                    <p className="text-sm font-bold text-neutral-600 dark:text-neutral-300 leading-relaxed max-w-md">
                      {isOrderInvalidForMaintenance ? (
                        "The garage is still in maintenance mode, this order is invalid"
                      ) : (
                        "Your order is being prepared, we will notify you when it's ready for pickup."
                      )}
                    </p>
                  </div>
                  <div className="w-full p-6 rounded-2xl bg-blue-600 text-white shadow-xl">
                    <p className="text-[10px] font-black uppercase opacity-60">Total to Pay on Pickup</p>
                    <p className="text-3xl font-black italic">₱{amountDueNow.toLocaleString()}</p>
                  </div>
                  <motion.button 
                    whileTap={{ scale: 0.98 }}
                    onClick={handleCloseModal} 
                    className="w-full py-4 bg-white text-blue-600 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    View My Orders
                  </motion.button>
                </div>
             ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-stretch">
                   <div className="space-y-4 md:space-y-6">
                      <div className="p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] bg-blue-600 text-white shadow-xl">
                         <p className="text-[10px] md:text-[11px] font-black uppercase opacity-60">Amount to Settle</p>
                         <p className="text-4xl md:text-5xl font-black italic mb-1">₱{amountDueNow.toLocaleString()}</p>
                         {checkoutData.paymentPlan !== 'full' && (
                           <p className="text-[8px] md:text-[9px] font-bold opacity-60 mt-2">Remaining balance will be due upon pickup/delivery.</p>
                         )}
                      </div>
                      {(() => {
                        const pm = checkoutData.paymentMethod;
                        const methodQr = paymentPreviewUrl;
                        const qrLabel = isOrderInvalidForMaintenance ? 'Payment Placeholder' : 'Payment QR';
                        const qrDownloadName = isOrderInvalidForMaintenance ? 'SG-Logo.png' : `${pm}-QR.png`;

                        return (
                          <div className="space-y-3 text-left">
                            <h3 className="text-[13px] font-black uppercase tracking-widest">Payment Details</h3>
                            {methodQr ? (
                              <div className="flex flex-col items-center gap-2 rounded-2xl border border-amber-500/10 bg-amber-500/5 p-4">
                                <h4 className="text-center text-[12px] font-black uppercase leading-tight tracking-widest text-amber-600">
                                  {qrLabel}
                                  {!isOrderInvalidForMaintenance && pm && (
                                    <span className="mt-0.5 block text-[12px] font-black opacity-100">{pm}</span>
                                  )}
                                </h4>
                                <button
                                  type="button"
                                  className="group relative flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-black/5 bg-white p-2 transition-opacity hover:opacity-80"
                                  onClick={() => setActivePreviewUrl(methodQr)}
                                >
                                  <img src={methodQr} alt={`${pm || 'Payment'} QR`} className="h-full w-full object-contain" />
                                  <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                                    <Eye size={14} className="text-white" />
                                  </span>
                                </button>
                                <motion.a
                                  whileTap={{ scale: 0.98 }}
                                  href={methodQr}
                                  download={qrDownloadName}
                                  className="flex w-full items-center justify-center gap-1 rounded-lg bg-amber-600 py-1.5 text-[12px] font-black uppercase tracking-widest text-white transition-all hover:bg-amber-700"
                                >
                                  <Download size={12} /> {isOrderInvalidForMaintenance ? 'Placeholder' : 'QR Code'}
                                </motion.a>
                              </div>
                            ) : (
                              <div className="rounded-xl bg-red-500/10 p-4 text-center text-[13px] font-black uppercase text-red-500">
                                QR not available. Please contact admin.
                              </div>
                            )}
                          </div>
                        );
                      })()}
                   </div>
                   <div className="h-full">
                      <div className="h-full flex flex-col">
                         {!previewUrl ? (
                           <label className="block w-full cursor-pointer group h-full">
                               <input type="file" className="hidden" accept="image/*" onChange={handleFileSelect} disabled={isUploading} />
                               <div className="w-full h-full min-h-[400px] md:min-h-[460px] rounded-[2rem] md:rounded-[2.5rem] border-2 border-dashed border-blue-600/30 flex flex-col items-center justify-center gap-4 group-hover:bg-blue-600/5 transition-all bg-black/5 dark:bg-white/5">
                                  <div className="p-5 md:p-6 rounded-full bg-blue-600/10 text-blue-600 transition-transform group-hover:scale-110">
                                    <Upload size={40} />
                                  </div>
                                  <div className="text-center space-y-1"> 
                                    <span className="text-[11px] md:text-xs font-black uppercase tracking-[0.2em] text-blue-600 block">Upload Receipt Screenshot</span>
                                    <span className="text-[9px] font-bold opacity-40 uppercase tracking-widest block">Tap or Drag image here</span>
                                  </div>
                               </div>
                           </label>
                         ) : (
                           <div className="space-y-4 md:space-y-6 animate-in zoom-in-95 duration-300 text-center flex flex-col h-full">
                               <div className="flex-1 bg-black/5 dark:bg-white/5 rounded-[2rem] md:rounded-[2.5rem] p-4 border border-black/5 dark:border-white/10 overflow-hidden">
                                  <img src={previewUrl} className="w-full h-full object-contain rounded-[1.5rem]" alt="Receipt Preview" />
                               </div>
                               <div className="flex gap-3 md:gap-4 flex-none">
                                  <motion.button whileTap={{ scale: 0.98 }} onClick={handleConfirmReceipt} disabled={isUploading} className="flex-[2] py-4 md:py-5 bg-emerald-600 text-white rounded-[1.5rem] md:rounded-[2rem] font-black uppercase text-[10px] md:text-xs tracking-widest shadow-lg shadow-emerald-600/20 active:scale-95 transition-all">Confirm & Upload</motion.button>
                                  <motion.button whileTap={{ scale: 0.98 }} onClick={() => setPreviewUrl(null)} disabled={isUploading} className="flex1 py-4 md:py-5 bg-black/5 text-neutral-500 rounded-[1.5rem] md:rounded-[2rem] font-black uppercase text-[10px] md:text-xs tracking-widest hover:bg-black/10 transition-all active:scale-95">Change</motion.button>
                               </div>
                           </div>
                         )}
                      </div>
                   </div>
                </div>
             )}
          </div>
        */}
        {/* DISABLED: Old image preview overlay (kept for reference)
          <div
            className="fixed inset-0 z-[700] flex items-center justify-center bg-black/95 p-4 animate-in fade-in duration-300"
            onClick={() => setActivePreviewUrl(null)}
          >
            <button
              type="button"
              onClick={() => setActivePreviewUrl(null)}
              className="absolute top-8 right-8 z-10 text-white/50 transition hover:text-white"
              aria-label="Close preview"
            >
              <X size={40} />
            </button>
            <div className="flex flex-col items-center gap-6" onClick={(event) => event.stopPropagation()}>
              <div className="flex max-w-[80vw] flex-col items-center gap-4 rounded-3xl bg-white p-6 shadow-2xl">
                <img
                  src={activePreviewUrl}
                  className="h-[60vw] max-h-[320px] w-[60vw] max-w-[320px] object-contain"
                  alt="Payment QR Code"
                />
                {checkoutData.paymentMethod && (
                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                    {isOrderInvalidForMaintenance ? 'Payment Placeholder' : checkoutData.paymentMethod}
                  </p>
                )}
              </div>
              {amountDueNow > 0 && (
                <div className="flex flex-col items-center gap-1">
                  <p className="text-[12px] font-black uppercase tracking-widest text-white/40">Amount to Pay</p>
                  <p className="text-3xl font-black tracking-tight text-white">₱{amountDueNow.toLocaleString()}</p>
                </div>
              )}
              {!previewUrl ? (
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-blue-500 bg-blue-600 px-10 py-4 text-[12px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500">
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileSelect} disabled={isUploading} />
                  <Upload size={16} />
                  Upload Receipt
                </label>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={handleConfirmReceipt}
                    disabled={isUploading}
                    className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-8 py-4 text-[12px] font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isUploading ? 'Uploading...' : 'Confirm Upload'}
                  </motion.button>
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-white/20 bg-white/10 px-8 py-4 text-[12px] font-black uppercase tracking-widest text-white transition hover:bg-white/15">
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileSelect} disabled={isUploading} />
                    Change Receipt
                  </label>
                </div>
              )}
            </div>
          </div>
        */}
        <PolicyModal
          policy="payment"
          isOpen={isPaymentPolicyOpen}
          onClose={() => setIsPaymentPolicyOpen(false)}
          zIndexClass="z-[700]"
        />
      </div>
    </div>
  );
}
