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
    <div className="border-b border-black/5 py-5 transition-all space-y-3 px-2">
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
        <div className="ml-[60px] bg-black/[0.02] dark:bg-white/[0.02] rounded-[1.5rem] p-5 border border-dashed border-black/10 dark:border-white/10 animate-in slide-in-from-top-2 duration-300 space-y-4">
          {details.map((section, idx) => (section.items?.length > 0 && (
            <div key={idx} className="space-y-2">
              {section.title && <div className="text-[9px] font-black text-blue-600 opacity-60 uppercase tracking-[0.2em] border-b border-black/5 pb-1 mb-2">{section.title}</div>}
              {section.items.map((item, sIdx) => (
                <div key={sIdx} className="flex justify-between items-start text-[11px] font-bold uppercase tracking-tight gap-3">
                  <div className="flex flex-col max-w-[70%] text-zinc-600 dark:text-zinc-400">
                    <span>{item.label}</span>
                    {item.sub && <span className="text-[9px] opacity-50 lowercase italic leading-snug mt-1">{item.sub}</span>}
                  </div>
                  <span className={`font-black whitespace-nowrap ${item.isProfit ? 'text-emerald-500' : 'text-black dark:text-white'}`}>{item.calc}</span>
                </div>
              ))}
            </div>
          )))}
        </div>
      )}
    </div>
  );
};

export default function CostBreakdown({ data, activePrinter, dbSettings, onCalculate }) {
  const storeRates = useStore((state) => state.rates);
  const filamentInventory = useStore((state) => state.filamentInventory);

  const calculations = useMemo(() => {
    const sourceItems = Array.isArray(data?.projectDetails) ? data.projectDetails : [];
    if (sourceItems.length === 0 || !storeRates || Object.keys(storeRates).length === 0) return null;

    const items = sourceItems.map((item, index) => {
      const baseMaterial = getItemMaterial(item);
      const inventoryMatch = (filamentInventory || []).find((f) => String(f.id) === String(baseMaterial?.id));
      const material = baseMaterial ? { ...baseMaterial, ...(inventoryMatch || {}) } : null;
      return {
        ...item,
        index,
        itemName: getProjectItemLabel(data?.method?.name, { ...item, index }),
        normalizedWeight: getItemWeight(item),
        normalizedTime: getItemTime(item),
        normalizedMaterial: material
      };
    });

    const validItems = items.filter(i => i.normalizedMaterial);
    if (validItems.length === 0) return null;

    const matRates = storeRates['material-cost'] || {};
    const laborRates = storeRates['labor-cost'] || {};
    const printRates = storeRates['print-cost'] || {};
    const elecRates = storeRates['electricity-cost'] || {};
    const maintRates = storeRates['maintenance-cost'] || {};
    const extraRates = storeRates['extra-cost'] || {};

    const markupPercent = (parseFloat(printRates.markupRate) || 20);
    const markupMultiplier = 1 + (markupPercent / 100);
    const filamentClientShare = (parseFloat(matRates.clientShareRate) || 0) / 100;
    const extraClientShare = (parseFloat(extraRates.clientShareRate) || 0) / 100;
    const baseElecRate = parseFloat(elecRates.electricityRate) || 14.16;
    const finalElecRate = baseElecRate * (1 + ((parseFloat(elecRates.expectedIncrease) || 0) / 100));

    const currentRates = {
      elecRate: finalElecRate,
      laborRate: parseFloat(laborRates.laborRate) || 120,
      installationCost: parseFloat(laborRates.installationCost) || 2,
      filamentHandlingCost: parseFloat(laborRates.filamentHandlingCost) || 5,
      monitoringRate: parseFloat(laborRates.monitoringRate) || 100,
      dailyPrintLimit: parseFloat(laborRates.dailyPrintLimit) || 10,
      maintRate: parseFloat(maintRates.maintenanceRate) || 5,
      maintFixed: parseFloat(maintRates.estimationFixedCost) || 0,
      mSolderRate: parseFloat(maintRates.mSolderRate) || 2,
      ironPower: parseFloat(elecRates.solderingIronPower) || 60,
      prepFee: parseFloat(laborRates.preparationRatePerFile) || 10,
      supportFee: parseFloat(laborRates.supportRemovalRatePerModel) || 5,
      printStartTime: parseFloat(laborRates.printStartTime) || 9,
      ...(dbSettings || {})
    };

    const filamentGroups = validItems.reduce((acc, item) => {
      const key = String(item.normalizedMaterial.materialId || item.normalizedMaterial.id);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    const filamentSummary = Object.entries(filamentGroups).map(([id, group]) => {
      const mat = group[0].normalizedMaterial;
      const spoolWeight = parseFloat(mat.weight || DEFAULT_SPOOL_WEIGHT);
      const pricePerGram = spoolWeight > 0 ? (parseFloat(mat.price) || 0) / spoolWeight : 0;
      const totalWeight = group.reduce((sum, i) => sum + i.normalizedWeight, 0);
      const isUpfront = String(mat.status || '').toLowerCase() === 'upfront';
      const shortfall = isUpfront ? totalWeight : Math.max(0, totalWeight - (parseFloat(mat.remaining) || 0));
      const spoolsNeeded = shortfall > 0 ? Math.ceil(shortfall / spoolWeight) : 0;
      const excessWeight = Math.max(0, (spoolsNeeded * spoolWeight) - shortfall);
      const excessCharge = excessWeight * pricePerGram * filamentClientShare;
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
      const isUpfront = String(extra.status || '').toLowerCase() === 'upfront';
      const baseCost = totalQty * pricePerPiece;
      let excessUnits = 0, purchasedPacks = 0, excessShare = 0;
      if (isUpfront) {
        purchasedPacks = Math.ceil(totalQty / pack);
        excessUnits = Math.max(0, (purchasedPacks * pack) - totalQty);
      } else {
        const stock = parseFloat(extra.qty) || 0;
        if (totalQty > stock) {
          purchasedPacks = Math.ceil((totalQty - stock) / pack);
          excessUnits = Math.max(0, (stock + (purchasedPacks * pack)) - totalQty);
        }
      }
      excessShare = excessUnits * pricePerPiece * extraClientShare;
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
    const bootupTime = (parseFloat(activePrinter?.bootupMins) || 0) + (parseFloat(activePrinter?.homingMins) || 0);
    const bedLevelTime = parseFloat(activePrinter?.bedLevelMins ?? activePrinter?.bootLevelMins) || 0;
    const MINUTES_PER_DAY = 1440;
    const productionSchedule = [];
    let currentTime = printStartMins, overnightIdleMins = 0;
    const initializedDays = new Set();

    const getDayBucket = (dayNum, fil) => {
      let b = productionSchedule.find(e => e.day === dayNum);
      if (!b) { b = { day: dayNum, totalMins: 0, gapMins: 0, limitMins: sessionLimitMins, setupMins: 0, installMins: 0, printMins: 0, filament: fil, plates: [] }; productionSchedule.push(b); }
      return b;
    };

    const advanceTime = (t) => {
      const dStart = Math.floor(t / MINUTES_PER_DAY) * MINUTES_PER_DAY + printStartMins;
      if (t <= dStart + sessionLimitMins + 120 && t >= dStart) return t;
      let next = dStart;
      while (next <= t) next += MINUTES_PER_DAY;
      return next;
    };

    const injectTask = (id, name, time, fil, type = 'manual', skipInit = false) => {
      if (time <= 0) return;
      const start = advanceTime(currentTime);
      if (start > currentTime) { overnightIdleMins += (start - currentTime); currentTime = start; }
      const dNum = Math.floor(currentTime / MINUTES_PER_DAY) + 1;
      let init = (!skipInit && !initializedDays.has(dNum)) ? (bootupTime + bedLevelTime) : 0;
      if (init > 0) initializedDays.add(dNum);
      const b = getDayBucket(dNum, fil);
      const rounded = Math.round(time + init);
      b.totalMins += rounded;
      if (type === 'manual') b.setupMins += rounded; else b.printMins += rounded;
      b.plates.push({ id, name, time: rounded, scheduledMins: rounded, printMins: type === 'print' ? time : 0, setupMins: rounded - (type === 'print' ? time : 0), installMins: 0, postPrintHeatsetMins: 0, filament: fil, magnets: 0, heatsets: 0, startDay: dNum, endDay: Math.floor((currentTime + rounded - 0.1) / MINUTES_PER_DAY) + 1 });
      currentTime += rounded;
    };

    const backgroundPrepTime = validItems.length * 5; 
    const backgroundSupportTime = validItems.length * 2;
    injectTask('batch-prep', 'Batch Preparation & Setup', backgroundPrepTime + backgroundSupportTime, 'Manual Work', 'manual', true);

    const grouped = Object.values(validItems.reduce((acc, item) => {
      const key = String(item.normalizedMaterial.materialId || item.normalizedMaterial.id);
      if (!acc[key]) acc[key] = []; acc[key].push(item); return acc;
    }, {})).map(g => [...g].sort((a, b) => (b.normalizedTime - a.normalizedTime) || (a.index - b.index)));

    grouped.forEach((group, gIdx) => {
      const filLabel = getMaterialLabel(group[0].normalizedMaterial);
      injectTask(`load-${gIdx}`, `Load Filament: ${filLabel}`, group[0].normalizedMaterial.loadTime, filLabel);
      group.forEach((item) => {
        const start = advanceTime(currentTime);
        if (start > currentTime) { overnightIdleMins += (start - currentTime); currentTime = start; }
        const dNum = Math.floor(currentTime / MINUTES_PER_DAY) + 1;
        let init = !initializedDays.has(dNum) ? (bootupTime + bedLevelTime) : 0;
        if (init > 0) initializedDays.add(dNum);
        const itemKey = String(item.id ?? item.index);
        const pExtra = extrasSummaryMap[itemKey] || { magnets: 0, heatsets: 0 };
        const mPlcTime = pExtra.magnets * (parseFloat(extraRates.magnetPlacementRate) || 0);
        const mSetTime = pExtra.magnets > 0 ? (parseFloat(extraRates.magnetSetupRate) || 0) : 0;
        const workload = Math.round(item.normalizedTime + mPlcTime + mSetTime + init);
        const b = getDayBucket(dNum, filLabel);
        b.totalMins += workload; b.setupMins += (mSetTime + init); b.installMins += mPlcTime; b.printMins += item.normalizedTime;
        b.plates.push({ id: itemKey, name: item.itemName, time: workload, scheduledMins: workload, printMins: item.normalizedTime, setupMins: mSetTime + init, installMins: mPlcTime, postPrintHeatsetMins: (pExtra.heatsets > 0 ? (parseFloat(extraRates.heatsetSetupRate) || 0) : 0) + (pExtra.heatsets * (parseFloat(extraRates.heatsetPlacementRate) || 0)), filament: filLabel, magnets: pExtra.magnets, heatsets: pExtra.heatsets, startDay: dNum, endDay: Math.floor((currentTime + workload - 0.1) / MINUTES_PER_DAY) + 1 });
        currentTime += workload;
      });
      injectTask(`purge-${gIdx}`, `Purge & Cleanup: ${filLabel}`, group[0].normalizedMaterial.purgeTime, filLabel);
    });

    productionSchedule.sort((a, b) => a.day - b.day);
    const estSessions = productionSchedule.length || 1;
    const totalPrintTime = validItems.reduce((s, i) => s + i.normalizedTime, 0);
    const totalStartupTime = (bootupTime + bedLevelTime) * estSessions;
    const monitoringMins = totalPrintTime * (currentRates.monitoringRate / 100);

    const costPrepFlat = validItems.length * currentRates.prepFee;
    const costSupportFlat = validItems.length * currentRates.supportFee;
    const costMonitoringLabor = (monitoringMins / 60) * currentRates.laborRate;
    const costHardwareLabor = totalHardwareQty * currentRates.installationCost;
    const costFilamentHandling = filamentSummary.length * 2 * currentRates.filamentHandlingCost;
    const baseLaborTotal = costPrepFlat + costSupportFlat + costMonitoringLabor + costHardwareLabor + costFilamentHandling;
    
    const runtimeForElec = totalPrintTime + totalStartupTime + totalHardwareMins + (filamentSummary.length * 2 * 5); 
    const kwhP = (parseFloat(activePrinter?.wattage || 0) / 1000) * ((runtimeForElec + overnightIdleMins) / 60);
    const kwhI = (currentRates.ironPower / 1000) * (heatsetMins / 60);
    const baseElecTotal = (kwhP + kwhI) * currentRates.elecRate;
    
    const laborFinal = baseLaborTotal * markupMultiplier;
    const elecFinal = baseElecTotal * markupMultiplier;
    const maintFinal = ((runtimeForElec / 60) * currentRates.maintRate) + ((heatsetMins / 60) * currentRates.mSolderRate) + currentRates.maintFixed;
    
    const materialBaseSum = filamentSummary.reduce((s, f) => s + f.usageCost, 0);
    const filamentExcessSum = filamentSummary.reduce((s, f) => s + f.excessCharge, 0);
    const filamentFinal = filamentSummary.reduce((s, f) => s + f.finalCost, 0);
    const extrasFinal = (extrasBaseSum * markupMultiplier) + extrasExcessSum;
    
    const grandTotal = filamentFinal + laborFinal + elecFinal + extrasFinal + maintFinal;

    const profitFilament = materialBaseSum * (markupMultiplier - 1);
    const profitLabor = baseLaborTotal * (markupMultiplier - 1);
    const profitElectricity = baseElecTotal * (markupMultiplier - 1);
    const profitExtras = extrasBaseSum * (markupMultiplier - 1);
    const totalProjectProfit = profitFilament + profitLabor + profitElectricity + profitExtras;
    const totalTakeHome = laborFinal + profitFilament + profitElectricity + (profitExtras + extrasExcessSum) + filamentExcessSum;

    return {
      total: Math.ceil(grandTotal).toLocaleString(),
      dp: Math.ceil(filamentSummary.reduce((s,f) => s + f.totalCost, 0) + extrasRawSum + elecFinal + (baseLaborTotal * 0.5)).toLocaleString(),
      timeline: { totalEffort: formatMinutes(totalPrintTime + backgroundPrepTime + backgroundSupportTime + totalStartupTime + totalHardwareMins), days: estSessions, schedule: productionSchedule },
      filament: formatCurrency(filamentFinal),
      labor: formatCurrency(laborFinal),
      electricity: formatCurrency(elecFinal),
      maintenance: formatCurrency(maintFinal),
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
            title: 'Passive Monitoring',
            items: [{ label: 'Print Watch', sub: `${formatMinutes(monitoringMins)} (${currentRates.monitoringRate}%) • ₱${currentRates.laborRate}/hr`, calc: `₱${formatCurrency(costMonitoringLabor)}` }]
          },
          {
            title: 'Flat Rate Tasks',
            items: [
              { label: 'Hardware Install', sub: `${totalHardwareQty} pc(s) • ₱${currentRates.installationCost}/pc`, calc: `₱${formatCurrency(costHardwareLabor)}` },
              { label: 'Filament Handling', sub: `${filamentSummary.length * 2} event(s) • ₱${currentRates.filamentHandlingCost}/event`, calc: `₱${formatCurrency(costFilamentHandling)}` }
            ]
          },
          {
            title: 'Labor Summary',
            items: [
              { label: 'Labor Markup', sub: `${markupPercent}% profit on workload`, calc: `₱${formatCurrency(profitLabor)}`, isProfit: true },
              { label: 'Labor Total', sub: 'Base labor + markup profit', calc: `₱${formatCurrency(laborFinal)}` }
            ]
          }
        ],
        electricity: [
          {
            title: 'Consumption',
            items: [
              { label: 'Printer Power', sub: `${activePrinter?.wattage || 0}W used`, calc: `₱${formatCurrency(kwhP * currentRates.elecRate)}` },
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
            items: [{ label: 'Estimation Fee', sub: 'Project assessment', calc: `₱${formatCurrency(currentRates.maintFixed)}` }]
          },
          {
            title: 'Maintenance Summary',
            items: [{ label: 'Maintenance Total', sub: 'No markup applied', calc: `₱${formatCurrency(maintFinal)}` }]
          }
        ]
      }
    };
  }, [data, dbSettings, storeRates, activePrinter, filamentInventory]);

  useEffect(() => { if (calculations && onCalculate) onCalculate(calculations); }, [calculations, onCalculate]);
  if (!calculations) return null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
      <div className="divide-y divide-black/5 bg-white dark:bg-zinc-900/50 rounded-[2.5rem] px-4 shadow-sm border border-black/5">
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
