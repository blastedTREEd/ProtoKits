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
export function getClearanceCostCeiling(costPrice = 0) {
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
    const costFloor = Math.min(sell, getClearanceCostCeiling(cost));
    return Math.max(costFloor, Math.round(sell - Math.max(0, Number(discountOverride) || 0)));
  }

  return Math.min(sell, getClearanceCostCeiling(cost));
}

function distributeDiscountByCapacity(rows = [], discountTotal = 0) {
  const allocations = new Map(rows.map(row => [row.kitId, 0]));
  let remaining = Math.max(0, Number(discountTotal) || 0);
  const eligibleRows = rows
    .filter(row => Number(row.discountCapacity || 0) > 0)
    .sort((a, b) => {
      const capacityDelta = Number(a.discountCapacity || 0) - Number(b.discountCapacity || 0);
      return capacityDelta || Number(a._clearanceIndex || 0) - Number(b._clearanceIndex || 0);
    });

  // Fill the most capacity-constrained item first. Once it reaches its
  // ceiling, only the remaining clearance discount is shared proportionally
  // by the other selected on-hand items.
  const firstRow = eligibleRows[0];
  if (firstRow) {
    const firstCapacity = Math.max(0, Number(firstRow.discountCapacity || 0));
    const firstAllocation = Math.min(remaining, firstCapacity);
    allocations.set(firstRow.kitId, firstAllocation);
    remaining -= firstAllocation;
  }

  let distributableRows = eligibleRows.slice(1);

  while (remaining > 0 && distributableRows.length > 0) {
    const capacityTotal = distributableRows.reduce((sum, row) => {
      const capacity = Number(row.discountCapacity || 0);
      return sum + Math.max(0, capacity - Number(allocations.get(row.kitId) || 0));
    }, 0);
    if (capacityTotal <= 0) break;

    let cappedAny = false;
    distributableRows.forEach(row => {
      const capacity = Number(row.discountCapacity || 0);
      const allocated = Number(allocations.get(row.kitId) || 0);
      const remainingCapacity = Math.max(0, capacity - allocated);
      const share = remaining * (remainingCapacity / capacityTotal);
      const applied = Math.min(remainingCapacity, share);
      allocations.set(row.kitId, allocated + applied);
      if (applied >= remainingCapacity) {
        cappedAny = true;
      }
    });

    const allocated = distributableRows.reduce((sum, row) => sum + Number(allocations.get(row.kitId) || 0), 0);
    const firstAllocation = firstRow ? Number(allocations.get(firstRow.kitId) || 0) : 0;
    remaining = Math.max(0, Number(discountTotal) - firstAllocation - allocated);
    if (!cappedAny) break;
    distributableRows = distributableRows.filter(row => Number(allocations.get(row.kitId) || 0) < Number(row.discountCapacity || 0));
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
    const costCeiling = Math.min(sellPrice, getClearanceCostCeiling(costPrice));

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
  const requestedDiscount = Math.min(Math.max(Number(discountAmount) || 0, 0), totalSell);
  const allocations = distributeDiscountByCapacity(normalizedRows, requestedDiscount);
  const pricedRows = normalizedRows.map(row => ({
    ...row,
    discount: Number(allocations.get(row.kitId) || 0),
    rawPrice: Math.max(row.costCeiling, row.sellPrice - Number(allocations.get(row.kitId) || 0))
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

// Prices a clearance basket. The selected clearance kit's discount is the
// difference between its sell price and clearance price. That discount pool
// is distributed across the other selected on-hand kits according to each
// kit's remaining cost-ceiling capacity, never below its cost ceiling.
export function getClearanceBundlePricing(rows = [], clearanceKitIds = [], discountOverrides = {}, options = {}) {
  const clearanceIds = new Set(clearanceKitIds || []);
  const initiallyNormalizedRows = rows.map((row, index) => {
    const kitId = row.kitId ?? row.id;
    const sellPrice = Math.max(0, Number(row.sellPrice ?? row.sell ?? 0) || 0);
    const costPrice = Math.max(0, Number(row.costPrice ?? row.cost ?? 0) || 0);
    const isClearance = clearanceIds.has(kitId);
    const override = discountOverrides?.[kitId] ?? '';
    const clearancePrice = isClearance ? getClearancePrice(costPrice, sellPrice, override) : sellPrice;
    const clearanceDiscount = isClearance ? Math.max(0, sellPrice - clearancePrice) : 0;
    const standardCostCeiling = costPrice > 0 ? Math.ceil(costPrice / 100) * 100 : 0;
    const standardDiscountCapacity = isClearance
      ? 0
      : Math.max(0, sellPrice - Math.min(sellPrice, standardCostCeiling));

    return {
      ...row,
      kitId,
      sellPrice,
      costPrice,
      isClearance,
      clearancePrice,
      clearanceDiscount,
      standardCostCeiling,
      discountCapacity: standardDiscountCapacity,
      _clearanceIndex: index
    };
  });

  // A checkout may contain more than one clearance kit (for example, items
  // carried over from separate clearance deals). Only the kit with the
  // highest actual clearance discount supplies the single discount pool.
  // Every other selected row becomes a normal row eligible to receive a
  // proportional share of that winning pool.
  const winningClearanceRow = initiallyNormalizedRows
    .filter(row => row.isClearance && row.clearanceDiscount > 0)
    .sort((a, b) => (
      b.clearanceDiscount - a.clearanceDiscount
      || b.sellPrice - a.sellPrice
      || a._clearanceIndex - b._clearanceIndex
    ))[0];
  const winningClearanceIds = winningClearanceRow
    ? new Set([winningClearanceRow.kitId])
    : new Set();
  const normalizedRows = initiallyNormalizedRows.map(row => {
    const isWinningClearance = winningClearanceIds.has(row.kitId);
    const standardCostCeiling = row.costPrice > 0 ? Math.ceil(row.costPrice / 100) * 100 : 0;
    return {
      ...row,
      isClearance: isWinningClearance,
      clearancePrice: isWinningClearance ? row.clearancePrice : row.sellPrice,
      clearanceDiscount: isWinningClearance ? row.clearanceDiscount : 0,
      discountCapacity: isWinningClearance
        ? 0
        : Math.max(0, row.sellPrice - Math.min(row.sellPrice, standardCostCeiling))
    };
  });

  const clearanceDiscountTotal = normalizedRows.reduce((sum, row) => sum + row.clearanceDiscount, 0);
  // The winning clearance kit supplies one discount pool. Allocate that pool
  // once across every selected row; do not apply the full pool to the
  // clearance row and then distribute it again to the other rows.
  const allocationRows = normalizedRows.map(row => {
    const costFloor = row.isClearance
      ? Math.min(row.sellPrice, getClearanceCostCeiling(row.costPrice))
      : Math.min(row.sellPrice, row.standardCostCeiling);
    return {
      ...row,
      costFloor,
      discountCapacity: Math.max(0, row.sellPrice - costFloor)
    };
  });
  const discountAllocations = distributeDiscountByCapacity(allocationRows, clearanceDiscountTotal);
  const pricedRows = allocationRows.map(row => {
    const appliedDiscount = Number(discountAllocations.get(row.kitId) || 0);
    return {
      ...row,
      appliedDiscount,
      standardDiscount: row.isClearance ? 0 : appliedDiscount,
      rawPrice: Math.max(row.costFloor, row.sellPrice - appliedDiscount)
    };
  });

  const targetTotal = pricedRows.reduce((sum, row) => sum + row.rawPrice, 0);
  const distributedRows = distributeRoundedBundlePrices(pricedRows, targetTotal);
  const bundlePrice = distributedRows.reduce((sum, row) => sum + row.finalPrice, 0);
  const totalSell = normalizedRows.reduce((sum, row) => sum + row.sellPrice, 0);
  const totalCost = normalizedRows.reduce((sum, row) => sum + row.costPrice, 0);
  const standardDiscountTotal = pricedRows.reduce((sum, row) => sum + (row.standardDiscount || 0), 0);
  const appliedDiscountTotal = Math.max(0, totalSell - bundlePrice);

  return {
    rows: distributedRows.map(row => ({
      ...row,
      discount: Math.max(0, row.sellPrice - row.finalPrice)
    })),
    totalSell,
    totalCost,
    bundlePrice,
    clearanceDiscountTotal,
    standardDiscountTotal,
    unusedClearanceDiscount: Math.max(0, clearanceDiscountTotal - appliedDiscountTotal),
    discountAmount: appliedDiscountTotal,
    projectedProfit: bundlePrice - totalCost
  };
}
