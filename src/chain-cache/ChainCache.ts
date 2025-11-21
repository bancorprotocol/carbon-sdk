import EventEmitter from 'events';
import { CacheEvents, TypedEventEmitter } from './types';
import {
  fromPairKey,
  toDirectionKey,
  toPairKey,
  isOrderTradable,
} from './utils';
import {
  BlockMetadata,
  EncodedOrder,
  EncodedStrategy,
  OrdersMap,
  RetypeBigNumberToString,
  TokenPair,
  TradingFeeUpdate,
  SyncedEvents,
} from '../common/types';
import { BigNumberish } from '../utils/numerics';
import {
  encodedStrategyBNToStr,
  encodedStrategyStrToBN,
} from '../utils/serializers';
import { Logger } from '../common/logger';

const logger = new Logger('ChainCache.ts');

const schemeVersion = 7; // bump this when the serialization format changes

type PairToStrategiesMap = { [key: string]: EncodedStrategy[] };
type StrategyById = { [key: string]: EncodedStrategy };
type PairToDirectedOrdersMap = { [key: string]: OrdersMap };

type SerializableDump = {
  schemeVersion: number;
  strategiesByPair: RetypeBigNumberToString<PairToStrategiesMap>;
  tradingFeePPMByPair: { [key: string]: number };
  latestBlockNumber: number;
};

export class ChainCache extends (EventEmitter as new () => TypedEventEmitter<CacheEvents>) {
  //#region private members
  private _strategiesByPair: PairToStrategiesMap = {};
  private _strategiesById: StrategyById = {};
  private _ordersByDirectedPair: PairToDirectedOrdersMap = {};
  private _latestBlockNumber: number = 0;
  private _blocksMetadata: BlockMetadata[] = [];
  private _tradingFeePPMByPair: { [key: string]: number } = {};
  private _isCacheInitialized: boolean = false; // should only be set to true after the cache is FULLY initialized with data for the first time by `bulkAddPairs` or when loaded from serialized data
  private _handleCacheMiss:
    | ((token0: string, token1: string) => Promise<void>)
    | undefined;
  //#endregion private members

  //#region serialization for persistent caching
  public static fromSerialized(serializedCache: string): ChainCache {
    try {
      const cache = new ChainCache();
      cache._deserialize(serializedCache);
      return cache;
    } catch (e) {
      logger.error('Failed to deserialize cache, returning clear cache', e);
    }
    return new ChainCache();
  }

  private _deserialize(serializedCache: string): void {
    const parsedCache = JSON.parse(serializedCache) as SerializableDump;
    const { schemeVersion: version } = parsedCache;
    if (version !== schemeVersion) {
      logger.log(
        'Cache version mismatch, ignoring cache. Expected',
        schemeVersion,
        'got',
        version,
        'This may be due to a breaking change in the cache format since it was last persisted.'
      );
      return;
    }

    // if, due to a bug, the cached latest block number isn't a number, print an error and return
    if (typeof parsedCache.latestBlockNumber !== 'number') {
      logger.error(
        'Cached latest block number is not a number, ignoring cache'
      );
      return;
    }

    // iterate over the pairs and their strategies and populate this._strategiesByPair, this._strategiesById and this._ordersByDirectedPair
    for (const [key, strategies] of Object.entries(
      parsedCache.strategiesByPair
    )) {
      const [token0, token1] = fromPairKey(key);
      this._addPair(token0, token1, strategies.map(encodedStrategyStrToBN));
    }

    this._tradingFeePPMByPair = parsedCache.tradingFeePPMByPair;
    this._latestBlockNumber = parsedCache.latestBlockNumber;
    this._isCacheInitialized = true;
    logger.debug('Cache initialized from serialized data');
  }

  public serialize(): string {
    const dump: SerializableDump = {
      schemeVersion,
      strategiesByPair: Object.entries(this._strategiesByPair).reduce(
        (acc, [key, strategies]) => {
          acc[key] = strategies.map(encodedStrategyBNToStr);
          return acc;
        },
        {} as RetypeBigNumberToString<PairToStrategiesMap>
      ),
      tradingFeePPMByPair: this._tradingFeePPMByPair,
      latestBlockNumber: this._latestBlockNumber,
    };
    return JSON.stringify(dump);
  }
  //#endregion serialization for persistent caching

  public setCacheMissHandler(
    handler: (token0: string, token1: string) => Promise<void>
  ): void {
    this._handleCacheMiss = handler;
  }

  private async _checkAndHandleCacheMiss(token0: string, token1: string) {
    if (
      this._isCacheInitialized ||
      !this._handleCacheMiss ||
      this.hasCachedPair(token0, token1)
    )
      return;

    logger.debug('Cache miss for pair', token0, token1);
    await this._handleCacheMiss(token0, token1);
    logger.debug('Cache miss for pair', token0, token1, 'resolved');
  }

  /**
   * Returns true if the cache is initialized with data for the first time by `bulkAddPairs` or when loaded from serialized data
   * @returns {boolean} true if the cache is initialized, false otherwise
   */
  public isCacheInitialized(): boolean {
    return this._isCacheInitialized;
  }

  public clear(): void {
    this._strategiesByPair = {};
    this._strategiesById = {};
    this._ordersByDirectedPair = {};
    this._latestBlockNumber = 0;
    this._blocksMetadata = [];
    this._blocksMetadata = [];
    this._tradingFeePPMByPair = {};
    this._isCacheInitialized = false;
    this.emit('onCacheCleared');
  }

  //#region public getters

  public async getStrategiesByPair(
    token0: string,
    token1: string
  ): Promise<EncodedStrategy[] | undefined> {
    await this._checkAndHandleCacheMiss(token0, token1);
    const key = toPairKey(token0, token1);
    return this._strategiesByPair[key];
  }

  public async getStrategiesByPairs(pairs: TokenPair[]): Promise<
    {
      pair: TokenPair;
      strategies: EncodedStrategy[];
    }[]
  > {
    const result: {
      pair: TokenPair;
      strategies: EncodedStrategy[];
    }[] = [];
    for (const pair of pairs) {
      const strategies = await this.getStrategiesByPair(pair[0], pair[1]);
      if (strategies) {
        result.push({ pair, strategies });
      }
    }
    return result;
  }

  public getStrategyById(id: BigNumberish): EncodedStrategy | undefined {
    return this._strategiesById[id.toString()];
  }

  public getCachedPairs(onlyWithStrategies: boolean = true): TokenPair[] {
    if (onlyWithStrategies) {
      return Object.entries(this._strategiesByPair)
        .filter(([_, strategies]) => strategies.length > 0)
        .map(([key, _]) => fromPairKey(key));
    }

    return Object.keys(this._strategiesByPair).map(fromPairKey);
  }

  /**
   * returns the orders that sell targetToken for sourceToken
   */
  public async getOrdersByPair(
    sourceToken: string,
    targetToken: string,
    keepNonTradable: boolean = false
  ): Promise<OrdersMap> {
    await this._checkAndHandleCacheMiss(sourceToken, targetToken);
    const key = toDirectionKey(sourceToken, targetToken);
    const orders = this._ordersByDirectedPair[key] || {};

    if (keepNonTradable) return orders;

    return Object.fromEntries(
      Object.entries(orders).filter(([_, order]) => isOrderTradable(order))
    );
  }

  public hasCachedPair(token0: string, token1: string): boolean {
    const key = toPairKey(token0, token1);
    return !!this._strategiesByPair[key];
  }

  public getLatestBlockNumber(): number {
    return this._latestBlockNumber;
  }

  public async getTradingFeePPMByPair(
    token0: string,
    token1: string
  ): Promise<number | undefined> {
    await this._checkAndHandleCacheMiss(token0, token1);
    const key = toPairKey(token0, token1);
    return this._tradingFeePPMByPair[key];
  }

  public get blocksMetadata(): BlockMetadata[] {
    return this._blocksMetadata;
  }

  public set blocksMetadata(blocks: BlockMetadata[]) {
    this._blocksMetadata = blocks;
  }
  //#endregion public getters

  //#region cache updates
  private _addPair(
    token0: string,
    token1: string,
    strategies: EncodedStrategy[]
  ): void {
    logger.debug(
      'Adding pair with',
      strategies.length,
      ' strategies to cache',
      token0,
      token1
    );
    const key = toPairKey(token0, token1);
    if (this._strategiesByPair[key]) {
      throw new Error(`Pair ${key} already cached`);
    }
    this._strategiesByPair[key] = strategies;
    strategies.forEach((strategy) => {
      this._strategiesById[strategy.id.toString()] = strategy;
      this._addStrategyOrders(strategy);
    });
  }

  /**
   * This method is to be used when all the existing strategies of a pair are
   * fetched and are to be stored in the cache.
   * Once a pair is cached, the only way to update it is by using `applyEvents`.
   * If all the strategies of a pair are deleted, the pair remains in the cache and there's
   * no need to add it again.
   * It emits an event `onPairAddedToCache` with the pair info.
   * @param {string} token0 - address of the first token of the pair
   * @param {string} token1 - address of the second token of the pair
   * @param {EncodedStrategy[]} strategies - the strategies to be cached
   * @throws {Error} if the pair is already cached
   * @returns {void}
   * @emits {onPairAddedToCache} - when the pair is added to the cache
   */
  public addPair(
    token0: string,
    token1: string,
    strategies: EncodedStrategy[]
  ): void {
    this._addPair(token0, token1, strategies);
    logger.debug('Emitting onPairAddedToCache', token0, token1);
    this.emit('onPairAddedToCache', fromPairKey(toPairKey(token0, token1)));
  }

  /**
   * This method is used when a number of pairs are fetched and are to be stored in the cache.
   * If this is the first time it is called with a non empty list of pairs it emits an event
   * to let know that the cache was initialized with data for the first time.
   *
   * @param {Array<{pair: TokenPair, strategies: EncodedStrategy[]}>} pairs - the pairs to add to the cache
   * @emits {onCacheInitialized} - when the cache is initialized with data for the first time
   * @throws {Error} if any pair is already cached
   * @returns {void}
   */
  public bulkAddPairs(
    pairs: {
      pair: TokenPair;
      strategies: EncodedStrategy[];
    }[]
  ): void {
    logger.debug('Bulk adding pairs', pairs);
    for (const pair of pairs) {
      this._addPair(pair.pair[0], pair.pair[1], pair.strategies);
    }
    if (pairs.length > 0 && !this._isCacheInitialized) {
      this._isCacheInitialized = true;
      logger.debug('Emitting onCacheInitialized');
      this.emit('onCacheInitialized');
    }
  }

  /**
   * This methods allows setting the trading fee of a pair.
   * Note that fees can also be updated via `applyEvents`.
   * This specific method is useful when the fees were fetched from the chain
   * as part of initialization or some other operation mode which doesn't
   * rely on even processing
   *
   * @param {string} token0 - address of the first token of the pair
   * @param {string} token1 - address of the second token of the pair
   * @param tradingFeePPM - the pair's trading fee
   */
  public addPairFees(
    token0: string,
    token1: string,
    tradingFeePPM: number
  ): void {
    logger.debug(
      'Adding trading fee to pair',
      token0,
      token1,
      'fee',
      tradingFeePPM
    );
    const key = toPairKey(token0, token1);
    this._tradingFeePPMByPair[key] = tradingFeePPM;
  }

  /**
   * This method is to be used when events from a range of blocks are fetched
   * and are to be applied to the cache.
   * All the events should belong to pairs that are already cached.
   * The way to use this work flow is to first call `getLatestBlockNumber` to
   * get the latest block number that was already cached, then fetch all the
   * events from that block number to the latest block number, and finally
   * call this method with the fetched events. The events should be sorted by
   * block number and log index.
   * Note: the cache can handle a case of a strategy that was created and then updated and then deleted
   * @param events - Array of events to apply
   * @param currentBlock - Current block number
   */
  public applyEvents(events: SyncedEvents, currentBlock: number): void {
    const affectedPairs = new Set<string>();
    // Update latest block number
    this._setLatestBlockNumber(currentBlock);

    // Process events in order
    for (const event of events) {
      switch (event.type) {
        case 'StrategyCreated': {
          const strategy = event.data as EncodedStrategy;
          this._addStrategy(strategy);
          affectedPairs.add(toPairKey(strategy.token0, strategy.token1));
          break;
        }
        case 'StrategyUpdated': {
          const strategy = event.data as EncodedStrategy;
          this._updateStrategy(strategy);
          affectedPairs.add(toPairKey(strategy.token0, strategy.token1));
          break;
        }
        case 'StrategyDeleted': {
          const strategy = event.data as EncodedStrategy;
          this._deleteStrategy(strategy);
          affectedPairs.add(toPairKey(strategy.token0, strategy.token1));
          break;
        }
        case 'PairTradingFeePPMUpdated': {
          const feeUpdate = event.data as TradingFeeUpdate;
          this.addPairFees(feeUpdate[0], feeUpdate[1], feeUpdate[2]);
          break;
        }
        case 'TradingFeePPMUpdated': {
          // This event type is handled by the caller
          break;
        }
      }
    }

    if (affectedPairs.size > 0) {
      logger.debug('Emitting onPairDataChanged', affectedPairs);
      this.emit(
        'onPairDataChanged',
        Array.from(affectedPairs).map(fromPairKey)
      );
    }
  }

  private _setLatestBlockNumber(blockNumber: number): void {
    this._latestBlockNumber = blockNumber;
  }

  private _addStrategyOrders(strategy: EncodedStrategy): void {
    for (const tokenOrder of [
      [strategy.token0, strategy.token1],
      [strategy.token1, strategy.token0],
    ]) {
      const key = toDirectionKey(tokenOrder[0], tokenOrder[1]);
      const order: EncodedOrder =
        tokenOrder[0] === strategy.token0 ? strategy.order1 : strategy.order0;
      const existingOrders = this._ordersByDirectedPair[key];
      if (existingOrders) {
        existingOrders[strategy.id.toString()] = order;
      } else {
        this._ordersByDirectedPair[key] = {
          [strategy.id.toString()]: order,
        };
      }
    }
  }

  private _removeStrategyOrders(strategy: EncodedStrategy): void {
    for (const tokenOrder of [
      [strategy.token0, strategy.token1],
      [strategy.token1, strategy.token0],
    ]) {
      const key = toDirectionKey(tokenOrder[0], tokenOrder[1]);
      const existingOrders = this._ordersByDirectedPair[key];
      if (existingOrders) {
        delete existingOrders[strategy.id.toString()];
        // if there are no orders left for this pair, remove the pair from the map
        if (Object.keys(existingOrders).length === 0) {
          delete this._ordersByDirectedPair.key;
        }
      }
    }
  }

  private _addStrategy(strategy: EncodedStrategy): void {
    if (!this.hasCachedPair(strategy.token0, strategy.token1)) {
      logger.error(
        `Pair ${toPairKey(
          strategy.token0,
          strategy.token1
        )} is not cached, cannot add strategy`
      );
      return;
    }
    const key = toPairKey(strategy.token0, strategy.token1);
    if (this._strategiesById[strategy.id.toString()]) {
      logger.debug(
        `Strategy ${strategy.id} already cached, under the pair ${key} - skipping`
      );
      return;
    }
    const strategies = this._strategiesByPair[key] || [];
    strategies.push(strategy);
    this._strategiesByPair[key] = strategies;
    this._strategiesById[strategy.id.toString()] = strategy;
    this._addStrategyOrders(strategy);
  }

  private _updateStrategy(strategy: EncodedStrategy): void {
    if (!this.hasCachedPair(strategy.token0, strategy.token1)) {
      logger.error(
        `Pair ${toPairKey(
          strategy.token0,
          strategy.token1
        )} is not cached, cannot update strategy`
      );
      return;
    }
    const key = toPairKey(strategy.token0, strategy.token1);
    const strategies = (this._strategiesByPair[key] || []).filter(
      (s) => !s.id.eq(strategy.id)
    );
    strategies.push(strategy);
    this._strategiesByPair[key] = strategies;
    this._strategiesById[strategy.id.toString()] = strategy;
    this._removeStrategyOrders(strategy);
    this._addStrategyOrders(strategy);
  }

  private _deleteStrategy(strategy: EncodedStrategy): void {
    if (!this.hasCachedPair(strategy.token0, strategy.token1)) {
      logger.error(
        `Pair ${toPairKey(
          strategy.token0,
          strategy.token1
        )} is not cached, cannot delete strategy`
      );
      return;
    }
    const key = toPairKey(strategy.token0, strategy.token1);
    delete this._strategiesById[strategy.id.toString()];
    const strategies = (this._strategiesByPair[key] || []).filter(
      (s) => !s.id.eq(strategy.id)
    );
    this._strategiesByPair[key] = strategies;
    this._removeStrategyOrders(strategy);
  }

  //#endregion cache updates
}
