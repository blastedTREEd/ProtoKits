import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Layers, PackagePlus, X } from 'lucide-react';
import UniversalImage from '../common/UniversalImage';

const numberValue = (value) => Number.parseFloat(String(value ?? '').replace(/,/g, '')) || 0;

const getImageUrl = (project) => {
  const image = project?.image;
  if (typeof image === 'string' && (image.startsWith('/') || image.startsWith('data:') || image.startsWith('http'))) return image;
  if (typeof image === 'string') return project?.images?.find((candidate) => candidate?.id === image)?.url || '';
  return image?.url || '';
};

const getSourceMaterialIds = (source) => {
  const ids = [
    ...(source?.filaments || []).map((filament) => filament?.id || filament?.materialId),
    ...(source?.projectDetails || []).flatMap((detail) => [
      detail?.materialId,
      ...(detail?.materialIds || []),
      ...(detail?.materials || []).map((material) => material?.materialId || material?.id),
      ...(detail?.materialSlots || []).map((slot) => slot?.materialId || slot?.id),
      ...(detail?.productionJobs || []).flatMap((job) => job?.materialIds || [])
    ])
  ];
  return [...new Set(ids.filter(Boolean).map(String))];
};

const getSourceMaterials = (source, inventory) => {
  const sourceFilaments = (source?.filaments || []).filter(Boolean);
  const ids = getSourceMaterialIds(source);
  const candidates = ids.map((id) => (
    (inventory || []).find((material) => String(material.id) === id)
      || sourceFilaments.find((material) => String(material.id || material.materialId) === id)
  )).filter(Boolean);

  return candidates.filter((material, index, list) => (
    list.findIndex((candidate) => String(candidate.id || candidate.materialId) === String(material.id || material.materialId)) === index
  ));
};

const getPerPieceCost = (source) => {
  const totals = source?.totals || {};
  const total = numberValue(totals.total || totals.basePrice);
  const labor = numberValue(totals.labor);
  const quantity = Math.max(1, numberValue(source?.projectDetails?.[0]?.quantity) || 1);
  return Math.max(0, Math.ceil(Math.max(0, total - labor) / quantity));
};

const fieldClass = 'w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-[13px] font-black outline-none transition-colors focus:border-blue-500';
const numberFieldClass = `${fieldClass} appearance-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;

export default function PrintedProjectModal({ isOpen, onClose, estimations = [], filamentInventory = [], onSave }) {
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState({
    name: '', description: '', length: '', width: '', height: '', stockNumber: '', costPrice: '', sellPrice: ''
  });
  const [isSaving, setIsSaving] = useState(false);

  const sources = useMemo(() => (
    estimations
      .filter((project) => String(project?.method?.name || '').toUpperCase() === '3MF')
      .sort((a, b) => String(a?.projectName || '').localeCompare(String(b?.projectName || '')))
  ), [estimations]);
  const selectedSource = sources.find((source) => String(source.id) === String(selectedId)) || null;
  const importedMaterials = useMemo(() => getSourceMaterials(selectedSource, filamentInventory), [selectedSource, filamentInventory]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedId('');
      setForm({ name: '', description: '', length: '', width: '', height: '', stockNumber: '', costPrice: '', sellPrice: '' });
      setIsSaving(false);
      return;
    }
    const firstSource = sources[0];
    if (!firstSource) return;
    setSelectedId(String(firstSource.id));
    setForm((previous) => ({
      ...previous,
      name: firstSource.projectName || '',
      costPrice: String(getPerPieceCost(firstSource)),
      sellPrice: String(getPerPieceCost(firstSource)),
      stockNumber: previous.stockNumber || `PRINT-${Date.now().toString().slice(-6)}`
    }));
  }, [isOpen, sources]);

  useEffect(() => {
    if (!selectedSource) return;
    const cost = getPerPieceCost(selectedSource);
    setForm((previous) => ({
      ...previous,
      name: previous.name || selectedSource.projectName || '',
      costPrice: String(cost),
      sellPrice: previous.sellPrice || String(cost)
    }));
  }, [selectedSource]);

  if (!isOpen) return null;

  const update = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));

  const handleSave = async (event) => {
    event.preventDefault();
    if (!selectedSource) return alert('Select a saved 3MF estimation first.');
    if (!form.name.trim() || !form.stockNumber.trim()) return alert('Project name and stock no. are required.');
    if (![form.length, form.width, form.height].every((value) => numberValue(value) > 0)) return alert('Enter all dimensions in millimeters.');
    if (numberValue(form.sellPrice) <= 0) return alert('Enter a sell price greater than zero.');

    const materialRecords = importedMaterials.map((material) => ({
      id: material.id || material.materialId || '',
      brand: material.brand || '',
      type: material.type || '',
      color: material.color || '',
      colorName: material.colorName || material.name || ''
    }));
    const primaryMaterial = materialRecords[0] || {};
    const stockKey = `printed_stock_${Date.now()}`;
    const sellPrice = numberValue(form.sellPrice);
    const costPrice = numberValue(form.costPrice);
    const image = getImageUrl(selectedSource);

    setIsSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        projectName: form.name.trim(),
        description: form.description.trim(),
        image,
        images: image ? [{ id: 'cover', url: image, type: 'PROJECT IMAGE', isGridImage: true }] : [],
        material: primaryMaterial,
        materials: materialRecords,
        dimensions: { l: numberValue(form.length), w: numberValue(form.width), h: numberValue(form.height), unit: 'mm' },
        specifications: {
          material: materialRecords,
          dimensions: { length: numberValue(form.length), width: numberValue(form.width), height: numberValue(form.height), unit: 'mm' }
        },
        costPrice,
        sellPrice,
        stockNo: form.stockNumber.trim(),
        stocks: {
          [stockKey]: {
            key: stockKey,
            stockNo: form.stockNumber.trim(),
            status: 'Onhand',
            costPrice,
            sellPrice,
            minDownpayment: 0,
            publicReleaseDate: ''
          }
        },
        sourceEstimationId: selectedSource.id,
        sourceEstimationName: selectedSource.projectName || selectedSource.id,
        canAddToBasket: true,
        hasAvailableStock: true
      });
      onClose();
    } catch (error) {
      alert(error?.message || 'Unable to save printed project.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6">
      <form onSubmit={handleSave} className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4 sm:px-7">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-600">Printed inventory</p>
            <h2 className="text-xl font-black italic uppercase tracking-tight">Add printed project</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 transition-colors hover:bg-black/10 dark:hover:bg-white/10" aria-label="Close"><X size={20} /></button>
        </div>

        <div className="grid min-h-0 gap-5 overflow-y-auto p-5 sm:p-7 lg:grid-cols-[1fr_1.2fr]">
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-blue-600"><Layers size={16} /> Select 3MF basis</div>
            <div className="space-y-2 rounded-3xl border border-[var(--color-border)] bg-black/[.03] p-2 dark:bg-white/[.03]">
              {sources.length === 0 ? <p className="p-4 text-[12px] font-bold uppercase opacity-50">No saved 3MF estimations found.</p> : sources.map((source) => (
                <button key={source.id} type="button" onClick={() => { setSelectedId(String(source.id)); setForm((previous) => ({ ...previous, name: source.projectName || '', costPrice: String(getPerPieceCost(source)), sellPrice: String(getPerPieceCost(source)) })); }} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all ${String(source.id) === String(selectedId) ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-blue-600/10'}`}>
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-black/10"><UniversalImage src={getImageUrl(source)} alt="" className="h-full w-full object-cover" /></div>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-black uppercase">{source.projectName || 'Unnamed 3MF estimation'}</span>
                  {String(source.id) === String(selectedId) ? <Check size={17} /> : <ChevronRight size={16} className="opacity-30" />}
                </button>
              ))}
            </div>
            {selectedSource && <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-[11px] font-bold uppercase leading-relaxed text-blue-700 dark:text-blue-300">The calculator breakdown stays private. Only the material specification and admin-entered dimensions will be published.</div>}
          </section>

          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest opacity-50">Project name</span><input className={fieldClass} value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Printed project name" /></label>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest opacity-50">Description (optional)</span><textarea className={`${fieldClass} min-h-20 resize-y`} value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Short public description" /></label>
              <div className="sm:col-span-2"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest opacity-50">Imported material</span><div className="flex min-h-12 flex-wrap items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-black/[.03] p-3 dark:bg-white/[.03]">{importedMaterials.length ? importedMaterials.map((material) => <span key={material.id} className="rounded-full bg-blue-600/10 px-3 py-1.5 text-[10px] font-black uppercase text-blue-600">{[material.brand, material.type, material.colorName || material.name].filter(Boolean).join(' · ')}</span>) : <span className="text-[11px] font-bold uppercase opacity-50">No material metadata found</span>}</div></div>
              <label><span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest opacity-50">Length (mm)</span><input className={numberFieldClass} type="number" min="0" value={form.length} onChange={(event) => update('length', event.target.value)} placeholder="0" /></label>
              <label><span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest opacity-50">Width (mm)</span><input className={numberFieldClass} type="number" min="0" value={form.width} onChange={(event) => update('width', event.target.value)} placeholder="0" /></label>
              <label><span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest opacity-50">Height (mm)</span><input className={numberFieldClass} type="number" min="0" value={form.height} onChange={(event) => update('height', event.target.value)} placeholder="0" /></label>
              <label><span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest opacity-50">Stock no.</span><input className={fieldClass} value={form.stockNumber} onChange={(event) => update('stockNumber', event.target.value)} placeholder="PRINT-0001" /></label>
              <label><span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest opacity-50">Cost price / pc</span><input className={numberFieldClass} type="number" min="0" value={form.costPrice} onChange={(event) => update('costPrice', event.target.value)} /></label>
              <label><span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest opacity-50">Sell price / pc</span><input className={numberFieldClass} type="number" min="0" value={form.sellPrice} onChange={(event) => update('sellPrice', event.target.value)} /></label>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[var(--color-border)] px-5 py-4 sm:px-7"><button type="button" onClick={onClose} className="rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-widest opacity-60 hover:opacity-100">Cancel</button><button type="submit" disabled={isSaving || sources.length === 0} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/25 disabled:cursor-not-allowed disabled:opacity-40"><PackagePlus size={16} />{isSaving ? 'Saving...' : 'Create printed project'}</button></div>
      </form>
    </div>
  );
}
