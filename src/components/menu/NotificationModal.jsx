import React, { useEffect, useMemo, useRef } from 'react';
import { motion as Motion, useDragControls } from 'framer-motion';
import {
  AlertTriangle,
  BadgeDollarSign,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Gift,
  Package,
  PackageCheck,
  ReceiptText,
  Truck,
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
  emptyLabel = 'No order updates yet',
  isFullscreen = false,
  dimBackdrop = isFullscreen,
  navbarHeight = '60px',
  bottomInset = '0.75rem',
  anchorTop = null
}) {
  const panelRef = useRef(null);
  const dragControls = useDragControls();
  const notifications = useMemo(() => {
    const uniqueOrders = new Map();
    orders.forEach((order) => {
      if (order?.id) uniqueOrders.set(order.id, order);
    });
    return [...uniqueOrders.values()].sort((a, b) => getNotificationActivityTime(b) - getNotificationActivityTime(a));
  }, [orders]);

  useEffect(() => {
    if (!isOpen || isFullscreen) return undefined;

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

    const scrollY = window.scrollY;
    const previousBodyStyle = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
      overscrollBehavior: document.body.style.overscrollBehavior
    };

    window.dispatchEvent(new Event('notificationFullscreenOpen'));
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    return () => {
      document.body.style.position = previousBodyStyle.position;
      document.body.style.top = previousBodyStyle.top;
      document.body.style.width = previousBodyStyle.width;
      document.body.style.overflow = previousBodyStyle.overflow;
      document.body.style.overscrollBehavior = previousBodyStyle.overscrollBehavior;
      window.scrollTo(0, scrollY);
      window.dispatchEvent(new Event('notificationFullscreenClose'));
    };
  }, [isOpen, isFullscreen]);

  if (!isOpen) return null;

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

  return (
    <>
      {isFullscreen && dimBackdrop && <div className="fixed inset-0 z-[100] bg-black/30" onClick={onClose} />}

      <div
        style={isFullscreen ? panelStyle : undefined}
        className={isFullscreen ? 'fixed z-[105] overflow-hidden' : 'contents'}
      >
        <Motion.div
          ref={panelRef}
          style={isFullscreen ? undefined : panelStyle}
          initial={isFullscreen ? { y: '-100%', opacity: 0 } : false}
          animate={isFullscreen ? { y: 0, opacity: 1 } : undefined}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          drag={isFullscreen ? 'y' : false}
          dragListener={false}
          dragControls={dragControls}
          dragConstraints={{ top: -420, bottom: 0 }}
          dragElastic={{ top: 0.2, bottom: 0 }}
          onDragEnd={(event, info) => {
            if (isFullscreen && (info.offset.y < -90 || info.velocity.y < -500)) onClose?.();
          }}
          className={`${isFullscreen ? '' : 'animate-in fade-in slide-in-from-top-2 duration-200'} ${isFullscreen ? 'absolute inset-0 w-full max-w-none sm:ml-auto sm:max-w-sm' : 'fixed z-[150] w-[390px] max-w-[calc(100vw-5rem)]'}`}
        >
        <div className={`${isFullscreen ? 'flex h-full max-h-full flex-col rounded-b-[2.5rem]' : 'rounded-[1.5rem]'} overflow-hidden border shadow-[0_24px_70px_rgba(0,0,0,0.22)] ${isDarkMode ? 'border-white/10 bg-[#0a0a0a]' : 'border-black/10 bg-white'}`}>
          <div
            style={listStyle}
            className={`${isFullscreen ? 'min-h-0 flex-1' : 'max-h-[min(68vh,560px)]'} overscroll-contain overflow-y-auto p-2`}
          >
            {notifications.length === 0 ? (
              <div className="py-12 text-center text-neutral-400">
                <Bell size={40} className="mx-auto mb-4" strokeWidth={1} />
                <p className="text-[10px] font-black uppercase tracking-widest">{emptyLabel}</p>
              </div>
            ) : notifications.map((order) => {
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
                <button
                  key={order.id}
                  type="button"
                  onClick={() => onOpenOrder?.(order)}
                  className={`group relative flex w-full items-start gap-3 overflow-hidden rounded-2xl px-3 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isUnread ? 'bg-blue-500/10 hover:bg-blue-500/15 dark:bg-blue-500/15 dark:hover:bg-blue-500/20' : 'hover:bg-blue-500/5'}`}
                >
                  <span className={`absolute bottom-3 left-0 top-3 w-1 rounded-full ${details.accent}`} />
                  <span className={`ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${details.iconClass}`}>
                    <StatusIcon size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-black uppercase italic text-neutral-900 dark:text-white">
                        {headline}
                      </span>
                      <span className="shrink-0 text-[11px] font-black uppercase tracking-wider text-blue-600">
                        {order.notificationLabel || order.status || 'Updated'}
                      </span>
                    </span>
                    <span className="mt-1 block text-[12px] font-semibold leading-4 text-neutral-600 dark:text-neutral-300">
                      {details.message}
                    </span>
                    {orderSummary && (
                      <span className="mt-1 block truncate text-[11px] font-medium text-neutral-400">{orderSummary}</span>
                    )}
                    <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                      {formatActivityTime(activityTime)}
                    </span>
                  </span>
                  <ChevronRight size={16} className="mt-3 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-500" />
                </button>
              );
            })}
          </div>
          {isFullscreen && (
            <div className="flex shrink-0 justify-center pb-3 pt-2">
              <div
                role="button"
                tabIndex={0}
                aria-label="Drag up to close notifications"
                onPointerDown={(event) => {
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
  );
}
