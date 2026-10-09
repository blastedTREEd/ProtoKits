export const COMMON_FILAMENT_TYPES = [
  'PLA',
  'PETG',
  'ABS',
  'ASA',
  'TPU',
  'NYLON',
  'PC',
  'PVA',
  'HIPS'
];

export const normalizeFilamentType = (type) => {
  const normalized = String(type || '').trim().toUpperCase();
  return normalized === 'PLA+' ? 'PLA' : normalized;
};

const normalizePrintTimeAdjustments = (adjustments = {}) => Object.entries(adjustments || {}).reduce((result, [type, value]) => {
  const rawType = String(type || '').trim().toUpperCase();
  const normalizedType = normalizeFilamentType(type);
  const numericValue = Number(value);
  if (!normalizedType || !Number.isFinite(numericValue) || numericValue <= 0) return result;
  if (normalizedType === 'PLA' && rawType === 'PLA+' && Number.isFinite(Number(result.PLA)) && Number(result.PLA) > 0) return result;
  result[normalizedType] = Math.round(numericValue * 10) / 10;
  return result;
}, {});

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
    ? [...new Set(configured.map(normalizeFilamentType).filter(Boolean))]
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
    printTimeAdjustments: normalizePrintTimeAdjustments(printer.printTimeAdjustments),
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
  const candidates = key === 'PLA' ? ['PLA', 'PLA+'] : [key];
  const configuredKey = candidates.find((candidate) => {
    const value = Number(adjustments[candidate]);
    return Number.isFinite(value) && value > 0;
  });
  return configuredKey ? Number(adjustments[configuredKey]) : 0;
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

/**
 * Extracts the original configured printer ID from a project or detail.
 * Falls back to current printerId if no originalPrinterId is explicitly set.
 */
export const getOriginalPrinterId = (project, detail = null) => {
  return (
    detail?.originalPrinterId
    || project?.originalPrinterId
    || detail?.printerId
    || (Array.isArray(detail?.productionJobs) ? detail.productionJobs[0]?.printerId : null)
    || project?.printerId
    || (Array.isArray(project?.projectDetails) ? project.projectDetails[0]?.printerId : null)
    || null
  );
};

/**
 * Returns a project object restored to its original configured printer and baseline specs,
 * stripping any temporary fallback printer assignments that were applied for live availability.
 */
export const getOriginalProjectConfiguration = (project) => {
  if (!project || typeof project !== 'object') return project;

  const originalPrinterId = project.originalPrinterId || project.printerId || null;
  const originalPrinterName = project.originalPrinterName || project.printerName || '';
  const rawDetails = Array.isArray(project.projectDetails) ? project.projectDetails : [];

  const restoredDetails = rawDetails.map((detail) => {
    const detailOriginalId = detail.originalPrinterId || originalPrinterId || detail.printerId || null;
    const detailOriginalName = detail.originalPrinterName || originalPrinterName || detail.printerName || '';
    const restoredJobs = Array.isArray(detail.productionJobs)
      ? detail.productionJobs.map((job) => ({
          ...job,
          printerId: job.originalPrinterId || detailOriginalId || job.printerId,
          printerName: job.originalPrinterName || detailOriginalName || job.printerName
        }))
      : detail.productionJobs;

    return {
      ...detail,
      printerId: detailOriginalId,
      printerName: detailOriginalName,
      ...(Array.isArray(detail.productionJobs) ? { productionJobs: restoredJobs } : {})
    };
  });

  return {
    ...project,
    printerId: originalPrinterId,
    printerName: originalPrinterName,
    ...(restoredDetails.length > 0 ? { projectDetails: restoredDetails } : {}),
    ...(project.originalTotals ? { totals: project.originalTotals } : {}),
    ...(project.originalSellPrice != null ? { sellPrice: project.originalSellPrice } : {}),
    ...(project.originalDisplayPrice != null ? { displayPrice: project.originalDisplayPrice } : {}),
    ...(project.originalMinDownpayment != null ? { minDownpayment: project.originalMinDownpayment } : {}),
    isTemporaryPrinter: false
  };
};

const getProjectDimensionsForResolution = (detail = {}) => {
  const config = detail.config || {};
  const dimensions = detail.dimensions || {};
  const unit = String(detail.unit || config.unit || dimensions.unit || 'mm').trim().toLowerCase();
  const multiplier = unit === 'cm' ? 10 : (unit === 'in' || unit === 'inch' || unit === 'inches' ? 25.4 : 1);
  const values = [
    detail.length ?? config.length ?? dimensions.length ?? dimensions.l ?? detail.baseMM_length,
    detail.width ?? config.width ?? dimensions.width ?? dimensions.w ?? detail.baseMM_width,
    detail.height ?? config.height ?? dimensions.height ?? dimensions.h ?? detail.baseMM_height
  ].map((value) => Number(value) * multiplier);

  return values.every((value) => Number.isFinite(value) && value > 0) ? values : null;
};

const getProjectMaterialEntriesForResolution = (detail = {}, filamentInventory = []) => {
  const entries = Array.isArray(detail.materials) && detail.materials.length > 0
    ? detail.materials
    : Array.isArray(detail.normalizedMaterials) && detail.normalizedMaterials.length > 0
      ? detail.normalizedMaterials
      : Array.isArray(detail.materialSlots) && detail.materialSlots.length > 0
        ? detail.materialSlots
        : [detail.material, detail.normalizedMaterial].filter(Boolean);

  return entries.map((entry) => {
    const source = entry?.material || entry?.normalizedMaterial || entry;
    const materialId = entry?.materialId || source?.materialId || source?.id;
    const inventoryMatch = (filamentInventory || []).find((filament) => (
      materialId && String(filament.id) === String(materialId)
    ));
    return {
      ...source,
      ...(inventoryMatch || {}),
      id: source?.id || materialId,
      materialId
    };
  }).filter((material) => material && (material.id || material.materialId || material.type || material.name));
};

const isProjectDetailCompatibleWithPrinter = (
  printer,
  detail = {},
  feeders = [],
  filamentInventory = []
) => {
  if (!printer || !isPrinterAvailableForCostEstimation(printer)) return false;

  const normalizedPrinter = normalizePrinterRecord(printer);
  const dimensions = getProjectDimensionsForResolution(detail);
  if (dimensions && !dimensions.every((value, index) => (
    value <= [normalizedPrinter.buildCapacity.x, normalizedPrinter.buildCapacity.y, normalizedPrinter.buildCapacity.z][index]
  ))) {
    return false;
  }

  const materials = getProjectMaterialEntriesForResolution(detail, filamentInventory);
  if (materials.some((material) => !isFilamentCompatibleWithPrinter(normalizedPrinter, material))) return false;

  const jobMaterialIds = (detail.productionJobs || []).flatMap((job) => job?.materialIds || []);
  const requiredSlots = Math.max(
    1,
    materials.length || new Set(jobMaterialIds.map(String)).size || 0
  );
  const compatibleFeeders = getPrinterFeeders(normalizedPrinter, feeders);
  if (requiredSlots > 1 && compatibleFeeders.length === 0) return false;

  const feederSlots = compatibleFeeders.reduce((total, feeder) => total + (Number(feeder.filamentSlots) || 0), 0);
  const availableSlots = Math.max(feederSlots || normalizedPrinter.filamentSlots || 1, 1);
  return availableSlots >= requiredSlots;
};

const getResolvedPrinterLabel = (printer) => (
  printer ? [printer.brand || printer.manufacturer, printer.model || printer.name].filter(Boolean).join(' ') : ''
);

const findPrinterById = (printers, id) => (
  id == null || id === ''
    ? null
    : (printers || []).find((printer) => String(printer.id) === String(id)) || null
);

/**
 * Resolves temporary printer assignments without changing the original
 * configured printer IDs. This is shared by background project repricing and
 * any future non-React recalculation path.
 */
export const resolveProjectPrinterAssignments = (project, resources = {}) => {
  if (!project || typeof project !== 'object') return { project, activePrinter: null, changed: false };

  const printers = Array.isArray(resources.printers) ? resources.printers : [];
  const feeders = Array.isArray(resources.feeders) ? resources.feeders : [];
  const filamentInventory = Array.isArray(resources.filamentInventory) ? resources.filamentInventory : [];
  const sourceDetails = Array.isArray(project.projectDetails) ? project.projectDetails : [];
  const projectOriginalId = project.originalPrinterId || null;
  const projectCurrentId = project.printerId || null;

  const getCandidates = (detail, job = null) => {
    const explicitOriginalId = job?.originalPrinterId
      || detail?.originalPrinterId
      || projectOriginalId
      || null;
    const currentId = job?.printerId || detail?.printerId || projectCurrentId || null;
    // Legacy projects may not have originalPrinterId yet. In that case the
    // currently saved assignment is the source configuration and must be
    // captured before selecting a temporary fallback.
    const originalId = explicitOriginalId || currentId;
    const orderedIds = [...new Set([originalId, currentId].filter(Boolean).map(String))];
    const assigned = orderedIds.map((id) => findPrinterById(printers, id)).filter(Boolean);
    const assignedIds = new Set(assigned.map((printer) => String(printer.id)));
    return {
      originalId,
      currentId,
      candidates: [
        ...assigned,
        ...printers.filter((printer) => !assignedIds.has(String(printer.id)))
      ]
    };
  };

  const resolveOne = (detail, job = null) => {
    const { originalId, currentId, candidates } = getCandidates(detail, job);
    const costCompatible = candidates.filter((printer) => (
      isProjectDetailCompatibleWithPrinter(printer, detail, feeders, filamentInventory)
    ));
    const selected = costCompatible.find(isPrinterAvailableForScheduling)
      || costCompatible[0]
      || findPrinterById(printers, currentId)
      || findPrinterById(printers, originalId)
      || null;
    const originalPrinter = findPrinterById(printers, originalId);
    const originalName = job?.originalPrinterName
      || detail?.originalPrinterName
      || project.originalPrinterName
      || getResolvedPrinterLabel(originalPrinter)
      || (originalId ? (job?.printerName || detail?.printerName || project.printerName || '') : '');
    const selectedId = selected?.id || currentId || originalId || null;
    const selectedName = getResolvedPrinterLabel(selected) || job?.printerName || detail?.printerName || project.printerName || '';

    return {
      selected,
      selectedId,
      selectedName,
      originalId: originalId || selectedId,
      originalName: originalName || (originalId === selectedId ? selectedName : '')
    };
  };

  let activePrinter = null;
  let changed = false;
  let anyTemporaryPrinter = false;

  const projectDetails = sourceDetails.map((detail) => {
    const jobs = Array.isArray(detail.productionJobs) ? detail.productionJobs : [];
    if (jobs.length === 0) {
      const resolved = resolveOne(detail);
      if (!activePrinter && resolved.selected) activePrinter = resolved.selected;
      const nextDetail = {
        ...detail,
        printer: resolved.selected || null,
        ...(resolved.selectedId ? { printerId: resolved.selectedId } : {}),
        ...(resolved.selectedName ? { printerName: resolved.selectedName } : {}),
        ...(resolved.originalId ? { originalPrinterId: resolved.originalId } : {}),
        ...(resolved.originalName ? { originalPrinterName: resolved.originalName } : {})
      };
      const temporary = Boolean(resolved.selectedId && resolved.originalId && String(resolved.selectedId) !== String(resolved.originalId));
      anyTemporaryPrinter = anyTemporaryPrinter || temporary;
      changed = changed
        || String(detail.printerId || '') !== String(nextDetail.printerId || '')
        || String(detail.printer?.id || '') !== String(nextDetail.printer?.id || '')
        || String(detail.originalPrinterId || '') !== String(nextDetail.originalPrinterId || '');
      return nextDetail;
    }

    const resolvedJobs = jobs.map((job) => {
      const resolved = resolveOne(detail, job);
      if (!activePrinter && resolved.selected) activePrinter = resolved.selected;
      const temporary = Boolean(resolved.selectedId && resolved.originalId && String(resolved.selectedId) !== String(resolved.originalId));
      anyTemporaryPrinter = anyTemporaryPrinter || temporary;
      const nextJob = {
        ...job,
        printer: resolved.selected || null,
        ...(resolved.selectedId ? { printerId: resolved.selectedId } : {}),
        ...(resolved.selectedName ? { printerName: resolved.selectedName } : {}),
        ...(resolved.originalId ? { originalPrinterId: resolved.originalId } : {}),
        ...(resolved.originalName ? { originalPrinterName: resolved.originalName } : {})
      };
      changed = changed
        || String(job.printerId || '') !== String(nextJob.printerId || '')
        || String(job.printer?.id || '') !== String(nextJob.printer?.id || '')
        || String(job.originalPrinterId || '') !== String(nextJob.originalPrinterId || '');
      return nextJob;
    });

    const firstJob = resolvedJobs[0];
    const detailOriginalId = detail.originalPrinterId
      || firstJob?.originalPrinterId
      || projectOriginalId
      || detail.printerId
      || null;
    const detailOriginalName = detail.originalPrinterName
      || firstJob?.originalPrinterName
      || project.originalPrinterName
      || firstJob?.printerName
      || detail.printerName
      || '';
    const nextDetail = {
      ...detail,
      printer: firstJob?.printer || null,
      ...(firstJob?.printerId ? { printerId: firstJob.printerId } : {}),
      ...(firstJob?.printerName ? { printerName: firstJob.printerName } : {}),
      ...(detailOriginalId ? { originalPrinterId: detailOriginalId } : {}),
      ...(detailOriginalName ? { originalPrinterName: detailOriginalName } : {}),
      productionJobs: resolvedJobs
    };
    changed = changed
      || String(detail.printerId || '') !== String(nextDetail.printerId || '')
      || String(detail.printer?.id || '') !== String(nextDetail.printer?.id || '')
      || String(detail.originalPrinterId || '') !== String(nextDetail.originalPrinterId || '');
    return nextDetail;
  });

  const firstDetail = projectDetails[0];
  const resolvedProject = {
    ...project,
    ...(projectDetails.length > 0 ? { projectDetails } : {}),
    ...(firstDetail?.printerId ? { printerId: firstDetail.printerId } : {}),
    ...(firstDetail?.printerName ? { printerName: firstDetail.printerName } : {}),
    ...(projectOriginalId || firstDetail?.originalPrinterId || projectCurrentId
      ? { originalPrinterId: projectOriginalId || firstDetail?.originalPrinterId || projectCurrentId }
      : {}),
    ...(project.originalPrinterName || firstDetail?.originalPrinterName || project.printerName
      ? { originalPrinterName: project.originalPrinterName || firstDetail?.originalPrinterName || project.printerName }
      : {}),
    isTemporaryPrinter: anyTemporaryPrinter
  };

  changed = changed
    || String(project.printerId || '') !== String(resolvedProject.printerId || '')
    || Boolean(project.isTemporaryPrinter) !== Boolean(resolvedProject.isTemporaryPrinter);

  return { project: resolvedProject, activePrinter, changed };
};
