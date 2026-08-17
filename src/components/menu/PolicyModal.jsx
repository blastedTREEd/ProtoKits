import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { CreditCard, FileText, Loader2, Shield, Trash2, Truck, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const policyComponents = {
  privacy: {
    title: 'Privacy Policy',
    icon: Shield,
    Component: lazy(() => import('../../pages/PrivacyPolicy'))
  },
  terms: {
    title: 'Terms of Use',
    icon: FileText,
    Component: lazy(() => import('../../pages/TermsOfUse'))
  },
  deletion: {
    title: 'Data Deletion',
    icon: Trash2,
    Component: lazy(() => import('../../pages/Deletion'))
  },
  shipping: {
    title: 'Shipping Policy',
    icon: Truck,
    Component: lazy(() => import('../../pages/ShippingPolicy'))
  },
  payment: {
    title: 'Payment & Refund',
    icon: CreditCard,
    Component: lazy(() => import('../../pages/PaymentAndRefundPolicy'))
  }
};

export default function PolicyModal({ policy, isOpen, onClose, zIndexClass = 'z-[220]' }) {
  const { isDarkMode } = useTheme();
  const scrollRef = useRef(null);
  const [canDrag, setCanDrag] = useState(true);
  const activePolicy = policyComponents[policy] || policyComponents.privacy;
  const PolicyContent = activePolicy.Component;
  const PolicyIcon = activePolicy.icon;

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleScroll = (event) => {
    setCanDrag(event.currentTarget.scrollTop <= 0);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={`fixed inset-0 ${zIndexClass} flex items-end justify-center overflow-hidden p-0 lg:items-center lg:p-4`}>
          <Motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={onClose}
          />
          <Motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            className={`relative flex h-[92vh] w-full flex-col overflow-hidden rounded-t-[2.5rem] shadow-2xl lg:h-auto lg:max-h-[90vh] lg:max-w-5xl lg:rounded-[2.5rem] ${isDarkMode ? 'bg-neutral-900' : 'bg-white'}`}
          >
            <div className="flex w-full shrink-0 justify-center pb-2 pt-4 lg:hidden">
              <Motion.div
                drag={canDrag ? 'y' : false}
                dragConstraints={{ top: 0 }}
                dragElastic={0.4}
                onDragEnd={(event, info) => {
                  if (info.offset.y > 80) onClose();
                }}
                className="h-1.5 w-12 cursor-grab touch-none rounded-full bg-black/10 active:cursor-grabbing dark:bg-white/10"
                aria-label="Drag down to close"
              />
            </div>

            <div className={`relative z-10 flex shrink-0 items-center justify-between border-b p-6 shadow-sm md:p-8 ${isDarkMode ? 'border-white/5 bg-neutral-900 shadow-black/20' : 'border-black/5 bg-white shadow-black/5'}`}>
              <div className="ml-2 flex items-center gap-3">
                <div className="rounded-xl bg-garage-blue/10 p-2 text-garage-blue">
                  <PolicyIcon size={20} />
                </div>
                <h2 className="text-lg font-black italic uppercase text-garage-blue md:text-xl">{activePolicy.title}</h2>
              </div>
              <button onClick={onClose} className="mr-2 hidden rounded-full bg-black/5 p-3 transition-all hover:bg-red-500/10 lg:flex" aria-label="Close policy">
                <X size={20} />
              </button>
            </div>

            <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto custom-scrollbar">
              <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="animate-spin text-garage-blue" size={30} /></div>}>
                <PolicyContent isModal />
              </Suspense>
            </div>
          </Motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
