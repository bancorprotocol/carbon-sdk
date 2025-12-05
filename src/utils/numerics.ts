import { parseUnits as _parseUnits, formatUnits as _formatUnits } from 'ethers';
import DecimalJS from 'decimal.js';

const Decimal = DecimalJS.clone();
Decimal.set({
  precision: 100,
  rounding: Decimal.ROUND_HALF_DOWN,
  toExpNeg: -300,
  toExpPos: 300,
});

export type BigIntish = string | number | bigint;

export { Decimal };
export type Decimal = DecimalJS;

export const BigNumberMin = (a: BigIntish, b: BigIntish): bigint => {
  const aBN = BigInt(a);
  const bBN = BigInt(b);
  return aBN < bBN ? aBN : bBN;
};

export const BigNumberMax = (a: BigIntish, b: BigIntish): bigint => {
  const aBN = BigInt(a);
  const bBN = BigInt(b);
  return aBN > bBN ? aBN : bBN;
};

export const ONE = 2n ** 48n;
export const TEN = new Decimal(10);
export const MAX_UINT256 = 2n ** 256n - 1n;

export const tenPow = (dec0: number, dec1: number) => {
  const diff = dec0 - dec1;
  return TEN.pow(diff);
};

export const BnToDec = (x: bigint): Decimal => new Decimal(x.toString());
export const DecToBn = (x: Decimal): bigint => BigInt(x.toFixed());

export const mulDiv = (x: bigint, y: bigint, z: bigint): bigint =>
  y === z ? x : (x * y) / z;

export function trimDecimal(input: string, precision: number): string {
  // Use Decimal for precise arithmetic
  const result = new Decimal(input).toFixed(precision, Decimal.ROUND_DOWN);

  // Remove trailing zeros and decimal point if necessary
  return result.replace(/(\.\d*?[1-9])0+$|\.0*$/, '$1');
}

// A take on parseUnits that supports floating point
export function parseUnits(amount: string, decimals: number): bigint {
  const trimmed = trimDecimal(amount, decimals);
  return _parseUnits(trimmed, decimals);
}

export function formatUnits(amount: BigIntish, decimals: number): string {
  const amountBN = BigInt(amount);
  const res = _formatUnits(amountBN, decimals);

  // remove trailing 000
  return new Decimal(res).toFixed();
}
