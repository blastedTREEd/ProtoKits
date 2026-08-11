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
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);


// Initialize App Check (browser-only)
if (typeof window !== "undefined") {
  if (import.meta.env.DEV) {
    // Enable debug provider in local development
  # App Check debug token removed from history
  }

  // Fallback to a dummy key in development if VITE_RECAPTCHA_SITE_KEY is not defined yet
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "6Lc_some_dummy_key_for_development_AAAAAA";

  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

// Enforce local persistence so session survives redirect
setPersistence(auth, browserLocalPersistence)
  .catch((error) => {
    console.error("DEBUG: Persistence error:", error);
  });

export const fbProvider = new FacebookAuthProvider();
export const googleProvider = new GoogleAuthProvider();
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

