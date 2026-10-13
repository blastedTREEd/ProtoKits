import React, { Suspense, lazy, useState, useEffect, useLayoutEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { getRedirectResult } from 'firebase/auth';
import { auth } from './firebase/firebase';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/menu/Navbar';
import Footer from './components/menu/Footer';
import ScrollManager from './components/menu/ScrollManager';
import TabSwipeNavigator from './components/menu/TabSwipeNavigator';
import LoadingState from './components/common/LoadingState';
import Toast from './components/common/Toast';
import AppLockdownWall from './components/common/AppLockdownWall';
import { useStore } from './store/useStore';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, X } from 'lucide-react';
import { preloadLanding, preloadKits, preloadPrints, preloadOrders, preloadCart } from './routePreloads';
import { APP_CONFIG, isPathAllowedForApp, isPortfolioApp } from './appConfig';

const Landing = lazy(preloadLanding);
const PortfolioHome = lazy(() => import('./pages/PortfolioHome'));
const Kits = lazy(preloadKits);
const Prints = lazy(preloadPrints);
const Blueprints = lazy(() => import('./pages/Blueprints'));
const AboutUs = lazy(() => import('./pages/AboutUs'));
const Cart = lazy(preloadCart);
const Checkout = lazy(() => import('./pages/Checkout'));
const NotifyList = lazy(() => import('./pages/NotifyList'));
const Orders = lazy(preloadOrders);
const UsersDashboard = lazy(() => import('./pages/UsersDashboard'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfUse = lazy(() => import('./pages/TermsOfUse'));
const Deletion = lazy(() => import('./pages/Deletion'));
const ShippingPolicy = lazy(() => import('./pages/ShippingPolicy'));
const PaymentAndRefundPolicy = lazy(() => import('./pages/PaymentAndRefundPolicy'));
const NotFound = lazy(() => import('./pages/NotFound'));

const getFamilyTabIndex = (pathname) => {
  if (pathname === '/') return 0;
  if (pathname === '/cart' || pathname === '/basket') return 1;
  if (pathname === '/notify-list') return 2;
  return -1;
};

const AppHome = () => {
  if (isPortfolioApp) return <PortfolioHome />;
  return <Landing />;
};

const getPageLoadingLabel = (pathname, { isAdminView = false } = {}) => {
  const appLoadingLabel = `Loading ${APP_CONFIG.label}`;
  if (pathname === '/') return appLoadingLabel;
  if (pathname.startsWith('/kits')) return 'Loading Kits';
  if (pathname.startsWith('/prints') || pathname === '/blueprints') return 'Loading Prints';
  if (pathname === '/orders' || pathname.startsWith('/orders/')) return 'Loading Orders';
  if (pathname === '/notify-list') return 'Loading Offers';
  if (pathname === '/users-dashboard') return 'Loading Users Dashboard';
  if (pathname === '/shelf') return 'Loading Collection';
  if ((pathname === '/cart' || pathname === '/basket') && isAdminView) return 'Loading Collection';
  if (pathname === '/cart' || pathname === '/basket') return 'Loading Cart';
  if (pathname === '/checkout') return 'Loading Checkout';
  return appLoadingLabel;
};

const getLoadingDetails = ({ pathname, isAdminView = false }) => {
  return {
    message: getPageLoadingLabel(pathname, { isAdminView }),
    steps: []
  };
};

const getSyncMessage = (syncStatus, pathname, { isAdminView = false } = {}) => {
  const normalizedStatus = String(syncStatus || '').toLowerCase();
  const isAuthorizing = normalizedStatus.includes('waiting') || normalizedStatus.includes('authoriz');
  const isSyncingProfile = normalizedStatus.includes('verify') || normalizedStatus.includes('profile') || normalizedStatus.includes('account') || normalizedStatus.includes('synchronizing');

  if (isAuthorizing) return 'Authenticating Session';
  if (isSyncingProfile) return 'Syncing Profile';

  return getPageLoadingLabel(pathname, { isAdminView });
};

const getInitialLoadDatasetKeys = (pathname) => {
  if (isPortfolioApp) return [];

  const isHome = pathname === '/' || pathname === '';
  const isStorefrontHome = !isPortfolioApp && isHome;
  const isKitsPath = pathname.startsWith('/kits');
  const isStandaloneKitsPath = isKitsPath && APP_CONFIG.id !== 'liquikits';
  const isPrintsPath = pathname === '/prints' || pathname.startsWith('/prints/');
  const isOrdersPath = pathname === '/orders' || pathname.startsWith('/orders/');
  const isCartPath = pathname === '/cart' || pathname === '/basket' || pathname === '/shelf';

  return [
    'userProfile',
    ...(isStorefrontHome ? [
      'stories',
      ...(APP_CONFIG.market === 'all' || APP_CONFIG.market === 'prints' || APP_CONFIG.market === 'admin' ? ['homeBlueprints', 'printedProjects'] : []),
      ...(APP_CONFIG.market === 'all' || APP_CONFIG.market === 'kits' || APP_CONFIG.market === 'admin' ? ['homeKits'] : [])
    ] : []),
    ...(isStandaloneKitsPath || isCartPath || (isStorefrontHome && APP_CONFIG.market === 'kits' && APP_CONFIG.id !== 'liquikits') ? ['kits'] : []),
    ...((isKitsPath || (isStorefrontHome && APP_CONFIG.id !== 'liquikits')) ? ['deals'] : []),
    ...(isOrdersPath ? ['orders'] : []),
    ...(isCartPath ? ['basket'] : []),
    ...(isPrintsPath || pathname === '/blueprints' || isCartPath ? ['prints'] : [])
  ];
};

// Scroll restoration
if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

// Known route prefixes — used to skip loading/auth gating on 404 pages
const KNOWN_PATHS = ['/', '/kits', '/prints', '/blueprints', '/about-us', '/orders', '/cart', '/basket', '/checkout', '/shelf', '/notify-list', '/users-dashboard', '/privacy-policy', '/terms-of-use', '/data-deletion', '/delete-account', '/shipping-policy', '/payment-and-refund-policy'];
const isKnownRoute = (pathname) => KNOWN_PATHS.some(p => p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(p + '/'));

const AppRouteGate = ({ children }) => {
  const location = useLocation();
  if (isPathAllowedForApp(location.pathname)) return children;
  return <Navigate to={APP_CONFIG.homePath} replace />;
};

const Layout = ({ children }) => {
  const location = useLocation();
  const { isAdmin, shippingSettings } = useStore();
  const isMaintenanceMode = shippingSettings?.paymentSettings?.maintenanceMode === true;
  const showViewportTag = shippingSettings?.paymentSettings?.showViewportTag !== false;

  return (
    <div className="min-h-screen flex flex-col">
      {isKnownRoute(location.pathname) && (
        <>
          <Navbar isCompact />
        </>
      )}
      <main className={`${isKnownRoute(location.pathname) ? 'container mx-auto max-w-7xl' : ''} flex-1`}>
        {children}
      </main>
      {isKnownRoute(location.pathname) && <Footer />}
      
      {showViewportTag && (isAdmin || isMaintenanceMode) && (
        <div className="fixed bottom-12 left-4 z-[9999] p-2 bg-black/80 text-white rounded-full text-[10px] font-black uppercase tracking-widest backdrop-blur-md pointer-events-none">
            <span className="hidden 2xl:inline">2XL</span>
            <span className="hidden xl:inline 2xl:hidden">XL</span>
            <span className="hidden lg:inline xl:hidden">LG</span>
            <span className="hidden md:inline lg:hidden">MD</span>
            <span className="hidden sm:inline md:hidden">SM</span>
            <span className="inline sm:hidden">MOBILE</span>
            <span className="ml-2 opacity-50">
                <span className="portrait:inline landscape:hidden">P</span>
                <span className="landscape:inline portrait:hidden">L</span>
            </span>
        </div>
      )}

    </div>
  );
};

const RouterContent = () => {
  const location = useLocation();
  const checkPageReady = useStore((state) => state.checkPageReady);
  const isAdminView = useStore((state) => state.isAdminView);
  const isKitsPath = false;
  const currentFamilyTab = getFamilyTabIndex(location.pathname);
  const [familySwipeOffset, setFamilySwipeOffset] = useState(0);
  const [isFamilySwipeDragging, setIsFamilySwipeDragging] = useState(false);
  const [hasVisitedKits, setHasVisitedKits] = useState(() => isKitsPath);

  useEffect(() => {
    const handleFamilySwipe = (event) => {
      const detail = event.detail || {};
      if (detail.type === 'start') {
        setIsFamilySwipeDragging(true);
        setFamilySwipeOffset(0);
      } else if (detail.type === 'move') {
        setFamilySwipeOffset(Number(detail.offset) || 0);
      } else if (detail.type === 'end') {
        setIsFamilySwipeDragging(false);
        setFamilySwipeOffset(0);
      }
    };

    window.addEventListener('family:tab-swipe', handleFamilySwipe);
    return () => window.removeEventListener('family:tab-swipe', handleFamilySwipe);
  }, []);

  // Keep the Kits tree mounted after its first visit. Switching away then
  // only toggles visibility, avoiding a large card-tree teardown when many
  // kits have already been rendered.
  useEffect(() => {
    if (isKitsPath) setHasVisitedKits(true);
  }, [isKitsPath]);

  // Keep _activePath in sync and trigger background listeners when ready
  useLayoutEffect(() => {
    checkPageReady(location.pathname);
  }, [location.pathname, checkPageReady]);

  // Route components own their data loading shells. Keep them mounted while
  // Firestore listeners warm up so visitors can see and use the page chrome
  // immediately instead of waiting behind a full-screen data gate.
  const loadingDetails = getLoadingDetails({
    pathname: location.pathname,
    isAdminView
  });

  const familyPreviewDirection = familySwipeOffset < 0 ? 1 : -1;
  const familyPreviewTab = currentFamilyTab + familyPreviewDirection;
  const shouldRenderFamilyPreview = isFamilySwipeDragging
    && Math.abs(familySwipeOffset) > 4
    && familyPreviewTab >= 0
    && familyPreviewTab <= 2;
  const renderFamilyPreview = () => {
    if (!shouldRenderFamilyPreview) return null;
    if (familyPreviewTab === 0) return <AppHome />;
    if (familyPreviewTab === 1) return <Cart />;
    return <NotifyList />;
  };

  const AdminRouteWrapper = ({ children }) => {
    const { isAdmin } = useStore();
    if (!isAdmin) {
      return <Navigate to="/cart" replace />;
    }
    return children;
  };

  return (
    <>
      <AnimatePresence initial={false} custom={familyPreviewDirection} mode="popLayout">
        <Motion.div
          key={currentFamilyTab >= 0 ? `family-tab-${currentFamilyTab}` : location.pathname}
          custom={familyPreviewDirection}
          variants={{
            enter: (direction) => ({ left: `${direction * 100}%`, opacity: 0.86 }),
            center: { left: '0%', opacity: 1 },
            exit: (direction) => ({ left: `${direction * -100}%`, opacity: 0.86 })
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'spring', stiffness: 280, damping: 32, mass: 0.9 }}
          className="relative min-h-full w-full will-change-[left,opacity]"
        >
          <div className="relative min-h-full w-full overflow-x-clip">
            {shouldRenderFamilyPreview && (
              <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-0 w-full" style={{ left: `calc(${familyPreviewDirection * 100}% + ${familySwipeOffset}px)` }}>
                {renderFamilyPreview()}
              </div>
            )}
            <div className="relative z-10 min-h-full w-full" style={{ left: `${familySwipeOffset}px`, transition: isFamilySwipeDragging ? 'none' : 'left 260ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
              <Suspense fallback={
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-white/50 backdrop-blur-sm dark:bg-black/50">
                  <LoadingState {...loadingDetails} />
                </div>
              }>
          {hasVisitedKits && (
            <div className={isKitsPath ? 'contents' : 'hidden'} aria-hidden={!isKitsPath}>
              <Kits isActive={isKitsPath} />
            </div>
          )}
          <AppRouteGate>
          <Routes>
            <Route path="/" element={<AppHome />} />
            <Route path="/kits" element={<Landing />} />
            <Route path="/kits/:kitId" element={<Landing />} />
            <Route path="/prints" element={<Prints />} />
            <Route path="/prints/:projectId" element={<Prints />} />
            <Route path="/blueprints" element={<Blueprints />} />
            <Route path="/about-us" element={<AboutUs />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/:orderId" element={<Orders />} />
            <Route path="/cart" element={<Cart />} />
            {/* Keep old bookmarks and checkout redirects working while Cart is canonical. */}
            <Route path="/basket" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route 
              path="/shelf" 
              element={
                 <AdminRouteWrapper>
                   <Cart />
                 </AdminRouteWrapper>
              } 
            />
            <Route path="/notify-list" element={<NotifyList />} />
            <Route
              path="/users-dashboard"
              element={
                <AdminRouteWrapper>
                  <UsersDashboard />
                </AdminRouteWrapper>
              }
            />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-use" element={<TermsOfUse />} />
            <Route path="/data-deletion" element={<Deletion />} />
            <Route path="/delete-account" element={<Deletion />} />
            <Route path="/shipping-policy" element={<ShippingPolicy />} />
            <Route path="/payment-and-refund-policy" element={<PaymentAndRefundPolicy />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </AppRouteGate>
              </Suspense>
            </div>
          </div>
        </Motion.div>
      </AnimatePresence>
    </>
  );
};

const SyncOverlay = () => {
  const location = useLocation();
  const isSyncing = useStore((state) => state.isSyncing);
  const syncStatus = useStore((state) => state.syncStatus);
  const isAdminView = useStore((state) => state.isAdminView);
  const authRetry = useStore((state) => state.authRetry);
  const cancelAuthAttempt = useStore((state) => state.cancelAuthAttempt);
  const normalizedStatus = String(syncStatus || '').toLowerCase();
  const isAuthorizing = normalizedStatus.includes('authoriz');
  const authNeedsRetry = normalizedStatus.includes('interrupted');

  return (
    <AnimatePresence>
      {isSyncing && (
        <Motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-white/70 dark:bg-black/70 backdrop-blur-sm pointer-events-auto"
        >
          <div className="flex flex-col items-center gap-3">
            <LoadingState
              message={getSyncMessage(syncStatus, location.pathname, { isAdminView })}
              className="py-0"
            />
            {authNeedsRetry && (
              <p className="max-w-xs text-center text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                The login window was closed or blocked. Retry the login or cancel to return to the page.
              </p>
            )}
            {isAuthorizing && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => authRetry?.()}
                  disabled={!authRetry}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RefreshCw size={13} />
                  Retry Login
                </button>
                <button
                  type="button"
                  onClick={cancelAuthAttempt}
                  className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-600 transition hover:bg-white dark:border-white/10 dark:bg-neutral-900/80 dark:text-neutral-300 dark:hover:bg-neutral-900"
                >
                  <X size={13} />
                  Cancel
                </button>
              </div>
            )}
          </div>
        </Motion.div>
      )}
    </AnimatePresence>
  );
};

const InitialLoadOverlay = () => {
  const location = useLocation();
  const isLoading = useStore((state) => state.isLoading);
  const loadedDatasets = useStore((state) => state._loadedDatasets);

  // Match the Landing page's status wording: the loading screen remains
  // visible while the route-required listeners are still settling. Checkout
  // settings remain optional so guest/local catalog pages cannot be blocked by
  // a missing or delayed settings/checkout snapshot.
  const isGarageOpening = isLoading;
  if (!isGarageOpening) return null;

  const requiredKeys = getInitialLoadDatasetKeys(location.pathname);
  const completedDatasetCount = requiredKeys.filter((key) => loadedDatasets?.[key]).length;
  const completedCount = completedDatasetCount;
  const totalCount = Math.max(requiredKeys.length, 1);
  const progress = Math.round((completedCount / totalCount) * 100);

  return (
    <Motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[99998] flex items-center justify-center bg-white/80 backdrop-blur-sm dark:bg-black/80"
    >
      <LoadingState
        message={getPageLoadingLabel(location.pathname)}
        progress={progress}
        className="py-0"
      />
    </Motion.div>
  );
};


export default function App() {
  const { fetchInitialData, setToastMessage } = useStore();

  useEffect(() => {
    document.title = APP_CONFIG.label;
  }, []);

  useEffect(() => {
    // Prevent the mouse wheel from incrementing/decrementing number fields.
    // Keep this at the app root so dynamically rendered inputs are covered.
    const preventNumberWheelChange = (event) => {
      const target = event.target;
      if (target?.tagName === 'INPUT' && (target.type === 'number' || ['numeric', 'decimal'].includes(target.inputMode))) {
        event.preventDefault();
      }
    };

    const preventNegativeNumberInput = (event) => {
      const target = event.target;
      if (target?.tagName !== 'INPUT' || (target.type !== 'number' && !['numeric', 'decimal'].includes(target.inputMode))) return;

      // Block a leading minus while typing, and strip it from pasted values.
      if (event.type === 'beforeinput' && event.data?.includes('-') && (target.selectionStart ?? 0) === 0) {
        event.preventDefault();
        return;
      }

      if (target.value.startsWith('-')) {
        target.value = target.value.slice(1);
      }
    };

    document.addEventListener('wheel', preventNumberWheelChange, {
      capture: true,
      passive: false
    });
    document.addEventListener('beforeinput', preventNegativeNumberInput, true);
    document.addEventListener('input', preventNegativeNumberInput, true);
    document.addEventListener('change', preventNegativeNumberInput, true);

    return () => {
      document.removeEventListener('wheel', preventNumberWheelChange, true);
      document.removeEventListener('beforeinput', preventNegativeNumberInput, true);
      document.removeEventListener('input', preventNegativeNumberInput, true);
      document.removeEventListener('change', preventNegativeNumberInput, true);
    };
  }, []);

  useEffect(() => {
    // Firestore's public listeners and the auth redirect can initialize in
    // parallel. Waiting for getRedirectResult here made guest users wait for
    // an auth operation before any public content could reach the UI.
    const cleanup = fetchInitialData();

    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          console.log("DEBUG: Redirect result success:", result.user);
          setToastMessage("Welcome Back!");
        }
      })
      .catch((error) => {
        console.error("DEBUG: Redirect login error:", error);
      });

    return () => {
      if (cleanup) cleanup();
    };
  }, [fetchInitialData, setToastMessage]);

  return (
    <ThemeProvider>
        <BrowserRouter>
          <ScrollManager />
          <TabSwipeNavigator />
          <InitialLoadOverlay />
          <SyncOverlay />
          <AppLockdownWall />

          <Layout>
             <Toast />
             <RouterContent />
          </Layout>
        </BrowserRouter>
  </ThemeProvider>
  );
}
