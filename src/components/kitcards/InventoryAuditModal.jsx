import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  PackageSearch,
  RefreshCw,
  ShieldCheck,
  X
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useTheme } from '../../context/ThemeContext';
import { useStore } from '../../store/useStore';
import { withInventoryConditionDefaults } from '../../utils/stockConditions';

function resolveImage(idOrUrl, images = []) {
  if (!idOrUrl) return '';
  if (idOrUrl.startsWith('data:') || idOrUrl.startsWith('http')) return idOrUrl;
  return images.find((image) => image?.id === idOrUrl)?.url || '';
}

function directImage(value) {
  return value?.startsWith('data:') || value?.startsWith('http') ? value : '';
}

function getDisplayImage(kit, stock) {
  const stockImages = Array.isArray(stock?.stockImages) ? stock.stockImages : [];
  const kitImages = Array.isArray(kit?.images) ? kit.images : [];
  return resolveImage(stock?.boxImage, stockImages)
    || resolveImage(stock?.kitImage, stockImages)
    || resolveImage(kit?.image, kitImages)
    || directImage(stock?.boxImage)
    || directImage(stock?.kitImage)
    || directImage(kit?.image)
    || '';
}

function getConditionValue(stock, field, index) {
  if (stock?.[field]) return stock[field];
  if (Array.isArray(stock?.condition)) return stock.condition[index] || '';
  if (field === 'boxCondition' && typeof stock?.condition === 'string') return stock.condition;
  return '';
}

function buildAuditRows(kits, issues) {
  const rows = new Map();
  const getRow = (kit, stockKey) => {
    const id = `stock:${kit.id}:${stockKey}`;
    if (!rows.has(id)) {
      const stock = kit.stocks?.[stockKey] || {};
      rows.set(id, {
        id,
        kit,
        stock,
        stockKey,
        issues: [],
        conditionFix: null
      });
    }
    return rows.get(id);
  };

  issues.forEach((issue) => {
    const kit = kits.find((candidate) => candidate.id === issue.kitId);
    if (!kit?.stocks?.[issue.stockKey]) return;
    getRow(kit, issue.stockKey).issues.push(issue);
  });

  kits.forEach((kit) => {
    Object.entries(kit.stocks || {}).forEach(([stockKey, stock]) => {
      const nextStock = withInventoryConditionDefaults(stock, kit);
      const boxChanged = nextStock.boxCondition && nextStock.boxCondition !== stock.boxCondition;
      const kitChanged = nextStock.kitCondition && nextStock.kitCondition !== stock.kitCondition;
      if (!boxChanged && !kitChanged) return;

      const row = getRow(kit, stockKey);
      row.conditionFix = {
        kitId: kit.id,
        stockKey,
        boxCondition: boxChanged ? nextStock.boxCondition : '',
        kitCondition: kitChanged ? nextStock.kitCondition : ''
      };
    });
  });

  return Array.from(rows.values()).sort((a, b) => (
    String(a.kit?.name || '').localeCompare(String(b.kit?.name || ''))
    || String(a.stockKey).localeCompare(String(b.stockKey))
  ));
}

function conditionLabel(value) {
  return value || 'EMPTY';
}

function InventoryStockRow({ row, selected, onToggle, isDarkMode }) {
  const { kit, stock, stockKey, issues, conditionFix } = row;
  const image = getDisplayImage(kit, stock);
  const currentBox = getConditionValue(stock, 'boxCondition', 0);
  const currentKit = getConditionValue(stock, 'kitCondition', 1);
  const nextBox = conditionFix?.boxCondition || currentBox;
  const nextKit = conditionFix?.kitCondition || currentKit;
  const status = stock.status || 'Unknown';
  const issueLabels = [
    ...issues.map((issue) => issue.reason),
    ...(conditionFix ? ['Condition defaults'] : [])
  ];

  return (
    <div className={`rounded-[1.5rem] border p-3 sm:p-4 transition-all ${selected
      ? isDarkMode ? 'border-blue-500/50 bg-blue-500/10' : 'border-blue-500/30 bg-blue-50/70'
      : isDarkMode ? 'border-white/10 bg-white/[0.03] opacity-55' : 'border-black/10 bg-neutral-50 opacity-60'}`}>
      <div className="flex items-start gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => onToggle(row.id)}
          aria-label={`${selected ? 'Exclude' : 'Include'} ${kit.name || 'stock'}`}
          className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition-all ${selected
            ? 'border-blue-500 bg-blue-500 text-white'
            : isDarkMode ? 'border-white/20 text-transparent' : 'border-black/20 text-transparent'}`}
        >
          <Check size={15} strokeWidth={3} />
        </button>

        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-black/10 bg-white dark:border-white/10 dark:bg-black/20 sm:h-24 sm:w-24">
          {image ? (
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-blue-500/40"><ImageIcon size={28} /></div>
          )}
          <span className="absolute bottom-1 left-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-white">
            {status}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-black uppercase tracking-tight text-neutral-900 dark:text-white" title={kit.name}>
                {kit.name || kit.id}
              </h3>
              <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.15em] text-blue-600 dark:text-blue-400">
                {kit.brand || 'Unknown brand'} · {kit.specs?.line || 'No line'} · {kit.specs?.scale || 'No scale'}
              </p>
            </div>
            <span className={`rounded-full px-2 py-1 text-[8px] font-black uppercase tracking-widest ${selected ? 'bg-blue-500 text-white' : 'bg-neutral-300 text-neutral-600 dark:bg-white/10 dark:text-white/40'}`}>
              {selected ? 'Queued' : 'Excluded'}
            </span>
          </div>

          <div className="mt-3 grid gap-2 text-[9px] font-bold uppercase tracking-wider sm:grid-cols-2">
            <div className="rounded-xl bg-black/[0.04] p-2 dark:bg-white/[0.05]">
              <span className="block opacity-40">Stock Details</span>
              <span className="mt-1 block truncate">{stockKey}</span>
              <span className="mt-1 block opacity-65">ETA: {stock.eta || 'NONE'} · {stock.isReserved ? 'RESERVED' : 'AVAILABLE'}</span>
              <span className="mt-1 block opacity-65">COST: ₱{Number(stock.costPrice || 0).toLocaleString()} · SELL: ₱{Number(stock.sellPrice || 0).toLocaleString()}</span>
              {stock.order?.orderId && <span className="mt-1 block text-red-500">ORDER: {stock.order.orderId}</span>}
            </div>
            <div className="rounded-xl bg-black/[0.04] p-2 dark:bg-white/[0.05]">
              <span className="block opacity-40">Conditions</span>
              <span className="mt-1 block">BOX: {conditionLabel(currentBox)}</span>
              <span className="mt-1 block">KIT: {conditionLabel(currentKit)}</span>
            </div>
          </div>

          {(conditionFix || issues.length > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {issueLabels.map((label, index) => (
                <span key={`${label}-${index}`} className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-300">
                  {label}
                </span>
              ))}
              {conditionFix && (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
                  After: BOX {conditionLabel(nextBox)} · KIT {conditionLabel(nextKit)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InventoryKitMigrationRow({ migration, type, selected, onToggle, isDarkMode }) {
  const isId = type === 'id';
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-3 transition-all ${selected
      ? isDarkMode ? 'border-violet-500/40 bg-violet-500/10' : 'border-violet-500/30 bg-violet-50'
      : isDarkMode ? 'border-white/10 bg-white/[0.03] opacity-55' : 'border-black/10 bg-neutral-50 opacity-60'}`}>
      <button
        type="button"
        onClick={() => onToggle(migration._auditId)}
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${selected ? 'border-violet-500 bg-violet-500 text-white' : 'border-black/20 text-transparent dark:border-white/20'}`}
        aria-label={`${selected ? 'Exclude' : 'Include'} ${migration.kitName}`}
      >
        <Check size={15} strokeWidth={3} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap justify-between gap-2">
          <p className="truncate text-xs font-black uppercase tracking-tight">{migration.kitName || migration.oldId || migration.kitId}</p>
          <span className="text-[8px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-300">{selected ? 'Queued' : 'Excluded'}</span>
        </div>
        <p className="mt-1 text-[9px] font-bold uppercase tracking-wider opacity-55">
          {isId ? `${migration.oldId} → ${migration.newId}` : `Legacy scale → ${migration.specs?.line || '—'} · ${migration.specs?.scale || '—'}`}
        </p>
      </div>
    </div>
  );
}

export default function InventoryAuditModal({ isOpen, onClose, embedded = false }) {
  const { isDarkMode } = useTheme();
  const {
    loadOrdersOnce,
    findMisalignedStocks,
    findKitScaleMigrations,
    findKitIdMismatches,
    fixMisalignedStocks,
    applyInventoryConditionFixes,
    migrateKitScaleToSpecs,
    fixKitIdMismatches,
    setInventoryAuditOpen
  } = useStore();
  const [isScanning, setIsScanning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [scanError, setScanError] = useState('');
  const [stockRows, setStockRows] = useState([]);
  const [scaleMigrations, setScaleMigrations] = useState([]);
  const [idMismatches, setIdMismatches] = useState([]);
  const [selectedStockIds, setSelectedStockIds] = useState(new Set());
  const [selectedMigrationIds, setSelectedMigrationIds] = useState(new Set());

  const closeModal = () => {
    setInventoryAuditOpen(false);
    onClose();
  };

  const scanInventory = useCallback(async () => {
    setIsScanning(true);
    setScanError('');
    try {
      const snap = await getDocs(collection(db, 'kits'));
      const kits = snap.docs.map((kitDoc) => ({ id: kitDoc.id, ...kitDoc.data() }));
      if (!useStore.getState().orders?.length) await loadOrdersOnce();
      const latestOrders = useStore.getState().orders || [];
      const issues = findMisalignedStocks(kits, latestOrders);
      const migrations = findKitScaleMigrations(kits).map((item) => ({ ...item, _auditId: `scale:${item.kitId}` }));
      const mismatches = findKitIdMismatches(kits).map((item) => ({ ...item, _auditId: `id:${item.oldId}` }));
      const rows = buildAuditRows(kits, issues);

      setStockRows(rows);
      setScaleMigrations(migrations);
      setIdMismatches(mismatches);
      setSelectedStockIds(new Set(rows.map((row) => row.id)));
      setSelectedMigrationIds(new Set([...migrations, ...mismatches].map((item) => item._auditId)));
    } catch (error) {
      console.error('Inventory scan failed:', error);
      setScanError(error?.message || 'Unable to scan inventory.');
      setStockRows([]);
      setScaleMigrations([]);
      setIdMismatches([]);
      setSelectedStockIds(new Set());
      setSelectedMigrationIds(new Set());
    } finally {
      setIsScanning(false);
    }
  }, [findKitIdMismatches, findKitScaleMigrations, findMisalignedStocks, loadOrdersOnce]);

  useEffect(() => {
    if (isOpen) scanInventory();
  }, [isOpen, scanInventory]);

  const allMigrationItems = useMemo(() => [...scaleMigrations, ...idMismatches], [idMismatches, scaleMigrations]);
  const totalFixes = stockRows.length + allMigrationItems.length;
  const selectedCount = selectedStockIds.size + selectedMigrationIds.size;
  const allSelected = totalFixes > 0 && selectedCount === totalFixes;

  const toggleStock = (id) => {
    setSelectedStockIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleMigration = (id) => {
    setSelectedMigrationIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedStockIds(new Set());
      setSelectedMigrationIds(new Set());
    } else {
      setSelectedStockIds(new Set(stockRows.map((row) => row.id)));
      setSelectedMigrationIds(new Set(allMigrationItems.map((item) => item._auditId)));
    }
  };

  const applySelectedFixes = async () => {
    const selectedRows = stockRows.filter((row) => selectedStockIds.has(row.id));
    const selectedIssues = selectedRows.flatMap((row) => row.issues);
    const selectedConditionFixes = selectedRows.map((row) => row.conditionFix).filter(Boolean);
    const selectedScales = scaleMigrations.filter((item) => selectedMigrationIds.has(item._auditId));
    const selectedIds = idMismatches.filter((item) => selectedMigrationIds.has(item._auditId));

    if (!selectedRows.length && !selectedScales.length && !selectedIds.length) return;

    setIsApplying(true);
    try {
      if (selectedIssues.length) await fixMisalignedStocks(selectedIssues);
      if (selectedConditionFixes.length) await applyInventoryConditionFixes(selectedConditionFixes);
      if (selectedScales.length) await migrateKitScaleToSpecs(selectedScales);
      if (selectedIds.length) await fixKitIdMismatches(selectedIds);
      alert(`Applied ${selectedRows.length + selectedScales.length + selectedIds.length} selected inventory fix${selectedRows.length + selectedScales.length + selectedIds.length === 1 ? '' : 'es'}.`);
      closeModal();
    } catch (error) {
      console.error('Inventory fixes failed:', error);
      alert('Some inventory fixes could not be applied. Check the console for details.');
    } finally {
      setIsApplying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`${embedded ? 'flex h-full min-h-0 w-full' : 'pointer-events-none fixed inset-0 z-[260] flex items-start justify-center'}`} role="dialog" aria-modal="true" aria-label="Inventory audit">
      <div className={`pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden ${embedded ? 'h-full' : 'mt-[56px] h-[calc(100dvh-56px)] max-w-7xl border-x border-t shadow-2xl sm:mt-[60px] sm:h-[calc(100dvh-60px)]'} ${isDarkMode ? 'bg-[#0a0a0a] text-white' : 'bg-neutral-50 text-neutral-900'}`}>
        {!embedded && (
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-black/10 px-4 py-4 dark:border-white/10 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 text-white shadow-lg shadow-blue-500/20">
              <PackageSearch size={23} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">Admin tools · Kits</p>
              <h2 className="truncate text-lg font-black uppercase italic tracking-tight sm:text-2xl">Inventory Check Queue</h2>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={scanInventory} disabled={isScanning || isApplying} className="flex items-center gap-2 rounded-full border border-black/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest transition hover:border-blue-500 hover:text-blue-500 disabled:opacity-40 dark:border-white/10">
              <RefreshCw size={14} className={isScanning ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Rescan</span>
            </button>
            <button type="button" onClick={closeModal} disabled={isApplying} className="rounded-full border border-black/10 p-2 transition hover:border-red-500 hover:text-red-500 disabled:opacity-40 dark:border-white/10" aria-label="Close inventory check">
              <X size={19} />
            </button>
          </div>
        </header>
        )}

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10 sm:px-7">
          <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-widest">
            <span className="rounded-full bg-blue-500/10 px-3 py-1.5 text-blue-600 dark:text-blue-300">{stockRows.length} stock queue</span>
            <span className="rounded-full bg-violet-500/10 px-3 py-1.5 text-violet-600 dark:text-violet-300">{allMigrationItems.length} kit migrations</span>
            <span className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-emerald-600 dark:text-emerald-300">{selectedCount} selected</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {embedded && (
              <button type="button" onClick={closeModal} disabled={isApplying} className="rounded-full border border-black/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition hover:border-blue-500 hover:text-blue-500 disabled:opacity-40 dark:border-white/10">
                Back to Add Kit
              </button>
            )}
            <button type="button" onClick={toggleAll} disabled={isScanning || isApplying || totalFixes === 0} className="rounded-full border border-black/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition hover:border-blue-500 hover:text-blue-500 disabled:opacity-40 dark:border-white/10">
              {allSelected ? 'Exclude All' : 'Select All'}
            </button>
          </div>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
          {isScanning ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 opacity-60">
              <Loader2 size={38} className="animate-spin text-blue-500" />
              <p className="text-[10px] font-black uppercase tracking-[0.25em]">Scanning full inventory...</p>
            </div>
          ) : scanError ? (
            <div className="mx-auto flex max-w-xl flex-col items-center justify-center gap-4 py-20 text-center">
              <AlertTriangle size={38} className="text-red-500" />
              <p className="text-sm font-black uppercase">Inventory scan failed</p>
              <p className="text-xs opacity-60">{scanError}</p>
              <button type="button" onClick={scanInventory} className="rounded-full bg-blue-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white">Try Again</button>
            </div>
          ) : totalFixes === 0 ? (
            <div className="flex min-h-[45vh] flex-col items-center justify-center gap-4 text-center opacity-60">
              <CheckCircle2 size={54} className="text-emerald-500" />
              <p className="text-sm font-black uppercase tracking-widest">Inventory is clean</p>
              <p className="max-w-md text-xs opacity-70">No stock repairs, condition defaults, scale migrations, or ID mismatches were found.</p>
            </div>
          ) : (
            <div className="mx-auto max-w-[1500px] space-y-7">
              {stockRows.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-[0.2em]">Stock update queue</h3>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wider opacity-45">Review each actual stock before applying repairs.</p>
                    </div>
                    <ShieldCheck size={19} className="text-blue-500" />
                  </div>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {stockRows.map((row) => (
                      <InventoryStockRow key={row.id} row={row} selected={selectedStockIds.has(row.id)} onToggle={toggleStock} isDarkMode={isDarkMode} />
                    ))}
                  </div>
                </section>
              )}

              {allMigrationItems.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-[0.2em]">Kit metadata queue</h3>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wider opacity-45">These changes update kit metadata rather than individual stock fields.</p>
                    </div>
                    <AlertTriangle size={19} className="text-violet-500" />
                  </div>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {scaleMigrations.map((migration) => (
                      <InventoryKitMigrationRow key={migration._auditId} migration={migration} type="scale" selected={selectedMigrationIds.has(migration._auditId)} onToggle={toggleMigration} isDarkMode={isDarkMode} />
                    ))}
                    {idMismatches.map((migration) => (
                      <InventoryKitMigrationRow key={migration._auditId} migration={migration} type="id" selected={selectedMigrationIds.has(migration._auditId)} onToggle={toggleMigration} isDarkMode={isDarkMode} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </main>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-black/10 px-4 py-4 dark:border-white/10 sm:px-7">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest opacity-50">
            <AlertTriangle size={14} />
            Excluded rows will not be updated.
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button type="button" onClick={closeModal} disabled={isApplying} className="flex-1 rounded-full border border-black/10 px-5 py-3 text-[10px] font-black uppercase tracking-widest transition hover:border-red-500 hover:text-red-500 disabled:opacity-40 dark:border-white/10 sm:flex-none">Cancel</button>
            <button type="button" onClick={applySelectedFixes} disabled={isScanning || isApplying || selectedCount === 0} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-500/20 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none">
              {isApplying ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
              {isApplying ? 'Applying...' : `Apply ${selectedCount} Fix${selectedCount === 1 ? '' : 'es'}`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
