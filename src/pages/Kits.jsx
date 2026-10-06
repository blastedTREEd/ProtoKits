import React, { useState, useMemo, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Package, Gift, Plus, Trash2, Box, ClockFading, Pencil, Search, X, Wallet, AlertCircle, TrendingUp, Zap, Sparkles, ArrowBigDownDash, ArrowBigUpDash, ArrowBigRightDash, ArrowBigLeftDash, ChevronDown, MoreHorizontal, Image as ImageIcon, Settings } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useTheme } from '../context/ThemeContext';
import PageTemplate from './PageTemplate';
import ProductCard from '../components/kitcards/ProductCard';
import KitSkeleton from '../components/kitcards/KitSkeleton';
import AddKitCard from '../components/kitcards/AddKitCard';
const AddKitModal = lazy(() => import('../components/kitcards/AddKitModal'));
const AddDealModal = lazy(() => import('../components/kitcards/AddDealModal'));
const DealDetailsModal = lazy(() => import('../components/kitcards/DealDetailsModal'));
const SupplierBalancesModal = lazy(() => import('../components/kitcards/SupplierBalancesModal'));
const SalesDashboardModal = lazy(() => import('../components/kitcards/SalesDashboardModal'));
const KitDataQualityModal = lazy(() => import('../components/kitcards/KitDataQualityModal'));
import { getCheckoutPaymentFees } from '../utils/paymentSettings';
import { getBundleDealPricing, getClearanceBundlePricing, getFlexiBundlePreviewPricing, getHighestCostStock } from '../utils/bundlePricing';
import { isOfferCheckoutActive } from '../utils/offerUtils';
import { getDealGrabLabel } from '../utils/dealSavings';
import { getStockEta } from '../utils/stockDates';
import { isFlexiBundleDeal, isPerKitClearanceDeal, isWildSaleDeal, getActiveClearanceKitIds, getClearanceDisplayLabel } from '../utils/dealTypes';
import UniversalImage from '../components/common/UniversalImage';
import { getBundleDisplayTotals } from '../utils/bundleDisplayPricing';
import { APP_CONFIG } from '../appConfig';

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
const KIT_RETURN_STORAGE_KEY = 'sg:kits:returnTarget';

const finishSearchInput = (input) => {
  input?.blur();

  if (typeof window === 'undefined') return;

  // iOS Safari can finish dismissing the keyboard one frame after blur. Blur
  // again after the viewport settles so the temporary input zoom is released.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (document.activeElement === input) input?.blur();
    });
  });
};

function getTimestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'object' && Number.isFinite(value.seconds)) {
    return value.seconds * 1000;
  }
  if (typeof value === 'number') return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDealLatestTime(deal) {
  return Math.max(
    getTimestampMs(deal?.createdAt),
    getTimestampMs(deal?.validFrom)
  );
}

function getDealKitIds(deal) {
  return [...new Set([
    ...(deal?.previewKitIds || []),
    ...(deal?.kitIds || [])
  ].map(String))];
}

function getDealKits(deal, kits) {
  const kitIds = new Set(getDealKitIds(deal));
  return (kits || []).filter((kit) => kitIds.has(String(kit?.id)));
}

function getDealAvailableBundleCount(deal, kits) {
  const kitIds = [...new Set((deal?.kitIds || []).map(String))];
  if (kitIds.length === 0) return 0;

  const source = deal.stockSource || 'onhand';
  const kitMap = new Map((kits || []).map((kit) => [String(kit?.id), kit]));
  const availableCounts = kitIds.map((kitId) => {
    const kit = kitMap.get(kitId);
    if (!kit) return 0;
    return Object.values(kit.stocks || {}).filter((stock) => (
      isBundlePurchasableStock(stock, source)
    )).length;
  });

  return Math.min(...availableCounts);
}

function parseDealDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'object' && Number.isFinite(value.seconds)) {
    return new Date(value.seconds * 1000);
  }
  if (typeof value === 'number') return new Date(value);
  if (typeof value !== 'string') {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const [datePart, timePart = '00:00'] = value.split('T');
  const [year, month, day] = (datePart || '').split('-').map(Number);
  const [hours, minutes] = (timePart || '').split(':').map(Number);
  if (![year, month, day, hours, minutes].every(Number.isFinite)) {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
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

function getDealRemainingDays(deal) {
  const endDate = parseDealDate(deal?.validUntil);
  if (!endDate) return -Infinity;
  const diffMs = endDate.getTime() - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / 86400000);
}

function getDealRemainingTimeMs(deal) {
  const endDate = parseDealDate(deal?.validUntil);
  if (!endDate) return -Infinity;
  return endDate.getTime();
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
  const status = String(stock?.status || '').toLowerCase().trim();
  const isPreOrder = status.includes('pre') || status.includes('batch') || status.includes('eta');
  const isOnHand = status === 'onhand' || status === 'on hand';
  return source === 'preorder' ? isPreOrder : isOnHand;
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

function isBundlePurchasableStock(stock, source = 'onhand') {
  if (!stock || hasOrderAssociation(stock) || !stockMatchesDealSource(stock, source)) return false;
  return !stock.isReserved || stock.reservationType === 'admin';
}

function getClearanceKitIds(deal) {
  return deal?.clearanceKitIds?.length
    ? deal.clearanceKitIds
    : (deal?.kitIds || []);
}

function getAvailableClearanceKitIds(deal, kits) {
  const kitIds = getActiveClearanceKitIds(deal, getClearanceKitIds(deal));
  if (!kitIds.length) return [];

  return kitIds.filter((kitId) => {
    const kit = (kits || []).find((candidate) => String(candidate.id) === String(kitId));
    if (!kit) return false;
    return Object.values(kit.stocks || {}).some((stock) => {
      // Clearance cards represent stock customers can purchase. Admin-held
      // shelf stock is not allocatable for that purpose, even in admin view.
      return !hasOrderAssociation(stock) && !stock.isReserved && stockMatchesDealSource(stock, 'onhand');
    });
  });
}

function isClearanceDealFulfillable(deal, kits) {
  return getAvailableClearanceKitIds(deal, kits).length > 0;
}

function getFulfillableClearanceKitIds(deals, kits) {
  const ids = new Set();
  (deals || []).forEach((deal) => {
    if ((!isFlexiBundleDeal(deal) && !isPerKitClearanceDeal(deal)) || deal.isActive === false) return;
    if (isClearanceDealFulfillable(deal, kits)) {
      getAvailableClearanceKitIds(deal, kits).forEach((kitId) => ids.add(String(kitId)));
    }
  });
  return ids;
}

function getRouteKitStatus(kit, isAdmin, isAdminView, shelf = []) {
  const nowStr = new Date().toISOString().slice(0, 16);
  const stocks = Object.values(kit?.stocks || {});
  const availableCount = stocks.filter(stock => {
    const isVisible = (isAdmin && isAdminView) || !stock?.publicReleaseDate || stock.publicReleaseDate <= nowStr;
    return isVisible && !hasOrderAssociation(stock) && !stock?.isReserved;
  }).length;
  // Collection is reserved for inventory held by the administrator. Customer
  // checkout reservations are not admin shelf stock and should remain out of
  // the Collection section.
  const hasAdminShelfStock = Object.entries(kit?.stocks || {}).some(([stockKey, stock]) => (
    stock.isReserved
    && !hasOrderAssociation(stock)
    && (
      stock.reservationType === 'admin'
      || shelf.some(item => String(item?.id) === String(kit?.id) && String(item?.stockKey) === String(stockKey))
    )
  ));

  return {
    _avail: availableCount,
    _statusOrder: availableCount > 0 ? 2 : hasAdminShelfStock ? 1 : 0
  };
}

export default function Kits({ isActive = true, embedded = false }) {
  const isAdmin = useStore((state) => state.isAdmin);
  const isAdminView = useStore((state) => state.isAdminView);
  const shelf = useStore((state) => state.shelf);
  const isMergedHomeCatalog = APP_CONFIG.id === 'liquikits';
  const storeKits = useStore((state) => {
    if (isMergedHomeCatalog && state._activePath === '/' && !state._loadedDatasets?.kits) {
      return state.homeKits || [];
    }
    return state.kits || [];
  });
  const isFullCatalogLoaded = useStore((state) => Boolean(state._loadedDatasets?.kits));
  const loadAllKits = useStore((state) => state.loadAllKits);
  const loadKitById = useStore((state) => state.loadKitById);
  const deals = useStore((state) => state.deals);
  const addKit = useStore((state) => state.addKit);
  const user = useStore((state) => state.user);
  const isAnonymousUser = useStore((state) => state.isAnonymousUser);
  const userOffers = useStore((state) => state.userOffers);
  const notifyList = useStore((state) => state.notifyList);
  const subscribeNotifyList = useStore((state) => state.subscribeNotifyList);
  const subscribeOrders = useStore((state) => state.subscribeOrders);
  const addToBasket = useStore((state) => state.addToBasket);
  const shippingSettings = useStore((state) => state.shippingSettings);

  const { handlingFee, installmentFee, transferFee } = useMemo(() => {
    if (!shippingSettings) return { handlingFee: 0, installmentFee: 0, transferFee: 0 };
    return getCheckoutPaymentFees({ shippingSettings });
  }, [shippingSettings]);

  const [searchTerm, setSearchTerm] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [sortType, setSortType] = useState("latest"); // Default sort
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortRef = useRef(null);
  const sortButtonRef = useRef(null);
  const searchInputRef = useRef(null);
  const previousSearchTermRef = useRef('');
  const closeSortMenu = useCallback(() => {
    setIsSortOpen(false);
    window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (sortRef.current?.contains(activeElement) && typeof activeElement.blur === 'function') {
        activeElement.blur();
      }
    });
  }, []);
  
  const [isAddKitModalOpen, setIsAddKitModalOpen] = useState(false); 
  const [isAddDealModalOpen, setIsAddDealModalOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [dealToEdit, setDealToEdit] = useState(null);
  const [kitToEdit, setKitToEdit] = useState(null);
  const [isSupplierBalancesModalOpen, setIsSupplierBalancesModalOpen] = useState(false);
  const [isSalesDashboardModalOpen, setIsSalesDashboardModalOpen] = useState(false);
  const [isKitDataQualityModalOpen, setIsKitDataQualityModalOpen] = useState(false);
  const handleCloseSupplierBalances = useCallback(() => setIsSupplierBalancesModalOpen(false), []);
  const handleCloseSalesDashboard = useCallback(() => setIsSalesDashboardModalOpen(false), []);
  const handleCloseKitDataQuality = useCallback(() => setIsKitDataQualityModalOpen(false), []);
  const [isAdminToolsOpen, setIsAdminToolsOpen] = useState(false);
  const kitCardRefs = useRef(new Map());
  const pendingRestoreRef = useRef(null);
  const fullCatalogLoadRef = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
  // Kits is kept mounted outside the matching <Route> for faster tab
  // switching, so useParams() cannot read /kits/:kitId here. Read the
  // selected kit from the pathname instead.
  const routeKitId = useMemo(() => {
    const kitsPathPrefix = '/kits/';
    if (!location.pathname.startsWith(kitsPathPrefix)) return null;

    const encodedKitId = location.pathname.slice(kitsPathPrefix.length).split('/')[0];
    if (!encodedKitId) return null;

    try {
      return decodeURIComponent(encodedKitId);
    } catch {
      return encodedKitId;
    }
  }, [location.pathname]);

  const openCheckoutPage = (items, isGuestPreview = !user || isAnonymousUser) => {
    navigate('/checkout', {
      state: {
        items,
        isGuestPreview,
        returnToKitsSection: isMergedHomeCatalog
      }
    });
  };

  useEffect(() => {
    if (isActive) return;

    // The page remains mounted for faster tab switching, but its transient
    // dialogs and controls must not remain open while it is hidden.
    const cleanupTimer = window.setTimeout(() => {
      setIsAddKitModalOpen(false);
      setIsAddDealModalOpen(false);
      setSelectedDeal(null);
      setDealToEdit(null);
      setKitToEdit(null);
      setIsSupplierBalancesModalOpen(false);
      setIsSalesDashboardModalOpen(false);
      setIsKitDataQualityModalOpen(false);
      setIsAdminToolsOpen(false);
      closeSortMenu();
    }, 0);

    return () => window.clearTimeout(cleanupTimer);
  }, [closeSortMenu, isActive]);

  // Home bundle cards can hand off a selected deal to the Kits page so the
  // same deal modal remains the single source of truth for deal actions.
  useEffect(() => {
    const openDealId = location.state?.openDealId;
    if (!openDealId || !Array.isArray(deals) || deals.length === 0) return;

    const deal = deals.find((candidate) => String(candidate?.id) === String(openDealId));
    if (!deal) return;

    const openFrame = window.requestAnimationFrame(() => setSelectedDeal(deal));
    navigate(location.pathname, { replace: true, state: null });
    return () => window.cancelAnimationFrame(openFrame);
  }, [deals, location.pathname, location.state, navigate]);

  useEffect(() => {
    const handler = setTimeout(() => {
        setSearchTerm(inputValue);
    }, 250);
    return () => clearTimeout(handler);
  }, [inputValue]);

  // Handle outside click for sort dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (sortRef.current && !sortRef.current.contains(event.target)) {
        closeSortMenu();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isSortOpen) return undefined;

    const frame = window.requestAnimationFrame(() => {
      if (sortButtonRef.current === document.activeElement) {
        sortButtonRef.current.blur();
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isSortOpen]);

  // Keep scrolling focused on the search and filter controls instead of the
  // temporary admin action floater.
  useEffect(() => {
    const closeFloatingControlsOnScroll = () => {
      if (preserveContentHeaderRef.current) return;
      setIsAdminToolsOpen(false);
      closeSortMenu();
    };
    window.addEventListener('scroll', closeFloatingControlsOnScroll, { passive: true });
    return () => window.removeEventListener('scroll', closeFloatingControlsOnScroll);
  }, [closeSortMenu]);

  // Catalog loading state
  const kitsStatus = useStore((state) => state._datasetStatus?.kits || 'loading');
  const homeKitsStatus = useStore((state) => state._datasetStatus?.homeKits || 'loading');
  const dealsStatus = useStore((state) => state._datasetStatus?.deals || 'loading');
  const isMergedHomeRoute = embedded && isMergedHomeCatalog && location.pathname === '/';
  const catalogStatus = isMergedHomeRoute && !isFullCatalogLoaded ? homeKitsStatus : kitsStatus;
  const isKitsDataLoading = isMergedHomeRoute
    ? catalogStatus === 'loading' && storeKits.length === 0
    : catalogStatus === 'loading' || dealsStatus === 'loading';
  const [isContentHeaderHidden, setIsContentHeaderHidden] = useState(false);
  const contentHeaderRef = useRef(null);
  const contentHeaderScrollRef = useRef({ previousY: window.scrollY, frame: 0, hidden: false, direction: 0, distance: 0 });
  const preserveContentHeaderRef = useRef(false);
  const preserveContentHeaderTargetRef = useRef(null);
  const preserveContentHeaderTimerRef = useRef(0);

  useEffect(() => {
    const handleManualScrollStart = (event) => {
      if (sortRef.current?.contains(event.target)) return;

      closeSortMenu();
      if (preserveContentHeaderTimerRef.current) {
        window.clearTimeout(preserveContentHeaderTimerRef.current);
      }
      preserveContentHeaderRef.current = false;
      preserveContentHeaderTargetRef.current = null;
      preserveContentHeaderTimerRef.current = 0;
      contentHeaderScrollRef.current.previousY = window.scrollY;
      contentHeaderScrollRef.current.hidden = false;
      contentHeaderScrollRef.current.direction = 0;
      contentHeaderScrollRef.current.distance = 0;
    };

    window.addEventListener('wheel', handleManualScrollStart, { passive: true });
    window.addEventListener('touchstart', handleManualScrollStart, { passive: true });
    return () => {
      window.removeEventListener('wheel', handleManualScrollStart);
      window.removeEventListener('touchstart', handleManualScrollStart);
    };
  }, [closeSortMenu]);

  const focusKitsSection = useCallback(() => {
    const sectionTop = contentHeaderRef.current?.getBoundingClientRect().top;
    if (typeof sectionTop !== 'number') return false;

    const navbarHeight = window.innerWidth >= 640 ? 60 : 56;
    const desiredScrollTop = Math.max(0, Math.round(window.scrollY + sectionTop - navbarHeight));
    const maxScrollTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const nextScrollTop = Math.min(desiredScrollTop, maxScrollTop);
    if (Math.abs(nextScrollTop - window.scrollY) <= 1) return false;

    preserveContentHeaderRef.current = true;
    preserveContentHeaderTargetRef.current = nextScrollTop;
    if (preserveContentHeaderTimerRef.current) window.clearTimeout(preserveContentHeaderTimerRef.current);
    contentHeaderScrollRef.current.hidden = false;
    contentHeaderScrollRef.current.direction = 0;
    contentHeaderScrollRef.current.distance = 0;
    window.scrollTo({ top: nextScrollTop, left: 0, behavior: 'smooth' });
    preserveContentHeaderTimerRef.current = window.setTimeout(() => {
      preserveContentHeaderRef.current = false;
      preserveContentHeaderTargetRef.current = null;
      preserveContentHeaderTimerRef.current = 0;
      contentHeaderScrollRef.current.previousY = window.scrollY;
      contentHeaderScrollRef.current.hidden = false;
      contentHeaderScrollRef.current.direction = 0;
      contentHeaderScrollRef.current.distance = 0;
      setIsContentHeaderHidden(false);
    }, 1500);
    return true;
  }, []);

  const runAfterKitsSectionFocus = useCallback((action) => {
    if (!focusKitsSection()) {
      action();
      return;
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(action));
  }, [focusKitsSection]);

  const scheduleKitsSectionFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(focusKitsSection);
    });
  }, [focusKitsSection]);

  const requestFullCatalog = useCallback(() => {
    if (!embedded || !isMergedHomeCatalog || location.pathname !== '/' || isFullCatalogLoaded || fullCatalogLoadRef.current) {
      return;
    }

    fullCatalogLoadRef.current = true;
    void loadAllKits()
      .catch((error) => {
        console.error('SG LOG: Deferred home catalog load failed:', error);
      })
      .finally(() => {
        fullCatalogLoadRef.current = false;
      });
  }, [embedded, isFullCatalogLoaded, isMergedHomeCatalog, loadAllKits, location.pathname]);

  // Search needs the complete catalog, but the first homepage paint only
  // needs the bounded home slice. Hydrate the remaining catalog on demand.
  useEffect(() => {
    if (searchTerm.trim()) requestFullCatalog();
  }, [requestFullCatalog, searchTerm]);

  // Prefetch the complete catalog when the visitor reaches the lower
  // storefront instead of making the cold homepage wait for it.
  useEffect(() => {
    if (!embedded || !isMergedHomeCatalog || location.pathname !== '/' || isFullCatalogLoaded) return undefined;

    const handleScroll = () => {
      const scrollBottom = window.scrollY + window.innerHeight;
      const nearPageEnd = document.documentElement.scrollHeight - scrollBottom < 700;
      if (nearPageEnd) requestFullCatalog();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [embedded, isFullCatalogLoaded, isMergedHomeCatalog, location.pathname, requestFullCatalog]);

  useEffect(() => {
    if (!embedded || !isMergedHomeCatalog || location.pathname !== '/' || !location.state?.focusKitsSection) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        focusKitsSection();
        navigate('/', { replace: true, state: null });
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [embedded, focusKitsSection, isMergedHomeCatalog, location.pathname, location.state, navigate]);

  useEffect(() => {
    const previousSearchTerm = previousSearchTermRef.current;
    previousSearchTermRef.current = searchTerm;

    if (embedded) {
      // Wait for the debounced results to render before measuring the merged
      // storefront anchor. Measuring on every keystroke can capture the old
      // layout and leave the search row below the sticky navbar.
      if (!searchTerm && previousSearchTerm === searchTerm) return undefined;
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(focusKitsSection);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [embedded, focusKitsSection, searchTerm]);

  useEffect(() => {
    const scrollState = contentHeaderScrollRef.current;
    const handleContentHeaderScroll = () => {
      if (scrollState.frame) return;

      scrollState.frame = window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY;

        if (preserveContentHeaderRef.current) {
          scrollState.previousY = currentScrollY;
          scrollState.direction = 0;
          scrollState.distance = 0;
          scrollState.hidden = false;
          scrollState.frame = 0;
          setIsContentHeaderHidden(false);
          return;
        }

        closeSortMenu();
        // Keep the search row stable once it reaches the navbar. Hiding it on
        // downward scroll while moving the section headers to a second offset
        // created a temporary gap when the scroll direction changed.
        scrollState.previousY = currentScrollY;
        scrollState.direction = 0;
        scrollState.distance = 0;
        scrollState.hidden = false;
        setIsContentHeaderHidden(false);
        scrollState.frame = 0;
      });
    };

    window.addEventListener('scroll', handleContentHeaderScroll, { passive: true });
    window.addEventListener('resize', handleContentHeaderScroll, { passive: true });
    return () => {
      if (scrollState.frame) {
        window.cancelAnimationFrame(scrollState.frame);
        scrollState.frame = 0;
      }
      window.removeEventListener('scroll', handleContentHeaderScroll);
      window.removeEventListener('resize', handleContentHeaderScroll);
    };
  }, [closeSortMenu]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      contentHeaderScrollRef.current.hidden = false;
      contentHeaderScrollRef.current.previousY = window.scrollY;
      contentHeaderScrollRef.current.direction = 0;
      contentHeaderScrollRef.current.distance = 0;
      setIsContentHeaderHidden(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  useEffect(() => () => {
    if (preserveContentHeaderTimerRef.current) {
      window.clearTimeout(preserveContentHeaderTimerRef.current);
    }
  }, []);

  const [offerClock, setOfferClock] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setOfferClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const userId = user?.uid;
  const isAuthorizedAdminView = isAdmin && isAdminView;

  useEffect(() => {
    if (!isActive || !isAdmin || !isAdminView) return undefined;
    const unsubscribe = subscribeOrders({ isAdminMode: true });
    return () => unsubscribe && unsubscribe();
  }, [isActive, isAdmin, isAdminView, subscribeOrders]);

  useEffect(() => {
    if (!isActive || !isAuthorizedAdminView) return undefined;
    const unsubscribe = subscribeNotifyList({ isAdminMode: true });
    return () => unsubscribe && unsubscribe();
  }, [isActive, isAuthorizedAdminView, subscribeNotifyList]);

  const activeOfferKitIds = useMemo(() => {
    if (!isAuthorizedAdminView && !userId) return new Set();

    const offers = isAuthorizedAdminView ? notifyList : userOffers;

    return new Set((offers || [])
      .filter(offer => (
        (isAuthorizedAdminView || offer?.uid === userId)
        && offer?.kitId
        && offer?.releasedStockKey
        && offer?.status === 'released'
        && isOfferCheckoutActive(offer, offerClock)
      ))
      .map(offer => offer.kitId));
  }, [isAuthorizedAdminView, notifyList, offerClock, userId, userOffers]);

// --- Stable sort: hindi mag-re-sort ang cards kapag nagbago lang ang stock count sa real-time ---
  const [stableSortCache, setStableSortCache] = useState({ criteria: '', ids: [] });

  const allFilteredKits = useMemo(() => {
    if (!storeKits || !Array.isArray(storeKits)) return [];
    
    const nowStr = new Date().toISOString().slice(0, 16);
    const currentYear = new Date().getFullYear(); // 2026

    const clearanceSearchTextByKitId = new Map();
    (deals || []).forEach(deal => {
      if (!isFlexiBundleDeal(deal) && !isPerKitClearanceDeal(deal)) return;

      const dealSearchText = `${getClearanceDisplayLabel(deal).toLowerCase()} clearance deal ${deal.name || ''}`;
      getActiveClearanceKitIds(deal, deal.clearanceKitIds?.length ? deal.clearanceKitIds : deal.kitIds || []).forEach(kitId => {
        clearanceSearchTextByKitId.set(
          kitId,
          `${clearanceSearchTextByKitId.get(kitId) || ''} ${dealSearchText}`
        );
      });
    });

    // Clearance kits are a public deal entry point, so they must remain
    // visible even when their normal status would otherwise be hidden from
    // the initial (no-search) public kit list.
    const publicClearanceKitIds = getFulfillableClearanceKitIds(deals, storeKits);

    const getAvail = (k) => {
      const stocks = k?.stocks || {};
      return Object.values(stocks).filter(s => {
        const isVisible = (isAdmin && isAdminView) || !s?.publicReleaseDate || s?.publicReleaseDate <= nowStr;
        return isVisible && !hasOrderAssociation(s) && !s?.isReserved;
      }).length;
    };

    const isPreOrderStock = (stock) => {
      const status = String(stock?.status || '').toLowerCase();
      return status.includes('pre') || status.includes('batch');
    };

    const isAvailableStock = (stock) => {
      const isVisible = (isAdmin && isAdminView) || !stock?.publicReleaseDate || stock.publicReleaseDate <= nowStr;
      return isVisible && !hasOrderAssociation(stock) && !stock?.isReserved;
    };

    const isPreOrderOnly = (kit) => {
      const availableStocks = Object.values(kit?.stocks || {}).filter(isAvailableStock);
      return availableStocks.length > 0 && availableStocks.every(isPreOrderStock);
    };

    const getLowestPrice = (k) => {
      const stocks = Object.values(k?.stocks || {}).filter(s => !hasOrderAssociation(s) && !s?.isReserved);
      if (stocks.length > 0) {
        return Math.min(...stocks.map(s => Number(s.sellPrice || 0)));
      }
      return Number(k.sellPrice || 0);
    };

    const getTime = (kit) => {
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

    const getAvailabilityEvent = (kit) => {
      const createdAt = kit?.createdAt
        ? (typeof kit.createdAt.toMillis === 'function'
          ? kit.createdAt.toMillis()
          : kit.createdAt.seconds
            ? kit.createdAt.seconds * 1000
            : new Date(kit.createdAt).getTime() || 0)
        : 0;
      const availabilityEventAt = Math.max(
        ...[kit?.lastAvailableAt, kit?.lastRestockedAt].map((value) => {
          if (!value) return 0;
          if (typeof value.toMillis === 'function') return value.toMillis();
          if (value.seconds) return value.seconds * 1000;
          return new Date(value).getTime() || 0;
        }),
        0
      );
      const isNewlyAdded = availabilityEventAt <= createdAt;
      return {
        isNewlyAdded,
        time: isNewlyAdded ? (createdAt || getTime(kit)) : availabilityEventAt
      };
    };

    // Printed projects have their own storefront on /prints, even though
    // they intentionally share the kit stock schema for checkout.
    let filtered = [...storeKits].filter((kit) => (
      kit?.productType !== 'printed-project' && kit?.isPrintedProject !== true
    ));

    // Active accepted offers get their own Deals section card so users can
    // reach the limited checkout window quickly instead of finding them in
    // the normal collection list.
    if (activeOfferKitIds.size > 0) {
      filtered = filtered.filter(kit => !activeOfferKitIds.has(kit.id));
    }

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
          `${s.status || ''} ${s.boxCondition || ''} ${s.kitCondition || ''} ${s.isReserved || hasOrderAssociation(s) ? 'reserved' : 'available'}`
        ).join(' ');

        // Kunin at pagsama-samahin ang lahat ng ETA values na nasa stocks ng kit na ito
        const stockEtas = stocksArray.map(s => getStockEta(s).toLowerCase()).join(' ');

        const hasFreeShipping = stocksArray.some(s => {
          if (!s.isFreeShippingEligible) return false;
          if (!s.freeShippingMethod || s.freeShippingMethod === 'All') return false;
          if (s.freeShippingUntil) {
            const expiry = new Date(s.freeShippingUntil).getTime();
            if (!Number.isNaN(expiry) && Date.now() >= expiry) return false;
          }
          return true;
        });
        const freeShippingStr = hasFreeShipping ? 'free shipping' : '';

        // Pagsamahin ang lahat para sa base matching text
        const clearanceDealSearchText = clearanceSearchTextByKitId.get(kit.id) || '';
        const targetString = `${kit?.name || ''} ${kit?.series || ''} ${kit?.brand || ''} ${kit?.specs?.line || ''} ${kit?.specs?.scale || ''} ${stockInfo} ${stockEtas} ${freeShippingStr} ${clearanceDealSearchText}`.toLowerCase().replace(/[-]/g, ' ');

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
              const etaText = getStockEta(s).toLowerCase();
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
        const hasAdminShelfStock = Object.entries(kit?.stocks || {}).some(([stockKey, stock]) => (
          stock.isReserved
          && !hasOrderAssociation(stock)
          && (
            stock.reservationType === 'admin'
            || (shelf || []).some(item => String(item?.id) === String(kit?.id) && String(item?.stockKey) === String(stockKey))
          )
        ));
        
        let statusOrder = 0; 
        if (avail > 0) statusOrder = 2;
        else if (hasAdminShelfStock) statusOrder = 1;

        return {
            ...kit,
            _avail: avail,
            _price: getLowestPrice(kit),
            _time: getTime(kit),
            _availabilityEventTime: getAvailabilityEvent(kit).time,
            _isNewlyAdded: getAvailabilityEvent(kit).isNewlyAdded,
            _isPreOrderOnly: isPreOrderOnly(kit),
            _statusOrder: statusOrder
        };
    });

    // Public users start with sellable kits only. Collection and out-of-stock
    // kits remain searchable once a deliberate search term is entered.
    const displayableKits = (!isAdminView && !searchTerm.trim())
      ? processedKits.filter(kit => kit._statusOrder === 2 || publicClearanceKitIds.has(String(kit.id)))
      : processedKits;

    // --- Stable sort logic: mag-re-sort lang kapag nagbago ang sort criteria (search, sortType, view) ---
    const currentSortCriteria = `${searchTerm}||${sortType}||${isAdminView}`;
    const sortCriteriaChanged = currentSortCriteria !== stableSortCache.criteria;
    const currentFilteredIds = new Set(displayableKits.map(k => k.id));
    // Alamin kung may bago o nawala na kit (hindi lang stock change)
    const cachedIds = new Set(stableSortCache.ids);
    const hasNewKits = displayableKits.some(k => !cachedIds.has(k.id));
    const hasRemovedKits = stableSortCache.ids.some(id => !currentFilteredIds.has(id));
    const needsResort = sortCriteriaChanged || hasNewKits || hasRemovedKits || stableSortCache.ids.length === 0;

    // A snapshot can add more cards after the first paint. Keep the cards that
    // are already visible in place and append only the newly arrived records;
    // an explicit search/sort change still performs a full resort below.
    if (!sortCriteriaChanged && !hasRemovedKits && stableSortCache.ids.length > 0 && hasNewKits) {
      const kitMap = new Map(displayableKits.map((kit) => [kit.id, kit]));
      const existingInOrder = stableSortCache.ids
        .map((id) => kitMap.get(id))
        .filter(Boolean);
      const existingIds = new Set(stableSortCache.ids);
      const additions = displayableKits.filter((kit) => !existingIds.has(kit.id));
      return [...existingInOrder, ...additions];
    }

    if (needsResort) {
      // Kailangan mag-sort: either nagbago ang criteria o may bago/nawala na kit
      let sorted;
      if (searchTerm) {
        sorted = [...displayableKits].sort((a, b) => {
          if (a._statusOrder !== b._statusOrder) return b._statusOrder - a._statusOrder;
          if (a._statusOrder === 2 && a._isPreOrderOnly !== b._isPreOrderOnly) {
            return Number(b._isPreOrderOnly) - Number(a._isPreOrderOnly);
          }
          if (a._statusOrder === 2 && a._isNewlyAdded !== b._isNewlyAdded) {
            return Number(b._isNewlyAdded) - Number(a._isNewlyAdded);
          }
          if (a._statusOrder === 2 && a._availabilityEventTime !== b._availabilityEventTime) {
            return b._availabilityEventTime - a._availabilityEventTime;
          }
          if (a._avail !== b._avail) return b._avail - a._avail;
          return a.name.localeCompare(b.name);
        });
      } else if (sortType === 'latest') {
        sorted = displayableKits;
      } else {
        sorted = [...displayableKits].sort((a, b) => {
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
    const kitMap = new Map(displayableKits.map(k => [k.id, k]));
    return stableSortCache.ids.map(id => kitMap.get(id)).filter(Boolean);
  }, [activeOfferKitIds, deals, shelf, storeKits, isAdmin, isAdminView, searchTerm, sortType, stableSortCache]);

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

  const visibleKits = allFilteredKits;

  const visibleKitsWithRouteSelection = useMemo(() => {
    if (!routeKitId || activeOfferKitIds.has(routeKitId) || visibleKits.some(kit => kit.id === routeKitId)) return visibleKits;
    // Prefer the processed copy so the route kit keeps its status metadata.
    // Falling back to raw store data is needed when the public default filter hides it,
    // but that copy must be decorated before kitGroups filters it.
    const routeKit = allFilteredKits.find(kit => kit.id === routeKitId)
      || (storeKits || []).find(kit => kit.id === routeKitId);
    if (!routeKit) return visibleKits;

    const routeKitWithStatus = routeKit._statusOrder === undefined
      ? { ...routeKit, ...getRouteKitStatus(routeKit, isAdmin, isAdminView, shelf) }
      : routeKit;
    return [routeKitWithStatus, ...visibleKits];
  }, [activeOfferKitIds, allFilteredKits, isAdmin, isAdminView, routeKitId, shelf, storeKits, visibleKits]);

  useEffect(() => {
    if (!routeKitId || isAdminView || (storeKits || []).some((kit) => String(kit.id) === String(routeKitId))) return;
    void loadKitById(routeKitId);
  }, [isAdminView, loadKitById, routeKitId, storeKits]);

  const activeOfferKits = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return (storeKits || []).filter(kit => {
      if (!activeOfferKitIds.has(kit.id)) return false;
      if (kit.id === routeKitId) return true;
      if (!search) return true;
      return [kit.name, kit.brand, kit.series, kit.specs?.line, kit.specs?.scale]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search);
    });
  }, [activeOfferKitIds, routeKitId, searchTerm, storeKits]);

  // --- Grupo-grupo ang kits ayon sa status para sa section dividers ---
  const activeClearanceDeals = useMemo(() => {
    const clearanceDeals = (deals || []).filter((deal) => (
      (isFlexiBundleDeal(deal) || isPerKitClearanceDeal(deal)) && deal.isActive !== false
    ));
    const fulfillable = clearanceDeals.filter((deal) => (
      isClearanceDealFulfillable(deal, storeKits)
    ));

    return fulfillable;
  }, [deals, storeKits]);

  const clearanceKitIds = useMemo(() => {
    const ids = new Set();
    activeClearanceDeals.forEach((deal) => {
      const kitIds = getAvailableClearanceKitIds(deal, storeKits);
      kitIds.forEach((kitId) => ids.add(String(kitId)));
    });
    return ids;
  }, [activeClearanceDeals, storeKits]);

  const kitGroups = useMemo(() => {
    const clearance = visibleKitsWithRouteSelection.filter((kit) => (
      clearanceKitIds.has(String(kit.id)) && !activeOfferKitIds.has(kit.id)
    ));
    const regularKits = visibleKitsWithRouteSelection.filter((kit) => !clearanceKitIds.has(String(kit.id)));
    const available = regularKits.filter(k => k._statusOrder === 2);
    const collection = regularKits.filter(k => k._statusOrder === 1);
    const outOfStock = regularKits.filter(k => k._statusOrder === 0);
    return { clearance, available, collection, outOfStock };
  }, [activeOfferKitIds, clearanceKitIds, visibleKitsWithRouteSelection]);

  useEffect(() => {
    if (routeKitId || location.pathname !== '/kits' || !allFilteredKits.length) return;
    const raw = window.sessionStorage.getItem(KIT_RETURN_STORAGE_KEY);
    if (!raw) return;

    let target = null;
    try {
      target = JSON.parse(raw);
    } catch {
      window.sessionStorage.removeItem(KIT_RETURN_STORAGE_KEY);
      return;
    }

    if (!target?.kitId) {
      window.sessionStorage.removeItem(KIT_RETURN_STORAGE_KEY);
      return;
    }

    pendingRestoreRef.current = target;
    const restore = () => {
      const pending = pendingRestoreRef.current;
      if (!pending) return;
      const node = kitCardRefs.current.get(pending.kitId);
      if (node) {
        node.scrollIntoView({ block: 'center', behavior: 'instant' });
      } else if (Number.isFinite(Number(pending.scrollY))) {
        window.scrollTo({ top: Number(pending.scrollY), behavior: 'instant' });
      }
      pendingRestoreRef.current = null;
      window.sessionStorage.removeItem(KIT_RETURN_STORAGE_KEY);
    };

    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(restore);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [allFilteredKits, location.pathname, routeKitId]);

  const filteredDeals = useMemo(() => {
    if (!deals || !Array.isArray(deals)) return [];
    // Mutually exclusive deals have no deal card — hide from kits grid
    // Clearance is rendered as its participating kit cards in the Deals
    // section, not as a standalone multi-kit deal card.
    const visible = deals.filter(d => d?.type !== 'mutually_exclusive' && !isFlexiBundleDeal(d) && !isPerKitClearanceDeal(d));
    // Auto-hide unfulfillable deals: every kit must have at least one available stock
    const fulfillable = visible.filter(d => {
      if (d?.type !== 'bundle_discount' && d?.type !== 'bundle_only') return true;
      return (d.kitIds || []).every(kitId => {
        const kit = (storeKits || []).find(k => k.id === kitId);
        if (!kit) return false;
        const stocks = Object.values(kit.stocks || {});
        return stocks.some(s => (
          !hasOrderAssociation(s)
          && !s.isReserved
          && stockMatchesDealSource(s, d.stockSource || 'onhand')
        ));
      });
    });
    // Hide expired deals from public users — admins can still see them
    const active = (isAdmin && isAdminView)
      ? fulfillable
      : fulfillable.filter(d => getDealCountdownLabel(d.validUntil) !== 'EXPIRED');
    const searchWords = searchTerm
      .toLowerCase()
      .replace(/[-&]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const matchingDeals = searchWords.length > 0
      ? active.filter((deal) => {
        const dealKitText = getDealKits(deal, storeKits)
          .flatMap((kit) => [
            kit?.name,
            kit?.series,
            kit?.brand,
            kit?.specs?.line,
            kit?.specs?.scale
          ])
          .filter(Boolean)
          .join(' ');
        const searchableText = [deal?.name, deal?.type, dealKitText]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .replace(/[-&]/g, ' ');
        return searchWords.every((word) => searchableText.includes(word));
      })
      : active;

    return [...matchingDeals].sort((a, b) => {
      const aExpired = getDealCountdownLabel(a.validUntil) === 'EXPIRED';
      const bExpired = getDealCountdownLabel(b.validUntil) === 'EXPIRED';
      if (aExpired !== bExpired) return Number(aExpired) - Number(bExpired);

      let comparison = 0;
      switch (sortType) {
        case 'price-asc':
          comparison = Number(a.bundlePrice || 0) - Number(b.bundlePrice || 0);
          break;
        case 'price-desc':
          comparison = Number(b.bundlePrice || 0) - Number(a.bundlePrice || 0);
          break;
        case 'alpha-asc':
          comparison = String(a.name || '').localeCompare(String(b.name || ''));
          break;
        case 'alpha-desc':
          comparison = String(b.name || '').localeCompare(String(a.name || ''));
          break;
        case 'avail-asc':
          comparison = getDealAvailableBundleCount(a, storeKits) - getDealAvailableBundleCount(b, storeKits);
          break;
        case 'avail-desc':
          comparison = getDealAvailableBundleCount(b, storeKits) - getDealAvailableBundleCount(a, storeKits);
          break;
        case 'latest':
        default: {
          // Chronological: sort bundle deal card by biggest time/days left first
          const daysA = getDealRemainingDays(a);
          const daysB = getDealRemainingDays(b);
          if (daysA !== daysB) {
            comparison = daysB - daysA;
          } else {
            // Tie-breaker for same days left: compare exact expiration timestamp
            const timeA = getDealRemainingTimeMs(a);
            const timeB = getDealRemainingTimeMs(b);
            if (timeA !== timeB) {
              comparison = timeB - timeA;
            } else {
              // Secondary tie-breaker: validFrom (start time) descending
              const startA = parseDealDate(a.validFrom)?.getTime() || 0;
              const startB = parseDealDate(b.validFrom)?.getTime() || 0;
              if (startA !== startB) {
                comparison = startB - startA;
              } else {
                comparison = getDealLatestTime(b) - getDealLatestTime(a);
              }
            }
          }
          break;
        }
      }

      // Keep ordering deterministic when two deals share the same sort value.
      return comparison
        || String(a.name || '').localeCompare(String(b.name || ''))
        || String(a.id || '').localeCompare(String(b.id || ''));
    });
  }, [deals, storeKits, searchTerm, sortType, isAdmin, isAdminView]);

  useEffect(() => {
    if (!isActive || location.pathname !== '/kits' || !location.state?.focusDealsSection) return;
    if (filteredDeals.length === 0 && kitGroups.clearance.length === 0) return;

    const frame = window.requestAnimationFrame(() => {
      const dealsSection = document.querySelector('[data-deals-section="true"]');
      if (dealsSection) {
        const navbar = document.querySelector('nav');
        const offset = (navbar?.getBoundingClientRect().height || 0) + 12;
        const top = window.scrollY + dealsSection.getBoundingClientRect().top - offset;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
      navigate('/kits', { replace: true, state: null });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [filteredDeals.length, isActive, kitGroups.clearance.length, location.pathname, location.state, navigate]);

  const handleSaveNewKit = async (newKit) => {
    try { return await addKit(newKit); } catch (e) { console.error(e); throw e; }
  };
  
  const handleEditKit = (kit) => {
    setKitToEdit(kit);
    setIsAddKitModalOpen(true);
  };

  const handleCloseDealModal = useCallback(() => {
    setIsAddDealModalOpen(false);
    setDealToEdit(null);
  }, []);

  const buildDealItems = (deal) => {
    if (!deal || !deal.kitIds || deal.type === 'mutually_exclusive') return [];
    const bundleKits = (storeKits || []).filter(k => deal.kitIds.includes(k.id));
    const kitPrices = bundleKits.map((kit) => {
      const stocks = Object.values(kit?.stocks || {});
      const source = deal.stockSource || 'onhand';
      const purchasableStocks = stocks.filter(s => isBundlePurchasableStock(s, source));
      const matchingStocks = stocks.filter(s => stockMatchesDealSource(s, source));
      const sourceStock = getHighestCostStock(purchasableStocks) || getHighestCostStock(matchingStocks);
      const availableStock = sourceStock;
      return {
        kit,
        kitId: kit.id,
        refPrice: Number(sourceStock?.sellPrice || stocks[0]?.sellPrice || kit?.sellPrice || 0),
        sellPrice: Number(sourceStock?.sellPrice || stocks[0]?.sellPrice || kit?.sellPrice || 0),
        costPrice: Number(sourceStock?.costPrice || stocks[0]?.costPrice || 0),
        availableStock
      };
    });

    let pricedRows;
    const isClearanceDeal = isFlexiBundleDeal(deal) || isPerKitClearanceDeal(deal);
    if (isClearanceDeal) {
      const eligibleKitIds = getActiveClearanceKitIds(deal, deal.clearanceKitIds || deal.kitIds || []);
      pricedRows = (isFlexiBundleDeal(deal)
        ? getFlexiBundlePreviewPricing(kitPrices, eligibleKitIds, deal.clearanceDiscounts || {})
        : getClearanceBundlePricing(kitPrices, eligibleKitIds, deal.clearanceDiscounts || {})).rows;
    } else {
      const normalTotal = kitPrices.reduce((sum, row) => sum + row.refPrice, 0);
      const discountAmount = Number(deal.discountAmount ?? Math.max(0, normalTotal - Number(deal.bundlePrice || 0))) || 0;
      pricedRows = getBundleDealPricing(kitPrices.map(row => ({
        ...row,
        sellPrice: row.refPrice
      })), discountAmount).rows;
    }

    const bundleSize = pricedRows.length;
    return pricedRows.map(({ kit, finalPrice, availableStock, refPrice }) => {
      return {
        ...kit,
        name: kit?.name,
        isBundleItem: true,
        bundleId: deal.id,
        bundleName: isWildSaleDeal(deal) ? 'WILD DEAL' : deal.name || (isFlexiBundleDeal(deal) ? 'FLEXI-BUNDLE' : isPerKitClearanceDeal(deal) ? 'WILD DEAL' : 'Bundle Deal'),
        isClearanceBundle: isClearanceDeal,
        clearanceKitIds: deal.clearanceKitIds || deal.kitIds || [],
        bundleSize,
        bundleFeeShare: 0,
        bundleReferencePrice: refPrice,
        allowShelfBundle: true,
        stockKey: availableStock?.key || 'default',
        stockSource: deal.stockSource || 'onhand',
        price: finalPrice,
        appliedHandlingFee: 0,
        appliedInstallmentFee: 0,
        appliedTransferFee: 0
      };
    });
  };

  const handleDealCheckout = (deal, targetKitId) => {
    // Clearance pricing is unlocked only by selecting the clearance kit with
    // other on-hand items in the basket. Do not create a discounted direct
    // checkout line for a clearance deal.
    if (isFlexiBundleDeal(deal) || isPerKitClearanceDeal(deal)) {
      handleDealAddToBasket(deal, targetKitId);
      return;
    }

    const items = buildDealItems(deal);
    if (items.length === 0) return;
    setSelectedDeal(null);
    openCheckoutPage(items, !user || isAnonymousUser);
  };

  const handleDealAddToBasket = async (deal, targetKitId) => {
    if (isFlexiBundleDeal(deal) || isPerKitClearanceDeal(deal)) {
      const clearanceKitId = targetKitId || deal.clearanceKitIds?.[0] || deal.kitIds?.[0];
      const clearanceKit = (storeKits || []).find(kit => kit.id === clearanceKitId);
      if (!clearanceKit) return;

      const stocks = Object.entries(clearanceKit.stocks || {}).map(([key, stock]) => ({ key, ...stock }));
      const availableStock = getHighestCostStock(
        stocks.filter(stock => isBundlePurchasableStock(stock, 'onhand'))
      );
      if (!availableStock) return;

      await addToBasket({
        ...clearanceKit,
        name: clearanceKit.name,
        stockKey: availableStock.key,
        stockSource: 'onhand',
        status: availableStock.status || 'onhand',
        eta: getStockEta(availableStock),
        costPrice: Number(availableStock.costPrice || 0),
        sellPrice: Number(availableStock.sellPrice || clearanceKit.sellPrice || 0),
        price: Number(availableStock.sellPrice || clearanceKit.sellPrice || 0) + handlingFee + installmentFee + transferFee,
        appliedHandlingFee: handlingFee,
        appliedInstallmentFee: installmentFee,
        appliedTransferFee: transferFee,
        isBundleItem: false,
        isClearanceBundle: false,
        clearanceKitIds: [],
        bundleId: null,
        bundleName: null,
        bundleSize: null,
        bundleFeeShare: 0,
        bundleReferencePrice: 0,
        appliedBundlePrice: null
      });
      setSelectedDeal(null);
      return;
    }

    const items = buildDealItems(deal);
    if (items.length === 0) return;
    for (const item of items) await addToBasket(item);
    setSelectedDeal(null);
  };

  const handleDealCardClick = (deal) => {
    setSelectedDeal(deal);
  };

  const handleOpenDealKit = (kit) => {
    if (!kit?.id) return;
    setSelectedDeal(null);
    navigate(`/kits/${encodeURIComponent(kit.id)}`, { replace: true });
  };

  const handleBuyNowFromCard = (item) => {
    console.log("handleBuyNowFromCard called with:", item);
    const isPreOrder = item.stock?.status?.toLowerCase().includes('pre') || item.stock?.status?.toLowerCase().includes('batch');
    const basePrice = Number(item.offerPrice || item.stock?.sellPrice || 0);
    const price = basePrice > 0 ? (basePrice + handlingFee + installmentFee + transferFee) : item.displayPrice;
    const itemData = {
      ...item.kit,
      stockKey: item.stock?.key,
      stockSource: item.stockSource || (isPreOrder ? 'preorder' : 'onhand'),
      selectedStockId: item.stock?.timestamp,
      status: item.stock?.status,
      isPreOrder,
      minDownpayment: item.stock?.minDownpayment,
      name: item.kit?.name || '',
      price,
      sellPrice: basePrice || item.displayPrice,
      offerId: item.offerId,
      offerStatus: item.offerStatus,
      offerPrice: item.offerPrice,
      offerExpiresAt: item.offerExpiresAt,
      offerAcceptedAt: item.offerAcceptedAt,
      appliedHandlingFee: handlingFee,
      appliedInstallmentFee: installmentFee,
      appliedTransferFee: transferFee,
      isFreeShippingEligible: item.stock?.isFreeShippingEligible || false,
      freeShippingUntil: item.stock?.freeShippingUntil || '',
      freeShippingMethod: item.stock?.freeShippingMethod && item.stock?.freeShippingMethod !== 'All' ? item.stock.freeShippingMethod : '',
      freeShippingSuboption: item.stock?.freeShippingSuboption && item.stock?.freeShippingSuboption !== 'All' ? item.stock.freeShippingSuboption : ''
    };
    
    // Always prepare the items for checkout
    console.log("Setting itemsForCheckout:", [itemData]);
    window.sessionStorage.setItem(KIT_RETURN_STORAGE_KEY, JSON.stringify({
      kitId: item.kit?.id,
      scrollY: window.scrollY,
      savedAt: Date.now()
    }));
    
    // Open checkout directly for both authenticated users and guests.
    if (!(isAdmin && isAdminView)) {
        openCheckoutPage([itemData], !user || isAnonymousUser);
    }
  };
  
  const { isDarkMode, isSpectralMode } = useTheme();
  const adminToolActions = [
    { id: 'add-kit', label: 'Add Kit', icon: Plus, tone: 'border-blue-500/20 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20', onClick: () => setIsAddKitModalOpen(true) },
    { id: 'new-deal', label: 'New Deal', icon: Gift, tone: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20', onClick: () => setIsAddDealModalOpen(true) },
    { id: 'balances', label: 'Balances', icon: Wallet, tone: 'border-amber-500/20 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20', onClick: () => setIsSupplierBalancesModalOpen(true) },
    { id: 'sales', label: 'Sales', icon: TrendingUp, tone: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20', onClick: () => setIsSalesDashboardModalOpen(true) },
    { id: 'kit-data-quality', label: 'Fix Missing Kit Data', icon: Sparkles, tone: 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-600 hover:bg-fuchsia-500/20', onClick: () => setIsKitDataQualityModalOpen(true) },
  ];

  const renderAdminToolButtons = () => adminToolActions.map(({ id, label, icon, tone, onClick }) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setIsAdminToolsOpen(false);
        void onClick();
      }}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-sm transition-all hover:scale-110 active:scale-95 ${tone}`}
      aria-label={label}
      title={label}
    >
      {React.createElement(icon, { size: 20, strokeWidth: 2.5 })}
    </button>
  ));

  const sortOptions = [
    { id: 'latest', label: 'Latest', icon: ClockFading, active: sortType === 'latest', nextSort: 'latest' },
    { id: 'price-asc', label: 'Price', icon: ArrowBigUpDash, active: sortType === 'price-asc', nextSort: 'price-asc' },
    { id: 'price-desc', label: 'Price', icon: ArrowBigDownDash, active: sortType === 'price-desc', nextSort: 'price-desc' },
    { id: 'name-asc', label: 'Name', icon: ArrowBigRightDash, active: sortType === 'alpha-asc', nextSort: 'alpha-asc' },
    { id: 'name-desc', label: 'Name', icon: ArrowBigLeftDash, active: sortType === 'alpha-desc', nextSort: 'alpha-desc' },
    { id: 'stock-asc', label: 'Stock', icon: ArrowBigUpDash, active: sortType === 'avail-asc', nextSort: 'avail-asc' },
    { id: 'stock-desc', label: 'Stock', icon: ArrowBigDownDash, active: sortType === 'avail-desc', nextSort: 'avail-desc' }
  ];
  const activeSortOption = sortOptions.find(option => option.active) || sortOptions[0];

  const sectionHeaderPosition = 'top-[116px] sm:top-[120px] md:top-[120px]';
  const contentHeaderMotion = 'transition-transform duration-400 ease-in-out motion-reduce:transition-none will-change-transform';
  const sectionHeaderMotion = 'transition-[top] duration-400 ease-in-out motion-reduce:transition-none will-change-[top]';

  const focusKitsSearch = () => {
    const focusInput = () => searchInputRef.current?.focus({ preventScroll: true });
    if (!focusKitsSection()) {
      focusInput();
      return;
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(focusInput));
  };

  const renderDealCard = (deal) => {
    if (!deal) return null;
    const orderedKitIds = [
      ...(deal.previewKitIds || []),
      ...(deal.kitIds || []).filter(id => !(deal.previewKitIds || []).includes(id))
    ];
    const includedKits = getOrderedKits(storeKits, orderedKitIds);
    const previewKits = includedKits.slice(0, 4);
    const remainingCount = Math.max(0, includedKits.length - 4);
    const countdownLabel = getDealCountdownLabel(deal.validUntil);
    const isUrgentDeal = countdownLabel === 'LAST DAY' || countdownLabel === 'EXPIRED';
    const dealGradient = getSpectralGradient(deal.id);
    const dealShadow = getShadowColor(dealGradient);
    const bundleDisplayTotals = getBundleDisplayTotals(deal, storeKits, isAdmin && isAdminView);
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
            <div className={`px-1.5 py-0.5 font-bold uppercase tracking-tigther text-[13px] ${isUrgentDeal ? 'bg-red-500 border-red-400' : 'bg-emerald-500 border-emerald-400'} text-white shadow-lg`}>
              {countdownLabel}
            </div>
          </div>
          <div className="relative aspect-square rounded-2xl overflow-hidden mb-3 bg-white dark:bg-[var(--color-surface)] shrink-0">
            <div className="grid gap-1.5 h-full w-full grid-cols-2 grid-rows-2">
              {previewKits.length > 0 ? previewKits.map((kit, idx) => (
                <div key={kit?.id || idx} className={`relative w-full h-full rounded-xl overflow-hidden ${getPreviewTileClass(previewKits.length, idx)}`}>
                  <UniversalImage src={(() => { const id = kit?.image; if (!id) return ''; if (id.startsWith('data:') || id.startsWith('http')) return id; const match = (kit?.images || []).find(img => img.id === id); return match?.url || id; })()} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="" />
                  {idx === 3 && remainingCount > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-white text-[14px] font-bold italic drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                      +{remainingCount}
                    </div>
                  )}
                </div>
              )) : <div className="col-span-2 flex items-center justify-center text-emerald-600 opacity-20"><Gift size={40} strokeWidth={1} /></div>}
            </div>
          </div>
          <div className="px-1 text-center flex-1 flex flex-col min-w-0">
            <div className="h-[2em] flex items-center justify-center min-w-0">
              <h3 className="text-[14px] font-bold uppercase tracking-tighter leading-tight line-clamp-2 w-full group-hover:text-emerald-600 transition-colors" title={deal.name}>{deal.name}</h3>
            </div>
            <div className="mt-auto min-w-0 min-h-[50px] flex flex-col justify-end">
              <div className="flex items-center justify-between gap-2 min-w-0 w-full pb-1">
                <div className="flex flex-col items-start pb-1 min-w-0 flex-1 text-left">
                  <span className={`text-[14px] font-bold uppercase tracking-tighter truncate w-full block ${(isAdmin && isAdminView) ? 'text-blue-500 dark:text-blue-400' : 'text-emerald-500 dark:text-emerald-400'}`}>{(isAdmin && isAdminView) ? 'EDIT DEAL' : getDealGrabLabel(deal, bundleDisplayTotals)}</span>
                  <div className="flex items-baseline gap-1 w-full min-w-0">
                    {isAdmin && isAdminView ? (
                      <>
                        <span className="text-[14px] font-bold italic tracking-tighter leading-none line-through text-neutral-900 dark:text-white">₱{bundleDisplayTotals.discountedPrice.toLocaleString()}</span>
                        <span className="text-[14px] font-bold italic tracking-tighter leading-none text-blue-600 dark:text-blue-400">₱{bundleDisplayTotals.costTotal.toLocaleString()}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-[14px] font-bold italic tracking-tighter leading-none text-emerald-500 dark:text-emerald-400">₱{bundleDisplayTotals.discountedPrice.toLocaleString()}</span>
                        <span className="text-[14px] font-bold italic tracking-tighter leading-none line-through text-neutral-900 dark:text-white">₱{bundleDisplayTotals.sellTotal.toLocaleString()}</span>
                      </>
                    )}
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
  };
  const activeDeals = filteredDeals.filter(deal => getDealCountdownLabel(deal.validUntil) !== 'EXPIRED');
  const expiredDeals = filteredDeals.filter(deal => getDealCountdownLabel(deal.validUntil) === 'EXPIRED');
  const hasVisibleSearchResults = allFilteredKits.length > 0
    || filteredDeals.length > 0
    || activeOfferKits.length > 0
    || kitGroups.clearance.length > 0;

  const kitsContent = (
      <div className={`${embedded ? '' : 'min-h-screen'} w-full bg-neutral-50 dark:bg-[#0a0a0a] transition-colors duration-500 pb-20 font-sans text-left`}>
        <div
          ref={contentHeaderRef}
          onClick={(event) => {
            if (event.target.closest('button, input')) return;
            focusKitsSection();
          }}
          className={`sticky top-[56px] sm:top-[60px] z-[100] h-[60px] overflow-visible bg-neutral-50 dark:bg-[#0a0a0a] backdrop-blur-md border-b border-black/5 dark:border-white/5 ${contentHeaderMotion} ${isContentHeaderHidden ? '-translate-y-full md:translate-y-0' : 'translate-y-0'}`}
        >
          <div className="h-full w-full px-4 md:px-8 flex items-center gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="relative min-w-0 flex-1">
                      <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20 text-neutral-900 dark:text-white" />
                      <input
                      ref={searchInputRef}
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onFocus={() => { setIsAdminToolsOpen(false); scheduleKitsSectionFocus(); }}
                      onClick={() => { setIsAdminToolsOpen(false); scheduleKitsSectionFocus(); }}
                      enterKeyHint="search"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setInputValue('');
                          finishSearchInput(e.currentTarget);
                        } else if (e.key === 'Enter') {
                          finishSearchInput(e.currentTarget);
                        }
                      }}
                      placeholder="SEARCH KITS OR SERIES..."
                      className="w-full pl-12 pr-12 py-3 bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl text-[12px] font-bold uppercase tracking-widest placeholder:font-medium outline-none focus:border-blue-500 transition-all"
                      />
                      {inputValue && (
                        <button onClick={() => { setInputValue(""); finishSearchInput(searchInputRef.current); }} className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-colors">
                           <X size={12} className="opacity-50" />
                        </button>
                      )}
                  </div>
                  <div className="relative" ref={sortRef}>
                    <button 
                      ref={sortButtonRef}
                      onFocus={() => setIsAdminToolsOpen(false)}
                      onClick={() => {
                        const nextIsSortOpen = !isSortOpen;
                        runAfterKitsSectionFocus(() => {
                          setIsAdminToolsOpen(false);
                          if (nextIsSortOpen) setIsSortOpen(true);
                          else closeSortMenu();
                        });
                      }}
                      className={`flex items-center gap-2 px-4 py-3 rounded-2xl border shrink-0 z-10 transition-all active:scale-95 group ${isSortOpen ? 'bg-blue-600 text-white border-blue-600' : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/10 md:hover:bg-blue-600 md:hover:text-white'}`}
                    >
                        {React.createElement(activeSortOption.icon, {
                          size: 20,
                          strokeWidth: 2.5,
                          className: `transition-all ${isSortOpen ? 'text-white' : 'text-black dark:text-white opacity-70'} md:group-hover:text-white md:group-hover:opacity-100`
                        })}
                        <span className={`text-[12px] font-bold uppercase tracking-widest hidden sm:inline ${isSortOpen ? 'text-white' : 'text-black dark:text-white'} md:group-hover:text-white md:group-hover:opacity-100`}>{activeSortOption.label}</span>
                        <ChevronDown size={12} className={`${isSortOpen ? 'text-white opacity-100' : 'text-black dark:text-white opacity-40'} transition-transform ${isSortOpen ? 'rotate-180' : ''} md:group-hover:text-white md:group-hover:opacity-100`} />
                    </button>

                    {isSortOpen && (
                      <div className="absolute right-0 top-full mt-2 w-max min-w-full bg-white dark:bg-neutral-900 border border-black/5 dark:border-white/10 rounded-2xl shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-2 space-y-1">
                          {sortOptions.filter(option => !option.active).map((option) => (
                            <button
                              key={option.id}
                               onClick={() => runAfterKitsSectionFocus(() => {
                                  setSortType(option.nextSort);
                                  closeSortMenu();
                               })}
                              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[12px] font-bold uppercase tracking-widest transition-all ${
                                option.active
                                  ? 'bg-blue-600 text-white' 
                                  : 'hover:bg-black/5 dark:hover:bg-white/5'
                              }`}
                            >
                              {React.createElement(option.icon, { size: 20, strokeWidth: 2.5 })}
                              <span className="whitespace-nowrap text-[12px] font-bold">{option.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
              </div>
              {isAdmin && isAdminView && (
                <>
                  <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
                    {renderAdminToolButtons()}
                  </div>
                  <div className="relative z-[100] flex shrink-0 flex-col items-end gap-1.5 lg:hidden">
                    <button
                      type="button"
                      onClick={() => setIsAdminToolsOpen((isOpen) => !isOpen)}
                      className="inline-flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border border-black/10 bg-black/5 text-neutral-700 shadow-sm transition-all hover:scale-105 hover:bg-black/10 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                      aria-label={isAdminToolsOpen ? 'Hide admin tools' : 'Show admin tools'}
                      aria-expanded={isAdminToolsOpen}
                      title={isAdminToolsOpen ? 'Hide admin tools' : 'Show admin tools'}
                    >
                      <MoreHorizontal size={18} strokeWidth={2.5} />
                    </button>
                    {isAdminToolsOpen && (
                      <div className="absolute left-1/2 top-full mt-1.5 flex -translate-x-1/2 flex-col items-center gap-1.5 rounded-2xl border border-black/5 bg-white/95 p-1.5 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/95">
                        {renderAdminToolButtons()}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <main className="min-w-350 mx-auto px-4 md:px-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 sm:portrait:grid-cols-3 md:grid-cols-4 md:portrait:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-3 items-start justify-items-center">
              {/* --- Section Divider: Deals --- */}
              {(filteredDeals.length > 0 || activeOfferKits.length > 0 || kitGroups.clearance.length > 0) && (
                <div data-sticky-section="true" data-deals-section="true" className={`col-span-full first:mt-4 my-2 sticky z-[90] -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 bg-neutral-50 px-4 py-2 backdrop-blur-md dark:bg-[#0a0a0a] md:-mx-8 md:w-[calc(100%+4rem)] md:px-8 ${sectionHeaderMotion} ${sectionHeaderPosition}`}>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                  <span className="text-[13px] font-black uppercase tracking-[0.2em] bg-gradient-to-r from-[#0866FF] to-[#00CFFF] bg-clip-text text-transparent select-none">Deals</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                </div>
              )}

              {activeDeals.map(deal => {
                if (!deal) return null;
                const orderedKitIds = [
                  ...(deal.previewKitIds || []),
                  ...(deal.kitIds || []).filter(id => !(deal.previewKitIds || []).includes(id))
                ];
                const includedKits = getOrderedKits(storeKits, orderedKitIds);
                const previewKits = includedKits.slice(0, 4);
                const remainingCount = Math.max(0, includedKits.length - 4);
                const countdownLabel = getDealCountdownLabel(deal.validUntil);
                const isUrgentDeal = countdownLabel === 'LAST DAY' || countdownLabel === 'EXPIRED';
                const dealGradient = getSpectralGradient(deal.id);
                const dealShadow = getShadowColor(dealGradient);
                const bundleDisplayTotals = getBundleDisplayTotals(deal, storeKits, isAdmin && isAdminView);
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
                        <div className={`px-1.5 py-0.5 font-bold uppercase tracking-tigther text-[13px] ${isUrgentDeal ? 'bg-red-500 border-red-400' : 'bg-emerald-500 border-emerald-400'} text-white shadow-lg`}>
                           {countdownLabel}
                        </div>
                      </div>
                      <div className="relative aspect-square rounded-2xl overflow-hidden mb-3 bg-white dark:bg-[var(--color-surface)] shrink-0">
                          <div className="grid gap-1.5 h-full w-full grid-cols-2 grid-rows-2">
                            {previewKits.length > 0 ? previewKits.map((kit, idx) => (
                              <div key={kit?.id || idx} className={`relative w-full h-full rounded-xl overflow-hidden ${getPreviewTileClass(previewKits.length, idx)}`}>
                                <UniversalImage src={(() => { const id = kit?.image; if (!id) return ''; if (id.startsWith('data:') || id.startsWith('http')) return id; const match = (kit?.images || []).find(img => img.id === id); return match?.url || id; })()} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="" />
                                {idx === 3 && remainingCount > 0 && (
                                  <div className="absolute inset-0 flex items-center justify-center text-white text-[14px] font-bold italic drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                                    +{remainingCount}
                                  </div>
                                )}
                              </div>
                            )) : <div className="col-span-2 flex items-center justify-center text-emerald-600 opacity-20"><Gift size={40} strokeWidth={1} /></div>}
                          </div>
                      </div>
                      <div className="px-1 text-center flex-1 flex flex-col min-w-0">
                          <div className="h-[2em] flex items-center justify-center min-w-0">
                            <h3 className="text-[14px] font-bold uppercase tracking-tighter leading-tight line-clamp-2 w-full group-hover:text-emerald-600 transition-colors" title={deal.name}>{deal.name}</h3>
                          </div>
                          <div className="mt-auto min-w-0 min-h-[50px] flex flex-col justify-end">
                            <div className="flex items-center justify-between gap-2 min-w-0 w-full pb-1">
                                <div className="flex flex-col items-start pb-1 min-w-0 flex-1 text-left">
                                  <span className={`text-[14px] font-bold uppercase tracking-tighter truncate w-full block ${(isAdmin && isAdminView) ? 'text-blue-500 dark:text-blue-400' : 'text-emerald-500 dark:text-emerald-400'}`}>{(isAdmin && isAdminView) ? 'EDIT DEAL' : getDealGrabLabel(deal, bundleDisplayTotals)}</span>
                                  <div className="flex items-baseline gap-1 w-full min-w-0">
                                     {isAdmin && isAdminView ? (
                                       <>
                                         <span className="text-[14px] font-bold italic tracking-tighter leading-none line-through text-neutral-900 dark:text-white">₱{bundleDisplayTotals.discountedPrice.toLocaleString()}</span>
                                         <span className="text-[14px] font-bold italic tracking-tighter leading-none text-blue-600 dark:text-blue-400">₱{bundleDisplayTotals.costTotal.toLocaleString()}</span>
                                       </>
                                     ) : (
                                       <>
                                         <span className="text-[14px] font-bold italic tracking-tighter leading-none text-emerald-500 dark:text-emerald-400">₱{bundleDisplayTotals.discountedPrice.toLocaleString()}</span>
                                         <span className="text-[14px] font-bold italic tracking-tighter leading-none line-through text-neutral-900 dark:text-white">₱{bundleDisplayTotals.sellTotal.toLocaleString()}</span>
                                       </>
                                     )}
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

              {kitGroups.clearance.map((kit) => {
                const isUpdating = kitToEdit?.id === kit.id;
                return (
                  <div
                    key={`clearance-kit-${kit.id}`}
                    ref={(node) => {
                      if (node) kitCardRefs.current.set(kit.id, node);
                      else kitCardRefs.current.delete(kit.id);
                    }}
                    className={`w-full h-full transition-opacity duration-500 ${isUpdating ? 'opacity-30' : 'opacity-100'}`}
                  >
                    {isUpdating ? (
                      <KitSkeleton />
                    ) : (
                      <ProductCard
                        kit={kit}
                        onBuyNowClick={handleBuyNowFromCard}
                        onDealCheckout={handleDealCheckout}
                        onEdit={handleEditKit}
                        onEditDeal={(deal) => {
                          setDealToEdit(deal);
                          setIsAddDealModalOpen(true);
                        }}
                        routeKitId={routeKitId}
                      />
                    )}
                  </div>
                );
              })}

              {/* Limited-time offers follow the clearance cards in every view. */}
              {activeOfferKits.map((kit) => {
                const isUpdating = kitToEdit?.id === kit.id;
                return (
                  <div
                    key={`admin-active-offer-${kit.id}`}
                    ref={(node) => {
                      if (node) kitCardRefs.current.set(kit.id, node);
                      else kitCardRefs.current.delete(kit.id);
                    }}
                    className={`w-full h-full transition-opacity duration-500 ${isUpdating ? 'opacity-30' : 'opacity-100'}`}
                  >
                    {isUpdating ? (
                      <KitSkeleton />
                    ) : (
                      <ProductCard
                        kit={kit}
                        onBuyNowClick={handleBuyNowFromCard}
                        onDealCheckout={handleDealCheckout}
                        onEdit={handleEditKit}
                        onEditDeal={(deal) => {
                          setDealToEdit(deal);
                          setIsAddDealModalOpen(true);
                        }}
                        isAdminLimitedTimeOffer={isAdminView && activeOfferKitIds.has(kit.id)}
                        routeKitId={routeKitId}
                      />
                    )}
                  </div>
                );
              })}

              {expiredDeals.map(renderDealCard)}

              {/* --- Section Divider: Available Kits --- */}
              {kitGroups.available.length > 0 && (
                <div data-sticky-section className={`col-span-full first:mt-4 my-2 sticky z-[90] -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 bg-neutral-50 px-4 py-2 backdrop-blur-md dark:bg-[#0a0a0a] md:-mx-8 md:w-[calc(100%+4rem)] md:px-8 ${sectionHeaderMotion} ${sectionHeaderPosition}`}>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                  <span className="text-[13px] font-black uppercase tracking-[0.2em] bg-gradient-to-r from-[#0866FF] to-[#00CFFF] bg-clip-text text-transparent select-none">Available Kits</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                </div>
              )}
              {kitGroups.available.map((kit) => {
                const isUpdating = kitToEdit?.id === kit.id;
                return (
                  <div
                    key={kit.id}
                    ref={(node) => {
                      if (node) kitCardRefs.current.set(kit.id, node);
                      else kitCardRefs.current.delete(kit.id);
                    }}
                    className={`w-full h-full transition-opacity duration-500 ${isUpdating ? 'opacity-30' : 'opacity-100'}`}
                  >
                    {isUpdating ? (
                      <KitSkeleton />
                    ) : (
                      <ProductCard 
                        kit={kit} 
                        onBuyNowClick={handleBuyNowFromCard} 
                        onDealCheckout={handleDealCheckout}
                        onEdit={handleEditKit}
                        onEditDeal={(deal) => {
                          setDealToEdit(deal);
                          setIsAddDealModalOpen(true);
                        }}
                        routeKitId={routeKitId}
                      />
                    )}
                  </div>
                );
              })}

              {/* --- Section Divider: Collection --- */}
              {kitGroups.collection.length > 0 && (
                <div data-sticky-section className={`col-span-full first:mt-4 my-2 sticky z-[90] -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 bg-neutral-50 px-4 py-2 backdrop-blur-md dark:bg-[#0a0a0a] md:-mx-8 md:w-[calc(100%+4rem)] md:px-8 ${sectionHeaderMotion} ${sectionHeaderPosition}`}>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                  <span className="text-[13px] font-black uppercase tracking-[0.2em] bg-gradient-to-r from-[#0866FF] to-[#00CFFF] bg-clip-text text-transparent select-none">Collection</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                </div>
              )}
              {kitGroups.collection.map((kit) => {
                const isUpdating = kitToEdit?.id === kit.id;
                return (
                  <div
                    key={kit.id}
                    ref={(node) => {
                      if (node) kitCardRefs.current.set(kit.id, node);
                      else kitCardRefs.current.delete(kit.id);
                    }}
                    className={`w-full h-full transition-opacity duration-500 ${isUpdating ? 'opacity-30' : 'opacity-100'}`}
                  >
                    {isUpdating ? (
                      <KitSkeleton />
                    ) : (
                      <ProductCard 
                        kit={kit} 
                        onBuyNowClick={handleBuyNowFromCard} 
                        onDealCheckout={handleDealCheckout}
                        onEdit={handleEditKit}
                        onEditDeal={(deal) => {
                          setDealToEdit(deal);
                          setIsAddDealModalOpen(true);
                        }}
                        routeKitId={routeKitId}
                      />
                    )}
                  </div>
                );
              })}

              {/* --- Section Divider: Out of Stock --- */}
              {kitGroups.outOfStock.length > 0 && (
                <div data-sticky-section className={`col-span-full first:mt-4 my-2 sticky z-[90] -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 bg-neutral-50 px-4 py-2 backdrop-blur-md dark:bg-[#0a0a0a] md:-mx-8 md:w-[calc(100%+4rem)] md:px-8 ${sectionHeaderMotion} ${sectionHeaderPosition}`}>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                  <span className="text-[13px] font-black uppercase tracking-[0.2em] bg-gradient-to-r from-[#0866FF] to-[#00CFFF] bg-clip-text text-transparent select-none">Out of Stock</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                </div>
              )}
              {kitGroups.outOfStock.map((kit) => {
                const isUpdating = kitToEdit?.id === kit.id;
                return (
                  <div
                    key={kit.id}
                    ref={(node) => {
                      if (node) kitCardRefs.current.set(kit.id, node);
                      else kitCardRefs.current.delete(kit.id);
                    }}
                    className={`w-full h-full transition-opacity duration-500 ${isUpdating ? 'opacity-30' : 'opacity-100'}`}
                  >
                    {isUpdating ? (
                      <KitSkeleton />
                    ) : (
                      <ProductCard 
                        kit={kit} 
                        onBuyNowClick={handleBuyNowFromCard} 
                        onDealCheckout={handleDealCheckout}
                        onEdit={handleEditKit}
                        onEditDeal={(deal) => {
                          setDealToEdit(deal);
                          setIsAddDealModalOpen(true);
                        }}
                        routeKitId={routeKitId}
                      />
                    )}
                  </div>
                );
              })}
              
              {isKitsDataLoading && <div className="w-full h-full"><KitSkeleton /></div>}

              {isKitsDataLoading && allFilteredKits.length === 0 ? (
                Array.from({ length: 15 }).map((_, i) => <div key={`skeleton-init-${i}`} className="w-full h-full"><KitSkeleton /></div>)
              ) : allFilteredKits.length > 0 && !isKitsDataLoading && (
                <div className="col-span-full w-full py-12 text-center">
                  <p
                    onClick={!searchTerm && !isAdminView ? focusKitsSearch : undefined}
                    className={`mx-auto max-w-full px-3 text-center text-[13px] text-neutral-900 dark:text-white ${!searchTerm && !isAdminView ? 'cursor-pointer' : 'font-bold uppercase tracking-widest'}`}
                  >
                    {searchTerm ? (
                      <span className="font-medium">All matching kits loaded!</span>
                    ) : (!isAdminView ? (
                      <>
                        <span className="block font-medium uppercase tracking-widest">
                          Looking for something else?
                        </span>
                        <span className="mt-1 block font-normal normal-case tracking-normal text-neutral-900 dark:text-white">
                          Try searching! It might be in our personal collection—send us an offer.
                        </span>
                      </>
                    ) : (
                      <>
                        All kits loaded! To stay updated, follow <a href="https://www.facebook.com/profile.php?id=61576855103826" target="_blank" rel="noopener noreferrer" className="text-garage-blue  hover:underline">SnorlaxGarage</a> on Facebook
                      </>
                    ))}
                  </p>
                  {!searchTerm && !isAdminView && (
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={focusKitsSearch}
                        aria-label="Search kits"
                        className="flex size-10 items-center justify-center rounded-full text-neutral-900 transition-colors hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
                      >
                        <Search size={22} strokeWidth={2} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {!hasVisibleSearchResults && !isKitsDataLoading && searchTerm !== "" && (
              <div className="py-20 flex flex-col items-center justify-center opacity-20 text-neutral-900 dark:text-white">
                <Search size={48} strokeWidth={1} />
                <p className="mt-4 font-bold uppercase tracking-widest text-[13px]">No results found for "{searchTerm}"</p>
              </div>
            )}
          </main>

          <Suspense fallback={null}>
            {isAddKitModalOpen && (
              <AddKitModal isOpen={isAddKitModalOpen} onClose={() => { setIsAddKitModalOpen(false); setKitToEdit(null); }} onSave={handleSaveNewKit} editingKit={kitToEdit} />
            )}
            {isAddDealModalOpen && (
              <AddDealModal isOpen={isAddDealModalOpen} onClose={handleCloseDealModal} dealToEdit={dealToEdit} />
            )}
            {Boolean(selectedDeal) && (
              <DealDetailsModal
                isOpen={Boolean(selectedDeal)}
                onClose={() => setSelectedDeal(null)}
                deal={selectedDeal}
                isCatalogLoading={isMergedHomeCatalog && !isFullCatalogLoaded}
                onBuyNow={handleDealCheckout}
                onAddToBasket={handleDealAddToBasket}
                onOpenKit={handleOpenDealKit}
                isEditMode={isAdmin && isAdminView}
                onEditDeal={(deal) => {
                  setSelectedDeal(null);
                  setDealToEdit(deal);
                  setIsAddDealModalOpen(true);
                }}
              />
            )}
            {isSupplierBalancesModalOpen && (
              <SupplierBalancesModal isOpen={isSupplierBalancesModalOpen} onClose={handleCloseSupplierBalances} />
            )}
            {isSalesDashboardModalOpen && (
              <SalesDashboardModal isOpen={isSalesDashboardModalOpen} onClose={handleCloseSalesDashboard} />
            )}
            {isKitDataQualityModalOpen && (
              <KitDataQualityModal
                isOpen={isKitDataQualityModalOpen}
                onClose={handleCloseKitDataQuality}
                kits={storeKits}
                onSave={handleSaveNewKit}
              />
            )}
          </Suspense>
      </div>
  );

  return embedded ? kitsContent : (
    <PageTemplate isDarkMode={isDarkMode}>
      {kitsContent}
    </PageTemplate>
  );
}
