export const getCheckoutPaymentFees = (data = {}) => {
  // Support both wrapped (props.shippingSettings) and direct (shippingSettings) structures
  const settings = data?.shippingSettings?.paymentSettings || data?.paymentSettings || {};

  const handlingFee = Number(settings.handlingFee || 0);
  const installmentFee = Number(settings.installmentFee || 0);
  const transferFee = Number(settings.transferFee || 0);

  return { handlingFee, installmentFee, transferFee };
};
