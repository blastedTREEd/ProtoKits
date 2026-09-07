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
- **Sold / Validated:** Stock unit has been purchased and is linked to an active/completed order (`order` object populated). Once an order receives payment validation (`hasValidatedFirstReceipt`) or is identified as a legacy order (`isLegacyOrderRecord`), its stocks are dynamically excluded from `ProductCard` variant lists, bundle deal assignments, master list rows, and `AddKitModal` via `filterActiveKitStocks` (`src/utils/stockOrderUtils.js`).

---

## 🔀 2. Stable Grid Sorting Algorithm
To deliver a premium shopping experience, the platform groups and displays kits dynamically based on availability. Non-latest sorting uses stable caching to prevent layout flickering during real-time syncs, while the default **Latest** view responds immediately to inventory availability events:

### 🧩 Sorting Hierarchy Groups
1. **Group 3 (In-Stock):** Kits that have at least one stock unit available for purchase (unreserved & unsold).
   - *Latest order:* Sorted by `lastAvailableAt`, with `lastRestockedAt`, `createdAt`, and `lastUpdated` as legacy fallbacks. New stock and stock released from the admin shelf therefore move to the beginning of **Available Kits**.
   - *Other sorts:* Price, alphabetical, and availability choices continue to use their selected ordering.
2. **Group 2 (Collection / Admin Shelf):** Kits that have no publicly available stock and have at least one unsold stock unit reserved by the administrator (`reservationType: "admin"`). Customer checkout reservations do not place a kit in the Collection section.
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

---

## 5. Physical stock conditions

Each stock variant can carry separate box and kit condition values. The conditions describe the physical unit and are used by admin inventory tools, Master List display, offers, and operational cleanup actions.

Common box values include `PRISTINE`, `BRAND NEW`, `SEALED`, `SEALED BOX`, `NO BOX`, `THIRD PARTY`, `WORN BOX`, and other configured condition labels. Kit values include `SEALED`, `UNBUILT`, `BRAND NEW`, and other configured labels.

The application also contains normalization and migration helpers for older stock records that stored conditions as a two-item `condition` array. Newer records prefer explicit `boxCondition` and `kitCondition` fields. Missing condition data is surfaced by inventory tooling so an administrator can correct the stock record.

Operational defaults currently include:

- Premium Bandai stock: pristine box and sealed kit when the relevant arrival/default action applies.
- Bandai, Tamiya, and Takara Tomy stock: brand-new box and sealed kit when the relevant arrival/default action applies.
- Third-party or bootleg stock: third-party box and unbuilt kit where the stock classification requires it.

These defaults are convenience actions, not a substitute for checking the physical item. The temporary Kits-page migration action changes kit condition to `SEALED` for stock whose box condition is `PRISTINE`; Supplier Balances arrival handling also writes `SEALED` kit condition for arriving stock.

## 6. Master List and stock-level reporting

The admin Master List is an overall stock view rather than a grouped product summary. Each physical stock variant is represented by its own row and is sorted by kit name.

The row contains:

- Photo and kit name, with long names allowed to occupy multiple lines.
- Brand, series, line, and scale in one detail column.
- Cost and sell price in one price column.
- Variant and stock status information.
- Box and kit condition.
- Edit action for the exact stock record.

Sell price is shown in blue when the stock is on the admin shelf. Search supports ordinary text as well as condition queries:

- `BOX:PRISTINE`
- `KIT:SEALED`

The Master List download exports one spreadsheet row per stock variant with the catalog, pricing, condition, status, reservation, shipping, and timestamp details needed for offline review.

## 7. Deals, offers, and stock ownership

The Deal Architect creates bundle and clearance deals that reference specific kit records and discount rules. A deal may reserve or expose particular stock units, while the storefront calculates the customer-facing savings and deal price from the configured discount and current item set.

Admin shelf stock is operational stock held outside the normal public availability pool. It may be used for accepted collection offers or other admin-controlled fulfillment paths. Public catalog availability and admin shelf availability must therefore be distinguished when checking whether a stock unit can be purchased. The Kits page’s Collection section uses the same admin-owned reservation marker as the shelf, so customer checkout reservations are not presented as shelf inventory. Legacy admin-held stock with that marker but without a matching `shelf` document is recovered into the admin shelf view without creating a duplicate Firestore row.

## 8. Admin Shelf Auto-Release & Lowest Cost Price Retention

When a new stock variant is added to an existing kit (`addKit` with `isRestock`):
1. **Shelf Stock Detection:** The store inspects both in-memory kit stocks and queries the Firestore `shelf` collection (`where('id', 'in', [kitId])`) to check if any variant of this kit is currently held in the admin shelf (`isReserved: true, reservationType: 'admin'`).
2. **Cost Price Comparison:**
   - If both the existing shelf unit and the newly added unit have valid `costPrice` values, the system compares them:
     - The stock unit with the **lower cost price** is retained in the admin shelf.
     - The stock unit with the higher cost price is automatically released to general inventory (`isReserved: false`, removing reservation markers and updating Firestore `shelf` documents accordingly).
   - If the new stock has a lower cost price, the shelf item is swapped to reference the new stock key, and the previous shelf unit is released.
   - If cost prices are not comparable, the existing shelf stock is released by default.
3. **Atomic State & Document Sync:** Both Firestore collections (`kits` and `shelf`) and client store states (`state.kits` and `state.shelf`) are updated concurrently, ensuring immediate UI reactivity and preventing phantom shelf holds.

## 9. Inventory lifecycle

The normal lifecycle is:

1. Create or edit the kit catalog record.
2. Add one or more physical stock variants with pricing, status, ETA, and conditions.
3. Track supplier balances until the shipment arrives.
4. Apply or verify arrival conditions and move stock into the appropriate on-hand/public/shelf state.
5. If restocked, evaluate admin shelf holdings for lowest-cost retention and auto-release.
6. Reserve an exact stock variant during checkout.
7. Mark the order outcome; release the variant if the order is cancelled or declined, or retain its order linkage and exclude from active selection once payment is validated or recorded as a legacy order.

Because stock is represented as a nested map inside a kit document, edits must preserve the exact stock key and avoid overwriting unrelated variants.
