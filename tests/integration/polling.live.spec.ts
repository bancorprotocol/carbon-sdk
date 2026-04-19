import { expect } from 'chai';
import { initSyncedCache } from '../../src/chain-cache';
import {
  LIVE_POLLING_INTERVAL_MS,
  LIVE_POLLING_REFRESH_TIMEOUT_MS,
  LIVE_TEST_TIMEOUT_MS,
  requireEnvOrSkip,
  waitForCondition,
} from './live-test-utils';

describe('Live polling integration', function () {
  this.timeout(LIVE_TEST_TIMEOUT_MS);

  let pollingApiUrl: string;

  before(function () {
    pollingApiUrl = requireEnvOrSkip(this, 'CARBON_SDK_TEST_POLLING_API_URL');
  });

  it('hydrates the cache from a real polling endpoint and refreshes on a later poll', async () => {
    const { cache, startDataSync, stopDataSync } = initSyncedCache({
      mode: 'polling',
      cacheSyncApi: pollingApiUrl,
      pollingIntervalMs: LIVE_POLLING_INTERVAL_MS,
    });

    try {
      await startDataSync();

      expect(cache.isCacheInitialized()).to.equal(true);
      const initialBlockNumber = cache.getLatestBlockNumber();
      expect(initialBlockNumber).to.be.greaterThan(0);

      const cachedPairs = cache.getCachedPairs();
      expect(cachedPairs.length).to.be.greaterThan(0);

      const [token0, token1] = cachedPairs[0];
      const strategies = await cache.getStrategiesByPair(token0, token1);

      expect(strategies).to.not.be.undefined;
      expect((strategies ?? []).length).to.be.greaterThan(0);

      await waitForCondition(
        () => cache.getLatestBlockNumber() > initialBlockNumber,
        LIVE_POLLING_REFRESH_TIMEOUT_MS,
        LIVE_POLLING_INTERVAL_MS
      );

      expect(cache.getLatestBlockNumber()).to.be.greaterThan(initialBlockNumber);
    } finally {
      stopDataSync();
    }
  });
});
