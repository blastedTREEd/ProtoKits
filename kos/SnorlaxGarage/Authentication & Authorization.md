# 🔒 Authentication & Authorization

Snorlax Garage implements a secure, role-based access system to distinguish between general users and administrative accounts.

---

## 🔑 1. Facebook Authentication Flow
User authentication is managed via **Firebase Authentication**:
- **Provider:** Facebook Authentication.
- **Login Trigger:** Initiated on the `Landing.jsx` page.
- **Session Restoration:** Managed asynchronously on application startup by checking `auth.onAuthStateChanged(...)` in `App.jsx`.

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

---

## 👁️ 4. Conditional Feature Rendering
Multiple components render options conditionally based on the user's role:
- **Project Rates & Breakdown:** The `Rates` editing tab in `ProjectCost` and the detailed line-item costing in `CostBreakdown` are rendered only if `isAdmin` is true.
- **Admin Indicators:** A floating viewport screen-size indicator (e.g. `XL`, `LG`, `MD`, `MOBILE`) is rendered at the bottom left of the window when `isAdmin` is true to assist in debugging layouts.
- **Calculation Mandate:** To ensure the correct computation of checkout values, `ProjectCost.jsx` always runs the `CostBreakdown` engine under the hood for all users, but wraps it in a `<div className="hidden">` element if the user is a non-admin. This calculates totals without exposing proprietary rates.
