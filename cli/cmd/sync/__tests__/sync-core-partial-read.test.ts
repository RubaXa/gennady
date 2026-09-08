// @file: SO-7 — a source scan a readdirSync error cut short must never look like an empty source.
// @consumers: sync-core.ts
// @tasks: TSK-56

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readdirSync as realReaddirSync,
  statSync as realStatSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Fixture (real fs, built before the mock is registered — see below) ─────
//
// sourceDir/knowledge.xml     — unaffected, present in both
// sourceDir/sdd/discovery.xml — unaffected, present in both
// sourceDir/testing/legacy.xml — readdirSync on this ONE directory is mocked to throw EACCES
// targetDir mirrors all three, plus a genuine orphan `stale-root.xml` the package never shipped.

const _tmpDir = mkdtempSync(join(tmpdir(), 'sync-core-partial-read-'));
const _sourceDir = join(_tmpDir, 'ai', 'directives');
const _targetDir = join(_tmpDir, 'project', 'ai', 'directives');
const _blockedSourceDir = join(_sourceDir, 'testing');

mkdirSync(join(_sourceDir, 'sdd'), { recursive: true });
mkdirSync(_blockedSourceDir, { recursive: true });
writeFileSync(join(_sourceDir, 'knowledge.xml'), '<k/>', 'utf-8');
writeFileSync(join(_sourceDir, 'sdd', 'discovery.xml'), '<d/>', 'utf-8');
writeFileSync(join(_blockedSourceDir, 'legacy.xml'), '<legacy/>', 'utf-8');

mkdirSync(join(_targetDir, 'sdd'), { recursive: true });
mkdirSync(join(_targetDir, 'testing'), { recursive: true });
writeFileSync(join(_targetDir, 'knowledge.xml'), '<k/>', 'utf-8');
writeFileSync(join(_targetDir, 'sdd', 'discovery.xml'), '<d/>', 'utf-8');
writeFileSync(join(_targetDir, 'testing', 'legacy.xml'), '<legacy/>', 'utf-8');
writeFileSync(join(_targetDir, 'stale-root.xml'), '<stale/>', 'utf-8');

// ── Mock: readdirSync throws EACCES for exactly the blocked source subdirectory, real fs
// everywhere else (target reads, the rest of the source tree, this file's own fixture setup
// above — already bound to the real implementation by ESM import hoisting before this runs). ──

const mockReaddirSync = mock.fn((path: string) => {
  if (path === _blockedSourceDir) {
    const err = new Error('EACCES: permission denied, scandir') as NodeJS.ErrnoException;
    err.code = 'EACCES';
    throw err;
  }
  return realReaddirSync(path);
});

mock.module('node:fs', {
  namedExports: {
    readdirSync: mockReaddirSync,
    statSync: realStatSync,
    // sync-core.ts also pulls in shared/common/sync/sync-core.shared.ts (resolvePackageDir),
    // which imports these two — unused by the scenario below, but must resolve to something real
    // or the whole module graph fails to load (mocked 'node:fs' otherwise has no other exports).
    existsSync,
    readFileSync,
  },
});

// ── Import SUT after the mock is registered — sync-core.ts's own `import { readdirSync,
// statSync } from 'node:fs'` must resolve against the mocked module, not the one this test
// file's own top-level imports (above) already bound to the real implementation. ──

const { collectAndCompare } = await import('../sync-core.ts');

describe('collectAndCompare — partial source read (SO-7)', () => {
  it('a partial source scan never deletes the subtree it could not read, but still prunes real orphans elsewhere', () => {
    const deps = {
      readFile: (p: string) => readFileSync(p),
      writeFile: () => {
        throw new Error('unexpected write in this scenario');
      },
      mkdir: () => {},
      stat: (p: string) => realStatSync(p),
      readdir: realReaddirSync,
      unlink: (p: string) => rmSync(p),
      cwd: _tmpDir,
    };

    const result = collectAndCompare(deps, { sourceDir: _sourceDir, targetDir: _targetDir });

    // The unreadable source subtree: its target file must survive, untouched.
    assert.ok(
      !result.entries.some((e) => e.relativePath === 'testing/legacy.xml'),
      'testing/legacy.xml must not be reported as deleted'
    );
    assert.ok(
      existsSync(join(_targetDir, 'testing', 'legacy.xml')),
      'testing/legacy.xml must still exist on disk'
    );

    // A genuine orphan outside the blocked subtree is still pruned — the fix must be narrowly
    // scoped to the incomplete subtree, not "never delete anything on any error anywhere".
    assert.ok(
      result.entries.some((e) => e.relativePath === 'stale-root.xml' && e.status === 'deleted'),
      'stale-root.xml (a real orphan, unrelated to the read failure) must still be deleted'
    );
    assert.ok(!existsSync(join(_targetDir, 'stale-root.xml')));

    // Fail-safe direction requires both: never delete AND never stay silent about it.
    assert.ok(
      result.warnings.some((w) => w.includes('testing')),
      'a warning must name the subtree that could not be fully read'
    );

    // Unaffected files were compared normally — identical content on both sides, so 'unchanged'.
    assert.ok(
      result.entries.some((e) => e.relativePath === 'knowledge.xml' && e.status === 'unchanged')
    );
    assert.ok(
      result.entries.some((e) => e.relativePath === 'sdd/discovery.xml' && e.status === 'unchanged')
    );
  });
});
