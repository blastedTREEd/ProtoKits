import { signInWithPopup } from 'firebase/auth';

/**
 * Authentication helper utilities for Firebase Auth
 * Provides descriptive user-friendly error messages and troubleshooting guidance for local development.
 */

export const getReadableAuthErrorMessage = (error) => {
  if (!error) return 'Authentication failed.';
  const code = error.code || '';
  
  if (code === 'auth/unauthorized-domain') {
    return 'Domain unauthorized: If you are using 127.0.0.1, switch to http://localhost:5173 or add your current host/IP in Firebase Console > Authentication > Settings > Authorized Domains.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Login window closed before completing. On localhost, ad-blockers or Chrome third-party cookie blocking often close popups automatically.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Popup was blocked by your browser. Please allow popups for this localhost app and try again.';
  }
  if (code === 'auth/cancelled-popup-request') {
    return 'A previous login attempt was cancelled. Please try again.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'This authentication provider is not enabled in your Firebase Console.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network request failed. Please check your internet connection or disable ad-blockers.';
  }

  const diagnosticText = `${code} ${error.message || ''}`.toLowerCase();
  if (diagnosticText.includes('api-key') || diagnosticText.includes('requests from referer') || diagnosticText.includes('referrer')) {
    return 'Firebase rejected this local URL. Use the direct localhost URL for this app or add the current localhost host to the Firebase API key HTTP referrers and Authentication authorized domains.';
  }
  if (code === 'auth/internal-error') {
    return 'Firebase could not complete local Google login. Allow popups for this localhost app and retry.';
  }
  
  return error.message || 'Authentication failed.';
};

export const signInWithPopupFlow = (auth, provider) => signInWithPopup(auth, provider);
