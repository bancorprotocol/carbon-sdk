import {
  EncodedOrder,
  Filter,
  MatchAction,
  OrdersMap,
  Quote,
  Rate,
} from '../common/types';
import { BigNumber, BigNumberMin } from '../utils/numerics';
import {
  getEncodedTradeTargetAmount as tradeTargetAmount,
  getEncodedTradeSourceAmount as tradeSourceAmount,
} from './trade';
import { sortByMaxRate, sortByMinRate } from './utils';

const rateBySourceAmount = (
  sourceAmount: BigNumber,
  order: EncodedOrder
): Rate => {
  let input = sourceAmount;
  let output = tradeTargetAmount(input, order);
  if (output.gt(order.y)) {
    input = tradeSourceAmount(order.y, order);
    output = tradeTargetAmount(input, order);
    while (output.gt(order.y)) {
      input = input.sub(1);
      output = tradeTargetAmount(input, order);
    }
  }
  return { input, output };
};

const rateByTargetAmount = (
  targetAmount: BigNumber,
  order: EncodedOrder
): Rate => {
  const input = BigNumberMin(targetAmount, order.y);
  const output = tradeSourceAmount(input, order);
  return { input, output };
};

/**
 * Sort the orders from best rate to worst rate:
 * - Compute the rate of an order:
 *   - Let `x` denote the maximum tradable amount not larger than `n`
 *   - Let `y` denote the output amount of trading `x`
 *   - The rate is determined as `y / x`
 * - Compute the rates of two orders:
 *   - If the rates are different, then the one with a better value prevails
 *   - If the rates are identical, then the one with a better value of `y` prevails
 */
const sortedQuotes = (
  amount: BigNumber,
  ordersMap: OrdersMap,
  trade: (amount: BigNumber, order: EncodedOrder) => Rate,
  sort: (x: Rate, y: Rate) => number
): Quote[] =>
  Object.keys(ordersMap)
    .map((id) => ({
      id: BigNumber.from(id),
      rate: trade(amount, ordersMap[id]),
    }))
    .sort((a, b) => sort(a.rate, b.rate));

/**
 * Compute a list of {order id, trade amount} tuples:
 * - Let `n` denote the initial input amount
 * - Iterate the orders from best rate to worst rate:
 *   - Let `m` denote the maximum tradable amount not larger than `n`
 *   - Add the id of the order along with `m` to the output matching
 *   - Subtract `m` from `n` and repeat the process until `n` is zero
 */
const matchBy = (
  amount: BigNumber,
  ordersMap: OrdersMap,
  filter: Filter,
  trade: (amount: BigNumber, order: EncodedOrder) => Rate,
  sort: (x: Rate, y: Rate) => number
): MatchAction[] => {
  const actions: MatchAction[] = [];

  for (const quote of sortedQuotes(amount, ordersMap, trade, sort)) {
    const input: BigNumber = BigNumberMin(quote.rate.input, amount);
    const output: BigNumber = trade(input, ordersMap[quote.id.toString()]).output;
    if (filter({input, output})) {
      actions.push({id: quote.id, input, output});
      amount = amount.sub(input);
      if (amount.eq(0)) {
        break;
      }
    }
  }

  return actions;
};

const defaultFilter: Filter = (rate: Rate) =>
  rate.input.gt(0) && rate.output.gt(0);

export const matchBySourceAmount = (
  amount: BigNumber,
  ordersMap: OrdersMap,
  filter: Filter = defaultFilter
): MatchAction[] => {
  return matchBy(
    amount,
    ordersMap,
    filter,
    rateBySourceAmount,
    sortByMinRate
  );
};

export const matchByTargetAmount = (
  amount: BigNumber,
  ordersMap: OrdersMap,
  filter: Filter = defaultFilter
): MatchAction[] => {
  return matchBy(
    amount,
    ordersMap,
    filter,
    rateByTargetAmount,
    sortByMaxRate
  );
};
