import { expect } from 'chai';
import sinon from 'sinon';
import { MarginalPriceOptions, Toolkit } from '../src/strategy-management';
import { ChainCache } from '../src/chain-cache';
import { EncodedStrategy, Strategy } from '../src/common/types';
import { BigNumber } from '../src/utils/numerics';
import { encodedStrategyBNToStr } from '../src/utils';

const encodedStrategies: EncodedStrategy[] = [
  {
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
  {
    id: BigNumber.from(1),
    token0: 'xyz',
    token1: 'abc',
    order0: {
      y: BigNumber.from(1),
      z: BigNumber.from(1),
      A: BigNumber.from(1),
      B: BigNumber.from(1),
    },
    order1: {
      y: BigNumber.from(1),
      z: BigNumber.from(1),
      A: BigNumber.from(1),
      B: BigNumber.from(1),
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
    encoded: encodedStrategyBNToStr(encodedStrategies[0]),
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
    encoded: encodedStrategyBNToStr(encodedStrategies[1]),
  },
];

const orderMap = {
  [encodedStrategies[0].id.toString()]: encodedStrategies[0].order0,
  [encodedStrategies[1].id.toString()]: encodedStrategies[1].order0,
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
      },
      composer: {
        updateStrategy: sinon.stub(),
      },
    };
    cacheMock = sinon.createStubInstance(ChainCache);
    decimalFetcher = () => 18;
  });

  describe('updateStrategy', () => {
    const encodedStrategy = {
      id: '1',
      token0: 'xyz',
      token1: 'abc',
      order0: {
        y: '1',
        z: '1',
        A: '100',
        B: '10000',
      },
      order1: {
        y: '1',
        z: '2',
        A: '100',
        B: '10000',
      },
    };
    it('should only modify A and B values if only the prices change - and reset z to y', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.updateStrategy(
        encodedStrategy.id.toString(),
        encodedStrategy,
        {
          buyPriceLow: '0.0000000000000000000002',
        }
      );
      const updateArgs = apiMock.composer.updateStrategy.getCall(0).args;
      // only A and B of the buy order (order1) are supposed to change
      expect(updateArgs[4][1].A.toString()).to.equal('6120');
      expect(updateArgs[4][1].B.toString()).to.equal('3980');
      expect(updateArgs[4][1].y.toString()).to.equal('1');
      expect(updateArgs[4][1].z.toString()).to.equal('1');

      // order 0 is supposed to remain the same
      expect(updateArgs[4][0].A.toString()).to.equal('100');
      expect(updateArgs[4][0].B.toString()).to.equal('10000');
      expect(updateArgs[4][0].y.toString()).to.equal('1');
      expect(updateArgs[4][0].z.toString()).to.equal('1');
    });

    it('should only modify y and z values if only budget is provided', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.updateStrategy(
        encodedStrategy.id.toString(),
        encodedStrategy,
        {
          buyBudget: '1',
        }
      );
      const updateArgs = apiMock.composer.updateStrategy.getCall(0).args;
      // only y and z of the buy order (order1) are supposed to change
      expect(updateArgs[4][1].A.toString()).to.equal('100');
      expect(updateArgs[4][1].B.toString()).to.equal('10000');
      expect(updateArgs[4][1].y.toString()).to.equal('1000000000000000000');
      expect(updateArgs[4][1].z.toString()).to.equal('1000000000000000000');

      // order 0 is supposed to remain the same
      expect(updateArgs[4][0].A.toString()).to.equal('100');
      expect(updateArgs[4][0].B.toString()).to.equal('10000');
      expect(updateArgs[4][0].y.toString()).to.equal('1');
      expect(updateArgs[4][0].z.toString()).to.equal('1');
    });

    it('should only modify y and z values if only budget is provided and marginal maintained', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.updateStrategy(
        encodedStrategy.id.toString(),
        encodedStrategy,
        {
          buyBudget: '1',
        },
        MarginalPriceOptions.maintain
      );
      const updateArgs = apiMock.composer.updateStrategy.getCall(0).args;
      // only y and z of the buy order (order1) are supposed to change - z should remain 2*y
      expect(updateArgs[4][1].A.toString()).to.equal('100');
      expect(updateArgs[4][1].B.toString()).to.equal('10000');
      expect(updateArgs[4][1].y.toString()).to.equal('1000000000000000000');
      expect(updateArgs[4][1].z.toString()).to.equal('2000000000000000000');

      // order 0 is supposed to remain the same
      expect(updateArgs[4][0].A.toString()).to.equal('100');
      expect(updateArgs[4][0].B.toString()).to.equal('10000');
      expect(updateArgs[4][0].y.toString()).to.equal('1');
      expect(updateArgs[4][0].z.toString()).to.equal('1');
    });

    it('should properly handle prices and budget changes - without marginal', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.updateStrategy(
        encodedStrategy.id.toString(),
        encodedStrategy,
        {
          buyPriceLow: '0.0000000000000000000002',
          buyBudget: '1',
        }
      );
      const updateArgs = apiMock.composer.updateStrategy.getCall(0).args;
      expect(updateArgs[4][1].A.toString()).to.equal('6120');
      expect(updateArgs[4][1].B.toString()).to.equal('3980');
      expect(updateArgs[4][1].y.toString()).to.equal('1000000000000000000');
      expect(updateArgs[4][1].z.toString()).to.equal('1000000000000000000');

      // order 0 is supposed to remain the same
      expect(updateArgs[4][0].A.toString()).to.equal('100');
      expect(updateArgs[4][0].B.toString()).to.equal('10000');
      expect(updateArgs[4][0].y.toString()).to.equal('1');
      expect(updateArgs[4][0].z.toString()).to.equal('1');
    });

    it('should properly handle prices and budget changes - with maintain', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.updateStrategy(
        encodedStrategy.id.toString(),
        encodedStrategy,
        {
          buyPriceLow: '0.0000000000000000000002',
          buyBudget: '1',
        },
        MarginalPriceOptions.maintain
      );
      const updateArgs = apiMock.composer.updateStrategy.getCall(0).args;
      expect(updateArgs[4][1].A.toString()).to.equal('6120');
      expect(updateArgs[4][1].B.toString()).to.equal('3980');
      expect(updateArgs[4][1].y.toString()).to.equal('1000000000000000000');
      expect(updateArgs[4][1].z.toString()).to.equal('2000000000000000000');

      // order 0 is supposed to remain the same
      expect(updateArgs[4][0].A.toString()).to.equal('100');
      expect(updateArgs[4][0].B.toString()).to.equal('10000');
      expect(updateArgs[4][0].y.toString()).to.equal('1');
      expect(updateArgs[4][0].z.toString()).to.equal('1');
    });

    it('should change A, B and z but not y when prices and marginal are set and not budget', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.updateStrategy(
        encodedStrategy.id.toString(),
        encodedStrategy,
        {
          buyPriceLow: '0.00002',
          buyPriceHigh: '0.00004',
        },
        '0.000023'
      );
      const updateArgs = apiMock.composer.updateStrategy.getCall(0).args;
      expect(updateArgs[4][1].A.toString()).to.equal('521409697717');
      expect(updateArgs[4][1].B.toString()).to.equal('1258794363780');
      expect(updateArgs[4][1].y.toString()).to.equal('1');
      expect(updateArgs[4][1].z.toString()).to.equal('5');

      // order 0 is supposed to remain the same
      expect(updateArgs[4][0].A.toString()).to.equal('100');
      expect(updateArgs[4][0].B.toString()).to.equal('10000');
      expect(updateArgs[4][0].y.toString()).to.equal('1');
      expect(updateArgs[4][0].z.toString()).to.equal('1');
    });

    it('should properly handle prices and budget changes - with marginal price set', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      await toolkit.updateStrategy(
        encodedStrategy.id.toString(),
        encodedStrategy,
        {
          buyPriceLow: '0.00002',
          buyPriceHigh: '0.00004',
          buyBudget: '1',
        },
        '0.000025'
      );
      const updateArgs = apiMock.composer.updateStrategy.getCall(0).args;
      expect(updateArgs[4][1].A.toString()).to.equal('521409697717');
      expect(updateArgs[4][1].B.toString()).to.equal('1258794363780');
      expect(updateArgs[4][1].y.toString()).to.equal('1000000000000000000');
      expect(updateArgs[4][1].z.toString()).to.equal('3509273614829219271');

      // order 0 is supposed to remain the same
      expect(updateArgs[4][0].A.toString()).to.equal('100');
      expect(updateArgs[4][0].B.toString()).to.equal('10000');
      expect(updateArgs[4][0].y.toString()).to.equal('1');
      expect(updateArgs[4][0].z.toString()).to.equal('1');
    });
  });

  describe('overlappingStrategies', () => {
    it('should calculate strategy prices', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, decimalFetcher);
      const result = await toolkit.calculateOverlappingStrategyPrices(
        'quoteToken',
        '1500',
        '2000',
        '1845',
        '1'
      );
      expect(result).to.deep.equal({
        buyPriceHigh: '1980.198019801980198019',
        buyPriceMarginal: '1835.843615937429955302',
        sellPriceLow: '1515',
        sellPriceMarginal: '1854.202052096804254855',
      });
    });
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
      expect(result).to.equal('0.024939801923642185');
    });
    it('should calculate strategy buy budget', async () => {
      const toolkit = new Toolkit(apiMock, cacheMock, () => 6);
      const result = await toolkit.calculateOverlappingStrategyBuyBudget(
        'quoteToken',
        '1500',
        '2000',
        '1845',
        '1',
        '0.024939801923642185'
      );
      expect(result).to.equal('100.999999');
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
