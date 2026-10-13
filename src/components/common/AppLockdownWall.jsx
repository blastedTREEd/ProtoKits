import React, { useEffect, useState } from 'react';
import { signInWithPopup, signOut } from 'firebase/auth';
import { FcGoogle } from 'react-icons/fc';
import { auth, googleProvider } from '../../firebase/firebase';
import { APP_CONFIG } from '../../appConfig';
import { useStore } from '../../store/useStore';
import { getReadableAuthErrorMessage } from '../../utils/authUtils';

export default function AppLockdownWall() {
  const { appLockdown, isAdmin, user, isAnonymousUser, isSyncing, syncStatus, beginAuthAttempt, setAuthAttemptStatus, failAuthAttempt } = useStore();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState('');
  const isLocked = appLockdown?.[APP_CONFIG.id] === true;

  useEffect(() => {
    if (!isLocked || !user || isAnonymousUser || isAdmin || isSyncing || syncStatus !== 'Ready') return undefined;
    void signOut(auth).catch((error) => console.error('App lockdown sign-out failed:', error));
    return undefined;
  }, [isAdmin, isAnonymousUser, isLocked, isSyncing, syncStatus, user]);

  if (!isLocked || isAdmin) return null;

  const handleGoogleSignIn = async () => {
    if (isSigningIn) return;
    const authAttemptId = beginAuthAttempt(() => handleGoogleSignIn());
    setIsSigningIn(true);
    setAuthError('');
    try {
      if (auth.currentUser) await signOut(auth);
      await signInWithPopup(auth, googleProvider);
      setAuthAttemptStatus(authAttemptId, 'Syncing Profile');
    } catch (error) {
      setAuthError(getReadableAuthErrorMessage(error));
      failAuthAttempt(authAttemptId, error);
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-neutral-950/80 px-5 py-8 backdrop-blur-md">
      <section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white p-7 text-center shadow-2xl dark:bg-neutral-900">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600">{APP_CONFIG.label}</p>
        <h1 className="mt-3 text-3xl font-black italic uppercase tracking-tight text-neutral-950 dark:text-white">Welcome</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-neutral-500 dark:text-neutral-300">This app is temporarily limited to administrators. Sign in with Google to continue.</p>
        <button type="button" onClick={handleGoogleSignIn} disabled={isSigningIn} className="mx-auto mt-7 inline-flex items-center justify-center gap-3 rounded-full border border-black/10 bg-white px-6 py-3 text-xs font-black uppercase tracking-widest text-neutral-900 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-wait disabled:opacity-60 dark:border-white/10 dark:bg-neutral-800 dark:text-white">
          <FcGoogle size={18} />
          {isSigningIn ? 'Checking access...' : 'Sign in with Google'}
        </button>
        {authError && <p className="mt-4 text-xs font-bold text-red-500">{authError}</p>}
        {user && !isAnonymousUser && !isAdmin && !isSigningIn && !isSyncing && syncStatus === 'Ready' && <p className="mt-4 text-xs font-bold text-amber-600">This Google account is not an administrator.</p>}
      </section>
    </div>
  );
}
