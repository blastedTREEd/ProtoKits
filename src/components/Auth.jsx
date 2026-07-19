import React, { useEffect } from 'react';
import { auth } from "../firebase/firebase";
import { FacebookAuthProvider, signInWithCredential, signOut } from "firebase/auth";
import { useStore } from '../store/useStore';

const Auth = () => {
  const syncUserAccount = useStore(state => state.syncUserAccount);
  const user = useStore(state => state.user);

  useEffect(() => {
    if (!auth) return;

    // Listen for real auth state changes and sync with global store
    const unsubscribe = auth.onAuthStateChanged((u) => {
      syncUserAccount(u);
    });
    return () => unsubscribe();
  }, [syncUserAccount]);

  useEffect(() => {
    // Initialize Facebook SDK
    window.fbAsyncInit = function() {
      window.FB.init({
        appId      : 'YOUR_FACEBOOK_APP_ID', // TODO: REPLACE WITH YOUR REAL ID
        cookie     : true,
        xfbml      : true,
        version    : 'v18.0'
      });
    };
  }, []);

  // --- AUTH HANDLERS ---
  const login = () => {
    if (!window.FB) return alert("Facebook SDK not loaded yet.");
    window.FB.login((response) => {
      if (response.authResponse) {
        const credential = FacebookAuthProvider.credential(response.authResponse.accessToken);
        signInWithCredential(auth, credential)
          .catch((error) => console.error("Firebase Login Error:", error));
      } else {
        console.log('User cancelled login or did not fully authorize.');
      }
    }, {scope: 'public_profile,email'});
  };

  const logout = () => {
    if (confirm("Are you sure you want to log out?")) {
        signOut(auth);
    }
  };

  // Determine button visibility/action
  const renderLoginButton = () => {
    if (!user) {
      return (
        <button
          onClick={login}
          className="px-4 py-1.5 rounded-lg bg-[#1877f2] text-white text-xs font-bold hover:bg-[#166fe5] transition-colors shadow-lg shadow-blue-600/20 active:scale-95"
        >
          FB Login
        </button>
      );
    }

    // User is logged in
    return (
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block leading-none">
             <p className="text-[10px] font-black uppercase italic tracking-tighter text-white">{user.displayName}</p>
             <button onClick={logout} className="text-[8px] font-bold opacity-40 hover:opacity-100 uppercase tracking-widest text-white mt-1">Logout</button>
          </div>
          <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-white/10 shadow-lg">
             <img src={user.photoURL} alt="profile" className="w-full h-full object-cover" />
          </div>
          <button onClick={logout} className="sm:hidden text-white/40 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
          </button>
        </div>
    );
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[500] px-6 py-3 flex justify-between items-center pointer-events-none">
      {/* Branding */}
      <div className="opacity-0">SG</div>

      <div className="pointer-events-auto">
        {renderLoginButton()}
      </div>
    </div >
  );
};

export default Auth;
