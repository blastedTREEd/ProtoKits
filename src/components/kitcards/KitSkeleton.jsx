import React from 'react';
import { useStore } from '../../store/useStore';

export default function KitSkeleton() {
  const { garageInfo } = useStore();
  const logoUrl = garageInfo?.logoURL || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Crect width='150' height='150' fill='%23334155'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='central' text-anchor='middle' fill='%2394a3b8' font-size='14' font-family='sans-serif'%3ESG%3C/text%3E%3C/svg%3E";

  return (
    <div className={`group rounded-3xl border p-3 flex flex-col bg-white dark:bg-[#121212] border-black/5 dark:border-white/5 shadow-lg`}>
      {/* Image Placeholder with Logo */}
      <div className="relative aspect-square rounded-2xl overflow-hidden mb-3 bg-neutral-200 dark:bg-neutral-800 border border-black/5 dark:border-white/5 shrink-0 animate-pulse-blue flex items-center justify-center">
        <img src={logoUrl} alt="Loading..." className="w-full h-full opacity-20 object-contain" />
      </div>

      {/* Content Placeholder */}
      <div className="px-1 text-center flex-1 flex flex-col">
        {/* Title Lines */}
        <div className="space-y-2 mb-2">
          <div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded-full w-3/4 mx-auto animate-pulse-blue" />
          <div className="h-2 bg-neutral-200 dark:bg-neutral-800 rounded-full w-1/2 mx-auto animate-pulse-blue" />
        </div>

        {/* Price and Action Placeholder */}
        <div className="mt-auto pb-1">
          <div className="flex items-center justify-between">
            <div className="flex flex-col items-start space-y-1">
              <div className="h-2 bg-neutral-200 dark:bg-neutral-800 rounded-full w-8 animate-pulse-blue" />
              <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded-full w-16 animate-pulse-blue" />
            </div>
            <div className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-800 animate-pulse-blue" />
          </div>
        </div>
      </div>
    </div>
  );
}