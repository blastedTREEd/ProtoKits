import React from 'react';

export default function ListItemSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-2xl border-2 border-black/5 bg-white p-3 dark:border-white/5 dark:bg-neutral-900">
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-100 bg-neutral-200 animate-pulse-blue dark:border-neutral-800 dark:bg-neutral-800 md:portrait:w-48 md:landscape:w-72 md:h-24 lg:w-72 xl:w-72">
        <img src="/snorlaxgarage.png" alt="Loading..." className="h-full w-full object-contain opacity-20" />
      </div>

      <div className="flex min-h-[80px] min-w-0 flex-1 flex-col justify-center gap-3">
        <div className="space-y-2">
          <div className="h-3 w-2/5 rounded-full bg-neutral-200 animate-pulse-blue dark:bg-neutral-800" />
          <div className="h-2 w-1/4 rounded-full bg-neutral-200 animate-pulse-blue dark:bg-neutral-800" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-16 rounded-full bg-neutral-200 animate-pulse-blue dark:bg-neutral-800" />
          <div className="h-5 w-20 rounded-md bg-neutral-200 animate-pulse-blue dark:bg-neutral-800" />
          <div className="ml-auto h-8 w-20 rounded-full bg-neutral-200 animate-pulse-blue dark:bg-neutral-800" />
        </div>
      </div>
    </div>
  );
}
