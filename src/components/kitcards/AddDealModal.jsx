import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Gift, Lock, Ban, Search, ChevronRight, ChevronLeft, Loader2, Edit3, Calendar, Clock3, RefreshCw, CheckSquare, Square, Image as ImageIcon } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTheme } from '../../context/ThemeContext';
import { getClearanceBundlePricing, getFlexiBundlePreviewPricing, getDiscountFloor, getClearanceRequiredOtherStock, getBundleDealPricing, getBundleDiscountCapacity, getHighestCostStock } from '../../utils/bundlePricing';
import { FLEXI_BUNDLE_DEAL_TYPE, CLEARANCE_DEAL_TYPE, isFlexiBundleDeal, isPerKitClearanceDeal } from '../../utils/dealTypes';

function format12HourTime(date) {
  const hours = date.getHours();
  const hour12 = hours % 12 || 12;
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  return `${String(hour12).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} ${meridiem}`;
}

function parse12HourTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 1 || hour > 12) return null;
  const isPm = match[3].toUpperCase() === 'PM';
  return { hours: (hour % 12) + (isPm ? 12 : 0), minutes: minute };
}

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

function getMutuallyExclusiveKitIds(deal) {
  if (deal?.mutuallyExclusivePairs?.length > 0) {
    return Array.from(new Set(deal.mutuallyExclusivePairs.flatMap(pair => [pair.bandaiId, pair.bootlegId]).filter(Boolean)));
  }
  const bandaiIds = deal?.mutuallyExclusiveGroups?.bandai || deal?.bandaiKitIds || [];
  const bootlegIds = deal?.mutuallyExclusiveGroups?.bootleg || deal?.bootlegKitIds || [];
  if (bandaiIds.length > 0 && bootlegIds.length > 0) {
    return Array.from(new Set([...bandaiIds, ...bootlegIds]));
  }
  const legacyIds = deal?.kitIds?.length
    ? deal.kitIds
    : [deal?.targetKitId, deal?.forbiddenKitId, ...(deal?.requiredKitIds || [])];
  return Array.from(new Set(legacyIds.filter(Boolean)));
}

function getMutuallyExclusivePairRows(deal, kits = []) {
  if (deal?.mutuallyExclusivePairs?.length > 0) {
    return deal.mutuallyExclusivePairs
      .filter(pair => pair?.bandaiId || pair?.bootlegId)
      .map(pair => ({ bandaiId: pair.bandaiId || null, bootlegId: pair.bootlegId || null }));
  }

  const bandaiIds = deal?.mutuallyExclusiveGroups?.bandai || deal?.bandaiKitIds || [];
  const bootlegIds = deal?.mutuallyExclusiveGroups?.bootleg || deal?.bootlegKitIds || [];
  const legacyIds = deal?.kitIds?.length
    ? deal.kitIds
    : [deal?.targetKitId, deal?.forbiddenKitId, ...(deal?.requiredKitIds || [])];
  const kitMap = new Map((kits || []).map(kit => [kit.id, kit]));
  const legacyKits = legacyIds.map(id => kitMap.get(id)).filter(Boolean);
  const brandBandaiIds = legacyKits
    .filter(kit => String(kit.brand || '').toLowerCase().includes('bandai'))
    .map(kit => kit.id);
  const brandBootlegIds = legacyKits
    .filter(kit => !String(kit.brand || '').toLowerCase().includes('bandai'))
    .map(kit => kit.id);
  const fallbackBandaiIds = bandaiIds.length > 0
    ? bandaiIds
    : brandBandaiIds.length > 0
      ? brandBandaiIds
      : legacyIds.filter((_, index) => index === 0);
  const fallbackBootlegIds = bootlegIds.length > 0
    ? bootlegIds
    : brandBootlegIds.length > 0
      ? brandBootlegIds
      : legacyIds.filter((_, index) => index === 1);
  const rowCount = Math.max(fallbackBandaiIds.length, fallbackBootlegIds.length);

  return Array.from({ length: rowCount }, (_, index) => ({
    bandaiId: fallbackBandaiIds[index] || null,
    bootlegId: fallbackBootlegIds[index] || null
  }));
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
  return !stock.isReserved;
}

function getHighestAvailableOnhandStock(kit) {
  const purchasableStocks = Object.values(kit?.stocks || {})
    .filter(stock => isBundlePurchasableStock(stock, 'onhand'));
  return getHighestCostStock(purchasableStocks) || {};
}

// Deal Architect totals use the catalog/base sell price. Checkout fees,
// including the per-item installment fee, are applied after the deal price.
function getBundleStandardSellPrice(stock, kit) {
  return Number(stock?.sellPrice ?? kit?.sellPrice ?? 0) || 0;
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

function getClearanceKitScheduleLabel(deal, kitId) {
  const schedule = deal?.clearanceKitSchedules?.[kitId];
  if (!schedule) return '';
  const endDate = parseLocalDateTime(schedule.validUntil);
  if (schedule.isActive === false) return 'INACTIVE / WAITING TO REACTIVATE';
  return endDate ? `EXPIRES ${endDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'NO EXPIRY';
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

const DEFAULT_BUNDLE_VALIDITY_DAYS = 3;
const WILD_SALE_DEFAULT_DURATION_MINUTES = 1;
const WILD_SALE_MAX_DURATION_MINUTES = 60;
const DEFAULT_REACTIVATION_DELAY = 1;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const NAMED_BUNDLE_TYPES = new Set(['bundle', 'bundle_only', 'bundle_discount']);

function normalizeDealName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function getBundleNameBase(name) {
  return normalizeDealName(name)
    .replace(/\s+BUNDLE(?:\s+\d+)?$/i, '')
    .trim();
}

function getBundleDealName(name, deals = [], activeEditId = null, dealToEdit = null) {
  const baseName = getBundleNameBase(name);
  const normalizedBaseName = baseName.toUpperCase();
  const existingName = normalizeDealName(dealToEdit?.name);
  const existingBaseName = getBundleNameBase(existingName).toUpperCase();

  // Keep an existing identifier stable when the bundle is only being edited.
  // The input itself is populated with the base name separately below.
  if (
    activeEditId
    && existingName
    && normalizedBaseName === existingBaseName
    && /\s+BUNDLE(?:\s+\d+)?$/i.test(existingName)
  ) {
    return existingName.toUpperCase();
  }

  const matchingBundleCount = deals.filter((deal) => (
    NAMED_BUNDLE_TYPES.has(deal?.type)
    && deal?.id !== activeEditId
    && getBundleNameBase(deal?.name).toUpperCase() === normalizedBaseName
  )).length;
  const identifier = matchingBundleCount > 0 ? ` ${matchingBundleCount + 1}` : '';
  return `${baseName} BUNDLE${identifier}`.toUpperCase();
}

function getBundleValidityDays(deal) {
  const configuredDays = Number(deal?.validityDays);
  if (Number.isFinite(configuredDays) && configuredDays > 0) return Math.max(3, configuredDays);

  const validFromDate = parseLocalDateTime(deal?.validFrom);
  const validUntilDate = parseLocalDateTime(deal?.validUntil);
  if (validFromDate && validUntilDate && validUntilDate > validFromDate) {
    return Math.max(3, Math.ceil((validUntilDate.getTime() - validFromDate.getTime()) / DAY_IN_MILLISECONDS));
  }

  return DEFAULT_BUNDLE_VALIDITY_DAYS;
}

function getReactivationSettings(deal) {
  const configuredUnit = deal?.reactivationDelayUnit === 'days' ? 'days' : 'hours';
  const configuredValue = Number(deal?.reactivationDelayValue ?? deal?.reactivationDelay);
  if (Number.isFinite(configuredValue) && configuredValue >= 0) {
    return { value: Math.max(1, configuredValue), unit: configuredUnit };
  }

  const legacyHours = Number(deal?.reactivationDelayHours);
  if (Number.isFinite(legacyHours) && legacyHours >= 0) {
    return { value: Math.max(1, legacyHours), unit: 'hours' };
  }

  return { value: DEFAULT_REACTIVATION_DELAY, unit: 'hours' };
}

function getDefaultClearanceSchedule() {
  const validFrom = new Date();
  const validUntil = new Date(validFrom.getTime() + WILD_SALE_DEFAULT_DURATION_MINUTES * 60 * 1000);
  return {
    validFrom: formatLocalDateTimeValue(validFrom),
    validUntil: formatLocalDateTimeValue(validUntil),
    validityDays: 1,
    validityMinutes: WILD_SALE_DEFAULT_DURATION_MINUTES,
    reactivationDelayValue: DEFAULT_REACTIVATION_DELAY,
    reactivationDelayUnit: 'hours',
    reactivationDelayHours: DEFAULT_REACTIVATION_DELAY,
    isActive: true
  };
}

function getScheduleDurationMinutes(schedule) {
  const configuredMinutes = Number(schedule?.validityMinutes);
  if (Number.isFinite(configuredMinutes) && configuredMinutes > 0) return configuredMinutes;
  const start = parseLocalDateTime(schedule?.validFrom);
  const end = parseLocalDateTime(schedule?.validUntil);
  if (start && end && end > start) return Math.max(1, Math.round((end.getTime() - start.getTime()) / (60 * 1000)));
  return WILD_SALE_DEFAULT_DURATION_MINUTES;
}

function normalizeWildSaleSchedule(schedule = {}) {
  const merged = { ...getDefaultClearanceSchedule(), ...schedule };
  const configuredValue = Number(merged.reactivationDelayValue);
  const legacyHours = Number(merged.reactivationDelayHours);
  const hasConfiguredValue = Number.isFinite(configuredValue);
  const safeValue = hasConfiguredValue
    ? configuredValue
    : Number.isFinite(legacyHours) ? legacyHours : DEFAULT_REACTIVATION_DELAY;
  const reactivationHours = hasConfiguredValue && merged.reactivationDelayUnit === 'days'
    ? safeValue * 24
    : safeValue;
  return {
    ...merged,
    reactivationDelayValue: Math.max(DEFAULT_REACTIVATION_DELAY, reactivationHours),
    reactivationDelayUnit: 'hours',
    reactivationDelayHours: Math.max(DEFAULT_REACTIVATION_DELAY, reactivationHours)
  };
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
  const [timeInput, setTimeInput] = useState(() => format12HourTime(initialDate));

  useEffect(() => {
    setDraftDate(initialDate);
    setViewDate(initialDate);
    setTimeInput(format12HourTime(initialDate));
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
    if (!isOpen) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      pickerRef.current
        ?.querySelector('[data-date-time-picker-panel="true"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isOpen]);

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  const monthCells = useMemo(() => getMonthMatrix(viewDate), [viewDate]);

  const applyDraft = (date) => {
    onChange(formatLocalDateTimeValue(date));
  };

  const commitTimeInput = () => {
    const parsed = parse12HourTime(timeInput);
    if (!parsed) {
      setTimeInput(format12HourTime(draftDate));
      return;
    }
    const nextDate = new Date(draftDate);
    nextDate.setHours(parsed.hours, parsed.minutes, 0, 0);
    setDraftDate(nextDate);
    applyDraft(nextDate);
  };

  const selectDay = (dayDate) => {
    if (!dayDate) return;
    const nextDate = new Date(dayDate);
    nextDate.setHours(draftDate.getHours(), draftDate.getMinutes(), 0, 0);
    setDraftDate(nextDate);
    setTimeInput(format12HourTime(nextDate));
    applyDraft(nextDate);
  };

  const shellClass = isDarkMode
    ? 'bg-white/5 border-white/10 text-white'
    : 'bg-neutral-50 border-black/10 text-neutral-900';
  const popoverClass = isDarkMode
    ? 'bg-[#111214] border-white/10 text-white'
    : 'bg-white border-black/10 text-neutral-900';

  const pickerPanel = (
    <div data-date-time-picker-panel="true" className={`absolute top-full mt-2 z-[120] w-[280px] ${align === 'right' ? 'right-0' : 'left-0'} rounded-[1.5rem] border p-4 shadow-2xl ${popoverClass}`}>
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

      <div className="mt-4">
        <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest opacity-70">
          Time (12-hour)
          <input
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            value={timeInput}
            onChange={(event) => setTimeInput(event.target.value.toUpperCase().slice(0, 8))}
            onBlur={commitTimeInput}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitTimeInput();
              }
            }}
            placeholder="hh:mm AM"
            maxLength={8}
            className={`w-full rounded-xl border px-3 py-2 text-xs font-black outline-none ${shellClass}`}
            aria-label="Time in 12-hour format"
          />
        </label>
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
  const { kits, deals, shelf, addDeal, removeFromBasket, updateDeal, deleteDeal, loadAllKits, loadAllDeals, loadMissingKits, migrateLegacyClearanceDealsToFlexiBundle } = useStore();
  const { isDarkMode } = useTheme();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  
  const [dealType, setDealType] = useState('bundle_only'); 
  const [dealName, setDealName] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [selectedKitIds, setSelectedKitIds] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [activeEditId, setActiveEditId] = useState(null);
  const [validFrom, setValidFrom] = useState('');
  const [validityDays, setValidityDays] = useState(String(DEFAULT_BUNDLE_VALIDITY_DAYS));
  const [reactivationDelay, setReactivationDelay] = useState(String(DEFAULT_REACTIVATION_DELAY));
  const [reactivationDelayUnit, setReactivationDelayUnit] = useState('hours');
  const [previewKitIds, setPreviewKitIds] = useState([]);
  const [draggedPreviewKitId, setDraggedPreviewKitId] = useState(null);
  const [clearanceKitIds, setClearanceKitIds] = useState([]);
  const [clearanceDiscounts, setClearanceDiscounts] = useState({});
  const [clearanceOriginalOverrides, setClearanceOriginalOverrides] = useState({});
  const [clearanceCurrentDiscounts, setClearanceCurrentDiscounts] = useState({});
  const [clearanceRequiredOtherStocks, setClearanceRequiredOtherStocks] = useState({});
  const [clearanceKitSchedules, setClearanceKitSchedules] = useState({});
  const [mutuallyExclusivePairRows, setMutuallyExclusivePairRows] = useState([]);
  const [isLoadingMutualKits, setIsLoadingMutualKits] = useState(false);

  // Bulk selection state for right column
  const [selectedDealIds, setSelectedDealIds] = useState([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [mobileTab, setMobileTab] = useState('creator'); // 'creator' | 'list'

  useEffect(() => {
    if (!isOpen) return undefined;

    let isCancelled = false;
    const migrateLegacyClearanceDeals = async () => {
      try {
        await loadAllDeals();
        if (!isCancelled) await migrateLegacyClearanceDealsToFlexiBundle();
      } catch (error) {
        console.error('SG LOG: Could not migrate legacy clearance deals:', error);
      }
    };

    void migrateLegacyClearanceDeals();
    return () => {
      isCancelled = true;
    };
  }, [isOpen, loadAllDeals, migrateLegacyClearanceDealsToFlexiBundle]);

  const flexiBundleMasterDeal = useMemo(() => {
    const clearanceDeals = (deals || []).filter(isFlexiBundleDeal);
    return clearanceDeals.find(deal => deal.isActive !== false) || clearanceDeals[0] || null;
  }, [deals]);

  const perKitClearanceMasterDeal = useMemo(() => {
    const clearanceDeals = (deals || []).filter(isPerKitClearanceDeal);
    return clearanceDeals.find(deal => deal.isActive !== false) || clearanceDeals[0] || null;
  }, [deals]);

  const mutuallyExclusiveMasterDeal = useMemo(() => {
    const mutualDeals = (deals || []).filter(deal => (
      deal.type === 'mutually_exclusive'
      || deal.type === 'requirement'
      || deal.type === 'exclusion'
    ));
    return mutualDeals.find(deal => deal.isActive !== false) || mutualDeals[0] || null;
  }, [deals]);

  const getClearanceRequirementMap = (deal, kitIds) => Object.fromEntries(
    (kitIds || []).map((kitId) => [
      kitId,
      String(getClearanceRequiredOtherStock(deal, kitId))
    ])
  );

  const visibleDeals = useMemo(() => {
    return (deals || []).filter(deal => {
      const isMutualDeal = deal.type === 'mutually_exclusive'
        || deal.type === 'requirement'
        || deal.type === 'exclusion';
      const isFlexiMaster = !isFlexiBundleDeal(deal) || deal.id === flexiBundleMasterDeal?.id;
      const isClearanceMaster = !isPerKitClearanceDeal(deal) || deal.id === perKitClearanceMasterDeal?.id;
      const isMutualMaster = !isMutualDeal || deal.id === mutuallyExclusiveMasterDeal?.id;
      return isFlexiMaster && isClearanceMaster && isMutualMaster;
    });
  }, [deals, flexiBundleMasterDeal, perKitClearanceMasterDeal, mutuallyExclusiveMasterDeal]);


  // Pre-fill if editing
  useEffect(() => {
    if (dealToEdit && isOpen) {
      let mappedType = dealToEdit.type || 'bundle_only';
      if (mappedType === 'bundle' || mappedType === 'bundle_discount') mappedType = 'bundle_only';
      if (mappedType === 'requirement' || mappedType === 'exclusion') mappedType = 'mutually_exclusive';
      if (isFlexiBundleDeal(dealToEdit)) mappedType = FLEXI_BUNDLE_DEAL_TYPE;
      if (isPerKitClearanceDeal(dealToEdit)) mappedType = CLEARANCE_DEAL_TYPE;
      
      setDealType(mappedType);
      setDealName(mappedType === FLEXI_BUNDLE_DEAL_TYPE || mappedType === CLEARANCE_DEAL_TYPE
        ? ''
        : mappedType === 'mutually_exclusive'
          ? 'BANDAI VS BOOTLEG'
          : mappedType === 'bundle_only'
            ? getBundleNameBase(dealToEdit.name || '')
            : (dealToEdit.name || ''));
      setActiveEditId(dealToEdit.id);
      setValidFrom(mappedType === 'mutually_exclusive' ? '' : (dealToEdit.validFrom || ''));
      setValidityDays(mappedType === 'mutually_exclusive' ? '' : String(getBundleValidityDays(dealToEdit)));
      const editReactivationSettings = getReactivationSettings(dealToEdit);
      setReactivationDelay(mappedType === 'mutually_exclusive' ? String(DEFAULT_REACTIVATION_DELAY) : String(editReactivationSettings.value));
      setReactivationDelayUnit(mappedType === 'mutually_exclusive' ? 'hours' : editReactivationSettings.unit);
      
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
      if (mappedType === FLEXI_BUNDLE_DEAL_TYPE || mappedType === CLEARANCE_DEAL_TYPE) {
        kids = Array.from(new Set(
          (dealToEdit.clearanceKitIds?.length ? dealToEdit.clearanceKitIds : kids)
        ));
      }
      if (mappedType === 'mutually_exclusive') {
        kids = getMutuallyExclusiveKitIds(dealToEdit);
      }
      setSelectedKitIds(kids);
      setMutuallyExclusivePairRows(mappedType === 'mutually_exclusive' ? getMutuallyExclusivePairRows(dealToEdit, kits) : []);
      setPreviewKitIds(mappedType === 'mutually_exclusive'
        ? []
        : (dealToEdit.previewKitIds || kids).filter(id => kids.includes(id)));
      setClearanceKitIds(mappedType === FLEXI_BUNDLE_DEAL_TYPE || mappedType === CLEARANCE_DEAL_TYPE ? kids : []);
      const originalClearanceOverrides = mappedType === FLEXI_BUNDLE_DEAL_TYPE || mappedType === CLEARANCE_DEAL_TYPE
        ? Object.fromEntries(kids
          .filter(id => dealToEdit.clearanceDiscounts?.[id] !== '' && dealToEdit.clearanceDiscounts?.[id] !== null && dealToEdit.clearanceDiscounts?.[id] !== undefined)
          .map(id => [id, dealToEdit.clearanceDiscounts[id]]))
        : {};
      const currentClearanceDiscounts = mappedType === FLEXI_BUNDLE_DEAL_TYPE || mappedType === CLEARANCE_DEAL_TYPE
        ? Object.fromEntries(kids.map(id => [
          id,
          dealToEdit.clearanceDiscounts?.[id] ?? ''
        ]))
        : {};
      setClearanceOriginalOverrides(originalClearanceOverrides);
      setClearanceCurrentDiscounts(currentClearanceDiscounts);
      setClearanceRequiredOtherStocks(mappedType === FLEXI_BUNDLE_DEAL_TYPE || mappedType === CLEARANCE_DEAL_TYPE
        ? getClearanceRequirementMap(dealToEdit, kids)
        : {});
      setClearanceKitSchedules(mappedType === CLEARANCE_DEAL_TYPE
        ? Object.fromEntries(kids.map(id => [id, normalizeWildSaleSchedule(dealToEdit.clearanceKitSchedules?.[id] || {})]))
        : {});
      setClearanceDiscounts(currentClearanceDiscounts);
      setMobileTab('creator');
    } else if (isOpen) {
      setDealType('bundle_only'); 
      setDealName(''); 
      setDiscountAmount(''); 
      setSelectedKitIds([]);
      setMutuallyExclusivePairRows([]);
      setSearchTerm('');
      setActiveEditId(null);
      setValidFrom('');
      setValidityDays(String(DEFAULT_BUNDLE_VALIDITY_DAYS));
      setReactivationDelay(String(DEFAULT_REACTIVATION_DELAY));
      setReactivationDelayUnit('hours');
      setPreviewKitIds([]);
      setDraggedPreviewKitId(null);
      setClearanceKitIds([]);
      setClearanceOriginalOverrides({});
      setClearanceCurrentDiscounts({});
      setClearanceDiscounts({});
      setClearanceRequiredOtherStocks({});
      setClearanceKitSchedules({});
      setSelectedDealIds([]);
      setMobileTab('creator');
    }
  }, [dealToEdit, isOpen, kits]);

  const selectedKitsData = useMemo(() => {
    return getOrderedKits(kits, selectedKitIds);
  }, [kits, selectedKitIds]);

  const mutuallyExclusiveGroups = useMemo(() => {
    const kitMap = new Map((kits || []).map(kit => [kit.id, kit]));
    const bandai = mutuallyExclusivePairRows
      .map(row => kitMap.get(row.bandaiId))
      .filter(Boolean);
    const bootleg = mutuallyExclusivePairRows
      .map(row => kitMap.get(row.bootlegId))
      .filter(Boolean);
    return { bandai, bootleg };
  }, [kits, mutuallyExclusivePairRows]);

  const isBandaiKitId = (kitId) => String(kits.find(kit => kit.id === kitId)?.brand || '').toLowerCase().includes('bandai');

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

  const financialSummary = useMemo(() => {
    if (dealType === FLEXI_BUNDLE_DEAL_TYPE || dealType === CLEARANCE_DEAL_TYPE) {
      const rows = selectedKitsData.map(kit => {
        const stock = getHighestOnhandStock(kit);
        return {
          kit,
          stock,
          kitId: kit.id,
          sellPrice: getBundleStandardSellPrice(stock, kit),
          costPrice: Number(stock.costPrice || 0)
        };
      });
      const discountOverrides = {
        ...clearanceOriginalOverrides,
        ...clearanceDiscounts
      };
      return dealType === FLEXI_BUNDLE_DEAL_TYPE
        ? getFlexiBundlePreviewPricing(rows, clearanceKitIds, discountOverrides)
        : getClearanceBundlePricing(rows, clearanceKitIds, discountOverrides);
    }
    const rows = selectedKitsData.map(kit => {
      const stock = getHighestAvailableOnhandStock(kit);
      return {
        kit,
        kitId: kit.id,
        sellPrice: getBundleStandardSellPrice(stock, kit),
        costPrice: Number(stock.costPrice || 0)
      };
    });
    const suggestedDiscount = getBundleDiscountCapacity(rows);
    const requestedDiscount = discountAmount === ''
      ? suggestedDiscount
      : Math.max(0, parseFloat(discountAmount) || 0);
    return {
      ...getBundleDealPricing(rows, requestedDiscount),
      suggestedDiscount
    };
  }, [dealType, selectedKitsData, clearanceKitIds, clearanceOriginalOverrides, clearanceDiscounts, discountAmount]);

  const getClearanceDiscountPlaceholder = (kitId, fallbackDiscount = 0) => {
    const currentDiscount = clearanceCurrentDiscounts[kitId];
    return currentDiscount !== '' && currentDiscount !== null && currentDiscount !== undefined
      ? currentDiscount
      : fallbackDiscount;
  };

  const kitSearchResults = useMemo(() => {
    if (!searchTerm) return [];
    const lowerSearch = searchTerm.toLowerCase();
    return (kits || []).filter(k => {
      const target = [k.name, k.brand, k.specs?.line].filter(Boolean).join(' ').toLowerCase();
      const hasPurchasableOnhandStock = Object.values(k.stocks || {})
        .some(stock => isBundlePurchasableStock(stock, 'onhand'));
      return target.includes(lowerSearch)
        && !selectedKitIds.includes(k.id)
        && (dealType !== 'bundle_only' || hasPurchasableOnhandStock);
    }).slice(0, 5);
  }, [dealType, kits, searchTerm, selectedKitIds]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const stateKey = `add-deal-modal-${Date.now()}`;
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
      if (window.history.state?.modalKey === stateKey) {
        window.history.back();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isClearanceStrategy = dealType === FLEXI_BUNDLE_DEAL_TYPE || dealType === CLEARANCE_DEAL_TYPE;
  const isFlexiStrategy = dealType === FLEXI_BUNDLE_DEAL_TYPE;

  const toggleKitSelection = (id) => {
    if (dealType === FLEXI_BUNDLE_DEAL_TYPE || dealType === CLEARANCE_DEAL_TYPE) {
      setSelectedKitIds(prev => {
        const next = prev.includes(id) ? prev.filter(kitId => kitId !== id) : [...prev, id];
        setClearanceKitIds(next);
        setClearanceDiscounts(prevDiscounts => {
          const nextDiscounts = { ...prevDiscounts };
          if (next.includes(id) && nextDiscounts[id] === undefined && clearanceOriginalOverrides[id] === undefined) {
            nextDiscounts[id] = '';
          }
          else delete nextDiscounts[id];
          return nextDiscounts;
        });
        setClearanceRequiredOtherStocks(prevRequirements => {
          const nextRequirements = { ...prevRequirements };
          if (next.includes(id) && nextRequirements[id] === undefined) nextRequirements[id] = '1';
          else if (!next.includes(id)) delete nextRequirements[id];
          return nextRequirements;
        });
        return next;
      });
      return;
    }

    if (dealType === 'mutually_exclusive') {
      setSelectedKitIds(prev => {
        if (prev.includes(id)) {
          setClearanceKitIds(clearance => clearance.filter(i => i !== id));
          setClearanceDiscounts(discounts => {
            const next = { ...discounts };
            delete next[id];
            return next;
          });
          setMutuallyExclusivePairRows(rows => {
            const rowIndex = rows.findIndex(row => row.bandaiId === id || row.bootlegId === id);
            if (rowIndex < 0) return rows;

            const row = rows[rowIndex];
            const nextRow = row.bandaiId === id
              ? { ...row, bandaiId: null }
              : { ...row, bootlegId: null };
            const nextRows = rows.filter((_, index) => index !== rowIndex);
            if (nextRow.bandaiId || nextRow.bootlegId) nextRows.push(nextRow);
            return nextRows;
          });
          return prev.filter(i => i !== id);
        }

        const isBandai = isBandaiKitId(id);
        setMutuallyExclusivePairRows(rows => {
          const partnerRowIndex = rows.findIndex(row => isBandai
            ? !row.bandaiId && row.bootlegId
            : !row.bootlegId && row.bandaiId);
          if (partnerRowIndex >= 0) {
            return rows.map((row, index) => index === partnerRowIndex
              ? (isBandai ? { ...row, bandaiId: id } : { ...row, bootlegId: id })
              : row);
          }
          return [...rows, isBandai ? { bandaiId: id, bootlegId: null } : { bandaiId: null, bootlegId: id }];
        });
        return [...prev, id];
      });
    } else {
      setSelectedKitIds(prev => {
        if (prev.includes(id)) {
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

  const handleEditSavedDeal = (deal, kitCatalog = kits) => {
    let mappedType = deal.type || 'bundle_only';
    if (mappedType === 'bundle' || mappedType === 'bundle_discount') mappedType = 'bundle_only';
    if (mappedType === 'requirement' || mappedType === 'exclusion') mappedType = 'mutually_exclusive';
    if (isFlexiBundleDeal(deal)) mappedType = FLEXI_BUNDLE_DEAL_TYPE;
    if (isPerKitClearanceDeal(deal)) mappedType = CLEARANCE_DEAL_TYPE;
    
    setDealType(mappedType);
    setDealName(mappedType === 'mutually_exclusive'
      ? 'BANDAI VS BOOTLEG'
      : mappedType === 'bundle_only'
        ? getBundleNameBase(deal.name || '')
        : (deal.name || ''));
    setActiveEditId(deal.id);
    setValidFrom(mappedType === 'mutually_exclusive' ? '' : (deal.validFrom || ''));
    setValidityDays(mappedType === 'mutually_exclusive' ? '' : String(getBundleValidityDays(deal)));
    const editReactivationSettings = getReactivationSettings(deal);
    setReactivationDelay(mappedType === 'mutually_exclusive' ? String(DEFAULT_REACTIVATION_DELAY) : String(editReactivationSettings.value));
    setReactivationDelayUnit(mappedType === 'mutually_exclusive' ? 'hours' : editReactivationSettings.unit);
    
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
    if (isFlexiBundleDeal(deal) || mappedType === CLEARANCE_DEAL_TYPE) {
      kids = Array.from(new Set(
        (deal.clearanceKitIds?.length ? deal.clearanceKitIds : kids)
      ));
    }
    if (mappedType === 'mutually_exclusive') {
      kids = getMutuallyExclusiveKitIds(deal);
    }
    setSelectedKitIds(kids);
    setMutuallyExclusivePairRows(mappedType === 'mutually_exclusive' ? getMutuallyExclusivePairRows(deal, kitCatalog) : []);
    setPreviewKitIds(mappedType === 'mutually_exclusive'
      ? []
      : (deal.previewKitIds || kids).filter(id => kids.includes(id)));
    setClearanceKitIds(isFlexiBundleDeal(deal) || mappedType === CLEARANCE_DEAL_TYPE ? kids : []);
    const originalClearanceOverrides = (isFlexiBundleDeal(deal) || mappedType === CLEARANCE_DEAL_TYPE)
      ? Object.fromEntries(kids
        .filter(id => deal.clearanceDiscounts?.[id] !== '' && deal.clearanceDiscounts?.[id] !== null && deal.clearanceDiscounts?.[id] !== undefined)
        .map(id => [id, deal.clearanceDiscounts[id]]))
      : {};
    const currentClearanceDiscounts = (isFlexiBundleDeal(deal) || mappedType === CLEARANCE_DEAL_TYPE)
      ? Object.fromEntries(kids.map(id => [
        id,
        deal.clearanceDiscounts?.[id] ?? ''
      ]))
      : {};
    setClearanceOriginalOverrides(originalClearanceOverrides);
    setClearanceCurrentDiscounts(currentClearanceDiscounts);
    setClearanceRequiredOtherStocks(isFlexiBundleDeal(deal) || mappedType === CLEARANCE_DEAL_TYPE
      ? getClearanceRequirementMap(deal, kids)
      : {});
    setClearanceKitSchedules(mappedType === CLEARANCE_DEAL_TYPE
      ? Object.fromEntries(kids.map(id => [id, normalizeWildSaleSchedule(deal.clearanceKitSchedules?.[id] || {})]))
      : {});
    setClearanceDiscounts(currentClearanceDiscounts);
    setSearchTerm('');
    setMobileTab('creator');
  };

  const handleSelectClearanceStrategy = () => {
    if (perKitClearanceMasterDeal) {
      handleEditSavedDeal(perKitClearanceMasterDeal);
      return;
    }

    setDealType(CLEARANCE_DEAL_TYPE);
    setDealName('');
    setSelectedKitIds([]);
    setMutuallyExclusivePairRows([]);
    setClearanceKitIds([]);
    setClearanceOriginalOverrides({});
    setClearanceCurrentDiscounts({});
    setClearanceDiscounts({});
    setClearanceRequiredOtherStocks({});
    setClearanceKitSchedules({});
    setActiveEditId(null);
    setValidFrom('');
    setValidityDays(String(DEFAULT_BUNDLE_VALIDITY_DAYS));
    setReactivationDelay(String(DEFAULT_REACTIVATION_DELAY));
    setReactivationDelayUnit('hours');
    setPreviewKitIds([]);
    setDraggedPreviewKitId(null);
  };

  const handleSelectFlexiBundleStrategy = () => {
    if (flexiBundleMasterDeal) {
      handleEditSavedDeal(flexiBundleMasterDeal);
      return;
    }

    setDealType(FLEXI_BUNDLE_DEAL_TYPE);
    setDealName('');
    setSelectedKitIds([]);
    setMutuallyExclusivePairRows([]);
    setClearanceKitIds([]);
    setClearanceOriginalOverrides({});
    setClearanceCurrentDiscounts({});
    setClearanceDiscounts({});
    setClearanceRequiredOtherStocks({});
    setClearanceKitSchedules({});
    setActiveEditId(null);
    setValidFrom('');
    setValidityDays(String(DEFAULT_BUNDLE_VALIDITY_DAYS));
    setReactivationDelay(String(DEFAULT_REACTIVATION_DELAY));
    setReactivationDelayUnit('hours');
    setPreviewKitIds([]);
    setDraggedPreviewKitId(null);
  };

  const handleSelectMutuallyExclusiveStrategy = async () => {
    setIsLoadingMutualKits(true);
    try {
      await Promise.all([loadAllKits(), loadAllDeals()]);

      const latestDeals = useStore.getState().deals || deals || [];
      const latestMutualMaster = latestDeals
        .filter(deal => deal.type === 'mutually_exclusive' || deal.type === 'requirement' || deal.type === 'exclusion')
        .find(deal => deal.isActive !== false)
        || latestDeals.find(deal => deal.type === 'mutually_exclusive' || deal.type === 'requirement' || deal.type === 'exclusion')
        || null;

      if (latestMutualMaster) {
        await loadMissingKits(getMutuallyExclusiveKitIds(latestMutualMaster));
        handleEditSavedDeal(latestMutualMaster, useStore.getState().kits || kits);
        return;
      }

      setDealType('mutually_exclusive');
      setDealName('BANDAI VS BOOTLEG');
      setSelectedKitIds([]);
      setMutuallyExclusivePairRows([]);
      setClearanceKitIds([]);
      setClearanceOriginalOverrides({});
      setClearanceCurrentDiscounts({});
      setClearanceDiscounts({});
      setActiveEditId(null);
      setValidFrom('');
      setValidityDays(String(DEFAULT_BUNDLE_VALIDITY_DAYS));
      setReactivationDelay(String(DEFAULT_REACTIVATION_DELAY));
      setReactivationDelayUnit('hours');
      setPreviewKitIds([]);
      setDraggedPreviewKitId(null);
    } catch (error) {
      console.error('SG LOG: Could not load kits for mutual-exclusion strategy:', error);
      alert(`Could not load kits: ${error.message}`);
    } finally {
      setIsLoadingMutualKits(false);
    }
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
    const isClearanceStrategy = dealType === FLEXI_BUNDLE_DEAL_TYPE || dealType === CLEARANCE_DEAL_TYPE;
    if (!isClearanceStrategy && dealType !== 'mutually_exclusive' && !dealName.trim()) return alert("Please enter a deal name");
    if (isClearanceStrategy && selectedKitIds.length === 0) {
      return alert("Add at least 1 kit to the clearance eligible list");
    }
    if (dealType === 'mutually_exclusive') {
      if (mutuallyExclusiveGroups.bandai.length === 0 || mutuallyExclusiveGroups.bootleg.length === 0) {
        return alert("Add at least one BANDAI kit and one BOOTLEG kit");
      }
      if (mutuallyExclusiveGroups.bandai.length !== mutuallyExclusiveGroups.bootleg.length) {
        return alert("Each BANDAI kit must have one BOOTLEG partner");
      }
      if (mutuallyExclusivePairRows.some(row => !row.bandaiId || !row.bootlegId)) {
        return alert("Pair or remove every kit without a partner before saving");
      }
    } else if (!isClearanceStrategy && selectedKitIds.length < 2) {
      return alert("Pick at least 2 kits for this deal");
    }

    if (dealType === 'bundle_only') {
      const durationDays = Number(validityDays);
      const delayValue = Number(reactivationDelay);
      if (!Number.isInteger(durationDays) || durationDays < DEFAULT_BUNDLE_VALIDITY_DAYS) {
        return alert(`Bundle validity must be at least ${DEFAULT_BUNDLE_VALIDITY_DAYS} days.`);
      }
      if (!Number.isFinite(delayValue) || delayValue < DEFAULT_REACTIVATION_DELAY) {
        return alert(`Automatic reactivation must be at least ${DEFAULT_REACTIVATION_DELAY} hour.`);
      }
    }

    if (dealType === CLEARANCE_DEAL_TYPE) {
      const invalidSchedule = selectedKitIds.find((kitId) => {
        const schedule = clearanceKitSchedules[kitId] || getDefaultClearanceSchedule();
        const start = parseLocalDateTime(schedule.validFrom);
        const delay = Number(schedule.reactivationDelayValue);
        const durationMinutes = getScheduleDurationMinutes(schedule);
        return !start
          || !Number.isFinite(durationMinutes)
          || durationMinutes < WILD_SALE_DEFAULT_DURATION_MINUTES
          || durationMinutes > WILD_SALE_MAX_DURATION_MINUTES
          || !Number.isFinite(delay)
          || delay < DEFAULT_REACTIVATION_DELAY;
      });
      if (invalidSchedule) {
        return alert(`Each Wild Sale kit must run for ${WILD_SALE_DEFAULT_DURATION_MINUTES}–${WILD_SALE_MAX_DURATION_MINUTES} minutes and have a reactivation delay of at least 1 hour.`);
      }
    }
    
    const dealId = activeEditId
      || (dealType === FLEXI_BUNDLE_DEAL_TYPE
        ? flexiBundleMasterDeal?.id
        : dealType === CLEARANCE_DEAL_TYPE
          ? perKitClearanceMasterDeal?.id
        : dealType === 'mutually_exclusive'
          ? mutuallyExclusiveMasterDeal?.id
          : null);
    const mutuallyExclusivePairs = dealType === 'mutually_exclusive'
      ? mutuallyExclusivePairRows.map(row => ({
          bandaiId: row.bandaiId,
          bootlegId: row.bootlegId
        }))
      : [];
    const effectiveClearanceDiscounts = { ...clearanceOriginalOverrides, ...clearanceDiscounts };
    let dealData = {
      id: dealId,
      type: dealType,
      name: dealType === FLEXI_BUNDLE_DEAL_TYPE
        ? 'FLEXI-BUNDLE'
        : dealType === CLEARANCE_DEAL_TYPE
        ? 'WILD SALE'
        : dealType === 'mutually_exclusive'
          ? 'BANDAI VS BOOTLEG'
          : getBundleDealName(dealName, deals, activeEditId, dealToEdit),
      isActive: true,
      kitIds: selectedKitIds,
      previewKitIds: dealType === 'mutually_exclusive' ? [] : previewKitIds,
      clearanceKitIds: isClearanceStrategy ? selectedKitIds : [],
      clearanceDiscounts: isClearanceStrategy
        ? Object.fromEntries(selectedKitIds.map(id => [id, effectiveClearanceDiscounts[id] ?? '']))
        : {},
      mutuallyExclusiveGroups: dealType === 'mutually_exclusive'
        ? {
            bandai: mutuallyExclusiveGroups.bandai.map(kit => kit.id),
            bootleg: mutuallyExclusiveGroups.bootleg.map(kit => kit.id)
          }
        : {},
      bandaiKitIds: dealType === 'mutually_exclusive' ? mutuallyExclusiveGroups.bandai.map(kit => kit.id) : [],
      bootlegKitIds: dealType === 'mutually_exclusive' ? mutuallyExclusiveGroups.bootleg.map(kit => kit.id) : [],
      mutuallyExclusivePairs,
    };

    if (dealType === FLEXI_BUNDLE_DEAL_TYPE) {
      const requiredOtherStockCounts = Object.fromEntries(selectedKitIds.map((kitId) => [
        kitId,
        Math.max(0, Math.floor(Number(clearanceRequiredOtherStocks[kitId] ?? 1) || 0))
      ]));
      dealData.requiredOtherStockCounts = requiredOtherStockCounts;
      const sourceKitIds = selectedKitIds.filter((kitId) => {
        const configuredDiscount = effectiveClearanceDiscounts[kitId];
        return configuredDiscount !== ''
          && configuredDiscount !== null
          && configuredDiscount !== undefined
          && Number(configuredDiscount) > 0;
      });
      // A blank override uses the normal clearance price. Keep one explicit
      // source for legacy-style records when no override was entered.
      dealData.flexiSourceKitIds = sourceKitIds.length > 0
        ? sourceKitIds
        : selectedKitIds.slice(0, 1);
      // Keep the old field for older clients that do not understand the map.
      dealData.requiredOtherStockCount = requiredOtherStockCounts[selectedKitIds[0]] ?? 1;
    } else if (dealType === CLEARANCE_DEAL_TYPE) {
      dealData.requiredOtherStockCounts = {};
      dealData.requiredOtherStockCount = 0;
    }

    if (dealType === CLEARANCE_DEAL_TYPE) {
      dealData.clearanceKitSchedules = Object.fromEntries(selectedKitIds.map((kitId) => {
        const schedule = clearanceKitSchedules[kitId] || getDefaultClearanceSchedule();
        const start = parseLocalDateTime(schedule.validFrom) || new Date();
        const durationMinutes = Math.max(
          WILD_SALE_DEFAULT_DURATION_MINUTES,
          Math.min(WILD_SALE_MAX_DURATION_MINUTES, getScheduleDurationMinutes(schedule))
        );
        const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
        const delayValue = Math.max(DEFAULT_REACTIVATION_DELAY, Number(schedule.reactivationDelayValue) || DEFAULT_REACTIVATION_DELAY);
        return [kitId, {
          validFrom: formatLocalDateTimeValue(start),
          validUntil: formatLocalDateTimeValue(end),
          validityDays: Math.max(1, Math.ceil(durationMinutes / (DAY_IN_MILLISECONDS / (60 * 1000)))),
          validityMinutes: durationMinutes,
          reactivationDelayValue: delayValue,
          reactivationDelayUnit: 'hours',
          reactivationDelayHours: delayValue,
          isActive: true
        }];
      }));
    }

    if (dealType === 'bundle_only') {
      const publishDate = new Date();
      const durationDays = Number(validityDays);
      const delayValue = Number(reactivationDelay);
      const bundleStart = parseLocalDateTime(validFrom) || publishDate;
      const bundleEnd = new Date(bundleStart);
      bundleEnd.setDate(bundleEnd.getDate() + durationDays);
      dealData.discountAmount = financialSummary.requestedDiscount;
      dealData.bundlePrice = financialSummary.bundlePrice;
      dealData.totalCost = financialSummary.totalCost;
      dealData.totalSell = financialSummary.totalSell;
      dealData.kitDiscounts = Object.fromEntries(financialSummary.rows.map(row => [
        row.kit.id,
        {
          discount: Math.round(row.discount),
          finalPrice: row.finalPrice,
          sellPrice: row.sellPrice,
          costPrice: row.costPrice
        }
      ]));
      dealData.validFrom = formatLocalDateTimeValue(bundleStart);
      // Keep the end date for customer-facing countdown/checkout compatibility,
      // but derive it from the admin-controlled duration instead of a fixed week.
      dealData.validUntil = formatLocalDateTimeValue(bundleEnd);
      dealData.validityDays = durationDays;
      dealData.reactivationDelayValue = delayValue;
      dealData.reactivationDelayUnit = reactivationDelayUnit;
      dealData.reactivationDelayHours = delayValue * (reactivationDelayUnit === 'days' ? 24 : 1);
      dealData.stockSource = 'onhand';
    }

    if (isClearanceStrategy) {
      const clearanceSummary = financialSummary;
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
      // FLEXI-BUNDLE remains permanent. WILD SALE stores timing per kit.
      dealData.validFrom = '';
      dealData.validUntil = '';
      dealData.stockSource = 'onhand';
    }

    if (dealType === 'mutually_exclusive') {
      dealData.validFrom = '';
      dealData.validUntil = '';
      dealData.stockSource = 'onhand';
    }

    // Normal bundles are atomic and require every included kit to be available.
    // FLEXI-BUNDLE kits are sold independently, so an unavailable eligible kit
    // must not block saving a requirement change for the other kits.
    if (dealType === 'bundle_only' || dealType === CLEARANCE_DEAL_TYPE) {
      const unfulfillableKits = selectedKitIds.filter(kidId => {
        const kit = kits.find(k => k.id === kidId);
        if (!kit) return true;
        const stocks = Object.values(kit.stocks || {});
        return !stocks.some(s => isBundlePurchasableStock(s, 'onhand'));
      });
      if (unfulfillableKits.length > 0) {
        const names = unfulfillableKits.map(id => kits.find(k => k.id === id)?.name || id).join(', ');
        if (dealType === CLEARANCE_DEAL_TYPE) {
          dealData.clearanceKitSchedules = Object.fromEntries(
            Object.entries(dealData.clearanceKitSchedules || {}).map(([kitId, schedule]) => [kitId, {
              ...schedule,
              isActive: !unfulfillableKits.includes(kitId)
            }])
          );
          alert(`Warning: The following kits have no available stock, so their WILD SALE entries will be saved as inactive:\n${names}`);
        } else if (dealType === 'bundle_only') {
          dealData.isActive = false;
          alert(`Warning: The following kits have no available stock, so this bundle deal will be saved as INACTIVE:\n${names}`);
        } else {
          alert(`Notice: The following FLEXI-BUNDLE kits have no available stock and will be hidden until stock returns. The other kits remain available:\n${names}`);
        }
      }
    }

    try {
      setIsSaving(true);
      await addDeal(dealData);

      if (dealType === 'mutually_exclusive') {
        const selectedShelfItems = (shelf || []).filter(item => selectedKitIds.includes(item.id));
        for (const shelfItem of selectedShelfItems) {
          try {
            await removeFromBasket(shelfItem.basketId);
          } catch (releaseError) {
            console.error('SG LOG: Could not release selected mutual-exclusion shelf stock:', releaseError);
          }
        }
      }

      alert("Success! Deal synchronized.");
      setDealName('');
      setDiscountAmount('');
      setSelectedKitIds([]);
      setMutuallyExclusivePairRows([]);
      setSearchTerm('');
      setActiveEditId(null);
      setValidFrom('');
      setValidityDays(String(DEFAULT_BUNDLE_VALIDITY_DAYS));
      setReactivationDelay(String(DEFAULT_REACTIVATION_DELAY));
      setReactivationDelayUnit('hours');
      setPreviewKitIds([]);
      setDraggedPreviewKitId(null);
        setClearanceKitIds([]);
      setClearanceOriginalOverrides({});
      setClearanceCurrentDiscounts({});
      setClearanceDiscounts({});
      setClearanceKitSchedules({});
      setMobileTab('list');
    } catch (e) { 
      console.error(e); 
      alert("Error: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const renderMutuallyExclusivePairs = () => {
    const kitMap = new Map((kits || []).map(kit => [kit.id, kit]));
    const pairEntries = mutuallyExclusivePairRows.map((pair, index) => ({
      index,
      bandai: kitMap.get(pair.bandaiId),
      bootleg: kitMap.get(pair.bootlegId)
    }));

    const renderPairSide = (label, kit, pairIndex) => {
      return (
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-2 py-2">
          {kit ? (
            <>
              <img src={resolveImage(kit.image, kit.images)} className="h-8 w-8 shrink-0 rounded-lg object-cover bg-white" alt="" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-black uppercase text-[var(--color-text-main)]" title={kit.name}>{kit.name}</div>
                <span className="mt-0.5 block truncate text-[12px] font-black uppercase text-[var(--color-text-main)]">
                  {[kit.brand, kit.specs?.line, kit.specs?.scale].filter(Boolean).join(' / ') || 'No brand, line, or scale'}
                </span>
              </div>
              <div className="shrink-0 text-right leading-tight">
                <span className="block text-[12px] font-black uppercase text-emerald-500">SELL ₱{getBundleStandardSellPrice(getHighestOnhandStock(kit), kit).toLocaleString()}</span>
                <span className="block text-[12px] font-black uppercase text-[var(--color-text-main)]">COST ₱{Number(getHighestOnhandStock(kit).costPrice || kit.costPrice || 0).toLocaleString()}</span>
              </div>
              <button
                type="button"
                onClick={() => toggleKitSelection(kit.id)}
                className="shrink-0 rounded-full p-1 opacity-50 transition-all hover:bg-red-500/10 hover:text-red-500 hover:opacity-100"
                title={`Remove ${label} kit from pair ${pairIndex + 1}`}
              >
                <X size={12} />
              </button>
            </>
          ) : (
            <span className="w-full px-1 py-2 text-center text-[10px] font-black uppercase tracking-wide opacity-50">
              Add {label} partner
            </span>
          )}
        </div>
      );
    };

    return (
      <div className="space-y-3">
        {pairEntries.map(({ index, bandai, bootleg }) => (
          <div key={`mutual-pair-${index}`} className="space-y-2">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <span className="text-[11px] font-black uppercase tracking-widest text-[var(--color-text-main)]">Pair {index + 1}</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-main)]">Cannot be sold together</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {renderPairSide('BANDAI', bandai, index)}
              {renderPairSide('BOOTLEG', bootleg, index)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const handleExcludeClearanceKit = async (deal, kitId) => {
    const currentKitIds = Array.from(new Set(
      deal.clearanceKitIds?.length ? deal.clearanceKitIds : deal.kitIds || []
    ));
    if (currentKitIds.length <= 1) {
      alert('A clearance master list must keep at least one eligible kit.');
      return;
    }

    const nextKitIds = currentKitIds.filter(id => id !== kitId);
    const nextDiscounts = Object.fromEntries(nextKitIds.map(id => [
      id,
      deal.clearanceDiscounts?.[id] ?? ''
    ]));
    const nextRequiredOtherStockCounts = Object.fromEntries(nextKitIds.map(id => [
      id,
      Math.max(0, Math.floor(Number(getClearanceRequiredOtherStock(deal, id)) || 0))
    ]));
    const nextSourceKitIds = isFlexiBundleDeal(deal)
      ? (Array.isArray(deal.flexiSourceKitIds)
        ? deal.flexiSourceKitIds.filter(id => nextKitIds.includes(id))
        : nextKitIds.slice(0, 1))
      : undefined;
    const rows = getOrderedKits(kits, nextKitIds).map(kit => {
      const stock = getHighestOnhandStock(kit);
      return {
        kit,
        stock,
        kitId: kit.id,
        sellPrice: getBundleStandardSellPrice(stock, kit),
        costPrice: Number(stock.costPrice || 0)
      };
    });
    const summary = isFlexiBundleDeal(deal)
      ? getFlexiBundlePreviewPricing(rows, nextKitIds, nextDiscounts)
      : getClearanceBundlePricing(rows, nextKitIds, nextDiscounts);

    try {
      await updateDeal(deal.id, {
        kitIds: nextKitIds,
        clearanceKitIds: nextKitIds,
        clearanceDiscounts: nextDiscounts,
        requiredOtherStockCounts: nextRequiredOtherStockCounts,
        requiredOtherStockCount: nextRequiredOtherStockCounts[nextKitIds[0]] ?? 1,
        previewKitIds: nextKitIds,
        ...(isFlexiBundleDeal(deal) ? { flexiSourceKitIds: nextSourceKitIds.length > 0 ? nextSourceKitIds : nextKitIds.slice(0, 1) } : {}),
        bundlePrice: summary.bundlePrice,
        totalCost: summary.totalCost,
        totalSell: summary.totalSell,
        discountAmount: summary.discountAmount,
        clearanceDiscountTotal: summary.clearanceDiscountTotal,
        standardDiscountTotal: summary.standardDiscountTotal,
        kitDiscounts: Object.fromEntries(summary.rows.map(row => [
          row.kitId,
          {
            discount: Math.round(row.discount || 0),
            finalPrice: row.finalPrice,
            isClearance: row.isClearance,
            clearancePrice: row.clearancePrice,
            sellPrice: row.sellPrice,
            costPrice: row.costPrice
          }
        ]))
      });
      if (activeEditId === deal.id) {
        setSelectedKitIds(nextKitIds);
        setClearanceKitIds(nextKitIds);
        setClearanceDiscounts(nextDiscounts);
        setClearanceRequiredOtherStocks(nextRequiredOtherStockCounts);
        setPreviewKitIds(nextKitIds);
      }
    } catch (error) {
      console.error('Error excluding clearance kit:', error);
      alert(`Error excluding kit: ${error.message}`);
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
      setValidityDays(String(DEFAULT_BUNDLE_VALIDITY_DAYS));
        setReactivationDelay(String(DEFAULT_REACTIVATION_DELAY));
        setReactivationDelayUnit('hours');
        setPreviewKitIds([]);
        setDraggedPreviewKitId(null);
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
    if (!visibleDeals || visibleDeals.length === 0) return;
    if (selectedDealIds.length === visibleDeals.length) {
      setSelectedDealIds([]);
    } else {
      setSelectedDealIds(visibleDeals.map(d => d.id));
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
          setSearchTerm(''); setActiveEditId(null); setValidFrom(''); setValidityDays(String(DEFAULT_BUNDLE_VALIDITY_DAYS)); setReactivationDelay(String(DEFAULT_REACTIVATION_DELAY)); setReactivationDelayUnit('hours');
        setPreviewKitIds([]); setDraggedPreviewKitId(null);
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
        const deal = visibleDeals.find(candidate => candidate.id === id);
        if (isPerKitClearanceDeal(deal)) {
          await updateDeal(id, {
            isActive: true,
            clearanceKitSchedules: Object.fromEntries(
              Object.entries(deal.clearanceKitSchedules || {}).map(([kitId, schedule]) => [kitId, {
                ...schedule,
                isActive: true
              }])
            )
          });
        } else {
          await updateDeal(id, { isActive: true });
        }
      }
      setSelectedDealIds([]);
      alert(`${selectedDealIds.length} deal(s) reactivated.`);
    } catch (e) {
      alert("Reactivation error: " + e.message);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const allSelected = visibleDeals.length > 0 && selectedDealIds.length === visibleDeals.length;

  return (
    <div className="fixed inset-0 z-[500] flex items-start justify-center bg-black/60 p-0 font-sans text-neutral-900 dark:text-white lg:items-center lg:p-4" role="dialog" aria-modal="true" aria-label="Deal entry">
      <div className={`relative flex h-full min-h-0 w-full flex-col overflow-hidden text-left shadow-2xl backdrop-blur-xl lg:h-auto lg:max-h-[95vh] lg:max-w-5xl lg:rounded-[2.5rem] lg:border lg:p-5 ${isDarkMode ? 'border-white/10 bg-[#0a0a0a]/90 text-white' : 'border-black/5 bg-white/90 text-neutral-900'}`}>
        
        {/* Mobile sticky close button (same pattern as ProductCard) */}
        <div className="sticky top-0 z-[220] w-full h-0 overflow-visible lg:hidden">
          <div className="absolute top-4 right-4 flex justify-end items-center">
            <button onClick={onClose} className="p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Header */}
        <div className="p-4 pr-16 lg:p-6 lg:pr-6 border-b border-[var(--color-border)] flex items-center justify-between">
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
          <button onClick={onClose} className="hidden lg:block p-2 hover:bg-black/5 rounded-full transition-colors opacity-40"><X size={24} /></button>
        </div>

        {/* Mobile Tab Toggle */}
        <div className="flex lg:hidden border-b border-[var(--color-border)] bg-black/5 dark:bg-white/[0.02] shrink-0">
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
            Active List ({visibleDeals.length})
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col lg:flex-row">
          
          {/* ══ Left Column - Creator Panel ══ */}
          <div className={`w-full lg:w-6/12 min-h-0 p-4 lg:p-6 lg:border-r border-[var(--color-border)] space-y-5 overflow-y-auto custom-scrollbar ${mobileTab === 'creator' ? 'block' : 'hidden lg:block'}`}>
             <div className="space-y-2 text-left">
                <label className="text-[12px] font-black uppercase tracking-widest opacity-40 ml-2">Select Strategy</label>
                <div className="grid grid-cols-2 gap-2">
                   <button onClick={() => { setDealType('bundle_only'); setDealName(''); setActiveEditId(null); setSelectedKitIds([]); setMutuallyExclusivePairRows([]); setClearanceKitIds([]); setClearanceOriginalOverrides({}); setClearanceCurrentDiscounts({}); setClearanceDiscounts({}); }} className={`py-3 rounded-2xl border flex flex-col items-center gap-1 transition-all ${dealType === 'bundle_only' ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg' : 'bg-black/5 border-[var(--color-border)] opacity-60'}`}>
                      <Lock size={16} /> <span className="text-[11px] font-black uppercase">Bundle Deal</span>
                   </button>
                   <button type="button" aria-pressed={isFlexiStrategy} onClick={handleSelectFlexiBundleStrategy} className={`py-3 rounded-2xl border flex flex-col items-center gap-1 transition-all ${isFlexiStrategy ? 'bg-amber-500 border-amber-500 text-white shadow-lg' : 'bg-black/5 border-[var(--color-border)] opacity-60'}`}>
                      <Gift size={16} /> <span className="text-[11px] font-black uppercase">Flexi-Bundle</span>
                   </button>
                   <button type="button" aria-pressed={dealType === CLEARANCE_DEAL_TYPE} onClick={handleSelectClearanceStrategy} className={`py-3 rounded-2xl border flex flex-col items-center gap-1 transition-all ${dealType === CLEARANCE_DEAL_TYPE ? 'bg-red-500 border-red-500 text-white shadow-lg' : 'bg-black/5 border-[var(--color-border)] opacity-60'}`}>
                      <Gift size={16} /> <span className="text-[11px] font-black uppercase">Wild Sale</span>
                   </button>
                   <button type="button" aria-pressed={dealType === 'mutually_exclusive'} onClick={handleSelectMutuallyExclusiveStrategy} disabled={isLoadingMutualKits} className={`py-3 rounded-2xl border flex flex-col items-center gap-1 transition-all ${dealType === 'mutually_exclusive' ? 'bg-red-600 border-red-600 text-white shadow-lg' : 'bg-black/5 border-[var(--color-border)] opacity-60'} ${isLoadingMutualKits ? 'cursor-wait opacity-70' : ''}`}>
                      {isLoadingMutualKits ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />} <span className="text-[11px] font-black uppercase">Mutually Exclusive</span>
                   </button>
                </div>
             </div>

             <div className="space-y-4">
                {!isClearanceStrategy && dealType !== 'mutually_exclusive' && (
                  <div className="space-y-1 text-left">
                     <label className="text-[12px] font-black uppercase tracking-widest opacity-40 ml-2">Deal Name</label>
                     <input value={dealName} onChange={e => setDealName(e.target.value)} placeholder="E.G. PROMO PACK" className="w-full bg-black/5 border border-[var(--color-border)] rounded-2xl px-4 py-3 text-xs font-bold outline-none focus:border-blue-500 uppercase text-[var(--color-text-main)]" />
                  </div>
                )}

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
                             <p className={`text-[12px] font-bold mt-0.5 uppercase truncate ${!hasPurchasableStock ? 'text-red-400' : 'opacity-50'}`}>{hasPurchasableStock ? ([kit.brand, kit.specs?.line, kit.specs?.scale].filter(Boolean).join(' / ') || 'No brand, line, or scale') : 'NO STOCK'}</p>
                           </div>
                           <Plus size={14} className={hasPurchasableStock ? 'opacity-40' : 'opacity-20 text-red-400'} />
                         </div>
                         );
                       })}
                     </div>
                   )}
                </div>

                {(dealType === 'bundle_only' || isClearanceStrategy || dealType === 'mutually_exclusive') && (
                  <div className="flex flex-col gap-4 animate-in zoom-in duration-300">
                    {selectedKitsData.length > 0 && (
                      <div className="space-y-4 text-left">
                         <div className={`${isClearanceStrategy || dealType === 'mutually_exclusive' ? 'hidden' : 'grid grid-cols-2 gap-4'}`}>
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
                                <input type="number" min="0" value={discountAmount} onChange={e => setDiscountAmount(e.target.value === '' ? '' : String(Math.max(0, Number(e.target.value) || 0)))} placeholder={`₱${Number(financialSummary.suggestedDiscount || 0).toLocaleString()}`} className="w-full appearance-none bg-blue-600/10 border border-blue-600/30 rounded-2xl px-4 py-4 text-sm font-black text-blue-500 outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
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

                        {dealType === FLEXI_BUNDLE_DEAL_TYPE && (
                          <p className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-[11px] font-bold leading-relaxed text-amber-600">
                            Set the required other stock and optional discount override separately for each eligible kit below. A kit receives its clearance discount only when its own requirement is met.
                          </p>
                        )}
                        {dealType === CLEARANCE_DEAL_TYPE && (
                          <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-[11px] font-bold leading-relaxed text-red-600">
                            Each eligible stock can be sold individually. Prices use the discount floor, with optional per-kit discount overrides, and each kit follows its own start, duration, and reactivation schedule.
                          </p>
                        )}

                        {/* Inclusions */}
                         <div className={`${dealType === 'mutually_exclusive' ? 'hidden' : 'min-w-0 space-y-2'}`}>
                          <div className="flex items-center justify-between gap-3 px-2">
                            <label className="text-[12px] font-black uppercase tracking-widest opacity-40">Inclusions ({selectedKitsData.length})</label>
                            <span className="text-[12px] font-black uppercase tracking-widest opacity-30">{isClearanceStrategy ? 'Eligible kits / X to remove' : dealType === 'mutually_exclusive' ? 'Exactly 2 kits / X to remove' : 'Drag to reorder / X to remove'}</span>
                          </div>
                          {getOrderedKits(kits, previewKitIds).map((kit, index) => {
                            const stock = dealType === 'bundle_only'
                              ? getHighestAvailableOnhandStock(kit)
                              : getHighestOnhandStock(kit);
                            const discountRow = financialSummary.rows.find(row => row.kit.id === kit.id);
                            const individualBundleDiscount = dealType === 'bundle_only'
                              ? Math.max(0, Math.round(Number(discountRow?.discount || 0)))
                              : 0;
                            const currentClearanceDiscount = getClearanceDiscountPlaceholder(
                              kit.id,
                              isClearanceStrategy
                                ? Math.max(
                                  0,
                                  Number(stock.sellPrice || kit.sellPrice || 0)
                                    - Math.min(
                                      Number(stock.sellPrice || kit.sellPrice || 0),
                                      getDiscountFloor(Number(stock.costPrice || kit.costPrice || 0))
                                    )
                                )
                                : (discountRow?.discount ?? discountRow?.clearanceDiscount ?? 0)
                            );
                            return (
                            <div
                              key={kit.id}
                              draggable
                              onDragStart={() => setDraggedPreviewKitId(kit.id)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => movePreviewKit(draggedPreviewKitId, kit.id)}
                              onDragEnd={() => setDraggedPreviewKitId(null)}
                              className={`flex cursor-grab flex-col gap-3 rounded-xl border px-3 py-3 transition-all active:cursor-grabbing ${index < 4 ? 'border-blue-500/30 bg-blue-500/10' : 'border-[var(--color-border)] bg-black/5'}`}
                            >
                              <div className="flex w-full min-w-0 items-center gap-3">
                                <img src={resolveImage(kit.image, kit.images)} className="h-10 w-10 shrink-0 rounded-lg object-cover bg-white" alt="" />
                                <div className="min-w-0 flex-1">
                                  <div className="break-words text-[13px] font-black uppercase leading-tight" title={kit.name}>{kit.name}</div>
                                  <span className="mt-1 block break-words text-[12px] font-black uppercase leading-tight">
                                  {[kit.brand, kit.specs?.line, kit.specs?.scale].filter(Boolean).join(' / ') || 'No brand, line, or scale'}
                                  </span>
                                </div>
                              </div>
                              <div className="flex w-full flex-wrap items-end gap-3 border-t border-black/5 pt-2 dark:border-white/10">
                              <div className="flex min-w-[9rem] flex-col gap-0.5 text-left leading-tight">
                                <span className="block text-[12px] font-black uppercase text-emerald-500">SELL ₱{Number(stock.sellPrice || kit.sellPrice || 0).toLocaleString()}</span>
                                <span className="block text-[12px] font-black uppercase opacity-35">COST ₱{Number(stock.costPrice || 0).toLocaleString()}</span>
                                <span className={`block text-[12px] font-black uppercase ${isClearanceStrategy ? 'text-amber-500' : 'text-blue-500'}`}>DEAL ₱{Number(discountRow?.finalPrice || stock.sellPrice || kit.sellPrice || 0).toLocaleString()}</span>
                                {dealType === 'bundle_only' && (
                                  <span className="block text-[12px] font-black uppercase text-blue-500/70">DISC ₱{individualBundleDiscount.toLocaleString()}</span>
                                )}
                              </div>
                              {(dealType === FLEXI_BUNDLE_DEAL_TYPE || dealType === CLEARANCE_DEAL_TYPE) && (
                                <div className="flex shrink-0 items-end gap-1.5">
                                  {dealType === FLEXI_BUNDLE_DEAL_TYPE && (
                                    <label className="flex w-16 flex-col gap-1 text-[9px] font-black uppercase tracking-wider text-amber-600">
                                      Other stock
                                      <input
                                        type="number"
                                        min="0"
                                        max="9"
                                        step="1"
                                        value={clearanceRequiredOtherStocks[kit.id] ?? '1'}
                                        onChange={(event) => {
                                          const value = event.target.value.replace(/\D/g, '').slice(0, 1);
                                          setClearanceRequiredOtherStocks(prev => ({ ...prev, [kit.id]: value }));
                                        }}
                                        title="Number of stock units from another kit required for this kit's FLEXI-BUNDLE discount"
                                        className="h-10 w-full appearance-none rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-[12px] font-black text-amber-600 outline-none focus:border-amber-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                      />
                                    </label>
                                  )}
                                  <label className="flex w-24 flex-col gap-1 text-[9px] font-black uppercase tracking-wider text-blue-500">
                                    Discount override
                                    <input
                                      type="number"
                                      min="0"
                                      max="9999"
                                      value={clearanceDiscounts[kit.id] ?? ''}
                                      onChange={(event) => {
                                        const value = event.target.value.replace(/\D/g, '').slice(0, 4);
                                        setClearanceDiscounts(prev => ({ ...prev, [kit.id]: value }));
                                      }}
                                      placeholder={`₱${Number(currentClearanceDiscount || 0).toLocaleString()}`}
                                      title="Type a discount amount to override the current discount"
                                      className="h-10 w-full appearance-none rounded-lg border border-[var(--color-border)] bg-black/5 px-2 py-2 text-[12px] font-black italic uppercase tracking-wider text-blue-500 outline-none placeholder:text-[10px] placeholder:font-black placeholder:italic placeholder:text-blue-500 focus:border-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    />
                                  </label>
                                </div>
                              )}
                              {dealType === CLEARANCE_DEAL_TYPE && (
                                <div className="grid w-full grid-cols-2 gap-2 border-t border-black/5 pt-2 text-[9px] font-black uppercase tracking-wider text-red-500 dark:border-white/10 sm:grid-cols-3">
                                  <div className="min-w-0 flex flex-col gap-1">
                                    <span>Starts</span>
                                    <DealDatePicker
                                      value={(clearanceKitSchedules[kit.id] || {}).validFrom || ''}
                                      onChange={(value) => setClearanceKitSchedules(prev => {
                                        const current = { ...getDefaultClearanceSchedule(), ...(prev[kit.id] || {}) };
                                        const start = parseLocalDateTime(value) || new Date();
                                        const durationMinutes = getScheduleDurationMinutes(current);
                                        return {
                                          ...prev,
                                          [kit.id]: {
                                            ...current,
                                            validFrom: value,
                                            validUntil: formatLocalDateTimeValue(new Date(start.getTime() + durationMinutes * 60 * 1000)),
                                            validityMinutes: durationMinutes
                                          }
                                        };
                                      })}
                                      isDarkMode={isDarkMode}
                                      placeholder="Start time"
                                      align="left"
                                    />
                                  </div>
                                  <label className="min-w-0 flex flex-col gap-1">
                                    <span>Duration (MIN)</span>
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        min={WILD_SALE_DEFAULT_DURATION_MINUTES}
                                        max={WILD_SALE_MAX_DURATION_MINUTES}
                                        value={getScheduleDurationMinutes(clearanceKitSchedules[kit.id] || getDefaultClearanceSchedule())}
                                        onChange={(event) => setClearanceKitSchedules(prev => {
                                          const current = { ...getDefaultClearanceSchedule(), ...(prev[kit.id] || {}) };
                                          const minutes = Math.max(WILD_SALE_DEFAULT_DURATION_MINUTES, Math.min(WILD_SALE_MAX_DURATION_MINUTES, Number(event.target.value) || WILD_SALE_DEFAULT_DURATION_MINUTES));
                                          const start = parseLocalDateTime(current.validFrom) || new Date();
                                          return {
                                            ...prev,
                                            [kit.id]: {
                                              ...current,
                                              validityMinutes: minutes,
                                              validUntil: formatLocalDateTimeValue(new Date(start.getTime() + minutes * 60 * 1000))
                                            }
                                          };
                                        })}
                                        className="h-10 w-full min-w-0 rounded-lg border border-red-500/30 bg-red-500/10 px-2 text-[12px] font-black text-red-500 outline-none focus:border-red-500"
                                      />
                                      <span className="shrink-0 text-[9px]">MIN</span>
                                    </div>
                                  </label>
                                  <div className="col-span-2 min-w-0 flex flex-col gap-1 sm:col-span-1">
                                    <span>Reactivation (HOURS)</span>
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        min={DEFAULT_REACTIVATION_DELAY}
                                        value={(clearanceKitSchedules[kit.id] || {}).reactivationDelayValue ?? DEFAULT_REACTIVATION_DELAY}
                                        onChange={(event) => setClearanceKitSchedules(prev => ({
                                          ...prev,
                                          [kit.id]: { ...getDefaultClearanceSchedule(), ...(prev[kit.id] || {}), reactivationDelayValue: event.target.value }
                                        }))}
                                        className="h-10 w-full min-w-0 rounded-lg border border-red-500/30 bg-red-500/10 px-2 text-[12px] font-black text-red-500 outline-none focus:border-red-500"
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleKitSelection(kit.id);
                                }}
                                onDragStart={(event) => event.preventDefault()}
                                className="mb-2 shrink-0 self-end rounded-full p-1 opacity-50 transition-all hover:bg-red-500/10 hover:text-red-500 hover:opacity-100"
                                title="Remove inclusion"
                              >
                                <X size={12} />
                              </button>
                              </div>
                            </div>
                            );
                           })}
                         </div>
                         {dealType === 'mutually_exclusive' && (
                           renderMutuallyExclusivePairs()
                         )}
                       </div>
                    )}
                    <div className="hidden space-y-1 text-left">
                      <label className="text-[12px] font-black uppercase tracking-widest opacity-40 ml-2">Discount Amount (₱)</label>
                      <input type="number" min="0" value={discountAmount} onChange={e => setDiscountAmount(e.target.value === '' ? '' : String(Math.max(0, Number(e.target.value) || 0)))} placeholder="0.00" className="w-full appearance-none bg-blue-600/10 border border-blue-600/30 rounded-2xl px-4 py-4 text-sm font-black text-blue-500 outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                    </div>

                    {/* Bundle timing is controlled by the publish date, duration, and reactivation delay. */}
                    {dealType === 'bundle_only' && <div className="order-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1 text-left">
                        <label className="text-[12px] font-black uppercase tracking-widest opacity-40 ml-2 flex items-center gap-1.5">
                          <Calendar size={10} /> Validity Start
                        </label>
                        <DealDatePicker
                          value={validFrom}
                          onChange={setValidFrom}
                          isDarkMode={isDarkMode}
                          placeholder="Current date & time"
                          align="left"
                        />
                      </div>
                      <div className="space-y-1 text-left">
                        <label className="text-[12px] font-black uppercase tracking-widest opacity-40 ml-2 flex items-center gap-1.5">
                          <Clock3 size={10} /> Validity Duration
                        </label>
                        <input
                          type="number"
                          min={DEFAULT_BUNDLE_VALIDITY_DAYS}
                          step="1"
                          value={validityDays}
                          onChange={e => setValidityDays(e.target.value)}
                          placeholder="Number of days"
                          className="h-[42px] w-full appearance-none bg-black/5 border border-[var(--color-border)] rounded-2xl px-4 py-2 text-sm font-black outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </div>
                      <div className="space-y-1 text-left sm:col-span-2">
                        <label className="text-[12px] font-black uppercase tracking-widest opacity-40 ml-2 flex items-center gap-1.5">
                          <RefreshCw size={10} /> Auto Reactivate After
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min={DEFAULT_REACTIVATION_DELAY}
                            step="1"
                            value={reactivationDelay}
                            onChange={e => setReactivationDelay(e.target.value)}
                            placeholder="1"
                            className="h-[42px] min-w-0 flex-1 appearance-none bg-black/5 border border-[var(--color-border)] rounded-2xl px-4 py-2 text-sm font-black outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => setReactivationDelayUnit(currentUnit => currentUnit === 'hours' ? 'days' : 'hours')}
                            aria-label={`Switch reactivation unit to ${reactivationDelayUnit === 'hours' ? 'days' : 'hours'}`}
                            aria-pressed={reactivationDelayUnit === 'days'}
                            className="h-[42px] w-32 rounded-2xl border border-[var(--color-border)] bg-black/5 px-3 py-2 text-left text-sm font-black outline-none transition-colors hover:border-blue-500 focus:border-blue-500"
                          >
                            {reactivationDelayUnit === 'hours' ? 'Hours' : 'Days'}
                          </button>
                        </div>
                        <p className="px-2 pt-1 text-[10px] font-bold uppercase tracking-wider opacity-40">
                          After expiry, the deal will be checked for allocatable stock before it is reopened.
                        </p>
                      </div>
                    </div>}

                    {dealType !== 'mutually_exclusive' && !isClearanceStrategy && <div className="order-4 bg-black/5 rounded-2xl p-4 flex flex-col gap-2 text-left border border-white/5">
                       {dealType === 'bundle_only' ? (
                         <div className="flex justify-between items-center text-emerald-500">
                            <span className="text-[12px] font-black uppercase tracking-wider">Bundle Discount</span>
                            <span className="text-[12px] font-black italic">-₱{Number(financialSummary.discountAmount || 0).toLocaleString()}</span>
                         </div>
                       ) : isClearanceStrategy ? (
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
                          <span className="text-[12px] font-black uppercase">Combined Sell (Excl. Installment)</span>
                          <span className="text-[12px] font-bold">₱{financialSummary.totalSell.toLocaleString()}</span>
                       </div>
                       <div className="flex justify-between items-center opacity-40">
                          <span className="text-[12px] font-black uppercase">Combined Cost</span>
                          <span className="text-[12px] font-bold">₱{financialSummary.totalCost.toLocaleString()}</span>
                       </div>
                       <div className="flex justify-between items-center text-blue-500">
                          <span className="text-[12px] font-black uppercase tracking-wider">{isClearanceStrategy ? 'Total Discount' : dealType === 'mutually_exclusive' ? 'Discount' : 'Requested Discount'}</span>
                          <span className="text-[12px] font-black italic">-₱{Number(isClearanceStrategy ? financialSummary.discountAmount : dealType === 'bundle_only' ? financialSummary.requestedDiscount : (parseFloat(discountAmount) || 0)).toLocaleString()}</span>
                       </div>
                       <div className="h-px bg-white/5 my-1" />
                       <div className="flex justify-between items-center">
                          <span className="text-[12px] font-black uppercase tracking-[0.2em] opacity-40">Est. Margin</span>
                          <span className={`text-[12px] font-black italic ${financialSummary.discountAmount >= (financialSummary.totalSell - financialSummary.totalCost) ? 'text-red-500' : 'text-emerald-500'}`}>
                             ₱{financialSummary.projectedProfit.toLocaleString()}
                          </span>
                       </div>
                       <div className="flex justify-between items-center text-blue-500">
                          <span className="text-[12px] font-black uppercase tracking-[0.2em]">Discounted Total</span>
                          <span className="text-[12px] font-black italic">₱{Number(financialSummary.bundlePrice || 0).toLocaleString()}</span>
                       </div>
                    </div>}
                  </div>
                )}
             </div>

             <div className="bg-blue-600/5 border border-blue-600/10 p-4 rounded-2xl text-left">
                <p className="text-[12px] font-bold leading-relaxed opacity-70 italic">
                   {dealType === 'bundle_only' ? "Bundle deals use clearance-style pricing: the admin discount is distributed across the pre-bundled kits without pricing any item below its clearance cost ceiling." : isClearanceStrategy ?
                    "Eligible kits use cost-protected clearance pricing. The discount unlocks after the required number of other on-hand kits is selected; CLEARANCE kits also expire and reactivate independently." :
                    "Item A and Item B cannot be sold together. Automatic reserving & shelf synchronization will run reactively."}
                </p>
             </div>

             <div className="flex gap-3">
               {activeEditId && (
               <button onClick={() => { setActiveEditId(null); setDealName(''); setDiscountAmount(''); setSelectedKitIds([]); setValidFrom(''); setValidityDays(String(DEFAULT_BUNDLE_VALIDITY_DAYS)); setReactivationDelay(String(DEFAULT_REACTIVATION_DELAY)); setReactivationDelayUnit('hours'); setPreviewKitIds([]); setDraggedPreviewKitId(null); setClearanceKitIds([]); setClearanceOriginalOverrides({}); setClearanceCurrentDiscounts({}); setClearanceDiscounts({}); setClearanceRequiredOtherStocks({}); setMobileTab('list'); }} className="px-5 py-4 rounded-2xl bg-black/5 hover:bg-black/10 border border-[var(--color-border)] font-black uppercase text-[11px] tracking-widest transition-all">Cancel</button>
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
          <div className={`flex-1 min-h-0 flex flex-col bg-black/5 dark:bg-white/[0.02] border-t lg:border-t-0 border-[var(--color-border)] ${mobileTab === 'list' ? 'flex' : 'hidden lg:flex'}`}>
             <div className="p-4 lg:p-6 border-b border-[var(--color-border)] text-left">
                <div className="flex justify-between items-center mb-3">
                   <div>
                      <h3 className="text-xs font-black uppercase tracking-widest">Active Deals & Bundles</h3>
                      <span className="text-[12px] opacity-40 uppercase font-bold mt-1 block">Modify or delete active settings</span>
                   </div>
                   <span className="text-[12px] font-black px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 uppercase">{visibleDeals.length} Saved</span>
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

             <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 lg:p-6 space-y-3 custom-scrollbar">
                {visibleDeals.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-30 p-10">
                    <Gift size={40} className="stroke-[1.5]" />
                    <p className="text-[12px] font-black uppercase tracking-widest mt-3">No active deals found</p>
                  </div>
                ) : (
                  visibleDeals.map(deal => {
                    const isMutualDeal = deal.type === 'mutually_exclusive' || deal.type === 'requirement' || deal.type === 'exclusion';
                    const isFlexiDeal = isFlexiBundleDeal(deal);
                    const isPerKitClearance = isPerKitClearanceDeal(deal);
                    const isClearanceLike = isFlexiDeal || isPerKitClearance;
                    const strategyLabel = isClearanceLike ? (isFlexiDeal ? 'FLEXI-BUNDLE' : 'WILD SALE') : (deal.type === 'bundle_discount' || deal.type === 'bundle_only') ? 'Bundle Deal' :
                                          isMutualDeal ? 'Bandai vs Bootleg' : 'Legacy Bundle';
                    
                    const badgeClass = isClearanceLike ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : (deal.type === 'bundle_discount' || deal.type === 'bundle_only') ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                                       isMutualDeal ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20';

                    const dealEligibleKitIds = isClearanceLike
                      ? (deal.clearanceKitIds?.length ? deal.clearanceKitIds : deal.kitIds || [])
                      : isMutualDeal ? getMutuallyExclusiveKitIds(deal) : deal.kitIds || [];
                    const orderedKitIds = [
                      ...(isClearanceLike ? dealEligibleKitIds : (deal.previewKitIds || [])),
                      ...dealEligibleKitIds.filter(id => !(isClearanceLike ? dealEligibleKitIds : (deal.previewKitIds || [])).includes(id))
                    ];
                    const includedKits = getOrderedKits(kits, orderedKitIds);
                    const listedClearancePricing = isClearanceLike
                      ? (isFlexiDeal ? getFlexiBundlePreviewPricing : getClearanceBundlePricing)(
                        includedKits.map(kit => {
                          const stock = getHighestOnhandStock(kit);
                          return {
                            kit,
                            stock,
                            kitId: kit.id,
                            sellPrice: getBundleStandardSellPrice(stock, kit),
                            costPrice: Number(stock.costPrice || 0)
                          };
                        }),
                        dealEligibleKitIds,
                        deal.clearanceDiscounts || {}
                      )
                      : null;
                    const isChecked = selectedDealIds.includes(deal.id);
                    const isExpired = !isMutualDeal && !isClearanceLike
                      && deal.validUntil
                      && parseLocalDateTime(deal.validUntil)
                      && parseLocalDateTime(deal.validUntil) < new Date();
                    const isInactive = deal.isActive === false || (isPerKitClearance && dealEligibleKitIds.every(id => !deal.clearanceKitSchedules?.[id]?.isActive));

                    // Normal bundles are atomic and require every kit. Flexi-
                    // Bundle and CLEARANCE are per-kit entries, so the master
                    // list remains fulfillable while at least one kit can be
                    // sold; unavailable kits are handled individually.
                    const fulfillableKitIds = isClearanceLike
                      ? dealEligibleKitIds
                      : (deal.kitIds || []);
                    const hasFulfillableKit = (kitId) => {
                          const kit = (kits || []).find(k => k.id === kitId);
                          if (!kit) return false;
                          const stocks = Object.values(kit.stocks || {});
                          return stocks.some(s => isBundlePurchasableStock(s, deal.stockSource || 'onhand'));
                    };
                    const isFulfillable = (deal.type === 'bundle_discount' || deal.type === 'bundle_only')
                      ? fulfillableKitIds.every(hasFulfillableKit)
                      : isClearanceLike
                        ? fulfillableKitIds.some(hasFulfillableKit)
                        : true; // mutually_exclusive deals are always considered fulfillable
                    const reactivationSettings = getReactivationSettings(deal);

                    if (isMutualDeal) {
                      const pairRows = getMutuallyExclusivePairRows(deal, kits);
                      const getMutualKitPrice = (kit) => {
                        const stock = getHighestOnhandStock(kit);
                        return {
                          sellPrice: Number(stock?.sellPrice || kit?.sellPrice || 0),
                          costPrice: Number(stock?.costPrice || kit?.costPrice || 0)
                        };
                      };

                      return (
                        <div key={deal.id} className={`rounded-3xl border p-3 text-left transition-all ${activeEditId === deal.id ? 'border-blue-500 bg-blue-500/5' : isChecked ? 'border-blue-400/40 bg-blue-500/5' : 'border-neutral-500/10 bg-[var(--color-surface)]'} ${isInactive ? 'opacity-50' : ''}`}>
                          <div className="mb-3 flex items-center justify-between gap-2 px-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <button type="button" onClick={() => toggleDealSelection(deal.id)} className="shrink-0" aria-label={isChecked ? 'Deselect mutual-exclusive deal' : 'Select mutual-exclusive deal'}>
                                {isChecked
                                  ? <CheckSquare size={15} className="text-blue-500" />
                                  : <Square size={15} className="opacity-30 transition-opacity hover:opacity-60" />}
                              </button>
                              <span className="truncate text-[11px] font-black uppercase tracking-widest text-neutral-900 dark:text-white">BANDAI VS BOOTLEG</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button type="button" onClick={() => handleEditSavedDeal(deal)} className="rounded-full p-2 text-neutral-400 transition-colors hover:bg-blue-500/10 hover:text-blue-500" title="Edit Deal" aria-label="Edit mutual-exclusive deal">
                                <Edit3 size={14} />
                              </button>
                              <button type="button" onClick={() => handleDelete(deal.id)} className="rounded-full p-2 text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-500" title="Delete Deal" aria-label="Delete mutual-exclusive deal">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {pairRows.map((pair, index) => {
                              const pairKits = [
                                includedKits.find(kit => kit.id === pair.bandaiId),
                                includedKits.find(kit => kit.id === pair.bootlegId)
                              ];

                              return (
                                <div key={`mutual-pair-${index}`} className="space-y-2">
                                  <div className="flex items-center justify-between px-1 text-[10px] font-black uppercase tracking-[0.16em] text-neutral-900 dark:text-white">
                                    <span>Pair {index + 1}</span>
                                    <span>Cannot Be Sold Together</span>
                                  </div>
                                  {pairKits.map((kit, kitIndex) => {
                                    const pricing = getMutualKitPrice(kit);
                                    const image = kit ? (resolveImage(kit.image, kit.images) || '/snorlaxgarage.png') : '/snorlaxgarage.png';

                                    return (
                                      <div key={`${deal.id}-pair-${index}-${kitIndex}`} className="flex min-w-0 items-center gap-2 rounded-xl border border-blue-500/35 bg-blue-500/[0.06] px-2 py-2 dark:bg-blue-500/[0.1]">
                                        <img src={image} className="h-8 w-8 shrink-0 rounded-lg bg-white object-cover" alt="" />
                                        <div className="min-w-0 flex-1">
                                          <span className="block truncate text-[12px] font-black uppercase text-neutral-900 dark:text-white">{kit?.name || 'Kit unavailable'}</span>
                                          <span className="block truncate text-[11px] font-bold uppercase text-neutral-900/60 dark:text-white/60">{kit ? [kit.brand, kit.specs?.line, kit.specs?.scale].filter(Boolean).join(' / ') || 'No brand or line' : 'Missing catalog record'}</span>
                                        </div>
                                        {kit ? (
                                          <div className="shrink-0 text-right leading-tight">
                                            <span className="block text-[12px] font-black uppercase text-emerald-500">SELL ₱{pricing.sellPrice.toLocaleString()}</span>
                                            <span className="block text-[11px] font-black uppercase text-neutral-900 dark:text-white">COST ₱{pricing.costPrice.toLocaleString()}</span>
                                          </div>
                                        ) : null}
                                        <span className="shrink-0 px-1 text-neutral-900/50 dark:text-white/50" aria-hidden="true"><X size={12} /></span>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }

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
                              {(deal.type === 'bundle_discount' || deal.type === 'bundle_only' || isClearanceLike) && (
                                <span className="text-[11px] font-black uppercase px-1.5 py-0.5 rounded-full bg-neutral-500/10 text-neutral-400 tracking-wider">
                                  {(deal.stockSource || 'onhand') === 'preorder' ? 'Pre-Order' : 'Onhand'}
                                </span>
                              )}
                              {(deal.type === 'bundle_discount' || deal.type === 'bundle_only') && (
                                <span className={`text-[11px] font-black uppercase px-1.5 py-0.5 rounded-full tracking-wider ${isClearanceLike ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                  {getDealCountdownLabel(deal.validUntil)}
                                </span>
                              )}
                            </div>
                             <h4 className="text-sm font-black uppercase italic tracking-tight mt-2 text-[var(--color-text-main)] leading-none">{isClearanceLike ? `${strategyLabel} Eligible Kits` : isMutualDeal ? 'BANDAI VS BOOTLEG' : deal.name}</h4>
                            {/* Validity dates and automatic reactivation settings */}
                            {!isMutualDeal && !isClearanceLike && (deal.validFrom || deal.validUntil) && (
                              <>
                                <p className="text-[12px] font-bold opacity-40 mt-1.5 flex items-center gap-1">
                                  <Calendar size={9} />
                                  {deal.validFrom ? parseLocalDateTime(deal.validFrom)?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                                  {' → '}
                                  {deal.validUntil ? parseLocalDateTime(deal.validUntil)?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                </p>
                                <p className="text-[10px] font-black uppercase tracking-wider opacity-35 mt-1">
                                  {getBundleValidityDays(deal)} day validity · auto-reactivates after {reactivationSettings.value} {reactivationSettings.unit}
                                </p>
                              </>
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
                        <div className="w-full space-y-3 py-1">
                          {(() => {
                            const renderKitRow = (k) => {
                              if (!k) {
                                return (
                                  <div className="flex min-h-11 items-center justify-center rounded-xl border border-dashed border-red-500/20 bg-red-500/5 px-3 py-2 text-center text-[10px] font-black uppercase tracking-widest text-red-500/60">
                                    Kit unavailable
                                  </div>
                                );
                              }
                            const listedClearanceRow = listedClearancePricing?.rows?.find(row => String(row.kitId) === String(k.id));
                            const clearanceDiscount = isClearanceLike
                              ? Number(listedClearanceRow?.clearanceDiscount ?? 0)
                              : 0;
                              return (
                              <div key={k.id} className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-white/5 bg-black/5 px-3 py-2 dark:bg-white/5">
                              <img src={resolveImage(k.image, k.images)} className="w-7 h-7 rounded-lg object-cover bg-white" alt="" />
                              <div className="min-w-0 flex-1">
                                <span className="block truncate text-[12px] font-black uppercase">{k.name}</span>
                                <span className="block truncate text-[12px] font-bold uppercase opacity-40">{[k.brand, k.specs?.line].filter(Boolean).join(' / ') || 'No brand or line'}</span>
                              </div>
                              {isClearanceLike && (
                                <span className="shrink-0 text-[11px] font-black uppercase tracking-wider text-amber-600">
                                  REQ. {getClearanceRequiredOtherStock(deal, k.id)}
                                </span>
                              )}
                              {isPerKitClearance && getClearanceKitScheduleLabel(deal, k.id) && (
                                <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-red-500">
                                  {getClearanceKitScheduleLabel(deal, k.id)}
                                </span>
                              )}
                              {isClearanceLike && clearanceDiscount > 0 && (
                                <span className="shrink-0 text-[12px] font-black italic text-emerald-500">
                                  ₱{clearanceDiscount.toLocaleString()} OFF
                                </span>
                              )}
                              {isClearanceLike && (
                                <button
                                  type="button"
                                  onClick={() => handleExcludeClearanceKit(deal, k.id)}
                                  className="shrink-0 rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
                                  title="Exclude kit from clearance eligibility"
                                >
                                  <X size={13} />
                                </button>
                              )}
                              </div>
                              );
                            };

                            if (isMutualDeal) {
                              const pairRows = getMutuallyExclusivePairRows(deal, kits);
                              return (
                                <div className="space-y-3">
                                  {pairRows.map((pair, index) => {
                                    const bandaiKit = includedKits.find(kit => kit.id === pair.bandaiId);
                                    const bootlegKit = includedKits.find(kit => kit.id === pair.bootlegId);
                                    return (
                                      <div key={`mutual-pair-${index}`} className="space-y-2">
                                        <div className="px-2 text-[10px] font-black uppercase tracking-[0.2em] opacity-40">
                                          Pair {index + 1}
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                          <div className="min-w-0 space-y-1">
                                            <div className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-red-500">Bandai</div>
                                            {renderKitRow(bandaiKit)}
                                          </div>
                                          <div className="min-w-0 space-y-1">
                                            <div className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-red-500">Bootleg</div>
                                            {renderKitRow(bootlegKit)}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            }

                            return <div className="space-y-2">{includedKits.map(renderKitRow)}</div>;
                          })()}
                        </div>

                        {/* Prices/Conditions */}
                         {!isMutualDeal && !isClearanceLike && <div className="flex justify-between items-center text-[12px] border-t border-neutral-500/10 pt-2 opacity-85">
                           <span className="font-bold opacity-40">₱{(deal.totalSell || 0).toLocaleString()} (Combined Sell)</span>
                           <span className="font-black italic text-emerald-500">₱{(deal.discountAmount || 0).toLocaleString()} Disc</span>
                         </div>}
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
