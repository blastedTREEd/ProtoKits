import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Maximize2, X, Plus, Trash2, Edit, ChevronUp, ChevronDown, Upload, Image as ImageIcon, Loader2, Save, RotateCw, ZoomIn, BookImage, VenetianMask, Type as TypeOutline, Palette, ALargeSmall, BookOpen, Book, Notebook, NotebookPen, Hand, ChevronLeft, Calendar } from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { useTheme } from '../../context/ThemeContext';
import { CustomDateTimePicker } from '../kitcards/AddKitModal';

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

export default function StoriesManagerModal({ isOpen, onClose }) {
  const { isDarkMode } = useTheme();
  const { stories, addStory, updateStory, deleteStory, updateStoriesOrder } = useStore();

  const [mode, setMode] = useState('list'); // 'list', 'add', 'edit'
  const [editingStory, setEditingStory] = useState(null);
  
  // Form states
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [destination, setDestination] = useState('');
  const [items, setItems] = useState('');
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
  const [storyListView, setStoryListView] = useState('published');

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
    const checkDevice = () => {
      const split = window.matchMedia('(min-width: 1024px), (min-width: 768px) and (orientation: landscape)').matches;
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
    setDestination('');
    setItems('');
    setStoryDate(getCurrentLocalDateTime());
    setValue(getRandomStoryColor());
    setBackgroundImage('');
    setStickers([]);
    setSelectedStickerIndex(null);
    setTexts([]);
    setSelectedTextIndex(null);
    setMode('list');
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
    setDestination(story.destination || '');
    setItems(story.items || '');
    setStoryDate(story.storyDate || getCurrentLocalDateTime());
    setValue(story.value || getRandomStoryColor());
    
    setBackgroundImage(story.backgroundImage || '');
    setBgZoom(story.bgZoom || 1);
    setBgRotation(story.bgRotation || 0);
    setBgOffset(story.bgOffset || { x: 0, y: 0 });
    setBgImageSize(story.bgImageSize || null);
    setIsBgSelected(false);
    setStickers(story.stickers || []);
    setTexts(story.texts || []);
    
    setSelectedStickerIndex(story.stickers?.length > 0 ? 0 : null);
    setSelectedTextIndex(story.texts?.length > 0 ? 0 : null);
    setActiveDesktopTool(null);
    setShowColorPaletteIdx(null);
    setEditorView('canvas');
    
    setMode('edit');
  }, []);

  useEffect(() => {
    const handleOpenRequest = (event) => {
      const request = event.detail || {};

      if (request.mode === 'add') {
        resetForm();
        setMode('add');
      } else if (request.mode === 'edit' && request.story) {
        handleEditClick(request.story);
      } else if (request.mode === 'list') {
        resetForm();
      }
    };

    window.addEventListener('openStoriesManager', handleOpenRequest);
    return () => window.removeEventListener('openStoriesManager', handleOpenRequest);
  }, [handleEditClick, resetForm]);

  const storyPayload = useMemo(() => ({
    label: label.trim(),
    description: description.trim(),
    destination: destination.trim(),
    items: items.trim(),
    storyDate: storyDate || getCurrentLocalDateTime(),
    value,
    backgroundImage,
    bgImageSize,
    bgZoom,
    bgRotation,
    bgOffset,
    stickers,
    texts
  }), [label, description, destination, items, storyDate, value, backgroundImage, bgImageSize, bgZoom, bgRotation, bgOffset, stickers, texts]);

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
  } catch (err) {
    console.error("SG LOG: Failed to save story", err);
    alert("Failed to save story. Please try again.");
  } finally {
    // I-reset ang parehong state pagkatapos
    setIsPublishing(false);
    setIsSavingDraft(false);
  }
};

  const handleDelete = async (storyId) => {
    if (!window.confirm("Are you sure you want to delete this story?")) return;
    try {
      await deleteStory(storyId);
    } catch (err) {
      console.error("SG LOG: Failed to delete story", err);
      alert("Failed to delete story.");
    }
  };

  const handleMoveUp = async (index) => {
    if (index === 0) return;
    const newStories = [...stories];
    const temp = newStories[index];
    newStories[index] = newStories[index - 1];
    newStories[index - 1] = temp;
    try { await updateStoriesOrder(newStories); } catch (err) { console.error(err); }
  };

  const handleMoveDown = async (index) => {
    if (index === stories.length - 1) return;
    const newStories = [...stories];
    const temp = newStories[index];
    newStories[index] = newStories[index + 1];
    newStories[index + 1] = temp;
    try { await updateStoriesOrder(newStories); } catch (err) { console.error(err); }
  };

  const publishedStories = stories?.filter(story => !story.isDraft) || [];
  const draftStories = stories?.filter(story => story.isDraft) || [];
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
  

  const renderStoryCard = (story, globalIndex) => (
    <div 
      key={story.id}
      className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-white/5 rounded-2xl border border-neutral-100 dark:border-white/5 group hover:border-garage-blue/20 transition-all"
    >
      <div className="w-12 h-16 rounded-xl overflow-hidden relative border border-black/10 dark:border-white/10 flex-shrink-0 bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center">
        {story.backgroundImage ? (
          <img src={story.backgroundImage} alt={story.label} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon size={18} className="text-neutral-400" />
        )}
        <div className="absolute inset-0 opacity-40 blur-md pointer-events-none" style={{ backgroundColor: story.value || '#0066ff' }} />
      </div>

      <div className="flex-1 text-left min-w-0">
        <h4 className="font-black uppercase tracking-tight text-neutral-900 dark:text-white text-xs truncate">{story.label}</h4>
        <p className="text-[10px] text-neutral-400 line-clamp-2 leading-tight mt-0.5">{story.description || 'No description provided.'}</p>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div className="flex flex-col">
          <button onClick={() => handleMoveUp(globalIndex)} disabled={globalIndex === 0} className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-white/10 disabled:opacity-20 text-neutral-500"><ChevronUp size={14} /></button>
          <button onClick={() => handleMoveDown(globalIndex)} disabled={globalIndex === stories.length - 1} className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-white/10 disabled:opacity-20 text-neutral-500"><ChevronDown size={14} /></button>
        </div>
        <button onClick={() => handleEditClick(story)} className="p-2 rounded-xl bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-600 dark:text-neutral-300 transition-colors"><Edit size={14} /></button>
        <button onClick={() => handleDelete(story.id)} className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors"><Trash2 size={14} /></button>
      </div>
    </div>
  );

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
<div className="pointer-events-none fixed inset-0 z-[300] flex items-start justify-center" role="dialog" aria-modal="true" aria-label="Manage stories">
  {/* Match the Deal Architect page shell; the navbar remains visible above it. */}
  <Motion.div 
    initial={{ x: 40, opacity: 0 }} 
    animate={{ x: 0, opacity: 1 }} 
    exit={{ x: 40, opacity: 0 }}
    transition={{ type: "spring", damping: 30, stiffness: 420 }}
    className="pointer-events-auto relative mt-[56px] flex h-[calc(100dvh-56px)] w-full max-w-7xl min-h-0 flex-col overflow-hidden border-x border-t bg-white text-neutral-900 shadow-2xl dark:border-white/5 dark:bg-neutral-900 dark:text-white sm:mt-[60px] sm:h-[calc(100dvh-60px)]"
  >

            {/* MOBILE STICKY/ABSOLUTE HEADER */}
            <div className={`${isSplitLayout ? 'hidden' : 'sticky'} top-0 z-[220] w-full h-0 overflow-visible`}>
              {mode !== 'list' && (
                <div className="absolute top-4 left-4 flex justify-start items-center">
                  <button 
                    type="button" 
                    onClick={(e) => { e.stopPropagation(); setEditorView((view) => (view === 'canvas' ? 'details' : 'canvas')); }} 
                    className="p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/25 text-white border-white/10 hover:bg-black/40 z-[250]"
                  >
                    {editorView === 'canvas' ? <BookOpen size={20} /> : <Book size={20} />}
                  </button>
                </div>
              )}
              <div className="absolute top-4 right-4 flex justify-end items-center">
                <button 
                  type="button"
                  onClick={(e) => { e.stopPropagation(); resetForm(); onClose(); }} 
                  className="p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/25 text-white border-white/10 hover:bg-black/40 z-[250]"
                  aria-label="Close Manage Stories"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* DESKTOP ABSOLUTE CLOSE BUTTON */}
            <div className={`${isSplitLayout ? 'block' : 'hidden'} absolute top-4 right-4 z-[220]`}>
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); resetForm(); onClose(); }} 
                className="rounded-full border border-black/10 bg-white/90 p-2 text-neutral-600 shadow-lg backdrop-blur-md transition-all hover:bg-white hover:text-neutral-950 dark:border-white/10 dark:bg-black/40 dark:text-white/80 dark:hover:bg-black/60 dark:hover:text-white"
                aria-label="Close Manage Stories"
              >
                <X size={20} />
              </button>
            </div>

            <div className={`p-6 pb-4 border-b border-neutral-100 dark:border-white/5 items-center justify-between z-10 shrink-0 ${mode === 'list' || isSplitLayout ? 'flex' : 'hidden'}`}>
              <div className="flex flex-col text-left">
                <h2 className="text-2xl font-black italic uppercase tracking-tighter text-neutral-900 dark:text-white leading-none">
                  {mode === 'list' && 'MANAGE STORIES'} {mode === 'add' && 'BUILD STORY'} {mode === 'edit' && 'EDIT STORY'}
                </h2>
                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mt-1">
                  {mode === 'list' && 'Click arrows to reorder active stories'}
                  {mode === 'add' && 'Upload a background, then add custom layers'}
                  {mode === 'edit' && 'Modify background, stickers and texts'}
                </span>
              </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <div className={`${mode === 'list' ? 'p-6 overflow-hidden overscroll-none' : `${isSplitLayout ? 'p-6 overflow-y-auto overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden' : 'p-0 overflow-hidden'}`} flex-1 min-h-0`}>
              {mode === 'list' ? (
                <div className="h-full min-h-0 flex flex-col gap-4 overflow-hidden overscroll-none">
                  {stories && stories.length > 0 ? (
                    <>
                      <div className="md:hidden grid grid-cols-2 gap-2 p-1 rounded-2xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
                        <button type="button" onClick={() => setStoryListView('published')} className={`py-3 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 transition-all ${storyListView === 'published' ? 'bg-white dark:bg-neutral-900 text-garage-blue shadow-sm' : 'text-neutral-400'}`}><Notebook size={14} /> Published</button>
                        <button type="button" onClick={() => setStoryListView('drafts')} className={`py-3 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 transition-all ${storyListView === 'drafts' ? 'bg-white dark:bg-neutral-900 text-amber-500 shadow-sm' : 'text-neutral-400'}`}><NotebookPen size={14} /> Drafts</button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-0 md:mt-4 flex-1 min-h-0 overflow-hidden">
                        <div className={`${storyListView === 'published' ? 'flex' : 'hidden'} md:flex flex-col min-h-0 overflow-hidden space-y-2`}>
                          <div className="flex items-center gap-2 pb-1 border-b border-neutral-100 dark:border-white/5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" /><h3 className="text-xs font-black uppercase tracking-wider text-neutral-500">Published ({publishedStories.length})</h3>
                          </div>
                          <div className="space-y-2 flex-1 overflow-y-auto overscroll-contain min-h-0 pb-4 pr-1 text-left [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                            {publishedStories.length > 0 ? publishedStories.map((story) => renderStoryCard(story, stories.findIndex(s => s.id === story.id))) : <p className="text-[10px] font-bold text-neutral-400 py-6 text-center italic">No published stories</p>}
                          </div>
                        </div>

                        <div className={`${storyListView === 'drafts' ? 'flex' : 'hidden'} md:flex flex-col min-h-0 overflow-hidden space-y-2`}>
                          <div className="flex items-center gap-2 pb-1 border-b border-neutral-100 dark:border-white/5">
                            <span className="w-2 h-2 rounded-full bg-amber-500" /><h3 className="text-xs font-black uppercase tracking-wider text-neutral-500">Drafts ({draftStories.length})</h3>
                          </div>
                          <div className="space-y-2 flex-1 min-h-0 overflow-y-auto overscroll-contain pb-4 pr-1 text-left [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                            {draftStories.length > 0 ? draftStories.map((story) => renderStoryCard(story, stories.findIndex(s => s.id === story.id))) : <p className="text-[10px] font-bold text-neutral-400 py-6 text-center italic">No draft stories</p>}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="py-12 flex flex-col items-center justify-center opacity-30 text-neutral-950 dark:text-white">
                      <ImageIcon size={36} strokeWidth={1} /><p className="mt-2 text-[10px] font-black uppercase tracking-widest">No Stories Found</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className={`w-full flex ${isSplitLayout ? 'flex-row gap-6' : 'flex-col gap-0'} text-left items-stretch h-full`}>
                  <div className={`${editorView === 'canvas' || isSplitLayout ? 'flex' : 'hidden'} w-full ${isSplitLayout ? 'h-auto w-[45%] justify-start bg-transparent' : 'h-full justify-center bg-black'} flex-col items-center relative`}>
                    <div 
                      ref={canvasRef} onClick={(e) => e.stopPropagation()} onWheel={handleImageWheel}
                      onPointerDown={handleBgPointerDown} onPointerMove={handleBgPointerMove} onPointerUp={handleBgPointerUp} onPointerCancel={handleBgPointerUp} onPointerLeave={handleBgPointerUp}
                      className={`border-2 ${isSplitLayout ? 'rounded-3xl h-auto w-full max-w-md' : 'rounded-none h-full w-auto max-w-full'} aspect-[9/16] mx-auto overflow-hidden relative cursor-pointer transition-all duration-200 ${isBgSelected ? 'border-garage-blue ring-2 ring-garage-blue shadow-2xl z-50' : 'border-dashed border-neutral-200 dark:border-white/10'}`}
                      style={{ touchAction: 'none' }}
                    >
                      <div className="absolute top-16 md:top-4 right-4 z-[140] flex flex-col gap-2" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => bgFileInputRef.current?.click()} className="w-10 h-10 rounded-full bg-white/95 dark:bg-neutral-900/90 border border-black/10 dark:border-white/10 shadow-lg flex items-center justify-center text-neutral-900 dark:text-white hover:text-garage-blue"><BookImage size={18} /></button>
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

                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Destination</label>
                        <input type="text" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="E.G. SANTA ROSA, LAGUNA" className="w-full p-4 rounded-2xl bg-neutral-50 dark:bg-white/5 border text-xs font-semibold focus:outline-none focus:border-garage-blue" maxLength={120} />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Items</label>
                        <input type="text" value={items} onChange={(e) => setItems(e.target.value)} placeholder="E.G. HG GUNDAM VIDAR" className="w-full p-4 rounded-2xl bg-neutral-50 dark:bg-white/5 border text-xs font-semibold focus:outline-none focus:border-garage-blue" maxLength={180} />
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
              )}
            </div>

{/* MOBILE/DESKTOP FIXED FOOTER (Visible on list view or details editor view only) */}
{(mode === 'list' || (mode !== 'list' && editorView === 'details')) && (
  <div className="w-full bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-white/5 p-4 sticky bottom-0 z-[210] shrink-0">
    {mode === 'list' ? (
      <button 
        type="button"
        onClick={() => { resetForm(); setMode('add'); }} 
        className="w-full max-w-sm py-4 bg-garage-blue text-white rounded-full font-black uppercase text-[10px] tracking-widest shadow-lg flex items-center justify-center gap-2 transition-all hover:opacity-90 mx-auto"
      >
        <Plus size={14} /> Add New Story
      </button>
    ) : (
      renderEditorFormButtons()
    )}
  </div>
)}

          </Motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
