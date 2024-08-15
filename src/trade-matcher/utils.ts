import { Rate } from '../common/types';

function check(val: bigint, max: bigint) {
  if (val >= 0n && val <= max) {
    return val;
  }
  throw null;
}

export const MAX_UINT128 = 2n ** 128n - 1n;
export const MAX_UINT256 = 2n ** 256n - 1n;

export const uint128 = (n: bigint): bigint => check(n, MAX_UINT128);
export const add = (a: bigint, b: bigint): bigint => check(a + b, MAX_UINT256);
export const sub = (a: bigint, b: bigint): bigint => check(a - b, MAX_UINT256);
export const mul = (a: bigint, b: bigint): bigint => check(a * b, MAX_UINT256);
export const mulDivF = (a: bigint, b: bigint, c: bigint): bigint =>
  check((a * b) / c, MAX_UINT256);
export const mulDivC = (a: bigint, b: bigint, c: bigint): bigint =>
  check((a * b + c - 1n) / c, MAX_UINT256);
export const minFactor = (a: bigint, b: bigint) => mulDivC(a, b, MAX_UINT256);

export const sortByMinRate = (x: Rate, y: Rate): number => {
  const lhs = x.output * y.input;
  const rhs = y.output * x.input;
  const lt = lhs < rhs;
  const gt = lhs > rhs;
  const eq = !lt && !gt;
  const is_lt = lt || (eq && x.output < y.output);
  const is_gt = gt || (eq && x.output > y.output);
  return +is_lt - +is_gt;
};

export const sortByMaxRate = (x: Rate, y: Rate): number => sortByMinRate(y, x);
