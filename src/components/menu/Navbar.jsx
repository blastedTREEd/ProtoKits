import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Sun, Moon, ShoppingBasket, Home, X, ShelvingUnit,
  CircleUserRound, Settings, LogOut, ContactRound,
  Shield, ShieldCheck, Box, Printer, ClipboardList, UserPlus, PackageOpen, Truck, Bell, CreditCard
} from 'lucide-react';
import { FcGoogle } from 'react-icons/fc';
import { FaFacebook } from 'react-icons/fa';

import { useTheme } from '../../context/ThemeContext';
import { useStore } from '../../store/useStore';
import { signOut, signInWithPopup } from 'firebase/auth'; 
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { auth, fbProvider, googleProvider, db } from '../../firebase/firebase';
import AccountSettingsModal from './AccountSettingsModal';
import FulfillmentModal from './FulfillmentModal';
import PaymentSettingsModal from './PaymentSettingsModal';
import LoginPromptModal from './LoginPromptModal';
import WelcomeModal from './WelcomeModal';
import NotificationModal from './NotificationModal';
import {
  buildCommerceNotifications,
  getAvailableStockEntries,
  isActiveHunt
} from './commerceNotificationUtils';
import { getNotificationVersion } from './notificationUtils';
import StoriesManagerModal from './StoriesManagerModal';

const notificationStateStorageKey = (stateType, userId) => `snorlaxgarage:notification-${stateType}:${userId}`;
const clearBrowserNotificationCounter = () => {
  document.title = document.title.replace(/^\(\d+\)\s*/, '');
};

const loadNotificationVersions = (stateType, userId) => {
  if (!userId) return {};

  try {
    const storedValue = window.localStorage.getItem(notificationStateStorageKey(stateType, userId));
    const parsedValue = storedValue ? JSON.parse(storedValue) : {};
    return parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue) ? parsedValue : {};
  } catch (error) {
    console.warn(`SG LOG: Unable to load notification ${stateType} state:`, error);
    return {};
  }
};

const saveNotificationVersions = (stateType, userId, versions) => {
  if (!userId) return;

  try {
    window.localStorage.setItem(notificationStateStorageKey(stateType, userId), JSON.stringify(versions));
  } catch (error) {
    console.warn(`SG LOG: Unable to save notification ${stateType} state:`, error);
  }
};

export default function Navbar({ isCompact: scrolledCompact }) {
  const { isDarkMode, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const { 
    garageInfo, 
    basket, 
    shelf,
    kits,
    deals,
    orders,
    shippingSettings,
    user, 
    isProfileIncomplete,
    isBanned, 
    isAdmin,
    isAdminView,
    setAdminView,
    originalAdminUser, 
    stopImpersonating,
    isLoginModalOpen,
    setLoginModalOpen,
    guestBasket,
    findMisalignedStocks,
    fixMisalignedStocks,
    findKitScaleMigrations,
    migrateKitScaleToSpecs,
    findKitIdMismatches,
    fixKitIdMismatches,
    loadOrdersOnce,
  } = useStore();

  const activeBasket = user ? ((isAdmin && isAdminView) ? shelf : basket) : guestBasket;
  const notificationBasket = user ? basket : guestBasket;
  const isAdminNotificationView = Boolean(isAdmin && isAdminView);
  const notificationOwnerKey = user?.uid
    ? `${user.uid}${isAdminNotificationView ? ':admin' : ''}`
    : 'guest';
  const usesOrdersPageSubscription = location.pathname === '/orders' && !isAdminNotificationView;

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [notificationOrders, setNotificationOrders] = useState([]);
  const [notificationHunts, setNotificationHunts] = useState([]);
  const [notificationReadVersions, setNotificationReadVersions] = useState({});
  const [notificationSeenVersions, setNotificationSeenVersions] = useState({});
  const [outOfStockKitIds, setOutOfStockKitIds] = useState({});
  const [notificationNow, setNotificationNow] = useState(Date.now());
  const [notificationAnchorTop, setNotificationAnchorTop] = useState(null);
  const [isPickupPointOpen, setIsPickupPointOpen] = useState(false);
  const [isPaymentSettingsOpen, setIsPaymentSettingsOpen] = useState(false);
  const [isLoginPromptOpen, setIsLoginPromptOpen] = useState(false);
  const [isStoriesManagerOpen, setIsStoriesManagerOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isPhotoHovered, setIsPhotoHovered] = useState(false);
  const [isCheckingInventory, setIsCheckingInventory] = useState(false);
  const [showFacebook, setShowFacebook] = useState(false);
  const holdTimerRef = useRef(null);
  const timeoutTimerRef = useRef(null);


  const [authError, setAuthError] = useState(null);
  const [showBottomNav, setShowBottomNav] = useState(true);
  const [forceHide, setForceHide] = useState(false); 
  const [lastScrollY, setLastScrollY] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [profileImgError, setProfileImgError] = useState(false);

  const profileModalRef = useRef(null);
  const profileBtnRef = useRef(null);
  const navbarRef = useRef(null);

  const isMobile = windowWidth < 640;
  const isDesktop = windowWidth >= 1024;
  const isLandscape = typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : false;
  const isProfileFullscreen = isMobile || (windowWidth >= 640 && windowWidth < 1024 && isLandscape);
  const profilePhotoURL = user?.photoURL || auth.currentUser?.photoURL || '';
  const adminRingClass = 'bg-gradient-to-br from-amber-300 via-yellow-400 to-orange-500 shadow-lg shadow-yellow-500/25';
  const customerRingClass = 'bg-gradient-to-br from-[#0866FF] to-[#00CFFF]';
  const commerceNotifications = useMemo(() => (
    buildCommerceNotifications({
      kits,
      deals,
      basket: notificationBasket,
      hunts: user?.uid && !isAdminNotificationView ? notificationHunts : [],
      outOfStockKitIds,
      now: notificationNow
    })
  ), [deals, isAdminNotificationView, kits, notificationBasket, notificationHunts, notificationNow, outOfStockKitIds, user?.uid]);
  const effectiveNotificationOrders = usesOrdersPageSubscription ? orders : notificationOrders;
  const adminReceiptNotifications = useMemo(() => (
    effectiveNotificationOrders
      .filter((order) => (
        String(order?.status || '').trim().toLowerCase() === 'validating'
        && Boolean(order?.receipt || order?.balanceReceipt)
      ))
      .map((order) => ({
        ...order,
        notificationKind: 'admin_receipt',
        notificationLabel: 'Validate',
        message: `A receipt from ${order.buyerName || 'a customer'} needs validation.`
      }))
  ), [effectiveNotificationOrders]);
  const adminOfferNotifications = useMemo(() => {
    const collectionKitIds = new Set(
      (kits || [])
        .filter((kit) => Object.values(kit?.stocks || {}).some((stock) => (
          stock?.isReserved
          && stock?.reservationType === 'admin'
          && !stock?.order?.orderId
        )))
        .map((kit) => kit.id)
    );

    return (notificationHunts || [])
      .filter((offer) => isActiveHunt(offer, notificationNow) && collectionKitIds.has(offer?.kitId))
      .map((offer) => ({
        ...offer,
        id: `admin-offer:${offer.id}`,
        sourceId: offer.id,
        notificationKind: 'admin_offer',
        notificationLabel: 'Offer',
        notificationVersion: `admin-offer:${offer.id}:${Number(offer.targetPrice || 0)}:${offer.updatedAt?.seconds || offer.updatedAt || offer.createdAt?.seconds || offer.createdAt || ''}`,
        title: `Offer from ${offer.userName || 'customer'}`,
        message: `${offer.userName || 'A customer'} offered ₱${Number(offer.targetPrice || 0).toLocaleString('en-PH')} for ${offer.kitName || 'a collection item'}.`,
        summary: offer.kitName || '',
        lastUpdated: offer.updatedAt || offer.createdAt
      }));
  }, [kits, notificationHunts, notificationNow]);
  const allNotifications = useMemo(() => (
    isAdminNotificationView
      ? [...adminReceiptNotifications, ...adminOfferNotifications]
      : [...effectiveNotificationOrders, ...commerceNotifications]
  ), [adminOfferNotifications, adminReceiptNotifications, commerceNotifications, effectiveNotificationOrders, isAdminNotificationView]);
  const unseenNotificationCount = allNotifications.reduce((count, notification) => (
    notificationSeenVersions[notification.id] === getNotificationVersion(notification) ? count : count + 1
  ), 0);

  useEffect(() => {
    setNotificationReadVersions(loadNotificationVersions('reads', notificationOwnerKey));
    setNotificationSeenVersions(loadNotificationVersions('seen', notificationOwnerKey));
    setOutOfStockKitIds(loadNotificationVersions('out-of-stock', notificationOwnerKey));
  }, [notificationOwnerKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setNotificationNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const kitMap = new Map((kits || []).map((kit) => [kit.id, kit]));
    const basketKitIds = [...new Set((notificationBasket || []).map((item) => item?.id).filter(Boolean))];
    const activeHuntKitIds = (user?.uid && !isAdminNotificationView ? notificationHunts : [])
      .filter((hunt) => isActiveHunt(hunt, notificationNow))
      .map((hunt) => hunt?.kitId)
      .filter(Boolean);

    setOutOfStockKitIds((currentKitIds) => {
      const nextKitIds = { ...currentKitIds };
      let hasChanges = false;

      activeHuntKitIds.forEach((kitId) => {
        if (nextKitIds[kitId]) return;
        nextKitIds[kitId] = true;
        hasChanges = true;
      });

      basketKitIds.forEach((kitId) => {
        const kit = kitMap.get(kitId);
        if (!kit || getAvailableStockEntries(kit).length > 0 || nextKitIds[kitId]) return;
        nextKitIds[kitId] = true;
        hasChanges = true;
      });

      if (!hasChanges) return currentKitIds;
      saveNotificationVersions('out-of-stock', notificationOwnerKey, nextKitIds);
      return nextKitIds;
    });
  }, [isAdminNotificationView, kits, notificationBasket, notificationHunts, notificationNow, notificationOwnerKey, user?.uid]);

  useEffect(() => {
    const titleWithoutCounter = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = !isNotificationModalOpen && unseenNotificationCount > 0
      ? `(${unseenNotificationCount}) ${titleWithoutCounter}`
      : titleWithoutCounter;

    return () => {
      clearBrowserNotificationCounter();
    };
  }, [unseenNotificationCount, isNotificationModalOpen]);

  useEffect(() => {
    if (!isProfileOpen) {
      setShowFacebook(false); // Reset to Google
      setAuthError(null);
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      return;
    }

    // Close on tap/click outside modal and profile button
    const handleOutsideClick = (e) => {
      if (
        profileModalRef.current && !profileModalRef.current.contains(e.target) &&
        profileBtnRef.current && !profileBtnRef.current.contains(e.target)
      ) {
        setIsProfileOpen(false);
      }
    };

    const handleScroll = () => {
      if (isProfileFullscreen) return;
      setIsProfileOpen(false);
    };
    const handleCloseProfile = () => {
      if (isProfileFullscreen) return;
      setIsProfileOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('closeProfileDropdown', handleCloseProfile);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('closeProfileDropdown', handleCloseProfile);
    };
  }, [isProfileOpen, isProfileFullscreen]);

  useEffect(() => {
    setProfileImgError(false);
  }, [profilePhotoURL]);

  useEffect(() => {
    if (!isProfileOpen || !isProfileFullscreen) {
      window.dispatchEvent(new Event('profileFullscreenClose'));
      return undefined;
    }

    const scrollY = window.scrollY;
    const previousBodyStyle = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
      overscrollBehavior: document.body.style.overscrollBehavior
    };

    window.dispatchEvent(new Event('profileFullscreenOpen'));
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
      window.dispatchEvent(new Event('profileFullscreenClose'));
    };
  }, [isProfileOpen, isProfileFullscreen]);

useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    const handleForceHide = () => { setForceHide(true); setShowBottomNav(false); };
    const handleForceShow = () => { setForceHide(false); setShowBottomNav(true); };
    const handleOpenLoginPrompt = () => setIsLoginPromptOpen(true);
    const handleOpenStoriesManager = () => {
      setIsStoriesManagerOpen(true);
      setIsProfileOpen(false);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('hideNavbar', handleForceHide);
    window.addEventListener('showNavbar', handleForceShow);
    window.addEventListener('openLoginPrompt', handleOpenLoginPrompt);
    window.addEventListener('openStoriesManager', handleOpenStoriesManager);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('hideNavbar', handleForceHide);
      window.removeEventListener('showNavbar', handleForceShow);
      window.removeEventListener('openLoginPrompt', handleOpenLoginPrompt);
      window.removeEventListener('openStoriesManager', handleOpenStoriesManager);
    };
  }, []);
useEffect(() => {
  let ticking = false;

  const handleScroll = () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        if (forceHide) {
          setShowBottomNav(false);
        } else {
          const currentScrollY = window.scrollY;
          // Hide if scrolling down more than 50px, show if scrolling up
          if (currentScrollY > lastScrollY && currentScrollY > 50) {
            setShowBottomNav(false);
          } else {
            setShowBottomNav(true);
          }
          setLastScrollY(currentScrollY);
        }
        ticking = false;
      });
      ticking = true;
    }
  };

  window.addEventListener('scroll', handleScroll);
  return () => window.removeEventListener('scroll', handleScroll);
}, [lastScrollY, forceHide, location.pathname]);

  const isCompactMode = location.pathname !== "/" || scrolledCompact || lastScrollY > 40 || isStoriesManagerOpen || isNotificationModalOpen || isMobile;

  useEffect(() => {
    if (!user?.uid) {
      setNotificationOrders([]);
      setNotificationHunts([]);
      return undefined;
    }

    if (usesOrdersPageSubscription) {
      setNotificationOrders([]);
      return undefined;
    }

    setNotificationOrders([]);
    const notificationQuery = isAdminNotificationView
      ? query(collection(db, 'orders'), where('status', '==', 'Validating'))
      : query(collection(db, 'orders'), where('userId', '==', user.uid));
    return onSnapshot(notificationQuery, (snapshot) => {
      setNotificationOrders(snapshot.docs.map((orderDoc) => ({ id: orderDoc.id, ...orderDoc.data() })));
    }, (error) => {
      console.error('SG LOG: Notification subscription error:', error);
    });
  }, [isAdminNotificationView, user?.uid, usesOrdersPageSubscription]);

  useEffect(() => {
    if (!user?.uid) return undefined;

    const huntQuery = isAdminNotificationView
      ? query(collection(db, 'hunts'), where('status', 'in', ['pending', 'hunting']))
      : query(collection(db, 'hunts'), where('uid', '==', user.uid));
    return onSnapshot(huntQuery, (snapshot) => {
      setNotificationHunts(snapshot.docs.map((huntDoc) => ({ id: huntDoc.id, ...huntDoc.data() })));
    }, (error) => {
      console.error('SG LOG: Hunt notification subscription error:', error);
    });
  }, [isAdminNotificationView, user?.uid]);

  const handleNavClick = (path) => {
    if (location.pathname === path) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate(path);
    }
  };

  const handleOpenNotificationOrder = (notification) => {
    if (!notification?.id) return;

    setNotificationReadVersions((currentReadVersions) => {
      const nextReadVersions = {
        ...currentReadVersions,
        [notification.id]: getNotificationVersion(notification)
      };
      saveNotificationVersions('reads', notificationOwnerKey, nextReadVersions);
      return nextReadVersions;
    });
    setIsNotificationModalOpen(false);
    if (notification.notificationKind === 'admin_offer') {
      navigate('/notify-list');
      return;
    }
    if (notification.notificationKind === 'admin_receipt') {
      navigate('/orders', { state: { openOrderId: notification.id } });
      return;
    }
    if (notification.notificationKind && notification.kitId) {
      navigate(`/kits/${encodeURIComponent(notification.kitId)}`);
      return;
    }
    navigate('/orders', { state: { openOrderId: notification.id } });
  };

  const openAfterLandingNavbarCompacts = (openPanel) => {
    const needsCompactScroll = location.pathname === '/' && !isDesktop && window.scrollY <= 40;
    if (!needsCompactScroll) {
      openPanel();
      return;
    }

    window.scrollTo({ top: 48, left: 0, behavior: 'auto' });
    window.requestAnimationFrame(openPanel);
  };

  const handleOpenNotifications = () => {
    if (isNotificationModalOpen) {
      setIsNotificationModalOpen(false);
      return;
    }

    setIsProfileOpen(false);
    setNotificationSeenVersions((currentSeenVersions) => {
      const nextSeenVersions = { ...currentSeenVersions };
      allNotifications.forEach((notification) => {
        nextSeenVersions[notification.id] = getNotificationVersion(notification);
      });
      saveNotificationVersions('seen', notificationOwnerKey, nextSeenVersions);
      return nextSeenVersions;
    });
    clearBrowserNotificationCounter();
    openAfterLandingNavbarCompacts(() => {
      setNotificationAnchorTop(navbarRef.current?.getBoundingClientRect().bottom ?? null);
      setIsNotificationModalOpen(true);
    });
  };

  const handleToggleProfile = () => {
    if (isProfileOpen) {
      setIsProfileOpen(false);
      return;
    }

    setIsNotificationModalOpen(false);
    openAfterLandingNavbarCompacts(() => setIsProfileOpen(true));
  };

  useEffect(() => {
    if (!isNotificationModalOpen) return undefined;

    const updateNotificationAnchor = () => {
      setNotificationAnchorTop(navbarRef.current?.getBoundingClientRect().bottom ?? null);
    };

    window.addEventListener('resize', updateNotificationAnchor);
    return () => window.removeEventListener('resize', updateNotificationAnchor);
  }, [isNotificationModalOpen]);

  const handleLogin = async () => {
    const authAttemptId = useStore.getState().beginAuthAttempt(() => handleLogin());
    try {
      setAuthError(null);
      await signInWithPopup(auth, fbProvider);
      if (!useStore.getState().isAuthAttemptActive(authAttemptId)) return;
      useStore.getState().setAuthAttemptStatus(authAttemptId, 'Syncing Profile');
      setIsProfileOpen(false);
    } catch (err) {
      console.error(err);
      setAuthError('Authentication failed');
      useStore.getState().failAuthAttempt(authAttemptId, err);
    }
  };

  const handleGoogleLogin = async () => {
    const authAttemptId = useStore.getState().beginAuthAttempt(() => handleGoogleLogin());
    try {
      setAuthError(null);
      const result = await signInWithPopup(auth, googleProvider);
      if (!useStore.getState().isAuthAttemptActive(authAttemptId)) return;
      useStore.getState().setAuthAttemptStatus(authAttemptId, 'Syncing Profile');
      
      // Store user details in Firestore
      const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
      await setDoc(doc(db, 'users', result.user.uid), {
        email: result.user.email,
        displayName: result.user.displayName,
        photoURL: result.user.photoURL || '',
        lastLogin: serverTimestamp(),
        role: 'customer' // Set default role if not existing
      }, { merge: true });

      setIsProfileOpen(false);
    } catch (err) {
      console.error(err);
      setAuthError('Authentication failed');
      useStore.getState().failAuthAttempt(authAttemptId, err);
    }
  };


const handleLogout = async () => {
  if (originalAdminUser) {
    stopImpersonating();
  } else {
    await signOut(auth);
    navigate('/');
  }
  setIsProfileOpen(false);
};

const handleInventoryAudit = async () => {
  if (isCheckingInventory) return;

  try {
    setIsCheckingInventory(true);
    
    // 1. Fetch FULL inventory for a thorough check
    const snap = await getDocs(collection(db, "kits"));
    const allKits = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!orders?.length) await loadOrdersOnce();
    const latestOrders = useStore.getState().orders || orders || [];
    
    // 2. Detect issues
    const issues = findMisalignedStocks(allKits, latestOrders);
    const scaleMigrations = findKitScaleMigrations(allKits);
    const idMismatches = findKitIdMismatches(allKits);

    if (!issues.length && !scaleMigrations.length && !idMismatches.length) {
      alert('Inventory check complete. Lahat ay sumusunod sa format at walang stale data.');
      return;
    }

    const issueList = issues.length ? issues.map((issue, index) => {
      const kit = allKits.find(k => k.id === issue.kitId);
      const stock = kit?.stocks?.[issue.stockKey] || {};
      const kitName = kit?.name || issue.kitId;
      const status = stock.status ? ` | ${stock.status}` : '';
      const orderStatus = issue.orderStatus ? ` (${issue.orderStatus})` : '';
      return `${index + 1}. ${kitName}\n   Stock: ${issue.stockKey}${status}\n   Order: ${issue.orderId}${orderStatus}`;
    }).join('\n\n') : 'None';

    const scaleMigrationList = scaleMigrations.length ? scaleMigrations.map((migration, index) => {
      return `${index + 1}. ${migration.kitName}\n   Line: ${migration.specs.line || '(empty)'}\n   Scale: ${migration.specs.scale || '(empty)'}`;
    }).join('\n\n') : 'None';

    const idMismatchList = idMismatches.length ? idMismatches.map((m, index) => {
      return `${index + 1}. ${m.kitName}\n   Old: ${m.oldId}\n   New: ${m.newId}`;
    }).join('\n\n') : 'None';

    const shouldProceed = window.confirm(
      `Inventory check found:\n\n` +
      `Stale stock records (${issues.length}):\n${issueList}\n\n` +
      `Scale-to-specs migrations (${scaleMigrations.length}):\n${scaleMigrationList}\n\n` +
      `ID Format Mismatches (${idMismatches.length}):\n${idMismatchList}\n\n` +
      `OK/Proceed = Clean stale data, migrate scales, and FIX all ID formats.`
    );

    if (!shouldProceed) return;

    if (issues.length) await fixMisalignedStocks(issues);
    if (scaleMigrations.length) await migrateKitScaleToSpecs(scaleMigrations);
    if (idMismatches.length) await fixKitIdMismatches(idMismatches);

    alert(`Done. Fixed ${issues.length} stocks, ${scaleMigrations.length} scales, and ${idMismatches.length} kit IDs.`);
    setIsProfileOpen(false);
  } catch (err) {
    console.error('Inventory audit failed:', err);
    alert('Failed to check/fix inventory. Check console for details.');
  } finally {
    setIsCheckingInventory(false);
  }
};

useEffect(() => {
  // console.log("Admin View State in Navbar:", isAdminView);
}, [isAdminView]);

const navLinks = [
  { to: "/kits", icon: <Box />, label: "KITS" },
  { to: "/prints", icon: <Printer />, label: "PRINTS" },
  ...(user ? [{ to: "/orders", icon: <ClipboardList />, label: "ORDERS" }] : [])
];
const maintenanceMode = shippingSettings?.paymentSettings?.maintenanceMode === true;
const maintenanceInvalidTypes = shippingSettings?.paymentSettings?.maintenanceInvalidTypes || {};
const isMaintenanceInvalidPath = (path) => {
  if (!maintenanceMode) return false;
  if (path === '/kits') return maintenanceInvalidTypes.kit !== false;
  if (path === '/prints') return maintenanceInvalidTypes.prints !== false;
  return false;
};

const specs = {
  h: isMobile ? "56px" : "60px",
  logoSize: isMobile ? "42px" : (isCompactMode ? "50px" : "110px"),
  ringPadding: isMobile ? "2px" : (isCompactMode ? "2px" : "4px"),
  brandSize: isMobile ? "15px" : (isCompactMode ? "18px" : "22px"),
  contentML: isCompactMode ? (isMobile ? "ml-2" : "ml-[58px]") : (isMobile ? "ml-2" : "ml-[118px]"),
  utilIcon: isDesktop ? (isCompactMode ? 22 : 26) : 24,
};

const displayImg = (!garageInfo?.fbPageId || imgError) ? (garageInfo?.logoURL || '') : `https://graph.facebook.com/${garageInfo.fbPageId}/picture?type=large`;
const isFallbackLogo = !garageInfo?.fbPageId || imgError;

const getPageTitle = () => {
  if (!isMobile) return { line1: 'SNORLAX', line2: 'GARAGE' };
  
  switch (location.pathname) {
    case '/kits': return { line1: 'GARAGE', line2: 'KITS' };
    case '/prints': return { line1: 'PRINTS', line2: 'HUB' };
    case '/orders': return { line1: 'MY', line2: 'ORDERS' };
    case '/basket': return isAdminView ? { line1: 'ADMIN', line2: 'SHELF' } : { line1: 'YOUR', line2: 'BASKET' };
    case '/notify-list': return { line1: 'MY', line2: 'OFFERS' };
    default: return { line1: 'SNORLAX', line2: 'GARAGE' };
  }
};

const pageTitle = getPageTitle();
const isCurrentPageMaintenanceInvalid = isMaintenanceInvalidPath(location.pathname);
const profilePanelStyle = isProfileFullscreen
  ? {
      top: specs.h,
      right: 0,
      bottom: 0,
      left: 0,
      height: `calc(100dvh - ${specs.h})`,
      zIndex: 1000
    }
  : {
      top: `calc(${specs.h} + 8px)`,
      right: '2.5rem',
      zIndex: 1000
    };

return (
  <>
    {/* Gradient definition for icons */}
    <svg width="0" height="0" className="absolute">
      <defs>
        <linearGradient id="garage-blue-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0866FF" />
          <stop offset="100%" stopColor="#00CFFF" />
        </linearGradient>
        <linearGradient id="garage-red-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF304F" />
          <stop offset="100%" stopColor="#FF7A1A" />
        </linearGradient>
      </defs>
    </svg>

    <nav ref={navbarRef} style={{ height: specs.h }} className={`sticky top-0 z-[110] w-full transition-all duration-500 border-b ${location.pathname === '/checkout' ? 'hidden lg:block' : ''} ${isDarkMode ? 'bg-[#0a0a0a]/80 border-white/10' : 'bg-white/80 border-black/10'} backdrop-blur-md`}>
      <div className="h-full mx-auto flex items-center px-4 lg:px-10 relative max-w-[1440px]">
        {isMobile ? (
          <div className="flex items-center h-full z-[120] shrink-0 relative">
            <div 
              style={{ width: specs.logoSize, height: specs.logoSize, padding: specs.ringPadding }} 
              className="relative rounded-full flex items-center justify-center bg-gradient-to-br from-[#0866FF] to-[#00CFFF] shadow-xl transition-all duration-500"
            >
              <div className={`w-full h-full rounded-full overflow-hidden flex items-center justify-center border-[2px] ${isDarkMode ? 'border-neutral-900' : 'border-white'} bg-white dark:bg-neutral-800`}>
                {displayImg ? (
                  <img
                    src={displayImg}
                    alt="Logo"
                    onError={() => setImgError(true)}
                    className={`w-full h-full object-cover transition-all duration-500 ${isFallbackLogo ? 'grayscale-[100%] opacity-70' : ''}`}
                  />
                ) : (
                  <span className="text-[10px] font-black tracking-tighter text-neutral-400 dark:text-neutral-500">
                    SG
                  </span>
                )}
              </div>
            </div>
            <div className={`transition-all duration-500 z-[140] ${specs.contentML}`}>
              <h1 className="flex flex-col uppercase font-black tracking-tighter leading-[0.85] select-none">
                <span style={{ fontSize: specs.brandSize }} className="text-neutral-900 dark:text-white">{pageTitle.line1}</span>
                <span
                  style={{ fontSize: specs.brandSize }}
                  className={isCurrentPageMaintenanceInvalid ? 'bg-gradient-to-br from-[#FF304F] to-[#FF7A1A] bg-clip-text text-transparent' : 'text-garage-blue'}
                >
                  {pageTitle.line2}
                </span>
              </h1>
            </div>
          </div>
        ) : (
          <Link to="/" onClick={(e) => handleNavClick('/', e)} className="flex items-center h-full z-[120] shrink-0 relative">
            <div 
              style={{ width: specs.logoSize, height: specs.logoSize, top: '50%', transform: 'translateY(-50%)', padding: specs.ringPadding }} 
              className="absolute rounded-full flex items-center justify-center bg-gradient-to-br from-[#0866FF] to-[#00CFFF] shadow-xl transition-all duration-500"
            >
              <div className={`w-full h-full rounded-full overflow-hidden flex items-center justify-center border-[2px] ${isDarkMode ? 'border-neutral-900' : 'border-white'} bg-white dark:bg-neutral-800`}>
                {displayImg ? (
                  <img
                    src={displayImg}
                    alt="Logo"
                    onError={() => setImgError(true)}
                    className={`w-full h-full object-cover transition-all duration-500 ${isFallbackLogo ? 'grayscale-[100%] opacity-70' : ''}`}
                  />
                ) : (
                  <span className="text-sm font-black tracking-tighter text-neutral-400 dark:text-neutral-500">
                    SG
                  </span>
                )}
              </div>
            </div>
            <div className={`transition-all duration-500 z-[140] ${specs.contentML}`}>
              <div className="flex flex-col uppercase font-black tracking-tighter leading-[0.85] select-none">
                <span style={{ fontSize: specs.brandSize }} className="text-neutral-900 dark:text-white">SNORLAX</span>
                <span style={{ fontSize: specs.brandSize }} className="text-garage-blue">GARAGE</span>
              </div>
            </div>
          </Link>
        )}

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden sm:flex items-center gap-6 lg:gap-8">
          <Link to="/" onClick={(e) => handleNavClick('/', e)} className="relative flex flex-col md:flex-row items-center justify-center gap-1 font-bold transition-colors group">
            <Home size={specs.utilIcon} className={location.pathname === '/' ? 'text-blue-500' : 'text-neutral-400 dark:text-neutral-400 group-hover:text-blue-500'} />
            <span className={`text-[11px] md:text-[14px] font-bold uppercase tracking-tighter ${location.pathname === '/' ? 'bg-gradient-to-br from-[#0866FF] to-[#00CFFF] bg-clip-text text-transparent' : 'text-neutral-400 dark:text-neutral-400 group-hover:bg-gradient-to-br group-hover:from-[#0866FF] group-hover:to-[#00CFFF] group-hover:bg-clip-text group-hover:text-transparent'}`}>HOME</span>
          </Link>
          {navLinks.map((link) => {
            const isActive = location.pathname === link.to;
            const iconClass = isActive
              ? 'text-blue-500'
              : 'text-neutral-400 dark:text-neutral-400 group-hover:text-blue-500';
            const labelClass = isActive
              ? 'bg-gradient-to-br from-[#0866FF] to-[#00CFFF] bg-clip-text text-transparent'
              : 'text-neutral-400 dark:text-neutral-400 group-hover:bg-gradient-to-br group-hover:from-[#0866FF] group-hover:to-[#00CFFF] group-hover:bg-clip-text group-hover:text-transparent';
            return (
              <Link key={link.to} to={link.to} onClick={(e) => handleNavClick(link.to, e)} className="relative flex flex-col md:flex-row items-center justify-center gap-1 font-bold transition-colors group">
                <span className="relative inline-flex items-center justify-center">
                  {React.cloneElement(link.icon, { 
                    size: specs.utilIcon, 
                    className: `transition-colors ${iconClass}`
                  })}
                </span>
                <span className={`text-[11px] md:text-[14px] font-bold uppercase tracking-tighter ${labelClass}`}>{link.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="flex items-center justify-end z-[120] ml-auto gap-2 lg:gap-4">
            <button
              onClick={handleOpenNotifications}
              className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-300"
              aria-label={isNotificationModalOpen ? 'Close notifications' : 'Open notifications'}
            >
              {isNotificationModalOpen ? (
                <div className="rounded-full bg-neutral-500 p-[2px] shadow-sm transition-all duration-300">
                  <div className="overflow-hidden rounded-full border-2 border-neutral-500 bg-neutral-500 transition-colors">
                    <X size={specs.utilIcon - 4} strokeWidth={2.5} className="text-white" />
                  </div>
                </div>
              ) : (
                <Bell
                  size={specs.utilIcon}
                  className={`${isDarkMode ? 'text-white' : 'text-neutral-900'} group-hover:text-garage-blue transition-all duration-300`}
                />
              )}
              {unseenNotificationCount > 0 && !isNotificationModalOpen && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-white bg-red-500 px-1 text-[9px] font-black leading-none text-white dark:border-neutral-900">
                  {unseenNotificationCount > 99 ? '99+' : unseenNotificationCount}
                </span>
              )}
            </button>

            <button key={user?.uid || 'guest'} onClick={() => { 
                if (location.pathname === '/basket') {
                    window.dispatchEvent(new CustomEvent('toggleBasketView'));
                } else {
                    navigate('/basket');
                }
            }} className="p-2 relative group">
              {isAdmin && isAdminView ? (
                <ShelvingUnit
                  size={24} 
                  className={`${location.pathname === '/basket' ? 'text-garage-blue' : (isDarkMode ? 'text-white' : 'text-neutral-900')} group-hover:text-garage-blue transition-all duration-300`} 
                />
              ) : (
                <ShoppingBasket 
                  size={specs.utilIcon} 
                  className={`${location.pathname === '/basket' ? 'text-garage-blue' : (isDarkMode ? 'text-white' : 'text-neutral-900')} group-hover:text-garage-blue transition-all duration-300`} 
                />
              )}
              {activeBasket?.length > 0 && location.pathname !== '/basket' && <span className="absolute -top-1 -right-1 bg-gradient-to-br from-[#0866FF] to-[#00CFFF] text-white text-[10px]
    w-5 h-5 rounded-full flex items-center justify-center font-bold border border-white dark:border-neutral-900 group-hover:scale-110
    transition-transform">{activeBasket.length}</span>}
            </button>

            <div className="relative">
              <button 
                ref={profileBtnRef}
                id="nav-login-trigger"
                onClick={handleToggleProfile}
                className={`p-1 transition-all duration-300 relative group ${isProfileOpen ? 'scale-110' : 'scale-100'}`}
              >
                <div 
                  className={`rounded-full p-[2px] transition-all duration-300 ${isProfileOpen ? 'bg-neutral-500 shadow-sm' : (isAdmin && isAdminView ? adminRingClass : 'bg-transparent group-hover:bg-gradient-to-br group-hover:from-[#0866FF] group-hover:to-[#00CFFF]')}`}
                >
                  <div className={`rounded-full overflow-hidden border-2 transition-colors ${isProfileOpen ? 'border-neutral-500 bg-neutral-500' : (isAdmin && isAdminView ? 'border-white dark:border-neutral-900' : 'border-transparent group-hover:border-white dark:group-hover:border-neutral-900')}`}>
                    {isProfileOpen ? (
                        <X size={specs.utilIcon - 4} strokeWidth={2.5} className="text-white" />
                    ) : (isAdmin && isAdminView) ? (
                      garageInfo?.logoURL ? (
                        <img 
                          src={garageInfo.logoURL} 
                          alt="admin-logo" 
                          className="object-cover rounded-full" 
                          style={{ width: specs.utilIcon - 4, height: specs.utilIcon - 4 }} 
                        />
                      ) : (
                        <span
                          className="flex items-center justify-center rounded-full text-[9px] font-black tracking-tighter text-neutral-400 dark:text-neutral-500"
                          style={{ width: specs.utilIcon - 4, height: specs.utilIcon - 4 }}
                        >
                          SG
                        </span>
                      )
                    ) : profilePhotoURL && !profileImgError ? (
                      <img 
                        src={profilePhotoURL} 
                        alt="profile" 
                        referrerPolicy="no-referrer"
                        onError={() => setProfileImgError(true)}
                        className="object-cover rounded-full" 
                        style={{ width: specs.utilIcon - 4, height: specs.utilIcon - 4 }} 
                      />
                    ) : (
                      <CircleUserRound size={specs.utilIcon - 4} className={isProfileOpen ? 'text-red-500' : (isDarkMode ? 'text-white' : 'text-neutral-900 group-hover:text-transparent group-hover:bg-gradient-to-br group-hover:from-[#0866FF] group-hover:to-[#00CFFF] group-hover:bg-clip-text')} />
                    )}
                  </div>
                </div>
              </button>

              {isProfileOpen && (
                <div ref={profileModalRef} style={profilePanelStyle} className={`fixed animate-in fade-in slide-in-from-top-2 duration-200 ${isProfileFullscreen ? 'w-screen' : 'w-72'}`}>
                  <div className={`${isProfileFullscreen ? 'h-full max-h-full w-full max-w-none rounded-none overscroll-contain sm:ml-auto sm:max-w-sm' : 'max-h-[calc(100dvh-5rem)] rounded-[2rem]'} overflow-y-auto border shadow-2xl ${isDarkMode ? 'border-white/10 bg-[#0a0a0a]' : 'border-black/10 bg-white'}`}>
                    
                    <div className="p-6 flex flex-col items-center text-center space-y-3 border-b border-black/5 dark:border-white/5">
                      <div 
                        className="relative group cursor-pointer py-2"
                        onMouseEnter={() => isAdmin && setIsPhotoHovered(true)}
                        onMouseLeave={() => isAdmin && setIsPhotoHovered(false)}
                        onClick={() => { if (isAdmin) { setAdminView(!isAdminView); setIsProfileOpen(false); } }}
                      >
                        {isAdmin ? (
                            <div className="flex items-center justify-center -space-x-4">
                              <div className={`relative transition-all duration-500 rounded-full p-0.5 ${isAdminView ? `z-20 scale-110 ${adminRingClass} shadow-xl` : 'z-0 scale-90 opacity-40 bg-white/10'}`}>
                                {garageInfo?.logoURL ? (
                                  <img 
                                    src={garageInfo.logoURL} 
                                    alt="brand-logo" 
                                    className={`w-14 h-14 rounded-full border-2 object-cover ${isAdminView ? 'border-white dark:border-neutral-900' : 'border-transparent'}`} 
                                  />
                                ) : (
                                  <div className={`w-14 h-14 rounded-full border-2 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-neutral-400 ${isAdminView ? 'border-white dark:border-neutral-900' : 'border-transparent'}`}>
                                    <span className="text-sm font-black tracking-tighter">SG</span>
                                  </div>
                                )}

                                {isAdminView && (
                                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-br from-amber-300 via-yellow-400 to-orange-500 text-white flex items-center justify-center border-2 border-white dark:border-neutral-900 shadow-lg">
                                    <ShieldCheck size={10} />
                                  </div>
                                )}
                              </div>
                              <div className={`relative transition-all duration-500 rounded-full p-0.5 ${!isAdminView ? `z-20 scale-110 ${customerRingClass} shadow-xl` : 'z-0 scale-90 opacity-40 bg-white/10'}`}>
                                {profilePhotoURL && !profileImgError ? (
                                  <img 
                                    src={profilePhotoURL} 
                                    alt="user-photo"
                                    referrerPolicy="no-referrer"
                                    onError={() => setProfileImgError(true)}
                                    className={`w-14 h-14 rounded-full border-2 object-cover ${!isAdminView ? 'border-white dark:border-neutral-900' : 'border-transparent'}`} 
                                  />
                                ) : (
                                  <div className={`w-14 h-14 rounded-full border-2 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-neutral-400 ${!isAdminView ? 'border-white dark:border-neutral-900' : 'border-transparent'}`}>
                                    <ContactRound size={30} />
                                  </div>
                                )}
                                {!isAdminView && (
                                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-br from-[#0866FF] to-[#00CFFF] text-white flex items-center justify-center border-2 border-white dark:border-neutral-900 shadow-lg">
                                    <Shield size={10} />
                                  </div>
                                )}
                              </div>
                            </div>
                        ) : (
                          <div className="relative rounded-full p-0.5 bg-gradient-to-br from-[#0866FF] to-[#00CFFF]">
                            {profilePhotoURL && !profileImgError ? (
                              <img 
                                src={profilePhotoURL} 
                                alt="profile-display" 
                                referrerPolicy="no-referrer"
                                onError={() => setProfileImgError(true)}
                                className="w-16 h-16 rounded-full border-2 border-white dark:border-neutral-900 object-cover" 
                              />
                            ) : (
                              <div className="w-16 h-16 rounded-full border-2 border-white dark:border-neutral-900 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-neutral-400">
                                <ContactRound size={40} />
                              </div>
                            )}
                          </div>
                        )}
                        
                        {isAdmin && (
                          <div className="mt-2 text-[8px] font-black uppercase tracking-[0.2em] opacity-40 group-hover:opacity-100 transition-opacity">
                            Click to switch to {isAdminView ? 'Customer' : 'Admin'} View
                          </div>
                        )}

                        {isBanned && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">Banned</span>}
                      </div>
                      <div>
                        <h4 className="font-black italic uppercase tracking-tighter text-lg leading-none text-neutral-900 dark:text-white transition-all duration-300">
                          {(isAdmin && isPhotoHovered && !isAdminView) ? 'ENTER ADMIN MODE' : (isAdmin && isPhotoHovered && isAdminView) ? 'EXIT ADMIN MODE' : isAdminView ? 'ADMINISTRATOR MODE' : (user?.displayName || 'Guest')}
                        </h4>
                      </div>
                    </div>

                    <div className="p-2 space-y-1">
                      <button onClick={() => { toggleTheme(); setIsProfileOpen(false); }} className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-black/5 text-neutral-900'}`}>
                        {isDarkMode ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-garage-blue" />}
                        <span className="text-[12px] font-black uppercase tracking-widest">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
                      </button>

                      {user ? (
                        <>
                          {isAdminView ? (
                            <>
                              <button onClick={() => { navigate('/users-dashboard'); setIsProfileOpen(false); }} className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-colors bg-blue-500/10 text-blue-500 border border-blue-500/20 hover:bg-blue-500/20`}>
                                <UserPlus size={18} className="text-blue-500" />
                                <span className="text-[12px] font-black uppercase tracking-widest text-left leading-tight">Users Dashboard</span>
                              </button>
                              <button onClick={() => { setIsPickupPointOpen(true); setIsProfileOpen(false); }} className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-black/5 text-neutral-900'}`}>
                                <Truck size={18} className="opacity-40" />
                                <span className="text-[12px] font-black uppercase tracking-widest">Shipping Options</span>
                              </button>
                              <button onClick={() => { setIsPaymentSettingsOpen(true); setIsProfileOpen(false); }} className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-black/5 text-neutral-900'}`}>
                                <CreditCard size={18} className="opacity-40" />
                                <span className="text-[12px] font-black uppercase tracking-widest">Payment Options</span>
                              </button>
                              <button onClick={handleInventoryAudit} disabled={isCheckingInventory} className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-colors ${isCheckingInventory ? 'opacity-60 cursor-wait' : (isDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-black/5 text-neutral-900')}`}>
                                <PackageOpen size={18} className="opacity-40" />
                                <span className="text-[12px] font-black uppercase tracking-widest text-left leading-tight">
                                  {isCheckingInventory ? 'Checking Inventory...' : 'Check Inventory'}
                                </span>
                              </button>
                            </>
                          ) : (
                            <button onClick={() => { if (!user) setIsLoginPromptOpen(true); else setIsSettingsModalOpen(true); setIsProfileOpen(false); }} className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-black/5 text-neutral-900'}`}>
                              <Settings size={18} className="opacity-40" />
                              <span className="text-[12px] font-black uppercase tracking-widest">Account Settings</span>
                            </button>
                          )}
                          {user && (
                            <button onClick={() => { navigate('/notify-list'); setIsProfileOpen(false); }} className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-black/5 text-neutral-900'}`}>
                              <Bell size={18} className="opacity-40" />
                              <span className="text-[12px] font-black uppercase tracking-widest">OFFERS</span>
                            </button>
                          )}
                          <button onClick={handleLogout} className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-colors ${originalAdminUser ? 'text-orange-500 hover:bg-orange-500/10' : 'text-red-500 hover:bg-red-500/10'}`}>
                            <LogOut size={18} />
                            <span className="text-[12px] font-black uppercase tracking-widest">
                              {originalAdminUser ? 'Exit Impersonation' : 'Logout'}
                            </span>
                          </button>
                        </>
                      ) : (
                        <div className="flex flex-col gap-2 w-full mt-2">
                          {showFacebook ? (
                            <button 
                               onClick={handleLogin} 
                               onPointerUp={(e) => e.stopPropagation()}
                               className="w-full flex items-center justify-center gap-3 p-4 rounded-3xl bg-[#1877f2] text-white hover:bg-[#166fe5] transition-colors"
                            >
                              <FaFacebook size={18} fill="white" />
                              <span className="text-[12px] font-black uppercase tracking-widest">Login with Facebook</span>
                            </button>
                          ) : (
                            <button 
                              onPointerDown={() => {
                                holdTimerRef.current = setTimeout(() => {
                                  setShowFacebook(true);
                                }, 3000);
                              }}
                              onPointerUp={(e) => {
                                e.stopPropagation();
                                if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
                                // Start 5s timeout on release if we are currently showing Facebook
                                if (showFacebook) {
                                  timeoutTimerRef.current = setTimeout(() => setShowFacebook(false), 5000);
                                }
                              }}
                              onPointerLeave={() => {
                                if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
                              }}
                              onClick={handleGoogleLogin} 
                              className={`w-full flex items-center justify-center gap-3 p-4 rounded-3xl ${showFacebook ? 'bg-[#1877f2] text-white hover:bg-[#166fe5]' : 'bg-white text-neutral-900 border border-neutral-300 hover:bg-neutral-50'} transition-colors`}>
                               <FcGoogle size={18} />
                              <span className="text-[12px] font-black uppercase tracking-widest">{showFacebook ? 'Login with Facebook' : 'Login with Google'}</span>
                            </button>
                          )}
                          {authError && !showFacebook && (
                            <p className="text-center text-[10px] font-black uppercase tracking-[0.16em] text-red-500">
                              {authError}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
        </div>
      </div>
    </nav>

    {originalAdminUser && (
      <div className="fixed top-0 left-0 w-full z-[1000] bg-orange-600 text-white py-1 px-4 flex justify-between items-center shadow-lg">
        <span className="text-[10px] font-black uppercase italic">
          ⚠️ Currently acting as: {user?.displayName}
        </span>
        <button 
          onClick={stopImpersonating}
          className="bg-white text-orange-600 px-3 py-0.5 rounded-full text-[9px] font-black uppercase"
        >
          Return to Admin
        </button>
      </div>
    )}

 {/* Mini Navbar */}
        {isMobile && location.pathname !== '/checkout' && (
          <div className={`fixed bottom-0 left-0 right-0 z-[100] transition-transform duration-300 ${showBottomNav ? 'translate-y-0' : 'translate-y-full'}`}>
            <div style={{ height: specs.h }} className={`flex items-center justify-around px-2 border-t ${isDarkMode ? 'bg-[#121212] border-white/10' : 'bg-white border-black/5'} shadow-2xl`}>
              <button onClick={(e) => handleNavClick('/', e)} className={`flex flex-col items-center justify-center gap-1 transition-colors ${location.pathname === '/' ? 'text-garage-blue' : 'text-neutral-600 dark:text-neutral-400'}`}>
                <Home size={20} />
                <span className="text-[10px] font-black uppercase tracking-tighter">Home</span>
              </button>
              {navLinks.map((link) => {
                const isActive = location.pathname === link.to;
                const buttonClass = isActive
                  ? 'bg-gradient-to-br from-[#0866FF] to-[#00CFFF] bg-clip-text text-transparent'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-gradient-to-br hover:from-[#0866FF] hover:to-[#00CFFF] hover:bg-clip-text hover:text-transparent';
                return (
                  <button key={link.to} onClick={(e) => handleNavClick(link.to, e)} className={`group flex flex-col items-center justify-center gap-1 transition-colors ${buttonClass}`}>
                    <span className="relative inline-flex items-center justify-center">
                      {React.cloneElement(link.icon, { size: 20, className: isActive ? 'text-blue-500' : '' })}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-tighter">{link.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

    <NotificationModal
      isOpen={isNotificationModalOpen}
      onClose={() => setIsNotificationModalOpen(false)}
      isDarkMode={isDarkMode}
      orders={allNotifications}
      readVersions={notificationReadVersions}
      onOpenOrder={handleOpenNotificationOrder}
      emptyLabel={isAdminNotificationView ? 'No admin updates yet' : 'No order updates yet'}
      isFullscreen={isProfileFullscreen}
      navbarHeight={specs.h}
      anchorTop={notificationAnchorTop}
    />

    <WelcomeModal 
      isOpen={Boolean(user && isProfileIncomplete)} 
      onClose={() => {}} 
      onSetup={() => { setIsSettingsModalOpen(true); }}
    />

    <AccountSettingsModal 
      isOpen={isSettingsModalOpen} 
      onClose={() => setIsSettingsModalOpen(false)} 
    />

    <FulfillmentModal 
      isOpen={isPickupPointOpen} 
      onClose={() => setIsPickupPointOpen(false)} 
    />

    <PaymentSettingsModal
      isOpen={isPaymentSettingsOpen}
      onClose={() => setIsPaymentSettingsOpen(false)}
    />

    <LoginPromptModal 
      isOpen={isLoginPromptOpen} 
      onClose={() => setIsLoginPromptOpen(false)} 
      onLogin={() => { setLoginModalOpen(true); setIsLoginPromptOpen(false); }}
    />

    <AccountSettingsModal 
      isOpen={isLoginModalOpen} 
      onClose={() => setLoginModalOpen(false)} 
    />

    <StoriesManagerModal
      isOpen={isStoriesManagerOpen}
      onClose={() => setIsStoriesManagerOpen(false)}
    />
  </>
);

}



  

  



       
