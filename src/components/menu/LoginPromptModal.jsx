import React from 'react';
import { X, LogIn, Sparkles } from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import { FcGoogle } from 'react-icons/fc';

export default function LoginPromptModal({ isOpen, onClose, onLogin, onContinue, continueLabel = 'Continue as Guest' }) {
  const { isDarkMode } = useTheme();
  
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 overflow-hidden">
          <Motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={onClose} 
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
              if (info.offset.y > 100) onClose();
            }}
            className={`relative w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl flex flex-col items-center text-center space-y-6 ${isDarkMode ? 'bg-neutral-900' : 'bg-white'}`}
          >
            {/* Drag Handle for Mobile */}
            <div className="w-full flex justify-center pb-2 md:hidden">
              <div className="w-12 h-1.5 rounded-full bg-black/10 dark:bg-white/10" />
            </div>

            <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full bg-black/5 hover:bg-black/10 transition-all"><X size={20} /></button>
            
            <div className="p-4 rounded-3xl bg-blue-600/10 text-blue-600">
              <Sparkles size={32} />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-black italic uppercase">Login Required</h2>
              <p className="text-xs font-medium opacity-60">Log in with Google to track your orders, save addresses, and enjoy a faster checkout experience.</p>
            </div>

            <button 
              onClick={onLogin} 
              className="w-full py-4 bg-white text-neutral-900 border border-neutral-300 hover:bg-neutral-50 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 transition-all"
            >
              <FcGoogle size={18} />
              <span>Login with Google</span>
            </button>
            {onContinue && (
              <button
                onClick={onContinue}
                className="w-full py-4 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 rounded-2xl font-black uppercase text-xs tracking-widest transition-all"
              >
                {continueLabel}
              </button>
            )}
          </Motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
