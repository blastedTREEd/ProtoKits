import React, { useState } from 'react';
import { useStore } from '../../store/useStore';

export default function CaseSelection({ onSelect, selectedCase = null }) {
  const [expandedId, setExpandedId] = useState(() => selectedCase?.id || null);

  const cases = useStore((state) => state.methods);
  const handleToggle = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const selectedMethod = cases.find(item => item.id === expandedId);

  return (
    <div className="relative animate-in fade-in slide-in-from-bottom-4 duration-500">
      <style>{`
        @keyframes soft-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(0.97); }
        }
        .animate-status-pulse {
          animation: soft-pulse 2s infinite ease-in-out;
        }
      `}</style>

      <div className="grid grid-cols-1 gap-3 mb-4">
        {cases.map((item) => {
          const isSelected = expandedId === item.id;
          return (
            <div 
              key={item.id}
              className={`rounded-[2.5rem] border-2 transition-all duration-500 ease-out overflow-hidden ${
                isSelected 
                ? 'bg-[var(--color-surface)] border-[var(--color-primary)] shadow-xl shadow-[var(--color-primary)]/10 scale-[1.01]' 
                : 'bg-transparent border-gray-200 dark:border-white/10 hover:border-[var(--color-primary)]/40'
              }`}
            >
              <button 
                onClick={() => handleToggle(item.id)}
                className={`w-full flex justify-between items-center outline-none group transition-all duration-500 ${
                  isSelected ? 'p-6 pb-0' : 'p-6' 
                }`}
              >
                <div className="flex items-center gap-4 pl-2">
                  <div className={`font-black italic uppercase text-2xl transition-all duration-300 tracking-tighter ${
                    isSelected ? 'text-[var(--color-primary)] scale-105 origin-left' : 'text-[var(--color-text-main)] group-hover:translate-x-1'
                  }`}>
                    {item.name}
                  </div>
                </div>

                <div className="flex items-center gap-5">
                  <span className={`text-[12px] font-black italic tracking-tight transition-all duration-500 uppercase animate-status-pulse text-[var(--color-primary)]`}>
                    {isSelected ? `PROJECT ${item.accuracy}` : item.tagline}
                  </span>
                  
                  <div className={`p-1.5 rounded-full transition-all duration-500 ${
                    isSelected ? 'bg-[var(--color-primary)] rotate-180 text-white shadow-lg' : 'bg-[var(--color-text-main)]/5 opacity-20'
                  }`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="4" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </button>

              <div className={`transition-all duration-500 ease-in-out px-8 overflow-hidden ${
                isSelected ? 'max-h-[500px] pb-6 opacity-100' : 'max-h-0 opacity-0'
              }`}>
                <div className="flex flex-col text-left gap-3">
                  <div className={`h-px w-full -mt-1.5 transition-colors duration-500 ${
                    isSelected ? 'bg-[var(--color-primary)]/20' : 'bg-[var(--color-border)] opacity-30'
                  }`} />
                  
                  <p className={`text-[14px] font-medium leading-relaxed italic transition-colors ${
                    isSelected ? 'text-[var(--color-text-main)]' : 'text-[var(--color-text-main)]/60'
                  }`}>
                    {item.description}
                  </p>

                  <div className="flex flex-col gap-2 pt-1">
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors duration-500 ${
                      isSelected ? 'text-[var(--color-primary)]' : 'text-black dark:text-white'
                    }`}>
                      REQUIRED INPUT:
                    </span>
                    
                    <div className="flex flex-wrap gap-1.5">
                      {item.requirements.map((req, idx) => (
                        <span key={idx} className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-xl border transition-all ${
                          isSelected 
                            ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/20 shadow-sm' 
                            : 'bg-[var(--color-text-main)]/[0.03] text-[var(--color-text-main)]/40 border-transparent'
                        }`}>
                          {req}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`px-5 sticky bottom-4 left-0 w-full mt-4 transition-all duration-500 z-50 
        ${expandedId ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 pointer-events-none scale-95'}`}
      >
        <div className="bg-[var(--color-bg)]/80 backdrop-blur-md p-1 rounded-[2.5rem] border border-gray-200 dark:border-white/10 shadow-2xl">
          <button 
            onClick={() => onSelect(selectedMethod)}
            className="w-full py-5 rounded-[2.2rem] font-black italic uppercase tracking-[0.2em] text-xs bg-[var(--color-primary)] text-white shadow-xl flex items-center justify-center gap-4 group active:scale-95 transition-all"
          >
            NEXT
            <div className="p-1 rounded-full bg-white/20 group-hover:translate-x-1 transition-transform">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="4" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}