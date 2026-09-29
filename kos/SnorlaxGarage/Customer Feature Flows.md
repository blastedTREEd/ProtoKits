# Customer Feature Flows

This document describes the customer journey through the current SnorlaxGarage storefront.

## 1. Entry and authentication

Visitors can browse public catalog and print information without signing in. Account actions use Firebase popup authentication through Google or Facebook. Checkout may request Google login for a guest, then return the user to the same checkout state after authentication.

The profile and navbar surfaces provide access to account settings, dark mode, offers, policies, notifications, and the user's order history. Guests retain a local basket and limited browser-local notification state; account-only features such as orders, hunts, and Project Vault require a signed-in account.

The **Delete Account** policy lets a signed-in customer request account deletion. The request sends a confirmation email, starts a 30-day grace period, and logs the customer out. Logging in again during that period cancels the request. Accounts that remain inactive for 30 days follow the same email-plus-30-day-grace flow.

The deletion request is unavailable while the customer has an order with at least one validated receipt that is not yet `Completed`. Final automatic deletion is also paused while that non-completed order remains associated with the account.

At final deletion, the Firebase Auth account, user profile, basket, saved Project Vault projects, and user-owned `hunts` notification/offer-watch records are removed. Order history and completed order records are retained for business and legal record-keeping.

## 2. Kit shopping

The Kits page presents catalog products and their physical stock availability. A product card can expose:

- Individual stock variants.
- Bundle and clearance deals.
- Accepted collection offers.
- Public release timing and pre-order indicators.
- Current availability and reservation state.

The customer selects a product, deal, or offer path and adds the resulting item to the basket. The basket rechecks current availability before checkout rather than relying only on the earlier card state.

## 3. Print-project shopping

The Prints/Blueprints flow supports two source formats:

- **STL:** dimensional and configuration-based estimation.
- **3MF:** plate-ready estimation using sliced time, weight, and color-swap data.

The customer chooses print method, printer, material, quality, extras, assembly/design services, and other configured options. A project must have a meaningful custom name rather than the default `Project #`/unnamed value. Google Drive links are validated when a file link is required, and license acknowledgement is collected when applicable.

Completed estimates can be saved to Project Vault or added to the basket. The vault keeps reusable project information for the signed-in user; guests use browser-local temporary storage.

## 4. Basket and checkout

The basket combines kit and project items. Before finalization, checkout recalculates totals and validates:

- Current stock and reservation eligibility.
- Payment plan and payment method.
- Required shipping or pickup fields.
- Pickup/meetup selection and map pin requirements.
- Project name, source link, license, and service requirements.
- Maintenance mode and storefront availability.

The checkout can show a shipping or printing availability notice from the Garage Calendar. When the relevant service is unavailable today, the customer sees a fulfillment-specific availability message and the next available date.

The checkout availability banner is specific to the selected fulfillment path. It can show same-day shipping, pickup, meetup, or drop-off; next-day variants; or a dated `SHIPS BY`, `PICKUP BY`, `MEETUP BY`, or `DROPOFF BY` message. For print projects, it separately reports when printing starts and when the resulting item can be shipped, picked up, or met up. Reservation plans identify that shipping begins after the balance is paid. Courier branch weekdays and closing time are applied as additional availability limits.

Shipping options are driven by the admin configuration. Courier suboptions may use standard delivery, branch drop-off, self-booking, or a configured pickup point. Branch drop-off collects the courier branch and does not request a pickup pin; self-booking and pickup-point options use the configured pickup location behavior instead.

### Pickup pin visibility

For pickup-point fulfillment, checkout always shows the public rate-checking pickup pin without the house number and does not show an additional status badge. The complete/exact pin is not exposed during checkout.

After an order is created, the customer continues to see the public pin in Orders until the first payment is validated, the remaining balance is cleared, and the order is marked `Ready for Pickup`. Before that point, Orders labels it **RATE CHECKING**. At readiness, Orders switches to the stored exact pickup pin and labels it **ACTUAL PIN**. Administrators retain exact pickup visibility for operational handling.

## 5. Payment and receipt

The order records the selected plan and method, calculated fees, discounts, shipping fee, and balance. The customer uploads a payment receipt, which moves the order to `Validating`. Reservation or partial-payment orders may later receive a balance request and a second receipt.

The customer can see receipt validation progress and the remaining balance. Administrators validate, decline, request balance, confirm cash payments, or move the order into fulfillment.

## 6. Seller meetup scheduling

Seller meetup orders store the available meetup date during checkout, but the customer confirms the precise time later. Once the order reaches `Ready for Meetup`, the buyer can choose a 15-minute window within the admin-configured opening and closing times. The confirmed window is saved to the order and shown in Orders. Admin users can review the selection but cannot choose it for the buyer. If the selected date is today, the first two upcoming slots are withheld as lead time; when no eligible slot remains, the customer must use a later available date.

## 7. Orders and notifications

The Orders page displays the user's order records and status-specific actions. Notifications derive from live order updates and relevant commerce events such as restocks, bundle deadlines, and accepted offers.

Notification read state and seen state are separate browser-local concepts. Opening the panel clears the badge counter; opening an individual notification marks that specific event read. A newer order version can make the event visible again.

## 8. Cancellation and inventory release

Before fulfillment, a customer may be able to cancel an unpaid order depending on its status. Cancelled, declined, or expired reservations are released back to the inventory pool through `releaseOrderStocks`. This may also cause restock notifications or make an accepted offer actionable again.
