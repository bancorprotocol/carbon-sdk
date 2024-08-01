import { BigNumber, Decimal, BnToDec, DecToBn, ONE } from './numerics';
import { DecodedOrder, EncodedOrder } from '../common/types';

function bitLength(value: BigNumber) {
  return value.gt(0)
    ? Decimal.log2(value.toString()).add(1).floor().toNumber()
    : 0;
}

export const encodeRate = (value: Decimal) => {
  const data = DecToBn(value.sqrt().mul(ONE).floor());
  const length = bitLength(data.div(ONE));
  return data.shr(length).shl(length);
};

export const decodeRate = (value: Decimal) => {
  return value.div(ONE).pow(2);
};

export const encodeFloat = (value: BigNumber) => {
  const exponent = bitLength(value.div(ONE));
  const mantissa = value.shr(exponent);
  return BigNumber.from(ONE).mul(exponent).or(mantissa);
};

export const decodeFloat = (value: BigNumber) => {
  return value.mod(ONE).shl(value.div(ONE).toNumber());
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
  const L = encodeRate(lowestRate);
  const H = encodeRate(highestRate);
  const M = encodeRate(marginalRate);

  return {
    y,
    z:
      z !== undefined
        ? z
        : H.eq(M) || y.isZero()
        ? y
        : y.mul(H.sub(L)).div(M.sub(L)),
    A: encodeFloat(H.sub(L)),
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
  const z: BigNumber = calculateCorrelatedZ(knownOrder);
  const L: BigNumber = encodeRate(new Decimal(vagueOrder.lowestRate));
  const H: BigNumber = encodeRate(new Decimal(vagueOrder.highestRate));
  const M: BigNumber = encodeRate(new Decimal(vagueOrder.marginalRate));

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
