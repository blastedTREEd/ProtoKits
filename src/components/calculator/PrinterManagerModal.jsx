import React, { useMemo, useState } from 'react';
import { Check, Edit3, Gauge, Layers2, Plus, Printer, Search, Trash2, Undo2, X, Zap } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { COMMON_FILAMENT_TYPES, normalizeFilamentType } from '../../utils/printerCompatibility';

const EMPTY_FORM = {
  brand: '',
  model: '',
  status: 'Online',
  nozzleSize: 0.4,
  wattage: 120,
  filamentSlots: 1,
  buildCapacity: { x: 220, y: 220, z: 240 },
  bootupMins: 0,
  homingMins: 0,
  bedLevelMins: 0,
  autoFeedType: '',
  autoFeedMax: 1,
  compatibleFilamentTypes: []
};

const getFormData = (printer = {}) => ({
  ...EMPTY_FORM,
  ...printer,
  brand: printer.brand || '',
  model: printer.model || printer.name || '',
  status: printer.status || (printer.isVirtual ? 'Virtual' : 'Offline'),
  nozzleSize: printer.nozzleSize ?? 0.4,
  wattage: printer.wattage ?? printer.power?.averageWatts ?? 120,
  filamentSlots: printer.filamentSlots ?? 1,
  buildCapacity: {
    ...EMPTY_FORM.buildCapacity,
    ...(printer.buildCapacity || {})
  },
  bootupMins: printer.bootupMins ?? 0,
  homingMins: printer.homingMins ?? 0,
  bedLevelMins: printer.bedLevelMins ?? printer.bootLevelMins ?? 0,
  autoFeedType: printer.autoFeed?.compatibility || printer.autoFeed?.type || '',
  autoFeedMax: printer.autoFeed?.max ?? 1,
  compatibleFilamentTypes: (Array.isArray(printer.compatibleFilamentTypes)
    ? printer.compatibleFilamentTypes
    : Array.isArray(printer.filamentTypes) ? printer.filamentTypes : []
  ).map(normalizeFilamentType)
});

const numberValue = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default function PrinterManagerModal({ onClose }) {
  const printers = useStore((state) => state.printers);
  const filamentInventory = useStore((state) => state.filamentInventory);
  const addPrinter = useStore((state) => state.addPrinter);
  const updatePrinter = useStore((state) => state.updatePrinter);
  const deletePrinter = useStore((state) => state.deletePrinter);

  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const filamentTypes = useMemo(() => (
    [...new Set([
      ...COMMON_FILAMENT_TYPES,
      ...(filamentInventory || []).map((filament) => normalizeFilamentType(filament.type))
    ].filter(Boolean))].sort()
  ), [filamentInventory]);

  const filteredPrinters = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return printers || [];
    return (printers || []).filter((printer) => (
      [printer.brand, printer.model, printer.name, printer.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    ));
  }, [printers, searchQuery]);

  const beginAdd = () => {
    setEditingId(null);
    setFormData({ ...EMPTY_FORM, buildCapacity: { ...EMPTY_FORM.buildCapacity } });
    setIsAdding(true);
  };

  const beginEdit = (printer) => {
    setIsAdding(false);
    setEditingId(printer.id);
    setFormData(getFormData(printer));
  };

  const closeEditor = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
  };

  const updateField = (key, value) => setFormData((current) => ({ ...current, [key]: value }));
  const updateCapacity = (key, value) => setFormData((current) => ({
    ...current,
    buildCapacity: { ...current.buildCapacity, [key]: value }
  }));

  const handleSave = async () => {
    if (!formData.brand.trim() || !formData.model.trim()) {
      alert('Please enter the printer brand and model.');
      return;
    }

    const status = formData.status || 'Offline';
    const normalized = {
      brand: formData.brand.trim().toUpperCase(),
      model: formData.model.trim().toUpperCase(),
      name: formData.model.trim().toUpperCase(),
      status,
      isVirtual: String(status).toLowerCase() === 'virtual',
      nozzleSize: numberValue(formData.nozzleSize, 0.4),
      wattage: numberValue(formData.wattage, 120),
      filamentSlots: Math.max(1, Math.round(numberValue(formData.filamentSlots, 1))),
      buildCapacity: {
        x: Math.max(0, numberValue(formData.buildCapacity.x)),
        y: Math.max(0, numberValue(formData.buildCapacity.y)),
        z: Math.max(0, numberValue(formData.buildCapacity.z))
      },
      bootupMins: Math.max(0, numberValue(formData.bootupMins)),
      homingMins: Math.max(0, numberValue(formData.homingMins)),
      bedLevelMins: Math.max(0, numberValue(formData.bedLevelMins)),
      bootLevelMins: Math.max(0, numberValue(formData.bedLevelMins)),
      autoFeed: formData.autoFeedType.trim()
        ? {
            compatibility: formData.autoFeedType.trim().toUpperCase(),
            max: Math.max(1, Math.round(numberValue(formData.autoFeedMax, 1)))
          }
        : null,
      compatibleFilamentTypes: (formData.compatibleFilamentTypes || []).map(normalizeFilamentType)
    };

    setIsSaving(true);
    try {
      if (editingId) {
        await updatePrinter(editingId, normalized);
      } else {
        await addPrinter(normalized);
      }
      closeEditor();
    } catch (error) {
      alert(error?.message || 'Unable to save printer details.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (printer) => {
    if (!window.confirm(`Delete ${printer.brand || ''} ${printer.model || printer.name || 'this printer'}?`)) return;
    try {
      await deletePrinter(printer.id);
    } catch (error) {
      alert(error?.message || 'Unable to delete printer.');
    }
  };

  const renderInput = (label, key, type = 'number', options = {}) => (
    <label className="space-y-1 text-left">
      <span className="ml-2 text-[13px] font-black uppercase tracking-widest opacity-40">{label}</span>
      <input
        type={type}
        value={formData[key] ?? ''}
        onChange={(event) => updateField(key, event.target.value)}
        placeholder={options.placeholder}
        step={options.step}
        min={options.min}
        className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[14px] font-bold text-[var(--color-text-main)] outline-none focus:border-blue-500"
      />
    </label>
  );

  const renderEditor = () => (
    <div className="space-y-4 rounded-[2rem] border border-[var(--color-border)] bg-black/5 p-5 dark:bg-white/5 animate-in slide-in-from-top-4 duration-300">
      <div className="grid grid-cols-2 gap-3">
        {renderInput('Brand', 'brand', 'text')}
        {renderInput('Model', 'model', 'text')}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-left">
          <span className="ml-2 text-[13px] font-black uppercase tracking-widest opacity-40">Status</span>
          <select value={formData.status} onChange={(event) => updateField('status', event.target.value)} className="w-full appearance-none rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[14px] font-bold text-[var(--color-text-main)] outline-none focus:border-blue-500">
            <option>Online</option>
            <option>Offline</option>
            <option>Maintenance</option>
            <option>Virtual</option>
          </select>
        </label>
        {renderInput('Nozzle (mm)', 'nozzleSize', 'number', { step: '0.1', min: '0' })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {renderInput('Power (W)', 'wattage', 'number', { min: '0' })}
        {renderInput('Base slots', 'filamentSlots', 'number', { min: '1' })}
      </div>

      <div className="space-y-2 text-left">
        <span className="ml-2 text-[13px] font-black uppercase tracking-widest opacity-40">Build capacity (mm)</span>
        <div className="grid grid-cols-3 gap-3">
          {['x', 'y', 'z'].map((axis) => (
            <input key={axis} type="number" min="0" value={formData.buildCapacity?.[axis] ?? ''} onChange={(event) => updateCapacity(axis, event.target.value)} placeholder={axis.toUpperCase()} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[14px] font-bold text-[var(--color-text-main)] outline-none focus:border-blue-500" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {renderInput('Boot (min)', 'bootupMins', 'number', { min: '0' })}
        {renderInput('Home (min)', 'homingMins', 'number', { min: '0' })}
        {renderInput('Level (min)', 'bedLevelMins', 'number', { min: '0' })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {renderInput('Auto-feed type', 'autoFeedType', 'text', { placeholder: 'AMS / CFS' })}
        {renderInput('Auto-feed units', 'autoFeedMax', 'number', { min: '1' })}
      </div>

      <div className="space-y-2 text-left">
        <div className="flex items-end justify-between gap-3">
          <span className="ml-2 text-[13px] font-black uppercase tracking-widest opacity-40">Compatible filament types</span>
          <span className="text-[13px] font-bold opacity-40">Empty = all types</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {filamentTypes.map((type) => {
            const isSelected = (formData.compatibleFilamentTypes || []).includes(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => updateField(
                  'compatibleFilamentTypes',
                  isSelected
                    ? (formData.compatibleFilamentTypes || []).filter((item) => item !== type)
                    : [...(formData.compatibleFilamentTypes || []), type]
                )}
                className={`rounded-xl border px-3 py-2 text-left text-[13px] font-black uppercase transition-all ${isSelected ? 'border-blue-500 bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'border-[var(--color-border)] bg-[var(--color-bg)] opacity-60 hover:border-blue-500/50 hover:opacity-100'}`}
              >
                <Check size={13} strokeWidth={4} className={`mr-2 inline transition-opacity ${isSelected ? 'opacity-100' : 'opacity-20'}`} />
                {type}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={closeEditor} className="flex-1 rounded-xl bg-black/5 py-3 text-[13px] font-black uppercase tracking-widest dark:bg-white/5">
          <Undo2 size={12} className="mr-2 inline" /> Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={isSaving} className="flex-[2] rounded-xl bg-blue-600 py-3 text-[13px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 disabled:opacity-50">
          <Check size={12} strokeWidth={4} className="mr-2 inline" /> {isSaving ? 'Saving...' : editingId ? 'Update Specs' : 'Save Printer'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-0 backdrop-blur-sm animate-in fade-in duration-300 md:p-4">
      <div className="flex h-full w-full flex-col overflow-hidden border-0 border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-main)] shadow-2xl md:h-auto md:max-h-[90vh] md:max-w-3xl md:rounded-[2.5rem] md:border">
        <div className="sticky top-0 z-[220] h-0 w-full overflow-visible md:hidden">
          <button onClick={onClose} className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/20 p-2 text-white shadow-lg backdrop-blur-md">
            <X size={20} />
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-[var(--color-border)] p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-600 p-2.5"><Printer size={20} className="text-white" /></div>
            <div>
              <h2 className="text-[15px] font-black uppercase italic leading-none">Printer Manager</h2>
              <span className="mt-1 block text-[13px] font-black uppercase tracking-widest text-blue-500 opacity-80">Fleet & Production Specifications</span>
            </div>
          </div>
          <button onClick={onClose} className="hidden rounded-full p-2 opacity-40 transition-colors hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5 md:block"><X size={24} /></button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <div className="flex gap-3">
            <div className="group relative w-[65%]">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20 group-focus-within:text-blue-500 group-focus-within:opacity-100" />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="SEARCH PRINTERS..." className="w-full rounded-3xl border border-[var(--color-border)] bg-black/5 py-4 pl-12 pr-4 text-[14px] font-black uppercase tracking-widest outline-none transition-all focus:border-blue-500/50 dark:bg-white/5" />
            </div>
            <button type="button" onClick={isAdding ? closeEditor : beginAdd} className={`flex w-[35%] items-center justify-center gap-2 rounded-3xl border text-[13px] font-black uppercase tracking-widest transition-all active:scale-95 ${isAdding ? 'border-zinc-700 bg-zinc-800 text-white' : 'border-blue-500 bg-blue-600 text-white shadow-lg'}`}>
              {isAdding ? <X size={14} strokeWidth={3} /> : <Plus size={14} strokeWidth={4} />}
              {isAdding ? 'Close' : 'Register'}
            </button>
          </div>

          {isAdding && renderEditor()}

          <div className="space-y-3">
            {filteredPrinters.length === 0 && <div className="rounded-3xl border border-dashed border-[var(--color-border)] px-6 py-12 text-center text-[13px] font-black uppercase tracking-widest opacity-40">No printers found</div>}
            {filteredPrinters.map((printer) => {
              const isEditing = editingId === printer.id;
              const capacity = printer.buildCapacity || {};
              const status = String(printer.status || (printer.isVirtual ? 'Virtual' : 'Offline'));
              const statusTone = status.toLowerCase() === 'online' || status.toLowerCase() === 'virtual'
                ? 'bg-emerald-500/10 text-emerald-600'
                : 'bg-amber-500/10 text-amber-600';

              return (
                <div key={printer.id} className={`group rounded-3xl border p-4 transition-all ${isEditing ? 'border-blue-500 bg-blue-500/5 ring-4 ring-blue-500/10' : 'border-[var(--color-border)] bg-black/5 hover:border-blue-500/40 dark:bg-white/5'}`}>
                  {isEditing ? renderEditor() : (
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-4 text-left">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-600"><Printer size={22} /></div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="truncate text-[15px] font-black uppercase italic leading-none">{printer.brand || 'UNKNOWN'} {printer.model || printer.name || 'PRINTER'}</h4>
                            <span className={`rounded px-1.5 py-0.5 text-[13px] font-black uppercase tracking-widest ${statusTone}`}>{status}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-black uppercase tracking-widest opacity-50">
                            <span><Gauge size={10} className="mr-1 inline" />{capacity.x || 0} × {capacity.y || 0} × {capacity.z || 0} MM</span>
                            <span><Zap size={10} className="mr-1 inline" />{numberValue(printer.wattage)}W</span>
                            <span><Layers2 size={10} className="mr-1 inline" />{numberValue(printer.nozzleSize, 0.4)}MM</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                        <button type="button" onClick={() => beginEdit(printer)} className="rounded-xl p-2.5 text-blue-500 transition-all hover:bg-blue-600 hover:text-white" aria-label={`Edit ${printer.model || printer.name || 'printer'}`}><Edit3 size={18} /></button>
                        <button type="button" onClick={() => handleDelete(printer)} className="rounded-xl p-2.5 text-red-500 transition-all hover:bg-red-600 hover:text-white" aria-label={`Delete ${printer.model || printer.name || 'printer'}`}><Trash2 size={18} /></button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
