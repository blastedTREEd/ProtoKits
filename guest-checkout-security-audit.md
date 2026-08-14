# Guest checkout security audit

Date: 2026-08-14

## Scope

The guest checkout flow creates an anonymous Firebase Auth session only when a visitor submits checkout. The browser calls `/api/guest-checkout` with both a Firebase ID token and Firebase App Check token. The Vercel function uses the Firebase Admin SDK to validate both tokens and atomically:

- validates each requested stock is a unique, individual `ONHAND` kit stock;
- rejects reserved, ordered, and admin-shelf/collection stocks;
- reserves selected stocks and creates the order in one Firestore transaction;
- allows one active order per anonymous UID and per HMAC-hashed source IP;
- stores a hashed recovery-code lookup and returns the raw code only to the checkout browser.

## Relevant collection access

| Path | Browser access | Guest checkout service access |
| --- | --- | --- |
| `kits/{kitId}` | Public read; anonymous writes denied | Admin SDK transaction updates selected stocks |
| `orders/{orderId}` | Owners/admin can read; anonymous creates denied | Admin SDK creates guest order |
| `guestCheckoutLocks/{uid}` | Denied by default | Admin SDK only |
| `guestCheckoutIpLocks/{hash}` | Denied by default | Admin SDK only |
| `guestOrderRecovery/{hash}` | Denied by default | Admin SDK only |

## Existing rules outside this change

`kits` still permits any non-anonymous signed-in user to write. That is an existing broad rule needed by the current client-side normal checkout/admin paths; it should be replaced after those normal stock mutations are moved to trusted server endpoints. This change narrows the new anonymous path without claiming to fully harden the existing authenticated checkout model.

## Required deployment settings

The Vercel function requires `FIREBASE_ADMIN_SERVICE_ACCOUNT` (a service account JSON object) and `GUEST_CHECKOUT_IP_SALT` (a long random value). They must be stored in Vercel only, never in a Vite `VITE_*` variable or git.
