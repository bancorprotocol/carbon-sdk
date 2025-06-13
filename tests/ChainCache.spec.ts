import { expect } from 'chai';
import { ChainCache } from '../src/chain-cache/ChainCache';
import {
  EncodedOrder,
  EncodedStrategy,
  TokenPair,
  TradeData,
} from '../src/common/types';
import { BigNumber } from '../src/utils/numerics';

const encodedOrder1: EncodedOrder = {
  y: BigNumber.from(1),
  z: BigNumber.from(2),
  A: BigNumber.from(3),
  B: BigNumber.from(4),
};

const encodedOrder2: EncodedOrder = {
  y: BigNumber.from(5),
  z: BigNumber.from(6),
  A: BigNumber.from(7),
  B: BigNumber.from(8),
};

const encodedStrategy1: EncodedStrategy = {
  id: BigNumber.from(1),
  token0: 'abc',
  token1: 'xyz',
  order0: encodedOrder1,
  order1: encodedOrder2,
};

const encodedStrategy2: EncodedStrategy = {
  id: BigNumber.from(2),
  token0: 'xyz',
  token1: 'abc',
  order0: encodedOrder2,
  order1: encodedOrder1,
};

const trade: TradeData = {
  trader: 'Doron',
  sourceToken: 'abc',
  targetToken: 'xyz',
  sourceAmount: '100',
  targetAmount: '200',
  tradingFeeAmount: '10',
  byTargetAmount: true,
};

describe('ChainCache', () => {
  describe('serialize and deserialize', () => {
    let cache: ChainCache;
    let serialized: string = '';
    let deserialized: ChainCache;
    beforeEach(() => {
      cache = new ChainCache();
      cache.addPair('abc', 'xyz', [encodedStrategy1, encodedStrategy2]);
      cache.addPair('foo', 'bar', []);
      cache.applyEvents(
        [
          {
            type: 'TokensTraded',
            blockNumber: 7,
            logIndex: 0,
            data: trade,
          },
        ],
        7
      );
      serialized = cache.serialize();
      deserialized = ChainCache.fromSerialized(serialized);
    });
    it('cached pairs should match', async () => {
      expect(deserialized.getCachedPairs(false)).to.deep.equal([
        ['abc', 'xyz'],
        ['bar', 'foo'],
      ]);
      expect(deserialized.getCachedPairs()).to.deep.equal([['abc', 'xyz']]);
    });
    it('strategies by pair should match', async () => {
      expect(
        await deserialized.getStrategiesByPair('xyz', 'abc')
      ).to.deep.equal([encodedStrategy1, encodedStrategy2]);
      expect(
        await deserialized.getStrategiesByPair('foo', 'bar')
      ).to.deep.equal([]);
    });
    it('strategy by id should match', async () => {
      expect(deserialized.getStrategyById('1')).to.deep.equal(encodedStrategy1);
    });
    it('last block number should match', async () => {
      expect(deserialized.getLatestBlockNumber()).to.equal(7);
    });
    it('trades by pair should match', async () => {
      expect(
        await deserialized.getLatestTradeByPair('xyz', 'abc')
      ).to.deep.equal(trade);
      expect(
        await deserialized.getLatestTradeByDirectedPair('abc', 'xyz')
      ).to.deep.equal(trade);
      expect(await deserialized.getLatestTradeByDirectedPair('xyz', 'abc')).to
        .be.undefined;
    });
    it('should return clear cache when deserialized from older version', async () => {
      const regex = /("schemeVersion":)(\d+)/;
      const legacySerialized = serialized.replace(
        regex,
        (_, p1, p2) => `${p1}${Number(p2) - 1}`
      );
      // assert that the cache was created empty
      const emptyCache = ChainCache.fromSerialized(legacySerialized);
      expect(emptyCache.getCachedPairs()).to.deep.equal([]);
    });
    it('should return clear cache when deserialized from no version', async () => {
      const regex = /"schemeVersion":\d+,/;
      const legacySerialized = serialized.replace(regex, '');
      // assert that the cache was created empty
      const emptyCache = ChainCache.fromSerialized(legacySerialized);
      expect(emptyCache.getCachedPairs()).to.deep.equal([]);
    });
    it('should return clear cache when deserialized with invalid latestBlockNumber', async () => {
      const regex = /"latestBlockNumber":\d+/;
      const invalidSerialized = serialized.replace(
        regex,
        '"latestBlockNumber":null'
      );
      // assert that the cache was created empty
      const emptyCache = ChainCache.fromSerialized(invalidSerialized);
      expect(emptyCache.getCachedPairs()).to.deep.equal([]);
    });
    it('should filter out null items from blocksMetadata when deserializing', async () => {
      // Create a cache with some block metadata
      const cacheWithBlocks = new ChainCache();
      cacheWithBlocks.blocksMetadata = [
        { number: 1, hash: '0x123' },
        { number: 2, hash: '0x456' },
      ];
      const serializedCache = cacheWithBlocks.serialize();

      // Inject a null item into the blocksMetadata array
      const regex = /"blocksMetadata":\[(.*?)\]/s;
      const invalidSerialized = serializedCache.replace(
        regex,
        (match, p1) =>
          `"blocksMetadata":[${p1},null,{"number":3,"hash":"0x789"}]`
      );

      // Deserialize and verify null items are filtered out
      const deserializedCache = ChainCache.fromSerialized(invalidSerialized);
      expect(deserializedCache.blocksMetadata).to.have.length(3);
      expect(
        deserializedCache.blocksMetadata.map((b) => b.number)
      ).to.deep.equal([1, 2, 3]);
    });
    it('should filter out invalid items from blocksMetadata when deserializing', async () => {
      // Create a cache with some block metadata
      const cacheWithBlocks = new ChainCache();
      cacheWithBlocks.blocksMetadata = [
        { number: 1, hash: '0x123' },
        { number: 2, hash: '0x456' },
      ];
      const serializedCache = cacheWithBlocks.serialize();

      // Inject invalid items into the blocksMetadata array
      const regex = /"blocksMetadata":\[(.*?)\]/s;
      const invalidSerialized = serializedCache.replace(
        regex,
        (match, p1) =>
          `"blocksMetadata":[${p1},{"timestamp":3000},{"number":3}]`
      );

      // Deserialize and verify invalid items are filtered out
      const deserializedCache = ChainCache.fromSerialized(invalidSerialized);
      expect(deserializedCache.blocksMetadata).to.have.length(2);
      expect(
        deserializedCache.blocksMetadata.map((b) => b.number)
      ).to.deep.equal([1, 2]);
    });
  });
  describe('onChange', () => {
    it('should fire onPairAddedToCache event when pair is added', async () => {
      const cache = new ChainCache();
      let affectedPair: TokenPair = ['', ''];
      cache.on('onPairAddedToCache', (pair) => {
        affectedPair = pair;
      });
      cache.addPair('abc', 'xyz', [encodedStrategy1]);
      expect(affectedPair).to.deep.equal(['abc', 'xyz']);
    });
    it('should fire onPairDataChanged event when updates are applied', async () => {
      const cache = new ChainCache();
      let affectedPairs: TokenPair[] = [];
      cache.on('onPairDataChanged', (pairs) => {
        affectedPairs = pairs;
      });
      cache.addPair('abc', 'xyz', [encodedStrategy1]);
      cache.applyEvents(
        [
          {
            type: 'TokensTraded',
            blockNumber: 1,
            logIndex: 0,
            data: trade,
          },
        ],
        1
      );
      expect(affectedPairs).to.deep.equal([['abc', 'xyz']]);
      cache.applyEvents(
        [
          {
            type: 'StrategyCreated',
            blockNumber: 2,
            logIndex: 0,
            data: encodedStrategy2,
          },
        ],
        2
      );
      expect(affectedPairs).to.deep.equal([['abc', 'xyz']]);
      cache.applyEvents(
        [
          {
            type: 'StrategyUpdated',
            blockNumber: 3,
            logIndex: 0,
            data: encodedStrategy1,
          },
        ],
        3
      );
      expect(affectedPairs).to.deep.equal([['abc', 'xyz']]);
      cache.applyEvents(
        [
          {
            type: 'StrategyDeleted',
            blockNumber: 4,
            logIndex: 0,
            data: encodedStrategy1,
          },
        ],
        4
      );
      expect(affectedPairs).to.deep.equal([['abc', 'xyz']]);

      // this shouldn't fire the event - so affectedPairs should remain the same
      cache.applyEvents([], 5);
      expect(affectedPairs).to.deep.equal([['abc', 'xyz']]);
    });
    it('should contain a single copy of a strategy that was updated', async () => {
      const cache = new ChainCache();
      const encodedStrategy1_mod = {
        ...encodedStrategy1,
        id: BigNumber.from(encodedStrategy1.id.toString()),
      };
      cache.addPair('abc', 'xyz', [encodedStrategy1]);
      cache.applyEvents(
        [
          {
            type: 'StrategyUpdated',
            blockNumber: 10,
            logIndex: 0,
            data: encodedStrategy1_mod,
          },
        ],
        10
      );
      const strategies = await cache.getStrategiesByPair('abc', 'xyz');
      expect(strategies).to.have.length(1);
    });
    it('should not contain a strategy after it was deleted', async () => {
      const cache = new ChainCache();
      const encodedStrategy1_mod = {
        ...encodedStrategy1,
        id: BigNumber.from(encodedStrategy1.id.toString()),
      };
      cache.addPair('abc', 'xyz', [encodedStrategy1]);
      cache.applyEvents(
        [
          {
            type: 'StrategyDeleted',
            blockNumber: 10,
            logIndex: 0,
            data: encodedStrategy1_mod,
          },
        ],
        10
      );
      const strategies = await cache.getStrategiesByPair('abc', 'xyz');
      expect(strategies).to.have.length(0);
    });
    it('should cache the latest fees', async () => {
      const cache = new ChainCache();
      cache.applyEvents(
        [
          {
            type: 'PairTradingFeePPMUpdated',
            blockNumber: 1,
            logIndex: 0,
            data: ['abc', 'xyz', 10],
          },
        ],
        1
      );
      expect(await cache.getTradingFeePPMByPair('xyz', 'abc')).to.equal(10);
      expect(await cache.getTradingFeePPMByPair('xyz', 'def')).to.be.undefined;
      cache.applyEvents(
        [
          {
            type: 'PairTradingFeePPMUpdated',
            blockNumber: 2,
            logIndex: 0,
            data: ['abc', 'xyz', 11],
          },
        ],
        2
      );
      expect(await cache.getTradingFeePPMByPair('xyz', 'abc')).to.equal(11);
      cache.applyEvents(
        [
          {
            type: 'PairTradingFeePPMUpdated',
            blockNumber: 3,
            logIndex: 0,
            data: ['abc', 'xyz', 12],
          },
          {
            type: 'PairTradingFeePPMUpdated',
            blockNumber: 3,
            logIndex: 1,
            data: ['abc', 'xyz', 13],
          },
        ],
        3
      );
      expect(await cache.getTradingFeePPMByPair('xyz', 'abc')).to.equal(13);
    });
  });
});
