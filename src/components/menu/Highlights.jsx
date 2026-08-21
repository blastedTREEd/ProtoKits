import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Sparkles, Image as ImageIcon, Plus, BookImage, ChevronDown, ChevronUp, NotebookPen, Trash2 } from 'lucide-react';
import { useStore } from '../../store/useStore';

function getStoryTime(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'number') return value;

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getStoryImage(story) {
  return story.backgroundImage || story.image || story.stickers?.find((sticker) => sticker.src)?.src || '';
}

export default function Highlights() {
  const { stories, isAdmin, isAdminView, isLoading, deleteStory } = useStore();
  const canManageStories = isAdmin && isAdminView;
  const sectionRef = useRef(null);
  const headerRef = useRef(null);
  const storiesScrollLockTopRef = useRef(null);
  const [isHeaderStuck, setIsHeaderStuck] = useState(false);
  const [isHighlightsExpanded, setIsHighlightsExpanded] = useState(false);
  const [isDraftView, setIsDraftView] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedStoryIds, setSelectedStoryIds] = useState(() => new Set());
  const [isDeletingStories, setIsDeletingStories] = useState(false);
  const isStoriesFocusMode = canManageStories && (isSelectionMode || isDraftView);

  const focusStoriesSection = useCallback(() => {
    const sectionTop = sectionRef.current?.getBoundingClientRect().top;
    if (typeof sectionTop !== 'number') return;

    const navbarHeight = window.innerWidth >= 640 ? 60 : 56;
    const desiredLockTop = Math.max(0, Math.round(window.scrollY + sectionTop - navbarHeight));
    const maxScrollTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const lockTop = Math.min(desiredLockTop, maxScrollTop);
    storiesScrollLockTopRef.current = lockTop;
    window.scrollTo({ top: lockTop, behavior: 'auto' });
  }, []);

  useEffect(() => {
    if (!isStoriesFocusMode) {
      storiesScrollLockTopRef.current = null;
      return undefined;
    }

    const handleStoriesScroll = () => {
      const lockTop = storiesScrollLockTopRef.current;
      if (lockTop !== null && window.scrollY < lockTop) {
        window.scrollTo({ top: lockTop, behavior: 'auto' });
      }
    };

    window.addEventListener('scroll', handleStoriesScroll, { passive: true });
    const focusFrame = window.requestAnimationFrame(focusStoriesSection);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('scroll', handleStoriesScroll);
    };
  }, [focusStoriesSection, isStoriesFocusMode]);

  useEffect(() => {
    let animationFrame;

    const updateStickyState = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        if (!headerRef.current) return;
        const navbarHeight = window.innerWidth >= 640 ? 60 : 56;
        const isStuck = headerRef.current.getBoundingClientRect().top <= navbarHeight + 1;
        setIsHeaderStuck(isStuck);
      });
    };

    updateStickyState();
    window.addEventListener('scroll', updateStickyState, { passive: true });
    window.addEventListener('resize', updateStickyState);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('scroll', updateStickyState);
      window.removeEventListener('resize', updateStickyState);
    };
  }, []);

  useEffect(() => {
    if (!isHighlightsExpanded) return undefined;

    const handleExpandedStoriesScroll = () => {
      if (!sectionRef.current) return;

      const navbarHeight = window.innerWidth >= 640 ? 60 : 56;
      const sectionDocumentTop = window.scrollY + sectionRef.current.getBoundingClientRect().top;
      if (window.scrollY < sectionDocumentTop - navbarHeight) {
        setIsHighlightsExpanded(false);
      }
    };

    window.addEventListener('scroll', handleExpandedStoriesScroll, { passive: true });
    handleExpandedStoriesScroll();
    return () => window.removeEventListener('scroll', handleExpandedStoriesScroll);
  }, [isHighlightsExpanded]);

  const highlights = useMemo(() => {
    return (stories || [])
      .filter((story) => !story.isDraft)
      .sort((a, b) => {
        const timeDifference = getStoryTime(b.storyDate || b.createdAt || b.lastUpdated) - getStoryTime(a.storyDate || a.createdAt || a.lastUpdated);
        return timeDifference || Number(b.order || 0) - Number(a.order || 0);
      });
  }, [stories]);

  const drafts = useMemo(() => {
    return (stories || [])
      .filter((story) => story.isDraft)
      .sort((a, b) => {
        const timeDifference = getStoryTime(b.storyDate || b.createdAt || b.lastUpdated) - getStoryTime(a.storyDate || a.createdAt || a.lastUpdated);
        return timeDifference || Number(b.order || 0) - Number(a.order || 0);
      });
  }, [stories]);

  const visibleStories = isDraftView ? drafts : highlights;

  const handleCreateHighlight = () => {
    window.dispatchEvent(new CustomEvent('openStoriesManager', { detail: { mode: 'add' } }));
  };

  const handleManageHighlights = () => {
    focusStoriesSection();
    setIsDraftView((currentView) => !currentView);
    setIsSelectionMode(false);
    setSelectedStoryIds(new Set());
  };

  const handleOpenHighlight = (storyId) => {
    window.dispatchEvent(new CustomEvent('openStoryHighlight', { detail: { storyId } }));
  };

  const handleEditHighlight = (event, story) => {
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent('openStoriesManager', { detail: { mode: 'edit', story } }));
  };

  const toggleStorySelection = (event, storyId) => {
    event.stopPropagation();
    setSelectedStoryIds((currentSelection) => {
      const nextSelection = new Set(currentSelection);
      if (nextSelection.has(storyId)) {
        nextSelection.delete(storyId);
      } else {
        nextSelection.add(storyId);
      }
      if (nextSelection.size === 0) {
        setIsSelectionMode(false);
      }
      return nextSelection;
    });
  };

  const handleSelectionAction = async () => {
    focusStoriesSection();

    if (!isSelectionMode) {
      setIsSelectionMode(true);
      return;
    }

    if (selectedStoryIds.size === 0) {
      setIsSelectionMode(false);
      return;
    }

    const selectedStories = visibleStories.filter((story) => selectedStoryIds.has(story.id));
    const storyLabel = selectedStories.length === 1 ? 'story' : 'stories';
    if (!window.confirm(`Delete ${selectedStories.length} selected ${storyLabel}?`)) return;

    setIsDeletingStories(true);
    try {
      await Promise.all(selectedStories.map((story) => deleteStory(story.id)));
      setSelectedStoryIds(new Set());
      setIsSelectionMode(false);
    } catch (error) {
      console.error('Failed to delete selected stories:', error);
      window.alert('Failed to delete selected stories. Please try again.');
    } finally {
      setIsDeletingStories(false);
    }
  };

  const isLoadingHighlights = isLoading && visibleStories.length === 0;
  const hasMoreHighlights = highlights.length > 6;

  const getCollapsedStoryVisibility = (index) => {
    if (canManageStories || isHighlightsExpanded || index < 6) return '';
    if (index < 8) return 'hidden sm:block';
    if (index < 10) return 'hidden sm:block md:hidden lg:block';
    return 'hidden';
  };

  return (
    <section
      ref={sectionRef}
      className="relative overflow-visible border-t border-black/[0.06] bg-neutral-50 px-5 pb-10 dark:border-white/[0.08] dark:bg-[#111111] sm:px-8 lg:px-12"
    >
      <div className="mx-auto max-w-7xl">
        <div ref={headerRef} className="sticky top-[56px] z-[80] -mx-5 mb-4 flex flex-nowrap items-center justify-between gap-2 border-b border-black/5 bg-neutral-50/95 px-5 py-4 backdrop-blur-md transition-all duration-300 dark:border-white/5 dark:bg-[#111111]/95 sm:top-[60px] sm:-mx-8 sm:gap-4 sm:px-8 lg:-mx-12 lg:px-12">
          <div className="min-w-0 flex-1 text-left">
            <div className="flex items-center">
              <h2 className={`${isHeaderStuck ? 'text-[18px]' : 'text-[clamp(18px,6vw,25px)]'} inline-flex min-w-0 items-center gap-1 whitespace-nowrap font-black italic uppercase leading-none tracking-[-0.06em] text-neutral-950 transition-[font-size] duration-300 dark:text-white`}>
                <span className="text-garage-blue">Garage</span>
                <span>{isDraftView ? 'Drafts' : 'Stories'}</span>
                <Sparkles className="shrink-0" size={16} strokeWidth={2} aria-hidden="true" />
              </h2>
            </div>
          </div>
          {(canManageStories || hasMoreHighlights) && (
            <div className="flex shrink-0 items-center gap-2">
              {!canManageStories && hasMoreHighlights && (
                <button
                  type="button"
                  onClick={() => setIsHighlightsExpanded((expanded) => !expanded)}
                  className={`inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-garage-blue text-[9px] font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-blue-500/25 transition-all hover:-translate-y-0.5 hover:bg-blue-600 hover:shadow-xl active:scale-95 sm:text-[10px] ${isHighlightsExpanded ? 'w-9 px-0' : 'px-3 sm:px-4'}`}
                  aria-expanded={isHighlightsExpanded}
                  aria-controls="garage-highlights-grid"
                  aria-label={isHighlightsExpanded ? 'Collapse stories' : 'Show all stories'}
                  title={isHighlightsExpanded ? 'Collapse stories' : 'Show all stories'}
                >
                  {isHighlightsExpanded ? <ChevronUp size={14} strokeWidth={2.5} aria-hidden="true" /> : (
                    <>
                      Show all
                      <ChevronDown size={14} strokeWidth={2.5} aria-hidden="true" />
                    </>
                  )}
                </button>
              )}

              {canManageStories && (
                <>
              <button
                type="button"
                onClick={handleCreateHighlight}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-garage-blue text-white shadow-lg shadow-blue-500/25 transition-all hover:scale-110 hover:bg-blue-600 active:scale-110"
                aria-label="Create a new garage story"
                title="Create a new garage story"
              >
                <Plus size={20} strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={handleManageHighlights}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-md transition-all hover:scale-110 hover:shadow-lg active:scale-110 ${isDraftView
                  ? 'border-garage-blue bg-garage-blue text-white shadow-blue-500/25 hover:border-blue-600 hover:bg-blue-600'
                  : 'border-garage-blue/20 bg-garage-blue/10 text-garage-blue hover:border-garage-blue/40 hover:bg-garage-blue/15'
                }`}
                aria-label={isDraftView ? 'Show published stories' : 'Show draft stories'}
                title={isDraftView ? 'Show published stories' : 'Show draft stories'}
              >
                <BookImage size={18} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={handleSelectionAction}
                disabled={isDeletingStories}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-md transition-all hover:scale-110 active:scale-110 disabled:cursor-wait disabled:opacity-60 ${selectedStoryIds.size > 0
                  ? 'border-red-500 bg-red-500 text-white shadow-red-500/25 hover:border-red-600 hover:bg-red-600'
                  : isSelectionMode
                    ? 'border-garage-blue bg-garage-blue text-white shadow-blue-500/25 hover:border-blue-600 hover:bg-blue-600'
                    : 'border-garage-blue/20 bg-garage-blue/10 text-garage-blue hover:border-garage-blue/40 hover:bg-garage-blue/15'
                }`}
                aria-label={selectedStoryIds.size > 0 ? `Delete ${selectedStoryIds.size} selected stories` : 'Select stories to delete'}
                title={selectedStoryIds.size > 0 ? 'Delete selected stories' : 'Select stories'}
              >
                {selectedStoryIds.size > 0 ? <Trash2 size={18} strokeWidth={2} /> : <NotebookPen size={18} strokeWidth={2} />}
              </button>
                </>
              )}
            </div>
          )}
        </div>

        {visibleStories.length > 0 || canManageStories || isLoadingHighlights ? (
          <>
          <div id="garage-highlights-grid" className="grid min-h-[300px] content-start grid-cols-3 items-start gap-2 sm:min-h-[300px] sm:grid-cols-5 sm:gap-4 md:min-h-[460px] md:grid-cols-4 lg:min-h-[500px] lg:grid-cols-5 xl:min-h-[620px] 2xl:min-h-[664px]">
            {isLoadingHighlights && Array.from({ length: 5 }).map((_, index) => (
              <div key={`highlight-skeleton-${index}`} className="relative aspect-[3/4] self-start overflow-hidden rounded-2xl border border-black/[0.05] bg-neutral-200 shadow-sm dark:border-2 dark:border-neutral-500 dark:bg-neutral-900">
                <img src="/snorlaxgarage.png" alt="Loading highlights" className="h-full w-full object-contain p-6 opacity-20" />
              </div>
            ))}

            {visibleStories.map((story, index) => {
              const image = getStoryImage(story);
              const storyDate = getStoryTime(story.storyDate || story.createdAt || story.lastUpdated);
              const isSelected = selectedStoryIds.has(story.id);

              return (
                <div
                  key={story.id}
                  className={`${getCollapsedStoryVisibility(index)} group relative aspect-[3/4] self-start overflow-hidden rounded-2xl bg-neutral-200 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-500/10 dark:bg-neutral-900 ${isSelected
                    ? 'border-2 border-garage-blue ring-2 ring-garage-blue/30'
                    : 'border border-black/[0.05] dark:border-2 dark:border-neutral-500'
                  }`}
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      if (isSelectionMode) {
                        toggleStorySelection(event, story.id);
                      } else if (isDraftView) {
                        handleEditHighlight(event, story);
                      } else {
                        handleOpenHighlight(story.id);
                      }
                    }}
                    className="absolute inset-0 w-full text-left"
                    aria-label={isSelectionMode
                      ? `${isSelected ? 'Deselect' : 'Select'} story: ${story.label || 'Untitled highlight'}`
                      : `View highlight: ${story.label || 'Untitled highlight'}`}
                  >
                    {image ? (
                      <img
                        src={image}
                        alt={story.label || 'Garage story'}
                        className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
                      />
                    ) : (
                      <div
                        className="absolute inset-0"
                        style={{
                          background: `linear-gradient(135deg, ${story.value || '#0866ff'} 0%, #111827 100%)`,
                        }}
                      />
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/15 opacity-80 transition-opacity duration-300 group-hover:opacity-100" />

                    <div className="absolute inset-x-0 bottom-0 p-3 text-left sm:p-4">
                      <h3 className="line-clamp-2 text-sm font-black uppercase leading-tight tracking-tight text-white sm:text-base">
                        {story.label || 'Untitled highlight'}
                      </h3>
                      {storyDate > 0 && (
                        <time className="block text-[11px] font-bold uppercase tracking-[0.18em] text-white">
                          {new Date(storyDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </time>
                      )}
                    </div>
                  </button>

                  {canManageStories && (isSelectionMode ? (
                    <button
                      type="button"
                      onClick={(event) => toggleStorySelection(event, story.id)}
                      className="absolute right-2 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/20 text-white shadow-lg backdrop-blur-sm transition-all hover:scale-110"
                      aria-label={`${isSelected ? 'Deselect' : 'Select'} story: ${story.label || 'Untitled highlight'}`}
                    >
                      <Circle
                        size={21}
                        strokeWidth={2.5}
                        className={isSelected ? 'fill-garage-blue text-garage-blue' : 'text-white'}
                        aria-hidden="true"
                      />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(event) => handleEditHighlight(event, story)}
                      className="absolute right-2 top-2 z-20 rounded-full border border-white/20 bg-gradient-to-br from-amber-500 to-amber-600 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white shadow-lg transition-all hover:scale-110"
                      aria-label={`Edit highlight: ${story.label || 'Untitled highlight'}`}
                    >
                      Edit
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          {!isLoadingHighlights && visibleStories.length === 0 && (
            <div className="col-span-full flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-black/10 bg-white/70 px-6 text-center dark:border-white/10 dark:bg-white/[0.03]">
              <ImageIcon className="mb-4 text-garage-blue" size={26} />
              <p className="text-sm font-black uppercase tracking-[0.18em] text-neutral-900 dark:text-white">
                {isDraftView ? 'No draft stories' : 'No published stories'}
              </p>
              <p className="mt-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {isDraftView ? 'Create a story and save it as a draft to see it here.' : 'Published garage stories will appear here.'}
              </p>
            </div>
          )}

          </>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-black/10 bg-white/70 px-6 text-center dark:border-white/10 dark:bg-white/[0.03]">
            <ImageIcon className="mb-4 text-garage-blue" size={26} />
            <p className="text-sm font-black uppercase tracking-[0.18em] text-neutral-900 dark:text-white">New highlights are loading in</p>
            <p className="mt-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">Check back soon for the latest garage stories.</p>
          </div>
        )}
      </div>
    </section>
  );
}
