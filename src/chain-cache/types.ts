import { EncodedStrategyBNStr, Fetcher, TokenPair } from '../common/types';

export type EventMap = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: (...args: any[]) => void;
};

export type CacheEvents = {
  onPairDataChanged: (affectedPairs: TokenPair[]) => void;
  onPairAddedToCache: (addedPair: TokenPair) => void;
  onCacheInitialized: () => void;
  onCacheCleared: () => void;
};

export type SerializedChainCache = {
  schemeVersion: number;
  strategiesByPair: { [key: string]: EncodedStrategyBNStr[] };
  tradingFeePPMByPair: { [key: string]: number };
  latestBlockNumber: number;
};

export type CacheSyncApi = string | (() => Promise<string | SerializedChainCache>);

export type ChainSyncChainConfig = {
  mode: 'chain';
  fetcher: Fetcher;
  numOfPairsToBatch?: number;
  msToWaitBetweenSyncs?: number;
  chunkSize?: number;
};

export type ChainSyncPollingConfig = {
  mode: 'polling';
  cacheSyncApi: CacheSyncApi;
  pollingIntervalMs?: number;
};

export type ChainSyncConfig = ChainSyncChainConfig | ChainSyncPollingConfig;

export type InitSyncedCacheChainConfig = ChainSyncChainConfig & {
  cachedData?: string;
};

export type InitSyncedCachePollingConfig = ChainSyncPollingConfig & {
  cachedData?: string;
};

export type InitSyncedCacheConfig =
  | InitSyncedCacheChainConfig
  | InitSyncedCachePollingConfig;

export type LegacyInitSyncedCacheOptions = {
  cachedData?: string;
  numOfPairsToBatch?: number;
  msToWaitBetweenSyncs?: number;
  chunkSize?: number;
  cacheSyncApi?: CacheSyncApi;
  pollingIntervalMs?: number;
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
