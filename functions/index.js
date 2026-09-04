const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();
const db = admin.firestore();

const SMTP_HOST = defineSecret('SMTP_HOST');
const SMTP_PORT = defineSecret('SMTP_PORT');
const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASSWORD = defineSecret('SMTP_PASSWORD');
const EMAIL_FROM = defineSecret('EMAIL_FROM');
const ADMIN_NOTIFICATION_EMAIL = defineSecret('ADMIN_NOTIFICATION_EMAIL');
const APP_BASE_URL = defineSecret('APP_BASE_URL');

const ACCOUNT_INACTIVITY_DAYS = 30;
const ACCOUNT_DELETION_GRACE_DAYS = 30;
const ACCOUNT_DELETION_TOTAL_DAYS = ACCOUNT_INACTIVITY_DAYS + ACCOUNT_DELETION_GRACE_DAYS;
const DAY_MS = 24 * 60 * 60 * 1000;

const FUNCTION_OPTIONS = {
  document: 'orders/{orderId}',
  region: 'asia-southeast1',
  secrets: [
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASSWORD,
    EMAIL_FROM,
    ADMIN_NOTIFICATION_EMAIL,
    APP_BASE_URL
  ]
};

const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const money = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `₱${amount.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`
    : 'Not specified';
};

const orderLabel = (orderId, order) => order.orderId || orderId;

const receiptKind = (order) => hasValue(order.balanceReceipt) ? 'balance' : 'initial';

const changedToNonEmpty = (before, after) => hasValue(after) && String(before || '') !== String(after);

const timestampKey = (value) => {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  return String(value || 'unknown');
};

const appBaseUrl = () => String(APP_BASE_URL.value() || '').replace(/\/$/, '');

const orderUrl = (orderId) => {
  const baseUrl = appBaseUrl();
  return baseUrl ? `${baseUrl}/orders/${encodeURIComponent(orderId)}` : '';
};

const buildOrderSummary = (orderId, order) => {
  const label = orderLabel(orderId, order);
  const customer = order.buyerName || order.receiverDetails?.receiverName || 'Customer';
  const email = order.receiverDetails?.email || order.email || 'Not available';
  const paymentMethod = order.paymentMethod || 'Not specified';
  const link = orderUrl(orderId);

  return {
    label,
    customer,
    email,
    paymentMethod,
    link,
    amount: money(order.buyerPaid),
    total: money(order.totalPrice || order.price),
    status: order.status || 'Unknown'
  };
};

const createTransporter = () => nodemailer.createTransport({
  host: SMTP_HOST.value(),
  port: Number(SMTP_PORT.value() || 587),
  secure: String(SMTP_PORT.value() || '587') === '465',
  auth: {
    user: SMTP_USER.value(),
    pass: SMTP_PASSWORD.value()
  }
});

const claimEmail = async (eventKey, type, orderId) => {
  const eventRef = db.collection('emailEvents').doc(eventKey);
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(eventRef);
    if (existing.exists) return false;

    transaction.create(eventRef, {
      type,
      orderId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return true;
  });
};

const markEmailSent = (eventKey, messageId) => db.collection('emailEvents').doc(eventKey).update({
  sentAt: admin.firestore.FieldValue.serverTimestamp(),
  messageId: messageId || null
});

const sendEmail = async ({ eventKey, type, orderId, to, subject, text, html }) => {
  if (!hasValue(to)) {
    logger.warn('Skipping email because no recipient was available', { eventKey, type, orderId });
    return;
  }

  const claimed = await claimEmail(eventKey, type, orderId);
  if (!claimed) {
    logger.info('Skipping duplicate email event', { eventKey, type, orderId });
    return;
  }

  try {
    const result = await createTransporter().sendMail({
      from: EMAIL_FROM.value(),
      to,
      subject,
      text,
      html
    });
    await markEmailSent(eventKey, result.messageId);
    logger.info('Email sent', { eventKey, type, orderId, messageId: result.messageId });
  } catch (error) {
    logger.error('Email delivery failed', { eventKey, type, orderId, error: error.message });
    await db.collection('emailEvents').doc(eventKey).delete().catch((cleanupError) => {
      logger.error('Failed to release email event claim', {
        eventKey,
        type,
        orderId,
        error: cleanupError.message
      });
    });
    throw error;
  }
};

const toMillis = (value) => {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (value && Number.isFinite(Number(value.seconds))) return Number(value.seconds) * 1000;
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeKitIds = (ids = []) => [...new Set(
  (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean)
)];

const getMutuallyExclusivePairGroups = (deal = {}) => {
  if (!Array.isArray(deal.kitIds) || deal.kitIds.length < 2) return [];

  const configuredPairs = (deal.mutuallyExclusivePairs || [])
    .filter((pair) => pair?.bandaiId && pair?.bootlegId);
  const bandaiKitIds = normalizeKitIds(
    deal.mutuallyExclusiveGroups?.bandai || deal.bandaiKitIds || []
  );
  const bootlegKitIds = normalizeKitIds(
    deal.mutuallyExclusiveGroups?.bootleg || deal.bootlegKitIds || []
  );
  const dealKitIds = normalizeKitIds(deal.kitIds);

  return configuredPairs.length > 0
    ? configuredPairs.map((pair) => [
      normalizeKitIds([pair.bandaiId]),
      normalizeKitIds([pair.bootlegId])
    ])
    : [bandaiKitIds.length > 0 && bootlegKitIds.length > 0
      ? [bandaiKitIds, bootlegKitIds]
      : [dealKitIds.slice(0, 1), dealKitIds.slice(1, 2)]];
};

const isActiveMutuallyExclusiveDeal = (deal = {}) => {
  if (!deal.isActive || deal.type !== 'mutually_exclusive') return false;
  const now = Date.now();
  const validFrom = toMillis(deal.validFrom);
  const validUntil = toMillis(deal.validUntil);
  return !(validFrom > 0 && validFrom > now)
    && !(validUntil > 0 && validUntil <= now);
};

const stockHasCustomerHold = (stock = {}) => {
  const orderReference = stock.order;
  const hasOrder = typeof orderReference === 'object'
    ? Boolean(
      orderReference?.orderId
      || orderReference?.orderDocId
      || orderReference?.id
      || Object.keys(orderReference || {}).length > 0
    )
    : Boolean(orderReference);
  return hasOrder || Boolean(stock.isReserved && stock.reservationType !== 'admin');
};

const buildMutualExclusionShelfItem = (kit, stockKey, stock, dealId, fees) => ({
  id: kit.id,
  name: `${String(kit.name || '').replace(/\s*\(Pre-Order\)\s*$/i, '')} (Excluded: ${kit.name || kit.id})`,
  image: kit.image || '',
  brand: kit.brand || '',
  specs: kit.specs || {},
  price: Number(stock.sellPrice || 0) + fees.handlingFee + fees.installmentFee + fees.transferFee,
  costPrice: Number(stock.costPrice || 0),
  sellPrice: Number(stock.sellPrice || 0),
  status: stock.status || 'onhand',
  eta: stock.eta || stock.estimatedArrival || null,
  appliedHandlingFee: fees.handlingFee,
  appliedInstallmentFee: fees.installmentFee,
  appliedTransferFee: fees.transferFee,
  stockKey,
  type: 'kit',
  basketId: `b_kit_me_${dealId}_${stockKey}`,
  minDownpayment: stock.minDownpayment || 0,
  createdAt: new Date().toISOString(),
  reservedByDealId: dealId
});

// Keep the opposing side of a mutually-exclusive deal on the admin shelf as
// soon as a customer reservation is committed. This runs with Admin SDK
// privileges because customer checkout is not allowed to write /shelf.
exports.syncMutuallyExclusiveShelf = onDocumentUpdated({
  document: 'kits/{kitId}',
  region: 'asia-southeast1'
}, async (event) => {
  const triggeredKitId = String(event.params.kitId || '');
  if (!triggeredKitId || !event.data?.after?.exists) return;

  const dealsSnapshot = await db.collection('deals')
    .where('type', '==', 'mutually_exclusive')
    .get();
  const activeDeals = dealsSnapshot.docs
    .map((dealDoc) => ({ id: dealDoc.id, ...dealDoc.data() }))
    .filter(isActiveMutuallyExclusiveDeal);
  if (activeDeals.length === 0) return;

  const dealGroups = activeDeals.flatMap((deal) => (
    getMutuallyExclusivePairGroups(deal).map(([firstGroup, secondGroup]) => ({
      deal,
      firstGroup,
      secondGroup
    }))
  ));
  const relevantGroups = dealGroups.filter(({ firstGroup, secondGroup }) => (
    firstGroup.includes(triggeredKitId) || secondGroup.includes(triggeredKitId)
  ));
  if (relevantGroups.length === 0) return;

  const allKitIds = [...new Set(relevantGroups.flatMap(({ firstGroup, secondGroup }) => [
    ...firstGroup,
    ...secondGroup
  ]))];
  const checkoutSettingsSnapshot = await db.doc('settings/checkout').get();
  const paymentSettings = checkoutSettingsSnapshot.data()?.paymentSettings || {};
  const fees = {
    handlingFee: Number(paymentSettings.handlingFee || 0),
    installmentFee: Number(paymentSettings.installmentFee || 0),
    transferFee: Number(paymentSettings.transferFee || 0)
  };

  await db.runTransaction(async (transaction) => {
    // Read every participating kit before applying any shelf or inventory
    // write. If a competing checkout changes one of these kits meanwhile,
    // Firestore retries this transaction using the latest state.
    const kitStates = new Map();
    for (const kitId of allKitIds) {
      const kitSnapshot = await transaction.get(db.doc(`kits/${kitId}`));
      if (kitSnapshot.exists()) {
        const data = kitSnapshot.data() || {};
        kitStates.set(kitId, {
          ...data,
          id: kitId,
          stocks: Object.fromEntries(Object.entries(data.stocks || {}).map(([key, stock]) => [
            key,
            { ...stock }
          ]))
        });
      }
    }

    const kitUpdates = new Map();
    const shelfSets = new Map();
    const shelfDeletes = new Set();

    const addKitUpdate = (kitId, field, value) => {
      if (!kitUpdates.has(kitId)) kitUpdates.set(kitId, {});
      kitUpdates.get(kitId)[field] = value;
    };

    const updateStock = (kitId, stockKey, changes) => {
      Object.entries(changes).forEach(([field, value]) => {
        addKitUpdate(kitId, `stocks.${stockKey}.${field}`, value);
      });
      const state = kitStates.get(kitId);
      if (state?.stocks?.[stockKey]) Object.assign(state.stocks[stockKey], changes);
    };

    const groupIsReserved = (groupIds) => groupIds.some((kitId) => {
      const kit = kitStates.get(kitId);
      return kit && Object.values(kit.stocks || {}).some(stockHasCustomerHold);
    });

    const releaseDealShelfStocks = (deal, groupIds) => {
      groupIds.forEach((kitId) => {
        const kit = kitStates.get(kitId);
        if (!kit) return;
        Object.entries(kit.stocks || {}).forEach(([stockKey, stock]) => {
          if (stock.reservedByDealId !== deal.id || stock.reservationType !== 'admin') return;

          shelfDeletes.add(`b_kit_me_${deal.id}_${stockKey}`);
          updateStock(kitId, stockKey, {
            isReserved: false,
            reservedBy: admin.firestore.FieldValue.delete(),
            reservedAt: admin.firestore.FieldValue.delete(),
            availableAt: admin.firestore.FieldValue.serverTimestamp(),
            reservationType: admin.firestore.FieldValue.delete(),
            reservedByDealId: admin.firestore.FieldValue.delete()
          });
          delete kit.stocks[stockKey].reservedByDealId;
          delete kit.stocks[stockKey].reservationType;
          delete kit.stocks[stockKey].reservedBy;
          delete kit.stocks[stockKey].reservedAt;
        });
      });
    };

    const keepGroupOnShelf = (deal, groupIds) => {
      groupIds.forEach((kitId) => {
        const kit = kitStates.get(kitId);
        if (!kit) return;

        Object.entries(kit.stocks || {}).forEach(([stockKey, stock]) => {
          const isManagedHold = stock.reservationType === 'admin'
            && stock.reservedByDealId === deal.id;
          const isAvailable = !stock.isReserved && !stock.order?.orderId;
          if (!isManagedHold && !isAvailable) return;

          const shelfId = `b_kit_me_${deal.id}_${stockKey}`;
          shelfSets.set(shelfId, buildMutualExclusionShelfItem(
            kit,
            stockKey,
            stock,
            deal.id,
            fees
          ));

          if (isAvailable) {
            updateStock(kitId, stockKey, {
              isReserved: true,
              reservedBy: null,
              reservedAt: admin.firestore.FieldValue.serverTimestamp(),
              reservationType: 'admin',
              reservedByDealId: deal.id
            });
          }
        });
      });
    };

    relevantGroups.forEach(({ deal, firstGroup, secondGroup }) => {
      const isFirstGroupReserved = groupIsReserved(firstGroup);
      const isSecondGroupReserved = groupIsReserved(secondGroup);

      if (isFirstGroupReserved && !isSecondGroupReserved) {
        keepGroupOnShelf(deal, secondGroup);
      } else if (isSecondGroupReserved && !isFirstGroupReserved) {
        keepGroupOnShelf(deal, firstGroup);
      } else if (!isFirstGroupReserved && !isSecondGroupReserved) {
        releaseDealShelfStocks(deal, [...firstGroup, ...secondGroup]);
      }
    });

    kitStates.forEach((kit, kitId) => {
      if (!kitUpdates.has(kitId)) return;
      addKitUpdate(
        kitId,
        'hasAvailableStock',
        Object.values(kit.stocks || {}).some((stock) => !stock.order?.orderId && !stock.isReserved)
      );
      addKitUpdate(kitId, 'lastUpdated', admin.firestore.FieldValue.serverTimestamp());
    });

    shelfSets.forEach((item, shelfId) => {
      transaction.set(db.doc(`shelf/${shelfId}`), item);
    });
    shelfDeletes.forEach((shelfId) => {
      transaction.delete(db.doc(`shelf/${shelfId}`));
    });
    kitUpdates.forEach((updates, kitId) => {
      transaction.update(db.doc(`kits/${kitId}`), updates);
    });
  });
});

const getAccountLastLoginMillis = (data = {}) => (
  toMillis(data.lastLoginAt || data.lastActivityAt || data.createdAt)
);

const hasValidatedReceipt = (order = {}) => {
  const status = String(order.status || '').toLowerCase();
  if (['validating', 'declined', 'cancelled', 'completed'].includes(status)) return false;
  return hasValue(order.receipt) || hasValue(order.balanceReceipt);
};

const getUserDeletionBlockers = async (uid) => {
  const ordersSnapshot = await db.collection('orders').where('userId', '==', uid).get();
  let validatedReceiptOrders = 0;

  ordersSnapshot.docs.forEach((orderDoc) => {
    const order = orderDoc.data() || {};
    if (hasValidatedReceipt(order)) validatedReceiptOrders += 1;
  });

  return { validatedReceiptOrders };
};

const deleteUserAccountData = async (uid) => {
  if (!uid) throw new Error('A user UID is required.');

  try {
    await admin.auth().deleteUser(uid);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }

  await db.recursiveDelete(db.doc(`users/${uid}`));
  await db.recursiveDelete(db.doc(`projectVaults/${uid}`));

  const huntsSnapshot = await db.collection('hunts').where('uid', '==', uid).get();
  if (!huntsSnapshot.empty) {
    const batch = db.batch();
    huntsSnapshot.docs.forEach((huntDoc) => batch.delete(huntDoc.ref));
    await batch.commit();
  }
};

const accountDeletionEmail = ({ displayName, deletionDate, isUserRequested = false }) => ({
  subject: 'Your SnorlaxGarage account is scheduled for deletion',
  text: [
    `Hi ${displayName || 'there'},`,
    '',
    isUserRequested
      ? 'Your request to delete your SnorlaxGarage account has been received.'
      : 'We have not seen a login to your SnorlaxGarage account for 30 days.',
    `Your account is now scheduled for deletion on ${deletionDate}.`,
    'Log in again within the next 30 days to cancel the deletion and keep your account.',
    '',
    'Your completed order records are retained for business and legal record-keeping.'
  ].join('\n'),
  html: `
    <p>Hi ${escapeHtml(displayName || 'there')},</p>
    <p>${isUserRequested
      ? 'Your request to delete your SnorlaxGarage account has been received.'
      : 'We have not seen a login to your SnorlaxGarage account for <strong>30 days</strong>.'}</p>
    <p>Your account is now scheduled for deletion on <strong>${escapeHtml(deletionDate)}</strong>.</p>
    <p>Log in again within the next <strong>30 days</strong> to cancel the deletion and keep your account.</p>
    <p>Your completed order records are retained for business and legal record-keeping.</p>
  `
});

exports.adminDeleteUserAccount = onCall({ region: 'asia-southeast1' }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Admin authentication is required.');

  const adminSnapshot = await db.doc(`admins/${request.auth.uid}`).get();
  if (!adminSnapshot.exists) throw new HttpsError('permission-denied', 'Admin access is required.');

  const targetUid = String(request.data?.uid || '').trim();
  if (!targetUid) throw new HttpsError('invalid-argument', 'A target user UID is required.');
  if (targetUid === request.auth.uid) throw new HttpsError('failed-precondition', 'The signed-in admin account cannot be deleted here.');

  const targetAdminSnapshot = await db.doc(`admins/${targetUid}`).get();
  if (targetAdminSnapshot.exists) throw new HttpsError('failed-precondition', 'Admin accounts must be removed through the admin access process.');

  try {
    await deleteUserAccountData(targetUid);
    logger.info('User account deleted by admin', { targetUid, adminUid: request.auth.uid });
    return { success: true, uid: targetUid };
  } catch (error) {
    logger.error('Admin user deletion failed', { targetUid, error: error.message });
    throw new HttpsError('internal', 'The user account could not be deleted.');
  }
});

exports.requestUserAccountDeletion = onCall({
  region: 'asia-southeast1',
  secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM]
}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in before requesting account deletion.');
  if (request.auth.token.firebase?.sign_in_provider === 'anonymous') {
    throw new HttpsError('failed-precondition', 'Guest accounts cannot request account deletion.');
  }

  const uid = request.auth.uid;
  const adminSnapshot = await db.doc(`admins/${uid}`).get();
  if (adminSnapshot.exists) throw new HttpsError('failed-precondition', 'Admin accounts are protected from this request flow.');

  const deletionBlockers = await getUserDeletionBlockers(uid);
  if (deletionBlockers.validatedReceiptOrders > 0) {
    throw new HttpsError(
      'failed-precondition',
      'Account deletion cannot be requested because this account has an order with a validated receipt.'
    );
  }

  const userRef = db.doc(`users/${uid}`);
  const userSnapshot = await userRef.get();
  const userData = userSnapshot.data() || {};
  const existingDeletionMillis = toMillis(userData.deletionScheduledAt);
  if (toMillis(userData.deletionRequestedAt) && existingDeletionMillis) {
    return {
      success: true,
      alreadyRequested: true,
      deletionDate: new Date(existingDeletionMillis).toISOString()
    };
  }

  const requestedMillis = Date.now();
  const deletionMillis = requestedMillis + (ACCOUNT_DELETION_GRACE_DAYS * DAY_MS);
  await userRef.set({
    deletionRequestedAt: admin.firestore.Timestamp.fromMillis(requestedMillis),
    deletionScheduledAt: admin.firestore.Timestamp.fromMillis(deletionMillis),
    deletionNoticeSentAt: admin.firestore.FieldValue.delete(),
    deletionReason: 'user_requested'
  }, { merge: true });

  let email = userData.email || userData.userDetails?.email || '';
  if (!hasValue(email)) email = (await admin.auth().getUser(uid)).email || '';

  if (hasValue(email)) {
    const deletionDate = new Date(deletionMillis).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Manila'
    });
    try {
      await sendEmail({
        eventKey: `account-deletion-request-${uid}-${requestedMillis}`,
        type: 'account_deletion_requested',
        orderId: uid,
        to: email,
        ...accountDeletionEmail({
          displayName: userData.displayName || 'there',
          deletionDate,
          isUserRequested: true
        })
      });
      await userRef.set({ email, deletionNoticeSentAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    } catch (error) {
      logger.error('Account deletion request email failed; scheduled worker will retry', { uid, error: error.message });
    }
  } else {
    logger.warn('Account deletion requested without an email address', { uid });
  }

  return { success: true, alreadyRequested: false, deletionDate: new Date(deletionMillis).toISOString() };
});

exports.processInactiveAccounts = onSchedule({
  schedule: 'every day 03:00',
  timeZone: 'Asia/Manila',
  region: 'asia-southeast1',
  secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM]
}, async () => {
  const now = Date.now();
  const usersSnapshot = await db.collection('users').get();

  for (const userDoc of usersSnapshot.docs) {
    const data = userDoc.data() || {};
    const uid = userDoc.id;
    try {
      const adminSnapshot = await db.doc(`admins/${uid}`).get();
      if (adminSnapshot.exists) continue;

      const requestedMillis = toMillis(data.deletionRequestedAt);
      const configuredDeletionMillis = toMillis(data.deletionScheduledAt);
      if (requestedMillis) {
        const deletionMillis = configuredDeletionMillis || requestedMillis + (ACCOUNT_DELETION_GRACE_DAYS * DAY_MS);
        if (now >= deletionMillis) {
          const deletionBlockers = await getUserDeletionBlockers(uid);
          if (deletionBlockers.validatedReceiptOrders > 0) {
            logger.warn('Requested account deletion paused because the user has a validated receipt on a non-completed order', { uid, deletionBlockers });
            continue;
          }
          await deleteUserAccountData(uid);
          logger.info('Requested user account deleted', { uid, requestedMillis, deletionMillis });
          continue;
        }
        if (data.deletionNoticeSentAt) continue;

        let email = data.email || data.userDetails?.email || '';
        if (!hasValue(email)) email = (await admin.auth().getUser(uid)).email || '';
        if (!hasValue(email)) {
          logger.warn('Requested account has no email for deletion notice', { uid });
          continue;
        }
        const deletionDate = new Date(deletionMillis).toLocaleDateString('en-PH', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'Asia/Manila'
        });
        await sendEmail({
          eventKey: `account-deletion-request-${uid}-${requestedMillis}`,
          type: 'account_deletion_requested',
          orderId: uid,
          to: email,
          ...accountDeletionEmail({
            displayName: data.displayName || 'there',
            deletionDate,
            isUserRequested: true
          })
        });
        await userDoc.ref.set({
          email,
          deletionNoticeSentAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        continue;
      }

      const lastLoginMillis = getAccountLastLoginMillis(data);
      if (!lastLoginMillis) continue;

      const countdownStartMillis = lastLoginMillis + (ACCOUNT_INACTIVITY_DAYS * DAY_MS);
      const deletionMillis = lastLoginMillis + (ACCOUNT_DELETION_TOTAL_DAYS * DAY_MS);

      if (now >= deletionMillis) {
        const deletionBlockers = await getUserDeletionBlockers(uid);
        if (deletionBlockers.validatedReceiptOrders > 0) {
          logger.warn('Inactive account deletion paused because the user has a validated receipt on a non-completed order', { uid, deletionBlockers });
          continue;
        }
        await deleteUserAccountData(uid);
        logger.info('Inactive user account deleted', { uid, lastLoginMillis, deletionMillis });
        continue;
      }

      if (now < countdownStartMillis || data.deletionNoticeSentAt) continue;

      const deletionDate = new Date(deletionMillis).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Manila'
      });
      let email = data.email || data.userDetails?.email || '';
      if (!hasValue(email)) {
        try {
          email = (await admin.auth().getUser(uid)).email || '';
        } catch (error) {
          if (error?.code !== 'auth/user-not-found') throw error;
        }
      }

      if (!hasValue(email)) {
        logger.warn('Inactive user has no email for deletion notice', { uid });
        continue;
      }

      const eventKey = `account-deletion-${uid}-${lastLoginMillis}`;
      await sendEmail({
        eventKey,
        type: 'account_deletion_started',
        orderId: uid,
        to: email,
        ...accountDeletionEmail({
          displayName: data.displayName || 'there',
          deletionDate
        })
      });
      await userDoc.ref.set({
        email,
        deletionNoticeSentAt: admin.firestore.FieldValue.serverTimestamp(),
        deletionScheduledAt: admin.firestore.Timestamp.fromMillis(deletionMillis)
      }, { merge: true });
    } catch (error) {
      logger.error('Inactive account processing failed', { uid, error: error.message });
    }
  }
});

const adminReceiptEmail = (orderId, order) => {
  const summary = buildOrderSummary(orderId, order);
  const kind = receiptKind(order);
  const linkLine = summary.link ? `Review order: ${summary.link}` : 'Open the admin Orders page to review the receipt.';

  return {
    subject: `Payment receipt requires validation · ${summary.label}`,
    text: [
      `A ${kind} payment receipt was submitted for validation.`,
      `Order: ${summary.label}`,
      `Customer: ${summary.customer}`,
      `Customer email: ${summary.email}`,
      `Payment method: ${summary.paymentMethod}`,
      `Order total: ${summary.total}`,
      `Previously recorded paid amount: ${summary.amount}`,
      linkLine
    ].join('\n'),
    html: `
      <h2>Payment receipt requires validation</h2>
      <p>A <strong>${escapeHtml(kind)}</strong> payment receipt was submitted.</p>
      <ul>
        <li><strong>Order:</strong> ${escapeHtml(summary.label)}</li>
        <li><strong>Customer:</strong> ${escapeHtml(summary.customer)}</li>
        <li><strong>Customer email:</strong> ${escapeHtml(summary.email)}</li>
        <li><strong>Payment method:</strong> ${escapeHtml(summary.paymentMethod)}</li>
        <li><strong>Order total:</strong> ${escapeHtml(summary.total)}</li>
        <li><strong>Previously recorded paid amount:</strong> ${escapeHtml(summary.amount)}</li>
      </ul>
      <p>${summary.link ? `<a href="${escapeHtml(summary.link)}">Review this order in Snorlax Garage</a>` : 'Open the admin Orders page to review the receipt.'}</p>
    `
  };
};

const customerApprovalEmail = (orderId, order) => {
  const summary = buildOrderSummary(orderId, order);
  const linkLine = summary.link ? `View your order: ${summary.link}` : 'Sign in to Snorlax Garage to view your order.';

  return {
    subject: `Payment validated · ${summary.label}`,
    text: [
      `Hi ${summary.customer},`,
      '',
      `Your ${order.paymentReview?.receiptType === 'balance' ? 'balance ' : ''}payment for order ${summary.label} has been validated.`,
      `Recorded paid amount: ${summary.amount}`,
      `Current order status: ${summary.status}`,
      linkLine,
      '',
      'Thank you for ordering from Snorlax Garage.'
    ].join('\n'),
    html: `
      <p>Hi ${escapeHtml(summary.customer)},</p>
      <p>Your ${order.paymentReview?.receiptType === 'balance' ? 'balance ' : ''}payment for order <strong>${escapeHtml(summary.label)}</strong> has been validated.</p>
      <ul>
        <li><strong>Recorded paid amount:</strong> ${escapeHtml(summary.amount)}</li>
        <li><strong>Current order status:</strong> ${escapeHtml(summary.status)}</li>
      </ul>
      <p>${summary.link ? `<a href="${escapeHtml(summary.link)}">View your order in Snorlax Garage</a>` : 'Sign in to Snorlax Garage to view your order.'}</p>
      <p>Thank you for ordering from Snorlax Garage.</p>
    `
  };
};

exports.orderPaymentNotifications = onDocumentUpdated(FUNCTION_OPTIONS, async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  const orderId = event.params.orderId;

  if (!before || !after) return;

  const receiptSubmitted = after.status === 'Validating' && (
    changedToNonEmpty(before.receipt, after.receipt)
    || changedToNonEmpty(before.balanceReceipt, after.balanceReceipt)
  );

  if (receiptSubmitted) {
    const receiptEventKey = `receipt-${orderId}-${receiptKind(after)}-${timestampKey(after.lastUpdated)}`;
    const message = adminReceiptEmail(orderId, after);
    await sendEmail({
      eventKey: receiptEventKey,
      type: 'admin_receipt_submitted',
      orderId,
      to: ADMIN_NOTIFICATION_EMAIL.value(),
      ...message
    });
  }

  const previousReviewId = before.paymentReview?.reviewId;
  const currentReview = after.paymentReview;
  const paymentApproved = currentReview?.decision === 'approved'
    && hasValue(currentReview.reviewId)
    && currentReview.reviewId !== previousReviewId;

  if (paymentApproved) {
    const customerEmail = after.receiverDetails?.email || after.email;
    const reviewEventKey = `approval-${orderId}-${currentReview.reviewId}`;
    const message = customerApprovalEmail(orderId, after);
    await sendEmail({
      eventKey: reviewEventKey,
      type: 'customer_payment_approved',
      orderId,
      to: customerEmail,
      ...message
    });
  }
});
