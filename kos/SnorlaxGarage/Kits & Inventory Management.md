# 📦 Kits & Inventory Management

Snorlax Garage manages its physical inventory of 3D-printed kits, filament materials, and hardware extras using real-time Firestore bindings.

---

## 🗃️ 1. Kits & Stock Tracking
A "Kit" (`kits` collection) represents a specific 3D-printed product or assembly model. Rather than maintaining a single integer for stock count, each kit contains a nested map of individual physical stock units called `stocks`:

```json
{
  "id": "kit_id_here",
  "name": "Snorlax Planter",
  "stocks": {
    "stock_key_1": {
      "costPrice": 120,
      "sellPrice": 250,
      "status": "onhand",
      "isReserved": false,
      "publicReleaseDate": "2026-08-01T12:00",
      "order": {
        "orderId": "ORD-12345",
        "orderDocId": "firestore_order_doc_id"
      }
    }
  }
}
```

### 🏷️ Stock Statuses
- **Available:** Stock unit is not reserved (`isReserved: false`) and has no order associated (`!order`).
- **Reserved:** Stock unit is reserved by a customer (`isReserved: true` with `reservedBy` set) or reserved by an admin.
- **Sold:** Stock unit has been purchased and is linked to an active/completed order (`order` object populated).

---

## 🔀 2. Stable Grid Sorting Algorithm
To deliver a premium shopping experience, the platform groups and displays kits dynamically based on availability. To prevent layout flickering during real-time syncs, a stable caching algorithm is used:

### 🧩 Sorting Hierarchy Groups
1. **Group 3 (In-Stock):** Kits that have at least one stock unit available for purchase (unreserved & unsold).
   - *Tie-breaker:* Sorted by the count of available stock units (highest first), then by `lastUpdated` timestamp.
2. **Group 2 (Reserved / On Shelf):** Kits that have stock units, but all are currently reserved.
   - *Tie-breaker:* Sorted by `lastUpdated` timestamp.
3. **Group 1 (Sold Out):** Kits that have no stock units, or all stock units have been sold.
   - *Tie-breaker:* Sorted by `lastUpdated` timestamp.

*This guarantees that users see immediately buyable items first, while sold-out items naturally settle at the bottom.*

---

## 🧵 3. Filament Inventory Management
The `filaments` collection tracks printing consumables:
- **Attributes:** Brand, Type (PLA, PETG, ABS, etc.), Color, Remaining Weight (grams), Spool Price, Load Time, and Homing/Purge timing.
- **Upfront vs Stock:** Filament status can be marked as `upfront` (custom ordered for the project) or `stock` (sourced from existing garage inventory).
- **Clean-up Routine (`cleanupFilamentsStockNo`):**
  When a filament spool runs dry (remaining weight is $\le 0$), any assigned `stockNo` field is automatically cleaned up in a Firestore bulk batch commit to prevent inactive spools from clogging the selector UI.

---

## 🔩 4. Hardware Extras Inventory
Assembly hardware (e.g. Magnets, Heatset threaded inserts, dowels) are stored in the `extras` collection:
- **pack:** The standard package quantity (e.g. 100 pcs per pack).
- **price:** The cost per pack, used to derive the single unit cost:
  $$\text{Price Per Piece} = \text{Pack Price} / \text{Pack Quantity}$$
- **qty:** The overall bulk quantity remaining in physical stock.
- **Status:** Similar to filaments, extras can be loaded `upfront` (charging the customer for full pack packages) or consumed directly from `stock`.
