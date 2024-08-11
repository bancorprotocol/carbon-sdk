import { Decimal, BnToDec, DecToBn, ONE_48, ONE_24 } from './numerics';
import { DecodedOrder, EncodedOrder } from '../common/types';

function bitLength(value: bigint): number {
  return value > 0n
    ? Decimal.log2(value.toString()).add(1).floor().toNumber()
    : 0;
}

const encodeScale = (value: Decimal, one: bigint) => {
  const oneDecimal = new Decimal(one.toString());
  const data = DecToBn(value.mul(oneDecimal).floor());
  const length = bitLength(data / one);
  return (data >> BigInt(length)) << BigInt(length);
};

const decodeScale = (value: Decimal, one: bigint) => {
  const oneDecimal = new Decimal(one.toString());
  return value.div(oneDecimal);
};

const encodeFloat = (value: bigint, one: bigint) => {
  const exponent = bitLength(value / one);
  const mantissa = value >> BigInt(exponent);
  return (one * BigInt(exponent)) | mantissa;
};

const decodeFloat = (value: bigint, one: bigint) => {
  return value % one << BigInt(Number(value / one));
};

export const encodeScaleInitialRate = (value: Decimal) =>
  encodeScale(value.sqrt(), ONE_48);
export const decodeScaleInitialRate = (value: Decimal) =>
  decodeScale(value, ONE_48).pow(2);

export const encodeScaleMultiFactor = (value: Decimal) =>
  encodeScale(value.mul(new Decimal(ONE_24.toString())), ONE_24);
export const decodeScaleMultiFactor = (value: Decimal) =>
  decodeScale(value, ONE_24).div(new Decimal(ONE_24.toString()));

export const encodeFloatInitialRate = (value: bigint) =>
  encodeFloat(value, ONE_48);
export const decodeFloatInitialRate = (value: bigint) =>
  decodeFloat(value, ONE_48);

export const encodeFloatMultiFactor = (value: bigint) =>
  encodeFloat(value, ONE_24);
export const decodeFloatMultiFactor = (value: bigint) =>
  decodeFloat(value, ONE_24);

// The smallest rate that, once encoded, will not be zero.
export const lowestPossibleRate = decodeScaleInitialRate(new Decimal(1));

export const encodeOrders = ([order0, order1]: [DecodedOrder, DecodedOrder]): [
  EncodedOrder,
  EncodedOrder
] => {
  const liquidity0 = new Decimal(order0.liquidity);
  const lowestRate0 = new Decimal(order0.lowestRate);
  const highestRate0 = new Decimal(order0.highestRate);
  const liquidity1 = new Decimal(order1.liquidity);
  const lowestRate1 = new Decimal(order1.lowestRate);
  const highestRate1 = new Decimal(order1.highestRate);

  // if one order has 0 liquidity and the other has > 0 liquidity - use it to calculate z.
  if (
    liquidity0.eq(0) &&
    liquidity1.gt(0) &&
    lowestRate1.gt(0) &&
    highestRate1.gt(0)
  ) {
    return [
      encodeOrder(order0, calculateCorrelatedZ(order1)),
      encodeOrder(order1),
    ];
  }
  if (
    liquidity1.eq(0) &&
    liquidity0.gt(0) &&
    lowestRate0.gt(0) &&
    highestRate0.gt(0)
  ) {
    return [
      encodeOrder(order0),
      encodeOrder(order1, calculateCorrelatedZ(order0)),
    ];
  }
  return [encodeOrder(order0), encodeOrder(order1)];
};

export const isOrderEncodable = (order: DecodedOrder): boolean => {
  try {
    encodeOrder(order);
    return true;
  } catch {
    return false;
  }
};

/**
 * Checks if the rates are equal after scaling them
 * @param {string} x - the first rate
 * @param {string} y - the second rate
 * @returns {boolean} - true if the rates are equal after scaling, false otherwise
 */
export const areScaledRatesEqual = (x: string, y: string): boolean => {
  const xDec = new Decimal(x);
  const yDec = new Decimal(y);
  const xScaled = encodeScaleInitialRate(xDec);
  const yScaled = encodeScaleInitialRate(yDec);
  return xScaled === yScaled;
};

export const encodeOrder = (order: DecodedOrder, z?: bigint): EncodedOrder => {
  const liquidity = new Decimal(order.liquidity);
  const lowestRate = new Decimal(order.lowestRate);
  const highestRate = new Decimal(order.highestRate);
  const marginalRate = new Decimal(order.marginalRate);

  const y = DecToBn(liquidity);
  const L = encodeScaleInitialRate(lowestRate);
  const H = encodeScaleInitialRate(highestRate);
  const M = encodeScaleInitialRate(marginalRate);

  if (L === 0n && !(H === 0n && M === 0n)) {
    throw new Error(
      `Encoded lowest rate cannot be zero unless the highest and marginal rates are also zero. This may be the result of passing a rate that is zero or too close to zero:\n` +
        `lowestRate = ${lowestRate}, highestRate = ${highestRate}, marginalRate = ${marginalRate}\n` +
        `L = ${L}, H = ${H}, M = ${M}`
    );
  }

  if (
    !(
      (H >= M && M > L) ||
      (H === M && M === L) ||
      (H > M && M === L && y === 0n)
    )
  )
    throw new Error(
      'Either one of the following must hold:\n' +
        '- highestRate >= marginalRate > lowestRate\n' +
        '- highestRate == marginalRate == lowestRate\n' +
        '- (highestRate > marginalRate == lowestRate) AND liquidity == 0\n' +
        `(highestRate = ${highestRate}, marginalRate = ${marginalRate}, lowestRate = ${lowestRate}), liquidity = ${liquidity}`
    );

  return {
    y,
    z: z !== undefined ? z : H === M || y === 0n ? y : (y * (H - L)) / (M - L),
    A: encodeFloatInitialRate(H - L),
    B: encodeFloatInitialRate(L),
  };
};

export const decodeOrder = (order: EncodedOrder): DecodedOrder => {
  const y = BnToDec(order.y);
  const z = BnToDec(order.z);
  const A = BnToDec(decodeFloatInitialRate(order.A));
  const B = BnToDec(decodeFloatInitialRate(order.B));
  return {
    liquidity: y.toString(),
    lowestRate: decodeScaleInitialRate(B).toString(),
    highestRate: decodeScaleInitialRate(B.add(A)).toString(),
    marginalRate: decodeScaleInitialRate(
      y.eq(z) ? B.add(A) : B.add(A.mul(y).div(z))
    ).toString(),
  };
};

/**
 * Use the capacity of the other order along with the prices of this order,
 * in order to calculate the capacity that this order needs to have in order for its
 * marginal price to be set according to the given input - and provide the
 * liquidity that should be used to achieve that.
 */
export const calculateRequiredLiquidity = (
  knownOrder: DecodedOrder,
  vagueOrder: DecodedOrder
): string => {
  const z: bigint = calculateCorrelatedZ(knownOrder);
  const L: bigint = encodeScaleInitialRate(new Decimal(vagueOrder.lowestRate));
  const H: bigint = encodeScaleInitialRate(new Decimal(vagueOrder.highestRate));
  const M: bigint = encodeScaleInitialRate(
    new Decimal(vagueOrder.marginalRate)
  );

  return ((z * (M - L)) / (H - L)).toString();
};

/**
 * Use the capacity of the other order along with the prices of this order,
 * in order to calculate the capacity that this order needs to have in order for its
 * marginal price to be set according to the given input - and provide the
 * liquidity that should be used to achieve that. This function assumes that the other order has 0 liquidity.
 */
export const calculateCorrelatedZ = (order: DecodedOrder): bigint => {
  const capacity: Decimal = BnToDec(encodeOrder(order).z);
  const lowestRate: Decimal = new Decimal(order.lowestRate);
  const highestRate: Decimal = new Decimal(order.highestRate);
  const geoAverageRate: Decimal = lowestRate.mul(highestRate).sqrt();

  return DecToBn(capacity.div(geoAverageRate).floor());
};
