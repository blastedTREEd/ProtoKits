import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { 
  Plus, Layers, WeightTilde, Droplet, ClockCheck, 
  Copy, Trash2, X, Check, AlertTriangle, Search,
  Tag, Link2, Printer, Zap
} from 'lucide-react';
import MaterialCard from './MaterialCard';
import { useStore } from '../../store/useStore';
import { isFilamentCompatibleWithPrinter } from '../../utils/printerCompatibility';

export default function ProjectPreview({ 
  allFilaments = [], 
  onConfirm, 
  selectedFilaments = [],
  previewData = [], 
  setPreviewData,
  onBack
}) {
  const { printers, feeders } = useStore();
  const containerBorderStyle = "border-[1.5px] border-gray-400/40 shadow-sm";
  const MAX_PLATES = 8;

  const inputRefs = {
    days: useRef(null), hours: useRef(null), mins: useRef(null), secs: useRef(null)
  };

  // --- 1. INITIALIZATION & SYNC ---
  // --- 2. MEMOIZED DATA & LOGIC ---
  const plates = useMemo(() => previewData || [], [previewData]);
  const [activePlateId, setActivePlateId] = useState(null);
  const [isSelectingMaterial, setIsSelectingMaterial] = useState(false);
  const [isSelectingPrinter, setIsSelectingPrinter] = useState(false);
  const [matSearchQuery, setMatSearchQuery] = useState('');
  const [activeMaterialSlot, setActiveMaterialSlot] = useState(0);

  const effectiveActiveId = activePlateId || (plates.length > 0 ? plates[0].id : null);
  
  const activePlate = useMemo(() => 
    plates.find(p => p.id === effectiveActiveId) || plates[0] || {},
    [plates, effectiveActiveId]
  );
  
  const selectedPrinter = useMemo(() => printers.find(p => p.id === activePlate.printerId), [printers, activePlate.printerId]);

  const getCompatibleFeeders = useCallback((printer) => {
    if (!printer?.autoFeed || !feeders || feeders.length === 0) return [];
    const targetType = String(printer.autoFeed.compatibility || printer.autoFeed.type || '').toLowerCase();
    const maxUnits = Number(printer.autoFeed.max) || 1;
    if (!targetType) return [];
    return feeders
      .filter(f => String(f.type || f.compatibility || '').toLowerCase() === targetType)
      .slice(0, maxUnits);
  }, [feeders]);

  const compatibleFeeders = useMemo(() => getCompatibleFeeders(selectedPrinter), [getCompatibleFeeders, selectedPrinter]);
  const getPrinterFilamentSlots = useCallback((printer) => {
    if (!printer) return 1;
    const pFeeders = getCompatibleFeeders(printer);
    const feederSlots = pFeeders.reduce((sum, unit) => sum + (Number(unit.filamentSlots) || 0), 0);
    return Math.max(1, feederSlots || Number(printer.filamentSlots) || 1);
  }, [getCompatibleFeeders]);
  const activeMaterialSlotsLimit = useMemo(() => {
    return getPrinterFilamentSlots(selectedPrinter);
  }, [getPrinterFilamentSlots, selectedPrinter]);
  const selectedPrinterHasFeeder = compatibleFeeders.length > 0;
  const activeUsesFeeder = selectedPrinterHasFeeder && activePlate?.useCfs !== false;
  const formatPrinterCapacity = useCallback((capacity) => {
    if (!capacity) return '---';
    return [capacity.x, capacity.y, capacity.z]
      .map(value => Number(value) || 0)
      .join(' × ');
  }, []);
  const activeMaterialSlotsData = useMemo(() => {
    if (activePlate?.materialSlots?.length) {
      return activePlate.materialSlots
        .filter(slot => slot?.materialId)
        .map(slot => ({ materialId: String(slot.materialId), weight: slot.weight ?? '' }));
    }
    return [{ materialId: String(activePlate?.materialId || ''), weight: activePlate?.weight || '' }].filter(slot => slot.materialId);
  }, [activePlate]);
  const currentMaterialId = activeMaterialSlotsData[activeMaterialSlot]?.materialId || activePlate?.materialId;

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
            materialSlots: [{ materialId: String(f.materialId || f.id), weight: f.weight || '' }],
            printerId: printers.length > 0 ? printers[0].id : null // Default to first printer
          };
        });
        setPreviewData(initial);
    } else if ((!previewData || previewData.length === 0) && filaments.length > 0) {
      const defaultId = filaments.find(f => f.status?.toLowerCase() === 'upfront')?.id || filaments[0]?.id;
      setPreviewData([{ id: Date.now(), no: 1, weight: '', days: '', hours: '', mins: '', secs: '', materialId: String(defaultId), materialSlots: [{ materialId: String(defaultId), weight: '' }], printerId: printers.length > 0 ? printers[0].id : null }]);
    }
  }, [selectedFilaments, allFilaments, printers, previewData, setPreviewData]);

  const getLatestMaterial = useCallback((mId, allPlates) => {
    const filaments = allFilaments || [];
    const found = filaments.find(f => String(f.id) === String(mId));
    if (!found) return null;

    const totalRequired = (allPlates || []).reduce((acc, p) => {
      const matchingSlotWeight = (p.materialSlots || [])
        .filter(slot => String(slot.materialId) === String(mId))
        .reduce((sum, slot) => sum + (parseFloat(slot.weight) || 0), 0);
      return acc + (matchingSlotWeight || (String(p.materialId) === String(mId) ? (parseFloat(p.weight) || 0) : 0));
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

  const sortedMaterials = useMemo(() => {
    const filaments = allFilaments || [];
    const activeMatId = String(activePlate?.materialId || '');
    const projectPaletteIds = new Set([
      ...(selectedFilaments || []).map(f => String(f.materialId || f.id)),
      ...(plates || []).flatMap(p => (p.materialSlots?.length ? p.materialSlots.map(slot => slot.materialId) : [p.materialId]).filter(Boolean).map(String))
    ]);

    // CRITICAL: Cannot pick the same material for two different slots on the SAME plate
    const usedMaterialIds = new Set(
      activeMaterialSlotsData
        .map(slot => String(slot.materialId))
        .filter((_, idx) => idx !== activeMaterialSlot)
    );

    // Filter by availability first (unless upfront)
    let list = [...filaments]
      .filter(f => {
        const fId = String(f.id);

        if (!isFilamentCompatibleWithPrinter(selectedPrinter, f)) return false;
        
        // Exclude current material of active slot
        if (fId === String(currentMaterialId)) return false;

        // Cannot pick the same material for another slot on THIS plate
        if (usedMaterialIds.has(fId)) return false;

        const stock = parseFloat(f.remaining || 0);
        const isInProjectPalette = projectPaletteIds.has(String(f.id));
        return stock > 0 || isInProjectPalette || fId === activeMatId || f.status?.toLowerCase() === 'upfront';
      });

    // Search query should search all filaments, excluding current
    if (matSearchQuery.trim()) {
      const q = matSearchQuery.toLowerCase();
      // Search across ALL filaments, filter out current
      list = [...filaments].filter(f => 
        isFilamentCompatibleWithPrinter(selectedPrinter, f) &&
        (f.name?.toLowerCase().includes(q) || 
         f.brand?.toLowerCase().includes(q) || 
         f.type?.toLowerCase().includes(q)) &&
        String(f.id) !== String(currentMaterialId)
      );
    }

    return list.map(f => {
        const totalIfUsed = (plates || []).reduce((acc, p) => {
          const slots = p.id === activePlate.id
            ? activeMaterialSlotsData.map((slot, idx) => idx === activeMaterialSlot ? { ...slot, materialId: f.id } : slot)
            : (p.materialSlots || [{ materialId: p.materialId, weight: p.weight }]);
          return acc + slots
            .filter(slot => String(slot.materialId) === String(f.id))
            .reduce((sum, slot) => sum + (parseFloat(slot.weight) || 0), 0);
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
  }, [allFilaments, activePlate, activeMaterialSlot, activeMaterialSlotsData, plates, selectedFilaments, matSearchQuery, currentMaterialId, selectedPrinter]);

  // --- 3. UPDATERS & NAVIGATION ---
  const updatePlateData = useCallback((id, field, value) => {
    let processedValue = value;
    if (field === 'weight') {
      processedValue = value.replace(/[^0-9.]/g, ''); 
      if ((processedValue.match(/\./g) || []).length > 1) return;
    }
    setPreviewData(prev => (prev || []).map(p => {
      if (p.id !== id) return p;
      if (field === 'materialId' && p.materialSlots?.length) {
        const slots = [...p.materialSlots];
        slots[activeMaterialSlot] = { ...(slots[activeMaterialSlot] || {}), materialId: String(processedValue) };
        return { ...p, materialId: slots[0]?.materialId || String(processedValue), materialSlots: slots };
      }
      return { ...p, [field]: processedValue };
    }));
  }, [activeMaterialSlot, setPreviewData]);

  const updateMaterialSlotWeight = (slotIdx, value) => {
    const clean = value.replace(/[^0-9.]/g, '');
    if ((clean.match(/\./g) || []).length > 1) return;
    setPreviewData(prev => (prev || []).map(p => {
      if (p.id !== effectiveActiveId) return p;
      const slots = p.materialSlots?.length ? [...p.materialSlots] : activeMaterialSlotsData.map(slot => ({ ...slot }));
      slots[slotIdx] = { ...(slots[slotIdx] || {}), weight: clean };
      const totalWeight = slots.reduce((sum, slot) => sum + (parseFloat(slot.weight) || 0), 0);
      return { ...p, weight: totalWeight ? String(Number(totalWeight.toFixed(2))) : '', materialSlots: slots };
    }));
  };

  const addMaterialSlot = () => {
    if (activeMaterialSlotsData.length >= activeMaterialSlotsLimit) return;
    
    // Find unused materials and pick the one with highest stock
    const usedIds = new Set(activeMaterialSlotsData.map(slot => String(slot.materialId)));
    const unusedFilaments = (allFilaments || []).filter(f => !usedIds.has(String(f.id)));
    
    const fallback = unusedFilaments.length > 0 
      ? [...unusedFilaments].sort((a, b) => parseFloat(b.remaining || 0) - parseFloat(a.remaining || 0))[0]?.id
      : (activeMaterialSlotsData[activeMaterialSlotsData.length - 1]?.materialId || activePlate?.materialId || (allFilaments || [])[0]?.id);

    setPreviewData(prev => (prev || []).map(p => {
      if (p.id !== effectiveActiveId) return p;
      const slots = [...activeMaterialSlotsData, { materialId: String(fallback), weight: '' }];
      return { ...p, useCfs: activeUsesFeeder, materialSlots: slots, materialId: slots[0]?.materialId || p.materialId };
    }));
    setActiveMaterialSlot(activeMaterialSlotsData.length);
  };

  const removeMaterialSlot = (slotIdx) => {
    if (activeMaterialSlotsData.length <= 1) return;
    const slots = activeMaterialSlotsData.filter((_, idx) => idx !== slotIdx);
    setPreviewData(prev => (prev || []).map(p => {
      if (p.id !== effectiveActiveId) return p;
      const totalWeight = slots.reduce((sum, slot) => sum + (parseFloat(slot.weight) || 0), 0);
      return { ...p, weight: totalWeight ? String(Number(totalWeight.toFixed(2))) : '', materialSlots: slots, materialId: slots[0]?.materialId || p.materialId };
    }));
    setActiveMaterialSlot(Math.max(0, Math.min(slotIdx - 1, slots.length - 1)));
  };

  const getWeightedMaterialSlots = (plate) => (
    (plate?.materialSlots?.length ? plate.materialSlots : [{ materialId: plate?.materialId, weight: plate?.weight }])
      .filter(slot => slot?.materialId)
      .map(slot => ({ materialId: String(slot.materialId), weight: Number(slot.weight || 0) }))
      .filter(slot => slot.weight > 0)
  );

  const isPlateValid = (p) => {
    const pWeight = parseFloat(p.weight) || 0;
    const hasTime = (Number(p.days) || 0) + (Number(p.hours) || 0) + (Number(p.mins) || 0) + (Number(p.secs) || 0) > 0;
    return pWeight > 0 && hasTime;
  };

  const isEverythingValid = plates.every(isPlateValid);
  const firstIncomplete = plates.find(p => !isPlateValid(p));
  const isActivePlateValid = activePlate ? isPlateValid(activePlate) : false;
  const nextIncompletePlate = plates.find(p => !isPlateValid(p) && String(p.id) !== String(activePlate?.id));

  const handleNext = () => {
    if (!isActivePlateValid) {
      const targetPlate = firstIncomplete || activePlate;
      if (targetPlate?.id) setActivePlateId(targetPlate.id);
      setIsSelectingMaterial(false);
      return;
    }
    if (nextIncompletePlate) {
      setActivePlateId(nextIncompletePlate.id);
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
      const weightedSlots = getWeightedMaterialSlots(p);
      const primaryMaterialId = weightedSlots[0]?.materialId || p.materialId;
      const mat = filaments.find(f => String(f.id) === String(primaryMaterialId));
      const printer = printers.find(pr => String(pr.id) === String(p.printerId));
      const compatible = getCompatibleFeeders(printer);
      const usesFeeder = compatible.length > 0 && weightedSlots.length > 1 && p.useCfs !== false;
      const materials = weightedSlots.map((slot) => {
        const material = filaments.find(f => String(f.id) === String(slot.materialId));
        const stock = Number(material?.remaining || 0);
        return {
          materialId: slot.materialId,
          shareWeight: slot.weight,
          material: material ? {
            ...material,
            id: material.id,
            remaining: stock,
            price: Number(material.price || 0),
            weight: Number(material.weight || 0),
            loadTime: Number(material.loadTime || 0),
            purgeTime: Number(material.purgeTime || material.cleanBuffer || 0),
            cleanBuffer: Number(material.cleanBuffer || material.purgeTime || 0),
            isUpfront: material.status?.toLowerCase() === 'upfront' || slot.weight > stock || stock <= 0
          } : null
        };
      });
      const materialWeights = weightedSlots.reduce((acc, slot) => {
        acc[slot.materialId] = Number(((acc[slot.materialId] || 0) + slot.weight).toFixed(2));
        return acc;
      }, {});

      return {
        id: p.id, no: p.no,
        sliced: { weight: Number(p.weight), time, breakdown: { days, hours, mins, secs: Number(p.secs || 0) } },
        printerId: p.printerId,
        useCfs: usesFeeder,
        productionJobs: [{
          id: `${p.id}-bp`,
          parentId: p.id,
          no: 1,
          printerId: p.printerId,
          printerName: [printer?.brand, printer?.model || printer?.name].filter(Boolean).join(' '),
          usesCfs: usesFeeder,
          weight: Number(p.weight),
          time,
          materialIds: weightedSlots.map(slot => slot.materialId),
          materialWeights
        }],
        material: {
          materialId: primaryMaterialId,
          material: mat ? {
            ...mat, id: mat.id, remaining: Number(mat.remaining || 0), price: Number(mat.price || 0),
            weight: Number(mat.weight || 0), loadTime: Number(mat.loadTime || 0),
            purgeTime: Number(mat.purgeTime || mat.cleanBuffer || 0),
            isUpfront: mat.status?.toLowerCase() === 'upfront' || (Number(p.weight) > Number(mat.remaining || 0)) || (Number(mat.remaining || 0) <= 0)
          } : null,
        },
        materials
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

  const addBlankPlate = () => {
    if (plates.length >= MAX_PLATES) return;
    const newId = Date.now();
    const materialId = activePlate.materialId || (allFilaments || [])[0]?.id;
    setPreviewData(prev => [...(prev || []), {
      id: newId,
      no: (prev || []).length + 1,
      weight: '',
      days: '',
      hours: '',
      mins: '',
      secs: '',
      materialId,
      materialSlots: [{ materialId, weight: '' }],
      printerId: activePlate.printerId || (printers || [])[0]?.id,
      useCfs: activePlate.useCfs
    }]);
    setActivePlateId(newId);
    setIsSelectingMaterial(false);
  };

  const duplicateActivePlate = () => {
    if (plates.length >= MAX_PLATES || !activePlate?.id) return;
    const newId = Date.now();
    setPreviewData(prev => {
      const source = (prev || []).find(p => p.id === effectiveActiveId) || activePlate;
      const next = {
        ...source,
        id: newId,
        no: (prev || []).length + 1,
        materialSlots: (source.materialSlots || []).map(slot => ({ ...slot }))
      };
      return [...(prev || []), next];
    });
    setActivePlateId(newId);
    setIsSelectingMaterial(false);
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
    <div className="project-preview-flow w-full min-h-[calc(100dvh-210px)] lg:min-h-[calc(90dvh-210px)] flex flex-col gap-8 pb-[160px] sm:pb-32 md:pb-32 lg:pb-32 animate-in fade-in slide-in-from-bottom-4 duration-500 text-black dark:text-white text-left">
      <style>{`
        @keyframes pulse-subtle { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .animate-pulse-subtle { animation: pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
       input[type=number] { -moz-appearance: textfield; }
        .project-preview-flow > * { order: 3; }
        .project-preview-printer { order: 1; }
        .project-preview-plates { order: 2; }
      `}</style>
      
      {/* --- PLATE NAVIGATION --- */}
      <div className="project-preview-plates w-full max-w-2xl mx-auto px-3 space-y-0 text-center">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14px] font-black uppercase flex items-center gap-2 text-[var(--color-primary)]">
            <Layers size={14} strokeWidth={3} /> Build Plates {plates.length > 0 && <span className="opacity-40">({plates.length}/{MAX_PLATES})</span>}
          </h2>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={addBlankPlate}
              disabled={plates.length >= MAX_PLATES}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${plates.length >= MAX_PLATES ? 'opacity-30 cursor-not-allowed bg-gray-400/10 text-gray-400' : 'bg-blue-500/15 text-blue-600 hover:bg-blue-500/25 active:scale-90'}`}
              title="Add build plate"
            >
              <Plus size={14} strokeWidth={4} />
            </button>
            <button
              type="button"
              onClick={duplicateActivePlate}
              disabled={plates.length >= MAX_PLATES || !activePlate?.id}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${(plates.length >= MAX_PLATES || !activePlate?.id) ? 'opacity-30 cursor-not-allowed bg-gray-400/10 text-gray-400' : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 active:scale-90'}`}
              title="Duplicate build plate"
            >
              <Copy size={14} strokeWidth={3} />
            </button>
            <button
              type="button"
              onClick={() => deletePlate(effectiveActiveId)}
              disabled={plates.length <= 1}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${plates.length <= 1 ? 'opacity-30 cursor-not-allowed bg-red-500/5 text-red-400' : 'bg-red-500/10 hover:bg-red-500/20 text-red-600 active:scale-90'}`}
              title="Delete build plate"
            >
              <Trash2 size={14} strokeWidth={3} />
            </button>
          </div>
        </div>
        <div className="relative w-full h-[90px] flex items-center">
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-4 px-1 w-full h-full snap-x">
            {plates.map((plate) => (
              <button 
                key={plate.id} 
                onClick={() => { setActivePlateId(plate.id); setIsSelectingMaterial(false); setIsSelectingPrinter(false); }} 
                className={`relative flex-shrink-0 rounded-[12rem] border-2 transition-all duration-300 flex flex-col items-center justify-center snap-center 
                  ${effectiveActiveId === plate.id ? 'w-[58px] h-[58px] bg-[var(--color-surface)] border-[var(--color-primary)] text-[var(--color-primary)] scale-110 z-10' : 'w-[50px] h-[50px] bg-black/5 dark:bg-white/5 border-gray-400/30 opacity-40 text-black dark:text-white'}`}
              >
                <div className="flex flex-col items-center leading-none">
                  {isPlateValid(plate) ? <Check size={16} strokeWidth={4} className="mb-0.5 animate-in zoom-in" /> : <Layers size={14} strokeWidth={3} className="mb-0.5" />}
                  <span className="text-[9px] font-black uppercase italic">BP{plate.no}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 🔥 NEW: PRINTER SELECTION (Collapsible) */}
      <div className="project-preview-printer flex flex-col items-center text-center w-full max-w-2xl mx-auto px-3">
        <div className="flex flex-wrap justify-between items-center w-full mb-2 gap-2">
          <label className="text-[14px] font-black uppercase flex items-center gap-2 text-[var(--color-primary)]">
            <Printer size={12} strokeWidth={3} /> 3D Printer
          </label>
        </div>
        
        <div className="w-full space-y-3">
            <div
              onClick={() => {
                setIsSelectingPrinter((value) => !value);
                setIsSelectingMaterial(false);
              }}
              className={`w-full p-6 rounded-[1.8rem] bg-transparent flex flex-col gap-4 transition-all text-left cursor-pointer hover:border-[var(--color-primary)]/70 hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.99] ${
                isSelectingPrinter ? 'border-[var(--color-primary)] shadow-lg shadow-blue-500/10' : containerBorderStyle
              }`}
            >
              <div className="flex justify-between items-start w-full gap-4">
                <div className="text-left flex-1 min-w-0 flex flex-col gap-1">
                  <div className="flex flex-wrap items-baseline gap-2 min-w-0">
                    <span className="text-[14px] font-black uppercase text-[var(--color-primary)] truncate leading-none">{selectedPrinter?.brand || 'Select Printer'}</span>
                    <span className="text-[14px] font-black uppercase text-black dark:text-white truncate leading-none">{selectedPrinter?.model || selectedPrinter?.name || '---'}</span>
                  </div>
                  {selectedPrinter && (
                    <span className="text-[14px] font-black uppercase text-black dark:text-white truncate leading-none">
                      {formatPrinterCapacity(selectedPrinter.buildCapacity)} MM
                    </span>
                  )}
                  {selectedPrinter && (
                    <span className="text-[14px] font-black uppercase text-black dark:text-white truncate leading-none">
                      {getPrinterFilamentSlots(selectedPrinter)} Filament {getPrinterFilamentSlots(selectedPrinter) === 1 ? 'Slot' : 'Slots'}
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0 justify-start">
                  <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg shrink-0 leading-none ${selectedPrinter?.status?.toLowerCase() === 'online' || selectedPrinter?.status?.toLowerCase() === 'virtual' ? 'text-green-600' : 'text-red-600'}`}>
                    {selectedPrinter?.status || '---'}
                  </span>
                  <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full text-gray-500 shrink-0 leading-none">
                    {isSelectingPrinter ? 'Selected' : 'Tap to Change'}
                  </span>
                </div>
              </div>
              {isSelectingPrinter && (
                <div className="mt-1 border-t border-black/10 dark:border-white/10">
                  {printers.filter((p) => String(p.id) !== String(activePlate?.printerId)).map((p, index) => {
                    const isOnline = p.status?.toLowerCase() === 'online' || p.status?.toLowerCase() === 'virtual';
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const hasFeeder = getCompatibleFeeders(p).length > 0;
                          setPreviewData(prev => (prev || []).map(plate => (
                            plate.id === effectiveActiveId ? { ...plate, printerId: p.id, useCfs: hasFeeder ? plate.useCfs !== false : false } : plate
                          )));
                          setIsSelectingPrinter(false);
                          setIsSelectingMaterial(false);
                        }}
                        className={`w-full py-4 flex items-center justify-between gap-4 text-left transition-colors ${
                          index > 0 ? 'border-t border-black/10 dark:border-white/10' : ''
                        } hover:text-[var(--color-primary)]`}
                      >
                        <div className="min-w-0 flex flex-col gap-1">
                          <div className="flex flex-wrap items-baseline gap-2 min-w-0">
                            <span className="text-[14px] font-black uppercase text-[var(--color-primary)] truncate">{p.brand}</span>
                            <span className="text-[14px] font-black uppercase text-black dark:text-white truncate">{p.model || p.name}</span>
                          </div>
                          <span className="text-[14px] font-black uppercase text-black dark:text-white truncate">
                            {formatPrinterCapacity(p.buildCapacity)} MM
                          </span>
                          <span className="text-[14px] font-black uppercase text-black dark:text-white truncate">
                            {getPrinterFilamentSlots(p)} Filament {getPrinterFilamentSlots(p) === 1 ? 'Slot' : 'Slots'}
                          </span>
                        </div>
                        <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg shrink-0 ${isOnline ? 'text-green-600' : 'text-red-600'}`}>
                          {p.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
        </div>
      </div>

      {!isSelectingPrinter && (
        <div className="space-y-6 animate-in fade-in zoom-in duration-300 w-full max-w-2xl mx-auto px-3">
          <div className="flex flex-col items-center text-center">
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
        </div>
      )}

      {/* --- FORM SECTION --- */}
      {!isSelectingPrinter && (
        <div className="space-y-8 transition-all duration-500 relative w-full max-w-2xl mx-auto px-3">
          <div className="space-y-3 mt-8">
            {activeMaterialSlotsData.map((slot, idx) => {
                const slotMaterial = getLatestMaterial(slot.materialId, plates);

                return (
                  <div key={`${slot.materialId}-${idx}`} className={`flex gap-4 items-end transition-opacity duration-300 ${isSelectingMaterial && activeMaterialSlot !== idx ? 'opacity-30' : 'opacity-100'}`}>
                    <div className="w-[43%] flex flex-col items-center text-center">
                      <label className="text-[12px] font-black uppercase mb-2 flex items-center justify-center gap-2 text-[var(--color-primary)]">
                        <WeightTilde size={14} strokeWidth={3} /> BP{activePlate.no} M{idx + 1}
                      </label>
                      <div className={`w-full min-h-[68px] h-auto bg-transparent rounded-[1.8rem] relative flex flex-col items-center justify-center overflow-hidden transition-all duration-500 py-3 ${containerBorderStyle}`}>
                        <div className="flex items-baseline justify-center">
                          <input type="number" inputMode="decimal" value={slot.weight} onFocus={() => updateMaterialSlotWeight(idx, '')} onChange={(e) => updateMaterialSlotWeight(idx, e.target.value)} placeholder="0" className={`w-14 text-center bg-transparent border-none outline-none font-black text-[18px] italic ${slotMaterial?.isUpfront ? 'text-red-600' : 'text-black dark:text-white'}`} />
                          <span className={`text-[12px] font-black italic ${slotMaterial?.isUpfront ? 'text-red-600' : 'text-black dark:text-white'}`}>G</span>
                        </div>
                        {slotMaterial?.isUpfront && (
                          <div className="flex items-center gap-1 animate-pulse-subtle mt-0.5">
                            <AlertTriangle size={8} className="text-red-600" />
                            <span className="text-[9px] font-black uppercase text-red-600 italic">Upfront Req.</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="w-[57%] flex flex-col items-center text-center">
                      <label className="text-[12px] font-black uppercase mb-2 flex items-center justify-center gap-2 text-[var(--color-primary)]">
                        <Droplet size={14} strokeWidth={3} /> Material {idx + 1}
                      </label>
                      <div className="w-full relative">
                        <MaterialCard
                          mat={slotMaterial}
                          isUpfront={slotMaterial?.isUpfront}
                          toggleSelect={() => { setActiveMaterialSlot(idx); setIsSelectingPrinter(false); setIsSelectingMaterial(!isSelectingMaterial || activeMaterialSlot !== idx); }}
                          isChanging={isSelectingMaterial && activeMaterialSlot === idx}
                        />
                        {!isSelectingMaterial && activeMaterialSlotsData.length > 1 && (
                          <button type="button" onClick={() => removeMaterialSlot(idx)} className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg">
                            <X size={13} strokeWidth={4} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {!isSelectingMaterial && activeMaterialSlotsData.length < activeMaterialSlotsLimit && (
                <button type="button" onClick={addMaterialSlot} className="w-full py-3 rounded-[1.4rem] border-2 border-dashed border-[var(--color-primary)] text-[var(--color-primary)] flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest">
                  <Plus size={15} strokeWidth={4} /> Add Material Row
                </button>
              )}
            </div>

          {isSelectingMaterial && (
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
                      isSelected={String(mat.id) === String(currentMaterialId)}
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

{/* --- STICKY PLATE FOOTER --- */}
<div className="fixed left-1/2 bottom-0 md:bottom-[5dvh] z-[260] w-full max-w-[calc(100vw-2rem)] md:max-w-2xl lg:max-w-2xl -translate-x-1/2 px-3 pb-5 pt-8 lg:rounded-b-[2rem] transition-all duration-500">
  
  <div className="flex items-center gap-3 bg-[var(--color-bg)]/90 backdrop-blur-xl p-2 rounded-[2.5rem] border border-black/5 dark:border-white/5 shadow-2xl">
    
    {/* BACK BUTTON */}
    <button
      type="button"
      onClick={onBack}
      className="flex-none h-14 w-14 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg"
      aria-label="Back"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
    <button 
                onClick={handleNext}
                disabled={!isActivePlateValid}
                className="flex-1 h-14 rounded-[2.2rem] font-black italic uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-4 bg-[var(--color-primary)] text-white shadow-xl shadow-[var(--color-primary)]/20 active:scale-95 group disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                {isEverythingValid ? (
                  <>CONFIRM DETAILS
                  <div className="p-1 rounded-full bg-white/20 group-hover:translate-x-1 transition-transform">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="4" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </div>
                  </>
                ) : (
                  <>NEXT PLATE <Layers size={14} /> </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
