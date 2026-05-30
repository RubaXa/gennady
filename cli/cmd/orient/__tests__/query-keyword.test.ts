// @file: Unit tests for queryKeyword — keyword search with exact, prefix, and fuzzy scoring (S4 scenario).
// @consumers: OrientCommand
// @tasks: TSK-55

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queryKeyword } from '../core/query-keyword.ts';
import type { ScannedFile, FileWordRef } from '../orient.types.ts';

function makeFile(absPath: string, fileHeader?: string): ScannedFile {
  return {
    absPath,
    header: { file: fileHeader ?? '', tasks: [], consumers: [] },
    exports: [],
  };
}

function addRef(
  index: Map<string, Set<FileWordRef>>,
  word: string,
  file: string,
  source: 'file' | 'entity',
  entity?: string
): void {
  let refs = index.get(word);
  if (!refs) {
    refs = new Set();
    index.set(word, refs);
  }
  refs.add({ file, source, entity });
}

describe('queryKeyword', () => {
  it('returns empty for empty query trimmed', () => {
    const results = queryKeyword([], new Map(), '  ');
    assert.deepStrictEqual(results, []);
  });

  it('exact keyword: finds files with exact match', () => {
    const file = makeFile('/project/src/a.ts', 'contract parser');
    const index = new Map<string, Set<FileWordRef>>();
    addRef(index, 'contract', file.absPath, 'file');

    const results = queryKeyword([file], index, 'contract');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].file.absPath, file.absPath);
    assert.strictEqual(results[0].score, 10);
  });

  it('keyword not found: returns empty', () => {
    const file = makeFile('/project/src/a.ts', 'project scanner');
    const index = new Map<string, Set<FileWordRef>>();
    addRef(index, 'scanner', file.absPath, 'file');

    const results = queryKeyword([file], index, 'nonexistent');
    assert.strictEqual(results.length, 0);
  });

  it('fuzzy keyword: matches via DL distance', () => {
    const file = makeFile('/project/src/a.ts', 'merge tool');
    const index = new Map<string, Set<FileWordRef>>();
    addRef(index, 'merge', file.absPath, 'file');

    const results = queryKeyword([file], index, 'marge');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].score, 3);
  });

  it('purpose match: entity match reflected in result', () => {
    const file = makeFile('/project/src/a.ts');
    const index = new Map<string, Set<FileWordRef>>();
    addRef(index, 'validate', file.absPath, 'entity', 'validateInput');

    const results = queryKeyword([file], index, 'validate');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].entityName, 'validateInput');
  });

  it('prefix match: words starting with token scored +5', () => {
    const fileA = makeFile('/project/src/a.ts', 'purposeful tool');
    const fileB = makeFile('/project/src/b.ts', 'purpose scanner');
    const index = new Map<string, Set<FileWordRef>>();
    addRef(index, 'purpose', fileB.absPath, 'file');
    addRef(index, 'purposeful', fileA.absPath, 'file');

    const results = queryKeyword([fileA, fileB], index, 'purpose');
    assert.strictEqual(results.length, 2);
    const exactMatch = results.find((r) => r.score === 10);
    const prefixMatch = results.find((r) => r.score === 5);
    assert.ok(exactMatch, 'exact match on "purpose" should score +10');
    assert.ok(prefixMatch, 'prefix match on "purposeful" should score +5');
  });

  it('multi-word AND: files must contain all tokens', () => {
    const fileA = makeFile('/project/src/a.ts', 'merge tool');
    const fileB = makeFile('/project/src/b.ts', 'conflict resolver');
    const fileC = makeFile('/project/src/c.ts', 'merge conflict handler');
    const index = new Map<string, Set<FileWordRef>>();
    addRef(index, 'merge', fileA.absPath, 'file');
    addRef(index, 'merge', fileC.absPath, 'file');
    addRef(index, 'conflict', fileB.absPath, 'file');
    addRef(index, 'conflict', fileC.absPath, 'file');

    const results = queryKeyword([fileA, fileB, fileC], index, 'merge conflict');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].file.absPath, fileC.absPath);
  });

  it('scoring order: exact > prefix > fuzzy in result sort', () => {
    const fileA = makeFile('/project/src/a.ts', 'parse');
    const fileB = makeFile('/project/src/b.ts', 'parser_util');
    const fileC = makeFile('/project/src/c.ts', 'parze');
    const index = new Map<string, Set<FileWordRef>>();
    addRef(index, 'parse', fileA.absPath, 'file');
    addRef(index, 'parser_util', fileB.absPath, 'file');
    addRef(index, 'parze', fileC.absPath, 'file');

    const results = queryKeyword([fileA, fileB, fileC], index, 'parse');
    assert.ok(results.length >= 2);
    assert.strictEqual(results[0].file.absPath, fileA.absPath, 'exact match first');
    assert.strictEqual(results[0].score, 10);
    const prefixMatch = results.find((r) => r.file.absPath === fileB.absPath);
    assert.ok(prefixMatch, 'prefix match should be present');
    assert.strictEqual(prefixMatch.score, 5);
    const fuzzyMatch = results.find((r) => r.file.absPath === fileC.absPath);
    assert.ok(fuzzyMatch, 'fuzzy match should be present');
    assert.strictEqual(fuzzyMatch.score, 3);
  });

  it('contract score priority: exact > prefix > fuzzy', () => {
    const fileExact = makeFile('/project/src/a.ts', 'parser');
    const filePrefix = makeFile('/project/src/b.ts', 'parser_util');
    const index = new Map<string, Set<FileWordRef>>();
    addRef(index, 'parser', fileExact.absPath, 'file');
    addRef(index, 'parser_util', filePrefix.absPath, 'file');

    const results = queryKeyword([fileExact, filePrefix], index, 'parser');
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].score, 10);
    assert.strictEqual(results[1].score, 5);
  });

  it('empty/whitespace keyword: returns empty array', () => {
    const file = makeFile('/project/src/a.ts', 'something');
    const index = new Map<string, Set<FileWordRef>>();
    addRef(index, 'something', file.absPath, 'file');
    assert.deepStrictEqual(queryKeyword([file], index, ''), []);
    assert.deepStrictEqual(queryKeyword([file], index, '   '), []);
  });
});
