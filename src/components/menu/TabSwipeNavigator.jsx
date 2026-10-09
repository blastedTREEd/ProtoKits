import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { APP_ID } from '../../appConfig';

const TAB_PATHS = ['/', '/cart', '/notify-list'];

function getTabIndex(pathname) {
  if (pathname === '/') return 0;
  if (pathname === '/cart' || pathname === '/basket') return 1;
  if (pathname === '/notify-list') return 2;
  return -1;
}

function shouldIgnoreSwipe(target) {
  if (typeof document !== 'undefined' && document.querySelector('[role="dialog"], [aria-modal="true"], [data-modal-root], [data-modal-surface]')) return true;
  return Boolean(target?.closest('input, textarea, select, button, a, [role="button"], [role="dialog"], [aria-modal="true"], [data-modal-root], [data-modal-surface], [data-tab-swipe-ignore], .carousel-row, .story-card, .story-card-media, .prints-calculator-container'));
}

export default function TabSwipeNavigator() {
  const location = useLocation();
  const navigate = useNavigate();
  const touchRef = useRef(null);

  useEffect(() => {
    if (!['liquikits', 'komiprints'].includes(APP_ID)) return undefined;

    const handleTouchStart = (event) => {
      const touch = event.touches[0];
      if (!touch || shouldIgnoreSwipe(event.target) || getTabIndex(location.pathname) < 0) {
        touchRef.current = null;
        return;
      }
      touchRef.current = { startX: touch.clientX, startY: touch.clientY };
      window.dispatchEvent(new CustomEvent('family:tab-swipe', { detail: { type: 'start' } }));
    };

    const handleTouchMove = (event) => {
      const start = touchRef.current;
      const touch = event.touches[0];
      if (!start || !touch) return;
      const deltaX = touch.clientX - start.startX;
      const deltaY = touch.clientY - start.startY;
      if (Math.abs(deltaX) < 4 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) return;
      window.dispatchEvent(new CustomEvent('family:tab-swipe', { detail: { type: 'move', offset: deltaX * 0.92 } }));
    };

    const handleTouchEnd = (event) => {
      const start = touchRef.current;
      const touch = event.changedTouches[0];
      touchRef.current = null;
      if (!start || !touch) return;
      const deltaX = touch.clientX - start.startX;
      const deltaY = touch.clientY - start.startY;
      const isHorizontalSwipe = Math.abs(deltaX) >= 64 && Math.abs(deltaX) >= Math.abs(deltaY) * 1.25;
      window.dispatchEvent(new CustomEvent('family:tab-swipe', { detail: { type: 'end', offset: deltaX * 0.92, committed: isHorizontalSwipe } }));
      if (!isHorizontalSwipe) return;

      const currentIndex = getTabIndex(location.pathname);
      const nextIndex = currentIndex + (deltaX < 0 ? 1 : -1);
      if (nextIndex >= 0 && nextIndex < TAB_PATHS.length) navigate(TAB_PATHS[nextIndex]);
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [location.pathname, navigate]);

  return null;
}
