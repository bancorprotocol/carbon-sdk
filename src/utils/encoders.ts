import { BigNumber, Decimal, BnToDec, DecToBn, ONE_48, ONE_24 } from './numerics';
import { DecodedOrder, EncodedOrder } from '../common/types';

function bitLength(value: BigNumber) {
  return value.gt(0)
    ? Decimal.log2(value.toString()).add(1).floor().toNumber()
    : 0;
}

function encodeScale(value: Decimal, one: number) {
  const data = DecToBn(value.mul(one).floor());
  const length = bitLength(data.div(one));
  return data.shr(length).shl(length);
}

function decodeScale(value: Decimal, one: number) {
  return value.div(one);
}

function encodeFloat(value: BigNumber, one: number) {
  const exponent = bitLength(value.div(one));
  const mantissa = value.shr(exponent);
  return BigNumber.from(one).mul(exponent).or(mantissa);
}

function decodeFloat(value: BigNumber, one: number) {
  return value.mod(one).shl(value.div(one).toNumber());
}

export const encodeScaleInitialRate = (value: Decimal) => encodeScale(value.sqrt(), ONE_48);
export const decodeScaleInitialRate = (value: Decimal) => decodeScale(value, ONE_48).pow(2);

export const encodeScaleMultiFactor = (value: Decimal) => encodeScale(value.mul(ONE_24), ONE_24);
export const decodeScaleMultiFactor = (value: Decimal) => decodeScale(value, ONE_24).div(ONE_24);

export const encodeFloatInitialRate = (value: BigNumber) => encodeFloat(value, ONE_48);
export const decodeFloatInitialRate = (value: BigNumber) => decodeFloat(value, ONE_48);

export const encodeFloatMultiFactor = (value: BigNumber) => encodeFloat(value, ONE_24);
export const decodeFloatMultiFactor = (value: BigNumber) => decodeFloat(value, ONE_24);

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

export const encodeOrder = (
  order: DecodedOrder,
  z?: BigNumber
): EncodedOrder => {
  const liquidity = new Decimal(order.liquidity);
  const lowestRate = new Decimal(order.lowestRate);
  const highestRate = new Decimal(order.highestRate);
  const marginalRate = new Decimal(order.marginalRate);

  if (
    !(
      (highestRate.gte(marginalRate) && marginalRate.gt(lowestRate)) ||
      (highestRate.eq(marginalRate) && marginalRate.eq(lowestRate)) ||
      (highestRate.gt(marginalRate) &&
        marginalRate.eq(lowestRate) &&
        liquidity.isZero())
    )
  )
    throw new Error(
      'Either one of the following must hold:\n' +
        '- highestRate >= marginalRate > lowestRate\n' +
        '- highestRate == marginalRate == lowestRate\n' +
        '- (highestRate > marginalRate == lowestRate) AND liquidity == 0\n' +
        `(highestRate = ${highestRate}, marginalRate = ${marginalRate}, lowestRate = ${lowestRate}), liquidity = ${liquidity}`
    );

  const y = DecToBn(liquidity);
  const L = encodeScaleInitialRate(lowestRate);
  const H = encodeScaleInitialRate(highestRate);
  const M = encodeScaleInitialRate(marginalRate);

  return {
    y,
    z:
      z !== undefined
        ? z
        : H.eq(M) || y.isZero()
        ? y
        : y.mul(H.sub(L)).div(M.sub(L)),
    A: encodeFloatInitialRate(H.sub(L)),
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
  const z: BigNumber = calculateCorrelatedZ(knownOrder);
  const L: BigNumber = encodeScaleInitialRate(new Decimal(vagueOrder.lowestRate));
  const H: BigNumber = encodeScaleInitialRate(new Decimal(vagueOrder.highestRate));
  const M: BigNumber = encodeScaleInitialRate(new Decimal(vagueOrder.marginalRate));

  return z.mul(M.sub(L)).div(H.sub(L)).toString();
};

/**
 * Use the capacity of the other order along with the prices of this order,
 * in order to calculate the capacity that this order needs to have in order for its
 * marginal price to be set according to the given input - and provide the
 * liquidity that should be used to achieve that. This function assumes that the other order has 0 liquidity.
 */
export const calculateCorrelatedZ = (order: DecodedOrder): BigNumber => {
  const capacity: Decimal = BnToDec(encodeOrder(order).z);
  const lowestRate: Decimal = new Decimal(order.lowestRate);
  const highestRate: Decimal = new Decimal(order.highestRate);
  const geoAverageRate: Decimal = lowestRate.mul(highestRate).sqrt();

  return DecToBn(capacity.div(geoAverageRate).floor());
};
