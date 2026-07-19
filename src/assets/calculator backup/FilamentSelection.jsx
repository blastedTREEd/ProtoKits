import React, { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { Check, AlertTriangle, ShoppingBasket, Search, Weight } from 'lucide-react';
 
import LoadingState from '../common/LoadingState';

export default function FilamentSelection({ onSelect, selectedFilaments = [] }) {
  const { filamentInventory, isLoading } = useStore();
  const [tempSelection, setTempSelection] = useState(selectedFilaments);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredInventory = useMemo(() => {
    if (!filamentInventory) return [];
    
    // 1. Filter out inactive filaments first (Strict for selection view)
    let list = [...filamentInventory].filter(f => f.isActive !== false);
    
    // 2. Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(f => 
        f.name?.toLowerCase().includes(q) || 
        f.brand?.toLowerCase().includes(q) || 
        f.type?.toLowerCase().includes(q)
      );
    }

    // Then, sort by Stock Priority (In Stock first), then by Grams (Highest first), then Alphabetical
    return list.sort((a, b) => {
      const aWeight = parseFloat(a.remaining) || 0;
      const bWeight = parseFloat(b.remaining) || 0;
      const aInStock = aWeight > 0;
      const bInStock = bWeight > 0;
      
      // 1. In Stock vs Out of Stock
      if (aInStock && !bInStock) return -1;
      if (!aInStock && bInStock) return 1;
      
      // 2. If both are In Stock, sort by Grams (Highest first)
      if (aInStock && bInStock) {
        if (aWeight !== bWeight) return bWeight - aWeight;
      }
      
      // 3. Fallback to Alphabetical
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [filamentInventory, searchQuery]);

  const toggleFilament = (filament) => {
    const isAlreadySelected = tempSelection.find(f => f.id === filament.id);
    if (isAlreadySelected) {
      setTempSelection(tempSelection.filter(f => f.id !== filament.id));
    } else {
      setTempSelection([...tempSelection, filament]);
    }
  };

  const handleDeploy = () => {
    const finalSelection = tempSelection.map(item => {
      const stock = parseFloat(item.remaining);
      const isUpfront = stock <= 0;
      return {
        ...item,
        isUpfront
      };
    });
    onSelect(finalSelection);
  };  

  if (isLoading) {
    return <LoadingState message="Syncing_Inventory..." />;
  }

  const renderCard = (item) => {
    const isSelected = tempSelection.some(f => f.id === item.id);
    const stock = parseFloat(item.remaining) || 0;
    const isEmpty = stock <= 0;
    const isLowStock = stock > 0 && stock < 150;
    
    const displayWeight = (isEmpty && isSelected) ? 1000 : stock;
    const activeColor = isEmpty ? '#EE4D2D' : 'var(--color-primary)';
    const activeBg = isEmpty ? 'rgba(238, 77, 45, 0.05)' : 'var(--color-primary-light)';

    return (
      <button
        key={item.id}
        onClick={() => toggleFilament(item)}
        className={`
          relative flex flex-col p-4 rounded-[2.2rem] border-2 transition-all duration-500 text-left overflow-hidden
          ${isSelected 
            ? `shadow-xl scale-[1.03] z-10` 
            : 'bg-black/5 dark:bg-white/5 border-transparent hover:border-blue-500/30'}
          ${!isSelected && isEmpty ? 'opacity-60' : ''}
        `}
        style={isSelected ? { 
          borderColor: activeColor, 
          backgroundColor: activeBg,
          boxShadow: `0 20px 25px -5px ${activeColor}1A` 
        } : {}}
      >
        {/* Color Indicator */}
        <div className="flex justify-between items-start mb-4">
          <div 
            className="w-10 h-10 rounded-2xl shadow-inner border border-black/20 dark:border-white/20 transition-transform duration-500" 
            style={{ 
              backgroundColor: item.color || '#4B91F1',
              transform: isSelected ? 'scale(1.1)' : 'scale(1)'
            }}
          />
          
          <div className="flex items-center gap-1.5">
            <div 
              className={`px-2 py-0.5 rounded-lg border font-black uppercase tracking-[0.1em] text-[8px] transition-all duration-500 ${
                isSelected 
                  ? 'bg-white/20 border-white/20 text-white' 
                  : 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400'
              }`}
            >
              {item.type}
            </div>
            {isSelected && (
              <div className="rounded-full p-0.5 animate-in zoom-in duration-300" style={{ backgroundColor: activeColor }}>
                <Check size={8} className="text-white" strokeWidth={4} />
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest leading-none mb-1 text-[var(--color-text-main)] opacity-30">
            {item.brand}
          </p>
          <h3 className={`text-[13px] font-black italic uppercase leading-tight tracking-tight transition-colors ${
            isSelected ? '' : 'text-[var(--color-text-main)]'
          }`} style={isSelected ? { color: activeColor } : {}}>
            {item.name}
          </h3>
        </div>

        {/* Footer Stats */}
        <div className="mt-auto flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Weight size={10} className={isSelected ? 'opacity-100' : 'opacity-20'} style={{ color: isSelected ? activeColor : 'inherit' }} />
            <span className={`text-[11px] font-black uppercase tracking-tighter transition-all duration-300 ${
              !isSelected && isEmpty ? 'text-red-500' : ''
            }`} style={isSelected ? { color: activeColor } : (!isEmpty && isLowStock ? { color: '#f59e0b' } : !isEmpty ? { color: '#22c55e' } : {})}>
              {displayWeight}g
            </span>
          </div>
          
          {isEmpty ? (
            <div className="flex items-center gap-1 transition-all duration-300" 
                 style={{ color: isSelected ? activeColor : '#ef4444' }}>
              <span className="text-[9px] font-black uppercase tracking-widest">
                {isSelected ? 'UPFRONT' : 'NO STOCK'}
              </span>
            </div>
          ) : isLowStock ? (
            <div className={`flex items-center gap-0.5 animate-pulse ${isSelected ? '' : 'text-amber-500'}`}
                 style={isSelected ? { color: activeColor } : {}}>
              <AlertTriangle size={10} />
              <span className="text-[9px] font-black uppercase tracking-widest">LOW</span>
            </div>
          ) : null}
        </div>
      </button>
    );
  };

  return (
    <div className="relative min-h-full animate-in slide-in-from-right-4 duration-500 pb-24 space-y-4">
      
      {/* SEARCH BAR */}
      <div className="relative group px-1">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--color-text-main)] opacity-20 group-focus-within:opacity-100 group-focus-within:text-blue-500 transition-all" size={18} />
        <input 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search all colors..."
          className="w-full bg-black/5 dark:bg-white/5 border border-[var(--color-border)] rounded-[2rem] pl-12 pr-4 py-4 text-[12px] font-black uppercase tracking-widest outline-none focus:border-blue-500/50 transition-all text-[var(--color-text-main)]"
        />
      </div>

      {/* GRID OF ALL FILAMENTS */}
      <div className="grid grid-cols-2 gap-3 mb-1">
        {filteredInventory.map(renderCard)}
      </div>

      {/* NO RESULTS VIEW */}
      {filteredInventory.length === 0 && (
        <div className="py-20 flex flex-col items-center gap-3 opacity-20 text-[var(--color-text-main)]">
          <Search size={48} strokeWidth={1} />
          <p className="text-[10px] font-black uppercase tracking-widest">No matching filaments found</p>
        </div>
      )}

      {/* SMART STICKY FOOTER */}
      <div className={`px-5 sticky bottom-4 left-0 w-full mt-4 transition-all duration-500 z-50 
        ${tempSelection.length > 0 ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 pointer-events-none scale-95'}`}
      >
        <div className="bg-[var(--color-surface)]/80 backdrop-blur-md p-1 rounded-[2.5rem] border border-[var(--color-border)] shadow-2xl">
          <button 
            onClick={handleDeploy}
            className="w-full py-5 rounded-[2.2rem] font-black italic uppercase text-[11px] tracking-[0.2em] bg-blue-600 text-white shadow-xl shadow-blue-600/20 flex items-center justify-center gap-4 group active:scale-95 transition-all"
          >
            PROCEED WITH {tempSelection.length} {tempSelection.length === 1 ? 'COLOR' : 'COLORS'}
            <div className="p-1 rounded-full bg-white/20 group-hover:translate-x-1 transition-transform">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="4" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
