import React, { useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Gift, Zap, ArrowRight, Settings, Package } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { getBundleDealPricing, getClearanceBundlePricing, getFlexiBundlePreviewPricing, getHighestCostStock } from '../../utils/bundlePricing';
import { isFlexiBundleDeal, isPerKitClearanceDeal, getActiveClearanceKitIds, getClearanceDisplayLabel } from '../../utils/dealTypes';

function resolveImage(idOrUrl, imagesArray) {
  if (!idOrUrl) return '';
  if (idOrUrl.startsWith('data:') || idOrUrl.startsWith('http')) return idOrUrl;
  const match = (imagesArray || []).find(img => img.id === idOrUrl);
  return match?.url || '';
}

function getOrderedKits(kits, kitIds) {
  const kitMap = new Map((kits || []).map(kit => [kit.id, kit]));
  return (kitIds || []).map(id => (
    kitMap.get(id) || (kits || []).find(kit => String(kit.id) === String(id))
  )).filter(Boolean);
}

function getDealKitIds(deal) {
  return (isFlexiBundleDeal(deal) || isPerKitClearanceDeal(deal)) && deal.clearanceKitIds?.length
    ? deal.clearanceKitIds
    : (deal?.kitIds || []);
}

function stockMatchesDealSource(stock, source = 'onhand') {
  const status = String(stock?.status || '').toLowerCase();
  const isPreOrder = status.includes('pre') || status.includes('batch');
  return source === 'preorder' ? isPreOrder : !isPreOrder;
}

function isBundlePurchasableStock(stock, source = 'onhand') {
  if (!stock || stock.order?.orderId || !stockMatchesDealSource(stock, source)) return false;
  return !stock.isReserved || stock.reservationType === 'admin';
}

function getDealSourceStock(kit, source = 'onhand') {
  const stocks = Object.values(kit?.stocks || {});
  const purchasableStocks = stocks.filter(stock => isBundlePurchasableStock(stock, source));
  const matchingStocks = stocks.filter(stock => stockMatchesDealSource(stock, source));

  // Match Deal Architect/Kits: use the highest-cost available stock, with
  // sell price as the deterministic tie-breaker. Fall back to a matching
  // stock for historical or sold-out deals so the modal can still render.
  return getHighestCostStock(purchasableStocks)
    || getHighestCostStock(matchingStocks)
    || stocks[0]
    || null;
}

export default function DealDetailsModal({ isOpen, onClose, deal, onBuyNow, onAddToBasket, onOpenKit, isEditMode = false, onEditDeal }) {
  const { kits } = useStore();
  const onCloseRef = useRef(onClose);
  const isEditable = isEditMode && typeof onEditDeal === 'function';
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const includedKits = useMemo(() => {
    if (!deal) return [];
    const dealKitIds = getDealKitIds(deal);
    const orderedKitIds = [
      ...(deal.previewKitIds || []),
      ...dealKitIds.filter(id => !(deal.previewKitIds || []).some(previewId => String(previewId) === String(id)))
    ];
    return getOrderedKits(kits, orderedKitIds);
  }, [deal, kits]);

  // Compute clearance-style pricing for pre-bundled deals.
  const { normalTotal, bundlePrice, savings, kitPricing } = useMemo(() => {
    // The crossed-out comparison amount is the item's standalone sell price.
    // Checkout fees are calculated separately and should not inflate the
    // product price shown in this bundle summary.
    const getDisplayedStandalonePrice = (refPrice) => refPrice;

    if (isFlexiBundleDeal(deal) || isPerKitClearanceDeal(deal)) {
      const pricingRows = includedKits.map(kit => {
        const sourceStock = getDealSourceStock(kit, deal?.stockSource || 'onhand');
        return {
          kit,
          kitId: kit.id,
          refPrice: Number(sourceStock?.sellPrice || kit.sellPrice || 0),
          sellPrice: Number(sourceStock?.sellPrice || kit.sellPrice || 0),
          costPrice: Number(sourceStock?.costPrice || 0)
        };
      });
      const eligibleKitIds = getActiveClearanceKitIds(deal, deal.clearanceKitIds || deal.kitIds || []);
      const clearance = isFlexiBundleDeal(deal)
        ? getFlexiBundlePreviewPricing(pricingRows, eligibleKitIds, deal.clearanceDiscounts || {})
        : getClearanceBundlePricing(pricingRows, eligibleKitIds, deal.clearanceDiscounts || {});
      const adjustedPricing = clearance.rows.map((row) => ({
        ...row,
        distributedPrice: row.finalPrice,
        refPrice: getDisplayedStandalonePrice(row.refPrice)
      }));
      return {
        normalTotal: clearance.totalSell,
        bundlePrice: clearance.bundlePrice,
        savings: Math.max(0, clearance.totalSell - clearance.bundlePrice),
        kitPricing: adjustedPricing
      };
    }
    const pricingRows = includedKits.map(kit => {
      const sourceStock = getDealSourceStock(kit, deal?.stockSource || 'onhand');
      const refPrice = Number(sourceStock?.sellPrice || kit.sellPrice || 0);
      return {
        kit,
        kitId: kit.id,
        refPrice,
        sellPrice: refPrice,
        costPrice: Number(sourceStock?.costPrice || 0)
      };
    });
    const normalTotal = pricingRows.reduce((sum, row) => sum + row.refPrice, 0);
    const discountAmount = Number(
      deal?.bundlePrice !== undefined && deal?.bundlePrice !== null && deal?.bundlePrice !== ''
        ? Math.max(0, normalTotal - Number(deal?.bundlePrice || 0))
        : (deal?.discountAmount ?? 0)
    ) || 0;
    const pricing = getBundleDealPricing(pricingRows, discountAmount).rows.map(row => ({
      ...row,
      distributedPrice: row.finalPrice
    }));

    const adjustedPricing = pricing.map((row) => ({
      ...row,
      refPrice: getDisplayedStandalonePrice(row.refPrice)
    }));

    return {
      normalTotal,
      bundlePrice: pricing.reduce((sum, row) => sum + row.finalPrice, 0),
      savings: pricing.reduce((sum, row) => sum + row.discount, 0),
      kitPricing: adjustedPricing
    };
  }, [includedKits, deal]);


  useEffect(() => {
    if (!isOpen) return undefined;

    const stateKey = `deal-details-modal-${Date.now()}`;
    window.history.pushState({ modalKey: stateKey }, '');

    const handlePopState = () => {
      onCloseRef.current();
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!isOpen || !deal) return null;

  return createPortal((
                <div onClick={(event) => event.stopPropagation()} className="fixed inset-0 z-[300] flex items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 overflow-hidden touch-action-none">
      <div className="bg-[var(--color-surface)] border-0 lg:border border-[var(--color-border)] w-full h-full lg:max-h-[85vh] lg:max-w-2xl rounded-none lg:rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden overscroll-none text-[var(--color-text-main)]">
        
        {/* Mobile sticky close button */}
        <div className="sticky top-0 z-[220] w-full h-0 overflow-visible lg:hidden">
          <div className="absolute top-4 right-4 flex justify-end items-center">
            <button onClick={onClose} className="p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Header */}
        <div className="p-6 lg:p-8 pb-4 flex items-center justify-between shrink-0">
           <div className="flex items-center gap-4 text-left">
              <div className="p-3 bg-emerald-600 rounded-2xl shadow-lg shadow-emerald-600/20">
                 <Gift size={24} className="text-white" />
              </div>
              <div>
                 <h2 className="text-xl font-black uppercase italic leading-none">{(isFlexiBundleDeal(deal) || isPerKitClearanceDeal(deal)) ? getClearanceDisplayLabel(deal) : deal.name}</h2>
                 <span className="text-[12px] font-black uppercase tracking-widest text-emerald-500 mt-2 block">
                    {(isFlexiBundleDeal(deal) || isPerKitClearanceDeal(deal)) ? `${getClearanceDisplayLabel(deal)} Package` : (deal.type === 'bundle_discount' || deal.type === 'bundle_only') ? 'Bundle Only Package' : 'Special Deal Package'}
                  </span>
              </div>
           </div>
           <button onClick={onClose} className="hidden lg:block p-2 hover:bg-black/5 rounded-full transition-colors opacity-40"><X size={24} /></button>
        </div>

        {/* Content - Scrollable & Flex-grow */}
        <div className="p-6 lg:p-8 pt-0 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
           {/* Summary Cards */}
           <div className="grid grid-cols-2 gap-3 shrink-0">
              <div className="bg-black/5 dark:bg-white/5 rounded-3xl p-5 text-left border border-white/5">
                 <span className="text-[12px] font-black uppercase opacity-40 tracking-widest block mb-1 text-left">Original Total</span>
                 <span className="text-lg font-black italic line-through opacity-30">₱{normalTotal.toLocaleString()}</span>
              </div>
              <div className="bg-emerald-600/10 rounded-3xl p-5 text-left border border-emerald-500/20">
                 <span className="text-[12px] font-black uppercase text-emerald-500 tracking-widest block mb-1 text-left">Save Up To</span>
                 <span className="text-lg font-black italic text-emerald-500">₱{savings.toLocaleString()}</span>
              </div>
           </div>

           {/* Kit List */}
           <div className="space-y-3">
              <div className="flex justify-between items-end mb-1 px-2">
                 <h4 className="text-[13px] font-black uppercase tracking-[0.2em] opacity-30 text-left">Bundle Inclusions ({includedKits.length})</h4>
              </div>
              
              <div className={`rounded-2xl border px-4 dark:bg-emerald-500/10 ${(isFlexiBundleDeal(deal) || isPerKitClearanceDeal(deal)) ? 'border-amber-500/30 bg-amber-500/10' : 'border-emerald-500/20 bg-emerald-500/10'}`}>
                {includedKits.map((kit, kitIndex) => {
                  const pricing = kitPricing.find(p => p.kitId === kit.id) || {};
                  const { refPrice = 0, distributedPrice = 0 } = pricing;
                  const imageUrl = resolveImage(kit.image, kit.images);
                  const kitDetails = [kit.brand, kit.specs?.line, kit.specs?.scale].filter(Boolean).join(' / ') || 'Included Kit';

                  return (
                    <div
                      key={kit.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpenKit?.(kit)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onOpenKit?.(kit);
                        }
                      }}
                      className={`flex w-full cursor-pointer items-center gap-4 py-3 transition-transform duration-200 hover:translate-x-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${kitIndex > 0 ? 'border-t border-black/5 dark:border-white/10' : ''}`}
                    >
                      <div className="flex shrink-0 items-center justify-center">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            className="h-16 w-20 rounded-xl border border-neutral-100 bg-white object-cover object-[center_25%] sm:h-20 sm:w-32 md:w-40 dark:border-neutral-800 dark:bg-neutral-900"
                            alt={kit.name}
                          />
                        ) : (
                          <div className="flex h-16 w-20 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-200 sm:h-20 sm:w-32 md:w-40 dark:border-neutral-800 dark:bg-neutral-800">
                            <Package size={24} className="opacity-20" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 text-left">
                        <p className="line-clamp-2 text-[13px] font-black uppercase leading-tight">{kit.name}</p>
                        <p className="mt-1 line-clamp-1 text-[12px] font-black uppercase tracking-wider text-neutral-900 dark:text-white">
                          {kitDetails}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-[14px] font-black italic text-emerald-600">&#8369;{Math.round(distributedPrice).toLocaleString()}</p>
                        {refPrice > 0 && refPrice !== Math.round(distributedPrice) && (
                          <p className="mt-0.5 text-[14px] font-black text-neutral-900 line-through dark:text-white">&#8369;{refPrice.toLocaleString()}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
        </div>

        {/* Footer / CTA - in one row */}
        <div className="p-4 lg:p-8 bg-black/5 dark:bg-white/[0.02] border-t border-[var(--color-border)] flex-none">
           <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 w-full">
              <div className="text-left">
                 <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest opacity-40 block mb-0.5 leading-none">Lowest {(isFlexiBundleDeal(deal) || isPerKitClearanceDeal(deal)) ? getClearanceDisplayLabel(deal) : 'Deal'} Price</span>
                 <span className="text-xl lg:text-3xl font-black italic text-emerald-500 tracking-tighter leading-none">₱{bundlePrice.toLocaleString()}</span>
               </div>
              <div className="flex w-full sm:w-auto flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button 
                onClick={() => isEditable
                  ? onEditDeal(deal)
                  : (isFlexiBundleDeal(deal) || isPerKitClearanceDeal(deal)) && typeof onAddToBasket === 'function'
                    ? onAddToBasket(deal)
                    : onBuyNow(deal)}
                className={`w-full sm:w-auto px-5 py-3.5 lg:px-10 lg:py-5 rounded-[1.5rem] lg:rounded-[2rem] text-white font-black italic uppercase text-[10px] lg:text-[12px] tracking-[0.1em] lg:tracking-[0.15em] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 lg:gap-3 group shrink-0 ${
                  isEditable
                    ? 'bg-blue-600 shadow-blue-600/20'
                    : (isFlexiBundleDeal(deal) || isPerKitClearanceDeal(deal)) ? 'bg-amber-500 shadow-amber-500/20' : 'bg-emerald-600 shadow-emerald-600/20'
                }`}
              >
                {isEditable ? <Settings size={14} /> : <Zap size={14} fill="currentColor" />}
                {isEditable ? 'Edit Deal' : (isFlexiBundleDeal(deal) || isPerKitClearanceDeal(deal)) ? 'Add to Cart' : 'Grab Deal'}
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" strokeWidth={3} />
              </button>
              </div>
           </div>
        </div>
      </div>
    </div>
  ), document.body);
}
