import { BigNumber } from '../utils/numerics';
import {
  StrategyStructOutput,
  TokensTradedEventObject,
  StrategyCreatedEventObject,
  StrategyUpdatedEventObject,
  StrategyDeletedEventObject,
} from '../abis/types/CarbonController';
import Contracts from './Contracts';
import { isETHAddress, MultiCall, multicall } from './utils';
import { Logger } from '../common/logger';
import {
  EncodedStrategy,
  Fetcher,
  TokenPair,
  TradeData,
  BlockMetadata,
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

  public constructor(contracts: Contracts) {
    this._contracts = contracts;
  }

  private _multicall(calls: MultiCall[], blockHeight?: number) {
    return multicall(calls, this._contracts.multicall, blockHeight);
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

    return results
      .map((strategyRes) => {
        try {
          if (!strategyRes) return null;
          const strategy = strategyRes[0] as StrategyStructOutput;
          return toStrategy(strategy);
        } catch {
          return null as any;
        }
      })
      .filter((s) => !!s);
  }

  public pairs(): Promise<TokenPair[]> {
    return this._contracts.carbonController.pairs();
  }

  private async _strategiesByPairWithMulticall(
    token0: string,
    token1: string
  ): Promise<EncodedStrategy[]> {
    logger.debug('_strategiesByPairWithMulticall called', arguments);
    const count = await this._contracts.carbonController.strategiesByPairCount(
      token0,
      token1
    );
    logger.debug(
      '_strategiesByPairWithMulticall has',
      count,
      'for',
      token0,
      token1
    );

    const calls = [];
    for (let i = 0; count.gt(i); i++) {
      calls.push({
        contractAddress: this._contracts.carbonController.address,
        interface: this._contracts.carbonController.interface,
        methodName: 'strategiesByPair',
        methodParameters: [token0, token1, i, i + 1],
      });
    }

    let results;
    try {
      results = await this._multicall(calls);
    } catch (e) {
      logger.log('--- multicall error ---');
      logger.log(e);
    }
    if (!results || results.length === 0) {
      logger.debug('no results returned from multicall');
      return [];
    }
    if (results.length < calls.length) {
      logger.debug('Not all strategies returned for pair', token0, token1);
    }

    const strategies = results
      .map((strategyRes) => {
        try {
          if (!strategyRes || strategyRes[0].length === 0) return null;
          const strategy = strategyRes[0][0] as StrategyStructOutput;
          return toStrategy(strategy);
        } catch {
          return null as any;
        }
      })
      .filter((s) => !!s);

    logger.debug('multicall returned', strategies.length, 'strategies');
    return strategies;
  }

  public async strategiesByPair(
    token0: string,
    token1: string
  ): Promise<EncodedStrategy[]> {
    let res: StrategyStructOutput[] = [];
    let error = null;
    try {
      res = await this._contracts.carbonController.strategiesByPair(
        token0,
        token1,
        0,
        0
      );
    } catch (e) {
      logger.log('error while fetching strategiesByPair', e);
      console.dir(e);
      error = e;
    }

    if (!error) {
      return res.map((r) => toStrategy(r));
    }

    if (error) { //if ((error as any).errorName === 'StrategyDoesNotExist') {
      return this._strategiesByPairWithMulticall(token0, token1);
    }

    return [];
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

  public getDecimalsByAddress = async (address: string) => {
    if (isETHAddress(address)) {
      return 18 as number;
    }
    return this._contracts.token(address).decimals();
  };

  private _getFilteredStrategies = async (
    eventType: 'StrategyCreated' | 'StrategyUpdated' | 'StrategyDeleted',
    fromBlock: number,
    toBlock: number
  ): Promise<EncodedStrategy[]> => {
    const filter = this._contracts.carbonController.filters[eventType](
      null,
      null,
      null,
      null,
      null
    );
    const logs = await this._contracts.carbonController.queryFilter(
      filter,
      fromBlock,
      toBlock
    );

    if (logs.length === 0) return [];

    const strategies = logs.map((log) => {
      const logArgs:
        | StrategyCreatedEventObject
        | StrategyUpdatedEventObject
        | StrategyDeletedEventObject = log.args;

      return {
        id: logArgs.id,
        token0: logArgs.token0,
        token1: logArgs.token1,
        order0: {
          y: logArgs.order0.y,
          z: logArgs.order0.z,
          A: logArgs.order0.A,
          B: logArgs.order0.B,
        },
        order1: {
          y: logArgs.order1.y,
          z: logArgs.order1.z,
          A: logArgs.order1.A,
          B: logArgs.order1.B,
        },
      };
    });
    return strategies;
  };

  public getLatestStrategyCreatedStrategies = async (
    fromBlock: number,
    toBlock: number
  ): Promise<EncodedStrategy[]> => {
    return this._getFilteredStrategies('StrategyCreated', fromBlock, toBlock);
  };

  public getLatestStrategyUpdatedStrategies = async (
    fromBlock: number,
    toBlock: number
  ): Promise<EncodedStrategy[]> => {
    return this._getFilteredStrategies('StrategyUpdated', fromBlock, toBlock);
  };

  public getLatestStrategyDeletedStrategies = async (
    fromBlock: number,
    toBlock: number
  ): Promise<EncodedStrategy[]> => {
    return this._getFilteredStrategies('StrategyDeleted', fromBlock, toBlock);
  };

  public getLatestTokensTradedTrades = async (
    fromBlock: number,
    toBlock: number
  ): Promise<TradeData[]> => {
    const filter = this._contracts.carbonController.filters.TokensTraded(
      null,
      null,
      null,
      null,
      null,
      null,
      null
    );
    const logs = await this._contracts.carbonController.queryFilter(
      filter,
      fromBlock,
      toBlock
    );
    if (logs.length === 0) return [];

    const trades = logs.map((log) => {
      const res: TokensTradedEventObject = log.args;
      return {
        sourceToken: res.sourceToken,
        targetToken: res.targetToken,
        sourceAmount: res.sourceAmount.toString(),
        targetAmount: res.targetAmount.toString(),
        trader: res.trader,
        tradingFeeAmount: res.tradingFeeAmount.toString(),
        byTargetAmount: res.byTargetAmount,
      };
    });
    return trades;
  };

  public getBlockNumber = async (): Promise<number> => {
    return this._contracts.provider.getBlockNumber();
  };

  public getBlock = async (blockNumber: number): Promise<BlockMetadata> => {
    return this._contracts.provider.getBlock(blockNumber);
  };
}
