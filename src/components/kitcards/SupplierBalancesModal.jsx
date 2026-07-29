import React, { useMemo, useState, useEffect } from 'react';
import { X, Wallet, AlertCircle, Package, ExternalLink, ArrowRight, Loader2, Info, CheckSquare } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useStore } from '../../store/useStore';

function resolveImage(idOrUrl, imagesArray) {
  if (!idOrUrl) return '';
  if (idOrUrl.startsWith('data:') || idOrUrl.startsWith('http')) return idOrUrl;
  const match = (imagesArray || []).find(img => img.id === idOrUrl);
  return match?.url || '';
}
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

export default function SupplierBalancesModal({ isOpen, onClose }) {
  const { isDarkMode } = useTheme();
  const { kits: storeKits } = useStore();
  const [allKits, setAllKits] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Fetch ALL kits for a complete balance report
  useEffect(() => {
    const fetchFullInventory = async () => {
      setIsSyncing(true);
      try {
        const snap = await getDocs(collection(db, "kits"));
        const kitsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllKits(kitsData);
      } catch (e) {
        console.error("Failed to fetch kits for balance report:", e);
        setAllKits(storeKits); 
      } finally {
        setIsSyncing(false);
      }
    };

    if (isOpen) {
      fetchFullInventory();
    }
  }, [isOpen, storeKits]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const stateKey = `supplier-balances-modal-${Date.now()}`;
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

  const balanceItems = useMemo(() => {
    const sourceKits = allKits.length > 0 ? allKits : storeKits;
    if (!sourceKits) return [];
    
    const items = [];
    sourceKits.forEach((kit) => {
      const stocks = Object.entries(kit.stocks || {}).map(([key, stock]) => ({
        ...stock,
        key,
        kitName: kit.name,
        kitBrand: kit.brand,
        kitLine: kit.specs?.line,
        kitImage: resolveImage(kit.image, kit.images),
        kitId: kit.id
      }));

      stocks.forEach((stock) => {
        const cost = Number(stock.costPrice || 0);
        const paid = Number(stock.paidToSupplier || 0);
        const balance = cost - paid;

        if (balance !== 0) {
          items.push({
            ...stock,
            balance,
            cost,
            paid,
            isPreOrder: stock.status?.toLowerCase().includes('pre') || stock.status?.toLowerCase().includes('batch')
          });
        }
      });
    });

    return items.sort((a, b) => {
      if (a.isPreOrder && !b.isPreOrder) return -1;
      if (!a.isPreOrder && b.isPreOrder) return 1;

      if (a.eta && b.eta) {
        if (a.eta < b.eta) return -1;
        if (a.eta > b.eta) return 1;
      }
      if (a.eta && !b.eta) return -1;
      if (!a.eta && b.eta) return 1;

      return b.balance - a.balance;
    });
  }, [allKits, storeKits]);

  const groupedItems = useMemo(() => {
    const groups = {};
    
    const monthMap = {
      'JAN': 1, 'JANUARY': 1, 'FEB': 2, 'FEBRUARY': 2, 'MAR': 3, 'MARCH': 3,
      'APR': 4, 'APRIL': 4, 'MAY': 5, 'JUN': 6, 'JUNE': 6, 'JUL': 7, 'JULY': 7,
      'AUG': 8, 'AUGUST': 8, 'SEP': 9, 'SEPTEMBER': 9, 'OCT': 10, 'OCTOBER': 10,
      'NOV': 11, 'NOVEMBER': 11, 'DEC': 12, 'DECEMBER': 12
    };

    const monthNames = [
      'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
      'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
    ];

    balanceItems.forEach(item => {
      let monthLabel = 'ON-HAND / READY';

      if (item.isPreOrder) {
        if (item.eta) {
          const parts = item.eta.toUpperCase().split(/\s+/);
          let foundMonth = null;
          let foundYear = new Date().getFullYear();

          parts.forEach(p => {
            if (monthMap[p]) foundMonth = monthMap[p] - 1;
            if (/^\d{4}$/.test(p)) foundYear = parseInt(p);
          });

          if (foundMonth !== null) {
            const etaDate = new Date(foundYear, foundMonth, 1);
            etaDate.setMonth(etaDate.getMonth() + 2);

            const targetMonthName = monthNames[etaDate.getMonth()];
            const targetYear = etaDate.getFullYear();
            
            monthLabel = `${targetMonthName} ${targetYear} (DEADLINE)`;
          } else {
            monthLabel = `${item.eta.toUpperCase()} (+2 MOS)`;
          }
        } else {
          monthLabel = 'PENDING ETA';
        }
      }
        
      if (!groups[monthLabel]) {
        groups[monthLabel] = {
          label: monthLabel,
          items: [],
          total: 0
        };
      }
      groups[monthLabel].items.push(item);
      groups[monthLabel].total += item.balance;
    });

    const getGroupScore = (label) => {
      if (label === 'ON-HAND / READY') return -1;
      if (label.includes('PENDING')) return 999999;

      const yearMatch = label.match(/\d{4}/);
      const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();
      
      let month = 0;
      monthNames.forEach((name, idx) => {
        if (label.includes(name)) month = idx + 1;
      });

      if (month > 0) return year * 100 + month;
      return 888888;
    };

    return Object.values(groups).sort((a, b) => getGroupScore(a.label) - getGroupScore(b.label));
  }, [balanceItems]);

  const totalBalance = useMemo(() => {
    return balanceItems.reduce((sum, item) => sum + item.balance, 0);
  }, [balanceItems]);

  const handlePayGroup = async (group) => {
    const unpaidItems = group.items.filter(item => Number(item.paid || 0) === 0);

    if (unpaidItems.length === 0) {
      alert("Walang mga ganap na unpaid items (Paid to Supplier = 0) sa grupong ito na pwedeng i-bulk update.");
      return;
    }

    if (window.confirm(`PAID ALL CONFIRMATION:\n\nSettle ALL supplier payments for [${group.label}] group? This will update ${unpaidItems.length} unpaid items to On-Hand, clear free shipping promos, and mark balances as fully paid.\n\n(Note: ${group.items.length - unpaidItems.length} items with partial payments will be skipped).`)) {
      setIsSyncing(true);
      try {
        const updatesByKit = {};
        
        unpaidItems.forEach(item => {
          if (!updatesByKit[item.kitId]) {
            updatesByKit[item.kitId] = {};
          }
          updatesByKit[item.kitId][`stocks.${item.key}.status`] = 'onhand';
          updatesByKit[item.kitId][`stocks.${item.key}.paidToSupplier`] = item.cost;
          updatesByKit[item.kitId][`stocks.${item.key}.isFreeShippingEligible`] = false;
          updatesByKit[item.kitId][`stocks.${item.key}.freeShippingUntil`] = '';
          updatesByKit[item.kitId][`stocks.${item.key}.freeShippingMethod`] = 'All';
          updatesByKit[item.kitId][`stocks.${item.key}.freeShippingSuboption`] = 'All';
        });

        const updatePromises = Object.entries(updatesByKit).map(([kitId, updateData]) => 
          updateDoc(doc(db, 'kits', kitId), updateData)
        );

        await Promise.all(updatePromises);
        alert(`Paid All Successful! Settle na ang payments para sa ${unpaidItems.length} items sa grupong ${group.label}.`);
        
        // Refresh component
        const snap = await getDocs(collection(db, "kits"));
        const kitsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllKits(kitsData);
      } catch (e) {
        console.error("Bulk payment update failed:", e);
        alert("Failed to update some items in the group.");
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const refreshKits = async () => {
    const snap = await getDocs(collection(db, "kits"));
    setAllKits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const markArrived = async (item) => {
    if (!window.confirm("Mark as arrived? Status changes to On-Hand & Free Shipping promo will be cleared, but Balance will remain.")) return;

    try {
      await updateDoc(doc(db, 'kits', item.kitId), {
        [`stocks.${item.key}.status`]: 'onhand',
        [`stocks.${item.key}.eta`]: '',
        [`stocks.${item.key}.isFreeShippingEligible`]: false,
        [`stocks.${item.key}.freeShippingUntil`]: '',
        [`stocks.${item.key}.freeShippingMethod`]: 'All',
        [`stocks.${item.key}.freeShippingSuboption`]: 'All'
      });
      alert("Stock marked as arrived!");
      await refreshKits();
    } catch (e) {
      console.error("Arrived update failed", e);
      alert("Failed to update stock status.");
    }
  };

  const markPaid = async (item) => {
    if (!window.confirm("Settle supplier payment? This marks item as On-Hand, fully clears Balance, and removes Free Shipping promo.")) return;

    try {
      await updateDoc(doc(db, 'kits', item.kitId), {
        [`stocks.${item.key}.status`]: 'onhand',
        [`stocks.${item.key}.paidToSupplier`]: item.cost,
        [`stocks.${item.key}.isFreeShippingEligible`]: false,
        [`stocks.${item.key}.freeShippingUntil`]: '',
        [`stocks.${item.key}.freeShippingMethod`]: 'All',
        [`stocks.${item.key}.freeShippingSuboption`]: 'All'
      });
      alert("Supplier payment recorded successfully!");
      await refreshKits();
    } catch (e) {
      console.error("Payment update failed", e);
      alert("Failed to record supplier payment.");
    }
  };

  const cancelStock = async (item) => {
    if (!window.confirm("Are you sure you want to cancel this stock item? This will permanently remove it.")) return;

    try {
      const firestore = await import('firebase/firestore');
      const { deleteField } = firestore;
      await updateDoc(doc(db, 'kits', item.kitId), {
        [`stocks.${item.key}`]: deleteField()
      });
      alert("Stock item removed!");
      await refreshKits();
    } catch (e) {
      console.error("Removal failed", e);
      alert("Failed to remove stock.");
    }
  };

// APAT NA DYNAMIC STYLING CONDITIONS BASE SA IYONG UPDATE
  const getItemCardStyles = (item) => {
    const isOnHand = item.status?.toLowerCase() === 'onhand';
    const isUnpaid = Number(item.paid || 0) === 0;

    if (isOnHand && !isUnpaid) {
      // 1. EMERALD: On-Hand na at may paid na (> 0)
      return isDarkMode 
        ? 'bg-emerald-500/10 border-emerald-500/30 text-white' 
        : 'bg-emerald-50/60 border-emerald-500/20 text-neutral-900';
    } else if (isOnHand && isUnpaid) {
      // 2. BLUE: On-Hand na pero wala pang bayad (=== 0)
      return isDarkMode 
        ? 'bg-blue-500/10 border-blue-500/30 text-white' 
        : 'bg-blue-50/60 border-blue-500/20 text-neutral-900';
    } else if (!isOnHand && isUnpaid) {
      // 3. AMBER: Di pa onhand (Pre-order) at wala pang bayad (=== 0)
      return isDarkMode 
        ? 'bg-amber-500/10 border-amber-500/20 text-white' 
        : 'bg-amber-50/60 border-amber-500/20 text-neutral-900';
    } else {
      // 4. RED: Di pa onhand (Pre-order) pero may paid na (> 0)
      return isDarkMode 
        ? 'bg-red-500/10 border-red-500/20 text-white' 
        : 'bg-red-50/60 border-red-500/20 text-neutral-900';
    }
  };

  if (!isOpen) return null;

  const panelClass = isDarkMode
    ? 'bg-[#0b0b0c] border-white/10 text-white'
    : 'bg-white border-black/10 text-neutral-900';

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-0 md:p-4 md:portrait:p-0 backdrop-blur-sm text-left">
      <div className={`relative flex h-full md:h-[85dvh] md:portrait:h-full w-full max-w-4xl md:portrait:max-w-none flex-col overflow-hidden rounded-none md:rounded-[2rem] md:portrait:rounded-none border-0 md:border md:portrait:border-0 shadow-2xl ${panelClass}`}>
        {/* Mobile sticky close button (same pattern as ProductCard and AddDealModal) */}
        <div className="sticky top-0 z-[220] w-full h-0 overflow-visible md:hidden shrink-0">
          <div className="absolute top-4 right-4 flex justify-end items-center">
            <button onClick={onClose} className="p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40">
              <X size={20} />
            </button>
          </div>
        </div>
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-amber-500 p-3 text-white shadow-lg shadow-amber-500/20">
              <Wallet size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black uppercase italic tracking-tight">
                  Supplier Balances
                </h2>
                {isSyncing && <Loader2 size={14} className="animate-spin opacity-50" />}
              </div>
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] opacity-45">
                Outstanding payments grouped by arrival
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="hidden md:block rounded-full p-2 opacity-50 transition-all hover:bg-white/10 hover:opacity-100"
          >
            <X size={22} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isSyncing && balanceItems.length === 0 ? (
             <div className="flex h-full flex-col items-center justify-center space-y-4 opacity-50">
               <Loader2 size={32} className="animate-spin" />
               <p className="text-[10px] font-black uppercase tracking-widest">Processing transactions...</p>
             </div>
          ) : groupedItems.length > 0 ? (
            <div className="space-y-8">
              {groupedItems.map((group) => (
                <div key={group.label} className="space-y-4">
                  {/* Month Divider / Group Header */}
                  <div className="sticky top-[-1.5rem] z-20 -mx-6 bg-[var(--color-surface)] px-6 py-2">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <div className="flex items-center gap-3">
                        <div className={`h-1.5 w-1.5 rounded-full ${group.label.includes('ON-HAND') ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        <h4 className="text-[11px] font-black uppercase tracking-[0.2em] opacity-60">
                          {group.label}
                        </h4>
                        
                        {/* PAID ALL BUTTON */}
                        <button
                          onClick={() => handlePayGroup(group)}
                          disabled={isSyncing || group.items.filter(item => Number(item.paid || 0) === 0).length === 0}
                          className="ml-2 flex items-center gap-1 rounded-md bg-blue-600 px-2 py-0.5 text-[12px] font-black uppercase tracking-tight text-white transition-all hover:bg-blue-700 disabled:opacity-50"
                        >
                          <CheckSquare size={10} />
                          Paid All ({group.items.filter(item => Number(item.paid || 0) === 0).length})
                        </button>
                      </div>
                      <div className="text-right">
                        <span className="text-[12px] font-black uppercase tracking-widest opacity-30 mr-2">Monthly Total</span>
                        <span className={`text-[13px] font-black italic ${group.total > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                          ₱{group.total.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Items in this group */}
                  <div className="grid gap-4">
                    {group.items.map((item, idx) => (
                      <div
                        key={`${item.kitId}-${item.key}-${idx}`}
                        className={`flex items-center gap-4 rounded-3xl border p-4 transition-all hover:scale-[1.01] ${getItemCardStyles(item)}`}
                      >
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-black/10">
                          <img
                            src={item.kitImage}
                            alt={item.kitName}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="min-w-0">
                            <h3 className="truncate text-xs font-black uppercase tracking-tight">
                              {item.kitName}
                            </h3>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="shrink-0 rounded-full bg-blue-600/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-widest text-blue-500">
                                {item.kitLine || item.kitBrand}
                              </span>
                            </div>
                          </div>
                          <div className="hidden">
                            <span>Cost: ₱{item.cost.toLocaleString()}</span>
                            <span>Paid: ₱{item.paid.toLocaleString()}</span>
                            <div className="contents">
                              {/* ARRIVED BUTTON */}
                              <button 
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (window.confirm("Mark as arrived? Status changes to On-Hand & Free Shipping promo will be cleared, but Balance will remain.")) {
                                    try {
                                      await updateDoc(doc(db, 'kits', item.kitId), {
                                        [`stocks.${item.key}.status`]: 'onhand',
                                        [`stocks.${item.key}.eta`]: '',
                                        [`stocks.${item.key}.isFreeShippingEligible`]: false,
                                        [`stocks.${item.key}.freeShippingUntil`]: '',
                                        [`stocks.${item.key}.freeShippingMethod`]: 'All',
                                        [`stocks.${item.key}.freeShippingSuboption`]: 'All'
                                      });
                                      alert("Stock marked as arrived!");
                                      
                                      const snap = await getDocs(collection(db, "kits"));
                                      setAllKits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                                    } catch (e) {
                                      console.error("Arrived update failed", e);
                                      alert("Failed to update stock status.");
                                    }
                                  }
                                }}
                                className="rounded-lg bg-emerald-500 px-2 py-1 text-[11px] font-black uppercase text-white hover:bg-emerald-600 transition-all"
                              >
                                Arrived
                              </button>

                              {/* PAID BUTTON */}
                              <button 
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (window.confirm("Settle supplier payment? This marks item as On-Hand, fully clears Balance, and removes Free Shipping promo.")) {
                                    try {
                                      const newPaid = item.cost;
                                      await updateDoc(doc(db, 'kits', item.kitId), {
                                        [`stocks.${item.key}.status`]: 'onhand',
                                        [`stocks.${item.key}.paidToSupplier`]: newPaid,
                                        [`stocks.${item.key}.isFreeShippingEligible`]: false,
                                        [`stocks.${item.key}.freeShippingUntil`]: '',
                                        [`stocks.${item.key}.freeShippingMethod`]: 'All',
                                        [`stocks.${item.key}.freeShippingSuboption`]: 'All'
                                      });
                                      alert("Supplier payment recorded successfully!");
                                      
                                      const snap = await getDocs(collection(db, "kits"));
                                      setAllKits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                                    } catch (e) {
                                      console.error("Payment update failed", e);
                                      alert("Failed to record supplier payment.");
                                    }
                                  }
                                }}
                                className="rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-black uppercase text-white hover:bg-blue-700 transition-all"
                              >
                                Paid
                              </button>

                              {/* CANCEL BUTTON */}
                              <button 
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (window.confirm("Are you sure you want to cancel this stock item? This will permanently remove it.")) {
                                    try {
                                      const firestore = await import('firebase/firestore');
                                      const { deleteField } = firestore;
                                      await updateDoc(doc(db, 'kits', item.kitId), {
                                        [`stocks.${item.key}`]: deleteField()
                                      });
                                      alert("Stock item removed!");
                                      
                                      const snap = await getDocs(collection(db, "kits"));
                                      setAllKits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                                    } catch (e) {
                                      console.error("Removal failed", e);
                                      alert("Failed to remove stock.");
                                    }
                                  }
                                }}
                                className="rounded-lg bg-red-500/10 px-2 py-1 text-[11px] font-black uppercase text-red-500 hover:bg-red-500 hover:text-white transition-all"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <div className="flex items-baseline justify-end gap-2">
                          <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Balance</p>
                          <p className={`text-sm font-black italic ${item.balance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                            ₱{item.balance.toLocaleString()}
                          </p>
                          </div>
                          <div className="mt-2 flex flex-wrap justify-end gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                markArrived(item);
                              }}
                              className="rounded-lg bg-emerald-500 px-2 py-1 text-[11px] font-black uppercase text-white hover:bg-emerald-600 transition-all"
                            >
                              Arrived
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                markPaid(item);
                              }}
                              className="rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-black uppercase text-white hover:bg-blue-700 transition-all"
                            >
                              Paid
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelStock(item);
                              }}
                              className="rounded-lg bg-red-500/10 px-2 py-1 text-[11px] font-black uppercase text-red-500 hover:bg-red-500 hover:text-white transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center opacity-30">
              <Package size={48} strokeWidth={1} />
              <p className="mt-4 text-[10px] font-black uppercase tracking-[0.2em]">
                No outstanding balances found
              </p>
            </div>
          )}
        </div>

        {/* Footer / Total */}
        <div className="shrink-0 border-t border-white/10 bg-black/5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-45">
                Total Outstanding
              </p>
              <h3 className={`text-2xl font-black italic tracking-tighter ${totalBalance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                ₱{totalBalance.toLocaleString()}
              </h3>
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-blue-600/10 px-4 py-3 text-blue-500">
              <AlertCircle size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                {balanceItems.length} Variants to settle
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
