import React from 'react';

export default function ProductCardSkeleton() {
  return (
    <div className="group relative rounded-[2.2rem] p-[2px] bg-neutral-100 dark:bg-neutral-800 animate-pulse transition-all duration-500 flex flex-col overflow-hidden w-full h-[320px]">
      <div className="relative rounded-[2.1rem] flex flex-col h-full overflow-hidden bg-white dark:bg-[var(--color-surface)]">
        <div className="p-3 flex flex-col h-full">
          {/* Image Skeleton */}
          <div className="relative aspect-square rounded-2xl mb-3 bg-neutral-200 dark:bg-neutral-700 shrink-0 z-0 w-full h-[200px]"></div>
          
          {/* Content Skeleton */}
          <div className="px-1 text-center flex-1 flex flex-col gap-2">
            <div className="h-5 bg-neutral-200 dark:bg-neutral-700 rounded-lg w-3/4 mx-auto"></div>
            <div className="mt-auto flex items-end justify-between pb-1">
              <div className="flex flex-col items-start gap-1">
                <div className="h-4 w-16 bg-neutral-200 dark:bg-neutral-700 rounded-md"></div>
                <div className="h-5 w-20 bg-neutral-200 dark:bg-neutral-700 rounded-md"></div>
              </div>
              <div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-700"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
