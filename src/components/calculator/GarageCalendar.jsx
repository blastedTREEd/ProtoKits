import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTheme } from '../../context/ThemeContext';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DESIGN_SERVICE_EXTRA_DAYS = 1;

// Derive busy date ranges from active orders that contain project items
const getOccupiedDates = (orders = []) => {
  const occupied = new Map(); // dateKey -> count of projects occupying that day

  const activeOrders = orders.filter(o => {
    const status = (o.status || '').toLowerCase();
    return status !== 'cancelled' && status !== 'completed';
  });

  activeOrders.forEach(order => {
    const items = order.items || [];
    items.forEach(item => {
      if (item.type !== 'project') return;
      const printDays = Number(item.projectData?.totals?.days || 0);
      if (printDays <= 0) return;
      const designServiceDays = item.projectData?.selectedDesignService ? DESIGN_SERVICE_EXTRA_DAYS : 0;

      // Use order creation date as start
      let startDate;
      if (order.createdAt?.toDate) {
        startDate = order.createdAt.toDate();
      } else if (order.createdAt?.seconds) {
        startDate = new Date(order.createdAt.seconds * 1000);
      } else if (typeof order.createdAt === 'string') {
        startDate = new Date(order.createdAt);
      } else {
        startDate = new Date();
      }

      // Multiply by quantity
      const qty = Number(item.quantity || 1);
      const totalDays = (printDays + designServiceDays) * qty;

      for (let d = 0; d < totalDays; d++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + d);
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        occupied.set(key, (occupied.get(key) || 0) + 1);
      }
    });
  });

  return occupied;
};

// Find the first available start date (can be today if before cutoff, otherwise tomorrow or later)
const findFirstAvailable = (occupied) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let candidate = new Date(today);
  
  const currentHour = new Date().getHours();
  const canStartToday = currentHour < 17;
  
  if (!canStartToday) {
    candidate.setDate(candidate.getDate() + 1);
  }
  
  for (let i = 0; i < 365; i++) {
    const key = `${candidate.getFullYear()}-${candidate.getMonth()}-${candidate.getDate()}`;
    if (!occupied.has(key)) return new Date(candidate);
    candidate.setDate(candidate.getDate() + 1);
  }
  return new Date(today.getTime() + 86400000);
};

export default function GarageCalendar({ project, className = '' }) {
  const { isDarkMode } = useTheme();
  const orders = useStore((state) => state.orders);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const occupied = useMemo(() => getOccupiedDates(orders), [orders]);

  const hasDesignService = !!project?.selectedDesignService;
  const projectDays = Number(project?.totals?.days || 0) + (hasDesignService ? DESIGN_SERVICE_EXTRA_DAYS : 0);

  // Estimate production window for current project
  const projectionRange = useMemo(() => {
    if (projectDays <= 0) return new Set();
    const start = findFirstAvailable(occupied);
    const range = new Set();
    let added = 0;
    let candidate = new Date(start);
    while (added < projectDays) {
      const key = `${candidate.getFullYear()}-${candidate.getMonth()}-${candidate.getDate()}`;
      if (!occupied.has(key)) {
        range.add(key);
        added++;
      }
      candidate.setDate(candidate.getDate() + 1);
      if (added === 0 && candidate.getTime() - start.getTime() > 365 * 86400000) break;
    }
    return range;
  }, [occupied, projectDays]);

  // Calendar math
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const monthLabel = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Build day cells
  const cells = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push({ day: null, key: `empty-${i}` });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${month}-${d}`;
    const cellDate = new Date(year, month, d);
    const isPast = cellDate < today;
    const isToday = cellDate.getTime() === today.getTime();
    const isOccupied = occupied.has(dateKey);
    const isProjected = projectionRange.has(dateKey);
    cells.push({ day: d, key: dateKey, isPast, isToday, isOccupied, isProjected });
  }

  return (
    <div className={`w-full h-full flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 ${className}`}>
      <div className="w-full max-w-md space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/20">
              <Calendar size={16} strokeWidth={3} className="text-white" />
            </div>
            <div>
              <h3 className="text-[16px] font-black uppercase tracking-[0.2em]">Garage Calendar</h3>
              <p className="text-[16px] uppercase font-bold leading-tight">Production Availability</p>
            </div>
          </div>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between px-1">
          <button
            onClick={prevMonth}
            className={`p-2 rounded-xl transition-all active:scale-90 ${
              isDarkMode
                ? 'bg-white/5 hover:bg-white/10 text-white'
                : 'bg-black/5 hover:bg-black/10 text-neutral-900'
            }`}
          >
            <ChevronLeft size={16} strokeWidth={3} />
          </button>
          <span className="text-[14px] font-black uppercase tracking-widest">{monthLabel}</span>
          <button
            onClick={nextMonth}
            className={`p-2 rounded-xl transition-all active:scale-90 ${
              isDarkMode
                ? 'bg-white/5 hover:bg-white/10 text-white'
                : 'bg-black/5 hover:bg-black/10 text-neutral-900'
            }`}
          >
            <ChevronRight size={16} strokeWidth={3} />
          </button>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-1">
          {DAY_LABELS.map(label => (
            <div key={label} className="text-center text-[14px] font-black uppercase tracking-widest py-1">
              {label}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-3">
          {cells.map(cell => {
            if (cell.day === null) {
              return <div key={cell.key} className="aspect-square" />;
            }

            let bgClass = '';
            let textClass = '';
            let ringClass = '';

            if (cell.isPast) {
              bgClass = isDarkMode ? 'bg-white/[0.02]' : 'bg-black/[0.02]';
              textClass = 'opacity-50';
            } else if (cell.isProjected) {
              bgClass = 'bg-blue-500/20';
              textClass = 'text-blue-600 dark:text-blue-400 font-black';
              ringClass = 'ring-1 ring-blue-500/30';
            } else if (cell.isOccupied) {
              bgClass = isDarkMode ? 'bg-red-500/15' : 'bg-red-500/10';
              textClass = 'text-red-500 dark:text-red-400';
            } else {
              bgClass = isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-500/10';
              textClass = 'text-emerald-600 dark:text-emerald-400';
            }

            return (
              <div
                key={cell.key}
                className={`aspect-square rounded-lg flex items-center justify-center transition-all relative ${bgClass} ${ringClass}`}
              >
                <span className={`text-[16px] font-bold ${textClass}`}>
                  {cell.day}
                </span>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            <span className="text-[12px] font-black uppercase tracking-widest">Available</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
            <span className="text-[12px] font-black uppercase tracking-widest">Occupied</span>
          </div>
          {projectDays > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-blue-500 ring-1 ring-blue-500/40" />
              <span className="text-[12px] font-black uppercase tracking-widest">Your Project</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
