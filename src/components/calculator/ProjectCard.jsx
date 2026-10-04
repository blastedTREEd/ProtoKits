import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { 
  Box, CalendarDays, Clock, Zap, Plus, Lock, Edit3, Trash2, PackageMinus,
  X, Weight, Layers, AlertTriangle, Link2, Unlink2, ExternalLink, ChevronRight, ChevronLeft,
  ShoppingBasket, Play, Pause, FileText, ShieldCheck, CheckCircle2, XCircle, ImagePlus, Bell,
  Settings, Pencil, PencilSparkles, Sparkles
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTheme } from '../../context/ThemeContext';
import GarageCalendar, { findFirstAvailable, getOccupiedDates } from './GarageCalendar';
import ProjectStatusGrid from './ProjectStatusGrid';
import { getNextAvailableDate, getUnavailableDateSet, getUnavailableWeekdaySet, toDateKey } from '../../utils/availabilitySchedule';
import {
  getPrinterFeeders,
  isFilamentCompatibleWithPrinter,
  isPrinterAvailableForCostEstimation,
  isPrinterAvailableForScheduling,
  normalizePrinterRecord,
  normalizePrinterStatus,
  getOriginalPrinterId,
  getOriginalProjectConfiguration
} from '../../utils/printerCompatibility';
import CostBreakdown from './CostBreakdown';
import { LiaGoogleDrive } from 'react-icons/lia';
import { TbHexagon3D } from 'react-icons/tb';
import { LuRotate3D } from 'react-icons/lu';
import UniversalImage from '../common/UniversalImage';
import { getPrintedProjectModelName } from '../../utils/printedProjectName';

const Gallery = ({
  galleryImages,
  galleryIndex,
  setGalleryIndex,
  handleTouchStart,
  handleTouchEnd,
  className,
  thumbnailsContainerRef,
  isAdminGallery = false,
  gridImageId = '',
  onAddPhoto,
  onDeletePhoto,
  onSetGridPhoto,
  onToggleCalendar,
  placeholderSrc
}) => {
    const activeImage = galleryImages[galleryIndex];
    const hasActiveImage = Boolean(activeImage?.url);

    useEffect(() => {
        if (thumbnailsContainerRef.current) {
            const container = thumbnailsContainerRef.current;
            const activeThumb = container.children[galleryIndex];
            if (activeThumb) {
                const containerWidth = container.offsetWidth;
                const thumbWidth = activeThumb.offsetWidth;
                const scrollLeft = activeThumb.offsetLeft - (containerWidth / 2) + (thumbWidth / 2);
                container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            }
        }
    }, [galleryIndex, thumbnailsContainerRef]);

    return (
        <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} className={`w-full overflow-hidden bg-neutral-100 dark:bg-neutral-900 border-b sm:landscape:border-b-0 sm:landscape:border-r border-black/5 dark:border-white/5 relative group/img flex flex-col items-center justify-center h-[420px] sm:h-[450px] md:h-[550px] md:min-h-[150px] sm:landscape:h-full sm:landscape:w-5/12 sm:landscape:flex-1 shrink-0 isolate ${className || ''}`}>
            {activeImage && (
                <>
                    {hasActiveImage ? (
                      <UniversalImage src={activeImage.url} alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-110" />
                    ) : placeholderSrc ? (
                      <div className="absolute inset-0 bg-blue-600/10 dark:bg-blue-600/20" />
                    ) : null}
                    <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-4 lg:p-6">
                        {hasActiveImage ? (
                          <UniversalImage
                              src={activeImage.url}
                              alt={activeImage.type}
                              className="max-w-full max-h-full object-contain transition-opacity duration-300 mx-auto"
                          />
                        ) : placeholderSrc ? (
                          <img src={placeholderSrc} alt="Garage placeholder" className="max-w-[38%] max-h-[38%] object-contain opacity-45" />
                        ) : (
                          <span className="text-[11px] font-black uppercase tracking-widest opacity-50">No image</span>
                        )}
                    </div>
                    <div className="absolute bottom-4 z-20 flex items-center justify-between w-full px-4 gap-2">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setGalleryIndex(prev => prev === 0 ? galleryImages.length - 1 : prev - 1); }} 
                            disabled={galleryImages.length <= 1} 
                            className={`w-11 h-11 flex items-center justify-center rounded-full bg-black/15 backdrop-blur-md border border-white/30 shadow-lg text-white/90 hover:bg-black/25 hover:border-white/50 hover:scale-105 transition-all duration-200 ${galleryImages.length <= 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                        >
                            <ChevronLeft size={16} />
                        </button>

                        {galleryImages.length > 1 && (
                            <div 
                                ref={thumbnailsContainerRef} 
                                className="absolute left-1/2 h-11 w-[calc(100%-8rem)] -translate-x-1/2 flex justify-center items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth px-0"
                            >
                                {galleryImages.map((img, idx) => (
                                    <button 
                                        key={img.id || idx}
                                        onClick={(e) => { e.stopPropagation(); setGalleryIndex(idx); }}
                                        className={`relative w-11 h-11 rounded-full border-2 transition-all shrink-0 overflow-hidden group/thumb ${galleryIndex === idx ? 'border-blue-500 shadow-lg shadow-blue-500/30 z-10 opacity-100' : 'border-white/20 opacity-40 hover:opacity-100 hover:border-white/50'}`}
                                    >
                                        {img.url ? (
                                          <UniversalImage src={img.url} className="w-full h-full object-cover" alt="" />
                                        ) : placeholderSrc ? (
                                          <img src={placeholderSrc} className="w-full h-full object-contain bg-blue-600/10 p-2 opacity-45" alt="Garage placeholder" />
                                        ) : null}
                                    </button>
                                ))}
                            </div>
                        )}

                        <button 
                            onClick={(e) => { e.stopPropagation(); setGalleryIndex(prev => prev === galleryImages.length - 1 ? 0 : prev + 1); }} 
                            disabled={galleryImages.length <= 1} 
                            className={`w-11 h-11 flex items-center justify-center rounded-full bg-black/15 backdrop-blur-md border border-white/30 shadow-lg text-white/90 hover:bg-black/25 hover:border-white/50 hover:scale-105 transition-all duration-200 ${galleryImages.length <= 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                    <div className="absolute top-4 left-4 z-20 px-3 py-1 rounded-full bg-black/50 text-[9px] font-black uppercase text-white backdrop-blur-md tracking-widest">{activeImage.type} ({galleryIndex + 1}/{galleryImages.length})</div>
                </>
            )}
            {isAdminGallery && (
              <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSetGridPhoto?.(activeImage); }}
                  disabled={!activeImage?.url}
                  aria-pressed={Boolean(activeImage?.url && (activeImage.id === gridImageId || activeImage.isGridImage))}
                  aria-label={activeImage?.id === gridImageId || activeImage?.isGridImage ? 'Grid and highlight image selected' : 'Set current photo as grid and highlight image'}
                  title={activeImage?.id === gridImageId || activeImage?.isGridImage ? 'Grid and highlight image' : 'Set current photo as grid and highlight image'}
                  className={`h-9 w-9 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
                    activeImage?.id === gridImageId || activeImage?.isGridImage
                      ? 'bg-blue-600 text-white shadow-blue-600/30'
                      : 'bg-white/90 text-blue-600 shadow-black/10'
                  }`}
                >
                  <Sparkles size={16} strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onAddPhoto?.(); }}
                  className="h-9 w-9 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                  title="Add gallery photos"
                >
                  <ImagePlus size={16} strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDeletePhoto?.(galleryImages[galleryIndex]); }}
                  disabled={galleryImages.length <= 1 || !galleryImages[galleryIndex]?.url}
                  className={`h-9 w-9 rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all ${galleryImages.length <= 1 || !galleryImages[galleryIndex]?.url ? 'opacity-40 cursor-not-allowed' : ''}`}
                  title="Delete current photo"
                >
                  <Trash2 size={15} strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onToggleCalendar?.(); }}
                  className="h-9 w-9 rounded-full bg-white/90 text-blue-600 shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                  title="Show Garage Calendar"
                >
                  <CalendarDays size={16} strokeWidth={2.5} />
                </button>
              </div>
            )}
            <div className="absolute inset-0 z-20 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 pointer-events-none" />
        </div>
    );
};

const SPECTRAL_GRADIENTS = [
  'from-rose-500 to-orange-500',
  'from-orange-500 to-amber-500',
  'from-emerald-500 to-teal-500',
  'from-cyan-500 to-blue-500',
  'from-indigo-500 to-purple-500',
  'from-fuchsia-500 to-pink-500',
  'from-blue-600 to-indigo-600',
  'from-violet-500 to-purple-500'
];

const getSpectralGradient = (id) => {
  if (!id) return SPECTRAL_GRADIENTS[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h << 5) - h + id.charCodeAt(i);
    h |= 0;
  }
  return SPECTRAL_GRADIENTS[Math.abs(h) % SPECTRAL_GRADIENTS.length];
};

const parsePrice = (value) => parseFloat(String(value || '0').replace(/,/g, '')) || 0;

const getPrintedProjectPrice = (project = {}) => {
  const stock = Object.values(project?.stocks || {})
    .find((candidate) => !candidate?.order?.orderId && !candidate?.isReserved)
    || Object.values(project?.stocks || {})[0];
  return Number(stock?.sellPrice ?? project?.sellPrice ?? project?.price ?? 0) || 0;
};

const toProjectMillimeters = (value, unit = 'mm') => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  const normalizedUnit = String(unit || 'mm').trim().toLowerCase();
  if (normalizedUnit === 'cm') return numericValue * 10;
  if (normalizedUnit === 'in' || normalizedUnit === 'inch' || normalizedUnit === 'inches') return numericValue * 25.4;
  return numericValue;
};

const getProjectDetailDimensions = (detail = {}) => {
  const config = detail.config || {};
  const dimensions = detail.dimensions || {};
  const unit = detail.unit || config.unit || dimensions.unit || 'mm';
  const values = [
    detail.length ?? config.length ?? dimensions.length ?? dimensions.l ?? detail.baseMM_length,
    detail.width ?? config.width ?? dimensions.width ?? dimensions.w ?? detail.baseMM_width,
    detail.height ?? config.height ?? dimensions.height ?? dimensions.h ?? detail.baseMM_height
  ].map((value) => toProjectMillimeters(value, unit));

  return values.every((value) => value > 0) ? values : null;
};

const getStlDimensionsLabel = (item = {}) => {
  const unit = item.unit || item.config?.unit || 'mm';
  const length = item.length ?? item.config?.length ?? item.dimensions?.length ?? item.dimensions?.l ?? item.baseMM_length;
  const width = item.width ?? item.config?.width ?? item.dimensions?.width ?? item.dimensions?.w ?? item.baseMM_width;
  const height = item.height ?? item.config?.height ?? item.dimensions?.height ?? item.dimensions?.h ?? item.baseMM_height;
  const dimensions = [length, width, height].map((value) => Number(value) || 0);

  if (dimensions.every((value) => value <= 0)) return 'No Dimensions';
  return `${dimensions.map((value) => value.toLocaleString()).join(' x ')} ${unit}`;
};

const getProjectMaterialRecords = (detail = {}, filamentInventory = []) => {
  const source = Array.isArray(detail.materials) && detail.materials.length > 0
    ? detail.materials
    : Array.isArray(detail.normalizedMaterials) && detail.normalizedMaterials.length > 0
      ? detail.normalizedMaterials
      : Array.isArray(detail.materialSlots) && detail.materialSlots.length > 0
        ? detail.materialSlots
        : [detail.material, detail.normalizedMaterial].filter(Boolean);

  return source.map((entry) => {
    const nestedMaterial = entry?.material || entry?.normalizedMaterial;
    const materialId = String(
      entry?.materialId
        || nestedMaterial?.id
        || entry?.id
        || ''
    ).trim();
    const material = getProjectMaterial({
      ...detail,
      materialId,
      material: nestedMaterial || entry,
      normalizedMaterial: nestedMaterial || entry
    }, filamentInventory);

    return { material, materialId };
  }).filter(({ material, materialId }) => material && (materialId || material.type || material.name));
};

const getProjectRequiredMaterialSlots = (detail = {}, materialRecords = []) => {
  if (Array.isArray(detail.materialSlots) && detail.materialSlots.length > 0) return detail.materialSlots.length;
  if (Array.isArray(detail.materials) && detail.materials.length > 0) return detail.materials.length;
  if (Array.isArray(detail.normalizedMaterials) && detail.normalizedMaterials.length > 0) return detail.normalizedMaterials.length;

  const jobMaterialIds = (detail.productionJobs || []).flatMap((job) => job?.materialIds || []);
  if (jobMaterialIds.length > 0) return jobMaterialIds.length;
  return Math.max(1, materialRecords.length);
};

const isProjectPrinterOperational = (printer = {}) => {
  return isPrinterAvailableForScheduling(printer);
};

const printerFitsProjectDimensions = (printer, dimensions) => {
  if (!dimensions) return true;
  const capacity = normalizePrinterRecord(printer).buildCapacity;
  return dimensions.every((value, index) => value <= [capacity.x, capacity.y, capacity.z][index]);
};

const printerCanAccommodateProjectDetail = (
  printer,
  detail,
  feeders,
  filamentInventory,
  availabilityCheck = isProjectPrinterOperational
) => {
  if (!printer || !availabilityCheck(printer)) return false;

  const normalizedPrinter = normalizePrinterRecord(printer);
  if (!printerFitsProjectDimensions(printer, getProjectDetailDimensions(detail))) return false;

  const materialRecords = getProjectMaterialRecords(detail, filamentInventory);
  if (materialRecords.some(({ material }) => !isFilamentCompatibleWithPrinter(normalizedPrinter, material))) return false;

  const requiredSlots = getProjectRequiredMaterialSlots(detail, materialRecords);
  const compatibleFeeders = getPrinterFeeders(normalizedPrinter, feeders);
  if (requiredSlots > 1 && compatibleFeeders.length === 0) return false;

  const feederSlots = compatibleFeeders.reduce((total, feeder) => total + (Number(feeder.filamentSlots) || 0), 0);
  const availableSlots = Math.max(feederSlots || normalizedPrinter.filamentSlots || 1, 1);
  return availableSlots >= requiredSlots;
};

const getProjectPrinterCandidates = (printers, project, details = [], targetDetail = null) => {
  const availablePrinters = Array.isArray(printers) ? printers : [];
  const detailsToCheck = details.length > 0 ? details : [project];

  const targetOriginalPrinterIds = targetDetail
    ? [
      targetDetail?.originalPrinterId,
      ...(targetDetail?.productionJobs || []).map((job) => job?.originalPrinterId)
    ]
    : [];
  const projectOriginalPrinterIds = [project?.originalPrinterId];
  const allOriginalPrinterIds = detailsToCheck.flatMap((detail) => [
    detail?.originalPrinterId,
    ...(detail?.productionJobs || []).map((job) => job?.originalPrinterId)
  ]);
  const originalPrinterIds = [
    ...(targetDetail ? targetOriginalPrinterIds : allOriginalPrinterIds),
    ...(targetDetail && targetOriginalPrinterIds.some(Boolean) ? [] : projectOriginalPrinterIds)
  ].filter(Boolean).map(String);

  const allAssignedPrinterIds = [
    project?.printerId,
    ...detailsToCheck.flatMap((detail) => [
      detail?.printerId,
      ...(detail?.productionJobs || []).map((job) => job?.printerId)
    ])
  ].filter(Boolean).map(String);

  const preferredPrinterIds = targetDetail
    ? [
      targetDetail?.printerId,
      ...(targetDetail?.productionJobs || []).map((job) => job?.printerId),
      project?.printerId
    ].filter(Boolean).map(String)
    : allAssignedPrinterIds;

  const uniquePreferredIds = [...new Set(preferredPrinterIds)];
  const uniqueOtherAssignedIds = [...new Set(allAssignedPrinterIds)]
    .filter((id) => !uniquePreferredIds.includes(id));
  const assignedCandidates = [...uniquePreferredIds, ...uniqueOtherAssignedIds]
    .map((id) => availablePrinters.find((printer) => String(printer.id) === id))
    .filter(Boolean);
  const assignedCandidateIds = new Set(assignedCandidates.map((printer) => String(printer.id)));
  const fallbackCandidates = availablePrinters.filter(
    (printer) => !assignedCandidateIds.has(String(printer.id))
  );

  // If the original configured printer is available and operational, it takes top precedence!
  const originalCandidates = [...new Set(originalPrinterIds)]
    .map((id) => availablePrinters.find((printer) => String(printer.id) === id))
    .filter(Boolean);
  const operationalOriginals = originalCandidates.filter(isProjectPrinterOperational);

  const prioritizedCandidates = [
    ...operationalOriginals,
    ...assignedCandidates.filter((p) => !operationalOriginals.some((op) => String(op.id) === String(p.id))),
    ...fallbackCandidates.filter((p) => !operationalOriginals.some((op) => String(op.id) === String(p.id)))
  ];

  return {
    detailsToCheck,
    candidates: prioritizedCandidates
  };
};

const getBestProjectPrinter = (printers, project, details, feeders, filamentInventory) => {
  const { detailsToCheck } = getProjectPrinterCandidates(printers, project, details);
  const detailSelections = detailsToCheck.map((detail) => {
    const { candidates } = getProjectPrinterCandidates(printers, project, detailsToCheck, detail);
    const operationalPrinter = candidates.find((printer) => (
      printerCanAccommodateProjectDetail(printer, detail, feeders, filamentInventory)
    )) || null;
    const displayPrinter = operationalPrinter || candidates.find((printer) => (
      printerCanAccommodateProjectDetail(
        printer,
        detail,
        feeders,
        filamentInventory,
        isPrinterAvailableForCostEstimation
      )
    )) || null;
    return {
      candidates,
      // Keep the operational match separate so maintenance still blocks
      // production while remaining available for display and repricing.
      printer: operationalPrinter,
      displayPrinter
    };
  });

  return {
    detailsToCheck,
    printer: detailSelections[0]?.displayPrinter || detailSelections[0]?.candidates?.[0] || null,
    isCompatible: detailSelections.length > 0 && detailSelections.every((selection) => Boolean(selection.printer)),
    detailSelections
  };
};

// Capability/pricing checks accept available and maintenance printers. The
// queue still uses the maintenance status to delay the actual print slot.
const getBestCostProjectPrinter = (printers, project, details, feeders, filamentInventory) => {
  const { detailsToCheck } = getProjectPrinterCandidates(printers, project, details);
  const detailSelections = detailsToCheck.map((detail) => {
    const { candidates } = getProjectPrinterCandidates(printers, project, detailsToCheck, detail);
    const costCompatibleCandidates = candidates.filter((printer) => (
      printerCanAccommodateProjectDetail(
        printer,
        detail,
        feeders,
        filamentInventory,
        isPrinterAvailableForCostEstimation
      )
    ));
    // Prefer a printer that can schedule now for the displayed estimate. A
    // maintenance printer remains a valid capability fallback.
    const printer = costCompatibleCandidates.find(isProjectPrinterOperational)
      || costCompatibleCandidates[0]
      || null;
    return {
      candidates,
      printer
    };
  });

  return {
    detailsToCheck,
    printer: detailSelections[0]?.printer || null,
    isCompatible: detailSelections.length > 0 && detailSelections.every((selection) => Boolean(selection.printer)),
    detailSelections
  };
};

const getProjectPrinterLabel = (printer) => (
  printer
    ? [printer.brand || printer.manufacturer, printer.model || printer.name].filter(Boolean).join(' ')
    : ''
);

const ProjectDetailPrinterLines = ({ printerEvaluation, item = {}, project = {} }) => {
  if (project?.isPrintedProject || project?.productType === 'printed-project') return null;

  const configuredPrinters = printerEvaluation?.configuredPrinters?.length > 0
    ? printerEvaluation.configuredPrinters
    : [{
      printer: printerEvaluation?.configuredPrinter,
      name: printerEvaluation?.configuredLabel
        || item?.printerName
        || item?.originalPrinterName
        || project?.printerName
        || project?.originalPrinterName
    }];

  const getStatusClass = (printer) => {
    if (!printer) return 'text-red-500 line-through';
    const status = normalizePrinterStatus(printer?.status, printer);
    if (status === 'maintenance') return 'text-amber-600 line-through';
    if (status === 'unavailable') return 'text-red-500 line-through';
    return '';
  };

  return (
    <div className="mt-1 w-full min-w-0 max-w-full space-y-0.5 text-[14px] font-bold uppercase leading-tight">
      {configuredPrinters.filter((printer) => printer?.name).map((printer, index) => (
        <div key={`${printer.name}-${index}`} className={`truncate ${getStatusClass(printer.printer)}`}>
          {printer.name}
        </div>
      ))}
      {printerEvaluation?.replacementPrinter ? (
        <div className="truncate text-blue-600">
          {getProjectPrinterLabel(printerEvaluation.replacementPrinter)}
        </div>
      ) : printerEvaluation && !printerEvaluation.canPrint ? (
        <div className="text-red-500">
          NO COMPATIBLE PRINTER AVAILABLE
        </div>
      ) : null}
    </div>
  );
};

const getProjectMaterial = (item = {}, filamentInventory = []) => {
  const material = item.normalizedMaterial || item.material?.material || item.material || {};
  const materialId = material.id || item.materialId || item.material?.materialId;
  const inventoryMatch = (filamentInventory || []).find((filament) => (
    materialId && String(filament.id) === String(materialId)
  ));

  return { ...material, ...(inventoryMatch || {}) };
};

const getProjectMaterialColorName = (material = {}) => {
  const colorValue = [
    material.name,
    material.colorName,
    material.colorLabel,
    material.colourName,
    material.colour
  ].find((value) => value && !/^#?[0-9a-f]{6,8}$/i.test(String(value).trim()));

  return colorValue || '';
};

const getProjectMaterialLabel = (item, filamentInventory) => {
  const material = getProjectMaterial(item, filamentInventory);
  const label = [
    material.brand,
    material.type,
    getProjectMaterialColorName(material),
    'FILAMENT'
  ].filter(Boolean).join(' ').trim();

  return label || material.name || 'FILAMENT';
};

const getProjectMaterialEntries = (item = {}, filamentInventory = []) => {
  const source = Array.isArray(item.materials) && item.materials.length > 0
    ? item.materials
    : Array.isArray(item.normalizedMaterials) && item.normalizedMaterials.length > 0
      ? item.normalizedMaterials
      : Array.isArray(item.materialSlots) && item.materialSlots.length > 0
        ? item.materialSlots
      : [item.material || item.normalizedMaterial].filter(Boolean);

  return source.map((entry) => {
    const rawMaterial = entry?.material || entry?.normalizedMaterial || entry;
    if (!rawMaterial) return null;

    const material = getProjectMaterial({
      ...item,
      materialId: entry?.materialId || rawMaterial.id || item.materialId,
      material: rawMaterial,
      normalizedMaterial: rawMaterial
    }, filamentInventory);

    return {
      label: getProjectMaterialLabel({ ...item, material, normalizedMaterial: material }, filamentInventory),
      weight: entry?.shareWeight ?? entry?.weight ?? null
    };
  }).filter(Boolean);
};

const getProjectMaterialWeightLabel = (item = {}, filamentInventory = []) => {
  const materialEntries = getProjectMaterialEntries(item, filamentInventory);
  const entryWeights = materialEntries
    .map((entry) => entry.weight)
    .filter((weight) => weight !== null && weight !== undefined && Number(weight) > 0)
    .map((weight) => `${weight}g`);

  if (entryWeights.length > 0) return entryWeights.join(' • ');

  const totalWeight = Number(item.normalizedWeight ?? item.sliced?.weight ?? item.weight ?? 0) || 0;
  return totalWeight > 0 ? `${totalWeight}g` : '';
};

const getProjectDetailsTimeLabel = (item = {}) => {
  const minutes = Number(item.normalizedTime ?? item.sliced?.time ?? item.printTime ?? item.time ?? 0) || 0;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const getProjectDetailItemLabel = (project, methodLabel, item = {}, index = 0) => {
  const method = String(project?.method?.name || methodLabel || '').trim().toUpperCase();
  const itemNumber = item?.no
    ?? item?.buildPlateNo
    ?? item?.modelNo
    ?? (Number.isFinite(Number(item?.index)) ? Number(item.index) + 1 : index + 1);

  if (method === '3MF') return `Build Plate ${itemNumber}`;
  if (method === 'STL') return `Model ${itemNumber}`;
  return item?.itemName || `Item ${itemNumber}`;
};

const evaluateProjectPrintersAndPlates = (
  printers = [],
  project = {},
  details = [],
  feeders = [],
  filamentInventory = [],
  methodLabel = ''
) => {
  const detailsToCheck = details.length > 0 ? details : [project];

  // Evaluate each build plate / detail individually
  const plateEvaluations = detailsToCheck.map((item, index) => {
    const itemLabel = getProjectDetailItemLabel(project, methodLabel, item, index);
    const jobConfiguredIds = (item?.productionJobs || [])
      .map((job) => job?.originalPrinterId || job?.printerId)
      .filter(Boolean)
      .map(String);
    const configuredPrinterIds = (
      jobConfiguredIds.length > 0
        ? jobConfiguredIds
        : item?.originalPrinterId
          ? [item.originalPrinterId]
          : project?.originalPrinterId
            ? [project.originalPrinterId]
            : [item?.printerId, project?.printerId, getOriginalPrinterId(project, item)]
    ).filter(Boolean).map(String);
    const uniqueConfiguredPrinterIds = [...new Set(configuredPrinterIds)];
    const configuredPrinterRecords = uniqueConfiguredPrinterIds.map((printerId) => {
      const printer = (printers || []).find((candidate) => String(candidate.id) === printerId) || null;
      const matchingJob = (item?.productionJobs || []).find((job) => String(job?.originalPrinterId || job?.printerId || '') === printerId);
      return {
        printerId,
        printer,
        name: printer
          ? getProjectPrinterLabel(printer)
          : (matchingJob?.originalPrinterName || matchingJob?.printerName || item?.originalPrinterName || item?.printerName || project?.originalPrinterName || project?.printerName || 'No printer assigned')
      };
    });
    const configuredPrinterId = configuredPrinterRecords[0]?.printerId || null;
    const configuredPrinterName = configuredPrinterRecords.map((record) => record.name).filter(Boolean).join(', ')
      || item?.originalPrinterName
      || item?.printerName
      || project?.originalPrinterName
      || project?.printerName
      || '';

    const configuredPrinter = configuredPrinterId
      ? (printers || []).find((p) => String(p.id) === String(configuredPrinterId)) || null
      : null;

    const configuredLabel = configuredPrinter
      ? getProjectPrinterLabel(configuredPrinter)
      : (configuredPrinterName || 'No printer assigned');

    const configuredFits = configuredPrinterRecords.length > 0
      && configuredPrinterRecords.every((record) => (
        record.printer
        && isProjectPrinterOperational(record.printer)
        && printerCanAccommodateProjectDetail(
          record.printer,
          item,
          feeders,
          filamentInventory,
          isProjectPrinterOperational
        )
      ));

    // Get candidate list for this plate (ordered: operational original, assigned, fallback)
    const { candidates } = getProjectPrinterCandidates(printers, project, detailsToCheck, item);

    // Operational replacement printer if configured printer cannot print
    const replacementPrinter = !configuredFits
      ? candidates.find((p) => (
          String(p.id) !== String(configuredPrinterId)
          && printerCanAccommodateProjectDetail(
            p,
            item,
            feeders,
            filamentInventory,
            isProjectPrinterOperational
          )
        )) || null
      : null;

    const assignedPrinter = configuredFits ? configuredPrinter : replacementPrinter;
    const canPrint = Boolean(assignedPrinter);
    const isReplaced = canPrint && Boolean(replacementPrinter);

    let issueReason = '';
    if (!canPrint) {
      const normalizedStatus = configuredPrinter
        ? normalizePrinterStatus(configuredPrinter.status, configuredPrinter)
        : 'unavailable';

      if (normalizedStatus === 'maintenance') {
        issueReason = 'Printer in maintenance; no compatible replacement available';
      } else if (normalizedStatus === 'unavailable' || !configuredPrinter) {
        issueReason = 'Configured printer unavailable; no compatible replacement available';
      } else {
        issueReason = 'Plate exceeds printer build capacity or has incompatible materials; no replacement found';
      }
    }

    return {
      index,
      item,
      itemLabel,
      configuredPrinterId,
      configuredPrinterName,
      configuredPrinter,
      configuredLabel,
      configuredPrinters: configuredPrinterRecords,
      configuredFits,
      replacementPrinter,
      assignedPrinter,
      canPrint,
      isReplaced,
      issueReason
    };
  });

  // Group by configured printer to list all printers configured in saved project
  const configuredMap = new Map();
  plateEvaluations.forEach((evalItem) => {
    const configuredPrinters = evalItem.configuredPrinters?.length > 0
      ? evalItem.configuredPrinters
      : [{
        printerId: evalItem.configuredPrinterId,
        name: evalItem.configuredLabel,
        printer: evalItem.configuredPrinter
      }];

    configuredPrinters.forEach((configuredPrinter) => {
      const key = configuredPrinter.printerId
        ? String(configuredPrinter.printerId)
        : (configuredPrinter.name || 'unassigned');

      if (!configuredMap.has(key)) {
        configuredMap.set(key, {
          key,
          printerId: configuredPrinter.printerId,
          name: configuredPrinter.name,
          printer: configuredPrinter.printer,
          plates: []
        });
      }
      configuredMap.get(key).plates.push(evalItem);
    });
  });

  const configuredPrintersList = Array.from(configuredMap.values()).map((entry) => {
    const allPlatesCanPrint = entry.plates.every((p) => p.canPrint);
    const anyPlateReplaced = entry.plates.some((p) => p.isReplaced);
    const anyPlateUnprintable = entry.plates.some((p) => !p.canPrint);

    // Distinct replacement printers used across this configured printer's plates
    const replacementPrinters = [
      ...new Set(
        entry.plates
          .map((p) => p.replacementPrinter)
          .filter(Boolean)
          .map((p) => getProjectPrinterLabel(p))
      )
    ];

    const normalizedStatus = entry.printer
      ? normalizePrinterStatus(entry.printer.status, entry.printer)
      : 'unavailable';

    let statusBadge = 'AVAILABLE';
    let statusClass = 'text-emerald-600';

    if (anyPlateUnprintable) {
      statusBadge = normalizedStatus === 'maintenance' ? 'MAINTENANCE' : 'UNAVAILABLE';
      statusClass = normalizedStatus === 'maintenance' ? 'text-amber-500' : 'text-red-500';
    } else if (anyPlateReplaced) {
      statusBadge = 'REPLACED';
      statusClass = 'text-blue-500';
    } else if (normalizedStatus === 'maintenance') {
      statusBadge = 'MAINTENANCE';
      statusClass = 'text-amber-500';
    }

    return {
      ...entry,
      allPlatesCanPrint,
      anyPlateReplaced,
      anyPlateUnprintable,
      replacementPrinters,
      statusBadge,
      statusClass
    };
  });

  const allBuildPlatesCanBePrinted = plateEvaluations.length > 0 && plateEvaluations.every((p) => p.canPrint);
  const unprintablePlates = plateEvaluations.filter((p) => !p.canPrint);

  return {
    plateEvaluations,
    configuredPrintersList,
    allBuildPlatesCanBePrinted,
    unprintablePlates
  };
};

const getProjectImageUrl = (image, images = []) => {
  if (typeof image !== 'string') return image?.url || '';
  if (image.startsWith('data:') || image.startsWith('http') || image.startsWith('/')) return image;
  return images.find((candidate) => candidate?.id === image)?.url || image;
};

const normalizeProjectGallery = (project = {}) => {
  const projectImageReference = typeof project.image === 'string' ? project.image : '';
  const sourceImages = Array.isArray(project.images) ? project.images : [];
  const images = sourceImages
    .map((image, index) => ({
      ...(image && typeof image === 'object' ? image : {}),
      id: image?.id || `img-${index}`,
      url: getProjectImageUrl(image),
      type: image?.type || 'GALLERY IMAGE'
    }))
    .filter((image) => image.url);

  // Keep legacy projects working when their main image was stored separately
  // from the gallery, and support both URL and image-id grid references.
  const projectImageUrl = getProjectImageUrl(project.image, sourceImages);
  if (projectImageUrl && !images.some((image) => image.url === projectImageUrl)) {
    images.unshift({ id: 'main', url: projectImageUrl, type: 'PROJECT IMAGE' });
  }

  if (images.length === 0) return [{ id: 'empty', url: '', type: 'NO IMAGE' }];

  const explicitGridReference = project.gridImageId || project.gridImage || projectImageReference;
  const explicitGridIndex = images.findIndex((image) => (
    image.id === project.gridImageId
    || image.id === project.gridImage
    || image.id === projectImageReference
    || image.url === projectImageReference
  ));
  const markerGridIndex = images.findIndex((image) => image.isGridImage);
  const gridIndex = explicitGridReference && explicitGridIndex >= 0
    ? explicitGridIndex
    : markerGridIndex;
  const selectedGridIndex = gridIndex >= 0 ? gridIndex : 0;
  return images.map((image, index) => ({
    ...image,
    isGridImage: index === selectedGridIndex
  }));
};

const compressProjectGalleryImage = (dataUrl, maxWidth = 1200, maxHeight = 1200, quality = 0.72) => (
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      let width = image.width;
      let height = image.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  })
);

const GRADIENT_COLORS = {
  'from-rose-500 to-orange-500': 'rgba(244, 63, 94, 0.2)',
  'from-orange-500 to-amber-500': 'rgba(249, 115, 22, 0.2)',
  'from-emerald-500 to-teal-500': 'rgba(16, 185, 129, 0.2)',
  'from-cyan-500 to-blue-500': 'rgba(6, 182, 212, 0.2)',
  'from-indigo-500 to-purple-500': 'rgba(99, 102, 241, 0.2)',
  'from-fuchsia-500 to-pink-500': 'rgba(217, 70, 239, 0.2)',
  'from-blue-600 to-indigo-600': 'rgba(37, 99, 235, 0.2)',
  'from-violet-500 to-purple-500': 'rgba(139, 92, 246, 0.2)'
};

const getShadowColor = (gradientClass) => GRADIENT_COLORS[gradientClass] || 'rgba(8,102,255,0.2)';

const formatProjectEta = (value) => {
  if (!value) return '';
  const date = value?.toDate?.() || (value instanceof Date ? value : new Date(value));
  if (!Number.isNaN(date.getTime())) {
    return `ETA ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}`;
  }
  return `ETA ${String(value).replace(/^ETA\s*/i, '').toUpperCase()}`;
};

const GarageProjectSummary = ({
  project,
  title,
  methodLabel,
  details,
  filamentInventory,
  feeders,
  lowestPrice,
  printers,
  isDarkMode,
  titleEditor = null,
  printersAndPlates = null
}) => {
  const condition = project?.conditionDetails || project?.conditions || {};
  const boxCondition = project?.boxCondition || condition.box || project?.box;
  const kitCondition = project?.kitCondition || condition.kit || project?.kit;
  const eta = formatProjectEta(
    project?.collectionEta
      || project?.eta
      || project?.etaMonth
      || project?.deliveryMonth
      || project?.collectionDate
  );
  const isPrintedProjectItem = project?.isPrintedProject || project?.productType === 'printed-project';
  const rawGrade = project?.grade || methodLabel;
  const gradeLabel = isPrintedProjectItem ? '3D PRINTED' : rawGrade;
  const metadata = [
    project?.brand || project?.manufacturer,
    gradeLabel,
    project?.scale,
    project?.series || project?.line
  ].filter(Boolean);
  const hasConditions = boxCondition || kitCondition;
  const isSTLProject = String(project?.method?.name || methodLabel || '').toUpperCase() === 'STL';

  const resolvedPrintersAndPlates = printersAndPlates || evaluateProjectPrintersAndPlates(
    printers,
    project,
    details,
    feeders,
    filamentInventory,
    methodLabel
  );
  const { plateEvaluations } = resolvedPrintersAndPlates;

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-7">
      <div className="space-y-2">
        {titleEditor || (
          <h2 className="text-[24px] sm:text-[30px] font-black uppercase italic leading-[0.95] tracking-tight line-clamp-2 break-words">
            {title}
          </h2>
        )}
        {metadata.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] sm:text-[14px] font-black uppercase tracking-[0.18em]">
            {metadata.map((value, index) => (
              <React.Fragment key={`${value}-${index}`}>
                {index > 0 && <span className="text-blue-600">•</span>}
                <span>{value}</span>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-end gap-3">
        <div className="text-blue-600 text-[38px] sm:text-[44px] font-black italic tracking-tighter leading-none">
          ₱{lowestPrice.toLocaleString()}
        </div>
      </div>

      {hasConditions && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-[14px] font-black uppercase tracking-[0.14em]">
            <Box size={17} strokeWidth={2.5} /> Condition Details
          </h3>
          <div className="flex flex-wrap gap-2">
            {boxCondition && <span className="rounded-lg border-2 border-blue-500 px-2.5 py-1 text-[13px] font-black uppercase text-blue-600">Box: {boxCondition}</span>}
            {kitCondition && <span className="rounded-lg border-2 border-blue-500 px-2.5 py-1 text-[13px] font-black uppercase text-blue-600">Kit: {kitCondition}</span>}
          </div>
        </section>
      )}

      {eta && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-[14px] font-black uppercase tracking-[0.14em]">
            <CalendarDays size={17} strokeWidth={2.5} /> Collection
          </h3>
          <div className="inline-flex items-center gap-2 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-2 text-[14px] font-black uppercase text-red-500 dark:bg-red-500/10">
            <Zap size={16} strokeWidth={2.5} /> {eta}
          </div>
        </section>
      )}

      {details.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-4">
            <span className="text-[14px] font-black uppercase tracking-[0.35em] text-[var(--color-text-muted)]">Project Details</span>
            <div className="h-px flex-1 bg-[var(--color-border)]" />
          </div>
          <div className="grid grid-cols-1 gap-2">
            {details.map((item, index) => (
              <div key={`${item?.itemName || 'item'}-${index}`} className={`${isDarkMode ? 'bg-white/5' : 'bg-black/5'} rounded-2xl border border-[var(--color-border)] px-5 py-5 flex flex-col items-stretch gap-3`}>
                <div className="flex w-full min-w-0 items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-600 shrink-0">
                    {String(project?.method?.name || methodLabel || '').toUpperCase() === 'STL'
                      ? <Box size={18} strokeWidth={3} />
                      : <Layers size={18} strokeWidth={3} />}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-[14px] font-black uppercase italic leading-none truncate">{getProjectDetailItemLabel(project, methodLabel, item, index)}</div>
                    {(() => {
                      if (isPrintedProjectItem) {
                        const itemMat = item?.material || item?.materials?.[0] || project?.material || (project?.materials && project.materials[0]);
                        const materialEntries = getProjectMaterialEntries(item, filamentInventory);
                        const matText = itemMat && typeof itemMat === 'object'
                          ? getProjectMaterialLabel({ ...item, material: itemMat, normalizedMaterial: itemMat }, filamentInventory)
                          : materialEntries[0]?.label || getProjectMaterialLabel(item, filamentInventory);

                        return (
                          <div className="mt-1 flex w-full min-w-0 max-w-full items-center gap-2 text-[14px] font-bold uppercase text-[var(--color-text-muted)]">
                            <span className="block max-w-full truncate">{matText}</span>
                          </div>
                        );
                      }

                      const materialEntries = getProjectMaterialEntries(item, filamentInventory);
                      if (isSTLProject || materialEntries.length > 1) {
                        return (
                          <div className="mt-1 space-y-0.5 text-[14px] font-bold uppercase text-[var(--color-text-muted)]">
                            {materialEntries.map((entry, materialIndex) => (
                              <div key={`${entry.label}-${materialIndex}`} className="flex min-w-0 items-center gap-2">
                                <span className="block max-w-full truncate">{entry.label}</span>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return isSTLProject ? (
                        <div className="mt-1 text-[14px] font-bold uppercase text-[var(--color-text-muted)]">
                          <span className="block max-w-full truncate">{materialEntries[0]?.label || getProjectMaterialLabel(item, filamentInventory)}</span>
                        </div>
                      ) : (
                        <div className="mt-1 text-[14px] font-bold uppercase text-[var(--color-text-muted)]">
                          <span className="block max-w-full truncate">{materialEntries[0]?.label || getProjectMaterialLabel(item, filamentInventory)}</span>
                        </div>
                      );
                    })()}
                    <ProjectDetailPrinterLines
                      printerEvaluation={plateEvaluations?.[index]}
                      item={item}
                      project={project}
                    />
                  </div>
                </div>
                <div className="flex w-full shrink-0 items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
                <div className="min-w-0 text-left text-[13px] font-black uppercase leading-tight text-[var(--color-text-muted)] sm:text-[14px]">
                  {!isSTLProject && getProjectMaterialWeightLabel(item, filamentInventory) && (
                    <span>{getProjectMaterialWeightLabel(item, filamentInventory)}</span>
                  )}
                </div>
                {isPrintedProjectItem ? (() => {
                  const dim = item?.dimensions || (details.length === 1 ? project?.dimensions : null) || {};
                  const l = dim.l ?? dim.length ?? 0;
                  const w = dim.w ?? dim.width ?? 0;
                  const h = dim.h ?? dim.height ?? 0;
                  const unit = (dim.unit || 'MM').toUpperCase();
                  const hasDim = l > 0 || w > 0 || h > 0;
                  const dimText = hasDim ? `${l} × ${w} × ${h} ${unit}` : null;

                  return dimText ? (
                    <div className="text-right text-[13px] sm:text-[14px] font-black uppercase leading-tight text-blue-600">
                      {dimText}
                    </div>
                  ) : null;
                })() : isSTLProject ? (
                  <div className="text-right text-[13px] font-black uppercase leading-tight text-blue-600 sm:text-[14px]">
                    {getStlDimensionsLabel(item)}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-right text-[14px] font-black italic text-blue-600">
                    <Clock size={18} strokeWidth={3} />
                    {getProjectDetailsTimeLabel(item)}
                  </div>
                )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default function ProjectCard({ 
  project, 
  onClick, 
  onBasketAction, 
  onOrderNow,
  type = 'blueprint',
  fallbackTitle,
  showManagementActions = false,
  onModify,
  onDelete,
  homeZapAction,
  homePreview = false,
  isReadOnly = false,
  openOnMount = false,
  reopenRequestToken = null
}) {
  const { isDarkMode, isSpectralMode } = useTheme();
  const { shippingSettings, shelf, orders, printers, feeders, filamentInventory, isAdmin, isAdminView, updateBlueprint, updatePrintedProject, updateProjectInVault, huntKit, rates: storeRates } = useStore();
  const navigate = useNavigate();
  const projectId = project?.id || null;
  const projectPath = projectId ? `/prints/${encodeURIComponent(projectId)}` : '/prints';
  const spectralGradient = useMemo(() => getSpectralGradient(project?.id || project?.vaultId), [project?.id, project?.vaultId]);
  const shadowColor = useMemo(() => getShadowColor(spectralGradient), [spectralGradient]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [isCalendarMode, setIsCalendarMode] = useState(false);
  const [localGalleryImages, setLocalGalleryImages] = useState(null);
  const touchStartX = useRef(0);
  const lastManualActionTime = useRef(null);
  const thumbnailsContainerRef = useRef(null);
  const galleryFileInputRef = useRef(null);
  const projectNameInputRef = useRef(null);
  const fileLinkInputRef = useRef(null);
  const focusRequestIdRef = useRef(0);
  const hasAutoOpenedRef = useRef(false);
  const lastReopenRequestTokenRef = useRef(null);
  const modalHistoryOwnerRef = useRef(false);

  // Vault file link + license state (naka-sync sa project data)
  const isVault = type === 'vault';
  const isSTL = project?.method?.name?.toUpperCase() === 'STL';
  const is3MF = project?.method?.name?.toUpperCase() === '3MF';
  const details = useMemo(() => project.projectDetails || [], [project.projectDetails]);

  // Keep track of prev project values to sync local state during render
  const [prevProject, setPrevProject] = useState(project);
  const [prevProjectKey, setPrevProjectKey] = useState(project?.vaultId || project?.id || null);

  const [fileLink, setFileLink] = useState(project?.gdriveLink || '');
  const [licenseAcknowledged, setLicenseAcknowledged] = useState(project?.licenseAcknowledged || false);
  const [projectNameLocal, setProjectNameLocal] = useState(project?.projectName || '');
  const [isEditingName, setIsEditingName] = useState(false);
  const [selectedDesignService, setSelectedDesignService] = useState(project?.selectedDesignService || null);
  const [activeVaultPanel, setActiveVaultPanel] = useState('file');
  const [focusRequest, setFocusRequest] = useState(null);
  const [automaticPricingState, setAutomaticPricingState] = useState(null);
  const [isSubmittingPrintedOffer, setIsSubmittingPrintedOffer] = useState(false);
  const [printedOfferPrice, setPrintedOfferPrice] = useState('');
  const automaticPricing = automaticPricingState?.value || null;
  const automaticRepriceKeyRef = useRef('');
  const automaticRepricePersistedKeyRef = useRef('');

  const requestFieldFocus = (field) => {
    focusRequestIdRef.current += 1;
    setFocusRequest({ field, id: focusRequestIdRef.current });
  };

  // Sync props to state during render (prevents cascading renders via useEffect)
  if (project !== prevProject) {
    const projectKey = project?.vaultId || project?.id || null;
    const isDifferentProject = projectKey !== prevProjectKey;
    setPrevProject(project);
    setPrevProjectKey(projectKey);
    setFileLink(project?.gdriveLink || '');
    setLicenseAcknowledged(project?.licenseAcknowledged || false);
    setProjectNameLocal(project?.projectName || '');
    setSelectedDesignService(project?.selectedDesignService || null);
    setLocalGalleryImages(null);
    setIsCalendarMode(false);
    if (isDifferentProject) {
      setActiveVaultPanel('file');
    }
  }

  const handleProjectNameBlur = async () => {
    setIsEditingName(false);
    const trimmed = projectNameLocal.trim();
    if (isVault && project?.vaultId && trimmed !== (project?.projectName || '')) {
      try {
        await updateProjectInVault(project.vaultId, { projectName: trimmed });
      } catch (err) {
        console.error('SG LOG: Failed to update project name:', err);
      }
    } else if (
      type === 'blueprint'
      && isAdmin
      && isAdminView
      && showManagementActions
      && project?.id
      && trimmed !== (project?.projectName || '')
    ) {
      try {
        await updateBlueprint(project.id, { projectName: trimmed });
      } catch (err) {
        console.error('SG LOG: Failed to update garage project name:', err);
        setProjectNameLocal(project?.projectName || '');
      }
    }
  };

  // GDrive-only validation — tanggapin lang ang drive.google.com links
  const isValidGdriveLink = (url) => {
    if (!url || !url.trim()) return false;
    try {
      const parsed = new URL(url.trim());
      return parsed.hostname === 'drive.google.com' || parsed.hostname === 'docs.google.com';
    } catch { return false; }
  };
  const fileLinkHasValue = fileLink.trim().length > 0;
  const fileLinkIsValid = isValidGdriveLink(fileLink);

  const isUnnamedProjectName = (value, defaultTitle = '') => {
    const normalized = String(value || '').trim().toLowerCase();
    const normalizedDefaultTitle = String(defaultTitle || '').trim().toLowerCase();
    return !normalized
      || normalized === 'unnamed project'
      || (normalizedDefaultTitle && normalized === normalizedDefaultTitle)
      || /^project\s*#(?:\s*\d+)?$/.test(normalized);
  };
  const projectNameNeedsUpdate = isVault && isUnnamedProjectName(projectNameLocal, fallbackTitle);

  useEffect(() => {
    if (!isModalOpen || !focusRequest) return undefined;

    const timer = window.setTimeout(() => {
      const focusInput = () => {
        const input = focusRequest.field === 'projectName'
          ? projectNameInputRef.current
          : fileLinkInputRef.current;
        if (!input) return;
        input.focus({ preventScroll: true });
        input.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setFocusRequest(null);
      };

      // The panel may have just switched, so wait until its input is mounted.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(focusInput);
      });
    }, 50);

    return () => window.clearTimeout(timer);
  }, [activeVaultPanel, focusRequest, isEditingName, isModalOpen]);

  const handleFileLinkSave = async (newLink) => {
    setFileLink(newLink);
    // Reset license when link is cleared
    if (!newLink.trim()) {
      setLicenseAcknowledged(false);
      if (isVault && project?.vaultId) {
        try { await updateProjectInVault(project.vaultId, { gdriveLink: newLink, licenseAcknowledged: false }); } catch (e) { console.error('SG LOG: Failed to save file link:', e); }
      }
      return;
    }
    if (isVault && project?.vaultId) {
      try { await updateProjectInVault(project.vaultId, { gdriveLink: newLink }); } catch (e) { console.error('SG LOG: Failed to save file link:', e); }
    }
  };

  const handleLicenseToggle = async (checked) => {
    setLicenseAcknowledged(checked);
    if (isVault && project?.vaultId) {
      try { await updateProjectInVault(project.vaultId, { licenseAcknowledged: checked }); } catch (e) { console.error('SG LOG: Failed to save license state:', e); }
    }
  };

  const { handlingFee, installmentFee, transferFee } = useMemo(() => ({
    handlingFee: Number(shippingSettings?.paymentSettings?.handlingFee || 0),
    installmentFee: Number(shippingSettings?.paymentSettings?.installmentFee || 0),
    transferFee: Number(shippingSettings?.paymentSettings?.transferFee || 0)
  }), [shippingSettings]);

  const baseGalleryImages = useMemo(() => normalizeProjectGallery(project), [project]);
  const galleryImages = localGalleryImages || baseGalleryImages;
  const gridImageId = galleryImages.find((image) => image.isGridImage)?.id || '';

  useEffect(() => {
    if (isModalOpen) {
      lastManualActionTime.current = Date.now();
    }
  }, [isModalOpen]);

  useEffect(() => {
    if (!homePreview) return undefined;

    window.dispatchEvent(new CustomEvent('highlightModalStateChange', {
      detail: { open: isModalOpen }
    }));

    return () => {
      window.dispatchEvent(new CustomEvent('highlightModalStateChange', {
        detail: { open: false }
      }));
    };
  }, [homePreview, isModalOpen]);

  useEffect(() => {
    if (!openOnMount || isModalOpen || hasAutoOpenedRef.current) return;
    hasAutoOpenedRef.current = true;
    const timer = window.setTimeout(() => {
      setGalleryIndex(0);
      setIsModalOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isModalOpen, openOnMount]);

  useEffect(() => {
    if (reopenRequestToken == null || reopenRequestToken === lastReopenRequestTokenRef.current) return;
    lastReopenRequestTokenRef.current = reopenRequestToken;

    if (projectId && window.location.pathname !== projectPath) {
      window.history.pushState({ modal: 'project', projectId }, '', projectPath);
      modalHistoryOwnerRef.current = true;
    }

    const timer = window.setTimeout(() => {
      setGalleryIndex(0);
      if (!isVault) setIsCalendarMode(false);
      setIsModalOpen(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isVault, projectId, projectPath, reopenRequestToken]);

  useEffect(() => {
    if (!isModalOpen || galleryImages.length <= 1) return;
    const interval = setInterval(() => {
      if (lastManualActionTime.current && Date.now() - lastManualActionTime.current >= 5000) {
        setGalleryIndex(prev => (prev === galleryImages.length - 1 ? 0 : prev + 1));
      }
    }, 5000); 
    return () => clearInterval(interval);
  }, [isModalOpen, galleryImages.length]);

  const handleManualAction = () => {
    lastManualActionTime.current = Date.now();
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    if (Math.abs(diff) > 50) {
      handleManualAction();
      if (diff > 0) {
        setGalleryIndex(prev => prev === galleryImages.length - 1 ? 0 : prev + 1);
      } else {
        setGalleryIndex(prev => prev === 0 ? galleryImages.length - 1 : prev - 1);
      }
    }
  };

  const isPrintedProject = type === 'printed' || project?.isPrintedProject || project?.productType === 'printed-project';
  const isBlueprint = type === 'blueprint' || isPrintedProject;
  const canRenameBlueprint = isBlueprint && !isPrintedProject && isAdmin && isAdminView && showManagementActions;
  const isProductionEnabled = project?.canAddToBasket !== false;
  const printedProjectHasStock = !isPrintedProject || Object.values(project?.stocks || {}).some((stock) => (
    !stock?.isReserved && !stock?.order?.orderId
  ));
  
  const handleToggleProduction = async (e) => {
    e.stopPropagation();
    const newStatus = !isProductionEnabled;
    try {
      if (isPrintedProject) {
        await updatePrintedProject(project.id, { canAddToBasket: newStatus });
      } else if (isBlueprint) {
        await updateBlueprint(project.id, { canAddToBasket: newStatus });
      } else if (project.vaultId) {
        await updateProjectInVault(project.vaultId, { canAddToBasket: newStatus });
      }
    } catch (err) {
      console.error("SG LOG: Failed to update production status:", err);
    }
  };

  const displayImage = isBlueprint
    ? (baseGalleryImages.find((image) => image.isGridImage)?.url || getProjectImageUrl(project.image, project.images))
    : null;
  const printedProjectModelName = isPrintedProject
    ? getPrintedProjectModelName(project)
    : '';
  const displayProjectName = isPrintedProject
    ? (printedProjectModelName || project?.name || project?.projectName)
    : (isVault || canRenameBlueprint ? projectNameLocal : project.projectName);
  const displayProjectTitle = isUnnamedProjectName(displayProjectName)
    ? (fallbackTitle || 'PROJECT #')
    : displayProjectName;
  const projectTitle = displayProjectTitle;

  const projectNameEditor = canRenameBlueprint ? (
    <div
      className="text-left cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        setIsEditingName(true);
      }}
      title="Tap to rename garage project"
    >
      {isEditingName ? (
        <input
          type="text"
          ref={projectNameInputRef}
          value={projectNameLocal}
          onChange={(e) => setProjectNameLocal(e.target.value)}
          onBlur={handleProjectNameBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleProjectNameBlur();
          }}
          onClick={(e) => e.stopPropagation()}
          placeholder="Rename Garage Project"
          className="w-full border-b border-dashed border-blue-500 bg-transparent py-1 text-[24px] font-black uppercase italic leading-[0.95] tracking-tight text-[var(--color-text-main)] outline-none"
          autoFocus
        />
      ) : (
        <h2 className="text-[24px] sm:text-[30px] font-black uppercase italic leading-[0.95] tracking-tight line-clamp-2 break-words hover:text-blue-500 transition-colors">
          {displayProjectTitle}
        </h2>
      )}
      {isUnnamedProjectName(projectNameLocal) && (
        <p className="mt-2 text-[11px] font-black uppercase leading-tight text-amber-500">
          Tap the project name to make this visible publicly.
        </p>
      )}
    </div>
  ) : null;
  
  // Dynamic design services from Firestore rates — filter for active maps with status: true
  const availableDesignServices = useMemo(() => {
    const dsRates = storeRates?.['design-services'] || {};
    return Object.entries(dsRates)
      .filter(([, val]) => val && typeof val === 'object' && val.status === true)
      .map(([key, val]) => ({
        id: key,
        label: key.split('-').map(w => w.toUpperCase()).join(' '),
        basePrice: Number(val.basePrice) || 0
      }));
  }, [storeRates]);
  const hasDesignServices = !is3MF && availableDesignServices.length > 0;

  // A service can be disabled by an admin after a project selected it. Treat
  // that stale selection as no selection so the project returns to its file
  // link/unlinked state everywhere, including basket payloads and calendars.
  const effectiveSelectedDesignService = !is3MF
    && selectedDesignService
    && availableDesignServices.some((service) => service.id === selectedDesignService)
    ? selectedDesignService
    : null;
  const hasStaleSelectedDesignService = Boolean(
    isVault
    && project?.vaultId
    && selectedDesignService
    && !effectiveSelectedDesignService
  );

  useEffect(() => {
    if (!hasStaleSelectedDesignService) return;
    updateProjectInVault(project.vaultId, { selectedDesignService: null })
      .catch((error) => console.error('SG LOG: Failed to reset disabled design service:', error));
  }, [hasStaleSelectedDesignService, project?.vaultId, updateProjectInVault]);

  const showDesignServicesPanel = (e) => {
    e.stopPropagation();
    setActiveVaultPanel('services');
  };

  const showFileLinkPanel = (e) => {
    e.stopPropagation();
    setSelectedDesignService(null);
    if (isVault && project?.vaultId) {
      updateProjectInVault(project.vaultId, { selectedDesignService: null }).catch(err => console.error('SG LOG: Failed to clear design service:', err));
    }
    setActiveVaultPanel('file');
  };

  // Compute design service cost (basePrice only — complexity is set in order modal by admin)
  const serviceCost = useMemo(() => {
    if (is3MF || !effectiveSelectedDesignService) return 0;
    const service = availableDesignServices.find(s => s.id === effectiveSelectedDesignService);
    return service?.basePrice || 0;
  }, [is3MF, effectiveSelectedDesignService, availableDesignServices]);

  const { displayPrice, lowestPrice, downpayment } = useMemo(() => {
    const printedProjectPrice = isPrintedProject ? getPrintedProjectPrice(project) : 0;
    const storedGrandTotal = isPrintedProject
      ? printedProjectPrice
      : project?.totals?.total || project?.sellPrice || project?.price;
    const storedBasePrice = isPrintedProject ? printedProjectPrice : project?.totals?.basePrice;
    const storedDownpayment = project?.totals?.dp || project?.minDownpayment;
    const recalculatedGrandTotal = parsePrice(automaticPricing?.total);
    const recalculatedBasePrice = parsePrice(automaticPricing?.basePrice);
    const grandTotal = isPrintedProject
      ? printedProjectPrice
      : recalculatedGrandTotal > 0 ? recalculatedGrandTotal : parsePrice(storedGrandTotal);
    const estimatedBase = isPrintedProject
      ? printedProjectPrice
      : recalculatedBasePrice > 0 ? recalculatedBasePrice : parsePrice(storedBasePrice);
    const fallbackBase = Math.max(0, grandTotal - handlingFee - installmentFee - transferFee);
    const recalculatedDownpayment = parsePrice(automaticPricing?.dp);
    const baseDp = recalculatedDownpayment > 0 ? recalculatedDownpayment : parsePrice(storedDownpayment);

    return {
      displayPrice: grandTotal + serviceCost,
      lowestPrice: (estimatedBase > 0 ? estimatedBase : fallbackBase) + serviceCost,
      downpayment: baseDp + serviceCost
    };
  }, [automaticPricing, handlingFee, installmentFee, transferFee, serviceCost, project, isPrintedProject]);

  const isPrinted = type === 'printed' || project?.isPrintedProject || project?.productType === 'printed-project';
  const methodLabel = isPrinted ? '3D PRINTED' : (is3MF ? '3MF' : (isBlueprint ? (project.method?.name || 'Blueprint') : project.method?.name));
  const fileTypeLabel = isPrinted ? '3D PRINTED' : (is3MF ? '3MF' : isSTL ? 'STL' : (methodLabel || 'FILE').toUpperCase());
  const costLabel = isPrintedProject ? 'Sell price' : is3MF ? 'Project Cost' : isSTL ? 'Estimated Cost' : 'Project Cost';
  const showDisclaimer = !project.isFinalized && isSTL;

  const shelfItem = useMemo(() => (shelf || []).find(item => item.id === (project.id || project.vaultId)), [shelf, project.id, project.vaultId]);
  const isReserved = !!shelfItem;

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100vh';
    } else {
      document.body.style.overflow = '';
      document.body.style.height = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
    };
  }, [isModalOpen]);

  const closeProjectModal = useCallback(() => {
    if (window.location.pathname === projectPath) {
      if (window.history.state?.modal === 'project' && window.history.state?.projectId === projectId) {
        setIsModalOpen(false);
        modalHistoryOwnerRef.current = false;
        window.history.back();
      } else {
        setIsModalOpen(false);
        modalHistoryOwnerRef.current = false;
        navigate('/prints', { replace: true });
      }
      return;
    }
    setIsModalOpen(false);
    modalHistoryOwnerRef.current = false;
  }, [navigate, projectId, projectPath]);

  useEffect(() => {
    const handlePopState = () => {
      if (isModalOpen && window.location.pathname !== projectPath) {
        modalHistoryOwnerRef.current = false;
        setIsModalOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isModalOpen) {
        closeProjectModal();
      }
    };

    if (isModalOpen) {
      window.addEventListener('popstate', handlePopState);
      window.addEventListener('keydown', handleKeyDown);
    }
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeProjectModal, isModalOpen, projectPath]);

  const handleOpenModal = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (projectId && window.location.pathname !== projectPath) {
      window.history.pushState({ modal: 'project', projectId }, '', projectPath);
      modalHistoryOwnerRef.current = true;
    }
    setGalleryIndex(0);
    if (!isVault) setIsCalendarMode(false);
    setIsModalOpen(true);
  };

  const projectPrintersAndPlates = useMemo(() => evaluateProjectPrintersAndPlates(
    printers,
    project,
    details,
    feeders,
    filamentInventory,
    methodLabel
  ), [details, feeders, filamentInventory, methodLabel, printers, project]);

  const projectPrinterSelection = useMemo(() => getBestProjectPrinter(
      printers,
      project,
      details,
      feeders,
      filamentInventory
    ), [details, feeders, filamentInventory, printers, project]);

  const projectCostPrinterSelection = useMemo(() => getBestCostProjectPrinter(
    printers,
    project,
    details,
    feeders,
    filamentInventory
  ), [details, feeders, filamentInventory, printers, project]);

  // If any build plate cannot be printed due to printer availability
  // or replacement compatibility issue, the project cannot be ordered or added to basket.
  const printerCanProcessProject = isPrintedProject || (
    projectCostPrinterSelection.isCompatible
    && projectPrintersAndPlates.allBuildPlatesCanBePrinted
  );

  // If the assigned printer becomes unavailable, resolve another cost-capable
  // printer and recalculate from the existing project inputs. This intentionally
  // does not reopen or overwrite the calculator's source fields.
  const automaticRepriceData = useMemo(() => {
    const originalConfigurationFulfilled = projectPrintersAndPlates.plateEvaluations.length > 0
      && projectPrintersAndPlates.plateEvaluations.every((evaluation) => evaluation.configuredFits);

    // A valid original configuration is the source of truth. Repricing is
    // only a temporary fallback for a project that cannot currently be printed
    // as configured.
    if (originalConfigurationFulfilled) return null;
    if (!projectCostPrinterSelection.isCompatible || !projectCostPrinterSelection.printer) return null;

    const nextDetails = details.map((detail, index) => {
      const nextPrinter = projectCostPrinterSelection.detailSelections?.[index]?.printer;
      if (!nextPrinter) return detail;

      const printerName = getProjectPrinterLabel(nextPrinter);
      const detailOriginalId = detail.originalPrinterId
        || project?.originalPrinterId
        || detail.productionJobs?.[0]?.originalPrinterId
        || detail.printerId
        || detail.productionJobs?.[0]?.printerId
        || nextPrinter.id;
      const detailOriginalName = detail.originalPrinterName
        || project?.originalPrinterName
        || detail.productionJobs?.[0]?.originalPrinterName
        || detail.printerName
        || detail.productionJobs?.[0]?.printerName
        || getProjectPrinterLabel(nextPrinter);
      const nextJobs = Array.isArray(detail.productionJobs)
        ? detail.productionJobs.map((job) => {
          const jobOriginalId = job.originalPrinterId
            || detail.originalPrinterId
            || project?.originalPrinterId
            || job.printerId
            || nextPrinter.id;
          const jobOriginalName = job.originalPrinterName
            || detail.originalPrinterName
            || project?.originalPrinterName
            || job.printerName
            || printerName;
          return {
            ...job,
            printerId: nextPrinter.id,
            printerName,
            originalPrinterId: jobOriginalId,
            originalPrinterName: jobOriginalName,
            printer: nextPrinter
          };
        })
        : detail.productionJobs;

      return {
        ...detail,
        printerId: nextPrinter.id,
        printerName,
        originalPrinterId: detailOriginalId,
        originalPrinterName: detailOriginalName,
        printer: nextPrinter,
        ...(Array.isArray(detail.productionJobs) ? { productionJobs: nextJobs } : {})
      };
    });

    const currentProjectPrinterId = project?.printerId
      || details[0]?.printerId
      || details[0]?.productionJobs?.[0]?.printerId
      || '';
    const detailsChanged = nextDetails.some((detail, index) => {
      const currentDetail = details[index] || {};
      const currentPrinterId = currentDetail.printerId || currentDetail.productionJobs?.[0]?.printerId || '';
      return String(currentPrinterId) !== String(detail.printerId || '');
    });
    const projectPrinterChanged = String(currentProjectPrinterId) !== String(projectCostPrinterSelection.printer.id || '');

    if (!detailsChanged && !projectPrinterChanged) return null;

    const preservedOriginalPrinterId = project?.originalPrinterId || currentProjectPrinterId || projectCostPrinterSelection.printer.id;
    const preservedOriginalPrinterName = project?.originalPrinterName || project?.printerName || getProjectPrinterLabel(projectCostPrinterSelection.printer);
    const isTemporaryPrinter = String(projectCostPrinterSelection.printer.id) !== String(preservedOriginalPrinterId);

    return {
      ...project,
      printerId: projectCostPrinterSelection.printer.id,
      printerName: getProjectPrinterLabel(projectCostPrinterSelection.printer),
      originalPrinterId: preservedOriginalPrinterId,
      originalPrinterName: preservedOriginalPrinterName,
      isTemporaryPrinter,
      projectDetails: nextDetails
    };
  }, [details, project, projectCostPrinterSelection, projectPrintersAndPlates]);

  const automaticRepriceKey = useMemo(() => {
    if (!automaticRepriceData) return '';
    return JSON.stringify({
      project: automaticRepriceData.id || automaticRepriceData.vaultId || '',
      printer: automaticRepriceData.printerId || '',
      originalPrinter: automaticRepriceData.originalPrinterId || '',
      details: (automaticRepriceData.projectDetails || []).map((detail) => ({
        printerId: detail.printerId || '',
        jobs: (detail.productionJobs || []).map((job) => job.printerId || '')
      }))
    });
  }, [automaticRepriceData]);

  useEffect(() => {
    if (!automaticRepriceKey) {
      automaticRepriceKeyRef.current = '';
      automaticRepricePersistedKeyRef.current = '';
      return;
    }

    if (automaticRepriceKeyRef.current !== automaticRepriceKey) {
      automaticRepriceKeyRef.current = automaticRepriceKey;
      automaticRepricePersistedKeyRef.current = '';
    }
  }, [automaticRepriceKey]);

  const handleAutomaticReprice = useCallback((calculated) => {
    const calculatedTotal = parsePrice(calculated?.total);
    const calculatedBasePrice = parsePrice(calculated?.basePrice);
    if (
      !calculated
      || !automaticRepriceData
      || !automaticRepriceKey
      || automaticRepriceKeyRef.current !== automaticRepriceKey
      || automaticRepricePersistedKeyRef.current === automaticRepriceKey
      || calculatedTotal <= 0
      || calculatedBasePrice <= 0
      || !calculated.timeline
    ) return;

    automaticRepricePersistedKeyRef.current = automaticRepriceKey;
    setAutomaticPricingState({ key: automaticRepriceKey, value: calculated });

    const previousTotals = project?.totals || {};
    const nextTotals = {
      ...previousTotals,
      total: calculated.total ?? previousTotals.total,
      basePrice: calculated.basePrice ?? previousTotals.basePrice,
      dp: calculated.dp ?? previousTotals.dp,
      days: calculated.timeline?.days ?? previousTotals.days,
      timeline: calculated.timeline ?? previousTotals.timeline,
      capitalCost: calculated.capitalCost ?? previousTotals.capitalCost,
      capitalBreakdown: calculated.capitalBreakdown ?? previousTotals.capitalBreakdown,
      totalProfit: calculated.totalProfit ?? previousTotals.totalProfit,
      electricity: calculated.electricity ?? previousTotals.electricity,
      electricityKwh: calculated.electricityKwh ?? previousTotals.electricityKwh,
      electricityRate: calculated.electricityRate ?? previousTotals.electricityRate,
      electricityMarkupMultiplier: calculated.electricityMarkupMultiplier ?? previousTotals.electricityMarkupMultiplier,
      filament: calculated.filament ?? previousTotals.filament,
      labor: calculated.labor ?? previousTotals.labor,
      maintenance: calculated.maintenance ?? previousTotals.maintenance,
      extras: calculated.extras ?? previousTotals.extras
    };
    const patch = {
      printerId: automaticRepriceData.printerId,
      printerName: automaticRepriceData.printerName,
      originalPrinterId: automaticRepriceData.originalPrinterId,
      originalPrinterName: automaticRepriceData.originalPrinterName,
      isTemporaryPrinter: automaticRepriceData.isTemporaryPrinter,
      projectDetails: automaticRepriceData.projectDetails,
      totals: nextTotals,
      sellPrice: calculated.basePrice ?? project?.sellPrice,
      displayPrice: calculated.total ?? project?.displayPrice,
      minDownpayment: calculated.dp ?? project?.minDownpayment,
      updatedAt: new Date().toISOString()
    };

    const persist = isBlueprint && !isPrintedProject && project?.id
      ? updateBlueprint(project.id, patch)
      : isVault && project?.vaultId
        ? updateProjectInVault(project.vaultId, patch)
        : Promise.resolve();

    persist.catch((error) => {
      automaticRepricePersistedKeyRef.current = '';
      console.error('SG LOG: Failed to automatically reprice project for replacement printer:', error);
    });
  }, [automaticRepriceData, automaticRepriceKey, isBlueprint, isPrintedProject, isVault, project, updateBlueprint, updateProjectInVault]);

  const projectPrinter = projectPrinterSelection.printer;
  const materialStatus = useMemo(() => {
    const detailsToCheck = details.length > 0 ? details : [project];
    const materialEntries = detailsToCheck.flatMap((detail) => {
      if (Array.isArray(detail?.materials) && detail.materials.length > 0) return detail.materials;
      if (Array.isArray(detail?.normalizedMaterials) && detail.normalizedMaterials.length > 0) return detail.normalizedMaterials;
      if (Array.isArray(detail?.materialSlots) && detail.materialSlots.length > 0) return detail.materialSlots;
      return detail?.material || detail?.normalizedMaterial ? [detail.material || detail.normalizedMaterial] : [];
    });

    const available = materialEntries.length > 0 && materialEntries.every((entry) => {
      const material = getProjectMaterial(entry, filamentInventory);
      if (!material) return false;
      const status = String(material.status || '').trim().toLowerCase();
      const requiredWeight = Number(entry?.shareWeight ?? entry?.weight ?? 0);
      const remainingWeight = Number(material.remaining ?? material.weight ?? 0);
      return entry?.isUpfront !== true
        && material.isUpfront !== true
        && status !== 'upfront'
        && remainingWeight > 0
        && (requiredWeight <= 0 || remainingWeight >= requiredWeight);
    });
    return { available };
  }, [details, filamentInventory, project]);

  const nextPrintingDate = useMemo(() => {
    const schedule = shippingSettings?.availabilitySchedule;
    const unavailableDates = getUnavailableDateSet(schedule, 'printing');
    const unavailableWeekdays = getUnavailableWeekdaySet(schedule, 'printing');
    return findFirstAvailable(
      getOccupiedDates(orders, schedule),
      unavailableDates,
      unavailableWeekdays
    );
  }, [orders, shippingSettings?.availabilitySchedule]);

  const projectCanStartToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Boolean(nextPrintingDate && toDateKey(nextPrintingDate) === toDateKey(today));
  }, [nextPrintingDate]);

  const nextPrintingDateLabel = nextPrintingDate
    ? nextPrintingDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
    : '';

  const nextShippingDate = useMemo(() => (
    getNextAvailableDate(
      shippingSettings?.availabilitySchedule,
      'shipping',
      new Date()
    )
  ), [shippingSettings?.availabilitySchedule]);

  const canShipPrintedProjectToday = Boolean(
    nextShippingDate
    && toDateKey(nextShippingDate) === toDateKey(new Date())
  );
  const nextShippingDateLabel = nextShippingDate
    ? nextShippingDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
    : '';

  // Both project types require a capable printer that can fit the project,
  // accept its materials, and have enough filament capacity. A maintenance
  // printer remains capable; its downtime is handled by the queue. Garage Projects
  // additionally respect the admin production flag. Neither project type is
  // blocked by today's calendar slot; checkout/scheduling can assign the next
  // available production date. Personal projects still require a valid file
  // link or selected design service.
  const canUseProject = isPrintedProject
    ? isProductionEnabled && printedProjectHasStock
    : isBlueprint
    ? isProductionEnabled
      && printerCanProcessProject
      && materialStatus.available
    : printerCanProcessProject
      && materialStatus.available
      && (Boolean(effectiveSelectedDesignService) || fileLinkIsValid);
  const canAddToBasket = canUseProject;
  const printedProjectUnavailable = isPrintedProject && !canAddToBasket;
  const printedProjectStatusBadge = isPrintedProject
    ? !printedProjectHasStock
      ? 'OUT OF STOCK'
      : !isProductionEnabled
        ? 'NOT FOR SALE'
        : ''
    : '';
  const printerIssue = !printerCanProcessProject;
  const canModifyProject = isVault && !canUseProject;
  const productionStatusTitle = isPrintedProject && !printedProjectHasStock
    ? 'Out of stock'
    : isProductionEnabled
      ? (isBlueprint && !canUseProject
        ? printerIssue
        ? 'Production blocked: printer issue'
        : 'Production blocked: material or schedule unavailable'
      : 'Stop Production')
      : 'Allow Production';
  const availabilityStatusTitle = isPrintedProject
    ? (isProductionEnabled ? 'Stop Selling' : 'Allow Selling')
    : productionStatusTitle;

  // Gallery management is intentionally limited to published Garage Projects.
  // Personal user-project cards keep their existing calendar-only behavior.
  const canManageGallery = isAdmin && isAdminView && isBlueprint && !isPrintedProject;
  const showCalendarMode = isVault || (canManageGallery && isCalendarMode);
  const saveProjectGallery = async (nextImages, requestedGridImageId = '') => {
    const normalizedImages = nextImages
      .map((image, index) => ({
        ...(image && typeof image === 'object' ? image : {}),
        id: image?.id || `gallery-${Date.now()}-${index}`,
        url: getProjectImageUrl(image, nextImages),
        type: image?.type || 'GALLERY IMAGE'
      }))
      .filter((image) => image.url);
    if (normalizedImages.length === 0) throw new Error('At least one project photo is required.');

    const requestedGridIndex = normalizedImages.findIndex((image) => (
      image.id === requestedGridImageId
      || image.url === requestedGridImageId
      || image.isGridImage
    ));
    const selectedGridIndex = requestedGridIndex >= 0 ? requestedGridIndex : 0;
    const persistedImages = normalizedImages.map((image, index) => ({
      ...image,
      isGridImage: index === selectedGridIndex
    }));
    const selectedGridImage = persistedImages[selectedGridIndex];
    const payload = {
      // Keep image as a URL for existing public highlight consumers while the
      // marker/id makes the selection stable when the gallery is reordered.
      image: selectedGridImage.url,
      gridImageId: selectedGridImage.id,
      images: persistedImages,
      canAddToBasket: project?.canAddToBasket !== false
    };
    if (isBlueprint && project?.id) {
      await updateBlueprint(project.id, payload);
    }
    return persistedImages;
  };

  const saveProjectGridSelection = async (galleryImage) => {
    if (!isBlueprint || !project?.id || !galleryImage?.url) {
      throw new Error('Unable to identify this Garage Project photo.');
    }

    await updateBlueprint(project.id, {
      image: galleryImage.url,
      gridImageId: galleryImage.id
    });

    return galleryImages.map((image) => ({
      ...image,
      isGridImage: image.id === galleryImage.id
    }));
  };

  const handleGalleryFiles = async (event) => {
    if (!canManageGallery) return;
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    event.target.value = '';
    if (files.length === 0) return;

    try {
      const newImages = await Promise.all(files.map((file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => resolve({
          id: `gallery-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          url: await compressProjectGalleryImage(reader.result),
          type: 'GALLERY IMAGE'
        });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })));
      const existingImages = galleryImages.filter((image) => image.url);
      const nextImages = [...existingImages, ...newImages];
      const savedImages = await saveProjectGallery(nextImages, gridImageId);
      setLocalGalleryImages(normalizeProjectGallery({
        image: savedImages.find((image) => image.isGridImage)?.url || savedImages[0]?.url,
        gridImageId: savedImages.find((image) => image.isGridImage)?.id,
        images: savedImages
      }));
    } catch (error) {
      console.error('SG LOG: Failed to add project gallery photos:', error);
      alert(error?.message || 'Unable to add gallery photos.');
    }
  };

  const handleSetGridPhoto = async (galleryImage) => {
    if (!canManageGallery || !galleryImage?.url || galleryImage.id === gridImageId) return;

    try {
      const selectedImages = await saveProjectGridSelection(galleryImage);
      setLocalGalleryImages(selectedImages);
    } catch (error) {
      console.error('SG LOG: Failed to set project grid photo:', error);
      alert(error?.message || 'Unable to set grid photo.');
    }
  };

  const handleDeleteGalleryPhoto = async (galleryImage) => {
    if (!canManageGallery || galleryImages.length <= 1 || !galleryImage?.url) return;
    if (!window.confirm('Delete this project photo?')) return;

    const existingImages = galleryImages.filter((image) => image.url);
    const nextImages = existingImages.filter((image) => image.url !== galleryImage.url);
    if (nextImages.length === 0) return;

    try {
      const nextGridImageId = galleryImage.id === gridImageId ? nextImages[0]?.id : gridImageId;
      const savedImages = await saveProjectGallery(nextImages, nextGridImageId);
      const nextGallery = normalizeProjectGallery({
        image: savedImages.find((image) => image.isGridImage)?.url || savedImages[0]?.url,
        gridImageId: savedImages.find((image) => image.isGridImage)?.id,
        images: savedImages
      });
      setLocalGalleryImages(nextGallery);
      setGalleryIndex((currentIndex) => Math.min(currentIndex, Math.max(0, nextGallery.length - 1)));
    } catch (error) {
      console.error('SG LOG: Failed to delete project gallery photo:', error);
      alert(error?.message || 'Unable to delete gallery photo.');
    }
  };

  const openGalleryUpload = () => {
    if (!canManageGallery) return;
    galleryFileInputRef.current?.click();
  };

  // Gate vault checkout on a custom project name in addition to the file/license or design-service requirements.
  const vaultReadyForBasket = !isVault || (
    !projectNameNeedsUpdate
    && (fileLinkIsValid ? licenseAcknowledged : (!!effectiveSelectedDesignService && !is3MF))
  );
  const vaultReadyForOrder = !isVault || (
    !projectNameNeedsUpdate
    && fileLinkIsValid
    && licenseAcknowledged
  );
  const vaultReadyForCart = isVault
    && canAddToBasket
    && vaultReadyForBasket
    && projectPrintersAndPlates.allBuildPlatesCanBePrinted;

  const getActionProjectData = () => {
    const recomputedDetails = details.map((detail, index) => {
      const recomputedPrinter = projectPrinterSelection.detailSelections?.[index]?.printer;
      return recomputedPrinter
        ? { ...detail, printerId: recomputedPrinter.id }
        : detail;
    });
    const actionDetails = automaticRepriceData?.projectDetails || recomputedDetails;
    const actionTotal = automaticPricing?.total ?? displayPrice;
    const actionDownpayment = automaticPricing?.dp ?? downpayment;

    return {
      ...project,
      canAddToBasket,
      ...(details.length > 0 ? { projectDetails: actionDetails } : {}),
      ...((automaticRepriceData?.printerId || projectPrinter?.id) ? { printerId: automaticRepriceData?.printerId || projectPrinter.id } : {}),
      ...(isVault ? { gdriveLink: fileLink, licenseAcknowledged } : {}),
      selectedDesignService: effectiveSelectedDesignService,
      projectStatusIndicators: {
        printer: printerCanProcessProject,
        materials: materialStatus.available,
        schedule: projectCanStartToday,
        design: Boolean(effectiveSelectedDesignService) || fileLinkIsValid
      },
      totals: {
        ...project.totals,
        ...(automaticPricing ? {
          days: automaticPricing.timeline?.days ?? project?.totals?.days,
          timeline: automaticPricing.timeline ?? project?.totals?.timeline,
          capitalCost: automaticPricing.capitalCost ?? project?.totals?.capitalCost,
          capitalBreakdown: automaticPricing.capitalBreakdown ?? project?.totals?.capitalBreakdown,
          totalProfit: automaticPricing.totalProfit ?? project?.totals?.totalProfit,
          electricity: automaticPricing.electricity ?? project?.totals?.electricity,
          electricityKwh: automaticPricing.electricityKwh ?? project?.totals?.electricityKwh,
          electricityRate: automaticPricing.electricityRate ?? project?.totals?.electricityRate,
          electricityMarkupMultiplier: automaticPricing.electricityMarkupMultiplier ?? project?.totals?.electricityMarkupMultiplier,
          filament: automaticPricing.filament ?? project?.totals?.filament,
          labor: automaticPricing.labor ?? project?.totals?.labor,
          maintenance: automaticPricing.maintenance ?? project?.totals?.maintenance,
          extras: automaticPricing.extras ?? project?.totals?.extras
        } : {}),
        total: String(actionTotal),
        dp: String(actionDownpayment),
        ...(automaticPricing?.basePrice != null ? { basePrice: String(automaticPricing.basePrice) } : {})
      }
    };
  };

  const handleAddProjectToBasket = async (e, { closeModal = false } = {}) => {
    e.stopPropagation();
    if (!canAddToBasket || !vaultReadyForBasket || !onBasketAction || (!isPrintedProject && !projectPrintersAndPlates.allBuildPlatesCanBePrinted)) return;
    try {
      await onBasketAction(e, getActionProjectData());
    } catch {
      return;
    }
    if (closeModal) closeProjectModal();
  };

  const handleOrderProjectNow = (e) => {
    e.stopPropagation();
    if (!canAddToBasket || !vaultReadyForOrder || !onOrderNow || (!isPrintedProject && !projectPrintersAndPlates.allBuildPlatesCanBePrinted)) return;
    onOrderNow(getActionProjectData());
    closeProjectModal();
  };

  const handlePrintedProjectOffer = async (e) => {
    e.stopPropagation();
    if (!isPrintedProject || isAdminView || !huntKit || isSubmittingPrintedOffer) return;

    const targetPrice = Number(String(printedOfferPrice).replace(/,/g, '').trim());
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      window.alert('Enter your preferred price before sending the deal.');
      return;
    }

    setIsSubmittingPrintedOffer(true);
    try {
      await huntKit({
        ...project,
        id: project.id,
        name: displayProjectTitle,
        projectName: displayProjectTitle,
        productType: 'printed-project',
        isPrintedProject: true
      }, targetPrice);
    } catch (error) {
      console.error('SG LOG: Failed to submit printed project offer:', error);
      window.alert(error?.message || 'Unable to submit the offer right now.');
    } finally {
      setIsSubmittingPrintedOffer(false);
    }
  };

  const handleModifyProject = (e) => {
    e.stopPropagation();
    if (!onModify) return;
    onModify(getOriginalProjectConfiguration(project));
    closeProjectModal();
  };

  const handleVaultPrimaryAction = (e) => {
    e.stopPropagation();

    if (projectNameNeedsUpdate) {
      requestFieldFocus('projectName');
      setIsEditingName(true);
      return;
    }

    if (!fileLinkIsValid && !effectiveSelectedDesignService) {
      requestFieldFocus('fileLink');
      setActiveVaultPanel('file');
      return;
    }

    handleAddProjectToBasket(e, { closeModal: true });
  };

  const handleDeleteProject = (e) => {
    e.stopPropagation();
    if (!onDelete) return;
    onDelete(project);
    closeProjectModal();
  };

  const isAdminProjectView = isBlueprint && isAdmin && isAdminView && showManagementActions;
  const isPublicPrintedProjectPaused = isPrintedProject && !isAdminView && !isProductionEnabled;
  const isPublicVaultView = isVault && !(isAdmin && isAdminView);
  const printFulfillmentBanner = (
    <div className="flex items-center justify-center p-1.5">
      <span className="text-center text-[11px] font-black italic uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
        {isPrintedProject
          ? (canShipPrintedProjectToday ? 'SHIP IMMEDIATELY' : `SHIP BY ${nextShippingDateLabel}`)
          : (projectCanStartToday ? 'PRINT IMMEDIATELY' : `PRINT BY ${nextPrintingDateLabel}`)}
      </span>
    </div>
  );
  const vaultNeedsProjectName = isPublicVaultView && projectNameNeedsUpdate;
  const vaultNeedsFileLink = isPublicVaultView
    && !projectNameNeedsUpdate
    && !fileLinkIsValid
    && !effectiveSelectedDesignService;
  const vaultPrimaryActionLabel = vaultNeedsProjectName
    ? 'Rename Project'
    : vaultNeedsFileLink
      ? 'Enter Valid Link'
      : printerIssue
        ? 'Printer Issue'
        : 'Add to Cart';
  const vaultPrimaryActionDisabled = isPublicVaultView
    && !vaultNeedsProjectName
    && !vaultNeedsFileLink
    && (!canAddToBasket || !vaultReadyForBasket);

  return (
    <>
      {automaticRepriceData && (
        <div className="hidden" aria-hidden="true">
          <CostBreakdown
            data={automaticRepriceData}
            activePrinter={projectCostPrinterSelection.printer}
            dbSettings={{}}
            onCalculate={handleAutomaticReprice}
          />
        </div>
      )}
      <div
        onClick={handleOpenModal}
        className={homePreview
          ? 'story-card glass-card w-full aspect-[3/4] rounded-[1.5rem] p-1 shadow-xl transition-all duration-500 lg:hover:-translate-y-1 cursor-pointer overflow-hidden group'
          : `w-full group relative rounded-[2.2rem] p-[2px] ${isSpectralMode ? `bg-gradient-to-br ${spectralGradient}` : 'bg-black/5 dark:bg-white/5'} transition-all duration-500 lg:hover:-translate-y-1 cursor-pointer overflow-hidden`}
        style={{
          boxShadow: homePreview ? undefined : isDarkMode
            ? isSpectralMode
              ? `0 20px 25px -5px ${shadowColor}, 0 8px 10px -6px ${shadowColor}`
              : `0 20px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5)`
            : `0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)`
        }}
      >
        <div className={homePreview
          ? 'story-card-media relative h-full w-full overflow-hidden rounded-[1.3rem]'
          : `relative rounded-[2.1rem] flex flex-col h-full overflow-hidden ${isDarkMode ? 'bg-[var(--color-surface)]' : 'bg-white'}`
        }>
          {/* Status Badges Container */}
          {!homePreview && <div className="absolute top-4 left-0 z-50 flex flex-col items-start">
              {printedProjectStatusBadge && (
                  <div className={`px-1.5 py-0.5 font-bold uppercase tracking-tigther text-[13px] shadow-lg ${printedProjectStatusBadge === 'OUT OF STOCK' ? 'bg-gray-500 text-white border-gray-400' : 'bg-red-500 text-white border-red-400'}`}>
                      {printedProjectStatusBadge}
                  </div>
              )}
              {!isPrintedProject && isReserved && (
                  <div className={`px-1.5 py-0.5 font-bold uppercase tracking-tigther text-[13px] ${isAdminView ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'} shadow-lg`}>
                      {isAdminView ? 'Reserved' : 'NOT FOR SALE'}
                  </div>
              )}
          </div>}

          <div className={homePreview ? 'relative h-full w-full' : 'p-3 flex flex-col h-full'}>
            {/* IMAGE / ICON AREA */}
            <div className={homePreview
              ? 'relative h-full w-full overflow-hidden rounded-[1.3rem] bg-[var(--color-bg)]'
              : `relative aspect-square rounded-2xl overflow-hidden mb-3 shrink-0 text-left transform-gpu ${isVault && !displayImage ? 'block bg-blue-600/10 p-2 dark:bg-blue-600/20' : 'bg-[var(--color-bg)] flex items-center justify-center'}`
            }>
              {displayImage ? (
                <UniversalImage
                  src={displayImage} 
                  alt={projectTitle} 
                  className="w-full h-full object-cover lg:group-hover:scale-110 transition-transform duration-700"
                />
              ) : isVault ? (
                /* Vault project info boxes — 2×2 grid */
                <ProjectStatusGrid
                  printerAvailable={printerCanProcessProject}
                  materialsAvailable={materialStatus.available}
                  canStartToday={projectCanStartToday}
                  hasDesignService={Boolean(effectiveSelectedDesignService)}
                  fileLinkIsValid={fileLinkIsValid}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-blue-600/10 dark:bg-blue-600/20">
                  <img src="/snorlaxgarage.png" alt="Garage placeholder" className="w-1/2 h-1/2 object-contain opacity-45" />
                </div>
              )}

              {isPrintedProject && !homePreview && isAdmin && isAdminView && onModify && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onModify(project);
                  }}
                  className="absolute top-2 right-2 z-20 rounded-full border border-white/20 bg-gradient-to-br from-amber-500 to-amber-600 px-2 py-1 text-[12px] font-bold uppercase tracking-widest text-white shadow-lg transition-all hover:scale-110"
                  title="Edit printed project"
                >
                  EDIT
                </button>
              )}
              
              {showManagementActions && isAdmin && isAdminView && !isBlueprint && (
                <div className="absolute bottom-2 left-2 right-2 flex gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity z-10">
                  {onDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(project);
                      }}
                      className="h-8 w-8 rounded-full bg-red-600 text-white shadow-lg shadow-red-600/20 flex items-center justify-center active:scale-90 transition-all"
                      title="Delete project"
                    >
                      <Trash2 size={13} strokeWidth={3} />
                    </button>
                  )}
                  {onModify && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onModify(getOriginalProjectConfiguration(project));
                      }}
                      className="h-8 flex-1 rounded-full bg-black/70 text-white backdrop-blur-md border border-white/10 shadow-lg flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                      title="Modify project"
                    >
                      <Edit3 size={13} strokeWidth={3} />
                      <span className="text-[12px] font-bold uppercase tracking-tighter">Modify</span>
                    </button>
                  )}
                </div>
              )}

              {/* Top-right management action overlays are rendered below if admin */}
            </div>

            {/* CONTENT AREA */}
            <div className="px-1 text-center flex-1 flex flex-col">
              {!homePreview && <div className="h-[2em] flex items-center justify-center min-w-0">
                <h3 className="text-[15px] font-bold uppercase tracking-tighter leading-tight line-clamp-2 w-full group-hover:text-blue-600 transition-colors">
                  {projectTitle}
                </h3>
              </div>}
              
              {!homePreview && <div className="mt-auto">
                <div className="flex items-center justify-between gap-2 pb-1">
                  <div className="flex flex-col items-start">
                    <div className="text-[14px] font-bold uppercase tracking-tighter mb-1 select-none leading-none inline-block text-black dark:text-white">
                      {methodLabel}
                    </div>
                    <div className="flex flex-row items-baseline gap-1.5">
                        {printedProjectUnavailable ? (
                          <span className="text-[15px] font-bold italic tracking-tighter leading-none text-red-600">
                            LET&apos;S DEAL
                          </span>
                        ) : (
                          <span className="text-[15px] font-bold italic tracking-tighter text-blue-600 leading-none">
                            ₱{lowestPrice.toLocaleString()}
                          </span>
                        )}
                    </div>
                  </div>

                  {isAdmin && isAdminView ? (
                      <button 
                        onClick={handleToggleProduction} 
                        className={`w-8 h-8 rounded-full transition-all flex items-center justify-center active:scale-95 shadow-lg ${
                            isProductionEnabled
                            ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/40 text-white'
                            : 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/40 text-white'
                        }`}
                        title={availabilityStatusTitle}
                      >
                        {isProductionEnabled ? <Pause size={14} fill="white" /> : <Play size={14} fill="white" />}
                      </button>
                  ) : (
                    <button
                        onClick={async (e) => {
                        e.stopPropagation();
                        if (homePreview) {
                          handleOpenModal();
                          return;
                        }
                        if (typeof homeZapAction === 'function') {
                          homeZapAction(e, project);
                          return;
                        }
                        if (!canAddToBasket) {
                          if (canModifyProject) {
                            setGalleryIndex(0);
                            setIsModalOpen(true);
                          }
                          return;
                        }
                        // Vault projects: open modal first para mag-fill ng link + license
                        if (isVault && !vaultReadyForBasket) {
                          setGalleryIndex(0);
                          setIsModalOpen(true);
                          return;
                        }
                        await handleAddProjectToBasket(e);
                        }}
                        className={`w-8 h-8 rounded-full transition-all flex items-center justify-center active:scale-95 shadow-lg ${
                        typeof homeZapAction === 'function'
                            ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/40 text-white hover:scale-110'
                            :
                        !canAddToBasket && canModifyProject
                            ? 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/40 text-white hover:scale-110'
                            : !canAddToBasket
                            ? 'bg-neutral-200 dark:bg-white/10 text-neutral-400 shadow-none cursor-not-allowed'
                            : isVault && !vaultReadyForBasket
                            ? 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/40 text-white hover:scale-110'
                            : 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/40 text-white hover:scale-110'
                        }`}
                        title={typeof homeZapAction === 'function' ? 'Open project' : printerIssue
                          ? 'Printer issue'
                          : !canAddToBasket
                            ? (canModifyProject ? 'Modify project' : (isPrintedProject ? 'Out of stock' : 'Public view only'))
                            : isVault && !vaultReadyForBasket
                              ? (projectNameNeedsUpdate ? 'Custom project name required' : 'File link or 3D service required')
                              : 'Add to Cart'}
                    >
                        {typeof homeZapAction === 'function' ? (
                        <Zap size={15} strokeWidth={2.5} fill="currentColor" />
                        ) : isVault ? (
                        vaultReadyForCart
                          ? <Plus size={16} strokeWidth={3} />
                          : <PencilSparkles size={15} strokeWidth={2.5} />
                        ) : !canAddToBasket && canModifyProject ? (
                        <PencilSparkles size={15} strokeWidth={2.5} />
                        ) : !canAddToBasket ? (
                        <Lock size={13} strokeWidth={3} />
                        ) : (
                        <Plus size={16} strokeWidth={3} />
                        )}
                    </button>
                  )}
                </div>
              </div>}
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && createPortal((
                <div onClick={(event) => event.stopPropagation()} className="fixed inset-0 z-[200] flex items-center justify-center p-0 lg:p-12 bg-white/40 dark:bg-black/45 backdrop-blur-sm animate-in fade-in duration-200 overflow-hidden touch-action-none">
          <div className={`relative w-full h-full lg:h-[70vh] lg:max-w-7xl flex flex-col lg:rounded-[2.5rem] lg:border lg:shadow-2xl overflow-hidden overscroll-none ${isDarkMode ? 'bg-[var(--color-bg)] border-white/10 text-white' : 'bg-white border-black/5 text-neutral-900'}`}>
            {canManageGallery && (
              <input
                ref={galleryFileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleGalleryFiles}
              />
            )}
            <div className="h-full max-h-full flex flex-col portrait:flex-col landscape:sm:flex-row items-stretch overflow-hidden">
              <div className="sticky top-0 z-[220] w-full h-0 overflow-visible sm:hidden">
                <div className="absolute top-4 right-4 flex justify-end items-center">
                    <button onClick={closeProjectModal} className={`p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40`}><X size={20} /></button>
                </div>
              </div>
              <div className="hidden sm:block absolute top-4 right-4 z-[210]">
                <button onClick={closeProjectModal} className={`p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40`}><X size={20} /></button>
              </div>

              {/* Gallery or Calendar Column (Hidden in portrait) */}
              {showCalendarMode ? (
                <div className="relative hidden sm:landscape:flex sm:landscape:h-full sm:landscape:w-5/12 sm:landscape:flex-1 shrink-0 bg-neutral-100 dark:bg-neutral-900 border-b sm:landscape:border-b-0 sm:landscape:border-r border-black/5 dark:border-white/5 overflow-y-auto">
                  <GarageCalendar
                    project={{ ...project, selectedDesignService: effectiveSelectedDesignService }}
                    availabilitySchedule={shippingSettings?.availabilitySchedule}
                    scheduleType="printing"
                  />
                  {canManageGallery && (
                    <button
                      type="button"
                      onClick={() => setIsCalendarMode(false)}
                      className="absolute top-4 right-4 z-20 h-9 w-9 rounded-full bg-white/90 text-blue-600 shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                      title="Show project gallery"
                      aria-label="Show project gallery"
                    >
                      <ImagePlus size={16} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              ) : (
                <Gallery 
                    galleryImages={galleryImages} 
                    galleryIndex={galleryIndex} 
                    setGalleryIndex={setGalleryIndex} 
                    handleTouchStart={handleTouchStart} 
                    handleTouchEnd={handleTouchEnd} 
                    thumbnailsContainerRef={thumbnailsContainerRef}
                    isAdminGallery={canManageGallery}
                    gridImageId={gridImageId}
                    onAddPhoto={openGalleryUpload}
                    onDeletePhoto={handleDeleteGalleryPhoto}
                    onSetGridPhoto={handleSetGridPhoto}
                    onToggleCalendar={() => setIsCalendarMode(true)}
                    placeholderSrc={isBlueprint ? '/snorlaxgarage.png' : undefined}
                    className="hidden sm:landscape:flex sm:landscape:h-full"
                />
              )}

              <div className="w-full flex flex-col relative sm:landscape:w-7/12 h-full min-h-0 overflow-hidden">
                <div className="flex-1 min-h-0 overflow-y-auto space-y-8 text-left pb-[120px] sm:pb-32 md:pb-32 lg:pb-32">
                  {/* Portrait Gallery or Calendar */}
                  <div className="w-full overflow-hidden block sm:landscape:hidden">
                    {showCalendarMode ? (
                      <div className="relative w-full bg-neutral-100 dark:bg-neutral-900 border-b border-black/5 dark:border-white/5">
                        <GarageCalendar
                          project={{ ...project, selectedDesignService: effectiveSelectedDesignService }}
                          availabilitySchedule={shippingSettings?.availabilitySchedule}
                          scheduleType="printing"
                        />
                        {canManageGallery && (
                          <button
                            type="button"
                            onClick={() => setIsCalendarMode(false)}
                            className="absolute top-4 right-4 z-20 h-9 w-9 rounded-full bg-white/90 text-blue-600 shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                            title="Show project gallery"
                            aria-label="Show project gallery"
                          >
                            <ImagePlus size={16} strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <Gallery 
                          galleryImages={galleryImages} 
                          galleryIndex={galleryIndex} 
                          setGalleryIndex={setGalleryIndex} 
                          handleTouchStart={handleTouchStart} 
                          handleTouchEnd={handleTouchEnd} 
                          thumbnailsContainerRef={thumbnailsContainerRef}
                          isAdminGallery={canManageGallery}
                          gridImageId={gridImageId}
                          onAddPhoto={openGalleryUpload}
                          onDeletePhoto={handleDeleteGalleryPhoto}
                          onSetGridPhoto={handleSetGridPhoto}
                          onToggleCalendar={() => setIsCalendarMode(true)}
                          placeholderSrc={isBlueprint ? '/snorlaxgarage.png' : undefined}
                      />
                    )}
                  </div>

                  {isBlueprint ? (
                    <GarageProjectSummary
                      project={project}
                      title={displayProjectTitle}
                      methodLabel={methodLabel}
                      details={details}
                      filamentInventory={filamentInventory}
                      feeders={feeders}
                      lowestPrice={lowestPrice}
                      printers={printers}
                      isDarkMode={isDarkMode}
                      titleEditor={projectNameEditor}
                      printersAndPlates={projectPrintersAndPlates}
                    />
                  ) : (
                  <div className="p-6 sm:p-8 lg:p-10 space-y-8">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-4 w-full">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-11 h-11 rounded-full bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/25 flex items-center justify-center shrink-0">
                          <span className="text-[14px] font-black italic uppercase tracking-tighter leading-none">{fileTypeLabel}</span>
                        </div>
                        <div
                          className="text-left flex-1 min-w-0 cursor-pointer"
                          onClick={(e) => {
                            if (!isVault) return;
                            e.stopPropagation();
                            setIsEditingName(true);
                          }}
                          title={isVault ? 'Tap to update project name' : undefined}
                        >
                          {isVault ? (
                            isEditingName ? (
                              <input
                                type="text"
                                ref={projectNameInputRef}
                                value={projectNameLocal}
                                onChange={(e) => setProjectNameLocal(e.target.value)}
                                onBlur={handleProjectNameBlur}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleProjectNameBlur();
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="Rename Project"
                                className={`bg-transparent border-b border-dashed focus:outline-none text-[20px] font-black uppercase italic leading-none w-full py-1 text-[var(--color-text-main)] placeholder:opacity-20 transition-colors ${projectNameNeedsUpdate ? 'border-red-400 focus:border-red-500' : 'border-neutral-300 dark:border-white/20 focus:border-blue-500'}`}
                                autoFocus
                              />
                            ) : (
                              <h2 
                                className="text-[20px] font-black uppercase italic leading-tight line-clamp-2 break-words hover:text-blue-500 transition-colors"
                              >
                                {displayProjectTitle}
                              </h2>
                            )
                          ) : (
                            <h2 className="text-[20px] font-black uppercase italic leading-tight line-clamp-2 break-words">{displayProjectTitle}</h2>
                          )}
                          {isVault && projectNameNeedsUpdate && (
                            <p className="mt-2 text-[11px] font-black uppercase leading-tight text-red-500">
                              Rename this default project before checkout.
                            </p>
                          )}
                        </div>
                      </div>

                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white dark:bg-white/5 p-5 rounded-2xl border border-[var(--color-border)] shadow-sm">
                        <div className="flex items-center gap-2 mb-1">
                          {showDisclaimer && <AlertTriangle size={14} className="text-amber-500 shrink-0" strokeWidth={2.5} />}
                          <span className="text-[12px] font-black uppercase tracking-[0.2em] block">
                            {costLabel}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-baseline text-blue-600">
                            <span className="text-xl font-black">₱</span>
                            <span className="text-2xl italic font-black tracking-tighter">{lowestPrice.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="bg-white dark:bg-white/5 p-5 rounded-2xl border border-[var(--color-border)] shadow-sm">
                        <span className="text-[12px] font-black uppercase tracking-[0.2em] block mb-1">Downpayment</span>
                        <div className="flex items-baseline text-amber-600">
                          <span className="text-xl font-black">₱</span>
                          <span className="text-2xl font-black italic tracking-tighter">{downpayment.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Configuration Details */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 px-2">
                        <span className="text-[14px] font-black uppercase tracking-[0.4em] opacity-30">Project Details</span>
                        <div className="h-px flex-1 bg-[var(--color-border)]" />
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        {details.map((item, idx) => (
                          <div key={idx} className="bg-black/5 dark:bg-white/5 p-5 rounded-2xl border border-[var(--color-border)] flex flex-col items-stretch gap-3 group hover:border-blue-500/30 transition-colors">
                            <div className="flex w-full min-w-0 items-center gap-4">
                              <div className="w-12 h-12 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                                {String(project?.method?.name || methodLabel || '').toUpperCase() === 'STL'
                                  ? <Box size={18} strokeWidth={3} />
                                  : <Layers size={18} strokeWidth={3} />}
                              </div>
                              <div className="flex-1 min-w-0 text-left">
                                <h4 className="min-w-0 truncate text-[14px] font-black uppercase italic leading-none">{getProjectDetailItemLabel(project, methodLabel, item, idx)}</h4>
                                {(() => {
                                  const materialEntries = getProjectMaterialEntries(item, filamentInventory);
                                  if (isSTL || materialEntries.length > 1 || is3MF) {
                                    return (
                                      <div className="mt-1 space-y-0.5 text-[14px] font-bold uppercase leading-tight">
                                        {materialEntries.map((entry, materialIndex) => (
                                          <div key={`${entry.label}-${materialIndex}`} className="flex min-w-0 items-center gap-2">
                                            <span className="block max-w-full truncate">{entry.label}</span>
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  }
                                  return !isSTL ? (
                                    <div className="mt-1 text-[14px] font-bold uppercase leading-tight">
                                      <span className="block max-w-full truncate">{materialEntries[0]?.label || getProjectMaterialLabel(item, filamentInventory)}</span>
                                    </div>
                                  ) : null;
                                })()}
                                <ProjectDetailPrinterLines
                                  printerEvaluation={projectPrintersAndPlates.plateEvaluations?.[idx]}
                                  item={item}
                                  project={project}
                                />
                              </div>
                            </div>
                            <div className="flex w-full shrink-0 items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
                              <div className="min-w-0 text-left text-[14px] font-black uppercase leading-tight text-[var(--color-text-muted)]">
                                {!isSTL && getProjectMaterialWeightLabel(item, filamentInventory) && (
                                  <span>{getProjectMaterialWeightLabel(item, filamentInventory)}</span>
                                )}
                              </div>
                              <div className="text-right">
                              {isSTL ? (
                                <div className="max-w-[150px] text-[13px] font-black uppercase leading-tight text-blue-600 sm:max-w-none sm:text-[14px]">
                                  {getStlDimensionsLabel(item)}
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-[16px] font-black italic text-blue-600">
                                  <Clock size={18} strokeWidth={3} />
                                  {Math.floor((item.normalizedTime || item.sliced?.time || 0) / 60)}h {(item.normalizedTime || item.sliced?.time || 0) % 60}m
                                </div>
                              )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Links & Date */}
                    <div className="space-y-3">
                      {/* Vault: File Link Input + License Checkbox */}
                      {isVault && (!hasDesignServices || activeVaultPanel === 'file') && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-4 px-2">
                            <span className="text-[13px] font-black uppercase tracking-[0.4em]">File Link</span>
                            <div className="h-px min-w-0 flex-1 bg-[var(--color-border)]" />
                            {hasDesignServices && (
                              <>
                                <span className="text-[13px] font-black uppercase tracking-widest shrink-0">OR</span>
                                <button
                                  type="button"
                                  onClick={showDesignServicesPanel}
                                  className="h-8 px-3 rounded-full bg-purple-600/10 text-purple-600 hover:bg-purple-600 hover:text-white transition-all flex items-center gap-1.5 shrink-0"
                                  title="Show 3D designing services"
                                >
                                  <LuRotate3D size={13} strokeWidth={3} />
                                  <span className="text-[13px] font-black uppercase tracking-widest">3D Services</span>
                                </button>
                              </>
                            )}
                          </div>
                          <div className="bg-white dark:bg-white/5 p-4 rounded-2xl border border-[var(--color-border)] space-y-4">
                            <div className="space-y-2">
                              <label className="flex items-center gap-2 text-[13px] font-black uppercase tracking-widest">
                                <LiaGoogleDrive size={22} strokeWidth={1} className="text-blue-600 opacity-100" />
                                <span>Google Drive File Link</span>
                              </label>
                              <input
                                type="url"
                                ref={fileLinkInputRef}
                                value={fileLink}
                                onChange={(e) => setFileLink(e.target.value)}
                                onBlur={(e) => handleFileLinkSave(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="https://drive.google.com/..."
                                className={`w-full px-4 py-3 bg-[var(--color-bg)] border rounded-xl text-[14px] font-bold outline-none focus:ring-1 transition-all placeholder:opacity-90 ${
                                  fileLinkHasValue && !fileLinkIsValid
                                    ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                                    : fileLinkIsValid
                                    ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20'
                                    : 'border-[var(--color-border)] focus:border-blue-500 focus:ring-blue-500/20'
                                }`}
                              />
                              {fileLinkHasValue && !fileLinkIsValid ? (
                                <p className="text-[14px] font-bold text-red-500 leading-tight">
                                  Only valid Google Drive URL is accepted.
                                </p>
                              ) : (
                                <p className="text-[14px] font-bold leading-tight">
                                  Upload the STL/3MF file to your Google Drive, share and paste the link here.
                                </p>
                              )}
                            </div>

                            {fileLinkIsValid && (
                            <>
                            <div className="h-px bg-[var(--color-border)]" />
                            <label
                              className={`flex items-start gap-3 cursor-pointer group/license select-none rounded-xl p-3 -m-1 transition-colors ${
                                licenseAcknowledged ? 'bg-emerald-500/5' : 'hover:bg-black/5 dark:hover:bg-white/5'
                              }`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="relative shrink-0 mt-0.5">
                                <input
                                  type="checkbox"
                                  checked={licenseAcknowledged}
                                  onChange={(e) => handleLicenseToggle(e.target.checked)}
                                  className="sr-only"
                                />
                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                                  licenseAcknowledged
                                    ? 'bg-emerald-500 border-emerald-500 shadow-lg shadow-emerald-500/20'
                                    : 'border-neutral-300 dark:border-white/20 group-hover/license:border-blue-400'
                                }`}>
                                  {licenseAcknowledged && <ShieldCheck size={13} className="text-white" strokeWidth={3} />}
                                </div>
                              </div>
                              <div className="flex-1">
                                <p className={`text-[14px] font-bold leading-tight transition-colors ${
                                  licenseAcknowledged ? 'text-emerald-700 dark:text-emerald-400' : 'opacity-60'
                                }`}>
                                  I confirm that I have the right to use and print this 3D model. I accept full responsibility for any licensing or intellectual property concerns related to this file.
                                </p>
                              </div>
                            </label>
                            </>
                            )}
                          </div>

                        </div>
                      )}

                      {/* View Design Files (for non-vault or when link exists) */}
                      {!isVault && project.gdriveLink && (
                        <a href={project.gdriveLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all group">
                          <div className="flex items-center gap-3">
                            <Link2 size={16} strokeWidth={3} />
                            <span className="text-[18px] font-black uppercase tracking-widest">View Design Files</span>
                          </div>
                          <ExternalLink size={14} className="opacity-40 group-hover:opacity-100 transition-opacity" />
                        </a>
                      )}

                      {/* View link button for vault when link is a valid GDrive URL */}
                      {isVault && fileLinkIsValid && (!hasDesignServices || activeVaultPanel === 'file') && (
                        <a href={fileLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all group">
                          <div className="flex items-center gap-3">
                            <Link2 size={18} strokeWidth={3} />
                            <span className="text-[14px] font-black uppercase tracking-widest">View Design Files</span>
                          </div>
                          <ExternalLink size={14} className="opacity-40 group-hover:opacity-100 transition-opacity" />
                        </a>
                      )}
                      {/* 3D Designing Services — Dynamically loaded from Firestore */}
                      {hasDesignServices && (!isVault || activeVaultPanel === 'services') && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-4 px-2">
                            <span className="text-[13px] font-black uppercase tracking-[0.4em]">3D Designing Services</span>
                            <div className="h-px flex-1 bg-[var(--color-border)]" />
                            {isVault && (
                              <>
                                <span className="text-[13px] font-black uppercase tracking-widest shrink-0">OR</span>
                                <button
                                  type="button"
                                  onClick={showFileLinkPanel}
                                  className="h-8 px-3 rounded-full bg-blue-600/10 text-blue-600 hover:bg-blue-600 hover:text-white transition-all flex items-center gap-1.5 shrink-0"
                                  title="Show file link"
                                >
                                  <LiaGoogleDrive size={14} strokeWidth={1} />
                                  <span className="text-[13px] font-black uppercase tracking-widest">File Link</span>
                                </button>
                              </>
                            )}
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            {availableDesignServices.map((service) => {
                              const isSelected = effectiveSelectedDesignService === service.id;
                              return (
                                <button
                                  key={service.id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newVal = isSelected ? null : service.id;
                                    setSelectedDesignService(newVal);
                                    if (isVault && project?.vaultId) {
                                      updateProjectInVault(project.vaultId, { selectedDesignService: newVal }).catch(err => console.error('SG LOG: Failed to save design service:', err));
                                    }
                                  }}
                                  className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all group/ds ${
                                    isSelected
                                      ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/10'
                                      : 'border-[var(--color-border)] bg-white dark:bg-white/5 hover:border-purple-400/50'
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                                      isSelected ? 'bg-purple-500 text-white' : 'bg-purple-600/10 text-purple-600'
                                    }`}>
                                      <LuRotate3D size={22} strokeWidth={2.5} />
                                    </div>
                                    <div className="text-left gap-1">
                                      <h4 className="text-[14px] font-black uppercase leading-none">{service.label}</h4>
                                      <span className="text-[14px] font-bold opacity-40 block">Base Price: ₱{service.basePrice.toLocaleString()}</span>
                                    </div>
                                  </div>
                                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                    isSelected ? 'bg-purple-500 border-purple-500' : 'border-neutral-300 dark:border-white/20'
                                  }`}>
                                    {isSelected && <CheckCircle2 size={14} className="text-white" strokeWidth={3} />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  )}
                </div>

{/* Footer Actions */}
{!isReadOnly && (
  <div className={`absolute bottom-0 left-0 right-0 w-full p-2 border-t ${isDarkMode ? 'bg-[var(--color-surface-raised)] border-white/10' : 'bg-white/80 border-black/5'} backdrop-blur-md z-[110]`}>
    <div className={`flex flex-row items-center gap-2 ${isAdminProjectView || isPublicVaultView ? 'justify-end' : ''}`}>
      {isAdminProjectView ? (
        <>
          {onDelete && (
            <button
              type="button"
              onClick={handleDeleteProject}
              className="h-12 w-12 rounded-full bg-red-600 text-white shadow-lg shadow-red-600/20 flex items-center justify-center active:scale-95 transition-all"
              title="Delete project"
            >
              <Trash2 size={16} strokeWidth={3} />
            </button>
          )}
          {onModify && (
            <button
              type="button"
              onClick={handleModifyProject}
              className="h-12 flex-1 min-w-0 px-5 rounded-full bg-neutral-900 dark:bg-white/10 text-white font-black italic uppercase text-[11px] tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
              title="Edit project"
            >
              <Settings size={15} strokeWidth={3} />
              <span className="truncate">Edit Project</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleToggleProduction}
            className={`h-12 flex-1 min-w-0 px-5 rounded-full text-white font-black italic uppercase text-[11px] tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all ${
              isProductionEnabled
                ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/30'
                : 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/30'
            }`}
            title={productionStatusTitle}
          >
            {isProductionEnabled ? <Pause size={15} fill="white" /> : <Play size={15} fill="white" />}
            <span className="truncate">Production</span>
          </button>
        </>
      ) : isPublicPrintedProjectPaused ? (
        <div className="flex w-full flex-col gap-2">
          <div className="flex w-full flex-row items-center gap-2">
            <input
              type="number"
              min="1"
              step="1"
              inputMode="decimal"
              value={printedOfferPrice}
              onChange={(event) => setPrintedOfferPrice(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="ENTER PREFERRED PRICE"
              aria-label="Preferred offer price"
              className="h-12 w-1/2 min-w-0 rounded-full border border-red-500/40 bg-red-500/10 px-5 text-[11px] font-black italic uppercase tracking-widest text-white outline-none placeholder:text-white/50 focus:border-red-400 focus:ring-2 focus:ring-red-500/20"
            />
          <button
            type="button"
            onClick={handlePrintedProjectOffer}
            disabled={isSubmittingPrintedOffer}
            className={`h-12 w-1/2 min-w-0 rounded-full text-white font-black italic uppercase text-[11px] tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all ${
              isSubmittingPrintedOffer
                ? 'bg-neutral-400 cursor-wait opacity-70'
                : 'bg-gradient-to-br from-red-400 to-red-500 shadow-red-500/30'
            }`}
          >
            <Bell size={15} strokeWidth={3} />
            <span className="truncate">{isSubmittingPrintedOffer ? 'Sending Deal' : 'Send Deal'}</span>
          </button>
          </div>
        </div>
      ) : isPublicVaultView ? (
        <div className="flex w-full flex-col gap-2">
          {printFulfillmentBanner}
          <div className="flex w-full flex-row items-center gap-2">
            {onDelete && (
              <button
                type="button"
                onClick={handleDeleteProject}
                className="h-12 w-12 rounded-full bg-red-600 text-white shadow-lg shadow-red-600/20 flex items-center justify-center active:scale-95 transition-all"
                title="Delete project"
              >
                <Trash2 size={16} strokeWidth={3} />
              </button>
            )}
            {onModify && (
              <button
                type="button"
                onClick={handleModifyProject}
                className="h-12 flex-1 min-w-0 px-4 rounded-full bg-neutral-900 dark:bg-white/10 text-white font-black italic uppercase text-[11px] tracking-widest flex items-center justify-center shadow-lg active:scale-95 transition-all"
                title="Edit project"
              >
                <span className="truncate">Edit Project</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleVaultPrimaryAction}
              disabled={vaultPrimaryActionDisabled}
              className={`h-12 flex-1 min-w-0 px-4 rounded-full text-white font-black italic uppercase text-[11px] tracking-widest flex items-center justify-center shadow-lg active:scale-95 transition-all ${
                vaultPrimaryActionDisabled
                  ? 'bg-neutral-400 cursor-not-allowed opacity-50'
                  : 'bg-gradient-to-br from-blue-500 to-blue-600'
              }`}
            >
              <span className="truncate">{vaultPrimaryActionLabel}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-2">
          {printFulfillmentBanner}
          <div className="flex w-full flex-row gap-2">
            <div className="w-1/2">
              <button 
                onClick={(e) => handleAddProjectToBasket(e, { closeModal: true })}
                disabled={!canAddToBasket || !vaultReadyForBasket}
                className={`w-full h-12 rounded-full text-white font-black italic uppercase text-[11px] tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all ${
                  !canAddToBasket || !vaultReadyForBasket
                    ? 'bg-neutral-400 cursor-not-allowed opacity-50'
                    : 'bg-neutral-900 dark:bg-white/10'
                }`}
              >
                <ShoppingBasket size={14} strokeWidth={3} />
                <span className="truncate">{printerIssue ? 'Printer Issue' : 'Add to Cart'}</span>
              </button>
            </div>

            <div className="w-1/2">
              <button 
                onClick={handleOrderProjectNow}
                disabled={!canAddToBasket || !vaultReadyForOrder || !onOrderNow}
                className={`w-full h-12 rounded-full text-white font-black italic uppercase text-[11px] tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all ${
                  !canAddToBasket || !vaultReadyForOrder || !onOrderNow
                    ? 'bg-neutral-400 cursor-not-allowed opacity-50'
                    : 'bg-gradient-to-br from-blue-500 to-blue-600'
                }`}
              >
                <Zap size={14} strokeWidth={3} />
                <span className="truncate">{printerIssue ? 'Printer Issue' : (isPrintedProject ? 'Buy Now' : 'Order Now')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
)}
              </div>
            </div>
          </div>
        </div>
      ), document.body)}
    </>
  );
}
