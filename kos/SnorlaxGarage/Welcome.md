# SnorlaxGarage KOS

SnorlaxGarage is a Firebase-backed React storefront and garage operations system for model kits, 3D-printing projects, custom orders, and fulfillment.

This vault documents the current application behavior. It helps developers, operators, and future maintainers understand what users can do, what administrators control, and where implementation limitations still exist.

## Product areas

### Customer storefront

- Landing page with stories, highlights, and promotional content.
- Kits catalog with stock-aware availability, variants, deals, and collection offers.
- Prints/Blueprints calculator for STL estimates and 3MF plate-ready projects.
- Basket and checkout for kits, projects, or mixed orders.
- Orders page with payment, receipt, status, and fulfillment progress.
- Notifications, profile settings, project vault, and Notify Me/watch lists.

### Admin workspace

- Kit and stock maintenance, including the Master List and stock-condition tools.
- Deals and bundles through the Deal Architect.
- Shelf management for reserved or admin-held inventory.
- Supplier Balances for purchase tracking and arrival updates.
- Sales dashboard, users dashboard, offers, stories, and maintenance settings.
- Operations modal for shipping methods, payment options, and Garage Calendar availability.

### Client typography and Android rendering

- The main React client uses an explicit `Arial, "Helvetica Neue", sans-serif` font stack instead of Tailwind's device-dependent `ui-sans-serif`/`system-ui` defaults.
- `html` sets `-webkit-text-size-adjust: 100%` and `text-size-adjust: 100%` to prevent Android browsers and WebViews from automatically inflating text. Form controls inherit the application font.
- The same font and text-sizing guardrails are applied to the standalone Terms, Privacy, and Data Deletion pages.
- The Story Editor intentionally retains per-text font choices (`sans-serif`, `serif`, `monospace`, and `Impact`); the global typography guardrails do not replace those inline selections.
- These are web-layer protections. A native Android host can still force WebView font or text-zoom settings through its own WebView configuration.

## Core flows

- **Kit purchase:** browse a kit → select a stock variant/deal → add to basket → enter fulfillment details → reserve an exact stock unit during checkout → submit payment/receipt → admin validates and fulfills the order.
- **3D project:** choose STL or 3MF → configure printer, filament, extras, and services → name the project and provide the required file link → review estimate → save to Project Vault or add to basket → schedule production during checkout.
- **Mixed order:** kits and projects may share one checkout. Kit stock is reserved while project production status and scheduling data are stored on the same order.
- **Fulfillment:** select courier, self-pickup, seller meetup, or configured branch/drop-off options → use the configured required fields and pin/location mode → receive shipping or printing delay messaging when the Garage Calendar is unavailable.
- **Administration:** authenticate → pass the dynamic admin whitelist check → use admin-only surfaces to maintain catalog data, orders, rates, fulfillment rules, availability, and content.

## Documentation map

### Core access and architecture

- [[Authentication & Authorization]] — Firebase providers, admin whitelist, route guards, and credential boundaries.
- [[Data & Store Architecture]] — Zustand, Firestore listeners, cache behavior, collections, and security boundaries.

### Customer and commerce flows

- [[Customer Feature Flows]] — end-to-end storefront, project, basket, checkout, order, notification, and fulfillment narratives.
- [[Order Management]] — fees, reservation, payment, receipt, statuses, cancellation, notifications, and checkout behavior.
- [[Kits & Inventory Management]] — kit records, physical stock variants, conditions, deals, Master List, shelf, and supplier arrival behavior.
- [[Projects & 3D Printing]] — project validation, Project Vault, calculator steps, production scheduling, and project order progress.
- [[Cost Estimation Engine]] — STL/3MF calculation inputs, costs, rates, safeguards, and admin calculation views.

### Admin operations

- [[Admin Operations & Fulfillment]] — Operations modal, shipping configurations, payment settings, Garage Calendar, and operational dependencies.

## Important implementation notes

- The client uses Firebase browser credentials. These identify the Firebase project but are not Admin SDK credentials.
- Stock reservation and several business writes currently execute through the client-side Zustand/Firebase path. The rules and code contain indications that stronger server-side transaction handling is still a future migration item.
- Firestore rules are part of the production security boundary. Current rules require review for kit-write authorization and public shelf reads before the system is considered fully hardened.
- The temporary admin stock-condition action on the Kits page is an operational migration tool, not a permanent customer feature.
- Android typography protection is implemented in `src/index.css` and the Tailwind `font-sans` configuration. It reduces system-font substitution and automatic text inflation but cannot override settings forced by a native WebView host.

## Brand language

SnorlaxGarage uses a bold blue, black, white, and accent-color visual system with uppercase labels and compact operational wording. Documentation should describe behavior plainly and must not imply that a planned or partially migrated backend capability is already live.
