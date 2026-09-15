import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';

function get12HourTimeParts(date) {
  const hours = date.getHours();
  const hour12 = hours % 12 || 12;
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  return {
    hour: String(hour12).padStart(2, '0'),
    minute: String(date.getMinutes()).padStart(2, '0'),
    meridiem
  };
}

function parse12HourTimeParts(hourInput, minuteInput, meridiem) {
  const hour = Number(hourInput);
  const minute = Number(minuteInput);
  if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { hours: (hour % 12) + (meridiem === 'PM' ? 12 : 0), minutes: minute };
}

function parseLocalDateTime(value) {
  if (!value) return null;
  const [datePart, timePart = '00:00'] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  if (![year, month, day, hours, minutes].every(Number.isFinite)) return null;
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function formatLocalDateTimeValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getMonthMatrix(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

export function CustomDateTimePicker({
  value,
  onChange,
  min,
  disabled = false,
  isDarkMode,
  placeholder,
  allowClear = true,
  renderInline = false,
  align = 'left'
}) {
  const pickerRef = useRef(null);
  const triggerRef = useRef(null);
  const minDate = useMemo(() => parseLocalDateTime(min), [min]);
  const selectedDate = useMemo(() => parseLocalDateTime(value), [value]);
  const [isOpen, setIsOpen] = useState(false);
  
  // Use useMemo for initial state logic rather than syncing state in useEffect
  const initialDate = useMemo(() => selectedDate || minDate || new Date(), [selectedDate, minDate]);
  
  const [draftDate, setDraftDate] = useState(initialDate);
  const [viewDate, setViewDate] = useState(initialDate);
  const initialTimeParts = useMemo(() => get12HourTimeParts(initialDate), [initialDate]);
  const [hourInput, setHourInput] = useState(() => initialTimeParts.hour);
  const [minuteInput, setMinuteInput] = useState(() => initialTimeParts.minute);
  const [meridiem, setMeridiem] = useState(() => initialTimeParts.meridiem);

  // Update states when dependencies change, but avoiding direct setState in a side effect
  useEffect(() => {
    setDraftDate(initialDate);
    setViewDate(initialDate);
    const nextTimeParts = get12HourTimeParts(initialDate);
    setHourInput(nextTimeParts.hour);
    setMinuteInput(nextTimeParts.minute);
    setMeridiem(nextTimeParts.meridiem);
  }, [initialDate]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!pickerRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      pickerRef.current
        ?.querySelector('[data-date-time-picker-panel="true"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isOpen]);

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  const monthCells = useMemo(() => getMonthMatrix(viewDate), [viewDate]);

  const applyDraft = (date) => {
    const nextDate = minDate && date.getTime() < minDate.getTime() ? minDate : date;
    setDraftDate(nextDate);
    const nextTimeParts = get12HourTimeParts(nextDate);
    setHourInput(nextTimeParts.hour);
    setMinuteInput(nextTimeParts.minute);
    setMeridiem(nextTimeParts.meridiem);
    onChange(formatLocalDateTimeValue(nextDate));
  };

  const syncTimeInputs = (date) => {
    const nextTimeParts = get12HourTimeParts(date);
    setHourInput(nextTimeParts.hour);
    setMinuteInput(nextTimeParts.minute);
    setMeridiem(nextTimeParts.meridiem);
  };

  const commitTimeInputs = (nextMeridiem = meridiem) => {
    const parsed = parse12HourTimeParts(hourInput, minuteInput, nextMeridiem);
    if (!parsed) {
      syncTimeInputs(draftDate);
      return;
    }
    const nextDate = new Date(draftDate);
    nextDate.setHours(parsed.hours, parsed.minutes, 0, 0);
    setDraftDate(nextDate);
    applyDraft(nextDate);
  };

  const toggleMeridiem = () => {
    const nextMeridiem = meridiem === 'AM' ? 'PM' : 'AM';
    setMeridiem(nextMeridiem);
    commitTimeInputs(nextMeridiem);
  };

  const selectDay = (dayDate) => {
    if (!dayDate) return;
    const nextDate = new Date(dayDate);
    nextDate.setHours(draftDate.getHours(), draftDate.getMinutes(), 0, 0);
    if (minDate && nextDate.getTime() < minDate.getTime()) return;
    setDraftDate(nextDate);
    syncTimeInputs(nextDate);
    applyDraft(nextDate);
  };

  const isBeforeMinDay = (dayDate) => {
    if (!dayDate || !minDate) return false;
    const compareDate = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate()).getTime();
    const minCompareDate = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()).getTime();
    return compareDate < minCompareDate;
  };

  const shellClass = isDarkMode
    ? 'bg-white/5 border-white/10 text-white'
    : 'bg-neutral-50 border-black/10 text-neutral-900';
  const popoverClass = isDarkMode
    ? 'bg-[#111214] border-white/10 text-white'
    : 'bg-white border-black/10 text-neutral-900';
  const pickerPanel = (
    <div
      data-date-time-picker-panel="true"
      className={`${
        renderInline
          ? `absolute top-full mt-2 z-[120] w-[320px] ${align === 'right' ? 'right-0' : 'left-0'}`
          : 'fixed z-[700] w-[320px]'
      } rounded-[1.5rem] border p-4 shadow-2xl ${popoverClass}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
          className="rounded-xl border border-white/10 p-2 transition-all hover:bg-white/5"
        >
          <ChevronLeft size={14} />
        </button>
        <p className="text-[11px] font-black uppercase tracking-[0.2em]">
          {viewDate.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}
        </p>
        <button
          type="button"
          onClick={() => setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
          className="rounded-xl border border-white/10 p-2 transition-all hover:bg-white/5"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[9px] font-black uppercase tracking-widest opacity-45">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {monthCells.map((dayDate, index) => {
          const isSelected =
            dayDate &&
            draftDate.getFullYear() === dayDate.getFullYear() &&
            draftDate.getMonth() === dayDate.getMonth() &&
            draftDate.getDate() === dayDate.getDate();
          const isBlocked = isBeforeMinDay(dayDate);

          return (
            <button
              key={`${dayDate ? dayDate.toISOString() : 'empty'}-${index}`}
              type="button"
              onClick={() => selectDay(dayDate)}
              disabled={!dayDate || isBlocked}
              className={`h-10 rounded-xl text-[11px] font-black transition-all ${
                !dayDate
                  ? 'cursor-default opacity-0'
                  : isSelected
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : isBlocked
                      ? 'cursor-not-allowed opacity-25'
                      : 'hover:bg-blue-600/10'
              }`}
            >
              {dayDate?.getDate() || '.'}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <div className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest opacity-70">
          Time (12-hour)
          <div className={`flex items-center gap-1 rounded-xl border px-2 py-1 ${shellClass}`}>
            <input
              type="text"
              inputMode="numeric"
              value={hourInput}
              onChange={(event) => setHourInput(event.target.value.replace(/\D/g, '').slice(0, 2))}
              onBlur={() => commitTimeInputs()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitTimeInputs();
                }
              }}
              placeholder="HH"
              maxLength={2}
              className="w-10 bg-transparent px-1 py-1 text-center text-xs font-black outline-none"
              aria-label="Hour in 12-hour format"
            />
            <span>:</span>
            <input
              type="text"
              inputMode="numeric"
              value={minuteInput}
              onChange={(event) => setMinuteInput(event.target.value.replace(/\D/g, '').slice(0, 2))}
              onBlur={() => commitTimeInputs()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitTimeInputs();
                }
              }}
              placeholder="MM"
              maxLength={2}
              className="w-10 bg-transparent px-1 py-1 text-center text-xs font-black outline-none"
              aria-label="Minute in 12-hour format"
            />
            <button
              type="button"
              onClick={toggleMeridiem}
              className="ml-auto rounded-lg bg-blue-600 px-2 py-1 text-[10px] font-black text-white transition-colors hover:bg-blue-700"
              aria-label={`Switch to ${meridiem === 'AM' ? 'PM' : 'AM'}`}
            >
              {meridiem}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {allowClear && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setIsOpen(false);
            }}
            className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest opacity-70 transition-all hover:bg-white/5"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="flex-1 rounded-xl bg-blue-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20"
        >
          Done
        </button>
      </div>
    </div>
  );

  return (
    <div ref={pickerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-xs font-bold transition-all ${
          disabled ? 'cursor-not-allowed opacity-50' : ''
        } ${shellClass}`}
      >
        <span className={value ? '' : 'opacity-45'}>
          {value
            ? parseLocalDateTime(value)?.toLocaleString('en-GB', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })
            : placeholder}
        </span>
        <span className="flex items-center gap-2">
          <Clock3 size={14} className="opacity-50" />
          <Calendar size={14} className="opacity-70" />
        </span>
      </button>

      {isOpen && !disabled && (
        pickerPanel
      )}
    </div>
  );
}

export default CustomDateTimePicker;
