import { BigNumber } from '../utils/numerics';
import { max_item, assertion_checks, sum_list_indexes, list_indexes, min_item_last, get_i, sum_me  } from './router_helpers';

export function gen_two_order_selector(amounts: Array<BigNumber>, requested_trade_amount: BigNumber, threshold_orders: number): Array<number> {

    const sortedAmounts = Array.from(amounts).sort((a, b) => {
        if (a.lt(b)) {
            return 1;
        } else if (a.gt(b)) {
            return -1;
        } else {
            return 0;
        }
        });

  let exit_summary = 0;
  let count = 0;
  let indexed_amounts = Array.from(amounts.entries());
  let [max_index, max_val] = max_item(indexed_amounts);
  let threshold_list = indexed_amounts.slice(0, threshold_orders); // set the initial threshold_list as the first orders in the list
  let max_fill = sortedAmounts.slice(0, threshold_orders).reduce((acc, val) => acc.add(val), BigNumber.from(0));

  let current_sum = sum_me(threshold_list);

  // liquidity check to determine partial fill
  let full_fill = requested_trade_amount.lte(max_fill);

  // you have already populated the threshold_list so you can start counting at the next item in the amounts list
  for (let i = threshold_orders; i < amounts.length; i++) {
    count += 1;
    current_sum = sum_me(threshold_list);

    // early exit when a partial fill is met
    if (!full_fill && current_sum == max_fill) {
      exit_summary = 1;
      assertion_checks(full_fill, current_sum, requested_trade_amount, max_fill, threshold_list, threshold_orders);
      let sum_threshold_list_indexes = sum_list_indexes(threshold_list);
      return list_indexes(threshold_list);
    }

    // early exit when we filled the order
    if (current_sum >= requested_trade_amount) {
      exit_summary = 2;
      assertion_checks(full_fill, current_sum, requested_trade_amount, max_fill, threshold_list, threshold_orders);
      let sum_threshold_list_indexes = sum_list_indexes(threshold_list);
      return list_indexes(threshold_list);
    } else {
      let [min_index, min_val] = min_item_last(threshold_list);
      let next_val = get_i(indexed_amounts, i)[1];

      // the next value to insert must be greater than the current value
      if (next_val > min_val) {
        threshold_list.splice(min_index, 1, get_i(indexed_amounts, i));
      }
    }
  }

  exit_summary = 4;
  current_sum = sum_me(threshold_list);
  assertion_checks(full_fill, current_sum, requested_trade_amount, max_fill, threshold_list, threshold_orders);
  let sum_threshold_list_indexes = sum_list_indexes(threshold_list);
  return list_indexes(threshold_list);
}