import React from 'react';
import PageTemplate from './PageTemplate';
import { useTheme } from '../context/ThemeContext';

export default function Shipping({ isModal = false }) {
  const { isDarkMode } = useTheme();

  return (
    <PageTemplate isDarkMode={isDarkMode} compact={isModal}>
      <div className={`max-w-3xl mx-auto p-6 md:p-12 text-left space-y-6 ${isDarkMode ? 'text-neutral-200' : 'text-neutral-800'}`}>
        {/* HEADER */}
        <div>
          <h1 className={`text-3xl font-black uppercase tracking-tighter ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
            Shipping Policy
          </h1>
          <p className={`text-sm mt-1 ${isDarkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>Last Updated: May 20, 2024</p>
          <p className={`text-sm mt-3 p-3 rounded-lg border inline-block ${
            isDarkMode 
              ? 'bg-neutral-900 border-neutral-800 text-neutral-400' 
              : 'bg-neutral-50 border-neutral-200 text-neutral-600'
          }`}>
            📦 At <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>SnorlaxGarage</strong>, we aim to deliver your items safely and efficiently.
          </p>
        </div>

        {/* SHIPPING INFO 2-COLUMN GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          
          {/* COLUMN 1: SHIPPING FEES */}
          <div className={`p-5 rounded-xl border space-y-2 ${
            isDarkMode 
              ? 'bg-neutral-900 border-neutral-800' 
              : 'bg-neutral-50 border-neutral-200'
          }`}>
            <h2 className={`font-bold flex items-center gap-1.5 text-base ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
              💰 Shipping Information
            </h2>
            <p className={isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}>
              Please note that shipping fees are <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>not included</strong> in the item prices. 
            </p>
            <p className={`text-xs border-t pt-2 ${
              isDarkMode 
                ? 'border-neutral-800 text-neutral-500' 
                : 'border-neutral-200 text-neutral-500'
            }`}>
              💡 Costs are calculated and clearly indicated at the checkout page based on your location and selected courier.
            </p>
          </div>

          {/* COLUMN 2: TIMELINE */}
          <div className={`p-5 rounded-xl border space-y-2 ${
            isDarkMode 
              ? 'bg-neutral-900 border-neutral-800' 
              : 'bg-neutral-50 border-neutral-200'
          }`}>
            <h2 className={`font-bold flex items-center gap-1.5 text-base ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
              ⏳ Delivery Timeline
            </h2>
            <p className={isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}>
              Delivery timelines vary depending on your location and the courier&apos;s service availability.
            </p>
            <p className={`text-xs border-t pt-2 ${
              isDarkMode 
                ? 'border-neutral-800 text-neutral-500' 
                : 'border-neutral-200 text-neutral-500'
            }`}>
              🚚 Once your item is shipped, you will automatically receive tracking information to monitor your package.
            </p>
          </div>

        </div>
      </div>
    </PageTemplate>
  );
}
