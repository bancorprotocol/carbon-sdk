import { expect } from 'chai';
import { Decimal, BigNumber } from '../src/utils/numerics';
import { castToUniV3, batchCastToUniV3 } from '../src/adapters/uni-v3/adapter';
import { DecodedStrategy, EncodedStrategy } from '../src/common/types';
import {
  buildStrategyObject,
  encodeStrategy,
} from '../src/strategy-management/utils';

describe('Uniswap V3 Adapter', () => {
  const wBTCDecimals = 8;
  const SHIBDecimals = 18;

  // Example strategy from spec with WBTC/SHIB pair
  const exampleStrategy: DecodedStrategy = buildStrategyObject(
    '0xWBTC',
    '0xSHIB',
    wBTCDecimals,
    SHIBDecimals,
    '3543394833.948345819174724191772607317991320232065325065623989176702584205824065767190258',
    '5315092250.922518728762086287658910976986980348097987598435983765053876308736098650785387',
    '7972638376.383778093143129431488366465480470522146981397653975647580814463104147976178081',
    '10000000000',
    '7972638376.383778093143129431488366465480470522146981397653975647580814463104147976178081',
    '10630184501.84503745752417257531782195397396069619597519687196753010775261747219730157077',
    '15945276752.76755618628625886297673293096094104429396279530795129516162892620829595235616',
    '4'
  );

  // Create encoded version of the example strategy
  // order0
  // A: 9233
  // B: 22290
  // y: 400000000
  // z: 737165668
  // order1
  // A: 9202255432088846
  // B: 9483730408799505
  // y: 10000000000000000000000000000
  // z: 22247448713915602419910470490
  const exampleEncodedStrategy: EncodedStrategy = {
    id: BigNumber.from(1),
    ...encodeStrategy(exampleStrategy),
  };

  describe('castToUniV3', () => {
    it('should correctly convert a Carbon strategy to Uniswap V3 format', () => {
      const uniV3Strategy = castToUniV3(exampleEncodedStrategy);

      // Verify pool configuration
      expect(uniV3Strategy.pool.xAxisToken).to.equal('0xSHIB');
      expect(uniV3Strategy.pool.yAxisToken).to.equal('0xWBTC');
      expect(uniV3Strategy.pool.tickSpacing).to.equal(1);

      // Verify sell order position
      const sellOrder = uniV3Strategy.sellOrder;
      expect(sellOrder.tickLower).to.be.a('number');
      expect(sellOrder.tickUpper).to.be.a('number');
      expect(sellOrder.tickUpper).to.be.greaterThan(sellOrder.tickLower);
      expect(sellOrder.liquidity).to.be.a('string');
      expect(new Decimal(sellOrder.liquidity).gt(0)).to.be.true;

      // Verify buy order position
      const buyOrder = uniV3Strategy.buyOrder;
      expect(buyOrder.tickLower).to.be.a('number');
      expect(buyOrder.tickUpper).to.be.a('number');
      expect(buyOrder.tickUpper).to.be.greaterThan(buyOrder.tickLower);
      expect(buyOrder.liquidity).to.be.a('string');
      expect(new Decimal(buyOrder.liquidity).gt(0)).to.be.true;

      // Verify relative positioning of orders
      expect(buyOrder.tickUpper).to.be.greaterThan(sellOrder.tickUpper);
    });

    it('should handle zero liquidity orders', () => {
      const zeroLiquidityStrategy: DecodedStrategy = {
        ...exampleStrategy,
        order0: {
          ...exampleStrategy.order0,
          liquidity: '0',
        },
        order1: {
          ...exampleStrategy.order1,
          lowestRate: '0',
          highestRate: '0',
          marginalRate: '0',
        },
      };

      const zeroLiquidityStrategyEncoded: EncodedStrategy = {
        id: BigNumber.from(1),
        ...encodeStrategy(zeroLiquidityStrategy),
      };

      const uniV3Strategy = castToUniV3(zeroLiquidityStrategyEncoded);

      expect(uniV3Strategy.sellOrder.liquidity).to.equal('0');
      expect(uniV3Strategy.buyOrder.liquidity).not.to.equal('0');
    });

    it('should maintain price ordering when converting to ticks', () => {
      const uniV3Strategy = castToUniV3(exampleEncodedStrategy);

      // Verify tick ordering matches price ordering
      expect(uniV3Strategy.sellOrder.tickUpper).to.be.greaterThan(
        uniV3Strategy.sellOrder.tickLower
      );
      expect(uniV3Strategy.buyOrder.tickUpper).to.be.greaterThan(
        uniV3Strategy.buyOrder.tickLower
      );
    });

    it('should correctly convert an encoded Carbon strategy to Uniswap V3 format', () => {
      const uniV3Strategy = castToUniV3(exampleEncodedStrategy);

      expect(uniV3Strategy.pool.xAxisToken).to.equal('0xSHIB');
      expect(uniV3Strategy.pool.yAxisToken).to.equal('0xWBTC');
      expect(uniV3Strategy.pool.tickSpacing).to.equal(1);

      expect(uniV3Strategy.sellOrder.tickUpper).to.be.greaterThan(
        uniV3Strategy.sellOrder.tickLower
      );
      expect(uniV3Strategy.buyOrder.tickUpper).to.be.greaterThan(
        uniV3Strategy.buyOrder.tickLower
      );
      expect(uniV3Strategy.buyOrder.tickUpper).to.be.greaterThan(
        uniV3Strategy.sellOrder.tickUpper
      );
    });

    it('should handle encoded strategies with zero liquidity', () => {
      const zeroLiquidityStrategy: EncodedStrategy = {
        ...exampleEncodedStrategy,
        order0: {
          ...exampleEncodedStrategy.order0,
          y: BigNumber.from(0),
          z: BigNumber.from(0),
        },
      };

      const uniV3Strategy = castToUniV3(zeroLiquidityStrategy);
      expect(uniV3Strategy.sellOrder.liquidity).to.equal('0');
      expect(uniV3Strategy.buyOrder.liquidity).not.to.equal('0');
    });

    it('should correctly handle limit orders where A is 0', () => {
      // Create a limit order by setting A to 0 (lowestRate === marginalRate === highestRate)
      const limitOrderStrategy: EncodedStrategy = {
        ...exampleEncodedStrategy,
        order0: {
          ...exampleEncodedStrategy.order0,
          A: BigNumber.from(0), // This makes it a limit order
          B: BigNumber.from(22290), // Keep the same B value
          y: BigNumber.from(400000000),
          z: BigNumber.from(737165668),
        },
      };

      const uniV3Strategy = castToUniV3(limitOrderStrategy);

      // For a limit order with A=0, the liquidity should be MAX_UINT256
      expect(uniV3Strategy.sellOrder.liquidity).to.equal(
        '115792089237316195423570985008687907853269984665640564039457584007913129639935' // MAX_UINT256
      );

      // Verify that the ticks are still properly ordered
      expect(uniV3Strategy.sellOrder.tickUpper).to.be.greaterThanOrEqual(
        uniV3Strategy.sellOrder.tickLower
      );

      // For a limit order, the ticks might be the same or very close
      // Let's verify the tick difference is small (could be 0 or 1 due to rounding)
      const tickDifference =
        uniV3Strategy.sellOrder.tickUpper - uniV3Strategy.sellOrder.tickLower;
      expect(tickDifference).to.be.lessThanOrEqual(1);
    });
  });

  describe('batchCasToUniV3', () => {
    it('should convert multiple encoded strategies', () => {
      const strategies = [
        exampleEncodedStrategy,
        {
          ...exampleEncodedStrategy,
          token0: '0xWBTC2',
          token1: '0xSHIB2',
        },
      ];

      const uniV3Strategies = batchCastToUniV3(strategies);

      expect(uniV3Strategies).to.have.length(2);
      expect(uniV3Strategies[0].pool.xAxisToken).to.equal('0xSHIB');
      expect(uniV3Strategies[1].pool.xAxisToken).to.equal('0xSHIB2');
    });

    it('should handle empty array', () => {
      const uniV3Strategies = batchCastToUniV3([]);
      expect(uniV3Strategies).to.have.length(0);
    });

    it('should handle array with mixed liquidity strategies', () => {
      const strategies = [
        exampleEncodedStrategy,
        {
          ...exampleEncodedStrategy,
          order0: {
            ...exampleEncodedStrategy.order0,
            y: BigNumber.from(0),
            z: BigNumber.from(0),
          },
        },
      ];

      const uniV3Strategies = batchCastToUniV3(strategies);

      expect(uniV3Strategies).to.have.length(2);
      expect(new Decimal(uniV3Strategies[0].sellOrder.liquidity).gt(0)).to.be
        .true;
      expect(uniV3Strategies[1].sellOrder.liquidity).to.equal('0');
    });
  });
});
