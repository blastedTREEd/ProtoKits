import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import PageTemplate from './PageTemplate';
import { useStore } from '../store/useStore';
import Highlights from '../components/menu/Highlights';
import BundleHighlights from '../components/menu/BundleHighlights';
import Stories from '../components/menu/Stories';
import Kits from './Kits';
import { APP_CONFIG } from '../appConfig';
// eslint-disable-next-line no-unused-vars
import { motion, useScroll, useTransform } from 'framer-motion';

const STOREFRONT_WELCOME_COOLDOWN_MS = 5 * 60 * 60 * 1000;

const readStorefrontWelcomeLastSeen = (lastSeenKey, legacyDismissedKey) => {
  if (typeof window === 'undefined') return 0;

  try {
    const storedLastSeen = Number(window.localStorage.getItem(lastSeenKey));
    if (Number.isFinite(storedLastSeen) && storedLastSeen > 0) return storedLastSeen;

    // Migrate the previous session-only dismissal into the new five-hour cooldown.
    if (window.sessionStorage.getItem(legacyDismissedKey) === 'true') {
      const migratedAt = Date.now();
      window.localStorage.setItem(lastSeenKey, String(migratedAt));
      return migratedAt;
    }
  } catch {
    // Storage may be unavailable in privacy-restricted browsers.
  }

  return 0;
};

const rememberStorefrontWelcomeAccess = (lastSeenKey, legacyDismissedKey) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(lastSeenKey, String(Date.now()));
    window.sessionStorage.removeItem(legacyDismissedKey);
  } catch {
    // Storage may be unavailable in privacy-restricted browsers.
  }
};

export default function Home() {
  const { isDarkMode } = useTheme();
  const { shippingSettings, isLoading, user, isAnonymousUser, setToastMessage } = useStore();
  const location = useLocation();
  const containerRef = useRef(null);
  const isHome = location.pathname === '/';
  const storefrontWelcomeLastSeenKey = `sg:storefront-welcome-last-seen:${APP_CONFIG.id}`;
  const storefrontWelcomeDismissedKey = `sg:storefront-welcome-dismissed:${APP_CONFIG.id}`;
  const storefrontWelcomeMaintenanceKey = `sg:storefront-welcome-maintenance:${APP_CONFIG.id}`;
  const suppressStorefrontWelcome = location.state?.suppressStorefrontWelcome === true;
  const [isStorefrontWelcomeOpen, setIsStorefrontWelcomeOpen] = useState(() => {
    if (!isHome || suppressStorefrontWelcome) return false;
    const lastSeenAt = readStorefrontWelcomeLastSeen(storefrontWelcomeLastSeenKey, storefrontWelcomeDismissedKey);
    return !lastSeenAt || Date.now() - lastSeenAt >= STOREFRONT_WELCOME_COOLDOWN_MS;
  });
  
  const paymentSettings = shippingSettings?.paymentSettings;
  const maintenanceInvalidTypes = paymentSettings?.maintenanceInvalidTypes || {};
  const hasCheckoutSettings = shippingSettings !== null;
  const isUnderMaintenance = paymentSettings?.maintenanceMode === true
    && (maintenanceInvalidTypes.kit !== false || maintenanceInvalidTypes.prints !== false);
  const isOpen = !isUnderMaintenance;
  const isStatusLoading = isLoading || !hasCheckoutSettings;
  const garageStatusText = isStatusLoading ? "OPENING" : (isOpen ? "NOW OPEN" : "UNDER MAINTENANCE");
  const isOpeningOrOpen = isStatusLoading || isOpen;
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  });

  const x = useTransform(scrollYProgress, [0, 1], ["0%", "-20%"]);

  useEffect(() => {
    const scrollPos = location.state?.scrollPos;
    if (scrollPos === 'compact') {
      window.scrollTo({ top: 100, behavior: 'smooth' });
    }
    window.history.replaceState({}, document.title);
  }, [location]);

  useEffect(() => () => {
    if (!isHome) return;
    rememberStorefrontWelcomeAccess(storefrontWelcomeLastSeenKey, storefrontWelcomeDismissedKey);
  }, [isHome, storefrontWelcomeLastSeenKey, storefrontWelcomeDismissedKey]);

  useEffect(() => {
    let visibilityFrameId = null;
    visibilityFrameId = window.requestAnimationFrame(() => {
      if (!isHome || suppressStorefrontWelcome) {
        setIsStorefrontWelcomeOpen(false);
        return;
      }

      const lastSeenAt = readStorefrontWelcomeLastSeen(
        storefrontWelcomeLastSeenKey,
        storefrontWelcomeDismissedKey
      );
      setIsStorefrontWelcomeOpen(
        !lastSeenAt || Date.now() - lastSeenAt >= STOREFRONT_WELCOME_COOLDOWN_MS
      );
    });

    return () => window.cancelAnimationFrame(visibilityFrameId);
  }, [isHome, storefrontWelcomeDismissedKey, storefrontWelcomeLastSeenKey, suppressStorefrontWelcome]);

  useEffect(() => {
    if (!isHome || suppressStorefrontWelcome) return;

    let openFrameId = null;
    const scheduleWelcomeOpen = () => {
      openFrameId = window.requestAnimationFrame(() => setIsStorefrontWelcomeOpen(true));
    };

    try {
      if (isUnderMaintenance) {
        if (window.localStorage.getItem(storefrontWelcomeMaintenanceKey) !== 'true') {
          window.localStorage.setItem(storefrontWelcomeMaintenanceKey, 'true');
          scheduleWelcomeOpen();
        }
      } else {
        window.localStorage.removeItem(storefrontWelcomeMaintenanceKey);
      }
    } catch {
      if (isUnderMaintenance) scheduleWelcomeOpen();
    }

    return () => {
      if (openFrameId !== null) window.cancelAnimationFrame(openFrameId);
    };
  }, [isHome, isUnderMaintenance, storefrontWelcomeMaintenanceKey, suppressStorefrontWelcome]);

  useEffect(() => {
    if (!isStorefrontWelcomeOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isStorefrontWelcomeOpen]);

  const handleCloseStorefrontWelcome = () => {
    setIsStorefrontWelcomeOpen(false);
    rememberStorefrontWelcomeAccess(storefrontWelcomeLastSeenKey, storefrontWelcomeDismissedKey);
    setToastMessage(user && !isAnonymousUser ? 'Welcome back!' : 'Welcome guest!');
  };

  const storefrontContent = (
    <section aria-label="Storefront">
      <Kits embedded />
    </section>
  );

  const storefrontWelcomeContent = (
    <section
      className="relative min-h-[min(75vh,calc(100dvh-8rem))] flex items-center justify-center overflow-hidden w-full px-6 pt-20 pb-24"
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0">
        <div className="absolute left-0 top-1/2 w-full -translate-y-1/2">
          <motion.div style={{ x }} className="w-[135%]">
            <h1 className="whitespace-nowrap font-black italic uppercase tracking-[-0.09em] leading-none scale-y-110 text-[clamp(15rem,38vw,30rem)] opacity-[0.1] -translate-x-[12%]">
              SNORLAX
            </h1>
          </motion.div>
        </div>
      </div>

      <div className="relative z-10 w-full max-w-5xl mx-auto flex flex-col items-center text-center">
        <h1 className="w-full mt-8 font-black italic uppercase tracking-tighter leading-[0.88] text-5xl sm:text-6xl md:text-7xl lg:text-8xl">
          THE GARAGE IS
          <br />
          <span className={isOpeningOrOpen ? "text-garage-blue" : "text-red-500 text-4xl sm:text-5xl md:text-6xl lg:text-7xl"}>
            {garageStatusText}
          </span>
        </h1>

        <p className="w-full mt-[clamp(1rem,2vw,2rem)] max-w-xl mx-auto px-2 text-sm md:text-base font-medium text-black-400 leading-[clamp(1.25rem,2.4vw,1.625rem)]">
          SEALED, BUILT, &amp; EVERYTHING BETWEEN.
          <br />
          Explore transparently tagged Gunpla options from a collector's personal backlog—tailored for every budget, condition, and build style.
        </p>
      </div>
    </section>
  );

  return (
    <PageTemplate isDarkMode={isDarkMode}>
      <div ref={containerRef} className={`flex flex-col min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-[#0a0a0a] text-white' : 'bg-white text-neutral-900'}`}>
        
      {/* SECTION 1: STOREFRONT WELCOME */}
      {!isHome && storefrontWelcomeContent}

      {/* SECTION 2: GARAGE HIGHLIGHTS */}
      <BundleHighlights />

      {/* SECTION 3: GARAGE STORIES */}
      <Highlights />

      {/* Highlights dispatches story-open events; Stories owns the preview modal. */}
      <Stories />

      {/* SECTION 4: STOREFRONT */}
      {storefrontContent}

      {isHome && isStorefrontWelcomeOpen && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/45 p-3 backdrop-blur-sm sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Explore the storefront"
            className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-7xl flex-col overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0a0a0a]"
          >
            <div className="flex-none overflow-visible">
              {storefrontWelcomeContent}
            </div>
            <div className="flex shrink-0 justify-center p-4 sm:p-5">
              <button
                type="button"
                onClick={handleCloseStorefrontWelcome}
                className="inline-flex min-w-48 items-center justify-center rounded-full bg-blue-600 px-8 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-[#0a0a0a]"
              >
                Explore Now
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </PageTemplate>
  );
}
