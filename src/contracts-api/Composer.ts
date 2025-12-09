import { BigIntish } from '../utils/numerics';
import { Contracts } from './Contracts';
import { PayableOverrides, PopulatedTransaction } from '../common/types';
import { buildTradeOverrides, isETHAddress } from './utils';
import { Logger } from '../common/logger';
import { EncodedOrder, TradeAction } from '../common/types';
const logger = new Logger('Composer.ts');

/**
 * Class that composes and populates transactions for trade and strategy management.
 */
export default class Composer {
  private _contracts: Contracts;

  public constructor(contracts: Contracts) {
    this._contracts = contracts;
  }

  /**
   *
   * @param {string} sourceToken - The address of the token to be traded.
   * @param {string} targetToken - The address of the token to be received.
   * @param {TradeAction[]} tradeActions - The list of trade actions to be executed.
   * @param {BigIntish} deadline - The deadline for the trade.
   * @param {BigIntish} maxInput - The maximum amount of source token to be traded.
   * @param {PayableOverrides} overrides - The overrides for the transaction.
   * @returns {Promise<PopulatedTransaction>} - The populated transaction.
   */
  public tradeByTargetAmount(
    sourceToken: string,
    targetToken: string,
    tradeActions: TradeAction[],
    deadline: BigIntish,
    maxInput: BigIntish,
    overrides?: PayableOverrides
  ): Promise<PopulatedTransaction> {
    logger.debug('tradeByTargetAmount called', arguments);

    const customOverrides = buildTradeOverrides(
      sourceToken,
      tradeActions,
      true,
      maxInput,
      overrides
    );

    logger.debug('tradeByTargetAmount overrides', customOverrides);

    return this._contracts.carbonController.tradeByTargetAmount.populateTransaction(
      sourceToken,
      targetToken,
      tradeActions,
      BigInt(deadline),
      BigInt(maxInput),
      customOverrides
    );
  }

  /**
   * Populates a transaction to trade a given amount of source token.
   * @param {string} sourceToken - The address of the token to be traded.
   * @param {string} targetToken - The address of the token to be received.
   * @param {TradeAction[]} tradeActions - The list of trade actions to be executed.
   * @param {BigIntish} deadline - The deadline for the trade.
   * @param {BigIntish} minReturn - The minimum amount of target token to be received.
   * @param {PayableOverrides} overrides - The overrides for the transaction.
   * @returns {Promise<PopulatedTransaction>} - The populated transaction.
   */
  public tradeBySourceAmount(
    sourceToken: string,
    targetToken: string,
    tradeActions: TradeAction[],
    deadline: BigIntish,
    minReturn: BigIntish,
    overrides?: PayableOverrides
  ) {
    logger.debug('tradeBySourceAmount called', arguments);

    const customOverrides = buildTradeOverrides(
      sourceToken,
      tradeActions,
      false,
      -1,
      overrides
    );

    logger.debug('tradeBySourceAmount overrides', customOverrides);

    return this._contracts.carbonController.tradeBySourceAmount.populateTransaction(
      sourceToken,
      targetToken,
      tradeActions,
      BigInt(deadline),
      BigInt(minReturn),
      customOverrides
    );
  }

  public createStrategy(
    token0: string,
    token1: string,
    order0: EncodedOrder,
    order1: EncodedOrder,
    overrides?: PayableOverrides
  ) {
    logger.debug('createStrategy called', arguments);

    const customOverrides = { ...overrides };
    if (isETHAddress(token0)) {
      customOverrides.value = order0.y;
    } else if (isETHAddress(token1)) {
      customOverrides.value = order1.y;
    }

    logger.debug('createStrategy overrides', customOverrides);

    return this._contracts.carbonController.createStrategy.populateTransaction(
      token0,
      token1,
      [order0, order1],
      customOverrides
    );
  }

  public batchCreateStrategies(
    strategies: {
      token0: string;
      token1: string;
      order0: EncodedOrder;
      order1: EncodedOrder;
    }[],
    overrides?: PayableOverrides
  ) {
    logger.debug('batchCreateStrategies called', arguments);

    const customOverrides = { ...overrides };
    let nativeTokenValue = 0n;
    // for each order using native token, sum the its y value into customOverrides.value
    for (const strategy of strategies) {
      if (isETHAddress(strategy.token0)) {
        nativeTokenValue = nativeTokenValue + strategy.order0.y;
      } else if (isETHAddress(strategy.token1)) {
        nativeTokenValue = nativeTokenValue + strategy.order1.y;
      }
    }
    if (nativeTokenValue > 0n) {
      customOverrides.value = nativeTokenValue;
    }

    logger.debug('batchCreateStrategies overrides', customOverrides);

    return this._contracts.carbonBatcher.batchCreate.populateTransaction(
      strategies.map((s) => ({
        tokens: [s.token0, s.token1],
        orders: [s.order0, s.order1],
      })),
      customOverrides
    );
  }

  public deleteStrategy(id: bigint) {
    return this._contracts.carbonController.deleteStrategy.populateTransaction(
      id
    );
  }

  public updateStrategy(
    strategyId: bigint,
    token0: string,
    token1: string,
    currentOrders: [EncodedOrder, EncodedOrder],
    newOrders: [EncodedOrder, EncodedOrder],
    overrides?: PayableOverrides
  ) {
    const customOverrides = { ...overrides };
    if (isETHAddress(token0) && newOrders[0].y > currentOrders[0].y) {
      const diff = newOrders[0].y - currentOrders[0].y;
      customOverrides.value = diff;
    } else if (isETHAddress(token1) && newOrders[1].y > currentOrders[1].y) {
      const diff = newOrders[1].y - currentOrders[1].y;
      customOverrides.value = diff;
    }

    logger.debug('updateStrategy overrides', customOverrides);

    return this._contracts.carbonController.updateStrategy.populateTransaction(
      strategyId,
      currentOrders,
      newOrders,
      customOverrides
    );
  }
}
