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
    const res = await this._contracts.carbonController.strategiesByPair(
      token0,
      token1,
      0,
      0
    );
    return res.map((r) => toStrategy(r));
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

  public getLatestStrategyCreatedStrategies = async (
    fromBlock: number,
    toBlock: number
  ): Promise<EncodedStrategy[]> => {
    const filter = this._contracts.carbonController.filters.StrategyCreated(
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
      const res: StrategyCreatedEventObject = log.args;
      return {
        id: res.id,
        token0: res.token0,
        token1: res.token1,
        order0: res.order0,
        order1: res.order1,
      };
    });
    return strategies;
  };

  public getLatestStrategyUpdatedStrategies = async (
    fromBlock: number,
    toBlock: number
  ): Promise<EncodedStrategy[]> => {
    const filter = this._contracts.carbonController.filters.StrategyUpdated(
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

    const strategies = logs.map((log) => {
      const res: StrategyUpdatedEventObject = log.args;
      return {
        id: res.id,
        token0: res.token0,
        token1: res.token1,
        order0: res.order0,
        order1: res.order1,
      };
    });
    return strategies;
  };

  public getLatestStrategyDeletedStrategies = async (
    fromBlock: number,
    toBlock: number
  ): Promise<EncodedStrategy[]> => {
    const filter = this._contracts.carbonController.filters.StrategyDeleted(
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
      const res: StrategyDeletedEventObject = log.args;
      return {
        id: res.id,
        token0: res.token0,
        token1: res.token1,
        order0: res.order0,
        order1: res.order1,
      };
    });
    return strategies;
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
