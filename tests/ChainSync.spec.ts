import { expect } from 'chai';
import sinon from 'sinon';
import { ChainSync } from '../src/chain-cache/ChainSync';
import { ChainCache } from '../src/chain-cache/ChainCache';
import { EncodedStrategy, Fetcher, TokenPair } from '../src/common/types';

describe('ChainSync', () => {
  let chainSync: ChainSync;
  let chainCache: ChainCache;
  let mockFetcher: Fetcher;

  const mockEncodedStrategy: EncodedStrategy = {
    id: 1n,
    token0: '0x123',
    token1: '0x456',
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

  beforeEach(() => {
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
    chainSync = new ChainSync(mockFetcher, chainCache);
  });

  afterEach(() => {
    chainSync.stop();
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
});
