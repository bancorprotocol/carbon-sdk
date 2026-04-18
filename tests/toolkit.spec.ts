import { expect } from 'chai';
import sinon from 'sinon';
import { MarginalPriceOptions, Toolkit } from '../src/strategy-management';
import { ChainCache } from '../src/chain-cache';
import { EncodedStrategy, Strategy } from '../src/common/types';
import { encodedStrategyBigIntToStr, ordersMapBNToStr } from '../src/utils';

const encodedStrategies: EncodedStrategy[] = [
  {
    id: 0n,
    token0: 'abc',
    token1: 'xyz',
    order0: {
      y: 0n,
      z: 0n,
      A: 0n,
      B: 0n,
    },
    order1: {
      y: 0n,
      z: 0n,
      A: 0n,
      B: 0n,
    },
  },
  {
    id: 1n,
    token0: 'xyz',
    token1: 'abc',
    order0: {
      y: 1n,
      z: 1n,
      A: 1n,
      B: 1n,
    },
    order1: {
      y: 1n,
      z: 1n,
      A: 1n,
      B: 1n,
    },
  },
];

const expectedStrategies: Strategy[] = [
  {
    id: '0',
    baseToken: 'abc',
    quoteToken: 'xyz',
    buyPriceLow: '0',
    buyPriceMarginal: '0',
    buyPriceHigh: '0',
    buyBudget: '0',
    sellPriceLow: '0',
    sellPriceMarginal: '0',
    sellPriceHigh: '0',
    sellBudget: '0',
    encoded: encodedStrategyBigIntToStr(encodedStrategies[0]),
  },
  {
    id: '1',
    baseToken: 'xyz',
    quoteToken: 'abc',
    buyPriceLow:
      '0.000000000000000000000000000012621774483536188886587657044524579674771302961744368076324462890625',
    buyPriceMarginal:
      '0.0000000000000000000000000000504870979341447555463506281780983186990852118469774723052978515625',
    buyPriceHigh:
      '0.0000000000000000000000000000504870979341447555463506281780983186990852118469774723052978515625',
    buyBudget: '0.000000000000000001',
    sellPriceLow: '19807040628566084398385987584',
    sellPriceMarginal: '19807040628566084398385987584',
    sellPriceHigh: '79228162514264337593543950336',
    sellBudget: '0.000000000000000001',
    encoded: encodedStrategyBigIntToStr(encodedStrategies[1]),
  },
];

const orderMap = {
  [encodedStrategies[0].id.toString()]: encodedStrategies[0].order0,
  [encodedStrategies[1].id.toString()]: encodedStrategies[1].order0,
};

const directedStrategiesFixture: EncodedStrategy[] = [
  {
    id: 10n,
    token0: 'sourceToken',
    token1: 'targetToken',
    order0: {
      y: 100n,
      z: 100n,
      A: 9n,
      B: 9n,
    },
    order1: {
      y: 5n,
      z: 5n,
      A: 0n,
      B: 0n,
    },
  },
  {
    id: 11n,
    token0: 'sourceToken',
    token1: 'targetToken',
    order0: {
      y: 100n,
      z: 100n,
      A: 7n,
      B: 7n,
    },
    order1: {
      y: 7n,
      z: 7n,
      A: 2n,
      B: 3n,
    },
  },
  {
    id: 12n,
    token0: 'targetToken',
    token1: 'sourceToken',
    order0: {
      y: 9n,
      z: 9n,
      A: 4n,
      B: 5n,
    },
    order1: {
      y: 100n,
      z: 100n,
      A: 8n,
      B: 8n,
    },
  },
];

const directedOrdersFixture = {
  '11': directedStrategiesFixture[1].order1,
  '12': directedStrategiesFixture[2].order0,
};

describe('Toolkit', () => {
  let apiMock: any;
  let cacheMock: any;
  let decimalFetcher: any;

  beforeEach(() => {
    apiMock = {
      reader: {
        getDecimalsByAddress: sinon.stub(),
        strategiesByPair: sinon.stub(),
        strategy: sinon.stub(),
      },
      composer: {
        updateStrategy: sinon.stub(),
        createStrategy: sinon.stub(),
      },
    };
    cacheMock = sinon.createStubInstance(ChainCache);
    cacheMock.isCacheInitialized.returns(true);
    decimalFetcher = () => 18;
  });

  describe('createBuySellStrategy', () => {
    it('should create the correct strategy', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.createBuySellStrategy(
        expectedStrategies[1].baseToken,
        expectedStrategies[1].quoteToken,
        expectedStrategies[1].buyPriceLow,
        expectedStrategies[1].buyPriceMarginal,
        expectedStrategies[1].buyPriceHigh,
        expectedStrategies[1].buyBudget,
        expectedStrategies[1].sellPriceLow,
        expectedStrategies[1].sellPriceMarginal,
        expectedStrategies[1].sellPriceHigh,
        expectedStrategies[1].sellBudget
      );

      const createArgs = apiMock.composer.createStrategy.getCall(0).args;
      expect(createArgs[2].A.toString()).to.equal(
        encodedStrategies[1].order0.A.toString()
      );
      expect(createArgs[2].B.toString()).to.equal(
        encodedStrategies[1].order0.B.toString()
      );
      expect(createArgs[2].y.toString()).to.equal(
        encodedStrategies[1].order0.y.toString()
      );
      expect(createArgs[2].z.toString()).to.equal(
        encodedStrategies[1].order0.z.toString()
      );
      expect(createArgs[3].A.toString()).to.equal(
        encodedStrategies[1].order1.A.toString()
      );
      expect(createArgs[3].B.toString()).to.equal(
        encodedStrategies[1].order1.B.toString()
      );
      expect(createArgs[3].y.toString()).to.equal(
        encodedStrategies[1].order1.y.toString()
      );
      expect(createArgs[3].z.toString()).to.equal(
        encodedStrategies[1].order1.z.toString()
      );
    });

    it('should create the correct strategy when budget is 0', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.createBuySellStrategy(
        expectedStrategies[1].baseToken,
        expectedStrategies[1].quoteToken,
        expectedStrategies[1].buyPriceLow,
        expectedStrategies[1].buyPriceMarginal,
        expectedStrategies[1].buyPriceHigh,
        '0',
        expectedStrategies[1].sellPriceLow,
        expectedStrategies[1].sellPriceMarginal,
        expectedStrategies[1].sellPriceHigh,
        expectedStrategies[1].sellBudget
      );

      const createArgs = apiMock.composer.createStrategy.getCall(0).args;
      expect(createArgs[2].A.toString()).to.equal(
        encodedStrategies[1].order0.A.toString()
      );
      expect(createArgs[2].B.toString()).to.equal(
        encodedStrategies[1].order0.B.toString()
      );
      expect(createArgs[2].y.toString()).to.equal(
        encodedStrategies[1].order0.y.toString()
      );
      expect(createArgs[2].z.toString()).to.equal(
        encodedStrategies[1].order0.z.toString()
      );
      expect(createArgs[3].A.toString()).to.equal(
        encodedStrategies[1].order1.A.toString()
      );
      expect(createArgs[3].B.toString()).to.equal(
        encodedStrategies[1].order1.B.toString()
      );
      expect(createArgs[3].y.toString()).to.equal('0');
      expect(createArgs[3].z.toString()).to.equal(
        '39614081257132168796771975168'
      );
    });

    it('should create the correct range strategy when marginal price is in between the range', async () => {
      const strategy = {
        id: '0',
        baseToken: 'abc',
        quoteToken: 'xyz',
        buyPriceLow: '1500',
        buyPriceMarginal: '1845',
        buyPriceHigh: '1980',
        buyBudget: '100',
        sellPriceLow: '1550',
        sellPriceMarginal: '1890',
        sellPriceHigh: '2000',
        sellBudget: '0',
      };
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.createBuySellStrategy(
        strategy.baseToken,
        strategy.quoteToken,
        strategy.buyPriceLow,
        strategy.buyPriceMarginal,
        strategy.buyPriceHigh,
        strategy.buyBudget,
        strategy.sellPriceLow,
        strategy.sellPriceMarginal,
        strategy.sellPriceHigh,
        strategy.sellBudget
      );

      const createArgs = apiMock.composer.createStrategy.getCall(0).args;
      expect(createArgs[2].A.toString()).to.equal('855499739024');
      expect(createArgs[2].B.toString()).to.equal('6293971818901');
      expect(createArgs[2].y.toString()).to.equal('0');
      expect(createArgs[2].z.toString()).to.equal('79234223680881057');
      expect(createArgs[3].A.toString()).to.equal('1047345780991496');
      expect(createArgs[3].B.toString()).to.equal('1859185469197450');
      expect(createArgs[3].y.toString()).to.equal('100000000000000000000');
      expect(createArgs[3].z.toString()).to.equal('136549788505388468681');
    });
  });

  describe('updateStrategy', () => {
    const encodedStrategy = {
      id: '1',
      token0: 'xyz',
      token1: 'abc',
      order0: {
        y: '105931432165199309',
        z: '112518705096506876',
        A: '109321077153',
        B: '5520178457060',
      },
      order1: {
        y: '16945935213126339835',
        z: '30532403306522936035',
        A: '433837513252448',
        B: '1901780726835288',
      },
    };
    const encodedEmptyStrategy = {
      id: '1',
      token0: 'xyz',
      token1: 'abc',
      order0: {
        y: '105931432165199309',
        z: '112518705096506876',
        A: '109321077153',
        B: '5520178457060',
      },
      order1: {
        y: '0',
        z: '30532403306522936035',
        A: '433837513252448',
        B: '1901780726835288',
      },
    };
    it('should only modify A and B values if only the prices change - and reset z to y', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.updateStrategy(
        encodedStrategy.id.toString(),
        encodedStrategy,
        {
          buyPriceLow: '2355',
        }
      );
      const updateArgs = apiMock.composer.updateStrategy.getCall(0).args;
      // only A and B of the buy order (order1) are supposed to change - and z is reset to y
      expect(updateArgs[4][1].A.toString()).to.equal('272786533470912');
      expect(updateArgs[4][1].B.toString()).to.equal('1902279766516736');
      expect(updateArgs[4][1].y.toString()).to.equal(encodedStrategy.order1.y);
      expect(updateArgs[4][1].z.toString()).to.equal(encodedStrategy.order1.y);

      // order 0 is supposed to remain the same
      expect(updateArgs[4][0].A.toString()).to.equal(encodedStrategy.order0.A);
      expect(updateArgs[4][0].B.toString()).to.equal(encodedStrategy.order0.B);
      expect(updateArgs[4][0].y.toString()).to.equal(encodedStrategy.order0.y);
      expect(updateArgs[4][0].z.toString()).to.equal(encodedStrategy.order0.z);
    });

    it('when passing prices and budget and maintain - maintain should apply to z', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.updateStrategy(
        encodedStrategy.id.toString(),
        encodedStrategy,
        {
          buyPriceLow: '2355',
          buyBudget: '16',
        },
        MarginalPriceOptions.maintain
      );
      const updateArgs = apiMock.composer.updateStrategy.getCall(0).args;
      // A, B and y of the buy order (order1) are supposed to change - and z is changed to maintain ration to y
      expect(updateArgs[4][1].A.toString()).to.equal('272786533470912');
      expect(updateArgs[4][1].B.toString()).to.equal('1902279766516736');
      expect(updateArgs[4][1].y.toString()).to.equal('16000000000000000000');
      expect(updateArgs[4][1].z.toString()).to.equal('28828060933807893468');

      // order 0 is supposed to remain the same
      expect(updateArgs[4][0].A.toString()).to.equal(encodedStrategy.order0.A);
      expect(updateArgs[4][0].B.toString()).to.equal(encodedStrategy.order0.B);
      expect(updateArgs[4][0].y.toString()).to.equal(encodedStrategy.order0.y);
      expect(updateArgs[4][0].z.toString()).to.equal(encodedStrategy.order0.z);
    });

    it('should only modify y and z values if only budget is provided', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.updateStrategy(
        encodedStrategy.id.toString(),
        encodedStrategy,
        {
          buyBudget: '16',
        }
      );
      const updateArgs = apiMock.composer.updateStrategy.getCall(0).args;
      // only y and z of the buy order (order1) are supposed to change
      expect(updateArgs[4][1].A.toString()).to.equal(encodedStrategy.order1.A);
      expect(updateArgs[4][1].B.toString()).to.equal(encodedStrategy.order1.B);
      expect(updateArgs[4][1].y.toString()).to.equal('16000000000000000000');
      expect(updateArgs[4][1].z.toString()).to.equal('16000000000000000000');

      // order 0 is supposed to remain the same
      expect(updateArgs[4][0].A.toString()).to.equal(encodedStrategy.order0.A);
      expect(updateArgs[4][0].B.toString()).to.equal(encodedStrategy.order0.B);
      expect(updateArgs[4][0].y.toString()).to.equal(encodedStrategy.order0.y);
      expect(updateArgs[4][0].z.toString()).to.equal(encodedStrategy.order0.z);
    });

    it('should only modify y and z values if only budget is provided and marginal maintained', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.updateStrategy(
        encodedStrategy.id.toString(),
        encodedStrategy,
        {
          buyBudget: '16',
        },
        MarginalPriceOptions.maintain
      );
      const updateArgs = apiMock.composer.updateStrategy.getCall(0).args;
      // only y and z of the buy order (order1) are supposed to change - z should remain 2*y
      expect(updateArgs[4][1].A.toString()).to.equal(encodedStrategy.order1.A);
      expect(updateArgs[4][1].B.toString()).to.equal(encodedStrategy.order1.B);
      expect(updateArgs[4][1].y.toString()).to.equal('16000000000000000000');
      expect(updateArgs[4][1].z.toString()).to.equal('28828060933807893468');

      // order 0 is supposed to remain the same
      expect(updateArgs[4][0].A.toString()).to.equal(encodedStrategy.order0.A);
      expect(updateArgs[4][0].B.toString()).to.equal(encodedStrategy.order0.B);
      expect(updateArgs[4][0].y.toString()).to.equal(encodedStrategy.order0.y);
      expect(updateArgs[4][0].z.toString()).to.equal(encodedStrategy.order0.z);
    });

    it('should properly handle prices and budget changes - without marginal', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.updateStrategy(
        encodedStrategy.id.toString(),
        encodedStrategy,
        {
          buyPriceLow: '2355',
          buyBudget: '16',
        }
      );
      const updateArgs = apiMock.composer.updateStrategy.getCall(0).args;
      expect(updateArgs[4][1].A.toString()).to.equal('272786533470912');
      expect(updateArgs[4][1].B.toString()).to.equal('1902279766516736');
      expect(updateArgs[4][1].y.toString()).to.equal('16000000000000000000');
      expect(updateArgs[4][1].z.toString()).to.equal('16000000000000000000');

      // order 0 is supposed to remain the same
      expect(updateArgs[4][0].A.toString()).to.equal(encodedStrategy.order0.A);
      expect(updateArgs[4][0].B.toString()).to.equal(encodedStrategy.order0.B);
      expect(updateArgs[4][0].y.toString()).to.equal(encodedStrategy.order0.y);
      expect(updateArgs[4][0].z.toString()).to.equal(encodedStrategy.order0.z);
    });

    it('should properly handle prices and budget changes - with maintain', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.updateStrategy(
        encodedStrategy.id.toString(),
        encodedStrategy,
        {
          buyPriceLow: '2355',
          buyBudget: '16',
        },
        MarginalPriceOptions.maintain
      );
      const updateArgs = apiMock.composer.updateStrategy.getCall(0).args;
      expect(updateArgs[4][1].A.toString()).to.equal('272786533470912');
      expect(updateArgs[4][1].B.toString()).to.equal('1902279766516736');
      expect(updateArgs[4][1].y.toString()).to.equal('16000000000000000000');
      expect(updateArgs[4][1].z.toString()).to.equal('28828060933807893468');

      // order 0 is supposed to remain the same
      expect(updateArgs[4][0].A.toString()).to.equal(encodedStrategy.order0.A);
      expect(updateArgs[4][0].B.toString()).to.equal(encodedStrategy.order0.B);
      expect(updateArgs[4][0].y.toString()).to.equal(encodedStrategy.order0.y);
      expect(updateArgs[4][0].z.toString()).to.equal(encodedStrategy.order0.z);
    });

    it('should change A, B and z but not y when prices and marginal are set and not budget', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.updateStrategy(
        encodedStrategy.id.toString(),
        encodedStrategy,
        {
          buyPriceLow: '2355',
          buyPriceHigh: '2460',
        },
        '2400'
      );
      const updateArgs = apiMock.composer.updateStrategy.getCall(0).args;
      expect(updateArgs[4][1].A.toString()).to.equal('432070399405472');
      expect(updateArgs[4][1].B.toString()).to.equal('1902279766516736');
      expect(updateArgs[4][1].y.toString()).to.equal(encodedStrategy.order1.y);
      expect(updateArgs[4][1].z.toString()).to.equal('39295281094046108369');

      // order 0 is supposed to remain the same
      expect(updateArgs[4][0].A.toString()).to.equal(encodedStrategy.order0.A);
      expect(updateArgs[4][0].B.toString()).to.equal(encodedStrategy.order0.B);
      expect(updateArgs[4][0].y.toString()).to.equal(encodedStrategy.order0.y);
      expect(updateArgs[4][0].z.toString()).to.equal(encodedStrategy.order0.z);
    });

    it('should properly handle prices and budget changes - with marginal price set', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.updateStrategy(
        encodedStrategy.id.toString(),
        encodedStrategy,
        {
          buyPriceLow: '2355',
          buyPriceHigh: '2460',
          buyBudget: '16',
        },
        '2400'
      );
      const updateArgs = apiMock.composer.updateStrategy.getCall(0).args;
      expect(updateArgs[4][1].A.toString()).to.equal('432070399405472');
      expect(updateArgs[4][1].B.toString()).to.equal('1902279766516736');
      expect(updateArgs[4][1].y.toString()).to.equal('16000000000000000000');
      expect(updateArgs[4][1].z.toString()).to.equal('37101788104189555426');

      // order 0 is supposed to remain the same
      expect(updateArgs[4][0].A.toString()).to.equal(encodedStrategy.order0.A);
      expect(updateArgs[4][0].B.toString()).to.equal(encodedStrategy.order0.B);
      expect(updateArgs[4][0].y.toString()).to.equal(encodedStrategy.order0.y);
      expect(updateArgs[4][0].z.toString()).to.equal(encodedStrategy.order0.z);
    });

    it('should properly handle setting budget to an order with no budget - keeping A, B and z when passed MarginalPriceOptions.maintain', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.updateStrategy(
        encodedEmptyStrategy.id.toString(),
        encodedEmptyStrategy,
        {
          buyBudget: '16',
        },
        MarginalPriceOptions.maintain
      );
      const updateArgs = apiMock.composer.updateStrategy.getCall(0).args;
      expect(updateArgs[4][1].A.toString()).to.equal(
        encodedEmptyStrategy.order1.A
      );
      expect(updateArgs[4][1].B.toString()).to.equal(
        encodedEmptyStrategy.order1.B
      );
      expect(updateArgs[4][1].y.toString()).to.equal('16000000000000000000');
      expect(updateArgs[4][1].z.toString()).to.equal(
        encodedEmptyStrategy.order1.z
      );

      // order 0 is supposed to remain the same
      expect(updateArgs[4][0].A.toString()).to.equal(
        encodedEmptyStrategy.order0.A
      );
      expect(updateArgs[4][0].B.toString()).to.equal(
        encodedEmptyStrategy.order0.B
      );
      expect(updateArgs[4][0].y.toString()).to.equal(
        encodedEmptyStrategy.order0.y
      );
      expect(updateArgs[4][0].z.toString()).to.equal(
        encodedEmptyStrategy.order0.z
      );
    });

    it('should properly handle setting budget to an order with no budget - keeping A, B but setting z to the now bigger y when passed MarginalPriceOptions.maintain', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.updateStrategy(
        encodedEmptyStrategy.id.toString(),
        encodedEmptyStrategy,
        {
          buyBudget: '30',
        },
        MarginalPriceOptions.maintain
      );
      const updateArgs = apiMock.composer.updateStrategy.getCall(0).args;
      expect(updateArgs[4][1].A.toString()).to.equal(
        encodedEmptyStrategy.order1.A
      );
      expect(updateArgs[4][1].B.toString()).to.equal(
        encodedEmptyStrategy.order1.B
      );
      expect(updateArgs[4][1].y.toString()).to.equal('30000000000000000000');
      expect(updateArgs[4][1].z.toString()).to.equal('30532403306522936035');

      // order 0 is supposed to remain the same
      expect(updateArgs[4][0].A.toString()).to.equal(
        encodedEmptyStrategy.order0.A
      );
      expect(updateArgs[4][0].B.toString()).to.equal(
        encodedEmptyStrategy.order0.B
      );
      expect(updateArgs[4][0].y.toString()).to.equal(
        encodedEmptyStrategy.order0.y
      );
      expect(updateArgs[4][0].z.toString()).to.equal(
        encodedEmptyStrategy.order0.z
      );
    });

    it('should properly handle setting budget to an order with no budget - keeping A, B but setting z to the now bigger y when passed only buyBudget', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.updateStrategy(
        encodedEmptyStrategy.id.toString(),
        encodedEmptyStrategy,
        {
          buyBudget: '30',
        }
      );
      const updateArgs = apiMock.composer.updateStrategy.getCall(0).args;
      expect(updateArgs[4][1].A.toString()).to.equal(
        encodedEmptyStrategy.order1.A
      );
      expect(updateArgs[4][1].B.toString()).to.equal(
        encodedEmptyStrategy.order1.B
      );
      expect(updateArgs[4][1].y.toString()).to.equal('30000000000000000000');
      expect(updateArgs[4][1].z.toString()).to.equal('30000000000000000000');

      // order 0 is supposed to remain the same
      expect(updateArgs[4][0].A.toString()).to.equal(
        encodedEmptyStrategy.order0.A
      );
      expect(updateArgs[4][0].B.toString()).to.equal(
        encodedEmptyStrategy.order0.B
      );
      expect(updateArgs[4][0].y.toString()).to.equal(
        encodedEmptyStrategy.order0.y
      );
      expect(updateArgs[4][0].z.toString()).to.equal(
        encodedEmptyStrategy.order0.z
      );
    });
  });

  describe('overlappingStrategies', () => {
    it('should calculate strategy sell budget', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      const result = await toolkit.calculateOverlappingStrategySellBudget(
        'baseToken',
        'quoteToken',
        '1500',
        '2000',
        '1845',
        '1',
        '100'
      );
      expect(result).to.equal('0.021054379766414182');
    });
    it('should calculate strategy buy budget', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, () => 6);
      const result = await toolkit.calculateOverlappingStrategyBuyBudget(
        'baseToken',
        'quoteToken',
        '1500',
        '2000',
        '1845',
        '1',
        '0.021054379766414182'
      );
      expect(result).to.equal('100.99701');
    });
  });

  describe('hasLiquidityByPair', () => {
    it('should return true if there are orders', async () => {
      cacheMock.getOrdersByPair.resolves(orderMap);

      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      const hasLiquidity = await toolkit.hasLiquidityByPair(
        'sourceToken',
        'targetToken'
      );

      expect(cacheMock.getOrdersByPair.calledWith('sourceToken', 'targetToken'))
        .to.be.true;
      expect(hasLiquidity).to.be.true;
    });

    it('should return false if there are no orders', async () => {
      const orders = {};
      cacheMock.getOrdersByPair.resolves(orders);

      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      const hasLiquidity = await toolkit.hasLiquidityByPair(
        'sourceToken',
        'targetToken'
      );

      expect(cacheMock.getOrdersByPair.calledWith('sourceToken', 'targetToken'))
        .to.be.true;
      expect(hasLiquidity).to.be.false;
    });

    it('should match the static strategies-based companion', async () => {
      cacheMock.getOrdersByPair.resolves(directedOrdersFixture);

      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      const hasLiquidity = await toolkit.hasLiquidityByPair(
        'sourceToken',
        'targetToken'
      );
      const staticHasLiquidity = Toolkit.hasLiquidityByPairStatic({
        sourceToken: 'sourceToken',
        targetToken: 'targetToken',
        strategies: directedStrategiesFixture.map(encodedStrategyBigIntToStr),
      });

      expect(staticHasLiquidity).to.equal(hasLiquidity);
    });
  });

  describe('getLiquidityByPair', () => {
    it('should calculate liquidity correctly if there are orders', async () => {
      cacheMock.getOrdersByPair.resolves(orderMap);

      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      const liquidity = await toolkit.getLiquidityByPair(
        'sourceToken',
        'targetToken'
      );

      expect(cacheMock.getOrdersByPair.calledWith('sourceToken', 'targetToken'))
        .to.be.true;
      expect(liquidity).to.equal('0.000000000000000001');
    });

    it('should return 0 if there are no orders', async () => {
      const orders = {};
      cacheMock.getOrdersByPair.resolves(orders);

      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      const liquidity = await toolkit.getLiquidityByPair(
        'sourceToken',
        'targetToken'
      );

      expect(cacheMock.getOrdersByPair.calledWith('sourceToken', 'targetToken'))
        .to.be.true;
      expect(liquidity).to.equal('0');
    });

    it('should match the static strategies-based companion', async () => {
      cacheMock.getOrdersByPair.resolves(directedOrdersFixture);

      const toolkit = new Toolkit(apiMock, cacheMock, () => 0);
      const liquidity = await toolkit.getLiquidityByPair(
        'sourceToken',
        'targetToken'
      );
      const staticLiquidity = Toolkit.getLiquidityByPairStatic({
        sourceToken: 'sourceToken',
        targetToken: 'targetToken',
        strategies: directedStrategiesFixture.map(encodedStrategyBigIntToStr),
        targetDecimals: 0,
      });

      expect(staticLiquidity).to.equal(liquidity);
    });
  });

  describe('getTradeDataStatic', () => {
    it('should match instance getTradeData for source-amount trades', async () => {
      cacheMock.getOrdersByPair.resolves(orderMap);
      cacheMock.getTradingFeePPMByPair.resolves(0);

      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      const amount = '0.000000000000000001';

      const instanceResult = await toolkit.getTradeData(
        'sourceToken',
        'targetToken',
        amount,
        false
      );
      const staticResult = Toolkit.getTradeDataStatic({
        amount,
        isTradeByTarget: false,
        orders: ordersMapBNToStr(orderMap),
        sourceDecimals: 18,
        targetDecimals: 18,
        tradingFeePPM: 0,
      });

      expect(staticResult).to.deep.equal(instanceResult);
    });

    it('should match instance getTradeData for target-amount trades', async () => {
      cacheMock.getOrdersByPair.resolves(orderMap);
      cacheMock.getTradingFeePPMByPair.resolves(100000);

      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      const amount = '0.000000000000000001';

      const instanceResult = await toolkit.getTradeData(
        'sourceToken',
        'targetToken',
        amount,
        true
      );
      const staticResult = Toolkit.getTradeDataStatic({
        amount,
        isTradeByTarget: true,
        orders: ordersMapBNToStr(orderMap),
        sourceDecimals: 18,
        targetDecimals: 18,
        tradingFeePPM: 100000,
      });

      expect(staticResult.actionsWei).to.not.be.empty;
      expect(staticResult).to.deep.equal(instanceResult);
    });

    it('should derive directed tradable orders from strategies', async () => {
      cacheMock.getOrdersByPair.resolves(directedOrdersFixture);
      cacheMock.getTradingFeePPMByPair.resolves(0);

      const toolkit = new Toolkit(apiMock, cacheMock, () => 0);

      const withStrategies = Toolkit.getTradeDataStatic({
        amount: '2',
        isTradeByTarget: true,
        sourceToken: 'sourceToken',
        targetToken: 'targetToken',
        strategies: directedStrategiesFixture.map(encodedStrategyBigIntToStr),
        sourceDecimals: 0,
        targetDecimals: 0,
        tradingFeePPM: 0,
      });

      const withOrders = Toolkit.getTradeDataStatic({
        amount: '2',
        isTradeByTarget: true,
        orders: ordersMapBNToStr({
          '11': directedStrategiesFixture[1].order1,
          '12': directedStrategiesFixture[2].order0,
        }),
        sourceDecimals: 0,
        targetDecimals: 0,
        tradingFeePPM: 0,
      });
      const instanceResult = await toolkit.getTradeData(
        'sourceToken',
        'targetToken',
        '2',
        true
      );

      expect(withStrategies.actionsWei).to.not.be.empty;
      expect(withStrategies).to.deep.equal(withOrders);
      expect(withStrategies).to.deep.equal(instanceResult);
    });
  });

  describe('getTradeDataFromActions', () => {
    it('should match getTradeDataStatic when using static matched actions', () => {
      const tradeData = Toolkit.getTradeDataStatic({
        amount: '0.000000000000000001',
        isTradeByTarget: true,
        orders: ordersMapBNToStr(orderMap),
        sourceDecimals: 18,
        targetDecimals: 18,
        tradingFeePPM: 100000,
      });

      const fromActions = Toolkit.getTradeDataFromActionsStatic({
        isTradeByTarget: true,
        actionsWei: tradeData.actionsWei,
        sourceDecimals: 18,
        targetDecimals: 18,
        tradingFeePPM: 100000,
      });

      expect(fromActions).to.deep.equal(tradeData);
    });

    it('should preserve the instance getTradeDataFromActions API', async () => {
      cacheMock.getTradingFeePPMByPair.resolves(100000);

      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      const tradeData = Toolkit.getTradeDataStatic({
        amount: '0.000000000000000001',
        isTradeByTarget: true,
        orders: ordersMapBNToStr(orderMap),
        sourceDecimals: 18,
        targetDecimals: 18,
        tradingFeePPM: 100000,
      });

      const fromActions = await toolkit.getTradeDataFromActions(
        'sourceToken',
        'targetToken',
        true,
        tradeData.actionsWei
      );

      expect(fromActions).to.deep.equal(tradeData);
    });
  });

  describe('pair statics', () => {
    it('should match static getMaxSourceAmountByPair with the instance method', async () => {
      cacheMock.getOrdersByPair.resolves(directedOrdersFixture);

      const toolkit = new Toolkit(apiMock, cacheMock, () => 0);
      const instanceResult = await toolkit.getMaxSourceAmountByPair(
        'sourceToken',
        'targetToken'
      );
      const staticResult = Toolkit.getMaxSourceAmountByPairStatic({
        sourceToken: 'sourceToken',
        targetToken: 'targetToken',
        strategies: directedStrategiesFixture.map(encodedStrategyBigIntToStr),
        sourceDecimals: 0,
      });

      expect(staticResult).to.equal(instanceResult);
    });

    it('should match static getMinRateByPair with the instance method', async () => {
      cacheMock.getOrdersByPair.resolves(directedOrdersFixture);

      const toolkit = new Toolkit(apiMock, cacheMock, () => 0);
      const instanceResult = await toolkit.getMinRateByPair(
        'sourceToken',
        'targetToken'
      );
      const staticResult = Toolkit.getMinRateByPairStatic({
        sourceToken: 'sourceToken',
        targetToken: 'targetToken',
        strategies: directedStrategiesFixture.map(encodedStrategyBigIntToStr),
        sourceDecimals: 0,
        targetDecimals: 0,
      });

      expect(staticResult).to.equal(instanceResult);
    });

    it('should match static getMaxRateByPair with the instance method', async () => {
      cacheMock.getOrdersByPair.resolves(directedOrdersFixture);

      const toolkit = new Toolkit(apiMock, cacheMock, () => 0);
      const instanceResult = await toolkit.getMaxRateByPair(
        'sourceToken',
        'targetToken'
      );
      const staticResult = Toolkit.getMaxRateByPairStatic({
        sourceToken: 'sourceToken',
        targetToken: 'targetToken',
        strategies: directedStrategiesFixture.map(encodedStrategyBigIntToStr),
        sourceDecimals: 0,
        targetDecimals: 0,
      });

      expect(staticResult).to.equal(instanceResult);
    });

    it('should match static getRateLiquidityDepthsByPair with the instance method', async () => {
      cacheMock.getOrdersByPair.resolves(directedOrdersFixture);

      const toolkit = new Toolkit(apiMock, cacheMock, () => 0);
      const rates = ['1', '2', '3'];
      const instanceResult = await toolkit.getRateLiquidityDepthsByPair(
        'sourceToken',
        'targetToken',
        rates
      );
      const staticResult = Toolkit.getRateLiquidityDepthsByPairStatic({
        rates,
        sourceToken: 'sourceToken',
        targetToken: 'targetToken',
        strategies: directedStrategiesFixture.map(encodedStrategyBigIntToStr),
        sourceDecimals: 0,
        targetDecimals: 0,
      });

      expect(staticResult).to.deep.equal(instanceResult);
    });
  });

  describe('getStrategyById', () => {
    it('should fetch strategies from cache if available', async () => {
      cacheMock.getStrategyById.returns(encodedStrategies[0]);

      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      const strategy = await toolkit.getStrategyById('0');

      expect(cacheMock.getStrategyById.calledWith('0')).to.be.true;
      expect(strategy).to.deep.equal(expectedStrategies[0]);
    });

    it('should fetch strategies from the chain if not available in cache', async () => {
      cacheMock.getStrategyById.returns(undefined);

      apiMock.reader.strategy.resolves(encodedStrategies[0]);

      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      const strategies = await toolkit.getStrategyById('0');

      expect(apiMock.reader.strategy.calledWith(0n)).to.be.true;
      expect(strategies).to.deep.equal(expectedStrategies[0]);
    });
  });

  describe('getStrategiesByPair', () => {
    it('should fetch strategies from cache if available', async () => {
      cacheMock.getStrategiesByPair.resolves(encodedStrategies);

      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      const strategies = await toolkit.getStrategiesByPair('xyz', 'abc');

      expect(cacheMock.getStrategiesByPair.calledWith('xyz', 'abc')).to.be.true;
      expect(strategies).to.deep.equal(expectedStrategies);
    });

    it('should fetch strategies from the chain if not available in cache', async () => {
      cacheMock.getStrategiesByPair.resolves(undefined);

      apiMock.reader.strategiesByPair.resolves(encodedStrategies);

      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      const strategies = await toolkit.getStrategiesByPair('token0', 'token1');

      expect(apiMock.reader.strategiesByPair.calledWith('token0', 'token1')).to
        .be.true;
      expect(strategies).to.deep.equal(expectedStrategies);
    });
  });
});
