const toAmount = (value) => Math.max(0, Math.round(Number(value) || 0));

const isClearancePricingDeal = (deal) => deal?.type === 'clearance' || deal?.type === 'flexi_bundle';

export const getDealDiscountAmount = (deal) => {
  if (!deal) return 0;

  const configuredClearanceDiscount = toAmount(deal.clearanceDiscountTotal);
  if (isClearancePricingDeal(deal) && configuredClearanceDiscount > 0) {
    return configuredClearanceDiscount;
  }

  const configuredDiscount = toAmount(deal.discountAmount);
  if (configuredDiscount > 0) return configuredDiscount;

  return toAmount(Number(deal.totalSell || 0) - Number(deal.bundlePrice || 0));
};

export const getDealGrabLabel = (deal) => (
  `GRAB ₱${getDealDiscountAmount(deal).toLocaleString()} OFF`
);

export const getDealSaveUpToAmount = (
  deal,
  { installmentFee = 0, handlingFee = 0, transferFee = 0, kitCount = 0 } = {}
) => {
  if (!deal) return 0;

  // Bundle and clearance prices are deal-only prices. They do not include
  // reservation/installment, handling, or transfer fees.
  return getDealDiscountAmount(deal);
};

export const getDealSaveUpToLabel = (deal, fees = {}) => (
  `SAVE UP TO ₱${getDealSaveUpToAmount(deal, fees).toLocaleString()} OFF`
);
