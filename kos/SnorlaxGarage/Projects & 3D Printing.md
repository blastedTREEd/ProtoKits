# Projects & 3D Printing

SnorlaxGarage treats a 3D-printing request as a project that can be estimated, saved, scheduled, and purchased alongside physical kits.

## 1. Project lifecycle

1. Choose STL estimation or 3MF plate-ready analysis.
2. Prepare or import the project file and provide a meaningful project name.
3. Configure printer, material, quality, color changes, extras, and available design/assembly services.
4. Review the public price, downpayment, timeline, and checklist.
5. Save the project to Project Vault or add it to the basket.
6. Select fulfillment and payment during checkout.
7. After payment validation, the project enters the production queue and follows its order progress.

## 2. Project validation

The project name must be changed from the generated default such as `Project #` or an unnamed value before the project can be treated as a properly identified saved/basket project.

Google Drive validation applies to file-link fields that require a source file. The link must point to Google Drive. STL projects with a selected design service can follow the service-specific exception where the customer is not yet required to provide the final model link.

License acknowledgement is required when the current project path marks it applicable. These checks are repeated at the Project Card/basket boundary so an incomplete project cannot silently reach checkout.

## 3. STL and 3MF paths

### STL

STL is an estimate path. The calculator uses dimensions, quantity, printer settings, material assumptions, quality, supports, and configured service options to estimate time and cost.

### 3MF

3MF is the plate-ready path. The imported sliced data supplies more precise print time, filament weight, plate information, and color-swap data. The calculator still applies the configured labor, electricity, maintenance, markup, and service rates.

## 4. Project Vault and limits

Signed-in users can save reusable projects under `projectVaults/{uid}`. Guests use browser-local temporary storage. The non-admin project limit is based on the current base allowance plus completed project orders; administrators bypass that limit for operational work.

Project Vault records can be renamed, updated, added to basket, or deleted. A project added to a basket retains the project metadata needed to reconstruct its estimate and production requirements during checkout.

## 5. Production scheduling

`GarageCalendar` calculates a project timeline from estimated print time, daily production capacity, service-added days, active project orders, configured unavailable dates, and recurring unavailable weekdays.

The admin Garage Calendar shows active scheduled projects and allows printing or shipping availability to be changed. When an unavailable date affects queued work, the schedule moves the affected work toward the next available production day according to the calendar logic.

Project orders store production progress and can move through queue/preparation, design finalization, printing, pickup/ship readiness, and completion states. Mixed kit/project orders retain one order record while project progress is tracked separately from physical kit reservation.

## 6. Cost visibility

Customers receive the calculated public price, downpayment, timeline, and checklist. Administrators can inspect the production plan, detailed cost breakdown, and editable rate settings. Raw rates and margin information are intentionally not exposed in the normal customer interface.
