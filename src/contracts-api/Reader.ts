import { BigNumber } from '../utils/numerics';
import { StrategyStructOutput } from '../abis/types/CarbonController';
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
  TradeData,
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

  public async strategy(id: BigNumber): Promise<EncodedStrategy> {
    const res = await this._contracts.carbonController.strategy(id);
    return toStrategy(res);
  }

  public async strategies(ids: BigNumber[]): Promise<EncodedStrategy[]> {
    const results = await this._multicall(
      ids.map((id) => ({
        contractAddress: this._contracts.carbonController.address,
        interface: this._contracts.carbonController.interface,
        methodName: 'strategy',
        methodParameters: [id],
      }))
    );
    if (!results || results.length === 0) return [];

    return results.map((strategyRes) => {
      const strategy = strategyRes[0] as StrategyStructOutput;
      return toStrategy(strategy);
    });
  }

  public pairs(): Promise<TokenPair[]> {
    return this._contracts.carbonController.pairs();
  }

  public async strategiesByPair(
    token0: string,
    token1: string
  ): Promise<EncodedStrategy[]> {
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
  }

  public async strategiesByPairs(pairs: TokenPair[]): Promise<
    {
      pair: TokenPair;
      strategies: EncodedStrategy[];
    }[]
  > {
    const chunkSize = 1000;
    const results: { pair: TokenPair; strategies: EncodedStrategy[] }[] = [];
    const pairsNeedingMore: { pair: TokenPair; index: number }[] = [];

    // First, get the first chunk for all pairs using multicall
    const firstChunkResults = await this._multicall(
      pairs.map((pair) => ({
        contractAddress: this._contracts.carbonController.address,
        interface: this._contracts.carbonController.interface,
        methodName: 'strategiesByPair',
        methodParameters: [pair[0], pair[1], 0, chunkSize],
      }))
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

    return results;
  }

  public async tokensByOwner(owner: string) {
    if (!owner) return [];

    return this._contracts.voucher.tokensByOwner(owner, 0, 0);
  }

  public tradingFeePPM(): Promise<number> {
    return this._contracts.carbonController.tradingFeePPM();
  }

  public onTradingFeePPMUpdated(
    listener: (prevFeePPM: number, newFeePPM: number) => void
  ) {
    return this._contracts.carbonController.on(
      'TradingFeePPMUpdated',
      function (prevFeePPM: number, newFeePPM: number) {
        logger.debug('TradingFeePPMUpdated fired with', arguments);
        listener(prevFeePPM, newFeePPM);
      }
    );
  }

  public pairTradingFeePPM(token0: string, token1: string): Promise<number> {
    return this._contracts.carbonController.pairTradingFeePPM(token0, token1);
  }

  public async pairsTradingFeePPM(
    pairs: TokenPair[]
  ): Promise<[string, string, number][]> {
    const results = await this._multicall(
      pairs.map((pair) => ({
        contractAddress: this._contracts.carbonController.address,
        interface: this._contracts.carbonController.interface,
        methodName: 'pairTradingFeePPM',
        methodParameters: [pair[0], pair[1]],
      }))
    );
    if (!results || results.length === 0) return [];
    return results.map((res, i) => {
      return [pairs[i][0], pairs[i][1], Number(res[0])];
    });
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
      'PairTradingFeePPMUpdated',
      function (
        token0: string,
        token1: string,
        prevFeePPM: number,
        newFeePPM: number
      ) {
        logger.debug('PairTradingFeePPMUpdated fired with', arguments);
        listener(token0, token1, prevFeePPM, newFeePPM);
      }
    );
  }

  public getDecimalsByAddress = async (address: string) => {
    if (isETHAddress(address)) {
      return 18 as number;
    }
    return this._contracts.token(address).decimals();
  };

  public getBlockNumber = async (): Promise<number> => {
    return this._contracts.provider.getBlockNumber();
  };

  public getBlock = async (blockNumber: number): Promise<BlockMetadata> => {
    return this._contracts.provider.getBlock(blockNumber);
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
          address: this._contracts.carbonController.address,
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
              logIndex: log.logIndex,
              data: eventData,
            } as const;
          }
          case 'TokensTraded': {
            const eventData: TradeData = {
              trader: parsedLog.args.trader,
              sourceToken: parsedLog.args.sourceToken,
              targetToken: parsedLog.args.targetToken,
              sourceAmount: parsedLog.args.sourceAmount.toString(),
              targetAmount: parsedLog.args.targetAmount.toString(),
              tradingFeeAmount: parsedLog.args.tradingFeeAmount.toString(),
              byTargetAmount: parsedLog.args.byTargetAmount,
            };
            return {
              type: eventType,
              blockNumber: log.blockNumber,
              logIndex: log.logIndex,
              data: eventData,
            } as const;
          }
          case 'TradingFeePPMUpdated': {
            const eventData: number = parsedLog.args.newFeePPM;
            return {
              type: eventType,
              blockNumber: log.blockNumber,
              logIndex: log.logIndex,
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
              logIndex: log.logIndex,
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
