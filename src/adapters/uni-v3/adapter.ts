import { Decimal, MAX_UINT256 } from '../../utils/numerics';
import { EncodedOrder, EncodedStrategy } from '../../common/types';
import { UniV3CastStrategy, UniV3Pool, UniV3Position } from './types';
import { decodeFloat, decodeOrder } from '../../utils/encoders';

/**
 * Constants for Uniswap V3 calculations
 */
const TICK_BASE_LN = Decimal.ln('1.0001');
const DEFAULT_TICK_SPACING = 1;

/**
 * Calculates the implied Uniswap V3 tick for a given rate
 * @param {Decimal} rate - The rate to convert to a tick
 * @param {boolean} roundUp - Whether to round up (ceiling) or down (floor)
 * @returns {number} The calculated tick value
 */
function calculateImpliedTick(rate: Decimal, roundUp: boolean): number {
  const logRate = rate.ln();
  const tick = logRate.div(TICK_BASE_LN);
  return roundUp ? tick.ceil().toNumber() : tick.floor().toNumber();
}

/**
 * Calculates the liquidity constant (L) for a Uniswap V3 position
 * @param {EncodedOrder} order - The Carbon order to calculate liquidity for
 * @returns {string} The calculated liquidity value
 */
function calculateLConstant(order: EncodedOrder): string {
  if (order.A.isZero()) {
    return MAX_UINT256.toString();
  }
  return order.z.div(decodeFloat(order.A)).toString();
}

/**
 * Calculates position information for a Carbon order
 * @param {EncodedOrder} order - The Carbon order
 * @param {boolean} isSellOrder - Whether this is a sell order
 * @returns {UniV3Position} The calculated Uniswap V3 position
 */
function calculatePositionInformation(
  order: EncodedOrder,
  isSellOrder: boolean
): UniV3Position {
  const decodedOrder = decodeOrder(order);
  const priceLow = new Decimal(decodedOrder.lowestRate);
  const priceHigh = new Decimal(decodedOrder.highestRate);

  if (isSellOrder) {
    return {
      tickUpper: calculateImpliedTick(priceHigh, true),
      tickLower: calculateImpliedTick(priceLow, false),
      liquidity: calculateLConstant(order),
    };
  }

  // For buy orders, invert the prices
  const invertedPriceLow = new Decimal(1).div(priceHigh);
  const invertedPriceHigh = new Decimal(1).div(priceLow);

  return {
    tickUpper: calculateImpliedTick(invertedPriceHigh, true),
    tickLower: calculateImpliedTick(invertedPriceLow, false),
    liquidity: calculateLConstant(order),
  };
}

/**
 * Defines the pool configuration for a token pair
 * @param {string} baseToken - The base token address
 * @param {string} quoteToken - The quote token address
 * @returns {UniV3Pool} The pool configuration
 */
function definePool(baseToken: string, quoteToken: string): UniV3Pool {
  return {
    xAxisToken: quoteToken,
    yAxisToken: baseToken,
    tickSpacing: DEFAULT_TICK_SPACING,
  };
}

/**
 * Converts a Carbon strategy to Uniswap V3 format
 * @param {EncodedStrategy} strategy - The Carbon strategy to convert
 * @returns {UniV3CastStrategy} The strategy in Uniswap V3 format
 */
export function castToUniV3(strategy: EncodedStrategy): UniV3CastStrategy {
  const pool = definePool(strategy.token0, strategy.token1);

  return {
    pool,
    sellOrder: calculatePositionInformation(strategy.order0, true),
    buyOrder: calculatePositionInformation(strategy.order1, false),
  };
}

/**
 * Batch converts multiple encoded Carbon strategies to Uniswap V3 format
 * @param {EncodedStrategy[]} encodedStrategies - Array of encoded Carbon strategies
 * @returns {UniV3CastStrategy[]} Array of strategies in Uniswap V3 format
 */
export function batchCastToUniV3(
  encodedStrategies: EncodedStrategy[]
): UniV3CastStrategy[] {
  return encodedStrategies.map(castToUniV3);
}
