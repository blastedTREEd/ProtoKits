import React, { useState, useMemo } from 'react';
import { 
  Plus, Spool, Box, Layers, ArrowRight, Magnet, Waypoints, Check, ArrowLeft, RotateCcw, X, Search
} from 'lucide-react';

export default function ExtrasSelection({ 
  extras = [], 
  selectedExtras = [], 
  onToggleExtra, 
  onUpdateQty,
  projectDetails = [], 
  projectCase = 'STL',
  onProceed,
  activePrinter,
  onBack 
}) {
  const is3MF = projectCase === '3MF';
  const itemLabel = is3MF ? 'Plate' : 'Model';
  const itemIcon = is3MF ? <Layers size={14} strokeWidth={3} /> : <Box size={14} strokeWidth={3} />;

  const [activeItemIdx, setActiveItemIdx] = useState(0);
  const [focusedInput, setFocusedInput] = useState(null);
  const [modes, setModes] = useState({}); 

  // 1. DATA CALCULATIONS
  const currentItemData = useMemo(() => projectDetails[activeItemIdx], [projectDetails, activeItemIdx]);
  const { length: L = 0, width: W = 0, height: H = 0 } = currentItemData?.config || {};
  const { x: MX = 220, y: MY = 220, z: MZ = 240 } = activePrinter?.buildCapacity || { x: 220, y: 220, z: 240 };

  const px = Math.max(1, Math.ceil(L / MX));
  const py = Math.max(1, Math.ceil(W / MY));
  const pz = Math.max(1, Math.ceil(H / MZ));

  const currentItemParts = px * py * pz;
  const seamCount = ((px - 1) * py * pz) + ((py - 1) * px * pz) + ((pz - 1) * px * py);

  // 2. HELPERS
  const blockInvalidChar = (e) => { if (['-', '+', 'e', 'E', '.'].includes(e.key)) e.preventDefault(); };
  const getAssignmentQty = (extraId) => {
    const selection = selectedExtras.find(s => String(s.id) === String(extraId));
    return selection?.assignments?.[activeItemIdx] ?? 0;
  };
  const getTotalAssignedQty = (extraId) => {
    const selection = selectedExtras.find(s => String(s.id) === String(extraId));
    return Object.values(selection?.assignments || {}).reduce((sum, qty) => sum + (parseInt(qty, 10) || 0), 0);
  };

  const availableExtras = useMemo(() => {
    return extras.filter(e => e.status === 'enabled').map(extra => {
      if (extra.hasVariants && extra.variants) {
        return { 
          ...extra, 
          variants: [...extra.variants].sort((a, b) => (parseInt(b.qty) || 0) - (parseInt(a.qty) || 0)) 
        };
      }
      return extra;
    });
  }, [extras]);

  // 3. LOGIC HANDLERS
  const handleToggleLogic = (item) => {
    const existing = selectedExtras.find(s => String(s.id) === String(item.id));
    if (!existing) {
      const dv = (item.hasVariants && item.variants?.length) ? item.variants[0] : null;
      onToggleExtra({ 
        ...item, 
        plateIdx: activeItemIdx, 
        selectedVariant: dv, 
        selectedSize: dv?.size || dv?.name, 
        price: dv?.price || item.price 
      });
      setModes(prev => ({ ...prev, [item.id]: 'Equal' }));
    }
  };

  const handleCardClick = (item, currentQty) => {
    if (currentQty > 0 || currentQty === '') {
      onUpdateQty(item.id, 0, activeItemIdx);
    } else {
      handleToggleLogic(item);
      const isMagnet = item.name?.toLowerCase().includes('magnet');
      const unitPerPlane = isMagnet ? (seamCount * 2) : seamCount;
      const mode = modes[item.id] || 'Equal';
      onUpdateQty(item.id, mode === 'Equal' && seamCount > 0 ? unitPerPlane : 1, activeItemIdx);
    }
  };

  return (
    <div className="space-y-0 text-center mb-6 text-[var(--color-text-main)] select-none">
      <style>{`input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }`}</style>

      {/* --- NAVIGATION --- */}
      <div className="space-y-0 text-center mb-6">
        <h2 className="text-[12px] font-black uppercase mb-2 flex items-center justify-center gap-2 text-blue-600 px-4">
          {itemIcon} {itemLabel} Selection {projectDetails.length > 0 && <span className="opacity-40">({activeItemIdx + 1}/{projectDetails.length})</span>}
        </h2>
        
        <div className="relative w-full h-[90px] flex items-center">
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-2 px-4 w-full h-full snap-x">
            {projectDetails.map((item, idx) => {
              const isCurrent = activeItemIdx === idx;
              return (
                <div key={idx} className="flex items-center gap-2 flex-shrink-0 snap-center">
                  <button 
                    type="button"
                    onClick={() => { setActiveItemIdx(idx); setFocusedInput(null); }} 
                    className={`relative flex-shrink-0 rounded-[12rem] border-2 transition-all duration-300 flex flex-col items-center justify-center
                      ${isCurrent 
                        ? 'w-[58px] h-[58px] bg-[var(--color-surface)] border-blue-600 text-blue-600 scale-110 z-10 shadow-lg' 
                        : 'w-[50px] h-[50px] bg-black/5 dark:bg-white/5 border-gray-400/30 opacity-40 text-black dark:text-white'}`}
                  >
                    <div className="flex flex-col items-center leading-none">
                      {isCurrent ? <Check size={16} strokeWidth={4} className="mb-0.5 animate-in zoom-in" /> : itemIcon}
                      <span className="text-[9px] font-black uppercase italic">M{item.no || idx + 1}</span>
                    </div>
                  </button>

                  {isCurrent && currentItemParts > 1 && (
                    <div className="flex items-center px-1 gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                       <div className="flex flex-col items-center justify-center w-[80px] h-[50px] rounded-full border-2 border-blue-600/30">
                        <span className="text-[13px] font-black leading-none">{currentItemParts}</span>
                        <span className="text-[9px] font-black text-blue-600/50 uppercase">Parts</span>
                      </div>
                      <div className="flex flex-col items-center justify-center w-[80px] h-[50px] rounded-full border-2 border-blue-600/30">
                        <span className="text-[13px] font-black leading-none">{seamCount}</span>
                        <span className="text-[9px] font-black text-blue-600/50 uppercase">Planes</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* --- ADD-ONS LIST --- */}
      <div className="px-3 w-full max-w-2xl mx-auto grid gap-3 pb-[160px] sm:pb-32 md:pb-32 lg:pb-32">
        {availableExtras.map((item) => {
          const currentTotalQty = getAssignmentQty(item.id);
          const selection = selectedExtras.find(s => String(s.id) === String(item.id));
          const totalAssignedQty = getTotalAssignedQty(item.id);
          const isCurrentlySelected = (currentTotalQty > 0) || (focusedInput === item.id);
          
          const isMagnet = item.name?.toLowerCase().includes('magnet');
          const isConnector = isMagnet || item.name?.toLowerCase().includes('dowel') || item.name?.toLowerCase().includes('pin');
          const selectedVariant = selection?.selectedVariant || (item.hasVariants ? item.variants?.[0] : null);
          const selectedVariantStock = parseInt(selectedVariant?.qty, 10) || 0;
          const variantStatus = String(selection?.status || item.status || '').toLowerCase();
          const isUpfrontOnly = variantStatus === 'upfront';
          const isVariantInsufficient = !isUpfrontOnly && totalAssignedQty > selectedVariantStock;
          const needsUpfront = isUpfrontOnly || isVariantInsufficient;
          const shortageQty = Math.max(0, totalAssignedQty - selectedVariantStock);
          
          const currentMode = modes[item.id] || 'Equal';
          const unitPerPlane = isMagnet ? (seamCount * 2) : seamCount;
          
          const canBeEqual = seamCount > 0 && isConnector;
          const displayQty = (canBeEqual && currentMode === 'Equal') 
            ? (currentTotalQty === '' ? '' : Math.floor(currentTotalQty / unitPerPlane)) 
            : currentTotalQty;

          return (
            <div key={item.id} 
              onClick={() => handleCardClick(item, currentTotalQty)} 
              className={`rounded-[2.2rem] border-2 transition-all p-5 bg-transparent cursor-pointer 
                ${isCurrentlySelected ? 'border-blue-600 shadow-lg' : 'border-black/5 dark:border-white/5 opacity-60 hover:border-black/10 dark:hover:border-white/10'}`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`p-3 rounded-[1rem] ${isCurrentlySelected ? 'bg-blue-600/10 text-blue-600' : 'bg-black/5 dark:bg-white/5 text-gray-500'}`}>
                    {isMagnet ? <Magnet size={20} /> : <Spool size={20} />}
                  </div>
                  <div className="text-left truncate">
                    <p className={`text-[8px] font-black uppercase italic tracking-wider ${isCurrentlySelected ? 'text-blue-600' : 'text-gray-500'}`}>
                      {currentTotalQty > 0 ? (canBeEqual && currentMode === 'Equal' ? 'SMART EQUAL' : 'CUSTOM QTY') : 'ADD-ON'}
                    </p>
                    <h4 className={`font-black uppercase text-[12px] tracking-tight ${isCurrentlySelected ? 'text-[var(--color-text-main)]' : 'text-gray-500'}`}>{item.name}</h4>
                    {selectedVariant && (
                      <p className={`text-[9px] font-black uppercase mt-1 ${needsUpfront ? 'text-amber-600' : 'text-gray-500'}`}>
                        {selectedVariant.size || selectedVariant.name}
                        {` • ${selectedVariantStock} in stock`}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <div className={`flex items-center rounded-full p-1 border-2 transition-colors ${isCurrentlySelected ? 'bg-black/5 dark:bg-white/5 border-blue-600/50' : 'border-transparent'}`}>
                    <input 
                      type="number" 
                      onKeyDown={blockInvalidChar} 
                      value={displayQty === 0 || displayQty === '' ? '' : displayQty} 
                      placeholder="0"
                      onFocus={() => { 
                        setFocusedInput(item.id); 
                        handleToggleLogic(item); 
                        onUpdateQty(item.id, '', activeItemIdx); 
                      }}
                      onBlur={() => setFocusedInput(null)}
                      onChange={e => {
                        const val = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0);
                        const finalVal = (canBeEqual && currentMode === 'Equal' && val !== '') ? (val * unitPerPlane) : val;
                        onUpdateQty(item.id, finalVal, activeItemIdx);
                      }}
                      className={`w-10 text-center font-black italic text-[14px] bg-transparent outline-none ${isCurrentlySelected ? 'text-blue-600' : 'text-gray-400'}`}
                    />
                    <button 
                      type="button"
                      onClick={() => {
                        handleToggleLogic(item);
                        const nextVal = (parseInt(displayQty) || 0) + 1;
                        onUpdateQty(item.id, (canBeEqual && currentMode === 'Equal') ? (nextVal * unitPerPlane) : nextVal, activeItemIdx);
                      }} 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white bg-blue-600 active:scale-90"
                    >
                      <Plus size={14} strokeWidth={4} />
                    </button>
                  </div>
                </div>
              </div>

              {isCurrentlySelected && (
                <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/5 flex flex-col gap-4 animate-in slide-in-from-top-2" onClick={e => e.stopPropagation()}>
                  {selectedVariant && (
                    <div className={`rounded-[1.2rem] border px-4 py-3 text-left ${needsUpfront ? 'border-amber-500/40 bg-amber-500/10' : 'border-black/5 dark:border-white/5 bg-black/20'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${needsUpfront ? 'text-amber-600' : 'text-gray-400'}`}>
                          {needsUpfront ? 'Upfront Required' : 'Stock Covered'}
                        </span>
                        <span className={`text-[10px] font-black uppercase ${needsUpfront ? 'text-amber-600' : 'text-green-600'}`}>
                          {totalAssignedQty} / {selectedVariantStock}
                        </span>
                      </div>
                      <p className={`mt-2 text-[9px] font-bold uppercase tracking-tight ${needsUpfront ? 'text-amber-700 dark:text-amber-500' : 'text-gray-500'}`}>
                        {needsUpfront
                          ? (isUpfrontOnly
                            ? 'Excess pack sharing applies.'
                            : `${shortageQty} more pc(s) than stock, new pack will be used.`)
                          : 'Stock is sufficient.'}
                      </p>
                    </div>
                  )}

                  {item.hasVariants && (
                    <div className="grid grid-cols-3 gap-2">
                      {item.variants.map(v => (
                        <button key={v.id} type="button" onClick={() => onToggleExtra({ ...item, plateIdx: activeItemIdx, price: v.price, selectedSize: v.size || v.name, selectedVariant: v })} 
                          className={`px-2 py-2 rounded-xl border text-[10px] font-black uppercase transition-all ${String(selection?.selectedSize) === String(v.size || v.name) ? 'bg-blue-600 text-white border-blue-600' : 'bg-black/5 dark:bg-white/5 text-gray-500 border-transparent'}`}>
                          <span className="block">{v.size || v.name}</span>
                          <span className="block text-[8px] opacity-60 normal-case">{parseInt(v.qty, 10) || 0} stock</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

 {/* --- COLUMN-SPECIFIC FOOTER --- */}
 <div className="sm:absolute md:fixed lg:absolute bottom-0 left-0 right-0 w-full p-2 z-[110]">
  <div className="px-4 py-2">
    <div className="flex gap-3 bg-[var(--color-bg)]/80 backdrop-blur-md p-2 rounded-[2.5rem] border border-black/10 dark:border-white/10 shadow-2xl">
      
      {/* BACK BUTTON */}
      <button
        type="button"
        onClick={onBack}
        className="flex-none h-14 w-14 rounded-full bg-neutral-900 text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
        aria-label="Back"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button 
              type="button"
              onClick={onProceed} 
              className="flex-1 h-14 rounded-[2.2rem] bg-blue-600 text-white font-black italic uppercase text-xs tracking-[0.2em] flex items-center justify-center gap-4 shadow-xl active:scale-95 group transition-all shadow-blue-600/20"
            >
              ESTIMATE COST 
              <div className="p-1 rounded-full bg-white/20 group-hover:translate-x-1 transition-transform">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="4" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
