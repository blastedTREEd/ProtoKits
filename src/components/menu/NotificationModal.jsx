import React, { useEffect, useMemo, useRef } from 'react';
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Package,
  Truck,
  XCircle
} from 'lucide-react';
import {
  getNotificationActivityTime,
  getNotificationVersion,
  notificationValueToMillis
} from './notificationUtils';

const getStatusDetails = (status) => {
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
  const items = Array.isArray(order.items) ? order.items : [];
  const firstItem = items[0]?.name || items[0]?.projectData?.name || order.item || '';
  if (!firstItem) return '';
  return items.length > 1 ? `${firstItem} +${items.length - 1} more` : firstItem;
};

export default function NotificationModal({
  isOpen,
  onClose,
  isDarkMode,
  orders = [],
  readVersions = {},
  onOpenOrder,
  isFullscreen = false,
  navbarHeight = '60px',
  anchorTop = null
}) {
  const panelRef = useRef(null);
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
        right: 0,
        bottom: 0,
        height: `calc(100dvh - ${navbarHeight})`
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
      <div className="fixed inset-0 z-[100]" onClick={onClose} />

      <div
        ref={panelRef}
        style={panelStyle}
        className={`fixed z-[150] animate-in fade-in slide-in-from-top-2 duration-200 ${isFullscreen ? 'w-full max-w-none sm:max-w-sm' : 'w-[390px] max-w-[calc(100vw-5rem)]'}`}
      >
        <div className={`${isFullscreen ? 'h-full rounded-none' : 'rounded-[1.5rem]'} overflow-hidden border shadow-2xl backdrop-blur-xl ${isDarkMode ? 'border-white/10 bg-neutral-900/95' : 'border-black/5 bg-white/95'}`}>
          <div
            style={listStyle}
            className={`${isFullscreen ? 'h-full max-h-full' : 'max-h-[min(68vh,560px)]'} overscroll-contain overflow-y-auto p-2`}
          >
            {notifications.length === 0 ? (
              <div className="py-12 text-center text-neutral-400">
                <Bell size={40} className="mx-auto mb-4" strokeWidth={1} />
                <p className="text-[10px] font-black uppercase tracking-widest">No order updates yet</p>
              </div>
            ) : notifications.map((order) => {
              const details = getStatusDetails(order.status);
              const StatusIcon = details.icon;
              const activityTime = order.lastUpdated || order.createdAt;
              const orderSummary = getOrderSummary(order);
              const isUnread = readVersions[order.id] !== getNotificationVersion(order);

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
                      <span className="truncate text-[12px] font-black uppercase italic text-neutral-900 dark:text-white">
                        {order.orderId || 'Order'}
                      </span>
                      <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-blue-600">
                        {order.status || 'Updated'}
                      </span>
                    </span>
                    <span className="mt-1 block text-[11px] font-semibold leading-4 text-neutral-600 dark:text-neutral-300">
                      {details.message}
                    </span>
                    {orderSummary && (
                      <span className="mt-1 block truncate text-[10px] font-medium text-neutral-400">{orderSummary}</span>
                    )}
                    <span className="mt-1.5 block text-[9px] font-bold uppercase tracking-wider text-neutral-400">
                      {formatActivityTime(activityTime)}
                    </span>
                  </span>
                  <ChevronRight size={16} className="mt-3 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-500" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
