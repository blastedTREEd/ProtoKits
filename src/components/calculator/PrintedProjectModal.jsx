import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Layers, PackagePlus, Plus, Trash2, X } from 'lucide-react';
import UniversalImage from '../common/UniversalImage';

const numberValue = (value) => Number.parseFloat(String(value ?? '').replace(/,/g, '')) || 0;
const isOccupiedStock = (stock) => Boolean(
  stock?.isReserved
  || stock?.order?.orderId
  || stock?.order?.orderDocId
);

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

export default function PrintedProjectModal({ isOpen, onClose, estimations = [], filamentInventory = [], onSave, initialProject = null }) {
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState({
    name: '', description: '', length: '', width: '', height: '', quantity: '1', costPrice: '', sellPrice: ''
  });
  const [models, setModels] = useState([
    { id: 'model-1', name: '', length: '', width: '', height: '', materialId: '' }
  ]);
  const [isSaving, setIsSaving] = useState(false);

  const sources = useMemo(() => (
    estimations
      .filter((project) => String(project?.method?.name || '').toUpperCase() === '3MF')
      .sort((a, b) => String(a?.projectName || '').localeCompare(String(b?.projectName || '')))
  ), [estimations]);
  const selectedSource = sources.find((source) => String(source.id) === String(selectedId)) || null;
  const importedMaterials = useMemo(() => {
    const sourceMaterials = getSourceMaterials(selectedSource, filamentInventory);
    if (sourceMaterials.length > 0) return sourceMaterials;
    if (Array.isArray(initialProject?.materials) && initialProject.materials.length > 0) return initialProject.materials;
    return initialProject?.material ? [initialProject.material] : [];
  }, [initialProject, selectedSource, filamentInventory]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedId('');
      setForm({ name: '', description: '', length: '', width: '', height: '', quantity: '1', costPrice: '', sellPrice: '' });
      setModels([{ id: 'model-1', name: '', length: '', width: '', height: '', materialId: '' }]);
      setIsSaving(false);
      return;
    }
    const firstSource = sources[0];
    const editingProject = initialProject?.id ? initialProject : null;
    const editSource = editingProject
      ? sources.find((source) => String(source.id) === String(editingProject.sourceEstimationId))
        || sources.find((source) => String(source.projectName || '').trim() === String(editingProject.sourceEstimationName || '').trim())
      : null;
    const source = editSource || firstSource;
    if (!source && !editingProject) return;

    const stockEntries = Object.entries(editingProject?.stocks || {});
    const availableStocks = stockEntries.filter(([, stock]) => !isOccupiedStock(stock));
    const firstStock = availableStocks[0]?.[1] || stockEntries[0]?.[1] || {};
    const dimensions = editingProject?.dimensions || editingProject?.specifications?.dimensions || {};

    setSelectedId(source ? String(source.id) : '');
    setForm({
      name: editingProject?.name || editingProject?.projectName || source?.projectName || '',
      description: editingProject?.description || '',
      length: String(dimensions.l ?? dimensions.length ?? ''),
      width: String(dimensions.w ?? dimensions.width ?? ''),
      height: String(dimensions.h ?? dimensions.height ?? ''),
      quantity: String(availableStocks.length || editingProject?.quantity || 1),
      costPrice: String(firstStock.costPrice ?? editingProject?.costPrice ?? (source ? getPerPieceCost(source) : 0)),
      sellPrice: String(firstStock.sellPrice ?? editingProject?.sellPrice ?? (source ? getPerPieceCost(source) : 0))
    });
  }, [initialProject, isOpen, sources]);

  useEffect(() => {
    if (!selectedSource) return;
    const cost = getPerPieceCost(selectedSource);
    const firstMatId = importedMaterials[0]?.id || importedMaterials[0]?.materialId || '';
    const sourceDetails = selectedSource.projectDetails || [];
    
    const projectDetails = initialProject?.sourceEstimationId
      && String(initialProject.sourceEstimationId) === String(selectedSource.id)
      && Array.isArray(initialProject.projectDetails)
      && initialProject.projectDetails.length > 0
      ? initialProject.projectDetails
      : sourceDetails;
    const initialModels = projectDetails.length > 0 ? projectDetails.map((detail, index) => ({
      id: `model-${index + 1}`,
      name: detail.name || detail.itemName || selectedSource.projectName || `Model #${index + 1}`,
      length: String(detail.dimensions?.l || detail.dimensions?.length || selectedSource.dimensions?.l || selectedSource.dimensions?.length || ''),
      width: String(detail.dimensions?.w || detail.dimensions?.width || selectedSource.dimensions?.w || selectedSource.dimensions?.width || ''),
      height: String(detail.dimensions?.h || detail.dimensions?.height || selectedSource.dimensions?.h || selectedSource.dimensions?.height || ''),
      materialId: String(detail.materialId || detail.material?.id || firstMatId)
    })) : [
      {
        id: 'model-1',
        name: selectedSource.projectName || '',
        length: String(selectedSource.dimensions?.l || selectedSource.dimensions?.length || ''),
        width: String(selectedSource.dimensions?.w || selectedSource.dimensions?.width || ''),
        height: String(selectedSource.dimensions?.h || selectedSource.dimensions?.height || ''),
        materialId: String(firstMatId)
      }
    ];

    setForm((previous) => ({
      ...previous,
      name: previous.name || selectedSource.projectName || '',
      costPrice: previous.costPrice || String(cost),
      sellPrice: previous.sellPrice || String(cost),
      length: previous.length || String(selectedSource.dimensions?.l || selectedSource.dimensions?.length || ''),
      width: previous.width || String(selectedSource.dimensions?.w || selectedSource.dimensions?.width || ''),
      height: previous.height || String(selectedSource.dimensions?.h || selectedSource.dimensions?.height || '')
    }));
    setModels(initialModels);
  }, [initialProject, selectedSource, importedMaterials]);

  if (!isOpen) return null;

  const update = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));

  const updateModel = (index, field, value) => {
    setModels((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addModel = () => {
    const firstMatId = importedMaterials[0]?.id || importedMaterials[0]?.materialId || '';
    setModels((prev) => [
      ...prev,
      {
        id: `model-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: '',
        length: '',
        width: '',
        height: '',
        materialId: String(firstMatId)
      }
    ]);
  };

  const removeModel = (index) => {
    if (models.length <= 1) return;
    setModels((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!selectedSource) return alert('Select a saved 3MF estimation first.');
    if (!form.name.trim()) return alert('Project name is required.');
    const quantity = Math.max(1, Math.floor(numberValue(form.quantity)));
    if (numberValue(form.sellPrice) <= 0) return alert('Enter a sell price greater than zero.');

    const materialRecords = importedMaterials.map((material) => ({
      id: material.id || material.materialId || '',
      brand: material.brand || '',
      type: material.type || '',
      color: material.color || '',
      colorName: material.colorName || material.name || ''
    }));
    const primaryMaterial = materialRecords[0] || {};
    const sellPrice = numberValue(form.sellPrice);
    const costPrice = numberValue(form.costPrice);
    const image = getImageUrl(selectedSource);

    // Build project details from model list
    const projectDetails = models.map((model, idx) => {
      const selectedMat = importedMaterials.find((m) => String(m.id || m.materialId) === String(model.materialId)) || importedMaterials[0] || {};
      return {
        itemName: model.name.trim() || `Model #${idx + 1}`,
        name: model.name.trim() || `Model #${idx + 1}`,
        dimensions: {
          l: numberValue(model.length),
          w: numberValue(model.width),
          h: numberValue(model.height),
          unit: 'mm'
        },
        material: {
          brand: selectedMat.brand || primaryMaterial.brand || '',
          type: selectedMat.type || primaryMaterial.type || '',
          color: selectedMat.color || primaryMaterial.color || '',
          colorName: selectedMat.colorName || selectedMat.name || primaryMaterial.colorName || primaryMaterial.name || ''
        }
      };
    });

    const maxL = Math.max(...models.map(m => numberValue(m.length)), numberValue(form.length));
    const maxW = Math.max(...models.map(m => numberValue(m.width)), numberValue(form.width));
    const maxH = Math.max(...models.map(m => numberValue(m.height)), numberValue(form.height));
    const existingStockEntries = Object.entries(initialProject?.stocks || {});
    const protectedStocks = existingStockEntries.filter(([, stock]) => isOccupiedStock(stock));
    if (quantity < protectedStocks.length) {
      return alert(`Quantity cannot be lower than the ${protectedStocks.length} reserved or sold unit${protectedStocks.length === 1 ? '' : 's'} already recorded.`);
    }

    const retainedAvailableStocks = existingStockEntries
      .filter(([, stock]) => !isOccupiedStock(stock))
      .slice(0, quantity)
      .map(([stockKey, stock]) => [stockKey, { ...stock, key: stockKey, costPrice, sellPrice }]);
    const stockBatchId = Date.now();
    const newStocks = Array.from({ length: Math.max(0, quantity - retainedAvailableStocks.length) }, (_, index) => {
      const stockKey = `printed_stock_${stockBatchId}_${index + 1}`;
      return [stockKey, {
        key: stockKey,
        status: 'Onhand',
        costPrice,
        sellPrice,
        minDownpayment: 0,
        publicReleaseDate: ''
      }];
    });
    const stocks = Object.fromEntries([...protectedStocks, ...retainedAvailableStocks, ...newStocks]);

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
        projectDetails,
        dimensions: { l: maxL, w: maxW, h: maxH, unit: 'mm' },
        specifications: {
          material: materialRecords,
          dimensions: { length: maxL, width: maxW, height: maxH, unit: 'mm' }
        },
        quantity,
        costPrice,
        sellPrice,
        stocks,
        sourceEstimationId: selectedSource.id,
        sourceEstimationName: selectedSource.projectName || selectedSource.id,
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
            <h2 className="text-xl font-black italic uppercase tracking-tight">{initialProject?.id ? 'Edit printed project' : 'Add printed project'}</h2>
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
              
              <div className="sm:col-span-2"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest opacity-50">Imported materials</span><div className="flex min-h-12 flex-wrap items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-black/[.03] p-3 dark:bg-white/[.03]">{importedMaterials.length ? importedMaterials.map((material) => <span key={material.id || material.materialId} className="rounded-full bg-blue-600/10 px-3 py-1.5 text-[10px] font-black uppercase text-blue-600">{[material.brand, material.type, material.colorName || material.name].filter(Boolean).join(' · ')}</span>) : <span className="text-[11px] font-bold uppercase opacity-50">No material metadata found</span>}</div></div>

              {/* Models List Section */}
              <div className="sm:col-span-2 space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-600">Model list & specs</span>
                </div>

                {models.map((model, idx) => (
                  <div key={model.id || idx} className="rounded-2xl border border-[var(--color-border)] bg-black/[.02] p-4 dark:bg-white/[.02] space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Model #{idx + 1}</span>
                      {models.length > 1 && (
                        <button type="button" onClick={() => removeModel(idx)} className="text-red-500 hover:text-red-700 transition-colors p-1" title="Remove model">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest opacity-50">Model Name</span>
                      <input className={fieldClass} value={model.name} onChange={(e) => updateModel(idx, 'name', e.target.value)} placeholder={`Model #${idx + 1} Name`} />
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <label><span className="mb-1 block text-[9px] font-black uppercase tracking-widest opacity-50">Length (mm)</span><input className={numberFieldClass} type="number" min="0" value={model.length} onChange={(e) => updateModel(idx, 'length', e.target.value)} placeholder="0" /></label>
                      <label><span className="mb-1 block text-[9px] font-black uppercase tracking-widest opacity-50">Width (mm)</span><input className={numberFieldClass} type="number" min="0" value={model.width} onChange={(e) => updateModel(idx, 'width', e.target.value)} placeholder="0" /></label>
                      <label><span className="mb-1 block text-[9px] font-black uppercase tracking-widest opacity-50">Height (mm)</span><input className={numberFieldClass} type="number" min="0" value={model.height} onChange={(e) => updateModel(idx, 'height', e.target.value)} placeholder="0" /></label>
                    </div>
                    {importedMaterials.length > 0 && (
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-black uppercase tracking-widest opacity-50">Material</span>
                        <select className={fieldClass} value={model.materialId} onChange={(e) => updateModel(idx, 'materialId', e.target.value)}>
                          {importedMaterials.map((mat) => (
                            <option key={mat.id || mat.materialId} value={mat.id || mat.materialId}>
                              {[mat.brand, mat.type, mat.colorName || mat.name].filter(Boolean).join(' · ')}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                ))}

                <button type="button" onClick={addModel} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-blue-500/40 p-3 text-[11px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-600/10 transition-all">
                  <Plus size={16} /> Add Model
                </button>
              </div>

              <label><span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest opacity-50">Quantity available</span><input className={numberFieldClass} type="number" min="1" step="1" value={form.quantity} onChange={(event) => update('quantity', event.target.value)} /></label>
              <label><span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest opacity-50">Cost price / pc</span><input className={numberFieldClass} type="number" min="0" value={form.costPrice} onChange={(event) => update('costPrice', event.target.value)} /></label>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest opacity-50">Sell price / pc</span><input className={numberFieldClass} type="number" min="0" value={form.sellPrice} onChange={(event) => update('sellPrice', event.target.value)} /></label>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[var(--color-border)] px-5 py-4 sm:px-7"><button type="button" onClick={onClose} className="rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-widest opacity-60 hover:opacity-100">Cancel</button><button type="submit" disabled={isSaving || sources.length === 0} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/25 disabled:cursor-not-allowed disabled:opacity-40"><PackagePlus size={16} />{isSaving ? 'Saving...' : initialProject?.id ? 'Save changes' : 'Create printed project'}</button></div>
      </form>
    </div>
  );
}
