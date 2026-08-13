import React from 'react';
import PageTemplate from './PageTemplate';
import { useTheme } from '../context/ThemeContext';

export default function Deletion({ isModal = false }) {
  const { isDarkMode } = useTheme();

  return (
    <PageTemplate isDarkMode={isDarkMode} compact={isModal}>
      <div className={`max-w-3xl mx-auto p-6 md:p-12 text-left space-y-6 ${isDarkMode ? 'text-neutral-200' : 'text-neutral-800'}`}>
        {/* HEADER */}
        <div>
          <h1 className={`text-3xl font-black uppercase tracking-tighter ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
            Data Deletion Instructions
          </h1>
          <p className={`text-sm mt-1 ${isDarkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>Last Updated: May 20, 2024</p>
          <p className={`text-base mt-3 p-3 rounded-lg border inline-block ${
            isDarkMode 
              ? 'bg-neutral-900 border-neutral-800 text-neutral-400' 
              : 'bg-neutral-50 border-neutral-200 text-neutral-600'
          }`}>
            🧹 If you wish to delete your account and associated data from <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>SnorlaxGarage</strong>, please follow the steps below.
          </p>
        </div>

        {/* 2-COLUMN SIDE-BY-SIDE LAYOUT */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-base">
          
          {/* COLUMN 1: HOW TO REQUEST */}
          <div className={`p-5 rounded-xl border flex flex-col justify-between ${
            isDarkMode 
              ? 'bg-neutral-900 border-neutral-800' 
              : 'bg-neutral-50 border-neutral-200'
          }`}>
            <div>
              <h2 className={`font-bold flex items-center gap-1.5 text-lg ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
                📬 How to Request Deletion
              </h2>
              <p className={`leading-relaxed mt-2 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
                To request the deletion of your account and personal data, please message us through our official <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>Facebook Page</strong>.
              </p>
            </div>
            
            <div className={`p-3 rounded-lg border text-sm space-y-1 mt-4 ${
              isDarkMode 
                ? 'bg-neutral-950 border-neutral-800 text-neutral-400' 
                : 'bg-neutral-100 border-neutral-200 text-neutral-600'
            }`}>
              <p>📌 <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>Subject:</strong> "Account Deletion Request"</p>
              <p>📋 <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>Details needed:</strong> Your registered name and the Facebook account used to log in.</p>
            </div>
          </div>

          {/* COLUMN 2: TIMELINE AND RETENTION */}
          <div className={`p-5 rounded-xl border space-y-3 ${
            isDarkMode 
              ? 'bg-neutral-900 border-neutral-800' 
              : 'bg-neutral-50 border-neutral-200'
          }`}>
            <h2 className={`font-bold flex items-center gap-1.5 text-lg ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
              ⏳ Retention &amp; Process
            </h2>
            <p className={`mt-2 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              Upon receiving your valid request, we will initiate the following timeline:
            </p>
            <ul className={`list-disc pl-4 space-y-2 text-sm mt-2 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              <li>
                <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>Deactivation:</strong> Your account is immediately deactivated and becomes inaccessible.
              </li>
              <li>
                <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>2-Month Retention:</strong> Data is kept for <span className={isDarkMode ? 'text-white font-semibold' : 'text-neutral-900 font-semibold'}>two (2) months</span> for recovery in case the request was made in error.
              </li>
              <li>
                <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>Final Deletion:</strong> After 2 months, your User ID, name, and order history are <span className={`${isDarkMode ? 'text-red-400' : 'text-red-600'} font-semibold`}>permanently and irreversibly deleted</span>.
              </li>
            </ul>
          </div>

        </div>
      </div>
    </PageTemplate>
  );
}
