/**
 * Utility functions for identifying stocks associated with validated receipt orders or legacy orders.
 * Stocks in an order with a validated receipt or attached to a legacy order should not be detected
 * by AddKitModal or ProductCard.
 */

/**
 * Checks if an order is a legacy order record.
 * Cancelled legacy orders are excluded so reversed/cancelled stocks can be freed if applicable.
 */
export function isLegacyOrderRecord(order) {
  if (!order) return false;
  const status = String(order.status || '').trim().toLowerCase();
  if (status === 'cancelled' || status === 'canceled') return false;

  return Boolean(
    order.legacyOrder
    || order.orderSource === 'legacy'
    || order.isLegacyOrder
    || String(order.orderId || '').toUpperCase().startsWith('#LG-')
    || String(order.orderId || '').toUpperCase().startsWith('LG-')
  );
}

/**
 * Checks if an order has a validated first receipt or balance receipt.
 * Matches the validation rules in Orders.jsx and ProductCard.jsx.
 */
export function hasValidatedFirstReceipt(order) {
  if (!order) return false;
  const status = String(order.status || '').trim().toLowerCase();
  if (status === 'cancelled' || status === 'canceled') return false;

  // Must have a receipt or balanceReceipt
  if (!order.receipt && !order.balanceReceipt) return false;

  // Explicit approval from payment review
  if (order.paymentReview?.decision === 'approved') return true;

  const isReservationOrPartial = ['reservation', 'partial'].includes(String(order.paymentPlan || '').toLowerCase())
    || order.isReservation
    || order.isPartial;

  if (!isReservationOrPartial) {
    return order.status !== 'Validating';
  }

  return order.status !== 'Validating'
    || Boolean(order.balanceReceipt)
    || Number(order.buyerPaid || 0) > 0;
}

/**
 * Pre-computes indexed lookup sets from all orders that have a validated receipt or are legacy orders.
 * Returns:
 * - validatedStockKeys: Set of `${kitId}:${stockKey}`
 * - validatedOrderIds: Set of string order IDs (id, orderId, orderDocId)
 */
export function getValidatedOrderStockSet(orders = []) {
  const validatedStockKeys = new Set();
  const validatedOrderIds = new Set();

  if (!Array.isArray(orders)) {
    return { validatedStockKeys, validatedOrderIds };
  }

  for (const order of orders) {
    const isLegacy = isLegacyOrderRecord(order);
    const hasReceipt = hasValidatedFirstReceipt(order);
    if (!isLegacy && !hasReceipt) continue;

    if (order.id) validatedOrderIds.add(String(order.id));
    if (order.orderId) validatedOrderIds.add(String(order.orderId));
    if (order.orderDocId) validatedOrderIds.add(String(order.orderDocId));

    const topKitId = order.kitId || order.productId;
    const topStockKey = order.selectedStockKey || order.stockKey;
    if (topKitId && topStockKey) {
      validatedStockKeys.add(`${topKitId}:${topStockKey}`);
    }

    if (Array.isArray(order.items)) {
      for (const item of order.items) {
        if (item?.type === 'project') continue;
        const itemKitId = item?.id || item?.kitId || item?.productId;
        const itemStockKey = item?.stockKey || item?.selectedStockKey;
        if (itemKitId && itemStockKey) {
          validatedStockKeys.add(`${itemKitId}:${itemStockKey}`);
        }
      }
    }
  }

  return { validatedStockKeys, validatedOrderIds };
}

/**
 * Checks if a specific stock is in an order with a validated receipt or attached to a legacy order.
 * @param {Object} stock - The stock object
 * @param {string} kitId - The parent kit's ID
 * @param {Object} validatedData - Output from getValidatedOrderStockSet(orders)
 * @param {string} [stockKeyOverride] - Optional explicit stock key if not on stock.key
 */
export function isStockInValidatedOrder(stock, kitId, validatedData = {}, stockKeyOverride = '') {
  if (!stock) return false;

  // Direct validated receipt marker on stock or stock.order
  if (stock.receiptValidated || stock.order?.receiptValidated) {
    return true;
  }

  // Direct legacy order markers on stock or stock.order
  if (
    stock.isLegacyOrder
    || stock.legacyOrder
    || stock.order?.isLegacyOrder
    || stock.order?.legacyOrder
    || String(stock.order?.orderId || '').toUpperCase().startsWith('#LG-')
    || String(stock.order?.orderId || '').toUpperCase().startsWith('LG-')
  ) {
    return true;
  }

  const { validatedStockKeys, validatedOrderIds } = validatedData;
  if (!validatedStockKeys || !validatedOrderIds) return false;

  const stockKey = String(stockKeyOverride || stock.key || stock.id || '');
  const kitIdStr = String(kitId || '');

  // 1. Check if kitId:stockKey exists in validatedStockKeys
  if (kitIdStr && stockKey && validatedStockKeys.has(`${kitIdStr}:${stockKey}`)) {
    return true;
  }

  // 2. Check if stock.order references an order with validated receipt or legacy order
  const orderRef = stock.order;
  if (orderRef) {
    const referenceIds = typeof orderRef === 'object'
      ? [orderRef.orderDocId, orderRef.orderId, orderRef.id].filter(Boolean).map(String)
      : [String(orderRef)];

    if (referenceIds.some(refId => validatedOrderIds.has(refId))) {
      return true;
    }
  }

  return false;
}

/**
 * Filters a kit's `stocks` map/object, excluding any stock in an order with a validated receipt or legacy order.
 */
export function filterActiveKitStocks(stocksMap = {}, kitId, validatedData = {}) {
  if (!stocksMap || typeof stocksMap !== 'object') return {};
  const result = {};
  for (const [key, stock] of Object.entries(stocksMap)) {
    if (!isStockInValidatedOrder(stock, kitId, validatedData, key)) {
      result[key] = stock;
    }
  }
  return result;
}
