import { expect } from 'chai';
import { ContractsApi } from '../../src/contracts-api';
import { initSyncedCache } from '../../src/chain-cache';
import {
  createTenderlyProvider,
  findPairWithStrategies,
  LIVE_CHAIN_SYNC_BATCH_SIZE,
  LIVE_CHAIN_SYNC_CHUNK_SIZE,
  LIVE_CHAIN_SYNC_WAIT_MS,
  LIVE_TEST_TIMEOUT_MS,
  requireEnvOrSkip,
} from './live-test-utils';

describe('Live Tenderly RPC integration', function () {
  this.timeout(LIVE_TEST_TIMEOUT_MS);

  let rpcUrl: string;

  before(function () {
    rpcUrl = requireEnvOrSkip(this, 'CARBON_SDK_TEST_TENDERLY_RPC_URL');
  });

  it('smoke-tests reader calls and chain sync against Tenderly', async () => {
    const provider = createTenderlyProvider(rpcUrl);
    const api = new ContractsApi(provider);

    const blockNumber = await api.reader.getBlockNumber();
    expect(blockNumber).to.be.greaterThan(0);

    const pairs = await api.reader.pairs();
    expect(pairs.length).to.be.greaterThan(0);

    const pairWithStrategies = await findPairWithStrategies(
      pairs,
      api.reader.strategiesByPair.bind(api.reader)
    );

    expect(pairWithStrategies).to.not.be.undefined;
    expect(pairWithStrategies?.strategies.length ?? 0).to.be.greaterThan(0);

    const { cache, startDataSync, stopDataSync } = initSyncedCache({
      mode: 'chain',
      fetcher: api.reader,
      numOfPairsToBatch: LIVE_CHAIN_SYNC_BATCH_SIZE,
      msToWaitBetweenSyncs: LIVE_CHAIN_SYNC_WAIT_MS,
      chunkSize: LIVE_CHAIN_SYNC_CHUNK_SIZE,
    });

    try {
      await startDataSync();

      expect(cache.isCacheInitialized()).to.equal(true);
      expect(cache.getLatestBlockNumber()).to.be.greaterThan(0);
      expect(cache.getCachedPairs().length).to.be.greaterThan(0);
      const [token0, token1] = cache.getCachedPairs()[0];
      const strategies = await cache.getStrategiesByPair(token0, token1);
      expect(strategies).to.not.be.undefined;
      expect((strategies ?? []).length).to.be.greaterThan(0);
    } finally {
      stopDataSync();
    }
  });
});
