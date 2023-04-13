import { EncodedStrategy, TokenPair, TradeData } from '../common/types';

export interface Fetcher {
  pairs(): Promise<TokenPair[]>;
  strategiesByPair(token0: string, token1: string): Promise<EncodedStrategy[]>;
  getLatestStrategyCreatedStrategies(
    fromBlock: number,
    toBlock: number
  ): Promise<EncodedStrategy[]>;
  getLatestStrategyUpdatedStrategies(
    fromBlock: number,
    toBlock: number
  ): Promise<EncodedStrategy[]>;
  getLatestStrategyDeletedStrategies(
    fromBlock: number,
    toBlock: number
  ): Promise<EncodedStrategy[]>;
  getLatestTokensTradedTrades(
    fromBlock: number,
    toBlock: number
  ): Promise<TradeData[]>;
  getBlockNumber(): Promise<number>;
  tradingFeePPM(): Promise<number>;
  onTradingFeePPMUpdated(
    listener: (prevFeePPM: number, newFeePPM: number) => void
  ): void;
}

export type EventMap = {
  [key: string]: (...args: any[]) => void;
};

export type CacheEvents = {
  onPairDataChanged: (affectedPairs: TokenPair[]) => void;
  onPairAddedToCache: (addedPair: TokenPair) => void;
};

export interface TypedEventEmitter<Events extends EventMap> {
  addListener<E extends keyof Events>(event: E, listener: Events[E]): this;
  on<E extends keyof Events>(event: E, listener: Events[E]): this;
  once<E extends keyof Events>(event: E, listener: Events[E]): this;
  prependListener<E extends keyof Events>(event: E, listener: Events[E]): this;
  prependOnceListener<E extends keyof Events>(
    event: E,
    listener: Events[E]
  ): this;

  off<E extends keyof Events>(event: E, listener: Events[E]): this;
  removeAllListeners<E extends keyof Events>(event?: E): this;
  removeListener<E extends keyof Events>(event: E, listener: Events[E]): this;

  emit<E extends keyof Events>(
    event: E,
    ...args: Parameters<Events[E]>
  ): boolean;
  eventNames(): (keyof Events | string | symbol)[];
  rawListeners<E extends keyof Events>(event: E): Events[E][];
  listeners<E extends keyof Events>(event: E): Events[E][];
  listenerCount<E extends keyof Events>(event: E): number;

  getMaxListeners(): number;
  setMaxListeners(maxListeners: number): this;
}
