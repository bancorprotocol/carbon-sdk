import { expect } from 'chai';
import sinon from 'sinon';
import { Toolkit } from '../src/strategy-management';
import {
  buildGradientStrategyObject,
  decodeGradientStrategy,
  encodeGradientStrategy,
  parseGradientStrategy,
} from '../src/strategy-management/utils';
import { ChainCache } from '../src/chain-cache';
import { Decimals } from '../src/utils/decimals';
import {
  GradientEncodedStrategy,
  GradientType,
} from '../src/common/types';
import { encodedGradientStrategyBigIntToStr } from '../src/utils';
import { isAlmostEqual } from './test-utils';

describe('gradient strategy support', () => {
  it('encodes, decodes, and parses a gradient strategy', async () => {
    const strategy = buildGradientStrategyObject(
      'base',
      'quote',
      18,
      6,
      '1500',
      '1200',
      '200',
      GradientType.LinearDecrease,
      1000,
      2000,
      '2000',
      '2400',
      '1.5',
      GradientType.LinearInverseDecrease,
      1100,
      2100
    );

    const encodedWithoutId = encodeGradientStrategy(strategy);
    const encoded: GradientEncodedStrategy = {
      id: (1n << 255n) | 123n,
      ...encodedWithoutId,
    };
    const decoded = decodeGradientStrategy(encoded);

    expect(decoded.order1.gradientType).to.equal(GradientType.LinearDecrease);
    expect(decoded.order1.tradingStartTime).to.equal(1000);
    expect(decoded.order1.expiry).to.equal(2000);
    expect(decoded.order0.gradientType).to.equal(
      GradientType.LinearInverseDecrease
    );
    expect(decoded.order0.tradingStartTime).to.equal(1100);
    expect(decoded.order0.expiry).to.equal(2100);
    expect(
      ...isAlmostEqual(
        decoded.order1.initialPrice,
        strategy.order1.initialPrice,
        '0',
        '0.0000000002'
      )
    ).to.be.true;
    expect(...isAlmostEqual(decoded.order1.multiFactor, strategy.order1.multiFactor, '0', '0.0000002')).to.be.true;

    const decimals = sinon.createStubInstance(Decimals);
    decimals.fetchDecimals.withArgs('base').resolves(18);
    decimals.fetchDecimals.withArgs('quote').resolves(6);

    const parsed = await parseGradientStrategy(decoded, decimals);

    expect(parsed.type).to.equal('gradient');
    expect(parsed.id).to.equal(encoded.id.toString());
    expect(parsed.buyBudget).to.equal('200');
    expect(parsed.sellBudget).to.equal('1.5');
    expect(parsed.buyGradientType).to.equal(GradientType.LinearDecrease);
    expect(parsed.sellGradientType).to.equal(
      GradientType.LinearInverseDecrease
    );
    expect(...isAlmostEqual(parsed.buyPriceStart, '1500', '0.00002', '0.0000000002')).to.be.true;
    expect(...isAlmostEqual(parsed.buyPriceEnd, '1200', '0.00002', '0.0000000002')).to.be.true;
    expect(...isAlmostEqual(parsed.sellPriceStart, '2000', '0.00002', '0.0000000002')).to.be.true;
    expect(...isAlmostEqual(parsed.sellPriceEnd, '2400', '0.00002', '0.0000000002')).to.be.true;
  });

  it('creates a gradient strategy transaction with encoded gradient orders', async () => {
    const apiMock = {
      reader: {
        getDecimalsByAddress: sinon.stub(),
      },
      composer: {
        createGradientStrategy: sinon.stub().resolves({}),
      },
    };
    const cacheMock = sinon.createStubInstance(ChainCache);
    cacheMock.isCacheInitialized.returns(false);
    const decimalFetcher = async (address: string) =>
      address === 'base' ? 18 : 6;

    const toolkit = new Toolkit(apiMock as any, cacheMock, decimalFetcher);
    await toolkit.createBuySellGradientStrategy(
      'base',
      'quote',
      '1500',
      '1200',
      '200',
      GradientType.LinearDecrease,
      1000,
      2000,
      '2000',
      '2400',
      '1.5',
      GradientType.LinearInverseDecrease,
      1100,
      2100
    );

    const createArgs = apiMock.composer.createGradientStrategy.getCall(0).args;
    expect(createArgs[0]).to.equal('base');
    expect(createArgs[1]).to.equal('quote');
    expect(createArgs[2].liquidity.toString()).to.equal('1500000000000000000');
    expect(createArgs[3].liquidity.toString()).to.equal('200000000');
    expect(Number(createArgs[2].gradientType)).to.equal(
      GradientType.LinearInverseDecrease
    );
    expect(Number(createArgs[3].gradientType)).to.equal(
      GradientType.LinearDecrease
    );
  });

  it('preserves the raw pricing fields when only gradient budgets are updated', async () => {
    const apiMock = {
      reader: {
        getDecimalsByAddress: sinon.stub(),
      },
      composer: {
        updateGradientStrategy: sinon.stub().resolves({}),
      },
    };
    const cacheMock = sinon.createStubInstance(ChainCache);
    cacheMock.isCacheInitialized.returns(false);
    const decimalFetcher = async (address: string) =>
      address === 'base' ? 18 : 6;

    const toolkit = new Toolkit(apiMock as any, cacheMock, decimalFetcher);
    const original = encodeGradientStrategy(
      buildGradientStrategyObject(
        'base',
        'quote',
        18,
        6,
        '1500',
        '1200',
        '200',
        GradientType.LinearDecrease,
        1000,
        2000,
        '2000',
        '2400',
        '1.5',
        GradientType.LinearInverseDecrease,
        1100,
        2100
      )
    );
    const encoded = encodedGradientStrategyBigIntToStr({
      id: (1n << 255n) | 123n,
      ...original,
    });

    await toolkit.updateGradientStrategy(encoded.id, encoded, {
      buyBudget: '250',
      sellBudget: '2',
    });

    const updateArgs = apiMock.composer.updateGradientStrategy.getCall(0).args;
    const currentOrders = updateArgs[3];
    const newOrders = updateArgs[4];

    expect(newOrders[1].initialPrice).to.equal(currentOrders[1].initialPrice);
    expect(newOrders[1].tradingStartTime).to.equal(
      currentOrders[1].tradingStartTime
    );
    expect(newOrders[1].expiry).to.equal(currentOrders[1].expiry);
    expect(newOrders[1].multiFactor).to.equal(currentOrders[1].multiFactor);
    expect(newOrders[1].gradientType).to.equal(currentOrders[1].gradientType);
    expect(newOrders[0].initialPrice).to.equal(currentOrders[0].initialPrice);
    expect(newOrders[0].tradingStartTime).to.equal(
      currentOrders[0].tradingStartTime
    );
    expect(newOrders[0].expiry).to.equal(currentOrders[0].expiry);
    expect(newOrders[0].multiFactor).to.equal(currentOrders[0].multiFactor);
    expect(newOrders[0].gradientType).to.equal(currentOrders[0].gradientType);
    expect(newOrders[1].liquidity.toString()).to.equal('250000000');
    expect(newOrders[0].liquidity.toString()).to.equal('2000000000000000000');
  });
});
