import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { 
  Plus, Box, Droplet, Settings2, Copy, Trash2, X, Lock,
  VectorSquare, RefreshCw, Check, Scissors, Cpu,
  Dumbbell, Scale, Clock, Search, Tag, Link2
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import MaterialCard from './MaterialCard';

export default function ProjectPrepare({ 
  allFilaments = [], 
  onConfirm, 
  selectedFilaments = [], 
  activePrinter,
  onUnitChange,
  prepareData,
  setPrepareData,
  // 🔥 NEW METADATA
  projectName,
  gdriveLink,
  updateMetadata
}) {
  const MAX_MODELS = 8;
  const isAdmin = useStore((state) => state.isAdmin);

  const customStyles = (
    <style>{`
      @keyframes pulse-spin {
        0% { transform: rotate(0deg) scale(1); opacity: 0.7; }
        50% { transform: rotate(180deg) scale(1.3); opacity: 1; }
        100% { transform: rotate(360deg) scale(1); opacity: 0.7; }
      }
      .animate-pulse-rotate { animation: pulse-spin 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

      @keyframes forklift-travel {
        0%, 100% { transform: translateX(0); }
        50% { transform: translateX(4px); }
      }
      .animate-forklift { animation: forklift-travel 1.5s ease-in-out infinite; }
      
      input::placeholder { color: var(--color-text-main); opacity: 0.3; font-style: italic; }
      input { background: transparent; border: none; outline: none; padding: 0; margin: 0; }
      input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      .no-scrollbar::-webkit-scrollbar { display: none; }
    `}</style>
  );

  const containerBorderStyle = "border-[1.5px] border-gray-400/40 shadow-sm";

  const limits = useMemo(() => {
    const capacity = activePrinter?.buildCapacity;
    if (capacity && typeof capacity === 'object') {
      return {
        x: Number(capacity.x) || 256,
        y: Number(capacity.y) || 256,
        z: Number(capacity.z) || 256
      };
    }
    return { x: 256, y: 256, z: 256 };
  }, [activePrinter]);

  const getMMValue = (val, unit) => {
    const num = parseFloat(val);
    if (isNaN(num)) return 0;
    if (unit === 'cm') return num * 10;
    if (unit === 'in') return num * 25.4;
    return num;
  };

  const emulateSlicer = useCallback((l, w, h, walls, infill) => {
    if (!l || !w || !h) return { weight: 0, hours: 0 };
    const wallNum = parseInt(walls) || 2;
    const infillRatio = (parseInt(infill) || 15) / 100;
    
    const t = wallNum * 0.42; 
    const V_total = l * w * h;
    const innerL = Math.max(0, l - (2 * t));
    const innerW = Math.max(0, w - (2 * t));
    const innerH = Math.max(0, h - (2 * t));
    const V_inner = innerL * innerW * innerH;
    const V_shell = V_total - V_inner;
    const V_infill = V_inner * infillRatio;
    const V_print = V_shell + V_infill;
    
    const weight = (V_print / 1000) * 1.24 * 1.025;
    const avgDim = (l + w + h) / 3;
    let adaptiveFlow = avgDim > 60 ? 14.5 : (avgDim > 30 ? 11.5 : 8.1);
    let seconds = (V_print / adaptiveFlow) * 1.3;
    const setupTime = 420; 
    const travelPenalty = (h / 0.2); 
    let totalHours = ((seconds + setupTime + travelPenalty) / 3600) * 0.8; 
    if (totalHours < 0.45) totalHours = 0.45 + (V_print / 100000); 

    return { weight: parseFloat(weight.toFixed(2)), hours: totalHours };
  }, []);

  const getLogicalDims = useCallback((m) => {
    if (!m) return { l: 0, w: 0, h: 0, parts: 1, weight: 0, hours: 0 };

    let mmL = getMMValue(m.length, m.unit);
    let mmW = getMMValue(m.width, m.unit);
    let mmH = getMMValue(m.height, m.unit);

    if (mmL === 0 && (mmW > 0 || mmH > 0)) mmL = mmW || mmH;
    if (mmW === 0 && (mmL > 0 || mmH > 0)) mmW = mmL || mmH;
    if (mmH === 0 && (mmL > 0 || mmW > 0)) mmH = Math.max(mmL, mmW);

    const px = Math.ceil(mmL / limits.x) || 1;
    const py = Math.ceil(mmW / limits.y) || 1;
    const pz = Math.ceil(mmH / limits.z) || 1;
    const totalParts = px * py * pz;

    const { weight: partWeightRaw, hours: partHoursRaw } = emulateSlicer(
      mmL / px, mmW / py, mmH / pz, m.walls, m.infill
    );

    const totalWeight = parseFloat((partWeightRaw * totalParts).toFixed(1));
    const totalHours  = partHoursRaw * totalParts;

    return {
      l: mmL, w: mmW, h: mmH,
      split: { x: px, y: py, z: pz },
      parts: totalParts,
      part: {
        l: mmL / px, w: mmW / py, h: mmH / pz,
        weight: parseFloat(partWeightRaw.toFixed(2)),
        hours: partHoursRaw
      },
      total: { weight: totalWeight, hours: totalHours },
      weight: totalWeight,
      hours: totalHours
    };
  }, [limits, emulateSlicer]);

  const [internalActiveId, setInternalActiveId] = useState(null);
  const [matSearchQuery, setMatSearchQuery] = useState('');
  const activeModelId = internalActiveId || (prepareData?.[0]?.id || null);

  // --- SYNC INITIALIZATION ---
  useEffect(() => {
    const filaments = allFilaments || [];
    if ((!prepareData || prepareData.length === 0) && filaments.length > 0 && selectedFilaments && selectedFilaments.length > 0) {
        const initial = selectedFilaments.map((f, idx) => ({
          id: Date.now() + idx,
          no: idx + 1,
          length: '', width: '', height: '',
          unit: 'mm', materialId: String(f.materialId || f.id),
          walls: '', infill: ''
        }));
        setPrepareData(initial);
    } else if ((!prepareData || prepareData.length === 0) && filaments.length > 0) {
        const defaultId = filaments.find(f => f.status?.toLowerCase() === 'upfront')?.id || filaments[0]?.id;
        setPrepareData([{
          id: Date.now(), no: 1, length: '', width: '', height: '',
          unit: 'mm', materialId: String(defaultId), walls: '', infill: ''
        }]);
    }
  }, [selectedFilaments, allFilaments]);

  const models = useMemo(() => prepareData || [], [prepareData]);

  const activeModel = useMemo(() => {
    return models.find(m => m.id === activeModelId) || models[0] || { id: null, length: '', width: '', height: '', unit: 'mm', materialId: null, walls: '', infill: '' };
  }, [models, activeModelId]);
  
  const [isSelectingMaterial, setIsSelectingMaterial] = useState(false);
  const [isManageMode, setIsManageMode] = useState(false);

  const logicalData = useMemo(() => {
    if (!activeModel || !activeModel.id) return { l: 0, w: 0, h: 0, parts: 1, total: { weight: 0, hours: 0 }, part: { l: 0, w: 0, h: 0, weight: 0, hours: 0 } };
    return getLogicalDims(activeModel);
  }, [activeModel, getLogicalDims]);

  const isSplitDetected = useMemo(() => {
    return models.some(m => getLogicalDims(m).parts > 1);
  }, [models, getLogicalDims]);

  const totalRequired = useMemo(() => {
    return models.reduce((acc, m) => acc + getLogicalDims(m).weight, 0);
  }, [models, getLogicalDims]);
  
  const getLatestMaterial = useCallback((mId) => {
    const filaments = allFilaments || [];
    const found = filaments.find(f => String(f.id) === String(mId));
    if (!found) return null;
    const stock = parseFloat(found.remaining || 0);
    const isUpfrontType = found.status?.toLowerCase() === 'upfront' || stock <= 0;
    const isInsufficient = !isUpfrontType && totalRequired > stock;
    
    return { 
      ...found, 
      totalRequired, 
      isInsufficient,
      isUpfront: isInsufficient || isUpfrontType
    };
  }, [allFilaments, totalRequired]);

  const currentMaterial = activeModel?.materialId ? getLatestMaterial(activeModel.materialId) : null;
  const isTripleLimitHit = useMemo(() => logicalData.total.weight >= 10000 && logicalData.parts >= 10 && Math.round(logicalData.total.hours * 60) >= 10000, [logicalData]);

  const sortedMaterials = useMemo(() => {
    if (!activeModel) return [];
    const filaments = allFilaments || [];
    const activeMatId = String(activeModel.materialId);
    
    const projectPaletteIds = new Set([
      ...(selectedFilaments || []).map(f => String(f.materialId || f.id)),
      ...(models || []).map(m => String(m.materialId))
    ]);

    let list = [...filaments]
      .filter(f => {
        const stock = parseFloat(f.remaining || 0);
        const isInProjectPalette = projectPaletteIds.has(String(f.id));
        return stock > 0 || isInProjectPalette || String(f.id) === activeMatId || f.status?.toLowerCase() === 'upfront';
      });

    if (matSearchQuery.trim()) {
      const q = matSearchQuery.toLowerCase();
      list = list.filter(f => 
        f.name?.toLowerCase().includes(q) || 
        f.brand?.toLowerCase().includes(q) || 
        f.type?.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => {
        if (String(a.id) === activeMatId) return -1;
        if (String(b.id) === activeMatId) return 1;
        return (parseFloat(b.remaining) || 0) - (parseFloat(a.remaining) || 0);
      });
  }, [allFilaments, activeModel, selectedFilaments, matSearchQuery]);

  const updateModelData = (id, field, value) => {
    if (field === 'materialId') {
      setPrepareData(prev => (prev || []).map(m => m.id === id ? { ...m, materialId: String(value) } : m));
      return;
    }
    if (isManageMode) return;
    let processedValue = ['walls', 'infill'].includes(field) ? value.replace(/[^0-9]/g, '') : value.replace(/[^0-9.]/g, '');
    if ((processedValue.match(/\./g) || []).length > 1) return;

    setPrepareData(prev => (prev || []).map(m => {
      if (m.id === id) {
        const newModel = { ...m, [field]: processedValue };
        if (['length', 'width', 'height'].includes(field)) {
          newModel[`baseMM_${field}`] = getMMValue(processedValue, m.unit);
        }
        return newModel;
      }
      return m;
    }));
  };

  const handleUnitChange = () => {
    const units = ['mm', 'cm', 'in'];
    const currentUnit = activeModel?.unit || 'mm';
    const nextUnit = units[(units.indexOf(currentUnit) + 1) % 3];
    setPrepareData(prev => (prev || []).map(m => {
      const convertFromBase = (fld) => {
        const mmValue = m[`baseMM_${fld}`] || getMMValue(m[fld], m.unit);
        if (!mmValue) return '';
        if (nextUnit === 'cm') return parseFloat((mmValue / 10).toFixed(4)).toString();
        if (nextUnit === 'in') return parseFloat((mmValue / 25.4).toFixed(4)).toString();
        return parseFloat(mmValue.toFixed(4)).toString();
      };
      return { 
        ...m, unit: nextUnit, length: convertFromBase('length'), width: convertFromBase('width'), height: convertFromBase('height'),
        baseMM_length: m.baseMM_length || getMMValue(m.length, m.unit),
        baseMM_width: m.baseMM_width || getMMValue(m.width, m.unit),
        baseMM_height: m.baseMM_height || getMMValue(m.height, m.unit),
      };
    }));
    if (onUnitChange) onUnitChange(nextUnit);
  };

  const isModelValid = (m) => {
    const dimsValid = getLogicalDims(m).l > 0 && !!m.materialId;
    const wallsVal = parseInt(m.walls);
    const infillVal = parseInt(m.infill);
    const wallsValid = m.walls === '' || (wallsVal >= 3 && wallsVal <= 10);
    const infillValid = m.infill === '' || (infillVal > 15 && infillVal <= 99);
    return dimsValid && wallsValid && infillValid;
  };

  const isEverythingValid = models.every(isModelValid);
  const firstIncomplete = models.find(m => !isModelValid(m));

  const timeBreakdown = useMemo(() => {
    const hoursToUse = logicalData.parts > 1 ? logicalData.part.hours : logicalData.total.hours;
    const totalMinutes = Math.round(hoursToUse * 60);
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const mins = totalMinutes % 60;
    return { days, hours, mins, secs: 0 };
  }, [logicalData]);

  const convertLength = (value) => {
    if (activeModel.unit === "cm") return value / 10;
    if (activeModel.unit === "in") return value / 25.4;
    return value;
  };

  const cardBase = "rounded-3xl p-3 border flex flex-col items-center justify-center transition-all";
  const cardNormal = "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/40";
  const cardError = "border-red-500/40 bg-red-500/5";

  return (
    <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10 text-[var(--color-text-main)] text-left">
      {customStyles}

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

      {/* --- NAVIGATION --- */}
      <div className="space-y-0 text-center">
        <h2 className="text-[12px] font-black uppercase mb-2 flex items-center justify-center gap-2 text-[var(--color-primary)]">
          <Box size={14} strokeWidth={3} /> Project Models {models.length > 0 && <span className="opacity-40">({models.length}/{MAX_MODELS})</span>}
        </h2>
        <div className="relative w-full h-[90px] flex items-center">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-[64px] bg-[var(--color-text-main)] rounded-full z-20 opacity-20" />
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-2 px-4 w-full h-full">
            {models.map((model) => (
              <button key={model.id} onClick={() => { setInternalActiveId(model.id); setIsSelectingMaterial(false); }} 
                className={`relative flex-shrink-0 rounded-[12rem] border-2 transition-all duration-300 flex flex-col items-center justify-center
                  ${activeModelId === model.id ? (isManageMode ? (models.length > 1 ? 'w-[58px] h-[58px] bg-red-500/5 border-red-500 text-red-500 scale-110 z-10' : 'w-[58px] h-[58px] bg-gray-400/5 border-gray-400 text-gray-400 scale-110 z-10') : 'w-[58px] h-[58px] bg-[var(--color-surface)] border-[var(--color-primary)] text-[var(--color-primary)] scale-110 z-10') : 'w-[50px] h-[50px] bg-[var(--text-main)]/5 border-gray-400/30 opacity-40 text-black dark:text-white'}`}
              >
                {isManageMode && activeModelId === model.id ? (
                  <div onClick={(e) => { e.stopPropagation(); if (models.length > 1) { const updated = models.filter(m => m.id !== model.id).map((m, idx) => ({ ...m, no: idx + 1 })); setPrepareData(updated); if (activeModelId === model.id) setInternalActiveId(updated[0].id); } }} 
                    className="flex flex-col items-center animate-in zoom-in duration-200 leading-none"
                  >
                    {models.length > 1 ? (<><Trash2 size={18} strokeWidth={3} className="mb-0.5" /><span className="text-[9px] font-black uppercase italic">M{model.no}</span></>) : (<><Lock size={14} strokeWidth={3} className="mb-0.5" /><span className="text-[9px] font-black uppercase italic">M{model.no}</span></>)}
                  </div>
                ) : (
                  <div className="flex flex-col items-center leading-none">
                    {isModelValid(model) ? <Check size={16} strokeWidth={4} className="mb-0.5 animate-in zoom-in" /> : <Box size={14} strokeWidth={3} className="mb-0.5" />}
                    <span className="text-[9px] font-black uppercase italic">M{model.no}</span>
                  </div>
                )}
              </button>
            ))}
            
            {models.length < MAX_MODELS && !isSplitDetected && (
              <button onClick={() => { 
                const nid = Math.max(0, ...models.map(m=>m.id))+1; 
                if (isManageMode) { 
                  setPrepareData([...models, { ...activeModel, id: nid, no: models.length + 1 }]); 
                } else { 
                  setPrepareData([...models, { id: nid, no: models.length + 1, length: '', width: '', height: '', unit: activeModel.unit, materialId: activeModel.materialId, walls: '', infill: '' }]); 
                } 
                setInternalActiveId(nid);
                setIsSelectingMaterial(false);
                setIsManageMode(false);
              }} 
                className={`relative flex-shrink-0 w-[50px] h-[50px] rounded-full border-2 border-dashed border-[var(--color-primary)] text-[var(--color-primary)] flex items-center justify-center active:scale-90 transition-all animate-in zoom-in duration-300 ${isManageMode ? 'scale-110 z-10' : 'opacity-80'}`}
              >
                {isManageMode ? <Copy size={16} strokeWidth={3} /> : <Plus size={22} strokeWidth={3} />}
              </button>
            )}
            
            <button onClick={() => { setIsManageMode(!isManageMode); setIsSelectingMaterial(false); }} className={`relative flex-shrink-0 w-[50px] h-[50px] rounded-full border-2 transition-all active:scale-90 flex items-center justify-center ${isManageMode ? 'border-black dark:border-white bg-[var(--color-surface)] z-10' : 'border-black/30 dark:border-white/30 opacity-80'}`}>
              {isManageMode ? <X size={15} strokeWidth={4} className="text-black dark:text-white" /> : <Settings2 size={16} strokeWidth={2.5} className="text-black dark:text-white" />}
            </button>
          </div>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[2px] h-[64px] bg-[var(--color-text-main)] rounded-full z-20 opacity-20" />
        </div>
      </div>

      {/* --- FORM SECTION --- */}
      <div className={`space-y-8 transition-all duration-500 relative ${isManageMode ? 'opacity-30 pointer-events-none' : ''}`}>
        <div className="flex gap-4 items-end">
          <div className="w-[43%] flex flex-col items-center">
            <label className="text-[12px] font-black uppercase mb-2 flex items-center justify-center gap-2 text-[var(--color-primary)]"><Dumbbell size={14} strokeWidth={3} /> Strength</label>
            <div className={`w-full h-[68px] bg-transparent rounded-[1.8rem] flex items-stretch justify-center px-1 ${containerBorderStyle}`}>
                <div className="flex-1 flex flex-col items-center justify-center">
                  <input type="text" inputMode="numeric" placeholder="2" value={activeModel?.walls} onFocus={() => updateModelData(activeModelId, 'walls', '')} onChange={(e) => updateModelData(activeModelId, 'walls', e.target.value)} onBlur={(e) => { const n = parseInt(e.target.value); if (n < 3 || isNaN(n)) updateModelData(activeModelId, 'walls', ''); else if (n > 10) updateModelData(activeModelId, 'walls', '10'); }} className="w-full text-center bg-transparent outline-none text-[15px] font-black italic text-[var(--color-text-main)] leading-none" />
                  <span className="text-[11px] font-black uppercase text-[var(--color-primary)] mt-0.5 leading-none">Walls</span>
                </div>
                <div className="w-[1px] h-8 bg-gray-400/20 self-center flex-shrink-0" />
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="flex items-center justify-center translate-x-1">
                    <input type="text" inputMode="numeric" placeholder="15" value={activeModel?.infill} onFocus={() => updateModelData(activeModelId, 'infill', '')} onChange={(e) => updateModelData(activeModelId, 'infill', e.target.value)} onBlur={(e) => { const n = parseInt(e.target.value); if (n <= 15 || isNaN(n)) updateModelData(activeModelId, 'infill', ''); else if (n > 99) updateModelData(activeModelId, 'infill', '99'); }} className="w-5 text-center bg-transparent outline-none text-[15px] font-black italic text-[var(--color-text-main)] leading-none" />
                    <span className="text-[12px] font-black italic opacity-30 ml-0.5 leading-none self-center">%</span>
                  </div>
                  <span className="text-[11px] font-black uppercase text-[var(--color-primary)] mt-0.5 leading-none">Infill</span>
                </div>
            </div>
          </div>
          <div className="w-[57%] flex flex-col items-center">
            <label className="text-[12px] font-black uppercase mb-2 flex items-center justify-center gap-2 text-[var(--color-primary)]"><Droplet size={14} strokeWidth={3} /> M{activeModel?.no} Material</label>
            <MaterialCard mat={currentMaterial} activeMaterialId={activeModel?.materialId} toggleSelect={() => setIsSelectingMaterial(!isSelectingMaterial)} isChanging={isSelectingMaterial} requiredWeight={totalRequired} isUpfront={currentMaterial?.isUpfront} />
          </div>
        </div>

        {!isSelectingMaterial ? (
          <div className="space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex flex-col items-center">
              <label className="text-[12px] font-black uppercase mb-2 flex items-center justify-center gap-2 text-[var(--color-primary)]"><VectorSquare size={14} strokeWidth={3} /> Dimensions</label>
              <div className={`bg-transparent rounded-[2.5rem] px-4 py-4 w-full flex items-center gap-1 text-[var(--color-text-main)] ${containerBorderStyle}`}>
                {[{ field: 'length', label: 'L', key: 'l' }, { field: 'width', label: 'W', key: 'w' }, { field: 'height', label: 'H', key: 'h' }].map((item, idx) => {
                  const displayValue = activeModel?.[item.field];
                  let ghostMM = logicalData[item.key];
                  let ghostDisplay = (displayValue === '' && ghostMM > 0) ? (activeModel.unit === 'cm' ? (ghostMM/10).toFixed(1) : activeModel.unit === 'in' ? (ghostMM/25.4).toFixed(2) : ghostMM.toString()) : '';
                  return (
                    <React.Fragment key={item.field}>
                      <div className="flex-1 flex flex-col items-center min-w-0 relative">
                        <div className="relative w-full flex items-center justify-center h-[24px]">
                          {displayValue === '' && !ghostDisplay && <div className="absolute opacity-20 pointer-events-none"><Cpu size={18} /></div>}
                          <input type="text" inputMode="decimal" placeholder={ghostDisplay} value={displayValue} onFocus={() => setPrepareData(p=>p.map(m=>m.id===activeModelId?{...m, [item.field]:''}:m))} onChange={(e) => updateModelData(activeModelId, item.field, e.target.value)} className="w-full text-center bg-transparent outline-none text-[16px] font-black italic" />
                        </div>
                        <span className="text-[12px] font-black uppercase mt-1 text-[var(--color-primary)]">{item.label}</span>
                      </div>
                      {idx < 2 && <div className="opacity-10 font-black mb-4 text-xs px-1">|</div>}
                    </React.Fragment>
                  );
                })}
                <button onClick={handleUnitChange} className="flex-1 flex flex-col items-center active:scale-90 transition-all">
                  <div className="flex items-center gap-1 text-[var(--color-primary)] font-black italic text-[12px] uppercase">{activeModel?.unit} <RefreshCw size={11} strokeWidth={4} className="animate-pulse-rotate" /></div>
                  <span className="text-[10px] font-black uppercase mt-1 text-[var(--color-primary)]">Unit</span>
                </button>
              </div>
            </div>

            <div className={`transition-all duration-500 ${logicalData.l > 0 ? 'opacity-100' : 'opacity-0'}`}>
              <div className="grid grid-cols-2 gap-2 px-2">
                {logicalData.parts > 1 && <div className={`${cardBase} ${logicalData.parts >= 10 ? cardError : cardNormal}`}>
                  <div className={`flex items-center gap-1.5 mb-1 ${logicalData.parts >= 10 ? 'text-red-500' : 'text-[var(--color-primary)]'}`}><Scissors size={13} strokeWidth={3} /><span className="text-[14px] font-black italic">{logicalData.parts}</span></div>
                  <span className="text-[8px] font-black uppercase opacity-50">Parts</span>
                </div>}
                {logicalData.parts > 1 && <div className={`${cardBase} ${cardNormal}`}>
                  <div className="flex items-center gap-1.5 mb-1 text-[var(--color-primary)]"><Box size={13} strokeWidth={3} /><span className="text-[14px] font-black italic">{[convertLength(logicalData.part.l), convertLength(logicalData.part.w), convertLength(logicalData.part.h)].map(v => Number(v.toFixed(1))).join("×")}</span></div>
                  <span className="text-[8px] font-black uppercase opacity-50">Part Size ({activeModel.unit})</span>
                </div>}
                {isAdmin && (
                  <div className={`${cardBase} ${logicalData.total.weight >= 10000 || currentMaterial?.isInsufficient ? cardError : cardNormal}`}>
                    <div className={`flex items-center gap-1.5 mb-1 ${logicalData.total.weight >= 10000 || currentMaterial?.isInsufficient ? 'text-red-500' : 'text-[var(--color-primary)]'}`}><Scale size={13} strokeWidth={3} /><span className="text-[14px] font-black italic">{logicalData.parts > 1 ? logicalData.part.weight : logicalData.total.weight}g</span></div>
                    <span className="text-[8px] font-black uppercase opacity-50">{logicalData.parts > 1 ? 'Weight / Part' : 'Weight'}</span>
                  </div>
                )}
                {isAdmin && (
                  <div className={`${cardBase} ${Math.round((logicalData.parts > 1 ? logicalData.part.hours : logicalData.total.hours) * 60) >= 10000 ? cardError : cardNormal}`}>
                    <div className={`flex items-center gap-1.5 mb-1 ${Math.round((logicalData.parts > 1 ? logicalData.part.hours : logicalData.total.hours) * 60) >= 10000 ? 'text-red-500' : 'text-[var(--color-primary)]'}`}><Clock size={13} strokeWidth={3} /><span className="text-[14px] font-black italic">{[timeBreakdown.days && `${timeBreakdown.days}d`, timeBreakdown.hours && `${timeBreakdown.hours}h`, timeBreakdown.mins && `${timeBreakdown.mins}m`, `${timeBreakdown.secs}s`].filter(Boolean).join(" ")}</span></div>
                    <span className="text-[8px] font-black uppercase opacity-50">{logicalData.parts > 1 ? 'Time / Part' : 'Duration'}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300 pb-10">
            <div className="px-3 flex items-center gap-2">
                <div className="w-1.5 h-4 bg-[var(--color-primary)] rounded-full" />
                <h4 className="text-[11px] font-black uppercase tracking-widest text-[var(--color-primary)]">
                  Changing Filament for M{activeModel?.no}
                </h4>
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
                    isSelected={String(mat.id) === String(activeModel.materialId)}
                    activeMaterialId={String(activeModel.materialId)} 
                    onSelect={(id) => { updateModelData(activeModelId, 'materialId', id); setIsSelectingMaterial(false); setMatSearchQuery(''); }} 
                    isUpfront={mat.isUpfront}
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

        {/* --- STICKY CONFIRM BUTTON --- */}
        <div className={`px-5 sticky bottom-4 left-0 w-full pt-4 transition-all duration-500 z-50 ${isModelValid(activeModel) && !isManageMode && !isSelectingMaterial && !isTripleLimitHit ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 pointer-events-none scale-95'}`}>
          <div className="bg-[var(--color-bg)]/80 backdrop-blur-md p-1 rounded-[2.5rem] border border-black/10 dark:border-white/10 shadow-2xl">
            <button 
              onClick={() => { 
                if (firstIncomplete) {
                  setInternalActiveId(firstIncomplete.id); 
                } else {
                  const projectSummary = models.map(m => { 
                    const d = getLogicalDims(m); 
                    const filaments = allFilaments || [];
                    const mat = filaments.find(f => String(f.id) === String(m.materialId));
                    const stock = parseFloat(mat?.remaining || 0);
                    const isUpfrontType = mat?.status?.toLowerCase() === 'upfront';

                    return {
                      id: m.id, no: m.no,
                      config: { walls: m.walls !== '' ? Number(m.walls) : 2, infill: m.infill !== '' ? Number(m.infill) : 15, length: m.length !== '' ? Number(m.length) : d.l, width: m.width !== '' ? Number(m.width) : d.w, height: m.height !== '' ? Number(m.height) : d.h, unit: m.unit || 'mm' },
                      volume: { total: { weight: d.total.weight, time: Math.round(d.total.hours * 60) }, parts: d.parts, part: { l: d.part.l, w: d.part.w, h: d.part.h, weight: d.part.weight, time: Math.round(d.part.hours * 60), breakdown: { days: Math.floor(Math.round(d.hours * 60) / 1440), hours: Math.floor((Math.round(d.hours * 60) % 1440) / 60), mins: Math.round(d.hours * 60) % 60, secs: 0 } } },
                      material: {
                        materialId: m.materialId,
                        material: mat ? {
                          ...mat,
                          id: mat.id,
                          remaining: Number(mat.remaining || 0),
                          price: Number(mat.price || 0),
                          weight: Number(mat.weight || 0),
                          loadTime: Number(mat.loadTime || 0),
                          purgeTime: Number(mat.purgeTime || mat.cleanBuffer || 0),
                          cleanBuffer: Number(mat.cleanBuffer || mat.purgeTime || 0),
                          isUpfront: isUpfrontType || stock <= 0 || d.total.weight > stock
                        } : null
                      },
                      file: {}
                    };
                  });
                  onConfirm(projectSummary); 
                }
              }} 
              className="w-full py-5 rounded-[2.2rem] font-black italic uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-4 transition-all duration-500 active:scale-95 group bg-[var(--color-primary)] text-white shadow-xl shadow-[var(--color-primary)]/20"
            >
              {!isEverythingValid && firstIncomplete ? (<>NEXT <Box size={14} /></>) : (<>CONFIRM PROJECT <div className="p-1 rounded-full bg-white/20 group-hover:translate-x-1 transition-transform"><svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="4" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></div></>)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
