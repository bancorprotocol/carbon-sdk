import { Rate } from '../common/types';
import { BigNumber } from '../utils/numerics';

export const MAX_UINT128 = BigNumber.from(2).pow(128).sub(1);
export const MAX_UINT256 = BigNumber.from(2).pow(256).sub(1);

export const uint128 = (n: BigNumber) => check(n, MAX_UINT128);
export const add = (a: BigNumber, b: BigNumber) => check(a.add(b), MAX_UINT256);
export const sub = (a: BigNumber, b: BigNumber) => check(a.sub(b), MAX_UINT256);
export const mul = (a: BigNumber, b: BigNumber) => check(a.mul(b), MAX_UINT256);
export const mulDivF = (a: BigNumber, b: BigNumber, c: BigNumber) => check(a.mul(b).div(c), MAX_UINT256);
export const mulDivC = (a: BigNumber, b: BigNumber, c: BigNumber) => check(a.mul(b).add(c).sub(1).div(c), MAX_UINT256);
export const minFactor = (a: BigNumber, b: BigNumber) => mulDivC(a, b, MAX_UINT256);

export const sortByMinRate = (x: Rate, y: Rate): number => {
  const lhs = x.output.mul(y.input);
  const rhs = y.output.mul(x.input);
  const lt = lhs.lt(rhs);
  const gt = lhs.gt(rhs);
  const eq = !lt && !gt;
  const is_lt = lt || (eq && x.output.lt(y.output));
  const is_gt = gt || (eq && x.output.gt(y.output));
  return +is_lt - +is_gt;
};

export const sortByMaxRate = (x: Rate, y: Rate): number => sortByMinRate(y, x);

function check(val: BigNumber, max: BigNumber) {
  if (val.gte(0) && val.lte(max)) {
    return val;
  }
  throw null;
}
