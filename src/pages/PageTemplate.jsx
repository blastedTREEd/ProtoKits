import React from 'react';

export default function PageTemplate({ isDarkMode, children, compact = false }) {
  return (
    <div className={`${compact ? 'min-h-0' : 'min-h-screen'} w-full transition-colors duration-500 ${
    isDarkMode ? 'bg-[var(--color-bg)]' : 'bg-transparent'
    }`}>
      <div className="w-full">
        {children}
      </div>
    </div>
  );
}
