import { Fetcher } from '../common/types';
import { ChainCache } from './ChainCache';
import { ChainSync } from './ChainSync';
import {
  CacheSyncApi,
  InitSyncedCacheConfig,
  LegacyInitSyncedCacheOptions,
} from './types';

export { ChainCache, ChainSync };
export * from './types';

/**
 * Initializes a cache and a syncer for the cache - this default initialization logic
 * can be used in most cases. If you need to customize the initialization logic, you can
 * use the ChainCache and ChainSync classes directly.
 * @param {InitSyncedCacheConfig} config - config describing either chain sync or polling sync
 * @returns an object with the initialized cache and a function to start syncing the cache
 * @example
 * const { cache, startDataSync } = initSyncedCache({
 *   mode: 'chain',
 *   fetcher,
 *   cachedData,
 * });
 * const { cache, startDataSync } = initSyncedCache({
 *   mode: 'polling',
 *   cachedData,
 *   cacheSyncApi: 'https://example.com/cache',
 *   pollingIntervalMs: 5_000,
 * });
 * await startDataSync();
 * // cache is now synced
 */
export function initSyncedCache(
  config: InitSyncedCacheConfig
): {
  cache: ChainCache;
  startDataSync: () => Promise<void>;
  stopDataSync: () => void;
};
export function initSyncedCache(
  fetcher: Fetcher,
  cachedData?: string,
  numOfPairsToBatch?: number,
  msToWaitBetweenSyncs?: number,
  chunkSize?: number,
  cacheSyncApi?: CacheSyncApi,
  pollingIntervalMs?: number
): {
  cache: ChainCache;
  startDataSync: () => Promise<void>;
  stopDataSync: () => void;
};
export function initSyncedCache(
  fetcherOrConfig: Fetcher | InitSyncedCacheConfig,
  cachedDataOrOptions?: string | LegacyInitSyncedCacheOptions,
  numOfPairsToBatch?: number,
  msToWaitBetweenSyncs?: number,
  chunkSize?: number,
  cacheSyncApi?: CacheSyncApi,
  pollingIntervalMs?: number
): {
  cache: ChainCache;
  startDataSync: () => Promise<void>;
  stopDataSync: () => void;
} {
  const config =
    typeof fetcherOrConfig === 'object' && 'mode' in fetcherOrConfig
      ? fetcherOrConfig
      : cacheSyncApi
      ? {
          mode: 'polling' as const,
          cachedData:
            typeof cachedDataOrOptions === 'string'
              ? cachedDataOrOptions
              : cachedDataOrOptions?.cachedData,
          cacheSyncApi,
          pollingIntervalMs:
            pollingIntervalMs ??
            (typeof cachedDataOrOptions === 'object'
              ? cachedDataOrOptions.pollingIntervalMs
              : undefined),
        }
      : {
          mode: 'chain' as const,
          fetcher: fetcherOrConfig as Fetcher,
          cachedData:
            typeof cachedDataOrOptions === 'string'
              ? cachedDataOrOptions
              : cachedDataOrOptions?.cachedData,
          numOfPairsToBatch:
            numOfPairsToBatch ??
            (typeof cachedDataOrOptions === 'object'
              ? cachedDataOrOptions.numOfPairsToBatch
              : undefined),
          msToWaitBetweenSyncs:
            msToWaitBetweenSyncs ??
            (typeof cachedDataOrOptions === 'object'
              ? cachedDataOrOptions.msToWaitBetweenSyncs
              : undefined),
          chunkSize:
            chunkSize ??
            (typeof cachedDataOrOptions === 'object'
              ? cachedDataOrOptions.chunkSize
              : undefined),
        };

  let cache: ChainCache | undefined;
  if (config.cachedData) {
    cache = ChainCache.fromSerialized(config.cachedData);
  }
  // either serialized data was bad or it was not provided
  if (!cache) {
    cache = new ChainCache();
  }

  const syncer = new ChainSync(cache, config);
  if (config.mode === 'chain') {
    cache.setCacheMissHandler(syncer.syncPairData.bind(syncer));
  }
  return {
    cache,
    startDataSync: syncer.startDataSync.bind(syncer),
    stopDataSync: syncer.stop.bind(syncer),
  };
}
