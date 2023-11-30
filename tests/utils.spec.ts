import { expect } from 'chai';
import {
  formatUnits,
  parseUnits,
  BigNumber,
  Decimal,
  trimDecimal,
} from '../src/utils/numerics';
import {
  normalizeRate,
  normalizeInvertedRate,
  subtractFee,
  addFee,
  calculateOverlappingBuyBudget,
  calculateOverlappingSellBudget,
  calculateOverlappingPriceRanges,
} from '../src/strategy-management';
import { isAlmostEqual } from './test-utils';

describe('utils', () => {
  describe('overlapping strategies', () => {
    const testCases = [
      {
        baseTokenDecimals: 18,
        quoteTokenDecimals: 6,
        buyPriceLow: new Decimal('1500'),
        sellPriceHigh: new Decimal('2000'),
        marketPrice: new Decimal('1600'),
        spreadPercentage: new Decimal('0.1'),
        spread: new Decimal('0.5'),
        buyBudget: new Decimal('100'),
        buyPriceHigh: new Decimal('1999.5'),
        sellPriceLow: new Decimal('1500.5'),
        buyPriceMarginal: new Decimal('1599.75'),
        sellPriceMarginal: new Decimal('1600.25'),
        sellBudget: new Decimal('0.231403132822275197'),
      },
      {
        baseTokenDecimals: 18,
        quoteTokenDecimals: 6,
        buyPriceLow: new Decimal('0.005'),
        sellPriceHigh: new Decimal('0.03'),
        marketPrice: new Decimal('0.007241'),
        spreadPercentage: new Decimal('0.1'),
        spread: new Decimal('0.000025'),
        buyBudget: new Decimal('3090.190579'),
        buyPriceHigh: new Decimal('0.029975'),
        sellPriceLow: new Decimal('0.005025'),
        buyPriceMarginal: new Decimal('0.0072285'),
        sellPriceMarginal: new Decimal('0.0072535'),
        sellBudget: new Decimal('2576455.281630354877824211'),
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
        spread,
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
          const prices = calculateOverlappingPriceRanges(
            buyPriceLow,
            sellPriceHigh,
            marketPrice,
            spreadPercentage
          );

          expect(prices.buyPriceHigh.toString()).to.equal(
            buyPriceHigh.toString()
          );
          expect(prices.sellPriceLow.toString()).to.equal(
            sellPriceLow.toString()
          );
          expect(prices.buyPriceMarginal.toString()).to.equal(
            buyPriceMarginal.toString()
          );
          expect(prices.sellPriceMarginal.toString()).to.equal(
            sellPriceMarginal.toString()
          );
          expect(prices.spread.toString()).to.equal(spread.toString());

          const sellRes = calculateOverlappingSellBudget(
            buyPriceLow,
            sellPriceHigh,
            marketPrice,
            spreadPercentage,
            buyBudget
          );
          expect(trimDecimal(sellRes.toString(), baseTokenDecimals)).to.equal(
            sellBudget.toString()
          );

          const buyRes = calculateOverlappingBuyBudget(
            buyPriceLow,
            sellPriceHigh,
            marketPrice,
            spreadPercentage,
            sellBudget
          );
          expect(
            ...isAlmostEqual(
              buyRes.toString(),
              buyBudget.toString(),
              '100',
              '0.0003'
            )
          ).to.be.true;
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
      const amount = BigNumber.from(1000);
      const tradingFeePPM = 50000;
      const expected = '1053';

      const result = addFee(amount, tradingFeePPM);

      expect(result.toFixed()).to.equal(expected);
    });

    it('should return zero for zero amount', () => {
      const amount = BigNumber.from(0);
      const tradingFeePPM = 50000;
      const expected = '0';

      const result = addFee(amount, tradingFeePPM);

      expect(result.toFixed()).to.equal(expected);
    });

    it('should return the same amount for zero tradingFeePPM', () => {
      const amount = BigNumber.from(1000);
      const tradingFeePPM = 0;
      const expected = '1000';

      const result = addFee(amount, tradingFeePPM);

      expect(result.toFixed()).to.equal(expected);
    });
  });

  describe('subtractFee', () => {
    it('subtracts fee correctly', () => {
      const amount = BigNumber.from(10000000);
      const tradingFeePPM = 5000;
      const result = subtractFee(amount, tradingFeePPM);

      expect(result.toString()).to.equal('9950000');
    });

    it('returns 0 when amount is 0', () => {
      const amount = BigNumber.from(0);
      const tradingFeePPM = 10000;
      const result = subtractFee(amount, tradingFeePPM);

      expect(result.toString()).to.equal('0');
    });

    it('returns the same amount when tradingFeePPM is 0', () => {
      const amount = BigNumber.from(1000000000000000000n);
      const tradingFeePPM = 0;
      const result = subtractFee(amount, tradingFeePPM);

      expect(result.toString()).to.equal(amount.toString());
    });
  });
});
