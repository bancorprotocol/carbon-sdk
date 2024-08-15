import { MAX_UINT128, uint128, add, mul, mulDivF, mulDivC, minFactor } from './utils';
import { ONE_48, ONE_24, BigNumber } from '../utils/numerics';

const EXP_ONE = BigNumber.from("0x0080000000000000000000000000000000"); // 1
const EXP_MID = BigNumber.from("0x0400000000000000000000000000000000"); // 8
const EXP_MAX = BigNumber.from("0x2cb53f09f05cc627c85ddebfccfeb72758"); // ceil(ln2) * 129
const EXP_LN2 = BigNumber.from("0x0058b90bfbe8e7bcd5e4f1d9cc01f97b58"); // ceil(ln2)

const R_ONE = BigNumber.from(ONE_48); // = 2 ^ 48
const M_ONE = BigNumber.from(ONE_24); // = 2 ^ 24

const RR = R_ONE.mul(R_ONE); // = 2 ^ 96
const MM = M_ONE.mul(M_ONE); // = 2 ^ 48

const RR_MUL_MM = RR.mul(MM); // = 2 ^ 144
const RR_DIV_MM = RR.div(MM); // = 2 ^ 48

const EXP_ONE_MUL_RR = EXP_ONE.mul(RR); // = 2 ^ 223
const EXP_ONE_DIV_RR = EXP_ONE.div(RR); // = 2 ^ 31
const EXP_ONE_DIV_MM = EXP_ONE.div(MM); // = 2 ^ 79

enum GradientType {
  LINEAR_INCREASE,
  LINEAR_DECREASE,
  LINEAR_INV_INCREASE,
  LINEAR_INV_DECREASE,
  EXPONENTIAL_INCREASE,
  EXPONENTIAL_DECREASE
}

function calcTargetAmount(
  gradientType: GradientType,
  initialRate: BigNumber,
  multiFactor: BigNumber,
  timeElapsed: BigNumber,
  sourceAmount: BigNumber
): BigNumber {
  const rate = calcCurrentRate(gradientType, initialRate, multiFactor, timeElapsed);
  return mulDivF(sourceAmount, rate[0], rate[1]);
}

function calcSourceAmount(
  gradientType: GradientType,
  initialRate: BigNumber,
  multiFactor: BigNumber,
  timeElapsed: BigNumber,
  targetAmount: BigNumber
): BigNumber {
  const rate = calcCurrentRate(gradientType, initialRate, multiFactor, timeElapsed);
  return mulDivC(targetAmount, rate[1], rate[0]);
}

/**
 * @dev Given the following parameters:
 * r - the gradient's initial exchange rate
 * m - the gradient's multiplication factor
 * t - the time elapsed since strategy creation
 *
 * Calculate the current exchange rate for each one of the following gradients:
 * +----------------+-----------+-----------------+----------------------------------------------+
 * | type           | direction | formula         | restriction                                  |
 * +----------------+-----------+-----------------+----------------------------------------------+
 * | linear         | increase  | r * (1 + m * t) |                                              |
 * | linear         | decrease  | r * (1 - m * t) | m * t < 1 (ensure a finite-positive rate)    |
 * | linear-inverse | increase  | r / (1 - m * t) | m * t < 1 (ensure a finite-positive rate)    |
 * | linear-inverse | decrease  | r / (1 + m * t) |                                              |
 * | exponential    | increase  | r * e ^ (m * t) | m * t < 129 * ln2 (computational limitation) |
 * | exponential    | decrease  | r / e ^ (m * t) | m * t < 129 * ln2 (computational limitation) |
 * +----------------+-----------+-----------------+----------------------------------------------+
 */
function calcCurrentRate(
  gradientType: GradientType,
  initialRate: BigNumber, // the 48-bit-mantissa-6-bit-exponent encoding of the initial exchange rate square root
  multiFactor: BigNumber, // the 24-bit-mantissa-5-bit-exponent encoding of the multiplication factor times 2 ^ 24
  timeElapsed: BigNumber, /// the time elapsed since strategy creation
): [BigNumber, BigNumber] {
  if ((R_ONE.shr(initialRate.div(R_ONE).toNumber())).eq(0)) {
    throw new Error('InitialRateTooHigh');
  }

  if ((M_ONE.shr(multiFactor.div(M_ONE).toNumber())).eq(0)) {
    throw new Error('MultiFactorTooHigh');
  }

  const r = initialRate.mod(R_ONE).shl(initialRate.div(R_ONE).toNumber()); // = floor(sqrt(initial_rate) * 2 ^ 48)    < 2 ^ 96
  const m = multiFactor.mod(M_ONE).shl(multiFactor.div(M_ONE).toNumber()); // = floor(multi_factor * 2 ^ 24 * 2 ^ 24) < 2 ^ 48
  const t = timeElapsed;

  const rr = mul(r, r); // < 2 ^ 192
  const mt = mul(m, t); // < 2 ^ 80

  if (gradientType == GradientType.LINEAR_INCREASE) {
    // initial_rate * (1 + multi_factor * time_elapsed)
    const temp1 = rr; /////////// < 2 ^ 192
    const temp2 = add(MM, mt); // < 2 ^ 81
    const temp3 = minFactor(temp1, temp2);
    const temp4 = RR_MUL_MM;
    return [mulDivF(temp1, temp2, temp3), temp4.div(temp3)]; // not ideal
  }

  if (gradientType == GradientType.LINEAR_DECREASE) {
    // initial_rate * (1 - multi_factor * time_elapsed)
    const temp1 = mul(rr, sub(MM, mt)); // < 2 ^ 240
    const temp2 = RR_MUL_MM;
    return [temp1, temp2];
  }

  if (gradientType == GradientType.LINEAR_INV_INCREASE) {
    // initial_rate / (1 - multi_factor * time_elapsed)
    const temp1 = rr;
    const temp2 = sub(RR, mul(mt, RR_DIV_MM)); // < 2 ^ 128 (inner expression)
    return [temp1, temp2];
  }

  if (gradientType == GradientType.LINEAR_INV_DECREASE) {
    // initial_rate / (1 + multi_factor * time_elapsed)
    const temp1 = rr;
    const temp2 = add(RR, mul(mt, RR_DIV_MM)); // < 2 ^ 129
    return [temp1, temp2];
  }

  if (gradientType == GradientType.EXPONENTIAL_INCREASE) {
    // initial_rate * e ^ (multi_factor * time_elapsed)
    const temp1 = rr; //////////////////////// < 2 ^ 192
    const temp2 = exp(mul(mt, EXP_ONE_DIV_MM)); // < 2 ^ 159 (inner expression)
    const temp3 = minFactor(temp1, temp2);
    const temp4 = EXP_ONE_MUL_RR;
    return [mulDivF(temp1, temp2, temp3), temp4.div(temp3)]; // not ideal
  }

  if (gradientType == GradientType.EXPONENTIAL_DECREASE) {
    // initial_rate / e ^ (multi_factor * time_elapsed)
    const temp1 = mul(rr, EXP_ONE_DIV_RR); /////// < 2 ^ 223
    const temp2 = exp(mul(mt, EXP_ONE_DIV_MM)); // < 2 ^ 159 (inner expression)
    return [temp1, temp2];
  }

  throw new Error(`Invalid gradientType ${gradientType}`);
}

/**
 * @dev Ensure a finite positive rate
 */
function sub(one: BigNumber, mt: BigNumber): BigNumber {
  if (one.lte(mt)) {
    throw new Error('InvalidRate');
  }
  return one.sub(mt);
}

/**
 * @dev Compute e ^ (x / EXP_ONE) * EXP_ONE
 * Input range: 0 <= x <= EXP_MAX - 1
 * Detailed description:
 * - For x < EXP_MID, this function computes e ^ x
 * - For x < EXP_MAX, this function computes e ^ mod(x, ln2) * 2 ^ div(x, ln2)
 * - The latter relies on the following identity:
 *   e ^ x =
 *   e ^ x * 2 ^ k / 2 ^ k =
 *   e ^ x * 2 ^ k / e ^ (k * ln2) =
 *   e ^ x / e ^ (k * ln2) * 2 ^ k =
 *   e ^ (x - k * ln2) * 2 ^ k
 * - Replacing k with div(x, ln2) gives the solution above
 * - The value of ln2 is represented as ceil(ln2 * EXP_ONE)
 */
function exp(x: BigNumber): BigNumber {
  if (x.lt(EXP_MID)) {
      return _exp(x); // slightly more accurate
  }
  if (x.lt(EXP_MAX)) {
      return _exp(x.mod(EXP_LN2)).shl(x.div(EXP_LN2).toNumber());
  }
  throw new Error('ExpOverflow');
}

/**
 * @dev Compute e ^ (x / EXP_ONE) * EXP_ONE
 * Input range: 0 <= x <= EXP_ONE * 16 - 1
 * Detailed description:
 * - Rewrite the input as a sum of binary exponents and a single residual r, as small as possible
 * - The exponentiation of each binary exponent is given (pre-calculated)
 * - The exponentiation of r is calculated via Taylor series for e^x, where x = r
 * - The exponentiation of the input is calculated by multiplying the intermediate results above
 * - For example: e^5.521692859 = e^(4 + 1 + 0.5 + 0.021692859) = e^4 * e^1 * e^0.5 * e^0.021692859
 */
function _exp(x: BigNumber): BigNumber {
  let res = BigNumber.from(0);

  let y: BigNumber;
  let z: BigNumber;

  z = y = x.mod(BigNumber.from('0x10000000000000000000000000000000')); // get the input modulo 2^(-3)
  z = z.mul(y).div(EXP_ONE); res = res.add(z.mul(BigNumber.from('0x10e1b3be415a0000'))); // add y^02 * (20! / 02!)
  z = z.mul(y).div(EXP_ONE); res = res.add(z.mul(BigNumber.from('0x05a0913f6b1e0000'))); // add y^03 * (20! / 03!)
  z = z.mul(y).div(EXP_ONE); res = res.add(z.mul(BigNumber.from('0x0168244fdac78000'))); // add y^04 * (20! / 04!)
  z = z.mul(y).div(EXP_ONE); res = res.add(z.mul(BigNumber.from('0x004807432bc18000'))); // add y^05 * (20! / 05!)
  z = z.mul(y).div(EXP_ONE); res = res.add(z.mul(BigNumber.from('0x000c0135dca04000'))); // add y^06 * (20! / 06!)
  z = z.mul(y).div(EXP_ONE); res = res.add(z.mul(BigNumber.from('0x0001b707b1cdc000'))); // add y^07 * (20! / 07!)
  z = z.mul(y).div(EXP_ONE); res = res.add(z.mul(BigNumber.from('0x000036e0f639b800'))); // add y^08 * (20! / 08!)
  z = z.mul(y).div(EXP_ONE); res = res.add(z.mul(BigNumber.from('0x00000618fee9f800'))); // add y^09 * (20! / 09!)
  z = z.mul(y).div(EXP_ONE); res = res.add(z.mul(BigNumber.from('0x0000009c197dcc00'))); // add y^10 * (20! / 10!)
  z = z.mul(y).div(EXP_ONE); res = res.add(z.mul(BigNumber.from('0x0000000e30dce400'))); // add y^11 * (20! / 11!)
  z = z.mul(y).div(EXP_ONE); res = res.add(z.mul(BigNumber.from('0x000000012ebd1300'))); // add y^12 * (20! / 12!)
  z = z.mul(y).div(EXP_ONE); res = res.add(z.mul(BigNumber.from('0x0000000017499f00'))); // add y^13 * (20! / 13!)
  z = z.mul(y).div(EXP_ONE); res = res.add(z.mul(BigNumber.from('0x0000000001a9d480'))); // add y^14 * (20! / 14!)
  z = z.mul(y).div(EXP_ONE); res = res.add(z.mul(BigNumber.from('0x00000000001c6380'))); // add y^15 * (20! / 15!)
  z = z.mul(y).div(EXP_ONE); res = res.add(z.mul(BigNumber.from('0x000000000001c638'))); // add y^16 * (20! / 16!)
  z = z.mul(y).div(EXP_ONE); res = res.add(z.mul(BigNumber.from('0x0000000000001ab8'))); // add y^17 * (20! / 17!)
  z = z.mul(y).div(EXP_ONE); res = res.add(z.mul(BigNumber.from('0x000000000000017c'))); // add y^18 * (20! / 18!)
  z = z.mul(y).div(EXP_ONE); res = res.add(z.mul(BigNumber.from('0x0000000000000014'))); // add y^19 * (20! / 19!)
  z = z.mul(y).div(EXP_ONE); res = res.add(z.mul(BigNumber.from('0x0000000000000001'))); // add y^20 * (20! / 20!)
  res = res.div(BigNumber.from('0x21c3677c82b40000')).add(y).add(EXP_ONE); // divide by 20! and then add y^1 / 1! + y^0 / 0!

  if (!x.and(BigNumber.from('0x010000000000000000000000000000000')).eq(0)) res = res.mul(BigNumber.from('0x1c3d6a24ed82218787d624d3e5eba95f9')).div(BigNumber.from('0x18ebef9eac820ae8682b9793ac6d1e776')); // multiply by e^2^(-3)
  if (!x.and(BigNumber.from('0x020000000000000000000000000000000')).eq(0)) res = res.mul(BigNumber.from('0x18ebef9eac820ae8682b9793ac6d1e778')).div(BigNumber.from('0x1368b2fc6f9609fe7aceb46aa619baed4')); // multiply by e^2^(-2)
  if (!x.and(BigNumber.from('0x040000000000000000000000000000000')).eq(0)) res = res.mul(BigNumber.from('0x1368b2fc6f9609fe7aceb46aa619baed5')).div(BigNumber.from('0x0bc5ab1b16779be3575bd8f0520a9f21f')); // multiply by e^2^(-1)
  if (!x.and(BigNumber.from('0x080000000000000000000000000000000')).eq(0)) res = res.mul(BigNumber.from('0x0bc5ab1b16779be3575bd8f0520a9f21e')).div(BigNumber.from('0x0454aaa8efe072e7f6ddbab84b40a55c9')); // multiply by e^2^(+0)
  if (!x.and(BigNumber.from('0x100000000000000000000000000000000')).eq(0)) res = res.mul(BigNumber.from('0x0454aaa8efe072e7f6ddbab84b40a55c5')).div(BigNumber.from('0x00960aadc109e7a3bf4578099615711ea')); // multiply by e^2^(+1)
  if (!x.and(BigNumber.from('0x200000000000000000000000000000000')).eq(0)) res = res.mul(BigNumber.from('0x00960aadc109e7a3bf4578099615711d7')).div(BigNumber.from('0x0002bf84208204f5977f9a8cf01fdce3d')); // multiply by e^2^(+2)
  if (!x.and(BigNumber.from('0x400000000000000000000000000000000')).eq(0)) res = res.mul(BigNumber.from('0x0002bf84208204f5977f9a8cf01fdc307')).div(BigNumber.from('0x0000003c6ab775dd0b95b4cbee7e65d11')); // multiply by e^2^(+3)

  return res;
}

// TODO: get the encoded-order as input (similar to how it's done in trade.ts)
export const getEncodedTradeTargetAmount = (
  gradientType: GradientType,
  initialRate: BigNumber,
  multiFactor: BigNumber,
  timeElapsed: BigNumber,
  sourceAmount: BigNumber
): BigNumber => {
  try {
    return uint128(calcTargetAmount(gradientType, initialRate, multiFactor, timeElapsed, sourceAmount));
  } catch (error) {
    return BigNumber.from(0); /* rate = zero / amount = zero */
  }
};

// TODO: get the encoded-order as input (similar to how it's done in trade.ts)
export const getEncodedTradeSourceAmount = (
  gradientType: GradientType,
  initialRate: BigNumber,
  multiFactor: BigNumber,
  timeElapsed: BigNumber,
  targetAmount: BigNumber
): BigNumber => {
  try {
    return uint128(calcSourceAmount(gradientType, initialRate, multiFactor, timeElapsed, targetAmount));
  } catch (error) {
    return MAX_UINT128; /* rate = amount / infinity = zero */
  }
};

export const getEncodedCurrentRate = calcCurrentRate;