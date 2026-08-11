import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

const LoadingChecklist = ({ steps }) => {
  const [visibleStepCount, setVisibleStepCount] = useState(steps.length > 0 ? 1 : 0);
  const visibleSteps = steps.slice(0, visibleStepCount);

  useEffect(() => {
    if (visibleStepCount >= steps.length) return undefined;

    const timer = setTimeout(() => {
      setVisibleStepCount((count) => Math.min(count + 1, steps.length));
    }, 420);

    return () => clearTimeout(timer);
  }, [steps.length, visibleStepCount]);

  return (
    <div className="w-full rounded-lg border border-black/5 bg-white/75 p-3 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-950/75">
      <div className="space-y-2">
        {visibleSteps.map((step) => {
          const isDone = step.status === 'done';
          return (
            <div key={step.label} className="flex items-center gap-2 text-left">
              {isDone ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <span className="h-4 w-4 shrink-0" />
              )}
              <span className={`text-[11px] font-bold uppercase tracking-[0.16em] ${isDone ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-800 dark:text-neutral-100'}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function LoadingState({
  message = "Synchronizing...",
  steps = [],
  fullPage = false,
  className = "py-20"
}) {
  const stepLabelsKey = steps.map((step) => step.label).join('|');

  const content = (
    <div className={`flex w-full max-w-sm flex-col items-center justify-center gap-4 px-5 ${className}`}>
      <div className="flex h-16 w-16 items-center justify-center">
        <Loader2 className="h-9 w-9 animate-spin text-blue-600 dark:text-blue-400" />
      </div>

      <div className="text-center">
        <p className="text-[12px] font-black uppercase tracking-[0.3em] text-neutral-900/50 dark:text-white/50">
          {message}
        </p>
      </div>

      {steps.length > 0 && <LoadingChecklist key={stepLabelsKey} steps={steps} />}
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
