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
- `blueprints` is subscribed only on `/prints` and `/blueprints`.
- `shelf` is subscribed for administrators on every route because the navbar and kit cards use live shelf state for collection counts and badges.
- `kits` and `deals` remain global live listeners because basket stock, restock, and last-day deal notifications must update on every page.
- The public Orders page owns the user's order query while it is mounted; the navbar reuses that store data instead of opening a duplicate notification query.
- The first snapshot marks a dataset loaded even when it contains zero documents. An empty collection is valid data and must not leave the loading overlay visible.

---

## 🗃️ 2. Firestore Collection Schema
The Firestore database is structured into 13 primary collections:

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

- Kits and deals remain broadly available because basket availability, deal reminders, and restock notifications depend on them.
- Stories load for the landing page.
- Blueprints and print configuration data load for the Prints and Blueprints routes.
- Orders load for the signed-in customer's Orders page and for admin operational views.
- Shelf data is loaded for administrators because navbar counts and kit cards use it.
- Settings, rates, filaments, printers, feeders, extras, and project-vault data are loaded only when the relevant features need them.

The first live snapshot counts as loaded even when a collection is empty. Persistent IndexedDB caching can satisfy the initial loading gate while Firestore reconnects and refreshes the data in the background.

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
