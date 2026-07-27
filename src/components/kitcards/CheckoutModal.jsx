import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { 
  X, ShoppingBag, Package, Clock, Download, CheckCircle2, Camera,
  User, Phone, Home, Building2, Map, Hash, Navigation, MapPin,
  ShieldCheck, Loader2, Settings, Info, Truck, Users, Sparkles,
  MapPinCheckInside, Store, CircleChevronLeft
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { getCheckoutPaymentFees } from '../../utils/paymentSettings';
import { useTheme } from '../../context/ThemeContext';
import { auth, db, googleProvider } from '../../firebase/firebase';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { signInWithPopup } from 'firebase/auth';
import * as FcIcons from 'react-icons/fc';
import L from 'leaflet';
import DynamicShippingForm from './DynamicShippingForm';

// --- LEAFLET CSS & ICON FIX ---
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Resolves an image ID to its URL from the images array.
// Backward compatible: if the value is already a URL (base64 or http), returns it directly.
function resolveImage(idOrUrl, imagesArray) {
  if (!idOrUrl) return '';
  if (idOrUrl.startsWith('data:') || idOrUrl.startsWith('http')) return idOrUrl;
  const match = (imagesArray || []).find(img => img.id === idOrUrl);
  return match?.url || '';
}

const toCheckoutNumber = (value) => Number(value || 0);

const getCheckoutItemBasePrice = (item, kit, fees = {}) => {
  if (item.type === 'project') {
    return toCheckoutNumber(item.projectData?.sellPrice || item.sellPrice || item.price);
  }

  const storedPrice = toCheckoutNumber(item.price);
  if (item.isBundleItem && storedPrice > 0) return storedPrice;

  const stockPrice = toCheckoutNumber(kit?.stocks?.[item.stockKey]?.sellPrice);
  if (stockPrice > 0) return stockPrice;

  const itemSellPrice = toCheckoutNumber(item.sellPrice);
  const knownFees = toCheckoutNumber(fees.handling) + toCheckoutNumber(fees.installment) + toCheckoutNumber(fees.transfer);
  if (storedPrice > 0 && itemSellPrice > 0 && storedPrice > itemSellPrice) {
    return Math.max(0, storedPrice - knownFees);
  }

  return itemSellPrice || storedPrice;
};

const DEFAULT_DELIVERY_COORDS = { lat: 14.5995, lng: 120.9842 };
// Ang mga locally-handled na methods na hindi gumagamit ng delivery address form
const LOCAL_METHODS = ['Seller Meetup', 'Self-Pickup'];



// Unified key resolver — i-resolve ang shorthand subKey (e.g. 'cop', 'cod', 'self') sa actual database key
// (e.g. 'cash-on-pickup', 'cash-on-delivery', 'self-booking') gamit ang fuzzy match sa suboptions
const resolveSuboptionKey = (methodConfig, subKey) => {
  if (!subKey || !methodConfig?.suboptions) return subKey;
  // Kung exact match na, return agad
  if (methodConfig.suboptions[subKey]) return subKey;
  // Fuzzy match — hanapin sa keys at labels ng suboptions
  const normalizedSub = subKey.toLowerCase().replace(/-/g, '');
  const found = Object.keys(methodConfig.suboptions).find(k => {
    const lowerKey = k.toLowerCase();
    const stripped = lowerKey.replace(/-/g, '');
    if (stripped === normalizedSub) return true;
    const label = (methodConfig.suboptions[k].label || '').toLowerCase();
    // Match common shorthands
    if (normalizedSub === 'cop' && (lowerKey.includes('pickup') || label.includes('pickup') || label.includes('cop') || lowerKey === 'standard-delivery' || label.includes('standard'))) return true;
    if (normalizedSub === 'cod' && (lowerKey.includes('delivery') || label.includes('delivery') || label.includes('cod'))) return true;
    if (normalizedSub === 'self' && (lowerKey.includes('self') || label.includes('self') || label.includes('customer'))) return true;
    if (normalizedSub === 'seller' && (lowerKey.includes('seller') || label.includes('seller') || lowerKey === 'standard-delivery' || label.includes('standard'))) return true;
    if (normalizedSub === 'delivery' && (lowerKey.includes('delivery') || label.includes('delivery') || lowerKey === 'standard-delivery' || label.includes('standard'))) return true;
    return false;
  });
  return found || subKey;
};

const checkUsesPickupPoint = (method, methodConfig, subKey) => {
  if (methodConfig && typeof methodConfig === 'object') {
    const rk = resolveSuboptionKey(methodConfig, subKey);
    if (methodConfig.hasSuboptions && rk && methodConfig.suboptions?.[rk]) {
      const sub = methodConfig.suboptions[rk];
      if (Array.isArray(sub.requiredFields)) {
        return sub.requiredFields.includes(14);
      }
      if (sub.isPickupRequired || sub.isSelfBooking) return true;
    }
    if (Array.isArray(methodConfig.requiredFields)) {
      return methodConfig.requiredFields.includes(14);
    }
  }
  if (method === 'Self-Pickup') return true;
  if (method === 'Lalamove' && subKey === 'self') return true;
  return false;
};

const checkUsesMeetupLocation = (method, methodConfig, subKey) => {
  if (methodConfig && typeof methodConfig === 'object') {
    const rk = resolveSuboptionKey(methodConfig, subKey);
    if (methodConfig.hasSuboptions && rk && methodConfig.suboptions?.[rk]) {
      const sub = methodConfig.suboptions[rk];
      if (Array.isArray(sub.requiredFields)) {
        return sub.requiredFields.includes(15);
      }
    }
    if (Array.isArray(methodConfig.requiredFields)) {
      return methodConfig.requiredFields.includes(15);
    }
  }
  if (method === 'Seller Meetup') return true;
  return false;
};

const checkHasSchedule = (method, methodConfig, subKey) => {
  if (method === 'Self-Pickup' || method === 'Seller Meetup') return true;
  if (method === 'Lalamove' && subKey === 'self') return true;
  if (!methodConfig || typeof methodConfig !== 'object') return false;
  const rk = resolveSuboptionKey(methodConfig, subKey);
  if (methodConfig.hasSuboptions && rk && methodConfig.suboptions?.[rk]) {
    const sub = methodConfig.suboptions[rk];
    if (sub.hasSchedule) return true;
  }
  if (methodConfig.hasSchedule) return true;
  return false;
};

// Kuhanin ang required fields mula sa Firestore config — walang hardcoded defaults
// Ginagamit ang resolveSuboptionKey para ma-resolve ang shorthand keys (e.g. 'cop' → 'cash-on-pickup')
const getRequiredFields = (methodConfig, subKey = null) => {
  if (methodConfig && typeof methodConfig === 'object') {
    if (subKey) {
      const rk = resolveSuboptionKey(methodConfig, subKey);
      if (methodConfig.suboptions?.[rk]) {
        const subConfig = methodConfig.suboptions[rk];
        if (Array.isArray(subConfig.requiredFields)) return subConfig.requiredFields;
        // Suboption exists pero walang requiredFields — fall back to method-level
      }
    }
    if (Array.isArray(methodConfig.requiredFields)) return methodConfig.requiredFields;
    // May methodConfig pero walang kahit anong requiredFields — use default full address
    return [1, 2, 5, 6, 7, 9, 10, 11, 12];
  }
  return [1, 2, 5, 6, 7, 9, 10, 11, 12]; // fallback kung wala sa config
};

// Kuhanin ang courier name mula sa config — resolved subKey para sa suboption-level courier names
const getCourierName = (method, subKey, methodConfig) => {
  if (methodConfig && typeof methodConfig === 'object') {
    if (subKey) {
      const rk = resolveSuboptionKey(methodConfig, subKey);
      if (methodConfig.suboptions?.[rk]?.courierName) {
        return methodConfig.suboptions[rk].courierName;
      }
    }
    if (methodConfig.courierName) return methodConfig.courierName;
  }
  return method || 'Courier';
};

const isMethodEnabled = (methodConfig) => {
  // Kung wala sa Firestore (undefined/null), hindi enabled — ito ang bug fix.
  if (methodConfig === undefined || methodConfig === null) return false;
  if (typeof methodConfig === 'object') return methodConfig.active !== false;
  return methodConfig !== false;
};

const isSubMethodEnabled = (methodConfig, subKey) => {
  if (!isMethodEnabled(methodConfig)) return false;
  if (typeof methodConfig !== 'object' || methodConfig === null) return true;
  const rk = resolveSuboptionKey(methodConfig, subKey);
  const subVal = methodConfig.suboptions?.[rk] ?? methodConfig[rk];
  // Suboption can be stored as a boolean, an object with .active, or undefined (defaults to enabled)
  if (subVal === undefined) return true;
  if (subVal === false) return false;
  if (typeof subVal === 'object' && subVal !== null) return subVal.active !== false;
  return subVal !== false;
};

// Kuhanin ang handling discount setting — resolved subKey para tamang suboption ang ma-lookup
const getHandlingDiscountSetting = (shippingMethods = {}, method, subKey = null) => {
  const methodConfig = shippingMethods?.[method];
  if (typeof methodConfig !== 'object' || methodConfig === null) return true; // default: may discount
  if (subKey) {
    const rk = resolveSuboptionKey(methodConfig, subKey);
    const subConfig = methodConfig.suboptions?.[rk];
    if (subConfig?.handlingDiscount !== undefined) return subConfig.handlingDiscount;
    return true; // default: may discount
  }
  return methodConfig.handlingDiscount !== undefined ? methodConfig.handlingDiscount : true;
};

// I-convert ang suboption key sa display value gamit ang label mula sa config
// Para sa free shipping matching, ginagamit natin ang label ng suboption
const getSuboptionLabel = (shippingMethods, method, subKey) => {
  if (!subKey) return 'All';
  return shippingMethods?.[method]?.suboptions?.[subKey]?.label || subKey;
};

const getPaymentMethodConfig = (methods = {}, method = '') => {
  const raw = String(method || '').trim();
  if (!raw) return { active: false, transferDiscount: false, qr: null };

  const compact = raw.replace(/\s+/g, '');
  const lower = raw.toLowerCase();
  const compactLower = compact.toLowerCase();
  const methodKey = Object.keys(methods || {}).find(key =>
    key.toLowerCase() === lower ||
    key.replace(/\s+/g, '').toLowerCase() === compactLower
  ) || lower;

  const transferDiscountKey = Object.keys(methods || {}).find(key =>
    key.toLowerCase() === `${methodKey.toLowerCase()}transferdiscount` ||
    key.toLowerCase() === `${lower}transferdiscount` ||
    key.toLowerCase() === `${compactLower}transferdiscount`
  );
  const qrKey = Object.keys(methods || {}).find(key =>
    key.toLowerCase() === `${methodKey.replace(/\s+/g, '').toLowerCase()}qr` ||
    key.toLowerCase() === `${compactLower}qr`
  );

  return {
    key: methodKey,
    active: isMethodEnabled(methods?.[methodKey]),
    transferDiscount: transferDiscountKey ? methods[transferDiscountKey] === true : false,
    qr: qrKey ? methods[qrKey] : null
  };
};

const formatPlaceAddress = (place = {}) => {
  if (place.address) return place.address;
  const streetLine = [place.houseNo, place.houseDetails || place.street].filter(Boolean).join(' ').trim();
  return [
    place.address || place.vagueAddress,
    streetLine,
    place.subdivision,
    place.barangay,
    place.city,
    place.province,
    place.zipCode
  ].filter(Boolean).join(', ');
};

const formatPlaceAddressWithoutHouseNo = (place = {}) => {
  if (place.publicAddress) return place.publicAddress;
  return [
    place.address || place.vagueAddress,
    place.houseDetails || place.street,
    place.subdivision,
    place.barangay,
    place.city,
    place.province,
    place.zipCode
  ].filter(Boolean).join(', ');
};

const formatPickupStreetAddress = (place = {}) => {
  return [
    place.houseDetails || place.street,
    place.subdivision,
    place.barangay
  ].filter(Boolean).join(', ');
};

const getPlaceLabel = (place = {}, fallback = 'Snorlax Garage') => {
  return place.landmark || formatPlaceAddress(place) || fallback;
};

const getCheckoutPlaceLabel = (place = {}, fallback = 'Pickup Point') => (
  place.landmark || formatPlaceAddressWithoutHouseNo(place) || formatPlaceAddress(place) || fallback
).replace(/^\d+\s+/, '');

const getCheckoutPlaceAddress = (place = {}, { includeHouseNo = false } = {}) => (
  includeHouseNo ? formatPlaceAddress(place) : formatPlaceAddressWithoutHouseNo(place)
).replace(/^\d+\s+/, '');

const hasCheckoutSettings = (admin) => {
  return Boolean(admin?.shippingMethods || admin?.pickupDetails || admin?.paymentSettings);
};

const isFreeShippingActive = (item = {}, stock = null) => {
  const eligible = Boolean(item.isFreeShippingEligible || stock?.isFreeShippingEligible);
  if (!eligible) return false;
  const until = item.freeShippingUntil || stock?.freeShippingUntil || '';
  if (!until) return true;
  const expiry = new Date(until).getTime();
  return Number.isNaN(expiry) || Date.now() < expiry;
};

const normalizePromoValue = (value) => String(value ?? '').trim().toLowerCase();
const promoValuesMatch = (a, b) => normalizePromoValue(a) === normalizePromoValue(b);

const isItemShippingEligibleForFreeShipping = (item, method, suboptionVal) => {
  if (!isFreeShippingActive(item, null)) return false;
  
  const promoMethod = item.freeShippingMethod || 'All';
  if (promoMethod === 'All') return true;
  if (!promoValuesMatch(promoMethod, method)) return false;
  
  const promoSub = item.freeShippingSuboption || 'All';
  if (promoSub === 'All') return true;
  const suboptionCandidates = Array.isArray(suboptionVal) ? suboptionVal : [suboptionVal];
  return suboptionCandidates.some(candidate => promoValuesMatch(candidate, promoSub));
};

const getSuboptionCandidatesFromKey = (shippingMethods, method, subKey) => {
  if (!subKey) return ['All'];
  const label = shippingMethods?.[method]?.suboptions?.[subKey]?.label;
  
  // Legacy compatibility mappings
  let legacyVals = [];
  if (subKey === 'standard-delivery') {
    legacyVals = ['cop', 'seller', 'delivery', 'COP', 'Standard Delivery'];
  } else if (subKey === 'cop' || subKey === 'COP') {
    legacyVals = ['standard-delivery', 'Standard Delivery'];
  } else if (subKey === 'seller' || subKey === 'Seller-Booking' || subKey === 'self' || subKey === 'Self-Booking') {
    legacyVals = ['standard-delivery', 'Standard Delivery'];
  } else if (subKey === 'delivery' || subKey === 'Standard Delivery') {
    legacyVals = ['standard-delivery', 'Standard Delivery'];
  }
  
  return Array.from(new Set([
    subKey,
    label,
    ...legacyVals
  ].filter(Boolean)));
};

const getSelectedShippingSubKey = (checkoutData = {}) => {
  return checkoutData.selectedSuboption || checkoutData.customSuboption || null;
};

const itemHasFreeShippingForSubKey = (item, method, subKey, shippingMethods) => {
  if (!isFreeShippingActive(item, null)) return false;
  const suboptionCandidates = getSuboptionCandidatesFromKey(shippingMethods, method, subKey);
  return isItemShippingEligibleForFreeShipping(item, method, suboptionCandidates);
};

function ChangeView({ center }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 16);
  }, [center, map]);
  return null;
}

function CountdownTimer({ createdAt, isMaintenance }) {
  const [timeLeftStr, setTimeLeftStr] = useState('');

  useEffect(() => {
    const calculateTime = () => {
      const start = createdAt ? new Date(createdAt).getTime() : new Date().getTime();
      let end;
      if (isMaintenance) {
        end = start + (60 * 60 * 1000); // 1 hour
      } else {
        const nextDay = new Date(start);
        nextDay.setDate(nextDay.getDate() + 1);
        nextDay.setHours(20, 0, 0, 0);
        end = nextDay.getTime();
      }
      
      const now = new Date().getTime();
      const diff = end - now;
      
      if (diff <= 0) {
        setTimeLeftStr('Time expired');
        return;
      }
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      
      if (hours > 0) {
        setTimeLeftStr(`Settle payment within ${hours}h ${mins}m ${secs}s`);
      } else {
        setTimeLeftStr(`Settle payment within ${mins}:${secs.toString().padStart(2, '0')}`);
      }
    };

    calculateTime();
    const timer = setInterval(calculateTime, 1000);
    return () => clearInterval(timer);
  }, [createdAt, isMaintenance]);

  return <span>{timeLeftStr}</span>;
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


export default function CheckoutModal({ isOpen, onClose, items = [], isGuestPreview = false }) {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const { 
    user, reserveStockForCheckout, createOrder, isAdmin, isAdminView,
    removeFromBasket, kits, shelf, uploadReceipt, rates, updateUserProfile,
    adminsList, fetchAdmins, assignStockToOrder, adminData, garageInfo, setLoginModalOpen
  } = useStore();

  const [checkoutStep, setCheckoutStep] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [createdOrderIds, setCreatedOrderIds] = useState([]);
  const [orderCreatedAt, setOrderCreatedAt] = useState(null);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  
  const getMinTime = useCallback((startHour, endHour) => {
    const now = new Date();
    let minTime = new Date(now.getTime() + 30 * 60000);
    const currentMinutes = minTime.getHours() * 60 + minTime.getMinutes();
    
    if (currentMinutes < startHour * 60) {
      minTime.setHours(startHour, 0, 0, 0);
    } else if (currentMinutes > endHour * 60) {
      minTime.setDate(minTime.getDate() + 1);
      minTime.setHours(startHour, 0, 0, 0);
    }
    
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(minTime - tzoffset)).toISOString().slice(0, 16);
  }, []);

  const handleScheduleChange = (val, startHour, endHour, field) => {
    if (!val) return;

    const selected = new Date(val);
    const minAllowedTimeISO = getMinTime(startHour, endHour); 
    const minAllowed = new Date(minAllowedTimeISO);

    if (selected < minAllowed) {
      updateCheckoutData(prev => ({ ...prev, [field]: minAllowedTimeISO }));
    } else {
      updateCheckoutData(prev => ({ ...prev, [field]: val }));
    }
  };

  const [checkoutData, setCheckoutData] = useState({
    shippingMethod: '', 
    lbcType: '', 
    lbcBranch: '',
    lalamoveType: '',
    spxType: '',
    meetupLocation: '',
    meetupLocationIndex: null,
    meetupSchedule: '',
    pickupLocation: '',
    pickupLocationIndex: null,
    pickupSchedule: '',
    lalamoveSchedule: '',
    paymentPlan: '', 
    paymentMethod: '',
    initialPayment: 0
  });

  const [addressStatus, setAddressStatus] = useState({
    isPinConfirmed: false,
    isEditingAddress: false
  });

  const mapRef = useRef(null);

  const [validationState, setValidationState] = useState({
    zipCode: true,
    province: true,
    city: true,
    barangay: true
  });

  const [deliveryData, setDeliveryData] = useState({
    receiverName: "",
    email: "",
    phoneNumber: "",
    landmark: "",
    houseNo: "",
    houseDetails: "",
    subdivision: "",
    barangay: "",
    city: "",
    province: "",
    zipCode: "",
    lat: DEFAULT_DELIVERY_COORDS.lat,
    lng: DEFAULT_DELIVERY_COORDS.lng
  });
  const deliveryDataRef = useRef(deliveryData);
  const checkoutDataRef = useRef(checkoutData);
  const hasPreselectedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      hasPreselectedRef.current = false;
    }
  }, [isOpen]);

  const updateDeliveryData = useCallback((updater) => {
    setDeliveryData(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      deliveryDataRef.current = next;
      return next;
    });
  }, []);

  const updateCheckoutData = useCallback((updater) => {
    setCheckoutData(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      checkoutDataRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    deliveryDataRef.current = deliveryData;
  }, [deliveryData]);

  useEffect(() => {
    checkoutDataRef.current = checkoutData;
  }, [checkoutData]);

  useEffect(() => {
    console.log("CheckoutModal items prop updated:", items);
  }, [items]);

  useEffect(() => {
    if (!isOpen) return;

    const details = user?.userDetails || {};
    const primaryDelivery = user?.deliveryDetails?.[0] || {};
    
    updateDeliveryData({
      receiverName: details.receiverName || primaryDelivery.receiverName || user?.displayName || "",
      email: details.email || user?.email || "",
      phoneNumber: details.mobileNo || primaryDelivery.phoneNumber || "",
      landmark: primaryDelivery.landmark || "",
      houseNo: primaryDelivery.houseNo || "",
      houseDetails: primaryDelivery.houseDetails || "",
      subdivision: primaryDelivery.subdivision || "",
      barangay: primaryDelivery.barangay || "",
      city: primaryDelivery.city || "",
      province: primaryDelivery.province || "",
      zipCode: primaryDelivery.zipCode || "",
      lat: Number(primaryDelivery.lat) || DEFAULT_DELIVERY_COORDS.lat,
      lng: Number(primaryDelivery.lng) || DEFAULT_DELIVERY_COORDS.lng
    });
    
    // Batch updates using functional update to satisfy ESLint
    setAddressStatus(prev => ({
        ...prev,
        isPinConfirmed: Boolean(primaryDelivery.lat && primaryDelivery.lng),
        isEditingAddress: false
    }));
  }, [isOpen, user?.userDetails, user?.deliveryDetails, user?.displayName, user?.email, user?.mobileNo, updateDeliveryData]);

  useEffect(() => {
    if (isOpen) {
      const unsub = fetchAdmins();
      return () => unsub?.();
    }
  }, [isOpen, fetchAdmins]);

  const { shippingSettings } = useStore();

  const storeAdmin = useMemo(() => {
    if (hasCheckoutSettings(shippingSettings)) return shippingSettings;
    if (hasCheckoutSettings(adminData)) return adminData;
    if (hasCheckoutSettings(garageInfo?.checkoutSettings)) return garageInfo.checkoutSettings;
    return (adminsList || []).find(a => a.shippingMethods && a.pickupDetails) ||
      (adminsList || []).find(hasCheckoutSettings) ||
      null;
  }, [adminData, garageInfo, adminsList, shippingSettings]);

  const isMaintenance = useMemo(() => {
    return storeAdmin?.paymentSettings?.maintenanceMode === true;
  }, [storeAdmin]);

  const isAdminCheckoutConfigReady = Boolean(storeAdmin);

  const pickupPoints = useMemo(() => {
    const rawPickup = storeAdmin?.pickupDetails?.['pickup-point'];
    if (!rawPickup) return [];
    return (rawPickup.places || (rawPickup.landmark ? [rawPickup] : [])).filter(p => p.isActive !== false);
  }, [storeAdmin]);

  const usesPickupPoint = useMemo(() => {
    const method = checkoutData.shippingMethod;
    if (!method) return false;
    const subKey = getSelectedShippingSubKey(checkoutData);
    const methodConfig = storeAdmin?.shippingMethods?.[method];
    return checkUsesPickupPoint(method, methodConfig, subKey);
  }, [checkoutData, storeAdmin]);

  const usesMeetupLocation = useMemo(() => {
    const method = checkoutData.shippingMethod;
    if (!method) return false;
    const subKey = getSelectedShippingSubKey(checkoutData);
    const methodConfig = storeAdmin?.shippingMethods?.[method];
    return checkUsesMeetupLocation(method, methodConfig, subKey);
  }, [checkoutData, storeAdmin]);

  const selectedPickupDetails = useMemo(() => {
    if (!usesPickupPoint) return null;
    const byIndex = Number.isInteger(checkoutData.pickupLocationIndex)
      ? pickupPoints[checkoutData.pickupLocationIndex]
      : null;
    if (byIndex && byIndex.isActive !== false) return byIndex;
    return pickupPoints.find((p, idx) => {
      const fallbackLabel = `Pickup Point ${idx + 1}`;
      return [
        getCheckoutPlaceLabel(p, fallbackLabel),
        getCheckoutPlaceAddress(p),
        getPlaceLabel(p, fallbackLabel),
        formatPlaceAddressWithoutHouseNo(p),
        formatPlaceAddress(p)
      ].filter(Boolean).some(value => value === checkoutData.pickupLocation);
    }) || pickupPoints[0] || null;
  }, [pickupPoints, checkoutData.pickupLocation, checkoutData.pickupLocationIndex, usesPickupPoint]);

  const shopDefaultLocation = useMemo(() => {
    if (selectedPickupDetails?.lat && selectedPickupDetails?.lng) return [selectedPickupDetails.lat, selectedPickupDetails.lng];
    return [14.2965, 121.1118];
  }, [selectedPickupDetails]);

  const selectedMeetupDetails = useMemo(() => {
    if (!usesMeetupLocation) return null;
    const places = storeAdmin?.pickupDetails?.meetup?.places || [];
    const activePlaces = places.filter(p => p.isActive !== false);
    const byIndex = Number.isInteger(checkoutData.meetupLocationIndex)
      ? activePlaces[checkoutData.meetupLocationIndex]
      : null;
    if (byIndex && byIndex.isActive !== false) return byIndex;
    return activePlaces.find((p, idx) => {
      const fallbackLabel = `Meetup Place ${idx + 1}`;
      return [
        getCheckoutPlaceLabel(p, fallbackLabel),
        getCheckoutPlaceAddress(p),
        getPlaceLabel(p, fallbackLabel),
        formatPlaceAddressWithoutHouseNo(p),
        formatPlaceAddress(p)
      ].filter(Boolean).some(value => value === checkoutData.meetupLocation);
    }) || activePlaces[0] || null;
  }, [storeAdmin, checkoutData.meetupLocation, checkoutData.meetupLocationIndex, usesMeetupLocation]);

  const meetupCoord = useMemo(() => {
    if (selectedMeetupDetails?.lat && selectedMeetupDetails?.lng) {
      return [selectedMeetupDetails.lat, selectedMeetupDetails.lng];
    }
    return shopDefaultLocation;
  }, [selectedMeetupDetails, shopDefaultLocation]);

  const checkoutItems = useMemo(() => {
    const { handlingFee, installmentFee, transferFee } = getCheckoutPaymentFees({ shippingSettings: storeAdmin });
    
    return (items || []).map(item => {
      const quantity = item.quantity || 1;
      const kit = kits.find(k => k.id === item.id);
      const appliedHandlingFee = Number(item.appliedHandlingFee) > 0 ? Number(item.appliedHandlingFee) : handlingFee;
      const appliedInstallmentFee = Number(item.appliedInstallmentFee) > 0 ? Number(item.appliedInstallmentFee) : installmentFee;
      const appliedTransferFee = Number(item.appliedTransferFee) > 0 ? Number(item.appliedTransferFee) : transferFee;
      const basePrice = getCheckoutItemBasePrice(item, kit, {
        handling: appliedHandlingFee,
        installment: appliedInstallmentFee,
        transfer: appliedTransferFee
      });
      
      return {
        ...item,
        quantity,
        price: basePrice, // Unit price (base)
        sellPrice: basePrice,
        displayPrice: basePrice, // Base price per unit
        image: item.image || kit?.image || null,
        images: item.images || kit?.images || null,
        appliedHandlingFee,
        appliedInstallmentFee,
        appliedTransferFee,
        isFreeShippingEligible: isFreeShippingActive(item, kit?.stocks?.[item.stockKey]),
        freeShippingUntil: item.freeShippingUntil || kit?.stocks?.[item.stockKey]?.freeShippingUntil || '',
        freeShippingMethod: item.freeShippingMethod || kit?.stocks?.[item.stockKey]?.freeShippingMethod || 'All',
        freeShippingSuboption: item.freeShippingSuboption || kit?.stocks?.[item.stockKey]?.freeShippingSuboption || 'All'
      };
    });
  }, [items, kits, storeAdmin]);


  const hasPreOrders = useMemo(() => {
    return checkoutItems.some(item => {
      if (item.type === 'project') return false;
      const itemStatus = (item.status || '').toUpperCase();
      const kit = (kits || []).find(k => k.id === item.id);
      const stockStatus = (kit?.stocks?.[item.stockKey]?.status || '').toUpperCase();
      return itemStatus.includes('PRE-ORDER') || item.isPreOrder || stockStatus.includes('PRE-ORDER');
    });
  }, [checkoutItems, kits]);

  const hasProjects = useMemo(() => {
    return checkoutItems.some(item => item.type === 'project');
  }, [checkoutItems]);

  // Detect if selected suboption is a "Cash On" variant (COD/COP/custom)
  const isCashOnSuboption = useMemo(() => {
    const selectedSubKey = getSelectedShippingSubKey(checkoutData, storeAdmin?.shippingMethods);
    const suboptionLabel = selectedSubKey
      ? (getSuboptionLabel(storeAdmin?.shippingMethods, checkoutData.shippingMethod, selectedSubKey) || '')
      : '';
    return (selectedSubKey || '').toLowerCase() === 'cod' || 
      (selectedSubKey || '').toLowerCase() === 'cop' || 
      suboptionLabel.toLowerCase().includes('cash on');
  }, [checkoutData, storeAdmin]);


  const orderFees = useMemo(() => {
    const handling = Number(storeAdmin?.paymentSettings?.handlingFee ?? storeAdmin?.pickupDetails?.handlingFee ?? 0);
    const transfer = Number(storeAdmin?.paymentSettings?.transferFee ?? 0);
    return { handling, transfer };
  }, [storeAdmin]);

  const totalAppliedHandlingFee = useMemo(() => orderFees.handling, [orderFees]);
  const projectInstallmentFee = useMemo(() => {
    return hasProjects ? (checkoutItems.find(item => item.type === 'project')?.appliedInstallmentFee || 0) : 0;
  }, [checkoutItems, hasProjects]);

  const kitInstallmentFeesTotal = useMemo(() => {
    return checkoutItems
      .filter(item => item.type !== 'project')
      .reduce((sum, item) => sum + (item.appliedInstallmentFee || 0) * (item.quantity || 1), 0);
  }, [checkoutItems]);

  const totalAppliedInstallmentFee = useMemo(() => kitInstallmentFeesTotal + projectInstallmentFee, [kitInstallmentFeesTotal, projectInstallmentFee]);

  const totalAppliedTransferFee = useMemo(() => orderFees.transfer, [orderFees]);

// HANAPIN AT I-UPDATE ANG BASETOTAL SA IYONG CHECKOUTMODAL.JSX
const baseTotal = useMemo(() => {
  // 1. Kunin muna ang sum ng lahat ng items (Base Price + Installment Fee * Quantity)
  const itemsTotal = checkoutItems.reduce((total, item) => {
    const basePrice = Number(item.price || item.sellPrice || item.projectData?.sellPrice || 0);
    const installmentFee = Number(item.appliedInstallmentFee) || 0;
    
    return total + (basePrice + installmentFee) * (item.quantity || 1);
  }, 0);

  // 2. I-add ang Handling at Transfer Fee ng ISANG BESES LANG (Per Order) sa pinakahuli
  // Sa ganitong paraan, hindi mababawasan ang final total mo pero hindi rin madodoble kada item!
  return itemsTotal + (orderFees.handling || 0) + (orderFees.transfer || 0);

}, [checkoutItems, orderFees]);

  const transferFeeDiscount = useMemo(() => {
    if (!checkoutData.shippingMethod || !checkoutData.paymentMethod) return 0;
    const methodConfig = getPaymentMethodConfig(storeAdmin?.paymentSettings?.methods, checkoutData.paymentMethod);
    return methodConfig.transferDiscount ? totalAppliedTransferFee : 0;
  }, [checkoutData.shippingMethod, checkoutData.paymentMethod, totalAppliedTransferFee, storeAdmin]);



  const handlingFeeDiscount = useMemo(() => {
    if (!checkoutData.shippingMethod) return 0;
    const method = checkoutData.shippingMethod;
    const subKey = getSelectedShippingSubKey(checkoutData);
    const shouldDiscountHandling = getHandlingDiscountSetting(storeAdmin?.shippingMethods, method, subKey);
    if (!shouldDiscountHandling) return 0;
    return totalAppliedHandlingFee;
  }, [checkoutData, storeAdmin?.shippingMethods, totalAppliedHandlingFee]);

  const installmentFeeDiscount = useMemo(() => {
    const hasDiscount = checkoutData.paymentPlan === 'full';
    return hasDiscount ? totalAppliedInstallmentFee : 0;
  }, [checkoutData.paymentPlan, totalAppliedInstallmentFee]);

  const garageDiscount = useMemo(() => {
    return handlingFeeDiscount + installmentFeeDiscount + transferFeeDiscount;
  }, [handlingFeeDiscount, installmentFeeDiscount, transferFeeDiscount]);

  const totalToSettle = useMemo(() => {
    const result = (baseTotal || 0) - garageDiscount;
    return isNaN(result) ? 0 : Math.max(0, result);
  }, [baseTotal, garageDiscount]);

  const isInstallmentPlan = useMemo(() => (
    checkoutData.paymentPlan === 'partial' ||
    checkoutData.paymentPlan === 'reservation'
  ), [checkoutData.paymentPlan]);

  const amountDueNow = useMemo(() => {
    return isInstallmentPlan ? Number(checkoutData.initialPayment || 0) : totalToSettle;
  }, [checkoutData.initialPayment, isInstallmentPlan, totalToSettle]);

  const minInitialPayment = useMemo(() => {
    const hasStlWithDesignService = checkoutItems.some(item => 
      item.type === 'project' && 
      item.projectData?.method?.name?.toUpperCase() === 'STL' && 
      item.projectData?.selectedDesignService
    );

    if (hasStlWithDesignService) {
      const sum = checkoutItems.reduce((acc, item) => {
        if (item.type === 'project' && item.projectData?.method?.name?.toUpperCase() === 'STL' && item.projectData?.selectedDesignService) {
          const serviceId = item.projectData.selectedDesignService;
          const dsRates = rates?.['design-services'] || {};
          const basePrice = Number(dsRates[serviceId]?.basePrice) || 0;
          return acc + basePrice;
        }
        return acc + Number(item.minDownpayment ?? item.projectData?.minDownpayment ?? 0);
      }, 0);
      return isNaN(sum) ? 0 : Math.min(Math.max(0, sum), totalToSettle);
    }

    const itemDownpayments = checkoutItems.map(item => Number(item.minDownpayment ?? item.projectData?.minDownpayment ?? 0));
    const maxItemDown = Math.max(0, ...itemDownpayments);
    const base = maxItemDown > 0 ? maxItemDown : (rates?.general?.downpayment || 500);
    // Always ceiling the base minimum by 10s
    const ceilingBase = Math.ceil(base / 10) * 10;
    // Cap the minimum by the total to settle
    return isNaN(ceilingBase) ? 0 : Math.min(Math.max(0, ceilingBase), totalToSettle);
  }, [checkoutItems, rates, totalToSettle]);

  const isMethodFreeShipping = useCallback((method, subKey = null) => {
    if (checkoutItems.length === 0) return false;
    // Gamitin ang label ng suboption para sa free shipping matching
    const suboptionVal = getSuboptionCandidatesFromKey(storeAdmin?.shippingMethods, method, subKey);
    return checkoutItems.some(item =>
      isItemShippingEligibleForFreeShipping(item, method, suboptionVal)
    );
  }, [checkoutItems, storeAdmin?.shippingMethods]);

  const isFreeShippingApplied = useMemo(() => {
    if (!checkoutData.shippingMethod) return false;
    const method = checkoutData.shippingMethod;
    const subKey = getSelectedShippingSubKey(checkoutData);
    return isMethodFreeShipping(method, subKey);
  }, [checkoutData, isMethodFreeShipping]);

  // Sync initial payment with bounds when plan, min, or total changes
  useEffect(() => {
    if (checkoutData.paymentPlan && checkoutData.paymentPlan !== 'full') {
      const current = Number(checkoutData.initialPayment) || 0;
      if (current < minInitialPayment) {
        updateCheckoutData(prev => ({ ...prev, initialPayment: minInitialPayment }));
      } else if (current > totalToSettle) {
        updateCheckoutData(prev => ({ ...prev, initialPayment: totalToSettle }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minInitialPayment, totalToSettle, checkoutData.paymentPlan, updateCheckoutData]);

  // Generic free-shipping config override para sa lahat ng methods
  // Kung ang isang item ay may free shipping para sa specific method+suboption, i-force enable ang method
  const getMethodConfigWithFreeShipping = useCallback((methodName) => {
    const baseConfig = storeAdmin?.shippingMethods?.[methodName];

    // Check if any checkout item has a free shipping promo configured for this methodName
    const hasFreeForMethod = checkoutItems.some(item => {
      if (!isFreeShippingActive(item, null)) return false;
      const promoMethod = item.freeShippingMethod || 'All';
      return promoMethod === 'All' || promoValuesMatch(promoMethod, methodName);
    });

    if (!hasFreeForMethod) {
      return baseConfig;
    }

    // Track whether the method itself was originally disabled.
    // When it was disabled, only the promo-specific suboptions should be exposed.
    const wasMethodDisabled = !isMethodEnabled(baseConfig);

    // Force active true if there is a free shipping promo
    let baseObj = typeof baseConfig === 'object' && baseConfig !== null
      ? { ...baseConfig }
      : { active: true };

    baseObj.active = true;

    // Check all suboptions (including disabled ones) for a free shipping promo.
    // If there is free shipping for a suboption, force-enable it for checkout.
    const suboptions = { ...(baseObj.suboptions || {}) };
    const freeShippingSubOverrides = {};

    Object.entries(suboptions).forEach(([subKey, subVal]) => {
      const hasFree = checkoutItems.some(item =>
        itemHasFreeShippingForSubKey(item, methodName, subKey, storeAdmin?.shippingMethods)
      );
      if (hasFree) {
        freeShippingSubOverrides[subKey] = { ...subVal, active: true, _freeShippingForced: true };
      }
    });

    // Kapag may kahit anong suboption na may free shipping, i-force-enable din ang standard-delivery
    const anyCustomSubHasFree = Object.keys(freeShippingSubOverrides).length > 0;
    if (anyCustomSubHasFree && suboptions['standard-delivery']) {
      freeShippingSubOverrides['standard-delivery'] = { 
        ...suboptions['standard-delivery'], 
        active: true, 
        _freeShippingForced: true 
      };
    }

    // Key rule: when the method itself was disabled, ONLY expose the suboptions that
    // have a free shipping promo — do NOT expose other suboptions even if they are
    // individually enabled in Firebase. The free shipping promo unlocks exactly what
    // was configured for the promotion, nothing more.
    // When the method was already enabled, keep all existing suboptions and additionally
    // unlock any disabled suboption that has a promo.
    const finalSuboptions = wasMethodDisabled
      ? freeShippingSubOverrides
      : { ...suboptions, ...freeShippingSubOverrides };

    // Para sa standard couriers (SPX, LBC, Lalamove) na nag-iimbak ng suboption state
    // bilang top-level boolean key (e.g. SPX Express.delivery = false) kaysa sa nested
    // suboptions map, i-force-enable din ang top-level key kapag may free shipping promo.
    // Ito ay para ma-enable ang Standard Delivery suboption kahit naka-disable sa Firebase
    // kapag ang courier ay may free shipping promo para doon.
    const topLevelSubKeys = methodName === 'LBC' ? ['cop', 'cod']
      : methodName === 'Lalamove' ? ['self', 'seller']
      : methodName === 'SPX Express' ? ['delivery', 'cod']
      : [];
    // Ang standard delivery key ng bawat courier
    const standardSubKey = methodName === 'LBC' ? 'cop'
      : methodName === 'Lalamove' ? 'seller'
      : methodName === 'SPX Express' ? 'delivery'
      : null;
    const topLevelOverrides = {};
    let anySubHasFree = false;
    topLevelSubKeys.forEach(subKey => {
      const hasFree = checkoutItems.some(item =>
        itemHasFreeShippingForSubKey(item, methodName, subKey, storeAdmin?.shippingMethods)
      );
      if (hasFree) {
        // I-override ang top-level key sa true para ma-enable ng isSubMethodEnabled
        topLevelOverrides[subKey] = true;
        anySubHasFree = true;
      }
    });
    // Kapag may kahit anong free shipping promo ang courier, i-force-enable din
    // ang standard delivery suboption kahit wala itong sariling promo
    if (anySubHasFree && standardSubKey && !topLevelOverrides[standardSubKey]) {
      topLevelOverrides[standardSubKey] = true;
    }

    return {
      ...baseObj,
      ...topLevelOverrides,
      suboptions: finalSuboptions,
      // Propagate the flag so downstream filters/renderers can apply the same rule
      // for standard methods whose suboptions are not stored in the suboptions map.
      _wasDisabled: wasMethodDisabled
    };
  }, [storeAdmin?.shippingMethods, checkoutItems]);

  const enabledShippingMethods = useMemo(() => {
    if (!isAdminCheckoutConfigReady) return {};
    const rawMethods = storeAdmin?.shippingMethods || {};
    const result = {};
    
    // Collect all methods from rawMethods and checkoutItems' freeShippingMethod
    const allMethodNames = new Set(Object.keys(rawMethods));
    checkoutItems.forEach(item => {
      if (isFreeShippingActive(item, null) && item.freeShippingMethod && item.freeShippingMethod !== 'All') {
        allMethodNames.add(item.freeShippingMethod);
      }
    });

    allMethodNames.forEach(m => {
      result[m] = getMethodConfigWithFreeShipping(m);
    });
    return result;
  }, [isAdminCheckoutConfigReady, storeAdmin, getMethodConfigWithFreeShipping, checkoutItems]);

  const shippingOptions = useMemo(() => {
    if (!isAdminCheckoutConfigReady) return [];
    const rawMethods = enabledShippingMethods;

    return Object.keys(rawMethods)
      .filter(m => m !== 'Free Shipping')
      .filter(m => {
        const effectiveConfig = rawMethods[m];
        if (!isMethodEnabled(effectiveConfig)) return false;

        const methodConfig = typeof effectiveConfig === 'object' ? effectiveConfig : {};

        // Local pickup/meetup methods — gated by available places
        if (m === 'Seller Meetup') return (storeAdmin?.pickupDetails?.meetup?.places || []).some(p => p.isActive !== false);
        if (m === 'Self-Pickup') return pickupPoints.length > 0;

        // Methods with suboptions: need at least one active suboption
        const hasSuboptions = methodConfig.hasSuboptions || Object.keys(methodConfig.suboptions || {}).length > 0;
        if (hasSuboptions) {
          const suboptions = methodConfig.suboptions || {};
          return Object.values(suboptions).some(sub => {
            const effectiveSub = sub; // free shipping override already applied above
            if (effectiveSub.active === false) return false;
            // If isSelfBooking: needs pickup points available
            if (effectiveSub.isSelfBooking && pickupPoints.length === 0) return false;
            return true;
          });
        }

        // Standard courier methods also might have suboptions like cop/cod directly on config
        // or we need to check if they have at least one active suboption.
        if (['SPX Express', 'LBC', 'Lalamove'].includes(m)) {
          const subKeys = m === 'LBC' ? ['cop', 'cod']
                        : m === 'Lalamove' ? ['self', 'seller']
                        : ['delivery', 'cod'];
          const methodWasDisabled = effectiveConfig?._wasDisabled;
          return subKeys.some(subKey => {
            if (m === 'Lalamove' && subKey === 'self' && pickupPoints.length === 0) return false;
            const hasFreePromo = checkoutItems.some(item => itemHasFreeShippingForSubKey(item, m, subKey, storeAdmin?.shippingMethods));
            // Kung disabled ang method, ipakita lang ang suboption na may free shipping promo
            if (methodWasDisabled && !hasFreePromo) return false;
            return isSubMethodEnabled(effectiveConfig, subKey) || hasFreePromo;
          });
        }

        return true;
      })
      .sort((a, b) => {
        const getPriority = (methodName) => {
          if (methodName === 'Self-Pickup') return 5;
          if (methodName === 'Seller Meetup') return 4;

          const config = rawMethods[methodName] || storeAdmin?.shippingMethods?.[methodName];
          const hasSuboptions = config?.hasSuboptions || Object.keys(config?.suboptions || {}).length > 0;

          // 1. Check for Free Shipping
          let isFree = isMethodFreeShipping(methodName);
          if (hasSuboptions && config.suboptions) {
            isFree = isFree || Object.keys(config.suboptions).some(subKey => {
              const sub = config.suboptions[subKey];
              if (sub.active === false) return false;
              return isMethodFreeShipping(methodName, subKey);
            });
          } else if (['SPX Express', 'LBC', 'Lalamove'].includes(methodName)) {
            const subKeys = methodName === 'LBC' ? ['cop', 'cod']
                          : methodName === 'Lalamove' ? ['self', 'seller']
                          : ['delivery', 'cod'];
            isFree = isFree || subKeys.some(subKey => {
              if (methodName === 'Lalamove' && subKey === 'self' && pickupPoints.length === 0) return false;
              const hasFreePromo = checkoutItems.some(item => itemHasFreeShippingForSubKey(item, methodName, subKey, storeAdmin?.shippingMethods));
              const isEnabled = isSubMethodEnabled(config, subKey) || hasFreePromo;
              if (!isEnabled) return false;
              return isMethodFreeShipping(methodName, subKey);
            });
          }
          if (isFree) return 1;

          // 2. Check for Discount
          let hasDiscount = getHandlingDiscountSetting(storeAdmin?.shippingMethods, methodName);
          if (hasSuboptions && config.suboptions) {
            hasDiscount = hasDiscount || Object.keys(config.suboptions).some(subKey => {
              const sub = config.suboptions[subKey];
              if (sub.active === false) return false;
              return getHandlingDiscountSetting(storeAdmin?.shippingMethods, methodName, subKey);
            });
          } else if (['SPX Express', 'LBC', 'Lalamove'].includes(methodName)) {
            const subKeys = methodName === 'LBC' ? ['cop', 'cod']
                          : methodName === 'Lalamove' ? ['self', 'seller']
                          : ['delivery', 'cod'];
            hasDiscount = hasDiscount || subKeys.some(subKey => {
              if (methodName === 'Lalamove' && subKey === 'self' && pickupPoints.length === 0) return false;
              const hasFreePromo = checkoutItems.some(item => itemHasFreeShippingForSubKey(item, methodName, subKey, storeAdmin?.shippingMethods));
              const isEnabled = isSubMethodEnabled(config, subKey) || hasFreePromo;
              if (!isEnabled) return false;
              return getHandlingDiscountSetting(storeAdmin?.shippingMethods, methodName, subKey);
            });
          }
          if (hasDiscount) return 2;

          return 3;
        };

        return getPriority(a) - getPriority(b);
      });
  }, [isAdminCheckoutConfigReady, enabledShippingMethods, pickupPoints, storeAdmin, checkoutItems, isMethodFreeShipping]);

  const buildShippingData = useCallback((m, sourceData) => {
    const methodConfig = storeAdmin?.shippingMethods?.[m];
    
    // Find best suboption
    let bestSubKey = '';
    if (methodConfig?.hasSuboptions && methodConfig.suboptions) {
      const suboptions = Object.entries(methodConfig.suboptions).filter(([subKey, subVal]) => {
        const hasFreePromo = checkoutItems.some(item => 
          itemHasFreeShippingForSubKey(item, m, subKey, storeAdmin?.shippingMethods)
        );
        return subVal.active !== false || hasFreePromo;
      });
      
      if (suboptions.length > 0) {
        const rated = suboptions.map(([subKey]) => {
          const isFree = isMethodFreeShipping(m, subKey);
          const hasDiscount = getHandlingDiscountSetting(storeAdmin?.shippingMethods, m, subKey);
          let priority = 3;
          if (isFree) priority = 1;
          else if (hasDiscount) priority = 2;
          return { subKey, priority };
        });
        
        rated.sort((a, b) => a.priority - b.priority);
        bestSubKey = rated[0].subKey;
      }
    }

    // Now determine pickup/meetup requirements
    const hasPickup = checkUsesPickupPoint(m, methodConfig, bestSubKey);
    const hasMeetup = checkUsesMeetupLocation(m, methodConfig, bestSubKey);

    let pickupLocation = '';
    let pickupLocationIndex = null;
    if (hasPickup && pickupPoints.length > 0) {
      pickupLocation = getCheckoutPlaceLabel(pickupPoints[0], 'Pickup Point 1');
      pickupLocationIndex = 0;
    }

    let meetupLocation = '';
    let meetupLocationIndex = null;
    const meetupPlaces = (storeAdmin?.pickupDetails?.meetup?.places || []).filter(p => p.isActive !== false);
    if (hasMeetup && meetupPlaces.length > 0) {
      meetupLocation = getCheckoutPlaceLabel(meetupPlaces[0], 'Meetup Place 1');
      meetupLocationIndex = 0;
    }

    return {
      ...sourceData,
      shippingMethod: m,
      selectedSuboption: bestSubKey,
      customSuboption: '',
      pickupLocation,
      pickupLocationIndex,
      meetupLocation,
      meetupLocationIndex,
      meetupSchedule: '',
      pickupSchedule: '',
      shippingSchedule: ''
    };
  }, [storeAdmin, checkoutItems, isMethodFreeShipping, pickupPoints]);

  const handleShippingChange = useCallback((m) => {
    let newCheckoutData;
    updateCheckoutData(prev => {
      newCheckoutData = buildShippingData(m, prev);
      return newCheckoutData;
    });
    // Side effects after state update
    const methodConfig = enabledShippingMethods?.[m] || storeAdmin?.shippingMethods?.[m];
    const selectedSubConfig = newCheckoutData?.selectedSuboption
      ? methodConfig?.suboptions?.[newCheckoutData.selectedSuboption]
      : null;
      
    // Determine if the selected suboption/method requires any address inputs
    const subFields = methodConfig ? getRequiredFields(methodConfig, newCheckoutData?.selectedSuboption) : [];
    const subNeedsAddress = subFields.some(id => [5, 6, 7, 8, 9, 10, 11, 12].includes(id));

    const isNoAddressNeeded =
      m === 'Self-Pickup' ||
      m === 'Seller Meetup' ||
      checkUsesPickupPoint(m, methodConfig, newCheckoutData?.selectedSuboption) ||
      checkUsesMeetupLocation(m, methodConfig, newCheckoutData?.selectedSuboption) ||
      selectedSubConfig?.isSelfBooking === true ||
      selectedSubConfig?.isPickupRequired === true ||
      !subNeedsAddress;

    setAddressStatus(prev => ({ ...prev, isEditingAddress: !isNoAddressNeeded }));
  }, [buildShippingData, updateCheckoutData, setAddressStatus, enabledShippingMethods, storeAdmin]);





  const { zipCode, barangay, city, province } = deliveryData;

  const lookupTrigger = useRef(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const newValidation = { zipCode: true, province: true, city: true, barangay: true };
      
      // Prevent syncing if triggered by the lookup itself (prevents infinite loops)
      if (lookupTrigger.current) return;

      let hasChanges = false;
      const updatedData = { ...deliveryDataRef.current };

      // 1. ZIP -> City/Province Lookup
      if (updatedData.zipCode?.length === 4 && (!updatedData.city || !updatedData.province)) {
        console.log("Triggering ZIP -> City/Province lookup for:", updatedData.zipCode);
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${updatedData.zipCode}&country=Philippines&format=json&addressdetails=1`);
          const data = await res.json();
          if (data && data.length > 0) {
            const addr = data[0].address;
            updatedData.city = addr.city || addr.town || addr.municipality || addr.village || updatedData.city;
            updatedData.province = addr.state || addr.region || updatedData.province;
            if (!addressStatus.isPinConfirmed) {
              updatedData.lat = parseFloat(data[0].lat);
              updatedData.lng = parseFloat(data[0].lon);
            }
            hasChanges = true;
            console.log("ZIP -> City/Province updated:", updatedData.city, updatedData.province);
          }
        } catch (err) { console.warn("ZIP lookup failed", err); }
      } 
      // 2. City/Province/Barangay -> ZIP Lookup
      else if (!updatedData.zipCode && updatedData.city?.length > 2 && updatedData.province?.length > 2) {
        console.log("Triggering Location -> ZIP lookup for:", updatedData.barangay, updatedData.city, updatedData.province);
        try {
          // Include barangay in query if available
          const query = `${updatedData.barangay ? updatedData.barangay + ', ' : ''}${updatedData.city}, ${updatedData.province}, Philippines`;
          const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`);
          const data = await res.json();
          
          console.log("Location -> ZIP response:", data);
          
          const resultWithZip = data.find(item => item.address && item.address.postcode && item.address.postcode.length === 4);
          
          if (resultWithZip) {
            updatedData.zipCode = resultWithZip.address.postcode;
            if (!addressStatus.isPinConfirmed) {
              updatedData.lat = parseFloat(resultWithZip.lat);
              updatedData.lng = parseFloat(resultWithZip.lon);
            }
            hasChanges = true;
            console.log("Location -> ZIP updated:", updatedData.zipCode);
          } else {
            console.log("No ZIP found for Location.");
          }
        } catch (err) { console.warn("ZIP reverse lookup failed", err); }
      }
      // 3. Map Sync for general address change
      else if (updatedData.barangay || updatedData.city || updatedData.province) {
         try {
             const query = `${[updatedData.barangay, updatedData.city, updatedData.province, 'Philippines'].filter(Boolean).join(', ')}`;
             const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
             const data = await res.json();
             if (data && data.length > 0) {
                 if (!addressStatus.isPinConfirmed) {
                   updatedData.lat = parseFloat(data[0].lat);
                   updatedData.lng = parseFloat(data[0].lon);
                 }
                 hasChanges = true;
             }
         } catch (err) { console.warn("Map sync failed", err); }
      }

      if (hasChanges) {
        lookupTrigger.current = 'sync';
        updateDeliveryData(updatedData);
      }

      // Final ZIP/Location existence validation
      if (updatedData.zipCode?.length === 4) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${updatedData.zipCode}&country=Philippines&format=json`);
          const data = await res.json();
          newValidation.zipCode = data.length > 0;
        } catch (e) { console.warn("ZIP validation error", e); }
      }
      
      setValidationState(newValidation);
      setTimeout(() => { lookupTrigger.current = null; }, 500);
    }, 1500);
    return () => clearTimeout(timer);
  }, [zipCode, barangay, city, province, updateDeliveryData, addressStatus.isPinConfirmed]);

  const requiredFields = useMemo(() => {
    if (!checkoutData.shippingMethod) return [];
    const method = checkoutData.shippingMethod;
    const subKey = getSelectedShippingSubKey(checkoutData, storeAdmin?.shippingMethods);
    const methodConfig = storeAdmin?.shippingMethods?.[method];
    if (methodConfig) {
      return getRequiredFields(methodConfig, subKey);
    }
    if (method === 'Seller Meetup' || method === 'Self-Pickup') {
      return [1, 2];
    }
    return [1, 2, 5, 6, 7, 9, 10, 11, 12];
  }, [checkoutData, storeAdmin]);

  const courierName = useMemo(() => {
    if (!checkoutData.shippingMethod) return 'LBC';
    const method = checkoutData.shippingMethod;
    const subKey = getSelectedShippingSubKey(checkoutData, storeAdmin?.shippingMethods);
    const methodConfig = storeAdmin?.shippingMethods?.[method];
    return getCourierName(method, subKey, methodConfig);
  }, [checkoutData, storeAdmin]);

  const isNoDetailsMode = useMemo(() => {
    return requiredFields.length === 0;
  }, [requiredFields]);

  const placeFieldIds = useMemo(() => (
    new Set([14, 15])
  ), []);

  const detailsInputFields = useMemo(() => (
    requiredFields.filter(id => !placeFieldIds.has(id))
  ), [requiredFields, placeFieldIds]);

  const hasConfiguredInputFields = useMemo(() => (
    detailsInputFields.length > 0
  ), [detailsInputFields]);

  const isLocalPlaceMethod = useMemo(() => (
    checkoutData.shippingMethod === 'Seller Meetup' ||
    checkoutData.shippingMethod === 'Self-Pickup' ||
    usesPickupPoint ||
    usesMeetupLocation
  ), [checkoutData.shippingMethod, usesPickupPoint, usesMeetupLocation]);

  const selectedLocalPlaceDetails = useMemo(() => {
    if (usesMeetupLocation) return selectedMeetupDetails;
    if (usesPickupPoint) return selectedPickupDetails;
    return null;
  }, [usesMeetupLocation, usesPickupPoint, selectedMeetupDetails, selectedPickupDetails]);

  const selectedLocalPlaceCoord = useMemo(() => {
    if (selectedLocalPlaceDetails?.lat && selectedLocalPlaceDetails?.lng) {
      return [selectedLocalPlaceDetails.lat, selectedLocalPlaceDetails.lng];
    }
    if (usesMeetupLocation) return meetupCoord;
    if (usesPickupPoint && selectedPickupDetails?.lat && selectedPickupDetails?.lng) return [selectedPickupDetails.lat, selectedPickupDetails.lng];
    return [14.2965, 121.1118];
  }, [selectedLocalPlaceDetails, usesMeetupLocation, meetupCoord, usesPickupPoint, selectedPickupDetails]);

  const isDetailsFormValid = useMemo(() => {
    if (requiredFields.includes(1) && !`${deliveryData.receiverName || ''}`.trim()) return false;
    if (requiredFields.includes(2) && !`${deliveryData.phoneNumber || ''}`.trim()) return false;
    if (requiredFields.includes(2) && deliveryData.phoneNumber && deliveryData.phoneNumber.length < 11) return false;
    if (requiredFields.includes(3) && !`${deliveryData.email || ''}`.trim()) return false;
    if (requiredFields.includes(4) && !`${deliveryData.landmark || ''}`.trim()) return false;
    if (requiredFields.includes(5) && !`${deliveryData.zipCode || ''}`.trim()) return false;
    if (requiredFields.includes(6) && !`${deliveryData.houseNo || ''}`.trim()) return false;
    if (requiredFields.includes(7) && !`${deliveryData.houseDetails || ''}`.trim()) return false;
    if (requiredFields.includes(8) && !`${deliveryData.subdivision || ''}`.trim()) return false;
    if (requiredFields.includes(9) && !`${deliveryData.barangay || ''}`.trim()) return false;
    if (requiredFields.includes(10) && !`${deliveryData.city || ''}`.trim()) return false;
    if (requiredFields.includes(11) && !`${deliveryData.province || ''}`.trim()) return false;
    if (requiredFields.includes(13)) {
      if (!`${checkoutData.lbcBranch || ''}`.trim()) return false;
      const prefix = `${courierName || 'LBC'} Express - `;
      if (checkoutData.lbcBranch.trim() === prefix.trim()) return false;
    }
    if ((requiredFields.includes(14) || usesPickupPoint) && !checkoutData.pickupLocation) return false;
    if ((requiredFields.includes(15) || usesMeetupLocation) && !checkoutData.meetupLocation) return false;
    return true;
  }, [requiredFields, deliveryData, checkoutData.lbcBranch, courierName, checkoutData.pickupLocation, checkoutData.meetupLocation, usesPickupPoint, usesMeetupLocation]);

  const isFormValid = useMemo(() => {
    if (isNoDetailsMode) return true;
    const requiresAddress = requiredFields.some(id => [5, 6, 7, 8, 9, 10, 11, 12].includes(id));
    if (requiresAddress && addressStatus.isEditingAddress) return false; // Kung nag-eedit pa ng address at required, invalid
    if (requiredFields.includes(12) && !addressStatus.isPinConfirmed) return false;
    return isDetailsFormValid;
  }, [isNoDetailsMode, addressStatus.isEditingAddress, addressStatus.isPinConfirmed, isDetailsFormValid, requiredFields]);

  const buildProfileUpdates = useCallback(() => {
    if (isLocalPlaceMethod) {
      return {
        userDetails: {
          ...(user?.userDetails || {}),
          email: deliveryData.email,
          mobileNo: deliveryData.phoneNumber,
          receiverName: deliveryData.receiverName
        }
      };
    }

    const existingDetails = user?.deliveryDetails?.[0] || {};
    let updatedDelivery = { ...existingDetails, type: 'delivery', isPrimary: true };

    updatedDelivery.landmark = deliveryData.landmark || '';
    updatedDelivery.houseNo = deliveryData.houseNo || '';
    updatedDelivery.houseDetails = deliveryData.houseDetails || '';
    updatedDelivery.subdivision = deliveryData.subdivision || '';
    updatedDelivery.barangay = deliveryData.barangay || '';
    updatedDelivery.city = deliveryData.city || '';
    updatedDelivery.province = deliveryData.province || '';
    updatedDelivery.zipCode = deliveryData.zipCode || '';
    updatedDelivery.lat = Number(deliveryData.lat) || DEFAULT_DELIVERY_COORDS.lat;
    updatedDelivery.lng = Number(deliveryData.lng) || DEFAULT_DELIVERY_COORDS.lng;

    if (requiredFields.includes(13)) {
      const prefix = `${courierName || 'LBC'} Express - `;
      const value = checkoutData.lbcBranch || '';
      const cleanValue = value.replace(new RegExp(`^${prefix}`, 'i'), '').trim();
      updatedDelivery.lbcBranch = cleanValue ? `${prefix}${cleanValue}` : '';
    } else {
      updatedDelivery.lbcBranch = '';
    }

    return {
      userDetails: {
        ...(user?.userDetails || {}),
        email: deliveryData.email,
        mobileNo: deliveryData.phoneNumber,
        receiverName: deliveryData.receiverName
      },
      deliveryDetails: [updatedDelivery]
    };
  }, [user, deliveryData, checkoutData.lbcBranch, requiredFields, courierName, isLocalPlaceMethod]);

  const handleConfirmDetails = useCallback(async () => {
    try {
      if (user && !isNoDetailsMode) {
        await updateUserProfile(user.uid, buildProfileUpdates());
      }
      setAddressStatus(prev => ({
          ...prev,
          isPinConfirmed: true,
          isEditingAddress: false
      }));
    } catch (err) {
      console.error(err);
      alert("Failed to save receiver details.");
    }
  }, [user, isNoDetailsMode, updateUserProfile, buildProfileUpdates, setAddressStatus]);

  const handleGoogleLogin = async () => {
    try {
      // Save current checkout progress AND delivery details before logging in
      localStorage.setItem('sg_pending_checkout', JSON.stringify(checkoutDataRef.current));
      localStorage.setItem('sg_pending_delivery', JSON.stringify(deliveryDataRef.current));
      
      useStore.setState({ isSyncing: true, syncStatus: 'Authorizing Session' });
      const result = await signInWithPopup(auth, googleProvider);
      useStore.setState({ syncStatus: 'Syncing Profile' });
      
      // Store user details in Firestore
      await setDoc(doc(db, 'users', result.user.uid), {
        email: result.user.email,
        displayName: result.user.displayName,
        photoURL: result.user.photoURL || '',
        lastLogin: serverTimestamp(),
        role: 'customer'
      }, { merge: true });

      useStore.setState({ isSyncing: false });
    } catch (err) {
      console.error(err);
      useStore.setState({ isSyncing: false });
    }
  };

const handleFinalizeOrder = async () => {
    if (isGuestPreview) {
      setLoginModalOpen(true);
      return;
    }

    if (!isNoDetailsMode && !isFormValid) {
      alert("Please complete delivery details and confirm map pin.");
      return;
    }

    if (checkoutData.paymentPlan !== 'full') {
      const currentInitial = Number(checkoutData.initialPayment) || 0;
      if (currentInitial < minInitialPayment) {
        const planLabel = checkoutData.paymentPlan === 'partial' ? 'partial payment' : 'reservation';
        alert(`Initial payment for ${planLabel} must be at least ₱${minInitialPayment.toLocaleString()}.`);
        return;
      }
      if (currentInitial > totalToSettle) {
        alert(`Initial payment cannot exceed the total amount of ₱${totalToSettle.toLocaleString()}.`);
        return;
      }
    }

    setIsFinalizing(true);
    const checkoutUid = user?.uid || "GUEST_BYPASS";
    const checkoutName = user?.displayName || "GUEST USER";

    try {
      if (user && !isNoDetailsMode) {
        await updateUserProfile(user.uid, buildProfileUpdates());
      }
      
      await Promise.all(checkoutItems.filter(item => item.type !== 'project').map(async (item) => {
        const kitRef = doc(db, "kits", item.id);
        const kitSnap = await getDoc(kitRef);
        if (!kitSnap.exists()) throw new Error(`Kit ${item.id} no longer exists.`);
        
        const stock = kitSnap.data().stocks[item.stockKey];
        if (!stock) throw new Error(`Stock variant for ${item.id} no longer exists.`);
        
        const canUseAdminShelfStock = item.allowShelfBundle && stock.isReserved && stock.reservationType === 'admin' && !stock.order?.orderId;
        if (stock.isReserved && stock.reservedBy !== checkoutUid && !canUseAdminShelfStock) {
          throw new Error(`Item "${item.name}" was just taken by someone else.`);
        }
        
        const result = await reserveStockForCheckout(item.id, item.stockKey, checkoutUid, { allowAdminShelf: item.allowShelfBundle });
        if (!result?.success) {
          throw new Error(`Item "${item.name}" was just taken by someone else.`);
        }
        if (canUseAdminShelfStock) {
          const shelfItem = (shelf || []).find(entry => entry.id === item.id && entry.stockKey === item.stockKey);
          if (shelfItem?.basketId) await deleteDoc(doc(db, 'shelf', shelfItem.basketId));
        }
        return result;
      }));
      
      const orderId = `#SG-${Math.floor(Math.random() * 9000) + 1000}`;
      const isPreOrder = checkoutItems.some(item => {
        if (item.type === 'project') return false; // Projects are custom/MTO, not standard stock pre-orders
        const kit = (kits || []).find(k => k.id === item.id);
        return kit?.stocks?.[item.stockKey]?.status === 'PRE-ORDER';
      });
      const hasProjects = checkoutItems.some(item => item.type === 'project');
      const initialStatus = isPreOrder ? 'Waiting' : 'Reserved';
      const balanceDueDeadline = isPreOrder
        ? new Date(Date.now() + (14 * 24 * 60 * 60 * 1000)).toISOString()
        : null;
      
      const createdTime = new Date().toISOString();
      const expirationDate = new Date(createdTime);
      if (isMaintenance) {
        expirationDate.setHours(expirationDate.getHours() + 1);
      } else {
        expirationDate.setDate(expirationDate.getDate() + 1);
        expirationDate.setHours(20, 0, 0, 0);
      }

      const orderData = {
        orderId,
        userId: user?.uid || null,
        buyerName: checkoutName,
        isMaintenanceOrder: isMaintenance || false,
        items: checkoutItems.map(item => ({
          id: item.id,
          name: `${item.brand || ''} ${item.specs?.line || ''} ${item.name}`.trim(),
          price: item.price || 0,
          sellPrice: item.sellPrice || item.price || 0,
          quantity: item.quantity || 1,
          image: item.image || null,
          images: item.images || null,
          appliedHandlingFee: item.appliedHandlingFee || 0,
          appliedInstallmentFee: item.appliedInstallmentFee || 0,
          appliedTransferFee: item.appliedTransferFee || 0,
          isFreeShippingEligible: item.isFreeShippingEligible || false,
          freeShippingUntil: item.freeShippingUntil || '',
          freeShippingMethod: item.freeShippingMethod || 'All',
          freeShippingSuboption: item.freeShippingSuboption || 'All',
          // FIX: Prevents undefined crash on projects since they don't use shelf stock keys
          stockKey: item.stockKey || null, 
          type: item.type || 'kit',
          projectData: item.type === 'project' ? (item.projectData || null) : null,
          productionJobs: item.type === 'project' ? (item.projectData?.productionJobs || item.projectData?.projectDetails?.flatMap(detail => detail.productionJobs || []) || []) : []
        })),
        status: initialStatus,
        isPreOrder,
        hasProjects,
        isMadeToOrder: hasProjects,
        shippingMethod: (checkoutData.selectedSuboption || checkoutData.customSuboption)
          ? `${checkoutData.shippingMethod} (${storeAdmin?.shippingMethods?.[checkoutData.shippingMethod]?.suboptions?.[checkoutData.selectedSuboption || checkoutData.customSuboption]?.label || checkoutData.selectedSuboption || checkoutData.customSuboption || 'Standard'})`
          : requiredFields.includes(13) && checkoutData.lbcBranch
            ? `${checkoutData.shippingMethod}: ${checkoutData.lbcBranch}`
            : (checkoutData.shippingMethod || 'Standard'),
        meetupLocation: usesMeetupLocation ? (checkoutData.meetupLocation || null) : null,
        pickupLocation: usesPickupPoint ? (checkoutData.pickupLocation || null) : null,
        pickupDetails: selectedLocalPlaceDetails ? {
          label: getCheckoutPlaceLabel(selectedLocalPlaceDetails) || 'Pickup Point',
          address: formatPlaceAddress(selectedLocalPlaceDetails) || '',
          publicAddress: formatPlaceAddressWithoutHouseNo(selectedLocalPlaceDetails) || '',
          lat: selectedLocalPlaceDetails.lat || null,
          lng: selectedLocalPlaceDetails.lng || null
        } : null,
        preferredSchedule: checkoutData.shippingMethod === 'Seller Meetup' 
          ? (checkoutData.meetupSchedule || null)
          : checkoutData.shippingMethod === 'Self-Pickup' 
            ? (checkoutData.pickupSchedule || null)
            : checkHasSchedule(checkoutData.shippingMethod, storeAdmin?.shippingMethods?.[checkoutData.shippingMethod], getSelectedShippingSubKey(checkoutData, storeAdmin?.shippingMethods))
              ? (checkoutData.shippingSchedule || null)
              : null,
        buyerRole: isAdmin ? 'admin' : 'customer',
        receiverDetails: isNoDetailsMode ? null : isLocalPlaceMethod ? {
            receiverName: deliveryData.receiverName || '',
            phoneNumber: deliveryData.phoneNumber || '',
            email: deliveryData.email || null
        } : {
            receiverName: deliveryData.receiverName || '',
            email: deliveryData.email || null,
            phoneNumber: deliveryData.phoneNumber || '',
            landmark: deliveryData.landmark || null,
            houseNo: deliveryData.houseNo || null,
            houseDetails: deliveryData.houseDetails || null,
            subdivision: deliveryData.subdivision || null,
            barangay: deliveryData.barangay || '',
            city: deliveryData.city || '',
            province: deliveryData.province || '',
            zipCode: deliveryData.zipCode || '',
            lat: deliveryData.lat || null,
            lng: deliveryData.lng || null,
            lbcBranch: requiredFields.includes(13) && checkoutData.lbcBranch
              ? checkoutData.lbcBranch 
              : null
        },
        paymentPlan: checkoutData.paymentPlan || 'full',
        paymentMethod: checkoutData.paymentMethod || 'Cash',
        totalPrice: Math.max(0, baseTotal - garageDiscount),
        subtotal: baseTotal,
        buyerPaid: 0,
        paymentDueNow: amountDueNow || 0,
        originalPaymentDueNow: amountDueNow || 0,
        minDownpayment: checkoutItems.reduce((acc, item) => acc + Number(item.minDownpayment ?? item.projectData?.minDownpayment ?? 0), 0),
        balanceDueDeadline,
        projectProgress: hasProjects ? checkoutItems.flatMap(item => {
          if (item.type !== 'project') return [];
          const jobs = item.projectData?.productionJobs || item.projectData?.projectDetails?.flatMap(detail => detail.productionJobs || []) || [];
          return jobs.map((job, idx) => ({
            id: job.id || `${item.basketId || item.id}-bp-${idx + 1}`,
            buildPlateNo: job.buildPlateNo || job.no || idx + 1,
            label: job.buildPlateNo ? `Build Plate ${job.buildPlateNo}` : `Build Plate ${idx + 1}`,
            done: false
          }));
        }) : [],
        handlingFee: totalAppliedHandlingFee || 0,
        installmentFee: totalAppliedInstallmentFee || 0,
        transferFee: totalAppliedTransferFee || 0,
        discount: garageDiscount || 0,
        discountBreakdown: {
          handlingFee: handlingFeeDiscount || 0,
          installmentFee: installmentFeeDiscount || 0,
          transferFee: transferFeeDiscount || 0
        },
        date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        createdAt: createdTime,
        expiresAt: expirationDate.toISOString()
      };
      
      const docId = await createOrder(orderData);
      console.log("SG DEBUG: Order created successfully with ID:", docId);
      
      if (assignStockToOrder) {
        for (const item of checkoutItems) {
          if (item.type === 'project') continue;
          await assignStockToOrder(item.id, item.stockKey, orderId, { 
            isManualOrder: false,
            orderDocId: docId 
          });
        }
      }
      
      setCreatedOrderIds([docId]);
      setOrderCreatedAt(createdTime);

      for (const item of checkoutItems) {
        if (item.basketId) await removeFromBasket(item.basketId);
      }

      if (isAdmin && isAdminView) { 
        onClose(); 
        navigate('/orders'); 
      } else { 
        setCheckoutStep(2); 
      }
    } catch (err) { 
      console.error("SG LOG: Checkout Error:", err); 
      alert(`Checkout failed: ${err.message || "An unexpected error occurred."}`); 
      setIsFinalizing(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const compressed = await compressImage(reader.result);
          setPreviewUrl(compressed);
        } catch (err) {
          console.error("SG DEBUG: Compression failed, using original", err);
          setPreviewUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!previewUrl || createdOrderIds.length === 0) return;
    setIsUploading(true);
    try {
      await uploadReceipt(createdOrderIds, previewUrl);
      onClose();
      navigate('/orders');
    } catch (err) {
      console.error(err);
      alert("Failed to upload receipt.");
      setIsUploading(false);
    }
  };

  const availablePaymentPlans = useMemo(() => {
    const hasStlWithDesignService = checkoutItems.some(item => 
      item.type === 'project' && 
      item.projectData?.method?.name?.toUpperCase() === 'STL' && 
      item.projectData?.selectedDesignService
    );

    if (hasStlWithDesignService) {
      return ['partial'];
    }

    const settings = { ...(storeAdmin?.paymentSettings?.plans || {}) };
    const plans = ['full'];
    
    // Ang deals/bundles ay laging Full payment lang at hindi pwedeng i-reserve/installment.
    const hasBundleItems = checkoutItems.some(item => item.isBundleItem || item.name?.includes('(Bundle Item)'));

    if (!hasBundleItems && (settings.downpayment || settings.installment)) {
      // Reservation plan para sa lahat ng kits (pre-order at on-hand)
      // PERO hindi available kung:
      // - on-hand lang at may Cash On suboption (COD/COP)
      // - ang selected suboption ay may free shipping promo
      const hasKits = checkoutItems.some(item => item.type !== 'project');
      const isCashOnOnhand = hasKits && !hasPreOrders && isCashOnSuboption;
      if (hasKits && !isCashOnOnhand && !isFreeShippingApplied) {
        plans.push('reservation');
      }
      // Partial plan para sa projects, at on-hand kits na may Cash On suboption
      if (hasProjects || isCashOnOnhand) {
        plans.push('partial');
      }
    }
    return plans;
  }, [storeAdmin, checkoutItems, hasProjects, hasPreOrders, isCashOnSuboption, isFreeShippingApplied]);

  const availablePaymentMethods = useMemo(() => {
    const settings = { ...(storeAdmin?.paymentSettings?.methods || {}) };
    
    const allKnownMethods = Array.from(new Set([
      ...Object.keys(settings).filter(key => {
        const normalizedKey = key.toLowerCase();
        return !normalizedKey.endsWith('qr') &&
          !normalizedKey.endsWith('fee') &&
          !normalizedKey.endsWith('transferdiscount') &&
          normalizedKey !== 'cash';
      }),
      'cash'
    ]));
    
    return allKnownMethods.filter(methodKey => {
      const config = getPaymentMethodConfig(settings, methodKey);
      if (!config.active) return false;
      
      // Specific logic for Cash
      if (methodKey.toLowerCase() === 'cash') {
        if (hasPreOrders || hasProjects || checkoutData.paymentPlan !== 'full') {
          return false;
        }
        // No cash payment for all couriers
        if (!['Seller Meetup', 'Self-Pickup'].includes(checkoutData.shippingMethod)) {
          return false;
        }
        // I-check ang cashEnabled flag sa shipping method config
        const selectedMethodConfig = storeAdmin?.shippingMethods?.[checkoutData.shippingMethod];
        if (selectedMethodConfig && typeof selectedMethodConfig === 'object') {
          if (selectedMethodConfig.cashEnabled === false) return false;
        }
      }
      
      return true;
    }).map(key => key.toLowerCase() === 'cash' ? 'Cash' : key);
  }, [storeAdmin, checkoutData.shippingMethod, hasPreOrders, hasProjects, checkoutData.paymentPlan]);

  // Preselect defaults when options become available
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {


        // No auto-preselection of shipping method per user request.


        // ... existing payment plan/method logic
        if (availablePaymentPlans.length > 0 && !checkoutData.paymentPlan) {
          updateCheckoutData(prev => ({ 
            ...prev, 
            paymentPlan: availablePaymentPlans[0],
            initialPayment: availablePaymentPlans[0] === 'full' ? 0 : minInitialPayment
          }));
        }
        // Auto-reset kung ang current plan ay wala na sa available plans (e.g. nag-switch sa COD)
        if (checkoutData.paymentPlan && !availablePaymentPlans.includes(checkoutData.paymentPlan)) {
          updateCheckoutData(prev => ({
            ...prev,
            paymentPlan: availablePaymentPlans[0] || 'full',
            initialPayment: 0
          }));
        }
        if (availablePaymentMethods.length > 0) {
          // Gamitin ang case-insensitive comparison para hindi ma-reset ang user selection
          // dahil sa case mismatch (e.g. "GCash" vs "Gcash", "UnionBank" vs "Unionbank")
          const currentMethod = checkoutData.paymentMethod;
          const isCurrentValid = currentMethod && availablePaymentMethods.some(
            m => m.toLowerCase() === currentMethod.toLowerCase()
          );
          if (!isCurrentValid) {
            updateCheckoutData(prev => ({ ...prev, paymentMethod: availablePaymentMethods[0] }));
          }
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, shippingOptions, availablePaymentPlans, availablePaymentMethods, checkoutData.shippingMethod, checkoutData.paymentPlan, checkoutData.paymentMethod, minInitialPayment, handleShippingChange, updateCheckoutData, checkoutItems, enabledShippingMethods, storeAdmin, pickupPoints, isMethodFreeShipping]);



  const getPotentialDiscount = useCallback((method, subKey = null) => {
    const shouldDiscount = getHandlingDiscountSetting(storeAdmin?.shippingMethods, method, subKey);
    return shouldDiscount ? totalAppliedHandlingFee : 0;
  }, [storeAdmin?.shippingMethods, totalAppliedHandlingFee]);

  const getShippingDiscountLabel = useCallback((method, subKey = null) => {
    if (isMethodFreeShipping(method, subKey)) {
      return 'FREE SHIPPING';
    }

    const discount = getPotentialDiscount(method, subKey);
    return discount > 0 ? `₱${discount.toLocaleString()} OFF` : '';
  }, [isMethodFreeShipping, getPotentialDiscount]);

  if (!isOpen) return null;


  const handleCloseModal = () => {
    onClose();
    if (checkoutStep === 2) navigate('/orders');
    setCheckoutStep(1);
    setPreviewUrl(null);
    setCreatedOrderIds([]);
    setIsUploading(false);
    setIsFinalizing(false);
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-start md:items-center justify-center md:p-4 bg-black/60 backdrop-blur-md font-sans text-neutral-900 dark:text-white">
      <div className="bg-white/90 dark:bg-[#0a0a0a]/90 backdrop-blur-xl w-full h-full md:h-auto md:max-w-5xl rounded-none md:rounded-[2.5rem] border border-black/5 dark:border-white/10 p-5 md:p-6 shadow-2xl relative overflow-y-auto md:max-h-[95vh] custom-scrollbar">
        <div className="sticky top-0 z-[520] w-full h-0 overflow-visible md:hidden">
          <div className="absolute top-0 -right-2 flex justify-end items-center">
            <motion.button whileTap={{ scale: 0.9 }} onClick={handleCloseModal} className="p-2 rounded-full backdrop-blur-md bg-black/10 dark:bg-white/10 text-neutral-900 dark:text-white border border-black/5 dark:border-white/10 shadow-lg"><X size={20} /></motion.button>
          </div>
        </div>
        <motion.button whileTap={{ scale: 0.9 }} onClick={handleCloseModal} className="hidden md:block absolute top-6 right-6 p-4 -m-4 opacity-30 hover:opacity-100 z-50"><X size={24}/></motion.button>
        {checkoutStep === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 md:gap-6">
              <div className="lg:col-span-4 space-y-4 text-left">
                <h4 className="text-[11px] font-black uppercase tracking-widest opacity-40 mb-3">Shipping Method</h4>
                <div className="grid grid-cols-1 gap-2">
                  {!isAdminCheckoutConfigReady ? (
                    <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 text-[11px] font-black uppercase tracking-widest opacity-50 text-center">Checkout settings not published yet</div>
                  ) : (
                    <>
                      {shippingOptions.map(m => {
                        const isSelected = checkoutData.shippingMethod === m;
                        let discountLabel = '';

                        if (m === 'LBC') {
                            const lbcWasDisabled = enabledShippingMethods.LBC?._wasDisabled;
                            ['cop', 'cod'].forEach(subKey => {
                                const hasFreePromo = checkoutItems.some(item => itemHasFreeShippingForSubKey(item, 'LBC', subKey, storeAdmin?.shippingMethods));
                                // Kung disabled ang LBC, ipakita lang ang discount label ng suboption na may promo
                                if (lbcWasDisabled && !hasFreePromo) return;
                                if (isSubMethodEnabled(enabledShippingMethods.LBC, subKey) || hasFreePromo) {
                                    const label = getShippingDiscountLabel('LBC', subKey);
                                    if (!discountLabel && label) discountLabel = label;
                                    if (label === 'FREE SHIPPING') discountLabel = label;
                                }
                            });
                        } else if (m === 'Lalamove') {
                            const lalamoveWasDisabled = enabledShippingMethods.Lalamove?._wasDisabled;
                            ['self', 'seller'].forEach(subKey => {
                                if (subKey === 'self' && pickupPoints.length === 0) return;
                                const hasFreePromo = checkoutItems.some(item => itemHasFreeShippingForSubKey(item, 'Lalamove', subKey, storeAdmin?.shippingMethods));
                                if (lalamoveWasDisabled && !hasFreePromo) return;
                                if (isSubMethodEnabled(enabledShippingMethods.Lalamove, subKey) || hasFreePromo) {
                                    const label = getShippingDiscountLabel('Lalamove', subKey);
                                    if (!discountLabel && label) discountLabel = label;
                                    if (label === 'FREE SHIPPING') discountLabel = label;
                                }
                            });
                        } else if (m === 'SPX Express') {
                            const spxWasDisabled = enabledShippingMethods['SPX Express']?._wasDisabled;
                            ['delivery', 'cod'].forEach(subKey => {
                                const hasFreePromo = checkoutItems.some(item => itemHasFreeShippingForSubKey(item, 'SPX Express', subKey, storeAdmin?.shippingMethods));
                                if (spxWasDisabled && !hasFreePromo) return;
                                if (isSubMethodEnabled(enabledShippingMethods['SPX Express'], subKey) || hasFreePromo) {
                                    const label = getShippingDiscountLabel('SPX Express', subKey);
                                    if (!discountLabel || label === 'FREE SHIPPING') discountLabel = label;
                                }
                            });
                        } else {
                            // Custom methods: i-check suboptions para sa FREE SHIPPING label
                            const rawMethodConfig = storeAdmin?.shippingMethods?.[m];
                            const methodConfig = enabledShippingMethods[m];
                            const customWasDisabled = methodConfig?._wasDisabled;
                            if (methodConfig?.hasSuboptions && rawMethodConfig?.suboptions) {
                              for (const [subKey, subVal] of Object.entries(rawMethodConfig.suboptions)) {
                                const hasFreePromo = checkoutItems.some(item => itemHasFreeShippingForSubKey(item, m, subKey, storeAdmin?.shippingMethods));
                                // Kung disabled ang method, ipakita lang ang label ng promo suboption
                                if (customWasDisabled && !hasFreePromo) continue;
                                if (subVal.active !== false || hasFreePromo) {
                                  const label = getShippingDiscountLabel(m, subKey);
                                  if (!discountLabel && label) discountLabel = label;
                                  if (label === 'FREE SHIPPING') discountLabel = label;
                                }
                              }
                            } else {
                              discountLabel = getShippingDiscountLabel(m);
                            }
                        }
                        
                        return (
                          <div key={m} className="space-y-2">
                            <motion.button 
                              whileTap={{ scale: 0.98 }}
                              onClick={() => {
                                if (isSelected) {
                                  // I-deselect ang current method
                                  updateCheckoutData(prev => ({ ...prev, shippingMethod: '', lbcType: 'COP', lalamoveType: 'Seller-Booking', spxType: 'Standard Delivery', selectedSuboption: '', customSuboption: '' }));
                                } else {
                                  handleShippingChange(m);
                                }
                              }}
                              className={`w-full p-3.5 rounded-2xl border-[2px] text-[11px] font-black uppercase transition-all text-left flex items-center justify-between group ${
                                isSelected ? 'bg-white/5 dark:bg-white/5 text-neutral-900 dark:text-white border-blue-600 shadow-lg' : 'bg-black/5 dark:bg-white/5 border-transparent hover:border-blue-600/50'
                              }`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span>{m}</span>
                                {!isSelected && discountLabel && (
                                  <span className="text-[12px] font-black ml-2 text-emerald-500">
                                    {discountLabel}
                                  </span>
                                )}
                              </div>
                              {isSelected && <CheckCircle2 size={16} className="ml-2 shrink-0 text-emerald-500" />}
                            </motion.button>
                          </div>
                        );
                      })}
                    </>
                  )}
                  {enabledShippingMethods?.[checkoutData.shippingMethod]?.hasSuboptions && (() => {
                    const activeSubKey = checkoutData.selectedSuboption || checkoutData.customSuboption;
                    const activeSubConfig = activeSubKey
                      ? enabledShippingMethods?.[checkoutData.shippingMethod]?.suboptions?.[activeSubKey]
                      : null;
                    const subNeedsPickup = activeSubConfig && (
                      Array.isArray(activeSubConfig.requiredFields)
                        ? activeSubConfig.requiredFields.includes(14)
                        : (activeSubConfig.isPickupRequired || activeSubConfig.isSelfBooking)
                    );
                    const subNeedsMeetup = activeSubConfig && (
                      Array.isArray(activeSubConfig.requiredFields)
                        ? activeSubConfig.requiredFields.includes(15)
                        : false
                    );

                    return (
                      <>
                        <div className="mt-4 space-y-2 animate-in slide-in-from-top duration-300">
                          <h5 className="text-[11px] font-black uppercase opacity-40">{checkoutData.shippingMethod} Option</h5>
                          <div className="grid grid-cols-1 gap-1">
                            {Object.entries(enabledShippingMethods?.[checkoutData.shippingMethod]?.suboptions || {})
                              .filter(([subKey, subVal]) => {
                                const hasFreePromo = checkoutItems.some(item => itemHasFreeShippingForSubKey(item, checkoutData.shippingMethod, subKey, storeAdmin?.shippingMethods));
                                return subVal.active !== false || hasFreePromo;
                              })
                              .sort(([subKeyA], [subKeyB]) => {
                                const getPriority = (subKey) => {
                                  const isFree = isMethodFreeShipping(checkoutData.shippingMethod, subKey);
                                  if (isFree) return 1;
                                  const hasDiscount = getHandlingDiscountSetting(storeAdmin?.shippingMethods, checkoutData.shippingMethod, subKey);
                                  if (hasDiscount) return 2;
                                  return 3;
                                };
                                return getPriority(subKeyA) - getPriority(subKeyB);
                              })
                              .map(([subKey, subVal]) => {
                                const isSubSelected = activeSubKey === subKey;
                                const discountLabel = getShippingDiscountLabel(checkoutData.shippingMethod, subKey);

                                return (
                                  <motion.button
                                    key={subKey}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => {
                                      updateCheckoutData(prev => {
                                        const method = prev.shippingMethod;
                                        const methodConfig = storeAdmin?.shippingMethods?.[method];
                                        const hasPickup = checkUsesPickupPoint(method, methodConfig, subKey);
                                        const hasMeetup = checkUsesMeetupLocation(method, methodConfig, subKey);

                                        let pickupLoc = '';
                                        let pickupLocIndex = null;
                                        if (hasPickup && pickupPoints.length > 0) {
                                          pickupLoc = getCheckoutPlaceLabel(pickupPoints[0], 'Pickup Point 1');
                                          pickupLocIndex = 0;
                                        }

                                        let meetupLoc = '';
                                        let meetupLocIndex = null;
                                        const meetupPlaces = (storeAdmin?.pickupDetails?.meetup?.places || []).filter(p => p.isActive !== false);
                                        if (hasMeetup && meetupPlaces.length > 0) {
                                          meetupLoc = getCheckoutPlaceLabel(meetupPlaces[0], 'Meetup Place 1');
                                          meetupLocIndex = 0;
                                        }

                                        return { 
                                          ...prev, 
                                          selectedSuboption: subKey, 
                                          customSuboption: subKey,
                                          pickupLocation: pickupLoc,
                                          pickupLocationIndex: pickupLocIndex,
                                          meetupLocation: meetupLoc,
                                          meetupLocationIndex: meetupLocIndex
                                        };
                                      });
                                      const isNoAddr = subVal.isPickupRequired || subVal.isSelfBooking || subVal.requiredFields?.includes(14) || subVal.requiredFields?.includes(15);
                                      setAddressStatus(prev => ({...prev, isEditingAddress: !isNoAddr}));
                                    }}
                                    className={`p-3 rounded-xl border-[2px] text-[11px] font-black uppercase transition-all text-left flex flex-col ${isSubSelected ? 'bg-white/5 dark:bg-white/5 text-blue-600 dark:text-white border-blue-600 shadow-lg' : 'bg-black/5 dark:bg-white/5 border-transparent'}`}
                                  >
                                    <div className="flex items-center justify-between w-full">
                                      <span>{subVal.label || subKey}</span>
                                      <div className="flex items-center gap-1.5">
                                        {discountLabel && <span className={`text-[11px] font-black text-emerald-500`}>{discountLabel}</span>}
                                        {isSubSelected && <CheckCircle2 size={14} className="text-blue-500 dark:text-white shrink-0" />}
                                      </div>
                                    </div>
                                  </motion.button>
                                );
                              })}
                          </div>
                        </div>

                        {/* Pickup Location — second-level suboption for couriers */}
                        {subNeedsPickup && pickupPoints.length > 0 && (
                          <div className="mt-3 space-y-2 animate-in slide-in-from-top duration-300">
                            <h5 className="text-[11px] font-black uppercase opacity-40">Pickup Location</h5>
                            <div className="grid grid-cols-1 gap-1">
                              {pickupPoints.map((place, idx) => {
                                const fallbackLabel = `Pickup Point ${idx + 1}`;
                                const placeLabel = getCheckoutPlaceLabel(place, fallbackLabel);
                                const isSelected = checkoutData.pickupLocationIndex === idx || checkoutData.pickupLocation === placeLabel;
                                return (
                                  <motion.button
                                    key={idx}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => updateCheckoutData(prev => ({
                                      ...prev,
                                      pickupLocation: placeLabel,
                                      pickupLocationIndex: idx
                                    }))}
                                    className={`p-3 rounded-xl border-[2px] text-[11px] font-black uppercase transition-all text-left flex flex-col ${isSelected ? 'bg-white/5 dark:bg-white/5 border-blue-600 shadow-lg' : 'bg-black/5 dark:bg-white/5 border-transparent'}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <MapPinCheckInside size={18} className="text-amber-600" />
                                      <span>{placeLabel}</span>
                                    </div>
                                  </motion.button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Meetup Location — second-level suboption for couriers */}
                        {subNeedsMeetup && (
                          <div className="mt-3 space-y-2 animate-in slide-in-from-top duration-300">
                            <h5 className="text-[11px] font-black uppercase opacity-40">Meetup Location</h5>
                            <div className="grid grid-cols-1 gap-1">
                              {(storeAdmin?.pickupDetails?.meetup?.places || [])
                                .filter(p => p.isActive !== false)
                                .map((place, idx) => {
                                  const fallbackLabel = `Meetup Place ${idx + 1}`;
                                  const placeLabel = getCheckoutPlaceLabel(place, fallbackLabel);
                                  const placeAddress = getCheckoutPlaceAddress(place, { includeHouseNo: false });
                                  const isSelected = checkoutData.meetupLocationIndex === idx || checkoutData.meetupLocation === placeLabel;
                                  return (
                                    <motion.button
                                      key={idx}
                                      whileTap={{ scale: 0.98 }}
                                      onClick={() => updateCheckoutData(prev => ({
                                        ...prev,
                                        meetupLocation: placeLabel,
                                        meetupLocationIndex: idx
                                      }))}
                                      className={`p-3 rounded-xl border-[2px] text-[11px] font-black uppercase transition-all text-left flex flex-col ${isSelected ? 'bg-white/5 dark:bg-white/5 border-blue-600 shadow-lg' : 'bg-black/5 dark:bg-white/5 border-transparent'}`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <MapPinCheckInside size={18} className="text-amber-600" />
                                        <span>{placeLabel}</span>
                                      </div>
                                      {placeAddress && (
                                        <p className={`text-[10px] font-bold mt-0.5 ml-5 leading-tight ${isSelected ? 'text-blue-600/80' : 'text-neutral-500 dark:text-neutral-400'}`}>{placeAddress}</p>
                                      )}
                                    </motion.button>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  {((checkoutData.shippingMethod === 'Seller Meetup' && usesMeetupLocation) ||
                    (checkoutData.shippingMethod === 'Self-Pickup' && usesPickupPoint) ||
                    (checkoutData.shippingMethod === 'Lalamove' && checkoutData.lalamoveType === 'Self-Booking' && usesPickupPoint)) && (
                    <div className="mt-3 space-y-2 animate-in slide-in-from-top duration-300">
                      <h5 className="text-[11px] font-black uppercase opacity-40">
                        {checkoutData.shippingMethod === 'Seller Meetup' ? 'Meetup Location' : 'Pickup Location'}
                      </h5>
                      <div className="grid grid-cols-1 gap-1">
                        {(checkoutData.shippingMethod === 'Seller Meetup'
                            ? (storeAdmin?.pickupDetails?.meetup?.places || [])
                            : pickupPoints)
                          .filter(p => p.isActive !== false)
                          .map((place, idx) => {
                            const fallbackLabel = `${checkoutData.shippingMethod === 'Seller Meetup' ? 'Meetup Place' : 'Pickup Point'} ${idx + 1}`;
                            const placeLabel = getCheckoutPlaceLabel(place, fallbackLabel);
                            const isSelected = checkoutData.shippingMethod === 'Seller Meetup'
                                              ? checkoutData.meetupLocationIndex === idx || checkoutData.meetupLocation === placeLabel
                                              : checkoutData.pickupLocationIndex === idx || checkoutData.pickupLocation === placeLabel;
                            const discountLabel = checkoutData.shippingMethod === 'Lalamove' ? '' : getShippingDiscountLabel(checkoutData.shippingMethod);

                            return (
                              <motion.button
                                key={idx}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => updateCheckoutData(prev => ({
                                  ...prev,
                                  [checkoutData.shippingMethod === 'Seller Meetup' ? 'meetupLocation' : 'pickupLocation']: placeLabel,
                                  [checkoutData.shippingMethod === 'Seller Meetup' ? 'meetupLocationIndex' : 'pickupLocationIndex']: idx
                                }))}
                                className={`p-3 rounded-xl border-[2px] text-[11px] font-black uppercase transition-all text-left flex flex-col ${isSelected ? 'bg-white/5 dark:bg-white/5  border-blue-600 shadow-lg' : 'bg-black/5 dark:bg-white/5 border-transparent'}`}
                              >
                                <div className="flex justify-between items-start">
                                  <div className="flex items-center gap-2">
                                    <MapPinCheckInside size={16} className="text-amber-600" />
                                    <span>{placeLabel}</span>
                                  </div>
                                  {discountLabel && <span className={`text-[11px] font-black ml-2 text-emerald-500`}>{discountLabel}</span>}
                                </div>
                              </motion.button>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-4 space-y-5">
                    {checkoutData.shippingMethod ? (
                      <div className="animate-in fade-in slide-in-from-right duration-500 space-y-5">
                        <h4 className="text-[11px] font-black uppercase tracking-widest opacity-40">
                          {!LOCAL_METHODS.includes(checkoutData.shippingMethod)
                            ? "Receiver's Details"
                            : usesPickupPoint
                              ? 'Pickup Information'
                              : usesMeetupLocation
                                ? 'Meetup Information'
                                : "Receiver's Details"}
                        </h4>
                        {isNoDetailsMode ? (
                          <div className="p-5 rounded-[2.5rem] bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 space-y-5 animate-in zoom-in-95 duration-300 text-left">
                            {checkoutData.shippingMethod === 'Lalamove' && checkoutData.lalamoveType === 'Self-Booking' && usesPickupPoint && (
                              <>
                                <div className="space-y-1">
                                  <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">Pickup Point</p>
                                  <div className="flex items-center gap-2">
                                    <MapPinCheckInside size={16} className="text-blue-600" />
                                    <p className="text-sm font-black uppercase italic text-blue-600">{selectedPickupDetails?.landmark || pickupPoints[0]?.landmark || 'Pickup Point'}</p>
                                  </div>
                                </div>
                                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                                  <div className="flex items-center gap-2 text-amber-600"><Info size={14} /><p className="text-[11px] font-black uppercase italic">Self-Booking Instructions</p></div>
                                  <p className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200 leading-relaxed">Search for the pickup point name above for checking your Lalamove rate.</p>
                                </div>
                              </>
                            )}
                            {checkoutData.shippingMethod === 'Self-Pickup' && usesPickupPoint && (
                              <>
                                <div className="space-y-1">
                                  <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">Pickup Point</p>
                                  <div className="flex items-center gap-2">
                                    <MapPinCheckInside size={16} className="text-blue-600" />
                                    <p className="text-sm font-black uppercase italic text-blue-600">{formatPickupStreetAddress(selectedPickupDetails) || formatPlaceAddress(selectedPickupDetails) || 'Pickup Point'}</p>
                                  </div>
                                </div>
                                <div className="p-4 rounded-2xl bg-blue-600/5 border border-blue-600/10 space-y-2">
                                  <div className="flex items-center gap-2 text-blue-600"><Info size={14} /><p className="text-[9px] font-black uppercase italic">Self-Pickup Instructions</p></div>
                                  <p className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200 leading-relaxed">See the pinned location below for the pickup.</p>
                                </div>
                              </>
                            )}
                            {checkoutData.shippingMethod === 'Seller Meetup' && usesMeetupLocation && (
                              <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-3">
                                <div className="flex items-center gap-2 text-emerald-600">
                                  <MapPinCheckInside size={16} />
                                  <p className="text-[11px] font-black uppercase italic">Meetup Instruction</p>
                                </div>
                                <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200 leading-relaxed">See the pinned location below for the meetup:</p>
                              </div>
                            )}
                            {/* Dynamic courier with pickup requirement */}
                            {!LOCAL_METHODS.includes(checkoutData.shippingMethod) && !(checkoutData.shippingMethod === 'Lalamove' && checkoutData.lalamoveType === 'Self-Booking') && usesPickupPoint && selectedPickupDetails && (
                              <>
                                <div className="space-y-1">
                                  <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">Pickup Point</p>
                                  <div className="flex items-center gap-2">
                                    <MapPinCheckInside size={16} className="text-blue-600" />
                                    <p className="text-sm font-black uppercase italic text-blue-600">
                                      {getCheckoutPlaceLabel(selectedPickupDetails, 'Pickup Point')}
                                    </p>
                                  </div>
                                  {getCheckoutPlaceAddress(selectedPickupDetails) && (
                                    <p className="text-[11px] font-black uppercase text-neutral-500 dark:text-neutral-300 leading-tight ml-6">
                                      {getCheckoutPlaceAddress(selectedPickupDetails)}
                                    </p>
                                  )}
                                </div>
                                <div className="p-4 rounded-2xl bg-blue-600/5 border border-blue-600/10 space-y-2">
                                  <div className="flex items-center gap-2 text-blue-600"><Info size={14} /><p className="text-[9px] font-black uppercase italic">Pickup Instructions</p></div>
                                  <p className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200 leading-relaxed">See the pinned location below for the pickup.</p>
                                </div>
                              </>
                            )}
                            {/* Dynamic courier with meetup requirement */}
                            {!LOCAL_METHODS.includes(checkoutData.shippingMethod) && usesMeetupLocation && selectedMeetupDetails && (
                              <>
                                <div className="space-y-1">
                                  <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">Meetup Location</p>
                                  <div className="flex items-center gap-2">
                                    <MapPinCheckInside size={16} className="text-blue-600" />
                                    <p className="text-sm font-black uppercase italic text-blue-600">
                                      {getCheckoutPlaceLabel(selectedMeetupDetails, 'Meetup Place')}
                                    </p>
                                  </div>
                                  {getCheckoutPlaceAddress(selectedMeetupDetails) && (
                                    <p className="text-[11px] font-black uppercase text-neutral-500 dark:text-neutral-300 leading-tight ml-6">
                                      {getCheckoutPlaceAddress(selectedMeetupDetails)}
                                    </p>
                                  )}
                                </div>
                                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                                  <div className="flex items-center gap-2 text-emerald-600"><Info size={14} /><p className="text-[9px] font-black uppercase italic">Meetup Instructions</p></div>
                                  <p className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200 leading-relaxed">See the pinned location below for the meetup.</p>
                                </div>
                              </>
                            )}
                            {/* Map — shown for local-place type methods unconditionally */}
                            {isLocalPlaceMethod && (
                              <div className="space-y-2">
                                <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">{usesMeetupLocation ? 'Meetup Map Pin' : 'Pickup Map'}</p>
                                <div className="w-full h-40 rounded-[2rem] overflow-hidden border-2 border-blue-600/10 relative">
                                    <MapContainer
                                        ref={mapRef}
                                        center={selectedLocalPlaceCoord}
                                        zoom={16}
                                        style={{ height: '100%', width: '100%' }}
                                        dragging={true}
                                        scrollWheelZoom={true}
                                        doubleClickZoom={true}
                                        touchZoom={true}
                                        zoomControl={true}
                                    >
                                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                      {usesMeetupLocation && <Marker position={selectedLocalPlaceCoord} />}
                                      <ChangeView center={selectedLocalPlaceCoord} />
                                    </MapContainer>
                                </div>
                              </div>
                            )}
                            {/* Dynamic schedule picker — sumusunod sa hasSchedule config ng method/suboption */}
                            {(() => {
                              const m = checkoutData.shippingMethod;
                              const methodCfg = storeAdmin?.shippingMethods?.[m];
                              const currentSubKey = getSelectedShippingSubKey(checkoutData, storeAdmin?.shippingMethods);
                              const showSchedule = checkHasSchedule(m, methodCfg, currentSubKey);
                              if (!showSchedule) return null;

                              if (usesPickupPoint || usesMeetupLocation) {
                                return (
                                  <div className="p-4 rounded-2xl bg-blue-500/5 dark:bg-blue-500/10 border border-blue-600/10 space-y-2 pt-2 border-t border-black/5 dark:border-white/5 text-left animate-in fade-in duration-300">
                                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                      <Info size={14} />
                                      <p className="text-[11px] font-black uppercase italic">Pickup / Meetup Notice</p>
                                    </div>
                                    <p className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200 leading-relaxed">
                                      You will be notified when your order is ready for pickup.
                                    </p>
                                  </div>
                                );
                              }

                              // Determine schedule field, label, and hours based on method
                              let schedField = 'shippingSchedule';
                              let schedLabel = 'Preferred Schedule';
                              let startHour = 10;
                              let endHour = 21;
                              if (m === 'Seller Meetup') { schedField = 'meetupSchedule'; schedLabel = 'Preferred Meetup Schedule'; endHour = 19; }
                              else if (m === 'Self-Pickup') { schedField = 'pickupSchedule'; schedLabel = 'Preferred Pickup Schedule'; }
                              else if (m === 'Lalamove' && checkoutData.lalamoveType === 'Self-Booking') { schedField = 'lalamoveSchedule'; schedLabel = 'Preferred Lalamove Schedule'; }
                              return (
                                <div className="space-y-2 pt-2 border-t border-black/5 dark:border-white/5">
                                  <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">{schedLabel}</p>
                                  <div className="relative group">
                                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-600 transition-transform group-focus-within:scale-110" size={16} />
                                      <motion.input 
                                        whileTap={{ scale: 0.99 }}
                                        whileFocus={{ scale: 1.01 }}
                                        transition={{ duration: 0.1 }}
                                        type="datetime-local" 
                                        value={checkoutData[schedField] || ''} 
                                        min={getMinTime(startHour, endHour)} 
                                        onChange={(e) => handleScheduleChange(e.target.value, startHour, endHour, schedField)} 
                                        className="w-full pl-12 pr-4 py-3.5 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-600/50 bg-black/5 dark:bg-white/5 text-neutral-900 dark:text-white border border-transparent hover:border-blue-600/10 transition-all cursor-pointer" 
                                      />
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <>
                            {!addressStatus.isEditingAddress ? (
                              <div className="p-5 rounded-[2.5rem] bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 space-y-5 relative group text-left">
                                {hasConfiguredInputFields && (
                                  <button onClick={() => setAddressStatus(prev => ({...prev, isEditingAddress: true}))} className="absolute top-5 right-5 p-2.5 rounded-xl bg-blue-600/10 text-blue-600 hover:bg-blue-600 hover:text-white transition-all"><Settings size={16} /></button>
                                )}
                                
                                {requiredFields.includes(1) && (
                                  <div className="space-y-1">
                                    <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">Recipient</p>
                                    <p className="text-sm font-black uppercase italic text-blue-600">
                                      {deliveryData.receiverName || 'No Name Provided'}
                                    </p>
                                  </div>
                                )}

                                {requiredFields.includes(2) && deliveryData.phoneNumber && (
                                  <div className="space-y-1">
                                    <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">Mobile No.</p>
                                    <p className="text-sm font-black uppercase italic text-blue-600">{deliveryData.phoneNumber}</p>
                                  </div>
                                )}

                                {isLocalPlaceMethod && (
                                  <div className="space-y-1">
                                    <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">
                                      {checkoutData.shippingMethod === 'Seller Meetup' ? 'Meetup Location' : 'Pickup Location'}
                                    </p>
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <MapPinCheckInside size={16} className="text-blue-600" />
                                        <p className="text-sm font-black uppercase italic text-blue-600">
                                          {getCheckoutPlaceLabel(
                                            selectedLocalPlaceDetails,
                                            checkoutData.shippingMethod === 'Seller Meetup' ? 'Meetup Place' : 'Pickup Point'
                                          )}
                                        </p>
                                      </div>
                                      {getCheckoutPlaceAddress(selectedLocalPlaceDetails) && (
                                        <p className="text-[11px] font-black uppercase text-neutral-500 dark:text-neutral-300 leading-tight ml-6">
                                          {getCheckoutPlaceAddress(selectedLocalPlaceDetails)}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {isLocalPlaceMethod && (
                                  <div className="space-y-2">
                                    <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">
                                      {checkoutData.shippingMethod === 'Seller Meetup' ? 'Meetup Map Pin' : 'Pickup Map'}
                                    </p>
                                    <div className="w-full h-40 rounded-[2rem] overflow-hidden border-2 border-blue-600/20 relative">
                                      <MapContainer center={selectedLocalPlaceCoord} zoom={16} style={{ height: '100%', width: '100%' }} dragging={true} scrollWheelZoom={true} doubleClickZoom={true} touchZoom={true} zoomControl={true}>
                                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                        {usesMeetupLocation && <Marker position={selectedLocalPlaceCoord} />}
                                        <ChangeView center={selectedLocalPlaceCoord} />
                                      </MapContainer>
                                    </div>
                                  </div>
                                )}

                                {requiredFields.includes(3) && deliveryData.email && (
                                  <div className="space-y-1">
                                    <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">Email</p>
                                    <p className="text-sm font-black uppercase italic text-blue-600">{deliveryData.email}</p>
                                  </div>
                                )}

                                {requiredFields.includes(13) && checkoutData.lbcBranch && (
                                  <div className="space-y-1">
                                    <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">{courierName} Branch</p>
                                    <p className="text-sm font-black uppercase italic text-blue-600">{checkoutData.lbcBranch}</p>
                                  </div>
                                )}

                                {!isLocalPlaceMethod && (requiredFields.includes(5) || requiredFields.includes(6) || requiredFields.includes(7) || requiredFields.includes(8) || requiredFields.includes(4) || requiredFields.includes(9) || requiredFields.includes(10) || requiredFields.includes(11)) && (
                                  <div className="space-y-1">
                                    <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">Delivery Address</p>
                                    <div className="space-y-0.5">
                                      {deliveryData.landmark && <p className="text-[9px] font-black uppercase italic text-garage-blue leading-none mb-1">Landmark: {deliveryData.landmark}</p>}
                                      <p className="text-sm font-black uppercase italic text-blue-600 leading-tight">
                                        {formatPlaceAddress(deliveryData) || 'No Address Pinpointed'}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {!isLocalPlaceMethod && requiredFields.includes(12) && (
                                  <div className="space-y-2">
                                    <p className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">Drop-Off Pin</p>
                                    <div className="w-full h-40 rounded-[2rem] overflow-hidden border-2 border-blue-600/20 relative">
                                      <MapContainer center={[deliveryData.lat, deliveryData.lng]} zoom={16} style={{ height: '100%', width: '100%' }} dragging={false} scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false} zoomControl={false}>
                                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                        <Marker position={[deliveryData.lat, deliveryData.lng]} />
                                        <ChangeView center={[deliveryData.lat, deliveryData.lng]} />
                                      </MapContainer>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="p-5 rounded-[2.5rem] bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 space-y-5 animate-in zoom-in-95 duration-300 text-left">
                                <DynamicShippingForm
                                  requiredFields={detailsInputFields}
                                  deliveryData={deliveryData}
                                  updateDeliveryData={updateDeliveryData}
                                  checkoutData={checkoutData}
                                  updateCheckoutData={updateCheckoutData}
                                  validationState={validationState}
                                  setValidationState={setValidationState}
                                  addressStatus={addressStatus}
                                  setAddressStatus={setAddressStatus}
                                  courierName={courierName}
                                  isDarkMode={isDarkMode}
                                />
                                <button 
                                  disabled={!isDetailsFormValid}
                                  onClick={handleConfirmDetails} 
                                  className={`w-full py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-xs tracking-widest transition-all ${!isDetailsFormValid ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-700'}`}
                                >
                                  Confirm Details
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center opacity-20 text-center space-y-4 py-20 animate-in fade-in duration-700">
                        <Package size={48} /><p className="text-[11px] font-black uppercase tracking-widest">Select a shipping method<br/>to provide receiver info</p>
                      </div>
                    )}
              </div>

              <div className="lg:col-span-4 space-y-5">
                <h4 className="text-[11px] font-black uppercase tracking-widest opacity-40">Final Review</h4>
                <div className="p-5 rounded-[2.5rem] bg-blue-600 text-white shadow-2xl space-y-5">
                  <div className="space-y-3 text-left">
                      {checkoutItems.map((item, idx) => {
  // 1. Kunin ang totoong base price ng item (Gagana sa parehong Kit at Project!)
  // Kung project ito, kukunin nito ang malinis na ₱2,100 mula sa projectData?.sellPrice
  const basePrice = Number(item.price || item.sellPrice || item.projectData?.sellPrice || 0);
  
  // 2. I-add ang installment fee (₱2,100 + ₱100 = ₱2,200)
  const itemPrice = basePrice + (Number(item.appliedInstallmentFee) || 0);

  // 3. Resolve the image
  const displayImage = item.type === 'project'
    ? (item.projectData?.image || item.image)
    : resolveImage(item.image, item.images);

  return (
    <div key={idx} className="flex flex-col gap-1 text-left">
      <div className="flex justify-between items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {displayImage ? (
            <img 
              src={displayImage} 
              alt="" 
              className="w-8 h-8 rounded-lg object-cover bg-neutral-200 dark:bg-neutral-800 shrink-0" 
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <Package size={14} className="text-white" />
            </div>
          )}
          <p className="text-[10px] font-bold uppercase line-clamp-1 opacity-100">
            {(item.quantity || 1) > 1 ? `(${item.quantity}x) ` : ''}
            {item.name}
          </p>
        </div>
        <p className="text-[10px] font-black shrink-0">₱{( itemPrice * (item.quantity || 1) ).toLocaleString()}</p>
      </div>
    </div>
  );
})}
                  </div>
                  <div className="pt-3 border-t border-white/20 space-y-1 text-[10px] font-bold text-left">
                      <div className="flex justify-between uppercase opacity-100">
                        <span>Subtotal (Items)</span>
                        <span>₱{(baseTotal - orderFees.handling - orderFees.transfer - projectInstallmentFee).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between uppercase opacity-100">
                        <span>Service Charge</span>
                        <span>₱{(orderFees.handling + orderFees.transfer + projectInstallmentFee).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between uppercase opacity-100 font-bold border-t border-white/10 pt-2">
                        <span>Total</span>
                        <span>₱{baseTotal.toLocaleString()}</span>
                      </div>
                      {isAdminCheckoutConfigReady && garageDiscount > 0 && (
                        <div className="flex justify-between text-emerald-300 italic uppercase font-black animate-in fade-in duration-300">
                          <span>Garage Discount</span>
                          <span>₱{garageDiscount.toLocaleString()} OFF</span>
                        </div>
                      )}
                      <div className={`flex justify-between uppercase ${isFreeShippingApplied ? 'text-emerald-300' : 'text-white/60'}`}>
                        <span>Shipping Fee</span>
                        <span>{isFreeShippingApplied ? 'FREE' : 'NOT INCLUDED'}</span>
                      </div>
                      <div className="flex justify-between text-lg font-black italic uppercase pt-2"><span>Total</span><span>₱{totalToSettle.toLocaleString()}</span></div>
                  </div>
                  <div className="space-y-5 pt-5 border-t border-white/10">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <p className="text-[10px] font-black uppercase opacity-60 tracking-widest">Payment Plan</p>
                          <div className="grid grid-cols-2 gap-2">
                            {availablePaymentPlans.map(plan => {
                              const isSelected = checkoutData.paymentPlan === plan;
                              const label = plan === 'full' ? 'Full' : plan === 'reservation' ? 'Reservation' : 'Partial';
                              return (
                                <motion.button
                                  key={plan}
                                  whileTap={{ scale: 0.98 }}
                                  onClick={() => { setAgreedToPolicy(false); updateCheckoutData(prev => ({ ...prev, paymentPlan: plan, initialPayment: plan === 'full' ? 0 : minInitialPayment })); }}
                                  className={`w-full py-3 rounded-xl text-[11px] font-black uppercase border transition-all flex items-center justify-center gap-1.5 ${
                                    isSelected ? 'bg-white text-blue-600 border-white shadow-lg' : 'bg-transparent text-white border-white hover:bg-white/5'
                                  }`}
                                >
                                  <span>{label}</span>
                                  {plan === 'full' && totalAppliedInstallmentFee > 0 && <span className={`text-[11px] font-black ${isSelected ? 'text-black/80' : 'text-emerald-300'}`}>₱{totalAppliedInstallmentFee} OFF</span>}
                                </motion.button>
                              );
                            })}
                          </div>
                        </div>
                        <AnimatePresence>
                          {(checkoutData.paymentPlan === 'partial' || checkoutData.paymentPlan === 'reservation') && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0, marginTop: 0 }}
                              animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                              exit={{ opacity: 0, height: 0, marginTop: 0 }}
                              transition={{ duration: 0.3, ease: "easeInOut" }}
                              className="space-y-2 overflow-hidden"
                            >
                              <p className="text-[10px] font-black uppercase tracking-widest">
                                  DOWNPAYMENT
                              </p>
                              <div className="relative group">
                                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white font-black text-xs">₱</span>
                                  <motion.input 
                                    whileTap={{ scale: 0.99 }}
                                    whileFocus={{ scale: 1.01 }}
                                    transition={{ duration: 0.1 }}
                                    type="number" 
                                    placeholder={minInitialPayment.toString()}
                                    value={checkoutData.initialPayment || ''} 
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      updateCheckoutData(prev => ({...prev, initialPayment: val}));
                                    }}
                                    onBlur={(e) => {
                                      let val = Number(e.target.value) || 0;
                                      // Always apply ceiling by 10s to user input
                                      const ceilingVal = Math.ceil(val / 10) * 10;
                                      
                                      // Clamp within valid range [minInitialPayment, totalToSettle]
                                      const clampedVal = Math.min(Math.max(ceilingVal, minInitialPayment), totalToSettle);
                                      
                                      updateCheckoutData(prev => ({...prev, initialPayment: clampedVal}));
                                    }}
                                    min={minInitialPayment}
                                    max={totalToSettle}
                                    className="w-full pl-8 pr-4 py-3 rounded-xl text-xs font-black focus:outline-none focus:ring-2 focus:ring-white bg-white/10 text-white placeholder:text-white/20 border border-white/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                              </div>
                              <p className="text-[10px] font-bold uppercase">
                              {checkoutData.initialPayment <= minInitialPayment
                              ? `Minimum ${checkoutData.paymentPlan === 'partial' ? 'downpayment amount' : 'reservation fee'} is ₱${minInitialPayment.toLocaleString()}`
                              : checkoutData.initialPayment >= totalToSettle
                                ? 'Why not grab that discount?'
                                : `This is more than minimum ${checkoutData.paymentPlan === 'partial' ? 'project downpayment' : 'reservation fee'}`}
                              </p>
                              <label className="flex items-start gap-3.5 p-4 mt-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer select-none group">
                                <input
                                  type="checkbox"
                                  checked={agreedToPolicy}
                                  onChange={(e) => setAgreedToPolicy(e.target.checked)}
                                  className="sr-only"
                                />
                                <motion.div 
                                  animate={{
                                    backgroundColor: agreedToPolicy ? 'rgb(16 185 129)' : 'rgba(255, 255, 255, 0.05)',
                                    borderColor: agreedToPolicy ? 'rgb(16 185 129)' : 'rgba(255, 255, 255, 0.3)',
                                  }}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  transition={{ duration: 0.15 }}
                                  className="w-5 h-5 min-w-[20px] rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all shadow-inner mt-0.5"
                                >
                                  {agreedToPolicy && (
                                    <motion.svg 
                                      initial={{ scale: 0, rotate: -45 }}
                                      animate={{ scale: 1, rotate: 0 }}
                                      transition={{ type: "spring", stiffness: 500, damping: 20 }}
                                      className="w-3 h-3 text-white stroke-[3.5px]" 
                                      fill="none" 
                                      viewBox="0 0 24 24" 
                                      stroke="currentColor"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </motion.svg>
                                  )}
                                </motion.div>
                                <span className="text-[11px] leading-normal text-white/90 font-medium">
                                  {(() => {
                                    const garageName = garageInfo?.name || garageInfo?.garageName || garageInfo?.displayName || 'SnorlaxGarage';
                                    const policyType = checkoutData.paymentPlan === 'partial' ? 'project downpayment' : 'reservation';
                                    return (
                                      <>
                                        I agree with the <strong className="text-emerald-300 font-extrabold">{garageName}</strong> {policyType} policies.
                                      </>
                                    );
                                  })()}
                                  {Number(checkoutData.initialPayment) > minInitialPayment && (
                                    <span className="text-emerald-300 ml-1.5 font-bold">(*Excess is refundable)</span>
                                  )}
                                  {' '}Read{' '}
                                  <a
                                    href="/payment-and-refund-policy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline font-black text-white hover:text-emerald-300 transition-colors"
                                  >
                                    Policy
                                  </a>.
                                </span>
                              </label>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] font-black uppercase opacity-60 tracking-widest">Payment Method</p>
                        <div className="grid grid-cols-2 gap-2">
                          {/* Gamitin ang availablePaymentMethods na naka-compute na sa useMemo —
                              hindi na kailangan ng duplicate filter logic dito. Naka-apply na
                              ang cash restriction, pre-order check, at active/disabled check. */}
                          {availablePaymentMethods.map(method => {
                            const methodConfig = getPaymentMethodConfig(storeAdmin?.paymentSettings?.methods, method);
                            const hasDiscount = methodConfig.transferDiscount;
                            const isSelected = checkoutData.paymentMethod?.toLowerCase() === method.toLowerCase();

                            return (
                               <motion.button
                                 key={method}
                                 whileTap={{ scale: 0.98 }}
                                 onClick={() => updateCheckoutData(prev => ({ ...prev, paymentMethod: method }))}
                                 className={`w-full py-3 px-4 rounded-xl text-[10px] font-black uppercase border transition-all flex items-center ${hasDiscount && totalAppliedTransferFee > 0 ? 'justify-between' : 'justify-center'} ${
                                   isSelected
                                   ? 'bg-white text-blue-600 border-white shadow-lg'
                                   : 'bg-transparent text-white border-white hover:bg-white/5'
                                 }`}
                               >
                                 <span>{method}</span>
                                 {hasDiscount && totalAppliedTransferFee > 0 && (
                                   <span className={`text-[10px] font-black ${isSelected ? 'text-black/80' : 'text-emerald-300'}`}>
                                     ₱{totalAppliedTransferFee.toLocaleString()} OFF
                                   </span>
                                 )}
                               </motion.button>
                             );
                          })}
                        </div>
                      </div>
                  </div>
                    {(() => {
                      const isDisabled = !isGuestPreview && (
                        isFinalizing || 
                        !checkoutData.shippingMethod || 
                        (!isNoDetailsMode && !isFormValid) || 
                        !checkoutData.paymentPlan || 
                        !checkoutData.paymentMethod ||
                        (checkoutData.paymentPlan !== 'full' && Number(checkoutData.initialPayment) >= totalToSettle) ||
                        (checkoutData.paymentPlan !== 'full' && !agreedToPolicy)
                      );
                      return (
                        <motion.button 
                          onClick={isGuestPreview ? handleGoogleLogin : handleFinalizeOrder} 
                          disabled={isDisabled} 
                          animate={isDisabled ? { scale: 0.96, opacity: 0.5 } : { scale: 1.0, opacity: 1 }}
                          whileHover={isDisabled ? {} : { scale: 1.03, y: -2 }}
                          whileTap={isDisabled ? {} : { scale: 0.95, y: 1 }}
                          transition={{ type: "spring", stiffness: 400, damping: 25 }}
                          className="w-full py-5 rounded-2xl bg-white text-blue-600 font-black uppercase text-xs tracking-[0.2em] shadow-xl flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                        >
                          {isFinalizing ? (
                            <>
                              <Loader2 className="animate-spin" size={18} />
                              <span>Reserving...</span>
                            </>
                          ) : isGuestPreview ? (
                            <>
                              <FcIcons.FcGoogle size={18} />
                              <span>Login with Google</span>
                            </>
                          ) : (
                            'Pay Now'
                          )}
                        </motion.button>
                      );
                    })()}
                </div>
              </div>
            </div>
        )}
        {checkoutStep === 2 && (
          <div className="max-w-4xl mx-auto py-2 md:py-4 animate-in zoom-in-95 duration-500">
             <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 mx-auto mb-2"><CheckCircle2 size={28} /></div>
                <h2 className="text-xl md:text-2xl font-black italic uppercase tracking-tighter">Order Reserved</h2>
                {checkoutData.paymentMethod !== 'Cash' && (
                  <p className="text-[10px] md:text-[11px] font-bold opacity-40 uppercase tracking-widest mt-1">
                      <CountdownTimer createdAt={orderCreatedAt} isMaintenance={isMaintenance} />
                  </p>
                )}
             </div>

             {checkoutData.paymentMethod === 'Cash' ? (
                <div className="max-w-xl mx-auto w-full p-8 bg-black/5 dark:bg-white/5 rounded-[2.5rem] border border-black/5 dark:border-white/10 flex flex-col items-center text-center gap-6 animate-in fade-in duration-300">
                  <div className="p-4 bg-blue-600/10 text-blue-600 rounded-full">
                    <Store size={40} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-black uppercase tracking-wider">Cash Payment Selected</h3>
                    <p className="text-sm font-bold text-neutral-600 dark:text-neutral-300 leading-relaxed max-w-md">
                      {isMaintenance ? (
                        "The garage is still in maintenance mode, this order is invalid"
                      ) : (
                        "Your order is being prepared, we will notify you when it's ready for pickup."
                      )}
                    </p>
                  </div>
                  <div className="w-full p-6 rounded-2xl bg-blue-600 text-white shadow-xl">
                    <p className="text-[10px] font-black uppercase opacity-60">Total to Pay on Pickup</p>
                    <p className="text-3xl font-black italic">₱{amountDueNow.toLocaleString()}</p>
                  </div>
                  <motion.button 
                    whileTap={{ scale: 0.98 }}
                    onClick={handleCloseModal} 
                    className="w-full py-4 bg-white text-blue-600 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    View My Orders
                  </motion.button>
                </div>
             ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-stretch">
                   <div className="space-y-4 md:space-y-6">
                      <div className="p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] bg-blue-600 text-white shadow-xl">
                         <p className="text-[10px] md:text-[11px] font-black uppercase opacity-60">Amount to Settle</p>
                         <p className="text-4xl md:text-5xl font-black italic mb-1">₱{amountDueNow.toLocaleString()}</p>
                         {checkoutData.paymentPlan !== 'full' && (
                           <p className="text-[8px] md:text-[9px] font-bold opacity-60 mt-2">Remaining balance will be due upon pickup/delivery.</p>
                         )}
                      </div>
                      <div className="p-6 md:p-8 bg-black/5 dark:bg-white/5 rounded-[2rem] md:rounded-[2.5rem] border border-black/5 dark:border-white/10 flex flex-col items-center min-h-[300px] md:min-h-[340px] justify-center">
                         {isMaintenance ? (
                           <div className="space-y-4 w-full flex flex-col items-center text-center">
                              <p className="text-[9px] font-black uppercase opacity-60 mb-2">Invalid Order</p>
                              <img src={garageInfo?.logoURL || "https://graph.facebook.com/SnorlaxGarage/picture?type=large"} alt="Brand Logo" className="w-48 h-48 md:w-56 md:h-56 object-contain rounded-2xl bg-white p-2 shadow-sm" />
                              <motion.a 
                                whileTap={{ scale: 0.98 }}
                                href={garageInfo?.logoURL || "https://graph.facebook.com/SnorlaxGarage/picture?type=large"} 
                                download="SG-Logo.png"
                                className="flex items-center justify-center gap-2 w-full max-w-[200px] md:max-w-[224px] py-2.5 md:py-3 bg-blue-600/10 text-blue-600 rounded-xl text-[10px] md:text-[11px] font-black uppercase hover:bg-blue-600/20 transition-all cursor-pointer"
                              >
                                <Download size={14} /> Download Logo
                              </motion.a>
                           </div>
                         ) : (
                             <>
                              {(() => {
                                const pm = checkoutData.paymentMethod;
                                const methodQr = getPaymentMethodConfig(storeAdmin?.paymentSettings?.methods, pm).qr;
                                return (
                                  <>
                                    <p className="text-[9px] font-black uppercase opacity-60 mb-4 md:mb-6">Scan to Pay via {pm}</p>
                                    {methodQr ? (
                                      <div className="space-y-4 w-full flex flex-col items-center">
                                         <img src={methodQr} alt={`${pm} QR`} className="w-48 h-48 md:w-56 md:h-56 object-contain rounded-2xl bg-white p-2 shadow-sm" />
                                         <motion.a 
                                            whileTap={{ scale: 0.98 }}
                                            href={methodQr} 
                                            download={`${pm}-QR.png`}
                                            className="flex items-center justify-center gap-2 w-full max-w-[200px] md:max-w-[224px] py-2.5 md:py-3 bg-blue-600/10 text-blue-600 rounded-xl text-[10px] md:text-[11px] font-black uppercase hover:bg-blue-600/20 transition-all cursor-pointer"
                                          >
                                            <Download size={14} /> Download QR
                                          </motion.a>
                                      </div>
                                    ) : (
                                      <div className="p-4 rounded-xl bg-red-500/10 text-red-500 text-[10px] font-black uppercase text-center">
                                        QR not available. Please contact admin.
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </>
                         )}
                      </div>
                   </div>
                   <div className="h-full">
                      <div className="h-full flex flex-col">
                         {!previewUrl ? (
                           <label className="block w-full cursor-pointer group h-full">
                               <input type="file" className="hidden" accept="image/*" onChange={handleFileSelect} disabled={isUploading} />
                               <div className="w-full h-full min-h-[400px] md:min-h-[460px] rounded-[2rem] md:rounded-[2.5rem] border-2 border-dashed border-blue-600/30 flex flex-col items-center justify-center gap-4 group-hover:bg-blue-600/5 transition-all bg-black/5 dark:bg-white/5">
                                  <div className="p-5 md:p-6 rounded-full bg-blue-600/10 text-blue-600 transition-transform group-hover:scale-110">
                                    <Camera size={40} md:size={48} />
                                  </div>
                                  <div className="text-center space-y-1"> 
                                    <span className="text-[11px] md:text-xs font-black uppercase tracking-[0.2em] text-blue-600 block">Upload Receipt Screenshot</span>
                                    <span className="text-[9px] font-bold opacity-40 uppercase tracking-widest block">Tap or Drag image here</span>
                                  </div>
                               </div>
                           </label>
                         ) : (
                           <div className="space-y-4 md:space-y-6 animate-in zoom-in-95 duration-300 text-center flex flex-col h-full">
                               <div className="flex-1 bg-black/5 dark:bg-white/5 rounded-[2rem] md:rounded-[2.5rem] p-4 border border-black/5 dark:border-white/10 overflow-hidden">
                                  <img src={previewUrl} className="w-full h-full object-contain rounded-[1.5rem]" alt="Receipt Preview" />
                               </div>
                               <div className="flex gap-3 md:gap-4 flex-none">
                                  <motion.button whileTap={{ scale: 0.98 }} onClick={handleConfirmReceipt} disabled={isUploading} className="flex-[2] py-4 md:py-5 bg-emerald-600 text-white rounded-[1.5rem] md:rounded-[2rem] font-black uppercase text-[10px] md:text-xs tracking-widest shadow-lg shadow-emerald-600/20 active:scale-95 transition-all">Confirm & Upload</motion.button>
                                  <motion.button whileTap={{ scale: 0.98 }} onClick={() => setPreviewUrl(null)} disabled={isUploading} className="flex1 py-4 md:py-5 bg-black/5 text-neutral-500 rounded-[1.5rem] md:rounded-[2rem] font-black uppercase text-[10px] md:text-xs tracking-widest hover:bg-black/10 transition-all active:scale-95">Change</motion.button>
                               </div>
                           </div>
                         )}
                      </div>
                   </div>
                </div>
             )}
          </div>
        )}
      </div>
    </div>
  );
}
