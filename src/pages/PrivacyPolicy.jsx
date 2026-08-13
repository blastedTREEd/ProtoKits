import React from 'react';
import PageTemplate from './PageTemplate';
import { useTheme } from '../context/ThemeContext';

export default function Privacy({ isModal = false }) {
  const { isDarkMode } = useTheme();

  return (
    <PageTemplate isDarkMode={isDarkMode} compact={isModal}>
      <div className={`max-w-3xl mx-auto p-6 md:p-12 text-left space-y-6 ${isDarkMode ? 'text-neutral-200' : 'text-neutral-800'}`}>
        {/* HEADER */}
        <div>
          <h1 className={`text-3xl font-black uppercase tracking-tighter ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
            Privacy Policy
          </h1>
          <p className={`text-sm mt-1 ${isDarkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>Last Updated: July 15, 2024</p>
          <p className={`text-base mt-3 p-3 rounded-lg border inline-block ${
            isDarkMode 
              ? 'bg-neutral-900 border-neutral-800 text-neutral-400' 
              : 'bg-neutral-50 border-neutral-200 text-neutral-600'
          }`}>
            🛡️ <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>SnorlaxGarage</strong> respects your privacy. This policy explains how we collect and use information when you use our application.
          </p>
        </div>

        {/* DATA PRIVACY 3-COLUMN GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-base">
          
          {/* SECTION 1 */}
          <div className={`p-4 rounded-xl border space-y-2 ${
            isDarkMode 
              ? 'bg-neutral-900 border-neutral-800' 
              : 'bg-neutral-50 border-neutral-200'
          }`}>
            <h2 className={`font-bold flex items-center gap-1.5 text-lg ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
              👤 1. Data Collection
            </h2>
            <p className={isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}>
              When logging in via Google, we only collect and store:
            </p>
            <ul className={`list-disc pl-4 space-y-1 text-sm ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              <li><strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>User ID:</strong> Unique identifier from Google.</li>
              <li><strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>Name:</strong> Your public name to identify your account.</li>
            </ul>
          </div>

          {/* SECTION 2 */}
          <div className={`p-4 rounded-xl border space-y-2 ${
            isDarkMode 
              ? 'bg-neutral-900 border-neutral-800' 
              : 'bg-neutral-50 border-neutral-200'
          }`}>
            <h2 className={`font-bold flex items-center gap-1.5 text-lg ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
              ⚙️ 2. Data Usage
            </h2>
            <p className={isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}>
              We use your information strictly for the following:
            </p>
            <ul className={`list-disc pl-4 space-y-1 text-sm ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              <li>Identifying you as a registered user.</li>
              <li>Processing, tracking, and managing your orders.</li>
              <li>Providing support when needed.</li>
            </ul>
          </div>

          {/* SECTION 3 */}
          <div className={`p-4 rounded-xl border space-y-2 flex flex-col justify-between ${
            isDarkMode 
              ? 'bg-neutral-900 border-neutral-800' 
              : 'bg-neutral-50 border-neutral-200'
          }`}>
            <div>
              <h2 className={`font-bold flex items-center gap-1.5 text-lg ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
                🔒 3. Data Security
              </h2>
              <p className={`mt-2 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
                We secure login sessions and order history via <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>Firebase Authentication</strong> &amp; <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>Firestore</strong>.
              </p>
            </div>
            <p className={`text-sm border-t pt-2 mt-2 ${
              isDarkMode 
                ? 'border-neutral-800 text-neutral-500' 
                : 'border-neutral-200 text-neutral-500'
            }`}>
              We never sell, trade, or rent your personal data.
            </p>
          </div>

        </div>
      </div>
    </PageTemplate>
  );
}
