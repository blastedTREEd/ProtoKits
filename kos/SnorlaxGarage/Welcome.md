# 🌌 SNORLAX GARAGE - OBSIDIAN HUB

Welcome to your central documentation vault for **Snorlax Garage**! ⚙️🛠️

Snorlax Garage is a premium React-based hub for 3D printing enthusiasts. This Obsidian vault acts as the source-of-truth documentation for all current features, calculation engines, user flows, and state architecture.

---

## 🗺️ Documentation Directory

Select a section below to explore the inner workings of the platform:

### 🔒 Core Systems
* **[[Authentication & Authorization]]**
  * Facebook OAuth Flow via Firebase.
  * Dynamic Firestore whitelist matching for Admin verification.
  * State management of roles (`isAdmin` / `isAdminView`).
  * Firebase client/Admin credential boundaries, rotation procedure, and pre-push secret checks.

### 🧮 Calculations & Core Engines
* **[[Cost Estimation Engine]]**
  * Slicing comparison: **STL** (dimensions & weights) vs. **3MF** (sliced plate data).
  * Rate Configurations: Labor, Materials, Electricity, Maintenance, and Markup rates.
  * Calculation formulas for Grand Totals, Downpayments, and Plate Checklists.
  * Under-the-hood execution mapping for all users.

### 📦 Kits, Inventory & Orders
* **[[Kits & Inventory Management]]**
  * Kits list cataloging & stock state tracking (`available`, `reserved`, `sold`).
  * Stable sorting algorithm for kit availability priority.
  * Deals sync logic and Filament/Extras manager modals.
* **[[Order Management]]**
  * Orders checkout flows and dynamic payment fees (`handlingFee`, `installmentFee`, `transferFee`).
  * Stock reservation release (`releaseOrderStocks`) for cancelled orders.

### 🗄️ Architecture & Databases
* **[[Data & Store Architecture]]**
  * Zustand (`useStore.js`) state store layout and logic slices.
  * Firestore database collection structures.

---

## 🎨 Branding Mandates

Remember that all interface elements, components, and brand assets must strictly align with the **SnorlaxGarage** identity:
- **Palette:** Sleek Blue/Black theme with premium dark-mode styling.
- **Typography:** Bold uppercase italic typography for headers and brand callouts.
- **Language Mode:** Maintain the **Tagalog** comments and annotations within the code logic to assist the developer.
