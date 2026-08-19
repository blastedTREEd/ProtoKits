import React, { Suspense, lazy, useState, useEffect, useLayoutEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { getRedirectResult } from 'firebase/auth';
import { auth } from './firebase/firebase';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/menu/Navbar';
import Stories from './components/menu/Stories';
import Footer from './components/menu/Footer';
import ScrollManager from './components/menu/ScrollManager';
import Auth from './components/Auth';
import LoadingState from './components/common/LoadingState';
import Toast from './components/common/Toast';
import { useStore } from './store/useStore';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, X } from 'lucide-react';
import { preloadKits } from './routePreloads';

const Landing = lazy(() => import('./pages/Landing'));
const Kits = lazy(preloadKits);
const Prints = lazy(() => import('./pages/Prints'));
const Blueprints = lazy(() => import('./pages/Blueprints'));
const AboutUs = lazy(() => import('./pages/AboutUs'));
const Basket = lazy(() => import('./pages/Basket'));
const Checkout = lazy(() => import('./pages/Checkout'));
const NotifyList = lazy(() => import('./pages/NotifyList'));
const Orders = lazy(() => import('./pages/Orders'));
const UsersDashboard = lazy(() => import('./pages/UsersDashboard'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfUse = lazy(() => import('./pages/TermsOfUse'));
const Deletion = lazy(() => import('./pages/Deletion'));
const ShippingPolicy = lazy(() => import('./pages/ShippingPolicy'));
const PaymentAndRefundPolicy = lazy(() => import('./pages/PaymentAndRefundPolicy'));
const NotFound = lazy(() => import('./pages/NotFound'));

const getPageLoadingLabel = (pathname, { isAdminView = false } = {}) => {
  if (pathname === '/') return 'Loading SnorlaxGarage';
  if (pathname.startsWith('/kits')) return 'Loading Kits';
  if (pathname.startsWith('/prints') || pathname === '/blueprints') return 'Loading Prints';
  if (pathname === '/orders' || pathname.startsWith('/orders/')) return 'Loading Orders';
  if (pathname === '/notify-list') return 'Loading Offers';
  if (pathname === '/users-dashboard') return 'Loading Users Dashboard';
  if (pathname === '/shelf') return 'Loading Collection';
  if (pathname === '/basket' && isAdminView) return 'Loading Collection';
  if (pathname === '/basket') return 'Loading Basket';
  if (pathname === '/checkout') return 'Loading Checkout';
  return 'Loading SnorlaxGarage';
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

// Scroll restoration
if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

// Known route prefixes — used to skip loading/auth gating on 404 pages
const KNOWN_PATHS = ['/', '/kits', '/prints', '/blueprints', '/about-us', '/orders', '/basket', '/checkout', '/shelf', '/notify-list', '/users-dashboard', '/privacy-policy', '/terms-of-use', '/data-deletion', '/shipping-policy', '/payment-and-refund-policy'];
const isKnownRoute = (pathname) => KNOWN_PATHS.some(p => p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(p + '/'));

const isRouteDataReady = (pathname, datasets, isAdmin) => {
  if (!datasets.userProfile) return false;

  const needsStories = pathname === '/' || pathname === '';
  const needsKits = pathname.startsWith('/kits');
  const needsDeals = pathname.startsWith('/kits');
  const needsOrders = pathname === '/orders' || pathname.startsWith('/orders/');
  const needsBasket = pathname === '/basket' || pathname === '/shelf';
  const needsShelf = isAdmin;
  const needsPrints = pathname === '/' || pathname === '/prints' || pathname.startsWith('/prints/') || pathname === '/blueprints';

  return (!needsStories || datasets.stories)
    && (!needsKits || datasets.kits)
    && (!needsDeals || datasets.deals)
    && (!needsOrders || datasets.orders)
    && (!needsBasket || datasets.basket)
    && (!needsShelf || datasets.shelf)
    && (!needsPrints || datasets.prints);
};

const Layout = ({ children }) => {
  const [isCompact, setIsCompact] = useState(false);
  const [isProfileFullscreenOpen, setIsProfileFullscreenOpen] = useState(false);
  const [isNotificationFullscreenOpen, setIsNotificationFullscreenOpen] = useState(false);
  const location = useLocation();
  const { isAdmin } = useStore();
  const isFullscreenNavOpen = isProfileFullscreenOpen || isNotificationFullscreenOpen;

  useEffect(() => {
    const handleScroll = () => {
      if (isFullscreenNavOpen) return;
      const isNotHome = location.pathname !== "/";
      const isScrolled = window.scrollY > 5;
      setIsCompact(isNotHome || isScrolled);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); 
    return () => window.removeEventListener('scroll', handleScroll);
  }, [location.pathname, isFullscreenNavOpen]);

  useEffect(() => {
    const handleProfileFullscreenOpen = () => {
      setIsProfileFullscreenOpen(true);
      setIsCompact(true);
    };
    const handleProfileFullscreenClose = () => {
      setIsProfileFullscreenOpen(false);
    };
    const handleNotificationFullscreenOpen = () => {
      setIsNotificationFullscreenOpen(true);
      setIsCompact(true);
    };
    const handleNotificationFullscreenClose = () => {
      setIsNotificationFullscreenOpen(false);
    };

    window.addEventListener('profileFullscreenOpen', handleProfileFullscreenOpen);
    window.addEventListener('profileFullscreenClose', handleProfileFullscreenClose);
    window.addEventListener('notificationFullscreenOpen', handleNotificationFullscreenOpen);
    window.addEventListener('notificationFullscreenClose', handleNotificationFullscreenClose);

    return () => {
      window.removeEventListener('profileFullscreenOpen', handleProfileFullscreenOpen);
      window.removeEventListener('profileFullscreenClose', handleProfileFullscreenClose);
      window.removeEventListener('notificationFullscreenOpen', handleNotificationFullscreenOpen);
      window.removeEventListener('notificationFullscreenClose', handleNotificationFullscreenClose);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {isKnownRoute(location.pathname) && (
        <>
          <Stories isCompact={location.pathname !== "/" || isFullscreenNavOpen} hideImmediately={isFullscreenNavOpen} />
          <Navbar isCompact={isCompact} />
        </>
      )}
      <main className={`${isKnownRoute(location.pathname) ? 'container mx-auto max-w-7xl' : ''} flex-1`}>
        {children}
      </main>
      {isKnownRoute(location.pathname) && <Footer />}
      
      {isAdmin && (
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
  const _loadedDatasets = useStore((state) => state._loadedDatasets);
  const isAdminView = useStore((state) => state.isAdminView);
  const isAdmin = useStore((state) => state.isAdmin);
  const isKitsPath = location.pathname === '/kits' || location.pathname.startsWith('/kits/');
  const [hasVisitedKits, setHasVisitedKits] = useState(() => isKitsPath);

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

  // Derive loading state synchronously during render (no content flash)
  // Route data renders its own lightweight loading state. Keep the app-wide
  // overlay only until identity/profile bootstrap completes.
  // For unknown routes (404), skip data loading gate entirely — render immediately
  const isKnown = isKnownRoute(location.pathname);
  const showLoading = isKnown && !isRouteDataReady(location.pathname, _loadedDatasets, isAdmin);
  const loadingDetails = getLoadingDetails({
    pathname: location.pathname,
    isAdminView
  });

  const AdminRouteWrapper = ({ children }) => {
    const { isAdmin } = useStore();
    if (!isAdmin) {
      return <Navigate to="/basket" replace />;
    }
    return children;
  };

  return (
    <>
      {showLoading && (
         <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-white/50 dark:bg-black/50 backdrop-blur-sm">
            <LoadingState {...loadingDetails} />
         </div>
      )}
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
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/kits" element={null} />
            <Route path="/kits/:kitId" element={null} />
            <Route path="/prints" element={<Prints />} />
            <Route path="/prints/:projectId" element={<Prints />} />
            <Route path="/blueprints" element={<Blueprints />} />
            <Route path="/about-us" element={<AboutUs />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/:orderId" element={<Orders />} />
            <Route path="/basket" element={<Basket />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route 
              path="/shelf" 
              element={
                 <AdminRouteWrapper>
                   <Basket />
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
            <Route path="/shipping-policy" element={<ShippingPolicy />} />
            <Route path="/payment-and-refund-policy" element={<PaymentAndRefundPolicy />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
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


export default function App() {
  const { fetchInitialData, setToastMessage } = useStore();

  useEffect(() => {
    let cleanup = null;
    let isUnmounted = false;
    const handleAuthFlow = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          console.log("DEBUG: Redirect result success:", result.user);
          setToastMessage("Welcome Back!");
        }
      } catch (error) {
        console.error("DEBUG: Redirect login error:", error);
      }

      if (!isUnmounted) {
        cleanup = fetchInitialData();
      }
    };

    handleAuthFlow();
    return () => {
      isUnmounted = true;
      if (cleanup) cleanup();
    };
  }, [fetchInitialData, setToastMessage]);

  return (
    <ThemeProvider>
        <BrowserRouter>
          <ScrollManager />
          <SyncOverlay />

          <Layout>
             <Toast />
             <RouterContent />
          </Layout>
        </BrowserRouter>
  </ThemeProvider>
  );
}
