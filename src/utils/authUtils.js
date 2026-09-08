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
    return 'Popup was blocked by your browser. Please allow popups for this site or use Redirect Login.';
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
  
  return error.message || 'Authentication failed.';
};
