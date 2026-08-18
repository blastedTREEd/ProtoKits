import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Gift, Lock, Ban, Search, ChevronRight, ChevronLeft, Loader2, Edit3, Calendar, Clock3, RefreshCw, CheckSquare, Square, GripVertical, Image as ImageIcon } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTheme } from '../../context/ThemeContext';
import { getCheckoutPaymentFees } from '../../utils/paymentSettings';
import { distributeRoundedBundlePrices, getClearanceBundlePricing, getHighestCostStock } from '../../utils/bundlePricing';

/* ─── Image resolver ─── */
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

function getPreviewTileClass(total, index) {
  if (total === 1) return 'col-span-2 row-span-2';
  if (total === 2) return 'col-span-2';
  if (total === 3 && index === 0) return 'col-span-2';
  return '';
}

function stockMatchesSource(stock, source = 'onhand') {
  const status = String(stock?.status || '').toLowerCase();
  const isPreOrder = status.includes('pre') || status.includes('batch');
  return source === 'preorder' ? isPreOrder : !isPreOrder;
}

function getHighestOnhandStock(kit) {
  const onhandStocks = Object.values(kit?.stocks || {}).filter(stock => stockMatchesSource(stock, 'onhand'));
  if (onhandStocks.length === 0) return {};
  const purchasableStocks = onhandStocks.filter(stock => isBundlePurchasableStock(stock, 'onhand'));
  return getHighestCostStock(purchasableStocks.length > 0 ? purchasableStocks : onhandStocks) || {};
}

function isBundlePurchasableStock(stock, source = 'onhand') {
  if (!stock || stock.order?.orderId || !stockMatchesSource(stock, source)) return false;
  return !stock.isReserved || stock.reservationType === 'admin';
}

function getBundleDiscountBreakdown(kits = [], selectedIds = [], exclusiveIds = [], discountAmount = 0, exclusivePercent = 100) {
  const selected = getOrderedKits(kits, selectedIds);
  const exclusiveSet = new Set(exclusiveIds);
  const rows = selected.map(kit => {
    const stock = getHighestOnhandStock(kit);
    const sell = Number(stock.sellPrice || kit.sellPrice || 0);
    const cost = Number(stock.costPrice || 0);
    const isExclusive = exclusiveSet.has(kit.id);
    return { kit, stock, sell, cost, isExclusive, discount: 0, finalPrice: sell };
  });

  const totalSell = rows.reduce((sum, row) => sum + row.sell, 0);
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);
  const cappedDiscount = Math.min(Math.max(Number(discountAmount) || 0, 0), totalSell);
  const exclusiveTotal = rows.filter(row => row.isExclusive).reduce((sum, row) => sum + row.sell, 0);
  const standardTotal = rows.filter(row => !row.isExclusive).reduce((sum, row) => sum + row.sell, 0);
  const exclusivePool = exclusiveTotal > 0 ? cappedDiscount * (Math.min(100, Math.max(0, Number(exclusivePercent) || 0)) / 100) : 0;
  const standardPool = cappedDiscount - exclusivePool;

  const rowsWithRawPrices = rows.map(row => {
    let discount = 0;
    if (row.isExclusive && exclusiveTotal > 0) {
      discount = exclusivePool * (row.sell / exclusiveTotal);
    } else if (!row.isExclusive && standardTotal > 0) {
      discount = standardPool * (row.sell / standardTotal);
    }
    return {
      ...row,
      discount,
      rawFinalPrice: Math.max(0, row.sell - discount)
    };
  });
  const bundlePrice = Math.max(0, totalSell - cappedDiscount);
  const withDiscounts = distributeRoundedBundlePrices(rowsWithRawPrices, bundlePrice).map(row => ({
    ...row,
    discount: Math.max(0, row.sell - row.finalPrice)
  }));

  return {
    rows: withDiscounts,
    totalSell,
    totalCost,
    discountAmount: cappedDiscount,
    bundlePrice,
    projectedProfit: totalSell - totalCost - cappedDiscount
  };
}

function getDealCountdownLabel(validUntil) {
  const endDate = parseLocalDateTime(validUntil);
  if (!endDate) return 'NO END DATE';
  const diffMs = endDate.getTime() - Date.now();
  if (diffMs <= 0) return 'EXPIRED';
  if (diffMs <= 86400000) return 'LAST DAY';
  const diffDays = Math.ceil(diffMs / 86400000);
  return `${diffDays} ${diffDays === 1 ? 'DAY' : 'DAYS'} LEFT`;
}

/* ─── Date picker helpers (same as AddKitModal) ─── */
function parseLocalDateTime(value) {
  if (!value) return null;
  const [datePart, timePart = '00:00'] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  if (![year, month, day, hours, minutes].every(Number.isFinite)) return null;
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function formatLocalDateTimeValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getMonthMatrix(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/* ─── Inline Date Picker ─── */
function DealDatePicker({
  value,
  onChange,
  disabled = false,
  isDarkMode,
  placeholder,
  allowClear = true,
  align = 'left'
}) {
  const pickerRef = useRef(null);
  const selectedDate = useMemo(() => parseLocalDateTime(value), [value]);
  const [isOpen, setIsOpen] = useState(false);

  const initialDate = useMemo(() => selectedDate || new Date(), [selectedDate]);
  const [draftDate, setDraftDate] = useState(initialDate);
  const [viewDate, setViewDate] = useState(initialDate);

  useEffect(() => {
    setDraftDate(initialDate);
    setViewDate(initialDate);
  }, [initialDate]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!pickerRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  const monthCells = useMemo(() => getMonthMatrix(viewDate), [viewDate]);

  const applyDraft = (date) => {
    onChange(formatLocalDateTimeValue(date));
  };

  const updateDraftTime = (type, nextValue) => {
    const nextDate = new Date(draftDate);
    if (type === 'hours') nextDate.setHours(Number(nextValue));
    if (type === 'minutes') nextDate.setMinutes(Number(nextValue));
    setDraftDate(nextDate);
    applyDraft(nextDate);
  };

  const selectDay = (dayDate) => {
    if (!dayDate) return;
    const nextDate = new Date(dayDate);
    nextDate.setHours(draftDate.getHours(), draftDate.getMinutes(), 0, 0);
    setDraftDate(nextDate);
    applyDraft(nextDate);
  };

  const shellClass = isDarkMode
    ? 'bg-white/5 border-white/10 text-white'
    : 'bg-neutral-50 border-black/10 text-neutral-900';
  const popoverClass = isDarkMode
    ? 'bg-[#111214] border-white/10 text-white'
    : 'bg-white border-black/10 text-neutral-900';

  const pickerPanel = (
    <div className={`absolute top-full mt-2 z-[120] w-[280px] ${align === 'right' ? 'right-0' : 'left-0'} rounded-[1.5rem] border p-4 shadow-2xl ${popoverClass}`}>
      <div className="mb-4 flex items-center justify-between">
        <button type="button" onClick={() => setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
          className="rounded-xl border border-white/10 p-2 transition-all hover:bg-white/5"><ChevronLeft size={14} /></button>
        <p className="text-[11px] font-black uppercase tracking-[0.2em]">
          {viewDate.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}
        </p>
        <button type="button" onClick={() => setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
          className="rounded-xl border border-white/10 p-2 transition-all hover:bg-white/5"><ChevronRight size={14} /></button>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[12px] font-black uppercase tracking-widest opacity-45">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (<span key={`${day}-${i}`}>{day}</span>))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {monthCells.map((dayDate, index) => {
          const isSelected = dayDate && draftDate.getFullYear() === dayDate.getFullYear() &&
            draftDate.getMonth() === dayDate.getMonth() && draftDate.getDate() === dayDate.getDate();
          return (
            <button key={`${dayDate ? dayDate.toISOString() : 'empty'}-${index}`} type="button" onClick={() => selectDay(dayDate)} disabled={!dayDate}
              className={`h-9 rounded-xl text-[11px] font-black transition-all ${!dayDate ? 'cursor-default opacity-0' : isSelected ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'hover:bg-blue-600/10'}`}>
              {dayDate?.getDate() || '.'}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <select value={String(draftDate.getHours()).padStart(2, '0')} onChange={(e) => updateDraftTime('hours', e.target.value)}
          className={`rounded-xl border px-3 py-2 text-xs font-black outline-none ${shellClass}`}>
          {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')).map(h => (<option key={h} value={h}>{h} H</option>))}
        </select>
        <select value={String(draftDate.getMinutes()).padStart(2, '0')} onChange={(e) => updateDraftTime('minutes', e.target.value)}
          className={`rounded-xl border px-3 py-2 text-xs font-black outline-none ${shellClass}`}>
          {Array.from({ length: 12 }, (_, s) => String(s * 5).padStart(2, '0')).map(m => (<option key={m} value={m}>{m} M</option>))}
        </select>
      </div>

      <div className="mt-4 flex gap-2">
        {allowClear && (
          <button type="button" onClick={() => { onChange(''); setIsOpen(false); }}
            className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-[11px] font-black uppercase tracking-widest opacity-70 transition-all hover:bg-white/5">Clear</button>
        )}
        <button type="button" onClick={() => setIsOpen(false)}
          className="flex-1 rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20">Done</button>
      </div>
    </div>
  );

  return (
    <div ref={pickerRef} className="relative">
      <button type="button" onClick={() => !disabled && setIsOpen(prev => !prev)} disabled={disabled}
        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-xs font-bold transition-all ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${shellClass}`}>
        <span className={value ? '' : 'opacity-45'}>
          {value ? parseLocalDateTime(value)?.toLocaleString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : placeholder}
        </span>
        <span className="flex items-center gap-2">
          <Clock3 size={14} className="opacity-50" />
          <Calendar size={14} className="opacity-70" />
        </span>
      </button>
      {isOpen && !disabled && pickerPanel}
    </div>
  );
}

/* ─── Main Modal ─── */
export default function AddDealModal({ isOpen, onClose, dealToEdit = null }) {
  const { kits, deals, addDeal, updateDeal, deleteDeal, shippingSettings } = useStore();
  const { isDarkMode } = useTheme();
  
  const [dealType, setDealType] = useState('bundle_only'); 
  const [dealName, setDealName] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [selectedKitIds, setSelectedKitIds] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [activeEditId, setActiveEditId] = useState(null);
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [previewKitIds, setPreviewKitIds] = useState([]);
  const [draggedPreviewKitId, setDraggedPreviewKitId] = useState(null);
  const [exclusiveKitIds, setExclusiveKitIds] = useState([]);
  const [clearanceKitIds, setClearanceKitIds] = useState([]);
  const [clearanceDiscounts, setClearanceDiscounts] = useState({});

  // Bulk selection state for right column
  const [selectedDealIds, setSelectedDealIds] = useState([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [mobileTab, setMobileTab] = useState('creator'); // 'creator' | 'list'


  // Pre-fill if editing
  useEffect(() => {
    if (dealToEdit && isOpen) {
      let mappedType = dealToEdit.type || 'bundle_only';
      if (mappedType === 'bundle' || mappedType === 'bundle_discount') mappedType = 'bundle_only';
      if (mappedType === 'requirement' || mappedType === 'exclusion') mappedType = 'mutually_exclusive';
      
      setDealType(mappedType);
      setDealName(dealToEdit.name || '');
      setActiveEditId(dealToEdit.id);
      setValidFrom(dealToEdit.validFrom || '');
      setValidUntil(dealToEdit.validUntil || '');
      
      let disc = 0;
      if (dealToEdit.discountAmount !== undefined) {
        disc = dealToEdit.discountAmount;
      } else if (dealToEdit.bundlePrice !== undefined && dealToEdit.totalSell) {
        disc = Math.max(0, dealToEdit.totalSell - dealToEdit.bundlePrice);
      }
      setDiscountAmount(disc || '');
      
      let kids = dealToEdit.kitIds || [];
      if (dealToEdit.targetKitId) {
        kids = [dealToEdit.targetKitId];
        if (dealToEdit.forbiddenKitId) kids.push(dealToEdit.forbiddenKitId);
        if (dealToEdit.requiredKitIds) kids.push(...dealToEdit.requiredKitIds);
      }
      if (mappedType === 'clearance') {
        const clearanceKitId = (dealToEdit.clearanceKitIds || [])[0] || kids[0];
        kids = clearanceKitId ? [clearanceKitId] : [];
      }
      setSelectedKitIds(kids);
      setPreviewKitIds((dealToEdit.previewKitIds || kids).filter(id => kids.includes(id)));
      setExclusiveKitIds(dealToEdit.exclusiveKitIds || []);
      setClearanceKitIds(mappedType === 'clearance' ? kids : []);
      setClearanceDiscounts(mappedType === 'clearance' && kids[0]
        ? { [kids[0]]: dealToEdit.clearanceDiscounts?.[kids[0]] ?? '' }
        : {});
      setMobileTab('creator');
    } else if (isOpen) {
      setDealType('bundle_only'); 
      setDealName(''); 
      setDiscountAmount(''); 
      setSelectedKitIds([]);
      setSearchTerm('');
      setActiveEditId(null);
      setValidFrom('');
      setValidUntil('');
      setPreviewKitIds([]);
      setDraggedPreviewKitId(null);
      setExclusiveKitIds([]);
      setClearanceKitIds([]);
      setClearanceDiscounts({});
      setSelectedDealIds([]);
      setMobileTab('creator');
    }
  }, [dealToEdit, isOpen]);

  const selectedKitsData = useMemo(() => {
    return getOrderedKits(kits, selectedKitIds);
  }, [kits, selectedKitIds]);

  const previewKitsData = useMemo(() => {
    return getOrderedKits(kits, previewKitIds).slice(0, 4);
  }, [kits, previewKitIds]);

  useEffect(() => {
    setPreviewKitIds(prev => {
      const kept = prev.filter(id => selectedKitIds.includes(id));
      const added = selectedKitIds.filter(id => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [selectedKitIds]);

  const exclusiveDiscountPercent = useMemo(() => {
    return getCheckoutPaymentFees({ shippingSettings }).exclusiveDiscountPercent;
  }, [shippingSettings]);

  const financialSummary = useMemo(() => {
    if (dealType === 'clearance') {
      const rows = selectedKitsData.map(kit => {
        const stock = getHighestOnhandStock(kit);
        return {
          kit,
          stock,
          kitId: kit.id,
          sellPrice: Number(stock.sellPrice || kit.sellPrice || 0),
          costPrice: Number(stock.costPrice || 0)
        };
      });
      return getClearanceBundlePricing(rows, clearanceKitIds, clearanceDiscounts);
    }
    return getBundleDiscountBreakdown(kits, selectedKitIds, exclusiveKitIds, parseFloat(discountAmount) || 0, exclusiveDiscountPercent);
  }, [dealType, selectedKitsData, clearanceKitIds, clearanceDiscounts, kits, selectedKitIds, exclusiveKitIds, discountAmount, exclusiveDiscountPercent]);

  const kitSearchResults = useMemo(() => {
    if (!searchTerm) return [];
    const lowerSearch = searchTerm.toLowerCase();
    return (kits || []).filter(k => {
      const target = [k.name, k.brand, k.specs?.line].filter(Boolean).join(' ').toLowerCase();
      return target.includes(lowerSearch) && !selectedKitIds.includes(k.id);
    }).slice(0, 5);
  }, [kits, searchTerm, selectedKitIds]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const stateKey = `add-deal-modal-${Date.now()}`;
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

  if (!isOpen) return null;

  const toggleKitSelection = (id) => {
    if (dealType === 'clearance') {
      setSelectedKitIds(prev => {
        if (prev.includes(id)) {
          setClearanceKitIds([]);
          setClearanceDiscounts({});
          return [];
        }
        setClearanceKitIds([id]);
        setClearanceDiscounts(prevDiscounts => ({ [id]: prevDiscounts[id] ?? '' }));
        return [id];
      });
      return;
    }

    if (dealType === 'mutually_exclusive') {
      // Mutually exclusive can only have 2 kits
      setSelectedKitIds(prev => {
        if (prev.includes(id)) {
          setExclusiveKitIds(ex => ex.filter(i => i !== id));
          setClearanceKitIds(clearance => clearance.filter(i => i !== id));
          setClearanceDiscounts(discounts => {
            const next = { ...discounts };
            delete next[id];
            return next;
          });
          return prev.filter(i => i !== id);
        }
        if (prev.length >= 2) {
          alert("Mutually exclusive strategy only supports up to 2 kits.");
          return prev;
        }
        return [...prev, id];
      });
    } else {
      setSelectedKitIds(prev => {
        if (prev.includes(id)) {
          setExclusiveKitIds(ex => ex.filter(i => i !== id));
          setClearanceKitIds(clearance => clearance.filter(i => i !== id));
          setClearanceDiscounts(discounts => {
            const next = { ...discounts };
            delete next[id];
            return next;
          });
          return prev.filter(i => i !== id);
        }
        return [...prev, id];
      });
    }
  };

  const handleEditSavedDeal = (deal) => {
    let mappedType = deal.type || 'bundle_only';
    if (mappedType === 'bundle' || mappedType === 'bundle_discount') mappedType = 'bundle_only';
    if (mappedType === 'requirement' || mappedType === 'exclusion') mappedType = 'mutually_exclusive';
    
    setDealType(mappedType);
    setDealName(deal.name || '');
    setActiveEditId(deal.id);
    setValidFrom(deal.validFrom || '');
    setValidUntil(deal.validUntil || '');
    
    let disc = 0;
    if (deal.discountAmount !== undefined) {
      disc = deal.discountAmount;
    } else if (deal.bundlePrice !== undefined && deal.totalSell) {
      disc = Math.max(0, deal.totalSell - deal.bundlePrice);
    }
    setDiscountAmount(disc || '');
    
    let kids = deal.kitIds || [];
    if (deal.targetKitId) {
      kids = [deal.targetKitId];
      if (deal.forbiddenKitId) kids.push(deal.forbiddenKitId);
      if (deal.requiredKitIds) kids.push(...deal.requiredKitIds);
    }
    if (mappedType === 'clearance') {
      const clearanceKitId = (deal.clearanceKitIds || [])[0] || kids[0];
      kids = clearanceKitId ? [clearanceKitId] : [];
    }
    setSelectedKitIds(kids);
    setPreviewKitIds((deal.previewKitIds || kids).filter(id => kids.includes(id)));
    setExclusiveKitIds(deal.exclusiveKitIds || []);
    setClearanceKitIds(mappedType === 'clearance' ? kids : []);
    setClearanceDiscounts(mappedType === 'clearance' && kids[0]
      ? { [kids[0]]: deal.clearanceDiscounts?.[kids[0]] ?? '' }
      : {});
    setSearchTerm('');
    setMobileTab('creator');
  };

  const movePreviewKit = (draggedId, targetId) => {
    if (!draggedId || !targetId || draggedId === targetId) return;
    setPreviewKitIds(prev => {
      const next = [...prev];
      const from = next.indexOf(draggedId);
      const to = next.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      next.splice(from, 1);
      next.splice(to, 0, draggedId);
      return next;
    });
  };

  const handleSave = async () => {
    if (!dealName) return alert("Please enter a deal name");
    if (dealType === 'clearance' && selectedKitIds.length !== 1) {
      return alert("Pick exactly 1 kit for a clearance deal");
    }
    if (dealType !== 'clearance' && selectedKitIds.length < 2) {
      return alert(dealType === 'mutually_exclusive' ? "Pick exactly 2 kits for mutual exclusion" : "Pick at least 2 kits for this deal");
    }
    if (dealType === 'mutually_exclusive' && selectedKitIds.length !== 2) {
      return alert("Pick exactly 2 kits for mutual exclusion");
    }
    
    let dealData = {
      id: activeEditId || null,
      type: dealType,
      name: dealName.toUpperCase(),
      isActive: true,
      kitIds: selectedKitIds,
      previewKitIds,
      exclusiveKitIds: dealType === 'bundle_only' ? exclusiveKitIds : [],
      clearanceKitIds: dealType === 'clearance' ? [selectedKitIds[0]] : [],
      clearanceDiscounts: dealType === 'clearance' ? { [selectedKitIds[0]]: clearanceDiscounts[selectedKitIds[0]] ?? '' } : {},
    };

    if (dealType === 'bundle_only') {
      const publishDate = new Date();
      const defaultValidUntil = new Date(publishDate);
      defaultValidUntil.setDate(defaultValidUntil.getDate() + 7);
      dealData.discountAmount = parseFloat(discountAmount) || 0;
      dealData.bundlePrice = financialSummary.bundlePrice;
      dealData.totalCost = financialSummary.totalCost;
      dealData.totalSell = financialSummary.totalSell;
      dealData.exclusiveDiscountPercent = exclusiveDiscountPercent;
      dealData.kitDiscounts = Object.fromEntries(financialSummary.rows.map(row => [
        row.kit.id,
        {
          discount: Math.round(row.discount),
          finalPrice: row.finalPrice,
          isExclusive: row.isExclusive,
          sellPrice: row.sell
        }
      ]));
      dealData.validFrom = validFrom || formatLocalDateTimeValue(publishDate);
      dealData.validUntil = validUntil || formatLocalDateTimeValue(defaultValidUntil);
      dealData.stockSource = 'onhand';
    }

    if (dealType === 'clearance') {
      const clearanceSummary = financialSummary;
      if (selectedKitIds.length !== 1) return alert('Choose exactly one clearance kit.');
      dealData.bundlePrice = clearanceSummary.bundlePrice;
      dealData.totalCost = clearanceSummary.totalCost;
      dealData.totalSell = clearanceSummary.totalSell;
      dealData.discountAmount = clearanceSummary.discountAmount;
      dealData.clearanceDiscountTotal = clearanceSummary.clearanceDiscountTotal;
      dealData.standardDiscountTotal = clearanceSummary.standardDiscountTotal;
      dealData.kitDiscounts = Object.fromEntries(clearanceSummary.rows.map(row => [
        row.kitId,
        {
          discount: Math.round(row.discount || 0),
          finalPrice: row.finalPrice,
          isClearance: row.isClearance,
          clearancePrice: row.clearancePrice,
          sellPrice: row.sellPrice,
          costPrice: row.costPrice
        }
      ]));
      const publishDate = new Date();
      const defaultValidUntil = new Date(publishDate);
      defaultValidUntil.setDate(defaultValidUntil.getDate() + 7);
      dealData.validFrom = validFrom || formatLocalDateTimeValue(publishDate);
      dealData.validUntil = validUntil || formatLocalDateTimeValue(defaultValidUntil);
      dealData.stockSource = 'onhand';
    }

    // Check if all included kits have purchasable stock — auto-deactivate if not
    if (dealType === 'bundle_only' || dealType === 'clearance') {
      const unfulfillableKits = selectedKitIds.filter(kidId => {
        const kit = kits.find(k => k.id === kidId);
        if (!kit) return true;
        const stocks = Object.values(kit.stocks || {});
        return !stocks.some(s => isBundlePurchasableStock(s, 'onhand'));
      });
      if (unfulfillableKits.length > 0) {
        const names = unfulfillableKits.map(id => kits.find(k => k.id === id)?.name || id).join(', ');
        dealData.isActive = false;
        alert(`Warning: The following kits have no available stock, so this deal will be saved as INACTIVE:\n${names}`);
      }
    }

    try {
      setIsSaving(true);
      await addDeal(dealData);
      alert("Success! Deal synchronized.");
      setDealName('');
      setDiscountAmount('');
      setSelectedKitIds([]);
      setSearchTerm('');
      setActiveEditId(null);
      setValidFrom('');
      setValidUntil('');
      setPreviewKitIds([]);
      setDraggedPreviewKitId(null);
      setExclusiveKitIds([]);
      setClearanceKitIds([]);
      setClearanceDiscounts({});
      setMobileTab('list');
    } catch (e) { 
      console.error(e); 
      alert("Error: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this deal? This will immediately release any exclusions or reserves associated with it.")) return;
    try {
      await deleteDeal(id);
      setSelectedDealIds(prev => prev.filter(d => d !== id));
      if (activeEditId === id) {
        setDealName('');
        setDiscountAmount('');
        setSelectedKitIds([]);
        setSearchTerm('');
        setActiveEditId(null);
        setValidFrom('');
        setValidUntil('');
        setPreviewKitIds([]);
        setDraggedPreviewKitId(null);
        setExclusiveKitIds([]);
      }
    } catch (e) {
      alert("Error deleting deal: " + e.message);
    }
  };

  /* ─── Bulk Actions ─── */
  const toggleDealSelection = (id) => {
    setSelectedDealIds(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  };

  const handleSelectAll = () => {
    if (!deals || deals.length === 0) return;
    if (selectedDealIds.length === deals.length) {
      setSelectedDealIds([]);
    } else {
      setSelectedDealIds(deals.map(d => d.id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedDealIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedDealIds.length} deal(s)? This will release all associated reserves.`)) return;
    setIsBulkProcessing(true);
    try {
      for (const id of selectedDealIds) {
        await deleteDeal(id);
        if (activeEditId === id) {
          setDealName(''); setDiscountAmount(''); setSelectedKitIds([]);
          setSearchTerm(''); setActiveEditId(null); setValidFrom(''); setValidUntil('');
          setPreviewKitIds([]); setDraggedPreviewKitId(null); setExclusiveKitIds([]);
        }
      }
      setSelectedDealIds([]);
      alert(`${selectedDealIds.length} deal(s) deleted.`);
    } catch (e) {
      alert("Bulk delete error: " + e.message);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkReactivate = async () => {
    if (selectedDealIds.length === 0) return;
    setIsBulkProcessing(true);
    try {
      for (const id of selectedDealIds) {
        await updateDeal(id, { isActive: true });
      }
      setSelectedDealIds([]);
      alert(`${selectedDealIds.length} deal(s) reactivated.`);
    } catch (e) {
      alert("Reactivation error: " + e.message);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const allSelected = deals && deals.length > 0 && selectedDealIds.length === deals.length;

  return (
    <div className="pointer-events-none fixed inset-0 z-[300] flex items-start justify-center" role="dialog" aria-modal="true" aria-label="Deal entry">
      <div className="pointer-events-auto relative mt-[56px] flex h-[calc(100dvh-56px)] w-full max-w-7xl min-h-0 flex-col overflow-hidden border-x border-t bg-[var(--color-surface)] text-[var(--color-text-main)] shadow-2xl sm:mt-[60px] sm:h-[calc(100dvh-60px)]">
        
        {/* Mobile sticky close button (same pattern as ProductCard) */}
        <div className="sticky top-0 z-[220] w-full h-0 overflow-visible md:hidden">
          <div className="absolute top-4 right-4 flex justify-end items-center">
            <button onClick={onClose} className="p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Header */}
        <div className="p-4 md:p-6 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-3 text-left">
            <div className={`p-2.5 rounded-xl ${activeEditId ? 'bg-amber-500' : 'bg-blue-600'}`}>
              <Gift size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase italic leading-none">{activeEditId ? 'Refine Deal' : 'Deal Architect'}</h2>
              <span className="text-[12px] font-black uppercase tracking-widest text-blue-500 opacity-80 mt-1 block">Bundles & Conditional Sales</span>
            </div>
          </div>
          {/* Desktop close button */}
          <button onClick={onClose} className="hidden md:block p-2 hover:bg-black/5 rounded-full transition-colors opacity-40"><X size={24} /></button>
        </div>

        {/* Mobile Tab Toggle */}
        <div className="flex md:hidden border-b border-[var(--color-border)] bg-black/5 dark:bg-white/[0.02] shrink-0">
          <button 
            type="button"
            onClick={() => setMobileTab('creator')} 
            className={`flex-1 py-3 text-center text-[11px] font-black uppercase tracking-wider transition-all border-b-2 ${mobileTab === 'creator' ? 'border-blue-600 text-blue-500 bg-blue-500/5' : 'border-transparent opacity-65'}`}
          >
            {activeEditId ? 'Edit Deal' : 'New Deal'}
          </button>
          <button 
            type="button"
            onClick={() => setMobileTab('list')} 
            className={`flex-1 py-3 text-center text-[11px] font-black uppercase tracking-wider transition-all border-b-2 ${mobileTab === 'list' ? 'border-blue-600 text-blue-500 bg-blue-500/5' : 'border-transparent opacity-65'}`}
          >
            Active List ({deals?.length || 0})
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* ══ Left Column - Creator Panel ══ */}
          <div className={`w-full md:w-6/12 p-4 md:p-6 md:border-r border-[var(--color-border)] space-y-5 overflow-y-auto custom-scrollbar ${mobileTab === 'creator' ? 'block' : 'hidden md:block'}`}>
             <div className="space-y-2 text-left">
                <label className="text-[12px] font-black uppercase tracking-widest opacity-40 ml-2">Select Strategy</label>
                <div className="grid grid-cols-3 gap-2">
                   <button onClick={() => { setDealType('bundle_only'); setSelectedKitIds([]); setExclusiveKitIds([]); setClearanceKitIds([]); setClearanceDiscounts({}); }} className={`py-3 rounded-2xl border flex flex-col items-center gap-1 transition-all ${dealType === 'bundle_only' ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg' : 'bg-black/5 border-[var(--color-border)] opacity-60'}`}>
                      <Lock size={16} /> <span className="text-[11px] font-black uppercase">Bundle Deal</span>
                   </button>
                   <button type="button" aria-pressed={dealType === 'clearance'} onClick={() => { setDealType('clearance'); setSelectedKitIds([]); setExclusiveKitIds([]); setClearanceKitIds([]); setClearanceDiscounts({}); }} className={`py-3 rounded-2xl border flex flex-col items-center gap-1 transition-all ${dealType === 'clearance' ? 'bg-amber-500 border-amber-500 text-white shadow-lg' : 'bg-black/5 border-[var(--color-border)] opacity-60'}`}>
                      <Gift size={16} /> <span className="text-[11px] font-black uppercase">Clearance</span>
                   </button>
                   <button onClick={() => { setDealType('mutually_exclusive'); setSelectedKitIds([]); setExclusiveKitIds([]); setClearanceKitIds([]); setClearanceDiscounts({}); }} className={`py-3 rounded-2xl border flex flex-col items-center gap-1 transition-all ${dealType === 'mutually_exclusive' ? 'bg-red-600 border-red-600 text-white shadow-lg' : 'bg-black/5 border-[var(--color-border)] opacity-60'}`}>
                      <Ban size={16} /> <span className="text-[11px] font-black uppercase">Mut. Excl</span>
                   </button>
                </div>
                {dealType === 'clearance' && (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-[11px] font-bold leading-relaxed text-amber-700 dark:text-amber-300">
                    <p className="font-black uppercase tracking-widest">Single clearance kit</p>
                    <p className="mt-1 opacity-80">Select one on-hand kit. Its clearance discount is unlocked in the basket only when another on-hand kit is selected with it.</p>
                  </div>
                )}
             </div>

             <div className="space-y-4">
                <div className="space-y-1 text-left">
                   <label className="text-[12px] font-black uppercase tracking-widest opacity-40 ml-2">Deal Name</label>
                   <input value={dealName} onChange={e => setDealName(e.target.value)} placeholder="E.G. PROMO PACK" className="w-full bg-black/5 border border-[var(--color-border)] rounded-2xl px-4 py-3 text-xs font-bold outline-none focus:border-blue-500 uppercase text-[var(--color-text-main)]" />
                </div>

                <div className="space-y-1 text-left relative">
                   <label className="text-[12px] font-black uppercase tracking-widest opacity-40 ml-2">Search & Add Kits</label>
                   <div className="relative">
                      <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-30" />
                      <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Type kit name..." className="w-full bg-black/5 border border-[var(--color-border)] rounded-2xl pl-10 pr-4 py-3 text-xs font-bold outline-none focus:border-blue-500 text-[var(--color-text-main)]" />
                   </div>

                   {/* Dropdown Suggestions */}
                   {kitSearchResults.length > 0 && (
                     <div className={`absolute left-0 right-0 mt-1 z-50 rounded-2xl border shadow-xl overflow-hidden ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-neutral-200'}`}>
                       {kitSearchResults.map(kit => {
                         const stocks = Object.values(kit.stocks || {});
                         const hasPurchasableStock = stocks.some(s => isBundlePurchasableStock(s, 'onhand'));
                         return (
                         <div key={kit.id} onClick={() => {
                           if (!hasPurchasableStock) {
                             alert("This kit has no available stock for purchase. Reserved items cannot be added to a bundle.");
                             return;
                           }
                           toggleKitSelection(kit.id); setSearchTerm('');
                         }} className={`p-3 flex items-center gap-3 cursor-pointer transition-colors border-b border-neutral-500/10 last:border-b-0 ${hasPurchasableStock ? 'hover:bg-blue-500/10' : 'bg-red-500/10 hover:bg-red-500/20 opacity-60'}`}>
                           <img src={resolveImage(kit.image, kit.images)} className="w-8 h-8 rounded object-cover bg-white" alt="" />
                           <div className="flex-1 text-left">
                             <p className={`text-[12px] font-black uppercase leading-tight truncate ${!hasPurchasableStock ? 'text-red-500' : ''}`}>{kit.name}</p>
                             <p className="text-[12px] font-bold opacity-50 mt-0.5 uppercase truncate">{[kit.brand, kit.specs?.line].filter(Boolean).join(' / ') || 'No brand or line'}</p>
                             <p className={`text-[12px] font-bold mt-0.5 ${!hasPurchasableStock ? 'text-red-400' : 'opacity-40'}`}>{hasPurchasableStock ? `₱${(kit.sellPrice || 0).toLocaleString()}` : 'NO STOCK'}</p>
                           </div>
                           <Plus size={14} className={hasPurchasableStock ? 'opacity-40' : 'opacity-20 text-red-400'} />
                         </div>
                         );
                       })}
                     </div>
                   )}
                </div>

                {(dealType === 'bundle_only' || dealType === 'clearance' || dealType === 'mutually_exclusive') && (
                  <div className="flex flex-col gap-4 animate-in zoom-in duration-300">
                    {selectedKitsData.length > 0 && (
                      <div className="space-y-4 text-left">
                        <div className="grid grid-cols-2 gap-4">
                          {/* Card Preview Column */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-3 px-1">
                              <label className="text-[12px] font-black uppercase tracking-widest opacity-40 flex items-center gap-1.5">
                                <ImageIcon size={10} /> Card Preview
                              </label>
                              <span className="text-[12px] font-black uppercase tracking-widest opacity-35">Highest onhand</span>
                            </div>
                            <div className="aspect-square w-full max-w-[150px] rounded-2xl bg-white dark:bg-black/20 border border-[var(--color-border)] p-2">
                              <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-2">
                                {previewKitsData.map((kit, idx) => (
                                  <div key={kit.id} className={`relative overflow-hidden rounded-xl bg-black/5 ${getPreviewTileClass(previewKitsData.length, idx)}`}>
                                    <img src={resolveImage(kit.image, kit.images)} className="h-full w-full object-cover" alt="" />
                                  </div>
                                ))}
                                {previewKitsData.length === 0 && (
                                  <div className="col-span-2 row-span-2 flex items-center justify-center text-emerald-600 opacity-20">
                                    <Gift size={32} strokeWidth={1.5} />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Bundle-level discount input, or clearance guidance. */}
                          <div className="space-y-1 flex flex-col justify-end pb-1">
                            {dealType === 'bundle_only' ? (
                              <>
                                <label className="text-[12px] font-black uppercase tracking-widest opacity-40 ml-2">Discount Amount (₱)</label>
                                <input type="number" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} placeholder="0.00" className="w-full bg-blue-600/10 border border-blue-600/30 rounded-2xl px-4 py-4 text-sm font-black text-blue-500 outline-none focus:border-blue-500" />
                              </>
                            ) : dealType === 'mutually_exclusive' ? (
                              <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-[12px] font-bold leading-relaxed text-red-600 dark:text-red-300">
                                Select exactly two kits. They cannot be sold together and will be automatically synchronized when either kit is reserved.
                              </p>
                            ) : (
                              <p className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-[12px] font-bold leading-relaxed text-amber-600">
                                Select the kits to clear. Their prices use the cost ceiling unless an item discount override is entered below.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Inclusions */}
                        <div className="min-w-0 space-y-2">
                          <div className="flex items-center justify-between gap-3 px-2">
                            <label className="text-[12px] font-black uppercase tracking-widest opacity-40">Inclusions ({selectedKitsData.length})</label>
                            <span className="text-[12px] font-black uppercase tracking-widest opacity-30">{dealType === 'clearance' ? '1 clearance kit' : dealType === 'mutually_exclusive' ? 'Exactly 2 kits / X to remove' : 'Drag to reorder / X to remove'}</span>
                          </div>
                          {getOrderedKits(kits, previewKitIds).map((kit, index) => {
                            const stock = getHighestOnhandStock(kit);
                            const isExclusive = exclusiveKitIds.includes(kit.id);
                            const discountRow = financialSummary.rows.find(row => row.kit.id === kit.id);
                            return (
                            <div
                              key={kit.id}
                              draggable
                              onDragStart={() => setDraggedPreviewKitId(kit.id)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => movePreviewKit(draggedPreviewKitId, kit.id)}
                              onDragEnd={() => setDraggedPreviewKitId(null)}
                              className={`flex cursor-grab items-center gap-2 rounded-xl border px-3 py-2 transition-all active:cursor-grabbing ${index < 4 ? 'border-blue-500/30 bg-blue-500/10' : 'border-[var(--color-border)] bg-black/5'}`}
                            >
                              <GripVertical size={14} className="shrink-0 opacity-40" />
                              <img src={resolveImage(kit.image, kit.images)} className="h-7 w-7 rounded-lg object-cover bg-white" alt="" />
                              <span className="min-w-0 flex-1 truncate text-[12px] font-black uppercase">{kit.name}</span>
                              <div className="shrink-0 text-right leading-tight mr-1">
                                <span className="block text-[12px] font-black uppercase text-emerald-500">SELL ₱{Number(stock.sellPrice || kit.sellPrice || 0).toLocaleString()}</span>
                                <span className="block text-[12px] font-black uppercase opacity-35">COST ₱{Number(stock.costPrice || 0).toLocaleString()}</span>
                                <span className={`block text-[12px] font-black uppercase ${dealType === 'clearance' ? 'text-amber-500' : 'text-blue-500'}`}>DEAL ₱{Number(discountRow?.finalPrice || stock.sellPrice || kit.sellPrice || 0).toLocaleString()}</span>
                              </div>
                              {dealType === 'bundle_only' ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setExclusiveKitIds(prev =>
                                      prev.includes(kit.id)
                                        ? prev.filter(id => id !== kit.id)
                                        : [...prev, kit.id]
                                    );
                                  }}
                                  onDragStart={(event) => event.preventDefault()}
                                  className={`shrink-0 h-7 px-2 rounded-lg text-[11px] font-black uppercase tracking-wider italic transition-all ${
                                    isExclusive
                                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 active:scale-95'
                                      : 'bg-black/5 dark:bg-white/5 text-[var(--color-text-main)] opacity-50 hover:opacity-100 hover:bg-black/10'
                                  }`}
                                >
                                  {isExclusive ? 'EXCLUSIVE ✔' : 'STANDARD'}
                                </button>
                              ) : dealType === 'mutually_exclusive' ? (
                                <span className="shrink-0 rounded-lg bg-red-500 px-3 py-2 text-[11px] font-black uppercase tracking-wider italic text-white shadow-md shadow-red-500/20">
                                  EXCLUDED KIT
                                </span>
                              ) : (
                                <div className="flex shrink-0 items-center gap-1">
                                  <span className="h-8 rounded-lg bg-amber-500 px-3 py-2 text-[11px] font-black uppercase tracking-wider italic text-white shadow-md shadow-amber-500/20">
                                    CLEARANCE KIT
                                  </span>
                                  <input
                                    type="number"
                                    min="0"
                                    value={clearanceDiscounts[kit.id] ?? ''}
                                    onChange={(event) => setClearanceDiscounts(prev => ({ ...prev, [kit.id]: event.target.value }))}
                                    placeholder="Override"
                                    title="Discount override from original sell price"
                                    className="h-7 w-20 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 text-[11px] font-black text-amber-600 outline-none focus:border-amber-500"
                                  />
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleKitSelection(kit.id);
                                }}
                                onDragStart={(event) => event.preventDefault()}
                                className="shrink-0 rounded-full p-1 opacity-50 transition-all hover:bg-red-500/10 hover:text-red-500 hover:opacity-100"
                                title="Remove inclusion"
                              >
                                <X size={12} />
                              </button>
                            </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="hidden space-y-1 text-left">
                      <label className="text-[12px] font-black uppercase tracking-widest opacity-40 ml-2">Discount Amount (₱)</label>
                      <input type="number" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} placeholder="0.00" className="w-full bg-blue-600/10 border border-blue-600/30 rounded-2xl px-4 py-4 text-sm font-black text-blue-500 outline-none focus:border-blue-500" />
                    </div>

                    {/* Validity Date Pickers */}
                    <div className="order-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1 text-left">
                        <label className="text-[12px] font-black uppercase tracking-widest opacity-40 ml-2 flex items-center gap-1.5">
                          <Calendar size={10} /> Valid From
                        </label>
                        <DealDatePicker
                          value={validFrom}
                          onChange={setValidFrom}
                          isDarkMode={isDarkMode}
                          placeholder="Publish time"
                          align="left"
                        />
                      </div>
                      <div className="space-y-1 text-left">
                        <label className="text-[12px] font-black uppercase tracking-widest opacity-40 ml-2 flex items-center gap-1.5">
                          <Calendar size={10} /> Valid Until
                        </label>
                        <DealDatePicker
                          value={validUntil}
                          onChange={setValidUntil}
                          isDarkMode={isDarkMode}
                          placeholder="Next week"
                          align="right"
                        />
                      </div>
                    </div>

                    <div className="order-4 bg-black/5 rounded-2xl p-4 flex flex-col gap-2 text-left border border-white/5">
                       {dealType === 'bundle_only' ? (
                         <div className="flex justify-between items-center text-emerald-500">
                            <span className="text-[12px] font-black uppercase tracking-wider">Exclusive Discount Share</span>
                            <span className="text-[12px] font-black italic">{exclusiveDiscountPercent}%</span>
                         </div>
                       ) : dealType === 'clearance' ? (
                         <>
                           <div className="flex justify-between items-center text-amber-500">
                              <span className="text-[12px] font-black uppercase tracking-wider">Clearance Discount</span>
                              <span className="text-[12px] font-black italic">-₱{Number(financialSummary.clearanceDiscountTotal || 0).toLocaleString()}</span>
                           </div>
                           <div className="flex justify-between items-center text-blue-500">
                              <span className="text-[12px] font-black uppercase tracking-wider">Standard Kit Discount</span>
                              <span className="text-[12px] font-black italic">-₱{Number(financialSummary.standardDiscountTotal || 0).toLocaleString()}</span>
                           </div>
                         </>
                       ) : (
                         <div className="flex justify-between items-center text-red-500">
                           <span className="text-[12px] font-black uppercase tracking-wider">Exclusion Rule</span>
                           <span className="text-[12px] font-black italic">2 kits only</span>
                         </div>
                       )}
                       <div className="flex justify-between items-center opacity-40">
                          <span className="text-[12px] font-black uppercase">Standard Combined Sell</span>
                          <span className="text-[12px] font-bold">₱{financialSummary.totalSell.toLocaleString()}</span>
                       </div>
                       <div className="flex justify-between items-center opacity-40">
                          <span className="text-[12px] font-black uppercase">Combined Cost</span>
                          <span className="text-[12px] font-bold">₱{financialSummary.totalCost.toLocaleString()}</span>
                       </div>
                       <div className="flex justify-between items-center text-blue-500">
                          <span className="text-[12px] font-black uppercase tracking-wider">{dealType === 'clearance' ? 'Total Discount' : dealType === 'mutually_exclusive' ? 'Discount' : 'Promo Discount'}</span>
                          <span className="text-[12px] font-black italic">-₱{Number(dealType === 'clearance' ? financialSummary.discountAmount : (parseFloat(discountAmount) || 0)).toLocaleString()}</span>
                       </div>
                       <div className="h-px bg-white/5 my-1" />
                       <div className="flex justify-between items-center">
                          <span className="text-[12px] font-black uppercase tracking-[0.2em] opacity-40">Est. Margin</span>
                          <span className={`text-[12px] font-black italic ${financialSummary.projectedProfit > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                             ₱{financialSummary.projectedProfit.toLocaleString()}
                          </span>
                       </div>
                    </div>
                  </div>
                )}
             </div>

             <div className="bg-blue-600/5 border border-blue-600/10 p-4 rounded-2xl text-left">
                <p className="text-[12px] font-bold leading-relaxed opacity-70 italic">
                   {dealType === 'bundle_only' ? "Bundle deal discounts are split between exclusive and standard items using the configured exclusive discount percentage." : dealType === 'clearance' ?
                    "Clearance uses one selected kit. Its sell-price difference from the cost ceiling is unlocked in the basket and distributed across other on-hand kits by their remaining cost-ceiling capacity." :
                    "Item A and Item B cannot be sold together. Automatic reserving & shelf synchronization will run reactively."}
                </p>
             </div>

             <div className="flex gap-3">
               {activeEditId && (
                 <button onClick={() => { setActiveEditId(null); setDealName(''); setDiscountAmount(''); setSelectedKitIds([]); setValidFrom(''); setValidUntil(''); setPreviewKitIds([]); setDraggedPreviewKitId(null); setExclusiveKitIds([]); setClearanceKitIds([]); setClearanceDiscounts({}); setMobileTab('list'); }} className="px-5 py-4 rounded-2xl bg-black/5 hover:bg-black/10 border border-[var(--color-border)] font-black uppercase text-[11px] tracking-widest transition-all">Cancel</button>
               )}
               <button 
                  disabled={isSaving}
                  onClick={async () => {
                    await handleSave();
                    setMobileTab('list');
                  }} 
                  className={`flex-1 py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[11px] tracking-widest shadow-xl shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
               >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                  {activeEditId ? 'Update Deal' : 'Publish Deal'}
               </button>
             </div>
          </div>

          {/* ══ Right Column - Saved Deals List ══ */}
          <div className={`flex-1 flex flex-col bg-black/5 dark:bg-white/[0.02] border-t md:border-t-0 border-[var(--color-border)] ${mobileTab === 'list' ? 'flex' : 'hidden md:flex'}`}>
             <div className="p-4 md:p-6 border-b border-[var(--color-border)] text-left">
                <div className="flex justify-between items-center mb-3">
                   <div>
                      <h3 className="text-xs font-black uppercase tracking-widest">Active Deals & Bundles</h3>
                      <span className="text-[12px] opacity-40 uppercase font-bold mt-1 block">Modify or delete active settings</span>
                   </div>
                   <span className="text-[12px] font-black px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 uppercase">{deals?.length || 0} Saved</span>
                </div>

                {/* Bulk action buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={handleSelectAll}
                    className={`px-3 py-1.5 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${allSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-[var(--color-border)] bg-black/5 hover:bg-black/10 opacity-70'}`}>
                    {allSelected ? <CheckSquare size={12} /> : <Square size={12} />}
                    {allSelected ? 'Deselect All' : 'Select All'}
                  </button>
                  {selectedDealIds.length > 0 && (
                    <>
                      <button onClick={handleBulkDelete} disabled={isBulkProcessing}
                        className="px-3 py-1.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-500 text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 hover:bg-red-500/20 disabled:opacity-40">
                        {isBulkProcessing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        Delete ({selectedDealIds.length})
                      </button>
                      <button onClick={handleBulkReactivate} disabled={isBulkProcessing}
                        className="px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 hover:bg-emerald-500/20 disabled:opacity-40">
                        {isBulkProcessing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        Reactivate ({selectedDealIds.length})
                      </button>
                    </>
                  )}
                </div>
             </div>

             <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 custom-scrollbar">
                {(!deals || deals.length === 0) ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-30 p-10">
                    <Gift size={40} className="stroke-[1.5]" />
                    <p className="text-[12px] font-black uppercase tracking-widest mt-3">No active deals found</p>
                  </div>
                ) : (
                  deals.map(deal => {
                    const strategyLabel = deal.type === 'clearance' ? 'Clearance' : (deal.type === 'bundle_discount' || deal.type === 'bundle_only') ? 'Bundle Deal' :
                                          deal.type === 'mutually_exclusive' ? 'Mutually Exclusive' : 'Legacy Bundle';
                    
                    const badgeClass = deal.type === 'clearance' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : (deal.type === 'bundle_discount' || deal.type === 'bundle_only') ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                                       deal.type === 'mutually_exclusive' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20';

                    const orderedKitIds = [
                      ...(deal.previewKitIds || []),
                      ...(deal.kitIds || []).filter(id => !(deal.previewKitIds || []).includes(id))
                    ];
                    const includedKits = getOrderedKits(kits, orderedKitIds);
                    const isChecked = selectedDealIds.includes(deal.id);
                    const isExpired = deal.validUntil && parseLocalDateTime(deal.validUntil) && parseLocalDateTime(deal.validUntil) < new Date();
                    const isInactive = deal.isActive === false;

                    // Fulfillability check: every kit in the deal must have at least one available stock
                    const isFulfillable = (deal.type === 'bundle_discount' || deal.type === 'bundle_only' || deal.type === 'clearance')
                      ? (deal.kitIds || []).every(kitId => {
                          const kit = (kits || []).find(k => k.id === kitId);
                          if (!kit) return false;
                          const stocks = Object.values(kit.stocks || {});
                          return stocks.some(s => isBundlePurchasableStock(s, deal.stockSource || 'onhand'));
                        })
                      : true; // mutually_exclusive deals are always considered fulfillable

                    return (
                      <div key={deal.id} className={`p-4 rounded-3xl border text-left flex flex-col justify-between gap-3 transition-all ${activeEditId === deal.id ? 'border-blue-500 bg-blue-500/5' : isChecked ? 'border-blue-400/40 bg-blue-500/5' : 'border-neutral-500/10 bg-[var(--color-surface)] hover:border-neutral-500/20'} ${(isInactive || isExpired || !isFulfillable) ? 'opacity-50' : ''}`}>
                        <div className="flex justify-between items-start gap-2">
                          {/* Checkbox */}
                          <button onClick={() => toggleDealSelection(deal.id)} className="pt-1 shrink-0">
                            {isChecked 
                              ? <CheckSquare size={16} className="text-blue-500" />
                              : <Square size={16} className="opacity-30 hover:opacity-60 transition-opacity" />
                            }
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[11px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider inline-block ${badgeClass}`}>
                                {strategyLabel}
                              </span>
                              {isInactive && <span className="text-[11px] font-black uppercase px-1.5 py-0.5 rounded-full bg-neutral-500/20 text-neutral-400 tracking-wider">Inactive</span>}
                              {isExpired && <span className="text-[11px] font-black uppercase px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 tracking-wider">Expired</span>}
                              {!isFulfillable && <span className="text-[11px] font-black uppercase px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 tracking-wider">Unfulfillable</span>}
                              {(deal.type === 'bundle_discount' || deal.type === 'bundle_only' || deal.type === 'clearance') && (
                                <span className="text-[11px] font-black uppercase px-1.5 py-0.5 rounded-full bg-neutral-500/10 text-neutral-400 tracking-wider">
                                  {(deal.stockSource || 'onhand') === 'preorder' ? 'Pre-Order' : 'Onhand'}
                                </span>
                              )}
                              {(deal.type === 'bundle_discount' || deal.type === 'bundle_only' || deal.type === 'clearance') && (
                                <span className={`text-[11px] font-black uppercase px-1.5 py-0.5 rounded-full tracking-wider ${deal.type === 'clearance' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                  {getDealCountdownLabel(deal.validUntil)}
                                </span>
                              )}
                            </div>
                            <h4 className="text-sm font-black uppercase italic tracking-tight mt-2 text-[var(--color-text-main)] leading-none">{deal.name}</h4>
                            {/* Validity dates */}
                            {(deal.validFrom || deal.validUntil) && (
                              <p className="text-[12px] font-bold opacity-40 mt-1.5 flex items-center gap-1">
                                <Calendar size={9} />
                                {deal.validFrom ? parseLocalDateTime(deal.validFrom)?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                                {' → '}
                                {deal.validUntil ? parseLocalDateTime(deal.validUntil)?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => handleEditSavedDeal(deal)} className="p-2 hover:bg-blue-500/10 hover:text-blue-500 text-neutral-400 rounded-full transition-colors" title="Edit Deal">
                              <Edit3 size={14} />
                            </button>
                            <button onClick={() => handleDelete(deal.id)} className="p-2 hover:bg-red-500/10 hover:text-red-500 text-neutral-400 rounded-full transition-colors" title="Delete Deal">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Kit Thumbnails */}
                        <div className="w-full space-y-2 py-1">
                          {includedKits.map(k => (
                            <div key={k.id} className="flex w-full min-w-0 items-center gap-2 px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 border border-white/5">
                              <img src={resolveImage(k.image, k.images)} className="w-7 h-7 rounded-lg object-cover bg-white" alt="" />
                              <div className="min-w-0 flex-1">
                                <span className="block truncate text-[12px] font-black uppercase">{k.name}</span>
                                <span className="block truncate text-[12px] font-bold uppercase opacity-40">{[k.brand, k.specs?.line].filter(Boolean).join(' / ') || 'No brand or line'}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Prices/Conditions */}
                        <div className="flex justify-between items-center text-[12px] border-t border-neutral-500/10 pt-2 opacity-85">
                          {deal.type === 'mutually_exclusive' ? (
                            <span className="font-black text-red-500 uppercase tracking-widest">Exclusion Rules Applied</span>
                          ) : (
                            <>
                              <span className="font-bold opacity-40">₱{(deal.totalSell || 0).toLocaleString()} (Standard)</span>
                              <span className="font-black italic text-emerald-500">₱{(deal.discountAmount || 0).toLocaleString()} Disc</span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
