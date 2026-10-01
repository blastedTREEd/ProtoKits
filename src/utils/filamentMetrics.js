const DEFAULT_FILAMENT_DENSITY = 1.24;
const DEFAULT_FILAMENT_DIAMETER_MM = 1.75;

const FILAMENT_DENSITIES = Object.freeze([
  ['PLA', 1.24],
  ['PETG', 1.27],
  ['ABS', 1.04],
  ['ASA', 1.07],
  ['TPU', 1.21],
  ['TPE', 1.20],
  ['NYLON', 1.14],
  ['PA', 1.14],
  ['PVA', 1.23],
  ['PC', 1.20],
  ['HIPS', 1.04],
  ['PP', 0.90]
]);

const readPositiveNumber = (...values) => {
  const value = values.find((candidate) => Number.isFinite(Number(candidate)) && Number(candidate) > 0);
  return value === undefined ? null : Number(value);
};

const normalizeMaterialType = (material) => (
  String(material?.type || material?.materialType || material?.name || '').trim().toUpperCase()
);

export const getFilamentDensity = (material) => {
  const explicitDensity = readPositiveNumber(
    material?.density,
    material?.densityGPerCm3,
    material?.density_g_cm3,
    material?.specificGravity
  );
  if (explicitDensity) return explicitDensity;

  const type = normalizeMaterialType(material);
  return FILAMENT_DENSITIES.find(([label]) => type.includes(label))?.[1] || DEFAULT_FILAMENT_DENSITY;
};

export const getFilamentDiameterMm = (material) => (
  readPositiveNumber(
    material?.diameterMm,
    material?.filamentDiameterMm,
    material?.diameter,
    material?.filamentDiameter
  ) || DEFAULT_FILAMENT_DIAMETER_MM
);

// For a one-metre strand, cross-sectional area in mm² equals volume in cm³.
export const getFilamentGramsPerMeter = (material) => {
  const radius = getFilamentDiameterMm(material) / 2;
  return Math.PI * radius * radius * getFilamentDensity(material);
};

export const filamentLengthMetersToWeightGrams = (lengthMeters, material) => (
  Math.max(0, Number(lengthMeters) || 0) * getFilamentGramsPerMeter(material)
);

export const filamentWeightGramsToLengthMeters = (weightGrams, material) => {
  const gramsPerMeter = getFilamentGramsPerMeter(material);
  return gramsPerMeter > 0
    ? Math.max(0, Number(weightGrams) || 0) / gramsPerMeter
    : 0;
};

export const formatFilamentLengthMeters = (lengthMeters) => {
  const value = Number(lengthMeters);
  return Number.isFinite(value) && value > 0 ? value.toFixed(2) : '';
};
