// @file: SO-7 — a skill's source scan a readdirSync error cut short must never look empty.
// @consumers: sync-skills-core.ts
// @tasks: TSK-57

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
  unlinkSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Fixture (real fs, built before the mock is registered) ─────────────────
//
// sourceDir/sdd-execute/SKILL.md            — unaffected
// sourceDir/sdd-execute/scripts/verify.sh   — readdirSync on `scripts/` is mocked to throw EACCES
// targetDir/sdd-execute/{SKILL.md,scripts/verify.sh} — both already there from a previous sync,
// both already manifested (so, per SO-2b alone, both would be prunable if genuinely dropped).
// targetDir also has a second, genuinely-dropped skill `sdd-old` — untouched by the mock, so its
// normal orphan-prune behavior must be unaffected by this fix.

const _tmpDir = mkdtempSync(join(tmpdir(), 'sync-skills-partial-read-'));
const _sourceDir = join(_tmpDir, 'ai', 'skills');
const _targetDir = join(_tmpDir, '.claude', 'skills');
const _blockedScriptsDir = join(_sourceDir, 'sdd-execute', 'scripts');

mkdirSync(_blockedScriptsDir, { recursive: true });
writeFileSync(join(_sourceDir, 'sdd-execute', 'SKILL.md'), '# Execute', 'utf-8');
writeFileSync(join(_blockedScriptsDir, 'verify.sh'), '#!/bin/bash', 'utf-8');

mkdirSync(join(_targetDir, 'sdd-execute', 'scripts'), { recursive: true });
writeFileSync(join(_targetDir, 'sdd-execute', 'SKILL.md'), '# Execute', 'utf-8');
writeFileSync(join(_targetDir, 'sdd-execute', 'scripts', 'verify.sh'), '#!/bin/bash', 'utf-8');
mkdirSync(join(_targetDir, 'sdd-old'), { recursive: true });
writeFileSync(join(_targetDir, 'sdd-old', 'SKILL.md'), '# Old', 'utf-8');
writeFileSync(
  join(_targetDir, '.gennady-synced'),
  'sdd-execute\nsdd-execute/SKILL.md\nsdd-execute/scripts/verify.sh\nsdd-old\n',
  'utf-8'
);

// ── Mock: readdirSync throws EACCES for exactly the blocked scripts/ subdirectory of the
// SOURCE skill, real fs everywhere else (target reads, sdd-old, this file's own fixture setup
// above — already bound to the real implementation by ESM import hoisting before this runs). ──

const mockReaddirSync = mock.fn((path: string) => {
  if (path === _blockedScriptsDir) {
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
    readFileSync,
    existsSync,
  },
});

// ── Import SUT after the mock is registered ─────────────────────────────────

const { collectAndCompareSkills } = await import('../sync-skills-core.ts');

describe('collectAndCompareSkills — partial source read (SO-7)', () => {
  it('a skill whose source read was cut short never loses a manifested file, but a genuinely dropped skill is still pruned', () => {
    const deps = {
      readFile: (p: string) => readFileSync(p),
      writeFile: () => {
        throw new Error('unexpected write in this scenario');
      },
      mkdir: () => {},
      stat: (p: string) => realStatSync(p),
      readdir: (p: string) => {
        try {
          return realReaddirSync(p);
        } catch {
          return [];
        }
      },
      unlink: (p: string) => {
        assert.ok(
          !p.includes(join('sdd-execute', 'scripts')),
          `unexpected unlink under the incomplete-read skill: ${p}`
        );
        unlinkSync(p);
      },
      rmdir: (p: string) => rmSync(p, { recursive: true, force: true }),
    };

    const result = collectAndCompareSkills(deps, { sourceDir: _sourceDir, targetDir: _targetDir });

    // The skill whose source scripts/ subdir failed to read: its manifested target file
    // survives even though isFileOwned alone would have allowed deleting it.
    assert.ok(
      !result.entries.some(
        (e) => e.skillName === 'sdd-execute' && e.relativePath === 'scripts/verify.sh'
      ),
      'sdd-execute/scripts/verify.sh must not be reported as deleted'
    );
    assert.ok(existsSync(join(_targetDir, 'sdd-execute', 'scripts', 'verify.sh')));

    // A genuinely dropped skill, unrelated to the read failure, is still pruned normally.
    assert.ok(
      result.entries.some(
        (e) => e.skillName === 'sdd-old' && e.relativePath === '' && e.status === 'deleted'
      ),
      'sdd-old (a real orphan, unrelated to the read failure) must still be pruned'
    );
  });
});
