import { expect } from 'chai';
import sinon from 'sinon';
import { ChainSync } from '../src/chain-cache/ChainSync';
import { ChainCache } from '../src/chain-cache/ChainCache';
import { initSyncedCache } from '../src/chain-cache';
import { EncodedStrategy, Fetcher, TokenPair } from '../src/common/types';

describe('ChainSync', () => {
  let chainSync: ChainSync;
  let chainCache: ChainCache;
  let mockFetcher: Fetcher;
  let extraStopHandles: Array<() => void>;

  const mockEncodedStrategy: EncodedStrategy = {
    id: 1n,
    token0: '0x123',
    token1: '0x456',
    owner: undefined,
    order0: {
      y: 100n,
      z: 200n,
      A: 300n,
      B: 400n,
    },
    order1: {
      y: 500n,
      z: 600n,
      A: 700n,
      B: 800n,
    },
  };

  const buildSerializedCache = (
    owner: string,
    blockNumber: number,
    strategyId: bigint = 1n
  ) => {
    const cache = new ChainCache();
    cache.addPair(mockEncodedStrategy.token0, mockEncodedStrategy.token1, [
      { ...mockEncodedStrategy, id: strategyId, owner },
    ]);
    cache.addPairFees(mockEncodedStrategy.token0, mockEncodedStrategy.token1, 7);
    cache.applyEvents([], blockNumber);
    return cache.serialize();
  };

  beforeEach(() => {
    extraStopHandles = [];
    chainCache = new ChainCache();
    chainCache.applyEvents([], 10);
    mockFetcher = {
      getBlockNumber: async () => chainCache.getLatestBlockNumber() + 1,
      getEvents: async () => [
        {
          type: 'StrategyCreated',
          blockNumber: chainCache.getLatestBlockNumber() + 1,
          logIndex: 0,
          data: mockEncodedStrategy,
        },
      ],
      pairs: async () => [
        ['0x789', '0xabc'],
        ['0x123', '0x456'],
      ],
      strategiesByPair: async (_token0: string, _token1: string) => [
        { ...mockEncodedStrategy, id: 2n },
        { ...mockEncodedStrategy, id: 3n },
      ],
      strategiesByPairs: async (_pairs: TokenPair[]) => [
        {
          pair: ['0x123', '0x456'],
          strategies: [
            { ...mockEncodedStrategy, id: 2n },
            { ...mockEncodedStrategy, id: 3n },
          ],
        },
      ],
      pairTradingFeePPM: async (_token0: string, _token1: string) => 0,
      tradingFeePPM: async () => 0,
      onTradingFeePPMUpdated: async () => {},
      getBlock: async (blockNumber: number) => ({
        number: blockNumber,
        hash: '0x123456',
      }),
      pairsTradingFeePPM: sinon.stub().resolves([]),
    };
    chainSync = new ChainSync(chainCache, {
      mode: 'chain',
      fetcher: mockFetcher,
    });
  });

  afterEach(() => {
    chainSync.stop();
    extraStopHandles.forEach((stop) => stop());
    extraStopHandles = [];
    sinon.restore();
  });

  describe('_syncEvents', () => {
    it('should process StrategyCreated events correctly', async () => {
      await chainSync.startDataSync();

      // wait until chainCache emits onPairDataChanged
      await new Promise((resolve) => {
        chainCache.on('onPairDataChanged', resolve);
      });

      const strategies =
        (await chainCache.getStrategiesByPair(
          mockEncodedStrategy.token0,
          mockEncodedStrategy.token1
        )) ?? [];
      expect(strategies).to.have.length(3);
      expect(strategies[2]).to.deep.equal(mockEncodedStrategy);
    });

    it('should process StrategyUpdated events correctly', async () => {
      // First let it read the two existing strategies
      mockFetcher.getEvents = async () => [];
      await chainSync.startDataSync();

      const updatedStrategy = {
        ...mockEncodedStrategy,
        id: 2n,
        order0: {
          ...mockEncodedStrategy.order0,
          y: 150n,
        },
      };
      // Then update the second strategy
      mockFetcher.getEvents = async () => [
        {
          type: 'StrategyUpdated',
          blockNumber: chainCache.getLatestBlockNumber() + 1,
          logIndex: 0,
          data: updatedStrategy,
        },
      ];

      // wait until chainCache emits onPairDataChanged
      await new Promise((resolve) => {
        chainCache.on('onPairDataChanged', resolve);
      });

      const strategies =
        (await chainCache.getStrategiesByPair(
          mockEncodedStrategy.token0,
          mockEncodedStrategy.token1
        )) ?? [];
      expect(strategies).to.have.length(2);
      expect(strategies[1]).to.deep.equal(updatedStrategy);
    });

    it('should process StrategyDeleted events correctly', async () => {
      // First let it read the two existing strategies
      mockFetcher.getEvents = async () => [];
      await chainSync.startDataSync();

      // Then delete both strategies
      mockFetcher.getEvents = async () => [
        {
          type: 'StrategyDeleted',
          blockNumber: chainCache.getLatestBlockNumber() + 1,
          logIndex: 0,
          data: { ...mockEncodedStrategy, id: 2n },
        },
        {
          type: 'StrategyDeleted',
          blockNumber: chainCache.getLatestBlockNumber() + 1,
          logIndex: 1,
          data: { ...mockEncodedStrategy, id: 3n },
        },
      ];

      // wait until chainCache emits onPairDataChanged
      await new Promise((resolve) => {
        chainCache.on('onPairDataChanged', resolve);
      });

      const strategies =
        (await chainCache.getStrategiesByPair(
          mockEncodedStrategy.token0,
          mockEncodedStrategy.token1
        )) ?? [];
      expect(strategies).to.have.length(0);
    });

    it('should process TradingFeePPMUpdated events correctly', async () => {
      mockFetcher.getEvents = async () => [
        {
          type: 'TradingFeePPMUpdated',
          blockNumber: chainCache.getLatestBlockNumber() + 1,
          logIndex: 0,
          data: 100,
        },
        // this is just to have the event to emit onPairDataChanged
        {
          type: 'StrategyCreated',
          blockNumber: chainCache.getLatestBlockNumber() + 1,
          logIndex: 1,
          data: mockEncodedStrategy,
        },
      ];

      await chainSync.startDataSync();

      // wait until chainCache emits onPairDataChanged
      await new Promise((resolve) => {
        chainCache.on('onPairDataChanged', resolve);
      });

      // sleep to let the event to be processed and the sync to continue
      await new Promise((resolve) => setTimeout(resolve, 1));

      // Verify that pairsTradingFeePPM was called with all pairs
      const pairsTradingFeePPM =
        mockFetcher.pairsTradingFeePPM as sinon.SinonStub;
      expect(pairsTradingFeePPM.callCount).to.equal(2);
    });

    it('should process PairTradingFeePPMUpdated events correctly', async () => {
      const feeUpdate: [string, string, number] = ['0x123', '0x456', 100];
      mockFetcher.getEvents = async () => [
        {
          type: 'PairTradingFeePPMUpdated',
          blockNumber: chainCache.getLatestBlockNumber() + 1,
          logIndex: 0,
          data: feeUpdate,
        },
        // this is just to have the event to emit onPairDataChanged
        {
          type: 'StrategyCreated',
          blockNumber: chainCache.getLatestBlockNumber() + 1,
          logIndex: 1,
          data: mockEncodedStrategy,
        },
      ];

      await chainSync.startDataSync();

      // wait until chainCache emits onPairDataChanged
      await new Promise((resolve) => {
        chainCache.on('onPairDataChanged', resolve);
      });

      const fee = await chainCache.getTradingFeePPMByPair(
        feeUpdate[1],
        feeUpdate[0]
      );
      expect(fee).to.equal(feeUpdate[2]);
    });

    it('should handle multiple StrategyUpdated events for the same strategy', async () => {
      // Update the same strategy multiple times
      mockFetcher.getEvents = async () => [
        {
          type: 'StrategyUpdated',
          blockNumber: chainCache.getLatestBlockNumber() + 1,
          logIndex: 0,
          data: {
            ...mockEncodedStrategy,
            id: 2n,
            order0: {
              ...mockEncodedStrategy.order0,
              y: 150n,
            },
          },
        },
        {
          type: 'StrategyUpdated',
          blockNumber: chainCache.getLatestBlockNumber() + 1,
          logIndex: 1,
          data: {
            ...mockEncodedStrategy,
            id: 2n,
            order0: {
              ...mockEncodedStrategy.order0,
              y: 200n,
            },
          },
        },
      ];
      await chainSync.startDataSync();

      // wait until chainCache emits onPairDataChanged
      await new Promise((resolve) => {
        chainCache.on('onPairDataChanged', resolve);
      });

      const strategies =
        (await chainCache.getStrategiesByPair(
          mockEncodedStrategy.token0,
          mockEncodedStrategy.token1
        )) ?? [];
      expect(strategies).to.have.length(2);
      expect(strategies[1].order0.y.toString()).to.equal('200');
    });

    it('should handle StrategyCreated followed by StrategyDeleted', async () => {
      mockFetcher.getEvents = async () => [
        {
          type: 'StrategyCreated',
          blockNumber: chainCache.getLatestBlockNumber() + 1,
          logIndex: 0,
          data: mockEncodedStrategy,
        },
        {
          type: 'StrategyDeleted',
          blockNumber: chainCache.getLatestBlockNumber() + 1,
          logIndex: 1,
          data: mockEncodedStrategy,
        },
      ];
      await chainSync.startDataSync();

      // wait until chainCache emits onPairDataChanged
      await new Promise((resolve) => {
        chainCache.on('onPairDataChanged', resolve);
      });

      const strategies = await chainCache.getStrategiesByPair(
        mockEncodedStrategy.token0,
        mockEncodedStrategy.token1
      );
      expect(strategies).to.have.length(2);
    });
  });

  describe('API polling mode', () => {
    it('should hydrate the cache from the polling API without reading from the chain', async () => {
      const fetcherSpies = {
        getBlockNumber: sinon.stub().resolves(999),
        getEvents: sinon.stub().resolves([]),
        pairs: sinon.stub().resolves([]),
        strategiesByPair: sinon.stub().resolves([]),
        strategiesByPairs: sinon.stub().resolves([]),
        pairTradingFeePPM: sinon.stub().resolves(0),
        tradingFeePPM: sinon.stub().resolves(0),
        onTradingFeePPMUpdated: sinon.stub(),
        getBlock: sinon.stub().resolves({ number: 0, hash: '0x0' }),
        pairsTradingFeePPM: sinon.stub().resolves([]),
      };
      chainSync = new ChainSync(chainCache, {
        mode: 'polling',
        cacheSyncApi: async () => buildSerializedCache('0xowner', 12),
        pollingIntervalMs: 1000,
      });

      await chainSync.startDataSync();

      expect(fetcherSpies.getBlockNumber.called).to.be.false;
      expect(fetcherSpies.pairs.called).to.be.false;
      expect(await chainCache.getStrategiesByPair('0x123', '0x456')).to.deep
        .equal([{ ...mockEncodedStrategy, owner: '0xowner' }]);
      expect(chainCache.getStrategyById(1n)?.owner).to.equal('0xowner');
    });

    it('should keep polling and refresh the cache snapshot', async () => {
      const clock = sinon.useFakeTimers();
      let pollCount = 0;
      chainSync = new ChainSync(chainCache, {
        mode: 'polling',
        cacheSyncApi: async () => {
          pollCount += 1;
          return buildSerializedCache(
            pollCount === 1 ? '0xowner1' : '0xowner2',
            10 + pollCount
          );
        },
        pollingIntervalMs: 50,
      });

      let onPairDataChangedCalls = 0;
      chainCache.on('onPairDataChanged', () => {
        onPairDataChangedCalls += 1;
      });

      await chainSync.startDataSync();
      expect(chainCache.getStrategyById(1n)?.owner).to.equal('0xowner1');
      expect(onPairDataChangedCalls).to.equal(1);

      await clock.tickAsync(50);

      expect(chainCache.getStrategyById(1n)?.owner).to.equal('0xowner2');
      expect(onPairDataChangedCalls).to.equal(2);
      clock.restore();
    });

    it('should not configure blockchain cache misses when initialized in polling mode', async () => {
      const missFetcher = {
        ...mockFetcher,
        strategiesByPair: sinon.stub().rejects(new Error('should not be called')),
      };
      const { cache, startDataSync, stopDataSync } = initSyncedCache({
        mode: 'polling',
        cacheSyncApi: async () => buildSerializedCache('0xowner', 15),
        pollingIntervalMs: 1000,
      });
      extraStopHandles.push(stopDataSync);

      expect(await cache.getStrategiesByPair('0x123', '0x456')).to.be.undefined;

      await startDataSync();

      expect(missFetcher.strategiesByPair.called).to.be.false;
      expect(cache.getStrategyById(1n)?.owner).to.equal('0xowner');
    });
  });
});
