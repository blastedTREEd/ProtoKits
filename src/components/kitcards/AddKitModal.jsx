import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Box,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Coins,
  Copy,
  Download,
  HandCoins,
  History,
  Image as ImageIcon,
  Loader2,
  PackagePlus,
  Save,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Truck,
  Upload,
  X
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useStore } from '../../store/useStore';
import {
  PRE_ORDER_BOX_CONDITION,
  PRE_ORDER_KIT_CONDITION,
  withStockConditionDefaults
} from '../../utils/stockConditions';

function get12HourTimeParts(date) {
  const hours = date.getHours();
  const hour12 = hours % 12 || 12;
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  return {
    hour: String(hour12).padStart(2, '0'),
    minute: String(date.getMinutes()).padStart(2, '0'),
    meridiem
  };
}

function parse12HourTimeParts(hourInput, minuteInput, meridiem) {
  const hour = Number(hourInput);
  const minute = Number(minuteInput);
  if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { hours: (hour % 12) + (meridiem === 'PM' ? 12 : 0), minutes: minute };
}

const DEFAULT_MASTER = {
  name: '',
  image: '',
  images: [],
  brand: '',
  series: '',
  grade: '',
  ratio: '',
  description: '',
  jpPrice: '',
  phPrice: '',
  boxL: '',
  boxW: '',
  boxH: ''
};

const DEFAULT_STOCK = {
  status: 'Onhand',
  deliveryMonth: '',
  eta: '',
  costPrice: '',
  paidToSupplier: '',
  sellPrice: '',
  minDownpayment: '',
  publicReleaseDate: '',
  boxCondition: '',
  kitCondition: '',
  issueDescription: '',
  stockImages: [],
  isFreeShippingEligible: false,
  freeShippingUntil: '',
  freeShippingMethod: '',
  freeShippingSuboption: ''
};

const STOCK_CONDITIONS = [
  'Pristine / MISB',
  'Dented Box',
  'Opened Box / Sealed Kit',
  'Assembled / Built'
];

const MONTH_CODES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MASTER_IMAGE_TYPES = ['BOX ART', 'PROMO IMAGE'];
const STOCK_IMAGE_TYPES = ['BOX CONDITION', 'KIT CONDITION'];

const textInputClass =
  'w-full rounded-2xl border px-4 py-3 text-xs font-bold outline-none transition-all uppercase';

const numberInputClass = `${textInputClass} appearance-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;

const labelClass =
  'mb-2 block text-[9px] font-black uppercase tracking-[0.2em] opacity-50';

function getLocalDatetime() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function hasStockDetails(stock, masterImage = '') {
  return Boolean(
    stock.deliveryMonth ||
      stock.eta ||
      stock.costPrice ||
      stock.paidToSupplier ||
      stock.sellPrice ||
      (stock.minDownpayment && stock.minDownpayment !== '350') ||
      stock.publicReleaseDate ||
      stock.boxCondition ||
      stock.kitCondition ||
      stock.issueDescription ||
      stock.stockImages?.length ||
      (stock.boxImage && stock.boxImage !== masterImage) ||
      stock.kitImage ||
      stock.isFreeShippingEligible ||
      stock.freeShippingUntil ||
      stock.freeShippingMethod ||
      stock.freeShippingSuboption
  );
}

function resolveImage(idOrUrl, imagesArray) {
  if (!idOrUrl) return '';
  if (idOrUrl.startsWith('data:') || idOrUrl.startsWith('http')) return idOrUrl;
  const match = (imagesArray || []).find(img => img.id === idOrUrl);
  return match?.url || '';
}

function normalizeMasterImages(kit) {
  const existingImages = Array.isArray(kit?.images)
    ? kit.images
        .filter((image) => image?.url)
        .map((image, index) => ({
          id: image.id || `master_${index}`,
          url: image.url,
          type: MASTER_IMAGE_TYPES.includes(image.type) ? image.type : 'PROMO IMAGE',
          isGridImage: Boolean(image.isGridImage || image.url === kit?.image)
        }))
    : [];

  if (existingImages.length > 0) {
    return existingImages.some((image) => image.isGridImage)
      ? existingImages
      : existingImages.map((image, index) => ({ ...image, isGridImage: index === 0 }));
  }

  return kit?.image
    ? [{ id: 'master_legacy', url: kit.image, type: 'BOX ART', isGridImage: true }]
    : [];
}

function normalizeStockImages(stock) {
  const existingImages = Array.isArray(stock?.stockImages)
    ? stock.stockImages
        .filter((image) => image?.url)
        .map((image, index) => ({
          id: image.id || `stock_${index}`,
          url: image.url,
          type: STOCK_IMAGE_TYPES.includes(image.type) ? image.type : 'BOX CONDITION'
        }))
    : [];

  const byUrl = new Set(existingImages.map((image) => image.url));
  const legacyImages = [
    stock?.boxImage && !byUrl.has(stock.boxImage)
      ? { id: 'stock_box_legacy', url: stock.boxImage, type: 'BOX CONDITION' }
      : null,
    stock?.kitImage && !byUrl.has(stock.kitImage)
      ? { id: 'stock_kit_legacy', url: stock.kitImage, type: 'KIT CONDITION' }
      : null
  ].filter(Boolean);

  return [...existingImages, ...legacyImages];
}

function createModalSnapshot(master, stock, mode, selectedId, stockKey) {
  return JSON.stringify({
    master,
    stock,
    mode,
    selectedId,
    stockKey
  });
}

function getColumnIndex(cellRef) {
  const letters = String(cellRef || '').replace(/[0-9]/g, '');
  return letters.split('').reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function normalizeHeader(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function getBatchValue(row, ...headers) {
  const wanted = headers.map(normalizeHeader);
  const match = Object.entries(row).find(([key]) => wanted.includes(normalizeHeader(key)));
  return match ? match[1] : '';
}

async function inflateZipEntry(bytes, method) {
  if (method === 0) return bytes;
  if (method !== 8 || typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot read compressed .xlsx files.');
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Automatically resizes and compresses an image to keep Firestore payload small.
 * Max dimension: 1200px, Quality: 0.7 JPEG
 */
async function compressImage(dataUrl, maxWidth = 1200, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxWidth) {
          width *= maxWidth / height;
          height = maxWidth;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl); // Fallback to original if error
  });
}

async function readZipText(file, entryName) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decoder = new TextDecoder();

  for (let offset = 0; offset < bytes.length - 30;) {
    const signature =
      bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24);
    if (signature !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const method = bytes[offset + 8] | (bytes[offset + 9] << 8);
    const compressedSize =
      bytes[offset + 18] |
      (bytes[offset + 19] << 8) |
      (bytes[offset + 20] << 16) |
      (bytes[offset + 21] << 24);
    const fileNameLength = bytes[offset + 26] | (bytes[offset + 27] << 8);
    const extraLength = bytes[offset + 28] | (bytes[offset + 29] << 8);
    const nameStart = offset + 30;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + fileNameLength));
    const dataStart = nameStart + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;

    if (name === entryName) {
      return decoder.decode(await inflateZipEntry(bytes.slice(dataStart, dataEnd), method));
    }

    offset = dataEnd;
  }

  return '';
}

function getCellText(cell, sharedStrings) {
  const type = cell.getAttribute('t');
  const valueNode = cell.getElementsByTagName('v')[0];
  const inlineNode = cell.getElementsByTagName('t')[0];
  const rawValue = valueNode?.textContent || inlineNode?.textContent || '';
  if (type === 's') return sharedStrings[Number(rawValue)] || '';
  return rawValue;
}

async function parseXlsxRows(file) {
  const sharedXml = await readZipText(file, 'xl/sharedStrings.xml');
  const sheetXml = await readZipText(file, 'xl/worksheets/sheet1.xml');
  if (!sheetXml) throw new Error('No first worksheet found.');

  const parser = new DOMParser();
  const sharedDoc = parser.parseFromString(sharedXml || '<sst />', 'application/xml');
  const sharedStrings = Array.from(sharedDoc.getElementsByTagName('si')).map((item) =>
    Array.from(item.getElementsByTagName('t')).map((node) => node.textContent || '').join('')
  );
  const sheetDoc = parser.parseFromString(sheetXml, 'application/xml');
  const rows = Array.from(sheetDoc.getElementsByTagName('row')).map((rowNode) => {
    const cells = [];
    Array.from(rowNode.getElementsByTagName('c')).forEach((cell) => {
      cells[getColumnIndex(cell.getAttribute('r'))] = getCellText(cell, sharedStrings);
    });
    return cells;
  });

  const headers = rows[0] || [];
  return rows.slice(1).map((row) =>
    headers.reduce((record, header, index) => {
      if (header) record[header] = row[index] || '';
      return record;
    }, {})
  );
}

function normalizeNumber(value) {
  const parsed = parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeRealNumberInput(value) {
  const cleaned = String(value ?? '').replace(/[^0-9.]/g, '');
  const firstDotIndex = cleaned.indexOf('.');

  if (firstDotIndex === -1) return cleaned;

  const integerPart = cleaned.slice(0, firstDotIndex + 1);
  const decimalPart = cleaned.slice(firstDotIndex + 1).replace(/\./g, '');
  return `${integerPart}${decimalPart}`;
}

function createKitTargetId(name, grade = '', ratio = '', brand = '') {
  const parts = [];
  
  const b = (brand || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (b) parts.push(b);
  
  const g = (grade || '').toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
  if (g) parts.push(g);
  
  const r = (ratio || '').toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
  if (r) parts.push(r);
  
  const n = (name || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (n) parts.push(n);
  
  return parts.join('_');
}

function createDuplicateKitId(master, existingKits = []) {
  const parts = [
    master?.grade,
    master?.ratio,
    master?.series,
    master?.name
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .map((value) => value.replace(/\//g, '-').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
    .filter(Boolean);

  const baseId = parts.join('_') || `kit-duplicate-${Date.now()}`;
  if (!existingKits.some((kit) => kit?.id === baseId)) return baseId;

  return `${baseId}_copy_${Date.now()}`;
}

function getEtaSortValue(eta) {
  if (!eta) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(`${eta} 1`);
  if (Number.isNaN(parsed)) return Number.MAX_SAFE_INTEGER - 1;
  return parsed;
}

function formatEtaFromMonthCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  const cleaned = normalized.replace(/[^A-Z]/g, '').slice(0, 3);
  if (!cleaned) return '';

  const matchedMonth = MONTH_CODES.find((code) => code.startsWith(cleaned));
  if (!matchedMonth) return cleaned;
  if (cleaned.length < 3) return cleaned;

  const now = new Date();
  const currentMonthIndex = now.getMonth();
  const currentYear = now.getFullYear();
  const targetMonthIndex = MONTH_CODES.indexOf(matchedMonth);
  const suppliedYear = normalized.match(/\b(20\d{2})\b/)?.[1];
  const targetYear = suppliedYear
    ? Number(suppliedYear)
    : (targetMonthIndex < currentMonthIndex ? currentYear + 1 : currentYear);

  return `${matchedMonth} ${targetYear}`;
}

function shiftMonthLabel(value, offset) {
  const normalized = formatEtaFromMonthCode(value);
  if (!normalized) return '';

  const parsed = Date.parse(`${normalized} 1`);
  if (Number.isNaN(parsed)) return '';

  const shifted = new Date(parsed);
  shifted.setMonth(shifted.getMonth() + offset);
  return `${MONTH_CODES[shifted.getMonth()]} ${shifted.getFullYear()}`;
}

function getEtaFromDeliveryMonth(value) {
  return shiftMonthLabel(value, 1);
}

function getDeliveryMonthFromEta(value) {
  return shiftMonthLabel(value, -1);
}

function normalizeStockStatus(status) {
  const value = (status || '').toLowerCase().replace(/[\s_]+/g, '-');
  if (value === 'pre-order' || value === 'preorder' || value === 'batch') return 'Pre-Order';
  return 'Onhand';
}

function extractLegacyConditions(stock) {
  if (Array.isArray(stock?.condition)) {
    return {
      boxCondition: stock.condition[0] || '',
      kitCondition: stock.condition[1] || ''
    };
  }

  if (typeof stock?.condition === 'string') {
    return {
      boxCondition: stock.condition,
      kitCondition: ''
    };
  }

  return {
    boxCondition: '',
    kitCondition: ''
  };
}

function normalizeConditionSuggestion(value) {
  return (value || '').trim().toUpperCase();
}

function parseMasterSearchQuery(query) {
  const filters = { box: [], kit: [] };
  const conditionPattern = /(?:^|\s)(box|kit)\s*:\s*(.*?)(?=\s+(?:box|kit)\s*:|$)/gi;
  let match;

  while ((match = conditionPattern.exec(query)) !== null) {
    const type = match[1].toLowerCase();
    const value = normalizeConditionSuggestion(match[2]);
    if (value) filters[type].push(value);
  }

  return {
    text: query.replace(conditionPattern, ' ').replace(/\s+/g, ' ').trim().toLowerCase(),
    filters
  };
}

function stockMatchesConditionFilters(stock, filters) {
  const legacy = extractLegacyConditions(stock);
  const conditions = {
    box: normalizeConditionSuggestion(stock?.boxCondition || legacy.boxCondition),
    kit: normalizeConditionSuggestion(stock?.kitCondition || legacy.kitCondition)
  };

  return Object.entries(filters).every(([type, values]) => (
    values.every((value) => conditions[type].includes(value))
  ));
}

function escapeExcelXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function createExcelXml(columns, rows) {
  const cell = (value, isHeader = false) => {
    const isNumber = !isHeader && value !== '' && Number.isFinite(Number(value));
    const type = isNumber ? 'Number' : 'String';
    const style = isHeader ? ' ss:StyleID="Header"' : '';
    return `<Cell${style}><Data ss:Type="${type}">${escapeExcelXml(value)}</Data></Cell>`;
  };

  const headerRow = `<Row>${columns.map(([label]) => cell(label, true)).join('')}</Row>`;
  const dataRows = rows.map((row) => (
    `<Row>${columns.map(([, getValue]) => cell(getValue(row))).join('')}</Row>`
  )).join('');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1" />
      <Interior ss:Color="#D9E8FF" ss:Pattern="Solid" />
    </Style>
  </Styles>
  <Worksheet ss:Name="Master List">
    <Table>
      ${headerRow}
      ${dataRows}
    </Table>
  </Worksheet>
</Workbook>`;
}

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

export function CustomDateTimePicker({
  value,
  onChange,
  min,
  disabled = false,
  isDarkMode,
  placeholder,
  allowClear = true,
  renderInline = false,
  align = 'left'
}) {
  const pickerRef = useRef(null);
  const triggerRef = useRef(null);
  const minDate = useMemo(() => parseLocalDateTime(min), [min]);
  const selectedDate = useMemo(() => parseLocalDateTime(value), [value]);
  const [isOpen, setIsOpen] = useState(false);
  
  // Use useMemo for initial state logic rather than syncing state in useEffect
  const initialDate = useMemo(() => selectedDate || minDate || new Date(), [selectedDate, minDate]);
  
  const [draftDate, setDraftDate] = useState(initialDate);
  const [viewDate, setViewDate] = useState(initialDate);
  const initialTimeParts = useMemo(() => get12HourTimeParts(initialDate), [initialDate]);
  const [hourInput, setHourInput] = useState(() => initialTimeParts.hour);
  const [minuteInput, setMinuteInput] = useState(() => initialTimeParts.minute);
  const [meridiem, setMeridiem] = useState(() => initialTimeParts.meridiem);

  // Update states when dependencies change, but avoiding direct setState in a side effect
  useEffect(() => {
    setDraftDate(initialDate);
    setViewDate(initialDate);
    const nextTimeParts = get12HourTimeParts(initialDate);
    setHourInput(nextTimeParts.hour);
    setMinuteInput(nextTimeParts.minute);
    setMeridiem(nextTimeParts.meridiem);
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
    const nextDate = minDate && date.getTime() < minDate.getTime() ? minDate : date;
    setDraftDate(nextDate);
    const nextTimeParts = get12HourTimeParts(nextDate);
    setHourInput(nextTimeParts.hour);
    setMinuteInput(nextTimeParts.minute);
    setMeridiem(nextTimeParts.meridiem);
    onChange(formatLocalDateTimeValue(nextDate));
  };

  const syncTimeInputs = (date) => {
    const nextTimeParts = get12HourTimeParts(date);
    setHourInput(nextTimeParts.hour);
    setMinuteInput(nextTimeParts.minute);
    setMeridiem(nextTimeParts.meridiem);
  };

  const commitTimeInputs = (nextMeridiem = meridiem) => {
    const parsed = parse12HourTimeParts(hourInput, minuteInput, nextMeridiem);
    if (!parsed) {
      syncTimeInputs(draftDate);
      return;
    }
    const nextDate = new Date(draftDate);
    nextDate.setHours(parsed.hours, parsed.minutes, 0, 0);
    setDraftDate(nextDate);
    applyDraft(nextDate);
  };

  const toggleMeridiem = () => {
    const nextMeridiem = meridiem === 'AM' ? 'PM' : 'AM';
    setMeridiem(nextMeridiem);
    commitTimeInputs(nextMeridiem);
  };

  const selectDay = (dayDate) => {
    if (!dayDate) return;
    const nextDate = new Date(dayDate);
    nextDate.setHours(draftDate.getHours(), draftDate.getMinutes(), 0, 0);
    if (minDate && nextDate.getTime() < minDate.getTime()) return;
    setDraftDate(nextDate);
    syncTimeInputs(nextDate);
    applyDraft(nextDate);
  };

  const isBeforeMinDay = (dayDate) => {
    if (!dayDate || !minDate) return false;
    const compareDate = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate()).getTime();
    const minCompareDate = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()).getTime();
    return compareDate < minCompareDate;
  };

  const shellClass = isDarkMode
    ? 'bg-white/5 border-white/10 text-white'
    : 'bg-neutral-50 border-black/10 text-neutral-900';
  const popoverClass = isDarkMode
    ? 'bg-[#111214] border-white/10 text-white'
    : 'bg-white border-black/10 text-neutral-900';
  const pickerPanel = (
    <div
      data-date-time-picker-panel="true"
      className={`${
        renderInline
          ? `absolute top-full mt-2 z-[120] w-[320px] ${align === 'right' ? 'right-0' : 'left-0'}`
          : 'fixed z-[700] w-[320px]'
      } rounded-[1.5rem] border p-4 shadow-2xl ${popoverClass}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
          className="rounded-xl border border-white/10 p-2 transition-all hover:bg-white/5"
        >
          <ChevronLeft size={14} />
        </button>
        <p className="text-[11px] font-black uppercase tracking-[0.2em]">
          {viewDate.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}
        </p>
        <button
          type="button"
          onClick={() => setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
          className="rounded-xl border border-white/10 p-2 transition-all hover:bg-white/5"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[9px] font-black uppercase tracking-widest opacity-45">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {monthCells.map((dayDate, index) => {
          const isSelected =
            dayDate &&
            draftDate.getFullYear() === dayDate.getFullYear() &&
            draftDate.getMonth() === dayDate.getMonth() &&
            draftDate.getDate() === dayDate.getDate();
          const isBlocked = isBeforeMinDay(dayDate);

          return (
            <button
              key={`${dayDate ? dayDate.toISOString() : 'empty'}-${index}`}
              type="button"
              onClick={() => selectDay(dayDate)}
              disabled={!dayDate || isBlocked}
              className={`h-10 rounded-xl text-[11px] font-black transition-all ${
                !dayDate
                  ? 'cursor-default opacity-0'
                  : isSelected
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : isBlocked
                      ? 'cursor-not-allowed opacity-25'
                      : 'hover:bg-blue-600/10'
              }`}
            >
              {dayDate?.getDate() || '.'}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <div className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest opacity-70">
          Time (12-hour)
          <div className={`flex items-center gap-1 rounded-xl border px-2 py-1 ${shellClass}`}>
            <input
              type="text"
              inputMode="numeric"
              value={hourInput}
              onChange={(event) => setHourInput(event.target.value.replace(/\D/g, '').slice(0, 2))}
              onBlur={() => commitTimeInputs()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitTimeInputs();
                }
              }}
              placeholder="HH"
              maxLength={2}
              className="w-10 bg-transparent px-1 py-1 text-center text-xs font-black outline-none"
              aria-label="Hour in 12-hour format"
            />
            <span>:</span>
            <input
              type="text"
              inputMode="numeric"
              value={minuteInput}
              onChange={(event) => setMinuteInput(event.target.value.replace(/\D/g, '').slice(0, 2))}
              onBlur={() => commitTimeInputs()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitTimeInputs();
                }
              }}
              placeholder="MM"
              maxLength={2}
              className="w-10 bg-transparent px-1 py-1 text-center text-xs font-black outline-none"
              aria-label="Minute in 12-hour format"
            />
            <button
              type="button"
              onClick={toggleMeridiem}
              className="ml-auto rounded-lg bg-blue-600 px-2 py-1 text-[10px] font-black text-white transition-colors hover:bg-blue-700"
              aria-label={`Switch to ${meridiem === 'AM' ? 'PM' : 'AM'}`}
            >
              {meridiem}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {allowClear && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setIsOpen(false);
            }}
            className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest opacity-70 transition-all hover:bg-white/5"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="flex-1 rounded-xl bg-blue-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20"
        >
          Done
        </button>
      </div>
    </div>
  );

  return (
    <div ref={pickerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-xs font-bold transition-all ${
          disabled ? 'cursor-not-allowed opacity-50' : ''
        } ${shellClass}`}
      >
        <span className={value ? '' : 'opacity-45'}>
          {value
            ? parseLocalDateTime(value)?.toLocaleString('en-GB', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })
            : placeholder}
        </span>
        <span className="flex items-center gap-2">
          <Clock3 size={14} className="opacity-50" />
          <Calendar size={14} className="opacity-70" />
        </span>
      </button>

      {isOpen && !disabled && (
        pickerPanel
      )}
    </div>
  );
}

export default function AddKitModal({ isOpen, onClose, onSave, editingKit = null }) {
  const { isDarkMode } = useTheme();
  const { kits, deleteStock, deleteKit, shippingSettings } = useStore();
  const shippingMethods = shippingSettings?.shippingMethods || {};
  const [isSaving, setIsSaving] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedKitId, setSelectedKitId] = useState('');
  const [editingStockKey, setEditingStockKey] = useState('');
  const [stockMode, setStockMode] = useState('new');
  const [masterForm, setMasterForm] = useState(DEFAULT_MASTER);
  const [stockForm, setStockForm] = useState(DEFAULT_STOCK);
  const [previewAsset, setPreviewAsset] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [batchPreviewRows, setBatchPreviewRows] = useState([]);
  const [batchFileName, setBatchFileName] = useState('');
  const [isMasterListView, setIsMasterListView] = useState(false);
  const [returnToMasterListOnSave, setReturnToMasterListOnSave] = useState(false);
  const [masterSearchQuery, setMasterSearchQuery] = useState('');
  const [selectedMasterIds, setSelectedMasterIds] = useState([]);
  const [bulkUpdateParam, setBulkUpdateParam] = useState('brand');
  const [bulkUpdateValue, setBulkUpdateValue] = useState('');
  const [recentEdits, setRecentEdits] = useState(() => {
    try {
      const saved = localStorage.getItem('sg_recent_kit_edits');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const masterImageRef = useRef(null);
  const stockImageRef = useRef(null);
  const batchUploadRef = useRef(null);

  const handleBulkUpdate = async () => {
    if (selectedMasterIds.length === 0 || !bulkUpdateValue.trim()) return;
    
    if (window.confirm(`Bulk update ${selectedMasterIds.length} kits: set ${bulkUpdateParam} to "${bulkUpdateValue.toUpperCase()}"?`)) {
      try {
        setIsSaving(true);
        for (const id of selectedMasterIds) {
          const kit = kits.find(k => k.id === id);
          if (!kit) continue;

          const updatedKit = {
            ...kit,
            [bulkUpdateParam === 'line' || bulkUpdateParam === 'scale' ? 'specs' : bulkUpdateParam]: 
              bulkUpdateParam === 'line' 
                ? { ...kit.specs, line: bulkUpdateValue.toUpperCase() }
                : bulkUpdateParam === 'scale'
                ? { ...kit.specs, scale: bulkUpdateValue.toUpperCase() }
                : bulkUpdateValue.toUpperCase()
          };

          await onSave(updatedKit);
        }
        alert('Bulk update successful.');
        setBulkUpdateValue('');
        setSelectedMasterIds([]);
      } catch (error) {
        console.error(error);
        alert('Failed to update some kits.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const selectedExistingKit = useMemo(() => {
    if (editingKit?.id) return editingKit;
    return (kits || []).find((kit) => kit.id === selectedKitId) || null;
  }, [editingKit, kits, selectedKitId]);

  const filteredKits = useMemo(() => {
    const query = (masterForm.name || '').trim().toLowerCase();
    
    // If query is empty, show recent edits (ordered by most recent)
    if (!query) {
      return recentEdits
        .map(id => (kits || []).find(k => k.id === id))
        .filter(Boolean)
        .slice(0, 6);
    }

    if (query.length < 2) return [];
    return (kits || [])
      .filter((kit) => {
        const haystack = [
          kit.name,
          kit.series,
          kit.brand,
          kit.specs?.line,
          kit.specs?.scale
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 8);
  }, [kits, masterForm.name, recentEdits]);

  const stockHistory = useMemo(() => {
    const stocks = selectedExistingKit?.stocks || {};
    return Object.entries(stocks)
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => {
        const aOnhand = a.status?.toLowerCase() === 'onhand';
        const bOnhand = b.status?.toLowerCase() === 'onhand';

        if (aOnhand && !bOnhand) return -1;
        if (!aOnhand && bOnhand) return 1;

        const etaDiff = getEtaSortValue(a.eta) - getEtaSortValue(b.eta);
        if (etaDiff !== 0) return etaDiff;

        return Number(b.timestamp || 0) - Number(a.timestamp || 0);
      });
  }, [selectedExistingKit]);

  const { box: boxConditionSuggestions, kit: kitConditionSuggestions } = useMemo(() => {
    const boxValues = new Set();
    const kitValues = new Set();

    (kits || []).forEach((kit) => {
      Object.values(kit?.stocks || {}).forEach((stock) => {
        const legacy = extractLegacyConditions(stock);
        [stock?.boxCondition, legacy.boxCondition]
          .map(normalizeConditionSuggestion)
          .filter(Boolean)
          .forEach((value) => boxValues.add(value));
        [stock?.kitCondition, legacy.kitCondition]
          .map(normalizeConditionSuggestion)
          .filter(Boolean)
          .forEach((value) => kitValues.add(value));
      });
    });

    return {
      box: Array.from(boxValues).sort((a, b) => a.localeCompare(b)),
      kit: Array.from(kitValues).sort((a, b) => a.localeCompare(b)),
    };
  }, [kits]);

  const masterSuggestions = useMemo(() => {
    const l = new Set();
    const w = new Set();
    const h = new Set();
    const brand = new Set();
    const series = new Set();
    const grade = new Set();
    const ratio = new Set();
    const sets = [];

    (kits || []).forEach((kit) => {
      const d = kit.dimensions;
      if (d && (d.l || d.w || d.h)) {
        if (d.l) l.add(String(d.l));
        if (d.w) w.add(String(d.w));
        if (d.h) h.add(String(d.h));
        sets.push({ l: d.l || 0, w: d.w || 0, h: d.h || 0 });
      }
      if (kit.brand) brand.add(kit.brand.toUpperCase());
      if (kit.series) series.add(kit.series.toUpperCase());
      if (kit.specs?.line) grade.add(kit.specs.line.toUpperCase());
      if (kit.specs?.scale) ratio.add(kit.specs.scale.toUpperCase());
    });

    const sortAlpha = (set) => Array.from(set).sort((a, b) => a.localeCompare(b));

    return {
      l: Array.from(l).sort((a, b) => Number(a) - Number(b)),
      w: Array.from(w).sort((a, b) => Number(a) - Number(b)),
      h: Array.from(h).sort((a, b) => Number(a) - Number(b)),
      brand: sortAlpha(brand),
      series: sortAlpha(series),
      grade: sortAlpha(grade),
      ratio: sortAlpha(ratio),
      sets
    };
  }, [kits]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const stateKey = `add-kit-modal-${Date.now()}`;
    window.history.pushState({ modalKey: stateKey }, '');

    const handlePopState = () => {
      handleClose();
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
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

  useEffect(() => {
    if (!isOpen) {
      setIsSaving(false);
      setShowSearchResults(false);
      setSelectedKitId('');
      setEditingStockKey('');
      setStockMode('new');
      setMasterForm(DEFAULT_MASTER);
      setStockForm({ ...DEFAULT_STOCK, publicReleaseDate: '' });
      setPreviewAsset(null);
      setSavedSnapshot('');
      setBatchPreviewRows([]);
      setBatchFileName('');
      setIsMasterListView(false);
      setReturnToMasterListOnSave(false);
      return;
    }

    const sourceKit = editingKit || null;
    if (sourceKit) {
      const nextMaster = {
        name: sourceKit.name || '',
        image: sourceKit.image || '',
        images: normalizeMasterImages(sourceKit),
        brand: sourceKit.brand || 'BANDAI',
        series: sourceKit.series || '',
        grade: sourceKit.specs?.line || '',
        ratio: sourceKit.specs?.scale || '',
        description: sourceKit.description || '',
        jpPrice: sourceKit.jpPrice ?? '',
        phPrice: sourceKit.phPrice ?? '',
        boxL: sourceKit.dimensions?.l ?? '',
        boxW: sourceKit.dimensions?.w ?? '',
        boxH: sourceKit.dimensions?.h ?? ''
      };
      const nextStock = {
        ...DEFAULT_STOCK,
        publicReleaseDate: '',
        boxImage: sourceKit?.image || '',
        kitImage: '',
        stockImages: []
      };
      setSelectedKitId(sourceKit.id || '');
      setEditingStockKey('');
      setStockMode('idle');
      setMasterForm(nextMaster);
      setStockForm(nextStock);
      setSavedSnapshot(createModalSnapshot(nextMaster, nextStock, 'idle', sourceKit.id || '', ''));
    } else {
      const nextStock = { ...DEFAULT_STOCK, publicReleaseDate: '', boxImage: '', kitImage: '', stockImages: [] };
      setStockMode('new');
      setMasterForm(DEFAULT_MASTER);
      setStockForm(nextStock);
      setSavedSnapshot(createModalSnapshot(DEFAULT_MASTER, nextStock, 'new', '', ''));
    }
  }, [isOpen, editingKit]);

  const updateMaster = (field, value) => {
    setMasterForm((prev) => {
      if (field === 'name') {
        setShowSearchResults(true);
      }
      return { ...prev, [field]: value };
    });
  };

  const handleDeleteKit = async () => {
    if (!selectedKitId) return;
    const kit = kits.find(k => k.id === selectedKitId);
    if (!kit) return;

    if (window.confirm(`Permanently delete master kit "${kit.name}" and ALL its stock variants? This cannot be undone.`)) {
      try {
        setIsSaving(true);
        await deleteKit(selectedKitId);
        resetToNewKit();
      } catch (error) {
        console.error(error);
        alert('Failed to delete kit.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const scrollToFirstError = () => {
    const firstInvalidRow = batchPreviewRows.find(row => validateBatchPreviewRow(row).length > 0);
    if (firstInvalidRow) {
      const element = document.getElementById(`batch-row-${firstInvalidRow.id}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('animate-pulse', 'bg-red-500/20');
        setTimeout(() => element.classList.remove('animate-pulse', 'bg-red-500/20'), 2000);
      }
    }
  };

  const updateMasterNumber = (field, value) => {
    const sanitizedValue = sanitizeRealNumberInput(value);
    setMasterForm((prev) => {
      const next = { ...prev, [field]: sanitizedValue };

      // Smart autofill for dimensions
      if (['boxL', 'boxW', 'boxH'].includes(field) && sanitizedValue) {
        const valNum = parseFloat(sanitizedValue);
        const dimensionKeys = { boxL: 'l', boxW: 'w', boxH: 'h' };
        const otherFields = {
          boxL: ['boxW', 'boxH'],
          boxW: ['boxL', 'boxH'],
          boxH: ['boxL', 'boxW']
        }[field];

        const areOthersEmpty = otherFields.every((f) => !prev[f] || prev[f] === '0' || prev[f] === '');

        if (areOthersEmpty) {
          const match = masterSuggestions.sets.find((s) => s[dimensionKeys[field]] === valNum);
          if (match) {
            if (field === 'boxL') {
              next.boxW = String(match.w);
              next.boxH = String(match.h);
            } else if (field === 'boxW') {
              next.boxL = String(match.l);
              next.boxH = String(match.h);
            } else if (field === 'boxH') {
              next.boxL = String(match.l);
              next.boxW = String(match.w);
            }
          }
        }
      }

      return next;
    });
  };

  const updateStock = (field, value) => {
    setStockForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateStockNumber = (field, value) => {
    setStockForm((prev) => ({ ...prev, [field]: sanitizeRealNumberInput(value) }));
  };

  const updateStockCondition = (field, value) => {
    setStockForm((prev) => withStockConditionDefaults({
      ...prev,
      [field]: value
    }));
  };

  const handleDuplicateMaster = async () => {
    if (!selectedExistingKit || isEditingExistingStock) return;

    const duplicateId = createDuplicateKitId(masterForm, kits);
    const duplicatePayload = {
      targetId: duplicateId,
      name: masterForm.name.trim().toUpperCase(),
      image: masterForm.image.trim(),
      images: (masterForm.images || []).map((image) => ({
        id: image.id,
        url: image.url,
        type: image.type || 'PROMO IMAGE',
        isGridImage: image.id === masterForm.image || Boolean(image.isGridImage)
      })),
      series: masterForm.series.trim().toUpperCase(),
      specs: {
        line: masterForm.grade.trim().toUpperCase(),
        scale: masterForm.ratio.trim()
      },
      description: '',
      jpPrice: 0,
      phPrice: 0,
      dimensions: { l: 0, w: 0, h: 0 },
      updateMasterOnly: true
    };

    if (!duplicatePayload.name || !duplicatePayload.image) {
      alert('The kit name and master image are required before duplicating.');
      return;
    }

    if (!window.confirm(`Create a duplicate master for "${duplicatePayload.name}" without brand or stocks?`)) return;

    try {
      setIsSaving(true);
      const result = await onSave(duplicatePayload);
      const finalKitId = result?.id || duplicateId;
      setRecentEdits((prev) => {
        const next = [finalKitId, ...prev.filter((id) => id !== finalKitId)].slice(0, 6);
        localStorage.setItem('sg_recent_kit_edits', JSON.stringify(next));
        return next;
      });
      onClose();
    } catch (error) {
      console.error(error);
      alert('Failed to duplicate kit master.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = (status) => {
    const normalizedStatus = normalizeStockStatus(status);
    setStockForm((prev) => withStockConditionDefaults({
      ...prev,
      status: normalizedStatus,
      deliveryMonth: normalizedStatus === 'Onhand' ? '' : prev.deliveryMonth,
      eta: normalizedStatus === 'Onhand' ? '' : prev.eta,
      paidToSupplier: normalizedStatus === 'Onhand' ? prev.costPrice : prev.paidToSupplier,
      isFreeShippingEligible: normalizedStatus === 'Onhand' ? false : prev.isFreeShippingEligible,
      freeShippingUntil: normalizedStatus === 'Onhand' ? '' : prev.freeShippingUntil,
      freeShippingMethod: normalizedStatus === 'Onhand' ? 'All' : prev.freeShippingMethod,
      freeShippingSuboption: normalizedStatus === 'Onhand' ? 'All' : prev.freeShippingSuboption,
      ...(normalizedStatus === 'Pre-Order'
        ? { boxCondition: PRE_ORDER_BOX_CONDITION, kitCondition: PRE_ORDER_KIT_CONDITION }
        : {})
    }));
  };

  const handleDeliveryMonthChange = (value) => {
    updateStock('deliveryMonth', value);
  };

  const handleDeliveryMonthBlur = () => {
    setStockForm((prev) => ({
      ...prev,
      deliveryMonth: prev.deliveryMonth ? formatEtaFromMonthCode(prev.deliveryMonth) : ''
    }));
  };

  const handleCostPriceChange = (value) => {
    const sanitizedValue = sanitizeRealNumberInput(value);
    setStockForm((prev) => ({
      ...prev,
      costPrice: sanitizedValue,
      paidToSupplier: prev.status === 'Onhand' ? sanitizedValue : prev.paidToSupplier
    }));
  };

  const handleSellPriceChange = (value) => {
    const sanitizedValue = sanitizeRealNumberInput(value);
    setStockForm((prev) => {
      const next = { ...prev, sellPrice: sanitizedValue };
      // Autofill DP with 350 if sellPrice is set, otherwise clear DP if sellPrice is empty
      if (sanitizedValue) {
        if (!prev.minDownpayment) {
          next.minDownpayment = '350';
        }
      } else {
        next.minDownpayment = '';
      }
      return next;
    });
  };

  const applyKitToForm = (kit) => {
    const nextMaster = {
      name: kit.name || '',
      image: kit.image || '',
      images: normalizeMasterImages(kit),
      brand: kit.brand || 'BANDAI',
      series: kit.series || '',
      grade: kit.specs?.line || '',
      ratio: kit.specs?.scale || '',
      description: kit.description || '',
      jpPrice: kit.jpPrice ?? '',
      phPrice: kit.phPrice ?? '',
      boxL: kit.dimensions?.l ?? '',
      boxW: kit.dimensions?.w ?? '',
      boxH: kit.dimensions?.h ?? ''
    };
    const nextStock = {
      ...DEFAULT_STOCK,
      publicReleaseDate: stockForm.publicReleaseDate || '',
      boxImage: kit.image || '',
      kitImage: '',
      stockImages: []
    };
    setSelectedKitId(kit.id || '');
    setReturnToMasterListOnSave(false);
    setEditingStockKey('');
    setStockMode('idle');
    setShowSearchResults(false);
    setMasterForm(nextMaster);
    setStockForm(nextStock);
    setSavedSnapshot(createModalSnapshot(nextMaster, nextStock, 'idle', kit.id || '', ''));
  };

  const resetToNewKit = () => {
    setSelectedKitId('');
    setEditingStockKey('');
    setStockMode('new');
    setShowSearchResults(false);
    setMasterForm(DEFAULT_MASTER);
    const nextStock = { ...DEFAULT_STOCK, publicReleaseDate: '' };
    setStockForm(nextStock);
    setPreviewAsset(null);
    setSavedSnapshot(createModalSnapshot(DEFAULT_MASTER, nextStock, 'new', '', ''));
  };

  const startNewStockEntry = () => {
    // Smart ETA pre-fill: Find the latest ETA from existing pre-order stocks
    let latestEta = '';
    if (selectedExistingKit?.stocks) {
      const preOrderStocks = Object.values(selectedExistingKit.stocks).filter(
        (s) => normalizeStockStatus(s.status) === 'Pre-Order' && s.eta
      );

      if (preOrderStocks.length > 0) {
        // Sort by ETA value and take the highest (furthest in future)
        const sorted = preOrderStocks.sort((a, b) => getEtaSortValue(b.eta) - getEtaSortValue(a.eta));
        // Note: getEtaSortValue returns MAX_SAFE_INTEGER for empty strings, but we filtered those out.
        // If some are invalid (MAX_SAFE_INTEGER - 1), they will be at the top.
        latestEta = sorted[0].eta;
      }
    }

    setEditingStockKey('');
    setStockMode('new');
    setStockForm(withStockConditionDefaults({
      ...DEFAULT_STOCK,
      status: latestEta ? 'Pre-Order' : 'Onhand',
      deliveryMonth: latestEta ? getDeliveryMonthFromEta(latestEta) : '',
      eta: latestEta,
      publicReleaseDate: '',
      boxImage: masterForm.image || '',
      kitImage: '',
      stockImages: []
    }));
  };

  const handleEditStock = (stockItem) => {
    const normalizedStatus = normalizeStockStatus(stockItem.status);
    const legacyConditions = extractLegacyConditions(stockItem);
    setEditingStockKey(stockItem.key || '');
    setStockMode('edit');
    setStockForm(withStockConditionDefaults({
      status: normalizedStatus,
      deliveryMonth: stockItem.deliveryMonth || getDeliveryMonthFromEta(stockItem.eta),
      eta: stockItem.eta || '',
      costPrice: stockItem.costPrice ?? '',
      paidToSupplier:
        normalizedStatus === 'Onhand'
          ? stockItem.costPrice ?? ''
          : stockItem.paidToSupplier ?? '',
      sellPrice: stockItem.sellPrice ?? '',
      minDownpayment: stockItem.minDownpayment ?? '',
      publicReleaseDate: stockItem.publicReleaseDate || '',
      boxCondition: stockItem.boxCondition || legacyConditions.boxCondition,
      kitCondition: stockItem.kitCondition || legacyConditions.kitCondition,
      issueDescription: stockItem.issueDescription || '',
      stockImages: normalizeStockImages(stockItem),
      boxImage: stockItem.boxImage || '',
      kitImage: stockItem.kitImage || '',
      isFreeShippingEligible: Boolean(stockItem.isFreeShippingEligible),
      freeShippingUntil: stockItem.freeShippingUntil || '',
      freeShippingMethod: stockItem.freeShippingMethod || 'All',
      freeShippingSuboption: stockItem.freeShippingSuboption || 'All'
    }));
  };

  const cancelEditStock = () => {
    setEditingStockKey('');
    setStockMode('idle');
    setStockForm((prev) => ({
      ...DEFAULT_STOCK,
      publicReleaseDate: prev.publicReleaseDate || '',
      boxImage: masterForm.image || '',
      kitImage: '',
      stockImages: []
    }));
  };

  const handleDuplicateStock = (stockItem) => {
    const normalizedStatus = normalizeStockStatus(stockItem.status);
    const legacyConditions = extractLegacyConditions(stockItem);
    setEditingStockKey('');
    setStockMode('new');
    setStockForm(withStockConditionDefaults({
      status: normalizedStatus,
      deliveryMonth: stockItem.deliveryMonth || getDeliveryMonthFromEta(stockItem.eta),
      eta: stockItem.eta || '',
      costPrice: stockItem.costPrice ?? '',
      paidToSupplier:
        normalizedStatus === 'Onhand'
          ? stockItem.costPrice ?? ''
          : stockItem.paidToSupplier ?? '',
      sellPrice: stockItem.sellPrice ?? '',
      minDownpayment: stockItem.minDownpayment ?? '',
      publicReleaseDate: stockItem.publicReleaseDate || '',
      boxCondition: stockItem.boxCondition || legacyConditions.boxCondition,
      kitCondition: stockItem.kitCondition || legacyConditions.kitCondition,
      issueDescription: stockItem.issueDescription || '',
      productImage: stockItem.productImage || stockItem.image || '',
      boxImage: stockItem.boxImage || '',
      kitImage: stockItem.kitImage || '',
      stockImages: normalizeStockImages(stockItem),
      isFreeShippingEligible: Boolean(stockItem.isFreeShippingEligible),
      freeShippingUntil: stockItem.freeShippingUntil || '',
      freeShippingMethod: stockItem.freeShippingMethod || 'All',
      freeShippingSuboption: stockItem.freeShippingSuboption || 'All'
    }));
  };

  const onDeleteStock = async (stockItem) => {
    if (!selectedKitId || !stockItem.key) return;
    if (window.confirm(`Delete this stock entry (${stockItem.status} ${stockItem.eta || ''})?`)) {
      try {
        await deleteStock(selectedKitId, stockItem.key);
        if (editingStockKey === stockItem.key) {
          cancelEditStock();
        }
      } catch (error) {
        console.error(error);
        alert('Failed to delete stock entry.');
      }
    }
  };

  const handleFileSelect = (event, field) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const invalidFile = files.find((file) => !file.type.startsWith('image/'));
    if (invalidFile) {
      alert('Please upload image files only.');
      event.target.value = '';
      return;
    }

    Promise.all(
      files.map(
        (file, index) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = async () => {
              // Automatically compress the image before saving
              const compressedUrl = await compressImage(reader.result);
              resolve({
                id: `${field}_${Date.now()}_${index}`,
                url: compressedUrl
              });
            };
            reader.readAsDataURL(file);
          })
      )
    ).then((assets) => {
      const validAssets = assets.filter((asset) => asset.url);
      if (validAssets.length === 0) return;

      if (field === 'image') {
        setMasterForm((prev) => {
          const hasGridImage = prev.images?.some((image) => image.isGridImage) || Boolean(prev.image);
          const nextImages = [
            ...(prev.images || []),
            ...validAssets.map((asset, index) => ({
              ...asset,
              type: 'PROMO IMAGE',
              isGridImage: !hasGridImage && index === 0
            }))
          ];
          const gridImageObj = nextImages.find((image) => image.isGridImage) || nextImages[0];
          const gridImage = gridImageObj ? gridImageObj.id : '';
          return { ...prev, image: gridImage, images: nextImages };
        });
      }

      if (field === 'stockImage') {
        setStockForm((prev) => {
          const nextImages = [
            ...(prev.stockImages || []),
            ...validAssets.map((asset) => ({ ...asset, type: 'BOX CONDITION' }))
          ];
          const boxImage = nextImages.find((image) => image.type === 'BOX CONDITION')?.id || '';
          const kitImage = nextImages.find((image) => image.type === 'KIT CONDITION')?.id || '';
          return { ...prev, stockImages: nextImages, boxImage, kitImage };
        });
      }
    });

    event.target.value = '';
  };

  const updateMasterImageType = (imageId, type) => {
    setMasterForm((prev) => {
      let nextImages = (prev.images || []).map((image) =>
        image.id === imageId ? { ...image, type } : image
      );

      // If user sets to 'BOX ART', revert all other BOX ART images to 'PROMO IMAGE'
      if (type === 'BOX ART') {
        nextImages = nextImages.map((image) =>
          image.id !== imageId && image.type === 'BOX ART'
            ? { ...image, type: 'PROMO IMAGE' }
            : image
        );
      }

      return { ...prev, images: nextImages };
    });
  };

  const setMasterGridImage = (imageId) => {
    setMasterForm((prev) => {
      const nextImages = (prev.images || []).map((image) => ({
        ...image,
        isGridImage: image.id === imageId
      }));
      return {
        ...prev,
        image: nextImages.find((image) => image.isGridImage)?.id || prev.image,
        images: nextImages
      };
    });
  };

  const removeMasterImage = (imageId) => {
    setMasterForm((prev) => {
      const nextImages = (prev.images || []).filter((image) => image.id !== imageId);
      const normalizedImages = nextImages.some((image) => image.isGridImage)
        ? nextImages
        : nextImages.map((image, index) => ({ ...image, isGridImage: index === 0 }));
      return {
        ...prev,
        image: normalizedImages.find((image) => image.isGridImage)?.id || '',
        images: normalizedImages
      };
    });
  };

  const updateStockImageType = (imageId, type) => {
    setStockForm((prev) => {
      const nextImages = (prev.stockImages || []).map((image) =>
        image.id === imageId ? { ...image, type } : image
      );
      return {
        ...prev,
        stockImages: nextImages,
        boxImage: nextImages.find((image) => image.type === 'BOX CONDITION')?.id || '',
        kitImage: nextImages.find((image) => image.type === 'KIT CONDITION')?.id || ''
      };
    });
  };

  const removeStockImage = (imageId) => {
    setStockForm((prev) => {
      const nextImages = (prev.stockImages || []).filter((image) => image.id !== imageId);
      return {
        ...prev,
        stockImages: nextImages,
        boxImage: nextImages.find((image) => image.type === 'BOX CONDITION')?.id || '',
        kitImage: nextImages.find((image) => image.type === 'KIT CONDITION')?.id || ''
      };
    });
  };

  const handleSave = async () => {
    const trimmedName = masterForm.name.trim();
    const trimmedImage = masterForm.image.trim();
    const includesStock = stockMode !== 'idle' && hasStockDetails(stockForm, trimmedImage);
    const wasEditingExistingStock = Boolean(
      selectedExistingKit
      && stockMode === 'edit'
      && editingStockKey
      && selectedExistingKit.stocks?.[editingStockKey]
    );

    if (!trimmedName) {
      alert('Kit name is required.');
      return;
    }

    if (!masterForm.brand.trim()) {
      alert('Brand is required (e.g., BANDAI).');
      return;
    }

    if (!trimmedImage) {
      alert('A master kit image is required.');
      return;
    }

    if (includesStock && !stockForm.sellPrice) {
      alert('Sell price is required when adding a stock entry.');
      return;
    }

    if (includesStock && stockForm.isFreeShippingEligible && !stockForm.freeShippingUntil) {
      alert('Add a free shipping expiry date or turn the free shipping flag off.');
      return;
    }

    const payload = {
      id: selectedExistingKit?.id || null,
      name: trimmedName.toUpperCase(),
      image: trimmedImage,
      images: (masterForm.images || []).map((image) => ({
        id: image.id,
        url: image.url,
        type: image.type || 'PROMO IMAGE',
        isGridImage: image.id === trimmedImage || Boolean(image.isGridImage)
      })),
      brand: masterForm.brand.trim().toUpperCase(),
      series: masterForm.series.trim().toUpperCase(),
      specs: {
        line: masterForm.grade.trim().toUpperCase(),
        scale: masterForm.ratio.trim()
      },
      description: masterForm.description.trim(),
      jpPrice: normalizeNumber(masterForm.jpPrice),
      phPrice: normalizeNumber(masterForm.phPrice),
      dimensions: {
        l: normalizeNumber(masterForm.boxL),
        w: normalizeNumber(masterForm.boxW),
        h: normalizeNumber(masterForm.boxH)
      },
      updateMasterOnly: !includesStock
    };

    if (includesStock) {
      payload.stockUpdateKey = editingStockKey || undefined;
      
      const existingStock = editingStockKey ? (selectedExistingKit?.stocks?.[editingStockKey] || {}) : {};
      const deliveryMonth = stockForm.status === 'Onhand'
        ? ''
        : (stockForm.deliveryMonth || getDeliveryMonthFromEta(stockForm.eta));
      const calculatedEta = stockForm.status === 'Onhand'
        ? ''
        : (getEtaFromDeliveryMonth(deliveryMonth) || stockForm.eta.trim().toUpperCase());
      
      payload.newStock = withStockConditionDefaults({
        ...existingStock,
        status: stockForm.status,
        deliveryMonth,
        eta: calculatedEta,
        costPrice: normalizeNumber(stockForm.costPrice),
        paidToSupplier: normalizeNumber(stockForm.paidToSupplier),
        sellPrice: normalizeNumber(stockForm.sellPrice),
        minDownpayment: normalizeNumber(stockForm.minDownpayment),
        publicReleaseDate: stockForm.publicReleaseDate || '',
        boxCondition: normalizeConditionSuggestion(stockForm.boxCondition || (stockForm.status === 'Pre-Order' ? PRE_ORDER_BOX_CONDITION : '')),
        kitCondition: normalizeConditionSuggestion(stockForm.kitCondition || (stockForm.status === 'Pre-Order' ? PRE_ORDER_KIT_CONDITION : '')),
        issueDescription: stockForm.issueDescription.trim(),
        stockImages: (stockForm.stockImages || []).map((image) => ({
          id: image.id,
          url: image.url,
          type: image.type || 'BOX CONDITION'
        })),
        boxImage: stockForm.boxImage || '',
        kitImage: stockForm.kitImage || '',
        isFreeShippingEligible: stockForm.isFreeShippingEligible,
        freeShippingUntil: stockForm.isFreeShippingEligible ? stockForm.freeShippingUntil : '',
        freeShippingMethod: stockForm.isFreeShippingEligible ? (stockForm.freeShippingMethod || 'All') : '',     
        freeShippingSuboption: stockForm.isFreeShippingEligible ? (stockForm.freeShippingSuboption || 'All') : '', 
        timestamp: existingStock.timestamp || Date.now()
      });
    }

    let savedSuccessfully = false;
    try {
      console.log("SG DEBUG: Attempting to save kit payload:", payload);
      setIsSaving(true);
      const result = await onSave(payload);
      savedSuccessfully = true;
      
      // Update Recent Edits
      const finalKitId = payload.id || result?.id;
      if (finalKitId) {
        setRecentEdits(prev => {
          const next = [finalKitId, ...prev.filter(id => id !== finalKitId)].slice(0, 6);
          localStorage.setItem('sg_recent_kit_edits', JSON.stringify(next));
          return next;
        });
      }

      if (payload.updateMasterOnly) {
        // Just updated master, reset everything for next kit
        resetToNewKit();
      } else {
        // Updated or added a stock/variant, unselect the variant
        const nextStock = {
          ...DEFAULT_STOCK,
          publicReleaseDate: stockForm.publicReleaseDate || '',
          boxImage: masterForm.image || '',
          kitImage: '',
          stockImages: []
        };
        cancelEditStock();
        setSavedSnapshot(createModalSnapshot(masterForm, nextStock, 'idle', finalKitId || selectedKitId, ''));
      }
    } catch (error) {
      console.error(error);
      alert('Failed to save kit.');
    } finally {
      setIsSaving(false);
      if (savedSuccessfully) {
        if (returnToMasterListOnSave) {
          setReturnToMasterListOnSave(false);
          setIsMasterListView(true);
        } else if (!wasEditingExistingStock) {
          onClose();
        } else {
          // Keep the modal open after editing an existing stock so additional
          // stock details can be reviewed or adjusted without reopening it.
        }
      }
    }
  };

  const handleClose = () => {
    if (hasUnsavedChanges && !window.confirm('Discard unsaved kit changes?')) return;
    onClose();
  };

  const buildBatchPreviewRow = (row, index) => {
    const status = normalizeStockStatus(getBatchValue(row, 'AVAILABILITY', 'STATUS'));
    const name = getBatchValue(row, 'KIT NAME', 'NAME').trim();
    const brand = (getBatchValue(row, 'BRAND') || masterForm.brand || 'BANDAI').trim().toUpperCase();
    const grade = (getBatchValue(row, 'GRADE') || masterForm.grade || 'HG').trim().toUpperCase();
    const ratio = (getBatchValue(row, 'SCALE RATIO', 'RATIO') || masterForm.ratio || '1/144').trim();
    const costPrice = sanitizeRealNumberInput(getBatchValue(row, 'COST PRICE', 'COST'));

    return {
      id: `batch_${Date.now()}_${index}`,
      rowNumber: index + 2,
      stockKey: getBatchValue(row, 'STOCK KEY'),
      name,
      // image: getBatchValue(row, 'IMAGE', 'IMAGE URL') || masterForm.image || '',
      brand,
      series: (getBatchValue(row, 'SERIES') || masterForm.series || '').trim().toUpperCase(),
      grade,
      ratio,
      // jpPrice: sanitizeRealNumberInput(getBatchValue(row, 'JP PRICE', 'JAPAN PRICE') || masterForm.jpPrice),
      phPrice: sanitizeRealNumberInput(getBatchValue(row, 'PH PRICE', 'PHP PRICE') || masterForm.phPrice),
      status,
      deliveryMonth: status === 'Onhand' ? '' : getBatchValue(row, 'DELIVERY MONTH', 'ETA / BATCH LABEL', 'ETA', 'BATCH').trim().toUpperCase(),
      costPrice,
      paidToSupplier: sanitizeRealNumberInput(
        getBatchValue(row, 'PAID TO SUPPLIER', 'PAID') || (status === 'Onhand' ? costPrice : '')
      ),
      sellPrice: sanitizeRealNumberInput(getBatchValue(row, 'SELL PRICE', 'PRICE')),
      minDownpayment: sanitizeRealNumberInput(
        getBatchValue(row, 'MINIMUM DOWNPAYMENT', 'DOWNPAYMENT') || stockForm.minDownpayment || '350'
      ),
      boxCondition: normalizeConditionSuggestion(
        getBatchValue(row, 'BOX CONDITION') || (status === 'Pre-Order' ? PRE_ORDER_BOX_CONDITION : '')
      ),
      kitCondition: normalizeConditionSuggestion(
        getBatchValue(row, 'KIT CONDITION') || (status === 'Pre-Order' ? PRE_ORDER_KIT_CONDITION : '')
      ),
      keepNow: getBatchValue(row, 'KEEP NOW'),
      // orderId: getBatchValue(row, 'ORDER ID'),
      targetId: createKitTargetId(name, grade, ratio, brand)
    };
  };

  const validateBatchPreviewRow = (row) => {
    const errors = [];
    if (!row.name?.trim()) errors.push('Kit name required');
    if (!row.sellPrice || normalizeNumber(row.sellPrice) <= 0) errors.push('Sell price required');
    if (row.status !== 'Onhand' && !row.deliveryMonth?.trim()) errors.push('Delivery month required for pre-order');
    return errors;
  };

  const updateBatchPreviewRow = (rowId, field, value) => {
    setBatchPreviewRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        if (typeof value === 'string' && ['name', 'brand', 'series', 'grade', 'ratio', 'deliveryMonth', 'boxCondition', 'kitCondition', 'keepNow'].includes(field)) {
          value = value.toUpperCase();
        }
        const next = { ...row, [field]: value };
        if (field === 'name' || field === 'grade' || field === 'ratio' || field === 'brand') {
          next.targetId = createKitTargetId(
            field === 'name' ? value : next.name,
            field === 'grade' ? value : next.grade,
            field === 'ratio' ? value : next.ratio,
            field === 'brand' ? value : next.brand
          );
        }
        if (field === 'status') {
          next.status = normalizeStockStatus(value);
          if (next.status === 'Pre-Order') {
            next.boxCondition = PRE_ORDER_BOX_CONDITION;
            next.kitCondition = PRE_ORDER_KIT_CONDITION;
          }
          if (next.status === 'Onhand') {
            const normalizedOnhand = withStockConditionDefaults(next);
            next.boxCondition = normalizedOnhand.boxCondition;
            next.kitCondition = normalizedOnhand.kitCondition;
          }
          if (next.status === 'Onhand') {
            next.deliveryMonth = '';
            next.paidToSupplier = next.paidToSupplier || next.costPrice;
          }
        }
        if (['jpPrice', 'phPrice', 'costPrice', 'paidToSupplier', 'sellPrice', 'minDownpayment'].includes(field)) {
          next[field] = sanitizeRealNumberInput(value);
          if (field === 'costPrice' && next.status === 'Onhand' && !next.paidToSupplier) {
            next.paidToSupplier = sanitizeRealNumberInput(value);
          }
        }
        return next;
      })
    );
  };

  const removeBatchPreviewRow = (rowId) => {
    setBatchPreviewRows((prev) => prev.filter((row) => row.id !== rowId));
  };

  const duplicateBatchPreviewRow = (rowId) => {
    setBatchPreviewRows((prev) => {
      const source = prev.find((row) => row.id === rowId);
      if (!source) return prev;
      const index = prev.findIndex((row) => row.id === rowId);
      const copy = { ...source, id: `batch_${Date.now()}_copy`, rowNumber: `${source.rowNumber} copy` };
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
    });
  };

  const buildBatchPayloadFromPreview = (row) => {
    const name = row.name.trim();
    if (!name) return null;

    const status = normalizeStockStatus(row.status);
    const image = row.image || '';
    const images = image
      ? [{ id: `batch_${Date.now()}_${name}`, url: image, type: 'BOX ART', isGridImage: true }]
      : [];

    return {
      id: null,
      stockUpdateKey: row.stockKey || undefined,
      name: name.toUpperCase(),
      image,
      images,
      brand: (row.brand || 'BANDAI').trim().toUpperCase(),
      series: (row.series || '').trim().toUpperCase(),
      specs: {
        line: (row.grade || 'HG').trim().toUpperCase(),
        scale: (row.ratio || '1/144').trim()
      },
      description: masterForm.description.trim(),
      jpPrice: normalizeNumber(row.jpPrice),
      phPrice: normalizeNumber(row.phPrice),
      dimensions: {
        l: normalizeNumber(masterForm.boxL),
        w: normalizeNumber(masterForm.boxW),
        h: normalizeNumber(masterForm.boxH)
      },
      updateMasterOnly: false,
      newStock: {
        status,
        deliveryMonth: status === 'Onhand' ? '' : row.deliveryMonth.trim().toUpperCase(),
        eta: status === 'Onhand' ? '' : (getEtaFromDeliveryMonth(row.deliveryMonth) || row.deliveryMonth.trim().toUpperCase()),
        costPrice: normalizeNumber(row.costPrice),
        paidToSupplier: normalizeNumber(row.paidToSupplier),
        sellPrice: normalizeNumber(row.sellPrice),
        minDownpayment: normalizeNumber(row.minDownpayment || '350'),
        publicReleaseDate: stockForm.publicReleaseDate || '',
        boxCondition: normalizeConditionSuggestion(row.boxCondition || (status === 'Pre-Order' ? PRE_ORDER_BOX_CONDITION : '')),
        kitCondition: normalizeConditionSuggestion(row.kitCondition || (status === 'Pre-Order' ? PRE_ORDER_KIT_CONDITION : '')),
        stockImages: [],
        boxImage: '',
        kitImage: '',
        isFreeShippingEligible: stockForm.isFreeShippingEligible,
        freeShippingUntil: stockForm.isFreeShippingEligible ? stockForm.freeShippingUntil : '',
        freeShippingMethod: stockForm.isFreeShippingEligible ? (stockForm.freeShippingMethod || 'All') : 'All',
        freeShippingSuboption: stockForm.isFreeShippingEligible ? (stockForm.freeShippingSuboption || 'All') : 'All',
        timestamp: Date.now()
      }
    };
  };

  const handleBatchUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setIsBatchUploading(true);
      const rows = await parseXlsxRows(file);
      const previewRows = rows
        .map(buildBatchPreviewRow)
        .filter((row) => row.name || row.brand || row.series || row.sellPrice || row.costPrice);
      if (previewRows.length === 0) {
        alert('No kit rows found in the Excel file.');
        return;
      }

      setBatchFileName(file.name);
      setBatchPreviewRows(previewRows);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Failed to process the Excel file.');
    } finally {
      setIsBatchUploading(false);
    }
  };

  const handleConfirmBatchUpload = async () => {
    const invalidRows = batchPreviewRows.filter((row) => validateBatchPreviewRow(row).length > 0);
    if (invalidRows.length > 0) {
      alert(`Review ${invalidRows.length} batch row${invalidRows.length === 1 ? '' : 's'} before uploading.`);
      return;
    }

    if (!window.confirm(`Upload ${batchPreviewRows.length} kit stock rows to Firebase?`)) return;

    try {
      setIsBatchUploading(true);
      for (const row of batchPreviewRows) {
        const payload = buildBatchPayloadFromPreview(row);
        if (payload) await onSave(payload);
      }
      setBatchPreviewRows([]);
      setBatchFileName('');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Batch upload failed. Some earlier rows may already be saved.');
    } finally {
      setIsBatchUploading(false);
    }
  };

  const toggleSelectMaster = (id) => {
    setSelectedMasterIds(prev => 
      prev.includes(id) ? prev.filter(mid => mid !== id) : [...prev, id]
    );
  };

  const toggleSelectAllMasters = () => {
    if (selectedMasterIds.length === masterListSelectableIds.length) {
      setSelectedMasterIds([]);
    } else {
      setSelectedMasterIds(masterListSelectableIds);
    }
  };

  const handleBulkDeleteMasters = async () => {
    if (selectedMasterIds.length === 0) return;
    if (window.confirm(`Permanently delete ${selectedMasterIds.length} selected master kits and ALL their variants? This cannot be undone.`)) {
      try {
        setIsSaving(true);
        for (const id of selectedMasterIds) {
          await deleteKit(id);
        }
        alert('Selected kits deleted successfully.');
        setSelectedMasterIds([]);
        resetToNewKit();
      } catch (error) {
        console.error(error);
        alert('Failed to delete some kits.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const masterListFiltered = useMemo(() => {
    const { text: textQuery, filters: conditionFilters } = parseMasterSearchQuery(masterSearchQuery.trim());
    const hasConditionFilters = Object.values(conditionFilters).some((values) => values.length > 0);
    const filtered = !textQuery && !hasConditionFilters
      ? (kits || [])
      : (kits || []).filter(kit => {
        const haystack = [kit.name, kit.brand, kit.series, kit.specs?.line, kit.specs?.scale]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        const matchesText = !textQuery || haystack.includes(textQuery);
        const matchesConditions = !hasConditionFilters || Object.values(kit.stocks || {})
          .some((stock) => stockMatchesConditionFilters(stock, conditionFilters));
        return matchesText && matchesConditions;
      });

    return [...filtered].sort((a, b) => (
      String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' })
      || String(a?.id || '').localeCompare(String(b?.id || ''))
    ));
  }, [kits, masterSearchQuery]);

  const masterListRows = useMemo(() => (
    masterListFiltered.flatMap((kit) => {
      const { filters: conditionFilters } = parseMasterSearchQuery(masterSearchQuery.trim());
      const hasConditionFilters = Object.values(conditionFilters).some((values) => values.length > 0);
      const stocks = Object.entries(kit.stocks || {})
        .filter(([, stock]) => !hasConditionFilters || stockMatchesConditionFilters(stock, conditionFilters))
        .map(([key, stock]) => ({ key, ...stock }))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      if (stocks.length === 0 && !hasConditionFilters) return [{ kit, stock: {}, stockKey: '', variantIndex: 0 }];
      return stocks.map((stock, index) => ({ kit, stock, stockKey: stock.key, variantIndex: index }));
    })
  ), [masterListFiltered, masterSearchQuery]);

  const masterListSelectableIds = useMemo(() => (
    Array.from(new Set(masterListFiltered.map((kit) => kit.id)))
  ), [masterListFiltered]);

  const handleDownloadMasterList = () => {
    if (masterListRows.length === 0) {
      alert('There are no stock entries to export.');
      return;
    }

    const columns = [
      ['KIT ID', ({ kit }) => kit.id],
      ['STOCK KEY', ({ stockKey }) => stockKey],
      ['VARIANT', ({ variantIndex }) => `V${variantIndex + 1}`],
      ['KIT NAME', ({ kit }) => kit.name],
      ['BRAND', ({ kit }) => kit.brand],
      ['SERIES', ({ kit }) => kit.series],
      ['LINE', ({ kit }) => kit.specs?.line],
      ['SCALE', ({ kit }) => kit.specs?.scale],
      ['DESCRIPTION', ({ kit }) => kit.description],
      ['MASTER IMAGE', ({ kit }) => kit.image],
      ['MASTER IMAGE URLS', ({ kit }) => (kit.images || []).map((image) => image.url).filter(Boolean).join(' | ')],
      ['BOX DIMENSIONS', ({ kit }) => [kit.dimensions?.l, kit.dimensions?.w, kit.dimensions?.h].filter((value) => value !== undefined && value !== '').join(' / ')],
      ['MASTER JAPAN PRICE', ({ kit }) => kit.jpPrice],
      ['MASTER PHP PRICE', ({ kit }) => kit.phPrice],
      ['STATUS', ({ stock }) => stock.status],
      ['DELIVERY MONTH', ({ stock }) => stock.deliveryMonth || getDeliveryMonthFromEta(stock.eta)],
      ['PUBLIC RELEASE DATE', ({ stock }) => stock.publicReleaseDate],
      ['COST PRICE', ({ stock }) => stock.costPrice],
      ['PAID TO SUPPLIER', ({ stock }) => stock.paidToSupplier],
      ['SELL PRICE', ({ stock }) => stock.sellPrice],
      ['MINIMUM DOWNPAYMENT', ({ stock }) => stock.minDownpayment],
      ['BOX CONDITION', ({ stock }) => stock.boxCondition || extractLegacyConditions(stock).boxCondition],
      ['KIT CONDITION', ({ stock }) => stock.kitCondition || extractLegacyConditions(stock).kitCondition],
      ['ISSUE DESCRIPTION', ({ stock }) => stock.issueDescription],
      ['BOX IMAGE', ({ stock }) => stock.boxImage],
      ['KIT IMAGE', ({ stock }) => stock.kitImage],
      ['STOCK IMAGE URLS', ({ stock }) => (stock.stockImages || []).map((image) => image.url).filter(Boolean).join(' | ')],
      ['FREE SHIPPING ELIGIBLE', ({ stock }) => stock.isFreeShippingEligible ? 'YES' : 'NO'],
      ['FREE SHIPPING UNTIL', ({ stock }) => stock.freeShippingUntil],
      ['FREE SHIPPING METHOD', ({ stock }) => stock.freeShippingMethod],
      ['FREE SHIPPING SUBOPTION', ({ stock }) => stock.freeShippingSuboption],
      ['IS RESERVED', ({ stock }) => stock.isReserved ? 'YES' : 'NO'],
      ['RESERVATION TYPE', ({ stock }) => stock.reservationType],
      ['RESERVED BY', ({ stock }) => stock.reservedBy],
      ['TIMESTAMP', ({ stock }) => stock.timestamp]
    ];
    const workbook = createExcelXml(columns, masterListRows);
    const blob = new Blob([`\uFEFF${workbook}`], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `snorlaxgarage-master-list-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const estimatedSize = useMemo(() => {
    // Estimating the FINAL document size for Firestore (1MB limit)
    const masterData = {
      name: masterForm.name,
      image: masterForm.image,
      images: masterForm.images,
      brand: masterForm.brand,
      series: masterForm.series,
      specs: {
        line: masterForm.grade,
        scale: masterForm.ratio
      },
      description: masterForm.description,
      jpPrice: masterForm.jpPrice,
      phPrice: masterForm.phPrice,
      dimensions: { l: masterForm.boxL, w: masterForm.boxW, h: masterForm.boxH },
      stocks: selectedExistingKit?.stocks ? { ...selectedExistingKit.stocks } : {}
    };

    const includesStock = stockMode !== 'idle' && hasStockDetails(stockForm, masterForm.image);
    if (includesStock) {
      const key = editingStockKey || 'new_stock_estimate';
      masterData.stocks[key] = { ...stockForm };
    }

    try {
      // JSON string length is a good proxy for bytes in base64-heavy payloads
      return JSON.stringify(masterData).length;
    } catch {
      return 0;
    }
  }, [masterForm, stockForm, selectedExistingKit, stockMode, editingStockKey]);

  if (!isOpen) return null;

  const DocumentSizeIndicator = () => {
    const MAX_SIZE = 1048576; // 1MB
    const sizePercent = (estimatedSize / MAX_SIZE) * 100;
    const isCritical = sizePercent > 80;
    const isOver = sizePercent > 100;

    return (
      <div className="flex items-center gap-2">
        <div className={`h-1.5 w-16 overflow-hidden rounded-full ${isDarkMode ? 'bg-white/10' : 'bg-black/5'}`}>
          <div
            className={`h-full transition-all duration-500 ${
              isOver ? 'bg-red-600' : isCritical ? 'bg-amber-500' : 'bg-blue-500'
            }`}
            style={{ width: `${Math.min(sizePercent, 100)}%` }}
          />
        </div>
        <span className={`text-[8px] font-black tracking-tighter ${
          isOver ? 'text-red-500 animate-pulse' : isCritical ? 'text-amber-500' : 'opacity-40'
        }`}>
          {Math.min(Math.round(sizePercent), 999)}% {isOver ? 'OVER LIMIT' : 'USED'}
        </span>
      </div>
    );
  };

  const isEditingExistingStock = Boolean(selectedExistingKit && stockMode === 'edit' && editingStockKey);
  const canEditStockSection = stockMode !== 'idle';
  const costPriceNumber = Number(stockForm.costPrice) || 0;
  const sellPriceNumber = Number(stockForm.sellPrice) || 0;
  const isSellPriceInvalid = Boolean(stockForm.sellPrice) && (sellPriceNumber - costPriceNumber) < 350;
  const currentSnapshot = createModalSnapshot(
    masterForm,
    stockForm,
    stockMode,
    selectedKitId,
    editingStockKey
  );
  const hasUnsavedChanges = Boolean(savedSnapshot && currentSnapshot !== savedSnapshot);
  const panelClass = isDarkMode
    ? 'bg-[#0b0b0c] border-white/10 text-white'
    : 'bg-white border-black/10 text-neutral-900';
  const modalPanelClass = isDarkMode
    ? 'bg-[#0a0a0a]/90 border-white/10 text-white'
    : 'bg-white/90 border-black/5 text-neutral-900';
  const inputClass = `${textInputClass} ${
    isDarkMode
      ? 'bg-white/5 border-white/10 focus:border-blue-500'
      : 'bg-neutral-50 border-black/10 focus:border-blue-500'
  }`;
  const numericInputClass = `${numberInputClass} ${
    isDarkMode
      ? 'bg-white/5 border-white/10 focus:border-blue-500'
      : 'bg-neutral-50 border-black/10 focus:border-blue-500'
  }`;
  const cardClass = `rounded-[1.5rem] border p-4 sm:p-5 ${
    isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-black/10 bg-white'
  }`;
  const mutedCardClass = `rounded-[1.25rem] border p-4 ${
    isDarkMode ? 'border-white/10 bg-white/5' : 'border-black/10 bg-neutral-50'
  }`;
  const batchInvalidCount = batchPreviewRows.filter((row) => validateBatchPreviewRow(row).length > 0).length;
  const batchDuplicateIds = batchPreviewRows.reduce((counts, row) => {
    if (!row.targetId) return counts;
    counts[row.targetId] = (counts[row.targetId] || 0) + 1;
    return counts;
  }, {});
  const batchDuplicateCount = Object.values(batchDuplicateIds).filter((count) => count > 1).length;
  const batchInputClass = `min-w-[8rem] rounded-xl border px-3 py-2 text-[10px] font-bold outline-none ${
    isDarkMode ? 'border-white/10 bg-white/5 text-white' : 'border-black/10 bg-white text-neutral-900'
  } uppercase`;

  return (
    <div className="fixed inset-0 z-[500] flex items-start justify-center bg-black/60 p-0 font-sans text-neutral-900 dark:text-white lg:items-center lg:p-4" role="dialog" aria-modal="true" aria-label="Add kit inventory">
        <div data-add-kit-modal-root className={`relative flex h-full min-h-0 w-full flex-col overflow-hidden text-left shadow-2xl backdrop-blur-xl lg:h-auto lg:max-h-[95vh] lg:max-w-5xl lg:rounded-[2.5rem] lg:border lg:p-5 ${modalPanelClass}`}>
            {/* Mobile sticky close button (same pattern as ProductCard and AddDealModal) */}
            <div className="sticky top-0 z-[220] w-full h-0 overflow-visible lg:hidden">
              <div className="absolute top-4 right-4 flex justify-end items-center">
                <button onClick={handleClose} className="p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4 pr-16 sm:px-6 sm:pr-16 lg:pr-6">
            <div className="flex min-w-0 flex-1 items-center gap-4">
                <div className="rounded-2xl bg-blue-600 p-3 text-white shadow-lg shadow-blue-600/20">
                <PackagePlus size={20} />
                </div>
                {isMasterListView ? (
                  <div className="min-w-0 w-full max-w-[420px] text-left">
                    <div className="relative">
                      <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2" />
                      <input
                        value={masterSearchQuery}
                        onChange={(e) => setMasterSearchQuery(e.target.value)}
                        placeholder="Search name, brand, series, BOX:PRISTINE, KIT:SEALED..."
                        className={`${inputClass} h-10 pl-10`}
                      />
                    </div>
                    <p className="mt-1 text-[12px] font-bold">
                      {masterListRows.length} stock entries / {masterListFiltered.length} kits
                    </p>
                  </div>
                ) : (
                  <div className="text-left">
                    <h2 className="text-lg font-black uppercase italic tracking-tight">
                      Kit Entry
                    </h2>
                  </div>
                )}
            </div>
            <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={() => {
                  setIsMasterListView(!isMasterListView);
                }}
                className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-all ${
                    isMasterListView 
                    ? 'border-blue-500 bg-blue-500 text-white shadow-lg shadow-blue-500/20' 
                    : 'border-white/10 hover:border-blue-500 hover:text-blue-500'
                }`}
            >
                <History size={14} />
                Master List
            </button>
            {isMasterListView ? (
              <button
                  type="button"
                  onClick={handleDownloadMasterList}
                  disabled={masterListRows.length === 0}
                  className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-emerald-600 transition-all hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                  <Download size={14} />
                  Download Excel
              </button>
            ) : (
              <>
                <button
                    type="button"
                    onClick={() => batchUploadRef.current?.click()}
                    disabled={isBatchUploading}
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-all hover:border-emerald-500 hover:text-emerald-500 disabled:opacity-40"
                >
                    {isBatchUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    Batch
                </button>
                <input
                    ref={batchUploadRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={handleBatchUpload}
                />
              </>
            )}
            <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !hasUnsavedChanges}
                className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition-all active:scale-95 disabled:cursor-not-allowed disabled:bg-neutral-400 disabled:shadow-none disabled:opacity-45"
            >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save
            </button>
            <button
                type="button"
                onClick={handleClose}
                className="hidden lg:block rounded-full p-2 transition-all hover:bg-white/10"
            >
                <X size={22} />
            </button>
            </div>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 overflow-hidden">
                <div className={`min-h-0 min-w-0 p-4 sm:p-6 lg:p-8 ${isMasterListView ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                    {isMasterListView ? (
                        <section className="flex h-full min-h-0 flex-col gap-3">
                            {selectedMasterIds.length > 0 && (
                                <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
                                    <div className="flex items-center gap-2">
                                            <select 
                                                className="h-10 rounded-xl border border-white/10 bg-black/5 px-2 text-[12px] font-black uppercase tracking-widest outline-none"
                                                value={bulkUpdateParam}
                                                onChange={(e) => setBulkUpdateParam(e.target.value)}
                                            >
                                                <option value="brand">Brand</option>
                                                <option value="series">Series</option>
                                                <option value="line">Line</option>
                                                <option value="scale">Scale</option>
                                            </select>
                                            <input 
                                                placeholder="New value..."
                                                value={bulkUpdateValue}
                                                onChange={(e) => setBulkUpdateValue(e.target.value)}
                                                className="h-10 w-32 rounded-xl border border-white/10 bg-black/5 px-3 text-[12px] font-black uppercase tracking-widest outline-none"
                                            />
                                            {bulkUpdateValue.trim() ? (
                                                <button
                                                    type="button"
                                                    onClick={handleBulkUpdate}
                                                    className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 h-10 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition-all active:scale-95 whitespace-nowrap"
                                                >
                                                    <Save size={14} />
                                                    Update
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={handleBulkDeleteMasters}
                                                    className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 h-10 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-red-600/20 transition-all active:scale-95 whitespace-nowrap"
                                                >
                                                    <Trash2 size={14} />
                                                    Delete ({selectedMasterIds.length})
                                                </button>
                                            )}
                                    </div>
                                </div>
                            )}

                            <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-white/10">
                                <table className="min-w-[980px] table-fixed border-collapse text-left text-[12px]">
                                    <colgroup>
                                        <col className="w-[4%]" />
                                        <col className="w-[8%]" />
                                        <col className="w-[25%]" />
                                        <col className="w-[20%]" />
                                        <col className="w-[11%]" />
                                        <col className="w-[14%]" />
                                        <col className="w-[14%]" />
                                        <col className="w-[8%]" />
                                    </colgroup>
                                    <thead className="sticky top-0 z-10 bg-blue-600 text-white">
                                        <tr>
                                            <th className="px-4 py-3">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedMasterIds.length > 0 && selectedMasterIds.length === masterListSelectableIds.length}
                                                    onChange={toggleSelectAllMasters}
                                                    className="h-4 w-4 rounded border-white/20 bg-white/10 accent-blue-500"
                                                />
                                            </th>
                                            {['Photo', 'Kit Name', 'Brand · Series · Line · Scale', 'Cost / Sell', 'Stock', 'Box / Kit Condition', ''].map((header) => (
                                                <th key={header} className="px-4 py-3 text-[12px] font-black uppercase tracking-[0.2em]">
                                                    {header}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {masterListRows.map(({ kit, stock, stockKey, variantIndex }) => {
                                            const legacy = extractLegacyConditions(stock);
                                            const boxCondition = stock.boxCondition || legacy.boxCondition || '—';
                                            const kitCondition = stock.kitCondition || legacy.kitCondition || '—';
                                            const costPrice = stock.costPrice || kit.jpPrice || 0;
                                            const sellPrice = stock.sellPrice || kit.phPrice || 0;
                                            const isAdminShelfStock = stock.isReserved && stock.reservationType === 'admin';

                                            return (
                                                <tr key={kit.id} className={`group transition-colors hover:bg-white/5 ${selectedMasterIds.includes(kit.id) ? 'bg-blue-600/10' : ''}`}>
                                                    <td className="px-4 py-2">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedMasterIds.includes(kit.id)}
                                                            onChange={() => toggleSelectMaster(kit.id)}
                                                            className="h-4 w-4 rounded border-white/20 bg-white/10 accent-blue-500"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setPreviewAsset({ url: resolveImage(kit.image, kit.images), label: kit.name })}
                                                            className="h-10 w-10 overflow-hidden rounded-lg bg-white/10"
                                                        >
                                                            <img src={resolveImage(kit.image, kit.images)} alt="" className="h-full w-full object-cover" />
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-2 align-top font-black uppercase">
                                                        <div className="line-clamp-3 leading-snug" title={kit.name}>{kit.name || 'Unnamed kit'}</div>
                                                    </td>
                                                    <td className="px-4 py-2 align-top font-bold uppercase">
                                                        <div>
                                                            {[kit.brand, kit.series, kit.specs?.line, kit.specs?.scale]
                                                              .map((value) => value || '—')
                                                              .join(' / ')}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2 align-top font-bold uppercase">
                                                        <div>
                                                            {Number(costPrice).toLocaleString()} / <span className={isAdminShelfStock ? 'text-blue-500' : 'text-emerald-500'}>{Number(sellPrice).toLocaleString()}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <div className="font-black">V{variantIndex + 1} / {stock.status || 'Onhand'}</div>
                                                        {stock.eta && <div className="mt-1 text-[10px] font-bold uppercase">{stock.eta}</div>}
                                                        {stockKey && <div className="mt-1 break-all text-[9px] font-bold uppercase">{stockKey}</div>}
                                                    </td>
                                                    <td className="px-4 py-2 align-top text-[10px] font-bold uppercase">
                                                        <div className="leading-snug">{boxCondition} / {kitCondition}</div>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                applyKitToForm(kit);
                                                                setReturnToMasterListOnSave(true);
                                                                setIsMasterListView(false);
                                                            }}
                                                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition-all active:scale-95"
                                                        >
                                                            Edit
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    ) : (
                        <>
                            {batchPreviewRows.length > 0 && (
                                <section className={`mb-6 rounded-[1.5rem] border p-4 ${isDarkMode ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-emerald-500/20 bg-white'}`}>
                                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">
                                                Batch Preview
                                            </p>
                                            <h3 className="mt-1 text-sm font-black uppercase tracking-tight">
                                                {batchPreviewRows.length} imported rows
                                            </h3>
                                            <p className="mt-1 text-[10px] font-bold opacity-55">
                                                {batchFileName || 'Excel file'} - <button type="button" onClick={scrollToFirstError} className="text-red-500 hover:underline">{batchInvalidCount} need review</button> - {batchDuplicateCount} duplicate kit groups
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setBatchPreviewRows([]);
                                                    setBatchFileName('');
                                                }}
                                                className="rounded-xl border border-white/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest opacity-70 transition-all hover:border-red-500 hover:text-red-500"
                                            >
                                                Clear
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleConfirmBatchUpload}
                                                disabled={isBatchUploading || batchInvalidCount > 0 || batchPreviewRows.length === 0}
                                                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/20 disabled:opacity-40"
                                            >
                                                {isBatchUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                                                Upload
                                            </button>
                                        </div>
                                    </div>

                                    <div className="max-h-[67vh] overflow-auto rounded-2xl border border-white/10">
                                        <table className="min-w-[1320px] border-collapse text-left text-[10px]">
                                            <thead className="bg-blue-600">
                                                <tr>
                                                    {['Row', 'Status', 'Kit Name', 'Brand', 'Series', 'Grade', 'Ratio', 'PH', 'Availability', 'Delivery Month', 'Cost', 'Paid', 'Sell', 'DP', 'Keep', ''].map((header) => (
                                                        <th key={header} className="sticky top-0 z-10 border-b border-white/10 px-3 py-2  text-white text-[9px] uppercase tracking-[0.18em]">
                                                            {header}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {batchPreviewRows.map((row) => {
                                                    const errors = validateBatchPreviewRow(row);
                                                    const hasDuplicateTarget = batchDuplicateIds[row.targetId] > 1;
                                                    return (
                                                        <tr key={row.id} id={`batch-row-${row.id}`} className={`border-b border-white/5 ${errors.length ? 'bg-red-500/10' : hasDuplicateTarget ? 'bg-amber-500/10' : ''}`}>
                                                            <td className="px-3 py-2 font-black opacity-50">{row.rowNumber}</td>
                                                            <td className="px-3 py-2">
                                                                <span className={`rounded-full px-2 py-1 text-[8px] font-black uppercase tracking-widest ${
                                                                    errors.length ? 'bg-red-600 text-white' : hasDuplicateTarget ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'
                                                                }`}>
                                                                    {errors.length ? 'Fix' : hasDuplicateTarget ? 'Append' : 'OK'}
                                                                </span>
                                                                {errors.length > 0 && (
                                                                    <p className="mt-1 max-w-[10rem] text-[9px] font-bold text-red-500">
                                                                        {errors.join(', ')}
                                                                    </p>
                                                                )}
                                                            </td>
                                                            <td className="px-2 py-2"><input value={row.name} onChange={(event) => updateBatchPreviewRow(row.id, 'name', event.target.value)} className={`${batchInputClass} min-w-[15rem]`} /></td>
                                                            {/* <td className="px-2 py-2"><input value={row.image} onChange={(event) => updateBatchPreviewRow(row.id, 'image', event.target.value)} className={`${batchInputClass} min-w-[14rem]`} /></td> */}
                                                            <td className="px-2 py-2"><input value={row.brand} onChange={(event) => updateBatchPreviewRow(row.id, 'brand', event.target.value.toUpperCase())} className={batchInputClass} /></td>
                                                            <td className="px-2 py-2"><input value={row.series} onChange={(event) => updateBatchPreviewRow(row.id, 'series', event.target.value.toUpperCase())} className={`${batchInputClass} min-w-[16rem]`} /></td>
                                                            <td className="px-2 py-2"><input value={row.grade} onChange={(event) => updateBatchPreviewRow(row.id, 'grade', event.target.value.toUpperCase())} className={`${batchInputClass} min-w-[5rem]`} /></td>
                                                            <td className="px-2 py-2"><input value={row.ratio} onChange={(event) => updateBatchPreviewRow(row.id, 'ratio', event.target.value)} className={`${batchInputClass} min-w-[6rem]`} /></td>
                                                            {/* <td className="px-2 py-2"><input value={row.jpPrice} onChange={(event) => updateBatchPreviewRow(row.id, 'jpPrice', event.target.value)} className={`${batchInputClass} min-w-[6rem]`} /></td> */}
                                                            <td className="px-2 py-2"><input value={row.phPrice} onChange={(event) => updateBatchPreviewRow(row.id, 'phPrice', event.target.value)} className={`${batchInputClass} min-w-[6rem]`} /></td>
                                                            <td className="px-2 py-2">
                                                                <select value={row.status} onChange={(event) => updateBatchPreviewRow(row.id, 'status', event.target.value)} className={`${batchInputClass} min-w-[8rem]`}>
                                                                    <option value="Onhand">Onhand</option>
                                                                    <option value="Pre-Order">Pre-Order</option>
                                                                </select>
                                                            </td>
                                                            <td className="px-2 py-2"><input value={row.deliveryMonth} onChange={(event) => updateBatchPreviewRow(row.id, 'deliveryMonth', event.target.value.toUpperCase())} disabled={row.status === 'Onhand'} className={`${batchInputClass} min-w-[7rem] disabled:opacity-40`} /></td>
                                                            <td className="px-2 py-2"><input value={row.costPrice} onChange={(event) => updateBatchPreviewRow(row.id, 'costPrice', event.target.value)} className={`${batchInputClass} min-w-[6rem]`} /></td>
                                                            <td className="px-2 py-2"><input value={row.paidToSupplier} onChange={(event) => updateBatchPreviewRow(row.id, 'paidToSupplier', event.target.value)} className={`${batchInputClass} min-w-[6rem]`} /></td>
                                                            <td className="px-2 py-2"><input value={row.sellPrice} onChange={(event) => updateBatchPreviewRow(row.id, 'sellPrice', event.target.value)} className={`${batchInputClass} min-w-[6rem]`} /></td>
                                                            <td className="px-2 py-2"><input value={row.minDownpayment} onChange={(event) => updateBatchPreviewRow(row.id, 'minDownpayment', event.target.value)} className={`${batchInputClass} min-w-[6rem]`} /></td>
                                                            {/* <td className="px-2 py-2"><input value={row.boxCondition} onChange={(event) => updateBatchPreviewRow(row.id, 'boxCondition', event.target.value.toUpperCase())} className={batchInputClass} /></td>
                                                            <td className="px-2 py-2"><input value={row.kitCondition} onChange={(event) => updateBatchPreviewRow(row.id, 'kitCondition', event.target.value.toUpperCase())} className={batchInputClass} /></td> */}
                                                            <td className="px-2 py-2"><input value={row.keepNow} onChange={(event) => updateBatchPreviewRow(row.id, 'keepNow', event.target.value.toUpperCase())} className={`${batchInputClass} min-w-[5rem]`} /></td>
                                                            {/* <td className="px-2 py-2"><input value={row.orderId} onChange={(event) => updateBatchPreviewRow(row.id, 'orderId', event.target.value)} className={batchInputClass} /></td> */}
                                                            <td className="px-2 py-2">
                                                                <div className="flex gap-1">
                                                                    <button type="button" onClick={() => duplicateBatchPreviewRow(row.id)} className="rounded-lg border border-white/10 p-2 opacity-70 hover:text-blue-500">
                                                                        <Copy size={12} />
                                                                    </button>
                                                                    <button type="button" onClick={() => removeBatchPreviewRow(row.id)} className="rounded-lg border border-white/10 p-2 text-red-500 opacity-70 hover:opacity-100">
                                                                        <Trash2 size={12} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            )}
                            {batchPreviewRows.length === 0 && (
                                <div className="grid items-start gap-6 2xl:gap-8 lg:grid-cols-2">
                                    {/* Existing Manual Form UI... */}
                            <div className={`${cardClass} self-start space-y-6`}>
                                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
                                Master Kit Details
                                </h3>
                                <section className="space-y-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="text-left">
                                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
                                        1. Kit Master
                                    </h3>
                                    </div>
                                    {!isEditingExistingStock && (
                                    <div className="flex flex-wrap justify-end gap-2">
                                        {selectedExistingKit && (
                                            <button
                                                type="button"
                                                onClick={handleDuplicateMaster}
                                                disabled={isSaving}
                                                className="rounded-xl border border-blue-500/20 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-500 transition-all hover:bg-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                                Duplicate
                                            </button>
                                        )}
                                        {!editingKit && selectedKitId && (
                                            <button
                                                type="button"
                                                onClick={handleDeleteKit}
                                                className="rounded-xl border border-red-500/20 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 transition-all hover:bg-red-500 hover:text-white"
                                            >
                                                Delete Master
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={resetToNewKit}
                                            className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest opacity-70 transition-all hover:border-blue-500 hover:text-blue-500"
                                        >
                                            New Master
                                        </button>
                                    </div>
                                    )}
                                </div>

                                {isEditingExistingStock ? (
                                    <>
                                    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 text-left">
                                        <label className={labelClass}>Kit Name</label>
                                        <div className={`rounded-2xl border px-4 py-3 text-sm font-black uppercase tracking-tight opacity-80 ${selectedKitId ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-white/10 bg-black/10'}`}>
                                            {masterForm.name || 'Unnamed kit'}
                                        </div>
                                    </div>

                                    <div className="grid gap-4 lg:grid-cols-2">
                                        <div>
                                        <label className={labelClass}>JP Price (Yen)</label>
                                        <div className={`${inputClass} opacity-80`}>
                                            {Number(masterForm.jpPrice || 0).toLocaleString()}
                                        </div>
                                        </div>

                                        <div>
                                        <label className={labelClass}>PH Price (PHP)</label>
                                        <div className={`${inputClass} opacity-80`}>
                                            {Number(masterForm.phPrice || 0).toLocaleString()}
                                        </div>
                                        </div>
                                    </div>
                                    </>
                                ) : (
                                  <>
                                    <div className="grid gap-4 lg:grid-cols-2">
                                        
                                        <div className="relative lg:col-span-2">
                                        <label className={labelClass}>Kit Name</label>
                                        <Search
                                            size={16}
                                            className="absolute left-4 top-[43px] -translate-y-1/2 opacity-35"
                                        />
                                        <input
                                            value={masterForm.name}
                                            onChange={(event) => updateMaster('name', event.target.value)}
                                            onFocus={() => setShowSearchResults(true)}
                                            placeholder="RX-78-2 GUNDAM VER. 2.0"
                                            className={`${inputClass} pl-11 ${selectedKitId ? 'border-emerald-500/50 bg-emerald-500/5 focus:border-emerald-500' : ''}`}
                                        />

                                        {showSearchResults && filteredKits.length > 0 && (
                                            <div
                                            className={`absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border shadow-2xl ${panelClass}`}
                                            >
                                            {!masterForm.name.trim() && (
                                                <div className="px-4 py-2 border-b border-white/10 bg-white/5">
                                                <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40 text-blue-500">
                                                    Recently Edited
                                                </span>
                                                </div>
                                            )}
                                            {filteredKits.map((kit) => (
                                                <button
                                                key={kit.id}
                                                onClick={() => applyKitToForm(kit)}
                                                className="flex w-full items-center gap-3 border-b border-white/5 px-4 py-3 text-left transition-colors hover:bg-white/5 last:border-b-0"
                                                >
                                                <img
                                                    src={resolveImage(kit.image, kit.images)}
                                                    alt={kit.name}
                                                    className="h-12 w-12 rounded-xl bg-white object-cover"
                                                />
                                                <div>
                                                    <p className="text-[11px] font-black uppercase">{kit.name}</p>
                                                    <p className="text-[9px] font-bold uppercase tracking-widest opacity-45">
                                                    {kit.specs?.line} {kit.specs?.scale}{' '}
                                                    {kit.series ? `• ${kit.series}` : ''}
                                                    </p>
                                                </div>
                                                </button>
                                            ))}
                                            </div>
                                        )}
                                        </div>

                                        <div>
                                        <label className={labelClass}>Brand</label>
                                        <input
                                            list="brand-suggestions"
                                            value={masterForm.brand}
                                            onChange={(event) => updateMaster('brand', event.target.value)}
                                            placeholder="BANDAI"
                                            className={inputClass}
                                        />
                                        <datalist id="brand-suggestions">
                                            {masterSuggestions.brand.map((val) => (
                                            <option key={`brand-${val}`} value={val} />
                                            ))}
                                        </datalist>
                                        </div>

                                        <div>
                                        <label className={labelClass}>Series</label>
                                        <input
                                            list="series-suggestions"
                                            value={masterForm.series}
                                            onChange={(event) => updateMaster('series', event.target.value)}
                                            placeholder="MOBILE SUIT GUNDAM"
                                            className={inputClass}
                                        />
                                        <datalist id="series-suggestions">
                                            {masterSuggestions.series.map((val) => (
                                            <option key={`series-${val}`} value={val} />
                                            ))}
                                        </datalist>
                                        </div>

                                        <div>
                                        <label className={labelClass}>Line</label>
                                        <input
                                            list="grade-suggestions"
                                            value={masterForm.grade}
                                            onChange={(event) => updateMaster('grade', event.target.value)}
                                            placeholder="HG"
                                            className={inputClass}
                                        />
                                        <datalist id="grade-suggestions">
                                            {masterSuggestions.grade.map((val) => (
                                            <option key={`grade-${val}`} value={val} />
                                            ))}
                                        </datalist>
                                        </div>

                                        <div>
                                        <label className={labelClass}>Scale</label>
                                        <input
                                            list="ratio-suggestions"
                                            value={masterForm.ratio}
                                            onChange={(event) => updateMaster('ratio', event.target.value)}
                                            placeholder="1/144"
                                            className={inputClass}
                                        />
                                        <datalist id="ratio-suggestions">
                                            {masterSuggestions.ratio.map((val) => (
                                            <option key={`ratio-${val}`} value={val} />
                                            ))}
                                        </datalist>
                                        </div>

                                    </div>

                                    <div className="grid gap-4 lg:grid-cols-2">
                                        <div>
                                        <label className={labelClass}>JP Price (Yen)</label>
                                        <input
                                            type="number"
                                            value={masterForm.jpPrice}
                                            onChange={(event) => updateMasterNumber('jpPrice', event.target.value)}
                                            placeholder="0"
                                            className={numericInputClass}
                                        />
                                        </div>

                                        <div>
                                        <label className={labelClass}>PH Price (PHP)</label>
                                        <input
                                            type="number"
                                            value={masterForm.phPrice}
                                            onChange={(event) => updateMasterNumber('phPrice', event.target.value)}
                                            placeholder="0"
                                            className={numericInputClass}
                                        />
                                        </div>
                                    </div>

                                    <div className="rounded-[1.5rem] border border-white/10 p-4">
                                        <div className="mb-4 flex items-center gap-2 text-left">
                                        <Box size={14} className="text-blue-500" />
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">
                                            Box Dimensions (cm)
                                        </h4>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className={labelClass}>Length</label>
                                            <input
                                            type="number"
                                            list="box-l-suggestions"
                                            value={masterForm.boxL}
                                            onFocus={(e) => {
                                                if (e.target.value === '0') updateMasterNumber('boxL', '');
                                            }}
                                            onChange={(event) => updateMasterNumber('boxL', event.target.value)}
                                            placeholder="L"
                                            className={numericInputClass}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Width</label>
                                            <input
                                            type="number"
                                            list="box-w-suggestions"
                                            value={masterForm.boxW}
                                            onFocus={(e) => {
                                                if (e.target.value === '0') updateMasterNumber('boxW', '');
                                            }}
                                            onChange={(event) => updateMasterNumber('boxW', event.target.value)}
                                            placeholder="W"
                                            className={numericInputClass}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Height</label>
                                            <input
                                            type="number"
                                            list="box-h-suggestions"
                                            value={masterForm.boxH}
                                            onFocus={(e) => {
                                                if (e.target.value === '0') updateMasterNumber('boxH', '');
                                            }}
                                            onChange={(event) => updateMasterNumber('boxH', event.target.value)}
                                            placeholder="H"
                                            className={numericInputClass}
                                            />
                                        </div>
                                        </div>
                                        <datalist id="box-l-suggestions">
                                        {masterSuggestions.l.map((val) => (
                                            <option key={`l-${val}`} value={val} />
                                        ))}
                                        </datalist>
                                        <datalist id="box-w-suggestions">
                                        {masterSuggestions.w.map((val) => (
                                            <option key={`w-${val}`} value={val} />
                                        ))}
                                        </datalist>
                                        <datalist id="box-h-suggestions">
                                        {masterSuggestions.h.map((val) => (
                                            <option key={`h-${val}`} value={val} />
                                        ))}
                                        </datalist>
                                    </div>

                                    <div className={mutedCardClass}>
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2 text-left">
                                                    <ImageIcon size={14} className="text-blue-500" />
                                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">
                                                        Master Photos
                                                    </h4>
                                                </div>
                                                <DocumentSizeIndicator />
                                            </div>
                                            <div className="mt-4 flex items-center justify-between gap-3">
                                                <div className="flex-1"></div>
                                                <button
                                                    type="button"
                                                    onClick={() => masterImageRef.current?.click()}
                                                    className="rounded-xl bg-blue-600/15 px-3 py-2 text-blue-600 transition-all hover:bg-blue-600 hover:text-white"
                                                >
                                                    <Upload size={15} />
                                                </button>
                                            <input
                                                ref={masterImageRef}
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                className="hidden"
                                                onChange={(event) => handleFileSelect(event, 'image')}
                                            />
                                        </div>

                                        {masterForm.images?.length > 0 ? (
                                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                                {masterForm.images.map((image) => (
                                                    <div key={image.id} className="rounded-2xl border border-white/10 p-2">
                                                        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black/20">
                                                        <button
                                                            type="button"
                                                            onClick={() => setPreviewAsset({ url: image.url, label: image.type })}
                                                            className="absolute inset-0 w-full"
                                                        >
                                                            <img src={image.url} alt={image.type} className="h-full w-full object-cover" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setMasterGridImage(image.id)}
                                                            aria-pressed={Boolean(image.isGridImage)}
                                                            aria-label={image.isGridImage ? 'Product grid image selected' : 'Set as product grid image'}
                                                            title={image.isGridImage ? 'Product grid image' : 'Set as product grid image'}
                                                            className={`absolute left-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border shadow-sm transition-colors ${
                                                                image.isGridImage
                                                                    ? 'border-blue-600 bg-blue-600 text-white'
                                                                    : 'border-white/80 bg-white/90 text-neutral-800 hover:border-blue-600 hover:bg-blue-600 hover:text-white'
                                                            }`}
                                                        >
                                                            <Sparkles size={14} strokeWidth={2.5} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeMasterImage(image.id)}
                                                            aria-label="Delete master photo"
                                                            title="Delete master photo"
                                                            className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/80 bg-white/90 text-red-500 shadow-sm transition-colors hover:border-red-500 hover:bg-red-500 hover:text-white"
                                                        >
                                                            <X size={14} strokeWidth={3} />
                                                        </button>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            aria-pressed={image.type === 'BOX ART'}
                                                            onClick={() => updateMasterImageType(
                                                                image.id,
                                                                image.type === 'BOX ART' ? 'PROMO IMAGE' : 'BOX ART'
                                                            )}
                                                            className={`mt-2 flex h-9 w-full items-center justify-center rounded-xl border px-2 text-[10px] font-black uppercase tracking-widest leading-none outline-none transition-colors ${
                                                                image.type === 'BOX ART'
                                                                    ? 'border-blue-600 bg-blue-600 text-white'
                                                                    : `${inputClass} hover:border-blue-500 hover:text-blue-600`
                                                            }`}
                                                        >
                                                            {image.type === 'BOX ART' ? 'BOX ART' : 'PROMO IMAGE'}
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center">
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-45">
                                                    No master photos uploaded
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                  </>
                                )}
                                </section>
                            </div>

                            {!canEditStockSection && (
                                <div className={`${cardClass} self-start space-y-4`}>
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 text-left">
                                            <History size={15} className="text-emerald-500" />
                                            <div>
                                                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-600">
                                                    Variant Details
                                                </h3>
                                                <p className="mt-1 text-[11px] opacity-60">
                                                    Onhand variants are listed first, followed by ETA batch.
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={startNewStockEntry}
                                            className="rounded-xl bg-emerald-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/20"
                                        >
                                            Add Stock
                                        </button>
                                    </div>

                                    {stockHistory.length > 0 ? (
                                        <div className="grid gap-3">
                                            {stockHistory.map((stockItem, index) => {
                                                const normalizedStatus = normalizeStockStatus(stockItem.status);
                                                const legacyConditions = extractLegacyConditions(stockItem);
                                                const isActive = editingStockKey === stockItem.key;

                                                return (
                                                    <article
                                                        key={stockItem.key || `${stockItem.status}-${stockItem.eta}-${index}`}
                                                        className={`space-y-3 rounded-[1.25rem] border p-4 transition-all ${
                                                            isActive
                                                                ? 'border-amber-500 bg-amber-500/10'
                                                                : isDarkMode
                                                                    ? 'border-white/10 bg-white/5'
                                                                    : 'border-black/10 bg-neutral-50'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                                                                <span
                                                                    className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${
                                                                        normalizedStatus === 'Onhand'
                                                                            ? 'bg-blue-600 text-white'
                                                                            : 'bg-emerald-600 text-white'
                                                                    }`}
                                                                >
                                                                    {normalizedStatus}
                                                                </span>
                                                                <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.14em] opacity-55">
                                                                    {stockItem.isReserved || stockItem.order?.orderId
                                                                        ? 'Reserved'
                                                                        : (normalizedStatus === 'Onhand' ? 'Available' : stockItem.eta || 'TBA')}
                                                                </span>
                                                            </div>
                                                            <div className="flex shrink-0 items-center gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleEditStock(stockItem)}
                                                                className="rounded-xl border border-white/10 p-2 opacity-70 transition-all hover:border-amber-500 hover:text-amber-500 hover:opacity-100"
                                                                title="Edit variant"
                                                            >
                                                                <Tag size={14} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDuplicateStock(stockItem)}
                                                                className="rounded-xl border border-white/10 p-2 opacity-70 transition-all hover:border-blue-500 hover:text-blue-500 hover:opacity-100"
                                                                title="Duplicate variant"
                                                            >
                                                                <Copy size={14} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => onDeleteStock(stockItem)}
                                                                className="rounded-xl border border-white/10 p-2 opacity-70 transition-all hover:border-red-500 hover:text-red-500 hover:opacity-100"
                                                                title="Delete variant"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-2 text-left text-[10px] font-bold uppercase tracking-widest opacity-65">
                                                            <p className="min-w-0 truncate">Cost: PHP {Number(stockItem.costPrice || 0).toLocaleString()}</p>
                                                            <p className="min-w-0 truncate">DP: PHP {Number(stockItem.minDownpayment || 0).toLocaleString()}</p>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-2 text-left text-[10px] font-bold uppercase tracking-widest opacity-65">
                                                            <p className="min-w-0 truncate">Box: {stockItem.boxCondition || legacyConditions.boxCondition || 'N/A'}</p>
                                                            <p className="min-w-0 truncate">Kit: {stockItem.kitCondition || legacyConditions.kitCondition || 'N/A'}</p>
                                                        </div>

                                                        <div className="flex items-center gap-3">
                                                            <p className="text-lg font-black italic text-emerald-600">
                                                                PHP {Number(stockItem.sellPrice || 0).toLocaleString()}
                                                            </p>
                                                        </div>
                                                    </article>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className={mutedCardClass}>
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">
                                                No variants yet
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {canEditStockSection && (
                            <div className={`${cardClass} self-start space-y-6`}>
                                <div className="space-y-6">
                                    <section className="space-y-4">
                                        <div className="flex items-start justify-between gap-4">
                                        <div className="text-left">
                                            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-600">
                                            2. Stock Entry
                                            </h3>
                                            <p className="mt-1 text-[11px] opacity-60">
                                            Leave this section mostly blank if you only want to update master details.
                                            </p>
                                            <p
                                            className={`mt-2 text-[10px] font-black uppercase tracking-[0.2em] ${
                                                editingStockKey ? 'text-amber-500' : 'text-emerald-500'
                                            }`}
                                            >
                                            {editingStockKey
                                                ? `Editing existing stock: ${editingStockKey}`
                                                : selectedExistingKit
                                                ? 'Select a batch to edit or start a new stock entry'
                                                : 'Creating a new stock entry'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={cancelEditStock}
                                            className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                                            stockMode === 'edit' ? 'border-amber-500 text-amber-500' : 'border-emerald-500 text-emerald-500'
                                            }`}
                                        >
                                            Cancel
                                        </button>
                                        </div>

                                        <>
                                            <div className="grid gap-4 lg:grid-cols-2">
                                            <div>
                                                <label className={labelClass}>Availability</label>
                                                <div className="grid grid-cols-2 gap-2">
                                                {['Onhand', 'Pre-Order'].map((status) => (
                                                    <button
                                                    key={status}
                                                    onClick={() => handleStatusChange(status)}
                                                    className={`rounded-2xl border px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                                                        stockForm.status === status
                                                        ? 'border-emerald-600 bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                                                        : isDarkMode
                                                            ? 'border-white/10 bg-white/5'
                                                            : 'border-black/10 bg-neutral-50'
                                                    }`}
                                                    >
                                                    {status}
                                                    </button>
                                                ))}
                                                </div>
                                            </div>

                                            <div>
                                                <label className={labelClass}>Delivery Month</label>
                                                <input
                                                value={stockForm.deliveryMonth}
                                                onChange={(event) => handleDeliveryMonthChange(event.target.value)}
                                                onBlur={handleDeliveryMonthBlur}
                                                placeholder={stockForm.status === 'Onhand' ? 'AVAILABLE' : 'AUG 2026'}
                                                className={inputClass}
                                                disabled={stockForm.status === 'Onhand'}
                                                />
                                            </div>

                                            <div>
                                                <label className={labelClass}>Cost Price</label>
                                                <input
                                                type="number"
                                                value={stockForm.costPrice}
                                                onChange={(event) => handleCostPriceChange(event.target.value)}
                                                className={numericInputClass}
                                                />
                                            </div>

                                            <div>
                                                <label className={labelClass}>Paid To Supplier</label>
                                                <input
                                                type="number"
                                                value={stockForm.paidToSupplier}
                                                onChange={(event) => updateStockNumber('paidToSupplier', event.target.value)}
                                                className={numericInputClass}
                                                readOnly={stockForm.status === 'Onhand'}
                                                />
                                            </div>

                                            <div className="relative">
                                                <label className={labelClass}>Sell Price</label>
                                                <input
                                                type="number"
                                                value={stockForm.sellPrice}
                                                onChange={(event) => handleSellPriceChange(event.target.value)}
                                                className={`${numericInputClass} ${isSellPriceInvalid ? 'border-red-500 bg-red-500/10' : ''}`}
                                                />
                                                {isSellPriceInvalid && (
                                                <div className="absolute right-4 top-[38px] text-red-500">
                                                    <HandCoins size={14} />
                                                </div>
                                                )}
                                            </div>

                                            <div>
                                                <label className={labelClass}>Minimum Downpayment</label>
                                                <input
                                                type="number"
                                                value={stockForm.minDownpayment}
                                                onChange={(event) => updateStockNumber('minDownpayment', event.target.value)}
                                                className={numericInputClass}
                                                />
                                            </div>

                                            <div>
                                                <label className={labelClass}>Box Condition</label>
                                                <input
                                                list="box-condition-suggestions"
                                                value={stockForm.boxCondition}
                                                onChange={(event) => updateStockCondition('boxCondition', event.target.value)}
                                                className={inputClass}
                                                placeholder="PRISTINE"
                                                />
                                            </div>

                                            <div>
                                                <label className={labelClass}>Kit Condition</label>
                                                <input
                                                list="kit-condition-suggestions"
                                                value={stockForm.kitCondition}
                                                onChange={(event) => updateStockCondition('kitCondition', event.target.value)}
                                                className={inputClass}
                                                placeholder="BRAND NEW"
                                                />
                                            </div>
                                            <div className="lg:col-span-2">
                                                <label className={labelClass}>Issue Description</label>
                                                <textarea
                                                  rows={2}
                                                  value={stockForm.issueDescription}
                                                  onChange={(event) => updateStock('issueDescription', event.target.value)}
                                                  placeholder="Describe issues like: Dented corner, torn plastic seal, missing runner part..."
                                                  className={`${inputClass} resize-none overflow-hidden py-2`}
                                                />
                                              </div>
                                            </div>

                                            <div>
                                              <label className={`${labelClass} flex items-center gap-2`}>
                                                  <Calendar size={12} />
                                                  Public Release Date
                                              </label>
                                              <CustomDateTimePicker
                                                  value={stockForm.publicReleaseDate}
                                                  onChange={(nextValue) => updateStock('publicReleaseDate', nextValue)}
                                                  min={getLocalDatetime()}
                                                  isDarkMode={isDarkMode}
                                                  placeholder="Select public release"
                                                  renderInline
                                                  align="right"
                                              />
                                            </div>
                                            <datalist id="box-condition-suggestions">
                                            {boxConditionSuggestions.map((condition) => (
                                                <option key={`box-${condition}`} value={condition} />
                                            ))}
                                            </datalist>
                                            <datalist id="kit-condition-suggestions">
                                            {kitConditionSuggestions.map((condition) => (
                                                <option key={`kit-${condition}`} value={condition} />
                                            ))}
                                            </datalist>

<div className="mt-6 border-t border-white/10 pt-6">
    {/* ^ BINAGO: Idinagdag ang pb-52 para magkaroon ng malaking puwang sa ilalim ng buong Shipping Promo section. 
        Ito ang magtutulak sa pinakailalim ng modal card pababa para may sapat na silid ang calendar popup kapag bumukas ito nang hindi lumulubog sa screen layout niyo. */}
    
    <div className="mb-4 flex items-center gap-2 text-left">
        <Truck size={14} className="text-emerald-500" />
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">
            Shipping Promo
        </h4>
    </div>

    {/* Main Controls Row */}
    <div className="grid w-full gap-4 lg:grid-cols-2">
        <button
            type="button"
            onClick={() =>
                stockForm.status === 'Pre-Order' &&
                updateStock('isFreeShippingEligible', !stockForm.isFreeShippingEligible)
            }
            className={`rounded-2xl border px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                stockForm.isFreeShippingEligible
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                    : isDarkMode
                        ? 'border-white/10 bg-white/5'
                        : 'border-black/10 bg-neutral-50'
            } ${stockForm.status !== 'Pre-Order' ? 'cursor-not-allowed opacity-40' : ''}`}
        >
            {stockForm.isFreeShippingEligible ? 'Free Shipping On' : 'Free Shipping Off'}
        </button>

        <CustomDateTimePicker
            value={stockForm.freeShippingUntil}
            onChange={(nextValue) => updateStock('freeShippingUntil', nextValue)}
            min={getLocalDatetime()}
            isDarkMode={isDarkMode}
            placeholder="Select promo expiry"
            disabled={!stockForm.isFreeShippingEligible || stockForm.status !== 'Pre-Order'}
            renderInline
            align="right"
        />
    </div>                              {/* COURIER FIELD */}
                              {stockForm.isFreeShippingEligible && stockForm.status === 'Pre-Order' && (
                                  <div className="mt-4 w-full grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
                                      
                                      {/* Dropdown para sa Shipping Method */}
                                      <div className="relative w-full">
                                          <select
                                              value={stockForm.freeShippingMethod || ''}
                                              onChange={(e) => {
                                                  const method = e.target.value;
                                                  updateStock('freeShippingMethod', method);
                                                  
                                                  // Awtomatikong piliin ang standard delivery suboption
                                                  let subKey = 'All';
                                                  if (method) {
                                                    const methodConfig = shippingMethods?.[method];
                                                    if (methodConfig?.suboptions) {
                                                      const subEntries = Object.entries(methodConfig.suboptions);
                                                      const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                                                      const findSubKey = (predicate) => subEntries.find(([key, config]) => predicate(normalize(key), normalize(config?.label)))?.[0];
                                                      subKey =
                                                        findSubKey((key, label) => key === 'standarddelivery' || key === 'standard' || label === 'standarddelivery') ||
                                                        findSubKey((key, label) => key === 'delivery' || (label.includes('standard') && label.includes('delivery'))) ||
                                                        findSubKey((key, label) => key === 'cop' || key.includes('cashonpickup') || label.includes('cashonpickup')) ||
                                                        findSubKey((key, label) => key === 'seller' || key.includes('sellerbooking') || label.includes('sellerbooking')) ||
                                                        findSubKey((key, label) => key !== 'cod' && !key.includes('cashondelivery') && !label.includes('cashondelivery')) ||
                                                        subEntries[0]?.[0] ||
                                                        'standard-delivery';
                                                    } else {
                                                      subKey = 'standard-delivery';
                                                    }
                                                  }
                                                  updateStock('freeShippingSuboption', subKey);
                                              }}
                                              disabled={!stockForm.isFreeShippingEligible}
                                              className={`w-full appearance-none rounded-2xl border px-4 py-3 text-xs font-bold transition-all outline-none ${
                                                  isDarkMode
                                                      ? 'border-white/10 bg-white/5 text-white focus:border-white/20 focus:bg-white/10'
                                                      : 'border-black/10 bg-neutral-50 text-neutral-900 focus:border-black/20 focus:bg-neutral-100'
                                              } disabled:cursor-not-allowed disabled:opacity-50 pr-14`}
                                          >
                                              <option value="" className={isDarkMode ? "bg-neutral-900 text-white/40" : "bg-white text-black/40"}>
                                                  {stockForm.freeShippingMethod ? '-- SELECT COURIER --' : 'Select courier'}
                                              </option>
                                              {Object.entries(shippingMethods || {})
                                                  .filter(([methodKey, config]) => config && !['Seller Meetup', 'Self-Pickup', 'Free Shipping'].includes(methodKey))
                                                  .map(([methodKey, config]) => (
                                                      <option 
                                                          key={methodKey} 
                                                          value={methodKey} 
                                                          className={isDarkMode ? "bg-neutral-900 text-white" : "bg-white text-black"}
                                                      >
                                                          {config.courierName || methodKey.toUpperCase()}
                                                      </option>
                                                  ))
                                              }
                                          </select>
                                          <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                              <Truck size={14} className="opacity-50" />
                                              <ChevronRight size={14} className="rotate-90 transform opacity-70" />
                                          </div>
                                      </div>

                                  </div>
                              )}
                          </div>

                                            <div className={mutedCardClass}>
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2 text-left">
                                                <ImageIcon size={14} className="text-emerald-500" />
                                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">
                                                    Actual Stock Photos
                                                </h4>
                                                </div>
                                                <DocumentSizeIndicator />
                                            </div>
                                            <div className="mt-4 flex items-center justify-between gap-3">
                                                <div className="flex-1"></div>
                                                <button
                                                type="button"
                                                onClick={() => stockImageRef.current?.click()}
                                                className="rounded-xl bg-emerald-600/15 px-3 py-2 text-emerald-600 transition-all hover:bg-emerald-600 hover:text-white"
                                                >
                                                <Upload size={15} />
                                                </button>
                                                <input
                                                ref={stockImageRef}
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                className="hidden"
                                                onChange={(event) => handleFileSelect(event, 'stockImage')}
                                                />
                                            </div>

                                            {stockForm.stockImages?.length > 0 ? (
                                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                                {stockForm.stockImages.map((image) => (
                                                    <div key={image.id} className="rounded-2xl border border-white/10 p-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreviewAsset({ url: image.url, label: image.type })}
                                                        className="aspect-square w-full overflow-hidden rounded-xl bg-black/20"
                                                    >
                                                        <img src={image.url} alt={image.type} className="h-full w-full object-cover" />
                                                    </button>
                                                    <select
                                                        value={image.type}
                                                        onChange={(event) => updateStockImageType(image.id, event.target.value)}
                                                        className={`mt-2 w-full rounded-xl border px-2 py-2 text-[9px] font-black uppercase outline-none ${inputClass}`}
                                                    >
                                                        {STOCK_IMAGE_TYPES.map((type) => (
                                                        <option key={type} value={type}>
                                                            {type}
                                                        </option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeStockImage(image.id)}
                                                        className="mt-2 flex w-full items-center justify-center rounded-xl border border-white/10 px-2 py-2 text-red-500 opacity-70 transition-all hover:opacity-100"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                    </div>
                                                ))}
                                                </div>
                                            ) : (
                                                <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center">
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-45">
                                                    No stock photos uploaded
                                                </p>
                                                </div>
                                            )}
                                            </div>
                                        </>
                                    </section>
                                </div>
                            </div>
                            )}
                            </div>
                            )}

                            {previewAsset && (
                              <div
                                className="fixed inset-0 z-[800] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
                                onClick={() => setPreviewAsset(null)}
                              >
                                <div className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[2rem] bg-black">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewAsset(null)}
                                    className="absolute right-4 top-4 z-10 rounded-full bg-white/15 p-2 text-white transition-all hover:bg-white/25"
                                  >
                                    <X size={20} />
                                  </button>
                                  <img
                                    src={previewAsset.url}
                                    alt={previewAsset.label}
                                    className="max-h-[90vh] w-full object-contain"
                                  />
                                </div>
                              </div>
                            )}
                        </>
                  )}
                </div>
            </div>

        </div>
      </div>
)}
