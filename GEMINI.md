# Snorlax Garage - Project Guidelines

## Project Overview
Snorlax Garage is a React-based hub for 3D printing enthusiasts. It features project cost calculators, inventory management (filaments, printers, kits), and an interactive UI powered by Tailwind CSS and Framer Motion.

## Tech Stack
- **Frontend:** React 19 (Vite), React Router 7
- **Styling:** Tailwind CSS, Framer Motion, Lucide Icons
- **State:** Zustand (`src/store/useStore.js`)
- **Backend:** Firebase (Auth, Firestore)

## Authentication & Authorization
- **Login:** Facebook Authentication via Firebase.
- **Admin Verification:** Dynamic system using Firestore.
- **Whitelist:** Admins must have their Firebase UID added to the `admins` collection in Firestore.
- **Implementation:** 
  - `src/store/useStore.js` manages the `isAdmin` state and the `checkAdminStatus(uid)` action.
  - `src/pages/Landing.jsx` triggers the verification on login/auth-state change.
  - Admin-only features (Rates, Detailed Breakdown, Detailed Stats) are conditionally rendered based on `isAdmin`.
- **Calculation Logic:** `ProjectCost.jsx` always executes `CostBreakdown` for all users to ensure Grand Totals are calculated, but hides the detailed UI from non-admins.

## Project Structure
- `src/components/calculator/`: Key business logic for 3D print estimation.
- `src/store/useStore.js`: Central state for real-time Firebase sync (Printers, Filaments, Rates, Admin Status).
- `src/firebase/`: Configuration and auth providers.

## Development Mandates
- **Branding:** Maintain the "SnorlaxGarage" branding (Blue/Black theme, bold uppercase italic typography).
- **Code Style:** Functional components with Hooks, Zustand for global state.
- **Language:** Maintain the Tagalog comments and notes in the code as they are helpful for the developer.
- **Sync:** Ensure all cost calculations are synchronized with the `rates` collection in Firestore.

## Local Development
- `npm run dev`: Starts the Vite dev server.
