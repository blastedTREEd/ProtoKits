import React, { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { Zap, Droplet, Layers2, CircleDot, RefreshCw } from 'lucide-react'; 
import LoadingState from '../common/LoadingState';

export default function PrinterSelection({ onSelect, selectedPrinter: initialSelection = null }) {
  const dbPrinters = useStore((state) => state.printers);
  const isLoading = useStore((state) => state.isLoading);
  
  const printers = dbPrinters || [];
  
  // FIX 1: Hanapin ang tamang printer object mula sa dbPrinters gamit ang ID 
  // para makuha ang original properties (status, wattage, etc.)
  const [selectedPrinter, setSelectedPrinter] = useState(() => {
    if (!initialSelection) return null;
    return printers.find(p => p.id === initialSelection.id) || initialSelection;
  });

  const [displayUnit, setDisplayUnit] = useState('mm');

  const handleToggle = (printer) => {
    setSelectedPrinter(selectedPrinter?.id === printer.id ? null : printer);
    setDisplayUnit('mm'); 
  };

  const formatValue = (num, decimals) => Number(num.toFixed(decimals));

  const convertCapacity = (capacity) => {
    if (!capacity) return '---';
    if (typeof capacity === 'object') {
      const { x, y, z } = capacity;
      if (!x || !y || !z) return '---';
      const dims = [x, y, z];
      const spacer = ' × ';
      if (displayUnit === 'cm') return dims.map(d => formatValue(d / 10, 1)).join(spacer);
      if (displayUnit === 'in') return dims.map(d => formatValue(d / 25.4, 2)).join(spacer);
      return dims.join(spacer);
    }
    return '---';
  };

  const cycleUnit = (e) => {
    e.stopPropagation();
    const units = ['mm', 'cm', 'in'];
    const nextIndex = (units.indexOf(displayUnit) + 1) % units.length;
    setDisplayUnit(units[nextIndex]);
  };

  const isOnline = (printer) => printer?.status?.toLowerCase() === 'online';
  const isVirtual = (printer) => printer?.isVirtual === true || printer?.status?.toLowerCase() === 'virtual';
  const isSelectable = (printer) => printer && (isOnline(printer) || isVirtual(printer));

  // FIX 2: Gumamit ng useMemo para laging up-to-date ang visibility ng Next button
  const isSelectedOnline = useMemo(() => {
    if (!selectedPrinter) return false;
    
    const online = selectedPrinter?.status?.toLowerCase() === 'online';
    const virtual = selectedPrinter?.isVirtual === true || selectedPrinter?.status?.toLowerCase() === 'virtual';
    
    return online || virtual;
  }, [selectedPrinter]);

  if (isLoading) {
    return <LoadingState message="SYNCING_FLEET..." />;
  }

  // Styles
  const primaryThemeColor = "text-[var(--color-primary)]"; 
  const dataValueColor = "text-[var(--color-text-main)]";
  const reactiveUnitStyle = "text-[11px] font-black uppercase tracking-normal ml-1.5 opacity-60";
  const tileBaseStyle = "p-1 rounded-[1.8rem] flex flex-col items-stretch gap-3 transition-all duration-300 bg-transparent";
  const valueBorderStyle = "flex items-baseline justify-center w-full py-2.5 px-2 rounded-xl border border-gray-200 dark:border-white/10 bg-transparent leading-none whitespace-nowrap overflow-hidden";
  const headerContainerStyle = `flex items-center justify-center gap-1.5 ${primaryThemeColor}`;

  return (
    <div className="relative animate-in fade-in slide-in-from-right-4 duration-500">
      <style>{`
        @keyframes pulse-spin {
          0% { transform: rotate(0deg) scale(1); opacity: 0.7; }
          50% { transform: rotate(180deg) scale(1.3); opacity: 1; }
          100% { transform: rotate(360deg) scale(1); opacity: 0.7; }
        }
        .animate-pulse-rotate { animation: pulse-spin 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes border-glow-thick {
          0%, 100% { border-color: rgba(59, 130, 246, 0.4); box-shadow: 0 0 2px rgba(59, 130, 246, 0.1); }
          50% { border-color: rgba(59, 130, 246, 1); box-shadow: 0 0 12px rgba(59, 130, 246, 0.3); }
        }
        .animate-border-blue-thick { animation: border-glow-thick 2s ease-in-out infinite; }
      `}</style>
      
      <div className="flex flex-col gap-3 mb-4">
        {printers.map((printer) => {
          const online = isOnline(printer);
          const virtual = isVirtual(printer);
          const isSelected = selectedPrinter?.id === printer.id;
          const selectable = isSelectable(printer);
          const slots = printer.filamentSlots || 1;

          const statusClass = (online || virtual)
            ? (isSelected ? 'bg-[var(--color-primary)] text-white' : 'bg-green-500 text-white')
            : 'bg-red-500 text-white';

          return (
            <div
              key={printer.id}
              className={`relative overflow-hidden transition-all duration-500 rounded-[2.5rem] border-2 ${
                isSelected && selectable
                  ? 'border-[var(--color-primary)] bg-white dark:bg-zinc-900/40 shadow-xl shadow-[var(--color-primary)]/10 scale-[1.01]' 
                  : 'border-gray-200 dark:border-white/10 bg-transparent'
              }`}
            >
              <button
                onClick={() => handleToggle(printer)}
                className={`w-full p-6 pb-4 flex justify-between items-center outline-none group ${
                  (!online && !virtual && !isSelected) ? 'opacity-40 grayscale' : 'opacity-100'
                }`}
              >
                <div className="flex flex-col text-left">
                  <div className="flex flex-col gap-1">
                    <span className={`text-[15px] font-black uppercase tracking-tighter leading-none ${
                      isSelected ? primaryThemeColor : 'text-gray-400'
                    }`}>
                      {printer.brand}
                    </span>
                    <h3 className={`font-black uppercase text-[15px] leading-none tracking-tighter ${
                      isSelected ? primaryThemeColor : dataValueColor
                    }`}>
                      {printer.model}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg shadow-sm ${statusClass}`}>
                    {printer.status}
                  </span>
                  <div className={`p-1.5 rounded-full transition-all duration-500 ${
                    isSelected ? 'bg-[var(--color-primary)] rotate-180 text-white shadow-lg' : 'bg-gray-200 dark:bg-white/10'
                  }`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="4" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </button>

              <div className={`transition-all duration-500 ease-in-out overflow-hidden ${
                isSelected ? 'max-h-[600px] opacity-100 pb-7 px-5' : 'max-h-0 opacity-0'
              }`}>
                <div className="grid grid-cols-[30%_1fr] gap-2 mt-2">
                  <div className={tileBaseStyle}>
                    <div className={headerContainerStyle}>
                      <Zap size={12} fill="currentColor" />
                      <span className="text-[11px] font-black uppercase">POWER</span>
                    </div>
                    <div className={`${valueBorderStyle} ${dataValueColor}`}>
                      <span className="text-[13px] font-black">{parseFloat(printer.wattage) || '0'}</span>
                      <span className={reactiveUnitStyle}>W</span>
                    </div>
                  </div>

                  <div onClick={cycleUnit} className={`${tileBaseStyle} cursor-pointer group/unit`}>
                    <div className={headerContainerStyle}>
                      <Layers2 size={12} strokeWidth={3} />
                      <span className="text-[11px] font-black uppercase tracking-tight whitespace-nowrap">BUILD CAPACITY</span>
                    </div>
                    <div className={`${valueBorderStyle} ${dataValueColor} border-2 border-blue-500/50 animate-border-blue-thick relative pr-7 hover:scale-[1.02] transition-transform active:scale-95`}>
                      <span className="text-[13px] font-black tracking-tighter">{convertCapacity(printer.buildCapacity)}</span>
                      <span className={reactiveUnitStyle}>{displayUnit}</span>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <RefreshCw size={11} strokeWidth={3} className="text-blue-500 animate-pulse-rotate" />
                      </div>
                    </div>
                  </div>

                  <div className={tileBaseStyle}>
                    <div className={headerContainerStyle}>
                      <CircleDot size={12} />
                      <span className="text-[11px] font-black uppercase">NOZZLE</span>
                    </div>
                    <div className={`${valueBorderStyle} ${dataValueColor}`}>
                      <span className="text-[13px] font-black">{parseFloat(printer.nozzleSize) || '0.4'}</span>
                      <span className={reactiveUnitStyle}>MM</span>
                    </div>
                  </div>

                  <div className={tileBaseStyle}>
                    <div className={headerContainerStyle}>
                      <Droplet size={12} />
                      <span className="text-[11px] font-black uppercase">SLOTS</span>
                    </div>
                    <div className={`${valueBorderStyle} ${dataValueColor}`}>
                      <span className="text-[13px] font-black">{slots}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* NEXT BUTTON */}
      <div className={`px-5 sticky bottom-4 w-full mt-4 transition-all duration-500 z-50 
        ${isSelectedOnline ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 pointer-events-none scale-95'}`}
      >
        <div className="bg-white/80 dark:bg-black/80 backdrop-blur-md p-1 rounded-[2.5rem] border border-gray-200 dark:border-white/10 shadow-2xl">
          <button 
            onClick={() => {
              if (!selectedPrinter) return;
              onSelect({
                ...selectedPrinter,
                id: selectedPrinter.id,
                name: selectedPrinter.model || selectedPrinter.name, // Support both formats
                buildCapacity: selectedPrinter.buildCapacity,
                nozzleSize: parseFloat(selectedPrinter.nozzleSize) || 0.4,
                wattage: parseFloat(selectedPrinter.wattage) || selectedPrinter.power?.averageWatts || 120,
                bootupMins: parseFloat(selectedPrinter.bootupMins) || 0,
                homingMins: parseFloat(selectedPrinter.homingMins) || 0,
                bedLevelMins: parseFloat(selectedPrinter.bedLevelMins ?? selectedPrinter.bootLevelMins) || 0,
                bootLevelMins: parseFloat(selectedPrinter.bootLevelMins ?? selectedPrinter.bedLevelMins) || 0,
                power: {
                  averageWatts: parseFloat(selectedPrinter.wattage) || selectedPrinter.power?.averageWatts || 120
                }
              });
            }}
            className="w-full py-5 rounded-[2.2rem] font-black italic uppercase tracking-[0.2em] text-xs bg-[var(--color-primary)] text-white shadow-xl active:scale-95 transition-all"
          >
            NEXT
          </button>
        </div>
      </div>
    </div>
  );
}
