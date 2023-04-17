import { expect } from 'chai';
import { BigNumber } from '../src/utils/numerics';
import { encodeOrder } from '../src/utils/encoders';
import {
  MatchOptions,
  MatchType,
  Filter,
  Rate,
  MatchAction,
  EncodedOrder,
  OrdersMap,
} from '../src/common/types';
import {
  getEncodedTradeTargetAmount as tradeBySourceAmount,
  getEncodedTradeSourceAmount as tradeByTargetAmount,
} from '../src/trade-matcher/trade';
import {
  matchBySourceAmount,
  matchByTargetAmount,
} from '../src/trade-matcher/match';

import ArbitraryMatch from './data/ArbitraryMatch.json' assert { type: 'json' };
import BigPoolMatch from './data/BigPoolMatch.json' assert { type: 'json' };
import EthUsdcMatch from './data/EthUsdcMatch.json' assert { type: 'json' };
import SpecialMatch from './data/SpecialMatch.json' assert { type: 'json' };

type TradeMethod = (amount: BigNumber, order: EncodedOrder) => BigNumber;
type MatchMethod = 'matchBySourceAmount' | 'matchByTargetAmount';

type MatchFunction = (
  amount: BigNumber,
  ordersMap: OrdersMap,
  matchTypes: MatchType[],
  filter: Filter
) => MatchOptions;

const methods: {
  [key in MatchMethod]: MatchFunction;
} = {
  matchBySourceAmount,
  matchByTargetAmount,
};

const checker: {
  [key in MatchMethod]: {
    trade: TradeMethod;
    getAttr: (action: MatchAction) => BigNumber;
    compareInput: (x: BigNumber, y: BigNumber) => boolean;
    compareOutput: (x: BigNumber, y: BigNumber) => boolean;
  };
} = {
  matchBySourceAmount: {
    trade: tradeBySourceAmount,
    getAttr: (action: MatchAction) => action.output,
    compareInput: (x: BigNumber, y: BigNumber) => x.lte(y),
    compareOutput: (x: BigNumber, y: BigNumber) => x.gte(y),
  },
  matchByTargetAmount: {
    trade: tradeByTargetAmount,
    getAttr: (action: MatchAction) => action.input,
    compareInput: (x: BigNumber, y: BigNumber) => x.gte(y),
    compareOutput: (x: BigNumber, y: BigNumber) => x.lte(y),
  },
};

const sum = (arr: BigNumber[]) =>
  arr.reduce((a, b) => a.add(b), BigNumber.from(0));

interface MatchTest {
  method: string;
  amount: string;
  orders: {
    liquidity: string;
    lowestRate: string;
    highestRate: string;
    marginalRate: string;
  }[];
  actions: {
    [MatchType.Fast]: {
      id: string;
      input: string;
      output: string;
    }[];
    [MatchType.Best]: {
      id: string;
      input: string;
      output: string;
    }[];
  };
}

type MatchTests = MatchTest[];

const batches: {
  [key: string]: MatchTests;
} = {
  ArbitraryMatch,
  BigPoolMatch,
  EthUsdcMatch,
  SpecialMatch,
};

const filter: Filter = (rate: Rate) => rate.input.gt(0) && rate.output.gt(0);

describe('Match', () => {
  for (const batch in batches) {
    const tests: MatchTests = batches[batch];
    for (const [i, test] of tests.entries()) {
      it(`${batch} test case ${i + 1}`, () => {
        if (!(test.method in methods))
          throw `${test.method} isn't a known function`;

        const ordersMap: OrdersMap = {};
        for (const [j, order] of test.orders.entries()) {
          ordersMap[`${j}`] = encodeOrder(order);
        }

        const method: MatchFunction = methods[test.method as MatchMethod];
        const { trade, getAttr, compareInput, compareOutput } =
          checker[test.method as MatchMethod];
        const actions = method(
          BigNumber.from(test.amount),
          ordersMap,
          Object.keys(test.actions) as MatchType[],
          filter
        );
        for (const matchType in actions) {
          expect(actions[matchType as MatchType]!.length).to.equal(
            test.actions[matchType as MatchType].length
          );
          for (const [j, action] of actions[
            matchType as MatchType
          ]!.entries()) {
            expect(action.id.toString()).to.equal(
              test.actions[matchType as MatchType][j].id
            );
            expect(action.input.toString()).to.equal(
              test.actions[matchType as MatchType][j].input
            );
            expect(action.output.toString()).to.equal(
              test.actions[matchType as MatchType][j].output
            );
            expect(
              getAttr(action).lte(test.orders[action.id.toNumber()].liquidity)
            ).to.be.true;
            expect(
              action.output.eq(
                trade(action.input, ordersMap[action.id.toNumber()])
              )
            ).to.be.true;
          }
          expect(
            sum(
              actions[matchType as MatchType]!.map(
                (action: MatchAction) => action.input
              )
            ).lte(BigNumber.from(test.amount))
          ).to.be.true;
        }
        expect(
          compareInput(
            sum(actions.Best!.map((action) => action.input)),
            sum(actions.Fast!.map((action) => action.input))
          )
        ).to.be.true;
        expect(
          compareOutput(
            sum(actions.Best!.map((action) => action.output)),
            sum(actions.Fast!.map((action) => action.output))
          )
        ).to.be.true;
      }).timeout(3000);
    }
  }
});
