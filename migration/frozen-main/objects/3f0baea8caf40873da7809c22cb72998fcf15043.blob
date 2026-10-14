// @file: Unit tests for SyncCore — resolvePackageDir, scanDirectives, collectAndCompare
// @consumers: TSK-54
// @tasks: TSK-54

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  statSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolvePackageDir,
  scanDirectives,
  collectAndCompare,
  EXCLUDED_ENTRIES,
  type SyncCoreDeps,
} from '../sync-core.ts';
import { SyncResult, type SyncFileEntry } from '../sync.types.ts';

let _tmpDir: string;
let _writeCalls: Array<{ path: string; data: Buffer }> = [];
let _mkdirCalls: Array<{ path: string; opts?: { recursive: boolean } }> = [];

const _readFile = (p: string) => readFileSync(p);
const _writeFile = (p: string, d: Buffer) => {
  _writeCalls.push({ path: p, data: d });
  writeFileSync(p, d);
};
const _mkdir = (p: string, opts?: { recursive: boolean }) => {
  _mkdirCalls.push({ path: p, opts });
  mkdirSync(p, opts);
};
const _stat = (p: string) => statSync(p);
const _readdir = (p: string) => readFileSync(p) as unknown as string[]; // placeholder

function createDeps(cwd: string, overrides?: Partial<SyncCoreDeps>): SyncCoreDeps {
  return {
    readFile: _readFile,
    writeFile: _writeFile,
    mkdir: _mkdir,
    stat: _stat,
    readdir: readdirSync,
    cwd,
    ...overrides,
  };
}

describe('resolvePackageDir', () => {
  beforeEach(() => {
    _tmpDir = mkdtempSync(join(tmpdir(), 'sync-test-'));
  });

  afterEach(() => {
    if (existsSync(_tmpDir)) rmSync(_tmpDir, { recursive: true });
  });

  // #region TEST_CASE_1: local node_modules found
  it('finds local node_modules/gennady/ai/directives', () => {
    const localPath = join(_tmpDir, 'node_modules', 'gennady', 'ai', 'directives');
    mkdirSync(localPath, { recursive: true });

    const result = resolvePackageDir(_tmpDir);
    assert.equal(result, localPath);
  });
  // #endregion

  // #region TEST_CASE_2: local not found, returns null
  it('returns null when package not found', () => {
    const result = resolvePackageDir(_tmpDir);
    assert.equal(result, null);
  });
  // #endregion
});

describe('scanDirectives', () => {
  let _sourceDir: string;

  beforeEach(() => {
    _tmpDir = mkdtempSync(join(tmpdir(), 'sync-test-'));
    _sourceDir = join(_tmpDir, 'ai', 'directives');
    mkdirSync(_sourceDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(_tmpDir)) rmSync(_tmpDir, { recursive: true });
  });

  it('scans all files without subdir filter', () => {
    writeFileSync(join(_sourceDir, 'knowledge.xml'), '<xml/>', 'utf-8');
    mkdirSync(join(_sourceDir, 'sdd'), { recursive: true });
    writeFileSync(join(_sourceDir, 'sdd', 'discovery.xml'), '<d/>', 'utf-8');
    mkdirSync(join(_sourceDir, 'coding'), { recursive: true });
    writeFileSync(join(_sourceDir, 'coding', 'typescript.xml'), '<t/>', 'utf-8');

    const files = scanDirectives(_sourceDir);
    assert.deepStrictEqual(files, ['coding/typescript.xml', 'knowledge.xml', 'sdd/discovery.xml']);
  });

  it('scans only specified subdirectory', () => {
    mkdirSync(join(_sourceDir, 'sdd'), { recursive: true });
    writeFileSync(join(_sourceDir, 'sdd', 'discovery.xml'), '<d/>', 'utf-8');
    mkdirSync(join(_sourceDir, 'coding'), { recursive: true });
    writeFileSync(join(_sourceDir, 'coding', 'typescript.xml'), '<t/>', 'utf-8');

    const files = scanDirectives(_sourceDir, ['sdd']);
    assert.deepStrictEqual(files, ['sdd/discovery.xml']);
  });

  it('scans multiple specified subdirectories', () => {
    mkdirSync(join(_sourceDir, 'sdd'), { recursive: true });
    writeFileSync(join(_sourceDir, 'sdd', 'a.xml'), '', 'utf-8');
    mkdirSync(join(_sourceDir, 'coding'), { recursive: true });
    writeFileSync(join(_sourceDir, 'coding', 'b.xml'), '', 'utf-8');
    mkdirSync(join(_sourceDir, 'testing'), { recursive: true });
    writeFileSync(join(_sourceDir, 'testing', 'c.xml'), '', 'utf-8');

    const files = scanDirectives(_sourceDir, ['sdd', 'coding']);
    assert.deepStrictEqual(files, ['coding/b.xml', 'sdd/a.xml']);
  });

  it('throws on nonexistent subdirectory', () => {
    mkdirSync(join(_sourceDir, 'sdd'), { recursive: true });

    assert.throws(
      () => scanDirectives(_sourceDir, ['nonexistent']),
      (err: Error & { code?: string }) => {
        return err.code === 'ERR_SYNC_SUBDIR_NOT_FOUND' && err.message.includes('Available:');
      }
    );
  });

  it('excludes entries from EXCLUDED_ENTRIES set', () => {
    mkdirSync(join(_sourceDir, 'architecture'), { recursive: true });
    writeFileSync(join(_sourceDir, 'architecture', 'should-not-appear.xml'), '', 'utf-8');
    writeFileSync(join(_sourceDir, 'dbc-audit.directive.xml'), '', 'utf-8');
    writeFileSync(join(_sourceDir, 'knowledge.xml'), '<k/>', 'utf-8');

    const files = scanDirectives(_sourceDir);
    assert.deepStrictEqual(files, ['knowledge.xml']);
    assert.ok(!files.some((f) => f.includes('architecture')));
    assert.ok(!files.some((f) => f.includes('dbc-audit')));
  });

  it('skips hidden files and dot-prefixed names', () => {
    writeFileSync(join(_sourceDir, '.DS_Store'), '', 'utf-8');
    writeFileSync(join(_sourceDir, 'real.xml'), '', 'utf-8');

    const files = scanDirectives(_sourceDir);
    assert.deepStrictEqual(files, ['real.xml']);
  });
});

describe('collectAndCompare', () => {
  let _sourceDir: string;
  let _targetDir: string;

  beforeEach(() => {
    _tmpDir = mkdtempSync(join(tmpdir(), 'sync-test-'));
    _sourceDir = join(_tmpDir, 'ai', 'directives');
    _targetDir = join(_tmpDir, 'project', 'ai', 'directives');
    mkdirSync(_sourceDir, { recursive: true });
    mkdirSync(_targetDir, { recursive: true });
    _writeCalls = [];
    _mkdirCalls = [];
  });

  afterEach(() => {
    if (existsSync(_tmpDir)) rmSync(_tmpDir, { recursive: true });
  });

  it('marks file as added when not present in target', () => {
    writeFileSync(join(_sourceDir, 'new.xml'), '<n/>', 'utf-8');

    const deps = createDeps(_tmpDir);
    const result = collectAndCompare(deps, { sourceDir: _sourceDir, targetDir: _targetDir });

    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].status, 'added');
    assert.equal(result.added.length, 1);
    assert.equal(_writeCalls.length, 1);
  });

  it('marks file as unchanged when content matches', () => {
    const content = '<same/>';
    writeFileSync(join(_sourceDir, 'same.xml'), content, 'utf-8');
    writeFileSync(join(_targetDir, 'same.xml'), content, 'utf-8');

    const deps = createDeps(_tmpDir);
    const result = collectAndCompare(deps, { sourceDir: _sourceDir, targetDir: _targetDir });

    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].status, 'unchanged');
    assert.equal(result.unchanged.length, 1);
    assert.equal(_writeCalls.length, 0);
  });

  it('marks file as updated when content differs', () => {
    writeFileSync(join(_sourceDir, 'changed.xml'), '<new/>', 'utf-8');
    writeFileSync(join(_targetDir, 'changed.xml'), '<old/>', 'utf-8');

    const deps = createDeps(_tmpDir);
    const result = collectAndCompare(deps, { sourceDir: _sourceDir, targetDir: _targetDir });

    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].status, 'updated');
    assert.equal(result.updated.length, 1);
    assert.equal(_writeCalls.length, 1);
  });

  it('dryRun skips writeFile for added files', () => {
    writeFileSync(join(_sourceDir, 'new.xml'), '<n/>', 'utf-8');

    const deps = createDeps(_tmpDir);
    const result = collectAndCompare(deps, {
      sourceDir: _sourceDir,
      targetDir: _targetDir,
      dryRun: true,
    });

    assert.equal(result.entries[0].status, 'added');
    assert.equal(_writeCalls.length, 0);
  });

  it('dryRun skips writeFile for updated files', () => {
    writeFileSync(join(_sourceDir, 'changed.xml'), '<new/>', 'utf-8');
    writeFileSync(join(_targetDir, 'changed.xml'), '<old/>', 'utf-8');

    const deps = createDeps(_tmpDir);
    const result = collectAndCompare(deps, {
      sourceDir: _sourceDir,
      targetDir: _targetDir,
      dryRun: true,
    });

    assert.equal(result.entries[0].status, 'updated');
    assert.equal(_writeCalls.length, 0);
  });

  it('throws when sourceDir does not exist', () => {
    const deps = createDeps(_tmpDir);
    assert.throws(
      () =>
        collectAndCompare(deps, {
          sourceDir: join(_tmpDir, 'nonexistent'),
          targetDir: _targetDir,
        }),
      (err: Error & { code?: string }) => err.code === 'ERR_SYNC_SOURCE_NOT_FOUND'
    );
  });

  it('creates nested directories for new files', () => {
    mkdirSync(join(_sourceDir, 'sdd', 'nested'), { recursive: true });
    writeFileSync(join(_sourceDir, 'sdd', 'nested', 'deep.xml'), '<d/>', 'utf-8');

    const deps = createDeps(_tmpDir);
    collectAndCompare(deps, { sourceDir: _sourceDir, targetDir: _targetDir });

    assert.ok(_mkdirCalls.length > 0, 'mkdir must be called for new nested dirs');
    const targetFile = join(_targetDir, 'sdd', 'nested', 'deep.xml');
    assert.ok(existsSync(targetFile), 'target file must be written');
  });
});
