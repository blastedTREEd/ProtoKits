import React from 'react';
import { Plus, PackagePlus } from 'lucide-react';

export default function AddKitCard({ onClick }) {

  return (
    <button
      onClick={onClick}
      className="w-full group relative flex flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed p-10 bg-blue-600/5 border-blue-600/10 hover:border-blue-600/50 transition-all hover:scale-[1.02] active:scale-95"
    >
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-cyan-400 text-white shadow-xl shadow-blue-600/20">
        <PackagePlus size={40} className="group-hover:rotate-12 transition-transform" />
        <div className="absolute -top-1 -right-1 bg-cyan-300 rounded-full p-1 border-2 border-blue-600">
            <Plus size={12} strokeWidth={4} />
        </div>
      </div>
      <span className="mt-4 text-[10px] font-black uppercase tracking-widest text-blue-600 opacity-60 group-hover:opacity-100">New Kit</span>
    </button>
  );
}