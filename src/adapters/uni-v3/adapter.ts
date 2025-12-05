import { Decimal, ONE } from '../../utils/numerics';
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
  if (order.A === 0n) {
    return Infinity.toString();
  }
  return ((order.z * ONE) / decodeFloat(order.A)).toString();
}

function calculateSqrtPriceX96(marginal: Decimal, roundUp: boolean): string {
  const sqrtRate = marginal.sqrt();
  const sqrtPriceX96 = sqrtRate.mul(new Decimal(2).pow(96));
  return roundUp
    ? sqrtPriceX96.ceil().toString()
    : sqrtPriceX96.floor().toString();
}

/**
 * Calculates position information for a Carbon order
 * @param {EncodedOrder} order - The Carbon order
 * @param {boolean} invertRates - Whether to invert the rates
 * @returns {UniV3Position} The calculated Uniswap V3 position
 */
function calculatePositionInformation(
  order: EncodedOrder,
  invertRates: boolean
): UniV3Position {
  const decodedOrder = decodeOrder(order);
  const priceLow = new Decimal(decodedOrder.lowestRate);
  const priceHigh = new Decimal(decodedOrder.highestRate);
  const priceMarginal = new Decimal(decodedOrder.marginalRate);

  if (!invertRates) {
    return {
      tickUpper: calculateImpliedTick(priceHigh, true),
      tickLower: calculateImpliedTick(priceLow, false),
      liquidity: calculateLConstant(order),
      sqrtPriceX96: calculateSqrtPriceX96(priceMarginal, false),
    };
  }

  // For buy orders, invert the prices
  const invertedPriceHigh = new Decimal(1).div(priceHigh);
  const invertedPriceLow = new Decimal(1).div(priceLow);
  const invertedPriceMarginal = new Decimal(1).div(priceMarginal);

  return {
    tickUpper: calculateImpliedTick(invertedPriceLow, true),
    tickLower: calculateImpliedTick(invertedPriceHigh, false),
    liquidity: calculateLConstant(order),
    sqrtPriceX96: calculateSqrtPriceX96(invertedPriceMarginal, true),
  };
}

/**
 * Converts a Carbon strategy to Uniswap V3 format
 * @param {EncodedStrategy} strategy - The Carbon strategy to convert
 * @returns {UniV3CastStrategy} The strategy in Uniswap V3 format
 */
export function castToUniV3(strategy: EncodedStrategy): UniV3CastStrategy {
  // use the token addresses to define which is the base token and which is the quote token. Base token is the token with the lowest address.

  const addr0 = BigInt(strategy.token0);
  const addr1 = BigInt(strategy.token1);

  const isToken0XAxis = addr0 < addr1;

  const pool: UniV3Pool = {
    xAxisToken: isToken0XAxis ? strategy.token0 : strategy.token1,
    yAxisToken: isToken0XAxis ? strategy.token1 : strategy.token0,
    tickSpacing: DEFAULT_TICK_SPACING,
  };

  return {
    pool,
    sellOrder: calculatePositionInformation(strategy.order0, isToken0XAxis),
    buyOrder: calculatePositionInformation(strategy.order1, !isToken0XAxis),
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
