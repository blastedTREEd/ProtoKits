import { isPerKitClearanceDeal } from './dealTypes';

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

// Deal pricing should use the most valuable matching stock variant. Cost price
// is the primary criterion so bundles and clearance deals do not consume a
// lower-cost variant when multiple variants are available for the same kit.
// Sell price is only a deterministic tie-breaker when cost prices match.
export function getHighestCostStock(stocks = []) {
  return (stocks || []).reduce((best, stock) => {
    if (!stock) return best;
    if (!best) return stock;

    const costDelta = Number(stock.costPrice || 0) - Number(best.costPrice || 0);
    if (costDelta !== 0) return costDelta > 0 ? stock : best;

    const sellDelta = Number(stock.sellPrice || 0) - Number(best.sellPrice || 0);
    return sellDelta > 0 ? stock : best;
  }, null);
}

// Clearance prices use the requested cost ceiling: values below the midpoint
// land on PHP 50, while values above the midpoint round up to the next PHP
// 100. An explicit discount override is still supported for legacy deals.

export function getDiscountFloor(costPrice = 0) {
  const cost = Math.max(0, Number(costPrice) || 0);
  const hundreds = Math.floor(cost / 100) * 100;
  const remainder = cost - hundreds;
  if (remainder === 0) return cost;
  return remainder <= 50 ? hundreds + 50 : hundreds + 100;
}

export function getClearancePrice(costPrice = 0, sellPrice = 0, discountOverride = '') {
  const cost = Math.max(0, Number(costPrice) || 0);
  const sell = Math.max(0, Number(sellPrice) || 0);
  const hasOverride = discountOverride !== '' && discountOverride !== null && discountOverride !== undefined;

  if (hasOverride) {
    const costFloor = Math.min(sell, getDiscountFloor(cost));
    return Math.max(costFloor, Math.round(sell - Math.max(0, Number(discountOverride) || 0)));
  }

  return Math.min(sell, getDiscountFloor(cost));
}

// Resolve the original per-source offer amount. Prefer the per-source setting
// so an aggregate legacy total cannot be mistaken for this kit's offer.
export function getFlexiOfferedDiscount(deal = {}, sourceKitId = '', fallback = 0) {
  if (Number(fallback) > 0) return Math.max(0, Math.round(Number(fallback)));

  const normalizedId = String(sourceKitId || '');
  const configured = deal?.clearanceDiscounts?.[normalizedId]
    ?? deal?.clearanceDiscounts?.[sourceKitId];
  if (configured !== '' && configured !== null && configured !== undefined) {
    return Math.max(0, Math.round(Number(configured) || 0));
  }

  const storedDiscount = deal?.kitDiscounts?.[normalizedId]?.discount
    ?? deal?.kitDiscounts?.[sourceKitId]?.discount;
  if (Number(storedDiscount) > 0) return Math.max(0, Math.round(Number(storedDiscount)));

  return Math.max(0, Math.round(Number(deal?.discountAmount) || 0));
}

function getStandardPricing(rows = []) {
  const pricedRows = (rows || []).map((row, index) => {
    const kitId = row.kitId ?? row.id;
    const sellPrice = Math.max(0, Number(row.sellPrice ?? row.sell ?? row.refPrice ?? 0) || 0);
    const costPrice = Math.max(0, Number(row.costPrice ?? row.cost ?? 0) || 0);

    return {
      ...row,
      kitId,
      sellPrice,
      costPrice,
      isClearance: false,
      clearancePrice: sellPrice,
      clearanceDiscount: 0,
      costFloor: sellPrice,
      appliedDiscount: 0,
      standardDiscount: 0,
      discountCapacity: 0,
      rawPrice: sellPrice,
      finalPrice: Math.max(0, Math.round(sellPrice)),
      _clearanceIndex: index
    };
  });

  const totalSell = pricedRows.reduce((sum, row) => sum + row.sellPrice, 0);
  const totalCost = pricedRows.reduce((sum, row) => sum + row.costPrice, 0);
  const bundlePrice = pricedRows.reduce((sum, row) => sum + row.finalPrice, 0);

  return {
    rows: pricedRows.map(row => ({ ...row, discount: 0 })),
    totalSell,
    totalCost,
    bundlePrice,
    clearanceDiscountTotal: 0,
    standardDiscountTotal: 0,
    unusedClearanceDiscount: 0,
    discountAmount: 0,
    projectedProfit: bundlePrice - totalCost
  };
}

// Flexi's deal-card preview is intentionally separate from Clearance pricing.
// It shows each eligible source's own possible price; the actual selected-cart
// calculation is handled by getFlexiBundlePricing below.
export function getFlexiBundlePreviewPricing(rows = [], eligibleKitIds = [], discountOverrides = {}) {
  const eligibleIds = new Set((eligibleKitIds || []).map(id => String(id)));
  const pricedRows = (rows || []).map((row, index) => {
    const kitId = row.kitId ?? row.id;
    const normalizedKitId = String(kitId);
    const sellPrice = Math.max(0, Number(row.sellPrice ?? row.sell ?? row.refPrice ?? 0) || 0);
    const costPrice = Math.max(0, Number(row.costPrice ?? row.cost ?? 0) || 0);
    const isClearance = eligibleIds.has(normalizedKitId);
    const override = discountOverrides?.[kitId] ?? discountOverrides?.[normalizedKitId] ?? '';
    const clearancePrice = isClearance
      ? getClearancePrice(costPrice, sellPrice, override)
      : sellPrice;
    const clearanceDiscount = isClearance ? Math.max(0, sellPrice - clearancePrice) : 0;
    const costFloor = isClearance
      ? Math.min(sellPrice, getDiscountFloor(costPrice))
      : sellPrice;

    return {
      ...row,
      kitId,
      sellPrice,
      costPrice,
      isClearance,
      clearancePrice,
      clearanceDiscount,
      costFloor,
      appliedDiscount: clearanceDiscount,
      standardDiscount: 0,
      discountCapacity: isClearance ? Math.max(0, sellPrice - costFloor) : 0,
      rawPrice: clearancePrice,
      finalPrice: Math.max(0, Math.round(clearancePrice)),
      _clearanceIndex: index
    };
  });

  const bundlePrice = pricedRows.reduce((sum, row) => sum + row.finalPrice, 0);
  const totalSell = pricedRows.reduce((sum, row) => sum + row.sellPrice, 0);
  const totalCost = pricedRows.reduce((sum, row) => sum + row.costPrice, 0);
  const clearanceDiscountTotal = pricedRows.reduce((sum, row) => sum + row.clearanceDiscount, 0);

  return {
    rows: pricedRows.map(row => ({ ...row, discount: row.clearanceDiscount })),
    totalSell,
    totalCost,
    bundlePrice,
    clearanceDiscountTotal,
    standardDiscountTotal: 0,
    unusedClearanceDiscount: 0,
    discountAmount: Math.max(0, totalSell - bundlePrice),
    projectedProfit: bundlePrice - totalCost
  };
}

// Price a FLEXI-BUNDLE offer using the source kit's discount amount. The
// required stock from another kit unlocks that offer, then the offer is
// distributed across all selected rows so every selected kit receives a
// visual discounted price while the source remains the offer owner.
export function getFlexiBundlePricing(rows = [], sourceKitId = '', requiredOtherStockCount = 1, offeredDiscount = 0) {
  const sourceIndex = (rows || []).findIndex(row => String(row?.kitId ?? row?.id) === String(sourceKitId));
  if (sourceIndex < 0) return getStandardPricing(rows);

  const requiredCount = Math.max(0, Math.floor(Number(requiredOtherStockCount) || 0));
  const otherStockCount = (rows || []).reduce((count, row, index) => {
    if (index === sourceIndex || String(row?.kitId ?? row?.id) === String(sourceKitId)) return count;
    return count + Math.max(1, Number(row?.item?.quantity ?? row?.quantity) || 1);
  }, 0);
  if (otherStockCount < requiredCount) return getStandardPricing(rows);

  const normalizedRows = (rows || []).map((row, index) => {
    const kitId = row.kitId ?? row.id;
    const sellPrice = Math.max(0, Number(row.sellPrice ?? row.sell ?? row.refPrice ?? 0) || 0);
    const costPrice = Math.max(0, Number(row.costPrice ?? row.cost ?? 0) || 0);
    const costFloor = Math.min(sellPrice, getDiscountFloor(costPrice));
    return {
      ...row,
      kitId,
      sellPrice,
      costPrice,
      costFloor,
      discountCapacity: Math.max(0, sellPrice - costFloor),
      _clearanceIndex: index
    };
  });
  const requestedDiscount = Math.max(0, Math.round(Number(offeredDiscount) || 0));
  const allocations = distributeIntegerDiscountByCapacity(
    normalizedRows
      .map((row, index) => ({ index, capacity: row.discountCapacity }))
      .filter(({ capacity }) => Number(capacity || 0) > 0),
    requestedDiscount
  );
  const pricedRows = normalizedRows.map((row, index) => {
    const discount = Number(allocations.get(index) || 0);
    const clearancePrice = Math.max(row.costFloor, Math.round(row.sellPrice - discount));
    const clearanceDiscount = Math.max(0, row.sellPrice - clearancePrice);
    return {
      ...row,
      isClearance: row.sellPrice > 0,
      clearancePrice,
      clearanceDiscount,
      appliedDiscount: clearanceDiscount,
      standardDiscount: 0,
      rawPrice: clearancePrice,
      finalPrice: Math.max(0, Math.round(clearancePrice))
    };
  });
  const totalSell = pricedRows.reduce((sum, row) => sum + row.sellPrice, 0);
  const totalCost = pricedRows.reduce((sum, row) => sum + row.costPrice, 0);
  const bundlePrice = pricedRows.reduce((sum, row) => sum + row.finalPrice, 0);
  const clearanceDiscountTotal = pricedRows.reduce((sum, row) => sum + row.clearanceDiscount, 0);

  return {
    rows: pricedRows.map(row => ({ ...row, discount: row.clearanceDiscount })),
    totalSell,
    totalCost,
    bundlePrice,
    clearanceDiscountTotal,
    standardDiscountTotal: 0,
    discountAmount: Math.max(0, totalSell - bundlePrice),
    projectedProfit: bundlePrice - totalCost,
    offeredDiscount: requestedDiscount,
    sourceDiscount: Number(pricedRows[sourceIndex]?.clearanceDiscount || 0),
    otherDiscountTotal: Math.max(0, clearanceDiscountTotal - Number(pricedRows[sourceIndex]?.clearanceDiscount || 0)),
    unusedOfferedDiscount: Math.max(0, requestedDiscount - clearanceDiscountTotal)
  };
}

// Clearance deals are shown as soon as an eligible kit is present, but each
// kit's discount is only unlocked after its configured number of other stock
// units is also selected. Older deals used one other kit implicitly, so keep
// that behavior when the per-kit map and legacy field are both absent.
export function getClearanceRequiredOtherStock(deal = {}, kitId = '') {
  const perKitCounts = deal?.requiredOtherStockCounts
    || deal?.requiredOtherStockByKit
    || deal?.clearanceRequiredOtherStockCounts;
  const normalizedKitId = String(kitId || '');
  const configuredPerKit = normalizedKitId && perKitCounts && typeof perKitCounts === 'object'
    ? perKitCounts[normalizedKitId]
    : undefined;
  const configured = configuredPerKit !== undefined
    ? Number(configuredPerKit)
    : Number(deal?.requiredOtherStockCount);
  return Number.isFinite(configured) ? Math.max(0, Math.floor(configured)) : 1;
}

export function getClearanceKitIds(deal = {}) {
  const configuredIds = Array.isArray(deal?.clearanceKitIds) && deal.clearanceKitIds.length > 0
    ? deal.clearanceKitIds
    : deal?.clearanceKitId
      ? [deal.clearanceKitId]
      : (deal?.kitIds || []);
  const explicitIds = Array.isArray(configuredIds) ? configuredIds : [configuredIds];
  return [...new Set(explicitIds.map(id => String(id)).filter(Boolean))];
}

export function isClearanceRequirementMet(deal = {}, selectedKitIds = [], currentKitId = '') {
  const eligibleKitIds = new Set(getClearanceKitIds(deal));
  const currentId = String(currentKitId || '');
  if (!currentId || !eligibleKitIds.has(currentId)) return false;

  // The new CLEARANCE strategy sells each eligible stock independently. Its
  // per-kit expiry/reactivation controls availability; no companion stock is
  // needed to unlock the price.
  if (isPerKitClearanceDeal(deal)) return true;

  // Count selected stock units, not unique kit IDs. Only stock from another
  // kit can satisfy the source kit's requirement; additional quantity of the
  // source kit itself does not count.
  const otherSelectedStockCount = (selectedKitIds || [])
    .map(id => String(id))
    .filter(id => id && id !== currentId)
    .length;
  return otherSelectedStockCount >= getClearanceRequiredOtherStock(deal, currentId);
}

// Distribute a clearance pool in whole pesos while respecting each item's
// cost-ceiling capacity. If an item reaches its ceiling, its remaining share
// is redistributed to the other eligible items instead of becoming unused.
function distributeIntegerDiscountByCapacity(entries = [], discountTotal = 0) {
  const allocations = new Map(entries.map(({ index }) => [index, 0]));
  let remaining = Math.max(0, Math.round(Number(discountTotal) || 0));
  let activeEntries = entries.filter(({ capacity }) => Number(capacity || 0) > 0);
  let guard = 0;

  while (remaining > 0 && activeEntries.length > 0 && guard < 10000) {
    const nextAllocations = activeEntries.map(({ index }, position) => ({
      index,
      share: getDistributedFeeShare(remaining, position, activeEntries.length)
    }));
    let appliedThisRound = 0;

    nextAllocations.forEach(({ index, share }) => {
      const entry = entries.find(candidate => candidate.index === index);
      const capacity = Math.max(0, Number(entry?.capacity || 0));
      const allocated = Number(allocations.get(index) || 0);
      const applied = Math.min(Math.max(0, capacity - allocated), share);
      allocations.set(index, allocated + applied);
      appliedThisRound += applied;
    });

    if (appliedThisRound <= 0) break;
    remaining -= appliedThisRound;
    activeEntries = activeEntries.filter(({ index, capacity }) => (
      Number(allocations.get(index) || 0) < Number(capacity || 0)
    ));
    guard += 1;
  }

  return allocations;
}

// Prices a pre-bundled deal using clearance-style cost protection. The admin
// supplies one bundle discount amount; that discount is distributed across
// the included kits without allowing any row to fall below its clearance
// cost ceiling.
export function getBundleDealPricing(rows = [], discountAmount = 0) {
  const normalizedRows = (rows || []).map((row, index) => {
    const kitId = row.kitId ?? row.id;
    const sellPrice = Math.max(0, Number(row.sellPrice ?? row.sell ?? row.refPrice ?? 0) || 0);
    const costPrice = Math.max(0, Number(row.costPrice ?? row.cost ?? 0) || 0);
    const costCeiling = Math.min(sellPrice, getDiscountFloor(costPrice));

    return {
      ...row,
      kitId,
      sellPrice,
      costPrice,
      costCeiling,
      discountCapacity: Math.max(0, sellPrice - costCeiling),
      _clearanceIndex: index
    };
  });

  const totalSell = normalizedRows.reduce((sum, row) => sum + row.sellPrice, 0);
  const totalCost = normalizedRows.reduce((sum, row) => sum + row.costPrice, 0);
  const totalDiscountCapacity = normalizedRows.reduce(
    (sum, row) => sum + Math.max(0, Math.round(Number(row.discountCapacity || 0))),
    0
  );
  const requestedDiscount = Math.min(
    Math.max(0, Math.round(Number(discountAmount) || 0)),
    totalDiscountCapacity,
    Math.round(totalSell)
  );
  const allocations = distributeIntegerDiscountByCapacity(
    normalizedRows.map((row, index) => ({
      index,
      capacity: Math.max(0, Math.round(Number(row.discountCapacity || 0)))
    })),
    requestedDiscount
  );
  const pricedRows = normalizedRows.map((row, index) => ({
    ...row,
    discount: Number(allocations.get(index) || 0),
    rawPrice: Math.max(row.costCeiling, row.sellPrice - Number(allocations.get(index) || 0))
  }));
  const targetTotal = pricedRows.reduce((sum, row) => sum + row.rawPrice, 0);
  const distributedRows = distributeRoundedBundlePrices(pricedRows, targetTotal);
  const bundlePrice = distributedRows.reduce((sum, row) => sum + row.finalPrice, 0);
  const appliedDiscount = Math.max(0, totalSell - bundlePrice);

  return {
    rows: distributedRows.map(row => ({
      ...row,
      discount: Math.max(0, row.sellPrice - row.finalPrice)
    })),
    totalSell,
    totalCost,
    bundlePrice,
    discountAmount: appliedDiscount,
    requestedDiscount,
    projectedProfit: bundlePrice - totalCost
  };
}

// A new bundle starts with the total discount ceiling of all included kits.
// This keeps the default discount within the same cost protection rule used by
// clearance pricing while still letting an admin type a smaller override.
export function getBundleDiscountCapacity(rows = []) {
  const pricedRows = getBundleDealPricing(rows, 0).rows;
  return Math.max(0, Math.round(pricedRows.reduce(
    (totalCapacity, row) => totalCapacity + Number(row.discountCapacity || 0),
    0
  )));
}

// Prices a clearance basket/deal one kit at a time. Every eligible kit gets
// its own clearance capacity (sell price minus its cost ceiling), unless an
// admin override is supplied for that kit. There is no shared discount pool:
// this keeps Deal Architect, product cards, basket, and checkout aligned.
export function getClearanceBundlePricing(rows = [], clearanceKitIds = [], discountOverrides = {}) {
  const clearanceIds = new Set((clearanceKitIds || []).map(id => String(id)));

  const pricedRows = (rows || []).map((row, index) => {
    const kitId = row.kitId ?? row.id;
    const normalizedKitId = String(kitId);
    const sellPrice = Math.max(0, Number(row.sellPrice ?? row.sell ?? row.refPrice ?? 0) || 0);
    const costPrice = Math.max(0, Number(row.costPrice ?? row.cost ?? 0) || 0);
    const isClearance = clearanceIds.has(normalizedKitId);
    const override = discountOverrides?.[kitId] ?? discountOverrides?.[normalizedKitId] ?? '';
    const clearancePrice = isClearance ? getClearancePrice(costPrice, sellPrice, override) : sellPrice;
    const clearanceDiscount = isClearance ? Math.max(0, sellPrice - clearancePrice) : 0;
    const costFloor = isClearance
      ? Math.min(sellPrice, getDiscountFloor(costPrice))
      : sellPrice;

    return {
      ...row,
      kitId,
      sellPrice,
      costPrice,
      isClearance,
      clearancePrice,
      clearanceDiscount,
      costFloor,
      appliedDiscount: clearanceDiscount,
      standardDiscount: 0,
      discountCapacity: isClearance ? Math.max(0, sellPrice - costFloor) : 0,
      rawPrice: clearancePrice,
      finalPrice: Math.max(0, Math.round(clearancePrice)),
      _clearanceIndex: index
    };
  });

  const bundlePrice = pricedRows.reduce((sum, row) => sum + row.finalPrice, 0);
  const totalSell = pricedRows.reduce((sum, row) => sum + row.sellPrice, 0);
  const totalCost = pricedRows.reduce((sum, row) => sum + row.costPrice, 0);
  const clearanceDiscountTotal = pricedRows.reduce((sum, row) => sum + row.clearanceDiscount, 0);

  return {
    rows: pricedRows.map(row => ({ ...row, discount: row.clearanceDiscount })),
    totalSell,
    totalCost,
    bundlePrice,
    clearanceDiscountTotal,
    standardDiscountTotal: 0,
    unusedClearanceDiscount: 0,
    discountAmount: Math.max(0, totalSell - bundlePrice),
    projectedProfit: bundlePrice - totalCost
  };
}
