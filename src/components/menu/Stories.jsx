import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';

const SYNC_GLOW_COLORS = ['#0066ff', '#ff3b30', '#34c759', '#ffcc00', '#af52de', '#ff7a00', '#00c7be'];

function getRandomSyncColor() {
  return SYNC_GLOW_COLORS[Math.floor(Math.random() * SYNC_GLOW_COLORS.length)];
}

export default function Stories({ isCompact }) {
  // Kunin ang actual data mula sa Zustand store (DB)
  const { stories, garageInfo, isLoading, setStoriesHeight } = useStore();
  const [imgError, setImgError] = useState(false);
  const containerRef = useRef(null);

  // Preview modal state
  const [activeStoryIndex, setActiveStoryIndex] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
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

  // Track mobile breakpoint for preview mode
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Filter out draft stories for non-admin viewers
  const activeStories = React.useMemo(() => {
    return (stories || []).filter(story => !story.isDraft);
  }, [stories]);

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

  const DEFAULT_LOGO = "https://via.placeholder.com/150";

  // 1. DYNAMIC DATA LOGIC:
  // Kung may laman na ang stories (from DB), yun ang gamitin.
  // Kung wala pa (loading/network delay), gamit muna placeholder para laging may render.
  const syncingStories = React.useMemo(() => (
    Array.from({ length: 3 }, (_, index) => ({
      id: `db-loading-${index + 1}`,
      label: 'Syncing...',
      value: getRandomSyncColor()
    }))
  ), []);

  const activeData = activeStories.length > 0 ? activeStories : syncingStories;

  const displayStories = [...activeData, ...activeData, ...activeData];

  // Logic to determine which image to show
  const displayImg = (!garageInfo?.fbPageId || imgError) ? (garageInfo?.logoURL || DEFAULT_LOGO) : `https://graph.facebook.com/${garageInfo.fbPageId}/picture?type=large`;

  // Click handler for story cards — only activates real stories, not placeholders
  const handleStoryClick = (storyId) => {
    if (activeStories.length === 0) return;
    const realIndex = activeStories.findIndex(s => s.id === storyId);
    if (realIndex !== -1) setActiveStoryIndex(realIndex);
  };

  const activeStory = (activeStoryIndex !== null && activeStories.length > 0) ? activeStories[activeStoryIndex] : null;

  return (
    <>
      <div 
        ref={containerRef}
        className={`
        relative z-40 transition-all duration-700 ease-in-out border-b border-white/10 overflow-hidden w-full
        ${isCompact ? 'max-h-0 opacity-0 pointer-events-none' : 'max-h-[500px] opacity-100'}
        bg-neutral-50/50 dark:bg-black/40
      `}>
        <div className="w-full py-6 relative">
          {/* Edge Fades - desktop only */}
          <div className="hidden lg:block absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-white dark:from-neutral-900 via-white/80 dark:via-neutral-900/80 to-transparent z-50 pointer-events-none" />
          <div className="hidden lg:block absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-white dark:from-neutral-900 via-white/80 dark:via-neutral-900/80 to-transparent z-50 pointer-events-none" />

          <div 
            className={`flex gap-3 w-max ${stories?.length > 0 && 'animate-infinite-scroll'}`}
            style={{ '--scroll-speed': '50s' }}
          >
            {displayStories.map((story, index) => (
              <div 
                key={`${story.id}-${index}`} 
                onClick={() => handleStoryClick(story.id)}
                className="w-28 h-44 rounded-[1.5rem] flex-shrink-0 relative overflow-hidden group cursor-pointer glass-card p-1 shadow-xl"
              >
                <div 
                  className="w-full h-full rounded-[1.3rem] relative overflow-hidden"
                  style={{ backgroundColor: `${story.value}20` }} 
                >
                  {/* Story Image — kung meron sa DB, i-render as background */}
                  {story.image && (
                    <img 
                      src={story.image} 
                      alt={story.label} 
                      className="absolute inset-0 w-full h-full object-cover z-[1]" 
                    />
                  )}

                  {/* Visual Glow Layer - Ito na yung actual color from DB */}
                  <div 
                    className={`absolute -inset-4 opacity-80 dark:opacity-30 blur-2xl transition-opacity group-hover:opacity-50 ${isLoading && 'animate-pulse'}`}
                    style={{ backgroundColor: story.value }}
                  />
                  
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-[2]" />
                </div>

                {/* Profile Icon */}
                <div className="absolute top-3 left-3 w-8 h-8 rounded-full border-2 border-white/80 bg-white/20 backdrop-blur-md overflow-hidden z-10 shadow-sm">
                  <img 
                    src={displayImg}
                    alt="SG" 
                    className="w-full h-full object-cover"
                    onError={() => setImgError(true)}
                  />
                </div>

                {/* Label from DB */}
                <span className="absolute bottom-4 left-4 right-4 text-[9px] text-white font-black uppercase truncate tracking-widest leading-none drop-shadow-lg z-20">
                  {story.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ====== STORY PREVIEW MODAL ====== */}
      <AnimatePresence>
        {activeStory && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center">
            {/* Backdrop */}
            <Motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-xl"
              onClick={() => setActiveStoryIndex(null)}
            />

            {/* Story Content */}
            <Motion.div
              key={activeStory.id}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              className={
                isMobile
                  ? "relative w-full h-full bg-neutral-950 flex flex-col"
                  : "relative max-w-md w-full aspect-[9/16] rounded-3xl overflow-hidden shadow-2xl bg-neutral-900 border border-white/10 flex flex-col"
              }
            >
              {/* Story Image / Background */}
              <div className="absolute inset-0 overflow-hidden">
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
                <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-transparent z-[5]" />
                {/* Bottom gradient — heavier dark shadow for description */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 via-30% to-transparent z-[5]" />
              </div>

              {/* Overlays Container (Stickers, Masks, Texts) */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
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
                className="absolute top-5 right-5 z-30 p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/80 hover:text-white hover:bg-black/60 transition-all shadow-lg"
              >
                <X size={20} />
              </button>

              {/* Top Header — profile pic, page name */}
              <div className="relative z-10 flex items-center gap-3 p-5 pt-6 pr-14">
                <div className="w-10 h-10 rounded-full border-2 border-white/60 bg-white/20 backdrop-blur-md overflow-hidden shadow-lg flex-shrink-0">
                  <img 
                    src={displayImg} 
                    alt="SG" 
                    className="w-full h-full object-cover"
                    onError={() => setImgError(true)}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-black italic uppercase tracking-tight text-white leading-none drop-shadow-lg truncate">
                    {garageInfo?.name || 'SNORLAX GARAGE'}
                  </h3>
                  <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest">
                    Story {activeStoryIndex + 1} of {activeStories.length}
                  </span>
                </div>
              </div>

              {/* Progress Bars */}
              <div className="relative z-10 flex gap-1 px-5 mb-auto">
                {activeStories.map((_, idx) => (
                  <button 
                    key={idx}
                    onClick={(e) => { e.stopPropagation(); setActiveStoryIndex(idx); }}
                    className={`h-0.5 flex-1 rounded-full transition-all duration-300 cursor-pointer hover:h-1 ${idx === activeStoryIndex ? 'bg-white' : 'bg-white/20 hover:bg-white/40'}`}
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
              <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20">
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
              <div className="relative z-10 p-6 pb-8 mt-auto">
                <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white leading-tight drop-shadow-lg">
                  {activeStory.label}
                </h2>
                {activeStory.description && (
                  <p className="text-sm text-white/80 mt-2 leading-relaxed font-medium max-w-sm drop-shadow-md">
                    {activeStory.description}
                  </p>
                )}
              </div>
            </Motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
