import { expect } from 'chai';
import { BigNumber } from '../src/utils/numerics';
import Reader from '../src/contracts-api/Reader';
import { Contracts } from '../src/contracts-api/Contracts';
import {
  EncodedStrategy,
  TradeData,
  TradingFeeUpdate,
} from '../src/common/types';

describe('Reader', () => {
  let reader: Reader;
  let mockContracts: Contracts;

  const mockEncodedStrategy: EncodedStrategy = {
    id: BigNumber.from(1),
    token0: '0x123',
    token1: '0x456',
    order0: {
      y: BigNumber.from(100),
      z: BigNumber.from(200),
      A: BigNumber.from(300),
      B: BigNumber.from(400),
    },
    order1: {
      y: BigNumber.from(500),
      z: BigNumber.from(600),
      A: BigNumber.from(700),
      B: BigNumber.from(800),
    },
  };

  const mockTradeData: TradeData = {
    trader: '0x789',
    sourceToken: '0x123',
    targetToken: '0x456',
    sourceAmount: '1000',
    targetAmount: '2000',
    tradingFeeAmount: '10',
    byTargetAmount: true,
  };

  const mockTradingFeeUpdate: TradingFeeUpdate = ['0x123', '0x456', 100];

  beforeEach(() => {
    // Create mock contracts with necessary methods
    mockContracts = {
      carbonController: {
        address: '0x123',
        interface: {
          parseLog: (log: { topics: string[]; data: string }) => {
            // Mock event parsing based on topics
            const eventType = log.topics[0];
            switch (eventType) {
              case '0x123': // StrategyCreated
                return {
                  name: 'StrategyCreated',
                  args: mockEncodedStrategy,
                };
              case '0x456': // TokensTraded
                return {
                  name: 'TokensTraded',
                  args: mockTradeData,
                };
              case '0x789': // TradingFeePPMUpdated
                return {
                  name: 'TradingFeePPMUpdated',
                  args: { newFeePPM: 100 },
                };
              case '0xabc': // PairTradingFeePPMUpdated
                return {
                  name: 'PairTradingFeePPMUpdated',
                  args: {
                    token0: mockTradingFeeUpdate[0],
                    token1: mockTradingFeeUpdate[1],
                    newFeePPM: mockTradingFeeUpdate[2],
                  },
                };
              default:
                return null;
            }
          },
        },
      },
      provider: {
        getLogs: async ({
          fromBlock,
          toBlock,
        }: {
          fromBlock: number;
          toBlock: number;
        }) => {
          // Mock logs based on block range
          const logs: {
            blockNumber: number;
            logIndex: number;
            topics: string[];
            data: string;
            blockHash: string;
            transactionIndex: number;
            removed: boolean;
            address: string;
            transactionHash: string;
          }[] = [];
          for (let block = fromBlock; block <= toBlock; block++) {
            // Add multiple events per block with different log indices
            logs.push(
              {
                blockNumber: block,
                logIndex: 0,
                topics: ['0x123'], // StrategyCreated
                data: '0x',
                blockHash: '0x123',
                transactionIndex: 0,
                removed: false,
                address: '0x123',
                transactionHash: '0x456',
              },
              {
                blockNumber: block,
                logIndex: 1,
                topics: ['0x456'], // TokensTraded
                data: '0x',
                blockHash: '0x123',
                transactionIndex: 1,
                removed: false,
                address: '0x123',
                transactionHash: '0x456',
              },
              {
                blockNumber: block,
                logIndex: 2,
                topics: ['0x789'], // TradingFeePPMUpdated
                data: '0x',
                blockHash: '0x123',
                transactionIndex: 2,
                removed: false,
                address: '0x123',
                transactionHash: '0x456',
              },
              {
                blockNumber: block,
                logIndex: 3,
                topics: ['0xabc'], // PairTradingFeePPMUpdated
                data: '0x',
                blockHash: '0x123',
                transactionIndex: 3,
                removed: false,
                address: '0x123',
                transactionHash: '0x456',
              }
            );
          }
          return logs;
        },
      },
    } as unknown as Contracts;

    reader = new Reader(mockContracts);
  });

  describe('getEvents', () => {
    it('should process events from a single chunk', async () => {
      const events = await reader.getEvents(1, 5, 10);
      expect(events).to.have.length(20); // 5 blocks * 4 events per block
      expect(events[0].blockNumber).to.equal(1);
      expect(events[events.length - 1].blockNumber).to.equal(5);
    });

    it('should process events from multiple chunks', async () => {
      const events = await reader.getEvents(1, 15, 5); // 3 chunks of 5 blocks each
      expect(events).to.have.length(60); // 15 blocks * 4 events per block
      expect(events[0].blockNumber).to.equal(1);
      expect(events[events.length - 1].blockNumber).to.equal(15);
    });

    it('should sort events by block number and log index', async () => {
      const events = await reader.getEvents(1, 3, 1); // 3 blocks, 1 block per chunk
      expect(events).to.have.length(12); // 3 blocks * 4 events per block

      // Verify sorting
      for (let i = 1; i < events.length; i++) {
        const prev = events[i - 1];
        const curr = events[i];
        if (prev.blockNumber !== curr.blockNumber) {
          expect(curr.blockNumber).to.be.greaterThan(prev.blockNumber);
        } else {
          expect(curr.logIndex).to.be.greaterThan(prev.logIndex);
        }
      }
    });

    it('should handle different event types correctly', async () => {
      const events = await reader.getEvents(1, 1, 1);
      expect(events).to.have.length(4); // 1 block * 4 events per block

      // Verify event types and data
      expect(events[0].type).to.equal('StrategyCreated');
      expect(events[0].data).to.deep.equal(mockEncodedStrategy);

      expect(events[1].type).to.equal('TokensTraded');
      expect(events[1].data).to.deep.equal(mockTradeData);

      expect(events[2].type).to.equal('TradingFeePPMUpdated');
      expect(events[2].data).to.equal(100);

      expect(events[3].type).to.equal('PairTradingFeePPMUpdated');
      expect(events[3].data).to.deep.equal(mockTradingFeeUpdate);
    });

    it('should handle empty block ranges', async () => {
      const events = await reader.getEvents(5, 4, 1);
      expect(events).to.have.length(0);
    });

    it('should handle invalid events gracefully', async () => {
      // Override the mock contracts to include invalid events
      mockContracts.provider.getLogs = async (_filter) => {
        return [
          {
            blockNumber: 1,
            logIndex: 0,
            topics: ['0xinvalid'], // Invalid event type
            data: '0x',
            blockHash: '0x123',
            transactionIndex: 0,
            removed: false,
            address: '0x123',
            transactionHash: '0x456',
          },
          {
            blockNumber: 1,
            logIndex: 1,
            topics: ['0x123'], // Valid event
            data: '0x',
            blockHash: '0x123',
            transactionIndex: 1,
            removed: false,
            address: '0x123',
            transactionHash: '0x456',
          },
        ];
      };

      const events = await reader.getEvents(1, 1, 1);
      expect(events).to.have.length(1);
      expect(events[0].type).to.equal('StrategyCreated');
    });

    it('should handle provider errors gracefully', async () => {
      // Override the mock contracts to simulate provider error
      mockContracts.provider.getLogs = async () => {
        throw new Error('Provider error');
      };

      try {
        await reader.getEvents(1, 5, 1);
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        // @ts-expect-error - Error is of unknown type but we need to access message property
        expect(error.message).to.equal('Provider error');
      }
    });
  });
});
