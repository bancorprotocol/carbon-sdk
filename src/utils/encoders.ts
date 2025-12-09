import { Decimal, BnToDec, DecToBn, ONE } from './numerics';
import { DecodedOrder, EncodedOrder } from '../common/types';

function bitLength(value: bigint): number {
  return value > 0n
    ? Decimal.log2(value.toString()).add(1).floor().toNumber()
    : 0;
}

export const encodeRate = (value: Decimal): bigint => {
  const oneDecimal = new Decimal(ONE.toString());
  const data = DecToBn(value.sqrt().mul(oneDecimal).floor());
  const length = bitLength(data / ONE);
  return (data >> BigInt(length)) << BigInt(length);
};

export const decodeRate = (value: Decimal): Decimal => {
  const oneDecimal = new Decimal(ONE.toString());
  return value.div(oneDecimal).pow(2);
};

// The smallest rate that, once encoded, will not be zero.
export const lowestPossibleRate = decodeRate(new Decimal(1));

export const encodeFloat = (value: bigint): bigint => {
  const exponent = bitLength(value / ONE);
  const mantissa = value >> BigInt(exponent);
  return (ONE * BigInt(exponent)) | mantissa;
};

export const decodeFloat = (value: bigint): bigint => {
  return value % ONE << BigInt(Number(value / ONE));
};

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
  const xScaled = encodeRate(xDec);
  const yScaled = encodeRate(yDec);
  return xScaled === yScaled;
};

export const encodeOrder = (order: DecodedOrder, z?: bigint): EncodedOrder => {
  const liquidity = new Decimal(order.liquidity);
  const lowestRate = new Decimal(order.lowestRate);
  const highestRate = new Decimal(order.highestRate);
  const marginalRate = new Decimal(order.marginalRate);

  const y = DecToBn(liquidity);
  const L = encodeRate(lowestRate);
  const H = encodeRate(highestRate);
  const M = encodeRate(marginalRate);

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
    A: encodeFloat(H - L),
    B: encodeFloat(L),
  };
};

export const decodeOrder = (order: EncodedOrder): DecodedOrder => {
  const y = BnToDec(order.y);
  const z = BnToDec(order.z);
  const A = BnToDec(decodeFloat(order.A));
  const B = BnToDec(decodeFloat(order.B));
  return {
    liquidity: y.toString(),
    lowestRate: decodeRate(B).toString(),
    highestRate: decodeRate(B.add(A)).toString(),
    marginalRate: decodeRate(
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
  const L: bigint = encodeRate(new Decimal(vagueOrder.lowestRate));
  const H: bigint = encodeRate(new Decimal(vagueOrder.highestRate));
  const M: bigint = encodeRate(new Decimal(vagueOrder.marginalRate));

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
