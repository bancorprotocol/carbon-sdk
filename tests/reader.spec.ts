import { expect } from 'chai';
import { BigNumber } from '../src/utils/numerics';
import Reader from '../src/contracts-api/Reader';
import { Contracts } from '../src/contracts-api/Contracts';
import { MulticallService, MultiCall } from '../src/contracts-api/utils';
import { Multicall } from '../src/abis/types';
import {
  EncodedStrategy,
  TradingFeeUpdate,
  TokenPair,
} from '../src/common/types';
import {
  StrategyStructOutput,
  OrderStructOutput,
} from '../src/abis/types/CarbonController';

class MockMulticallService implements MulticallService {
  private responses: unknown[][] = [];

  setResponses(responses: unknown[][]) {
    this.responses = responses;
  }

  async execute(
    _calls: MultiCall[],
    _blockHeight?: number
  ): Promise<unknown[][]> {
    return this.responses;
  }
}

describe('Reader', () => {
  let reader: Reader;
  let mockContracts: Contracts;
  let mockMulticallService: MockMulticallService;

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
      multicall: {
        tryAggregate: async () => [],
      } as unknown as Multicall,
    } as unknown as Contracts;

    mockMulticallService = new MockMulticallService();
    reader = new Reader(mockContracts, mockMulticallService);
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

  describe('strategiesByPair', () => {
    it('should return empty array when no strategies are found', async () => {
      // Override the mock contracts to return empty array
      mockContracts.carbonController.strategiesByPair = async () => [];

      const strategies = await reader.strategiesByPair('0x123', '0x456');
      expect(strategies.length).to.equal(0);
    });

    it('should return strategies when they exist', async () => {
      // Create mock strategies in the correct format
      const mockStrategies: StrategyStructOutput[] = [
        [
          BigNumber.from(1),
          '0xowner',
          ['0x123', '0x456'],
          [
            [
              BigNumber.from(100),
              BigNumber.from(200),
              BigNumber.from(300),
              BigNumber.from(400),
            ] as OrderStructOutput,
            [
              BigNumber.from(500),
              BigNumber.from(600),
              BigNumber.from(700),
              BigNumber.from(800),
            ] as OrderStructOutput,
          ],
        ] as StrategyStructOutput,
        [
          BigNumber.from(2),
          '0xowner',
          ['0x123', '0x456'],
          [
            [
              BigNumber.from(900),
              BigNumber.from(1000),
              BigNumber.from(1100),
              BigNumber.from(1200),
            ] as OrderStructOutput,
            [
              BigNumber.from(1300),
              BigNumber.from(1400),
              BigNumber.from(1500),
              BigNumber.from(1600),
            ] as OrderStructOutput,
          ],
        ] as StrategyStructOutput,
      ];

      // Override the mock contracts to return mock strategies
      mockContracts.carbonController.strategiesByPair = async () =>
        mockStrategies;

      const strategies = await reader.strategiesByPair('0x123', '0x456');
      expect(strategies).to.deep.equal(
        mockStrategies.map((strategy) => ({
          id: strategy[0],
          token0: strategy[2][0],
          token1: strategy[2][1],
          order0: {
            y: strategy[3][0][0],
            z: strategy[3][0][1],
            A: strategy[3][0][2],
            B: strategy[3][0][3],
          },
          order1: {
            y: strategy[3][1][0],
            z: strategy[3][1][1],
            A: strategy[3][1][2],
            B: strategy[3][1][3],
          },
        }))
      );
    });

    it('should handle more than 1000 strategies by fetching in chunks', async () => {
      // Create mock strategies (1500 strategies) in the correct format
      const mockStrategies: StrategyStructOutput[] = Array.from(
        { length: 1500 },
        (_, i) =>
          [
            BigNumber.from(i + 1),
            '0xowner',
            ['0x123', '0x456'],
            [
              [
                BigNumber.from(100),
                BigNumber.from(200),
                BigNumber.from(300),
                BigNumber.from(400),
              ] as OrderStructOutput,
              [
                BigNumber.from(500),
                BigNumber.from(600),
                BigNumber.from(700),
                BigNumber.from(800),
              ] as OrderStructOutput,
            ],
          ] as StrategyStructOutput
      );

      // Track the number of times the method is called
      let callCount = 0;

      // Override the mock contracts to return chunks of strategies
      mockContracts.carbonController.strategiesByPair = async (
        _,
        __,
        startIndex,
        endIndex
      ) => {
        callCount++;
        return mockStrategies.slice(Number(startIndex), Number(endIndex));
      };

      const strategies = await reader.strategiesByPair('0x123', '0x456');

      // Verify that we got all strategies
      expect(strategies).to.have.length(1500);
      expect(strategies).to.deep.equal(
        mockStrategies.map((strategy) => ({
          id: strategy[0],
          token0: strategy[2][0],
          token1: strategy[2][1],
          order0: {
            y: strategy[3][0][0],
            z: strategy[3][0][1],
            A: strategy[3][0][2],
            B: strategy[3][0][3],
          },
          order1: {
            y: strategy[3][1][0],
            z: strategy[3][1][1],
            A: strategy[3][1][2],
            B: strategy[3][1][3],
          },
        }))
      );

      // Verify that the method was called twice (once for each chunk)
      expect(callCount).to.equal(2);
    });
  });

  describe('strategiesByPairs', () => {
    const chunkSize = 1000;
    let mockMulticallService: MockMulticallService;

    // Helper function to create mock strategies
    function createMockStrategy(
      id: number,
      token0: string,
      token1: string
    ): StrategyStructOutput {
      return [
        BigNumber.from(id),
        '0xowner',
        [token0, token1],
        [
          [
            BigNumber.from(100),
            BigNumber.from(200),
            BigNumber.from(300),
            BigNumber.from(400),
          ] as OrderStructOutput,
          [
            BigNumber.from(500),
            BigNumber.from(600),
            BigNumber.from(700),
            BigNumber.from(800),
          ] as OrderStructOutput,
        ],
      ] as StrategyStructOutput;
    }

    beforeEach(() => {
      mockMulticallService = new MockMulticallService();
      reader = new Reader(mockContracts, mockMulticallService);
    });

    it('should handle pairs with different chunk requirements', async () => {
      // Create test pairs with different strategy counts
      const pairs: TokenPair[] = [
        ['0x123', '0x456'], // No strategies
        ['0x789', '0xabc'], // Single chunk (500 strategies)
        ['0xdef', '0xghi'], // Exactly one chunk (1000 strategies)
        ['0xjkl', '0xmno'], // Two chunks (1500 strategies)
        ['0xpqr', '0xstu'], // Three chunks (2500 strategies)
      ];

      // Create mock strategies for each pair
      const mockStrategies: { [key: string]: StrategyStructOutput[] } = {
        [pairs[0].join('-')]: [], // No strategies
        [pairs[1].join('-')]: Array.from({ length: 500 }, (_, i) =>
          createMockStrategy(i + 1, pairs[1][0], pairs[1][1])
        ),
        [pairs[2].join('-')]: Array.from({ length: 1000 }, (_, i) =>
          createMockStrategy(i + 1, pairs[2][0], pairs[2][1])
        ),
        [pairs[3].join('-')]: Array.from({ length: 1500 }, (_, i) =>
          createMockStrategy(i + 1, pairs[3][0], pairs[3][1])
        ),
        [pairs[4].join('-')]: Array.from({ length: 2500 }, (_, i) =>
          createMockStrategy(i + 1, pairs[4][0], pairs[4][1])
        ),
      };

      // Set up mock responses for first chunk
      const firstChunkResponses = pairs.map((pair) => {
        const key = pair.join('-');
        return [mockStrategies[key].slice(0, chunkSize)];
      });
      mockMulticallService.setResponses(firstChunkResponses);

      // Set up mock for subsequent chunks
      mockContracts.carbonController.strategiesByPair = async (
        token0: string,
        token1: string,
        startIndex: number,
        endIndex: number
      ) => {
        const key = `${token0}-${token1}`;
        return mockStrategies[key].slice(Number(startIndex), Number(endIndex));
      };

      const results = await reader.strategiesByPairs(pairs);

      // Verify results
      expect(results).to.have.length(5);

      // Verify pair with no strategies
      expect(results[0].pair).to.deep.equal(['0x123', '0x456']);
      expect(results[0].strategies).to.have.length(0);

      // Verify pair with single chunk (500 strategies)
      expect(results[1].pair).to.deep.equal(['0x789', '0xabc']);
      expect(results[1].strategies).to.have.length(500);
      expect(results[1].strategies[0].id).to.deep.equal(BigNumber.from(1));
      expect(results[1].strategies[499].id).to.deep.equal(BigNumber.from(500));

      // Verify pair with exactly one chunk (1000 strategies)
      expect(results[2].pair).to.deep.equal(['0xdef', '0xghi']);
      expect(results[2].strategies).to.have.length(1000);
      expect(results[2].strategies[0].id).to.deep.equal(BigNumber.from(1));
      expect(results[2].strategies[999].id).to.deep.equal(BigNumber.from(1000));

      // Verify pair with two chunks (1500 strategies)
      expect(results[3].pair).to.deep.equal(['0xjkl', '0xmno']);
      expect(results[3].strategies).to.have.length(1500);
      expect(results[3].strategies[0].id).to.deep.equal(BigNumber.from(1));
      expect(results[3].strategies[1499].id).to.deep.equal(
        BigNumber.from(1500)
      );

      // Verify pair with three chunks (2500 strategies)
      expect(results[4].pair).to.deep.equal(['0xpqr', '0xstu']);
      expect(results[4].strategies).to.have.length(2500);
      expect(results[4].strategies[0].id).to.deep.equal(BigNumber.from(1));
      expect(results[4].strategies[2499].id).to.deep.equal(
        BigNumber.from(2500)
      );
    });

    it('should handle empty pairs array', async () => {
      const results = await reader.strategiesByPairs([]);
      expect(results).to.have.length(0);
    });

    it('should handle multicall failure gracefully', async () => {
      const pairs: TokenPair[] = [['0x123', '0x456']];
      mockMulticallService.setResponses([]); // Simulate multicall failure

      const results = await reader.strategiesByPairs(pairs);
      expect(results).to.have.length(0);
    });
  });
});
