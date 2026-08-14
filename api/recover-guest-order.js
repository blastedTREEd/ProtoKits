/* global process */
import crypto from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const isTerminal = (status) => ['cancelled', 'completed'].includes(String(status || '').trim().toLowerCase());

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const rawServiceAccount = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!rawServiceAccount) throw new Error('Guest order recovery is not configured yet.');
  return initializeApp({ credential: cert(JSON.parse(rawServiceAccount)) });
}

function requestIp(req) {
  return String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
}

function hashIp(ip) {
  const salt = process.env.GUEST_CHECKOUT_IP_SALT;
  if (!salt || !ip) throw new Error('We could not verify your connection. Please try again.');
  return crypto.createHmac('sha256', salt).update(ip).digest('hex');
}

async function verifyCaller(req, app) {
  const idToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const appCheckToken = String(req.headers['x-firebase-appcheck'] || '');
  if (!idToken || !appCheckToken) throw Object.assign(new Error('Secure guest session is required.'), { statusCode: 401 });
  const [decodedToken] = await Promise.all([
    getAuth(app).verifyIdToken(idToken),
    getAppCheck(app).verifyToken(appCheckToken)
  ]);
  if (decodedToken.firebase?.sign_in_provider !== 'anonymous') {
    throw Object.assign(new Error('Use a guest session to recover a guest order.'), { statusCode: 403 });
  }
  return decodedToken.uid;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const recoveryCode = String(req.body?.recoveryCode || '').trim().toUpperCase();
    if (recoveryCode.length < 10 || recoveryCode.length > 64) {
      return res.status(400).json({ error: 'Enter a valid guest order code.' });
    }

    const app = getAdminApp();
    const uid = await verifyCaller(req, app);
    const db = getFirestore(app);
    const ipHash = hashIp(requestIp(req));
    const recoveryRef = db.collection('guestOrderRecovery').doc(crypto.createHash('sha256').update(recoveryCode).digest('hex'));
    const currentUserLockRef = db.collection('guestCheckoutLocks').doc(uid);
    const currentIpLockRef = db.collection('guestCheckoutIpLocks').doc(ipHash);
    const nextRecoveryCode = crypto.randomBytes(9).toString('base64url').toUpperCase();
    const nextRecoveryRef = db.collection('guestOrderRecovery').doc(crypto.createHash('sha256').update(nextRecoveryCode).digest('hex'));

    const result = await db.runTransaction(async (transaction) => {
      const recoverySnap = await transaction.get(recoveryRef);
      if (!recoverySnap.exists) throw Object.assign(new Error('That guest order code is invalid or has expired.'), { statusCode: 404 });
      const recovery = recoverySnap.data();
      if (new Date(recovery.expiresAt).getTime() <= Date.now()) throw Object.assign(new Error('That guest order code has expired.'), { statusCode: 410 });

      const orderRef = db.collection('orders').doc(recovery.orderDocId);
      const [orderSnap, currentUserLockSnap, currentIpLockSnap] = await Promise.all([
        transaction.get(orderRef), transaction.get(currentUserLockRef), transaction.get(currentIpLockRef)
      ]);
      if (!orderSnap.exists || isTerminal(orderSnap.data().status)) {
        throw Object.assign(new Error('This guest order is no longer active.'), { statusCode: 409 });
      }
      const conflicts = [currentUserLockSnap, currentIpLockSnap].some((snap) => snap.exists && snap.data().orderDocId !== orderRef.id);
      if (conflicts) throw Object.assign(new Error('This device already has a guest order in progress.'), { statusCode: 409 });

      const oldUserLockRef = db.collection('guestCheckoutLocks').doc(String(recovery.uid || ''));
      const oldUserLockSnap = recovery.uid ? await transaction.get(oldUserLockRef) : null;
      if (oldUserLockSnap?.exists && oldUserLockSnap.data().orderDocId === orderRef.id) transaction.delete(oldUserLockRef);

      const lockData = { orderDocId: orderRef.id, orderId: orderSnap.data().orderId, updatedAt: FieldValue.serverTimestamp() };
      transaction.update(orderRef, { userId: uid, lastUpdated: new Date().toISOString() });
      transaction.set(currentUserLockRef, lockData);
      transaction.set(currentIpLockRef, lockData);
      transaction.delete(recoveryRef);
      transaction.create(nextRecoveryRef, {
        orderDocId: orderRef.id,
        uid,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: recovery.expiresAt
      });
      return { orderDocId: orderRef.id, orderId: orderSnap.data().orderId };
    });

    return res.status(200).json({ ...result, recoveryCode: nextRecoveryCode });
  } catch (error) {
    console.error('Guest order recovery failed:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Unable to recover that guest order.' });
  }
}
