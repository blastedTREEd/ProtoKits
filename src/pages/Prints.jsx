import React, { useState, useMemo, useEffect } from 'react';
import PageTemplate from './PageTemplate';
import PrintsCalculator from '../components/calculator/PrintsCalculator';
import ProjectCard from '../components/calculator/ProjectCard';
import { useStore } from '../store/useStore';
import CheckoutModal from '../components/kitcards/CheckoutModal';
import LoginPromptModal from '../components/menu/LoginPromptModal';
import { Droplet, Calculator, Search, Box, Plus, X, HandCoins, Lock, Zap } from 'lucide-react';
import FilamentManagerModal from '../components/calculator/FilamentManagerModal';
import RatesManagerModal from '../components/calculator/RatesManagerModal';
import LoadingState from '../components/common/LoadingState';
import AddPrintModal from '../components/calculator/AddPrintModal';
import { getCheckoutPaymentFees } from '../utils/paymentSettings';

const isPrintListing = (project) => (
  project?.source === 'admin-print'
  || project?.listingType === 'print'
  || (!!project?.production && (!!project?.image || (Array.isArray(project?.images) && project.images.length > 0)))
);

export default function Prints({ isDarkMode }) {
  const [viewMode, setViewMode] = useState('idle');
  const [modifyingProject, setModifyingProject] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
        setSearchTerm(searchTerm);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const [showSearchBar, setShowSearchBar] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  const isAdmin = useStore((state) => state.isAdmin);
  const isAdminView = useStore((state) => state.isAdminView);

  const projectVault = useStore((state) => state.projectVault);
  const orders = useStore((state) => state.orders);
  
  const estimationLimitReached = useMemo(() => {
    if (isAdmin && isAdminView) return false;
    const completedProjectsCount = (orders || []).filter(o => 
      o.status?.toLowerCase() === 'completed' && 
      o.items?.some(item => item.type === 'project')
    ).length;
    const limit = 3 + completedProjectsCount;
    return (projectVault || []).length >= limit;
  }, [orders, projectVault, isAdmin, isAdminView]);
  
  const blueprints = useStore((state) => state.blueprints);

  const removeFromVault = useStore((state) => state.removeFromVault);
  const updateProjectInVault = useStore((state) => state.updateProjectInVault);
  const addProjectToBasket = useStore((state) => state.addProjectToBasket);
  const deleteBlueprint = useStore((state) => state.deleteBlueprint);
  const isLoading = useStore((state) => state.isLoading);
  const loadBlueprints = useStore((state) => state.loadBlueprints);
  const loadPrintResources = useStore((state) => state.loadPrintResources);
  const user = useStore((state) => state.user);
  const setLoginModalOpen = useStore((state) => state.setLoginModalOpen);
  const setToastMessage = useStore((state) => state.setToastMessage);
  const shippingSettings = useStore((state) => state.shippingSettings);
  
  const [showFilamentModal, setShowFilamentModal] = useState(false);
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [editingPrintProject, setEditingPrintProject] = useState(null);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isLoginPromptOpen, setIsLoginPromptOpen] = useState(false);
  const [itemsForCheckout, setItemsForCheckout] = useState([]);

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
    const handleScroll = () => {
      if (document.activeElement?.tagName !== 'INPUT' && window.innerWidth < 1024) {
        const currentScrollY = window.scrollY;
        if (currentScrollY > lastScrollY && currentScrollY > 100) setShowSearchBar(false);
        else setShowSearchBar(true);
        setLastScrollY(currentScrollY);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

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
    setItemsForCheckout([buildCheckoutProjectItem(project)]);
    if (!user) {
      setIsLoginPromptOpen(true);
      return;
    }
    if (!(isAdmin && isAdminView)) {
      setIsCheckoutModalOpen(true);
    }
  };

  return (
    <PageTemplate isDarkMode={isDarkMode}>
      <div className="min-h-screen w-full bg-[var(--color-bg)] transition-colors duration-500 pb-20 font-sans">
        
        {/* Header Search (All Viewports) */}
        <div className={`sticky top-[56px] sm:top-[60px] z-[90] h-[60px] bg-[var(--color-bg)]/90 backdrop-blur-md border-b border-black/5 dark:border-white/5 transition-transform duration-300 ${showSearchBar ? 'translate-y-0' : '-translate-y-full'}`}>
          <div className="h-full w-full px-4 md:px-8 flex items-center justify-center gap-4">
            
            <div className="flex-1 max-w-2xl flex items-center gap-4">
                <div className="relative flex-1">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20 text-neutral-900 dark:text-white" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
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
          </div>
        </div>

        <main className="max-w-full mx-auto px-4 md:px-8 mt-4">
          {isLoading && totalMatches === 0 ? (
            <LoadingState message="Loading projects..." />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 sm:portrait:grid-cols-3 md:grid-cols-4 md:portrait:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-3 items-stretch">
              {isAdmin && isAdminView && (
                <button 
                  onClick={openNewPrintModal}
                  className="group relative flex flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed p-10 bg-blue-600/10 dark:bg-blue-600/20 border-blue-600/20 dark:border-blue-500/40 hover:border-blue-600/50 transition-all hover:scale-[1.02] active:scale-95"
                >
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-cyan-400 text-white shadow-xl shadow-blue-600/20">
                    <Box size={40} className="group-hover:rotate-12 transition-transform" />
                    <div className="absolute -top-1 -right-1 bg-cyan-300 rounded-full p-1 border-2 border-blue-600">
                        <Plus size={12} strokeWidth={4} />
                    </div>
                  </div>
                  <span className="mt-4 text-[12px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 opacity-60 group-hover:opacity-100 transition-opacity text-center leading-tight">New<br/>Project</span>
                </button>
              )}

              {!(isAdmin && isAdminView) && (
                <button 
                  onClick={enterEstimating}
                  className="group relative flex flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed p-10 transition-all hover:scale-[1.02] active:scale-95 bg-blue-600/10 dark:bg-blue-600/20 border-blue-600/20 dark:border-blue-500/40 hover:border-blue-600/50"
                >
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-cyan-400 text-white shadow-xl shadow-blue-600/20 transition-transform">
                    <Calculator size={40} className="group-hover:rotate-12 transition-transform" />
                    <div className={`absolute -top-1 -right-1 rounded-full p-1 border-2 ${
                        estimationLimitReached ? 'bg-blue-300 border-blue-600' : 'bg-cyan-300 border-blue-600'
                    }`}>
                      {estimationLimitReached ? <Lock size={12} strokeWidth={4} /> : <Plus size={12} strokeWidth={4} />}
                    </div>
                  </div>
                  <span className={`mt-4 text-[12px] font-black uppercase tracking-widest text-center leading-tight transition-opacity text-blue-600 dark:text-blue-400 opacity-60 group-hover:opacity-100`}>
                    New<br/>Project
                  </span>
                </button>
              )}

              {isAdmin && isAdminView && (
                <button 
                  onClick={() => setShowFilamentModal(true)}
                  className="group relative flex flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed p-10 bg-emerald-600/10 dark:bg-emerald-600/20 border-emerald-600/20 dark:border-emerald-500/40 hover:border-emerald-600/50 transition-all hover:scale-[1.02] active:scale-95"
                >
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-600 to-lime-400 text-white shadow-xl shadow-emerald-600/20">
                    <Droplet size={40} className="group-hover:rotate-12 transition-transform" />
                    <div className="absolute -top-1 -right-1 bg-lime-300 rounded-full p-1 border-2 border-emerald-600">
                        <Plus size={12} strokeWidth={4} />
                    </div>
                  </div>
                  <span className="mt-4 text-[12px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 opacity-60 group-hover:opacity-100 transition-opacity text-center leading-tight">Inventory<br/>Stock</span>
                </button>
              )}

              {isAdmin && isAdminView && (
                <button 
                  onClick={() => setShowRatesModal(true)}
                  className="group relative flex flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed p-10 bg-rose-600/10 dark:bg-rose-600/20 border-rose-600/20 dark:border-rose-500/40 hover:border-rose-600/50 transition-all hover:scale-[1.02] active:scale-95"
                >
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-rose-600 to-red-400 text-white shadow-xl shadow-rose-600/20">
                    <HandCoins size={40} className="group-hover:-rotate-12 transition-transform" />
                    <div className="absolute -top-1 -right-1 bg-red-300 rounded-full p-1 border-2 border-rose-600">
                        <Plus size={12} strokeWidth={4} />
                    </div>
                  </div>
                  <span className="mt-4 text-[12px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 opacity-60 group-hover:opacity-100 transition-opacity text-center leading-tight">Printing<br/>Rates</span>
                </button>
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
                  />
                );
              })}

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
      <CheckoutModal isOpen={isCheckoutModalOpen} onClose={() => setIsCheckoutModalOpen(false)} items={itemsForCheckout} isGuestPreview={!user} />
      <LoginPromptModal isOpen={isLoginPromptOpen} onClose={() => setIsLoginPromptOpen(false)} onLogin={() => { setLoginModalOpen(true); setIsLoginPromptOpen(false); }} onContinue={() => { setIsLoginPromptOpen(false); setIsCheckoutModalOpen(true); }} continueLabel="Check Price & Shipping" />
    </PageTemplate>
  );
}
