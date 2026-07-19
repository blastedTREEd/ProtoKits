import React from 'react';
import { MessageCircle } from 'lucide-react';

export default function FBMessageButton() {
  const openFacebook = () => {
    // Gamitin ang numeric Page ID para sa mas stable na deep linking
    const pageId = "123456789012345"; 
    const fbAppUrl = `fb://page/${pageId}`; // Bubuksan ang FB App sa Page Profile
    const webUrl = `https://www.facebook.com/${pageId}`;

    window.location.href = fbAppUrl;

    // Fallback kung walang FB App
    setTimeout(() => {
      if (document.hasFocus()) {
        window.open(webUrl, '_blank');
      }
    }, 500);
  };

  return (
    <button 
      onClick={openFacebook}
      className="fixed bottom-6 right-6 bg-[#0866FF] text-white p-3.5 rounded-full shadow-2xl hover:scale-110 transition-transform z-50 flex items-center gap-3 font-bold group"
    >
      <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-[#0866FF]">
        <span className="font-black text-2xl leading-none select-none">f</span>
      </div>
      <span className="hidden sm:inline pr-2 tracking-tight">Visit Facebook Page</span>
      
      {/* Tooltip */}
      <span className="absolute right-full mr-4 bg-white dark:bg-neutral-800 text-black dark:text-white px-3 py-1 rounded-lg text-xs shadow-lg opacity-0 group-hover:opacity-100 transition-opacity border dark:border-neutral-700 whitespace-nowrap pointer-events-none">
        Open in Facebook App
      </span>
    </button>
  );
}