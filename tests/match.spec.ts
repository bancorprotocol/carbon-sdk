import { expect } from 'chai';
import { BigNumber } from '../src/utils/numerics';
import { encodeOrder } from '../src/utils/encoders';
import { MatchAction, Filter, Rate, OrdersMap } from '../src/common/types';
import { matchBySourceAmount, matchByTargetAmount } from '../src/trade-matcher';

import ArbitraryMatch from './data/ArbitraryMatch.json' assert { type: 'json' };
import BigPoolMatch from './data/BigPoolMatch.json' assert { type: 'json' };
import EthUsdcMatch from './data/EthUsdcMatch.json' assert { type: 'json' };
import SpecialMatch from './data/SpecialMatch.json' assert { type: 'json' };

type MatchMethod = 'matchBySourceAmount' | 'matchByTargetAmount';

type MatchFunction = (
  amount: BigNumber,
  orders: OrdersMap,
  filter: Filter
) => MatchAction[];

const methods: {
  [key in MatchMethod]: MatchFunction;
} = {
  matchBySourceAmount,
  matchByTargetAmount,
};

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
    id: string;
    input: string;
    output: string;
  }[];
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

        const orders: OrdersMap = {};
        for (const [j, order] of test.orders.entries()) {
          orders[`${j}`] = encodeOrder(order);
        }

        const method: MatchFunction = methods[test.method as MatchMethod];

        const actions = method(BigNumber.from(test.amount), orders, filter);
        for (const [j, action] of actions.entries()) {
          expect(action.id.toString()).to.equal(test.actions[j].id);
          expect(action.input.toString()).to.equal(test.actions[j].input);
          expect(action.output.toString()).to.equal(test.actions[j].output);
        }
      }).timeout(3000);
    }
  }
});
