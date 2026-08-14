import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShoppingBasket } from 'lucide-react';
import PageTemplate from './PageTemplate';
import CheckoutModal from '../components/kitcards/CheckoutModal';
import { useStore } from '../store/useStore';
import { useTheme } from '../context/ThemeContext';

export default function Checkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const user = useStore((state) => state.user);
  const isAnonymousUser = useStore((state) => state.isAnonymousUser);
  const items = Array.isArray(location.state?.items) ? location.state.items : [];
  const isGuestPreview = !user || isAnonymousUser;

  if (items.length === 0) {
    return (
      <PageTemplate isDarkMode={isDarkMode}>
      <div className="min-h-dvh w-full bg-neutral-50 px-4 py-10 font-sans text-neutral-900 dark:bg-[#0a0a0a] dark:text-white lg:min-h-[calc(100dvh-60px)]">
          <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-[2rem] border border-black/5 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-neutral-950">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white">
              <ShoppingBasket size={26} />
            </div>
            <h1 className="text-xl font-black uppercase italic tracking-tight">Checkout is empty</h1>
            <p className="mt-2 text-sm font-bold opacity-50">Choose a kit, deal, basket item, or print before opening checkout.</p>
            <button
              type="button"
              onClick={() => navigate('/kits')}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition hover:scale-105"
            >
              <ArrowLeft size={16} />
              Back to Kits
            </button>
          </div>
        </div>
      </PageTemplate>
    );
  }

  return (
    <PageTemplate isDarkMode={isDarkMode}>
      <div className="min-h-dvh w-full bg-neutral-50 transition-colors duration-500 dark:bg-[#0a0a0a] lg:min-h-[calc(100dvh-60px)]">
        <CheckoutModal isOpen variant="page" items={items} isGuestPreview={isGuestPreview} onClose={() => navigate(-1)} />
      </div>
    </PageTemplate>
  );
}
