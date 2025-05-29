import { Decimal } from './numerics';

const ONE = new Decimal(1);

export function getMultiFactor(
  gradientType: number,
  bgnRate: Decimal,
  endRate: Decimal,
  bgnTime: Decimal,
  endTime: Decimal,
) {
  switch (gradientType) {
    case 0: return endRate.div(bgnRate).sub(ONE).div(endTime.sub(bgnTime));
    case 1: return endRate.div(bgnRate).add(ONE).div(endTime.sub(bgnTime));
    case 2: return bgnRate.div(endRate).add(ONE).div(endTime.sub(bgnTime));
    case 3: return bgnRate.div(endRate).sub(ONE).div(endTime.sub(bgnTime));
    case 4: return endRate.div(bgnRate).ln().div(endTime.sub(bgnTime));
    case 5: return bgnRate.div(endRate).ln().div(endTime.sub(bgnTime));
  }
  throw new Error(`Invalid gradientType ${gradientType}`);
}
