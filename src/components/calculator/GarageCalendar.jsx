import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTheme } from '../../context/ThemeContext';
import { getUnavailableDateSet, getUnavailableWeekdaySet, toDateKey } from '../../utils/availabilitySchedule';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DESIGN_SERVICE_EXTRA_DAYS = 1;

// Shared with the admin queue so both views use the same availability-aware schedule calculation.
// eslint-disable-next-line react-refresh/only-export-components
export const getProjectScheduleDates = (order, item, availabilitySchedule, scheduleType = 'printing') => {
  const printDays = Number(item.projectData?.totals?.days || 0);
  if (printDays <= 0) return [];

  const designServiceDays = item.projectData?.selectedDesignService ? DESIGN_SERVICE_EXTRA_DAYS : 0;
  const qty = Number(item.quantity || 1);
  const totalDays = (printDays + designServiceDays) * Math.max(1, qty);
  const startDate = order.createdAt?.toDate
    ? order.createdAt.toDate()
    : order.createdAt?.seconds
      ? new Date(order.createdAt.seconds * 1000)
      : typeof order.createdAt === 'string'
        ? new Date(order.createdAt)
        : new Date();
  const candidate = new Date(startDate);
  candidate.setHours(0, 0, 0, 0);
  const unavailableDates = getUnavailableDateSet(availabilitySchedule, scheduleType);
  const unavailableWeekdays = getUnavailableWeekdaySet(availabilitySchedule, scheduleType);
  const scheduledDates = [];

  for (let day = 0; day < totalDays; day += 1) {
    let guard = 0;
    while (
      (unavailableDates.has(toDateKey(candidate)) || unavailableWeekdays.has(candidate.getDay()))
      && guard < 3660
    ) {
      candidate.setDate(candidate.getDate() + 1);
      guard += 1;
    }

    if (guard >= 3660) break;
    scheduledDates.push(toDateKey(candidate));
    candidate.setDate(candidate.getDate() + 1);
  }

  return scheduledDates;
};

// Derive busy date ranges from active orders that contain project items.
// Pending orders are intentionally active here so a customer's own pending
// project is shown as occupied in the project-card calendar.
// Project days skip configured printing closures, so queued work rolls forward.
const getOccupiedDates = (orders = [], availabilitySchedule) => {
  const occupied = new Map(); // dateKey -> count of projects occupying that day

  const activeOrders = orders.filter(o => {
    const status = (o.status || '').toLowerCase();
    return status !== 'cancelled' && status !== 'completed';
  });

  activeOrders.forEach(order => {
    const items = order.items || [];
    items.forEach(item => {
      if (item.type !== 'project' && !item.projectData) return;
      getProjectScheduleDates(order, item, availabilitySchedule, 'printing').forEach((key) => {
        occupied.set(key, (occupied.get(key) || 0) + 1);
      });
    });
  });

  return occupied;
};

// Find the first available start date (can be today if before cutoff, otherwise tomorrow or later)
const findFirstAvailable = (occupied, unavailableDates = new Set(), unavailableWeekdays = new Set()) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let candidate = new Date(today);
  
  const currentHour = new Date().getHours();
  const canStartToday = currentHour < 17;
  
  if (!canStartToday) {
    candidate.setDate(candidate.getDate() + 1);
  }
  
  for (let i = 0; i < 365; i++) {
    const key = toDateKey(candidate);
    if (
      !occupied.has(key)
      && !unavailableDates.has(key)
      && !unavailableWeekdays.has(candidate.getDay())
    ) return new Date(candidate);
    candidate.setDate(candidate.getDate() + 1);
  }
  return new Date(today.getTime() + 86400000);
};

export default function GarageCalendar({
  project,
  className = '',
  orders: ordersProp,
  availabilitySchedule,
  adminMode = false,
  scheduleType = 'printing',
  onToggleUnavailable,
  onToggleUnavailableWeekday
}) {
  const { isDarkMode } = useTheme();
  const storeOrders = useStore((state) => state.orders);
  const orders = ordersProp ?? storeOrders;

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const occupied = useMemo(
    () => getOccupiedDates(orders, availabilitySchedule),
    [orders, availabilitySchedule]
  );
  const unavailableDates = useMemo(
    () => getUnavailableDateSet(availabilitySchedule, scheduleType),
    [availabilitySchedule, scheduleType]
  );
  const unavailableWeekdays = useMemo(
    () => getUnavailableWeekdaySet(availabilitySchedule, scheduleType),
    [availabilitySchedule, scheduleType]
  );
  const printingUnavailableDates = useMemo(
    () => getUnavailableDateSet(availabilitySchedule, 'printing'),
    [availabilitySchedule]
  );
  const printingUnavailableWeekdays = useMemo(
    () => getUnavailableWeekdaySet(availabilitySchedule, 'printing'),
    [availabilitySchedule]
  );

  const hasDesignService = !!project?.selectedDesignService;
  const projectDays = Number(project?.totals?.days || 0) + (hasDesignService ? DESIGN_SERVICE_EXTRA_DAYS : 0);

  // Estimate production window for current project
  const projectionRange = useMemo(() => {
    if (projectDays <= 0) return new Set();
    const start = findFirstAvailable(occupied, printingUnavailableDates, printingUnavailableWeekdays);
    const range = new Set();
    let added = 0;
    let candidate = new Date(start);
    while (added < projectDays) {
      const key = toDateKey(candidate);
      if (
        !occupied.has(key)
        && !printingUnavailableDates.has(key)
        && !printingUnavailableWeekdays.has(candidate.getDay())
      ) {
        range.add(key);
        added++;
      }
      candidate.setDate(candidate.getDate() + 1);
      if (added === 0 && candidate.getTime() - start.getTime() > 365 * 86400000) break;
    }
    return range;
  }, [occupied, projectDays, printingUnavailableDates, printingUnavailableWeekdays]);

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
    const dateKey = toDateKey(new Date(year, month, d));
    const cellDate = new Date(year, month, d);
    const isPast = cellDate < today;
    const isToday = cellDate.getTime() === today.getTime();
    const isOccupied = occupied.has(dateKey);
    const isProjected = projectionRange.has(dateKey);
    const isUnavailable = unavailableDates.has(dateKey) || unavailableWeekdays.has(cellDate.getDay());
    cells.push({ day: d, key: dateKey, isPast, isToday, isOccupied, isProjected, isUnavailable });
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
              <h3 className="text-[15px] font-black uppercase tracking-[0.2em]">Garage Calendar</h3>
              <p className="text-[13px] uppercase font-bold leading-tight">Production Availability</p>
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
          {DAY_LABELS.map((label, weekday) => (
            <button
              type="button"
              key={label}
              disabled={!adminMode}
              aria-pressed={unavailableWeekdays.has(weekday)}
              aria-label={`${label}: ${unavailableWeekdays.has(weekday) ? 'unavailable every week' : 'available every week'}`}
              onClick={() => adminMode && onToggleUnavailableWeekday?.(weekday)}
              className={`text-center text-[13px] font-black uppercase tracking-widest py-1 rounded-lg transition ${adminMode ? 'cursor-pointer hover:bg-red-500/10' : ''} ${unavailableWeekdays.has(weekday) ? 'bg-red-500/15 text-red-600 dark:text-red-400' : ''}`}
            >
              {label}
            </button>
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
            } else if (cell.isUnavailable) {
              bgClass = isDarkMode ? 'bg-red-500/20' : 'bg-red-500/15';
              textClass = 'text-red-600 dark:text-red-400 font-black';
              ringClass = 'ring-1 ring-red-500/40';
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
              <button
                type="button"
                key={cell.key}
                onClick={() => adminMode && !cell.isPast && onToggleUnavailable?.(cell.key)}
                disabled={!adminMode || cell.isPast}
                aria-label={adminMode ? `${cell.key}: ${cell.isUnavailable ? 'unavailable' : 'available'}` : cell.key}
                className={`aspect-square rounded-lg flex items-center justify-center transition-all relative ${bgClass} ${ringClass} ${adminMode && !cell.isPast ? 'cursor-pointer hover:scale-105' : ''}`}
              >
                <span className={`text-[15px] font-bold ${textClass}`}>
                  {cell.day}
                </span>
              </button>
            );
          })}
        </div>

        {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            <span className="text-[13px] font-black uppercase tracking-widest">Available</span>
          </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
              <span className="text-[13px] font-black uppercase tracking-widest">{adminMode || unavailableDates.size > 0 ? 'Unavailable / occupied' : 'Occupied'}</span>
            </div>
          {projectDays > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-blue-500 ring-1 ring-blue-500/40" />
              <span className="text-[13px] font-black uppercase tracking-widest">Your Project</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
