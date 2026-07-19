import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { 
  Plus, Layers, WeightTilde, Droplet, ClockCheck, 
  Settings2, Copy, Trash2, X, Lock, Check, AlertTriangle, Search,
  Tag, Link2
} from 'lucide-react';
import MaterialCard from './MaterialCard';

export default function ProjectPreview({ 
  allFilaments = [], 
  onConfirm, 
  selectedFilaments = [],
  previewData = [], 
  setPreviewData,
  // 🔥 NEW METADATA
  projectName,
  gdriveLink,
  updateMetadata
}) {
  const containerBorderStyle = "border-[1.5px] border-gray-400/40 shadow-sm";
  const MAX_PLATES = 8;

  const inputRefs = {
    days: useRef(null), hours: useRef(null), mins: useRef(null), secs: useRef(null)
  };

  // --- 1. INITIALIZATION & SYNC ---
  useEffect(() => {
    const filaments = allFilaments || [];
    if ((!previewData || previewData.length === 0) && filaments.length > 0 && selectedFilaments && selectedFilaments.length > 0) {
        const initial = selectedFilaments.map((f, idx) => {
          const totalMinutes = parseInt(f.time || 0);
          return {
            id: Date.now() + idx,
            no: idx + 1,
            weight: f.weight || '',
            days: Math.floor(totalMinutes / 1440) || '',
            hours: Math.floor((totalMinutes % 1440) / 60) || '',
            mins: totalMinutes % 60 || '',
            secs: '', 
            materialId: String(f.materialId || f.id),
          };
        });
        setPreviewData(initial);
    } else if ((!previewData || previewData.length === 0) && filaments.length > 0) {
      const defaultId = filaments.find(f => f.status?.toLowerCase() === 'upfront')?.id || filaments[0]?.id;
      setPreviewData([{ id: Date.now(), no: 1, weight: '', days: '', hours: '', mins: '', secs: '', materialId: String(defaultId) }]);
    }
  }, [selectedFilaments, allFilaments]);

  // --- 2. MEMOIZED DATA & LOGIC ---
  const plates = useMemo(() => previewData || [], [previewData]);
  const [activePlateId, setActivePlateId] = useState(null);
  const [isSelectingMaterial, setIsSelectingMaterial] = useState(false);
  const [isManageMode, setIsManageMode] = useState(false);
  const [matSearchQuery, setMatSearchQuery] = useState('');

  const effectiveActiveId = activePlateId || (plates.length > 0 ? plates[0].id : null);
  
  const activePlate = useMemo(() => 
    plates.find(p => p.id === effectiveActiveId) || plates[0] || {},
    [plates, effectiveActiveId]
  );

  const getLatestMaterial = useCallback((mId, allPlates) => {
    const filaments = allFilaments || [];
    const found = filaments.find(f => String(f.id) === String(mId));
    if (!found) return null;

    const totalRequired = (allPlates || []).reduce((acc, p) => {
      return String(p.materialId) === String(mId) ? acc + (parseFloat(p.weight) || 0) : acc;
    }, 0);

    const stock = parseFloat(found?.remaining || 0);
    const isUpfrontType = found.status?.toLowerCase() === 'upfront' || stock <= 0;
    const isInsufficient = !isUpfrontType && totalRequired > stock;

    return {
      ...found,
      remaining: stock,
      totalRequired, 
      isInsufficient,
      isUpfront: isInsufficient || isUpfrontType
    };
  }, [allFilaments]);

  const currentMaterial = useMemo(() => {
    const mId = activePlate?.materialId;
    return getLatestMaterial(mId, plates);
  }, [activePlate, plates, getLatestMaterial]);

  const sortedMaterials = useMemo(() => {
    const filaments = allFilaments || [];
    const activeMatId = String(activePlate?.materialId || '');
    const projectPaletteIds = new Set([
      ...(selectedFilaments || []).map(f => String(f.materialId || f.id)),
      ...(plates || []).map(p => String(p.materialId))
    ]);

    let list = [...filaments]
      .filter(f => {
        const stock = parseFloat(f.remaining || 0);
        const isInProjectPalette = projectPaletteIds.has(String(f.id));
        return stock > 0 || isInProjectPalette || f.status?.toLowerCase() === 'upfront';
      });

    if (matSearchQuery.trim()) {
      const q = matSearchQuery.toLowerCase();
      list = list.filter(f => 
        f.name?.toLowerCase().includes(q) || 
        f.brand?.toLowerCase().includes(q) || 
        f.type?.toLowerCase().includes(q)
      );
    }

    return list.map(f => {
        const totalIfUsed = (plates || []).reduce((acc, p) => {
          const targetId = (p.id === activePlate.id) ? f.id : p.materialId;
          return String(targetId) === String(f.id) ? acc + (parseFloat(p.weight) || 0) : acc;
        }, 0);
        const stock = parseFloat(f.remaining || 0);
        const isUpfrontType = f.status?.toLowerCase() === 'upfront';
        const isInsufficient = !isUpfrontType && totalIfUsed > stock;

        return { ...f, totalRequired: totalIfUsed, isUpfront: isInsufficient || isUpfrontType || stock <= 0 };
      })
      .sort((a, b) => {
        if (String(a.id) === activeMatId) return -1;
        if (String(b.id) === activeMatId) return 1;
        return (parseFloat(b.remaining) || 0) - (parseFloat(a.remaining) || 0);
      });
  }, [allFilaments, activePlate, plates, selectedFilaments, matSearchQuery]);

  // --- 3. UPDATERS & NAVIGATION ---
  const updatePlateData = useCallback((id, field, value) => {
    if (isManageMode && field !== 'materialId') return;
    let processedValue = value;
    if (field === 'weight') {
      processedValue = value.replace(/[^0-9.]/g, ''); 
      if ((processedValue.match(/\./g) || []).length > 1) return;
    }
    setPreviewData(prev => (prev || []).map(p => (p.id === id ? { ...p, [field]: processedValue } : p)));
  }, [isManageMode, setPreviewData]);

  const isPlateValid = (p) => {
    const pWeight = parseFloat(p.weight) || 0;
    const hasTime = (Number(p.days) || 0) + (Number(p.hours) || 0) + (Number(p.mins) || 0) + (Number(p.secs) || 0) > 0;
    return pWeight > 0 && hasTime;
  };

  const isEverythingValid = plates.every(isPlateValid);
  const firstIncomplete = plates.find(p => !isPlateValid(p));

  const handleNext = () => {
    if (!isPlateValid(activePlate)) return;
    const nextIncomplete = plates.find(p => !isPlateValid(p));
    if (nextIncomplete) {
      setActivePlateId(nextIncomplete.id);
    } else if (isEverythingValid) {
      handleFinalConfirm();
    }
  };

  const handleFinalConfirm = () => {
    const filaments = allFilaments || [];
    const projectSummary = plates.map(p => {
      const days = Number(p.days || 0);
      const hours = Number(p.hours || 0);
      const mins = Number(p.mins || 0);
      const time = (days * 1440) + (hours * 60) + mins;
      const mat = filaments.find(f => String(f.id) === String(p.materialId));

      return {
        id: p.id, no: p.no,
        sliced: { weight: Number(p.weight), time, breakdown: { days, hours, mins, secs: Number(p.secs || 0) } },
        material: {
          materialId: p.materialId,
          material: mat ? {
            ...mat, id: mat.id, remaining: Number(mat.remaining || 0), price: Number(mat.price || 0),
            weight: Number(mat.weight || 0), loadTime: Number(mat.loadTime || 0),
            purgeTime: Number(mat.purgeTime || mat.cleanBuffer || 0),
            isUpfront: mat.status?.toLowerCase() === 'upfront' || (Number(p.weight) > Number(mat.remaining || 0)) || (Number(mat.remaining || 0) <= 0)
          } : null,
        }
      };
    });
    onConfirm(projectSummary);
  };

  const deletePlate = (id) => {
    if (plates.length <= 1) return;
    const updated = plates.filter(p => p.id !== id).map((p, idx) => ({ ...p, no: idx + 1 }));
    setPreviewData(updated);
    if (effectiveActiveId === id) setActivePlateId(updated[0].id);
  };

  const handleTimeChange = (field, value) => {
    let cleanValue = value.replace(/[^0-9]/g, '').slice(0, 2);
    if (cleanValue === '') {
      updatePlateData(effectiveActiveId, field, '');
      return;
    }
    const numValue = parseInt(cleanValue);
    if (field === 'hours' && numValue > 23) cleanValue = "23";
    if ((field === 'mins' || field === 'secs') && numValue > 59) cleanValue = "59";
    updatePlateData(effectiveActiveId, field, cleanValue);

    if (cleanValue.length === 2) {
      const order = ['days', 'hours', 'mins', 'secs'];
      const currentIndex = order.indexOf(field);
      if (currentIndex < order.length - 1) inputRefs[order[currentIndex + 1]].current?.focus();
    }
  };

  return (
    <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10 text-black dark:text-white text-left">
      <style>{`
        @keyframes pulse-subtle { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .animate-pulse-subtle { animation: pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
       input[type=number] { -moz-appearance: textfield; }
      `}</style>

      {/* 🔥 NEW: PROJECT METADATA SECTION */}
      <div className="space-y-4 px-2">
        <div className="flex flex-col gap-3">
           <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-primary)] ml-2 flex items-center gap-2">
                <Tag size={12} strokeWidth={3} /> Project Name
              </label>
              <div className="relative">
                <input 
                  value={projectName}
                  onChange={(e) => updateMetadata({ projectName: e.target.value })}
                  placeholder="e.g. My Custom Build"
                  className={`w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl px-5 py-4 text-xs font-black uppercase tracking-widest outline-none focus:border-[var(--color-primary)] transition-all`}
                />
              </div>
           </div>

           <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-primary)] ml-2 flex items-center gap-2">
                <Link2 size={12} strokeWidth={3} /> GDrive Link
              </label>
              <div className="relative">
                <input 
                  value={gdriveLink}
                  onChange={(e) => updateMetadata({ gdriveLink: e.target.value })}
                  placeholder="https://drive.google.com/..."
                  className={`w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl px-5 py-4 text-xs font-bold outline-none focus:border-[var(--color-primary)] transition-all`}
                />
              </div>
           </div>
        </div>
      </div>
      
      {/* --- PLATE NAVIGATION --- */}
      <div className="space-y-0 text-center">
        <h2 className="text-[12px] font-black uppercase mb-2 flex items-center justify-center gap-2 text-[var(--color-primary)]">
          <Layers size={14} strokeWidth={3} /> Build Plates {plates.length > 0 && <span className="opacity-40">({plates.length}/{MAX_PLATES})</span>}
        </h2>
        <div className="relative w-full h-[90px] flex items-center">
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-4 px-4 w-full h-full snap-x">
            {plates.map((plate) => (
              <button 
                key={plate.id} 
                onClick={() => { setActivePlateId(plate.id); setIsSelectingMaterial(false); }} 
                className={`relative flex-shrink-0 rounded-[12rem] border-2 transition-all duration-300 flex flex-col items-center justify-center snap-center 
                  ${effectiveActiveId === plate.id ? (
                    isManageMode 
                      ? (plates.length > 1 ? 'w-[58px] h-[58px] bg-red-500/5 border-red-500 text-red-500 scale-110 z-10' : 'w-[58px] h-[58px] bg-gray-400/5 border-gray-400 text-gray-400 scale-110 z-10')
                      : 'w-[58px] h-[58px] bg-[var(--color-surface)] border-[var(--color-primary)] text-[var(--color-primary)] scale-110 z-10'
                  ) : 'w-[50px] h-[50px] bg-black/5 dark:bg-white/5 border-gray-400/30 opacity-40 text-black dark:text-white'}`}
              >
                {isManageMode && effectiveActiveId === plate.id ? (
                  <div onClick={(e) => { e.stopPropagation(); deletePlate(plate.id); }} className="flex flex-col items-center animate-in zoom-in duration-200 leading-none">
                    {plates.length > 1 ? (
                      <><Trash2 size={18} strokeWidth={3} className="mb-0.5" /><span className="text-[9px] font-black uppercase italic">BP{plate.no}</span></>
                    ) : (
                      <><Lock size={14} strokeWidth={3} className="mb-0.5" /><span className="text-[9px] font-black uppercase italic">BP{plate.no}</span></>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center leading-none">
                    {isPlateValid(plate) ? <Check size={16} strokeWidth={4} className="mb-0.5 animate-in zoom-in" /> : <Layers size={14} strokeWidth={3} className="mb-0.5" />}
                    <span className="text-[9px] font-black uppercase italic">BP{plate.no}</span>
                  </div>
                )}
              </button>
            ))}
            {plates.length < MAX_PLATES && (
              <button 
                onClick={() => {
                  const newId = Date.now();
                  setPreviewData(prev => [...(prev || []), { id: newId, no: (prev || []).length + 1, weight: '', days: '', hours: '', mins: '', secs: '', materialId: activePlate.materialId || (allFilaments || [])[0]?.id }]);
                  setActivePlateId(newId);
                  setIsSelectingMaterial(false);
                  setIsManageMode(false);
                }} 
                className="relative flex-shrink-0 w-[50px] h-[50px] rounded-full border-2 border-dashed border-[var(--color-primary)] text-[var(--color-primary)] flex items-center justify-center active:scale-90 transition-all opacity-80"
              >
                <Plus size={22} strokeWidth={3} />
              </button>
            )}
            <button onClick={() => { setIsManageMode(!isManageMode); setIsSelectingMaterial(false); }} className={`relative flex-shrink-0 w-[50px] h-[50px] rounded-full border-2 transition-all active:scale-90 flex items-center justify-center ${isManageMode ? 'border-black dark:border-white bg-[var(--color-surface)] z-10' : 'border-black/30 dark:border-white/30 opacity-80'}`} >
              {isManageMode ? <X size={15} strokeWidth={4} /> : <Settings2 size={16} strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      </div>

      {/* --- FORM SECTION --- */}
      <div className={`space-y-8 transition-all duration-500 relative ${isManageMode ? 'opacity-30 pointer-events-none' : ''}`}>
        <div className="flex gap-4 items-end">
          <div className="w-[43%] flex flex-col items-center text-center">
            <label className="text-[12px] font-black uppercase mb-2 flex items-center justify-center gap-2 text-[var(--color-primary)]">
              <WeightTilde size={14} strokeWidth={3} /> BP{activePlate.no} Weight
            </label>
            <div className={`w-full min-h-[68px] h-auto bg-transparent rounded-[1.8rem] relative flex flex-col items-center justify-center overflow-hidden transition-all duration-500 py-3 ${containerBorderStyle}`}>
              <div className="flex items-baseline justify-center">
                <input type="number"  inputMode="decimal" value={activePlate.weight} onFocus={() => updatePlateData(effectiveActiveId, 'weight', '')} onChange={(e) => updatePlateData(effectiveActiveId, 'weight', e.target.value)} placeholder="0" className={`w-14 text-center bg-transparent border-none outline-none font-black text-[18px] italic ${currentMaterial?.isUpfront ? 'text-red-600' : 'text-black dark:text-white'}`} />
                <span className={`text-[12px] font-black italic ${currentMaterial?.isUpfront ? 'text-red-600' : 'text-black dark:text-white'}`}>G</span>
              </div>
              {currentMaterial?.isUpfront && (
                <div className="flex items-center gap-1 animate-pulse-subtle mt-0.5">
                  <AlertTriangle size={8} className="text-red-600" />
                  <span className="text-[9px] font-black uppercase text-red-600 italic">Upfront Req.</span>
                </div>
              )}
            </div>
          </div>
          <div className="w-[57%] flex flex-col items-center text-center">
            <label className="text-[12px] font-black uppercase mb-2 flex items-center justify-center gap-2 text-[var(--color-primary)]">
              <Droplet size={14} strokeWidth={3} /> BP{activePlate.no} Material
            </label>
            <MaterialCard 
              mat={currentMaterial} 
              isUpfront={currentMaterial?.isUpfront}
              toggleSelect={() => setIsSelectingMaterial(!isSelectingMaterial)} 
              isChanging={isSelectingMaterial} 
            />
          </div>
        </div>

        {!isSelectingMaterial ? (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300 text-center">
            <label className="text-[12px] font-black uppercase mb-2 flex items-center justify-center gap-2 text-[var(--color-primary)]">
              <ClockCheck size={14} strokeWidth={3} /> Print Time
            </label>
            <div className={`bg-transparent rounded-[2.5rem] px-6 py-4 flex items-center gap-1 w-full text-black dark:text-white ${containerBorderStyle}`}>
              {[{ field: 'days', sub: 'DD' }, { field: 'hours', sub: 'HH' }, { field: 'mins', sub: 'MM' }, { field: 'secs', sub: 'SS' }].map((item, idx, arr) => (
                <React.Fragment key={item.field}>
                  <div className="flex-1 flex flex-col items-center">
                    <input ref={inputRefs[item.field]} type="number" value={activePlate[item.field]} onFocus={() => updatePlateData(effectiveActiveId, item.field, '')} onChange={(e) => handleTimeChange(item.field, e.target.value)} placeholder="00" className="w-full text-center bg-transparent outline-none text-[18px] font-black italic text-black dark:text-white" />
                    <span className="text-[11px] font-black text-[var(--color-primary)] uppercase">{item.sub}</span>
                  </div>
                  {idx < arr.length - 1 && <div className="opacity-30 font-black mb-5 text-xl">:</div>}
                </React.Fragment>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300 pb-10">
             <div className="px-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-[var(--color-primary)] rounded-full" />
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-[var(--color-primary)]">
                    Changing Filament for BP{activePlate.no}
                  </h4>
                </div>
             </div>

             {(allFilaments || []).length >= 10 && (
               <div className="px-1">
                 <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-main)] opacity-20 group-focus-within:opacity-100 group-focus-within:text-blue-500 transition-all" size={16} />
                    <input 
                      value={matSearchQuery}
                      onChange={e => setMatSearchQuery(e.target.value)}
                      placeholder="Search colors..."
                      className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl pl-11 pr-4 py-3 text-[11px] font-black uppercase tracking-widest outline-none focus:border-blue-500/50 transition-all"
                    />
                 </div>
               </div>
             )}

             <div className="grid grid-cols-2 gap-3">
               {sortedMaterials.length > 0 ? (
                 sortedMaterials.map(mat => (
                   <MaterialCard 
                     key={mat.id} 
                     mat={mat} 
                     isGrid={true} 
                     isSelected={String(mat.id) === String(activePlate.materialId)}
                     isUpfront={mat.isUpfront}
                     onSelect={(id) => { updatePlateData(effectiveActiveId, 'materialId', id); setIsSelectingMaterial(false); setMatSearchQuery(''); }} 
                   />
                 ))
               ) : (
                 <div className="col-span-2 py-10 text-center opacity-30">
                   <p className="text-[10px] font-black uppercase tracking-widest">No matching filaments</p>
                 </div>
               )}
             </div>
           </div>
        )}

        <div className={`px-5 sticky bottom-4 left-0 w-full pt-4 transition-all duration-500 z-50 ${isPlateValid(activePlate) && !isSelectingMaterial ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 pointer-events-none scale-95'}`}>
          <div className="bg-[var(--color-bg)]/80 backdrop-blur-md p-1 rounded-[2.5rem] border border-black/10 dark:border-white/10 shadow-2xl">
            <button 
              onClick={handleNext}
              className="w-full py-5 rounded-[2.2rem] font-black italic uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-4 bg-[var(--color-primary)] text-white shadow-xl shadow-[var(--color-primary)]/20 active:scale-95 group"
            >
              {!isEverythingValid && firstIncomplete ? (
                 <>NEXT PLATE <Layers size={14} /> </>
              ) : (
                <>CONFIRM PROJECT
                <div className="p-1 rounded-full bg-white/20 group-hover:translate-x-1 transition-transform">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="4" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
