import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Trash2, ShoppingBag, ShelvingUnit, ShoppingBasket, PackageOpen, PackagePlus, Plus, Minus } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useTheme } from '../context/ThemeContext';
import PageTemplate from './PageTemplate';
import LoginPromptModal from '../components/menu/LoginPromptModal';
import LoadingState from '../components/common/LoadingState';
import { getCheckoutPaymentFees } from '../utils/paymentSettings';
import { isOfferCheckoutActive } from '../utils/offerUtils';
// Resolves an image ID to its URL from the images array.
// Backward compatible: if the value is already a URL (base64 or http), returns it directly.
function resolveImage(idOrUrl, imagesArray) {
  if (!idOrUrl) return '';
  if (idOrUrl.startsWith('data:') || idOrUrl.startsWith('http')) return idOrUrl;
  const match = (imagesArray || []).find(img => img.id === idOrUrl);
  return match?.url || '';
}

function getBasketItemTime(item) {
  const createdAtTime = new Date(item?.createdAt || 0).getTime();
  if (Number.isFinite(createdAtTime) && createdAtTime > 0) return createdAtTime;

  const idTime = String(item?.basketId || '').match(/_(\d{10,})_/);
  return idTime ? Number(idTime[1]) : 0;
}

export default function Basket() {
  const { isDarkMode } = useTheme();
  const { 
    user, basket, shelf, isAdmin, isAdminView, removeFromBasket, kits, addToBasket, addProjectToBasket, decrementProjectQuantity,
    guestBasket, isLoading, setLoginModalOpen, shippingSettings, loadMissingKits, keepOneOfEachToShelf
  } = useStore();
  const [isKeepingOnes, setIsKeepingOnes] = useState(false);
  const [offerNow, setOfferNow] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setOfferNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const activeBasketIds = (user ? ((isAdmin && isAdminView) ? shelf : basket) : guestBasket).map(item => item.id);
    if (activeBasketIds.length > 0) {
      loadMissingKits(activeBasketIds);
    }
  }, [user, isAdmin, isAdminView, basket, shelf, guestBasket, loadMissingKits]);

  useEffect(() => {
    if (isAdmin) {
      if (isAdminView && location.pathname !== '/shelf') {
        navigate('/shelf', { replace: true });
      } else if (!isAdminView && location.pathname !== '/basket') {
        navigate('/basket', { replace: true });
      }
    }
  }, [isAdminView, isAdmin, navigate, location.pathname]);
  
  const activeBasket = user ? ((isAdmin && isAdminView) ? shelf : basket) : guestBasket;

  const { handlingFee, installmentFee, transferFee } = useMemo(() => {
    return getCheckoutPaymentFees({ shippingSettings });
  }, [shippingSettings]);

  const getBasketDisplayPrice = useCallback((item) => {
    if (item.type === 'project') {
      return Number(item.projectData?.sellPrice || item.price || 0);
    }
    const kit = kits.find(k => k.id === item.id);
    const stockSellPrice = Number(item.offerPrice || kit?.stocks?.[item.stockKey]?.sellPrice || 0);
    const basePrice = stockSellPrice > 0 ? stockSellPrice : Number(item.sellPrice || item.price || 0);
    return basePrice + installmentFee;
  }, [kits, installmentFee]);

  const getEffectiveItemPrice = useCallback((item) => {
    // Return displayPrice (final price)
    if (item.type === 'project') return Number(item.projectData?.displayPrice || item.projectData?.sellPrice || item.price || 0);
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

  const [manualSelectedIds, setManualSelectedIds] = useState([]); 
  const [isLoginPromptOpen, setLoginPromptOpen] = useState(false);
  const [itemsForCheckout, setItemsForCheckout] = useState([]);

  const openCheckoutPage = (items, isGuestPreview = !user) => {
    navigate('/checkout', { state: { items, isGuestPreview } });
  };

  const activeSelection = useMemo(() => {
    const currentBasketIds = activeBasket.map(i => i.basketId);
    return manualSelectedIds.filter(id => currentBasketIds.includes(id));
  }, [activeBasket, manualSelectedIds]);

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
        
        const key = `${item.id}-${batchIdentifier}-${item.offerId || 'standard'}`;
        
        if (!acc[key]) acc[key] = { ...item, qty: 0, basketIds: [], batchKey: batchIdentifier };
        acc[key].qty += 1;
        acc[key].basketIds.push(item.basketId);
        return acc;
    }, {});

    Object.values(grouped).forEach(item => {
        if (item.type === 'project') return;
        const kitSource = kits.find(k => k.id === item.id);
        const batchIdentifier = item.batchKey;
        
        const availableInBatch = Object.values(kitSource?.stocks || {}).filter(s => {
            const sStatus = s.status?.toLowerCase() || 'default';
            const sEta = s.eta ? `-${s.eta.toLowerCase().replace(/\s+/g, '-')}` : '';
            const sBatch = `${sStatus}${sEta}`;
            return sBatch === batchIdentifier && !s.isReserved && !s.order?.orderId;
        }).length;

        const isActiveOffer = isOfferCheckoutActive(item, offerNow);
        const isReservedByOthers = (item.status === 'reserved'); 
        const availableLimit = item.offerId
          ? (isActiveOffer ? 1 : 0)
          : (isReservedByOthers ? 0 : availableInBatch);
        if (item.qty > availableLimit) {
            isValid = false;
            const key = `${item.id}-${batchIdentifier}`;
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
      totalPrice = selectedItems.reduce((sum, item) => sum + (getBasketDisplayPrice(item) * (item.quantity || 1)), 0);
    }

    return { isValid, itemRules, totalPrice, selectedItems };
  }, [activeBasket, activeSelection, kits, getBasketDisplayPrice, offerNow]);

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
    const totalSellPrice = activeBasket.reduce((sum, item) => sum + (getBasketDisplayPrice(item) * (item.quantity || 1)), 0);
    const possibleProfit = Math.max(0, totalSellPrice - totalCostPrice);
    return { totalKits, totalCostPrice, totalSellPrice, possibleProfit };
  }, [isAdmin, isAdminView, activeBasket, getBasketDisplayPrice]);

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
      const key = `${item.id}-${item.stockKey}-${item.offerId || 'standard'}`;

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

  const hasVisibleBasketItems = !isLoading && groupedItems.length > 0;

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
    window.addEventListener('hideNavbar', handleHide);
    window.addEventListener('showNavbar', handleShow);
    return () => {
      window.removeEventListener('hideNavbar', handleHide);
      window.removeEventListener('showNavbar', handleShow);
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
          {isLoading ? (
            <LoadingState message={isAdmin && isAdminView ? "Loading Collection" : "Loading Basket"} />
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
                      className={`sticky top-[110px] z-[80] -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 bg-neutral-50/90 px-4 py-3 backdrop-blur-md dark:bg-[#0a0a0a]/90 md:-mx-8 md:w-[calc(100%+4rem)] md:px-8 ${index === 0 ? 'mt-4' : ''}`}
                    >
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                      <span className="select-none bg-gradient-to-r from-[#0866FF] to-[#00CFFF] bg-clip-text text-[11px] font-black uppercase tracking-[0.2em] text-transparent">
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
                    : resolveImage(item.image || kit?.image, item.images || kit?.images);

                const displayName = (item.name || '').replace(/\s*\(Pre-Order\)\s*$/i, '');
                const stock = kit?.stocks?.[item.stockKey];

                const brand = kit?.brand || item.brand;
                const line = kit?.specs?.line || item.specs?.line;
                const scale = kit?.specs?.scale || item.specs?.scale;
                
                const isOnhand = (stock?.status || item.status)?.toLowerCase() === 'onhand';
                const availabilityLabel = isOnhand
                  ? 'Onhand'
                  : (stock?.eta || item.eta || 'TBA');
                const shelfCostPrice = Number(item.costPrice ?? stock?.costPrice ?? 0);
                const shelfSellPrice = Number(item.sellPrice ?? stock?.sellPrice ?? getBasketDisplayPrice(item));
                
                const uniqueGroupKey = `${item.id}-${item.batchKey}-${item.offerId || 'standard'}`;
                const itemError = validation.itemRules[uniqueGroupKey];
                
                const cardClasses = `p-3 rounded-2xl border-2 cursor-pointer flex gap-4 items-center transition-all duration-300 ${
                  isSelected ? 'border-blue-500 shadow-lg' : 'border-black/5 dark:border-white/5'
                } bg-white dark:bg-neutral-900`;

                return (
                  <div 
                    key={uniqueGroupKey} 
                    onClick={() => item.basketIds.forEach(toggleSelection)}
                    className={cardClasses}
                  >
                    <div className="flex items-center justify-center">
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
                        <p className={`font-black text-[14px] ${
                            isSelected 
                            ? 'text-emerald-600' 
                            : 'text-neutral-900 dark:text-white'
                        }`}>₱{getBasketDisplayPrice(item).toLocaleString()}</p>
                      )}
                      <p className={`text-[13px] font-black uppercase px-2 py-0.5 rounded-md truncate max-w-[100px] border ${
                        isOnhand 
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' 
                          : 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                      }`}>
                        {item.type === 'project' ? 'Project' : availabilityLabel}
                      </p>
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
        {(hasVisibleBasketItems || (isAdmin && isAdminView && !isLoading)) && (
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
                        if (isLoading) {
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
                            return { ...normalizeCheckoutItem(item), batchKey: `${status}${eta}` };
                        });

                        const flaggedKeys = Object.keys(validation.itemRules);
                        const hasSelectedIssues = selectedItems.some(i => flaggedKeys.includes(`${i.id}-${i.batchKey}-${i.offerId || 'standard'}`));
                        const uniqueBatches = Array.from(new Set(selectedItems.filter(i => i.type !== 'project').map(i => i.batchKey)));
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
                                          return `${item.id}-${status}${eta}-${item.offerId || 'standard'}` === key;
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
                                const checkoutItems = Object.values(groupedItems).filter(item => 
                                  item.basketIds.some(id => activeSelection.includes(id))
                                ).map(item => ({
                                  ...item,
                                  quantity: item.qty
                                }));
                                setItemsForCheckout(checkoutItems);
                                openCheckoutPage(checkoutItems, !user);
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
