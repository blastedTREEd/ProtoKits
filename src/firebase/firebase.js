// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, FacebookAuthProvider, GoogleAuthProvider, setPersistence, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

if (!firebaseConfig.apiKey) {
  throw new Error('Missing VITE_FIREBASE_API_KEY. Configure the app environment before starting Firebase.');
}

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export let appCheck = null;


// Initialize App Check (browser-only)
if (typeof window !== "undefined") {
  const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  const isLocalDevelopment = Boolean(
    import.meta.env.DEV && window.location.hostname === 'localhost'
  );

  if (import.meta.env.DEV) {
    // Enable debug provider in local development with pre-registered token
    if (debugToken) self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }

  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

  if (siteKey && (!isLocalDevelopment || debugToken)) {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
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

