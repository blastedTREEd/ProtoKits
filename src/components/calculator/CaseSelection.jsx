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
    <div className="relative min-h-[calc(100dvh-210px)] lg:min-h-[calc(90dvh-210px)] flex flex-col pb-[160px] sm:pb-32 md:pb-32 lg:pb-32 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <style>{`
        @keyframes soft-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(0.97); }
        }
        .animate-status-pulse {
          animation: soft-pulse 2s infinite ease-in-out;
        }
      `}</style>

      <div className="px-3 w-full max-w-2xl mx-auto grid grid-cols-1 gap-3">
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
                  <span className={`text-[10px] font-black italic tracking-tight transition-all duration-500 uppercase animate-status-pulse text-[var(--color-primary)]`}>
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
                  
                  <p className={`text-[10px] font-medium leading-relaxed italic transition-colors ${
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
                    
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {item.requirements.map((req, idx) => (
                        <span key={idx} className={`text-[10px] font-black uppercase tracking-widest transition-colors ${
                          isSelected 
                            ? 'text-[var(--color-primary)]' 
                            : 'text-[var(--color-text-main)]/40'
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

      <div className="fixed left-1/2 bottom-0 md:bottom-[5dvh] z-[260] w-full max-w-[calc(100vw-2rem)] md:max-w-2xl lg:max-w-2xl -translate-x-1/2 px-3 pb-5 pt-8 bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)]/90 to-transparent lg:rounded-b-[2rem]">
        <div className="flex items-center gap-3 bg-[var(--color-bg)]/90 backdrop-blur-xl p-2 rounded-[2.5rem] border border-black/5 dark:border-white/5 shadow-2xl">
          <button 
            onClick={() => selectedMethod && onSelect(selectedMethod)}
            disabled={!selectedMethod}
            className={`flex-1 h-14 rounded-[2.2rem] font-black italic uppercase tracking-[0.2em] text-xs bg-[var(--color-primary)] text-white shadow-xl flex items-center justify-center gap-4 group active:scale-95 transition-all ${selectedMethod ? '' : 'opacity-50 cursor-not-allowed active:scale-100'}`}
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
