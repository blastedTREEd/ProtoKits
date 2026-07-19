import React from 'react';

export default function PageTemplate({ isDarkMode, children }) {
  return (
    <div className={`min-h-screen w-full transition-colors duration-500 ${
      isDarkMode ? 'bg-[#0a0a0a]' : 'bg-transparent'
    }`}>
      <div className="w-full">
        {children}
      </div>
    </div>
  );
}