# Firestore rules audit

The two market apps share the `snorlaxgarage` Standard Firestore database and the same rules file.

## Findings addressed

- User profile writes now preserve the document UID and existing role for non-admin users.
- User profile deletion is admin-only.
- Project vault writes require the matching UID and cap the saved-items list at 100 entries.
- Hunt creation and owner updates now validate ownership, status, kit ID size, expiry string size, and target price range.
- Client persistence is explicitly bounded at 40 MB while retaining multi-tab synchronization.

## Known architectural follow-up

The `kits` collection still permits authenticated non-anonymous clients to update reservation fields because checkout currently performs client-side reservation transactions. This remains a high-risk boundary: replacing it with admin-only writes would break checkout. The correct hardening path is to move reservation/release mutations behind a trusted server or callable function, then narrow the `kits` rule to admin catalog writes plus server-mediated reservations.

## Attack checks

- Profile role self-escalation: blocked for non-admin create/update.
- Profile UID reassignment: blocked for non-admin create/update.
- Profile deletion by the owner: blocked.
- Vault reassignment to another UID: blocked.
- Vault list exhaustion above 100 items: blocked.
- Hunt creation for another UID: blocked.
- Hunt negative or excessive target price: blocked.
- Public catalog/story reads: intentionally retained for storefront operation.
- Arbitrary authenticated kit mutation: still requires the server-side reservation migration described above.

