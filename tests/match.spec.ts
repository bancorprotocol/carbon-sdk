import { expect } from 'chai';
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

// created via https://github.com/bancorprotocol/carbon-simulator/blob/main/benchmark/test_match.py
// located at https://github.com/bancorprotocol/carbon-simulator/tree/main/benchmark/resources/match
import ArbitraryMatch from './data/ArbitraryMatch.json' assert { type: 'json' };
import BigPoolMatch from './data/BigPoolMatch.json' assert { type: 'json' };
import EthUsdcMatch from './data/EthUsdcMatch.json' assert { type: 'json' };
import SpecialMatch from './data/SpecialMatch.json' assert { type: 'json' };

type TradeMethod = (amount: bigint, order: EncodedOrder) => bigint;
type MatchMethod = 'matchBySourceAmount' | 'matchByTargetAmount';

type MatchFunction = (
  amount: bigint,
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
    getAttr: (action: MatchAction) => bigint;
    compareInput: (x: bigint, y: bigint) => boolean;
    compareOutput: (x: bigint, y: bigint) => boolean;
  };
} = {
  matchBySourceAmount: {
    trade: tradeBySourceAmount,
    getAttr: (action: MatchAction) => action.output,
    compareInput: (x: bigint, y: bigint) => x <= y,
    compareOutput: (x: bigint, y: bigint) => x >= y,
  },
  matchByTargetAmount: {
    trade: tradeByTargetAmount,
    getAttr: (action: MatchAction) => action.input,
    compareInput: (x: bigint, y: bigint) => x >= y,
    compareOutput: (x: bigint, y: bigint) => x <= y,
  },
};

const sum = (arr: bigint[]): bigint =>
  arr.reduce((a, b) => a + b, 0n);

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

const filter: Filter = (rate: Rate) => rate.input > 0n && rate.output > 0n;

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
          BigInt(test.amount),
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
            const orderIndex = Number(action.id);
            expect(
              getAttr(action) <= BigInt(test.orders[orderIndex].liquidity)
            ).to.be.true;
            expect(
              action.output === trade(action.input, ordersMap[orderIndex.toString()])
            ).to.be.true;
          }
          expect(
            sum(
              actions[matchType as MatchType]!.map(
                (action: MatchAction) => action.input
              )
            ) <= BigInt(test.amount)
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
