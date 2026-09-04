import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion as Motion, useDragControls, useMotionValue } from 'framer-motion';
import {
  AlertTriangle,
  BadgeDollarSign,
  Bell,
  CheckCircle2,
  Clock3,
  Gift,
  Package,
  PackageCheck,
  ReceiptText,
  Truck,
  X,
  XCircle
} from 'lucide-react';
import {
  getNotificationActivityTime,
  getNotificationVersion,
  notificationValueToMillis
} from './notificationUtils';

const getStatusDetails = (notification) => {
  if (notification?.notificationKind === 'admin_receipt') {
    return {
      message: notification.message || 'A submitted receipt needs validation.',
      icon: ReceiptText,
      accent: 'bg-violet-500',
      iconClass: 'bg-violet-500/10 text-violet-600'
    };
  }

  if (notification?.notificationKind === 'admin_offer') {
    return {
      message: notification.message || 'A customer sent an offer for a collection item.',
      icon: BadgeDollarSign,
      accent: 'bg-emerald-500',
      iconClass: 'bg-emerald-500/10 text-emerald-600'
    };
  }

  if (notification?.notificationKind === 'admin_legacy_completion') {
    return {
      message: notification.message || 'A legacy order has been completed.',
      icon: CheckCircle2,
      accent: 'bg-emerald-500',
      iconClass: 'bg-emerald-500/10 text-emerald-600'
    };
  }

  if (notification?.notificationKind === 'offer_released') {
    return {
      message: notification.message || 'Your offer was accepted and the item was released.',
      icon: BadgeDollarSign,
      accent: 'bg-emerald-500',
      iconClass: 'bg-emerald-500/10 text-emerald-600'
    };
  }

  if (notification?.notificationKind === 'low_stock') {
    return {
      message: notification.message,
      icon: AlertTriangle,
      accent: 'bg-orange-500',
      iconClass: 'bg-orange-500/10 text-orange-600'
    };
  }

  if (notification?.notificationKind === 'bundle_ending') {
    return {
      message: notification.message,
      icon: Gift,
      accent: 'bg-emerald-500',
      iconClass: 'bg-emerald-500/10 text-emerald-600'
    };
  }

  if (notification?.notificationKind === 'back_in_stock') {
    return {
      message: notification.message,
      icon: PackageCheck,
      accent: 'bg-blue-500',
      iconClass: 'bg-blue-500/10 text-blue-600'
    };
  }

  if (notification?.notificationKind === 'offer_missed') {
    return {
      message: notification.message || 'Your accepted offer checkout window has expired.',
      icon: Clock3,
      accent: 'bg-orange-500',
      iconClass: 'bg-orange-500/10 text-orange-600'
    };
  }

  const status = notification?.status;
  const normalized = String(status || '').trim().toLowerCase();

  if (normalized === 'cancelled') {
    return {
      message: 'This order was cancelled.',
      icon: XCircle,
      accent: 'bg-red-500',
      iconClass: 'bg-red-500/10 text-red-500'
    };
  }

  if (normalized === 'completed') {
    return {
      message: 'This order has been completed.',
      icon: CheckCircle2,
      accent: 'bg-emerald-500',
      iconClass: 'bg-emerald-500/10 text-emerald-600'
    };
  }

  if (['shipped', 'dispatched', 'in transit'].includes(normalized)) {
    return {
      message: normalized === 'in transit' ? 'Your order is in transit.' : `Your order has been ${normalized}.`,
      icon: Truck,
      accent: 'bg-violet-500',
      iconClass: 'bg-violet-500/10 text-violet-600'
    };
  }

  if (['ready for pickup', 'ready for meetup', 'to ship', 'arrived'].includes(normalized)) {
    const messages = {
      'ready for pickup': 'Your order is ready for pickup.',
      'ready for meetup': 'Your order is ready for meetup.',
      'to ship': 'Your order is ready to be shipped.',
      arrived: 'Your order items have arrived.'
    };
    return {
      message: messages[normalized],
      icon: Package,
      accent: 'bg-blue-500',
      iconClass: 'bg-blue-500/10 text-blue-600'
    };
  }

  if (['reserved', 'validating', 'waiting', 'preparing'].includes(normalized)) {
    const messages = {
      reserved: 'Your order has been reserved.',
      validating: 'Your payment receipt is being validated.',
      waiting: 'Your order is waiting for the next update.',
      preparing: 'Your order is being prepared.'
    };
    return {
      message: messages[normalized],
      icon: Clock3,
      accent: 'bg-amber-500',
      iconClass: 'bg-amber-500/10 text-amber-600'
    };
  }

  return {
    message: status ? `Your order status is now ${status}.` : 'Your order has been updated.',
    icon: Package,
    accent: 'bg-blue-500',
    iconClass: 'bg-blue-500/10 text-blue-600'
  };
};

const formatActivityTime = (value) => {
  const milliseconds = notificationValueToMillis(value);
  if (!milliseconds) return '';

  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(milliseconds));
};

const getOrderSummary = (order) => {
  if (['back_in_stock', 'low_stock', 'offer_missed'].includes(order?.notificationKind)) return '';
  if (['offer_released', 'bundle_ending'].includes(order?.notificationKind)) return '';
  if (String(order?.status || '').trim().toLowerCase() === 'cancelled') return '';
  if (order?.notificationKind) return order.summary || '';

  const items = Array.isArray(order?.items) && order.items.length > 0
    ? order.items
    : (order?.item || order?.name || order?.summary ? [order] : []);
  const firstItem = items[0]?.name
    || items[0]?.kitName
    || items[0]?.projectData?.name
    || items[0]?.productName
    || order?.item
    || order?.name
    || order?.summary
    || '';
  if (!firstItem) return '';

  const totalUnits = items.reduce((total, item) => {
    const quantity = Number(item?.quantity);
    return total + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
  }, 0);

  return totalUnits > 1 ? `${firstItem} +${totalUnits - 1} more` : firstItem;
};

export default function NotificationModal({
  isOpen,
  onClose,
  isDarkMode,
  orders = [],
  readVersions = {},
  onOpenOrder,
  onDismissNotification,
  allowSwipeDismiss = false,
  emptyLabel = 'No order updates yet',
  isFullscreen = false,
  dimBackdrop = isFullscreen,
  navbarHeight = '60px',
  bottomInset = '0.75rem',
  anchorTop = null
}) {
  const panelRef = useRef(null);
  const notificationListRef = useRef(null);
  const dragControls = useDragControls();
  const swipingNotificationRef = useRef(null);
  const contentGestureRef = useRef(null);
  const panelDragY = useMotionValue(0);
  const [isContentDragging, setIsContentDragging] = useState(false);
  const [isNotificationListAtEnd, setIsNotificationListAtEnd] = useState(false);
  const swipeDismissOffset = allowSwipeDismiss ? 40 : 90;
  const shouldSlideUpOnExit = isFullscreen || allowSwipeDismiss;
  const notifications = useMemo(() => {
    const uniqueOrders = new Map();
    orders.forEach((order) => {
      if (order?.id) uniqueOrders.set(order.id, order);
    });
    return [...uniqueOrders.values()].sort((a, b) => getNotificationActivityTime(b) - getNotificationActivityTime(a));
  }, [orders]);

  const updateNotificationListPosition = useCallback(() => {
    const list = notificationListRef.current;
    if (!list) return;

    setIsNotificationListAtEnd(
      list.scrollTop + list.clientHeight >= list.scrollHeight - 4
    );
  }, []);

  useEffect(() => {
    if (!isOpen || !isFullscreen) {
      setIsNotificationListAtEnd(false);
      return undefined;
    }

    const list = notificationListRef.current;
    if (!list) return undefined;

    updateNotificationListPosition();
    list.addEventListener('scroll', updateNotificationListPosition, { passive: true });
    const frame = window.requestAnimationFrame(updateNotificationListPosition);

    return () => {
      list.removeEventListener('scroll', updateNotificationListPosition);
      window.cancelAnimationFrame(frame);
    };
  }, [isFullscreen, isOpen, notifications.length, updateNotificationListPosition]);

  useEffect(() => {
    if (isOpen) {
      panelDragY.set(0);
      setIsContentDragging(false);
    }
  }, [isOpen, panelDragY]);

  useEffect(() => {
    if (!isOpen || isFullscreen) return undefined;
    if (typeof window !== 'undefined' && window.innerWidth < 1024) return undefined;

    const handleOutsideScroll = (event) => {
      if (panelRef.current?.contains(event.target)) return;
      onClose?.();
    };
    const handlePageScroll = () => onClose?.();

    document.addEventListener('wheel', handleOutsideScroll, { capture: true, passive: true });
    document.addEventListener('touchmove', handleOutsideScroll, { capture: true, passive: true });
    window.addEventListener('scroll', handlePageScroll, { passive: true });

    return () => {
      document.removeEventListener('wheel', handleOutsideScroll, { capture: true });
      document.removeEventListener('touchmove', handleOutsideScroll, { capture: true });
      window.removeEventListener('scroll', handlePageScroll);
    };
  }, [isOpen, isFullscreen, onClose]);

  useEffect(() => {
    if (!isOpen || !isFullscreen) return undefined;

    window.dispatchEvent(new Event('notificationFullscreenOpen'));
    return () => {
      window.dispatchEvent(new Event('notificationFullscreenClose'));
    };
  }, [isOpen, isFullscreen, onClose]);

  const hasMeasuredAnchor = Number.isFinite(anchorTop);
  const panelStyle = isFullscreen
    ? {
        top: navbarHeight,
        left: 0,
        right: 0,
        bottom: bottomInset
      }
    : {
        top: hasMeasuredAnchor ? `${anchorTop + 8}px` : `calc(${navbarHeight} + 8px)`,
        right: '2.5rem'
      };
  const listStyle = !isFullscreen && hasMeasuredAnchor
    ? { maxHeight: `min(68vh, 560px, calc(100dvh - ${anchorTop + 24}px))` }
    : undefined;

  const startPanelDrag = (event) => {
    event.stopPropagation();
    dragControls.start(event);
  };

  const handleNotificationListPointerDown = (event) => {
    // Keep controls interactive until the user has reached the final
    // notification. At the bottom, the whole sheet can be dragged upward.
    if (!isNotificationListAtEnd) return;
    if (event.target.closest('button, a, input, textarea, select')) return;
    contentGestureRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      direction: null,
      dragged: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleNotificationListPointerMove = (event) => {
    const gesture = contentGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - gesture.startY;
    if (!gesture.direction) {
      if (Math.abs(deltaY) < 6) return;
      if (deltaY > 0) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        contentGestureRef.current = null;
        return;
      }
      gesture.direction = 'up';
    }

    if (gesture.direction === 'up') {
      event.preventDefault();
      gesture.dragged = true;
      setIsContentDragging(true);
      panelDragY.set(Math.max(-420, Math.min(0, deltaY)));
    }
  };

  const finishNotificationListGesture = (event) => {
    const gesture = contentGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - gesture.startY;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    contentGestureRef.current = null;
    if (gesture.direction === 'up') {
      if (deltaY < -90) {
        setIsContentDragging(false);
        panelDragY.set(0);
        onClose?.();
      } else {
        setIsContentDragging(false);
        panelDragY.set(0);
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
      <>
      <Motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        style={isFullscreen && dimBackdrop ? { top: navbarHeight } : undefined}
        className={`fixed z-[900] ${isFullscreen ? 'inset-x-0 bottom-0' : 'inset-0'} ${isFullscreen && dimBackdrop ? 'bg-black/30' : 'bg-transparent'}`}
        aria-hidden="true"
        onClick={onClose}
      />

      <div
        style={isFullscreen ? panelStyle : undefined}
        className={isFullscreen ? 'fixed z-[1000] overflow-hidden' : 'contents'}
      >
        <Motion.div
          ref={panelRef}
          style={isFullscreen ? (isContentDragging ? { y: panelDragY } : undefined) : panelStyle}
          initial={isFullscreen ? { y: '-100%', opacity: 0 } : { y: -18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={shouldSlideUpOnExit ? { y: '-100%', opacity: 0 } : { y: -18, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          drag={isFullscreen ? 'y' : false}
          dragListener={false}
          dragControls={dragControls}
          dragConstraints={{ top: -420, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0 }}
          dragMomentum={false}
          dragDirectionLock
          onDragEnd={(event, info) => {
            if (isFullscreen && isNotificationListAtEnd && (info.offset.y < -90 || info.velocity.y < -500)) onClose?.();
          }}
          className={`${isFullscreen ? 'absolute inset-0 w-full max-w-none sm:ml-auto sm:max-w-sm' : 'fixed z-[1000] w-[390px] max-w-[calc(100vw-5rem)]'}`}
        >
        <div className={`${isFullscreen ? 'flex h-full max-h-full flex-col rounded-b-[2.5rem]' : 'rounded-[1.5rem]'} overflow-hidden border ${isDarkMode ? 'border-white/10 bg-[#0a0a0a]' : 'border-black/10 bg-white'}`}>
          <div
            ref={notificationListRef}
            data-modal-scroll-container="notification"
            style={listStyle}
            onPointerDown={isFullscreen ? handleNotificationListPointerDown : undefined}
            onPointerMove={isFullscreen ? handleNotificationListPointerMove : undefined}
            onPointerUp={isFullscreen ? finishNotificationListGesture : undefined}
            onPointerCancel={isFullscreen ? finishNotificationListGesture : undefined}
            className={`${isFullscreen ? 'min-h-0 flex-1' : 'max-h-[min(68vh,560px)]'} overscroll-contain overflow-y-auto space-y-2 p-2 ${isFullscreen ? 'flex flex-col touch-pan-y' : ''}`}
          >
            <div className="space-y-2">
              {notifications.length === 0 ? (
                <div className="py-12 text-center text-neutral-400">
                  <Bell size={40} className="mx-auto mb-4" strokeWidth={1} />
                  <p className="text-[12px] font-black uppercase tracking-widest">{emptyLabel}</p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {notifications.map((order) => {
              const details = getStatusDetails(order);
              const StatusIcon = details.icon;
              const activityTime = order.lastUpdated || order.createdAt;
              const orderSummary = getOrderSummary(order);
              const isUnread = readVersions[order.id] !== getNotificationVersion(order);
              const isStockAlert = ['back_in_stock', 'low_stock'].includes(order.notificationKind);
              const headline = isStockAlert
                ? 'HURRY!'
                : (order.orderId || order.title || 'Notification');

              return (
                <Motion.div
                  key={order.id}
                  layout
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: '110%', opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  role="button"
                  tabIndex={0}
                  drag={allowSwipeDismiss ? 'x' : false}
                  dragSnapToOrigin={allowSwipeDismiss}
                  dragDirectionLock
                  dragConstraints={allowSwipeDismiss ? { left: 0, right: 240 } : undefined}
                  dragElastic={allowSwipeDismiss ? { left: 0, right: 0.2 } : undefined}
                  dragMomentum={false}
                  onDragStart={() => {
                    swipingNotificationRef.current = order.id;
                  }}
                  onDragEnd={(event, info) => {
                    if (allowSwipeDismiss && (info.offset.x > swipeDismissOffset || info.velocity.x > 400)) {
                      onDismissNotification?.(order);
                    }
                  }}
                  onClick={() => {
                    if (swipingNotificationRef.current === order.id) {
                      swipingNotificationRef.current = null;
                      return;
                    }
                    onOpenOrder?.(order);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onOpenOrder?.(order);
                    }
                  }}
                  className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl px-3 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isNotificationListAtEnd ? 'touch-none select-none' : ''} ${isUnread ? 'bg-blue-500/10 hover:bg-blue-500/15 dark:bg-blue-500/15 dark:hover:bg-blue-500/20' : 'hover:bg-blue-500/5'}`}
                >
                  <span className={`absolute bottom-3 left-0 top-3 w-1 rounded-full ${details.accent}`} />
                  <span className={`ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${details.iconClass}`}>
                    <StatusIcon size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[15px] font-black uppercase italic text-neutral-900 dark:text-white">
                        {headline}
                      </span>
                      <span className="shrink-0 text-[13px] font-black uppercase tracking-wider text-blue-600">
                        {order.notificationLabel || order.status || 'Updated'}
                      </span>
                    </span>
                    <span className="mt-1 block text-[14px] font-semibold leading-5 text-neutral-600 dark:text-neutral-300">
                      {details.message}
                    </span>
                    {orderSummary && (
                      <span className="mt-1 block truncate text-[13px] font-medium text-neutral-400">{orderSummary}</span>
                    )}
                    <span className="mt-1.5 block text-[13px] font-bold uppercase tracking-wider text-neutral-400">
                      {formatActivityTime(activityTime)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center justify-center self-center">
                    <button
                      type="button"
                      aria-label="Dismiss notification"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDismissNotification?.(order);
                      }}
                      className="rounded-full p-1 text-neutral-300 transition-colors hover:bg-red-500/10 hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                    >
                      <X size={16} />
                    </button>
                  </span>
                </Motion.div>
              );
                  })}
                </AnimatePresence>
              )}
            </div>
            {isFullscreen && (
              <div
                aria-label="Drag up to close notifications"
                onPointerDown={isNotificationListAtEnd ? startPanelDrag : undefined}
                className={`min-h-0 flex-1 select-none ${isNotificationListAtEnd ? 'touch-none cursor-grab active:cursor-grabbing' : ''}`}
              />
            )}
          </div>
          {isFullscreen && (
            <div
              onPointerDown={isNotificationListAtEnd ? startPanelDrag : undefined}
              className={`flex min-h-12 w-full shrink-0 items-center justify-center pb-3 pt-2 ${isNotificationListAtEnd ? 'cursor-grab touch-none active:cursor-grabbing' : ''}`}
            >
              <div
                role="button"
                tabIndex={0}
                aria-label="Drag up to close notifications"
                onPointerDown={(event) => {
                  if (!isNotificationListAtEnd) return;
                  event.stopPropagation();
                  dragControls.start(event);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onClose?.();
                  }
                }}
                className="h-1.5 w-12 cursor-grab touch-none rounded-full bg-black/10 active:cursor-grabbing dark:bg-white/10"
              />
            </div>
          )}
        </div>
        </Motion.div>
      </div>
      </>
      )}
    </AnimatePresence>
  );
}
