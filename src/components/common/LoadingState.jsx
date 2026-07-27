import React from 'react';
import { CheckCircle2, CircleDashed, Loader2 } from 'lucide-react';

export default function LoadingState({
  message = "Synchronizing...",
  detail = "Preparing the latest garage data.",
  steps = [],
  fullPage = false,
  className = "py-20"
}) {
  const content = (
    <div className={`flex w-full max-w-sm flex-col items-center justify-center gap-4 px-5 ${className}`}>
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-blue-500/20" />
        <div className="absolute inset-1 rounded-full border border-red-500/10" />
        <Loader2 className="h-9 w-9 animate-spin text-blue-600 dark:text-blue-400" />
      </div>

      <div className="text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-900/50 dark:text-white/50">
          {message}
        </p>
        {detail && (
          <p className="mt-2 text-xs font-semibold leading-relaxed text-neutral-700 dark:text-neutral-300">
            {detail}
          </p>
        )}
      </div>

      {steps.length > 0 && (
        <div className="w-full rounded-lg border border-black/5 bg-white/75 p-3 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-950/75">
          <div className="space-y-2">
            {steps.map((step) => {
              const isDone = step.status === 'done';
              return (
                <div key={step.label} className="flex items-center gap-2 text-left">
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <CircleDashed className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
                  )}
                  <span className={`text-[11px] font-bold uppercase tracking-[0.16em] ${isDone ? 'text-neutral-500 line-through decoration-neutral-300 dark:text-neutral-500' : 'text-neutral-800 dark:text-neutral-100'}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
