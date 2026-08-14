import React, { useMemo, useEffect, useRef } from 'react';
import { X, Gift, Zap, ArrowRight, Settings, Package } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { getCheckoutPaymentFees } from '../../utils/paymentSettings';
import { distributeRoundedBundlePrices } from '../../utils/bundlePricing';

function resolveImage(idOrUrl, imagesArray) {
  if (!idOrUrl) return '';
  if (idOrUrl.startsWith('data:') || idOrUrl.startsWith('http')) return idOrUrl;
  const match = (imagesArray || []).find(img => img.id === idOrUrl);
  return match?.url || '';
}

function getOrderedKits(kits, kitIds) {
  const kitMap = new Map((kits || []).map(kit => [kit.id, kit]));
  return (kitIds || []).map(id => kitMap.get(id)).filter(Boolean);
}

function stockMatchesDealSource(stock, source = 'onhand') {
  const status = String(stock?.status || '').toLowerCase();
  const isPreOrder = status.includes('pre') || status.includes('batch');
  return source === 'preorder' ? isPreOrder : !isPreOrder;
}

export default function DealDetailsModal({ isOpen, onClose, deal, onBuyNow, onOpenKit, isEditMode = false, onEditDeal }) {
  const { kits, shippingSettings } = useStore();
  const { exclusiveDiscountPercent, handlingFee, installmentFee, transferFee } = getCheckoutPaymentFees({ shippingSettings });
  const onCloseRef = useRef(onClose);
  const isEditable = isEditMode && typeof onEditDeal === 'function';
  // Bundle savings compare each included kit against its normal standalone
  // checkout price. A standalone kit carries handling, transfer, and
  // installment fees in full, rather than a share of the bundle fees.
  const publicStandaloneFee = isEditable
    ? 0
    : Number(installmentFee || 0) + Number(handlingFee || 0) + Number(transferFee || 0);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const includedKits = useMemo(() => {
    if (!deal || !deal.kitIds) return [];
    const orderedKitIds = [
      ...(deal.previewKitIds || []),
      ...(deal.kitIds || []).filter(id => !(deal.previewKitIds || []).includes(id))
    ];
    return getOrderedKits(kits, orderedKitIds);
  }, [deal, kits]);

  // Compute proportional pricing with exclusive discount logic
  const { normalTotal, bundlePrice, savings, kitPricing } = useMemo(() => {
    const exclusiveKitIds = deal?.exclusiveKitIds || [];
    const pct = exclusiveDiscountPercent / 100;

    const {
  refPrices,
  nTotal,
  exclusiveRefTotal,
  standardRefTotal,
} = includedKits.reduce(
  (acc, kit) => {
    const stocks = Object.values(kit.stocks || {});
    const sourceStock = stocks.find(stock =>
      stockMatchesDealSource(stock, deal?.stockSource || 'onhand')
    );

    const refPrice = Number(
      sourceStock?.sellPrice ||
      stocks[0]?.sellPrice ||
      kit.sellPrice ||
      0
    );

    const isExclusive = exclusiveKitIds.includes(kit.id);

    acc.nTotal += refPrice;

    if (isExclusive) {
      acc.exclusiveRefTotal += refPrice;
    } else {
      acc.standardRefTotal += refPrice;
    }

    acc.refPrices.push({
      kitId: kit.id,
      refPrice,
      isExclusive,
    });

    return acc;
  },
  {
    refPrices: [],
    nTotal: 0,
    exclusiveRefTotal: 0,
    standardRefTotal: 0,
  }
);

    const bPrice = deal?.bundlePrice || 0;
    const totalDiscount = nTotal > bPrice ? nTotal - bPrice : 0;

    // Split discount pool between exclusive and standard kits
    const exclusivePool = exclusiveKitIds.length > 0 ? totalDiscount * pct : 0;
    const standardPool = totalDiscount - exclusivePool;

    const pricingRows = refPrices.map(({ kitId, refPrice, isExclusive }) => {
      let kitDiscount = 0;
      if (isExclusive && exclusiveRefTotal > 0) {
        kitDiscount = exclusivePool * (refPrice / exclusiveRefTotal);
      } else if (!isExclusive && standardRefTotal > 0) {
        kitDiscount = standardPool * (refPrice / standardRefTotal);
      }
      return { kitId, refPrice, rawPrice: Math.max(0, refPrice - kitDiscount), isExclusive };
    });
    const pricing = distributeRoundedBundlePrices(pricingRows, bPrice).map(row => ({
      ...row,
      distributedPrice: row.finalPrice
    }));

    const adjustedPricing = pricing.map(row => ({
      ...row,
      refPrice: row.refPrice + publicStandaloneFee
    }));
    const adjustedNormalTotal = nTotal + (publicStandaloneFee * includedKits.length);

    return {
      normalTotal: adjustedNormalTotal,
      bundlePrice: bPrice,
      savings: adjustedNormalTotal > bPrice ? adjustedNormalTotal - bPrice : 0,
      kitPricing: adjustedPricing
    };
  }, [includedKits, deal, exclusiveDiscountPercent, publicStandaloneFee]);


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

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-0 md:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 overflow-hidden touch-action-none">
      <div className="bg-[var(--color-surface)] border-0 md:border border-[var(--color-border)] w-full h-full md:max-h-[85vh] md:max-w-2xl rounded-none md:rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden overscroll-none text-[var(--color-text-main)]">
        
        {/* Mobile sticky close button */}
        <div className="sticky top-0 z-[220] w-full h-0 overflow-visible md:hidden">
          <div className="absolute top-4 right-4 flex justify-end items-center">
            <button onClick={onClose} className="p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Header */}
        <div className="p-6 md:p-8 pb-4 flex items-center justify-between shrink-0">
           <div className="flex items-center gap-4 text-left">
              <div className="p-3 bg-emerald-600 rounded-2xl shadow-lg shadow-emerald-600/20">
                 <Gift size={24} className="text-white" />
              </div>
              <div>
                 <h2 className="text-xl font-black uppercase italic leading-none">{deal.name}</h2>
                 <span className="text-[12px] font-black uppercase tracking-widest text-emerald-500 mt-2 block">
                    {(deal.type === 'bundle_discount' || deal.type === 'bundle_only') ? 'Bundle Only Package' : 'Special Deal Package'}
                  </span>
              </div>
           </div>
           <button onClick={onClose} className="hidden md:block p-2 hover:bg-black/5 rounded-full transition-colors opacity-40"><X size={24} /></button>
        </div>

        {/* Content - Scrollable & Flex-grow */}
        <div className="p-6 md:p-8 pt-0 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
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
              
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 dark:bg-emerald-500/10">
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
        <div className="p-4 md:p-8 bg-black/5 dark:bg-white/[0.02] border-t border-[var(--color-border)] flex-none">
           <div className="flex flex-row items-center justify-between gap-4 w-full">
              <div className="text-left">
                 <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest opacity-40 block mb-0.5 leading-none">Lowest Deal Price</span>
                 <span className="text-xl md:text-3xl font-black italic text-emerald-500 tracking-tighter leading-none">₱{bundlePrice.toLocaleString()}</span>
              </div>
              
              <button 
                onClick={() => isEditable ? onEditDeal(deal) : onBuyNow(deal)}
                className={`px-5 py-3.5 md:px-10 md:py-5 rounded-[1.5rem] md:rounded-[2rem] text-white font-black italic uppercase text-[10px] md:text-[12px] tracking-[0.1em] md:tracking-[0.15em] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 md:gap-3 group shrink-0 ${
                  isEditable
                    ? 'bg-blue-600 shadow-blue-600/20'
                    : 'bg-emerald-600 shadow-emerald-600/20'
                }`}
              >
                {isEditable ? <Settings size={14} /> : <Zap size={14} fill="currentColor" />}
                {isEditable ? 'Edit Deal' : 'Grab Deal'}
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" strokeWidth={3} />
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}
