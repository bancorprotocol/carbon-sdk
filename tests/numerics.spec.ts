import { expect } from 'chai';
import { trimDecimal } from '../src/utils/numerics';

describe('numerics', () => {
  describe('trimDecimal', () => {
    const testCases: [string, number, string][] = [
      ['1', 10, '1'],
      ['0.01', 10, '0.01'],
      ['1000', 10, '1000'],
      ['0', 10, '0'],
      ['0.00001', 2, '0'],
      ['0.1234', 2, '0.12'],
      ['-1.2345', 2, '-1.23'],
      ['1.999', 0, '1'],
      ['12345678901234567891.23456789123456789123456789', 18, '12345678901234567891.234567891234567891'],
    ];
    testCases.forEach(([amount, precision, expectedResult]) => {
      it(`should trim decimal ${amount} with precision ${precision} and get ${expectedResult}`, () => {
        expect(trimDecimal(amount, precision)).to.equal(expectedResult);
      });
    });
  });
});
