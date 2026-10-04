import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, MapPin, Package } from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import UniversalImage from '../common/UniversalImage';
import InfiniteSwipeRow from '../common/InfiniteSwipeRow';
import { APP_CONFIG } from '../../appConfig';
import { isCombinedMarket, isStoryForMarket } from '../../utils/marketVisibility';

const SYNC_GLOW_COLORS = ['#0066ff', '#ff3b30', '#34c759', '#ffcc00', '#af52de', '#ff7a00', '#00c7be'];
const STORY_CARD_WIDTH = 112;
const STORY_CARD_GAP = 12;
// The labeled Garage Highlights and Garage Stories rows are the storefront
// presentation for Liquikits. Keep this legacy strip's modal/data behavior,
// but do not render a duplicate third row below the storefront sections.
const SHOW_STORIES_STRIP = false;

function isNamedProjectWithDisplayImage(project) {
  const name = String(project?.projectName || '').trim().toLowerCase();
  const image = typeof project?.image === 'string' ? project.image.trim() : project?.image?.url;
  const hasName = name
    && name !== 'unnamed project'
    && !/^project\s*#(?:\s*\d+)?$/.test(name);

  return Boolean(hasName && image);
}

function getStoryCardCount(viewportWidth) {
  return Math.max(1, Math.floor((viewportWidth + STORY_CARD_GAP) / (STORY_CARD_WIDTH + STORY_CARD_GAP)));
}

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

function getStoryDestination(story) {
  return story?.destination || [story?.city || story?.town, story?.province].filter(Boolean).join(', ');
}

function getStoryItems(items) {
  if (Array.isArray(items)) return items.filter(Boolean);
  const value = String(items || '').trim();
  return value ? value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : [];
}

export default function Stories({ isCompact, hideImmediately = false, hideAnimatedCards = false }) {
  // Kunin ang actual data mula sa Zustand store (DB)
  const { stories, isAdmin, isAdminView, setStoriesHeight } = useStore();
  const kits = useStore((state) => (
    state._activePath === '/'
      ? (state.homeKits || [])
      : (state.kits || [])
  ));
  const blueprints = useStore((state) => (
    state._activePath === '/'
      ? (state.homeBlueprints || [])
      : (state.blueprints || [])
  ));
  const printedProjects = useStore((state) => state.printedProjects || []);
  const storiesStatus = useStore((state) => state._datasetStatus?.stories || 'loading');
  const navigate = useNavigate();
  const containerRef = useRef(null);

  // Preview modal state
  const [activeStoryIndex, setActiveStoryIndex] = useState(null);
  const [syncingStoryCount, setSyncingStoryCount] = useState(() => (
    getStoryCardCount(window.innerWidth)
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
      setSyncingStoryCount(getStoryCardCount(window.innerWidth));
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
    return (stories || []).filter((story) => (
      !story.isDraft && isStoryForMarket(story, APP_CONFIG.market)
    ));
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

  const isAvailableStock = useCallback((stock) => {
    if (!stock || stock.order?.orderId || stock.isReserved) return false;
    if (isAdmin && isAdminView) return true;

    const releaseTimestamp = getTimestamp(stock.publicReleaseDate);
    return !releaseTimestamp || releaseTimestamp <= Date.now();
  }, [getTimestamp, isAdmin, isAdminView]);

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
        image: story.backgroundImage || story.image || '/snorlaxgarage.png',
        label: story.label || 'Garage Story',
        timestamp: getTimestamp(story.storyDate || story.createdAt || story.publishedAt || story.updatedAt),
        story
      }));

    const showKits = isCombinedMarket(APP_CONFIG.market) || APP_CONFIG.market === 'kits';
    const showPrints = isCombinedMarket(APP_CONFIG.market) || APP_CONFIG.market === 'prints';
    const kitItems = showKits ? (kits || []).map((kit) => {
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
    }) : [];

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
        label: kit.name || 'Pre-order Kit',
        timestamp: getTimestamp(kit.lastUpdated || kit.createdAt)
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
        label: kit.name || 'Onhand Kit',
        timestamp: getTimestamp(kit.lastUpdated || kit.createdAt)
      }));

    const recentlyBackInStockItems = selectUniqueKits([...kitItems]
      .filter((entry) => entry.availableOnhand.length > 0 && entry.restockTimestamp > 0)
      .sort((a, b) => b.restockTimestamp - a.restockTimestamp)
    , 3).map((kit) => ({
        id: `restocked:${kit.id}`,
        type: 'kit',
        targetId: kit.id,
        image: getKitImage(kit),
        label: kit.name || 'Back in Stock',
        timestamp: getTimestamp(kit.lastRestockedAt || kit.lastAvailableAt || kit.lastUpdated || kit.createdAt)
      }));

    const projectCandidates = (showPrints ? [...(blueprints || []), ...(printedProjects || [])] : [])
      .filter((project) => (
        project?.isPublished !== false
        && project?.status !== 'Draft'
        && isNamedProjectWithDisplayImage(project)
      ))
      .sort((a, b) => (
        getTimestamp(b.createdAt || b.updatedAt) - getTimestamp(a.createdAt || a.updatedAt)
      ))
      .slice(0, 5);
    const recentProjects = projectCandidates
      .filter((project) => (isAdmin && isAdminView) || project?.canAddToBasket !== false)
      .map((project) => ({
        id: `project:${project.id}`,
        type: 'project',
        targetId: project.id,
        // Match the image used by ProjectCard's public grid card.
        image: project.image || '/snorlaxgarage.png',
        label: project.projectName || project.name || 'Garage Project',
        timestamp: getTimestamp(project.lastUpdated || project.createdAt || project.updatedAt)
      }));

    // Keep the strip full when there are fewer than five public projects or a
    // project is stopped for production. Those project slots are temporarily
    // filled with other public kits.
    const replacementProjectSlots = Math.max(0, 5 - recentProjects.length);
    const replacementKits = selectUniqueKits([...kitItems]
      .filter((entry) => (
        entry.availablePreOrders.length > 0 || entry.availableOnhand.length > 0
      ))
      .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
    , replacementProjectSlots).map((kit) => ({
        id: `project-replacement:${kit.id}`,
        type: 'kit',
        targetId: kit.id,
        image: getKitImage(kit),
        label: kit.name || 'Available Kit',
        timestamp: getTimestamp(kit.lastUpdated || kit.createdAt)
      }));

    const mixedItems = [
      ...recentStories,
      ...preOrderItems,
      ...onhandItems,
      ...recentlyBackInStockItems,
      ...recentProjects,
      ...replacementKits
    ].filter(Boolean);

    return mixedItems.sort((a, b) => (
      b.timestamp - a.timestamp || String(a.id).localeCompare(String(b.id))
    ));
  }, [activeStories, blueprints, getKitImage, getKitStocks, getTimestamp, isAdmin, isAdminView, isAvailableStock, isOnhandStock, isPreOrderStock, kits, printedProjects]);

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

  const isShowingPlaceholders = highlightItems.length === 0 && storiesStatus === 'loading';
  const filledHighlightItems = React.useMemo(() => {
    if (highlightItems.length === 0) return [];

    // Match the loading placeholder count so the strip stays full when the
    // real highlight data replaces the placeholders on small and medium
    // viewports.
    return highlightItems;
  }, [highlightItems]);
  const displayStories = isShowingPlaceholders
    ? syncingStories
    : highlightItems.length > 0
      ? filledHighlightItems
      : [];
  const isStoriesStripHidden = isCompact || hideAnimatedCards;

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
         ${isStoriesStripHidden ? 'max-h-0 opacity-0 pointer-events-none' : 'max-h-[500px] opacity-100'}
        bg-neutral-50/50 dark:bg-black/40
      `}>
        <div className="w-full py-6 relative">
          {/* Edge Fades - desktop only */}
          <div className="hidden lg:block absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-white dark:from-neutral-900 via-white/80 dark:via-neutral-900/80 to-transparent z-50 pointer-events-none" />
          <div className="hidden lg:block absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-white dark:from-neutral-900 via-white/80 dark:via-neutral-900/80 to-transparent z-50 pointer-events-none" />

          <InfiniteSwipeRow
            ariaLabel="Garage highlight carousel"
            className={hideAnimatedCards ? 'invisible' : ''}
          >
            {displayStories.map((highlight, index) => (
              (() => {
                const isLoadingCard = highlight.type === 'loading';

                return (
                  <div
                    key={`${highlight.id}-${index}`}
                    className={`story-card glass-card w-40 sm:w-44 md:w-48 lg:w-56 aspect-[3/4] flex-shrink-0 self-start relative overflow-hidden rounded-[1.5rem] p-1 shadow-xl transition-all duration-500 lg:hover:-translate-y-1 ${isLoadingCard
                      ? 'cursor-default bg-gradient-to-br from-[#0866FF] to-[#00CFFF]'
                      : 'cursor-pointer'
                    }`}
                  >
                    <div className={`story-card-media relative h-full w-full overflow-hidden rounded-[1.3rem] ${isLoadingCard ? 'bg-gradient-to-br from-[#0866FF] to-[#00CFFF]' : ''}`}>
                      <button
                        type="button"
                        onClick={() => handleHighlightClick(highlight)}
                        disabled={isLoadingCard}
                        className="absolute inset-0 w-full text-left disabled:cursor-default"
                        aria-label={isLoadingCard ? 'Loading garage highlight' : `View highlight: ${highlight.label || 'Garage highlight'}`}
                      >
                        <div className="relative h-full w-full overflow-hidden rounded-[1.3rem] bg-[var(--color-bg)]">
                          {highlight.image ? (
                            <UniversalImage
                              src={highlight.image}
                              alt={highlight.label || 'Garage highlight'}
                              className={`absolute z-[1] ${isLoadingCard
                                ? 'inset-0 m-auto h-[68%] w-[68%] max-h-full max-w-full object-contain'
                                : 'inset-0 h-full w-full object-cover transition-transform duration-700 lg:group-hover:scale-110'
                              }`}
                            />
                          ) : (
                            <div
                              className="absolute inset-0"
                              style={{
                                background: `linear-gradient(135deg, ${highlight.value || '#0866ff'} 0%, #111827 100%)`,
                              }}
                            />
                          )}
                        </div>
                      </button>
                    </div>
                  </div>
                );
              })()
            ))}
          </InfiniteSwipeRow>
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
              className="story-card glass-card relative h-[min(92vh,44rem)] w-[min(92vw,33rem)] overflow-hidden rounded-[1.5rem] p-1 shadow-2xl"
            >
              <div className="story-card-media relative h-full w-full overflow-hidden rounded-[1.3rem] bg-neutral-950">
                {/* Story Image / Background */}
                {activeStory.backgroundImage ? (
                  <UniversalImage
                    src={activeStory.backgroundImage} 
                    alt={activeStory.label}
                    className="w-full h-full object-cover"
                    style={{
                      transform: `scale(${(activeStory.bgZoom || 1) * (Math.abs(Math.cos((activeStory.bgRotation || 0) * Math.PI / 180)) + (16/9) * Math.abs(Math.sin((activeStory.bgRotation || 0) * Math.PI / 180)))}) rotate(${activeStory.bgRotation || 0}deg)`,
                      transformOrigin: 'center center'
                    }}
                  />
                ) : activeStory.image ? (
                  <UniversalImage
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
                {/* Gradients keep the header and story details readable over the image. */}
                <div className="absolute inset-0 z-[5] bg-gradient-to-b from-black/75 via-black/10 to-transparent" />
                <div className="absolute inset-0 z-[5] bg-gradient-to-t from-black via-black/75 via-30% to-transparent" />

                {/* Overlays Container (Stickers, Masks, Texts) */}
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
                            <UniversalImage
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
                          <UniversalImage
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
                {/* Header row stays on the image pane: brand logo, story title, and date. */}
                <div className="absolute left-0 right-0 top-0 z-30 flex items-center gap-3 p-5 pr-16">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-white/70 bg-white/20 shadow-lg backdrop-blur-md">
                    <img src="/snorlaxgarage.png" alt="SnorlaxGarage" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-base font-black italic uppercase leading-tight tracking-tight text-white drop-shadow-lg">
                      {activeStory.label || 'Garage Story'}
                    </h3>
                    <span className="text-[13px] font-bold uppercase tracking-widest text-white/80 drop-shadow-md">
                      {formatStoryDate(activeStory.storyDate || activeStory.createdAt || activeStory.lastUpdated)}
                    </span>
                  </div>
                </div>

                {/* Sticky close control stays pinned to the story card's upper-right corner. */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setActiveStoryIndex(null); }}
                  className="absolute right-4 top-4 z-40 rounded-full border border-white/50 bg-black/25 p-2 text-white shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:bg-black/50 focus:outline-none focus:ring-2 focus:ring-white/80"
                  aria-label="Close story"
                >
                  <X size={20} />
                </button>

                {/* Progress Bars */}
                <div className="absolute left-5 right-5 top-[92px] z-30 flex gap-1">
                {activeStories.map((_, idx) => (
                  <button 
                    key={idx}
                    onClick={(e) => { e.stopPropagation(); setActiveStoryIndex(idx); }}
                    className={`h-0.5 flex-1 rounded-full transition-all duration-300 cursor-pointer hover:h-1 ${idx === activeStoryIndex ? 'bg-white md:bg-garage-blue' : 'bg-white/20 hover:bg-white/40 md:bg-neutral-200 md:hover:bg-neutral-300 md:dark:bg-white/20 md:dark:hover:bg-white/40'}`}
                  />
                ))}
                </div>

                {/* Story navigation */}
                <div className="absolute left-4 top-1/2 z-30 -translate-y-1/2">
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
                <div className="absolute right-4 top-1/2 z-30 -translate-y-1/2">
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

                {/* Bottom Content — description and story details over the image */}
                <div className="absolute bottom-0 left-0 right-0 z-20 max-h-[48%] overflow-y-auto p-5 pb-6 text-white">
                {activeStory.description && (
                  <p className="max-w-sm text-sm font-medium leading-relaxed text-white/90 drop-shadow-md">
                    {activeStory.description}
                  </p>
                )}
                {(getStoryDestination(activeStory) || getStoryItems(activeStory.items).length > 0) && (
                  <dl className="mt-4 space-y-3 border-t border-white/30 pt-4">
                    {getStoryDestination(activeStory) && (
                      <div className="flex items-start gap-3">
                        <MapPin size={16} className="mt-0.5 shrink-0 text-garage-blue" />
                        <div className="min-w-0">
                          <dt className="text-[9px] font-black uppercase tracking-[0.18em] text-white/60">Destination</dt>
                          <dd className="mt-0.5 text-sm font-semibold leading-snug text-white">{getStoryDestination(activeStory)}</dd>
                        </div>
                      </div>
                    )}
                    {getStoryItems(activeStory.items).length > 0 && (
                      <div className="flex items-start gap-3">
                        <Package size={16} className="mt-0.5 shrink-0 text-garage-blue" />
                        <div className="min-w-0">
                          <dt className="text-[9px] font-black uppercase tracking-[0.18em] text-white/60">Items</dt>
                          <dd className="mt-0.5 space-y-1 text-sm font-semibold leading-snug text-white">
                            {getStoryItems(activeStory.items).map((item, index) => <div key={`${item}-${index}`}>{item}</div>)}
                          </dd>
                        </div>
                      </div>
                    )}
                  </dl>
                )}
                </div>
              </div>
            </Motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
