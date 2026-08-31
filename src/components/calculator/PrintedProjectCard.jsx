import React, { useMemo } from 'react';
import { Box, ShoppingCart, Trash2 } from 'lucide-react';
import UniversalImage from '../common/UniversalImage';

const getImageUrl = (project) => {
  if (typeof project?.image === 'string' && (project.image.startsWith('/') || project.image.startsWith('data:') || project.image.startsWith('http'))) return project.image;
  if (typeof project?.image === 'string') return project?.images?.find((image) => image?.id === project.image)?.url || '';
  return project?.image?.url || '';
};

const getMaterials = (project) => {
  const materials = Array.isArray(project?.materials) && project.materials.length ? project.materials : [project?.material].filter(Boolean);
  return materials.map((material) => [material.brand, material.type, material.colorName || material.name].filter(Boolean).join(' · ')).filter(Boolean);
};

export default function PrintedProjectCard({ project, isAdminView, onBuyNow, onAddToBasket, onDelete }) {
  const stocks = useMemo(() => Object.entries(project?.stocks || {}).map(([key, stock]) => ({ key, ...stock })), [project]);
  const availableStock = stocks.find((stock) => !stock?.order?.orderId && !stock?.isReserved) || null;
  const materialLabels = getMaterials(project);
  const dimensions = project?.dimensions || {};
  const price = Number(availableStock?.sellPrice || project?.sellPrice || 0);
  const stockLabel = availableStock?.stockNo || project?.stockNo || 'STOCK NO. TBA';

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[2rem] border border-black/5 bg-white p-3 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-white/10 dark:bg-[var(--color-surface)]">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-black/5 dark:bg-white/5">
        <UniversalImage src={getImageUrl(project)} alt={project?.name || 'Printed project'} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute left-3 top-3 rounded-full bg-blue-600 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-white shadow-lg">Printed</div>
      </div>
      <div className="flex flex-1 flex-col px-1 pt-3">
        <div className="min-h-[2.5rem]"><h3 className="line-clamp-2 text-[14px] font-black uppercase leading-tight tracking-tight">{project?.name || project?.projectName || 'Printed project'}</h3></div>
        <div className="mt-2 space-y-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
          {materialLabels.length > 0 && <div className="line-clamp-2">{materialLabels.join(' / ')}</div>}
          <div>DIMENSIONS: {dimensions.l || dimensions.length || 0} × {dimensions.w || dimensions.width || 0} × {dimensions.h || dimensions.height || 0} {dimensions.unit || 'MM'}</div>
          <div className="text-blue-600">{stockLabel}</div>
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <div><div className="text-[9px] font-black uppercase tracking-widest opacity-40">Ready to buy</div><div className="text-[18px] font-black italic tracking-tighter text-blue-600">₱{price.toLocaleString()}</div></div>
          <div className="flex items-center gap-1.5">
            {isAdminView && <button type="button" onClick={() => onDelete?.(project)} className="flex h-8 w-8 items-center justify-center rounded-full border border-red-500/20 text-red-500 transition-colors hover:bg-red-500 hover:text-white" aria-label="Delete printed project"><Trash2 size={14} /></button>}
            {availableStock && <button type="button" onClick={() => onAddToBasket?.(project, availableStock)} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-blue-600 transition-colors hover:bg-blue-600 hover:text-white dark:bg-white/10" aria-label="Add printed project to cart"><ShoppingCart size={14} /></button>}
            {availableStock && <button type="button" onClick={() => onBuyNow?.(project, availableStock)} className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/25 transition-transform hover:scale-110" aria-label="Buy printed project"><Box size={14} /></button>}
          </div>
        </div>
      </div>
    </article>
  );
}
