// @file: Unit tests for queryConsumer — find files by consumer name (S3 scenario).
// @consumers: OrientCommand
// @tasks: TSK-55

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queryConsumer } from '../core/query-consumer.ts';
import type { ScannedFile } from '../orient.types.ts';

function makeFile(absPath: string, consumers: string[]): ScannedFile {
  return {
    absPath,
    header: { file: 'test file', tasks: [], consumers },
    exports: [],
  };
}

describe('queryConsumer', () => {
  it('returns empty array for empty consumer list', () => {
    const results = queryConsumer([], [], false);
    assert.deepStrictEqual(results, []);
  });

  it('exact consumer: finds exact match', () => {
    const files = [
      makeFile('/project/src/a.ts', ['DbcTsLinter']),
      makeFile('/project/src/b.ts', ['OtherModule']),
    ];
    const results = queryConsumer(files, ['DbcTsLinter'], false);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].consumerName, 'DbcTsLinter');
    assert.strictEqual(results[0].files.length, 1);
    assert.strictEqual(results[0].files[0].absPath, '/project/src/a.ts');
  });

  it('substring consumer: case-insensitive match', () => {
    const files = [
      makeFile('/project/src/a.ts', ['DbcTsLinter']),
      makeFile('/project/src/b.ts', ['DbcLinter']),
      makeFile('/project/src/c.ts', ['OtherModule']),
    ];
    const results = queryConsumer(files, ['Linter'], false);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].files.length, 2);
  });

  it('consumer not found: returns empty files', () => {
    const files = [makeFile('/project/src/a.ts', ['DbcTsLinter'])];
    const results = queryConsumer(files, ['UnknownModule'], false);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].files.length, 0);
  });

  it('multiple consumers group: returns results per consumer', () => {
    const files = [
      makeFile('/project/src/a.ts', ['A']),
      makeFile('/project/src/b.ts', ['B']),
      makeFile('/project/src/c.ts', ['A', 'B']),
    ];
    const results = queryConsumer(files, ['A', 'B'], false);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].consumerName, 'A');
    assert.strictEqual(results[0].files.length, 2);
    assert.strictEqual(results[1].consumerName, 'B');
    assert.strictEqual(results[1].files.length, 2);
  });

  it('fuzzy consumer: matches with DL distance', () => {
    const files = [
      makeFile('/project/src/a.ts', ['DbcTsLinter']),
      makeFile('/project/src/b.ts', ['OtherModule']),
    ];
    const results = queryConsumer(files, ['DbcTsLintr'], true);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].files.length, 1);
    assert.strictEqual(results[0].files[0].absPath, '/project/src/a.ts');
  });
});
