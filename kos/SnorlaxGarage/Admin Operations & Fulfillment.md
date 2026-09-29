# Admin Operations & Fulfillment

The Operations workspace centralizes the operational settings used by checkout and orders.

## 1. Operations modal

The modal contains three tabs:

- **Shipping Options:** shipping methods, suboptions, discount/cash behavior, required fields, pickup/meetup locations, courier branches, and pickup-pin presentation data.
- **Payment Options:** payment methods, plans, fees, maintenance mode, and related checkout configuration.
- **Garage Calendar:** printing and shipping availability plus the active project queue.

The Save action is enabled only when Shipping Options or Payment Options contain unsaved changes. Garage Calendar changes are applied through its own availability actions. Closing the modal without changes does not write settings.

## 2. Shipping configuration

The default local methods are self-pickup and seller meetup. Courier methods may have suboptions and their own required-field configuration.

### Self-pickup

Name and pickup order/pickup pin information are always required for the local pickup path. The customer selects a configured pickup point.

### Seller meetup

Name, mobile number, and meetup location are always required. Pickup-point fields are not used for seller meetup.

The admin configures one shared meetup opening and closing time under the meetup settings. The window applies to every active meetup location; a legacy location-level window may be used as a migration fallback. Checkout shows the configured window with the selected meetup place.

### Couriers

Courier forms use the configured address and courier-branch fields. Meetup locations are not used by ordinary courier options. A courier suboption that uses a pickup point can expose the pickup-point selector, but it still follows pickup-pin visibility rules.

Branch drop-off and self-booking are alternative fulfillment behaviors where configured. When branch drop-off is enabled, courier branch is required and drop-off/pickup-pin conflicts are prevented. The admin can also configure branch-unavailable weekdays and a daily branch closing time; checkout treats those rules as additional shipping blackout conditions. When branch drop-off is disabled, a map/drop-off pin or self-booking flow may be available according to the method configuration.

Standard Delivery suboptions default to ordinary delivery. Branch drop-off must be explicitly enabled for that suboption, while other courier suboptions can retain their existing branch behavior. Self-booking and pickup-point behavior are mutually exclusive with branch drop-off.

## 3. Required field behavior

Shipping configuration controls the fields rendered and validated in checkout. The UI distinguishes always-on fields from optional configurable fields and prevents incompatible combinations, such as:

- Pickup order disabled → pickup pin is unavailable.
- Branch drop-off enabled → pickup pin is not used for that suboption.
- Seller meetup → meetup location instead of pickup point.
- Courier → no meetup location.
- Branch drop-off → courier branch and no pickup pin.
- Self-booking/pickup-point fulfillment → the configured pickup point is used and address fields are not duplicated.

The configuration editor uses responsive columns and a compact separator/bar layout. Individual field containers become visually prominent on hover or selection, while the field itself remains independently toggleable.

## 4. Pickup points

Pickup points are stored under `pickupDetails['pickup-point'].places` and limited to two active/configured points in the admin editor. Each point can be toggled active and can carry public/rate-checking and exact address data.

The address presentation contract is:

- **Checkout:** show the public rate-checking pickup pin without house number and without an additional badge.
- **Orders before readiness:** show the same public/no-house-number pickup pin and tag it **RATE CHECKING**.
- **Orders after fully validated payment and `Ready for Pickup`:** resolve the active pickup point tagged **ACTUAL PIN**, then show its exact address/map and tag it **ACTUAL PIN**.
- **Admin Orders view:** retain exact visibility for fulfillment operations.

Checkout resolves the active pickup point tagged **RATE CHECKING** dynamically. It does not depend on the first pickup-point card or a hardcoded location name, so changing the tagged point changes the checkout address and map automatically.

This is a presentation and disclosure rule. The selected pickup point remains associated with the order so the exact pin can be revealed at the correct fulfillment state.

## 5. Payment settings and maintenance

Payment settings configure handling, installment, and transfer fees, payment methods, payment plans, and maintenance mode. During maintenance, checkout remains visible but the final action changes by user role: administrators can proceed, while customers are shown an unavailable payment state or a login action if they are guests.

## 6. Garage Calendar

The Garage Calendar is embedded in Operations rather than opened from the profile modal. It has shared calendar behavior for:

- Printing availability.
- Shipping availability.
- Specific unavailable dates.
- Recurring unavailable weekdays through clickable day headers.
- Active project queue and scheduled production dates.

When an unavailable date is selected, queued projects are moved toward the next available production date according to the scheduling calculation. Checkout uses the same schedule to show the next shipping/printing day and a fulfillment-specific availability banner.

Checkout availability copy is fulfillment-specific: same-day shipping, pickup, meetup, or drop-off; next-day variants; or a `... BY <DATE>` message for later dates. For print projects, the notice separates the print-start date from the later shipping, pickup, or meetup date. Reservation plans also identify that shipping waits for the remaining balance.

For seller meetup orders, the customer does not choose a precise time during checkout. After the order is `Ready for Meetup`, the buyer can select a 15-minute slot from the shared meetup window. On the current day, the first two upcoming slots are withheld as lead time; if no eligible slots remain, the selector is disabled.

## 7. Operational review checklist

Before changing fulfillment settings, administrators should verify:

1. The method/suboption is enabled.
2. Its required fields match the actual customer collection process.
3. Pickup, meetup, branch, and map-pin combinations are compatible.
4. Pickup points have both public and exact location data where needed.
5. Payment settings and maintenance mode reflect the intended checkout behavior.
6. Calendar changes do not leave queued projects without a next available production day.
7. Branch-unavailable weekdays and closing time match the actual courier branch schedule.
