// @file: Unit tests for loadSpecOverview and searchSpec — S8/S9 spec queries.
// @consumers: OrientCommand
// @tasks: TSK-55

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadSpecOverview, searchSpec } from '../core/query-spec.ts';

function createTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'orient-spec-test-'));
}

describe('loadSpecOverview', () => {
  it('specs overview: scans specs/ for .spec.md files', () => {
    const tmpDir = createTmpDir();
    const specsDir = join(tmpDir, 'specs', 'cli');
    mkdirSync(specsDir, { recursive: true });
    writeFileSync(join(specsDir, 'cli.spec.md'), '# TSK-01 some task\nTSK-02 other task');

    const overviews = loadSpecOverview(tmpDir);
    assert.strictEqual(overviews.length, 1);
    assert.ok(overviews[0].specPath.endsWith('cli.spec.md'));
    assert.deepStrictEqual(overviews[0].taskIds, ['TSK-01', 'TSK-02']);
    assert.strictEqual(overviews[0].isLibraryLevel, false);
  });

  it('return empty when specs/ does not exist', () => {
    const tmpDir = createTmpDir();
    const overviews = loadSpecOverview(tmpDir);
    assert.deepStrictEqual(overviews, []);
  });

  it('library spec: marks spec without own tasks as library-level', () => {
    const tmpDir = createTmpDir();
    const specsDir = join(tmpDir, 'specs', 'dbc');
    mkdirSync(specsDir, { recursive: true });
    writeFileSync(join(specsDir, 'dbc.spec.md'), '# Library spec — no tasks');
    writeFileSync(join(specsDir, 'dbc-parser.spec.md'), '# TSK-01 parser task');

    const overviews = loadSpecOverview(tmpDir);
    assert.strictEqual(overviews.length, 2);
    const libSpec = overviews.find((o) => o.specPath.endsWith('dbc.spec.md'));
    assert.ok(libSpec);
    assert.strictEqual(libSpec.isLibraryLevel, true);
  });
});

describe('searchSpec', () => {
  it('spec search: finds spec by name', () => {
    const tmpDir = createTmpDir();
    const specsDir = join(tmpDir, 'specs');
    mkdirSync(specsDir, { recursive: true });
    writeFileSync(join(specsDir, 'my-spec.spec.md'), '# TSK-10 task');

    const result = searchSpec(tmpDir, 'my-spec.spec.md');
    assert.ok(result);
    assert.ok(result.specPath.endsWith('my-spec.spec.md'));
  });

  it('spec not found: returns null', () => {
    const tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, 'specs'), { recursive: true });

    const result = searchSpec(tmpDir, 'nonexistent.spec.md');
    assert.strictEqual(result, null);
  });
});
