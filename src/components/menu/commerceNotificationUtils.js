import { notificationValueToMillis } from './notificationUtils.js';
import { isWildSaleDeal } from '../../utils/dealTypes.js';

export const getAvailableStockEntries = (kit) => (
  Object.entries(kit?.stocks || {}).filter(([, stock]) => !stock?.order?.orderId && !stock?.isReserved)
);

const parseLocalDealDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value !== 'string') {
    const milliseconds = notificationValueToMillis(value);
    return milliseconds ? new Date(milliseconds) : null;
  }

  const [datePart, timePart = '00:00'] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  if (![year, month, day, hours, minutes].every(Number.isFinite)) return null;
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

const isSameLocalDay = (left, right) => (
  left.getFullYear() === right.getFullYear()
  && left.getMonth() === right.getMonth()
  && left.getDate() === right.getDate()
);

const stockMatchesDealSource = (stock, source = 'onhand') => {
  const status = String(stock?.status || '').toLowerCase();
  const isPreOrder = status.includes('pre') || status.includes('batch');
  return source === 'preorder' ? isPreOrder : !isPreOrder;
};

const isBundlePurchasableStock = (stock, source) => (
  Boolean(stock)
  && !stock.order?.orderId
  && stockMatchesDealSource(stock, source)
  && (!stock.isReserved || stock.reservationType === 'admin')
);

const formatWildSaleCountdown = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
};

export const isActiveHunt = (hunt, now = Date.now()) => {
  const status = String(hunt?.status || 'pending').toLowerCase();
  if (['released', 'declined'].includes(status)) return false;
  const expiresAt = notificationValueToMillis(hunt?.expiresAt);
  return !expiresAt || expiresAt > now;
};

export const buildCommerceNotifications = ({
  kits = [],
  deals = [],
  basket = [],
  hunts = [],
  outOfStockKitIds = {},
  now = Date.now()
}) => {
  const kitMap = new Map(kits.map((kit) => [kit.id, kit]));
  const basketKitIds = [...new Set(
    basket.map((item) => String(item?.id || '')).filter(Boolean)
  )];
  const basketKitIdSet = new Set(basketKitIds);
  const releasedHunts = hunts.filter((hunt) => (
    String(hunt?.status || '').trim().toLowerCase() === 'released'
    && !hunt?.completedAt
    && (!notificationValueToMillis(hunt?.offerExpiresAt) || notificationValueToMillis(hunt.offerExpiresAt) > now)
  ));
  const missedOffers = hunts.filter((hunt) => {
    const expiresAt = notificationValueToMillis(hunt?.offerExpiresAt);
    return String(hunt?.status || '').trim().toLowerCase() === 'released'
      && !hunt?.completedAt
      && expiresAt > 0
      && expiresAt <= now;
  });
  const releasedKitIds = new Set(releasedHunts.map((hunt) => hunt?.kitId).filter(Boolean));
  // Inventory alerts are only meaningful for kits currently in the basket.
  // Active offer hunts may still watch a kit, but they must not create a
  // last-stock or back-in-stock alert after the basket item is removed.
  const watchedKitIds = new Set(basketKitIds);
  const notifications = [];

  missedOffers.forEach((offer) => {
    const kit = kitMap.get(offer.kitId);
    const expiry = offer.offerExpiresAt || offer.updatedAt || now;
    notifications.push({
      id: `offer-missed:${offer.id}`,
      notificationKind: 'offer_missed',
      notificationVersion: `offer-missed:${offer.id}:${notificationValueToMillis(expiry)}`,
      notificationLabel: 'Missed checkout',
      title: 'Offer expired',
      message: `Your accepted offer for ${offer.kitName || kit?.name || 'this kit'} expired before checkout.`,
      kitId: offer.kitId,
      lastUpdated: expiry
    });
  });

  releasedHunts.forEach((hunt) => {
    const kit = kitMap.get(hunt.kitId);
    const activityTime = hunt.releasedAt || hunt.updatedAt || hunt.createdAt || now;
    notifications.push({
      id: `offer-released:${hunt.id}`,
      notificationKind: 'offer_released',
      notificationVersion: `offer-released:${hunt.id}:${Number(hunt.targetPrice || 0)}:${notificationValueToMillis(activityTime)}`,
      notificationLabel: 'Offer accepted',
      title: 'Item released',
      message: `${hunt.kitName || kit?.name || 'Your requested item'} was released for ₱${Number(hunt.targetPrice || 0).toLocaleString('en-PH')}.`,
      summary: hunt.kitName || kit?.name || '',
      kitId: hunt.kitId,
      lastUpdated: activityTime
    });
  });

  basketKitIds.forEach((kitId) => {
    const kit = kitMap.get(kitId);
    const availableStocks = getAvailableStockEntries(kit);
    if (!kit || availableStocks.length !== 1) return;

    const [stockKey, stock] = availableStocks[0];
    const activityTime = stock?.lastUpdated || kit.lastUpdated || basket.find((item) => item?.id === kitId)?.createdAt || now;
    notifications.push({
      id: `inventory-low:${kitId}`,
      notificationKind: 'low_stock',
      notificationVersion: `low-stock:${kitId}:${stockKey}:${notificationValueToMillis(activityTime)}`,
      notificationLabel: 'Last stock',
      title: 'Only one left',
      message: `${kit.name || 'An item in your basket'} has only one available stock left.`,
      kitId,
      lastUpdated: activityTime
    });
  });

  deals.forEach((deal) => {
    const isBundleDeal = deal?.type === 'bundle_only' || deal?.type === 'bundle_discount';
    if (!isBundleDeal || deal.isActive === false) return;

    const validUntil = parseLocalDealDate(deal.validUntil);
    const nowDate = new Date(now);
    if (!validUntil || validUntil.getTime() <= now || !isSameLocalDay(validUntil, nowDate)) return;

    const matchingKitId = (deal.kitIds || []).find((kitId) => basketKitIds.includes(kitId));
    if (!matchingKitId) return;

    const isFulfillable = (deal.kitIds || []).every((kitId) => {
      const kit = kitMap.get(kitId);
      return Object.values(kit?.stocks || {}).some((stock) => (
        isBundlePurchasableStock(stock, deal.stockSource || 'onhand')
      ));
    });
    if (!isFulfillable) return;

    const matchingKit = kitMap.get(matchingKitId);
    notifications.push({
      id: `bundle-ending:${deal.id}`,
      notificationKind: 'bundle_ending',
      notificationVersion: `bundle-ending:${deal.id}:${deal.validUntil}`,
      notificationLabel: 'Ends today',
      title: 'HURRY!',
      message: `${matchingKit?.name || 'An item in your basket'} is included in ${deal.name || 'a bundle deal'} ending today.`,
      summary: deal.name || '',
      kitId: matchingKitId,
      dealId: deal.id,
      lastUpdated: deal.lastUpdated || validUntil
    });
  });

  // Wild Deal notifications are only emitted for eligible kits currently in
  // the user's cart, and only after each kit's scheduled start time.
  deals.forEach((deal) => {
    if (!isWildSaleDeal(deal) || deal.isActive === false) return;

    const eligibleKitIds = deal.clearanceKitIds?.length
      ? deal.clearanceKitIds
      : (deal.kitIds || []);

    eligibleKitIds.forEach((kitId) => {
      const normalizedKitId = String(kitId || '');
      if (!basketKitIdSet.has(normalizedKitId)) return;

      const schedule = deal.clearanceKitSchedules?.[String(kitId)] || deal.clearanceKitSchedules?.[kitId];
      const validFrom = parseLocalDealDate(schedule?.validFrom);
      const validUntil = parseLocalDealDate(schedule?.validUntil, true);
      if (!validFrom || !validUntil || now < validFrom.getTime() || now >= validUntil.getTime()) return;

      const kit = kitMap.get(kitId);
      const remaining = validUntil.getTime() - now;
      notifications.push({
        id: `wild-sale:${deal.id}:${kitId}`,
        notificationKind: 'wild_sale',
        notificationVersion: `wild-sale:${deal.id}:${kitId}:live:${validFrom.getTime()}:${validUntil.getTime()}`,
        notificationLabel: 'Wild Deal live',
        title: 'WILD DEAL IS LIVE!',
        message: `${kit?.name || 'A Wild Deal item'} is live now and ends in ${formatWildSaleCountdown(remaining)}.`,
        summary: kit?.name || 'Wild Deal',
        kitId,
        dealId: deal.id,
        lastUpdated: isLive ? validFrom : validFrom
      });
    });
  });

  watchedKitIds.forEach((kitId) => {
    if (releasedKitIds.has(kitId)) return;
    if (!outOfStockKitIds[kitId]) return;
    const kit = kitMap.get(kitId);
    const availableStocks = getAvailableStockEntries(kit);
    if (!kit || availableStocks.length === 0) return;

    const stockSignature = availableStocks.map(([stockKey]) => stockKey).sort().join(',');
    const activityTime = kit.lastUpdated || availableStocks[0]?.[1]?.lastUpdated || now;
    notifications.push({
      id: `inventory-restocked:${kitId}`,
      notificationKind: 'back_in_stock',
      notificationVersion: `back-in-stock:${kitId}:${stockSignature}:${notificationValueToMillis(activityTime)}`,
      notificationLabel: 'Back in stock',
      title: 'Back in stock',
      message: `${kit.name || 'An item you wanted'} is available again.`,
      kitId,
      lastUpdated: activityTime
    });
  });

  return notifications;
};
