import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Plus } from 'lucide-react';
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
  const { stories, isAdmin, isAdminView } = useStore();
  const canManageStories = isAdmin && isAdminView;
  const headerRef = useRef(null);
  const [isHeaderStuck, setIsHeaderStuck] = useState(false);

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

  const highlights = useMemo(() => {
    return (stories || [])
      .filter((story) => !story.isDraft)
      .sort((a, b) => {
        const timeDifference = getStoryTime(b.createdAt || b.lastUpdated) - getStoryTime(a.createdAt || a.lastUpdated);
        return timeDifference || Number(b.order || 0) - Number(a.order || 0);
      });
  }, [stories]);

  const handleCreateHighlight = () => {
    window.dispatchEvent(new Event('openStoriesManager'));
  };

  const handleOpenHighlight = (storyId) => {
    window.dispatchEvent(new CustomEvent('openStoryHighlight', { detail: { storyId } }));
  };

  return (
    <section className="relative overflow-visible border-t border-black/[0.06] bg-neutral-50 px-5 pb-10 dark:border-white/[0.08] dark:bg-[#111111] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div ref={headerRef} className="sticky top-[56px] z-[80] -mx-5 mb-10 flex flex-col gap-5 border-b border-black/5 bg-neutral-50/95 px-5 py-4 backdrop-blur-md transition-all duration-300 dark:border-white/5 dark:bg-[#111111]/95 sm:top-[60px] sm:-mx-8 sm:flex-row sm:items-end sm:justify-between sm:px-8 lg:-mx-12 lg:px-12">
          <div className="text-left">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h2 className={`${isHeaderStuck ? 'text-[18px]' : 'text-[40px]'} font-black italic uppercase leading-none tracking-[-0.06em] text-neutral-950 transition-[font-size] duration-300 dark:text-white`}>
                <span className="text-garage-blue">Garage</span> Highlights
              </h2>
            </div>
          </div>
        </div>

        {highlights.length > 0 || canManageStories ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {canManageStories && (
              <button
                type="button"
                onClick={handleCreateHighlight}
                className="group relative aspect-square overflow-hidden rounded-2xl border-2 border-dashed border-garage-blue/40 bg-garage-blue/[0.04] text-left transition-all duration-300 hover:-translate-y-1 hover:border-garage-blue hover:bg-garage-blue/10 hover:shadow-2xl hover:shadow-blue-500/10 dark:border-garage-blue/50 dark:bg-garage-blue/[0.08] dark:hover:bg-garage-blue/15"
                aria-label="Create a new highlight"
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-garage-blue text-white shadow-lg shadow-blue-500/25 transition-transform duration-300 group-hover:scale-110">
                    <Plus size={22} strokeWidth={2.5} />
                  </span>
                  <span>
                    <span className="block text-sm font-black uppercase tracking-tight text-neutral-950 dark:text-white">New highlight</span>
                    <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.16em] text-garage-blue">Create story</span>
                  </span>
                </div>
              </button>
            )}

            {highlights.map((story) => {
              const image = getStoryImage(story);
              const storyDate = getStoryTime(story.createdAt || story.lastUpdated);

              return (
                <button
                  type="button"
                  key={story.id}
                  onClick={() => handleOpenHighlight(story.id)}
                  className="group relative aspect-square overflow-hidden rounded-2xl bg-neutral-200 shadow-sm ring-1 ring-black/[0.05] transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-500/10 dark:bg-neutral-900 dark:ring-white/[0.08]"
                  aria-label={`View highlight: ${story.label || 'Untitled highlight'}`}
                >
                  {image ? (
                    <img
                      src={image}
                      alt={story.label || 'Garage highlight'}
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
                      <time className=" block text-[11px] font-bold uppercase tracking-[0.18em] text-white">
                        {new Date(storyDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </time>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
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
