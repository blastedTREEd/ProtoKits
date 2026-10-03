const APP_IDS = Object.freeze([
  'snorlaxgarage',
  'liquikits',
  'komiprints',
  'garagecore',
  'daivevargas'
]);

const APP_CONFIGS = Object.freeze({
  snorlaxgarage: {
    id: 'snorlaxgarage',
    label: 'SnorlaxGarage',
    brandLines: ['SNORLAX', 'GARAGE'],
    market: 'all',
    basketScope: 'legacy',
    orderDomain: null,
    homePath: '/',
    nav: ['home', 'kits', 'prints', 'orders'],
    allowedMarkets: ['kits', 'prints']
  },
  liquikits: {
    id: 'liquikits',
    label: 'LIQUIKITS',
    brandLines: ['LIQUI', 'KITS'],
    market: 'kits',
    basketScope: 'liquikits',
    orderDomain: 'liquikits',
    homePath: '/',
    nav: ['home', 'kits', 'orders'],
    allowedMarkets: ['kits']
  },
  komiprints: {
    id: 'komiprints',
    label: 'KOMIPRINTS',
    brandLines: ['KOMI', 'PRINTS'],
    market: 'prints',
    basketScope: 'komiprints',
    orderDomain: 'komiprints',
    homePath: '/',
    nav: ['home', 'prints', 'orders'],
    allowedMarkets: ['prints']
  },
  garagecore: {
    id: 'garagecore',
    label: 'GARAGECORE',
    brandLines: ['GARAGE', 'CORE'],
    market: 'admin',
    basketScope: 'legacy',
    orderDomain: null,
    homePath: '/',
    nav: ['home', 'kits', 'prints', 'orders', 'dashboard'],
    allowedMarkets: ['kits', 'prints', 'admin']
  },
  daivevargas: {
    id: 'daivevargas',
    label: 'DAIVEVARGAS',
    brandLines: ['DAIVE', 'VARGAS'],
    market: 'portfolio',
    basketScope: 'legacy',
    orderDomain: null,
    homePath: '/',
    nav: ['home', 'about'],
    allowedMarkets: []
  }
});

const requestedAppId = String(import.meta.env.VITE_APP_ID || 'snorlaxgarage')
  .trim()
  .toLowerCase();

export const APP_CONFIG = APP_CONFIGS[requestedAppId] || APP_CONFIGS.snorlaxgarage;
export const APP_ID = APP_CONFIG.id;
export const isLegacyApp = APP_ID === 'snorlaxgarage';
// Garagecore is an operations surface: its catalog pages keep the admin
// layout for guests, but mutations remain protected by the real admin flag.
export const isOperationsApp = APP_ID === 'garagecore';
export const isAdminSurfaceApp = isLegacyApp || isOperationsApp;

export const getGuestBasketStorageKey = () => (
  isLegacyApp ? 'sg_guest_basket' : `sg_guest_basket:${APP_CONFIG.basketScope}`
);

export const isMarketEnabled = (market) => (
  APP_CONFIG.allowedMarkets.includes(market)
);

export const isPathAllowedForApp = (pathname) => {
  if (APP_ID === 'snorlaxgarage') return true;
  if (APP_ID === 'daivevargas') {
    return pathname === '/' || pathname === '/about-us' || pathname.startsWith('/privacy-policy')
      || pathname.startsWith('/terms-of-use') || pathname.startsWith('/data-deletion');
  }
  if (pathname === '/' || pathname === '/about-us' || pathname.startsWith('/privacy-policy')
    || pathname.startsWith('/terms-of-use') || pathname.startsWith('/data-deletion')
    || pathname.startsWith('/shipping-policy') || pathname.startsWith('/payment-and-refund-policy')) {
    return true;
  }
  if (pathname === '/shelf') return APP_ID === 'snorlaxgarage' || APP_ID === 'garagecore';
  if (pathname.startsWith('/kits')) return isMarketEnabled('kits');
  if (pathname.startsWith('/prints') || pathname.startsWith('/blueprints')) return isMarketEnabled('prints');
  if (pathname.startsWith('/orders') || pathname.startsWith('/cart') || pathname.startsWith('/basket')
    || pathname.startsWith('/checkout') || pathname.startsWith('/notify-list')) {
    return APP_ID !== 'daivevargas';
  }
  if (pathname.startsWith('/users-dashboard')) return APP_ID === 'garagecore';
  return false;
};

export const getAppRoute = (pathname) => {
  if (pathname === '/') return APP_CONFIG.homePath;
  return APP_CONFIG.homePath;
};

export const isPortfolioApp = APP_ID === 'daivevargas';
