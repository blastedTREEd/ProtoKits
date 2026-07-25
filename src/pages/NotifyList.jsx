import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, Bell, PackageOpen } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useTheme } from '../context/ThemeContext';
import PageTemplate from './PageTemplate';
import LoadingState from '../components/common/LoadingState';

function resolveImage(idOrUrl, imagesArray) {
  if (!idOrUrl) return '';
  if (idOrUrl.startsWith('data:') || idOrUrl.startsWith('http')) return idOrUrl;
  const match = (imagesArray || []).find(img => img.id === idOrUrl);
  return match?.url || '';
}

export default function NotifyList() {
  const { isDarkMode } = useTheme();
  const {
    user, isAdmin, isAdminView, notifyList,
    deleteFromNotifyList, kits, shelf,
    removeFromBasket, updateStockPrice, subscribeNotifyList, isLoading,
  } = useStore();

  const [selectedIds, setSelectedIds] = useState([]);
  const [isMiniNavVisible, setIsMiniNavVisible] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeNotifyList();
    return () => unsubscribe && unsubscribe();
  }, [subscribeNotifyList]);

  useEffect(() => {
    const handleHide = () => setIsMiniNavVisible(false);
    const handleShow = () => setIsMiniNavVisible(true);
    window.addEventListener('hideNavbar', handleHide);
    window.addEventListener('showNavbar', handleShow);
    return () => {
      window.removeEventListener('hideNavbar', handleHide);
      window.removeEventListener('showNavbar', handleShow);
    };
  }, []);

  const myNotifyList = useMemo(() => {
    if (isAdmin && isAdminView) {
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

  const toggleSelectAll = () => {
    if (selectedIds.length === myNotifyList.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(myNotifyList.map(i => i.id));
    }
  };

  const handleBulkDelete = async () => {
    const isRelease = isAdmin && isAdminView;
    const count = selectedIds.length;
    const message = isRelease
      ? `Release ${count} kit(s) to public using their Offer Prices?`
      : `Remove ${count} item(s) from your offers?`;

    if (!window.confirm(message)) return;

    for (const id of selectedIds) {
      const item = notifyList.find(n => n.id === id);

      if (item && isAdmin && isAdminView) {
        const shelfItem = shelf.find(s => s.id === item.kitId);
        if (shelfItem) {
          try {
            await updateStockPrice(item.kitId, shelfItem.stockKey, item.targetPrice);
            await removeFromBasket(shelfItem.basketId);
          } catch (e) {
            console.error('SG LOG: Error syncing offer price to shelf:', e);
          }
        }
      }

      await deleteFromNotifyList(id);
    }
    setSelectedIds([]);
  };

  const hasVisibleItems = !isLoading && myNotifyList.length > 0;
  const isReleaseMode = isAdmin && isAdminView;

  return (
    <PageTemplate isDarkMode={isDarkMode}>
      <div className="min-h-screen flex flex-col bg-neutral-50 dark:bg-[#0a0a0a] transition-colors duration-500">
        <div className="sticky top-[50px] z-[90] h-[60px] w-full bg-neutral-50 dark:bg-[#0a0a0a] border-b border-black/5 dark:border-white/5">
          <div className="max-w-7xl mx-auto px-4 md:px-8 h-full flex items-center justify-between">
            <div className="flex items-center gap-4">
              {myNotifyList.length > 0 && (
                <button onClick={toggleSelectAll} className="text-[11px] font-black uppercase tracking-widest opacity-50 hover:opacity-100">
                  {selectedIds.length === myNotifyList.length ? 'Unselect All' : 'Select All'}
                </button>
              )}
            </div>
            <div className="flex items-center gap-4">
              {selectedIds.length > 0 && (
                <>
                  <span className="text-[11px] font-black uppercase tracking-widest">{selectedIds.length} SELECTED</span>
                  <button
                    onClick={handleBulkDelete}
                    className="flex items-center gap-1 text-red-500 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex-grow max-w-7xl mx-auto w-full p-4 md:p-8 pb-32 md:pb-8">
          {isLoading ? (
            <LoadingState message="Loading your offers..." />
          ) : myNotifyList.length === 0 ? (
            <div className="text-center py-20 opacity-50">
              <Bell size={68} className="mx-auto mb-4" />
              <p className="font-bold mb-6">Your offers list is empty..</p>
            </div>
          ) : (
            <div className="space-y-4">
              {myNotifyList.map(item => {
                const kit = kits.find(k => k.id === item.kitId);
                const isSelected = selectedIds.includes(item.id);
                const displayImage = resolveImage(kit?.image, kit?.images);
                const displayName = item.kitName || kit?.name || 'Unknown Kit';
                const brand = kit?.brand;
                const line = kit?.specs?.line;
                const scale = kit?.specs?.scale;

                const cardClasses = `p-3 rounded-2xl border-2 cursor-pointer flex gap-4 items-center transition-all duration-300 ${
                  isSelected ? 'border-blue-500 shadow-lg' : 'border-black/5 dark:border-white/5'
                } bg-white dark:bg-neutral-900`;

                return (
                  <div
                    key={item.id}
                    onClick={() => toggleSelection(item.id)}
                    className={cardClasses}
                  >
                    <div className="flex items-center justify-center">
                      {displayImage ? (
                        <img
                          src={displayImage}
                          alt={displayName}
                          loading="lazy"
                          className="w-20 h-20 md:portrait:w-48 md:landscape:w-72 md:h-24 lg:w-72 xl:w-72 aspect-square md:aspect-auto object-cover object-[center_25%] rounded-xl border border-neutral-100 dark:border-neutral-800 transition-opacity duration-500"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div
                        className="w-20 h-20 md:portrait:w-48 md:landscape:w-72 md:h-24 lg:w-72 xl:w-72 aspect-square md:aspect-auto rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center"
                        style={{ display: displayImage ? 'none' : 'flex' }}
                      >
                        <PackageOpen size={32} className="opacity-20" />
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-[80px] justify-center">
                      <div className="flex flex-col justify-center">
                        <p className="font-bold text-sm leading-tight line-clamp-1 md:line-clamp-2">{displayName}</p>
                        <p className="text-[11px] uppercase font-black opacity-40 tracking-widest leading-tight mt-0.5">
                          {[brand, line, scale].filter(Boolean).join(' • ')}
                        </p>
                        {isReleaseMode && item.userName && (
                          <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mt-0.5">{item.userName}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`font-black text-[12px] ${isSelected ? 'text-emerald-600' : 'text-neutral-900 dark:text-white'}`}>
                          ₱{item.targetPrice?.toLocaleString()}
                        </p>
                        <p className="text-[11px] font-black uppercase px-2 py-0.5 rounded-md truncate max-w-[100px] border bg-blue-500/10 text-blue-600 border-blue-500/20">
                          Offer
                        </p>

                        {isReleaseMode && (
                          <>
                            <p className="text-[11px] font-black text-amber-600">
                              Cost ₱{(kit?.stocks ? Math.max(...Object.values(kit.stocks).map(s => Number(s.costPrice || 0))) : 0).toLocaleString()}
                            </p>
                            <p className="text-[11px] font-black text-emerald-600">
                              Sell ₱{(kit?.stocks ? Math.max(...Object.values(kit.stocks).map(s => Number(s.sellPrice || 0))) : (kit?.sellPrice || 0)).toLocaleString()}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {hasVisibleItems && (
          <div
            className={`sticky z-[95] bg-white dark:bg-[#121212] border-t border-black/5 dark:border-white/5 transition-all duration-300 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_6px_-1px_rgba(255,255,255,0.05)] ${
              isMiniNavVisible ? 'bottom-[56px] sm:bottom-0' : 'bottom-0'
            } ${selectedIds.length === 0 ? 'h-[40px]' : 'min-h-[85px] py-4'}`}
          >
            <div className="max-w-7xl mx-auto h-full px-4 md:px-8 flex items-center justify-between">
              {selectedIds.length === 0 ? (
                <div className="w-full flex justify-center items-center h-[40px]">
                  <span className="text-[10px] md:text-[12px] font-black uppercase tracking-[0.2em] opacity-90">
                    {isReleaseMode ? 'Select offers to release' : 'Select items to remove'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between w-full md:justify-end md:gap-6">
                  <div className="flex flex-col items-start md:items-end justify-center">
                    <span className="text-[10px] font-black uppercase opacity-40 leading-none mb-1">Selected</span>
                    <span className="text-lg md:text-xl font-black italic leading-none">{selectedIds.length} item{selectedIds.length > 1 ? 's' : ''}</span>
                  </div>
                  <button
                    onClick={handleBulkDelete}
                    className="px-10 py-3.5 rounded-full font-black uppercase tracking-widest text-xs transition-all bg-red-500 text-white shadow-lg shadow-red-500/20 hover:scale-105"
                  >
                    {isReleaseMode ? 'Release Selected' : 'Remove Selected'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PageTemplate>
  );
}
