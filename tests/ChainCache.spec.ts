import { expect } from 'chai';
import { ChainCache } from '../src/chain-cache/ChainCache';
import {
  EncodedOrder,
  EncodedStrategy,
  TokenPair,
  TradingFeeUpdate,
} from '../src/common/types';
const encodedOrder1: EncodedOrder = {
  y: 1n,
  z: 2n,
  A: 3n,
  B: 4n,
};

const encodedOrder2: EncodedOrder = {
  y: 5n,
  z: 6n,
  A: 7n,
  B: 8n,
};

const encodedStrategy1: EncodedStrategy = {
  id: 1n,
  token0: 'abc',
  token1: 'xyz',
  order0: encodedOrder1,
  order1: encodedOrder2,
};

const encodedStrategy2: EncodedStrategy = {
  id: 2n,
  token0: 'xyz',
  token1: 'abc',
  order0: encodedOrder2,
  order1: encodedOrder1,
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
            type: 'TradingFeePPMUpdated',
            blockNumber: 7,
            logIndex: 0,
            data: 100,
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
  });
  describe('onChange', () => {
    it('should fire onCacheInitialized event only once when cache is initialized', async () => {
      const cache = new ChainCache();
      let eventCounter = 0;
      cache.on('onCacheInitialized', () => {
        eventCounter++;
      });
      cache.bulkAddPairs([
        { pair: ['abc', 'xyz'], strategies: [encodedStrategy1] },
      ]);
      cache.bulkAddPairs([
        { pair: ['def', 'ghi'], strategies: [encodedStrategy2] },
      ]);
      expect(eventCounter).to.equal(1);
    });
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
            type: 'StrategyDeleted',
            blockNumber: 1,
            logIndex: 0,
            data: encodedStrategy1,
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
        id: BigInt(encodedStrategy1.id.toString()),
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
        id: BigInt(encodedStrategy1.id.toString()),
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
  describe('cache miss', () => {
    it('getStrategiesByPair call miss handler when pair is not cached', async () => {
      const cache = new ChainCache();
      let missHandlerCalled = false;
      cache.setCacheMissHandler(async (token0, token1) => {
        missHandlerCalled = true;
        expect([token0, token1]).to.deep.equal(['abc', 'xyz']);
      });
      await cache.getStrategiesByPair('abc', 'xyz');
      expect(missHandlerCalled).to.be.true;
    });
    it('getOrdersByPair call miss handler when pair is not cached', async () => {
      const cache = new ChainCache();
      let missHandlerCalled = false;
      cache.setCacheMissHandler(async (token0, token1) => {
        missHandlerCalled = true;
        expect([token0, token1]).to.deep.equal(['abc', 'xyz']);
      });
      await cache.getOrdersByPair('abc', 'xyz');
      expect(missHandlerCalled).to.be.true;
    });
    it('getStrategiesByPair calls miss handler, which adds the missing pair, allowing the call to return strategies', async () => {
      const cache = new ChainCache();
      cache.setCacheMissHandler(async (token0, token1) => {
        cache.addPair(token0, token1, [encodedStrategy1]);
      });
      const strategies = await cache.getStrategiesByPair('abc', 'xyz');
      expect(strategies).to.deep.equal([encodedStrategy1]);
    });
  });
});
