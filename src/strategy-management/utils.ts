import {
  BigNumber,
  BigNumberish,
  Decimal,
  formatUnits,
  parseUnits,
  tenPow,
} from '../utils/numerics';
import {
  DecodedOrder,
  DecodedStrategy,
  EncodedStrategy,
  Strategy,
} from '../common/types';
import { Logger } from '../common/logger';
import {
  calculateRequiredLiquidity,
  decodeOrder,
  encodeOrders,
  lowestPossibleRate,
} from '../utils/encoders';
import { Decimals } from '../utils/decimals';
import { encodedStrategyBNToStr } from '../utils';

const logger = new Logger('utils.ts');

export function normalizeRate(
  amount: BigNumberish,
  amountTokenDecimals: number,
  otherTokenDecimals: number
) {
  return new Decimal(amount.toString())
    .times(tenPow(amountTokenDecimals, otherTokenDecimals))
    .toFixed();
}

export function normalizeInvertedRate(
  amount: BigNumberish,
  amountTokenDecimals: number,
  otherTokenDecimals: number
) {
  if (+amount.toString() === 0) return '0';

  return new Decimal(1)
    .div(amount.toString())
    .times(tenPow(otherTokenDecimals, amountTokenDecimals))
    .toFixed();
}

export const encodeStrategy = (
  strategy: DecodedStrategy
): Omit<EncodedStrategy, 'id'> => {
  const [order0, order1] = encodeOrders([strategy.order0, strategy.order1]);
  return {
    token0: strategy.token0,
    token1: strategy.token1,
    order0,
    order1,
  };
};

export const decodeStrategy = (
  strategy: EncodedStrategy
): DecodedStrategy & { id: BigNumber; encoded: EncodedStrategy } => {
  return {
    id: strategy.id,
    token0: strategy.token0,
    token1: strategy.token1,
    order0: decodeOrder(strategy.order0),
    order1: decodeOrder(strategy.order1),
    encoded: strategy,
  };
};

/**
 * Converts a DecodedStrategy object to a Strategy object.
 *
 * @param {DecodedStrategy} strategy - The DecodedStrategy object to convert.
 * @returns {Promise<Strategy>} - A promise that resolves to the Strategy object.
 * @throws {Error} If an error occurs while fetching the decimals for the tokens.
 */
export async function parseStrategy(
  strategy: DecodedStrategy & { id: BigNumber; encoded: EncodedStrategy },
  decimals: Decimals
): Promise<Strategy> {
  logger.debug('parseStrategy called', arguments);
  const { id, token0, token1, order0, order1, encoded } = strategy;
  const decimals0 = await decimals.fetchDecimals(token0);
  const decimals1 = await decimals.fetchDecimals(token1);
  const buyPriceLow = normalizeRate(order1.lowestRate, decimals0, decimals1);
  const buyPriceMarginal = normalizeRate(
    order1.marginalRate,
    decimals0,
    decimals1
  );
  const buyPriceHigh = normalizeRate(order1.highestRate, decimals0, decimals1);
  const sellPriceLow = normalizeInvertedRate(
    order0.highestRate,
    decimals1,
    decimals0
  );
  const sellPriceMarginal = normalizeInvertedRate(
    order0.marginalRate,
    decimals1,
    decimals0
  );
  const sellPriceHigh = normalizeInvertedRate(
    order0.lowestRate,
    decimals1,
    decimals0
  );
  const sellBudget = formatUnits(order0.liquidity, decimals0);
  const buyBudget = formatUnits(order1.liquidity, decimals1);

  const strId = id.toString();
  const strEncoded = encodedStrategyBNToStr(encoded);
  logger.debug('parseStrategy info:', {
    id: strId,
    token0,
    token1,
    order0,
    order1,
    decimals0,
    decimals1,
    baseToken: token0,
    quoteToken: token1,
    buyPriceLow,
    buyPriceMarginal,
    buyPriceHigh,
    buyBudget,
    sellPriceLow,
    sellPriceMarginal,
    sellPriceHigh,
    sellBudget,
    encoded: strEncoded,
  });

  return {
    id: strId,
    baseToken: token0,
    quoteToken: token1,
    buyPriceLow,
    buyPriceMarginal,
    buyPriceHigh,
    buyBudget,
    sellPriceLow,
    sellPriceMarginal,
    sellPriceHigh,
    sellBudget,
    encoded: strEncoded,
  };
}

export function buildStrategyObject(
  baseToken: string,
  quoteToken: string,
  baseDecimals: number,
  quoteDecimals: number,
  buyPriceLow: string, // in quote tkn per 1 base tkn
  buyPriceMarginal: string, // in quote tkn per 1 base tkn
  buyPriceHigh: string, // in quote tkn per 1 base tkn
  buyBudget: string, // in quote tkn
  sellPriceLow: string, // in quote tkn per 1 base tkn
  sellPriceMarginal: string, // in quote tkn per 1 base tkn
  sellPriceHigh: string, // in quote tkn per 1 base tkn
  sellBudget: string // in base tkn
): DecodedStrategy {
  logger.debug('buildStrategyObject called', arguments);
  if (
    new Decimal(buyPriceLow).isNegative() ||
    new Decimal(buyPriceMarginal).isNegative() ||
    new Decimal(buyPriceHigh).isNegative() ||
    new Decimal(sellPriceLow).isNegative() ||
    new Decimal(sellPriceMarginal).isNegative() ||
    new Decimal(sellPriceHigh).isNegative()
  ) {
    throw new Error('prices cannot be negative');
  }
  if (
    new Decimal(buyPriceLow).gt(buyPriceMarginal) ||
    new Decimal(buyPriceLow).gt(buyPriceHigh) ||
    new Decimal(buyPriceMarginal).gt(buyPriceHigh) ||
    new Decimal(sellPriceLow).gt(sellPriceMarginal) ||
    new Decimal(sellPriceLow).gt(sellPriceHigh) ||
    new Decimal(sellPriceMarginal).gt(sellPriceHigh)
  ) {
    throw new Error(
      'low/marginal price must be lower than or equal to marginal/high price'
    );
  }
  if (
    new Decimal(buyBudget).isNegative() ||
    new Decimal(sellBudget).isNegative()
  ) {
    throw new Error('budgets cannot be negative');
  }

  const { order0, order1 } = createOrders(
    baseDecimals,
    quoteDecimals,
    buyPriceLow,
    buyPriceMarginal,
    buyPriceHigh,
    buyBudget,
    sellPriceLow,
    sellPriceMarginal,
    sellPriceHigh,
    sellBudget
  );

  logger.debug('buildStrategyObject info:', {
    token0: baseToken,
    token1: quoteToken,
    order0,
    order1,
  });

  return {
    token0: baseToken,
    token1: quoteToken,
    order0,
    order1,
  };
}

export function createFromBuyOrder(
  baseTokenDecimals: number,
  quoteTokenDecimals: number,
  buyPriceLow: string,
  buyPriceMarginal: string,
  buyPriceHigh: string,
  buyBudget: string
): DecodedOrder {
  logger.debug('createFromBuyOrder called', arguments);

  // convert quote token liquidity (budget) to wei
  const liquidity = parseUnits(buyBudget, quoteTokenDecimals);

  /* this order sells quote token so the rates are quote token per 1 base token.
  Converting to wei in order to factor out different decimals */
  const lowestRate = normalizeRate(
    buyPriceLow,
    quoteTokenDecimals,
    baseTokenDecimals
  );
  const marginalRate = normalizeRate(
    buyPriceMarginal,
    quoteTokenDecimals,
    baseTokenDecimals
  );
  const highestRate = normalizeRate(
    buyPriceHigh,
    quoteTokenDecimals,
    baseTokenDecimals
  );

  const order: DecodedOrder = {
    liquidity: liquidity.toString(),
    lowestRate: lowestRate,
    highestRate: highestRate,
    marginalRate: marginalRate,
  };
  logger.debug('createFromBuyOrder info:', { order });
  return order;
}

export function createFromSellOrder(
  baseTokenDecimals: number,
  quoteTokenDecimals: number,
  sellPriceLow: string,
  sellPriceMarginal: string,
  sellPriceHigh: string,
  sellBudget: string
): DecodedOrder {
  logger.debug('createFromSellOrder called', arguments);
  // order 0 is selling the base token
  // convert base token liquidity (budget) to wei
  const liquidity = parseUnits(sellBudget, baseTokenDecimals);

  /* this order sells base token so the rates are base token per 1 quote token,
  meaning we need to do 1 over - and then low rate is 1/high price.
  Converting to wei in order to factor out different decimals */
  const lowestRate = normalizeInvertedRate(
    sellPriceHigh,
    quoteTokenDecimals,
    baseTokenDecimals
  );

  const marginalRate = normalizeInvertedRate(
    sellPriceMarginal,
    quoteTokenDecimals,
    baseTokenDecimals
  );

  const highestRate = normalizeInvertedRate(
    sellPriceLow,
    quoteTokenDecimals,
    baseTokenDecimals
  );

  const order: DecodedOrder = {
    liquidity: liquidity.toString(),
    lowestRate: lowestRate,
    highestRate: highestRate,
    marginalRate: marginalRate,
  };

  logger.debug('createFromSellOrder info:', { order });
  return order;
}

export function createOrders(
  baseTokenDecimals: number,
  quoteTokenDecimals: number,
  buyPriceLow: string,
  buyPriceMarginal: string,
  buyPriceHigh: string,
  buyBudget: string,
  sellPriceLow: string,
  sellPriceMarginal: string,
  sellPriceHigh: string,
  sellBudget: string
): { order0: DecodedOrder; order1: DecodedOrder } {
  logger.debug('createOrders called', arguments);
  const order0 = createFromSellOrder(
    baseTokenDecimals,
    quoteTokenDecimals,
    sellPriceLow,
    sellPriceMarginal,
    sellPriceHigh,
    sellBudget
  );
  const order1 = createFromBuyOrder(
    baseTokenDecimals,
    quoteTokenDecimals,
    buyPriceLow,
    buyPriceMarginal,
    buyPriceHigh,
    buyBudget
  );
  logger.debug('createOrders info:', { order0, order1 });
  return { order0, order1 };
}

export const PPM_RESOLUTION = 1_000_000;

export function addFee(amount: BigNumberish, tradingFeePPM: number): Decimal {
  return new Decimal(amount.toString())
    .mul(PPM_RESOLUTION)
    .div(PPM_RESOLUTION - tradingFeePPM)
    .ceil();
}

export function subtractFee(
  amount: BigNumberish,
  tradingFeePPM: number
): Decimal {
  return new Decimal(amount.toString())
    .mul(PPM_RESOLUTION - tradingFeePPM)
    .div(PPM_RESOLUTION)
    .floor();
}

export function enforcePriceRange(
  minPrice: Decimal,
  maxPrice: Decimal,
  marginalPrice: Decimal
) {
  if (marginalPrice.lte(minPrice)) return minPrice;

  if (marginalPrice.gte(maxPrice)) return maxPrice;

  return marginalPrice;
}

export function getMinMaxPricesByDecimals(
  baseTokenDecimals: number,
  quoteTokenDecimals: number
): {
  minBuyPrice: string;
  maxSellPrice: string;
} {
  const minBuyPrice = normalizeRate(
    lowestPossibleRate.toString(),
    baseTokenDecimals,
    quoteTokenDecimals
  );
  const maxSellPrice = normalizeInvertedRate(
    lowestPossibleRate.toString(),
    quoteTokenDecimals,
    baseTokenDecimals
  );
  return {
    minBuyPrice,
    maxSellPrice,
  };
}

/**
 * Calculate the overlapping strategy prices. Returns it with correct decimals
 *
 * @param {string} buyPriceLow - The minimum buy price for the strategy, in in `quoteToken` per 1 `baseToken`, as a string.
 * @param {string} sellPriceHigh - The maximum sell price for the strategy, in `quoteToken` per 1 `baseToken`, as a string.
 * @param {string} marketPrice - The market price, in `quoteToken` per 1 `baseToken`, as a string.
 * @param {string} spreadPercentage - The spread percentage, e.g. for 10%, enter `10`.
 * @return {{
 *   buyPriceLow: string;
 *   buyPriceHigh: string;
 *   buyPriceMarginal: string;
 *   sellPriceLow: string;
 *   sellPriceHigh: string;
 *   sellPriceMarginal: string;
 *   marketPrice: string;
 * }} The calculated overlapping strategy prices.
 */
export function calculateOverlappingPrices(
  buyPriceLow: string,
  sellPriceHigh: string,
  marketPrice: string,
  spreadPercentage: string
): {
  buyPriceLow: string;
  buyPriceHigh: string;
  buyPriceMarginal: string;
  sellPriceLow: string;
  sellPriceHigh: string;
  sellPriceMarginal: string;
  marketPrice: string;
} {
  logger.debug('calculateOverlappingPrices called', arguments);

  const spreadFactor = new Decimal(spreadPercentage).div(100).plus(1);
  const buyPriceHigh = new Decimal(sellPriceHigh).div(spreadFactor);
  const sellPriceLow = new Decimal(buyPriceLow).mul(spreadFactor);

  // buy marginal price is derived from the market price. But must be LTE buyPriceHigh and GTE buyPriceLow
  const buyPriceMarginal = enforcePriceRange(
    new Decimal(buyPriceLow),
    buyPriceHigh,
    new Decimal(marketPrice).div(spreadFactor.sqrt())
  );

  // sell marginal price is derived from the market price. But must be GTE sellPriceLow and LTE sellPriceHigh
  const sellPriceMarginal = enforcePriceRange(
    sellPriceLow,
    new Decimal(sellPriceHigh),
    new Decimal(marketPrice).mul(spreadFactor.sqrt())
  );

  const prices = {
    buyPriceHigh: buyPriceHigh.toString(),
    buyPriceMarginal: buyPriceMarginal.toString(),
    sellPriceLow: sellPriceLow.toString(),
    sellPriceMarginal: sellPriceMarginal.toString(),
    buyPriceLow,
    sellPriceHigh,
    marketPrice,
  };

  logger.debug('calculateOverlappingPrices info:', {
    prices,
  });

  return prices;
}

export function calculateOverlappingSellBudget(
  baseTokenDecimals: number,
  quoteTokenDecimals: number,
  buyPriceLow: string, // in quote tkn per 1 base tkn
  sellPriceHigh: string, // in quote tkn per 1 base tkn
  marketPrice: string, // in quote tkn per 1 base tkn
  spreadPercentage: string, // e.g. for 0.1% pass '0.1'
  buyBudget: string // in quote tkn
): string {
  logger.debug('calculateOverlappingSellBudget called', arguments);
  // zero buy budget means zero sell budget
  if (buyBudget === '0') return '0';

  const { buyPriceHigh, sellPriceLow, sellPriceMarginal, buyPriceMarginal } =
    calculateOverlappingPrices(
      buyPriceLow,
      sellPriceHigh,
      marketPrice,
      spreadPercentage
    );

  // if buy range takes the entire range then there's zero sell budget
  if (new Decimal(sellPriceMarginal).gte(sellPriceHigh)) return '0';

  // if buy range is zero there's no point to this call
  if (new Decimal(buyPriceMarginal).lte(buyPriceLow)) {
    throw new Error(
      'calculateOverlappingSellBudget called with zero buy range and non zero buy budget'
    );
  }

  const decodedBuyOrder = createFromBuyOrder(
    baseTokenDecimals,
    quoteTokenDecimals,
    buyPriceLow,
    buyPriceMarginal,
    buyPriceHigh,
    buyBudget
  );

  const decodedSellOrder = createFromSellOrder(
    baseTokenDecimals,
    quoteTokenDecimals,
    sellPriceLow,
    sellPriceMarginal,
    sellPriceHigh,
    '0'
  );

  const sellLiquidity = calculateRequiredLiquidity(
    decodedBuyOrder,
    decodedSellOrder
  );

  const sellBudget = formatUnits(sellLiquidity, baseTokenDecimals);

  logger.debug('calculateOverlappingSellBudget info:', {
    sellBudget,
  });

  return sellBudget;
}

export function calculateOverlappingBuyBudget(
  baseTokenDecimals: number,
  quoteTokenDecimals: number,
  buyPriceLow: string, // in quote tkn per 1 base tkn
  sellPriceHigh: string, // in quote tkn per 1 base tkn
  marketPrice: string, // in quote tkn per 1 base tkn
  spreadPercentage: string, // e.g. for 0.1% pass '0.1'
  sellBudget: string // in base tkn
): string {
  logger.debug('calculateOverlappingBuyBudget called', arguments);
  // zero sell budget means zero buy budget
  if (sellBudget === '0') return '0';

  const { sellPriceLow, buyPriceHigh, sellPriceMarginal, buyPriceMarginal } =
    calculateOverlappingPrices(
      buyPriceLow,
      sellPriceHigh,
      marketPrice,
      spreadPercentage
    );

  // if sell range takes the entire range then there's zero buy budget
  if (new Decimal(buyPriceMarginal).lte(buyPriceLow)) return '0';

  // if sell range is zero there's no point to this call
  if (new Decimal(sellPriceMarginal).gte(sellPriceHigh)) {
    throw new Error(
      'calculateOverlappingBuyBudget called with zero sell range and non zero sell budget'
    );
  }

  const decodedBuyOrder = createFromBuyOrder(
    baseTokenDecimals,
    quoteTokenDecimals,
    buyPriceLow,
    buyPriceMarginal,
    buyPriceHigh,
    '0'
  );

  const decodedSellOrder = createFromSellOrder(
    baseTokenDecimals,
    quoteTokenDecimals,
    sellPriceLow,
    sellPriceMarginal,
    sellPriceHigh,
    sellBudget
  );

  const buyLiquidity = calculateRequiredLiquidity(
    decodedSellOrder,
    decodedBuyOrder
  );

  const buyBudget = formatUnits(buyLiquidity, quoteTokenDecimals);

  logger.debug('calculateOverlappingBuyBudget info:', {
    buyBudget,
  });

  return buyBudget;
}
