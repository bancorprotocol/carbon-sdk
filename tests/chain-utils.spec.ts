import { BigNumber, PayableOverrides } from 'ethers';
import { expect } from 'chai';
import { buildTradeOverrides } from '../src/contracts-api/utils';
import { TradeAction } from '../src/common/types';

describe('buildTradeOverrides', () => {
  it('should return the overrides object with the value property set to the sum of the trade amounts when token is an ETH address', () => {
    const token = '0x123';
    const tokenEth = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
    const tradeActions = [
      { amount: BigNumber.from(1) },
      { amount: BigNumber.from(2) },
      { amount: BigNumber.from(3) },
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
