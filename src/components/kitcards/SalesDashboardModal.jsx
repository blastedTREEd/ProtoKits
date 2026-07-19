import React, { useMemo, useEffect } from 'react';
import { X, TrendingUp, DollarSign, Package, Clock, CheckCircle2, AlertCircle, ShoppingCart } from 'lucide-react';
import { useStore } from '../../store/useStore';

export default function SalesDashboardModal({ isOpen, onClose }) {
  const { orders, kits } = useStore();

  const stats = useMemo(() => {
    if (!orders || orders.length === 0) return null;

    const completed = orders.filter(o => o.status === 'Completed');
    const pending = orders.filter(o => ['Reserved', 'Validating', 'Arrived', 'To Ship', 'Shipped', 'Preparing'].includes(o.status));
    
    const totalSales = completed.reduce((sum, o) => sum + (Number(o.totalPrice || o.price || 0)), 0);
    const potentialRevenue = pending.reduce((sum, o) => sum + (Number(o.totalPrice || o.price || 0)), 0);

    // Calculate profit for completed orders
    let totalProfit = 0;
    completed.forEach(order => {
        if (order.items) {
            order.items.forEach(item => {
                const kit = kits.find(k => k.id === item.id);
                const stock = kit?.stocks?.[item.stockKey];
                if (stock?.costPrice) {
                    totalProfit += (Number(item.price || 0) - Number(stock.costPrice));
                }
            });
        } else if (order.item) {
            // Find kit by name or ID if it's a single item order
            const kit = kits.find(k => order.item.includes(k.name) || order.selectedKitId === k.id);
            // This is trickier for legacy/manual orders without stockKey in order object
            // but we try our best
            const stock = kit?.stocks?.[order.selectedStockKey];
            if (stock?.costPrice) {
                totalProfit += (Number(order.price || 0) - Number(stock.costPrice));
            }
        }
    });

    return {
      totalSales,
      potentialRevenue,
      totalProfit,
      orderCount: orders.length,
      completedCount: completed.length,
      pendingCount: pending.length,
      cancelledCount: orders.filter(o => o.status === 'Cancelled').length
    };
  }, [orders, kits]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const stateKey = `sales-dashboard-modal-${Date.now()}`;
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

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-0 md:p-4 backdrop-blur-md bg-black/60 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-[#0a0a0a] w-full h-full md:h-auto md:max-h-[90vh] md:max-w-4xl rounded-none md:rounded-[2.5rem] p-6 md:p-8 shadow-2xl relative overflow-y-auto text-neutral-900 dark:text-white border-0 md:border border-black/5 dark:border-white/10">
        {/* Mobile sticky close button (same pattern as ProductCard and AddDealModal) */}
        <div className="sticky top-0 z-[220] w-full h-0 overflow-visible md:hidden shrink-0">
          <div className="absolute top-4 right-4 flex justify-end items-center">
            <button onClick={onClose} className="p-2 rounded-full backdrop-blur-md border transition-all shadow-lg bg-black/20 text-white border-white/10 hover:bg-black/40">
              <X size={20} />
            </button>
          </div>
        </div>
        <button onClick={onClose} className="hidden md:block absolute top-6 right-6 opacity-30 hover:opacity-100 transition-opacity">
          <X size={24} />
        </button>

        <div className="flex items-center gap-4 mb-10">
          <div className="p-3 bg-blue-600/10 rounded-2xl text-blue-600">
            <TrendingUp size={32} />
          </div>
          <div>
            <h2 className="text-3xl font-black uppercase italic tracking-tighter">Sales <span className="text-blue-600">Dashboard</span></h2>
            <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Real-time Performance Metrics</p>
          </div>
        </div>

        {!stats ? (
          <div className="py-20 text-center opacity-30">
            <Package size={48} className="mx-auto mb-4" />
            <p className="font-bold uppercase tracking-widest">No order data available</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Primary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-6 rounded-[2rem] bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xl shadow-blue-600/20">
                <div className="flex justify-between items-start mb-4">
                  <DollarSign size={24} className="opacity-50" />
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Total Sales</span>
                </div>
                <h3 className="text-3xl font-black italic tracking-tighter">₱{stats.totalSales.toLocaleString()}</h3>
                <p className="text-[10px] font-bold mt-1 opacity-50 uppercase tracking-widest">From {stats.completedCount} Completed Orders</p>
              </div>

              <div className="p-6 rounded-[2rem] bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 shadow-xl shadow-emerald-500/5">
                <div className="flex justify-between items-start mb-4">
                  <TrendingUp size={24} className="opacity-50" />
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Estimated Profit</span>
                </div>
                <h3 className="text-3xl font-black italic tracking-tighter">₱{stats.totalProfit.toLocaleString()}</h3>
                <p className="text-[10px] font-bold mt-1 opacity-50 uppercase tracking-widest">Net from items sold</p>
              </div>

              <div className="p-6 rounded-[2rem] bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 shadow-xl shadow-amber-500/5">
                <div className="flex justify-between items-start mb-4">
                  <Clock size={24} className="opacity-50" />
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Pending Revenue</span>
                </div>
                <h3 className="text-3xl font-black italic tracking-tighter">₱{stats.potentialRevenue.toLocaleString()}</h3>
                <p className="text-[10px] font-bold mt-1 opacity-50 uppercase tracking-widest">From {stats.pendingCount} Ongoing Orders</p>
              </div>
            </div>

            {/* Order Status Breakdown */}
            <div>
              <h4 className="text-[11px] font-black uppercase tracking-widest opacity-40 mb-4 px-2">Order Distribution</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                   <div className="flex items-center gap-2 mb-2 text-blue-600">
                     <ShoppingCart size={16} />
                     <span className="text-[9px] font-black uppercase tracking-widest">Total</span>
                   </div>
                   <p className="text-xl font-black italic tracking-tighter">{stats.orderCount}</p>
                </div>
                <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                   <div className="flex items-center gap-2 mb-2 text-emerald-500">
                     <CheckCircle2 size={16} />
                     <span className="text-[9px] font-black uppercase tracking-widest">Success</span>
                   </div>
                   <p className="text-xl font-black italic tracking-tighter">{stats.completedCount}</p>
                </div>
                <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                   <div className="flex items-center gap-2 mb-2 text-amber-500">
                     <Clock size={16} />
                     <span className="text-[9px] font-black uppercase tracking-widest">Pending</span>
                   </div>
                   <p className="text-xl font-black italic tracking-tighter">{stats.pendingCount}</p>
                </div>
                <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                   <div className="flex items-center gap-2 mb-2 text-red-500">
                     <AlertCircle size={16} />
                     <span className="text-[9px] font-black uppercase tracking-widest">Cancelled</span>
                   </div>
                   <p className="text-xl font-black italic tracking-tighter">{stats.cancelledCount}</p>
                </div>
              </div>
            </div>

            {/* Performance Insights */}
            <div className="p-8 rounded-[2.5rem] bg-black/[0.02] dark:bg-white/[0.02] border border-dashed border-black/10 dark:border-white/10">
               <div className="flex items-center gap-3 mb-4">
                  <AlertCircle size={20} className="text-blue-600" />
                  <h4 className="text-[11px] font-black uppercase tracking-widest">Dashboard Note</h4>
               </div>
               <p className="text-xs font-medium opacity-60 leading-relaxed italic">
                 Profit calculations are estimated based on current kit stock cost prices. 
                 Historical accuracy may vary for manual or legacy orders where cost price data was not explicitly linked.
               </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
