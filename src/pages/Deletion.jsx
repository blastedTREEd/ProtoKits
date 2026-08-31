import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Loader2, LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';
import PageTemplate from './PageTemplate';
import { auth, app } from '../firebase/firebase';
import { useTheme } from '../context/ThemeContext';
import { useStore } from '../store/useStore';

const functions = getFunctions(app, 'asia-southeast1');
const requestAccountDeletion = httpsCallable(functions, 'requestUserAccountDeletion');

export default function Deletion({ isModal = false }) {
  const { isDarkMode } = useTheme();
  const { user, isAdmin } = useStore();
  const [isRequesting, setIsRequesting] = useState(false);

  const handleDeletionRequest = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.isAnonymous || !user?.uid) {
      window.alert('Please sign in to request account deletion.');
      return;
    }
    if (isAdmin) {
      window.alert('Admin accounts cannot use the customer account deletion flow.');
      return;
    }
    if (!window.confirm('Request account deletion now? You will be logged out, and your account will be permanently deleted after the 30-day grace period unless you log in again.')) return;

    setIsRequesting(true);
    try {
      await requestAccountDeletion();
      await signOut(auth);
    } catch (error) {
      console.error('SG LOG: Account deletion request failed:', error);
      window.alert(error?.message || 'Unable to start the account deletion countdown. Please try again.');
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <PageTemplate isDarkMode={isDarkMode} compact={isModal}>
      <div className={`max-w-3xl mx-auto p-6 md:p-12 text-left space-y-6 ${isDarkMode ? 'text-neutral-200' : 'text-neutral-800'}`}>
        <div>
          <h1 className={`text-3xl font-black uppercase tracking-tighter ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
            Delete Account
          </h1>
          <p className={`text-sm mt-1 ${isDarkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>Last Updated: August 31, 2026</p>
          <p className={`text-base mt-3 p-3 rounded-lg border inline-block ${
            isDarkMode
              ? 'bg-neutral-900 border-neutral-800 text-neutral-400'
              : 'bg-neutral-50 border-neutral-200 text-neutral-600'
          }`}>
            🧹 You can start deletion of your SnorlaxGarage account and associated personal data from this page.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-base">
          <div className={`h-full p-5 rounded-xl border space-y-3 ${
            isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
          }`}>
            <h2 className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
              ⏳ Deletion timeline
            </h2>
            <ul className={`list-disc pl-4 space-y-2 text-sm ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              <li><strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>Request:</strong> The button starts the 30-day grace period and signs you out.</li>
              <li><strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>Cancellation:</strong> Log in again during the grace period to cancel deletion.</li>
              <li><strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>Final deletion:</strong> Without another login, the account and personal data are permanently deleted.</li>
            </ul>
          </div>

          <div className={`h-full p-5 rounded-xl border space-y-3 ${
            isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
          }`}>
            <h2 className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
              🔔 Inactivity protection
            </h2>
            <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              After 30 days without a login, we send an email and begin the 30-day grace period. Logging in again cancels the countdown.
            </p>
            <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              Completed orders are retained for business and legal records. Final deletion removes the profile, basket, saved projects, and user-owned notifications.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDeletionRequest}
          disabled={isRequesting}
          className="mx-auto flex w-fit items-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRequesting ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
          {isRequesting ? 'processing' : 'logout and delete account'}
        </button>
      </div>
    </PageTemplate>
  );
}
