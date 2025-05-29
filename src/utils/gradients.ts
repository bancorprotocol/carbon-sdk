import { Decimal } from './numerics';

const ONE = new Decimal(1);

export function getMultiFactor(
  gradientType: number,
  initialRate: Decimal,
  endmostRate: Decimal,
  timeElapsed: Decimal
) {
  switch (gradientType) {
    case 0: return endmostRate.div(initialRate).sub(ONE).div(timeElapsed);
    case 1: return endmostRate.div(initialRate).add(ONE).div(timeElapsed);
    case 2: return initialRate.div(endmostRate).add(ONE).div(timeElapsed);
    case 3: return initialRate.div(endmostRate).sub(ONE).div(timeElapsed);
    case 4: return endmostRate.div(initialRate).ln().div(timeElapsed);
    case 5: return initialRate.div(endmostRate).ln().div(timeElapsed);
  }
  throw new Error(`Invalid gradientType ${gradientType}`);
}
