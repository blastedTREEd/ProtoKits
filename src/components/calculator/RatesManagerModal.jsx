import React, { useState } from 'react';
import { X, Save, SlidersHorizontal } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTheme } from '../../context/ThemeContext';

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
      { key: 'preparationRatePerFile', label: 'Prep Fee', unit: '₱', type: 'number' },
      { key: 'supportRemovalRatePerModel', label: 'Support Fee', unit: '₱', type: 'number' },
      { key: 'printStartTime', label: 'Print Start', unit: 'hr', type: 'number' },
      { key: 'useTiers', label: 'Use Labor Tiers', unit: 'Toggle', type: 'boolean' }
    ],
    tierKey: 'printTierMap'
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
      { key: 'heatsetPlacementRate', label: 'Heatset Place', unit: 'min', type: 'number' }
    ]
  },
  {
    id: 'electricity-cost',
    title: 'Electricity',
    fields: [
      { key: 'electricityRate', label: 'Electricity Rate', unit: '₱/kWh', type: 'number' },
      { key: 'expectedIncrease', label: 'Expected Increase', unit: '%', type: 'number' },
      { key: 'solderingIronPower', label: 'Iron Power', unit: 'W', type: 'number' },
      { key: 'rateUpdateDay', label: 'Update Due Day', unit: 'day of month', type: 'number' },
      { key: 'rateAsOf', label: 'Last Updated', unit: '', type: 'text', readOnly: true }
    ]
  },
  {
    id: 'maintenance-cost',
    title: 'Maintenance',
    fields: [
      { key: 'estimationCost', label: 'Estimation Cost', unit: '₱', type: 'number' },
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
  },
  {
    id: 'design-services',
    title: 'Design Services',
    fields: [
      { key: 'complexityPriceHike', label: 'Complexity Hike', unit: '₱/lvl', type: 'number' },
      { key: 'basePrice', parentKey: '3d-sculpt', label: '3D Sculpt Base Price', unit: '₱', type: 'number' },
      { key: 'status', parentKey: '3d-sculpt', label: '3D Sculpt Status', unit: 'Toggle', type: 'boolean' },
      { key: 'basePrice', parentKey: '3d-cad', label: '3D CAD Base Price', unit: '₱', type: 'number' },
      { key: 'status', parentKey: '3d-cad', label: '3D CAD Status', unit: 'Toggle', type: 'boolean' }
    ]
  },
  {
    id: 'printTierMap',
    title: 'Labor Tiers',
    isTiered: true,
    parentSection: 'labor-cost',
    fields: [
      { key: 'firstCoveredHours', label: 'Covered Hours', unit: 'hr', type: 'number' },
      { key: 'laborRate', label: 'Tiered Rate', unit: '₱/hr', type: 'number' }
    ]
  }
];

export default function RatesManagerModal({ onClose }) {
  const { isDarkMode } = useTheme();
  const rates = useStore((state) => state.rates);
  const updateSettings = useStore((state) => state.updateSettings);
  const [draftRates, setDraftRates] = useState({});
  const [savingSection, setSavingSection] = useState(null);

  const handleRateChange = (sectionId, key, value, tierId = null, parentKey = null) => {
    setDraftRates(prev => {
      const parentId = RATE_SECTIONS.find(s => s.id === sectionId)?.parentSection || sectionId;
      const currentSection = prev[parentId] || { ...rates[parentId] };
      
      if (sectionId === 'printTierMap') {
        const tiers = currentSection.printTierMap || {};
        if (tierId) {
          tiers[tierId] = { ...(tiers[tierId] || {}), [key]: value };
        }
        currentSection.printTierMap = tiers;
      } else if (parentKey) {
        // Nested map support (e.g. design-services -> 3d-sculpt -> basePrice)
        currentSection[parentKey] = { ...(currentSection[parentKey] || {}), [key]: value };
      } else if (tierId) {
        currentSection[tierId] = { ...(currentSection[tierId] || {}), [key]: value };
      } else {
        currentSection[key] = value;
      }
      return { ...prev, [parentId]: currentSection };
    });
  };

  const handleSave = async (sectionId) => {
    const parentId = RATE_SECTIONS.find(s => s.id === sectionId)?.parentSection || sectionId;
    const patch = { ...(rates[parentId] || {}), ...(draftRates[parentId] || {}) };
    const savePatch = { ...patch };

    if (parentId === 'electricity-cost' && Object.prototype.hasOwnProperty.call(savePatch, 'electricityRate')) {
      const rawElectricityRate = String(savePatch.electricityRate ?? '').trim();
      const numericElectricityRate = Number(rawElectricityRate);
      if (!rawElectricityRate || !Number.isFinite(numericElectricityRate) || numericElectricityRate < 0) {
        alert('Enter a valid non-negative electricity rate.');
        return;
      }
      savePatch.electricityRate = numericElectricityRate;
    }

    // handleRateChange keeps a complete section draft for reliable nested
    // updates. Do not let an unchanged electricity rate count as a renewal
    // merely because another electricity setting was edited.
    if (
      parentId === 'electricity-cost'
      && Number(draftRates[parentId]?.electricityRate) === Number(rates[parentId]?.electricityRate)
    ) {
      delete savePatch.electricityRate;
    }
    
    if (Object.keys(draftRates[parentId] || {}).length > 0) {
      setSavingSection(sectionId);
      try {
        console.log(`DEBUG: Saving rates to ${parentId}. Patch structure:`, JSON.stringify(savePatch, null, 2));
        await updateSettings(parentId, savePatch);
        const newDrafts = { ...draftRates };
        delete newDrafts[parentId];
        setDraftRates(newDrafts);
      } catch (error) {
        console.error('FIREBASE SAVE ERROR for', sectionId, ':', error);
        alert(`Failed to save rates: ${error?.message || 'Unknown error'}`);
      } finally {
        setSavingSection(null);
      }
    }
  };

  const addTier = (sectionId) => {
    const tierId = `tier-${Date.now()}`;
    handleRateChange(sectionId, 'firstCoveredHours', 0, tierId);
    handleRateChange(sectionId, 'laborRate', 0, tierId);
  };

  const removeTier = (sectionId, tierId) => {
    setDraftRates(prev => {
      const parentId = RATE_SECTIONS.find(s => s.id === sectionId)?.parentSection || sectionId;
      const currentSection = { ...(prev[parentId] || rates[parentId] || {}) };
      if (currentSection.printTierMap) {
        delete currentSection.printTierMap[tierId];
      }
      return { ...prev, [parentId]: currentSection };
    });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 md:p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-[var(--color-surface)] border-0 md:border border-[var(--color-border)] w-full h-full md:h-auto md:max-h-[85vh] md:max-w-2xl rounded-none md:rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden text-[var(--color-text-main)]">
        {/* Mobile sticky close button (same pattern as ProductCard and AddDealModal) */}
        <div className="sticky top-0 z-[220] w-full h-0 overflow-visible md:hidden shrink-0">
          <div className="absolute top-4 right-4 flex justify-end items-center">
            <button onClick={onClose} className="p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40">
              <X size={20} />
            </button>
          </div>
        </div>
        
        <div className="p-6 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-3 text-left">
            <div className="p-2.5 bg-emerald-600 rounded-xl">
              <SlidersHorizontal size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-[15px] font-black uppercase italic leading-none">Rate Management</h2>
              <span className="text-[14px] font-bold uppercase tracking-widest text-emerald-500 mt-1 block">Calculator Multipliers</span>
            </div>
          </div>
          <button onClick={onClose} className="hidden md:block p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors opacity-40 hover:opacity-100">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {RATE_SECTIONS.map((section) => {
            const parentId = section.parentSection || section.id;
            const currentSectionRates = rates[parentId] || {};
            const sectionDraft = draftRates[parentId] || {};
            const hasChanges = Object.keys(sectionDraft).length > 0;

            if (section.isTiered) {
              const tiers = sectionDraft.printTierMap || currentSectionRates.printTierMap || {};
              return (
                <div key={section.id} className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <span className="text-[15px] font-black uppercase tracking-[0.25em] text-current">{section.title}</span>
                    <div className="flex gap-2">
                      <button onClick={() => addTier(section.id)} className="px-3 py-1 bg-blue-600 text-white rounded-full text-[14px] font-bold uppercase tracking-widest hover:bg-blue-500">Add Tier</button>
                      {hasChanges && (
                        <button onClick={() => handleSave(section.id)} disabled={savingSection === section.id} className="px-4 py-1 rounded-full bg-emerald-600 text-white text-[14px] font-bold uppercase tracking-widest shadow-lg shadow-emerald-600/20">Save</button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(tiers).map(([tierId, tierData]) => (
                      <div key={tierId} className="flex gap-3 bg-black/5 dark:bg-white/5 border border-[var(--color-border)] p-4 rounded-3xl items-center">
                        <input type="text" inputMode="decimal" value={tierData.firstCoveredHours || 0} onChange={(e) => handleRateChange(section.id, 'firstCoveredHours', e.target.value === '' ? '' : parseFloat(e.target.value), tierId)} className="bg-transparent w-20 text-center text-[15px] font-black text-emerald-500" />
                        <span className="text-[14px] font-bold uppercase">Hours @</span>
                        <input type="text" inputMode="decimal" value={tierData.laborRate || 0} onChange={(e) => handleRateChange(section.id, 'laborRate', e.target.value === '' ? '' : parseFloat(e.target.value), tierId)} className="bg-transparent w-20 text-center text-[15px] font-black text-emerald-500" />
                        <span className="text-[14px] font-bold uppercase">₱/hr</span>
                        <button onClick={() => removeTier(section.id, tierId)} className="ml-auto text-red-500"><X size={16} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <div key={section.id} className="space-y-4">
                <div className="flex items-center justify-between px-2">
                   <span className="text-[15px] font-black uppercase tracking-[0.25em] text-current">{section.title}</span>
                   {hasChanges && (
                     <button 
                        onClick={() => handleSave(section.id)}
                        disabled={savingSection === section.id}
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-600 text-white text-[14px] font-bold uppercase tracking-widest animate-in zoom-in duration-300 shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                     >
                       <Save size={12} strokeWidth={3} />
                       {savingSection === section.id ? 'Saving...' : 'Save Changes'}
                     </button>
                   )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-left">
                  {section.fields.map((field) => {
                    // Support nested parentKey lookups (e.g. design-services -> 3d-sculpt -> basePrice)
                    const resolveValue = () => {
                      if (field.parentKey) {
                        return sectionDraft?.[field.parentKey]?.[field.key] ?? currentSectionRates?.[field.parentKey]?.[field.key] ?? '';
                      }
                      return sectionDraft[field.key] ?? currentSectionRates[field.key] ?? '';
                    };
                    const value = field.key === 'rateUpdateDay'
                      ? (sectionDraft[field.key] ?? currentSectionRates[field.key] ?? 22)
                      : resolveValue();
                    const isReadOnly = field.readOnly === true;
                    const displayValue = field.key === 'rateAsOf' && typeof value === 'string'
                      ? value.slice(0, 10)
                      : value;
                    const fieldUniqueKey = field.parentKey ? `${field.parentKey}-${field.key}` : field.key;
                    return (
                      <div key={fieldUniqueKey} className="bg-black/5 dark:bg-white/5 border border-[var(--color-border)] p-4 rounded-3xl space-y-1">
                        <label className="text-[14px] font-bold uppercase tracking-widest text-current block">{field.label}</label>
                        <div className="flex items-baseline gap-1">
                          {field.type === 'boolean' ? (
                            <button
                              type="button"
                              onClick={() => handleRateChange(section.id, field.key, !value, null, field.parentKey || null)}
                              className={`w-12 h-7 rounded-full p-1 transition-all ${value ? 'bg-[var(--color-primary)]' : 'bg-black/10 dark:bg-white/10'}`}
                            >
                                <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                          ) : (
                            <input 
                              type={field.type === 'number' ? 'text' : field.type}
                              inputMode={field.type === 'number' ? 'decimal' : undefined}
                              value={displayValue}
                              readOnly={isReadOnly}
                              onChange={(e) => handleRateChange(
                                section.id,
                                field.key,
                                field.type === 'number'
                                  ? (section.id === 'electricity-cost' && field.key === 'electricityRate'
                                    ? e.target.value
                                    : (e.target.value === '' ? '' : parseFloat(e.target.value)))
                                  : e.target.value,
                                null,
                                field.parentKey || null
                              )}
                              className={`bg-transparent text-[15px] font-black text-emerald-500 outline-none w-full ${isReadOnly ? 'cursor-default' : ''}`}
                            />
                          )}
                          {field.type !== 'boolean' && <span className="text-[14px] font-bold text-current">{field.unit}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
