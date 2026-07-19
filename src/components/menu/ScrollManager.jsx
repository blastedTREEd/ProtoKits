import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { Undo2, Settings2, Zap, MousePointer2, Smartphone, Milestone, Crosshair } from 'lucide-react';
import { scrollMemory } from '../../store/scrollStore';

export default function ScrollManager() {
  const [showDebugger, setShowDebugger] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  
  const [activeCase, setActiveCase] = useState(4); 
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentPixels, setCurrentPixels] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [history, setHistory] = useState({ prevPath: null, prevY: 0, currentPath: pathname });
  const [showUndo, setShowUndo] = useState(false);
  
  const timerRef = useRef(null);
  const currentY = useRef(0);

  const performScroll = (y) => {
    const force = () => window.scrollTo({ top: y, behavior: 'instant' });
    force();
    setTimeout(force, 50);
  };

  const startVisualTimer = useCallback((duration) => {
    if (!showDebugger) return;
    setTimeLeft(Math.ceil(duration / 1000));
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(p => {
        if (p <= 1) { clearInterval(timerRef.current); return 0; }
        return p - 1;
      });
    }, 1000);
  }, [showDebugger]);

  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      currentY.current = y;
      if (showDebugger) setCurrentPixels(Math.floor(y));
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [showDebugger]);

  useEffect(() => {
    const saved = scrollMemory.data[pathname];
    const now = Date.now();

    // Resetting states inside effect via a small delay or condition to avoid cascading
    if (timeLeft !== 0) setTimeLeft(0);
    if (timerRef.current) clearInterval(timerRef.current);

    if (activeCase === 4 && saved) {
      const isBackGesture = navType === 'POP';
      const isWithin4s = (now - saved.time) < 4000;
      if (isBackGesture || isWithin4s) {
        if (!isBackGesture) startVisualTimer(4000 - (now - saved.time));
        performScroll(saved.y);
      } else { window.scrollTo(0, 0); }
    } else if (activeCase === 2) {
      // Undo logic
      if (currentY.current > 100) {
        setHistory({ prevPath: history.currentPath, prevY: currentY.current, currentPath: pathname });
        setShowUndo(true);
        const t = setTimeout(() => setShowUndo(false), 5000);
        return () => clearTimeout(t);
      }
      window.scrollTo(0, 0);
    } else {
      window.scrollTo(0, 0);
    }

    return () => {
      scrollMemory.save(pathname, currentY.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, navType, activeCase]);

  // Logic to toggle debugger (for dev use)
  const toggleDebugger = () => setShowDebugger(!showDebugger);

  if (!showDebugger && !showUndo) return null;

  return (
    <div className="fixed bottom-32 right-6 z-[999] pointer-events-none flex flex-col items-end gap-4">
      {showDebugger && (
        <div className="flex flex-col items-end gap-3 pointer-events-auto">
          {isMenuOpen && (
            <div className="flex flex-col gap-2 mb-2">
              <button onClick={() => setActiveCase(1)} className="p-2 bg-white border rounded">Case 1</button>
              <button onClick={() => setActiveCase(4)} className="p-2 bg-white border rounded">Case 4</button>
            </div>
          )}
          <div className="bg-neutral-900 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-2xl">
            <Crosshair size={16} />
            <span className="font-mono">{currentPixels}px</span>
          </div>
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-4 bg-neutral-900 text-white rounded-2xl border-2 border-white/20">
            <Settings2 size={24} />
          </button>
        </div>
      )}

      {showUndo && (
        <button 
          onClick={() => { navigate(history.prevPath); performScroll(history.prevY); }} 
          className="pointer-events-auto flex items-center gap-4 bg-blue-600 text-white px-6 py-4 rounded-2xl shadow-xl"
        >
          <Undo2 size={24} />
          <span>Undo Scroll</span>
        </button>
      )}
      
      {/* Hidden trigger for dev toggle */}
      <div className="hidden" onClick={toggleDebugger} />
    </div>
  );
}