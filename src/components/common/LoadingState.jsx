import React from 'react';
import { Loader2 } from 'lucide-react';

export default function LoadingState({ message = "Synchronizing...", fullPage = false, className = "py-20" }) {
  const content = (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 animate-pulse text-neutral-900 dark:text-white">
        {message}
      </p>
    </div>
  );

  if (fullPage) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-neutral-50 dark:bg-[#0a0a0a]">
        {content}
      </div>
    );
  }

  return content;
}
