export const notificationValueToMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value === 'object' && typeof value.seconds === 'number') return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const getNotificationActivityTime = (order) => (
  notificationValueToMillis(order?.lastUpdated) || notificationValueToMillis(order?.createdAt)
);

export const getNotificationVersion = (order) => (
  order?.notificationVersion
  || `${getNotificationActivityTime(order)}:${String(order?.status || '').trim().toLowerCase()}`
);
