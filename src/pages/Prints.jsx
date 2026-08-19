import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageTemplate from './PageTemplate';
import PrintsCalculator from '../components/calculator/PrintsCalculator';
import ProjectCard from '../components/calculator/ProjectCard';
import { useStore } from '../store/useStore';
import { useTheme } from '../context/ThemeContext';
import LoginPromptModal from '../components/menu/LoginPromptModal';
import { Droplet, Calculator, Search, Box, X, HandCoins, MoreHorizontal } from 'lucide-react';
import FilamentManagerModal from '../components/calculator/FilamentManagerModal';
import RatesManagerModal from '../components/calculator/RatesManagerModal';
import ProductCardSkeleton from '../components/common/ProductCardSkeleton';
import AddPrintModal from '../components/calculator/AddPrintModal';
import { getCheckoutPaymentFees } from '../utils/paymentSettings';

const isPrintListing = (project) => (
  project?.source === 'admin-print'
  || project?.listingType === 'print'
  || (!!project?.production && (!!project?.image || (Array.isArray(project?.images) && project.images.length > 0)))
);

export default function Prints() {
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();
  const { projectId: routeProjectId } = useParams();
  const [viewMode, setViewMode] = useState('idle');
  const [modifyingProject, setModifyingProject] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
        setSearchTerm(searchTerm);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const sectionHeaderPosition = 'top-[116px] sm:top-[120px]';

  const isAdmin = useStore((state) => state.isAdmin);
  const isAdminView = useStore((state) => state.isAdminView);

  const projectVault = useStore((state) => state.projectVault);
  
  const blueprints = useStore((state) => state.blueprints);

  const removeFromVault = useStore((state) => state.removeFromVault);
  const updateProjectInVault = useStore((state) => state.updateProjectInVault);
  const addProjectToBasket = useStore((state) => state.addProjectToBasket);
  const deleteBlueprint = useStore((state) => state.deleteBlueprint);
  const isLoading = useStore((state) => state.isLoading);
  const loadBlueprints = useStore((state) => state.loadBlueprints);
  const loadPrintResources = useStore((state) => state.loadPrintResources);
  const user = useStore((state) => state.user);
  const isAnonymousUser = useStore((state) => state.isAnonymousUser);
  const setLoginModalOpen = useStore((state) => state.setLoginModalOpen);
  const setToastMessage = useStore((state) => state.setToastMessage);
  const shippingSettings = useStore((state) => state.shippingSettings);
  
  const [showFilamentModal, setShowFilamentModal] = useState(false);
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [editingPrintProject, setEditingPrintProject] = useState(null);
  const [isLoginPromptOpen, setIsLoginPromptOpen] = useState(false);
  const [itemsForCheckout, setItemsForCheckout] = useState([]);

  const openCheckoutPage = (items, isGuestPreview = !user || isAnonymousUser) => {
    navigate('/checkout', { state: { items, isGuestPreview } });
  };

  const shadow = isDarkMode 
    ? 'shadow-[0_8px_30px_rgba(0,0,0,0.5)]' 
    : 'shadow-[0_4px_12px_rgba(0,0,0,0.05)]';

  useEffect(() => {
    loadBlueprints();
    loadPrintResources();
  }, [loadBlueprints, loadPrintResources]);

  const filteredBlueprints = useMemo(() => {
    if (!blueprints) return [];
    const printableBlueprints = blueprints.filter(isPrintListing);
    if (!searchTerm) return printableBlueprints;
    const searchWords = searchTerm.toLowerCase().replace(/[-]/g, ' ').split(/\s+/).filter(Boolean);
    return printableBlueprints.filter(b => {
        const targetString = `${b.projectName || ''}`.toLowerCase().replace(/[-]/g, ' ');
        return searchWords.every(word => targetString.includes(word));
    });
  }, [blueprints, searchTerm]);

  const vaultProjectTitles = useMemo(() => {
    const map = new Map();
    const vault = projectVault || [];
    vault.forEach((project, index) => {
      const savedNumber = vault.length - index;
      map.set(project.vaultId, `PROJECT #${savedNumber}`);
    });
    return map;
  }, [projectVault]);

  const filteredVault = useMemo(() => {
    if (isAdmin && isAdminView) return [];
    if (!projectVault) return [];
    if (!searchTerm) return projectVault;
    const searchWords = searchTerm.toLowerCase().replace(/[-]/g, ' ').split(/\s+/).filter(Boolean);
    return projectVault.filter(p => {
        const targetString = `${p.projectName || ''} ${vaultProjectTitles.get(p.vaultId) || ''}`.toLowerCase().replace(/[-]/g, ' ');
        return searchWords.every(word => targetString.includes(word));
    });
  }, [projectVault, searchTerm, isAdmin, isAdminView, vaultProjectTitles]);
  
  const totalMatches = filteredBlueprints.length + filteredVault.length;

  useEffect(() => {
    if (viewMode === 'estimating') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [viewMode]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [searchTerm]);

  useEffect(() => {
    const closeToolsOnScroll = () => setIsToolsOpen(false);
    window.addEventListener('scroll', closeToolsOnScroll, { passive: true });
    return () => window.removeEventListener('scroll', closeToolsOnScroll);
  }, []);

  const enterEstimating = () => {
    setModifyingProject(null);
    setViewMode('estimating');
    window.history.pushState({ mode: 'estimating' }, '');
    window.dispatchEvent(new Event('hideNavbar'));
  };

  const handleModify = (project) => {
    if (isPrintListing(project) && isAdmin && isAdminView) {
      setEditingPrintProject(project);
      setShowPrintModal(true);
      return;
    }
    setModifyingProject(project);
    setViewMode('estimating');
    window.history.pushState({ mode: 'estimating' }, '');
    window.dispatchEvent(new Event('hideNavbar'));
  };

  const handleDeleteVaultProject = (project) => {
    const vaultId = typeof project === 'string' ? project : project?.vaultId;
    if (!vaultId) return;
    if (window.confirm('Remove this estimate from vault?')) {
      removeFromVault(vaultId);
    }
  };

  const handleDeletePrintProject = (project) => {
    const id = typeof project === 'string' ? project : project?.id;
    if (!id) return;
    if (window.confirm('Delete this finished print listing?')) {
      deleteBlueprint(id).catch((error) => alert(error?.message || 'Unable to delete print listing.'));
    }
  };

  const handleEstimateUpdate = (payload) => {
    if (!modifyingProject?.vaultId) return;
    updateProjectInVault(modifyingProject.vaultId, payload)
      .then(() => {
        setViewMode('idle');
        setModifyingProject(null);
        window.dispatchEvent(new Event('showNavbar'));
      })
      .catch((error) => alert(error?.message || 'Unable to update estimate.'));
  };

  const openNewPrintModal = () => {
    setEditingPrintProject(null);
    setShowPrintModal(true);
  };

  const closePrintModal = () => {
    setShowPrintModal(false);
    setEditingPrintProject(null);
  };

  const handleBasketAction = async (e, project) => {
    e.stopPropagation();
    if (project?.canAddToBasket === false) return;
    try {
      await addProjectToBasket(project);
      setToastMessage(isAdmin && isAdminView ? 'Added to shelf!' : 'Added to basket!');
    } catch (error) {
      console.error("SG DEBUG: Error adding to basket:", error);
      alert(error?.message || 'Unable to add project to basket.');
      throw error;
    }
  };

  const buildCheckoutProjectItem = (project) => {
    const { handlingFee, installmentFee, transferFee } = getCheckoutPaymentFees({ shippingSettings });
    const grandTotal = parseFloat(String(project?.totals?.total || project?.sellPrice || project?.price || 0).replace(/,/g, '')) || 0;
    const basePrice = parseFloat(String(project?.totals?.basePrice || 0).replace(/,/g, '')) || Math.max(0, grandTotal - handlingFee - installmentFee - transferFee);
    const downpayment = parseFloat(String(project?.totals?.dp || project?.minDownpayment || 0).replace(/,/g, '')) || 0;
    const basketId = `checkout_project_${project?.vaultId || project?.id || Date.now()}`;

    let name = `Custom Print: ${project?.projectName || project?.method?.name || 'Project'}`;
    if (project?.selectedDesignService) {
      name += ' (w/ Design Service)';
    }

    return {
      id: `project_${basketId}`,
      basketId,
      type: 'project',
      quantity: 1,
      isFinalized: project?.method?.name === '3MF',
      gdriveLink: project?.gdriveLink || '',
      projectData: {
        ...project,
        sellPrice: basePrice,
        displayPrice: grandTotal,
        minDownpayment: downpayment
      },
      name,
      price: grandTotal,
      appliedHandlingFee: handlingFee,
      appliedInstallmentFee: installmentFee,
      appliedTransferFee: transferFee,
      minDownpayment: downpayment,
      createdAt: new Date().toISOString()
    };
  };

  const handleOrderNow = (project) => {
    const checkoutItems = [buildCheckoutProjectItem(project)];
    setItemsForCheckout(checkoutItems);
    if (!user) {
      setIsLoginPromptOpen(true);
      return;
    }
    if (!(isAdmin && isAdminView)) {
      openCheckoutPage(checkoutItems, false);
    }
  };

  const headerActions = isAdmin && isAdminView
    ? [
        { id: 'new-project', label: 'New Project', icon: Box, tone: 'border-blue-500/20 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20', onClick: openNewPrintModal },
        { id: 'inventory', label: 'Inventory', icon: Droplet, tone: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20', onClick: () => setShowFilamentModal(true) },
        { id: 'printing-rates', label: 'Printing Rates', icon: HandCoins, tone: 'border-rose-500/20 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20', onClick: () => setShowRatesModal(true) }
      ]
    : [
        { id: 'estimate', label: 'Estimate', icon: Calculator, tone: 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700', onClick: enterEstimating }
      ];

  const renderHeaderActions = () => headerActions.map(({ id, label, icon, tone, onClick }) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setIsToolsOpen(false);
        onClick();
      }}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-sm transition-all hover:scale-110 active:scale-95 ${tone}`}
      aria-label={label}
      title={label}
    >
      {React.createElement(icon, { size: 20, strokeWidth: 2 })}
    </button>
  ));

  return (
    <PageTemplate isDarkMode={isDarkMode}>
      <div className="min-h-screen w-full bg-neutral-50 dark:bg-[#0a0a0a] transition-colors duration-500 pb-20 font-sans">
        
        {/* Header Search (All Viewports) */}
        <div className="sticky top-[56px] sm:top-[60px] z-[90] h-[60px] overflow-visible bg-neutral-50/90 dark:bg-[#0a0a0a]/90 backdrop-blur-md border-b border-black/5 dark:border-white/5">
          <div className="h-full w-full px-4 md:px-8 flex items-center justify-center gap-4">
            
            <div className="flex flex-1 max-w-2xl items-center gap-4 pr-12 xl:pr-0">
                <div className="relative flex-1">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20 text-neutral-900 dark:text-white" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onFocus={() => setIsToolsOpen(false)}
                      onClick={() => setIsToolsOpen(false)}
                      onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                      placeholder="SEARCH PROJECTS..."
                      className="w-full pl-12 pr-12 py-3 bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl text-[11px] font-black uppercase tracking-widest outline-none focus:border-blue-500 transition-all"
                    />
                    {searchTerm && (
                      <button 
                         onClick={() => setSearchTerm("")}
                         className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
                      >
                         <X size={12} className="opacity-50" />
                      </button>
                    )}
                </div>
                <div className="flex items-center gap-2 px-4 py-3 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/10 shrink-0 z-10">
                    {searchTerm ? (
                      <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest">
                        {totalMatches} MATCHES
                      </span>
                    ) : (
                      <>
                        <span className={`w-2 h-2 rounded-full ${isLoading ? 'bg-amber-500' : 'bg-emerald-500'} animate-pulse`} />
                        <span className="text-[9px] font-black opacity-30 uppercase tracking-widest text-neutral-900 dark:text-white">Live</span>
                      </>
                    )}
                </div>
            </div>
            {isAdmin && isAdminView ? (
              <>
                <div className="absolute right-4 hidden items-center gap-1.5 xl:flex xl:right-8">
                  {renderHeaderActions()}
                </div>
                <div className="absolute right-4 top-1/2 z-[100] flex -translate-y-1/2 flex-col items-end gap-1.5 xl:hidden">
                  <button
                    type="button"
                    onClick={() => setIsToolsOpen((isOpen) => !isOpen)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-black/5 text-neutral-700 shadow-sm transition-all hover:scale-105 hover:bg-black/10 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                    aria-label={isToolsOpen ? 'Hide print admin tools' : 'Show print admin tools'}
                    aria-expanded={isToolsOpen}
                    title={isToolsOpen ? 'Hide print admin tools' : 'Show print admin tools'}
                  >
                    <MoreHorizontal size={18} strokeWidth={2.5} />
                  </button>
                  {isToolsOpen && (
                    <div className="absolute left-1/2 top-full mt-1.5 flex -translate-x-1/2 flex-col items-center gap-1.5 rounded-2xl border border-black/5 bg-white/95 p-1.5 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/95">
                      {renderHeaderActions()}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="absolute right-4 top-1/2 z-[100] flex -translate-y-1/2 items-center xl:right-8">
                {renderHeaderActions()}
              </div>
            )}
          </div>
        </div>

        <main className="max-w-full mx-auto px-4 md:px-8">
          {isLoading && totalMatches === 0 ? (
            <div className="grid grid-cols-2 items-stretch gap-4 sm:grid-cols-4 sm:portrait:grid-cols-3 md:grid-cols-4 md:portrait:grid-cols-3 md:gap-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, index) => <ProductCardSkeleton key={`print-skeleton-${index}`} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 sm:portrait:grid-cols-3 md:grid-cols-4 md:portrait:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-3 items-stretch">
              {/* --- Section Divider: Garage Projects --- */}
              {filteredBlueprints.length > 0 && (
                <div className={`col-span-full first:mt-4 my-2 sticky z-[80] -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 bg-neutral-50/60 px-4 py-3 backdrop-blur-md transition-[top] duration-300 dark:bg-[#0a0a0a]/60 md:-mx-8 md:w-[calc(100%+4rem)] md:px-8 ${sectionHeaderPosition}`}>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] bg-gradient-to-r from-[#0866FF] to-[#00CFFF] bg-clip-text text-transparent select-none">Garage Projects</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                </div>
              )}

              {filteredBlueprints.map((project) => {
                return (
                  <ProjectCard 
                    key={project.id}
                    project={project}
                    type="blueprint"
                    onBasketAction={handleBasketAction}
                    onOrderNow={handleOrderNow}
                    showManagementActions={isAdmin && isAdminView}
                    onModify={isAdmin && isAdminView ? handleModify : undefined}
                    onDelete={isAdmin && isAdminView ? handleDeletePrintProject : undefined}
                    openOnMount={routeProjectId === project.id}
                  />
                );
              })}

              {/* --- Section Divider: Vault (Personal Projects) --- */}
              {(filteredVault.length > 0 || !(isAdmin && isAdminView)) && (
                <div className={`col-span-full first:mt-4 my-2 sticky z-[80] -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 bg-neutral-50/60 px-4 py-3 backdrop-blur-md transition-[top] duration-300 dark:bg-[#0a0a0a]/60 md:-mx-8 md:w-[calc(100%+4rem)] md:px-8 ${sectionHeaderPosition}`}>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] bg-gradient-to-r from-[#0866FF] to-[#00CFFF] bg-clip-text text-transparent select-none">User Projects</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                </div>
              )}

              {filteredVault.map((project) => {
                return (
                  <ProjectCard 
                    key={project.vaultId}
                    project={project}
                    type="vault"
                    fallbackTitle={vaultProjectTitles.get(project.vaultId)}
                    onBasketAction={handleBasketAction}
                    onOrderNow={handleOrderNow}
                    showManagementActions={true}
                    onModify={handleModify}
                    onDelete={handleDeleteVaultProject}
                  />
                );
              })}
            </div>
          )}

          {totalMatches === 0 && !isLoading && searchTerm !== "" && (
            <div className="py-20 flex flex-col items-center justify-center opacity-20 text-neutral-900 dark:text-white">
              <Search size={48} strokeWidth={1} />
              <p className="mt-4 font-black uppercase tracking-widest text-sm">No results found for "{searchTerm}"</p>
            </div>
          )}
        </main>
        
        {viewMode === 'estimating' && (
           <div className="fixed inset-0 z-[200] flex items-stretch justify-center lg:items-center lg:p-4 backdrop-blur-sm bg-black/40 animate-in fade-in duration-200">
               <div className={`relative w-full h-full lg:h-[90dvh] lg:max-w-2xl rounded-none lg:rounded-[2rem] border-0 lg:border shadow-2xl overflow-hidden bg-[var(--color-surface)] border-[var(--color-border)] ${shadow}`}>
                  <div className="h-full overflow-y-auto">
                      <PrintsCalculator 
                        onExit={() => {setViewMode('idle'); setModifyingProject(null); window.dispatchEvent(new Event('showNavbar'));} }
                        initialData={modifyingProject}
                        fallbackTitle={modifyingProject ? vaultProjectTitles.get(modifyingProject.vaultId) : undefined}
                        isEditMode={!!modifyingProject}
                        onConfirmEdit={handleEstimateUpdate}
                      />
                  </div>
               </div>
            </div>
        )}
      </div>

      {/* MODALS */}
      {showFilamentModal && <FilamentManagerModal onClose={() => setShowFilamentModal(false)} />}
      {showRatesModal && <RatesManagerModal onClose={() => setShowRatesModal(false)} />}
      {showPrintModal && <AddPrintModal onClose={closePrintModal} initialProject={editingPrintProject} />}
      <LoginPromptModal isOpen={isLoginPromptOpen} onClose={() => setIsLoginPromptOpen(false)} onLogin={() => { setLoginModalOpen(true); setIsLoginPromptOpen(false); }} onContinue={() => { setIsLoginPromptOpen(false); openCheckoutPage(itemsForCheckout, true); }} continueLabel="Check Price & Shipping" />
    </PageTemplate>
  );
}
