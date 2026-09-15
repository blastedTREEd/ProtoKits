# 🗄️ Data & Store Architecture

Snorlax Garage organizes its application state and real-time synchronization pipelines through a centralized Zustand store integrated with Firebase Firestore.

---

## 📦 1. State Management (Zustand)
Global frontend state is managed in [useStore.js](file:///c:/Users/daive/Desktop/react-app/snorlaxgarage-type-f/src/store/useStore.js) using **Zustand** with session persistence.

### 🔌 State Lifecycle & Preloading
To eliminate loading flashes (content flickering) in React, the store tracks page requirements dynamically before disabling the global spinner:
- **`_getPageRequirements(pathname)`**: Returns a map of database collections necessary for the requested route.
- **`checkPageReady(pathname)`**: Evaluates if the current route's required datasets have finished downloading.
- **`_loadedDatasets`**: A state dictionary tracking loading statuses (e.g. `userProfile: true`, `kits: true`, `orders: false`).
- **`startBackgroundListeners()`**: Ensures the live listeners required by the active route exist without creating a second listener for an already subscribed dataset.
- **`_datasetListenerKeys`**: Tracks active catalog listeners so route changes and auth callbacks cannot subscribe to the same collection twice.

### Firestore cache and listener ownership

- Firestore uses persistent IndexedDB caching with `persistentLocalCache()` and `persistentMultipleTabManager()`. Cached snapshots can therefore satisfy the loading gate immediately while the SDK reconnects in the background, including across browser tabs.
- Firestore transport uses the SDK's automatic long-polling detection. Forced long-polling is intentionally disabled because it degrades performance on browsers that can use the normal streaming transport.
- `stories` has one ordered live query and is subscribed only when the landing page is visited.
- The landing page uses bounded `homeKits` (up to 40 catalog documents) and `homeBlueprints` (up to 12 project documents) slices. Active deal kit IDs are fetched in targeted batches so older deal items can still appear without downloading the full catalog.
- `catalogPublic/{kitId}` is a compact public read model for Kits browsing. It keeps display, pricing, availability, and condition fields while omitting order IDs and reservation owners. Admins can rebuild it from the Kits admin tools; normal public browsing falls back to the bounded `kits` query until the projection exists.
- Full `kits` and `blueprints` listeners are reserved for catalog-dependent routes such as `/kits`, `/prints`, `/blueprints`, cart, and shelf.
- `shelf` is subscribed for administrators on every route because the navbar and kit cards use live shelf state for collection counts and badges. Shelf reconciliation reuses the already-live kits snapshot and only performs targeted kit reads for referenced IDs missing during startup, instead of downloading the full `kits` collection on every shelf update. If a legacy admin reservation has the `reservationType: "admin"` marker on the kit stock but its shelf document is missing, the admin shelf derives a read-only-compatible shelf row from that stock instead of treating it as customer inventory.
- `kits` is route-scoped. Public `/kits` browsing uses a bounded live page plus cursor reads; entering search promotes it to the full catalog. Basket, checkout, shelf, and admin inventory routes keep the broad listener because stock and Collection status depend on complete state. `deals` is live on the landing page and Kits route for deal pricing and countdowns.
- The public Orders page owns the user's order query while it is mounted; the navbar reuses that store data instead of opening a duplicate notification query.
- Order, Notify Me, and admin user-list listeners use reference-counted shared subscriptions so opening overlapping views does not register identical Firestore listeners twice. The Users Dashboard reuses the live users snapshot when available instead of issuing a duplicate full `users` read.
- The first snapshot marks a dataset loaded even when it contains zero documents. An empty collection is valid data and must not leave the loading overlay visible.

### Spark-plan subscription audit (Updated 2026-09-08)

The project targets the Standard Firestore database `(default)` in `asia-southeast1` through `firebase.json`. The Spark no-cost allowance for Standard Firestore is 50,000 document reads/day, 20,000 writes/day, 20,000 deletes/day, 1 GiB stored data, and 10 GiB/month network egress. Realtime listeners are billed from documents returned by the initial query and subsequent matching changes; maintaining well-scoped listeners is significantly cheaper than repeatedly issuing full collection `getDocs` queries.

Comprehensive codebase audit findings:

- **100% Centralized Listener Architecture:** Zero `onSnapshot` listeners exist in loose React components. All 23 active listeners are defined and managed within `src/store/useStore.js`, ensuring unified lifecycle management and preventing stray or orphaned listeners.
- **Reference-Counted Shared Subscriptions:** `subscribeOrders`, `subscribeNotifyList`, and `subscribeUsersList` utilize internal reference-counted maps (`sharedOrderSubscriptions`, `sharedNotifySubscriptions`, `sharedUsersSubscriptions`). Multiple mounted components (`Navbar`, `Kits`, `ProductCard`, `Orders`, `AddKitModal`, `AdminCalendarModal`) share a single underlying Firestore listener instance; listeners are only unsubscribed and closed when all referencing components unmount (`refCount <= 0`).
- **Route-Aware Lazy Gating (`_getPageRequirements`):** Data listeners only start when navigating to pages that require them:
  - Stories, home kits (`limit(40)`), and home blueprints (`limit(12)`) are active exclusively on `/`.
  - Public `/kits` catalog utilizes cursor pagination (`PUBLIC_KIT_PAGE_SIZE = 40`) or the compact `catalogPublic` projection instead of reading the full collection.
  - Full catalog listener is restricted to Admin views, search mode, cart, and checkout.
  - Print resources (`printers`, `feeders`, `filaments`, `rates`, `extras`, `methods`) are lazy-loaded on demand via `loadPrintResources()` rather than at boot.
- **Zero-Read In-Memory Order Stock Filtering:** Filtering stocks attached to validated-receipt orders and legacy orders (`filterActiveKitStocks` via `src/utils/stockOrderUtils.js`) computes dynamically in memory using the existing `orders` snapshot (`limit(100)`), requiring zero extra Firestore reads.
- **Optimized Supplier Balances:** `SupplierBalancesModal` reuses in-memory `storeKits` whenever loaded, avoiding redundant full collection scans (`getDocs(collection(db, 'kits'))`) during modal open and stock arrival/payment mutations.
- **Targeted Shelf Queries:** Restock and admin shelf auto-release actions query the shelf collection using targeted document keys (`where('id', 'in', [kitId])`), preventing full collection scans.
- **Multi-Tab IndexedDB Caching:** `persistentLocalCache` with `persistentMultipleTabManager` in `src/firebase/firebase.js` shares cached Firestore data across tabs and reloads, eliminating duplicate initial query reads across concurrent browser sessions.

Remaining Spark-plan risks to monitor:
- **Admin Users Dashboard:** Fetches all users, orders, admins, and individual user subcollections (`basket`, `projectVaults`) on mount. Acceptable for internal admin usage, but will require pagination or cloud function aggregation if user count grows significantly.
- **Admin Shelf Listener:** Unbounded collection listener active on all admin routes. Safe while shelf items remain under ~100 docs.

### Spark-plan optimization follow-up (Updated 2026-09-09)

The subscription and repricing paths were reviewed with the free Spark plan as a hard constraint. The following changes were applied without introducing paid-only Firebase services:

- **Print-resource listeners are route-lifetime scoped.** `printers`, `feeders`, `filaments`, `rates`, `extras`, and `methods` are still shared between Prints and Orders when both are mounted, but their reference-counted cleanup now closes the six listeners after the last consumer leaves. This prevents a first visit to either route from keeping the listeners active for the rest of the browser session.
- **Repricing reads are role-scoped.** Admin sessions retain the required full pass over `blueprints`, all `projectVaults`, and printed-project kits so a rate, filament, feeder, or printer change can persist the catalog-wide update. Regular users no longer attempt a full `projectVaults` collection read (which is rejected by the rules); they use the already-live blueprint snapshot and read only their own vault document when needed.
- **Regular-user repricing remains reactive locally.** Because shared blueprint and printed-project writes belong to the admin path, a regular user's live fallback price is updated in Zustand without attempting unauthorized catalog writes. The user's own vault remains writable under the existing owner rule.
- **Overlapping recomputations are coalesced.** If a second resource snapshot arrives while a repricing scan is still running, the store queues one follow-up pass instead of starting another overlapping full scan. The existing 800 ms debounce still combines near-simultaneous printer, feeder, filament, and rate changes.

The remaining largest Spark read cost is the intentional admin-wide repricing scan after a pricing-resource change. It is now limited to the admin workflow, while the client continues to preserve the requirement that resource changes update saved project pricing and that UI values update without a reload. Firebase CLI database inspection was not available in the offline development environment, so the configured database/region in `firebase.json` remains the source of deployment configuration for this audit.

---

## 🗃️ 2. Firestore Collection Schema
The Firestore database is structured into 14 primary collections:

### 👤 User Roles & Auth
- **`users`**
  - *Document ID:* User Firebase UID
  - *Data:* Profile names, email, status (active/banned), basket arrays.
- **`admins`**
  - *Document ID:* Admin Firebase UID
  - *Data:* Dynamic whitelist configuration authorizing admin UI privileges.

### 🏷️ E-Commerce & Catalog
- **`kits`**
  - *Document ID:* Unique generated ID (or formatted via `createKitTargetId`)
  - *Data:* Kit properties, description, image galleries, and the `stocks` map.
- **`catalogPublic`**
  - *Document ID:* Same as the source kit ID
  - *Data:* Public-safe kit display, pricing, availability, and condition summary used by the public Kits catalog.
- **`deals`**
  - *Document ID:* Auto-generated
  - *Data:* Promotional bundle records linking multiple kits with expiration timestamps.
- **`stories`**
  - *Document ID:* Auto-generated
  - *Data:* Marketing slide data listed at the top of the landing page.
- **`orders`**
  - *Document ID:* Auto-generated
  - *Data:* Detailed checkout record mapping user profiles, payment summaries, transaction statuses, and item references.
- **`shelf`**
  - *Document ID:* Auto-generated
  - *Data:* Transient holds and item assignments managed by admins.

### 📐 3D Print Configurations & Calculations
- **`filaments`**
  - *Document ID:* Auto-generated
  - *Data:* Active filament spools (brand, color, type, weight, and remaining grams).
- **`printers`**
  - *Document ID:* Auto-generated
  - *Data:* Printer specifications (bootup timing, bed leveling, multi-color CFS compatibility).
- **`feeders`**
  - *Document ID:* Auto-generated
  - *Data:* Auxiliary multi-material hardware properties (e.g. CFS swap speeds).
- **`extras`**
  - *Document ID:* Auto-generated
  - *Data:* Assembly hardware units (magnets, heatset inserts) tracked by packaging limits.
- **`rates`**
  - *Document ID:* Static Category Names (e.g., `labor-cost`, `material-cost`)
  - *Data:* Key-value variables feeding the Cost Estimation Engine formulas.
- **`blueprints`**
  - *Document ID:* Auto-generated
  - *Data:* Customer design files, dimension metadata, and cost parameters.
- **`settings`**
  - *Document ID:* Static categories (e.g., `garage`, `checkout`)
  - *Data:* Metadata like contact records and global payment handling fees.

---

## 3. Route and data ownership

The application uses route-aware preloading rather than downloading every dataset for every page.

- The landing page loads bounded kit/project slices plus live deals; the public Kits catalog starts with a bounded 40-kit page and loads subsequent pages with a Firestore cursor.
- Public Kits search promotes that route to the full live catalog only when a search is entered. Admin view, cart, checkout, shelf, and stock validation keep the full kits listener because they require complete stock state.
- When `catalogPublic` is populated, its first page and cursor pages are used for public browsing. Kit creation, deletion, and stock-price edits refresh the corresponding projection row; use the admin sync action after bulk stock or reservation changes.
- Deals remain live on the landing page and Kits route for deal pricing, highlights, and countdowns.
- Stories load for the landing page.
- Blueprints and print configuration data load for the Prints and Blueprints routes.
- Orders load for the signed-in customer's Orders page and for admin operational views.
- Shelf data is loaded for administrators because navbar counts and kit cards use it.
- Settings, rates, filaments, printers, feeders, extras, and project-vault data are loaded only when the relevant features need them.

The first live snapshot counts as loaded even when a collection is empty. Persistent IndexedDB caching can satisfy the initial loading gate while Firestore reconnects and refreshes the data in the background. Cart/shelf route refreshes also avoid a second `getDocs` read when the corresponding live listener is already active.

## 4. Important write paths

The principal write paths are:

- `createOrder` creates the order record.
- `reserveStockForCheckout` and `assignStockToOrder` bind exact kit stock units to the order.
- `releaseOrderStocks` removes reservation metadata after cancellation, decline, or timeout.
- Project Vault actions write to `projectVaults/{uid}` for signed-in users and browser-local guest storage for guests.
- Shipping, payment, availability, rate, content, deal, kit, shelf, and supplier actions write the corresponding Firestore documents through store actions.

Firestore listeners update the local store after writes. Components should use store actions instead of duplicating direct document writes so timestamps, derived flags, and cleanup behavior remain consistent.

## 5. Security boundary and current caveats

Firebase client configuration is public browser configuration, not an Admin SDK credential. Authorization must therefore be enforced by Firebase Auth state and Firestore rules, not by hiding UI controls.

The current repository audit identified two rules that require hardening review:

- The `kits` rule currently permits writes from signed-in non-anonymous users. It should be evaluated against the intended admin-only catalog and stock mutation policy.
- The `shelf` collection is publicly readable in the current rules. Shelf records may contain operational or commercial information and should be reviewed for least-privilege reads.

The application currently performs reservation and several business mutations through the browser client. Until a trusted server-side transaction path is deployed and enforced by rules, documentation must describe reservation as client-coordinated Firestore behavior rather than an atomic backend guarantee.

## 6. Maintenance conventions

- Keep stable document IDs and stock keys intact when editing nested stock maps.
- Use server timestamps for business events such as creation, update, reservation, receipt upload, and release.
- Preserve compatibility with older stock condition arrays while migrating records to explicit `boxCondition` and `kitCondition` fields.
- Avoid exposing rates, credentials, or admin-only fields through public documents or hidden-only UI.
- When adding a route, update both route preloading requirements and the relevant live-listener ownership so the global loading gate cannot wait forever or create duplicate listeners.


### Spark-plan live verification (Updated 2026-09-15)

Direct query against the Google Cloud Billing API (`cloudbilling.googleapis.com/v1/projects/snorlaxgarage/billingInfo`) confirmed:
- **`billingEnabled`:** `false`
- **`billingAccountName`:** `""` (none attached)
- **Subscription Tier:** **Free Spark Plan** (100% no-cost tier)

The application remains strictly constrained to Spark no-cost quotas:
- 50,000 document reads/day
- 20,000 document writes/day
- 20,000 document deletes/day
- 1 GiB stored data
- 10 GiB/month network egress

---

## ⚡ 7. Client Performance, Bundle Optimization & Roadmap (Updated 2026-09-15)

### Completed Safe / Zero-Risk Optimizations (Shipped)

To eliminate browser tab crashes on low-memory and mobile devices without risking functional regressions:
1. **Entry Chunk Reduction (-75%):**
   - `index.js` dropped from **1,086 kB → 267.98 kB**.
   - Vendor libraries were chunked via Rollup (`vendor-react`, `vendor-framer`, `vendor-leaflet`).
   - Admin-only modals in `Navbar.jsx` (`OperationsModal`, `StoryEditorModal`, `AccountSettingsModal`, `WelcomeModal`) are dynamically imported via `React.lazy()` with `<Suspense fallback={null}>`.
   - Extracted `CustomDateTimePicker` into `src/components/common/CustomDateTimePicker.jsx` so `StoryEditorModal` no longer pulls in `AddKitModal` (3,894 lines).
   - Removed dead dependencies `papaparse` and `react-facebook` (159 packages removed from `node_modules`).
   - Removed unused `Auth` import from `App.jsx`.
2. **Page Chunk Reductions:**
   - `Kits.js`: Dropped from **263.79 kB → 49.60 kB (-81%)** by lazy-loading `AddKitModal`, `AddDealModal`, `SupplierBalancesModal`, `SalesDashboardModal`, `KitDataQualityModal`, and `DealDetailsModal`.
   - `Prints.js`: Dropped from **249.27 kB → 27.87 kB (-89%)** by lazy-loading `PrintsCalculator`, `PrintedProjectModal`, `FilamentManagerModal`, `PrinterManagerModal`, and `RatesManagerModal`.
3. **Instant Route Navigation:**
   - Centralized route preloading in `src/routePreloads.js` for `/`, `/kits`, `/prints`, `/orders`, and `/cart`.
   - Connected `preloadRoute(path)` to `pointerEnter`, `pointerDown`, and `touchStart` on all desktop and mobile Navbar navigation targets. Navigation occurs near-instantly when clicked/tapped without dropping into full-screen loading gates.
4. **Image Memory Deferral:**
   - Defaulted `loading="lazy"` on `UniversalImage.jsx` so off-screen inventory thumbnails and product cards do not consume decode memory and network bandwidth upon initial render.
5. **Project Card Cleanup:**
   - Suppressed material weight label (e.g. `6.9G`) on STL project cards and modals while preserving dimensions.

---

### Moderate-Risk Optimization Plan (Scheduled for Later Implementation)

These changes provide additional memory reductions but require manual user validation:
1. **Kits DOM Tree Unmounting (`App.jsx`):**
   - *Current Behavior:* `hasVisitedKits` keeps the `<Kits />` component permanently mounted in the DOM (hidden via CSS) once visited to preserve scroll position and avoid remount overhead.
   - *Optimization:* Unmount the component tree when navigating away from `/kits` to free thousands of DOM nodes on mobile devices.
   - *Considerations:* Must cache scroll position in session state or sessionStorage so navigating back restores scroll smoothly without keeping memory tied up.
2. **Navbar Event Listener Consolidation:**
   - *Current Behavior:* 15+ individual event listeners registered across window events (`scroll`, `resize`, `mousedown`, `touchstart`, etc.).
   - *Optimization:* Consolidate into unified, debounced/throttled listeners to lower idle CPU cycles on low-end CPUs.

---

### High-Risk Architecture Optimization Plan (Scheduled for Phased Implementation)

These tasks represent significant architectural improvements that require end-to-end regression testing:
1. **List Virtualization (`@tanstack/react-virtual` or `react-window`):**
   - *Target Pages:* `/kits` (Kits catalog) and `/orders` (Order tracking & management).
   - *Current Risk:* Over 50–100+ complex cards rendered simultaneously in DOM (10,000–50,000 DOM nodes).
   - *Implementation Requirements:*
     - Support dynamic/variable row heights (cards expand/contract based on deals, stock conditions, variant pickers).
     - Preserve in-page browser search (Ctrl+F) or enhance app-level search to compensate.
     - Isolate or lift internal timers from cards to prevent timer resets as cards scroll into and out of view.
2. **Centralized Countdown Timer Coordination:**
   - *Current Risk:* 14+ independent `setInterval(..., 1000)` timers across `Orders.jsx`, `Cart.jsx`, and `ProductCard.jsx`, multiplying by item count to 40–100+ concurrent 1-second interval callbacks.
   - *Implementation Requirements:*
     - Introduce a single global or page-level tick context (`TimerContext`) updating once per second.
     - Subcomponents subscribe to current timestamp and compute diffs purely via memoized selectors, eliminating dozens of concurrent native intervals.
3. **Zustand Store Modularization (`useStore.js`):**
   - *Current Risk:* 6,011 lines in a single monolithic file. Any state mutation triggers subscriber evaluations across all components.
   - *Implementation Requirements:*
     - Split into domain slices (`catalogSlice`, `ordersSlice`, `printSlice`, `authSlice`, `settingsSlice`).
     - Retain centralized Firestore subscription management to prevent duplicate listeners or broken reference counts.
4. **Monolithic Component Decoupling:**
   - *Target Files:* `CheckoutModal.jsx` (5,145 lines) and `Orders.jsx` (4,181 lines).
   - *Implementation Requirements:*
     - Extract sub-modals, customer order summaries, and admin dispatch tools into discrete subcomponents with prop isolation.
