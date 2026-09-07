export const FLEXI_BUNDLE_DEAL_TYPE = 'flexi_bundle';
export const WILD_SALE_DEAL_TYPE = 'wild_sale';
// Keep this export for existing callers. New records use WILD_SALE_DEAL_TYPE;
// old records with type "clearance" remain readable through isWildSaleDeal.
export const CLEARANCE_DEAL_TYPE = WILD_SALE_DEAL_TYPE;
export const LEGACY_CLEARANCE_DEAL_TYPE = 'clearance';

const hasPerKitSchedules = (deal = {}) => (
  deal?.clearanceKitSchedules
  && typeof deal.clearanceKitSchedules === 'object'
  && Object.keys(deal.clearanceKitSchedules).length > 0
);

// Before per-kit expiry was introduced, the clearance strategy was a single
// permanent eligible-kit promotion. Treat those records as FLEXI-BUNDLE so
// existing promotions remain available while their stored data is migrated by
// the next save.
export const isFlexiBundleDeal = (deal = {}) => (
  deal?.type === FLEXI_BUNDLE_DEAL_TYPE
  || (deal?.type === LEGACY_CLEARANCE_DEAL_TYPE && !hasPerKitSchedules(deal))
);

export const isWildSaleDeal = (deal = {}) => (
  deal?.type === WILD_SALE_DEAL_TYPE
  || (deal?.type === LEGACY_CLEARANCE_DEAL_TYPE && hasPerKitSchedules(deal))
);

// Compatibility alias while the rest of the pricing/display code is migrated
// away from the old Clearance terminology.
export const isPerKitClearanceDeal = (deal = {}) => (
  isWildSaleDeal(deal)
);

export const isClearanceLikeDeal = (deal = {}) => (
  isFlexiBundleDeal(deal) || isPerKitClearanceDeal(deal)
);

export const getClearanceDisplayLabel = (deal = {}) => (
  isFlexiBundleDeal(deal) ? 'FLEXI-BUNDLE' : isWildSaleDeal(deal) ? 'WILD DEAL' : 'CLEARANCE'
);

export const getClearanceKitSchedule = (deal = {}, kitId) => {
  const schedules = deal?.clearanceKitSchedules;
  if (!schedules || typeof schedules !== 'object') return null;
  return schedules[String(kitId)] || schedules[kitId] || null;
};

const parseDealDate = (value, endOfDay = false) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (Number.isFinite(Number(value?.seconds))) return new Date(Number(value.seconds) * 1000);

  const raw = String(value);
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T${endOfDay ? '23:59:59' : '00:00:00'}`
    : raw;
  const [datePart, timePart = '00:00'] = normalized.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  if (![year, month, day, hours, minutes].every(Number.isFinite)) return null;
  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const isClearanceKitActive = (deal = {}, kitId, now = Date.now()) => {
  if (!isPerKitClearanceDeal(deal)) return deal?.isActive !== false;

  const schedule = getClearanceKitSchedule(deal, kitId);
  if (!schedule || schedule.isActive === false) return false;

  const validFrom = parseDealDate(schedule.validFrom);
  const validUntil = parseDealDate(schedule.validUntil, true);
  if (validFrom && validFrom.getTime() > now) return false;
  if (validUntil && validUntil.getTime() <= now) return false;
  return true;
};

export const getActiveClearanceKitIds = (deal = {}, kitIds = [], now = Date.now()) => (
  (kitIds || []).map(id => String(id)).filter(id => isClearanceKitActive(deal, id, now))
);
