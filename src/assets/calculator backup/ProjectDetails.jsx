import ProjectPreview from './ProjectPreview';
import ProjectPrepare from './ProjectPrepare';

export default function ProjectDetails({ 
  projectCase = '3MF', 
  allFilaments = [], 
  onConfirm, 
  selectedFilaments = [],
  displayUnit,
  onUnitChange,
  activePrinter,
  previewData,
  setPreviewData,
  prepareData,
  setPrepareData,
  // 🔥 NEW METADATA
  projectName,
  gdriveLink,
  updateMetadata
}) {
  const mode = String(projectCase).toUpperCase();

  const commonProps = {
    allFilaments,
    onConfirm,
    selectedFilaments,
    displayUnit,
    onUnitChange,
    activePrinter,
    prepareData,
    setPrepareData,
    previewData,
    setPreviewData,
    projectName,
    gdriveLink,
    updateMetadata
  };

  switch (mode) {
    case '3MF': 
      return <ProjectPreview {...commonProps} />;
    case 'STL': 
      return <ProjectPrepare {...commonProps} />;
    default: 
      return <ProjectPreview {...commonProps} />;
  }
}