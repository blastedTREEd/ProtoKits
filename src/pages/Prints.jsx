import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageTemplate from './PageTemplate';
import PrintsCalculator from '../components/calculator/PrintsCalculator';
import ProjectCard from '../components/calculator/ProjectCard';
import { useStore } from '../store/useStore';
import { useTheme } from '../context/ThemeContext';
import LoginPromptModal from '../components/menu/LoginPromptModal';
import { Droplet, Calculator, Search, Box, Plus, X, HandCoins, Lock, Zap, Rocket } from 'lucide-react';
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

const ADMIN_TOOL_STYLES = {
  blue: {
    media: 'bg-blue-600/10 dark:bg-blue-600/20',
    circle: 'from-blue-600 to-cyan-400',
    shadow: 'shadow-blue-600/20',
    accent: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-cyan-300 border-blue-600',
    hover: 'group-hover:from-blue-600 group-hover:to-cyan-500'
  },
  emerald: {
    media: 'bg-emerald-600/10 dark:bg-emerald-600/20',
    circle: 'from-emerald-600 to-lime-400',
    shadow: 'shadow-emerald-600/20',
    accent: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-lime-300 border-emerald-600',
    hover: 'group-hover:from-emerald-600 group-hover:to-lime-500'
  },
  rose: {
    media: 'bg-rose-600/10 dark:bg-rose-600/20',
    circle: 'from-rose-600 to-red-400',
    shadow: 'shadow-rose-600/20',
    accent: 'text-rose-600 dark:text-rose-400',
    badge: 'bg-red-300 border-rose-600',
    hover: 'group-hover:from-rose-600 group-hover:to-red-500'
  }
};

function AdminToolCard({ onClick, icon, title, action, tone, shadow }) {
  const styles = ADMIN_TOOL_STYLES[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full group relative rounded-[2.2rem] p-[2px] bg-black/5 dark:bg-white/5 transition-all duration-500 lg:hover:-translate-y-1 cursor-pointer overflow-hidden ${shadow}`}
    >
      <div className="relative rounded-[2.1rem] flex flex-col h-full overflow-hidden bg-white dark:bg-[var(--color-surface)]">
        <div className="p-3 flex flex-col h-full">
          <div className={`relative aspect-square rounded-2xl overflow-hidden mb-3 shrink-0 flex items-center justify-center ${styles.media}`}>
            <div className={`relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr ${styles.circle} text-white shadow-xl ${styles.shadow} transition-transform group-hover:scale-105`}>
              {React.createElement(icon, { size: 40, className: 'group-hover:rotate-12 transition-transform' })}
              <div className={`absolute -top-1 -right-1 rounded-full p-1 border-2 ${styles.badge}`}>
                <Plus size={12} strokeWidth={4} />
              </div>
            </div>
          </div>

          <div className="px-1 text-center flex-1 flex flex-col min-w-0">
            <div className="h-[2.5em] flex items-center justify-center min-w-0">
              <span className={`text-[13px] font-bold uppercase tracking-tighter leading-tight ${styles.accent}`}>
                {title}
              </span>
            </div>

            <div className="mt-auto min-w-0 min-h-[50px] flex items-center pb-1">
              <div className={`h-9 w-full rounded-full flex items-center justify-center gap-1.5 bg-gradient-to-br ${styles.circle} ${styles.hover} text-white shadow-lg ${styles.shadow} transition-all`}>
                <Plus size={14} strokeWidth={3} />
                <span className="text-[10px] font-black uppercase tracking-widest">{action}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function Prints() {
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();
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
  const sectionHeaderTranslation = showSearchBar ? 'translate-y-0' : '-translate-y-[60px]';

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

  return (
    <PageTemplate isDarkMode={isDarkMode}>
      <div className="min-h-screen w-full bg-neutral-50 dark:bg-[#0a0a0a] transition-colors duration-500 pb-20 font-sans">
        
        {/* Header Search (All Viewports) */}
        <div className={`sticky top-[56px] sm:top-[60px] z-[90] h-[60px] bg-neutral-50/90 dark:bg-[#0a0a0a]/90 backdrop-blur-md border-b border-black/5 dark:border-white/5 transition-transform duration-300 ${showSearchBar ? 'translate-y-0' : '-translate-y-full'}`}>
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

        <main className="max-w-full mx-auto px-4 md:px-8">
          {isLoading && totalMatches === 0 ? (
            <div className="grid grid-cols-2 items-stretch gap-4 sm:grid-cols-4 sm:portrait:grid-cols-3 md:grid-cols-4 md:portrait:grid-cols-3 md:gap-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, index) => <ProductCardSkeleton key={`print-skeleton-${index}`} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 sm:portrait:grid-cols-3 md:grid-cols-4 md:portrait:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-3 items-stretch">
              {/* --- Section Divider: Garage Projects --- */}
              {filteredBlueprints.length > 0 && (
                <div className={`col-span-full first:mt-4 my-2 sticky top-[116px] z-[80] -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 bg-neutral-50/90 px-4 py-3 backdrop-blur-md transition-transform duration-300 dark:bg-[#0a0a0a]/90 md:top-[120px] md:-mx-8 md:w-[calc(100%+4rem)] md:px-8 ${sectionHeaderTranslation}`}>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] bg-gradient-to-r from-[#0866FF] to-[#00CFFF] bg-clip-text text-transparent select-none">Garage Projects</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                </div>
              )}

              {isAdmin && isAdminView && (
                <AdminToolCard
                  onClick={openNewPrintModal}
                  icon={Box}
                  title="New Project"
                  action="Create"
                  tone="blue"
                  shadow={shadow}
                />
              )}


              {isAdmin && isAdminView && (
                <AdminToolCard
                  onClick={() => setShowFilamentModal(true)}
                  icon={Droplet}
                  title="Inventory Stock"
                  action="Manage"
                  tone="emerald"
                  shadow={shadow}
                />
              )}

              {isAdmin && isAdminView && (
                <AdminToolCard
                  onClick={() => setShowRatesModal(true)}
                  icon={HandCoins}
                  title="Printing Rates"
                  action="Manage"
                  tone="rose"
                  shadow={shadow}
                />
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

              {/* --- Section Divider: Vault (Personal Projects) --- */}
              {(filteredVault.length > 0 || !(isAdmin && isAdminView)) && (
                <div className={`col-span-full first:mt-4 my-2 sticky top-[116px] z-[80] -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 bg-neutral-50/90 px-4 py-3 backdrop-blur-md transition-transform duration-300 dark:bg-[#0a0a0a]/90 md:top-[120px] md:-mx-8 md:w-[calc(100%+4rem)] md:px-8 ${sectionHeaderTranslation}`}>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] bg-gradient-to-r from-[#0866FF] to-[#00CFFF] bg-clip-text text-transparent select-none">User Projects</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                </div>
              )}

              {!(isAdmin && isAdminView) && (
                <button 
                  type="button"
                  onClick={enterEstimating}
                  className={`w-full group relative rounded-[2.2rem] p-[2px] bg-black/5 dark:bg-white/5 transition-all duration-500 lg:hover:-translate-y-1 cursor-pointer overflow-hidden ${shadow}`}
                >
                  <div className="relative rounded-[2.1rem] flex flex-col h-full overflow-hidden bg-white dark:bg-[var(--color-surface)]">
                    <div className="p-3 flex flex-col h-full">
                      <div className="relative aspect-square rounded-2xl overflow-hidden mb-3 shrink-0 flex items-center justify-center bg-blue-600/10 dark:bg-blue-600/20">
                        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-cyan-400 text-white shadow-xl shadow-blue-600/20 transition-transform group-hover:scale-105">
                          <Calculator size={40} className="group-hover:rotate-12 transition-transform" />
                          <div className={`absolute -top-1 -right-1 rounded-full p-1 border-2 ${
                              estimationLimitReached ? 'bg-blue-300 border-blue-600' : 'bg-cyan-300 border-blue-600'
                          }`}>
                            {estimationLimitReached ? <Lock size={12} strokeWidth={4} /> : <Plus size={12} strokeWidth={4} />}
                          </div>
                        </div>
                      </div>

                      <div className="px-1 text-center flex-1 flex flex-col min-w-0">
                        <div className="h-[2.5em] flex items-center justify-center min-w-0">
                          <span className="text-[13px] font-bold uppercase tracking-tighter leading-tight text-blue-600 dark:text-blue-400 transition-colors">
                            NEW PROJECT
                          </span>
                        </div>

                        <div className="mt-auto min-w-0 min-h-[50px] flex items-center pb-1">
                          <div className="h-9 w-full rounded-full flex items-center justify-center gap-1.5 bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/40 transition-all group-hover:from-blue-600 group-hover:to-cyan-500">
                            <Rocket size={14} strokeWidth={2.5} />
                            <span className="text-[10px] font-black uppercase tracking-widest">ESTIMATE</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
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
