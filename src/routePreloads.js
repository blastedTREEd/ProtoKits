// Route-level imports are kept in one place so navigation can warm a page
// before the user commits to switching routes. Dynamic imports are cached by
// the browser and module loader, so repeated calls are inexpensive.
export const preloadKits = () => import('./pages/Kits');
