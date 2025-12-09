import { expect } from 'chai';
import {
  formatUnits,
  parseUnits,
  Decimal,
} from '../src/utils/numerics';
import {
  normalizeRate,
  normalizeInvertedRate,
  subtractFee,
  addFee,
  calculateOverlappingBuyBudget,
  calculateOverlappingSellBudget,
  calculateOverlappingPrices,
  enforcePriceRange,
  getMinMaxPricesByDecimals,
  createOrders,
} from '../src/strategy-management';
import { isAlmostEqual } from './test-utils';
import { encodeOrders, lowestPossibleRate } from '../src/utils/encoders';

describe('utils', () => {
  describe('enforcePriceRange', () => {
    const tokenDecimals = 6;
    const minPrice = new Decimal(5);
    const maxPrice = new Decimal(10);
    const oneWei = new Decimal(1).div(new Decimal(10).pow(tokenDecimals));

    it('should return minPrice when marginalPrice is less than minPrice', () => {
      const marginalPrice = minPrice.minus(oneWei);
      const result = enforcePriceRange(minPrice, maxPrice, marginalPrice);
      expect(result.equals(minPrice)).to.be.true;
    });

    it('should return maxPrice when marginalPrice is greater than maxPrice', () => {
      const marginalPrice = maxPrice.plus(oneWei);
      const result = enforcePriceRange(minPrice, maxPrice, marginalPrice);
      expect(result.equals(maxPrice)).to.be.true;
    });

    it('should return marginalPrice when it is between minPrice and maxPrice', () => {
      const marginalPrice = new Decimal(7);
      const result = enforcePriceRange(minPrice, maxPrice, marginalPrice);
      expect(result.equals(marginalPrice)).to.be.true;
    });
  });
  describe('overlapping strategies', () => {
    const testCases = [
      {
        baseTokenDecimals: 18,
        quoteTokenDecimals: 6,
        buyPriceLow: '1500',
        sellPriceHigh: '2000',
        marketPrice: '1845',
        spreadPercentage: '1',
        buyBudget: '100',
        buyPriceHigh:
          '1980.19801980198019801980198019801980198019801980198019801980198019801980198019801980198019801980198',
        sellPriceLow: '1515',
        buyPriceMarginal:
          '1835.843615937429955302430075647665154941937455663234267436323585007036269526077757760470083423519019',
        sellPriceMarginal:
          '1854.202052096804254855454376404141806491356830219866610110686820857106632221338535338074784257754209',
        sellBudget: '0.021054379648026716',
      },
      {
        baseTokenDecimals: 18,
        quoteTokenDecimals: 6,
        buyPriceLow: '1500.0000000000000000001',
        sellPriceHigh: '2000',
        marketPrice: '1845',
        spreadPercentage: '1',
        buyBudget: '100',
        buyPriceHigh:
          '1980.19801980198019801980198019801980198019801980198019801980198019801980198019801980198019801980198',
        sellPriceLow: '1515.000000000000000000101',
        buyPriceMarginal:
          '1835.843615937429955302430075647665154941937455663234267436323585007036269526077757760470083423519019',
        sellPriceMarginal:
          '1854.202052096804254855454376404141806491356830219866610110686820857106632221338535338074784257754209',
        sellBudget: '0.021054379648026716',
      },
      {
        baseTokenDecimals: 18,
        quoteTokenDecimals: 6,
        buyPriceLow: '5',
        sellPriceHigh: '8',
        marketPrice: '6.58',
        spreadPercentage: '0.1',
        buyBudget: '50000',
        buyPriceHigh:
          '7.992007992007992007992007992007992007992007992007992007992007992007992007992007992007992007992007992',
        sellPriceLow: '5.005',
        buyPriceMarginal:
          '6.576712465445547600936103429637085089831710694731424131317177577135565931870119917241379658190121977',
        sellPriceMarginal:
          '6.5832891779109931485370395330667221749215424054261555554484947547127014978019900371586210378483121',
        sellBudget: '5512.063888540195176921',
      },
    ];

    testCases.forEach(
      ({
        baseTokenDecimals,
        quoteTokenDecimals,
        buyPriceLow,
        sellPriceHigh,
        marketPrice,
        spreadPercentage,
        buyBudget,
        buyPriceHigh,
        sellPriceLow,
        buyPriceMarginal,
        sellPriceMarginal,
        sellBudget,
      }) => {
        it(`should successfully calculate overlapping distribution for inputs: 
            baseTokenDecimals: ${baseTokenDecimals}, quoteTokenDecimals: ${quoteTokenDecimals},
            buyPriceLow: ${buyPriceLow}, sellPriceHigh: ${sellPriceHigh}, 
            marketPrice: ${marketPrice}, spreadPercentage: ${spreadPercentage}, 
            buyBudget: ${buyBudget}`, () => {
          const prices = calculateOverlappingPrices(
            buyPriceLow,
            sellPriceHigh,
            marketPrice,
            spreadPercentage
          );

          expect(prices.buyPriceHigh).to.equal(buyPriceHigh);
          expect(prices.sellPriceLow).to.equal(sellPriceLow);
          expect(prices.buyPriceMarginal).to.equal(buyPriceMarginal);
          expect(prices.sellPriceMarginal).to.equal(sellPriceMarginal);

          const sellRes = calculateOverlappingSellBudget(
            baseTokenDecimals,
            quoteTokenDecimals,
            buyPriceLow,
            sellPriceHigh,
            marketPrice,
            spreadPercentage,
            buyBudget
          );
          expect(sellRes).to.equal(sellBudget);

          const buyRes = calculateOverlappingBuyBudget(
            baseTokenDecimals,
            quoteTokenDecimals,
            buyPriceLow,
            sellPriceHigh,
            marketPrice,
            spreadPercentage,
            sellBudget
          );
          expect(...isAlmostEqual(buyRes, buyBudget, '100', '0.0003')).to.be
            .true;
        });
      }
    );
  });
  describe('parseUnits', () => {
    const testCases = [
      { amount: '1', decimals: 0, expectedResult: '1' },
      { amount: '1000000', decimals: 0, expectedResult: '1000000' },
      { amount: '1.234', decimals: 3, expectedResult: '1234' },
      { amount: '1234567.890', decimals: 3, expectedResult: '1234567890' },
      { amount: '0.000000000000000000', decimals: 18, expectedResult: '0' },
      { amount: '0', decimals: 18, expectedResult: '0' },
      {
        amount: '1000000000000000000',
        decimals: 18,
        expectedResult: '1000000000000000000000000000000000000',
      },
      { amount: '0.000000000000000001', decimals: 18, expectedResult: '1' },
      {
        amount: '1000000000000000001',
        decimals: 18,
        expectedResult: '1000000000000000001000000000000000000',
      },
      {
        amount: '0.000000000000000123',
        decimals: 18,
        expectedResult: '123',
      },
      { amount: '0.12', decimals: 18, expectedResult: '120000000000000000' },
    ];

    testCases.forEach(({ amount, decimals, expectedResult }) => {
      it(`should parse ${amount} with ${decimals} decimals`, () => {
        const result = parseUnits(amount, decimals);
        expect(result.toString()).to.equal(expectedResult);
      });
    });
  });

  describe('formatUnits', () => {
    const testCases = [
      { amount: '1', decimals: 0, expectedResult: '1' },
      { amount: '1000000', decimals: 0, expectedResult: '1000000' },
      { amount: '1234', decimals: 3, expectedResult: '1.234' },
      { amount: '1234567890', decimals: 3, expectedResult: '1234567.89' },
      { amount: '1234', decimals: 4, expectedResult: '0.1234' },
      { amount: '1234567890', decimals: 4, expectedResult: '123456.789' },
      { amount: '0', decimals: 18, expectedResult: '0' },
      {
        amount: '1000000000000000000',
        decimals: 18,
        expectedResult: '1',
      },
      { amount: '1', decimals: 18, expectedResult: '0.000000000000000001' },
    ];

    testCases.forEach(({ amount, decimals, expectedResult }) => {
      it(`should format ${amount} with ${decimals} decimals`, () => {
        const result = formatUnits(amount, decimals);
        expect(result).to.equal(expectedResult);
      });
    });
  });

  describe('parseUnits and formatUnits', () => {
    const testCases = [
      {
        value: '1',
        decimals: 18,
        expectedResult: '1',
      },
      {
        value: '0.01',
        decimals: 6,
        expectedResult: '0.01',
      },
      {
        value: '1000',
        decimals: 12,
        expectedResult: '1000',
      },
      {
        value: '0',
        decimals: 0,
        expectedResult: '0',
      },
    ];

    testCases.forEach(({ value, decimals, expectedResult }) => {
      it(`should correctly parse and format value ${value} with decimals ${decimals}`, () => {
        const parsedValue = parseUnits(value, decimals);
        const formattedValue = formatUnits(parsedValue, decimals);
        expect(formattedValue).to.equal(expectedResult);
      });
    });
  });

  describe('normalizeRate', () => {
    const testCases = [
      {
        buyPrice: '1',
        baseTokenDecimals: 18,
        quoteTokenDecimals: 6,
        expectedResult: '0.000000000001',
      },
      {
        buyPrice: '0.01',
        baseTokenDecimals: 18,
        quoteTokenDecimals: 6,
        expectedResult: '0.00000000000001',
      },
      {
        buyPrice: '1000',
        baseTokenDecimals: 6,
        quoteTokenDecimals: 18,
        expectedResult: '1000000000000000',
      },
      {
        buyPrice: '0',
        baseTokenDecimals: 18,
        quoteTokenDecimals: 6,
        expectedResult: '0',
      },
    ];

    testCases.forEach(
      ({ buyPrice, quoteTokenDecimals, baseTokenDecimals, expectedResult }) => {
        it(`should calculate sell rate for buy price ${buyPrice} with quote token 
      decimals ${quoteTokenDecimals} and base token decimals ${baseTokenDecimals}`, () => {
          const result = normalizeRate(
            buyPrice,
            quoteTokenDecimals,
            baseTokenDecimals
          );
          expect(result).to.equal(expectedResult);
        });
      }
    );
  });

  describe('normalizeInvertedRate', () => {
    const testCases = [
      {
        sellPrice: '1',
        baseTokenDecimals: 18,
        quoteTokenDecimals: 6,
        expectedResult: '1000000000000',
      },
      {
        sellPrice: '0.01',
        baseTokenDecimals: 18,
        quoteTokenDecimals: 6,
        expectedResult: '100000000000000',
      },
      {
        sellPrice: '1000',
        baseTokenDecimals: 6,
        quoteTokenDecimals: 18,
        expectedResult: '0.000000000000001',
      },
      {
        sellPrice: '0',
        baseTokenDecimals: 18,
        quoteTokenDecimals: 6,
        expectedResult: '0',
      },
    ];

    testCases.forEach(
      ({
        sellPrice,
        baseTokenDecimals,
        quoteTokenDecimals,
        expectedResult,
      }) => {
        it(`should calculate sell rate for sell price ${sellPrice} with quote token 
        decimals ${quoteTokenDecimals} and base token decimals ${baseTokenDecimals}`, () => {
          const result = normalizeInvertedRate(
            sellPrice,
            quoteTokenDecimals,
            baseTokenDecimals
          );
          expect(result).to.equal(expectedResult);
        });
      }
    );
  });
  describe('addFee', () => {
    it('should correctly add the fee', () => {
      const amount = 1000n;
      const tradingFeePPM = 50000;
      const expected = '1053';

      const result = addFee(amount, tradingFeePPM);

      expect(result.toFixed()).to.equal(expected);
    });

    it('should return zero for zero amount', () => {
      const amount = 0n;
      const tradingFeePPM = 50000;
      const expected = '0';

      const result = addFee(amount, tradingFeePPM);

      expect(result.toFixed()).to.equal(expected);
    });

    it('should return the same amount for zero tradingFeePPM', () => {
      const amount = 1000n;
      const tradingFeePPM = 0;
      const expected = '1000';

      const result = addFee(amount, tradingFeePPM);

      expect(result.toFixed()).to.equal(expected);
    });
  });

  describe('subtractFee', () => {
    it('subtracts fee correctly', () => {
      const amount = 10000000n;
      const tradingFeePPM = 5000;
      const result = subtractFee(amount, tradingFeePPM);

      expect(result.toString()).to.equal('9950000');
    });

    it('returns 0 when amount is 0', () => {
      const amount = 0n;
      const tradingFeePPM = 10000;
      const result = subtractFee(amount, tradingFeePPM);

      expect(result.toString()).to.equal('0');
    });

    it('returns the same amount when tradingFeePPM is 0', () => {
      const amount = 1000000000000000000n;
      const tradingFeePPM = 0;
      const result = subtractFee(amount, tradingFeePPM);

      expect(result.toString()).to.equal(amount.toString());
    });
  });

  describe('getMinMaxPricesByDecimals', () => {
    [
      {
        baseTokenDecimals: 18,
        quoteTokenDecimals: 6,
      },
      {
        baseTokenDecimals: 6,
        quoteTokenDecimals: 18,
      },
      {
        baseTokenDecimals: 18,
        quoteTokenDecimals: 18,
      },
    ].forEach(({ baseTokenDecimals, quoteTokenDecimals }) => {
      it(`should return the correct min and max prices for ${baseTokenDecimals} and ${quoteTokenDecimals} decimals`, () => {
        const { minBuyPrice, maxSellPrice } = getMinMaxPricesByDecimals(
          baseTokenDecimals,
          quoteTokenDecimals
        );
        const orders = createOrders(
          baseTokenDecimals,
          quoteTokenDecimals,
          minBuyPrice,
          minBuyPrice,
          minBuyPrice,
          '1',
          maxSellPrice,
          maxSellPrice,
          maxSellPrice,
          '1'
        );
        expect(orders.order0.lowestRate).to.equal(
          lowestPossibleRate.toString()
        );
        expect(orders.order1.lowestRate).to.equal(
          lowestPossibleRate.toString()
        );
      });
    });
    it('should return such numbers that any numbers above maxSellPrice and below minBuyPrice lead to zero B in encoded orders', () => {
      const { minBuyPrice, maxSellPrice } = getMinMaxPricesByDecimals(18, 6);
      const smallerMinBuyPrice = new Decimal(minBuyPrice).minus(
        new Decimal(1).div(new Decimal(10).pow(18))
      );
      const largerMaxSellPrice = new Decimal(maxSellPrice).plus(
        new Decimal(1).div(new Decimal(10).pow(6))
      );
      const orders = createOrders(
        18,
        6,
        smallerMinBuyPrice.toString(),
        smallerMinBuyPrice.toString(),
        smallerMinBuyPrice.toString(),
        '1',
        largerMaxSellPrice.toString(),
        largerMaxSellPrice.toString(),
        largerMaxSellPrice.toString(),
        '1'
      );
      const encodedOrders = encodeOrders([orders.order0, orders.order1]);
      expect(encodedOrders[0].B.toString()).to.equal('0');
      expect(encodedOrders[1].B.toString()).to.equal('0');
    });
    it('should return such numbers that any numbers between maxSellPrice and minBuyPrice lead to non-zero B in encoded orders', () => {
      const { minBuyPrice, maxSellPrice } = getMinMaxPricesByDecimals(18, 6);
      const orders = createOrders(
        18,
        6,
        minBuyPrice,
        minBuyPrice,
        minBuyPrice,
        '1',
        maxSellPrice,
        maxSellPrice,
        maxSellPrice,
        '1'
      );
      const encodedOrders = encodeOrders([orders.order0, orders.order1]);
      expect(encodedOrders[0].B.toString()).to.not.equal('0');
      expect(encodedOrders[1].B.toString()).to.not.equal('0');
    });
  });
});
