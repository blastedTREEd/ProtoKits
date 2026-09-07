import React, { useMemo, useEffect, useRef, useState } from 'react';
import { X, TrendingUp, DollarSign, Package, Clock, AlertCircle, ShoppingCart, ChevronDown } from 'lucide-react';
import { useStore } from '../../store/useStore';
import UniversalImage from '../common/UniversalImage';

const PENDING_STATUSES = new Set(['Reserved', 'Validating', 'Arrived', 'To Ship', 'Shipped', 'Preparing']);

const isCompletedOrder = (order) => String(order?.status || '').toLowerCase() === 'completed';

const toAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const getQuantity = (item) => Math.max(1, toAmount(item?.quantity) || 1);

const getOrderDate = (order) => {
  const value = order?.createdAt || order?.date;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);

  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
};

const getOrderRevenue = (order) => {
  // Legacy totalPrice contains only item revenue. buyerPaid also includes the
  // manually entered handling fee, so use it for the actual amount received.
  if (order?.legacyOrder) {
    return Math.max(0, toAmount(order.buyerPaid ?? order.totalPrice ?? order.price));
  }

  // Modern totalPrice is saved after checkout fees and discounts are applied.
  return Math.max(0, toAmount(order?.totalPrice ?? order?.price ?? order?.buyerPaid));
};

const getOrderItems = (order) => {
  if (Array.isArray(order?.items) && order.items.length > 0) return order.items;
  if (!order?.item && !order?.selectedKitId) return [];

  return [{
    id: order.selectedKitId || order.kitId,
    name: order.item || 'Order item',
    price: order.price || order.totalPrice || 0,
    sellPrice: order.price || order.totalPrice || 0,
    stockKey: order.selectedStockKey,
    quantity: 1
  }];
};

const getItemCapital = (item, kits) => {
  const quantity = getQuantity(item);
  const storedCost = Number(item?.costPrice);
  if (Number.isFinite(storedCost)) return Math.max(0, storedCost * quantity);

  const kit = (kits || []).find((candidate) => String(candidate?.id) === String(item?.id));
  const stock = kit?.stocks?.[item?.stockKey];
  return Math.max(0, toAmount(stock?.costPrice || kit?.costPrice) * quantity);
};

const getItemBasis = (item) => {
  const quantity = getQuantity(item);
  const unitPrice = toAmount(item?.price ?? item?.sellPrice ?? item?.originalSellPrice);
  return Math.max(0, unitPrice * quantity);
};

const getItemEmbeddedDiscount = (item) => {
  const quantity = getQuantity(item);
  const actualPrice = toAmount(item?.sellPrice ?? item?.price);
  const referencePrice = toAmount(item?.originalSellPrice ?? item?.bundleReferencePrice ?? actualPrice);
  return Math.max(0, (referencePrice - actualPrice) * quantity);
};

const buildOrderFinancials = (order, kits) => {
  const items = getOrderItems(order);
  const revenue = getOrderRevenue(order);
  const fees = Math.max(0, toAmount(order?.handlingFee) + toAmount(order?.installmentFee) + toAmount(order?.transferFee));
  const discount = Math.max(0, toAmount(order?.discount));
  const totalBasis = items.reduce((sum, item) => sum + getItemBasis(item), 0);
  const embeddedDiscount = items.reduce((sum, item) => sum + getItemEmbeddedDiscount(item), 0);
  const fallbackShare = items.length > 0 ? revenue / items.length : 0;

  const itemRows = items.map((item) => {
    const share = totalBasis > 0 ? getItemBasis(item) / totalBasis : 1 / Math.max(1, items.length);
    const itemRevenue = totalBasis > 0 ? revenue * share : fallbackShare;
    const capital = getItemCapital(item, kits);

    return {
      ...item,
      itemRevenue,
      capital,
      profit: itemRevenue - capital,
      feeShare: fees * share,
      discountShare: getItemEmbeddedDiscount(item) + (discount * share),
      quantity: getQuantity(item)
    };
  });

  const capital = itemRows.reduce((sum, item) => sum + item.capital, 0);
  return {
    revenue,
    fees,
    discount: discount + embeddedDiscount,
    capital,
    profit: revenue - capital,
    itemRows
  };
};

const formatCurrency = (value) => `₱${toAmount(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function SalesDashboardModal({ isOpen, onClose }) {
  const orders = useStore((state) => state.orders);
  const kits = useStore((state) => state.kits);
  const [expandedOrderIds, setExpandedOrderIds] = useState(() => new Set());
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const orderRows = useMemo(() => (
    (orders || [])
      .map((order) => ({
        order,
        financials: buildOrderFinancials(order, kits)
      }))
      .sort((a, b) => getOrderDate(b.order).getTime() - getOrderDate(a.order).getTime())
  ), [orders, kits]);

  const completedOrderRows = useMemo(
    () => orderRows.filter(({ order }) => isCompletedOrder(order)),
    [orderRows]
  );

  const stats = useMemo(() => {
    if (orderRows.length === 0) return null;

    const completed = orderRows.filter(({ order }) => isCompletedOrder(order));
    const pending = orderRows.filter(({ order }) => PENDING_STATUSES.has(order.status));
    const cancelled = orderRows.filter(({ order }) => order.status === 'Cancelled');
    const sum = (rows, key) => rows.reduce((total, row) => total + row.financials[key], 0);

    return {
      totalSales: sum(completed, 'revenue'),
      totalCapital: sum(completed, 'capital'),
      totalProfit: sum(completed, 'profit'),
      potentialRevenue: sum(pending, 'revenue'),
      orderCount: orderRows.length,
      completedCount: completed.length,
      pendingCount: pending.length,
      cancelledCount: cancelled.length
    };
  }, [orderRows]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const stateKey = `sales-dashboard-modal-${Date.now()}`;
    window.history.pushState({ modalKey: stateKey }, '');

    const handlePopState = () => onCloseRef.current();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current();
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
      if (window.history.state?.modalKey === stateKey) window.history.back();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) setExpandedOrderIds(new Set());
  }, [isOpen]);

  const toggleOrder = (orderId) => {
    setExpandedOrderIds((current) => {
      if (current.has(orderId)) return new Set();
      return new Set([orderId]);
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 p-0 backdrop-blur-md animate-in fade-in duration-300 md:p-4">
      <div className="relative flex h-full w-full flex-col overflow-hidden border-0 bg-white p-6 text-neutral-900 shadow-2xl dark:bg-[#0a0a0a] dark:text-white md:h-[90vh] md:max-w-5xl md:rounded-[2.5rem] md:border md:border-black/5 md:p-8 dark:md:border-white/10">
        <div className="sticky top-0 z-[220] h-0 w-full overflow-visible md:hidden">
          <div className="absolute right-4 top-4 flex items-center justify-end">
            <button onClick={onClose} className="rounded-full border border-white/10 bg-black/20 p-2 text-white shadow-lg backdrop-blur-md transition-all hover:bg-black/40" aria-label="Close sales dashboard">
              <X size={20} />
            </button>
          </div>
        </div>
        <button onClick={onClose} className="absolute right-6 top-6 hidden opacity-30 transition-opacity hover:opacity-100 md:block" aria-label="Close sales dashboard">
          <X size={24} />
        </button>

        <div className="mb-8 flex shrink-0 items-center gap-4">
          <div className="rounded-2xl bg-blue-600/10 p-3 text-blue-600"><TrendingUp size={32} /></div>
          <div>
            <h2 className="text-3xl font-black uppercase italic tracking-tighter">Sales <span className="text-blue-600">Dashboard</span></h2>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Order-level profit and capital</p>
          </div>
        </div>

        {!stats ? (
          <div className="py-20 text-center opacity-30">
            <Package size={48} className="mx-auto mb-4" />
            <p className="font-bold uppercase tracking-widest">No order data available</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 pb-8">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-[2rem] bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white shadow-xl shadow-blue-600/20">
                <div className="mb-4 flex items-start justify-between"><DollarSign size={24} className="opacity-50" /><span className="text-[10px] font-black uppercase tracking-widest opacity-70">Total Sales</span></div>
                <h3 className="text-3xl font-black italic tracking-tighter">{formatCurrency(stats.totalSales)}</h3>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest opacity-50">{stats.completedCount} completed orders</p>
              </div>

              <div className="rounded-[2rem] border border-violet-500/20 bg-violet-500/10 p-6 text-violet-600 shadow-xl shadow-violet-500/5 dark:text-violet-400">
                <div className="mb-4 flex items-start justify-between"><Package size={24} className="opacity-50" /><span className="text-[10px] font-black uppercase tracking-widest opacity-70">Capital</span></div>
                <h3 className="text-3xl font-black italic tracking-tighter">{formatCurrency(stats.totalCapital)}</h3>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest opacity-50">Cost of completed items</p>
              </div>

              <div className="rounded-[2rem] border border-emerald-500/20 bg-emerald-500/10 p-6 text-emerald-600 shadow-xl shadow-emerald-500/5 dark:text-emerald-400">
                <div className="mb-4 flex items-start justify-between"><TrendingUp size={24} className="opacity-50" /><span className="text-[10px] font-black uppercase tracking-widest opacity-70">Net Profit</span></div>
                <h3 className="text-3xl font-black italic tracking-tighter">{formatCurrency(stats.totalProfit)}</h3>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest opacity-50">Sales minus capital</p>
              </div>

              <div className="rounded-[2rem] border border-amber-500/20 bg-amber-500/10 p-6 text-amber-600 shadow-xl shadow-amber-500/5 dark:text-amber-400">
                <div className="mb-4 flex items-start justify-between"><Clock size={24} className="opacity-50" /><span className="text-[10px] font-black uppercase tracking-widest opacity-70">Pending Revenue</span></div>
                <h3 className="text-3xl font-black italic tracking-tighter">{formatCurrency(stats.potentialRevenue)}</h3>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest opacity-50">{stats.pendingCount} ongoing orders</p>
              </div>
            </div>

            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 no-scrollbar">
              <div className="space-y-8">
            <div>
              <div className="mb-4 flex items-center justify-between px-2">
                <h4 className="text-[11px] font-black uppercase tracking-widest opacity-40">Order List</h4>
                <span className="text-[10px] font-black uppercase tracking-widest opacity-40">{stats.completedCount} completed</span>
              </div>
              <div className="space-y-3">
                {completedOrderRows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-black/10 p-6 text-center text-[10px] font-black uppercase tracking-widest opacity-40 dark:border-white/10">
                    No completed orders
                  </div>
                ) : completedOrderRows.map(({ order, financials }) => {
                  const orderId = order.id || order.orderId;
                  const isExpanded = expandedOrderIds.has(orderId);
                  const isCancelled = order.status === 'Cancelled';
                  const isCompleted = isCompletedOrder(order);
                  const statusClass = isCompleted
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : isCancelled
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400';

                  return (
                    <div key={orderId} className="overflow-hidden rounded-2xl border border-black/10 dark:border-white/10">
                      <button type="button" onClick={() => toggleOrder(orderId)} className="flex w-full flex-wrap items-center justify-between gap-3 bg-black/[0.02] px-4 py-4 text-left transition hover:bg-black/[0.05] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]" aria-expanded={isExpanded}>
                        <div className="flex min-w-0 items-center gap-3">
                          <ShoppingCart size={18} className="shrink-0 text-blue-600" />
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-black uppercase">{order.orderId || order.id || 'Order'}</p>
                            <p className="text-[10px] font-bold uppercase tracking-wider opacity-45">{getOrderDate(order).getTime() > 0 ? getOrderDate(order).toLocaleDateString() : 'No date'} · {financials.itemRows.length} item{financials.itemRows.length === 1 ? '' : 's'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${statusClass}`}>{order.status || 'Unknown'}</span>
                          <span className="text-right">
                            <span className="block text-[12px] font-black">{formatCurrency(financials.revenue)}</span>
                            <span className={`block text-[10px] font-black ${isCancelled ? 'text-red-500' : financials.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{isCancelled ? 'Excluded' : `${isCompleted ? 'Profit' : 'Potential'} ${formatCurrency(financials.profit)}`}</span>
                          </span>
                          <ChevronDown size={16} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="space-y-4 border-t border-black/10 p-4 dark:border-white/10">
                          <div className="grid grid-cols-2 gap-3 text-[10px] font-black uppercase tracking-wider sm:grid-cols-4">
                            <div><span className="block opacity-40">Revenue</span><span>{formatCurrency(financials.revenue)}</span></div>
                            <div><span className="block opacity-40">Fees included</span><span>{formatCurrency(financials.fees)}</span></div>
                            <div><span className="block opacity-40">Discounts</span><span>-{formatCurrency(financials.discount)}</span></div>
                            <div><span className="block opacity-40">Capital</span><span>{formatCurrency(financials.capital)}</span></div>
                          </div>

                          <div className="space-y-2">
                            {financials.itemRows.map((item, index) => (
                              <div key={`${orderId}-${item.id || item.stockKey || index}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-black/5 bg-black/[0.02] p-3 dark:border-white/5 dark:bg-white/[0.03]">
                                <UniversalImage src={item.image || item.images?.[0]} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                                <div className="min-w-[150px] flex-1">
                                  <p className="truncate text-[11px] font-black uppercase">{item.name || 'Unnamed item'}</p>
                                  <p className="text-[9px] font-bold uppercase tracking-wider opacity-45">Qty {item.quantity} · Fees +{formatCurrency(item.feeShare)} · Discount -{formatCurrency(item.discountShare)}</p>
                                </div>
                                <div className="grid grid-cols-3 gap-4 text-right text-[10px] font-black uppercase tracking-wider">
                                  <span><span className="block opacity-40">Revenue</span>{formatCurrency(item.itemRevenue)}</span>
                                  <span><span className="block opacity-40">Capital</span>{formatCurrency(item.capital)}</span>
                                  <span className={item.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}><span className="block opacity-40">Profit</span>{formatCurrency(item.profit)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          <p className="text-[10px] font-medium italic opacity-50">Profit uses the final order amount after fees and discounts, minus recorded stock capital. Pending profit is potential until the order is completed.</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[2.5rem] border border-dashed border-black/10 bg-black/[0.02] p-6 dark:border-white/10 dark:bg-white/[0.02]">
              <div className="mb-3 flex items-center gap-3"><AlertCircle size={20} className="text-blue-600" /><h4 className="text-[11px] font-black uppercase tracking-widest">Accounting note</h4></div>
              <p className="text-xs font-medium italic leading-relaxed opacity-60">Modern orders use their final total after handling, installment, transfer fees, and discounts. Legacy orders use the buyer-paid amount so manually entered handling fees are included. Capital comes from the stored stock cost when available, with the current stock cost as a fallback.</p>
            </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
