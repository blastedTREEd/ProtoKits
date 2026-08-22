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

export const getPrinterCompatibleFilamentTypes = (printer) => {
  const configured = printer?.compatibleFilamentTypes ?? printer?.filamentTypes ?? [];
  return Array.isArray(configured)
    ? configured.map(normalizeFilamentType).filter(Boolean)
    : [];
};

// An empty compatibility list preserves legacy printers and means that every
// filament type is allowed until the admin explicitly selects restrictions.
export const isFilamentCompatibleWithPrinter = (printer, filament) => {
  const allowedTypes = getPrinterCompatibleFilamentTypes(printer);
  if (allowedTypes.length === 0) return true;
  return allowedTypes.includes(normalizeFilamentType(filament?.type));
};
