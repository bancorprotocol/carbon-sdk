import type { TransactionRequest } from 'ethers';

// Type aliases for ethers v6 compatibility
export type PopulatedTransaction = TransactionRequest;
export type PayableOverrides = TransactionRequest;

export type RetypeProps<T, From, To> = {
  [K in keyof T]: T[K] extends From
    ? To
    : T[K] extends object
    ? RetypeProps<T[K], From, To>
    : T[K];
};

export type RetypeBigIntToString<T> = RetypeProps<T, bigint, string>;

export type Rate = {
  input: bigint;
  output: bigint;
};

export type RateBNStr = RetypeBigIntToString<Rate>;

export type Quote = {
  id: bigint;
  rate: Rate;
};

export type QuoteBNStr = RetypeBigIntToString<Quote>;

export type TradeAction = {
  strategyId: bigint;
  amount: bigint;
};

export type TradeActionBNStr = RetypeBigIntToString<TradeAction>;

export type Filter = (rate: Rate) => boolean;

export enum MatchType {
  Fast = 'Fast',
  Best = 'Best',
}

export type MatchAction = {
  id: bigint;
  input: bigint;
  output: bigint;
};

export type MatchActionBNStr = RetypeBigIntToString<MatchAction>;

export type MatchOptions = {
  [key in MatchType]?: MatchAction[];
};

export type MatchOptionsBNStr = RetypeBigIntToString<MatchOptions>;

export type TokenPair = [string, string];

export type EncodedOrder = {
  y: bigint;
  z: bigint;
  A: bigint;
  B: bigint;
};

export type EncodedOrderBNStr = RetypeBigIntToString<EncodedOrder>;

export enum GradientType {
  LinearIncrease = 0,
  LinearDecrease = 1,
  LinearInverseIncrease = 2,
  LinearInverseDecrease = 3,
  ExponentialIncrease = 4,
  ExponentialDecrease = 5,
}

export type GradientEncodedOrder = {
  liquidity: bigint;
  initialPrice: bigint;
  tradingStartTime: bigint;
  expiry: bigint;
  multiFactor: bigint;
  gradientType: bigint;
};

export type GradientEncodedOrderBNStr =
  RetypeBigIntToString<GradientEncodedOrder>;

export type DecodedOrder = {
  liquidity: string;
  lowestRate: string;
  highestRate: string;
  marginalRate: string;
};

export type GradientDecodedOrder = {
  liquidity: string;
  initialPrice: string;
  tradingStartTime: number;
  expiry: number;
  multiFactor: string;
  gradientType: GradientType;
};

export type OrdersMap = {
  [orderId: string]: EncodedOrder;
};

export type OrdersMapBNStr = RetypeBigIntToString<OrdersMap>;

export type EncodedStrategy = {
  id: bigint;
  token0: string;
  token1: string;
  order0: EncodedOrder;
  order1: EncodedOrder;
};

export type EncodedStrategyBNStr = RetypeBigIntToString<EncodedStrategy>;

export type GradientEncodedStrategy = {
  id: bigint;
  token0: string;
  token1: string;
  order0: GradientEncodedOrder;
  order1: GradientEncodedOrder;
};

export type GradientEncodedStrategyBNStr =
  RetypeBigIntToString<GradientEncodedStrategy>;

export type DecodedStrategy = {
  token0: string;
  token1: string;
  order0: DecodedOrder;
  order1: DecodedOrder;
};

export type GradientDecodedStrategy = {
  token0: string;
  token1: string;
  order0: GradientDecodedOrder;
  order1: GradientDecodedOrder;
};

export type TradingFeeUpdate = [string, string, number];

export type Action = {
  id: string;
  sourceAmount: string;
  targetAmount: string;
};

/**
 * A token resolution buy-sell trading strategy for a pair of tokens.
 */
export type Strategy = {
  id: string;
  baseToken: string;
  quoteToken: string;
  buyPriceLow: string; // in quote tkn per 1 base tkn
  buyPriceMarginal: string; // in quote tkn per 1 base tkn
  buyPriceHigh: string; // in quote tkn per 1 base tkn
  buyBudget: string; // in quote tkn
  sellPriceLow: string; // in quote tkn per 1 base tkn
  sellPriceMarginal: string; // in quote tkn per 1 base tkn
  sellPriceHigh: string; // in quote tkn per 1 base tkn
  sellBudget: string; // in base tkn
  encoded: EncodedStrategyBNStr; // the encoded strategy
};

export type GradientStrategy = {
  type: 'gradient';
  id: string;
  baseToken: string;
  quoteToken: string;
  buyPriceStart: string; // in quote tkn per 1 base tkn
  buyPriceEnd: string; // in quote tkn per 1 base tkn
  buyBudget: string; // in quote tkn
  buyGradientType: GradientType;
  buyStartTime: number; // unix timestamp in seconds
  buyEndTime: number; // unix timestamp in seconds
  sellPriceStart: string; // in quote tkn per 1 base tkn
  sellPriceEnd: string; // in quote tkn per 1 base tkn
  sellBudget: string; // in base tkn
  sellGradientType: GradientType;
  sellStartTime: number; // unix timestamp in seconds
  sellEndTime: number; // unix timestamp in seconds
  encoded: GradientEncodedStrategyBNStr;
};

export type AtLeastOneOf<T> = {
  [K in keyof T]: { [key in K]: T[K] } & {
    [key in Exclude<keyof T, K>]?: T[key];
  };
}[keyof T];

export type StrategyUpdate = AtLeastOneOf<
  Omit<
    Strategy,
    | 'id'
    | 'encoded'
    | 'baseToken'
    | 'quoteToken'
    | 'buyPriceMarginal'
    | 'sellPriceMarginal'
  >
>;

export type GradientStrategyUpdate = AtLeastOneOf<
  Omit<
    GradientStrategy,
    'type' | 'id' | 'encoded' | 'baseToken' | 'quoteToken'
  >
>;

export type BlockMetadata = {
  number: number;
  hash: string;
};

export type SyncedEvent =
  | {
      type: 'StrategyCreated' | 'StrategyUpdated' | 'StrategyDeleted';
      blockNumber: number;
      logIndex: number;
      data: EncodedStrategy;
    }
  | {
      type:
        | 'GradientStrategyCreated'
        | 'GradientStrategyUpdated'
        | 'GradientStrategyDeleted';
      blockNumber: number;
      logIndex: number;
      data: GradientEncodedStrategy;
    }
  | {
      type: 'TradingFeePPMUpdated';
      blockNumber: number;
      logIndex: number;
      data: number;
    }
  | {
      type: 'PairTradingFeePPMUpdated';
      blockNumber: number;
      logIndex: number;
      data: TradingFeeUpdate;
    };

export type SyncedEvents = SyncedEvent[];

export interface Fetcher {
  pairs(): Promise<TokenPair[]>;
  strategiesByPair(token0: string, token1: string): Promise<EncodedStrategy[]>;
  gradientStrategiesByPair(
    token0: string,
    token1: string
  ): Promise<GradientEncodedStrategy[]>;
  strategiesByPairs(pairs: TokenPair[]): Promise<
    {
      pair: TokenPair;
      strategies: EncodedStrategy[];
    }[]
  >;
  gradientStrategiesByPairs(pairs: TokenPair[]): Promise<
    {
      pair: TokenPair;
      strategies: GradientEncodedStrategy[];
    }[]
  >;
  pairTradingFeePPM(token0: string, token1: string): Promise<number>;
  pairsTradingFeePPM(pairs: TokenPair[]): Promise<[string, string, number][]>;
  tradingFeePPM(): Promise<number>;
  onTradingFeePPMUpdated(
    listener: (prevFeePPM: number, newFeePPM: number) => void
  ): void;
  getBlockNumber(): Promise<number>;
  getBlock(blockNumber: number): Promise<BlockMetadata>;
  getEvents(
    fromBlock: number,
    toBlock: number,
    maxChunkSize?: number
  ): Promise<SyncedEvents>;
}
