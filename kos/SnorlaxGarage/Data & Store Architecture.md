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
- `shelf` is subscribed only for an administrator on shelf/admin-basket routes.
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
