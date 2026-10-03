# Proposed App Split & Product Family Analysis

## Status

This is a brainstorming document, not an approved product or implementation plan. It describes a possible product family based on the current SnorlaxGarage application and should be revisited before any irreversible data, domain, or branding changes.

The implementation guidance in this document is superseded by [Forked Product Family Implementation Plan](Forked%20Product%20Family%20Implementation%20Plan.md). Keep this document as the product-boundary and risk background reference; use the newer plan for sequencing and source-architecture decisions.

**Last updated:** 2026-09-29

**Working proposal:** separate the customer-facing businesses into **LIQUIKITS** for model-kit liquidation and **KOMIPRINTS** for 3D-printing services, use **GARAGECORE** as the shared administrative and operations console, and create **DAIVEVARGAS** as the public portfolio app that presents the whole product family. **SNORLAXGARAGE** remains the current combined app and migration starting point.

## Non-destructive implementation rule

The existing **SNORLAXGARAGE** app must not be deleted, renamed in place, or replaced as part of this plan. The new products are additional apps:

- **LIQUIKITS** is created as a new model-kit storefront.
- **KOMIPRINTS** is created as a new 3D-printing storefront.
- **GARAGECORE** is created as a new admin console.
- **DAIVEVARGAS** is created as a new portfolio app.

SNORLAXGARAGE should continue to build and operate while the new apps are developed. It can remain the current combined production app, a legacy fallback, and an historical-order access point during and after migration. Any eventual reduction of its scope, read-only mode, archival status, or retirement requires a separate explicit decision; it is not implied by this plan.

The migration should therefore use parallel development and staged cutover. New Vercel projects, app configurations, routes, and deployment environments should be created for the four new apps. Existing SNORLAXGARAGE production configuration, URL, Firebase connection, data, and historical behavior should remain recoverable throughout the transition.

### Firebase source-data preservation rule

Migration must not delete records or item data from the original SNORLAXGARAGE Firebase project. This applies to, at minimum:

- Kits, stock units, conditions, shelf records, suppliers, deals, and offers.
- Orders, receipts, payment records, fulfillment details, and legacy order references.
- Users, profiles, baskets, Project Vault records, hunts, and notification history.
- Blueprints, Garage Projects, printed projects, printers, filaments, rates, and production records.
- Firebase Storage files, uploaded receipts, project links/metadata, and operational settings.

New apps may read the existing source data, add domain markers, create new projection documents, or write new records through shared actions. If a separate Firebase project is ever introduced, copying/exporting data into it must be additive. The source records in the SNORLAXGARAGE Firebase project remain intact as the authoritative historical archive unless a separate written deletion decision is made later.

Migration scripts must be idempotent and produce a mapping/audit record for every copied or transformed document. They must preserve original document IDs and references where possible, use explicit migration timestamps and source-project identifiers, and provide a dry-run plus verification step before any production cutover. “Migrated” means “available in the new app,” not “removed from SNORLAXGARAGE.”

## 1. Why separate the apps?

The current application combines two different customer intentions:

- A customer looking for a physical model kit wants fast browsing, stock condition, pricing, deals, and fulfillment.
- A customer requesting a print wants a calculator, file requirements, printer/material choices, production scheduling, and project progress.

These flows share commerce infrastructure, but they do not share the same product vocabulary or decision process. Separating the storefronts could make each app easier to understand, reduce the amount of unrelated UI loaded for each customer, and allow each brand to develop its own tone.

The separation should happen at the experience layer first. The backend, authentication, order records, payment configuration, and operational controls can remain shared while the product boundaries are tested.

## 2. Proposed product family

| App             | Audience                                           | Primary job                                                         | Proposed role               |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------------- | --------------------------- |
| **LIQUIKITS**   | Model-kit buyers and collectors                    | Sell available model kits and move inventory                        | Customer storefront         |
| **KOMIPRINTS**  | Customers requesting 3D prints                     | Quote, schedule, and track printing services                        | Customer storefront         |
| **GARAGECORE**  | Admins and operators                               | Manage both businesses, orders, inventory, pricing, and fulfillment | Internal operations console |
| **DAIVEVARGAS** | Prospective customers, collaborators, and visitors | Explain the creator and showcase the apps, work, and services       | Public presentation site    |

The names are treated as working names. The important architectural decision is the separation of customer storefronts from the shared operations console; the names can still change.

## 3. LIQUIKITS

### Product position

LIQUIKITS would be the focused model-kit selling storefront and the migration destination for the current Kits page. It is not limited to liquidation: it can accept new kit inventory, regular releases, pre-orders, clearance stock, bundles, and collection offers. “Liquidation” can remain part of the brand personality and merchandising, while the actual catalog supports the complete model-kit inventory lifecycle.

### Customer features

- Landing page focused on kit drops, clearance highlights, stories, and current offers.
- Kits catalog with search, filters, sorting, pagination, and stock-aware availability.
- Product detail cards for brand, grade, scale, condition, included stock, price, and release/pre-order information.
- Exact physical stock variants where box or kit condition matters.
- New kit inventory, regular releases, and pre-orders alongside liquidation and clearance stock.
- Clearance, bundle, wild-sale, and collection-offer flows.
- Notify Me/watch list for unavailable kits and accepted offers.
- Basket containing model-kit items only.
- Checkout for kit reservations, payment plans, payment receipts, shipping, self-pickup, or seller meetup.
- Order history with payment validation, balance requests, fulfillment status, cancellation rules, and notifications.
- Customer profile, account deletion policy, preferences, and authentication.
- Optional collector-oriented features later: saved searches, collection history, restock alerts, and price-drop alerts.

### Features intentionally excluded

- STL/3MF upload and validation.
- Printer, filament, feeder, material, quality, and production-service selection.
- Print cost breakdown and project scheduling.
- Project Vault, except for a simple saved-kit or watch-list concept if needed.

### Admin capabilities exposed through GARAGECORE

- Kit master records and physical stock units.
- Box and kit condition management.
- Cost price, selling price, shelf assignment, and supplier arrival state.
- Clearance, bundle, wild-sale, and accepted collection offers.
- Stock reservation, release, rebalancing, and supplier-balance workflows.
- LIQUIKITS sales reporting and inventory metrics.
- Migration controls for importing the current Kits page catalog and preserving legacy stock/order references.

## 4. KOMIPRINTS

### Product position

KOMIPRINTS would be the service storefront for customers who want a physical print produced. Its central experience is a guided quote and production journey rather than a traditional product catalog.

### Customer features

- Service-led landing page explaining supported print types, materials, quality, lead times, and examples.
- STL calculator for dimensional and configuration-based estimates.
- 3MF calculator for plate-ready projects using sliced time, filament weight, and color-swap information.
- Printer, material, quality, color, and production-option selection.
- Extras such as assembly, design support, magnets, heatsets, and other configured services.
- File-link validation, project naming, license acknowledgement, and required project information.
- Public estimate showing price, downpayment, timeline, and customer-facing checklist.
- Project Vault for saving and reusing projects.
- Basket containing print projects only.
- Checkout with payment plans, receipts, fulfillment, production scheduling, and delay messaging.
- Orders page with project progress, print schedule, payment validation, balance requests, and fulfillment status.
- Notifications for project status changes and payment or scheduling actions.
- Optional gallery of completed prints and service examples.
- Original Garage Projects that customers can request to have printed.
- Ready-to-print and already-printed products that customers can purchase as catalog items.

### Features intentionally excluded

- Physical model-kit stock cards, stock variants, supplier shelf inventory, and kit liquidation offers.
- Kit-specific collection offers and stock reservation logic.
- Kit bundle and clearance merchandising.

### Admin capabilities exposed through GARAGECORE

- Printer, feeder, filament, extras, and production-resource records.
- Cost rates and calculation settings.
- Blueprint/project records and public project listings.
- Garage Project records, original designs, and ready-to-print/printed-project catalog records.
- Print queue, production schedule, Garage Calendar, and delay management.
- Print-specific order progress and project repricing.
- KOMIPRINTS sales, utilization, material, and production metrics.

## 5. GARAGECORE admin console

GARAGECORE should become the internal control plane rather than another customer storefront. An admin should be able to manage both businesses from one authenticated workspace while clearly seeing which domain owns each record.

### Shared admin features

- Unified order inbox with filters for `LIQUIKITS`, `KOMIPRINTS`, mixed legacy orders, payment state, fulfillment state, and attention required.
- Customer and admin account management.
- Payment methods, payment plans, handling/transfer/installment fees, maintenance mode, and receipt validation.
- Shipping methods, suboptions, pickup points, seller meetup locations, branch drop-off rules, self-booking, and fulfillment schedules.
- Garage Calendar for shipping and printing availability.
- Notifications and operational alerts.
- Sales dashboard with domain, product type, date, payment, and fulfillment filters.
- Audit history for important price, stock, payment, and status changes.
- Shared content settings where appropriate, without forcing both storefronts to use the same marketing content.

### Domain workspaces

GARAGECORE should use explicit sections or tabs rather than one blended admin surface:

- **LIQUIKITS workspace:** Kits, Stock, Master List, Shelf, Deals, Offers, Suppliers, and kit sales.
- **KOMIPRINTS workspace:** Projects, Blueprints, Printers, Filaments, Feeders, Extras, Rates, Print Queue, and production sales.
- **Orders workspace:** shared order handling with domain-specific detail panels.
- **Operations workspace:** shared payments, fulfillment, availability, and maintenance.

### Admin access model

The existing dynamic admin whitelist can remain the first gate. Later, role claims or admin permission records could distinguish:

- Full owner/admin access.
- LIQUIKITS inventory operator.
- KOMIPRINTS production operator.
- Payments and fulfillment operator.
- Content or portfolio editor.

The first split should not require granular roles if that would delay the storefront separation, but the UI should avoid assuming every admin can edit every domain.

## 6. DAIVEVARGAS portfolio app

DAIVEVARGAS should be a public, low-friction presentation layer. It should explain the relationship between the apps without behaving like a checkout application.

### Proposed features

- Personal or studio introduction.
- App directory with LIQUIKITS, KOMIPRINTS, and GARAGECORE descriptions.
- Links into each storefront and clear explanation of who each app is for.
- Selected model-kit, 3D-print, design, and development work.
- Case studies or project pages with images, process notes, and outcomes.
- Service overview for custom printing or collaboration inquiries.
- Contact form or external contact links.
- Social links, resume/about page, and optional changelog.
- Responsive, fast static pages with minimal account and data requirements.

### Features intentionally excluded

- Kit checkout.
- Print quoting or file upload.
- Admin order operations.
- Live inventory or production queue.
- Customer notifications and payment receipts.

DAIVEVARGAS could initially be static or content-file driven. A future portfolio editor may be added to GARAGECORE, but portfolio publishing should not become a dependency for commerce operations.

## 7. Shared platform and data model

The recommended first architecture is four new frontends over one shared Firebase project and one shared operational data model: LIQUIKITS, KOMIPRINTS, GARAGECORE, and DAIVEVARGAS. These are created in addition to the retained SNORLAXGARAGE app, not by deleting or renaming it.

### Shared identity

- Google and Facebook authentication remain available across the storefronts.
- A user can use one account on LIQUIKITS and KOMIPRINTS.
- Basket state should be separated by storefront so kit items and print projects do not silently mix.
- Project Vault belongs to KOMIPRINTS; kit watch lists and collection preferences belong to LIQUIKITS.
- Admin access remains controlled centrally by GARAGECORE.

### Shared profile, separated customer history

The customer profile should be shared across LIQUIKITS and KOMIPRINTS. A customer should not need to create a second account, repeat identity details, or manage two unrelated profile records.

Payment and order history should be separated in the customer experience by storefront, while remaining consolidated in GARAGECORE. LIQUIKITS should show kit purchases and kit-related payment activity; KOMIPRINTS should show print projects and print-related payment activity. GARAGECORE should provide both filtered views and a combined financial/order view.

This is a logical separation, not necessarily two payment databases. A shared order model with explicit `domain`, `itemType`, and payment summary fields is the simplest first implementation. The customer UI filters the history; GARAGECORE can filter by domain or select **All domains**.

### Shared collections and ownership

The existing collections can remain shared initially, but records should gain explicit domain markers where they do not already have one:

- `orders.domain`: `liquikits`, `komiprints`, or `legacy`.
- `orders.items[].domain`: identifies the owner of each order item.
- `orders.items[].type`: `kit` or `print-project`.
- `users/{uid}/baskets/liquikits` and `users/{uid}/baskets/komiprints`, or equivalent separate basket fields.
- `users/{uid}/projectVault` remains KOMIPRINTS-owned.
- `hunts` or notification records should include a domain/type so a LIQUIKITS restock alert is not shown as a KOMIPRINTS event.

Candidate domain ownership:

| Data | Owner app | Admin owner |
|---|---|---|
| Kits, stocks, conditions, shelf, suppliers, kit deals | LIQUIKITS | GARAGECORE / LIQUIKITS workspace |
| Blueprints, projects, printers, filaments, rates, print queue | KOMIPRINTS | GARAGECORE / KOMIPRINTS workspace |
| Orders, receipts, users, payments, fulfillment | Both | GARAGECORE / shared workspace |
| Shipping, payment, availability settings | Both | GARAGECORE / Operations workspace |
| Portfolio content and case studies | DAIVEVARGAS | Portfolio/content workspace or static source |

### Public read models

The current `catalogPublic` projection is a useful pattern for LIQUIKITS. KOMIPRINTS could use a separate public-safe project/service projection rather than exposing rates, stock costs, printer internals, or admin-only calculation data. Public storefronts should receive only the fields needed to browse or quote.

## 8. Hosting and Firebase boundary

### Vercel URLs and domains

The proposed apps can each be deployed as separate Vercel projects. Vercel automatically gives each project a generated `vercel.app` URL based on the project/deployment naming. A URL shaped exactly like `daivevargas.liquikits.vercel.app` should not be treated as guaranteed, because arbitrary subdomains under Vercel's shared `vercel.app` namespace are not the same as owning a DNS zone.

Possible development or temporary project URLs may look like:

- `liquikits-<team-or-scope>.vercel.app`
- `komiprints-<team-or-scope>.vercel.app`
- `garagecore-<team-or-scope>.vercel.app`
- `daivevargas-<team-or-scope>.vercel.app`

For the public launch, the preferred structure is either one owned root domain with subdomains:

- `liquikits.<owned-domain>`
- `komiprints.<owned-domain>`
- `garagecore.<owned-domain>`
- `<owned-domain>` for DAIVEVARGAS

or separate owned domains if the branding and budget justify them. Each Vercel project can be assigned its own custom domain or subdomain through DNS configuration. The portfolio should link to the storefronts and admin access should not be promoted publicly.

### Firebase project recommendation

Use one Firebase project and one primary Cloud Firestore database for the first split. Register LIQUIKITS, KOMIPRINTS, GARAGECORE, and DAIVEVARGAS as separate web apps where needed, but keep shared Authentication and operational data centralized. This supports the desired shared customer profile and makes consolidated GARAGECORE reporting straightforward.

Do not separate Firebase projects merely because the frontends are separate. Separate projects would create separate Auth users, Firestore rules, functions, storage, indexes, secrets, analytics, and operational configuration. They can be useful later for strong isolation, independent billing, or a future sale/spin-off, but they add cross-project synchronization work immediately.

Firestore also supports multiple databases per project, which could be considered later for stronger data isolation. That would still require explicit client configuration, rules, indexes, and admin reporting across databases, so it is not the default recommendation for the first migration.

### If a future database split becomes necessary

A future migration is possible, but should be treated as a project with rehearsals and rollback planning:

1. Add domain fields and stable public identifiers before splitting.
2. Export the selected Firestore collections and import them into the destination database/project without deleting or mutating the source records.
3. Recreate rules, indexes, Cloud Functions, Storage references, environment secrets, payment configuration, and scheduled jobs.
4. Migrate Firebase Authentication users separately, preserving UIDs where possible so profile and order ownership references remain valid.
5. Validate references between users, orders, stock, payments, project vaults, and notification records.
6. Run a dual-read or read-only verification period before changing production writes, while retaining the original SNORLAXGARAGE data as the rollback source.

Managed Firestore export/import is available for moving documents between databases, but Firebase documents that it requires billing/Blaze and a Cloud Storage bucket. Firebase Authentication provides user export/import paths, including migration from another Firebase project. This is feasible, but it is not a reason to split the database before the product boundaries are proven.

Platform references: [Vercel domains](https://vercel.com/docs/domains/working-with-domains), [Firebase project relationships](https://firebase.google.com/docs/projects/learn-more), [multiple Firestore databases](https://firebase.google.com/docs/firestore/manage-databases), [Firestore export/import](https://firebase.google.com/docs/firestore/manage-data/export-import), and [Firebase Authentication user import](https://firebase.google.com/docs/auth/admin/import-users).

## 9. Order and checkout boundary

The recommended initial rule is: each storefront has its own basket and checkout, while GARAGECORE has one unified order view.

This means:

- LIQUIKITS orders contain kits and kit fulfillment data.
- KOMIPRINTS orders contain projects and production data.
- GARAGECORE can search and manage both types together.
- Cross-links can offer the other app, but the customer is not forced into a mixed-domain cart.

The current mixed order behavior can be retained temporarily for legacy records and supported during migration, but new mixed orders should not be the default. Kit reservations and print scheduling have different failure modes, lead times, and customer expectations. Keeping them separate reduces checkout complexity and makes cancellation, payment, and fulfillment rules easier to explain.

If mixed checkout is eventually needed, it should be an explicit “combined order” feature with separate domain sections, not an accidental result of sharing the same basket.

### Domain order numbers and legacy records

Customer-visible order numbers should identify the owning storefront, for example `LK-...` for LIQUIKITS and `KP-...` for KOMIPRINTS. Legacy orders should also receive a visible domain-prefixed number during migration.

The migration should preserve the existing Firestore document ID and internal references. The new domain-prefixed value should be a stable display/order number, not a destructive replacement of the document key. Mixed or unclassifiable legacy records can temporarily use a separate `SG-...` or `LEGACY-...` prefix until they are reviewed.

## 10. Current-to-proposed feature mapping

| Current SnorlaxGarage capability | Proposed destination |
|---|---|
| Kits catalog, stock variants, conditions, deals, collection offers | LIQUIKITS storefront + GARAGECORE LIQUIKITS workspace |
| Basket and kit checkout | LIQUIKITS |
| STL/3MF calculator and project cards | KOMIPRINTS |
| Project Vault and blueprint data | KOMIPRINTS |
| Printer, filament, feeder, extras, and rates management | GARAGECORE KOMIPRINTS workspace |
| Shared orders, receipts, payments, and fulfillment | GARAGECORE, with customer views in the owning storefront |
| Shipping Options, Payment Options, and Garage Calendar | GARAGECORE Operations workspace |
| Navbar stories and promotional content | Split by storefront; DAIVEVARGAS may reuse selected public stories |
| Profile, authentication, deletion policy, and notifications | Shared platform behavior, filtered by app/domain |
| Landing page | Separate LIQUIKITS and KOMIPRINTS landing pages; DAIVEVARGAS gets its own presentation landing page |

## 11. Migration strategy

### Phase 0 — Protect the current app

- Tag the current SNORLAXGARAGE codebase and preserve the current Vercel deployment.
- Back up the current Firebase configuration and establish the source-data preservation rule.
- Keep the current SNORLAXGARAGE email, admin access, URL, repository, Firebase project, and historical data.
- Confirm that no migration step will delete, purge, archive away, or overwrite source records.

#### Phase 0 execution status — 2026-09-29

- **Completed:** The latest calculator behavior is included in the current baseline commit `bf4f566` (`plate and model toggle`).
- **Completed:** A local annotated baseline tag was created as `snorlaxgarage-pre-migration-phase-0`. It has not been pushed to the remote yet.
- **Completed:** The repository still points to the existing `snorlaxgarage` Firebase project through `.firebaserc`; no source Firestore or Storage records were changed.
- **Completed:** The production build passed after the calculator and cost-engine changes.
- **Completed:** Auth synchronization now invalidates stale logout/login work and clears the loading overlay from the store after successful profile synchronization; the production build passed after this fix.
- **Pending account-side verification:** confirm the current Vercel deployment, custom domain, current email/admin access, and rollback deployment remain available.
- **Pending authorized backup:** export or otherwise snapshot the current Firebase configuration and data using the owner-approved Firebase/Google Cloud account before any migration write.
- **Pending decision record:** confirm the source-data rule remains additive: copied or transformed records may be created, but SNORLAXGARAGE source records must not be deleted, purged, archived away, or overwritten by migration.

**Exit condition:** SNORLAXGARAGE can be restored and operated independently at any time.

### Phase 1 — Create infrastructure

- Create new Vercel projects for LIQUIKITS, KOMIPRINTS, GARAGECORE, and DAIVEVARGAS.
- Create a separate staging Firebase project for development and testing.
- Register staging Firebase Web Apps for the new applications.
- Register production Web Apps in the existing SNORLAXGARAGE Firebase project only when each new app is ready for controlled production access.
- Create Git branches or monorepo app folders without relocating or deleting the current SNORLAXGARAGE app.
- Configure staging and production environment variables separately.

**Exit condition:** each new app has an isolated preview deployment and a known Firebase environment.

### Phase 2 — Define shared data contracts

- Define `orders.domain` as `liquikits`, `komiprints`, or `legacy`.
- Define item types such as `kit`, `garage-project`, `printed-project`, and `print-service`.
- Define separate customer baskets while keeping a shared customer profile.
- Define storefront-filtered customer histories and consolidated GARAGECORE history.
- Define `LK-...` and `KP-...` display order numbers, with a temporary prefix for mixed or unclassified legacy records.
- Define notification ownership and the migration audit/mapping record format.

**Exit condition:** all apps agree on the shared identity, order, item, payment, notification, and legacy-record contracts.

### Phase 3 — Build shared application foundations

- Create reusable Firebase initialization and environment handling.
- Create shared authentication and customer-profile access.
- Create domain-aware Firestore queries and permissions.
- Create shared order, payment, fulfillment, notification, and UI modules where reuse is safe.
- Keep GARAGECORE as the source of truth for operational settings.

**Exit condition:** new apps can authenticate, read permitted shared data, and use domain-aware models without exposing unrelated admin data.

### Phase 4 — Build LIQUIKITS alongside SNORLAXGARAGE

- Create LIQUIKITS as a new model-kit storefront; do not remove the Kits routes from SNORLAXGARAGE.
- Reuse or extract the catalog, product cards, stock variants, deals, bundles, basket, kit checkout, and kit order views.
- Support migrated kits, new inventory, regular releases, pre-orders, clearance, seller meetup, and self-pickup.
- Add domain markers to new LIQUIKITS orders.
- Keep SNORLAXGARAGE's existing kit routes available while LIQUIKITS is tested and adopted.

**Exit condition:** a test customer can complete the kit browsing, reservation, payment, fulfillment, notification, and cancellation flows in LIQUIKITS.

### Phase 5 — Build KOMIPRINTS alongside SNORLAXGARAGE

- Create KOMIPRINTS as a new printing storefront; do not remove Prints, Blueprints, or project routes from SNORLAXGARAGE.
- Reuse or extract the STL/3MF calculator, Garage Projects, original designs, ready-to-print blueprints, printed projects, Project Vault, basket, checkout, and print order views.
- Preserve current cost-engine, printer, filament, feeder, extras, and scheduling behavior.
- Add domain markers to new KOMIPRINTS orders.
- Keep SNORLAXGARAGE's existing print routes available while KOMIPRINTS is tested and adopted.

**Exit condition:** a test customer can quote, save, purchase, schedule, pay for, and track a print project or printed product in KOMIPRINTS.

### Phase 6 — Build GARAGECORE

- Create GARAGECORE as a new admin console; do not rename the existing SNORLAXGARAGE admin surfaces in place.
- Add unified order management with LIQUIKITS, KOMIPRINTS, and legacy filters.
- Add separate LIQUIKITS and KOMIPRINTS workspaces.
- Add payment validation, fulfillment, Garage Calendar, inventory, shelf, supplier, deals, print resources, rates, and print queue tools.
- Add separate reports and consolidated reports with domain filters.
- Add legacy-order access and migration audit views.

**Exit condition:** admins can manage both new storefronts without needing to delete or rewrite SNORLAXGARAGE records.

### Phase 7 — Build DAIVEVARGAS

- Start with a static portfolio and outbound links.
- Add LIQUIKITS, KOMIPRINTS, and GARAGECORE descriptions.
- Add selected model-kit, 3D-print, design, and development case studies.
- Add a contact/collaboration flow, deciding whether inquiries go to GARAGECORE or an external inbox.

**Exit condition:** DAIVEVARGAS can present the product family without commerce or administrative dependencies.

### Phase 8 — Additive data migration and record alignment

- Add domain fields to new and existing records without deleting source documents.
- Create domain-prefixed display order numbers while preserving original Firestore document IDs and references.
- Create public projections or app-specific indexes where needed.
- Copy or transform records only through idempotent, auditable scripts.
- Record source project, source document ID, destination document ID, migration timestamp, and transformation status.
- Validate users, orders, payments, stock, projects, receipts, storage files, and notification references against SNORLAXGARAGE.

**Exit condition:** new apps can call the required records while every source record remains available in the original Firebase project.

### Phase 9 — Implement notifications and reporting

- Route kit commerce notifications to LIQUIKITS.
- Route print and project notifications to KOMIPRINTS.
- Route actionable admin notifications to GARAGECORE.
- Keep identity/security events shared at the account level.
- Implement domain-filtered and consolidated revenue/order reports.
- Review every notification in the KOS inventory and decide whether it is storefront, GARAGECORE, shared, or suppressed.

**Exit condition:** customer and admin notifications are separated by domain without losing existing order or commerce events.

### Phase 10 — Parallel validation

- Test guests, regular customers, admins, and future operator roles.
- Test kit orders, print orders, original designs, printed projects, payments, receipts, seller meetup, self-pickup, shipping, stock reservations, and project schedules.
- Compare catalog, order, payment, stock, project, notification, and reporting results between the new apps and SNORLAXGARAGE.
- Test Firestore and Storage rules with staging data and migration fixtures.
- Run dry-run migration scripts and verify rollback behavior.

**Exit condition:** the new apps pass an acceptance checklist while SNORLAXGARAGE remains usable.

### Phase 11 — Staged launch

- Launch preview deployments first.
- Run internal GARAGECORE testing.
- Pilot LIQUIKITS and KOMIPRINTS with controlled users.
- Launch DAIVEVARGAS publicly.
- Update public links only after the new storefronts pass production checks.
- Keep SNORLAXGARAGE available as a fallback and historical access path.

**Exit condition:** customers can use the new storefronts and admins can operate them through GARAGECORE without data loss.

### Phase 12 — Optional future cutover

- Redirect more traffic to LIQUIKITS and KOMIPRINTS only after successful pilots.
- Optionally make selected SNORLAXGARAGE customer surfaces read-only later.
- Keep the SNORLAXGARAGE repository, deployment, Firebase configuration, and source data intact.
- Treat any archival, read-only conversion, or retirement of SNORLAXGARAGE as a separate explicit decision.

## 12. Main risks and mitigations

### Duplicate business logic

Separate frontends can accidentally create different payment, fulfillment, or authorization behavior. Keep shared logic in reusable packages/modules or shared backend actions, and make GARAGECORE the source of truth for operational settings.

### Data leakage between domains

Kits, stock costs, print rates, and admin records must not become public merely because the apps share a Firebase project. Use public projections, domain-aware queries, and Firestore rules rather than hiding fields in the UI.

### Fragmented customer experience

Use one identity and consistent account/payment language, but preserve separate baskets and domain-specific navigation. Cross-link only when it helps the customer.

### Mixed-order migration

Legacy mixed orders must remain viewable and operable in GARAGECORE. Do not rewrite historical order records until a migration and audit path exists.

### Operational overload

GARAGECORE should unify operations without making every admin screen show every domain. Default to domain-filtered views with a deliberate “All domains” option.

### Brand confusion

DAIVEVARGAS should explain the relationship clearly: LIQUIKITS and KOMIPRINTS are customer products; GARAGECORE is the operator console. Avoid presenting GARAGECORE as another customer marketplace unless that is an intentional brand decision.

## 13. Notification inventory and routing brainstorm

The current app has two notification scopes: customer/public notifications and admin/action notifications. The split should preserve that distinction while adding domain ownership. The table below is a working inventory; **candidate destination** is a suggestion for discussion, not a final decision.

### Current customer-facing notifications

| Notification/event | Current meaning | Candidate destination |
|---|---|---|
| `Reserved` | Kit or mixed order has been reserved | LIQUIKITS for kit orders; KOMIPRINTS for print orders |
| `Validating` | Payment receipt is being reviewed | Owning storefront; GARAGECORE action queue |
| `Waiting` | Order is waiting for the next operational update | Owning storefront |
| `Preparing` | Order or print work is being prepared | Owning storefront |
| `Arrived` | Pre-order or required order items have arrived | LIQUIKITS for kits; KOMIPRINTS when applicable to print materials/projects |
| `To Ship` | Order is ready to enter shipping handling | Owning storefront |
| `Ready for Pickup` | Order can be collected from the configured pickup path | Owning storefront |
| `Ready for Meetup` | Order is ready for seller-meetup scheduling/collection | LIQUIKITS for kit orders; KOMIPRINTS for print orders |
| `Shipped` | Order has been shipped | Owning storefront |
| `Dispatched` | Courier or dispatch handoff has occurred | Owning storefront |
| `In Transit` | Order is moving through delivery | Owning storefront |
| `Completed` | Order is complete | Owning storefront; GARAGECORE reporting/history |
| `Cancelled` | Order was cancelled | Owning storefront; GARAGECORE operational history |
| Generic order update | A changed order timestamp/status without a specialized message | Owning storefront |
| Last stock | Exactly one publicly buyable kit stock remains in the customer's basket | LIQUIKITS |
| Bundle ends today | A basket kit belongs to an active, fulfillable bundle ending today | LIQUIKITS |
| Wild Deal ends soon | A basket kit is inside an active timed wild-sale window | LIQUIKITS |
| Back in stock | A watched or previously out-of-stock kit becomes available | LIQUIKITS |
| Offer accepted | An admin releases an offered collection item at the customer's target price | LIQUIKITS |
| Offer checkout missed | An accepted offer's checkout window expires | LIQUIKITS |

### Current admin/action notifications

| Notification/event | Current meaning | Candidate destination |
|---|---|---|
| Receipt to validate | An order in `Validating` has a first or balance receipt | GARAGECORE Orders / Payments; filter by LIQUIKITS or KOMIPRINTS |
| Collection offer received | A customer has an active offer for an admin-reserved collection item | GARAGECORE LIQUIKITS workspace |
| Legacy order completed | A legacy order reached `Completed` and may require reversal/archival attention | GARAGECORE legacy/order migration workspace |

### Important candidate notifications not yet represented as dedicated events

These are operational or customer events that may currently appear only as an order update, a page banner, or a visible state change. They are candidates for explicit notifications after the split:

- Payment or balance requested from a customer.
- Balance receipt submitted and awaiting validation.
- Seller meetup window confirmed, changed, or approaching.
- Shipping, pickup, or meetup delayed by the Garage Calendar or branch schedule.
- Print project accepted, queued, printing, paused, design-finalized, ready for pickup, or completed.
- A customer-provided design needs clarification or license confirmation.
- An original Garage Project or ready-to-print product becomes available for purchase.
- Printed-project stock is low or unavailable.
- A kit reservation, stock assignment, or payment validation needs admin intervention.
- A supplier shipment or kit arrival needs admin action.
- A production resource, printer, filament, or rate change affects queued projects or saved estimates.
- A fulfillment issue, failed payment, expired reservation, or delivery exception needs attention.
- DAIVEVARGAS portfolio contact inquiry, collaboration request, or project inquiry.

### Suggested routing principle

- The storefront that owns the customer action should receive the customer-facing notification.
- GARAGECORE should receive actionable admin notifications, regardless of which storefront originated the record.
- Account/security events should be shared at the identity level, not duplicated as unrelated commerce alerts.
- DAIVEVARGAS should receive portfolio/contact events only if it has an internal inbox; otherwise those can remain in an external form/email system.

The final routing of each row remains open for review.

## 14. Open brainstorming questions

The following decisions have been recorded from the brainstorming session:

- LIQUIKITS will accept both existing/migrated kits and new kit inventory, including regular releases and pre-orders. It is a model-kit storefront with a liquidation identity, not a liquidation-only store.
- LIQUIKITS will support seller meetup and self-pickup in addition to shipping and other configured fulfillment methods.
- KOMIPRINTS will sell customer-requested prints, original designs, Garage Projects, ready-to-print blueprints, and already-printed products.
- LIQUIKITS and KOMIPRINTS will share the customer profile, but their customer-facing payment/order history will be separated by storefront. GARAGECORE will consolidate both histories for administration and reporting.
- Customer-visible order numbers will use domain prefixes such as `LK-...` and `KP-...`. Legacy orders will be renamed visibly while their internal document IDs and references are preserved.
- GARAGECORE will provide both separate domain reports and a consolidated report with filters.

Questions remaining for the next discussion:

- Which custom domain structure should be purchased: subdomains under a shared owned domain, such as `liquikits.daivevargas.com`, or separate root domains? The `*.vercel.app` URLs can be used for development and temporary deployment links.
- Should the first release keep one Firebase project and one Firestore database, or should any domain use a separate database for isolation? The current recommendation is one shared project/database first, with explicit domain fields and rules.
- Which notification rows in the inventory should be customer-visible, admin-only, both, or suppressed? Review the notification table above one row at a time.
- Should DAIVEVARGAS contact requests be stored in a GARAGECORE content/CRM inbox, or remain in an external email/form system? This is now a contact-management question rather than a general portfolio question.
- Should original designs and printed products use separate public catalogs inside KOMIPRINTS, or one catalog with clear product-type filters?
- Should `SG-...` or `LEGACY-...` be used for mixed/unclassified historical orders during migration?

## Preliminary recommendation

Proceed with a storefront split and an admin consolidation:

1. LIQUIKITS owns the model-kit customer journey.
2. KOMIPRINTS owns the 3D-print customer journey.
3. GARAGECORE owns internal operations for both.
4. DAIVEVARGAS explains and showcases the product family without commerce responsibilities.
5. SNORLAXGARAGE remains intact as the current combined app, fallback, and legacy access point.

Create the four new apps alongside SNORLAXGARAGE rather than converting SNORLAXGARAGE in place. Keep one shared backend and identity at first, add explicit domain markers, separate new baskets and checkout, and preserve legacy mixed orders in GARAGECORE and SNORLAXGARAGE. This gives the customer experiences clearer boundaries without forcing an immediate high-risk database split or risking the current application.
