import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const getGap = (element) => {
  const styles = window.getComputedStyle(element);
  return Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
};

/**
 * A touch-friendly horizontal row that wraps back to the matching point when
 * the user reaches either end. The repeated cycles keep the source order
 * intact while making the row feel continuous in either swipe direction.
 */
export default function InfiniteSwipeRow({ children, className = '', ariaLabel }) {
  const items = React.Children.toArray(children);
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const cycleRef = useRef(null);
  const cycleSpanRef = useRef(0);
  const edgePeekRef = useRef(0);
  const frameRef = useRef(0);
  const itemCount = items.length;
  const shouldLoop = itemCount > 1;

  const measureCycle = useCallback((placeAtMiddle = false) => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const cycle = cycleRef.current;
    if (!viewport || !track || !cycle) return;

    cycleSpanRef.current = cycle.offsetWidth + getGap(track);
    edgePeekRef.current = shouldLoop
      ? Math.min(72, Math.max(18, viewport.clientWidth * 0.05))
      : 0;
    if (placeAtMiddle && shouldLoop) {
      viewport.scrollLeft = cycleSpanRef.current + edgePeekRef.current;
    }
  }, [shouldLoop]);

  useLayoutEffect(() => {
    measureCycle(true);
  }, [itemCount, measureCycle]);

  useEffect(() => {
    const cycle = cycleRef.current;
    if (!cycle || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => measureCycle(false));
    observer.observe(cycle);
    return () => observer.disconnect();
  }, [measureCycle]);

  useEffect(() => () => {
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
  }, []);

  const handleScroll = () => {
    if (!shouldLoop || frameRef.current) return;

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      const viewport = viewportRef.current;
      const cycleSpan = cycleSpanRef.current;
      if (!viewport || !cycleSpan) return;

      if (viewport.scrollLeft <= cycleSpan * 0.25) {
        viewport.scrollLeft += cycleSpan;
      } else if (viewport.scrollLeft >= cycleSpan * 1.75) {
        viewport.scrollLeft -= cycleSpan;
      }
    });
  };

  const scrollByItems = (direction) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const amount = Math.max(
      cycleSpanRef.current * 0.55,
      viewport.clientWidth * 0.75,
      240,
    );
    viewport.scrollBy({ left: direction * amount, behavior: 'smooth' });
  };

  if (items.length === 0) return null;

  const cycleCount = shouldLoop ? 3 : 1;
  return (
    <div className={`relative w-full ${className}`}>
      <button
        type="button"
        aria-label={`Previous ${ariaLabel || 'items'}`}
        onClick={() => scrollByItems(-1)}
        className="absolute left-1 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-neutral-800 shadow-lg backdrop-blur transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-neutral-900/90 dark:text-white dark:hover:bg-neutral-800 sm:left-2 sm:h-10 sm:w-10"
      >
        <ChevronLeft size={20} strokeWidth={2.5} aria-hidden="true" />
      </button>
      <div
        ref={viewportRef}
        role="region"
        aria-label={ariaLabel}
        onScroll={handleScroll}
        className="w-full overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div ref={trackRef} className="flex w-max flex-nowrap items-start gap-3">
          {Array.from({ length: cycleCount }, (_, copyIndex) => (
            <div
              key={`swipe-cycle-${copyIndex}`}
              ref={copyIndex === 1 ? cycleRef : undefined}
              aria-hidden={copyIndex !== 1 && shouldLoop ? 'true' : undefined}
              className="flex w-max shrink-0 flex-nowrap items-start gap-3"
            >
              {items.map((item, itemIndex) => React.cloneElement(item, {
                key: `swipe-item-${copyIndex}-${item.key || itemIndex}`
              }))}
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        aria-label={`Next ${ariaLabel || 'items'}`}
        onClick={() => scrollByItems(1)}
        className="absolute right-1 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-neutral-800 shadow-lg backdrop-blur transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-neutral-900/90 dark:text-white dark:hover:bg-neutral-800 sm:right-2 sm:h-10 sm:w-10"
      >
        <ChevronRight size={20} strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
  );
}
