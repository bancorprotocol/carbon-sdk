import { BigNumber, BigNumberish } from '../utils/numerics';
import { Contracts } from './Contracts';
import { PayableOverrides, PopulatedTransaction } from 'ethers';
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
   * @param {BigNumberish} deadline - The deadline for the trade.
   * @param {BigNumberish} maxInput - The maximum amount of source token to be traded.
   * @param {PayableOverrides} overrides - The overrides for the transaction.
   * @returns {Promise<PopulatedTransaction>} - The populated transaction.
   */
  public tradeByTargetAmount(
    sourceToken: string,
    targetToken: string,
    tradeActions: TradeAction[],
    deadline: BigNumberish,
    maxInput: BigNumberish,
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

    return this._contracts.carbonController.populateTransaction.tradeByTargetAmount(
      sourceToken,
      targetToken,
      tradeActions,
      deadline,
      maxInput,
      customOverrides
    );
  }

  /**
   * Populates a transaction to trade a given amount of source token.
   * @param {string} sourceToken - The address of the token to be traded.
   * @param {string} targetToken - The address of the token to be received.
   * @param {TradeAction[]} tradeActions - The list of trade actions to be executed.
   * @param {BigNumberish} deadline - The deadline for the trade.
   * @param {BigNumberish} minReturn - The minimum amount of target token to be received.
   * @param {PayableOverrides} overrides - The overrides for the transaction.
   * @returns {Promise<PopulatedTransaction>} - The populated transaction.
   */
  public tradeBySourceAmount(
    sourceToken: string,
    targetToken: string,
    tradeActions: TradeAction[],
    deadline: BigNumberish,
    minReturn: BigNumberish,
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

    return this._contracts.carbonController.populateTransaction.tradeBySourceAmount(
      sourceToken,
      targetToken,
      tradeActions,
      deadline,
      minReturn,
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

    return this._contracts.carbonController.populateTransaction.createStrategy(
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
    let nativeTokenValue = BigNumber.from(0);
    // for each order using native token, sum the its y value into customOverrides.value
    for (const strategy of strategies) {
      if (isETHAddress(strategy.token0)) {
        nativeTokenValue = nativeTokenValue.add(strategy.order0.y);
      } else if (isETHAddress(strategy.token1)) {
        nativeTokenValue = nativeTokenValue.add(strategy.order1.y);
      }
    }
    if (nativeTokenValue.gt(0)) {
      customOverrides.value = nativeTokenValue;
    }

    logger.debug('batchCreateStrategies overrides', customOverrides);

    return this._contracts.carbonBatcher.populateTransaction.batchCreate(
      strategies.map((s) => ({
        tokens: [s.token0, s.token1],
        orders: [s.order0, s.order1],
      })),
      customOverrides
    );
  }

  public deleteStrategy(id: BigNumber) {
    return this._contracts.carbonController.populateTransaction.deleteStrategy(
      id
    );
  }

  public updateStrategy(
    strategyId: BigNumber,
    token0: string,
    token1: string,
    currentOrders: [EncodedOrder, EncodedOrder],
    newOrders: [EncodedOrder, EncodedOrder],
    overrides?: PayableOverrides
  ) {
    const customOverrides = { ...overrides };
    if (isETHAddress(token0) && newOrders[0].y.gt(currentOrders[0].y)) {
      customOverrides.value = newOrders[0].y.sub(currentOrders[0].y);
    } else if (isETHAddress(token1) && newOrders[1].y.gt(currentOrders[1].y)) {
      customOverrides.value = newOrders[1].y.sub(currentOrders[1].y);
    }

    logger.debug('updateStrategy overrides', customOverrides);

    return this._contracts.carbonController.populateTransaction.updateStrategy(
      strategyId,
      currentOrders,
      newOrders,
      customOverrides
    );
  }
}
