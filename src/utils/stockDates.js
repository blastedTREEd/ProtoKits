const MONTH_CODES = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
];

function normalizeMonthLabel(value) {
  const normalized = String(value || '').trim().toUpperCase();
  const monthCode = normalized.replace(/[^A-Z]/g, '').slice(0, 3);
  const matchedMonth = MONTH_CODES.find((code) => code.startsWith(monthCode));
  if (!matchedMonth) return '';

  const monthIndex = MONTH_CODES.indexOf(matchedMonth);
  const currentDate = new Date();
  const suppliedYear = normalized.match(/\b(20\d{2})\b/)?.[1];
  const year = suppliedYear
    ? Number(suppliedYear)
    : (monthIndex < currentDate.getMonth() ? currentDate.getFullYear() + 1 : currentDate.getFullYear());

  return `${matchedMonth} ${year}`;
}

function shiftMonthLabel(value, offset) {
  const normalized = normalizeMonthLabel(value);
  if (!normalized) return '';

  const [month, year] = normalized.split(' ');
  const shifted = new Date(Number(year), MONTH_CODES.indexOf(month) + offset, 1);
  return `${MONTH_CODES[shifted.getMonth()]} ${shifted.getFullYear()}`;
}

/**
 * Delivery Month is the month supplied by the admin. Customer-facing ETA is
 * the following month. Legacy records without deliveryMonth already contain
 * an ETA and therefore remain unchanged.
 */
export function getStockEta(stock = {}) {
  if (String(stock?.deliveryMonth || '').trim()) {
    return shiftMonthLabel(stock.deliveryMonth, 1);
  }

  // Pre-order records created before the field was renamed still store the
  // admin-entered delivery month in `eta`. Interpret those legacy records the
  // same way so they do not expose the delivery month as the customer ETA.
  if (isPreOrderStatus(stock?.status) && String(stock?.eta || '').trim()) {
    return shiftMonthLabel(stock.eta, 1) || String(stock.eta).trim();
  }

  return String(stock?.eta || '').trim();
}

function isPreOrderStatus(status) {
  const normalized = String(status || '').toLowerCase().replace(/[\s_]+/g, '-');
  return normalized === 'pre-order' || normalized === 'preorder' || normalized === 'batch';
}

export function getStockDeliveryMonth(stock = {}) {
  if (String(stock?.deliveryMonth || '').trim()) {
    return normalizeMonthLabel(stock.deliveryMonth);
  }
  return shiftMonthLabel(stock?.eta, -1);
}

export function getEtaFromDeliveryMonth(value) {
  return shiftMonthLabel(value, 1);
}

export function getDeliveryMonthFromEta(value) {
  return shiftMonthLabel(value, -1);
}
