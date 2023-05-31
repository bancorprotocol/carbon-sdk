import { expect } from 'chai';
import { encodeOrder, decodeOrder, LARGE_Z } from '../src/utils/encoders';
import {
  buildStrategyObject,
  encodeStrategy,
  createOrders,
  parseStrategy,
} from '../src/strategy-management/';
import { DecodedStrategy, EncodedStrategy } from '../src/common/types';
import sinon, { SinonStubbedInstance } from 'sinon';
import { BigNumber, Decimal } from '../src/utils/numerics';
import { Decimals } from '../src/utils/decimals';
import { isAlmostEqual } from './test-utils';

// (1/0.6) * 10^18 / 10^6 in base tkn per 1 quote tkn converted to wei
const LOWEST_RATE = new Decimal(10)
  .pow(18 - 6)
  .div('0.6')
  .toFixed();

describe('encoders', () => {
  describe('encodeOrder', () => {
    it('should return the expected value', () => {
      const order = {
        liquidity: '100',
        lowestRate: '0.5',
        highestRate: '1',
        marginalRate: '1',
      };
      const encodedOrder = encodeOrder(order);
      expect(encodedOrder.y.toString()).to.equal('100');
      expect(encodedOrder.z.toString()).to.equal('100');
      expect(encodedOrder.A.toString()).to.equal('82442111944226');
      expect(encodedOrder.B.toString()).to.equal('199032864766430');
    });

    it('should return the expected value when all rates are the same', () => {
      const order = {
        liquidity: '100',
        lowestRate: '0.5',
        highestRate: '0.5',
        marginalRate: '0.5',
      };
      const encodedOrder = encodeOrder(order);
      expect(encodedOrder.y.toString()).to.equal('100');
      expect(encodedOrder.z.toString()).to.equal(`${LARGE_Z}`);
      expect(encodedOrder.A.toString()).to.equal('0');
      expect(encodedOrder.B.toString()).to.equal('199032864766430');
    });

    it('should throw an exception when high price is higher than mid which is equal to min', () => {
      const order = {
        liquidity: '100',
        lowestRate: '0.5',
        highestRate: '1',
        marginalRate: '0.5',
      };
      expect(() => {
        encodeOrder(order);
      }).to.throw(
        'Either one of the following must hold:\n' +
          '- highestRate >= marginalRate > lowestRate\n' +
          '- highestRate == marginalRate == lowestRate\n' +
          `(highestRate = ${order.highestRate}, marginalRate = ${order.marginalRate}, lowestRate = ${order.lowestRate})`
      );
    });

    it('should return the original order after computing and uncomputing, with tolerance', () => {
      const originalOrder = {
        liquidity: '100000000000000000000',
        lowestRate: LOWEST_RATE,
        highestRate: '2000000000000',
        marginalRate: '2000000000000',
      };
      const encodedOrder = encodeOrder(originalOrder);
      const decodedOrder = decodeOrder(encodedOrder);

      expect(
        ...isAlmostEqual(
          decodedOrder.liquidity,
          originalOrder.liquidity,
          '0',
          '0'
        )
      ).to.be.true;
      expect(
        ...isAlmostEqual(
          decodedOrder.lowestRate,
          originalOrder.lowestRate,
          '0',
          '0.000000000000004'
        )
      ).to.be.true;
      expect(
        ...isAlmostEqual(
          decodedOrder.highestRate,
          originalOrder.highestRate,
          '0',
          '0.000000000000002'
        )
      ).to.be.true;
      expect(
        ...isAlmostEqual(
          decodedOrder.marginalRate,
          originalOrder.marginalRate,
          '0',
          '0.000000000000002'
        )
      ).to.be.true;
    });
  });

  describe('encodeStrategy', () => {
    it('should return the expected value', () => {
      const strategy = {
        token0: '0xBASE',
        token1: '0xQUOTE',
        order0: {
          liquidity: '100000000000000000000', // 100 (sellBudget) in base tkn converted to wei
          lowestRate: LOWEST_RATE, // (1/0.6) * 10^18 / 10^6 in base tkn per 1 quote tkn converted to wei
          highestRate: '2000000000000', // (1/0.5) * 10^18 / 10^6 in base tkn per 1 quote tkn converted to wei
          marginalRate: '2000000000000', // same as highest rate
        },
        order1: {
          liquidity: '200000000', // 200 in quote tkn converted to wei
          lowestRate: '0.0000000000015', // (1.5) * 10^6 / 10^18 in quote tkn per 1 base tkn converted to wei
          highestRate: '0.000000000002', // (2) * 10^6 / 10^18 in quote tkn per 1 base tkn converted to wei
          marginalRate: '0.000000000002', // same as highest rate
        },
      };
      const encodedStrategy = encodeStrategy(strategy);
      expect(encodedStrategy.token0).to.equal('0xBASE');
      expect(encodedStrategy.token1).to.equal('0xQUOTE');
      expect(encodedStrategy.order0.y.toString()).to.equal(
        '100000000000000000000'
      );
      expect(encodedStrategy.order0.z.toString()).to.equal(
        '100000000000000000000'
      );
      expect(encodedStrategy.order0.A.toString()).to.equal('5049685635738288');
      expect(encodedStrategy.order0.B.toString()).to.equal('6084248852693708');
      expect(encodedStrategy.order1.y.toString()).to.equal('200000000');
      expect(encodedStrategy.order1.z.toString()).to.equal('200000000');
      expect(encodedStrategy.order1.A.toString()).to.equal('53330695');
      expect(encodedStrategy.order1.B.toString()).to.equal('344735034');
    });

    it('should handle zero liquidity', () => {
      const strategy = {
        token0: '0xBASE',
        token1: '0xQUOTE',
        order0: {
          liquidity: '0', // 100 (sellBudget) in base tkn converted to wei
          lowestRate: LOWEST_RATE, // (1/0.6) * 10^18 / 10^6 in base tkn per 1 quote tkn converted to wei
          highestRate: '2000000000000', // (1/0.5) * 10^18 / 10^6 in base tkn per 1 quote tkn converted to wei
          marginalRate: '2000000000000', // same as highest rate
        },
        order1: {
          liquidity: '0', // 200 in quote tkn converted to wei
          lowestRate: '0.0000000000015', // (1.5) * 10^6 / 10^18 in quote tkn per 1 base tkn converted to wei
          highestRate: '0.000000000002', // (2) * 10^6 / 10^18 in quote tkn per 1 base tkn converted to wei
          marginalRate: '0.000000000002', // same as highest rate
        },
      };
      const encodedStrategy = encodeStrategy(strategy);
      expect(encodedStrategy.token0).to.equal('0xBASE');
      expect(encodedStrategy.token1).to.equal('0xQUOTE');
      expect(encodedStrategy.order0.y.toString()).to.equal('0');
      expect(encodedStrategy.order0.z.toString()).to.equal('0');
      expect(encodedStrategy.order0.A.toString()).to.equal('5049685635738288');
      expect(encodedStrategy.order0.B.toString()).to.equal('6084248852693708');
      expect(encodedStrategy.order1.y.toString()).to.equal('0');
      expect(encodedStrategy.order1.z.toString()).to.equal('0');
      expect(encodedStrategy.order1.A.toString()).to.equal('53330695');
      expect(encodedStrategy.order1.B.toString()).to.equal('344735034');
    });
  });
  describe('createOrders', () => {
    it('should return the expected orders given valid input', () => {
      const baseTokenDecimals = 18;
      const quoteTokenDecimals = 6;
      const buyPriceLow = '1.5';
      const buyPriceHigh = '2';
      const buyBudget = '200';
      const sellPriceLow = '0.5';
      const sellPriceHigh = '0.6';
      const sellBudget = '100';

      const { order0, order1 } = createOrders(
        baseTokenDecimals,
        quoteTokenDecimals,
        buyPriceLow,
        buyPriceHigh,
        buyBudget,
        sellPriceLow,
        sellPriceHigh,
        sellBudget
      );

      expect(order0).to.deep.equal({
        liquidity: '100000000000000000000', // 100 (sellBudget) in base tkn converted to wei
        lowestRate: LOWEST_RATE, // (1/0.6) * 10^18 / 10^6 in base tkn per 1 quote tkn converted to wei
        highestRate: '2000000000000', // (1/0.5) * 10^18 / 10^6 in base tkn per 1 quote tkn converted to wei
        marginalRate: '2000000000000', // same as highest rate
      });
      expect(order1).to.deep.equal({
        liquidity: '200000000', // 200 in quote tkn converted to wei
        lowestRate: '0.0000000000015', // (1.5) * 10^6 / 10^18 in quote tkn per 1 base tkn converted to wei
        highestRate: '0.000000000002', // (2) * 10^6 / 10^18 in quote tkn per 1 base tkn converted to wei
        marginalRate: '0.000000000002', // same as highest rate
      });
    });
  });

  describe('buildStrategyObject', () => {
    it('should return the expected strategy object given valid input', () => {
      const baseToken = {
        address: '0xBASE',
        decimals: 18,
      };
      const quoteToken = {
        address: '0xQUOTE',
        decimals: 6,
      };
      const buyPriceLow = '1.5';
      const buyPriceHigh = '2';
      const buyBudget = '200';
      const sellPriceLow = '0.5';
      const sellPriceHigh = '0.6';
      const sellBudget = '100';

      const strategy = buildStrategyObject(
        baseToken.address,
        quoteToken.address,
        baseToken.decimals,
        quoteToken.decimals,
        buyPriceLow,
        buyPriceHigh,
        buyBudget,
        sellPriceLow,
        sellPriceHigh,
        sellBudget
      );

      expect(strategy).to.deep.equal({
        token0: baseToken.address,
        token1: quoteToken.address,
        order0: {
          liquidity: '100000000000000000000', // 100 (sellBudget) in base tkn converted to wei
          lowestRate: LOWEST_RATE, // (1/0.6) * 10^18 / 10^6 in base tkn per 1 quote tkn converted to wei
          highestRate: '2000000000000', // (1/0.5) * 10^18 / 10^6 in base tkn per 1 quote tkn converted to wei
          marginalRate: '2000000000000', // same as highest rate
        },
        order1: {
          liquidity: '200000000', // 200 in quote tkn converted to wei
          lowestRate: '0.0000000000015', // (1.5) * 10^6 / 10^18 in quote tkn per 1 base tkn converted to wei
          highestRate: '0.000000000002', // (2) * 10^6 / 10^18 in quote tkn per 1 base tkn converted to wei
          marginalRate: '0.000000000002', // same as highest rate
        },
      });
    });

    it('should throw an error if buyPriceLow is greater than buyPriceHigh', () => {
      const baseToken = {
        address: '0xBASE',
        decimals: 18,
      };
      const quoteToken = {
        address: '0xQUOTE',
        decimals: 6,
      };
      const buyPriceLow = '2';
      const buyPriceHigh = '1.5';
      const buyBudget = '200';
      const sellPriceHigh = '0.6';
      const sellPriceLow = '0.5';
      const sellBudget = '100';

      expect(() => {
        buildStrategyObject(
          baseToken.address,
          quoteToken.address,
          baseToken.decimals,
          quoteToken.decimals,
          buyPriceLow,
          buyPriceHigh,
          buyBudget,
          sellPriceLow,
          sellPriceHigh,
          sellBudget
        );
      }).to.throw('low price must be lower than or equal to high price');
    });

    it('should throw an error if sellPriceLow is greater than sellPriceHigh', () => {
      const baseToken = {
        address: '0xBASE',
        decimals: 18,
      };
      const quoteToken = {
        address: '0xQUOTE',
        decimals: 6,
      };
      const buyPriceLow = '1.5';
      const buyPriceHigh = '2';
      const buyBudget = '200';
      const sellPriceHigh = '0.5';
      const sellPriceLow = '0.6';
      const sellBudget = '100';

      expect(() => {
        buildStrategyObject(
          baseToken.address,
          quoteToken.address,
          baseToken.decimals,
          quoteToken.decimals,
          buyPriceLow,
          buyPriceHigh,
          buyBudget,
          sellPriceLow,
          sellPriceHigh,
          sellBudget
        );
      }).to.throw('low price must be lower than or equal to high price');
    });

    it('should throw an error if buyPriceLow is negative', () => {
      const baseToken = {
        address: '0xBASE',
        decimals: 18,
      };
      const quoteToken = {
        address: '0xQUOTE',
        decimals: 6,
      };
      const buyPriceLow = '-1.5';
      const buyPriceHigh = '2';
      const buyBudget = '200';
      const sellPriceHigh = '0.6';
      const sellPriceLow = '0.5';
      const sellBudget = '100';

      expect(() => {
        buildStrategyObject(
          baseToken.address,
          quoteToken.address,
          baseToken.decimals,
          quoteToken.decimals,
          buyPriceLow,
          buyPriceHigh,
          buyBudget,
          sellPriceLow,
          sellPriceHigh,
          sellBudget
        );
      }).to.throw('prices cannot be negative');
    });

    it('should throw an error if sellPriceLow is negative', () => {
      const baseToken = {
        address: '0xBASE',
        decimals: 18,
      };
      const quoteToken = {
        address: '0xQUOTE',
        decimals: 6,
      };
      const buyPriceLow = '1.5';
      const buyPriceHigh = '2';
      const buyBudget = '200';
      const sellPriceHigh = '0.6';
      const sellPriceLow = '-0.5';
      const sellBudget = '100';

      expect(() => {
        buildStrategyObject(
          baseToken.address,
          quoteToken.address,
          baseToken.decimals,
          quoteToken.decimals,
          buyPriceLow,
          buyPriceHigh,
          buyBudget,
          sellPriceLow,
          sellPriceHigh,
          sellBudget
        );
      }).to.throw('prices cannot be negative');
    });

    it('should throw an error if buyBudget is negative', () => {
      const baseToken = {
        address: '0xBASE',
        decimals: 18,
      };
      const quoteToken = {
        address: '0xQUOTE',
        decimals: 6,
      };
      const buyPriceLow = '1.5';
      const buyPriceHigh = '2';
      const buyBudget = '-200';
      const sellPriceHigh = '0.6';
      const sellPriceLow = '0.5';
      const sellBudget = '100';

      expect(() => {
        buildStrategyObject(
          baseToken.address,
          quoteToken.address,
          baseToken.decimals,
          quoteToken.decimals,
          buyPriceLow,
          buyPriceHigh,
          buyBudget,
          sellPriceLow,
          sellPriceHigh,
          sellBudget
        );
      }).to.throw('budgets cannot be negative');
    });

    it('should throw an error if sellBudget is negative', () => {
      const baseToken = {
        address: '0xBASE',
        decimals: 18,
      };
      const quoteToken = {
        address: '0xQUOTE',
        decimals: 6,
      };
      const buyPriceLow = '1.5';
      const buyPriceHigh = '2';
      const buyBudget = '200';
      const sellPriceHigh = '0.6';
      const sellPriceLow = '0.5';
      const sellBudget = '-100';

      expect(() => {
        buildStrategyObject(
          baseToken.address,
          quoteToken.address,
          baseToken.decimals,
          quoteToken.decimals,
          buyPriceLow,
          buyPriceHigh,
          buyBudget,
          sellPriceLow,
          sellPriceHigh,
          sellBudget
        );
      }).to.throw('budgets cannot be negative');
    });

    it('should return orders with rates equal to 0 if buyPriceLow and buyPriceHigh are both 0', () => {
      const baseToken = {
        address: '0xBASE',
        decimals: 18,
      };
      const quoteToken = {
        address: '0xQUOTE',
        decimals: 6,
      };
      const buyPriceLow = '0';
      const buyPriceHigh = '0';
      const buyBudget = '200';
      const sellPriceHigh = '0.6';
      const sellPriceLow = '0.5';
      const sellBudget = '100';

      const strategy = buildStrategyObject(
        baseToken.address,
        quoteToken.address,
        baseToken.decimals,
        quoteToken.decimals,
        buyPriceLow,
        buyPriceHigh,
        buyBudget,
        sellPriceLow,
        sellPriceHigh,
        sellBudget
      );
      expect(strategy.order0).to.deep.equal({
        liquidity: '100000000000000000000', // 100 (sellBudget) in base tkn converted to wei
        lowestRate: LOWEST_RATE, // (1/0.6) * 10^18 / 10^6 in base tkn per 1 quote tkn converted to wei
        highestRate: '2000000000000', // (1/0.5) * 10^18 / 10^6 in base tkn per 1 quote tkn converted to wei
        marginalRate: '2000000000000', // same as highest rate
      });
      expect(strategy.order1).to.deep.equal({
        liquidity: '200000000', // 200 in quote tkn converted to wei
        lowestRate: '0',
        highestRate: '0',
        marginalRate: '0',
      });
    });
    it('should return orders with rates equal to 0 if sellPriceLow and sellPriceHigh are both 0', () => {
      const baseToken = {
        address: '0xBASE',
        decimals: 18,
      };
      const quoteToken = {
        address: '0xQUOTE',
        decimals: 6,
      };
      const buyPriceLow = '1.5';
      const buyPriceHigh = '2';
      const buyBudget = '200';
      const sellPriceHigh = '0';
      const sellPriceLow = '0';
      const sellBudget = '100';

      const strategy = buildStrategyObject(
        baseToken.address,
        quoteToken.address,
        baseToken.decimals,
        quoteToken.decimals,
        buyPriceLow,
        buyPriceHigh,
        buyBudget,
        sellPriceLow,
        sellPriceHigh,
        sellBudget
      );
      expect(strategy.order0).to.deep.equal({
        liquidity: '100000000000000000000', // 100 (sellBudget) in base tkn converted to wei
        lowestRate: '0',
        highestRate: '0',
        marginalRate: '0',
      });
      expect(strategy.order1).to.deep.equal({
        liquidity: '200000000', // 200 in quote tkn converted to wei
        lowestRate: '0.0000000000015', // (1.5) * 10^6 / 10^18 in quote tkn per 1 base tkn converted to wei
        highestRate: '0.000000000002', // (2) * 10^6 / 10^18 in quote tkn per 1 base tkn converted to wei
        marginalRate: '0.000000000002', // same as highest rate
      });
    });
  });

  describe('decodeStrategy', () => {
    let decimalsStub: SinonStubbedInstance<Decimals>;

    beforeEach(() => {
      decimalsStub = sinon.createStubInstance(Decimals);
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should convert a DecodedStrategy object to a Strategy object', async () => {
      decimalsStub.fetchDecimals.onCall(0).resolves(18).onCall(1).resolves(6);

      const decodedStrategy: DecodedStrategy & { id: BigNumber } = {
        id: BigNumber.from(0),
        token0: '0x6b175474e89094c44da98b954eedeac495271d0f',
        token1: '0x57ab1e02fee23774580c119740129eac7081e9d3',
        order0: {
          liquidity: '100000000000000000000', // 100 (sellBudget) in base tkn converted to wei
          lowestRate: LOWEST_RATE, // (1/0.6) * 10^18 / 10^6 in base tkn per 1 quote tkn converted to wei
          highestRate: '2000000000000', // (1/0.5) * 10^18 / 10^6 in base tkn per 1 quote tkn converted to wei
          marginalRate: '2000000000000', // same as highest rate
        },
        order1: {
          liquidity: '200000000', // 200 in quote tkn converted to wei
          lowestRate: '0.0000000000015', // (1.5) * 10^6 / 10^18 in quote tkn per 1 base tkn converted to wei
          highestRate: '0.000000000002', // (2) * 10^6 / 10^18 in quote tkn per 1 base tkn converted to wei
          marginalRate: '0.000000000002', // same as highest rate
        },
      };

      const expectedStrategy = {
        id: '0',
        baseToken: '0x6b175474e89094c44da98b954eedeac495271d0f',
        quoteToken: '0x57ab1e02fee23774580c119740129eac7081e9d3',
        buyPriceLow: '1.5',
        buyPriceHigh: '2',
        buyBudget: '200',
        sellPriceLow: '0.5',
        sellPriceHigh: '0.6',
        sellBudget: '100',
      };

      const decodedWithEncodedField: DecodedStrategy & {
        id: BigNumber;
        encoded: EncodedStrategy;
      } =
        // @ts-ignore
        {
          ...decodedStrategy,
          encoded: {
            id: BigNumber.from(0),
            token0: 'abc',
            token1: 'xyz',
            order0: {
              y: BigNumber.from(0),
              z: BigNumber.from(0),
              A: BigNumber.from(0),
              B: BigNumber.from(0),
            },
            order1: {
              y: BigNumber.from(0),
              z: BigNumber.from(0),
              A: BigNumber.from(0),
              B: BigNumber.from(0),
            },
          },
        };

      const Strategy = await parseStrategy(
        decodedWithEncodedField,
        decimalsStub
      );
      expect(Strategy.id.toString()).to.equal(expectedStrategy.id);
      expect(Strategy.baseToken).to.equal(expectedStrategy.baseToken);
      expect(Strategy.quoteToken).to.equal(expectedStrategy.quoteToken);
      expect(Strategy.buyPriceLow).to.equal(expectedStrategy.buyPriceLow);
      expect(Strategy.buyPriceHigh).to.equal(expectedStrategy.buyPriceHigh);
      expect(Strategy.buyBudget).to.equal(expectedStrategy.buyBudget);
      expect(Strategy.sellPriceLow).to.equal(expectedStrategy.sellPriceLow);
      expect(+Strategy.sellPriceHigh).to.equal(+expectedStrategy.sellPriceHigh);
      expect(Strategy.sellBudget).to.equal(expectedStrategy.sellBudget);
    });
  });
});
