import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { BarChart3, Box, CheckCircle2, Clock3, FolderKanban, RefreshCw, ShieldCheck, Trash2, Users } from 'lucide-react';
import { app, db } from '../firebase/firebase';
import { useTheme } from '../context/ThemeContext';
import { useStore } from '../store/useStore';
import PageTemplate from './PageTemplate';
import LoadingState from '../components/common/LoadingState';

const DAY_MS = 24 * 60 * 60 * 1000;
const ACCOUNT_COUNTDOWN_START_DAYS = 30;
const ACCOUNT_DELETION_TOTAL_DAYS = 60;
const functions = getFunctions(app, 'asia-southeast1');
const deleteUserAccount = httpsCallable(functions, 'adminDeleteUserAccount');

const getUserName = (user) => user?.displayName || user?.email || user?.uid || 'Unknown User';

const toMillis = (value) => {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (value && Number.isFinite(Number(value.seconds))) return Number(value.seconds) * 1000;
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const isProjectItem = (item) => item?.type === 'project' || Boolean(item?.projectData);

const isPreOrderItem = (item) => {
  if (item?.isPreOrder === true) return true;
  const status = String(item?.status || item?.stockStatus || '').toLowerCase();
  return status.includes('pre') || status.includes('batch') || status.includes('eta');
};

const isActiveOrder = (order) => !['cancelled', 'completed'].includes(String(order?.status || '').toLowerCase());

const getRole = (user, adminByUid) => {
  const adminRecord = adminByUid.get(String(user.uid));
  if (adminRecord) return adminRecord.role || 'admin';
  return user.role || user.userDetails?.role || 'customer';
};

const formatCount = (value) => Number(value || 0).toLocaleString();

export default function UsersDashboard() {
  const { isDarkMode } = useTheme();
  const { isAdmin, isAdminView, usersList, subscribeUsersList } = useStore();
  const [dashboardUsers, setDashboardUsers] = useState([]);
  const [adminRecords, setAdminRecords] = useState([]);
  const [basketItems, setBasketItems] = useState([]);
  const [projectVaults, setProjectVaults] = useState([]);
  const [orderRecords, setOrderRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [deletingUid, setDeletingUid] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const loadDashboardData = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const cachedUsers = useStore.getState().usersList;
      const hasCachedUsers = Array.isArray(cachedUsers) && cachedUsers.length > 0;
      const [usersSnap, ordersSnap, adminsSnap] = await Promise.all([
        hasCachedUsers ? Promise.resolve(null) : getDocs(collection(db, 'users')),
        getDocs(collection(db, 'orders')),
        getDocs(collection(db, 'admins'))
      ]);
      const users = hasCachedUsers
        ? cachedUsers
        : usersSnap.docs.map((docSnap) => ({ uid: docSnap.id, ...docSnap.data() }));
      const orders = ordersSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      const admins = adminsSnap.docs.map((docSnap) => ({ uid: docSnap.id, ...docSnap.data() }));

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

      setDashboardUsers(users);
      setAdminRecords(admins);
      setOrderRecords(orders);
      setBasketItems(perUserData.flatMap((entry) => entry.basketItems));
      setProjectVaults(perUserData.map((entry) => entry.projectVault));
    } catch (error) {
      console.error('SG LOG: Users dashboard load failed:', error);
      setLoadError('Unable to load user activity. Check admin Firestore permissions.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeUsersList();
    void loadDashboardData();
    return () => unsubscribe?.();
  }, [loadDashboardData, subscribeUsersList]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  const dashboard = useMemo(() => {
    const sourceUsers = dashboardUsers.length > 0 ? dashboardUsers : (usersList || []);
    const adminByUid = new Map(adminRecords.map((record) => [String(record.uid), record]));
    const vaultByUid = new Map(projectVaults.map((vault) => [
      String(vault.uid),
      Array.isArray(vault.items) ? vault.items : []
    ]));
    const basketByUid = basketItems.reduce((map, item) => {
      const uid = String(item.ownerUid || 'unknown');
      const current = map.get(uid) || {
        kitUnits: 0,
        projectUnits: 0,
        preOrderKitUnits: 0
      };
      const quantity = Math.max(1, Number(item.quantity) || 1);
      if (isProjectItem(item)) {
        current.projectUnits += quantity;
      } else {
        current.kitUnits += quantity;
        if (isPreOrderItem(item)) current.preOrderKitUnits += quantity;
      }
      map.set(uid, current);
      return map;
    }, new Map());
    const orderByUid = orderRecords.reduce((map, order) => {
      const uid = String(order.userId || '');
      if (!uid) return map;
      const current = map.get(uid) || {
        completedOrders: 0,
        queuedProjectUnits: 0,
        preOrderKitUnits: 0
      };
      if (String(order.status || '').toLowerCase() === 'completed') {
        current.completedOrders += 1;
      }
      if (isActiveOrder(order)) {
        (order.items || []).forEach((item) => {
          const quantity = Math.max(1, Number(item.quantity) || 1);
          if (isProjectItem(item)) {
            current.queuedProjectUnits += quantity;
          } else if (isPreOrderItem(item)) {
            current.preOrderKitUnits += quantity;
          }
        });
      }
      map.set(uid, current);
      return map;
    }, new Map());

    const rows = sourceUsers.map((user) => {
      const uid = String(user.uid);
      const basketStats = basketByUid.get(uid) || { kitUnits: 0, projectUnits: 0, preOrderKitUnits: 0 };
      const orderStats = orderByUid.get(uid) || { completedOrders: 0, queuedProjectUnits: 0, preOrderKitUnits: 0 };
      const savedProjects = vaultByUid.get(uid)?.length || 0;
      const lastLoginMillis = toMillis(user.lastLoginAt || user.lastActivityAt || user.createdAt);
      const requestedDeletionMillis = toMillis(user.deletionRequestedAt);
      const configuredDeletionMillis = toMillis(user.deletionScheduledAt);
      const deletionMillis = configuredDeletionMillis || (requestedDeletionMillis
        ? requestedDeletionMillis + (ACCOUNT_DELETION_TOTAL_DAYS - ACCOUNT_COUNTDOWN_START_DAYS) * DAY_MS
        : (lastLoginMillis ? lastLoginMillis + (ACCOUNT_DELETION_TOTAL_DAYS * DAY_MS) : 0));
      const countdownStarted = Boolean(
        requestedDeletionMillis
          ? now < deletionMillis
          : lastLoginMillis && now >= lastLoginMillis + (ACCOUNT_COUNTDOWN_START_DAYS * DAY_MS)
      );
      const daysUntilDeletion = deletionMillis
        ? Math.max(0, Math.ceil((deletionMillis - now) / DAY_MS))
        : null;
      const role = getRole(user, adminByUid);
      const isUserAdmin = adminByUid.has(uid);

      return {
        uid,
        name: getUserName(user),
        email: user.email || '',
        role,
        isAdmin: isUserAdmin,
        savedProjects,
        completedOrders: orderStats.completedOrders,
        queuedProjectUnits: orderStats.queuedProjectUnits,
        preOrderKitUnits: basketStats.preOrderKitUnits + orderStats.preOrderKitUnits,
        kitUnits: basketStats.kitUnits,
        projectBasketUnits: basketStats.projectUnits,
        totalActivity: basketStats.kitUnits + basketStats.projectUnits + savedProjects + orderStats.completedOrders,
        countdownStarted,
        daysUntilDeletion
      };
    }).sort((a, b) => {
      if (a.isAdmin !== b.isAdmin) return Number(a.isAdmin) - Number(b.isAdmin);
      if (a.daysUntilDeletion !== null && b.daysUntilDeletion !== null && a.daysUntilDeletion !== b.daysUntilDeletion) {
        return a.daysUntilDeletion - b.daysUntilDeletion;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      rows,
      totalUsers: sourceUsers.length,
      activeUsers: rows.filter((row) => row.totalActivity > 0).length,
      totalCompletedOrders: rows.reduce((sum, row) => sum + row.completedOrders, 0),
      totalQueuedProjects: rows.reduce((sum, row) => sum + row.queuedProjectUnits, 0),
      totalPreOrderKits: rows.reduce((sum, row) => sum + row.preOrderKitUnits, 0),
      totalSavedProjects: rows.reduce((sum, row) => sum + row.savedProjects, 0)
    };
  }, [adminRecords, basketItems, dashboardUsers, now, orderRecords, projectVaults, usersList]);

  const handleDeleteUser = async (row) => {
    if (!row || row.isAdmin || deletingUid) return;
    const confirmed = window.confirm(
      `Immediately delete ${row.name}'s account?\n\nTheir Auth account, profile, basket, project vault, and user-owned notifications will be permanently removed. Completed order records will be retained.`
    );
    if (!confirmed) return;

    setDeletingUid(row.uid);
    try {
      await deleteUserAccount({ uid: row.uid });
      setDashboardUsers((current) => current.filter((user) => user.uid !== row.uid));
      setBasketItems((current) => current.filter((item) => item.ownerUid !== row.uid));
      setProjectVaults((current) => current.filter((vault) => vault.uid !== row.uid));
    } catch (error) {
      console.error('SG LOG: Immediate user deletion failed:', error);
      window.alert(error?.message || 'The user account could not be deleted.');
    } finally {
      setDeletingUid('');
    }
  };

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
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Users', value: dashboard.totalUsers, icon: Users, color: 'text-blue-600' },
                  { label: 'Active Users', value: dashboard.activeUsers, icon: BarChart3, color: 'text-emerald-600' },
                  { label: 'Completed Orders', value: dashboard.totalCompletedOrders, icon: CheckCircle2, color: 'text-cyan-600' },
                  { label: 'Queued Projects', value: dashboard.totalQueuedProjects, icon: FolderKanban, color: 'text-purple-600' },
                  { label: 'Pre-order Kits', value: dashboard.totalPreOrderKits, icon: Box, color: 'text-amber-600' },
                  { label: 'Saved Projects', value: dashboard.totalSavedProjects, icon: FolderKanban, color: 'text-blue-500' }
                ].map((metric) => (
                  <div key={metric.label} className="rounded-lg border border-black/5 dark:border-white/10 bg-white dark:bg-neutral-900 p-4">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40">{metric.label}</span>
                      <metric.icon size={16} className={metric.color} />
                    </div>
                    <p className={`text-3xl font-black italic leading-none ${metric.color}`}>{formatCount(metric.value)}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-black/5 dark:border-white/10 bg-white dark:bg-neutral-900 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1120px] text-left">
                    <thead>
                      <tr className="border-b border-black/5 dark:border-white/10 text-[9px] font-black uppercase tracking-[0.18em] opacity-40">
                        <th className="px-4 py-3">User</th>
                        <th className="px-3 py-3">Role</th>
                        <th className="px-3 py-3 text-right">Projects</th>
                        <th className="px-3 py-3 text-right">Completed Orders</th>
                        <th className="px-3 py-3 text-right">Project Queue</th>
                        <th className="px-3 py-3 text-right">Pre-order Kits</th>
                        <th className="px-3 py-3 text-right">Account Deletion</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.rows.map((row) => {
                        const deletionLabel = row.isAdmin
                          ? 'PROTECTED'
                          : row.daysUntilDeletion === null
                            ? 'NO DATE'
                            : row.daysUntilDeletion === 0
                              ? 'DUE NOW'
                              : `${row.daysUntilDeletion} ${row.daysUntilDeletion === 1 ? 'DAY' : 'DAYS'}`;
                        const deletionClass = row.isAdmin
                          ? 'text-blue-600'
                          : row.daysUntilDeletion !== null && row.daysUntilDeletion <= ACCOUNT_DELETION_TOTAL_DAYS - ACCOUNT_COUNTDOWN_START_DAYS
                            ? 'text-red-600'
                            : 'text-emerald-600';

                        return (
                          <tr key={row.uid} className="border-b last:border-b-0 border-black/5 dark:border-white/10 align-middle">
                            <td className="px-4 py-3">
                              <p className="text-[12px] font-black uppercase truncate max-w-[230px]" title={row.name}>{row.name}</p>
                              <p className="text-[10px] font-bold opacity-40 truncate max-w-[230px]" title={row.email || row.uid}>{row.email || row.uid}</p>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider ${row.isAdmin ? 'bg-blue-500/10 text-blue-600' : 'bg-black/5 text-neutral-600 dark:bg-white/10 dark:text-neutral-300'}`}>
                                {row.isAdmin && <ShieldCheck size={11} />}
                                {row.role}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right text-sm font-black text-blue-500">{formatCount(row.savedProjects)}</td>
                            <td className="px-3 py-3 text-right text-sm font-black text-cyan-600">{formatCount(row.completedOrders)}</td>
                            <td className="px-3 py-3 text-right text-sm font-black text-purple-600">
                              {row.queuedProjectUnits > 0 ? `${formatCount(row.queuedProjectUnits)} QUEUED` : 'NONE'}
                            </td>
                            <td className="px-3 py-3 text-right text-sm font-black text-amber-600">
                              {row.preOrderKitUnits > 0 ? formatCount(row.preOrderKitUnits) : 'NONE'}
                            </td>
                            <td className={`px-3 py-3 text-right text-[11px] font-black uppercase ${deletionClass}`}>
                              <span className="inline-flex items-center justify-end gap-1">
                                {row.countdownStarted && !row.isAdmin ? <Clock3 size={12} /> : null}
                                {deletionLabel}
                              </span>
                              {!row.isAdmin && row.countdownStarted && row.daysUntilDeletion > 0 && (
                                <span className="block text-[8px] font-bold opacity-55">COUNTDOWN ACTIVE</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(row)}
                                disabled={row.isAdmin || deletingUid === row.uid || Boolean(deletingUid)}
                                title={row.isAdmin ? 'Admin accounts are protected' : 'Delete account immediately'}
                                className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-red-600 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <Trash2 size={12} />
                                {deletingUid === row.uid ? 'Deleting' : 'Delete'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {dashboard.rows.length === 0 && (
                    <div className="p-8 text-center text-[11px] font-black uppercase tracking-widest opacity-40">No users found</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </PageTemplate>
  );
}
