const getProjectDetails = (value = {}) => (
  Array.isArray(value?.projectDetails)
    ? value.projectDetails
    : Array.isArray(value?.projectData?.projectDetails)
      ? value.projectData.projectDetails
      : []
);

export const getPrintedProjectModelName = (...sources) => {
  const values = sources.filter(Boolean);

  for (const source of values) {
    const detailNames = getProjectDetails(source)
      .map((entry) => String(entry?.itemName || entry?.name || '').trim())
      .filter(Boolean);
    if (detailNames.length > 0) return detailNames.join(' + ');
  }

  for (const source of values) {
    const name = source?.modelName || source?.name || source?.projectName;
    if (String(name || '').trim()) return String(name).trim();
  }

  return 'Printed project';
};
