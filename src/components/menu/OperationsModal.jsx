import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion as Motion, useDragControls } from 'framer-motion';
import { Calendar, CreditCard, Save, Settings, Truck, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import FulfillmentModal from './FulfillmentModal';
import PaymentSettingsModal from './PaymentSettingsModal';
import AdminCalendarModal from './AdminCalendarModal';

export default function OperationsModal({ isOpen, onClose, initialTab = 'shipping' }) {
  const { isDarkMode } = useTheme();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isSaving, setIsSaving] = useState(false);
  const [panelChanges, setPanelChanges] = useState({ shipping: false, payment: false });
  const dragControls = useDragControls();
  const shippingRef = useRef(null);
  const paymentRef = useRef(null);
  const hasChanges = panelChanges.shipping || panelChanges.payment;

  const handleShippingChanges = useCallback((changed) => {
    setPanelChanges(prev => prev.shipping === changed ? prev : { ...prev, shipping: changed });
  }, []);

  const handlePaymentChanges = useCallback((changed) => {
    setPanelChanges(prev => prev.payment === changed ? prev : { ...prev, payment: changed });
  }, []);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setPanelChanges({ shipping: false, payment: false });
    }
  }, [initialTab, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const handleSave = async () => {
    if (isSaving || !hasChanges) return;

    const savingsSources = [];
    if (shippingRef.current?.hasSavingsChange?.()) savingsSources.push('shipping');
    if (paymentRef.current?.hasSavingsChange?.()) savingsSources.push('payment');
    if (savingsSources.length > 0) {
      const sourceLabel = savingsSources.length === 2
        ? 'shipping and payment'
        : `${savingsSources[0]} ${savingsSources[0] === 'shipping' ? 'savings' : 'settings'}`;
      if (!window.confirm(`This will change ${sourceLabel} savings available to customers. Do you want to continue?`)) return;
    }

    setIsSaving(true);
    try {
      // Both panels remain mounted while switching tabs. Each panel therefore
      // retains its draft, and this single action commits both drafts.
      await Promise.all([
        shippingRef.current?.save?.({ skipSavingsConfirmation: true }),
        paymentRef.current?.save?.({ skipSavingsConfirmation: true })
      ]);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[400] flex items-end justify-center overflow-hidden p-0 lg:items-center lg:p-4">
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
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0 }}
            dragElastic={0.4}
            onDragEnd={(event, info) => {
              if (info.offset.y > 80) onClose();
            }}
            style={{ touchAction: 'pan-y' }}
            className={`relative flex h-[92vh] min-h-0 w-full flex-col overflow-hidden rounded-t-[2.5rem] text-[13px] shadow-2xl lg:h-[90vh] lg:max-h-[90vh] lg:max-w-5xl lg:rounded-[2.5rem] ${isDarkMode ? 'bg-neutral-900' : 'bg-white'}`}
          >
            <div className="flex shrink-0 justify-center pb-2 pt-4 lg:hidden">
              <div
                onPointerDown={(event) => dragControls.start(event)}
                className="h-1.5 w-12 cursor-grab touch-none rounded-full bg-black/10 active:cursor-grabbing dark:bg-white/10"
                aria-label="Drag down to close"
              />
            </div>

            <div className={`relative z-10 flex shrink-0 items-center justify-between border-b p-4 shadow-sm md:p-6 ${isDarkMode ? 'border-white/5 bg-neutral-900 shadow-black/20' : 'border-black/5 bg-white shadow-black/5'}`}>
              <div className="flex min-w-0 items-center gap-3">
                <div className="rounded-xl bg-garage-blue/10 p-2 text-garage-blue">
                  <Settings size={20} />
                </div>
                <h2 className="truncate text-[15px] font-black italic uppercase text-garage-blue">Operations</h2>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving || !hasChanges}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[13px] font-black uppercase tracking-widest text-white transition-all hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 md:px-4"
                >
                  <Save size={14} />
                  <span>{isSaving ? 'Saving' : 'Save'}</span>
                </button>
                <button onClick={onClose} className="hidden rounded-full bg-black/5 p-3 transition-all hover:bg-red-500/10 lg:flex" aria-label="Close operations">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className={`flex shrink-0 gap-2 border-b p-3 md:px-6 ${isDarkMode ? 'border-white/5 bg-white/[0.02]' : 'border-black/5 bg-black/[0.02]'}`}>
              <button
                onClick={() => setActiveTab('shipping')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 text-[13px] font-black uppercase tracking-widest transition-all ${activeTab === 'shipping' ? 'bg-garage-blue text-white shadow-lg shadow-blue-500/20' : 'opacity-50 hover:opacity-100'}`}
              >
                <Truck size={15} /> Shipping Options
              </button>
              <button
                onClick={() => setActiveTab('payment')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 text-[13px] font-black uppercase tracking-widest transition-all ${activeTab === 'payment' ? 'bg-garage-blue text-white shadow-lg shadow-blue-500/20' : 'opacity-50 hover:opacity-100'}`}
              >
                <CreditCard size={15} /> Payment Options
              </button>
              <button
                onClick={() => setActiveTab('calendar')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 text-[13px] font-black uppercase tracking-widest transition-all ${activeTab === 'calendar' ? 'bg-garage-blue text-white shadow-lg shadow-blue-500/20' : 'opacity-50 hover:opacity-100'}`}
              >
                <Calendar size={15} /> Garage Calendar
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden overscroll-contain">
              <FulfillmentModal
                ref={shippingRef}
                isOpen={isOpen}
                embedded
                visible={activeTab === 'shipping'}
                onClose={() => {}}
                onChangesChange={handleShippingChanges}
              />
              <PaymentSettingsModal
                ref={paymentRef}
                isOpen={isOpen}
                embedded
                visible={activeTab === 'payment'}
                onClose={() => {}}
                onChangesChange={handlePaymentChanges}
              />
              <AdminCalendarModal
                isOpen={isOpen}
                embedded
                visible={activeTab === 'calendar'}
                onClose={() => {}}
              />
            </div>
          </Motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
