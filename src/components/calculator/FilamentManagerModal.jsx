import React, { useState, useMemo, useEffect } from 'react';
import { X, Plus, Trash2, Droplet, Coins, Weight, Edit3, Check, Undo2, Search, Eye, Clock, RefreshCw, Hash } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { deleteField } from 'firebase/firestore';

export default function FilamentManagerModal({ onClose }) {
  const filamentInventory = useStore((state) => state.filamentInventory);
  const addFilament = useStore((state) => state.addFilament);
  const updateFilament = useStore((state) => state.updateFilament);
  const deleteFilament = useStore((state) => state.deleteFilament);
  const cleanupFilamentsStockNo = useStore((state) => state.cleanupFilamentsStockNo);

  useEffect(() => {
    cleanupFilamentsStockNo();
  }, [cleanupFilamentsStockNo]);

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [addFormData, setAddFormData] = useState({
    name: '', brand: '', type: 'PLA', color: '#4B91F1', price: '', remaining: 1000, loadTime: 5, purgeTime: 2, isActive: true
  });
  const [editFormData, setEditFormData] = useState({});

  const filteredInventory = useMemo(() => {
    if (!searchQuery.trim()) return filamentInventory || [];
    const q = searchQuery.toLowerCase();
    return (filamentInventory || []).filter(f => 
      f.name?.toLowerCase().includes(q) || 
      f.brand?.toLowerCase().includes(q) || 
      f.type?.toLowerCase().includes(q)
    );
  }, [filamentInventory, searchQuery]);

  const { activeStock, outOfStock } = useMemo(() => {
    const list = filteredInventory || [];
    return {
      activeStock: list.filter(f => (parseFloat(f.remaining) || 0) > 0),
      outOfStock: list.filter(f => (parseFloat(f.remaining) || 0) <= 0)
    };
  }, [filteredInventory]);

  const renderFilamentList = (list, title) => (
    <div className="space-y-3">
      {list.length > 0 && (
        <>
          <div className="flex items-center gap-4 px-2 mt-4">
            <span className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30">{title}</span>
            <div className="h-px flex-1 bg-[var(--color-border)]" />
          </div>
          {list.map((f) => (
            <div key={f.id} className={`group relative bg-black/5 dark:bg-white/5 border rounded-3xl p-4 transition-all ${editingId === f.id ? 'border-blue-500 bg-blue-500/5 ring-4 ring-blue-500/10' : 'border-[var(--color-border)] hover:border-blue-500/40'} ${!f.isActive && editingId !== f.id ? 'opacity-40 grayscale' : ''}`}>
              {editingId === f.id ? (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="grid grid-cols-2 gap-3">
                    <input 
                      value={editFormData.name} 
                      onChange={e => {
                        const start = e.target.selectionStart;
                        const val = e.target.value.toUpperCase();
                        setEditFormData({...editFormData, name: val});
                        requestAnimationFrame(() => {
                          if (e.target) e.target.setSelectionRange(start, start);
                        });
                      }} 
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-[var(--color-text-main)] font-bold outline-none text-[11px] focus:border-blue-500 uppercase" 
                    />
                    <select value={editFormData.type} onChange={e => setEditFormData({...editFormData, type: e.target.value})} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-[var(--color-text-main)] font-bold outline-none text-[11px] focus:border-blue-500"><option>PLA</option><option>PLA+</option><option>PETG</option><option>ABS</option><option>ASA</option><option>TPU</option></select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input 
                      value={editFormData.brand} 
                      onChange={e => {
                        const start = e.target.selectionStart;
                        const val = e.target.value.toUpperCase();
                        setEditFormData({...editFormData, brand: val});
                        requestAnimationFrame(() => {
                          if (e.target) e.target.setSelectionRange(start, start);
                        });
                      }} 
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-[var(--color-text-main)] font-bold outline-none text-[11px] focus:border-blue-500 uppercase" 
                    />
                    <div className="flex gap-1.5">
                      <input type="color" value={editFormData.color} onChange={e => setEditFormData({...editFormData, color: e.target.value})} className="w-9 h-9 bg-transparent cursor-pointer rounded-lg overflow-hidden" />
                      <input value={editFormData.color} onFocus={() => handleFocus(setEditFormData, 'color')} onChange={e => setEditFormData({...editFormData, color: e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`})} className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-2 py-2 text-[var(--color-text-main)] font-mono text-[10px] font-bold outline-none uppercase focus:border-blue-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" value={editFormData.price} onChange={e => setEditFormData({...editFormData, price: e.target.value})} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-[var(--color-text-main)] font-bold outline-none text-[11px] focus:border-blue-500" />
                    <input type="number" value={editFormData.remaining} onFocus={() => handleFocus(setEditFormData, 'remaining')} onBlur={() => handleBlur(setEditFormData, 'remaining', 0)} onChange={e => setEditFormData({...editFormData, remaining: e.target.value})} className="w-full bg-[var(--color-bg)] border border-blue-500/30 rounded-xl px-3 py-2 text-[var(--color-text-main)] font-bold outline-none text-[11px] focus:border-blue-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-left">
                     <div className="space-y-1"><label className="text-[9px] font-black uppercase opacity-30 ml-2">Load (m)</label><input type="number" value={editFormData.loadTime} onChange={e => setEditFormData({...editFormData, loadTime: e.target.value})} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-[var(--color-text-main)] font-bold outline-none text-[11px] focus:border-blue-500" /></div>
                     <div className="space-y-1"><label className="text-[9px] font-black uppercase opacity-30 ml-2">Purge (m)</label><input type="number" value={editFormData.purgeTime} onChange={e => setEditFormData({...editFormData, purgeTime: e.target.value})} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-[var(--color-text-main)] font-bold outline-none text-[11px] focus:border-blue-500" /></div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setEditingId(null)} className="flex-1 py-3 rounded-xl bg-black/5 dark:bg-white/5 font-black uppercase text-[9px] tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all"><Undo2 size={12} /> Cancel</button>
                    <button onClick={() => handleEditSave(f.id)} className="flex-[2] py-3 rounded-xl bg-blue-600 text-white font-black uppercase text-[9px] tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-600/20"><Check size={12} strokeWidth={4} /> Update Details</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-left">
                    <div className="w-12 h-12 rounded-2xl shadow-inner border border-black/20 dark:border-white/20 shrink-0" style={{ backgroundColor: f.color || '#4B91F1' }} />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-black italic uppercase tracking-tight leading-none">{f.name}</h4>
                        {!f.isActive && <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-zinc-500 text-white uppercase tracking-widest">Hidden</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] font-black opacity-40 uppercase tracking-widest">{f.brand} • {f.type}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex items-center gap-1 opacity-40"><Coins size={10} /><span className="text-[10px] font-bold">₱{f.price}</span></div>
                        <div className="flex items-center gap-1 text-blue-500/70"><Weight size={10} /><span className="text-[10px] font-bold">{(parseFloat(f.remaining) || 0) % 1 === 0 ? parseFloat(f.remaining) : parseFloat(f.remaining).toFixed(1)}g left</span></div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => toggleActiveStatus(f)} className={`p-2.5 rounded-xl transition-all ${f.isActive ? 'text-blue-500 hover:bg-blue-500/10' : 'text-zinc-500 hover:bg-zinc-500/10'}`}><Eye size={18} /></button>
                    <button onClick={() => startEdit(f)} className="p-2.5 hover:bg-blue-600 rounded-xl transition-all opacity-40 hover:opacity-100 hover:text-white"><Edit3 size={18} /></button>
                    <button onClick={() => { if(window.confirm('Delete this filament?')) deleteFilament(f.id) }} className="p-2.5 hover:bg-red-600 rounded-xl transition-all opacity-40 hover:opacity-100 hover:text-white"><Trash2 size={18} /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );

  const generateCustomId = (brand, type, name, stockNo) => {
    const b = (brand || '').trim().toLowerCase().replace(/\s+/g, '-');
    const t = (type || '').toLowerCase().replace(/\s+/g, '-');
    const n = (name || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const s = (stockNo || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    return s ? `${b}_${t}_${n}_${s}` : `${b}_${t}_${n}`;
  };

  const getNextStockNo = () => {
    const used = new Set((filamentInventory || []).map((f) => String(f.stockNo || '').trim()).filter(Boolean));
    let max = 0;
    used.forEach((value) => {
      const match = String(value).match(/(\d+)$/);
      if (match) max = Math.max(max, Number(match[1]) || 0);
    });
    let next = max + 1;
    let candidate = `FS-${String(next).padStart(3, '0')}`;
    while (used.has(candidate)) {
      next += 1;
      candidate = `FS-${String(next).padStart(3, '0')}`;
    }
    return candidate;
  };

  const handleAddSave = async () => {
    try {
      const remaining = parseFloat(addFormData.remaining) || 0;
      const stockNo = remaining > 0 ? getNextStockNo() : null;
      const customId = generateCustomId(addFormData.brand, addFormData.type, addFormData.name, stockNo);
      
      const data = {
        materialKey: customId,
        name: (addFormData.name.trim() || 'UNNAMED COLOR').toUpperCase(),
        brand: (addFormData.brand.trim() || 'UNKNOWN BRAND').toUpperCase(),
        type: addFormData.type.toUpperCase(),
        color: addFormData.color,
        price: parseFloat(addFormData.price) || 0,
        weight: 1000,
        remaining,
        loadTime: parseFloat(addFormData.loadTime) || 5,
        purgeTime: parseFloat(addFormData.purgeTime) || 2,
        isActive: true,
      };
      
      if (stockNo) {
        data.stockNo = stockNo;
      } else {
        data.stockNo = deleteField();
      }
      
      await addFilament({...data, id: customId});
      setIsAdding(false);
      setAddFormData({ name: '', brand: '', type: 'PLA', color: '#4B91F1', price: '', remaining: 1000, loadTime: 5, purgeTime: 2, isActive: true });
    } catch (e) { console.error(e); }
  };

  const handleEditSave = async (id) => {
    try {
      const remaining = parseFloat(editFormData.remaining) || 0;
      const stockNo = remaining > 0 ? (editFormData.stockNo || getNextStockNo()) : null;
      const newId = generateCustomId(editFormData.brand, editFormData.type, editFormData.name, stockNo);

      const data = {
        id: newId, // Update ID field within document
        materialKey: newId,
        name: editFormData.name.trim().toUpperCase(),
        brand: editFormData.brand.trim().toUpperCase(),
        type: editFormData.type.toUpperCase(),
        color: editFormData.color,
        price: parseFloat(editFormData.price) || 0,
        remaining,
        loadTime: parseFloat(editFormData.loadTime) || 5,
        purgeTime: parseFloat(editFormData.purgeTime) || 2,
        isActive: editFormData.isActive ?? true,
      };

      if (stockNo) {
        data.stockNo = stockNo;
      } else {
        data.stockNo = deleteField();
      }
      
      await updateFilament(id, data, newId);
      setEditingId(null);
    } catch (e) {
      console.error('Filament: Update failed', e);
      alert(e?.message || 'Failed to save filament. Check admin permissions.');
    }
  };

  const toggleActiveStatus = async (f) => {
    try {
      await updateFilament(f.id, { isActive: !f.isActive });
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Failed to update filament visibility. Check admin permissions.');
    }
  };

  const startEdit = (f) => {
    setIsAdding(false);
    setEditingId(f.id);
    setEditFormData({
      ...f,
      stockNo: f.stockNo ?? '',
      price: f.price?.toString() ?? '',
      remaining: f.remaining ?? 0,
      loadTime: f.loadTime ?? 5,
      purgeTime: f.purgeTime ?? 2,
      type: f.type ?? 'PLA'
    });
  };

  const handleFocus = (setter, key) => {
    setter(prev => ({ ...prev, [key]: '' }));
  };

  const handleBlur = (setter, key, fallback = 0) => {
    setter(prev => {
      if (prev[key] === '' || isNaN(prev[key])) return { ...prev, [key]: fallback };
      return prev;
    });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 md:p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-[var(--color-surface)] border-0 md:border border-[var(--color-border)] w-full h-full md:h-auto md:max-h-[90vh] md:max-w-2xl rounded-none md:rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden text-[var(--color-text-main)]">
        {/* Mobile sticky close button (same pattern as ProductCard and AddDealModal) */}
        <div className="sticky top-0 z-[220] w-full h-0 overflow-visible md:hidden shrink-0">
          <div className="absolute top-4 right-4 flex justify-end items-center">
            <button onClick={onClose} className="p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40">
              <X size={20} />
            </button>
          </div>
        </div>
        
        <div className="p-6 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 rounded-xl"><Droplet size={20} className="text-white" /></div>
            <div>
              <h2 className="text-lg font-black uppercase italic leading-none">Inventory Manager</h2>
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 opacity-80 mt-1 block">Filament & Production Settings</span>
            </div>
          </div>
          <button onClick={onClose} className="hidden md:block p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors opacity-40 hover:opacity-100"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          <div className="flex gap-3">
            <div className="w-[65%] relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-main)] opacity-20 group-focus-within:opacity-100 group-focus-within:text-blue-500 transition-all" size={18} />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="SEARCH INVENTORY..." className="w-full bg-black/5 dark:bg-white/5 border border-[var(--color-border)] rounded-3xl pl-12 pr-4 py-4 text-[12px] font-black uppercase tracking-widest outline-none focus:border-blue-500/50 transition-all" />
            </div>
            <button 
              onClick={() => {
                if (!isAdding) setEditingId(null);
                setIsAdding(!isAdding);
              }} 
              className={`w-[35%] rounded-3xl border transition-all flex items-center justify-center gap-2 font-black uppercase text-[10px] tracking-widest active:scale-95 ${isAdding ? 'bg-zinc-800 text-white border-zinc-700' : 'bg-blue-600 text-white border-blue-500 shadow-lg'}`}
            >
              {isAdding ? <X size={14} strokeWidth={3} /> : <Plus size={14} strokeWidth={4} />}
              {isAdding ? 'Close' : 'Register'}
            </button>
          </div>

          {isAdding && (
            <div className="bg-black/5 dark:bg-white/5 rounded-[2rem] p-6 border border-[var(--color-border)] space-y-4 animate-in slide-in-from-top-4 duration-300">
              <div className="grid grid-cols-1 gap-4">
                <input 
                  value={addFormData.brand} 
                  onChange={e => {
                    const start = e.target.selectionStart;
                    const val = e.target.value.toUpperCase();
                    setAddFormData({...addFormData, brand: val});
                    requestAnimationFrame(() => {
                      if (e.target) e.target.setSelectionRange(start, start);
                    });
                  }} 
                  placeholder="BRAND" 
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl px-4 py-3 text-[var(--color-text-main)] font-bold outline-none text-[12px] focus:border-blue-500 uppercase" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <select value={addFormData.type} onChange={e => setAddFormData({...addFormData, type: e.target.value})} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl px-4 py-3 text-[var(--color-text-main)] font-bold outline-none text-[12px] appearance-none focus:border-blue-500">
                  <option>PLA</option><option>PLA+</option><option>PETG</option><option>ABS</option><option>ASA</option><option>TPU</option>
                </select>
                <input 
                  value={addFormData.name} 
                  onChange={e => {
                    const start = e.target.selectionStart;
                    const val = e.target.value.toUpperCase();
                    setAddFormData({...addFormData, name: val});
                    requestAnimationFrame(() => {
                      if (e.target) e.target.setSelectionRange(start, start);
                    });
                  }} 
                  placeholder="COLOR NAME" 
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl px-4 py-3 text-[var(--color-text-main)] font-bold outline-none text-[12px] focus:border-blue-500 uppercase" 
                />
              </div>
              <div className="grid grid-cols-5 gap-3">
                <div className="col-span-5 flex gap-2">
                  <input type="color" value={addFormData.color} onChange={e => setAddFormData({...addFormData, color: e.target.value})} className="w-12 h-12 bg-transparent cursor-pointer rounded-xl overflow-hidden" />
                  <input value={addFormData.color} onFocus={() => handleFocus(setAddFormData, 'color')} onChange={e => setAddFormData({...addFormData, color: e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`})} className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl px-2 py-3 text-[var(--color-text-main)] font-mono text-[10px] font-bold outline-none uppercase focus:border-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input type="number" value={addFormData.price} onChange={e => setAddFormData({...addFormData, price: e.target.value})} placeholder="PRICE (₱)" className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl px-4 py-3 text-[var(--color-text-main)] font-bold outline-none text-[12px] focus:border-blue-500" />
                <input type="number" value={addFormData.remaining} onFocus={() => handleFocus(setAddFormData, 'remaining')} onBlur={() => handleBlur(setAddFormData, 'remaining', 1000)} onChange={e => setAddFormData({...addFormData, remaining: e.target.value})} placeholder="GRAMS (G)" className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl px-4 py-3 text-[var(--color-text-main)] font-bold outline-none text-[12px] focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500/30" size={14} />
                  <input type="number" value={addFormData.loadTime} onChange={e => setAddFormData({...addFormData, loadTime: e.target.value})} placeholder="LOAD (MINS)" className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl pl-10 pr-4 py-3 text-[var(--color-text-main)] font-bold outline-none text-[12px] focus:border-blue-500" />
                </div>
                <div className="relative">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500/30" size={14} />
                  <input type="number" value={addFormData.purgeTime} onChange={e => setAddFormData({...addFormData, purgeTime: e.target.value})} placeholder="PURGE (MINS)" className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl pl-10 pr-4 py-3 text-[var(--color-text-main)] font-bold outline-none text-[12px] focus:border-blue-500" />
                </div>
              </div>
              <button onClick={handleAddSave} className="w-full py-4 rounded-2xl bg-blue-600 text-white font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-600/20">Save New Spool</button>
            </div>
          )}

          <div className="space-y-6">
            {renderFilamentList(activeStock, 'Current Stock')}
            {renderFilamentList(outOfStock, 'For Upfront / Empty')}
          </div>

        </div>
      </div>
    </div>
  );
}
