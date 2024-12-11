import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import {
  parseUnits as _parseUnits,
  formatUnits as _formatUnits,
} from '@ethersproject/units';
import DecimalJS from 'decimal.js';

const Decimal = DecimalJS.clone();
Decimal.set({
  precision: 100,
  rounding: Decimal.ROUND_HALF_DOWN,
  toExpNeg: -300,
  toExpPos: 300,
});

export { Decimal, BigNumber, BigNumberish };
export type Decimal = DecimalJS;

export const BigNumberMin = (a: BigNumber, b: BigNumber) => (a.lt(b) ? a : b);
export const BigNumberMax = (a: BigNumber, b: BigNumber) => (a.gt(b) ? a : b);

export const ONE = 2 ** 48;
export const TEN = new Decimal(10);

export const tenPow = (dec0: number, dec1: number) => {
  const diff = dec0 - dec1;
  return TEN.pow(diff);
};

export const BnToDec = (x: BigNumber) => new Decimal(x.toString());
export const DecToBn = (x: Decimal) => BigNumber.from(x.toFixed());

export const mulDiv = (x: BigNumber, y: BigNumber, z: BigNumber) =>
  y.eq(z) ? x : x.mul(y).div(z);

export function trimDecimal(input: string, precision: number): string {
  // Use Decimal for precise arithmetic
  const result = new Decimal(input).toFixed(precision, Decimal.ROUND_DOWN);

  // Remove trailing zeros and decimal point if necessary
  return result.replace(/(\.\d*?[1-9])0+$|\.0*$/, '$1');
}

// A take on parseUnits that supports floating point
export function parseUnits(amount: string, decimals: number): BigNumber {
  const trimmed = trimDecimal(amount, decimals);
  return _parseUnits(trimmed, decimals);
}

export function formatUnits(amount: BigNumberish, decimals: number): string {
  const res = _formatUnits(amount, decimals);

  // remove trailing 000
  return new Decimal(res).toFixed();
}
