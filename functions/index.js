const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
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
    throw error;
  }
};

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
