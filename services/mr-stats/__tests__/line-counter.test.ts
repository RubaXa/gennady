// @file: Unit tests for mr-stats line-counter — aggregateSimpleCategory, isToolAvailable.
// @consumers: node:test runner
// @tasks: TSK-139

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateSimpleCategory } from '../line-counter.ts';

describe('line-counter — aggregateSimpleCategory', () => {
  it('returns zeros for empty file list', () => {
    // contract: no files → all zeros, no exception
    const result = aggregateSimpleCategory([], [{ file: 'a.ts', added: 10, removed: 5 }]);

    assert.deepStrictEqual(result, { files: 0, added: 0, removed: 0 });
  });

  it('aggregates numstat entries for matching files', () => {
    const files = ['a.ts', 'b.ts'];
    const numstat = [
      { file: 'a.ts', added: 10, removed: 5 },
      { file: 'b.ts', added: 20, removed: 3 },
      { file: 'other.ts', added: 100, removed: 0 },
    ];

    const result = aggregateSimpleCategory(files, numstat);

    assert.deepStrictEqual(result, { files: 2, added: 30, removed: 8 });
  });

  it('skips numstat entries not in category', () => {
    // contract: only files that belong to this category are counted
    const files = ['a.ts'];
    const numstat = [
      { file: 'a.ts', added: 5, removed: 1 },
      { file: 'b.ts', added: 50, removed: 50 },
    ];

    const result = aggregateSimpleCategory(files, numstat);

    assert.deepStrictEqual(result, { files: 1, added: 5, removed: 1 });
  });

  it('files count matches matched entries, not input list', () => {
    // contract: files = number of matched numstat entries, not the input array length
    const files = ['a.ts', 'b.ts', 'missing.ts'];
    const numstat = [
      { file: 'a.ts', added: 10, removed: 2 },
      { file: 'b.ts', added: 5, removed: 0 },
      // missing.ts not in numstat
    ];

    const result = aggregateSimpleCategory(files, numstat);

    assert.strictEqual(result.files, 2);
  });

  it('handles numstat entries with zero values', () => {
    const files = ['a.ts'];
    const numstat = [{ file: 'a.ts', added: 0, removed: 0 }];

    const result = aggregateSimpleCategory(files, numstat);

    assert.deepStrictEqual(result, { files: 1, added: 0, removed: 0 });
  });

  it('handles empty numstat', () => {
    const files = ['a.ts', 'b.ts'];
    const result = aggregateSimpleCategory(files, []);

    assert.deepStrictEqual(result, { files: 0, added: 0, removed: 0 });
  });

  it('aggregates large numbers correctly', () => {
    const files = ['huge.ts'];
    const numstat = [{ file: 'huge.ts', added: 999999, removed: 500000 }];

    const result = aggregateSimpleCategory(files, numstat);

    assert.strictEqual(result.added, 999999);
    assert.strictEqual(result.removed, 500000);
  });
});
