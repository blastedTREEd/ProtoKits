import React, { useEffect, useMemo, useState } from 'react';
import { Gift, Image as ImageIcon, Settings, Sparkles, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { useTheme } from '../../context/ThemeContext';
import DealDetailsModal from '../kitcards/DealDetailsModal';
import ProductCard from '../kitcards/ProductCard';
import ProjectCard from '../calculator/ProjectCard';
import { getDealGrabLabel } from '../../utils/dealSavings';
import { getCheckoutPaymentFees } from '../../utils/paymentSettings';
import { getPrintedProjectModelName } from '../../utils/printedProjectName';
import UniversalImage from '../common/UniversalImage';
import { isFlexiBundleDeal, isPerKitClearanceDeal, getActiveClearanceKitIds, getClearanceDisplayLabel } from '../../utils/dealTypes';
import { getBundleDisplayTotals } from '../../utils/bundleDisplayPricing';
import { APP_CONFIG } from '../../appConfig';
import { isCombinedMarket } from '../../utils/marketVisibility';

const BUNDLE_TYPES = new Set(['bundle_only', 'bundle_discount']);

function getDealEndDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.toMillis === 'function') return new Date(value.toMillis());
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  if (value instanceof Date) return value;

  const [datePart, timePart = '00:00'] = String(value).split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  if (![year, month, day, hours, minutes].every(Number.isFinite)) return null;
  return new Date(year, month - 1, day, hours, minutes);
}

function isPurchasableStock(stock, source = 'onhand') {
  const orderReference = stock?.order;
  const hasOrderAssociation = Boolean(
    orderReference
    && (typeof orderReference !== 'object'
      || orderReference.orderId
      || orderReference.orderDocId
      || orderReference.id
      || Object.keys(orderReference).length > 0)
  );
  if (!stock || hasOrderAssociation || stock.isReserved) return false;
  const status = String(stock.status || '').toLowerCase().trim();
  const isPreOrder = status.includes('pre') || status.includes('batch') || status.includes('eta');
  const isOnhand = status === 'onhand' || status === 'on hand';
  return source === 'preorder' ? isPreOrder : isOnhand;
}

function getGridImageMeta(kit) {
  const images = Array.isArray(kit?.images) ? kit.images : [];
  const gridImage = kit?.image;
  const imageId = typeof gridImage === 'string' ? gridImage : gridImage?.id;
  const imageUrl = typeof gridImage === 'string' ? gridImage : gridImage?.url;

  return images.find((image) => image?.id === imageId || image?.url === imageUrl)
    || (typeof gridImage === 'object' ? gridImage : null);
}

function resolveKitImage(kit) {
  const gridImage = kit?.image;
  if (typeof gridImage === 'string' && gridImage) return gridImage;
  if (gridImage?.url) return gridImage.url;

  return (Array.isArray(kit?.images) ? kit.images : [])
    .map((image) => typeof image === 'string' ? image : image?.url)
    .find(Boolean)
    || '/snorlaxgarage.png';
}

function isBoxArtKitCard(card) {
  return card?.type === 'kit'
    && String(getGridImageMeta(card.kit)?.type || '').trim().toUpperCase() === 'BOX ART';
}

function isNamedProjectWithDisplayImage(project) {
  const name = String(project?.projectName || '').trim().toLowerCase();
  const image = typeof project?.image === 'string' ? project.image.trim() : project?.image?.url;
  const hasName = name
    && name !== 'unnamed project'
    && !/^project\s*#(?:\s*\d+)?$/.test(name);

  return Boolean(hasName && image);
}

function getBundleKitIds(deal) {
  return Array.isArray(deal?.kitIds) ? deal.kitIds : [];
}

function getClearanceKitIds(deal) {
  return Array.isArray(deal?.clearanceKitIds) && deal.clearanceKitIds.length > 0
    ? deal.clearanceKitIds
    : getBundleKitIds(deal);
}

function getTimestamp(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getPreviewTileClass(total, index) {
  if (total === 1) return 'col-span-2 row-span-2';
  if (total === 2) return 'col-span-2';
  if (total === 3 && index === 0) return 'col-span-2';
  return '';
}

function getSpectralGradient(id) {
  const gradients = [
    'from-rose-500 to-orange-500',
    'from-orange-500 to-amber-500',
    'from-emerald-500 to-teal-500',
    'from-cyan-500 to-blue-500',
    'from-indigo-500 to-purple-500',
    'from-fuchsia-500 to-pink-500',
    'from-blue-600 to-indigo-600',
    'from-violet-500 to-purple-500'
  ];
  const value = String(id || 'bundle');
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return gradients[Math.abs(hash) % gradients.length];
}

function getShadowColor(gradientClass) {
  const colors = {
    'from-rose-500 to-orange-500': 'rgba(244, 63, 94, 0.2)',
    'from-orange-500 to-amber-500': 'rgba(249, 115, 22, 0.2)',
    'from-emerald-500 to-teal-500': 'rgba(16, 185, 129, 0.2)',
    'from-cyan-500 to-blue-500': 'rgba(6, 182, 212, 0.2)',
    'from-indigo-500 to-purple-500': 'rgba(99, 102, 241, 0.2)',
    'from-fuchsia-500 to-pink-500': 'rgba(217, 70, 239, 0.2)',
    'from-blue-600 to-indigo-600': 'rgba(37, 99, 235, 0.2)',
    'from-violet-500 to-purple-500': 'rgba(139, 92, 246, 0.2)'
  };
  return colors[gradientClass] || 'rgba(8,102,255,0.2)';
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomizeFeedCards(cards, limit = 10) {
  const projectCards = cards.filter((card) => card.type === 'project');
  const nonProjectCards = cards.filter((card) => card.type !== 'project');
  const projectLimit = Math.min(projectCards.length, nonProjectCards.length + 1, limit);
  const selectedProjects = projectCards.slice(0, projectLimit);
  const selectedNonProjects = nonProjectCards.slice(0, Math.max(0, limit - selectedProjects.length));
  const shuffle = (items, salt) => [...items].sort((a, b) => (
    stableHash(`${salt}:${a.id}`) - stableHash(`${salt}:${b.id}`)
  ));
  const remainingCards = shuffle([...selectedProjects, ...selectedNonProjects], 'cards');
  const reorderedCards = [];

  while (remainingCards.length > 0) {
    const previousCard = reorderedCards[reorderedCards.length - 1];
    const validCards = remainingCards.filter((card) => {
      if (!previousCard) return true;
      if (card.type === 'project' && previousCard.type === 'project') return false;
      return !(isBoxArtKitCard(card) && isBoxArtKitCard(previousCard));
    });
    const candidates = validCards.length > 0 ? validCards : remainingCards;
    const nextCard = candidates[0];
    reorderedCards.push(nextCard);
    remainingCards.splice(remainingCards.indexOf(nextCard), 1);
  }

  return reorderedCards;
}

export default function BundleHighlights() {
  const showKitHighlights = isCombinedMarket(APP_CONFIG.market) || APP_CONFIG.market === 'kits';
  const showPrintHighlights = isCombinedMarket(APP_CONFIG.market) || APP_CONFIG.market === 'prints';
  const deals = useStore((state) => state.deals);
  const activePath = useStore((state) => state._activePath);
  const kits = useStore((state) => (
    activePath === '/'
      ? (state.homeKits || [])
      : (state.kits || [])
  ));
  const blueprints = useStore((state) => (
    activePath === '/'
      ? (state.homeBlueprints || [])
      : (state.blueprints || [])
  ));
  const printedProjects = useStore((state) => state.printedProjects || []);
  const isAdmin = useStore((state) => state.isAdmin);
  const isAdminView = useStore((state) => state.isAdminView);
  const addToBasket = useStore((state) => state.addToBasket);
  const addProjectToBasket = useStore((state) => state.addProjectToBasket);
  const setToastMessage = useStore((state) => state.setToastMessage);
  const shippingSettings = useStore((state) => state.shippingSettings);
  const user = useStore((state) => state.user);
  const isAnonymousUser = useStore((state) => state.isAnonymousUser);
  const _datasetStatus = useStore((state) => state._datasetStatus);
  const navigate = useNavigate();
  const { isDarkMode, isSpectralMode } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  const [selectedDeal, setSelectedDeal] = useState(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeBundles = useMemo(() => {
    const kitMap = new Map((kits || []).map((kit) => [String(kit.id), kit]));
    return (deals || [])
      .filter((deal) => {
        if (!showKitHighlights) return false;
        if (!BUNDLE_TYPES.has(deal?.type) || deal.isActive === false) return false;
        const endDate = getDealEndDate(deal.validUntil);
        if (endDate && endDate.getTime() <= now) return false;

        const kitIds = getBundleKitIds(deal);
        if (kitIds.length === 0) return false;

        // Keep this section aligned with the Kits page: a bundle is shown only
        // when every included kit can still allocate a stock for the deal.
        return kitIds.every((kitId) => {
          const kit = kitMap.get(String(kitId));
          return Object.values(kit?.stocks || {}).some((stock) => (
            isPurchasableStock(stock, deal.stockSource || 'onhand')
          ));
        });
      })
      .map((deal) => ({
        ...deal,
        previewKits: getBundleKitIds(deal)
          .map((kitId) => kitMap.get(String(kitId)))
          .filter(Boolean)
          .slice(0, 4)
      }))
      .sort((a, b) => {
        const aEnd = getDealEndDate(a.validUntil)?.getTime() || Number.MAX_SAFE_INTEGER;
        const bEnd = getDealEndDate(b.validUntil)?.getTime() || Number.MAX_SAFE_INTEGER;
        return aEnd - bEnd;
      });
  }, [deals, kits, now, showKitHighlights]);

  const fillerCards = useMemo(() => {
    const usedKitIds = new Set();
    const usedProjectIds = new Set();
    const cards = [];
    const kitMap = new Map((kits || []).map((kit) => [String(kit.id), kit]));

    const isPubliclyReleased = (stock) => {
      const releaseTime = getTimestamp(stock?.publicReleaseDate);
      return !releaseTime || releaseTime <= now;
    };

    const getMatchingStock = (kit, source) => Object.entries(kit?.stocks || {})
      .map(([key, stock]) => ({ key, ...(stock || {}) }))
      .filter((stock) => isPubliclyReleased(stock) && isPurchasableStock(stock, source))
      .sort((a, b) => getTimestamp(b.lastUpdated || b.createdAt) - getTimestamp(a.lastUpdated || a.createdAt))[0] || null;

    const hasActiveFreeShipping = (stock) => {
      if (!stock?.isFreeShippingEligible) return false;
      if (!stock?.freeShippingMethod || stock.freeShippingMethod === 'All') return false;
      const expiry = getTimestamp(stock.freeShippingUntil);
      return !expiry || expiry > now;
    };

    // Priority 1: kits with an active clearance discount. Clearance takes
    // precedence when a kit also belongs to an active bundle deal.
    (deals || [])
      .filter((deal) => {
        if ((!isFlexiBundleDeal(deal) && !isPerKitClearanceDeal(deal)) || deal.isActive === false) return false;
        return getActiveClearanceKitIds(deal, getClearanceKitIds(deal), now).length > 0;
      })
      .sort((a, b) => (
          (getDealEndDate(a.validUntil)?.getTime() || Number.MAX_SAFE_INTEGER) -
          (getDealEndDate(b.validUntil)?.getTime() || Number.MAX_SAFE_INTEGER)
      ))
      .forEach((deal) => {
        getActiveClearanceKitIds(deal, getClearanceKitIds(deal), now).forEach((kitId) => {
          const kit = kitMap.get(String(kitId));
          const stock = getMatchingStock(kit, 'onhand');
          if (!kit?.id || !stock || usedKitIds.has(String(kit.id))) return;
          usedKitIds.add(String(kit.id));
          cards.push({ type: 'kit', id: `clearance:${deal.id}:${kit.id}`, kit, stock, label: getClearanceDisplayLabel(deal) });
       });
      });

    // Priority 2: only the first kit represents each active bundle deal in
    // Highlights. The full bundle remains available from the deal modal.
    activeBundles.forEach((deal) => {
      const stockSource = deal.stockSource || 'onhand';
      getBundleKitIds(deal).slice(0, 1).forEach((kitId) => {
        const kit = kitMap.get(String(kitId));
        const stock = getMatchingStock(kit, stockSource);
        if (!kit?.id || !stock || usedKitIds.has(String(kit.id))) return;
        usedKitIds.add(String(kit.id));
        cards.push({ type: 'kit', id: `bundle:${deal.id}:${kit.id}`, kit, stock, label: 'BUNDLE DEAL' });
      });
    });

    // Priority 3: remaining on-hand kits. This runs after clearance so a kit
    // that belongs to both categories keeps the higher-priority label.
    (kits || [])
      .map((kit) => ({ kit, stock: getMatchingStock(kit, 'onhand') }))
      .filter(({ kit, stock }) => stock && kit?.id && !usedKitIds.has(String(kit.id)))
      .sort((a, b) => (
        getTimestamp(b.stock?.lastUpdated || b.stock?.createdAt || b.kit?.lastUpdated || b.kit?.createdAt) -
        getTimestamp(a.stock?.lastUpdated || a.stock?.createdAt || a.kit?.lastUpdated || a.kit?.createdAt)
      ))
      .forEach(({ kit, stock }) => {
        usedKitIds.add(String(kit.id));
        cards.push({ type: 'kit', id: `onhand:${kit.id}`, kit, stock, label: 'ONHAND' });
      });

    // Priority 4: newest public pre-order kits that were not already claimed
    // by a bundle, clearance, or on-hand card.
    (kits || [])
      .map((kit) => ({ kit, stock: getMatchingStock(kit, 'preorder') }))
      .filter(({ kit, stock }) => stock && kit?.id && !usedKitIds.has(String(kit.id)))
      .sort((a, b) => (
        Number(hasActiveFreeShipping(b.stock)) - Number(hasActiveFreeShipping(a.stock)) ||
        getTimestamp(b.stock?.lastUpdated || b.stock?.createdAt || b.kit?.lastUpdated || b.kit?.createdAt) -
        getTimestamp(a.stock?.lastUpdated || a.stock?.createdAt || a.kit?.lastUpdated || a.kit?.createdAt)
      ))
      .forEach(({ kit, stock }) => {
        usedKitIds.add(String(kit.id));
        cards.push({ type: 'kit', id: `preorder:${kit.id}`, kit, stock, label: 'PRE-ORDER' });
      });

    // Priority 5: published Garage Projects explicitly enabled for printing.
    // Missing availability flags are treated as unavailable for Highlights.
    (blueprints || [])
      .filter((project) => (
        project?.isPublished !== false
        && project?.status !== 'Draft'
        && project?.canAddToBasket === true
        && isNamedProjectWithDisplayImage(project)
      ))
      .sort((a, b) => getTimestamp(b.createdAt || b.updatedAt) - getTimestamp(a.createdAt || a.updatedAt))
      .forEach((project) => {
        if (!project?.id || usedProjectIds.has(String(project.id))) return;
        usedProjectIds.add(String(project.id));
        cards.push({ type: 'project', id: `project:${project.id}`, project, label: '3D PROJECT' });
      });

    // Priority 6: printed projects that are actively sellable and have a
    // publicly released on-hand stock item available to allocate.
    (printedProjects || [])
      .map((project) => ({ project, stock: getMatchingStock(project, 'onhand') }))
      .filter(({ project, stock }) => (
        project?.canAddToBasket !== false
        && project?.id
        && stock
      ))
      .sort((a, b) => getTimestamp(
        b.project?.lastUpdated || b.project?.createdAt
      ) - getTimestamp(
        a.project?.lastUpdated || a.project?.createdAt
      ))
      .forEach(({ project, stock }) => {
        const printedProjectKey = `printed:${project.id}`;
        if (usedProjectIds.has(printedProjectKey)) return;
        usedProjectIds.add(printedProjectKey);
        cards.push({
          type: 'project',
          projectType: 'printed',
          id: `printed-project:${project.id}`,
          project,
          stock,
          label: '3D PRINTED'
        });
      });

    // The shared catalog is intentionally loaded once for the home feed, but
    // each product-family app gets a strict market slice of that feed:
    // LIQUIKITS sees kits, KOMIPRINTS sees print projects, and GARAGECORE
    // (plus the legacy combined app) sees both.
    return cards.filter((card) => (
      (showKitHighlights && card.type === 'kit')
      || (showPrintHighlights && card.type === 'project')
    ));
  }, [activeBundles, blueprints, deals, kits, now, printedProjects, showKitHighlights, showPrintHighlights]);

  const displayCards = useMemo(() => {
    // Keep priority selection, then randomize the presentation while using
    // kit/other cards as separators between project cards.
    return randomizeFeedCards(fillerCards, 10);
  }, [fillerCards]);
  const requiredBundleDatasets = [
    // The primary catalog is enough to render the first highlight cards.
    // Deals and printed projects are secondary enrichments that can arrive
    // afterward without blocking the market feed.
    ...(showKitHighlights ? ['homeKits'] : []),
    ...(showPrintHighlights ? ['homeBlueprints'] : [])
  ];
  const bundleDataLoading = displayCards.length === 0 && requiredBundleDatasets.some((key) => (
    (_datasetStatus?.[key] || 'loading') === 'loading'
  ));
  const bundleDataReady = !bundleDataLoading;
  // Keep this section's skeleton visible until every source it uses has
  // settled. This prevents partial cards from being replaced by a different
  // layout while the remaining Firebase snapshots are still arriving.
  const isLoadingBundles = bundleDataLoading;

  if (bundleDataReady && displayCards.length === 0) return null;

  const getFeedVisibility = (index) => {
    // Mobile uses three rows (3 columns). md keeps two rows (4 columns),
    // while sm and lg use two rows (5 columns).
    if (index < 8) return '';
    if (index === 8) return 'md:hidden lg:block';
    if (index === 9) return 'hidden sm:block md:hidden lg:block';
    return 'hidden';
  };

  const handleOpenBundle = (deal) => {
    setSelectedDeal(deal);
  };

  const handleOpenDealKit = (kit) => {
    if (!kit?.id) return;
    setSelectedDeal(null);
    navigate(`/kits/${encodeURIComponent(kit.id)}`);
  };

  const handleDealAction = (deal) => {
    setSelectedDeal(null);
    navigate('/kits', { state: { openDealId: deal.id } });
  };

  const renderDealCard = (deal, visibilityClass = '') => {
    const previewKits = deal.previewKits;
    const includedKitCount = getBundleKitIds(deal).length;
    const remainingCount = Math.max(0, includedKitCount - 4);
    const dealGradient = getSpectralGradient(deal.id);
    const dealShadow = getShadowColor(dealGradient);
    const bundleDisplayTotals = getBundleDisplayTotals(deal, kits, isAdmin && isAdminView);

    return (
      <div
        key={deal.id}
        role="button"
        tabIndex={0}
        onClick={() => handleOpenBundle(deal)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleOpenBundle(deal);
          }
        }}
        className={`${visibilityClass} w-full group relative rounded-[2.2rem] p-[2px] ${isSpectralMode ? `bg-gradient-to-br ${dealGradient}` : 'bg-black/5 dark:bg-white/5'} transition-all duration-500 lg:hover:-translate-y-1 cursor-pointer overflow-hidden`}
        style={{
          boxShadow: isDarkMode
            ? isSpectralMode
              ? `0 20px 25px -5px ${dealShadow}, 0 8px 10px -6px ${dealShadow}`
              : '0 20px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5)'
            : '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)'
        }}
      >
        <div className="relative flex h-full flex-col rounded-[2.1rem] bg-white p-3 dark:bg-[var(--color-surface)]">
          <div className="relative mb-3 aspect-square shrink-0 overflow-hidden rounded-2xl bg-white dark:bg-[var(--color-surface)]">
            <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-1.5">
              {previewKits.length > 0 ? previewKits.map((kit, index) => (
                <div key={kit?.id || index} className={`relative h-full w-full overflow-hidden rounded-xl ${getPreviewTileClass(previewKits.length, index)}`}>
                  <UniversalImage src={resolveKitImage(kit)} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" alt="" />
                  {index === 3 && remainingCount > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-[14px] font-bold italic text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">+{remainingCount}</div>
                  )}
                </div>
              )) : (
                <div className="col-span-2 flex items-center justify-center text-emerald-600 opacity-20"><Gift size={40} strokeWidth={1} /></div>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col px-1 text-center">
            <div className="hidden" aria-hidden="true">
              <h3 className="line-clamp-2 w-full text-[14px] font-bold uppercase leading-tight tracking-tighter transition-colors group-hover:text-emerald-600" title={deal.name}>
                {deal.name}
              </h3>
            </div>
            <div className="hidden" aria-hidden="true">
              <div className="flex w-full min-w-0 items-center justify-between gap-2 pb-1">
                <div className="flex min-w-0 flex-1 flex-col items-start pb-1 text-left">
                  <span className={`block w-full truncate text-[14px] font-bold uppercase tracking-tighter ${isAdmin && isAdminView ? 'text-blue-500 dark:text-blue-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                    {isAdmin && isAdminView ? 'EDIT DEAL' : getDealGrabLabel(deal, bundleDisplayTotals)}
                  </span>
                  {isAdmin && isAdminView ? (
                    <>
                      <span className="text-[14px] font-bold italic leading-none tracking-tighter line-through text-neutral-900 dark:text-white">₱{bundleDisplayTotals.discountedPrice.toLocaleString()}</span>
                      <span className="text-[14px] font-bold italic leading-none tracking-tighter text-blue-600 dark:text-blue-400">₱{bundleDisplayTotals.costTotal.toLocaleString()}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[14px] font-bold italic leading-none tracking-tighter text-emerald-500 dark:text-emerald-400">₱{bundleDisplayTotals.discountedPrice.toLocaleString()}</span>
                      <span className="text-[14px] font-bold italic leading-none tracking-tighter line-through text-neutral-900 dark:text-white">₱{bundleDisplayTotals.sellTotal.toLocaleString()}</span>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDealAction(deal);
                  }}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow-lg transition-all active:scale-95 lg:hover:scale-110 ${isAdmin && isAdminView ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/40' : 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/40'}`}
                  title={isAdmin && isAdminView ? 'Edit Deal' : 'Grab Deal'}
                  aria-label={isAdmin && isAdminView ? 'Edit deal' : 'Grab deal'}
                >
                  {isAdmin && isAdminView ? <Settings size={14} /> : <Zap size={14} fill="currentColor" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleHomeKitZap = (event, kit) => {
    event?.stopPropagation();
    if (!kit?.id) return;
    navigate(`/kits/${encodeURIComponent(kit.id)}`);
  };

  const handleHomeProjectZap = (event, project) => {
    event?.stopPropagation();
    if (!project?.id) return;
    navigate(`/prints/${encodeURIComponent(project.id)}`);
  };

  const handleProjectBasketAction = async (event, project) => {
    event?.stopPropagation();
    if (project?.canAddToBasket === false) return;

    try {
      await addProjectToBasket(project);
      setToastMessage(isAdmin && isAdminView ? 'Added to shelf!' : 'Added to cart!');
    } catch (error) {
      console.error('Failed to add highlighted project to basket:', error);
      alert(error?.message || 'Unable to add project to basket.');
      throw error;
    }
  };

  const getPrintedProjectStock = (project) => Object.entries(project?.stocks || {})
    .map(([key, stock]) => ({ key, ...(stock || {}) }))
    .find((stock) => {
      if (!isPurchasableStock(stock, 'onhand')) return false;
      const releaseTime = getTimestamp(stock.publicReleaseDate);
      return !releaseTime || releaseTime <= now;
    });

  const handlePrintedProjectBasketAction = async (event, project) => {
    event?.stopPropagation();
    const stock = getPrintedProjectStock(project);
    if (!project?.id || !stock || project?.canAddToBasket === false) return;

    try {
      await addToBasket({
        id: project.id,
        stockKey: stock.key,
        type: 'kit',
        name: getPrintedProjectModelName(project)
      });
      setToastMessage(isAdmin && isAdminView ? 'Added to shelf!' : 'Added to cart!');
    } catch (error) {
      console.error('Failed to add highlighted printed project to basket:', error);
      alert(error?.message || 'Unable to add printed project to basket.');
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
    if (project?.selectedDesignService) name += ' (w/ Design Service)';

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

  const handleProjectOrderNow = (project) => {
    const checkoutItems = [buildCheckoutProjectItem(project)];
    if (!(isAdmin && isAdminView)) {
      navigate('/checkout', { state: { items: checkoutItems, isGuestPreview: !user || isAnonymousUser } });
    }
  };

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

  const handlePrintedProjectOrderNow = (project) => {
    const stock = getPrintedProjectStock(project);
    if (!stock) return;
    if (isAdmin && isAdminView) {
      void handlePrintedProjectBasketAction(null, project);
      return;
    }
    navigate('/checkout', {
      state: {
        items: [buildPrintedProjectItem(project, stock)],
        isGuestPreview: !user || isAnonymousUser
      }
    });
  };

  const renderFillerCard = (card, visibilityClass) => {
    const isProject = card.type === 'project';
    const item = isProject ? card.project : card.kit;
    const previewKit = item;
    const isPrintedProject = isProject && card.projectType === 'printed';
    const itemName = isPrintedProject
      ? getPrintedProjectModelName(item)
      : isProject
        ? (item?.projectName || 'Garage Project')
        : (item?.name || 'Untitled Kit');

    return (
      <div key={card.id} className={`${visibilityClass} relative w-full`}>
        {isProject ? (
          <ProjectCard
            project={item}
            type={isPrintedProject ? 'printed' : 'blueprint'}
            showManagementActions={false}
            onBasketAction={isPrintedProject ? handlePrintedProjectBasketAction : handleProjectBasketAction}
            onOrderNow={isPrintedProject ? handlePrintedProjectOrderNow : handleProjectOrderNow}
            homeZapAction={handleHomeProjectZap}
            homePreview
          />
        ) : (
          <ProductCard
            kit={previewKit}
            homeZapAction={handleHomeKitZap}
            onEdit={() => navigate('/kits')}
            homePreview
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 rounded-b-[1.5rem] bg-gradient-to-t from-black/95 via-black/65 to-transparent px-3 pb-3 pt-12 text-left text-white">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-white sm:text-[12px]">
            {card.label}
          </p>
          <p className="line-clamp-2 text-[12px] font-bold uppercase leading-tight tracking-tight text-white sm:text-[14px]">
            {itemName}
          </p>
        </div>
      </div>
    );
  };

  return (
    <section className="relative overflow-visible border-t border-black/[0.06] bg-neutral-50 px-5 pb-10 dark:border-white/[0.08] dark:bg-[#111111] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="sticky top-[56px] z-[80] -mx-5 mb-4 flex flex-nowrap items-center justify-between gap-2 border-b border-black/5 bg-neutral-50/95 px-5 py-4 backdrop-blur-md sm:top-[60px] sm:-mx-8 sm:gap-4 sm:px-8 lg:-mx-12 lg:px-12 dark:border-white/5 dark:bg-[#111111]/95">
          <h2 className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap text-[clamp(18px,6vw,25px)] font-black italic uppercase leading-none tracking-[-0.06em] text-neutral-950 dark:text-white">
            <span className="text-garage-blue">Garage</span>
            <span>Highlights</span>
            <Sparkles className="shrink-0 text-black dark:text-white" size={16} strokeWidth={2.5} aria-hidden="true" />
          </h2>

        </div>

        {isLoadingBundles ? (
          <div className="grid min-h-[300px] grid-cols-3 items-start gap-2 sm:grid-cols-5 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={`bundle-skeleton-${index}`} className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-black/[0.05] bg-neutral-200 p-1 shadow-sm animate-pulse dark:border-2 dark:border-neutral-500 dark:bg-neutral-900">
                <div className="relative h-full w-full overflow-hidden rounded-[1.3rem] bg-black/5 dark:bg-white/5">
                  <UniversalImage src="" alt="" aria-hidden="true" className="h-full w-full object-contain p-8 opacity-30" />
                  <div className="absolute inset-x-3 bottom-3 space-y-2">
                    <div className="h-2 w-2/3 rounded-full bg-black/10 dark:bg-white/10" />
                    <div className="h-3 w-1/2 rounded-full bg-black/10 dark:bg-white/10" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid min-h-[300px] content-start grid-cols-3 items-start gap-2 sm:min-h-[300px] sm:grid-cols-5 sm:gap-4 md:min-h-[460px] md:grid-cols-4 lg:min-h-[500px] lg:grid-cols-5 xl:min-h-[620px] 2xl:min-h-[664px]">
            {displayCards.map((card, index) => {
              const visibilityClass = getFeedVisibility(index);
              return card.type === 'deal'
                ? renderDealCard(card.deal, visibilityClass)
                : renderFillerCard(card, visibilityClass);
            })}
          </div>
        )}

        {!isLoadingBundles && displayCards.length === 0 && (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-black/10 bg-white/70 px-6 text-center dark:border-white/10 dark:bg-white/[0.03]">
            <ImageIcon className="mb-4 text-garage-blue" size={26} />
            <p className="text-sm font-black uppercase tracking-[0.18em] text-neutral-900 dark:text-white">Bundle deals are loading in</p>
          </div>
        )}
      </div>

      <DealDetailsModal
        isOpen={Boolean(selectedDeal)}
        onClose={() => setSelectedDeal(null)}
        deal={selectedDeal}
        onBuyNow={handleDealAction}
        onAddToBasket={handleDealAction}
        onOpenKit={handleOpenDealKit}
        isEditMode={isAdmin && isAdminView}
        onEditDeal={handleDealAction}
      />

    </section>
  );
}
