import React from 'react';
import { Check, Weight, Coins, Palette } from 'lucide-react';

export default function MaterialCard({ 
  material, 
  isSelected, 
  onSelect, 
  remainingWeight, 
  requiredWeight,
  isUpfront,
  // Fallbacks for older components
  mat,
  toggleSelect,
  isChanging,
  isGrid,
  isChangingOption,
  readOnly,
  noBorder
}) {
  const activeMaterial = material || mat;
  if (!activeMaterial) return null;

  const finalRemaining = remainingWeight ?? (parseFloat(activeMaterial.remaining) || 0);
  const finalRequired = requiredWeight ?? 0;
  const finalUpfront = isUpfront ?? (activeMaterial.status?.toLowerCase() === 'upfront');

  const isOutOfStock = finalRemaining <= 0;
  const isLowStock = !isOutOfStock && finalRemaining < finalRequired;
  
  const activeColor = finalUpfront ? '#EE4D2D' : 'var(--color-primary)';

  const formatWeight = (val) => {
    const num = parseFloat(val || 0);
    return num % 1 === 0 ? num.toString() : num.toFixed(1);
  };

  const weightColorClass = isOutOfStock ? { color: '#ef4444' } : (isLowStock ? { color: '#f59e0b' } : { color: '#10b981' });

  if (isChangingOption) {
    return (
      <button
        type="button"
        onClick={() => onSelect(activeMaterial.id)}
        className={`relative w-full min-h-[96px] p-4 rounded-[1.8rem] border-[1.5px] text-left transition-all duration-300 ${
          isSelected
            ? 'bg-[var(--color-primary)]/5 border-[var(--color-primary)]'
            : 'bg-transparent border-gray-400/30'
        } ${isOutOfStock ? 'opacity-60' : ''}`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-2xl shadow-inner border border-black/10 dark:border-white/10 shrink-0 flex items-center justify-center"
              style={{ backgroundColor: isSelected ? 'var(--color-primary)' : (activeMaterial.color || '#4B91F1') }}
            >
              {isSelected && <RefreshCw size={16} strokeWidth={4} className="text-white" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[14px] font-bold text-[var(--color-primary)] uppercase tracking-tight shrink-0">
                  {activeMaterial.type || 'PLA'}
                </span>
                <span className="text-[14px] font-bold text-[var(--color-text-main)] uppercase truncate">
                  {activeMaterial.brand || 'Unknown'}
                </span>
              </div>
              <h4 className="text-[15px] font-bold uppercase italic tracking-tight truncate text-[var(--color-text-main)]">
                {activeMaterial.name}
              </h4>
            </div>
          </div>

          <div className="flex flex-col items-end shrink-0">
            <span className="text-[14px] font-bold italic tracking-tight" style={weightColorClass}>
              {formatWeight(activeMaterial.remaining)}G
            </span>
            <span className="text-[14px] font-bold uppercase tracking-tight text-[var(--color-text-main)]">
              STOCK
            </span>
          </div>
        </div>
      </button>
    );
  }

  // ---------------------------------------------------------
  // RENDER OPTION 1: THE NEW SELECTION UI (For the List/Grid)
  // ---------------------------------------------------------
  if (isGrid) {
    return (
      <button
        onClick={() => onSelect(activeMaterial.id)}
        className={`
          relative w-full flex flex-col p-4 rounded-[2.2rem] border-2 transition-all duration-500 text-left overflow-hidden
          bg-[var(--color-bg)]
          ${isSelected 
            ? `z-10` 
            : 'border-[var(--color-border)] hover:border-blue-500/30'}
          ${!isSelected && isOutOfStock ? 'opacity-60' : ''}
          ${noBorder ? 'border-none shadow-none' : ''}
        `}
        style={isSelected ? { 
          borderColor: activeColor
        } : {}}
      >
        <div className="flex justify-between items-start mb-4">
          <div 
            className="w-10 h-10 rounded-2xl shadow-inner border border-black/20 dark:border-white/20 transition-transform duration-500" 
            style={{ 
              backgroundColor: activeMaterial.color || '#4B91F1'
            }}
          />
          <div className="flex items-center gap-1.5">
            <div className="px-2 py-0.5 rounded-lg border font-bold uppercase tracking-[0.1em] text-[8px] transition-all duration-500 bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400">
              {activeMaterial.type || 'PLA'}
            </div>
            {isSelected && (
              <div className="rounded-full p-0.5 animate-in zoom-in duration-300" style={{ backgroundColor: activeColor }}>
                <Check size={8} className="text-white" strokeWidth={4} />
              </div>
            )}
          </div>
        </div>
        <div className="mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest leading-none mb-1 text-[var(--color-text-main)] opacity-30">{activeMaterial.brand || 'Unknown'}</p>
          <h3 className="text-[13px] font-bold italic uppercase leading-tight tracking-tight transition-colors text-[var(--color-text-main)]">{activeMaterial.name}</h3>
        </div>
        <div className="mt-auto flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Weight size={10} className="opacity-20" />
            <span className="text-[11px] font-bold uppercase tracking-tighter" style={weightColorClass}>
              {formatWeight(activeMaterial.remaining)}g left
            </span>
          </div>
          {finalUpfront && <div className="flex items-center gap-1" style={{ color: activeColor }}><Coins size={10} strokeWidth={3} /><span className="text-[9px] font-bold uppercase tracking-widest">UPFRONT</span></div>}
        </div>
      </button>
    );
  }

  // ---------------------------------------------------------
  // RENDER OPTION 2: THE ORIGINAL PREVIEW UI (For Project Forms)
  // ---------------------------------------------------------
  return (
    <button
      onClick={toggleSelect}
      disabled={readOnly}
      className={`
        w-full min-h-[68px] h-auto p-3 rounded-[1.8rem] border-[1.5px] transition-all duration-500 flex items-center justify-between gap-3
        ${isChanging ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] scale-[1.02]' : 'border-gray-400/40 bg-transparent'}
        ${readOnly ? 'cursor-default' : 'cursor-pointer'}
        ${noBorder ? 'border-none shadow-none' : ''}
      `}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-10 h-10 rounded-2xl shadow-inner border border-black/10 dark:border-white/10 shrink-0 flex items-center justify-center"
          style={{ backgroundColor: activeMaterial.color || '#4B91F1' }}
        />
        <div className="text-left min-w-0">
          <div className="flex items-center gap-0.5 overflow-hidden">
            <span className="text-[14px] font-bold text-[var(--color-primary)] uppercase tracking-[0.05em] shrink-0">{activeMaterial.type}</span>
            <span className="text-[14px] font-bold text-[var(--color-text-main)] uppercase truncate italic">{activeMaterial.brand}</span>
          </div>
          <h4 className={`text-[15px] font-bold uppercase tracking-tighter truncate ${finalUpfront ? 'text-red-600' : 'text-[var(--color-text-main)]'}`}>
            {activeMaterial.name}
          </h4>
        </div>
      </div>

      <div className="flex flex-col items-end shrink-0 gap-0.5 pr-1">
        <div className="flex items-center gap-1">
          <span className="text-[14px] font-bold italic tracking-[0.05em]" style={weightColorClass}>
            {readOnly && requiredWeight > 0 ? formatWeight(requiredWeight) : formatWeight(activeMaterial.remaining)}G
          </span>
        </div>
        <span className="text-[14px] font-bold uppercase tracking-[0.05em]">
          {readOnly ? (requiredWeight > 0 ? 'Needed' : 'Stock') : (isChanging ? 'Select Below' : 'Tap to Change')}
        </span>
      </div>
    </button>
  );
}
