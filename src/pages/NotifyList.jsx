import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, Bell, Box, Package, AlertCircle } from 'lucide-react';
import { useStore } from '../store/useStore';
import PageTemplate from './PageTemplate';

function resolveImage(idOrUrl, imagesArray) {
  if (!idOrUrl) return '';
  if (idOrUrl.startsWith('data:') || idOrUrl.startsWith('http')) return idOrUrl;
  const match = (imagesArray || []).find(img => img.id === idOrUrl);
  return match?.url || '';
}

export default function NotifyList({ isDarkMode }) {
  const { 
    user, isAdmin, isAdminView, notifyList, 
    deleteFromNotifyList, kits, shelf, 
    removeFromBasket, updateStockPrice, subscribeNotifyList
  } = useStore();
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeNotifyList();
    return () => unsubscribe && unsubscribe();
  }, [subscribeNotifyList]);

  const myNotifyList = useMemo(() => {
    if (isAdmin && isAdminView) {
      // Aggregate by kitId, keep the one with the highest targetPrice
      const grouped = notifyList.reduce((acc, curr) => {
        if (!acc[curr.kitId] || curr.targetPrice > acc[curr.kitId].targetPrice) {
          acc[curr.kitId] = curr;
        }
        return acc;
      }, {});
      return Object.values(grouped);
    }
    if (!user) return [];
    return notifyList.filter(n => n.uid === user.uid);
  }, [notifyList, user, isAdmin, isAdminView]);

  const toggleSelection = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkDelete = async () => {
    const isRelease = isAdmin && isAdminView;
    const count = selectedIds.length;
    const message = isRelease 
      ? `Release ${count} kit(s) to public using their Offer Prices?`
      : `Remove ${count} item(s) from your notification list?`;

    if (!window.confirm(message)) return;

    for (const id of selectedIds) {
      const item = notifyList.find(n => n.id === id);
      
      // Admin Logic: Sync price to shelf item before releasing
      if (item && isAdmin && isAdminView) {
        const shelfItem = shelf.find(s => s.id === item.kitId);
        if (shelfItem) {
          try {
            // 1. Update the actual stock price in Firestore
            await updateStockPrice(item.kitId, shelfItem.stockKey, item.targetPrice);
            // 2. Remove from shelf (this also triggers reservation release in useStore)
            await removeFromBasket(shelfItem.basketId);
          } catch (e) {
            console.error("SG LOG: Error syncing offer price to shelf:", e);
          }
        }
      }

      await deleteFromNotifyList(id);
    }
    setSelectedIds([]);
  };

  const shadow = isDarkMode 
    ? 'shadow-[0_8px_30px_rgba(0,0,0,0.5)]' 
    : 'shadow-[0_4px_12px_rgba(0,0,0,0.05)]';

  return (
    <PageTemplate isDarkMode={isDarkMode}>
      <div className="w-full max-w-[680px] mx-auto space-y-6 pb-24 px-4 text-left">
        
        <header className="flex justify-between items-end pt-4 px-2">
           <div className="text-left">
              <h1 className="text-2xl font-black italic uppercase tracking-tighter text-[var(--color-text-main)] leading-none">
                {isAdmin && isAdminView ? 'Offer List' : 'Notify List'}
              </h1>
              <div className="flex items-center gap-3 mt-2">
                 <span className="text-[9px] font-black uppercase tracking-widest opacity-20">{myNotifyList.length} Items Total</span>
              </div>
           </div>
           {selectedIds.length > 0 && (
             <button 
               onClick={handleBulkDelete}
               className="px-4 py-2 rounded-xl bg-amber-600 text-white text-[9px] font-black italic uppercase tracking-widest shadow-lg shadow-amber-600/20 hover:bg-amber-700 transition-all active:scale-95"
             >
               <Trash2 size={10} className="inline mr-1" /> {isAdmin && isAdminView ? 'Release Selected' : 'Remove Selected'}
             </button>
           )}
        </header>

        {myNotifyList.length === 0 ? (
          <div className="py-24 flex flex-col items-center gap-4 opacity-20 text-center">
            <Bell size={64} strokeWidth={1} className="mx-auto" />
            <p className="text-sm font-black uppercase tracking-[0.2em]">Your notify list is empty</p>
          </div>
        ) : (
          <div className="space-y-3">
            {myNotifyList.map(item => {
              const kit = kits.find(k => k.id === item.kitId);
              const isSelected = selectedIds.includes(item.id);
              
              return (
                <div 
                  key={item.id}
                  className={`
                    group relative flex items-center gap-4 p-4 rounded-[2rem] border transition-all duration-300
                    bg-[var(--color-surface)] ${isSelected ? 'border-blue-500/30 bg-blue-500/[0.01]' : 'border-[var(--color-border)]'} ${shadow}
                  `}
                >
                  <button 
                    onClick={() => toggleSelection(item.id)}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0
                      ${isSelected ? 'bg-blue-600 border-blue-600 shadow-lg shadow-blue-600/20' : 'border-[var(--color-border)] hover:border-blue-500/50'}
                    `}
                  >
                    {isSelected && <div className="w-2 h-2 rounded-full bg-white animate-in zoom-in duration-300" />}
                  </button>

                  <div className="flex-1 flex items-center gap-4 min-w-0">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-inner border border-black/5 bg-neutral-600/10 text-neutral-600">
                      {kit?.image ? (
                        <img src={resolveImage(kit.image, kit.images)} alt={item.kitName} className="w-full h-full object-cover rounded-2xl" />
                      ) : (
                        <Box size={24} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 text-left">
                      <h3 className="font-black italic uppercase text-[14px] text-[var(--color-text-main)] truncate">{item.kitName}</h3>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                         <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black uppercase opacity-20 tracking-widest">Offer:</span>
                            <span className="text-[11px] font-black text-blue-600">₱{item.targetPrice?.toLocaleString()}</span>
                         </div>
                         
                         {isAdmin && isAdminView && (
                            <div className="flex items-center gap-3">
                               <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-black uppercase opacity-20 tracking-widest">Cost:</span>
                                  <span className="text-[11px] font-black text-amber-600">₱{(kit?.stocks ? Math.max(...Object.values(kit.stocks).map(s => Number(s.costPrice || 0))) : 0).toLocaleString()}</span>
                               </div>
                               <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-black uppercase opacity-20 tracking-widest">Sell:</span>
                                  <span className="text-[11px] font-black text-emerald-600">₱{(kit?.stocks ? Math.max(...Object.values(kit.stocks).map(s => Number(s.sellPrice || 0))) : (kit?.sellPrice || 0)).toLocaleString()}</span>
                               </div>
                               <span className="text-[9px] font-black uppercase bg-neutral-100 dark:bg-white/10 px-2 py-0.5 rounded-lg text-neutral-400">{item.userName}</span>
                            </div>
                         )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageTemplate>
  );
}
