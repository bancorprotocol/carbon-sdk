import {
  EncodedOrder,
  EncodedOrderBNStr,
  EncodedStrategy,
  EncodedStrategyBNStr,
  MatchAction,
  MatchActionBNStr,
  OrdersMap,
  OrdersMapBNStr,
  RetypeBigIntToString,
  TradeAction,
  TradeActionBNStr,
} from '../common/types';

export const replaceBigIntsWithStrings = <T>(
  obj: T
): RetypeBigIntToString<T> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function replace(obj: any): any {
    if (typeof obj === 'bigint') {
      return obj.toString();
    }

    if (typeof obj === 'object' && obj !== null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newObj: any = Array.isArray(obj) ? [] : {};
      for (const key in obj) {
        newObj[key] = replace(obj[key]);
      }
      return newObj;
    }

    return obj;
  }

  return replace(obj) as RetypeBigIntToString<T>;
};

export const encodedOrderStrToBN = (order: EncodedOrderBNStr): EncodedOrder => {
  return {
    y: BigInt(order.y),
    z: BigInt(order.z),
    A: BigInt(order.A),
    B: BigInt(order.B),
  };
};

export const encodedStrategyBigIntToStr = (
  strategy: EncodedStrategy
): EncodedStrategyBNStr => {
  return replaceBigIntsWithStrings(strategy);
};

export const encodedStrategyStrToBN = (
  strategy: EncodedStrategyBNStr
): EncodedStrategy => {
  return {
    id: BigInt(strategy.id),
    token0: strategy.token0,
    token1: strategy.token1,
    order0: encodedOrderStrToBN(strategy.order0),
    order1: encodedOrderStrToBN(strategy.order1),
  };
};

export const ordersMapBNToStr = (ordersMap: OrdersMap): OrdersMapBNStr => {
  return replaceBigIntsWithStrings(ordersMap);
};

export const ordersMapStrToBN = (ordersMap: OrdersMapBNStr): OrdersMap => {
  const deserialized: OrdersMap = {};
  for (const [id, order] of Object.entries(ordersMap)) {
    deserialized[id] = encodedOrderStrToBN(order);
  }
  return deserialized;
};

export const matchActionBNToStr = (action: MatchAction): MatchActionBNStr => {
  return replaceBigIntsWithStrings(action);
};

export const tradeActionStrToBN = (action: TradeActionBNStr): TradeAction => {
  return {
    strategyId: BigInt(action.strategyId),
    amount: BigInt(action.amount),
  };
};
