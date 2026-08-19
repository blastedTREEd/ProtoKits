import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, MapPin, Package } from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';

const SYNC_GLOW_COLORS = ['#0066ff', '#ff3b30', '#34c759', '#ffcc00', '#af52de', '#ff7a00', '#00c7be'];
const STORY_CARD_WIDTH = 112;
const STORY_CARD_GAP = 12;
// Stories strip above the navbar.
const SHOW_STORIES_STRIP = true;

function getRandomSyncColor() {
  return SYNC_GLOW_COLORS[Math.floor(Math.random() * SYNC_GLOW_COLORS.length)];
}

function formatStoryDate(value) {
  if (!value) return 'Recently';

  const date = typeof value?.toDate === 'function'
    ? value.toDate()
    : typeof value?.seconds === 'number'
      ? new Date(value.seconds * 1000)
      : new Date(value);

  if (Number.isNaN(date.getTime())) return 'Recently';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export default function Stories({ isCompact, hideImmediately = false }) {
  // Kunin ang actual data mula sa Zustand store (DB)
  const { stories, kits, blueprints, isLoading, setStoriesHeight } = useStore();
  const navigate = useNavigate();
  const containerRef = useRef(null);

  // Preview modal state
  const [activeStoryIndex, setActiveStoryIndex] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [syncingStoryCount, setSyncingStoryCount] = useState(() => (
    Math.ceil(window.innerWidth / (STORY_CARD_WIDTH + STORY_CARD_GAP)) + 1
  ));

  useEffect(() => {
    if (!SHOW_STORIES_STRIP) {
      setStoriesHeight(0);
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setStoriesHeight(entry.contentRect.height);
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [setStoriesHeight]);

  // Track mobile breakpoint and fill the whole strip while stories load.
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setSyncingStoryCount(Math.ceil(window.innerWidth / (STORY_CARD_WIDTH + STORY_CARD_GAP)) + 1);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close story preview when profile modal opens on mobile
  useEffect(() => {
    const handleProfileOpen = () => setActiveStoryIndex(null);
    window.addEventListener('profileFullscreenOpen', handleProfileOpen);
    window.addEventListener('notificationFullscreenOpen', handleProfileOpen);
    return () => {
      window.removeEventListener('profileFullscreenOpen', handleProfileOpen);
      window.removeEventListener('notificationFullscreenOpen', handleProfileOpen);
    };
  }, []);

  // Filter out draft stories for non-admin viewers
  const activeStories = React.useMemo(() => {
    return (stories || []).filter(story => !story.isDraft);
  }, [stories]);

  const getTimestamp = useCallback((value) => {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const getKitImage = useCallback((kit) => {
    const firstImage = Array.isArray(kit?.images) ? kit.images[0] : null;
    const masterImage = typeof kit?.image === 'string'
      ? (kit.image.startsWith('data:') || kit.image.startsWith('http') || kit.image.startsWith('/')
        ? kit.image
        : (kit.images || []).find((image) => image?.id === kit.image)?.url)
      : null;
    return masterImage || (typeof firstImage === 'string' ? firstImage : firstImage?.url) || '/snorlaxgarage.png';
  }, []);

  const getKitStocks = useCallback((kit) => (
    Object.entries(kit?.stocks || {}).map(([stockKey, stock]) => ({ stockKey, ...(stock || {}) }))
  ), []);

  const isAvailableStock = useCallback((stock) => (
    stock && !stock.order?.orderId && !stock.isReserved
  ), []);

  const isPreOrderStock = useCallback((stock) => {
    const status = String(stock?.status || '').toLowerCase();
    return status.includes('pre') || status.includes('batch');
  }, []);

  const isOnhandStock = useCallback((stock) => (
    String(stock?.status || '').toLowerCase() === 'onhand'
  ), []);

  const highlightItems = React.useMemo(() => {
    const recentStories = [...activeStories]
      .sort((a, b) => (
        getTimestamp(b.storyDate || b.createdAt || b.publishedAt || b.updatedAt) -
        getTimestamp(a.storyDate || a.createdAt || a.publishedAt || a.updatedAt)
      ))
      .slice(0, 10)
      .map((story) => ({
        id: `story:${story.id}`,
        type: 'story',
        targetId: story.id,
        image: story.image || story.backgroundImage || '/snorlaxgarage.png',
        label: story.label || 'Garage Story',
        story
      }));

    const kitItems = (kits || []).map((kit) => {
      const stocks = getKitStocks(kit);
      const availablePreOrders = stocks.filter((stock) => isAvailableStock(stock) && isPreOrderStock(stock));
      const availableOnhand = stocks.filter((stock) => isAvailableStock(stock) && isOnhandStock(stock));
      const restockTimestamp = Math.max(
        ...stocks.map((stock) => getTimestamp(
          stock.lastRestockedAt || stock.restockedAt || stock.backInStockAt || stock.lastAvailableAt
        )),
        getTimestamp(kit.lastRestockedAt || kit.lastAvailableAt)
      );
      const latestTimestamp = Math.max(
        getTimestamp(kit.createdAt || kit.lastUpdated),
        ...stocks.map((stock) => getTimestamp(stock.createdAt || stock.lastUpdated || stock.timestamp))
      );

      return {
        kit,
        availablePreOrders,
        availableOnhand,
        restockTimestamp,
        latestTimestamp
      };
    });

    const usedKitLinks = new Set();
    const selectUniqueKits = (entries, limit) => entries
      .filter((entry) => entry.kit?.id && !usedKitLinks.has(`kit:${entry.kit.id}`))
      .slice(0, limit)
      .map((entry) => {
        usedKitLinks.add(`kit:${entry.kit.id}`);
        return entry.kit;
      });

    const preOrderItems = selectUniqueKits([...kitItems]
      .filter((entry) => entry.availablePreOrders.length > 0)
      .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
    , 5).map((kit) => ({
        id: `preorder:${kit.id}`,
        type: 'kit',
        targetId: kit.id,
        image: getKitImage(kit),
        label: kit.name || 'Pre-order Kit'
      }));

    const onhandItems = selectUniqueKits([...kitItems]
      .filter((entry) => entry.availableOnhand.length > 0)
      .sort((a, b) => (
        b.availableOnhand.length - a.availableOnhand.length ||
        b.latestTimestamp - a.latestTimestamp
      ))
    , 4).map((kit) => ({
        id: `onhand:${kit.id}`,
        type: 'kit',
        targetId: kit.id,
        image: getKitImage(kit),
        label: kit.name || 'Onhand Kit'
      }));

    const recentlyBackInStockItems = selectUniqueKits([...kitItems]
      .filter((entry) => entry.availableOnhand.length > 0 && entry.restockTimestamp > 0)
      .sort((a, b) => b.restockTimestamp - a.restockTimestamp)
    , 3).map((kit) => ({
        id: `restocked:${kit.id}`,
        type: 'kit',
        targetId: kit.id,
        image: getKitImage(kit),
        label: kit.name || 'Back in Stock'
      }));

    const usedHighlightLinks = new Set(
      [...recentStories, ...preOrderItems, ...onhandItems, ...recentlyBackInStockItems]
        .map((item) => `${item.type}:${item.targetId}`)
    );
    const recentProjects = (blueprints || [])
      .filter((project) => project?.isPublished !== false && project?.status !== 'Draft')
      .sort((a, b) => (
        getTimestamp(b.createdAt || b.updatedAt) - getTimestamp(a.createdAt || a.updatedAt)
      ))
      .filter((project) => !usedHighlightLinks.has(`project:${project.id}`))
      .slice(0, 5)
      .map((project) => ({
        id: `project:${project.id}`,
        type: 'project',
        targetId: project.id,
        // Match the image used by ProjectCard's public grid card.
        image: project.image || '/snorlaxgarage.png',
        label: project.projectName || 'Garage Project'
      }));

    const mixedItems = [
      ...recentStories,
      ...preOrderItems,
      ...onhandItems,
      ...recentlyBackInStockItems,
      ...recentProjects
    ];

    // Keep categories visually interleaved without reshuffling on every render.
    // The item IDs provide a stable, random-looking order until the data changes.
    const stableHash = (value) => {
      let hash = 2166136261;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    };

    return mixedItems.sort((a, b) => stableHash(a.id) - stableHash(b.id));
  }, [activeStories, blueprints, getKitImage, getKitStocks, getTimestamp, isAvailableStock, isOnhandStock, isPreOrderStock, kits]);

  // Open a story directly when a highlight tile is selected in the homepage grid.
  useEffect(() => {
    const handleHighlightOpen = (event) => {
      const storyId = event.detail?.storyId;
      const storyIndex = activeStories.findIndex((story) => story.id === storyId);
      if (storyIndex !== -1) setActiveStoryIndex(storyIndex);
    };

    window.addEventListener('openStoryHighlight', handleHighlightOpen);
    return () => window.removeEventListener('openStoryHighlight', handleHighlightOpen);
  }, [activeStories]);

  // Preview navigation handlers — operate on active stories (real published data only)
  const handlePrev = useCallback(() => {
    if (activeStories.length === 0) return;
    setActiveStoryIndex((prev) => (prev <= 0 ? activeStories.length - 1 : prev - 1));
  }, [activeStories]);

  const handleNext = useCallback(() => {
    if (activeStories.length === 0) return;
    setActiveStoryIndex((prev) => (prev >= activeStories.length - 1 ? 0 : prev + 1));
  }, [activeStories]);

  // Close preview on Escape key
  useEffect(() => {
    const handleKey = (e) => {
      if (activeStoryIndex === null) return;
      if (e.key === 'Escape') setActiveStoryIndex(null);
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeStoryIndex, handleNext, handlePrev]);

  // 1. DYNAMIC DATA LOGIC:
  // Kung may laman na ang stories (from DB), yun ang gamitin.
  // Kung wala pa (loading/network delay), gamit muna placeholder para laging may render.
  const syncingStories = React.useMemo(() => (
    Array.from({ length: syncingStoryCount }, (_, index) => ({
      id: `db-loading-${index + 1}`,
      type: 'loading',
      label: 'Syncing...',
      value: getRandomSyncColor(),
      image: '/snorlaxgarage.png'
    }))
  ), [syncingStoryCount]);

  const isShowingPlaceholders = isLoading && highlightItems.length === 0;
  const displayStories = isShowingPlaceholders
    ? syncingStories
    : highlightItems.length > 0
      ? [...highlightItems, ...highlightItems, ...highlightItems]
      : syncingStories;

  const handleHighlightClick = (item) => {
    if (!item || item.type === 'loading') return;
    if (item.type === 'story') {
      const realIndex = activeStories.findIndex((story) => story.id === item.targetId);
      if (realIndex !== -1) setActiveStoryIndex(realIndex);
      return;
    }
    if (item.type === 'kit' && item.targetId) {
      navigate(`/kits/${encodeURIComponent(item.targetId)}`);
      return;
    }
    if (item.type === 'project' && item.targetId) {
      navigate(`/prints/${encodeURIComponent(item.targetId)}`);
    }
  };

  const activeStory = (activeStoryIndex !== null && activeStories.length > 0) ? activeStories[activeStoryIndex] : null;

  return (
    <>
      {SHOW_STORIES_STRIP && <div 
        ref={containerRef}
        role="region"
        aria-label="Garage highlights"
        className={`
        relative z-40 border-b border-white/10 overflow-hidden w-full
        ${hideImmediately ? 'transition-none' : 'transition-all duration-700 ease-in-out'}
        ${isCompact ? 'max-h-0 opacity-0 pointer-events-none' : 'max-h-[500px] opacity-100'}
        bg-neutral-50/50 dark:bg-black/40
      `}>
        <div className="w-full py-6 relative">
          {/* Edge Fades - desktop only */}
          <div className="hidden lg:block absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-white dark:from-neutral-900 via-white/80 dark:via-neutral-900/80 to-transparent z-50 pointer-events-none" />
          <div className="hidden lg:block absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-white dark:from-neutral-900 via-white/80 dark:via-neutral-900/80 to-transparent z-50 pointer-events-none" />

          <div 
            className={`flex gap-3 w-max ${!isShowingPlaceholders && 'animate-infinite-scroll'}`}
            style={{ '--scroll-speed': '50s' }}
          >
            {displayStories.map((highlight, index) => (
              (() => {
                const isLoadingCard = highlight.type === 'loading';

                return (
                  <div
                    key={`${highlight.id}-${index}`}
                    onClick={() => handleHighlightClick(highlight)}
                    className={`story-card w-28 h-44 rounded-[1.5rem] flex-shrink-0 relative overflow-hidden group p-1 shadow-xl ${isLoadingCard
                      ? 'cursor-default bg-gradient-to-br from-[#0866FF] to-[#00CFFF]'
                      : 'cursor-pointer glass-card'
                    }`}
                  >
                <div 
                  className={`story-card-media w-full h-full rounded-[1.3rem] relative overflow-hidden ${isLoadingCard ? 'bg-gradient-to-br from-[#0866FF] to-[#00CFFF]' : ''}`}
                  style={isLoadingCard ? undefined : { backgroundColor: `${highlight.value || '#0866ff'}20` }}
                >
                  {/* Story Image — kung meron sa DB, i-render as background */}
                  {highlight.image && (
                    <img 
                      src={highlight.image}
                      alt={highlight.label}
                      className={`story-card-image absolute z-[1] ${isLoadingCard
                        ? 'inset-0 m-auto h-[68%] w-[68%] max-h-full max-w-full object-contain'
                        : 'inset-0 h-full w-full object-cover'
                      }`}
                    />
                  )}

                  {/* Visual Glow Layer - Ito na yung actual color from DB */}
                  {!isLoadingCard && (
                    <div
                      className="absolute -inset-4 opacity-80 blur-2xl transition-opacity group-hover:opacity-50 dark:opacity-30"
                      style={{ backgroundColor: highlight.value || '#0866ff' }}
                    />
                  )}
                </div>
                  </div>
                );
              })()
            ))}
          </div>
        </div>
      </div>}

      {/* ====== STORY PREVIEW MODAL ====== */}
      <AnimatePresence>
        {activeStory && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center">
            {/* Backdrop */}
            <Motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-neutral-900/35 backdrop-blur-xl dark:bg-black/80"
              onClick={() => setActiveStoryIndex(null)}
            />

            {/* Story Content */}
            <Motion.div
              key={activeStory.id}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              style={isMobile ? undefined : {
                width: 'min(92vw, 92vh, 796px)',
                aspectRatio: '1 / 1'
              }}
              className={
                isMobile
                  ? "relative w-full h-full bg-neutral-950 flex flex-col"
                  : "relative rounded-3xl overflow-hidden shadow-2xl bg-white dark:bg-neutral-950"
              }
            >
              {/* Story Image / Background */}
              <div className="absolute inset-0 overflow-hidden md:right-[43.75%] md:w-[56.25%]">
                {activeStory.backgroundImage ? (
                  <img 
                    src={activeStory.backgroundImage} 
                    alt={activeStory.label}
                    className="w-full h-full object-cover"
                    style={{
                      transform: `scale(${(activeStory.bgZoom || 1) * (Math.abs(Math.cos((activeStory.bgRotation || 0) * Math.PI / 180)) + (16/9) * Math.abs(Math.sin((activeStory.bgRotation || 0) * Math.PI / 180)))}) rotate(${activeStory.bgRotation || 0}deg)`,
                      transformOrigin: 'center center'
                    }}
                  />
                ) : activeStory.image ? (
                  <img 
                    src={activeStory.image} 
                    alt={activeStory.label}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div 
                    className="w-full h-full" 
                    style={{ background: `linear-gradient(135deg, ${activeStory.value}40 0%, ${activeStory.value}10 50%, ${activeStory.value}30 100%)` }}
                  />
                )}
                {/* Top gradient for header readability */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-transparent z-[5] md:hidden" />
                {/* Bottom gradient — heavier dark shadow for description */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 via-30% to-transparent z-[5] md:hidden" />
              </div>

              {/* Overlays Container (Stickers, Masks, Texts) */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden z-10 md:right-[43.75%] md:w-[56.25%]">
                {/* Render Stickers (Polaroids & Masks) */}
                {(activeStory.stickers || []).map((st) => {
                  const isPolaroid = st.type === 'mask' ? false : true;
                  return (
                    <div
                      key={st.id}
                      className="absolute"
                      style={{
                        transform: `translate(${st.position.x}px, ${st.position.y}px) rotate(${st.rotation || 0}deg) scale(${st.scale || 1})`,
                        transformOrigin: 'center center',
                        left: isPolaroid ? 'calc(50% - 45px)' : 'calc(50% - 40px)', 
                        top: isPolaroid ? 'calc(50% - 45px)' : 'calc(50% - 40px)',
                      }}
                    >
                      {isPolaroid ? (
                        <div 
                          className="bg-white p-1 pb-4 shadow-2xl flex flex-col items-center border border-black/5" 
                          style={{ width: '90px', height: '90px' }}
                        >
                          <div className="w-full h-[70px] overflow-hidden relative bg-neutral-100">
                            <img 
                              src={st.src} 
                              alt="Polaroid overlay" 
                              className="w-full h-full object-cover border border-black/5" 
                              style={{ transform: `scale(${st.zoom || 1})`, transformOrigin: 'center' }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div 
                          className="w-[80px] h-[80px] rounded-full overflow-hidden border-2 border-white shadow-lg bg-white/20 relative"
                        >
                          <img 
                            src={st.src} 
                            alt="Mask overlay" 
                            className="w-full h-full object-cover rounded-full" 
                            style={{ transform: `scale(${st.zoom || 1})`, transformOrigin: 'center' }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Render Texts */}
                {(activeStory.texts || []).map((t) => (
                  <div
                    key={t.id}
                    className="absolute whitespace-nowrap"
                    style={{
                      transform: `translate(${t.position.x}px, ${t.position.y}px) rotate(${t.rotation || 0}deg) scale(${t.scale || 1})`,
                      transformOrigin: 'center center',
                      left: 'calc(50% - 100px)',
                      top: 'calc(50% - 20px)',
                      width: '200px',
                      textAlign: 'center',
                      color: t.color,
                      fontSize: `${t.fontSize}px`,
                      fontFamily: t.fontFamily,
                      fontWeight: t.fontWeight,
                      textShadow: '1px 1px 4px rgba(0,0,0,0.7)'
                    }}
                  >
                    {t.text}
                  </div>
                ))}
              </div>

              {/* Close Button — z-30 so it stays ABOVE navigation zones */}
              <button 
                onClick={(e) => { e.stopPropagation(); setActiveStoryIndex(null); }}
                className={`absolute top-5 right-5 z-30 p-2 rounded-full backdrop-blur-md border transition-all shadow-lg ${
                  isMobile
                    ? 'bg-black/40 border-white/10 text-white/80 hover:text-white hover:bg-black/60'
                    : 'bg-white/90 border-black/10 text-neutral-600 hover:text-neutral-950 hover:bg-white dark:bg-black/40 dark:border-white/10 dark:text-white/80 dark:hover:text-white dark:hover:bg-black/60'
                }`}
              >
                <X size={20} />
              </button>

              {/* Top Header — profile pic, page name */}
              <div className="relative z-20 flex items-center gap-3 p-5 pt-6 pr-14 md:absolute md:left-[56.25%] md:top-0 md:w-[43.75%]">
                <div className="w-10 h-10 rounded-full border-2 border-white/60 bg-white/20 backdrop-blur-md overflow-hidden shadow-lg flex-shrink-0 md:border-garage-blue/50">
                  <img 
                    src="/snorlaxgarage.png"
                    alt="SG" 
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-md font-black italic uppercase tracking-tight leading-none drop-shadow-lg truncate">
                    <span className="text-neutral-950 dark:text-white">SNORLAX</span>
                    <span className="text-garage-blue">GARAGE</span>
                  </h3>
                  <span className="text-[13px] font-bold text-white uppercase tracking-widest md:text-neutral-500 md:dark:text-neutral-400">
                    {formatStoryDate(activeStory.storyDate || activeStory.createdAt || activeStory.lastUpdated)}
                  </span>
                </div>
              </div>

              {/* Progress Bars */}
              <div className="relative z-20 flex gap-1 px-5 mb-auto md:absolute md:left-[56.25%] md:top-[90px] md:w-[43.75%] md:mb-0">
                {activeStories.map((_, idx) => (
                  <button 
                    key={idx}
                    onClick={(e) => { e.stopPropagation(); setActiveStoryIndex(idx); }}
                    className={`h-0.5 flex-1 rounded-full transition-all duration-300 cursor-pointer hover:h-1 ${idx === activeStoryIndex ? 'bg-white md:bg-garage-blue' : 'bg-white/20 hover:bg-white/40 md:bg-neutral-200 md:hover:bg-neutral-300 md:dark:bg-white/20 md:dark:hover:bg-white/40'}`}
                  />
                ))}
              </div>

              {/* Always-Visible Navigation Buttons — ProductCard style matching */}
              <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20">
                <button
                  onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                  disabled={activeStories.length <= 1}
                  className={`w-11 h-11 flex items-center justify-center rounded-full bg-black/15 backdrop-blur-md border border-white/30 shadow-lg text-white/90 hover:bg-black/25 hover:border-white/50 hover:scale-105 transition-all duration-200 active:scale-95 ${
                    activeStories.length <= 1 ? "opacity-30 cursor-not-allowed" : ""
                  }`}
                  aria-label="Previous story"
                >
                  <ChevronLeft size={20} strokeWidth={2.5} />
                </button>
              </div>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 md:right-[calc(43.75%+1rem)]">
                <button
                  onClick={(e) => { e.stopPropagation(); handleNext(); }}
                  disabled={activeStories.length <= 1}
                  className={`w-11 h-11 flex items-center justify-center rounded-full bg-black/15 backdrop-blur-md border border-white/30 shadow-lg text-white/90 hover:bg-black/25 hover:border-white/50 hover:scale-105 transition-all duration-200 active:scale-95 ${
                    activeStories.length <= 1 ? "opacity-30 cursor-not-allowed" : ""
                  }`}
                  aria-label="Next story"
                >
                  <ChevronRight size={20} strokeWidth={2.5} />
                </button>
              </div>

              {/* Bottom Content — title, description with strong dark gradient */}
              <div className="relative z-10 p-6 pb-8 mt-auto md:absolute md:inset-y-0 md:right-0 md:mt-0 md:flex md:w-[43.75%] md:flex-col md:justify-start md:overflow-y-auto md:border-l md:border-black/5 md:bg-white md:p-6 md:pt-[108px] md:dark:border-white/10 md:dark:bg-neutral-950">
                <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white leading-tight drop-shadow-lg md:text-neutral-950 dark:text-white">
                  {activeStory.label}
                </h2>
                {activeStory.description && (
                  <p className="text-sm text-white/80 mt-2 leading-relaxed font-medium max-w-sm drop-shadow-md md:text-neutral-600 dark:text-white/80">
                    {activeStory.description}
                  </p>
                )}
                {(activeStory.destination || activeStory.items) && (
                  <dl className="mt-4 space-y-3 border-t border-white/20 pt-4 md:border-black/10 md:dark:border-white/10">
                    {activeStory.destination && (
                      <div className="flex items-start gap-3">
                        <MapPin size={16} className="mt-0.5 shrink-0 text-garage-blue" />
                        <div className="min-w-0">
                          <dt className="text-[9px] font-black uppercase tracking-[0.18em] text-white/50 md:text-neutral-400 md:dark:text-white/50">Destination</dt>
                          <dd className="mt-0.5 text-sm font-semibold leading-snug text-white md:text-neutral-700 md:dark:text-white">{activeStory.destination}</dd>
                        </div>
                      </div>
                    )}
                    {activeStory.items && (
                      <div className="flex items-start gap-3">
                        <Package size={16} className="mt-0.5 shrink-0 text-garage-blue" />
                        <div className="min-w-0">
                          <dt className="text-[9px] font-black uppercase tracking-[0.18em] text-white/50 md:text-neutral-400 md:dark:text-white/50">Items</dt>
                          <dd className="mt-0.5 text-sm font-semibold leading-snug text-white md:text-neutral-700 md:dark:text-white">{activeStory.items}</dd>
                        </div>
                      </div>
                    )}
                  </dl>
                )}
              </div>
            </Motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
