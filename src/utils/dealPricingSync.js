import {
  isStockInValidatedOrder,
  isStockAvailableForPurchase,
  isStockInAdminShelf
} from './stockOrderUtils.js';

/**
 * Finds all stocks of a kit that are eligible to have their sellPrice updated.
 * Stocks from legacy orders or orders with validated receipts (unless invalid)
 * MUST NOT be touched.
 * Only stocks that are available for purchase or in the admin shelf are included.
 *
 * @param {Object} params
 * @param {Object} params.stocks - Map of stocks { [stockKey]: stock }
 * @param {string} params.kitId - Parent kit ID
 * @param {Object} params.validatedOrderStockData - Output from getValidatedOrderStockSet(orders)
 * @param {Array} params.shelf - Shelf items array from store
 * @param {string} [params.excludeStockKey] - Optional stockKey of the stock currently being saved directly
 * @param {number} params.newSellPrice - New sell price to apply
 * @returns {{ updates: Object, shelfDocsToUpdate: Array }}
 */
export function getEligibleStocksForSellPriceUpdate({
  stocks = {},
  kitId,
  validatedOrderStockData = {},
  shelf = [],
  excludeStockKey = '',
  newSellPrice
}) {
  const updates = {};
  const shelfDocsToUpdate = [];
  const normalizedNewSellPrice = Math.max(0, Number(newSellPrice) || 0);

  if (!stocks || typeof stocks !== 'object' || !normalizedNewSellPrice) {
    return { updates, shelfDocsToUpdate };
  }

  for (const [key, stock] of Object.entries(stocks)) {
    if (!stock || key === excludeStockKey) continue;

    // 1. Safeguard: Stocks from legacy orders or orders with validated receipt MUST NOT BE TOUCHED
    if (isStockInValidatedOrder(stock, kitId, validatedOrderStockData, key)) {
      continue;
    }

    // 2. Eligibility: Must be available for purchase OR in admin shelf
    const isAvail = isStockAvailableForPurchase(stock);
    const isShelf = isStockInAdminShelf(stock, kitId, shelf, key);

    if (!isAvail && !isShelf) {
      continue;
    }

    // Qualified stock: update its sellPrice
    updates[key] = {
      ...stock,
      sellPrice: normalizedNewSellPrice
    };

    // If it is in the admin shelf, identify its shelf collection document
    if (isShelf) {
      const shelfItem = (shelf || []).find(item => (
        String(item?.id) === String(kitId) && String(item?.stockKey) === String(key)
      ));
      if (shelfItem && shelfItem.basketId) {
        shelfDocsToUpdate.push({
          basketId: shelfItem.basketId,
          stockKey: key,
          sellPrice: normalizedNewSellPrice
        });
      }
    }
  }

  return { updates, shelfDocsToUpdate };
}

/**
 * Checks if a kit is participating in a specific deal.
 *
 * @param {Object} deal
 * @param {string} kitId
 * @returns {boolean}
 */
export function isKitParticipatingInDeal(deal = {}, kitId = '') {
  if (!deal || !kitId) return false;
  const kitIdStr = String(kitId);

  return Boolean(
    (deal.kitIds || []).map(String).includes(kitIdStr)
    || (deal.clearanceKitIds || []).map(String).includes(kitIdStr)
    || (deal.flexiSourceKitIds || []).map(String).includes(kitIdStr)
    || (deal.kitDiscounts && Object.keys(deal.kitDiscounts).map(String).includes(kitIdStr))
    || (deal.clearanceDiscounts && Object.keys(deal.clearanceDiscounts).map(String).includes(kitIdStr))
    || (deal.clearanceKitSchedules && Object.keys(deal.clearanceKitSchedules).map(String).includes(kitIdStr))
  );
}

/**
 * Adjusts the discount amount, total sell, and per-kit discounts of all bundle deals,
 * flexi-bundles, and wild deals in which the kit is participating when a sell price
 * adjustment occurs.
 *
 * @param {Object} params
 * @param {Array} params.deals - All deals from store
 * @param {string} params.kitId - ID of the kit whose sell price changed
 * @param {number} params.priceDiff - Difference between newSellPrice and previousSellPrice
 * @param {Function} params.updateDeal - Function (dealId, patch) => Promise<void>
 * @returns {Promise<Array>} List of updated deal details
 */
export async function adjustParticipatingDealsOnSellPriceChange({
  deals = [],
  kitId,
  priceDiff,
  updateDeal
}) {
  if (!kitId || !priceDiff || !Number.isFinite(priceDiff) || !Array.isArray(deals) || typeof updateDeal !== 'function') {
    return [];
  }

  const kitIdStr = String(kitId);
  const updatedDeals = [];

  for (const deal of deals) {
    if (!deal || !deal.id) continue;

    // Mutually exclusive deals have no discountAmount or package bundle price
    if (deal.type === 'mutually_exclusive') continue;

    if (!isKitParticipatingInDeal(deal, kitIdStr)) continue;

    const currentDiscountAmount = Number(deal.discountAmount || 0);
    const newDiscountAmount = Math.max(0, currentDiscountAmount + priceDiff);

    const currentTotalSell = Number(deal.totalSell || 0);
    const newTotalSell = Math.max(0, currentTotalSell + priceDiff);

    const patch = {
      discountAmount: newDiscountAmount,
      totalSell: newTotalSell
    };

    // For Flexi-Bundles or Wild Deals with clearanceDiscounts:
    // Adjust the per-kit clearance discount so the final clearance price is preserved
    if (deal.clearanceDiscounts && typeof deal.clearanceDiscounts === 'object') {
      const currentKitDiscount = Number(deal.clearanceDiscounts[kitIdStr] || 0);
      const newKitDiscount = Math.max(0, currentKitDiscount + priceDiff);
      patch.clearanceDiscounts = {
        ...deal.clearanceDiscounts,
        [kitIdStr]: newKitDiscount
      };
    }

    // For deals storing per-kit breakdown in kitDiscounts:
    if (deal.kitDiscounts && typeof deal.kitDiscounts === 'object' && deal.kitDiscounts[kitIdStr]) {
      const currentKd = deal.kitDiscounts[kitIdStr];
      const newKdDiscount = Math.max(0, Number(currentKd.discount || 0) + priceDiff);
      const currentSell = Number(currentKd.sellPrice || 0);
      const nextSell = currentSell > 0 ? Math.max(0, currentSell + priceDiff) : newKdDiscount;

      patch.kitDiscounts = {
        ...deal.kitDiscounts,
        [kitIdStr]: {
          ...currentKd,
          sellPrice: nextSell,
          discount: newKdDiscount,
          clearancePrice: Math.max(0, nextSell - newKdDiscount),
          finalPrice: Math.max(0, nextSell - newKdDiscount)
        }
      };
    }

    try {
      await updateDeal(deal.id, patch);
      updatedDeals.push({ dealId: deal.id, patch });
    } catch (err) {
      console.error(`SG LOG: Failed to adjust deal ${deal.id} on sell price change:`, err);
    }
  }

  return updatedDeals;
}
