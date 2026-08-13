import React from 'react';
import PageTemplate from './PageTemplate';
import { useTheme } from '../context/ThemeContext';

export default function Terms({ isModal = false }) {
  const { isDarkMode } = useTheme();

  return (
    <PageTemplate isDarkMode={isDarkMode} compact={isModal}>
      <div className={`max-w-3xl mx-auto p-6 md:p-12 text-left space-y-6 ${isDarkMode ? 'text-neutral-200' : 'text-neutral-800'}`}>
        {/* HEADER */}
        <div>
          <h1 className={`text-3xl font-black uppercase tracking-tighter ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
            Terms of Use
          </h1>
          <p className={`text-sm mt-1 ${isDarkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>Last Updated: June 28, 2024</p>
          <p className={`text-base mt-3 p-3 rounded-lg border inline-block ${
            isDarkMode 
              ? 'bg-neutral-900 border-neutral-800 text-neutral-400' 
              : 'bg-neutral-50 border-neutral-200 text-neutral-600'
          }`}>
            👉 By using <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>SnorlaxGarage</strong>, you agree to these Terms of Use. Please read them carefully.
          </p>
        </div>

        {/* TOP GRID: SECTIONS 1 TO 3 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-base">
          {/* SECTION 1 */}
          <div className={`p-4 rounded-xl border space-y-1 ${
            isDarkMode 
              ? 'bg-neutral-900 border-neutral-800' 
              : 'bg-neutral-50 border-neutral-200'
          }`}>
            <h2 className={`font-bold flex items-center gap-1.5 text-lg ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
              📜 1. Acceptance
            </h2>
            <p className={isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}>
              By accessing our services, you agree to these terms. If you do not agree, please do not use our services.
            </p>
          </div>

          {/* SECTION 2 */}
          <div className={`p-4 rounded-xl border space-y-1 ${
            isDarkMode 
              ? 'bg-neutral-900 border-neutral-800' 
              : 'bg-neutral-50 border-neutral-200'
          }`}>
            <h2 className={`font-bold flex items-center gap-1.5 text-lg ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
              🔒 2. Use of Service
            </h2>
            <p className={isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}>
              Use SnorlaxGarage only for lawful purposes. You are responsible for keeping your account info confidential.
            </p>
          </div>

          {/* SECTION 3 */}
          <div className={`p-4 rounded-xl border space-y-1 ${
            isDarkMode 
              ? 'bg-neutral-900 border-neutral-800' 
              : 'bg-neutral-50 border-neutral-200'
          }`}>
            <h2 className={`font-bold flex items-center gap-1.5 text-lg ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
              ⚖️ 3. Liability Limit
            </h2>
            <p className={isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}>
              SnorlaxGarage shall not be liable for any indirect or consequential damages resulting from your use of the app.
            </p>
          </div>
        </div>

        {/* SECTION 4 AS A FULL-WIDTH BIG CARD */}
        <div className={`p-6 rounded-xl border space-y-4 text-base ${
          isDarkMode 
            ? 'bg-neutral-900 border-neutral-800' 
            : 'bg-neutral-50 border-neutral-200'
        }`}>
          <h2 className={`font-bold flex items-center gap-2 border-b pb-2 text-lg ${
            isDarkMode ? 'text-white border-neutral-800' : 'text-neutral-900 border-neutral-200'
          }`}>
            🤖 4. 3D Model Files &amp; Licensing
          </h2>
          
          <p className={isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}>
            When submitting a Google Drive link containing{' '}
            <span className={`font-mono px-1.5 py-0.5 rounded text-xs ${
              isDarkMode ? 'text-white bg-neutral-800' : 'text-neutral-900 bg-neutral-200'
            }`}>STL</span>,{' '}
            <span className={`font-mono px-1.5 py-0.5 rounded text-xs ${
              isDarkMode ? 'text-white bg-neutral-800' : 'text-neutral-900 bg-neutral-200'
            }`}>3MF</span>, or other 3D files, you guarantee that:
          </p>

          <ul className={`list-disc pl-6 space-y-2 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
            <li>You have the <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>legal right, license, or permission</strong> to print and reproduce the model.</li>
            <li>The files <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>do not infringe</strong> on any third-party intellectual property (copyrights, trademarks, patents).</li>
            <li>You accept <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>full legal responsibility</strong> for any IP or licensing concerns related to your files.</li>
          </ul>

          {/* INTERNAL DISCLAIMER SUB-BOX */}
          <div className={`p-4 border rounded-xl ${
            isDarkMode 
              ? 'bg-blue-950/20 border-blue-900 text-neutral-400' 
              : 'bg-blue-50 border-blue-200 text-neutral-600'
          }`}>
            <p className={`font-bold mb-1 ${isDarkMode ? 'text-blue-400' : 'text-blue-700'}`}>
              🔗 File Submission &amp; Ownership Disclaimer:
            </p>
            <p>
              SnorlaxGarage <strong>only accepts Google Drive links</strong> for submissions. We do not verify, host, or claim ownership of any files linked by users, and we shall not be held liable for any disputes or damages arising from third-party 3D models.
            </p>
          </div>
        </div>

      </div>
    </PageTemplate>
  );
}
