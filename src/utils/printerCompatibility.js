export const COMMON_FILAMENT_TYPES = [
  'PLA',
  'PLA+',
  'PETG',
  'ABS',
  'ASA',
  'TPU',
  'NYLON',
  'PC',
  'PVA',
  'HIPS'
];

export const normalizeFilamentType = (type) => String(type || '').trim().toUpperCase();

const numberOrFallback = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeBuildCapacity = (value) => {
  if (value && typeof value === 'object') {
    return {
      x: numberOrFallback(value.x ?? value.X, 220),
      y: numberOrFallback(value.y ?? value.Y, 220),
      z: numberOrFallback(value.z ?? value.Z, 240)
    };
  }

  const dimensions = String(value || '').match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  return {
    x: numberOrFallback(dimensions[0], 220),
    y: numberOrFallback(dimensions[1], 220),
    z: numberOrFallback(dimensions[2], 240)
  };
};

export const getPrinterCompatibleFilamentTypes = (printer) => {
  const configured = printer?.compatibleFilamentTypes ?? printer?.filamentTypes ?? [];
  return Array.isArray(configured)
    ? configured.map(normalizeFilamentType).filter(Boolean)
    : [];
};

export const normalizePrinterRecord = (printer = {}) => {
  const rawAutoFeed = printer.autoFeed ?? printer.auto_feed;
  const legacyAutoFeed = rawAutoFeed && typeof rawAutoFeed === 'object' ? rawAutoFeed : {};
  const autoFeedType = legacyAutoFeed.compatibility
    || legacyAutoFeed.type
    || (typeof rawAutoFeed === 'string' ? rawAutoFeed : '')
    || printer.auto_feed_type
    || printer.autoFeedType;
  const autoFeed = autoFeedType
    ? {
        ...legacyAutoFeed,
        compatibility: autoFeedType,
        max: legacyAutoFeed.max ?? legacyAutoFeed.units ?? printer.auto_feed_units ?? printer.autoFeedMax ?? 1
      }
    : null;

  return {
    ...printer,
    buildCapacity: normalizeBuildCapacity(printer.buildCapacity ?? printer.build_capacity),
    nozzleSize: numberOrFallback(printer.nozzleSize ?? printer.nozzle_size, 0.4),
    wattage: numberOrFallback(printer.wattage ?? printer.power?.averageWatts ?? printer.power_watts, 120),
    filamentSlots: Math.max(1, Math.round(numberOrFallback(printer.filamentSlots ?? printer.filament_slots, 1))),
    bootupMins: numberOrFallback(printer.bootupMins ?? printer.bootuptimeMins ?? printer.bootup_time_mins, 0),
    homingMins: numberOrFallback(printer.homingMins ?? printer.homing_time_mins, 0),
    bedLevelMins: numberOrFallback(printer.bedLevelMins ?? printer.bedlevellingMins ?? printer.bedLevelingMins ?? printer.bootLevelMins, 0),
    bootLevelMins: numberOrFallback(printer.bootLevelMins ?? printer.bedLevelMins ?? printer.bedlevellingMins, 0),
    compatibleFilamentTypes: getPrinterCompatibleFilamentTypes(printer),
    feederIds: Array.isArray(printer.feederIds)
      ? printer.feederIds.map((id) => String(id))
      : Array.isArray(printer.feeders)
        ? printer.feeders.map((feeder) => String(feeder?.id ?? feeder)).filter(Boolean)
        : printer.feederId ? [String(printer.feederId)] : [],
    autoFeed
  };
};

export const normalizeFeederRecord = (feeder = {}) => ({
  ...feeder,
  name: feeder.name ?? feeder.label ?? feeder.model ?? feeder.id ?? '',
  type: feeder.type ?? feeder.compatibility ?? feeder.feederType ?? feeder.feeder_type ?? '',
  compatibility: feeder.compatibility ?? feeder.type ?? feeder.feederType ?? feeder.feeder_type ?? '',
  filamentSlots: Math.max(0, Math.round(numberOrFallback(feeder.filamentSlots ?? feeder.filament_slots ?? feeder.slots, 0))),
  swapTime: numberOrFallback(feeder.swapTime ?? feeder.swap_time, 0),
  wattage: numberOrFallback(feeder.wattage ?? feeder.power_watts, 0)
});

export const getPrinterFeeders = (printer, feeders = []) => {
  const normalizedPrinter = normalizePrinterRecord(printer);
  const normalizedFeeders = Array.isArray(feeders) ? feeders.map(normalizeFeederRecord) : [];
  const selectedIds = new Set(normalizedPrinter.feederIds || []);

  if (selectedIds.size > 0) {
    return normalizedFeeders.filter((feeder) => selectedIds.has(String(feeder.id)));
  }

  if (!normalizedPrinter.autoFeed || normalizedFeeders.length === 0) return [];
  const targetType = String(normalizedPrinter.autoFeed.compatibility || normalizedPrinter.autoFeed.type || '').toLowerCase();
  const maxUnits = Number(normalizedPrinter.autoFeed.max) || 1;
  if (!targetType) return [];

  return normalizedFeeders
    .filter((feeder) => String(feeder.type || feeder.compatibility || '').toLowerCase() === targetType)
    .slice(0, maxUnits);
};

// An empty compatibility list preserves legacy printers and means that every
// filament type is allowed until the admin explicitly selects restrictions.
export const isFilamentCompatibleWithPrinter = (printer, filament) => {
  const allowedTypes = getPrinterCompatibleFilamentTypes(printer);
  if (allowedTypes.length === 0) return true;
  return allowedTypes.includes(normalizeFilamentType(filament?.type));
};
