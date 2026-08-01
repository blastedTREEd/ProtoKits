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
