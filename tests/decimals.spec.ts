import { expect } from 'chai';
import sinon from 'sinon';
import { Decimals } from '../src/utils/decimals';

describe('Decimals', () => {
  let fetcher: sinon.SinonStub<[string], Promise<number | undefined>>;
  let decimals: Decimals;

  beforeEach(() => {
    fetcher = sinon
      .stub<[string], Promise<number | undefined>>()
      .callsFake(async (address: string): Promise<number | undefined> => {
        const decimalsMap: Record<string, number> = {
          '0x1': 18,
          '0x2': 6,
        };

        return decimalsMap[address];
      });

    decimals = new Decimals(fetcher);
  });

  it('should fetch decimals correctly', async () => {
    const fetchedDecimals = await decimals.fetchDecimals('0x1');
    expect(fetchedDecimals).to.equal(18);
  });

  it('should cache decimals after fetching', async () => {
    await decimals.fetchDecimals('0x1');
    const cache = (decimals as any)._cachedDecimals;
    expect(cache.get('0x1')).to.equal(18);
  });

  it('should return cached decimals without calling the fetcher again', async () => {
    await decimals.fetchDecimals('0x1');
    expect(fetcher.callCount).to.equal(1);

    const fetchedDecimals = await decimals.fetchDecimals('0x1');
    expect(fetchedDecimals).to.equal(18);
    expect(fetcher.callCount).to.equal(1);
  });

  it('should throw an error when decimals cannot be fetched', async () => {
    try {
      await decimals.fetchDecimals('0xUnknown');
      expect.fail('Expected an error to be thrown');
    } catch (error: any) {
      expect(error.message).to.equal(
        'Could not fetch decimals for token 0xUnknown'
      );
    }
  });
});
