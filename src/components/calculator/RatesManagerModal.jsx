import React, { useState } from 'react';
import { X, SlidersHorizontal } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTheme } from '../../context/ThemeContext';
import RatesToast from './RatesToast';

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
      { key: 'preparationRatePerPlate', label: 'Prep Fee / Plate', unit: '₱/plate', type: 'number' },
      { key: 'supportRemovalTimePerPlate', label: 'Support Time / Plate', unit: 'min/plate', type: 'number', defaultValue: 10 },
      { key: 'supportRemovalRatePerPlate', label: 'Support Removal / Plate', unit: '₱/plate', type: 'number' },
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
      { key: 'supportRemovalHeatgunPower', label: 'Support Heatgun', unit: 'W', type: 'number', defaultValue: 300 },
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
  const hasDraftChanges = Object.keys(draftRates).length > 0;

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

  const handleSaveAll = async () => {
    const parentIds = [...new Set(
      RATE_SECTIONS
        .map((section) => section.parentSection || section.id)
        .filter((parentId) => Object.keys(draftRates[parentId] || {}).length > 0)
    )];
    if (!parentIds.length) { onClose?.(); return; }

    setSavingSection('all');
    const remainingDrafts = { ...draftRates };

    try {
      for (const parentId of parentIds) {
        const savePatch = { ...(rates[parentId] || {}), ...(draftRates[parentId] || {}) };

        if (parentId === 'electricity-cost' && Object.prototype.hasOwnProperty.call(savePatch, 'electricityRate')) {
          const rawElectricityRate = String(savePatch.electricityRate ?? '').trim();
          const numericElectricityRate = Number(rawElectricityRate);
          if (!rawElectricityRate || !Number.isFinite(numericElectricityRate) || numericElectricityRate < 0) {
            alert('Enter a valid non-negative electricity rate.');
            setSavingSection(null);
            return;
          }
          savePatch.electricityRate = numericElectricityRate;
        }

        // Do not renew electricity-rate maintenance when only another
        // electricity setting changed and the rate itself is unchanged.
        if (
          parentId === 'electricity-cost'
          && Number(draftRates[parentId]?.electricityRate) === Number(rates[parentId]?.electricityRate)
        ) {
          delete savePatch.electricityRate;
        }

        console.log(`DEBUG: Saving rates to ${parentId}. Patch structure:`, JSON.stringify(savePatch, null, 2));
        await updateSettings(parentId, savePatch);
        delete remainingDrafts[parentId];
      }
      setDraftRates(remainingDrafts);
      onClose?.();
    } catch (error) {
      setDraftRates(remainingDrafts);
      console.error('FIREBASE SAVE ERROR for all rate sections:', error);
      alert(`Failed to save rates: ${error?.message || 'Unknown error'}`);
    } finally {
      setSavingSection(null);
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
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-0 md:p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <RatesToast />
      <div className="bg-[var(--color-surface)] border-0 md:border border-[var(--color-border)] w-full h-full md:h-auto md:max-h-[85vh] md:max-w-2xl rounded-none md:rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden text-[var(--color-text-main)]">
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
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveAll}
              disabled={!hasDraftChanges || savingSection === 'all'}
              className="px-4 py-2 rounded-full bg-emerald-600 text-white text-[14px] font-bold uppercase tracking-widest shadow-lg shadow-emerald-600/20 transition-all disabled:cursor-not-allowed disabled:opacity-40"
            >
              {savingSection === 'all' ? 'Saving...' : 'Save All'}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors opacity-40 hover:opacity-100">
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {RATE_SECTIONS.map((section) => {
            const parentId = section.parentSection || section.id;
            const currentSectionRates = rates[parentId] || {};
            const sectionDraft = draftRates[parentId] || {};

            if (section.isTiered) {
              const tiers = sectionDraft.printTierMap || currentSectionRates.printTierMap || {};
              return (
                <div key={section.id} className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <span className="text-[15px] font-black uppercase tracking-[0.25em] text-current">{section.title}</span>
                    <div className="flex gap-2">
                      <button onClick={() => addTier(section.id)} className="px-3 py-1 bg-blue-600 text-white rounded-full text-[14px] font-bold uppercase tracking-widest hover:bg-blue-500">Add Tier</button>
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
                </div>

                <div className="grid grid-cols-2 gap-3 text-left">
                  {section.fields.map((field) => {
                    // Support nested parentKey lookups (e.g. design-services -> 3d-sculpt -> basePrice)
                    const resolveValue = () => {
                      if (field.parentKey) {
                        return sectionDraft?.[field.parentKey]?.[field.key] ?? currentSectionRates?.[field.parentKey]?.[field.key] ?? '';
                      }
                      return sectionDraft[field.key] ?? currentSectionRates[field.key] ?? field.defaultValue ?? '';
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
