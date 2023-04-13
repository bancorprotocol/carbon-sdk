import { expect } from 'chai';
import { toPairKey, toDirectionKey } from '../src/chain-cache/utils';

const SEPARATOR = '->-<-';
describe('toPairKey', () => {
  it('should return the key for two tokens sorted in alphabetical order', () => {
    expect(toPairKey('abc', 'xyz')).to.equal(`abc${SEPARATOR}xyz`);
    expect(toPairKey('xyz', 'abc')).to.equal(`abc${SEPARATOR}xyz`);
    expect(toPairKey('foo', 'bar')).to.equal(`bar${SEPARATOR}foo`);
  });

  it('should throw an error if the two tokens are the same', () => {
    expect(() => toPairKey('foo', 'foo')).to.throw(
      Error,
      /Cannot create key for identical tokens/
    );
  });
});

describe('toDirectionKey', () => {
  it('should return the key for two tokens in the order they were passed', () => {
    expect(toDirectionKey('abc', 'xyz')).to.equal(`abc${SEPARATOR}xyz`);
    expect(toDirectionKey('xyz', 'abc')).to.equal(`xyz${SEPARATOR}abc`);
    expect(toDirectionKey('foo', 'bar')).to.equal(`foo${SEPARATOR}bar`);
  });

  it('should throw an error if the two tokens are the same', () => {
    expect(() => toDirectionKey('foo', 'foo')).to.throw(
      Error,
      /Cannot create key for identical tokens/
    );
  });
});
