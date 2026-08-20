# 🔒 Authentication & Authorization

Snorlax Garage implements a secure, role-based access system to distinguish between general users and administrative accounts.

---

## 🔑 1. Firebase Authentication Flow
User authentication is managed via **Firebase Authentication**:
- **Providers:** Google and Facebook popup authentication.
- **Login Triggers:** Available from the navbar/profile flow, account settings, and Google login in checkout.
- **Session Restoration:** `fetchInitialData()` registers `auth.onAuthStateChanged(...)` and delegates profile, role, basket, and project synchronization to the Zustand store.
- **Interrupted Popup Recovery:** If a popup is closed or blocked, the authentication overlay remains available with **Retry Login** and **Cancel** actions. Retry starts a fresh provider attempt; cancel invalidates the current attempt so a late popup result cannot continue the app-side login flow.

---

## 🛡️ 2. Dynamic Admin Whitelist Verification
To protect proprietary calculation logic and admin controls (such as editing rates and updating kit stocks), Snorlax Garage queries a dynamic whitelist in Firestore.

### 📋 Whitelist Architecture
- Admin users must have their Firebase **UID** explicitly present in the `admins` collection in Firestore:
  ```
  Firestore
  └── admins (collection)
      └── [User_Firebase_UID] (document)
          ├── name: "Admin Name"
          └── role: "admin"
  ```

### ⚙️ Verification Logic (`useStore.js`)
State verification is handled by the `checkAdminStatus(uid)` action in the Zustand global store:
1. When auth state changes, the application retrieves the user's `uid`.
2. A query checks the existence of `doc(db, "admins", uid)`.
3. If the document exists, `isAdmin` is set to `true`.
4. The admin status governs two separate store states:
   - `isAdmin`: True if user is verified as an administrator.
   - `isAdminView`: A toggle-able state enabling administrators to switch between customer preview and admin control layouts.

---

## 🚧 3. Routing Guards & Wrappers
In [App.jsx](file:///c:/Users/daive/Desktop/react-app/snorlaxgarage-type-f/src/App.jsx), the `AdminRouteWrapper` component protects admin-only routes:

```jsx
const AdminRouteWrapper = ({ children }) => {
  const { isAdmin } = useStore();
  if (!isAdmin) {
    return <Navigate to="/basket" replace />;
  }
  return children;
};
```

Protected routes:
- `/shelf` (Admin-only basket/shelf inspection)
- `/users-dashboard` (Admin-only list of registered users and admins)

Admin-only controls also appear conditionally in shared surfaces such as the navbar, Orders, Kits, Operations, Deal Architect, Supplier Balances, Master List, and Sales Dashboard. The route may be public, but the control must still be gated by the live `isAdmin` state.

The public/customer view and administrator view can coexist in the same authenticated session. `isAdminView` changes which operational data and controls are displayed; it does not grant administrator status by itself.

---

## 👁️ 4. Conditional Feature Rendering
Multiple components render options conditionally based on the user's role:
- **Project Rates & Breakdown:** The `Rates` editing tab in `ProjectCost` and the detailed line-item costing in `CostBreakdown` are rendered only if `isAdmin` is true.
- **Admin Indicators:** A floating viewport screen-size indicator (e.g. `XL`, `LG`, `MD`, `MOBILE`) is rendered at the bottom left of the window when `isAdmin` is true to assist in debugging layouts.
- **Calculation Mandate:** To ensure the correct computation of checkout values, `ProjectCost.jsx` always runs the `CostBreakdown` engine under the hood for all users, but wraps it in a `<div className="hidden">` element if the user is a non-admin. This calculates totals without exposing proprietary rates.

The same principle applies to business data elsewhere: conditional rendering improves the interface, but Firestore rules must still enforce the actual authorization boundary.

---

## 5. Current authorization review items

The repository audit found two rules that need explicit security review before the system is described as fully locked down:

- The `kits` collection currently permits writes for signed-in non-anonymous users. The intended policy is expected to be admin-controlled for catalog and stock maintenance, so the rule should be tightened or the migration path clearly isolated.
- The `shelf` collection is publicly readable. Review whether shelf stock, accepted offers, or operational assignments contain information that should be limited to administrators or the owning user.

These are implementation findings, not claims that the UI is intentionally public. The KOS should retain them as open hardening items until the deployed rules are verified.

---

## 🔐 5. Firebase Credential Handling

The React/Vite client uses only the Firebase browser SDK and its public web-client configuration in `src/firebase/firebase.js`. Browser configuration identifies the Firebase project but does not grant administrative access by itself.

Firebase Admin SDK credentials follow stricter rules:

- Admin service-account JSON files must never be stored in the repository, `src`, `public`, build output, or Obsidian notes.
- Admin credentials must never be assigned to a `VITE_` environment variable because Vite exposes those values to browser bundles.
- A replacement Admin credential is required only by a trusted backend or maintenance script that uses `firebase-admin`.
- Backend credentials must be stored outside the project or in the deployment provider's encrypted secret manager.
- Service accounts must receive only the minimum IAM permissions needed by their backend workload.
- `.gitignore` blocks `firebase-adminsdk-*.json` and the previously used Admin credential filename as defense in depth.

### Credential Incident Resolution — August 11, 2026

A Firebase Admin SDK credential was discovered in historical commits reachable from GitHub. The remediation was completed in this order:

1. The exposed Google Cloud service-account key was deleted and therefore revoked.
2. A replacement key was created outside the repository for backend-only use.
3. `git-filter-repo` removed the Admin JSON from every reachable commit on `main`.
4. The rewritten `main` branch was force-pushed with lease protection.
5. Development resumed from a fresh clone instead of the clone containing the old Git objects.
6. The fresh clone and all reachable history were rescanned for private keys, provider tokens, JWTs, embedded credentials, and hardcoded secrets.

Final audit result: the local `main` branch matches `origin/main`; no Admin credential file, private-key marker, or high-confidence secret remains in the current tree or reachable history. The Firebase web API key remains in client configuration by design.

### Pre-Push Security Checklist

- Review `git status --short` and staged file names before pushing.
- Never force-add a file ignored as a credential.
- Keep generated keys outside all Git working directories and documentation vaults.
- Rotate a credential immediately if it is committed; deleting the file in a later commit is insufficient.
- Rewrite affected history only after revoking the credential, then require fresh clones so old history is not reintroduced.
- Keep GitHub secret scanning and push protection enabled when available.
