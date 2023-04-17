import assert from "assert";
import {BigNumber} from '../utils/numerics';

type Tuple = [number, BigNumber];

export function bigger_than(lst: Array<[number, number]>, val: number): Array<[number, number]> {
  return lst.filter(([_, c]) => c >= val);
};

export function sum_me(lst: Array<Tuple>): BigNumber {
  return lst.reduce((acc, [_, c]) => acc.add(c), BigNumber.from(0));
};

export function min_item(lst: Array<[number, number]>): [number, number] {
  const min_c = Math.min(...lst.map(([_, c]) => c));
  const min_c_list = lst.filter(([_, c]) => c === min_c);
  return min_c_list[0];
};

export function min_item_last(lst: Array<Tuple>): Tuple {
  let min: BigNumber | null = null;
  let result: Tuple | null = null;

  for (const [i, c] of lst) {
    if (min === null || c.lt(min)) {
      min = c;
      result = [i, c];
    } else if (c.eq(min)) {
      result = [i, c];
    }
  }

  return result!;
};

export function max_item(lst: Tuple[]): Tuple[] {
  const max_c = lst.reduce((prev, curr) => curr[1].gt(prev[1]) ? curr : prev, [0, BigNumber.from(0)]);
  const max_c_list = lst.filter(([_, c]) => c.eq(max_c[1]));
  return max_c_list;
};

export function get_i(lst: Array<Tuple>, wanted_i: number): Tuple {
  return lst.filter(([i, _]) => i === wanted_i)[0];
};

export function sum_list_indexes(lst: Array<Tuple>): number {
  return lst.reduce((acc, [i, _]) => acc + i, 0);
};

export function list_indexes(lst: Array<Tuple>): Array<number> {
  return lst.map(([i, _]) => i);
};

export function assertion_checks(full_fill: boolean, current_sum: BigNumber, threshold: BigNumber, max_fill: BigNumber, threshold_list: Array<Tuple>, num_values: number): void {
  if (full_fill === true) {
    assert(current_sum.gte(threshold));  /// there was rounding here to 12 decimal places 
  } else {
    assert(current_sum.eq(max_fill));
  }

  if (threshold_list.length < num_values) {
    // do nothing
  } else {
    assert(new Set(list_indexes(threshold_list)).size === num_values);
  }
};