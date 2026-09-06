const hasOrderAssociation = (stock) => {
  const order = stock?.order;
  if (!order) return false;
  if (typeof order !== 'object') return Boolean(order);
  return Boolean(order.orderId || order.orderDocId || order.id || Object.keys(order).length > 0);
};

const matchesSource = (stock, source = 'onhand') => {
  const status = String(stock?.status || '').toLowerCase().trim();
  const isPreOrder = status.includes('pre') || status.includes('batch') || status.includes('eta');
  return source === 'preorder'
    ? isPreOrder
    : status === 'onhand' || status === 'on hand';
};

const getAvailableStocks = (kit, source) => Object.values(kit?.stocks || {})
  .filter((stock) => !hasOrderAssociation(stock) && matchesSource(stock, source));

const getNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export const getBundleDisplayTotals = (deal, kits = [], isAdminView = false) => {
  const includedKits = (deal?.kitIds || [])
    .map((kitId) => (kits || []).find((kit) => String(kit?.id) === String(kitId)))
    .filter(Boolean);
  const source = deal?.stockSource || 'onhand';

  const rows = includedKits.map((kit) => {
    const stocks = getAvailableStocks(kit, source);
    const adminShelfStock = stocks.find((stock) => stock?.reservationType === 'admin');
    const allocatableStocks = stocks.filter((stock) => !stock?.isReserved);
    const cheapestAllocatableStock = [...allocatableStocks]
      .sort((a, b) => getNumber(a?.costPrice) - getNumber(b?.costPrice))[0];
    const adminCostStock = adminShelfStock || cheapestAllocatableStock || stocks[0];
    const publicSellStock = stocks
      .filter((stock) => !stock?.isReserved)
      .sort((a, b) => getNumber(b?.sellPrice) - getNumber(a?.sellPrice))[0] || stocks[0];

    return {
      costPrice: getNumber(adminCostStock?.costPrice ?? kit?.costPrice),
      sellPrice: getNumber(publicSellStock?.sellPrice ?? kit?.sellPrice)
    };
  });

  const fallbackSellTotal = rows.reduce((total, row) => total + row.sellPrice, 0);
  const discountedPrice = getNumber(
    deal?.bundlePrice
      ?? (getNumber(deal?.totalSell) - getNumber(deal?.discountAmount))
  );

  return {
    discountedPrice: Math.max(0, discountedPrice),
    sellTotal: Math.max(0, fallbackSellTotal || getNumber(deal?.totalSell)),
    costTotal: Math.max(0, rows.reduce((total, row) => total + row.costPrice, 0))
  };
};
