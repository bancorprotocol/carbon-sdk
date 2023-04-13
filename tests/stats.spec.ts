import { expect } from 'chai';
import { Decimal } from '../src/utils/numerics';
import { DecodedOrder } from '../src/common/types';
import {
  getMinRate,
  getMaxRate,
  getDepths,
} from '../src/strategy-management/stats';

describe('Stats', () => {
  const orders: DecodedOrder[] = [
    {
      liquidity: '100',
      lowestRate: '10',
      marginalRate: '15',
      highestRate: '20',
    },
    {
      liquidity: '200',
      lowestRate: '5',
      marginalRate: '10',
      highestRate: '15',
    },
  ];

  describe('getMinRate', () => {
    it('should return the lowest rate from the orders', () => {
      const minRate = getMinRate(orders);
      expect(minRate.toString()).to.equal('5');
    });
  });

  describe('getMaxRate', () => {
    it('should return the highest rate from the orders', () => {
      const maxRate = getMaxRate(orders);
      expect(maxRate.toString()).to.equal('15');
    });
  });

  describe('getDepths', () => {
    it('should return 0 if rate is higher than the highest rate in the orders', () => {
      const rate = new Decimal('25');
      const depths = getDepths(orders, [rate]);
      expect(depths[0].toString()).to.equal('0');
    });

    it('should return the sum of all liquidity if rate is lower than the lowest rate in the orders', () => {
      const rate = new Decimal('2');
      const depths = getDepths(orders, [rate]);
      expect(depths[0].toString()).to.equal('300');
    });

    it('should return correct depth for an order with marginal rate equal to lowest rate', () => {
      const order: DecodedOrder = {
        liquidity: '100',
        lowestRate: '5',
        marginalRate: '5',
        highestRate: '10',
      };
      const rate = new Decimal('5');
      const depths = getDepths([order], [rate]);
      expect(depths[0].toString()).to.equal('100');
    });

    it('should return correct depth for an order with marginal rate equal to highest rate', () => {
      const order: DecodedOrder = {
        liquidity: '100',
        lowestRate: '5',
        marginalRate: '10',
        highestRate: '10',
      };
      const rate = new Decimal('10');
      const depths = getDepths([order], [rate]);
      expect(depths[0].toString()).to.equal('0');
    });
  });
});
