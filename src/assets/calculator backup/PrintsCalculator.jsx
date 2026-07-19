import React, { useState, useEffect, useMemo, useCallback } from 'react'; 
import { useStore } from '../../store/useStore'; 
import CaseSelection from './CaseSelection'; 
import PrinterSelection from './PrinterSelection';
import FilamentSelection from './FilamentSelection'; 
import ProjectDetails from './ProjectDetails'; 
import ExtrasSelection from './ExtrasSelection';
import ProjectCost from './ProjectCost';

const HistoryItem = ({ value, showSeparator, delay = 0, isError = false }) => {
  if (!value || value === 'null') return null;
  return (
    <div className="flex items-center gap-1 animate-in zoom-in duration-300 flex-shrink-0" style={{ animationDelay: `${delay}ms` }}>
      <span className={`text-[10px] font-black px-1.5 py-1 rounded uppercase tracking-widest border transition-all duration-300 whitespace-nowrap ${
        isError 
        ? 'bg-red-500 text-white border-red-600 animate-pulse shadow-lg shadow-red-500/20' 
        : 'bg-[var(--color-primary)]/5 text-[var(--color-text-main)] border-[var(--color-primary)]/10'
      }`}>
        {value}
      </span>
      {showSeparator && <div className="w-0.5 h-0.5 bg-[var(--color-border)] rounded-full opacity-20 flex-shrink-0" />}
    </div>
  );
};

export default function PrintsCalculator({ 
  onExit, 
  BrandLogo, 
  initialData = null, 
  isEditMode = false, 
  onConfirmEdit = null 
}) {
  // If initialData is provided, we start at the Details step (Step 3)
  const [activeStep, setActiveStep] = useState(initialData ? 3 : 0);
  const { filamentInventory, extras, fetchInitialData, settings, updateSettings } = useStore();
  
  const [displayUnit, setDisplayUnit] = useState(initialData?.unit || 'mm');
  const [previewData, setPreviewData] = useState(initialData?.projectDetails && initialData.method?.name === '3MF' ? initialData.projectDetails : []);
  const [prepareData, setPrepareData] = useState(initialData?.projectDetails && initialData.method?.name === 'STL' ? initialData.projectDetails : []);

  const [calculatorData, setCalculatorData] = useState(initialData || {
    method: null, 
    printer: null,
    filaments: [], 
    projectDetails: null,
    extras: [],
    projectName: '', // 🔥 NEW
    gdriveLink: '', // 🔥 NEW
  });

  useEffect(() => {
    if (!isEditMode && (!window.history.state || window.history.state.step === undefined)) {
      window.history.replaceState({ step: 0 }, '');
    }
  }, [isEditMode]);

  useEffect(() => {
    if (isEditMode) return; // Disable browser back for modal edit mode

    const handlePopState = (event) => {
      const incomingStep = event.state?.step;
      if (typeof incomingStep === 'number') {
        setActiveStep(incomingStep);
      } 
      else {
        onExit();
        window.history.replaceState(null, '');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onExit, activeStep, isEditMode]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const combinedFilaments = useMemo(() => {
    if (!filamentInventory) return calculatorData.filaments;
    const selectedIds = new Set(calculatorData.filaments.map(f => f.id));
    const others = filamentInventory.filter(f => !selectedIds.has(f.id));
    return [...calculatorData.filaments, ...others];
  }, [calculatorData.filaments, filamentInventory]);

  const navigateToStep = useCallback((step) => {
    setActiveStep(step);
    if (!isEditMode) window.history.pushState({ step }, '');
  }, [isEditMode]);

  const updateData = (newData, targetStep = null) => {
    const updated = { ...calculatorData, ...newData };
    setCalculatorData(updated);
    
    // If in edit mode and we just "confirmed" the project details or costs
    if (isEditMode && onConfirmEdit && targetStep === 4) {
       // We keep going if they want to edit extras, or we can just confirm here.
       // Usually, confirming Step 5 (Cost) is the real "Finalize"
    }

    const nextStep = targetStep !== null ? targetStep : activeStep + 1;
    navigateToStep(nextStep);
  };

  const handleFinalConfirm = (finalTotals) => {
    if (isEditMode && onConfirmEdit) {
      onConfirmEdit({ ...calculatorData, totals: finalTotals });
    }
  };

  const handleToggleExtra = useCallback((extra) => {
    setCalculatorData(prev => {
      const existingIdx = prev.extras.findIndex(e => String(e.id) === String(extra.id));
      let newExtras = [...prev.extras];
      if (existingIdx > -1) {
        newExtras[existingIdx] = {
          ...newExtras[existingIdx],
          ...extra,
          assignments: newExtras[existingIdx].assignments || {} 
        };
      } else {
        newExtras.push({ ...extra, assignments: {} });
      }
      return { ...prev, extras: newExtras };
    });
  }, []);

  const handleUpdateExtraQty = useCallback((extraId, qty, itemIdx) => {
    setCalculatorData(prev => {
      const newExtras = prev.extras.map(extra => {
        if (String(extra.id) === String(extraId)) {
          return {
            ...extra,
            assignments: { ...(extra.assignments || {}), [itemIdx]: parseInt(qty) || 0 }
          };
        }
        return extra;
      });
      return { ...prev, extras: newExtras };
    });
  }, []);

  const dbSettingsObject = useMemo(() => {
    const defaultVal = { electricityRate: 14, expectedIncrease: 0 };
    if (!settings) return defaultVal;
    if (!Array.isArray(settings)) {
      return settings['electricity-cost'] || defaultVal;
    }
    return settings.find(s => s.id === "electricity-cost") || settings[0] || defaultVal;
  }, [settings]);

  const formatValue = useCallback((num, unit) => {
    if (unit === 'cm') return (num / 10).toFixed(1).replace(/\.?0+$/, '');
    if (unit === 'in') return (num / 25.4).toFixed(2).replace(/\.?0+$/, '');
    return num; 
  }, []);

  const getPrinterHistoryValue = () => {
    const printer = calculatorData.printer;
    if (!printer) return null;
    if (calculatorData.method?.name === '3MF') return printer.model || printer.name;
    const x = printer.buildCapacity?.x ?? 256;
    const y = printer.buildCapacity?.y ?? 256;
    const z = printer.buildCapacity?.z ?? 256;
    return `${[x, y, z].map(d => formatValue(d, displayUnit)).join('×')} ${displayUnit.toUpperCase()}`;
  };

  const STEP_CONFIG = {
    0: { title: "Select", accent: "Case" },
    1: { title: "Select", accent: "Printer" },
    2: { title: "Select", accent: "Filament" },
    3: { title: "Enter", accent: "Details" },
    4: { title: "Add", accent: "Extras" },
    5: { title: "Project", accent: "Cost" }
  };

  return (
    <div className="w-full prints-calculator-container animate-in fade-in zoom-in-95 duration-500 px-2 pb-10 text-[var(--color-text-main)]">
      <div className="flex justify-between items-center mt-2 mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => activeStep > 0 ? (isEditMode ? setActiveStep(prev => prev - 1) : window.history.back()) : onExit()} className="active:scale-90 transition-all">
            {BrandLogo ? <BrandLogo size="w-11 h-11" /> : <div className="w-11 h-11 bg-[var(--color-primary)] rounded-full" />}
          </button>
          <h1 className="text-[18px] font-black italic tracking-tighter uppercase">
            {STEP_CONFIG[activeStep]?.title} <span className="text-[var(--color-primary)]">{STEP_CONFIG[activeStep]?.accent}</span>
          </h1>
        </div>
        <button onClick={onExit} className="p-2 bg-black border border-white/10 rounded-full text-white active:scale-90 transition-all">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex gap-1.5 h-1.5 w-full mb-4 px-1">
        {[...Array(6)].map((_, i) => (
          <div key={i} className={`h-full rounded-full transition-all duration-700 ${i <= activeStep ? 'bg-[var(--color-primary)] flex-[2.5]' : 'bg-white/10 flex-1'}`} />
        ))}
      </div>

      <div className="flex items-center gap-1 mb-6 min-h-[24px] overflow-x-auto no-scrollbar flex-nowrap px-1">
        <HistoryItem value={calculatorData.method?.name} showSeparator={activeStep > 0} />
        <HistoryItem value={getPrinterHistoryValue()} showSeparator={activeStep > 1} delay={75} />
        <HistoryItem value={calculatorData.filaments?.length > 0 ? `${calculatorData.filaments.length} MATS` : null} showSeparator={activeStep > 2} delay={150} />
        <HistoryItem value={calculatorData.extras?.length > 0 ? `+${calculatorData.extras.length} EXT` : null} showSeparator={activeStep > 3} delay={225} />
      </div>

      <div className="min-h-[400px]">
        {activeStep === 0 && <CaseSelection onSelect={(method) => updateData({ method })} selectedCase={calculatorData.method} />}
        {activeStep === 1 && <PrinterSelection onSelect={(printer) => updateData({ printer })} selectedPrinter={calculatorData.printer} />}
        {activeStep === 2 && <FilamentSelection onSelect={(filaments) => updateData({ filaments })} selectedFilaments={calculatorData.filaments} />}
        
        {activeStep === 3 && (
          <ProjectDetails 
            allFilaments={combinedFilaments} 
            projectCase={calculatorData.method?.name}
            selectedFilaments={calculatorData.filaments.map(sel => {
              const invMatch = (filamentInventory || []).find(f => String(f.id) === String(sel.id || sel.materialId));
              return {
                ...invMatch,
                ...sel,
                remaining: parseFloat(invMatch?.remaining || invMatch?.weight || 0)
              };
            })}
            displayUnit={displayUnit}
            onUnitChange={setDisplayUnit}
            activePrinter={calculatorData.printer}
            onConfirm={(details) => updateData({ projectDetails: details }, 4)}
            onBack={() => isEditMode ? setActiveStep(2) : window.history.back()}
            
            projectDetails={calculatorData.projectDetails}
            previewData={previewData}
            setPreviewData={setPreviewData}
            prepareData={prepareData}
            setPrepareData={setPrepareData}

            // 🔥 NEW METADATA
            projectName={calculatorData.projectName}
            gdriveLink={calculatorData.gdriveLink}
            updateMetadata={(patch) => setCalculatorData(prev => ({ ...prev, ...patch }))}
          />
        )}

        {activeStep === 4 && (
          <ExtrasSelection 
            extras={extras} 
            selectedExtras={calculatorData.extras}
            onToggleExtra={handleToggleExtra}
            onUpdateQty={handleUpdateExtraQty}
            projectDetails={calculatorData.projectDetails || []} 
            projectCase={calculatorData.method?.name} 
            onProceed={() => navigateToStep(5)} 
            onBack={() => isEditMode ? setActiveStep(3) : window.history.back()}
          />
        )}

        {activeStep === 5 && (
          <ProjectCost 
            data={calculatorData} 
            activePrinter={calculatorData.printer}
            dbSettings={dbSettingsObject}
            onUpdateSettings={(rateId, patch) => updateSettings(rateId, patch)}
            onBack={() => isEditMode ? setActiveStep(4) : navigateToStep(4)}
            onReset={onExit}
            isEditMode={isEditMode}
            onFinalConfirm={handleFinalConfirm}
          />
        )}
      </div>

      {/* {!isEditMode && (
        <div className="bg-black text-green-400 text-[10px] p-3 rounded-xl mt-4 overflow-auto">
          <pre>{JSON.stringify(calculatorData, null, 2)}</pre>
        </div>
      )} */}
    </div>
  );
}
