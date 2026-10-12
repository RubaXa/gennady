// @file: Unit tests for Damerau-Levenshtein distance and fuzzy matching functions.
// @consumers: QueryKeyword, QueryConsumer, QueryEntity
// @tasks: TSK-55

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { damerauLevenshtein, isFuzzyMatch, fuzzyDistance } from '../core/damerau-levenshtein.ts';

describe('damerauLevenshtein', () => {
  it('contract distance type: returns number', () => {
    const result = damerauLevenshtein('hello', 'world');
    assert.strictEqual(typeof result, 'number');
  });

  it('contract distance type: returns non-negative integer', () => {
    const result = damerauLevenshtein('abc', 'def');
    assert.ok(Number.isInteger(result));
    assert.ok(result >= 0);
  });

  it('exact distance 0', () => {
    const distance = damerauLevenshtein('contract', 'contract');
    assert.strictEqual(distance, 0);
  });

  it('transpose distance 1', () => {
    const distance = damerauLevenshtein('contract', 'contarct');
    assert.strictEqual(distance, 1);
  });

  it('insert distance 1', () => {
    const distance = damerauLevenshtein('cat', 'cart');
    assert.strictEqual(distance, 1);
  });

  it('delete distance 1', () => {
    const distance = damerauLevenshtein('cart', 'cat');
    assert.strictEqual(distance, 1);
  });
});

describe('isFuzzyMatch', () => {
  it('short threshold pass: word <=5 chars, distance <=2', () => {
    const match = isFuzzyMatch('cat', 'caz');
    assert.strictEqual(match, true);
  });

  it('short threshold fail: word <=5 chars, distance >2', () => {
    const match = isFuzzyMatch('cat', 'xyz');
    assert.strictEqual(match, false);
  });

  it('long threshold pass: word >5 chars, distance <=3', () => {
    const match = isFuzzyMatch('implementation', 'implementaton');
    assert.strictEqual(match, true);
  });

  it('long threshold fail: word >5 chars, distance >3', () => {
    const match = isFuzzyMatch('implementation', 'implxyzabcde');
    assert.strictEqual(match, false);
  });

  it('contract boundary word length 5: distance 2 passes', () => {
    const match = isFuzzyMatch('parse', 'parxe');
    assert.strictEqual(match, true);
  });

  it('contract boundary word length 5: distance 3 fails', () => {
    const match = isFuzzyMatch('parse', 'vwxyz');
    assert.strictEqual(match, false);
  });
});

describe('fuzzyDistance', () => {
  it('returns distance and match verdict', () => {
    const result = fuzzyDistance('cat', 'caz');
    assert.strictEqual(result.distance, 1);
    assert.strictEqual(result.match, true);
  });
});
