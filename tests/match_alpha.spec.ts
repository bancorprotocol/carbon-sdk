import { expect } from 'chai';
import { BigNumber } from '../src/utils/numerics';
import { encodeOrder } from '../src/utils/encoders';
import { MatchAction, Filter, Rate, OrdersMap } from '../src/common/types';
import {
  getEncodedTradeTargetAmount as tradeBySourceAmount,
  getEncodedTradeSourceAmount as tradeByTargetAmount,
} from '../src/trade-matcher/trade';
import {
  matchBySourceAmount_alpha as matchBySourceAmount,
  matchByTargetAmount_alpha as matchByTargetAmount,
} from '../src/trade-matcher';

import ArbitraryMatch from './data/ArbitraryMatch.json' assert { type: 'json' };
import BigPoolMatch from './data/BigPoolMatch.json' assert { type: 'json' };
import EthUsdcMatch from './data/EthUsdcMatch.json' assert { type: 'json' };
import SpecialMatch from './data/SpecialMatch.json' assert { type: 'json' };

import fs from 'fs'
import os from 'os'

type MatchMethod = 'matchBySourceAmount' | 'matchByTargetAmount';

type MatchFunction = (
  amount: BigNumber,
  orders: OrdersMap,
  threshold_orders: number,
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
      Fast: {
        id: string;
        input: string;
        output: string;
      }[];
      Best: {
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

const sum = (arr: BigNumber[]) => arr.reduce((a, b) => a.add(b), BigNumber.from(0));
const error = (messages: String[]) => { console.log('\n' + messages.join('\n')); expect(false).to.be.true; }
const stringifyActions = (actions: MatchAction[]) => actions.map((action) => stringifyAction(action));
const stringifyAction = (action: MatchAction) => JSON.stringify({id: `${action.id}`, input: `${action.input}`, output: `${action.output}`}, null, 4);

const results: any = {
  matchBySourceAmount: ['Old Method Output,New Method1 Output,New Method2 Output'],
  matchByTargetAmount: ['Old Method Output,New Method1 Output,New Method2 Output'],
};

describe.only('Match', () => {
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

        const actions = method(BigNumber.from(test.amount), orders, 15, filter);
        const newMethod2TotalInput = sum(actions.map((action) => action.input));
        const newMethod2TotalOutput = sum(actions.map((action) => action.output));
        const newMethod1TotalOutput = sum(test.actions.Best.map((action) => BigNumber.from(action.output)));
        const oldMethodTotalOutput = sum(test.actions.Fast.map((action) => BigNumber.from(action.output)));

        results[test.method].push(`${oldMethodTotalOutput},${newMethod1TotalOutput},${newMethod2TotalOutput}`);

        switch (test.method) {
          case 'matchBySourceAmount':
            if (newMethod2TotalInput.gt(test.amount)) {
              error([
                `test case:`,
                `- method = ${test.method}`,
                `- amount = ${test.amount}`,
                `- orders = ${JSON.stringify(test.orders, null, 4)}`,
                `new method2 trade actions = ${stringifyActions(actions)}`,
                `new method2 total input = ${newMethod2TotalInput} > ${test.amount} = test case amount`
              ]);
            }
            if (newMethod2TotalOutput.add(30).lt(newMethod1TotalOutput)) { // TODO: remove threshold addition
              error([
                `test case:`,
                `- method = ${test.method}`,
                `- amount = ${test.amount}`,
                `- orders = ${JSON.stringify(test.orders, null, 4)}`,
                `new method1 trade actions = ${JSON.stringify(test.actions.Best, null, 4)}`,
                `new method2 trade actions = ${stringifyActions(actions)}`,
                `new method2 total output = ${newMethod2TotalOutput} < ${newMethod1TotalOutput} = new method1 total output`
              ]);
            }
            for (const [j, action] of actions.entries()) {
              const order = test.orders[Number(`${action.id}`)];
              if (action.output.gt(order.liquidity)) {
                error([
                  `test case:`,
                  `- method = ${test.method}`,
                  `- amount = ${test.amount}`,
                  `- orders = ${JSON.stringify(test.orders, null, 4)}`,
                  `new method2 trade action = ${stringifyAction(action)}`,
                  `new method2 trade action output = ${action.output} > ${order.liquidity} = order liquidity`
                ]);
              }
              const actualOutput = tradeBySourceAmount(action.input, encodeOrder(order));
              if (!action.output.eq(actualOutput)) {
                error([
                  `test case:`,
                  `- method = ${test.method}`,
                  `- amount = ${test.amount}`,
                  `- orders = ${JSON.stringify(test.orders, null, 4)}`,
                  `new method2 trade action = ${stringifyAction(action)}`,
                  `new method2 trade action output = ${action.output} != ${actualOutput} = actual trade output`
                ]);
              }
            }
            break;
          case 'matchByTargetAmount':
            if (newMethod2TotalInput.sub('1').gt(test.amount)) { // TODO: remove threshold subtraction
              error([
                `test case:`,
                `- method = ${test.method}`,
                `- amount = ${test.amount}`,
                `- orders = ${JSON.stringify(test.orders, null, 4)}`,
                `new method2 trade actions = ${stringifyActions(actions)}`,
                `new method2 total input = ${newMethod2TotalInput} > ${test.amount} = test case amount`
              ]);
            }
            if (newMethod2TotalOutput.sub('676911395').gt(newMethod1TotalOutput)) { // TODO: remove threshold subtraction
              error([
                `test case:`,
                `- method = ${test.method}`,
                `- amount = ${test.amount}`,
                `- orders = ${JSON.stringify(test.orders, null, 4)}`,
                `new method1 trade actions = ${JSON.stringify(test.actions.Best, null, 4)}`,
                `new method2 trade actions = ${stringifyActions(actions)}`,
                `new method2 total output = ${newMethod2TotalOutput} > ${newMethod1TotalOutput} = new method1 total output`
              ]);
            }
            for (const [j, action] of actions.entries()) {
              const order = test.orders[Number(`${action.id}`)];
              if (action.input.gt(order.liquidity)) {
                error([
                  `test case:`,
                  `- method = ${test.method}`,
                  `- amount = ${test.amount}`,
                  `- orders = ${JSON.stringify(test.orders, null, 4)}`,
                  `new method2 trade action = ${stringifyAction(action)}`,
                  `new method2 trade action input = ${action.input} > ${order.liquidity} = order liquidity`
                ]);
              }
              const actualOutput = tradeByTargetAmount(action.input, encodeOrder(order));
              if (!action.output.eq(actualOutput)) {
                error([
                  `test case:`,
                  `- method = ${test.method}`,
                  `- amount = ${test.amount}`,
                  `- orders = ${JSON.stringify(test.orders, null, 4)}`,
                  `new method2 trade action = ${stringifyAction(action)}`,
                  `new method2 trade action output = ${action.output} != ${actualOutput} = actual trade output`
                ]);
              }
            }
            break;
        }
      }).timeout(9000);
    }
  }

  it(`results`, () => {
    for (const method in results) {
      fs.writeFileSync(`${method}.csv`, results[method].join(os.EOL), {encoding: 'utf8'});
    }
  });
});