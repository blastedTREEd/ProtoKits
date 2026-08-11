import { notificationValueToMillis } from './notificationUtils.js';

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
  const basketKitIds = [...new Set(basket.map((item) => item?.id).filter(Boolean))];
  const activeHunts = hunts.filter((hunt) => isActiveHunt(hunt, now));
  const watchedKitIds = new Set([
    ...basketKitIds,
    ...activeHunts.map((hunt) => hunt?.kitId).filter(Boolean)
  ]);
  const notifications = [];

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
      summary: kit.name || '',
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
      title: 'Bundle deal ends today',
      message: `${matchingKit?.name || 'An item in your basket'} is included in ${deal.name || 'a bundle deal'} ending today.`,
      summary: deal.name || '',
      kitId: matchingKitId,
      dealId: deal.id,
      lastUpdated: deal.lastUpdated || validUntil
    });
  });

  watchedKitIds.forEach((kitId) => {
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
      summary: `${availableStocks.length} available`,
      kitId,
      lastUpdated: activityTime
    });
  });

  return notifications;
};
