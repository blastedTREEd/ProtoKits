import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Maximize2, X, Plus, Upload, Image as ImageIcon, Loader2, Save, RotateCw, ZoomIn, BookImage, VenetianMask, Type as TypeOutline, Palette, ALargeSmall, BookOpen, Book, Hand, ChevronLeft, Calendar, Building2, MapPin } from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { useTheme } from '../../context/ThemeContext';
import { CustomDateTimePicker } from '../common/CustomDateTimePicker';

const FIRESTORE_DOC_LIMIT = 1048576;
const STORY_WARNING_PERCENT = 80;
const STORY_BACKGROUND_MAX_SIZE = 1440;
const STORY_STICKER_MAX_SIZE = 1600;
const STORY_IMAGE_QUALITY = 0.72;
const STORY_STICKER_QUALITY = 0.86;
const STORY_GLOW_COLORS = ['#0066ff', '#ff3b30', '#34c759', '#ffcc00', '#af52de', '#ff7a00', '#00c7be'];

function getRandomStoryColor() {
  return STORY_GLOW_COLORS[Math.floor(Math.random() * STORY_GLOW_COLORS.length)];
}

function getCurrentLocalDateTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function getStoryBackgroundImage(story) {
  return story?.backgroundImage || story?.image || '';
}

function normalizeStoryItems(items) {
  if (Array.isArray(items)) {
    const normalized = items.map((item) => String(item || '').trim());
    return normalized.length > 0 ? normalized : [''];
  }

  const value = String(items || '').trim();
  return value ? value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : [''];
}

function normalizeStoryLocation(story) {
  const city = String(story?.city || story?.town || story?.municipality || story?.cityTown || '').trim();
  const province = String(story?.province || '').trim();
  const zipCode = String(story?.zipCode || story?.zip || '').trim();
  if (city || province || zipCode) return { city, province, zipCode };

  const destination = String(story?.destination || '').trim();
  const destinationParts = destination.split(',').map((part) => part.trim()).filter(Boolean);
  const destinationZip = destinationParts.find((part) => /^\d{4}$/.test(part)) || '';
  const locationParts = destinationParts.filter((part) => part !== destinationZip);
  const [legacyCity = '', ...legacyProvince] = locationParts;
  return {
    city: legacyCity.trim(),
    province: legacyProvince.join(',').trim(),
    zipCode: destinationZip
  };
}

function normalizeStoryOrderIds(story) {
  const orderIds = story?.orderIds || story?.linkedOrderIds || [];
  return Array.isArray(orderIds)
    ? orderIds.map((orderId) => String(orderId || '').trim()).filter(Boolean)
    : [];
}

function getStoryOrderItems(order) {
  const orderItems = Array.isArray(order?.items) && order.items.length > 0
    ? order.items
    : [order];

  return orderItems
    .map((item) => (
      item?.name
      || item?.item
      || item?.kitDetails?.name
      || item?.projectData?.projectName
      || item?.projectData?.name
      || item?.itemName
      || [item?.brand, item?.specs?.line, item?.kitName].filter(Boolean).join(' ')
    ))
    .map((itemName) => String(itemName || '').trim())
    .filter(Boolean);
}

function getStoryOrderLocation(order) {
  const details = order?.receiverDetails || order?.deliveryData || order?.shippingAddress || order?.address || {};
  const placeDetails = order?.pickupDetails || order?.meetupDetails || {};
  const placeAddress = String(placeDetails.address || placeDetails.publicAddress || placeDetails.exactAddress || '').trim();
  const placeParts = placeAddress.split(',').map((part) => part.trim()).filter(Boolean);
  const placeZip = placeAddress.match(/(?:^|\D)(\d{4})\s*$/)?.[1] || '';
  const placeNonZipParts = placeZip && placeParts[placeParts.length - 1] === placeZip
    ? placeParts.slice(0, -1)
    : placeParts;

  return {
    city: String(details.city || details.town || details.municipality || details.cityTown || order?.city || order?.town || order?.municipality || placeDetails.city || placeDetails.town || placeDetails.municipality || (placeNonZipParts.length >= 2 ? placeNonZipParts[placeNonZipParts.length - 2] : '')).trim(),
    province: String(details.province || order?.province || placeDetails.province || (placeNonZipParts.length >= 2 ? placeNonZipParts[placeNonZipParts.length - 1] : '')).trim(),
    zipCode: String(details.zipCode || details.zip || order?.zipCode || order?.zip || placeDetails.zipCode || placeDetails.zip || placeZip || '').trim()
  };
}

function getStoryOrderPaidAmount(order) {
  return Number(order?.buyerPaid ?? order?.paidAmount ?? order?.amountPaid ?? 0) || 0;
}

function getStoryOrderTimestamp(order) {
  const value = order?.createdAt || order?.lastUpdated || order?.date;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeStorySticker(sticker, index) {
  return {
    id: sticker?.id || `sticker-${index}`,
    src: String(sticker?.src || ''),
    scale: Number.isFinite(Number(sticker?.scale)) ? Number(sticker.scale) : 1,
    rotation: Number.isFinite(Number(sticker?.rotation)) ? Number(sticker.rotation) : 0,
    position: {
      x: Number.isFinite(Number(sticker?.position?.x)) ? Number(sticker.position.x) : 0,
      y: Number.isFinite(Number(sticker?.position?.y)) ? Number(sticker.position.y) : 0
    },
    zoom: Number.isFinite(Number(sticker?.zoom)) ? Number(sticker.zoom) : 1,
    imageOffset: {
      x: Number.isFinite(Number(sticker?.imageOffset?.x)) ? Number(sticker.imageOffset.x) : 0,
      y: Number.isFinite(Number(sticker?.imageOffset?.y)) ? Number(sticker.imageOffset.y) : 0
    },
    type: sticker?.type === 'mask' ? 'mask' : 'polaroid'
  };
}

function normalizeStoryText(text, index) {
  return {
    id: text?.id || `text-${index}`,
    text: String(text?.text || ''),
    color: String(text?.color || '#ffffff'),
    fontSize: Number.isFinite(Number(text?.fontSize)) ? Number(text.fontSize) : 12,
    fontFamily: String(text?.fontFamily || 'sans-serif'),
    fontWeight: String(text?.fontWeight || 'bold'),
    rotation: Number.isFinite(Number(text?.rotation)) ? Number(text.rotation) : 0,
    scale: Number.isFinite(Number(text?.scale)) ? Number(text.scale) : 1,
    position: {
      x: Number.isFinite(Number(text?.position?.x)) ? Number(text.position.x) : 0,
      y: Number.isFinite(Number(text?.position?.y)) ? Number(text.position.y) : 0
    }
  };
}

async function compressImage(dataUrl, maxWidth = STORY_BACKGROUND_MAX_SIZE, quality = STORY_IMAGE_QUALITY) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else if (height > maxWidth) {
        width *= maxWidth / height;
        height = maxWidth;
      }

      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', quality),
        width: canvas.width,
        height: canvas.height
      });
    };
    img.onerror = () => resolve({ dataUrl, width: null, height: null });
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function StoryEditorModal({ isOpen, onClose }) {
  const { isDarkMode } = useTheme();
  const {
    addStory,
    updateStory,
    orders,
    isAdmin,
    user,
    subscribeOrders
  } = useStore();
  const ordersStatus = useStore((state) => state._datasetStatus?.orders || 'loading');

  const [mode, setMode] = useState('add'); // 'add' or 'edit'
  const [editingStory, setEditingStory] = useState(null);
  
  // Form states
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [items, setItems] = useState(['']);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [storyDate, setStoryDate] = useState(() => getCurrentLocalDateTime());
  const [value, setValue] = useState(() => getRandomStoryColor()); // Glow color used by story cards
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  // const [isSaving, setIsSaving] = useState(false);

  // --- LAYERED CANVAS WORKFLOW STATES ---
  const [backgroundImage, setBackgroundImage] = useState(''); 
  const [bgZoom, setBgZoom] = useState(1);
  const [bgRotation, setBgRotation] = useState(0);
  const [bgOffset, setBgOffset] = useState({ x: 0, y: 0 });
  const [bgImageSize, setBgImageSize] = useState(null);
  const [isBgSelected, setIsBgSelected] = useState(false);

  // Responsive state handler
  const [isDesktop, setIsDesktop] = useState(true);
  const [isSplitLayout, setIsSplitLayout] = useState(true);
  // const [isFramedModal, setIsFramedModal] = useState(true);
  const [editorView, setEditorView] = useState('canvas');
  // Unified Tool Selection State (Stickers and Text layers)
  const [activeDesktopTool, setActiveDesktopTool] = useState(null); // 'rotate', 'zoom', 'resize', 'pan', null

  // State to manage whether the text color palette drawer is open
  const [showColorPaletteIdx, setShowColorPaletteIdx] = useState(null);

  // --- MULTI-TOUCH & DESKTOP TRACKING REFS ---
  const pointerCacheRef = useRef(new Map());
  const initialGestureRef = useRef(null);
  const bgTapRef = useRef(null);
  const buttonLongPressTimerRef = useRef(null);
  
  const [stickers, setStickers] = useState([]); 
  const [selectedStickerIndex, setSelectedStickerIndex] = useState(null);

  const [texts, setTexts] = useState([]);
  const [selectedTextIndex, setSelectedTextIndex] = useState(null);

  const [uploadType, setUploadType] = useState('polaroid');

  const bgFileInputRef = useRef(null);
  const stickerFileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const appliedOrderSelectionRef = useRef('');

  // const [activeHandle, setActiveHandle] = useState(null); 

  // Colors array including specified brown, gray, black, white + highlights
  const availableColors = [
    '#ffffff', '#000000', '#8B4513', '#808080', 
    '#ff3b30', '#34c759', '#007aff', '#ffcc00', '#af52de'
  ];

  const fontsList = ['sans-serif', 'serif', 'monospace', 'Impact'];

  const clamp = (num, min, max) => Math.max(min, Math.min(max, num));
  const getDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const getAngle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
  const getPointerPoint = (e) => ({ x: e.clientX, y: e.clientY });
  const getCanvasSize = (canvasRect) => ({
    width: canvasRect?.width || 9,
    height: canvasRect?.height || 16
  });

  const getBgBaseSize = (canvasRect) => {
    const canvasSize = getCanvasSize(canvasRect);

    if (!bgImageSize?.width || !bgImageSize?.height) {
      return { width: canvasSize.width, height: canvasSize.height };
    }

    const imageAspect = bgImageSize.width / bgImageSize.height;
    const canvasAspect = canvasSize.width / canvasSize.height;

    if (imageAspect > canvasAspect) {
      return { width: canvasSize.height * imageAspect, height: canvasSize.height };
    }

    return { width: canvasSize.width, height: canvasSize.width / imageAspect };
  };

  const getBgRotationCoverScale = (canvasRect, rotation = bgRotation || 0) => {
    const canvasSize = getCanvasSize(canvasRect);
    const baseSize = getBgBaseSize(canvasRect);

    if (!baseSize.width || !baseSize.height) return 1;

    const rad = (Math.abs(rotation) * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));

    const requiredWidthToCover = canvasSize.width * cos + canvasSize.height * sin;
    const requiredHeightToCover = canvasSize.width * sin + canvasSize.height * cos;

    const scaleX = requiredWidthToCover / baseSize.width;
    const scaleY = requiredHeightToCover / baseSize.height;

    return Math.max(1, scaleX, scaleY);
  };

  const getBgTotalScale = (canvasRect, zoom = bgZoom || 1, rotation = bgRotation || 0) =>
    zoom * getBgRotationCoverScale(canvasRect, rotation);

  const getBgPanLimits = (canvasRect, zoom = bgZoom || 1, rotation = bgRotation || 0) => {
    const canvasSize = getCanvasSize(canvasRect);
    const baseSize = getBgBaseSize(canvasRect);
    const totalScale = getBgTotalScale(canvasRect, zoom, rotation);
    const rad = (rotation * Math.PI) / 180;
    const rotatedWidth = (Math.abs(Math.cos(rad)) * baseSize.width + Math.abs(Math.sin(rad)) * baseSize.height) * totalScale;
    const rotatedHeight = (Math.abs(Math.sin(rad)) * baseSize.width + Math.abs(Math.cos(rad)) * baseSize.height) * totalScale;

    return {
      x: Math.max(0, (rotatedWidth - canvasSize.width) / 2),
      y: Math.max(0, (rotatedHeight - canvasSize.height) / 2)
    };
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    const scrollY = window.scrollY;
    const previousBodyStyles = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overscrollBehavior: document.body.style.overscrollBehavior
    };
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyStyles.overflow;
      document.body.style.position = previousBodyStyles.position;
      document.body.style.top = previousBodyStyles.top;
      document.body.style.width = previousBodyStyles.width;
      document.body.style.overscrollBehavior = previousBodyStyles.overscrollBehavior;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isAdmin || typeof subscribeOrders !== 'function') return undefined;

    return subscribeOrders({
      uid: user?.uid,
      isAdminMode: true
    });
  }, [isAdmin, isOpen, subscribeOrders, user?.uid]);

  useEffect(() => {
    const checkDevice = () => {
      const split = window.matchMedia('(min-width: 1024px)').matches;
      setIsDesktop(split);
      setIsSplitLayout(split);
      // setIsFramedModal(split);
    };
    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  // const resetLayerControls = () => {
  //   setSelectedStickerIndex(null);
  //   setSelectedTextIndex(null);
  //   setActiveDesktopTool(null);
  //   setShowColorPaletteIdx(null);
  // };

  const resetBgControls = () => {
    setIsBgSelected(false);
  };

  const updateSelectedText = (key, val) => {
    if (selectedTextIndex === null) return;
    setTexts((prev) =>
      prev.map((t, idx) => (idx === selectedTextIndex ? { ...t, [key]: val } : t))
    );
  };

  const cycleFont = (currentIndex) => {
    setActiveDesktopTool(null);
    const currentText = texts[currentIndex];
    const nextIdx = (fontsList.indexOf(currentText.fontFamily) + 1) % fontsList.length;
    setTexts((prev) =>
      prev.map((t, idx) => (idx === currentIndex ? { ...t, fontFamily: fontsList[nextIdx] } : t))
    );
  };

  const cycleFontSize = (currentIndex) => {
    setActiveDesktopTool(null);
    const currentText = texts[currentIndex];
    let nextSize = (currentText.fontSize || 12) + 2;
    
    if (nextSize > 30 || nextSize < 12) {
      nextSize = 12;
    }

    setTexts((prev) =>
      prev.map((t, idx) => (idx === currentIndex ? { ...t, fontSize: nextSize } : t))
    );
  };

  const deleteSelectedSticker = () => {
    if (selectedStickerIndex === null) return;
    setStickers((prev) => prev.filter((_, idx) => idx !== selectedStickerIndex));
    setSelectedStickerIndex(null);
    setActiveDesktopTool(null);
  };

  const deleteSelectedText = () => {
    if (selectedTextIndex === null) return;
    setTexts((prev) => prev.filter((_, idx) => idx !== selectedTextIndex));
    setSelectedTextIndex(null);
    setShowColorPaletteIdx(null);
    setActiveDesktopTool(null);
  };

  const startControlLongPress = (type, actionKey) => {
    if (buttonLongPressTimerRef.current) clearTimeout(buttonLongPressTimerRef.current.timer);
    
    buttonLongPressTimerRef.current = {
      triggered: false,
      timer: setTimeout(() => {
        if (buttonLongPressTimerRef.current) {
          buttonLongPressTimerRef.current.triggered = true;
        }
        
        if (type === 'sticker' && selectedStickerIndex !== null) {
          setStickers(prev => prev.map((s, idx) => {
            if (idx !== selectedStickerIndex) return s;
            if (actionKey === 'rotate') return { ...s, rotation: 0 };
            if (actionKey === 'resize') return { ...s, scale: 1 };
            if (actionKey === 'zoom') return { ...s, zoom: 1 };
            if (actionKey === 'pan') return { ...s, imageOffset: { x: 0, y: 0 } };
            return s;
          }));
        } else if (type === 'text' && selectedTextIndex !== null) {
          setTexts(prev => prev.map((t, idx) => {
            if (idx !== selectedTextIndex) return t;
            if (actionKey === 'rotate') return { ...t, rotation: 0 };
            return t;
          }));
        } else if (type === 'background') {
          if (actionKey === 'rotate') setBgRotation(0);
          if (actionKey === 'zoom') {
            setBgZoom(1);
            setBgOffset({ x: 0, y: 0 });
          }
          if (actionKey === 'pan') setBgOffset({ x: 0, y: 0 });
        }
      }, 500)
    };
  };

  const endControlLongPress = (callback) => {
    if (buttonLongPressTimerRef.current) {
      clearTimeout(buttonLongPressTimerRef.current.timer);
      if (!buttonLongPressTimerRef.current.triggered) {
        callback();
      }
      buttonLongPressTimerRef.current = null;
    }
  };

  const resetControlLongPress = () => {
    if (buttonLongPressTimerRef.current) {
      clearTimeout(buttonLongPressTimerRef.current.timer);
      buttonLongPressTimerRef.current = null;
    }
  };

  const getControlButtonClass = (tool, activeClass) =>
    `p-2 rounded-xl transition-all ${activeDesktopTool === tool ? activeClass : 'text-neutral-400 hover:text-white'} disabled:opacity-20 disabled:hover:bg-transparent`;

  const renderLongPressToolButton = ({ type, tool, icon, activeClass, disabled = false, title }) => (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onPointerDown={() => startControlLongPress(type, tool)}
      onPointerUp={() => endControlLongPress(() => setActiveDesktopTool(activeDesktopTool === tool ? null : tool))}
      onPointerLeave={resetControlLongPress}
      className={getControlButtonClass(tool, activeClass)}
    >
      {icon}
    </button>
  );

  const renderLayerControls = () => {
    const selectedSticker = selectedStickerIndex !== null ? stickers[selectedStickerIndex] : null;

    if (isBgSelected) {
      const hasStickerLayers = stickers.length > 0;

      return (
        <Motion.div
          initial={{ opacity: 0, y: 15, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 15, x: '-50%' }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-neutral-900/95 backdrop-blur-md px-4 py-2.5 rounded-2xl flex flex-col items-center gap-1.5 border border-white/10 shadow-2xl z-[130] text-white min-w-[210px]"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2" data-handle="true">
            {renderLongPressToolButton({
              type: 'background',
              tool: 'rotate',
              icon: <RotateCw size={15} />,
              activeClass: 'bg-green-500 text-white',
              title: 'Rotate story image'
            })}
            {renderLongPressToolButton({
              type: 'background',
              tool: 'zoom',
              icon: <ZoomIn size={15} />,
              activeClass: 'bg-orange-500 text-white',
              title: 'Zoom story image'
            })}
            {renderLongPressToolButton({
              type: 'background',
              tool: 'pan',
              icon: <Hand size={15} />,
              activeClass: 'bg-orange-600 text-white',
              title: hasStickerLayers ? 'Pan story image' : 'Pan is always available without stickers'
            })}
            <div className="w-[1px] h-4 bg-white/20 mx-1" />
            <button
              type="button"
              title="Back to stickers"
              onClick={() => {
                setIsBgSelected(false);
                setActiveDesktopTool(null);
              }}
              className="p-2 rounded-xl text-neutral-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
          </div>
        </Motion.div>
      );
    }

    if (selectedTextIndex !== null) {
      return (
        <Motion.div
          initial={{ opacity: 0, y: 15, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 15, x: '-50%' }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-neutral-900/95 backdrop-blur-md px-4 py-2.5 rounded-2xl flex flex-col items-center gap-1.5 border border-white/10 shadow-2xl z-[130] text-white min-w-[180px]"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {showColorPaletteIdx === selectedTextIndex && (
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl mb-1 border border-white/5 overflow-x-auto max-w-[210px] scrollbar-none">
              {availableColors.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => { updateSelectedText('color', hex); setShowColorPaletteIdx(null); setActiveDesktopTool(null); }}
                  className={`w-4 h-4 rounded-full flex-shrink-0 border transition-transform hover:scale-110 ${texts[selectedTextIndex]?.color === hex ? 'border-white scale-105 ring-1 ring-garage-blue' : 'border-black/20'}`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          )}
          <div className="flex items-center gap-2" data-handle="true">
            {renderLongPressToolButton({
              type: 'text',
              tool: 'rotate',
              icon: <RotateCw size={15} />,
              activeClass: 'bg-green-500 text-white',
              title: 'Rotate text'
            })}
            <button type="button" onClick={() => cycleFont(selectedTextIndex)} className="p-2 rounded-xl text-neutral-300 hover:bg-white/10 hover:text-white transition-colors"><TypeOutline size={15} /></button>
            <button type="button" onClick={() => cycleFontSize(selectedTextIndex)} className="p-2 rounded-xl text-blue-400 hover:bg-white/10 transition-colors"><ALargeSmall size={15} /></button>
            <button type="button" onClick={() => { setShowColorPaletteIdx(showColorPaletteIdx === selectedTextIndex ? null : selectedTextIndex); setActiveDesktopTool(null); }} className={`p-2 rounded-xl transition-all ${showColorPaletteIdx === selectedTextIndex ? 'bg-amber-500 text-white' : 'text-amber-400 hover:bg-white/10'}`}><Palette size={15} /></button>
            <div className="w-[1px] h-4 bg-white/20 mx-0.5" />
            <button type="button" onClick={deleteSelectedText} className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"><X size={15} /></button>
          </div>
        </Motion.div>
      );
    }

    if (selectedStickerIndex !== null && selectedSticker) {
      return (
        <Motion.div
          initial={{ opacity: 0, y: 15, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 15, x: '-50%' }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-neutral-900/95 backdrop-blur-md px-4 py-2.5 rounded-2xl flex flex-col items-center gap-1.5 border border-white/10 shadow-2xl z-[130] text-white min-w-[210px]"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2" data-handle="true">
            {renderLongPressToolButton({
              type: 'sticker',
              tool: 'rotate',
              icon: <RotateCw size={15} />,
              activeClass: 'bg-green-500 text-white',
              title: 'Rotate sticker'
            })}
            {renderLongPressToolButton({
              type: 'sticker',
              tool: 'resize',
              icon: <Maximize2 size={15} />,
              activeClass: 'bg-blue-500 text-white',
              title: 'Resize sticker'
            })}
            {renderLongPressToolButton({
              type: 'sticker',
              tool: 'zoom',
              icon: <ZoomIn size={15} />,
              activeClass: 'bg-orange-500 text-white',
              title: 'Zoom sticker image'
            })}
            {renderLongPressToolButton({
              type: 'sticker',
              tool: 'pan',
              icon: <Hand size={15} />,
              activeClass: 'bg-orange-600 text-white',
              disabled: (selectedSticker.zoom || 1) <= 1,
              title: 'Pan sticker image'
            })}
            <div className="w-[1px] h-4 bg-white/20 mx-1" />
            <button type="button" onClick={() => deleteSelectedSticker()} className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"><X size={15} /></button>
          </div>
        </Motion.div>
      );
    }

    return null;
  };

const handleBgPointerDown = (e) => {
  if (!backgroundImage) return;
  e.stopPropagation();

  // A layer tool owns the gesture while a sticker/text layer is selected.
  // Do not allow a tap on the wallpaper to steal focus from that layer, but
  // still let the wallpaper start the tool gesture ("drag outside" behavior).
  const hasSelectedLayer = selectedStickerIndex !== null || selectedTextIndex !== null;
  const hasActiveLayerTool = !isBgSelected
    && activeDesktopTool !== null
    && hasSelectedLayer;

  // 1. Huwag mag-trigger kung handle ng UI ang na-tap
  if (e.target.closest('[data-handle="true"]')) return;

  // 2. I-check kung sticker o text ang na-tap (bago natin i-reset)
  const clickedLayer = e.target.closest('.sticker-container') || e.target.closest('.text-container');
  const wasBgSelected = isBgSelected;
  
  // 3. FORCE DESELECT: Kung background ang na-tap, i-reset ang layers
  if (!clickedLayer && !hasActiveLayerTool) {
    setSelectedStickerIndex(null);
    setSelectedTextIndex(null);
    if (!wasBgSelected) setActiveDesktopTool(null);
    setIsBgSelected(true);
  }

  bgTapRef.current = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    moved: false,
    wasSelected: isBgSelected
  };

  // 4. Pointer capture at caching
  const targetEl = canvasRef.current;
  if (targetEl && e.target.setPointerCapture) {
    e.target.setPointerCapture(e.pointerId);
  }
  pointerCacheRef.current.set(e.pointerId, getPointerPoint(e));

  // 5. Gesture Logic (Gamit ang updated selection states)
  const activePointers = Array.from(pointerCacheRef.current.values());
  const hasActiveLayer = (Boolean(clickedLayer) || hasActiveLayerTool) && hasSelectedLayer;
  const hasActiveTool = activeDesktopTool !== null;

  // Siguraduhin na kung may active layer, ang pan/gesture ay para sa layer
  if (activePointers.length === 1) {
    if (hasActiveLayer && hasActiveTool) {
      initialGestureRef.current = {
        mode: 'layer-swipe',
        startX: activePointers[0].x,
        startY: activePointers[0].y,
        startStickerState: selectedStickerIndex !== null ? { ...stickers[selectedStickerIndex] } : null,
        startTextState: selectedTextIndex !== null ? { ...texts[selectedTextIndex] } : null
      };
    } else {
      // Kung walang active layer, pan mode para sa background
      const rect = canvasRef.current?.getBoundingClientRect();
      const canvasCenter = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : getPointerPoint(e);
      const hasStickerLayers = stickers.length > 0;
      const canPanBackground = !hasStickerLayers || activeDesktopTool === 'pan';
      
      if (wasBgSelected && (activeDesktopTool === 'rotate' || activeDesktopTool === 'zoom')) {
        initialGestureRef.current = {
          mode: 'background-tool',
          startX: activePointers[0].x,
          startY: activePointers[0].y,
          startZoom: bgZoom || 1,
          startRotation: bgRotation || 0,
          startOffset: { ...bgOffset }
        };
      } else if (isDesktop && e.shiftKey) {
        initialGestureRef.current = {
          mode: 'rotate-desktop',
          center: canvasCenter,
          startAngle: getAngle(canvasCenter, activePointers[0]),
          startRotation: bgRotation || 0
        };
      } else if (canPanBackground) {
        initialGestureRef.current = {
          mode: 'pan',
          startX: activePointers[0].x,
          startY: activePointers[0].y,
          startOffset: { ...bgOffset }
        };
      } else {
        initialGestureRef.current = null;
      }
    }
  } else if (activePointers.length === 2) {
    const p1 = activePointers[0];
    const p2 = activePointers[1];
    initialGestureRef.current = {
      mode: 'pinch',
      startDistance: Math.max(1, getDistance(p1, p2)),
      startAngle: getAngle(p1, p2),
      startZoom: bgZoom || 1,
      startRotation: bgRotation || 0
    };
  }
};

  const handleBgPointerMove = (e) => {
    if (!backgroundImage || !initialGestureRef.current) return;
    if (!pointerCacheRef.current.has(e.pointerId)) return;

    if (bgTapRef.current?.pointerId === e.pointerId) {
      const movedDistance = Math.hypot(e.clientX - bgTapRef.current.startX, e.clientY - bgTapRef.current.startY);
      if (movedDistance > 4) {
        bgTapRef.current.moved = true;
      }
    }

    pointerCacheRef.current.set(e.pointerId, getPointerPoint(e));
    const gesture = initialGestureRef.current;
    const activePointers = Array.from(pointerCacheRef.current.values());

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const canvasW = canvasRect?.width || 300;

    if (gesture.mode === 'layer-swipe' && activePointers.length === 1) {
      const deltaX = activePointers[0].x - gesture.startX;
      const deltaY = activePointers[0].y - gesture.startY;
      
      if (selectedStickerIndex !== null) {
        setStickers(prev => prev.map((s, i) => {
          if (i !== selectedStickerIndex) return s;
          
          let nextScale = s.scale;
          let nextZoom = s.zoom;
          let nextRotation = s.rotation;
          let nextImageOffset = { ...s.imageOffset };

          const startSticker = gesture.startStickerState || s;

          if (activeDesktopTool === 'rotate') {
            nextRotation = (startSticker.rotation || 0) + deltaY * 0.5;
          }
          if (activeDesktopTool === 'resize') {
            const scaleChange = -deltaY * 0.005;
            nextScale = Math.max(0.2, (startSticker.scale || 1) + scaleChange);
          }
          if (activeDesktopTool === 'zoom') {
            const zoomChange = -deltaY * 0.01;
            nextZoom = clamp((startSticker.zoom || 1) + zoomChange, 1, 5);
            
            const stickerFrameSize = canvasW * 0.5;
            const maxOffsetX = Math.max(0, (stickerFrameSize * nextZoom - stickerFrameSize) / 2) / nextZoom;
            const maxOffsetY = Math.max(0, (stickerFrameSize * nextZoom - stickerFrameSize) / 2) / nextZoom;

            nextImageOffset.x = clamp(s.imageOffset?.x || 0, -maxOffsetX, maxOffsetX);
            nextImageOffset.y = clamp(s.imageOffset?.y || 0, -maxOffsetY, maxOffsetY);
          }
          if (activeDesktopTool === 'pan') {
            const currentZoom = startSticker.zoom || 1;
            const rawX = (startSticker.imageOffset?.x || 0) + deltaX / currentZoom;
            const rawY = (startSticker.imageOffset?.y || 0) + deltaY / currentZoom;

            const stickerFrameSize = canvasW * 0.5;
            const maxOffsetX = Math.max(0, (stickerFrameSize * currentZoom - stickerFrameSize) / 2) / currentZoom;
            const maxOffsetY = Math.max(0, (stickerFrameSize * currentZoom - stickerFrameSize) / 2) / currentZoom;

            nextImageOffset.x = clamp(rawX, -maxOffsetX, maxOffsetX);
            nextImageOffset.y = clamp(rawY, -maxOffsetY, maxOffsetY);
          }

          const maxAllowedScale = 1.6;
          if (nextScale > maxAllowedScale) {
            nextScale = maxAllowedScale;
          }

          return { 
            ...s, 
            rotation: nextRotation,
            scale: nextScale,
            zoom: nextZoom,
            imageOffset: nextImageOffset
          };
        }));
      }
      
      if (selectedTextIndex !== null) {
        setTexts(prev => prev.map((txt, i) => {
          if (i !== selectedTextIndex) return txt;
          
          if (activeDesktopTool === 'rotate') {
            const degChange = deltaY * 0.5;
            return { ...txt, rotation: (gesture.startTextState.rotation || 0) + degChange };
          }
          return txt;
        }));
      }
      return;
    }

    if (gesture.mode === 'background-tool' && activePointers.length === 1) {
      const deltaY = activePointers[0].y - gesture.startY;

      if (activeDesktopTool === 'rotate') {
        const nextRotation = (gesture.startRotation || 0) + deltaY * 0.5;
        setBgRotation(nextRotation);

        if (canvasRect) {
          const limits = getBgPanLimits(canvasRect, bgZoom || 1, nextRotation);
          setBgOffset((prev) => ({
            x: clamp(prev.x, -limits.x, limits.x),
            y: clamp(prev.y, -limits.y, limits.y)
          }));
        }
      }

      if (activeDesktopTool === 'zoom') {
        const zoomChange = -deltaY * 0.01;
        const nextZoom = clamp((gesture.startZoom || 1) + zoomChange, 1, 5);
        setBgZoom(nextZoom);

        if (canvasRect) {
          const limits = getBgPanLimits(canvasRect, nextZoom, bgRotation || 0);
          setBgOffset((prev) => ({
            x: clamp(prev.x, -limits.x, limits.x),
            y: clamp(prev.y, -limits.y, limits.y)
          }));
        }
      }

      return;
    }

    if (gesture.mode === 'pan' && activePointers.length === 1) {
      if (stickers.length > 0 && activeDesktopTool !== 'pan') return;

      if (isDesktop && e.shiftKey) {
        const rect = canvasRef.current?.getBoundingClientRect();
        const canvasCenter = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : activePointers[0];
        initialGestureRef.current = {
          mode: 'rotate-desktop',
          center: canvasCenter,
          startAngle: getAngle(canvasCenter, activePointers[0]),
          startRotation: bgRotation || 0
        };
        return;
      }

      const dx = activePointers[0].x - gesture.startX;
      const dy = activePointers[0].y - gesture.startY;

      const limits = getBgPanLimits(canvasRect);

      const newX = gesture.startOffset.x + dx;
      const newY = gesture.startOffset.y + dy;

      setBgOffset({
        x: clamp(newX, -limits.x, limits.x),
        y: clamp(newY, -limits.y, limits.y)
      });

    } else if (gesture.mode === 'rotate-desktop' && activePointers.length === 1) {
      if (isDesktop && !e.shiftKey) {
        initialGestureRef.current = {
          mode: 'pan',
          startX: activePointers[0].x,
          startY: activePointers[0].y,
          startOffset: { ...bgOffset }
        };
        return;
      }

      const currentAngle = getAngle(gesture.center, activePointers[0]);
      const angleDiff = currentAngle - gesture.startAngle;
      const nextRotation = (gesture.startRotation + angleDiff); 
      setBgRotation(nextRotation);

      if (canvasRect) {
        const limits = getBgPanLimits(canvasRect, bgZoom || 1, nextRotation);
        setBgOffset((prev) => ({
          x: clamp(prev.x, -limits.x, limits.x),
          y: clamp(prev.y, -limits.y, limits.y)
        }));
      }

    } else if (gesture.mode === 'pinch' && activePointers.length === 2) {
      const p1 = activePointers[0];
      const p2 = activePointers[1];

      const currentDistance = getDistance(p1, p2);
      const currentAngle = getAngle(p1, p2);

      const distanceRatio = currentDistance / gesture.startDistance;
      const nextZoom = clamp(gesture.startZoom * distanceRatio, 1, 5);

      const angleDiff = currentAngle - gesture.startAngle;
      const nextRotation = (gesture.startRotation + angleDiff); 

      setBgZoom(nextZoom);
      setBgRotation(nextRotation);

      if (canvasRect) {
        const limits = getBgPanLimits(canvasRect, nextZoom, nextRotation);
        setBgOffset((prev) => ({
          x: clamp(prev.x, -limits.x, limits.x),
          y: clamp(prev.y, -limits.y, limits.y)
        }));
      }
    }
  };

  const handleBgPointerUp = (e) => {
    if (e.target && e.target.releasePointerCapture) {
      e.target.releasePointerCapture(e.pointerId);
    }
    const tapState = bgTapRef.current;
    pointerCacheRef.current.delete(e.pointerId);

    if (pointerCacheRef.current.size === 0) {
      initialGestureRef.current = null;
      
      if (tapState?.pointerId === e.pointerId && !tapState.moved) {
        if (selectedStickerIndex === null && selectedTextIndex === null) {
          if (tapState.wasSelected) {
            setIsBgSelected(false);
          }
        }
      }
      bgTapRef.current = null;
    } else if (pointerCacheRef.current.size === 1) {
      const remainingPointer = Array.from(pointerCacheRef.current.values())[0];
      
      initialGestureRef.current = {
        mode: 'pan',
        startX: remainingPointer.x,
        startY: remainingPointer.y,
        startOffset: { ...bgOffset }
      };
    }
  };

  const handleImageWheel = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isBgSelected || !backgroundImage) return;
    const zoomStep = e.deltaY < 0 ? 0.1 : -0.1;
    
    setBgZoom(prev => {
      const nextZoom = clamp(prev + zoomStep, 1, 5);
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      const limits = getBgPanLimits(canvasRect, nextZoom);

      setBgOffset(prevOffset => ({
        x: clamp(prevOffset.x, -limits.x, limits.x),
        y: clamp(prevOffset.y, -limits.y, limits.y)
      }));
      return nextZoom;
    });
  };

  const resetForm = useCallback(() => {
    setEditingStory(null);
    setLabel('');
    setDescription('');
    setCity('');
    setProvince('');
    setZipCode('');
    setItems(['']);
    setSelectedOrderIds([]);
    setOrderSearch('');
    appliedOrderSelectionRef.current = '';
    setStoryDate(getCurrentLocalDateTime());
    setValue(getRandomStoryColor());
    setBackgroundImage('');
    setStickers([]);
    setSelectedStickerIndex(null);
    setTexts([]);
    setSelectedTextIndex(null);
    setMode('add');
    // setActiveHandle(null);
    setActiveDesktopTool(null);
    setShowColorPaletteIdx(null);
    setBgZoom(1);
    setBgRotation(0);
    setBgOffset({ x: 0, y: 0 });
    setBgImageSize(null);
    setIsBgSelected(false);
    setEditorView('canvas');
    pointerCacheRef.current.clear();
    initialGestureRef.current = null;
  }, []);

  const handleEditClick = useCallback((story) => {
    setEditingStory(story);
    setLabel(story.label || '');
    setDescription(story.description || '');
    const location = normalizeStoryLocation(story);
    setCity(location.city);
    setProvince(location.province);
    setZipCode(location.zipCode);
    setItems(normalizeStoryItems(story.items));
    setSelectedOrderIds(normalizeStoryOrderIds(story));
    setOrderSearch('');
    appliedOrderSelectionRef.current = '';
    setStoryDate(story.storyDate || getCurrentLocalDateTime());
    setValue(story.value || getRandomStoryColor());
    
    setBackgroundImage(getStoryBackgroundImage(story));
    setBgZoom(story.bgZoom || 1);
    setBgRotation(story.bgRotation || 0);
    setBgOffset(story.bgOffset || { x: 0, y: 0 });
    setBgImageSize(story.bgImageSize || null);
    setIsBgSelected(false);
    const normalizedStickers = (story.stickers || []).map(normalizeStorySticker).filter((sticker) => sticker.src);
    const normalizedTexts = (story.texts || []).map(normalizeStoryText);
    setStickers(normalizedStickers);
    setTexts(normalizedTexts);
    
    setSelectedStickerIndex(normalizedStickers.length > 0 ? 0 : null);
    setSelectedTextIndex(normalizedTexts.length > 0 ? 0 : null);
    setActiveDesktopTool(null);
    setShowColorPaletteIdx(null);
    setEditorView('canvas');
    
    setMode('edit');
  }, []);

  const selectableOrders = useMemo(() => (
    [...(orders || [])]
      .filter((order) => order?.id)
      .sort((a, b) => getStoryOrderTimestamp(b) - getStoryOrderTimestamp(a))
  ), [orders]);

  const filteredOrders = useMemo(() => {
    const query = orderSearch.trim().toLowerCase();
    if (!query) return selectableOrders;

    return selectableOrders.filter((order) => {
      const location = getStoryOrderLocation(order);
      const searchableText = [
        order.orderId,
        order.id,
        order.buyerName,
        order.status,
        location.city,
        location.province,
        location.zipCode,
        ...getStoryOrderItems(order)
      ].filter(Boolean).join(' ').toLowerCase();
      return searchableText.includes(query);
    });
  }, [orderSearch, selectableOrders]);

  const applySelectedOrders = useCallback((orderIds, sourceOrders = orders) => {
    const selectedOrders = (sourceOrders || []).filter((order) => (
      orderIds.includes(String(order.id)) || orderIds.includes(String(order.orderId || ''))
    ));
    const selectedItems = [...new Set(selectedOrders.flatMap(getStoryOrderItems))];
    const selectedLocations = selectedOrders.map(getStoryOrderLocation);
    const cities = [...new Set(selectedLocations.map((location) => location.city).filter(Boolean))];
    const provinces = [...new Set(selectedLocations.map((location) => location.province).filter(Boolean))];
    const zipCodes = [...new Set(selectedLocations.map((location) => location.zipCode).filter(Boolean))];

    setItems(selectedItems.length > 0 ? selectedItems : ['']);
    setCity(cities.join(', '));
    setProvince(provinces.join(', '));
    setZipCode(zipCodes.join(', '));
  }, [orders]);

  const handleOrderSelectionChange = useCallback((orderId) => {
    const normalizedOrderId = String(orderId);
    const nextOrderIds = selectedOrderIds.includes(normalizedOrderId)
      ? selectedOrderIds.filter((id) => id !== normalizedOrderId)
      : [...selectedOrderIds, normalizedOrderId];

    setSelectedOrderIds(nextOrderIds);
    appliedOrderSelectionRef.current = nextOrderIds.join('|');
    applySelectedOrders(nextOrderIds);
  }, [applySelectedOrders, selectedOrderIds]);

  useEffect(() => {
    if (!isOpen || selectedOrderIds.length === 0 || selectableOrders.length === 0) return;

    const selectionKey = selectedOrderIds.join('|');
    if (appliedOrderSelectionRef.current === selectionKey) return;

    applySelectedOrders(selectedOrderIds, selectableOrders);
    appliedOrderSelectionRef.current = selectionKey;
  }, [applySelectedOrders, isOpen, selectableOrders, selectedOrderIds]);

  useEffect(() => {
    const handleOpenRequest = (event) => {
      const request = event.detail || {};

      if (request.mode === 'add') {
        resetForm();
        setMode('add');
      } else if (request.mode === 'edit' && request.story) {
        handleEditClick(request.story);
      }
    };

    window.addEventListener('openStoriesManager', handleOpenRequest);
    return () => window.removeEventListener('openStoriesManager', handleOpenRequest);
  }, [handleEditClick, resetForm]);

  const storyPayload = useMemo(() => ({
    label: label.trim(),
    description: description.trim(),
    city: city.trim(),
    province: province.trim(),
    zipCode: zipCode.trim(),
    destination: [city.trim(), province.trim()].filter(Boolean).join(', '),
    items: items.map((item) => item.trim()).filter(Boolean),
    orderIds: selectedOrderIds,
    storyDate: storyDate || getCurrentLocalDateTime(),
    value,
    backgroundImage,
    bgImageSize,
    bgZoom,
    bgRotation,
    bgOffset,
    stickers: stickers.map(normalizeStorySticker),
    texts: texts.map(normalizeStoryText)
  }), [label, description, city, province, zipCode, items, selectedOrderIds, storyDate, value, backgroundImage, bgImageSize, bgZoom, bgRotation, bgOffset, stickers, texts]);

  const estimatedStorySize = useMemo(() => {
    try {
      return JSON.stringify(storyPayload).length;
    } catch {
      return 0;
    }
  }, [storyPayload]);

  const storySizePercent = (estimatedStorySize / FIRESTORE_DOC_LIMIT) * 100;
  const isStorySizeWarning = storySizePercent >= STORY_WARNING_PERCENT;
  const isStorySizeOverLimit = storySizePercent > 100;
  const canPersistStory = !isStorySizeOverLimit;

  const handleBgSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert("Please upload an image file.");
      e.target.value = '';
      return;
    }
    try {
      const imageData = await readFileAsDataUrl(file);
      const compressed = await compressImage(imageData, STORY_BACKGROUND_MAX_SIZE, STORY_IMAGE_QUALITY);
      setBgImageSize({ width: compressed.width, height: compressed.height });
      setBgOffset({ x: 0, y: 0 });
      setBgZoom(1);
      setBgRotation(0);
      setBackgroundImage(compressed.dataUrl);
    } catch (err) {
      console.error("SG LOG: Failed to process story background", err);
      alert("Failed to process the background image.");
    } finally {
      e.target.value = '';
    }
  };

  const handleStickerSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert("Please upload an image file.");
      e.target.value = '';
      return;
    }
    try {
      const imageData = await readFileAsDataUrl(file);
      const compressed = await compressImage(imageData, STORY_STICKER_MAX_SIZE, STORY_STICKER_QUALITY);
      const newSticker = {
        id: `sticker-${Date.now()}`,
        src: compressed.dataUrl,
        scale: uploadType === 'mask' ? 0.5 : 1, 
        rotation: uploadType === 'polaroid' ? -6 : 0,
        position: { x: 0, y: 0 },
        zoom: 1,
        imageOffset: { x: 0, y: 0 },
        type: uploadType
      };
      setStickers((prev) => [...prev, newSticker]);
      setSelectedStickerIndex(stickers.length);
      setSelectedTextIndex(null); 
      setActiveDesktopTool(null);
    } catch (err) {
      console.error("SG LOG: Failed to process story sticker", err);
      alert("Failed to process the sticker image.");
    } finally {
      e.target.value = '';
    }
  };

  const handleAddText = () => {
    const newText = {
      id: `text-${Date.now()}`,
      text: 'TAP TO EDIT',
      color: '#ffffff',
      fontSize: 12,
      fontFamily: 'sans-serif',
      fontWeight: 'bold',
      rotation: 0,
      scale: 1,
      position: { x: 0, y: 0 }
    };
    setTexts((prev) => [...prev, newText]);
    setSelectedTextIndex(texts.length); 
    setSelectedStickerIndex(null); 
    setActiveDesktopTool(null);
  };

  const updateStoryItem = (index, value) => {
    setItems((previousItems) => previousItems.map((item, itemIndex) => (
      itemIndex === index ? value : item
    )));
  };

  const addStoryItem = () => {
    setItems((previousItems) => [...previousItems, '']);
  };

  const removeStoryItem = (index) => {
    setItems((previousItems) => {
      const nextItems = previousItems.filter((_, itemIndex) => itemIndex !== index);
      return nextItems.length > 0 ? nextItems : [''];
    });
  };

const handleSave = async (e, isPublish) => { // Gawin nating explicit boolean ang isPublish
  if (e) e.preventDefault();
  
  // Validation checks...
  if (!label.trim()) {
    alert("Please enter a story title.");
    return;
  }
  if (!backgroundImage) {
    alert("Please upload a background photo first!");
    return;
  }
  if (!canPersistStory) {
    alert("This story is over Firestore's 1MB document limit. Remove a sticker or replace an image with a smaller one before saving.");
    return;
  }

  // I-set ang specific loading state
  if (isPublish) {
    setIsPublishing(true);
  } else {
    setIsSavingDraft(true);
  }

  try {
    const storyData = {
      ...storyPayload,
      isDraft: !isPublish // true kung draft, false kung publish
    };
    
    if (mode === 'add') {
      await addStory(storyData);
    } else if (mode === 'edit' && editingStory) {
      await updateStory(editingStory.id, storyData);
    }
    resetForm();
    onClose();
  } catch (err) {
    console.error("SG LOG: Failed to save story", err);
    alert("Failed to save story. Please try again.");
  } finally {
    // I-reset ang parehong state pagkatapos
    setIsPublishing(false);
    setIsSavingDraft(false);
  }
};

  const StorySizeMeter = () => {
    const percent = Math.min(Math.round(storySizePercent), 999);
    const ringColor = isStorySizeOverLimit ? '#dc2626' : isStorySizeWarning ? '#f59e0b' : '#2563eb';
    const fill = Math.min(storySizePercent, 100);

    return (
      <div className="w-10 h-10 rounded-full bg-white/95 dark:bg-neutral-900/90 border border-black/10 dark:border-white/10 shadow-lg grid place-items-center" title={`${percent}% of Firebase document limit used`}>
        <div
          className="grid h-8 w-8 place-items-center rounded-full"
          style={{ background: `conic-gradient(${ringColor} ${fill}%, rgba(115,115,115,0.22) 0)` }}
        >
          <div className="grid h-6 w-6 place-items-center rounded-full bg-white dark:bg-neutral-900">
            <span className={`text-[7px] font-black leading-none tracking-tighter ${isStorySizeOverLimit ? 'text-red-600' : isStorySizeWarning ? 'text-amber-500' : 'text-garage-blue'}`}>
              {percent}%
            </span>
          </div>
        </div>
      </div>
    );
  };
  

  const bgRenderedScale = getBgTotalScale(canvasRef.current?.getBoundingClientRect());

const renderEditorFormButtons = () => (
  <div className="w-full flex items-center gap-2 pt-4 bg-white dark:bg-neutral-900 md:sticky md:bottom-0">
    <button 
      type="button" 
      onClick={resetForm} 
      disabled={isSavingDraft || isPublishing} 
      className="h-12 w-12 rounded-full border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/5 text-neutral-500 hover:text-neutral-800 dark:hover:text-white flex items-center justify-center transition-colors flex-shrink-0"
      title="Cancel"
    >
      <ChevronLeft size={20} />
    </button>

    {/* Merged Button Logic */}
    {isStorySizeOverLimit ? (
      <button 
        type="button"
        disabled
        className="flex-1 h-12 bg-neutral-100 dark:bg-white/5 text-neutral-500 border border-neutral-200 dark:border-white/10 rounded-2xl font-black uppercase text-[10px] tracking-widest cursor-not-allowed"
      >
        FILE EXCEEDS LIMIT
      </button>
    ) : (
      <>
        <button 
          type="button" 
          onClick={(e) => handleSave(e, false)} 
          disabled={isSavingDraft || isPublishing} 
          className="flex-1 h-12 bg-neutral-100 dark:bg-white/5 text-neutral-800 dark:text-white border dark:border-white/10 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-neutral-200 dark:hover:bg-white/10 transition-colors px-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSavingDraft ? <Loader2 size={14} className="animate-spin" /> : "Save Draft"}
        </button>

        <button 
          type="button"
          onClick={(e) => handleSave(e, true)}
          disabled={isSavingDraft || isPublishing} 
          className="flex-1 h-12 bg-garage-blue text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg flex items-center justify-center gap-2 hover:opacity-90 transition-all px-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPublishing ? <Loader2 size={14} className="animate-spin" /> : <><Save size={14} /> Publish Story</>}
        </button>
      </>
    )}
  </div>
);

  return (
    <AnimatePresence>
      {isOpen && (
<div className="pointer-events-none fixed inset-0 z-[10000] flex items-start justify-center bg-black/20 backdrop-blur-[1px] dark:bg-black/50 lg:items-center lg:p-4" role="dialog" aria-modal="true" aria-label="Story editor">
  <Motion.div 
    initial={{ x: 40, opacity: 0 }} 
    animate={{ x: 0, opacity: 1 }} 
    exit={{ x: 40, opacity: 0 }}
    transition={{ type: "spring", damping: 30, stiffness: 420 }}
    className="pointer-events-auto relative flex h-full min-h-0 w-full flex-col overflow-hidden border-x border-t bg-white text-neutral-900 shadow-2xl dark:border-white/5 dark:bg-neutral-900 dark:text-white lg:h-auto lg:max-h-[95vh] lg:max-w-5xl lg:rounded-[2.5rem] lg:border lg:p-5"
  >

            {/* MOBILE HEADER */}
            <div className={`${isSplitLayout ? 'hidden' : 'flex'} sticky top-0 z-[220] min-h-[76px] w-full shrink-0 items-center gap-3 border-b border-neutral-100 bg-white px-4 py-3 dark:border-white/5 dark:bg-neutral-900`}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setEditorView((view) => (view === 'canvas' ? 'details' : 'canvas')); }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 text-neutral-700 shadow-sm transition-colors hover:border-garage-blue hover:text-garage-blue dark:border-white/10 dark:bg-white/5 dark:text-white"
                aria-label={editorView === 'canvas' ? 'Show story details' : 'Show story canvas'}
              >
                {editorView === 'canvas' ? <BookOpen size={20} /> : <Book size={20} />}
              </button>
              <div className="min-w-0 flex-1 text-left">
                <h2 className="truncate text-xl font-black italic uppercase leading-none tracking-tighter text-neutral-900 dark:text-white">
                  {mode === 'add' ? 'BUILD STORY' : 'EDIT STORY'}
                </h2>
                <span className="mt-1 block truncate text-[8px] font-bold uppercase tracking-widest text-neutral-400">
                  {mode === 'add' ? 'Upload a background, then add custom layers' : 'Modify background, stickers and texts'}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); resetForm(); onClose(); }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 text-neutral-600 shadow-sm transition-colors hover:border-red-500 hover:text-red-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                aria-label="Close story editor"
              >
                <X size={20} />
              </button>
            </div>

            {/* DESKTOP ABSOLUTE CLOSE BUTTON */}
            <div className={`${isSplitLayout ? 'block' : 'hidden'} absolute top-4 right-4 z-[220]`}>
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); resetForm(); onClose(); }} 
                className="rounded-full border border-black/10 bg-white/90 p-2 text-neutral-600 shadow-lg backdrop-blur-md transition-all hover:bg-white hover:text-neutral-950 dark:border-white/10 dark:bg-[var(--color-surface-raised)] dark:text-white/80 dark:hover:bg-[var(--color-surface-raised)] dark:hover:text-white"
                aria-label="Close story editor"
              >
                <X size={20} />
              </button>
            </div>

            <div className={`${isSplitLayout ? 'flex' : 'hidden'} p-6 pb-4 border-b border-neutral-100 dark:border-white/5 items-center justify-between z-10 shrink-0`}>
              <div className="flex flex-col text-left">
                <h2 className="text-2xl font-black italic uppercase tracking-tighter text-neutral-900 dark:text-white leading-none">
                  {mode === 'add' ? 'BUILD STORY' : 'EDIT STORY'}
                </h2>
                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mt-1">
                  {mode === 'add' && 'Upload a background, then add custom layers'}
                  {mode === 'edit' && 'Modify background, stickers and texts'}
                </span>
              </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <div className={`${isSplitLayout ? 'p-6 overflow-hidden overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden' : 'p-0 overflow-hidden'} flex-1 min-h-0`}>
                <div className={`w-full flex ${isSplitLayout ? 'flex-row gap-6' : 'flex-col gap-0'} text-left items-stretch h-full`}>
                  <div className={`${editorView === 'canvas' || isSplitLayout ? 'flex' : 'hidden'} w-full ${isSplitLayout ? 'h-auto w-[45%] justify-start bg-transparent' : 'h-full justify-center bg-black'} flex-col items-center relative`}>
                    <div 
                      ref={canvasRef} onClick={(e) => e.stopPropagation()} onWheel={handleImageWheel}
                      onPointerDown={handleBgPointerDown} onPointerMove={handleBgPointerMove} onPointerUp={handleBgPointerUp} onPointerCancel={handleBgPointerUp} onPointerLeave={handleBgPointerUp}
                      className={`border-2 ${isSplitLayout ? 'rounded-3xl h-auto w-full max-w-md lg:h-[calc(95vh-160px)] lg:w-auto lg:max-w-full' : 'rounded-none h-full w-auto max-w-full'} aspect-[9/16] mx-auto overflow-hidden relative cursor-pointer transition-all duration-200 ${isBgSelected ? 'border-garage-blue ring-2 ring-garage-blue shadow-2xl z-50' : 'border-dashed border-neutral-200 dark:border-white/10'}`}
                      style={{ touchAction: 'none' }}
                    >
                      <div className="absolute top-16 md:top-4 right-4 z-[140] flex flex-col gap-2" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => bgFileInputRef.current?.click()} title={backgroundImage ? 'Replace background image' : 'Upload background image'} aria-label={backgroundImage ? 'Replace background image' : 'Upload background image'} className="w-10 h-10 rounded-full bg-white/95 dark:bg-neutral-900/90 border border-black/10 dark:border-white/10 shadow-lg flex items-center justify-center text-neutral-900 dark:text-white hover:text-garage-blue"><BookImage size={18} /></button>
                        {backgroundImage && (
                          <>
                            <button type="button" onClick={() => { setUploadType('polaroid'); setTimeout(() => stickerFileInputRef.current?.click(), 50); }} className="w-10 h-10 rounded-full bg-white/95 dark:bg-neutral-900/90 border shadow-lg flex items-center justify-center text-emerald-500"><ImageIcon size={18} /></button>
                            <button type="button" onClick={() => { setUploadType('mask'); setTimeout(() => stickerFileInputRef.current?.click(), 50); }} className="w-10 h-10 rounded-full bg-white/95 dark:bg-neutral-900/90 border shadow-lg flex items-center justify-center text-purple-500"><VenetianMask size={18} /></button>
                            <button type="button" onClick={handleAddText} className="w-10 h-10 rounded-full bg-white/95 dark:bg-neutral-900/90 border shadow-lg flex items-center justify-center text-garage-blue"><TypeOutline size={18} /></button>
                            <StorySizeMeter />
                          </>
                        )}
                      </div>
                      
                      {backgroundImage ? (
                        <>
                          <img 
                            src={backgroundImage} className="absolute left-1/2 top-1/2 max-w-none pointer-events-none z-10 select-none" 
                            onLoad={(e) => { if (!bgImageSize && e.currentTarget.naturalWidth) setBgImageSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight }); }}
                            style={{
                              width: bgImageSize && (bgImageSize.width / bgImageSize.height) > (9 / 16) ? 'auto' : '100%',
                              height: bgImageSize && (bgImageSize.width / bgImageSize.height) > (9 / 16) ? '100%' : 'auto',
                              minWidth: '100%', minHeight: '100%',
                              transform: `translate(calc(-50% + ${bgOffset.x || 0}px), calc(-50% + ${bgOffset.y || 0}px)) scale(${bgRenderedScale}) rotate(${bgRotation || 0}deg)`,
                              transformOrigin: 'center center'
                            }}
                          />

                          {stickers.map((st, index) => {
                            const isPolaroid = st.type !== 'mask';
                            const isSelected = selectedStickerIndex === index;
                            const isPanActive = isSelected && activeDesktopTool === 'pan';

                            return (
                              <Motion.div
                                key={st.id} 
                                drag={isSelected && !activeDesktopTool} 
                                dragConstraints={canvasRef} 
                                dragElastic={0.01} 
                                dragMomentum={false}
                                onDragStart={() => resetBgControls()}
                                onDragEnd={(e, info) => { 
                                  const currentRect = canvasRef.current?.getBoundingClientRect();
                                  const canvasW = currentRect?.width || 300;
                                  const canvasH = currentRect?.height || 533;
                                  
                                  const finalX = (st.position?.x || 0) + info.offset.x;
                                  const finalY = (st.position?.y || 0) + info.offset.y;

                                  let targetScale = st.scale;
                                  const maxAllowedScale = 1.6;
                                  if (targetScale > maxAllowedScale) {
                                    targetScale = maxAllowedScale;
                                  }

                                  const stickerWidth = canvasW * 0.5 * targetScale;
                                  const stickerHeight = canvasW * 0.5 * targetScale;
                                  
                                  const minX = -stickerWidth / 2;
                                  const maxX = canvasW - stickerWidth / 2;
                                  const minY = -stickerHeight / 2;
                                  const maxY = canvasH - stickerHeight / 2;

                                  setStickers(prev => prev.map((s, i) => i === index ? { 
                                    ...s, 
                                    scale: targetScale,
                                    position: { 
                                      x: clamp(finalX, minX, maxX), 
                                      y: clamp(finalY, minY, maxY) 
                                    } 
                                  } : s)); 
                                }}
                                animate={{ scale: st.scale, rotate: st.rotation, x: st.position.x, y: st.position.y }}
                                transition={{ type: 'spring', stiffness: 700, damping: 45, mass: 0.35 }}
                                className={`sticker-container absolute top-1/4 left-1/4 z-20 transition-opacity duration-200 ${isSelected ? 'z-[120]' : ''} ${isBgSelected ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                                style={{ touchAction: 'none', willChange: 'transform', width: '50%' }}
                                onPointerDown={(e) => { 
                                  if (e.target.closest('[data-handle="true"]')) return;
                                  e.stopPropagation(); 
                                  const isSameSticker = selectedStickerIndex === index;
                                  setSelectedStickerIndex(index); 
                                  setSelectedTextIndex(null); 
                                  resetBgControls(); 
                                  // Keep the active sticker tool while interacting with
                                  // the already-selected sticker. Clear it only when
                                  // switching to a different sticker layer.
                                  if (!isSameSticker) setActiveDesktopTool(null);
                                }}
                              >
                                <div className="relative group w-full">
                                  <div className={`relative bg-white shadow-xl transition-all w-full ${isPolaroid ? 'p-2 pb-6' : 'rounded-full border-2 border-white aspect-square'} ${isPanActive ? 'ring-2 ring-orange-500' : ''}`} >
                                    <div className={`w-full h-full overflow-hidden bg-neutral-200 relative ${isPolaroid ? 'aspect-square' : 'rounded-full'}`}>
                                      <img 
                                        src={st.src} 
                                        className="w-full h-full object-cover pointer-events-none select-none absolute" 
                                        style={{ 
                                          transform: `translate(${st.imageOffset?.x || 0}px, ${st.imageOffset?.y || 0}px) scale(${st.zoom || 1})`, 
                                          transformOrigin: 'center center',
                                          top: 0,
                                          left: 0
                                        }} 
                                        draggable="false" 
                                      />
                                    </div>
                                  </div>
                                </div>
                              </Motion.div>
                            );
                          })}

                          {texts.map((t, index) => {
                            const isSelected = selectedTextIndex === index;

                            return (
                              <Motion.div
                                key={t.id} 
                                drag={isSelected} 
                                dragConstraints={canvasRef} 
                                dragElastic={0.05} 
                                dragMomentum={false}
                                onDragStart={() => resetBgControls()}
                                onDragEnd={(e, info) => { setTexts(prev => prev.map((txt, idx) => idx === index ? { ...txt, position: { x: txt.position.x + info.offset.x, y: txt.position.y + info.offset.y } } : txt)); }}
                                animate={{ scale: t.scale, rotate: t.rotation, x: t.position.x, y: t.position.y }}
                                className={`text-container absolute p-1.5 select-none transition-opacity duration-200 ${isSelected ? 'ring-2 ring-garage-blue rounded-lg bg-black/10 backdrop-blur-xs z-[110]' : 'z-30'} ${isBgSelected ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                                style={{ touchAction: 'none', left: 'calc(50% - 100px)', top: 'calc(50% - 20px)', width: '200px' }}
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => { 
                                  if (e.target.closest('[data-handle="true"]')) return;
                                  e.stopPropagation(); 
                                  resetBgControls(); 
                                  setSelectedStickerIndex(null); 
                                  setSelectedTextIndex(index); 
                                  setActiveDesktopTool(null);
                                }}
                              >
                                <div className="relative w-full h-full flex items-center justify-center">
                                  {isSelected && <div className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing" style={{ touchAction: 'none' }} />}
                                  <input
                                    type="text" value={t.text} onChange={(e) => updateSelectedText('text', e.target.value)}
                                    className="bg-transparent border-0 focus:outline-none text-center w-full focus:ring-0 font-bold relative z-0"
                                    style={{ color: t.color, fontSize: `${t.fontSize || 12}px`, fontFamily: t.fontFamily, fontWeight: t.fontWeight, textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}
                                  />
                                </div>
                              </Motion.div>
                            );
                          })}

{(selectedStickerIndex !== null || selectedTextIndex !== null) && (
  <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/75 backdrop-blur-md text-white text-[8px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full z-[120] whitespace-nowrap pointer-events-none shadow-xl border border-white/5 flex items-center gap-1.5">
    <span className="w-1.5 h-1.5 rounded-full bg-garage-blue animate-pulse" />
    {activeDesktopTool === 'pan' 
      ? 'Drag outside to pan' 
      : activeDesktopTool === 'rotate' 
        ? 'Drag outside to rotate' 
        : activeDesktopTool === 'resize'
          ? 'Drag outside to resize'
          : activeDesktopTool === 'zoom'
            ? 'Drag outside to zoom'
            : 'Drag Sticker to Move'}
  </div>
)}

                          {isBgSelected && (
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md text-white text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full z-[120] whitespace-nowrap pointer-events-none">
                              {activeDesktopTool === 'rotate'
                                ? 'Drag outside to rotate'
                                : activeDesktopTool === 'zoom'
                                  ? 'Drag outside to zoom'
                                  : activeDesktopTool === 'pan'
                                    ? 'Drag outside to pan'
                                    : stickers.length > 0
                                      ? 'Choose pan to move image'
                                      : isDesktop
                                        ? 'Drag to Move | Scroll to Zoom'
                                        : '1 Finger: Move/Crop | 2 Fingers: Zoom & Rotate'}
                            </div>
                          )}

                          <AnimatePresence>
                            {renderLayerControls()}
                          </AnimatePresence>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center p-6 text-neutral-400 cursor-pointer w-full h-full" onClick={() => bgFileInputRef.current?.click()}>
                          <Upload size={24} className="opacity-60 mb-2" /><span className="text-[10px] font-black uppercase tracking-widest text-center">First, upload a background image</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT COLUMN (DETAILS PANE) */}
                  <div className={`${editorView === 'details' || isSplitLayout ? 'flex' : 'hidden'} w-full ${isSplitLayout ? 'h-auto w-[55%] pt-0 px-0' : 'h-full pt-16 px-6'} flex-col justify-between`} onClick={(e) => e.stopPropagation()}>
                    <div className="space-y-4 overflow-y-auto flex-1 pr-1">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Story Title</label>
                        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ENTER STORY TITLE" className="w-full p-4 rounded-2xl bg-neutral-50 dark:bg-white/5 border text-xs font-black uppercase tracking-wider focus:outline-none focus:border-garage-blue" maxLength={40} required />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Description</label>
                        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ENTER STORY DESCRIPTION" rows={3} className="w-full p-4 rounded-2xl bg-neutral-50 dark:bg-white/5 border text-xs focus:outline-none focus:border-garage-blue resize-none" maxLength={300} />
                      </div>

                      {isAdmin && (
                        <div className="space-y-2 rounded-2xl border border-blue-500/20 bg-blue-500/[0.03] p-3 dark:bg-blue-500/[0.06]">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <label className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">Link Orders</label>
                              <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-neutral-400">
                                Select orders to fill the story items and destination.
                              </p>
                            </div>
                            {selectedOrderIds.length > 0 && (
                              <span className="shrink-0 rounded-full bg-blue-600 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white">
                                {selectedOrderIds.length} selected
                              </span>
                            )}
                          </div>

                          <input
                            type="search"
                            value={orderSearch}
                            onChange={(event) => setOrderSearch(event.target.value)}
                            placeholder="SEARCH ORDER NO., CUSTOMER, ITEM OR LOCATION"
                            className="w-full rounded-xl border bg-white p-3 text-[10px] font-black uppercase tracking-wider focus:outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                          />

                          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                            {ordersStatus === 'loading' && selectableOrders.length === 0 ? (
                              <div className="flex items-center justify-center gap-2 py-6 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                <Loader2 size={14} className="animate-spin" /> Loading orders...
                              </div>
                            ) : ordersStatus === 'error' && selectableOrders.length === 0 ? (
                              <p className="py-4 text-center text-[10px] font-black uppercase tracking-wider text-red-500">Orders unavailable</p>
                            ) : filteredOrders.length === 0 ? (
                              <p className="py-4 text-center text-[10px] font-black uppercase tracking-wider text-neutral-400">No matching orders</p>
                            ) : (
                              filteredOrders.map((order) => {
                                const orderItems = getStoryOrderItems(order);
                                const orderLocation = getStoryOrderLocation(order);
                                const isSelected = selectedOrderIds.includes(String(order.id))
                                  || selectedOrderIds.includes(String(order.orderId || ''));

                                return (
                                  <label
                                    key={order.id}
                                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${isSelected
                                      ? 'border-blue-500 bg-blue-500/10'
                                      : 'border-black/5 bg-white hover:border-blue-500/40 dark:border-white/10 dark:bg-white/[0.03]'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => handleOrderSelectionChange(order.id)}
                                      className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="truncate text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                                          {order.orderId || order.id}
                                        </span>
                                        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                          Paid ₱{getStoryOrderPaidAmount(order).toLocaleString()}
                                        </span>
                                      </span>
                                      <span className="mt-1 block truncate text-[10px] font-black uppercase tracking-wider text-neutral-700 dark:text-neutral-200">
                                        {order.buyerName || 'Unnamed customer'}
                                      </span>
                                      <span className="mt-1 block text-[9px] font-bold uppercase leading-relaxed tracking-wider text-neutral-500 dark:text-neutral-400">
                                        {orderItems.length > 0 ? orderItems.join(' • ') : 'No item names recorded'}
                                      </span>
                                      <span className="mt-1 block text-[9px] font-bold uppercase tracking-wider text-neutral-400">
                                        {[orderLocation.city, orderLocation.province, orderLocation.zipCode].filter(Boolean).join(', ') || 'No city/province/ZIP recorded'}
                                        {order.status ? ` • ${order.status}` : ''}
                                      </span>
                                    </span>
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Destination</label>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <div className="relative">
                            <Building2 size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-blue-600" />
                            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City / Town" className="w-full rounded-2xl border bg-neutral-50 p-4 pl-11 text-xs font-semibold focus:outline-none focus:border-garage-blue dark:bg-white/5" maxLength={80} />
                          </div>
                          <div className="relative">
                            <MapPin size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-blue-600" />
                            <input type="text" value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Province" className="w-full rounded-2xl border bg-neutral-50 p-4 pl-11 text-xs font-semibold focus:outline-none focus:border-garage-blue dark:bg-white/5" maxLength={80} />
                          </div>
                          <input type="text" inputMode="numeric" value={zipCode} onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="ZIP Code" className="w-full rounded-2xl border bg-neutral-50 p-4 text-xs font-semibold focus:outline-none focus:border-garage-blue dark:bg-white/5" maxLength={4} />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Kit Items</label>
                          <button
                            type="button"
                            onClick={addStoryItem}
                            className="inline-flex items-center gap-1 rounded-full border border-blue-500/20 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-blue-600 transition-colors hover:bg-blue-600 hover:text-white"
                          >
                            <Plus size={12} strokeWidth={3} />
                            Add item
                          </button>
                        </div>
                        <div className="space-y-2">
                          {items.map((item, index) => (
                            <div key={`story-item-${index}`} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={item}
                                onChange={(e) => updateStoryItem(index, e.target.value)}
                                placeholder={index === 0 ? 'E.G. HG GUNDAM VIDAR' : 'ADD ANOTHER KIT OR ITEM'}
                                className="w-full rounded-2xl border bg-neutral-50 p-4 text-xs font-semibold focus:outline-none focus:border-garage-blue dark:bg-white/5"
                                maxLength={120}
                              />
                              {items.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeStoryItem(index)}
                                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-500/20 text-red-500 transition-colors hover:bg-red-500 hover:text-white"
                                  aria-label={`Remove item ${index + 1}`}
                                >
                                  <X size={15} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                          <Calendar size={12} />
                          Story Date
                        </label>
                        <CustomDateTimePicker
                          value={storyDate}
                          onChange={setStoryDate}
                          isDarkMode={isDarkMode}
                          placeholder="Select story date"
                          allowClear={false}
                          renderInline
                          align="right"
                        />
                        <p className="text-[9px] font-bold text-neutral-400">
                          This date appears on the story card. New stories default to today.
                        </p>
                      </div>

                    </div>

                    {/* DESKTOP ONLY: Action Buttons single row stack inside right pane */}
                    <div className={isSplitLayout ? 'block' : 'hidden'}>
                      {renderEditorFormButtons()}
                    </div>

                    <input type="file" ref={bgFileInputRef} className="hidden" accept="image/*" onChange={handleBgSelect} />
                    <input type="file" ref={stickerFileInputRef} className="hidden" accept="image/*" onChange={handleStickerSelect} />
                  </div>
                </div>
            </div>

{/* MOBILE/DESKTOP FIXED FOOTER (Visible while editing story details) */}
{editorView === 'details' && (
  <div className="w-full bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-white/5 p-4 sticky bottom-0 z-[210] shrink-0">
    {renderEditorFormButtons()}
  </div>
)}

          </Motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
