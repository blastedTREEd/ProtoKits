import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import PageTemplate from './PageTemplate';
import { useStore } from '../store/useStore';
import Highlights from '../components/menu/Highlights';
import BundleHighlights from '../components/menu/BundleHighlights';
import Stories from '../components/menu/Stories';
import Kits from './Kits';
// eslint-disable-next-line no-unused-vars
import { motion, useScroll, useTransform } from 'framer-motion';

export default function Home() {
  const { isDarkMode } = useTheme();
  const { shippingSettings, isLoading } = useStore();
  const location = useLocation();
  const containerRef = useRef(null);
  
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

  return (
    <PageTemplate isDarkMode={isDarkMode}>
      <div ref={containerRef} className={`flex flex-col min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-[#0a0a0a] text-white' : 'bg-white text-neutral-900'}`}>
        
      {/* SECTION 1: HERO */}
      <section
        className="
          relative
          min-h-[82vh]
          flex
          items-center
          justify-center
          overflow-hidden
          px-6
          pt-20
          pb-24
        "
      >
        {/* BACKGROUND WORD */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0">
          <motion.div
            style={{ x }}
            className="
              absolute
              top-[15%]
              left-0
              w-[170%]
              md:w-[150%]
              lg:w-[135%]
            "
          >
            <h1
              className="
                whitespace-nowrap
                font-black
                italic
                uppercase
                tracking-[-0.09em]
                leading-none
                scale-y-110
                text-[14rem]
                sm:text-[14rem]
                md:text-[22rem]
                lg:text-[30rem]
                xl:text-[30rem]
                opacity-[0.1]
                -translate-x-[8%]
                md:-translate-x-[10%]
                lg:-translate-x-[12%]
              "
            >
              SNORLAX
            </h1>
          </motion.div>
        </div>

        {/* HERO CONTENT */}
        <div className="relative z-10 max-w-5xl mx-auto text-center">

          <h1
            className="
              mt-8
              font-black
              italic
              uppercase
              tracking-tighter
              leading-[0.88]

              text-5xl
              sm:text-6xl
              md:text-7xl
              lg:text-8xl
            "
          >
            THE GARAGE IS
            <br />
            <span className={isOpeningOrOpen ? "text-garage-blue" : "text-red-500 text-4xl sm:text-5xl md:text-6xl lg:text-7xl"}>
              {garageStatusText}
            </span>
          </h1>

          <p
            className="
              mt-8
              max-w-xl
              mx-auto
              text-sm
              md:text-base
              font-medium
              text-black-400
              leading-relaxed
            "
          >
            SEALED, BUILT, &amp; EVERYTHING BETWEEN.
            <br />
            Explore transparently tagged Gunpla options from a collector's personal backlog—tailored for every budget, condition, and build style.
          </p>

        </div>
      </section>

      {/* SECTION 2: GARAGE HIGHLIGHTS */}
      <BundleHighlights />

      {/* SECTION 3: GARAGE STORIES */}
      <Highlights />

      {/* Highlights dispatches story-open events; Stories owns the preview modal. */}
      <Stories />

      {/* SECTION 4: STOREFRONT */}
      <section aria-label="Storefront">
        <Kits embedded />
      </section>
      </div>
    </PageTemplate>
  );
}
