import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaFacebook } from 'react-icons/fa';
import { useStore } from '../../store/useStore';
import PolicyModal from './PolicyModal';

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
  const [activePolicy, setActivePolicy] = useState(null);
  const openPolicy = (policy) => setActivePolicy(policy);
  const closePolicy = () => setActivePolicy(null);

  return (
    <>
      <footer id="site-footer" className="border-t border-black/5 bg-neutral-100 px-6 pb-20 pt-6 dark:border-white/5 dark:bg-[#111] md:pb-12">
        <div className="container mx-auto grid max-w-7xl grid-cols-1 gap-8 md:grid-cols-4">
          <div className="col-span-1 md:col-span-2">
              <h3 className="mb-2 text-sm font-black uppercase tracking-widest">SnorlaxGarage</h3>
              <p className="mb-2 text-xs opacity-60">Your trusted source for garage kits and collectibles.</p>
              <div className="flex items-center gap-4">
                  <Link to="/about-us" className="text-xs uppercase tracking-widest transition-colors hover:text-blue-600">About Us</Link>
                  {fbPageId && (
                    <button onClick={() => openFacebookPage(fbPageId)} className="text-blue-600 transition-colors hover:text-blue-700">
                        <FaFacebook size={18} />
                    </button>
                  )}
              </div>
          </div>
          <div className="flex flex-col gap-2">
              <button onClick={() => openPolicy('privacy')} className="text-left text-xs uppercase tracking-widest transition-colors hover:text-blue-600">Privacy Policy</button>
              <button onClick={() => openPolicy('terms')} className="text-left text-xs uppercase tracking-widest transition-colors hover:text-blue-600">Terms of Use</button>
          </div>
          <div className="flex flex-col gap-2">
              <button onClick={() => openPolicy('deletion')} className="text-left text-xs uppercase tracking-widest transition-colors hover:text-blue-600">Data Deletion</button>
              <button onClick={() => openPolicy('shipping')} className="text-left text-xs uppercase tracking-widest transition-colors hover:text-blue-600">Shipping Policy</button>
              <button onClick={() => openPolicy('payment')} className="text-left text-xs uppercase tracking-widest transition-colors hover:text-blue-600">Payment &amp; Refund</button>
          </div>
        </div>
      </footer>
      <PolicyModal policy={activePolicy} isOpen={Boolean(activePolicy)} onClose={closePolicy} />
    </>
  );
}
