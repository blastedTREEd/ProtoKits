import React, { forwardRef, useImperativeHandle, useState, useEffect, useRef } from 'react';
import { X, CreditCard } from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { useTheme } from '../../context/ThemeContext';
import PaymentOptions from './PaymentOptions';

const PaymentSettingsModal = forwardRef(function PaymentSettingsModal({ isOpen, onClose, embedded = false, visible = true }, ref) {
  const { isDarkMode } = useTheme();
  const { user, updateShippingSettings, publishCheckoutSettings, shippingSettings, deletePaymentMethods } = useStore();
  const scrollRef = useRef(null);
  const [canDrag, setCanDrag] = useState(true);

  const cleanPaymentMethods = (methods = {}) => {
    return Object.fromEntries(
      Object.entries(methods).filter(([key, value]) => {
        const k = key.toLowerCase();
        // Hapusin ang fee keys at null/undefined na QR values (para hindi mag-pollute sa Firestore)
        if (k.endsWith('fee')) return false;
        if (k.endsWith('qr') && (value === null || value === undefined)) return false;
        return true;
      })
    );
  };
  
  const getInitialSettings = (settings) => {
    const savedSettings = settings?.paymentSettings || {};
    return {
      plans: {
        full: savedSettings.plans?.full !== false,
        installment: savedSettings.plans?.installment ?? true
      },
      // 'cash' is the only forced default. 'gcash' is user-managed and can be deleted/re-added.
      methods: { cash: true, ...cleanPaymentMethods(savedSettings.methods || {}) },
      handlingFee: Number(savedSettings.handlingFee ?? 0),
      installmentFee: Number(savedSettings.installmentFee ?? 0),
      cashInFee: Number(savedSettings.cashInFee ?? 0),
      transferFee: Number(savedSettings.transferFee ?? 0),
      exclusiveDiscountPercent: Number(savedSettings.exclusiveDiscountPercent ?? 100),
      preOrderSettleDays: Number(savedSettings.preOrderSettleDays ?? 10),
      reservationSettleDays: Number(savedSettings.reservationSettleDays ?? 10),
      projectSettleDays: Number(savedSettings.projectSettleDays ?? 10),
      maintenanceMode: savedSettings.maintenanceMode ?? (savedSettings.showPayNow === false),
      maintenanceInvalidTypes: {
        kit: savedSettings.maintenanceInvalidTypes?.kit ?? true,
        prints: savedSettings.maintenanceInvalidTypes?.prints ?? true
      }
    };
  };

  // State management
  const [paymentSettings, setPaymentSettings] = useState(() => getInitialSettings(shippingSettings));
  // Track methods deleted this session so we can purge them from Firestore on save
  const [deletedMethods, setDeletedMethods] = useState([]);

  // I-sync lang ang local state kapag nagbukas ang modal (isOpen: false → true).
  // HINDI mag-re-reset kapag nag-update ang shippingSettings habang bukas ang modal —
  // kaya naiiwasan ang bug na nire-reset ang mga edits ng user dahil sa real-time Firestore push.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      // Bagong pagbubukas ng modal — i-load ang pinakabagong Firestore state
      setPaymentSettings(getInitialSettings(shippingSettings));
      setDeletedMethods([]);
    }
    wasOpenRef.current = isOpen;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (embedded) return undefined;
    if (isOpen && !embedded) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, embedded]);

  const handleScroll = (e) => {
    setCanDrag(e.target.scrollTop <= 0);
  };

  const handleToggleSetting = (category, option) => {
    setPaymentSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [option]: !prev[category]?.[option]
      }
    }));
  };

  const updatePaymentData = (category, option, value) => {
    if (!category) {
      setPaymentSettings(prev => ({
        ...prev,
        [option]: value
      }));
      return;
    }

    setPaymentSettings(prev => ({
        ...prev,
        [category]: {
            ...prev[category],
            [option]: value
        }
    }));
  };

  // I-delete ang payment method kasama ang lahat ng related keys (QR, TransferDiscount, DiscountAmount)
  const deleteMethod = (method) => {
    setPaymentSettings(prev => {
      const updatedMethods = { ...prev.methods };
      delete updatedMethods[method];
      delete updatedMethods[`${method}Qr`];
      delete updatedMethods[`${method}TransferDiscount`];
      delete updatedMethods[`${method}DiscountAmount`];
      return { ...prev, methods: updatedMethods };
    });
    setDeletedMethods(prev => [...prev, method]);
  };

  const getPaymentSavingsState = (settings = {}) => {
    const methods = settings.methods || {};
    const methodDiscounts = Object.fromEntries(
      Object.keys(methods)
        .filter(key => key.toLowerCase().endsWith('transferdiscount') || key.toLowerCase().endsWith('discountamount'))
        .sort()
        .map(key => [key, methods[key]])
    );

    return JSON.stringify({
      installmentFee: Number(settings.installmentFee) || 0,
      exclusiveDiscountPercent: Number(settings.exclusiveDiscountPercent ?? 100) || 0,
      methodDiscounts
    });
  };

  const hasPaymentSavingsChange = () => (
    getPaymentSavingsState(paymentSettings) !== getPaymentSavingsState(shippingSettings?.paymentSettings)
  );

  const handleSave = async ({ skipSavingsConfirmation = false } = {}) => {
    if (!skipSavingsConfirmation && hasPaymentSavingsChange() && !window.confirm('This will change payment savings available to customers. Do you want to continue?')) {
      return false;
    }

    try {
      // Merge with existing settings to ensure we only update what's changed and preserve existing fields
      const existingSettings = shippingSettings?.paymentSettings || {};
      const normalizedPaymentSettings = {
        ...existingSettings,
        ...paymentSettings,
        plans: {
          ...existingSettings.plans,
          ...paymentSettings.plans
        },
        methods: {
          ...existingSettings.methods,
          ...cleanPaymentMethods(paymentSettings.methods || {})
        },
        handlingFee: Math.max(0, Number(paymentSettings.handlingFee) || 0),
        installmentFee: Math.max(0, Number(paymentSettings.installmentFee) || 0),
        cashInFee: Math.max(0, Number(paymentSettings.cashInFee) || 0),
        transferFee: Math.max(0, Number(paymentSettings.transferFee) || 0),
        exclusiveDiscountPercent: Math.min(100, Math.max(0, Number(paymentSettings.exclusiveDiscountPercent) || 0)),
        preOrderSettleDays: Math.max(1, Number(paymentSettings.preOrderSettleDays) || 10),
        reservationSettleDays: Math.max(1, Number(paymentSettings.reservationSettleDays) || 10),
        projectSettleDays: Math.max(1, Number(paymentSettings.projectSettleDays) || 10),
        maintenanceInvalidTypes: {
          kit: paymentSettings.maintenanceInvalidTypes?.kit !== false,
          prints: paymentSettings.maintenanceInvalidTypes?.prints !== false
        }
      };

      // I-purge ang deleted methods mula sa normalizedPaymentSettings bago i-save
      // (kasama ang kanilang QR, TransferDiscount, at DiscountAmount keys)
      if (deletedMethods.length > 0) {
        deletedMethods.forEach(method => {
          delete normalizedPaymentSettings.methods[method];
          delete normalizedPaymentSettings.methods[`${method}Qr`];
          delete normalizedPaymentSettings.methods[`${method}TransferDiscount`];
          delete normalizedPaymentSettings.methods[`${method}DiscountAmount`];
        });
      }

      // Step 1: Explicitly delete removed payment method keys from Firestore using deleteField().
      if (deletedMethods.length > 0) {
        await deletePaymentMethods(deletedMethods);
      }

      // Step 2: Write all surviving payment settings via updateDoc with dot-notation paths
      await updateShippingSettings(user.uid, {
        paymentSettings: normalizedPaymentSettings
      });

      try {
        await publishCheckoutSettings({
          paymentSettings: normalizedPaymentSettings
        });
      } catch (publishError) {
        console.warn("Payment settings saved, but public checkout settings failed to publish.", publishError);
      }

      onClose();
      return true;
    } catch (err) {
      console.error(err);
      alert("Failed to update payment settings.");
    }
  };

  useImperativeHandle(ref, () => ({ save: handleSave, hasSavingsChange: hasPaymentSavingsChange }));

  const settingsContent = (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="min-h-0 flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar touch-pan-y"
    >
      <PaymentOptions
        paymentSettings={paymentSettings}
        handleToggleSetting={handleToggleSetting}
        updatePaymentData={updatePaymentData}
        handleSave={handleSave}
        deleteMethod={deleteMethod}
        showSave={!embedded}
      />
    </div>
  );

  if (embedded) {
    return (
      <div className={`h-full min-h-0 ${visible ? 'flex' : 'hidden'} flex-col`}>
        {settingsContent}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 overflow-hidden">
          <Motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md" 
            onClick={onClose} 
          />
          <Motion.div 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 400 }}
            drag={canDrag ? "y" : false}
            dragConstraints={{ top: 0 }}
            dragElastic={0.4}
            onDragEnd={(e, info) => {
              if (info.offset.y > 100) onClose();
            }}
            className={`relative w-full md:max-w-xl h-[92vh] md:h-auto md:max-h-[90vh] overflow-hidden flex flex-col rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl ${isDarkMode ? 'bg-neutral-900' : 'bg-white'}`}
          >
            {/* Drag Handle for Mobile */}
            <div className="w-full flex justify-center pt-4 pb-2 md:hidden shrink-0">
              <div className="w-12 h-1.5 rounded-full bg-black/10 dark:bg-white/10" />
            </div>

            <div className={`p-6 md:p-8 flex justify-between items-center border-b shadow-sm relative z-10 shrink-0 ${isDarkMode ? 'border-white/5 bg-neutral-900 shadow-black/20' : 'border-black/5 bg-white shadow-black/5'}`}>
               <div className="flex items-center gap-3 ml-2">
                 <div className="p-2 rounded-xl bg-garage-blue/10 text-garage-blue">
                   <CreditCard size={20} />
                 </div>
                 <h2 className="text-lg md:text-xl font-black italic uppercase text-garage-blue">Payment Options</h2>
               </div>
               <button onClick={onClose} className="p-3 rounded-full bg-black/5 hover:bg-red-500/10 transition-all mr-2"><X size={20} /></button>
            </div>
            
            {settingsContent}
          </Motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});

export default PaymentSettingsModal;
