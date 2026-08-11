# 📦 Order Management

The **Order Management** module regulates checkout parameters, invoice calculations, stock reservations, and order cancellation cleanup procedures.

---

## 💳 1. Payment Fees & Configurations
Checkout fees are dynamically configured by admins in the Firestore settings document `settings/checkout`. The client loads these settings and computes payment surcharges using `getCheckoutPaymentFees()`:

- **Handling Fee (`handlingFee`):** A fixed processing fee applied per transaction.
- **Installment Fee (`installmentFee`):** A percentage or fixed surcharge applied to installment payments.
- **Transfer Fee (`transferFee`):** Gateway fee associated with online bank deposits or digital wallets (e.g. GCash).

---

## 🔒 2. Stock Reservation Cycle
When a customer adds a kit item to their basket and proceeds to checkout:
1. The system matches the requested kit item against an available stock unit in the kit's `stocks` map.
2. The specific stock key is reserved by setting:
   - `isReserved: true`
   - `reservedBy: [User_UID]`
   - `reservedAt: [Timestamp]`
   - `order: { orderId: "ORD-XXX", orderDocId: "doc_id" }`
3. This prevents other customers from purchasing the same stock item while the order is pending processing or shipping.

---

## 🔓 3. Stock Release Logic (`releaseOrderStocks`)
If an order is cancelled, declined, or timed out, Snorlax Garage triggers a safety cleanup process to release the locked stock items back to the available inventory pool.

The release operation is handled by the `releaseOrderStocks` action in the Zustand store:

### ⚙️ Step-by-Step Release Flow
1. **Target Identification:** The system builds a target list of `kitId:stockKey` values from the order's items array using `buildOrderStockTargets(order)`.
2. **Release Execution (`releaseStockTarget`):**
   For each target, the system updates the Firestore kit document to:
   - Reset `isReserved` to `false`.
   - Remove the `order` object using Firestore's `deleteField()`.
   - Remove `reservedBy`, `reservedAt`, `reservationType`, and `reservedByDealId` fields.
   - Set the kit's `hasAvailableStock` flag to `true` (if at least one stock unit is now buyable).
   - Update the kit's `lastUpdated` timestamp.
3. **Safety Sweep:**
   To guarantee no stock is left locked in a "ghost reservation" state, the system performs a sweep over the active list of kits in memory, locating any stock unit whose `order.orderDocId` matches the cancelled order, and triggers `releaseStockTarget` on them.

---

## 4. Customer Order Notifications

The navbar notification system is backed directly by the signed-in customer's live Firestore `orders` query. It renders one notification per order, sorted by the most recent `lastUpdated` timestamp with `createdAt` as fallback. When an order document is deleted, its notification disappears automatically.

### Update identity

Each notification update is identified by a version composed of:

- The order's `lastUpdated` timestamp, falling back to `createdAt`.
- The normalized order `status`.

This allows an order that was previously viewed to become new again whenever its status or update timestamp changes.

### Read state versus seen state

These states are intentionally separate and are stored per Firebase user in browser `localStorage`:

- **Read:** Set only when the customer clicks that specific notification. Unread rows remain blue-highlighted. A newer order version highlights the row again.
- **Seen:** Set for all current notifications when the customer opens the notification panel. Seen state clears the navbar badge and the `(N)` browser-tab title counter without removing row highlights.

Closing the panel does not restore the counter. The counter appears again only when a new order is created or an existing order receives a newer version. Because these states are browser-local, they persist across reloads on that browser but do not synchronize across devices.

### Responsive panel behavior

- Mobile and landscape-tablet notification panels use the full available panel height below the compact navbar and lock page scrolling while allowing internal list scrolling.
- Desktop notifications remain a navbar-anchored dropdown; scrolling outside closes the dropdown.
- Selecting a notification marks that order version as read and opens the matching record on the Orders page.
