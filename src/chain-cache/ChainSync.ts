import { ChainCache } from './ChainCache';
import { toPairKey } from './utils';
import { Logger } from '../common/logger';
import {
  BlockMetadata,
  EncodedStrategy,
  Fetcher,
  TokenPair,
  TradeData,
} from '../common/types';

const logger = new Logger('ChainSync.ts');

const BLOCKS_TO_KEEP = 3;

export class ChainSync {
  private _fetcher: Fetcher;
  private _chainCache: ChainCache;
  private _syncCalled: boolean = false;
  private _slowPollPairs: boolean = false;
  private _uncachedPairs: TokenPair[] = [];
  // keep the time stamp of last fetch
  private _lastFetch: number = Date.now();
  private _numOfPairsToBatch: number;
  private _msToWaitBetweenSyncs: number;
  private _chunkSize: number;

  constructor(
    fetcher: Fetcher,
    chainCache: ChainCache,
    numOfPairsToBatch: number = 100,
    msToWaitBetweenSyncs: number = 1000,
    chunkSize: number = 1000
  ) {
    this._fetcher = fetcher;
    this._chainCache = chainCache;
    this._numOfPairsToBatch = numOfPairsToBatch;
    this._msToWaitBetweenSyncs = msToWaitBetweenSyncs;
    this._chunkSize = chunkSize;
  }

  public async startDataSync(): Promise<void> {
    logger.debug('startDataSync called');
    if (this._syncCalled) {
      throw new Error('ChainSync.startDataSync() can only be called once');
    }
    this._syncCalled = true;
    const latestBlockInCache = this._chainCache.getLatestBlockNumber();

    if (latestBlockInCache === 0) {
      logger.debug('startDataSync - cache is new', arguments);
      const blockNumber = await this._fetcher.getBlockNumber();
      if (typeof blockNumber !== 'number') {
        logger.error(
          'Fatal! startDataSync - getBlockNumber returned value is not a number. ' +
            'This indicates a serious bug in the provider. At this point, the only ' +
            'thing we can do is to crash the program, as the cache cannot be set to a ' +
            'valid state.'
        );
        throw new Error(
          'Fatal! startDataSync - getBlockNumber returned value is not a number.'
        );
      }
      // cache starts from scratch so we want to avoid getting events from the beginning of time
      this._chainCache.applyBatchedUpdates(blockNumber, [], [], [], [], []);
    }

    // let's fetch all pairs from the chain and set them to the cache - to be used by the following syncs
    await this._updateUncachedPairsFromChain();

    // _populateFeesData() should run first, before _populatePairsData() gets to manipulate the pairs list
    await Promise.all([
      this._populateFeesData(this._uncachedPairs),
      this._populatePairsData(),
      this._syncEvents(),
    ]);
  }

  // reads all pairs from chain and sets to private field
  private async _updateUncachedPairsFromChain() {
    logger.debug('_updateUncachedPairsFromChain fetches pairs');
    const pairs = await this._fetcher.pairs();
    logger.debug('_updateUncachedPairsFromChain fetched pairs', pairs);
    this._lastFetch = Date.now();
    if (pairs.length === 0) {
      logger.error(
        '_updateUncachedPairsFromChain fetched no pairs - this indicates a problem'
      );
    }

    // let's filter the uncached pairs
    this._uncachedPairs = pairs.filter(
      (pair) => !this._chainCache.hasCachedPair(pair[0], pair[1])
    );
  }

  private async _populateFeesData(pairs: TokenPair[]): Promise<void> {
    logger.debug('populateFeesData called');
    if (pairs.length === 0) {
      logger.log('populateFeesData called with no pairs - skipping');
      return;
    }

    const feeUpdates: [string, string, number][] =
      await this._fetcher.pairsTradingFeePPM(pairs);

    logger.debug('populateFeesData fetched fee updates', feeUpdates);

    feeUpdates.forEach((feeUpdate) => {
      this._chainCache.addPairFees(feeUpdate[0], feeUpdate[1], feeUpdate[2]);
    });
  }

  // `_populatePairsData` sets timeout and returns immediately. It does the following:
  // 1. Fetches all token pairs from the fetcher
  // 2. fetches strategies for all uncached pairs
  // 3. adds the pairs strategies to the cache
  // 4. sets a timeout to call itself again
  private async _populatePairsData(): Promise<void> {
    logger.debug('_populatePairsData called');
    // this indicates we want to poll for pairs only once a minute.
    // Set this to false when we have an indication that new pair was created - which we want to fetch now
    this._slowPollPairs = false;

    const processPairs = async () => {
      try {
        if (this._uncachedPairs.length === 0) {
          // if we have no pairs we need to fetch - unless we're in slow poll mode and less than a minute has passed since last fetch
          if (this._slowPollPairs && Date.now() - this._lastFetch < 60000) {
            // go back to sleep
            setTimeout(processPairs, 1000);
            return;
          }
          await this._updateUncachedPairsFromChain();
        }

        if (this._uncachedPairs.length > 0) {
          logger.debug(
            '_populatePairsData will now sync data for',
            this._uncachedPairs
          );
          // we have pairs to sync - let's split them into batches - add their strategies to the cache and go into slow poll mode
          await this._syncPairDataBatch();
        }
        // list is now empty and there are no more pairs to sync - we can poll them less frequently
        // we will wake up once a second just to check if we're still in slow poll mode,
        // but if not - we will actually poll once a minute
        logger.debug(
          '_populatePairsData handled all pairs and goes to slow poll mode'
        );
        this._slowPollPairs = true;
        setTimeout(processPairs, 1000);
        return;
      } catch (e) {
        logger.error('Error while syncing pairs data', e);
        setTimeout(processPairs, 60000);
      }
    };
    setTimeout(processPairs, 1);
  }

  private async _syncPairDataBatch(): Promise<void> {
    // Split all uncached pairs into batches
    const batches: TokenPair[][] = [];
    for (
      let i = 0;
      i < this._uncachedPairs.length;
      i += this._numOfPairsToBatch
    ) {
      batches.push(this._uncachedPairs.slice(i, i + this._numOfPairsToBatch));
    }

    try {
      const strategiesBatches = await Promise.all(
        batches.map((batch) => this._fetcher.strategiesByPairs(batch))
      );
      strategiesBatches.flat().forEach((pairStrategies) => {
        this._chainCache.addPair(
          pairStrategies.pair[0],
          pairStrategies.pair[1],
          pairStrategies.strategies,
          true
        );
      });
      this._uncachedPairs = [];
    } catch (error) {
      logger.error('Failed to fetch strategies for pairs batch:', error);
      throw error; // Re-throw to be handled by caller
    }
  }

  public async syncPairData(token0: string, token1: string): Promise<void> {
    if (!this._syncCalled) {
      throw new Error(
        'ChainSync.startDataSync() must be called before syncPairData()'
      );
    }
    const strategies = await this._fetcher.strategiesByPair(token0, token1);
    if (this._chainCache.hasCachedPair(token0, token1)) return;
    this._chainCache.addPair(token0, token1, strategies, false);
  }

  // used to break the blocks between latestBlock + 1 and currentBlock to chunks of `chunkSize` blocks
  private _getBlockChunks(
    startBlock: number,
    endBlock: number,
    chunkSize: number
  ): number[][] {
    const blockChunks = [];
    for (let i = startBlock; i <= endBlock; i += chunkSize) {
      const chunkStart = i;
      const chunkEnd = Math.min(i + chunkSize - 1, endBlock);
      blockChunks.push([chunkStart, chunkEnd]);
    }
    return blockChunks;
  }

  private async _syncEvents(): Promise<void> {
    logger.debug('_syncEvents called');
    const processEvents = async () => {
      try {
        const currentBlock = await this._fetcher.getBlockNumber();
        // if the current block number isn't a number, throw an error and hope that the next iteration of processEvents will get a valid number
        if (typeof currentBlock !== 'number') {
          logger.error(
            '_syncEvents - getBlockNumber returned value is not a number. ' +
              'This indicates a serious bug in the provider. Throwing an error in hope that the next iteration will get a valid number.'
          );
          throw new Error(
            '_syncEvents - getBlockNumber returned value is not a number.'
          );
        }

        const latestBlock = this._chainCache.getLatestBlockNumber();

        if (currentBlock > latestBlock) {
          if (await this._detectReorg(currentBlock)) {
            logger.debug('_syncEvents detected reorg - resetting');
            this._chainCache.clear();
            this._chainCache.applyBatchedUpdates(
              currentBlock,
              [],
              [],
              [],
              [],
              []
            );
            this._resetPairsFetching();
            setTimeout(processEvents, 1);
            return;
          }

          const cachedPairs = new Set<string>(
            this._chainCache
              .getCachedPairs(false)
              .map((pair) => toPairKey(pair[0], pair[1]))
          );

          logger.debug(
            '_syncEvents fetches events',
            latestBlock + 1,
            currentBlock
          );
          const blockChunks = this._getBlockChunks(
            latestBlock + 1,
            currentBlock,
            this._chunkSize
          );
          logger.debug('_syncEvents block chunks', blockChunks);

          const createdStrategiesChunks: EncodedStrategy[][] = [];
          const updatedStrategiesChunks: EncodedStrategy[][] = [];
          const deletedStrategiesChunks: EncodedStrategy[][] = [];
          const tradesChunks: TradeData[][] = [];
          const feeUpdatesChunks: [string, string, number][][] = [];
          const defaultFeeUpdatesChunks: number[][] = [];

          for (const blockChunk of blockChunks) {
            logger.debug('_syncEvents fetches events for chunk', blockChunk);
            const createdStrategiesChunk: EncodedStrategy[] =
              await this._fetcher.getLatestStrategyCreatedStrategies(
                blockChunk[0],
                blockChunk[1]
              );
            const updatedStrategiesChunk: EncodedStrategy[] =
              await this._fetcher.getLatestStrategyUpdatedStrategies(
                blockChunk[0],
                blockChunk[1]
              );
            const deletedStrategiesChunk: EncodedStrategy[] =
              await this._fetcher.getLatestStrategyDeletedStrategies(
                blockChunk[0],
                blockChunk[1]
              );
            const tradesChunk: TradeData[] =
              await this._fetcher.getLatestTokensTradedTrades(
                blockChunk[0],
                blockChunk[1]
              );
            const feeUpdatesChunk: [string, string, number][] =
              await this._fetcher.getLatestPairTradingFeeUpdates(
                blockChunk[0],
                blockChunk[1]
              );
            const defaultFeeUpdatesChunk: number[] =
              await this._fetcher.getLatestTradingFeeUpdates(
                blockChunk[0],
                blockChunk[1]
              );

            createdStrategiesChunks.push(createdStrategiesChunk);
            updatedStrategiesChunks.push(updatedStrategiesChunk);
            deletedStrategiesChunks.push(deletedStrategiesChunk);
            tradesChunks.push(tradesChunk);
            feeUpdatesChunks.push(feeUpdatesChunk);
            defaultFeeUpdatesChunks.push(defaultFeeUpdatesChunk);
            logger.debug(
              '_syncEvents fetched the following events for chunks',
              blockChunks,
              {
                createdStrategiesChunk,
                updatedStrategiesChunk,
                deletedStrategiesChunk,
                tradesChunk,
                feeUpdatesChunk,
                defaultFeeUpdatesChunk,
              }
            );
          }

          const createdStrategies = createdStrategiesChunks.flat();
          const updatedStrategies = updatedStrategiesChunks.flat();
          const deletedStrategies = deletedStrategiesChunks.flat();
          const trades = tradesChunks.flat();
          const feeUpdates = feeUpdatesChunks.flat();
          const defaultFeeWasUpdated =
            defaultFeeUpdatesChunks.flat().length > 0;

          logger.debug(
            '_syncEvents fetched events',
            createdStrategies,
            updatedStrategies,
            deletedStrategies,
            trades,
            feeUpdates,
            defaultFeeWasUpdated
          );

          // let's check created strategies and see if we have a pair that's not cached yet,
          // which means we need to set slow poll mode to false so that it will be fetched quickly
          const newlyCreatedPairs: TokenPair[] = [];
          for (const strategy of createdStrategies) {
            if (
              !this._chainCache.hasCachedPair(strategy.token0, strategy.token1)
            ) {
              newlyCreatedPairs.push([strategy.token0, strategy.token1]);
            }
          }

          this._chainCache.applyBatchedUpdates(
            currentBlock,
            feeUpdates,
            trades.filter((trade) =>
              cachedPairs.has(toPairKey(trade.sourceToken, trade.targetToken))
            ),
            createdStrategies.filter((strategy) =>
              cachedPairs.has(toPairKey(strategy.token0, strategy.token1))
            ),
            updatedStrategies.filter((strategy) =>
              cachedPairs.has(toPairKey(strategy.token0, strategy.token1))
            ),
            deletedStrategies.filter((strategy) =>
              cachedPairs.has(toPairKey(strategy.token0, strategy.token1))
            )
          );

          // lastly - handle side effects such as new pair detected or default fee update
          if (defaultFeeWasUpdated) {
            logger.debug(
              '_syncEvents noticed at least one default fee update - refetching pair fees for all pairs'
            );
            await this._populateFeesData([...(await this._fetcher.pairs())]);
          }
          if (newlyCreatedPairs.length > 0) {
            logger.debug(
              '_syncEvents noticed at least one new pair created - setting slow poll mode to false'
            );
            this._slowPollPairs = false;
            logger.debug('_syncEvents fetching fees for the new pairs');
            await this._populateFeesData(newlyCreatedPairs);
          }
        }
      } catch (err) {
        logger.error('Error syncing events:', err);
      }

      setTimeout(processEvents, this._msToWaitBetweenSyncs);
    };
    setTimeout(processEvents, 1);
  }
  private _resetPairsFetching() {
    this._uncachedPairs = [];
    this._slowPollPairs = false;
  }

  /**
   * Detects blockchain reorganization by comparing stored block metadata with current blockchain state
   * @param currentBlock - The current block number to check against
   * @returns True if a reorganization is detected, false otherwise
   */
  private async _detectReorg(currentBlock: number): Promise<boolean> {
    logger.debug('_detectReorg called');
    const blocksMetadata: BlockMetadata[] = this._chainCache.blocksMetadata;
    const numberToBlockMetadata: { [key: number]: BlockMetadata } = {};

    for (const blockMetadata of blocksMetadata) {
      const { number, hash } = blockMetadata;

      // Check if stored block is in the future compared to current block
      if (number > currentBlock) {
        logger.log(
          'reorg detected for block number',
          number,
          'larger than current block',
          currentBlock,
          'with hash',
          hash
        );
        return true;
      }

      try {
        // Fetch current block data and handle potential null response
        const currentBlockData = await this._fetcher.getBlock(number);

        if (
          !currentBlockData ||
          !currentBlockData.hash ||
          !currentBlockData.number
        ) {
          logger.error(
            'Failed to fetch block data for block number',
            number,
            '- treating as potential reorg'
          );
          return true;
        }

        const currentHash = currentBlockData.hash;

        // Compare hashes to detect reorg
        if (hash !== currentHash) {
          logger.log(
            'reorg detected for block number',
            number,
            'old hash',
            hash,
            'new hash',
            currentHash
          );
          return true;
        }

        // Block metadata is valid, store it for later use without unneeded fields
        numberToBlockMetadata[number] = {
          number: blockMetadata.number,
          hash: blockMetadata.hash,
        };
      } catch (error) {
        logger.error(
          'Error fetching block data for block number',
          number,
          ':',
          error
        );
        // Treat any error as a potential reorg to be safe
        return true;
      }
    }

    // no reorg detected
    logger.debug('_detectReorg no reorg detected, updating blocks metadata');
    // let's store the new blocks metadata
    const latestBlocksMetadata: BlockMetadata[] = [];

    for (let i = 0; i < BLOCKS_TO_KEEP; i++) {
      const blockNumber = currentBlock - i;

      // Get blocks metadata either from cache or from the blockchain
      if (numberToBlockMetadata[blockNumber]) {
        latestBlocksMetadata.push(numberToBlockMetadata[blockNumber]);
      } else {
        try {
          const blockData = await this._fetcher.getBlock(blockNumber);

          if (!blockData || !blockData.number || !blockData.hash) {
            logger.error(
              'Failed to fetch new block data for block number',
              blockNumber,
              '- skipping this block'
            );
            continue;
          }

          // storing the block metadata without unneeded fields
          latestBlocksMetadata.push({
            number: blockData.number,
            hash: blockData.hash,
          });
        } catch (error) {
          logger.error(
            'Error fetching new block data for block number',
            blockNumber,
            ':',
            error,
            '- skipping this block'
          );
          continue;
        }
      }
    }

    this._chainCache.blocksMetadata = latestBlocksMetadata;
    logger.debug('_detectReorg updated blocks metadata');

    return false;
  }
}
