// External libraries
import { PopulatedTransaction } from '@ethersproject/contracts';
import { PayableOverrides } from 'ethers';
import {
  BigNumber,
  Decimal,
  mulDiv,
  tenPow,
  formatUnits,
  parseUnits,
  BigNumberMax,
} from '../utils/numerics';

// Internal modules
import { ChainCache } from '../chain-cache';
import { ContractsApi } from '../contracts-api';
import {
  DecodedOrder,
  DecodedStrategy,
  EncodedStrategy,
  Filter,
  Action,
  Strategy,
  StrategyUpdate,
  OrdersMapBNStr,
  MatchActionBNStr,
  TradeActionBNStr,
  EncodedStrategyBNStr,
  MatchType,
  MatchOptions,
  TokenPair,
} from '../common/types';
import { DecimalFetcher, Decimals } from '../utils/decimals';

// Trade matcher utilities
import {
  getEncodedTradeSourceAmount,
  matchBySourceAmount,
  matchByTargetAmount,
} from '../trade-matcher';

// Stats functions
import { getDepths, getMaxRate, getMinRate } from './stats';

// Logger
import { Logger } from '../common/logger';
const logger = new Logger('Toolkit.ts');

// Strategy utils
import {
  addFee,
  buildStrategyObject,
  calculateOverlappingBuyBudget,
  calculateOverlappingSellBudget,
  decodeStrategy,
  encodeStrategy,
  normalizeRate,
  parseStrategy,
  subtractFee,
} from './utils';

import {
  decodeOrder,
  encodedStrategyStrToBN,
  matchActionBNToStr,
  ordersMapBNToStr,
  ordersMapStrToBN,
  tradeActionStrToBN,
} from '../utils';

/**
 * Enum representing options for the marginal price parameter of the function.
 */
export enum MarginalPriceOptions {
  /** Indicates that the marginal price should be reset to its default value. */
  reset = 'RESET',

  /** Indicates that the marginal price should be maintained at its current value. */
  maintain = 'MAINTAIN',
}

// Helper function to check whether an actual number was passed and not undefined or the reset/maintain options
export function isMarginalPriceValue(
  marginalPrice?: MarginalPriceOptions | string
): boolean {
  return (
    marginalPrice !== undefined &&
    marginalPrice !== MarginalPriceOptions.reset &&
    marginalPrice !== MarginalPriceOptions.maintain
  );
}

export class Toolkit {
  private _api: ContractsApi;
  private _decimals: Decimals;
  private _cache: ChainCache;

  /**
   * Constructs a new Toolkit instance.
   *
   * @param {ContractsApi} api - The ContractsApi instance.
   * @param {DecimalFetcher} [decimalFetcher] - Optional DecimalFetcher.
   */
  public constructor(
    api: ContractsApi,
    cache: ChainCache,
    decimalFetcher?: DecimalFetcher
  ) {
    logger.debug('SDK class constructor called with', arguments);
    this._api = api;
    this._cache = cache;

    // Create a fetcher that uses decimalFetcher if defined.
    // If decimalFetcher(address) returns undefined or if decimalFetcher
    // is undefined, use the default fetcher.
    const fetcher = async (address: string) => {
      const decimals =
        (await decimalFetcher?.(address)) ??
        (await this._api.reader.getDecimalsByAddress(address));
      return decimals;
    };
    this._decimals = new Decimals(fetcher);
  }

  public static getMatchActions(
    amountWei: string,
    tradeByTargetAmount: boolean,
    ordersMap: OrdersMapBNStr,
    matchType: MatchType = MatchType.Fast,
    filter?: Filter
  ): MatchActionBNStr[] {
    const orders = ordersMapStrToBN(ordersMap);
    let result: MatchOptions;
    if (tradeByTargetAmount) {
      result = matchByTargetAmount(
        BigNumber.from(amountWei),
        orders,
        [matchType],
        filter
      );
    } else {
      result = matchBySourceAmount(
        BigNumber.from(amountWei),
        orders,
        [matchType],
        filter
      );
    }
    return result[matchType]?.map(matchActionBNToStr) ?? [];
  }

  /**
   * Returns whether a pair has liquidity
   *
   * @param {string} sourceToken - address of the token the trade sells.
   * @param {string} targetToken - address of the token the trade buys.
   *
   * @returns {Boolean} true or false.
   * @throws {Error} If `startDataSync` has not been called.
   * @throws {Error} If no orders have been found.
   */
  public async hasLiquidityByPair(
    sourceToken: string,
    targetToken: string
  ): Promise<boolean> {
    logger.debug('hasLiquidityByPair called', arguments);

    const orders = await this._cache.getOrdersByPair(sourceToken, targetToken);

    logger.debug('hasLiquidityByPair info:', {
      orders,
    });
    return Object.keys(orders).length > 0;
  }

  /**
   * Returns liquidity for a given pair.
   *
   * @param {string} sourceToken - address of the token the trade sells.
   * @param {string} targetToken - address of the token the trade buys.
   *
   * @returns {Promise<String>} liquidity value as string
   * @throws {Error} If `startDataSync` has not been called.
   */
  public async getLiquidityByPair(
    sourceToken: string,
    targetToken: string
  ): Promise<string> {
    logger.debug('getLiquidityByPair called', arguments);

    const orders = await this._cache.getOrdersByPair(sourceToken, targetToken);
    const liquidityWei = Object.values(orders).reduce(
      (acc, { y }) => acc.add(y),
      BigNumber.from(0)
    );
    const decimals = await this._decimals.fetchDecimals(targetToken);

    const liquidity = formatUnits(liquidityWei, decimals);
    logger.debug('getLiquidityByPair info:', {
      orders,
      liquidityWei,
      targetToken,
      decimals,
      liquidity,
    });
    return liquidity;
  }

  /**
   * Returns the maximum source amount for a given pair.
   * This is the sum of all source amounts in the orderbook.
   * This number represents the maximum amount that can be traded by source.
   *
   * @param {string} sourceToken - Address of the token the trade sells.
   * @param {string} targetToken - Address of the token the trade buys.
   *
   * @returns {Promise<string>} Maximum source amount as a string.
   * @throws {Error} If `startDataSync` has not been called.
   */
  public async getMaxSourceAmountByPair(
    sourceToken: string,
    targetToken: string
  ): Promise<string> {
    logger.debug('getMaxSourceAmountByPair called', arguments);

    const orders = await this._cache.getOrdersByPair(sourceToken, targetToken);
    const maxSourceAmountWei = Object.values(orders).reduce(
      (acc, order) => acc.add(getEncodedTradeSourceAmount(order.y, order)),
      BigNumber.from(0)
    );
    const decimals = await this._decimals.fetchDecimals(sourceToken);

    const maxSourceAmount = formatUnits(maxSourceAmountWei, decimals);
    logger.debug('getMaxSourceAmountByPair info:', {
      orders,
      maxSourceAmountWei,
      sourceToken,
      decimals,
      maxSourceAmount,
    });
    return maxSourceAmount;
  }

  /**
   * Gets the strategy by its id
   *
   * If the cache is synced, it will return the strategy from the cache.
   * Otherwise, it will fetch the strategy from the chain.
   *
   * @param {string} id - ID of the strategy to fetch.
   */
  public async getStrategyById(id: string): Promise<Strategy> {
    logger.debug('getStrategyById called', arguments);

    let encodedStrategy: EncodedStrategy | undefined;

    if (this._cache) {
      encodedStrategy = await this._cache.getStrategyById(id);
    }

    if (encodedStrategy) {
      logger.debug('getStrategyById fetched from cache');
    } else {
      logger.debug('getStrategyById fetching from chain');
      encodedStrategy = await this._api.reader.strategy(BigNumber.from(id));
    }
    const decodedStrategy = decodeStrategy(encodedStrategy);

    const strategy = await parseStrategy(decodedStrategy, this._decimals);

    logger.debug('getStrategyById info:', {
      id,
      encodedStrategy,
      decodedStrategy,
      strategy,
    });

    return strategy;
  }

  /**
   * Gets all the strategies that belong to the given pair
   *
   * If the cache is synced, it will return the strategies from the cache.
   * Otherwise, it will fetch the strategies from the chain.
   *
   * @param {string} token0 - Address of one of the tokens in the pair - the order is not important.
   * @param {string} token1 - Address of one of the tokens in the pair - the order is not important.
   */
  public async getStrategiesByPair(
    token0: string,
    token1: string
  ): Promise<Strategy[]> {
    logger.debug('getStrategiesByPair called', arguments);

    let encodedStrategies: EncodedStrategy[] | undefined;

    if (this._cache) {
      encodedStrategies = await this._cache.getStrategiesByPair(token0, token1);
    }

    if (encodedStrategies) {
      logger.debug('getStrategiesByPair fetched from cache');
    } else {
      logger.debug('getStrategiesByPair fetching from chain');
      encodedStrategies = await this._api.reader.strategiesByPair(
        token0,
        token1
      );
    }

    const decodedStrategies = encodedStrategies.map(decodeStrategy);

    const strategies = await Promise.all(
      decodedStrategies.map(async (strategy) => {
        return await parseStrategy(strategy, this._decimals);
      })
    );

    logger.debug('getStrategiesByPair info:', {
      token0,
      token1,
      encodedStrategies,
      decodedStrategies,
      strategies,
    });

    return strategies;
  }

  /**
   * Gets all the strategies that belong to pairs in the given list.
   * If the cache is synced, it will return the strategies from the cache.
   * Otherwise, it will fetch the strategies from the chain.
   *
   * @param {TokenPair[]} pairs - List of pairs to get strategies for.
   *
   * @returns {Promise<{
   *   pair: TokenPair;
   *   strategies: Strategy[];
   * }[]>} An array of pairs and their strategies.
   */
  public async getStrategiesByPairs(pairs: TokenPair[]): Promise<
    {
      pair: TokenPair;
      strategies: Strategy[];
    }[]
  > {
    logger.debug('getStrategiesByPairs called', arguments);

    let encodedStrategies:
      | {
          pair: TokenPair;
          strategies: EncodedStrategy[];
        }[]
      | undefined;

    if (this._cache) {
      encodedStrategies = await this._cache.getStrategiesByPairs(pairs);
    }

    if (encodedStrategies) {
      logger.debug('getStrategiesByPairs fetched from cache');
    } else {
      logger.debug('getStrategiesByPairs fetching from chain');
      encodedStrategies = await this._api.reader.strategiesByPairs(pairs);
    }

    const decodedStrategies: {
      pair: TokenPair;
      strategies: (DecodedStrategy & {
        id: BigNumber;
        encoded: EncodedStrategy;
      })[];
    }[] = encodedStrategies.map(({ pair, strategies }) => ({
      pair,
      strategies: strategies.map(decodeStrategy),
    }));

    const strategies: {
      pair: TokenPair;
      strategies: Strategy[];
    }[] = await Promise.all(
      decodedStrategies.map(async ({ pair, strategies }) => ({
        pair,
        strategies: await Promise.all(
          strategies.map(async (strategy) => {
            return await parseStrategy(strategy, this._decimals);
          })
        ),
      }))
    );

    logger.debug('getStrategiesByPairs info:', {
      pairs,
      encodedStrategies,
      decodedStrategies,
      strategies,
    });

    return strategies;
  }

  /**
   * Gets the strategies that are owned by the user.
   * It does so by reading the voucher token and
   * figuring out strategy IDs from them.
   * It is possible to pass a synced cache and in that case
   * the strategies will be read from the cache first.
   * @param {string} user - The user who owns the strategies.
   *
   * @returns {Promise<Strategy[]>} An array of owned strategies.
   *
   */
  public async getUserStrategies(user: string): Promise<Strategy[]> {
    logger.debug('getUserStrategies called', arguments);

    const ids = await this._api.reader.tokensByOwner(user);

    let encodedStrategies: EncodedStrategy[] = [];
    let uncachedIds: BigNumber[] = ids;
    if (this._cache) {
      uncachedIds = ids.reduce((acc, id) => {
        const strategy = this._cache.getStrategyById(id);
        if (!strategy) {
          acc.push(id);
        } else {
          encodedStrategies.push(strategy);
        }
        return acc;
      }, [] as BigNumber[]);
    }

    if (uncachedIds.length > 0) {
      const uncachedStrategies = await this._api.reader.strategies(uncachedIds);
      encodedStrategies = [...encodedStrategies, ...uncachedStrategies];
    }

    const decodedStrategies = encodedStrategies.map(decodeStrategy);

    const strategies = await Promise.all(
      decodedStrategies.map(async (strategy) => {
        return await parseStrategy(strategy, this._decimals);
      })
    );
    logger.debug('getUserStrategies info:', {
      ids,
      encodedStrategies,
      decodedStrategies,
      strategies,
    });
    return strategies;
  }

  /**
   * Returns the data needed to process a trade.
   * `getMatchParams` returns the data for a given source and target token pair.
   * You can use the result to call `matchBySourceAmount` or `matchByTargetAmount`,
   * then get the actions and pass them to `getTradeDataFromActions`.
   *
   * @param {string} sourceToken - Address of the source token.
   * @param {string} targetToken - Address of the target token.
   * @param {string} amount - The amount of tokens to trade.
   * @param {boolean} tradeByTargetAmount - Whether to trade by target amount (`true`) or source amount (`false`).
   *
   * @returns {Promise<Object>} An object containing the necessary data to process a trade.
   * @property {OrdersMap} orders - The orders mapped by their IDs.
   * @property {string} amountWei - The amount in wei to trade.
   * @property {number} sourceDecimals - The number of decimals for the source token.
   * @property {number} targetDecimals - The number of decimals for the target token.
   */
  public async getMatchParams(
    sourceToken: string,
    targetToken: string,
    amount: string,
    tradeByTargetAmount: boolean
  ): Promise<{
    orders: OrdersMapBNStr;
    amountWei: string;
    sourceDecimals: number;
    targetDecimals: number;
  }> {
    logger.debug('getMatchParams called', arguments);

    const decimals = this._decimals;
    const sourceDecimals = await decimals.fetchDecimals(sourceToken);
    const targetDecimals = await decimals.fetchDecimals(targetToken);
    const orders = await this._cache.getOrdersByPair(sourceToken, targetToken);
    const amountWei = parseUnits(
      amount,
      tradeByTargetAmount ? targetDecimals : sourceDecimals
    );

    return {
      orders: ordersMapBNToStr(orders),
      amountWei: amountWei.toString(),
      sourceDecimals,
      targetDecimals,
    };
  }

  /**
   * Returns the off-chain match algorithm results of orders to fulfill to complete the trade.
   * Each trade action is identified by the ID of the strategy that the trade order belongs to
   * and the input amount to place for this order.
   *
   * The `getTradeData` method will match the specified `amount` of source tokens or target tokens
   * with available orders from the blockchain, depending on the value of `tradeByTargetAmount`.
   * It uses the provided `filter` function to filter the available orders. The resulting trade
   * actions will be returned in an object, along with the unsigned transaction that can be used
   * to execute the trade.
   *
   * It is up to the user to sign and send the transaction.
   *
   * @param {string} sourceToken - The source token for the trade.
   * @param {string} targetToken - The target token for the trade.
   * @param {string} amount - The amount of source tokens or target tokens to trade, depending on the value of `tradeByTargetAmount`.
   * @param {boolean} tradeByTargetAmount - Whether to trade by target amount (`true`) or source amount (`false`).
   * @param {MatchType} [matchType] - The type of match to perform. Defaults to `MatchType.Fast`.
   * @param {(rate: Rate) => boolean} [filter] - Optional function to filter the available orders.
   *
   * @returns {Promise<Object>} An object containing the trade actions and other relevant data.
   * @property {TradeAction[]} tradeActions - An array of trade actions in wei.
   * @property {Action[]} actionsTokenRes - An array of trade actions in the proper token resolution.
   * @property {string} totalSourceAmount - The total input amount in token resolution.
   * @property {string} totalTargetAmount - The total output amount in token resolution.
   * @property {string} effectiveRate - The effective rate between totalInput and totalOutput
   * @property {MatchAction[]} actionsWei - An array of trade actions in wei.
   * @throws {Error} If `startDataSync` has not been called.
   */
  public async getTradeData(
    sourceToken: string,
    targetToken: string,
    amount: string,
    tradeByTargetAmount: boolean,
    matchType: MatchType = MatchType.Fast,
    filter?: Filter
  ): Promise<{
    tradeActions: TradeActionBNStr[];
    actionsTokenRes: Action[];
    totalSourceAmount: string;
    totalTargetAmount: string;
    effectiveRate: string;
    actionsWei: MatchActionBNStr[];
  }> {
    logger.debug('getTradeData called', arguments);
    const { orders, amountWei } = await this.getMatchParams(
      sourceToken,
      targetToken,
      amount,
      tradeByTargetAmount
    );

    const actionsWei: MatchActionBNStr[] = Toolkit.getMatchActions(
      amountWei,
      tradeByTargetAmount,
      orders,
      matchType,
      filter
    );

    const res = await this.getTradeDataFromActions(
      sourceToken,
      targetToken,
      tradeByTargetAmount,
      actionsWei
    );

    logger.debug('getTradeData info:', {
      orders,
      amount,
      amountWei,
      res,
    });

    return res;
  }

  public async getTradeDataFromActions(
    sourceToken: string,
    targetToken: string,
    tradeByTargetAmount: boolean,
    actionsWei: MatchActionBNStr[]
  ): Promise<{
    tradeActions: TradeActionBNStr[];
    actionsTokenRes: Action[];
    totalSourceAmount: string;
    totalTargetAmount: string;
    effectiveRate: string;
    actionsWei: MatchActionBNStr[];
  }> {
    logger.debug('getTradeDataFromActions called', arguments);

    const feePPM = await this._cache.getTradingFeePPMByPair(
      sourceToken,
      targetToken
    );

    if (feePPM === undefined)
      throw new Error(
        `tradingFeePPM is undefined for this pair: ${sourceToken}-${targetToken}`
      );

    const decimals = this._decimals;
    const sourceDecimals = await decimals.fetchDecimals(sourceToken);
    const targetDecimals = await decimals.fetchDecimals(targetToken);
    const tradeActions: TradeActionBNStr[] = [];
    const actionsTokenRes: Action[] = [];
    let totalOutput = BigNumber.from(0);
    let totalInput = BigNumber.from(0);

    actionsWei.forEach((action) => {
      tradeActions.push({
        strategyId: action.id,
        amount: action.input,
      });
      if (tradeByTargetAmount) {
        actionsTokenRes.push({
          id: action.id,
          sourceAmount: formatUnits(
            addFee(action.output, feePPM).floor().toFixed(0),
            sourceDecimals
          ),
          targetAmount: formatUnits(action.input, targetDecimals),
        });
      } else {
        actionsTokenRes.push({
          id: action.id,
          sourceAmount: formatUnits(action.input, sourceDecimals),
          targetAmount: formatUnits(
            subtractFee(action.output, feePPM).floor().toFixed(0),
            targetDecimals
          ),
        });
      }

      totalInput = totalInput.add(action.input);
      totalOutput = totalOutput.add(action.output);
    });

    let totalSourceAmount: string, totalTargetAmount: string;

    if (tradeByTargetAmount) {
      totalSourceAmount = addFee(totalOutput, feePPM).floor().toFixed(0);
      totalTargetAmount = totalInput.toString();
    } else {
      totalSourceAmount = totalInput.toString();
      totalTargetAmount = subtractFee(totalOutput, feePPM).floor().toFixed(0);
    }

    let res;

    if (
      new Decimal(totalSourceAmount).isZero() ||
      new Decimal(totalTargetAmount).isZero()
    ) {
      res = {
        tradeActions,
        actionsTokenRes,
        totalSourceAmount: '0',
        totalTargetAmount: '0',
        effectiveRate: '0',
        actionsWei,
      };
    } else {
      const effectiveRate = new Decimal(totalTargetAmount)
        .div(totalSourceAmount)
        .times(tenPow(sourceDecimals, targetDecimals))
        .toString();

      res = {
        tradeActions,
        actionsTokenRes,
        totalSourceAmount: formatUnits(totalSourceAmount, sourceDecimals),
        totalTargetAmount: formatUnits(totalTargetAmount, targetDecimals),
        effectiveRate,
        actionsWei,
      };
    }

    logger.debug('getTradeDataFromActions info:', {
      sourceDecimals,
      targetDecimals,
      actionsWei,
      totalInput,
      totalOutput,
      tradingFeePPM: feePPM,
      res,
    });

    return res;
  }

  /**
   * Creates an unsigned transaction to fulfill a trade using an array of trade actions.
   * Each trade action is identified by the ID of the strategy that the trade order belongs to
   * and the input amount to place for this order.
   *
   * It is up to the user to sign and send the transaction.
   *
   * @param {string} sourceToken - The source token for the trade.
   * @param {string} targetToken - The target token for the trade.
   * @param {TradeAction[]} tradeActions - An array of trade actions in wei - as received from `trade`.
   * @param {string} deadline - Deadline for the trade
   * @param {string} maxInput - Maximum input for the trade
   * @param {Overrides} [overrides] - Optional overrides for the transaction.
   * @returns {Promise<PopulatedTransaction>}  A promise that resolves to the unsigned trade transaction.
   *
   * @example
   * // calling trade
   * const tradeTx = sdk.composeTradeTransaction(
   *   '0xE0B7927c4aF23765Cb51314A0E0521A9645F0E2A',
   *   '0x6B175474E89094C44Da98b954EedeAC495271d0F',
   *   false,
   *   []
   * );
   *
   * // Performing the trade by signing and sending the transaction:
   *
   * // Import the ethers.js library and the relevant wallet provider
   * const ethers = require('ethers');
   * const provider = new ethers.providers.Web3Provider(web3.currentProvider);
   *
   * // Load the private key for the wallet that will sign and send the transaction
   * const privateKey = '0x...';
   * const wallet = new ethers.Wallet(privateKey, provider);
   *
   * // Sign and send the transaction
   * const signedTradeTx = await wallet.sign(tradeTx);
   * const txReceipt = await provider.sendTransaction(signedTradeTx);
   * console.log(txReceipt);
   * // {
   * //   blockHash: '0x...',
   * //   blockNumber: 12345,
   * //   ...
   * // }
   */
  public async composeTradeByTargetTransaction(
    sourceToken: string,
    targetToken: string,
    tradeActions: TradeActionBNStr[],
    deadline: string,
    maxInput: string,
    overrides?: PayableOverrides
  ): Promise<PopulatedTransaction> {
    logger.debug('composeTradeByTargetTransaction called', arguments);
    const sourceDecimals = await this._decimals.fetchDecimals(sourceToken);
    return this._api.composer.tradeByTargetAmount(
      sourceToken,
      targetToken,
      tradeActions.map(tradeActionStrToBN),
      deadline,
      parseUnits(maxInput, sourceDecimals),
      overrides
    );
  }

  /**
   * Creates an unsigned transaction to fulfill a trade using an array of trade actions.
   * Each trade action is identified by the ID of the strategy that the trade order belongs to
   * and the input amount to place for this order.
   *
   * It is up to the user to sign and send the transaction.
   *
   * @param {string} sourceToken - The source token for the trade.
   * @param {string} targetToken - The target token for the trade.
   * @param {TradeAction[]} tradeActions - An array of trade actions in wei - as received from `trade`.
   * @param {string} deadline - Deadline for the trade
   * @param {string} minReturn - Minimum return for the trade
   * @param {Overrides} [overrides] - Optional overrides for the transaction.
   * @returns {Promise<PopulatedTransaction>}  A promise that resolves to the unsigned trade transaction.
   *
   * @example
   * // calling trade
   * const tradeTx = sdk.composeTradeTransaction(
   *   '0xE0B7927c4aF23765Cb51314A0E0521A9645F0E2A',
   *   '0x6B175474E89094C44Da98b954EedeAC495271d0F',
   *   false,
   *   []
   * );
   *
   * // Performing the trade by signing and sending the transaction:
   *
   * // Import the ethers.js library and the relevant wallet provider
   * const ethers = require('ethers');
   * const provider = new ethers.providers.Web3Provider(web3.currentProvider);
   *
   * // Load the private key for the wallet that will sign and send the transaction
   * const privateKey = '0x...';
   * const wallet = new ethers.Wallet(privateKey, provider);
   *
   * // Sign and send the transaction
   * const signedTradeTx = await wallet.sign(tradeTx);
   * const txReceipt = await provider.sendTransaction(signedTradeTx);
   * console.log(txReceipt);
   * // {
   * //   blockHash: '0x...',
   * //   blockNumber: 12345,
   * //   ...
   * // }
   */
  public async composeTradeBySourceTransaction(
    sourceToken: string,
    targetToken: string,
    tradeActions: TradeActionBNStr[],
    deadline: string,
    minReturn: string,
    overrides?: PayableOverrides
  ): Promise<PopulatedTransaction> {
    logger.debug('composeTradeBySourceTransaction called', arguments);
    const targetDecimals = await this._decimals.fetchDecimals(targetToken);

    return this._api.composer.tradeBySourceAmount(
      sourceToken,
      targetToken,
      tradeActions.map(tradeActionStrToBN),
      deadline,
      parseUnits(minReturn, targetDecimals),
      overrides
    );
  }

  /**
   * Calculates the sell budget given a buy budget of an overlapping strategy.
   *
   * @param {string} baseToken - The address of the base token for the strategy.
   * @param {string} buyPriceLow - The minimum buy price for the strategy, in in `quoteToken` per 1 `baseToken`, as a string.
   * @param {string} sellPriceHigh - The maximum sell price for the strategy, in `quoteToken` per 1 `baseToken`, as a string.
   * @param {string} marketPrice - The market price, in `quoteToken` per 1 `baseToken`, as a string.
   * @param {string} spreadPercentage - The spread percentage, e.g. for 10%, enter `10`.
   * @param {string} buyBudget - The budget for buying tokens in the strategy, in `quoteToken`, as a string.
   * @return {Promise<string>} The result of the calculation - the sell budget in token res in base token.
   */
  public async calculateOverlappingStrategySellBudget(
    baseToken: string,
    quoteToken: string,
    buyPriceLow: string,
    sellPriceHigh: string,
    marketPrice: string,
    spreadPercentage: string,
    buyBudget: string
  ): Promise<string> {
    logger.debug('calculateOverlappingStrategySellBudget called', arguments);
    const decimals = this._decimals;
    const baseDecimals = await decimals.fetchDecimals(baseToken);
    const quoteDecimals = await decimals.fetchDecimals(quoteToken);
    const budget = calculateOverlappingSellBudget(
      baseDecimals,
      quoteDecimals,
      buyPriceLow,
      sellPriceHigh,
      marketPrice,
      spreadPercentage,
      buyBudget
    );

    logger.debug('calculateOverlappingStrategySellBudget info:', {
      baseDecimals,
      budget,
    });

    return budget;
  }

  /**
   * Calculates the buy budget given a sell budget of an overlapping strategy.
   *
   * @param {string} quoteToken - The address of the base token for the strategy.
   * @param {string} buyPriceLow - The minimum buy price for the strategy, in in `quoteToken` per 1 `baseToken`, as a string.
   * @param {string} sellPriceHigh - The maximum sell price for the strategy, in `quoteToken` per 1 `baseToken`, as a string.
   * @param {string} marketPrice - The market price, in `quoteToken` per 1 `baseToken`, as a string.
   * @param {string} spreadPercentage - The spread percentage, e.g. for 10%, enter `10`.
   * @param {string} sellBudget - The budget for selling tokens in the strategy, in `baseToken`, as a string.
   * @return {Promise<string>} The result of the calculation - the buy budget in token res in quote token.
   */
  public async calculateOverlappingStrategyBuyBudget(
    baseToken: string,
    quoteToken: string,
    buyPriceLow: string,
    sellPriceHigh: string,
    marketPrice: string,
    spreadPercentage: string,
    sellBudget: string
  ): Promise<string> {
    logger.debug('calculateOverlappingStrategyBuyBudget called', arguments);
    const decimals = this._decimals;
    const baseDecimals = await decimals.fetchDecimals(baseToken);
    const quoteDecimals = await decimals.fetchDecimals(quoteToken);
    const budget = calculateOverlappingBuyBudget(
      baseDecimals,
      quoteDecimals,
      buyPriceLow,
      sellPriceHigh,
      marketPrice,
      spreadPercentage,
      sellBudget
    );

    logger.debug('calculateOverlappingStrategyBuyBudget info:', {
      quoteDecimals,
      budget,
    });

    return budget;
  }

  /**
   * Creates an unsigned transaction to create a strategy for buying and selling tokens of `baseToken` for price in `quoteToken` per 1 `baseToken`.
   *
   * The `createBuySellStrategy` method creates a strategy object based on the specified parameters, encodes it according to the
   * format used by the smart contracts, and returns an unsigned transaction that can be used to create the strategy on the
   * blockchain.
   *
   * It is up to the user to sign and send the transaction.
   *
   * @param {string} baseToken - The address of the base token for the strategy.
   * @param {string} quoteToken - The address of the quote token for the strategy.
   * @param {string} buyPriceLow - The minimum buy price for the strategy, in in `quoteToken` per 1 `baseToken`, as a string.
   * @param {string} buyPriceMarginal - The marginal buy price for the strategy, in in `quoteToken` per 1 `baseToken`, as a string.
   * @param {string} buyPriceHigh - The maximum buy price for the strategy, in `quoteToken` per 1 `baseToken`, as a string.
   * @param {string} buyBudget - The maximum budget for buying tokens in the strategy, in `quoteToken`, as a string.
   * @param {string} sellPriceLow - The minimum sell price for the strategy, in `quoteToken` per 1 `baseToken`, as a string.
   * @param {string} sellPriceMarginal - The marginal sell price for the strategy, in `quoteToken` per 1 `baseToken`, as a string.
   * @param {string} sellPriceHigh - The maximum sell price for the strategy, in `quoteToken` per 1 `baseToken`, as a string.
   * @param {string} sellBudget - The maximum budget for selling tokens in the strategy, in `baseToken`, as a string.
   * @param {Overrides} [overrides] - Optional overrides for the transaction, such as gas price or nonce.
   * @returns {Promise<PopulatedTransaction>} A promise that resolves to the unsigned transaction that can be used to create the strategy.
   * *
   * @example
   * // Import the ethers.js library and the relevant wallet provider
   * const ethers = require('ethers');
   * const provider = new ethers.providers.Web3Provider(web3.currentProvider);
   *
   * // Load the private key for the wallet that will sign and send the transaction
   * const privateKey = '0x...';
   * const wallet = new ethers.Wallet(privateKey, provider);
   *
   * // Call the createBuySellStrategy method to create an unsigned transaction
   * const createStrategyTx = sdk.createBuySellStrategy(
   *   '0xE0B7927c4aF23765Cb51314A0E0521A9645F0E2A',
   *   '0x6B175474E89094C44Da98b954EedeAC495271d0F',
   *   '0.1',
   *   '0.2',
   *   '0.2',
   *   '1',
   *   '0.5',
   *   '0.5',
   *   '0.6',
   *   '2'
   * );
   *
   * // Sign and send the transaction
   * const signedCreateStrategyTx = await wallet.sign(createStrategyTx);
   * const txReceipt = await provider.sendTransaction(signedCreateStrategyTx);
   */
  public async createBuySellStrategy(
    baseToken: string,
    quoteToken: string,
    buyPriceLow: string,
    buyPriceMarginal: string,
    buyPriceHigh: string,
    buyBudget: string,
    sellPriceLow: string,
    sellPriceMarginal: string,
    sellPriceHigh: string,
    sellBudget: string,
    overrides?: PayableOverrides
  ): Promise<PopulatedTransaction> {
    logger.debug('createBuySellStrategy called', arguments);
    const decimals = this._decimals;
    const baseDecimals = await decimals.fetchDecimals(baseToken);
    const quoteDecimals = await decimals.fetchDecimals(quoteToken);
    const strategy: DecodedStrategy = buildStrategyObject(
      baseToken,
      quoteToken,
      baseDecimals,
      quoteDecimals,
      buyPriceLow,
      buyPriceMarginal,
      buyPriceHigh,
      buyBudget,
      sellPriceLow,
      sellPriceMarginal,
      sellPriceHigh,
      sellBudget
    );
    const encStrategy = encodeStrategy(strategy);

    logger.debug('createBuySellStrategy info:', { strategy, encStrategy });

    return this._api.composer.createStrategy(
      encStrategy.token0,
      encStrategy.token1,
      encStrategy.order0,
      encStrategy.order1,
      overrides
    );
  }

  /**
   * Creates an unsigned transaction to create multiple strategies - similarly to `createBuySellStrategy`.
   *
   * @param {Strategy[]} strategies - An array of strategies to create.
   * @param {Overrides} [overrides] - Optional overrides for the transaction, such as gas price or nonce.
   * @returns {Promise<PopulatedTransaction>} A promise that resolves to the unsigned transaction that can be used to create the strategies.
   */
  public async batchCreateBuySellStrategies(
    strategies: {
      baseToken: string;
      quoteToken: string;
      buyPriceLow: string;
      buyPriceMarginal: string;
      buyPriceHigh: string;
      buyBudget: string;
      sellPriceLow: string;
      sellPriceMarginal: string;
      sellPriceHigh: string;
      sellBudget: string;
    }[],
    overrides?: PayableOverrides
  ): Promise<PopulatedTransaction> {
    logger.debug('batchCreateBuySellStrategies called', arguments);
    const decimals = this._decimals;
    const encStrategies = await Promise.all(
      strategies.map(async (s) => {
        const baseDecimals = await decimals.fetchDecimals(s.baseToken);
        const quoteDecimals = await decimals.fetchDecimals(s.quoteToken);
        const strategy: DecodedStrategy = buildStrategyObject(
          s.baseToken,
          s.quoteToken,
          baseDecimals,
          quoteDecimals,
          s.buyPriceLow,
          s.buyPriceMarginal,
          s.buyPriceHigh,
          s.buyBudget,
          s.sellPriceLow,
          s.sellPriceMarginal,
          s.sellPriceHigh,
          s.sellBudget
        );
        const encStrategy = encodeStrategy(strategy);
        return {
          token0: encStrategy.token0,
          token1: encStrategy.token1,
          order0: encStrategy.order0,
          order1: encStrategy.order1,
        };
      })
    );
    logger.debug('batchCreateBuySellStrategies info:', { encStrategies });
    return this._api.composer.batchCreateStrategies(encStrategies, overrides);
  }

  /**
   * Creates an unsigned transaction to update an on chain strategy.
   * This function takes various optional parameters to update different aspects of the strategy and returns a promise that resolves to a PopulatedTransaction object.
   *
   * @param {string} strategyId - The unique identifier of the strategy to be updated.
   * @param {EncodedStrategyBNStr} encoded - The encoded strategy string, representing the current state of the strategy in the contracts.
   * @param {StrategyUpdate} strategyUpdate - An object containing optional fields to update in the strategy, including buy and sell price limits and budgets.
   * @param {MarginalPriceOptions | string} [buyPriceMarginal] - Optional parameter that can be used to instruct the SDK what to do with the marginal price - or pass a value to use.
   * If unsure leave this undefined.
   * @param {MarginalPriceOptions | string} [sellPriceMarginal] - Optional parameter that can be used to instruct the SDK what to do with the marginal price - or pass a value to use.
   * If unsure leave this undefined.
   * @param {PayableOverrides} [overrides] - Optional Ethereum transaction overrides.
   * @returns {Promise<PopulatedTransaction>} A promise that resolves to a PopulatedTransaction object.
   */
  public async updateStrategy(
    strategyId: string,
    encoded: EncodedStrategyBNStr,
    {
      buyPriceLow,
      buyPriceHigh,
      buyBudget,
      sellPriceLow,
      sellPriceHigh,
      sellBudget,
    }: StrategyUpdate,
    buyPriceMarginal?: MarginalPriceOptions | string,
    sellPriceMarginal?: MarginalPriceOptions | string,
    overrides?: PayableOverrides
  ): Promise<PopulatedTransaction> {
    logger.debug('updateStrategy called', arguments);
    // step 1: decode and parse the encoded strategy back to a Strategy object and use it to replace undefined values
    const decodedOriginal = decodeStrategy(encodedStrategyStrToBN(encoded));
    const originalStrategy = await parseStrategy(
      decodedOriginal,
      this._decimals
    );

    const decimals = this._decimals;
    const baseDecimals = await decimals.fetchDecimals(
      originalStrategy.baseToken
    );
    const quoteDecimals = await decimals.fetchDecimals(
      originalStrategy.quoteToken
    );

    // step 2: create an encoded strategy object using the method params and the values from the encoded strategy
    const newStrategy: DecodedStrategy = buildStrategyObject(
      originalStrategy.baseToken,
      originalStrategy.quoteToken,
      baseDecimals,
      quoteDecimals,
      buyPriceLow ?? originalStrategy.buyPriceLow,
      isMarginalPriceValue(buyPriceMarginal) // if we got marginal price use it - otherwise act as reset and use buy high
        ? buyPriceMarginal!
        : buyPriceHigh ?? originalStrategy.buyPriceHigh,
      buyPriceHigh ?? originalStrategy.buyPriceHigh,
      buyBudget ?? originalStrategy.buyBudget,
      sellPriceLow ?? originalStrategy.sellPriceLow,
      isMarginalPriceValue(sellPriceMarginal) // if we got marginal price use it - otherwise act as reset and use sell low
        ? sellPriceMarginal!
        : sellPriceLow ?? originalStrategy.sellPriceLow,
      sellPriceHigh ?? originalStrategy.sellPriceHigh,
      sellBudget ?? originalStrategy.sellBudget
    );
    const newEncodedStrategy = encodeStrategy(newStrategy);

    // step 3: to avoid changes due to rounding errors, we will override the new encoded strategy with selected values from the old encoded strategy:
    // - if an order wasn't defined - it shouldn't be changed
    // - if budget wasn't defined - we will use the old y
    // - if no price was defined - we will use the old A and B
    // - if any budget was defined - will set z according to MarginalPriceOptions
    // - if any price was defined - we will reset z to y
    // - if marginalPrice is a number - we will use it to calculate z
    const encodedBN = encodedStrategyStrToBN(encoded);
    if (
      buyBudget === undefined &&
      buyPriceLow === undefined &&
      buyPriceHigh === undefined &&
      buyPriceMarginal === undefined
    ) {
      newEncodedStrategy.order1.y = encodedBN.order1.y;
      newEncodedStrategy.order1.z = encodedBN.order1.z;
      newEncodedStrategy.order1.A = encodedBN.order1.A;
      newEncodedStrategy.order1.B = encodedBN.order1.B;
    }
    if (
      sellBudget === undefined &&
      sellPriceLow === undefined &&
      sellPriceHigh === undefined &&
      sellPriceMarginal === undefined
    ) {
      newEncodedStrategy.order0.y = encodedBN.order0.y;
      newEncodedStrategy.order0.z = encodedBN.order0.z;
      newEncodedStrategy.order0.A = encodedBN.order0.A;
      newEncodedStrategy.order0.B = encodedBN.order0.B;
    }

    if (buyBudget === undefined) {
      newEncodedStrategy.order1.y = encodedBN.order1.y;
    }
    if (sellBudget === undefined) {
      newEncodedStrategy.order0.y = encodedBN.order0.y;
    }

    if (buyPriceLow === undefined && buyPriceHigh === undefined) {
      newEncodedStrategy.order1.A = encodedBN.order1.A;
      newEncodedStrategy.order1.B = encodedBN.order1.B;
    }

    if (sellPriceLow === undefined && sellPriceHigh === undefined) {
      newEncodedStrategy.order0.A = encodedBN.order0.A;
      newEncodedStrategy.order0.B = encodedBN.order0.B;
    }

    if (buyBudget !== undefined) {
      if (isMarginalPriceValue(buyPriceMarginal)) {
        // do nothing - z was already calculated and set
      } else if (buyPriceMarginal === MarginalPriceOptions.maintain) {
        if (encodedBN.order1.y.isZero()) {
          // When depositing into an empty order and instructed to MAINTAIN - keep the old z, unless it's lower than the new y - in which case we set it to the new y
          newEncodedStrategy.order1.z = BigNumberMax(
            encodedBN.order1.z,
            newEncodedStrategy.order1.y
          );
        } else {
          // we're not depositing into an empty order and we're instructed to MAINTAIN - maintain the current ratio of y/z
          newEncodedStrategy.order1.z = mulDiv(
            encodedBN.order1.z,
            newEncodedStrategy.order1.y,
            encodedBN.order1.y
          );
        }
      } else {
        // reset behavior is the default
        newEncodedStrategy.order1.z = newEncodedStrategy.order1.y;
      }
    }

    // if we have budget to set we handle reset (z <- y) and maintain (maintain y:z ratio). We don't handle marginal price value because it's expressed in z
    if (sellBudget !== undefined) {
      if (isMarginalPriceValue(sellPriceMarginal)) {
        // do nothing - z was already calculated and set
      } else if (sellPriceMarginal === MarginalPriceOptions.maintain) {
        if (encodedBN.order0.y.isZero()) {
          // When depositing into an empty order and instructed to MAINTAIN - keep the old z, unless it's lower than the new y
          newEncodedStrategy.order0.z = BigNumberMax(
            encodedBN.order0.z,
            newEncodedStrategy.order0.y
          );
        } else {
          // maintain the current ratio of y/z
          newEncodedStrategy.order0.z = mulDiv(
            encodedBN.order0.z,
            newEncodedStrategy.order0.y,
            encodedBN.order0.y
          );
        }
      } else {
        // reset behavior is the default
        newEncodedStrategy.order0.z = newEncodedStrategy.order0.y;
      }
    }

    if (
      (buyPriceLow !== undefined || buyPriceHigh !== undefined) &&
      (buyPriceMarginal === MarginalPriceOptions.reset ||
        buyPriceMarginal === undefined)
    ) {
      newEncodedStrategy.order1.z = newEncodedStrategy.order1.y;
    }

    if (
      (sellPriceLow !== undefined || sellPriceHigh !== undefined) &&
      (sellPriceMarginal === MarginalPriceOptions.reset ||
        sellPriceMarginal === undefined)
    ) {
      newEncodedStrategy.order0.z = newEncodedStrategy.order0.y;
    }

    logger.debug('updateStrategy info:', {
      baseDecimals,
      quoteDecimals,
      decodedOriginal,
      originalStrategy,
      newStrategy,
      newEncodedStrategy,
    });

    return this._api.composer.updateStrategy(
      BigNumber.from(strategyId),
      newEncodedStrategy.token0,
      newEncodedStrategy.token1,
      [encodedBN.order0, encodedBN.order1],
      [newEncodedStrategy.order0, newEncodedStrategy.order1],
      overrides
    );
  }

  public async deleteStrategy(
    strategyId: string
  ): Promise<PopulatedTransaction> {
    logger.debug('deleteStrategy called', arguments);
    return this._api.composer.deleteStrategy(BigNumber.from(strategyId));
  }

  /**
   * Returns liquidity for a given rate.
   *
   * @param {string} sourceToken - address of the token the trade sells.
   * @param {string} targetToken - address of the token the trade buys.
   * @param {string[]} rates - the rates for which to find liquidity depth.
   *
   * @returns {Promise<String[]>} liquidity value as string
   * @throws {Error} If `startDataSync` has not been called.
   */
  public async getRateLiquidityDepthsByPair(
    sourceToken: string,
    targetToken: string,
    rates: string[]
  ): Promise<string[]> {
    logger.debug('getRateLiquidityDepthByPair called', arguments);

    const orders: DecodedOrder[] = Object.values(
      await this._cache.getOrdersByPair(sourceToken, targetToken)
    ).map(decodeOrder);

    // convert the rate to the decimal difference between the source and target tokens
    const decimals = this._decimals;
    const sourceDecimals = await decimals.fetchDecimals(sourceToken);
    const targetDecimals = await decimals.fetchDecimals(targetToken);
    const parsedRates = rates.map(
      (rate) => new Decimal(normalizeRate(rate, targetDecimals, sourceDecimals))
    );

    const depthsWei: string[] = getDepths(orders, parsedRates).map((rate) =>
      rate.floor().toFixed(0)
    );

    // convert the depth to the target token decimals
    const depthsInTargetDecimals = depthsWei.map((depthWei) =>
      formatUnits(depthWei, targetDecimals)
    );

    logger.debug('getRateLiquidityDepthByPair info:', {
      orders,
      depthsWei,
      targetDecimals,
      depthsInTargetDecimals,
    });

    return depthsInTargetDecimals;
  }

  public async getMinRateByPair(
    sourceToken: string,
    targetToken: string
  ): Promise<string> {
    logger.debug('getMinRateByPair called', arguments);

    const orders = Object.values(
      await this._cache.getOrdersByPair(sourceToken, targetToken)
    ).map(decodeOrder);

    const minRate = getMinRate(orders).toString();

    // get the decimals of the source and target tokens and convert the rate to factor out the decimals
    const decimals = this._decimals;
    const sourceDecimals = await decimals.fetchDecimals(sourceToken);
    const targetDecimals = await decimals.fetchDecimals(targetToken);
    const normalizedRate = normalizeRate(
      minRate,
      sourceDecimals,
      targetDecimals
    );

    logger.debug('getMinRateByPair info:', {
      orders,
      minRate,
      sourceDecimals,
      targetDecimals,
      normalizedRate,
    });

    return normalizedRate;
  }

  public async getMaxRateByPair(
    sourceToken: string,
    targetToken: string
  ): Promise<string> {
    logger.debug('getMaxRateByPair called', arguments);

    const orders = Object.values(
      await this._cache.getOrdersByPair(sourceToken, targetToken)
    ).map(decodeOrder);

    const maxRate = getMaxRate(orders).toString();

    // get the decimals of the source and target tokens and convert the rate to factor out the decimals
    const decimals = this._decimals;
    const sourceDecimals = await decimals.fetchDecimals(sourceToken);
    const targetDecimals = await decimals.fetchDecimals(targetToken);
    const normalizedRate = normalizeRate(
      maxRate,
      sourceDecimals,
      targetDecimals
    );

    logger.debug('getMaxRateByPair info:', {
      orders,
      maxRate,
      sourceDecimals,
      targetDecimals,
      normalizedRate,
    });

    return normalizedRate;
  }
}
