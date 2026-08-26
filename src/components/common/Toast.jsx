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
      <div className="rounded-2xl border border-white/15 bg-black/80 px-8 py-3 text-center text-[12px] font-black uppercase whitespace-nowrap text-white shadow-2xl shadow-black/35 backdrop-blur-xl pointer-events-auto">
        {toastMessage}
      </div>
    </div>
  );
}
