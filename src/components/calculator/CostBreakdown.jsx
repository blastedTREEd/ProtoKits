import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Coins, User, Zap, PlusCircle, Box,
  ChevronUp, Info, TrendingUp, Wallet,
  Disc3,
  Wrench,
  RotateCcw
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { computeProjectCosts } from '../../utils/calculationEngine';

const CostItem = ({ icon, label, value, colorClass, details }) => {
  const [showFormula, setShowFormula] = useState(false);
  const textColor = colorClass.split(' ').find((c) => c.startsWith('text-')) || 'text-blue-600';
  const Icon = icon;
  return (
    <div className="border-b border-[var(--color-border)] py-5 transition-all space-y-3 px-2">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-2xl ${colorClass} bg-opacity-10`}>
            <Icon size={24} className={textColor} />
          </div>
          <div>
            <span className="text-[13px] font-black uppercase tracking-widest opacity-30 block mb-0.5 italic">Component</span>
            <span className="text-[14px] font-black uppercase tracking-tight">{label}</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[13px] font-black uppercase tracking-widest opacity-30 block mb-0.5 italic">Subtotal</span>
          <span className={`text-[20px] font-black italic ${textColor} tracking-tighter`}>₱{value}</span>
        </div>
      </div>
      <button onClick={() => setShowFormula(!showFormula)} className="flex items-center gap-2 text-[13px] font-black uppercase tracking-widest opacity-30 hover:opacity-100 transition-all ml-[60px]">
        {showFormula ? <ChevronUp size={12} strokeWidth={4} /> : <Info size={12} strokeWidth={4} />}
        {showFormula ? 'Hide Details' : 'Show Breakdown'}
      </button>
      {showFormula && details && (
        <div className="ml-[60px] bg-[var(--color-bg)]/30 rounded-[1.5rem] p-5 border border-dashed border-[var(--color-border)] animate-in slide-in-from-top-2 duration-300 space-y-4">
          {details.map((section, idx) => (section.items?.length > 0 && (
            <div key={idx} className="space-y-2">
              {section.title && <div className="text-[13px] font-black text-blue-600 opacity-60 uppercase tracking-[0.2em] border-b border-[var(--color-border)] pb-1 mb-2">{section.title}</div>}
              {section.items.map((item, sIdx) => (
                <div key={sIdx} className="flex justify-between items-start text-[13px] font-bold uppercase tracking-tight gap-3">
                  <div className="flex flex-col max-w-[70%] text-[var(--color-text-main)] opacity-70">
                    <span>{item.label}</span>
                    {item.sub && <span className="text-[13px] opacity-50 lowercase italic leading-snug mt-1">{item.sub}</span>}
                  </div>
                  <span className={`font-black whitespace-nowrap ${item.isProfit ? 'text-emerald-500' : 'text-[var(--color-text-main)]'}`}>{item.calc}</span>
                </div>
              ))}
            </div>
          )))}
        </div>
      )}
    </div>
  );
};

export default function CostBreakdown({ 
  data, 
  activePrinter, 
  dbSettings, 
  onCalculate,
  isInventoryMode = false
}) {
  const storeRates = useStore((state) => state.rates);
  const filamentInventory = useStore((state) => state.filamentInventory);
  const printers = useStore((state) => state.printers);
  const feeders = useStore((state) => state.feeders);

  const calculations = useMemo(() => {
    return computeProjectCosts({
      data,
      activePrinter,
      dbSettings,
      storeRates,
      printers,
      feeders,
      filamentInventory,
      isInventoryMode
    });
  }, [data, activePrinter, dbSettings, storeRates, printers, feeders, filamentInventory, isInventoryMode]);

  useEffect(() => { if (calculations && onCalculate) onCalculate(calculations); }, [calculations, onCalculate]);
  if (!calculations) return null;

  const hasReprintLoss = Number(calculations.reprintLoss?.totalLossNum || 0) > 0;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
      <div className="max-w-2xl mx-auto divide-y divide-[var(--color-border)] bg-[var(--color-surface)] rounded-[2.5rem] px-4 shadow-sm border border-[var(--color-border)]">
        <CostItem icon={Disc3} label="Filament" value={calculations.filament} colorClass="bg-amber-500 text-amber-600" details={calculations.details.filament} />
        <CostItem icon={User} label="Labor" value={calculations.labor} colorClass="bg-green-500 text-green-600" details={calculations.details.labor} />
        {parseFloat(calculations.extras) > 0 && <CostItem icon={Box} label="Extras" value={calculations.extras} colorClass="bg-purple-500 text-purple-600" details={calculations.details.extras} />}
        <CostItem icon={Zap} label="Electricity" value={calculations.electricity} colorClass="bg-blue-500 text-blue-600" details={calculations.details.electricity} />
        <CostItem icon={Wrench} label="Maintenance" value={calculations.maintenance} colorClass="bg-rose-500 text-rose-600" details={calculations.details.maintenance} />
      </div>

      <div className="space-y-2">
        <div className="max-w-2xl mx-auto mx-2 p-6 rounded-[2rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500 rounded-xl text-white">
              <TrendingUp size={20} />
            </div>
            <div>
              <span className="text-[13px] font-black uppercase opacity-60 block tracking-widest italic">Net Profit</span>
              <span className="text-[14px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tight">Total Project Earnings</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[24px] font-black italic text-emerald-600 tracking-tighter">₱{calculations.totalProfit}</span>
          </div>
        </div>

        <div className="max-w-2xl mx-auto mx-2 p-6 rounded-[2rem] bg-blue-600 text-white flex flex-col gap-4 shadow-xl shadow-blue-600/20 relative overflow-hidden">
          <Wallet size={80} className="absolute -right-4 -bottom-4 opacity-10 -rotate-12" />
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-md">
                <Wallet size={20} />
              </div>
              <div>
                <span className="text-[13px] font-black uppercase opacity-60 block tracking-widest italic">Take Home</span>
                <span className="text-[14px] font-black uppercase tracking-tight">Pocket-Ready Income</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[24px] font-black italic tracking-tighter">₱{calculations.totalTakeHome}</span>
            </div>
          </div>

          {hasReprintLoss && (
            <div className="relative z-10 pt-3 border-t border-white/20 text-white/90 text-[12px] space-y-1.5 font-bold uppercase tracking-tight">
              <div className="flex justify-between items-center text-amber-200">
                <span className="flex items-center gap-1.5"><RotateCcw size={13} strokeWidth={3} /> Base Take Home</span>
                <span>₱{calculations.reprintLoss.baseTakeHome}</span>
              </div>
              <div className="flex justify-between items-center text-rose-200/90 pl-3">
                <span>- Reprint Filament Cost</span>
                <span>-₱{calculations.reprintLoss.materialLoss}</span>
              </div>
              <div className="flex justify-between items-center text-rose-200/90 pl-3">
                <span>- Reprint Electricity Cost</span>
                <span>-₱{calculations.reprintLoss.electricityLoss}</span>
              </div>
              <div className="flex justify-between items-center text-amber-200 pt-1 border-t border-white/10 font-black">
                <span>Net Pocket-Ready Income (After Reprint Loss)</span>
                <span>₱{calculations.totalTakeHome}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
