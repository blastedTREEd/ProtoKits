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
      { key: 'printStartTime', label: 'Print Start', unit: 'hr', type: 'number' }
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
      { key: 'heatsetPlacementRate', label: 'Heatset Place', unit: 'min', type: 'number' }
    ]
  },
  {
    id: 'electricity-cost',
    title: 'Electricity',
    fields: [
      { key: 'electricityRate', label: 'Electricity Rate', unit: '₱/kWh', type: 'number' },
      { key: 'expectedIncrease', label: 'Expected Increase', unit: '%', type: 'number' },
      { key: 'solderingIronPower', label: 'Iron Power', unit: 'W', type: 'number' }
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
      { key: 'markupRate', label: 'Markup', unit: '%', type: 'number' }
    ]
  }
];

export default function RatesManagerModal({ onClose }) {
  const { isDarkMode } = useTheme();
  const rates = useStore((state) => state.rates);
  const updateSettings = useStore((state) => state.updateSettings);
  const [draftRates, setDraftRates] = useState({});

  const handleRateChange = (sectionId, key, value) => {
    setDraftRates(prev => ({
      ...prev,
      [sectionId]: { ...(prev[sectionId] || {}), [key]: value }
    }));
  };

  const handleSave = async (sectionId) => {
    const patch = draftRates[sectionId];
    if (patch) {
      await updateSettings(sectionId, patch);
      const newDrafts = { ...draftRates };
      delete newDrafts[sectionId];
      setDraftRates(newDrafts);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] w-full max-w-2xl max-h-[85vh] rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden text-[var(--color-text-main)]">
        
        {/* Header */}
        <div className="p-6 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-3 text-left">
            <div className="p-2.5 bg-emerald-600 rounded-xl">
              <SlidersHorizontal size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase italic leading-none">Rate Management</h2>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 opacity-80 mt-1 block">Calculator Multipliers</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors opacity-40 hover:opacity-100">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {RATE_SECTIONS.map((section) => {
            const currentSectionRates = rates[section.id] || {};
            const sectionDraft = draftRates[section.id] || {};
            const hasChanges = Object.keys(sectionDraft).length > 0;

            return (
              <div key={section.id} className="space-y-4">
                <div className="flex items-center justify-between px-2">
                   <span className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30 text-current">{section.title}</span>
                   {hasChanges && (
                     <button 
                        onClick={() => handleSave(section.id)}
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest animate-in zoom-in duration-300 shadow-lg shadow-emerald-600/20"
                     >
                       <Save size={12} strokeWidth={3} />
                       Save Changes
                     </button>
                   )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-left">
                  {section.fields.map((field) => {
                    const value = sectionDraft[field.key] ?? currentSectionRates[field.key] ?? '';
                    return (
                      <div key={field.key} className="bg-black/5 dark:bg-white/5 border border-[var(--color-border)] p-4 rounded-3xl space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest opacity-40 text-current block">{field.label}</label>
                        <div className="flex items-baseline gap-1">
                          <input 
                            type={field.type}
                            value={value}
                            onChange={(e) => handleRateChange(section.id, field.key, field.type === 'number' ? parseFloat(e.target.value) : e.target.value)}
                            className="bg-transparent text-lg font-black text-emerald-500 outline-none w-full"
                          />
                          <span className="text-[9px] font-bold opacity-30 text-current">{field.unit}</span>
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