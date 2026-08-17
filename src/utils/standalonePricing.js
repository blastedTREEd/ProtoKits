export const getStockStandaloneSellPrice = (item = {}, kit = {}, stock = null) => {
  const resolvedStock = stock || kit?.stocks?.[item.stockKey];
  return Number(
    resolvedStock?.sellPrice
    || item.originalSellPrice
    || kit?.sellPrice
    || 0
  );
};

export const isBundleOrClearanceItem = (item = {}) => (
  Boolean(
    item.isBundleItem
    || item.bundleId
    || item.bundleName
    || Number(item.bundleReferencePrice) > 0
    || Number(item.appliedBundlePrice) > 0
    || item.isClearanceBundle
    || (Array.isArray(item.clearanceKitIds) && item.clearanceKitIds.length > 0)
  )
);

export const getItemInstallmentFee = (item = {}, fallback = 0) => (
  Number(item.appliedInstallmentFee ?? fallback) || 0
);

// Split a whole-number fee without decimals while preserving the exact total.
// The first `remainder` shares receive one extra peso, so the result is never
// short or over the configured fee.
export const getIntegerFeeShare = (totalFee, shareCount, shareIndex = 0) => {
  const fee = Math.max(0, Math.round(Number(totalFee) || 0));
  const count = Math.max(1, Math.round(Number(shareCount) || 1));
  const index = Math.max(0, Math.min(count - 1, Math.floor(Number(shareIndex) || 0)));
  const baseShare = Math.floor(fee / count);
  const remainder = fee % count;
  return baseShare + (index < remainder ? 1 : 0);
};

// This is the price a customer would see for the same stock when bought
// outside a deal. Bundle fee shares remain order-level charges and are not
// included in this per-item reference price.
export const getStandaloneUnitPrice = (item = {}, kit = {}, fallbackInstallmentFee = 0) => {
  if (item.type === 'project' || item.projectData) return 0;
  return getStockStandaloneSellPrice(item, kit) + getItemInstallmentFee(item, fallbackInstallmentFee);
};

export const getDiscountedUnitPrice = (item = {}, fallback = 0) => {
  if (item.type === 'project' || item.projectData) {
    return Number(item.projectData?.displayPrice || item.projectData?.sellPrice || item.price || fallback || 0);
  }
  return Number(item.price ?? item.sellPrice ?? fallback ?? 0) || 0;
};

export const getStandaloneDiscount = (item = {}, kit = {}, fallbackInstallmentFee = 0) => {
  const discountedPrice = getDiscountedUnitPrice(item);
  const standalonePrice = getStandaloneUnitPrice(item, kit, fallbackInstallmentFee);
  return {
    discountedPrice,
    standalonePrice,
    amount: Math.max(0, standalonePrice - discountedPrice),
    isDiscounted: standalonePrice > discountedPrice
  };
};
