import React from 'react';
import { CalendarDays, Disc3, Link2, PrinterCheck, PrinterX, Unlink2 } from 'lucide-react';
import { LuRotate3D } from 'react-icons/lu';

const tileClass = 'rounded-xl flex items-center justify-center bg-white/70 shadow-sm dark:bg-white/10';

export default function ProjectStatusGrid({
  printerAvailable = false,
  materialsAvailable = false,
  canStartToday = false,
  hasDesignService = false,
  fileLinkIsValid = false,
  bareTiles = false,
  className = 'w-full h-full grid grid-cols-2 gap-2'
}) {
  const tileClassName = bareTiles
    ? 'flex items-center justify-center'
    : tileClass;

  const statusContent = (
    <>
      <div className={tileClassName} title={printerAvailable ? 'Printer available' : 'Printer unavailable'}>
        {printerAvailable ? (
          <PrinterCheck size={24} className="text-emerald-500" strokeWidth={2.5} />
        ) : (
          <PrinterX size={24} className="text-red-500" strokeWidth={2.5} />
        )}
      </div>
      <div className={tileClassName} title={materialsAvailable ? 'Materials available' : 'Materials unavailable'}>
        <Disc3 size={24} className={materialsAvailable ? 'text-emerald-500' : 'text-red-500'} strokeWidth={2.5} />
      </div>
      <div className={tileClassName} title={canStartToday ? 'Available today' : 'Not available today'}>
        <CalendarDays size={24} className={canStartToday ? 'text-blue-500' : 'text-red-500'} strokeWidth={2.5} />
      </div>
      <div className={tileClassName} title={hasDesignService ? '3D service selected' : fileLinkIsValid ? 'File link available' : 'File link missing'}>
        {hasDesignService ? (
          <LuRotate3D size={24} className="text-violet-500" strokeWidth={2.5} />
        ) : fileLinkIsValid ? (
          <Link2 size={24} className="text-emerald-500" strokeWidth={2.5} />
        ) : (
          <Unlink2 size={24} className="text-red-500" strokeWidth={2.5} />
        )}
      </div>
    </>
  );

  return (
    <div className={className}>
      {bareTiles ? (
        <div className="w-full h-full rounded-lg border border-blue-100 dark:border-blue-900 bg-white/80 dark:bg-neutral-900/70 p-1.5 grid grid-cols-2 md:grid-cols-4 gap-1.5">
          {statusContent}
        </div>
      ) : statusContent}
    </div>
  );
}
