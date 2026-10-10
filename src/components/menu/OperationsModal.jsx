import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion as Motion, useMotionValue } from 'framer-motion';
import { Calendar, CreditCard, Truck, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import FulfillmentModal from './FulfillmentModal';
import PaymentSettingsModal from './PaymentSettingsModal';
import AdminCalendarModal from './AdminCalendarModal';

export default function OperationsModal({ isOpen, onClose, initialTab = 'shipping' }) {
  const { isDarkMode } = useTheme();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isCompactViewport, setIsCompactViewport] = useState(() => (
    typeof window === 'undefined' ? true : window.matchMedia('(max-width: 1023px)').matches
  ));
  const modalY = useMotionValue(0);
  const gestureRef = useRef(null);
  const activeScrollContainerRef = useRef(null);
  const contentRef = useRef(null);
  const touchGestureRef = useRef(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const handleViewportChange = (event) => setIsCompactViewport(event.matches);

    setIsCompactViewport(mediaQuery.matches);
    mediaQuery.addEventListener?.('change', handleViewportChange);
    return () => mediaQuery.removeEventListener?.('change', handleViewportChange);
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || !isOpen || !isCompactViewport) return undefined;

    const isInteractiveTarget = (target) => target.closest?.('button, a, input, textarea, select, [role="button"], .leaflet-container');
    const handleTouchStart = (event) => {
      const target = event.target;
      if (isInteractiveTarget(target)) return;

      const scrollContainer = target.closest?.('[data-modal-scroll-container]');
      if (!scrollContainer) return;

      activeScrollContainerRef.current = scrollContainer;
      touchGestureRef.current = {
        startY: event.touches[0].clientY,
        startScrollTop: scrollContainer.scrollTop,
        scrollContainer
      };
    };

    const handleTouchMove = (event) => {
      const gesture = touchGestureRef.current;
      if (!gesture || !event.touches[0]) return;

      const deltaY = event.touches[0].clientY - gesture.startY;
      const nextScrollTop = Math.max(0, gesture.startScrollTop - deltaY);
      gesture.scrollContainer.scrollTop = nextScrollTop;
      modalY.set(Math.min(Math.max(deltaY - gesture.startScrollTop, 0), 420));
      event.preventDefault();
    };

    const handleTouchEnd = () => {
      if (!touchGestureRef.current) return;
      const offsetY = modalY.get();
      touchGestureRef.current = null;

      if (offsetY > 80) {
        onClose();
        return;
      }

      animate(modalY, 0, { type: 'spring', damping: 28, stiffness: 420 });
    };

    content.addEventListener('touchstart', handleTouchStart, { capture: true, passive: false });
    content.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false });
    content.addEventListener('touchend', handleTouchEnd, { capture: true, passive: false });
    content.addEventListener('touchcancel', handleTouchEnd, { capture: true, passive: false });

    return () => {
      content.removeEventListener('touchstart', handleTouchStart, true);
      content.removeEventListener('touchmove', handleTouchMove, true);
      content.removeEventListener('touchend', handleTouchEnd, true);
      content.removeEventListener('touchcancel', handleTouchEnd, true);
    };
  }, [isCompactViewport, isOpen, modalY, onClose]);

  const startGesture = (event, scrollContainer = null) => {
    if (!isCompactViewport) return;

    gestureRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: scrollContainer?.scrollTop || 0,
      scrollContainer
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleGestureMove = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - gesture.startY;
    if (gesture.scrollContainer) {
      const nextScrollTop = Math.max(0, gesture.startScrollTop - deltaY);
      gesture.scrollContainer.scrollTop = nextScrollTop;
      modalY.set(Math.min(Math.max(deltaY - gesture.startScrollTop, 0), 420));
    } else {
      modalY.set(Math.min(Math.max(deltaY, 0), 420));
    }

    event.preventDefault();
  };

  const endGesture = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const offsetY = modalY.get();
    gestureRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (offsetY > 80) {
      onClose();
      return;
    }

    animate(modalY, 0, { type: 'spring', damping: 28, stiffness: 420 });
  };

  const handleContentPointerDown = (event) => {
    if (!isCompactViewport) return;
    if (event.pointerType === 'touch') return;
    if (event.target.closest('button, a, input, textarea, select, [role="button"], .leaflet-container')) return;
    const scrollContainer = event.target.closest('[data-modal-scroll-container]');
    if (!scrollContainer) return;
    activeScrollContainerRef.current = scrollContainer;
    startGesture(event, scrollContainer);
  };

  const handleTabChange = (tab) => {
    activeScrollContainerRef.current = null;
    setActiveTab(tab);
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      modalY.set(0);
      gestureRef.current = null;
      touchGestureRef.current = null;
      activeScrollContainerRef.current = null;
    } else {
      modalY.set(0);
      gestureRef.current = null;
      touchGestureRef.current = null;
    }
  }, [initialTab, isOpen, modalY]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center overflow-hidden p-0 lg:items-center lg:p-4">
          <Motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={onClose}
          />

          <Motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            className="relative h-[92vh] min-h-0 w-full lg:h-[90vh] lg:max-h-[90vh] lg:max-w-5xl"
          >
            <Motion.div
              style={{ y: modalY }}
              className={`relative flex h-full w-full flex-col overflow-hidden rounded-t-[2.5rem] text-[13px] shadow-2xl lg:rounded-[2.5rem] ${isDarkMode ? 'bg-neutral-900' : 'bg-white'}`}
            >
            <div className="flex shrink-0 justify-center pb-2 pt-4 lg:hidden">
              <div
                onPointerDown={(event) => {
                  if (isCompactViewport && (!activeScrollContainerRef.current || activeScrollContainerRef.current.scrollTop <= 0)) startGesture(event);
                }}
                onPointerMove={handleGestureMove}
                onPointerUp={endGesture}
                onPointerCancel={endGesture}
                className="h-1.5 w-12 cursor-grab touch-none rounded-full bg-black/10 active:cursor-grabbing dark:bg-white/10"
                aria-label="Drag down to close"
              />
            </div>

            <div
              onPointerDown={(event) => {
                if (!isCompactViewport || activeScrollContainerRef.current?.scrollTop > 0) return;
                startGesture(event);
              }}
              onPointerMove={handleGestureMove}
              onPointerUp={endGesture}
              onPointerCancel={endGesture}
              className={`relative z-10 flex shrink-0 touch-none items-center border-b p-2 shadow-sm active:cursor-grabbing md:p-3 ${isDarkMode ? 'border-white/5 bg-neutral-900 shadow-black/20' : 'border-black/5 bg-white shadow-black/5'}`}
            >
              <div className="flex min-w-0 flex-1 gap-1.5 md:gap-2">
              <button
                onClick={() => handleTabChange('shipping')}
                className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-xl px-1.5 py-2.5 text-[11px] font-black uppercase tracking-wider transition-all md:gap-2 md:px-3 md:py-3 md:text-[13px] md:tracking-widest ${activeTab === 'shipping' ? 'bg-garage-blue text-white shadow-lg shadow-blue-500/20' : 'opacity-50 hover:opacity-100'}`}
              >
                <Truck size={15} className="shrink-0" /> <span className="truncate">Shipping</span>
              </button>
              <button
                onClick={() => handleTabChange('payment')}
                className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-xl px-1.5 py-2.5 text-[11px] font-black uppercase tracking-wider transition-all md:gap-2 md:px-3 md:py-3 md:text-[13px] md:tracking-widest ${activeTab === 'payment' ? 'bg-garage-blue text-white shadow-lg shadow-blue-500/20' : 'opacity-50 hover:opacity-100'}`}
              >
                <CreditCard size={15} className="shrink-0" /> <span className="truncate">Payments</span>
              </button>
              <button
                onClick={() => handleTabChange('calendar')}
                className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-xl px-1.5 py-2.5 text-[11px] font-black uppercase tracking-wider transition-all md:gap-2 md:px-3 md:py-3 md:text-[13px] md:tracking-widest ${activeTab === 'calendar' ? 'bg-garage-blue text-white shadow-lg shadow-blue-500/20' : 'opacity-50 hover:opacity-100'}`}
              >
                <Calendar size={15} className="shrink-0" /> <span className="truncate">Calendar</span>
              </button>
              </div>

              <button onClick={onClose} className="hidden shrink-0 rounded-full bg-black/5 p-2.5 transition-all hover:bg-red-500/10 dark:bg-white/5 lg:flex" aria-label="Close operations">
                <X size={19} />
              </button>
            </div>

            <div
              ref={contentRef}
              onPointerDownCapture={handleContentPointerDown}
              onPointerMoveCapture={handleGestureMove}
              onPointerUpCapture={endGesture}
              onPointerCancelCapture={endGesture}
              onScrollCapture={(event) => {
                const scrollContainer = event.target.closest?.('[data-modal-scroll-container]');
                if (scrollContainer) activeScrollContainerRef.current = scrollContainer;
              }}
              style={{ touchAction: isCompactViewport ? 'none' : undefined }}
              className="min-h-0 flex-1 overflow-hidden overscroll-contain"
            >
              <FulfillmentModal
                isOpen={isOpen}
                embedded
                visible={activeTab === 'shipping'}
                onClose={() => {}}
              />
              <PaymentSettingsModal
                isOpen={isOpen}
                embedded
                visible={activeTab === 'payment'}
                onClose={() => {}}
              />
              <AdminCalendarModal
                isOpen={isOpen}
                embedded
                visible={activeTab === 'calendar'}
                onClose={() => {}}
              />
            </div>
            </Motion.div>
          </Motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
