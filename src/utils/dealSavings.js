const toAmount = (value) => Math.max(0, Math.round(Number(value) || 0));

const isClearancePricingDeal = (deal) => (
  deal?.type === 'clearance'
  || deal?.type === 'wild_sale'
  || deal?.type === 'flexi_bundle'
);

export const getDealDiscountAmount = (deal, dynamicTotals = null) => {
  if (!deal) return 0;

  if (dynamicTotals && Number.isFinite(dynamicTotals.sellTotal) && Number.isFinite(dynamicTotals.discountedPrice)) {
    const dynamicDiscount = toAmount(dynamicTotals.sellTotal - dynamicTotals.discountedPrice);
    if (dynamicDiscount > 0) return dynamicDiscount;
  }

  const configuredClearanceDiscount = toAmount(deal.clearanceDiscountTotal);
  if (isClearancePricingDeal(deal) && configuredClearanceDiscount > 0) {
    return configuredClearanceDiscount;
  }

  // If deal has bundlePrice and totalSell, prefer the calculated discount
  if (deal.bundlePrice !== undefined && deal.totalSell !== undefined) {
    const calculatedBundleDiscount = toAmount(Number(deal.totalSell || 0) - Number(deal.bundlePrice || 0));
    if (calculatedBundleDiscount > 0) return calculatedBundleDiscount;
  }

  const configuredDiscount = toAmount(deal.discountAmount);
  if (configuredDiscount > 0) return configuredDiscount;

  return toAmount(Number(deal.totalSell || 0) - Number(deal.bundlePrice || 0));
};

export const getDealGrabLabel = (deal, dynamicTotals = null) => (
  `GRAB ₱${getDealDiscountAmount(deal, dynamicTotals).toLocaleString()} OFF`
);

export const getDealSaveUpToAmount = (
  deal,
  { installmentFee = 0, handlingFee = 0, transferFee = 0, kitCount = 0, dynamicTotals = null } = {}
) => {
  if (!deal) return 0;

  // Bundle and clearance prices are deal-only prices. They do not include
  // reservation/installment, handling, or transfer fees.
  return getDealDiscountAmount(deal, dynamicTotals);
};

export const getDealSaveUpToLabel = (deal, options = {}) => (
  `SAVE UP TO ₱${getDealSaveUpToAmount(deal, options).toLocaleString()} OFF`
);
