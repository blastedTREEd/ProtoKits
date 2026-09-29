# 🧮 Cost Estimation Engine

The **Cost Estimation Engine** is the core pricing calculator of Snorlax Garage, responsible for translating 3D model properties, materials, and configurations into real-world costs.

---

## 🎛️ 1. Print Methods
The engine supports two primary ways to estimate print costs, defined in `DEFAULT_PRINT_METHODS`:

### 🔲 A. STL (Estimate)
- **ID:** `stl`
- **Focus:** Quick estimation.
- **Workflow:** Estimates cost from approximate model dimensions, material, quality settings, and quantity.
- **swapMins Estimation:** Uses the number of custom colors and the physical height of the model (normalized to mm) to estimate layer-by-layer filament changes:
  $$\text{Swaps} = \text{Layers} \times (\text{Colors} - 1)$$
  $$\text{Swap Time} = \text{Swaps} \times \text{Printer Swap Penalty}$$

### 📁 B. 3MF (Plate-ready)
- **ID:** `3mf`
- **Focus:** Maximum accuracy.
- **Workflow:** Imports actual sliced plate-ready file values (precise print time, precise filament weight, and exact color swap counts).

### C. Selective plate/model costing
- Both STL models and 3MF build plates have an explicit `included` state.
- Legacy records without `included` remain included for backward compatibility.
- Tapping the currently selected plate/model toggles that item off or on without deleting its data.
- Included items are displayed in blue, while excluded items are displayed in gray.
- An excluded item is omitted from material, labor, electricity, maintenance, print scheduling, and assigned-extra calculations.
- Extras assigned to an excluded plate/model are also excluded from the project estimate.

---

## ⚙️ 2. Rate Sections & Parameters
Calculations are based on 6 modular rate profiles stored in the `rates` collection:

1. **Filament Rate (`material-cost`)**
   - *Client Share Rate (%):* Percent of spool excess material charged to the client.
   - *Spool Size (g):* Standard spool size (default 1000g).
2. **Labor Rate (`labor-cost`)**
   - *Labor Rate (₱/hr):* Technician active labor cost.
   - *Daily Print Limit (hr):* Target printing hours per day before shifting tasks.
   - *Prep Per File (min):* File preparation time.
   - *Swap Penalty (min):* Time added per color swap events.
   - *Support Removal (min):* Supports clean-up time.
   - *Filament Change (₱/event) & Hardware Install (₱/pc):* Handling surcharges.
3. **Extras Rate (`extra-cost`)**
   - *Client Share (%):* Material excess sharing percent for extra parts.
   - *Magnet & Heatset Placement & Setup (min):* Timing coefficients for assembly tasks.
4. **Electricity Rate (`electricity-cost`)**
   - *Electricity Rate (₱/kWh) & Expected Increase (%):* Base local energy rates.
   - *Iron Power (W):* Soldering iron power consumption.
5. **Maintenance Rate (`maintenance-cost`)**
   - *Printer Wear (₱/hr):* Wear and tear cost of printers per hour.
   - *Iron Tip Wear (₱/hr) & Estimation Fixed Cost (₱):* Consumable costs.
6. **Print Markup (`print-cost`)**
   - *Markup Rate (%):* Profit multiplier.
   - *Reprint Rate (%):* Buffer fee for printing failure risks.

---

## 📐 3. Formula Breakdown
The pricing calculation inside [CostBreakdown.jsx](file:///c:/Users/daive/Desktop/react-app/snorlaxgarage-type-f/src/components/calculator/CostBreakdown.jsx) computes the following details:

### 🧵 A. Material (Filament) Cost
- Finds filament inventory matches.
- If inventory is insufficient (shortfall), it calculates the number of new spools needed:
  $$\text{Shortfall} = \text{Required Weight} - \text{Remaining Stock}$$
  $$\text{New Spools} = \lceil \text{Shortfall} / \text{Spool Weight} \rceil$$
- Computes excess material and applies the client share charge:
  $$\text{Excess Weight} = (\text{New Spools} \times \text{Spool Weight}) - \text{Shortfall}$$
  $$\text{Excess Charge} = \text{Excess Weight} \times \text{Price/gram} \times \text{Client Share}$$
  $$\text{Final Material Cost} = (\text{Usage Cost} \times \text{Markup}) + \text{Excess Charge}$$

### 🛠️ B. Labor Cost
- Combines file setup, support removal, printing startup time, filament changes, and hardware installation.
- Computes swap times if multicolor CFS (Chameleon Feeder System) is utilized.

### ⚡ C. Electricity Cost
- Computes active printer usage and soldering iron heating periods against localized KWh rates:
  $$\text{Electricity Cost} = \text{Print Time} \times \text{Printer Power} \times \text{Rate} + \text{Iron Time} \times \text{Iron Power} \times \text{Rate}$$

### 🔧 D. Maintenance Cost
- Multiplies print duration and hardware installation cycles by machine wear rates.

---

## 👤 4. UI Conditonal Access & Safeguards
- **For Non-Admins:**
  - Standard users see **Lowest Price (Base Price)**, **Downpayment**, **Days Timeline**, and **Checklist** (Build Plates, Magnets, Heatsets).
  - To secure billing integrity, `CostBreakdown.jsx` is executed in a `<div className="hidden">` layout. This ensures state variables sync to Zustand and downpayment calculations complete, but protects raw rates and margins from public exposure.
- **For Admins:**
  - Shows 3 specialized calculation tabs:
    1. **Plan:** Lists the step-by-step printing schedule timeline (`ProductionPlan.jsx`).
    2. **Cost:** Detailed interactive pricing components breakdown.
    3. **Rates:** Settings editing panel for tweaking parameters directly in Firestore.
