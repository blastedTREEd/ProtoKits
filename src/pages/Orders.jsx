import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { useTheme } from '../context/ThemeContext';
import PageTemplate from './PageTemplate';
import { 
  ClipboardList, Plus, MapPin, Package, ShieldCheck, X, CheckCircle2, 
  ChevronRight, Clock, Store, Truck, Tag, Trash2, AlertCircle,
  Camera, Upload, QrCode, ArrowRight, Eye, RefreshCw, Download, ListTodo
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import LoadingState from '../components/common/LoadingState';

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

function ReservationTimer({ createdAt, expiresAt, onExpire }) {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const calculateTime = () => {
      if (!createdAt) return;
      const start = createdAt.seconds ? createdAt.seconds * 1000 : new Date(createdAt).getTime();
      const end = expiresAt 
        ? (expiresAt.seconds ? expiresAt.seconds * 1000 : new Date(expiresAt).getTime())
        : (start + (60 * 60 * 1000));
      const now = new Date().getTime();
      const diff = end - now;
      if (diff <= 0) { setTimeLeft('EXPIRED'); if (onExpire) onExpire(); return; }
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      
      if (hours > 0) {
        setTimeLeft(`${hours}h ${mins}m ${secs}s`);
      } else {
        setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
      }
    };
    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [createdAt, expiresAt, onExpire]);
  return <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-500 rounded-full"><Clock size={12} /><span className="text-[10px] font-black tracking-widest">{timeLeft}</span></div>;
}

function DeletionTimer({ completedAt, onExpire }) {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const calculateTime = () => {
      if (!completedAt) return;
      const start = completedAt.seconds ? completedAt.seconds * 1000 : new Date(completedAt).getTime();
      const end = start + 60000; // 1 minute
      const now = Date.now();
      const diff = end - now;
      if (diff <= 0) {
        setTimeLeft('Deleting...');
        if (onExpire) onExpire();
        return;
      }
      const secs = Math.ceil(diff / 1000);
      setTimeLeft(`Deleting in ${secs}s`);
    };
    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [completedAt, onExpire]);
  
  return (
    <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 uppercase tracking-wider border border-amber-500/20 animate-pulse whitespace-nowrap">
      {timeLeft}
    </span>
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


export default function Orders() {
  const { isDarkMode } = useTheme();
  const { user, isAdmin, isAdminView, kits, createDummyUser, assignStockToOrder, cancelOrder, confirmOrderPayment, uploadReceipt, updateOrderDetails, updateOrderStatus, rates, orders, usersList, createOrder, deleteOrder, isLoading, subscribeOrders, subscribeUsersList, loadPrintResources, shippingSettings, garageInfo, cleanUpCancelledOrders, setToastMessage } = useStore();
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
  const [activePreviewUrl, setActivePreviewUrl] = useState(null);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [hasPreviewedReceipt, setHasPreviewedReceipt] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [isMultiSelectEnabled, setIsMultiSelectEnabled] = useState(false);

  useEffect(() => {
    setSelectedOrders([]);
    setIsMultiSelectEnabled(false);
  }, [activeTab]);

  // Auto-deletion ng cancelled orders maliban sa Cash o Installments pagkatapos ng 24 oras
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

  const toggleOrderSelection = (e, id) => {
    e.stopPropagation();
    setSelectedOrders(prev => 
      prev.includes(id) ? prev.filter(oid => oid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedOrders.length === visibleOrders.length && visibleOrders.length > 0) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(visibleOrders.map(o => o.id));
    }
  };

  const handleBatchDelete = async () => {
    const selectedOrderObjects = visibleOrders.filter(o => selectedOrders.includes(o.id));
    const cashCount = selectedOrderObjects.filter(o => o.paymentMethod === 'Cash').length;
    const installmentCount = selectedOrderObjects.filter(o => o.paymentPlan && o.paymentPlan !== 'full').length;

    let breakdown = '';
    if (cashCount > 0) breakdown += `\n• ${cashCount} Cash order${cashCount > 1 ? 's' : ''}`;
    if (installmentCount > 0) breakdown += `\n• ${installmentCount} Installment order${installmentCount > 1 ? 's' : ''}`;
    const warningLine = (cashCount > 0 || installmentCount > 0)
      ? `\n\n⚠️ Includes special payment orders:${breakdown}`
      : '';

    const confirmed = window.confirm(
      `Permanently DELETE ${selectedOrders.length} order${selectedOrders.length > 1 ? 's' : ''}?${warningLine}\n\nThis cannot be undone.`
    );
    if (confirmed) {
      try {
        await Promise.all(selectedOrders.map(id => deleteOrder(id)));
        setSelectedOrders([]);
        setIsMultiSelectEnabled(false);
        alert(`Successfully deleted ${selectedOrders.length} order${selectedOrders.length > 1 ? 's' : ''}.`);
      } catch (err) {
        console.error("SG LOG: Batch delete error:", err);
        alert("Failed to delete some orders.");
      }
    }
  };

  const [trackingRef, setTrackingRef] = useState('');
  const [customerTrackingLink, setCustomerTrackingLink] = useState('');
  const [meetupScheduleInput, setMeetupScheduleInput] = useState('');
  const [claimantBalance, setClaimantBalance] = useState('');
  const [shippingFeeInput, setShippingFeeInput] = useState('');
  const [manualOrderData, setManualOrderData] = useState({ 
    buyerUid: '', 
    newBuyerName: '', 
    selectedKitId: '', 
    selectedStockKey: '', 
    buyerPaid: 0, 
    shippingMethod: 'LBC COP/COD', 
    meetupLocation: '', 
    shippingFee: 0, 
    handlingFee: 0, 
    transferFee: 0 
  });

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
        const createdAt = o.createdAt;
        if (createdAt) {
          const start = createdAt.seconds ? createdAt.seconds * 1000 : new Date(createdAt).getTime();
          const end = o.expiresAt 
            ? (o.expiresAt.seconds ? o.expiresAt.seconds * 1000 : new Date(o.expiresAt).getTime())
            : (start + (60 * 60 * 1000));
          if (now >= end) {
            console.log(`SG LOG: Silently cancelling expired order ${o.orderId} in background`);
            try {
              await cancelOrder(o.id);
              if (selectedOrder?.id === o.id) {
                setSelectedOrder(null);
              }
            } catch (err) {
              console.error("SG LOG: Background auto-cancel failed:", err);
            }
          }
        }
      }
    });
  }, [orders, cancelOrder, selectedOrder]);

  useEffect(() => {
    if (!isAdminMode) return undefined;
    const unsubscribe = subscribeUsersList();
    return () => unsubscribe && unsubscribe();
  }, [subscribeUsersList, isAdminMode]);

  useEffect(() => {
    if (selectedOrder) {
      setTrackingRef(selectedOrder.trackingNo || '');
      setCustomerTrackingLink(selectedOrder.customerTrackingLink || selectedOrder.trackingLink || '');
      setMeetupScheduleInput(selectedOrder.preferredSchedule || '');
      setClaimantBalance(selectedOrder.claimantBalance || '');
      setShippingFeeInput(selectedOrder.shippingFee ?? '');
    }
  }, [selectedOrder]);

  const supplierObligations = useMemo(() => {
    let total = 0;
    (kits || []).forEach(kit => { Object.values(kit?.stocks || {}).forEach(stock => { if (stock?.status?.toUpperCase() === 'PRE-ORDER') { const balance = (Number(stock?.costPrice) || 0) - (Number(stock?.paidToSupplier) || 0); if (balance > 0) total += balance; } }); });
    return total;
  }, [kits]);

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

  const availableStocks = useMemo(() => {
    if (!manualOrderData.selectedKitId || !kits) return [];
    const kit = kits.find(k => k.id === manualOrderData.selectedKitId);
    if (!kit || !kit.stocks) return [];
    return Object.entries(kit.stocks).filter(([, s]) => s && !s.order?.orderId && !s.isReserved).map(([key, s]) => ({ key, ...s }));
  }, [manualOrderData.selectedKitId, kits]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
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
  };
  const handleConfirmReceipt = async (order) => { if (!previewUrl) return; setIsUploading(true); try { await uploadReceipt(order.id, previewUrl); alert("Uploaded!"); if (selectedOrder?.id === order.id) setSelectedOrder(prev => ({ ...prev, receipt: previewUrl, status: 'Validating' })); setPreviewUrl(null); } catch (e) { console.error(e); alert("Failed."); } finally { setIsUploading(false); } };
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
    setSelectedOrder(prev => ({ ...prev, ...patch, status: 'In Transit' }));
  };

  const handleSaveMeetupSchedule = async () => {
    if (!selectedOrder) return;
    if (!String(meetupScheduleInput || '').trim()) {
      alert("Please choose a preferred meetup time.");
      return;
    }
    try {
      await updateOrderDetails(selectedOrder.id, { preferredSchedule: meetupScheduleInput });
      alert("Preferred meetup time saved!");
      setSelectedOrder(prev => ({ ...prev, preferredSchedule: meetupScheduleInput }));
    } catch (e) {
      console.error(e);
      alert("Failed to save meetup time.");
    }
  };

  const handleSavePickupSchedule = async () => {
    if (!selectedOrder) return;
    if (!String(meetupScheduleInput || '').trim()) {
      alert("Please choose a preferred pickup schedule.");
      return;
    }
    try {
      await updateOrderDetails(selectedOrder.id, { preferredSchedule: meetupScheduleInput });
      alert("Preferred pickup schedule saved!");
      setSelectedOrder(prev => ({ ...prev, preferredSchedule: meetupScheduleInput }));
    } catch (e) {
      console.error(e);
      alert("Failed to save pickup schedule.");
    }
  };

  const handleSaveCustomerTrackingLink = async () => {
    if (!selectedOrder) return;
    if (!customerTrackingLink.trim()) {
      alert("Please input a valid Lalamove tracking URL.");
      return;
    }
    try {
      await updateOrderDetails(selectedOrder.id, { customerTrackingLink });
      alert("Lalamove tracking URL saved!");
      setSelectedOrder(prev => ({ ...prev, customerTrackingLink }));
    } catch (e) {
      console.error(e);
      alert("Failed to save tracking URL.");
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
        setSelectedOrder(null);
        await updateOrderStatus(orderId, 'Completed');
        setToastMessage("Invalid order moved to Completed. It will be deleted in 1 minute.");
        
        setTimeout(async () => {
          try {
            await deleteOrder(orderId);
            setToastMessage("Invalid order deleted and stock released.");
          } catch (err) {
            console.error("SG LOG: Delayed delete failed:", err);
          }
        }, 60000);
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
        setSelectedOrder(prev => ({ ...prev, status: 'Completed' }));
      } catch (e) {
        console.error(e);
        alert("Failed to update status.");
      }
    }
  };

  const handleCreateManualOrder = async (e) => {
    e.preventDefault();
    const { buyerUid, newBuyerName, selectedKitId, selectedStockKey, buyerPaid, shippingMethod, meetupLocation, shippingFee, handlingFee, transferFee } = manualOrderData;
    if ((!buyerUid && !newBuyerName) || !selectedKitId || !selectedStockKey) return;
    
    const kit = kits.find(k => k.id === selectedKitId);
    const stock = kit?.stocks?.[selectedStockKey];
    if (!stock) return;
    
    const orderId = `#SG-${Math.floor(Math.random() * 9000) + 1000}`;
    const targetUid = buyerUid || await createDummyUser(newBuyerName);
    
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
      userId: targetUid, 
      buyerName: buyerUid ? (usersList.find(u => u.uid === buyerUid)?.displayName) : newBuyerName.toUpperCase(), 
      item: `${kit?.specs?.line || ''} ${kit?.name}`.trim(), 
      status: "Reserved", 
      isPreOrder: stock.status === 'PRE-ORDER', 
      isManualOrder: true, 
      isMaintenanceOrder: isMaintenance || false,
      shippingMethod: shippingMethod === 'Seller Meetup' ? `Meetup: ${meetupLocation}` : shippingMethod, 
      shippingFee: Number(shippingFee) || 0, 
      handlingFee: Number(handlingFee) || 0, 
      transferFee: Number(transferFee) || 0, 
      buyerPaid: Number(buyerPaid) || 0, 
      price: stock?.sellPrice || kit?.sellPrice || 0, 
      date: new Date().toLocaleDateString(), 
      createdAt: createdTime,
      expiresAt: expirationDate.toISOString()
    }; 
    
    const docId = await createOrder(orderData); 
    await assignStockToOrder(selectedKitId, selectedStockKey, orderId, { isManualOrder: true, orderDocId: docId }); 
    alert("Created."); 
    setShowManualOrderModal(false); 
    setManualOrderData({ buyerUid: '', newBuyerName: '', selectedKitId: '', selectedStockKey: '', buyerPaid: 0, shippingMethod: 'LBC COP/COD', meetupLocation: '', shippingFee: 0, handlingFee: 0, transferFee: 0 }); 
  };
  const handleRequestBalance = async (orderId) => { if (window.confirm("Request balance?")) { await updateOrderDetails(orderId, { status: 'Arrived', receipt: null }); if (selectedOrder?.id === orderId) setSelectedOrder(prev => ({ ...prev, status: 'Arrived', receipt: null })); } };
  const handleConfirmPayment = async (order) => {
    const isSecondPaymentPending = order.items?.some(item => 
      item.type === 'project' && 
      item.projectData?.method?.name?.toUpperCase() === 'STL' && 
      item.projectData?.selectedDesignService
    ) && order.designFinalized && !order.printDownpaymentPaid && (Number(order.buyerPaid) < Number(order.minDownpayment));

    let amount = 0;
    let extraFields = {};

    if (isSecondPaymentPending) {
      amount = Math.max(0, Number(order.minDownpayment || 0) - Number(order.originalPaymentDueNow || 0));
      extraFields = { printDownpaymentPaid: true };
    } else {
      amount = calculateBalance(order);
    }

    if (window.confirm(`Confirm payment ₱${amount.toLocaleString()}?`)) {
      await confirmOrderPayment(order.id, amount);
      if (Object.keys(extraFields).length > 0) {
        await updateOrderDetails(order.id, extraFields);
      }
      const newStatus = order.shippingMethod?.toUpperCase().includes('LBC') ? 'To Ship' : 'Preparing';
      await updateOrderStatus(order.id, newStatus);
      if (selectedOrder?.id === order.id) {
        setSelectedOrder(prev => ({
          ...prev,
          status: newStatus,
          buyerPaid: (Number(prev.buyerPaid) || 0) + amount,
          ...extraFields
        }));
      }
    }
  };
  const handleCancelOrder = async (orderId) => { if (window.confirm("Cancel order?")) { await cancelOrder(orderId); setSelectedOrder(null); } };
  const handleSilentCancelOrder = useCallback(async (orderId) => {
    try {
      await cancelOrder(orderId);
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(null);
      }
    } catch (err) {
      console.error("SG LOG: Silent cancel error:", err);
    }
  }, [cancelOrder, selectedOrder]);
  const handleDeleteOrder = async (e, orderId) => { e.stopPropagation(); if (window.confirm("DELETE record?")) { await deleteOrder(orderId); if (selectedOrder?.id === orderId) setSelectedOrder(null); } };
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

  const isReadyForPickupStatus = (status) => ['Ready for Pickup', 'Ready for Meetup'].includes(status);
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
    return order.status;
  };

  const getBuyerAddressDetails = (order) => {
    const rd = order?.receiverDetails || {};
    const flags = getShippingFlags(order);
    const addressParts = [rd.houseNo, rd.houseDetails, rd.subdivision, rd.barangay, rd.city, rd.province, rd.zipCode].filter(Boolean);
    const location = flags.isLbc && rd.lbcBranch
      ? rd.lbcBranch
      : flags.isMeetup
        ? order?.meetupLocation
        : flags.isSelfPickup
          ? order?.pickupLocation
          : addressParts.join(', ');

    return {
      receiverName: rd.receiverName || order?.buyerName || '',
      phoneNumber: rd.phoneNumber || '',
      display: location || 'No details',
      schedule: order?.preferredSchedule || '',
      landmark: rd.landmark || '',
      lat: rd.lat,
      lng: rd.lng,
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
    const paid = Number(order?.buyerPaid) || 0;
    const total = Math.max(0, itemTotal + shippingFee + handlingFee + transferFee - discount);
    const balance = Math.max(0, total - paid);
    return { itemTotal, shippingFee, handlingFee, transferFee, discount, paid, total, balance };
  };
  
  const tabData = useMemo(() => {
    const isLBC = (o) => o.shippingMethod?.toUpperCase().includes('LBC');
    const baseTabs = (isAdminMode ? [
      { id: 'to_validate', label: 'To Validate', filter: (o) => o.status === 'Validating' || (!isLBC(o) && calculateBalance(o) > 0 && o.status === 'Arrived') || (calculateBalance(o) > 0 && o.status === 'Reserved') },
      { id: 'to_follow', label: 'To Follow', filter: (o) => o.status === 'Waiting' },
      { id: 'to_ship', label: 'To Ship', filter: (o) => (isLBC(o) || calculateBalance(o) <= 0) && ['Preparing', 'Ready for Pickup', 'Ready for Meetup', 'Arrived', 'To Ship'].includes(o.status) },
      { id: 'to_receive', label: 'To Receive', filter: (o) => o.status === 'Shipped' || o.status === 'Dispatched' || o.status === 'In Transit' },
      { id: 'completed', label: 'Completed', filter: (o) => o.status === 'Completed' },
      { id: 'cancelled', label: 'Cancelled', filter: (o) => o.status === 'Cancelled' }
    ] : [
      { id: 'to_pay', label: 'To Pay', filter: (o) => o.status === 'Reserved' || o.status === 'Validating' || (!isLBC(o) && calculateBalance(o) > 0 && o.status === 'Arrived') },
      { id: 'to_follow', label: 'To Follow', filter: (o) => o.status === 'Waiting' },
      { id: 'to_ship', label: 'To Ship', filter: (o) => (isLBC(o) || calculateBalance(o) <= 0) && ['Preparing', 'Ready for Pickup', 'Ready for Meetup', 'Arrived', 'To Ship'].includes(o.status) },
      { id: 'to_receive', label: 'To Receive', filter: (o) => o.status === 'Shipped' || o.status === 'Dispatched' || o.status === 'In Transit' },
      { id: 'completed', label: 'Completed', filter: (o) => o.status === 'Completed' },
      { id: 'cancelled', label: 'Cancelled', filter: (o) => o.status === 'Cancelled' }
    ]);
    return baseTabs.map(t => ({ ...t, orders: sortedOrders.filter(t.filter) }));
  }, [sortedOrders, isAdminMode, calculateBalance]);

  const totalUserBalance = useMemo(() => isAdminMode ? 0 : sortedOrders.filter(o => !['Shipped', 'Dispatched', 'In Transit', 'Completed', 'Cancelled'].includes(o.status)).reduce((sum, o) => sum + Math.max(0, calculateBalance(o)), 0), [sortedOrders, calculateBalance, isAdminMode]);

  useEffect(() => { 
    if (!isLoading && tabData.length > 0 && !tabData.find(t => t.id === activeTab)) {
      setActiveTab(tabData[0].id);
    }
  }, [tabData, activeTab, isLoading]);

  const activeTabData = tabData.find((tab) => tab.id === activeTab) || tabData[0];
  const visibleOrders = activeTabData?.orders || [];
  const selectedShippingFlags = selectedOrder ? getShippingFlags(selectedOrder) : {};
  const selectedLogistics = selectedOrder ? getBuyerAddressDetails(selectedOrder) : {};
  const selectedTotals = selectedOrder ? getOrderTotals(selectedOrder) : {};

  const hasStlWithDesignService = selectedOrder?.items?.some(item => 
    item.type === 'project' && 
    item.projectData?.method?.name?.toUpperCase() === 'STL' && 
    item.projectData?.selectedDesignService
  );
  const isSecondPaymentPending = hasStlWithDesignService && selectedOrder?.designFinalized && !selectedOrder?.printDownpaymentPaid && (Number(selectedOrder?.buyerPaid) < Number(selectedOrder?.minDownpayment));
  const printDp = isSecondPaymentPending ? Math.max(0, Number(selectedOrder?.minDownpayment || 0) - Number(selectedOrder?.originalPaymentDueNow || 0)) : 0;
  const canCustomerCancel = Boolean(selectedOrder && !isAdminMode && !selectedOrder.receipt && selectedOrder.status !== 'Cancelled');
  const canAdminCancel = Boolean(selectedOrder && isAdminMode && selectedOrder.status !== 'Cancelled');
  const showPaymentQr = Boolean(selectedOrder && !isAdminMode && selectedTotals.balance > 0 && !selectedOrder.receipt);
  const isMaintenance = shippingSettings?.paymentSettings?.maintenanceMode === true;
  // isMaintenanceOrder is stored on the order itself — stays true even after maintenance is lifted
  const isOrderFromMaintenance = Boolean(selectedOrder?.isMaintenanceOrder);
  const brandLogoUrl = garageInfo?.logoURL || "https://graph.facebook.com/SnorlaxGarage/picture?type=large";
  const selectedMethodQr = getMethodQr(selectedOrder?.paymentMethod);
  const qrImageSrc = isOrderFromMaintenance ? brandLogoUrl : selectedMethodQr;
  const showQrContainer = showPaymentQr && (selectedOrder?.paymentMethod !== 'Cash' || isOrderFromMaintenance) && qrImageSrc;

  return (
    <PageTemplate isDarkMode={isDarkMode}>
      <div className="min-h-screen flex flex-col bg-neutral-50 dark:bg-[#0a0a0a] font-sans">
        <div className="sticky top-[60px] z-[90] h-[60px] w-full bg-neutral-50 dark:bg-[#0a0a0a] border-b border-black/5 dark:border-white/5">
          <div className="max-w-7xl mx-auto px-4 md:px-8 h-full flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2">
              {tabData.map((tab) => (
                <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedOrder(null); }} className={`whitespace-nowrap px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-transparent text-neutral-500 dark:text-neutral-300 border-black/10 dark:border-white/10 hover:border-blue-500/50'}`}>
                  {tab.label} ({tab.orders.length})
                </button>
              ))}
            </div>
            {isAdminMode ? (
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-[7px] font-black uppercase opacity-40 tracking-widest leading-none mb-1">Supplier Bal</p>
                  <p className="text-[10px] font-black text-red-500 italic leading-none">₱{supplierObligations.toLocaleString()}</p>
                </div>
              </div>
            ) : (totalUserBalance > 0 && (
              <div className="text-right shrink-0">
                <p className="text-[7px] font-black uppercase opacity-40 tracking-widest leading-none mb-1">Payable Balance</p>
                <p className="text-xs font-black text-red-500 italic leading-none">₱{totalUserBalance.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>


        <div className="flex-grow max-w-7xl mx-auto w-full p-4 md:p-8 pb-24 md:pb-8">
          {isLoading ? (
            <LoadingState message="Loading orders..." />
          ) : (
            <div className="space-y-3">
              {visibleOrders.length === 0 && (
                <div className="text-center py-20 opacity-40">
                  <ClipboardList size={56} className="mx-auto mb-4" />
                  <p className="font-black uppercase tracking-widest text-sm">No orders here</p>
                </div>
              )}
              {visibleOrders.map(o => {
                const isSelected = selectedOrders.includes(o.id);
                const balance = calculateBalance(o);
                const isPaid = balance <= 0 && o.status !== 'Reserved';

                // Helper: Firestore Timestamp or ISO string → Date
                const tsToDate = (ts) => {
                  if (!ts) return null;
                  if (ts.seconds) return new Date(ts.seconds * 1000);
                  const d = new Date(ts);
                  return isNaN(d) ? null : d;
                };
                const fmtDate = (ts) => {
                  const d = tsToDate(ts);
                  if (!d) return null;
                  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                };

                const createdLabel  = fmtDate(o.createdAt);
                const cancelledLabel = o.status === 'Cancelled'
                  ? fmtDate(o.cancelledAt || o.expiresAt)
                  : null;

                return (
                  <div
                    key={o.id}
                    onClick={(e) => {
                      if (isMultiSelectEnabled) {
                        toggleOrderSelection(e, o.id);
                      } else {
                        setSelectedOrder(o);
                      }
                    }}
                    className={`p-3 rounded-2xl border-2 cursor-pointer flex gap-4 items-center transition-all duration-200 ${
                      isSelected
                        ? 'border-blue-500 shadow-lg shadow-blue-500/10'
                        : 'border-black/5 dark:border-white/5 hover:border-black/15 dark:hover:border-white/15'
                    } bg-white dark:bg-neutral-900`}
                  >

                    {/* Thumbnail */}
                    {(() => {
                      const firstItem = o.items?.[0] || o;
                      const kit = kits.find(k => k.id === firstItem.id || k.id === o.kitId || k.id === o.productId || k.name === o.item);
                      const displayImage = firstItem.type === 'project'
                        ? (firstItem.projectData?.image || firstItem.image)
                        : resolveImage(firstItem.image || kit?.image, firstItem.images || kit?.images);

                      return (
                        <div className="shrink-0 flex items-center justify-center">
                          <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center overflow-hidden">
                            {displayImage ? (
                              <img src={displayImage} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Package size={28} className="opacity-20" />
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Main content */}
                    <div className="flex-1 flex flex-col gap-2 min-w-0">
                      {/* Row 1: Order ID + date + buyer name */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-black text-xs text-blue-600 uppercase italic">{o.orderId}</span>
                          <span className="text-[9px] font-bold opacity-30 ml-2">{o.date}</span>
                          {isAdminMode && o.buyerName && (
                            <p className="text-[10px] font-black uppercase opacity-50 tracking-wider truncate mt-0.5">{o.buyerName}</p>
                          )}
                        </div>
                        {/* Balance / Paid indicator */}
                        <div className="shrink-0 flex items-center gap-2">
                          {isPaid ? (
                            <CheckCircle2 size={18} className="text-emerald-500" />
                          ) : (
                            <span className="font-black text-sm text-neutral-900 dark:text-white">
                              ₱{balance.toLocaleString()}
                            </span>
                          )}
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

                      {/* Row 2: Timestamps */}
                      <div className="flex flex-col gap-0.5">
                        {createdLabel && (
                          <p className="text-[10px] font-bold opacity-50">
                            <span className="opacity-60 mr-1">Created</span>{createdLabel}
                          </p>
                        )}
                        {cancelledLabel && (
                          <p className="text-[10px] font-bold text-red-400">
                            <span className="opacity-70 mr-1">Cancelled</span>{cancelledLabel}
                          </p>
                        )}
                      </div>

                      {/* Row 3: Badges */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* Invalid Order Badge — permanent for maintenance-mode orders */}
                        {o.isMaintenanceOrder && (
                          <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-red-500/15 text-red-500 uppercase tracking-wider border border-red-500/20">
                            ⚠ Invalid Order
                          </span>
                        )}
                        {o.isMaintenanceOrder && ['Completed', 'Cancelled'].includes(o.status) && (
                          <DeletionTimer completedAt={o.completedAt || o.cancelledAt || o.lastUpdated} />
                        )}
                        {/* Shipping */}
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/5 text-neutral-500 dark:text-neutral-400 uppercase tracking-wider truncate max-w-[140px]">
                          {o.shippingMethod || '—'}
                        </span>
                        {/* Payment Plan */}
                        {o.paymentPlan && o.paymentPlan !== 'full' ? (
                          <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-500 uppercase tracking-wider">
                            {o.paymentPlan === 'partial' ? 'Partial' : o.paymentPlan === 'reservation' ? 'Reservation' : 'Installment'}
                          </span>
                        ) : (
                          <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 uppercase tracking-wider">
                            Full Pay
                          </span>
                        )}
                        {/* Payment Method */}
                        {o.paymentMethod && (
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${
                            o.paymentMethod === 'GCash' ? 'bg-blue-500/10 text-blue-500' :
                            o.paymentMethod === 'Cash'  ? 'bg-amber-500/10 text-amber-600' :
                            'bg-neutral-500/10 text-neutral-500'
                          }`}>
                            {o.paymentMethod}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── STICKY FOOTER ── */}
        {isAdminMode && !isLoading && (
          <div className="sticky bottom-0 z-[88] w-full h-[60px] bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border-t border-black/5 dark:border-white/5 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
            <div className="max-w-7xl mx-auto px-4 md:px-8 h-full flex items-center justify-between gap-4">

              {/* LEFT: Select All (only when multi-select is active and there are orders) */}
              <div className="flex items-center gap-3 min-w-0">
                {isMultiSelectEnabled && visibleOrders.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:opacity-70 transition-opacity animate-in fade-in duration-200 whitespace-nowrap"
                  >
                    {selectedOrders.length === visibleOrders.length && visibleOrders.length > 0 ? 'Deselect All' : 'Select All'}
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
                    <span>Delete ({selectedOrders.length})</span>
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

                {/* Manual Order button */}
                <button
                  onClick={() => setShowManualOrderModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-black italic uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                >
                  <Plus size={14} /> Manual
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedOrder && (
          <div className="fixed inset-0 z-[400] flex items-stretch justify-stretch p-0 sm:landscape:items-center sm:landscape:justify-center sm:landscape:p-4 lg:items-center lg:justify-center lg:p-4 backdrop-blur-md bg-black/60" onClick={() => setSelectedOrder(null)}>
            <div className="bg-white dark:bg-[#0a0a0a] w-full h-[100dvh] max-h-[100dvh] sm:landscape:h-auto sm:landscape:max-h-[90vh] lg:h-auto lg:max-h-[90vh] sm:landscape:max-w-7xl lg:max-w-7xl rounded-none sm:landscape:rounded-[2.5rem] lg:rounded-[2.5rem] p-5 sm:p-6 sm:landscape:p-8 lg:p-8 shadow-2xl relative overflow-y-auto no-scrollbar text-neutral-900 dark:text-white" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setSelectedOrder(null)} className="absolute top-4 right-4 sm:landscape:top-6 sm:landscape:right-6 lg:top-6 lg:right-6 opacity-30 hover:opacity-100"><X size={24}/></button>
              
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-blue-600/10 rounded-2xl text-blue-600"><Package size={24} /></div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-black uppercase italic tracking-tight">{selectedOrder.orderId}</h2>
                    {selectedOrder.status === 'Reserved' && !selectedOrder.receipt && (
                      <div className="px-3 py-1 bg-amber-500/10 text-amber-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                        <ReservationTimer createdAt={selectedOrder.createdAt} expiresAt={selectedOrder.expiresAt} onExpire={() => handleSilentCancelOrder(selectedOrder.id)} />
                      </div>
                    )}
                    {selectedOrder.isMaintenanceOrder && ['Completed', 'Cancelled'].includes(selectedOrder.status) && (
                      <DeletionTimer completedAt={selectedOrder.completedAt || selectedOrder.cancelledAt || selectedOrder.lastUpdated} onExpire={() => setSelectedOrder(null)} />
                    )}
                  </div>
                  <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">{selectedOrder.date}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* COLUMN 1: LOGISTICS */}
                <div className="space-y-6">
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-3">Shipping Details</h4>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 px-4 py-3 bg-black/5 dark:bg-white/5 rounded-2xl border">
                        <Truck size={18} className="text-blue-600" />
                        <div>
                          <p className="text-[8px] font-black uppercase opacity-40 mb-1">Method</p>
                          <span className="text-xs font-black uppercase">{selectedOrder.shippingMethod}</span>
                        </div>
                      </div>

                      {/* Pickup Point for local pickup, self-booking, and pickup-point courier orders */}
                      {!isAdminMode && selectedShippingFlags.usesPickupPoint && (
                        <>
                          {['Ready for Pickup', 'In Transit', 'Dispatched', 'Completed'].includes(selectedOrder.status) ? (
                            <>
                              {selectedOrder.pickupDetails ? (
                                <div className="space-y-3 text-left p-4 bg-blue-500/5 dark:bg-blue-500/10 rounded-2xl border border-blue-500/20">
                                  <p className="text-[8px] font-black uppercase text-blue-500 tracking-widest leading-none mb-1">Pickup Location (Complete Address)</p>
                                  <p className="text-xs font-black uppercase">{selectedOrder.pickupDetails.label}</p>
                                  <p className="text-xs font-bold opacity-70 leading-relaxed">
                                    {selectedOrder.pickupDetails.address}
                                  </p>
                                  {selectedOrder.pickupDetails.lat && selectedOrder.pickupDetails.lng && (
                                    <div className="mt-2 overflow-hidden rounded-2xl border border-black/5 dark:border-white/5 h-[200px] w-full relative z-10">
                                      <MapContainer 
                                        center={[selectedOrder.pickupDetails.lat, selectedOrder.pickupDetails.lng]} 
                                        zoom={16} 
                                        scrollWheelZoom={false} 
                                        style={{ height: '100%', width: '100%' }}
                                      >
                                        <TileLayer
                                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        />
                                        <Marker position={[selectedOrder.pickupDetails.lat, selectedOrder.pickupDetails.lng]} />
                                        <ChangeView center={[selectedOrder.pickupDetails.lat, selectedOrder.pickupDetails.lng]} />
                                      </MapContainer>
                                    </div>
                                  )}
                                </div>
                              ) : selectedOrder.pickupLocation ? (
                                <div className="space-y-3 text-left p-4 bg-blue-500/5 dark:bg-blue-500/10 rounded-2xl border border-blue-500/20">
                                  <p className="text-[8px] font-black uppercase text-blue-500 tracking-widest leading-none mb-1">Pickup Location</p>
                                  <p className="text-xs font-black uppercase">{selectedOrder.pickupLocation}</p>
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <div className="p-4 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-2xl text-left">
                              <p className="text-[8px] font-black uppercase text-amber-500 tracking-widest leading-none mb-1">Pickup Information</p>
                              <p className="text-xs font-bold opacity-75 leading-relaxed">
                                Waiting for seller to prepare items. The complete pickup address and map will be visible here once marked ready.
                              </p>
                            </div>
                          )}
                        </>
                      )}

                      <div className="space-y-3 text-left p-4 bg-black/5 dark:bg-white/5 rounded-2xl border">
                        <p className="text-[8px] font-black uppercase opacity-40 leading-none mb-1">
                          {(selectedShippingFlags.usesPickupPoint || selectedShippingFlags.usesMeetupLocation) ? 'Buyer Contact Details' : 'Receiver Details'}
                        </p>
                        <p className="text-xs font-bold text-blue-600 uppercase">{selectedOrder.buyerName}</p>
                        
                        {(!selectedShippingFlags.usesPickupPoint && !selectedShippingFlags.usesMeetupLocation) && (
                          <p className="text-xs font-bold opacity-70 leading-relaxed">
                            {selectedLogistics.display}
                            {selectedOrder.receiverDetails?.city && <span className="block">{selectedOrder.receiverDetails.city}, {selectedOrder.receiverDetails.province} {selectedOrder.receiverDetails.zipCode}</span>}
                          </p>
                        )}
                        
                        {selectedLogistics.phoneNumber && <p className="text-xs font-bold opacity-50">{selectedLogistics.phoneNumber}</p>}
                        {selectedLogistics.email && <p className="text-xs font-bold opacity-50 break-all">{selectedLogistics.email}</p>}
                        {selectedLogistics.schedule && (
                          <div className="pt-2 border-t border-black/5 dark:border-white/5">
                            <p className="text-[8px] font-black uppercase opacity-40 mb-1">
                              {selectedShippingFlags.usesMeetupLocation ? 'Preferred Meetup Time' : selectedShippingFlags.usesPickupPoint ? 'Preferred Pickup Schedule' : 'Preferred Schedule'}
                            </p>
                            <p className="text-xs font-bold opacity-70">{selectedLogistics.schedule}</p>
                          </div>
                        )}
                      </div>

                      {selectedShippingFlags.usesPickupPoint && (
                        <div className="space-y-2 text-left p-4 bg-black/5 dark:bg-white/5 rounded-2xl border animate-in slide-in-from-top duration-300">
                          <p className="text-[8px] font-black uppercase opacity-40">
                            Preferred Pickup Schedule
                          </p>
                          <div className="space-y-3">
                            <input
                              type="datetime-local"
                              className="w-full p-3 rounded-xl border bg-white dark:bg-white/5 text-xs font-black"
                              value={meetupScheduleInput}
                              onChange={(e) => setMeetupScheduleInput(e.target.value)}
                              disabled={isAdminMode || ['Completed', 'Cancelled'].includes(selectedOrder.status)}
                            />
                            {!isAdminMode && !['Completed', 'Cancelled'].includes(selectedOrder.status) && (
                              <button
                                onClick={handleSavePickupSchedule}
                                className="w-full py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 active:scale-95 transition-all"
                              >
                                Save Preferred Pickup Schedule
                              </button>
                            )}
                            <p className="text-[10px] font-bold opacity-60">
                              {meetupScheduleInput ? 'Preferred pickup schedule is saved with this order.' : 'No preferred pickup schedule set yet.'}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2 text-left p-4 bg-black/5 dark:bg-white/5 rounded-2xl border">
                        <p className="text-[8px] font-black uppercase opacity-40">
                          {selectedShippingFlags.usesMeetupLocation ? 'Meetup Time' : 'Tracking'}
                        </p>
                        {selectedShippingFlags.usesMeetupLocation ? (
                          <div className="space-y-3">
                            <input
                              type="datetime-local"
                              className="w-full p-3 rounded-xl border bg-white dark:bg-white/5 text-xs font-black"
                              value={meetupScheduleInput}
                              onChange={(e) => setMeetupScheduleInput(e.target.value)}
                              disabled={isAdminMode || ['Completed', 'Cancelled'].includes(selectedOrder.status)}
                            />
                            {!isAdminMode && !['Completed', 'Cancelled'].includes(selectedOrder.status) && (
                              <button
                                onClick={handleSaveMeetupSchedule}
                                className="w-full py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 active:scale-95 transition-all"
                              >
                                Save Preferred Meetup Time
                              </button>
                            )}
                            <p className="text-[10px] font-bold opacity-60">
                              {meetupScheduleInput ? 'Preferred meetup time is saved with this order.' : 'No preferred meetup time set yet.'}
                            </p>
                          </div>
                        ) : isAdminMode && selectedShippingFlags.needsTracking && selectedOrder.status !== 'Cancelled' ? (
                          <div className="space-y-3">
                            <input 
                              className="w-full p-3 rounded-xl border bg-white dark:bg-white/5 text-xs font-black uppercase"
                              value={trackingRef}
                              onChange={(e) => setTrackingRef(e.target.value.toUpperCase())}
                              placeholder={selectedShippingFlags.isLbc ? 'LBC TRACKING NO.' : 'TRACKING / BOOKING REF'}
                            />
                            <input 
                              type="number"
                              className="w-full p-3 rounded-xl border bg-white dark:bg-white/5 text-xs font-black"
                              value={shippingFeeInput}
                              onChange={(e) => setShippingFeeInput(e.target.value)}
                              placeholder="SHIPPING FEE"
                            />
                            {selectedShippingFlags.isLbc && (
                              <input 
                                className="w-full p-3 rounded-xl border bg-white dark:bg-white/5 text-xs font-black"
                                value={claimantBalance}
                                onChange={(e) => setClaimantBalance(e.target.value)}
                                placeholder="CLAIMANT BALANCE"
                              />
                            )}
                            <button 
                              onClick={handleSaveShippingDetails}
                              className="w-full py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 active:scale-95 transition-all"
                            >
                              Save Shipping & Mark In Transit
                            </button>
                          </div>
                        ) : (
                          <>
                            <p className="text-xs font-black uppercase">
                              {selectedOrder.trackingNo || (
                                selectedShippingFlags.isLalamoveSelf 
                                  ? (selectedOrder.customerTrackingLink ? 'Booked by Customer' : 'Pending Customer Booking')
                                  : selectedShippingFlags.needsTracking ? 'Pending' : 'Not Required'
                              )}
                            </p>
                            {selectedShippingFlags.needsAdminShipping && <p className="text-[10px] font-bold opacity-60">Shipping Fee: ₱{selectedTotals.shippingFee.toLocaleString()}</p>}
                            {selectedOrder.claimantBalance && <p className="text-[10px] font-bold opacity-60">Claimant Balance: ₱{Number(selectedOrder.claimantBalance || 0).toLocaleString()}</p>}
                          </>
                        )}

                        {/* Customer-provided Lalamove Tracking Link */}
                        {selectedOrder.customerTrackingLink && (
                          <div className="mt-2 pt-2 border-t border-black/5 dark:border-white/5">
                            <p className="text-[8px] font-black uppercase opacity-40">Lalamove Tracking URL</p>
                            <a 
                              href={selectedOrder.customerTrackingLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-black text-blue-600 hover:underline break-all block"
                            >
                              {selectedOrder.customerTrackingLink}
                            </a>
                          </div>
                        )}

                        {/* Customer Input for Lalamove Self-Booking Tracking */}
                        {!isAdminMode && selectedShippingFlags.isLalamoveSelf && selectedOrder.status === 'Ready for Pickup' && (
                          <div className="space-y-2 mt-2 pt-2 border-t border-black/5 dark:border-white/5">
                            <label className="text-[8px] font-black uppercase opacity-40">
                              {selectedOrder.customerTrackingLink ? 'Update Lalamove Tracking URL' : 'Input Lalamove Tracking URL'}
                            </label>
                            <input 
                              type="url"
                              className="w-full p-2.5 rounded-xl border bg-white dark:bg-white/5 text-xs font-semibold"
                              placeholder="https://web.lalamove.com/..."
                              value={customerTrackingLink}
                              onChange={(e) => setCustomerTrackingLink(e.target.value)}
                            />
                            <button 
                              onClick={handleSaveCustomerTrackingLink}
                              className="w-full py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 active:scale-95 transition-all shadow-md"
                            >
                              Save Tracking URL
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* COLUMN 2: ORDER DETAILS */}
                <div className="space-y-6">
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-3">Order Details</h4>
                    <div className="p-6 bg-black/[0.02] dark:bg-white/[0.02] rounded-[2rem] border border-black/5 dark:border-white/5 space-y-4">
                      {selectedOrder.items ? (
                        selectedOrder.items.map((item, idx) => {
                          const kit = kits.find(k => k.id === item.id);
                          const displayImage = item.type === 'project'
                            ? (item.projectData?.image || item.image)
                            : resolveImage(item.image || kit?.image, item.images || kit?.images);

                          return (
                            <div key={idx} className="space-y-3 bg-black/[0.01] dark:bg-white/[0.01] p-4 rounded-3xl border border-black/5 dark:border-white/5">
                              <div className="flex items-center gap-4">
                                {displayImage ? (
                                  <img src={displayImage} alt="" className="w-16 h-16 rounded-2xl object-cover bg-neutral-200 dark:bg-neutral-800 shrink-0" />
                                ) : (
                                  <div className="w-16 h-16 rounded-2xl bg-blue-600/10 flex items-center justify-center text-blue-600 shrink-0">
                                    <Package size={32} />
                                  </div>
                                )}
                                <div>
                                  <p className="text-[8px] font-black uppercase opacity-40 mb-1">Item {idx + 1}</p>
                                  <p className="text-sm font-black uppercase leading-tight">{item.name}</p>
                                  <p className="text-xs font-bold text-blue-600">₱{Number(item.price).toLocaleString()} <span className="opacity-40">x {item.quantity || 1}</span></p>
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
                                  <div className="mt-2 p-3 bg-purple-500/5 dark:bg-purple-500/10 rounded-2xl border border-purple-500/20 text-left space-y-2">
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
                                    <div className="flex justify-between text-[9px] font-bold opacity-40">
                                      <span>Complexity Hike ({currentLevel} x ₱{complexityPriceHike}):</span>
                                      <span>₱{(currentLevel * complexityPriceHike).toLocaleString()}</span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })
                      ) : (
                        (() => {
                          const fallbackKit = kits.find(k => k.id === selectedOrder.kitId || k.id === selectedOrder.productId || k.name === selectedOrder.item);
                          const displayImage = resolveImage(selectedOrder.image || fallbackKit?.image, selectedOrder.images || fallbackKit?.images);

                          return (
                            <div className="flex items-center gap-4">
                              {displayImage ? (
                                <img src={displayImage} alt="" className="w-16 h-16 rounded-2xl object-cover bg-neutral-200 dark:bg-neutral-800 shrink-0" />
                              ) : (
                                <div className="w-16 h-16 rounded-2xl bg-blue-600/10 flex items-center justify-center text-blue-600 shrink-0">
                                  <Package size={32} />
                                </div>
                              )}
                              <div>
                                <p className="text-[8px] font-black uppercase opacity-40 mb-1">Item Ordered</p>
                                <p className="text-sm font-black uppercase leading-tight">{selectedOrder.item}</p>
                                <p className="text-xs font-bold text-blue-600">₱{Number(selectedOrder.price).toLocaleString()}</p>
                              </div>
                            </div>
                          );
                        })()
                      )}
                      
                      <div className="pt-4 border-t border-black/5 dark:border-white/5 space-y-2">
                        <div className="flex justify-between text-[10px] font-black uppercase opacity-40"><span>Items Subtotal</span><span>₱{(selectedOrder.items ? selectedOrder.items.reduce((s, i) => s + Number(i.price), 0) : Number(selectedOrder.price)).toLocaleString()}</span></div>
                        {selectedShippingFlags.needsAdminShipping && <div className="flex justify-between text-[10px] font-black uppercase opacity-40"><span>Shipping</span><span>₱{selectedTotals.shippingFee.toLocaleString()}</span></div>}
                        {isAdminMode && selectedTotals.handlingFee > 0 && <div className="flex justify-between text-[10px] font-black uppercase opacity-40"><span>Handling</span><span>₱{selectedTotals.handlingFee.toLocaleString()}</span></div>}
                        
                        {/* Discount Breakdown (Admin view only) */}
                        {isAdminMode && selectedOrder.discountBreakdown?.handlingFee > 0 && (
                          <div className="flex justify-between text-[10px] font-black uppercase text-emerald-500">
                            <span>Handling Discount</span>
                            <span>-₱{selectedOrder.discountBreakdown.handlingFee.toLocaleString()}</span>
                          </div>
                        )}
                        {isAdminMode && selectedOrder.discountBreakdown?.installmentFee > 0 && (
                          <div className="flex justify-between text-[10px] font-black uppercase text-emerald-500">
                            <span>Garage Discount</span>
                            <span>-₱{selectedOrder.discountBreakdown.installmentFee.toLocaleString()}</span>
                          </div>
                        )}
                        {isAdminMode && selectedOrder.discountBreakdown?.transferFee > 0 && (
                          <div className="flex justify-between text-[10px] font-black uppercase text-emerald-500">
                            <span>GCash Preference Discount</span>
                            <span>-₱{selectedOrder.discountBreakdown.transferFee.toLocaleString()}</span>
                          </div>
                        )}
                        
                        {/* Fallback for legacy orders without breakdown (Admin view only) */}
                        {isAdminMode && !selectedOrder.discountBreakdown && selectedTotals.discount > 0 && (
                          <div className="flex justify-between text-[10px] font-black uppercase text-emerald-500">
                            <span>Total Discount</span>
                            <span>-₱{selectedTotals.discount.toLocaleString()}</span>
                          </div>
                        )}

                        {/* Discount for user view (sum of all discounts as 'Garage Discount') */}
                        {!isAdminMode && selectedTotals.discount > 0 && (
                          <div className="flex justify-between text-[10px] font-black uppercase text-emerald-500">
                            <span>Garage Discount</span>
                            <span>-₱{selectedTotals.discount.toLocaleString()}</span>
                          </div>
                        )}

                        {isAdminMode && selectedTotals.transferFee > 0 && <div className="flex justify-between text-[10px] font-black uppercase opacity-40 text-amber-500"><span>Transfer Fee</span><span>₱{selectedTotals.transferFee.toLocaleString()}</span></div>}
                        <div className="flex justify-between text-[10px] font-black uppercase opacity-40 text-emerald-500"><span>Paid</span><span>-₱{selectedTotals.paid.toLocaleString()}</span></div>
                        
                        {isAdminMode && (
                          <div className="pt-2 mt-2 border-t border-black/5 dark:border-white/5 bg-blue-500/5 p-3 rounded-xl">
                            <p className="text-[8px] font-black uppercase opacity-40 mb-1">Current System Rate Reference</p>
                            <div className="flex justify-between text-[9px] font-black">
                                <span className="opacity-60">Base Downpayment</span>
                                <span>₱{rates?.general?.downpayment?.toLocaleString() || '500'}</span>
                            </div>
                          </div>
                        )}

                        <div className="flex justify-between text-base font-black italic pt-2 border-t border-black/5 dark:border-white/5">
                          <span className="text-blue-600 uppercase">Balance</span>
                          <span className={selectedTotals.balance > 0 ? 'text-red-500' : 'text-emerald-500'}>₱{selectedTotals.balance.toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="w-full py-4 rounded-2xl text-[11px] font-black uppercase text-center tracking-[0.2em] shadow-inner bg-black/5 dark:bg-white/5">
                        Total Cost: ₱{selectedTotals.total.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Optional: Add custom components or additional order info here if needed */}
                  {/* </div> */}
                </div>

                {/* COLUMN 3: ORDER STATUS DASHBOARD */}
                <div className="space-y-6">
                  <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-3 text-left">Order Status Dashboard</h4>

                  <div className={`w-full py-4 rounded-2xl text-[11px] font-black uppercase text-center tracking-[0.2em] shadow-inner ${selectedOrder.status === 'Completed' ? 'bg-emerald-500 text-white' : selectedOrder.status === 'Cancelled' ? 'bg-red-500 text-white' : 'bg-blue-600 text-white'}`}>
                    {getDisplayStatus(selectedOrder)}
                  </div>

                  {isSecondPaymentPending && (
                    <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-3xl text-left space-y-2 animate-in fade-in duration-300">
                      <p className="text-[9px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">Print Downpayment Required</p>
                      <p className="text-xs font-bold leading-normal">
                        The 3D design has been finalized. Please settle the print downpayment of <strong>₱{printDp.toLocaleString()}</strong> to start printing.
                      </p>
                    </div>
                  )}

                {/* PAYMENT MEDIA SECTION */}
                <div className="space-y-3">
                  {selectedOrder.paymentMethod === 'Cash' ? (
                    <div className="p-6 bg-blue-500/5 rounded-3xl border border-blue-500/10 flex flex-col items-center text-center gap-3 w-full animate-in fade-in duration-300">
                      <Store className="text-blue-500 animate-pulse" size={32} />
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-600">Cash Payment</h4>
                      <p className="text-xs font-bold opacity-80 max-w-sm">
                        {isOrderFromMaintenance ? (
                          "This order was placed during maintenance mode and is invalid."
                        ) : (
                          "Your order is being prepared, we will notify you when it's ready for pickup."
                        )}
                      </p>
                    </div>
                  ) : (
                    <div className={`grid gap-4 ${showQrContainer ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {showQrContainer && (
                        <div className="p-4 bg-amber-500/5 rounded-3xl border border-amber-500/10 flex flex-col items-center gap-3">
                          <h4 className="text-[9px] font-black uppercase tracking-widest text-amber-600">
                            {isOrderFromMaintenance ? 'Invalid Order' : 'Payment QR'}
                          </h4>
                          <button
                            type="button"
                            className="w-24 h-24 bg-white p-2 border rounded-2xl hover:opacity-80 transition-opacity flex items-center justify-center"
                            onClick={() => {
                              setActivePreviewUrl(qrImageSrc);
                              setIsPreviewExpanded(true);
                            }}
                          >
                            <img src={qrImageSrc} className="object-contain" alt={isOrderFromMaintenance ? 'Brand Logo' : `${selectedOrder?.paymentMethod} QR`} />
                          </button>
                          <a 
                            href={qrImageSrc} 
                            download={isOrderFromMaintenance ? 'SG-Logo.png' : `${selectedOrder?.paymentMethod}-QR.png`}
                            className="w-full py-2 bg-amber-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest text-center transition-all hover:bg-amber-700 flex items-center justify-center gap-1"
                          >
                            <Download size={12} /> Download
                          </a>
                        </div>
                      )}

                      <div className="p-4 bg-blue-500/5 rounded-3xl border border-blue-500/10 flex flex-col items-center gap-3">
                        <h4 className="text-[9px] font-black uppercase tracking-widest text-blue-600">Receipt</h4>
                        {selectedOrder.receipt || previewUrl ? (
                          <button
                            type="button"
                            className="w-24 h-24 rounded-2xl overflow-hidden bg-white border-2 border-blue-600 relative group"
                            onClick={() => {
                              setActivePreviewUrl(previewUrl || selectedOrder.receipt);
                              setIsPreviewExpanded(true);
                              setHasPreviewedReceipt(true);
                            }}
                          >
                            <img src={previewUrl || selectedOrder.receipt} className="w-full h-full object-cover" alt="Receipt" />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Eye size={16} className="text-white" />
                            </div>
                          </button>
                        ) : (
                          <div className="w-24 h-24 border-2 border-dashed border-blue-600/30 rounded-2xl flex flex-col items-center justify-center gap-1 opacity-50">
                            <Upload size={16} />
                            <span className="text-[8px] font-black uppercase">No Receipt</span>
                          </div>
                        )}

                        {!isAdminMode && !selectedOrder.receipt && ['Reserved', 'Waiting', 'Arrived', 'Validating'].includes(selectedOrder.status) && (
                          <label className="w-full cursor-pointer">
                            <input type="file" className="hidden" accept="image/*" onChange={handleFileSelect} disabled={isUploading} />
                            <div className="w-full py-2 bg-blue-600/10 text-blue-600 rounded-xl text-[9px] font-black uppercase tracking-widest text-center">
                              {isSecondPaymentPending ? 'Upload Print Downpayment Receipt' : selectedOrder.receipt ? 'Upload New Receipt' : 'Upload Receipt'}
                            </div>
                          </label>
                        )}
                      </div>
                    </div>
                  )}

                  {previewUrl && !isAdminMode && (
                    <div className="flex justify-center animate-in fade-in duration-300">
                      <button 
                        onClick={() => handleConfirmReceipt(selectedOrder)} 
                        disabled={isUploading}
                        className="w-full max-w-[220px] py-3 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                      >
                        {isUploading ? 'Submitting...' : 'Submit Receipt'}
                      </button>
                    </div>
                  )}

                  {isAdminMode && selectedOrder.paymentMethod === 'Cash' && selectedOrder.status === 'Reserved' && (
                    <div className="space-y-2 animate-in fade-in duration-300">
                      <button 
                        onClick={() => handleConfirmPayment(selectedOrder)} 
                        className="w-full py-4 bg-emerald-600 text-white rounded-[1.5rem] text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 size={18} /> Confirm Cash Payment
                      </button>
                    </div>
                  )}

                  {isAdminMode && selectedOrder.paymentMethod !== 'Cash' && selectedOrder.receipt && selectedOrder.status === 'Validating' && (
                    <div className="space-y-2">
                      <button 
                        onClick={() => handleConfirmPayment(selectedOrder)} 
                        disabled={!hasPreviewedReceipt}
                        className={`w-full py-4 bg-emerald-600 text-white rounded-[1.5rem] text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 ${!hasPreviewedReceipt ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                      >
                        <CheckCircle2 size={18} /> Validate Receipt
                      </button>
                      {!hasPreviewedReceipt && (
                        <p className="text-[8px] font-black text-amber-600 uppercase text-center animate-pulse">Preview receipt first to validate</p>
                      )}
                    </div>
                  )}

                  {isAdminMode && (selectedShippingFlags.usesPickupPoint || selectedShippingFlags.usesMeetupLocation) && ['Preparing', 'To Ship'].includes(selectedOrder.status) && (
                    <button 
                      onClick={handleMarkReadyForPickup}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-blue-600/20"
                    >
                      {selectedShippingFlags.usesMeetupLocation ? 'Mark Ready for Meetup' : 'Mark Ready for Pickup'}
                    </button>
                  )}

                  {isAdminMode && selectedShippingFlags.isPickupPointCourier && selectedOrder.status === 'Ready for Pickup' && (
                    <button 
                      onClick={handleMarkDispatched}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-blue-600/20"
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
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-emerald-600/20"
                    >
                      Mark Completed
                    </button>
                  )}
                </div>

                  {isAdminMode && hasStlWithDesignService && selectedOrder.status === 'Preparing' && !selectedOrder.designFinalized && (
                    <button 
                      onClick={async () => {
                        if (window.confirm("Mark design as finalized and request print downpayment? This will set status to 'Waiting' and request the customer for the second downpayment.")) {
                          try {
                            const patch = { designFinalized: true, receipt: null, status: 'Waiting' };
                            await updateOrderDetails(selectedOrder.id, patch);
                            setSelectedOrder(prev => ({ ...prev, ...patch }));
                            alert("Design marked as finalized! Print downpayment requested.");
                          } catch (err) {
                            console.error("SG LOG: Failed to finalize design:", err);
                            alert("Failed to finalize design.");
                          }
                        }
                      }}
                      className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-purple-600/20 mb-3"
                    >
                      Finalize Design & Request Print Dp
                    </button>
                  )}

                  {isAdminMode && selectedOrder.isPreOrder && selectedOrder.status === 'Reserved' && (
                    <button 
                      onClick={() => handleRequestBalance(selectedOrder.id)}
                      className="w-full py-3 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
                    >
                      Request Balance
                    </button>
                  )}



                  {!isAdminMode && ['Shipped', 'Dispatched', 'In Transit', 'Ready for Pickup', 'Ready for Meetup'].includes(selectedOrder.status) && (
                    <button 
                      onClick={handleMarkCompleted}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-emerald-600/20 mb-3"
                    >
                      Confirm Order Received
                    </button>
                  )}

                  {(canAdminCancel || canCustomerCancel) && (
                    <button 
                      onClick={() => handleCancelOrder(selectedOrder.id)}
                      className="w-full py-3 bg-red-500/10 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest"
                    >
                      Cancel Order
                    </button>
                  )}

                  {isAdminMode && selectedOrder.status === 'Cancelled' && (
                    <button 
                      onClick={() => { deleteOrder(selectedOrder.id); setSelectedOrder(null); }}
                      className="w-full py-3 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
                    >
                      Delete Order
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {isPreviewExpanded && activePreviewUrl && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/95 animate-in fade-in duration-300" onClick={() => { setIsPreviewExpanded(false); setActivePreviewUrl(null); }}>
            <button className="absolute top-8 right-8 text-white/50 hover:text-white"><X size={40} /></button>
            <img src={activePreviewUrl} className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" />
          </div>
        )}

        {showManualOrderModal && (
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
