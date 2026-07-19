import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  X, Plus, Box, Image as ImageIcon, Save, Trash2, Layers, 
  Weight, Ruler, Coins, Droplet, Printer, Search, Loader2,
  Tag, AlertCircle, Info, CheckCircle2, Calculator, Clock, ChevronRight, ShoppingBasket, Eye
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import PrintsCalculator from './PrintsCalculator';

const CATEGORIES = [
  'ACTION FIGURE',
  'PROP / REPLICA',
  'HOUSEHOLD',
  'OFFICE',
  'GAMES / TOYS',
  'ART / DECOR',
  'OTHERS'
];

const labelClass = 'mb-2 block text-[9px] font-black uppercase tracking-[0.2em] opacity-50';
const inputClass = 'w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs font-bold outline-none focus:border-blue-500 transition-all uppercase';
const numberInputClass = 'w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs font-bold outline-none focus:border-blue-500 transition-all appearance-none';
const FIRESTORE_DOC_LIMIT = 1048576;
const FIRESTORE_SAFE_LIMIT = 900000;

const parseMoney = (value) => parseFloat(String(value || 0).replace(/,/g, '')) || 0;

const buildInitialFormData = (project = null) => {
  if (!project) {
    return {
      name: '',
      category: 'ACTION FIGURE',
      description: '',
      filamentId: '',
      printerId: '',
      weight: '',
      printTime: '',
      dimensions: { l: '', w: '', h: '' },
      costPrice: '',
      sellPrice: '',
      stock: '1',
      canAddToBasket: true,
      images: [],
      calculationData: null
    };
  }

  const images = Array.isArray(project.images)
    ? project.images.filter(Boolean)
    : [project.image].filter(Boolean);

  return {
    name: project.projectName || project.name || '',
    category: project.category || 'ACTION FIGURE',
    description: project.description || '',
    filamentId: project.production?.filamentId || '',
    printerId: project.production?.printerId || project.printer?.id || '',
    weight: project.production?.weight ?? project.totals?.totalWeight ?? '',
    printTime: project.production?.printTime || project.totals?.totalTime || '',
    dimensions: {
      l: project.dimensions?.l || '',
      w: project.dimensions?.w || '',
      h: project.dimensions?.h || ''
    },
    costPrice: project.costPrice ?? '',
    sellPrice: project.sellPrice ?? parseMoney(project.totals?.basePrice || project.price),
    stock: String(project.production?.stock ?? 1),
    canAddToBasket: project.canAddToBasket !== false,
    images,
    calculationData: project
  };
};

export default function AddPrintModal({ onClose, initialProject = null }) {
  const filamentInventory = useStore((state) => state.filamentInventory);
  const printers = useStore((state) => state.printers);
  const publishBlueprint = useStore((state) => state.publishBlueprint);
  const updateBlueprint = useStore((state) => state.updateBlueprint);
  const shippingSettings = useStore((state) => state.shippingSettings);
  const isEditing = !!initialProject?.id;
  const [isSaving, setIsSaving] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  
  const [formData, setFormData] = useState(() => buildInitialFormData(initialProject));

  const [imagePreviews, setImagePreviews] = useState(() => buildInitialFormData(initialProject).images);
  const fileInputRef = useRef(null);

  const updateForm = (field, value) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: { ...prev[parent], [child]: value }
      }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleInputChange = (field, value, isUppercase = true) => {
    const input = isUppercase ? value.toUpperCase() : value;
    updateForm(field, input);
  };

  const handleCalculatorComplete = (result) => {
    console.log("handleCalculatorComplete received result:", result);
    // Extract totals and materials
    const totalWeight = result.totals?.totalWeight || result.projectDetails?.reduce((sum, item) => {
      return sum + Number(item.normalizedWeight || item.sliced?.weight || 0);
    }, 0) || 0;
    const sellPrice = parseMoney(result.totals?.basePrice || result.totals?.total);
    const profit = parseMoney(result.totals?.totalProfit || result.totalProfit || 0);
    const costPrice = Math.max(0, sellPrice - profit);
    const totalMinutes = result.projectDetails?.reduce((sum, item) => {
      return sum + Number(item.normalizedTime || item.sliced?.time || 0);
    }, 0) || 0;
    const totalTime = result.totals?.totalTime || `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
    const printerId = result.printer?.id || '';

    setFormData(prev => {
        const newState = {
          ...prev,
          name: prev.name || result.projectName || '',
          weight: totalWeight,
          costPrice: costPrice,
          sellPrice: sellPrice,
          printTime: totalTime,
          printerId: printerId,
          calculationData: result
        };
        console.log("Updated formData:", newState);
        return newState;
    });
    
    setShowCalculator(false);
  };

  const compressImage = (base64Str, maxWidth = 800, maxHeight = 800, quality = 0.6) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const compressed = await compressImage(reader.result);
          setImagePreviews(prev => [...prev, compressed]);
          setFormData(prev => ({
            ...prev,
            images: [...prev.images, compressed]
          }));
        } catch (err) {
          console.error("SG LOG: Image compression failed, using original", err);
          setImagePreviews(prev => [...prev, reader.result]);
          setFormData(prev => ({
            ...prev,
            images: [...prev.images, reader.result]
          }));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index) => {
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const buildProjectPayload = () => {
    const settings = shippingSettings?.paymentSettings || {};
    const displayFees = Number(settings.handlingFee || 0) + Number(settings.installmentFee || 0) + Number(settings.transferFee || 0);
    const baseSellPrice = Number(formData.sellPrice) || 0;

    return {
      ...formData.calculationData,
      source: 'admin-print',
      listingType: 'print',
      projectName: formData.name,
      description: formData.description,
      category: formData.category,
      image: formData.images[0],
      images: formData.images,
      dimensions: formData.dimensions,
      production: {
        filamentId: formData.filamentId,
        printerId: formData.printerId,
        weight: Number(formData.weight) || 0,
        printTime: formData.printTime,
        stock: Number(formData.stock) || 1
      },
      costPrice: Number(formData.costPrice) || 0,
      sellPrice: baseSellPrice,
      totals: {
        ...(formData.calculationData?.totals || {}),
        basePrice: String(baseSellPrice),
        total: String(baseSellPrice + displayFees),
        days: formData.calculationData?.totals?.days || 0
      },
      canAddToBasket: formData.canAddToBasket,
      status: formData.canAddToBasket ? 'Published' : 'Public Only'
    };
  };

  const estimatedDocumentSize = useMemo(() => {
    if (!formData.calculationData) return 0;
    try {
      return JSON.stringify(buildProjectPayload()).length;
    } catch {
      return 0;
    }
  }, [formData]);
  const sizePercent = estimatedDocumentSize ? (estimatedDocumentSize / FIRESTORE_DOC_LIMIT) * 100 : 0;
  const isDocumentTooLarge = estimatedDocumentSize > FIRESTORE_SAFE_LIMIT;

  const handleSave = async () => {
    if (!formData.name || !formData.sellPrice || !formData.images.length || !formData.calculationData) {
      alert("Please fill in Name, Price, add at least one Image, and attach a calculator estimate.");
      return;
    }
    if (isDocumentTooLarge) {
      alert("This print listing is too large to save. Remove or compress photos before finalizing.");
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing) {
        await updateBlueprint(initialProject.id, buildProjectPayload());
      } else {
        await publishBlueprint(buildProjectPayload());
      }
      onClose();
    } catch (e) {
      console.error(e);
      alert(e?.message || "Failed to save print.");
    } finally {
      setIsSaving(false);
    }
  };

  if (showCalculator) {
    return (
      <div className="fixed inset-0 z-[250] flex items-stretch justify-center md:items-center md:p-4 backdrop-blur-md bg-black/60 animate-in fade-in duration-200">
        <div className="relative w-full h-dvh md:w-[540px] md:h-[90dvh] md:max-h-[90dvh] rounded-none md:rounded-[2.5rem] shadow-2xl overflow-hidden bg-[var(--color-surface)] border border-white/10 flex flex-col">
          <div className="flex-1 overflow-y-auto">
            <PrintsCalculator 
              isEditMode={true}
              isInventoryMode={true}
              onExit={() => setShowCalculator(false)}
              onConfirmEdit={handleCalculatorComplete}
              initialData={formData.calculationData}
              BrandLogo={() => (
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-black italic shadow-lg shadow-blue-600/20">SG</div>
              )}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-0 md:p-4 animate-in fade-in duration-300">
      <div className="bg-[#0b0b0c] border-0 md:border border-white/10 w-full h-full md:h-auto md:max-h-[95vh] md:max-w-4xl rounded-none md:rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden text-white">
        {/* Mobile sticky close button (same pattern as ProductCard and AddDealModal) */}
        <div className="sticky top-0 z-[220] w-full h-0 overflow-visible md:hidden shrink-0">
          <div className="absolute top-4 right-4 flex justify-end items-center">
            <button onClick={onClose} className="p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40">
              <X size={20} />
            </button>
          </div>
        </div>
        
        {/* HEADER */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4 text-left">
            <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-600/20">
              <Box size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase italic leading-none tracking-tight">{isEditing ? 'Modify Finished Print' : 'Register Finished Print'}</h2>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-500 mt-1.5 opacity-80">{isEditing ? 'Update Gallery, Details, Pricing, Estimate' : 'Ready-to-sell Inventory'}</p>
            </div>
          </div>
          <button onClick={onClose} className="hidden md:block p-2 hover:bg-white/5 rounded-full transition-colors opacity-40 hover:opacity-100">
            <X size={24} />
          </button>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
          
          <div className="grid md:grid-cols-2 gap-10">
            {/* LEFT COLUMN: VISUALS & IDENTITY */}
            <div className="space-y-8">
              <section className="space-y-4 text-left">
                <label className={labelClass}>Product Identity</label>
                <div className="space-y-4">
                  <input 
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="MODEL NAME (E.G. RX-78-2 BUST)"
                    className={inputClass}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        onClick={() => updateForm('category', cat)}
                        className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                          formData.category === cat 
                            ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20' 
                            : 'bg-white/5 border-white/10 opacity-40 hover:opacity-100 hover:border-white/20'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <textarea 
                    value={formData.description}
                    onChange={(e) => updateForm('description', e.target.value)}
                    placeholder="ADD DETAILS ABOUT THE PRINT..."
                    className={`${inputClass} h-32 resize-none normal-case font-medium opacity-80`}
                  />
                </div>
              </section>

              <section className="space-y-4 text-left">
                <label className={labelClass}>Product Gallery</label>
                <div className="grid grid-cols-3 gap-3">
                  {imagePreviews.map((src, idx) => (
                    <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border border-white/10 group">
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => removeImage(idx)}
                        className="absolute top-2 right-2 p-1.5 bg-black/60 backdrop-blur-md rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                      {idx === 0 && (
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-blue-600 text-[7px] font-black uppercase tracking-widest rounded">Main</div>
                      )}
                    </div>
                  ))}
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-2xl border-2 border-dashed border-white/10 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all flex flex-col items-center justify-center gap-2 group"
                  >
                    <div className="p-3 rounded-full bg-white/5 group-hover:bg-blue-600 group-hover:text-white transition-all">
                      <Plus size={20} />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-100">Add Photo</span>
                  </button>
                </div>
                <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
              </section>
            </div>

            {/* RIGHT COLUMN: PRODUCTION & PRICING */}
            <div className="space-y-8">
              
              {/* CALCULATOR INTEGRATION */}
              <section className="space-y-4 text-left">
                <label className={labelClass}>Production Details</label>
                <div className="bg-white/5 rounded-[2rem] border border-white/10 p-6 space-y-6">
                   {!formData.calculationData ? (
                     <button 
                       onClick={() => setShowCalculator(true)}
                       className="w-full py-10 rounded-3xl border-2 border-dashed border-blue-500/30 hover:border-blue-500 hover:bg-blue-500/5 flex flex-col items-center justify-center gap-3 transition-all group"
                     >
                        <div className="p-4 rounded-full bg-blue-600 text-white shadow-xl shadow-blue-600/30 group-hover:scale-110 transition-transform">
                          <Calculator size={32} />
                        </div>
                        <div className="text-center">
                          <span className="block text-xs font-black uppercase tracking-widest text-blue-500">Open Prints Calculator</span>
                          <span className="block text-[8px] font-black uppercase tracking-[0.2em] opacity-30 mt-1">To get Weight, Cost, & Print Time</span>
                        </div>
                     </button>
                   ) : (
                      <div className="space-y-6">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="relative">
                            <label className={`${labelClass} mb-1`}>Weight (g)</label>
                            <input type="number" value={formData.weight} readOnly className={`${numberInputClass} opacity-60 cursor-not-allowed`} />
                          </div>
                          <div className="relative">
                            <label className={`${labelClass} mb-1`}>Print Time</label>
                            <input type="text" value={formData.printTime} readOnly className={`${inputClass} opacity-60 cursor-not-allowed`} />
                          </div>
                          <div className="relative">
                            <label className={`${labelClass} mb-1`}>Cost (₱)</label>
                            <input type="number" value={formData.costPrice} readOnly className={`${numberInputClass} opacity-60 cursor-not-allowed`} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                            <div className="flex items-center gap-3">
                               <Printer size={16} className="text-blue-500" />
                               <div className="text-left">
                                  <span className="block text-[10px] font-black uppercase italic leading-none">{formData.calculationData.printer?.name || 'Unknown Printer'}</span>
                                  <span className="block text-[7px] font-black uppercase tracking-widest opacity-30 mt-1">Hardware Used</span>
                               </div>
                            </div>
                            <button 
                              onClick={() => setShowCalculator(true)}
                              className="p-2 hover:bg-white/10 rounded-xl transition-colors text-blue-500"
                            >
                              <ChevronRight size={20} />
                            </button>
                         </div>

                         <div className="flex flex-wrap gap-2">
                            {formData.calculationData.filaments?.map((f, i) => (
                              <div key={i} className="px-3 py-1.5 bg-white/5 rounded-full border border-white/5 flex items-center gap-2">
                                 <div className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }} />
                                 <span className="text-[8px] font-black uppercase tracking-widest opacity-60">{f.brand} {f.name}</span>
                              </div>
                            ))}
                         </div>
                      </div>
                    )}
                </div>
              </section>

              {/* MANUAL DIMENSIONS */}
              <section className="space-y-4 text-left">
                <label className={labelClass}>Post-Print Dimensions (CM)</label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[8px] font-black opacity-20">L</span>
                    <input type="number" value={formData.dimensions.l} onChange={(e) => updateForm('dimensions.l', e.target.value)} placeholder="0" className={`${numberInputClass} pl-6 py-3.5 text-xs font-black`} />
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[8px] font-black opacity-20">W</span>
                    <input type="number" value={formData.dimensions.w} onChange={(e) => updateForm('dimensions.w', e.target.value)} placeholder="0" className={`${numberInputClass} pl-6 py-3.5 text-xs font-black`} />
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[8px] font-black opacity-20">H</span>
                    <input type="number" value={formData.dimensions.h} onChange={(e) => updateForm('dimensions.h', e.target.value)} placeholder="0" className={`${numberInputClass} pl-6 py-3.5 text-xs font-black`} />
                  </div>
                </div>
              </section>

              {/* PRICING */}
              <section className="space-y-4 text-left">
                <label className={labelClass}>Market Pricing</label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="relative bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold flex items-center text-emerald-400 min-h-[54px] select-none">
                      <Tag size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500" />
                      <span>₱{(Number(formData.sellPrice) || 0).toLocaleString()}</span>
                      <span className="text-[8px] font-black uppercase tracking-widest opacity-40 ml-auto">Sell Price</span>
                    </div>
                  </div>
                  <div>
                    <div className="relative">
                      <Layers size={16} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20" />
                      <input 
                        type="number"
                        value={formData.stock}
                        onChange={(e) => updateForm('stock', e.target.value)}
                        placeholder="QUANTITY"
                        className={`${numberInputClass} pl-12 py-4 text-sm`}
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-4 text-left">
                <label className={labelClass}>Public Availability</label>
                <button
                  type="button"
                  onClick={() => updateForm('canAddToBasket', !formData.canAddToBasket)}
                  className={`w-full p-4 rounded-2xl border flex items-center justify-between gap-4 transition-all text-left ${
                    formData.canAddToBasket
                      ? 'bg-blue-600/10 border-blue-500/30 text-blue-300'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${formData.canAddToBasket ? 'bg-blue-600 text-white' : 'bg-amber-500 text-black'}`}>
                      {formData.canAddToBasket ? <ShoppingBasket size={18} /> : <Eye size={18} />}
                    </div>
                    <div>
                      <span className="block text-[10px] font-black uppercase tracking-widest">
                        {formData.canAddToBasket ? 'Can Be Added To Basket' : 'Public View Only'}
                      </span>
                      <span className="block text-[8px] font-black uppercase tracking-[0.18em] opacity-50 mt-1">
                        {formData.canAddToBasket ? 'Customers can order this print' : 'Visible publicly, ordering disabled'}
                      </span>
                    </div>
                  </div>
                  <div className={`w-12 h-7 rounded-full p-1 transition-all ${formData.canAddToBasket ? 'bg-blue-600' : 'bg-amber-500'}`}>
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${formData.canAddToBasket ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </button>
              </section>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-6 md:p-8 border-t border-white/10 bg-white/[0.02] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-6">
             <div className="flex flex-col text-left">
                <span className="text-[9px] font-black uppercase tracking-widest opacity-30">Profit Projection</span>
                <span className="text-xl font-black italic text-emerald-500 leading-none mt-1">
                  ₱{formData.sellPrice && formData.costPrice ? (Number(formData.sellPrice) - Number(formData.costPrice)).toLocaleString() : '0'}
                </span>
             </div>
             {formData.costPrice > 0 && formData.sellPrice > 0 && (
                <div className="px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                   <span className="text-[9px] font-black text-emerald-500">
                     +{Math.round(((formData.sellPrice - formData.costPrice) / formData.costPrice) * 100)}% MARGIN
                   </span>
                </div>
             )}
          </div>
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="px-8 py-4 rounded-3xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              disabled={isSaving || isDocumentTooLarge}
              className="px-12 py-4 rounded-3xl bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-600/20 transition-all active:scale-95 flex items-center gap-3 disabled:opacity-50 disabled:active:scale-100"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isEditing ? 'Save Changes' : 'Finalize Listing'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
