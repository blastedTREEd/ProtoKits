import { useLayoutEffect, useState } from 'react';

const getViewportNavbarHeight = () => {
  if (typeof window === 'undefined') return 60;
  return window.innerWidth < 640 ? 56 : 60;
};

export default function useNavbarHeight() {
  const [navbarHeight, setNavbarHeight] = useState(getViewportNavbarHeight);

  useLayoutEffect(() => {
    const navbar = document.querySelector('[data-app-navbar]');
    if (!navbar) return undefined;

    const updateHeight = () => {
      const nextHeight = Math.round(navbar.getBoundingClientRect().height);
      if (nextHeight > 0) setNavbarHeight(nextHeight);
    };

    updateHeight();
    window.addEventListener('resize', updateHeight, { passive: true });
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(updateHeight) : null;
    resizeObserver?.observe(navbar);

    return () => {
      window.removeEventListener('resize', updateHeight);
      resizeObserver?.disconnect();
    };
  }, []);

  return navbarHeight;
}
