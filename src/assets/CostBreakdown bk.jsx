import React, { useState, useMemo, useEffect } from 'react';
import {
  Coins, User, Zap, PlusCircle, Box,
  ChevronUp, Info, TrendingUp, Wallet
} from 'lucide-react';
import { useStore } from '../../store/useStore';

const DEFAULT_SPOOL_WEIGHT = 1000;

const formatCurrency = (value) => Number(value || 0).toFixed(2);
const formatMinutes = (value) => {
  const total = Math.round(Number(value) || 0);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};
const formatWeight = (value) => `${Number(value || 0).toFixed(2)}g`;

const getProjectItemLabel = (projectCase, item) => {
  const is3MF = String(projectCase || '').toUpperCase() === '3MF';
  const prefix = is3MF ? 'Build Plate' : 'Model';
  return `${prefix} ${item?.no || (item?.index + 1) || 1}`;
};

const getItemWeight = (item) => parseFloat(item?.weight || item?.sliced?.weight || item?.volume?.total?.weight || 0);
const getItemTime = (item) => parseFloat(item?.time || item?.sliced?.time || item?.volume?.total?.time || 0);

const getItemMaterial = (item) => {
  const nested = item?.material?.material || item?.material || item?.selectedMaterial || item?.filament;
  if (!nested) return null;
  return {
    ...nested,
    id: nested.id ?? item?.material?.materialId ?? item?.materialId ?? 'unknown',
    remaining: parseFloat(nested.remaining || 0),
    price: parseFloat(nested.price || 0),
    weight: parseFloat(nested.weight || DEFAULT_SPOOL_WEIGHT),
    loadTime: parseFloat(nested.loadTime || 0),
    purgeTime: parseFloat(nested.purgeTime || nested.cleanBuffer || 0),
    status: nested.status || 'stock'
  };
};

const getMaterialLabel = (material) => {
  if (material?.name) return material.name;
  return [material?.brand, material?.type, material?.colorName]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Unknown Material';
};

const CostItem = ({ icon, label, value, colorClass, details }) => {
  const [showFormula, setShowFormula] = useState(false);
  const textColor = colorClass.split(' ').find((c) => c.startsWith('text-')) || 'text-blue-600';
  const Icon = icon;
  return (
    <div className="border-b border-[var(--color-border)] py-5 transition-all space-y-3 px-2">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-2xl ${colorClass} bg-opacity-10`}>
            <Icon size={24} className={textColor} />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest opacity-30 block mb-0.5 italic">Component</span>
            <span className="text-[15px] font-black uppercase tracking-tight">{label}</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-30 block mb-0.5 italic">Subtotal</span>
          <span className={`text-[20px] font-black italic ${textColor} tracking-tighter`}>₱{value}</span>
        </div>
      </div>
      <button onClick={() => setShowFormula(!showFormula)} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-30 hover:opacity-100 transition-all ml-[60px]">
        {showFormula ? <ChevronUp size={12} strokeWidth={4} /> : <Info size={12} strokeWidth={4} />}
        {showFormula ? 'Hide Details' : 'Show Breakdown'}
      </button>
      {showFormula && details && (
        <div className="ml-[60px] bg-[var(--color-bg)]/30 rounded-[1.5rem] p-5 border border-dashed border-[var(--color-border)] animate-in slide-in-from-top-2 duration-300 space-y-4">
          {details.map((section, idx) => (section.items?.length > 0 && (
            <div key={idx} className="space-y-2">
              {section.title && <div className="text-[9px] font-black text-blue-600 opacity-60 uppercase tracking-[0.2em] border-b border-[var(--color-border)] pb-1 mb-2">{section.title}</div>}
              {section.items.map((item, sIdx) => (
                <div key={sIdx} className="flex justify-between items-start text-[11px] font-bold uppercase tracking-tight gap-3">
                  <div className="flex flex-col max-w-[70%] text-[var(--color-text-main)] opacity-70">
                    <span>{item.label}</span>
                    {item.sub && <span className="text-[9px] opacity-50 lowercase italic leading-snug mt-1">{item.sub}</span>}
                  </div>
                  <span className={`font-black whitespace-nowrap ${item.isProfit ? 'text-emerald-500' : 'text-[var(--color-text-main)]'}`}>{item.calc}</span>
                </div>
              ))}
            </div>
          )))}
        </div>
      )}
    </div>
  );
};

export default function CostBreakdown({ 
  data, 
  activePrinter, 
  dbSettings, 
  onCalculate,
  isInventoryMode = false
}) {
  const storeRates = useStore((state) => state.rates);
  const filamentInventory = useStore((state) => state.filamentInventory);
  const printers = useStore((state) => state.printers);

  const calculations = useMemo(() => {
    const sourceItems = Array.isArray(data?.projectDetails) ? data.projectDetails : [];
    if (sourceItems.length === 0 || !storeRates || Object.keys(storeRates).length === 0) return null;

    const items = sourceItems.map((item, index) => {
      const baseMaterial = getItemMaterial(item);
      const inventoryMatch = (filamentInventory || []).find((f) => String(f.id) === String(baseMaterial?.id));
      const material = baseMaterial ? { ...baseMaterial, ...(inventoryMatch || {}) } : null;
      const normalizedMaterials = (Array.isArray(item.materials) && item.materials.length > 0 ? item.materials : [{ materialId: material?.id, material }])
        .map((entry) => {
          const entryMaterial = entry?.material || entry;
          const inventory = (filamentInventory || []).find((f) => String(f.id) === String(entryMaterial?.id || entry?.materialId));
          const merged = entryMaterial ? { ...entryMaterial, ...(inventory || {}) } : null;
          if (!merged) return null;
          return {
            ...merged,
            id: merged.id ?? entry?.materialId,
            materialId: entry?.materialId ?? merged.id,
            shareWeight: Number(entry?.shareWeight || 0),
            remaining: parseFloat(merged.remaining || 0),
            price: parseFloat(merged.price || 0),
            weight: parseFloat(merged.weight || DEFAULT_SPOOL_WEIGHT),
            loadTime: parseFloat(merged.loadTime || 0),
            purgeTime: parseFloat(merged.purgeTime || merged.cleanBuffer || 0),
            status: merged.status || 'stock'
          };
        })
        .filter(Boolean);
      return {
        ...item,
        index,
        itemName: getProjectItemLabel(data?.method?.name, { ...item, index }),
        normalizedWeight: getItemWeight(item),
        normalizedTime: getItemTime(item),
        normalizedMaterial: material,
        normalizedMaterials
      };
    });

    const validItems = items.flatMap((item) => {
      if (!Array.isArray(item.productionJobs) || item.productionJobs.length === 0) return [item];
      return item.productionJobs.map((job, jobIndex) => {
        const printer = job.printer || (printers || []).find((p) => String(p.id) === String(job.printerId)) || activePrinter;
        return {
          ...item,
          id: job.id,
          parentId: item.id,
          jobIndex,
          itemName: `${item.itemName} Part ${job.no || jobIndex + 1}`,
          normalizedWeight: Number(job.weight || 0),
          normalizedTime: Number(job.time || 0),
          printerId: job.printerId,
          printer,
          printerName: job.printerName || [printer?.brand, printer?.model || printer?.name].filter(Boolean).join(' '),
          usesCfs: job.usesCfs === true,
          materialWeights: job.materialWeights || null,
          normalizedMaterial: item.normalizedMaterial,
          normalizedMaterials: item.normalizedMaterials
        };
      });
    }).filter(i => i.normalizedMaterial || i.normalizedMaterials?.length);
    if (validItems.length === 0) return null;

    const matRates = storeRates['material-cost'] || {};
    const laborRates = storeRates['labor-cost'] || {};
    const printRates = storeRates['print-cost'] || {};
    const elecRates = storeRates['electricity-cost'] || {};
    const maintRates = storeRates['maintenance-cost'] || {};
    const extraRates = storeRates['extra-cost'] || {};

    // Safely extract fees with fallbacks
    const handlingFee = Number(extraRates.handlingFee ?? laborRates.handlingFee ?? 0);
    
    console.log('CostBreakdown: Loaded Fees:', { handlingFee });

    const markupPercent = (parseFloat(printRates.markupRate) || 20);
    const markupMultiplier = 1 + (markupPercent / 100);
    const filamentClientShare = (parseFloat(matRates.clientShareRate) || 0) / 100;
    const extraClientShare = (parseFloat(extraRates.clientShareRate) || 0) / 100;
    const baseElecRate = parseFloat(elecRates.electricityRate) || 14.16;
    const finalElecRate = baseElecRate * (1 + ((parseFloat(elecRates.expectedIncrease) || 0) / 100));

    const admin = (useStore.getState().adminsList || [])[0];
    const garageInfo = useStore.getState().garageInfo;
    const globalHandlingFee = Number(admin?.paymentSettings?.handlingFee ?? garageInfo?.checkoutSettings?.paymentSettings?.handlingFee ?? 0);

    const currentRates = {
      elecRate: finalElecRate,
      laborRate: parseFloat(laborRates.laborRate) || 120,
      installationCost: parseFloat(laborRates.installationCost) || 2,
      filamentHandlingCost: parseFloat(laborRates.filamentHandlingCost) || 5,
      multicolorPenalty: parseFloat(laborRates.multicolorPenalty) || 0,
      monitoringRate: parseFloat(laborRates.monitoringRate) || 100,
      dailyPrintLimit: parseFloat(laborRates.dailyPrintLimit) || 10,
      maintRate: parseFloat(maintRates.maintenanceRate) || 5,
      maintFixed: isInventoryMode ? 0 : (parseFloat(maintRates.estimationCost) || 0),
      mSolderRate: parseFloat(maintRates.mSolderRate) || 2,
      handlingFee: globalHandlingFee,
      ironPower: parseFloat(elecRates.solderingIronPower) || 60,
      prepFee: parseFloat(laborRates.preparationRatePerFile) || 10,
      supportFee: parseFloat(laborRates.supportRemovalRatePerModel) || 5,
      printStartTime: parseFloat(laborRates.printStartTime) || 9,
      ...(dbSettings || {})
    };

    const materialUsageRows = validItems.flatMap((item) => {
      const mats = item.normalizedMaterials?.length ? item.normalizedMaterials : [item.normalizedMaterial].filter(Boolean);
      const explicitWeights = item.materialWeights || {};
      const fallbackWeight = item.normalizedWeight / Math.max(1, mats.length);
      return mats.map((mat) => ({
        item,
        material: mat,
        weight: Number(explicitWeights[String(mat.materialId || mat.id)] ?? explicitWeights[String(mat.id)] ?? fallbackWeight)
      }));
    }).filter((row) => row.material && row.weight > 0);

    const filamentGroups = materialUsageRows.reduce((acc, row) => {
      const key = String(row.material.materialId || row.material.id);
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    const filamentSummary = Object.entries(filamentGroups).map(([id, group]) => {
      const mat = group[0].material;
      const spoolWeight = parseFloat(mat.weight || DEFAULT_SPOOL_WEIGHT);
      const pricePerGram = spoolWeight > 0 ? (parseFloat(mat.price) || 0) / spoolWeight : 0;
      const totalWeight = group.reduce((sum, row) => sum + row.weight, 0);
      const isUpfront = isInventoryMode ? false : String(mat.status || '').toLowerCase() === 'upfront';
      const shortfall = isInventoryMode ? 0 : (isUpfront ? totalWeight : Math.max(0, totalWeight - (parseFloat(mat.remaining) || 0)));
      const spoolsNeeded = shortfall > 0 ? Math.ceil(shortfall / spoolWeight) : 0;
      const excessWeight = Math.max(0, (spoolsNeeded * spoolWeight) - shortfall);
      const excessCharge = isInventoryMode ? 0 : (excessWeight * pricePerGram * filamentClientShare);
      const usageCost = totalWeight * pricePerGram;
      return {
        id, material: mat, name: getMaterialLabel(mat), spoolWeight, totalWeightUsed: totalWeight,
        pricePerGram, spoolsNeeded, excessWeight, excessCharge, usageCost,
        totalCost: usageCost + excessCharge, finalCost: (usageCost * markupMultiplier) + excessCharge
      };
    });

    let extrasRawSum = 0, extrasBaseSum = 0, extrasExcessSum = 0, totalHardwareMins = 0, totalHardwareQty = 0, heatsetMins = 0;
    const extrasBreakdown = [], extrasSummaryMap = {};
    const activeExtras = Array.isArray(data?.extras) ? data.extras.filter(e => e?.assignments && Object.keys(e.assignments).length > 0) : [];

    activeExtras.forEach((extra) => {
      const entries = Object.entries(extra.assignments || {}).filter(([, q]) => Number(q) > 0);
      const totalQty = entries.reduce((s, [, q]) => s + Number(q), 0);
      if (totalQty <= 0) return;
      const type = (extra.name || '').toLowerCase().includes('magnet') ? 'magnets' : ((extra.name || '').toLowerCase().includes('heatset') ? 'heatsets' : null);
      entries.forEach(([k, q]) => {
        if (!extrasSummaryMap[k]) extrasSummaryMap[k] = { magnets: 0, heatsets: 0 };
        if (type) extrasSummaryMap[k][type] += Number(q);
      });
      const pack = Number(extra.pack) || 1;
      const pricePerPiece = pack > 0 ? (parseFloat(extra.price) || 0) / pack : (parseFloat(extra.price) || 0);
      const isUpfront = isInventoryMode ? false : String(extra.status || '').toLowerCase() === 'upfront';
      const baseCost = totalQty * pricePerPiece;
      let excessUnits = 0, purchasedPacks = 0, excessShare = 0;
      if (isInventoryMode) {
        purchasedPacks = 0;
        excessUnits = 0;
      } else if (isUpfront) {
        purchasedPacks = Math.ceil(totalQty / pack);
        excessUnits = Math.max(0, (purchasedPacks * pack) - totalQty);
      } else {
        const stock = parseFloat(extra.qty) || 0;
        if (totalQty > stock) {
          purchasedPacks = Math.ceil((totalQty - stock) / pack);
          excessUnits = Math.max(0, (stock + (purchasedPacks * pack)) - totalQty);
        }
      }
      excessShare = isInventoryMode ? 0 : (excessUnits * pricePerPiece * extraClientShare);
      extrasRawSum += (baseCost + excessShare);
      extrasBaseSum += baseCost;
      extrasExcessSum += excessShare;
      extrasBreakdown.push({
        label: extra.name,
        sub: `${totalQty} pc(s) assigned • ${purchasedPacks > 0 ? `${purchasedPacks} packs` : 'stock'}`,
        calc: `₱${formatCurrency((baseCost * markupMultiplier) + excessShare)}`
      });
      const mSet = parseFloat(extraRates.magnetSetupRate) || 0, mPlc = parseFloat(extraRates.magnetPlacementRate) || 0;
      const hSet = parseFloat(extraRates.heatsetSetupRate) || 0, hPlc = parseFloat(extraRates.heatsetPlacementRate) || 0;
      if (type === 'magnets') { totalHardwareMins += (entries.length * mSet) + (totalQty * mPlc); totalHardwareQty += totalQty; }
      else if (type === 'heatsets') { const mins = hSet + (totalQty * hPlc); totalHardwareMins += mins; totalHardwareQty += totalQty; heatsetMins += mins; }
    });

    const sessionLimitMins = currentRates.dailyPrintLimit * 60;
    const printStartMins = Math.round(currentRates.printStartTime * 60);
    const MINUTES_PER_DAY = 1440;
    const productionSchedule = [];
    let overnightIdleMins = 0;
    let totalStartupTime = 0;
    let filamentHandlingEvents = 0;

    const getJobPrinter = (item) => item.printer || (printers || []).find((p) => String(p.id) === String(item.printerId)) || activePrinter || {};
    const getPrinterKey = (printer) => String(printer?.id || printer?.model || printer?.name || 'default');
    const getPrinterLabel = (printer) => [printer?.brand, printer?.model || printer?.name].filter(Boolean).join(' ') || 'Printer';
    const getBootupTime = (printer) => (parseFloat(printer?.bootupMins) || 0) + (parseFloat(printer?.homingMins) || 0);
    const getBedLevelTime = (printer) => parseFloat(printer?.bedLevelMins ?? printer?.bootLevelMins) || 0;
    const is3MF = String(data?.method?.name || '').toUpperCase() === '3MF';
    const getCfsSwapRate = (printer) => {
      const configured = Number(printer?.cfs?.swapTime ?? printer?.swapTime ?? 0);
      return configured > 0 ? configured : currentRates.multicolorPenalty;
    };
    const getCfsSwapMins = (item) => {
      if (item.usesCfs !== true) return 0;
      if (is3MF) {
        return (Number(item.sliced?.colorSwaps) || 0) * getCfsSwapRate(getJobPrinter(item));
      }
      const percent = Number(item.sliced?.filamentChangePercent ?? item.sliced?.colorSwaps ?? 0);
      return item.normalizedTime * (Math.max(0, percent) / 100);
    };

    const printerStates = {};
    const getPrinterState = (printer) => {
      const key = getPrinterKey(printer);
      if (!printerStates[key]) {
        printerStates[key] = { key, printer, currentTime: printStartMins, initializedDays: new Set(), overnightIdleMins: 0 };
      }
      return printerStates[key];
    };

    const getDayBucket = (dayNum, fil, printer) => {
      const printerKey = getPrinterKey(printer);
      let b = productionSchedule.find(e => e.day === dayNum && e.printerKey === printerKey);
      if (!b) {
        b = {
          day: dayNum,
          printerKey,
          printerName: getPrinterLabel(printer),
          totalMins: 0,
          gapMins: 0,
          limitMins: sessionLimitMins,
          setupMins: 0,
          installMins: 0,
          printMins: 0,
          filament: fil,
          plates: []
        };
        productionSchedule.push(b);
      }
      return b;
    };

    const advanceTime = (t) => {
      const dStart = Math.floor(t / MINUTES_PER_DAY) * MINUTES_PER_DAY + printStartMins;
      if (t <= dStart + sessionLimitMins + 120 && t >= dStart) return t;
      let next = dStart;
      while (next <= t) next += MINUTES_PER_DAY;
      return next;
    };

    const injectTask = (state, id, name, time, fil, type = 'manual', skipInit = false) => {
      if (time <= 0) return;
      const start = advanceTime(state.currentTime);
      if (start > state.currentTime) {
        state.overnightIdleMins += (start - state.currentTime);
        overnightIdleMins += (start - state.currentTime);
        state.currentTime = start;
      }
      const dNum = Math.floor(state.currentTime / MINUTES_PER_DAY) + 1;
      let init = (!skipInit && !state.initializedDays.has(dNum)) ? (getBootupTime(state.printer) + getBedLevelTime(state.printer)) : 0;
      if (init > 0) {
        state.initializedDays.add(dNum);
        totalStartupTime += init;
      }
      const b = getDayBucket(dNum, fil, state.printer);
      const rounded = Math.round(time + init);
      b.totalMins += rounded;
      if (type === 'manual') b.setupMins += rounded; else b.printMins += rounded;
      b.plates.push({ id, name, time: rounded, scheduledMins: rounded, printMins: type === 'print' ? time : 0, setupMins: rounded - (type === 'print' ? time : 0), installMins: 0, postPrintHeatsetMins: 0, filament: fil, printerName: getPrinterLabel(state.printer), magnets: 0, heatsets: 0, startDay: dNum, endDay: Math.floor((state.currentTime + rounded - 0.1) / MINUTES_PER_DAY) + 1 });
      state.currentTime += rounded;
    };

    const backgroundPrepTime = validItems.length * 5; 
    const backgroundSupportTime = validItems.length * 2;
    const defaultState = getPrinterState(activePrinter || getJobPrinter(validItems[0]));
    injectTask(defaultState, 'batch-prep', 'Batch Preparation & Setup', backgroundPrepTime + backgroundSupportTime, 'Manual Work', 'manual', true);

    const byPrinter = validItems.reduce((acc, item) => {
      const printer = getJobPrinter(item);
      const key = getPrinterKey(printer);
      if (!acc[key]) acc[key] = { printer, items: [] };
      acc[key].items.push(item);
      return acc;
    }, {});

    Object.values(byPrinter).forEach(({ printer, items: printerItems }) => {
      const state = getPrinterState(printer);
      const cfsJobs = printerItems.filter(item => item.usesCfs === true);
      const normalJobs = printerItems.filter(item => item.usesCfs !== true);

      if (cfsJobs.length > 0) {
        const palette = [...new Map(cfsJobs.flatMap(item => item.normalizedMaterials || [item.normalizedMaterial]).filter(Boolean).map(mat => [String(mat.id), mat])).values()];
        const loadTime = palette.reduce((sum, mat) => sum + (parseFloat(mat.loadTime) || 0), 0);
        const purgeTime = palette.reduce((sum, mat) => sum + (parseFloat(mat.purgeTime) || 0), 0);
        const paletteLabel = palette.map(getMaterialLabel).join(' + ') || 'CFS Palette';
        filamentHandlingEvents += palette.length * 2;
        injectTask(state, `load-cfs-${state.key}`, `Load CFS: ${paletteLabel}`, loadTime, paletteLabel);
        cfsJobs.sort((a, b) => (b.normalizedTime - a.normalizedTime) || (a.index - b.index)).forEach((item) => {
          const start = advanceTime(state.currentTime);
          if (start > state.currentTime) {
            state.overnightIdleMins += (start - state.currentTime);
            overnightIdleMins += (start - state.currentTime);
            state.currentTime = start;
          }
          const dNum = Math.floor(state.currentTime / MINUTES_PER_DAY) + 1;
          let init = !state.initializedDays.has(dNum) ? (getBootupTime(state.printer) + getBedLevelTime(state.printer)) : 0;
          if (init > 0) { state.initializedDays.add(dNum); totalStartupTime += init; }
          const itemKey = String(item.parentId ?? item.id ?? item.index);
          const pExtra = extrasSummaryMap[itemKey] || { magnets: 0, heatsets: 0 };
          
          const swapMins = getCfsSwapMins(item);
          const mPlcTime = pExtra.magnets * (parseFloat(extraRates.magnetPlacementRate) || 0);
          const mSetTime = pExtra.magnets > 0 ? (parseFloat(extraRates.magnetSetupRate) || 0) : 0;
          const workload = Math.round(item.normalizedTime + swapMins + mPlcTime + mSetTime + init);
          const b = getDayBucket(dNum, paletteLabel, state.printer);
          b.totalMins += workload; b.setupMins += (mSetTime + init + swapMins); b.installMins += mPlcTime; b.printMins += item.normalizedTime;
          b.plates.push({ id: String(item.id ?? item.index), name: item.itemName, time: workload, scheduledMins: workload, printMins: item.normalizedTime, setupMins: mSetTime + init + swapMins, installMins: mPlcTime, postPrintHeatsetMins: (pExtra.heatsets > 0 ? (parseFloat(extraRates.heatsetSetupRate) || 0) : 0) + (pExtra.heatsets * (parseFloat(extraRates.heatsetPlacementRate) || 0)), filament: paletteLabel, printerName: getPrinterLabel(state.printer), magnets: pExtra.magnets, heatsets: pExtra.heatsets, startDay: dNum, endDay: Math.floor((state.currentTime + workload - 0.1) / MINUTES_PER_DAY) + 1 });
          state.currentTime += workload;
        });
        injectTask(state, `purge-cfs-${state.key}`, `Purge CFS: ${paletteLabel}`, purgeTime, paletteLabel);
      }

      const grouped = Object.values(normalJobs.reduce((acc, item) => {
        const key = String(item.normalizedMaterial.materialId || item.normalizedMaterial.id);
        if (!acc[key]) acc[key] = []; acc[key].push(item); return acc;
      }, {})).map(g => [...g].sort((a, b) => (b.normalizedTime - a.normalizedTime) || (a.index - b.index)));

      grouped.forEach((group, gIdx) => {
        const filLabel = getMaterialLabel(group[0].normalizedMaterial);
        filamentHandlingEvents += 2;
        injectTask(state, `load-${state.key}-${gIdx}`, `Load Filament: ${filLabel}`, group[0].normalizedMaterial.loadTime, filLabel);
        group.forEach((item) => {
        const start = advanceTime(state.currentTime);
        if (start > state.currentTime) {
          state.overnightIdleMins += (start - state.currentTime);
          overnightIdleMins += (start - state.currentTime);
          state.currentTime = start;
        }
        const dNum = Math.floor(state.currentTime / MINUTES_PER_DAY) + 1;
        let init = !state.initializedDays.has(dNum) ? (getBootupTime(state.printer) + getBedLevelTime(state.printer)) : 0;
        if (init > 0) { state.initializedDays.add(dNum); totalStartupTime += init; }
        const itemKey = String(item.id ?? item.index);
        const extraKey = String(item.parentId ?? item.id ?? item.index);
        const pExtra = extrasSummaryMap[extraKey] || { magnets: 0, heatsets: 0 };
        const mPlcTime = pExtra.magnets * (parseFloat(extraRates.magnetPlacementRate) || 0);
        const mSetTime = pExtra.magnets > 0 ? (parseFloat(extraRates.magnetSetupRate) || 0) : 0;
        const workload = Math.round(item.normalizedTime + mPlcTime + mSetTime + init);
        const b = getDayBucket(dNum, filLabel, state.printer);
        b.totalMins += workload; b.setupMins += (mSetTime + init); b.installMins += mPlcTime; b.printMins += item.normalizedTime;
        b.plates.push({ id: itemKey, name: item.itemName, time: workload, scheduledMins: workload, printMins: item.normalizedTime, setupMins: mSetTime + init, installMins: mPlcTime, postPrintHeatsetMins: (pExtra.heatsets > 0 ? (parseFloat(extraRates.heatsetSetupRate) || 0) : 0) + (pExtra.heatsets * (parseFloat(extraRates.heatsetPlacementRate) || 0)), filament: filLabel, printerName: getPrinterLabel(state.printer), magnets: pExtra.magnets, heatsets: pExtra.heatsets, startDay: dNum, endDay: Math.floor((state.currentTime + workload - 0.1) / MINUTES_PER_DAY) + 1 });
        state.currentTime += workload;
        });
        injectTask(state, `purge-${state.key}-${gIdx}`, `Purge & Cleanup: ${filLabel}`, group[0].normalizedMaterial.purgeTime, filLabel);
      });
    });

    productionSchedule.sort((a, b) => (a.day - b.day) || String(a.printerName || '').localeCompare(String(b.printerName || '')));
    const estSessions = Math.max(1, ...productionSchedule.flatMap(day => [day.day, ...(day.plates || []).map(p => p.endDay || day.day)]));
    const totalPrintTime = validItems.reduce((s, i) => s + i.normalizedTime, 0);
    const totalSwapMins = validItems.reduce((s, i) => s + getCfsSwapMins(i), 0);
    const handlingMins = filamentHandlingEvents * 5;
    
    const printerRuntimeRows = Object.values(printerStates).map((state) => {
      const printMins = validItems
        .filter((item) => getPrinterKey(getJobPrinter(item)) === state.key)
        .reduce((sum, item) => sum + item.normalizedTime, 0);
      const swapMins = validItems
        .filter((item) => getPrinterKey(getJobPrinter(item)) === state.key)
        .reduce((sum, item) => sum + getCfsSwapMins(item), 0);
      const startupMins = [...state.initializedDays].length * (getBootupTime(state.printer) + getBedLevelTime(state.printer));
      const hasCfsRuntime = validItems.some((item) => getPrinterKey(getJobPrinter(item)) === state.key && item.usesCfs === true);
      const printerWattage = parseFloat(state.printer?.wattage || 0) + (hasCfsRuntime ? (parseFloat(state.printer?.cfs?.wattage) || 0) : 0);
      return {
        printerName: getPrinterLabel(state.printer),
        wattage: printerWattage,
        runtimeMins: printMins + swapMins + startupMins + state.overnightIdleMins + (handlingMins / Math.max(1, Object.keys(printerStates).length)),
        printTimeOnly: printMins + swapMins
      };
    });
    
    // Fleet Optimization: Use max active print time for monitoring
    const maxPrintTime = printerRuntimeRows.length > 0 ? Math.max(...printerRuntimeRows.map(r => r.printTimeOnly)) : totalPrintTime;
    const monitoringBaseMins = maxPrintTime;
    const monitoringMins = monitoringBaseMins * (currentRates.monitoringRate / 100);

    const costPrepFlat = validItems.length * currentRates.prepFee;
    const costSupportFlat = validItems.length * currentRates.supportFee;
    const costHardwareLabor = totalHardwareQty * currentRates.installationCost;
    const costFilamentHandling = filamentHandlingEvents * currentRates.filamentHandlingCost;
    
    // Tiered Labor Calculation for Monitoring
    const monitoringHours = (monitoringMins / 60);
    const laborCostDoc = storeRates['labor-cost'] || {};
    const printTierMap = laborCostDoc.printTierMap || {};
    const tiers = Object.values(printTierMap).sort((a, b) => a.firstCoveredHours - b.firstCoveredHours);
    
    let costMonitoringLabor = 0;
    let processedHours = 0;
    
    if (tiers.length > 0) {
      for (const tier of tiers) {
        const coveredHours = parseFloat(tier.firstCoveredHours) || 0;
        const rate = parseFloat(tier.laborRate) || currentRates.laborRate;
        if (monitoringHours > processedHours) {
          const hoursInTier = Math.min(monitoringHours, coveredHours) - processedHours;
          if (hoursInTier > 0) {
            costMonitoringLabor += hoursInTier * rate;
            processedHours += hoursInTier;
          }
        }
      }
      if (monitoringHours > processedHours) {
        costMonitoringLabor += (monitoringHours - processedHours) * currentRates.laborRate;
      }
    } else {
      costMonitoringLabor = monitoringHours * currentRates.laborRate;
    }
    
    const runtimeForElec = totalPrintTime + totalSwapMins + totalStartupTime + totalHardwareMins + handlingMins;
    
    const markupableLabor = costPrepFlat + costHardwareLabor + (isInventoryMode ? 0 : (costMonitoringLabor + costSupportFlat + costFilamentHandling));
    const laborFinal = (markupableLabor * markupMultiplier) + (isInventoryMode ? (costMonitoringLabor + costSupportFlat + costFilamentHandling) : 0);
    const baseLaborTotal = costPrepFlat + costSupportFlat + costMonitoringLabor + costHardwareLabor + costFilamentHandling;
    
    // Precision Electricity Calculation per Printer
    const kwhP = printerRuntimeRows.reduce((sum, row) => sum + ((row.wattage / 1000) * (row.runtimeMins / 60)), 0);
    const kwhI = (currentRates.ironPower / 1000) * (heatsetMins / 60);
    const baseElecTotal = (kwhP + kwhI) * currentRates.electricityRate;
    const elecFinal = baseElecTotal * markupMultiplier;

    
    const maintFinal = ((runtimeForElec / 60) * currentRates.maintRate) + ((heatsetMins / 60) * currentRates.mSolderRate) + currentRates.maintFixed;
    
    const materialBaseSum = filamentSummary.reduce((s, f) => s + f.usageCost, 0);
    const filamentExcessSum = filamentSummary.reduce((s, f) => s + f.excessCharge, 0);
    const filamentFinal = filamentSummary.reduce((s, f) => s + f.finalCost, 0);
    const extrasFinal = (extrasBaseSum * markupMultiplier) + extrasExcessSum;
    const handlingFinal = currentRates.handlingFee ?? 0;
    
    const grandTotal = filamentFinal + laborFinal + elecFinal + extrasFinal + maintFinal + handlingFinal;

    const profitFilament = materialBaseSum * (markupMultiplier - 1);
    const profitLabor = markupableLabor * (markupMultiplier - 1);
    const profitElectricity = baseElecTotal * (markupMultiplier - 1);
    const profitExtras = extrasBaseSum * (markupMultiplier - 1);
    const totalProjectProfit = profitFilament + profitLabor + profitElectricity + profitExtras;
    const totalTakeHome = laborFinal + profitFilament + profitElectricity + (profitExtras + extrasExcessSum) + filamentExcessSum;
    
    // Satisfy ESLint unused var
    console.log('Overnight Idle Mins:', overnightIdleMins);

    return {
      total: Math.ceil(grandTotal).toLocaleString(),
      dp: Math.ceil(filamentSummary.reduce((s,f) => s + f.totalCost, 0) + extrasRawSum + elecFinal + (baseLaborTotal * 0.5)).toLocaleString(),
      timeline: { totalEffort: formatMinutes(totalPrintTime + backgroundPrepTime + backgroundSupportTime + totalStartupTime + totalHardwareMins), days: estSessions, schedule: productionSchedule },
      filament: formatCurrency(filamentFinal),
      labor: formatCurrency(laborFinal),
      electricity: formatCurrency(elecFinal),
      maintenance: formatCurrency(maintFinal),
      handling: formatCurrency(handlingFinal),
      extras: formatCurrency(extrasFinal),
      totalProfit: formatCurrency(totalProjectProfit),
      totalTakeHome: formatCurrency(totalTakeHome),
      details: {
        filament: [
          {
            title: 'Usage Details',
            items: filamentSummary.map(f => ({
              label: f.name,
              sub: `${formatWeight(f.totalWeightUsed)} used • ₱${formatCurrency(f.pricePerGram)}/g`,
              calc: `₱${formatCurrency(f.usageCost)}`
            }))
          },
          {
            title: 'Earnings & Summary',
            items: [
              { label: 'Filament Markup', sub: `${markupPercent}% profit on usage`, calc: `₱${formatCurrency(profitFilament)}`, isProfit: true },
              { label: 'Leftover Fees', sub: 'Client share of unused material', calc: `₱${formatCurrency(filamentExcessSum)}` },
              { label: 'Filament Total', sub: 'Combined with profit and excess', calc: `₱${formatCurrency(filamentFinal)}` }
            ]
          }
        ],
        labor: [
          {
            title: 'File Preparation',
            items: [
              { label: 'Model Preparation', sub: `${validItems.length} file(s) × ₱${currentRates.prepFee}`, calc: `₱${formatCurrency(costPrepFlat)}` },
              { label: 'Support Removal', sub: `${validItems.length} model(s) × ₱${currentRates.supportFee}`, calc: `₱${formatCurrency(costSupportFlat)}` }
            ]
          },
          {
            title: 'Print Monitoring',
            items: tiers.length > 0 
              ? tiers.map((t, idx) => ({
                  label: `Tier ${idx + 1}`,
                  sub: `${t.firstCoveredHours} hrs @ ₱${t.laborRate || currentRates.laborRate}/hr`,
                  calc: `₱${formatCurrency(Math.min(monitoringHours, t.firstCoveredHours) * (t.laborRate || currentRates.laborRate))}`
                }))
              : [{ label: 'Standard Rate', sub: `${monitoringHours.toFixed(1)} hrs @ ₱${currentRates.laborRate}/hr`, calc: `₱${formatCurrency(costMonitoringLabor)}` }]
          },
          {
            title: 'Additional Labor',
            items: [
              { label: 'Hardware Install', sub: `${totalHardwareQty} pc(s) • ₱${currentRates.installationCost}/pc`, calc: `₱${formatCurrency(costHardwareLabor)}` },
              { label: 'Filament Handling', sub: `${filamentHandlingEvents} event(s) • ₱${currentRates.filamentHandlingCost}/event`, calc: `₱${formatCurrency(costFilamentHandling)}` }
            ]
          },
          {
            title: 'Labor Summary',
            items: [
              { label: 'Print Monitoring Total', sub: 'Total tiered monitoring cost', calc: `₱${formatCurrency(costMonitoringLabor)}` },
              { label: 'Labor Markup', sub: `${markupPercent}% profit on prep & hardware`, calc: `₱${formatCurrency(profitLabor)}`, isProfit: true },
              { label: 'Labor Total', sub: 'Base labor + markup profit', calc: `₱${formatCurrency(laborFinal)}` }
            ]
          }
        ],
        electricity: [
          {
            title: 'Consumption',
            items: [
              { label: 'Printer Power', sub: `${printerRuntimeRows.length} printer(s) used • includes ${formatMinutes(totalSwapMins)} multicolor swaps`, calc: `₱${formatCurrency(kwhP * currentRates.elecRate)}` },
              { label: 'Soldering Iron', sub: `${currentRates.ironPower}W used`, calc: `₱${formatCurrency(kwhI * currentRates.elecRate)}` }
            ]
          },
          {
            title: 'Earnings & Summary',
            items: [
              { label: 'Utility Markup', sub: `${markupPercent}% profit on power`, calc: `₱${formatCurrency(profitElectricity)}`, isProfit: true },
              { label: 'Energy Total', sub: `₱${formatCurrency(baseElecTotal)} base + profit`, calc: `₱${formatCurrency(elecFinal)}` }
            ]
          }
        ],
        extras: [
          { title: 'Hardware Items', items: extrasBreakdown },
          {
            title: 'Earnings & Summary',
            items: [
              { label: 'Hardware Markup', sub: `${markupPercent}% profit on items`, calc: `₱${formatCurrency(profitExtras)}`, isProfit: true },
              { label: 'Extras Total', sub: 'Base items + markup profit', calc: `₱${formatCurrency(extrasFinal)}` }
            ]
          }
        ],
        maintenance: [
          {
            title: 'Component Wear',
            items: [
              { label: 'Printer Wear', sub: `₱${currentRates.maintRate}/hr`, calc: `₱${formatCurrency((runtimeForElec / 60) * currentRates.maintRate)}` },
              { label: 'Soldering Tip', sub: `₱${currentRates.mSolderRate}/hr`, calc: `₱${formatCurrency((heatsetMins / 60) * currentRates.mSolderRate)}` }
            ]
          },
          {
            title: 'Service Fees',
            items: [
              { label: 'Handling Fee', sub: 'Flat processing fee', calc: `₱${formatCurrency(handlingFinal)}` },
              { label: 'Estimation Fee', sub: 'Project assessment', calc: `₱${formatCurrency(currentRates.maintFixed)}` }
            ]
            },
            {
            title: 'Maintenance Total',
            items: [{ label: 'Maintenance Total', sub: 'No markup applied', calc: `₱${formatCurrency(maintFinal)}` }]
            }
        ]
      }
    };
  }, [data, dbSettings, storeRates, activePrinter, filamentInventory, printers, isInventoryMode]);

  useEffect(() => { if (calculations && onCalculate) onCalculate(calculations); }, [calculations, onCalculate]);
  if (!calculations) return null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
      <div className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)] rounded-[2.5rem] px-4 shadow-sm border border-[var(--color-border)]">
        <CostItem icon={Coins} label="Filament" value={calculations.filament} colorClass="bg-amber-500 text-amber-600" details={calculations.details.filament} />
        <CostItem icon={User} label="Labor" value={calculations.labor} colorClass="bg-green-500 text-green-600" details={calculations.details.labor} />
        {parseFloat(calculations.extras) > 0 && <CostItem icon={Box} label="Extras" value={calculations.extras} colorClass="bg-purple-500 text-purple-600" details={calculations.details.extras} />}
        <CostItem icon={Zap} label="Electricity" value={calculations.electricity} colorClass="bg-blue-500 text-blue-600" details={calculations.details.electricity} />
        <CostItem icon={PlusCircle} label="Maintenance" value={calculations.maintenance} colorClass="bg-rose-500 text-rose-600" details={calculations.details.maintenance} />
      </div>

      <div className="space-y-2">
        <div className="mx-2 p-6 rounded-[2rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500 rounded-xl text-white">
              <TrendingUp size={20} />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase opacity-60 block tracking-widest italic">Net Profit</span>
              <span className="text-[15px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tight">Total Project Earnings</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[24px] font-black italic text-emerald-600 tracking-tighter">₱{calculations.totalProfit}</span>
          </div>
        </div>

        <div className="mx-2 p-6 rounded-[2rem] bg-blue-600 text-white flex items-center justify-between shadow-xl shadow-blue-600/20 relative overflow-hidden">
          <Wallet size={80} className="absolute -right-4 -bottom-4 opacity-10 -rotate-12" />
          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-md">
              <Wallet size={20} />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase opacity-60 block tracking-widest italic">Take Home</span>
              <span className="text-[15px] font-black uppercase tracking-tight">Pocket-Ready Income</span>
            </div>
          </div>
          <div className="text-right relative z-10">
            <span className="text-[24px] font-black italic tracking-tighter">₱{calculations.totalTakeHome}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
