import React, { useState, useEffect, useMemo, useCallback } from 'react'; 
import { useStore } from '../../store/useStore'; 
import CaseSelection from './CaseSelection'; 
import PrinterSelection from './PrinterSelection';
import FilamentSelection from './FilamentSelection'; 
import ProjectDetails from './ProjectDetails'; 
import ProjectPreview from './ProjectPreview';
import ProjectPrepare from './ProjectPrepare';
import ExtrasSelection from './ExtrasSelection';
import ProjectCost from './ProjectCost';
import { Astroid, X } from 'lucide-react';

const getMaterialIdFromDetail = (detail) => (
  detail?.material?.materialId
  || detail?.materialId
  || detail?.materials?.[0]?.materialId
  || detail?.productionJobs?.[0]?.materialIds?.[0]
  || detail?.material?.material?.id
  || ''
);

const getMaterialSlotsFromDetail = (detail, totalWeight = 0) => {
  const materialWeights = detail?.productionJobs?.reduce((acc, job) => {
    Object.entries(job?.materialWeights || {}).forEach(([materialId, weight]) => {
      acc[materialId] = Number(((acc[materialId] || 0) + (Number(weight) || 0)).toFixed(2));
    });
    return acc;
  }, {}) || {};

  const slots = (detail?.materials || [])
    .filter((entry) => entry?.materialId)
    .map((entry) => ({
      materialId: String(entry.materialId),
      weight: entry.shareWeight ?? materialWeights[String(entry.materialId)] ?? ''
    }));

  if (slots.length > 0) return slots;

  const materialId = getMaterialIdFromDetail(detail);
  return materialId ? [{ materialId: String(materialId), weight: totalWeight || '' }] : [];
};

const normalizePreviewDetails = (details = []) => (
  details.map((detail, index) => {
    const time = Number(detail?.sliced?.time || detail?.normalizedTime || 0);
    const breakdown = detail?.sliced?.breakdown || {};
    const totalWeight = Number(detail?.sliced?.weight || detail?.normalizedWeight || detail?.weight || 0);
    const materialSlots = getMaterialSlotsFromDetail(detail, totalWeight);
    const primaryMaterialId = materialSlots[0]?.materialId || getMaterialIdFromDetail(detail);
    const printerId = detail?.printerId || detail?.productionJobs?.[0]?.printerId || null;

    return {
      ...detail,
      id: detail?.id || Date.now() + index,
      no: detail?.no || index + 1,
      weight: totalWeight || '',
      days: (breakdown.days ?? Math.floor(time / 1440)) || '',
      hours: (breakdown.hours ?? Math.floor((time % 1440) / 60)) || '',
      mins: (breakdown.mins ?? (time % 60)) || '',
      secs: breakdown.secs ?? 0,
      colorSwaps: detail?.sliced?.colorSwaps ?? '',
      materialId: primaryMaterialId ? String(primaryMaterialId) : '',
      materialSlots,
      printerId,
      useCfs: detail?.useCfs ?? detail?.productionJobs?.some((job) => job?.usesCfs === true)
    };
  })
);

const normalizePrepareDetails = (details = []) => (
  details.map((detail, index) => {
    const config = detail?.config || {};
    const volumeTotal = detail?.volume?.total || {};
    const materialSlots = getMaterialSlotsFromDetail(detail, Number(volumeTotal.weight || detail?.sliced?.weight || 0));
    const materialIds = materialSlots.map((slot) => slot.materialId);
    const primaryMaterialId = materialIds[0] || getMaterialIdFromDetail(detail);

    const rawWalls = config.walls ?? detail?.walls ?? '';
    const rawInfill = config.infill ?? detail?.infill ?? '';
    const normalizedWalls = (rawWalls === 2 || rawWalls === '2') ? '' : rawWalls;
    const normalizedInfill = (rawInfill === 15 || rawInfill === '15') ? '' : rawInfill;

    return {
      ...detail,
      id: detail?.id || Date.now() + index,
      no: detail?.no || index + 1,
      length: config.length ?? detail?.length ?? '',
      width: config.width ?? detail?.width ?? '',
      height: config.height ?? detail?.height ?? '',
      unit: config.unit || detail?.unit || 'mm',
      walls: normalizedWalls,
      infill: normalizedInfill,
      materialId: primaryMaterialId ? String(primaryMaterialId) : '',
      materialIds: materialIds.length ? materialIds : (primaryMaterialId ? [String(primaryMaterialId)] : []),
      materialSlots,
      quantity: Number(detail?.quantity || config.quantity || 1),
      printerId: detail?.printerId || detail?.productionJobs?.[0]?.printerId || null,
      useCfs: detail?.useCfs ?? detail?.productionJobs?.some((job) => job?.usesCfs === true),
      colorSwaps: detail?.sliced?.colorSwaps ?? detail?.sliced?.filamentChangePercent ?? ''
    };
  })
);

export default function PrintsCalculator({ 
  onExit, 
  initialData = null, 
  fallbackTitle,
  isEditMode = false, 
  onConfirmEdit = null,
  isInventoryMode = false
}) {
  // If initialData is provided, we start at the Details step (Step 1)
  const [activeStep, setActiveStep] = useState(initialData ? 1 : 0);
  const { filamentInventory, extras, settings, updateSettings, orders, projectVault, isAdmin, isAdminView } = useStore();
  
  const estimationLimitReached = useMemo(() => {
    if (isAdmin && isAdminView) return false;
    const completedProjectsCount = (orders || []).filter(o => 
      o.status?.toLowerCase() === 'completed' && 
      o.items?.some(item => item.type === 'project')
    ).length;
    const limit = 3 + completedProjectsCount;
    return (projectVault || []).length >= limit;
  }, [orders, projectVault, isAdmin, isAdminView]);
  
  const [, setDisplayUnit] = useState(initialData?.unit || 'mm');
  const initialMethodName = String(initialData?.method?.name || '').toUpperCase();
  const [previewData, setPreviewData] = useState(initialData?.projectDetails && initialMethodName === '3MF' ? normalizePreviewDetails(initialData.projectDetails) : []);
  const [prepareData, setPrepareData] = useState(initialData?.projectDetails && initialMethodName === 'STL' ? normalizePrepareDetails(initialData.projectDetails) : []);

  const [calculatorData, setCalculatorData] = useState(initialData || {
    method: null, 
    printer: null,
    filaments: [], 
    projectDetails: null,
    extras: [],
    projectName: '', // 🔥 NEW
    gdriveLink: '', // 🔥 NEW
  });
  const isUnnamedProjectName = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return !normalized || normalized === 'unnamed project';
  };
  const rawModifyingProjectName = calculatorData?.projectName || initialData?.projectName || '';
  const modifyingProjectName = isUnnamedProjectName(rawModifyingProjectName)
    ? (fallbackTitle || 'PROJECT #')
    : rawModifyingProjectName.trim();

  useEffect(() => {
    if (!isEditMode && (!window.history.state || window.history.state.step === undefined)) {
      window.history.replaceState({ step: 0 }, '');
    }
  }, [isEditMode]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onExit]);

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

  const combinedFilaments = useMemo(() => {
    if (!filamentInventory) return calculatorData.filaments || [];
    const selectedIds = new Set((calculatorData.filaments || []).map(f => f.id));
    const others = filamentInventory.filter(f => !selectedIds.has(f.id));
    return [...(calculatorData.filaments || []), ...others];
  }, [calculatorData.filaments, filamentInventory]);

  const navigateToStep = useCallback((step) => {
    setActiveStep(step);
    if (!isEditMode) window.history.pushState({ step }, '');
  }, [isEditMode]);

  const is3MF = calculatorData.method?.name === '3MF';

  const updateData = (newData, targetStep = null) => {
    const updated = { ...calculatorData, ...newData };
    setCalculatorData(updated);
    
    const nextStep = targetStep !== null ? targetStep : activeStep + 1;
  navigateToStep(nextStep);
  };

  const handleFinalConfirm = (finalPayload) => {
    if (onConfirmEdit) {
      const payload = finalPayload?.projectDetails || finalPayload?.totals
        ? finalPayload
        : { ...calculatorData, totals: finalPayload };
      onConfirmEdit(payload);
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
      console.log("handleUpdateExtraQty - prev.extras:", prev.extras);
      const newExtras = (prev.extras || []).map(extra => {
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

  const STEP_CONFIG = {
    0: { title: "Select", accent: "Case" },
    1: { title: "Enter", accent: "Details" },
    2: { title: "Add", accent: "Extras" },
    3: { title: "Project", accent: "Cost" }
  };
  const visibleSteps = [0, 1, 2, 3];
  const activeProgressIndex = Math.max(0, visibleSteps.indexOf(activeStep));
  const selectedCaseLabel = String(calculatorData?.method?.name || '').toUpperCase();
  const headerBadge = activeStep === 0 || !selectedCaseLabel
    ? (
      <div className="w-11 h-11 rounded-full bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/25 flex items-center justify-center">
        <Astroid size={20} strokeWidth={3} />
      </div>
    )
    : (
      <div className="w-11 h-11 rounded-full bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/25 flex items-center justify-center">
        <span className="text-[14px] font-black italic uppercase tracking-tighter leading-none">{selectedCaseLabel}</span>
      </div>
    );


const handleStepBack = () => {
  if (isEditMode) {
    // Simply go back one step regardless of the index
    setActiveStep(prev => Math.max(0, prev - 1));
  } else {
    // If you are at step 0, use browser back, otherwise go to prev index
    if (activeStep === 0) {
      window.history.back();
    } else {
      setActiveStep(prev => Math.max(0, prev - 1));
    }
  }
};

  return (
    <div className="w-full min-h-full prints-calculator-container animate-in fade-in zoom-in-95 duration-500 px-3 sm:px-5 pb-0 text-[var(--color-text-main)] [--print-font-size:12px] sm:[--print-font-size:16px] lg:[--print-font-size:13px] ">
      <style>{`
        .prints-calculator-body :where(p, span, label, button, input, textarea, select, h1, h2, h3, h4, h5, h6) {
          font-size: var(--print-font-size);
        }
        .prints-calculator-body :where(input, .print-dimension-type) {
          font-weight: 900;
          font-style: italic;
        }
        .prints-calculator-body .preserve-print-size,
        .prints-calculator-body .preserve-print-size * {
          font-size: var(--preserve-size) !important;
        }
      `}</style>
      <div className="sticky top-0 z-50 -mx-3 sm:-mx-5 px-3 sm:px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-3 mb-4 bg-[var(--color-surface)]/95 backdrop-blur-xl border-b border-[var(--color-border)]">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => activeStep > 0 ? (isEditMode ? setActiveStep(prev => prev - 1) : window.history.back()) : onExit()} className="active:scale-90 transition-all shrink-0">
              {headerBadge}
            </button>
            <h1 className="text-[18px] font-black italic tracking-tighter uppercase">
              {STEP_CONFIG[activeStep]?.title} <span className="text-[var(--color-primary)]">{STEP_CONFIG[activeStep]?.accent}</span>
            </h1>
          </div>
          <button onClick={onExit} className="p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40 active:scale-90 shrink-0">
            <X size={20} />
          </button>
        </div>
        
        {isEditMode ? (
          <div className="text-[14px] font-black uppercase tracking-widest text-[var(--color-primary)] text-center mb-2 py-2 rounded-full">
            MODIFYING {modifyingProjectName}
          </div>
        ) : estimationLimitReached && (
          <div className="text-[14px] font-black uppercase tracking-widest text-red-600 animate-pulse text-center mb-2 py-2 rounded-full">
            LIMIT REACHED. DELETE SAVED PROJECT.
          </div>
        )}

        <div className="flex gap-1.5 h-1.5 w-full px-1">
          {visibleSteps.map((step, i) => (
            <div key={step} className={`h-full rounded-full transition-all duration-700 ${i <= activeProgressIndex ? 'bg-[var(--color-primary)] flex-[2.5]' : 'bg-white/10 flex-1'}`} />
          ))}
        </div>
      </div>

      <div className="prints-calculator-body">
        <div className="min-h-[400px]">
          {activeStep === 0 && <CaseSelection onSelect={(method) => updateData({ method })} selectedCase={calculatorData.method} />}
        {activeStep === 1 && (
          is3MF ? (
            <ProjectPreview 
              allFilaments={combinedFilaments}
              selectedFilaments={(function() {
                const filaments = calculatorData?.filaments || [];
                console.log("DEBUG: filaments to map:", filaments);
                return filaments.map(sel => {
                  if (!filamentInventory) console.log("filamentInventory is undefined or null");
                  const invMatch = (filamentInventory || []).find(f => String(f.id) === String(sel.id || sel.materialId));
                  return { ...invMatch, ...sel, remaining: parseFloat(invMatch?.remaining || invMatch?.weight || 0) };
                });
              })()}
              previewData={previewData}
              setPreviewData={setPreviewData}
              onConfirm={(details) => updateData({ projectDetails: details }, 2)}
              onBack={handleStepBack}
              projectName={calculatorData.projectName}
              gdriveLink={calculatorData.gdriveLink}
              updateMetadata={(patch) => setCalculatorData(prev => ({ ...prev, ...patch }))}
              isInventoryMode={isInventoryMode}
            />
          ) : (
            <ProjectPrepare 
              allFilaments={combinedFilaments}
              selectedFilaments={(function() {
                const filaments = calculatorData?.filaments || [];
                console.log("DEBUG: filaments to map:", filaments);
                return filaments.map(sel => {
                  if (!filamentInventory) console.log("filamentInventory is undefined or null");
                  const invMatch = (filamentInventory || []).find(f => String(f.id) === String(sel.id || sel.materialId));
                  return { ...invMatch, ...sel, remaining: parseFloat(invMatch?.remaining || invMatch?.weight || 0) };
                });
              })()}
              prepareData={prepareData}
              setPrepareData={setPrepareData}
              activePrinter={calculatorData.printer}
              onUnitChange={setDisplayUnit}
              onConfirm={(details) => updateData({ projectDetails: details }, 2)}
              onBack={handleStepBack}
              projectName={calculatorData.projectName}
              gdriveLink={calculatorData.gdriveLink}
              updateMetadata={(patch) => setCalculatorData(prev => ({ ...prev, ...patch }))}
              isInventoryMode={isInventoryMode}
            />
          )
        )}

        {activeStep === 2 && (
          <ExtrasSelection 
            extras={extras} 
            selectedExtras={calculatorData.extras}
            onToggleExtra={handleToggleExtra}
            onUpdateQty={handleUpdateExtraQty}
            projectDetails={calculatorData.projectDetails || []} 
            projectCase={calculatorData.method?.name} 
            onProceed={() => navigateToStep(3)} 
            onBack={handleStepBack}
          />
        )}

        {activeStep === 3 && (
          <ProjectCost 
            data={calculatorData} 
            activePrinter={calculatorData.printer}
            dbSettings={dbSettingsObject}
            onUpdateSettings={(rateId, patch) => updateSettings(rateId, patch)}
            onBack={handleStepBack}
            onReset={onExit}
            isEditMode={isEditMode}
            onFinalConfirm={handleFinalConfirm}
            isInventoryMode={isInventoryMode}
          />
        )}
        </div>
      </div>

      {/* {!isEditMode && (
        <div className="bg-black text-green-400 text-[10px] p-3 rounded-xl mt-4 overflow-auto">
          <pre>{JSON.stringify(calculatorData, null, 2)}</pre>
        </div>
      )} */}
    </div>
  );
}
