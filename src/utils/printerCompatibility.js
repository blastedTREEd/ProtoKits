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

export const PRINTER_STATUSES = ['available', 'unavailable', 'maintenance'];

export const normalizePrinterStatus = (value, printer = {}) => {
  const raw = String(value ?? printer.status ?? printer.availability ?? '').trim().toLowerCase();
  if (raw === 'maintenance' || printer.maintenance === true || printer.isMaintenance === true || printer.inMaintenance === true || printer.maintenanceMode === true) {
    return 'maintenance';
  }
  if (raw === 'unavailable' || raw === 'offline' || raw === 'disabled' || raw === 'paused' || raw === 'error' || printer.available === false || printer.isAvailable === false) {
    return 'unavailable';
  }
  // Legacy online/ready/virtual records remain usable after virtual is removed.
  if (raw === 'available' || raw === 'online' || raw === 'ready' || raw === 'idle' || raw === 'standby' || raw === 'active' || raw === 'virtual' || printer.available === true || printer.isAvailable === true || printer.isVirtual === true) {
    return 'available';
  }
  return 'available';
};

export const isPrinterAvailableForCostEstimation = (printer) => {
  const status = normalizePrinterStatus(printer?.status, printer);
  return status === 'available' || status === 'maintenance';
};

export const isPrinterAvailableForScheduling = (printer) => normalizePrinterStatus(printer?.status, printer) === 'available';

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
    status: normalizePrinterStatus(printer.status, printer),
    buildCapacity: normalizeBuildCapacity(printer.buildCapacity ?? printer.build_capacity),
    nozzleSize: numberOrFallback(printer.nozzleSize ?? printer.nozzle_size, 0.4),
    wattage: numberOrFallback(printer.wattage ?? printer.power?.averageWatts ?? printer.power_watts, 120),
    filamentSlots: Math.max(1, Math.round(numberOrFallback(printer.filamentSlots ?? printer.filament_slots, 1))),
    bootupMins: numberOrFallback(printer.bootupMins ?? printer.bootuptimeMins ?? printer.bootup_time_mins, 0),
    homingMins: numberOrFallback(printer.homingMins ?? printer.homing_time_mins, 0),
    bedLevelMins: numberOrFallback(printer.bedLevelMins ?? printer.bedlevellingMins ?? printer.bedLevelingMins ?? printer.bootLevelMins, 0),
    bootLevelMins: numberOrFallback(printer.bootLevelMins ?? printer.bedLevelMins ?? printer.bedlevellingMins, 0),
    compatibleFilamentTypes: getPrinterCompatibleFilamentTypes(printer),
    printTimeAdjustments: (printer.printTimeAdjustments && typeof printer.printTimeAdjustments === 'object')
      ? printer.printTimeAdjustments
      : {},
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
  status: normalizePrinterStatus(feeder.status, feeder),
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

/**
 * Returns the print time adjustment percentage for a given filament type on a printer.
 * @param {Object} printer
 * @param {string} filamentType
 * @returns {number} Adjustment percentage (e.g. 15 for +15%, or 0)
 */
export const getPrintTimeAdjustment = (printer, filamentType) => {
  if (!printer || !filamentType) return 0;
  const adjustments = printer.printTimeAdjustments;
  if (!adjustments || typeof adjustments !== 'object') return 0;
  const key = normalizeFilamentType(filamentType);
  const value = Number(adjustments[key]);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

/**
 * Calculates the adjusted print time for an item or job based on individual material print time adjustments.
 * Proportional time allocation is derived from each material's explicit or equal weight share.
 * @param {Object} printer - Printer record
 * @param {Object} item - Print item / job containing material details
 * @param {number} rawTime - Base unadjusted slicer time in minutes
 * @returns {{ adjustedTime: number, effectiveAdjustmentPercent: number, adjustments: Array<{ type: string, percent: number, weightShare: number }> }}
 */
export const calculateItemAdjustedPrintTime = (printer, item, rawTime = 0) => {
  const baseTime = Number(rawTime) || 0;
  if (baseTime <= 0 || !printer) {
    return { adjustedTime: baseTime, effectiveAdjustmentPercent: 0, adjustments: [] };
  }

  const mats = (item?.normalizedMaterials && item.normalizedMaterials.length > 0)
    ? item.normalizedMaterials
    : [item?.normalizedMaterial || item?.material].filter(Boolean);

  if (!mats.length) {
    return { adjustedTime: baseTime, effectiveAdjustmentPercent: 0, adjustments: [] };
  }

  const explicitWeights = item?.materialWeights || {};
  const totalItemWeight = Number(item?.normalizedWeight ?? item?.weight ?? 0);

  // Compute weight for each material
  const materialShares = mats.map((mat) => {
    const matKey = String(mat.materialId || mat.id || '');
    const explicitW = Number(explicitWeights[matKey] ?? (matKey ? explicitWeights[String(mat.id)] : undefined));
    const fallbackW = totalItemWeight > 0 ? (totalItemWeight / mats.length) : 1;
    const weight = Number.isFinite(explicitW) && explicitW > 0 ? explicitW : fallbackW;
    const type = normalizeFilamentType(mat.type);
    const percent = getPrintTimeAdjustment(printer, type);
    return { mat, type, weight, percent };
  });

  const totalCalculatedWeight = materialShares.reduce((sum, m) => sum + m.weight, 0);

  if (totalCalculatedWeight <= 0) {
    // Fallback: simple average
    const totalPercent = materialShares.reduce((sum, m) => sum + m.percent, 0);
    const avgPercent = totalPercent / materialShares.length;
    const adjustedTime = Math.round(baseTime * (1 + avgPercent / 100));
    return {
      adjustedTime,
      effectiveAdjustmentPercent: Number(avgPercent.toFixed(2)),
      adjustments: materialShares.map((m) => ({ type: m.type, percent: m.percent, weightShare: 1 / materialShares.length }))
    };
  }

  let totalAdjustedTime = 0;
  const appliedAdjustments = [];

  materialShares.forEach((m) => {
    const weightShare = m.weight / totalCalculatedWeight;
    const sliceTime = baseTime * weightShare;
    const adjustedSlice = sliceTime * (1 + (m.percent / 100));
    totalAdjustedTime += adjustedSlice;
    appliedAdjustments.push({
      type: m.type,
      percent: m.percent,
      weightShare
    });
  });

  const effectiveAdjustmentPercent = baseTime > 0
    ? Number((((totalAdjustedTime - baseTime) / baseTime) * 100).toFixed(2))
    : 0;

  return {
    adjustedTime: Math.round(totalAdjustedTime),
    effectiveAdjustmentPercent,
    adjustments: appliedAdjustments
  };
};
