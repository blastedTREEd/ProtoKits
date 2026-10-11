import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useStore } from '../../store/useStore';

export default function RatesToast() {
  const ratesToastMessage = useStore((state) => state.ratesToastMessage);
  if (!ratesToastMessage) return null;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100000] px-6 py-3.5 rounded-full bg-emerald-600 text-white font-black italic uppercase tracking-[0.2em] text-[13px] shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-none">
      <CheckCircle2 size={18} strokeWidth={3} />
      <span>{ratesToastMessage}</span>
    </div>
  );
}
