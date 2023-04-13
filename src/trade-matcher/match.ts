import {
  EncodedOrder,
  Rate,
  MatchAction,
  Filter,
  OrdersMap,
} from '../common/types';
import { BigNumber, BigNumberMin } from '../utils/numerics';
import { cmpMin, cmpMax } from './utils';

import {
  getEncodedTradeTargetAmount as getTradeTargetAmount,
  getEncodedTradeSourceAmount as getTradeSourceAmount,
} from './trade';

const getRateBySourceAmount = (
  sourceAmount: BigNumber,
  order: EncodedOrder
): Rate => {
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
  return { input, output };
};

const getRateByTargetAmount = (
  targetAmount: BigNumber,
  order: EncodedOrder
): Rate => {
  const input = BigNumberMin(targetAmount, order.y);
  const output = getTradeSourceAmount(input, order);
  return { input, output };
};

const match = (
  amount: BigNumber,
  orders: OrdersMap,
  filter: Filter,
  trade: (amount: BigNumber, order: EncodedOrder) => Rate,
  cmp: (x: Rate, y: Rate) => number
): MatchAction[] => {
  const actions: MatchAction[] = [];

  for (const { id, rate } of Object.keys(orders)
    .map((id) => ({ id, rate: trade(amount, orders[id]) }))
    .sort((a, b) => cmp(a.rate, b.rate))) {
    if (amount.gt(rate.input)) {
      if (filter(rate)) {
        actions.push({
          id: BigNumber.from(id),
          input: rate.input,
          output: rate.output,
        });
        amount = amount.sub(rate.input);
      }
    } else if (amount.eq(rate.input)) {
      if (filter(rate)) {
        actions.push({
          id: BigNumber.from(id),
          input: rate.input,
          output: rate.output,
        });
      }
      break;
    } /* if (amount.lt(rate.input)) */ else {
      const adjustedRate: Rate = {
        input: amount,
        output: trade(amount, orders[id]).output,
      };
      if (filter(adjustedRate)) {
        actions.push({
          id: BigNumber.from(id),
          input: adjustedRate.input,
          output: adjustedRate.output,
        });
      }
      break;
    }
  }

  return actions;
};

const defaultFilter: Filter = (rate: Rate) =>
  rate.input.gt(0) && rate.output.gt(0);

export const matchBySourceAmount = (
  amount: BigNumber,
  orders: OrdersMap,
  filter: Filter = defaultFilter
): MatchAction[] => {
  return match(amount, orders, filter, getRateBySourceAmount, cmpMin);
};

export const matchByTargetAmount = (
  amount: BigNumber,
  orders: OrdersMap,
  filter: Filter = defaultFilter
): MatchAction[] => {
  return match(amount, orders, filter, getRateByTargetAmount, cmpMax);
};
