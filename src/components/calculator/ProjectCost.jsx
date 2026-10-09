import React, { useState, useCallback, useMemo } from 'react';
import {
  Receipt, Wallet, ArrowLeft, RotateCcw,
  ListChecks, Clock, Coins, SlidersHorizontal,
  Save, ShoppingBag, TrendingUp, TrendingDown, Undo2, X, Tag, RefreshCw, Check,
  Disc3, Zap, Printer
} from 'lucide-react';
import { useStore } from '../../store/useStore';
// import { useTheme } from '../../context/ThemeContext';
import CostBreakdown from './CostBreakdown';
import ProductionPlan from './ProductionPlan';

const RATE_SECTIONS = [
  {
    id: 'material-cost',
    title: 'Filament',
    fields: [
      { key: 'clientShareRate', label: 'Client Share', unit: '%', type: 'number' },
      { key: 'spool', label: 'Spool Size', unit: 'g', type: 'number' }
    ]
  },
  {
    id: 'labor-cost',
    title: 'Labor',
    fields: [
      { key: 'dailyPrintLimit', label: 'Daily Limit', unit: 'hr', type: 'number' },
      { key: 'laborRate', label: 'Labor Rate', unit: '₱/hr', type: 'number' },
      { key: 'multicolorPenalty', label: 'Swap Penalty', unit: 'min', type: 'number' },
      { key: 'installationCost', label: 'Hardware Install', unit: '₱/pc', type: 'number' },
      { key: 'filamentHandlingCost', label: 'Filament Change', unit: '₱/event', type: 'number' },
      { key: 'monitoringRate', label: 'Monitoring', unit: '%', type: 'number' },
      { key: 'preparationRatePerPlate', label: 'Prep Per Plate', unit: '₱/plate', type: 'number' },
      { key: 'printStartTime', label: 'Print Start', unit: 'hr', type: 'number' },
      { key: 'supportRemovalTimePerPlate', label: 'Support Time / Plate', unit: 'min/plate', type: 'number', defaultValue: 10 },
      { key: 'supportRemovalRatePerPlate', label: 'Support Removal / Plate', unit: '₱/plate', type: 'number' }
    ]
  },
  {
    id: 'extra-cost',
    title: 'Extras',
    fields: [
      { key: 'clientShareRate', label: 'Client Share', unit: '%', type: 'number' },
      { key: 'handlingFee', label: 'Handling Fee', unit: '₱', type: 'number' },
      { key: 'magnetSetupRate', label: 'Magnet Setup', unit: 'min', type: 'number' },
      { key: 'magnetPlacementRate', label: 'Magnet Place', unit: 'min', type: 'number' },
      { key: 'heatsetSetupRate', label: 'Heatset Setup', unit: 'min', type: 'number' },
      { key: 'heatsetPlacementRate', label: 'Heatset Place', unit: 'min', type: 'number' },
      { key: 'extruderDisplacement', label: 'Extruder Move', unit: 'min', type: 'number' },
      { key: 'solderHeatTime', label: 'Solder Heat', unit: 'min', type: 'number' }
    ]
  },
  {
    id: 'electricity-cost',
    title: 'Electricity',
    fields: [
      { key: 'electricityRate', label: 'Electricity Rate', unit: '₱/kWh', type: 'number' },
      { key: 'expectedIncrease', label: 'Expected Increase', unit: '%', type: 'number' },
      { key: 'solderingIronPower', label: 'Iron Power', unit: 'W', type: 'number' },
      { key: 'supportRemovalHeatgunPower', label: 'Support Heatgun', unit: 'W', type: 'number', defaultValue: 300 },
      { key: 'rateAsOf', label: 'Rate As Of', unit: '', type: 'text' }
    ]
  },
  {
    id: 'maintenance-cost',
    title: 'Maintenance',
    fields: [
      { key: 'estimationFixedCost', label: 'Estimation Cost', unit: '₱', type: 'number' },
      { key: 'mSolderRate', label: 'Iron Tip Wear', unit: '₱/hr', type: 'number' },
      { key: 'maintenanceRate', label: 'Printer Wear', unit: '₱/hr', type: 'number' }
    ]
  },
  {
    id: 'print-cost',
    title: 'Print',
    fields: [
      { key: 'markupRate', label: 'Markup', unit: '%', type: 'number' }
    ]
  }
];

const RateInput = ({ label, value, unit, type, onChange, trend }) => (
  <div className="bg-[var(--color-surface)] border border-[var(--color-border)] p-5 rounded-3xl shadow-sm flex flex-col justify-between min-h-[90px]">
    <div className="flex items-center justify-between gap-2 mb-2">
      <label className="text-[13px] font-black uppercase tracking-widest opacity-40 block">{label}</label>
      {trend === 'up' && <TrendingUp size={12} className="text-emerald-500 flex-shrink-0" strokeWidth={3} />}
      {trend === 'down' && <TrendingDown size={12} className="text-rose-500 flex-shrink-0" strokeWidth={3} />}
    </div>
    <div className="flex items-baseline gap-1">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value)}
        className="bg-transparent text-[15px] font-black text-blue-600 w-full outline-none"
      />
      <span className="text-[13px] font-bold opacity-30 whitespace-nowrap">{unit}</span>
    </div>
  </div>
);

const parseMoney = (value) => Number(String(value || 0).replace(/,/g, '')) || 0;

// A recalculation can briefly emit formatted zero values while the saved
// project is being normalized (especially when reopening STL/3MF projects).
// Never let that transient state erase a previously valid estimate.
const firstPositiveValue = (...values) => {
  const positive = values.find((value) => parseMoney(value) > 0);
  return positive ?? values.find((value) => value !== undefined && value !== null) ?? '0';
};

export default function ProjectCost({ 
  data, 
  onBack, 
  onReset, 
  activePrinter, 
  dbSettings, 
  onUpdateSettings,
  isEditMode = false,
  onFinalConfirm = null,
  isInventoryMode = false
}) {
  // const { isDarkMode } = useTheme();
  const isAdmin = useStore((state) => state.isAdmin);
  const isAdminView = useStore((state) => state.isAdminView);
  const publishBlueprint = useStore((state) => state.publishBlueprint);
  
  const [activeTab, setActiveTab] = useState('cost');
  const storeRates = useStore((state) => state.rates);
  const [draftRates, setDraftRates] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [totals, setTotals] = useState({
    total: '0',
    dp: '0',
    timeline: { days: 0, schedule: [] }
  });

  const handleCalculationUpdate = useCallback((computed) => {
    if (computed) setTotals(computed);
  }, []);

  const basePriceAmount = parseMoney(totals.basePrice || totals.total);
  const isStlProject = String(data?.method?.name || '').trim().toUpperCase() === 'STL';

  const targetOriginalPrinterId = data?.originalPrinterId || (isEditMode ? data?.printerId : null);
  const isUsingAvailabilityFallback = Boolean(
    targetOriginalPrinterId && activePrinter?.id && String(targetOriginalPrinterId) !== String(activePrinter.id)
  );

  const hasPendingRateChanges = useMemo(() => {
    return RATE_SECTIONS.some((section) => {
      const source = storeRates?.[section.id] || {};
      const draft = draftRates?.[section.id] || {};
      return section.fields.some((field) => (draft[field.key] ?? '') !== (source[field.key] ?? ''));
    });
  }, [draftRates, storeRates]);

  const changedRateCount = useMemo(() => {
    return RATE_SECTIONS.reduce((count, section) => {
      const source = storeRates?.[section.id] || {};
      const draft = draftRates?.[section.id] || {};
      return count + section.fields.filter((field) => (draft[field.key] ?? '') !== (source[field.key] ?? '')).length;
    }, 0);
  }, [draftRates, storeRates]);

  const handleRateDraftChange = useCallback((rateId, key, value) => {
    setDraftRates((prev) => ({
      ...prev,
      [rateId]: {
        ...(prev[rateId] || {}),
        [key]: value
      }
    }));
  }, []);

  const handleSaveRates = useCallback(async () => {
    const saves = [];
    RATE_SECTIONS.forEach((section) => {
      const source = storeRates?.[section.id] || {};
      const draft = draftRates?.[section.id] || {};
      const patch = {};

      section.fields.forEach((field) => {
        if ((draft[field.key] ?? '') !== (source[field.key] ?? '')) {
          patch[field.key] = draft[field.key];
        }
      });

      if (Object.keys(patch).length > 0) {
        saves.push(onUpdateSettings(section.id, patch));
      }
    });
    try {
      await Promise.all(saves);
      setDraftRates({});
    } catch (error) {
      console.error('Failed to save project rates:', error);
      alert(error?.message || 'Failed to save rates. Check admin permissions.');
    }
  }, [draftRates, onUpdateSettings, storeRates]);

  const handleResetSectionDraft = useCallback((sectionId) => {
    setDraftRates((prev) => ({
      ...prev,
      [sectionId]: { ...(storeRates?.[sectionId] || {}) }
    }));
  }, [storeRates]);

  const handleCancelRateChanges = useCallback(() => {
    const resetDrafts = {};
    RATE_SECTIONS.forEach((section) => {
      resetDrafts[section.id] = { ...(storeRates?.[section.id] || {}) };
    });
    setDraftRates(resetDrafts);
  }, [storeRates]);

  const orders = useStore((state) => state.orders);
  const projectVault = useStore((state) => state.projectVault);

  const estimationLimitReached = useMemo(() => {
    const completedProjectsCount = (orders || []).filter(o => 
      o.status?.toLowerCase() === 'completed' && 
      o.items?.some(item => item.type === 'project')
    ).length;
    const limit = 3 + completedProjectsCount;
    return (projectVault || []).length >= limit;
  }, [orders, projectVault]);

  const handleMainAction = async () => {
    if (!totals?.timeline) return;
    
    // Check limit before saving (Admins have no limit)
    if (!isAdmin && !isAdminView && estimationLimitReached) {
      alert("LIMIT REACHED, DELETE OLD ESTIMATION TO SAVE");
      return;
    }

    setIsSaving(true);
    try {
      const previousTotals = data?.totals || {};
      const calculatedTotals = totals || {};
      const hasCalculatedCost = parseMoney(calculatedTotals.total) > 0 || parseMoney(calculatedTotals.basePrice) > 0;
      const hasPreviousCost = parseMoney(previousTotals.total) > 0 || parseMoney(previousTotals.basePrice) > 0;
      if (!hasCalculatedCost && !hasPreviousCost) {
        alert("Unable to calculate project cost. Please check the printer, materials, and project details.");
        return;
      }
      const nextTotals = {
        ...previousTotals,
        ...calculatedTotals,
        total: firstPositiveValue(calculatedTotals.total, calculatedTotals.basePrice, previousTotals.total, previousTotals.basePrice),
        basePrice: firstPositiveValue(calculatedTotals.basePrice, calculatedTotals.total, previousTotals.basePrice, previousTotals.total),
        dp: firstPositiveValue(calculatedTotals.dp, previousTotals.dp, '0'),
        days: calculatedTotals.timeline?.days ?? calculatedTotals.days ?? previousTotals.days ?? 0,
        timeline: calculatedTotals.timeline || previousTotals.timeline || { days: 0, schedule: [] },
        capitalCost: calculatedTotals.capitalCost ?? previousTotals.capitalCost ?? 0,
        capitalBreakdown: calculatedTotals.capitalBreakdown ?? previousTotals.capitalBreakdown,
        totalProfit: calculatedTotals.totalProfit ?? previousTotals.totalProfit ?? '0',
        electricity: calculatedTotals.electricity ?? previousTotals.electricity ?? '0',
        electricityKwh: calculatedTotals.electricityKwh ?? previousTotals.electricityKwh ?? 0,
        electricityRate: calculatedTotals.electricityRate ?? previousTotals.electricityRate ?? 0,
        electricityMarkupMultiplier: calculatedTotals.electricityMarkupMultiplier
          ?? previousTotals.electricityMarkupMultiplier
          ?? 1,
        ...(calculatedTotals.filament ?? previousTotals.filament) !== undefined
          ? { filament: calculatedTotals.filament ?? previousTotals.filament }
          : {},
        ...(calculatedTotals.labor ?? previousTotals.labor) !== undefined
          ? { labor: calculatedTotals.labor ?? previousTotals.labor }
          : {},
        ...(calculatedTotals.maintenance ?? previousTotals.maintenance) !== undefined
          ? { maintenance: calculatedTotals.maintenance ?? previousTotals.maintenance }
          : {},
        ...(calculatedTotals.extras ?? previousTotals.extras) !== undefined
          ? { extras: calculatedTotals.extras ?? previousTotals.extras }
          : {}
      };

      const rawDetails = Array.isArray(data?.projectDetails) ? data.projectDetails : [];
      // During an edit, the printer fields coming out of the calculator are
      // the user's intentional new source configuration. Outside edit mode,
      // originalPrinter* remains authoritative and fallback pricing must not
      // rewrite it.
      const configuredPrinterId = isEditMode
        ? data?.printerId
          || rawDetails[0]?.printerId
          || activePrinter?.id
          || data?.originalPrinterId
          || rawDetails[0]?.originalPrinterId
          || null
        : data?.originalPrinterId
          || data?.printerId
          || activePrinter?.id
          || rawDetails[0]?.originalPrinterId
          || rawDetails[0]?.printerId
          || null;
      const configuredPrinterName = isEditMode
        ? data?.printerName
          || rawDetails[0]?.printerName
          || (activePrinter ? [activePrinter.brand, activePrinter.model || activePrinter.name].filter(Boolean).join(' ') : '')
          || data?.originalPrinterName
          || rawDetails[0]?.originalPrinterName
          || ''
        : data?.originalPrinterName
          || data?.printerName
          || (activePrinter ? [activePrinter.brand, activePrinter.model || activePrinter.name].filter(Boolean).join(' ') : '')
          || rawDetails[0]?.originalPrinterName
          || rawDetails[0]?.printerName
          || '';

      const normalizedDetails = rawDetails.map((detail) => {
        const detailOriginalId = isEditMode
          ? detail.printerId
            || detail.productionJobs?.[0]?.printerId
            || configuredPrinterId
            || detail.originalPrinterId
          : detail.originalPrinterId || configuredPrinterId || detail.printerId;
        const detailOriginalName = isEditMode
          ? detail.printerName
            || detail.productionJobs?.[0]?.printerName
            || configuredPrinterName
            || detail.originalPrinterName
          : detail.originalPrinterName || configuredPrinterName || detail.printerName;
        const normalizedJobs = Array.isArray(detail.productionJobs)
          ? detail.productionJobs.map((job) => {
              // A job may represent a different plate/model printer than its
              // parent detail. Preserve that assignment independently.
              const jobOriginalId = isEditMode
                ? job.printerId || detailOriginalId || job.originalPrinterId
                : job.originalPrinterId || job.printerId || detailOriginalId;
              const jobOriginalName = isEditMode
                ? job.printerName || detailOriginalName || job.originalPrinterName
                : job.originalPrinterName || job.printerName || detailOriginalName;
              return {
                ...job,
                printerId: jobOriginalId,
                printerName: jobOriginalName,
                originalPrinterId: jobOriginalId,
                originalPrinterName: jobOriginalName
              };
            })
          : detail.productionJobs;

        return {
          ...detail,
          printerId: detailOriginalId,
          printerName: detailOriginalName,
          originalPrinterId: detailOriginalId,
          originalPrinterName: detailOriginalName,
          ...(Array.isArray(detail.productionJobs) ? { productionJobs: normalizedJobs } : {})
        };
      });

      const savedPrinterId = isEditMode
        ? normalizedDetails[0]?.printerId || configuredPrinterId
        : configuredPrinterId;
      const savedPrinterName = isEditMode
        ? normalizedDetails[0]?.printerName || configuredPrinterName
        : configuredPrinterName;

      const projectPayload = {
        ...data,
        printerId: savedPrinterId,
        printerName: savedPrinterName,
        originalPrinterId: savedPrinterId,
        originalPrinterName: savedPrinterName,
        isTemporaryPrinter: false,
        ...(normalizedDetails.length > 0 ? { projectDetails: normalizedDetails } : {}),
        source: isAdmin && isAdminView ? 'admin-estimate' : 'customer-estimate',
        listingType: 'estimate',
        totals: nextTotals,
        originalTotals: nextTotals,
        ...(Object.keys(draftRates || {}).length > 0
          ? { rates: draftRates }
          : data?.rates !== undefined
            ? { rates: data.rates }
            : {})
      };

      if (onFinalConfirm && (isEditMode || isInventoryMode)) {
        onFinalConfirm(projectPayload);
      } else if (isAdmin && isAdminView) {
        // PUBLISH AS BLUEPRINT
        await publishBlueprint(projectPayload);
        onReset(); // Close calculator
      } else {
        const store = useStore.getState();
        await store.addProjectToVault(projectPayload);
        onReset(); // Close calculator
      }
    } catch (e) {
      console.error(e);
      alert(e.message || "Error saving project.");
    } finally {
      setIsSaving(false);
    }
  };

  const checklist = useMemo(() => {
    const allExtras = data?.extras || [];
    const sourceDetails = Array.isArray(data?.projectDetails) ? data.projectDetails : [];
    const includedDetailIds = new Set(sourceDetails.filter((detail) => detail?.included !== false).map((detail) => String(detail?.id)).filter(Boolean));
    const includedAssignmentKeys = new Set();
    sourceDetails.forEach((detail, detailIndex) => {
      if (detail?.included === false) return;
      [detailIndex, detail?.id].forEach((key) => {
        if (key !== undefined && key !== null) includedAssignmentKeys.add(String(key));
      });
      (Array.isArray(detail?.productionJobs) ? detail.productionJobs : [])
        .filter((job) => job?.included !== false)
        .forEach((job) => {
          [job?.id, job?.parentId, ...(Array.isArray(job?.parentIds) ? job.parentIds.filter((key) => includedDetailIds.has(String(key))) : [])].forEach((key) => {
            if (key !== undefined && key !== null) includedAssignmentKeys.add(String(key));
          });
        });
    });
    const getIncludedAssignmentEntries = (extra) => Object.entries(extra?.assignments || {})
      .filter(([key, value]) => includedAssignmentKeys.has(String(key)) && Number(value) > 0);
    const countHardware = (keys) => allExtras
      .filter((extra) => keys.some((key) => (extra?.name || '').toLowerCase().includes(key)))
      .reduce((sum, extra) => sum + getIncludedAssignmentEntries(extra).reduce((a, [, value]) => a + Number(value), 0), 0);

    const materials = (totals.details?.filament || [])
      .filter((section) => section.title === 'Usage Details')
      .flatMap((section) => section.items || [])
      .filter((item) => Number(item.weight) > 0)
      .map((item) => ({
        label: [item.material?.brand, item.material?.type, item.material?.colorName || item.material?.color]
          .filter(Boolean)
          .join(' ') || item.label,
        quantity: Number(item.weight)
      }));

    const extras = allExtras
      .map((extra) => ({
        label: extra?.name || 'Extra',
        quantity: getIncludedAssignmentEntries(extra).reduce((sum, [, value]) => sum + Number(value || 0), 0)
      }))
      .filter((extra) => extra.quantity > 0);

    // Count the actual printer assignments used by each build plate/model.
    // Production jobs are used when available so projects with different
    // printers per plate/model are represented separately.
    const printerGroups = new Map();
    sourceDetails.forEach((detail, detailIndex) => {
      if (detail?.included === false) return;
      const jobs = Array.isArray(detail?.productionJobs) && detail.productionJobs.length > 0
        ? detail.productionJobs.filter((job) => job?.included !== false)
        : [detail];

      jobs.forEach((job, jobIndex) => {
        const printerId = job?.printerId
          || detail?.printerId
          || job?.originalPrinterId
          || detail?.originalPrinterId
          || data?.printerId
          || data?.originalPrinterId
          || null;
        const printerName = job?.printerName
          || job?.printer?.name
          || [job?.printer?.brand, job?.printer?.model].filter(Boolean).join(' ')
          || detail?.printerName
          || detail?.originalPrinterName
          || data?.printerName
          || data?.originalPrinterName
          || (activePrinter ? [activePrinter.brand, activePrinter.model || activePrinter.name].filter(Boolean).join(' ') : '')
          || 'No printer assigned';
        const groupKey = printerId ? String(printerId) : printerName;
        const assignmentId = job?.id || detail?.id || `${detailIndex}-${jobIndex}`;

        if (!printerGroups.has(groupKey)) {
          printerGroups.set(groupKey, {
            label: printerName,
            assignmentIds: new Set()
          });
        }
        printerGroups.get(groupKey).assignmentIds.add(String(assignmentId));
      });
    });

    const printers = Array.from(printerGroups.values()).map((printer) => ({
      label: printer.label,
      quantity: printer.assignmentIds.size,
      unitLabel: isStlProject
        ? (printer.assignmentIds.size === 1 ? 'Model' : 'Models')
        : (printer.assignmentIds.size === 1 ? 'Build Plate' : 'Build Plates')
    }));

    return {
      printers,
      materials,
      extras,
      magnets: countHardware(['magnet']),
      heatsets: countHardware(['heatset'])
    };
  }, [activePrinter, data, isStlProject, totals.details?.filament]) || {};

  const footerActions = (
    <div className="fixed left-1/2 bottom-0 md:bottom-[5dvh] z-[260] w-full max-w-[calc(100vw-2rem)] md:max-w-2xl lg:max-w-2xl -translate-x-1/2 px-3 pb-5 pt-8 lg:rounded-b-[2rem]">
      <div className="flex items-center gap-3 bg-[var(--color-bg)]/90 backdrop-blur-xl p-2 rounded-[2.5rem] border border-black/5 dark:border-white/5 shadow-2xl">
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
          onClick={handleMainAction}
          disabled={isSaving}
          className="flex-1 h-14 rounded-[2.2rem] font-black italic uppercase tracking-[0.2em] text-[14px] bg-[var(--color-primary)] text-white shadow-xl flex items-center justify-center gap-4 group active:scale-95 transition-all disabled:opacity-50"
        >
          {isSaving ? (
            <RefreshCw size={18} className="animate-spin" />
          ) : isEditMode && isInventoryMode ? (
            <><Check size={18} strokeWidth={3} /> CONFIRM</>
          ) : (
            <>
              SAVE ESTIMATE
              <div className="p-1 rounded-full bg-white/20 group-hover:translate-x-1 transition-transform">
                <Check size={12} strokeWidth={4} />
              </div>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full min-h-[calc(100dvh-210px)] lg:min-h-[calc(90dvh-210px)] flex flex-col gap-4 pb-[160px] sm:pb-32 md:pb-32 lg:pb-32 px-4 overflow-x-hidden">
      <style>{`
        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type=number] {
          -moz-appearance: textfield;
        }
      `}</style>
      {/* HEADER METADATA */}
      {data.projectName && (
        <div className="px-2 mb-2 flex items-center gap-2">
           <Tag size={12} className="text-blue-600" />
           <span className="text-[13px] font-black uppercase italic text-[var(--color-text-main)] opacity-60">
             {data.projectName}
           </span>
        </div>
      )}

      <div className="w-full max-w-2xl mx-auto bg-blue-600 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl mt-4">
        <Receipt size={120} className="absolute -right-6 -bottom-6 opacity-20 rotate-12" />
        <span className="text-[13px] font-black uppercase tracking-[0.3em] opacity-60">
          {isStlProject ? 'Project Estimated Cost' : 'Project Exact Cost'}
        </span>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-[20px] font-black opacity-40">₱</span>
          <span className="preserve-print-size text-[48px] font-black italic tracking-tighter leading-none" style={{ '--preserve-size': '48px' }}>{basePriceAmount.toLocaleString()}</span>
        </div>
        
        {data.projectDetails?.length === 1 && data.projectDetails[0].quantity > 1 && (
            <div className="mt-1 opacity-70">
                <span className="text-[13px] font-black uppercase tracking-[0.2em]">₱{(basePriceAmount / Math.max(1, data.projectDetails[0].quantity)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} / piece</span>
            </div>
        )}

        {isUsingAvailabilityFallback && (
          <div className="mt-3 pt-3 border-t border-white/20 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[12px] font-black uppercase tracking-wider text-amber-300">
              <Zap size={14} fill="currentColor" />
              <span>Recomputed for Current Machine Availability</span>
            </div>
            <p className="text-[11px] font-medium text-white/90 normal-case tracking-normal leading-relaxed">
              Calculated using available printer <span className="font-black italic uppercase text-white">{activePrinter?.brand} {activePrinter?.model || activePrinter?.name}</span>. The original configured setup will be preserved upon saving.
            </p>
          </div>
        )}

        {isStlProject && !isUsingAvailabilityFallback && (
          <div className="mt-2 text-[13px] font-black uppercase tracking-widest opacity-60">
            This may change after project setup*
          </div>
        )}
      </div>

      <div className="w-full max-w-2xl mx-auto bg-neutral-900 dark:bg-[var(--color-surface)] rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-xl">
        <Wallet size={120} className="absolute -right-6 -bottom-6 opacity-10 -rotate-12" />
        <span className="text-[13px] font-black uppercase tracking-[0.3em] text-blue-500">Downpayment</span>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-[20px] font-black opacity-20">₱</span>
          <span className="preserve-print-size text-[48px] font-black italic tracking-tighter leading-none" style={{ '--preserve-size': '48px' }}>{totals.dp || '0'}</span>
        </div>
      </div>

      <div className="w-full max-w-2xl mx-auto bg-[var(--color-bg)] rounded-[2.5rem] p-7 border border-[var(--color-border)] space-y-5 text-left">
        <div className="flex justify-between items-center text-left">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500 rounded-xl bg-opacity-10 text-blue-600"><ListChecks size={20} /></div>
            <div>
              <span className="text-[13px] font-black uppercase opacity-40 block tracking-widest">Requirements</span>
              <span className="text-[15px] font-black dark:text-white uppercase tracking-tight">Project Checklist</span>
            </div>
          </div>
          <div className="text-right">
            <span className="preserve-print-size text-[32px] font-black italic text-blue-600 leading-none" style={{ '--preserve-size': '32px' }}>{totals.timeline?.days || 0}</span>
            <span className="preserve-print-size text-[13px] font-black uppercase opacity-40 block tracking-widest" style={{ '--preserve-size': '13px' }}>Days</span>
          </div>
        </div>

        <div className="space-y-2">
          {checklist?.printers?.map((printer, index) => (
            <div key={`printer-${printer.label}-${index}`} className="flex items-center justify-between w-full bg-[var(--color-surface)] px-4 py-2.5 rounded-2xl border border-[var(--color-border)]">
              <div className="flex items-center gap-2 min-w-0">
                <Printer size={18} strokeWidth={2} className="text-blue-500 flex-none" />
                <div className="min-w-0">
                  <span className="text-[13px] font-black uppercase opacity-80 truncate block">{printer.label}</span>
                </div>
              </div>
              <span className="text-[13px] font-black text-blue-600 italic uppercase whitespace-nowrap">
                {printer.quantity} {printer.unitLabel}
              </span>
            </div>
          ))}
          {checklist?.materials?.map((material, index) => (
            <div key={`material-${material.label}-${index}`} className="flex items-center justify-between w-full bg-[var(--color-surface)] px-4 py-2.5 rounded-2xl border border-[var(--color-border)]">
              <div className="flex items-center gap-2 min-w-0">
                <Disc3 size={18} strokeWidth={2} className="text-emerald-500 flex-none" />
                <span className="text-[13px] font-black uppercase opacity-80 truncate">{material.label} FILAMENT</span>
              </div>
              <span className="text-[13px] font-black text-emerald-600 italic uppercase whitespace-nowrap">
                {material.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}G
              </span>
            </div>
          ))}
          {checklist?.extras?.map((extra, index) => (
            <div key={`extra-${extra.label}-${index}`} className="flex items-center justify-between w-full bg-[var(--color-surface)] px-4 py-2.5 rounded-2xl border border-[var(--color-border)]">
              <div className="flex items-center gap-2 min-w-0">
                <Tag size={14} className="text-orange-500 flex-none" />
                <span className="text-[13px] font-black uppercase opacity-80 truncate">{extra.label}</span>
              </div>
              <span className="text-[13px] font-black text-orange-600 italic uppercase whitespace-nowrap">
                {extra.quantity} {extra.quantity === 1 ? 'PC' : 'PCS'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {isAdmin && (
        <div className="w-full max-w-2xl mx-auto flex gap-1 p-1 bg-[var(--color-bg)] rounded-2xl mb-6 border border-[var(--color-border)]">
          {[
            { id: 'plan', label: 'Plan', icon: Clock },
            { id: 'cost', label: 'Cost', icon: Coins },
            { id: 'rates', label: 'Rates', icon: SlidersHorizontal }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-black uppercase tracking-widest transition-all ${
                activeTab === tab.id
                  ? 'bg-[var(--color-surface)] shadow-sm text-blue-600'
                  : 'opacity-40 hover:opacity-100'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Calculation Engine */}
      <div className={isAdmin ? "block" : "hidden"}>
        <div className={activeTab === 'cost' ? 'block' : 'hidden'} aria-hidden={activeTab !== 'cost'}>
          <CostBreakdown
            data={data}
            activePrinter={activePrinter}
            dbSettings={dbSettings}
            onCalculate={handleCalculationUpdate}
            isInventoryMode={isInventoryMode}
          />
        </div>

        {activeTab === 'rates' && (
          <div className="space-y-4 px-2">
            {hasPendingRateChanges && (
              <div className="w-full max-w-2xl mx-auto sticky top-2 z-20 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCancelRateChanges}
                  className="flex items-center gap-2 px-4 py-3 rounded-full bg-neutral-900 dark:bg-[var(--color-surface)] text-white text-[13px] font-black uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all"
                >
                  <X size={14} strokeWidth={3} />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveRates}
                  className="flex items-center gap-2 px-4 py-3 rounded-full bg-blue-600 text-white text-[13px] font-black uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all"
                >
                  <span className="min-w-5 h-5 px-1 rounded-full bg-white/20 flex items-center justify-center text-[13px]">
                    {changedRateCount}
                  </span>
                  <Save size={14} strokeWidth={3} />
                  Save Rates
                </button>
              </div>
            )}
            {RATE_SECTIONS.map((section) => {
              const sectionRates = draftRates?.[section.id] || storeRates?.[section.id] || {};
              const sectionHasChanges = section.fields.some((field) => (
                (sectionRates[field.key] ?? '') !== ((storeRates?.[section.id] || {})[field.key] ?? '')
              ));
              return (
                <div key={section.id} className="w-full max-w-2xl mx-auto bg-[var(--color-bg)] rounded-[2rem] p-4 border border-[var(--color-border)] space-y-3">
                  <div className="px-2 flex items-center justify-between gap-3">
                    <span className="text-[13px] font-black uppercase tracking-[0.2em] opacity-40">{section.title}</span>
                    {sectionHasChanges && (
                      <button
                        type="button"
                        onClick={() => handleResetSectionDraft(section.id)}
                        className="w-9 h-9 rounded-full flex items-center justify-center bg-neutral-900 dark:bg-[var(--color-surface)] text-white active:scale-95 transition-all"
                      >
                        <Undo2 size={14} strokeWidth={3} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-left">
                    {section.fields.map((field) => {
                        const sourceValue = storeRates?.[section.id]?.[field.key];
                        const draftValue = sectionRates[field.key] ?? sourceValue ?? field.defaultValue ?? '';
                        let trend = null;
                        if (field.type === 'number' && draftValue !== '' && sourceValue !== undefined && draftValue !== sourceValue) {
                          trend = Number(draftValue) > Number(sourceValue) ? 'up' : 'down';
                        }
                        return (
                          <RateInput
                            key={`${section.id}-${field.key}`}
                            label={field.label}
                            value={draftValue}
                            unit={field.unit}
                            type={field.type}
                            trend={trend}
                            onChange={(value) => handleRateDraftChange(section.id, field.key, value)}
                          />
                        );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'plan' && (
          <ProductionPlan schedule={totals.timeline?.schedule || []} projectCase={data?.method?.name} />
        )}
      </div>

      {!isAdmin && (
        <div className="hidden">
          <CostBreakdown
            data={data}
            activePrinter={activePrinter}
            dbSettings={dbSettings}
            onCalculate={handleCalculationUpdate}
            isInventoryMode={isInventoryMode}
          />
          </div>
      )}

      {footerActions}
    </div>
  );
}
