import React, { useEffect, useState } from 'react';
import PageTemplate from './PageTemplate';
import { useStore } from '../store/useStore';
import { useTheme } from '../context/ThemeContext';
import { Library, Search, Loader2 } from 'lucide-react';
import ProjectCard from '../components/calculator/ProjectCard';
import LoadingState from '../components/common/LoadingState';

export default function Blueprints() {
  const { isDarkMode } = useTheme();
  const blueprints = useStore((state) => state.blueprints);
  const basket = useStore((state) => state.basket);
  const addProjectToBasket = useStore((state) => state.addProjectToBasket);
  const removeFromBasket = useStore((state) => state.removeFromBasket);
  const isLoading = useStore((state) => state.isLoading);
  const loadBlueprints = useStore((state) => state.loadBlueprints);
  const subscribeOrders = useStore((state) => state.subscribeOrders);
  const user = useStore((state) => state.user);
  const isAdmin = useStore((state) => state.isAdmin);
  const isAdminView = useStore((state) => state.isAdminView);
  
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadBlueprints();
  }, [loadBlueprints]);

  useEffect(() => {
    if (!user?.uid) return undefined;

    const unsubscribe = subscribeOrders({
      uid: user.uid,
      isAdminMode: isAdmin && isAdminView
    });
    return () => unsubscribe?.();
  }, [subscribeOrders, user?.uid, isAdmin, isAdminView]);

  const filteredBlueprints = (blueprints || []).filter(p => 
    p.projectName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.method?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleBasketAction = (e, project) => {
    e.stopPropagation();
    const basketItem = basket.find(item => item.type === 'project' && (item.projectData?.vaultId === project.vaultId || item.projectData?.id === project.id));
    
    if (basketItem) {
      removeFromBasket(basketItem.basketId);
    } else {
      addProjectToBasket(project);
    }
  };

  return (
    <PageTemplate isDarkMode={isDarkMode}>
      <div className="min-h-screen w-full bg-neutral-50 dark:bg-[#0a0a0a] transition-colors duration-500 pb-20 font-sans">
        
        {/* HEADER */}
        <header className="pt-24 pb-8 px-6 md:px-8">
          <div className="max-w-full mx-auto flex flex-col md:flex-row md:items-center justify-between border-b border-black/5 dark:border-white/5 pb-6 gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                <Library size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-black italic uppercase tracking-tighter text-neutral-900 dark:text-white leading-none">
                  Blueprint <span className="text-blue-600">Library</span>
                </h1>
                <p className="text-[10px] font-bold opacity-40 uppercase tracking-[0.3em] text-neutral-900 dark:text-white mt-1">
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={10} className="animate-spin" /> SYNCING...
                    </span>
                  ) : `${filteredBlueprints.length} Ready-to-print projects`}
                </p>
              </div>
            </div>

            <div className="relative flex-1 max-w-md">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20" size={18} />
               <input 
                 type="text" 
                 placeholder="Search community blueprints..." 
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
                 className="w-full pl-12 pr-6 py-4 rounded-2xl bg-white dark:bg-neutral-900 border border-black/5 dark:border-white/5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition-all"
               />
            </div>
          </div>
        </header>

        <main className="max-w-full mx-auto px-4 md:px-8 mt-4">
          {isLoading && filteredBlueprints.length === 0 ? (
            <LoadingState />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-5 gap-4 md:gap-6">
            {filteredBlueprints.map((project) => {
              const isInBasket = basket.some(item => item.type === 'project' && (item.projectData?.vaultId === project.vaultId || item.projectData?.id === project.id));
              
              return (
                <ProjectCard 
                  key={project.id}
                  project={project}
                  type="blueprint"
                  isInBasket={isInBasket}
                  onBasketAction={handleBasketAction}
                  isReadOnly={true}
                />
              );
            })}
            </div>
          )}

          {!isLoading && filteredBlueprints.length === 0 && (
            <div className="mt-20 text-center opacity-20">
              <Library size={48} className="mx-auto mb-4" />
              <p className="font-black italic uppercase tracking-widest">Library is currently empty</p>
            </div>
          )}
        </main>
      </div>
    </PageTemplate>
  );
}
