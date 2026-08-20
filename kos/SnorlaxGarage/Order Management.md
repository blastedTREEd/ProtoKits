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
- The notification and profile surfaces use solid theme-controlled backgrounds on every viewport: white in light mode and the app's black surface in dark mode, with matching theme borders.
- Selecting a notification marks that order version as read and opens the matching record on the Orders page.

### Commerce notification sources

The same notification feed also derives live customer alerts from kits, basket items, deals, and active `hunts` (the **Notify Me** flow):

- **Last stock:** Triggered when a kit currently in the customer's basket has exactly one publicly available, unreserved stock remaining.
- **Bundle ends today:** Triggered when a basket kit belongs to an active, fulfillable bundle whose `validUntil` date is the current local day and whose deadline has not passed.
- **Back in stock:** Triggered when a watched kit previously observed without public stock becomes available. Watched kits come from active customer hunts and basket items that reached zero stock. This covers new admin stock, cancelled-order stock releases, and stock released from the admin shelf.
- **Offer accepted:** Triggered when an admin releases a collection item at the customer's offer price. The notification names the released item and price, opens the matching product when selected, and disappears if the customer later deletes the offer record. A same-item back-in-stock alert is suppressed to avoid showing duplicate release notifications.

Commerce notifications use stable item IDs and event versions, participate in the same read/seen counters as order notifications, and open the relevant product route when selected. They also work for guests using the guest basket: last-stock and bundle-ending alerts are derived directly from its items, while restock alerts apply to guest basket items previously observed at zero stock. Guest notification state is stored under a browser-local guest scope. Account-based **Notify Me** hunts and order notifications remain available only to signed-in customers.

Out-of-stock history is stored per signed-in user or guest scope in browser `localStorage` so a later restock can be recognized across reloads on the same browser.

### Admin notification scope

Admin view uses a separate notification scope and read/seen history from the administrator's public customer view. It intentionally shows only actionable records:

- **Receipts to validate:** Orders whose status is `Validating` and which contain either a submitted `receipt` or `balanceReceipt`. Selecting the notification opens that exact order on the Orders page.
- **Collection offers:** Active pending/hunting offers whose kit still contains an unfulfilled admin-reserved stock entry (`isReserved: true`, `reservationType: "admin"`). Selecting the notification opens the Offers page.

Offer lifecycle is shared by the admin notification feed and Offers page:

- When a customer deletes an offer, its `hunts` document is deleted, so it disappears from the admin notification feed and admin Offers page through their live snapshots.
- When an admin declines an offer, the document remains marked `declined` so the customer can see the result, but it is immediately excluded from the admin's actionable offer queue.
- When an admin releases an item, the document remains marked `released` so the customer receives the **Offer accepted** notification while the record exists.
- Released, expired, declined, deleted, and no-longer-on-collection offers are not shown in admin view.
- Active admin offers are separated into **Reasonable Offers** first and **Unreasonable Offers** second. An offer is reasonable only when `targetPrice > stock costPrice + handlingFee + installmentFee + transferFee`; an equal or lower offer is unreasonable. The cost is taken from the exact shelf stock that would be released, and each separator is hidden when its section has no offers.

Customer order updates, basket stock alerts, bundle reminders, and customer restock alerts are excluded while admin view is active. Switching back to public view restores the administrator's normal customer notification feed without mixing its read state with admin actions.

### Checkout access during maintenance

When maintenance mode marks either the Kits or Prints storefront unavailable, checkout keeps its current form and items open but changes the final action by user type:

- Guests receive an active **Login with Google** action and a **Payment unavailable** subtext while either storefront is under maintenance. Completing authentication keeps them on the same checkout page with their current checkout state.
- Administrators bypass storefront maintenance and receive the normal **Pay Now** action.
- Signed-in non-admin customers receive an inactive **Payment Unavailable** action.

After guest authentication, the action is recalculated from the live account role and maintenance settings, becoming either **Pay Now** or **Payment Unavailable**.

### Responsive checkout page

- Through the `md` viewport range, checkout keeps a single-column mobile layout. Shipping controls, recipient information, maps, item rows, and totals only switch to the desktop arrangement at `lg`.
- Both the top navbar and mobile mini navbar are hidden on the checkout page through `md` to prevent overlap with checkout controls.
- The checkout close action floats independently at the upper-right without a navbar-like background. The first checkout heading begins in the same opening area with a small top inset instead of sitting below a dedicated header row. Its sticky layer remains above isolated Leaflet maps and controls during scrolling. The normal navbar and desktop close action return at `lg`.

---

## 5. End-to-end order lifecycle

An order begins in `CheckoutModal` and is finalized only after the customer passes the current checkout validations:

1. Maintenance mode, required fulfillment fields, map/pin requirements, payment-plan bounds, and project requirements are checked.
2. The current kit and stock data are read before reservation. A stock unit must still be buyable, or be an explicitly accepted/admin-held offer eligible for release.
3. Each kit stock unit is reserved, then an order document is created with the selected items, pricing, fees, payment plan, fulfillment details, project progress, and timestamps.
4. The customer is sent to the payment/receipt step, or an administrator is returned to Orders for administrative handling.
5. Receipt uploads update the order for validation. Admin status changes drive customer notifications and order progress.

The current implementation performs these operations through the browser's Zustand/Firebase path. This is functional but should not be documented as an atomic server transaction until the planned backend migration is complete.

## 6. Order contents and fulfillment methods

An order may contain:

- Physical kit items with an exact `kitId` and stock key.
- A 3D-printing project with project name, source-link metadata, services, cost summary, and production progress.
- A mixture of kits and projects.

Supported fulfillment behavior is configured per shipping method:

- **Self-pickup:** pickup order/pickup pin data.
- **Seller meetup:** receiver name, mobile number, and meetup location.
- **Couriers:** address fields and courier branch/drop-off data configured by the admin.

Pickup points support two address presentation modes:

- **Rate checking:** the location shown while rates and checkout details are being checked.
- **Actual pin:** the complete pickup location shown when the receipt is validated and the order is ready for pickup.

The Operations shipping configuration determines which fields are required. Checkout consumes the saved configuration rather than assuming every method needs every field.

## 7. Status and cleanup behavior

The order status controls both the admin workflow and customer-facing notifications. Typical transitions include waiting/reserved, validating, confirmed/paid, processing, ready for pickup or shipping, completed, declined, and cancelled.

When an order is cancelled, declined, or times out, `releaseOrderStocks` removes reservation metadata from every exact stock target and restores the stock to the buyable pool when appropriate. This release can also trigger restock or offer-related notifications.

For project orders, the same order record carries project progress and production scheduling information. A mixed order therefore remains one commercial order while kit fulfillment and print production can advance through their own operational steps.

## 8. Availability delay messaging

The Garage Calendar stores printing and shipping availability in `settings/checkout`. If the relevant service is unavailable for the current day, checkout displays:

> PLEASE EXPECT SHIPPING DELAY

It also shows the next available date. Orders are not automatically re-priced by this notice; it is an expectation-setting message based on the current calendar configuration.
