// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, FacebookAuthProvider, GoogleAuthProvider, setPersistence, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "REDACTED_API_KEY",
  authDomain: "snorlaxgarage.firebaseapp.com",
  projectId: "snorlaxgarage",
  storageBucket: "snorlaxgarage.firebasestorage.app",
  messagingSenderId: "429861406122",
  appId: "1:429861406122:web:7cb9803acf0f35f34f57d3"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export let appCheck = null;


// Initialize App Check (browser-only)
if (typeof window !== "undefined") {
  if (import.meta.env.DEV) {
    // Enable debug provider in local development
  # App Check debug token removed from history
  }

  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

  if (siteKey) {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } else {
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

