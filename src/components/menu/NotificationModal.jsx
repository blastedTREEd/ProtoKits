import React from 'react';
import { Bell } from 'lucide-react';

export default function NotificationModal({ isOpen, onClose, isDarkMode }) {
  if (!isOpen) return null;

  return (
    <>
      {/* Invisible backdrop to close on click outside */}
      <div className="fixed inset-0 z-[140]" onClick={onClose} />
      
      <div className={`absolute right-4 lg:right-[150px] top-[70px] z-[150] w-72 animate-in fade-in slide-in-from-top-2 duration-200`}>
        <div className={`rounded-[2rem] shadow-2xl border overflow-hidden ${isDarkMode ? 'bg-neutral-900/95 border-white/10' : 'bg-white/95 border-black/5'} backdrop-blur-xl`}>
          <div className="p-6 border-b border-black/5 dark:border-white/5">
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-blue-600/10 text-blue-600">
                    <Bell size={18} />
                </div>
                <h3 className="text-[12px] font-black italic uppercase tracking-widest text-neutral-900 dark:text-white">Notifications</h3>
            </div>
          </div>

          <div className="p-2 max-h-[60vh] overflow-y-auto">
              <div className="text-center py-10 opacity-30">
                  <Bell size={40} className="mx-auto mb-4" strokeWidth={1} />
                  <p className="text-[10px] font-black uppercase tracking-widest">No new notifications</p>
              </div>
          </div>
        </div>
      </div>
    </>
  );
}
