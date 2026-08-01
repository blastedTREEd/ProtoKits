import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Gift, Plus, Trash2, Box, Sparkles, Clock, Pencil, Search, Loader2, X, Wallet, AlertCircle, TrendingUp, Filter, Zap, ArrowUpWideNarrow, ArrowDownWideNarrow, SortAsc, SortDesc, ListOrdered, ChevronDown, Image as ImageIcon, Settings } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useTheme } from '../context/ThemeContext';
import PageTemplate from './PageTemplate';
import ProductCard from '../components/kitcards/ProductCard';
import KitSkeleton from '../components/kitcards/KitSkeleton';
import AddKitCard from '../components/kitcards/AddKitCard';
import AddKitModal from '../components/kitcards/AddKitModal';
import AddDealModal from '../components/kitcards/AddDealModal';
import DealDetailsModal from '../components/kitcards/DealDetailsModal';
import SupplierBalancesModal from '../components/kitcards/SupplierBalancesModal';
import SalesDashboardModal from '../components/kitcards/SalesDashboardModal';
import LoginPromptModal from '../components/menu/LoginPromptModal';
import LoadingState from '../components/common/LoadingState';
import { getCheckoutPaymentFees } from '../utils/paymentSettings';

// --- Spectral gradient helpers (mirrored from ProductCard) ---
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

const getSpectralGradient = (id) => {
  if (!id) return SPECTRAL_GRADIENTS[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h << 5) - h + id.charCodeAt(i);
    h |= 0;
  }
  return SPECTRAL_GRADIENTS[Math.abs(h) % SPECTRAL_GRADIENTS.length];
};

const getShadowColor = (gradientClass) => GRADIENT_COLORS[gradientClass] || 'rgba(8,102,255,0.2)';

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

function getPreviewTileClass(total, index) {
  if (total === 1) return 'col-span-2 row-span-2';
  if (total === 2) return 'col-span-2';
  if (total === 3 && index === 0) return 'col-span-2';
  return '';
}

function getOrderedKits(kits, kitIds) {
  const kitMap = new Map((kits || []).map(kit => [kit.id, kit]));
  return (kitIds || []).map(id => kitMap.get(id)).filter(Boolean);
}

function stockMatchesDealSource(stock, source = 'onhand') {
  const status = String(stock?.status || '').toLowerCase();
  const isPreOrder = status.includes('pre') || status.includes('batch');
  return source === 'preorder' ? isPreOrder : !isPreOrder;
}

function isBundlePurchasableStock(stock, source = 'onhand') {
  if (!stock || stock.order?.orderId || !stockMatchesDealSource(stock, source)) return false;
  return !stock.isReserved || stock.reservationType === 'admin';
}

export default function Kits() {
  const { 
    isAdmin, isAdminView, kits: storeKits, deals, 
    isLoading, addKit,
    user, setLoginModalOpen,
    shippingSettings
  } = useStore();

  const { handlingFee, installmentFee, transferFee } = useMemo(() => {
    if (!shippingSettings) return { handlingFee: 0, installmentFee: 0, transferFee: 0 };
    return getCheckoutPaymentFees({ shippingSettings });
  }, [shippingSettings]);

  const [searchTerm, setSearchTerm] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [sortType, setSortType] = useState("latest"); // Default sort
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortRef = useRef(null);
  
  // Reset displayLimit when filters change by deriving a key
  const displayResetKey = `${searchTerm}-${sortType}-${isAdminView}`;
  const [displayLimit, setDisplayLimit] = useState(60);
  const [prevResetKey, setPrevResetKey] = useState(displayResetKey);
  if (displayResetKey !== prevResetKey) {
    setPrevResetKey(displayResetKey);
    setDisplayLimit(60);
  }

  const [isAddKitModalOpen, setIsAddKitModalOpen] = useState(false); 
  const [isAddDealModalOpen, setIsAddDealModalOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [dealToEdit, setDealToEdit] = useState(null);
  const [kitToEdit, setKitToEdit] = useState(null);
  const [isSupplierBalancesModalOpen, setIsSupplierBalancesModalOpen] = useState(false);
  const [isSalesDashboardModalOpen, setIsSalesDashboardModalOpen] = useState(false);
  const [isLoginPromptOpen, setIsLoginPromptOpen] = useState(false);
  const [itemsForCheckout, setItemsForCheckout] = useState([]); 
  const [showSearchBar, setShowSearchBar] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const navigate = useNavigate();

  const openCheckoutPage = (items, isGuestPreview = !user) => {
    navigate('/checkout', { state: { items, isGuestPreview } });
  };

  useEffect(() => {
    const handler = setTimeout(() => {
        setSearchTerm(inputValue);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 250);
    return () => clearTimeout(handler);
  }, [inputValue]);

  // Handle outside click for sort dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (sortRef.current && !sortRef.current.contains(event.target)) {
        setIsSortOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Infinite Scroll States
  const [showSkeletons, setShowSkeletons] = useState(false);

  const sentinelRef = useRef(null);

  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => setShowSkeletons(true), 3000);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setShowSkeletons(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [isLoading]);


// --- Stable sort: hindi mag-re-sort ang cards kapag nagbago lang ang stock count sa real-time ---
  const [stableSortCache, setStableSortCache] = useState({ criteria: '', ids: [] });

  const allFilteredKits = useMemo(() => {
    if (!storeKits || !Array.isArray(storeKits)) return [];
    
    const nowStr = new Date().toISOString().slice(0, 16);
    const currentYear = new Date().getFullYear(); // 2026

    const getAvail = (k) => {
      const stocks = k?.stocks || {};
      return Object.values(stocks).filter(s => {
        const isVisible = (isAdmin && isAdminView) || !s?.publicReleaseDate || s?.publicReleaseDate <= nowStr;
        return isVisible && !s?.order?.orderId && !s?.isReserved;
      }).length;
    };

    const getLowestPrice = (k) => {
      const stocks = Object.values(k?.stocks || {}).filter(s => !s?.order?.orderId && !s?.isReserved);
      if (stocks.length > 0) {
        return Math.min(...stocks.map(s => Number(s.sellPrice || 0)));
      }
      return Number(k.sellPrice || 0);
    };

    const getTime = (kit) => {
      if (isAdmin && isAdminView) return kit?.lastUpdated ? (typeof kit.lastUpdated.toMillis === 'function' ? kit.lastUpdated.toMillis() : new Date(kit.lastUpdated).getTime()) : 0;
      const val = kit?.lastRestockedAt || kit?.createdAt || kit?.lastUpdated;
      if (!val) return 0;
      if (typeof val.toMillis === 'function') return val.toMillis();
      if (val.seconds) return val.seconds * 1000;
      return new Date(val).getTime() || 0;
    };

    let filtered = [...storeKits];

    if (searchTerm) {
      const searchWords = searchTerm.toLowerCase().replace(/[-&]/g, ' ').split(/\s+/).filter(Boolean);
      
      // Month mapping para sa mabilisang validation ng text search
      const monthMap = {
        'jan': 'january', 'feb': 'february', 'mar': 'march', 'apr': 'april',
        'may': 'may', 'jun': 'june', 'jul': 'july', 'aug': 'august',
        'sep': 'september', 'oct': 'october', 'nov': 'november', 'dec': 'december'
      };

      filtered = filtered.filter(kit => {
        const stocksArray = Object.values(kit?.stocks || {});
        
        // Isama ang orihinal na stock metadata
        const stockInfo = stocksArray.map(s => 
          `${s.status || ''} ${s.boxCondition || ''} ${s.kitCondition || ''} ${s.isReserved || s.order?.orderId ? 'reserved' : 'available'}`
        ).join(' ');

        // Kunin at pagsama-samahin ang lahat ng ETA values na nasa stocks ng kit na ito
        const stockEtas = stocksArray.map(s => (s.eta || '').toLowerCase()).join(' ');

        const hasFreeShipping = stocksArray.some(s => {
          if (!s.isFreeShippingEligible) return false;
          if (s.freeShippingUntil) {
            const expiry = new Date(s.freeShippingUntil).getTime();
            if (!Number.isNaN(expiry) && Date.now() >= expiry) return false;
          }
          return true;
        });
        const freeShippingStr = hasFreeShipping ? 'free shipping' : '';

        // Pagsamahin ang lahat para sa base matching text
        const targetString = `${kit?.name || ''} ${kit?.series || ''} ${kit?.brand || ''} ${kit?.specs?.line || ''} ${kit?.specs?.scale || ''} ${stockInfo} ${stockEtas} ${freeShippingStr}`.toLowerCase().replace(/[-]/g, ' ');

        return searchWords.every(word => {
          if (word.startsWith('!')) {
            const cmd = word.slice(1);
            if (cmd === 'brand') return !kit.brand || kit.brand.trim() === '';
            if (cmd === 'series') return !kit.series || kit.series.trim() === '';
            if (cmd === 'condition') return stocksArray.length === 0 || stocksArray.some(s => !s.boxCondition || !s.kitCondition);
            if (cmd === 'status') return stocksArray.length === 0 || stocksArray.some(s => !s.status);
            if (cmd === 'image') return !kit.image || kit.image.trim() === '';
            if (cmd === 'price') return (!kit.sellPrice || kit.sellPrice === 0) && (stocksArray.length === 0 || stocksArray.some(s => !s.sellPrice || s.sellPrice === 0));
            if (cmd === 'scale') return !kit.specs?.scale || kit.specs.scale.trim() === '';
            if (cmd === 'line') return !kit.specs?.line || kit.specs.line.trim() === '';
            
            if (cmd === 'any') {
              const hasNoBrand = !kit.brand || kit.brand.trim() === '';
              const hasNoSeries = !kit.series || kit.series.trim() === '';
              const hasNoCondition = stocksArray.length === 0 || stocksArray.some(s => !s.boxCondition || !s.kitCondition);
              const hasNoStatus = stocksArray.length === 0 || stocksArray.some(s => !s.status);
              const hasNoImage = !kit.image || kit.image.trim() === '';
              const hasNoPrice = (!kit.sellPrice || kit.sellPrice === 0) && (stocksArray.length === 0 || stocksArray.some(s => !s.sellPrice || s.sellPrice === 0));
              const hasNoScale = !kit.specs?.scale || kit.specs.scale.trim() === '';
              const hasNoLine = !kit.specs?.line || kit.specs.line.trim() === '';
              return hasNoBrand || hasNoSeries || hasNoCondition || hasNoStatus || hasNoImage || hasNoPrice || hasNoScale || hasNoLine;
            }
            return true; 
          }

          if (word === 'built' || word === 'unbuilt') {
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            return regex.test(targetString);
          }

          // --- SMART ETA MATCHING ENGINE ---
          // Tingnan kung ang hinahanap na salita ay isang valid na buwan (short or full name)
          const matchedFullMonth = monthMap[word] || (Object.values(monthMap).includes(word) ? word : null);
          
          if (matchedFullMonth) {
            // Gumawa ng regular expression para hanapin ang buwan (kahit short form) na sinusundan o pinangungunahan ng kahit anong text, 
            // O kaya nama'y tumpak na tumutugma sa data ng ETA ng stock.
            const monthRegex = new RegExp(`\\b${word}|\\b${matchedFullMonth.slice(0,3)}`, 'i');
            
            if (stocksArray.some(s => {
              const etaText = (s.eta || '').toLowerCase();
              if (!etaText) return false;

              // Match 1: Tumutugma ba ang text sa pangalan ng buwan?
              const hasMonth = monthRegex.test(etaText);
              
              // Match 2: Kung walang tinukoy na taon sa search, salain kung ito ay para sa kasalukuyan o darating na taon
              // Kinukuha natin ang mga digit sa ETA (gaya ng 2026, 2027)
              const yearMatch = etaText.match(/\d{4}/);
              const etaYear = yearMatch ? parseInt(yearMatch[0], 10) : currentYear;

              return hasMonth && etaYear >= currentYear;
            })) {
              return true;
            }
          }

          // Fallback sa normal na text string matching kung hindi buwan o walang nahanap sa ETA
          return targetString.includes(word);
        });
      });
    }

    const processedKits = filtered.map(kit => {
        const avail = getAvail(kit);
        const hasReserved = Object.values(kit?.stocks || {}).some(s => s.isReserved && !s.order?.orderId);
        
        let statusOrder = 0; 
        if (avail > 0) statusOrder = 2;
        else if (hasReserved) statusOrder = 1;

        return {
            ...kit,
            _avail: avail,
            _price: getLowestPrice(kit),
            _time: getTime(kit),
            _statusOrder: statusOrder
        };
    });

    // --- Stable sort logic: mag-re-sort lang kapag nagbago ang sort criteria (search, sortType, view) ---
    const currentSortCriteria = `${searchTerm}||${sortType}||${isAdminView}`;
    const sortCriteriaChanged = currentSortCriteria !== stableSortCache.criteria;
    const currentFilteredIds = new Set(processedKits.map(k => k.id));
    // Alamin kung may bago o nawala na kit (hindi lang stock change)
    const cachedIds = new Set(stableSortCache.ids);
    const hasNewKits = processedKits.some(k => !cachedIds.has(k.id));
    const hasRemovedKits = stableSortCache.ids.some(id => !currentFilteredIds.has(id));
    const needsResort = sortCriteriaChanged || hasNewKits || hasRemovedKits || stableSortCache.ids.length === 0;

    if (needsResort) {
      // Kailangan mag-sort: either nagbago ang criteria o may bago/nawala na kit
      let sorted;
      if (searchTerm) {
        sorted = [...processedKits].sort((a, b) => {
          if (a._statusOrder !== b._statusOrder) return b._statusOrder - a._statusOrder;
          if (a._avail !== b._avail) return b._avail - a._avail;
          return a.name.localeCompare(b.name);
        });
      } else if (sortType === 'latest') {
        sorted = processedKits;
      } else {
        sorted = [...processedKits].sort((a, b) => {
          if (a._statusOrder !== b._statusOrder) return b._statusOrder - a._statusOrder;
          switch (sortType) {
            case 'price-asc': return a._price - b._price;
            case 'price-desc': return b._price - a._price;
            case 'alpha-asc': return a.name.localeCompare(b.name);
            case 'alpha-desc': return b.name.localeCompare(a.name);
            case 'avail-asc': return a._avail - b._avail;
            case 'avail-desc': return b._avail - a._avail;
            default: return 0;
          }
        });
      }
      return sorted;
    }

    // Hindi nagbago ang sort criteria — gamitin ang cached order para hindi mag-jump ang cards
    const kitMap = new Map(processedKits.map(k => [k.id, k]));
    return stableSortCache.ids.map(id => kitMap.get(id)).filter(Boolean);
  }, [storeKits, isAdmin, isAdminView, searchTerm, sortType, stableSortCache]);

  useEffect(() => {
    const currentSortCriteria = `${searchTerm}||${sortType}||${isAdminView}`;
    const nextIds = allFilteredKits.map(kit => kit.id);
    const timer = window.setTimeout(() => {
      setStableSortCache(prev => {
        const sameCriteria = prev.criteria === currentSortCriteria;
        const sameIds = prev.ids.length === nextIds.length && prev.ids.every((id, index) => id === nextIds[index]);
        return sameCriteria && sameIds ? prev : { criteria: currentSortCriteria, ids: nextIds };
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [allFilteredKits, searchTerm, sortType, isAdminView]);

  const visibleKits = useMemo(() => {
    return allFilteredKits.slice(0, displayLimit);
  }, [allFilteredKits, displayLimit]);

  // Infinite Scroll Observer (Client-side pagination)
  useEffect(() => {
    if (isLoading) return;
    if (visibleKits.length >= allFilteredKits.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDisplayLimit(prev => Math.min(prev + 12, allFilteredKits.length));
        }
      },
      { 
        rootMargin: '800px', // Trigger fetch when sentinel is 800px from the viewport
        threshold: 0.0
      }
    );

    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [isLoading, visibleKits.length, allFilteredKits.length]);



  // Handle scroll-based search bar visibility
  useEffect(() => {
    const handleSearchBarScroll = () => {
      if (document.activeElement?.tagName !== 'INPUT' && window.innerWidth < 1024) {
        const currentScrollY = window.scrollY;
        if (currentScrollY > lastScrollY && currentScrollY > 100) setShowSearchBar(false);
        else setShowSearchBar(true);
        setLastScrollY(currentScrollY);
      }
    };
    window.addEventListener('scroll', handleSearchBarScroll);
    return () => window.removeEventListener('scroll', handleSearchBarScroll);
  }, [lastScrollY]);

  const filteredDeals = useMemo(() => {
    if (!deals || !Array.isArray(deals)) return [];
    // Mutually exclusive deals have no deal card — hide from kits grid
    const visible = deals.filter(d => d?.type !== 'mutually_exclusive');
    // Auto-hide unfulfillable deals: every kit must have at least one available stock
    const fulfillable = visible.filter(d => {
      if (d?.type !== 'bundle_discount' && d?.type !== 'bundle_only') return true;
      return (d.kitIds || []).every(kitId => {
        const kit = (storeKits || []).find(k => k.id === kitId);
        if (!kit) return false;
        const stocks = Object.values(kit.stocks || {});
        return stocks.some(s => isBundlePurchasableStock(s, d.stockSource || 'onhand'));
      });
    });
    if (!searchTerm) return fulfillable;
    const lowerSearch = searchTerm.toLowerCase();
    return fulfillable.filter(deal => deal?.name?.toLowerCase().includes(lowerSearch));
  }, [deals, storeKits, searchTerm]);

  const handleSaveNewKit = async (newKit) => {
    try { return await addKit(newKit); } catch (e) { console.error(e); throw e; }
  };
  
  const handleEditKit = (kit) => {
    setKitToEdit(kit);
    setIsAddKitModalOpen(true);
  };

  const handleCloseDealModal = () => {
    setIsAddDealModalOpen(false);
    setDealToEdit(null);
  };

  const handleDealCheckout = (deal) => {
    if (!deal || !deal.kitIds || deal.type === 'mutually_exclusive') return;
    const bundleKits = (storeKits || []).filter(k => deal.kitIds.includes(k.id));
    const normalTotal = bundleKits.reduce((sum, k) => {
      const stocks = Object.values(k.stocks || {});
      const sourceStock = stocks.find(s => stockMatchesDealSource(s, deal.stockSource || 'onhand'));
      return sum + (sourceStock?.sellPrice || stocks[0]?.sellPrice || k.sellPrice || 0);
    }, 0);

    const { exclusiveDiscountPercent } = getCheckoutPaymentFees({ shippingSettings });
    const exclusiveKitIds = deal.exclusiveKitIds || [];
    const pct = exclusiveDiscountPercent / 100;

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

    setItemsForCheckout(items);
    setSelectedDeal(null);
    if (!user) { setIsLoginPromptOpen(true); return; }
    openCheckoutPage(items, false);
  };

  const handleDealCardClick = (deal) => {
    setSelectedDeal(deal);
  };

  const handleBuyNowFromCard = (item) => {
    console.log("handleBuyNowFromCard called with:", item);
    const isPreOrder = item.stock?.status?.toLowerCase().includes('pre') || item.stock?.status?.toLowerCase().includes('batch');
    const price = item.stock?.sellPrice ? (Number(item.stock.sellPrice) + handlingFee + installmentFee + transferFee) : item.displayPrice;
    const itemData = {
      ...item.kit,
      stockKey: item.stock?.key,
      selectedStockId: item.stock?.timestamp,
      status: item.stock?.status,
      isPreOrder,
      minDownpayment: item.stock?.minDownpayment,
      name: item.kit?.name || '',
      price,
      appliedHandlingFee: handlingFee,
      appliedInstallmentFee: installmentFee,
      appliedTransferFee: transferFee,
      isFreeShippingEligible: item.stock?.isFreeShippingEligible || false,
      freeShippingUntil: item.stock?.freeShippingUntil || '',
      freeShippingMethod: item.stock?.freeShippingMethod || 'All',
      freeShippingSuboption: item.stock?.freeShippingSuboption || 'All'
    };
    
    // Always prepare the items for checkout
    console.log("Setting itemsForCheckout:", [itemData]);
    setItemsForCheckout([itemData]);
    
    // Check auth
    if (!user) { 
        console.log("User not logged in, opening LoginPromptModal");
        setIsLoginPromptOpen(true); 
        return; 
    }
    
    // Authenticated flow: Open checkout modal directly (without adding to basket)
    console.log("User authenticated, opening checkout modal");
    if (!(isAdmin && isAdminView)) {
        console.log("Navigating to checkout page");
        openCheckoutPage([itemData], false);
    }
  };
  
  const { isDarkMode, isSpectralMode } = useTheme();

  return (
    <PageTemplate isDarkMode={isDarkMode}>
      <div className="min-h-screen w-full bg-neutral-50 dark:bg-[#0a0a0a] transition-colors duration-500 pb-20 font-sans text-left">
        <div className={`sticky top-[56px] sm:top-[60px] z-[90] h-[60px] bg-neutral-50/90 dark:bg-[#0a0a0a]/90 backdrop-blur-md border-b border-black/5 dark:border-white/5 transition-transform duration-300 ${showSearchBar ? 'translate-y-0' : '-translate-y-full'}`}>
          <div className="h-full w-full px-4 lg:px-8 flex items-center justify-center gap-4">
            <div className="hidden lg:block absolute left-8">
                <h1 className="text-sm font-black italic uppercase tracking-tighter text-neutral-900 dark:text-white leading-none whitespace-nowrap">GARAGE KITS</h1>
            </div>
            <div className="flex-1 max-w-2xl flex items-center gap-4">
                  <div className="relative flex-1">
                      <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20 text-neutral-900 dark:text-white" />
                      <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                      placeholder="SEARCH KITS OR SERIES..."
                      className="w-full pl-12 pr-12 py-3 bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl text-[11px] font-black uppercase tracking-widest outline-none focus:border-blue-500 transition-all"
                      />
                      {inputValue && (
                        <button onClick={() => setInputValue("")} className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-colors">
                           <X size={12} className="opacity-50" />
                        </button>
                      )}
                  </div>
                  <div className="relative" ref={sortRef}>
                    <button 
                      onClick={() => setIsSortOpen(!isSortOpen)}
                      className="flex items-center gap-2 px-4 py-3 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/10 shrink-0 z-10 hover:bg-blue-600 transition-all active:scale-95 group"
                    >
                        <Filter 
                          size={16} 
                          className={`transition-all ${isSortOpen ? "text-blue-600 fill-blue-600" : "text-black dark:text-white opacity-70"} group-hover:text-white group-hover:fill-white group-hover:opacity-100`} 
                        />
                        <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline text-black dark:text-white group-hover:text-white">Sort</span>
                        <ChevronDown size={12} className={`text-black dark:text-white opacity-40 transition-transform ${isSortOpen ? 'rotate-180' : ''} group-hover:text-white group-hover:opacity-100`} />
                    </button>

                    {isSortOpen && (
                      <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-neutral-900 border border-black/5 dark:border-white/10 rounded-2xl shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-2 space-y-1">
                          {[
                            { id: 'latest', label: 'Latest Updates', icon: <Clock size={14} /> },
                            { id: 'price-asc', label: 'Price: Lowest', icon: <ArrowUpWideNarrow size={14} /> },
                            { id: 'price-desc', label: 'Price: Highest', icon: <ArrowDownWideNarrow size={14} /> },
                            { id: 'alpha-asc', label: 'Name: A - Z', icon: <SortAsc size={14} /> },
                            { id: 'alpha-desc', label: 'Name: Z - A', icon: <SortDesc size={14} /> },
                            { id: 'avail-asc', label: 'Stock: Least', icon: <ListOrdered size={14} /> },
                            { id: 'avail-desc', label: 'Stock: Most', icon: <ListOrdered size={14} /> },
                          ].map((option) => (
                            <button
                              key={option.id}
                              onClick={() => {
                                 setSortType(option.id);
                                 setIsSortOpen(false);
                                 window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                sortType === option.id 
                                  ? 'bg-blue-600 text-white' 
                                  : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-60 hover:opacity-100'
                              }`}
                            >
                              {option.icon}
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
              </div>
            </div>
          </div>

          <main className="min-w-350 mx-auto px-4 md:px-8 mt-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 sm:portrait:grid-cols-3 md:grid-cols-4 md:portrait:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-3 items-start justify-items-center">
              {isAdmin && isAdminView && (
                <div className="h-[2em] w-full h-full p-0">
                  <div className="grid gap-2 h-full w-full grid-cols-2 grid-rows-2">
                    <button onClick={() => setIsAddKitModalOpen(true)} className="flex flex-col items-center justify-center p-6 h-full bg-blue-600/10 dark:bg-blue-600/20 border-2 border-dashed border-blue-600/20 dark:border-blue-500/40 hover:border-blue-600/50 rounded-[2.1rem] transition-all group">
                      <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-cyan-400 text-white shadow-xl shadow-blue-600/20 mb-2">
                        <Plus size={24} className="group-hover:rotate-12 transition-transform" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">Add Kit</span>
                    </button>
                    <button onClick={() => setIsAddDealModalOpen(true)} className="flex flex-col items-center justify-center p-6 h-full bg-emerald-600/10 dark:bg-emerald-600/20 border-2 border-dashed border-emerald-600/20 dark:border-emerald-500/40 hover:border-emerald-600/50 rounded-[2.1rem] transition-all group">
                      <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-600 to-lime-400 text-white shadow-xl shadow-emerald-600/20 mb-2">
                        <Gift size={24} className="group-hover:rotate-12 transition-transform" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">New Deal</span>
                    </button>
                    <button onClick={() => setIsSupplierBalancesModalOpen(true)} className="flex flex-col items-center justify-center p-6 h-full bg-amber-600/10 dark:bg-amber-600/20 border-2 border-dashed border-amber-600/20 dark:border-amber-500/40 hover:border-amber-600/50 rounded-[2.1rem] transition-all group">
                      <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-amber-600 to-yellow-400 text-white shadow-xl shadow-amber-600/20 mb-2">
                        <Wallet size={24} className="group-hover:rotate-12 transition-transform" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">Balances</span>
                    </button>
                    <button onClick={() => setIsSalesDashboardModalOpen(true)} className="flex flex-col items-center justify-center p-6 h-full bg-indigo-600/10 dark:bg-indigo-600/20 border-2 border-dashed border-indigo-600/20 dark:border-indigo-500/40 hover:border-indigo-600/50 rounded-[2.1rem] transition-all group">
                      <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-400 text-white shadow-xl shadow-indigo-600/20 mb-2">
                        <TrendingUp size={24} className="group-hover:rotate-12 transition-transform" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 text-center leading-tight">Sales<br/>Dashboard</span>
                    </button>
                  </div>
                </div>
              )}

              {filteredDeals.map(deal => {
                if (!deal) return null;
                const orderedKitIds = [
                  ...(deal.previewKitIds || []),
                  ...(deal.kitIds || []).filter(id => !(deal.previewKitIds || []).includes(id))
                ];
                const includedKits = getOrderedKits(storeKits, orderedKitIds);
                const previewKits = includedKits.slice(0, 4);
                const remainingCount = Math.max(0, includedKits.length - 4);
                const countdownLabel = getDealCountdownLabel(deal.validUntil);
                const dealGradient = getSpectralGradient(deal.id);
                const dealShadow = getShadowColor(dealGradient);
                return (
                  <div key={deal.id} onClick={() => handleDealCardClick(deal)} className={`w-full group relative rounded-[2.2rem] p-[2px] ${isSpectralMode ? `bg-gradient-to-br ${dealGradient}` : 'bg-black/5 dark:bg-white/5'} transition-all duration-500 lg:hover:-translate-y-1 cursor-pointer overflow-hidden h-full`}
                    style={{
                      boxShadow: isDarkMode
                        ? isSpectralMode
                          ? `0 20px 25px -5px ${dealShadow}, 0 8px 10px -6px ${dealShadow}`
                          : `0 20px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5)`
                        : `0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)`
                    }}
                  >
                    <div className="relative rounded-[2.1rem] flex flex-col h-full p-3 bg-white dark:bg-[var(--color-surface)]">
                      <div className="absolute top-4 left-0 z-50 flex flex-col items-start">
                        <div className="px-1.5 py-0.5 font-bold uppercase tracking-tigther text-[10px] md:text-[11px] bg-emerald-500 text-white border-emerald-400 shadow-lg">
                           {countdownLabel}
                        </div>
                      </div>
                      <div className="relative aspect-square rounded-2xl overflow-hidden mb-3 bg-white dark:bg-[var(--color-surface)] shrink-0">
                          <div className="grid gap-1.5 h-full w-full grid-cols-2 grid-rows-2">
                            {previewKits.length > 0 ? previewKits.map((kit, idx) => (
                              <div key={kit?.id || idx} className={`relative w-full h-full rounded-xl overflow-hidden ${getPreviewTileClass(previewKits.length, idx)}`}>
                                <img src={(() => { const id = kit?.image; if (!id) return ''; if (id.startsWith('data:') || id.startsWith('http')) return id; const match = (kit?.images || []).find(img => img.id === id); return match?.url || id; })()} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="" />
                                {idx === 3 && remainingCount > 0 && (
                                  <div className="absolute inset-0 flex items-center justify-center text-white text-[13px] font-black italic drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                                    +{remainingCount}
                                  </div>
                                )}
                              </div>
                            )) : <div className="col-span-2 flex items-center justify-center text-emerald-600 opacity-20"><Gift size={40} strokeWidth={1} /></div>}
                          </div>
                      </div>
                      <div className="px-1 text-center flex-1 flex flex-col min-w-0">
                          <div className=" flex items-center justify-center min-w-0">
                            <h3 className="text-[12px] lg:text-[13px] font-bold uppercase tracking-tighter leading-tight line-clamp-2 w-full group-hover:text-emerald-600 transition-colors" title={deal.name}>{deal.name}</h3>
                          </div>
                          <div className="mt-auto min-w-0 min-h-[50px] flex flex-col justify-end">
                            <div className="flex items-center justify-between gap-2 min-w-0 w-full pb-1">
                                <div className="flex flex-col items-start pb-1 min-w-0 flex-1 text-left">
                                  <span className={`text-[13px] md:text-[15px] lg:text-[13px] font-black uppercase tracking-tighter truncate w-full block ${(isAdmin && isAdminView) ? 'text-blue-500 dark:text-blue-400' : 'text-emerald-500 dark:text-emerald-400'}`}>{(isAdmin && isAdminView) ? 'EDIT DEAL' : 'GRAB DEAL!'}</span>
                                  <div className="flex items-baseline gap-1 w-full min-w-0">
                                     <span className="text-[13px] md:text-[15px] lg:text-[13px] font-black italic tracking-tighter leading-none text-amber-500 dark:text-amber-400">₱{(deal.bundlePrice || 0).toLocaleString()}</span>
                                  </div>
                                </div>
                                {(isAdmin && isAdminView) ? (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setDealToEdit(deal); setIsAddDealModalOpen(true); }} 
                                    className="flex items-center justify-center w-8 h-8 rounded-full transition-all shadow-lg active:scale-95 bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-blue-500/40 lg:hover:scale-110 shrink-0"
                                    title="Edit Deal"
                                  >
                                    <Settings size={14} />
                                  </button>
                                ) : (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleDealCheckout(deal); }} 
                                    className="flex items-center justify-center w-8 h-8 rounded-full transition-all shadow-lg active:scale-95 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-emerald-500/40 lg:hover:scale-110 shrink-0"
                                    title="Grab Deal"
                                  >
                                    <Zap size={14} fill="currentColor" />
                                  </button>
                                )}
                            </div>
                          </div>
                      </div>
                    </div>
                  </div>
                );
              })}

               {visibleKits.map((kit) => {
                const isUpdating = kitToEdit?.id === kit.id;
                return (
                  <div key={kit.id} className={`w-full h-full transition-opacity duration-500 ${isUpdating ? 'opacity-30' : 'opacity-100'}`}>
                    {isUpdating ? (
                      <KitSkeleton />
                    ) : (
                      <ProductCard 
                        kit={kit} 
                        onBuyNowClick={handleBuyNowFromCard} 
                        onEdit={handleEditKit}
                      />
                    )}
                  </div>
                );
              })}
              
              {isLoading && <div className="w-full h-full"><KitSkeleton /></div>}

              {isLoading && allFilteredKits.length === 0 ? (
                Array.from({ length: 15 }).map((_, i) => <div key={`skeleton-init-${i}`} className="w-full h-full"><KitSkeleton /></div>)
              ) : visibleKits.length < allFilteredKits.length ? (
                <>
                  {Array.from({ length: searchTerm ? 1 : (isAdminView ? 5 : 6) }).map((_, i) => (
                    <div key={`skeleton-buffer-${i}`} className="w-full h-full">
                      <KitSkeleton />
                    </div>
                  ))}
                  {searchTerm && (
                    <div className="col-span-2 sm:col-span-3 lg:col-span-4 xl:col-span-5 2xl:col-span-5 py-6 text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-900 dark:text-white opacity-60">
                            Loading ...
                        </p>
                    </div>
                  )}
                </>
              ) : allFilteredKits.length > 0 && (
                <div className="col-span-2 sm:col-span-3 lg:col-span-4 xl:col-span-5 2xl:col-span-5 py-12 text-center">
                  <p className="text-[11px] font-black uppercase tracking-widest text-neutral-900 dark:text-white">
                    {searchTerm ? (
                      "All kits loaded!"
                    ) : (
                      <>
                        All kits loaded! To stay updated, follow <a href="https://www.facebook.com/profile.php?id=61576855103826" target="_blank" rel="noopener noreferrer" className="text-garage-blue  hover:underline">SnorlaxGarage</a> on Facebook
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>

            {isLoading && !showSkeletons && (
              <div className="flex justify-center py-20 w-full">
                <LoadingState message="Loading kits..." />
              </div>
            )}

            <div ref={sentinelRef} className="h-40 w-full flex items-center justify-center mt-8" />

            {allFilteredKits.length === 0 && !isLoading && searchTerm !== "" && (
              <div className="py-20 flex flex-col items-center justify-center opacity-20 text-neutral-900 dark:text-white">
                <Search size={48} strokeWidth={1} />
                <p className="mt-4 font-black uppercase tracking-widest text-sm">No results found for "{searchTerm}"</p>
              </div>
            )}
          </main>

          <AddKitModal isOpen={isAddKitModalOpen} onClose={() => { setIsAddKitModalOpen(false); setKitToEdit(null); }} onSave={handleSaveNewKit} editingKit={kitToEdit} />
          <AddDealModal isOpen={isAddDealModalOpen} onClose={handleCloseDealModal} dealToEdit={dealToEdit} />
          <DealDetailsModal
            isOpen={!!selectedDeal}
            onClose={() => setSelectedDeal(null)}
            deal={selectedDeal}
            onBuyNow={handleDealCheckout}
            isEditMode={isAdmin && isAdminView}
            onEditDeal={(deal) => {
              setSelectedDeal(null);
              setDealToEdit(deal);
              setIsAddDealModalOpen(true);
            }}
          />
          <SupplierBalancesModal isOpen={isSupplierBalancesModalOpen} onClose={() => setIsSupplierBalancesModalOpen(false)} />
          <SalesDashboardModal isOpen={isSalesDashboardModalOpen} onClose={() => setIsSalesDashboardModalOpen(false)} />
          <LoginPromptModal isOpen={isLoginPromptOpen} onClose={() => setIsLoginPromptOpen(false)} onLogin={() => { setLoginModalOpen(true); setIsLoginPromptOpen(false); }} onContinue={() => { setIsLoginPromptOpen(false); openCheckoutPage(itemsForCheckout, true); }} continueLabel="Check Price & Shipping" />

      </div>
    </PageTemplate>
  );
}
