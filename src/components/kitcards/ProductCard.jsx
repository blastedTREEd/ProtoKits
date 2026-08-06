/* eslint-disable react-hooks/preserve-manual-memoization */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  ShoppingBag, ShoppingBasket, X, Clock, Package, ShelvingUnit, PackageMinus, PackagePlus, PackageX, Calendar, UserCheck, Info,
  ChevronRight, ChevronLeft, Truck, Pencil, Trash2, Bell, Plane, Plus, ArrowBigUpDash, Bike, Gift, Zap
  } from 'lucide-react';
import { FaQuestion } from 'react-icons/fa';
import { useStore } from '../../store/useStore';
import { useTheme } from '../../context/ThemeContext';
import { getCheckoutPaymentFees } from '../../utils/paymentSettings';
import DealDetailsModal from './DealDetailsModal';

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
                    <img src={galleryImages[galleryIndex].url} alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-110" />
                    <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-4 lg:p-6">
                        <img 
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
                                className="flex-1 flex justify-start items-center gap-1.5 overflow-x-auto no-scrollbar mt-2 py-1 scroll-smooth px-2"
                            >
                                {galleryImages.map((img, idx) => (
                                    <button 
                                        key={img.id || idx}
                                        onClick={(e) => { e.stopPropagation(); setGalleryIndex(idx); }}
                                        className={`relative w-12 h-12 md:w-[70px] md:h-[70px] lg:w-[70px] lg:h-[70px] rounded-lg border-2 transition-all shrink-0 overflow-hidden group/thumb ${galleryIndex === idx ? 'border-amber-400 scale-105 shadow-lg z-10 opacity-100' : 'border-white/10 opacity-40 hover:opacity-100 hover:border-white/30'}`}
                                    >
                                        <img src={img.url} className="w-full h-full object-cover" alt="" />
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
  const status = String(stock?.status || '').toLowerCase();
  const isPreOrder = status.includes('pre') || status.includes('batch');
  return source === 'preorder' ? isPreOrder : !isPreOrder;
}

function isOnHandStock(stock) {
  const status = String(stock?.status || '').toLowerCase().trim();
  return status === 'onhand' || status === 'on hand';
}

function getStockCostPrice(stock) {
  const value = Number(stock?.costPrice);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function getAvailabilityGroupLabel(stock) {
  return isOnHandStock(stock) ? 'ONHAND' : (stock?.eta || 'TBA').toUpperCase();
}

function getAvailabilityGroupKey(prefix, stock) {
  const stockType = isOnHandStock(stock) ? 'onhand' : 'preorder';
  const etaKey = (stock?.eta || 'TBA').toString().trim().toLowerCase().replace(/\s+/g, '-');
  return `${prefix}-${stockType}-${etaKey}`;
}

function isBundlePurchasableStock(stock, source = 'onhand') {
  if (!stock || stock.order?.orderId || !stockMatchesDealSource(stock, source)) return false;
  return !stock.isReserved || stock.reservationType === 'admin';
}

function getBundleKitPrice(deal, dealKit, allKits = [], fallbackExclusivePercent = 100) {
  if (!deal || !dealKit) return null;
  const includedKits = (deal.kitIds || []).map(id => id === dealKit.id ? dealKit : allKits.find(k => k.id === id)).filter(Boolean);
  const exclusiveKitIds = deal.exclusiveKitIds || [];
  const exclusivePercent = Number(deal.exclusiveDiscountPercent ?? fallbackExclusivePercent ?? 100) / 100;

  const rows = includedKits.map(k => {
    const stocks = Object.values(k?.stocks || {});
    const sourceStock = stocks.find(s => stockMatchesDealSource(s, deal.stockSource || 'onhand'));
    const refPrice = Number(sourceStock?.sellPrice || stocks[0]?.sellPrice || k?.sellPrice || 0);
    return { kit: k, refPrice, isExclusive: exclusiveKitIds.includes(k.id) };
  });

  const normalTotal = rows.reduce((sum, row) => sum + row.refPrice, 0);
  const totalDiscount = Number(deal.discountAmount ?? Math.max(0, normalTotal - Number(deal.bundlePrice || 0))) || 0;
  const exclusiveTotal = rows.filter(row => row.isExclusive).reduce((sum, row) => sum + row.refPrice, 0);
  const standardTotal = rows.filter(row => !row.isExclusive).reduce((sum, row) => sum + row.refPrice, 0);
  const exclusivePool = exclusiveTotal > 0 ? totalDiscount * exclusivePercent : 0;
  const standardPool = totalDiscount - exclusivePool;
  const target = rows.find(row => row.kit.id === dealKit.id);
  if (!target) return null;

  let kitDiscount = 0;
  if (target.isExclusive && exclusiveTotal > 0) {
    kitDiscount = exclusivePool * (target.refPrice / exclusiveTotal);
  } else if (!target.isExclusive && standardTotal > 0) {
    kitDiscount = standardPool * (target.refPrice / standardTotal);
  }

  return Math.max(0, Math.round(target.refPrice - kitDiscount));
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

export default function ProductCard({ kit, onBuyNowClick, onEdit, onClick, routeKitId }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDarkMode, isSpectralMode } = useTheme();
  const spectralGradient = useMemo(() => getSpectralGradient(kit?.id), [kit?.id]);
  const shadowColor = useMemo(() => getShadowColor(spectralGradient), [spectralGradient]);

  
  const [isModalOpen, setIsProfileOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const [selectedGroupLabel, setSelectedGroupLabel] = useState(null);
  const [targetPrice, setTargetPrice] = useState("");
  const [timeLeft, setTimeLeft] = useState("");
  const [now, setNow] = useState(0);
  const [isDealDetailsOpen, setIsDealDetailsOpen] = useState(false);
  const [dealForDetails, setDealForDetails] = useState(null);

  const handleDealCheckout = (deal) => {
    if (!deal || !deal.kitIds || deal.type === 'mutually_exclusive') return;
    const bundleKits = (allKits || []).filter(k => deal.kitIds.includes(k.id));
    const normalTotal = bundleKits.reduce((sum, k) => {
      const stocks = Object.values(k.stocks || {});
      const sourceStock = stocks.find(s => stockMatchesDealSource(s, deal.stockSource || 'onhand'));
      return sum + (sourceStock?.sellPrice || stocks[0]?.sellPrice || k.sellPrice || 0);
    }, 0);

    const { exclusiveDiscountPercent: exPct } = getCheckoutPaymentFees({ shippingSettings });
    const exclusiveKitIds = deal.exclusiveKitIds || [];
    const pct = Number(deal.exclusiveDiscountPercent ?? exPct) / 100;

    let exclusiveRefTotal = 0;
    let standardRefTotal = 0;

    const kitPrices = bundleKits.map((kit) => {
      const stocks = Object.values(kit?.stocks || {});
      const availableStock = stocks.find(s => isBundlePurchasableStock(s, deal.stockSource || 'onhand'));
      const sourceStock = stocks.find(s => stockMatchesDealSource(s, deal.stockSource || 'onhand'));
      const refPrice = Number(sourceStock?.sellPrice || stocks[0]?.sellPrice || kit?.sellPrice || 0);

      const isExclusive = exclusiveKitIds.includes(kit.id);
      if (isExclusive) {
        exclusiveRefTotal += refPrice;
      } else {
        standardRefTotal += refPrice;
      }

      return { kit, refPrice, isExclusive, availableStock };
    });

    const bPrice = deal.bundlePrice || 0;
    const totalDiscount = normalTotal > bPrice ? normalTotal - bPrice : 0;

    const exclusivePool = exclusiveKitIds.length > 0 ? totalDiscount * pct : 0;
    const standardPool = totalDiscount - exclusivePool;

    const items = kitPrices.map(({ kit, refPrice, isExclusive, availableStock }) => {
      let kitDiscount = 0;
      if (isExclusive && exclusiveRefTotal > 0) {
        kitDiscount = exclusivePool * (refPrice / exclusiveRefTotal);
      } else if (!isExclusive && standardRefTotal > 0) {
        kitDiscount = standardPool * (refPrice / standardRefTotal);
      }
      const finalPrice = Math.round(refPrice - kitDiscount);

      return {
        ...kit,
        name: `${kit?.name} (Bundle Item)`,
        isBundleItem: true,
        allowShelfBundle: true,
        stockKey: availableStock?.key || 'default',
        price: finalPrice,
        appliedHandlingFee: handlingFee,
        appliedInstallmentFee: installmentFee,
        appliedTransferFee: transferFee
      };
    });

    setIsDealDetailsOpen(false);
    setDealForDetails(null);
    if (!user) { setLoginModalOpen(true); return; }
    navigate('/checkout', { state: { items, isGuestPreview: false } });
  };

  const openSelectedDealDetails = () => {
    const deal = selectedBundleDealDetails?.deal;
    if (!deal) return;
    setDealForDetails(deal);
    setIsDealDetailsOpen(true);
    setIsProfileOpen(false);
    if (window.location.pathname === productPath) {
      if (window.history.state?.modal === 'product') {
        window.history.replaceState({}, '', '/kits');
        return;
      }
      navigate('/kits', { replace: true });
    }
  };
  
  const { 
    addToBasket, removeFromBasket, isAdmin, 
    isAdminView, shelf, deals, kits: allKits,
    setPendingBasketItem, setLoginModalOpen, user,
    huntKit,
    shippingSettings,
    setToastMessage
  } = useStore();

  const paymentSettings = shippingSettings?.paymentSettings;
  const { handlingFee, installmentFee, transferFee, exclusiveDiscountPercent } = useMemo(() => {
    return getCheckoutPaymentFees({ paymentSettings });
  }, [paymentSettings]);

  const stockList = useMemo(() => {
    return kit?.stocks ? Object.entries(kit.stocks).map(([key, val]) => ({ key, ...val })) : [];
  }, [kit]);

  useEffect(() => {
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      
      const firstRelease = stockList.find(s => {
        let releaseTime;
        if (s.publicReleaseDate) {
          releaseTime = new Date(s.publicReleaseDate).getTime();
        } else {
          releaseTime = (s.timestamp || 0) + (61 * 60 * 1000);
        }
        return releaseTime > current;
      });
      
      if (!firstRelease) {
        setTimeLeft("");
        return;
      }

      const releaseTime = firstRelease.publicReleaseDate 
        ? new Date(firstRelease.publicReleaseDate).getTime() 
        : (firstRelease.timestamp || 0) + (61 * 60 * 1000);
      
      const distance = releaseTime - current;

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      setTimeLeft(`${days > 0 ? `${days}D ` : ''}${hours}H ${minutes}M ${seconds}S`);
    }, 1000);

    return () => clearInterval(timer);
  }, [stockList]);

  const isPendingRelease = timeLeft !== "";

  const getPublicStatus = useCallback((stock) => {
    if (isAdmin && isAdminView) return { isPublic: true };
    if (!stock?.publicReleaseDate) return { isPublic: true };
    const releaseTime = new Date(stock.publicReleaseDate).getTime();
    return { isPublic: now >= releaseTime, releaseTime };
  }, [isAdmin, isAdminView, now]);

  const kitId = kit?.id;
  const productPath = kitId ? `/kits/${encodeURIComponent(kitId)}` : '/kits';
  const isRouteSelectedProduct = !!kitId && routeKitId === kitId;

  const publicReleasableStocks = useMemo(() => {
    return stockList.filter(s => {
      const isSold = !!(s.order?.orderId);
      const isReserved = !!(s.isReserved);
      const isOnShelf = (shelf || []).some(item => item.id === kitId && item.stockKey === s.key);
      
      if (isAdmin && isAdminView) {
        return !isSold && !isOnShelf;
      }
      return !isSold && !isReserved && !isOnShelf;
    });
  }, [stockList, shelf, kitId, isAdmin, isAdminView]);

  const hasReserved = useMemo(() => {
    return stockList.some(s => s.isReserved && !s.order?.orderId);
  }, [stockList]);

  const visibleStocks = useMemo(() => {
    return publicReleasableStocks
      .filter(s => getPublicStatus(s).isPublic)
      .sort((a, b) => Number(a.sellPrice || 0) - Number(b.sellPrice || 0));
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
        groups[key] = { key, label, items: [], isOnHand, eta: s.eta, tag: 'availability' };
      }
      groups[key].items.push(s);
    });

    Object.values(groups).forEach(group => {
      group.items.sort((a, b) => Number(a.sellPrice || 0) - Number(b.sellPrice || 0));
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
  
  const sellPrice = useMemo(() => {
    const available = visibleStocks.filter(s => !s.isReserved && !s.order?.orderId);
    let base = 0;
    if (available.length > 0) {
      const prices = available.map(s => Number(s.sellPrice || 0)).filter(p => p > 0);
      if (prices.length > 0) base = Math.min(...prices); 
    } else if (stockList.length > 0) {
      const allPrices = stockList.map(s => Number(s.sellPrice || 0)).filter(p => p > 0);
      if (allPrices.length > 0) base = Math.min(...allPrices); 
    } else {
      base = kit?.sellPrice || 0;
    }
    return base;
  }, [kit, visibleStocks, stockList]);

  const { refPrice, displayPrice, lowestPrice } = useMemo(() => {
    const base = Number(sellPrice || 0);
    const hFee = handlingFee;
    const iFee = installmentFee;
    const tFee = transferFee;
    
    return {
      refPrice: base + hFee + iFee + tFee,
      displayPrice: base + hFee + iFee + tFee,
      lowestPrice: base
    };
  }, [sellPrice, handlingFee, installmentFee, transferFee]);

  const shelfItem = useMemo(() => {
    // Find if the current kit is reserved by any admin on the shared shelf
    return (shelf || []).find(item => item.id === kitId);
  }, [shelf, kitId]);

  const shelfCount = useMemo(() => {
    return (shelf || []).filter(item => item.id === kitId).length;
  }, [shelf, kitId]);

  // True when all remaining unsold stocks are on the admin shelf (collection)
  const isCollectionOnly = useMemo(() => {
    if (availableCount > 0) return false;
    const unsoldStocks = stockList.filter(s => !s.order?.orderId);
    if (unsoldStocks.length === 0) return false;
    return shelfCount > 0 && shelfCount >= unsoldStocks.length;
  }, [availableCount, stockList, shelfCount]);

  // Shelf stocks for display in collection mode (read-only, no buy action)
  const collectionStocks = useMemo(() => {
    if (!isCollectionOnly && !(isAdmin && isAdminView)) return [];
    const shelfKeys = new Set((shelf || []).filter(item => item.id === kitId).map(item => item.stockKey));
    return stockList.filter(s => shelfKeys.has(s.key) && !s.order?.orderId);
  }, [isCollectionOnly, isAdmin, isAdminView, shelf, kitId, stockList]);

  const collectionGroupedVariants = useMemo(() => {
    if ((!isCollectionOnly && !(isAdmin && isAdminView)) || collectionStocks.length === 0) return [];
    const groups = {};
    collectionStocks.forEach(s => {
      const isOnHand = isOnHandStock(s);
      const label = getAvailabilityGroupLabel(s);
      const key = getAvailabilityGroupKey('collection', s);
      if (!groups[key]) groups[key] = { key, label, items: [], isOnHand, eta: s.eta, tag: 'collection' };
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
      const isBundleDeal = deal?.type === 'bundle_only' || deal?.type === 'bundle_discount';
      if (!isBundleDeal || deal.isActive === false || !(deal.kitIds || []).includes(kitId)) return false;
      const validUntil = parseDealDate(deal.validUntil);
      if (validUntil && validUntil.getTime() <= now) return false;
      return (deal.kitIds || []).every(dealKitId => {
        const dealKit = dealKitId === kitId ? kit : (allKits || []).find(k => k.id === dealKitId);
        const stockSource = deal.stockSource || 'onhand';
        const stocks = Object.values(dealKit?.stocks || {});
        return stocks.some(stock => isBundlePurchasableStock(stock, stockSource));
      });
    });
  }, [allKits, deals, kitId, kit, now]);

  const hasBundleExclusiveDeal = bundleOnlyDeals.length > 0;

  const bundleDealDetails = useMemo(() => {
    return bundleOnlyDeals.map(deal => {
      const orderedKitIds = [
        ...(deal.previewKitIds || []),
        ...(deal.kitIds || []).filter(id => !(deal.previewKitIds || []).includes(id))
      ];
      const includedKits = orderedKitIds.map(id => id === kitId ? kit : (allKits || []).find(k => k.id === id)).filter(Boolean);
      const currentKitStock = stockList.find(stock => isBundlePurchasableStock(stock, deal.stockSource || 'onhand')) || null;
      const currentItemPrice = deal.kitDiscounts?.[kitId]?.finalPrice ?? getBundleKitPrice(deal, kit, allKits, exclusiveDiscountPercent);
      const bundlePrice = Number(deal.bundlePrice ?? Math.max(0, Number(deal.totalSell || 0) - Number(deal.discountAmount || 0)));
      return { deal, includedKits, currentKitStock, currentItemPrice, bundlePrice };
    }).filter(detail => Number.isFinite(Number(detail.currentItemPrice)) && Number(detail.currentItemPrice) > 0);
  }, [bundleOnlyDeals, allKits, kitId, kit, stockList, exclusiveDiscountPercent]);

  const bundleDealGroups = useMemo(() => {
    if (isAdminView || bundleDealDetails.length === 0) return [];
    return bundleDealDetails.map(detail => ({
      key: `bundle-deal-${detail.deal.id}`,
      label: 'BUNDLE DEAL',
      items: [detail.currentKitStock || { ...detail.deal, status: 'bundle_deal', sellPrice: detail.currentItemPrice }],
      isOnHand: true,
      tag: 'bundleDeal',
      deal: detail.deal,
      dealDetails: detail
    }));
  }, [bundleDealDetails, isAdminView]);

  const availabilityGroups = useMemo(() => {
    const stockGroups = isAdmin && isAdminView
      ? groupedVariants
      : (isCollectionOnly ? collectionGroupedVariants : groupedVariants);
    return [...stockGroups, ...bundleDealGroups];
  }, [isAdmin, isAdminView, groupedVariants, collectionGroupedVariants, isCollectionOnly, bundleDealGroups]);

  const selectableAvailabilityGroups = useMemo(() => {
    return isAdmin && isAdminView
      ? [...availabilityGroups, ...collectionGroupedVariants]
      : availabilityGroups;
  }, [isAdmin, isAdminView, availabilityGroups, collectionGroupedVariants]);

  const selectedAvailabilityGroup = useMemo(() => {
    return selectableAvailabilityGroups.find(group => group.key === selectedGroupLabel) || null;
  }, [selectableAvailabilityGroups, selectedGroupLabel]);

  const isSelectedCollectionGroup = selectedAvailabilityGroup?.tag === 'collection';
  const selectedBundleDealDetails = selectedAvailabilityGroup?.dealDetails || null;
  const conditionDetailsStock = selectedBundleDealDetails?.currentKitStock || selectedStock;
  const selectedShelfItem = useMemo(() => {
    if (!isSelectedCollectionGroup || !selectedStock) return null;
    return (shelf || []).find(item => item.id === kitId && item.stockKey === selectedStock.key) || null;
  }, [isSelectedCollectionGroup, selectedStock, shelf, kitId]);

  const isExclusiveToBundle = useMemo(() => {
    if (!kitId || !Array.isArray(deals)) return false;
    return deals.some(deal => {
      const isBundleDeal = deal?.type === 'bundle_only' || deal?.type === 'bundle_discount';
      if (!isBundleDeal || deal.isActive === false || !(deal.kitIds || []).includes(kitId)) return false;
      const validUntil = parseDealDate(deal.validUntil);
      if (validUntil && validUntil.getTime() <= now) return false;
      return (deal.exclusiveKitIds || []).includes(kitId);
    });
  }, [deals, kitId, now]);

  // Compute the exclusive bundle deal and proportional discounted price for this kit
  const exclusiveBundlePrice = useMemo(() => {
    if (!isExclusiveToBundle || !kitId) return 0;
    // Find the best deal (largest discount) that marks this kit as exclusive
    let bestPrice = Infinity;
    for (const deal of (deals || [])) {
      const isBundleDeal = deal?.type === 'bundle_only' || deal?.type === 'bundle_discount';
      if (!isBundleDeal || deal.isActive === false || !(deal.kitIds || []).includes(kitId)) continue;
      if (!(deal.exclusiveKitIds || []).includes(kitId)) continue;
      const validUntil = parseDealDate(deal.validUntil);
      if (validUntil && validUntil.getTime() <= now) continue;
      // Compute proportional price for this kit in this deal
      const exclusiveKitIds = deal.exclusiveKitIds || [];
      const pct = Number(deal.exclusiveDiscountPercent ?? exclusiveDiscountPercent) / 100;
      let normalTotal = 0, exclusiveRefTotal = 0;
      const refPrices = [];
      for (const dkId of (deal.kitIds || [])) {
        const dk = dkId === kitId ? kit : (allKits || []).find(k => k.id === dkId);
        const stocks = Object.values(dk?.stocks || {});
        const src = stocks.find(s => stockMatchesDealSource(s, deal.stockSource || 'onhand'));
        const rp = Number(src?.sellPrice || stocks[0]?.sellPrice || dk?.sellPrice || 0);
        normalTotal += rp;
        if (exclusiveKitIds.includes(dkId)) exclusiveRefTotal += rp;
        refPrices.push({ dkId, rp, isExcl: exclusiveKitIds.includes(dkId) });
      }
      const totalDiscount = normalTotal > (deal.bundlePrice || 0) ? normalTotal - (deal.bundlePrice || 0) : 0;
      const exclusivePool = exclusiveKitIds.length > 0 ? totalDiscount * pct : 0;
      const thisKit = refPrices.find(r => r.dkId === kitId);
      if (!thisKit) continue;
      const kitDiscount = exclusiveRefTotal > 0 ? exclusivePool * (thisKit.rp / exclusiveRefTotal) : 0;
      const price = Math.round(thisKit.rp - kitDiscount);
      if (price < bestPrice) bestPrice = price;
    }
    return bestPrice === Infinity ? 0 : bestPrice;
  }, [isExclusiveToBundle, deals, kitId, kit, allKits, exclusiveDiscountPercent, now]);

  const isEarlyAccess = useMemo(() => {
    return stockList.some(s => s.publicReleaseDate && new Date(s.publicReleaseDate).getTime() > now);
  }, [stockList, now]);

  const isFSEligible = useMemo(() => {
    return visibleStocks.some(s => {
      if (!s.isFreeShippingEligible || s.isReserved || s.order?.orderId) return false;
      const expiry = s.freeShippingUntil ? new Date(s.freeShippingUntil).getTime() : 0;
      return expiry === 0 || now < expiry;
    });
  }, [visibleStocks, now]);

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

    const unsoldStocks = stockList.filter(s => !s.order?.orderId);
    if (unsoldStocks.length === 0) return null;
    
    const maxSellPrice = Math.max(...unsoldStocks.map(s => Number(s.sellPrice || 0)), Number(kit?.sellPrice || 0));

    if (selectedStock) {
      const cost = Number(selectedStock.costPrice || 0);
      const sell = maxSellPrice || Number(selectedStock.sellPrice || 0) || 0;
      return { cost, sell, profit: sell - cost };
    }

    const cheapestStock = unsoldStocks.reduce((prev, curr) => (getStockCostPrice(curr) < getStockCostPrice(prev)) ? curr : prev);
    const cost = Number(cheapestStock.costPrice || 0);
    const sell = maxSellPrice || 0;
    return { cost, sell, profit: sell - cost };
  }, [stockList, isAdminView, selectedStock, kit]);

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

  const resetProductModalState = useCallback(() => {
    setIsProfileOpen(false);
    setSelectedStock(null);
    setSelectedGroupLabel(null);
  }, []);

  const openProductModalView = useCallback(() => {
    setToastMessage(null);
    setGalleryIndex(0);
    lastManualActionTime.current = Date.now();
    if (selectableAvailabilityGroups.length > 0) {
        handleSelectGroup(selectableAvailabilityGroups[0]);
    }
    setIsProfileOpen(true);
  }, [handleSelectGroup, selectableAvailabilityGroups, setToastMessage]);

  const closeProductModal = useCallback(() => {
    if (window.location.pathname === productPath) {
      if (window.history.state?.modal === 'product') {
        resetProductModalState();
        window.history.back();
      } else {
        resetProductModalState();
        navigate('/kits', { replace: true });
      }
      return;
    }
    resetProductModalState();
  }, [navigate, productPath, resetProductModalState]);

  useEffect(() => {
    const handlePopState = () => {
      if (isModalOpen && window.location.pathname !== productPath) {
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
    if (isModalOpen && location.pathname.startsWith('/kits') && window.location.pathname !== productPath) {
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
        window.history.pushState({ modal: 'product' }, '', productPath);
    }
    openProductModalView();
  };

  const getBuyLabel = useCallback(() => {
    if (isAdmin && isAdminView) return shelfItem ? "RELEASE STOCK" : "KEEP NOW";
    if (selectedAvailabilityGroup?.tag === 'collection') return "NOTIFY ME";
    if (selectedAvailabilityGroup?.tag === 'bundleDeal') return "GRAB DEAL";
    if (availableCount <= 0) return "NOTIFY ME";
    if (selectedStock) {
      const isReserved = selectedStock.isReserved || selectedStock.order?.orderId;
      if (isReserved) return "NOTIFY ME";
      const status = selectedStock.status?.toLowerCase() || "";
      return (status.includes("pre") || status.includes("batch")) ? "PRE-ORDER" : "BUY NOW";
    }
    const hasOnhand = visibleStocks.some(s => s.status?.toLowerCase() === 'onhand' && !s.isReserved && !s.order?.orderId);
    if (hasOnhand) return "BUY NOW";
    const hasPreorder = visibleStocks.some(s => (s.status?.toLowerCase().includes('pre') || s.status?.toLowerCase().includes('batch')) && !s.isReserved && !s.order?.orderId);
    return hasPreorder ? "PRE-ORDER" : "BUY NOW";
  }, [isAdmin, isAdminView, shelfItem, selectedAvailabilityGroup, selectedStock, visibleStocks, availableCount]);

  const getAddtoCartLabel = useCallback(() => "ADD TO BASKET", []);
  const addToCartLabel = getAddtoCartLabel();

  const getDefaultCartStock = useCallback(() => {
    // Logic for Admin View
    if (isAdmin && isAdminView) {
      const adminKeepableStocks = stockList.filter(s => {
        const isSold = !!(s.order?.orderId);
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
    return stockList.find(s => !s.order?.orderId) || stockList[0] || null;
  }, [isAdmin, isAdminView, visibleStocks, publicReleasableStocks, stockList, shelf, kitId, user]);

  const handleAddToCart = () => {
    const stockForBasket = selectedAvailabilityGroup?.tag === 'bundleDeal'
      ? (visibleStocks[0] || publicReleasableStocks[0] || getDefaultCartStock())
      : (selectedStock || getDefaultCartStock());
    if (!stockForBasket) return;
    addToBasket({
      ...kit,
      stockKey: stockForBasket.key,
      selectedStockId: stockForBasket.timestamp,
      price: Number(stockForBasket.sellPrice || 0) + handlingFee + installmentFee + transferFee,
      appliedHandlingFee: handlingFee,
      appliedInstallmentFee: installmentFee,
      appliedTransferFee: transferFee,
      status: stockForBasket.status,
      eta: stockForBasket.eta,
      isFreeShippingEligible: stockForBasket.isFreeShippingEligible || false,
      freeShippingUntil: stockForBasket.freeShippingUntil || '',
      freeShippingMethod: stockForBasket.freeShippingMethod || 'All',
      freeShippingSuboption: stockForBasket.freeShippingSuboption || 'All'
    });
    if (!isAdminView) setToastMessage("Added to basket!");
    closeProductModal();
  };

  const handleAction = () => {
    const buyLabel = getBuyLabel(); // This was the problematic re-declaration
    if (buyLabel === "GRAB DEAL") {
      openSelectedDealDetails();
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
      openSelectedDealDetails();
      return;
    }
    
    if (buyLabelFromFunction === "NOTIFY ME") {
      const available = stockList.filter(s => {
        const isSold = !!(s.order?.orderId);
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
      const isSold = !!(s.order?.orderId);
      const isReserved = !!(s.isReserved);
      const isPublic = getPublicStatus(s).isPublic;
      if (isAdmin && isAdminView) return !isSold;
      return !isSold && !isReserved && isPublic;
    });

    let finalStock = (isAdmin && isAdminView) 
      ? availableForPurchase.reduce((prev, curr) => (getStockCostPrice(curr) < getStockCostPrice(prev)) ? curr : prev, availableForPurchase[0]) 
      : (targetStock || availableForPurchase[0]);

    if (!finalStock) return;

    if (onBuyNowClick) {
      onBuyNowClick({ kit, stock: finalStock, displayPrice });
      closeProductModal();
    } else {
      if (!user) {
        setPendingBasketItem({
          ...kit,
          stockKey: finalStock.key,
          selectedStockId: finalStock.timestamp,
          price: Number(finalStock.sellPrice || 0) + handlingFee + installmentFee + transferFee,
          appliedHandlingFee: handlingFee,
          appliedInstallmentFee: installmentFee,
          appliedTransferFee: transferFee,
          status: finalStock.status,
          eta: finalStock.eta,
          isFreeShippingEligible: finalStock.isFreeShippingEligible || false,
          freeShippingUntil: finalStock.freeShippingUntil || '',
          freeShippingMethod: finalStock.freeShippingMethod || 'All',
          freeShippingSuboption: finalStock.freeShippingSuboption || 'All'
        });
        window.dispatchEvent(new Event('openLoginPrompt'));
        closeProductModal();
        return;
      }
      addToBasket({
        ...kit,
        stockKey: finalStock.key,
        selectedStockId: finalStock.timestamp,
        price: Number(finalStock.sellPrice || 0) + handlingFee + installmentFee + transferFee,
        appliedHandlingFee: handlingFee,
        appliedInstallmentFee: installmentFee,
        appliedTransferFee: transferFee,
        status: finalStock.status,
        eta: finalStock.eta,
        isFreeShippingEligible: finalStock.isFreeShippingEligible || false,
        freeShippingUntil: finalStock.freeShippingUntil || '',
        freeShippingMethod: finalStock.freeShippingMethod || 'All',
        freeShippingSuboption: finalStock.freeShippingSuboption || 'All'
      });
      if (isAdmin && isAdminView) closeProductModal(); else navigate('/basket');
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
  const modalLowestPrice = Number(selectedBundleDealDetails?.currentItemPrice || sellPrice || 0);
  const modalReferencePrice = selectedBundleDealDetails ? Number(lowestPrice || 0) : displayPrice;
  const activeBundleDeal = selectedBundleDealDetails?.deal || null;
  const dealDetailsDeal = dealForDetails || activeBundleDeal;
  const activeBundleItemPrice = Number(selectedBundleDealDetails?.currentItemPrice || 0);
  const isPublicOfferMode = !isAdminView && (isCollectionOnly || isSelectedCollectionGroup || isNotifyState);
  const showPublicModalPrice = !isAdminView && !isPublicOfferMode;
  const renderAvailabilityGroupButton = (group) => {
    const isSelected = selectedGroupLabel === (group.key || group.label);
    const availableCountInGroup = group.items.filter(s => !s.isReserved && !s.order?.orderId).length;
    const isCollectionGroup = group.tag === 'collection';
    const isBundleDealGroup = group.tag === 'bundleDeal';
    const isFullyReserved = !isCollectionGroup && availableCountInGroup === 0;

    return (
      <button 
        key={group.key || group.label} 
        onClick={() => handleSelectGroup(group)} 
        className={`relative px-4 py-2.5 rounded-xl border text-[13px] font-black uppercase tracking-[0.05em] transition-all flex items-center gap-2
          ${isSelected 
            ? isCollectionGroup
              ? 'bg-red-500 border-red-500 text-white shadow-lg shadow-red-500/20'
              : isBundleDealGroup
                ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20' 
            : isCollectionGroup
              ? 'bg-red-500/10 border-red-500/30 text-red-500 hover:border-red-500/60'
              : isBundleDealGroup
                ? 'bg-emerald-600/10 border-emerald-600/30 text-emerald-600 hover:border-emerald-600/60'
                : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/10 hover:border-blue-600/50'
          } 
          ${isFullyReserved && !isSelected ? 'opacity-50' : ''}
        `}
      >
        {!isCollectionGroup && !isBundleDealGroup && group.items.some(item => {
            const isEligible = item.isFreeShippingEligible;
            const until = item.freeShippingUntil;
            if (!isEligible) return false;
            if (!until) return true;
            return Date.now() < new Date(until).getTime();
        }) && (
          <span className="absolute -top-3 w-[80%] -right-3  tracking-[0.15em] font-black uppercase italic bg-emerald-500 text-white text-[11.5px] px-0.5 py-0.5 rounded-md font-bold shadow uppercase backdrop-blur-sm">
            FREE SHIPPING 
          </span>
        )}

        {isBundleDealGroup ? <Gift size={18}/> : group.isOnHand ? <Package size={18}/> : <Plane size={18}/>}

        {group.label}

        <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[8px] ${
          isSelected ? 'bg-white/20' : isCollectionGroup ? 'bg-red-500/10 text-red-500' : isBundleDealGroup ? 'bg-emerald-600/10 text-emerald-600' : 'bg-blue-600/10 text-blue-600'
        }`}>
          {isBundleDealGroup ? (group.deal?.kitIds || []).length : group.items.length}
        </span>
      </button>
    );
  };
  
  // Triggering re-parse to clear phantom syntax errors.
  return (
    <>
      <div 
        onClick={onClick || handleOpenModal} 
        className={`w-full group relative rounded-[2.2rem] p-[2px] ${isSpectralMode ? `bg-gradient-to-br ${spectralGradient}` : 'bg-black/5 dark:bg-white/5'} transition-all duration-500 lg:hover:-translate-y-1 cursor-pointer overflow-hidden`}
        style={{
          boxShadow: isDarkMode 
            ? isSpectralMode 
              ? `0 20px 25px -5px ${shadowColor}, 0 8px 10px -6px ${shadowColor}`
              : `0 20px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5)`
            : `0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)`
        }}
      >
        <div className={`relative rounded-[2.1rem] flex flex-col h-full overflow-hidden ${
          isDarkMode ? 'bg-[var(--color-surface)]' : 'bg-white'
        }`}>
          {/* Status Badges Container (Moved here to appear above inner border) */}
          <div className="absolute top-4 left-0 z-50 flex flex-col items-start">
                  {isEarlyAccess && <div className="px-1.5 py-0.5 font-black uppercase tracking-tigther text-[10px] md:text-[11px] bg-blue-500 text-white border-blue-400 shadow-lg animate-pulse mb-1">Early Access</div>}
                  {isFSEligible && <div className="px-1.5 py-0.5 font-black uppercase tracking-tigther text-[10px] md:text-[11px] bg-emerald-500 text-white border-emerald-400 shadow-lg mb-1 flex items-center gap-1">Free Shipping</div>}
                  {isExclusiveToBundle ? (
                    <div className="px-1.5 py-0.5 font-black uppercase tracking-tigther text-[10px] md:text-[11px] bg-emerald-500 text-white border-emerald-400 shadow-lg">
                      Bundle Exclusive
                    </div>
                  ) : availableCount > 0 ? (
                    <div className="px-1.5 py-0.5 font-bold uppercase tracking-tigther text-[10px] md:text-[11px] bg-emerald-500 text-white border-emerald-400 shadow-lg">
                       {availableCount} Available
                    </div>
                  ) : hasBundleExclusiveDeal ? (
                    <div className="px-1.5 py-0.5 font-black uppercase tracking-tigther text-[10px] md:text-[11px] bg-emerald-500 text-white border-emerald-400 shadow-lg">
                      Bundle Exclusive
                    </div>
                  ) : isAdminView && shelfCount > 0 ? (
                    <div className="px-1.5 py-0.5 font-black uppercase tracking-tigther text-[10px] md:text-[11px] bg-red-500 text-white border-red-400 shadow-lg">
                      {shelfCount} Reserved
                    </div>
                  ) : isCollectionOnly ? (
                    <div className="px-1.5 py-0.5 font-black uppercase tracking-tigther text-[10px] md:text-[11px] bg-red-500 text-white border-red-400 shadow-lg">
                      Collection
                    </div>
                  ) : stockList.some(s => s.isReserved) ? (
                    <div className={`px-1.5 py-0.5 font-black uppercase tracking-tigther text-[10px] md:text-[11px] ${isAdminView ? 'bg-blue-500 text-white border-blue-400' : 'bg-red-500 text-white border-red-400'} shadow-lg`}>
                      {isAdminView ? `${stockList.filter(s => s.isReserved).length} Reserved` : 'NOT FOR SALE'}
                    </div>
                  ) : (
                    <div className="px-1.5 py-0.5 font-black uppercase tracking-tigther text-[10px] md:text-[11px] bg-gray-500 text-white border-gray-400 shadow-lg">Out of Stock</div>
                  )}
               </div>
          <div className="p-3 flex flex-col h-full">
            <div className="relative aspect-square rounded-2xl overflow-hidden mb-3 bg-[var(--color-bg)] shrink-0 z-0">
              <div className="absolute inset-0 w-full h-full bg-white dark:bg-[var(--color-surface)] overflow-hidden rounded-2xl">
                 <img src={resolveImage(kit.image, kit?.images) || null} alt={kit.name} loading="lazy" className="w-full h-full object-cover transition-transform duration-700 lg:group-hover:scale-110 transform-gpu" />
                 <div className="absolute top-2 right-2 z-20">
                    {isAdmin && isAdminView && (
                      <button onClick={(e) => { e.stopPropagation(); onEdit(kit); }} className="px-2 py-1 rounded-full transition-all border bg-gradient-to-br from-amber-500 to-amber-600 border-white/20 shadow-lg text-white font-black uppercase text-[9px] tracking-widest hover:scale-110">
                        EDIT
                      </button>
                    )}
                 </div> 
              </div>
            </div>

            <div className="px-1 text-center flex-1 flex flex-col min-w-0">
                <div className="h-[2em] flex items-center justify-center min-w-0">
                  <h3 className="text-[13px] font-bold uppercase tracking-tighter leading-tight line-clamp-2 w-full group-hover:text-blue-600 transition-colors">{kit.name}</h3>
                </div>
            <div className="mt-auto min-w-0 min-h-[50px] flex flex-col justify-end">
                <div className="flex items-center justify-between gap-2 min-w-0 w-full">
                  <div className="flex items-center justify-between gap-2 min-w-0 w-full">
                  <div className="flex flex-col items-start pb-1 min-w-0 flex-1 text-left">
                    <span className="text-[13px] md:text-[15px] md:text-[15px] lg:text-[13px] font-black uppercase tracking-tighter truncate w-full block max-w-[120px] md:max-w-none">{kit.brand || 'NO BRAND'}</span>
                    <div className="flex items-baseline gap-1 w-full min-w-0">
                      {!isAdminView && (
                        <>
                          {(availableCount > 0 && !isExclusiveToBundle) ? (
                            <>
                              <span className="text-[13px] lg:text-[13px] font-black italic tracking-tighter leading-none text-amber-500 dark:text-amber-500 shrink-0">
                                ₱{lowestPrice.toLocaleString()}
                              </span>
                              <span className="text-[12px]  lg:text-[12px] font-black italic tracking-tighter line-through shrink-0">
                                ₱{refPrice.toLocaleString()}
                              </span>
                            </>
                          ) : isExclusiveToBundle && exclusiveBundlePrice > 0 ? (
                            <>
                              <span className="text-[13px] lg:text-[13px] font-black italic tracking-tighter leading-none text-emerald-500 shrink-0">
                                ₱{exclusiveBundlePrice.toLocaleString()}
                              </span>
                              <span className="text-[12px] lg:text-[12px] font-black italic tracking-tighter line-through opacity-40 shrink-0">
                                ₱{lowestPrice.toLocaleString()}
                              </span>
                            </>
                          ) : (
                            <span className={`text-[13px]  font-black tracking-tighter leading-none ${hasBundleExclusiveDeal ? 'text-emerald-500' : gridUnavailableClass}`}>
                                {hasBundleExclusiveDeal ? "BUNDLE EXCLUSIVE" : gridUnavailableLabel}
                            </span>
                          )}
                        </>
                      )}
                      {isAdminView && (
                        <>
                          {adminDisplayInfo ? (
                            <>
                              <span className="text-[13px] lg:text-[13px] font-black tracking-tighter leading-none text-neutral-900 dark:text-white shrink-0">
                                ₱{adminDisplayInfo.cost.toLocaleString()}
                              </span>
                              <span className="text-[12px] lg:text-[12px] font-black tracking-tighter line-through text-emerald-600 shrink-0">
                                ₱{adminDisplayInfo.profit.toLocaleString()}
                              </span>
                            </>
                          ) : (
                              <span className="inline-flex items-center text-[13px] font-bold text-red-600 leading-none">
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
                              removeFromBasket(shelfItem.basketId);
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
                      onClick={(e) => { e.stopPropagation(); availableCount <= 0 ? handleOpenModal() : handleAddToCart(); }} 
                      className="flex items-center justify-center w-8 h-8 rounded-full transition-all shadow-lg active:scale-95 bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-blue-500/40 lg:hover:scale-110 shrink-0"
                    >
                      {availableCount <= 0 ? (hasBundleExclusiveDeal ? <Gift size={14} className="text-white" /> : <Bell size={14} className="text-white fill-white" />) : <Plus size={16} strokeWidth={3} />}
                    </button>
                  )}
                </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 lg:p-12 bg-white/55 dark:bg-black/55 backdrop-blur-md animate-in fade-in duration-200 overflow-hidden overscroll-none touch-action-none">
          <div className={`relative w-full h-full lg:h-[70vh] lg:max-w-7xl flex flex-col lg:rounded-[2.5rem] lg:border lg:shadow-2xl overflow-hidden overscroll-none ${isDarkMode ? 'bg-[var(--color-bg)] border-white/10 text-white' : 'bg-white border-black/5 text-neutral-900'}`}>
            <div className="h-full max-h-full flex flex-col portrait:flex-col landscape:sm:flex-row items-stretch overflow-hidden">
              <div className="sticky top-0 z-[220] w-full h-0 overflow-visible sm:hidden">
                <div className="absolute top-4 right-4 flex justify-end items-center">
                    <button onClick={closeProductModal} className={`p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40`}><X size={20} /></button>
                </div>
              </div>
              <div className="hidden sm:block absolute top-4 right-4 z-[210]">
                <button onClick={closeProductModal} className={`p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40`}><X size={20} /></button>
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
                  <div className="flex-1 min-h-0 overflow-y-auto lg:pb-12 sm:pb-8 md:pb-6 space-y-5 text-left">
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
                                  <p className="text-[28px] sm:text-5xl font-black italic tracking-tighter leading-none text-blue-600 flex ">
                                    ₱{modalLowestPrice.toLocaleString()}
                                  </p>

                                  <div className="flex flex-col gap-0 pt-1 sm:pt-1.5">
                                    <p className="text-[10px] md:text-[14px] font-black italic tracking-tighter text-amber-600 leading-none whitespace-nowrap">
                                      LOWEST PRICE
                                    </p>

                                    <p className="text-[13px] md:text-[22px] font-black italic tracking-tighter opacity-80 leading-tight line-through">
                                      ₱{modalReferencePrice.toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                              )}
                              {isAdminView && (
                                <div className="flex items-center gap-2">
                                  <p className="text-[28px] sm:text-5xl font-black italic tracking-tighter leading-none text-neutral-900 dark:text-white flex ">
                                    ₱{(adminDisplayInfo?.cost || 0).toLocaleString()}
                                  </p>

                                  <div className="flex flex-col gap-0 pt-1 sm:pt-1.5 text-left">
                                    <p className="text-[10px] md:text-[14px] font-black italic tracking-tighter text-emerald-600 leading-none whitespace-nowrap">
                                      PROFIT
                                    </p>

                                    <p className="text-[13px] md:text-[22px] font-black italic tracking-tighter opacity-80 leading-tight line-through text-emerald-600">
                                      ₱{(adminDisplayInfo?.profit || 0).toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                      )}
                      <h2 className="pr-14 sm:pr-16 lg:pr-20 text-[16px] sm:text-4xl md:text-2xl lg:text-4xl font-black italic uppercase tracking-tighter leading-[0.9] break-words">{kit.name}</h2>
                      <div className="flex flex-wrap items-center gap-2 text-[14px]  font-black uppercase tracking-[0.2em] opacity-90">
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
                                  <p className="text-[28px] lg:text-[40px] font-black italic tracking-tighter leading-none text-blue-600 flex ">
                                    ₱{modalLowestPrice.toLocaleString()}
                                  </p>

                                  <div className="flex flex-col gap-0 pt-1.5">
                                    <p className="text-[12px] font-black italic tracking-tighter text-amber-600 leading-none whitespace-nowrap">
                                      LOWEST PRICE
                                    </p>

                                    <p className="text-[18px] font-black italic tracking-tighter opacity-80 leading-none line-through">
                                      ₱{modalReferencePrice.toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                              )}
                              {isAdminView && (
                                <div className="flex items-center gap-2">
                                  <p className="text-[28px] lg:text-[40px] font-black italic tracking-tighter leading-none text-neutral-900 dark:text-white flex ">
                                    ₱{(adminDisplayInfo?.cost || 0).toLocaleString()}
                                  </p>

                                  <div className="flex flex-col gap-0 pt-1.5 text-left">
                                    <p className="text-[12px] font-black italic tracking-tighter text-emerald-600 leading-none whitespace-nowrap">
                                      PROFIT
                                    </p>

                                    <p className="text-[18px] font-black italic tracking-tighter opacity-80 leading-none line-through text-emerald-600">
                                      ₱{(adminDisplayInfo?.profit || 0).toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                      )}
                    </div>
                    <div className="space-y-2 px-8">
                      <p className="text-[12px] font-black uppercase tracking-[0.1em] opacity-30 flex items-center gap-2 text-left"><Package size={18} /> Condition Details</p>
                      <div className="flex flex-wrap gap-1.5">
                        {conditionDetailsStock && getConditionDetails(conditionDetailsStock).length > 0 ? (
                          getConditionDetails(conditionDetailsStock).map((detail, i) => {
                              let colorClass = "bg-blue-500/10 text-blue-500 border-blue-500/20";
                              if (detail.value.includes("Pristine") || detail.value.includes("Built") || detail.value.includes("Complete")) colorClass = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
                              if (detail.value.includes("Dented") || detail.value.includes("Opened") || detail.value.includes("Incomplete") || detail.value.includes("Mark")) colorClass = "bg-amber-500/10 text-amber-400 border-amber-400/60";
                              return <span key={i} className={`text-[12px] font-black uppercase tracking-[0.05em] px-2.5 py-1 rounded-lg border shadow-sm ${colorClass}`}>{detail.label}</span>;
                              })
                        ) : (
                          <span className="text-[12px] font-black tracking-[0.1em] uppercase px-2.5 py-1 rounded-lg bg-neutral-500/10 text-neutral-500 border border-neutral-500/20">No Info</span>
                        )}
                      </div>
                      {/* 🌟 2. RE-CHECK MO KUNG GANITO ANG NAKALAGAY SA MAIN MODAL AREA 🌟 */}
                      {(conditionDetailsStock?.issueDescription || visibleStocks[0]?.issueDescription) && (
  <div className="mt-2 flex items-center gap-1.5 w-fit px-2.5 py-2 rounded-lg border shadow-sm bg-amber-500/10 text-amber-500 border-amber-500/20 dark:border-amber-400/60 text-[12px] font-black uppercase tracking-[0.05em]">
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
                      <h4 className="text-[12px] font-black uppercase tracking-[0.1em] opacity-30 flex items-center gap-2 text-left"><Bike size={20} /> AVAILABILITY</h4>
                      <div className="flex flex-wrap gap-2">
                        {availabilityGroups.length > 0 ? availabilityGroups.map(renderAvailabilityGroupButton) : <span className="text-[11px] font-black uppercase px-2.5 py-1 rounded-lg bg-neutral-500/10 text-neutral-500 border border-neutral-500/20">No Info</span>}
                      </div>

                      {isAdmin && isAdminView && collectionGroupedVariants.length > 0 && (
                        <div className="pt-4 space-y-2">
                          <h4 className="text-[12px] font-black uppercase tracking-[0.1em] opacity-30 flex items-center gap-2 text-left">
                            <ShelvingUnit size={18} /> COLLECTION
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {collectionGroupedVariants.map(renderAvailabilityGroupButton)}
                          </div>
                        </div>
                      )}

                      {!isAdminView && bundleDealDetails.length > 0 && (
                        <div className="pt-4 space-y-2">
                          <h4 className="text-[12px] font-black uppercase tracking-[0.1em] opacity-30 flex items-center gap-2 text-left">
                            <Gift size={18} /> DEALS
                          </h4>
                          <div className="space-y-2">
                            {bundleDealDetails.map(({ deal, includedKits, bundlePrice }) => (
                              <div key={deal.id} className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                                <div className="min-w-0 flex-1 text-left">
                                  <p className="truncate text-[12px] font-black uppercase italic leading-tight text-emerald-500">{deal.name}</p>
                                  <p className="mt-1 text-[9px] font-black uppercase tracking-widest opacity-50">
                                    Bundle Deal / {getDealCountdownLabel(deal.validUntil)}
                                  </p>
                                  <div className="mt-2 flex -space-x-2 overflow-hidden">
                                    {includedKits.slice(0, 6).map(includedKit => (
                                      <img
                                        key={includedKit.id}
                                        src={resolveImage(includedKit.image, includedKit.images)}
                                        className="h-8 w-8 rounded-full border-2 border-white bg-white object-cover dark:border-neutral-900"
                                        alt=""
                                      />
                                    ))}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-[13px] font-black italic text-amber-500">&#8369;{bundlePrice.toLocaleString()}</p>
                                  <p className="text-[8px] font-black uppercase opacity-40">{(deal.kitIds || []).length} Kits</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={`w-full bottom-0 p-2 border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] ${isDarkMode ? 'bg-black/80 border-white/10' : 'bg-white/80 border-black/5'} backdrop-blur-md z-[210] flex-none`}>
                    <div className={`grid transition-all duration-300 ease-in-out overflow-hidden ${selectedStock && selectedStock.isFreeShippingEligible && (!selectedStock.freeShippingUntil || now < new Date(selectedStock.freeShippingUntil).getTime()) ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                        <div className="overflow-hidden">
                            <div className="w-full mb-2 bg-emerald-500 rounded-lg p-1.5 flex items-center justify-center backdrop-blur-sm">
                                <span className="text-white font-black italic uppercase tracking-[0.2em] text-[11px] drop-shadow-md">
                                FREE SHIPPING {selectedStock?.freeShippingUntil ? `RUNS UNTIL ${new Date(selectedStock.freeShippingUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}` : 'ELIGIBLE'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row sm:items-center lg:items-center justify-between sm:gap-6 lg:gap-6">
                      <div className="flex-1 w-full flex sm:justify-end lg:justify-end">
                          {isPendingRelease && availableCount === 0 && !(isAdmin && isAdminView) ? (
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
                          ) : activeBundleDeal && activeBundleItemPrice > 0 && !isAdminView ? (
                            <div className="flex flex-col w-full gap-3">
                              {/* Price Difference Display */}
                              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-white/5 text-[10px] font-bold">
                                <span className="opacity-50">ORIGINAL PRICE: ₱{lowestPrice.toLocaleString()}</span>
                                <span className="text-emerald-500 font-black">BUNDLE DISCOUNT: -₱{Math.max(0, lowestPrice - activeBundleItemPrice).toLocaleString()}</span>
                                <span className="text-emerald-500 font-black text-xs">PROMO: ₱{activeBundleItemPrice.toLocaleString()}</span>
                              </div>
                              <div className="flex w-full items-stretch justify-center">
                                <button 
                                  onClick={openSelectedDealDetails} 
                                  className="w-full max-w-sm flex items-center justify-center gap-2 px-2 py-4 rounded-full text-white font-black italic uppercase text-[12px] tracking-widest shadow-lg transition-all active:scale-95 whitespace-nowrap bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/20"
                                >
                                  <Zap size={14} fill="currentColor" /> GRAB DEAL
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
                                  if (selectedShelfItem && window.confirm("Are you sure you want to release this stock back to the public?")) {
                                    removeFromBasket(selectedShelfItem.basketId);
                                  }
                                }} 
                                disabled={!selectedShelfItem}
                                className="flex-1 flex items-center justify-center gap-2 px-2 py-4 rounded-full text-white font-black italic uppercase text-[12px] tracking-widest shadow-lg transition-all active:scale-95 whitespace-nowrap disabled:opacity-30 bg-gradient-to-br from-amber-500 to-orange-600 shadow-orange-500/20"
                              >
                                <PackageMinus size={14} /> RELEASE
                              </button>
                            </div>
                          ) : (
                                 <div className="flex w-full items-stretch gap-2">
                                   {!isAdminView && (
                                     <button onClick={handleAddToCart} className="flex-1 flex items-center justify-center gap-2 px-2 py-4 rounded-full font-black italic uppercase text-[12px] tracking-widest transition-all active:scale-95 whitespace-nowrap border-t border-black/5 dark:border-white/10 group/basket bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20"><ShoppingBasket size={14} strokeWidth={2.5}/> {addToCartLabel}</button>
                                   )}
                                   <button onClick={(e) => handleBuyNow(e, selectedStock || visibleStocks[0])} className="flex-1 flex items-center justify-center gap-2 px-2 py-4 rounded-full text-white font-black italic uppercase text-[12px] tracking-widest shadow-2xl transition-all active:scale-95 whitespace-nowrap group/buy bg-gradient-to-br from-amber-500 to-orange-600 shadow-orange-500/30 hover:bg-orange-600">{buyLabel === "RELEASE STOCK" ? <PackageMinus size={14} /> : <ShoppingBag size={14} />}{buyLabel}</button>
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
      {isDealDetailsOpen && dealDetailsDeal && (
        <DealDetailsModal 
          isOpen={isDealDetailsOpen} 
          onClose={() => { setIsDealDetailsOpen(false); setDealForDetails(null); }} 
          deal={dealDetailsDeal} 
          onBuyNow={handleDealCheckout} 
        />
      )}

    </>
  );
}

