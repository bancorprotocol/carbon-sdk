import {
  EncodedOrder,
  Filter,
  MatchAction,
  MatchOptions,
  MatchType,
  OrdersMap,
  Quote,
  Rate,
} from '../common/types';
import { decodeFloat } from '../utils/encoders';
import { BigNumberMin } from '../utils/numerics';
import {
  getEncodedTradeTargetAmount as tradeTargetAmount,
  getEncodedTradeSourceAmount as tradeSourceAmount,
} from './trade';
import { sortByMaxRate, sortByMinRate } from './utils';

const rateBySourceAmount = (
  sourceAmount: bigint,
  order: EncodedOrder
): Rate => {
  let input = sourceAmount;
  let output = tradeTargetAmount(input, order);
  if (output > order.y) {
    input = tradeSourceAmount(order.y, order);
    output = tradeTargetAmount(input, order);
    while (output > order.y) {
      input = input - 1n;
      output = tradeTargetAmount(input, order);
    }
  }
  return { input, output };
};

const rateByTargetAmount = (
  targetAmount: bigint,
  order: EncodedOrder
): Rate => {
  const input = BigNumberMin(targetAmount, order.y);
  const output = tradeSourceAmount(input, order);
  return { input, output };
};

const getParams = (order: EncodedOrder) => {
  const [y, z, A, B] = [order.y, order.z, decodeFloat(order.A), decodeFloat(order.B)];
  return [y, z, A, B];
};

const getLimit = (order: EncodedOrder): bigint => {
  const [y, z, A, B] = getParams(order);
  return z > 0n ? (y * A + z * B) / z : 0n;
};

const equalTargetAmount = (order: EncodedOrder, limit: bigint): bigint => {
  const [y, z, A, B] = getParams(order);
  return A > 0n
    ? (y * A + z * (B - limit)) / A
    : y;
};

const equalSourceAmount = (order: EncodedOrder, limit: bigint): bigint => {
  return tradeSourceAmount(equalTargetAmount(order, limit), order);
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
  amount: bigint,
  ordersMap: OrdersMap,
  trade: (amount: bigint, order: EncodedOrder) => Rate,
  sort: (x: Rate, y: Rate) => number
): Quote[] =>
  Object.keys(ordersMap)
    .map((id) => ({
      id: BigInt(id),
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
const matchFast = (
  amount: bigint,
  ordersMap: OrdersMap,
  quotes: Quote[],
  filter: Filter,
  trade: (amount: bigint, order: EncodedOrder) => Rate
): MatchAction[] => {
  const actions: MatchAction[] = [];
  let remainingAmount = amount;

  for (const quote of quotes) {
    const input: bigint = BigNumberMin(quote.rate.input, remainingAmount);
    const output: bigint = trade(input, ordersMap[quote.id.toString()]).output;
    if (filter({input, output})) {
      actions.push({id: quote.id, input, output});
      remainingAmount = remainingAmount - input;
      if (remainingAmount === 0n) {
        break;
      }
    }
  }

  return actions;
};

/**
 * Compute a list of {order id, trade amount} tuples:
 * - Iterate the orders from best rate to worst rate:
 *   - Calculate a trade which brings orders `0` thru `n - 1` to the rate of order `n`
 *   - If the result is larger than or equal to the requested trade amount, then stop
 * - If the result is larger than the requested trade amount:
 *   - Determine a rate `r` between the rate of order `n - 1` and the rate of order `n`
 *   - Calculate a trade which brings orders `0` thru `n - 1` to the rate `r`
 *   - If the result is equal to the requested trade amount, then stop
 */
const matchBest = (
  amount: bigint,
  ordersMap: OrdersMap,
  quotes: Quote[],
  filter: Filter,
  trade: (amount: bigint, order: EncodedOrder) => Rate,
  equalize: (order: EncodedOrder, limit: bigint) => bigint
): MatchAction[] => {
  const order0: EncodedOrder = {
    y: 0n,
    z: 0n,
    A: 0n,
    B: 0n,
  };
  const orders = quotes
    .map((quote) => ordersMap[quote.id.toString()])
    .concat(order0);

  let rates: Rate[] = [];
  let limit = 0n;
  let total = 0n;
  let delta = 0n;

  for (let n = 1; n < orders.length; n++) {
    limit = getLimit(orders[n]);
    rates = orders
      .slice(0, n)
      .map((order) => trade(equalize(order, limit), order));
    total = rates.reduce((sum, rate) => sum + rate.input, 0n);
    delta = total - amount;
    if (delta === 0n) {
      break;
    }
    if (delta > 0n) {
      let lo = limit;
      let hi = getLimit(orders[n - 1]);
      while (lo + 1n < hi) {
        limit = (lo + hi) / 2n;
        rates = orders
          .slice(0, n)
          .map((order) => trade(equalize(order, limit), order));
        total = rates.reduce(
          (sum, rate) => sum + rate.input,
          0n
        );
        delta = total - amount;
        if (delta > 0n) {
          lo = limit;
        } else if (delta < 0n) {
          hi = limit;
        } /* if (delta === 0n) */ else {
          break;
        }
      }
      break;
    }
  }

  if (delta > 0n) {
    for (let i = rates.length - 1; i >= 0; i--) {
      const rate = trade(rates[i].input - delta, orders[i]);
      delta = delta + (rate.input - rates[i].input);
      rates[i] = rate;
      if (delta <= 0n) {
        break;
      }
    }
  } else if (delta < 0n) {
    for (let i = 0; i <= rates.length - 1; i++) {
      const rate = trade(rates[i].input - delta, orders[i]);
      delta = delta + (rate.input - rates[i].input);
      if (delta > 0n) {
        break;
      }
      rates[i] = rate;
    }
  }

  return [...Array(rates.length).keys()]
    .filter((i) => filter(rates[i]))
    .map((i) => ({
      id: quotes[i].id,
      input: rates[i].input,
      output: rates[i].output,
    }));
};

const matchBy = (
  amount: bigint,
  ordersMap: OrdersMap,
  matchTypes: MatchType[],
  filter: Filter,
  trade: (amount: bigint, order: EncodedOrder) => Rate,
  sort: (x: Rate, y: Rate) => number,
  equalize: (order: EncodedOrder, limit: bigint) => bigint
): MatchOptions => {
  const quotes = sortedQuotes(amount, ordersMap, trade, sort);
  const res: MatchOptions = {};
  if (matchTypes.includes(MatchType.Fast)) {
    res[MatchType.Fast] = matchFast(amount, ordersMap, quotes, filter, trade);
  }
  if (matchTypes.includes(MatchType.Best)) {
    res[MatchType.Best] = matchBest(
      amount,
      ordersMap,
      quotes,
      filter,
      trade,
      equalize
    );
  }
  return res;
};

const defaultFilter: Filter = (rate: Rate) =>
  rate.input > 0n && rate.output > 0n;

export const matchBySourceAmount = (
  amount: bigint,
  ordersMap: OrdersMap,
  matchTypes: MatchType[],
  filter: Filter = defaultFilter
): MatchOptions => {
  return matchBy(
    amount,
    ordersMap,
    matchTypes,
    filter,
    rateBySourceAmount,
    sortByMinRate,
    equalSourceAmount
  );
};

export const matchByTargetAmount = (
  amount: bigint,
  ordersMap: OrdersMap,
  matchTypes: MatchType[],
  filter: Filter = defaultFilter
): MatchOptions => {
  return matchBy(
    amount,
    ordersMap,
    matchTypes,
    filter,
    rateByTargetAmount,
    sortByMaxRate,
    equalTargetAmount
  );
};
