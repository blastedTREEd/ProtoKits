import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * A touch-friendly finite horizontal row. The first item gets an inset at the
 * beginning, then the inset is removed as soon as the row moves so the cards
 * can use the full available width while still keeping real start/end bounds.
 */
export default function InfiniteSwipeRow({ children, className = '', ariaLabel }) {
  const items = React.Children.toArray(children);
  const viewportRef = useRef(null);
  const frameRef = useRef(0);
  const [scrollState, setScrollState] = useState({
    canScroll: false,
    atStart: true,
    atEnd: false,
  });

  const updateScrollState = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const nextState = {
      canScroll: maxScrollLeft > 1,
      atStart: viewport.scrollLeft <= 1,
      atEnd: viewport.scrollLeft >= maxScrollLeft - 1,
    };

    setScrollState((previousState) => (
      previousState.canScroll === nextState.canScroll
      && previousState.atStart === nextState.atStart
      && previousState.atEnd === nextState.atEnd
        ? previousState
        : nextState
    ));
  }, []);

  useLayoutEffect(() => {
    updateScrollState();
  }, [items.length, updateScrollState]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [updateScrollState]);

  useEffect(() => () => {
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
  }, []);

  const handleScroll = () => {
    if (frameRef.current) return;

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      updateScrollState();
    });
  };

  const scrollByItems = (direction) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const amount = Math.max(viewport.clientWidth * 0.75, 240);
    viewport.scrollBy({ left: direction * amount, behavior: 'smooth' });
  };

  if (items.length === 0) return null;

  return (
    <div className={`relative w-full ${className}`}>
      {scrollState.canScroll && !scrollState.atStart && (
        <button
          type="button"
          aria-label={`Previous ${ariaLabel || 'items'}`}
          onClick={() => scrollByItems(-1)}
          className="absolute left-1 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-neutral-800 shadow-lg backdrop-blur transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-neutral-900/90 dark:text-white dark:hover:bg-neutral-800 sm:left-2 sm:h-10 sm:w-10"
        >
          <ChevronLeft size={20} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}
      <div
        ref={viewportRef}
        role="region"
        aria-label={ariaLabel}
        onScroll={handleScroll}
        className={`w-full overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${scrollState.atStart ? 'pl-5 sm:pl-8 lg:pl-12' : ''}`}
      >
        <div className="flex w-max flex-nowrap items-start gap-3">
          {items.map((item, itemIndex) => React.cloneElement(item, {
            key: `swipe-item-${item.key || itemIndex}`
          }))}
        </div>
      </div>
      {scrollState.canScroll && !scrollState.atEnd && (
        <button
          type="button"
          aria-label={`Next ${ariaLabel || 'items'}`}
          onClick={() => scrollByItems(1)}
          className="absolute right-1 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-neutral-800 shadow-lg backdrop-blur transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-neutral-900/90 dark:text-white dark:hover:bg-neutral-800 sm:right-2 sm:h-10 sm:w-10"
        >
          <ChevronRight size={20} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
