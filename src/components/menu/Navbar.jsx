import React, { useEffect, useMemo, useState, useRef, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion as Motion, useDragControls, useMotionValue } from 'framer-motion';
import { 
  Sun, Moon, ShoppingCart, Home, X, ShelvingUnit,
  CircleUserRound, Settings, LogOut, ContactRound,
  Shield, ShieldCheck, Box, Printer, ClipboardList, UserPlus, Truck, Bell, FileText
} from 'lucide-react';
import { FcGoogle } from 'react-icons/fc';
import { FaFacebook } from 'react-icons/fa';



import { useTheme } from '../../context/ThemeContext';
import { useStore } from '../../store/useStore';
import { preloadRoute } from '../../routePreloads';
import { signOut, signInWithPopup } from 'firebase/auth'; 
import { getReadableAuthErrorMessage } from '../../utils/authUtils';
import { auth, fbProvider, googleProvider } from '../../firebase/firebase';
import { APP_CONFIG, isLegacyApp, isPortfolioApp } from '../../appConfig';
import NotificationModal from './NotificationModal';
import {
  buildCommerceNotifications,
  getAvailableStockEntries,
  isActiveHunt
} from './commerceNotificationUtils';
import {
  getNotificationActivityTime,
  getNotificationVersion,
  isLegacyOrderRecord,
  isCompletedOrderNotification
} from './notificationUtils';

const AccountSettingsModal = lazy(() => import('./AccountSettingsModal'));
const OperationsModal = lazy(() => import('./OperationsModal'));
const WelcomeModal = lazy(() => import('./WelcomeModal'));
const StoryEditorModal = lazy(() => import('./StoryEditorModal'));

const notificationStateStorageKey = (stateType, userId) => `snorlaxgarage:notification-${stateType}:${userId}`;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_DAY_NOTIFICATION_KINDS = new Set(['low_stock', 'back_in_stock']);

const isCompletedLegacyOrder = (order) => (
  isLegacyOrderRecord(order)
  && String(order?.status || '').trim().toLowerCase() === 'completed'
);

const isOrderRelatedNotification = (notification) => (
  !notification?.notificationKind
  || notification.notificationKind === 'admin_receipt'
  || notification.notificationKind === 'admin_legacy_completion'
  || Boolean(notification?.orderId)
  || isLegacyOrderRecord(notification)
);

const clearBrowserNotificationCounter = () => {
  document.title = document.title.replace(/^\(\d+\)\s*/, '');
};

const ProfileModalLayer = ({ enabled, children }) => (
  enabled ? createPortal(children, document.body) : children
);

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
    userOffers,
    notifyList,
    shippingSettings,
    user, 
    isProfileIncomplete,
    isBanned, 
    isAdmin,
    isAdminView,
    setAdminView,
    originalAdminUser, 
    stopImpersonating,
    subscribeOrders,
    subscribeNotifyList,
    isLoginModalOpen,
    setLoginModalOpen,
    guestBasket,
  } = useStore();

  const activeBasket = user ? ((isAdmin && isAdminView) ? shelf : basket) : guestBasket;
  const notificationBasket = user ? basket : guestBasket;
  const isAdminNotificationView = Boolean(isAdmin && isAdminView);
  const notificationOwnerKey = user?.uid
    ? `${user.uid}${isAdminNotificationView ? ':admin' : ''}`
    : 'guest';
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [notificationReadVersions, setNotificationReadVersions] = useState({});
  const [notificationSeenVersions, setNotificationSeenVersions] = useState({});
  const [notificationDismissedVersions, setNotificationDismissedVersions] = useState({});
  const [outOfStockKitIds, setOutOfStockKitIds] = useState({});
  const [notificationNow, setNotificationNow] = useState(0);
  const [notificationAnchorTop, setNotificationAnchorTop] = useState(null);
  const [isOperationsOpen, setIsOperationsOpen] = useState(false);
  const [operationsTab, setOperationsTab] = useState('shipping');
  const [isHighlightModalOpen, setIsHighlightModalOpen] = useState(false);
  const [isStoriesManagerOpen, setIsStoriesManagerOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isPhotoHovered, setIsPhotoHovered] = useState(false);
  const [showFacebook, setShowFacebook] = useState(false);
  const holdTimerRef = useRef(null);
  const timeoutTimerRef = useRef(null);


  const [authError, setAuthError] = useState(null);
  const [showBottomNav, setShowBottomNav] = useState(true);
  const isMobileMiniNavbarEnabled = false;
  const [forceHide, setForceHide] = useState(false); 
  const [isPastScrollThreshold, setIsPastScrollThreshold] = useState(() => window.scrollY > 40);
  const lastScrollYRef = useRef(window.scrollY);
  const scrollFrameRef = useRef(0);
  const [imgError, setImgError] = useState(false);
  const [profileImgError, setProfileImgError] = useState(false);

  const profileModalRef = useRef(null);
  const profileScrollRef = useRef(null);
  const profileBtnRef = useRef(null);
  const navbarRef = useRef(null);
  const profileDragControls = useDragControls();
  const profileContentGestureRef = useRef(null);
  const profilePanelDragY = useMotionValue(0);
  const [isProfileContentDragging, setIsProfileContentDragging] = useState(false);
  const [isProfileListAtEnd, setIsProfileListAtEnd] = useState(false);
  const policyScrollCleanupRef = useRef(null);
  const landingStickyScrollTopRef = useRef(null);

  const startProfileDrag = (event) => {
    event.stopPropagation();
    profileDragControls.start(event);
  };

  const handleProfileSurfacePointerDown = (event) => {
    if (!isProfileListAtEnd) return;
    profileContentGestureRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      direction: null,
      dragged: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleProfileSurfacePointerMove = (event) => {
    const gesture = profileContentGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - gesture.startY;
    if (!gesture.direction) {
      if (Math.abs(deltaY) < 6) return;
      if (deltaY > 0) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        profileContentGestureRef.current = null;
        return;
      }
      gesture.direction = 'up';
    }

    if (gesture.direction === 'up') {
      event.preventDefault();
      gesture.dragged = true;
      setIsProfileContentDragging(true);
      profilePanelDragY.set(Math.max(-420, Math.min(0, deltaY)));
    }
  };

  const finishProfileSurfaceGesture = (event) => {
    const gesture = profileContentGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - gesture.startY;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    profileContentGestureRef.current = null;
    if (gesture.direction === 'up') {
      if (deltaY < -90) {
        setIsProfileContentDragging(false);
        profilePanelDragY.set(0);
        setIsProfileOpen(false);
      } else {
        setIsProfileContentDragging(false);
        profilePanelDragY.set(0);
      }
    }
  };

  const isMobile = windowWidth < 640;
  const isSmallViewport = windowWidth >= 640 && windowWidth < 768;
  const isDesktop = windowWidth >= 1024;
  const isProfileFullscreen = windowWidth < 1024;
  const profilePhotoURL = user?.photoURL || auth.currentUser?.photoURL || '';
  const adminRingClass = 'bg-gradient-to-br from-amber-300 via-yellow-400 to-orange-500 shadow-lg shadow-yellow-500/25';
  const customerRingClass = 'bg-gradient-to-br from-[#0866FF] to-[#00CFFF]';
  const commerceNotifications = useMemo(() => (
    buildCommerceNotifications({
      kits,
      deals,
      basket: notificationBasket,
      hunts: user?.uid && !isAdminNotificationView ? userOffers : [],
      outOfStockKitIds,
      now: notificationNow
    })
  ), [deals, isAdminNotificationView, kits, notificationBasket, notificationNow, outOfStockKitIds, user?.uid, userOffers]);
  // Keep one shared order listener for the navbar and order pages. The store
  // reference-counts identical subscriptions, avoiding a second live query
  // just for the notification bell.
  const effectiveNotificationOrders = useMemo(
    () => (user?.uid ? orders : []),
    [orders, user?.uid]
  );
  const legacyCompletionNotifications = useMemo(() => (
    effectiveNotificationOrders
      .filter(isCompletedLegacyOrder)
      .map((order) => ({
        ...order,
        notificationKind: 'admin_legacy_completion',
        notificationLabel: 'Completed',
        message: 'A legacy order has been completed.'
      }))
  ), [effectiveNotificationOrders]);
  const publicNotificationOrders = useMemo(() => (
    effectiveNotificationOrders.filter((order) => !isCompletedLegacyOrder(order))
  ), [effectiveNotificationOrders]);
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

    return (notifyList || [])
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
  }, [kits, notifyList, notificationNow]);
  const allNotifications = useMemo(() => (
    isAdminNotificationView
      ? [...legacyCompletionNotifications, ...adminReceiptNotifications, ...adminOfferNotifications]
      : [...publicNotificationOrders, ...commerceNotifications]
  ), [adminOfferNotifications, adminReceiptNotifications, commerceNotifications, isAdminNotificationView, legacyCompletionNotifications, publicNotificationOrders]);
  const visibleNotifications = useMemo(() => allNotifications.filter((notification) => {
    const version = getNotificationVersion(notification);
    if (notificationDismissedVersions[notification.id] === version) return false;

    if (ONE_DAY_NOTIFICATION_KINDS.has(notification.notificationKind) || isCompletedOrderNotification(notification)) {
      const postedAt = getNotificationActivityTime(notification);
      if (postedAt > 0 && notificationNow - postedAt >= ONE_DAY_MS) return false;
    }

    return true;
  }), [allNotifications, notificationDismissedVersions, notificationNow]);
  const unseenNotificationCount = visibleNotifications.reduce((count, notification) => (
    notificationSeenVersions[notification.id] === getNotificationVersion(notification) ? count : count + 1
  ), 0);

  useEffect(() => {
    setNotificationReadVersions(loadNotificationVersions('reads', notificationOwnerKey));
    setNotificationSeenVersions(loadNotificationVersions('seen', notificationOwnerKey));
    setNotificationDismissedVersions(loadNotificationVersions('dismissed', notificationOwnerKey));
    setOutOfStockKitIds(loadNotificationVersions('out-of-stock', notificationOwnerKey));
  }, [notificationOwnerKey]);

  useEffect(() => {
    const refreshNotificationTime = () => setNotificationNow(Date.now());
    refreshNotificationTime();
    const timer = window.setInterval(refreshNotificationTime, 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const kitMap = new Map((kits || []).map((kit) => [kit.id, kit]));
    const basketKitIds = [...new Set((notificationBasket || []).map((item) => item?.id).filter(Boolean))];
    const activeHuntKitIds = (user?.uid && !isAdminNotificationView ? userOffers : [])
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
  }, [isAdminNotificationView, kits, notificationBasket, notificationNow, notificationOwnerKey, user?.uid, userOffers]);

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
    if (isProfileOpen) {
      profilePanelDragY.set(0);
      setIsProfileContentDragging(false);
    }
  }, [isProfileOpen, profilePanelDragY]);

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
      setIsProfileListAtEnd(false);
      return undefined;
    }

    const list = profileScrollRef.current;
    if (!list) return undefined;

    const updateProfileListPosition = () => {
      setIsProfileListAtEnd(
        list.scrollTop + list.clientHeight >= list.scrollHeight - 4
      );
    };

    updateProfileListPosition();
    list.addEventListener('scroll', updateProfileListPosition, { passive: true });
    const frame = window.requestAnimationFrame(updateProfileListPosition);
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateProfileListPosition)
      : null;
    resizeObserver?.observe(list);

    return () => {
      list.removeEventListener('scroll', updateProfileListPosition);
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
    };
  }, [isProfileFullscreen, isProfileOpen, isAdmin, isAdminView, user, showFacebook]);

  useEffect(() => {
    if (!isProfileOpen || !isProfileFullscreen) {
      window.dispatchEvent(new Event('profileFullscreenClose'));
      return undefined;
    }

    window.dispatchEvent(new Event('profileFullscreenOpen'));
    return () => window.dispatchEvent(new Event('profileFullscreenClose'));
  }, [isProfileOpen, isProfileFullscreen]);

useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    const handleForceHide = () => { setForceHide(true); setShowBottomNav(false); };
    const handleForceShow = () => { setForceHide(false); setShowBottomNav(true); };
    const handleOpenStoriesManager = () => {
      setIsStoriesManagerOpen(true);
      setIsProfileOpen(false);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('hideNavbar', handleForceHide);
    window.addEventListener('showNavbar', handleForceShow);
    window.addEventListener('openStoriesManager', handleOpenStoriesManager);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('hideNavbar', handleForceHide);
      window.removeEventListener('showNavbar', handleForceShow);
      window.removeEventListener('openStoriesManager', handleOpenStoriesManager);
    };
  }, []);
useEffect(() => {
  const handleScroll = () => {
    if (scrollFrameRef.current) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      const currentScrollY = window.scrollY;
      const previousScrollY = lastScrollYRef.current;
      const nextBottomNavVisible = forceHide
        ? false
        : !(currentScrollY > previousScrollY && currentScrollY > 50);
      const nextPastScrollThreshold = currentScrollY > 40;

      setShowBottomNav((visible) => visible === nextBottomNavVisible ? visible : nextBottomNavVisible);
      setIsPastScrollThreshold((pastThreshold) => pastThreshold === nextPastScrollThreshold ? pastThreshold : nextPastScrollThreshold);
      lastScrollYRef.current = currentScrollY;
      scrollFrameRef.current = 0;
    });
  };

  lastScrollYRef.current = window.scrollY;
  window.addEventListener('scroll', handleScroll);
  return () => {
    if (scrollFrameRef.current) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = 0;
    }
    window.removeEventListener('scroll', handleScroll);
  };
}, [forceHide, location.pathname]);

  // Keep pages with mobile sticky footers aligned with the animated mini navbar.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('bottomNavVisibilityChange', {
      detail: { visible: isMobileMiniNavbarEnabled && showBottomNav }
    }));
  }, [isMobileMiniNavbarEnabled, showBottomNav]);

  // Highlight cards open their full card modal while the landing page remains
  // mounted. Keep the navbar compact even though the router location stays on
  // the landing page while that modal is open.
  useEffect(() => {
    const handleHighlightModalState = (event) => {
      setIsHighlightModalOpen(event.detail?.open === true);
    };

    window.addEventListener('highlightModalStateChange', handleHighlightModalState);
    return () => window.removeEventListener('highlightModalStateChange', handleHighlightModalState);
  }, []);

  const isCompactMode = location.pathname !== "/" || scrolledCompact || isPastScrollThreshold || isStoriesManagerOpen || isNotificationModalOpen || isProfileOpen || isHighlightModalOpen || isMobile || isSmallViewport;

  useEffect(() => {
    if (!user?.uid) return undefined;
    return subscribeOrders({
      uid: user.uid,
      isAdminMode: isAdminNotificationView
    });
  }, [isAdminNotificationView, subscribeOrders, user?.uid]);

  useEffect(() => {
    if (!isAdminNotificationView) return undefined;
    return subscribeNotifyList({ isAdminMode: true });
  }, [isAdminNotificationView, subscribeNotifyList]);

  const handleNavClick = (path, e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    preloadRoute(path);
    policyScrollCleanupRef.current?.();
    policyScrollCleanupRef.current = null;
    setIsProfileOpen(false);
    setIsNotificationModalOpen(false);

    if (location.pathname === path) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate(path);
    }
  };

  useEffect(() => {
    policyScrollCleanupRef.current?.();
    policyScrollCleanupRef.current = null;
  }, [location.pathname]);

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

    if (!isOrderRelatedNotification(notification)) {
      setNotificationDismissedVersions((currentDismissedVersions) => {
        const nextDismissedVersions = {
          ...currentDismissedVersions,
          [notification.id]: getNotificationVersion(notification)
        };
        saveNotificationVersions('dismissed', notificationOwnerKey, nextDismissedVersions);
        return nextDismissedVersions;
      });
    }

    setIsNotificationModalOpen(false);
    if (isOrderRelatedNotification(notification)) {
      navigate('/orders', { state: { openOrderId: notification.id || notification.orderId } });
      return;
    }
    if (notification.notificationKind === 'admin_offer') {
      navigate('/notify-list');
      return;
    }
    if (notification.notificationKind === 'wild_sale') {
      navigate('/kits', { state: { focusDealsSection: true, focusWildSaleDealId: notification.dealId } });
      return;
    }
    if (notification.kitId) {
      navigate(`/kits/${encodeURIComponent(notification.kitId)}`);
      return;
    }
    navigate('/orders', { state: { openOrderId: notification.id || notification.orderId } });
  };

  const handleDismissNotification = (notification) => {
    if (!notification?.id) return;

    setNotificationDismissedVersions((currentDismissedVersions) => {
      const nextDismissedVersions = {
        ...currentDismissedVersions,
        [notification.id]: getNotificationVersion(notification)
      };
      saveNotificationVersions('dismissed', notificationOwnerKey, nextDismissedVersions);
      return nextDismissedVersions;
    });
  };

  const getLandingStickyOffset = () => {
    const navbarTop = navbarRef.current?.getBoundingClientRect().top ?? 0;
    const storiesBottom = document.querySelector('[aria-label="Garage highlights"]')
      ?.getBoundingClientRect().bottom ?? 0;
    return Math.max(navbarTop, storiesBottom);
  };

  const openAfterLandingNavbarCompacts = (openPanel, fullscreenEventName = null) => {
    const prepareFullscreenPanel = () => {
      if (fullscreenEventName) {
        window.dispatchEvent(new Event(fullscreenEventName));
      }
    };
    const stickyOffset = getLandingStickyOffset();
    const needsStickyNavbar = location.pathname === '/' && !isDesktop && stickyOffset > 1;
    if (!needsStickyNavbar) {
      prepareFullscreenPanel();
      openPanel();
      return;
    }

    const stickyScrollTop = Math.max(
      window.scrollY,
      Math.ceil(window.scrollY + stickyOffset)
    );
    landingStickyScrollTopRef.current = stickyScrollTop;
    window.scrollTo({ top: stickyScrollTop, left: 0, behavior: 'auto' });
    prepareFullscreenPanel();
    window.requestAnimationFrame(openPanel);
  };

  useEffect(() => {
    const isFullscreenPanelOpen = isProfileOpen || isNotificationModalOpen;
    if (!isFullscreenPanelOpen || location.pathname !== '/' || windowWidth >= 1024) return undefined;

    const allowLandingScroll = windowWidth < 1024;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverscrollBehavior = document.body.style.overscrollBehaviorY;
    const previousHtmlOverscrollBehavior = document.documentElement.style.overscrollBehaviorY;
    if (!allowLandingScroll) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overscrollBehaviorY = 'none';
      document.documentElement.style.overscrollBehaviorY = 'none';
    }

    const currentNavbarTop = getLandingStickyOffset();
    const minimumLandingScroll = landingStickyScrollTopRef.current ?? Math.max(
      window.scrollY,
      Math.ceil(window.scrollY + currentNavbarTop)
    );
    landingStickyScrollTopRef.current = minimumLandingScroll;
    const handleLandingScroll = () => {
      const currentLandingScroll = window.scrollY;
      if (currentLandingScroll < minimumLandingScroll) {
        window.scrollTo({ top: minimumLandingScroll, left: 0, behavior: 'auto' });
      }
    };

    handleLandingScroll();
    window.addEventListener('scroll', handleLandingScroll, { passive: true });
    const dismissOnUpwardWheel = (event) => {
      if (!allowLandingScroll || event.deltaY >= 0) return;
      if (event.target.closest?.('[data-modal-scroll-container]')) return;
      setIsProfileOpen(false);
      setIsNotificationModalOpen(false);
    };
    if (allowLandingScroll) {
      window.addEventListener('wheel', dismissOnUpwardWheel, { capture: true, passive: true });
    }
    return () => {
      window.removeEventListener('scroll', handleLandingScroll);
      if (allowLandingScroll) {
        window.removeEventListener('wheel', dismissOnUpwardWheel, true);
      }
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehaviorY = previousBodyOverscrollBehavior;
      document.documentElement.style.overscrollBehaviorY = previousHtmlOverscrollBehavior;
    };
  }, [isNotificationModalOpen, isProfileOpen, location.pathname, windowWidth]);

  const handleOpenNotifications = () => {
    if (isNotificationModalOpen) {
      setIsNotificationModalOpen(false);
      return;
    }

    setIsProfileOpen(false);
    setNotificationSeenVersions((currentSeenVersions) => {
      const nextSeenVersions = { ...currentSeenVersions };
      visibleNotifications.forEach((notification) => {
        nextSeenVersions[notification.id] = getNotificationVersion(notification);
      });
      saveNotificationVersions('seen', notificationOwnerKey, nextSeenVersions);
      return nextSeenVersions;
    });
    clearBrowserNotificationCounter();
    openAfterLandingNavbarCompacts(() => {
      setNotificationAnchorTop(navbarRef.current?.getBoundingClientRect().bottom ?? null);
      setIsNotificationModalOpen(true);
    }, isProfileFullscreen ? 'notificationFullscreenOpen' : null);
  };

  const handleToggleProfile = () => {
    if (isProfileOpen) {
      setIsProfileOpen(false);
      return;
    }

    setIsNotificationModalOpen(false);
    openAfterLandingNavbarCompacts(() => {
      setNotificationAnchorTop(navbarRef.current?.getBoundingClientRect().bottom ?? null);
      setIsProfileOpen(true);
    }, isProfileFullscreen ? 'profileFullscreenOpen' : null);
  };

  useEffect(() => {
    if (!isNotificationModalOpen && !isProfileOpen) return undefined;

    const updateNavbarAnchor = () => {
      setNotificationAnchorTop(navbarRef.current?.getBoundingClientRect().bottom ?? null);
    };

    updateNavbarAnchor();
    window.addEventListener('resize', updateNavbarAnchor);
    return () => window.removeEventListener('resize', updateNavbarAnchor);
  }, [isNotificationModalOpen, isProfileOpen]);

  const handleLogin = async () => {
    const authAttemptId = useStore.getState().beginAuthAttempt(() => handleLogin());
    try {
      setAuthError(null);
      await signInWithPopup(auth, fbProvider);
      if (!useStore.getState().isAuthAttemptActive(authAttemptId)) return;
      useStore.getState().setAuthAttemptStatus(authAttemptId, 'Syncing Profile');
      setIsProfileOpen(false);
    } catch (err) {
      console.error('SG AUTH ERROR (Facebook):', err?.code, err?.message, err);
      setAuthError(getReadableAuthErrorMessage(err));
      useStore.getState().failAuthAttempt(authAttemptId, err);
    }
  };

  const handleGoogleLogin = async () => {
    const authAttemptId = useStore.getState().beginAuthAttempt(() => handleGoogleLogin());
    try {
      setAuthError(null);
      await signInWithPopup(auth, googleProvider);
      if (!useStore.getState().isAuthAttemptActive(authAttemptId)) return;
      useStore.getState().setAuthAttemptStatus(authAttemptId, 'Syncing Profile');
      setIsProfileOpen(false);
    } catch (err) {
      console.error('SG AUTH ERROR (Google):', err?.code, err?.message, err);
      setAuthError(getReadableAuthErrorMessage(err));
      useStore.getState().failAuthAttempt(authAttemptId, err);
    }
  };


  const handleLogout = async () => {
  const actionLabel = originalAdminUser ? 'exit admin mode' : 'log out';
  const confirmed = window.confirm(`Are you sure you want to ${actionLabel}?`);
  if (!confirmed) return;

  if (originalAdminUser) {
    stopImpersonating();
  } else {
    await signOut(auth);
    navigate('/');
  }
  setIsProfileOpen(false);
};

const handleOpenPolicies = () => {
  policyScrollCleanupRef.current?.();
  policyScrollCleanupRef.current = null;
  setIsProfileOpen(false);

  let initialTimer = null;
  let settleTimer = null;
  let layoutObserver = null;
  const cleanup = () => {
    if (initialTimer) window.clearTimeout(initialTimer);
    if (settleTimer) window.clearTimeout(settleTimer);
    layoutObserver?.disconnect();
    if (policyScrollCleanupRef.current === cleanup) policyScrollCleanupRef.current = null;
  };
  policyScrollCleanupRef.current = cleanup;

  initialTimer = window.setTimeout(() => {
    const footer = document.getElementById('site-footer');
    if (!footer) return cleanup();

    const scrollToFooter = (behavior = 'smooth') => {
      footer.scrollIntoView({ behavior, block: 'start' });
    };

    scrollToFooter();

    // Kits can append cards after the first scroll. Keep the footer aligned
    // while the page settles, then stop observing once loading has stabilized.
    if (typeof ResizeObserver !== 'undefined') {
      layoutObserver = new ResizeObserver(() => scrollToFooter('auto'));
      layoutObserver.observe(document.body);
      if (footer.parentElement) layoutObserver.observe(footer.parentElement);
    }
    settleTimer = window.setTimeout(cleanup, 5000);
  }, 0);
};

useEffect(() => {
  // console.log("Admin View State in Navbar:", isAdminView);
}, [isAdminView]);

const navLinks = [
  ...(APP_CONFIG.nav.includes('kits') ? [{ to: "/kits", icon: <Box />, label: "KITS" }] : []),
  ...(APP_CONFIG.nav.includes('prints') ? [{ to: "/prints", icon: <Printer />, label: "PRINTS" }] : []),
  ...(APP_CONFIG.nav.includes('orders') && user ? [{ to: "/orders", icon: <ClipboardList />, label: "ORDERS" }] : []),
  ...(APP_CONFIG.nav.includes('dashboard') && isAdmin ? [{ to: "/users-dashboard", icon: <ShieldCheck />, label: "CORE" }] : []),
  ...(APP_CONFIG.nav.includes('about') ? [{ to: "/about-us", icon: <ContactRound />, label: isPortfolioApp ? "ME" : "ABOUT" }] : [])
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

const isFallbackLogo = !garageInfo?.fbPageId || imgError;
const displayImg = isFallbackLogo
  ? (imgError ? '/snorlaxgarage.png' : (garageInfo?.logoURL || '/snorlaxgarage.png'))
  : `https://graph.facebook.com/${garageInfo.fbPageId}/picture?type=large`;

const getPageTitle = () => {
  if (!isLegacyApp) return { line1: APP_CONFIG.brandLines[0], line2: APP_CONFIG.brandLines[1] };
  if (!isMobile) return { line1: 'SNORLAX', line2: 'GARAGE' };
  
  switch (location.pathname) {
    case '/kits': return { line1: 'GARAGE', line2: 'KITS' };
    case '/prints': return { line1: 'PRINTS', line2: 'HUB' };
    case '/orders': return { line1: 'YOUR', line2: 'ORDERS' };
    case '/cart':
    case '/basket': return isAdminView ? { line1: 'ADMIN', line2: 'SHELF' } : { line1: 'YOUR', line2: 'CART' };
    case '/notify-list': return { line1: 'YOUR', line2: 'OFFERS' };
    default: return { line1: 'SNORLAX', line2: 'GARAGE' };
  }
};

const pageTitle = getPageTitle();
const isCartPath = location.pathname === '/cart' || location.pathname === '/basket';
const isCurrentPageMaintenanceInvalid = isMaintenanceInvalidPath(location.pathname);
const navbarAnchorTop = Number.isFinite(notificationAnchorTop)
  ? `${notificationAnchorTop}px`
  : specs.h;
// Increase this inset to shorten both fullscreen sheets; decrease it to extend them.
// On mobile, keep the cutoff at half of the hidden mini-navbar height.
const fullscreenModalBottomInset = isMobile ? `calc(${specs.h} / 2)` : '0.75rem';
const profilePanelStyle = isProfileFullscreen
  ? {
      // Non-desktop sheets are fixed directly below the navbar. The landing
      // page is scrolled to the navbar before the sheet opens.
      top: specs.h,
      right: 0,
      bottom: fullscreenModalBottomInset,
      left: 0,
      zIndex: 1000
    }
  : {
      top: `calc(${navbarAnchorTop} + 8px)`,
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

    <AnimatePresence>
      {isProfileOpen && isProfileFullscreen && (
        <Motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          style={{ top: specs.h }}
          className="fixed inset-x-0 bottom-0 z-[900] bg-black/30"
          aria-hidden="true"
          onClick={() => setIsProfileOpen(false)}
        />
      )}
    </AnimatePresence>

    <nav ref={navbarRef} style={{ height: specs.h }} className={`${isStoriesManagerOpen ? (isDesktop ? 'fixed left-0 right-0 top-0 z-[400]' : 'hidden') : 'sticky top-0 z-[110]'} w-full transition-all duration-500 border-b ${location.pathname === '/checkout' ? 'hidden lg:block' : ''} ${isDarkMode ? 'bg-[var(--color-surface-raised)] border-white/10' : 'bg-white border-black/10'}`}>
      <div className="h-full mx-auto flex items-center px-4 lg:px-10 relative max-w-[1440px]">
        {isMobile ? (
          <Link
            to="/"
            onPointerEnter={() => preloadRoute('/')}
            onPointerDown={() => preloadRoute('/')}
            onTouchStart={() => preloadRoute('/')}
            onClick={(e) => handleNavClick('/', e)}
            className="flex items-center h-full z-[120] shrink-0 relative"
          >
            <div 
              style={{ width: specs.logoSize, height: specs.logoSize, padding: specs.ringPadding }} 
              className="relative rounded-full flex items-center justify-center bg-gradient-to-br from-[#0866FF] to-[#00CFFF] shadow-xl transition-all duration-500"
            >
              <div className={`w-full h-full rounded-full overflow-hidden flex items-center justify-center border-[2px] ${isDarkMode ? 'border-neutral-900' : 'border-white'} ${isFallbackLogo ? 'bg-gradient-to-br from-[#0866FF] to-[#00CFFF]' : 'bg-white dark:bg-[var(--color-surface-raised)]'}`}>
                {displayImg ? (
                  <img
                    src={displayImg}
                    alt="Logo"
                    onError={() => setImgError(true)}
                    className={`w-full h-full ${isFallbackLogo ? 'object-contain' : 'object-cover'} transition-all duration-500`}
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
          </Link>
        ) : (
          <Link to="/" onPointerEnter={() => preloadRoute('/')} onPointerDown={() => preloadRoute('/')} onTouchStart={() => preloadRoute('/')} onClick={(e) => handleNavClick('/', e)} className="flex items-center h-full z-[120] shrink-0 relative">
            <div 
              style={{ width: specs.logoSize, height: specs.logoSize, top: '50%', transform: 'translateY(-50%)', padding: specs.ringPadding }} 
              className="absolute rounded-full flex items-center justify-center bg-gradient-to-br from-[#0866FF] to-[#00CFFF] shadow-xl transition-all duration-500"
            >
              <div className={`w-full h-full rounded-full overflow-hidden flex items-center justify-center border-[2px] ${isDarkMode ? 'border-neutral-900' : 'border-white'} ${isFallbackLogo ? 'bg-gradient-to-br from-[#0866FF] to-[#00CFFF]' : 'bg-white dark:bg-[var(--color-surface-raised)]'}`}>
                {displayImg ? (
                  <img
                    src={displayImg}
                    alt="Logo"
                    onError={() => setImgError(true)}
                    className={`w-full h-full ${isFallbackLogo ? 'object-contain' : 'object-cover'} transition-all duration-500`}
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
                <span style={{ fontSize: specs.brandSize }} className="text-neutral-900 dark:text-white">{APP_CONFIG.brandLines[0]}</span>
                <span style={{ fontSize: specs.brandSize }} className="text-garage-blue">{APP_CONFIG.brandLines[1]}</span>
              </div>
            </div>
          </Link>
        )}

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden sm:flex items-center gap-6 lg:gap-8">
          {APP_CONFIG.nav.includes('home') && <Link to="/" onPointerEnter={() => preloadRoute('/')} onPointerDown={() => preloadRoute('/')} onTouchStart={() => preloadRoute('/')} onClick={(e) => handleNavClick('/', e)} className="relative flex flex-col md:flex-row items-center justify-center gap-1 font-bold transition-colors group">
            <Home size={specs.utilIcon} className={location.pathname === '/' ? 'text-blue-500' : 'text-neutral-400 dark:text-neutral-400 group-hover:text-blue-500'} />
            <span className={`text-[11px] md:text-[14px] font-bold uppercase tracking-[0.005em] ${location.pathname === '/' ? 'bg-gradient-to-br from-[#0866FF] to-[#00CFFF] bg-clip-text text-transparent' : 'text-neutral-400 dark:text-neutral-400 group-hover:bg-gradient-to-br group-hover:from-[#0866FF] group-hover:to-[#00CFFF] group-hover:bg-clip-text group-hover:text-transparent'}`}>HOME</span>
          </Link>}
          {navLinks.map((link) => {
            const isActive = location.pathname === link.to;
            const iconClass = isActive
              ? 'text-blue-500'
              : 'text-neutral-400 dark:text-neutral-400 group-hover:text-blue-500';
            const labelClass = isActive
              ? 'bg-gradient-to-br from-[#0866FF] to-[#00CFFF] bg-clip-text text-transparent'
              : 'text-neutral-400 dark:text-neutral-400 group-hover:bg-gradient-to-br group-hover:from-[#0866FF] group-hover:to-[#00CFFF] group-hover:bg-clip-text group-hover:text-transparent';
            return (
              <Link
                key={link.to}
                to={link.to}
                onPointerEnter={() => preloadRoute(link.to)}
                onTouchStart={() => preloadRoute(link.to)}
                onPointerDown={() => preloadRoute(link.to)}
                onFocus={() => preloadRoute(link.to)}
                onClick={(e) => handleNavClick(link.to, e)}
                className="relative flex flex-col md:flex-row items-center justify-center gap-1 font-bold transition-colors group"
              >
                <span className="relative inline-flex items-center justify-center">
                  {React.cloneElement(link.icon, { 
                    size: specs.utilIcon, 
                    className: `transition-colors ${iconClass}`
                  })}
                </span>
                <span className={`text-[11px] md:text-[14px] font-bold uppercase tracking-[0.005em] ${labelClass}`}>{link.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="flex items-center justify-end z-[120] ml-auto gap-2 lg:gap-4">
            <button
              onClick={handleOpenNotifications}
              className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-300"
              aria-label="Open notifications"
            >
              <Bell
                size={specs.utilIcon}
                className={`${isNotificationModalOpen ? 'text-blue-500 fill-blue-500' : (isDarkMode ? 'text-white' : 'text-neutral-900')} group-hover:text-garage-blue transition-all duration-300`}
              />
              {unseenNotificationCount > 0 && !isNotificationModalOpen && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-white bg-red-500 px-1 text-[9px] font-black leading-none text-white dark:border-neutral-900">
                  {unseenNotificationCount > 99 ? '99+' : unseenNotificationCount}
                </span>
              )}
            </button>

            <button key={user?.uid || 'guest'} onClick={() => { 
                if (isCartPath) {
                    window.dispatchEvent(new CustomEvent('toggleBasketView'));
                } else {
                    navigate('/cart');
                }
            }} onPointerEnter={() => preloadRoute('/cart')} onPointerDown={() => preloadRoute('/cart')} onTouchStart={() => preloadRoute('/cart')} className="p-2 relative group">
              {isAdmin && isAdminView ? (
                <ShelvingUnit
                  size={24} 
                  className={`${isCartPath ? 'text-garage-blue' : (isDarkMode ? 'text-white' : 'text-neutral-900')} group-hover:text-garage-blue transition-all duration-300`}
                />
              ) : (
                <ShoppingCart
                  size={specs.utilIcon} 
                  className={`${isCartPath ? 'text-garage-blue' : (isDarkMode ? 'text-white' : 'text-neutral-900')} group-hover:text-garage-blue transition-all duration-300`}
                />
              )}
              {activeBasket?.length > 0 && !isCartPath && <span className="absolute -top-1 -right-1 bg-gradient-to-br from-[#0866FF] to-[#00CFFF] text-white text-[10px]
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
                  className={`rounded-full p-[2px] transition-all duration-300 ${isProfileOpen ? 'bg-gradient-to-br from-[#0866FF] to-[#00CFFF] shadow-sm' : (isAdmin && isAdminView ? adminRingClass : 'bg-transparent group-hover:bg-gradient-to-br group-hover:from-[#0866FF] group-hover:to-[#00CFFF]')}`}
                >
                  <div className={`rounded-full overflow-hidden border-2 transition-colors ${isProfileOpen ? 'border-white dark:border-neutral-900' : (isAdmin && isAdminView ? 'border-white dark:border-neutral-900' : 'border-transparent group-hover:border-white dark:group-hover:border-neutral-900')}`}>
                    {(isAdmin && isAdminView) ? (
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
                      <CircleUserRound
                        size={specs.utilIcon - 4}
                        className={isProfileOpen
                          ? 'text-neutral-900 dark:text-white'
                          : (isDarkMode
                            ? 'text-white'
                            : 'text-neutral-900 group-hover:text-transparent group-hover:bg-gradient-to-br group-hover:from-[#0866FF] group-hover:to-[#00CFFF] group-hover:bg-clip-text')}
                      />
                    )}
                  </div>
                </div>
              </button>

              <AnimatePresence>
              {isProfileOpen && (
                <ProfileModalLayer enabled={isProfileFullscreen}>
                  <div
                    style={isProfileFullscreen ? profilePanelStyle : undefined}
                    className={isProfileFullscreen ? 'fixed z-[1000] overflow-hidden' : 'contents'}
                  >
                  <Motion.div
                    ref={profileModalRef}
                    style={isProfileFullscreen
                      ? (isProfileContentDragging ? { y: profilePanelDragY } : undefined)
                      : profilePanelStyle}
                    initial={isProfileFullscreen ? { y: '-100%' } : { y: -18, opacity: 0 }}
                    animate={isProfileFullscreen ? { y: 0 } : { y: 0, opacity: 1 }}
                    exit={isProfileFullscreen || !isDesktop ? { y: '-100%' } : { y: -18, opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    drag={isProfileFullscreen ? 'y' : false}
                    dragListener={false}
                    dragControls={profileDragControls}
                    dragConstraints={{ top: -420, bottom: 0 }}
                    dragElastic={{ top: 0, bottom: 0 }}
                    dragMomentum={false}
                    dragDirectionLock
                    onDragEnd={(event, info) => {
                      if (isProfileFullscreen && isProfileListAtEnd && (info.offset.y < -90 || info.velocity.y < -500)) {
                        setIsProfileOpen(false);
                      }
                    }}
                    className={`${isProfileFullscreen ? 'absolute inset-0 w-full max-w-none sm:ml-auto sm:max-w-sm' : 'fixed w-72'}`}
                  >
                  <div className={`${isProfileFullscreen ? 'flex h-full max-h-full flex-col rounded-b-[2.5rem]' : 'max-h-[calc(100dvh-5rem)] rounded-[2rem]'} overflow-hidden border ${isDarkMode ? 'border-white/10 bg-[var(--color-surface-raised)]' : 'border-black/10 bg-white'}`}>
                    <div
                      ref={profileScrollRef}
                      data-modal-scroll-container="profile"
                      onPointerDown={isProfileFullscreen ? handleProfileSurfacePointerDown : undefined}
                      onPointerMove={isProfileFullscreen ? handleProfileSurfacePointerMove : undefined}
                      onPointerUp={isProfileFullscreen ? finishProfileSurfaceGesture : undefined}
                      onPointerCancel={isProfileFullscreen ? finishProfileSurfaceGesture : undefined}
                      style={isProfileFullscreen
                        ? { touchAction: 'pan-y' }
                        : undefined}
                      className={isProfileFullscreen
                        ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y'
                        : 'max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain'}
                    >
                    <div className={isProfileFullscreen ? 'flex min-h-full flex-col' : undefined}>
                    <div className="p-6 flex flex-col items-center text-center space-y-3 border-b border-black/5 dark:border-white/5">
                      <div 
                        className="relative group cursor-pointer py-2"
                        data-panel-interactive="true"
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
                                  <div className={`w-14 h-14 rounded-full border-2 flex items-center justify-center bg-zinc-100 dark:bg-[var(--color-surface-raised)] text-neutral-400 ${isAdminView ? 'border-white dark:border-neutral-900' : 'border-transparent'}`}>
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
                                  <div className={`w-14 h-14 rounded-full border-2 flex items-center justify-center bg-zinc-100 dark:bg-[var(--color-surface-raised)] text-neutral-400 ${!isAdminView ? 'border-white dark:border-neutral-900' : 'border-transparent'}`}>
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
                              <div className="w-16 h-16 rounded-full border-2 border-white dark:border-neutral-900 flex items-center justify-center bg-zinc-100 dark:bg-[var(--color-surface-raised)] text-neutral-400">
                                <ContactRound size={40} />
                              </div>
                            )}
                          </div>
                        )}
                        
                        {isBanned && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">Banned</span>}
                      </div>
                      <div>
                        <h4 className="font-black italic uppercase tracking-tighter text-lg leading-none text-neutral-900 dark:text-white transition-all duration-300">
                          {(isAdmin && isPhotoHovered && !isAdminView) ? 'ENTER ADMIN MODE' : (isAdmin && isPhotoHovered && isAdminView) ? 'EXIT ADMIN MODE' : (isAdmin && isAdminView) ? 'ADMINISTRATOR MODE' : (user?.displayName || 'Guest')}
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
                              <button onClick={() => { setOperationsTab('shipping'); setIsOperationsOpen(true); setIsProfileOpen(false); }} className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-black/5 text-neutral-900'}`}>
                                <Truck size={18} className="opacity-40" />
                                <span className="text-[12px] font-black uppercase tracking-widest">Shipping &amp; Payment</span>
                              </button>
                            </>
                          ) : (
                            <button onClick={() => { if (!user) setLoginModalOpen(true); else setIsSettingsModalOpen(true); setIsProfileOpen(false); }} className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-black/5 text-neutral-900'}`}>
                              <Settings size={18} className="opacity-40" />
                              <span className="text-[12px] font-black uppercase tracking-widest">Account Settings</span>
                            </button>
                          )}
                          {user && (
                            <button onClick={() => { navigate('/notify-list'); setIsProfileOpen(false); }} className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-black/5 text-neutral-900'}`}>
                              <Bell size={18} className="opacity-40" />
                              <span className="text-[12px] font-black uppercase tracking-widest">{isAdminView ? 'OFFERS LIST' : 'SENT OFFERS'}</span>
                            </button>
                          )}
                          <button
                            onClick={handleOpenPolicies}
                            className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-black/5 text-neutral-900'}`}
                          >
                            <FileText size={18} className="opacity-40" />
                            <span className="text-[12px] font-black uppercase tracking-widest">Policies</span>
                          </button>
                          <button onClick={handleLogout} className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-colors ${originalAdminUser ? 'text-orange-500 hover:bg-orange-500/10' : 'text-red-500 hover:bg-red-500/10'}`}>
                            <LogOut size={18} />
                            <span className="text-[12px] font-black uppercase tracking-widest">
                              {originalAdminUser ? 'Exit Impersonation' : 'Logout'}
                            </span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={handleOpenPolicies}
                            className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-black/5 text-neutral-900'}`}
                          >
                            <FileText size={18} className="opacity-40" />
                            <span className="text-[12px] font-black uppercase tracking-widest">Policies</span>
                          </button>
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
                        </>
                      )}

                    </div>
                    {isProfileFullscreen && (
                      <div
                        aria-label="Drag up to close profile"
                        onPointerDown={isProfileListAtEnd ? startProfileDrag : undefined}
                        className={`min-h-0 flex-1 select-none ${isProfileListAtEnd ? 'touch-none cursor-grab active:cursor-grabbing' : ''}`}
                      />
                    )}
                    </div>
                    </div>

                    {isProfileFullscreen && (
                      <div
                        onPointerDown={isProfileListAtEnd ? startProfileDrag : undefined}
                        className={`flex min-h-12 w-full shrink-0 items-center justify-center pb-3 pt-2 ${isProfileListAtEnd ? 'cursor-grab touch-none active:cursor-grabbing' : ''}`}
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label="Drag up to close profile"
                          onPointerDown={(event) => {
                            if (!isProfileListAtEnd) return;
                            event.stopPropagation();
                            profileDragControls.start(event);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setIsProfileOpen(false);
                            }
                          }}
                          className="h-1.5 w-12 cursor-grab touch-none rounded-full bg-black/10 active:cursor-grabbing dark:bg-white/10"
                        />
                      </div>
                    )}
                  </div>
                  </Motion.div>
                  </div>
                </ProfileModalLayer>
              )}
              </AnimatePresence>
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
        {isMobileMiniNavbarEnabled && isMobile && !isStoriesManagerOpen && !isProfileOpen && !isNotificationModalOpen && location.pathname !== '/checkout' && (
          <div className={`fixed bottom-0 left-0 right-0 z-[100] transition-transform duration-300 ${showBottomNav ? 'translate-y-0' : 'translate-y-full'}`}>
            <div style={{ height: specs.h }} className={`flex items-center justify-around px-2 border-t ${isDarkMode ? 'bg-[var(--color-surface-raised)] border-white/10' : 'bg-white border-black/5'} shadow-2xl`}>
              <button onClick={(e) => handleNavClick('/', e)} className={`flex flex-col items-center justify-center gap-1 transition-colors ${location.pathname === '/' ? 'text-garage-blue' : 'text-neutral-600 dark:text-neutral-400'}`}>
                <Home size={20} />
                <span className="text-[10px] font-black uppercase tracking-[0.005em]">Home</span>
              </button>
              {navLinks.map((link) => {
                const isActive = location.pathname === link.to;
                const buttonClass = isActive
                  ? 'bg-gradient-to-br from-[#0866FF] to-[#00CFFF] bg-clip-text text-transparent'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-gradient-to-br hover:from-[#0866FF] hover:to-[#00CFFF] hover:bg-clip-text hover:text-transparent';
                return (
                  <button
                    key={link.to}
                    onPointerDown={() => preloadRoute(link.to)}
                    onTouchStart={() => preloadRoute(link.to)}
                    onClick={(e) => handleNavClick(link.to, e)}
                    className={`group flex flex-col items-center justify-center gap-1 transition-colors ${buttonClass}`}
                  >
                    <span className="relative inline-flex items-center justify-center">
                      {React.cloneElement(link.icon, { size: 20, className: isActive ? 'text-blue-500' : '' })}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-[0.005em]">{link.label}</span>
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
      orders={visibleNotifications}
      readVersions={notificationReadVersions}
      onOpenOrder={handleOpenNotificationOrder}
      onDismissNotification={handleDismissNotification}
      allowSwipeDismiss={!isDesktop}
      emptyLabel={isAdminNotificationView ? 'No admin updates yet' : 'No order updates yet'}
      isFullscreen={isProfileFullscreen}
      dimBackdrop={!isDesktop}
      navbarHeight={specs.h}
      bottomInset={fullscreenModalBottomInset}
      anchorTop={notificationAnchorTop}
    />

    <Suspense fallback={null}>
      {Boolean(user && isProfileIncomplete) && (
        <WelcomeModal 
          isOpen={Boolean(user && isProfileIncomplete)} 
          onClose={() => {}} 
          onSetup={() => { setIsSettingsModalOpen(true); }} 
        />
      )}

      {isSettingsModalOpen && (
        <AccountSettingsModal 
          isOpen={isSettingsModalOpen} 
          onClose={() => setIsSettingsModalOpen(false)} 
        />
      )}

      {isOperationsOpen && (
        <OperationsModal
          isOpen={isOperationsOpen}
          initialTab={operationsTab}
          onClose={() => setIsOperationsOpen(false)}
        />
      )}

      {isLoginModalOpen && (
        <AccountSettingsModal 
          isOpen={isLoginModalOpen} 
          onClose={() => setLoginModalOpen(false)} 
        />
      )}

      {isStoriesManagerOpen && (
        <StoryEditorModal
          isOpen={isStoriesManagerOpen}
          onClose={() => setIsStoriesManagerOpen(false)}
        />
      )}
    </Suspense>
  </>
);
}
