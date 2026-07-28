import React, { useMemo, useState, useEffect, useRef } from 'react';
import { 
  Box, Clock, Sparkles, Zap, Plus, Lock, Edit3, Trash2, PackagePlus, PackageMinus,
  X, Weight, Droplet, Layers, AlertTriangle, Link2, ExternalLink, ChevronRight, ChevronLeft, Calendar,
  ShoppingBasket, Play, Pause, FileText, ShieldCheck, CheckCircle2, XCircle, Spool, Save, Paintbrush,
  Settings, Pencil
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTheme } from '../../context/ThemeContext';
import GarageCalendar from './GarageCalendar';

const Gallery = ({ galleryImages, galleryIndex, setGalleryIndex, handleTouchStart, handleTouchEnd, className, thumbnailsContainerRef }) => {
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
            {galleryImages[galleryIndex] && (
                <>
                    <img src={galleryImages[galleryIndex].url} alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-110" />
                    <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-4 lg:p-6">
                        <img 
                            src={galleryImages[galleryIndex].url} 
                            alt={galleryImages[galleryIndex].type} 
                            className="max-w-full max-h-full object-contain transition-opacity duration-300 mx-auto" 
                        />
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
                                className="flex-1 flex justify-start items-center gap-1.5 overflow-x-auto no-scrollbar mt-2 py-1 scroll-smooth px-2"
                            >
                                {galleryImages.map((img, idx) => (
                                    <button 
                                        key={img.id || idx}
                                        onClick={(e) => { e.stopPropagation(); setGalleryIndex(idx); }}
                                        className={`relative w-12 h-12 md:w-[70px] md:h-[70px] lg:w-[70px] lg:h-[70px] rounded-lg border-2 transition-all shrink-0 overflow-hidden group/thumb ${galleryIndex === idx ? 'border-amber-400 scale-105 shadow-lg z-10 opacity-100' : 'border-white/10 opacity-40 hover:opacity-100 hover:border-white/30'}`}
                                    >
                                        <img src={img.url} className="w-full h-full object-cover" alt="" />
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
                    <div className="absolute top-4 left-4 z-20 px-3 py-1 rounded-full bg-black/50 text-[9px] font-black uppercase text-white backdrop-blur-md tracking-widest">{galleryImages[galleryIndex].type} ({galleryIndex + 1}/{galleryImages.length})</div>
                </>
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

export default function ProjectCard({ 
  project, 
  onClick, 
  onBasketAction, 
  onOrderNow,
  type = 'blueprint',
  showManagementActions = false,
  onModify,
  onDelete,
  isReadOnly = false
}) {
  const { isDarkMode, isSpectralMode } = useTheme();
  const { shippingSettings, shelf, isAdmin, isAdminView, updateBlueprint, updateProjectInVault, rates: storeRates } = useStore();
  const spectralGradient = useMemo(() => getSpectralGradient(project?.id || project?.vaultId), [project?.id, project?.vaultId]);
  const shadowColor = useMemo(() => getShadowColor(spectralGradient), [spectralGradient]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const touchStartX = useRef(0);
  const lastManualActionTime = useRef(null);
  const thumbnailsContainerRef = useRef(null);

  // Vault file link + license state (naka-sync sa project data)
  const isVault = type === 'vault';
  const isSTL = project?.method?.name?.toUpperCase() === 'STL';
  const is3MF = project?.method?.name?.toUpperCase() === '3MF';

  // Keep track of prev project values to sync local state during render
  const [prevProject, setPrevProject] = useState(project);

  const [fileLink, setFileLink] = useState(project?.gdriveLink || '');
  const [licenseAcknowledged, setLicenseAcknowledged] = useState(project?.licenseAcknowledged || false);
  const [projectNameLocal, setProjectNameLocal] = useState(project?.projectName || '');
  const [isEditingName, setIsEditingName] = useState(false);
  const [selectedDesignService, setSelectedDesignService] = useState(project?.selectedDesignService || null);

  // Sync props to state during render (prevents cascading renders via useEffect)
  if (project !== prevProject) {
    setPrevProject(project);
    setFileLink(project?.gdriveLink || '');
    setLicenseAcknowledged(project?.licenseAcknowledged || false);
    setProjectNameLocal(project?.projectName || '');
    setSelectedDesignService(project?.selectedDesignService || null);
  }

  const handleProjectNameBlur = async () => {
    setIsEditingName(false);
    const trimmed = projectNameLocal.trim();
    if (isVault && project?.vaultId && trimmed !== (project?.projectName || '')) {
      try {
        await updateProjectInVault(project.vaultId, { projectName: trimmed || 'Unnamed Project' });
      } catch (err) {
        console.error('SG LOG: Failed to update project name:', err);
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

  // Gate basket for vault: if valid GDrive link exists, always require license acknowledgment; if no valid link, allow if design service is selected (and not 3MF)
  const vaultReadyForBasket = !isVault || (fileLinkIsValid ? licenseAcknowledged : (!!selectedDesignService && !is3MF));
  const vaultReadyForOrder = !isVault || (fileLinkIsValid && licenseAcknowledged);

  const { handlingFee, installmentFee, transferFee } = useMemo(() => ({
    handlingFee: Number(shippingSettings?.paymentSettings?.handlingFee || 0),
    installmentFee: Number(shippingSettings?.paymentSettings?.installmentFee || 0),
    transferFee: Number(shippingSettings?.paymentSettings?.transferFee || 0)
  }), [shippingSettings]);

  const galleryImages = useMemo(() => {
    const images = [];
    if (project.image) images.push({ id: 'main', url: project.image, type: 'PROJECT IMAGE' });
    if (project.images && Array.isArray(project.images)) {
      project.images.forEach((img, idx) => {
        const url = typeof img === 'string' ? img : img.url;
        if (url && url !== project.image) {
          images.push({ 
            id: img.id || `img-${idx}`, 
            url: url,
            type: img.type || 'GALLERY IMAGE' 
          });
        }
      });
    }
    if (images.length === 0) images.push({ id: 'empty', url: '', type: 'NO IMAGE' });
    return images;
  }, [project.image, project.images]);

  useEffect(() => {
    if (isModalOpen) {
      lastManualActionTime.current = Date.now();
    }
  }, [isModalOpen]);

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

  const isBlueprint = type === 'blueprint';
  const canAddToBasket = project?.canAddToBasket !== false;
  
  const handleToggleProduction = async (e) => {
    e.stopPropagation();
    const newStatus = !canAddToBasket;
    try {
      if (isBlueprint) {
        await updateBlueprint(project.id, { canAddToBasket: newStatus });
      } else if (project.vaultId) {
        await updateProjectInVault(project.vaultId, { canAddToBasket: newStatus });
      }
    } catch (err) {
      console.error("SG LOG: Failed to update production status:", err);
    }
  };

  const displayImage = isBlueprint ? project.image : null;
  const projectTitle = isVault ? projectNameLocal : project.projectName;
  
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

  // Compute design service cost (basePrice only — complexity is set in order modal by admin)
  const serviceCost = useMemo(() => {
    if (is3MF || !selectedDesignService) return 0;
    const service = availableDesignServices.find(s => s.id === selectedDesignService);
    return service?.basePrice || 0;
  }, [is3MF, selectedDesignService, availableDesignServices]);

  const { displayPrice, lowestPrice, downpayment } = useMemo(() => {
    const grandTotal = parsePrice(project?.totals?.total || project?.sellPrice || project?.price);
    const estimatedBase = parsePrice(project?.totals?.basePrice);
    const fallbackBase = Math.max(0, grandTotal - handlingFee - installmentFee - transferFee);
    const baseDp = parsePrice(project?.totals?.dp || project?.minDownpayment);

    return {
      displayPrice: grandTotal + serviceCost,
      lowestPrice: (estimatedBase > 0 ? estimatedBase : fallbackBase) + serviceCost,
      downpayment: baseDp + serviceCost
    };
  }, [handlingFee, installmentFee, transferFee, serviceCost, project]);
  
  const methodLabel = isBlueprint ? (project.method?.name || 'Blueprint') : project.method?.name;
  const showDisclaimer = !project.isFinalized && isSTL;
  const isVerifiedPrice = is3MF || project.isFinalized;

  const days = project.totals?.days || 0;

  const plateCount = (project.projectDetails || []).length;

  const spoolCount = useMemo(() => {
    const mats = new Set();

    (project.projectDetails || []).forEach(item => {
      const name =
        item.normalizedMaterial?.name ||
        item.material?.material?.name;

      if (name) mats.add(name);
    });

    return mats.size;
  }, [project.projectDetails]);

  const itemLabel = is3MF
    ? plateCount === 1
      ? 'Plate'
      : 'Plates'
    : isSTL
      ? plateCount === 1
        ? 'Model'
        : 'Parts'
      : plateCount === 1
        ? 'Item'
        : 'Items';

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

  useEffect(() => {
    const handlePopState = () => {
      if (isModalOpen) {
        setIsModalOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
        window.history.back();
      }
    };

    if (isModalOpen) {
      window.history.pushState({ modal: 'project' }, '');
      window.addEventListener('popstate', handlePopState);
      window.addEventListener('keydown', handleKeyDown);
    }
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen]);

  const handleOpenModal = () => {
    if (onClick) {
      onClick();
      return;
    }
    setGalleryIndex(0);
    setIsModalOpen(true);
  };

  const details = project.projectDetails || [];

  const getActionProjectData = () => ({
    ...project,
    ...(isVault ? { gdriveLink: fileLink, licenseAcknowledged } : {}),
    selectedDesignService,
    totals: {
      ...project.totals,
      total: String(displayPrice),
      dp: String(downpayment)
    }
  });

  const handleAddProjectToBasket = async (e, { closeModal = false } = {}) => {
    e.stopPropagation();
    if (!canAddToBasket || !vaultReadyForBasket || !onBasketAction) return;
    try {
      await onBasketAction(e, getActionProjectData());
    } catch {
      return;
    }
    if (closeModal) setIsModalOpen(false);
  };

  const handleOrderProjectNow = (e) => {
    e.stopPropagation();
    if (!canAddToBasket || !vaultReadyForOrder || !onOrderNow) return;
    onOrderNow(getActionProjectData());
    setIsModalOpen(false);
  };

  const handleModifyProject = (e) => {
    e.stopPropagation();
    if (!onModify) return;
    onModify(getActionProjectData());
    setIsModalOpen(false);
  };

  const handleDeleteProject = (e) => {
    e.stopPropagation();
    if (!onDelete) return;
    onDelete(project);
    setIsModalOpen(false);
  };

  const isAdminBlueprintView = isBlueprint && isAdmin && isAdminView && showManagementActions;
  const isPublicVaultView = isVault && !(isAdmin && isAdminView);

  return (
    <>
      <div 
        onClick={handleOpenModal} 
        className={`w-full group relative rounded-[2.2rem] p-[2px] ${isSpectralMode ? `bg-gradient-to-br ${spectralGradient}` : 'bg-black/5 dark:bg-white/5'} transition-all duration-500 lg:hover:-translate-y-1 cursor-pointer overflow-hidden`}
        style={{
          boxShadow: isDarkMode 
            ? isSpectralMode
              ? `0 20px 25px -5px ${shadowColor}, 0 8px 10px -6px ${shadowColor}`
              : `0 20px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5)`
            : `0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)`
        }}
      >
        <div className={`relative rounded-[2.1rem] flex flex-col h-full overflow-hidden ${
            isDarkMode ? 'bg-[var(--color-surface)]' : 'bg-white'
          }`}>
          {/* Status Badges Container */}
          <div className="absolute top-4 left-0 z-50 flex flex-col items-start px-2">
              {isReserved && (
                  <div className={`px-1.5 py-0.5 font-black uppercase tracking-tigther text-[10px] md:text-[11px] ${isAdminView ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'} shadow-lg`}>
                      {isAdminView ? 'Reserved' : 'NOT FOR SALE'}
                  </div>
              )}
          </div>

          <div className="p-3 flex flex-col h-full">
            {/* IMAGE / ICON AREA */}
            <div className={`relative aspect-square rounded-2xl overflow-hidden mb-3 shrink-0 text-left transform-gpu ${
              isVault && !displayImage ? 'block bg-transparent' : 'bg-[var(--color-bg)] flex items-center justify-center'
            }`}>
              {displayImage ? (
                <img 
                  src={displayImage} 
                  alt={projectTitle} 
                  className="w-full h-full object-cover lg:group-hover:scale-110 transition-transform duration-700" 
                />
              ) : isVault ? (
                /* Vault project info boxes — 2×2 grid */
                <div className="w-full h-full grid grid-cols-2 gap-2 bg-transparent">
                    {/* Box 1: Production Days */}
                    <div className={`rounded-xl flex flex-col items-center justify-center gap-1 ${isDarkMode ? 'bg-white/5' : 'bg-black/[0.03]'}`}>
                      <Clock size={20} className="text-blue-500" strokeWidth={2.5} />
                      <span className="text-[13px] font-black italic text-blue-600 dark:text-blue-400 leading-none">{days || '—'}</span>
                      <span className="text-[9px] font-black uppercase tracking-widest leading-none">{days === 1 ? 'Day' : 'Days'}</span>
                    </div>
                    {/* Box 2: Spools */}
                    <div className={`rounded-xl flex flex-col items-center justify-center gap-1 ${isDarkMode ? 'bg-white/5' : 'bg-black/[0.03]'}`}>
                      <Spool size={20} className="text-amber-500" strokeWidth={2.5} />
                      <span className="text-[13px] font-black italic text-amber-600 dark:text-amber-400 leading-none">
                        {spoolCount || '—'}
                      </span>

                      <span className="text-[9px] font-black uppercase tracking-widest leading-none">
                        {spoolCount === 1 ? 'Spool' : 'Spools'}
                      </span>
                    </div>
                    {/* Box 3: Build Plates / Models / Parts */}
                    <div className={`rounded-xl flex flex-col items-center justify-center gap-1 ${isDarkMode ? 'bg-white/5' : 'bg-black/[0.03]'}`}>
                      <Layers size={20} className="text-emerald-500" strokeWidth={2.5} />
                      <span className="text-[13px] font-black italic text-emerald-600 dark:text-emerald-400 leading-none">
                        {plateCount || '—'}
                      </span>

                      <span className="text-[9px] font-black uppercase tracking-widest leading-none text-center">
                        {itemLabel}
                      </span>
                    </div>
                    {/* Box 4: GDrive Link Status */}
                    <div className={`rounded-xl flex flex-col items-center justify-center gap-1 ${isDarkMode ? 'bg-white/5' : 'bg-black/[0.03]'}`}>
                      {fileLinkIsValid ? (
                        <CheckCircle2 size={20} className="text-emerald-500" strokeWidth={2.5} />
                      ) : fileLinkHasValue ? (
                        <XCircle size={16} className="text-red-500" strokeWidth={2.5} />
                      ) : (
                        <Link2 size={16} strokeWidth={2.5} />
                      )}
                      <span className={`text-[9px] font-black uppercase tracking-widest leading-none ${
                        fileLinkIsValid ? 'text-emerald-500' : fileLinkHasValue ? 'text-red-500' : 'opacity-30'
                      }`}>
                        {fileLinkIsValid ? 'Linked' : fileLinkHasValue ? 'Invalid' : 'No Link'}
                      </span>
                    </div>
                  </div>
              ) : (
                <Box size={40} className="opacity-10 text-[var(--color-text-main)]" strokeWidth={1} />
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
                        onModify(project);
                      }}
                      className="h-8 flex-1 rounded-full bg-black/70 text-white backdrop-blur-md border border-white/10 shadow-lg flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                      title="Modify project"
                    >
                      <Edit3 size={13} strokeWidth={3} />
                      <span className="text-[8px] font-black uppercase tracking-widest">Modify</span>
                    </button>
                  )}
                </div>
              )}

              {/* Top-right management action overlays are rendered below if admin */}
            </div>

            {/* CONTENT AREA */}
            <div className="px-1 text-center flex-1 flex flex-col">
              <h3 className="text-[12px] font-bold uppercase tracking-tighter leading-tight mb-1 line-clamp-2 h-[2.5em] group-hover:text-blue-600 transition-colors">
                {projectTitle}
              </h3>
              
              <div className="mt-auto">
                <div className="flex items-center justify-between gap-2 pb-1">
                  <div className="flex flex-col items-start">
                    <div className={`px-1.5 py-0.5 rounded-md text-[12px] font-black uppercase tracking-widest border mb-1 select-none leading-none inline-block ${
                      isBlueprint 
                        ? 'bg-emerald-600/15 text-emerald-500 border-emerald-600/25' 
                        : 'bg-blue-600/15 text-blue-500 border-blue-600/25'
                    }`}>
                      {methodLabel}
                    </div>
                    <div className="flex flex-row items-baseline gap-1.5">
                        <span className="text-[13px] font-black italic tracking-tighter text-blue-600 leading-none">
                          ₱{lowestPrice.toLocaleString()}
                        </span>
                        {lowestPrice !== (project.projectData?.displayPrice || displayPrice) && (
                          <span className="text-[12px] font-black opacity-30 italic tracking-tighter leading-none line-through">
                            ₱{(project.projectData?.displayPrice || displayPrice).toLocaleString()}
                          </span>
                        )}
                    </div>
                  </div>

                  {isAdmin && isAdminView ? (
                      <button 
                        onClick={handleToggleProduction} 
                        className={`w-8 h-8 rounded-full transition-all flex items-center justify-center active:scale-95 shadow-lg ${
                            canAddToBasket 
                            ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/40 text-white'
                            : 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/40 text-white'
                        }`}
                        title={canAddToBasket ? 'Stop Production' : 'Allow Production'}
                      >
                        {canAddToBasket ? <Pause size={14} fill="white" /> : <Play size={14} fill="white" />}
                      </button>
                  ) : (
                    <button
                        onClick={async (e) => {
                        e.stopPropagation();
                        if (!canAddToBasket) return;
                        // Vault projects: open modal first para mag-fill ng link + license
                        if (isVault && !vaultReadyForBasket) {
                          setGalleryIndex(0);
                          setIsModalOpen(true);
                          return;
                        }
                        await handleAddProjectToBasket(e);
                        }}
                        className={`w-8 h-8 rounded-full transition-all flex items-center justify-center active:scale-95 shadow-lg ${
                        !canAddToBasket
                            ? 'bg-neutral-200 dark:bg-white/10 text-neutral-400 shadow-none cursor-not-allowed'
                            : isVault && !vaultReadyForBasket
                            ? 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/40 text-white hover:scale-110'
                            : 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/40 text-white hover:scale-110'
                        }`}
                        title={!canAddToBasket ? 'Public view only' : isVault && !vaultReadyForBasket ? 'File link required' : 'Add to Basket'}
                    >
                        {!canAddToBasket ? (
                        <Lock size={13} strokeWidth={3} />
                        ) : isVault && !vaultReadyForBasket ? (
                        <FileText size={13} strokeWidth={3} />
                        ) : (
                        <Plus size={16} strokeWidth={3} />
                        )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 lg:p-12 bg-white dark:bg-[#0a0a0a] lg:bg-white/30 lg:dark:bg-black/30 backdrop-blur-md lg:backdrop-blur-sm animate-in fade-in duration-200 overflow-hidden touch-action-none">
          <div className={`relative w-full h-full lg:h-[70vh] lg:max-w-7xl flex flex-col lg:rounded-[2.5rem] lg:border lg:shadow-2xl overflow-hidden overscroll-none ${isDarkMode ? 'bg-[var(--color-bg)] border-white/10 text-white' : 'bg-white border-black/5 text-neutral-900'}`}>
            <div className="h-full max-h-full flex flex-col portrait:flex-col landscape:sm:flex-row items-stretch overflow-hidden">
              <div className="sticky top-0 z-[220] w-full h-0 overflow-visible sm:hidden">
                <div className="absolute top-4 right-4 flex justify-end items-center">
                    <button onClick={() => setIsModalOpen(false)} className={`p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40`}><X size={20} /></button>
                </div>
              </div>
              <div className="hidden sm:block absolute top-4 right-4 z-[210]">
                <button onClick={() => setIsModalOpen(false)} className={`p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40`}><X size={20} /></button>
              </div>

              {/* Gallery or Calendar Column (Hidden in portrait) */}
              {isVault ? (
                <div className="hidden sm:landscape:flex sm:landscape:h-full sm:landscape:w-5/12 sm:landscape:flex-1 shrink-0 bg-neutral-100 dark:bg-neutral-900 border-b sm:landscape:border-b-0 sm:landscape:border-r border-black/5 dark:border-white/5 overflow-y-auto">
                  <GarageCalendar project={{ ...project, selectedDesignService }} />
                </div>
              ) : (
                <Gallery 
                    galleryImages={galleryImages} 
                    galleryIndex={galleryIndex} 
                    setGalleryIndex={setGalleryIndex} 
                    handleTouchStart={handleTouchStart} 
                    handleTouchEnd={handleTouchEnd} 
                    thumbnailsContainerRef={thumbnailsContainerRef}
                    className="hidden sm:landscape:flex sm:landscape:h-full"
                />
              )}

              <div className="w-full flex flex-col relative sm:landscape:w-7/12 h-full min-h-0 overflow-hidden">
                <div className="flex-1 min-h-0 overflow-y-auto space-y-8 text-left pb-[120px] sm:pb-32 md:pb-32 lg:pb-32">
                  {/* Portrait Gallery or Calendar */}
                  <div className="w-full overflow-hidden block sm:landscape:hidden">
                    {isVault ? (
                      <div className="w-full bg-neutral-100 dark:bg-neutral-900 border-b border-black/5 dark:border-white/5">
                        <GarageCalendar project={{ ...project, selectedDesignService }} />
                      </div>
                    ) : (
                      <Gallery 
                          galleryImages={galleryImages} 
                          galleryIndex={galleryIndex} 
                          setGalleryIndex={setGalleryIndex} 
                          handleTouchStart={handleTouchStart} 
                          handleTouchEnd={handleTouchEnd} 
                          thumbnailsContainerRef={thumbnailsContainerRef}
                      />
                    )}
                  </div>

                  <div className="p-6 sm:p-8 lg:p-10 space-y-8">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-4 w-full">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="h-10 w-10 rounded-xl border border-black/5 bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.04] text-blue-600 flex items-center justify-center shrink-0">
                          <Box size={18} strokeWidth={2.4} />
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          {isVault ? (
                            isEditingName ? (
                              <input
                                type="text"
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
                                className="bg-transparent border-b border-dashed border-neutral-300 dark:border-white/20 focus:border-blue-500 focus:outline-none text-[13px] font-black uppercase italic leading-none w-full py-1 text-[var(--color-text-main)] placeholder:opacity-20 transition-colors"
                                autoFocus
                              />
                            ) : (
                              <h2 
                                className="text-[13px] font-black uppercase italic leading-none truncate cursor-pointer hover:text-blue-500 transition-colors"
                                onClick={(e) => { e.stopPropagation(); setIsEditingName(true); }}
                              >
                                {projectNameLocal || 'Unnamed Project'}
                              </h2>
                            )
                          ) : (
                            <h2 className="text-xl sm:text-4xl font-black uppercase italic leading-none">{project.projectName || 'Unnamed Project'}</h2>
                          )}
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 mt-2 block">
                            {project.method?.name} Estimation
                          </span>
                        </div>
                      </div>

                      {isVault && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isEditingName) {
                              handleProjectNameBlur();
                            } else {
                              setIsEditingName(true);
                            }
                          }}
                          onMouseDown={(e) => {
                            if (isEditingName) {
                              e.preventDefault();
                            }
                          }}
                          className="h-9 w-9 rounded-full bg-transparent hover:bg-black/5 dark:hover:bg-white/10 text-blue-600 transition-all shrink-0 flex items-center justify-center active:scale-95"
                          title={isEditingName ? 'Save Name' : 'Edit Name'}
                        >
                          {isEditingName ? (
                            <Save size={16} strokeWidth={2.5} />
                          ) : (
                            <Pencil size={16} strokeWidth={2.5} />
                          )}
                        </button>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white dark:bg-white/5 p-5 rounded-2xl border border-[var(--color-border)] shadow-sm">
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-30 block mb-1">
                          {lowestPrice === (project.projectData?.displayPrice || displayPrice) ? 'Grand Total' : 'Estimated Base'}
                        </span>
                        <div className="flex flex-col">
                          <div className="flex items-baseline gap-1 text-blue-600">
                            <span className="text-xs font-black opacity-30">₱</span>
                            <span className="text-2xl font-black italic tracking-tighter">{lowestPrice.toLocaleString()}</span>
                          </div>
                          {lowestPrice !== (project.projectData?.displayPrice || displayPrice) && (
                            <div className="flex items-baseline gap-1 opacity-30 mt-[-4px]">
                              <span className="text-[10px] font-black">₱</span>
                              <span className="text-sm font-black italic tracking-tighter line-through">{(project.projectData?.displayPrice || displayPrice).toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="bg-white dark:bg-white/5 p-5 rounded-2xl border border-[var(--color-border)] shadow-sm">
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-30 block mb-1">Downpayment</span>
                        <div className="flex items-baseline gap-1 text-amber-600">
                          <span className="text-xs font-black opacity-30">₱</span>
                          <span className="text-2xl font-black italic tracking-tighter">{downpayment.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {isVerifiedPrice ? (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl flex gap-3">
                        <Sparkles size={18} className="text-emerald-500 shrink-0" />
                        <div className="text-left">
                          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1 leading-none">Verified Pricing</p>
                          <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-500 leading-tight">
                            This project has been finalized. Pricing is accurate and ready for checkout.
                          </p>
                        </div>
                      </div>
                    ) : showDisclaimer && (
                      <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex gap-3">
                        <AlertTriangle size={18} className="text-amber-500 shrink-0" />
                        <div className="text-left">
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1 leading-none">Price Disclaimer</p>
                          <p className="text-[11px] font-bold text-amber-700 dark:text-amber-500 leading-tight">
                            Estimation based on user inputs. Subject to verification.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Configuration Details */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 px-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30">Configuration Details</span>
                        <div className="h-px flex-1 bg-[var(--color-border)]" />
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        {details.map((item, idx) => (
                          <div key={idx} className="bg-black/5 dark:bg-white/5 p-5 rounded-2xl border border-[var(--color-border)] flex items-center justify-between group hover:border-blue-500/30 transition-colors">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                                <Layers size={16} strokeWidth={3} />
                              </div>
                              <div className="text-left">
                                <h4 className="text-[12px] font-black uppercase italic leading-none">{item.itemName || `Item ${idx+1}`}</h4>
                                <div className="flex items-center gap-2 mt-2 opacity-40">
                                  <span className="text-[10px] font-bold uppercase">{item.normalizedMaterial?.name || item.material?.material?.name || 'Material'}</span>
                                  <span className="w-1 h-1 rounded-full bg-current opacity-30" />
                                  <span className="text-[10px] font-bold uppercase">{item.normalizedWeight || item.sliced?.weight || 0}g</span>
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="flex items-center gap-1.5 text-[12px] font-black italic text-blue-600">
                                <Clock size={12} strokeWidth={3} />
                                {Math.floor((item.normalizedTime || item.sliced?.time || 0) / 60)}h {(item.normalizedTime || item.sliced?.time || 0) % 60}m
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Links & Date */}
                    <div className="space-y-3">
                      {/* Vault: File Link Input + License Checkbox */}
                      {isVault && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-4 px-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30">File Link</span>
                            <div className="h-px flex-1 bg-[var(--color-border)]" />
                          </div>
                          <div className="bg-white dark:bg-white/5 p-4 rounded-2xl border border-[var(--color-border)] space-y-4">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
                                <FileText size={18} strokeWidth={2.5} />
                              </div>
                              <div className="flex-1 space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest opacity-40 block">Google Drive File Link</label>
                                <input
                                  type="url"
                                  value={fileLink}
                                  onChange={(e) => setFileLink(e.target.value)}
                                  onBlur={(e) => handleFileLinkSave(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  placeholder="https://drive.google.com/..."
                                  className={`w-full px-4 py-3 bg-[var(--color-bg)] border rounded-xl text-[12px] font-bold outline-none focus:ring-1 transition-all placeholder:opacity-30 ${
                                    fileLinkHasValue && !fileLinkIsValid
                                      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                                      : fileLinkIsValid
                                      ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20'
                                      : 'border-[var(--color-border)] focus:border-blue-500 focus:ring-blue-500/20'
                                  }`}
                                />
                                {fileLinkHasValue && !fileLinkIsValid ? (
                                  <p className="text-[9px] font-bold text-red-500 leading-tight">
                                    Only Google Drive links are accepted (drive.google.com)
                                  </p>
                                ) : (
                                  <p className="text-[9px] font-bold opacity-30 leading-tight">
                                    Upload your STL / 3MF files to Google Drive and paste the share link here.
                                  </p>
                                )}
                              </div>
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
                                <p className={`text-[11px] font-bold leading-tight transition-colors ${
                                  licenseAcknowledged ? 'text-emerald-700 dark:text-emerald-400' : 'opacity-60'
                                }`}>
                                  I confirm that I have the right to use and print this 3D model. I accept full responsibility for any licensing or intellectual property concerns related to this file.
                                </p>
                              </div>
                            </label>
                            </>
                            )}
                          </div>

                          {!vaultReadyForBasket && (
                            <div className="flex items-center gap-2 justify-center py-1">
                              <AlertTriangle size={12} className="text-amber-500" />
                              <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 animate-pulse">
                                {fileLinkHasValue && !fileLinkIsValid 
                                  ? 'Valid Google Drive link required' 
                                  : 'GDrive link & license acknowledgment required to add to basket'}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* View Design Files (for non-vault or when link exists) */}
                      {!isVault && project.gdriveLink && (
                        <a href={project.gdriveLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all group">
                          <div className="flex items-center gap-3">
                            <Link2 size={16} strokeWidth={3} />
                            <span className="text-[10px] font-black uppercase tracking-widest">View Design Files</span>
                          </div>
                          <ExternalLink size={14} className="opacity-40 group-hover:opacity-100 transition-opacity" />
                        </a>
                      )}

                      {/* View link button for vault when link is a valid GDrive URL */}
                      {isVault && fileLinkIsValid && (
                        <a href={fileLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all group">
                          <div className="flex items-center gap-3">
                            <Link2 size={16} strokeWidth={3} />
                            <span className="text-[10px] font-black uppercase tracking-widest">View Design Files</span>
                          </div>
                          <ExternalLink size={14} className="opacity-40 group-hover:opacity-100 transition-opacity" />
                        </a>
                      )}
                      
                      {project.createdAt && (
                        <div className="flex items-center justify-center gap-2 opacity-20 py-2">
                          <Calendar size={12} />
                          <span className="text-[9px] font-black uppercase tracking-widest">
                            Created {new Date(project.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </span>
                        </div>
                      )}

                      {/* 3D Designing Services — Dynamically loaded from Firestore */}
                      {!is3MF && availableDesignServices.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-4 px-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30">3D Designing Services</span>
                            <div className="h-px flex-1 bg-[var(--color-border)]" />
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            {availableDesignServices.map((service) => {
                              const isSelected = selectedDesignService === service.id;
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
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                                      isSelected ? 'bg-purple-500 text-white' : 'bg-purple-600/10 text-purple-600'
                                    }`}>
                                      <Paintbrush size={18} strokeWidth={2.5} />
                                    </div>
                                    <div className="text-left">
                                      <h4 className="text-[12px] font-black uppercase leading-none">{service.label}</h4>
                                      <span className="text-[10px] font-bold opacity-40 mt-1 block">Base Price: ₱{service.basePrice.toLocaleString()}</span>
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
                          {selectedDesignService && (
                            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex gap-2 items-start">
                              <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                              <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 leading-tight">
                                Price is not yet final. Service complexity level will be adjusted by the admin upon order review.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

{/* Footer Actions */}
{!isReadOnly && (
  <div className={`absolute bottom-0 left-0 right-0 w-full p-2 border-t ${isDarkMode ? 'bg-black/80 border-white/10' : 'bg-white/80 border-black/5'} backdrop-blur-md z-[110]`}>
    <div className={`flex flex-row items-center gap-2 ${isAdminBlueprintView || isPublicVaultView ? 'justify-end' : ''}`}>
      {isAdminBlueprintView ? (
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
              title="Modify project"
            >
              <Settings size={15} strokeWidth={3} />
              <span className="truncate">Modify</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleToggleProduction}
            className={`h-12 flex-1 min-w-0 px-5 rounded-full text-white font-black italic uppercase text-[11px] tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all ${
              canAddToBasket
                ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/30'
                : 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/30'
            }`}
            title={canAddToBasket ? 'Stop Production' : 'Allow Production'}
          >
            {canAddToBasket ? <Pause size={15} fill="white" /> : <Play size={15} fill="white" />}
            <span className="truncate">Production</span>
          </button>
        </>
      ) : isPublicVaultView ? (
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
              className="h-12 flex-1 min-w-0 px-4 rounded-full bg-neutral-900 dark:bg-white/10 text-white font-black italic uppercase text-[11px] tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
              title="Modify estimate"
            >
              <Settings size={15} strokeWidth={3} />
              <span className="truncate">Modify</span>
            </button>
          )}
          <button
            type="button"
            onClick={(e) => handleAddProjectToBasket(e, { closeModal: true })}
            disabled={!canAddToBasket || !vaultReadyForBasket}
            className={`h-12 flex-1 min-w-0 px-4 rounded-full text-white font-black italic uppercase text-[11px] tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all ${
              !canAddToBasket || !vaultReadyForBasket
                ? 'bg-neutral-400 cursor-not-allowed opacity-50'
                : 'bg-gradient-to-br from-blue-500 to-blue-600'
            }`}
          >
            <ShoppingBasket size={15} strokeWidth={3} />
            <span className="truncate">Add to Basket</span>
          </button>
        </>
      ) : (
        <>
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
              <span className="truncate">Add to Basket</span>
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
              <span className="truncate">Order Now</span>
            </button>
          </div>
        </>
      )}
    </div>
  </div>
)}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
