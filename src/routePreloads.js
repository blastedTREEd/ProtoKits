// Route-level imports are kept in one place so navigation can warm a page
// before the user commits to switching routes. Dynamic imports are cached by
// the browser and module loader, so repeated calls are inexpensive.
export const preloadLanding = () => import('./pages/Landing');
export const preloadKits = () => import('./pages/Kits');
export const preloadPrints = () => import('./pages/Prints');
export const preloadOrders = () => import('./pages/Orders');
export const preloadCart = () => import('./pages/Cart');

export const preloadRoute = (path) => {
  if (!path) return;
  if (path === '/') {
    preloadLanding();
  } else if (path === '/kits' || path.startsWith('/kits/')) {
    preloadKits();
  } else if (path === '/prints' || path.startsWith('/prints/')) {
    preloadPrints();
  } else if (path === '/orders' || path.startsWith('/orders/')) {
    preloadOrders();
  } else if (path === '/cart') {
    preloadCart();
  }
};
