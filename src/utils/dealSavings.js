const toAmount = (value) => Math.max(0, Math.round(Number(value) || 0));

export const getDealDiscountAmount = (deal) => {
  if (!deal) return 0;

  const configuredClearanceDiscount = toAmount(deal.clearanceDiscountTotal);
  if (deal.type === 'clearance' && configuredClearanceDiscount > 0) {
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

  // Clearance shows the current kit plus two additional kit slots. The plus
  // suffix communicates that customers may add more kits and gain more fee
  // savings beyond the displayed baseline.
  const installmentCount = deal.type === 'clearance'
    ? 2
    : Math.max(0, Number(kitCount) || Number(deal.kitIds?.length) || 0);

  return getDealDiscountAmount(deal)
    + (toAmount(installmentFee) * installmentCount)
    + toAmount(handlingFee)
    + toAmount(transferFee);
};

export const getDealSaveUpToLabel = (deal, fees = {}) => (
  `SAVE UP TO ₱${getDealSaveUpToAmount(deal, fees).toLocaleString()}${deal?.type === 'clearance' ? '+' : ''}`
);
