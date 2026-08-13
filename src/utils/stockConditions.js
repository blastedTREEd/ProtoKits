export const PRE_ORDER_BOX_CONDITION = 'BASED ON SHIPMENT';
export const PRE_ORDER_KIT_CONDITION = 'BRAND NEW';
export const ONHAND_BOX_CONDITION = 'NO BOX';
export const ONHAND_KIT_CONDITION = 'BUILT';
export const BANDAI_HG_144_BOX_CONDITION = 'BRAND NEW';
export const BANDAI_HG_144_KIT_CONDITION = 'SEALED';

export const isPreOrderStatus = (status) => {
  const normalizedStatus = String(status || '').toLowerCase().replace(/[\s_]+/g, '-');
  return normalizedStatus === 'pre-order' || normalizedStatus === 'preorder' || normalizedStatus === 'batch';
};

export const withPreOrderConditionDefaults = (stock = {}) => {
  if (!isPreOrderStatus(stock.status)) return stock;

  return {
    ...stock,
    boxCondition: stock.boxCondition || PRE_ORDER_BOX_CONDITION,
    kitCondition: stock.kitCondition || PRE_ORDER_KIT_CONDITION
  };
};

const isOnhandStatus = (status) => String(status || '').toLowerCase().trim() === 'onhand';
const normalizeCondition = (value) => String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
const normalizeMatchValue = (value) => normalizeCondition(value).replace(/\s*\/\s*/g, '/');

const getConditionValues = (stock = {}) => {
  const legacyConditions = Array.isArray(stock.condition) ? stock.condition : [];
  return {
    boxCondition: stock.boxCondition || legacyConditions[0] || (typeof stock.condition === 'string' ? stock.condition : ''),
    kitCondition: stock.kitCondition || legacyConditions[1] || ''
  };
};

export const withOnhandConditionDefaults = (stock = {}) => {
  if (!isOnhandStatus(stock.status)) return stock;

  const { boxCondition, kitCondition } = getConditionValues(stock);
  const nextStock = { ...stock };

  if (normalizeCondition(kitCondition).includes('built')) {
    nextStock.boxCondition = ONHAND_BOX_CONDITION;
  } else if (!normalizeCondition(kitCondition) && normalizeCondition(boxCondition) === 'no box') {
    nextStock.kitCondition = ONHAND_KIT_CONDITION;
  }

  return nextStock;
};

export const withInventoryConditionDefaults = (stock = {}, kit = {}) => {
  const nextStock = withStockConditionDefaults(stock);
  if (!isOnhandStatus(stock.status)) return nextStock;

  const { boxCondition, kitCondition } = getConditionValues(stock);
  const isBandaiHg144 = (
    ['bandai', 'premium bandai'].includes(normalizeMatchValue(kit.brand))
    && normalizeMatchValue(kit.specs?.line) === 'hg'
    && normalizeMatchValue(kit.specs?.scale) === '1/144'
  );

  if (isBandaiHg144 && !normalizeCondition(boxCondition) && !normalizeCondition(kitCondition)) {
    return {
      ...nextStock,
      boxCondition: BANDAI_HG_144_BOX_CONDITION,
      kitCondition: BANDAI_HG_144_KIT_CONDITION
    };
  }

  return nextStock;
};

export const withStockConditionDefaults = (stock = {}) => (
  withOnhandConditionDefaults(withPreOrderConditionDefaults(stock))
);
