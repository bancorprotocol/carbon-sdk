import { BigNumber, Decimal, BnToDec, DecToBn, ONE } from './numerics';
import { DecodeOrderForInfo, DecodedOrder, EncodedOrder } from '../common/types';

function bitLength(value: BigNumber) {
  return value.gt(0)
    ? Decimal.log2(value.toString()).add(1).floor().toNumber()
    : 0;
}

export const encodeRate = (value: Decimal) => {
  const data = DecToBn(value.sqrt().mul(ONE).floor());
  const length = bitLength(data.div(ONE));
  return BnToDec(data.shr(length).shl(length));
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

export const encodeOrder = (order: DecodedOrder): EncodedOrder => {
  const liquidity = new Decimal(order.liquidity);
  const lowestRate = new Decimal(order.lowestRate);
  const highestRate = new Decimal(order.highestRate);
  const marginalRate = new Decimal(order.marginalRate);
  if (
    !(
      (highestRate.gte(marginalRate) && marginalRate.gt(lowestRate)) ||
      (highestRate.eq(marginalRate) && marginalRate.eq(lowestRate))
    )
  ) {
    throw new Error(
      'Either one of the following must hold:\n' +
        '- highestRate >= marginalRate > lowestRate\n' +
        '- highestRate == marginalRate == lowestRate\n' +
        `(highestRate = ${highestRate}, marginalRate = ${marginalRate}, lowestRate = ${lowestRate})`
    );
  }
  const y = DecToBn(liquidity);
  const L = DecToBn(encodeRate(lowestRate));
  const H = DecToBn(encodeRate(highestRate));
  const M = DecToBn(encodeRate(marginalRate));
  return {
    y: y,
    z: H.eq(M) ? y : y.mul(H.sub(L)).div(M.sub(L)),
    A: H.eq(L) ? BigNumber.from(1) : encodeFloat(H.sub(L)), // TODO: must be removed
    B: encodeFloat(L),
  };
};

export const getOrderInfo = (order: EncodedOrder): DecodeOrderForInfo => {
  const y = BnToDec(order.y);
  const z = BnToDec(order.z);
  const A = BnToDec(decodeFloat(order.A));
  const B = BnToDec(decodeFloat(order.B));
  const pmarg = y.eq(z) ? decodeRate(B.add(A)) : decodeRate(A.mul(y).div(z).add(B));
  const pb = decodeRate(B)
  const pa = decodeRate(B.add(A))
  return {
    y: y,
    z: z,
    A: A,
    B: B,
    pmarg: pmarg,
    pb: pb,
    pa: pa,
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
