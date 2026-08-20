import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { useTheme } from '../context/ThemeContext';
import PageTemplate from './PageTemplate';
import { 
  ClipboardList, Plus, MapPin, Package, PackageOpen, ShieldCheck, X, CheckCircle2, 
  ChevronRight, ChevronDown, Clock, Store, Truck, Tag, Trash2, AlertCircle,
  Camera, Upload, QrCode, ArrowRight, Eye, Download, ListTodo, Flag,
  XCircle, Wallet, MapPinSearch, ClockFading, PrinterCheck
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import LoadingState from '../components/common/LoadingState';
import { getStandaloneUnitPrice } from '../utils/standalonePricing';

let DefaultIcon = L.icon({ iconUrl: markerIcon, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

// Resolves an image ID to its URL from the images array.
// Backward compatible: if the value is already a URL (base64 or http), returns it directly.
function resolveImage(idOrUrl, imagesArray) {
  if (!idOrUrl) return '';
  if (idOrUrl.startsWith('data:') || idOrUrl.startsWith('http')) return idOrUrl;
  const match = (imagesArray || []).find(img => img.id === idOrUrl);
  return match?.url || '';
}


function ChangeView({ center }) {
  const map = useMap();
  useEffect(() => { if (center && center[0] && center[1]) map.setView(center, 16); }, [center, map]);
  return null;
}

function MapRecenterButton({ center }) {
  const map = useMap();
  const recenter = (event) => {
    event.preventDefault();
    event.stopPropagation();
    map.setView(center, 17, { animate: true });
  };

  return (
    <button
      type="button"
      onClick={recenter}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      className="absolute right-3 top-3 z-[1000] flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 bg-white text-blue-600 shadow-lg transition hover:scale-105 hover:bg-blue-600 hover:text-white dark:border-white/10 dark:bg-neutral-950"
      title="Back to pin"
      aria-label="Back to pin"
    >
      <MapPinSearch size={18} />
    </button>
  );
}

function ReservationTimer({ createdAt, expiresAt, onExpire, compact = false, durationMs, variant = 'warning', children }) {
  const [timeLeft, setTimeLeft] = useState('');
  const hasExpiredRef = useRef(false);
  useEffect(() => {
    const calculateTime = () => {
      if (!createdAt && !expiresAt) return;
      const start = createdAt ? (createdAt.seconds ? createdAt.seconds * 1000 : new Date(createdAt).getTime()) : 0;
      const end = durationMs
        ? start + durationMs
        : expiresAt
        ? (typeof expiresAt === 'number' ? expiresAt : expiresAt.seconds ? expiresAt.seconds * 1000 : new Date(expiresAt).getTime())
        : (start + (60 * 60 * 1000));
      const now = new Date().getTime();
      const diff = end - now;
      if (diff <= 0) {
        setTimeLeft(compact ? '00:00' : 'EXPIRED');
        if (!hasExpiredRef.current) {
          hasExpiredRef.current = true;
          if (onExpire) onExpire();
        }
        return;
      }
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      
      if (compact) {
        const totalMins = Math.floor(diff / (1000 * 60));
        setTimeLeft(`${totalMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
      } else if (days > 0) {
        setTimeLeft(`${days}d ${hours}h`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${mins}m ${secs}s`);
      } else {
        setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
      }
    };
    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [createdAt, expiresAt, onExpire, compact, durationMs]);
  if (typeof children === 'function') {
    return children(timeLeft, variant === 'invalid');
  }
  if (compact) {
    const isInvalid = variant === 'invalid';
    return (
      <span className={`inline-flex items-center gap-1 text-[14px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider border leading-none whitespace-nowrap ${
        isInvalid
          ? 'bg-red-500/15 text-red-500 border-red-500/20'
          : 'bg-amber-500/15 text-amber-600 border-amber-500/20'
      }`}>
        {isInvalid ? <Flag size={14} className="fill-current" /> : <Clock size={14} />}
        {timeLeft}
      </span>
    );
  }
  return <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-500 rounded-full"><Clock size={12} /><span className="text-[10px] font-black tracking-widest">{timeLeft}</span></div>;
}

const CANCELLED_ORDER_DELETE_WINDOW_MS = 10 * 60 * 1000;

function DeletionTimer({ completedAt, onExpire, onDelete, children }) {
  const [timeLeft, setTimeLeft] = useState('');
  const hasExpiredRef = useRef(false);
  useEffect(() => {
    const calculateTime = () => {
      const timestampStart = completedAt?.toMillis
        ? completedAt.toMillis()
        : completedAt?.seconds
          ? completedAt.seconds * 1000
          : new Date(completedAt).getTime();
      const hasValidTimestamp = !Number.isNaN(timestampStart);
      const timestampEnd = timestampStart + CANCELLED_ORDER_DELETE_WINDOW_MS;
      if (!hasValidTimestamp) {
        setTimeLeft('—');
        return;
      }

      const end = timestampEnd;
      const now = Date.now();
      const diff = end - now;
      if (diff <= 0) {
        setTimeLeft('00:00');
        if (!hasExpiredRef.current) {
          hasExpiredRef.current = true;
          if (onExpire) onExpire();
        }
        return;
      }
      const totalSecs = Math.ceil(diff / 1000);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      setTimeLeft(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    };
    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [completedAt, onExpire]);
  
  if (typeof children === 'function') {
    return children(timeLeft);
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      className="inline-flex items-center gap-1 text-[12px] font-black px-2 py-0.5 rounded-md bg-red-500/15 text-red-500 uppercase tracking-wider border border-red-500/20 leading-none animate-pulse whitespace-nowrap"
      title="Delete order"
    >
      <Trash2 size={12} />
      {timeLeft}
    </button>
  );
}

const compressImage = (base64Str, maxWidth = 1024, maxHeight = 1024, quality = 0.7) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(base64Str);
  });
};

const getShippingFlags = (order) => {
  const method = String(order?.shippingMethod || '').toUpperCase();
  const isLbc = method.includes('LBC');
  const isLalamoveSeller = method.includes('LALAMOVE (SELLER-BOOKING)');
  const isLalamoveSelf = method.includes('LALAMOVE (SELF-BOOKING)');
  const isSpx = method.includes('SPX EXPRESS');
  const hasMeetupLocation = Boolean(order?.meetupLocation);
  const isMeetup = method.includes('MEETUP') || hasMeetupLocation;
  const isSelfPickup = method.includes('SELF-PICKUP');
  const hasPickupPoint = Boolean(order?.pickupLocation || order?.pickupDetails);
  const usesPickupPoint = hasPickupPoint && !isMeetup;
  const isPickupPointCourier = usesPickupPoint && !isSelfPickup && !isLalamoveSelf;
  return {
    isLbc,
    isLalamoveSeller,
    isLalamoveSelf,
    isSpx,
    isMeetup,
    isSelfPickup,
    usesPickupPoint,
    usesMeetupLocation: isMeetup,
    isPickupPointCourier,
    needsAdminShipping: isLbc || isLalamoveSeller || isSpx,
    needsTracking: (isLbc || isLalamoveSeller || isSpx) && !usesPickupPoint && !isMeetup
  };
};

const normalizeShippingValue = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const isOrderSelfBooking = (order, settings) => {
  if (!order) return false;
  if (order.isSelfBooking === true || getShippingFlags(order).isLalamoveSelf) return true;

  const shippingMethods = settings?.shippingMethods || {};
  const savedMethod = normalizeShippingValue(order.shippingMethod);
  if (savedMethod.includes('selfbooking')) return true;

  const storedMethodKey = order.shippingMethodKey;
  const storedSuboptionKey = order.shippingSuboptionKey;
  const storedSuboption = shippingMethods?.[storedMethodKey]?.suboptions?.[storedSuboptionKey];
  if (storedSuboption?.isSelfBooking === true) return true;

  return Object.entries(shippingMethods).some(([methodKey, methodConfig]) => {
    const normalizedMethodKey = normalizeShippingValue(methodKey);
    if (!normalizedMethodKey || !savedMethod.startsWith(normalizedMethodKey)) return false;

    return Object.entries(methodConfig?.suboptions || {}).some(([suboptionKey, suboption]) => {
      if (suboption?.isSelfBooking !== true) return false;
      const normalizedSuboptionKey = normalizeShippingValue(suboptionKey);
      const normalizedLabel = normalizeShippingValue(suboption.label || suboptionKey);
      return (normalizedSuboptionKey && savedMethod.includes(normalizedSuboptionKey))
        || (normalizedLabel && savedMethod.includes(normalizedLabel));
    });
  });
};

const hasValidatedFirstReceipt = (order) => {
  if (!order?.receipt) return false;

  const isReservationOrPartial = ['reservation', 'partial'].includes(String(order.paymentPlan || '').toLowerCase())
    || order.isReservation
    || order.isPartial;

  if (!isReservationOrPartial) return order.status !== 'Validating';

  return order.status !== 'Validating'
    || Boolean(order.balanceReceipt)
    || Number(order.buyerPaid || 0) > 0;
};

export default function Orders() {
  const { isDarkMode } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { orderId: routeOrderId } = useParams();
  const { user, isAdmin, isAdminView, kits, shelf, assignStockToOrder, cancelOrder, confirmOrderPayment, uploadReceipt, updateOrderDetails, updateOrderStatus, rates, orders, usersList, createOrder, deleteOrder, isLoading, subscribeOrders, subscribeUsersList, loadPrintResources, shippingSettings, garageInfo, cleanUpCancelledOrders, setToastMessage } = useStore();
  const isAdminMode = isAdmin && isAdminView;
  
  // Dynamically get the QR for whatever payment method the selected order uses
  const getMethodQr = (paymentMethod) => {
    if (!paymentMethod || paymentMethod === 'Cash') return null;
    const key = paymentMethod.replace(/\s+/g, '').toLowerCase() + 'Qr';
    return shippingSettings?.paymentSettings?.methods?.[key] || null;
  };
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showManualOrderModal, setShowManualOrderModal] = useState(false);
  const [activeTab, setActiveTab] = useState('to_pay');
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [balancePreviewUrl, setBalancePreviewUrl] = useState(null);
  const [activePreviewUrl, setActivePreviewUrl] = useState(null);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [isMultiSelectEnabled, setIsMultiSelectEnabled] = useState(false);
  const [expandedOrderItems, setExpandedOrderItems] = useState({});

  const closeSelectedOrder = useCallback(() => {
    setSelectedOrder(null);
    if (location.pathname.startsWith('/orders/')) {
      navigate('/orders', { replace: true });
    }
  }, [location.pathname, navigate]);
  useEffect(() => {
    setSelectedOrders([]);
    setIsMultiSelectEnabled(false);
  }, [activeTab]);

  // Periodically releases stock for cancelled orders while retaining cancelled records.
  useEffect(() => {
    if (!user) return undefined;
    
    // Cleanup on mount
    cleanUpCancelledOrders();

    // Check periodically every 5 minutes
    const interval = setInterval(() => {
      cleanUpCancelledOrders();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user, cleanUpCancelledOrders]);

  const toggleOrderSelection = (e, order) => {
    e.stopPropagation();
    if (!order?.isMaintenanceOrder) return;
    setSelectedOrders(prev => 
      prev.includes(order.id) ? prev.filter(oid => oid !== order.id) : [...prev, order.id]
    );
  };

  const toggleSelectAll = () => {
    const invalidOrderIds = visibleOrders
      .filter(order => order.isMaintenanceOrder)
      .map(order => order.id);

    if (invalidOrderIds.length > 0 && invalidOrderIds.every(id => selectedOrders.includes(id))) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(invalidOrderIds);
    }
  };

  const handleBatchDelete = async () => {
    const selectedInvalidOrders = visibleOrders.filter(order => (
      selectedOrders.includes(order.id) && order.isMaintenanceOrder
    ));
    const selectedCount = selectedInvalidOrders.length;
    if (selectedCount === 0) return;

    const confirmed = window.confirm(
      `Cancel and permanently delete ${selectedCount} invalid order${selectedCount > 1 ? 's' : ''}?\n\nStock will be released. This cannot be undone.`
    );
    if (confirmed) {
      try {
        await Promise.all(selectedInvalidOrders.map(async (order) => {
          await cancelOrder(order.id);
          await deleteOrder(order.id);
        }));
        setSelectedOrders([]);
        setIsMultiSelectEnabled(false);
        alert(`Cancelled and deleted ${selectedCount} invalid order${selectedCount > 1 ? 's' : ''}.`);
      } catch (err) {
        console.error("SG LOG: Invalid order cleanup error:", err);
        alert("Failed to cancel and delete some invalid orders.");
      }
    }
  };

  const [trackingRef, setTrackingRef] = useState('');
  const [customerTrackingLink, setCustomerTrackingLink] = useState('');
  const [claimantBalance, setClaimantBalance] = useState('');
  const [shippingFeeInput, setShippingFeeInput] = useState('');
  const getEmptyLegacyOrderData = () => ({
    search: '',
    selectedItems: [],
    shippingMethod: '',
    shippingSuboption: '',
    branch: '',
    city: '',
    province: '',
    zipCode: '',
    buyerPaid: '',
    handlingFeePaid: ''
  });
  const [manualOrderData, setManualOrderData] = useState(getEmptyLegacyOrderData);
  useEffect(() => {
    loadPrintResources();
  }, [loadPrintResources]);

  useEffect(() => {
    const unsubscribe = subscribeOrders({ uid: user?.uid, isAdminMode });
    return () => unsubscribe && unsubscribe();
  }, [subscribeOrders, user?.uid, isAdminMode]);

  useEffect(() => {
    if (!orders || orders.length === 0) return;
    const now = Date.now();
    orders.forEach(async (o) => {
      if (o.status === 'Reserved' && !o.receipt) {
        const timerStartedAt = o.cancellationTimerStartedAt;
        if (timerStartedAt) {
          const start = timerStartedAt.seconds ? timerStartedAt.seconds * 1000 : new Date(timerStartedAt).getTime();
          const end = start + (60 * 60 * 1000);
          if (now >= end) {
            console.log(`SG LOG: Silently cancelling expired order ${o.orderId} in background`);
            try {
              await cancelOrder(o.id);
              if (selectedOrder?.id === o.id) {
                closeSelectedOrder();
              }
            } catch (err) {
              console.error("SG LOG: Background auto-cancel failed:", err);
            }
          }
        }
      }
    });
  }, [closeSelectedOrder, orders, cancelOrder, selectedOrder]);

  useEffect(() => {
    if (!isAdminMode) return undefined;
    const unsubscribe = subscribeUsersList();
    return () => unsubscribe && unsubscribe();
  }, [subscribeUsersList, isAdminMode]);

  useEffect(() => {
    if (selectedOrder) {
      setTrackingRef(selectedOrder.trackingNo || '');
      setCustomerTrackingLink(selectedOrder.customerTrackingLink || selectedOrder.trackingLink || '');
      setClaimantBalance(selectedOrder.claimantBalance || '');
      setShippingFeeInput(selectedOrder.shippingFee ?? '');
    }
  }, [selectedOrder]);

  useEffect(() => {
    console.log("SG DEBUG: Orders array length:", orders.length);
    if (orders.length > 0) {
      console.log("SG DEBUG: Sample order:", orders[0]);
      console.log("SG DEBUG: User UID:", user?.uid);
      console.log("SG DEBUG: Has matching userId:", orders.some(o => o.userId === user?.uid));
    }
  }, [orders, user]);

  const sortedOrders = useMemo(() => {
    // Ang filtering ay ginagawa na sa subscribeOrders (useStore.js)
    // kaya hindi na natin kailangan i-filter dito sa UI.
    // Ipakita lang natin kung ano ang nasa 'orders' state.
    
    return [...orders].sort((a, b) => {
      const getMs = (val) => { 
        if (!val) return 0; 
        if (typeof val === 'object' && val.seconds) return val.seconds * 1000; 
        const d = new Date(val); 
        return isNaN(d.getTime()) ? 0 : d.getTime(); 
      };
      return getMs(b.createdAt) - getMs(a.createdAt);
    });
  }, [orders]);

  const getBalancePaymentDeadline = (order, settings) => {
    if (!order) return 0;
    const paymentSettings = settings?.paymentSettings || {};
    const reservationSettleDays = Number(paymentSettings.reservationSettleDays ?? 10);
    const preOrderSettleDays = Number(paymentSettings.preOrderSettleDays ?? 10);
    const projectSettleDays = Number(paymentSettings.projectSettleDays ?? 10);

    const isPreOrder = order.isPreOrder || order.items?.some(i => i.isPreOrder);
    const isProject = order.type === 'project' || order.items?.some(i => i.type === 'project');

    const paymentPlan = String(order.paymentPlan || '').toLowerCase();

    if (isProject) {
      // Project partial: countdown starts when project is done (projectCompletedAt)
      const start = order.projectCompletedAt || order.balanceRequestedAt || order.createdAt;
      const startTime = start?.seconds ? start.seconds * 1000 : new Date(start).getTime();
      return startTime + (projectSettleDays * 24 * 60 * 60 * 1000);
    }

    if (isPreOrder) {
      // Pre-order: countdown starts when item arrives (balanceRequestedAt)
      const start = order.balanceRequestedAt || order.createdAt;
      const startTime = start?.seconds ? start.seconds * 1000 : new Date(start).getTime();
      const days = paymentPlan === 'reservation' ? reservationSettleDays : preOrderSettleDays;
      return startTime + (days * 24 * 60 * 60 * 1000);
    }

    // On-hand reservation: countdown starts after downpayment validated (downpaymentConfirmedAt)
    const start = order.downpaymentConfirmedAt || order.cancellationTimerStartedAt || order.createdAt;
    const startTime = start?.seconds ? start.seconds * 1000 : new Date(start).getTime();
    return startTime + (reservationSettleDays * 24 * 60 * 60 * 1000);
  };

  const calculateBalance = useCallback((order) => {
    if (!order) return 0;
    const flags = getShippingFlags(order);
    const sFee = flags.needsAdminShipping ? (Number(order.shippingFee) || 0) : 0;
    const paid = Number(order.buyerPaid) || 0;

    if (order.totalPrice !== undefined) {
      return Math.max(0, Number(order.totalPrice) + sFee - paid);
    }

    const priceToUse = Number(order.price || 0);
    const hFee = Number(order.handlingFee) || 0;
    const tFee = Number(order.transferFee) || 0;
    const discount = Number(order.discount) || 0;
    
    return Math.max(0, priceToUse + sFee + hFee + tFee - discount - paid);
  }, []);

  const getTargetTabForOrder = useCallback((order, patch = {}) => {
    if (!order) return null;
    const nextOrder = { ...order, ...patch };
    const status = nextOrder.status;
    const method = String(nextOrder.shippingMethod || '').toUpperCase();
    const isLBC = method.includes('LBC');
    const balance = calculateBalance(nextOrder);
    const isProject = nextOrder.type === 'project' || nextOrder.items?.some(i => i.type === 'project');

    if (status === 'Cancelled') return 'cancelled';
    if (status === 'Completed') return 'completed';
    if (status === 'Waiting') return 'to_follow';
    if (['Shipped', 'Dispatched', 'In Transit'].includes(status)) return 'to_receive';
    
    // In Progress for projects with balance under preparing/ready/etc
    if (isProject && balance > 0 && ['Preparing', 'Ready for Pickup', 'Ready for Meetup', 'To Ship'].includes(status)) {
      return 'to_follow';
    }

    if (['Reserved', 'Validating'].includes(status)) return isAdminMode ? 'to_validate' : 'to_pay';
    if (status === 'Arrived' && !isLBC && balance > 0) return isAdminMode ? 'to_validate' : 'to_pay';
    // Full-payment orders with balance requested (incomplete payment) — show in validation/payment tab
    if (nextOrder.balanceRequested && balance > 0 && !nextOrder.balanceReceipt && ['Preparing'].includes(status)) return isAdminMode ? 'to_validate' : 'to_pay';

    if (['Preparing', 'Ready for Pickup', 'Ready for Meetup', 'To Ship'].includes(status)) {
      if (isLBC || balance <= 0 || (nextOrder.paymentPlan === 'partial' && !isProject)) {
        return 'to_ship';
      }
    }
    if (status === 'Arrived' && (isLBC || balance <= 0)) return 'to_ship';

    return null;
  }, [calculateBalance, isAdminMode]);

  const moveOrderToTargetTab = useCallback((order, patch = {}) => {
    const targetTab = getTargetTabForOrder(order, patch);
    if (targetTab) setActiveTab(targetTab);
  }, [getTargetTabForOrder]);

  const notificationOrderId = location.state?.openOrderId;

  useEffect(() => {
    if (routeOrderId || !notificationOrderId || orders.length === 0) return;
    const notificationOrder = orders.find((order) => order.id === notificationOrderId);
    if (!notificationOrder) return;

    moveOrderToTargetTab(notificationOrder);
    setSelectedOrder(notificationOrder);
    navigate(`/orders/${encodeURIComponent(notificationOrder.orderId || notificationOrder.id)}`, { replace: true, state: null });
  }, [location.pathname, moveOrderToTargetTab, navigate, notificationOrderId, orders, routeOrderId]);

  useEffect(() => {
    if (!routeOrderId || isLoading) return;

    if (!user) {
      navigate('/orders', { replace: true });
      return;
    }

    let requestedOrderId = routeOrderId;
    try {
      requestedOrderId = decodeURIComponent(routeOrderId);
    } catch {
      // Keep the router parameter as-is when it is not URI encoded.
    }

    const routeOrder = orders.find((order) => (
      String(order.orderId || '') === String(requestedOrderId)
      || String(order.id || '') === String(requestedOrderId)
    ));

    const canViewRouteOrder = Boolean(routeOrder && (
      isAdminMode || routeOrder.userId === user.uid
    ));

    if (!canViewRouteOrder) {
      navigate('/orders', { replace: true });
      return;
    }

    moveOrderToTargetTab(routeOrder);
    setSelectedOrder(routeOrder);
  }, [isAdminMode, isLoading, moveOrderToTargetTab, navigate, orders, routeOrderId, user]);

  const selectedOrderId = selectedOrder?.id;
  useEffect(() => {
    if (!selectedOrderId) return;
    const currentOrder = orders.find((order) => order.id === selectedOrderId);
    setSelectedOrder(currentOrder || null);
  }, [orders, selectedOrderId]);

  const collectionStockIds = useMemo(() => new Set(
    (shelf || []).map((item) => `${item.id || item.kitId}:${item.stockKey || item.selectedStockKey}`)
  ), [shelf]);

  const legacyStockChoices = useMemo(() => (kits || []).flatMap((kit) => (
    Object.entries(kit.stocks || {})
      .filter(([stockKey, stock]) => (
        stock
        && !stock.order?.orderId
        && !stock.isReserved
        && !collectionStockIds.has(`${kit.id}:${stockKey}`)
      ))
      .map(([stockKey, stock]) => ({ kit, stockKey, stock }))
  )), [kits, collectionStockIds]);

  const filteredLegacyStockChoices = useMemo(() => {
    const search = String(manualOrderData.search || '').trim().toLowerCase();
    if (!search) return legacyStockChoices.slice(0, 24);
    return legacyStockChoices.filter(({ kit, stock }) => (
      [kit.name, kit.brand, kit.specs?.line, kit.specs?.scale, stock.status, stock.eta]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search)
    )).slice(0, 24);
  }, [legacyStockChoices, manualOrderData.search]);

  const legacyShippingOptions = useMemo(() => Object.entries(shippingSettings?.shippingMethods || {})
    .filter(([, config]) => config !== false && config?.active !== false)
    .map(([key]) => key), [shippingSettings]);

  const legacyShippingConfig = useMemo(() => (
    shippingSettings?.shippingMethods?.[manualOrderData.shippingMethod] || {}
  ), [shippingSettings?.shippingMethods, manualOrderData.shippingMethod]);
  const legacySuboptions = useMemo(() => Object.entries(legacyShippingConfig.suboptions || {})
    .filter(([, config]) => config !== false && config?.active !== false), [legacyShippingConfig]);
  const legacyBranchRequired = legacyShippingConfig?.requiredFields?.includes(13)
    || legacyShippingConfig?.suboptions?.[manualOrderData.shippingSuboption]?.requiredFields?.includes(13);
  const legacyItemTotal = Math.max(0, Number(manualOrderData.buyerPaid || 0) - Number(manualOrderData.handlingFeePaid || 0));
  // Retained only while the former compact manual-order markup remains disabled below.
  const availableStocks = [];

  const handleFileSelect = (e, isBalance = false) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const compressed = await compressImage(reader.result);
        if (isBalance) {
          setBalancePreviewUrl(compressed);
        } else {
          setPreviewUrl(compressed);
        }
      } catch (err) {
        console.error("SG DEBUG: Compression failed, using original", err);
        if (isBalance) {
          setBalancePreviewUrl(reader.result);
        } else {
          setPreviewUrl(reader.result);
        }
      }
    };
    reader.readAsDataURL(file);
  };
  const handleConfirmReceipt = async (order) => {
    if (!previewUrl) return;
    setIsUploading(true);
    try {
      const patch = { receipt: previewUrl, status: 'Validating', cancellationTimerStartedAt: null };
      await uploadReceipt(order.id, previewUrl);
      alert("Uploaded!");
      moveOrderToTargetTab(order, patch);
      if (selectedOrder?.id === order.id) setSelectedOrder(prev => ({ ...prev, ...patch }));
      setPreviewUrl(null);
    } catch (e) {
      console.error(e);
      alert("Failed.");
    } finally {
      setIsUploading(false);
    }
  };
  const handleConfirmBalanceReceipt = async (order) => {
    if (!balancePreviewUrl) return;
    setIsUploading(true);
    try {
      const patch = { balanceReceipt: balancePreviewUrl, status: 'Validating' };
      await updateOrderDetails(order.id, patch);
      alert("Balance receipt uploaded!");
      moveOrderToTargetTab(order, patch);
      if (selectedOrder?.id === order.id) setSelectedOrder(prev => ({ ...prev, ...patch }));
      setBalancePreviewUrl(null);
    } catch (e) {
      console.error(e);
      alert("Failed.");
    } finally {
      setIsUploading(false);
    }
  };
  const handleSaveShippingDetails = async () => {
    if (!selectedOrder) return;
    if (selectedShippingFlags.needsTracking && !String(trackingRef || '').trim()) {
      alert("Tracking number or tracking link is required before dispatch.");
      return;
    }
    const patch = {
      trackingNo: trackingRef,
      claimantBalance: claimantBalance,
      shippingFee: Number(shippingFeeInput) || 0,
      dispatchedAt: new Date().toISOString()
    };
    await updateOrderDetails(selectedOrder.id, patch);
    await updateOrderStatus(selectedOrder.id, 'In Transit');
    alert("Saved!");
    moveOrderToTargetTab(selectedOrder, { ...patch, status: 'In Transit' });
    setSelectedOrder(prev => ({ ...prev, ...patch, status: 'In Transit' }));
  };


  const handleSaveCustomerTrackingLink = async () => {
    if (!selectedOrder) return;
    if (!customerTrackingLink.trim()) {
      alert("Please enter the courier tracking number or tracking URL.");
      return;
    }
    try {
      const trackingInfo = customerTrackingLink.trim();
      await updateOrderDetails(selectedOrder.id, { customerTrackingLink: trackingInfo });
      alert("Courier tracking information saved!");
      setSelectedOrder(prev => ({ ...prev, customerTrackingLink: trackingInfo }));
    } catch (e) {
      console.error(e);
      alert("Failed to save tracking information.");
    }
  };

  const handleUpdateComplexity = async (itemIndex, newLevel) => {
    if (!selectedOrder || newLevel < 0) return;
    const designServices = rates?.['design-services'] || {};
    const complexityPriceHike = Number(designServices.complexityPriceHike) || 0;

    const updatedItems = selectedOrder.items.map((item, idx) => {
      if (idx !== itemIndex) return item;
      const oldLevel = Number(item.designComplexity) || 0;
      const delta = (newLevel - oldLevel) * complexityPriceHike;
      return {
        ...item,
        designComplexity: newLevel,
        price: Number(item.price || 0) + delta
      };
    });

    const oldLevel = Number(selectedOrder.items[itemIndex].designComplexity) || 0;
    const delta = (newLevel - oldLevel) * complexityPriceHike;
    const newTotalPrice = Number(selectedOrder.totalPrice || selectedOrder.price || 0) + delta;
    const newPrice = Number(selectedOrder.price || 0) + delta;

    try {
      const patch = {
        items: updatedItems,
        totalPrice: newTotalPrice,
        price: newPrice
      };
      await updateOrderDetails(selectedOrder.id, patch);
      setSelectedOrder(prev => ({
        ...prev,
        ...patch
      }));
    } catch (err) {
      console.error("SG LOG: Failed to update complexity level:", err);
      alert("Failed to update complexity level. See console for logs.");
    }
  };

  const handleMarkReadyForPickup = async () => {
    if (!selectedOrder) return;
    const flags = getShippingFlags(selectedOrder);
    const nextStatus = flags.usesMeetupLocation ? 'Ready for Meetup' : 'Ready for Pickup';
    if (window.confirm(`Mark order as ${nextStatus}?`)) {
      try {
        await updateOrderStatus(selectedOrder.id, nextStatus);
        alert(`Order marked as ${nextStatus}!`);
        moveOrderToTargetTab(selectedOrder, { status: nextStatus });
        setSelectedOrder(prev => ({ ...prev, status: nextStatus }));
      } catch (e) {
        console.error(e);
        alert("Failed to update status.");
      }
    }
  };

  const handleMarkDispatched = async () => {
    if (!selectedOrder) return;
    if (window.confirm("Mark order as In Transit?")) {
      try {
        await updateOrderStatus(selectedOrder.id, 'In Transit');
        alert("Order marked as In Transit!");
        moveOrderToTargetTab(selectedOrder, { status: 'In Transit' });
        setSelectedOrder(prev => ({ ...prev, status: 'In Transit' }));
      } catch (e) {
        console.error(e);
        alert("Failed to update status.");
      }
    }
  };

  const handleMarkCompleted = async () => {
    if (!selectedOrder) return;

    // Invalid (maintenance) orders: release stock and delete the order entirely
    if (selectedOrder.isMaintenanceOrder) {
      try {
        const orderId = selectedOrder.id;
        moveOrderToTargetTab(selectedOrder, { status: 'Completed' });
        closeSelectedOrder();
        await updateOrderStatus(orderId, 'Completed');
        setToastMessage("Invalid order moved to Completed. It will be deleted in 10 minutes.");
        
        setTimeout(async () => {
          try {
            await deleteOrder(orderId);
            setToastMessage("Invalid order deleted and stock released.");
          } catch (err) {
            console.error("SG LOG: Delayed delete failed:", err);
          }
        }, CANCELLED_ORDER_DELETE_WINDOW_MS);
      } catch (e) {
        console.error(e);
        setToastMessage("Failed to complete invalid order.");
      }
      return;
    }

    const confirmMessage = isAdminMode 
      ? "Mark order as Completed?" 
      : "Confirm that you have received your order? This will complete the order status.";
    if (window.confirm(confirmMessage)) {
      try {
        await updateOrderStatus(selectedOrder.id, 'Completed');
        alert(isAdminMode ? "Order marked as Completed!" : "Order receipt confirmed!");
        moveOrderToTargetTab(selectedOrder, { status: 'Completed' });
        setSelectedOrder(prev => ({ ...prev, status: 'Completed' }));
      } catch (e) {
        console.error(e);
        alert("Failed to update status.");
      }
    }
  };

  const handleCreateManualOrder = async (e) => {
    e.preventDefault();
    const selectedItems = manualOrderData.selectedItems || [];
    const totalPaid = Number(manualOrderData.buyerPaid || 0);
    const handlingFeePaid = Number(manualOrderData.handlingFeePaid || 0);
    const itemRevenue = Math.max(0, totalPaid - handlingFeePaid);
    if (!selectedItems.length || !manualOrderData.shippingMethod || !manualOrderData.city.trim() || !manualOrderData.province.trim() || !manualOrderData.zipCode.trim() || totalPaid < handlingFeePaid) {
      alert('Add at least one stock, complete the shipping address, and make sure total paid covers the handling fee.');
      return;
    }
    if (legacyBranchRequired && !manualOrderData.branch.trim()) {
      alert('A branch is required for the selected shipping option.');
      return;
    }

    const liveItems = selectedItems.map((entry) => {
      const kit = (kits || []).find((candidate) => candidate.id === entry.kitId);
      const stock = kit?.stocks?.[entry.stockKey];
      if (!kit || !stock || stock.order?.orderId || stock.isReserved || collectionStockIds.has(`${entry.kitId}:${entry.stockKey}`)) {
        throw new Error(`${entry.name || 'A selected stock'} is no longer available.`);
      }
      return { ...entry, kit, stock, originalPrice: Number(stock.sellPrice || kit.sellPrice || 0) };
    });

    const originalTotal = liveItems.reduce((sum, item) => sum + item.originalPrice, 0);
    let remaining = itemRevenue;
    const allocatedItems = liveItems.map((entry, index) => {
      const allocatedPrice = index === liveItems.length - 1
        ? remaining
        : Math.round(originalTotal > 0 ? (itemRevenue * entry.originalPrice) / originalTotal : itemRevenue / liveItems.length);
      remaining -= allocatedPrice;
      return { ...entry, allocatedPrice };
    });

    const orderId = `#LG-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const suboption = legacyShippingConfig?.suboptions?.[manualOrderData.shippingSuboption];
    const shippingMethod = manualOrderData.shippingSuboption
      ? `${manualOrderData.shippingMethod} (${suboption?.label || manualOrderData.shippingSuboption})`
      : manualOrderData.shippingMethod;
    const createdTime = new Date().toISOString();
    const orderData = {
      orderId,
      userId: user?.uid,
      legacyOrder: true,
      isManualOrder: false,
      orderSource: 'legacy',
      items: allocatedItems.map(({ kit, stock, stockKey, originalPrice, allocatedPrice }) => ({
        id: kit.id,
        name: `${kit.brand || ''} ${kit.specs?.line || ''} ${kit.name || ''}`.trim(),
        price: allocatedPrice,
        sellPrice: allocatedPrice,
        originalSellPrice: originalPrice,
        quantity: 1,
        image: kit.image || null,
        images: kit.images || null,
        stockKey,
        status: stock.status || 'ONHAND',
        type: 'kit'
      })),
      kitId: allocatedItems[0]?.kit.id,
      productId: allocatedItems[0]?.kit.id,
      selectedStockKey: allocatedItems[0]?.stockKey,
      item: allocatedItems.map(({ kit }) => kit.name).join(', '),
      status: 'Preparing',
      isPreOrder: allocatedItems.some(({ stock }) => String(stock.status).toUpperCase() === 'PRE-ORDER'),
      shippingMethodKey: manualOrderData.shippingMethod,
      shippingSuboptionKey: manualOrderData.shippingSuboption || null,
      shippingMethod,
      receiverDetails: {
        city: manualOrderData.city.trim(),
        province: manualOrderData.province.trim(),
        zipCode: manualOrderData.zipCode.trim(),
        lbcBranch: legacyBranchRequired ? manualOrderData.branch.trim() : null
      },
      paymentPlan: 'full',
      paymentMethod: 'Legacy payment',
      totalPrice: itemRevenue,
      subtotal: itemRevenue,
      price: itemRevenue,
      buyerPaid: totalPaid,
      paymentDueNow: 0,
      handlingFee: handlingFeePaid,
      installmentFee: 0,
      transferFee: 0,
      date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      createdAt: createdTime
    };

    try {
      const docId = await createOrder(orderData);
      await Promise.all(allocatedItems.map(({ kit, stockKey }) => (
        assignStockToOrder(kit.id, stockKey, orderId, { isLegacyOrder: true, orderDocId: docId })
      )));
      setToastMessage(`Legacy order ${orderId} created.`);
      setShowManualOrderModal(false);
      setManualOrderData(getEmptyLegacyOrderData());
    } catch (error) {
      console.error('SG LOG: Legacy order creation failed:', error);
      alert(error?.message || 'Could not create the legacy order.');
    }
  };
  const handleRequestBalance = async (orderId) => {
    if (window.confirm("Request balance?")) {
      const order = orders.find(o => o.id === orderId) || selectedOrder;
      const isReservation = String(order?.paymentPlan || '').toLowerCase() === 'reservation';
      const isProject = order?.type === 'project' || order?.items?.some(i => i.type === 'project');
      const now = new Date().toISOString();
      const patch = { 
        status: isReservation ? 'Reserved' : 'Arrived', 
        balanceRequestedAt: now,
        ...(isProject && { projectCompletedAt: now })
      };
      await updateOrderDetails(orderId, patch);
      if (selectedOrder?.id === orderId) {
        moveOrderToTargetTab(selectedOrder, patch);
        setSelectedOrder(prev => ({ ...prev, ...patch }));
      }
    }
  };
  const handleConfirmPayment = async (order, skipConfirm = false) => {
    const isSecondPaymentPending = order.items?.some(item => 
      item.type === 'project' && 
      item.projectData?.method?.name?.toUpperCase() === 'STL' && 
      item.projectData?.selectedDesignService
    ) && order.designFinalized && !order.printDownpaymentPaid && (Number(order.buyerPaid) < Number(order.minDownpayment));

    let amount = 0;
    let extraFields = {};

    const isResOrPartial = order && (['reservation', 'partial'].includes(String(order.paymentPlan || '').toLowerCase()) || order.isReservation || order.isPartial);
    const isReservationPlan = String(order?.paymentPlan || '').toLowerCase() === 'reservation';
    const { total: orderTotal } = getOrderTotals(order);
    const currentPaid = Number(order.buyerPaid) || 0;
    const isFirstPayment = currentPaid === 0 || (currentPaid >= orderTotal && !order.balanceReceipt);

    if (isSecondPaymentPending) {
      amount = Math.max(0, Number(order.minDownpayment || 0) - Number(order.originalPaymentDueNow || 0));
      extraFields = { printDownpaymentPaid: true };
    } else if (isResOrPartial) {
      const dpAmount = Number(order.paymentDueNow || 0);
      
      if (isFirstPayment) {
        amount = dpAmount;
        if (isReservationPlan) {
          extraFields = { ...extraFields, downpaymentConfirmedAt: new Date().toISOString() };
        }
      } else {
        amount = calculateBalance(order);
      }
    } else {
      amount = calculateBalance(order);
    }

    if (skipConfirm || window.confirm(`Confirm payment ₱${amount.toLocaleString()}?`)) {
      if (isResOrPartial && Number(order.buyerPaid || 0) >= orderTotal && amount === Number(order.paymentDueNow || 0)) {
        // Correct the Firestore buyerPaid value back to the downpayment amount
        await updateOrderDetails(order.id, { buyerPaid: amount });
      } else {
        await confirmOrderPayment(order.id, amount);
      }
      
      if (Object.keys(extraFields).length > 0) {
        await updateOrderDetails(order.id, extraFields);
      }
      
      let newStatus;
      const isPartialPlan = String(order.paymentPlan || '').toLowerCase() === 'partial';
      const isPreOrder = order.isPreOrder || order.items?.some(i => i.isPreOrder);
      const isProjectOrder = order.type === 'project' || order.items?.some(i => i.type === 'project');
      if (isReservationPlan && isFirstPayment) {
        // Reservation plan: pre-order → Waiting (for arrival), on-hand → Reserved (countdown starts)
        newStatus = isPreOrder ? 'Waiting' : 'Reserved';
      } else if (isPartialPlan && isFirstPayment && (isPreOrder || isProjectOrder)) {
        // Partial plan pre-order/project: after downpayment → Waiting (no countdown yet)
        newStatus = 'Waiting';
      } else {
        newStatus = order.shippingMethod?.toUpperCase().includes('LBC') ? 'To Ship' : 'Preparing';
      }
      await updateOrderStatus(order.id, newStatus);
      
      const newBuyerPaid = (isResOrPartial && Number(order.buyerPaid || 0) >= orderTotal && amount === Number(order.paymentDueNow || 0))
        ? amount
        : (Number(order.buyerPaid) || 0) + amount;

      moveOrderToTargetTab(order, { status: newStatus, buyerPaid: newBuyerPaid, ...extraFields });
      if (selectedOrder?.id === order.id) {
        setSelectedOrder(prev => ({
          ...prev,
          status: newStatus,
          buyerPaid: newBuyerPaid,
          ...extraFields
        }));
      }
    }
  };
  const handleCancelOrder = async (orderId) => {
    if (window.confirm("Cancel order?")) {
      if (selectedOrder?.id === orderId) {
        moveOrderToTargetTab(selectedOrder, { status: 'Cancelled' });
      }
      await cancelOrder(orderId);
      closeSelectedOrder();
    }
  };

  // Admin: Insufficient Payment from Preview — validates receipt as partial payment and requests remaining balance
  const handleInsufficientPayment = async (order, isBalance = false) => {
    if (!window.confirm("Confirm payment as insufficient and request the remaining balance?")) return;
    try {
      const { total: orderTotal } = getOrderTotals(order);
      const isResOrPartial = ['reservation', 'partial'].includes(String(order.paymentPlan || '').toLowerCase()) || order.isReservation || order.isPartial;
      
      let amount = 0;
      if (isBalance) {
        // If it's already a balance receipt and we request balance again (incomplete balance payment),
        // we just clear the balance receipt to let them upload a new one, without adding more buyerPaid.
        amount = 0;
      } else {
        if (isResOrPartial) {
          amount = Number(order.paymentDueNow || 0);
        } else {
          // For full payment plan, assume they paid 50% of the total as a downpayment
          amount = Math.round(orderTotal / 2);
        }
      }

      if (amount > 0) {
        await confirmOrderPayment(order.id, amount);
      }
      
      // Determine appropriate status after partial payment confirmation
      const isReservationPlan = String(order.paymentPlan || '').toLowerCase() === 'reservation';
      const isPartialPlan = String(order.paymentPlan || '').toLowerCase() === 'partial';
      const isPreOrder = order.isPreOrder || order.items?.some(i => i.isPreOrder);
      const isProjectOrder = order.type === 'project' || order.items?.some(i => i.type === 'project');
      
      let newStatus;
      if (isReservationPlan) {
        newStatus = isPreOrder ? 'Waiting' : 'Reserved';
      } else if (isPartialPlan && (isPreOrder || isProjectOrder)) {
        newStatus = 'Waiting';
      } else {
        // Full payment plan — partial payment received, status becomes Preparing
        newStatus = 'Preparing';
      }

      const extraFields = {
        status: newStatus,
        balanceRequested: true,
        balanceRequestedAt: new Date().toISOString()
      };
      if (isReservationPlan && !order.downpaymentConfirmedAt) {
        extraFields.downpaymentConfirmedAt = new Date().toISOString();
      }
      // If this was a balance receipt being partially validated, clear it so they can upload the next step
      if (isBalance) {
        extraFields.balanceReceipt = null;
      }
      
      await updateOrderDetails(order.id, extraFields);
      
      const newBuyerPaid = (Number(order.buyerPaid) || 0) + amount;
      moveOrderToTargetTab(order, { ...extraFields, buyerPaid: newBuyerPaid });
      if (selectedOrder?.id === order.id) {
        setSelectedOrder(prev => ({ ...prev, ...extraFields, buyerPaid: newBuyerPaid }));
      }
      
      setIsPreviewExpanded(false);
      setActivePreviewUrl(null);
    } catch (err) {
      console.error("SG LOG: Insufficient payment handler failed:", err);
      alert("Failed to process request.");
    }
  };

  const handleSilentCancelOrder = useCallback(async (orderId) => {
    try {
      if (selectedOrder?.id === orderId) {
        moveOrderToTargetTab(selectedOrder, { status: 'Cancelled' });
      }
      await cancelOrder(orderId);
      if (selectedOrder?.id === orderId) {
        closeSelectedOrder();
      }
    } catch (err) {
      console.error("SG LOG: Silent cancel error:", err);
    }
  }, [cancelOrder, closeSelectedOrder, moveOrderToTargetTab, selectedOrder]);
  const handleDeleteOrderNow = useCallback(async (orderId) => {
    try {
      await deleteOrder(orderId);
      if (selectedOrder?.id === orderId) {
        closeSelectedOrder();
      }
    } catch (err) {
      console.error("SG LOG: Delete order error:", err);
      setToastMessage("Failed to delete order.");
    }
  }, [closeSelectedOrder, deleteOrder, selectedOrder, setToastMessage]);
  const handleDeleteOrder = async (e, orderId) => {
    e.stopPropagation();
    if (window.confirm("DELETE record?")) {
      await deleteOrder(orderId);
      if (selectedOrder?.id === orderId) closeSelectedOrder();
    }
  };

  const isReadyForPickupStatus = (status) => ['Ready for Pickup', 'Ready for Meetup'].includes(status);
  const canShowExactPickupDetails = (order, paymentVerified) => {
    if (isAdminMode) return true;
    if (!paymentVerified) return false;

    const flags = getShippingFlags(order);
    if (!flags.usesPickupPoint) return true;

    return order?.pickupDetails?.pickupAddressMode === 'actual-pin'
      && order.status === 'Ready for Pickup';
  };

  const getDisplayStatus = (order) => {
    if (!order) return '';
    const flags = getShippingFlags(order);
    
    // Check if second payment is pending
    const hasStlWithDesign = order.items?.some(item => 
      item.type === 'project' && 
      item.projectData?.method?.name?.toUpperCase() === 'STL' && 
      item.projectData?.selectedDesignService
    );
    const secondPaymentPending = hasStlWithDesign && order.designFinalized && !order.printDownpaymentPaid && (Number(order.buyerPaid) < Number(order.minDownpayment));
    if (secondPaymentPending) return 'Print Dp Required';

    if (flags.usesMeetupLocation && order.status === 'Ready for Pickup') return 'Ready for Meetup';

    if (order.status === 'Waiting') {
      const isPreOrder = order.isPreOrder || order.items?.some(item => item.isPreOrder);
      if (isPreOrder) return 'Waiting for Arrival';
    }

    const isProject = order.type === 'project' || order.items?.some(item => item.type === 'project');
    if (isProject && ['Waiting', 'Preparing'].includes(order.status) && calculateBalance(order) > 0) {
      return 'Project in Queue';
    }

    return order.status;
  };

  // Helper: returns { className, icon } for an order status badge.
  // isInvalid = maintenance order, displayStatus = resolved label, iconSize = icon px size
  const getOrderStatusUI = (order, isInvalid, displayStatus, iconSize = 13) => {
    // --- Background color logic ---
    let className;
    if (isInvalid) {
      className = 'bg-red-600 text-white border-red-600 shadow-lg shadow-red-600/20';
    } else if (displayStatus === 'Cancelled' || order.status === 'Cancelled') {
      className = 'bg-red-600 text-white border-red-600 shadow-lg shadow-red-600/20';
    } else if (displayStatus === 'Completed' || order.status === 'Completed') {
      className = 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20';
    } else {
      className = 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20';
    }

    // --- Icon logic ---
    let icon = null;
    if (isInvalid) {
      // Invalid orders always show a single Flag icon
      icon = <Flag size={iconSize} className="fill-current" />;
    } else {
      // Valid orders: status-specific icons
      if (displayStatus === 'Reserved' || displayStatus === 'Print DP Required') {
        icon = <ClockFading size={iconSize} />;
      } else if (displayStatus === 'Project in Queue') {
        icon = <PrinterCheck size={iconSize} />;
      }
      // All other valid statuses: no icon
    }

    return { className, icon };
  };

  const getBuyerAddressDetails = (order) => {
    const rd = order?.receiverDetails || {};
    const flags = getShippingFlags(order);
    const addressParts = [rd.houseNo, rd.houseDetails, rd.subdivision, rd.barangay, rd.city, rd.province, rd.zipCode].filter(Boolean);
    // Admin always sees the exact pickup point. Customers only see it after all validated payments clear the balance.
    const paymentVerified = hasValidatedFirstReceipt(order) && calculateBalance(order) <= 0;
    const showExactAddress = canShowExactPickupDetails(order, paymentVerified);
    const rawPickupAddress = showExactAddress
      ? (order?.pickupDetails?.exactAddress || order?.pickupDetails?.publicAddress || order?.pickupLocation)
      : (order?.pickupDetails?.publicAddress || order?.pickupLocation);
      
    // Alisin ang landmark sa beginning ng address string para hindi ma-double ang landmark display.
    const landmarkLabel = order?.pickupDetails?.label;
    let pickupAddress = rawPickupAddress;
    if (landmarkLabel && pickupAddress && pickupAddress.startsWith(landmarkLabel)) {
      pickupAddress = pickupAddress.substring(landmarkLabel.length).replace(/^[\s,]+/, '');
    }

    const location = flags.isLbc && rd.lbcBranch
      ? rd.lbcBranch
      : flags.isMeetup
        ? (showExactAddress ? (order?.pickupDetails?.exactAddress || order?.meetupLocation) : order?.meetupLocation)
        : (flags.isSelfPickup || flags.usesPickupPoint)
          ? pickupAddress
          : addressParts.join(', ');

    return {
      receiverName: rd.receiverName || order?.buyerName || '',
      phoneNumber: rd.phoneNumber || '',
      email: rd.email || order?.buyerEmail || '',
      display: location || 'No details',
      landmark: rd.landmark || '',
      lat: (showExactAddress ? order?.pickupDetails?.exactLat : null) || rd.lat || order?.pickupDetails?.lat || null,
      lng: (showExactAddress ? order?.pickupDetails?.exactLng : null) || rd.lng || order?.pickupDetails?.lng || null,
      lbcBranch: rd.lbcBranch
    };
  };

  const getOrderTotals = (order) => {
    const flags = getShippingFlags(order);
    const itemTotal = Number(order?.totalPrice || order?.price || 0);
    const shippingFee = flags.needsAdminShipping ? (Number(order?.shippingFee) || 0) : 0;
    const handlingFee = Number(order?.handlingFee) || 0;
    const transferFee = Number(order?.transferFee) || 0;
    const discount = Number(order?.discount) || 0;
    const feesIncludedInTotal = Boolean(order?.feesIncludedInTotal);
    const total = Math.max(
      0,
      itemTotal + shippingFee + (feesIncludedInTotal ? 0 : handlingFee + transferFee) - (feesIncludedInTotal ? 0 : discount)
    );
    
    let paid = Number(order?.buyerPaid) || 0;
    const isResOrPartial = order && (['reservation', 'partial'].includes(String(order.paymentPlan || '').toLowerCase()) || order.isReservation || order.isPartial);
    if (isResOrPartial && paid >= total && !order.balanceReceipt && ['Reserved', 'Validating', 'Preparing', 'To Ship', 'Arrived'].includes(order.status)) {
      paid = Number(order.paymentDueNow || 0);
    }
    
    const balance = Math.max(0, total - paid);
    return { itemTotal, shippingFee, handlingFee, transferFee, discount, paid, total, balance };
  };
  
  const tabData = useMemo(() => {
    const isLBC = (o) => o.shippingMethod?.toUpperCase().includes('LBC');
    const baseTabs = (isAdminMode ? [
      { id: 'to_validate', label: 'To Validate', filter: (o) => o.status === 'Validating' || (!isLBC(o) && calculateBalance(o) > 0 && o.status === 'Arrived') || (calculateBalance(o) > 0 && o.status === 'Reserved') || (o.balanceRequested && calculateBalance(o) > 0 && !o.balanceReceipt && o.status === 'Preparing') },
      { id: 'to_follow', label: 'In Progress', filter: (o) => {
        if (o.status === 'Waiting') return true;
        // Project na may balance at nasa process/queue (Preparing/Ready/etc)
        const isProject = o.type === 'project' || o.items?.some(i => i.type === 'project');
        if (isProject && ['Preparing', 'Ready for Pickup', 'Ready for Meetup', 'To Ship'].includes(o.status)) {
          return calculateBalance(o) > 0;
        }
        return false;
      }},
      { id: 'to_ship', label: 'To Ship', filter: (o) => {
        if (['Preparing', 'Ready for Pickup', 'Ready for Meetup', 'To Ship'].includes(o.status)) {
          // Fully paid, LBC (courier collects), o partial payment plan sa kits (non-projects)
          const isProject = o.type === 'project' || o.items?.some(i => i.type === 'project');
          return isLBC(o) || calculateBalance(o) <= 0 || (o.paymentPlan === 'partial' && !isProject);
        }
        // Arrived — ipakita lang dito kung fully paid na o LBC (kung may balance pa, nasa To Validate pa)
        if (o.status === 'Arrived') return isLBC(o) || calculateBalance(o) <= 0;
        return false;
      }},
      { id: 'to_receive', label: 'To Receive', filter: (o) => o.status === 'Shipped' || o.status === 'Dispatched' || o.status === 'In Transit' },
      { id: 'completed', label: 'Completed', filter: (o) => o.status === 'Completed' },
      { id: 'cancelled', label: 'Cancelled', filter: (o) => o.status === 'Cancelled' }
    ] : [
      { id: 'to_pay', label: 'To Pay', filter: (o) => o.status === 'Reserved' || o.status === 'Validating' || (!isLBC(o) && calculateBalance(o) > 0 && o.status === 'Arrived') || (o.balanceRequested && calculateBalance(o) > 0 && !o.balanceReceipt && o.status === 'Preparing') },
      { id: 'to_follow', label: 'In Progress', filter: (o) => {
        if (o.status === 'Waiting') return true;
        const isProject = o.type === 'project' || o.items?.some(i => i.type === 'project');
        if (isProject && ['Preparing', 'Ready for Pickup', 'Ready for Meetup', 'To Ship'].includes(o.status)) {
          return calculateBalance(o) > 0;
        }
        return false;
      }},
      { id: 'to_ship', label: 'To Ship', filter: (o) => {
        if (['Preparing', 'Ready for Pickup', 'Ready for Meetup', 'To Ship'].includes(o.status)) {
          const isProject = o.type === 'project' || o.items?.some(i => i.type === 'project');
          return isLBC(o) || calculateBalance(o) <= 0 || (o.paymentPlan === 'partial' && !isProject);
        }
        if (o.status === 'Arrived') return isLBC(o) || calculateBalance(o) <= 0;
        return false;
      }},
      { id: 'to_receive', label: 'To Receive', filter: (o) => o.status === 'Shipped' || o.status === 'Dispatched' || o.status === 'In Transit' },
      { id: 'completed', label: 'Completed', filter: (o) => o.status === 'Completed' },
      { id: 'cancelled', label: 'Cancelled', filter: (o) => o.status === 'Cancelled' }
    ]);
    return baseTabs.map(t => ({ ...t, orders: sortedOrders.filter(t.filter) }));
  }, [sortedOrders, isAdminMode, calculateBalance]);

  useEffect(() => { 
    if (!isLoading && tabData.length > 0 && !tabData.find(t => t.id === activeTab)) {
      setActiveTab(tabData[0].id);
    }
  }, [tabData, activeTab, isLoading]);

  const activeTabData = tabData.find((tab) => tab.id === activeTab) || tabData[0];
  const visibleOrders = activeTabData?.orders || [];
  const visibleInvalidOrders = visibleOrders.filter(order => order.isMaintenanceOrder);
  const orderRows = (() => {
    const validOrders = [];
    const invalidOrders = [];

    visibleOrders.forEach((order) => {
      (order.isMaintenanceOrder ? invalidOrders : validOrders).push(order);
    });

    return [
      ...(validOrders.length > 0 ? [{ type: 'separator', key: 'valid', label: 'Valid Orders' }] : []),
      ...validOrders.map((order) => ({ type: 'order', key: order.id, order })),
      ...(invalidOrders.length > 0 ? [{ type: 'separator', key: 'invalid', label: 'Invalid Orders' }] : []),
      ...invalidOrders.map((order) => ({ type: 'order', key: order.id, order }))
    ];
  })();
  const selectedShippingFlags = selectedOrder ? getShippingFlags(selectedOrder) : {};
  const selectedIsSelfBooking = isOrderSelfBooking(selectedOrder, shippingSettings);
  const selectedPaymentFullyValidated = Boolean(
    selectedOrder && hasValidatedFirstReceipt(selectedOrder) && calculateBalance(selectedOrder) <= 0
  );
  const selectedLogistics = selectedOrder ? getBuyerAddressDetails(selectedOrder) : {};
  const selectedTotals = selectedOrder ? getOrderTotals(selectedOrder) : {};
  const hasStlWithDesignService = selectedOrder?.items?.some(item => 
    item.type === 'project' && 
    item.projectData?.method?.name?.toUpperCase() === 'STL' && 
    item.projectData?.selectedDesignService
  );
  const canCustomerCancel = Boolean(selectedOrder && !isAdminMode && !selectedOrder.receipt && selectedOrder.status !== 'Cancelled');
  const canAdminCancel = Boolean(selectedOrder && isAdminMode && selectedOrder.status !== 'Cancelled');
  const isSelectedResOrPartial = selectedOrder && (['reservation', 'partial'].includes(String(selectedOrder.paymentPlan || '').toLowerCase()) || selectedOrder.isReservation || selectedOrder.isPartial);
  const showPaymentQr = Boolean(selectedOrder && selectedTotals.balance > 0 && (isSelectedResOrPartial ? true : (!isAdminMode && !selectedOrder.receipt)));
  // isMaintenanceOrder is stored on the order itself — stays true even after maintenance is lifted
  const isOrderFromMaintenance = Boolean(selectedOrder?.isMaintenanceOrder);
  const brandLogoUrl = garageInfo?.logoURL || "https://graph.facebook.com/SnorlaxGarage/picture?type=large";
  const selectedMethodQr = getMethodQr(selectedOrder?.paymentMethod);
  const qrImageSrc = isOrderFromMaintenance ? brandLogoUrl : selectedMethodQr;
  const showQrContainer = showPaymentQr && (selectedOrder?.paymentMethod !== 'Cash' || isOrderFromMaintenance) && qrImageSrc;

  const renderOrderDetailView = () => {
    if (!selectedOrder) return null;
    
    const detailItems = Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0
      ? selectedOrder.items
      : [{
          ...selectedOrder,
          name: selectedOrder.item || selectedOrder.name || 'Unknown Item',
          price: selectedOrder.price || 0,
          quantity: selectedOrder.quantity || 1,
          image: selectedOrder.image || '',
          images: selectedOrder.images || null,
          appliedInstallmentFee: selectedOrder.appliedInstallmentFee || 0
        }];

    const detailPaymentVerified = selectedPaymentFullyValidated;
    const detailShowExact = canShowExactPickupDetails(selectedOrder, detailPaymentVerified);
    const isPickupMap = selectedShippingFlags.isMeetup || selectedShippingFlags.isSelfPickup || selectedShippingFlags.usesPickupPoint;
    const pickupMapLat = detailShowExact
      ? (selectedOrder.pickupDetails?.exactLat || selectedOrder.pickupDetails?.lat)
      : selectedOrder.pickupDetails?.lat;
    const pickupMapLng = detailShowExact
      ? (selectedOrder.pickupDetails?.exactLng || selectedOrder.pickupDetails?.lng)
      : selectedOrder.pickupDetails?.lng;
    const mapLat = (isPickupMap ? pickupMapLat : null) || selectedLogistics.lat;
    const mapLng = (isPickupMap ? pickupMapLng : null) || selectedLogistics.lng;
    const itemsSubtotal = detailItems.reduce((acc, item) => {
      const sellPrice = Number(item.sellPrice || item.price || 0);
      const installmentFee = Number(item.appliedInstallmentFee || 0);
      const bundleFeeShare = Number(item.bundleFeeShare || 0);
      const qty = Number(item.quantity || 1);
      const distributedOrderFees = item.hasDistributedOrderFees
        ? Number(item.distributedHandlingFee || 0) + Number(item.distributedTransferFee || 0)
        : bundleFeeShare * qty;
      return acc + ((sellPrice + installmentFee) * qty) + distributedOrderFees;
    }, 0) || selectedTotals.itemTotal || Number(selectedOrder.totalPrice || selectedOrder.price || 0);
    const isBalanceApplicable = ['reservation', 'partial', 'pre-order'].includes(selectedOrder.paymentPlan) || selectedOrder.isPreOrder || selectedTotals.balance > 0;
    const isFirstReceiptValidated = hasValidatedFirstReceipt(selectedOrder);
    const showTrackingSection = isFirstReceiptValidated && ((
      selectedIsSelfBooking && !['Completed', 'Cancelled'].includes(selectedOrder.status)
    ) || activeTab === 'to_ship' || ['Preparing', 'Ready for Pickup', 'Ready for Meetup', 'Arrived', 'To Ship'].includes(selectedOrder.status));
    const isReservationOrPartial = ['reservation', 'partial'].includes(String(selectedOrder.paymentPlan || '').toLowerCase()) || selectedOrder.isReservation || selectedOrder.isPartial;
    const isBalValidated = selectedOrder.balanceReceipt && selectedOrder.status !== 'Validating';

    const isOrderInvalid = Boolean(selectedOrder.isMaintenanceOrder);
    const isReservedTimerActive = selectedOrder.status === 'Reserved' && !selectedOrder.receipt && Boolean(selectedOrder.cancellationTimerStartedAt || isOrderInvalid);
    const selPaymentPlan = String(selectedOrder.paymentPlan || '').toLowerCase();
    const isReservationBalanceTimerActive = (
      (selectedOrder.status === 'Reserved' && selPaymentPlan === 'reservation') ||
      (selectedOrder.status === 'Arrived' && selPaymentPlan === 'partial' && selectedOrder.balanceRequestedAt)
    ) && calculateBalance(selectedOrder) > 0 && !selectedOrder.balanceReceipt;

    return (
      <div className="w-full min-h-screen text-neutral-900 dark:text-white bg-white dark:bg-[#0a0a0a]">
        
        {/* Sticky Header / First Row */}
        <div className="sticky top-[56px] sm:top-[60px] bg-white/95 dark:bg-[#0a0a0a]/95 backdrop-blur-md z-[80] border-b border-black/5 dark:border-white/5 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl md:text-2xl font-black uppercase italic tracking-tight text-blue-600 dark:text-blue-500">
                {selectedOrder.orderId}
              </h2>
          </div>
          <div className="flex items-center gap-4">
            {(() => {
              const detailDisplayStatus = getDisplayStatus(selectedOrder);
              const detailUI = getOrderStatusUI(selectedOrder, isOrderInvalid, detailDisplayStatus, 13);
              if (isReservedTimerActive) return (
                <ReservationTimer
                  createdAt={selectedOrder.cancellationTimerStartedAt || selectedOrder.createdAt}
                  durationMs={60 * 60 * 1000}
                  onExpire={() => handleSilentCancelOrder(selectedOrder.id)}
                >
                  {(timeLeft) => (
                    <div className={`px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest leading-none border flex items-center gap-1.5 whitespace-nowrap ${detailUI.className}`}>
                      {detailUI.icon}
                      <span>{detailDisplayStatus}</span>
                      {timeLeft && <span className="opacity-90">({timeLeft})</span>}
                    </div>
                  )}
                </ReservationTimer>
              );
              if (isReservationBalanceTimerActive) return (
                <ReservationTimer
                  expiresAt={getBalancePaymentDeadline(selectedOrder, shippingSettings)}
                  onExpire={() => handleSilentCancelOrder(selectedOrder.id)}
                >
                  {(timeLeft) => (
                    <div className={`px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest leading-none border flex items-center gap-1.5 whitespace-nowrap ${detailUI.className}`}>
                      {detailUI.icon}
                      <span>{detailDisplayStatus}</span>
                      {timeLeft && <span className="opacity-90">({timeLeft})</span>}
                    </div>
                  )}
                </ReservationTimer>
              );
              if (selectedOrder.isMaintenanceOrder && ['Completed', 'Cancelled'].includes(selectedOrder.status)) return (
                <DeletionTimer
                  completedAt={selectedOrder.completedAt || selectedOrder.cancelledAt || selectedOrder.lastUpdated || selectedOrder.createdAt}
                  onExpire={() => handleDeleteOrderNow(selectedOrder.id)}
                >
                  {(timeLeft) => (
                    <div className={`px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest leading-none border flex items-center gap-1.5 whitespace-nowrap ${detailUI.className}`}>
                      {detailUI.icon}
                      <span>{detailDisplayStatus}</span>
                      {timeLeft && <span className="opacity-90">({timeLeft})</span>}
                    </div>
                  )}
                </DeletionTimer>
              );
              return (
                <div className={`px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest leading-none border flex items-center gap-1.5 ${detailUI.className}`}>
                  {detailUI.icon}
                  <span>{detailDisplayStatus}</span>
                </div>
              );
            })()}
            <button 
              onClick={closeSelectedOrder}
              className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full opacity-60 hover:opacity-100 transition-all active:scale-95 text-neutral-500 dark:text-neutral-400"
            >
              <X size={24} />
            </button>
          </div>
        </div>
      </div>

        {/* Content Body Container */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-8 space-y-8 pb-24">
          {/* Shipping Details & Map */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8 pb-8 border-b border-black/5 dark:border-white/5">
          {/* Left Column: Shipping Info */}
          <div className="space-y-4 text-left">
            <h3 className="text-[13px] font-black uppercase tracking-widest mb-2">Shipping Details</h3>
            
            {/* Receiver Name */}
            <div className="flex flex-col">
              <span className="text-[13px] font-black uppercase mb-0.5 tracking-wider">Receiver Name</span>
              <span className="text-[14px] font-black uppercase text-blue-600">
                {selectedLogistics.receiverName || 'No Receiver Name'}
              </span>
            </div>

            {/* Mobile & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <span className="text-[13px] font-black uppercase mb-0.5 tracking-wider">Mobile No.</span>
                <span className="text-[14px] font-black text-blue-600">
                  {selectedLogistics.phoneNumber || 'N/A'}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[13px] font-black uppercase mb-0.5 tracking-wider">Email Address</span>
                <span className="text-[14px] font-black text-blue-600 break-all">
                  {selectedLogistics.email || 'N/A'}
                </span>
              </div>
            </div>

            {/* Complete Address */}
            <div className="flex flex-col">
              <span className="text-[13px] font-black uppercase mb-0.5 tracking-wider">Complete Address</span>
              <span className="text-[14px] font-bold leading-relaxed text-blue-600">
                {selectedLogistics.display}
                {selectedOrder.receiverDetails?.city && (
                  <span className="block mt-0.5">
                    {selectedOrder.receiverDetails.city}, {selectedOrder.receiverDetails.province} {selectedOrder.receiverDetails.zipCode}
                  </span>
                )}
              </span>
              {!isAdminMode && (selectedShippingFlags.usesPickupPoint || selectedShippingFlags.usesMeetupLocation) && !canShowExactPickupDetails(selectedOrder, selectedPaymentFullyValidated) && (
                <span className="text-[13px] font-black uppercase text-amber-600 dark:text-amber-500 mt-1 leading-tight">
                   * Actual pin and complete address will be available once payment is validated and the order is ready for pickup.
                </span>
              )}
            </div>

            {/* Tracking / Inputs */}
            {showTrackingSection && (
              <div className="pt-2 border-t border-black/5 dark:border-white/5 flex flex-col">
                <span className="text-[13px] font-black uppercase mb-2 tracking-wider">Courier Tracking Info</span>
                {/* Admin: Tracking input when no tracking saved yet */}
                {isAdminMode && !selectedIsSelfBooking && selectedOrder.status !== 'Cancelled' && !selectedOrder.trackingNo ? (
                  <div className="space-y-3">
                    <input 
                      className="w-full p-3 rounded-xl border bg-white dark:bg-[#121212] border-black/10 dark:border-white/10 text-xs font-black uppercase"
                      value={trackingRef}
                      onChange={(e) => setTrackingRef(e.target.value.toUpperCase())}
                      placeholder={selectedShippingFlags.isLbc ? 'LBC TRACKING NO.' : 'TRACKING NO. / COURIER URL'}
                    />
                    {selectedShippingFlags.needsAdminShipping && (
                      <input 
                        type="number"
                        className="w-full p-3 rounded-xl border bg-white dark:bg-[#121212] border-black/10 dark:border-white/10 text-xs font-black"
                        value={shippingFeeInput}
                        onChange={(e) => setShippingFeeInput(e.target.value)}
                        placeholder="SHIPPING FEE"
                      />
                    )}
                    {selectedShippingFlags.isLbc && (
                      <input 
                        className="w-full p-3 rounded-xl border bg-white dark:bg-[#121212] border-black/10 dark:border-white/10 text-xs font-black"
                        value={claimantBalance}
                        onChange={(e) => setClaimantBalance(e.target.value)}
                        placeholder="CLAIMANT BALANCE"
                      />
                    )}
                    <button 
                      onClick={handleSaveShippingDetails}
                      className="w-full py-3 bg-blue-600 text-white rounded-xl text-[12px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 active:scale-95 transition-all"
                    >
                      Save Tracking & Mark In Transit
                    </button>
                  </div>

                ) : !isAdminMode && selectedIsSelfBooking && !['Completed', 'Cancelled'].includes(selectedOrder.status) ? (
                  selectedOrder.status !== 'Ready for Pickup' ? (
                    <div>
                      <p className="text-[13px] font-black uppercase leading-tight text-amber-600 dark:text-amber-500">
                        * Please arrange your booking once the order is ready for pickup.
                      </p>
                    </div>
                  ) : (
                  /* Customer: tracking input for courier self-booking once ready */
                  <div className="space-y-3">
                    {selectedOrder.customerTrackingLink && (
                      /^https?:\/\//i.test(selectedOrder.customerTrackingLink) ? (
                        <a 
                          href={selectedOrder.customerTrackingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block break-all text-[14px] font-black text-blue-600 hover:underline"
                        >
                          {selectedOrder.customerTrackingLink}
                        </a>
                      ) : (
                        <p className="break-all text-[14px] font-black uppercase text-blue-600 dark:text-blue-500">
                          {selectedOrder.customerTrackingLink}
                        </p>
                      )
                    )}
                    <input 
                      type="text"
                      className="w-full p-3 rounded-xl border bg-white dark:bg-[#121212] border-black/10 dark:border-white/10 text-xs font-semibold"
                      placeholder="TRACKING NO. / COURIER URL"
                      value={customerTrackingLink}
                      onChange={(e) => setCustomerTrackingLink(e.target.value)}
                    />
                    <button 
                      onClick={handleSaveCustomerTrackingLink}
                      className="w-full py-3 bg-blue-600 text-white rounded-xl text-[12px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 active:scale-95 transition-all"
                    >
                      {selectedOrder.customerTrackingLink ? 'Update Tracking Info' : 'Save Tracking Info'}
                    </button>
                  </div>
                  )

                ) : (
                  /* Read-only: Display tracking info */
                  <div className="space-y-1">
                    {selectedOrder.trackingNo ? (
                      /^https?:\/\//i.test(selectedOrder.trackingNo) ? (
                        <a 
                          href={selectedOrder.trackingNo}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[14px] font-black text-blue-600 hover:underline break-all block"
                        >
                          {selectedOrder.trackingNo}
                        </a>
                      ) : (
                        <p className="text-[14px] font-black uppercase text-blue-600 dark:text-blue-500">
                          {selectedOrder.trackingNo}
                        </p>
                      )
                    ) : selectedOrder.customerTrackingLink ? (
                      /^https?:\/\//i.test(selectedOrder.customerTrackingLink) ? (
                        <a 
                          href={selectedOrder.customerTrackingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block break-all text-[14px] font-black text-blue-600 hover:underline"
                        >
                          {selectedOrder.customerTrackingLink}
                        </a>
                      ) : (
                        <p className="break-all text-[14px] font-black uppercase text-blue-600 dark:text-blue-500">
                          {selectedOrder.customerTrackingLink}
                        </p>
                      )
                    ) : (
                      <p className="text-[14px] font-black uppercase text-blue-600 dark:text-blue-500">
                        {selectedOrder.status === 'Cancelled' ? 'N/A' : 'Pending'}
                      </p>
                    )}
                    {selectedShippingFlags.needsAdminShipping && (
                      <p className="text-[14px] font-bold">
                        Shipping Fee: {selectedTotals.shippingFee === 0 ? (
                          <span className="text-amber-600 dark:text-amber-500 uppercase font-black">Not Included</span>
                        ) : (
                          `₱${selectedTotals.shippingFee.toLocaleString()}`
                        )}
                      </p>
                    )}
                    {selectedOrder.claimantBalance && <p className="text-[14px] font-bold">Claimant Balance: ₱{Number(selectedOrder.claimantBalance || 0).toLocaleString()}</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Map */}
          <div className="flex flex-col h-full justify-between">
            <h3 className="text-[13px] font-black uppercase tracking-widest mb-2 text-left">Location Map</h3>
            {mapLat && mapLng ? (
              <div className="overflow-hidden rounded-3xl border border-black/5 dark:border-white/5 h-[280px] w-full relative z-10">
                <MapContainer 
                  center={[mapLat, mapLng]} 
                  zoom={17} 
                  scrollWheelZoom={false} 
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker position={[mapLat, mapLng]} />
                  <ChangeView center={[mapLat, mapLng]} />
                  <MapRecenterButton center={[mapLat, mapLng]} />
                </MapContainer>
              </div>
            ) : (
              <div className="h-[280px] rounded-3xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 flex flex-col items-center justify-center text-center p-4">
                <MapPin size={36} className="text-blue-600 opacity-40 mb-2" />
                <span className="text-xs font-black uppercase opacity-55">No coordinates for map</span>
                <span className="text-[10px] opacity-40 mt-1">Delivery address will be used manually.</span>
              </div>
            )}
          </div>
        </div>

        {/* Second Section: Items Breakdown */}
        <div className="mb-8 pb-8 border-b border-black/5 dark:border-white/5">
          <h3 className="text-[13px] font-black uppercase tracking-widest mb-4 text-left">Items Breakdown</h3>
          <div className="space-y-4">
            {detailItems.map((item, idx) => {
              const kit = kits.find(k => k.id === item.id || k.id === item.productId || k.name === item.name);
              const displayImage = item.type === 'project'
                ? (item.projectData?.image || item.image)
                : resolveImage(item.image || kit?.image, item.images || kit?.images);

              const displayGrade = item.grade || item.specs?.line || kit?.specs?.line || 'LINE';
              const displayBrand = item.brand || kit?.brand || '';
              
              const rawName = (item.name || item.item || '').replace(/\s*\(Pre-Order\)\s*$/i, '');
              let cleanName = rawName;
              if (displayBrand && displayBrand.trim()) {
                const brandRegex = new RegExp(`^${displayBrand.trim()}\\s+`, 'i');
                cleanName = cleanName.replace(brandRegex, '');
              }
              if (displayGrade && displayGrade.trim() && displayGrade !== 'LINE') {
                const gradeRegex = new RegExp(`^${displayGrade.trim()}\\s+`, 'i');
                cleanName = cleanName.replace(gradeRegex, '');
              }
              cleanName = cleanName.trim() || rawName;

              const sellPrice = Number(item.sellPrice || item.price || 0);
              const installmentFee = Number(item.appliedInstallmentFee || 0);
              const bundleFeeShare = Number(item.bundleFeeShare || 0);
              const qty = Number(item.quantity || 1);
              const distributedOrderFees = item.hasDistributedOrderFees
                ? Number(item.distributedHandlingFee || 0) + Number(item.distributedTransferFee || 0)
                : bundleFeeShare * qty;
              const displayInstallmentFee = item.isBundleItem && String(selectedOrder.paymentPlan || '').toLowerCase() === 'full'
                ? 0
                : installmentFee;
              const unitPrice = sellPrice + displayInstallmentFee;
              const linePrice = (unitPrice * qty) + distributedOrderFees;
              const standaloneUnitPrice = getStandaloneUnitPrice(item, kit, installmentFee);
              const isDiscounted = standaloneUnitPrice > unitPrice;

              return (
                <div key={idx} className="flex flex-col gap-4 p-4 bg-black/[0.01] dark:bg-white/[0.01] rounded-3xl border border-black/5 dark:border-white/5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      {displayImage ? (
                        <img 
                          src={displayImage} 
                          alt="" 
                          loading="lazy"
                          className="w-20 h-20 md:portrait:w-48 md:landscape:w-64 md:h-24 lg:w-64 xl:w-64 aspect-square md:aspect-auto object-cover object-[center_25%] rounded-xl border border-neutral-100 dark:border-neutral-800 shrink-0" 
                          onError={(e) => {
                            e.target.style.display = 'none';
                            if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div 
                        className="w-20 h-20 md:portrait:w-48 md:landscape:w-64 md:h-24 lg:w-64 xl:w-64 aspect-square md:aspect-auto object-cover object-[center_25%] rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center shrink-0"
                        style={{ display: displayImage ? 'none' : 'flex' }}
                      >
                        <Package size={28} className="opacity-20" />
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="text-sm font-black uppercase leading-tight truncate text-neutral-900 dark:text-white">
                          {cleanName}
                        </p>
                        <p className="text-xs font-bold text-neutral-900 dark:text-white mt-1 uppercase">
                          {displayGrade} {displayBrand ? `/ ${displayBrand}` : ''}
                        </p>
                        <p className="text-xs font-black uppercase text-blue-600 dark:text-blue-500 mt-0.5">
                          x{item.quantity || 1}
                        </p>
                        {item.isBundleItem && (
                          <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                            Bundle Deal
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`block text-sm font-black ${isDiscounted ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-900 dark:text-white'}`}>
                        ₱{linePrice.toLocaleString()}
                      </span>
                      {isDiscounted && (
                        <span className="block text-xs font-black text-neutral-500 line-through dark:text-neutral-400">
                          ₱{(standaloneUnitPrice * qty).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 3D Design Service & Complexity Controls */}
                  {item.projectData?.selectedDesignService && (() => {
                    const designServices = rates?.['design-services'] || {};
                    const serviceId = item.projectData.selectedDesignService;
                    const serviceName = serviceId.split('-').map(w => w.toUpperCase()).join(' ');
                    const complexityPriceHike = Number(designServices.complexityPriceHike) || 0;
                    const currentLevel = item.designComplexity || 0;
                    return (
                      <div className="p-3 bg-purple-500/5 dark:bg-purple-500/10 rounded-2xl border border-purple-500/20 text-left space-y-2 mt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">Design Service</span>
                          <span className="text-xs font-black uppercase text-purple-700 dark:text-purple-300">{serviceName}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Complexity Level</span>
                          {isAdminMode ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleUpdateComplexity(idx, currentLevel - 1)}
                                disabled={currentLevel <= 0}
                                className="w-6 h-6 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center font-black text-xs hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 active:scale-95 transition-all"
                              >
                                -
                              </button>
                              <span className="text-xs font-black w-6 text-center">{currentLevel}</span>
                              <button
                                type="button"
                                onClick={() => handleUpdateComplexity(idx, currentLevel + 1)}
                                className="w-6 h-6 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center font-black text-xs hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 transition-all"
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs font-black">{currentLevel}</span>
                          )}
                        </div>
                        <div className="flex justify-between text-[9px] font-bold opacity-45">
                          <span>Complexity Hike ({currentLevel} x ₱{complexityPriceHike}):</span>
                          <span>₱{(currentLevel * complexityPriceHike).toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>

        {/* Totals & Payments side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start mb-8 pb-8">
          {/* Left Side: Payments (QR, Receipt, Balance Receipt) */}
          <div className="space-y-4 text-left order-2 lg:order-1">
            <h3 className="text-[13px] font-black uppercase tracking-widest mb-2">Payment Details</h3>
            
            {selectedOrder.paymentMethod === 'Cash' && !isOrderFromMaintenance ? (
              <div className="p-6 bg-blue-500/5 rounded-3xl border border-blue-500/10 flex flex-col items-center text-center gap-3 w-full animate-in fade-in duration-300">
                <Store className="text-blue-500 animate-pulse" size={32} />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-600">Cash Payment</h4>
                <p className="text-xs font-bold opacity-80 max-w-sm">
                  Your order is being prepared. We will notify you when it's ready.
                </p>
              </div>
            ) : (
              <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Payment QR */}
                {showQrContainer && (
                  <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10 flex flex-col items-center gap-2">
                    <h4 className="text-[12px] font-black uppercase tracking-widest text-amber-600 text-center leading-tight">
                      Payment QR
                      {selectedOrder?.paymentMethod && (
                        <span className="block mt-0.5 opacity-100 text-[12px] font-black">{selectedOrder.paymentMethod}</span>
                      )}
                    </h4>
                    <button
                      type="button"
                      className="w-20 h-20 bg-white p-2 border rounded-xl hover:opacity-80 transition-opacity flex items-center justify-center border-black/5"
                      onClick={() => {
                        setActivePreviewUrl(qrImageSrc);
                        setIsPreviewExpanded(true);
                      }}
                    >
                      <img src={qrImageSrc} className="object-contain" alt={`${selectedOrder?.paymentMethod} QR`} />
                    </button>
                    {isAdminMode ? (
                      canAdminCancel && (
                        <button 
                          onClick={() => handleCancelOrder(selectedOrder.id)}
                          className="w-full py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[12px] font-black uppercase tracking-widest text-center transition-all mt-1"
                        >
                          Cancel Order
                        </button>
                      )
                    ) : (
                      <a 
                        href={qrImageSrc} 
                        download={`${selectedOrder?.paymentMethod}-QR.png`}
                        className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[12px] font-black uppercase tracking-widest text-center transition-all flex items-center justify-center gap-1"
                      >
                        <Download size={12} /> QR Code
                      </a>
                    )}
                  </div>
                )}

                {/* Payment Receipt */}
                <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 flex flex-col items-center gap-2">
                  <h4 className="text-[12px] font-black uppercase tracking-widest text-blue-600 text-center leading-tight">
                    {isReservationOrPartial ? (
                      String(selectedOrder.paymentPlan || '').toLowerCase() === 'reservation' ? (
                        <>Reservation<br />Receipt</>
                      ) : (
                        <>Partial<br />Receipt</>
                      )
                    ) : (
                      <>Payment<br />Receipt</>
                    )}
                  </h4>
                  {selectedOrder.receipt || previewUrl ? (
                    <button
                      type="button"
                      className="w-20 h-20 rounded-xl overflow-hidden bg-white border-2 border-blue-600 relative group shrink-0"
                      onClick={() => {
                        setActivePreviewUrl(previewUrl || selectedOrder.receipt);
                        setIsPreviewExpanded(true);
                      }}
                    >
                      <img src={previewUrl || selectedOrder.receipt} className="w-full h-full object-cover" alt="Receipt" />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Eye size={14} className="text-white" />
                      </div>
                    </button>
                  ) : (
                    <div className="w-20 h-20 border-2 border-dashed border-blue-600/30 rounded-xl flex flex-col items-center justify-center gap-1 opacity-50 shrink-0">
                      <Upload size={14} />
                      <span className="text-[8px] font-black uppercase text-center leading-tight">No Receipt</span>
                    </div>
                  )}

                  {isFirstReceiptValidated && (
                    <div className="w-full py-1.5 bg-emerald-500/10 text-emerald-600 rounded-lg text-[12px] font-black uppercase tracking-widest text-center transition-all mt-1 flex items-center justify-center gap-1">
                      <CheckCircle2 size={13} className="text-emerald-500 animate-in zoom-in duration-300" />
                      Validated
                    </div>
                  )}

                  {isAdminMode && selectedOrder.paymentMethod !== 'Cash' && selectedOrder.receipt && selectedOrder.status === 'Validating' && !(selectedOrder.balanceReceipt && Number(selectedOrder.buyerPaid || 0) > 0) && (
                    <div className="w-full py-1.5 bg-amber-500/10 text-amber-600 rounded-lg text-[11px] font-black uppercase tracking-widest text-center mt-1 flex items-center justify-center gap-1 animate-pulse">
                      <Clock size={13} className="text-amber-500" />
                      For Validation
                    </div>
                  )}

                  {!isAdminMode && selectedOrder.receipt && selectedOrder.status === 'Validating' && !(selectedOrder.balanceReceipt && Number(selectedOrder.buyerPaid || 0) > 0) && (
                    <div className="w-full py-1.5 bg-amber-500/10 text-amber-600 rounded-lg text-[11px] font-black uppercase tracking-widest text-center mt-1 flex items-center justify-center gap-1">
                      <Clock size={13} className="text-amber-500 animate-pulse" />
                      Validating
                    </div>
                  )}

                  {!isAdminMode && !selectedOrder.receipt && ['Reserved', 'Waiting', 'Arrived', 'Validating'].includes(selectedOrder.status) && (
                    <label className="w-full cursor-pointer">
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileSelect(e, false)} disabled={isUploading} />
                      <div className="w-full py-1.5 bg-blue-600/10 text-blue-600 rounded-lg text-[12px] font-black uppercase tracking-widest text-center hover:bg-blue-600/20 transition-all">
                        Upload
                      </div>
                    </label>
                  )}
                  
                  {previewUrl && !isAdminMode && (
                    <button 
                      onClick={() => handleConfirmReceipt(selectedOrder)} 
                      disabled={isUploading}
                      className="w-full py-1.5 bg-emerald-600 text-white rounded-lg text-[12px] font-black uppercase tracking-widest shadow-md active:scale-95 transition-all mt-1"
                    >
                      {isUploading ? 'Sending...' : 'Submit'}
                    </button>
                  )}
                </div>

                {/* Balance Payment Receipt */}
                {((isReservationOrPartial && Number(selectedOrder.buyerPaid || 0) > 0 && (selectedTotals.balance > 0 || selectedOrder.balanceReceipt || balancePreviewUrl)) || (selectedOrder.balanceRequested && Number(selectedOrder.buyerPaid || 0) > 0 && (selectedTotals.balance > 0 || selectedOrder.balanceReceipt || balancePreviewUrl))) && (
                  <div className="p-4 bg-purple-500/5 rounded-2xl border border-purple-500/10 flex flex-col items-center gap-2">
                    <h4 className="text-[12px] font-black uppercase tracking-widest text-purple-600 text-center leading-tight">Balance<br />Receipt</h4>
                    {selectedOrder.balanceReceipt || balancePreviewUrl ? (
                      <button
                        type="button"
                        className="w-20 h-20 rounded-xl overflow-hidden bg-white border-2 border-purple-600 relative group shrink-0"
                        onClick={() => {
                          setActivePreviewUrl(balancePreviewUrl || selectedOrder.balanceReceipt);
                          setIsPreviewExpanded(true);
                        }}
                      >
                        <img src={balancePreviewUrl || selectedOrder.balanceReceipt} className="w-full h-full object-cover" alt="Balance Receipt" />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Eye size={14} className="text-white" />
                        </div>
                      </button>
                    ) : (
                      <div className="w-20 h-20 border-2 border-dashed border-purple-600/30 rounded-xl flex flex-col items-center justify-center gap-1 opacity-50 shrink-0">
                        <Upload size={14} />
                        <span className="text-[8px] font-black uppercase text-center leading-tight">No Receipt</span>
                      </div>
                    )}

                    {isBalValidated && (
                      <div className="w-full py-1.5 bg-emerald-500/10 text-emerald-600 rounded-lg text-[12px] font-black uppercase tracking-widest text-center transition-all mt-1 flex items-center justify-center gap-1">
                        <CheckCircle2 size={13} className="text-emerald-500 animate-in zoom-in duration-300" />
                        Validated
                      </div>
                    )}

                    {isAdminMode && selectedOrder.paymentMethod !== 'Cash' && selectedOrder.balanceReceipt && selectedOrder.status === 'Validating' && Number(selectedOrder.buyerPaid || 0) > 0 && (
                      <div className="w-full py-1.5 bg-amber-500/10 text-amber-600 rounded-lg text-[11px] font-black uppercase tracking-widest text-center mt-1 flex items-center justify-center gap-1 animate-pulse">
                        <Clock size={13} className="text-amber-500" />
                        For Validation
                      </div>
                    )}

                    {!isAdminMode && selectedOrder.balanceReceipt && selectedOrder.status === 'Validating' && Number(selectedOrder.buyerPaid || 0) > 0 && (
                      <div className="w-full py-1.5 bg-amber-500/10 text-amber-600 rounded-lg text-[11px] font-black uppercase tracking-widest text-center mt-1 flex items-center justify-center gap-1">
                        <Clock size={13} className="text-amber-500 animate-pulse" />
                        Validating
                      </div>
                    )}

                    {!isAdminMode && !selectedOrder.balanceReceipt && ['Reserved', 'Waiting', 'Arrived', 'Validating', 'Preparing', 'To Ship', 'Shipped', 'Dispatched', 'In Transit', 'Ready for Pickup'].includes(selectedOrder.status) && (
                      <label className="w-full cursor-pointer">
                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileSelect(e, true)} disabled={isUploading} />
                        <div className="w-full py-1.5 bg-purple-600/10 text-purple-600 rounded-lg text-[12px] font-black uppercase tracking-widest text-center hover:bg-purple-600/20 transition-all">
                          Upload
                        </div>
                      </label>
                    )}

                    {balancePreviewUrl && !isAdminMode && (
                      <button 
                        onClick={() => handleConfirmBalanceReceipt(selectedOrder)} 
                        disabled={isUploading}
                        className="w-full py-1.5 bg-emerald-600 text-white rounded-lg text-[12px] font-black uppercase tracking-widest shadow-md active:scale-95 transition-all mt-1"
                      >
                        {isUploading ? 'Sending...' : 'Submit'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {((isAdminMode && canAdminCancel && !showQrContainer) || (!isAdminMode && canCustomerCancel)) && (
                <button 
                  onClick={() => handleCancelOrder(selectedOrder.id)}
                  className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all mt-2"
                >
                  Cancel Order
                </button>
              )}
              </>
            )}
          </div>

          {/* Right Side: Totals */}
          <div className="space-y-3 bg-black/[0.01] dark:bg-white/[0.01] p-6 rounded-3xl border border-black/5 dark:border-white/5 text-left order-1 lg:order-2">
            <h3 className="text-[13px] font-black uppercase tracking-widest mb-2">Order Totals</h3>
            
            {/* First row: Items Total */}
            <div className="flex justify-between items-center text-[14px] font-bold">
              <span>Items Total</span>
              <span>₱{itemsSubtotal.toLocaleString()}</span>
            </div>

            {/* Second row: Garage Discount */}
            <div className="flex justify-between items-center text-[14px] font-bold text-emerald-600 dark:text-emerald-500">
              <span>Garage Discount</span>
              <span>-₱{selectedTotals.discount.toLocaleString()}</span>
            </div>

            {/* Second row: Shipping Fee */}
            <div className="flex justify-between items-center text-[14px] font-bold">
              <span>Shipping Fee</span>
              <span>
                {selectedShippingFlags.needsAdminShipping && selectedTotals.shippingFee === 0 ? (
                  <span className="text-amber-600 dark:text-amber-500 uppercase font-black">Not Included</span>
                ) : (
                  `₱${selectedTotals.shippingFee.toLocaleString()}`
                )}
              </span>
            </div>

            {/* Third row: Total */}
            <div className="flex justify-between items-center text-[14px] font-black border-t border-black/5 dark:border-white/5 pt-3">
              <span className="flex items-center gap-1.5">
                Total Cost 
                {isFirstReceiptValidated && (
                  <CheckCircle2 size={12} className="text-emerald-500" />
                )}
              </span>
              <span>₱{selectedTotals.total.toLocaleString()}</span>
            </div>

            {/* Fourth row: Downpayment & Balance (reservation/partial) */}
            {isBalanceApplicable && isReservationOrPartial ? (
              <>
                {/* Downpayment amount — blue when unpaid, default when paid */}
                <div className={`flex justify-between items-center text-[14px] font-bold border-t border-black/5 dark:border-white/5 pt-3 ${!selectedOrder.receipt ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                  <span className="flex items-center gap-1.5">
                    Downpayment 
                    {isFirstReceiptValidated && (
                      <CheckCircle2 size={12} className="text-emerald-500" />
                    )}
                  </span>
                  <span>₱{Number(selectedOrder.paymentDueNow || 0).toLocaleString()}</span>
                </div>
                {/* Remaining Balance — blue when downpayment paid but balance unpaid, default otherwise */}
                <div className={`flex justify-between items-center text-[14px] font-bold ${selectedOrder.receipt && !selectedOrder.balanceReceipt ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                  <span className="flex items-center gap-1.5">
                    Remaining Balance 
                    {isBalValidated && (
                      <CheckCircle2 size={12} className="text-emerald-500" />
                    )}
                  </span>
                  <span>₱{Math.max(0, (selectedTotals.total || 0) - Number(selectedOrder.paymentDueNow || 0)).toLocaleString()}</span>
                </div>
              </>
            ) : isBalanceApplicable ? (
              <div className="flex justify-between items-center text-[14px] font-black border-t border-black/5 dark:border-white/5 pt-3 text-amber-600 dark:text-amber-500">
                <span>Balance Due</span>
                <span>₱{selectedTotals.balance.toLocaleString()}</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Action Buttons Panel */}
        <div className="flex flex-wrap gap-3 justify-end items-center mt-6 pt-6 border-t border-black/5 dark:border-white/5">
          {isAdminMode && selectedOrder.paymentMethod === 'Cash' && selectedOrder.status === 'Reserved' && (
            <button 
              onClick={() => handleConfirmPayment(selectedOrder)} 
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95 flex items-center gap-1.5"
            >
              <CheckCircle2 size={14} /> Confirm Cash Payment
            </button>
          )}


          {isAdminMode && (selectedShippingFlags.usesPickupPoint || selectedShippingFlags.usesMeetupLocation) && ['Preparing', 'To Ship'].includes(selectedOrder.status) && (
            <button 
              onClick={handleMarkReadyForPickup}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg"
            >
              {selectedShippingFlags.usesMeetupLocation ? 'Mark Ready for Meetup' : 'Mark Ready for Pickup'}
            </button>
          )}

          {isAdminMode && selectedShippingFlags.isPickupPointCourier && selectedOrder.status === 'Ready for Pickup' && (
            <button 
              onClick={handleMarkDispatched}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg"
            >
              Mark Dispatched
            </button>
          )}

          {isAdminMode && (
            ['Shipped', 'Dispatched', 'In Transit'].includes(selectedOrder.status) ||
            (isReadyForPickupStatus(selectedOrder.status) && !selectedShippingFlags.isPickupPointCourier)
          ) && (
            <button 
              onClick={handleMarkCompleted}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg"
            >
              Mark Completed
            </button>
          )}

          {isAdminMode && hasStlWithDesignService && selectedOrder.status === 'Preparing' && !selectedOrder.designFinalized && (
            <button 
              onClick={async () => {
                if (window.confirm("Mark design as finalized and request print downpayment? This will set status to 'Waiting' and request the customer for the second downpayment.")) {
                  try {
                    const patch = { designFinalized: true, receipt: null, status: 'Waiting' };
                    await updateOrderDetails(selectedOrder.id, patch);
                    moveOrderToTargetTab(selectedOrder, patch);
                    setSelectedOrder(prev => ({ ...prev, ...patch }));
                    alert("Design marked as finalized! Print downpayment requested.");
                  } catch (err) {
                    console.error("SG LOG: Failed to finalize design:", err);
                    alert("Failed to finalize design.");
                  }
                }
              }}
              className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg"
            >
              Finalize Design & Request Print Dp
            </button>
          )}

          {isAdminMode && selectedOrder.isPreOrder && selectedOrder.status === 'Reserved' && (
            <button 
              onClick={() => handleRequestBalance(selectedOrder.id)}
              className="px-5 py-2.5 bg-amber-50 hover:bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-md"
            >
              Request Balance
            </button>
          )}

          {!isAdminMode && ['Shipped', 'Dispatched', 'In Transit', 'Ready for Pickup', 'Ready for Meetup'].includes(selectedOrder.status) && (
            <button 
              onClick={handleMarkCompleted}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-emerald-600/20"
            >
              Confirm Order Received
            </button>
          )}


          {isAdminMode && selectedOrder.status === 'Cancelled' && (
            <button 
              onClick={() => { deleteOrder(selectedOrder.id); closeSelectedOrder(); }}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg"
            >
              Delete Order
            </button>
          )}
        </div>
      </div>
    </div>
  );
  };

  return (
    <PageTemplate isDarkMode={isDarkMode}>
      <div className="min-h-screen flex flex-col bg-neutral-50 dark:bg-[#0a0a0a] font-sans">
        {!selectedOrder && (
          <div className="sticky top-[56px] sm:top-[60px] z-[90] h-[60px] w-full bg-neutral-50 dark:bg-[#0a0a0a] border-b border-black/5 dark:border-white/5">
            <div className="max-w-7xl mx-auto px-4 md:px-8 h-full flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2">
                {tabData.map((tab) => (
                  <button key={tab.id} onClick={() => { setActiveTab(tab.id); closeSelectedOrder(); }} className={`whitespace-nowrap px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest border transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-transparent text-neutral-500 dark:text-neutral-300 border-black/10 dark:border-white/10 hover:border-blue-500/50'}`}>
                    {tab.label} ({tab.orders.length})
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}


        {selectedOrder ? (
          <div className="w-full flex-grow bg-white dark:bg-[#0a0a0a]">
            {renderOrderDetailView()}
          </div>
        ) : (
          <div className="flex-grow max-w-7xl mx-auto w-full p-4 md:p-8 pb-24 md:pb-8">
            {isLoading ? (
              <LoadingState message="Loading orders..." />
            ) : (
              <div className="space-y-3">
              {visibleOrders.length === 0 && (
                <div className="py-16 text-center">
                  <div className="opacity-40">
                    <ClipboardList size={56} className="mx-auto mb-4" />
                    <p className="font-black uppercase tracking-widest text-sm">Ready for your next build?</p>
                  </div>
                </div>
              )}
              {orderRows.map((row) => {
                if (row.type === 'separator') {
                  return (
                    <div
                      key={row.key}
                      className="sticky top-[116px] z-[80] -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 bg-neutral-50/90 px-4 py-3 backdrop-blur-md dark:bg-[#0a0a0a]/90 md:top-[120px] md:-mx-8 md:w-[calc(100%+4rem)] md:px-8"
                    >
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                      <span className="select-none bg-gradient-to-r from-[#0866FF] to-[#00CFFF] bg-clip-text text-[11px] font-black uppercase tracking-[0.2em] text-transparent">
                        {row.label}
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                    </div>
                  );
                }

                const o = row.order;
                const isSelected = selectedOrders.includes(o.id);
                const orderItems = Array.isArray(o.items) && o.items.length > 0 ? o.items : [o];
                const { total: orderGrandTotal } = getOrderTotals(o);
                const isCardInvalid = Boolean(o.isMaintenanceOrder);
                const isCardReservedTimerActive = o.status === 'Reserved' && !o.receipt && Boolean(o.cancellationTimerStartedAt || isCardInvalid);

                const cardDisplayStatus = getDisplayStatus(o);
                const cardUI = getOrderStatusUI(o, isCardInvalid, cardDisplayStatus, 12);
                const shippingMethodLabel = String(o.shippingMethod || '')
                  .replace(/\s*\([^)]*\)/g, '')
                  .split(':')[0]
                  .trim() || 'N/A';
                const orderStatusIndicator = o.isMaintenanceOrder && ['Completed', 'Cancelled'].includes(o.status) ? (
                  <DeletionTimer
                    completedAt={o.completedAt || o.cancelledAt || o.lastUpdated || o.createdAt}
                    onExpire={() => handleDeleteOrderNow(o.id)}
                  >
                    {(timeLeft) => (
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black uppercase leading-none tracking-widest shadow-md whitespace-nowrap ${cardUI.className}`}>
                        {cardUI.icon}
                        <span>{cardDisplayStatus}</span>
                        {timeLeft && <span className="opacity-90">({timeLeft})</span>}
                      </span>
                    )}
                  </DeletionTimer>
                ) : isCardReservedTimerActive ? (
                  <ReservationTimer
                    createdAt={o.cancellationTimerStartedAt || o.createdAt}
                    durationMs={60 * 60 * 1000}
                    onExpire={() => handleSilentCancelOrder(o.id)}
                  >
                    {(timeLeft) => (
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-widest leading-none border whitespace-nowrap ${cardUI.className}`}>
                        {cardUI.icon}
                        <span>{cardDisplayStatus}</span>
                        {timeLeft && <span className="opacity-90">({timeLeft})</span>}
                      </span>
                    )}
                  </ReservationTimer>
                ) : ((o.status === 'Reserved' && String(o.paymentPlan || '').toLowerCase() === 'reservation' && calculateBalance(o) > 0 && !o.balanceReceipt) || (o.status === 'Arrived' && String(o.paymentPlan || '').toLowerCase() === 'partial' && o.balanceRequestedAt && calculateBalance(o) > 0 && !o.balanceReceipt)) ? (
                  <ReservationTimer
                    expiresAt={getBalancePaymentDeadline(o, shippingSettings)}
                    onExpire={() => handleSilentCancelOrder(o.id)}
                  >
                    {(timeLeft) => (
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-widest leading-none border whitespace-nowrap ${cardUI.className}`}>
                        {cardUI.icon}
                        <span>{cardDisplayStatus}</span>
                        {timeLeft && <span className="opacity-90">({timeLeft})</span>}
                      </span>
                    )}
                  </ReservationTimer>
                ) : (
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-widest leading-none border whitespace-nowrap ${cardUI.className}`}>
                    {cardUI.icon}
                    <span>{cardDisplayStatus}</span>
                  </span>
                );
                const pricedItems = orderItems.map((item) => {
                  const matchedKit = kits.find(k => k.id === item.id || k.id === o.kitId || k.id === o.productId || k.name === o.item || k.name === item.name);
                  const stockSellPrice = Number(matchedKit?.stocks?.[item.stockKey]?.sellPrice || 0);
                  const itemSellPrice = Number(item.sellPrice || item.price || item.displayPrice || item.projectData?.sellPrice || 0);
                  const kitSellPrice = Number(matchedKit?.sellPrice || 0);
                  const unitPrice = Number(item.sellPrice || item.price || item.displayPrice || item.projectData?.sellPrice || 0)
                    + (item.isBundleItem && String(o.paymentPlan || '').toLowerCase() === 'full' ? 0 : Number(item.appliedInstallmentFee || 0));
                  const standaloneUnitPrice = getStandaloneUnitPrice(item, matchedKit, Number(item.appliedInstallmentFee || 0));
                  return {
                    item,
                    kit: matchedKit,
                    sellPrice: Math.max(stockSellPrice, itemSellPrice, kitSellPrice),
                    unitPrice,
                    standaloneUnitPrice,
                    isDiscounted: standaloneUnitPrice > unitPrice,
                  };
                });
                const itemRows = pricedItems.map(({ item, kit, unitPrice, standaloneUnitPrice, isDiscounted }, index) => {
                  if (item.type === 'project') {
                    const projectName = item.projectData?.name || item.name || `Project ${index + 1}`;
                    return {
                      id: item.basketId || item.id || `project-${index}`,
                      image: item.projectData?.image || item.image || '',
                      name: projectName,
                      meta: 'PROJECT',
                      quantity: Number(item.quantity) || 1,
                      unitPrice,
                      standaloneUnitPrice,
                      isDiscounted
                    };
                  }
                  const grade = item.specs?.line || kit?.specs?.line || '';
                  const stock = kit?.stocks?.[item.stockKey];
                  const status = String(item.status || stock?.status || '').toLowerCase().includes('pre') ? 'PRE-ORDER' : 'ONHAND';
                  const rawName = item.name || kit?.name || o.item || `Kit ${index + 1}`;
                  const name = grade && rawName.toLowerCase().startsWith(grade.toLowerCase())
                    ? rawName.slice(grade.length).trim() || rawName
                    : rawName;
                  return {
                    id: item.stockKey || item.basketId || item.id || `kit-${index}`,
                    image: resolveImage(item.image || kit?.image, item.images || kit?.images),
                    name,
                    meta: [grade, status].filter(Boolean).join(' / '),
                    quantity: Number(item.quantity) || 1,
                    unitPrice,
                    standaloneUnitPrice,
                    isDiscounted
                  };
                });
                const isItemsExpanded = Boolean(expandedOrderItems[o.id]);
                const visibleItemRows = isItemsExpanded ? itemRows : itemRows.slice(0, 1);
                const hiddenItemCount = Math.max(0, itemRows.length - visibleItemRows.length);

                return (
                  <div
                    key={o.id}
                    onClick={(e) => {
                      if (isMultiSelectEnabled) {
                        toggleOrderSelection(e, o);
                      } else {
                        setSelectedOrder(o);
                        navigate(`/orders/${encodeURIComponent(o.orderId || o.id)}`);
                      }
                    }}
                    className={`p-3 rounded-2xl border-2 flex flex-col gap-3 transition-all duration-200 ${
                      isMultiSelectEnabled && !isCardInvalid ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                    } ${
                      isSelected
                        ? 'border-blue-500 shadow-lg shadow-blue-500/10'
                        : isMultiSelectEnabled && !isCardInvalid
                          ? 'border-black/5 dark:border-white/5'
                          : 'border-black/5 dark:border-white/5 hover:border-black/15 dark:hover:border-white/15'
                    } bg-white dark:bg-neutral-900`}
                  >

                    {/* Row 1: Order ID + status */}
                    <div className="flex items-start justify-between gap-3">
                      <span className="whitespace-nowrap font-black text-[16px] text-blue-600 uppercase italic leading-none">
                        {o.orderId}
                      </span>
                      <div className="flex shrink-0 items-start gap-2 text-right">
                        {orderStatusIndicator}
                        {isAdminMode && activeTab === 'cancelled' && !isMultiSelectEnabled && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteOrder(e, o.id); }}
                            className="text-red-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Included items */}
                    <div className="space-y-2">
                      {visibleItemRows.map((row, rowIndex) => (
                        <div key={`${o.id}-item-${row.id}-${rowIndex}`} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 md:grid-cols-[10rem_minmax(0,1fr)] lg:grid-cols-[18rem_minmax(0,1fr)]">
                          <div className="shrink-0 flex items-center justify-center">
                            {row.image ? (
                              <img
                                src={row.image}
                                alt={row.name}
                                loading="lazy"
                                className="w-20 h-20 md:w-40 lg:w-64 xl:w-72 md:h-24 object-cover object-[center_25%] rounded-xl border border-neutral-100 dark:border-neutral-800 transition-opacity duration-500"
                                onLoad={(e) => e.target.classList.remove('opacity-0')}
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  e.target.nextSibling.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div className="w-20 h-20 md:w-40 lg:w-64 xl:w-72 md:h-24 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center" style={{ display: row.image ? 'none' : 'flex' }}>
                              <PackageOpen size={32} className="opacity-20" />
                            </div>
                          </div>
                          <div className="min-w-0 pt-1">
                            <p className="truncate text-[14px] font-black uppercase tracking-tight text-neutral-900 dark:text-white">
                              {row.name}
                            </p>
                            <p className="mt-1 truncate text-[13px] font-black uppercase tracking-widest opacity-45">
                              {row.meta}
                            </p>
                            <p className="mt-1 text-[12px] font-black uppercase tracking-widest opacity-45">
                              x{row.quantity}
                            </p>
                            <div className="mt-1 flex items-baseline gap-2">
                              <span className={`text-[13px] font-black ${row.isDiscounted ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-900 dark:text-white'}`}>
                                ₱{(row.unitPrice * row.quantity).toLocaleString()}
                              </span>
                              {row.isDiscounted && (
                                <span className="text-[11px] font-black text-neutral-500 line-through dark:text-neutral-400">
                                  ₱{(row.standaloneUnitPrice * row.quantity).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Row 3: Show more + payment badges + total */}
                    <div className="flex items-end justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {itemRows.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedOrderItems(prev => ({ ...prev, [o.id]: !prev[o.id] }));
                            }}
                            className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-black uppercase tracking-widest text-blue-600"
                          >
                            <ChevronDown size={14} className={`transition-transform ${isItemsExpanded ? 'rotate-180' : ''}`} />
                            {isItemsExpanded ? 'Hide items' : `Show ${hiddenItemCount} more`}
                          </button>
                        )}
                        <span className="inline-flex whitespace-nowrap text-[12px] font-black px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 uppercase tracking-wider">
                          {shippingMethodLabel}
                        </span>
                        {o.paymentPlan && o.paymentPlan !== 'full' ? (
                          <span className="inline-flex whitespace-nowrap text-[12px] font-black px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-500 uppercase tracking-wider">
                            {o.paymentPlan === 'partial' ? 'Partial' : o.paymentPlan === 'reservation' ? 'Reservation' : 'Installment'}
                          </span>
                        ) : (
                          <span className="inline-flex whitespace-nowrap text-[12px] font-black px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 uppercase tracking-wider">
                            Full Pay
                          </span>
                        )}
                        {o.paymentMethod && (
                          <span className={`inline-flex whitespace-nowrap text-[12px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${
                            o.paymentMethod === 'GCash' ? 'bg-blue-500/10 text-blue-500' :
                            o.paymentMethod === 'Cash'  ? 'bg-amber-500/10 text-amber-600' :
                            'bg-neutral-500/10 text-neutral-500'
                          }`}>
                            {o.paymentMethod}
                          </span>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="flex items-baseline justify-end gap-2 leading-none">
                          <span className="text-[13px] font-black uppercase tracking-widest">Total</span>
                          <span className="font-black text-[15px] text-neutral-900 dark:text-white">
                            ₱{orderGrandTotal.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

        {/* ── STICKY FOOTER ── */}
        {isAdminMode && !isLoading && !selectedOrder && (
          <div className="sticky bottom-0 z-[88] w-full h-[60px] bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border-t border-black/5 dark:border-white/5 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
            <div className="max-w-7xl mx-auto px-4 md:px-8 h-full flex items-center justify-between gap-4">

              {/* LEFT: Select All (only when multi-select is active and there are orders) */}
              <div className="flex items-center gap-3 min-w-0">
                {isMultiSelectEnabled && visibleInvalidOrders.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:opacity-70 transition-opacity animate-in fade-in duration-200 whitespace-nowrap"
                  >
                    {selectedOrders.length === visibleInvalidOrders.length ? 'Deselect All' : 'Select All Invalid'}
                  </button>
                )}
              </div>

              {/* RIGHT: Multi-select toggle + Manual Order */}
              <div className="flex items-center gap-3 shrink-0">
                {/* Multi-select icon button — swaps to Trash when items selected */}
                {selectedOrders.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleBatchDelete}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-red-500/20 active:scale-95 animate-in zoom-in-95 duration-200"
                  >
                    <Trash2 size={14} />
                    <span>Cancel & Delete ({selectedOrders.length})</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isMultiSelectEnabled;
                      setIsMultiSelectEnabled(next);
                      if (!next) setSelectedOrders([]);
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all active:scale-95 ${
                      isMultiSelectEnabled
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                        : 'bg-black/5 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 hover:bg-black/10 dark:hover:bg-white/15'
                    }`}
                  >
                    <ListTodo size={14} />
                    <span className="hidden sm:inline">{isMultiSelectEnabled ? 'Multi-Select On' : 'Multi-Select'}</span>
                  </button>
                )}

                {/* Legacy Order button */}
                <button
                  onClick={() => setShowManualOrderModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-black italic uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                >
                  <Plus size={14} /> Legacy
                </button>
              </div>
            </div>
          </div>
        )}

        {isPreviewExpanded && activePreviewUrl && (() => {
          const isQrPreview = activePreviewUrl === qrImageSrc;
          const isResOrPartial = selectedOrder && (['reservation', 'partial'].includes(String(selectedOrder.paymentPlan || '').toLowerCase()) || selectedOrder.isReservation || selectedOrder.isPartial);
          let amountToPay = 0;
          if (isQrPreview && selectedTotals) {
            if (isResOrPartial) {
              // First receipt validated → show remaining balance; otherwise show downpayment amount
              amountToPay = selectedOrder.receipt
                ? (selectedTotals.balance > 0 ? selectedTotals.balance : 0)
                : Number(selectedOrder.paymentDueNow || selectedTotals.total || 0);
            } else {
              amountToPay = selectedTotals.total || 0;
            }
          }
          return (
            <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/95 animate-in fade-in duration-300" onClick={() => { setIsPreviewExpanded(false); setActivePreviewUrl(null); }}>
              <button className="absolute top-8 right-8 text-white/50 hover:text-white z-10"><X size={40} /></button>
              {isQrPreview ? (
                <div className="flex flex-col items-center gap-6" onClick={e => e.stopPropagation()}>
                  {/* QR Card */}
                  <div className="bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-4 max-w-[80vw]">
                    <img src={activePreviewUrl} className="w-[60vw] h-[60vw] max-w-[320px] max-h-[320px] object-contain" alt="Payment QR Code" />
                    {selectedOrder?.paymentMethod && (
                      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">{selectedOrder.paymentMethod}</p>
                    )}
                  </div>
                  {/* Amount to Pay */}
                  {amountToPay > 0 && (
                    <div className="flex flex-col items-center gap-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Amount to Pay</p>
                      <p className="text-3xl font-black text-white tracking-tight">₱{amountToPay.toLocaleString()}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
                  <img src={activePreviewUrl} className="max-w-[90vw] max-h-[60vh] object-contain rounded-xl shadow-2xl animate-in zoom-in-95 duration-200" alt="Receipt Preview" />
                  {isAdminMode && selectedOrder.status === 'Validating' && (() => {
                    const isFirstReceipt = activePreviewUrl === (previewUrl || selectedOrder.receipt);
                    const isBalanceReceipt = activePreviewUrl === (balancePreviewUrl || selectedOrder.balanceReceipt);
                    const receiptLabel = isBalanceReceipt ? 'Balance Receipt' : 'Receipt';
                    
                    if (isFirstReceipt || isBalanceReceipt) {
                      return (
                        <div className="flex flex-row items-center justify-center gap-3 w-full max-w-sm px-4">
                          {/* Validate Button */}
                          <button 
                            onClick={() => {
                              if (window.confirm(`Validate this ${receiptLabel.toLowerCase()}?`)) {
                                handleConfirmPayment(selectedOrder, true);
                                setIsPreviewExpanded(false);
                                setActivePreviewUrl(null);
                              }
                            }} 
                            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 whitespace-nowrap"
                          >
                            <CheckCircle2 size={14} /> Validate
                          </button>

                          {/* Request Balance Button */}
                          <button
                            onClick={() => handleInsufficientPayment(selectedOrder, isBalanceReceipt)}
                            className="flex-1 py-3 bg-white hover:bg-neutral-200 text-neutral-950 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 whitespace-nowrap"
                          >
                            <Wallet size={14} /> Request Balance
                          </button>
                        </div>
                      );
                    }
                    
                    return null;
                  })()}
                </div>
              )}
            </div>
          );
        })()}

        {showManualOrderModal && (
          <div className="fixed inset-x-0 bottom-0 top-[56px] z-[500] mx-auto flex max-w-7xl flex-col overflow-hidden bg-white text-neutral-950 dark:bg-[#0a0a0a] dark:text-white">
            <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-black/5 px-5 shadow-sm dark:border-white/5 sm:h-20 sm:px-8 lg:px-12">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25"><ClipboardList size={20} /></span>
                <div><h2 className="text-[19px] font-black italic uppercase tracking-tight sm:text-[22px]">Legacy <span className="text-blue-600">Order</span></h2><p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-40">Record paid orders and assign stock</p></div>
              </div>
              <button type="button" onClick={() => setShowManualOrderModal(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/5 transition hover:bg-black/10 dark:bg-white/10" aria-label="Close legacy order"><X size={20} /></button>
            </header>

            <form onSubmit={handleCreateManualOrder} className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto grid max-w-7xl gap-7 px-5 py-6 pb-28 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-12">
                <div className="space-y-6">
                  <section>
                    <div className="mb-3 flex items-center justify-between"><h3 className="text-[12px] font-black uppercase tracking-widest opacity-45">Included items</h3><span className="text-[11px] font-black uppercase tracking-widest text-blue-600">{manualOrderData.selectedItems.length} selected</span></div>
                    <div className="rounded-2xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
                      <input value={manualOrderData.search} onChange={(event) => setManualOrderData(prev => ({ ...prev, search: event.target.value }))} placeholder="Search kits, brand, line, or stock…" className="mb-3 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-[13px] font-bold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-black/20" />
                      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                        {filteredLegacyStockChoices.map(({ kit, stockKey, stock }) => {
                          const selected = manualOrderData.selectedItems.some(item => item.kitId === kit.id && item.stockKey === stockKey);
                          const image = resolveImage(kit.image, kit.images) || '/snorlaxgarage.png';
                          return <button key={`${kit.id}:${stockKey}`} type="button" disabled={selected} onClick={() => setManualOrderData(prev => ({ ...prev, selectedItems: [...prev.selectedItems, { kitId: kit.id, stockKey, name: kit.name, image, costPrice: Number(stock.costPrice || 0), meta: [kit.brand, kit.specs?.line, stock.status].filter(Boolean).join(' • ') }] }))} className="flex w-full items-center gap-3 rounded-xl border border-black/5 bg-white p-2 text-left transition hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/5 dark:bg-white/[0.03]">
                            <img src={image} alt="" className="h-12 w-16 rounded-lg object-cover" /><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-black uppercase">{kit.name}</span><span className="block truncate text-[10px] font-bold uppercase tracking-wider opacity-45">{[kit.brand, kit.specs?.line, stock.status, stock.eta].filter(Boolean).join(' • ')}</span></span><span className="shrink-0 text-right leading-tight"><span className="block text-[12px] font-black text-emerald-600">SELL ₱{Number(stock.sellPrice || kit.sellPrice || 0).toLocaleString()}</span><span className="block text-[10px] font-black opacity-50">COST ₱{Number(stock.costPrice || 0).toLocaleString()}</span></span>
                          </button>;
                        })}
                        {filteredLegacyStockChoices.length === 0 && <p className="p-5 text-center text-[11px] font-black uppercase tracking-widest opacity-40">No available non-collection stock found</p>}
                      </div>
                    </div>
                  </section>

                  <section className="space-y-3">
                    {manualOrderData.selectedItems.length === 0 ? <div className="rounded-2xl border border-dashed border-black/15 p-8 text-center text-[11px] font-black uppercase tracking-widest opacity-40 dark:border-white/15">Select specific stocks to include</div> : manualOrderData.selectedItems.map((item) => <div key={`${item.kitId}:${item.stockKey}`} className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-black/5 bg-white p-3 shadow-sm dark:border-white/5 dark:bg-white/[0.03]"><img src={item.image || '/snorlaxgarage.png'} alt="" className="h-16 w-20 rounded-xl object-cover" /><div className="min-w-0"><p className="truncate text-[13px] font-black uppercase">{item.name}</p><p className="mt-1 truncate text-[11px] font-black uppercase tracking-wider opacity-45">{item.meta}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wider opacity-60">COST ₱{Number(item.costPrice || 0).toLocaleString()}</p></div><button type="button" onClick={() => setManualOrderData(prev => ({ ...prev, selectedItems: prev.selectedItems.filter(entry => !(entry.kitId === item.kitId && entry.stockKey === item.stockKey)) }))} className="rounded-full p-2 text-red-500 hover:bg-red-500/10" aria-label={`Remove ${item.name}`}><Trash2 size={16} /></button></div>)}
                  </section>
                </div>

                <aside className="space-y-5">
                  <section className="rounded-2xl border border-black/10 p-5 dark:border-white/10"><h3 className="mb-4 text-[12px] font-black uppercase tracking-widest opacity-45">Shipping</h3><div className="space-y-3"><select required value={manualOrderData.shippingMethod} onChange={(event) => setManualOrderData(prev => ({ ...prev, shippingMethod: event.target.value, shippingSuboption: '', branch: '' }))} className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-3 text-[12px] font-black uppercase dark:border-white/10"><option value="">Select shipping option</option>{legacyShippingOptions.map(method => <option key={method} value={method}>{method}</option>)}</select>{legacySuboptions.length > 0 && <select required value={manualOrderData.shippingSuboption} onChange={(event) => setManualOrderData(prev => ({ ...prev, shippingSuboption: event.target.value, branch: '' }))} className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-3 text-[12px] font-black uppercase dark:border-white/10"><option value="">Select suboption</option>{legacySuboptions.map(([key, config]) => <option key={key} value={key}>{config.label || key}</option>)}</select>}</div></section>
                  <section className="rounded-2xl border border-black/10 p-5 dark:border-white/10"><h3 className="mb-4 text-[12px] font-black uppercase tracking-widest opacity-45">Delivery address</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">{legacyBranchRequired && <input required value={manualOrderData.branch} onChange={(event) => setManualOrderData(prev => ({ ...prev, branch: event.target.value }))} placeholder="BRANCH" className="rounded-xl border border-black/10 bg-transparent px-3 py-3 text-[12px] font-black uppercase dark:border-white/10" />}<input required value={manualOrderData.city} onChange={(event) => setManualOrderData(prev => ({ ...prev, city: event.target.value }))} placeholder="CITY" className="rounded-xl border border-black/10 bg-transparent px-3 py-3 text-[12px] font-black uppercase dark:border-white/10" /><input required value={manualOrderData.province} onChange={(event) => setManualOrderData(prev => ({ ...prev, province: event.target.value }))} placeholder="PROVINCE" className="rounded-xl border border-black/10 bg-transparent px-3 py-3 text-[12px] font-black uppercase dark:border-white/10" /><input required inputMode="numeric" value={manualOrderData.zipCode} onChange={(event) => setManualOrderData(prev => ({ ...prev, zipCode: event.target.value }))} placeholder="ZIP CODE" className="rounded-xl border border-black/10 bg-transparent px-3 py-3 text-[12px] font-black uppercase dark:border-white/10" /></div></section>
                  <section className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.04] p-5"><h3 className="mb-4 text-[12px] font-black uppercase tracking-widest text-blue-600">Payment summary</h3><label className="mb-3 block text-[10px] font-black uppercase tracking-widest opacity-45">Total paid by buyer<input required min="0" type="number" value={manualOrderData.buyerPaid} onChange={(event) => setManualOrderData(prev => ({ ...prev, buyerPaid: event.target.value }))} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-[14px] font-black text-neutral-950 dark:border-white/10 dark:bg-black/20 dark:text-white" /></label><label className="block text-[10px] font-black uppercase tracking-widest opacity-45">Handling fee paid<input required min="0" type="number" value={manualOrderData.handlingFeePaid} onChange={(event) => setManualOrderData(prev => ({ ...prev, handlingFeePaid: event.target.value }))} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-[14px] font-black text-neutral-950 dark:border-white/10 dark:bg-black/20 dark:text-white" /></label><div className="mt-4 flex items-center justify-between border-t border-blue-500/15 pt-4"><span className="text-[10px] font-black uppercase tracking-widest opacity-55">Distributed to items</span><span className="text-[18px] font-black text-blue-600">₱{legacyItemTotal.toLocaleString()}</span></div><p className="mt-3 text-[10px] font-bold leading-relaxed opacity-50">Total paid minus handling fee is proportionally saved as the selected stocks’ legacy sell price. Installment fees are excluded.</p></section>
                </aside>
              </div>
              <footer className="absolute inset-x-0 bottom-0 z-10 border-t border-black/5 bg-white/95 px-5 py-3 backdrop-blur dark:border-white/5 dark:bg-[#0a0a0a]/95 sm:px-8 lg:px-12"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><button type="button" onClick={() => setShowManualOrderModal(false)} className="text-[11px] font-black uppercase tracking-widest opacity-50">Cancel</button><button type="submit" className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 active:scale-95"><ArrowRight size={16} /> Create legacy order</button></div></footer>
            </form>
          </div>
        )}

        {showManualOrderModal && manualOrderData.showDeprecatedForm && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 backdrop-blur-md bg-black/60">
             <div className="bg-white dark:bg-[#0a0a0a] w-full max-w-xl rounded-[2.5rem] p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
               <button onClick={() => setShowManualOrderModal(false)} className="absolute top-6 right-6 opacity-30 hover:opacity-100"><X size={20}/></button>
               <h2 className="text-2xl font-black uppercase mb-6 italic tracking-tighter">Manual <span className="text-blue-600">Order</span></h2>
               <form onSubmit={handleCreateManualOrder} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase opacity-40 tracking-widest">Customer</label>
                    <select className="w-full p-4 rounded-xl border bg-transparent text-xs font-black" value={manualOrderData.buyerUid} onChange={(e) => setManualOrderData(prev => ({...prev, buyerUid: e.target.value}))}>
                      <option value="">-- NEW CUSTOMER --</option>
                      {(usersList || []).map(u => (<option key={u.uid} value={u.uid}>{u.displayName}</option>))}
                    </select>
                  </div>
                  {!manualOrderData.buyerUid && (
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase opacity-40 tracking-widest">Buyer Name (New)</label>
                      <input className="w-full p-4 rounded-xl border bg-transparent text-xs font-black" placeholder="FULL NAME" value={manualOrderData.newBuyerName} onChange={(e) => setManualOrderData(prev => ({...prev, newBuyerName: e.target.value.toUpperCase()}))} />
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase opacity-40 tracking-widest">Select Product</label>
                    <select className="w-full p-4 rounded-xl border bg-transparent text-xs font-black" value={manualOrderData.selectedKitId} onChange={(e) => setManualOrderData(prev => ({...prev, selectedKitId: e.target.value, selectedStockKey: ''}))}>
                      <option value="">-- Choose Kit --</option>
                      {(kits || []).map(k => (<option key={k.id} value={k.id}>{k.name}</option>))}
                    </select>
                  </div>
                  {manualOrderData.selectedKitId && (
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase opacity-40 tracking-widest">Select Specific Stock</label>
                      <select className="w-full p-4 rounded-xl border bg-transparent text-xs font-black" value={manualOrderData.selectedStockKey} onChange={(e) => setManualOrderData(prev => ({...prev, selectedStockKey: e.target.value}))} required>
                        <option value="">-- Choose Stock Variant --</option>
                        {availableStocks.map(s => (
                          <option key={s.key} value={s.key}>{s.status} {s.eta ? `(${s.eta})` : ''} - ₱{s.sellPrice?.toLocaleString()}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase opacity-40 tracking-widest">Shipping Fee (₱)</label>
                      <input type="number" className="w-full p-4 rounded-xl border bg-transparent text-xs font-black" value={manualOrderData.shippingFee} onChange={(e) => setManualOrderData(prev => ({...prev, shippingFee: e.target.value}))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase opacity-40 tracking-widest">Transfer Fee (₱)</label>
                      <input type="number" className="w-full p-4 rounded-xl border bg-transparent text-xs font-black" value={manualOrderData.transferFee} onChange={(e) => setManualOrderData(prev => ({...prev, transferFee: e.target.value}))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase opacity-40 tracking-widest">Shipping Method</label>
                      <select className="w-full p-4 rounded-xl border bg-transparent text-xs font-black" value={manualOrderData.shippingMethod} onChange={(e) => setManualOrderData(prev => ({...prev, shippingMethod: e.target.value}))}>
                        {['LBC COP/COD', 'Seller Meetup', 'Self-Pickup', 'SPX Express'].map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase opacity-40 tracking-widest">Buyer Paid (₱)</label>
                      <input type="number" className="w-full p-4 rounded-xl border bg-transparent text-xs font-black" value={manualOrderData.buyerPaid} onChange={(e) => setManualOrderData(prev => ({...prev, buyerPaid: e.target.value}))} />
                    </div>
                  </div>
                  <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-[1.8rem] font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center gap-2">
                    <ArrowRight size={18} /> Create Order
                  </button>
               </form>
             </div>
          </div>
        )}
      </div>
    </PageTemplate>
  );
}
