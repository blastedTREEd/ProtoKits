import React, { useState, useCallback, useMemo } from 'react';
import {
  Receipt, Wallet, ArrowLeft, RotateCcw, Magnet, Spool,
  Droplet, ListChecks, Clock, Coins, SlidersHorizontal,
  Save, ShoppingBag, TrendingUp, TrendingDown, Undo2, X, Tag, RefreshCw
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useNavigate } from 'react-router-dom';
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
      { key: 'installationCost', label: 'Hardware Install', unit: '₱/pc', type: 'number' },
      { key: 'filamentHandlingCost', label: 'Filament Change', unit: '₱/event', type: 'number' },
      { key: 'monitoringRate', label: 'Monitoring', unit: '%', type: 'number' },
      { key: 'preparationRatePerFile', label: 'Prep Per File', unit: 'min', type: 'number' },
      { key: 'printStartTime', label: 'Print Start', unit: 'hr', type: 'number' },
      { key: 'supportRemovalRatePerModel', label: 'Support Removal', unit: 'min', type: 'number' }
    ]
  },
  {
    id: 'extra-cost',
    title: 'Extras',
    fields: [
      { key: 'clientShareRate', label: 'Client Share', unit: '%', type: 'number' },
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
      { key: 'rateAsOf', label: 'Rate As Of', unit: '', type: 'text' }
    ]
  },
  {
    id: 'maintenance-cost',
    title: 'Maintenance',
    fields: [
      { key: 'estimationFixedCost', label: 'Fixed Cost', unit: '₱', type: 'number' },
      { key: 'mSolderRate', label: 'Iron Tip Wear', unit: '₱/hr', type: 'number' },
      { key: 'maintenanceRate', label: 'Printer Wear', unit: '₱/hr', type: 'number' }
    ]
  },
  {
    id: 'print-cost',
    title: 'Print',
    fields: [
      { key: 'markupRate', label: 'Markup', unit: '%', type: 'number' },
      { key: 'reprintRate', label: 'Reprint Rate', unit: '%', type: 'number' }
    ]
  }
];

const RateInput = ({ label, value, unit, type, onChange, trend }) => (
  <div className="bg-white dark:bg-zinc-900 border border-black/5 p-5 rounded-3xl shadow-sm flex flex-col justify-between min-h-[90px]">
    <div className="flex items-center justify-between gap-2 mb-2">
      <label className="text-[10px] font-black uppercase tracking-widest opacity-40 block">{label}</label>
      {trend === 'up' && <TrendingUp size={12} className="text-emerald-500 flex-shrink-0" strokeWidth={3} />}
      {trend === 'down' && <TrendingDown size={12} className="text-rose-500 flex-shrink-0" strokeWidth={3} />}
    </div>
    <div className="flex items-baseline gap-1">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value)}
        className="bg-transparent text-[18px] font-black text-blue-600 w-full outline-none"
      />
      <span className="text-[10px] font-bold opacity-30 whitespace-nowrap">{unit}</span>
    </div>
  </div>
);

export default function ProjectCost({ data, onBack, onReset, activePrinter, dbSettings, onUpdateSettings, isEditMode, onFinalConfirm }) {
  const navigate = useNavigate();
  const isAdmin = useStore((state) => state.isAdmin);
  const addProjectToBasket = useStore((state) => state.addProjectToBasket);
  const addProjectToVault = useStore((state) => state.addProjectToVault);
  
  const [activeTab, setActiveTab] = useState('cost');
  const storeRates = useStore((state) => state.rates);
  const [draftRates, setDraftRates] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [totals, setTotals] = useState({
    total: '0',
    dp: '0',
    timeline: { days: 0, schedule: [] }
  });

  const is3MF = data.method?.name === '3MF';

  const handleCalculationUpdate = useCallback((computed) => {
    if (computed) setTotals(computed);
  }, []);

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

  const handleSaveRates = useCallback(() => {
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
        onUpdateSettings(section.id, patch);
      }
    });
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

  const handleMainAction = async () => {
    if (!totals?.timeline) return;
    setIsSaving(true);
    try {
      const projectPayload = {
        ...data,
        totals: {
          total: totals.total || '0',
          dp: totals.dp || '0',
          days: totals.timeline?.days || 0
        }
      };

      if (is3MF) {
        // ADD TO BASKET
        await addProjectToBasket(projectPayload);
        navigate('/basket');
      } else {
        // SAVE TO VAULT
        await addProjectToVault(projectPayload);
        onReset(); // Close calculator and go back to idle grid
      }
    } catch (e) {
      console.error(e);
      alert("Error saving project.");
    } finally {
      setIsSaving(false);
    }
  };

  const checklist = useMemo(() => {
    const schedule = totals.timeline?.schedule || [];
    const filCounts = {};
    schedule.forEach((day) => {
      day.plates?.forEach((plate) => {
        if (plate.filament && plate.filament !== 'Manual Work') {
          filCounts[plate.filament] = (filCounts[plate.filament] || 0) + 1;
        }
      });
    });

    const allExtras = data?.extras || [];
    const countHardware = (keys) => allExtras
      .filter((extra) => keys.some((key) => (extra?.name || '').toLowerCase().includes(key)))
      .reduce((sum, extra) => sum + Object.values(extra.assignments || {}).reduce((a, b) => a + Number(b), 0), 0);

    return {
      filamentPlateCounts: filCounts,
      magnets: countHardware(['magnet']),
      heatsets: countHardware(['heatset'])
    };
  }, [totals.timeline?.schedule, data?.extras]);

  return (
    <div className="w-full space-y-4 pb-24 max-w-lg mx-auto px-4 overflow-x-hidden">
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
           <Tag size={12} className="text-[var(--color-primary)]" />
           <span className="text-[11px] font-black uppercase italic text-[var(--color-text-main)] opacity-60">
             {data.projectName}
           </span>
        </div>
      )}

      <div className="bg-[var(--color-primary)] rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl mt-4">
        <Receipt size={120} className="absolute -right-6 -bottom-6 opacity-20 rotate-12" />
        <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">Grand Total</span>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-[20px] font-black opacity-40">₱</span>
          <span className="text-[48px] font-black italic tracking-tighter leading-none">{totals.total || '0'}</span>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-xl">
        <Wallet size={120} className="absolute -right-6 -bottom-6 opacity-10 -rotate-12" />
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--color-primary)]">Downpayment</span>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-[20px] font-black opacity-20">₱</span>
          <span className="text-[48px] font-black italic tracking-tighter leading-none">{totals.dp || '0'}</span>
        </div>
      </div>

      <div className="bg-zinc-100 dark:bg-zinc-800/50 rounded-[2.5rem] p-7 border border-black/5 space-y-5 text-left">
        <div className="flex justify-between items-center text-left">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500 rounded-xl bg-opacity-10 text-blue-600"><ListChecks size={20} /></div>
            <div>
              <span className="text-[10px] font-black uppercase opacity-40 block tracking-widest">Requirements</span>
              <span className="text-[14px] font-black dark:text-white uppercase tracking-tight">Project Checklist</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[32px] font-black italic text-blue-600 leading-none">{totals.timeline?.days || 0}</span>
            <span className="text-[10px] font-black uppercase opacity-40 block tracking-widest">Days</span>
          </div>
        </div>

        <div className="space-y-2">
          {Object.entries(checklist.filamentPlateCounts).map(([name, count]) => (
            <div key={name} className="flex items-center justify-between w-full bg-white dark:bg-white/5 px-4 py-2.5 rounded-2xl border border-black/5">
              <div className="flex items-center gap-2">
                <Droplet size={14} className="text-blue-500" />
                <span className="text-[11px] font-black uppercase opacity-80">{name}</span>
              </div>
              <span className="text-[11px] font-black text-blue-600 italic uppercase">
                {count} {count === 1 ? 'Build Plate' : 'Build Plates'}
              </span>
            </div>
          ))}
          {(checklist.magnets > 0 || checklist.heatsets > 0) && (
            <div className="flex gap-2 w-full pt-1">
              {checklist.magnets > 0 && (
                <div className="flex-1 flex items-center gap-2 bg-white dark:bg-zinc-900/50 px-4 py-3 rounded-2xl border border-black/5 shadow-sm">
                  <Magnet size={14} className="text-purple-500" />
                  <span className="text-[11px] font-black uppercase opacity-80">{checklist.magnets} Magnets</span>
                </div>
              )}
              {checklist.heatsets > 0 && (
                <div className="flex-1 flex items-center gap-2 bg-white dark:bg-zinc-900/50 px-4 py-3 rounded-2xl border border-black/5 shadow-sm">
                  <Spool size={14} className="text-orange-500" />
                  <span className="text-[11px] font-black uppercase opacity-80">{checklist.heatsets} Heatsets</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-2xl mb-6 mx-2 border border-black/5">
          {[
            { id: 'plan', label: 'Plan', icon: Clock },
            { id: 'cost', label: 'Cost', icon: Coins },
            { id: 'rates', label: 'Rates', icon: SlidersHorizontal }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-zinc-900 shadow-sm text-blue-600'
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
        <div className={activeTab === 'cost' ? 'block' : 'hidden'}>
          <CostBreakdown
            data={data}
            activePrinter={activePrinter}
            dbSettings={dbSettings}
            onCalculate={handleCalculationUpdate}
          />
        </div>

        {activeTab === 'rates' && (
          <div className="space-y-4 px-2">
            {hasPendingRateChanges && (
              <div className="sticky top-2 z-20 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCancelRateChanges}
                  className="flex items-center gap-2 px-4 py-3 rounded-full bg-zinc-900/90 text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all"
                >
                  <X size={14} strokeWidth={3} />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveRates}
                  className="flex items-center gap-2 px-4 py-3 rounded-full bg-[var(--color-primary)] text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all"
                >
                  <span className="min-w-5 h-5 px-1 rounded-full bg-white/20 flex items-center justify-center text-[9px]">
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
                <div key={section.id} className="bg-zinc-100 dark:bg-zinc-800/50 rounded-[2rem] p-4 border border-black/5 space-y-3">
                  <div className="px-2 flex items-center justify-between gap-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">{section.title}</span>
                    {sectionHasChanges && (
                      <button
                        type="button"
                        onClick={() => handleResetSectionDraft(section.id)}
                        className="w-9 h-9 rounded-full flex items-center justify-center bg-zinc-900/80 text-white active:scale-95 transition-all"
                      >
                        <Undo2 size={14} strokeWidth={3} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-left">
                    {section.fields.map((field) => {
                        const sourceValue = storeRates?.[section.id]?.[field.key];
                        const draftValue = sectionRates[field.key] ?? sourceValue ?? '';
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
          />
        </div>
      )}

      <div className="flex gap-4 pt-10 px-1 pb-10">
        <button 
          onClick={onBack} 
          disabled={isSaving}
          className="flex-1 py-5 rounded-full bg-zinc-800 text-white font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
        >
          <ArrowLeft size={18} strokeWidth={3} /> BACK
        </button>
        
        <div className="flex-[2] flex gap-2">
           <button 
              onClick={onReset} 
              disabled={isSaving}
              className="w-16 py-5 rounded-full bg-red-600/10 border border-red-600/20 text-red-600 flex items-center justify-center active:scale-95 transition-all disabled:opacity-50"
           >
              <RotateCcw size={18} strokeWidth={3} />
           </button>
           
           <button 
              onClick={handleMainAction} 
              disabled={isSaving || !data.projectName || !data.gdriveLink}
              className={`flex-1 py-5 rounded-full font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all disabled:opacity-50 ${
                is3MF 
                ? 'bg-blue-600 text-white shadow-blue-600/20' 
                : 'bg-emerald-600 text-white shadow-emerald-600/20'
              }`}
           >
              {isSaving ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : is3MF ? (
                <><ShoppingBag size={18} /> ADD TO BASKET</>
              ) : (
                <><Save size={18} /> SAVE TO VAULT</>
              )}
           </button>
        </div>
      </div>
      
      {(!data.projectName || !data.gdriveLink) && (
        <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 animate-pulse">
           Project Name & GDrive Link Required to Save
        </p>
      )}
    </div>
  );
}
