import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Save, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useStore } from '../../store/useStore';

function getLegacyConditions(stock) {
  if (Array.isArray(stock?.condition)) {
    return {
      boxCondition: stock.condition[0] || '',
      kitCondition: stock.condition[1] || ''
    };
  }

  return {
    boxCondition: typeof stock?.condition === 'string' ? stock.condition : '',
    kitCondition: ''
  };
}

function getCondition(stock, field) {
  const legacy = getLegacyConditions(stock);
  return String(stock?.[field] || legacy[field] || '');
}

function isAvailableStock(stock) {
  const status = String(stock?.status || '').trim().toLowerCase();
  const isOutOfStock = stock?.isOutOfStock === true || ['out of stock', 'out-of-stock', 'sold out', 'sold-out'].includes(status);
  return Boolean(stock) && !isOutOfStock && !stock?.order?.orderId && !stock?.isReserved;
}

function resolveKitImage(kit) {
  if (!kit?.image) return '';
  if (kit.image.startsWith('data:') || kit.image.startsWith('http')) return kit.image;
  return (kit.images || []).find((image) => image?.id === kit.image)?.url || '';
}

function getMissingMasterFields(kit) {
  return [
    !String(kit?.brand || '').trim() && 'brand',
    !String(kit?.specs?.scale || '').trim() && 'scale',
    !String(kit?.specs?.line || '').trim() && 'line',
    !String(kit?.series || '').trim() && 'series'
  ].filter(Boolean);
}

function getRows(kits) {
  return (kits || []).map((kit) => {
    const stockRows = Object.entries(kit?.stocks || {})
      .filter(([, stock]) => isAvailableStock(stock))
      .map(([key, stock], index) => ({
        key,
        index,
        stock,
        missing: [
          !getCondition(stock, 'boxCondition').trim() && 'boxCondition',
          !getCondition(stock, 'kitCondition').trim() && 'kitCondition'
        ].filter(Boolean)
      }))
      .filter((stockRow) => stockRow.missing.length > 0);

    const missingMasterFields = getMissingMasterFields(kit);
    if (missingMasterFields.length === 0 && stockRows.length === 0) return null;

    return {
      kit,
      missingMasterFields,
      stockRows,
      availableStockCount: Object.values(kit?.stocks || {}).filter(isAvailableStock).length
    };
  }).filter(Boolean);
}

function getDraft(drafts, kit) {
  const draft = drafts[kit.id];
  return draft || {
    brand: kit.brand || '',
    series: kit.series || '',
    line: kit.specs?.line || '',
    scale: kit.specs?.scale || '',
    stocks: {}
  };
}

export default function KitDataQualityModal({ isOpen, onClose, kits = [], onSave }) {
  const { isDarkMode } = useTheme();
  const sanitizeOrphanedKitStocks = useStore((state) => state.sanitizeOrphanedKitStocks);
  const setToastMessage = useStore((state) => state.setToastMessage);
  const [drafts, setDrafts] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSanitizing, setIsSanitizing] = useState(false);
  const [saveError, setSaveError] = useState('');
  const rows = useMemo(() => getRows(kits), [kits]);

  const handleSanitizeOrphanedStocks = async () => {
    if (isSanitizing) return;
    setIsSanitizing(true);
    try {
      const result = await sanitizeOrphanedKitStocks();
      if (result?.sanitizedStockCount > 0) {
        setToastMessage?.(`Repaired ${result.sanitizedStockCount} orphaned stock(s) across ${result.sanitizedKitCount} kit(s)!`);
      } else {
        setToastMessage?.('All kit stocks are in sync. No orphaned stocks found.');
      }
    } catch (err) {
      setToastMessage?.('Failed to repair orphaned stocks: ' + err.message);
    } finally {
      setIsSanitizing(false);
    }
  };

  if (!isOpen) return null;

  const handleClose = () => {
    if (isSaving) return;
    setDrafts({});
    setSaveError('');
    onClose();
  };

  const updateMasterField = (kitId, field, value) => {
    setDrafts((previous) => {
      const kit = kits.find((item) => item.id === kitId);
      const draft = getDraft(previous, kit);
      return { ...previous, [kitId]: { ...draft, [field]: value } };
    });
  };

  const updateStockField = (kitId, stockKey, field, value) => {
    setDrafts((previous) => {
      const kit = kits.find((item) => item.id === kitId);
      const draft = getDraft(previous, kit);
      return {
        ...previous,
        [kitId]: {
          ...draft,
          stocks: {
            ...draft.stocks,
            [stockKey]: {
              ...(draft.stocks?.[stockKey] || {}),
              [field]: value
            }
          }
        }
      };
    });
  };

  const handleSave = async () => {
    if (rows.length === 0 || isSaving) return;

    setSaveError('');
    setIsSaving(true);
    try {
      for (const { kit, stockRows } of rows) {
        const draft = getDraft(drafts, kit);
        const masterPayload = {
          id: kit.id,
          targetId: kit.id,
          updateMasterOnly: stockRows.length === 0,
          name: kit.name || '',
          brand: draft.brand.trim().toUpperCase(),
          series: draft.series.trim().toUpperCase(),
          specs: {
            ...(kit.specs || {}),
            line: draft.line.trim().toUpperCase(),
            scale: draft.scale.trim().toUpperCase()
          }
        };

        if (stockRows.length === 0) {
          await onSave(masterPayload);
          continue;
        }

        for (const { key, stock } of stockRows) {
          const stockDraft = draft.stocks?.[key] || {};
          await onSave({
            ...masterPayload,
            updateMasterOnly: false,
            stockUpdateKey: key,
            newStock: {
              ...stock,
              boxCondition: String(stockDraft.boxCondition ?? getCondition(stock, 'boxCondition')).trim().toUpperCase(),
              kitCondition: String(stockDraft.kitCondition ?? getCondition(stock, 'kitCondition')).trim().toUpperCase()
            }
          });
        }
      }

      setDrafts({});
      onClose();
    } catch (error) {
      console.error('SG LOG: Failed to save kit data quality updates:', error);
      setSaveError('Some changes could not be saved. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = `w-full rounded-xl border px-3 py-2 text-[11px] font-bold uppercase outline-none transition-colors focus:border-blue-500 ${isDarkMode ? 'border-white/10 bg-white/5 text-white' : 'border-black/10 bg-neutral-50 text-neutral-900'}`;
  const cardClass = isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-black/10 bg-white';
  const missingBadgeClass = isDarkMode ? 'border-amber-400/30 bg-amber-400/10 text-amber-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-700';

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 font-sans text-neutral-900 dark:text-white" role="dialog" aria-modal="true" aria-label="Fix missing kit data">
      <div className={`relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border shadow-2xl backdrop-blur-xl ${isDarkMode ? 'border-white/10 bg-[#0a0a0a]/95' : 'border-black/5 bg-white/95'}`}>
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-black/5 px-5 py-4 dark:border-white/10 md:px-6">
          <div className="min-w-0">
            <h2 className="text-[15px] font-black uppercase italic tracking-wide text-fuchsia-600">Fix Missing Kit Data</h2>
            <p className="mt-1 text-[11px] font-bold uppercase opacity-55">In-stock kits with incomplete master or condition details</p>
          </div>
          <button type="button" onClick={handleClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-transparent opacity-60 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-500 hover:opacity-100" aria-label="Close missing kit data modal">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar md:p-6">
          {rows.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center opacity-65">
              <CheckCircle2 size={34} className="text-emerald-500" />
              <p className="text-[12px] font-black uppercase tracking-widest">All in-stock kits have complete required data.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-[11px] font-bold uppercase">
                <AlertCircle size={16} className="shrink-0 text-amber-500" />
                <span>{rows.length} kit{rows.length === 1 ? '' : 's'} need{rows.length === 1 ? 's' : ''} attention. Out-of-stock kits are excluded.</span>
              </div>

              {rows.map(({ kit, missingMasterFields, stockRows, availableStockCount }) => {
                const draft = getDraft(drafts, kit);
                const masterFields = [
                  ['brand', 'Brand'],
                  ['series', 'Series'],
                  ['line', 'Line'],
                  ['scale', 'Scale']
                ];

                return (
                  <section key={kit.id} className={`rounded-2xl border p-4 ${cardClass}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-black/5 dark:bg-white/5">
                          {resolveKitImage(kit) ? <img src={resolveKitImage(kit)} alt="" className="h-full w-full object-cover" /> : null}
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-[13px] font-black uppercase">{kit.name || 'Unnamed kit'}</h3>
                          <p className="mt-1 text-[10px] font-bold uppercase opacity-50">{availableStockCount} available stock{availableStockCount === 1 ? '' : 's'}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {missingMasterFields.map((field) => <span key={field} className={`rounded-lg border px-2 py-1 text-[9px] font-black uppercase ${missingBadgeClass}`}>{field}</span>)}
                        {stockRows.some((row) => row.missing.includes('boxCondition')) && <span className={`rounded-lg border px-2 py-1 text-[9px] font-black uppercase ${missingBadgeClass}`}>Box Condition</span>}
                        {stockRows.some((row) => row.missing.includes('kitCondition')) && <span className={`rounded-lg border px-2 py-1 text-[9px] font-black uppercase ${missingBadgeClass}`}>Kit Condition</span>}
                      </div>
                    </div>

                    {missingMasterFields.length > 0 && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {masterFields.map(([field, label]) => (
                          <label key={field} className="space-y-1">
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-55">{label}</span>
                            <input
                              value={draft[field]}
                              onChange={(event) => updateMasterField(kit.id, field, event.target.value)}
                              className={inputClass}
                              placeholder={`Enter ${label.toLowerCase()}`}
                            />
                          </label>
                        ))}
                      </div>
                    )}

                    {stockRows.length > 0 && (
                      <div className="mt-4 space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-600">Stock Conditions</h4>
                        {stockRows.map(({ key, index, stock, missing }) => {
                          const stockDraft = draft.stocks?.[key] || {};
                          return (
                            <div key={key} className="grid gap-3 rounded-xl border border-black/5 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03] sm:grid-cols-[minmax(0,1fr)_1fr_1fr] sm:items-end">
                              <div className="min-w-0">
                                <p className="truncate text-[10px] font-black uppercase">Stock {index + 1}</p>
                                <p className="mt-1 text-[9px] font-bold uppercase opacity-50">{stock.status || 'Status not set'}{stock.eta ? ` • ${stock.eta}` : ''}</p>
                              </div>
                              {missing.includes('boxCondition') && (
                                <label className="space-y-1">
                                  <span className="text-[9px] font-black uppercase tracking-widest opacity-55">Box Condition</span>
                                  <input value={stockDraft.boxCondition ?? getCondition(stock, 'boxCondition')} onChange={(event) => updateStockField(kit.id, key, 'boxCondition', event.target.value)} className={inputClass} placeholder="Enter box condition" />
                                </label>
                              )}
                              {missing.includes('kitCondition') && (
                                <label className="space-y-1">
                                  <span className="text-[9px] font-black uppercase tracking-widest opacity-55">Kit Condition</span>
                                  <input value={stockDraft.kitCondition ?? getCondition(stock, 'kitCondition')} onChange={(event) => updateStockField(kit.id, key, 'kitCondition', event.target.value)} className={inputClass} placeholder="Enter kit condition" />
                                </label>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap shrink-0 items-center justify-between gap-3 border-t border-black/5 px-5 py-4 dark:border-white/10 md:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSanitizeOrphanedStocks}
              disabled={isSanitizing || isSaving}
              className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-600 transition-all hover:bg-emerald-500/20 disabled:opacity-40"
              title="Scan and release stocks from deleted or cancelled orders"
            >
              {isSanitizing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {isSanitizing ? 'Repairing Stocks...' : 'Repair Orphaned Stocks'}
            </button>
            {saveError ? <p className="text-[10px] font-black uppercase text-red-500">{saveError}</p> : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={handleClose} disabled={isSaving || isSanitizing} className="rounded-xl border border-black/10 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest transition-all hover:border-red-500 hover:text-red-500 disabled:opacity-40 dark:border-white/10">Cancel</button>
            <button type="button" onClick={handleSave} disabled={rows.length === 0 || isSaving || isSanitizing} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-400 disabled:shadow-none">
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isSaving ? 'Saving' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
