export function distributeRoundedBundlePrices(rows = [], targetTotal = 0, getRawPrice = row => row.rawPrice) {
  const target = Math.max(0, Math.round(Number(targetTotal) || 0));
  const pricedRows = rows.map((row, index) => {
    const rawPrice = Math.max(0, Number(getRawPrice(row)) || 0);
    const basePrice = Math.floor(rawPrice);
    return {
      ...row,
      finalPrice: basePrice,
      _bundleFraction: rawPrice - basePrice,
      _bundleIndex: index
    };
  });

  let remainder = target - pricedRows.reduce((sum, row) => sum + row.finalPrice, 0);
  const addOrder = [...pricedRows].sort((a, b) => b._bundleFraction - a._bundleFraction || a._bundleIndex - b._bundleIndex);
  const subtractOrder = [...pricedRows].sort((a, b) => a._bundleFraction - b._bundleFraction || a._bundleIndex - b._bundleIndex);

  let guard = 0;
  while (remainder > 0 && addOrder.length > 0 && guard < 10000) {
    addOrder[guard % addOrder.length].finalPrice += 1;
    remainder -= 1;
    guard += 1;
  }

  guard = 0;
  while (remainder < 0 && subtractOrder.some(row => row.finalPrice > 0) && guard < 10000) {
    const row = subtractOrder[guard % subtractOrder.length];
    if (row.finalPrice > 0) {
      row.finalPrice -= 1;
      remainder += 1;
    }
    guard += 1;
  }

  return pricedRows.map(row => {
    const cleanRow = { ...row };
    delete cleanRow._bundleFraction;
    delete cleanRow._bundleIndex;
    return cleanRow;
  });
}

// Splits an order-level fee across bundle rows without changing the fee total.
// Earlier rows receive any remaining pesos so the shares always add up exactly.
export function getDistributedFeeShare(totalFee = 0, index = 0, count = 1) {
  const fee = Math.max(0, Math.round(Number(totalFee) || 0));
  const safeCount = Math.max(1, Math.floor(Number(count) || 1));
  const safeIndex = Math.max(0, Math.floor(Number(index) || 0));
  const baseShare = Math.floor(fee / safeCount);
  return baseShare + (safeIndex < fee % safeCount ? 1 : 0);
}
