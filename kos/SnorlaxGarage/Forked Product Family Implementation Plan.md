# Forked Product Family Implementation Plan

## Decision

The split remains viable, but the implementation must be reset to a safer baseline.

The current repository contains the real SnorlaxGarage source at the repository root. The `apps/liquikits`, `apps/komiprints`, `apps/garagecore`, and `apps/daivevargas` folders currently contain generated staging output and dependencies, not tracked application source. They are not reliable forks yet.

The four products should be built from the SnorlaxGarage source through shared UI, shared business logic, and explicit market configuration. This preserves exact visual parity while preventing four divergent copies of checkout, authentication, Firebase access, cost calculation, and order logic.

SnorlaxGarage remains intact and deployable throughout the work. No current app, Vercel project, Firebase record, Storage file, order, user, basket, stock unit, or historical reference is deleted as part of this plan.

## Target product boundaries

| Product | Public surface | Allowed market data | Operational role |
|---|---|---|---|
| **SNORLAXGARAGE** | Combined legacy storefront | Kits and print projects | Existing fallback and historical access |
| **LIQUIKITS** | SnorlaxGarage UI, kit-focused routes | Kits, kit stocks, kit deals, kit offers | Kit customer journey |
| **KOMIPRINTS** | SnorlaxGarage UI, print-focused routes | STL/3MF projects, blueprints, printed projects, print resources | Print customer journey |
| **GARAGECORE** | SnorlaxGarage visual language, admin navigation | All domains, admin-only records, unified orders | Shared operations console |
| **DAIVEVARGAS** | SnorlaxGarage design tokens where appropriate | Public portfolio/projection data only | Presentation and app directory |

## Non-negotiable architecture

### One source tree, multiple app configurations

Keep one source of truth for:

- typography, colors, spacing, motion, cards, modals, loading states, navigation primitives, and responsive behavior;
- Firebase initialization, App Check, authentication, profile synchronization, and cache setup;
- basket, checkout, payment, shipping, order, notification, and fulfillment logic;
- printer/material/cost calculations and kit stock/reservation rules;
- shared data normalization and legacy compatibility.

Each app receives an explicit `APP_ID` configuration at build time:

```text
snorlaxgarage | liquikits | komiprints | garagecore | daivevargas
```

The configuration controls branding copy, allowed routes, navigation items, query selectors, basket scope, and admin/public capability. It must not be used as a security boundary; Firestore rules and authenticated admin checks remain authoritative.

The preferred source layout is a gradual monorepo extraction, not an immediate rewrite:

```text
src/
  appConfig/       # product identity and route/capability configuration
  ui/              # shared SnorlaxGarage visual primitives
  domains/         # kits, prints, orders, auth, operations selectors/actions
  pages/           # shared page implementations with market guards
  store/           # shared listener ownership and actions
apps/              # build/deployment entry configuration only
```

The existing root app remains the first consumer. New app entries are added only after the shared configuration works for SnorlaxGarage.

### Exact UI parity first

LIQUIKITS and KOMIPRINTS should initially look and feel like SnorlaxGarage:

- reuse the current Navbar, PageTemplate, search controls, cards, modal structure, footer, skeletons, button treatments, spectral gradients, dark/light behavior, and responsive breakpoints;
- preserve the current visual hierarchy and interaction language;
- change only the identity label, navigation visibility, explanatory content, and market-appropriate data;
- do not introduce a second design system during the first split;
- compare screenshots at desktop, tablet, and mobile widths before allowing brand-specific styling.

GARAGECORE should reuse the same design primitives and modal language, but expose an admin-first information architecture. DAIVEVARGAS may be simpler, but its typography, spacing, color tokens, and motion should still be derived from the shared system.

## Market data rules

### LIQUIKITS

Allowed public data:

- non-printed kit records and their sellable stock summaries;
- kit conditions, brands, series, pre-orders, clearance/bundle deals, accepted kit offers, and kit availability;
- kit-specific customer basket, checkout, order history, and notifications.

Excluded from LIQUIKITS queries and navigation:

- STL/3MF calculators;
- printer, filament, feeder, extras, and rates;
- blueprints, Project Vault, production scheduling, and print queue data;
- print-only order details.

### KOMIPRINTS

Allowed public data:

- blueprints and STL/3MF calculator inputs;
- Garage Projects, original designs, ready-to-print products, and printed-project listings;
- printer/material choices and customer-facing estimates, without exposing cost price or admin-only rates;
- print-specific basket, checkout, order history, offers, and notifications.

Excluded from KOMIPRINTS queries and navigation:

- physical kit stock variants, supplier balances, shelf inventory, and kit deals;
- kit liquidation/collection workflows;
- unrelated kit order details.

### GARAGECORE

GARAGECORE may read and operate both domains after admin authorization. Its default UI must still be separated into:

- LIQUIKITS workspace: inventory, stock, conditions, shelf, suppliers, deals, offers, and kit reporting;
- KOMIPRINTS workspace: blueprints, projects, printers, filaments, feeders, extras, rates, queue, scheduling, and print reporting;
- Orders/Payments workspace: unified orders with explicit domain and item-type filters;
- Operations workspace: shared shipping, payment, calendar, maintenance, and notification controls.

### DAIVEVARGAS

DAIVEVARGAS should use static or public-safe projection data. It must not load live inventory, admin rates, customer baskets, orders, project vaults, or production queues.

## Shared components that use both markets

Components such as checkout, cart, navbar notifications, order history, payment handling, and shared settings must become domain-aware rather than duplicated.

Each shared component receives a market context or derives it from the app configuration:

```text
market: kits | prints | all | portfolio
```

The component must use market-specific selectors before reading data. Hiding a kit row in the UI after downloading the entire kit and print catalog is not sufficient.

Examples:

- `Cart` resolves only the active basket scope and validates only the item types allowed by that app;
- `Checkout` creates a domain-tagged order while preserving the existing legacy payload shape for old records;
- `Orders` filters customer history by domain, while GARAGECORE can select one or all domains;
- `Navbar` receives app-specific navigation and notification selectors;
- `ProductCard` and `ProjectCard` retain their current shared visual shell but receive domain-specific actions;
- `SalesDashboard` aggregates shared orders by `domain`, `itemType`, and project type rather than assuming every item is a kit.

## Data contract before app extraction

New writes must add explicit fields without rewriting historical source records:

```text
orders.domain: liquikits | komiprints | legacy
orders.items[].domain: liquikits | komiprints
orders.items[].type: kit | garage-project | blueprint | printed-project | print-service
notifications.domain: liquikits | komiprints | shared | admin
```

Use separate customer basket scopes for new writes, for example:

```text
users/{uid}/baskets/liquikits/{basketId}
users/{uid}/baskets/komiprints/{basketId}
```

Keep reading the existing `users/{uid}/basket` collection and guest basket format during migration. A compatibility adapter should display old items in the correct storefront based on their existing `type`, `productType`, and project fields. Do not silently move or delete old basket/order records.

The current representation of printed projects inside the `kits` collection (`productType: "printed-project"`) must remain readable. A later public projection can separate it for lower-cost public reads without changing the authoritative source immediately.

## Firebase and deployment boundary

Use the existing `snorlaxgarage` Firebase project and Standard Firestore database for the first release. Register separate Firebase Web Apps/App Check configuration for each production origin, while keeping shared Auth and UIDs.

Do not create four independent Firebase projects yet. That would fragment Auth, rules, Storage, indexes, payment settings, and reporting before the data contracts are proven. A separate project/database remains a future isolation option after an additive export/import rehearsal.

Each Vercel project should build the same source with a distinct public configuration:

```text
LIQUIKITS   -> APP_ID=liquikits
KOMIPRINTS  -> APP_ID=komiprints
GARAGECORE  -> APP_ID=garagecore
DAIVEVARGAS -> APP_ID=daivevargas
SNORLAXGARAGE -> APP_ID=snorlaxgarage
```

Vercel environment variables must be configured per project for the correct App Check site key and environment. Firebase project identifiers should remain explicit and identical until a future database split is approved.

### Firebase rules work required for the split

The current rules are a legacy baseline, not yet a market-isolation boundary:

- several catalog and print-resource collections are publicly readable;
- rules do not know which Vercel hostname made a request, and a client `APP_ID` cannot be trusted for authorization;
- the current kit write rule is intentionally transitional and still permits signed-in non-anonymous writes while server migration is pending;
- admin authority comes from authenticated Firebase users and `admins/{uid}`, not from the public app configuration.

The fast, safe sequence is additive:

1. Keep the current source collections and SnorlaxGarage rules working for the legacy app.
2. Add public-safe projections such as `catalogPublic/{kitId}` and `printCatalogPublic/{projectId}` for storefront reads.
3. Add a print-resource projection containing only customer-facing printer/material choices; never expose supplier cost, internal rates, maintenance, or remaining-stock details.
4. Make LIQUIKITS and KOMIPRINTS read only the projections and domain-specific resources they need, rather than downloading the combined catalog and hiding rows in the UI.
5. Tighten source collection reads/writes to admin or owner access and cover the changes with Firebase Emulator Suite rules tests.
6. Validate new orders and offers using explicit domain and item-type fields while preserving legacy order reads.
7. Move sensitive stock, reservations, payment confirmation, and production mutations behind trusted Functions or server endpoints.

Do not replace the legacy rules in one deployment. Deploy projections and tests first, compare results with SnorlaxGarage, then tighten one collection at a time.

### Firebase Authentication

Use one Firebase Auth project and preserve existing user IDs. Configure every production Vercel domain, custom domain, preview domain used for acceptance testing, and `localhost` in Firebase Authentication Authorized Domains. Keep the existing Google and Facebook providers shared across the product family, then test popup and redirect flows from each origin.

Authentication is shared identity; access is market-scoped. The app configuration selects the active basket, order history, notifications, and navigation, while Firestore rules enforce owner/admin access. GARAGECORE continues to use `admins/{uid}` for admin authorization. More granular operations roles can be added after the split without changing customer identities.

### App Check and reCAPTCHA

Register an App Check web application/site for each production origin and give each Vercel project its matching `VITE_RECAPTCHA_SITE_KEY` in the Production environment. Register preview origins only when they are used for testing. For local development, use Firebase App Check debug tokens, register those tokens in the Firebase Console, and never commit them.

Before enabling or tightening enforcement, test guest reads, signed-in reads, Auth, order/offer writes, and admin actions from every local and deployed origin. A missing or mismatched key can look like a Firestore permissions problem, so record App Check status separately in the acceptance checklist.

### Vercel fast-path configuration

For the quickest implementation, point all four existing Vercel projects at the same repository and initially the same `main` build pipeline. Use the repository root as the Root Directory, Vite as the framework, `npm run build` as the build command, and `dist` as the output directory. Vary only the app identity, branding/configuration, and matching App Check site key:

| Vercel project | `VITE_APP_ID` | Required production variable |
|---|---|---|
| LIQUIKITS | `liquikits` | `VITE_RECAPTCHA_SITE_KEY` for LIQUIKITS domain |
| KOMIPRINTS | `komiprints` | `VITE_RECAPTCHA_SITE_KEY` for KOMIPRINTS domain |
| GARAGECORE | `garagecore` | `VITE_RECAPTCHA_SITE_KEY` for GARAGECORE domain |
| DAIVEVARGAS | `daivevargas` | `VITE_RECAPTCHA_SITE_KEY` for DAIVEVARGAS domain |

Keep the shared Firebase web configuration identical for the first release. Use the same production branch initially, preview each app before promotion, and do not maintain four source branches until the domain contracts have stabilized. The existing SnorlaxGarage Vercel project remains a separate fallback deployment.

## Implementation sequence

### Phase 0 — Baseline and protection

1. Keep SNORLAXGARAGE production unchanged and tag a known-good commit.
2. Record the current Firebase project, database, Storage bucket, Auth providers, App Check sites, Firestore rules, indexes, and Vercel projects.
3. Confirm every new app can be rolled back to its prior deployment.
4. Treat the generated `apps/*/dist` staging shells as disposable build output; do not use them as source.

Exit gate: SNORLAXGARAGE can still build, deploy, authenticate, browse, checkout, and access historical orders.

### Fast-track infrastructure sequence

Run this in parallel with the shared UI work:

1. Set `VITE_APP_ID` and the matching production App Check key in each existing Vercel project.
2. Register production domains, required preview domains, and localhost in Firebase Auth Authorized Domains; verify Google/Facebook sign-in.
3. Register App Check sites/debug tokens and test guest and authenticated flows before enforcement.
4. Add Firestore Emulator Suite rules tests and public projection schemas.
5. Deploy projections additively and verify that no supplier, cost, admin, or customer-private fields are exposed.
6. Leave the existing SnorlaxGarage source rules and deployment unchanged until comparison passes.
7. Switch one preview app at a time to the new market selectors, then promote only after catalog, Auth, App Check, checkout, and read-volume checks pass.

### Phase 1 — Configuration and shared UI shell

1. Add typed/validated app configuration and a market context.
2. Move title, logo, palette accents, visible nav, route allowlist, and footer copy behind configuration.
3. Keep the SnorlaxGarage visual implementation as the canonical UI.
4. Make each app render a controlled shell with placeholder data before changing Firebase queries.
5. Add local scripts and Vercel build commands for all five app IDs.

Exit gate: all app IDs render the same SnorlaxGarage UI locally without changing data or the legacy app.

### Phase 2 — Domain selectors and compatibility adapters

1. Introduce selectors for kit records, print records, shared orders, notifications, and basket scopes.
2. Add domain fields to new order/notification writes.
3. Keep legacy reads and payload parsing intact.
4. Add fixtures for legacy kit orders, print orders, mixed orders, printed projects, and guest baskets.
5. Add rules/tests for public versus admin fields before exposing new app routes.

Exit gate: the root SnorlaxGarage app produces the same visible results and all new writes carry domain metadata.

### Phase 3 — LIQUIKITS

1. Enable the exact Kits landing/catalog/product-card UI.
2. Remove print routes and print-only listeners from the app configuration.
3. Scope deals, offers, basket, checkout, notifications, and customer orders to kits.
4. Validate guest browsing, authenticated basket, checkout, payment receipt, reservation, cancellation, and order tracking.
5. Deploy a Vercel preview before assigning a public domain.

Exit gate: a kit order completes in LIQUIKITS and remains visible in GARAGECORE and legacy SNORLAXGARAGE.

### Phase 4 — KOMIPRINTS

1. Enable the exact Prints/Projects UI, calculator, Project Vault, ProjectCard, PrintedProjectCard, and printed-project modal.
2. Preserve STL and 3MF calculations, weight/length switching, material compatibility, printer selection, cost breakdown, and offer flows.
3. Remove kit catalog, supplier, shelf, and kit-deal navigation/listeners.
4. Scope basket, checkout, notifications, and customer orders to print items.
5. Validate guest quote, authenticated saved project, project checkout, printed-project purchase, paused-production offer, and order tracking.

Exit gate: a print project and a printed product can be purchased in KOMIPRINTS and operated in GARAGECORE without leaking kit data.

### Phase 5 — GARAGECORE

1. Start from the same UI primitives, but default to admin authentication and an operations dashboard.
2. Add domain-filtered order views and preserve mixed/legacy order access.
3. Consolidate kit inventory/deals and print resources/projects under separate workspaces.
4. Move sales-dashboard revenue, capital, profit, and project-cost breakdowns behind domain-aware queries.
5. Harden rules and verify App Check/admin authorization for every write path.

Exit gate: one admin can operate both storefronts and see accurate unified reporting without using the public storefronts.

### Phase 6 — DAIVEVARGAS

1. Build a fast public presentation shell from shared tokens and selected components.
2. Use static/public-safe portfolio content or a dedicated public projection.
3. Link to LIQUIKITS and KOMIPRINTS; never expose GARAGECORE as a public commerce route.

Exit gate: the portfolio app works even when commerce listeners are unavailable.

### Phase 7 — Parallel validation and staged cutover

Compare new apps against SNORLAXGARAGE for:

- guest and authenticated access;
- App Check and OAuth redirects on every domain;
- catalog completeness and search;
- basket separation;
- checkout/payment/receipt behavior;
- stock reservations and printed-project production states;
- notifications and order history;
- admin reports and capital/profit breakdowns;
- mobile, tablet, desktop, reload, back-button, and deep-link behavior;
- Firestore read volume and failed-permission logs.

Launch previews first, then controlled production pilots. Keep SNORLAXGARAGE live as the fallback until the new apps pass a full acceptance checklist. Redirect traffic only after a verified rollback deployment exists.

## Main risks and controls

| Risk | Control |
|---|---|
| Four copied codebases diverge | Shared source/configuration; no copy-paste forks |
| UI parity breaks | Screenshot comparison gates at three viewport classes |
| Kit data appears in KOMIPRINTS or vice versa | Query-level selectors, market-specific listeners, and rules/projections |
| Shared basket mixes products | New basket scopes plus legacy compatibility adapter |
| Historical orders become unreadable | Preserve document IDs and legacy payloads; add display metadata only |
| App Check/OAuth fails on new domains | Register every production/preview origin and test each redirect path |
| Spark reads grow too quickly | Keep bounded/public projections, lazy listeners, persistent cache, and measure reads before launch |
| Admin writes leak through public apps | Domain-aware Firestore rules plus app configuration only as UX guidance |
| SnorlaxGarage is accidentally replaced | Separate Vercel projects, additive branches/configuration, and rollback tag |

## Recommended immediate next step

Do not delete the four current Vercel projects or Firebase data. First implement Phase 1 in the shared repository: app configuration, market context, shared shell, and local build commands. Then migrate LIQUIKITS and KOMIPRINTS one route group at a time while keeping the current SnorlaxGarage route behavior as the regression oracle.

This plan makes the split viable without sacrificing the exact SnorlaxGarage experience or the existing Firebase/order history.
