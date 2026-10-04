import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * A touch-friendly finite horizontal row. The first item gets an inset at the
 * beginning, then the inset is removed as soon as the row moves. The track also
 * ends with an explicit spacer so the final card can reach the same visual edge
 * padding on every viewport.
 */
export default function InfiniteSwipeRow({ children, className = '', ariaLabel }) {
  const items = React.Children.toArray(children);
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const frameRef = useRef(0);
  const pointerDragRef = useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });
  const suppressClickRef = useRef(false);
  const [scrollState, setScrollState] = useState({
    canScroll: false,
    atStart: true,
    atEnd: false,
  });
  const [dimmedItems, setDimmedItems] = useState([]);

  const updateScrollState = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const nextState = {
      canScroll: maxScrollLeft > 1,
      atStart: viewport.scrollLeft <= 1,
      atEnd: viewport.scrollLeft >= maxScrollLeft - 1,
    };

    const viewportRect = viewport.getBoundingClientRect();
    const itemNodes = Array.from(track.children).filter((node) => !node.hasAttribute('data-carousel-end-spacer'));
    const buttonWidth = viewport.clientWidth >= 640 ? 40 : 36;
    const buttonInset = viewport.clientWidth >= 640 ? 8 : 4;
    const leftButtonEdge = viewportRect.left + buttonInset + buttonWidth;
    const rightButtonEdge = viewportRect.right - buttonInset - buttonWidth;
    const nextDimmedItems = itemNodes.map((node) => {
      const itemRect = node.getBoundingClientRect();
      const intersectsViewport = itemRect.right > viewportRect.left && itemRect.left < viewportRect.right;
      if (!intersectsViewport) return false;

      const cutByLeftEdge = itemRect.left < viewportRect.left;
      const cutByRightEdge = itemRect.right > viewportRect.right;
      const coveredByLeftButton = !nextState.atStart
        && itemRect.left < leftButtonEdge
        && itemRect.right > viewportRect.left + buttonInset;
      const coveredByRightButton = !nextState.atEnd
        && itemRect.right > rightButtonEdge
        && itemRect.left < viewportRect.right - buttonInset;

      return cutByLeftEdge || cutByRightEdge || coveredByLeftButton || coveredByRightButton;
    });

    setScrollState((previousState) => (
      previousState.canScroll === nextState.canScroll
      && previousState.atStart === nextState.atStart
      && previousState.atEnd === nextState.atEnd
        ? previousState
        : nextState
    ));
    setDimmedItems((previousItems) => (
      previousItems.length === nextDimmedItems.length
      && previousItems.every((isDimmed, index) => isDimmed === nextDimmedItems[index])
        ? previousItems
        : nextDimmedItems
    ));
  }, []);

  useLayoutEffect(() => {
    updateScrollState();
  }, [items.length, updateScrollState]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(viewport);
    observer.observe(track);
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

  const handlePointerDown = (event) => {
    // Touch scrolling is handled natively by `touch-pan-x touch-pan-y`.
    // Keeping the
    // custom drag path to a mouse prevents a mobile tap from being treated as
    // a drag and swallowing the card's click handler.
    if (event.pointerType !== 'mouse' || event.button !== 0) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    pointerDragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: viewport.scrollLeft,
      moved: false,
    };
  };

  const handlePointerMove = (event) => {
    const drag = pointerDragRef.current;
    const viewport = viewportRef.current;
    if (!drag.active || !viewport || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(deltaX) < 8) return;

    drag.moved = true;
    viewport.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    viewport.scrollLeft = drag.startScrollLeft - deltaX;
    handleScroll();
  };

  const finishPointerDrag = (event) => {
    const drag = pointerDragRef.current;
    const viewport = viewportRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    suppressClickRef.current = drag.moved;
    pointerDragRef.current = {
      active: false,
      pointerId: null,
      startX: 0,
      startScrollLeft: 0,
      moved: false,
    };
    if (viewport?.hasPointerCapture?.(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }

    if (suppressClickRef.current) {
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 200);
    }
  };

  const handleClickCapture = (event) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  };

  const scrollByItems = (direction) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const amount = Math.max(viewport.clientWidth * 0.75, 240);
    viewport.scrollBy({ left: direction * amount, behavior: 'smooth' });
  };

  if (items.length === 0) return null;

  return (
    <div className={`carousel-row relative w-full ${className}`}>
      {scrollState.canScroll && !scrollState.atStart && (
        <button
          type="button"
          aria-label={`Previous ${ariaLabel || 'items'}`}
          onClick={() => scrollByItems(-1)}
          className="absolute left-1 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-neutral-800 shadow-lg backdrop-blur transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-neutral-900/90 dark:text-white dark:hover:bg-neutral-800 sm:left-2 sm:h-10 sm:w-10"
        >
          <ChevronLeft size={20} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}
      <div
        ref={viewportRef}
        role="region"
        aria-label={ariaLabel}
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerDrag}
        onPointerCancel={finishPointerDrag}
        onClickCapture={handleClickCapture}
        onDragStart={(event) => event.preventDefault()}
        className={`w-full cursor-grab select-none overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x touch-pan-y [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${scrollState.atStart ? 'pl-5 sm:pl-8 lg:pl-12' : ''}`}
      >
        <div ref={trackRef} className="flex w-max flex-nowrap items-start gap-3">
          {items.map((item, itemIndex) => {
            const itemWithKey = React.cloneElement(item, {
              key: `swipe-item-${item.key || itemIndex}`,
              'data-carousel-dimmed': dimmedItems[itemIndex] ? 'true' : undefined
            });

            return itemWithKey;
          })}
          <div
            aria-hidden="true"
            data-carousel-end-spacer
            className="h-px w-5 shrink-0 -ml-3 sm:w-8 lg:w-12"
          />
        </div>
      </div>
      {scrollState.canScroll && !scrollState.atEnd && (
        <button
          type="button"
          aria-label={`Next ${ariaLabel || 'items'}`}
          onClick={() => scrollByItems(1)}
          className="absolute right-1 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-neutral-800 shadow-lg backdrop-blur transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-neutral-900/90 dark:text-white dark:hover:bg-neutral-800 sm:right-2 sm:h-10 sm:w-10"
        >
          <ChevronRight size={20} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
