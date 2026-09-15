export const normalizePromoValue = (value) => String(value ?? '').trim().toLowerCase();

export const promoValuesMatch = (a, b) => normalizePromoValue(a) === normalizePromoValue(b);

export const isSuboptionMatchingPromo = (candidate, promoSub) => {
  if (!candidate || !promoSub) return false;
  if (promoValuesMatch(candidate, promoSub)) return true;
  const normCand = String(candidate || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normPromo = String(promoSub || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normCand === normPromo) return true;

  // COD must never match non-COD promos
  const isCodCand = normCand === 'cod' || normCand.includes('cashondelivery');
  const isCodPromo = normPromo === 'cod' || normPromo.includes('cashondelivery');
  if (isCodCand !== isCodPromo) return false;

  const standardDeliveryAliases = [
    'delivery',
    'standarddelivery',
    'standard',
    'cop',
    'cashonpickup',
    'seller',
    'sellerbooking'
  ];
  if (standardDeliveryAliases.includes(normCand) && standardDeliveryAliases.includes(normPromo)) {
    return true;
  }

  return false;
};

export const getSuboptionCandidatesFromKey = (shippingMethods, method, subKey) => {
  if (!subKey) return ['All'];
  const label = shippingMethods?.[method]?.suboptions?.[subKey]?.label;
  const normalizedKey = String(subKey || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedLabel = String(label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Legacy compatibility mappings
  let legacyVals = [];
  if (normalizedKey === 'standarddelivery' || normalizedLabel.includes('standarddelivery')) {
    legacyVals = ['cop', 'seller', 'delivery', 'cash-on-pickup', 'seller-booking', 'standard', 'COP', 'Cash On Pickup', 'Seller Booking', 'Standard Delivery'];
  } else if (normalizedKey === 'cop' || normalizedKey.includes('cashonpickup') || normalizedLabel.includes('cashonpickup') || normalizedLabel.includes('pickup')) {
    legacyVals = ['standard-delivery', 'standard', 'Standard Delivery', 'COP', 'Cash On Pickup'];
  } else if (normalizedKey === 'seller' || normalizedKey.includes('sellerbooking') || normalizedKey === 'self' || normalizedKey.includes('selfbooking') || normalizedLabel.includes('sellerbooking') || normalizedLabel.includes('selfbooking')) {
    legacyVals = ['standard-delivery', 'standard', 'Standard Delivery', 'Seller Booking', 'Self Booking'];
  } else if (
    normalizedKey === 'delivery' ||
    normalizedKey.includes('standarddelivery') ||
    (normalizedLabel.includes('delivery') && !normalizedLabel.includes('cashondelivery') && normalizedKey !== 'cod')
  ) {
    legacyVals = ['standard-delivery', 'standard', 'Standard Delivery'];
  }
  
  return Array.from(new Set([
    subKey,
    label,
    ...legacyVals
  ].filter(Boolean)));
};

export const isFreeShippingActive = (item = {}, stock = null) => {
  const eligible = Boolean(item.isFreeShippingEligible || stock?.isFreeShippingEligible);
  if (!eligible) return false;
  const promoMethod = item.freeShippingMethod || stock?.freeShippingMethod || '';
  if (!promoMethod || promoMethod === 'All') return false;
  const until = item.freeShippingUntil || stock?.freeShippingUntil || '';
  if (!until) return true;
  const expiry = new Date(until).getTime();
  return Number.isNaN(expiry) || Date.now() < expiry;
};

export const isItemShippingEligibleForFreeShipping = (item, method, suboptionVal = null) => {
  if (!isFreeShippingActive(item, null)) return false;
  
  const promoMethod = item.freeShippingMethod || '';
  if (!promoMethod || promoMethod === 'All') return false;
  if (!promoValuesMatch(promoMethod, method)) return false;
  
  const promoSub = item.freeShippingSuboption || '';
  if (!suboptionVal || (Array.isArray(suboptionVal) && suboptionVal.length === 1 && suboptionVal[0] === 'All')) {
    return true;
  }
  if (!promoSub || promoSub === 'All') return true;

  const suboptionCandidates = Array.isArray(suboptionVal) ? suboptionVal : [suboptionVal];
  return suboptionCandidates.some(candidate => isSuboptionMatchingPromo(candidate, promoSub));
};

/**
 * Checks whether an order qualifies for free shipping.
 * Supports:
 * 1. Explicit order-level flags (isFreeShipping, isFreeShippingApplied, freeShipping)
 * 2. Retroactive fallback inspection of order items and shipping methods.
 */
export const isOrderFreeShipping = (order, shippingMethods = null) => {
  if (!order) return false;

  // 1. Direct flags on the order
  if (order.isFreeShipping === true || order.isFreeShippingApplied === true || order.freeShipping === true) {
    return true;
  }

  // 2. Retroactive fallback checking order items
  const items = Array.isArray(order.items) && order.items.length > 0 ? order.items : [order];
  const methodKey = String(order.shippingMethodKey || '').trim();
  const rawMethod = String(order.shippingMethod || '').trim();
  const cleanMethod = rawMethod.replace(/\s*\([^)]*\)/g, '').split(':')[0].trim();
  const subKey = order.shippingSuboptionKey;
  const parenthesizedSub = rawMethod.match(/\(([^)]*)\)/)?.[1]?.trim();

  return items.some((item) => {
    // For already created orders, item.isFreeShippingEligible was persisted at checkout
    const eligible = Boolean(item.isFreeShippingEligible || item.freeShippingEligible);
    if (!eligible) return false;

    const promoMethod = item.freeShippingMethod || '';
    if (!promoMethod || promoMethod === 'All') return false;

    // Match method
    const normPromo = normalizePromoValue(promoMethod);
    const matchesMethod = (methodKey && normalizePromoValue(methodKey) === normPromo) ||
      (cleanMethod && normalizePromoValue(cleanMethod) === normPromo) ||
      promoValuesMatch(promoMethod, rawMethod) ||
      rawMethod.toLowerCase().includes(normPromo);

    if (!matchesMethod) return false;

    const promoSub = item.freeShippingSuboption || '';
    if (!promoSub || promoSub === 'All') return true;

    // Match suboption
    let subCandidates = [];
    if (subKey && shippingMethods) {
      subCandidates = getSuboptionCandidatesFromKey(shippingMethods, methodKey || cleanMethod, subKey);
    }
    if (subKey && !subCandidates.includes(subKey)) {
      subCandidates.push(subKey);
    }
    if (parenthesizedSub && !subCandidates.includes(parenthesizedSub)) {
      subCandidates.push(parenthesizedSub);
    }

    if (subCandidates.length === 0) {
      return true;
    }

    return subCandidates.some((candidate) => isSuboptionMatchingPromo(candidate, promoSub));
  });
};
