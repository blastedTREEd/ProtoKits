import React, { useMemo, useState, useEffect } from 'react';
import { X, Wallet, AlertCircle, Package, ExternalLink, ArrowRight, Loader2, Info, CheckSquare, CheckCircle2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useStore } from '../../store/useStore';

function resolveImage(idOrUrl, imagesArray) {
  if (!idOrUrl) return '';
  if (idOrUrl.startsWith('data:') || idOrUrl.startsWith('http')) return idOrUrl;
  const match = (imagesArray || []).find(img => img.id === idOrUrl);
  return match?.url || '';
}
import { collection, getDocs, doc, updateDoc, serverTimestamp, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

export default function SupplierBalancesModal({ isOpen, onClose }) {
  const { isDarkMode } = useTheme();
  const { kits: storeKits, deleteStock } = useStore();
  const [allKits, setAllKits] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Fetch ALL kits for a complete balance report
  useEffect(() => {
    const fetchFullInventory = async () => {
      if (storeKits && storeKits.length > 0) {
        setAllKits(storeKits);
        return;
      }
      setIsSyncing(true);
      try {
        const snap = await getDocs(collection(db, "kits"));
        const kitsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllKits(kitsData);
      } catch (e) {
        console.error("Failed to fetch kits for balance report:", e);
        setAllKits(storeKits || []); 
      } finally {
        setIsSyncing(false);
      }
    };

    if (isOpen) {
      fetchFullInventory();
    }
  }, [isOpen]);

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
        const isPreOrder = stock.status?.toLowerCase().includes('pre') || stock.status?.toLowerCase().includes('batch');
        const isPaidInFull = cost > 0 && paid >= cost;
        const isRefundPending = stock.supplierRefundStatus === 'pending';
        const refundAmount = Number(stock.supplierRefundAmount ?? paid) || 0;

        // Keep outstanding balances and paid pre-orders visible until they
        // arrive or are explicitly cancelled. A paid pre-order awaiting a
        // supplier refund remains visible until the refund is confirmed.
        if (balance !== 0 || (isPreOrder && isPaidInFull) || isRefundPending) {
          items.push({
            ...stock,
            balance,
            cost,
            paid,
            isPreOrder,
            isPaidInFull,
            isRefundPending,
            refundAmount
          });
        }
      });
    });

    return items.sort((a, b) => {
      if (a.isRefundPending && !b.isRefundPending) return -1;
      if (!a.isRefundPending && b.isRefundPending) return 1;
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

      if (item.isRefundPending) {
        monthLabel = 'SUPPLIER REFUND PENDING';
      } else if (item.isPreOrder) {
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

  const pendingRefundTotal = useMemo(() => {
    return balanceItems
      .filter(item => item.isRefundPending)
      .reduce((sum, item) => sum + item.refundAmount, 0);
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
        [`stocks.${item.key}.kitCondition`]: 'SEALED',
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
    if (item.isRefundPending) return;

    if (item.isPreOrder && item.isPaidInFull) {
      if (!window.confirm("This pre-order is fully paid to the supplier. Cancel it and keep the stock visible as REFUND PENDING until the supplier refund is received?")) return;

      try {
        const kit = allKits.find(candidate => candidate.id === item.kitId) || storeKits.find(candidate => candidate.id === item.kitId);
        if (!kit?.stocks?.[item.key]) throw new Error('Stock item no longer exists.');
        const hasAvailableStock = Object.entries(kit.stocks).some(([key, stock]) => (
          key !== item.key && !stock.order?.orderId && !stock.isReserved
        ));

        await updateDoc(doc(db, 'kits', item.kitId), {
          [`stocks.${item.key}.isReserved`]: true,
          [`stocks.${item.key}.reservedBy`]: null,
          [`stocks.${item.key}.reservedAt`]: null,
          [`stocks.${item.key}.reservationType`]: 'supplier-refund',
          [`stocks.${item.key}.supplierRefundStatus`]: 'pending',
          [`stocks.${item.key}.supplierRefundAmount`]: item.paid,
          [`stocks.${item.key}.supplierRefundRequestedAt`]: serverTimestamp(),
          hasAvailableStock,
          lastUpdated: serverTimestamp()
        });

        // A supplier-cancelled stock must not remain in the separate admin
        // shelf collection while it is waiting for a refund.
        const shelfSnap = await getDocs(query(
          collection(db, 'shelf'),
          where('id', '==', item.kitId)
        ));
        const matchingShelfDocs = shelfSnap.docs.filter((shelfDoc) => (
          shelfDoc.data()?.stockKey === item.key
        ));
        if (matchingShelfDocs.length > 0) {
          const shelfBatch = writeBatch(db);
          matchingShelfDocs.forEach((shelfDoc) => shelfBatch.delete(shelfDoc.ref));
          await shelfBatch.commit();
        }

        alert("Stock cancelled and retained as refund pending.");
        await refreshKits();
      } catch (e) {
        console.error("Refund-pending cancellation failed", e);
        alert("Failed to mark stock as refund pending.");
      }
      return;
    }

    if (!window.confirm("Are you sure you want to cancel this stock item? This will permanently remove it.")) return;

    try {
      await deleteStock(item.kitId, item.key);
      alert("Stock item removed!");
      await refreshKits();
    } catch (e) {
      console.error("Removal failed", e);
      alert("Failed to remove stock.");
    }
  };

  const markRefunded = async (item) => {
    if (!item.isRefundPending) return;
    if (!window.confirm(`Confirm that the supplier refund of ₱${item.refundAmount.toLocaleString()} was received? This will permanently delete the retained stock record.`)) return;

    try {
      await deleteStock(item.kitId, item.key);
      alert("Supplier refund recorded and stock removed.");
      await refreshKits();
    } catch (e) {
      console.error("Refunded stock removal failed", e);
      alert("Failed to remove the refunded stock.");
    }
  };

// APAT NA DYNAMIC STYLING CONDITIONS BASE SA IYONG UPDATE
  const getItemCardStyles = (item) => {
    if (item.isRefundPending) {
      return isDarkMode
        ? 'bg-purple-500/10 border-purple-500/30 text-white'
        : 'bg-purple-50/70 border-purple-500/25 text-neutral-900';
    }
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
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-white/5 pb-2 md:flex md:justify-between md:gap-3">
                      <div className="flex min-w-0 items-center gap-2 md:gap-3">
                        <div className={`h-1.5 w-1.5 rounded-full ${group.label.includes('ON-HAND') ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        <h4 className="min-w-0 flex-1 text-[10px] font-black uppercase leading-tight tracking-[0.16em] opacity-60 md:text-[11px] md:tracking-[0.2em]">
                          {group.label}
                        </h4>
                        
                        {/* PAID ALL BUTTON */}
                        <button
                          onClick={() => handlePayGroup(group)}
                          disabled={isSyncing || group.items.filter(item => Number(item.paid || 0) === 0).length === 0}
                          className="ml-1 flex shrink-0 items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[10px] font-black uppercase leading-tight tracking-tight text-white transition-all hover:bg-blue-700 disabled:opacity-50 md:ml-2 md:py-0.5 md:text-[12px]"
                        >
                          <CheckSquare size={10} />
                          Paid All ({group.items.filter(item => Number(item.paid || 0) === 0).length})
                        </button>
                      </div>
                      <div className="min-w-0 text-right">
                        <span className="mr-1 inline-block max-w-[4.5rem] align-middle text-[10px] font-black uppercase leading-tight tracking-[0.12em] opacity-30 md:mr-2 md:max-w-none md:text-[12px] md:tracking-widest">Monthly Total</span>
                        <span className={`text-[13px] font-black italic ${group.total > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                          ₱{group.total.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Items in this group */}
                  <div className="grid gap-4">
                    {group.items.map((item, idx) => {
                      const isOnHand = item.status?.toLowerCase() === 'onhand';

                      return (
                      <div
                        key={`${item.kitId}-${item.key}-${idx}`}
                        className={`flex min-w-0 flex-col gap-3 rounded-3xl border p-3 transition-all hover:scale-[1.01] md:flex-row md:items-center md:gap-4 md:p-4 ${getItemCardStyles(item)}`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-4">
                          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-black/10">
                            <img
                              src={item.kitImage}
                              alt={item.kitName}
                              className="h-full w-full object-cover"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
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
                                        [`stocks.${item.key}.kitCondition`]: 'SEALED',
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
                        </div>

                        <div className="w-full min-w-0 md:w-auto md:shrink-0 md:text-right">
                          <div className="flex items-baseline justify-end gap-2">
                          <p className="text-[10px] font-black uppercase tracking-widest opacity-40">{item.isRefundPending ? 'Refund Pending' : item.isPaidInFull ? 'Paid' : 'Balance'}</p>
                          <p className={`text-sm font-black italic ${item.isRefundPending ? 'text-purple-500' : item.isPaidInFull ? 'text-emerald-500' : item.balance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                            {item.isRefundPending ? `₱${item.refundAmount.toLocaleString()}` : item.isPaidInFull ? `₱${item.paid.toLocaleString()}` : `₱${item.balance.toLocaleString()}`}
                          </p>
                          </div>
                          {item.isRefundPending && (
                            <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-purple-500">Retained until supplier refund</p>
                          )}
                          <div className="mt-2 flex flex-wrap justify-end gap-1">
                            {item.isRefundPending ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markRefunded(item);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-2 py-1 text-[11px] font-black uppercase text-white hover:bg-purple-700 transition-all"
                              >
                                <CheckCircle2 size={12} /> Refunded
                              </button>
                            ) : (
                              <>
                              {!isOnHand && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markArrived(item);
                                }}
                                className="rounded-lg bg-emerald-500 px-2 py-1 text-[11px] font-black uppercase text-white hover:bg-emerald-600 transition-all"
                              >
                                Arrived
                              </button>
                            )}
                            {!item.isPaidInFull && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markPaid(item);
                                }}
                                className="rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-black uppercase text-white hover:bg-blue-700 transition-all"
                              >
                                Paid
                              </button>
                            )}
                            {!isOnHand && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  cancelStock(item);
                                }}
                                className="rounded-lg bg-red-500/10 px-2 py-1 text-[11px] font-black uppercase text-red-500 hover:bg-red-500 hover:text-white transition-all"
                              >
                                Cancel
                              </button>
                            )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      );
                    })}
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
        <div className="shrink-0 border-t border-white/10 bg-black/5 p-4 md:p-6">
          <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-4 md:flex md:items-center md:justify-between md:gap-8">
            <div className="flex min-w-0 flex-col gap-1 md:flex-row md:flex-wrap md:items-center md:gap-8">
              <p className="text-[9px] font-black uppercase leading-tight tracking-[0.16em] opacity-45 md:text-[10px] md:tracking-[0.2em]">
                Total Outstanding
              </p>
              <h3 className={`text-xl font-black italic tracking-tighter md:text-2xl ${totalBalance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                ₱{totalBalance.toLocaleString()}
              </h3>
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase leading-tight tracking-[0.16em] text-purple-500 md:text-[10px] md:tracking-[0.2em]">
                Pending Supplier Refund
              </p>
              <h3 className="text-xl font-black italic tracking-tighter text-purple-500 md:text-2xl">
                ₱{pendingRefundTotal.toLocaleString()}
              </h3>
            </div>
            <div className="col-span-2 flex min-w-0 items-center justify-center gap-2 rounded-2xl bg-blue-600/10 px-3 py-3 text-blue-500 md:col-span-1 md:justify-start md:px-4">
              <AlertCircle size={18} />
              <span className="text-center text-[9px] font-black uppercase leading-tight tracking-[0.14em] md:text-left md:text-[10px] md:tracking-widest">
                {balanceItems.length} Variants to settle
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
