import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { db, auth } from '../firebase/firebase';
import { 
  collection, onSnapshot, doc, query, orderBy, where, limit, getDocs, getDoc, setDoc, updateDoc, deleteDoc, deleteField, serverTimestamp, addDoc, writeBatch
} from 'firebase/firestore';
import { getCheckoutPaymentFees } from '../utils/paymentSettings';

const getKitTimestamp = (kit) => {
  const value = kit?.lastUpdated;
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  return new Date(value).getTime() || 0;
};

const getAvailableStockCount = (kit) => {
  return Object.values(kit?.stocks || {}).filter((stock) => !stock?.order?.orderId && !stock?.isReserved).length;
};

const getKitSortGroup = (kit) => {
  const stocks = Object.values(kit?.stocks || {});
  if (stocks.length === 0) return 1; // Group 3: No stocks at all

  const hasAvailable = stocks.some(s => !s.order?.orderId && !s.isReserved);
  if (hasAvailable) return 3; // Group 1: Has available stock

  const hasShelf = stocks.some(s => !s.order?.orderId && s.isReserved);
  if (hasShelf) return 2; // Group 2: Has stocks but reserved/in-shelf

  return 1; // Group 3: All stocks sold
};

const sortKitsByAvailability = (kits = []) => {
  return [...kits].sort((a, b) => {
    const groupA = getKitSortGroup(a);
    const groupB = getKitSortGroup(b);
    if (groupA !== groupB) return groupB - groupA;

    // Tie-breaker for same group
    if (groupA === 3) {
      const availA = getAvailableStockCount(a);
      const availB = getAvailableStockCount(b);
      if (availA !== availB) return availB - availA;
    }

    return getKitTimestamp(b) - getKitTimestamp(a);
  });
};

const mergeKitsStable = (currentKits = [], incomingKits = []) => {
  const incomingById = new Map(incomingKits.map((kit) => [kit.id, kit]));
  const currentIds = new Set(currentKits.map((kit) => kit.id));
  const updatedExisting = currentKits.map((kit) => incomingById.get(kit.id) || kit);
  const newKits = incomingKits.filter((kit) => !currentIds.has(kit.id));

  return [...updatedExisting, ...sortKitsByAvailability(newKits)];
};

const docsToArray = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

const createKitTargetId = (name, line = '', scale = '', brand = '') => {
  const parts = [];
  const b = (brand || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (b) parts.push(b);
  const g = (line || '').toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
  if (g) parts.push(g);
  const r = (scale || '').toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
  if (r) parts.push(r);
  const n = (name || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (n) parts.push(n);
  return parts.join('_');
};

export const useStore = create(
  persist(
    (set, get) => ({
      garageInfo: null,
      rates: {},
      kits: [],
      stories: [],
      methods: [],
      printers: [],
      feeders: [],
      filamentInventory: [],
      extras: [],
      blueprints: [],
      deals: [],
      notifyList: [],
      orders: [],
      usersList: [],
      adminsList: [],
      projectVault: JSON.parse(localStorage.getItem('sg_guest_project_vault') || '[]'),
      shelf: [],
      shippingSettings: null, // New state
      loadedData: {},
      _loadedDatasets: { userProfile: false, stories: false, kits: false, deals: false, orders: false, basket: false, shelf: false, prints: false },
      _activePath: typeof window !== 'undefined' ? window.location.pathname : '/',
      _backgroundListenersStarted: false,
      _prioUnsubs: [],
      _bgUnsubs: [],
      lastVisibleKit: null,
      isLoading: true,
      hasLoadedAllKits: false,
      isAdmin: false,
      isBanned: false,
      isProfileIncomplete: false,
      isAdminView: false,
      user: null,
      basket: [],
      guestBasket: [],
      originalAdminUser: null,
      originalAdminBasket: [],
      adminData: null,
      pendingBasketItem: null,
      isLoginModalOpen: false,
      toastMessage: null,
      isSpectralMode: true,
      isSyncing: false,
      syncStatus: 'Loading Profile',
      storiesHeight: 0,
      unsubPrintResources: null,
      setStoriesHeight: (height) => set({ storiesHeight: height }),

      cleanupFilamentsStockNo: async () => {
        const { filamentInventory } = get();
        const batch = writeBatch(db);
        let hasChanges = false;

        filamentInventory.forEach((f) => {
          if ((parseFloat(f.remaining) || 0) <= 0 && f.stockNo) {
            batch.update(doc(db, "filaments", f.id), { stockNo: deleteField() });
            hasChanges = true;
          }
        });

        if (hasChanges) {
          await batch.commit();
          console.log('Store: Bulk cleanup of stockNo completed');
        }
      },

      setLoading: (loading) => set({ isLoading: loading }),
      setToastMessage: (message) => set({ toastMessage: message }),
      toggleSpectralMode: () => set((state) => ({ isSpectralMode: !state.isSpectralMode })),
      refreshKitOrder: () => set((state) => ({ kits: sortKitsByAvailability(state.kits) })),
      setAdminView: (isEnabled) => {
        console.log("SG LOG: setAdminView called with:", isEnabled, "Current:", get().isAdminView);
        if (get().isAdminView === isEnabled) return;
        set({ isAdminView: isEnabled });
      },
      setLoginModalOpen: (isOpen) => set({ isLoginModalOpen: isOpen }),
      setPendingBasketItem: (item) => set({ pendingBasketItem: item }),

      processPendingBasket: async () => {
        const { pendingBasketItem, addToBasket, huntKit } = get();
        if (pendingBasketItem) {
          if (pendingBasketItem.type === 'notify') {
            await huntKit(pendingBasketItem, pendingBasketItem.targetPrice);
          } else {
            await addToBasket(pendingBasketItem);
          }
          set({ pendingBasketItem: null });
        }
      },

      // Helper: determines which datasets a given pathname needs
      _getPageRequirements: (pathname) => {
        return {
          stories: pathname === '/' || pathname === '',
          kits: pathname.startsWith('/kits'),
          deals: pathname.startsWith('/kits'),
          orders: pathname === '/orders',
          basket: pathname === '/basket' || pathname === '/shelf',
          shelf: pathname === '/basket' || pathname === '/shelf',
          prints: pathname === '/prints' || pathname === '/blueprints'
        };
      },

      // Called from App.jsx on route change — re-shows loading if new page data isn't ready
      checkPageReady: (pathname) => {
        const ds = get()._loadedDatasets;
        const req = get()._getPageRequirements(pathname);
        set({ _activePath: pathname });

        // User profile must always be loaded
        if (!ds.userProfile) { set({ isLoading: true }); return; }

        // Check page-specific datasets
        if (req.stories && !ds.stories) { set({ isLoading: true }); return; }
        if (req.kits && !ds.kits) { set({ isLoading: true }); return; }
        if (req.deals && !ds.deals) { set({ isLoading: true }); return; }
        if (req.orders && !ds.orders) { set({ isLoading: true }); return; }
        if (req.basket && !ds.basket) { set({ isLoading: true }); return; }
        if (req.shelf && !ds.shelf) { set({ isLoading: true }); return; }
        if (req.prints && !ds.prints) { set({ isLoading: true }); return; }

        // All requirements met, don't re-show loading
      },

      markLoaded: (key) => {
        const prev = get()._loadedDatasets;
        if (prev[key]) return; // already marked
        const updated = { ...prev, [key]: true };
        set({ _loadedDatasets: updated });

        // Check if current page is ready
        const activePath = get()._activePath;
        const req = get()._getPageRequirements(activePath);

        // User profile must always be loaded first
        if (!updated.userProfile) return;

        const pageReady = 
          (!req.stories || updated.stories) &&
          (!req.kits || updated.kits) &&
          (!req.deals || updated.deals) &&
          (!req.orders || updated.orders) &&
          (!req.basket || updated.basket) &&
          (!req.shelf || updated.shelf) &&
          (!req.prints || updated.prints);

        if (pageReady) {
          set({ isLoading: false });
          get().startBackgroundListeners();
        }
      },

      startBackgroundListeners: () => {
        if (get()._backgroundListenersStarted) return;
        set({ _backgroundListenersStarted: true });

        const ds = get()._loadedDatasets;
        const unsubs = [];

        // 1. Stories (if not already prioritized)
        if (!ds.stories) {
          const initialStoriesQuery = query(collection(db, "stories"), orderBy("order", "asc"), limit(20));
          const unsub = onSnapshot(initialStoriesQuery, (snap) => {
            set({ stories: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
            get().markLoaded('stories');
            
            const bgStoriesQuery = query(collection(db, "stories"), orderBy("order", "asc"));
            const unsubFull = onSnapshot(bgStoriesQuery, (bgSnap) => {
              set({ stories: bgSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
            }, (err) => console.error("SG LOG: Background Stories subscription error:", err));
            set((state) => ({ _bgUnsubs: [...state._bgUnsubs, unsubFull] }));
          }, (err) => {
            console.error("SG LOG: Stories subscription error:", err);
            get().markLoaded('stories');
          });
          unsubs.push(unsub);
        }

        // 2. Kits (if not already prioritized) — fetch ALL kits directly
        if (!ds.kits) {
          const allKitsQuery = query(collection(db, "kits"), orderBy("lastUpdated", "desc"));
          const unsub = onSnapshot(allKitsQuery, (snap) => {
            const allKits = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            set({ 
              kits: sortKitsByAvailability(allKits), 
              lastVisibleKit: snap.docs[snap.docs.length - 1]
            });
            get().markLoaded('kits');
            get().syncAllDeals();
          }, (err) => {
            console.error("SG LOG: Kits subscription error:", err);
            get().markLoaded('kits');
          });
          unsubs.push(unsub);
        }

        // 3. Blueprints (if not already prioritized)
        if (!ds.prints) {
          const unsub = onSnapshot(collection(db, "blueprints"), (snap) => {
            set({ 
              blueprints: docsToArray(snap),
              loadedData: { ...get().loadedData, blueprints: true }
            });
            get().markLoaded('prints');
          }, (err) => {
            console.error("SG LOG: Blueprints subscription error:", err);
            get().markLoaded('prints');
          });
          unsubs.push(unsub);
        }

        // 4. Shelf (if not already prioritized)
        if (!ds.shelf) {
          const unsub = onSnapshot(collection(db, "shelf"), (snap) => {
            const items = snap.docs.map(doc => ({ basketId: doc.id, ...doc.data() }));
            set({ shelf: items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()) });
            get().markLoaded('shelf');
          }, (err) => {
            console.error("SG LOG: Shelf subscription error:", err);
            get().markLoaded('shelf');
          });
          unsubs.push(unsub);
        }

        // 5. Orders (if not already prioritized)
        if (!ds.orders) {
          const u = auth.currentUser;
          if (u) {
            set({ syncStatus: 'Loading Orders' });
            const isAdminMode = get().isAdmin && get().isAdminView;
            const ordersQuery = isAdminMode
              ? query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(20))
              : query(collection(db, "orders"), where("userId", "==", u.uid), limit(20));

            const unsub = onSnapshot(ordersQuery, (snap) => {
              set({ orders: docsToArray(snap) });
              get().markLoaded('orders');
            }, (err) => {
              console.error("SG LOG: Initial orders subscription error:", err);
              get().markLoaded('orders');
            });
            unsubs.push(unsub);
          } else {
            set({ syncStatus: 'Loading orders' });
            get().markLoaded('orders');
          }
        }

        // 6. Deals (if not already prioritized)
        if (!ds.deals) {
          const unsubDeals = onSnapshot(collection(db, "deals"), (snap) => {
            set({ deals: docsToArray(snap) });
            get().markLoaded('deals');
            get().syncAllDeals();
          }, (err) => {
            console.error("SG LOG: Background Deals subscription error:", err);
            get().markLoaded('deals');
          });
          unsubs.push(unsubDeals);
        }

        const unsubAdmins = onSnapshot(collection(db, "admins"), (snap) => {
          set({ adminsList: docsToArray(snap) });
        }, () => set({ adminsList: [] }));
        unsubs.push(unsubAdmins);

        set((state) => ({
          _bgUnsubs: [...state._bgUnsubs, ...unsubs]
        }));
      },

      fetchInitialData: () => {
        const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
        set({ _activePath: pathname });
        set({ _backgroundListenersStarted: false });

        // Phase 1: Auth check & profile loading
        const unsubAuth = auth.onAuthStateChanged(async (u) => {
          await get().syncUserAccount(u, () => {
            get().markLoaded('userProfile');

            // Phase 2: Start priority fetching ONLY for the current active page
            const currentReq = get()._getPageRequirements(get()._activePath);

            // 1. Home priority -> Stories
            if (currentReq.stories) {
              const initialStoriesQuery = query(collection(db, "stories"), orderBy("order", "asc"), limit(20));
              const unsub = onSnapshot(initialStoriesQuery, (snap) => {
                set({ stories: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
                get().markLoaded('stories');
                
                const bgStoriesQuery = query(collection(db, "stories"), orderBy("order", "asc"));
                const unsubFull = onSnapshot(bgStoriesQuery, (bgSnap) => {
                  set({ stories: bgSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
                }, (err) => console.error("SG LOG: Background Stories subscription error:", err));
                set((state) => ({ _prioUnsubs: [...state._prioUnsubs, unsubFull] }));
              }, (err) => {
                console.error("SG LOG: Stories subscription error:", err);
                get().markLoaded('stories');
              });
              set((state) => ({ _prioUnsubs: [...state._prioUnsubs, unsub] }));
            }

            // 2. Kits priority -> ALL kits (hasAvailableStock field is unreliable on older docs)
            if (currentReq.kits) {
              const allKitsQuery = query(collection(db, "kits"), orderBy("lastUpdated", "desc"));
              const unsub = onSnapshot(allKitsQuery, (snap) => {
                const allKits = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                set({ 
                  kits: sortKitsByAvailability(allKits), 
                  lastVisibleKit: snap.docs[snap.docs.length - 1]
                });
                get().markLoaded('kits');
                get().syncAllDeals();
              }, (err) => {
                console.error("SG LOG: Kits subscription error:", err);
                get().markLoaded('kits');
              });
              set((state) => ({ _prioUnsubs: [...state._prioUnsubs, unsub] }));
            }

            // 2b. Deals priority
            if (currentReq.deals) {
              const unsub = onSnapshot(collection(db, "deals"), (snap) => {
                set({ deals: docsToArray(snap) });
                get().markLoaded('deals');
                get().syncAllDeals();
              }, (err) => {
                console.error("SG LOG: Deals priority subscription error:", err);
                get().markLoaded('deals');
              });
              set((state) => ({ _prioUnsubs: [...state._prioUnsubs, unsub] }));
            }

            // 3. Prints priority -> All Blueprints with onSnapshot
            if (currentReq.prints) {
              const unsub = onSnapshot(collection(db, "blueprints"), (snap) => {
                set({ 
                  blueprints: docsToArray(snap),
                  loadedData: { ...get().loadedData, blueprints: true }
                });
                get().markLoaded('prints');
              }, (err) => {
                console.error("SG LOG: Blueprints priority error:", err);
                get().markLoaded('prints');
              });
              set((state) => ({ _prioUnsubs: [...state._prioUnsubs, unsub] }));
            }

            // 4. Shelf priority -> Shelf collection (Basket is already sync'ed priority in syncUserAccount)
            if (currentReq.shelf) {
              const unsub = onSnapshot(collection(db, "shelf"), (snap) => {
                const items = snap.docs.map(doc => ({ basketId: doc.id, ...doc.data() }));
                set({ shelf: items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()) });
                get().markLoaded('shelf');
              }, (err) => {
                console.error("SG LOG: Shelf subscription error:", err);
                get().markLoaded('shelf');
              });
              set((state) => ({ _prioUnsubs: [...state._prioUnsubs, unsub] }));
            }

            // 5. Orders priority -> Orders limit 20
            if (currentReq.orders) {
              if (u) {
                set({ syncStatus: 'Loading orders' });
                const isAdminMode = get().isAdmin && get().isAdminView;
                const ordersQuery = isAdminMode
                  ? query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(20))
                  : query(collection(db, "orders"), where("userId", "==", u.uid), limit(20));

                const unsub = onSnapshot(ordersQuery, (snap) => {
                  set({ orders: docsToArray(snap) });
                  get().markLoaded('orders');
                }, (err) => {
                  console.error("SG LOG: Initial orders subscription error:", err);
                  get().markLoaded('orders');
                });
                set((state) => ({ _prioUnsubs: [...state._prioUnsubs, unsub] }));
              } else {
                set({ syncStatus: 'Loading orders' });
                get().markLoaded('orders');
              }
            }
          });
        });

        // Small, essential settings load in parallel
        const unsubInfo = onSnapshot(doc(db, "settings", "garage"), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            set({ garageInfo: data });
          }
        });
        const unsubCheckout = onSnapshot(doc(db, "settings", "checkout"), (snap) => {
          const data = snap.exists() ? snap.data() : { paymentSettings: { handlingFee: 0, installmentFee: 0 } };
          set({ shippingSettings: data });
        });

        return () => {
          unsubAuth();
          unsubInfo();
          unsubCheckout();
          
          const prioUnsubs = get()._prioUnsubs || [];
          prioUnsubs.forEach(unsub => unsub && unsub());
          set({ _prioUnsubs: [] });

          const bgUnsubs = get()._bgUnsubs || [];
          bgUnsubs.forEach(unsub => unsub && unsub());
          set({ _bgUnsubs: [], _backgroundListenersStarted: false });

          const unsubPrint = get().unsubPrintResources;
          if (unsubPrint) {
            unsubPrint();
            set((state) => ({
              loadedData: { ...state.loadedData, printResources: false },
              unsubPrintResources: null
            }));
          }
        };
      },

      getMoreKits: async () => {
        // All kits are loaded on snapshot initialization. Client-side pagination is handled in pages/Kits.jsx.
      },

      subscribeDeals: () => {
        return onSnapshot(collection(db, "deals"), (snap) => {
          set({ deals: docsToArray(snap) });
        }, () => set({ deals: [] }));
      },

      subscribeNotifyList: () => {
        return onSnapshot(collection(db, "hunts"), (snap) => {
          set({ notifyList: docsToArray(snap) });
        }, () => set({ notifyList: [] }));
      },

      loadBlueprints: async () => {
        if (get().loadedData?.blueprints) return;
        const snap = await getDocs(collection(db, "blueprints"));
        set((state) => ({
          blueprints: docsToArray(snap),
          loadedData: { ...state.loadedData, blueprints: true }
        }));
      },

      loadPrintResources: () => {
        if (get().unsubPrintResources) return;

        const unsubMethods = onSnapshot(collection(db, "methods"), (snap) => {
          set({
            methods: snap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
              requirements: Object.values(d.data().requirements || {})
            }))
          });
        }, (err) => {
          console.error("SG LOG: Methods subscription error:", err);
        });

        const unsubPrinters = onSnapshot(collection(db, "printers"), (snap) => {
          set({ printers: docsToArray(snap) });
        }, (err) => {
          console.error("SG LOG: Printers subscription error:", err);
        });

        const unsubFeeders = onSnapshot(collection(db, "feeders"), (snap) => {
          set({ feeders: docsToArray(snap) });
        }, (err) => {
          console.error("SG LOG: Feeders subscription error:", err);
        });

        const unsubFilaments = onSnapshot(collection(db, "filaments"), (snap) => {
          set({ filamentInventory: docsToArray(snap) });
        }, (err) => {
          console.error("SG LOG: Filaments subscription error:", err);
        });

        const unsubRates = onSnapshot(collection(db, "rates"), (snap) => {
          const rates = {};
          snap.forEach((d) => { rates[d.id] = d.data(); });
          set({ rates });
        }, (err) => {
          console.error("SG LOG: Rates subscription error:", err);
        });

        const unsubExtras = onSnapshot(collection(db, "extras"), (snap) => {
          set({ extras: docsToArray(snap) });
        }, (err) => {
          console.error("SG LOG: Extras subscription error:", err);
        });

        set((state) => ({
          loadedData: { ...state.loadedData, printResources: true },
          unsubPrintResources: () => {
            unsubMethods();
            unsubPrinters();
            unsubFeeders();
            unsubFilaments();
            unsubRates();
            unsubExtras();
          }
        }));
      },

      subscribeOrders: (scope = {}) => {
        const { uid, isAdminMode } = scope;

        const ordersQuery = isAdminMode
          ? query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(100))
          : uid
            ? query(collection(db, "orders"), where("userId", "==", uid))
            : null;

        if (!ordersQuery) {
          // Wag i-clear ang list, hayaan lang kung ano ang nandoon
          return () => {};
        }

        return onSnapshot(ordersQuery, (snap) => {
          const docs = docsToArray(snap);
          console.log("SG LOG: Orders fetched:", docs.length, "for UID:", uid, "Admin:", isAdminMode);
          set({ orders: docs });
        }, (err) => {
          console.error("SG LOG: Order subscription error:", err);
          // Wag din i-clear sa error para iwas flicker
        });
      },

      subscribeUsersList: () => {
        return onSnapshot(collection(db, "users"), (snap) => {
          set({ usersList: snap.docs.map(doc => ({ uid: doc.id, ...doc.data() })) });
        }, () => set({ usersList: [] }));
      },

      loadOrdersOnce: async () => {
        const snap = await getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(100)));
        set({ orders: docsToArray(snap) });
      },

      loadMissingKits: async (ids = []) => {
        if (!ids.length) return;
        const { kits } = get();
        const currentIds = new Set(kits.map(k => k.id));
        const missingIds = ids.filter(id => !currentIds.has(id));
        
        if (!missingIds.length) return;
        
        console.log("SG LOG: Fetching missing kits for basket/shelf:", missingIds.length);
        
        const fetchedKits = [];
        // Firestore 'in' query supports up to 10 IDs
        for (let i = 0; i < missingIds.length; i += 10) {
            const batch = missingIds.slice(i, i + 10);
            const q = query(collection(db, "kits"), where("__name__", "in", batch));
            const snap = await getDocs(q);
            snap.forEach(doc => fetchedKits.push({ id: doc.id, ...doc.data() }));
        }

        if (fetchedKits.length > 0) {
            set((state) => ({
                kits: mergeKitsStable(state.kits, fetchedKits)
            }));
        }
      },

      fetchAdmins: () => {
        return onSnapshot(collection(db, "admins"), (snap) => {
          set({ adminsList: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
        }, () => set({ adminsList: [] }));
      },

      repairShelfImages: async () => {
        const { user, shelf, basket, isAdmin, kits } = get();
        const isAdminContext = isAdmin; // Assuming we're targeting the admin shelf
        const itemsToRepair = isAdminContext ? (shelf || []) : (basket || []);
        
        if (!itemsToRepair.length) return;

        const batch = writeBatch(db);
        let hasChanges = false;

        for (const item of itemsToRepair) {
          if (!item.image) {
            const kit = kits.find(k => k.id === item.id) || await getDoc(doc(db, "kits", item.id)).then(s => s.exists() ? s.data() : null);
            if (kit && kit.image) {
                if (isAdminContext) {
                    batch.update(doc(db, 'shelf', item.basketId), { image: kit.image });
                } else {
                    batch.update(doc(db, 'users', user.uid, 'basket', item.basketId), { image: kit.image });
                }
                hasChanges = true;
            }
          }
        }

        if (hasChanges) {
          await batch.commit();
          console.log("SG LOG: Shelf/Basket images repaired successfully.");
        } else {
          console.log("SG LOG: No missing images found to repair.");
        }
      },

      addAllAvailableToShelf: async () => {
        const { kits, user } = get();
        console.log("SG LOG: addAllAvailableToShelf initiated with kits count:", kits.length);
        const now = new Date().toISOString();
        const { handlingFee, installmentFee, transferFee } = getCheckoutPaymentFees(get().shippingSettings);

        // Build flat list of all available stocks across all kits
        const itemsToKeep = [];
        kits.forEach(kit => {
            Object.entries(kit.stocks || {}).forEach(([key, stock]) => {
                if (!stock.isReserved && !stock.order?.orderId) {
                    itemsToKeep.push({ kit, stock, key });
                }
            });
        });

        if (itemsToKeep.length === 0) {
            console.log("SG LOG: No available stocks found to move.");
            return;
        }

        // Firestore writeBatch limit = 500 operations. Each item = 2 ops.
        // Chunk into smaller batches (30 items = 60 ops) to avoid "Transaction too big" errors.
        const CHUNK_SIZE = 30;
        for (let i = 0; i < itemsToKeep.length; i += CHUNK_SIZE) {
            const chunk = itemsToKeep.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);

            chunk.forEach(({ kit, stock, key }) => {
                const basketId = `b_kit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                const clean = {
                    id: kit.id,
                    name: (kit.name || '').replace(/\s*\(Pre-Order\)\s*$/i, ''),
                    image: kit.image || '',
                    brand: kit.brand || '',
                    specs: kit.specs || {},
                    price: Number(stock.sellPrice || 0) + handlingFee + installmentFee + transferFee,
                    costPrice: Number(stock.costPrice || 0),
                    sellPrice: Number(stock.sellPrice || 0),
                    status: stock.status || 'onhand',
                    eta: stock.eta || '',
                    appliedHandlingFee: handlingFee,
                    appliedInstallmentFee: installmentFee,
                    appliedTransferFee: transferFee,
                    stockKey: key,
                    type: 'kit',
                    basketId,
                    minDownpayment: stock.minDownpayment || 0,
                    createdAt: now
                };
                batch.set(doc(db, 'shelf', basketId), clean);
                batch.update(doc(db, 'kits', kit.id), {
                    [`stocks.${key}.isReserved`]: true,
                    [`stocks.${key}.reservedBy`]: user.uid,
                    [`stocks.${key}.reservedAt`]: serverTimestamp(),
                    [`stocks.${key}.reservationType`]: 'admin',
                    lastUpdated: serverTimestamp(),
                    hasAvailableStock: false
                });
            });

            try {
                await batch.commit();
                console.log(`SG LOG: Batch ${Math.floor(i / CHUNK_SIZE) + 1} committed (${chunk.length} stocks).`);
            } catch (err) {
                console.error("SG LOG: addAllAvailableToShelf batch commit error:", err);
                alert("Firestore batch commit failed: " + err.message);
                throw err;
            }
        }

        console.log(`SG LOG: All available stocks moved to shelf (${itemsToKeep.length} total).`);
      },

      // Keep 1 stock per kit on the shelf — picks the cheapest available stock for each kit
      keepOneOfEachToShelf: async () => {
        const { kits, user } = get();
        console.log("SG LOG: keepOneOfEachToShelf initiated with kits count:", kits.length);
        const now = new Date().toISOString();
        const { handlingFee, installmentFee, transferFee } = getCheckoutPaymentFees(get().shippingSettings);

        // Build list of items to keep (1 per kit, cheapest available stock)
        const itemsToKeep = [];
        kits.forEach(kit => {
            const availableStocks = Object.entries(kit.stocks || {})
                .filter(([, stock]) => !stock.isReserved && !stock.order?.orderId)
                .map(([key, stock]) => ({ key, ...stock }));

            if (availableStocks.length === 0) return;

            // Sort by costPrice ascending, pick the cheapest one
            availableStocks.sort((a, b) => Number(a.costPrice || 0) - Number(b.costPrice || 0));
            const stock = availableStocks[0];
            const hasAvailable = (availableStocks.length - 1) > 0;
            itemsToKeep.push({ kit, stock, key: stock.key, hasAvailable });
        });

        if (itemsToKeep.length === 0) {
            console.log("SG LOG: No available stocks found to keep.");
            return;
        }

        // Firestore writeBatch limit = 500 operations. Each item = 2 ops (set shelf + update kit).
        // Chunk into smaller batches (30 items = 60 ops) to avoid "Transaction too big" errors.
        const CHUNK_SIZE = 30;
        for (let i = 0; i < itemsToKeep.length; i += CHUNK_SIZE) {
            const chunk = itemsToKeep.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);

            chunk.forEach(({ kit, stock, key, hasAvailable }) => {
                const basketId = `b_kit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                const clean = {
                    id: kit.id,
                    name: (kit.name || '').replace(/\s*\(Pre-Order\)\s*$/i, ''),
                    image: kit.image || '',
                    brand: kit.brand || '',
                    specs: kit.specs || {},
                    price: Number(stock.sellPrice || 0) + handlingFee + installmentFee + transferFee,
                    costPrice: Number(stock.costPrice || 0),
                    sellPrice: Number(stock.sellPrice || 0),
                    status: stock.status || 'onhand',
                    eta: stock.eta || '',
                    appliedHandlingFee: handlingFee,
                    appliedInstallmentFee: installmentFee,
                    appliedTransferFee: transferFee,
                    stockKey: key,
                    type: 'kit',
                    basketId,
                    minDownpayment: stock.minDownpayment || 0,
                    createdAt: now
                };
                batch.set(doc(db, 'shelf', basketId), clean);
                batch.update(doc(db, 'kits', kit.id), {
                    [`stocks.${key}.isReserved`]: true,
                    [`stocks.${key}.reservedBy`]: user.uid,
                    [`stocks.${key}.reservedAt`]: serverTimestamp(),
                    [`stocks.${key}.reservationType`]: 'admin',
                    lastUpdated: serverTimestamp(),
                    hasAvailableStock: hasAvailable
                });
            });

            try {
                await batch.commit();
                console.log(`SG LOG: Batch ${Math.floor(i / CHUNK_SIZE) + 1} committed (${chunk.length} kits).`);
            } catch (err) {
                console.error("SG LOG: keepOneOfEachToShelf batch commit error:", err);
                alert("Firestore batch commit failed: " + err.message);
                throw err;
            }
        }

        console.log(`SG LOG: Done — ${itemsToKeep.length} kits moved to shelf.`);
      },

      addKit: async (kitData) => {
        console.log("SG DEBUG: addKit store action triggered with data:", kitData);
        try {
          const { stockUpdateKey, newStock, updateMasterOnly, id: oldKitId, ...masterInfo } = kitData;
          const parts = [];
          const b = (masterInfo.brand || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          if (b) parts.push(b);
          const g = (masterInfo.specs?.line || '').toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
          if (g) parts.push(g);
          const r = (masterInfo.specs?.scale || '').toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
          if (r) parts.push(r);
          const n = (masterInfo.name || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          if (n) parts.push(n);
          const targetKitId = parts.join('_');
          console.log("SG DEBUG: Generated targetKitId:", targetKitId);

          const timing = new Date().toISOString();
          let stocks = {};
          let isExistingKit = false;
          let existingCreatedAt = null;
          let existingRestockedAt = null;

          if (oldKitId && oldKitId !== targetKitId) {
              console.log("SG DEBUG: ID change detected. Old:", oldKitId, "New:", targetKitId);
              const oldKitRef = doc(db, 'kits', oldKitId);
              const oldKitSnap = await getDoc(oldKitRef);
              if (oldKitSnap.exists()) {
                  const oldData = oldKitSnap.data();
                  stocks = oldData.stocks || {};
                  existingCreatedAt = oldData.createdAt || null;
                  existingRestockedAt = oldData.lastRestockedAt || null;
                  console.log("SG DEBUG: Deleting old document:", oldKitId);
                  await deleteDoc(oldKitRef);
                  set((state) => ({ kits: state.kits.filter(k => k.id !== oldKitId) }));
              }
          } else {
              const kitRef = doc(db, 'kits', targetKitId);
              const kitSnap = await getDoc(kitRef);
              if (kitSnap.exists()) {
                  isExistingKit = true;
                  const existingData = kitSnap.data();
                  stocks = existingData.stocks || {};
                  existingCreatedAt = existingData.createdAt || null;
                  existingRestockedAt = existingData.lastRestockedAt || null;
                  console.log("SG DEBUG: Found existing kit with targetKitId. stocks count:", Object.keys(stocks).length);
              }
          }

          const isRestock = !!newStock;
          // Compute stockKey ONCE so both blocks use the same key
          const resolvedStockKey = (!updateMasterOnly && newStock) ? (stockUpdateKey || `stock_${Date.now()}`) : null;

          if (resolvedStockKey) {
            stocks[resolvedStockKey] = { ...newStock, key: resolvedStockKey, lastUpdated: timing };
            console.log("SG DEBUG: Variant added/updated. Key:", resolvedStockKey);
          }
          
          const hasAvailable = Object.values(stocks).some(s => !s.order?.orderId && !s.isReserved);

          const cleanMaster = { 
            ...masterInfo, 
            id: targetKitId, 
            lastUpdated: serverTimestamp(), 
            createdAt: existingCreatedAt || serverTimestamp(),
            lastRestockedAt: isRestock ? serverTimestamp() : existingRestockedAt,
            searchName: masterInfo.name.toLowerCase(),
            hasAvailableStock: hasAvailable
          };

          const kitRef = doc(db, 'kits', targetKitId);
          await setDoc(kitRef, isExistingKit ? cleanMaster : { ...cleanMaster, stocks }, { merge: true });

          if (resolvedStockKey) {
            await updateDoc(kitRef, { 
              [`stocks.${resolvedStockKey}`]: stocks[resolvedStockKey],
              hasAvailableStock: hasAvailable 
            });
          }
          console.log("SG DEBUG: addKit operation successful.");
          return { id: targetKitId };
        } catch (err) {
          console.error("SG DEBUG: Error in addKit store action:", err);
          throw err;
        }
      },

      deleteKit: async (kitId) => {
        if (!kitId) return;
        await deleteDoc(doc(db, 'kits', kitId));
      },

      deleteStock: async (kitId, stockKey) => {
        const kitRef = doc(db, 'kits', kitId);
        const kitSnap = await getDoc(kitRef);
        if (kitSnap.exists()) {
          const kit = kitSnap.data();
          const stocks = { ...kit.stocks };
          delete stocks[stockKey];
          const hasAvailable = Object.values(stocks).some(s => !s.order?.orderId && !s.isReserved);
          await updateDoc(kitRef, { 
            [`stocks.${stockKey}`]: deleteField(),
            hasAvailableStock: hasAvailable
          });
        } else {
          await updateDoc(kitRef, { [`stocks.${stockKey}`]: deleteField() });
        }
      },

      updateStockPrice: async (kitId, stockKey, newPrice) => {
        await updateDoc(doc(db, 'kits', kitId), { [`stocks.${stockKey}.sellPrice`]: Number(newPrice) });
      },

      updateAdminProfile: async (uid, data) => {
        await setDoc(doc(db, 'admins', uid), data, { merge: true });
      },

      updateShippingSettings: async (uid, data) => {
        const docRef = doc(db, 'settings', 'checkout');
        
        if (data.shippingMethods) {
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const currentMethods = snap.data().shippingMethods || {};
            const newMethods = data.shippingMethods;
            const batchUpdates = {};
            
            // 1. Find deleted top-level methods
            Object.keys(currentMethods).forEach(mKey => {
              if (!(mKey in newMethods)) {
                batchUpdates[`shippingMethods.${mKey}`] = deleteField();
              } else {
                // 2a. Find deleted suboptions within all methods (stored in .suboptions)
                const currentSubs = currentMethods[mKey]?.suboptions || {};
                const newSubs = newMethods[mKey]?.suboptions || {};
                
                Object.keys(currentSubs).forEach(sKey => {
                  if (!(sKey in newSubs)) {
                    batchUpdates[`shippingMethods.${mKey}.suboptions.${sKey}`] = deleteField();
                  }
                });

                // 2b. Legacy flat-key cleanup para sa dating courier format (LBC/Lalamove/SPX).
                // Dati ay naka-store ang suboptions ng LBC/Lalamove/SPX Express direkta sa method object
                // (e.g. shippingMethods.LBC.cop). Sa bagong unified format, lahat ay nasa .suboptions.
                // I-delete ang mga legacy flat keys na wala na sa bagong config.
                const LEGACY_COURIER_FLAT_KEYS = ['cop', 'cod', 'self', 'seller', 'delivery'];
                LEGACY_COURIER_FLAT_KEYS.forEach(sKey => {
                  if (sKey in (currentMethods[mKey] || {}) && !(sKey in (newMethods[mKey] || {}))) {
                    batchUpdates[`shippingMethods.${mKey}.${sKey}`] = deleteField();
                  }
                });

                // 2c. Legacy flat discount keys (e.g. copHandlingDiscount) — i-delete para ma-clean ang Firestore
                const LEGACY_DISCOUNT_KEYS = ['copHandlingDiscount', 'codHandlingDiscount', 'selfHandlingDiscount', 'sellerHandlingDiscount', 'deliveryHandlingDiscount'];
                LEGACY_DISCOUNT_KEYS.forEach(dKey => {
                  if (dKey in (currentMethods[mKey] || {})) {
                    batchUpdates[`shippingMethods.${mKey}.${dKey}`] = deleteField();
                  }
                });
              }
            });
            
            if (Object.keys(batchUpdates).length > 0) {
              console.log("SG DEBUG: Deleting shipping settings keys:", Object.keys(batchUpdates));
              await updateDoc(docRef, batchUpdates);
            }
          }
        }
        
        await setDoc(docRef, data, { merge: true });
      },

      // I-delete ang specific payment method keys mula sa Firestore gamit ang deleteField().
      // Hindi pwedeng gamitin ang setDoc+merge para dito kasi hindi nito tinatanggal ang
      // mga existing keys na wala sa bagong data — nag-a-add/overwrite lang, hindi nagde-delete.
      // Katulad ng paraan ng pag-delete ng shipping methods sa itaas.
      deletePaymentMethods: async (deletedMethods = []) => {
        if (!deletedMethods.length) return;
        const docRef = doc(db, 'settings', 'checkout');
        const deletions = {};
        deletedMethods.forEach(method => {
          deletions[`paymentSettings.methods.${method}`] = deleteField();
          deletions[`paymentSettings.methods.${method}Qr`] = deleteField();
          deletions[`paymentSettings.methods.${method}TransferDiscount`] = deleteField();
        });
        console.log('SG DEBUG: Deleting payment method keys from Firestore:', Object.keys(deletions));
        await updateDoc(docRef, deletions);
      },

      publishCheckoutSettings: async (partialSettings = {}) => {
        console.log("SG DEBUG: Publishing Partial Checkout Settings to settings/checkout");
        
        // Gamitin ang merge: true para sa partial update
        // Ipadala lang ang mga field na binago
        await setDoc(doc(db, 'settings', 'checkout'), partialSettings, { merge: true });
      },

      fixMisalignedStocks: async (issues) => {
        for (const issue of issues) {
          if (issue.reason === 'Onhand Stock with ETA') {
            await updateDoc(doc(db, "kits", issue.kitId), {
              [`stocks.${issue.stockKey}.eta`]: ''
            });
          } else {
            await updateDoc(doc(db, "kits", issue.kitId), {
              [`stocks.${issue.stockKey}.isReserved`]: false,
              [`stocks.${issue.stockKey}.reservedAt`]: null,
              [`stocks.${issue.stockKey}.reservedBy`]: null,
              [`stocks.${issue.stockKey}.reservationType`]: deleteField(),
              [`stocks.${issue.stockKey}.order`]: deleteField(),
              hasAvailableStock: true
            });
          }
        }
      },

      findMisalignedStocks: (kits, orders = []) => {
        const issues = [];
        const activeOrderIds = new Set(
          (orders || [])
            .filter(o => String(o.status || '').toLowerCase() !== 'cancelled')
            .flatMap(o => [o.id, o.orderId].filter(Boolean))
        );
        const cancelledOrderIds = new Set(
          (orders || [])
            .filter(o => String(o.status || '').toLowerCase() === 'cancelled')
            .flatMap(o => [o.id, o.orderId].filter(Boolean))
        );

        (kits || []).forEach(kit => {
          Object.entries(kit.stocks || {}).forEach(([key, stock]) => {
            const stockOrderIds = [stock.order?.orderDocId, stock.order?.orderId].filter(Boolean);
            
            // Case 1: Stock is linked to a cancelled order
            const isLinkedToCancelled = stockOrderIds.some(id => cancelledOrderIds.has(id));
            
            // Case 2: Stock is marked reserved but has no order data OR the linked order doesn't exist in active orders
            // If it has order data, check if that order is active. If no order data but isReserved is true, it might be orphaned.
            const hasNoActiveOrder = stock.isReserved && (stockOrderIds.length === 0 || !stockOrderIds.some(id => activeOrderIds.has(id)));

            // Case 3: Stock is On-hand but still has an ETA
            const isOnhand = String(stock.status || '').toLowerCase() === 'onhand';
            const hasEta = Boolean(stock.eta?.trim());
            const isOnhandWithEta = isOnhand && hasEta;

            if (isLinkedToCancelled || hasNoActiveOrder || isOnhandWithEta) {
              issues.push({ 
                kitId: kit.id, 
                stockKey: key, 
                orderId: stock.order?.orderId || stock.order?.orderDocId || 'None', 
                orderStatus: stock.order?.status || (stock.isReserved ? 'Orphaned Reservation' : 'Unknown'),
                reason: isOnhandWithEta ? 'Onhand Stock with ETA' : (isLinkedToCancelled ? 'Cancelled Order' : 'Missing/Inactive Order')
              });
            }
          });
        });

        return issues;
      },

      findKitIdMismatches: (kits) => {
        const mismatches = [];
        (kits || []).forEach((kit) => {
          const expectedId = createKitTargetId(kit.name, kit.specs?.line, kit.specs?.scale, kit.brand);
          if (kit.id !== expectedId) {
            mismatches.push({
              oldId: kit.id,
              newId: expectedId,
              kitName: kit.name
            });
          }
        });
        return mismatches;
      },

      fixKitIdMismatches: async (mismatches) => {
        for (const mismatch of mismatches) {
          const { oldId, newId } = mismatch;
          const oldRef = doc(db, 'kits', oldId);
          const newRef = doc(db, 'kits', newId);
          
          const snap = await getDoc(oldRef);
          if (snap.exists()) {
            const data = snap.data();
            // Create new doc with same data but updated ID field
            await setDoc(newRef, { ...data, id: newId }, { merge: true });
            await deleteDoc(oldRef);
          }
        }
      },

      findKitScaleMigrations: (kits) => {
        const migrations = [];
        (kits || []).forEach((kit) => {
          const legacyScale = kit?.scale;
          if (!legacyScale || typeof legacyScale !== 'object') return;

          const line = legacyScale.grade || '';
          const scale = legacyScale.ratio || '';
          if (!line && !scale) return;

          migrations.push({
            kitId: kit.id,
            kitName: kit.name || kit.id,
            specs: {
              ...(kit.specs || {}),
              line,
              scale
            }
          });
        });
        return migrations;
      },

      migrateKitScaleToSpecs: async (migrations) => {
        for (const migration of migrations) {
          await updateDoc(doc(db, "kits", migration.kitId), {
            specs: migration.specs,
            scale: deleteField()
          });
        }
      },

      toggleStockReservation: async (kitId, stockKey, isReserved) => {
        const kitRef = doc(db, 'kits', kitId);
        const kitSnap = await getDoc(kitRef);
        if (kitSnap.exists()) {
          const kit = kitSnap.data();
          const stocks = { ...kit.stocks };
          if (stocks[stockKey]) {
            stocks[stockKey].isReserved = isReserved;
          }
          const hasAvailable = Object.values(stocks).some(s => !s.order?.orderId && !s.isReserved);
          await updateDoc(kitRef, { 
            [`stocks.${stockKey}.isReserved`]: isReserved, 
            [`stocks.${stockKey}.reservedAt`]: isReserved ? serverTimestamp() : null,
            hasAvailableStock: hasAvailable
          });
        } else {
          await updateDoc(kitRef, { [`stocks.${stockKey}.isReserved`]: isReserved, [`stocks.${stockKey}.reservedAt`]: isReserved ? serverTimestamp() : null });
        }
      },

      addDeal: async (dealData) => {
        const dealRef = dealData.id ? doc(db, "deals", dealData.id) : doc(collection(db, "deals"));
        await setDoc(dealRef, { ...dealData, id: dealRef.id, lastUpdated: serverTimestamp() }, { merge: true });
      },

      updateDeal: async (dealId, patch) => {
        await updateDoc(doc(db, "deals", dealId), { ...patch, lastUpdated: serverTimestamp() });
      },

      deleteDeal: async (dealId) => {
        // First release any stocks reserved by this mutually exclusive deal
        const { kits, user } = get();
        if (kits && user) {
          const batch = writeBatch(db);
          let hasChanges = false;
          kits.forEach(kit => {
            const dealReservedStocks = Object.entries(kit.stocks || {}).filter(
              ([, s]) => s.reservedByDealId === dealId
            );
            dealReservedStocks.forEach(([key]) => {
              const basketId = `b_kit_me_${dealId}_${key}`;
              batch.delete(doc(db, 'shelf', basketId));
              batch.update(doc(db, 'kits', kit.id), {
                [`stocks.${key}.isReserved`]: false,
                [`stocks.${key}.reservedBy`]: null,
                [`stocks.${key}.reservedAt`]: null,
                [`stocks.${key}.reservationType`]: deleteField(),
                [`stocks.${key}.reservedByDealId`]: deleteField(),
                lastUpdated: serverTimestamp()
              });
              hasChanges = true;
            });
          });
          if (hasChanges) {
            await batch.commit();
          }
        }
        await deleteDoc(doc(db, "deals", dealId));
      },

      addStory: async (storyData) => {
        const storiesCollection = collection(db, "stories");
        const snap = await getDocs(storiesCollection);
        const nextOrder = snap.size + 1;
        const storyRef = doc(storiesCollection);
        const createdAt = new Date().toISOString();
        const cleanStory = {
          ...storyData,
          id: storyRef.id,
          order: nextOrder,
          createdAt: serverTimestamp()
        };
        await setDoc(storyRef, cleanStory);
        set((state) => ({
          stories: [
            ...(state.stories || []),
            { ...storyData, id: storyRef.id, order: nextOrder, createdAt }
          ].sort((a, b) => (a.order || 0) - (b.order || 0))
        }));
        return storyRef.id;
      },

      updateStory: async (storyId, patch) => {
        const storyRef = doc(db, "stories", storyId);
        await updateDoc(storyRef, { ...patch, lastUpdated: serverTimestamp() });
        const lastUpdated = new Date().toISOString();
        set((state) => ({
          stories: (state.stories || []).map((story) =>
            story.id === storyId ? { ...story, ...patch, id: storyId, lastUpdated } : story
          )
        }));
      },

      deleteStory: async (storyId) => {
        await deleteDoc(doc(db, "stories", storyId));
      },

      updateStoriesOrder: async (newStories) => {
        const batch = writeBatch(db);
        newStories.forEach((story, idx) => {
          batch.update(doc(db, "stories", story.id), { order: idx + 1 });
        });
        await batch.commit();
      },

      deleteFromNotifyList: async (notifyId) => {
        await deleteDoc(doc(db, "hunts", notifyId));
      },

      huntKit: async (kit, targetPrice) => {
        const { user, notifyList } = get();
        if (!user) { alert("Please login to Hunt this kit!"); return; }
        const existingHunt = notifyList.find(n => n.uid === user.uid && n.kitId === kit.id);
        const huntData = { uid: user.uid, userName: (user.displayName || 'Guest').toUpperCase(), photoURL: user.photoURL || '', kitId: kit.id, kitName: kit.name, targetPrice: parseFloat(targetPrice) || 0, status: 'hunting', createdAt: serverTimestamp() };
        if (existingHunt) {
            await setDoc(doc(db, "hunts", existingHunt.id), huntData, { merge: true });
            alert(`Notify request updated for ${kit.name}!`);
        } else {
            const huntId = `HUNT_${Date.now()}_${user.uid.slice(0, 5)}`;
            await setDoc(doc(db, "hunts", huntId), { ...huntData, id: huntId });
          alert(`Hunting request submitted for ${kit.name}!`);
        }
      },

      stopImpersonating: () => {
        const { originalAdminUser, originalAdminBasket } = get();
        if (!originalAdminUser) return;
        set({
        user: originalAdminUser,
          basket: originalAdminBasket || [],
          originalAdminUser: null,
          originalAdminBasket: []
        });
      },

      syncUserAccount: async (fbUser, onSyncComplete) => {
        console.log("DEBUG: syncUserAccount called with:", fbUser ? fbUser.uid : "null");
        set({ syncStatus: 'Loading Profile' });
        if (get().unsubUser) get().unsubUser();
        if (get().unsubShelf) get().unsubShelf();
        if (get().unsubAdmin) get().unsubAdmin();
        if (get().unsubBasket) get().unsubBasket();

        if (!fbUser) {
          console.log("DEBUG: No fbUser found, switching to guest mode.");
          const guestProjectVault = JSON.parse(localStorage.getItem('sg_guest_project_vault') || '[]');
          set({ user: null, isAdmin: false, isAdminView: false, usersList: [], projectVault: guestProjectVault, shelf: [], unsubUser: null, unsubShelf: null, unsubAdmin: null, unsubBasket: null, syncStatus: 'Loading basket' });
          
          get().markLoaded('userProfile');
          get().markLoaded('basket');
          
          if (onSyncComplete) onSyncComplete();
          return;
        }

        console.log("DEBUG: fbUser detected, syncing data for UID:", fbUser.uid);
        const userRef = doc(db, 'users', fbUser.uid);
        const adminSnap = await getDoc(doc(db, 'admins', fbUser.uid));
        const isActuallyAdmin = adminSnap.exists();
        console.log("DEBUG: Is user admin?", isActuallyAdmin);

        if (isActuallyAdmin) {
          get().migrateKitsAvailabilityField();
        }

        // Fetch user data once for migration
        const initialDocSnap = await getDoc(userRef);
        let userData = initialDocSnap.exists() ? initialDocSnap.data() : null;
        
        set({ syncStatus: 'Loading basket' });

        // Basket Migration Logic
        const rawGuestBasket = localStorage.getItem('sg_guest_basket');
        const guestBasket = JSON.parse(rawGuestBasket || '[]');
        
        if (guestBasket && guestBasket.length > 0) {
            console.log("DEBUG: Migrating guest basket items to subcollection:", guestBasket.length);
            const batch = writeBatch(db);
            for (const item of guestBasket) {
                const bId = item.basketId || `b_kit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                batch.set(doc(db, 'users', fbUser.uid, 'basket', bId), { ...item, basketId: bId });
            }
            await batch.commit();
            localStorage.removeItem('sg_guest_basket');
            set({ guestBasket: [] });
        }

        // Self-Healing Migration: Migrate old user document basket (map field) to the basket subcollection
        if (userData && userData.basket && typeof userData.basket === 'object' && Object.keys(userData.basket).length > 0) {
            console.log("DEBUG: Migrating basket map from user doc to subcollection");
            const batch = writeBatch(db);
            Object.entries(userData.basket).forEach(([bId, item]) => {
                if (item) {
                    batch.set(doc(db, 'users', fbUser.uid, 'basket', bId), { ...item, basketId: bId });
                }
            });
            batch.update(userRef, { basket: deleteField() });
            await batch.commit();
            console.log("DEBUG: Basket map migration completed successfully");
        }

        set({ syncStatus: 'Loading Projects' });

        // Mag-subscribe sa projectVaults subcollection para iwas sa 1MB user doc limit
        const vaultRef = doc(db, 'projectVaults', fbUser.uid);
        const vaultSnap = await getDoc(vaultRef);
        const initialVault = vaultSnap.exists() ? (vaultSnap.data().items || []) : [];
        set({ projectVault: initialVault });

        // Kung may projectVault sa user doc (lumang format), i-migrate at i-delete doon
        if (userData?.projectVault && Array.isArray(userData.projectVault) && userData.projectVault.length > 0) {
          console.log("DEBUG: Migrating projectVault from user doc to projectVaults collection");
          const mergedVault = [...userData.projectVault];
          await setDoc(vaultRef, { items: mergedVault, uid: fbUser.uid }, { merge: true });
          await updateDoc(userRef, { projectVault: deleteField() });
          set({ projectVault: mergedVault });
        }

        let isInitialUserDocLoaded = false;
        const unsubUser = onSnapshot(userRef, async (docSnap) => {
            console.log("DEBUG: User doc snapshot update for UID:", fbUser.uid);
            
            if (docSnap.exists()) {
              const data = docSnap.data();
              // IMPORTANT: Huwag i-include ang projectVault at basket sa user doc snapshot —
              // naka-store na ito sa sariling collections/subcollections para iwas sa 1MB limit
              set({ 
                user: { 
                  uid: fbUser.uid, 
                  photoURL: fbUser.photoURL, 
                  ...data, 
                  displayName: (data.displayName || fbUser.displayName || "Anonymous").toUpperCase() 
                }, 
                isAdmin: isActuallyAdmin, 
                isBanned: data.userDetails?.status === 'banned', 
                isProfileIncomplete: !data.userDetails?.welcomeSeen
              });
              get().processPendingBasket();
            } else {
              console.log("DEBUG: User doc does not exist, creating initial doc for UID:", fbUser.uid);
              const initial = { uid: fbUser.uid, displayName: (fbUser.displayName || "Anonymous").toUpperCase(), photoURL: fbUser.photoURL, role: 'customer', createdAt: serverTimestamp() };
              await setDoc(userRef, initial, { merge: true });
              set({ user: { ...initial, createdAt: new Date().toISOString() }, isAdmin: isActuallyAdmin });
            }

            if (!isInitialUserDocLoaded) {
              isInitialUserDocLoaded = true;
              if (onSyncComplete) onSyncComplete();
            }
        });

        set({ syncStatus: 'Loading Basket' });

        const unsubBasket = onSnapshot(collection(db, 'users', fbUser.uid, 'basket'), (basketSnap) => {
            const basketItems = basketSnap.docs.map(doc => ({ basketId: doc.id, ...doc.data() }));
            set({ basket: basketItems.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()) });
            
            get().markLoaded('basket');
        }, (err) => {
            console.error("SG LOG: Basket subscription error:", err);
            get().markLoaded('basket');
        });

        let unsubAdmin = null;
        if (isActuallyAdmin) {
          unsubAdmin = onSnapshot(doc(db, 'admins', fbUser.uid), (snap) => {
            set({ adminData: snap.exists() ? snap.data() : null });
          });
        }
        set({ unsubUser, unsubAdmin, unsubBasket });
      },

      updateUserProfile: async (uid, data) => { await updateDoc(doc(db, 'users', uid), data); },
      addFilament: async (fData) => { 
        console.log('Store: addFilament called with', fData);
        const { id, ...d } = fData; 
        const existingIds = new Set((get().filamentInventory || []).map((f) => String(f.id)));
        const ref = id && !existingIds.has(String(id)) ? doc(db, "filaments", id) : doc(collection(db, "filaments")); 
        const previousInventory = get().filamentInventory || [];
        set((state) => {
          const nextFilament = { ...d, id: ref.id };
          const exists = (state.filamentInventory || []).some((f) => String(f.id) === String(ref.id));
          return {
            filamentInventory: exists
              ? state.filamentInventory.map((f) => String(f.id) === String(ref.id) ? { ...f, ...nextFilament } : f)
              : [nextFilament, ...(state.filamentInventory || [])]
          };
        });
        try {
          await setDoc(ref, { ...d, id: ref.id });
        } catch (error) {
          set({ filamentInventory: previousInventory });
          throw error;
        }
        console.log('Store: addFilament completed');
      },

      deleteOrder: async (orderDocId) => {
        const { kits, isAdmin, orders } = get();
        let order = (orders || []).find(o => o.id === orderDocId);
        if (!order) {
          try {
            const snap = await getDoc(doc(db, "orders", orderDocId));
            if (snap.exists()) {
              order = { id: snap.id, ...snap.data() };
            }
          } catch (err) {
            console.error("SG LOG: Error fetching order in deleteOrder:", err);
          }
        }

        const isCash = order?.paymentMethod === 'Cash';
        const isInstallment = order?.paymentPlan && order?.paymentPlan !== 'full';
        const isMaintenance = order?.isMaintenanceOrder || false;

        if ((isCash || isInstallment) && !isAdmin && !isMaintenance) {
          console.error("SG LOG: Unauthorized delete attempt for Cash/Installment order:", orderDocId);
          alert("Unauthorized: Only admins can delete cash or installment orders.");
          return;
        }

        await deleteDoc(doc(db, "orders", orderDocId));
        // Siguraduhing ma-release ang stocks para iwas locking
        for (const kit of kits) {
          for (const [key, stock] of Object.entries(kit.stocks || {})) {
            if (stock.order?.orderDocId === orderDocId) {
              await updateDoc(doc(db, 'kits', kit.id), {
                [`stocks.${key}.isReserved`]: false,
                [`stocks.${key}.reservedAt`]: null,
                [`stocks.${key}.reservedBy`]: null,
                [`stocks.${key}.reservationType`]: deleteField(),
                [`stocks.${key}.order`]: deleteField(),
                hasAvailableStock: true
              });
            }
          }
        }
      },



      updateFilament: async (id, patch, newId) => { 
        console.log('Store: updateFilament called with ID:', id, 'New ID:', newId, 'and Patch:', patch);
        
        const previousInventory = get().filamentInventory || [];
        set((state) => ({
          filamentInventory: (state.filamentInventory || []).map((f) => (
            String(f.id) === String(id) ? { ...f, ...patch, id: newId || id } : f
          ))
        }));

        try {
          if (newId && newId !== id) {
            // Document ID change: create new doc, delete old one
            await setDoc(doc(db, "filaments", newId), patch);
            await deleteDoc(doc(db, "filaments", id));
          } else {
            // Same ID: normal update
            await updateDoc(doc(db, "filaments", id), patch);
          }
          console.log('Store: updateFilament Firestore update successful');
        } catch (error) {
          console.error('Store: updateFilament Firestore error:', error);
          set({ filamentInventory: previousInventory });
          throw error;
        }
        console.log('Store: updateFilament completed');
      },

      deleteFilament: async (id) => {
        const previousInventory = get().filamentInventory || [];
        set((state) => ({ filamentInventory: (state.filamentInventory || []).filter((f) => String(f.id) !== String(id)) }));
        try {
          await deleteDoc(doc(db, "filaments", id));
        } catch (error) {
          set({ filamentInventory: previousInventory });
          throw error;
        }
      },

      updateSettings: async (rateId, patch) => {
        if (!rateId || !patch) return;
        const previousRates = get().rates || {};
        set((state) => ({
          rates: {
            ...(state.rates || {}),
            [rateId]: {
              ...((state.rates || {})[rateId] || {}),
              ...patch
            }
          }
        }));
        try {
          await setDoc(doc(db, 'rates', rateId), patch, { merge: true });
        } catch (error) {
          set({ rates: previousRates });
          throw error;
        }
      },

      addToBasket: async (itemData) => {
        const { user, basket, shelf, isAdmin, isAdminView, guestBasket, kits } = get();
        const isAdminContext = isAdmin && isAdminView;
        const currentList = isAdminContext ? (shelf || []) : (user ? (basket || []) : (guestBasket || []));
        const stateField = isAdminContext ? 'shelf' : (user ? 'basket' : 'guestBasket');
        
        let kit = kits.find(k => k.id === itemData.id);
        if (!kit) {
           const snap = await getDoc(doc(db, "kits", itemData.id));
           if (snap.exists()) kit = { id: snap.id, ...snap.data() };
        }
        
        if (!kit?.stocks || typeof kit.stocks !== 'object') {
          console.error("SG LOG: Kit or stocks not found for ID:", itemData.id);
          return;
        }

        const occupied = new Set(currentList.filter(i => i.id === itemData.id).map(i => i.stockKey));
        const available = Object.entries(kit.stocks).filter(([key, s]) => !s.isReserved && !s.order?.orderId && !occupied.has(key));
        available.sort((a, b) => isAdminContext ? (a[1].costPrice || 0) - (b[1].costPrice || 0) : (b[1].costPrice || 0) - (a[1].costPrice || 0));
        
        const allStocks = Object.entries(kit.stocks);
        const targetKey = itemData.stockKey && kit.stocks[itemData.stockKey]
          ? itemData.stockKey
          : (available[0]?.[0] || allStocks[0]?.[0]);
          
        if (!targetKey) return;

        const basketId = `b_kit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const { handlingFee: hFee, installmentFee: iFee, transferFee: tFee } = getCheckoutPaymentFees({
          garageInfo: { checkoutSettings: get().shippingSettings },
          adminData: { paymentSettings: get().shippingSettings?.paymentSettings }
        });

        const stock = kit.stocks[targetKey];
        const clean = { 
          id: kit.id, 
          name: (itemData.name || kit.name || '').replace(/\s*\(Pre-Order\)\s*$/i, ''), 
          image: itemData.image || kit.image || '',
          brand: itemData.brand || kit.brand || '',
          specs: itemData.specs || kit.specs || {},
          price: Number(stock.sellPrice || 0) + hFee + iFee + tFee, 
          costPrice: Number(stock.costPrice || 0),
          sellPrice: Number(stock.sellPrice || 0),
          status: stock.status || 'onhand',
          eta: stock.eta || '',
          appliedHandlingFee: hFee, 
          appliedInstallmentFee: iFee, 
          appliedTransferFee: tFee,
          stockKey: targetKey, 
          type: itemData.type || 'kit', 
          basketId, 
          minDownpayment: stock.minDownpayment || 0,
          createdAt: new Date().toISOString() 
        };

        if (!user) { 
          const newList = [...(guestBasket || []), clean].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()); 
          localStorage.setItem('sg_guest_basket', JSON.stringify(newList)); 
          set({ guestBasket: newList }); 
          return; 
        }

        set({ [stateField]: [...currentList, clean] });
        
        if (isAdminContext) {
            const shelfCount = [...currentList, clean].filter(i => i.id === kit.id).length;
            set({ toastMessage: `${shelfCount} in shelf` });
            await setDoc(doc(db, 'shelf', basketId), clean);

            const updatedStocks = { ...kit.stocks };
            if (updatedStocks[targetKey]) {
              updatedStocks[targetKey] = {
                ...updatedStocks[targetKey],
                isReserved: true
              };
            }
            const hasAvailable = Object.values(updatedStocks).some(s => !s.order?.orderId && !s.isReserved);

            await updateDoc(doc(db, "kits", kit.id), { 
              [`stocks.${targetKey}.isReserved`]: true, 
              [`stocks.${targetKey}.reservedBy`]: user.uid, 
              [`stocks.${targetKey}.reservedAt`]: serverTimestamp(), 
              [`stocks.${targetKey}.reservationType`]: 'admin',
              lastUpdated: serverTimestamp(),
              hasAvailableStock: hasAvailable
            });
        } else {
            await setDoc(doc(db, 'users', user.uid, 'basket', basketId), clean);
        }
      },

      clearBasket: async () => {
        const { user, isAdmin, isAdminView, shelf, basket } = get();
        if (!user) { localStorage.removeItem('sg_guest_basket'); set({ guestBasket: [] }); return; }
        const field = (isAdmin && isAdminView) ? 'shelf' : 'basket';
        set({ [field]: [] });
        
        const batch = writeBatch(db);
        if (isAdmin && isAdminView) {
          shelf.forEach(item => {
            batch.delete(doc(db, 'shelf', item.basketId));
          });
        } else {
          basket.forEach(item => {
            batch.delete(doc(db, 'users', user.uid, 'basket', item.basketId));
          });
        }
        await batch.commit();
      },

      removeFromBasket: async (basketId) => {
        const { user, basket, shelf, isAdmin, isAdminView, guestBasket } = get();
        const isAdminContext = isAdmin && isAdminView;
        const currentList = isAdminContext ? shelf : (user ? basket : guestBasket);
        const field = isAdminContext ? 'shelf' : (user ? 'basket' : 'guestBasket');
        
        if (!user) { 
          const newList = (guestBasket || []).filter(i => i.basketId !== basketId); 
          localStorage.setItem('sg_guest_basket', JSON.stringify(newList)); 
          set({ guestBasket: newList }); 
          return; 
        }
        
        const item = currentList.find(i => i.basketId === basketId);
        if (!item) return;
        
        const newList = currentList.filter(i => i.basketId !== basketId);
        set({ [field]: newList });
        
        if (isAdminContext) {
            const shelfCount = newList.filter(i => i.id === item.id).length;
            set({ toastMessage: `${shelfCount} in shelf` });
            await deleteDoc(doc(db, 'shelf', basketId));
            const kitSnap = await getDoc(doc(db, "kits", item.id));
            if (kitSnap.exists() && kitSnap.data().stocks?.[item.stockKey]?.reservationType === 'admin') {
              const kitData = kitSnap.data();
              const stocks = { ...kitData.stocks };
              if (stocks[item.stockKey]) {
                stocks[item.stockKey].isReserved = false;
                delete stocks[item.stockKey].reservedBy;
                delete stocks[item.stockKey].reservedAt;
                delete stocks[item.stockKey].reservationType;
              }
              const hasAvailable = Object.values(stocks).some(s => !s.order?.orderId && !s.isReserved);
              await updateDoc(doc(db, "kits", item.id), { 
                [`stocks.${item.stockKey}.isReserved`]: false, 
                [`stocks.${item.stockKey}.reservedBy`] : null, 
                [`stocks.${item.stockKey}.reservedAt`]: null, 
                [`stocks.${item.stockKey}.reservationType`]: deleteField(),
                hasAvailableStock: hasAvailable
              });
            }
        } else {
            await deleteDoc(doc(db, 'users', user.uid, 'basket', basketId));
        }
      },

      createOrder: async (oData) => {
        const { user } = get();
        const ref = doc(collection(db, "orders"));
        const order = { 
          ...oData, 
          userId: oData.userId || user?.uid || null, 
          id: ref.id, 
          createdAt: oData.createdAt || serverTimestamp(), 
          lastUpdated: serverTimestamp() 
        };
        
        // Sanitize object: remove undefined values
        Object.keys(order).forEach(key => order[key] === undefined && delete order[key]);
        
        console.log("SG DEBUG: Sanitized order object:", order);
        await setDoc(ref, order);
        return ref.id;
      },

      updateOrderStatus: async (id, status) => {
        const updateData = { status, lastUpdated: serverTimestamp() };
        if (status === 'Cancelled') {
          updateData.cancelledAt = serverTimestamp();
        } else if (status === 'Completed') {
          updateData.completedAt = serverTimestamp();
        }
        await updateDoc(doc(db, "orders", id), updateData);
      },

      updateOrderDetails: async (orderDocId, patch) => {
        const updateData = {
          ...patch,
          lastUpdated: serverTimestamp()
        };
        if (patch.status === 'Cancelled') {
          updateData.cancelledAt = serverTimestamp();
        } else if (patch.status === 'Completed') {
          updateData.completedAt = serverTimestamp();
        }
        await updateDoc(doc(db, "orders", orderDocId), updateData);
      },

      confirmOrderPayment: async (orderDocId, amount) => {
        const orderRef = doc(db, "orders", orderDocId);
        const snap = await getDoc(orderRef);
        if (!snap.exists()) return;
        const currentPaid = Number(snap.data().buyerPaid) || 0;
        await updateDoc(orderRef, {
          buyerPaid: currentPaid + Number(amount),
          lastUpdated: serverTimestamp()
        });
      },

      uploadReceipt: async (orderDocId, receiptUrl) => {
        const ids = Array.isArray(orderDocId) ? orderDocId : [orderDocId];
        for (const id of ids) {
          await updateDoc(doc(db, "orders", id), {
            receipt: receiptUrl,
            status: 'Validating',
            lastUpdated: serverTimestamp()
          });
        }
      },

      cancelOrder: async (id) => {
        const { kits, orders } = get();
        let order = (orders || []).find(o => o.id === id);
        if (!order) {
          try {
            const snap = await getDoc(doc(db, "orders", id));
            if (snap.exists()) {
              order = { id: snap.id, ...snap.data() };
            }
          } catch (err) {
            console.error("SG LOG: Error fetching order in cancelOrder:", err);
          }
        }

        if (order) {
          await updateDoc(doc(db, "orders", id), {
            status: 'Cancelled',
            cancelledAt: serverTimestamp(),
            lastUpdated: serverTimestamp()
          });
        }

        for (const kit of kits) {
          for (const [key, stock] of Object.entries(kit.stocks || {})) {
            if (stock.order?.orderDocId === id) {
              await updateDoc(doc(db, 'kits', kit.id), {
                [`stocks.${key}.isReserved`]: false,
                [`stocks.${key}.reservedAt`]: null,
                [`stocks.${key}.reservedBy`]: null,
                [`stocks.${key}.reservationType`]: deleteField(),
                [`stocks.${key}.order`]: deleteField(),
                hasAvailableStock: true
              });
            }
          }
        }
      },

      cleanUpCancelledOrders: async () => {
        const { user, isAdmin, kits } = get();
        if (!user) return;

        try {
          const releaseOrderStocks = async (orderDocId) => {
            for (const kit of kits) {
              for (const [key, stock] of Object.entries(kit.stocks || {})) {
                if (stock.order?.orderDocId === orderDocId) {
                  await updateDoc(doc(db, 'kits', kit.id), {
                    [`stocks.${key}.isReserved`]: false,
                    [`stocks.${key}.reservedAt`]: null,
                    [`stocks.${key}.reservedBy`]: null,
                    [`stocks.${key}.reservationType`]: deleteField(),
                    [`stocks.${key}.order`]: deleteField()
                  });
                }
              }
            }
          };

          const buildStatusQuery = (status) => isAdmin
            ? query(collection(db, "orders"), where("status", "==", status))
            : query(collection(db, "orders"), where("userId", "==", user.uid), where("status", "==", status));

          const [cancelledSnap, completedSnap] = await Promise.all([
            getDocs(buildStatusQuery("Cancelled")),
            getDocs(buildStatusQuery("Completed"))
          ]);
          const now = Date.now();
          const twentyFourHours = 24 * 60 * 60 * 1000;
          const seen = new Set();
          const docs = [...cancelledSnap.docs, ...completedSnap.docs].filter(orderDoc => {
            if (seen.has(orderDoc.id)) return false;
            seen.add(orderDoc.id);
            return true;
          });

          for (const orderDoc of docs) {
            const o = { id: orderDoc.id, ...orderDoc.data() };
            if (o.isMaintenanceOrder && ['Completed', 'Cancelled'].includes(o.status)) {
              const completedTime = o.completedAt 
                ? (o.completedAt.seconds ? o.completedAt.seconds * 1000 : new Date(o.completedAt).getTime())
                : o.cancelledAt
                  ? (o.cancelledAt.seconds ? o.cancelledAt.seconds * 1000 : new Date(o.cancelledAt).getTime())
                  : o.lastUpdated
                    ? (o.lastUpdated.seconds ? o.lastUpdated.seconds * 1000 : new Date(o.lastUpdated).getTime())
                    : o.createdAt
                      ? (o.createdAt.seconds ? o.createdAt.seconds * 1000 : new Date(o.createdAt).getTime())
                      : null;

              if (completedTime && (now - completedTime >= 60000)) {
                console.log(`SG LOG: Auto-deleting invalid ${o.status} order ${o.orderId || o.id}`);
                await deleteDoc(doc(db, "orders", o.id));
                await releaseOrderStocks(o.id);
              }
              continue;
            }

            if (o.status !== 'Cancelled') continue;

            const isCash = o.paymentMethod === 'Cash';
            const isInstallment = o.paymentPlan && o.paymentPlan !== 'full';

            if (!isCash && !isInstallment) {
              const cancelledTime = o.cancelledAt
                ? (o.cancelledAt.seconds ? o.cancelledAt.seconds * 1000 : new Date(o.cancelledAt).getTime())
                : o.lastUpdated
                  ? (o.lastUpdated.seconds ? o.lastUpdated.seconds * 1000 : new Date(o.lastUpdated).getTime())
                  : o.createdAt
                    ? (o.createdAt.seconds ? o.createdAt.seconds * 1000 : new Date(o.createdAt).getTime())
                    : null;
              if (cancelledTime && (now - cancelledTime >= twentyFourHours)) {
                console.log(`SG LOG: Auto-deleting expired cancelled order ${o.orderId || o.id}`);
                await get().deleteOrder(o.id);
              }
            }
          }
        } catch (err) {
          console.error("SG LOG: Error cleaning up cancelled orders:", err);
        }
      },

      createDummyUser: async (name) => {
        const dummyId = `dummy_${Date.now()}`;
        await setDoc(doc(db, 'users', dummyId), {
          uid: dummyId,
          displayName: name.toUpperCase(),
          role: 'customer',
          createdAt: new Date().toISOString()
        });
        return dummyId;
      },

      assignStockToOrder: async (kitId, stockKey, orderId, options) => {
        const kitRef = doc(db, 'kits', kitId);
        const kitSnap = await getDoc(kitRef);
        if (kitSnap.exists()) {
          const kit = kitSnap.data();
          const stocks = { ...kit.stocks };
          if (stocks[stockKey]) {
            stocks[stockKey].order = { orderId, ...options };
            stocks[stockKey].isReserved = true;
          }
          const hasAvailable = Object.values(stocks).some(s => !s.order?.orderId && !s.isReserved);
          await updateDoc(kitRef, {
            [`stocks.${stockKey}.order`]: {
              orderId,
              ...options
            },
            [`stocks.${stockKey}.isReserved`]: true,
            [`stocks.${stockKey}.reservedAt`]: serverTimestamp(),
            hasAvailableStock: hasAvailable
          });
        } else {
          await updateDoc(kitRef, {
            [`stocks.${stockKey}.order`]: {
              orderId,
              ...options
            },
            [`stocks.${stockKey}.isReserved`]: true,
            [`stocks.${stockKey}.reservedAt`]: serverTimestamp()
          });
        }
      },

      reserveStockForCheckout: async (kitId, stockKey, uid, options = {}) => {
        const snap = await getDoc(doc(db, "kits", kitId));
        if (!snap.exists()) return { success: false };
        const data = snap.data();
        const stock = data.stocks?.[stockKey];
        if (!stock) return { success: false };
        const canUseAdminShelfStock = options.allowAdminShelf && stock.isReserved && stock.reservationType === 'admin' && !stock.order?.orderId;
        if (stock.isReserved && stock.reservedBy !== uid && !canUseAdminShelfStock) return { success: false };

        const stocks = { ...data.stocks };
        if (stocks[stockKey]) {
          stocks[stockKey].isReserved = true;
          stocks[stockKey].reservedBy = uid;
          if (canUseAdminShelfStock) delete stocks[stockKey].reservationType;
        }
        const hasAvailable = Object.values(stocks).some(s => !s.order?.orderId && !s.isReserved);

        await updateDoc(doc(db, "kits", kitId), {
          [`stocks.${stockKey}.isReserved`]: true,
          [`stocks.${stockKey}.reservedBy`]: uid,
          [`stocks.${stockKey}.reservedAt`]: serverTimestamp(),
          ...(canUseAdminShelfStock ? { [`stocks.${stockKey}.reservationType`]: deleteField() } : {}),
          lastUpdated: serverTimestamp(),
          hasAvailableStock: hasAvailable
        });
        return { success: true };
      },

      publishBlueprint: async (pData) => {
        const { user } = get();
        const blueprintData = {
          ...pData,
          createdAt: serverTimestamp(),
          publishedBy: user?.uid || null,
          canAddToBasket: pData.canAddToBasket !== false,
          isPublished: true
        };
        await addDoc(collection(db, 'blueprints'), blueprintData);
        // Refresh blueprints list if necessary, or just rely on onSnapshot if we have one
        // If no onSnapshot for blueprints yet, we might need a manual fetch
        const snap = await getDocs(collection(db, 'blueprints'));
        set({ blueprints: docsToArray(snap) });
      },
      updateBlueprint: async (blueprintId, pData) => {
        const { user } = get();
        if (!blueprintId) throw new Error('Missing blueprint id.');
        const blueprintData = {
          ...pData,
          id: blueprintId,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid || null,
          canAddToBasket: pData.canAddToBasket !== false,
          isPublished: true
        };
        await setDoc(doc(db, 'blueprints', blueprintId), blueprintData, { merge: true });
        const snap = await getDocs(collection(db, 'blueprints'));
        set({ blueprints: docsToArray(snap) });
      },
      deleteBlueprint: async (blueprintId) => {
        if (!blueprintId) throw new Error('Missing blueprint id.');
        await deleteDoc(doc(db, 'blueprints', blueprintId));
        set((state) => ({
          blueprints: (state.blueprints || []).filter((project) => project.id !== blueprintId)
        }));
      },
      addProjectToVault: async (pData) => {
        const { user, projectVault, orders } = get();

        // Calculate limit: 3 + number of completed 3D print projects
        const completedProjectsCount = (orders || []).filter(o => 
          o.status?.toLowerCase() === 'completed' && 
          o.items?.some(item => item.type === 'project')
        ).length;
        
        const limit = 3 + completedProjectsCount;
        const savedCount = (projectVault || []).length;

        if (savedCount >= limit) {
          throw new Error(`You have reached the maximum of ${limit} saved estimates. Complete more projects to unlock more slots.`);
        }

        const newVault = [{ vaultId: `V-${Date.now()}`, ...pData, status: 'Draft', createdAt: new Date().toISOString() }, ...(projectVault || [])];
        if (!user) {
          localStorage.setItem('sg_guest_project_vault', JSON.stringify(newVault));
          set({ projectVault: newVault });
          return;
        }
        // FIXED: I-save sa projectVaults/{uid} imbes na sa user doc para iwas sa 1MB Firestore limit
        await setDoc(doc(db, 'projectVaults', user.uid), { items: newVault, uid: user.uid }, { merge: true });
        set({ projectVault: newVault });
      },

      removeFromVault: async (vId) => {
        const { user, projectVault } = get();
        const newVault = (projectVault || []).filter(p => p.vaultId !== vId);
        if (!user) {
          localStorage.setItem('sg_guest_project_vault', JSON.stringify(newVault));
          set({ projectVault: newVault });
          return;
        }
        // FIXED: I-update sa projectVaults/{uid} imbes na sa user doc
        await setDoc(doc(db, 'projectVaults', user.uid), { items: newVault, uid: user.uid }, { merge: true });
        set({ projectVault: newVault });
      },

      updateProjectInVault: async (vId, pData) => {
        const { user, projectVault } = get();
        if (!vId) throw new Error('Missing vault project id.');
        const newVault = (projectVault || []).map((project) => (
          project.vaultId === vId
            ? { ...project, ...pData, vaultId: vId, status: project.status || 'Draft', updatedAt: new Date().toISOString() }
            : project
        ));
        if (!user) {
          localStorage.setItem('sg_guest_project_vault', JSON.stringify(newVault));
          set({ projectVault: newVault });
          return;
        }
        // FIXED: I-update sa projectVaults/{uid} imbes na sa user doc
        await setDoc(doc(db, 'projectVaults', user.uid), { items: newVault, uid: user.uid }, { merge: true });
        set({ projectVault: newVault });
      },

      decrementProjectQuantity: async (basketId) => {
        const { user, basket, shelf, isAdmin, isAdminView, guestBasket } = get();
        const field = (isAdmin && isAdminView) ? 'shelf' : 'basket';
        const list = (isAdmin && isAdminView) ? (shelf || []) : (user ? (basket || []) : (guestBasket || []));
        
        const item = list.find(i => i.basketId === basketId);
        if (!item || item.type !== 'project') return;

        if ((item.quantity || 1) > 1) {
            const updatedList = list.map(i => 
                i.basketId === basketId 
                ? { ...i, quantity: (i.quantity || 1) - 1 }
                : i
            );
            
            if (!user && !isAdminView) {
                localStorage.setItem('sg_guest_basket', JSON.stringify(updatedList));
                set({ guestBasket: updatedList });
            } else {
                set({ [field]: updatedList });
                if (user) {
                    if (isAdmin && isAdminView) {
                        await updateDoc(doc(db, 'shelf', basketId), { quantity: (item.quantity || 1) - 1 });
                    } else {
                        await updateDoc(doc(db, 'users', user.uid, 'basket', basketId), { quantity: (item.quantity || 1) - 1 });
                    }
                }
            }
        } else {
            // Quantity is 1, so remove entirely
            await get().removeFromBasket(basketId);
        }
      },

      migrateKitImages: async () => {
        const { setToastMessage } = get();
        console.log("SG LOG: migrateKitImages called");
        if (!window.confirm("Deduplicate images for all kits in Firestore? This will replace duplicate base64 image copies in flat fields with image IDs to save storage.")) {
          return;
        }
        setToastMessage("Starting image deduplication migration...");
        try {
          const snap = await getDocs(collection(db, "kits"));
          console.log(`SG LOG: Found ${snap.docs.length} kits in Firestore.`);
          let updatedCount = 0;

          for (const kitDoc of snap.docs) {
            const kit = { id: kitDoc.id, ...kitDoc.data() };
            let hasChanges = false;
            let logMsg = `SG LOG: Processing kit: ${kit.name || kit.id}`;
            const detailLogs = [];
            
            const images = Array.isArray(kit.images) ? [...kit.images] : [];
            let imageField = kit.image || '';

            if (imageField.startsWith('data:')) {
              let match = images.find(img => img.url === imageField);
              if (!match) {
                const newId = `master_migrated_${Date.now()}`;
                match = {
                  id: newId,
                  url: imageField,
                  type: 'BOX ART',
                  isGridImage: true
                };
                images.push(match);
              }
              imageField = match.id;
              hasChanges = true;
              detailLogs.push(`  -> Migrated master image to ID: ${match.id}`);
            }

            const stocks = kit.stocks ? { ...kit.stocks } : {};
            for (const [stockKey, stock] of Object.entries(stocks)) {
              let stockChanges = false;
              const stockImages = Array.isArray(stock.stockImages) ? [...stock.stockImages] : [];
              let boxImage = stock.boxImage || '';
              let kitImage = stock.kitImage || '';

              if (boxImage.startsWith('data:')) {
                let match = stockImages.find(img => img.url === boxImage);
                if (!match) {
                  const newId = `stock_box_migrated_${Date.now()}`;
                  match = {
                    id: newId,
                    url: boxImage,
                    type: 'BOX CONDITION'
                  };
                  stockImages.push(match);
                }
                boxImage = match.id;
                stockChanges = true;
                detailLogs.push(`  -> Stock [${stockKey}] Box image migrated to ID: ${match.id}`);
              }

              if (kitImage.startsWith('data:')) {
                let match = stockImages.find(img => img.url === kitImage);
                if (!match) {
                  const newId = `stock_kit_migrated_${Date.now()}`;
                  match = {
                    id: newId,
                    url: kitImage,
                    type: 'KIT CONDITION'
                  };
                  stockImages.push(match);
                }
                kitImage = match.id;
                stockChanges = true;
                detailLogs.push(`  -> Stock [${stockKey}] Kit image migrated to ID: ${match.id}`);
              }

              if (stockChanges) {
                stocks[stockKey] = {
                  ...stock,
                  stockImages,
                  boxImage,
                  kitImage
                };
                hasChanges = true;
              }
            }

            if (hasChanges) {
              console.log(logMsg);
              detailLogs.forEach(line => console.log(line));
              const kitRef = doc(db, "kits", kit.id);
              await updateDoc(kitRef, {
                image: imageField,
                images: images,
                stocks: stocks,
                lastUpdated: serverTimestamp()
              });
              console.log(`  -> Successfully updated kit doc in Firestore.`);
              updatedCount++;
            }
          }

          console.log(`SG LOG: Image deduplication complete. Updated ${updatedCount} of ${snap.docs.length} kits.`);
          setToastMessage(`Migration successful! Deduplicated images in ${updatedCount} kits.`);
        } catch (error) {
          console.error("SG LOG: Migration error:", error);
          setToastMessage("Migration failed. Check console for logs.");
        }
      },

      migrateKitsAvailabilityField: async () => {
        console.log("SG LOG: migrateKitsAvailabilityField called");
        try {
          const snap = await getDocs(collection(db, "kits"));
          const batch = writeBatch(db);
          let count = 0;
          snap.forEach(docSnap => {
            const data = docSnap.data();
            const hasAvailable = Object.values(data.stocks || {}).some(s => !s.order?.orderId && !s.isReserved);
            batch.update(docSnap.ref, { hasAvailableStock: hasAvailable });
            count++;
          });
          if (count > 0) {
            await batch.commit();
            console.log(`SG LOG: Successfully migrated ${count} kits availability field.`);
          }
        } catch (err) {
          console.error("SG LOG: Error migrating kits availability field:", err);
        }
      },

      syncMutuallyExclusiveDeals: async () => {
        const { kits, deals, user } = get();
        if (!deals || !kits || !user) return;

        const activeExclusions = deals.filter(d => d.isActive && d.type === 'mutually_exclusive');
        if (activeExclusions.length === 0) return;

        const batch = writeBatch(db);
        let hasChanges = false;
        const fees = getCheckoutPaymentFees(get().shippingSettings) || { handlingFee: 0, installmentFee: 0, transferFee: 0 };
        const handlingFee = fees.handlingFee || 0;
        const installmentFee = fees.installmentFee || 0;
        const transferFee = fees.transferFee || 0;

        for (const deal of activeExclusions) {
          if (!deal.kitIds || deal.kitIds.length < 2) continue;
          
          const kitAId = deal.kitIds[0];
          const kitBId = deal.kitIds[1];

          const kitA = kits.find(k => k.id === kitAId);
          const kitB = kits.find(k => k.id === kitBId);
          if (!kitA || !kitB) continue;

          // Check if any stock of Kit A is reserved/ordered by a customer (non-admin/non-deal reservation)
          // or is attached to an order.
          const isAReserved = Object.values(kitA.stocks || {}).some(
            s => (s.isReserved && s.reservationType !== 'admin') || s.order?.orderId
          );
          const isBReserved = Object.values(kitB.stocks || {}).some(
            s => (s.isReserved && s.reservationType !== 'admin') || s.order?.orderId
          );

          // Helper to keep a kit to shelf
          const keepToShelf = (targetKit) => {
            const availableStocks = Object.entries(targetKit.stocks || {}).filter(
              ([, s]) => !s.isReserved && !s.order?.orderId
            );
            if (availableStocks.length === 0) return;

            availableStocks.forEach(([key, stock]) => {
              const basketId = `b_kit_me_${deal.id}_${key}`;
              const clean = {
                id: targetKit.id,
                name: (targetKit.name || '').replace(/\s*\(Pre-Order\)\s*$/i, '') + ` (Excluded: ${targetKit.name})`,
                image: targetKit.image || '',
                brand: targetKit.brand || '',
                specs: targetKit.specs || {},
                price: Number(stock.sellPrice || 0) + handlingFee + installmentFee + transferFee,
                costPrice: Number(stock.costPrice || 0),
                sellPrice: Number(stock.sellPrice || 0),
                status: stock.status || 'onhand',
                eta: stock.eta || '',
                appliedHandlingFee: handlingFee,
                appliedInstallmentFee: installmentFee,
                appliedTransferFee: transferFee,
                stockKey: key,
                type: 'kit',
                basketId,
                minDownpayment: stock.minDownpayment || 0,
                createdAt: new Date().toISOString(),
                reservedByDealId: deal.id
              };
              batch.set(doc(db, 'shelf', basketId), clean);
              batch.update(doc(db, 'kits', targetKit.id), {
                [`stocks.${key}.isReserved`]: true,
                [`stocks.${key}.reservedBy`]: user.uid,
                [`stocks.${key}.reservedAt`]: serverTimestamp(),
                [`stocks.${key}.reservationType`]: 'admin',
                [`stocks.${key}.reservedByDealId`]: deal.id,
                lastUpdated: serverTimestamp()
              });
              hasChanges = true;
            });
          };

          // Helper to release a kit from shelf
          const releaseFromShelf = (targetKit) => {
            // Find all stocks reserved by this deal
            const dealReservedStocks = Object.entries(targetKit.stocks || {}).filter(
              ([, s]) => s.reservedByDealId === deal.id
            );
            if (dealReservedStocks.length === 0) return;

            dealReservedStocks.forEach(([key]) => {
              const basketId = `b_kit_me_${deal.id}_${key}`;
              batch.delete(doc(db, 'shelf', basketId));
              batch.update(doc(db, 'kits', targetKit.id), {
                [`stocks.${key}.isReserved`]: false,
                [`stocks.${key}.reservedBy`]: null,
                [`stocks.${key}.reservedAt`]: null,
                [`stocks.${key}.reservationType`]: deleteField(),
                [`stocks.${key}.reservedByDealId`]: deleteField(),
                lastUpdated: serverTimestamp()
              });
              hasChanges = true;
            });
          };

          if (isAReserved && !isBReserved) {
            // A is taken, B must be kept to shelf
            keepToShelf(kitB);
          } else if (isBReserved && !isAReserved) {
            // B is taken, A must be kept to shelf
            keepToShelf(kitA);
          } else if (!isAReserved && !isBReserved) {
            // Both are free, release any deal reservations on both
            releaseFromShelf(kitA);
            releaseFromShelf(kitB);
          }
        }

        if (hasChanges) {
          console.log("SG LOG: Mutually exclusive deal auto-syncing Firestore updates...");
          try {
            await batch.commit();
          } catch (err) {
            console.error("SG LOG: Error syncing mutually exclusive deals:", err);
          }
        }
      },

      syncBundleDealsFulfillment: async () => {
        const { kits, deals, user } = get();
        if (!deals || !kits || !user) return;

        const stockMatchesDealSource = (stock, source = 'onhand') => {
          const status = String(stock?.status || '').toLowerCase();
          const isPreOrder = status.includes('pre') || status.includes('batch');
          return source === 'preorder' ? isPreOrder : !isPreOrder;
        };

        const isBundlePurchasableStock = (stock, source = 'onhand') => {
          if (!stock || stock.order?.orderId || !stockMatchesDealSource(stock, source)) return false;
          return !stock.isReserved || stock.reservationType === 'admin';
        };

        const bundleDeals = deals.filter(d => d.type === 'bundle_only' || d.type === 'bundle_discount');
        if (bundleDeals.length === 0) return;

        for (const deal of bundleDeals) {
          if (!deal.kitIds || deal.kitIds.length === 0) continue;

          const isFulfillable = deal.kitIds.every(dealKitId => {
            const dealKit = kits.find(k => k.id === dealKitId);
            if (!dealKit) return false;
            const stocks = Object.values(dealKit.stocks || {});
            return stocks.some(s => isBundlePurchasableStock(s, deal.stockSource || 'onhand'));
          });

          const currentActive = deal.isActive !== false;
          if (isFulfillable && !currentActive) {
            console.log(`SG LOG: Auto-activating deal ${deal.name} (${deal.id}) - stocks available`);
            try {
              await updateDoc(doc(db, "deals", deal.id), { isActive: true, lastUpdated: serverTimestamp() });
            } catch (err) {
              console.error("SG LOG: Error auto-activating deal:", err);
            }
          } else if (!isFulfillable && currentActive) {
            console.log(`SG LOG: Auto-deactivating deal ${deal.name} (${deal.id}) - stock(s) unavailable`);
            try {
              await updateDoc(doc(db, "deals", deal.id), { isActive: false, lastUpdated: serverTimestamp() });
            } catch (err) {
              console.error("SG LOG: Error auto-deactivating deal:", err);
            }
          }
        }
      },

      syncAllDeals: async () => {
        get().syncMutuallyExclusiveDeals();
        get().syncBundleDealsFulfillment();
      },

      addProjectToBasket: async (pData) => {
        if (pData?.canAddToBasket === false) {
          throw new Error('This print is public for reference only and cannot be added to basket.');
        }
        const { user, basket, shelf, isAdmin, isAdminView, guestBasket } = get();
        
        const field = (isAdmin && isAdminView) ? 'shelf' : 'basket';
        const list = (isAdmin && isAdminView) ? (shelf || []) : (user ? (basket || []) : (guestBasket || []));
        
        // Helper to compare projects
        const areProjectsEqual = (p1, p2) => {
            const getId = (p) => `${p.projectData?.projectName || ''}_${p.projectData?.method?.name || ''}`;
            return getId(p1) === getId(p2);
        };

        const existingProject = list.find(item => item.type === 'project' && areProjectsEqual(item, { projectData: pData }));

        if (existingProject) {
            // Increment quantity if exists
            const updatedList = list.map(item => 
                item.basketId === existingProject.basketId 
                ? { ...item, quantity: (item.quantity || 1) + 1 }
                : item
            );
            
            if (!user && !isAdminView) {
                localStorage.setItem('sg_guest_basket', JSON.stringify(updatedList));
                set({ guestBasket: updatedList });
            } else {
                set({ [field]: updatedList });
                if (user) {
                    if (isAdmin && isAdminView) {
                        await updateDoc(doc(db, 'shelf', existingProject.basketId), { quantity: (existingProject.quantity || 1) + 1 });
                    } else {
                        await updateDoc(doc(db, 'users', user.uid, 'basket', existingProject.basketId), { quantity: (existingProject.quantity || 1) + 1 });
                    }
                }
            }
            return;
        }
        
        const bId = `b_proj_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const { handlingFee: hFee, installmentFee: iFee, transferFee: tFee } = getCheckoutPaymentFees(get().shippingSettings);
        const projectGrandTotal = parseFloat(String(pData.totals?.total || 0).replace(/,/g, '')) || 0;
        const projectBasePrice = parseFloat(String(pData.totals?.basePrice || 0).replace(/,/g, '')) || Math.max(0, projectGrandTotal - hFee - iFee - tFee);
        const projectDownpayment = parseFloat(String(pData.totals?.dp || 0).replace(/,/g, '')) || 0;

        let name = `Custom Print: ${pData.projectName || pData.method?.name || 'Project'}`;
        if (pData.selectedDesignService) {
          const serviceId = pData.selectedDesignService;
          const serviceRates = (get().rates || {})['design-services'] || {};
          const serviceData = serviceRates[serviceId] || {};
          let label = serviceData.name || '';
          if (!label) {
            if (serviceId === '3d-cad') label = '3D CAD';
            else if (serviceId === '3d-sculpt') label = '3D Sculpting';
            else {
              label = serviceId.split('-').map(word => {
                if (word.toLowerCase() === 'cad') return 'CAD';
                return word.charAt(0).toUpperCase() + word.slice(1);
              }).join(' ');
            }
          }
          name += ` (w/ ${label})`;
        }

        const newItem = {
          id: `project_${bId}`,
          basketId: bId,
          type: 'project',
          quantity: 1,
          isFinalized: pData.method?.name === '3MF',
          gdriveLink: pData.gdriveLink || '',
          projectData: { ...pData, sellPrice: projectBasePrice, displayPrice: projectGrandTotal, minDownpayment: projectDownpayment },
          name,
          price: projectGrandTotal,
          appliedHandlingFee: hFee,
          appliedInstallmentFee: iFee,
          appliedTransferFee: tFee,
          minDownpayment: projectDownpayment,
          createdAt: new Date().toISOString()
        };
        
        if (!user) {
          const newGuestBasket = [...(guestBasket || []), newItem].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          localStorage.setItem('sg_guest_basket', JSON.stringify(newGuestBasket));
          set({ guestBasket: newGuestBasket });
          return;
        }
        set({ [field]: [...list, newItem] });
        try {
          if (isAdmin && isAdminView) {
            await setDoc(doc(db, 'shelf', bId), newItem);
          } else {
            await setDoc(doc(db, 'users', user.uid, 'basket', bId), newItem);
          }
        } catch (e) {
          set({ [field]: list });
          throw e;
        }
      }
    }),
    {
      name: 'sg-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        garageInfo: state.garageInfo,
        rates: state.rates,
        isAdminView: state.isAdminView,
        guestBasket: state.guestBasket,
      }),
    }
  )
);
