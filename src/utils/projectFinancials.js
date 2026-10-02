const hasValue = (value) => (
  value !== undefined
  && value !== null
  && value !== ''
  && Number.isFinite(Number(value))
);

export const parseProjectAmount = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? '').replace(/[^\d.-]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
};

export const getProjectData = (item) => (
  item?.projectData && typeof item.projectData === 'object'
    ? item.projectData
    : item?.project && typeof item.project === 'object'
      ? item.project
      : item || {}
);

export const getProjectType = (item) => {
  const project = getProjectData(item);
  const rawMethod = project?.method?.name
    || project?.method
    || project?.printMethod
    || item?.projectType
    || project?.projectType
    || '';
  const method = String(rawMethod).trim().toUpperCase();

  if (
    item?.printedProject === true
    || item?.isPrintedProject === true
    || project?.printedProject === true
    || project?.isPrintedProject === true
    || project?.productType === 'printed-project'
    || item?.productType === 'printed-project'
    || method === '3D PRINTED'
  ) return '3D PRINTED';

  if (method.includes('3MF')) return '3MF';
  if (method.includes('STL')) return 'STL';
  return method || 'PROJECT';
};

export const getProjectName = (item) => {
  const project = getProjectData(item);
  return project?.projectName
    || project?.name
    || item?.name
    || item?.item
    || 'Project';
};

export const getProjectRevenue = (item) => {
  const project = getProjectData(item);
  const totals = project?.totals || {};
  return parseProjectAmount(
    item?.price
      ?? item?.sellPrice
      ?? project?.displayPrice
      ?? totals.total
      ?? project?.sellPrice
  );
};

// New project snapshots carry this exact cost basis. Older snapshots are
// reconstructed from the calculator's base price and markup profit so their
// historical dashboard numbers remain useful instead of reporting zero cost.
export const getProjectCapitalCost = (item) => {
  const project = getProjectData(item);
  const totals = project?.totals || {};
  const originalTotals = project?.originalTotals || {};
  const explicitCapital = [
    item?.capitalCost,
    project?.capitalCost,
    totals.capitalCost,
    originalTotals.capitalCost
  ].find(hasValue);

  if (hasValue(explicitCapital)) return Math.max(0, parseProjectAmount(explicitCapital));

  // A zero project cost was written by older checkout builds before project
  // capital was persisted. Only use a legacy costPrice when it is positive;
  // otherwise continue to the calculator-based historical fallback below.
  const legacyCost = [item?.costPrice, project?.costPrice]
    .find((value) => hasValue(value) && parseProjectAmount(value) > 0);
  if (hasValue(legacyCost)) return Math.max(0, parseProjectAmount(legacyCost));

  const basePrice = parseProjectAmount(
    totals.basePrice
      ?? project?.sellPrice
      ?? project?.displayPrice
      ?? item?.sellPrice
      ?? item?.price
  );
  const markupProfit = parseProjectAmount(
    totals.totalProfit
      ?? originalTotals.totalProfit
  );

  if (basePrice > 0 && markupProfit >= 0 && basePrice >= markupProfit) {
    return Math.max(0, basePrice - markupProfit);
  }

  return null;
};

export const hasProjectCapitalCost = (item) => getProjectCapitalCost(item) !== null;
