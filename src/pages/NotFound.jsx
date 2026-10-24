import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useStore } from '../store/useStore';
import { Home } from 'lucide-react';

export default function NotFound() {
  const { isDarkMode } = useTheme();
  const garageInfo = useStore((s) => s.garageInfo);
  const logoURL = garageInfo?.logoURL || '/facebook-page-fallback.png';

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-6 ${isDarkMode ? 'bg-[#0a0a0a] text-white' : 'bg-white text-neutral-900'}`}>
      
      {/* Brand Logo + Name — tapped to go home */}
      <Link to="/" className="flex flex-col items-center gap-3 group mb-10">
        <div className="relative">
          <div className="w-24 h-24 rounded-full flex items-center justify-center bg-gradient-to-br from-[#0866FF] to-[#00CFFF] shadow-xl shadow-blue-500/20 p-[3px] transition-transform duration-300 group-hover:scale-105">
            <div className={`w-full h-full rounded-full overflow-hidden flex items-center justify-center border-[2px] ${isDarkMode ? 'border-neutral-900' : 'border-white'} bg-white dark:bg-neutral-800`}>
              <img
                src={logoURL}
                alt="SnorlaxGarage Logo"
                className="w-full h-full object-cover"
                onError={(e) => { e.currentTarget.src = '/facebook-page-fallback.png'; }}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center uppercase font-black tracking-tighter leading-[0.85] select-none">
          <span className="text-2xl text-neutral-900 dark:text-white">SNORLAX</span>
          <span className="text-2xl text-garage-blue">GARAGE</span>
        </div>
      </Link>

      {/* 404 Content */}
      <div className="text-center max-w-md">
        <h1 className="text-[120px] sm:text-[160px] font-black leading-none tracking-tighter bg-gradient-to-br from-[#0866FF] to-[#00CFFF] bg-clip-text text-transparent select-none">
          404
        </h1>
        <p className="text-lg sm:text-xl font-bold uppercase tracking-widest mt-2 opacity-60">
          Page Not Found
        </p>
        <p className={`text-sm mt-4 leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
          The page you're looking for doesn't exist or may have been moved. 
          Let's get you back on track.
        </p>
      </div>

      {/* Go Home Button */}
      <Link
        to="/"
        className="mt-10 inline-flex items-center gap-2 px-8 py-3 rounded-full text-sm font-black uppercase tracking-widest bg-gradient-to-br from-[#0866FF] to-[#00CFFF] text-white shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 hover:scale-105 transition-all duration-300 active:scale-95"
      >
        <Home size={16} />
        Back to Home
      </Link>
    </div>
  );
}
