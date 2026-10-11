import React from 'react';
import { Calendar, Clock3, AlertCircle, Magnet, Disc3 } from 'lucide-react';

const formatMinutes = (mins) => {
  const total = Math.round(Number(mins) || 0);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};

export default function ProductionPlan({ schedule = [], projectCase = 'STL' }) {
  const is3MF = String(projectCase).toUpperCase() === '3MF';
  const itemLabel = is3MF ? 'Build Plate' : 'Model';

  const filteredSchedule = (schedule || []).map((day) => {
    const validPlates = (day.plates || []).filter((plate) => plate?.isReprint !== true);
    if (!validPlates.length) return null;

    const standardWorkMins = validPlates.reduce((sum, p) => sum + Number(p.scheduledMins || p.time || 0), 0);
    const loadPercent = Math.round((standardWorkMins / Math.max(1, Number(day.limitMins || (24 * 60)))) * 100);
    const latestContinuationDay = Math.max(
      day.day,
      ...validPlates.map((plate) => plate.endDay || day.day)
    );
    const dayLabel = latestContinuationDay > day.day ? `Day ${day.day}-${latestContinuationDay}` : `Day ${day.day}`;

    return {
      ...day,
      plates: validPlates,
      loadPercent,
      dayLabel,
      standardWorkMins
    };
  }).filter(Boolean);

  if (!filteredSchedule.length) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center py-20 opacity-30 italic">
        <AlertCircle size={40} className="mb-2" />
        <p className="text-[13px] font-black uppercase tracking-widest">
          No production plan generated
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 px-2 pb-20">
      {filteredSchedule.map((day) => {
        return (
          <div key={`${day.day}-${day.printerKey || day.printerName || 'printer'}`} className=" max-w-2xl mx-auto p-6 rounded-[2rem] border border-black/5 bg-white dark:bg-zinc-900/40 space-y-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[var(--color-primary)]">
                  <Calendar size={18} />
                  <h3 className="text-[14px] font-black uppercase tracking-tight">{day.dayLabel}</h3>
                </div>
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                  <Disc3 size={13} />
                  <span className="text-[13px] font-black uppercase tracking-[0.18em]">
                    {[day.printerName, day.filament || day.plates?.[0]?.filament || 'Unknown Filament'].filter(Boolean).join(' • ')}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-[22px] font-black italic text-[var(--color-primary)] leading-none">{day.loadPercent}%</div>
                <div className="text-[13px] font-black uppercase opacity-40 tracking-widest">Load</div>
              </div>
            </div>

            <div className="space-y-3">
              {day.plates?.map((plate) => (
                <div key={plate.id} className="rounded-[1.5rem] border border-black/5 bg-zinc-50 dark:bg-white/5 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-[14px] font-black uppercase tracking-tight">
                        {plate.name || `${itemLabel} ${plate.id}`}
                      </div>
                      {plate.endDay > plate.startDay && (
                        <div className="text-[13px] font-black uppercase tracking-[0.18em] text-amber-500 mt-1">
                          Runs Through Day {plate.endDay}
                        </div>
                      )}
                      <div className="text-[13px] font-bold uppercase opacity-40 tracking-widest mt-1">{plate.filament}</div>
                    </div>
                    <div className="flex items-center gap-1 text-[var(--color-primary)] flex-shrink-0">
                      <Clock3 size={13} />
                      <span className="text-[14px] font-black">{formatMinutes(plate.scheduledMins || plate.time)}</span>
                    </div>
                  </div>

                  {(plate.magnets > 0 || plate.heatsets > 0) && (
                    <div className={`grid gap-2 ${(plate.magnets > 0 && plate.heatsets > 0) ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {plate.magnets > 0 && (
                        <div className="rounded-2xl bg-white dark:bg-zinc-900/50 border border-black/5 px-3 py-2.5">
                          <div className="flex items-center gap-2 text-purple-500 mb-1">
                            <Magnet size={12} />
                            <span className="text-[13px] font-black uppercase tracking-widest">Magnets</span>
                          </div>
                          <div className="text-[13px] font-black">{plate.magnets}</div>
                        </div>
                      )}
                      {plate.heatsets > 0 && (
                        <div className="rounded-2xl bg-white dark:bg-zinc-900/50 border border-black/5 px-3 py-2.5">
                          <div className="flex items-center gap-2 text-orange-500 mb-1">
                            <Disc3 size={12} />
                            <span className="text-[13px] font-black uppercase tracking-widest">Heatsets</span>
                          </div>
                          <div className="text-[13px] font-black">{plate.heatsets}</div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 text-[13px] font-black uppercase tracking-widest opacity-50">
                    <span>Job Total {formatMinutes(plate.time)}</span>
                    <span>Today {formatMinutes(plate.scheduledMins || plate.time)}</span>
                    {plate.setupMins > 0 && <span>Setup {formatMinutes(plate.setupMins)}</span>}
                    {plate.installMins > 0 && <span>Install {formatMinutes(plate.installMins)}</span>}
                    {plate.postPrintHeatsetMins > 0 && (
                      <span>Post-Print Heatset {formatMinutes(plate.postPrintHeatsetMins)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-1 text-[13px] font-black uppercase tracking-widest opacity-50">
              Day Total: {formatMinutes(day.maxPrinterMins)}
              {day.gapMins > 0 && ` • Gap ${formatMinutes(day.gapMins)}`}
            </div>
            <div className="text-[13px] font-black uppercase tracking-widest opacity-40 flex flex-wrap gap-2">
              {day.printMins > 0 && <span>Print {formatMinutes(day.printMins)}</span>}
              {day.setupMins > 0 && <span>Setup {formatMinutes(day.setupMins)}</span>}
              {day.installMins > 0 && <span>Install {formatMinutes(day.installMins)}</span>}
              {day.gapMins > 0 && <span>Gap {formatMinutes(day.gapMins)}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
