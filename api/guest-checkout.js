/* global process */
import crypto from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const ACTIVE_ORDER_STATUSES = new Set(['reserved', 'validating', 'preparing', 'to ship', 'to receive', 'waiting', 'in progress']);
const MAX_GUEST_ITEMS = 12;

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const rawServiceAccount = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!rawServiceAccount) throw new Error('Guest checkout is not configured yet.');

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(rawServiceAccount);
  } catch {
    throw new Error('Guest checkout service account is invalid.');
  }
  return initializeApp({ credential: cert(serviceAccount) });
}

const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const cleanText = (value, max = 160) => String(value || '').trim().slice(0, max);

const isTerminal = (status) => ['cancelled', 'completed'].includes(String(status || '').trim().toLowerCase());

const isActive = (status) => ACTIVE_ORDER_STATUSES.has(String(status || '').trim().toLowerCase());

function requestIp(req) {
  const vercelIp = req.headers['x-vercel-forwarded-for'];
  const forwarded = req.headers['x-forwarded-for'];
  return String(vercelIp || forwarded || '').split(',')[0].trim();
}

function hashIp(ip) {
  const salt = process.env.GUEST_CHECKOUT_IP_SALT;
  if (!salt) throw new Error('Guest checkout rate limiting is not configured yet.');
  if (!ip) throw new Error('We could not verify your connection. Please try again.');
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
    throw Object.assign(new Error('This checkout route is for guest sessions only.'), { statusCode: 403 });
  }
  return decodedToken.uid;
}

async function assertNoActiveOrder(transaction, db, lockRef, staleLocks) {
  const lockSnap = await transaction.get(lockRef);
  if (!lockSnap.exists) return;
  const previousOrderId = lockSnap.data().orderDocId;
  const orderSnap = previousOrderId ? await transaction.get(db.collection('orders').doc(previousOrderId)) : null;
  if (!orderSnap?.exists || isTerminal(orderSnap.data().status)) {
    staleLocks.push(lockRef);
    return;
  }
  if (isActive(orderSnap.data().status)) {
    throw Object.assign(new Error('You already have a guest order in progress. Complete or cancel it before placing another order.'), { statusCode: 409 });
  }
  staleLocks.push(lockRef);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    const app = getAdminApp();
    const uid = await verifyCaller(req, app);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const selectedItems = Array.isArray(body.items) ? body.items : [];
    if (!selectedItems.length || selectedItems.length > MAX_GUEST_ITEMS) {
      return res.status(400).json({ error: `Choose between 1 and ${MAX_GUEST_ITEMS} on-hand kits.` });
    }

    const uniqueTargets = new Set();
    for (const item of selectedItems) {
      const kitId = cleanText(item?.kitId, 128);
      const stockKey = cleanText(item?.stockKey, 128);
      if (!kitId || !stockKey || uniqueTargets.has(`${kitId}:${stockKey}`)) {
        return res.status(400).json({ error: 'Each selected kit stock must be unique.' });
      }
      uniqueTargets.add(`${kitId}:${stockKey}`);
    }

    const ipHash = hashIp(requestIp(req));
    const db = getFirestore(app);
    const orderRef = db.collection('orders').doc();
    const userLockRef = db.collection('guestCheckoutLocks').doc(uid);
    const ipLockRef = db.collection('guestCheckoutIpLocks').doc(ipHash);
    const recoveryCode = crypto.randomBytes(9).toString('base64url').toUpperCase();
    const recoveryHash = crypto.createHash('sha256').update(recoveryCode).digest('hex');
    const orderId = `#SG-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const now = new Date();
    const expirationDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const result = await db.runTransaction(async (transaction) => {
      const staleLocks = [];
      await assertNoActiveOrder(transaction, db, userLockRef, staleLocks);
      await assertNoActiveOrder(transaction, db, ipLockRef, staleLocks);

      const shelfSnap = await transaction.get(db.collection('shelf'));
      const shelfTargets = new Set(shelfSnap.docs.map((entry) => `${entry.get('id') || ''}:${entry.get('stockKey') || entry.get('selectedStockKey') || ''}`));
      const kitRefs = selectedItems.map((item) => db.collection('kits').doc(cleanText(item.kitId, 128)));
      const kitSnaps = await Promise.all(kitRefs.map((ref) => transaction.get(ref)));
      const resolvedItems = [];
      const kitUpdates = [];

      for (let index = 0; index < selectedItems.length; index += 1) {
        const requested = selectedItems[index];
        const kitSnap = kitSnaps[index];
        const kitId = cleanText(requested.kitId, 128);
        const stockKey = cleanText(requested.stockKey, 128);
        if (!kitSnap.exists) throw Object.assign(new Error('A selected kit is no longer available.'), { statusCode: 409 });
        if (shelfTargets.has(`${kitId}:${stockKey}`)) throw Object.assign(new Error('Collection stock cannot be checked out as a guest.'), { statusCode: 409 });

        const kit = kitSnap.data();
        const stock = kit.stocks?.[stockKey];
        if (!stock || String(stock.status || '').toUpperCase() !== 'ONHAND' || stock.isReserved || stock.order?.orderId) {
          throw Object.assign(new Error(`${kit.name || 'A selected kit'} is no longer available.`), { statusCode: 409 });
        }

        const sellPrice = safeNumber(stock.sellPrice);
        resolvedItems.push({
          id: kitId,
          name: [kit.brand, kit.specs?.line, kit.name].filter(Boolean).join(' '),
          price: sellPrice,
          sellPrice,
          quantity: 1,
          image: kit.image || null,
          images: Array.isArray(kit.images) ? kit.images : null,
          stockKey,
          type: 'kit',
          appliedHandlingFee: 0,
          appliedInstallmentFee: safeNumber(requested.appliedInstallmentFee),
          appliedTransferFee: 0,
          isFreeShippingEligible: Boolean(stock.freeShippingUntil && new Date(stock.freeShippingUntil).getTime() > Date.now()),
          freeShippingUntil: cleanText(stock.freeShippingUntil, 64),
          freeShippingMethod: cleanText(stock.freeShippingMethod || 'All', 80),
          freeShippingSuboption: cleanText(stock.freeShippingSuboption || 'All', 80)
        });
        kitUpdates.push({ ref: kitRefs[index], kit, stockKey });
      }

      const handlingFee = safeNumber(body.handlingFee);
      const transferFee = safeNumber(body.transferFee);
      const installmentFee = resolvedItems.reduce((sum, item) => sum + item.appliedInstallmentFee, 0);
      const requestedDiscount = safeNumber(body.discount);
      const discount = Math.min(requestedDiscount, handlingFee + transferFee + installmentFee);
      const subtotal = resolvedItems.reduce((sum, item) => sum + item.price + item.appliedInstallmentFee, 0) + handlingFee + transferFee;
      const totalPrice = Math.max(0, subtotal - discount);
      const paymentPlan = ['full', 'partial', 'reservation'].includes(body.paymentPlan) ? body.paymentPlan : 'full';
      const paymentDueNow = paymentPlan === 'full' ? totalPrice : Math.min(totalPrice, safeNumber(body.paymentDueNow));
      if (paymentPlan !== 'full' && paymentDueNow <= 0) {
        throw Object.assign(new Error('Enter a valid downpayment to continue.'), { statusCode: 400 });
      }

      for (const lockRef of staleLocks) transaction.delete(lockRef);
      for (const update of kitUpdates) {
        const nextStocks = {
          ...update.kit.stocks,
          [update.stockKey]: {
            ...update.kit.stocks[update.stockKey],
            isReserved: true,
            reservedBy: uid,
            reservedAt: now.toISOString(),
            order: { orderId, orderDocId: orderRef.id, isGuestOrder: true }
          }
        };
        const hasAvailableStock = Object.values(nextStocks).some((stock) => !stock?.isReserved && !stock?.order?.orderId);
        transaction.update(update.ref, { stocks: nextStocks, hasAvailableStock });
      }

      const receiver = body.receiverDetails && typeof body.receiverDetails === 'object' ? body.receiverDetails : {};
      const shippingMethod = cleanText(body.shippingMethod, 120);
      if (!shippingMethod) throw Object.assign(new Error('Choose a shipping method to continue.'), { statusCode: 400 });
      const orderData = {
        orderId,
        userId: uid,
        buyerName: 'Guest checkout',
        buyerRole: 'guest',
        isGuestOrder: true,
        isMaintenanceOrder: false,
        items: resolvedItems,
        status: 'Reserved',
        isPreOrder: false,
        hasProjects: false,
        shippingMethodKey: shippingMethod,
        shippingSuboptionKey: cleanText(body.shippingSuboptionKey, 120) || null,
        shippingMethod: cleanText(body.shippingMethodLabel, 180) || shippingMethod,
        meetupLocation: cleanText(body.meetupLocation, 160) || null,
        pickupLocation: cleanText(body.pickupLocation, 160) || null,
        preferredSchedule: cleanText(body.preferredSchedule, 80) || null,
        receiverDetails: {
          receiverName: cleanText(receiver.receiverName, 120),
          email: cleanText(receiver.email, 180) || null,
          phoneNumber: cleanText(receiver.phoneNumber, 32),
          landmark: cleanText(receiver.landmark, 180) || null,
          houseNo: cleanText(receiver.houseNo, 80) || null,
          houseDetails: cleanText(receiver.houseDetails, 180) || null,
          subdivision: cleanText(receiver.subdivision, 180) || null,
          barangay: cleanText(receiver.barangay, 120),
          city: cleanText(receiver.city, 120),
          province: cleanText(receiver.province, 120),
          zipCode: cleanText(receiver.zipCode, 20),
          lat: Number.isFinite(Number(receiver.lat)) ? Number(receiver.lat) : null,
          lng: Number.isFinite(Number(receiver.lng)) ? Number(receiver.lng) : null,
          lbcBranch: cleanText(body.lbcBranch, 180) || null
        },
        paymentPlan,
        paymentMethod: cleanText(body.paymentMethod, 80) || 'Cash',
        totalPrice,
        subtotal,
        buyerPaid: 0,
        paymentDueNow,
        originalPaymentDueNow: paymentDueNow,
        minDownpayment: safeNumber(body.minDownpayment),
        balanceDueDeadline: null,
        handlingFee,
        installmentFee,
        transferFee,
        discount,
        discountBreakdown: body.discountBreakdown && typeof body.discountBreakdown === 'object' ? body.discountBreakdown : {},
        date: now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        createdAt: now.toISOString(),
        expiresAt: expirationDate.toISOString()
      };

      transaction.create(orderRef, orderData);
      const lockData = { orderDocId: orderRef.id, orderId, updatedAt: FieldValue.serverTimestamp() };
      transaction.set(userLockRef, lockData);
      transaction.set(ipLockRef, lockData);
      transaction.create(db.collection('guestOrderRecovery').doc(recoveryHash), {
        orderDocId: orderRef.id,
        uid,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: expirationDate.toISOString()
      });
      return { orderDocId: orderRef.id, totalPrice };
    });

    return res.status(201).json({ ...result, orderId, recoveryCode });
  } catch (error) {
    console.error('Guest checkout failed:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Unable to create your guest order.' });
  }
}
