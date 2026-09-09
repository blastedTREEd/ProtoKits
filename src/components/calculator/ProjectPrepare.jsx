import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { 
  Plus, PackageMinus, PackagePlus, Box, Disc3, Copy, Trash2, X, Lock,
  VectorSquare, RefreshCw, Check, Scissors, Cpu,
  Scale, Clock, Search, Printer, UserRoundCog,
  Grid3X3
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { getPrinterCompatibleFilamentTypes, getPrinterFeeders, isFilamentCompatibleWithPrinter, isPrinterAvailableForCostEstimation, normalizePrinterStatus } from '../../utils/printerCompatibility';
import MaterialCard from './MaterialCard';

export default function ProjectPrepare({ 
  allFilaments = [], 
  onConfirm, 
  selectedFilaments = [], 
  activePrinter,
  onUnitChange,
  prepareData,
  setPrepareData,
  onBack
}) {
  const MAX_MODELS = 8;
  const isAdmin = useStore((state) => state.isAdmin);
  const { printers, feeders, rates: storeRates } = useStore();
  const DEFAULT_LAYER_HEIGHT_MM = 0.2;
  const DEFAULT_PURGE_WEIGHT_PER_SWAP = 0.05;

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
      .project-prepare-flow > * { order: 3; }
      .project-printer-selection { order: 1; }
      .project-printer-options { order: 1; }
      .project-models-nav { order: 2; }
    `}</style>
  );

  const containerBorderStyle = "border-[1.5px] border-gray-400/40 shadow-sm";

  const getPrinterBuildCapacity = useCallback((source) => {
    // Priority: Model specific build capacity override > Printer default capacity
    if (source?.buildCapacity && typeof source.buildCapacity === 'object') {
        return {
            x: Number(source.buildCapacity.x) || 256,
            y: Number(source.buildCapacity.y) || 256,
            z: Number(source.buildCapacity.z) || 256
        };
    }
    
    const modelPrinter = source?.printerId
      ? printers.find(p => String(p.id) === String(source.printerId))
      : null;
    const capacity = (modelPrinter || activePrinter)?.buildCapacity;
    if (capacity && typeof capacity === 'object') {
      return {
        x: Number(capacity.x) || 256,
        y: Number(capacity.y) || 256,
        z: Number(capacity.z) || 256
      };
    }
    return { x: 256, y: 256, z: 256 };
  }, [activePrinter, printers]);

  const getMMValue = (val, unit) => {
    const num = parseFloat(val);
    if (isNaN(num)) return 0;
    if (unit === 'cm') return num * 10;
    if (unit === 'in') return num * 25.4;
    return num;
  };

  const convertCapacity = (capacity, unit) => {
    if (!capacity) return '---';
    const { x, y, z } = capacity;
    if (!x || !y || !z) return '---';
    const dims = [x, y, z];
    const formatValue = (num, decimals) => Number(num.toFixed(decimals));
    if (unit === 'cm') return dims.map(d => formatValue(d / 10, 1)).join(' × ');
    if (unit === 'in') return dims.map(d => formatValue(d / 25.4, 2)).join(' × ');
    return dims.join(' × ');
  };

  const emulateSlicer = useCallback((l, w, h, walls, infill, quantity = 1) => {
    if (!l || !w || !h) return { weight: 0, printTime: 0, setupTime: 0 };
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const wallCount = parseInt(walls) || 2;
    const wallThickness = wallCount * 0.4; 
    const infillRatio = (parseInt(infill) || 15) / 100;
    
    // Volume calculation
    const V_total = l * w * h;
    const innerL = Math.max(0, l - (2 * wallThickness));
    const innerW = Math.max(0, w - (2 * wallThickness));
    const innerH = Math.max(0, h - (2 * wallThickness));
    const V_shell = V_total - (innerL * innerW * innerH);
    const V_infill = (innerL * innerW * innerH) * infillRatio;
    const V_print = (V_shell + V_infill) * 0.4;
    const V_print_batch = V_print * qty;
    
    // Weight
    const weight = (V_print_batch / 1000) * 1.24;
    
    // Time calculation - Adjusted
    const avgDim = (l + w + h) / 3;
    let adaptiveFlow = avgDim > 60 ? 10.5 : (avgDim > 30 ? 7.5 : 5.0); 
    const printTimeSeconds = (V_print_batch / adaptiveFlow) + (h / 0.2 * 2.6); 
    
    // Setup time (fixed penalty)
    const setupTimeSeconds = 450; 
    
    return { 
      weight: parseFloat(weight.toFixed(2)), 
      printTime: printTimeSeconds / 3600, // convert to hours
      setupTime: setupTimeSeconds / 3600  // convert to hours
    };
  }, []);

  const getLogicalDims = useCallback((m) => {
    if (!m) return { l: 0, w: 0, h: 0, parts: 1, weight: 0, hours: 0 };
    const limits = getPrinterBuildCapacity(m);

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

    const { weight: partWeightRaw, printTime: partTimeRaw, setupTime: partSetupRaw } = emulateSlicer(
      mmL / px, mmW / py, mmH / pz, m.walls, m.infill
    );

    const quantity = Math.max(1, parseInt(m.quantity, 10) || 1);
    const totalWeight = parseFloat((partWeightRaw * totalParts * quantity).toFixed(1));
    // Apply setup time once per model batch (one job)
    const totalHours = (partTimeRaw * totalParts * quantity) + partSetupRaw;

    return {
      l: mmL, w: mmW, h: mmH,
      split: { x: px, y: py, z: pz },
      parts: totalParts,
      part: {
        l: mmL / px, w: mmW / py, h: mmH / pz,
        weight: parseFloat(partWeightRaw.toFixed(2)),
        hours: partTimeRaw + partSetupRaw
      },
      total: { weight: totalWeight, hours: totalHours },
      weight: totalWeight,
      hours: totalHours
    };
  }, [getPrinterBuildCapacity, emulateSlicer]);

  const [internalActiveId, setInternalActiveId] = useState(null);
  const [matSearchQuery, setMatSearchQuery] = useState('');
  const [activeMaterialSlot, setActiveMaterialSlot] = useState(0);
  const [isSelectingPrinter, setIsSelectingPrinter] = useState(false);
  const modelInputRefs = useRef({});

  const activeModelId = internalActiveId || (prepareData?.[0]?.id || null);
  const activeModel = useMemo(() => prepareData?.find(m => m.id === activeModelId) || prepareData[0] || {}, [prepareData, activeModelId]);
  // Maintenance printers remain valid for estimation. Unavailable printers
  // are not active selections, but remain visible in the picker.
  const selectedPrinter = useMemo(() => printers.find((p) => (
    String(p.id) === String(activeModel?.printerId)
    && isPrinterAvailableForCostEstimation(p)
  )), [printers, activeModel]);
  const compatibleFilamentTypes = useMemo(() => getPrinterCompatibleFilamentTypes(selectedPrinter), [selectedPrinter]);

  const changeModel = (id) => {
    setInternalActiveId(id);
    setActiveMaterialSlot(0);
    setIsSelectingMaterial(false);
    setIsSelectingPrinter(false);
  };

  const getCompatibleFeeders = useCallback((printer) => {
    return getPrinterFeeders(printer, feeders);
  }, [feeders]);

  const compatibleFeeders = useMemo(() => getCompatibleFeeders(selectedPrinter), [getCompatibleFeeders, selectedPrinter]);
  const getPrinterFilamentSlots = useCallback((printer) => {
    if (!printer) return 1;
    const pFeeders = getCompatibleFeeders(printer);
    const feederSlots = pFeeders.reduce((sum, unit) => sum + (Number(unit.filamentSlots) || 0), 0);
    return Math.max(1, feederSlots || Number(printer.filamentSlots) || 1);
  }, [getCompatibleFeeders]);
  const getCfsSwapRate = useCallback((printer) => {
    const primaryFeeder = getCompatibleFeeders(printer)[0];
    const laborRates = storeRates?.['labor-cost'] || {};
    const configured = Number(primaryFeeder?.swapTime ?? printer?.swapTime ?? printer?.cfs?.swapTime ?? 0);
    return configured > 0 ? configured : (Number(laborRates.multicolorPenalty) || 0);
  }, [getCompatibleFeeders, storeRates]);

  const getPurgeWeightPerSwap = useCallback((printer) => {
    const primaryFeeder = getCompatibleFeeders(printer)[0];
    const configured = Number(
      primaryFeeder?.purgeWeight
      ?? primaryFeeder?.purgeGrams
      ?? primaryFeeder?.cleanBufferWeight
      ?? printer?.purgeWeight
      ?? printer?.purgeGrams
      ?? printer?.cfs?.purgeWeight
      ?? 0
    );
    return configured > 0 ? configured : DEFAULT_PURGE_WEIGHT_PER_SWAP;
  }, [getCompatibleFeeders]);
  
  // Calculate the absolute maximum filament slots available across ALL printers
  const maxProjectFilamentSlots = useMemo(() => {
    if (!printers || printers.length === 0) return 1;
    return Math.max(...printers.map(p => getPrinterFilamentSlots(p)));
  }, [printers, getPrinterFilamentSlots]);

  const activeMaterialSlotsLimit = maxProjectFilamentSlots;

  const selectedPrinterHasFeeder = compatibleFeeders.length > 0;

  useEffect(() => {
    const filaments = allFilaments || [];
    if ((!prepareData || prepareData.length === 0) && filaments.length > 0) {
        // Always take the first selected filament as the default for the first model's material
        const defaultFil = (selectedFilaments && selectedFilaments[0]) || filaments.find(f => f.status?.toLowerCase() === 'upfront') || filaments[0];
        const defaultId = String(defaultFil.materialId || defaultFil.id);
        
        setPrepareData([{
          id: Date.now(), no: 1, length: '', width: '', height: '',
          unit: 'mm', materialId: defaultId,
          materialSlots: [
            { materialId: defaultId, swapPercent: '100' }
          ],
          walls: '', infill: '', weight: '', days: '', hours: '', mins: '', secs: '', quantity: 1,
          isManualPrinter: false
        }]);
    }
  }, [selectedFilaments, allFilaments, prepareData, setPrepareData]);

  const models = useMemo(() => prepareData || [], [prepareData]);
  
  const updateModelPrinter = useCallback((printerId) => {
    setPrepareData(prev => (prev || []).map(m => m.id === activeModelId ? { ...m, printerId } : m));
  }, [activeModelId, setPrepareData]);
  
  const optimizePrinterAssignment = useCallback((model) => {
    if (!printers || printers.length === 0) return null;
    const dims = getLogicalDims(model);
    const requiredSlots = model.materialSlots?.length || 1;
    const needsFeeder = requiredSlots > 1;

    // Filter printers that can accommodate the model dimensions
    const estimationPrinters = printers.filter(isPrinterAvailableForCostEstimation);
    if (estimationPrinters.length === 0) return null;

    const fitsDimsPrinters = estimationPrinters.filter(p => {
        const cap = getPrinterBuildCapacity(p); // Use helper to ensure consistency
        return dims.l <= cap.x && dims.w <= cap.y && dims.h <= cap.z;
    });

    if (fitsDimsPrinters.length === 0) {
        // Fallback: Return the smallest printer overall if none fit
        return estimationPrinters.sort((a, b) => {
            const volA = (a.buildCapacity?.x || 0) * (a.buildCapacity?.y || 0) * (a.buildCapacity?.z || 0);
            const volB = (b.buildCapacity?.x || 0) * (b.buildCapacity?.y || 0) * (b.buildCapacity?.z || 0);
            return volA - volB;
        })[0]?.id || null;
    }

    // Among printers that fit dimensions, filter for required slots
    const capablePrinters = fitsDimsPrinters.filter(p => {
        const pFeeders = getCompatibleFeeders(p);
        if (needsFeeder && pFeeders.length === 0) return false;
        const feederSlots = pFeeders.reduce((sum, unit) => sum + (Number(unit.filamentSlots) || 0), 0);
        const totalSlots = Math.max(feederSlots || Number(p.filamentSlots) || 1);
        return totalSlots >= requiredSlots;
    });

    // If capable printers exist, pick the smallest among them.
    // If not, pick the smallest among those that at least fit dimensions (even if slots fail)
    const targetSet = capablePrinters.length > 0 ? capablePrinters : fitsDimsPrinters;

    return targetSet.sort((a, b) => {
        const volA = (a.buildCapacity?.x || 0) * (a.buildCapacity?.y || 0) * (a.buildCapacity?.z || 0);
        const volB = (b.buildCapacity?.x || 0) * (b.buildCapacity?.y || 0) * (b.buildCapacity?.z || 0);
        return volA - volB;
    })[0]?.id || null;
  }, [printers, getLogicalDims, getCompatibleFeeders, getPrinterBuildCapacity]);

  useEffect(() => {
    if (activeModel && activeModel.id && !activeModel.isManualPrinter) {
        const optimalPrinterId = optimizePrinterAssignment(activeModel);
        if ((optimalPrinterId || null) !== (activeModel.printerId || null)) {
            updateModelPrinter(optimalPrinterId || null);
        }
    }
  }, [activeModel, updateModelPrinter, optimizePrinterAssignment]);
  
  const [isSelectingMaterial, setIsSelectingMaterial] = useState(false);

  const logicalData = useMemo(() => {
    if (!activeModel || !activeModel.id) return { l: 0, w: 0, h: 0, parts: 1, total: { weight: 0, hours: 0 }, part: { l: 0, w: 0, h: 0, weight: 0, hours: 0 } };
    return getLogicalDims(activeModel);
  }, [activeModel, getLogicalDims]);

  const getBuildPlateDuplicateLimit = useCallback((model) => {
    if (!model) return 1;
    const dims = getLogicalDims({ ...model, quantity: 1 });
    if (!dims.l || !dims.w || dims.parts > 1) return 1;
    const capacity = getPrinterBuildCapacity(model);
    
    const GAP = 3; // 3mm gap

    // Formula: floor((Capacity + Gap) / (Dimension + Gap))
    // We add the gap to capacity to allow fitting the last item without an extra trailing gap.
    const fitX = Math.floor((capacity.x + GAP) / (dims.l + GAP));
    const fitY = Math.floor((capacity.y + GAP) / (dims.w + GAP));
    
    const normalFit = fitX * fitY;
    
    // Also check rotated orientation
    const fitXRot = Math.floor((capacity.x + GAP) / (dims.w + GAP));
    const fitYRot = Math.floor((capacity.y + GAP) / (dims.l + GAP));
    const rotatedFit = fitXRot * fitYRot;

    return Math.max(1, normalFit, rotatedFit);
  }, [getLogicalDims, getPrinterBuildCapacity]);

  const getBuildPlatePartCapacity = useCallback((model) => {
    if (!model) return 1;
    const dims = getLogicalDims({ ...model, quantity: 1 });
    const part = dims.part || {};
    if (!part.l || !part.w) return 1;

    const capacity = getPrinterBuildCapacity(model);
    const GAP = 3;
    const fitX = Math.floor((capacity.x + GAP) / (part.l + GAP));
    const fitY = Math.floor((capacity.y + GAP) / (part.w + GAP));
    const fitXRot = Math.floor((capacity.x + GAP) / (part.w + GAP));
    const fitYRot = Math.floor((capacity.y + GAP) / (part.l + GAP));

    return Math.max(1, fitX * fitY, fitXRot * fitYRot);
  }, [getLogicalDims, getPrinterBuildCapacity]);

  const getModelQuantity = useCallback((model) => {
    const qty = Math.max(1, parseInt(model?.quantity, 10) || 1);
    if (getLogicalDims(model).parts > 1) return qty;
    return Math.min(qty, getBuildPlateDuplicateLimit(model));
  }, [getBuildPlateDuplicateLimit, getLogicalDims]);

  const getBuildPlateHours = useCallback((model) => {
    const dims = getLogicalDims(model);
    const quantity = getModelQuantity(model);
    
    if (quantity <= 1) return dims.total.hours;
    if (dims.parts > 1) return dims.total.hours;
    
    const slicerResult = emulateSlicer(dims.l, dims.w, dims.h, model?.walls, model?.infill, quantity);
    
    return slicerResult.hours;
  }, [emulateSlicer, getLogicalDims, getModelQuantity]);

  const canFitModelsOnPlate = useCallback((plateModels) => {
    if (!plateModels?.length) return true;
    const capacity = getPrinterBuildCapacity(plateModels[0]);
    const GAP = 3;
    const rects = plateModels.flatMap((model) => {
      const dims = getLogicalDims({ ...model, quantity: 1 });
      const quantity = getModelQuantity(model);
      if (!dims.l || !dims.w || dims.parts > 1) return [{ l: capacity.x + 1, w: capacity.y + 1 }];
      return Array.from({ length: quantity }, () => ({ l: dims.l, w: dims.w }));
    }).sort((a, b) => Math.max(b.l, b.w) - Math.max(a.l, a.w));

    const tryPack = (allowRotate) => {
      const rows = [];
      return rects.every((rect) => {
        const orientations = allowRotate && rect.l !== rect.w
          ? [{ x: rect.l, y: rect.w }, { x: rect.w, y: rect.l }]
          : [{ x: rect.l, y: rect.w }];

        for (const size of orientations) {
          if (size.x > capacity.x || size.y > capacity.y) continue;
          const row = rows.find((candidate) => (
            size.y <= candidate.height
            && candidate.width + (candidate.width > 0 ? GAP : 0) + size.x <= capacity.x
          ));
          if (row) {
            row.width += (row.width > 0 ? GAP : 0) + size.x;
            return true;
          }
          const usedHeight = rows.reduce((sum, candidate) => sum + candidate.height, 0) + (rows.length * GAP);
          if (usedHeight + size.y <= capacity.y) {
            rows.push({ width: size.x, height: size.y });
            return true;
          }
        }
        return false;
      });
    };

    return tryPack(true);
  }, [getLogicalDims, getModelQuantity, getPrinterBuildCapacity]);

  const activeDuplicateLimit = useMemo(() => getBuildPlateDuplicateLimit(activeModel), [activeModel, getBuildPlateDuplicateLimit]);
  const activeQuantity = useMemo(() => getModelQuantity(activeModel), [activeModel, getModelQuantity]);
  const activeQuantityLimit = useMemo(() => logicalData.parts > 1 ? 99 : activeDuplicateLimit, [activeDuplicateLimit, logicalData.parts]);

  const getMulticolorUsage = useCallback((model) => {
    const slots = (model?.materialSlots?.length ? model.materialSlots : [{ materialId: model?.materialId }])
      .filter(slot => slot?.materialId);
    const colorCount = slots.length;
    if (colorCount <= 1) return { swaps: 0, swapMins: 0, purgeWeight: 0 };

    const dims = getLogicalDims(model);
    if (!dims.h) return { swaps: 0, swapMins: 0, purgeWeight: 0 };

    const printer = printers.find(p => String(p.id) === String(model?.printerId)) || selectedPrinter || activePrinter;
    const layers = Math.ceil(dims.h / DEFAULT_LAYER_HEIGHT_MM);
    const swaps = layers * (colorCount - 1);
    const swapMins = swaps * getCfsSwapRate(printer);
    const purgeWeight = swaps * getPurgeWeightPerSwap(printer);
    return {
      swaps,
      swapMins,
      purgeWeight: Number(purgeWeight.toFixed(2))
    };
  }, [activePrinter, getCfsSwapRate, getLogicalDims, getPurgeWeightPerSwap, printers, selectedPrinter]);

  const getBuildPlateEstimate = useCallback((plateModels) => {
    const validPlateModels = plateModels || [];
    const weight = validPlateModels.reduce((sum, model) => (
      sum + getLogicalDims(model).weight + getMulticolorUsage(model).purgeWeight
    ), 0);
    const modelTimes = validPlateModels.map((model) => getBuildPlateHours(model) + (getMulticolorUsage(model).swapMins / 60));
    const setupOverlapHours = Math.max(0, modelTimes.length - 1) * (450 / 3600);
    const hours = Math.max(0, modelTimes.reduce((sum, value) => sum + value, 0) - setupOverlapHours);
    return {
      weight: Number(weight.toFixed(1)),
      hours,
      time: Math.round(hours * 60)
    };
  }, [getBuildPlateHours, getLogicalDims, getMulticolorUsage]);

  const isSplitDetected = useMemo(() => {
    return models.some(m => getLogicalDims(m).parts > 1);
  }, [models, getLogicalDims]);

  const totalRequired = useMemo(() => {
    return models.reduce((acc, m) => {
      const baseWeight = getLogicalDims(m).weight;
      return acc + baseWeight + getMulticolorUsage(m).purgeWeight;
    }, 0);
  }, [models, getLogicalDims, getMulticolorUsage]);
  
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

  const activeMaterialSlotsData = useMemo(() => {
    if (activeModel?.materialSlots?.length) {
      return activeModel.materialSlots
        .filter(slot => slot?.materialId)
        .map(slot => ({ materialId: String(slot.materialId), swapPercent: slot.swapPercent ?? '' }));
    }
    return [{ materialId: String(activeModel?.materialId || ''), swapPercent: '100' }].filter(slot => slot.materialId);
  }, [activeModel]);
  const currentMaterialId = activeMaterialSlotsData[activeMaterialSlot]?.materialId || activeModel?.materialId;
  const currentMaterial = activeModel && currentMaterialId ? getLatestMaterial(currentMaterialId) : null;
  const activeIsMulticolor = activeMaterialSlotsData.length > 1;
  const activeIsDuplicatedMulticolor = activeIsMulticolor && activeQuantity > 1;
  const canAddMaterialToActiveModel = models.length === 1 && activeMaterialSlotsData.length < activeMaterialSlotsLimit;

  const getModelMaterialKey = useCallback((model) => {
    const slots = (model?.materialSlots?.length ? model.materialSlots : [{ materialId: model?.materialId }])
      .map(slot => String(slot?.materialId || ''))
      .filter(Boolean);
    return slots.length > 1 ? slots.sort().join('+') : (slots[0] || 'unassigned');
  }, []);

  const buildPlateGroups = useMemo(() => {
    const groups = [];
    models.forEach((model) => {
      const materialKey = getModelMaterialKey(model);
      const printerKey = String(model?.printerId || activePrinter?.id || 'default');
      const key = `${printerKey}:${materialKey}`;
      
      // Find all groups that match the printer/material key
      const compatibleGroups = groups.filter(group => group.key === key);
      
      // Try to find the first group that can fit this model
      const bestGroup = compatibleGroups.find(group => 
        canFitModelsOnPlate([...group.modelData, model])
      );

      if (bestGroup) {
        bestGroup.models.push(model.id);
        bestGroup.modelData.push(model);
      } else {
        // If no existing group can fit it, create a new one
        groups.push({
          id: `bp-${groups.length + 1}-${key}`,
          key,
          materialKey,
          no: groups.length + 1,
          materialIds: materialKey.split('+'),
          models: [model.id],
          modelData: [model],
          printerId: model?.printerId || activePrinter?.id || null
        });
      }
    });
    return groups.map(group => ({
      ...group,
      estimate: getBuildPlateEstimate(group.modelData)
    }));
  }, [activePrinter?.id, canFitModelsOnPlate, getBuildPlateEstimate, getModelMaterialKey, models]);

  const activeBuildPlate = useMemo(() => {
    return buildPlateGroups.find(group => group.models.includes(activeModelId)) || buildPlateGroups[0] || null;
  }, [buildPlateGroups, activeModelId]);

  const isModelBuildPlateQuantityFull = useCallback((model) => {
    if (!model) return false;
    const dims = getLogicalDims(model);
    const qty = Math.max(1, parseInt(model.quantity, 10) || 1);

    if (dims.parts > 1) {
      return true;
    }

    const buildPlateGroup = buildPlateGroups.find(gp => gp.models.includes(model.id));
    const nextPlateModels = [
      ...((buildPlateGroup?.modelData || []).filter(m => m.id !== model.id)),
      { ...model, quantity: qty + 1 }
    ];

    return !canFitModelsOnPlate(nextPlateModels);
  }, [buildPlateGroups, canFitModelsOnPlate, getLogicalDims]);

  const buildPlateWarningModelIds = useMemo(() => {
    const warningIds = new Set();
    buildPlateGroups.forEach((group) => {
      const shouldWarn = group.modelData.some(model => isModelBuildPlateQuantityFull(model));
      if (shouldWarn) {
        group.models.forEach(id => warningIds.add(id));
      }
    });
    return warningIds;
  }, [buildPlateGroups, isModelBuildPlateQuantityFull]);

  const activeMulticolorUsage = useMemo(() => getMulticolorUsage(activeModel), [activeModel, getMulticolorUsage]);
  const activeEstimatedWeight = useMemo(() => Number(activeBuildPlate?.estimate?.weight || 0), [activeBuildPlate]);
  const activeEstimatedHours = useMemo(() => Number(activeBuildPlate?.estimate?.hours || 0), [activeBuildPlate]);
  const isTripleLimitHit = useMemo(() => activeEstimatedWeight >= 10000 && logicalData.parts >= 10 && Math.round(activeEstimatedHours * 60) >= 10000, [activeEstimatedWeight, activeEstimatedHours, logicalData.parts]);

  useEffect(() => {
    if (activeIsDuplicatedMulticolor && isSelectingMaterial) {
      setIsSelectingMaterial(false);
    }
  }, [activeIsDuplicatedMulticolor, isSelectingMaterial]);

  const sortedMaterials = useMemo(() => {
    if (!activeModel) return [];
    const filaments = allFilaments || [];
    const printerForMaterialCompatibility = selectedPrinter || activePrinter;
    const activeMatId = String(currentMaterialId || activeModel.materialId);

    // A filament already assigned to any slot cannot be selected again.
    const currentModelPaletteIds = new Set(
      activeMaterialSlotsData
        .map(slot => String(slot.materialId))
        .filter(Boolean)
    );

    const projectPaletteIds = new Set([
      ...(selectedFilaments || []).map(f => String(f.materialId || f.id)),
      ...(models || []).flatMap(m => (m.materialSlots?.length ? m.materialSlots.map(slot => slot.materialId) : [m.materialId]).filter(Boolean).map(String))
    ]);
    const selectedMaterialIds = new Set(
      (selectedFilaments || [])
        .map(f => String(f.materialId || f.id || ''))
        .filter(Boolean)
    );
    const hasSelectedMaterialFilter = selectedMaterialIds.size > 0;

    let list = [...filaments]
      .filter(f => {
        const fId = String(f.id);

        if (!isFilamentCompatibleWithPrinter(printerForMaterialCompatibility, f)) return false;

        // Only show materials selected for this project.
        if (hasSelectedMaterialFilter && !selectedMaterialIds.has(fId)) return false;
        
        // CRITICAL: Cannot pick the same physical spool for two different slots
        if (currentModelPaletteIds.has(fId)) return false;

        const stock = parseFloat(f.remaining || 0);
        const isInProjectPalette = projectPaletteIds.has(fId);
        return stock > 0 || isInProjectPalette || fId === activeMatId || f.status?.toLowerCase() === 'upfront';
      });

    if (matSearchQuery.trim()) {
      const q = matSearchQuery.toLowerCase();
      // Search the full compatible inventory so out-of-stock materials can
      // still be found and displayed with their stock/upfront state.
      list = filaments.filter(f => {
        const fId = String(f.id);
        return isFilamentCompatibleWithPrinter(printerForMaterialCompatibility, f) &&
          !currentModelPaletteIds.has(fId) && (
            f.name?.toLowerCase().includes(q) ||
            f.brand?.toLowerCase().includes(q) ||
            f.type?.toLowerCase().includes(q)
          );
      });
    }

    return list.sort((a, b) => {
        if (String(a.id) === activeMatId) return -1;
        if (String(b.id) === activeMatId) return 1;
        return (parseFloat(b.remaining) || 0) - (parseFloat(a.remaining) || 0);
      });
  }, [activePrinter, allFilaments, activeModel, currentMaterialId, models, selectedFilaments, matSearchQuery, activeMaterialSlotsData, selectedPrinter]);

  const updateModelData = (id, field, value) => {
    if (field === 'materialId') {
      const targetModel = models.find(m => m.id === id);
      const targetSlots = targetModel?.materialSlots?.length ? targetModel.materialSlots : [{ materialId: targetModel?.materialId }];
      if (targetSlots.length > 1 && getModelQuantity(targetModel) > 1) return;
      setPrepareData(prev => (prev || []).map(m => {
        if (m.id !== id) return m;
        if (m.materialSlots?.length) {
          const slots = [...m.materialSlots];
          slots[activeMaterialSlot] = { ...(slots[activeMaterialSlot] || {}), materialId: String(value) };
          return { ...m, materialId: slots[0]?.materialId || String(value), materialSlots: slots };
        }
        return { ...m, materialId: String(value) };
      }));
      return;
    }
    let processedValue = ['walls', 'infill'].includes(field) ? value.replace(/[^0-9]/g, '') : value.replace(/[^0-9.]/g, '');
    if ((processedValue.match(/\./g) || []).length > 1) return;

    setPrepareData(prev => (prev || []).map(m => {
      if (m.id === id) {
        let newModel = { ...m, [field]: processedValue };
        
        if (['length', 'width', 'height'].includes(field)) {
          newModel[`baseMM_${field}`] = getMMValue(newModel[field] || 0, m.unit);
        }
        return newModel;
      }
      return m;
    }));
  };

  const addMaterialSlot = () => {
    if (!canAddMaterialToActiveModel) return;
    
    // Find unused materials
    const usedIds = new Set(activeMaterialSlotsData.map(slot => String(slot.materialId)));
    const unusedFilaments = (allFilaments || []).filter(f => !usedIds.has(String(f.id)));
    
    // Pick the one with the highest remaining stock - STRICTLY REMAINING ONLY
    const sortedUnused = [...unusedFilaments].sort((a, b) => {
        const remA = parseFloat(a.remaining) || 0;
        const remB = parseFloat(b.remaining) || 0;
        // Descending order (highest first)
        return remB - remA;
    });

    const fallback = sortedUnused.length > 0 
      ? sortedUnused[0].id
      : (activeMaterialSlotsData[activeMaterialSlotsData.length - 1]?.materialId || activeModel?.materialId);

    setPrepareData(prev => (prev || []).map(m => {
      if (m.id !== activeModelId) return m;
      const slots = [...activeMaterialSlotsData, { materialId: String(fallback), swapPercent: '100', weight: '' }];
      return { ...m, useCfs: selectedPrinterHasFeeder, materialSlots: slots, materialId: slots[0]?.materialId || m.materialId };
    }));
    setActiveMaterialSlot(activeMaterialSlotsData.length);
  };

  const updateActiveQuantity = (nextQty) => {
    const cleanQty = Math.min(activeQuantityLimit, Math.max(1, parseInt(nextQty, 10) || 1));
    setPrepareData(prev => (prev || []).map(m => (
      m.id === activeModelId ? { ...m, quantity: cleanQty } : m
    )));
  };

  const resetActiveModel = (shouldConfirm = true) => {
    if (shouldConfirm && !window.confirm('Reset this model and remove all others?')) return;
    setPrepareData(prev => {
      const activeModel = prev.find(m => m.id === activeModelId);
      if (!activeModel) return prev;
      
      const primarySlot = (activeModel.materialSlots?.[0] || { materialId: activeModel.materialId, swapPercent: '100' });
      
      return [{
        ...activeModel,
        no: 1,
        quantity: 1,
        materialId: primarySlot.materialId || activeModel.materialId,
        materialSlots: [{ ...primarySlot, swapPercent: '100' }]
      }];
    });
    setInternalActiveId(activeModelId);
    setActiveMaterialSlot(0);
    setIsSelectingMaterial(false);
  };

  const addBlankModel = () => {
    if (models.length >= MAX_MODELS || isSplitDetected || activeIsMulticolor) return;
    const nid = Date.now();
    setPrepareData(prev => [
      ...(prev || []),
      {
        id: nid,
        no: (prev || []).length + 1,
        length: '',
        width: '',
        height: '',
        unit: activeModel.unit || 'mm',
        materialId: activeModel.materialId,
        materialSlots: activeMaterialSlotsData.slice(0, 1).map(slot => ({ ...slot, swapPercent: '100' })),
        walls: '',
        infill: '',
        quantity: 1,
        isManualPrinter: false
      }
    ]);
    setInternalActiveId(nid);
    setActiveMaterialSlot(0);
    setIsSelectingMaterial(false);
    setIsSelectingPrinter(false);
  };

  const duplicateActiveModel = () => {
    if (models.length >= MAX_MODELS || isSplitDetected || !activeModel?.id) return;
    const nid = Date.now();
    setPrepareData(prev => [
      ...(prev || []),
      {
        ...activeModel,
        id: nid,
        no: (prev || []).length + 1,
        quantity: 1,
        materialSlots: activeMaterialSlotsData.map(slot => ({ ...slot })),
        isManualPrinter: activeModel.isManualPrinter || false
      }
    ]);
    setInternalActiveId(nid);
    setActiveMaterialSlot(0);
    setIsSelectingMaterial(false);
    setIsSelectingPrinter(false);
  };

  const deleteActiveModel = () => {
    if (!window.confirm('Delete this model?')) return;

    if (models.length <= 1) {
      resetActiveModel(false);
      return;
    }

    const updated = models
      .filter(model => model.id !== activeModelId)
      .map((model, idx) => ({ ...model, no: idx + 1 }));
    setPrepareData(updated);
    setInternalActiveId(updated[0]?.id || null);
    setActiveMaterialSlot(0);
    setIsSelectingMaterial(false);
    setIsSelectingPrinter(false);
  };

  const removeMaterialSlot = (slotIdx) => {
    if (activeMaterialSlotsData.length <= 1) return;
    const slots = activeMaterialSlotsData.filter((_, idx) => idx !== slotIdx);
    setPrepareData(prev => (prev || []).map(m => (
      m.id === activeModelId ? { ...m, materialSlots: slots, materialId: slots[0]?.materialId || m.materialId } : m
    )));
    
    // If we delete the focused slot or a slot before it, adjust focus
    if (activeMaterialSlot === slotIdx) {
      setActiveMaterialSlot(Math.max(0, slotIdx - 1));
    } else if (activeMaterialSlot > slotIdx) {
      setActiveMaterialSlot(activeMaterialSlot - 1);
    }
  };

  const getWeightedMaterialSlots = (model, totalWeight) => {
    const slots = (model?.materialSlots?.length ? model.materialSlots : [{ materialId: model?.materialId, swapPercent: '100' }])
      .filter(slot => slot?.materialId)
      .map(slot => ({
        materialId: String(slot.materialId),
        percent: slot.swapPercent === '' || slot.swapPercent === null || slot.swapPercent === undefined ? null : Math.max(0, Number(slot.swapPercent) || 0)
      }));
    if (!slots.length) return [];
    const fixedTotal = slots.reduce((sum, slot) => sum + (slot.percent ?? 0), 0);
    const openSlots = slots.filter(slot => slot.percent === null);
    const normalized = openSlots.length
      ? slots.map(slot => ({ ...slot, percent: slot.percent === null ? Math.max(0, 100 - fixedTotal) / openSlots.length : slot.percent }))
      : slots.map(slot => ({ ...slot, percent: fixedTotal > 0 ? (slot.percent / fixedTotal) * 100 : 100 / slots.length }));
    return normalized.map(slot => ({
      materialId: slot.materialId,
      percent: Number(slot.percent.toFixed(2)),
      weight: Number(((Number(totalWeight || 0) * slot.percent) / 100).toFixed(2))
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
    const wallsValid = m.walls === '' || wallsVal === 2 || (wallsVal >= 3 && wallsVal <= 10);
    const infillValid = m.infill === '' || infillVal === 15 || (infillVal > 15 && infillVal <= 99);
    return dimsValid && wallsValid && infillValid;
  };

  const isEverythingValid = models.every(isModelValid);
  const isActiveModelValid = activeModel ? isModelValid(activeModel) : false;
  const nextIncompleteModel = models.find(m => !isModelValid(m) && String(m.id) !== String(activeModel?.id));

  const focusFirstMissingModelInput = () => {
    if (!activeModel?.id) return;

    const missingDimension = ['length', 'width', 'height'].find((field) => (
      getMMValue(activeModel[field], activeModel.unit) <= 0
    ));
    if (missingDimension) {
      const input = modelInputRefs.current[`${activeModel.id}-${missingDimension}`];
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input?.focus();
      return;
    }

    if (!activeModel.materialId) {
      setIsSelectingPrinter(false);
      setIsSelectingMaterial(true);
      setMatSearchQuery('');
    }
  };

  const timeBreakdown = useMemo(() => {
    const hoursToUse = logicalData.parts > 1 ? logicalData.part.hours : activeEstimatedHours;
    const totalMinutes = Math.round(hoursToUse * 60);
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const mins = totalMinutes % 60;
    return { days, hours, mins, secs: 0 };
  }, [logicalData, activeEstimatedHours]);

  const convertLength = (value) => {
    if (activeModel.unit === "cm") return value / 10;
    if (activeModel.unit === "in") return value / 25.4;
    return value;
  };

  const cardBase = "rounded-3xl p-3 border flex flex-col items-center justify-center transition-all";
  const cardNormal = "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/40";
  const cardError = "border-red-500/40 bg-red-500/5";

  return (
    <div className="project-prepare-flow w-full min-h-[calc(100dvh-210px)] lg:min-h-[calc(90dvh-210px)] flex flex-col gap-8 pb-[160px] sm:pb-32 md:pb-32 lg:pb-32 animate-in fade-in slide-in-from-bottom-4 duration-500 text-[var(--color-text-main)] text-left">
      {customStyles}

      {/* --- NAVIGATION --- */}
      <div className="project-models-nav w-full max-w-2xl mx-auto px-3 space-y-0 text-center">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold uppercase flex items-center gap-2 text-[var(--color-primary)]">
            <Box size={18} strokeWidth={3} /> Project Models {models.length > 0 && <span>({models.length}/{MAX_MODELS})</span>}
          </h2>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => updateActiveQuantity(activeQuantity - 1)}
              disabled={activeQuantity <= 1}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${activeQuantity <= 1 ? 'opacity-50 cursor-not-allowed bg-gray-400/10 text-gray-400' : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 active:scale-90'}`}
              title="Decrease quantity"
            >
              <PackageMinus size={18} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => updateActiveQuantity(activeQuantity + 1)}
              disabled={activeQuantity >= activeQuantityLimit || !canFitModelsOnPlate([...activeBuildPlate.modelData.filter(m => m.id !== activeModelId), { ...activeModel, quantity: activeQuantity + 1 }])}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${(activeQuantity >= activeQuantityLimit || !canFitModelsOnPlate([...activeBuildPlate.modelData.filter(m => m.id !== activeModelId), { ...activeModel, quantity: activeQuantity + 1 }])) ? 'opacity-50 cursor-not-allowed bg-gray-400/10 text-gray-400' : 'bg-blue-500/15 text-blue-600 hover:bg-blue-500/25 active:scale-90'}`}
              title="Increase quantity"
            >
              <PackagePlus size={18} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={addBlankModel}
              disabled={models.length >= MAX_MODELS || isSplitDetected || activeIsMulticolor}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${(models.length >= MAX_MODELS || isSplitDetected || activeIsMulticolor) ? 'opacity-50 cursor-not-allowed bg-gray-400/10 text-gray-400' : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 active:scale-90'}`}
              title="Add model"
            >
              <Plus size={16} strokeWidth={4} />
            </button>
            <button
              type="button"
              onClick={duplicateActiveModel}
              disabled={models.length >= MAX_MODELS || isSplitDetected || activeIsMulticolor}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${(models.length >= MAX_MODELS || isSplitDetected || activeIsMulticolor) ? 'opacity-50 cursor-not-allowed bg-gray-400/10 text-gray-400' : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 active:scale-90'}`}
              title="Duplicate model"
            >
              <Copy size={16} strokeWidth={3} />
            </button>
            <button
              type="button"
              onClick={deleteActiveModel}
              className="w-8 h-8 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-600 flex items-center justify-center active:scale-90 transition-all"
              title="Delete model"
            >
              <Trash2 size={16} strokeWidth={3} />
            </button>
          </div>
        </div>
<div className="relative w-full h-[90px] flex items-center">
  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2 px-1 w-full h-full">
    {buildPlateGroups.map((group, groupIdx) => (
      <React.Fragment key={group.id}>
        {groupIdx > 0 && (
          <div
            className="w-px h-7 flex-shrink-0 bg-[var(--color-primary)]"
            aria-hidden="true"
          />
        )}
        {group.modelData.map((model) => {
          const isActive = activeModelId === model.id;
          const modelQty = Math.max(1, parseInt(model.quantity, 10) || 1);
          const isPlateFull = buildPlateWarningModelIds.has(model.id);
          
          const baseClasses = "relative flex-shrink-0 rounded-[12rem] border-2 transition-all duration-300 flex flex-col items-center justify-center snap-center";
          const activeClasses = "w-[58px] h-[58px] bg-[var(--color-surface)] border-[var(--color-primary)] text-[var(--color-primary)] scale-110 z-10";
          const inactiveClasses = `w-[50px] h-[50px] bg-black/5 dark:bg-white/5 border-gray-400/30 opacity-40 hover:opacity-70 ${isPlateFull ? 'text-amber-500 border-amber-500' : 'text-black dark:text-white'}`;

          return (
            <React.Fragment key={model.id}>
              <button
                type="button"
                onClick={() => { changeModel(model.id); setIsSelectingMaterial(false); setIsSelectingPrinter(false); }}
                className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
              >
                {modelQty > 1 && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 min-w-5 h-5 px-1 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-[14px] font-bold italic leading-none shadow-md">
                    {modelQty}
                  </span>
                )}
                <div className="flex flex-col items-center leading-none gap-0.5">
                  <div className="w-4 flex items-center justify-center">
                    {isModelValid(model) 
                      ? <Check size={15} strokeWidth={4} className="animate-in zoom-in" />
                      : <Box size={15} strokeWidth={3} />}
                  </div>
                  <span className="text-[14px] tracking-tighter font-bold uppercase italic">
                    M{model.no}
                  </span>
                </div>
              </button>
            </React.Fragment>
          );
        })}
      </React.Fragment>
    ))}

  </div>
</div>
      </div>

      <div className="project-printer-selection flex flex-col items-center text-center w-full max-w-2xl mx-auto px-3">
        <div className="flex flex-wrap justify-between items-center w-full mb-2 gap-2">
          <label className="text-[15px] font-bold uppercase flex items-center gap-2 text-[var(--color-primary)]">
            <Printer size={20} strokeWidth={3} /> 3D Printer
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const isCurrentlyManual = !!activeModel?.isManualPrinter;
                setPrepareData(prev => prev.map(m => m.id === activeModelId ? { ...m, isManualPrinter: !isCurrentlyManual } : m));
                setIsSelectingPrinter(false);
                setIsSelectingMaterial(false);
              }}
              className={`text-[13px] font-bold uppercase leading-none p-0 transition-all duration-300 active:scale-95 inline-flex items-center justify-center gap-1.5 ${
                activeModel?.isManualPrinter 
                  ? 'bg-transparent text-amber-600 hover:text-amber-500' 
                  : 'bg-transparent text-blue-600 hover:text-blue-500'
              }`}
              title={activeModel?.isManualPrinter ? 'Switch to auto printer assignment' : 'Switch to manual printer assignment'}
            >
              {activeModel?.isManualPrinter ? <UserRoundCog size={18} strokeWidth={3} /> : <Cpu size={18} strokeWidth={3} />}
              <span className="hidden sm:inline">{activeModel?.isManualPrinter ? 'Switch to Auto' : 'Switch to Manual'}</span>
            </button>
          </div>
        </div>

        <div className="w-full space-y-3">
            <div 
              onClick={() => {
                if (activeModel?.isManualPrinter) {
                  setIsSelectingPrinter(!isSelectingPrinter);
                  setIsSelectingMaterial(false);
                }
              }}
              className={`w-full p-6 rounded-[1.8rem] bg-transparent flex flex-col gap-4 transition-all duration-300 ${
                activeModel?.isManualPrinter 
                  ? 'cursor-pointer hover:border-[var(--color-primary)]/70 hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.99]' 
                  : 'cursor-default'
              } ${isSelectingPrinter ? 'border-[var(--color-primary)] shadow-lg shadow-blue-500/10' : containerBorderStyle}`}
            >
              <div className="flex justify-between items-start w-full gap-4">
                {/* Left Column: Brand, Model, Build Capacity */}
                <div className="flex flex-col text-left min-w-0 flex-1 gap-1">
                  <div className="flex flex-wrap items-baseline gap-2 min-w-0">
                    <span className="text-[14px] font-bold uppercase text-[var(--color-primary)] truncate leading-none">{selectedPrinter?.brand || 'No Printer Assigned'}</span>
                    <span className="text-[14px] font-bold uppercase text-black dark:text-white truncate leading-none">{selectedPrinter?.model || selectedPrinter?.name || '---'}</span>
                  </div>

                  {selectedPrinter ? (
                    <>
                      <span className="text-[14px] font-bold uppercase text-black dark:text-white truncate leading-none">
                        {convertCapacity(selectedPrinter.buildCapacity, activeModel.unit)} {activeModel.unit.toUpperCase()}
                      </span>
                      <span className="text-[14px] font-bold uppercase text-black dark:text-white truncate leading-none">
                        {getPrinterFilamentSlots(selectedPrinter)} Filament {getPrinterFilamentSlots(selectedPrinter) === 1 ? 'Slot' : 'Slots'}
                      </span>
                      <span className="text-[14px] font-bold uppercase text-black dark:text-white truncate leading-none">
                        {compatibleFilamentTypes.length > 0 ? compatibleFilamentTypes.join(' • ') : 'All Filament Types'}
                      </span>
                    </>
                  ) : (
                    <div className="text-[13px] font-bold uppercase tracking-wider text-amber-500 mt-1">
                      Tap to select printer...
                    </div>
                  )}
                </div>

                {/* Right Column: Status (Online/Offline), Assignment Mode (Best Fit/Manual), and tap action label */}
                <div className="flex flex-col items-end gap-0 shrink-0 justify-start">
                  {selectedPrinter && (
                  <span className={`text-[13px] font-bold uppercase px-2 py-1 rounded-lg shrink-0 leading-none ${normalizePrinterStatus(selectedPrinter?.status, selectedPrinter) === 'available' ? 'text-green-600' : normalizePrinterStatus(selectedPrinter?.status, selectedPrinter) === 'maintenance' ? 'text-amber-600' : 'text-red-600'}`}>
                      {normalizePrinterStatus(selectedPrinter?.status, selectedPrinter)}
                    </span>
                  )}

                  {activeModel?.isManualPrinter ? (
                    isSelectingPrinter ? (
                      <span className="text-[13px] font-bold uppercase px-2 py-0.5 rounded-full text-black dark:text-white shrink-0 leading-none">Selected</span>
                    ) : (
                      <span className="text-[13px] font-bold uppercase px-2 py-0.5 rounded-full text-gray-500 shrink-0 leading-none">Tap to Change</span>
                    )
                  ) : (
                    <span className="text-[13px] font-bold uppercase px-2 py-0.5 rounded-full text-blue-600 shrink-0 leading-none">Best Fit</span>
                  )}
                </div>
              </div>
              {isSelectingPrinter && activeModel?.isManualPrinter && (
                <div className="mt-1 border-t border-black/10 dark:border-white/10">
                  {printers.filter((p) => (
                    String(p.id) !== String(activeModel?.printerId)
                    || normalizePrinterStatus(p.status, p) === 'unavailable'
                  )).map((p, index) => {
                    const printerStatus = normalizePrinterStatus(p.status, p);
                    const isUnavailable = printerStatus === 'unavailable';
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={isUnavailable}
                        onClick={(e) => {
                          if (isUnavailable) return;
                          e.stopPropagation();
                          updateModelPrinter(p.id);
                          setIsSelectingPrinter(false);
                          setIsSelectingMaterial(false);
                        }}
                        className={`w-full py-4 flex items-center justify-between gap-4 text-left transition-colors ${
                          index > 0 ? 'border-t border-black/10 dark:border-white/10' : ''
                        } ${isUnavailable ? 'cursor-not-allowed opacity-50' : 'hover:text-[var(--color-primary)]'}`}
                      >
                        <div className="min-w-0 flex flex-col gap-1">
                          <div className="flex flex-wrap items-baseline gap-2 min-w-0">
                            <span className="text-[14px] font-bold uppercase text-[var(--color-primary)] truncate">{p.brand}</span>
                            <span className="text-[14px] font-bold uppercase text-black dark:text-white truncate">{p.model || p.name}</span>
                          </div>
                          <span className="text-[14px] font-bold uppercase text-black dark:text-white truncate">
                            {convertCapacity(p.buildCapacity, activeModel?.unit)} {activeModel?.unit?.toUpperCase()}
                          </span>
                          <span className="text-[14px] font-bold uppercase text-black dark:text-white truncate">
                            {getPrinterFilamentSlots(p)} Filament {getPrinterFilamentSlots(p) === 1 ? 'Slot' : 'Slots'}
                          </span>
                        </div>
                        <span className={`text-[13px] font-bold uppercase px-2.5 py-1 rounded-lg shrink-0 ${
                          printerStatus === 'available' ? 'text-green-600' : printerStatus === 'maintenance' ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {isUnavailable ? 'unavailable · not selectable' : printerStatus}
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
          <div className="flex flex-col items-center mt-6 animate-in fade-in zoom-in duration-300 px-3 w-full max-w-2xl mx-auto">
            <div className="flex flex-wrap justify-between items-center w-full mb-2 gap-2">
              <label className="text-[15px] font-bold uppercase flex items-center gap-2 text-[var(--color-primary)]">
                <VectorSquare size={16} strokeWidth={3} /> Dimensions
              </label>
              <button
                type="button"
                onClick={handleUnitChange}
                className="text-[13px] font-bold uppercase leading-none p-0 transition-all duration-300 active:scale-95 inline-flex items-center justify-center gap-1.5 text-blue-600 hover:text-blue-500"
              >
                <RefreshCw size={16} strokeWidth={3} />
                <span className="hidden sm:inline">Tap to Convert</span>
              </button>
            </div>
            <div className={`bg-transparent rounded-[1.8rem] px-4 py-4 w-full flex items-center gap-1 text-[var(--color-text-main)] ${containerBorderStyle}`}>
              {[{ field: 'length', label: 'L', key: 'l' }, { field: 'width', label: 'W', key: 'w' }, { field: 'height', label: 'H', key: 'h' }].map((item, idx) => {
                const displayValue = activeModel?.[item.field];
                let ghostMM = logicalData[item.key];
                let ghostDisplay = (displayValue === '' && ghostMM > 0) ? (activeModel.unit === 'cm' ? (ghostMM/10).toFixed(1) : activeModel.unit === 'in' ? (ghostMM/25.4).toFixed(2) : ghostMM.toString()) : '';
                return (
                  <React.Fragment key={item.field}>
                    <div className="flex-1 flex flex-col items-center min-w-0 relative">
                      <div className="relative w-full flex items-center justify-center h-[24px]">
                        {displayValue === '' && !ghostDisplay && <div className="absolute opacity-50 pointer-events-none"><Cpu size={18} /></div>}
                        <input ref={(node) => { modelInputRefs.current[`${activeModelId}-${item.field}`] = node; }} type="text" inputMode="decimal" placeholder={ghostDisplay} value={displayValue} onFocus={() => setPrepareData(p=>p.map(m=>m.id===activeModelId?{...m, [item.field]:''}:m))} onChange={(e) => updateModelData(activeModelId, item.field, e.target.value)} className="w-full text-center bg-transparent outline-none text-[15px] font-bold italic" />
                      </div>
                      <span className="text-[14px] font-bold uppercase mt-1 text-[var(--color-primary)]">{item.label}</span>
                    </div>
                    {idx < 2 && <div className="opacity-10 font-bold mb-4 text-xs px-1">|</div>}
                  </React.Fragment>
                );
              })}
              <button onClick={handleUnitChange} className="flex-1 flex flex-col items-center active:scale-90 transition-all">
                <div className="flex items-center text-[var(--color-primary)] font-bold italic text-[15px] uppercase">{activeModel?.unit}</div>
                <span className="text-[14px] font-bold uppercase mt-1 text-[var(--color-primary)]">Unit</span>
              </button>
            </div>
          </div>
        )}

        {!isSelectingPrinter && (
          <>
            <div className={`project-prepare-layout w-full max-w-2xl mx-auto ${activeMaterialSlotsData.length === 1 ? 'has-single-material' : 'has-multiple-materials'}`}>
              <div className="project-prepare-strength flex flex-col items-center px-3">
                <label className="text-[15px] font-bold uppercase mb-2 flex items-center justify-center gap-2 text-[var(--color-primary)]">
                  <Grid3X3 size={20} strokeWidth={2.5} /> Strength
                </label>
                <div className={`w-full h-[68px] bg-transparent rounded-[1.8rem] flex items-stretch justify-center px-1 ${containerBorderStyle}`}>
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <input type="text" inputMode="numeric" placeholder="2" value={activeModel?.walls} onFocus={() => updateModelData(activeModelId, 'walls', '')} onChange={(e) => updateModelData(activeModelId, 'walls', e.target.value)} onBlur={(e) => { const n = parseInt(e.target.value); if (n < 3 || isNaN(n)) updateModelData(activeModelId, 'walls', ''); else if (n > 10) updateModelData(activeModelId, 'walls', '10'); }} className="w-full text-center bg-transparent outline-none text-[15px] font-bold italic text-[var(--color-text-main)] leading-none" />
                    <span className="text-[14px] font-bold uppercase text-[var(--color-primary)] mt-0.5 leading-none">Walls</span>
                  </div>
                  <div className="w-[1px] h-8 bg-gray-400/20 self-center flex-shrink-0" />
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="flex items-center justify-center translate-x-1">
                      <input type="text" inputMode="numeric" placeholder="15" value={activeModel?.infill} onFocus={() => updateModelData(activeModelId, 'infill', '')} onChange={(e) => updateModelData(activeModelId, 'infill', e.target.value)} onBlur={(e) => { const n = parseInt(e.target.value); if (n <= 15 || isNaN(n)) updateModelData(activeModelId, 'infill', ''); else if (n > 99) updateModelData(activeModelId, 'infill', '99'); }} className="w-5 text-center bg-transparent outline-none text-[15px] font-bold italic text-[var(--color-text-main)] leading-none" />
                      <span className="text-[15px] font-bold italic ml-0.5 leading-none self-center">%</span>
                    </div>
                    <span className="text-[14px] font-bold uppercase text-[var(--color-primary)] mt-0.5 leading-none">Infill</span>
                  </div>
                </div>
              </div>

              <div className="project-prepare-material-slots space-y-3 px-3">
                <label className="text-[15px] font-bold uppercase mb-2 flex items-center justify-center gap-2 text-[var(--color-primary)]">
                  <Disc3 size={14} strokeWidth={3} /> Materials
                </label>
                {activeMaterialSlotsData.map((slot, idx) => {
                  const actualIdx = idx;
                  const slotMaterial = getLatestMaterial(slot.materialId);
                  if (isSelectingMaterial && activeMaterialSlot !== actualIdx) return null;
                  return (
                    <div key={`${slot.materialId}-${actualIdx}`} className="relative">
                      <MaterialCard
                        mat={slotMaterial}
                        isUpfront={slotMaterial?.isUpfront}
                        toggleSelect={() => { setActiveMaterialSlot(actualIdx); setIsSelectingPrinter(false); setIsSelectingMaterial(!isSelectingMaterial || activeMaterialSlot !== actualIdx); }}
                        isChanging={isSelectingMaterial && activeMaterialSlot === actualIdx}
                      />
                      {!isSelectingMaterial && activeMaterialSlotsData.length > 1 && (
                        <button type="button" onClick={() => removeMaterialSlot(actualIdx)} className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg">
                          <X size={13} strokeWidth={4} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {!isSelectingMaterial && activeMaterialSlotsData.length < activeMaterialSlotsLimit && (
                <div className="project-prepare-material-actions-row flex gap-2 justify-center pl-0">
                  <button type="button" onClick={addMaterialSlot} disabled={!canAddMaterialToActiveModel} className={`w-full min-h-[48px] rounded-[1.8rem] border-[1.5px] border-dashed flex items-center justify-center gap-2 py-2 transition-all ${canAddMaterialToActiveModel ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-transparent' : 'border-gray-400/30 text-gray-400 bg-transparent opacity-50 cursor-not-allowed'}`}>
                    {canAddMaterialToActiveModel ? <Plus size={18} strokeWidth={3} /> : <Lock size={18} strokeWidth={3} />}
                    <span className="whitespace-nowrap text-[13px] font-bold uppercase leading-tight tracking-tight">{canAddMaterialToActiveModel ? 'Add Material' : 'Mono-Material'}</span>
                  </button>
                </div>
              )}
            </div>

            {logicalData.l > 0 && (
              <div className="space-y-6 animate-in fade-in zoom-in duration-300 px-3 mt-3 w-full max-w-2xl mx-auto">
                <div className="grid grid-cols-2 gap-2">
                  {logicalData.parts > 1 && <div className={`${cardBase} ${logicalData.parts >= 10 ? cardError : cardNormal}`}>
                    <div className={`flex items-center gap-1.5 mb-1 ${logicalData.parts >= 10 ? 'text-red-500' : 'text-[var(--color-primary)]'}`}><Scissors size={18} strokeWidth={3} /><span className="text-[15px] font-bold italic">{logicalData.parts}</span></div>
                    <span className="text-[14px] font-bold uppercase">Parts</span>
                  </div>}
                  {logicalData.parts > 1 && <div className={`${cardBase} ${cardNormal}`}>
                    <div className="flex items-center gap-1.5 mb-1 text-[var(--color-primary)]"><Box size={18} strokeWidth={3} /><span className="text-[15px] font-bold italic">{[convertLength(logicalData.part.l), convertLength(logicalData.part.w), convertLength(logicalData.part.h)].map(v => Number(v.toFixed(1))).join("×")}</span></div>
                    <span className="text-[14px] font-bold uppercase">Part Size ({activeModel.unit})</span>
                  </div>}
                  {isAdmin && (
                    <div className={`${cardBase} ${activeEstimatedWeight >= 10000 || currentMaterial?.isInsufficient ? cardError : cardNormal}`}>
                      <div className={`flex items-center gap-1.5 mb-1 ${activeEstimatedWeight >= 10000 || currentMaterial?.isInsufficient ? 'text-red-500' : 'text-[var(--color-primary)]'}`}><Scale size={18} strokeWidth={3} /><span className="text-[15px] font-bold italic">{logicalData.parts > 1 ? logicalData.part.weight : activeEstimatedWeight}g</span></div>
                      <span className="text-[14px] font-bold uppercase">{logicalData.parts > 1 ? 'Weight / Part' : (activeMulticolorUsage.purgeWeight > 0 ? `Weight + Purge ×${activeQuantity}` : (activeQuantity > 1 ? `Weight ×${activeQuantity}` : 'Weight'))}</span>
                    </div>
                  )}
                  {isAdmin && (
                    <div className={`${cardBase} ${Math.round((logicalData.parts > 1 ? logicalData.part.hours : activeEstimatedHours) * 60) >= 10000 ? cardError : cardNormal}`}>
                      <div className={`flex items-center gap-1.5 mb-1 ${Math.round((logicalData.parts > 1 ? logicalData.part.hours : activeEstimatedHours) * 60) >= 10000 ? 'text-red-500' : 'text-[var(--color-primary)]'}`}><Clock size={18} strokeWidth={3} /><span className="text-[15px] font-bold italic">{[timeBreakdown.days && `${timeBreakdown.days}d`, timeBreakdown.hours && `${timeBreakdown.hours}h`, timeBreakdown.mins && `${timeBreakdown.mins}m`, `${timeBreakdown.secs}s`].filter(Boolean).join(" ")}</span></div>
                      <span className="text-[14px] font-bold uppercase">{logicalData.parts > 1 ? 'Time / Part' : (activeMulticolorUsage.swaps > 0 ? `${activeMulticolorUsage.swaps} swaps` : (activeQuantity > 1 ? `Duration ×${activeQuantity}` : 'Duration'))}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {!isSelectingPrinter && isSelectingMaterial && (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300 pb-10 px-3 w-full max-w-2xl mx-auto">
            {(allFilaments || []).length >= 10 && (
              <div className="px-1">
                <div className="relative group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-main)] opacity-20 group-focus-within:opacity-100 group-focus-within:text-blue-500 transition-all" size={16} />
                  <input
                    value={matSearchQuery}
                    onChange={e => setMatSearchQuery(e.target.value)}
                    placeholder="Search colors..."
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl pl-11 pr-4 py-3 text-[11px] font-bold uppercase tracking-widest outline-none focus:border-blue-500/50 transition-all"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              {sortedMaterials.length > 0 ? (
                sortedMaterials.map(mat => (
                  <MaterialCard
                    key={mat.id}
                    mat={mat}
                    isChangingOption={true}
                    isSelected={String(mat.id) === String(currentMaterialId)}
                    activeMaterialId={String(currentMaterialId)}
                    onSelect={(id) => { updateModelData(activeModelId, 'materialId', id); setIsSelectingMaterial(false); setMatSearchQuery(''); }}
                    isUpfront={mat.isUpfront}
                  />
                ))
              ) : (
                <div className="col-span-2 py-10 text-center opacity-30">
                  <p className="text-[10px] font-bold uppercase tracking-widest">No matching filaments</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- STICKY CONFIRM BUTTON --- */}
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
              onClick={() => { 
                 if (isTripleLimitHit) return;
                 if (!isActiveModelValid) {
                   focusFirstMissingModelInput();
                   return;
                 }
                if (nextIncompleteModel) {
                  setInternalActiveId(nextIncompleteModel.id); 
                } else {
                  const buildPlateNumberByJobId = new Map();
                  let nextBuildPlateNo = 1;
                  const reserveBuildPlateNo = (jobId) => {
                    const key = String(jobId);
                    if (!buildPlateNumberByJobId.has(key)) {
                      buildPlateNumberByJobId.set(key, nextBuildPlateNo);
                      nextBuildPlateNo += 1;
                    }
                    return buildPlateNumberByJobId.get(key);
                  };
                  const projectSummary = models.map(m => { 
                    const d = getLogicalDims(m); 
                    const requestedQuantity = Math.max(1, parseInt(m.quantity, 10) || 1);
                    const quantity = d.parts > 1 ? requestedQuantity : getModelQuantity(m);
                    const multicolorUsage = getMulticolorUsage(m);
                    const filaments = allFilaments || [];
                    const buildPlate = buildPlateGroups.find(group => group.models.includes(m.id));
                    const plateModels = buildPlate?.modelData || [m];
                    const plateEstimate = buildPlate?.estimate || getBuildPlateEstimate(plateModels);
                    const platePurgeWeight = plateModels.reduce((sum, model) => sum + getMulticolorUsage(model).purgeWeight, 0);
                    const plateSwapMins = plateModels.reduce((sum, model) => sum + getMulticolorUsage(model).swapMins, 0);
                    const baseWeight = Number(Math.max(0, plateEstimate.weight - platePurgeWeight).toFixed(1));
                    const totalWeight = Number(plateEstimate.weight.toFixed(1));
                    const baseTime = Math.max(0, plateEstimate.time - Math.round(plateSwapMins));
                    const totalTime = plateEstimate.time;
                    const weightedSlots = getWeightedMaterialSlots(m, totalWeight);
                    const primaryMaterialId = weightedSlots[0]?.materialId || m.materialId;
                    const mat = filaments.find(f => String(f.id) === String(primaryMaterialId));
                    const stock = parseFloat(mat?.remaining || 0);
                    const isUpfrontType = mat?.status?.toLowerCase() === 'upfront';
                    const printer = printers.find(p => String(p.id) === String(m.printerId));
                    const usesFeeder = getCompatibleFeeders(printer).length > 0 && weightedSlots.length > 1 && m.useCfs !== false;
                    const materials = weightedSlots.map((slot) => {
                      const material = filaments.find(f => String(f.id) === String(slot.materialId));
                      const materialStock = Number(material?.remaining || 0);
                      return {
                        materialId: slot.materialId,
                        shareWeight: slot.weight,
                        swapPercent: slot.percent,
                        material: material ? {
                          ...material,
                          id: material.id,
                          remaining: materialStock,
                          price: Number(material.price || 0),
                          weight: Number(material.weight || 0),
                          loadTime: Number(material.loadTime || 0),
                          purgeTime: Number(material.purgeTime || material.cleanBuffer || 0),
                          cleanBuffer: Number(material.cleanBuffer || material.purgeTime || 0),
                          isUpfront: material.status?.toLowerCase() === 'upfront' || slot.weight > materialStock || materialStock <= 0
                        } : null
                      };
                    });
                    const materialWeights = weightedSlots.reduce((acc, slot) => {
                      acc[slot.materialId] = Number(((acc[slot.materialId] || 0) + slot.weight).toFixed(2));
                      return acc;
                    }, {});
                    const swapPercent = weightedSlots.length > 1
                      ? Math.max(...weightedSlots.map(slot => Number(slot.percent || 0)))
                      : 0;
                    const isMulticolorPrint = weightedSlots.length > 1;
                    const physicalParts = Math.max(1, d.parts * quantity);
                    const partsPerBuildPlate = d.parts > 1
                      ? (isMulticolorPrint ? 1 : getBuildPlatePartCapacity(m))
                      : 1;
                    const buildPlateCount = d.parts > 1 ? Math.ceil(physicalParts / partsPerBuildPlate) : 1;
                    const partMulticolorUsage = (() => {
                      if (!isMulticolorPrint) return { swaps: 0, swapMins: 0, purgeWeight: 0 };
                      const printerForPart = printers.find(p => String(p.id) === String(m.printerId)) || activePrinter;
                      const layers = Math.ceil((d.part?.h || d.h || 0) / DEFAULT_LAYER_HEIGHT_MM);
                      const swaps = layers * (weightedSlots.length - 1);
                      const swapMins = swaps * getCfsSwapRate(printerForPart);
                      const purgeWeight = swaps * getPurgeWeightPerSwap(printerForPart);
                      return { swaps, swapMins, purgeWeight: Number(purgeWeight.toFixed(2)) };
                    })();
                    const productionJobs = d.parts > 1
                      ? Array.from({ length: buildPlateCount }, (_, plateIdx) => {
                        const partCount = Math.min(partsPerBuildPlate, physicalParts - (plateIdx * partsPerBuildPlate));
                        const partBatch = emulateSlicer(d.part.l, d.part.w, d.part.h, m.walls, m.infill, partCount);
                        const jobPurgeWeight = partMulticolorUsage.purgeWeight * partCount;
                        const jobSwapMins = partMulticolorUsage.swapMins * partCount;
                        const jobWeight = Number(((d.part.weight * partCount) + jobPurgeWeight).toFixed(1));
                        const jobBaseTime = Math.round((partBatch.printTime + partBatch.setupTime) * 60);
                        const jobTime = jobBaseTime + Math.round(jobSwapMins);
                        const jobWeightedSlots = getWeightedMaterialSlots(m, jobWeight);
                        const jobMaterialWeights = jobWeightedSlots.reduce((acc, slot) => {
                          acc[slot.materialId] = Number(((acc[slot.materialId] || 0) + slot.weight).toFixed(2));
                          return acc;
                        }, {});
                        const jobId = `${buildPlate?.id || `bp-${m.id}`}-part-${plateIdx + 1}`;
                        const no = reserveBuildPlateNo(jobId);
                        return {
                          id: jobId,
                          parentId: m.id,
                          parentIds: [m.id],
                          no,
                          buildPlateNo: no,
                          buildPlateKey: buildPlate?.materialKey || getModelMaterialKey(m),
                          buildPlateGapMm: 3,
                          partsOnPlate: partCount,
                          totalParts: physicalParts,
                          printerId: m.printerId,
                          printerName: [printer?.brand, printer?.model || printer?.name].filter(Boolean).join(' '),
                          usesCfs: usesFeeder,
                          weight: jobWeight,
                          time: jobBaseTime,
                          estimatedTime: jobTime,
                          colorSwaps: partMulticolorUsage.swaps * partCount,
                          estimatedColorSwaps: partMulticolorUsage.swaps * partCount,
                          swapMins: jobSwapMins,
                          materialIds: jobWeightedSlots.map(slot => slot.materialId),
                          materialWeights: jobMaterialWeights
                        };
                      })
                      : [{
                        id: `${buildPlate?.id || `bp-${m.id}`}-print`,
                        parentId: m.id,
                        parentIds: buildPlate?.models || [m.id],
                        no: reserveBuildPlateNo(`${buildPlate?.id || `bp-${m.id}`}-print`),
                        buildPlateNo: reserveBuildPlateNo(`${buildPlate?.id || `bp-${m.id}`}-print`),
                        buildPlateKey: buildPlate?.materialKey || getModelMaterialKey(m),
                        buildPlateGapMm: 3,
                        partsOnPlate: physicalParts,
                        totalParts: physicalParts,
                        printerId: m.printerId,
                        printerName: [printer?.brand, printer?.model || printer?.name].filter(Boolean).join(' '),
                        usesCfs: usesFeeder,
                        weight: totalWeight,
                        time: usesFeeder ? baseTime : totalTime,
                        estimatedTime: totalTime,
                        colorSwaps: multicolorUsage.swaps,
                        estimatedColorSwaps: multicolorUsage.swaps,
                        swapMins: multicolorUsage.swapMins,
                        materialIds: weightedSlots.map(slot => slot.materialId),
                        materialWeights
                      }];

                    return {
                      id: m.id, no: m.no,
                      quantity,
                      config: { 
                        walls: m.walls !== '' ? Number(m.walls) : 2, 
                        infill: m.infill !== '' ? Number(m.infill) : 15, 
                        length: m.length !== '' ? Number(m.length) : d.l, 
                        width: m.width !== '' ? Number(m.width) : d.w, 
                        height: m.height !== '' ? Number(m.height) : d.h, 
                        unit: m.unit || 'mm', 
                        quantity,
                        duplicateLimit: getBuildPlateDuplicateLimit(m),
                        buildPlateNo: buildPlate?.no || 1,
                        buildPlateGapMm: 3
                      },
                      volume: { total: { weight: totalWeight, time: totalTime }, parts: d.parts * quantity, part: { l: d.part.l, w: d.part.w, h: d.part.h, weight: d.part.weight, time: Math.round(d.part.hours * 60), breakdown: { days: Math.floor(totalTime / 1440), hours: Math.floor((totalTime % 1440) / 60), mins: totalTime % 60, secs: 0 } } },
                      sliced: { filamentChangePercent: swapPercent, colorSwaps: multicolorUsage.swaps, estimatedColorSwaps: multicolorUsage.swaps, swapMins: multicolorUsage.swapMins, purgeWeight: multicolorUsage.purgeWeight, baseWeight, baseTime },
                      printerId: m.printerId,
                      useCfs: usesFeeder,
                      buildPlate: {
                        no: buildPlate?.no || 1,
                        id: buildPlate?.id || `bp-${m.id}`,
                        key: buildPlate?.materialKey || getModelMaterialKey(m),
                        materialIds: buildPlate?.materialIds || weightedSlots.map(slot => slot.materialId),
                        modelIds: buildPlate?.models || [m.id],
                        gapMm: 3,
                        rule: 'same-material'
                      },
                      productionJobs,
                      material: {
                        materialId: primaryMaterialId,
                        material: mat ? {
                          ...mat,
                          id: mat.id,
                          remaining: Number(mat.remaining || 0),
                          price: Number(mat.price || 0),
                          weight: Number(mat.weight || 0),
                          loadTime: Number(mat.loadTime || 0),
                          purgeTime: Number(mat.purgeTime || mat.cleanBuffer || 0),
                          cleanBuffer: Number(mat.cleanBuffer || mat.purgeTime || 0),
                          isUpfront: isUpfrontType || stock <= 0 || totalWeight > stock
                        } : null
                      },
                      materials,
                      file: {}
                    };
                  });
                  onConfirm(projectSummary); 
                }
              }} 
               disabled={isTripleLimitHit || !activeModel?.id}
              className="flex-1 h-14 rounded-[2.2rem] font-bold italic uppercase tracking-[0.2em] text-[14px] flex items-center justify-center gap-4 transition-all duration-500 active:scale-95 group bg-[var(--color-primary)] text-white shadow-xl shadow-[var(--color-primary)]/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {!isActiveModelValid ? (<>ENTER DETAILS <Box size={14} /></>) : isEverythingValid ? (<>CONFIRM DETAILS <div className="p-1 rounded-full bg-white/20 group-hover:translate-x-1 transition-transform"><svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="4" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></div></>) : (<>NEXT MODEL <Box size={14} /></>)}
            </button>
          </div>
        </div>
    </div>
  );
}
