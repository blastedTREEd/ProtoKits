import React, { useState, useMemo, useEffect, useRef, Suspense, lazy } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import PageTemplate from './PageTemplate';
import useNavbarHeight from '../hooks/useNavbarHeight';
const PrintsCalculator = lazy(() => import('../components/calculator/PrintsCalculator'));
import ProjectCard from '../components/calculator/ProjectCard';
import PrintedProjectCard from '../components/calculator/PrintedProjectCard';
const PrintedProjectModal = lazy(() => import('../components/calculator/PrintedProjectModal'));
import { useStore } from '../store/useStore';
import { useTheme } from '../context/ThemeContext';
import { Droplet, Calculator, Search, Box, Layers, X, HandCoins, MoreHorizontal, Printer, ClockFading, ArrowBigDownDash, ArrowBigUpDash, ArrowBigRightDash, ArrowBigLeftDash, ChevronDown, PackagePlus } from 'lucide-react';
const FilamentManagerModal = lazy(() => import('../components/calculator/FilamentManagerModal'));
const PrinterManagerModal = lazy(() => import('../components/calculator/PrinterManagerModal'));
const RatesManagerModal = lazy(() => import('../components/calculator/RatesManagerModal'));
import ProductCardSkeleton from '../components/common/ProductCardSkeleton';
import { getCheckoutPaymentFees } from '../utils/paymentSettings';
import { getPrintedProjectModelName } from '../utils/printedProjectName';

const isPrintListing = (project) => (
  project?.source === 'admin-print'
  || project?.source === 'admin-estimate'
  || project?.listingType === 'print'
  || (!!project?.production && (!!project?.image || (Array.isArray(project?.images) && project.images.length > 0)))
);

const isUnnamedGarageProject = (project) => {
  const name = String(project?.projectName || '').trim().toLowerCase();
  return !name
    || name === 'unnamed project'
    || /^project\s*#(?:\s*\d+)?$/.test(name);
};

const getProjectSortTime = (project) => {
  const value = project?.updatedAt || project?.createdAt || project?.dateCreated || project?.date || 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const getProjectSortPrice = (project) => (
  Number.parseFloat(String(project?.totals?.total || project?.sellPrice || project?.price || 0).replace(/,/g, '')) || 0
);

const getProjectSortName = (project) => (
  project?.isPrintedProject || project?.productType === 'printed-project'
    ? getPrintedProjectModelName(project)
    : (project?.projectName || project?.name || '')
);

const getProjectSortStock = (project) => {
  if (project?.isPrintedProject || project?.productType === 'printed-project') {
    const hasAvailableStock = Object.values(project?.stocks || {}).some((stock) => (
      !stock?.isReserved && !stock?.order?.orderId
    ));
    return Number(project?.canAddToBasket !== false && hasAvailableStock);
  }
  return Number(project?.canAddToBasket !== false);
};

const sortPrintProjects = (projects, sortType) => [...projects].sort((a, b) => {
  switch (sortType) {
    case 'price-asc':
      return getProjectSortPrice(a) - getProjectSortPrice(b);
    case 'price-desc':
      return getProjectSortPrice(b) - getProjectSortPrice(a);
    case 'alpha-asc':
      return getProjectSortName(a).localeCompare(getProjectSortName(b));
    case 'alpha-desc':
      return getProjectSortName(b).localeCompare(getProjectSortName(a));
    case 'avail-asc':
      return getProjectSortStock(a) - getProjectSortStock(b);
    case 'avail-desc':
      return getProjectSortStock(b) - getProjectSortStock(a);
    case 'latest':
    default:
      return getProjectSortTime(b) - getProjectSortTime(a);
  }
});

function ProjectEstimationCard({ onClick, shadow }) {
  const { isDarkMode } = useTheme();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full group relative rounded-[2.2rem] p-[2px] ${isDarkMode ? 'bg-gradient-to-br from-blue-500 via-cyan-400 to-indigo-600' : 'bg-black/5'} transition-all duration-500 lg:hover:-translate-y-1 cursor-pointer overflow-hidden ${shadow}`}
      aria-label="Start a new project estimation"
    >
      <div className="relative rounded-[2.1rem] flex flex-col h-full overflow-hidden bg-white dark:bg-[var(--color-surface)]">
        <div className="p-3 flex flex-col h-full">
          <div className="relative aspect-square rounded-2xl overflow-hidden mb-3 shrink-0 grid grid-cols-2 grid-rows-2 gap-2 bg-blue-600/10 p-2 dark:bg-blue-600/20">
            <div className="row-span-2 flex items-center justify-center rounded-xl bg-white/70 text-blue-600 shadow-sm dark:bg-white/10 dark:text-blue-400">
              <Calculator size={32} strokeWidth={2.25} />
            </div>
            <div className="row-span-2 grid grid-rows-2 gap-2">
              <div className="flex items-center justify-center rounded-xl bg-white/70 text-blue-600 shadow-sm dark:bg-white/10 dark:text-blue-400">
                <Box size={24} strokeWidth={2.25} />
              </div>
              <div className="flex items-center justify-center rounded-xl bg-white/70 text-blue-600 shadow-sm dark:bg-white/10 dark:text-blue-400">
                <Layers size={24} strokeWidth={2.25} />
              </div>
            </div>
          </div>

          <div className="px-1 text-center flex-1 flex flex-col">
            <div className="h-[2em] flex items-center justify-center min-w-0 mb-3">
              <h3 className="text-[15px] font-bold uppercase tracking-tighter leading-tight text-blue-600 dark:text-blue-400 transition-colors">
                PROJECT COST ESTIMATION
              </h3>
            </div>

            <div className="mt-auto">
              <div className="h-9 w-full rounded-full flex items-center justify-center gap-1.5 bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/40 transition-all group-hover:from-blue-600 group-hover:to-cyan-500">
                <span className="text-[15px] font-bold uppercase tracking-tighter leading-none">START NEW</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function Prints() {
  const navbarHeight = useNavbarHeight();
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId: routeProjectId } = useParams();
  const [viewMode, setViewMode] = useState('idle');
  const [modifyingProject, setModifyingProject] = useState(null);
  const [editingPrintedProject, setEditingPrintedProject] = useState(null);
  const [reopenProjectRequest, setReopenProjectRequest] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortType, setSortType] = useState('latest');
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortRef = useRef(null);

  useEffect(() => {
    const handler = setTimeout(() => {
        setSearchTerm(searchTerm);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isContentHeaderHidden, setIsContentHeaderHidden] = useState(false);
  const contentHeaderScrollRef = useRef({ previousY: window.scrollY, frame: 0, hidden: false, direction: 0, distance: 0 });

  useEffect(() => {
    const scrollState = contentHeaderScrollRef.current;
    const handleContentHeaderScroll = () => {
      if (scrollState.frame) return;

      scrollState.frame = window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY;
        const previousScrollY = scrollState.previousY;
        const delta = currentScrollY - previousScrollY;
        const direction = delta > 0 ? 1 : delta < 0 ? -1 : scrollState.direction;

        if (direction !== scrollState.direction) {
          scrollState.distance = Math.abs(delta);
        } else if (direction !== 0) {
          scrollState.distance += Math.abs(delta);
        }
        scrollState.direction = direction;

        let nextHidden = scrollState.hidden;
        if (window.innerWidth >= 768 || currentScrollY <= 8) {
          nextHidden = false;
        } else if (direction === 1 && scrollState.distance >= 2) {
          nextHidden = true;
        } else if (direction === -1 && scrollState.distance >= 12) {
          nextHidden = false;
        }

        if (nextHidden !== scrollState.hidden) {
          scrollState.hidden = nextHidden;
          setIsContentHeaderHidden(nextHidden);
        }
        scrollState.previousY = currentScrollY;
        scrollState.frame = 0;
      });
    };

    window.addEventListener('scroll', handleContentHeaderScroll, { passive: true });
    window.addEventListener('resize', handleContentHeaderScroll, { passive: true });
    return () => {
      if (scrollState.frame) {
        window.cancelAnimationFrame(scrollState.frame);
        scrollState.frame = 0;
      }
      window.removeEventListener('scroll', handleContentHeaderScroll);
      window.removeEventListener('resize', handleContentHeaderScroll);
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      contentHeaderScrollRef.current.hidden = false;
      contentHeaderScrollRef.current.previousY = window.scrollY;
      contentHeaderScrollRef.current.direction = 0;
      contentHeaderScrollRef.current.distance = 0;
      setIsContentHeaderHidden(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (sortRef.current && !sortRef.current.contains(event.target)) {
        setIsSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sectionHeaderStyle = {
    top: `${navbarHeight + (isContentHeaderHidden ? 0 : 60)}px`
  };
  const contentHeaderMotion = 'transition-transform duration-400 ease-in-out motion-reduce:transition-none will-change-transform';
  const sectionHeaderMotion = 'transition-[top] duration-400 ease-in-out motion-reduce:transition-none will-change-[top]';

  const isAdmin = useStore((state) => state.isAdmin);
  const isAdminView = useStore((state) => state.isAdminView);

  const projectVault = useStore((state) => state.projectVault);
  
  const blueprints = useStore((state) => state.blueprints);
  const printedProjects = useStore((state) => state.printedProjects);

  const removeFromVault = useStore((state) => state.removeFromVault);
  const updateProjectInVault = useStore((state) => state.updateProjectInVault);
  const updateBlueprint = useStore((state) => state.updateBlueprint);
  const addProjectToBasket = useStore((state) => state.addProjectToBasket);
  const deleteBlueprint = useStore((state) => state.deleteBlueprint);
  const addPrintedProject = useStore((state) => state.addPrintedProject);
  const updatePrintedProject = useStore((state) => state.updatePrintedProject);
  const deletePrintedProject = useStore((state) => state.deletePrintedProject);
  const addToBasket = useStore((state) => state.addToBasket);
  const printsStatus = useStore((state) => state._datasetStatus?.prints || 'loading');
  const printedProjectsStatus = useStore((state) => state._datasetStatus?.printedProjects || 'loading');
  const filamentInventory = useStore((state) => state.filamentInventory);
  const isPrintsDataLoading = printsStatus === 'loading';
  const isPrintedProjectsLoading = printedProjectsStatus === 'loading';
  const loadBlueprints = useStore((state) => state.loadBlueprints);
  const loadPrintResources = useStore((state) => state.loadPrintResources);
  const subscribeOrders = useStore((state) => state.subscribeOrders);
  const user = useStore((state) => state.user);
  const isAnonymousUser = useStore((state) => state.isAnonymousUser);
  const setToastMessage = useStore((state) => state.setToastMessage);
  const shippingSettings = useStore((state) => state.shippingSettings);
  
  const [showFilamentModal, setShowFilamentModal] = useState(false);
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [showRatesModal, setShowRatesModal] = useState(false);

  const openCheckoutPage = (items, isGuestPreview = !user || isAnonymousUser) => {
    navigate('/checkout', { state: { items, isGuestPreview } });
  };

  const shadow = isDarkMode 
    ? 'shadow-[0_8px_30px_rgba(0,0,0,0.5)]' 
    : 'shadow-[0_4px_12px_rgba(0,0,0,0.05)]';

  // The public prints catalog only needs blueprints and printed projects.
  // Printer/inventory/rate listeners are opened when the calculator or an
  // admin resource tool is actually used, which avoids six always-on reads
  // for every guest who visits /prints.
  const shouldLoadPrintResources = (
    (isAdmin && isAdminView)
    || viewMode !== 'idle'
    || showFilamentModal
    || showPrinterModal
    || showRatesModal
  );
  const printResourcesCleanupRef = useRef(null);

  useEffect(() => {
    loadBlueprints();
    if (shouldLoadPrintResources && !printResourcesCleanupRef.current) {
      printResourcesCleanupRef.current = loadPrintResources();
    }
  }, [loadBlueprints, loadPrintResources, shouldLoadPrintResources]);

  useEffect(() => () => {
    printResourcesCleanupRef.current?.();
    printResourcesCleanupRef.current = null;
  }, []);

  useEffect(() => {
    if (!user?.uid) return undefined;

    // Keep the project-card calendar current with pending and other active orders.
    const unsubscribe = subscribeOrders({
      uid: user.uid,
      isAdminMode: isAdmin && isAdminView
    });
    return () => unsubscribe?.();
  }, [subscribeOrders, user?.uid, isAdmin, isAdminView]);

  const filteredBlueprints = useMemo(() => {
    if (!blueprints) return [];
    const printableBlueprints = blueprints
      .filter(isPrintListing)
      .filter((project) => (isAdmin && isAdminView) || !isUnnamedGarageProject(project));
    if (!searchTerm) return printableBlueprints;
    const searchWords = searchTerm.toLowerCase().replace(/[-]/g, ' ').split(/\s+/).filter(Boolean);
    return printableBlueprints.filter(b => {
        const targetString = `${b.projectName || ''}`.toLowerCase().replace(/[-]/g, ' ');
        return searchWords.every(word => targetString.includes(word));
    });
  }, [blueprints, isAdmin, isAdminView, searchTerm]);

  // Public Garage Projects must have a real name. Admin view retains unnamed
  // projects so they can be renamed or otherwise managed.
  const garageProjects = useMemo(() => filteredBlueprints, [filteredBlueprints]);

  const filteredPrintedProjects = useMemo(() => {
    const projects = Array.isArray(printedProjects) ? printedProjects : [];
    if (!searchTerm) return projects;
    const words = searchTerm.toLowerCase().replace(/[-]/g, ' ').split(/\s+/).filter(Boolean);
    return projects.filter((project) => {
      const materialText = (project.materials || [project.material]).map((material) => (
        [material?.brand, material?.type, material?.colorName || material?.name].filter(Boolean).join(' ')
      )).join(' ');
      const dimensions = project.dimensions || {};
      const target = `${project.name || ''} ${project.projectName || ''} ${project.stockNo || ''} ${materialText} ${dimensions.l || dimensions.length || ''} ${dimensions.w || dimensions.width || ''} ${dimensions.h || dimensions.height || ''}`.toLowerCase();
      return words.every((word) => target.includes(word));
    });
  }, [printedProjects, searchTerm]);

  const garageProjectTitles = useMemo(() => {
    const titles = new Map();
    const publishedProjects = (blueprints || []).filter(isPrintListing);
    publishedProjects.forEach((project, index) => {
      if (isUnnamedGarageProject(project) && project?.id) {
        titles.set(String(project.id), `PROJECT #${index + 1}`);
      }
    });
    return titles;
  }, [blueprints]);

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

  const sortedGarageProjects = useMemo(
    () => sortPrintProjects(garageProjects, sortType),
    [garageProjects, sortType]
  );
  const sortedFilteredVault = useMemo(
    () => sortPrintProjects(filteredVault, sortType),
    [filteredVault, sortType]
  );
  const sortedPrintedProjects = useMemo(
    () => sortPrintProjects(filteredPrintedProjects, sortType),
    [filteredPrintedProjects, sortType]
  );
  
  const totalMatches = sortedGarageProjects.length + sortedFilteredVault.length + sortedPrintedProjects.length;

  useEffect(() => {
    if (viewMode === 'estimating' || viewMode === 'printed-project') {
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
    const closeToolsOnScroll = () => {
      setIsToolsOpen(false);
      setIsSortOpen(false);
    };
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

  const getPrintedStock = (project) => Object.entries(project?.stocks || {})
    .map(([key, stock]) => ({ key, ...stock }))
    .find((stock) => !stock?.order?.orderId && !stock?.isReserved);

  const buildPrintedProjectItem = (project, stock) => {
    const { handlingFee, installmentFee, transferFee } = getCheckoutPaymentFees({ shippingSettings });
    const sellPrice = Number(stock?.sellPrice || project?.sellPrice || 0);
    return {
      id: project.id,
      basketId: `checkout_printed_${project.id}_${stock?.key || 'stock'}`,
      type: 'kit',
      quantity: 1,
      name: getPrintedProjectModelName(project),
      image: project.image || '',
      brand: project.brand || 'SNORLAXGARAGE',
      specs: { printedProject: true, ...(project.specifications || {}) },
      price: sellPrice + handlingFee + installmentFee + transferFee,
      sellPrice,
      costPrice: Number(stock?.costPrice || project?.costPrice || 0),
      stockKey: stock?.key,
      stockSource: 'onhand',
      status: 'Onhand',
      minDownpayment: 0,
      appliedHandlingFee: handlingFee,
      appliedInstallmentFee: installmentFee,
      appliedTransferFee: transferFee,
      printedProject: true,
      dimensions: project.dimensions || {},
      materials: project.materials || [project.material].filter(Boolean),
      createdAt: new Date().toISOString()
    };
  };

  const handlePrintedBuyNow = (project, stock) => {
    const selectedStock = stock || getPrintedStock(project);
    if (isAdmin && isAdminView) {
      handlePrintedAddToBasket(project, selectedStock);
      return;
    }
    const item = buildPrintedProjectItem(project, selectedStock);
    openCheckoutPage([item], !user || isAnonymousUser);
  };

  const handlePrintedAddToBasket = async (project, stock) => {
    try {
      await addToBasket({ id: project.id, stockKey: stock?.key, type: 'kit', name: getPrintedProjectModelName(project) });
      setToastMessage(isAdmin && isAdminView ? 'Added to shelf!' : 'Added to cart!');
    } catch (error) {
      alert(error?.message || 'Unable to add printed project to basket.');
    }
  };

  const handleSavePrintedProject = async (payload) => {
    if (editingPrintedProject?.id) {
      await updatePrintedProject(editingPrintedProject.id, payload);
      setToastMessage('Printed project updated!');
    } else {
      await addPrintedProject(payload);
      setToastMessage('Printed project added!');
    }
    setEditingPrintedProject(null);
  };

  const handleEditPrintedProject = (project) => {
    setEditingPrintedProject(project);
    setViewMode('printed-project');
  };

  const handleEstimateUpdate = (payload) => {
    const projectKey = modifyingProject?.vaultId || modifyingProject?.id;
    const update = modifyingProject?.vaultId
      ? updateProjectInVault(modifyingProject.vaultId, payload)
      : modifyingProject?.id
        ? updateBlueprint(modifyingProject.id, payload)
        : Promise.reject(new Error('Missing project id.'));

    update
      .then(() => {
        setViewMode('idle');
        setModifyingProject(null);
        if (projectKey) {
          setReopenProjectRequest({
            key: projectKey,
            token: Date.now()
          });
        }
        window.dispatchEvent(new Event('showNavbar'));
      })
      .catch((error) => alert(error?.message || 'Unable to update estimate.'));
  };

  const handleBasketAction = async (e, project) => {
    e.stopPropagation();
    if (project?.canAddToBasket === false) return;
    try {
      await addProjectToBasket(project);
      setToastMessage(isAdmin && isAdminView ? 'Added to shelf!' : 'Added to cart!');
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
    if (!(isAdmin && isAdminView)) {
      openCheckoutPage(checkoutItems, !user || isAnonymousUser);
    }
  };

  const headerActions = isAdmin && isAdminView
    ? [
        { id: 'printers', label: 'Printers', icon: Printer, tone: 'border-blue-500/20 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20', onClick: () => setShowPrinterModal(true) },
        { id: 'inventory', label: 'Inventory', icon: Droplet, tone: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20', onClick: () => setShowFilamentModal(true) },
        { id: 'printing-rates', label: 'Printing Rates', icon: HandCoins, tone: 'border-rose-500/20 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20', onClick: () => setShowRatesModal(true) },
        { id: 'printed-project', label: 'Add Printed Project', icon: PackagePlus, tone: 'border-violet-500/20 bg-violet-500/10 text-violet-600 hover:bg-violet-500/20', onClick: () => { setEditingPrintedProject(null); setViewMode('printed-project'); } }
      ]
    : [];

  const sortOptions = [
    { id: 'latest', label: 'Latest', icon: ClockFading, active: sortType === 'latest', nextSort: 'latest' },
    { id: 'price-asc', label: 'Price', icon: ArrowBigUpDash, active: sortType === 'price-asc', nextSort: 'price-asc' },
    { id: 'price-desc', label: 'Price', icon: ArrowBigDownDash, active: sortType === 'price-desc', nextSort: 'price-desc' },
    { id: 'name-asc', label: 'Name', icon: ArrowBigRightDash, active: sortType === 'alpha-asc', nextSort: 'alpha-asc' },
    { id: 'name-desc', label: 'Name', icon: ArrowBigLeftDash, active: sortType === 'alpha-desc', nextSort: 'alpha-desc' },
    { id: 'stock-asc', label: 'Stock', icon: ArrowBigUpDash, active: sortType === 'avail-asc', nextSort: 'avail-asc' },
    { id: 'stock-desc', label: 'Stock', icon: ArrowBigDownDash, active: sortType === 'avail-desc', nextSort: 'avail-desc' }
  ];
  const activeSortOption = sortOptions.find(option => option.active) || sortOptions[0];

  const renderHeaderActions = () => headerActions.map(({ id, label, icon, tone, onClick }) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setIsToolsOpen(false);
        onClick();
      }}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center ${id === 'estimate' ? 'rounded-xl' : 'rounded-full'} border shadow-sm transition-all hover:scale-110 active:scale-95 ${tone}`}
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
        <div style={{ top: `${navbarHeight}px` }} className={`sticky z-[100] h-[60px] overflow-visible bg-neutral-50 dark:bg-[#0a0a0a] backdrop-blur-md border-b border-black/5 dark:border-white/5 ${contentHeaderMotion} ${isContentHeaderHidden ? '-translate-y-full md:translate-y-0' : 'translate-y-0'}`}>
          <div className="h-full w-full px-4 md:px-8 flex items-center gap-4">
            
            <div className="flex min-w-0 flex-1 items-center gap-4">
                <div className="relative min-w-0 flex-1">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20 text-neutral-900 dark:text-white" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onFocus={() => setIsToolsOpen(false)}
                      onClick={() => setIsToolsOpen(false)}
                      onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                      placeholder="SEARCH PROJECTS..."
                      className="w-full pl-12 pr-12 py-3 bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl text-[12px] font-bold uppercase tracking-widest placeholder:font-medium outline-none focus:border-blue-500 transition-all"
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
                <div className="relative" ref={sortRef}>
                  <button
                    type="button"
                    onFocus={() => setIsToolsOpen(false)}
                    onClick={() => {
                      setIsToolsOpen(false);
                      setIsSortOpen((isOpen) => !isOpen);
                    }}
                    className={`flex items-center gap-2 px-4 py-3 rounded-2xl border shrink-0 z-10 transition-all active:scale-95 group ${isSortOpen ? 'bg-blue-600 text-white border-blue-600' : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/10 hover:bg-blue-600 hover:text-white'}`}
                    aria-label="Sort projects"
                    aria-expanded={isSortOpen}
                  >
                    {React.createElement(activeSortOption.icon, {
                      size: 20,
                      strokeWidth: 2.5,
                      className: `transition-all ${isSortOpen ? 'text-white' : 'text-black dark:text-white opacity-70'} group-hover:text-white group-hover:opacity-100`
                    })}
                    <span className={`text-[12px] font-bold uppercase tracking-widest hidden sm:inline ${isSortOpen ? 'text-white' : 'text-black dark:text-white'} group-hover:text-white group-hover:opacity-100`}>{activeSortOption.label}</span>
                    <ChevronDown size={12} className={`${isSortOpen ? 'text-white opacity-100' : 'text-black dark:text-white opacity-40'} transition-transform ${isSortOpen ? 'rotate-180' : ''} group-hover:text-white group-hover:opacity-100`} />
                  </button>

                  {isSortOpen && (
                    <div className="absolute right-0 top-full mt-2 w-max min-w-full bg-white dark:bg-neutral-900 border border-black/5 dark:border-white/10 rounded-2xl shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in duration-200">
                      <div className="p-2 space-y-1">
                        {sortOptions.filter(option => !option.active).map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                              setSortType(option.nextSort);
                              setIsSortOpen(false);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[12px] font-bold uppercase tracking-widest transition-all hover:bg-blue-600 hover:text-white"
                          >
                            {React.createElement(option.icon, { size: 20, strokeWidth: 2.5 })}
                            <span className="whitespace-nowrap text-[12px] font-bold">{option.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {searchTerm && (
                  <div className="flex items-center gap-2 px-4 py-3 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/10 shrink-0 z-10">
                    <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest">
                      {totalMatches} MATCHES
                    </span>
                  </div>
                )}
            </div>
            {isAdmin && isAdminView ? (
              <>
                <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
                  {renderHeaderActions()}
                </div>
                <div className="relative z-[100] flex shrink-0 flex-col items-end gap-1.5 lg:hidden">
                  <button
                    type="button"
                    onClick={() => setIsToolsOpen((isOpen) => !isOpen)}
                    className="inline-flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border border-black/10 bg-black/5 text-neutral-700 shadow-sm transition-all hover:scale-105 hover:bg-black/10 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
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
            ) : null}
          </div>
        </div>

        <main className="max-w-full mx-auto px-4 md:px-8">
          {isPrintsDataLoading && totalMatches === 0 ? (
            <div className="grid grid-cols-2 items-stretch gap-4 sm:grid-cols-4 sm:portrait:grid-cols-3 md:grid-cols-4 md:portrait:grid-cols-3 md:gap-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, index) => <ProductCardSkeleton key={`print-skeleton-${index}`} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 sm:portrait:grid-cols-3 md:grid-cols-4 md:portrait:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-3 items-stretch">
              {/* --- Section Divider: Vault (Personal Projects) --- */}
              {(sortedFilteredVault.length > 0 || !(isAdmin && isAdminView)) && (
                <div data-sticky-section style={sectionHeaderStyle} className={`col-span-full first:mt-4 my-2 sticky z-[90] -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 bg-neutral-50 px-4 py-2 backdrop-blur-md dark:bg-[#0a0a0a] md:-mx-8 md:w-[calc(100%+4rem)] md:px-8 ${sectionHeaderMotion}`}>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                  <span className="text-[13px] font-black uppercase tracking-[0.2em] bg-gradient-to-r from-[#0866FF] to-[#00CFFF] bg-clip-text text-transparent select-none">Your Projects</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                </div>
              )}

              {!(isAdmin && isAdminView) && (
                <ProjectEstimationCard onClick={enterEstimating} shadow={shadow} />
              )}

              {sortedFilteredVault.map((project) => {
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
                    reopenRequestToken={reopenProjectRequest?.key === project.vaultId ? reopenProjectRequest.token : null}
                  />
                );
              })}

              {/* --- Section Divider: Garage Projects --- */}
              {((isAdmin && isAdminView) || garageProjects.length > 0) && (
                <div data-sticky-section style={sectionHeaderStyle} className={`col-span-full first:mt-4 my-2 sticky z-[90] -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 bg-neutral-50 px-4 py-2 backdrop-blur-md dark:bg-[#0a0a0a] md:-mx-8 md:w-[calc(100%+4rem)] md:px-8 ${sectionHeaderMotion}`}>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                  <span className="text-[13px] font-black uppercase tracking-[0.2em] bg-gradient-to-r from-[#0866FF] to-[#00CFFF] bg-clip-text text-transparent select-none">Garage Projects</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                </div>
              )}

              {isAdmin && isAdminView && (
                <ProjectEstimationCard onClick={enterEstimating} shadow={shadow} />
              )}

              {sortedGarageProjects.map((project) => {
                return (
                  <ProjectCard 
                    key={project.id}
                    project={project}
                    type="blueprint"
                    fallbackTitle={garageProjectTitles.get(String(project.id))}
                    onBasketAction={handleBasketAction}
                    onOrderNow={handleOrderNow}
                    showManagementActions={isAdmin && isAdminView}
                    onModify={isAdmin && isAdminView ? handleModify : undefined}
                    onDelete={isAdmin && isAdminView ? handleDeletePrintProject : undefined}
                    openOnMount={routeProjectId === project.id}
                    reopenRequestToken={reopenProjectRequest?.key === project.id ? reopenProjectRequest.token : null}
                  />
                );
              })}

              {/* --- Section Divider: Printed Projects --- */}
              {sortedPrintedProjects.length > 0 && (
                <div data-sticky-section style={sectionHeaderStyle} className={`col-span-full first:mt-4 my-2 sticky z-[90] -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 bg-neutral-50 px-4 py-2 backdrop-blur-md dark:bg-[#0a0a0a] md:-mx-8 md:w-[calc(100%+4rem)] md:px-8 ${sectionHeaderMotion}`}>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                  <span className="text-[13px] font-black uppercase tracking-[0.2em] bg-gradient-to-r from-[#0866FF] to-[#00CFFF] bg-clip-text text-transparent select-none">Printed Projects</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#0866FF] via-[#00CFFF] to-transparent" />
                </div>
              )}

              {isPrintedProjectsLoading
                ? Array.from({ length: 5 }).map((_, index) => <ProductCardSkeleton key={`printed-project-skeleton-${index}`} />)
                : sortedPrintedProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    type="printed"
                    fallbackTitle={project.name || project.projectName}
                    onOrderNow={(item) => handlePrintedBuyNow(item || project)}
                    onBasketAction={async (e, item) => {
                      const target = item || project;
                      await handlePrintedAddToBasket(target);
                    }}
                    onModify={isAdmin && isAdminView ? handleEditPrintedProject : undefined}
                    showManagementActions={isAdmin && isAdminView}
                    openOnMount={routeProjectId === project.id}
                    onDelete={(item) => {
                      if (window.confirm(`Delete printed project "${item.name || item.projectName}"?`)) {
                        deletePrintedProject(item.id).catch((error) => alert(error?.message || 'Unable to delete printed project.'));
                      }
                    }}
                  />
                ))}

            </div>
          )}

          {totalMatches === 0 && !isPrintsDataLoading && searchTerm !== "" && (
            <div className="py-20 flex flex-col items-center justify-center opacity-20 text-neutral-900 dark:text-white">
              <Search size={48} strokeWidth={1} />
              <p className="mt-4 font-black uppercase tracking-widest text-sm">No results found for "{searchTerm}"</p>
            </div>
          )}
        </main>
        
        <Suspense fallback={null}>
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
        {viewMode === 'printed-project' && (
          <PrintedProjectModal
            isOpen
            initialProject={editingPrintedProject}
            onClose={() => { setEditingPrintedProject(null); setViewMode('idle'); }}
            estimations={blueprints}
            filamentInventory={filamentInventory}
            onSave={handleSavePrintedProject}
          />
        )}
        </Suspense>
      </div>

      {/* MODALS */}
      <Suspense fallback={null}>
        {showFilamentModal && <FilamentManagerModal onClose={() => setShowFilamentModal(false)} />}
      {showPrinterModal && <PrinterManagerModal onClose={() => setShowPrinterModal(false)} />}
      {showRatesModal && <RatesManagerModal onClose={() => setShowRatesModal(false)} />}
      </Suspense>
    </PageTemplate>
  );
}
