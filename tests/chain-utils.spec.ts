import { PayableOverrides } from '../src/common/types';
import { expect } from 'chai';
import { buildTradeOverrides } from '../src/contracts-api/utils';
import { TradeAction } from '../src/common/types';

describe('buildTradeOverrides', () => {
  it('should return the overrides object with the value property set to the sum of the trade amounts when token is an ETH address', () => {
    const token = '0x123';
    const tokenEth = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
    const tradeActions = [
      { amount: 1n },
      { amount: 2n },
      { amount: 3n },
    ];
    const overrides: PayableOverrides = { gasLimit: 1000000 };
    expect(
      buildTradeOverrides(
        token,
        tradeActions as TradeAction[],
        false,
        -1,
        overrides
      ).value?.toString()
    ).to.equal(undefined);
    expect(
      buildTradeOverrides(
        tokenEth,
        tradeActions as TradeAction[],
        false,
        -1,
        overrides
      ).value?.toString()
    ).to.equal('6');
  });
});
