import React, { useMemo, useEffect } from 'react';
import { X, Gift, Zap, ArrowRight, Star } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { getCheckoutPaymentFees } from '../../utils/paymentSettings';

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

export default function DealDetailsModal({ isOpen, onClose, deal, onBuyNow }) {
  const { kits, shippingSettings } = useStore();
  const { exclusiveDiscountPercent } = getCheckoutPaymentFees({ shippingSettings });

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

    let nTotal = 0;
    let exclusiveRefTotal = 0;
    let standardRefTotal = 0;

    const refPrices = includedKits.map(kit => {
      const stocks = Object.values(kit.stocks || {});
      const sourceStock = stocks.find(stock => stockMatchesDealSource(stock, deal?.stockSource || 'onhand'));
      const refPrice = Number(sourceStock?.sellPrice || stocks[0]?.sellPrice || kit.sellPrice || 0);
      nTotal += refPrice;
      if (exclusiveKitIds.includes(kit.id)) {
        exclusiveRefTotal += refPrice;
      } else {
        standardRefTotal += refPrice;
      }
      return { kitId: kit.id, refPrice, isExclusive: exclusiveKitIds.includes(kit.id) };
    });

    const bPrice = deal?.bundlePrice || 0;
    const totalDiscount = nTotal > bPrice ? nTotal - bPrice : 0;

    // Split discount pool between exclusive and standard kits
    const exclusivePool = exclusiveKitIds.length > 0 ? totalDiscount * pct : 0;
    const standardPool = totalDiscount - exclusivePool;

    const pricing = refPrices.map(({ kitId, refPrice, isExclusive }) => {
      let kitDiscount = 0;
      if (isExclusive && exclusiveRefTotal > 0) {
        kitDiscount = exclusivePool * (refPrice / exclusiveRefTotal);
      } else if (!isExclusive && standardRefTotal > 0) {
        kitDiscount = standardPool * (refPrice / standardRefTotal);
      }
      return { kitId, refPrice, distributedPrice: Math.round(refPrice - kitDiscount), isExclusive };
    });

    return { normalTotal: nTotal, bundlePrice: bPrice, savings: nTotal > bPrice ? nTotal - bPrice : 0, kitPricing: pricing };
  }, [includedKits, deal, exclusiveDiscountPercent]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const stateKey = `deal-details-modal-${Date.now()}`;
    window.history.pushState({ modalKey: stateKey }, '');

    const handlePopState = () => {
      onClose();
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
      if (window.history.state?.modalKey === stateKey) {
        window.history.back();
      }
    };
  }, [isOpen, onClose]);

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
                 <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mt-2 block">
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
                 <span className="text-[9px] font-black uppercase opacity-40 tracking-widest block mb-1 text-left">Original Total</span>
                 <span className="text-lg font-black italic line-through opacity-30">₱{normalTotal.toLocaleString()}</span>
              </div>
              <div className="bg-emerald-600/10 rounded-3xl p-5 text-left border border-emerald-500/20">
                 <span className="text-[9px] font-black uppercase text-emerald-500 tracking-widest block mb-1 text-left">You Save</span>
                 <span className="text-lg font-black italic text-emerald-500">₱{savings.toLocaleString()}</span>
              </div>
           </div>

           {/* Kit List */}
           <div className="space-y-3">
              <div className="flex justify-between items-end mb-1 px-2">
                 <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-30 text-left">Proportional Inclusions ({includedKits.length})</h4>
                 <span className="text-[8px] font-bold opacity-20 uppercase italic">Prices include bundle discount</span>
              </div>
              
              {includedKits.map(kit => {
                const pricing = kitPricing.find(p => p.kitId === kit.id) || {};
                const { refPrice = 0, distributedPrice = 0, isExclusive = false } = pricing;
                
                return (
                  <div key={kit.id} className={`flex items-center gap-4 p-4 rounded-3xl border ${isExclusive ? 'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/20' : 'bg-black/5 dark:bg-white/5 border-white/5'}`}>
                     <img src={resolveImage(kit.image, kit.images)} className="w-12 h-12 rounded-xl object-cover bg-white shadow-sm" alt="" />
                     <div className="flex-1 text-left">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[11px] font-black uppercase leading-tight line-clamp-1">{kit.name}</p>
                          {isExclusive && <Star size={10} className="text-emerald-500 fill-emerald-500 shrink-0" />}
                        </div>
                        <p className="text-[9px] font-bold opacity-40 uppercase mt-1">
                          {isExclusive ? <span className="text-emerald-500 opacity-100">EXCLUSIVE</span> : kit.specs?.line || ''}
                        </p>
                     </div>
                     <div className="text-right">
                        <p className="text-[11px] font-black italic text-emerald-500">₱{Math.round(distributedPrice).toLocaleString()}</p>
                        <p className="text-[8px] font-bold line-through opacity-20 mt-0.5">₱{refPrice.toLocaleString()}</p>
                     </div>
                  </div>
                );
              })}
           </div>
        </div>

        {/* Footer / CTA - in one row */}
        <div className="p-4 md:p-8 bg-black/5 dark:bg-white/[0.02] border-t border-[var(--color-border)] flex-none">
           <div className="flex flex-row items-center justify-between gap-4 w-full">
              <div className="text-left">
                 <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest opacity-40 block mb-0.5 leading-none">Promo Price</span>
                 <span className="text-xl md:text-3xl font-black italic text-emerald-500 tracking-tighter leading-none">₱{deal.bundlePrice?.toLocaleString()}</span>
              </div>
              
              <button 
                onClick={() => onBuyNow(deal)}
                className="px-5 py-3.5 md:px-10 md:py-5 rounded-[1.5rem] md:rounded-[2rem] bg-emerald-600 text-white font-black italic uppercase text-[10px] md:text-[12px] tracking-[0.1em] md:tracking-[0.15em] shadow-xl shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 md:gap-3 group shrink-0"
              >
                <Zap size={14} fill="currentColor" />
                Grab Deal
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" strokeWidth={3} />
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}
