/* eslint-disable react-hooks/preserve-manual-memoization */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  X, Clock, Package, ShelvingUnit, PackageMinus, PackagePlus, PackageX, Calendar, UserCheck, Info,
  ChevronRight, ChevronLeft, Bike, Pencil, Trash2, Bell, Plane, Plus, ArrowBigUpDash, Gift, Zap, Forward
  } from 'lucide-react';
import { FaQuestion } from 'react-icons/fa';
import { useStore } from '../../store/useStore';
import { useTheme } from '../../context/ThemeContext';
import { getCheckoutPaymentFees } from '../../utils/paymentSettings';
import {
  getBundleDealPricing,
  getClearanceBundlePricing,
  getFlexiBundlePreviewPricing,
  getClearancePrice,
  getClearanceRequiredOtherStock,
  getFlexiOfferedDiscount,
  getHighestCostStock
} from '../../utils/bundlePricing';
import { formatOfferCountdown, isOfferCheckoutActive } from '../../utils/offerUtils';
import { getStockStandaloneSellPrice } from '../../utils/standalonePricing';
import { getBundleDisplayTotals } from '../../utils/bundleDisplayPricing';
import { getDealDiscountAmount, getDealGrabLabel, getDealSaveUpToLabel } from '../../utils/dealSavings';
import { getStockEta } from '../../utils/stockDates';
import { getNextAvailableDate, toDateKey } from '../../utils/availabilitySchedule';
import { isFlexiBundleDeal, isPerKitClearanceDeal, isWildSaleDeal, isClearanceKitActive, getActiveClearanceKitIds, getClearanceDisplayLabel } from '../../utils/dealTypes';
import { getValidatedOrderStockSet, filterActiveKitStocks } from '../../utils/stockOrderUtils';
import UniversalImage from '../common/UniversalImage';

// Resolves an image ID to its URL from the images array.
// Backward compatible: if the value is already a URL (base64 or http), returns it directly.
function resolveImage(idOrUrl, imagesArray) {
  if (!idOrUrl) return '';
  if (idOrUrl.startsWith('data:') || idOrUrl.startsWith('http')) return idOrUrl;
  const match = (imagesArray || []).find(img => img.id === idOrUrl);
  return match?.url || '';
}

const Gallery = ({ galleryImages, galleryIndex, setGalleryIndex, handleTouchStart, handleTouchEnd, className, thumbnailsContainerRef }) => {
    useEffect(() => {
        if (thumbnailsContainerRef.current) {
            const container = thumbnailsContainerRef.current;
            const activeThumb = container.children[galleryIndex];
            if (activeThumb) {
                const containerWidth = container.offsetWidth;
                const thumbWidth = activeThumb.offsetWidth;
                const scrollLeft = activeThumb.offsetLeft - (containerWidth / 2) + (thumbWidth / 2);
                container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            }
        }
    }, [galleryIndex, thumbnailsContainerRef]);

    return (
        <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} className={`w-full overflow-hidden bg-neutral-100 dark:bg-neutral-900 border-b sm:landscape:border-b-0 sm:landscape:border-r border-black/5 dark:border-white/5 relative group/img flex flex-col items-center justify-center h-[420px] sm:h-[450px] md:h-[550px] md:min-h-[150px] sm:landscape:h-full sm:landscape:w-5/12 sm:landscape:flex-1 shrink-0 isolate ${className || ''}`}>
            {galleryImages[galleryIndex] && (
                <>
                    <UniversalImage src={galleryImages[galleryIndex].url} alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-110" />
                    <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-4 lg:p-6">
                        <UniversalImage
                            src={galleryImages[galleryIndex].url} 
                            alt={galleryImages[galleryIndex].type} 
                            className="max-w-full max-h-full object-contain transition-opacity duration-300 mx-auto" 
                        />
                    </div>
                    <div className="absolute bottom-4 z-20 flex items-center justify-between w-full px-4 gap-2">
                        <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setGalleryIndex(prev =>
                            prev === 0 ? galleryImages.length - 1 : prev - 1
                          );
                        }}
                        disabled={galleryImages.length <= 1}
                        className={`w-11 h-11 flex items-center justify-center rounded-full bg-black/15 backdrop-blur-md border border-white/30 shadow-lg text-white/90 hover:bg-black/25 hover:border-white/50 hover:scale-105 transition-all duration-200 ${galleryImages.length <= 1
                            ? "opacity-30 cursor-not-allowed"
                            : ""}
                        `}
                        >
                          <ChevronLeft size={20} strokeWidth={2.5} />
                        </button>

                        {galleryImages.length > 1 && (
                            <div 
                                ref={thumbnailsContainerRef} 
                                className="absolute left-1/2 h-11 w-[calc(100%-8rem)] -translate-x-1/2 flex justify-center items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth px-0"
                            >
                                {galleryImages.map((img, idx) => (
                                    <button 
                                        key={img.id || idx}
                                        onClick={(e) => { e.stopPropagation(); setGalleryIndex(idx); }}
                                        className={`relative w-11 h-11 rounded-full border-2 transition-all shrink-0 overflow-hidden group/thumb ${galleryIndex === idx ? 'border-transparent bg-gradient-to-br from-blue-500 via-blue-600 to-cyan-400 bg-origin-border shadow-lg z-10 opacity-100' : 'border-white/30 opacity-40 hover:opacity-100 hover:border-white/60'}`}
                                    >
                                        <UniversalImage src={img.url} className="w-full h-full object-cover scale-[1.3]" alt="" />
                                    </button>
                                ))}
                            </div>
                        )}

                        <button 
                            onClick={(e) => { e.stopPropagation(); setGalleryIndex(prev => prev === galleryImages.length - 1 ? 0 : prev + 1); }} 
                            disabled={galleryImages.length <= 1} 
                            className={`w-11 h-11 flex items-center justify-center rounded-full bg-black/15 backdrop-blur-md border border-white/30 shadow-lg text-white/90 hover:bg-black/25 hover:border-white/50 hover:scale-105 transition-all duration-200 ${galleryImages.length <= 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                    <div className="absolute top-4 left-4 z-20 px-3 py-1 rounded-full bg-black/50 text-[9px] font-black uppercase text-white backdrop-blur-md tracking-widest">{galleryImages[galleryIndex].availability} ({galleryIndex + 1}/{galleryImages.length})</div>
                </>
            )}
            <div className="absolute inset-0 z-20 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 pointer-events-none" />
        </div>
    );
};


const SPECTRAL_GRADIENTS = [
  'from-rose-500 to-orange-500',
  'from-orange-500 to-amber-500',
  'from-emerald-500 to-teal-500',
  'from-cyan-500 to-blue-500',
  'from-indigo-500 to-purple-500',
  'from-fuchsia-500 to-pink-500',
  'from-blue-600 to-indigo-600',
  'from-violet-500 to-purple-500'
];

const getSpectralGradient = (id) => {
  if (!id) return SPECTRAL_GRADIENTS[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h << 5) - h + id.charCodeAt(i);
    h |= 0;
  }
  return SPECTRAL_GRADIENTS[Math.abs(h) % SPECTRAL_GRADIENTS.length];
};

function getConditionDetails(stock) {
  const details = [];
  if (stock?.boxCondition) details.push({ label: `BOX: ${stock.boxCondition}`, value: stock.boxCondition });
  if (stock?.kitCondition) {
    const kitLabel = stock.issue 
      ? `KIT: ${stock.kitCondition} - ${stock.issue}` 
      : `KIT: ${stock.kitCondition}`;
    details.push({ label: kitLabel, value: stock.kitCondition });
  }
  if (details.length > 0) return details;
  if (Array.isArray(stock?.condition)) {
    return stock.condition.filter(Boolean).map((value, index) => {
      const label = index === 0 
        ? `BOX: ${value}` 
        : (stock.issue ? `KIT: ${value} - ${stock.issue}` : `KIT: ${value}`);
      return {
        label,
        value
      };
    });
  }
  if (stock?.condition) {
    return [{ label: `BOX: ${stock.condition}`, value: stock.condition }];
  }
  return [];
}

function stockMatchesDealSource(stock, source = 'onhand') {
  const isPreOrder = isPreOrderStock(stock);
  return source === 'preorder' ? isPreOrder : isOnHandStock(stock);
}

function isOnHandStock(stock) {
  const status = String(stock?.status || '').toLowerCase().trim();
  return status === 'onhand' || status === 'on hand';
}

function isPreOrderStock(stock) {
  const status = String(stock?.status || '').toLowerCase();
  return status.includes('pre') || status.includes('batch');
}

function isSupplierRefundPending(stock) {
  return stock?.supplierRefundStatus === 'pending'
    || stock?.reservationType === 'supplier-refund';
}

function hasValidatedFirstReceipt(order) {
  if (!order?.receipt) return false;

  const isReservationOrPartial = ['reservation', 'partial'].includes(String(order.paymentPlan || '').toLowerCase())
    || order.isReservation
    || order.isPartial;

  if (!isReservationOrPartial) return order.status !== 'Validating';

  return order.status !== 'Validating'
    || Boolean(order.balanceReceipt)
    || Number(order.buyerPaid || 0) > 0;
}

function isTerminalOrder(order) {
  const status = String(order?.status || '').trim().toLowerCase();
  return status === 'completed'
    || status === 'complete'
    || status === 'cancelled'
    || status === 'canceled';
}

function findOrderForStock(stock, kitId, orders = []) {
  const orderReference = stock?.order;
  const referenceIds = typeof orderReference === 'object'
    ? [orderReference.orderDocId, orderReference.orderId, orderReference.id]
    : [orderReference];
  const linkedOrder = orders.find((candidate) => referenceIds.some((referenceId) => (
    referenceId
    && (String(candidate?.id || '') === String(referenceId)
      || String(candidate?.orderId || '') === String(referenceId))
  )));
  if (linkedOrder) return linkedOrder;
  if (!stock?.isReserved) return null;

  const matchingOrders = orders.filter((candidate) => {
    const items = Array.isArray(candidate?.items) ? candidate.items : [];
    return items.some((item) => (
      String(item?.id || item?.kitId || item?.productId || '') === String(kitId || '')
      && String(item?.stockKey || item?.selectedStockKey || '') === String(stock?.key || '')
    ));
  });

  // A completed/cancelled order is authoritative when stale duplicate order
  // records reference the same stock. Otherwise, retain the pending-order
  // behavior for an order that still needs validation.
  return matchingOrders.find(isTerminalOrder)
    || matchingOrders.find(order => !hasValidatedFirstReceipt(order))
    || matchingOrders[0]
    || null;
}

function hasOrderAssociation(stock) {
  const orderReference = stock?.order;
  if (!orderReference) return false;
  if (typeof orderReference !== 'object') return Boolean(orderReference);
  return Boolean(
    orderReference.orderId
    || orderReference.orderDocId
    || orderReference.id
    || Object.keys(orderReference).length > 0
  );
}

function isCountableOnhandStock(stock, kitId, orders = []) {
  if (!isOnHandStock(stock)) return false;

  const order = findOrderForStock(stock, kitId, orders);
  if (order || hasOrderAssociation(stock)) return false;
  if (!stock?.isReserved) return true;

  // Reserved stock without an order reference is not public stock.
  return false;
}

function getStockCostPrice(stock) {
  const value = Number(stock?.costPrice);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function getAvailabilityGroupLabel(stock) {
  if (isOnHandStock(stock)) return 'ONHAND';
  const etaMonth = String(getStockEta(stock) || 'TBA').trim().split(/\s+/)[0] || 'TBA';
  return `ETA ${etaMonth}`.toUpperCase();
}

function getAvailabilityGroupKey(prefix, stock) {
  const stockType = isOnHandStock(stock) ? 'onhand' : 'preorder';
  const etaKey = (getStockEta(stock) || 'TBA').toString().trim().toLowerCase().replace(/\s+/g, '-');
  return `${prefix}-${stockType}-${etaKey}`;
}

function isBundlePurchasableStock(stock, source = 'onhand') {
  if (!stock || hasOrderAssociation(stock) || !stockMatchesDealSource(stock, source)) return false;
  return !stock.isReserved || stock.reservationType === 'admin';
}

function includesKitId(ids, kitId) {
  return (ids || []).some(id => String(id) === String(kitId));
}

function getPreferredDealStock(stocks = [], source = 'onhand') {
  const matchingStocks = stocks.filter(stock => stockMatchesDealSource(stock, source));
  const purchasableStocks = matchingStocks.filter(stock => isBundlePurchasableStock(stock, source));
  return getHighestCostStock(purchasableStocks) || getHighestCostStock(matchingStocks) || null;
}

function getClearanceDealPricing(deal, allKits = []) {
  if (!deal || (!isFlexiBundleDeal(deal) && !isPerKitClearanceDeal(deal))) return null;
  // Clearance deals store their canonical eligible-kit list in
  // `clearanceKitIds`; `kitIds` is only the legacy fallback.
  const clearanceKitIds = deal.clearanceKitIds?.length
    ? deal.clearanceKitIds
    : (deal.kitIds || []);
  const activeClearanceKitIds = getActiveClearanceKitIds(deal, clearanceKitIds);
  const includedKits = activeClearanceKitIds
    .map(id => allKits.find(kit => String(kit.id) === String(id)))
    .filter(Boolean);
  const rows = includedKits.map(kit => {
    const stocks = Object.values(kit?.stocks || {});
    const sourceStock = getPreferredDealStock(stocks, 'onhand');
    return {
      kit,
      kitId: kit.id,
      sellPrice: Number(sourceStock?.sellPrice || kit?.sellPrice || 0),
      costPrice: Number(sourceStock?.costPrice || kit?.costPrice || 0)
    };
  });

  const clearanceDiscountOverrides = { ...(deal.clearanceDiscounts || {}) };
  activeClearanceKitIds.forEach((kitId) => {
    const storedClearancePrice = Number(deal.kitDiscounts?.[kitId]?.clearancePrice || 0);
    const row = rows.find((candidate) => String(candidate.kitId) === String(kitId));
    const storedPriceDiscount = row && storedClearancePrice > 0
      ? Math.max(0, row.sellPrice - storedClearancePrice)
      : 0;

    if (storedPriceDiscount > 0) {
      clearanceDiscountOverrides[kitId] = storedPriceDiscount;
      return;
    }

    const configuredDiscount = clearanceDiscountOverrides[kitId];
    if (configuredDiscount !== '' && configuredDiscount !== null && configuredDiscount !== undefined) return;

    const storedDiscount = Number(deal.kitDiscounts?.[kitId]?.discount || 0);
    if (storedDiscount > 0) clearanceDiscountOverrides[kitId] = storedDiscount;
  });

  return isFlexiBundleDeal(deal)
    ? getFlexiBundlePreviewPricing(rows, activeClearanceKitIds, clearanceDiscountOverrides)
    : getClearanceBundlePricing(rows, activeClearanceKitIds, clearanceDiscountOverrides);
}

function getBundleKitPrice(deal, dealKit, allKits = []) {
  if (!deal || !dealKit) return null;
  const includedKits = (deal.kitIds || []).map(id => id === dealKit.id ? dealKit : allKits.find(k => k.id === id)).filter(Boolean);
  if (isFlexiBundleDeal(deal)) {
    const eligibleKitIds = getActiveClearanceKitIds(
      deal,
      deal.clearanceKitIds?.length ? deal.clearanceKitIds : (deal.kitIds || [])
    );
    const configuredSourceIds = eligibleKitIds.filter((kitId) => {
      const configuredDiscount = deal.clearanceDiscounts?.[kitId];
      const storedDiscount = deal.kitDiscounts?.[kitId]?.discount;
      const effectiveDiscount = configuredDiscount !== ''
        && configuredDiscount !== null
        && configuredDiscount !== undefined
        ? configuredDiscount
        : storedDiscount;
      return Number(effectiveDiscount) > 0;
    });
    const sourceKitIds = Array.isArray(deal.flexiSourceKitIds) && deal.flexiSourceKitIds.length > 0
      ? deal.flexiSourceKitIds.map(String)
      : (configuredSourceIds.length > 0 ? configuredSourceIds : eligibleKitIds.slice(0, 1));
    const isSourceKit = sourceKitIds.some(sourceKitId => String(sourceKitId) === String(dealKit.id));
    const stocks = Object.values(dealKit.stocks || {});
    const sourceStock = getPreferredDealStock(stocks, 'onhand');
    const sellPrice = Number(sourceStock?.sellPrice || stocks[0]?.sellPrice || dealKit.sellPrice || 0);
    if (!isSourceKit) return sellPrice;

    const costPrice = Number(sourceStock?.costPrice || stocks[0]?.costPrice || dealKit.costPrice || 0);
    const automaticDiscount = Math.max(0, sellPrice - getClearancePrice(costPrice, sellPrice));
    const offeredDiscount = getFlexiOfferedDiscount(deal, dealKit.id, automaticDiscount);
    return getClearancePrice(costPrice, sellPrice, offeredDiscount);
  }
  if (isPerKitClearanceDeal(deal)) {
    const clearance = getClearanceDealPricing(deal, allKits);
    return clearance.rows.find(row => row.kitId === dealKit.id)?.finalPrice ?? null;
  }
  const rows = includedKits.map(k => {
    const stocks = Object.values(k?.stocks || {});
    const sourceStock = getPreferredDealStock(stocks, deal.stockSource || 'onhand');
    return {
      kit: k,
      kitId: k.id,
      sellPrice: Number(sourceStock?.sellPrice || stocks[0]?.sellPrice || k?.sellPrice || 0),
      costPrice: Number(sourceStock?.costPrice || stocks[0]?.costPrice || 0)
    };
  });
  const normalTotal = rows.reduce((sum, row) => sum + row.sellPrice, 0);
  const discountAmount = Number(
    deal.bundlePrice !== undefined && deal.bundlePrice !== null && deal.bundlePrice !== ''
      ? Math.max(0, normalTotal - Number(deal.bundlePrice || 0))
      : (deal.discountAmount ?? 0)
  ) || 0;
  const pricedRows = getBundleDealPricing(rows, discountAmount).rows;
  const target = pricedRows.find(row => row.kit.id === dealKit.id);

  return target ? target.finalPrice : null;
}

function getConfiguredClearanceDiscount(deal, kitId, allKits = []) {
  if (!deal || (!isFlexiBundleDeal(deal) && !isPerKitClearanceDeal(deal))) return 0;
  const pricing = getClearanceDealPricing(deal, allKits);
  const row = pricing?.rows?.find(candidate => String(candidate.kitId) === String(kitId));
  if (row) return Math.max(0, Math.round(Number(row.clearanceDiscount || row.discount || 0)));

  const override = deal.clearanceDiscounts?.[kitId];
  return override !== '' && override !== null && override !== undefined
    ? Math.max(0, Math.round(Number(override) || 0))
    : 0;
}

function parseDealDate(value) {
  if (!value) return null;
  const [datePart, timePart = '00:00'] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  if (![year, month, day, hours, minutes].every(Number.isFinite)) return null;
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function getDealCountdownLabel(validUntil) {
  const endDate = parseDealDate(validUntil);
  if (!endDate) return 'NO END DATE';
  const diffMs = endDate.getTime() - Date.now();
  if (diffMs <= 0) return 'EXPIRED';
  if (diffMs <= 86400000) return 'LAST DAY';
  const diffDays = Math.ceil(diffMs / 86400000);
  return `${diffDays} ${diffDays === 1 ? 'DAY' : 'DAYS'} LEFT`;
}

function getWildSaleCountdownLabel(deal, kitId, now = Date.now()) {
  const schedule = deal?.clearanceKitSchedules?.[String(kitId)] || deal?.clearanceKitSchedules?.[kitId];
  const endDate = parseDealDate(schedule?.validUntil);
  if (!endDate) return 'NO END DATE';
  const distance = endDate.getTime() - now;
  if (distance <= 0) return 'EXPIRED';
  const totalSeconds = Math.ceil(distance / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours > 0 ? `${hours}H ` : ''}${String(minutes).padStart(2, '0')}M ${String(seconds).padStart(2, '0')}S LEFT`;
}

const GRADIENT_COLORS = {
  'from-rose-500 to-orange-500': 'rgba(244, 63, 94, 0.2)',
  'from-orange-500 to-amber-500': 'rgba(249, 115, 22, 0.2)',
  'from-emerald-500 to-teal-500': 'rgba(16, 185, 129, 0.2)',
  'from-cyan-500 to-blue-500': 'rgba(6, 182, 212, 0.2)',
  'from-indigo-500 to-purple-500': 'rgba(99, 102, 241, 0.2)',
  'from-fuchsia-500 to-pink-500': 'rgba(217, 70, 239, 0.2)',
  'from-blue-600 to-indigo-600': 'rgba(37, 99, 235, 0.2)',
  'from-violet-500 to-purple-500': 'rgba(139, 92, 246, 0.2)'
};

const getShadowColor = (gradientClass) => GRADIENT_COLORS[gradientClass] || 'rgba(8,102,255,0.2)';

export default function ProductCard({ kit: cardKit, onBuyNowClick, onDealCheckout, onEdit, onClick, routeKitId, onEditDeal, isAdminLimitedTimeOffer = false, homeZapAction, homePreview = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDarkMode, isSpectralMode } = useTheme();
  const spectralGradient = useMemo(() => getSpectralGradient(cardKit?.id), [cardKit?.id]);
  const shadowColor = useMemo(() => getShadowColor(spectralGradient), [spectralGradient]);

  
  const [isModalOpen, setIsProfileOpen] = useState(false);
  const [modalKit, setModalKit] = useState(cardKit);
  const [modalKitHistory, setModalKitHistory] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [selectedGroupLabel, setSelectedGroupLabel] = useState(null);
  const [targetPrice, setTargetPrice] = useState("");
  const [timeLeft, setTimeLeft] = useState("");
  const [now, setNow] = useState(0);

  const { 
    addToBasket, removeFromBasket, isAdmin, 
    isAdminView, shelf, deals, kits: allKits, userOffers,
    orders, subscribeOrders, setPendingBasketItem, setLoginModalOpen, user,
    huntKit,
    shippingSettings,
    setToastMessage
  } = useStore();

  useEffect(() => {
    if (!isAdmin || !isAdminView) return undefined;
    return subscribeOrders({ isAdminMode: true });
  }, [isAdmin, isAdminView, subscribeOrders]);

  const validatedOrderStockData = useMemo(() => {
    return getValidatedOrderStockSet(orders);
  }, [orders]);

  const rawKit = isModalOpen ? (modalKit || cardKit) : cardKit;
  const kit = useMemo(() => {
    if (!rawKit) return null;
    if (!rawKit.stocks) return rawKit;
    return {
      ...rawKit,
      stocks: filterActiveKitStocks(rawKit.stocks, rawKit.id, validatedOrderStockData)
    };
  }, [rawKit, validatedOrderStockData]);

  const kitId = kit?.id;

  const handleDealCheckout = (deal, targetKitId) => {
    if (typeof onDealCheckout === 'function') {
      setIsProfileOpen(false);
      setSelectedStock(null);
      setSelectedGroupLabel(null);
      onDealCheckout(deal, targetKitId || kitId);
      return;
    }

    if (!deal || !deal.kitIds || deal.type === 'mutually_exclusive') return;
    const bundleKits = (allKits || []).filter(k => deal.kitIds.includes(k.id));
    const normalTotal = bundleKits.reduce((sum, k) => {
      const stocks = Object.values(filterActiveKitStocks(k.stocks, k.id, validatedOrderStockData));
      const sourceStock = getPreferredDealStock(stocks, deal.stockSource || 'onhand');
      return sum + (sourceStock?.sellPrice || stocks[0]?.sellPrice || k.sellPrice || 0);
    }, 0);

    const kitPrices = bundleKits.map((bundleKit) => {
      const stocks = Object.values(filterActiveKitStocks(bundleKit?.stocks, bundleKit?.id, validatedOrderStockData));
      const sourceStock = getPreferredDealStock(stocks, deal.stockSource || 'onhand');
      const availableStock = sourceStock;
      const refPrice = Number(sourceStock?.sellPrice || stocks[0]?.sellPrice || bundleKit?.sellPrice || 0);
      return {
        kit: bundleKit,
        kitId: bundleKit.id,
        sellPrice: refPrice,
        refPrice,
        costPrice: Number(sourceStock?.costPrice || stocks[0]?.costPrice || 0),
        availableStock
      };
    });

    const discountAmount = Number(deal.discountAmount ?? Math.max(0, normalTotal - Number(deal.bundlePrice || 0))) || 0;
    const pricedRows = getBundleDealPricing(kitPrices, discountAmount).rows;

    const bundleSize = pricedRows.length;
    const items = pricedRows.map(({ kit: itemKit, finalPrice, availableStock, refPrice }) => {
      return {
        ...itemKit,
        name: itemKit?.name,
        isBundleItem: true,
        bundleId: deal.id,
        bundleName: deal.name || 'Bundle Deal',
        bundleSize,
        bundleFeeShare: 0,
        bundleReferencePrice: refPrice,
        allowShelfBundle: true,
        stockKey: availableStock?.key || 'default',
        price: finalPrice,
        appliedHandlingFee: 0,
        appliedInstallmentFee: 0,
        appliedTransferFee: 0
      };
    });

    if (!user) { setLoginModalOpen(true); return; }
    navigate('/checkout', { state: { items, isGuestPreview: false } });
  };

  const handleEditSelectedDeal = () => {
    const deal = selectedBundleDealDetails?.deal;
    if (!deal || typeof onEditDeal !== 'function') return;
    closeProductModal();
    onEditDeal(deal);
  };

  const paymentSettings = shippingSettings?.paymentSettings;
  const { handlingFee, installmentFee, transferFee } = useMemo(() => {
    return getCheckoutPaymentFees({ paymentSettings });
  }, [paymentSettings]);

  const stockList = useMemo(() => {
    // Supplier-cancelled/refund-pending stocks remain in Firestore so they
    // can be settled or reversed from Supplier Balances, but they are not
    // active catalog inventory and must never feed ProductCard pricing,
    // availability, conditions, or cart fallbacks.
    return kit?.stocks
      ? Object.entries(kit.stocks)
        .filter(([, val]) => !isSupplierRefundPending(val))
        .map(([key, val]) => ({ key, ...val }))
      : [];
  }, [kit]);

  useEffect(() => {
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);

      if (isAdmin) {
        setTimeLeft("");
        return;
      }
      
      const firstRelease = stockList.find(s => {
        if (!s.publicReleaseDate) return false;
        if (hasOrderAssociation(s) || s.isReserved || isSupplierRefundPending(s)) return false;
        const releaseTime = new Date(s.publicReleaseDate).getTime();
        return releaseTime > current;
      });
      
      if (!firstRelease) {
        setTimeLeft("");
        return;
      }

      const releaseTime = new Date(firstRelease.publicReleaseDate).getTime();
      const distance = releaseTime - current;

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      setTimeLeft(`${days > 0 ? `${days}D ` : ''}${hours}H ${minutes}M ${seconds}S`);
    }, 1000);

    return () => clearInterval(timer);
  }, [stockList, isAdmin]);

  const isPendingRelease = timeLeft !== "";

  const getPublicStatus = useCallback((stock) => {
    // Admins are eligible for early access even while viewing the public
    // catalog, so release dates must not hide their stocks or show a timer.
    if (isAdmin) return { isPublic: true };
    if (!stock?.publicReleaseDate) return { isPublic: true };
    const releaseTime = new Date(stock.publicReleaseDate).getTime();
    return { isPublic: now >= releaseTime, releaseTime };
  }, [isAdmin, now]);

  const productPath = kitId ? `/kits/${encodeURIComponent(kitId)}` : '/kits';
  const isRouteSelectedProduct = !!kitId && routeKitId === kitId;

  const publicReleasableStocks = useMemo(() => {
    return stockList.filter(s => {
      if (isSupplierRefundPending(s)) return false;
      const isSold = hasOrderAssociation(s);
      const isReserved = !!(s.isReserved);
      const isOnShelf = (shelf || []).some(item => item.id === kitId && item.stockKey === s.key);
      
      // Admins can inspect early-access and reserved inventory from the
      // public catalog as well. Keep shelf-held stock out of availability so
      // collection remains the source for those items in admin view.
      if (isAdmin && isAdminView) {
        return !isSold && !isOnShelf;
      }
      return !isSold && !isReserved && !isOnShelf;
    });
  }, [stockList, shelf, kitId, isAdmin, isAdminView]);

  const pendingOrderReservationCount = useMemo(() => {
    if (!isAdmin || !isAdminView) return 0;

    return stockList.filter((stock) => {
      if (!stock?.isReserved && !hasOrderAssociation(stock)) return false;
      const order = findOrderForStock(stock, kitId, orders);
      return Boolean(order && !isTerminalOrder(order) && !hasValidatedFirstReceipt(order));
    }).length;
  }, [isAdmin, isAdminView, kitId, orders, stockList]);

  const acceptedOffer = useMemo(() => {
    if (isAdminView || !user?.uid || !kitId) return null;
    return (userOffers || []).find((offer) => (
      offer?.uid === user.uid
      && offer?.kitId === kitId
      && offer?.status === 'released'
      && isOfferCheckoutActive(offer, now || Date.now())
      && offer?.releasedStockKey
    )) || null;
  }, [isAdminView, kitId, now, user?.uid, userOffers]);

  const acceptedOfferStock = useMemo(() => {
    if (!acceptedOffer?.releasedStockKey) return null;
    const stock = stockList.find(item => item.key === acceptedOffer.releasedStockKey);
    if (!stock || hasOrderAssociation(stock)) return null;
    return stock;
  }, [acceptedOffer, stockList]);

  const acceptedOfferPrice = Number(acceptedOffer?.targetPrice || 0);
  const offerCountdown = acceptedOffer && now > 0
    ? formatOfferCountdown(acceptedOffer.offerExpiresAt, now)
    : '';

  const hasReserved = useMemo(() => {
    return stockList.some(s => s.isReserved && !hasOrderAssociation(s) && !isSupplierRefundPending(s));
  }, [stockList]);

  const visibleStocks = useMemo(() => {
    return publicReleasableStocks
      .filter(s => getPublicStatus(s).isPublic)
      // Customer orders consume the highest-cost stock first. Keep the same
      // order in the public picker so the preview and checkout agree.
      .sort((a, b) => (
        getStockCostPrice(b) - getStockCostPrice(a)
        || Number(b.sellPrice || 0) - Number(a.sellPrice || 0)
      ));
  }, [publicReleasableStocks, getPublicStatus]);

  const groupedVariants = useMemo(() => {
    const groups = {};
    const monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    
    const parseEta = (eta) => {
        if (!eta || eta === 'TBA') return new Date(9999, 0, 1);
        const parts = eta.split(' ');
        if (parts.length !== 2) return new Date(9999, 0, 1);
        const [month, year] = parts;
        return new Date(parseInt(year), monthMap[month.toLowerCase()] || 0, 1);
    }

    publicReleasableStocks.forEach(s => {
      const isOnHand = isOnHandStock(s);
      const label = getAvailabilityGroupLabel(s);
      const key = getAvailabilityGroupKey('availability', s);
      
      if (!groups[key]) {
        groups[key] = { key, label, items: [], isOnHand, eta: getStockEta(s), tag: 'availability' };
      }
      groups[key].items.push(s);
    });

    Object.values(groups).forEach(group => {
      group.items.sort((a, b) => (
        getStockCostPrice(b) - getStockCostPrice(a)
        || Number(b.sellPrice || 0) - Number(a.sellPrice || 0)
      ));
    });
    
    return Object.values(groups).sort((a, b) => {
      if (a.isOnHand && !b.isOnHand) return -1;
      if (!a.isOnHand && b.isOnHand) return 1;
      // If both are onhand, or both have ETAs, sort by ETA
      return parseEta(a.eta) - parseEta(b.eta);
    });
  }, [publicReleasableStocks]);

  const availableCount = useMemo(() => {
    return visibleStocks.length;
  }, [visibleStocks]);

  const availabilityCounts = useMemo(() => ({
    // Count all releasable stock, not just the currently public subset. This
    // keeps pre-order totals independent of ETA/release timing and free-shipping flags.
    onhand: publicReleasableStocks.filter(stock => isCountableOnhandStock(stock, kitId, orders)).length,
    preorder: publicReleasableStocks.filter(isPreOrderStock).length
  }), [kitId, orders, publicReleasableStocks]);
  
  const sellPrice = useMemo(() => {
    const available = visibleStocks.filter(s => !s.isReserved && !hasOrderAssociation(s));
    let base = 0;
    if (available.length > 0) {
      const prices = available.map(s => Number(s.sellPrice || 0)).filter(p => p > 0);
      if (prices.length > 0) base = Math.min(...prices); 
    } else if (stockList.length > 0) {
      const allPrices = stockList.filter(s => !isSupplierRefundPending(s)).map(s => Number(s.sellPrice || 0)).filter(p => p > 0);
      if (allPrices.length > 0) base = Math.min(...allPrices); 
    } else {
      base = kit?.sellPrice || 0;
    }
    return base || kit?.sellPrice || 0;
  }, [kit, visibleStocks, stockList]);

  const { displayPrice } = useMemo(() => {
    const base = Number(sellPrice || 0);
    const hFee = handlingFee;
    const iFee = installmentFee;
    const tFee = transferFee;
    
    return {
      displayPrice: base + hFee + iFee + tFee
    };
  }, [sellPrice, handlingFee, installmentFee, transferFee]);

  const priceDisplayStock = useMemo(() => (
    selectedStock
      || visibleStocks.find(stock => isOnHandStock(stock))
      || visibleStocks.find(stock => isPreOrderStock(stock))
      || null
  ), [selectedStock, visibleStocks]);
  const cardSellPrice = Number(priceDisplayStock?.sellPrice || sellPrice || 0);
  const cardIsPreOrder = isPreOrderStock(priceDisplayStock);
  const cardReferencePrice = cardIsPreOrder
    ? cardSellPrice
    : cardSellPrice;

  const shelfItem = useMemo(() => {
    // Find if the current kit is reserved by any admin on the shared shelf
    return (shelf || []).find(item => item.id === kitId);
  }, [shelf, kitId]);

  const highestCostShelfItem = useMemo(() => {
    const kitShelfItems = (shelf || [])
      .filter(item => String(item.id) === String(kitId))
      .map(item => ({
        ...item,
        costPrice: getStockCostPrice(stockList.find(stock => String(stock.key) === String(item.stockKey)) || item)
      }));
    return kitShelfItems.sort((a, b) => (
      getStockCostPrice(b) - getStockCostPrice(a)
      || String(b.stockKey || '').localeCompare(String(a.stockKey || ''))
    ))[0] || null;
  }, [shelf, kitId, stockList]);

  const shelfCount = useMemo(() => {
    return (shelf || []).filter(item => item.id === kitId).length;
  }, [shelf, kitId]);

  // True when all remaining unsold stocks are on the admin shelf (collection)
  const isCollectionOnly = useMemo(() => {
    if (availableCount > 0) return false;
    const unsoldStocks = stockList.filter(s => !hasOrderAssociation(s) && !isSupplierRefundPending(s));
    if (unsoldStocks.length === 0) return false;
    return shelfCount > 0 && shelfCount >= unsoldStocks.length;
  }, [availableCount, stockList, shelfCount]);

  // Shelf stocks for display in collection mode (read-only, no buy action)
  const collectionStocks = useMemo(() => {
    if (!isCollectionOnly && !(isAdmin && isAdminView)) return [];
    const shelfKeys = new Set((shelf || []).filter(item => item.id === kitId).map(item => item.stockKey));
    return stockList.filter(s => shelfKeys.has(s.key) && !hasOrderAssociation(s) && !isSupplierRefundPending(s));
  }, [isCollectionOnly, isAdmin, isAdminView, shelf, kitId, stockList]);

  const collectionGroupedVariants = useMemo(() => {
    if ((!isCollectionOnly && !(isAdmin && isAdminView)) || collectionStocks.length === 0) return [];
    const groups = {};
    collectionStocks.forEach(s => {
      const isOnHand = isOnHandStock(s);
      const label = getAvailabilityGroupLabel(s);
      const key = getAvailabilityGroupKey('collection', s);
      if (!groups[key]) groups[key] = { key, label, items: [], isOnHand, eta: getStockEta(s), tag: 'collection' };
      groups[key].items.push(s);
    });
    return Object.values(groups).sort((a, b) => {
      if (a.isOnHand && !b.isOnHand) return -1;
      if (!a.isOnHand && b.isOnHand) return 1;
      return String(a.eta || '').localeCompare(String(b.eta || ''));
    });
  }, [isCollectionOnly, isAdmin, isAdminView, collectionStocks]);

  const bundleOnlyDeals = useMemo(() => {
    if (!kitId || !Array.isArray(deals)) return [];
    return deals.filter(deal => {
      const isClearanceDeal = isFlexiBundleDeal(deal) || isPerKitClearanceDeal(deal);
      const isBundleDeal = deal?.type === 'bundle_only' || deal?.type === 'bundle_discount' || isClearanceDeal;
      const dealKitIds = isClearanceDeal && deal.clearanceKitIds?.length
        ? deal.clearanceKitIds
        : (deal.kitIds || []);
      if (!isBundleDeal || !includesKitId(dealKitIds, kitId)) return false;
      if (!isClearanceDeal) {
        const validUntil = parseDealDate(deal.validUntil);
        if (validUntil && validUntil.getTime() <= now) return false;
        return dealKitIds.every(dealKitId => {
          const dealKit = String(dealKitId) === String(kitId) ? kit : (allKits || []).find(k => String(k.id) === String(dealKitId));
          const stockSource = deal.stockSource || 'onhand';
          const stocks = Object.values(filterActiveKitStocks(dealKit?.stocks, dealKit?.id, validatedOrderStockData));
          return stocks.some(stock => (
            !hasOrderAssociation(stock)
            && !stock.isReserved
            && stockMatchesDealSource(stock, stockSource)
          ));
        });
      }
      // Clearance entries are evaluated per kit. A kit remains eligible only
      // while its own active schedule and stock can be fulfilled.
      const canUseClearanceStock = (stock, source) => (
        !hasOrderAssociation(stock)
        && !stock.isReserved
        && stockMatchesDealSource(stock, source)
      );
      // Clearance is on-hand only. Pre-order clearance would reserve stock
      // against a deal while still requiring future logistics fulfillment.
      const stockSource = 'onhand';
      if (!isClearanceKitActive(deal, kitId, now)) return false;
      return Object.values(kit?.stocks || {}).some(stock => canUseClearanceStock(stock, stockSource));
    });
  }, [allKits, deals, kitId, kit, now, validatedOrderStockData]);

  const bundleDealDetails = useMemo(() => {
    return bundleOnlyDeals.map(deal => {
      const isClearanceDeal = isFlexiBundleDeal(deal) || isPerKitClearanceDeal(deal);
      const orderedKitIds = isClearanceDeal
        ? [kitId]
        : [
            kitId,
            ...(deal.previewKitIds || []),
            ...(deal.kitIds || []).filter(id => !(deal.previewKitIds || []).includes(id))
          ].filter((id, index, ids) => id && ids.indexOf(id) === index);
      const includedKits = orderedKitIds.map(id => id === kitId ? kit : (allKits || []).find(k => k.id === id)).filter(Boolean);
      const currentStockSource = isClearanceDeal ? 'onhand' : (deal.stockSource || 'onhand');
      const currentKitStock = stockList.find(stock => isBundlePurchasableStock(stock, currentStockSource)) || null;
      const currentItemPrice = getBundleKitPrice(deal, kit, allKits);
      const bundlePrice = Number(deal.bundlePrice ?? Math.max(0, Number(deal.totalSell || 0) - Number(deal.discountAmount || 0)));
      return {
        deal,
        includedKits,
        currentKitStock,
        currentItemPrice,
        bundlePrice,
        isClearance: isClearanceDeal,
        displayName: isClearanceDeal
          ? getClearanceDisplayLabel(deal)
          : deal.name
      };
    }).filter(detail => Number.isFinite(Number(detail.currentItemPrice)) && Number(detail.currentItemPrice) > 0);
  }, [bundleOnlyDeals, allKits, kitId, kit, stockList]);

  const bundleDealGroups = useMemo(() => {
    if (bundleDealDetails.length === 0) return [];
    // Wild Deal is applied automatically when an eligible on-hand stock is
    // selected, so it does not need a separate selectable deal item.
    return bundleDealDetails
      .filter(detail => !isWildSaleDeal(detail.deal))
      .map(detail => ({
      key: `bundle-deal-${detail.deal.id}`,
      label: detail.isClearance ? getClearanceDisplayLabel(detail.deal) : 'BUNDLE DEAL',
      items: [detail.currentKitStock || { ...detail.deal, status: 'bundle_deal', sellPrice: detail.currentItemPrice }],
      isOnHand: true,
      tag: 'bundleDeal',
      isClearanceDeal: detail.isClearance,
      deal: detail.deal,
      dealDetails: detail
      }));
  }, [bundleDealDetails]);

  const acceptedOfferGroup = useMemo(() => {
    if (!acceptedOffer || !acceptedOfferStock) return null;
    return {
      key: `accepted-offer-${acceptedOffer.id}`,
      label: getAvailabilityGroupLabel(acceptedOfferStock),
      items: [acceptedOfferStock],
      isOnHand: isOnHandStock(acceptedOfferStock),
      eta: getStockEta(acceptedOfferStock),
      tag: 'acceptedOffer',
      offer: acceptedOffer
    };
  }, [acceptedOffer, acceptedOfferStock]);

  const availabilityGroups = useMemo(() => {
    const baseStockGroups = isAdmin && isAdminView
      ? groupedVariants
      : (isCollectionOnly ? collectionGroupedVariants : groupedVariants);
    const stockGroups = acceptedOfferStock
      ? baseStockGroups
        .map(group => ({
          ...group,
          items: group.items.filter(item => item.key !== acceptedOfferStock.key)
        }))
        .filter(group => group.items.length > 0)
      : baseStockGroups;
    return [...(acceptedOfferGroup ? [acceptedOfferGroup] : []), ...stockGroups, ...bundleDealGroups];
  }, [acceptedOfferGroup, acceptedOfferStock, isAdmin, isAdminView, groupedVariants, collectionGroupedVariants, isCollectionOnly, bundleDealGroups]);
  const visibleAvailabilityGroups = useMemo(() => {
    return availabilityGroups.filter(group => group.tag !== 'bundleDeal');
  }, [availabilityGroups]);

  const selectableAvailabilityGroups = useMemo(() => {
    const groups = isAdmin && isAdminView
      ? [...availabilityGroups, ...collectionGroupedVariants]
      : availabilityGroups;

    // Deals are customer-facing purchase options. Admin pricing is based on
    // the selected availability/collection group, so keep deal groups out of
    // the admin selector entirely.
    return isAdmin && isAdminView
      ? groups.filter(group => group.tag !== 'bundleDeal')
      : groups;
  }, [isAdmin, isAdminView, availabilityGroups, collectionGroupedVariants]);

  const selectedAvailabilityGroup = useMemo(() => {
    return selectableAvailabilityGroups.find(group => group.key === selectedGroupLabel) || null;
  }, [selectableAvailabilityGroups, selectedGroupLabel]);

  const adminSelectedGroupCost = useMemo(() => {
    if (!(isAdmin && isAdminView)) return null;

    const group = selectedAvailabilityGroup;
    const costs = (group?.items || [])
      .map(item => getStockCostPrice(item))
      .filter(price => Number.isFinite(price) && price > 0);

    return costs.length > 0 ? Math.min(...costs) : null;
  }, [isAdmin, isAdminView, selectedAvailabilityGroup]);

  const availabilityHeaderGroup = selectedAvailabilityGroup?.tag === 'bundleDeal'
    ? visibleAvailabilityGroups[0]
    : (selectedAvailabilityGroup || visibleAvailabilityGroups[0]);
  const AvailabilityHeaderIcon = availabilityHeaderGroup?.isOnHand ? Bike : Plane;

  const isSelectedCollectionGroup = ['collection', 'acceptedOffer'].includes(selectedAvailabilityGroup?.tag);
  const selectedBundleDealDetails = selectedAvailabilityGroup?.dealDetails || null;
  const conditionDetailsStock = selectedBundleDealDetails?.currentKitStock || selectedStock;
  const isClearanceDeal = bundleDealDetails.some(detail => detail.isClearance);
  const isWildSale = bundleDealDetails.some(detail => isWildSaleDeal(detail.deal));
  const activeWildSaleDetail = bundleDealDetails
    .filter(detail => isWildSaleDeal(detail.deal))
    .sort((a, b) => Number(a.currentItemPrice || 0) - Number(b.currentItemPrice || 0))[0] || null;
  const nonWildSaleDealDetails = bundleDealDetails.filter(detail => !isWildSaleDeal(detail.deal));
  const wildSalePrice = bundleDealDetails
    .filter(detail => isWildSaleDeal(detail.deal))
    .map(detail => Number(detail.currentItemPrice || 0))
    .filter(price => price > 0)
    .reduce((lowestPrice, price) => Math.min(lowestPrice, price), Number.POSITIVE_INFINITY);
  const isWildSalePriceApplied = isWildSale
    && Number.isFinite(wildSalePrice)
    && wildSalePrice < cardSellPrice;
  const isIncludedInBundleDeal = bundleOnlyDeals.some(deal => !isFlexiBundleDeal(deal) && !isPerKitClearanceDeal(deal));
  const clearanceDisplayLabel = getClearanceDisplayLabel(
    selectedBundleDealDetails?.deal || bundleDealDetails.find(detail => detail.isClearance)?.deal
  );

  const isEarlyAccess = useMemo(() => {
    if (isAdmin) return false;
    return stockList.some(s => s.publicReleaseDate && new Date(s.publicReleaseDate).getTime() > now);
  }, [isAdmin, stockList, now]);

  const isFSEligible = useMemo(() => {
    return visibleStocks.some(s => {
      if (!s.isFreeShippingEligible || s.isReserved || hasOrderAssociation(s)) return false;
      if (!s.freeShippingMethod || s.freeShippingMethod === 'All') return false;
      const expiry = s.freeShippingUntil ? new Date(s.freeShippingUntil).getTime() : 0;
      return expiry === 0 || now < expiry;
    });
  }, [visibleStocks, now]);

  const nextShippingDate = useMemo(() => (
    getNextAvailableDate(
      shippingSettings?.availabilitySchedule,
      'shipping',
      now ? new Date(now) : new Date()
    )
  ), [shippingSettings?.availabilitySchedule, now]);

  const nextShippingDateLabel = nextShippingDate
    ? nextShippingDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
    : '';
  const shippingDateReference = now ? new Date(now) : new Date();
  const canShipToday = Boolean(
    nextShippingDate
    && toDateKey(nextShippingDate) === toDateKey(shippingDateReference)
  );
  const selectedFreeShippingActive = Boolean(
    selectedStock?.isFreeShippingEligible
    && selectedStock?.freeShippingMethod
    && selectedStock.freeShippingMethod !== 'All'
    && (!selectedStock.freeShippingUntil || shippingDateReference.getTime() < new Date(selectedStock.freeShippingUntil).getTime())
  );
  const showShippingStatusBanner = Boolean(
    selectedStock
    && (
      (isOnHandStock(selectedStock) && nextShippingDateLabel)
      || (isPreOrderStock(selectedStock) && !selectedFreeShippingActive)
    )
  );
  const showPreOrderFreeShippingBanner = Boolean(
    selectedStock
    && isPreOrderStock(selectedStock)
    && selectedFreeShippingActive
  );

  const line = kit?.specs?.line || '';
  const scale = kit?.specs?.scale || '';
  const metaTags = [
    kit.brand?.toLowerCase() === 'premium bandai' ? 'PBANDAI' : (kit.brand || 'BANDAI'),
    line,
    scale,
    kit.series || 'Custom Series'
  ].filter(Boolean);

  const adminDisplayInfo = useMemo(() => {
    if (!isAdminView) return null;

    const unsoldStocks = stockList.filter(s => !hasOrderAssociation(s) && !isSupplierRefundPending(s));
    if (unsoldStocks.length === 0) return null;

    const shelfEntries = (shelf || []).filter(item => (
      String(item?.id || '') === String(kitId || '')
      && item?.stockKey
    ));
    const shelfStockKeys = new Set(shelfEntries.map(entry => String(entry.stockKey)));

    // Admin-held stocks are still marked reserved on the kit document. They
    // are intentionally excluded from the customer-facing stock list, but
    // they are the primary price source for Collection cards in admin view.
    // Include both the explicit shelf rows and the reservation marker so the
    // card remains correct while the shelf listener is catching up (and for
    // legacy admin reservations that have no shelf document).
    const adminShelfStocks = unsoldStocks.filter(stock => (
      shelfStockKeys.has(String(stock.key))
      || (stock.isReserved && stock.reservationType === 'admin')
    ));
    const allocatableOnhandStocks = unsoldStocks.filter(stock => (
      isOnHandStock(stock)
      && !shelfStockKeys.has(String(stock.key))
      && !stock.isReserved
    ));
    const adminShelfCosts = adminShelfStocks
      .map(stock => getStockCostPrice(stock))
      .filter(price => Number.isFinite(price) && price > 0);
    const allocatableCosts = allocatableOnhandStocks
      .map(stock => getStockCostPrice(stock))
      .filter(price => Number.isFinite(price) && price > 0);
    const allocatableStockCosts = unsoldStocks
      .filter(stock => !stock.isReserved)
      .map(stock => getStockCostPrice(stock))
      .filter(price => Number.isFinite(price) && price > 0);
    const shelfEntryCosts = shelfEntries
      .map(entry => Number(entry?.costPrice || 0))
      .filter(price => Number.isFinite(price) && price > 0);
    const cost = adminShelfCosts.length > 0
      ? Math.min(...adminShelfCosts)
      : allocatableCosts.length > 0
        ? Math.min(...allocatableCosts)
        : allocatableStockCosts.length > 0
          ? Math.min(...allocatableStockCosts)
          : shelfEntryCosts.length > 0
            ? Math.min(...shelfEntryCosts)
            : Number(kit?.costPrice || 0);
    const availableSellPrices = unsoldStocks
      .filter(stock => (
        adminShelfStocks.includes(stock)
        || !stock.isReserved
      ))
      .map(stock => Number(stock.sellPrice || 0))
      .filter(price => Number.isFinite(price) && price > 0);
    const sell = Math.max(...availableSellPrices, Number(kit?.sellPrice || 0), 0);

    return { cost, sell };
  }, [stockList, isAdminView, shelf, kit, kitId]);

  const adminDisplayedCost = isAdmin && isAdminView
    ? (adminSelectedGroupCost ?? adminDisplayInfo?.cost ?? 0)
    : 0;

  const handleSelectGroup = useCallback((group) => {
    setSelectedGroupLabel(group.key || group.label);
    setSelectedStock(group.items[0]);
    setTargetPrice("");
  }, []);

  useEffect(() => {
    if (!isModalOpen) return undefined;

    const scrollY = window.scrollY;
    const previousStyles = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      height: document.body.style.height
    };

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.height = '100vh';

    return () => {
      document.body.style.overflow = previousStyles.overflow;
      document.body.style.position = previousStyles.position;
      document.body.style.top = previousStyles.top;
      document.body.style.width = previousStyles.width;
      document.body.style.height = previousStyles.height;
      window.scrollTo(0, scrollY);
    };
  }, [isModalOpen]);

  useEffect(() => {
    if (!homePreview) return undefined;

    window.dispatchEvent(new CustomEvent('highlightModalStateChange', {
      detail: { open: isModalOpen }
    }));

    return () => {
      window.dispatchEvent(new CustomEvent('highlightModalStateChange', {
        detail: { open: false }
      }));
    };
  }, [homePreview, isModalOpen]);

  const galleryImages = useMemo(() => {
    // Resolve master grid image (may be an ID or legacy base64 URL)
    const resolvedGridUrl = resolveImage(kit?.image, kit?.images);
    const images = [{ id: 'grid', url: resolvedGridUrl, type: 'PROMO IMAGE' }];
    if (selectedStock) {
        const resolvedBoxUrl = resolveImage(selectedStock.boxImage, selectedStock.stockImages);
        const resolvedKitUrl = resolveImage(selectedStock.kitImage, selectedStock.stockImages);
        if (resolvedBoxUrl) images.push({ id: 'box', url: resolvedBoxUrl, type: 'BOX CONDITION' });
        if (resolvedKitUrl) images.push({ id: 'kit', url: resolvedKitUrl, type: 'KIT CONDITION' });
        if (selectedStock.stockImages) {
            selectedStock.stockImages.forEach(img => images.push(img));
        }
    }
    if (kit?.images) {
        kit.images.forEach(img => {
            if (!images.find(i => i.url === img.url)) images.push(img);
        });
    }
    return images;
  }, [kit, selectedStock]);

  const [galleryIndex, setGalleryIndex] = useState(0);
  const touchStartX = React.useRef(0);
  const lastManualActionTime = React.useRef(null);
  const thumbnailsContainerRef = React.useRef(null);
  const modalHistoryOwnerRef = React.useRef(false);

  const resetProductModalState = useCallback(() => {
    setIsProfileOpen(false);
    setModalKit(cardKit);
    setModalKitHistory([]);
    setSelectedStock(null);
    setSelectedGroupLabel(null);
  }, [cardKit]);

  const openProductModalView = useCallback(() => {
    setToastMessage(null);
    setModalKit(cardKit);
    setModalKitHistory([]);
    setGalleryIndex(0);
    lastManualActionTime.current = Date.now();
    if (acceptedOfferGroup) {
        handleSelectGroup(acceptedOfferGroup);
    } else if (selectableAvailabilityGroups.length > 0) {
        handleSelectGroup(selectableAvailabilityGroups[0]);
    }
    setIsProfileOpen(true);
  }, [acceptedOfferGroup, cardKit, handleSelectGroup, selectableAvailabilityGroups, setToastMessage]);

  const handleOpenIncludedKit = useCallback((includedKit, event) => {
    event?.stopPropagation();
    if (!includedKit || includedKit.id === kitId) return;
    setModalKitHistory(prev => [...prev, kit]);
    setModalKit(includedKit);
    setSelectedStock(null);
    setSelectedGroupLabel(null);
    setTargetPrice("");
    setGalleryIndex(0);
    lastManualActionTime.current = Date.now();
    if (includedKit.id) {
      // Keep React Router in sync with the address bar so Kits can select and
      // render the included kit's own ProductCard.
      navigate(`/kits/${encodeURIComponent(includedKit.id)}`, {
        state: {
          modal: 'product',
          kitId: includedKit.id,
          productModalParentId: kitId
        }
      });
    }
  }, [kit, kitId, navigate]);

  const handlePreviousModalKit = useCallback((event) => {
    event?.stopPropagation();
    setModalKitHistory(prev => {
      if (prev.length === 0) return prev;
      const nextHistory = prev.slice(0, -1);
      const previousKit = prev[prev.length - 1];
      setModalKit(previousKit);
      setSelectedStock(null);
      setSelectedGroupLabel(null);
      setTargetPrice("");
      setGalleryIndex(0);
      lastManualActionTime.current = Date.now();
      if (previousKit?.id) {
        window.history.replaceState({ modal: 'product', kitId: previousKit.id }, '', `/kits/${encodeURIComponent(previousKit.id)}`);
      }
      return nextHistory;
    });
  }, []);

  const closeProductModal = useCallback(() => {
    if (window.location.pathname === productPath) {
      const historyState = window.history.state || {};
      const routeState = historyState.usr || {};
      const ownsProductHistoryEntry = (
        (historyState.modal === 'product' && historyState.kitId === kitId)
        || (routeState.modal === 'product' && routeState.kitId === kitId)
      );

      if (ownsProductHistoryEntry) {
        resetProductModalState();
        modalHistoryOwnerRef.current = false;
        window.history.back();
      } else {
        resetProductModalState();
        modalHistoryOwnerRef.current = false;
        navigate('/kits', { replace: true });
      }
      return;
    }
    resetProductModalState();
    modalHistoryOwnerRef.current = false;
  }, [kitId, navigate, productPath, resetProductModalState]);

  const previousProductModalId = location.state?.productModalParentId
    || window.history.state?.usr?.productModalParentId
    || null;
  const hasPreviousProductModal = modalKitHistory.length > 0 || Boolean(previousProductModalId);

  const handleProductModalBack = useCallback((event) => {
    if (modalKitHistory.length > 0) {
      handlePreviousModalKit(event);
      return;
    }

    if (previousProductModalId) {
      event?.stopPropagation();
      resetProductModalState();
      modalHistoryOwnerRef.current = false;
      window.history.back();
      return;
    }

    closeProductModal();
  }, [closeProductModal, handlePreviousModalKit, modalKitHistory.length, previousProductModalId, resetProductModalState]);

  const handleShareProduct = useCallback(async (event) => {
    event.stopPropagation();
    const url = `${window.location.origin}${productPath}`;
    try {
      await navigator.clipboard.writeText(url);
      setToastMessage('Product link copied to clipboard.');
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setToastMessage('Product link copied to clipboard.');
    }
  }, [productPath, setToastMessage]);

  useEffect(() => {
    const handlePopState = () => {
      if (isModalOpen && window.location.pathname !== productPath) {
        modalHistoryOwnerRef.current = false;
        resetProductModalState();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isModalOpen) {
        closeProductModal();
      }
    };

    if (isModalOpen) {
      window.addEventListener('popstate', handlePopState);
      window.addEventListener('keydown', handleKeyDown);
    }
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeProductModal, isModalOpen, productPath, resetProductModalState]);

  useEffect(() => {
    if (isRouteSelectedProduct) {
      if (!isModalOpen) {
        const timer = window.setTimeout(openProductModalView, 0);
        return () => window.clearTimeout(timer);
      }
      return undefined;
    }
    if (isModalOpen && window.location.pathname.startsWith('/kits') && window.location.pathname !== productPath) {
      const timer = window.setTimeout(resetProductModalState, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [isRouteSelectedProduct, isModalOpen, location.pathname, openProductModalView, productPath, resetProductModalState]);

  useEffect(() => {
    if (thumbnailsContainerRef.current) {
        const container = thumbnailsContainerRef.current;
        const activeThumb = container.children[galleryIndex];
        if (activeThumb) {
            const containerWidth = container.offsetWidth;
            const thumbWidth = activeThumb.offsetWidth;
            const scrollLeft = activeThumb.offsetLeft - (containerWidth / 2) + (thumbWidth / 2);
            container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
        }
    }
  }, [galleryIndex]);

  useEffect(() => {
    lastManualActionTime.current = Date.now();
  }, []);

  useEffect(() => {
    if (galleryImages.length <= 1) return;
    const interval = setInterval(() => {
      if (lastManualActionTime.current && Date.now() - lastManualActionTime.current >= 5000) {
        setGalleryIndex(prev => (prev === galleryImages.length - 1 ? 0 : prev + 1));
      }
    }, 5000); 
    return () => clearInterval(interval);
  }, [galleryImages.length]);

  const handleManualAction = () => {
    lastManualActionTime.current = Date.now();
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    if (Math.abs(diff) > 50) {
      handleManualAction();
      if (diff > 0) {
        setGalleryIndex(prev => prev === galleryImages.length - 1 ? 0 : prev + 1);
      } else {
        setGalleryIndex(prev => prev === 0 ? galleryImages.length - 1 : prev - 1);
      }
    }
  };

  const handleOpenModal = () => {
    if (onClick) {
        onClick();
        return;
    }
    if (kitId && window.location.pathname !== productPath) {
        window.history.pushState({ modal: 'product', kitId }, '', productPath);
        modalHistoryOwnerRef.current = true;
    }
    openProductModalView();
  };

  const getBuyLabel = useCallback(() => {
    if (isAdmin && isAdminView) return shelfItem ? "RELEASE STOCK" : "KEEP NOW";
    if (acceptedOfferStock && acceptedOffer) {
      const status = acceptedOfferStock.status?.toLowerCase() || '';
      return (status.includes('pre') || status.includes('batch')) ? "PRE-ORDER" : "BUY NOW";
    }
    if (selectedAvailabilityGroup?.tag === 'collection') return "NOTIFY ME";
    if (selectedAvailabilityGroup?.tag === 'bundleDeal') return "GRAB DEAL";
    if (availableCount <= 0) return "NOTIFY ME";
    if (selectedStock) {
      const isReserved = selectedStock.isReserved || hasOrderAssociation(selectedStock);
      if (isReserved) return "NOTIFY ME";
      const status = selectedStock.status?.toLowerCase() || "";
      return (status.includes("pre") || status.includes("batch")) ? "PRE-ORDER" : "BUY NOW";
    }
    const hasOnhand = visibleStocks.some(s => s.status?.toLowerCase() === 'onhand' && !s.isReserved && !hasOrderAssociation(s));
    if (hasOnhand) return "BUY NOW";
    const hasPreorder = visibleStocks.some(s => (s.status?.toLowerCase().includes('pre') || s.status?.toLowerCase().includes('batch')) && !s.isReserved && !hasOrderAssociation(s));
    return hasPreorder ? "PRE-ORDER" : "BUY NOW";
  }, [acceptedOffer, acceptedOfferStock, isAdmin, isAdminView, shelfItem, selectedAvailabilityGroup, selectedStock, visibleStocks, availableCount]);

  const getAddtoCartLabel = useCallback(() => "ADD TO CART", []);
  const addToCartLabel = getAddtoCartLabel();

  const getDefaultCartStock = useCallback(() => {
    if (acceptedOfferStock && acceptedOffer) return acceptedOfferStock;

    // Logic for Admin View
    if (isAdmin && isAdminView) {
      const adminKeepableStocks = stockList.filter(s => {
        const isSold = hasOrderAssociation(s);
        const isOnShelf = (shelf || []).some(item => item.id === kitId && item.stockKey === s.key);
        // Admin cannot keep if reserved by a non-admin user
        const isReservedByCustomer = !!s.isReserved && s.reservedBy !== user?.uid && s.reservationType !== 'admin'; 

        return !isSold && !isOnShelf && !isReservedByCustomer;
      });

      if (adminKeepableStocks.length === 0) return null;

      // Sort by costPrice (lowest first)
      const sortedStocks = [...adminKeepableStocks].sort((a, b) => {
        return getStockCostPrice(a) - getStockCostPrice(b);
      });

      return sortedStocks[0];
    }

    // Original logic for Regular Users (or when not in Admin View)
    const publicStock = visibleStocks[0] || publicReleasableStocks[0];
    if (publicStock) return publicStock;
    return stockList.find(s => !hasOrderAssociation(s)) || stockList[0] || null;
  }, [acceptedOffer, acceptedOfferStock, isAdmin, isAdminView, visibleStocks, publicReleasableStocks, stockList, shelf, kitId, user]);

  const getAcceptedOfferFields = (stock) => {
    if (!acceptedOffer || !acceptedOfferStock || stock?.key !== acceptedOfferStock.key) return {};
    return {
      offerId: acceptedOffer.id,
      offerStatus: 'released',
      offerPrice: acceptedOfferPrice,
      offerExpiresAt: acceptedOffer.offerExpiresAt,
      offerAcceptedAt: acceptedOffer.offerAcceptedAt || acceptedOffer.releasedAt
    };
  };

  const handleAddToCart = () => {
    const stockForBasket = selectedAvailabilityGroup?.tag === 'bundleDeal'
      ? (visibleStocks[0] || publicReleasableStocks[0] || getDefaultCartStock())
      : (selectedStock || getDefaultCartStock());
    if (!stockForBasket) return;
    const offerFields = getAcceptedOfferFields(stockForBasket);
    const basePrice = offerFields.offerPrice || Number(stockForBasket.sellPrice || 0);
    const isDealItem = selectedAvailabilityGroup?.tag === 'bundleDeal';
    const itemHandlingFee = isDealItem ? 0 : handlingFee;
    const itemInstallmentFee = isDealItem ? 0 : installmentFee;
    const itemTransferFee = isDealItem ? 0 : transferFee;
    addToBasket({
      ...kit,
      stockKey: stockForBasket.key,
      stockSource: isPreOrderStock(stockForBasket) ? 'preorder' : 'onhand',
      selectedStockId: stockForBasket.timestamp,
      price: basePrice + itemHandlingFee + itemInstallmentFee + itemTransferFee,
      sellPrice: basePrice,
      ...offerFields,
      appliedHandlingFee: itemHandlingFee,
      appliedInstallmentFee: itemInstallmentFee,
      appliedTransferFee: itemTransferFee,
      status: stockForBasket.status,
      eta: getStockEta(stockForBasket),
      isFreeShippingEligible: stockForBasket.isFreeShippingEligible || false,
      freeShippingUntil: stockForBasket.freeShippingUntil || '',
      freeShippingMethod: stockForBasket.freeShippingMethod && stockForBasket.freeShippingMethod !== 'All' ? stockForBasket.freeShippingMethod : '',
      freeShippingSuboption: stockForBasket.freeShippingSuboption && stockForBasket.freeShippingSuboption !== 'All' ? stockForBasket.freeShippingSuboption : ''
    });
    if (!isAdminView) setToastMessage("Added to cart!");
    closeProductModal();
  };

  const handleAction = () => {
    const buyLabel = getBuyLabel(); // This was the problematic re-declaration
    if (buyLabel === "GRAB DEAL") {
      const deal = selectedBundleDealDetails?.deal;
      if (deal) handleDealCheckout(deal, kitId);
      return;
    }
    if (buyLabel === "NOTIFY ME") {
       const finalTargetPrice = parseFloat(targetPrice) || displayPrice;
       if (!user) {
          setPendingBasketItem({ ...kit, type: 'notify', targetPrice: finalTargetPrice });
          setLoginModalOpen(true);
          closeProductModal();
          return;
       }
       huntKit(kit, finalTargetPrice);
       closeProductModal();
       return;
     }
    if (!selectedStock) return;
    handleAddToCart();
  };

  const handleBuyNow = (e, targetStock = selectedStock) => {
    if (e) e.stopPropagation();
    const buyLabelFromFunction = getBuyLabel();
    if (buyLabelFromFunction === "GRAB DEAL") {
      const deal = selectedBundleDealDetails?.deal;
      if (deal) handleDealCheckout(deal, kitId);
      return;
    }
    
    if (buyLabelFromFunction === "NOTIFY ME") {
      const available = stockList.filter(s => {
        const isSold = hasOrderAssociation(s);
        const isReserved = !!(s.isReserved);
        const isPublic = getPublicStatus(s).isPublic;
        if (isAdmin && isAdminView) return !isSold;
        return !isSold && !isReserved && isPublic;
      });
      
      if (available.length === 0) {
        if (!user) {
          setPendingBasketItem({ ...kit, type: 'notify' });
          setLoginModalOpen(true);
          return;
        }
        handleOpenModal();
        return;
      }
    }

    const availableForPurchase = stockList.filter(s => {
        const isSold = hasOrderAssociation(s);
      const isReserved = !!(s.isReserved);
      const isPublic = getPublicStatus(s).isPublic;
      if (isAdmin && isAdminView) return !isSold;
      return !isSold && !isReserved && isPublic;
    });

    const offerStock = acceptedOfferStock && acceptedOffer
      && targetStock?.key === acceptedOfferStock.key
      ? acceptedOfferStock
      : null;
    const requestedSource = targetStock
      ? (isPreOrderStock(targetStock) ? 'preorder' : 'onhand')
      : '';
    const sourceAvailable = availableForPurchase.filter(stock => (
      !requestedSource || (isPreOrderStock(stock) ? 'preorder' : 'onhand') === requestedSource
    ));
    const publicPurchaseCandidates = sourceAvailable.length > 0 ? sourceAvailable : availableForPurchase;
    let finalStock = (isAdmin && isAdminView)
      ? availableForPurchase.reduce((prev, curr) => (getStockCostPrice(curr) < getStockCostPrice(prev)) ? curr : prev, availableForPurchase[0])
      : (offerStock || getHighestCostStock(publicPurchaseCandidates) || targetStock);

    if (!finalStock) return;

    if (onBuyNowClick) {
      onBuyNowClick({
        kit,
        stock: finalStock,
        stockSource: isPreOrderStock(finalStock) ? 'preorder' : 'onhand',
        displayPrice,
        ...getAcceptedOfferFields(finalStock)
      });
      if (window.location.pathname !== productPath) {
        closeProductModal();
      }
    } else {
      if (!user) {
        const offerFields = getAcceptedOfferFields(finalStock);
        const basePrice = offerFields.offerPrice || Number(finalStock.sellPrice || 0);
        setPendingBasketItem({
          ...kit,
          stockKey: finalStock.key,
          stockSource: isPreOrderStock(finalStock) ? 'preorder' : 'onhand',
          selectedStockId: finalStock.timestamp,
          price: basePrice + handlingFee + installmentFee + transferFee,
          sellPrice: basePrice,
          ...offerFields,
          appliedHandlingFee: handlingFee,
          appliedInstallmentFee: installmentFee,
          appliedTransferFee: transferFee,
          status: finalStock.status,
          eta: getStockEta(finalStock),
          isFreeShippingEligible: finalStock.isFreeShippingEligible || false,
          freeShippingUntil: finalStock.freeShippingUntil || '',
          freeShippingMethod: finalStock.freeShippingMethod && finalStock.freeShippingMethod !== 'All' ? finalStock.freeShippingMethod : '',
          freeShippingSuboption: finalStock.freeShippingSuboption && finalStock.freeShippingSuboption !== 'All' ? finalStock.freeShippingSuboption : ''
        });
        setLoginModalOpen(true);
        closeProductModal();
        return;
      }
      const offerFields = getAcceptedOfferFields(finalStock);
      const basePrice = offerFields.offerPrice || Number(finalStock.sellPrice || 0);
      addToBasket({
        ...kit,
        stockKey: finalStock.key,
        stockSource: isPreOrderStock(finalStock) ? 'preorder' : 'onhand',
        selectedStockId: finalStock.timestamp,
        price: basePrice + handlingFee + installmentFee + transferFee,
        sellPrice: basePrice,
        ...offerFields,
        appliedHandlingFee: handlingFee,
        appliedInstallmentFee: installmentFee,
        appliedTransferFee: transferFee,
        status: finalStock.status,
        eta: getStockEta(finalStock),
        isFreeShippingEligible: finalStock.isFreeShippingEligible || false,
        freeShippingUntil: finalStock.freeShippingUntil || '',
        freeShippingMethod: finalStock.freeShippingMethod && finalStock.freeShippingMethod !== 'All' ? finalStock.freeShippingMethod : '',
        freeShippingSuboption: finalStock.freeShippingSuboption && finalStock.freeShippingSuboption !== 'All' ? finalStock.freeShippingSuboption : ''
      });
      if (isAdmin && isAdminView) closeProductModal(); else navigate('/cart');
    }
  };

// eslint-disable-next-line no-unused-vars
  const hasStock = publicReleasableStocks.length > 0;
// eslint-disable-next-line no-unused-vars
  const hasShelf = !!shelfItem;
  
  // Grid Button Config
  const gridButtonConfig = useMemo(() => {
    const totalStocks = stockList.length;

    if (shelfCount === 0) {
        if (publicReleasableStocks.length === 0) {
            return { color: 'bg-neutral-300 dark:bg-neutral-700', icon: <PackageX size={14} />, action: 'none', disabled: true };
        }
        return { color: 'bg-gradient-to-br from-emerald-500 to-emerald-600', icon: <PackagePlus size={14} />, action: 'keep', disabled: false };
    } else if (shelfCount > 0 && shelfCount < totalStocks) { // Partial Shelf
        return { color: 'bg-gradient-to-br from-blue-500 to-blue-600', icon: <PackagePlus size={14} />, action: 'keep', disabled: publicReleasableStocks.length === 0 };
    } else if (shelfCount === totalStocks) { // Full Shelf
        return { color: 'bg-gradient-to-br from-red-500 to-red-600', icon: <PackageMinus size={14} />, action: 'release', disabled: false };
    }
    // Default fallback if no stock or unexpected state
    return { color: 'bg-neutral-300 dark:bg-neutral-700', icon: <PackageX size={14} />, action: 'none', disabled: true };
  }, [stockList, shelfCount, publicReleasableStocks]);

  if (!kit) return null;
  const buyLabel = getBuyLabel();
  const isNotifyState = buyLabel === 'NOTIFY ME' && !isAdminView && !isPendingRelease && availableCount === 0;
  const gridUnavailableLabel = isCollectionOnly ? "SEND OFFER!" : hasReserved ? "LET'S DEAL!" : "NOTIFY ME!";
  const gridUnavailableClass = hasReserved ? 'text-blue-500' : 'text-red-500';
  const modalLowestPrice = acceptedOfferPrice > 0
    ? acceptedOfferPrice
    : Number(selectedBundleDealDetails?.currentItemPrice || cardSellPrice || 0);
  const isWildSaleOnHandSelected = Boolean(
    activeWildSaleDetail
    && selectedStock
    && isOnHandStock(selectedStock)
    && !selectedBundleDealDetails?.deal
    && String(selectedStock.key || '') !== String(acceptedOfferStock?.key || '')
    && wildSalePrice > 0
    && wildSalePrice < cardSellPrice
  );
  const wildSaleModalDiscount = isWildSaleOnHandSelected
    ? Math.max(0, cardSellPrice - wildSalePrice)
    : 0;
  const modalReferencePrice = acceptedOfferPrice > 0
    ? acceptedOfferPrice + handlingFee + installmentFee + transferFee
    : selectedBundleDealDetails?.deal
      ? selectedBundleDealDetails.isClearance
        ? cardSellPrice
        : displayPrice
      : cardReferencePrice;
  const activeBundleDeal = selectedBundleDealDetails?.deal || null;
  const modalTopPrice = selectedBundleDealDetails?.deal
    ? Number(sellPrice || 0)
    : isWildSaleOnHandSelected
      ? wildSalePrice
    : modalLowestPrice;
  const activeClearanceKitIds = getActiveClearanceKitIds(activeBundleDeal, activeBundleDeal?.clearanceKitIds?.length
    ? activeBundleDeal.clearanceKitIds
    : (activeBundleDeal?.kitIds || []), now);
  const clearanceKitId = activeClearanceKitIds.includes(kitId)
    ? kitId
    : (activeClearanceKitIds[0] || kitId);
  const configuredClearanceDiscount = getConfiguredClearanceDiscount(activeBundleDeal, clearanceKitId, allKits);
  const modalClearanceDiscount = configuredClearanceDiscount > 0
    ? configuredClearanceDiscount
    : Math.max(0, modalReferencePrice - modalLowestPrice);
  const activeBundleItemPrice = Number(selectedBundleDealDetails?.currentItemPrice || 0);
  const activeBundlePrice = Number(selectedBundleDealDetails?.bundlePrice || activeBundleDeal?.bundlePrice || 0);
  const isAdminBundleDealSelected = isAdmin && isAdminView && selectedAvailabilityGroup?.tag === 'bundleDeal' && activeBundleDeal;
  const isPublicOfferMode = !isAdminView && (isCollectionOnly || isSelectedCollectionGroup || isNotifyState);
  const showPublicModalPrice = !isAdminView && (!isPublicOfferMode || Boolean(acceptedOffer));
  const isActiveAcceptedOffer = isCollectionOnly
    && Boolean(acceptedOffer && acceptedOfferStock && offerCountdown && offerCountdown !== 'EXPIRED');
  const isLimitedTimeAcceptedOffer = Boolean(
    (acceptedOffer
      && acceptedOfferStock
      && offerCountdown
      && offerCountdown !== 'EXPIRED')
    || (isAdminView && isAdminLimitedTimeOffer)
  );
  const canAddLimitedTimeOfferToBasket = Boolean(
    !isAdminView && isLimitedTimeAcceptedOffer && acceptedOfferStock
  );
  const gridStatusBadges = [];
  if (isEarlyAccess) {
    gridStatusBadges.push({
      label: 'Early Access',
      className: 'bg-blue-500 text-white border-blue-400 shadow-lg animate-pulse'
    });
  }
  if (isFSEligible) {
    gridStatusBadges.push({
      label: 'Free Shipping',
      className: 'bg-emerald-500 text-white border-emerald-400 shadow-lg flex items-center gap-1'
    });
  }
  if (isLimitedTimeAcceptedOffer) {
    gridStatusBadges.push({
      label: 'Limited Time',
      isActiveDeal: true,
      className: 'bg-red-400/20 text-white border-red-400 shadow-lg'
    });
  }
  if (pendingOrderReservationCount > 0) {
    gridStatusBadges.push({
      label: `${pendingOrderReservationCount} PENDING`,
      className: 'bg-amber-500 text-white border-amber-400 shadow-lg'
    });
  }
  if (availabilityCounts.onhand > 0 || availabilityCounts.preorder > 0) {
    if (availabilityCounts.onhand > 0) {
      gridStatusBadges.push({
        label: `${availabilityCounts.onhand} ONHAND`,
        isAvailabilityCount: true,
        className: 'bg-emerald-500 text-white border-emerald-400 shadow-lg'
      });
    }
    if (availabilityCounts.onhand === 0 && availabilityCounts.preorder > 0) {
      gridStatusBadges.push({
        label: `${availabilityCounts.preorder} PRE-ORDER`,
        isAvailabilityCount: true,
        className: 'bg-blue-500 text-white border-blue-400 shadow-lg'
      });
    }
  }
  if (isClearanceDeal) {
    gridStatusBadges.push({
      // Wild Deal is the stronger per-kit promotion for the grid badge when
      // the same kit is also listed in FLEXI-BUNDLE. Keep the label aligned
      // with the gold styling instead of inheriting a selected Flexi panel's
      // label.
      label: isWildSale ? 'WILD DEAL' : clearanceDisplayLabel,
      isActiveDeal: true,
      className: isWildSale
        ? 'bg-amber-400 text-black border-amber-300 shadow-lg'
        : 'bg-emerald-500 text-white border-emerald-400 shadow-lg'
    });
  } else if (isIncludedInBundleDeal) {
    gridStatusBadges.push({
      label: 'Bundle Deal',
      className: 'bg-emerald-500 text-white border-emerald-400 shadow-lg'
    });
  } else if (availableCount <= 0 && isAdminView && shelfCount > 0) {
    gridStatusBadges.push({
      label: `${shelfCount} Reserved`,
      className: 'bg-red-500 text-white border-red-400 shadow-lg'
    });
  } else if (availableCount <= 0 && isCollectionOnly) {
    let labelVal = 'Collection';
    if (!isAdminView) {
      const reservedStocks = stockList.filter(s => s.isReserved && !hasOrderAssociation(s) && !isSupplierRefundPending(s));
      const onHandCount = reservedStocks.filter(isOnHandStock).length;
      const preOrderCount = reservedStocks.filter(isPreOrderStock).length;
      if (onHandCount > 0 && preOrderCount > 0) {
        labelVal = `${onHandCount} ONHAND / ${preOrderCount} PRE-ORDER`;
      } else if (onHandCount > 0) {
        labelVal = `${onHandCount} ONHAND`;
      } else if (preOrderCount > 0) {
        labelVal = `${preOrderCount} PRE-ORDER`;
      }
    }
    gridStatusBadges.push({
      label: labelVal,
      className: 'bg-red-500 text-white border-red-400 shadow-lg'
    });
  } else if (availableCount <= 0 && stockList.some(s => s.isReserved && !isSupplierRefundPending(s))) {
    let labelVal = 'NOT FOR SALE';
    if (!isAdminView) {
      const reservedStocks = stockList.filter(s => s.isReserved && !hasOrderAssociation(s) && !isSupplierRefundPending(s));
      const onHandCount = reservedStocks.filter(isOnHandStock).length;
      const preOrderCount = reservedStocks.filter(isPreOrderStock).length;
      if (onHandCount > 0 && preOrderCount > 0) {
        labelVal = `${onHandCount} ONHAND / ${preOrderCount} PRE-ORDER`;
      } else if (onHandCount > 0) {
        labelVal = `${onHandCount} ONHAND`;
      } else if (preOrderCount > 0) {
        labelVal = `${preOrderCount} PRE-ORDER`;
      }
    }
    gridStatusBadges.push({
      label: isAdminView ? `${stockList.filter(s => s.isReserved && !isSupplierRefundPending(s)).length} Reserved` : labelVal,
      className: `${isAdminView ? 'bg-blue-500 text-white border-blue-400' : 'bg-red-500 text-white border-red-400'} shadow-lg`
    });
  } else if (availableCount <= 0) {
    gridStatusBadges.push({
      label: 'Out of Stock',
      className: 'bg-gray-500 text-white border-gray-400 shadow-lg'
    });
  }
  const sortedGridStatusBadges = [...gridStatusBadges].sort((a, b) => {
    if (a.isActiveDeal && !b.isActiveDeal) return -1;
    if (!a.isActiveDeal && b.isActiveDeal) return 1;
    if (a.isAvailabilityCount && !b.isAvailabilityCount) return 1;
    if (!a.isAvailabilityCount && b.isAvailabilityCount) return -1;
    return b.label.length - a.label.length;
  });
  const renderAvailabilityGroupButton = (group) => {
    const isSelected = selectedGroupLabel === (group.key || group.label);
    const availableCountInGroup = group.items.filter(s => !s.isReserved && !hasOrderAssociation(s)).length;
    const isAcceptedOfferGroup = group.tag === 'acceptedOffer';
    const isCollectionGroup = group.tag === 'collection' || isAcceptedOfferGroup;
    const isBundleDealGroup = group.tag === 'bundleDeal';
    const isClearanceDealGroup = isBundleDealGroup && group.isClearanceDeal;
    const isFullyReserved = !isCollectionGroup && availableCountInGroup === 0;
    const isAvailabilityGroup = !isCollectionGroup && !isBundleDealGroup;
    const hasFreeShipping = isAvailabilityGroup && group.items.some(item => {
      const isEligible = item.isFreeShippingEligible;
      const hasCourier = item.freeShippingMethod && item.freeShippingMethod !== 'All';
      const until = item.freeShippingUntil;
      if (!isEligible || !hasCourier) return false;
      if (!until) return true;
      return Date.now() < new Date(until).getTime();
    });

    return (
      <button 
        key={group.key || group.label} 
        onClick={() => handleSelectGroup(group)} 
        className={`relative overflow-visible px-4 py-2.5 rounded-xl border text-[13px] font-black uppercase tracking-[0.05em] transition-all flex items-center gap-2
          ${isSelected 
            ? isCollectionGroup
              ? 'bg-red-500 border-red-500 text-white shadow-lg shadow-red-500/20'
              : isClearanceDealGroup
                ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20'
              : isBundleDealGroup
                ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20' 
            : isCollectionGroup
              ? 'bg-red-500/10 border-red-500/30 text-red-500 hover:border-red-500/60'
              : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/10 hover:border-blue-600/50'
          } 
          ${isFullyReserved && !isSelected ? 'opacity-50' : ''}
        `}
      >
        {isAvailabilityGroup ? (
          <>
            <span className="flex items-center gap-2 text-[15px] font-bold uppercase tracking-[0.05em]">
              <span className="text-[15px] leading-none font-bold">
                {group.items.length}
              </span>
              <span className={`h-4 w-px ${isSelected ? 'bg-white/70' : 'bg-current opacity-40'}`} aria-hidden="true" />
              <span>{group.label}</span>
            </span>
          </>
        ) : (
          <>
            {isBundleDealGroup ? <Gift size={18}/> : group.isOnHand ? <Package size={18}/> : <Plane size={18}/>}
            <span>{group.label}</span>
            {!isBundleDealGroup && (
              <span className={`ml-1 text-[13px] leading-none font-black ${isSelected ? 'text-white' : isCollectionGroup ? 'text-red-500' : 'text-blue-600'}`}>
                {group.items.length}
              </span>
            )}
          </>
        )}
        {hasFreeShipping && group.isOnHand && (
          <span
            className="absolute -right-4 -top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md"
            aria-label="Free shipping"
            title="Free shipping"
          >
            <Bike size={25} strokeWidth={2} aria-hidden="true" />
          </span>
        )}
      </button>
    );
  };
  
  // Triggering re-parse to clear phantom syntax errors.
  return (
    <>
      <div 
        onClick={onClick || handleOpenModal} 
        className={homePreview
          ? 'story-card glass-card w-full aspect-[3/4] rounded-[1.5rem] p-1 shadow-xl transition-all duration-500 lg:hover:-translate-y-1 cursor-pointer overflow-hidden group'
          : `w-full group relative rounded-[2.2rem] p-[2px] ${isSpectralMode ? `bg-gradient-to-br ${spectralGradient}` : 'bg-black/5 dark:bg-white/5'} transition-all duration-500 lg:hover:-translate-y-1 cursor-pointer overflow-hidden`}
        style={{
          boxShadow: homePreview ? undefined : isDarkMode
            ? isSpectralMode 
              ? `0 20px 25px -5px ${shadowColor}, 0 8px 10px -6px ${shadowColor}`
              : `0 20px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5)`
            : `0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)`
        }}
      >
        <div className={homePreview
          ? 'story-card-media relative h-full w-full overflow-hidden rounded-[1.3rem]'
          : `relative rounded-[2.1rem] flex flex-col h-full overflow-hidden ${
            isDarkMode ? 'bg-[var(--color-surface)]' : 'bg-white'
          }`}
        >
          {/* Status Badges Container (Moved here to appear above inner border) */}
          {!homePreview && <div className="absolute top-4 left-0 z-50 flex flex-col items-start">
                  {sortedGridStatusBadges.map((badge, index) => (
                    <div
                      key={`${badge.label}-${index}`}
                      className={`px-1.5 py-0.5 font-bold uppercase tracking-tigther text-[13px] ${badge.className} ${index < sortedGridStatusBadges.length - 1 ? 'mb-1' : ''}`}
                    >
                      {badge.label}
                    </div>
                  ))}
               </div>}
          <div className={homePreview ? 'relative h-full w-full' : 'p-3 flex flex-col h-full'}>
            <div className={homePreview
              ? 'relative h-full w-full overflow-hidden rounded-[1.3rem] bg-[var(--color-bg)]'
              : 'relative aspect-square rounded-2xl overflow-hidden mb-3 bg-[var(--color-bg)] shrink-0 z-0'}
            >
              <div className={homePreview
                ? 'absolute inset-0 h-full w-full overflow-hidden rounded-[1.3rem]'
                : 'absolute inset-0 w-full h-full bg-white dark:bg-[var(--color-surface)] overflow-hidden rounded-2xl'}
              >
                 <UniversalImage src={resolveImage(kit.image, kit?.images)} alt={kit.name} loading="lazy" className="w-full h-full object-cover transition-transform duration-700 lg:group-hover:scale-110 transform-gpu" />
                 <div className="absolute top-2 right-2 z-20">
                    {!homePreview && isAdmin && isAdminView && (
                      <button onClick={(e) => { e.stopPropagation(); onEdit(kit); }} className="px-2 py-1 rounded-full transition-all border bg-gradient-to-br from-amber-500 to-amber-600 border-white/20 shadow-lg text-white font-bold uppercase text-[12px] tracking-widest hover:scale-110">
                        EDIT
                      </button>
                    )}
                 </div> 
              </div>
            </div>

            <div className="px-1 text-center flex-1 flex flex-col min-w-0">
                {!homePreview && <div className="h-[2em] flex items-center justify-center min-w-0">
                  <h3 className="text-[15px] font-bold uppercase tracking-tighter leading-tight line-clamp-2 w-full group-hover:text-blue-600 transition-colors">{kit.name}</h3>
                </div>}
            {!homePreview && <div className="mt-auto min-w-0 min-h-[50px] flex flex-col justify-end">
                <div className="flex items-center justify-between gap-2 min-w-0 w-full">
                  <div className="flex items-center justify-between gap-2 min-w-0 w-full">
                  <div className="flex flex-col items-start pb-1 min-w-0 flex-1 text-left">
                    <span className="text-[14px] font-bold uppercase tracking-tighter truncate w-full block max-w-[120px] md:max-w-none">{kit.brand || 'NO BRAND'}</span>
                    <div className="flex items-baseline gap-1 w-full min-w-0">
                      {!isAdminView && (
                        <>
                          {(isActiveAcceptedOffer && acceptedOfferPrice > 0) ? (
                            <>
                              <span className="text-[15px] font-bold italic tracking-tighter leading-none text-blue-600 dark:text-blue-400 shrink-0">
                                ₱{acceptedOfferPrice.toLocaleString()}
                              </span>
                              <span className="text-[15px] font-bold italic tracking-tighter line-through shrink-0">
                                ₱{(getStockStandaloneSellPrice({}, kit, acceptedOfferStock) + handlingFee + installmentFee + transferFee).toLocaleString()}
                              </span>
                            </>
                          ) : availableCount > 0 ? (
                            isWildSalePriceApplied ? (
                              <>
                                <span className="text-[15px] font-bold italic tracking-tighter leading-none text-emerald-500 shrink-0">
                                  ₱{wildSalePrice.toLocaleString()}
                                </span>
                                <span className="text-[15px] font-bold italic tracking-tighter leading-none text-black line-through dark:text-white shrink-0">
                                  ₱{cardSellPrice.toLocaleString()}
                                </span>
                              </>
                            ) : (
                              <span className="text-[15px] font-bold italic tracking-tighter leading-none text-blue-600 dark:text-blue-400 shrink-0">
                                ₱{cardSellPrice.toLocaleString()}
                              </span>
                            )
                          ) : (
                            <span className={`text-[15px] font-bold tracking-tighter leading-none ${isIncludedInBundleDeal ? 'text-emerald-500' : gridUnavailableClass}`}>
                                {isIncludedInBundleDeal ? "BUNDLE DEAL" : gridUnavailableLabel}
                            </span>
                          )}
                        </>
                      )}
                      {isAdminView && (
                        <>
                          {adminDisplayInfo ? (
                            <>
                              <span className="text-[15px] font-bold tracking-tighter leading-none line-through text-neutral-900 dark:text-white shrink-0">
                                ₱{adminDisplayInfo.sell.toLocaleString()}
                              </span>
                              <span className="text-[15px] font-bold tracking-tighter leading-none text-blue-600 dark:text-blue-400 shrink-0">
                                ₱{adminDisplayedCost.toLocaleString()}
                              </span>
                            </>
                          ) : (
                              <span className="inline-flex items-center text-[15px] font-bold text-red-600 leading-none">
                                <span className="mr-[1px]">₱</span>
                                <FaQuestion size={9} />
                                <FaQuestion size={9} />
                                <FaQuestion size={9} />
                              </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {isAdmin && isAdminView ? (
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          if (gridButtonConfig.action === 'release') {
                            if (window.confirm("Are you sure you want to release this stock back to the public?")) {
                              removeFromBasket(highestCostShelfItem?.basketId);
                            }
                          } else if (gridButtonConfig.action === 'keep') {
                            handleAddToCart(); 
                          }
                        }} 
                        disabled={gridButtonConfig.disabled}
                        className={`flex items-center justify-center w-8 h-8 rounded-full transition-all border ${gridButtonConfig.color} border-white/20 shadow-lg text-white shrink-0`}
                      >
                        {gridButtonConfig.icon}
                      </button>
                  ) : (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (homePreview) {
                          handleOpenModal();
                          return;
                        }
                        if (typeof homeZapAction === 'function') {
                          homeZapAction(e, kit);
                          return;
                        }
                        (availableCount > 0 || canAddLimitedTimeOfferToBasket) ? handleAddToCart() : handleOpenModal();
                      }}
                      className="flex items-center justify-center w-8 h-8 rounded-full transition-all shadow-lg active:scale-95 bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-blue-500/40 lg:hover:scale-110 shrink-0"
                      title={typeof homeZapAction === 'function' ? 'Open kit' : undefined}
                    >
                      {typeof homeZapAction === 'function' ? <Zap size={16} fill="currentColor" /> : (availableCount > 0 || canAddLimitedTimeOfferToBasket)
                        ? <Plus size={16} strokeWidth={3} />
                        : (isIncludedInBundleDeal ? <Gift size={14} className="text-white" /> : <Bell size={14} className="text-white fill-white" />)}
                    </button>
                  )}
                </div>
                </div>
              </div>}
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 lg:p-12 bg-white/40 dark:bg-black/45 backdrop-blur-sm animate-in fade-in duration-200 overflow-hidden overscroll-none touch-action-none">
          <div className={`relative w-full h-full lg:h-[70vh] lg:max-w-7xl flex flex-col lg:rounded-[2.5rem] lg:border lg:shadow-2xl overflow-hidden overscroll-none ${isDarkMode ? 'bg-[var(--color-bg)] border-white/10 text-white' : 'bg-white border-black/5 text-neutral-900'}`}>
            <div className="h-full max-h-full flex flex-col portrait:flex-col landscape:sm:flex-row items-stretch overflow-hidden">
              <div className="sticky top-0 z-[220] w-full h-0 overflow-visible sm:hidden">
                <div className="absolute top-4 right-4 flex justify-end items-center gap-2">
                    <button onClick={handleShareProduct} className={`p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40`} title="Copy product link" aria-label="Copy product link"><Forward size={20} /></button>
                    <button onClick={hasPreviousProductModal ? handleProductModalBack : closeProductModal} className={`p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40`}>
                      {hasPreviousProductModal ? <ChevronLeft size={20} /> : <X size={20} />}
                    </button>
                </div>
              </div>
              <div className="hidden sm:flex absolute top-4 right-4 z-[210] gap-2">
                <button onClick={handleShareProduct} className={`p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40`} title="Copy product link" aria-label="Copy product link"><Forward size={20} /></button>
                <button onClick={hasPreviousProductModal ? handleProductModalBack : closeProductModal} className={`p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40`}>
                  {hasPreviousProductModal ? <ChevronLeft size={20} /> : <X size={20} />}
                </button>
              </div>
            
              {/* Gallery Column (Hidden in portrait) */}
              <Gallery 
                  galleryImages={galleryImages} 
                  galleryIndex={galleryIndex} 
                  setGalleryIndex={setGalleryIndex} 
                  handleTouchStart={handleTouchStart} 
                  handleTouchEnd={handleTouchEnd} 
                  thumbnailsContainerRef={thumbnailsContainerRef}
                  className="hidden sm:landscape:flex sm:landscape:h-full"
              />
              
              <div className="w-full flex flex-col relative sm:landscape:w-7/12 h-full min-h-0 overflow-hidden">
                  <div className="flex-1 min-h-0 overflow-y-auto lg:pb-12 sm:pb-8 md:pb-6 space-y-5 text-left [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {/* Portrait Gallery */}
                    <div className="w-full overflow-hidden block sm:landscape:hidden">
                      <Gallery 
                          galleryImages={galleryImages} 
                          galleryIndex={galleryIndex} 
                          setGalleryIndex={setGalleryIndex} 
                          handleTouchStart={handleTouchStart} 
                          handleTouchEnd={handleTouchEnd} 
                          thumbnailsContainerRef={thumbnailsContainerRef}
                      />
                    </div>

                    <div className="space-y-2 px-8">
                      {(showPublicModalPrice || isAdminView) && (
                          <div className="lg:hidden sm:hidden md:flex flex-col gap-0.5">
                            <div className="flex flex-col gap-1">
                              {showPublicModalPrice && (
                                  <div className="flex items-center gap-2">
                                  <p className="text-[28px] sm:text-5xl font-black italic tracking-tighter leading-none text-blue-600 flex">
                                    ₱{modalTopPrice.toLocaleString()}
                                  </p>
                                  {(selectedBundleDealDetails?.deal || isLimitedTimeAcceptedOffer || isWildSaleOnHandSelected) && (
                                    <div className="flex flex-col gap-0 pt-1 sm:pt-1.5">
                                      <div className="flex items-center gap-2">
                                        <p className={`${selectedBundleDealDetails?.deal || isWildSaleOnHandSelected ? 'text-[15px] md:text-[15px]' : cardIsPreOrder ? 'text-[24px] md:text-[24px]' : 'text-[10px] md:text-[14px]'} font-black italic tracking-tighter leading-none whitespace-nowrap ${selectedBundleDealDetails?.deal || isWildSaleOnHandSelected ? 'text-emerald-600' : 'text-amber-600'}`}>
                                          {selectedBundleDealDetails?.deal
                                            ? selectedBundleDealDetails.isClearance
                                              ? <>&#8369;{modalClearanceDiscount.toLocaleString()} OFF ELIGIBLE</>
                                              : <>&#8369;{getDealDiscountAmount(activeBundleDeal, getBundleDisplayTotals(activeBundleDeal, allKits, isAdmin && isAdminView)).toLocaleString()} OFF ELIGIBLE</>
                                            : isWildSaleOnHandSelected
                                              ? <>&#8369;{wildSaleModalDiscount.toLocaleString()} OFF</>
                                            : isLimitedTimeAcceptedOffer
                                              ? 'ACCEPTED OFFER'
                                              : null}
                                        </p>
                                        {isWildSaleOnHandSelected && (
                                          <p className="text-[15px] font-black italic tracking-tighter leading-none text-neutral-900 dark:text-white line-through whitespace-nowrap">
                                            ₱{cardSellPrice.toLocaleString()}
                                          </p>
                                        )}
                                      </div>
                                      {!cardIsPreOrder && (
                                        <p className={`${selectedBundleDealDetails?.deal ? 'text-[15px] md:text-[15px] text-neutral-900 dark:text-white' : 'text-[13px] md:text-[22px]'} font-black italic tracking-tighter leading-tight ${selectedBundleDealDetails?.deal || isWildSaleOnHandSelected ? '' : 'line-through'}`}>
                                          {selectedBundleDealDetails?.deal
                                            ? (selectedBundleDealDetails.isClearance
                                              ? `${isWildSaleDeal(selectedBundleDealDetails.deal) ? 'WILD DEAL' : `ON ${getClearanceDisplayLabel(selectedBundleDealDetails.deal)} DEAL`}${isWildSaleDeal(selectedBundleDealDetails.deal) ? ` · ${getWildSaleCountdownLabel(selectedBundleDealDetails.deal, kitId, now)}` : ''}`
                                              : 'ON BUNDLE DEAL')
                                            : isWildSaleOnHandSelected
                                              ? `WILD DEAL · ${getWildSaleCountdownLabel(activeWildSaleDetail.deal, kitId, now)}`
                                            : `₱${modalReferencePrice.toLocaleString()}`}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                              {isAdminView && (
                                <div className="flex items-center gap-2">
                                  <p className="text-[28px] sm:text-5xl font-black italic tracking-tighter leading-none line-through text-neutral-900 dark:text-white flex ">
                                    ₱{(adminDisplayInfo?.sell || 0).toLocaleString()}
                                  </p>
                                  <p className="text-[24px] sm:text-4xl font-black italic tracking-tighter leading-none text-blue-600 dark:text-blue-400 flex">
                                    ₱{adminDisplayedCost.toLocaleString()}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                      )}
                      <h2 className="pr-14 sm:pr-16 lg:pr-20 text-[16px] sm:text-4xl md:text-2xl lg:text-4xl font-black italic uppercase tracking-tighter leading-[0.9] break-words">{kit.name}</h2>
                      <div className="flex flex-wrap items-center gap-2 text-[15px] font-bold uppercase tracking-[0.2em]">
                        {metaTags.map((tag, index) => (
                          <React.Fragment key={`${tag}-${index}`}>
                            {index > 0 && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                            <span className={index === metaTags.length - 1 ? 'text-blue-600' : ''}>{tag}</span>
                          </React.Fragment>
                        ))}
                      </div>
                      {(showPublicModalPrice || isAdminView) && (
                          <div className="hidden sm:flex md:hidden lg:flex flex-col gap-0.5 pt-2">
                            <div className="flex gap-3">
                              {showPublicModalPrice && (
                                <div className="flex gap-3">
                                  <p className="text-[28px] lg:text-[40px] font-black italic tracking-tighter leading-none text-blue-600 flex">
                                    ₱{modalTopPrice.toLocaleString()}
                                  </p>
                                  {(selectedBundleDealDetails?.deal || isLimitedTimeAcceptedOffer || isWildSaleOnHandSelected) && (
                                    <div className="flex flex-col gap-0 pt-1.5">
                                      <div className="flex items-center gap-2">
                                        <p className={`${selectedBundleDealDetails?.deal || isWildSaleOnHandSelected ? 'text-[15px]' : cardIsPreOrder ? 'text-[15px] text-emerald-600' : 'text-[12px]'} font-black italic tracking-[0.05em] leading-none whitespace-nowrap ${selectedBundleDealDetails?.deal || isWildSaleOnHandSelected ? 'text-emerald-600' : 'text-amber-600'}`}>
                                          {selectedBundleDealDetails?.deal
                                            ? selectedBundleDealDetails.isClearance
                                              ? <>&#8369;{modalClearanceDiscount.toLocaleString()} OFF ELIGIBLE</>
                                              : <>&#8369;{getDealDiscountAmount(activeBundleDeal, getBundleDisplayTotals(activeBundleDeal, allKits, isAdmin && isAdminView)).toLocaleString()} OFF ELIGIBLE</>
                                            : isWildSaleOnHandSelected
                                              ? <>&#8369;{wildSaleModalDiscount.toLocaleString()} OFF</>
                                            : isLimitedTimeAcceptedOffer
                                              ? 'ACCEPTED OFFER'
                                              : null}
                                        </p>
                                        {isWildSaleOnHandSelected && (
                                          <p className="text-[15px] font-black italic tracking-tighter leading-none text-neutral-900 dark:text-white line-through whitespace-nowrap">
                                            ₱{cardSellPrice.toLocaleString()}
                                          </p>
                                        )}
                                      </div>
                                      {!cardIsPreOrder && (
                                        <p className={`${selectedBundleDealDetails?.deal ? 'text-[15px] text-neutral-900 dark:text-white' : 'text-[18px]'} font-black italic tracking-tighter leading-none ${selectedBundleDealDetails?.deal || isWildSaleOnHandSelected ? '' : 'line-through'}`}>
                                          {selectedBundleDealDetails?.deal
                                            ? (selectedBundleDealDetails.isClearance
                                              ? `${isWildSaleDeal(selectedBundleDealDetails.deal) ? 'WILD DEAL' : `ON ${getClearanceDisplayLabel(selectedBundleDealDetails.deal)} DEAL`}${isWildSaleDeal(selectedBundleDealDetails.deal) ? ` · ${getWildSaleCountdownLabel(selectedBundleDealDetails.deal, kitId, now)}` : ''}`
                                              : 'ON BUNDLE DEAL')
                                            : isWildSaleOnHandSelected
                                              ? `WILD DEAL · ${getWildSaleCountdownLabel(activeWildSaleDetail.deal, kitId, now)}`
                                            : `₱${modalReferencePrice.toLocaleString()}`}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                              {isAdminView && (
                                <div className="flex items-center gap-2">
                                  <p className="text-[28px] lg:text-[40px] font-black italic tracking-tighter leading-none line-through text-neutral-900 dark:text-white flex ">
                                    ₱{(adminDisplayInfo?.sell || 0).toLocaleString()}
                                  </p>
                                  <p className="text-[24px] lg:text-[34px] font-black italic tracking-tighter leading-none text-blue-600 dark:text-blue-400 flex">
                                    ₱{adminDisplayedCost.toLocaleString()}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                      )}
                    </div>
                    <div className="space-y-2 px-8">
                      <p className="text-[14px] font-bold uppercase tracking-[0.1em] text-neutral-600 dark:text-neutral-300 flex items-center gap-2 text-left"><Package size={18} /> Condition Details</p>
                      <div className="flex flex-wrap gap-1.5">
                        {conditionDetailsStock && getConditionDetails(conditionDetailsStock).length > 0 ? (
                          getConditionDetails(conditionDetailsStock).map((detail, i) => {
                              const colorClass = "text-blue-600 border-blue-600";
                              return <span key={i} className={`text-[15px] font-bold uppercase tracking-[0.05em] px-2.5 py-1 rounded-lg border shadow-sm ${colorClass}`}>{detail.label}</span>;
                              })
                        ) : (
                          <span className="text-[15px] font-bold tracking-[0.1em] uppercase px-2.5 py-1 rounded-lg text-neutral-500 border border-neutral-500">No Info</span>
                        )}
                      </div>
                      {/* 🌟 2. RE-CHECK MO KUNG GANITO ANG NAKALAGAY SA MAIN MODAL AREA 🌟 */}
                      {(conditionDetailsStock?.issueDescription || visibleStocks[0]?.issueDescription) && (
  <div className="mt-2 flex items-center gap-1.5 w-fit px-2.5 py-2 rounded-lg border shadow-sm bg-amber-500/10 text-amber-500 border-amber-500/20 dark:border-amber-400/60 text-[15px] font-bold uppercase tracking-[0.05em]">
    <div className="flex-none text-amber-500">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12" y1="16" y2="16"/>
      </svg>
    </div>
    <span className="leading-none">
      {/* <span className="underline mr-1">TAKE NOTE:</span> */}
      {conditionDetailsStock?.issueDescription || visibleStocks[0]?.issueDescription}
    </span>
  </div>
)}
                    </div>
                    <div className="space-y-4 px-8 pb-12">
                      <h4 className="text-[14px] font-bold uppercase tracking-[0.1em] text-neutral-600 dark:text-neutral-300 flex items-center gap-2 text-left"><AvailabilityHeaderIcon size={20} /> AVAILABILITY</h4>
                      <div className="flex flex-wrap gap-2">
                        {visibleAvailabilityGroups.length > 0 ? visibleAvailabilityGroups.map(renderAvailabilityGroupButton) : <span className="text-[11px] font-black uppercase px-2.5 py-1 rounded-lg bg-neutral-500/10 text-neutral-500 border border-neutral-500/20">No Info</span>}
                      </div>

                      {isAdmin && isAdminView && collectionGroupedVariants.length > 0 && (
                        <div className="pt-4 space-y-2">
                          <h4 className="text-[14px] font-bold uppercase tracking-[0.1em] text-neutral-600 dark:text-neutral-300 flex items-center gap-2 text-left">
                            <ShelvingUnit size={18} /> COLLECTION
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {collectionGroupedVariants.map(renderAvailabilityGroupButton)}
                          </div>
                        </div>
                      )}

                      {!isAdminView && nonWildSaleDealDetails.length > 0 && (
                        <div className="pt-4 space-y-2">
                          <h4 className="text-[14px] font-bold uppercase tracking-[0.1em] text-neutral-600 dark:text-neutral-300 flex items-center gap-2 text-left">
                            <Gift size={18} /> DEALS
                          </h4>
                          <div className="space-y-4">
                            {nonWildSaleDealDetails.map(({ deal, includedKits, displayName }) => {
                              const isSelectedBundlePanel = selectedBundleDealDetails?.deal?.id === deal.id;
                              const bundleGroup = bundleDealGroups.find(group => group.deal?.id === deal.id);
                              const isClearanceDeal = isFlexiBundleDeal(deal) || isPerKitClearanceDeal(deal);
                              const isIndependentClearanceDeal = isPerKitClearanceDeal(deal);
                              const isWildSale = isWildSaleDeal(deal);
                              const wildSaleCountdown = isWildSale
                                ? getWildSaleCountdownLabel(deal, kitId, now)
                                : '';
                              const clearancePricing = isClearanceDeal
                                ? getClearanceDealPricing(deal, allKits)
                                : null;
                              const bundleDisplayTotals = !isClearanceDeal
                                ? getBundleDisplayTotals(deal, allKits, isAdmin && isAdminView)
                                : null;
                              const clearanceRowsByKitId = new Map(
                                (clearancePricing?.rows || []).map(row => [String(row.kitId), row])
                              );
                              const clearanceTotalDiscount = isClearanceDeal
                                ? Number(clearancePricing?.clearanceDiscountTotal || 0)
                                : 0;
                              const requiredOtherKits = isClearanceDeal && !isIndependentClearanceDeal
                                ? getClearanceRequiredOtherStock(deal, kitId)
                                : 0;
                              const flexiOfferedDiscount = isFlexiBundleDeal(deal)
                                ? getFlexiOfferedDiscount(
                                  deal,
                                  kitId,
                                  clearanceRowsByKitId.get(String(kitId))?.clearanceDiscount
                                )
                                : 0;
                              const clearanceDisplayDiscount = isClearanceDeal
                                ? isFlexiBundleDeal(deal)
                                  ? flexiOfferedDiscount
                                  : Number(
                                    clearanceRowsByKitId.get(String(kitId))?.clearanceDiscount
                                    ?? clearanceRowsByKitId.get(String(includedKits[0]?.id))?.clearanceDiscount
                                    ?? 0
                                  )
                                : 0;
                              const clearanceOfferTotal = isFlexiBundleDeal(deal)
                                ? flexiOfferedDiscount
                                : clearanceTotalDiscount;
                              const clearanceRequiredDiscount = isFlexiBundleDeal(deal)
                                ? flexiOfferedDiscount
                                : clearanceTotalDiscount;
                              return (
                              <div
                                key={deal.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => bundleGroup && handleSelectGroup(bundleGroup)}
                                onKeyDown={(event) => {
                                  if ((event.key === 'Enter' || event.key === ' ') && bundleGroup) {
                                    event.preventDefault();
                                    handleSelectGroup(bundleGroup);
                                  }
                                }}
                                className={`relative space-y-2 rounded-2xl border-2 px-4 py-3 transition-colors duration-300 cursor-pointer ${isSelectedBundlePanel
                                  ? `border-blue-600 ${isDarkMode ? 'bg-[var(--color-surface)] text-white' : 'bg-white text-neutral-900'} shadow-lg shadow-blue-600/20`
                                  : 'border-white/90 bg-white/60 shadow-md hover:border-blue-600/50 dark:border-white/20 dark:bg-white/10'}`}
                              >
                                <div className="flex items-start justify-between gap-3 px-1">
                                  <div className="min-w-0 flex-1 text-left">
                                    <p className="min-h-[2.25rem] line-clamp-2 text-[15px] font-bold uppercase italic leading-tight text-emerald-600">{displayName}</p>
                                  </div>
                                  <div className="shrink-0 pt-0.5 text-right">
                                    <p className={`text-[12px] font-black uppercase ${isDarkMode ? 'text-white' : 'text-neutral-900'} ${!isClearanceDeal && getDealCountdownLabel(deal.validUntil) === 'LAST DAY' ? 'text-red-500' : ''}`}>
                                      {isWildSale
                                        ? wildSaleCountdown
                                        : isIndependentClearanceDeal
                                          ? 'INDIVIDUAL SALE'
                                        : isClearanceDeal
                                          ? `+${requiredOtherKits} OTHER STOCK REQUIRED`
                                          : getDealCountdownLabel(deal.validUntil)}
                                    </p>
                                  </div>
                                </div>

                                {isSelectedBundlePanel ? (
                                  <div className="space-y-2">
                                    {includedKits.map((includedKit) => {
                                      const bundleKitPrice = Number(getBundleKitPrice(deal, includedKit, allKits) || 0);
                                      const clearanceRow = clearanceRowsByKitId.get(String(includedKit.id));
                                      const displayedDealPrice = isClearanceDeal
                                        ? Number(clearanceRow?.finalPrice ?? bundleKitPrice)
                                        : bundleKitPrice;
                                      const displayedClearanceDiscount = isClearanceDeal
                                        ? isFlexiBundleDeal(deal)
                                          ? clearanceDisplayDiscount
                                          : Number(clearanceRow?.clearanceDiscount || 0)
                                        : 0;
                                      const stocks = Object.values(filterActiveKitStocks(includedKit?.stocks, includedKit?.id, validatedOrderStockData));
                                      const sourceStock = getPreferredDealStock(stocks, deal.stockSource || 'onhand');
                                      const referencePrice = Number(sourceStock?.sellPrice || stocks[0]?.sellPrice || includedKit?.sellPrice || 0);
                                      // Handling and transfer are one-time order fees.
                                      // Allocate each fee across the bundle rows instead
                                      // of repeating both fees on every included item.
                                      const bundleReferencePrice = referencePrice;

                                      return (
                                        <div
                                          key={includedKit.id}
                                          role="button"
                                          tabIndex={0}
                                          onClick={(event) => handleOpenIncludedKit(includedKit, event)}
                                          onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                              event.preventDefault();
                                              handleOpenIncludedKit(includedKit, event);
                                            }
                                          }}
                                          className={`grid w-full cursor-pointer grid-cols-[auto,minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-3 py-3 ${isDarkMode ? 'text-white' : 'text-neutral-900'} transition-all duration-300 hover:translate-x-0.5`}
                                        >
                                          <div className="flex items-center justify-center shrink-0">
                                            {resolveImage(includedKit.image, includedKit.images) ? (
                                              <UniversalImage
                                                src={resolveImage(includedKit.image, includedKit.images)}
                                                className="w-20 h-20 md:landscape:w-40 md:landscape:h-22 object-cover object-[center_25%] rounded-xl border border-neutral-100 dark:border-neutral-800 transition-opacity duration-500"
                                                alt={includedKit.name}
                                              />
                                            ) : (
                                              <div className="w-20 h-20 sm:landscape:w-[60px] sm:landscape:h-[40px] md:w-[60px] md:h-[40px] rounded-xl border border-neutral-100 bg-neutral-200 dark:border-neutral-800 dark:bg-neutral-800 flex items-center justify-center">
                                                <Package size={24} className="opacity-20" />
                                              </div>
                                            )}
                                          </div>
                                          <div className="min-w-0 text-left">
                                            <p className="line-clamp-1 text-[15px] font-bold uppercase leading-tight">{includedKit.name}</p>
                                            <p className={`mt-0.5 truncate text-[15px] font-bold uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
                                              {[includedKit.brand, includedKit.specs?.line || includedKit.specs?.scale].filter(Boolean).join(' / ') || 'Included Kit'}
                                            </p>
                                            <div className="mt-1 flex items-baseline justify-between gap-2">
                                              {isClearanceDeal ? (
                                                <>
                                                  <p className={`text-[16px] font-black italic ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
                                                    &#8369;{bundleReferencePrice.toLocaleString()}
                                                  </p>
                                                  <p className="text-[16px] font-black italic text-emerald-600">
                                                    UP TO &#8369;{displayedClearanceDiscount.toLocaleString()} OFF
                                                  </p>
                                                </>
                                              ) : (
                                                <>
                                                  {bundleReferencePrice > 0 && bundleReferencePrice !== displayedDealPrice && (
                                                    <p className="text-[15px] font-black text-black line-through dark:text-white">&#8369;{bundleReferencePrice.toLocaleString()}</p>
                                                  )}
                                                  <p className="text-[16px] font-black italic text-emerald-600">
                                                    &#8369;{displayedDealPrice.toLocaleString()}
                                                  </p>
                                                </>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {isClearanceDeal && !isIndependentClearanceDeal && (
                                      <div
                                        className="grid w-full cursor-default grid-cols-[auto,minmax(0,1fr)] items-center gap-x-4 px-3 py-3"
                                        title="Additional kit required for clearance discount"
                                        aria-label="Additional kit required for clearance discount"
                                      >
                                        <div className="flex shrink-0 items-center justify-center">
                                          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-neutral-100 bg-neutral-200 dark:border-neutral-800 dark:bg-neutral-800 md:landscape:h-22 md:landscape:w-40">
                                            <img src="/snorlaxgarage.png" alt="Loading..." className="h-[70%] w-[70%] object-contain opacity-20" />
                                          </div>
                                        </div>
                                        <div className="min-w-0 text-left">
                                          <p className="line-clamp-1 text-[15px] font-bold uppercase leading-tight">
                                            +{requiredOtherKits} OTHER STOCK REQUIRED
                                          </p>
                                          <div className="mt-1 flex items-baseline justify-between gap-2">
                                            <p className={`text-[16px] font-black italic ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>&#8369;???</p>
                                            <p className="text-[16px] font-black italic text-emerald-600">
                                              UP TO &#8369;{Math.max(0, Number(clearanceRequiredDiscount || 0)).toLocaleString()} OFF
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    <div className="flex justify-end pt-2">
                                      <p className="text-[16px] font-black uppercase italic leading-none text-emerald-600">
                                        {isClearanceDeal
                                          ? `SAVE UP TO ₱${clearanceOfferTotal.toLocaleString()} OFF`
                                          : getDealSaveUpToLabel(deal, { kitCount: includedKits.length, dynamicTotals: bundleDisplayTotals })}
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-1 px-1 pt-1">
                                    <div className="flex min-w-0 flex-wrap items-center pl-1">
                                      {includedKits.map((includedKit, includedIndex) => (
                                        (() => {
                                          const includedKitImage = resolveImage(includedKit.image, includedKit.images);
                                          const includedKitImageMeta = (includedKit.images || []).find((image) => (
                                            image.id === includedKit.image || image.url === includedKit.image
                                          ));
                                          const usesBoxArtImage = !includedKitImageMeta || includedKitImageMeta.type === 'BOX ART';

                                          return (
                                            <div
                                              key={includedKit.id}
                                              style={!isClearanceDeal ? { zIndex: includedIndex + 1 } : undefined}
                                              className={`h-20 w-20 overflow-hidden rounded-full border-2 border-white bg-neutral-200 shadow-md dark:bg-neutral-800 ${includedIndex > 0 ? '-ml-2' : ''}`}
                                            >
                                              {includedKitImage ? (
                                                <UniversalImage
                                                  src={includedKitImage}
                                                  className={`h-full w-full object-cover object-[center_25%] ${usesBoxArtImage ? '' : 'scale-[1.2]'}`}
                                                  alt=""
                                                />
                                              ) : (
                                                <div className="flex h-full w-full items-center justify-center">
                                                  <Package size={10} className="opacity-20" />
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })()
                                      ))}
                                      {isClearanceDeal && !isIndependentClearanceDeal && Array.from({ length: 1 }, (_, placeholderIndex) => (
                                        <div
                                          key={`clearance-placeholder-${placeholderIndex}`}
                                          className="relative -ml-2 flex h-20 w-20 cursor-default items-center justify-center overflow-hidden rounded-full border-2 border-white bg-neutral-200 shadow-md dark:border-white/80 dark:bg-neutral-800"
                                          title="Add another kit to unlock the clearance discount"
                                          aria-label="Additional kit required for clearance discount"
                                        >
                                          <img src="/snorlaxgarage.png" alt="Loading..." className="relative z-10 h-[70%] w-[70%] object-contain opacity-20" />
                                        </div>
                                      ))}
                                    </div>
                                    <div className="flex justify-end">
                                      <p className="text-[15px] font-black italic leading-none text-emerald-600">
                                        {(isClearanceDeal
                                          ? `GRAB ₱${clearanceOfferTotal.toLocaleString()} OFF`
                                          : getDealGrabLabel(deal, bundleDisplayTotals)
                                        ).replace(/^GRAB\b/i, 'GRAB UP TO')}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={`w-full bottom-0 p-2 border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] ${isDarkMode ? 'bg-[var(--color-surface-raised)] border-white/10' : 'bg-white/80 border-black/5'} backdrop-blur-md z-[210] flex-none`}>
                    <div className={`grid transition-all duration-300 ease-in-out overflow-hidden ${acceptedOffer && acceptedOfferStock && selectedStock?.key === acceptedOfferStock.key && offerCountdown !== 'EXPIRED' ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden">
                        <div className="w-full mb-2 bg-red-500 rounded-lg p-1.5 flex items-center justify-center backdrop-blur-sm">
                          <span className="text-white font-black italic uppercase tracking-[0.2em] text-[11px] drop-shadow-md">
                            OFFER ENDS IN {offerCountdown}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className={`grid transition-all duration-300 ease-in-out overflow-hidden ${showShippingStatusBanner || showPreOrderFreeShippingBanner ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                        <div className="overflow-hidden">
                            {showShippingStatusBanner ? (
                              <div className="w-full mb-2 p-1.5 flex items-center justify-center">
                                  <span className="text-emerald-600 dark:text-emerald-400 font-black italic uppercase tracking-[0.2em] text-[11px]">
                                  {isOnHandStock(selectedStock)
                                    ? (canShipToday ? 'SHIP IMMEDIATELY' : `SHIP BY ${nextShippingDateLabel}`)
                                    : 'SHIPS UPON ARRIVAL'}
                                  </span>
                              </div>
                            ) : (
                              <div className="w-full mb-2 bg-emerald-500 rounded-lg p-1.5 flex items-center justify-center backdrop-blur-sm">
                                  <span className="text-white font-black italic uppercase tracking-[0.2em] text-[11px] drop-shadow-md">
                                  FREE SHIPPING {selectedStock?.freeShippingUntil ? `RUNS UNTIL ${new Date(selectedStock.freeShippingUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}` : 'ELIGIBLE'}
                                  </span>
                              </div>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row sm:items-center lg:items-center justify-between sm:gap-6 lg:gap-6">
                      <div className="flex-1 w-full flex sm:justify-end lg:justify-end">
                          {isPendingRelease && availableCount === 0 && !isAdmin ? (
                            <div className="w-full sm:w-auto lg:w-auto px-8 py-4 rounded-3xl bg-neutral-900 text-white text-center font-black italic uppercase tracking-widest">{timeLeft}</div>
                          ) : isNotifyState ? (
                            <div className="flex w-full items-stretch gap-2">
                              <input 
                                type="number" 
                                placeholder="ENTER PREFERRED PRICE" 
                                value={targetPrice} 
                                onChange={(e) => setTargetPrice(e.target.value)} 
                                className={`w-[59%] sm:w-1/2  lg:w-1/2 px-6 py-4 rounded-full text-[13px] font-black focus:outline-none focus:ring-2 no-spinner border ${isDarkMode ? 'bg-red-500/10 text-white border-red-500/20 placeholder:text-red-200/50' : 'bg-red-50 text-red-950 border-red-200 placeholder:text-red-400/70'} focus:ring-red-500/50 focus:border-red-500/40`} 
                              />
                              <button 
                                  onClick={handleAction} 
                                  disabled={targetPrice === "" || isNaN(parseFloat(targetPrice)) || parseFloat(targetPrice) <= 0} 
                                  className={`flex-1 flex items-center justify-center gap-2 px-2 py-4 rounded-full text-white font-black italic uppercase text-[12px] tracking-widest shadow-2xl transition-all active:scale-95 whitespace-nowrap ${
                                    (targetPrice === "" || isNaN(parseFloat(targetPrice))) 
                                      ? 'bg-gradient-to-br from-red-300 to-red-500 shadow-red-500/20 opacity-70' 
                                      : 'bg-gradient-to-br from-red-500 to-red-700 shadow-red-500/40'
                                  }`}
                                >
                                  <Bell size={14} className="fill-white" /> {isCollectionOnly ? "SEND OFFER" : hasReserved ? "SEND DEAL" : "NOTIFY ME!"}
                                </button>
                            </div>
                          ) : isAdminBundleDealSelected ? (
                            <div className="flex w-full items-stretch justify-center">
                              <button
                                onClick={handleEditSelectedDeal}
                                disabled={typeof onEditDeal !== 'function'}
                                className="w-full max-w-sm flex items-center justify-center gap-2 px-2 py-4 rounded-full text-white font-black italic uppercase text-[12px] tracking-widest shadow-lg transition-all active:scale-95 whitespace-nowrap disabled:opacity-30 bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/20"
                              >
                                <Pencil size={14} /> EDIT DEAL
                              </button>
                            </div>
                          ) : activeBundleDeal && activeBundleItemPrice > 0 && !isAdminView ? (
                            <div className="grid w-full grid-cols-2 items-stretch gap-2">
                              <div className={`min-w-0 flex items-center justify-center px-2 py-4 rounded-full border border-black/5 dark:border-white/10 ${(isFlexiBundleDeal(activeBundleDeal) || isPerKitClearanceDeal(activeBundleDeal)) ? 'order-2' : 'order-1'}`}>
                                <div className="flex items-center justify-center text-center">
                                  {(isFlexiBundleDeal(activeBundleDeal) || isPerKitClearanceDeal(activeBundleDeal)) ? (
                                    <span className="text-[16px] font-black italic uppercase leading-none text-emerald-600 whitespace-nowrap">
                                      &#8369;{modalClearanceDiscount.toLocaleString()} OFF ELIGIBLE
                                    </span>
                                  ) : (
                                    <span className="text-[16px] font-black italic uppercase leading-none text-emerald-600 whitespace-nowrap">
                                      ₱{activeBundlePrice.toLocaleString()} BUNDLE DEAL
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className={`min-w-0 flex items-stretch justify-center ${(isFlexiBundleDeal(activeBundleDeal) || isPerKitClearanceDeal(activeBundleDeal)) ? 'order-1' : 'order-2'}`}>
                                <button 
                                  onClick={() => handleDealCheckout(activeBundleDeal, kitId)} 
                                  className="w-full flex items-center justify-center gap-2 px-2 py-4 rounded-full text-white font-black italic uppercase text-[12px] tracking-widest shadow-lg transition-all active:scale-95 whitespace-nowrap bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/20"
                                >
                                  <Zap size={14} fill="currentColor" /> {(isFlexiBundleDeal(activeBundleDeal) || isPerKitClearanceDeal(activeBundleDeal)) ? 'ADD TO CART' : 'GRAB DEAL'}
                                </button>
                              </div>
                            </div>
                          ) : (
                               isAdmin && isAdminView ? (
                            <div className="flex w-full items-stretch gap-2">
                              <button 
                                onClick={handleAddToCart} 
                                disabled={publicReleasableStocks.length === 0}
                                className="flex-1 flex items-center justify-center gap-2 px-2 py-4 rounded-full text-white font-black italic uppercase text-[12px] tracking-widest shadow-lg transition-all active:scale-95 whitespace-nowrap disabled:opacity-30 bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/20"
                              >
                                <PackagePlus size={14} /> KEEP NOW
                              </button>
                              <button 
                                onClick={() => {
                                  if (highestCostShelfItem && window.confirm("Are you sure you want to release the highest-cost shelf stock back to the public?")) {
                                    removeFromBasket(highestCostShelfItem.basketId);
                                  }
                                }} 
                                disabled={!highestCostShelfItem}
                                className="flex-1 flex items-center justify-center gap-2 px-2 py-4 rounded-full text-white font-black italic uppercase text-[12px] tracking-widest shadow-lg transition-all active:scale-95 whitespace-nowrap disabled:opacity-30 bg-gradient-to-br from-amber-500 to-orange-600 shadow-orange-500/20"
                              >
                                <PackageMinus size={14} /> RELEASE
                              </button>
                            </div>
                          ) : (
                                 <div className={`grid w-full ${(!isAdminView && availableCount > 0) ? 'grid-cols-2' : 'grid-cols-1'} items-stretch gap-2`}>
                                   {!isAdminView && availableCount > 0 && (
                                     <button onClick={handleAddToCart} className="flex-1 flex items-center justify-center gap-2 px-2 py-4 rounded-full font-black italic uppercase text-[12px] tracking-widest transition-all active:scale-95 whitespace-nowrap border-t border-black/5 dark:border-white/10 group/basket bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20">{addToCartLabel}</button>
                                   )}
                                   <button onClick={(e) => handleBuyNow(e, selectedStock || visibleStocks[0])} className="flex-1 flex items-center justify-center gap-2 px-2 py-4 rounded-full text-white font-black italic uppercase text-[12px] tracking-widest shadow-2xl transition-all active:scale-95 whitespace-nowrap group/buy bg-gradient-to-br from-amber-500 to-orange-600 shadow-orange-500/30 hover:bg-orange-600">{buyLabel}</button>
                                 </div>
                                 ))}
                      </div>
                    </div>
                  </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

