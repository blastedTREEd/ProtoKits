import React, { useMemo, useState } from 'react';
import { Calculator, Check, ChevronDown, ChevronUp, Gauge, Layers2, Plus, Printer, PrinterCheck, PrinterX, Search, Trash2, Undo2, X, Zap } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { COMMON_FILAMENT_TYPES, PRINTER_STATUSES, normalizeFeederRecord, normalizeFilamentType, normalizePrinterRecord, normalizePrinterStatus } from '../../utils/printerCompatibility';

const EMPTY_FORM = {
  brand: '',
  model: '',
  status: 'available',
  nozzleSize: 0.4,
  wattage: 120,
  filamentSlots: 1,
  buildCapacity: { x: 220, y: 220, z: 240 },
  bootupMins: 0,
  homingMins: 0,
  bedLevelMins: 0,
  autoFeedType: '',
  autoFeedMax: 1,
  compatibleFilamentTypes: [],
  printTimeAdjustments: {},
  feederId: ''
};

const EMPTY_FEEDER_FORM = {
  id: '',
  name: '',
  type: 'CFS',
  status: 'available',
  filamentSlots: 4,
  swapTime: 1,
  wattage: 20
};

const getFeederFormData = (feeder = {}) => {
  const normalizedFeeder = normalizeFeederRecord(feeder);
  return {
    ...EMPTY_FEEDER_FORM,
    ...normalizedFeeder,
    id: normalizedFeeder.id || '',
    name: normalizedFeeder.name || normalizedFeeder.id || '',
    type: normalizedFeeder.type || normalizedFeeder.compatibility || 'CFS',
    status: normalizePrinterStatus(normalizedFeeder.status, normalizedFeeder)
  };
};

const getFormData = (printer = {}) => {
  const normalizedPrinter = normalizePrinterRecord(printer);

  return ({
  ...EMPTY_FORM,
  ...normalizedPrinter,
  brand: normalizedPrinter.brand || '',
  model: normalizedPrinter.model || normalizedPrinter.name || '',
  status: normalizePrinterStatus(normalizedPrinter.status, normalizedPrinter),
  nozzleSize: normalizedPrinter.nozzleSize,
  wattage: normalizedPrinter.wattage,
  filamentSlots: normalizedPrinter.filamentSlots,
  buildCapacity: {
    ...EMPTY_FORM.buildCapacity,
    ...(normalizedPrinter.buildCapacity || {})
  },
  bootupMins: normalizedPrinter.bootupMins,
  homingMins: normalizedPrinter.homingMins,
  bedLevelMins: normalizedPrinter.bedLevelMins,
  autoFeedType: normalizedPrinter.autoFeed?.compatibility || normalizedPrinter.autoFeed?.type || '',
  autoFeedMax: normalizedPrinter.autoFeed?.max ?? 1,
  feederId: normalizedPrinter.feederIds?.[0] || '',
  compatibleFilamentTypes: (Array.isArray(normalizedPrinter.compatibleFilamentTypes)
    ? normalizedPrinter.compatibleFilamentTypes
    : []
  ).map(normalizeFilamentType),
  printTimeAdjustments: (normalizedPrinter.printTimeAdjustments && typeof normalizedPrinter.printTimeAdjustments === 'object')
    ? { ...normalizedPrinter.printTimeAdjustments }
    : {}
  });
};

const numberValue = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const statusTone = (status) => status === 'available'
  ? 'bg-emerald-500/10 text-emerald-600'
  : status === 'maintenance'
    ? 'bg-amber-500/10 text-amber-600'
    : 'bg-red-500/10 text-red-600';

const STATUS_CYCLE = ['available', 'unavailable', 'maintenance'];

const getNextStatus = (status) => {
  const currentStatus = normalizePrinterStatus(status);
  const currentIndex = STATUS_CYCLE.indexOf(currentStatus);
  return STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];
};

const PrinterStatusIcon = ({ status, ...props }) => {
  const Icon = status === 'maintenance' ? PrinterCheck : status === 'unavailable' ? PrinterX : Printer;
  return <Icon {...props} />;
};

export default function PrinterManagerModal({ onClose }) {
  const printers = useStore((state) => state.printers);
  const feeders = useStore((state) => state.feeders);
  const filamentInventory = useStore((state) => state.filamentInventory);
  const addPrinter = useStore((state) => state.addPrinter);
  const updatePrinter = useStore((state) => state.updatePrinter);
  const deletePrinter = useStore((state) => state.deletePrinter);
  const addFeeder = useStore((state) => state.addFeeder);
  const updateFeeder = useStore((state) => state.updateFeeder);
  const deleteFeeder = useStore((state) => state.deleteFeeder);

  const [searchQuery, setSearchQuery] = useState('');
  const [managerMode, setManagerMode] = useState('printers');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingFeederId, setEditingFeederId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [feederForm, setFeederForm] = useState(EMPTY_FEEDER_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);

  // Mini Calculator state for Print Time Overrun
  const [calcTargetType, setCalcTargetType] = useState('');
  const [calcSlicerHrs, setCalcSlicerHrs] = useState('');
  const [calcSlicerMins, setCalcSlicerMins] = useState('');
  const [calcActualHrs, setCalcActualHrs] = useState('');
  const [calcActualMins, setCalcActualMins] = useState('');
  const [showCalculator, setShowCalculator] = useState(false);

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

  const filteredFeeders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return feeders || [];
    return (feeders || []).filter((feeder) => (
      [feeder.id, feeder.name, feeder.type, feeder.compatibility, feeder.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    ));
  }, [feeders, searchQuery]);

  const visiblePrinters = useMemo(() => {
    if (!editingId) return filteredPrinters;
    return (printers || []).filter((printer) => String(printer.id) === String(editingId));
  }, [editingId, filteredPrinters, printers]);

  const visibleFeeders = useMemo(() => {
    if (!editingFeederId) return filteredFeeders;
    return (feeders || []).filter((feeder) => String(feeder.id) === String(editingFeederId));
  }, [editingFeederId, feeders, filteredFeeders]);

  const beginAdd = () => {
    setManagerMode('printers');
    setEditingId(null);
    setEditingFeederId(null);
    setFormData({ ...EMPTY_FORM, buildCapacity: { ...EMPTY_FORM.buildCapacity } });
    setIsAdding(true);
  };

  const beginAddFeeder = () => {
    setManagerMode('feeders');
    setEditingId(null);
    setEditingFeederId(null);
    setFeederForm({ ...EMPTY_FEEDER_FORM });
    setIsAdding(true);
  };

  const beginEdit = (printer) => {
    setManagerMode('printers');
    setIsAdding(false);
    setEditingFeederId(null);
    setEditingId(printer.id);
    setFormData(getFormData(printer));
  };

  const beginEditFeeder = (feeder) => {
    setManagerMode('feeders');
    setIsAdding(false);
    setEditingId(null);
    setEditingFeederId(feeder.id);
    setFeederForm(getFeederFormData(feeder));
  };

  const closeEditor = () => {
    setIsAdding(false);
    setEditingId(null);
    setEditingFeederId(null);
    setFormData(EMPTY_FORM);
    setFeederForm({ ...EMPTY_FEEDER_FORM });
  };

  const updateField = (key, value) => setFormData((current) => ({ ...current, [key]: value }));
  const updateAdjustment = (type, value) => setFormData((current) => ({
    ...current,
    printTimeAdjustments: {
      ...(current.printTimeAdjustments || {}),
      [normalizeFilamentType(type)]: value
    }
  }));
  const updateCapacity = (key, value) => setFormData((current) => ({
    ...current,
    buildCapacity: { ...current.buildCapacity, [key]: value }
  }));

  const updateFeederField = (key, value) => setFeederForm((current) => ({ ...current, [key]: value }));

  const handleSave = async () => {
    if (!formData.brand.trim() || !formData.model.trim()) {
      alert('Please enter the printer brand and model.');
      return;
    }

    const status = normalizePrinterStatus(formData.status);
    const normalized = {
      brand: formData.brand.trim().toUpperCase(),
      model: formData.model.trim().toUpperCase(),
      name: formData.model.trim().toUpperCase(),
      status,
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
      feederId: formData.feederId || null,
      feederIds: formData.feederId ? [String(formData.feederId)] : [],
      autoFeed: formData.feederId
        ? {
            compatibility: normalizeFeederRecord((feeders || []).find((feeder) => String(feeder.id) === String(formData.feederId)) || {}).type || formData.autoFeedType.trim().toUpperCase(),
            max: 1
          }
        : formData.autoFeedType.trim()
        ? {
            compatibility: formData.autoFeedType.trim().toUpperCase(),
            max: Math.max(1, Math.round(numberValue(formData.autoFeedMax, 1)))
          }
        : null,
      compatibleFilamentTypes: (formData.compatibleFilamentTypes || []).map(normalizeFilamentType),
      printTimeAdjustments: Object.entries(formData.printTimeAdjustments || {}).reduce((acc, [type, val]) => {
        const num = Number(val);
        if (Number.isFinite(num) && num > 0) {
          acc[normalizeFilamentType(type)] = Math.round(num * 10) / 10;
        }
        return acc;
      }, {})
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

  const handleSaveFeeder = async () => {
    if (!feederForm.type.trim()) {
      alert('Please enter the feeder type.');
      return;
    }

    const normalized = {
      name: feederForm.name.trim() || feederForm.id.trim() || feederForm.type.trim().toUpperCase(),
      type: feederForm.type.trim().toLowerCase(),
      status: normalizePrinterStatus(feederForm.status),
      filamentSlots: Math.max(1, Math.round(numberValue(feederForm.filamentSlots, 4))),
      swapTime: Math.max(0, numberValue(feederForm.swapTime, 0)),
      wattage: Math.max(0, numberValue(feederForm.wattage, 0))
    };

    setIsSaving(true);
    try {
      if (editingFeederId) {
        await updateFeeder(editingFeederId, normalized);
      } else {
        await addFeeder({ ...normalized, id: feederForm.id.trim() || undefined });
      }
      closeEditor();
    } catch (error) {
      alert(error?.message || 'Unable to save feeder details.');
    } finally {
      setIsSaving(false);
    }
  };

  const togglePrinterStatus = async (printer) => {
    const nextStatus = getNextStatus(printer.status);
    const updateKey = `printer:${printer.id}`;
    setStatusUpdatingId(updateKey);
    try {
      await updatePrinter(printer.id, { status: nextStatus });
    } catch (error) {
      alert(error?.message || 'Unable to update printer status.');
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const toggleFeederStatus = async (feeder) => {
    const nextStatus = getNextStatus(feeder.status);
    const updateKey = `feeder:${feeder.id}`;
    setStatusUpdatingId(updateKey);
    try {
      await updateFeeder(feeder.id, { status: nextStatus });
    } catch (error) {
      alert(error?.message || 'Unable to update feeder status.');
    } finally {
      setStatusUpdatingId(null);
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

  const handleDeleteFeeder = async (feeder) => {
    if (!window.confirm(`Delete feeder ${feeder.name || feeder.id || 'this feeder'}?`)) return;
    try {
      await deleteFeeder(feeder.id);
    } catch (error) {
      alert(error?.message || 'Unable to delete feeder.');
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

  const renderFeederInput = (label, key, type = 'number', options = {}) => (
    <label className="space-y-1 text-left">
      <span className="ml-2 text-[13px] font-black uppercase tracking-widest opacity-40">{label}</span>
      <input
        type={type}
        value={feederForm[key] ?? ''}
        onChange={(event) => updateFeederField(key, event.target.value)}
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
            {PRINTER_STATUSES.map((status) => (
              <option key={status} value={status}>{status.toUpperCase()}</option>
            ))}
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

      <div className="space-y-2 text-left">
        <div className="flex items-end justify-between gap-3">
          <span className="ml-2 text-[13px] font-black uppercase tracking-widest opacity-40">Connected feeder</span>
          <span className="text-[13px] font-bold opacity-40">One feeder per printer</span>
        </div>
        <select
          value={formData.feederId || ''}
          onChange={(event) => updateField('feederId', event.target.value)}
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[14px] font-bold text-[var(--color-text-main)] outline-none focus:border-blue-500"
        >
          <option value="">No feeder — use printer base slot</option>
          {(feeders || []).map((feeder) => (
            <option key={feeder.id} value={feeder.id}>
              {(feeder.name || feeder.id).toUpperCase()} · {String(feeder.type || feeder.compatibility || '').toUpperCase()} · {feeder.filamentSlots || 0} SLOTS
            </option>
          ))}
        </select>
        {(!feeders || feeders.length === 0) && (
          <div className="text-[13px] font-bold opacity-50">Register a feeder first to attach it to this printer.</div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {renderInput('Legacy auto-feed type', 'autoFeedType', 'text', { placeholder: 'AMS / CFS' })}
        {renderInput('Legacy auto-feed units', 'autoFeedMax', 'number', { min: '1' })}
      </div>

      <div className="space-y-2 text-left">
        <div className="flex items-end justify-between gap-3">
          <span className="ml-2 text-[13px] font-black uppercase tracking-widest opacity-40">Compatible filament types</span>
          <span className="text-[13px] font-bold opacity-40">Empty = all types</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {filamentTypes.map((type) => {
            const isSelected = (formData.compatibleFilamentTypes || []).includes(type);
            const currentAdj = Number(formData.printTimeAdjustments?.[type] || 0);
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
                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-[13px] font-black uppercase transition-all ${isSelected ? 'border-blue-500 bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'border-[var(--color-border)] bg-[var(--color-bg)] opacity-60 hover:border-blue-500/50 hover:opacity-100'}`}
              >
                <div className="flex items-center truncate">
                  <Check size={13} strokeWidth={4} className={`mr-2 shrink-0 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-20'}`} />
                  <span className="truncate">{type}</span>
                </div>
                {isSelected && currentAdj > 0 && (
                  <span className="ml-1 rounded bg-black/20 px-1.5 py-0.5 text-[11px] font-black text-amber-300">
                    +{currentAdj}%
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Mini Calculator for Print Time Overrun */}
        {(() => {
          const selectedTypes = (formData.compatibleFilamentTypes || []).length > 0
            ? formData.compatibleFilamentTypes
            : filamentTypes;
          
          const effectiveTargetType = (calcTargetType && selectedTypes.includes(calcTargetType))
            ? calcTargetType
            : (selectedTypes[0] || '');

          const slicerTotalMins = (numberValue(calcSlicerHrs, 0) * 60) + numberValue(calcSlicerMins, 0);
          const actualTotalMins = (numberValue(calcActualHrs, 0) * 60) + numberValue(calcActualMins, 0);
          const hasInputs = slicerTotalMins > 0 && actualTotalMins > 0;
          const calculatedPct = (hasInputs && actualTotalMins > slicerTotalMins)
            ? Math.round(((actualTotalMins - slicerTotalMins) / slicerTotalMins) * 100 * 10) / 10
            : 0;
          const extraMins = actualTotalMins > slicerTotalMins ? actualTotalMins - slicerTotalMins : 0;

          return (
            <div className="mt-4 space-y-3 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowCalculator(!showCalculator)}
                  className="flex items-center gap-2 text-[13px] font-black uppercase tracking-widest text-blue-500 transition-opacity hover:opacity-80"
                >
                  <Calculator size={16} />
                  <span>Print Time Overrun Calculator</span>
                  {showCalculator ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-40">
                  Find % increase from slicer
                </span>
              </div>

              {showCalculator && (
                <div className="space-y-3 pt-2 animate-in slide-in-from-top-2 duration-200">
                  <p className="text-[12px] font-bold text-[var(--color-text-main)] opacity-70">
                    Enter the slicer estimate and actual measured print time for a test print to calculate how much extra time this filament takes.
                  </p>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="space-y-1">
                      <span className="text-[11px] font-black uppercase tracking-widest opacity-40">Target Filament</span>
                      <select
                        value={effectiveTargetType}
                        onChange={(e) => setCalcTargetType(e.target.value)}
                        className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[13px] font-bold text-[var(--color-text-main)] outline-none focus:border-blue-500"
                      >
                        {selectedTypes.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </label>

                    <div className="space-y-1">
                      <span className="text-[11px] font-black uppercase tracking-widest opacity-40">Slicer Estimated Time</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="number"
                          min="0"
                          value={calcSlicerHrs}
                          onChange={(e) => setCalcSlicerHrs(e.target.value)}
                          placeholder="Hrs"
                          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-2 text-[13px] font-bold text-[var(--color-text-main)] outline-none focus:border-blue-500"
                        />
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={calcSlicerMins}
                          onChange={(e) => setCalcSlicerMins(e.target.value)}
                          placeholder="Mins"
                          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-2 text-[13px] font-bold text-[var(--color-text-main)] outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[11px] font-black uppercase tracking-widest opacity-40">Actual Measured Time</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="number"
                          min="0"
                          value={calcActualHrs}
                          onChange={(e) => setCalcActualHrs(e.target.value)}
                          placeholder="Hrs"
                          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-2 text-[13px] font-bold text-[var(--color-text-main)] outline-none focus:border-blue-500"
                        />
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={calcActualMins}
                          onChange={(e) => setCalcActualMins(e.target.value)}
                          placeholder="Mins"
                          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-2 text-[13px] font-bold text-[var(--color-text-main)] outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {hasInputs && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3">
                      <div>
                        <div className="text-[14px] font-black uppercase tracking-tight text-blue-600 dark:text-blue-400">
                          {calculatedPct > 0 ? `+${calculatedPct}% Print Time Overrun` : 'No overrun (prints on time or faster)'}
                        </div>
                        <div className="text-[12px] font-bold opacity-60">
                          {extraMins > 0 ? `${extraMins} mins slower than slicer estimate` : 'Measured time does not exceed slicer estimate'}
                        </div>
                      </div>

                      {calculatedPct > 0 && effectiveTargetType && (
                        <button
                          type="button"
                          onClick={() => {
                            updateAdjustment(effectiveTargetType, calculatedPct);
                            // Also ensure target type is selected in compatibleFilamentTypes if not already
                            if (!(formData.compatibleFilamentTypes || []).includes(effectiveTargetType)) {
                              updateField('compatibleFilamentTypes', [...(formData.compatibleFilamentTypes || []), effectiveTargetType]);
                            }
                          }}
                          className="rounded-xl bg-blue-600 px-3.5 py-2 text-[12px] font-black uppercase tracking-wider text-white shadow-md transition-transform hover:scale-105"
                        >
                          Apply +{calculatedPct}% to {effectiveTargetType}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Configured Per-Filament Adjustment Inputs */}
        {(() => {
          const activeTypes = (formData.compatibleFilamentTypes || []).length > 0
            ? formData.compatibleFilamentTypes
            : [];

          if (activeTypes.length === 0) return null;

          return (
            <div className="mt-3 space-y-2 rounded-2xl border border-[var(--color-border)] bg-black/5 p-4 dark:bg-white/5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-black uppercase tracking-widest opacity-60">
                  Print Time Increase (%) Per Filament
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-40">
                  Labor & Electricity Adjustments
                </span>
              </div>
              <p className="text-[12px] font-bold opacity-50">
                Adds extra hours to labor monitoring and electricity calculations for filaments that print slower than slicer estimates.
              </p>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {activeTypes.map((type) => {
                  const val = formData.printTimeAdjustments?.[type] ?? '';
                  return (
                    <div key={type} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5">
                      <span className="truncate text-[13px] font-black uppercase tracking-tight opacity-70">
                        {type}
                      </span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="500"
                          step="0.5"
                          value={val}
                          onChange={(e) => updateAdjustment(type, e.target.value)}
                          placeholder="0"
                          className="w-16 rounded-lg border border-[var(--color-border)] bg-transparent px-2 py-1 text-right text-[13px] font-black text-blue-600 outline-none focus:border-blue-500"
                        />
                        <span className="text-[12px] font-black opacity-40">%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
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

  const renderFeederEditor = () => (
    <div className="space-y-4 rounded-[2rem] border border-[var(--color-border)] bg-black/5 p-5 dark:bg-white/5 animate-in slide-in-from-top-4 duration-300">
      <div className="grid grid-cols-2 gap-3">
        {renderFeederInput('Feeder ID (optional)', 'id', 'text', { placeholder: 'feeder-01' })}
        {renderFeederInput('Name', 'name', 'text', { placeholder: 'AMS / CFS UNIT 1' })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {renderFeederInput('Type', 'type', 'text', { placeholder: 'CFS' })}
        {renderFeederInput('Filament slots', 'filamentSlots', 'number', { min: '1' })}
      </div>
      <label className="block space-y-1 text-left">
        <span className="ml-2 text-[13px] font-black uppercase tracking-widest opacity-40">Status</span>
        <select value={feederForm.status} onChange={(event) => updateFeederField('status', event.target.value)} className="w-full appearance-none rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[14px] font-bold text-[var(--color-text-main)] outline-none focus:border-blue-500">
          {PRINTER_STATUSES.map((status) => (
            <option key={status} value={status}>{status.toUpperCase()}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        {renderFeederInput('Swap time (min)', 'swapTime', 'number', { min: '0', step: '0.1' })}
        {renderFeederInput('Power (W)', 'wattage', 'number', { min: '0' })}
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={closeEditor} className="flex-1 rounded-xl bg-black/5 py-3 text-[13px] font-black uppercase tracking-widest dark:bg-white/5">
          <Undo2 size={12} className="mr-2 inline" /> Cancel
        </button>
        <button type="button" onClick={handleSaveFeeder} disabled={isSaving} className="flex-[2] rounded-xl bg-blue-600 py-3 text-[13px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 disabled:opacity-50">
          <Check size={12} strokeWidth={4} className="mr-2 inline" /> {isSaving ? 'Saving...' : editingFeederId ? 'Update Feeder' : 'Save Feeder'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-0 backdrop-blur-sm animate-in fade-in duration-300 md:p-4">
      <div className="flex h-full w-full flex-col overflow-hidden border-0 border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-main)] shadow-2xl md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-[2.5rem] md:border">
        <div className="sticky top-0 z-[220] h-0 w-full overflow-visible md:hidden">
          <button onClick={onClose} className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/20 p-2 text-white shadow-lg backdrop-blur-md">
            <X size={20} />
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-[var(--color-border)] p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-600 p-2.5"><Printer size={20} className="text-white" /></div>
            <div>
              <h2 className="text-[15px] font-black uppercase italic leading-none">{managerMode === 'printers' ? 'Printer Manager' : 'Feeder Manager'}</h2>
              <span className="mt-1 block text-[13px] font-black uppercase tracking-widest text-blue-500 opacity-80">Printers, feeders & production specifications</span>
            </div>
          </div>
          <button onClick={onClose} className="hidden rounded-full p-2 opacity-40 transition-colors hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5 md:block"><X size={24} /></button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { closeEditor(); setManagerMode('printers'); }} className={`rounded-2xl px-4 py-2 text-[13px] font-black uppercase tracking-widest ${managerMode === 'printers' ? 'bg-blue-600 text-white' : 'bg-black/5 opacity-60 dark:bg-white/5'}`}>
              <Printer size={14} className="mr-2 inline" /> Printers
            </button>
            <button type="button" onClick={() => { closeEditor(); setManagerMode('feeders'); }} className={`rounded-2xl px-4 py-2 text-[13px] font-black uppercase tracking-widest ${managerMode === 'feeders' ? 'bg-blue-600 text-white' : 'bg-black/5 opacity-60 dark:bg-white/5'}`}>
              <Layers2 size={14} className="mr-2 inline" /> Feeders
            </button>
          </div>

          <div className="flex gap-3">
            <div className="group relative flex-1">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20 group-focus-within:text-blue-500 group-focus-within:opacity-100" />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={`SEARCH ${managerMode.toUpperCase()}...`} className="w-full rounded-3xl border border-[var(--color-border)] bg-black/5 py-4 pl-12 pr-4 text-[14px] font-black uppercase tracking-widest outline-none transition-all focus:border-blue-500/50 dark:bg-white/5" />
            </div>
            <button type="button" onClick={isAdding ? closeEditor : managerMode === 'printers' ? beginAdd : beginAddFeeder} className={`flex shrink-0 items-center justify-center gap-2 rounded-3xl border px-5 text-[13px] font-black uppercase tracking-widest transition-all active:scale-95 ${isAdding ? 'border-zinc-700 bg-zinc-800 text-white' : 'border-blue-500 bg-blue-600 text-white shadow-lg'}`}>
              {isAdding ? <X size={14} strokeWidth={3} /> : <Plus size={14} strokeWidth={4} />}
              {isAdding ? 'Close' : managerMode === 'printers' ? 'Register printer' : 'Register feeder'}
            </button>
          </div>

          {isAdding && (managerMode === 'printers' ? renderEditor() : renderFeederEditor())}

          <div className="space-y-3">
            {managerMode === 'printers' && visiblePrinters.length === 0 && <div className="rounded-3xl border border-dashed border-[var(--color-border)] px-6 py-12 text-center text-[13px] font-black uppercase tracking-widest opacity-40">No printers found</div>}
            {managerMode === 'printers' && visiblePrinters.map((printer) => {
              const isEditing = String(editingId) === String(printer.id);
              const capacity = printer.buildCapacity || {};
              const status = normalizePrinterStatus(printer.status, printer);

              return (
                <div
                  key={printer.id}
                  onClick={() => { if (!isEditing) beginEdit(printer); }}
                  className={`group cursor-pointer rounded-3xl border p-4 transition-all ${isEditing ? 'border-blue-500 bg-blue-500/5 ring-4 ring-blue-500/10' : 'border-[var(--color-border)] bg-black/5 hover:border-blue-500/40 dark:bg-white/5'}`}
                >
                  {isEditing ? renderEditor() : (
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-4 text-left">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-600"><Printer size={22} /></div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="truncate text-[15px] font-black uppercase italic leading-none">{printer.brand || 'UNKNOWN'} {printer.model || printer.name || 'PRINTER'}</h4>
                            <span className={`rounded px-1.5 py-0.5 text-[13px] font-black uppercase tracking-widest ${statusTone(status)}`}>{status}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-black uppercase tracking-widest opacity-50">
                            <span><Gauge size={10} className="mr-1 inline" />{capacity.x || 0} × {capacity.y || 0} × {capacity.z || 0} MM</span>
                            <span><Zap size={10} className="mr-1 inline" />{numberValue(printer.wattage)}W</span>
                            <span><Layers2 size={10} className="mr-1 inline" />{numberValue(printer.nozzleSize, 0.4)}MM</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); togglePrinterStatus(printer); }}
                          disabled={statusUpdatingId === `printer:${printer.id}`}
                          className="rounded-xl p-2.5 text-[var(--color-text-main)] transition-all hover:bg-blue-600 hover:text-white disabled:cursor-wait disabled:opacity-50"
                          aria-label={`Set ${printer.model || printer.name || 'printer'} status to ${getNextStatus(status)}`}
                        >
                          <PrinterStatusIcon status={status} size={18} strokeWidth={2.5} />
                        </button>
                        <button type="button" onClick={(event) => { event.stopPropagation(); handleDelete(printer); }} className="rounded-xl p-2.5 text-red-500 transition-all hover:bg-red-600 hover:text-white" aria-label={`Delete ${printer.model || printer.name || 'printer'}`}><Trash2 size={18} /></button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {managerMode === 'feeders' && visibleFeeders.length === 0 && <div className="rounded-3xl border border-dashed border-[var(--color-border)] px-6 py-12 text-center text-[13px] font-black uppercase tracking-widest opacity-40">No feeders found</div>}
            {managerMode === 'feeders' && visibleFeeders.map((feeder) => {
              const isEditing = String(editingFeederId) === String(feeder.id);
              const status = normalizePrinterStatus(feeder.status, feeder);
              return (
                <div
                  key={feeder.id}
                  onClick={() => { if (!isEditing) beginEditFeeder(feeder); }}
                  className={`group cursor-pointer rounded-3xl border p-4 transition-all ${isEditing ? 'border-blue-500 bg-blue-500/5 ring-4 ring-blue-500/10' : 'border-[var(--color-border)] bg-black/5 hover:border-blue-500/40 dark:bg-white/5'}`}
                >
                  {isEditing ? renderFeederEditor() : (
                    <div className="flex items-center justify-between gap-4 text-left">
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600"><Layers2 size={22} /></div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="truncate text-[15px] font-black uppercase italic leading-none">{feeder.name || feeder.id || 'FEEDER'}</h4>
                            <span className={`rounded px-1.5 py-0.5 text-[13px] font-black uppercase tracking-widest ${statusTone(status)}`}>{status}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-black uppercase tracking-widest opacity-50">
                            <span>{String(feeder.type || feeder.compatibility || 'UNKNOWN').toUpperCase()}</span>
                            <span>{numberValue(feeder.filamentSlots)} SLOTS</span>
                            <span><Zap size={10} className="mr-1 inline" />{numberValue(feeder.wattage)}W</span>
                            <span>{numberValue(feeder.swapTime)}M SWAP</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); toggleFeederStatus(feeder); }}
                          disabled={statusUpdatingId === `feeder:${feeder.id}`}
                          className="rounded-xl p-2.5 text-[var(--color-text-main)] transition-all hover:bg-blue-600 hover:text-white disabled:cursor-wait disabled:opacity-50"
                          aria-label={`Set ${feeder.name || feeder.id || 'feeder'} status to ${getNextStatus(status)}`}
                        >
                          <PrinterStatusIcon status={status} size={18} strokeWidth={2.5} />
                        </button>
                        <button type="button" onClick={(event) => { event.stopPropagation(); handleDeleteFeeder(feeder); }} className="rounded-xl p-2.5 text-red-500 transition-all hover:bg-red-600 hover:text-white" aria-label={`Delete ${feeder.name || feeder.id || 'feeder'}`}><Trash2 size={18} /></button>
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
