import { EncodedOrder, Rate, MatchAction, Filter } from '../common/types';
import { BigNumber, BigNumberMin, BnToDec, DecToBn, Decimal } from '../utils/numerics';
import { gen_two_order_selector } from './gen_two_order_selector';
import { calc_dxfromdy_f, calc_dyfromp_f, goalseek, get_geoprice } from './dyfrom_fs';

import {
  getEncodedTradeTargetAmount as getTradeTargetAmount,
  getEncodedTradeSourceAmount as getTradeSourceAmount,
} from './trade';

export type OrdersMap = {
  [orderId: string]: EncodedOrder;
};

function compareTo(a: BigNumber, b: BigNumber): number {
  if (a.lt(b)) {
    return -1;
  } else if (a.eq(b)) {
    return 0;
  } else {
    return 1;
  }
}

function find_duplicates(input: Array<Array<number | BigNumber>>): Array<Set<number>> {
  const duplicates = new Map<string, number>();
  const output: Array<Set<number>> = [];
  input.forEach(sublist => {
    const [first, second] = sublist;
    const secondStr = second.toString();
    if (duplicates.has(secondStr)) {
      const index = duplicates.get(secondStr)!;
      output[index].add(first as number);
    } else {
      duplicates.set(secondStr, output.length);
      output.push(new Set([first as number]));
    }
  });
  return output.filter(set => set.size > 1);
}

function reorder_sublists(referenceList: Array<number | BigNumber>, sublists: Array<Array<number | BigNumber>>): Array<Array<number | BigNumber>> {
  const output: Array<Array<number | BigNumber>> = [];
  referenceList.forEach((num) => {
    const matchingSublists = sublists.filter((sublist) => sublist[0] === num);
    output.push(...matchingSublists);
  });
  return output;
}

function rerun_and_reorder(
    ordered_amts: Array<Array<number | BigNumber>>,
    orders_to_rerun: Array<Set<number>>, 
    orders: OrdersMap,
    byTarget: boolean,
    ): Array<Array<number | BigNumber>> {
      if (byTarget) {
        const rerun_output_amts: Array<Array<number | BigNumber>> = [];
        let keys_list = ordered_amts.map(sublist => sublist[0]);
        for (const set_a of orders_to_rerun) {
          for (const i of set_a) {
            rerun_output_amts.push([
              i,
              getTradeByTargetAmount(BigNumber.from(1000), orders[i])
            ]);
          }
          rerun_output_amts.sort((a, b) => { // switching b and a here changes ascending/descending a,b for byTarget
            const resultA = a[1] as BigNumber;
            const resultB = b[1] as BigNumber;
            return compareTo(resultA, resultB);
          });
          const rerun_ordered_amts_indexes = rerun_output_amts.map(sublist => sublist[0]);
          const min_index = Math.min(...keys_list.map((c, i) => rerun_ordered_amts_indexes.includes(c) ? i : Infinity));
          const max_index = Math.max(...keys_list.map((c, i) => rerun_ordered_amts_indexes.includes(c) ? i : -Infinity));
          keys_list = [...keys_list.slice(0, min_index), ...rerun_ordered_amts_indexes, ...keys_list.slice(max_index + 1)].map((x) => Number(x));  
        }
        const correct_order = reorder_sublists(keys_list, ordered_amts);
        return correct_order;
      }
      else { //bySource
        const rerun_output_amts: Array<Array<number | BigNumber>> = [];
        let keys_list = ordered_amts.map(sublist => sublist[0]);
        for (const set_a of orders_to_rerun) {
          for (const i of set_a) {
            rerun_output_amts.push([
              i,
              getTradeBySourceAmount(BigNumber.from(1000), orders[i])
            ]);
          }
          rerun_output_amts.sort((b, a) => { // switching b and a here changes ascending/descending b,a for bySource
            const resultA = a[1] as BigNumber;
            const resultB = b[1] as BigNumber;
            return compareTo(resultA, resultB);
          });
          const rerun_ordered_amts_indexes = rerun_output_amts.map(sublist => sublist[0]);
          const min_index = Math.min(...keys_list.map((c, i) => rerun_ordered_amts_indexes.includes(c) ? i : Infinity));
          const max_index = Math.max(...keys_list.map((c, i) => rerun_ordered_amts_indexes.includes(c) ? i : -Infinity));
          keys_list = [...keys_list.slice(0, min_index), ...rerun_ordered_amts_indexes, ...keys_list.slice(max_index + 1)].map((x) => Number(x));  
        }
        const correct_order = reorder_sublists(keys_list, ordered_amts);
        return correct_order;
      }
}

function dy_f(orders: EncodedOrder[], p: Decimal): BigNumber {
  let dy_amounts: Array<BigNumber> = [];
  for (const order of orders) {
    dy_amounts.push(calc_dyfromp_f(order, p, true))
  }
  return dy_amounts.reduce((acc, curr) => acc.add(curr))
}

function dx_f(orders: EncodedOrder[], p: Decimal): BigNumber {
  let dx_amounts: Array<BigNumber> = [];
  for (const order of orders) {
    const dy = calc_dyfromp_f(order, p, false)
    dx_amounts.push(calc_dxfromdy_f(order, dy, false))
  }
  return dx_amounts.reduce((acc, curr) => acc.add(curr))
}

const getTradeByTargetAmount = (
  targetAmount: BigNumber,
  order: EncodedOrder
): BigNumber => {
  const output = getTradeSourceAmount(targetAmount, order);
  // console.log(BnToDec(targetAmount), BnToDec(output))
  return output;
};

const getTradeBySourceAmount = (
  sourceAmount: BigNumber,
  order: EncodedOrder
): BigNumber => {
  const output = getTradeTargetAmount(sourceAmount, order);
  // console.log(BnToDec(targetAmount), BnToDec(output))
  return output;
};

const getRateBySourceAmount_alt = (
  sourceAmount: BigNumber,
  order: EncodedOrder
): [BigNumber, BigNumber] => {
  let input = sourceAmount;
  let output = getTradeTargetAmount(input, order);
  if (output.gt(order.y)) {
    input = getTradeSourceAmount(order.y, order);
    output = getTradeTargetAmount(input, order);
    while (output.gt(order.y)) {
      input = input.sub(1);
      output = getTradeTargetAmount(input, order);
    }
  }
  return [input, output];
};

function get_min_action_verification(actions_alpha: [number, BigNumber, BigNumber][], orders: OrdersMap, amount: BigNumber, isPartial: Boolean): [BigNumber, BigNumber, BigNumber][] {
  let actions_min: [BigNumber, BigNumber, BigNumber][] = [];
  for (let i = 0; i < actions_alpha.length; i++) {
    const id = actions_alpha[i][0]
    const id_num = id
    const input = actions_alpha[i][2]
    const mini = getRateBySourceAmount_alt(input, orders[id_num])
    const input_min = mini[0]
    const output_min = mini[1]
    actions_min.push([BigNumber.from(id), output_min, input_min])
  }

  const new_total_input = actions_min.reduce((acc, sublist) => acc.add(sublist[2]), BigNumber.from(0))
  let input_delta = new_total_input.sub(amount)
  if (input_delta.gt(0) && !isPartial) {
    const last_action = actions_min[actions_min.length - 1]
    const last_id = last_action[0].toNumber()
    const last_input = last_action[2]
    const last_mini = getRateBySourceAmount_alt(last_input.sub(input_delta), orders[last_id])
    actions_min[actions_min.length - 1] = [BigNumber.from(last_id), last_mini[1], last_mini[0]]
  }
 return actions_min
}



export const matchByTargetAmount_alpha = (
  amount: BigNumber,
  orders: OrdersMap,
  threshold_orders: number,
): MatchAction[] => {
  const actions: MatchAction[] = [];
  console.log("Alpha Match by Target")
  const support_partial: boolean = true

  const indexes = Array.from({length: Object.keys(orders).length}, (_, i) => i)
  const hypothetical_output_amts: Array<Array<number | BigNumber>> = [];
    for (const i of indexes) {
    hypothetical_output_amts.push([
      i,
      getTradeByTargetAmount(amount, orders[i])
    ]);
  }

  const ordered_amts = hypothetical_output_amts.slice().sort((a, b) => { // switching b and a here changes ascending/descending a,b for byTarget
    const resultA = a[1] as BigNumber;
    const resultB = b[1] as BigNumber;
    return compareTo(resultA, resultB)
  });

  const orders_to_rerun = find_duplicates(ordered_amts)
  const new_ordered_amts = rerun_and_reorder(ordered_amts, orders_to_rerun, orders, true)

  const ordered_associated_liquidity: Array<Array<number | BigNumber>> = [];
  let new_ordered_keys_list = new_ordered_amts.map(sublist => sublist[0] as number);
    for (const i of new_ordered_keys_list) {
      ordered_associated_liquidity.push([
      i,
      orders[i].y
    ]);
  }

  const total_liquidity = ordered_associated_liquidity.reduce((acc, sublist) => acc.add(sublist[1]), BigNumber.from(0));

  const ordered_associated_liquidity_values = ordered_associated_liquidity.map(sublist => sublist[1] as BigNumber);

  let passedIndexes: Array<number> = [];
  let top_n_threshold_orders: Array<number> = [];
  if (!support_partial && total_liquidity.lt(amount)) { //the amount was abs here
    throw new Error('Insufficient Liquidity');
  } else {
    passedIndexes = gen_two_order_selector(ordered_associated_liquidity_values, amount, threshold_orders); //the amount was abs here
    top_n_threshold_orders = passedIndexes.map(i => Array.from(ordered_associated_liquidity[i])[0] as number);
  }

  const order_subset = top_n_threshold_orders.map((i: number) => orders[i]);
  const total_subset_liquidity = order_subset.reduce((acc, o) => acc.add(o.y), BigNumber.from(0));

  let rl1: Array<BigNumber> = [];
  let rl2: Array<BigNumber> = [];
  let isPartial = false;

  if (amount.eq(total_subset_liquidity)) {
    for (const order of order_subset) {
      rl1.push(order.y)
      rl2.push(getTradeByTargetAmount(order.y, order))
    } 
  } else if (amount.gt(total_subset_liquidity)) {
    if (support_partial) {
      amount = total_subset_liquidity;
      for (const order of order_subset) {
        rl1.push(order.y)
        rl2.push(getTradeByTargetAmount(order.y, order))
      } 
      isPartial = true;
    } else {
      throw new Error('Insufficient Liquidity with threshold orders');
    }
  } else {
    const p_goal = goalseek((p: Decimal) => dy_f(order_subset, p).sub(amount), new Decimal('1e-20'), new Decimal('1e48'));
    for (const order of order_subset) {
      const dy = calc_dyfromp_f(order, p_goal, true)
      rl1.push(dy)
      rl2.push(calc_dxfromdy_f(order, dy, true))
    } 
  }

  const new_actions: [number, BigNumber, BigNumber][] = top_n_threshold_orders.map((v, n) => [
    v,
    rl1[n],
    rl2[n],
  ]);

  const actions_alpha = new_actions.filter(sublist => sublist[2].gt(0));

  for (let i = 0; i < actions_alpha.length; i++) {
    actions.push({
      id: BigNumber.from(actions_alpha[i][0]),
      input: actions_alpha[i][1],
      output: actions_alpha[i][2],
    })
  }
  return actions;
};

export const matchBySourceAmount_alpha = (
  amount: BigNumber,
  orders: OrdersMap,
  threshold_orders: number,
): MatchAction[] => {
  const actions: MatchAction[] = [];
  console.log("Alpha Match by Source")
  const support_partial: boolean = true

  const indexes = Array.from({length: Object.keys(orders).length}, (_, i) => i)
  const hypothetical_output_amts: Array<Array<number | BigNumber>> = [];
    for (const i of indexes) {
    hypothetical_output_amts.push([
      i,
      getTradeBySourceAmount(amount, orders[i])
    ]);
  }

  const ordered_amts = hypothetical_output_amts.slice().sort((b, a) => { // switching b and a here changes ascending/descending b,a for bySource
    const resultA = a[1] as BigNumber;
    const resultB = b[1] as BigNumber;
    return compareTo(resultA, resultB)
  });

  const orders_to_rerun = find_duplicates(ordered_amts)
  const new_ordered_amts = rerun_and_reorder(ordered_amts, orders_to_rerun, orders, false)

  const available_values: Array<Array<number | BigNumber>> = [];
  for (const [k, v] of new_ordered_amts) {
    const k_num = k as number;
    const v_num = BnToDec(v as BigNumber);
    const y_val = BnToDec(orders[k_num].y);
    if (v_num.gt(y_val)) {
      const price = get_geoprice(orders[k_num]);
      available_values.push([k_num, DecToBn(y_val.div(price).floor())]);
    } else {
      const price = v_num.div(BnToDec(amount));
      available_values.push([k_num, DecToBn(v_num.div(price).floor())]);
    }
  }

  let new_ordered_keys_list = new_ordered_amts.map(sublist => sublist[0] as number);
  const ordered_available_values = reorder_sublists(new_ordered_keys_list, available_values)

  const total_liquidity = ordered_available_values.reduce((acc, sublist) => acc.add(sublist[1]), BigNumber.from(0));
  const ordered_associated_liquidity_values = ordered_available_values.map(sublist => sublist[1] as BigNumber);

  let passedIndexes: Array<number> = [];
  let top_n_threshold_orders: Array<number> = [];
  if (!support_partial && total_liquidity.lt(amount)) { //the amount was abs here
    throw new Error('Insufficient Liquidity');
  } else {
    passedIndexes = gen_two_order_selector(ordered_associated_liquidity_values, amount, threshold_orders); //the amount was abs here
    top_n_threshold_orders = passedIndexes.map(i => Array.from(ordered_available_values[i])[0] as number);
  }

  const order_subset = top_n_threshold_orders.map((i: number) => orders[i]);
  const total_subset_liquidity = ordered_available_values.filter(([k, v]) => top_n_threshold_orders.includes(k as number)).reduce((acc, [k, v]) => acc.add(v), BigNumber.from(0));

  let rl1: Array<BigNumber> = [];
  let rl2: Array<BigNumber> = [];
  let isPartial = false;

  if (amount.gt(total_subset_liquidity)) {
    if (support_partial) {
      amount = total_subset_liquidity;
      for (const order of order_subset) {
        rl1.push(order.y)
        rl2.push(getTradeByTargetAmount(order.y, order))
      } 
      isPartial = true;
    } else {
      throw new Error('Insufficient Liquidity with threshold orders');
    }
  } else {
    const p_goal = goalseek((p: Decimal) => dx_f(order_subset, p).sub(amount), new Decimal('1e-20'), new Decimal('1e48'));
    for (const order of order_subset) {
      const dy = calc_dyfromp_f(order, p_goal, false)
      rl1.push(dy)
      rl2.push(calc_dxfromdy_f(order, dy, false))
    } 
  }

  const new_actions: [number, BigNumber, BigNumber][] = top_n_threshold_orders.map((v, n) => [
    v,
    rl1[n],
    rl2[n],
  ]);

  const actions_alpha = new_actions.filter(sublist => sublist[2].gt(0));

  let actions_alpha2: [BigNumber, BigNumber, BigNumber][] = [];
  const total_input = actions_alpha.reduce((acc, sublist) => acc.add(sublist[2]), BigNumber.from(0));
  actions_alpha2 = get_min_action_verification(actions_alpha, orders, amount, isPartial)

  for (let i = 0; i < actions_alpha2.length; i++) {
    actions.push({
      id: actions_alpha2[i][0],
      input: actions_alpha2[i][2],
      output: actions_alpha2[i][1],
    })
  }
  return actions;
};