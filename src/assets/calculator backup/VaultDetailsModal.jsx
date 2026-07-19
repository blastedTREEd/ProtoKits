import React from 'react';
import { 
  X, Clock, Weight, Droplet, Box, Layers, 
  AlertTriangle, Edit3, Trash2, Link2, ExternalLink,
  ChevronRight, Calendar, Zap
} from 'lucide-react';

export default function VaultDetailsModal({ project, onClose, onModify, onDelete, onAddToBasket, onRemoveFromBasket, isInBasket, isReadOnly = false }) {
  if (!project) return null;

  const totals = project.totals || {};
  const details = project.projectDetails || [];
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] w-full max-w-2xl max-h-[90vh] rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden text-[var(--color-text-main)]">
        
        {/* Header */}
        <div className="p-6 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-3 text-left">
            <div className="p-2.5 bg-blue-600 rounded-xl">
              <Box size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase italic leading-none">{project.projectName || 'Unnamed Project'}</h2>
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 opacity-80 mt-1 block">
                {project.method?.name} Estimation • {project.status || 'Finalized'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors opacity-40 hover:opacity-100">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
          
          {/* Main Stats */}
          <div className="grid grid-cols-2 gap-4">
             <div className="bg-black/5 dark:bg-white/5 p-6 rounded-[2rem] border border-[var(--color-border)]">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-30 block mb-1">Estimated Total</span>
                <div className="flex items-baseline gap-1">
                   <span className="text-xs font-black opacity-30">₱</span>
                   <span className="text-3xl font-black italic tracking-tighter">{totals.total || project.price}</span>
                </div>
             </div>
             <div className="bg-black/5 dark:bg-white/5 p-6 rounded-[2rem] border border-[var(--color-border)]">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-30 block mb-1">Downpayment</span>
                <div className="flex items-baseline gap-1 text-blue-600">
                   <span className="text-xs font-black opacity-30">₱</span>
                   <span className="text-3xl font-black italic tracking-tighter">{totals.dp || project.minDownpayment}</span>
                </div>
             </div>
          </div>

          {/* Verification Warning */}
          {!project.isFinalized && (
            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex gap-3">
               <AlertTriangle size={20} className="text-amber-500 shrink-0" />
               <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1 leading-none">Price Disclaimer</p>
                  <p className="text-[11px] font-bold text-amber-700 dark:text-amber-500 leading-tight">
                    This is an estimation base on user inputs. Final price is subject to change upon file verification by admin.
                  </p>
               </div>
            </div>
          )}

          {/* Project Details Grid */}
          <div className="space-y-3">
             <div className="flex items-center gap-4 px-2">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30">Configuration</span>
                <div className="h-px flex-1 bg-[var(--color-border)]" />
             </div>

             <div className="grid grid-cols-1 gap-2">
                {details.map((item, idx) => (
                  <div key={idx} className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl border border-[var(--color-border)] flex items-center justify-between">
                     <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-600">
                           <Layers size={14} strokeWidth={3} />
                        </div>
                        <div className="text-left">
                           <h4 className="text-[11px] font-black uppercase italic leading-none">{item.itemName || `Item ${idx+1}`}</h4>
                           <div className="flex items-center gap-2 mt-1 opacity-40">
                              <span className="text-[9px] font-bold uppercase">{item.normalizedMaterial?.name || item.material?.material?.name || 'Material'}</span>
                              <span className="w-1 h-1 rounded-full bg-current opacity-30" />
                              <span className="text-[9px] font-bold uppercase">{item.normalizedWeight || item.sliced?.weight || 0}g</span>
                           </div>
                        </div>
                     </div>
                     <div className="text-right">
                        <div className="flex items-center gap-1 text-[11px] font-black italic text-blue-600">
                           <Clock size={10} />
                           {Math.floor((item.normalizedTime || item.sliced?.time || 0) / 60)}h {(item.normalizedTime || item.sliced?.time || 0) % 60}m
                        </div>
                     </div>
                  </div>
                ))}
             </div>
          </div>

          {/* Links & Date */}
          <div className="grid grid-cols-1 gap-4">
             {project.gdriveLink && (
               <a 
                 href={project.gdriveLink} 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="flex items-center justify-between p-5 rounded-2xl bg-blue-600/5 border border-blue-600/10 text-blue-600 hover:bg-blue-600/10 transition-all group"
               >
                 <div className="flex items-center gap-3">
                    <Link2 size={16} strokeWidth={3} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Open GDrive Files</span>
                 </div>
                 <ExternalLink size={14} className="opacity-40 group-hover:opacity-100 transition-opacity" />
               </a>
             )}
             
             {project.createdAt && (
               <div className="flex items-center justify-center gap-2 opacity-20 py-2">
                  <Calendar size={12} />
                  <span className="text-[9px] font-black uppercase tracking-widest">
                    Created on {new Date(project.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
               </div>
             )}
          </div>

        </div>

        {/* Footer Actions */}
        {!isReadOnly && (
          <div className="p-6 border-t border-[var(--color-border)] flex flex-col sm:flex-row gap-3">
            <div className="flex gap-3 flex-1">
              <button 
                onClick={() => { if(window.confirm('Remove this project from vault?')) { onDelete(project.vaultId); onClose(); } }}
                className="flex-1 py-5 rounded-2xl bg-red-600/5 text-red-600 font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-2 hover:bg-red-600/10 transition-all active:scale-90"
              >
                <Trash2 size={16} strokeWidth={3} />
              </button>
              <button 
                onClick={() => { onModify(project); onClose(); }}
                className="flex-[2] py-5 rounded-2xl bg-neutral-100 dark:bg-white/5 text-neutral-900 dark:text-white font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-3 active:scale-95 group transition-all"
              >
                <Edit3 size={16} strokeWidth={3} /> Modify
              </button>
            </div>
            
            <button 
              onClick={() => isInBasket ? onRemoveFromBasket() : onAddToBasket(project)}
              className={`flex-[2] py-5 rounded-2xl text-white font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-3 shadow-lg active:scale-95 group transition-all ${
                isInBasket 
                  ? 'bg-amber-600 shadow-amber-600/20' 
                  : 'bg-blue-600 shadow-blue-600/20'
              }`}
            >
              <Zap size={16} fill="currentColor" className={isInBasket ? '' : 'group-hover:animate-pulse'} /> 
              {isInBasket ? 'Remove Item' : 'Add to Basket'}
              <ChevronRight size={14} className="opacity-40 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
