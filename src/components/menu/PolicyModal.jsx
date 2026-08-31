import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion as Motion, useMotionValue } from 'framer-motion';
import { CreditCard, FileText, Loader2, Shield, Trash2, Truck, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const policyComponents = {
  privacy: {
    title: 'Privacy Policy',
    icon: Shield,
    Component: lazy(() => import('../../pages/PrivacyPolicy'))
  },
  terms: {
    title: 'Terms of Use',
    icon: FileText,
    Component: lazy(() => import('../../pages/TermsOfUse'))
  },
  deletion: {
    title: 'Delete Account',
    icon: Trash2,
    Component: lazy(() => import('../../pages/Deletion'))
  },
  shipping: {
    title: 'Shipping Policy',
    icon: Truck,
    Component: lazy(() => import('../../pages/ShippingPolicy'))
  },
  payment: {
    title: 'Payment & Refund',
    icon: CreditCard,
    Component: lazy(() => import('../../pages/PaymentAndRefundPolicy'))
  }
};

export default function PolicyModal({ policy, isOpen, onClose, zIndexClass = 'z-[220]' }) {
  const { isDarkMode } = useTheme();
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const modalY = useMotionValue(0);
  const gestureRef = useRef(null);
  const touchGestureRef = useRef(null);
  const [isCompactViewport, setIsCompactViewport] = useState(() => (
    typeof window === 'undefined' ? true : window.matchMedia('(max-width: 1023px)').matches
  ));
  const activePolicy = policyComponents[policy] || policyComponents.privacy;
  const PolicyContent = activePolicy.Component;
  const PolicyIcon = activePolicy.icon;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const handleViewportChange = (event) => setIsCompactViewport(event.matches);

    setIsCompactViewport(mediaQuery.matches);
    mediaQuery.addEventListener?.('change', handleViewportChange);
    return () => mediaQuery.removeEventListener?.('change', handleViewportChange);
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || !isOpen || !isCompactViewport) return undefined;

    const isInteractiveTarget = (target) => target.closest?.('button, a, input, textarea, select, [role="button"], .leaflet-container');
    const handleTouchStart = (event) => {
      if (isInteractiveTarget(event.target)) return;

      const scrollContainer = scrollRef.current;
      if (!scrollContainer) return;

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
    startGesture(event, scrollRef.current);
  };

  useEffect(() => {
    if (isOpen) {
      modalY.set(0);
      gestureRef.current = null;
      touchGestureRef.current = null;
    } else {
      modalY.set(0);
      gestureRef.current = null;
      touchGestureRef.current = null;
    }
  }, [isOpen, modalY]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={`fixed inset-0 ${zIndexClass} flex items-end justify-center overflow-hidden p-0 lg:items-center lg:p-4`}>
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
            style={{ y: modalY }}
            className={`relative flex h-[92vh] w-full flex-col overflow-hidden rounded-t-[2.5rem] shadow-2xl lg:h-auto lg:max-h-[90vh] lg:max-w-5xl lg:rounded-[2.5rem] ${isDarkMode ? 'bg-neutral-900' : 'bg-white'}`}
          >
            <div className="flex w-full shrink-0 justify-center pb-2 pt-4 lg:hidden">
              <div
                onPointerDown={(event) => {
                  if (isCompactViewport && (!scrollRef.current || scrollRef.current.scrollTop <= 0)) startGesture(event);
                }}
                onPointerMove={handleGestureMove}
                onPointerUp={endGesture}
                onPointerCancel={endGesture}
                className="h-1.5 w-12 cursor-grab touch-none rounded-full bg-black/10 active:cursor-grabbing dark:bg-white/10"
                aria-label="Drag down to close"
              />
            </div>

            <div
              onPointerDownCapture={(event) => {
                if (!isCompactViewport || scrollRef.current?.scrollTop > 0) return;
                startGesture(event);
              }}
              onPointerMove={handleGestureMove}
              onPointerUp={endGesture}
              onPointerCancel={endGesture}
              className={`relative z-10 flex shrink-0 cursor-grab touch-none items-center justify-between border-b p-6 shadow-sm active:cursor-grabbing md:p-8 ${isDarkMode ? 'border-white/5 bg-neutral-900 shadow-black/20' : 'border-black/5 bg-white shadow-black/5'}`}
            >
              <div className="ml-2 flex items-center gap-3">
                <div className="rounded-xl bg-garage-blue/10 p-2 text-garage-blue">
                  <PolicyIcon size={20} />
                </div>
                <h2 className="text-lg font-black italic uppercase text-garage-blue md:text-xl">{activePolicy.title}</h2>
              </div>
              <button onClick={onClose} className="mr-2 hidden rounded-full bg-black/5 p-3 transition-all hover:bg-red-500/10 lg:flex" aria-label="Close policy">
                <X size={20} />
              </button>
            </div>

            <div
              ref={(node) => {
                scrollRef.current = node;
                contentRef.current = node;
              }}
              onPointerDownCapture={handleContentPointerDown}
              onPointerMoveCapture={handleGestureMove}
              onPointerUpCapture={endGesture}
              onPointerCancelCapture={endGesture}
              style={{ touchAction: isCompactViewport ? 'none' : undefined }}
              className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar"
            >
              <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="animate-spin text-garage-blue" size={30} /></div>}>
                <PolicyContent isModal />
              </Suspense>
            </div>
          </Motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
