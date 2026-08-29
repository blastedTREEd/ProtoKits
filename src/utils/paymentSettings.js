export const getCheckoutPaymentFees = (data = {}) => {
  // Support both wrapped (props.shippingSettings) and direct (shippingSettings) structures
  const settings = data?.shippingSettings?.paymentSettings || data?.paymentSettings || {};

  const handlingFee = Number(settings.handlingFee || 0);
  const installmentFee = Number(settings.installmentFee || 0);
  const transferFee = Number(settings.transferFee || 0);
  return { handlingFee, installmentFee, transferFee };
};

// Resolve shorthand shipping suboption keys used by older order records and
// the checkout UI (for example `cop` -> `cash-on-pickup`).
export const resolveShippingSuboptionKey = (methodConfig, subKey) => {
  if (!subKey || !methodConfig?.suboptions) return subKey;
  if (methodConfig.suboptions[subKey]) return subKey;

  const normalizedSub = String(subKey).toLowerCase().replace(/-/g, '');
  const found = Object.keys(methodConfig.suboptions).find((key) => {
    const lowerKey = key.toLowerCase();
    const strippedKey = lowerKey.replace(/-/g, '');
    const label = String(methodConfig.suboptions[key]?.label || '').toLowerCase();

    if (strippedKey === normalizedSub) return true;
    if (normalizedSub === 'cop' && (lowerKey.includes('pickup') || label.includes('pickup') || label.includes('cop') || lowerKey === 'standard-delivery' || label.includes('standard'))) return true;
    if (normalizedSub === 'cod' && (lowerKey.includes('delivery') || label.includes('delivery') || label.includes('cod'))) return true;
    if (normalizedSub === 'self' && (lowerKey.includes('self') || label.includes('self') || label.includes('customer'))) return true;
    if (normalizedSub === 'seller' && (lowerKey.includes('seller') || label.includes('seller') || lowerKey === 'standard-delivery' || label.includes('standard'))) return true;
    if (normalizedSub === 'delivery' && (lowerKey.includes('delivery') || label.includes('delivery') || lowerKey === 'standard-delivery' || label.includes('standard'))) return true;
    return false;
  });

  return found || subKey;
};

// Match CheckoutModal's method/suboption handling-fee eligibility rules,
// including backward-compatible handlingDiscount records.
export const shouldChargeHandlingFee = (shippingMethods = {}, method, subKey = null) => {
  const methodConfig = shippingMethods?.[method];
  if (typeof methodConfig !== 'object' || methodConfig === null) return true;

  const hasSuboptions = Object.keys(methodConfig.suboptions || {}).length > 0;
  if (subKey) {
    const resolvedKey = resolveShippingSuboptionKey(methodConfig, subKey);
    const subConfig = methodConfig.suboptions?.[resolvedKey];
    if (subConfig?.handlingFee !== undefined) return subConfig.handlingFee === true;
    if (subConfig?.handlingDiscount !== undefined) return subConfig.handlingDiscount !== true;
    return true;
  }

  if (hasSuboptions) return true;
  if (methodConfig.handlingFee !== undefined) return methodConfig.handlingFee === true;
  if (methodConfig.handlingDiscount !== undefined) return methodConfig.handlingDiscount !== true;
  return true;
};
