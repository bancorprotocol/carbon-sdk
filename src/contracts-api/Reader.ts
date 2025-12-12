import {
  StrategyStructOutput,
  CarbonController,
} from '../abis/types/CarbonController';
import { Contracts } from './Contracts';
import {
  isETHAddress,
  MultiCall,
  MulticallService,
  DefaultMulticallService,
} from './utils';
import { Logger } from '../common/logger';
import {
  EncodedStrategy,
  Fetcher,
  TokenPair,
  BlockMetadata,
  TradingFeeUpdate,
  SyncedEvents,
  SyncedEvent,
} from '../common/types';
const logger = new Logger('Reader.ts');

function toStrategy(res: StrategyStructOutput): EncodedStrategy {
  const id = res[0];
  const token0 = res[2][0];
  const token1 = res[2][1];
  const y0 = res[3][0][0];
  const z0 = res[3][0][1];
  const A0 = res[3][0][2];
  const B0 = res[3][0][3];
  const y1 = res[3][1][0];
  const z1 = res[3][1][1];
  const A1 = res[3][1][2];
  const B1 = res[3][1][3];
  return {
    id,
    token0,
    token1,
    order0: {
      y: y0,
      z: z0,
      A: A0,
      B: B0,
    },
    order1: {
      y: y1,
      z: z1,
      A: A1,
      B: B1,
    },
  };
}

/**
 * Class that provides methods to read data from contracts.
 */
export default class Reader implements Fetcher {
  private _contracts: Contracts;
  private _multicallService: MulticallService;

  public constructor(
    contracts: Contracts,
    multicallService?: MulticallService
  ) {
    this._contracts = contracts;
    this._multicallService =
      multicallService ?? new DefaultMulticallService(contracts.multicall);
  }

  private _multicall(calls: MultiCall[], blockHeight?: number) {
    return this._multicallService.execute(calls, blockHeight);
  }

  public async strategy(id: bigint): Promise<EncodedStrategy> {
    logger.debug('strategy called', id);
    try {
      const res = await this._contracts.carbonController.strategy(id);
      return toStrategy(res);
    } catch (error) {
      logger.error('strategy error', error);
      throw error;
    }
  }

  public async strategies(ids: bigint[]): Promise<EncodedStrategy[]> {
    logger.debug('strategies called', ids);
    try {
      const results = await this._multicall(
        ids.map((id) => ({
          contractAddress: this._contracts.carbonController.target as string,
          interface: this._contracts.carbonController.interface,
          methodName: 'strategy',
          methodParameters: [id],
        }))
      );
      logger.debug('strategies results', results);
      if (!results || results.length === 0) return [];

      return results.map((strategyRes) => {
        const strategy = strategyRes[0] as StrategyStructOutput;
        return toStrategy(strategy);
      });
    } catch (error) {
      logger.error('strategies error', error);
      throw error;
    }
  }

  public async pairs(): Promise<TokenPair[]> {
    logger.debug('pairs called');
    try {
      const pairs = await this._contracts.carbonController.pairs();
      return pairs.map(
        (pair) => [pair[0].toString(), pair[1].toString()] as TokenPair
      );
    } catch (error) {
      logger.error('pairs error', error);
      throw error;
    }
  }

  public async strategiesByPair(
    token0: string,
    token1: string
  ): Promise<EncodedStrategy[]> {
    logger.debug('strategiesByPair called', token0, token1);
    try {
      const allStrategies: EncodedStrategy[] = [];
      let startIndex = 0;
      const chunkSize = 1000;

      while (true) {
        const res =
          (await this._contracts.carbonController.strategiesByPair(
            token0,
            token1,
            startIndex,
            startIndex + chunkSize
          )) ?? [];

        allStrategies.push(...res.map((r) => toStrategy(r)));

        if (res.length < chunkSize) break;

        startIndex += chunkSize;
      }

      return allStrategies;
    } catch (error) {
      logger.error('strategiesByPair error', error);
      throw error;
    }
  }

  public async strategiesByPairs(pairs: TokenPair[]): Promise<
    {
      pair: TokenPair;
      strategies: EncodedStrategy[];
    }[]
  > {
    logger.debug('strategiesByPairs called', pairs);
    try {
      const chunkSize = 1000;
      const results: { pair: TokenPair; strategies: EncodedStrategy[] }[] = [];
      const pairsNeedingMore: { pair: TokenPair; index: number }[] = [];

      logger.debug('strategiesByPairs first chunk');
      try {
        // First, get the first chunk for all pairs using multicall
        const firstChunkResults = await this._multicall(
          pairs.map((pair) => ({
            contractAddress: this._contracts.carbonController.target as string,
            interface: this._contracts.carbonController.interface,
            methodName: 'strategiesByPair',
            methodParameters: [pair[0], pair[1], 0, chunkSize],
          }))
        );

        logger.debug(
          'strategiesByPairs first chunk results count',
          firstChunkResults.length
        );

        if (!firstChunkResults || firstChunkResults.length === 0) return [];

        // Process first chunk results and identify pairs needing more
        firstChunkResults.forEach((result, i) => {
          const strategiesResult = (result[0] ?? []) as StrategyStructOutput[];
          const currentPair = pairs[i];

          results.push({
            pair: currentPair,
            strategies: strategiesResult.map((r) => toStrategy(r)),
          });

          // If we got a full chunk, we need to fetch more
          if (strategiesResult.length === chunkSize) {
            pairsNeedingMore.push({ pair: currentPair, index: i });
          }
        });
      } catch (error) {
        logger.error('strategiesByPairs first chunk error', error);
        throw error;
      }

      logger.debug('number of pairs needing more', pairsNeedingMore.length);

      try {
        // Fetch remaining strategies for pairs that need it
        for (const { pair, index } of pairsNeedingMore) {
          let startIndex = chunkSize;

          while (true) {
            const res =
              (await this._contracts.carbonController.strategiesByPair(
                pair[0],
                pair[1],
                startIndex,
                startIndex + chunkSize
              )) ?? [];

            results[index].strategies.push(...res.map((r) => toStrategy(r)));

            if (res.length < chunkSize) break;
            startIndex += chunkSize;
          }
        }
      } catch (error) {
        logger.error('strategiesByPairs remaining chunks error', error);
        throw error;
      }

      return results;
    } catch (error) {
      logger.error('strategiesByPairs error', error);
      throw error;
    }
  }

  public async tokensByOwner(owner: string) {
    logger.debug('tokensByOwner called', owner);
    if (!owner) return [];
    try {
      const result = await this._contracts.voucher.tokensByOwner(owner, 0, 0);
      return result.map((r) => BigInt(r));
    } catch (error) {
      logger.error('tokensByOwner error', error);
      throw error;
    }
  }

  public async tradingFeePPM(): Promise<number> {
    logger.debug('tradingFeePPM called');
    try {
      const result = await this._contracts.carbonController.tradingFeePPM();
      return Number(result);
    } catch (error) {
      logger.error('tradingFeePPM error', error);
      throw error;
    }
  }

  public onTradingFeePPMUpdated(
    listener: (prevFeePPM: number, newFeePPM: number) => void
  ): Promise<CarbonController> {
    return this._contracts.carbonController.on(
      this._contracts.carbonController.getEvent('TradingFeePPMUpdated'),
      (prevFeePPM: bigint, newFeePPM: bigint, _event) => {
        logger.debug('TradingFeePPMUpdated fired with', {
          prevFeePPM,
          newFeePPM,
        });
        listener(Number(prevFeePPM), Number(newFeePPM));
      }
    );
  }

  public async pairTradingFeePPM(
    token0: string,
    token1: string
  ): Promise<number> {
    logger.debug('pairTradingFeePPM called', token0, token1);
    try {
      const result = await this._contracts.carbonController.pairTradingFeePPM(
        token0,
        token1
      );
      return Number(result);
    } catch (error) {
      logger.error('pairTradingFeePPM error', error);
      throw error;
    }
  }

  public async pairsTradingFeePPM(
    pairs: TokenPair[]
  ): Promise<[string, string, number][]> {
    logger.debug('pairsTradingFeePPM called', pairs);
    try {
      const results = await this._multicall(
        pairs.map((pair) => ({
          contractAddress: this._contracts.carbonController.target as string,
          interface: this._contracts.carbonController.interface,
          methodName: 'pairTradingFeePPM',
          methodParameters: [pair[0], pair[1]],
        }))
      );
      logger.debug('pairsTradingFeePPM results', results);
      if (!results || results.length === 0) return [];
      return results.map((res, i) => {
        return [pairs[i][0], pairs[i][1], Number(res[0])];
      });
    } catch (error) {
      logger.error('pairsTradingFeePPM error', error);
      throw error;
    }
  }

  public onPairTradingFeePPMUpdated(
    listener: (
      token0: string,
      token1: string,
      prevFeePPM: number,
      newFeePPM: number
    ) => void
  ) {
    return this._contracts.carbonController.on(
      this._contracts.carbonController.getEvent('PairTradingFeePPMUpdated'),
      (
        token0: string,
        token1: string,
        prevFeePPM: bigint,
        newFeePPM: bigint,
        _event
      ) => {
        logger.debug('PairTradingFeePPMUpdated fired with', {
          token0,
          token1,
          prevFeePPM,
          newFeePPM,
        });
        listener(token0, token1, Number(prevFeePPM), Number(newFeePPM));
      }
    );
  }

  public getDecimalsByAddress = async (address: string): Promise<number> => {
    if (isETHAddress(address)) {
      return 18;
    }
    const result = await this._contracts.token(address).decimals();
    return Number(result);
  };

  public getBlockNumber = async (): Promise<number> => {
    return this._contracts.provider.getBlockNumber();
  };

  public getBlock = async (blockNumber: number): Promise<BlockMetadata> => {
    const block = await this._contracts.provider.getBlock(blockNumber);
    if (!block) {
      throw new Error(`Block ${blockNumber} not found`);
    }
    return {
      number: block.number,
      hash: block.hash ?? '',
    };
  };

  /**
   * Fetches all events from a block range using eth_getLogs with chunking
   * @param fromBlock - Starting block number
   * @param toBlock - Ending block number
   * @param maxChunkSize - Maximum number of blocks to query in a single request
   * @returns Array of typed events sorted by block number and log index
   */
  public async getEvents(
    fromBlock: number,
    toBlock: number,
    maxChunkSize: number = 2000
  ): Promise<SyncedEvents> {
    // Calculate number of chunks needed
    const totalBlocks = toBlock - fromBlock + 1;
    const numChunks = Math.ceil(totalBlocks / maxChunkSize);

    // Create chunk ranges
    const chunks = Array.from({ length: numChunks }, (_, i) => {
      const chunkStart = fromBlock + i * maxChunkSize;
      const chunkEnd = Math.min(chunkStart + maxChunkSize - 1, toBlock);
      return { start: chunkStart, end: chunkEnd };
    });

    // Fetch logs for all chunks concurrently
    const chunkResults = await Promise.all(
      chunks.map(async ({ start, end }) => {
        const logs = await this._contracts.provider.getLogs({
          address: this._contracts.carbonController.target as string,
          fromBlock: start,
          toBlock: end,
        });
        return logs;
      })
    );

    // Flatten and process all logs
    const allEvents = chunkResults
      .flat()
      .map((log) => {
        // Get event type from topics
        const parsedLog = this._contracts.carbonController.interface.parseLog({
          topics: log.topics,
          data: log.data,
        });

        if (!parsedLog) return null;

        const eventType = parsedLog.name as SyncedEvent['type'];

        switch (eventType) {
          case 'StrategyCreated':
          case 'StrategyUpdated':
          case 'StrategyDeleted': {
            const eventData: EncodedStrategy = {
              id: parsedLog.args.id,
              token0: parsedLog.args.token0,
              token1: parsedLog.args.token1,
              order0: {
                A: parsedLog.args.order0.A,
                B: parsedLog.args.order0.B,
                y: parsedLog.args.order0.y,
                z: parsedLog.args.order0.z,
              },
              order1: {
                A: parsedLog.args.order1.A,
                B: parsedLog.args.order1.B,
                y: parsedLog.args.order1.y,
                z: parsedLog.args.order1.z,
              },
            };
            return {
              type: eventType,
              blockNumber: log.blockNumber,
              logIndex: log.index,
              data: eventData,
            } as const;
          }
          case 'TradingFeePPMUpdated': {
            const eventData: number = parsedLog.args.newFeePPM;
            return {
              type: eventType,
              blockNumber: log.blockNumber,
              logIndex: log.index,
              data: eventData,
            } as const;
          }
          case 'PairTradingFeePPMUpdated': {
            const eventData: TradingFeeUpdate = [
              parsedLog.args.token0,
              parsedLog.args.token1,
              parsedLog.args.newFeePPM,
            ];
            return {
              type: eventType,
              blockNumber: log.blockNumber,
              logIndex: log.index,
              data: eventData,
            } as const;
          }
          default:
            return null;
        }
      })
      .filter((event): event is NonNullable<typeof event> => event !== null)
      // Sort by block number and log index
      .sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) {
          return a.blockNumber - b.blockNumber;
        }
        return a.logIndex - b.logIndex;
      });

    return allEvents;
  }
}
