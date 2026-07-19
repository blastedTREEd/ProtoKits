import React from 'react';
import { Link } from 'react-router-dom';
import { FaFacebook } from 'react-icons/fa';
import { useStore } from '../../store/useStore';

const openFacebookPage = (pageId) => {
  if (!pageId) return;
  
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isAndroid = /android/i.test(userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
  
  const webUrl = /^\d+$/.test(pageId) 
    ? `https://www.facebook.com/profile.php?id=${pageId}` 
    : `https://www.facebook.com/${pageId}`;
    
  if (isAndroid || isIOS) {
    // Subukang buksan ang App gamit ang deep link
    const appUrl = isAndroid ? `fb://page/${pageId}` : `fb://profile/${pageId}`;
    
    // I-attempt buksan ang app
    window.location.href = appUrl;
    
    // Fallback sa browser pagkalipas ng 500ms kung hindi nabuksan ang app
    setTimeout(() => {
        window.open(webUrl, '_blank', 'noopener,noreferrer');
    }, 500);
  } else {
    // Desktop: Diretsong buksan sa bagong tab
    window.open(webUrl, '_blank', 'noopener,noreferrer');
  }
};

export default function Footer() {
  const { garageInfo } = useStore();
  const fbPageId = garageInfo?.fbPageId;

  return (
    <footer className="bg-neutral-100 dark:bg-[#111] pt-6 pb-12 px-6 border-t border-black/5 dark:border-white/5 pb-20 md:pb-12">
      <div className="container mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="col-span-1 md:col-span-2">
            <h3 className="text-sm font-black uppercase tracking-widest mb-2">SnorlaxGarage</h3>
            <p className="text-xs opacity-60 mb-2">Your trusted source for garage kits and collectibles.</p>
            <div className="flex items-center gap-4">
                <Link to="/about-us" className="text-xs hover:text-blue-600 transition-colors uppercase tracking-widest">About Us</Link>
                {fbPageId && (
                  <button onClick={() => openFacebookPage(fbPageId)} className="text-blue-600 hover:text-blue-700 transition-colors">
                      <FaFacebook size={18} />
                  </button>
                )}
            </div>
        </div>
        <div className="flex flex-col gap-2">
            <Link to="/privacy-policy" className="text-xs hover:text-blue-600 transition-colors uppercase tracking-widest">Privacy Policy</Link>
            <Link to="/terms-of-use" className="text-xs hover:text-blue-600 transition-colors uppercase tracking-widest">Terms of Use</Link>
        </div>
        <div className="flex flex-col gap-2">
            <Link to="/data-deletion" className="text-xs hover:text-blue-600 transition-colors uppercase tracking-widest">Data Deletion</Link>
            <Link to="/shipping-policy" className="text-xs hover:text-blue-600 transition-colors uppercase tracking-widest">Shipping Policy</Link>
            <Link to="/payment-and-refund-policy" className="text-xs hover:text-blue-600 transition-colors uppercase tracking-widest">Payment & Refund</Link>
        </div>
      </div>
    </footer>
  );
}
