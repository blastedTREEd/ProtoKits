export const OFFER_CHECKOUT_WINDOW_MS = 12 * 60 * 60 * 1000;

export const valueToMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds) return Number(value.seconds) * 1000;
  if (typeof value === 'number') return value;
  return new Date(value).getTime() || 0;
};

export const getOfferExpiryMillis = (offer) => valueToMillis(offer?.offerExpiresAt);

export const isOfferCheckoutActive = (offer, now = Date.now()) => (
  Boolean(offer?.offerId || offer?.id)
  && String(offer?.offerStatus || (offer?.offerId ? 'released' : offer?.status) || 'released').toLowerCase() === 'released'
  && getOfferExpiryMillis(offer) > now
);

export const formatOfferCountdown = (expiry, now = Date.now()) => {
  const remaining = valueToMillis(expiry) - now;
  if (remaining <= 0) return 'EXPIRED';

  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
  return `${String(hours).padStart(2, '0')}H ${String(minutes).padStart(2, '0')}M ${String(seconds).padStart(2, '0')}S`;
};
