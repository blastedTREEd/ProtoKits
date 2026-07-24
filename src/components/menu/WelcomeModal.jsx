import React, { useState } from 'react';
import { X, Sparkles, MapPin, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';

export default function WelcomeModal({ isOpen, onClose, onSetup }) {
  const { user, updateUserProfile } = useStore();
  const [isSkipping, setIsSkipping] = useState(false);

  const handleSkip = async () => {
    if (!user) return;
    setIsSkipping(true);
    useStore.setState({ isSyncing: true, syncStatus: 'Loading Profile' });
    try {
      await updateUserProfile(user.uid, {
        userDetails: {
          ...user.userDetails,
          welcomeSeen: true
        }
      });
      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to skip onboarding.");
    } finally {
      setIsSkipping(false);
      useStore.setState({ isSyncing: false });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 md:p-6 overflow-hidden">
          <Motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-xl" 
            onClick={handleSkip} 
          />
          
          <Motion.div 
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 400 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.4}
            onDragEnd={(e, info) => {
              if (info.offset.y > 100) handleSkip();
            }}
            className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-[2.5rem] shadow-2xl overflow-hidden border border-black/5 dark:border-white/10"
          >
            {/* Drag Handle for Mobile */}
            <div className="w-full flex justify-center pt-4 md:hidden">
              <div className="w-12 h-1.5 rounded-full bg-black/10 dark:bg-white/10" />
            </div>

            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-garage-blue via-blue-400 to-garage-blue" />
            
            <button 
              onClick={handleSkip}
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-all text-neutral-400"
            >
              <X size={20} />
            </button>

            <div className="p-8 md:p-10 flex flex-col items-center text-center space-y-8">
              <div className="w-20 h-20 rounded-3xl bg-garage-blue/10 flex items-center justify-center text-garage-blue relative">
                <Sparkles size={40} />
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-2xl bg-amber-400 text-white flex items-center justify-center shadow-lg border-2 border-white dark:border-neutral-900">
                   <span className="text-[10px] font-black uppercase tracking-tighter">Hi!</span>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-3xl font-black italic uppercase tracking-tighter text-neutral-900 dark:text-white leading-none">
                  Welcome to<br/>
                  <span className="text-garage-blue">Snorlax Garage</span>
                </h2>
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-sm mx-auto">
                  We're glad to have you! To ensure a seamless checkout experience later, we recommend setting up your delivery details now.
                </p>
              </div>

              <div className="w-full grid grid-cols-1 gap-3">
                 <div className="flex items-center gap-4 p-4 rounded-2xl bg-black/5 dark:bg-white/5 text-left border border-transparent hover:border-garage-blue/20 transition-all group">
                    <div className="w-10 h-10 rounded-xl bg-garage-blue text-white flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                       <MapPin size={20} />
                    </div>
                    <div>
                       <p className="text-[10px] font-black uppercase text-garage-blue">Saved Addresses</p>
                       <p className="text-[9px] font-bold opacity-60">Store multiple delivery locations for faster checkout.</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-4 p-4 rounded-2xl bg-black/5 dark:bg-white/5 text-left border border-transparent hover:border-garage-blue/20 transition-all group">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                       <ShieldCheck size={20} />
                    </div>
                    <div>
                       <p className="text-[10px] font-black uppercase text-emerald-600">Secure Profile</p>
                       <p className="text-[9px] font-bold opacity-60">Your information is safe and used only for fulfillment.</p>
                    </div>
                 </div>
              </div>

              <div className="w-full flex flex-col gap-3 pt-2">
                <button 
                  onClick={onSetup}
                  className="w-full py-5 bg-garage-blue text-white rounded-3xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-500/20 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  <span>Setup Account Details</span>
                  <ArrowRight size={16} />
                </button>
                <button 
                  onClick={handleSkip}
                  disabled={isSkipping}
                  className="w-full py-4 bg-transparent text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  {isSkipping ? <Loader2 className="animate-spin" size={14} /> : 'I\'ll do it later (Skip)'}
                </button>
              </div>
            </div>
          </Motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
