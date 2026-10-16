// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, FacebookAuthProvider, GoogleAuthProvider, setPersistence, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { initializeAppCheck, ReCaptchaV3Provider, getToken } from "firebase/app-check";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_BROWSER_API_KEY || import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

if (!firebaseConfig.apiKey) {
  throw new Error('Missing VITE_FIREBASE_BROWSER_API_KEY. Configure the app environment before starting Firebase.');
}

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export let appCheck = null;


// Initialize App Check (browser-only)
if (typeof window !== "undefined") {
  const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  const isLocalDevelopment = Boolean(
    import.meta.env.DEV
      && ['localhost', '127.0.0.1'].includes(window.location.hostname)
  );
  const enableLocalAppCheck = import.meta.env.VITE_ENABLE_APPCHECK_LOCAL === 'true';
  const debugTokenIsRegistered = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN_REGISTERED === 'true';
  const shouldUseLocalAppCheck = isLocalDevelopment
    && enableLocalAppCheck
    && debugTokenIsRegistered
    && Boolean(debugToken);

  // Never send an unregistered/stale debug token. Local App Check is an
  // explicit opt-in because a rejected debug exchange can prevent public
  // Firestore listeners from rendering their catalog.
  if (shouldUseLocalAppCheck) {
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  } else if (isLocalDevelopment && 'FIREBASE_APPCHECK_DEBUG_TOKEN' in globalThis) {
    try {
      delete globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN;
    } catch {
      // Ignore a non-configurable value left by a hot-reload session.
    }
  }

  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

  // Keep local App Check opt-in. A stale or unregistered debug token makes
  // Firebase reject otherwise-public Firestore listeners before the catalog
  // can render. Production deployments still initialize App Check normally.
  if (siteKey && (!isLocalDevelopment || shouldUseLocalAppCheck)) {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    // Request verification explicitly so a provider/domain failure is reported
    // with its App Check cause instead of only generic Firestore denials.
    void getToken(appCheck).then(() => {
      console.info('SG LOG: App Check verification ready.');
    }).catch((error) => {
      console.error('SG LOG: App Check verification failed:', error.code, error.message);
    });
  } else if (!isLocalDevelopment) {
    console.warn('Firebase App Check is not initialized because VITE_RECAPTCHA_SITE_KEY is missing.');
  }
}

// Enforce local persistence so session survives redirect
setPersistence(auth, browserLocalPersistence)
  .catch((error) => {
    console.error("DEBUG: Persistence error:", error);
  });

export const fbProvider = new FacebookAuthProvider();
export const googleProvider = new GoogleAuthProvider();
const FIRESTORE_CACHE_SIZE_BYTES = 40 * 1024 * 1024;
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    // Keep the shared catalog cache bounded while retaining offline-first
    // startup and multi-tab synchronization.
    cacheSizeBytes: FIRESTORE_CACHE_SIZE_BYTES,
    tabManager: persistentMultipleTabManager()
  })
});

