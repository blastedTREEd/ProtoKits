import React, { useEffect } from 'react';
import { useStore } from '../../store/useStore';

export default function Toast() {
  const { toastMessage, setToastMessage } = useStore();
  
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage, setToastMessage]);
  
  if (!toastMessage) return null;
  
  return (
    <div className="fixed inset-x-0 bottom-20 z-[999999] flex justify-center pointer-events-none px-4">
      <div className="px-8 py-3 bg-amber-500 dark:bg-white text-white dark:text-neutral-900 rounded-2xl font-black uppercase text-[12px] shadow-2xl shadow-blue-500/20 text-center whitespace-nowrap pointer-events-auto border border-white/10 dark:border-black/10">
        {toastMessage}
      </div>
    </div>
  );
}
