import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { useTheme } from '../context/ThemeContext';
import PageTemplate from './PageTemplate';
import { 
  ClipboardList, Plus, MapPin, Package, PackageOpen, ShieldCheck, X, CheckCircle2, 
  ChevronDown, Clock, Store, Truck, Tag, Trash2, AlertCircle,
  Camera, Upload, QrCode, ArrowRight, Eye, Download, ListTodo, Flag,
  XCircle, Wallet, MapPinSearch, ClockFading, PrinterCheck, Undo2, Pause, Play, Copy, ExternalLink
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import LoadingState from '../components/common/LoadingState';
import { getStandaloneUnitPrice } from '../utils/standalonePricing';
import { getStockEta } from '../utils/stockDates';
import { getPrintedProjectModelName } from '../utils/printedProjectName';
import { shouldChargeHandlingFee } from '../utils/paymentSettings';
import {
  lookupPhilippineAddressByZipCode,
  lookupPhilippineZipCodeByCityAndProvince
} from '../utils/philippineAddress';
import {
  compactImageReference,
  isEmbeddedImage,
  resolveGridImage
} from '../utils/orderPayload';
import PhilippineAddressSuggestions from '../components/common/PhilippineAddressSuggestions';
import { getProjectScheduleDates } from '../components/calculator/GarageCalendar';
import { isOrderFreeShipping } from '../utils/shippingUtils';
import { getNextAvailableDate } from '../utils/availabilitySchedule';
import {
  getProjectCapitalCost,
  getProjectName,
  getProjectRevenue,
  getProjectType
} from '../utils/projectFinancials';

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

const hasRecordedAmount = (value) => value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));

const isLegacyOrderRecord = (order) => Boolean(
  order?.legacyOrder
  || order?.orderSource === 'legacy'
  || String(order?.orderId || '').toUpperCase().startsWith('#LG-')
);

const getLegacyOrderAddress = (order) => {
  const receiverDetails = order?.receiverDetails || {};
  return {
    city: receiverDetails.city || receiverDetails.town || order?.city || order?.town || '',
    province: receiverDetails.province || order?.province || '',
    zipCode: receiverDetails.zipCode || receiverDetails.zip || order?.zipCode || order?.zip || ''
  };
};

const generateSgOrderId = (existingOrders = []) => {
  const existingIds = new Set(existingOrders.map((order) => String(order?.orderId || '').toUpperCase()));
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = `#SG-${Math.floor(Math.random() * 9000) + 1000}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  return `#SG-${String(Date.now()).slice(-4)}`;
};

const getLegacyKitDetails = (kit) => ({
  id: kit?.id || null,
  name: kit?.name || '',
  brand: kit?.brand || '',
  series: kit?.series || '',
  specs: { ...(kit?.specs || {}) },
  description: kit?.description || '',
  image: compactImageReference(kit?.image),
  jpPrice: hasRecordedAmount(kit?.jpPrice) ? Number(kit.jpPrice) : null,
  phPrice: hasRecordedAmount(kit?.phPrice) ? Number(kit.phPrice) : null,
  dimensions: kit?.dimensions || kit?.boxDimensions || null
});

const getLegacyStockDetails = (stock, stockKey) => ({
  stockKey: stockKey || null,
  status: stock?.status || '',
  eta: getStockEta(stock) || '',
  boxCondition: stock?.boxCondition || '',
  kitCondition: stock?.kitCondition || '',
  condition: Array.isArray(stock?.condition) ? [...stock.condition] : (stock?.condition || ''),
  issue: stock?.issue || '',
  issueDescription: stock?.issueDescription || '',
  sellPrice: hasRecordedAmount(stock?.sellPrice) ? Number(stock.sellPrice) : null,
  costPrice: hasRecordedAmount(stock?.costPrice) ? Number(stock.costPrice) : null,
  minDownpayment: hasRecordedAmount(stock?.minDownpayment) ? Number(stock.minDownpayment) : null
});

const getLegacyItemCapital = (item, kits) => {
  const quantity = Math.max(1, Number(item?.quantity) || 1);
  if (item?.type === 'project' || item?.projectData) {
    const projectCost = getProjectCapitalCost(item);
    return {
      amount: projectCost === null ? 0 : Math.max(0, projectCost * quantity),
      known: projectCost !== null
    };
  }

  const kit = (kits || []).find((candidate) => String(candidate?.id) === String(item?.kitId || item?.id));
  const stock = kit?.stocks?.[item?.stockKey];
  const rawCost = stock?.costPrice ?? item?.costPrice ?? kit?.costPrice;

  return {
    amount: hasRecordedAmount(rawCost) ? Math.max(0, Number(rawCost)) * quantity : 0,
    known: hasRecordedAmount(rawCost)
  };
};

const calculateLegacyFinancials = (revenue, items, kits) => {
  const normalizedItems = Array.isArray(items) ? items : [];
  const itemCapital = normalizedItems.map((item) => getLegacyItemCapital(item, kits));
  const hasCostData = normalizedItems.length > 0 && itemCapital.every(({ known }) => known);
  const transactionRevenue = Math.max(0, Number(revenue) || 0);
  const capitalCost = itemCapital.reduce((sum, item) => sum + item.amount, 0);

  return {
    available: hasCostData,
    revenue: transactionRevenue,
    capitalCost: hasCostData ? capitalCost : null,
    capitalRegained: hasCostData ? Math.min(transactionRevenue, capitalCost) : null,
    profit: hasCostData ? transactionRevenue - capitalCost : null
  };
};

const getLegacyOrderItems = (order) => {
  if (Array.isArray(order?.items) && order.items.length > 0) return order.items;
  if (!order?.kitId && !order?.selectedKitId) return [];

  return [{
    id: order.selectedKitId || order.kitId,
    stockKey: order.selectedStockKey,
    costPrice: order.costPrice,
    quantity: order.quantity || 1
  }];
};

const getLegacyOrderFinancials = (order, kits) => {
  if (!isLegacyOrderRecord(order)) return null;

  const revenue = order.buyerPaid ?? order.totalPrice ?? order.price;
  const storedCapitalCost = order.legacyCapitalCost;
  if (order.legacyFinancialsAvailable === true && hasRecordedAmount(storedCapitalCost)) {
    const capitalCost = Math.max(0, Number(storedCapitalCost));
    const transactionRevenue = Math.max(0, Number(revenue) || 0);
    return {
      available: true,
      revenue: transactionRevenue,
      capitalCost,
      capitalRegained: Math.min(transactionRevenue, capitalCost),
      profit: transactionRevenue - capitalCost
    };
  }

  return calculateLegacyFinancials(revenue, getLegacyOrderItems(order), kits);
};

function createPaymentReviewId() {
  return globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

const INVALID_ORDER_DELETE_WINDOW_MS = 10 * 60 * 1000;
const CANCELLED_ORDER_DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;
const COMPLETED_ORDER_REVERSAL_WINDOW_MS = 24 * 60 * 60 * 1000;

const getTimestampMs = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getCompletedOrderReversalDeadline = (order) => {
  const configuredDeadline = getTimestampMs(order?.legacyCountdownDeadline);
  if (configuredDeadline) return configuredDeadline;

  const completedAt = getTimestampMs(order?.completedAt || order?.lastUpdated || order?.createdAt);
  return completedAt ? completedAt + COMPLETED_ORDER_REVERSAL_WINDOW_MS : 0;
};

const getCompletedOrderReversalRemainingMs = (order, now = Date.now()) => {
  if (order?.legacyCountdownPaused === true) {
    const pausedRemaining = Number(order.legacyCountdownRemainingMs);
    if (Number.isFinite(pausedRemaining)) return Math.max(0, pausedRemaining);
  }

  const deadline = getCompletedOrderReversalDeadline(order);
  return deadline ? Math.max(0, deadline - now) : 0;
};

const formatLegacyCompletedCountdown = (remainingMs) => {
  const totalMinutes = Math.max(0, Math.ceil(remainingMs / (60 * 1000)));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

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
      const timestampEnd = timestampStart + INVALID_ORDER_DELETE_WINDOW_MS;
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

function CompletedReversalTimer({ order, onExpire, children }) {
  const [timeLeft, setTimeLeft] = useState('');
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    const calculateTime = () => {
      const deadline = getCompletedOrderReversalDeadline(order);
      const isPaused = order?.legacyCountdownPaused === true;
      const pausedRemaining = Number(order?.legacyCountdownRemainingMs);
      const diff = isPaused && Number.isFinite(pausedRemaining)
        ? pausedRemaining
        : deadline - Date.now();

      if (!deadline && !isPaused) {
        setTimeLeft(isLegacyOrderRecord(order) ? 'EXPIRED' : 'PERMANENT');
        if (!hasExpiredRef.current) {
          hasExpiredRef.current = true;
          onExpire?.();
        }
        return;
      }

      if (diff <= 0) {
        setTimeLeft(isLegacyOrderRecord(order) ? 'EXPIRED' : 'PERMANENT');
        if (!hasExpiredRef.current) {
          hasExpiredRef.current = true;
          onExpire?.();
        }
        return;
      }

      if (isLegacyOrderRecord(order)) {
        setTimeLeft(formatLegacyCompletedCountdown(diff));
        return;
      }

      const totalSecs = Math.ceil(diff / 1000);
      const days = Math.floor(totalSecs / (24 * 60 * 60));
      const hours = Math.floor((totalSecs % (24 * 60 * 60)) / (60 * 60));
      const mins = Math.floor((totalSecs % (60 * 60)) / 60);
      const secs = totalSecs % 60;
      setTimeLeft(days > 0
        ? `${days}d ${hours}h`
        : `${hours}h ${mins}m ${secs.toString().padStart(2, '0')}s`);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [onExpire, order]);

  return children(timeLeft);
}

const toLocalDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeTimeValue = (value) => {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? `${match[1]}:${match[2]}` : '';
};

const timeToMinutes = (value) => {
  const normalized = normalizeTimeValue(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(':').map(Number);
  return (hours * 60) + minutes;
};

const isMeetupTimeWithinWindow = (startTime, windowStart, windowEnd, durationMinutes = 15) => {
  const selectedMinutes = timeToMinutes(startTime);
  const windowStartMinutes = timeToMinutes(windowStart);
  const windowEndMinutes = timeToMinutes(windowEnd);
  if ([selectedMinutes, windowStartMinutes, windowEndMinutes].some(value => value === null)) return false;
  return selectedMinutes >= windowStartMinutes
    && selectedMinutes + durationMinutes <= windowEndMinutes;
};

const buildMeetupTimeOptions = (windowStart, windowEnd, durationMinutes = 15, stepMinutes = 15) => {
  const startMinutes = timeToMinutes(windowStart);
  const endMinutes = timeToMinutes(windowEnd);
  if (startMinutes === null || endMinutes === null || endMinutes - startMinutes < durationMinutes) return [];

  const options = [];
  for (let value = startMinutes; value + durationMinutes <= endMinutes; value += stepMinutes) {
    options.push(`${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`);
  }
  return options;
};

const buildBuyerMeetupTimeOptions = (
  windowStart,
  windowEnd,
  meetupDate,
  adminCanMeetupToday = true,
  now = new Date(),
  durationMinutes = 15,
  stepMinutes = 15
) => {
  const options = buildMeetupTimeOptions(windowStart, windowEnd, durationMinutes, stepMinutes);
  if (!adminCanMeetupToday || !meetupDate || meetupDate !== toLocalDateKey(now)) return options;

  const currentMinutes = (now.getHours() * 60) + now.getMinutes();
  let upcomingSlotsToExclude = 2;
  return options.filter((time) => {
    const timeMinutes = timeToMinutes(time);
    if (timeMinutes < currentMinutes) return false;
    if (upcomingSlotsToExclude > 0) {
      upcomingSlotsToExclude -= 1;
      return false;
    }
    return true;
  });
};

const parseDateKey = (dateKey) => {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
};

const formatMeetupDate = (dateKey) => {
  const date = parseDateKey(dateKey);
  if (!date) return 'DATE PENDING';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
};

const getEndTimeForWindow = (startTime, durationMinutes = 15) => {
  const [hours, minutes] = String(startTime || '').split(':').map(Number);
  if (![hours, minutes].every(Number.isFinite)) return '';
  const totalMinutes = (hours * 60) + minutes + durationMinutes;
  return `${String(Math.floor((totalMinutes % 1440) / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
};

const formatTrackingTime = (value) => {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  if (![hours, minutes].every(Number.isFinite)) return value || '';
  const date = new Date(2000, 0, 1, hours, minutes);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const isTrackingUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());

const getConfirmedTrackingValue = (order) => {
  if (order?.trackingNo && order.trackingNoConfirmed !== false) {
    return { value: String(order.trackingNo).trim(), source: 'admin' };
  }
  if (order?.customerTrackingLink && order.customerTrackingLinkConfirmed !== false) {
    return { value: String(order.customerTrackingLink).trim(), source: 'customer' };
  }
  return { value: '', source: '' };
};

const formatClockMinutes = (minutes) => {
  const normalized = ((Number(minutes) % 1440) + 1440) % 1440;
  const date = new Date(2000, 0, 1, Math.floor(normalized / 60), normalized % 60);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const getPrintingPickupSchedule = (order, projectItems, rates, availabilitySchedule) => {
  const printStartMins = Math.round(Number(rates?.['labor-cost']?.printStartTime ?? 9) * 60);
  const scheduleByDate = new Map();

  projectItems.forEach((item) => {
    const dates = getProjectScheduleDates(order, item, availabilitySchedule, 'printing');
    const dailySchedule = item?.projectData?.totals?.timeline?.schedule || [];
    dates.forEach((dateKey, index) => {
      const dayNumber = index + 1;
      const dailyMinutes = dailySchedule
        .filter((entry) => Number(entry?.day) === dayNumber)
        .reduce((longest, entry) => Math.max(
          longest,
          Number(entry?.maxPrinterMins ?? entry?.totalMins ?? 0)
        ), 0);
      const endMinutes = printStartMins + dailyMinutes;
      const existing = scheduleByDate.get(dateKey);
      scheduleByDate.set(dateKey, {
        dateKey,
        startMinutes: existing ? Math.min(existing.startMinutes, printStartMins) : printStartMins,
        endMinutes: existing ? Math.max(existing.endMinutes, endMinutes) : endMinutes
      });
    });
  });

  return [...scheduleByDate.values()]
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    .map(({ dateKey, startMinutes, endMinutes }) => ({
      dateKey,
      startTime: formatClockMinutes(startMinutes),
      endTime: formatClockMinutes(endMinutes)
    }));
};

function CancelledOrderTimer({ order, onExpire, children }) {
  const [timeLeft, setTimeLeft] = useState('');
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    const calculateTime = () => {
      const cancelledAt = getTimestampMs(order?.cancelledAt || order?.lastUpdated || order?.createdAt);
      const deadline = cancelledAt ? cancelledAt + CANCELLED_ORDER_DELETE_WINDOW_MS : 0;
      if (!deadline) {
        setTimeLeft('—');
        return;
      }

      const diff = deadline - Date.now();
      if (diff <= 0) {
        setTimeLeft('00:00');
        if (!hasExpiredRef.current) {
          hasExpiredRef.current = true;
          onExpire?.();
        }
        return;
      }

      const totalSecs = Math.ceil(diff / 1000);
      const days = Math.floor(totalSecs / (24 * 60 * 60));
      const hours = Math.floor((totalSecs % (24 * 60 * 60)) / (60 * 60));
      const mins = Math.floor((totalSecs % (60 * 60)) / 60);
      const secs = totalSecs % 60;
      setTimeLeft(days > 0
        ? `${days}d ${hours}h`
        : `${hours}h ${mins}m ${secs.toString().padStart(2, '0')}s`);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [onExpire, order]);

  return children(timeLeft);
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

const getShippingFlags = (order, shippingSettings = null) => {
  const method = String(order?.shippingMethod || '').toUpperCase();
  const shippingMethods = shippingSettings?.shippingMethods || {};
  const methodKey = String(order?.shippingMethodKey || order?.shippingMethod || '').trim();
  const resolvedMethodKey = Object.keys(shippingMethods).find(key => (
    normalizeShippingValue(key) === normalizeShippingValue(methodKey)
  )) || methodKey;
  const methodConfig = shippingMethods?.[resolvedMethodKey] || {};
  const subKey = String(order?.shippingSuboptionKey || '').trim();
  const subConfig = methodConfig?.suboptions?.[subKey] || methodConfig?.[subKey] || {};
  const activeOptionConfig = subConfig && typeof subConfig === 'object' ? subConfig : methodConfig;
  const activeRequiredFields = Array.isArray(activeOptionConfig?.requiredFields)
    ? activeOptionConfig.requiredFields
    : Array.isArray(methodConfig?.requiredFields) ? methodConfig.requiredFields : [];
  const isSelfBooking = order?.isSelfBooking === true
    || activeOptionConfig?.isSelfBooking === true
    || methodConfig?.isSelfBooking === true;
  const hasMeetupLocation = Boolean(order?.meetupLocation);
  const isMeetup = method.includes('MEETUP') || hasMeetupLocation || activeRequiredFields.includes(15);
  const isSelfPickup = method.includes('SELF-PICKUP');
  const hasPickupPoint = Boolean(order?.pickupLocation || order?.pickupDetails);
  const usesPickupPoint = hasPickupPoint && !isMeetup;
  const isPickupPointCourier = usesPickupPoint && !isSelfPickup && !isSelfBooking;
  const isFreeShipping = isOrderFreeShipping(order, shippingSettings?.shippingMethods);
  const isCourier = !isMeetup && !isSelfPickup && Boolean(order?.shippingMethod);
  const isBranchDropoff = (() => {
    if (order?.isBranchDropoff === true) return true;
    if (order?.receiverDetails?.lbcBranch || order?.lbcBranch) return true;
    if (subConfig?.isBranchDropoff === true || methodConfig?.isBranchDropoff === true) return true;
    if (Array.isArray(subConfig?.requiredFields) && subConfig.requiredFields.includes(13)) return true;
    if (Array.isArray(methodConfig?.requiredFields) && methodConfig.requiredFields.includes(13)) return true;
    return false;
  })();

    const requiresCourierBranch = (() => {
    const methodKey = String(
      order?.shippingMethodKey || order?.shippingMethod || ''
    ).trim();

    const subKey = String(
      order?.shippingSuboptionKey || ''
    ).trim();

    const methodConfig = shippingSettings?.shippingMethods?.[methodKey];
    const subConfig = methodConfig?.suboptions?.[subKey];

    let activeOptionFields = [];

    if (subConfig && Array.isArray(subConfig.requiredFields)) {
      activeOptionFields = subConfig.requiredFields;
    } else if (
      methodConfig?.suboptions &&
      Object.keys(methodConfig.suboptions).length > 0
    ) {
      activeOptionFields = Array.isArray(subConfig?.requiredFields)
        ? subConfig.requiredFields
        : [];
    } else if (Array.isArray(methodConfig?.requiredFields)) {
      activeOptionFields = methodConfig.requiredFields;
    }

    return activeOptionFields.includes(13);
  })();

  return {
    isSelfBooking,
    isMeetup,
    isSelfPickup,
    usesPickupPoint,
    usesMeetupLocation: isMeetup,
    isPickupPointCourier,
    isFreeShipping,
    isBranchDropoff,
    requiresCourierBranch: requiresCourierBranch || activeRequiredFields.includes(13),
    needsAdminShipping: isCourier && !isSelfBooking && !isFreeShipping,
    needsTracking: isCourier && !isSelfBooking && !usesPickupPoint && !isMeetup
  };
};

const isSelfPickupShippingMethod = (method) => /self[\s-]*pickup/i.test(String(method || ''));
const isSellerMeetupShippingMethod = (method) => /seller[\s-]*meetup/i.test(String(method || ''));

const getConfiguredPickupPoint = (shippingSettings, mode) => (
  (shippingSettings?.pickupDetails?.['pickup-point']?.places || [])
    .find(place => place?.isActive !== false && place?.pickupAddressMode === mode) || null
);

const getConfiguredPickupAddress = (place) => {
  if (!place) return '';
  if (place.address) return place.address;
  return [
    place.houseNo,
    place.houseDetails || place.street,
    place.subdivision,
    place.barangay,
    place.city,
    place.province,
    place.zipCode
  ].filter(Boolean).join(', ');
};

const stripPickupLandmark = (address, landmark) => {
  const cleanAddress = String(address || '').trim();
  const cleanLandmark = String(landmark || '').trim();
  if (!cleanAddress || !cleanLandmark) return cleanAddress;

  const escapedLandmark = cleanLandmark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const leadingLandmark = new RegExp(`^${escapedLandmark}(?:\\s*[,;|:-]\\s*|\\s+)`, 'i');
  const stripped = cleanAddress.replace(leadingLandmark, '').trim();
  if (stripped !== cleanAddress) return stripped;

  const addressParts = cleanAddress.split(',').map(part => part.trim()).filter(Boolean);
  if (addressParts.length > 1) {
    const normalizeLandmarkPart = (value) => String(value || '')
      .toLowerCase()
      .replace(/\b(st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane)\b/g, '')
      .replace(/[^a-z0-9]+/g, '');
    if (normalizeLandmarkPart(addressParts[0]) === normalizeLandmarkPart(cleanLandmark)) {
      return addressParts.slice(1).join(', ');
    }
  }

  return cleanAddress;
};

const addPickupStreetSuffix = (address, landmark) => {
  const cleanAddress = String(address || '').trim();
  const cleanLandmark = String(landmark || '').trim();
  if (!cleanAddress || !cleanLandmark) return cleanAddress;

  const streetName = cleanLandmark.replace(/\s+\d+[a-z]?$/i, '').trim();
  if (!streetName || /\b(st|street|ave|avenue|rd|road|blvd|boulevard|lane|ln|dr|drive|ct|court)\.?$/i.test(streetName)) {
    return cleanAddress;
  }

  const normalizeAddressPart = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const addressParts = cleanAddress.split(',').map(part => part.trim()).filter(Boolean);
  if (addressParts.length && normalizeAddressPart(addressParts[0]) === normalizeAddressPart(streetName)) {
    addressParts[0] = `${addressParts[0]} St.`;
    return addressParts.join(', ');
  }

  return cleanAddress;
};

const normalizeShippingValue = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const isOrderSelfBooking = (order, settings) => {
  if (!order) return false;
  if (order.isSelfBooking === true || getShippingFlags(order, settings).isSelfBooking) return true;

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

const isOrderInitialPaymentValidated = (order) => {
  if (!order) return false;
  if (order.paymentMethod === 'Cash') return true;
  if (order.isLegacyOrder || order.legacyOrder) return true;
  if (order.receiptValidated) return true;
  if (hasValidatedFirstReceipt(order)) return true;
  if (Number(order.buyerPaid || 0) > 0) return true;
  if (order.downpaymentConfirmedAt) return true;
  if (order.paymentReview?.decision === 'approved' || order.paymentReview?.decision === 'balance_requested') return true;
  return false;
};

const isSecondPaymentPending = (order) => {
  if (!order) return false;
  const hasStlWithDesign = order.items?.some(item => 
    item.type === 'project' && 
    item.projectData?.method?.name?.toUpperCase() === 'STL' && 
    item.projectData?.selectedDesignService
  );
  return Boolean(hasStlWithDesign && order.designFinalized && !order.printDownpaymentPaid && (Number(order.buyerPaid || 0) < Number(order.minDownpayment || 0)));
};

// Legacy/manual orders may not have a receipt, but their status still controls
// whether inventory reassignment is safe. Once a legacy order is Completed it
// is a historical sale and must not be classified as auto-rebalancing eligible.
const isRebalancingEligibleOrder = (order) => {
  if (!order) return false;
  const status = String(order.status || '').trim().toLowerCase();
  if (['cancelled', 'canceled'].includes(status)) return false;
  if (status === 'completed') return false;
  if (order.receiptValidated || hasValidatedFirstReceipt(order)) return false;
  return true;
};

export default function Orders() {
  const { isDarkMode } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { orderId: routeOrderId } = useParams();
  const { user, isAdmin, isAdminView, kits, printedProjects, projectVault, blueprints, shelf, assignStockToOrder, cancelOrder, confirmOrderPayment, uploadReceipt, updateOrderDetails, updateOrderStatus, scrubFinalizedOrders, rates, orders, usersList, createOrder, deleteOrder, reverseCompletedOrder, reverseLegacyOrder, migrateLegacyOrderIds, isLoading, subscribeOrders, subscribeUsersList, loadPrintResources, shippingSettings, garageInfo, cleanUpCancelledOrders, setToastMessage, markOrderStocksReceiptValidated } = useStore();
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
  const [completedReversalExpiredIds, setCompletedReversalExpiredIds] = useState(() => new Set());
  const [isMiniNavVisible, setIsMiniNavVisible] = useState(true);
  const legacyOrderMigrationStarted = useRef(false);
  const finalizedOrderScrubStarted = useRef(false);
  const ordersListReturnRef = useRef(null);
  const pendingOrdersScrollRestoreRef = useRef(null);

  useEffect(() => {
    const handleHide = () => setIsMiniNavVisible(false);
    const handleShow = () => setIsMiniNavVisible(true);
    const handleBottomNavVisibilityChange = (event) => {
      setIsMiniNavVisible(Boolean(event.detail?.visible));
    };

    window.addEventListener('hideNavbar', handleHide);
    window.addEventListener('showNavbar', handleShow);
    window.addEventListener('bottomNavVisibilityChange', handleBottomNavVisibilityChange);
    return () => {
      window.removeEventListener('hideNavbar', handleHide);
      window.removeEventListener('showNavbar', handleShow);
      window.removeEventListener('bottomNavVisibilityChange', handleBottomNavVisibilityChange);
    };
  }, []);

  const openOrderFromList = useCallback((order) => {
    ordersListReturnRef.current = {
      tabId: activeTab,
      scrollY: window.scrollY
    };
    setSelectedOrder(order);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [activeTab]);

  const closeSelectedOrder = useCallback(() => {
    if (!location.pathname.startsWith('/orders/')) {
      pendingOrdersScrollRestoreRef.current = ordersListReturnRef.current;
    }
    setSelectedOrder(null);
    if (location.pathname.startsWith('/orders/')) {
      navigate('/orders', { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (selectedOrder || !pendingOrdersScrollRestoreRef.current) return undefined;

    const returnState = pendingOrdersScrollRestoreRef.current;
    pendingOrdersScrollRestoreRef.current = null;
    ordersListReturnRef.current = null;

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        window.scrollTo({
          top: Math.max(0, Number(returnState.scrollY) || 0),
          left: 0,
          behavior: 'instant'
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [selectedOrder]);
  useEffect(() => {
    setSelectedOrders([]);
    setIsMultiSelectEnabled(false);
  }, [activeTab]);

  useEffect(() => {
    if (!isAdminMode || isLoading || legacyOrderMigrationStarted.current) return;

    legacyOrderMigrationStarted.current = true;
    migrateLegacyOrderIds()
      .then((migratedCount) => {
        if (migratedCount > 0) {
          setToastMessage(`Updated ${migratedCount} legacy order number${migratedCount === 1 ? '' : 's'} to SG format.`);
        }
      })
      .catch((error) => {
        legacyOrderMigrationStarted.current = false;
        console.error('SG LOG: Legacy order number migration failed:', error);
      });
  }, [isAdminMode, isLoading, migrateLegacyOrderIds, setToastMessage]);

  // Periodically releases cancelled stock and lets the admin retention window expire.
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
  const [meetupDate, setMeetupDate] = useState('');
  const [meetupStartTime, setMeetupStartTime] = useState('09:00');
  const [claimantBalance, setClaimantBalance] = useState('');
  const [shippingFeeInput, setShippingFeeInput] = useState('');
  const [legacyZipCoordinates, setLegacyZipCoordinates] = useState(null);
  const legacyAddressLookupSequence = useRef(0);
  const getEmptyLegacyOrderData = () => ({
    search: '',
    searchType: 'kits',
    selectedItems: [],
    shippingMethod: '',
    shippingSuboption: '',
    city: '',
    province: '',
    zipCode: '',
    buyerPaid: '',
  });
  const [manualOrderData, setManualOrderData] = useState(getEmptyLegacyOrderData);

  const handleLegacyZipCodeChange = useCallback(async (event) => {
    const zipCode = event.target.value.replace(/\D/g, '').slice(0, 4);
    const lookupSequence = ++legacyAddressLookupSequence.current;
    setManualOrderData((previous) => ({ ...previous, zipCode }));

    if (zipCode.length !== 4) return;

    try {
      const address = await lookupPhilippineAddressByZipCode(zipCode);
      if (!address || lookupSequence !== legacyAddressLookupSequence.current) return;

      setManualOrderData((previous) => ({
        ...previous,
        city: address.city || previous.city,
        province: address.province || previous.province,
        zipCode
      }));
    } catch (error) {
      console.warn('Legacy order ZIP lookup failed:', error);
    }
  }, []);

  const handleLegacyLocationChange = useCallback((field, value) => {
    legacyAddressLookupSequence.current += 1;
    setManualOrderData((previous) => ({
      ...previous,
      [field]: value,
      // The previous zip belongs to the previous city/province pair.
      zipCode: ''
    }));
  }, []);

  useEffect(() => {
    if (!showManualOrderModal) return undefined;

    const city = String(manualOrderData.city || '').trim();
    const province = String(manualOrderData.province || '').trim();
    if (manualOrderData.zipCode || city.length < 3 || province.length < 3) return undefined;

    const timer = setTimeout(async () => {
      const lookupSequence = ++legacyAddressLookupSequence.current;
      try {
        const zipCode = await lookupPhilippineZipCodeByCityAndProvince(city, province);
        if (!zipCode || lookupSequence !== legacyAddressLookupSequence.current) return;

        setManualOrderData((previous) => {
          if (previous.zipCode || previous.city.trim() !== city || previous.province.trim() !== province) {
            return previous;
          }
          return { ...previous, zipCode };
        });
      } catch (error) {
        console.warn('Legacy order city/province ZIP lookup failed:', error);
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [manualOrderData.city, manualOrderData.province, manualOrderData.zipCode, showManualOrderModal]);

  useEffect(() => {
    return loadPrintResources();
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
    if (!isAdminMode || finalizedOrderScrubStarted.current) return undefined;
    finalizedOrderScrubStarted.current = true;
    scrubFinalizedOrders().catch((error) => {
      console.error('SG LOG: Completed/cancelled order shipping scrub failed:', error);
    });
    return undefined;
  }, [isAdminMode, scrubFinalizedOrders]);

  useEffect(() => {
    if (selectedOrder) {
      setTrackingRef(selectedOrder.trackingNo || '');
      setCustomerTrackingLink(selectedOrder.customerTrackingLink || selectedOrder.trackingLink || '');
      const meetupSchedule = selectedOrder.meetupSchedule || {};
      const configuredMeetupStart = normalizeTimeValue(shippingSettings?.pickupDetails?.meetup?.meetupStartTime);
      setMeetupDate(
        meetupSchedule.date
        || selectedOrder.meetupPreferredDate
        || selectedOrder.fulfillmentAvailableDate
        || ''
      );
      setMeetupStartTime(
        normalizeTimeValue(meetupSchedule.startTime || selectedOrder.meetupPreferredStartTime)
        || configuredMeetupStart
        || '09:00'
      );
      setClaimantBalance(selectedOrder.claimantBalance || '');
      setShippingFeeInput(selectedOrder.shippingFee ?? '');
    }
  }, [selectedOrder, shippingSettings?.pickupDetails?.meetup?.meetupStartTime]);

  useEffect(() => {
    const address = getLegacyOrderAddress(selectedOrder);
    if (!selectedOrder || !isLegacyOrderRecord(selectedOrder) || !address.zipCode) return undefined;

    const storedLat = Number(selectedOrder.receiverDetails?.lat);
    const storedLng = Number(selectedOrder.receiverDetails?.lng);
    if (Number.isFinite(storedLat) && Number.isFinite(storedLng)) {
      return undefined;
    }

    let isActive = true;
    lookupPhilippineAddressByZipCode(address.zipCode)
      .then((result) => {
        if (!isActive || !Number.isFinite(result?.lat) || !Number.isFinite(result?.lng)) return;
        setLegacyZipCoordinates({ orderId: selectedOrder.id, lat: result.lat, lng: result.lng });
      })
      .catch((error) => {
        console.warn('Legacy order ZIP map lookup failed:', error);
      });

    return () => {
      isActive = false;
    };
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
    
    const visibleOrders = isAdminMode
      ? orders
      : orders.filter((order) => !isLegacyOrderRecord(order));

    return [...visibleOrders].sort((a, b) => {
      const getMs = (val) => { 
        if (!val) return 0; 
        if (typeof val === 'object' && val.seconds) return val.seconds * 1000; 
        const d = new Date(val); 
        return isNaN(d.getTime()) ? 0 : d.getTime(); 
      };
      return getMs(b.createdAt) - getMs(a.createdAt);
    });
  }, [isAdminMode, orders]);

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
    const flags = getShippingFlags(order, shippingSettings);
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
  }, [shippingSettings]);

  const getTargetTabForOrder = useCallback((order, patch = {}) => {
    if (!order) return null;
    const nextOrder = { ...order, ...patch };
    const status = nextOrder.status;
    const requiresBranchPayment = getShippingFlags(nextOrder, shippingSettings).requiresCourierBranch;
    const balance = calculateBalance(nextOrder);
    const isProject = nextOrder.type === 'project' || nextOrder.items?.some(i => i.type === 'project');

    if (status === 'Cancelled') return 'cancelled';
    if (status === 'Completed') return 'completed';
    if (isSecondPaymentPending(nextOrder)) return isAdminMode ? 'to_validate' : 'to_pay';
    if (!isOrderInitialPaymentValidated(nextOrder)) return isAdminMode ? 'to_validate' : 'to_pay';
    if (status === 'Waiting') return 'to_follow';
    if (['Shipped', 'Dispatched', 'In Transit'].includes(status)) return 'to_receive';
    
    // In Progress for projects with balance under preparing/ready/etc
    if (isProject && balance > 0 && ['Preparing', 'Ready for Pickup', 'Ready for Meetup', 'To Ship'].includes(status)) {
      return 'to_follow';
    }

    if (['Reserved', 'Validating'].includes(status)) return isAdminMode ? 'to_validate' : 'to_pay';
    if (status === 'Arrived' && !requiresBranchPayment && balance > 0) return isAdminMode ? 'to_validate' : 'to_pay';
    // Full-payment orders with balance requested (incomplete payment) — show in validation/payment tab
    if (nextOrder.balanceRequested && balance > 0 && !nextOrder.balanceReceipt && ['Preparing'].includes(status)) return isAdminMode ? 'to_validate' : 'to_pay';

    if (['Preparing', 'Ready for Pickup', 'Ready for Meetup', 'To Ship'].includes(status)) {
      if (requiresBranchPayment || balance <= 0 || (nextOrder.paymentPlan === 'partial' && !isProject)) {
        return 'to_ship';
      }
    }
    if (status === 'Arrived' && (requiresBranchPayment || balance <= 0)) return 'to_ship';

    return null;
  }, [calculateBalance, isAdminMode, shippingSettings]);

  const moveOrderToTargetTab = useCallback((order, patch = {}) => {
    const targetTab = getTargetTabForOrder(order, patch);
    if (targetTab) setActiveTab(targetTab);
  }, [getTargetTabForOrder]);

  const notificationOrderId = location.state?.openOrderId;

  useEffect(() => {
    if (routeOrderId || !notificationOrderId || orders.length === 0) return;
    const notificationOrder = orders.find((order) => (
      String(order.id || '') === String(notificationOrderId)
      || String(order.orderId || '') === String(notificationOrderId)
    ));
    if (!notificationOrder) return;

    moveOrderToTargetTab(notificationOrder);
    setSelectedOrder(notificationOrder);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    navigate(`/orders/${encodeURIComponent(notificationOrder.orderId || notificationOrder.id)}`, { replace: true, state: null });
  }, [isAdminMode, location.pathname, moveOrderToTargetTab, navigate, notificationOrderId, orders, routeOrderId]);

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
      isAdminMode || (!isLegacyOrderRecord(routeOrder) && routeOrder.userId === user.uid)
    ));

    if (!canViewRouteOrder) {
      navigate('/orders', { replace: true });
      return;
    }

    moveOrderToTargetTab(routeOrder);
    setSelectedOrder(routeOrder);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
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

  const legacyProjectChoices = useMemo(() => {
    const choices = [];
    const seen = new Set();

    const addProjectChoice = (rawProject, source) => {
      if (!rawProject) return;
      const rawData = rawProject?.projectData && typeof rawProject.projectData === 'object'
        ? rawProject.projectData
        : rawProject;
      const isPrintedProduct = rawProject?.productType === 'printed-project'
        || rawData?.productType === 'printed-project'
        || rawProject?.isPrintedProject === true;
      const projectData = isPrintedProduct
        ? (() => {
          const { images: _images, stocks: _stocks, ...compactPrintedProject } = rawData;
          return {
            ...compactPrintedProject,
            projectName: getProjectName(rawProject),
            productType: 'printed-project',
            method: { name: '3D PRINTED' }
          };
        })()
        : rawData;
      const type = getProjectType({ ...rawProject, projectData });
      const identity = String(
        rawProject?.vaultId
          || rawProject?.id
          || rawProject?.adminShelfBasketId
          || `${source}:${getProjectName({ ...rawProject, projectData })}:${type}`
      );
      const key = `${type}:${identity}`;
      if (seen.has(key)) return;
      seen.add(key);

      const imageSource = projectData?.image || rawProject?.image;
      const image = typeof imageSource === 'string'
        ? (resolveImage(imageSource, projectData?.images || rawProject?.images) || '/snorlaxgarage.png')
        : '/snorlaxgarage.png';
      const projectItem = { ...rawProject, projectData };
      const capital = getProjectCapitalCost(projectItem);
      const revenue = getProjectRevenue(projectItem);

      choices.push({
        kind: 'project',
        projectId: identity,
        projectData,
        name: getProjectName(projectItem),
        image,
        type,
        originalPrice: Math.max(0, revenue),
        capitalPrice: capital,
        meta: [type, source, capital !== null ? `CAPITAL ₱${capital.toLocaleString()}` : 'CAPITAL NOT RECORDED']
          .filter(Boolean)
          .join(' • ')
      });
    };

    (blueprints || []).forEach((project) => addProjectChoice(project, 'BLUEPRINT'));
    (projectVault || []).forEach((project) => addProjectChoice(project, 'VAULT'));
    (shelf || []).filter((item) => item?.type === 'project' || item?.projectData).forEach((project) => addProjectChoice(project, 'SHELF'));
    (printedProjects || []).forEach((project) => addProjectChoice(project, 'CATALOG'));
    return choices;
  }, [blueprints, printedProjects, projectVault, shelf]);

  const filteredLegacyStockChoices = useMemo(() => {
    const search = String(manualOrderData.search || '').trim().toLowerCase();
    const matches = search
      ? legacyStockChoices.filter(({ kit, stock }) => (
        [kit.name, kit.brand, kit.specs?.line, kit.specs?.scale, stock.status, getStockEta(stock)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(search)
      ))
      : legacyStockChoices;

    const orderedMatches = search
      ? matches
        .map((choice, index) => ({ choice, index }))
        .sort((a, b) => {
          const costDelta = Number(b.choice.stock?.costPrice || 0) - Number(a.choice.stock?.costPrice || 0);
          if (costDelta !== 0) return costDelta;
          return a.index - b.index;
        })
        .map(({ choice }) => choice)
      : matches;

    return orderedMatches.slice(0, 24);
  }, [legacyStockChoices, manualOrderData.search]);

  const filteredLegacyProjectChoices = useMemo(() => {
    const search = String(manualOrderData.search || '').trim().toLowerCase();
    const matches = search
      ? legacyProjectChoices.filter((choice) => (
        [choice.name, choice.type, choice.meta, choice.projectData?.method?.name, choice.projectData?.projectName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(search)
      ))
      : legacyProjectChoices;

    return matches
      .map((choice, index) => ({ choice, index }))
      .sort((a, b) => {
        const typeDelta = a.choice.type.localeCompare(b.choice.type);
        return typeDelta || a.index - b.index;
      })
      .map(({ choice }) => choice)
      .slice(0, 24);
  }, [legacyProjectChoices, manualOrderData.search]);

  const legacyShippingOptions = useMemo(() => Object.entries(shippingSettings?.shippingMethods || {})
    .filter(([, config]) => config !== false && config?.active !== false)
    .map(([key]) => key), [shippingSettings]);

  const legacyShippingConfig = useMemo(() => (
    shippingSettings?.shippingMethods?.[manualOrderData.shippingMethod] || {}
  ), [shippingSettings?.shippingMethods, manualOrderData.shippingMethod]);
  const legacySuboptions = useMemo(() => Object.entries(legacyShippingConfig.suboptions || {})
    .filter(([, config]) => config !== false && config?.active !== false), [legacyShippingConfig]);
  const isLegacySelfPickup = isSelfPickupShippingMethod(manualOrderData.shippingMethod);
  const isLegacySellerMeetup = isSellerMeetupShippingMethod(manualOrderData.shippingMethod);
  const actualPinPickupPoint = useMemo(() => (
    isLegacySelfPickup ? getConfiguredPickupPoint(shippingSettings, 'actual-pin') : null
  ), [isLegacySelfPickup, shippingSettings]);
  const sellerMeetupPoint = useMemo(() => {
    if (!isLegacySellerMeetup) return null;
    const places = (shippingSettings?.pickupDetails?.meetup?.places || [])
      .filter(place => place?.isActive !== false);
    return places.find(place => place?.pickupAddressMode === 'actual-pin') || places[0] || null;
  }, [isLegacySellerMeetup, shippingSettings]);
  const configuredLegacyAddressPoint = actualPinPickupPoint || sellerMeetupPoint;
  const legacyAutoAddressPoint = configuredLegacyAddressPoint
    && [configuredLegacyAddressPoint.city, configuredLegacyAddressPoint.province, configuredLegacyAddressPoint.zipCode].some(Boolean)
    ? configuredLegacyAddressPoint
    : null;
  const legacyHandlingFee = useMemo(() => {
    if (!manualOrderData.shippingMethod) return 0;

    const handlingEnabled = shouldChargeHandlingFee(
      shippingSettings?.shippingMethods,
      manualOrderData.shippingMethod,
      manualOrderData.shippingSuboption || null
    );
    if (!handlingEnabled) return 0;

    const configuredFee = shippingSettings?.paymentSettings?.handlingFee
      ?? shippingSettings?.pickupDetails?.handlingFee
      ?? 0;
    return Math.max(0, Number(configuredFee) || 0);
  }, [manualOrderData.shippingMethod, manualOrderData.shippingSuboption, shippingSettings]);
  const legacyItemTotal = Math.max(0, Number(manualOrderData.buyerPaid || 0) - legacyHandlingFee);
  const legacyFinancials = useMemo(() => (
    calculateLegacyFinancials(Number(manualOrderData.buyerPaid || 0), manualOrderData.selectedItems, kits)
  ), [kits, manualOrderData.buyerPaid, manualOrderData.selectedItems]);
  // Retained only while the former compact manual-order markup remains disabled below.
  const availableStocks = [];

  useEffect(() => {
    if (!showManualOrderModal || (!isLegacySelfPickup && !isLegacySellerMeetup) || !legacyAutoAddressPoint) return undefined;

    let isActive = true;
    const fillLegacyLocalAddress = async () => {
      let city = String(legacyAutoAddressPoint.city || '').trim();
      let province = String(legacyAutoAddressPoint.province || '').trim();
      let zipCode = String(legacyAutoAddressPoint.zipCode || '').trim();

      if ((!city || !province) && zipCode) {
        const address = await lookupPhilippineAddressByZipCode(zipCode);
        city = city || String(address?.city || '').trim();
        province = province || String(address?.province || '').trim();
      }
      if (!zipCode && city && province) {
        zipCode = await lookupPhilippineZipCodeByCityAndProvince(city, province);
      }
      if (!isActive) return;

      setManualOrderData((previous) => {
        const next = {
          ...previous,
          city,
          province,
          zipCode
        };
        if (previous.city === city && previous.province === province && previous.zipCode === zipCode) {
          return previous;
        }
        return next;
      });
    };

    fillLegacyLocalAddress().catch((error) => {
      console.warn('Legacy local-order address fill failed:', error);
    });

    return () => {
      isActive = false;
    };
  }, [isLegacySelfPickup, isLegacySellerMeetup, legacyAutoAddressPoint, showManualOrderModal]);

  const handleLegacyShippingMethodChange = useCallback((event) => {
    const shippingMethod = event.target.value;
    setManualOrderData((previous) => ({
      ...previous,
      shippingMethod,
      shippingSuboption: '',
      ...(isSelfPickupShippingMethod(shippingMethod) || isSellerMeetupShippingMethod(shippingMethod) ? {
        city: '',
        province: '',
        zipCode: ''
      } : {})
    }));
  }, []);

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
      trackingNoConfirmed: true,
      claimantBalance: claimantBalance,
      shippingFee: selectedShippingFlags.isFreeShipping ? 0 : (Number(shippingFeeInput) || 0),
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
      await updateOrderDetails(selectedOrder.id, {
        customerTrackingLink: trackingInfo,
        customerTrackingLinkConfirmed: true
      });
      alert("Courier tracking information saved!");
      setSelectedOrder(prev => ({
        ...prev,
        customerTrackingLink: trackingInfo,
        customerTrackingLinkConfirmed: true
      }));
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
        }, INVALID_ORDER_DELETE_WINDOW_MS);
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
        const completedPatch = { status: 'Completed', completedAt: new Date().toISOString() };
        moveOrderToTargetTab(selectedOrder, completedPatch);
        setSelectedOrder(prev => ({ ...prev, ...completedPatch }));
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
    const handlingFeePaid = legacyHandlingFee;
    const itemRevenue = Math.max(0, totalPaid - handlingFeePaid);
    if (!selectedItems.length || !manualOrderData.shippingMethod || !manualOrderData.city.trim() || !manualOrderData.province.trim() || !/^\d{4}$/.test(manualOrderData.zipCode.trim()) || totalPaid < handlingFeePaid) {
      alert('Add at least one stock, complete the city/province/4-digit ZIP address, and make sure total paid covers the handling fee.');
      return;
    }
    const liveItems = selectedItems.map((entry) => {
      if (entry.kind === 'project') {
        return {
          ...entry,
          originalPrice: Math.max(0, Number(entry.originalPrice || 0)),
          capitalPrice: hasRecordedAmount(entry.capitalPrice) ? Math.max(0, Number(entry.capitalPrice)) : null
        };
      }

      const kit = (kits || []).find((candidate) => candidate.id === entry.kitId);
      const stock = kit?.stocks?.[entry.stockKey];
      if (!kit || !stock || stock.order?.orderId || stock.isReserved || collectionStockIds.has(`${entry.kitId}:${entry.stockKey}`)) {
        throw new Error(`${entry.name || 'A selected item'} is no longer available.`);
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
    const transactionFinancials = calculateLegacyFinancials(totalPaid, allocatedItems.map((entry) => (
      entry.kind === 'project'
        ? { ...entry, type: 'project', costPrice: entry.capitalPrice, projectData: entry.projectData }
        : { ...entry, costPrice: entry.stock.costPrice }
    )), kits);

    const orderId = generateSgOrderId(orders);
    const suboption = legacyShippingConfig?.suboptions?.[manualOrderData.shippingSuboption];
    const shippingMethod = manualOrderData.shippingSuboption
      ? `${manualOrderData.shippingMethod} (${suboption?.label || manualOrderData.shippingSuboption})`
      : manualOrderData.shippingMethod;
    const createdTime = new Date().toISOString();
    const orderItems = await Promise.all(allocatedItems.map(async (entry) => {
      if (entry.kind === 'project') {
        const projectData = {
          ...(entry.projectData || {}),
          sellPrice: entry.originalPrice,
          displayPrice: entry.originalPrice,
          capitalCost: entry.capitalPrice
        };
        return {
          id: entry.projectId,
          name: entry.name,
          price: entry.allocatedPrice,
          sellPrice: entry.allocatedPrice,
          originalSellPrice: entry.originalPrice,
          costPrice: entry.capitalPrice,
          capitalCost: entry.capitalPrice,
          projectType: entry.type,
          projectData,
          type: 'project',
          quantity: 1,
          image: entry.image
        };
      }

      const { kit, stock, stockKey, originalPrice, allocatedPrice } = entry;
      const gridImage = resolveGridImage(kit);
      const image = isEmbeddedImage(gridImage)
        ? await compressImage(gridImage, 640, 640, 0.65)
        : gridImage;

      return {
        id: kit.id,
        name: `${kit.brand || ''} ${kit.specs?.line || ''} ${kit.name || ''}`.trim(),
        price: allocatedPrice,
        sellPrice: allocatedPrice,
        originalSellPrice: originalPrice,
        costPrice: hasRecordedAmount(stock.costPrice) ? Math.max(0, Number(stock.costPrice)) : null,
        kitDetails: getLegacyKitDetails(kit),
        stockDetails: getLegacyStockDetails(stock, stockKey),
        brand: kit.brand || '',
        series: kit.series || '',
        specs: { ...(kit.specs || {}) },
        boxCondition: stock.boxCondition || '',
        kitCondition: stock.kitCondition || '',
        issue: stock.issue || '',
        issueDescription: stock.issueDescription || '',
        quantity: 1,
        image,
        stockKey,
        status: stock.status || 'ONHAND',
         type: 'kit'
       };
       }));

    let legacyOrderZipCoordinates = {};
    try {
      const zipAddress = await lookupPhilippineAddressByZipCode(manualOrderData.zipCode);
      if (Number.isFinite(zipAddress?.lat) && Number.isFinite(zipAddress?.lng)) {
        legacyOrderZipCoordinates = { lat: zipAddress.lat, lng: zipAddress.lng };
      }
    } catch (error) {
      console.warn('Legacy order ZIP map lookup failed during creation:', error);
    }

    const orderData = {
      orderId,
      userId: user?.uid,
      legacyOrder: true,
      isManualOrder: false,
      orderSource: 'legacy',
      items: orderItems,
      kitId: allocatedItems[0]?.kit?.id,
      productId: allocatedItems[0]?.kit?.id,
      selectedStockKey: allocatedItems[0]?.stockKey,
      item: allocatedItems.map((entry) => entry.kind === 'project' ? entry.name : entry.kit.name).join(', '),
      // Legacy sales are historical transactions, so they are complete as
      // soon as they are recorded. Admins can still reverse them while the
      // completed-order reversal window is open.
      status: 'Completed',
      completedAt: createdTime,
      isPreOrder: allocatedItems.some((entry) => entry.kind !== 'project' && String(entry.stock.status).toUpperCase() === 'PRE-ORDER'),
      shippingMethodKey: manualOrderData.shippingMethod,
      shippingSuboptionKey: manualOrderData.shippingSuboption || null,
      shippingMethod,
       receiverDetails: {
         city: manualOrderData.city.trim(),
         province: manualOrderData.province.trim(),
         zipCode: manualOrderData.zipCode.trim(),
         ...legacyOrderZipCoordinates
       },
      totalPrice: itemRevenue,
      subtotal: itemRevenue,
      price: itemRevenue,
      buyerPaid: totalPaid,
      paymentDueNow: 0,
      handlingFee: handlingFeePaid,
      installmentFee: 0,
      transferFee: 0,
      legacyFinancialsAvailable: transactionFinancials.available,
      legacyCapitalCost: transactionFinancials.capitalCost,
      legacyCapitalRegained: transactionFinancials.capitalRegained,
      legacyProfit: transactionFinancials.profit,
      date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      createdAt: createdTime
    };

    try {
      const docId = await createOrder(orderData);
      await Promise.all(allocatedItems
        .filter((entry) => entry.kind !== 'project')
        .map(({ kit, stockKey }) => (
          assignStockToOrder(kit.id, stockKey, orderId, { isLegacyOrder: true, legacyOrder: true, orderDocId: docId })
        )));
      setToastMessage(`Legacy order ${orderId} created.`);
      setShowManualOrderModal(false);
      setManualOrderData(getEmptyLegacyOrderData());
    } catch (error) {
      console.error('SG LOG: Legacy order creation failed:', error);
      alert(error?.message || 'Could not create the legacy order.');
    }
  };

  const handleCopyTrackingValue = useCallback(async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setToastMessage('Tracking number copied.');
    } catch (error) {
      console.error('SG LOG: Failed to copy tracking details:', error);
      setToastMessage('Could not copy tracking details.');
    }
  }, [setToastMessage]);

  const handleSaveMeetupSchedule = async () => {
    if (isAdminMode) {
      alert('Only the buyer may select the preferred meetup time.');
      return;
    }

    const meetupSettings = shippingSettings?.pickupDetails?.meetup || {};
    const windowStart = normalizeTimeValue(meetupSettings.meetupStartTime);
    const windowEnd = normalizeTimeValue(meetupSettings.meetupEndTime);
    const fallbackAvailableDate = toLocalDateKey(
      getNextAvailableDate(shippingSettings?.availabilitySchedule, 'shipping') || new Date()
    );
    const availableDate = selectedOrder?.fulfillmentAvailableDate
      || selectedOrder?.meetupPreferredDate
      || meetupDate
      || fallbackAvailableDate;
    const today = new Date();
    const todayKey = toLocalDateKey(today);
    const adminCanMeetupToday = toLocalDateKey(
      getNextAvailableDate(shippingSettings?.availabilitySchedule, 'shipping', today) || today
    ) === todayKey;
    const meetupTimeOptions = buildBuyerMeetupTimeOptions(
      windowStart,
      windowEnd,
      availableDate,
      adminCanMeetupToday,
      today
    );
    const selectedStartTime = meetupTimeOptions.includes(meetupStartTime)
      ? meetupStartTime
      : meetupTimeOptions[0] || '';
    const isReadyForMeetup = ['Ready for Meetup', 'Ready for Pickup'].includes(selectedOrder?.status);

    if (!selectedOrder || !isReadyForMeetup) {
      alert('Meetup time can be selected when the order is Ready for Meetup.');
      return;
    }

    if (!availableDate || !isMeetupTimeWithinWindow(selectedStartTime, windowStart, windowEnd)) {
      alert('Select a 15-minute meetup time within the configured meetup time window.');
      return;
    }

    const endTime = getEndTimeForWindow(selectedStartTime, 15);
    const meetupSchedule = {
      date: availableDate,
      startTime: selectedStartTime,
      endTime,
      durationMinutes: 15,
      confirmedAt: new Date().toISOString()
    };

    try {
      await updateOrderDetails(selectedOrder.id, {
        meetupSchedule,
        meetupPreferredDate: availableDate,
        meetupPreferredStartTime: selectedStartTime,
        meetupPreferredEndTime: endTime
      });
      setSelectedOrder(prev => ({
        ...prev,
        meetupSchedule,
        meetupPreferredDate: availableDate,
        meetupPreferredStartTime: selectedStartTime,
        meetupPreferredEndTime: endTime
      }));
      setToastMessage('Meetup window confirmed.');
    } catch (error) {
      console.error('SG LOG: Failed to save meetup schedule:', error);
      setToastMessage('Could not save the meetup window.');
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
  const handleConfirmPayment = async (order, skipConfirm = false, isBalanceReceipt = false) => {
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
      
      await updateOrderDetails(order.id, {
        ...extraFields,
        paymentReview: {
          decision: 'approved',
          receiptType: isBalanceReceipt ? 'balance' : (order.receipt ? 'initial' : 'cash'),
          reviewId: createPaymentReviewId(),
          reviewedAt: new Date().toISOString()
        }
      });
      
      await markOrderStocksReceiptValidated(order);
      
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
      } else if (isPreOrder) {
        newStatus = 'Waiting';
      } else {
        newStatus = getShippingFlags(order, shippingSettings).requiresCourierBranch ? 'To Ship' : 'Preparing';
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
      } else if (isPreOrder) {
        newStatus = 'Waiting';
      } else {
        // Full payment plan — partial payment received, status becomes Preparing
        newStatus = 'Preparing';
      }

      const extraFields = {
        status: newStatus,
        balanceRequested: true,
        balanceRequestedAt: new Date().toISOString(),
        paymentReview: {
          decision: 'balance_requested',
          receiptType: isBalance ? 'balance' : 'initial',
          reviewId: createPaymentReviewId(),
          reviewedAt: new Date().toISOString()
        }
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

  const markCompletedReversalExpired = useCallback((orderId) => {
    setCompletedReversalExpiredIds((previous) => {
      if (previous.has(orderId)) return previous;
      const next = new Set(previous);
      next.add(orderId);
      return next;
    });
  }, []);

  const handleReverseCompletedOrder = useCallback(async (orderId) => {
    if (!window.confirm('Reverse this completed order? The order will be cancelled and deleted, and its stock will be released back to public inventory.')) return;

    try {
      await reverseCompletedOrder(orderId);
      setToastMessage('Completed order reversed, deleted, and stock released.');
      if (selectedOrder?.id === orderId) closeSelectedOrder();
    } catch (error) {
      console.error('SG LOG: Failed to reverse completed order:', error);
      setToastMessage(error?.message || 'Could not reverse the completed order.');
    }
  }, [closeSelectedOrder, reverseCompletedOrder, selectedOrder?.id, setToastMessage]);

  const handleReverseLegacyOrder = useCallback(async (orderId) => {
    if (!window.confirm('Cancel and reverse this legacy transaction? The order will be deleted and its stock will be released back to public inventory.')) return;

    try {
      await reverseLegacyOrder(orderId);
      setToastMessage('Legacy transaction cancelled, reversed, and stock released.');
      if (selectedOrder?.id === orderId) closeSelectedOrder();
    } catch (error) {
      console.error('SG LOG: Failed to reverse legacy order:', error);
      setToastMessage(error?.message || 'Could not reverse the legacy transaction.');
    }
  }, [closeSelectedOrder, reverseLegacyOrder, selectedOrder?.id, setToastMessage]);

  const handleToggleLegacyCountdown = useCallback(async (order) => {
    if (!isAdminMode || !order || !isLegacyOrderRecord(order) || order.status !== 'Completed') return;

    const now = Date.now();
    const isPaused = order.legacyCountdownPaused === true;
    const remainingMs = isPaused
      ? Number(order.legacyCountdownRemainingMs)
      : getCompletedOrderReversalRemainingMs(order, now);

    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      markCompletedReversalExpired(order.id);
      setToastMessage('This completed legacy order is already a permanent record.');
      return;
    }

    const patch = isPaused
      ? {
          legacyCountdownPaused: false,
          legacyCountdownRemainingMs: null,
          legacyCountdownDeadline: new Date(now + remainingMs).toISOString()
        }
      : {
          legacyCountdownPaused: true,
          legacyCountdownRemainingMs: Math.ceil(remainingMs),
          legacyCountdownDeadline: new Date(now + remainingMs).toISOString()
        };

    try {
      await updateOrderDetails(order.id, patch);
      setSelectedOrder((previous) => (
        previous?.id === order.id ? { ...previous, ...patch } : previous
      ));
      setToastMessage(isPaused ? 'Legacy order countdown resumed.' : 'Legacy order countdown paused.');
    } catch (error) {
      console.error('SG LOG: Failed to toggle legacy countdown:', error);
      setToastMessage(error?.message || 'Could not update the legacy order countdown.');
    }
  }, [isAdminMode, markCompletedReversalExpired, setToastMessage, updateOrderDetails]);

  const isReadyForPickupStatus = (status) => ['Ready for Pickup', 'Ready for Meetup'].includes(status);
  const canShowExactPickupDetails = (order, paymentVerified) => {
    const flags = getShippingFlags(order);
    // Pickup-pin orders must keep showing the rate-checking address until the
    // order is released for pickup. Admin visibility must follow the same gate
    // so the actual pin is never exposed early.
    if (!flags.usesPickupPoint) return isAdminMode || paymentVerified;

    const actualPickupPoint = getConfiguredPickupPoint(shippingSettings, 'actual-pin');
    const hasActualPin = Boolean(
      actualPickupPoint && (actualPickupPoint.address || actualPickupPoint.lat || actualPickupPoint.lng)
      ||
      order?.pickupDetails?.exactAddress ||
      order?.pickupDetails?.exactLat ||
      order?.pickupDetails?.exactLng
    );

    return hasActualPin
      && order.status === 'Ready for Pickup'
      && (isAdminMode || paymentVerified);
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
    const isLegacyOrder = isLegacyOrderRecord(order);
    const legacyAddress = getLegacyOrderAddress(order);
    const addressParts = [rd.houseNo, rd.houseDetails, rd.subdivision, rd.barangay, rd.city, rd.province, rd.zipCode].filter(Boolean);
    // Admin always sees the exact pickup point. Customers only see it after all validated payments clear the balance.
    const paymentVerified = hasValidatedFirstReceipt(order) && calculateBalance(order) <= 0;
    const showExactAddress = canShowExactPickupDetails(order, paymentVerified);
    const actualPickupPoint = showExactAddress
      ? getConfiguredPickupPoint(shippingSettings, 'actual-pin')
      : null;
    const configuredExactAddress = getConfiguredPickupAddress(actualPickupPoint);
    const rawPickupAddress = showExactAddress
      ? (configuredExactAddress || order?.pickupDetails?.exactAddress || order?.pickupDetails?.publicAddress || order?.pickupLocation)
      : (order?.pickupDetails?.publicAddress || order?.pickupLocation);

    const pickupLandmark = flags.usesPickupPoint
      ? (actualPickupPoint?.landmark || order?.pickupDetails?.label || rd.landmark || '')
      : '';
    const pickupLandmarkCandidates = [
      actualPickupPoint?.landmark,
      order?.pickupDetails?.label,
      rd.landmark
    ].filter(Boolean);
    const pickupAddressWithoutLandmark = pickupLandmarkCandidates.reduce(
      (address, landmark) => stripPickupLandmark(address, landmark),
      rawPickupAddress
    );
    const pickupAddress = addPickupStreetSuffix(pickupAddressWithoutLandmark, pickupLandmark);

    const location = isLegacyOrder
      ? [legacyAddress.city, legacyAddress.province, legacyAddress.zipCode].filter(Boolean).join(', ')
      : flags.isBranchDropoff && (rd.lbcBranch || order?.lbcBranch || rd.branch || order?.branch)
      ? (rd.lbcBranch || order?.lbcBranch)
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
      landmark: pickupLandmark || rd.landmark || '',
      lat: (showExactAddress ? (actualPickupPoint?.lat || order?.pickupDetails?.exactLat) : null) || rd.lat || order?.pickupDetails?.lat || null,
      lng: (showExactAddress ? (actualPickupPoint?.lng || order?.pickupDetails?.exactLng) : null) || rd.lng || order?.pickupDetails?.lng || null,
      lbcBranch: rd.lbcBranch
    };
  };

  const getOrderTotals = (order) => {
    const flags = getShippingFlags(order, shippingSettings);
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
    const requiresBranchPayment = (o) => getShippingFlags(o, shippingSettings).requiresCourierBranch;
    const baseTabs = (isAdminMode ? [
      { id: 'to_validate', label: 'To Validate', filter: (o) => (!['Cancelled', 'Completed'].includes(o.status) && (!isOrderInitialPaymentValidated(o) || isSecondPaymentPending(o))) || o.status === 'Validating' || (!requiresBranchPayment(o) && calculateBalance(o) > 0 && o.status === 'Arrived') || (calculateBalance(o) > 0 && o.status === 'Reserved') || (o.balanceRequested && calculateBalance(o) > 0 && !o.balanceReceipt && o.status === 'Preparing') },
      { id: 'to_follow', label: 'In Progress', filter: (o) => {
        if (!isOrderInitialPaymentValidated(o) || isSecondPaymentPending(o)) return false;
        if (o.status === 'Waiting') return true;
        // Project na may balance at nasa process/queue (Preparing/Ready/etc)
        const isProject = o.type === 'project' || o.items?.some(i => i.type === 'project');
        if (isProject && ['Preparing', 'Ready for Pickup', 'Ready for Meetup', 'To Ship'].includes(o.status)) {
          return calculateBalance(o) > 0;
        }
        return false;
      }},
      { id: 'to_ship', label: 'To Ship', filter: (o) => {
        if (!isOrderInitialPaymentValidated(o) || isSecondPaymentPending(o)) return false;
        if (['Preparing', 'Ready for Pickup', 'Ready for Meetup', 'To Ship'].includes(o.status)) {
          // Branch-payment options, fully paid orders, and partial kit plans can move to shipping.
          const isProject = o.type === 'project' || o.items?.some(i => i.type === 'project');
          return requiresBranchPayment(o) || calculateBalance(o) <= 0 || (o.paymentPlan === 'partial' && !isProject);
        }
        if (o.status === 'Arrived') return requiresBranchPayment(o) || calculateBalance(o) <= 0;
        return false;
      }},
      { id: 'to_receive', label: 'To Receive', filter: (o) => o.status === 'Shipped' || o.status === 'Dispatched' || o.status === 'In Transit' },
      { id: 'completed', label: 'Completed', filter: (o) => o.status === 'Completed' },
      { id: 'cancelled', label: 'Cancelled', filter: (o) => o.status === 'Cancelled' }
    ] : [
      { id: 'to_pay', label: 'To Pay', filter: (o) => (!['Cancelled', 'Completed'].includes(o.status) && (!isOrderInitialPaymentValidated(o) || isSecondPaymentPending(o))) || o.status === 'Reserved' || o.status === 'Validating' || (!requiresBranchPayment(o) && calculateBalance(o) > 0 && o.status === 'Arrived') || (o.balanceRequested && calculateBalance(o) > 0 && !o.balanceReceipt && o.status === 'Preparing') },
      { id: 'to_follow', label: 'In Progress', filter: (o) => {
        if (!isOrderInitialPaymentValidated(o) || isSecondPaymentPending(o)) return false;
        if (o.status === 'Waiting') return true;
        const isProject = o.type === 'project' || o.items?.some(i => i.type === 'project');
        if (isProject && ['Preparing', 'Ready for Pickup', 'Ready for Meetup', 'To Ship'].includes(o.status)) {
          return calculateBalance(o) > 0;
        }
        return false;
      }},
      { id: 'to_ship', label: 'To Ship', filter: (o) => {
        if (!isOrderInitialPaymentValidated(o) || isSecondPaymentPending(o)) return false;
        if (['Preparing', 'Ready for Pickup', 'Ready for Meetup', 'To Ship'].includes(o.status)) {
          const isProject = o.type === 'project' || o.items?.some(i => i.type === 'project');
          return requiresBranchPayment(o) || calculateBalance(o) <= 0 || (o.paymentPlan === 'partial' && !isProject);
        }
        if (o.status === 'Arrived') return requiresBranchPayment(o) || calculateBalance(o) <= 0;
        return false;
      }},
      { id: 'to_receive', label: 'To Receive', filter: (o) => o.status === 'Shipped' || o.status === 'Dispatched' || o.status === 'In Transit' },
      { id: 'completed', label: 'Completed', filter: (o) => o.status === 'Completed' },
      { id: 'cancelled', label: 'Cancelled', filter: (o) => o.status === 'Cancelled' }
    ]);
    return baseTabs.map(t => ({ ...t, orders: sortedOrders.filter(t.filter) }));
  }, [sortedOrders, isAdminMode, calculateBalance, shippingSettings]);

  useEffect(() => { 
    if (!isLoading && tabData.length > 0 && !tabData.find(t => t.id === activeTab)) {
      setActiveTab(tabData[0].id);
    }
  }, [tabData, activeTab, isLoading]);

  const activeTabData = tabData.find((tab) => tab.id === activeTab) || tabData[0];
  const visibleOrders = activeTabData?.orders || [];
  const visibleInvalidOrders = visibleOrders.filter(order => order.isMaintenanceOrder && !isLegacyOrderRecord(order));
  const orderRows = (() => {
    const validOrders = [];
    const invalidOrders = [];
    const legacyOrders = [];
    const rebalancingEligibleOrders = [];

    visibleOrders.forEach((order) => {
      if (activeTab === 'completed' && isRebalancingEligibleOrder(order)) {
        rebalancingEligibleOrders.push(order);
      } else if (isLegacyOrderRecord(order)) {
        legacyOrders.push(order);
      } else if (order.isMaintenanceOrder) {
        invalidOrders.push(order);
      } else {
        validOrders.push(order);
      }
    });

    const showSeparators = isAdminMode || invalidOrders.length > 0;

    return [
      ...(isAdminMode && rebalancingEligibleOrders.length > 0 ? [{ type: 'separator', key: 'rebalancing-eligible', label: 'Rebalancing Eligible' }] : []),
      ...rebalancingEligibleOrders.map((order) => ({ type: 'order', key: order.id, order })),
      ...(showSeparators && validOrders.length > 0 ? [{ type: 'separator', key: 'valid', label: 'Valid Orders' }] : []),
      ...validOrders.map((order) => ({ type: 'order', key: order.id, order })),
      ...(showSeparators && invalidOrders.length > 0 ? [{ type: 'separator', key: 'invalid', label: 'Invalid Orders' }] : []),
      ...invalidOrders.map((order) => ({ type: 'order', key: order.id, order })),
      ...(showSeparators && legacyOrders.length > 0 ? [{ type: 'separator', key: 'legacy', label: 'Legacy Orders' }] : []),
      ...legacyOrders.map((order) => ({ type: 'order', key: order.id, order }))
    ];
  })();
  const selectedShippingFlags = useMemo(() => (
    selectedOrder ? getShippingFlags(selectedOrder, shippingSettings) : {}
  ), [selectedOrder, shippingSettings]);
  const selectedIsSelfBooking = isOrderSelfBooking(selectedOrder, shippingSettings);
  const selectedPaymentFullyValidated = Boolean(
    selectedOrder && hasValidatedFirstReceipt(selectedOrder) && calculateBalance(selectedOrder) <= 0
  );
  const selectedLogistics = selectedOrder ? getBuyerAddressDetails(selectedOrder) : {};
  const selectedTotals = selectedOrder ? getOrderTotals(selectedOrder) : {};
  const selectedLegacyFinancials = selectedOrder ? getLegacyOrderFinancials(selectedOrder, kits) : null;
  const isSelectedLegacyOrder = isLegacyOrderRecord(selectedOrder);
  const selectedShippingMethodKey = String(selectedOrder?.shippingMethodKey || '').trim();
  const selectedShippingMethod = selectedShippingMethodKey
    || String(selectedOrder?.shippingMethod || '').replace(/\s*\([^)]*\)/g, '').split(':')[0].trim();
  const selectedShippingSuboptionKey = String(selectedOrder?.shippingSuboptionKey || '').trim();
  const selectedShippingSuboption = shippingSettings?.shippingMethods?.[selectedShippingMethodKey]
    ?.suboptions?.[selectedShippingSuboptionKey]?.label
    || selectedShippingSuboptionKey
    || String(selectedOrder?.shippingMethod || '').match(/\(([^)]*)\)/)?.[1]?.trim()
    || 'N/A';
  const selectedShippingMethodDisplay = [
    selectedShippingMethod,
    selectedShippingSuboption !== 'N/A' ? selectedShippingSuboption : ''
  ].filter(Boolean).join(' - ') || 'N/A';
  const shippingFeeDisplayTextOrder = useMemo(() => {
    if (!selectedOrder) return 'Not Included';
    if (selectedShippingFlags.isFreeShipping) return 'FREE SHIPPING';
    if (selectedShippingFlags.isSelfPickup || selectedShippingFlags.isMeetup || selectedShippingFlags.isSelfBooking) {
      return 'Not Included';
    }

    const methodKey = selectedShippingMethodKey || selectedShippingMethod;
    const subKey = selectedShippingSuboptionKey;
    const methodConfig = shippingSettings?.shippingMethods?.[methodKey];
    const subConfig = methodConfig?.suboptions?.[subKey];

    let activeOptionFields = [];
    if (subConfig && Array.isArray(subConfig.requiredFields)) {
      activeOptionFields = subConfig.requiredFields;
    } else if (methodConfig?.suboptions && Object.keys(methodConfig.suboptions).length > 0) {
      activeOptionFields = Array.isArray(subConfig?.requiredFields) ? subConfig.requiredFields : [];
    } else if (Array.isArray(methodConfig?.requiredFields)) {
      activeOptionFields = methodConfig.requiredFields;
    }

    // Pay on Pickup: STRICTLY ONLY when the courier option requires Courier branch (field 13)
    const requiresCourierBranch = activeOptionFields.includes(13);

    if (requiresCourierBranch) {
      return 'Pay on Pickup';
    }

    // All other couriers default to Pay on Delivery
    return 'Pay on Delivery';
  }, [
    selectedOrder,
    selectedShippingFlags,
    selectedShippingMethod,
    selectedShippingMethodKey,
    selectedShippingSuboptionKey,
    shippingSettings?.shippingMethods
  ]);

  const isSelectedSellerMeetup = Boolean(
    selectedShippingFlags.isMeetup && isSellerMeetupShippingMethod(selectedShippingMethodDisplay)
  );
  const meetupSettings = shippingSettings?.pickupDetails?.meetup || {};
  const meetupWindowStart = normalizeTimeValue(meetupSettings.meetupStartTime);
  const meetupWindowEnd = normalizeTimeValue(meetupSettings.meetupEndTime);
  const meetupWindowConfigured = Boolean(
    meetupWindowStart
    && meetupWindowEnd
    && timeToMinutes(meetupWindowEnd) - timeToMinutes(meetupWindowStart) >= 15
  );
  const meetupReady = Boolean(
    !isAdminMode
    && isSelectedSellerMeetup
    && ['Ready for Meetup', 'Ready for Pickup'].includes(selectedOrder?.status)
  );
  const meetupOrderReady = Boolean(
    isSelectedSellerMeetup
    && ['Ready for Meetup', 'Ready for Pickup'].includes(selectedOrder?.status)
  );
  const currentMeetupDate = selectedOrder?.meetupSchedule?.date
    || selectedOrder?.fulfillmentAvailableDate
    || selectedOrder?.meetupPreferredDate
    || meetupDate
    || toLocalDateKey(getNextAvailableDate(shippingSettings?.availabilitySchedule, 'shipping') || new Date());
  const meetupToday = new Date();
  const meetupTodayKey = toLocalDateKey(meetupToday);
  const adminCanMeetupToday = toLocalDateKey(
    getNextAvailableDate(shippingSettings?.availabilitySchedule, 'shipping', meetupToday) || meetupToday
  ) === meetupTodayKey;
  const meetupTimeOptions = buildBuyerMeetupTimeOptions(
    meetupWindowStart,
    meetupWindowEnd,
    currentMeetupDate,
    adminCanMeetupToday,
    meetupToday
  );
  const selectedMeetupStartTime = meetupTimeOptions.includes(meetupStartTime)
    ? meetupStartTime
    : meetupTimeOptions[0] || '';
  const meetupTimeIsValid = isMeetupTimeWithinWindow(
    selectedMeetupStartTime,
    meetupWindowStart,
    meetupWindowEnd
  );
  const selectedPrintingProjects = (selectedOrder?.items || []).filter((item) => (
    item?.type === 'project'
    && String(item?.projectData?.method?.name || '').trim().toUpperCase() === 'STL'
  ));
  const isSelectedPrintingSelfPickup = Boolean(selectedShippingFlags.isSelfPickup && selectedPrintingProjects.length > 0);
  const selectedTracking = getConfirmedTrackingValue(selectedOrder);
  const canCopyOrOpenTracking = Boolean(
    selectedTracking.value
    && ((selectedTracking.source === 'admin' && !isAdminMode)
      || (selectedTracking.source === 'customer' && isAdminMode))
  );
  const hasStlWithDesignService = selectedOrder?.items?.some(item => 
    item.type === 'project' && 
    item.projectData?.method?.name?.toUpperCase() === 'STL' && 
    item.projectData?.selectedDesignService
  );
  const canCustomerCancel = Boolean(selectedOrder && !isAdminMode && !selectedOrder.receipt && !['Cancelled', 'Completed'].includes(selectedOrder.status));
  const canAdminCancel = Boolean(selectedOrder && isAdminMode && !['Cancelled', 'Completed'].includes(selectedOrder.status));
  const isSelectedResOrPartial = selectedOrder && (['reservation', 'partial'].includes(String(selectedOrder.paymentPlan || '').toLowerCase()) || selectedOrder.isReservation || selectedOrder.isPartial);
  const showPaymentQr = Boolean(selectedOrder && selectedTotals.balance > 0 && (isSelectedResOrPartial ? true : (!isAdminMode && !selectedOrder.receipt)));
  // isMaintenanceOrder is stored on the order itself — stays true even after maintenance is lifted
  const isOrderFromMaintenance = Boolean(selectedOrder?.isMaintenanceOrder);
  const brandLogoUrl = garageInfo?.logoURL || '/facebook-page-fallback.png';
  const selectedMethodQr = getMethodQr(selectedOrder?.paymentMethod);
  const qrImageSrc = isOrderFromMaintenance ? brandLogoUrl : selectedMethodQr;
  const showQrContainer = showPaymentQr && (selectedOrder?.paymentMethod !== 'Cash' || isOrderFromMaintenance) && qrImageSrc;

  const renderOrderDetailView = () => {
    if (!selectedOrder) return null;

    const isFinalizedOrder = ['completed', 'cancelled'].includes(String(selectedOrder.status || '').toLowerCase());
    const completedAddress = [
      selectedOrder.receiverDetails?.city
        || selectedOrder.receiverDetails?.town
        || selectedOrder.city
        || selectedOrder.town,
      selectedOrder.receiverDetails?.province || selectedOrder.province,
      selectedOrder.receiverDetails?.zipCode
        || selectedOrder.receiverDetails?.zip
        || selectedOrder.zipCode
        || selectedOrder.zip
    ].filter(Boolean).join(', ');
    
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
    const storedLegacyZipLat = Number(selectedOrder.receiverDetails?.lat);
    const storedLegacyZipLng = Number(selectedOrder.receiverDetails?.lng);
    const legacyZipMapCoordinates = Number.isFinite(storedLegacyZipLat) && Number.isFinite(storedLegacyZipLng)
      ? { lat: storedLegacyZipLat, lng: storedLegacyZipLng }
      : legacyZipCoordinates?.orderId === selectedOrder.id
        ? legacyZipCoordinates
        : null;
    const pickupMapLat = detailShowExact
      ? selectedLogistics.lat
      : selectedOrder.pickupDetails?.lat;
    const pickupMapLng = detailShowExact
      ? selectedLogistics.lng
      : selectedOrder.pickupDetails?.lng;
    const mapLat = selectedShippingFlags.isBranchDropoff
      ? null
      : (isSelectedLegacyOrder ? legacyZipMapCoordinates?.lat : null)
        || (isPickupMap ? pickupMapLat : null)
        || selectedLogistics.lat;
    const mapLng = selectedShippingFlags.isBranchDropoff
      ? null
      : (isSelectedLegacyOrder ? legacyZipMapCoordinates?.lng : null)
        || (isPickupMap ? pickupMapLng : null)
        || selectedLogistics.lng;
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
    const isCourierShipping = !selectedShippingFlags.isMeetup
      && !selectedShippingFlags.isSelfPickup
      && Boolean(selectedShippingMethod && selectedShippingMethod !== 'N/A');
    const showTrackingSection = isFirstReceiptValidated
      && isCourierShipping
      && (activeTab === 'to_ship' || ['Preparing', 'Ready for Pickup', 'Ready for Meetup', 'Arrived', 'To Ship', 'Shipped', 'Dispatched', 'In Transit'].includes(selectedOrder.status));
    const isReservationOrPartial = ['reservation', 'partial'].includes(String(selectedOrder.paymentPlan || '').toLowerCase()) || selectedOrder.isReservation || selectedOrder.isPartial;
    const isBalValidated = selectedOrder.balanceReceipt && selectedOrder.status !== 'Validating';

    const isOrderInvalid = Boolean(selectedOrder.isMaintenanceOrder);
    const isReservedTimerActive = selectedOrder.status === 'Reserved' && !selectedOrder.receipt && Boolean(selectedOrder.cancellationTimerStartedAt || isOrderInvalid);
    const selPaymentPlan = String(selectedOrder.paymentPlan || '').toLowerCase();
    const isReservationBalanceTimerActive = (
      (selectedOrder.status === 'Reserved' && selPaymentPlan === 'reservation') ||
      (selectedOrder.status === 'Arrived' && selPaymentPlan === 'partial' && selectedOrder.balanceRequestedAt)
    ) && calculateBalance(selectedOrder) > 0 && !selectedOrder.balanceReceipt;
    const completedReversalRemainingMs = getCompletedOrderReversalRemainingMs(selectedOrder);
    const isCompletedReversalAvailable = selectedOrder.status === 'Completed'
      && !completedReversalExpiredIds.has(selectedOrder.id)
      && completedReversalRemainingMs > 0;

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
              if (selectedOrder.isMaintenanceOrder && selectedOrder.status === 'Completed') return (
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
              if (selectedOrder.status === 'Completed') return (
                <CompletedReversalTimer
                  order={selectedOrder}
                  onExpire={() => markCompletedReversalExpired(selectedOrder.id)}
                >
                  {(timeLeft) => {
                    const isLegacyCountdownPaused = isSelectedLegacyOrder && selectedOrder.legacyCountdownPaused === true;
                    const isLegacyCountdownActive = isSelectedLegacyOrder && timeLeft && timeLeft !== 'EXPIRED' && timeLeft !== 'PERMANENT';
                    const isLegacyCountdownAction = isAdminMode && isLegacyCountdownActive;
                    const isLegacyCountdownExpired = isSelectedLegacyOrder && timeLeft === 'EXPIRED';
                    const badge = (
                      <div className={`px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest leading-none border flex items-center gap-1.5 whitespace-nowrap ${detailUI.className}`}>
                        {isLegacyCountdownAction
                          ? (isLegacyCountdownPaused ? <Play size={13} /> : <Pause size={13} />)
                          : isAdminMode && timeLeft && timeLeft !== 'PERMANENT' && !isLegacyCountdownExpired ? <Undo2 size={13} /> : null}
                        {detailUI.icon}
                        <span>{isLegacyCountdownActive ? `COMPLETE IN ${timeLeft}` : detailDisplayStatus}</span>
                        {!isSelectedLegacyOrder && <span className="opacity-90">({timeLeft === 'PERMANENT' ? 'PERMANENT' : `${timeLeft} TO REVERSE`})</span>}
                      </div>
                    );
                    return isLegacyCountdownAction ? (
                      <button
                        type="button"
                        title={isLegacyCountdownPaused ? 'Resume legacy order countdown' : 'Pause legacy order countdown'}
                        onClick={(event) => { event.stopPropagation(); handleToggleLegacyCountdown(selectedOrder); }}
                        className="rounded-full focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                      >
                        {badge}
                      </button>
                    ) : isAdminMode && timeLeft && timeLeft !== 'PERMANENT' ? (
                      <button
                        type="button"
                        title="Reverse and release stock"
                        onClick={(event) => { event.stopPropagation(); handleReverseCompletedOrder(selectedOrder.id); }}
                        className="rounded-full focus:outline-none focus:ring-2 focus:ring-red-500/60"
                      >
                        {badge}
                      </button>
                    ) : badge;
                  }}
                </CompletedReversalTimer>
              );
              if (selectedOrder.status === 'Cancelled') return (
                <CancelledOrderTimer
                  order={selectedOrder}
                  onExpire={isAdminMode ? () => handleDeleteOrderNow(selectedOrder.id) : undefined}
                >
                  {(timeLeft) => {
                    const badge = (
                      <div className={`px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest leading-none border flex items-center gap-1.5 whitespace-nowrap ${detailUI.className}`}>
                        {isAdminMode && <Trash2 size={13} />}
                        {detailUI.icon}
                        <span>{detailDisplayStatus}</span>
                        <span className="opacity-90">({timeLeft})</span>
                      </div>
                    );
                    return isAdminMode ? (
                      <button
                        type="button"
                        title="Delete cancelled order"
                        onClick={(event) => { event.stopPropagation(); handleDeleteOrderNow(selectedOrder.id); }}
                        className="rounded-full focus:outline-none focus:ring-2 focus:ring-red-500/60"
                      >
                        {badge}
                      </button>
                    ) : badge;
                  }}
                </CancelledOrderTimer>
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
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] gap-x-8 gap-y-6 items-start">
          <div className="lg:col-span-2 lg:row-start-1">
          {/* Shipping Details & Map */}
        <div className={`grid grid-cols-1 ${isFinalizedOrder || selectedShippingFlags.isBranchDropoff ? 'mb-8 pb-8 border-b border-black/5 dark:border-white/5' : 'lg:grid-cols-2 gap-8 mb-8 pb-8 border-b border-black/5 dark:border-white/5'}`}>
          {/* Left Column: Shipping Info */}
          <div className="space-y-4 text-left">
            <h3 className="text-[13px] font-black uppercase tracking-widest mb-2">Shipping Details</h3>
            
            {!isFinalizedOrder && (
              <>
                {/* Receiver Name */}
                <div className="flex flex-col">
                  <span className="text-[13px] font-black uppercase mb-0.5 tracking-wider">Receiver Name</span>
                  <span className="text-[14px] font-bold uppercase text-blue-600">
                    {selectedLogistics.receiverName || 'No Receiver Name'}
                  </span>
                </div>

                {/* Mobile & Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <span className="text-[13px] font-black uppercase mb-0.5 tracking-wider">Mobile No.</span>
                    <span className="text-[14px] font-bold uppercase text-blue-600">
                      {selectedLogistics.phoneNumber || 'N/A'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-black uppercase mb-0.5 tracking-wider">Email Address</span>
                    <span className="text-[14px] font-bold uppercase text-blue-600 break-all">
                      {selectedLogistics.email || 'N/A'}
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* Pickup pin / complete address */}
            {(!isFinalizedOrder || isAdminMode) && (
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-0.5">

<span className="text-[13px] font-black uppercase tracking-wider">
  {selectedShippingFlags.usesPickupPoint && !isSelectedLegacyOrder
    ? 'Pickup Pin'
    : selectedShippingFlags.requiresCourierBranch
      ? 'Receiving Branch'
      : 'Complete Address'}
</span>
              </div>
              <span className="text-[14px] font-bold uppercase leading-relaxed text-blue-600">
                {!isFinalizedOrder && !isSelectedLegacyOrder && selectedShippingFlags.usesPickupPoint && selectedLogistics.landmark && (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{selectedLogistics.landmark}</span>
                    <span className={`inline-flex align-middle px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${detailShowExact
                      ? 'bg-blue-600/15 text-blue-600 dark:text-blue-400'
                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    }`}>
                      {detailShowExact ? (selectedShippingFlags.isSelfPickup ? 'PICKUP LOCATION' : 'PICKUP PIN LOCATION') : (selectedShippingFlags.isSelfPickup ? 'LOCATION CHECK ONLY' : 'RATE CHECKING ONLY')}
                    </span>
                  </span>
                )}
                <span className="block">
                  {isFinalizedOrder ? (completedAddress || 'No address details') : selectedLogistics.display}
                  {!isFinalizedOrder && !isSelectedLegacyOrder && selectedShippingFlags.usesPickupPoint && !selectedLogistics.landmark && (
                    <span className={`inline-flex align-middle ml-2 px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${detailShowExact
                      ? 'bg-blue-600/15 text-blue-600 dark:text-blue-400'
                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    }`}>
                      {detailShowExact ? (selectedShippingFlags.isSelfPickup ? 'PICKUP LOCATION' : 'PICKUP PIN LOCATION') : (selectedShippingFlags.isSelfPickup ? 'LOCATION CHECK ONLY' : 'RATE CHECKING ONLY')}
                    </span>
                  )}
                </span>
                {!isFinalizedOrder && !isSelectedLegacyOrder && !selectedShippingFlags.usesPickupPoint && selectedOrder.receiverDetails?.city && (
                  <span className="block mt-0.5">
                    {selectedOrder.receiverDetails.city}, {selectedOrder.receiverDetails.province} {selectedOrder.receiverDetails.zipCode}
                  </span>
                )}
              </span>
              {!isFinalizedOrder && !isAdminMode && selectedShippingFlags.usesPickupPoint && !isSelectedLegacyOrder && !detailShowExact && (
                <span className="text-[13px] font-black uppercase text-amber-600 dark:text-amber-500 mt-1 leading-tight">
                   {selectedShippingFlags.isSelfPickup
                     ? '*FOR LOCATION CHECK ONLY. ACTUAL PIN WILL BE AVAILABLE AFTER RECEIPT VALIDATION.'
                     : '*FOR SHIPPING RATE CHECKING ONLY. ACTUAL PIN WILL BE AVAILABLE AFTER RECEIPT VALIDATION.'}
                </span>
              )}
            </div>
            )}

            {/* Selected shipping method and suboption */}
            <div className="flex flex-col">
              <span className="text-[13px] font-black uppercase mb-1 tracking-wider">Shipping Method</span>
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold uppercase text-blue-600">
                  {selectedShippingMethodDisplay}
                </span>
                {selectedShippingFlags.isFreeShipping && (
                  <span className="inline-flex whitespace-nowrap text-[11px] font-black px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                    FREE SHIPPING
                  </span>
                )}
              </div>
            </div>

            {/* Seller meetup: customer/admin can confirm a 15-minute waiting window. */}
            {isSelectedSellerMeetup && !isSelectedLegacyOrder && (
              <div className="pt-2 border-t border-black/5 dark:border-white/5 flex flex-col gap-3">
                <span className="inline-flex items-center gap-2 text-[13px] font-black uppercase tracking-wider"><Clock size={15} /> Meetup Window</span>
                <p className="text-[11px] font-bold uppercase tracking-wide opacity-55">Choose a preferred time for the current available meetup date. The confirmed window lasts 15 minutes.</p>
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
                  <span className="block text-[10px] font-black uppercase tracking-widest opacity-60">Current available date</span>
                  <span className="mt-1 block text-sm font-black uppercase text-blue-600">{formatMeetupDate(currentMeetupDate)}</span>
                </div>
                {selectedOrder?.meetupSchedule?.startTime && (
                  <p className="text-[12px] font-black uppercase text-blue-600">
                    Buyer-confirmed window: {formatMeetupDate(selectedOrder.meetupSchedule.date || currentMeetupDate)} · {formatTrackingTime(selectedOrder.meetupSchedule.startTime)}–{formatTrackingTime(selectedOrder.meetupSchedule.endTime)}
                  </p>
                )}
                {meetupReady ? (
                  meetupWindowConfigured ? (
                    <>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest opacity-60">
                          Preferred meetup time
                          <select
                            value={selectedMeetupStartTime}
                            onChange={(event) => setMeetupStartTime(event.target.value)}
                            disabled={meetupTimeOptions.length === 0}
                            className="rounded-xl border border-black/10 bg-white p-3 text-xs font-black text-blue-600 dark:border-white/10 dark:bg-[#121212]"
                          >
                            {meetupTimeOptions.map((time) => (
                              <option key={time} value={time}>{formatTrackingTime(time)}</option>
                            ))}
                          </select>
                          <span className="text-[10px] normal-case tracking-normal opacity-60">
                            {meetupTimeOptions.length > 0
                              ? `Available from ${formatTrackingTime(meetupTimeOptions[0])} to ${formatTrackingTime(meetupWindowEnd)}.`
                              : 'No eligible meetup times remain today.'}
                          </span>
                        </label>
                        <div className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest opacity-60">
                          Waiting window ends
                          <div className="rounded-xl border border-black/10 bg-black/[0.03] p-3 text-xs font-black text-blue-600 dark:border-white/10 dark:bg-white/[0.03]">
                            {formatTrackingTime(getEndTimeForWindow(selectedMeetupStartTime, 15))}
                          </div>
                        </div>
                      </div>
                      <p className="text-[12px] font-black uppercase text-blue-600">{formatMeetupDate(currentMeetupDate)} · {formatTrackingTime(selectedMeetupStartTime)}–{formatTrackingTime(getEndTimeForWindow(selectedMeetupStartTime, 15))}</p>
                      {!['Completed', 'Cancelled'].includes(selectedOrder.status) && (
                        <button
                          type="button"
                          onClick={handleSaveMeetupSchedule}
                          disabled={!meetupTimeIsValid}
                          className="w-full rounded-xl bg-blue-600 py-3 text-[12px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Confirm Meetup Window
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] font-black uppercase tracking-wide text-amber-600">Meetup time window is not configured yet.</p>
                  )
                ) : (
                  <p className="rounded-xl border border-black/10 bg-black/[0.03] p-3 text-[11px] font-black uppercase tracking-wide opacity-60 dark:border-white/10 dark:bg-white/[0.03]">
                    {isAdminMode
                      ? (meetupOrderReady ? 'Only the buyer may select the preferred meetup time.' : 'The buyer may select a meetup time when the order is Ready for Meetup.')
                      : 'Time selection opens when the order is Ready for Meetup.'}
                  </p>
                )}
              </div>
            )}

            {/* Self-pickup: show the daily printing schedule for STL projects. */}
            {isSelectedPrintingSelfPickup && !isSelectedLegacyOrder && (
              <div className="pt-2 border-t border-black/5 dark:border-white/5 flex flex-col gap-2">
                <span className="text-[13px] font-black uppercase tracking-wider">Pickup Schedule</span>
                <p className="text-[11px] font-bold uppercase tracking-wide opacity-55">Pickup becomes available after the daily printing schedule finishes.</p>
                {getPrintingPickupSchedule(selectedOrder, selectedPrintingProjects, rates, shippingSettings?.availabilitySchedule).map((entry) => (
                  <div key={`${entry.dateKey}-${entry.startTime}`} className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <span className="text-[12px] font-black uppercase text-blue-600">{entry.dateKey}</span>
                    <span className="text-[12px] font-black uppercase">{entry.startTime}–{entry.endTime}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Tracking / Inputs */}
            {showTrackingSection && !isSelectedLegacyOrder && (
              <div className="pt-2 border-t border-black/5 dark:border-white/5 flex flex-col gap-3">
                <span className="text-[13px] font-black uppercase tracking-wider">Tracking Details</span>
                {isAdminMode && !selectedIsSelfBooking && !['Completed', 'Cancelled'].includes(selectedOrder.status) ? (
                  <div className="space-y-3">
                    <input className="w-full rounded-xl border border-black/10 bg-white p-3 text-xs font-black uppercase dark:border-white/10 dark:bg-[#121212]" value={trackingRef} onChange={(event) => setTrackingRef(event.target.value.toUpperCase())} placeholder={selectedShippingFlags.requiresCourierBranch ? 'BRANCH / COURIER TRACKING NO.' : 'TRACKING NO. / COURIER URL'} />
                    {selectedShippingFlags.needsAdminShipping && <input type="number" className="w-full rounded-xl border border-black/10 bg-white p-3 text-xs font-black dark:border-white/10 dark:bg-[#121212]" value={shippingFeeInput} onChange={(event) => setShippingFeeInput(event.target.value)} placeholder="SHIPPING FEE" />}
                    {selectedShippingFlags.isFreeShipping && (
                      <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-xs font-black uppercase text-emerald-600 dark:text-emerald-400">
                        <span>Shipping Fee</span>
                        <span>FREE SHIPPING (₱0)</span>
                      </div>
                    )}
                    {selectedShippingFlags.requiresCourierBranch && <input className="w-full rounded-xl border border-black/10 bg-white p-3 text-xs font-black dark:border-white/10 dark:bg-[#121212]" value={claimantBalance} onChange={(event) => setClaimantBalance(event.target.value)} placeholder="CLAIMANT BALANCE" />}
                    <button type="button" onClick={handleSaveShippingDetails} className="w-full rounded-xl bg-blue-600 py-3 text-[12px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition-all active:scale-95">Confirm Tracking Details &amp; Mark In Transit</button>
                  </div>
                ) : selectedIsSelfBooking && !isAdminMode && selectedOrder.status === 'Ready for Pickup' && !selectedTracking.value ? (
                  <div className="space-y-3">
                    <input type="text" className="w-full rounded-xl border border-black/10 bg-white p-3 text-xs font-semibold dark:border-white/10 dark:bg-[#121212]" placeholder="TRACKING NO. / COURIER URL" value={customerTrackingLink} onChange={(event) => setCustomerTrackingLink(event.target.value)} />
                    <button type="button" onClick={handleSaveCustomerTrackingLink} className="w-full rounded-xl bg-blue-600 py-3 text-[12px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition-all active:scale-95">Confirm Tracking Details</button>
                  </div>
                ) : selectedIsSelfBooking && !isAdminMode && selectedOrder.status !== 'Ready for Pickup' && !selectedTracking.value ? (
                  <p className="text-[13px] font-black uppercase leading-tight text-amber-600 dark:text-amber-500">Please wait until the order is ready for pickup.</p>
                ) : selectedIsSelfBooking && isAdminMode && !selectedTracking.value ? (
                  <p className="text-[13px] font-black uppercase leading-tight text-amber-600 dark:text-amber-500">PENDING</p>
                ) : selectedTracking.value ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      {isTrackingUrl(selectedTracking.value) && canCopyOrOpenTracking ? (
                        <a href={selectedTracking.value} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-2 break-all text-[14px] font-black text-blue-600 hover:underline"><ExternalLink size={15} /> <span className="break-all">Open tracking link</span></a>
                      ) : (
                        <span className="min-w-0 break-all text-[14px] font-black uppercase text-blue-600 dark:text-blue-500">{selectedTracking.value}</span>
                      )}
                      {canCopyOrOpenTracking && !isTrackingUrl(selectedTracking.value) && <button type="button" onClick={() => handleCopyTrackingValue(selectedTracking.value)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-blue-600/20 px-2.5 py-2 text-[10px] font-black uppercase tracking-widest text-blue-600 transition hover:bg-blue-600/10"><Copy size={13} /> Copy</button>}
                    </div>
                    {selectedShippingFlags.isFreeShipping ? (
                      <p className="text-[14px] font-bold">Shipping Fee: <span className="font-black uppercase text-emerald-600 dark:text-emerald-500">FREE SHIPPING</span></p>
                    ) : selectedShippingFlags.needsAdminShipping ? (
                      <p className="text-[14px] font-bold">Shipping Fee: {selectedTotals.shippingFee === 0 ? <span className="font-black uppercase text-amber-600 dark:text-amber-500">{shippingFeeDisplayTextOrder}</span> : `₱${selectedTotals.shippingFee.toLocaleString()}`}</p>
                    ) : null}
                    {selectedOrder.claimantBalance && <p className="text-[14px] font-bold">Claimant Balance: ₱{Number(selectedOrder.claimantBalance || 0).toLocaleString()}</p>}
                  </div>
                ) : (
                  <p className="text-[13px] font-black uppercase leading-tight text-amber-600 dark:text-amber-500">Please wait.</p>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Map */}
          {!isFinalizedOrder && !selectedShippingFlags.isBranchDropoff && <div className="flex flex-col self-start">
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
           </div>}
         </div>
          </div>

         {/* Second Section: Items Breakdown */}
        <div className="lg:col-start-1 lg:row-start-2">
        <div className={isFinalizedOrder ? '' : 'mb-8 pb-8 border-b border-black/5 dark:border-white/5'}>
          <h3 className="text-[13px] font-black uppercase tracking-widest mb-4 text-left">Items Breakdown</h3>
          <div className="space-y-4">
            {detailItems.map((item, idx) => {
              const currentKit = kits.find(k => k.id === item.id || k.id === item.productId || k.name === item.name);
              const kit = currentKit || item.kitDetails || null;
              const kitMeta = item.kitDetails || kit || {};
              const displayImage = item.type === 'project'
                ? (item.projectData?.image || item.image)
                : resolveGridImage(kit || {}, item.image || kit?.image);

              const displayGrade = item.grade || item.specs?.line || kitMeta.specs?.line || kit?.specs?.line || 'LINE';
              const displayBrand = item.brand || kitMeta.brand || kit?.brand || '';
              const isPrintedProject = Boolean(
                item.printedProject
                || kit?.isPrintedProject
                || kit?.productType === 'printed-project'
              );
              const rawName = (isPrintedProject
                ? getPrintedProjectModelName(item, kit)
                : (item.name || item.item || '')).replace(/\s*\(Pre-Order\)\s*$/i, '');
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
              const displayTitle = isPrintedProject
                ? cleanName
                : ([displayBrand, cleanName].filter(Boolean).join(' ').trim() || cleanName);

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
                          {displayTitle}
                        </p>
                        <p className="text-xs font-bold text-neutral-900 dark:text-white mt-1 uppercase">
                          {displayGrade}
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
        </div>

        {/* Totals & Payments side-by-side */}
        <div className="contents">
        <div className="contents">
          {/* Left Side: Payments (QR, Receipt, Balance Receipt) */}


          <div className="order-2 space-y-4 text-left lg:order-none lg:col-start-1 lg:row-start-3">
            <h3 className="text-[13px] font-black uppercase tracking-widest mb-2">Payment Details</h3>
            
            {isSelectedLegacyOrder ? (
              <div className="p-6 bg-emerald-500/5 rounded-3xl border border-emerald-500/15 flex flex-col items-center text-center gap-3 w-full">
                <CheckCircle2 className="text-emerald-500" size={32} />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Legacy Transaction Recorded</h4>
                <p className="text-xs font-bold opacity-80 max-w-sm">
                  Payment plan, payment method, and receipt validation are not required for legacy orders.
                </p>
                <p className="text-sm font-black text-emerald-600">₱{Number(selectedOrder.buyerPaid || 0).toLocaleString()} recorded</p>
              </div>
            ) : selectedOrder.paymentMethod === 'Cash' && !isOrderFromMaintenance ? (
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
                          className="w-full py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[12px] font-black uppercase tracking-widest text-center transition-all mt-1 lg:hidden"
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

              {((isAdminMode && canAdminCancel && !showQrContainer && !isSelectedLegacyOrder) || (!isAdminMode && canCustomerCancel)) && (
                <button 
                  onClick={() => handleCancelOrder(selectedOrder.id)}
                  className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all mt-2 lg:hidden"
                >
                  Cancel Order
                </button>
              )}
              </>
            )}
          </div>



          {/* Right Side: Totals */}
          <div className={`order-1 space-y-3 bg-black/[0.01] dark:bg-white/[0.01] p-6 rounded-3xl border border-black/5 dark:border-white/5 text-left lg:order-none lg:col-start-2 lg:row-start-2 ${isAdminMode ? 'lg:row-span-2' : ''}`}>
            <h3 className="text-[13px] font-black uppercase tracking-widest mb-2">Order Totals</h3>
            
            {/* First row: Items Total */}
            <div className="flex justify-between items-center text-[14px] font-bold">
              <span>Items Total</span>
              <span>₱{itemsSubtotal.toLocaleString()}</span>
            </div>

            {/* Second row: Garage Discount */}
            {selectedTotals.discount > 0 && (
              <div className="flex justify-between items-center text-[14px] font-bold text-emerald-600 dark:text-emerald-500">
                <span>Garage Discount</span>
                <span>-₱{selectedTotals.discount.toLocaleString()}</span>
              </div>
            )}

            {/* Second row: Shipping Fee */}
            <div className="flex justify-between items-center text-[14px] font-bold">
              <span>Shipping Fee</span>
              <span>
                {selectedShippingFlags.isFreeShipping ? (
                  <span className="text-emerald-600 dark:text-emerald-500 uppercase font-black">FREE SHIPPING</span>
                ) : selectedShippingFlags.needsAdminShipping && selectedTotals.shippingFee === 0 ? (
                  <span className="text-amber-600 dark:text-amber-500 uppercase font-black">{shippingFeeDisplayTextOrder}</span>
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

            {selectedLegacyFinancials && (
              <div className="mt-4 rounded-2xl border border-blue-500/15 bg-blue-500/[0.04] p-4">
                <h4 className="mb-3 text-[10px] font-black uppercase tracking-widest text-blue-600">Legacy payment summary</h4>
                {selectedLegacyFinancials.available ? (
                  <div className="grid grid-cols-2 gap-3 text-[11px] font-black uppercase tracking-wider">
                    <div>
                      <span className="block opacity-45">Capital regained</span>
                      <span className="mt-1 block text-violet-600 dark:text-violet-400">₱{selectedLegacyFinancials.capitalRegained.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="block opacity-45">Profit / loss</span>
                      <span className={`mt-1 block ${selectedLegacyFinancials.profit < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {selectedLegacyFinancials.profit < 0 ? '-₱' : '₱'}{Math.abs(selectedLegacyFinancials.profit).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] font-bold leading-relaxed opacity-50">Profit and capital are unavailable because this legacy order has no recorded stock cost.</p>
                )}
                <p className="mt-3 text-[10px] font-bold leading-relaxed opacity-50">Uses the buyer-paid amount and recorded stock capital. Handling is included in legacy transaction proceeds.</p>
              </div>
            )}
          </div>
        </div>
        </div>
        </div>

        {(!isFinalizedOrder || isAdminMode) && ((isAdminMode && canAdminCancel && !isSelectedLegacyOrder) || (!isAdminMode && canCustomerCancel)) && (
          <div className="hidden lg:flex justify-center -mt-4 mb-2">
            <button
              onClick={() => handleCancelOrder(selectedOrder.id)}
              className="w-full max-w-xl py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Cancel Order
            </button>
          </div>
        )}

        {/* Action Buttons Panel */}
        {(!isFinalizedOrder || isAdminMode) && (
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

          {isAdminMode && (selectedOrder.isPreOrder || selectedOrder.items?.some(i => i.isPreOrder)) && ['Waiting', 'Reserved'].includes(selectedOrder.status) && (
            <button 
              onClick={() => handleRequestBalance(selectedOrder.id)}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-md"
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


          {isAdminMode && selectedOrder.status === 'Completed' && isCompletedReversalAvailable && (
            <button
              onClick={() => handleReverseCompletedOrder(selectedOrder.id)}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-red-600/20 flex items-center gap-1.5"
            >
              <Undo2 size={14} /> {isSelectedLegacyOrder ? 'Reverse Legacy Transaction' : 'Reverse & Release Stock'}
            </button>
          )}

          {isAdminMode && isSelectedLegacyOrder && !['Cancelled', 'Completed'].includes(selectedOrder.status) && (
            <button
              onClick={() => handleReverseLegacyOrder(selectedOrder.id)}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-red-600/20 flex items-center gap-1.5"
            >
              <Undo2 size={14} /> Cancel &amp; Reverse Legacy Transaction
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
        )}
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
                  <button key={tab.id} onClick={() => { setActiveTab(tab.id); closeSelectedOrder(); }} className={`whitespace-nowrap px-4 py-2 rounded-xl text-[12px] font-black uppercase tracking-widest border transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-transparent text-neutral-500 dark:text-neutral-300 border-black/10 dark:border-white/10 hover:border-blue-500/50'}`}>
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
              <div className="flex min-h-[calc(100dvh-180px)] w-full items-center justify-center sm:min-h-[calc(100dvh-120px)]">
                <LoadingState message="Loading orders..." className="py-0" />
              </div>
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
                      className="sticky top-[116px] z-[80] -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 bg-neutral-50/90 px-4 py-2 backdrop-blur-md dark:bg-[#0a0a0a]/90 md:top-[120px] md:-mx-8 md:w-[calc(100%+4rem)] md:px-8"
                    >
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                      <span className="select-none bg-gradient-to-r from-[#0866FF] to-[#00CFFF] bg-clip-text text-[13px] font-black uppercase tracking-[0.2em] text-transparent">
                        {row.label}
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                    </div>
                  );
                }

                const o = row.order;
                const isSelected = selectedOrders.includes(o.id);
                const isLegacyOrder = isLegacyOrderRecord(o);
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
                const orderStatusIndicator = o.isMaintenanceOrder && o.status === 'Completed' ? (
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
                ) : o.status === 'Completed' ? (
                  <CompletedReversalTimer
                    order={o}
                    onExpire={() => markCompletedReversalExpired(o.id)}
                  >
                    {(timeLeft) => {
                      const isLegacyCountdownPaused = isLegacyOrder && o.legacyCountdownPaused === true;
                      const isLegacyCountdownActive = isLegacyOrder && timeLeft && timeLeft !== 'EXPIRED' && timeLeft !== 'PERMANENT';
                      const isLegacyCountdownAction = isAdminMode && isLegacyCountdownActive;
                      const isLegacyCountdownExpired = isLegacyOrder && timeLeft === 'EXPIRED';
                      const badge = (
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black uppercase leading-none tracking-widest shadow-md whitespace-nowrap ${cardUI.className}`}>
                          {isLegacyCountdownAction
                            ? (isLegacyCountdownPaused ? <Play size={12} /> : <Pause size={12} />)
                            : isAdminMode && timeLeft && timeLeft !== 'PERMANENT' && !isLegacyCountdownExpired ? <Undo2 size={12} /> : null}
                          {cardUI.icon}
                          <span>{isLegacyCountdownActive ? `COMPLETE IN ${timeLeft}` : cardDisplayStatus}</span>
                          {!isLegacyOrder && <span className="opacity-90">({timeLeft === 'PERMANENT' ? 'PERMANENT' : `${timeLeft} TO REVERSE`})</span>}
                        </span>
                      );
                      return isLegacyCountdownAction ? (
                        <button
                          type="button"
                          title={isLegacyCountdownPaused ? 'Resume legacy order countdown' : 'Pause legacy order countdown'}
                          onClick={(event) => { event.stopPropagation(); handleToggleLegacyCountdown(o); }}
                          className="rounded-full focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                        >
                          {badge}
                        </button>
                      ) : isAdminMode && timeLeft && timeLeft !== 'PERMANENT' ? (
                        <button
                          type="button"
                          title="Reverse and release stock"
                          onClick={(event) => { event.stopPropagation(); handleReverseCompletedOrder(o.id); }}
                          className="rounded-full focus:outline-none focus:ring-2 focus:ring-red-500/60"
                        >
                          {badge}
                        </button>
                      ) : badge;
                    }}
                  </CompletedReversalTimer>
                ) : o.status === 'Cancelled' ? (
                  <CancelledOrderTimer
                    order={o}
                    onExpire={isAdminMode ? () => handleDeleteOrderNow(o.id) : undefined}
                  >
                    {(timeLeft) => {
                      const badge = (
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black uppercase leading-none tracking-widest shadow-md whitespace-nowrap ${cardUI.className}`}>
                          {isAdminMode && <Trash2 size={12} />}
                          {cardUI.icon}
                          <span>{cardDisplayStatus}</span>
                          <span className="opacity-90">({timeLeft})</span>
                        </span>
                      );
                      return isAdminMode ? (
                        <button
                          type="button"
                          title="Delete cancelled order"
                          onClick={(event) => { event.stopPropagation(); handleDeleteOrderNow(o.id); }}
                          className="rounded-full focus:outline-none focus:ring-2 focus:ring-red-500/60"
                        >
                          {badge}
                        </button>
                      ) : badge;
                    }}
                  </CancelledOrderTimer>
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
                  const isPrintedProject = Boolean(
                    item.printedProject
                    || kit?.isPrintedProject
                    || kit?.productType === 'printed-project'
                  );
                  const rawName = isPrintedProject
                    ? getPrintedProjectModelName(item, kit)
                    : (item.name || kit?.name || o.item || `Kit ${index + 1}`);
                  const name = !isPrintedProject && grade && rawName.toLowerCase().startsWith(grade.toLowerCase())
                    ? rawName.slice(grade.length).trim() || rawName
                    : rawName;
                  return {
                    id: item.stockKey || item.basketId || item.id || `kit-${index}`,
                    image: resolveGridImage(kit || {}, item.image || kit?.image),
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
                        openOrderFromList(o);
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
                        {getShippingFlags(o, shippingSettings).isFreeShipping && (
                          <span className="inline-flex whitespace-nowrap text-[12px] font-black px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                            FREE SHIPPING
                          </span>
                        )}
                        {isAdminMode && !isLegacyOrder && (o.paymentPlan && o.paymentPlan !== 'full' ? (
                          <span className="inline-flex whitespace-nowrap text-[12px] font-black px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-500 uppercase tracking-wider">
                            {o.paymentPlan === 'partial' ? 'Partial' : o.paymentPlan === 'reservation' ? 'Reservation' : 'Installment'}
                          </span>
                        ) : (
                          <span className="inline-flex whitespace-nowrap text-[12px] font-black px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 uppercase tracking-wider">
                            Full Pay
                          </span>
                        ))}
                        {isAdminMode && !isLegacyOrder && o.paymentMethod && (
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
          <div className={`sticky z-[95] w-full h-[60px] bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border-t border-black/5 dark:border-white/5 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] transition-[bottom] duration-300 ${isMiniNavVisible ? 'bottom-[56px] sm:bottom-0' : 'bottom-0'}`}>
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
                                handleConfirmPayment(selectedOrder, true, isBalanceReceipt);
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
          <div className="fixed inset-0 z-[500] flex items-start justify-center bg-black/60 p-0 font-sans text-neutral-900 dark:text-white lg:items-center lg:p-4">
            <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white/95 text-left shadow-2xl backdrop-blur-xl dark:bg-[#0a0a0a]/95 lg:h-auto lg:max-h-[95vh] lg:max-w-5xl lg:rounded-[2.5rem] lg:border lg:border-black/5 lg:p-5 dark:border-white/10">
            <div className="sticky top-0 z-[220] w-full h-0 overflow-visible lg:hidden">
              <div className="absolute top-4 right-4 flex justify-end items-center">
                <button type="button" onClick={() => setShowManualOrderModal(false)} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/20 text-white shadow-lg backdrop-blur-md transition-all hover:bg-black/40" aria-label="Close legacy order"><X size={20} /></button>
              </div>
            </div>
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-black/5 px-5 py-4 pr-16 shadow-sm dark:border-white/5 sm:px-6 sm:pr-16 lg:pr-6">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25"><ClipboardList size={20} /></span>
                <div><h2 className="text-[19px] font-black italic uppercase tracking-tight sm:text-[22px]">Legacy <span className="text-blue-600">Order</span></h2><p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-40">Record paid kit and project orders</p></div>
              </div>
              <button type="button" onClick={() => setShowManualOrderModal(false)} className="hidden h-10 w-10 items-center justify-center rounded-full bg-black/5 transition hover:bg-black/10 dark:bg-white/10 lg:flex" aria-label="Close legacy order"><X size={20} /></button>
            </header>

            <form onSubmit={handleCreateManualOrder} className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto grid max-w-7xl gap-7 px-5 py-6 pb-28 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-12">
                <div className="space-y-6">
                  <section>
                    <div className="mb-3 flex items-center justify-between"><h3 className="text-[12px] font-black uppercase tracking-widest opacity-45">Included items</h3><span className="text-[11px] font-black uppercase tracking-widest text-blue-600">{manualOrderData.selectedItems.length} selected</span></div>
                    <div className="rounded-2xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="mb-3 flex flex-wrap gap-2">
                        {[
                          { value: 'kits', label: 'Kits' },
                          { value: 'projects', label: 'Projects · STL / 3MF / 3D Printed' }
                        ].map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setManualOrderData((prev) => ({ ...prev, searchType: option.value, search: '' }))}
                            className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition ${manualOrderData.searchType === option.value ? 'border-blue-600 bg-blue-600 text-white' : 'border-black/10 bg-white/70 opacity-60 hover:border-blue-400 dark:border-white/10 dark:bg-white/[0.04]'}`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <input value={manualOrderData.search} onChange={(event) => setManualOrderData(prev => ({ ...prev, search: event.target.value }))} placeholder={manualOrderData.searchType === 'projects' ? 'Search project name or STL, 3MF, 3D Printed…' : 'Search kits, brand, line, or stock…'} className="mb-3 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-[13px] font-bold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-[var(--color-surface-raised)]" />
                      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                        {manualOrderData.searchType === 'projects' ? filteredLegacyProjectChoices.map((choice) => {
                          const selected = manualOrderData.selectedItems.some(item => item.kind === 'project' && item.projectId === choice.projectId);
                          return <button key={`project:${choice.projectId}`} type="button" disabled={selected} onClick={() => setManualOrderData(prev => ({ ...prev, selectedItems: [...prev.selectedItems, choice] }))} className="flex w-full items-center gap-3 rounded-xl border border-black/5 bg-white p-2 text-left transition hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/5 dark:bg-white/[0.03]">
                            <img src={choice.image} alt="" className="h-12 w-16 rounded-lg object-cover" /><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-black uppercase">{choice.name}</span><span className="block truncate text-[10px] font-bold uppercase tracking-wider opacity-45">{choice.meta}</span></span><span className="shrink-0 text-right leading-tight"><span className="block text-[12px] font-black text-emerald-600">SELL ₱{choice.originalPrice.toLocaleString()}</span><span className="block text-[10px] font-black opacity-50">{choice.capitalPrice === null ? 'CAPITAL —' : `CAPITAL ₱${choice.capitalPrice.toLocaleString()}`}</span></span>
                          </button>;
                        }) : filteredLegacyStockChoices.map(({ kit, stockKey, stock }) => {
                          const selected = manualOrderData.selectedItems.some(item => item.kind !== 'project' && item.kitId === kit.id && item.stockKey === stockKey);
                          const image = resolveImage(kit.image, kit.images) || '/snorlaxgarage.png';
                          return <button key={`${kit.id}:${stockKey}`} type="button" disabled={selected} onClick={() => setManualOrderData(prev => ({ ...prev, selectedItems: [...prev.selectedItems, { kind: 'kit', kitId: kit.id, stockKey, name: kit.name, image, costPrice: Number(stock.costPrice || 0), meta: [kit.brand, kit.specs?.line, stock.status].filter(Boolean).join(' • '), kitDetails: getLegacyKitDetails(kit), stockDetails: getLegacyStockDetails(stock, stockKey) }] }))} className="flex w-full items-center gap-3 rounded-xl border border-black/5 bg-white p-2 text-left transition hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/5 dark:bg-white/[0.03]">
                            <img src={image} alt="" className="h-12 w-16 rounded-lg object-cover" /><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-black uppercase">{kit.name}</span><span className="block truncate text-[10px] font-bold uppercase tracking-wider opacity-45">{[kit.brand, kit.specs?.line, stock.status, getStockEta(stock)].filter(Boolean).join(' • ')}</span></span><span className="shrink-0 text-right leading-tight"><span className="block text-[12px] font-black text-emerald-600">SELL ₱{Number(stock.sellPrice || kit.sellPrice || 0).toLocaleString()}</span><span className="block text-[10px] font-black opacity-50">COST ₱{Number(stock.costPrice || 0).toLocaleString()}</span></span>
                          </button>;
                        })}
                        {((manualOrderData.searchType === 'projects' && filteredLegacyProjectChoices.length === 0) || (manualOrderData.searchType !== 'projects' && filteredLegacyStockChoices.length === 0)) && <p className="p-5 text-center text-[11px] font-black uppercase tracking-widest opacity-40">{manualOrderData.searchType === 'projects' ? 'No STL, 3MF, or 3D printed projects found' : 'No available non-collection stock found'}</p>}
                      </div>
                    </div>
                  </section>

                  <section className="space-y-3">
                    {manualOrderData.selectedItems.length === 0 ? <div className="rounded-2xl border border-dashed border-black/15 p-8 text-center text-[11px] font-black uppercase tracking-widest opacity-40 dark:border-white/15">Select kits or projects to include</div> : manualOrderData.selectedItems.map((item) => {
                      const key = item.kind === 'project' ? `project:${item.projectId}` : `kit:${item.kitId}:${item.stockKey}`;
                      return <div key={key} className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-black/5 bg-white p-3 shadow-sm dark:border-white/5 dark:bg-white/[0.03]"><img src={item.image || '/snorlaxgarage.png'} alt="" className="h-16 w-20 rounded-xl object-cover" /><div className="min-w-0"><p className="truncate text-[13px] font-black uppercase">{item.name}</p><p className="mt-1 truncate text-[11px] font-black uppercase tracking-wider opacity-45">{item.meta}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wider opacity-60">CAPITAL {item.capitalPrice === null || item.capitalPrice === undefined ? (item.kind === 'project' ? '—' : `₱${Number(item.costPrice || 0).toLocaleString()}`) : `₱${Number(item.capitalPrice).toLocaleString()}`}</p></div><button type="button" onClick={() => setManualOrderData(prev => ({ ...prev, selectedItems: prev.selectedItems.filter(entry => (entry.kind === 'project' ? `project:${entry.projectId}` : `kit:${entry.kitId}:${entry.stockKey}`) !== key) }))} className="rounded-full p-2 text-red-500 hover:bg-red-500/10" aria-label={`Remove ${item.name}`}><Trash2 size={16} /></button></div>;
                    })}
                  </section>
                </div>

                <aside className="space-y-5">
                  <section className="rounded-2xl border border-black/10 p-5 dark:border-white/10"><h3 className="mb-4 text-[12px] font-black uppercase tracking-widest opacity-45">Shipping</h3><div className="space-y-3"><select required value={manualOrderData.shippingMethod} onChange={handleLegacyShippingMethodChange} className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-3 text-[12px] font-black uppercase dark:border-white/10"><option value="">Select shipping option</option>{legacyShippingOptions.map(method => <option key={method} value={method}>{method}</option>)}</select>{legacySuboptions.length > 0 && <select required value={manualOrderData.shippingSuboption} onChange={(event) => setManualOrderData(prev => ({ ...prev, shippingSuboption: event.target.value }))} className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-3 text-[12px] font-black uppercase dark:border-white/10"><option value="">Select option</option>{legacySuboptions.map(([key, config]) => <option key={key} value={key}>{config.label || key}</option>)}</select>}</div></section>
                  <section className="rounded-2xl border border-black/10 p-5 dark:border-white/10"><h3 className="mb-4 text-[12px] font-black uppercase tracking-widest opacity-45">Delivery address</h3><PhilippineAddressSuggestions idPrefix="legacy-address" province={manualOrderData.province} /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1"><input list="legacy-address-provinces" required disabled={Boolean(legacyAutoAddressPoint)} value={manualOrderData.province} onChange={(event) => handleLegacyLocationChange('province', event.target.value)} placeholder="PROVINCE" className="rounded-xl border border-black/10 bg-transparent px-3 py-3 text-[12px] font-black uppercase disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10" /><input list="legacy-address-cities" required disabled={Boolean(legacyAutoAddressPoint)} value={manualOrderData.city} onChange={(event) => handleLegacyLocationChange('city', event.target.value)} placeholder="CITY / TOWN" className="rounded-xl border border-black/10 bg-transparent px-3 py-3 text-[12px] font-black uppercase disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10" /><input required disabled={Boolean(legacyAutoAddressPoint)} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={manualOrderData.zipCode} onChange={handleLegacyZipCodeChange} placeholder="ZIP CODE" className="rounded-xl border border-black/10 bg-transparent px-3 py-3 text-[12px] font-black uppercase disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10" /></div>{legacyAutoAddressPoint ? <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-blue-600">{isLegacySellerMeetup ? 'Seller meetup address filled from the configured meetup place.' : 'Self-pickup address filled from the active pickup point tagged as Actual Pin.'}</p> : <p className="mt-3 text-[10px] font-bold uppercase tracking-wider opacity-45">Enter the province first, then city/town to generate the ZIP code, or enter a 4-digit ZIP code to fill them automatically.</p>}</section>
                  <section className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.04] p-5">
                    <h3 className="mb-4 text-[12px] font-black uppercase tracking-widest text-blue-600">Payment summary</h3>
                    <label className="mb-3 block text-[10px] font-black uppercase tracking-widest opacity-45">
                      Total paid by buyer
                      <input required min="0" type="number" value={manualOrderData.buyerPaid} onChange={(event) => setManualOrderData(prev => ({ ...prev, buyerPaid: event.target.value }))} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-[14px] font-black text-neutral-950 dark:border-white/10 dark:bg-[var(--color-surface-raised)] dark:text-white" />
                    </label>
                    <div className="rounded-xl border border-blue-500/15 bg-blue-500/[0.04] p-3">
                      <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-black uppercase tracking-widest opacity-55">Detected handling fee</span><span className="text-[14px] font-black text-blue-600">₱{legacyHandlingFee.toLocaleString()}</span></div>
                      <p className="mt-1 text-[9px] font-bold uppercase tracking-wider opacity-45">Based on the selected shipping method and option</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-widest opacity-55">Cash transfer fee</span><span className="text-[12px] font-black text-emerald-600 dark:text-emerald-400">₱0 · Not charged</span></div>
                    <div className="mt-4 flex items-center justify-between border-t border-blue-500/15 pt-4"><span className="text-[10px] font-black uppercase tracking-widest opacity-55">Distributed to items</span><span className="text-[18px] font-black text-blue-600">₱{legacyItemTotal.toLocaleString()}</span></div>
                    <div className="mt-4 grid gap-2 border-t border-blue-500/15 pt-4 sm:grid-cols-2">
                      <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.06] p-3">
                        <span className="block text-[9px] font-black uppercase tracking-widest opacity-55">Capital regained</span>
                        <span className="mt-1 block text-[16px] font-black text-violet-600 dark:text-violet-400">{legacyFinancials.available ? `₱${legacyFinancials.capitalRegained.toLocaleString()}` : '—'}</span>
                      </div>
                      <div className={`rounded-xl border p-3 ${legacyFinancials.available && legacyFinancials.profit < 0 ? 'border-red-500/15 bg-red-500/[0.06]' : 'border-emerald-500/15 bg-emerald-500/[0.06]'}`}>
                        <span className="block text-[9px] font-black uppercase tracking-widest opacity-55">Profit / loss</span>
                        <span className={`mt-1 block text-[16px] font-black ${legacyFinancials.available && legacyFinancials.profit < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{legacyFinancials.available ? `${legacyFinancials.profit < 0 ? '-₱' : '₱'}${Math.abs(legacyFinancials.profit).toLocaleString()}` : '—'}</span>
                      </div>
                    </div>
                    <p className="mt-3 text-[10px] font-bold leading-relaxed opacity-50">Capital regained is the portion of the buyer payment that covers recorded stock cost. Profit/loss is buyer-paid minus stock capital; handling is included in legacy transaction proceeds. Values appear once selected stocks have recorded costs.</p>
                    <p className="mt-2 text-[10px] font-bold leading-relaxed opacity-50">Total paid minus the detected handling fee is proportionally saved as the selected stocks’ legacy sell price. Legacy orders use cash payment and do not add a cash transfer fee.</p>
                  </section>
                </aside>
              </div>
              <footer className="absolute inset-x-0 bottom-0 z-10 border-t border-black/5 bg-white/95 px-5 py-3 backdrop-blur dark:border-white/5 dark:bg-[#0a0a0a]/95 sm:px-8 lg:px-12"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><button type="button" onClick={() => setShowManualOrderModal(false)} className="text-[11px] font-black uppercase tracking-widest opacity-50">Cancel</button><button type="submit" className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 active:scale-95"><ArrowRight size={16} /> Create legacy order</button></div></footer>
            </form>
            </div>
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
                          <option key={s.key} value={s.key}>{s.status} {getStockEta(s) ? `(${getStockEta(s)})` : ''} - ₱{s.sellPrice?.toLocaleString()}</option>
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
                        {legacyShippingOptions.map(m => <option key={m} value={m}>{m}</option>)}
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
