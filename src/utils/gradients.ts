import { Decimal } from './numerics';

const ONE = new Decimal(1);
const ZERO = new Decimal(0);

export const STRATEGY_TYPE_SHIFT = 248n;
export const GRADIENT_STRATEGY_TYPE_MASK = 1n << 255n;
export const STRATEGY_TYPE_VALUE_MASK = (1n << STRATEGY_TYPE_SHIFT) - 1n;

export function isGradientStrategyId(id: bigint) {
  return (id & GRADIENT_STRATEGY_TYPE_MASK) !== 0n;
}

export function stripStrategyTypeBits(id: bigint) {
  return id & STRATEGY_TYPE_VALUE_MASK;
}

export function getMultiFactor(
  gradientType: number,
  bgnRate: Decimal,
  endRate: Decimal,
  bgnTime: Decimal,
  endTime: Decimal
) {
  if (endTime.lte(bgnTime)) {
    throw new Error('expiry must be greater than tradingStartTime');
  }

  switch (gradientType) {
    case 0:
      return endRate.div(bgnRate).sub(ONE).div(endTime.sub(bgnTime));
    case 1:
      return ONE.sub(endRate.div(bgnRate)).div(endTime.sub(bgnTime));
    case 2:
      return ONE.sub(bgnRate.div(endRate)).div(endTime.sub(bgnTime));
    case 3:
      return bgnRate.div(endRate).sub(ONE).div(endTime.sub(bgnTime));
    case 4:
      return endRate.div(bgnRate).ln().div(endTime.sub(bgnTime));
    case 5:
      return bgnRate.div(endRate).ln().div(endTime.sub(bgnTime));
  }
  throw new Error(`Invalid gradientType ${gradientType}`);
}

export function getRateAtTime(
  gradientType: number,
  initialRate: Decimal,
  multiFactor: Decimal,
  tradingStartTime: Decimal,
  currentTime: Decimal
) {
  const timeElapsed = Decimal.max(currentTime.sub(tradingStartTime), ZERO);
  const factor = multiFactor.mul(timeElapsed);

  let rate: Decimal;
  switch (gradientType) {
    case 0:
      rate = initialRate.mul(ONE.add(factor));
      break;
    case 1:
      rate = initialRate.mul(ONE.sub(factor));
      break;
    case 2:
      rate = initialRate.div(ONE.sub(factor));
      break;
    case 3:
      rate = initialRate.div(ONE.add(factor));
      break;
    case 4:
      rate = initialRate.mul(factor.exp());
      break;
    case 5:
      rate = initialRate.div(factor.exp());
      break;
    default:
      throw new Error(`Invalid gradientType ${gradientType}`);
  }

  if (!rate.isFinite() || rate.lte(ZERO)) {
    return ZERO;
  }
  return rate;
}

export function getRateAtExpiry(
  gradientType: number,
  initialRate: Decimal,
  multiFactor: Decimal,
  tradingStartTime: Decimal,
  expiry: Decimal
) {
  return getRateAtTime(
    gradientType,
    initialRate,
    multiFactor,
    tradingStartTime,
    expiry
  );
}
