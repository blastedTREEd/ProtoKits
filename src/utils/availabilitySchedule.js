const SCHEDULE_TYPES = ['shipping', 'printing'];

export const DEFAULT_AVAILABILITY_SCHEDULE = {
  shippingUnavailableDates: [],
  printingUnavailableDates: [],
  shippingUnavailableWeekdays: [],
  printingUnavailableWeekdays: []
};

export const toDateKey = (date) => {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};

export const fromDateKey = (dateKey) => {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
};

const getScheduleField = (type) => (
  type === 'printing' ? 'printingUnavailableDates' : 'shippingUnavailableDates'
);

const getWeekdayField = (type) => (
  type === 'printing' ? 'printingUnavailableWeekdays' : 'shippingUnavailableWeekdays'
);

const asDateArray = (value) => (
  Array.isArray(value) ? value : []
);

const asWeekdayArray = (value) => (
  [...new Set(asDateArray(value).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b)
);

export const normalizeAvailabilitySchedule = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const legacyUnavailable = source.unavailable && typeof source.unavailable === 'object'
    ? source.unavailable
    : {};

  return {
    shippingUnavailableDates: [...new Set(
      asDateArray(source.shippingUnavailableDates || source.shipping?.unavailableDates || legacyUnavailable.shipping)
        .map(String)
        .filter(Boolean)
    )].sort(),
    printingUnavailableDates: [...new Set(
      asDateArray(source.printingUnavailableDates || source.printing?.unavailableDates || legacyUnavailable.printing)
        .map(String)
        .filter(Boolean)
    )].sort(),
    shippingUnavailableWeekdays: asWeekdayArray(
      source.shippingUnavailableWeekdays || source.shipping?.unavailableWeekdays || legacyUnavailable.shippingWeekdays
    ),
    printingUnavailableWeekdays: asWeekdayArray(
      source.printingUnavailableWeekdays || source.printing?.unavailableWeekdays || legacyUnavailable.printingWeekdays
    )
  };
};

export const getUnavailableDateSet = (schedule, type) => (
  new Set(normalizeAvailabilitySchedule(schedule)[getScheduleField(type)])
);

export const getUnavailableWeekdaySet = (schedule, type) => (
  new Set(normalizeAvailabilitySchedule(schedule)[getWeekdayField(type)])
);

export const isDateUnavailable = (schedule, type, date) => {
  const value = date instanceof Date ? date : new Date(date);
  return getUnavailableDateSet(schedule, type).has(toDateKey(value))
    || getUnavailableWeekdaySet(schedule, type).has(value.getDay());
};

export const toggleUnavailableDate = (schedule, type, dateKey) => {
  const normalized = normalizeAvailabilitySchedule(schedule);
  const field = getScheduleField(type);
  const dates = new Set(normalized[field]);
  if (dates.has(dateKey)) dates.delete(dateKey);
  else dates.add(dateKey);

  return {
    ...normalized,
    [field]: [...dates].sort()
  };
};

export const toggleUnavailableWeekday = (schedule, type, weekday) => {
  const normalized = normalizeAvailabilitySchedule(schedule);
  const field = getWeekdayField(type);
  const weekdays = new Set(normalized[field]);
  if (weekdays.has(weekday)) weekdays.delete(weekday);
  else weekdays.add(weekday);

  return {
    ...normalized,
    [field]: [...weekdays].sort((a, b) => a - b)
  };
};

export const getNextAvailableDate = (schedule, type, startDate = new Date(), maxDays = 730) => {
  const unavailableDates = getUnavailableDateSet(schedule, type);
  const unavailableWeekdays = getUnavailableWeekdaySet(schedule, type);
  const candidate = new Date(startDate);
  candidate.setHours(0, 0, 0, 0);

  for (let offset = 0; offset <= maxDays; offset += 1) {
    if (!unavailableDates.has(toDateKey(candidate)) && !unavailableWeekdays.has(candidate.getDay())) {
      return new Date(candidate);
    }
    candidate.setDate(candidate.getDate() + 1);
  }

  return null;
};

export const formatAvailabilityDate = (date) => {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(date instanceof Date ? date : new Date(date));
};

export const isAvailabilityType = (value) => SCHEDULE_TYPES.includes(value);
