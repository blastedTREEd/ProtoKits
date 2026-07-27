import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { BarChart3, Box, FolderKanban, RefreshCw, Users } from 'lucide-react';
import { db } from '../firebase/firebase';
import { useTheme } from '../context/ThemeContext';
import { useStore } from '../store/useStore';
import PageTemplate from './PageTemplate';
import LoadingState from '../components/common/LoadingState';

const getUserName = (user) => user?.displayName || user?.email || user?.uid || 'Unknown User';

export default function UsersDashboard() {
  const { isDarkMode } = useTheme();
  const { isAdmin, isAdminView, usersList, subscribeUsersList } = useStore();
  const [dashboardUsers, setDashboardUsers] = useState([]);
  const [basketItems, setBasketItems] = useState([]);
  const [projectVaults, setProjectVaults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadDashboardData = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const users = usersSnap.docs.map((docSnap) => ({ uid: docSnap.id, ...docSnap.data() }));
      setDashboardUsers(users);

      const perUserData = await Promise.all(users.map(async (user) => {
        const [basketSnap, vaultSnap] = await Promise.all([
          getDocs(collection(db, 'users', user.uid, 'basket')),
          getDoc(doc(db, 'projectVaults', user.uid))
        ]);

        const legacyBasket = user.basket && typeof user.basket === 'object'
          ? (Array.isArray(user.basket) ? user.basket : Object.values(user.basket))
          : [];
        const subcollectionBasket = basketSnap.docs.map((basketDoc) => ({
          basketId: basketDoc.id,
          ...basketDoc.data()
        }));

        return {
          uid: user.uid,
          basketItems: [...legacyBasket, ...subcollectionBasket].map((item, index) => ({
            basketId: item.basketId || `legacy-${user.uid}-${index}`,
            ownerUid: user.uid,
            ...item
          })),
          projectVault: {
            uid: user.uid,
            items: vaultSnap.exists()
              ? (vaultSnap.data()?.items || [])
              : (Array.isArray(user.projectVault) ? user.projectVault : [])
          }
        };
      }));

      setBasketItems(perUserData.flatMap((entry) => entry.basketItems));
      setProjectVaults(perUserData.map((entry) => entry.projectVault));
    } catch (error) {
      console.error('SG LOG: Users dashboard load failed:', error);
      setLoadError('Unable to load basket/project usage. Check admin Firestore permissions.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const unsub = subscribeUsersList();
    loadDashboardData();
    return () => unsub?.();
  }, [subscribeUsersList]);

  const dashboard = useMemo(() => {
    const vaultByUid = new Map(projectVaults.map((vault) => [vault.uid, Array.isArray(vault.items) ? vault.items : []]));
    const basketByUid = basketItems.reduce((map, item) => {
      const uid = item.ownerUid || 'unknown';
      const current = map.get(uid) || { kitUnits: 0, projectUnits: 0, items: 0 };
      const quantity = Number(item.quantity || 1);
      current.items += 1;
      if (item.type === 'project') {
        current.projectUnits += quantity;
      } else {
        current.kitUnits += quantity;
      }
      map.set(uid, current);
      return map;
    }, new Map());

    const sourceUsers = dashboardUsers.length > 0 ? dashboardUsers : (usersList || []);
    const rows = sourceUsers.map((user) => {
      const basketStats = basketByUid.get(user.uid) || { kitUnits: 0, projectUnits: 0, items: 0 };
      const savedProjects = vaultByUid.get(user.uid)?.length || 0;
      return {
        uid: user.uid,
        name: getUserName(user),
        email: user.email || '',
        kitUnits: basketStats.kitUnits,
        projectBasketUnits: basketStats.projectUnits,
        savedProjects,
        totalActivity: basketStats.kitUnits + basketStats.projectUnits + savedProjects
      };
    }).sort((a, b) => b.totalActivity - a.totalActivity || a.name.localeCompare(b.name));

    return {
      rows,
      totalUsers: sourceUsers.length,
      totalKitUnits: rows.reduce((sum, row) => sum + row.kitUnits, 0),
      totalProjectBasketUnits: rows.reduce((sum, row) => sum + row.projectBasketUnits, 0),
      totalSavedProjects: rows.reduce((sum, row) => sum + row.savedProjects, 0),
      activeUsers: rows.filter((row) => row.totalActivity > 0).length
    };
  }, [basketItems, dashboardUsers, projectVaults, usersList]);

  if (!isAdmin || !isAdminView) {
    return (
      <PageTemplate isDarkMode={isDarkMode}>
        <div className="min-h-screen flex items-center justify-center text-center px-6">
          <p className="text-[12px] font-black uppercase tracking-[0.24em] opacity-50">Admin access required</p>
        </div>
      </PageTemplate>
    );
  }

  return (
    <PageTemplate isDarkMode={isDarkMode}>
      <div className="min-h-screen bg-neutral-50 dark:bg-[#0a0a0a] transition-colors duration-500">
        <div className="sticky top-[50px] z-[90] h-[60px] w-full bg-neutral-50 dark:bg-[#0a0a0a] border-b border-black/5 dark:border-white/5">
          <div className="max-w-7xl mx-auto px-4 md:px-8 h-full flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] opacity-40">Admin</p>
              <h1 className="text-lg font-black uppercase tracking-tight leading-none">Users Dashboard</h1>
            </div>
            <button
              onClick={loadDashboardData}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 disabled:opacity-40"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto w-full p-4 md:p-8 pb-32 space-y-6">
          {isLoading ? (
            <LoadingState message="Loading Users Dashboard" />
          ) : loadError ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-600">
              <p className="text-[11px] font-black uppercase tracking-[0.16em]">{loadError}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                  { label: 'Users', value: dashboard.totalUsers, icon: Users, color: 'text-blue-600' },
                  { label: 'Active Users', value: dashboard.activeUsers, icon: BarChart3, color: 'text-emerald-600' },
                  { label: 'Basket Kits', value: dashboard.totalKitUnits, icon: Box, color: 'text-amber-600' },
                  { label: 'Basket Projects', value: dashboard.totalProjectBasketUnits, icon: FolderKanban, color: 'text-purple-600' },
                  { label: 'Saved Projects', value: dashboard.totalSavedProjects, icon: FolderKanban, color: 'text-cyan-600' }
                ].map((metric) => (
                  <div key={metric.label} className="rounded-lg border border-black/5 dark:border-white/10 bg-white dark:bg-neutral-900 p-4">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40">{metric.label}</span>
                      <metric.icon size={16} className={metric.color} />
                    </div>
                    <p className={`text-3xl font-black italic leading-none ${metric.color}`}>{metric.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-black/5 dark:border-white/10 bg-white dark:bg-neutral-900 overflow-hidden">
                <div className="grid grid-cols-[1fr_72px_72px_72px] md:grid-cols-[1fr_110px_110px_110px] gap-2 px-4 py-3 border-b border-black/5 dark:border-white/10 text-[9px] font-black uppercase tracking-[0.18em] opacity-40">
                  <span>User</span>
                  <span className="text-right">Kits</span>
                  <span className="text-right">Basket Prints</span>
                  <span className="text-right">Saved Prints</span>
                </div>
                {dashboard.rows.map((row) => (
                  <div key={row.uid} className="grid grid-cols-[1fr_72px_72px_72px] md:grid-cols-[1fr_110px_110px_110px] gap-2 px-4 py-3 border-b last:border-b-0 border-black/5 dark:border-white/10 items-center">
                    <div className="min-w-0">
                      <p className="text-[12px] font-black uppercase truncate">{row.name}</p>
                      <p className="text-[10px] font-bold opacity-40 truncate">{row.email || row.uid}</p>
                    </div>
                    <p className="text-right text-sm font-black text-amber-600">{row.kitUnits}</p>
                    <p className="text-right text-sm font-black text-purple-600">{row.projectBasketUnits}</p>
                    <p className="text-right text-sm font-black text-cyan-600">{row.savedProjects}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </PageTemplate>
  );
}
