// @file: Kit scripts and their tests must resolve the package root from their own file location
//   (render.ts's KIT / PROJECT_ROOT, import.meta.dirname) — never from process.cwd(). A bare
//   relative default (e.g. 'ai/kit/assembly-manifest.json') silently falls back to "file missing"
//   defaults when a script runs from any cwd other than the package root, which is exactly what
//   happened before this fix: build-directives.test.ts, delta-assembly.test.ts and
//   skeleton-package-binding.guard.test.ts each gave a false FAIL when launched from a foreign
//   cwd, because lazy-assembly.ts's resolveAssemblyMode() could not find the real
//   assembly-manifest.json and silently resolved every directive as 'monolith' (T-B6-09,
//   40-TRACK-DIRECTIVES-SKILLS.md §0 "Методическая ловушка (cwd)").
// @consumers: node:test runner
// @tasks: T-B6-09

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROJECT_ROOT } from '../render.ts';

const TSX_BIN = join(PROJECT_ROOT, 'node_modules', '.bin', 'tsx');

/** The three suites the cwd bug was independently verified to false-FAIL (§0). */
const TARGET_TEST_FILES = [
  'ai/kit/__tests__/build-directives.test.ts',
  'ai/kit/__tests__/delta-assembly.test.ts',
  'ai/kit/__tests__/skeleton-package-binding.guard.test.ts',
] as const;

describe('kit scripts resolve the package root regardless of cwd (T-B6-09)', () => {
  for (const rel of TARGET_TEST_FILES) {
    it(`${rel} passes when the test process itself is launched from a foreign cwd`, () => {
      const foreignCwd = mkdtempSync(join(tmpdir(), 'gennady-cwd-guard-'));
      try {
        const result = spawnSync(TSX_BIN, ['--test', join(PROJECT_ROOT, rel)], {
          cwd: foreignCwd,
          encoding: 'utf8',
        });
        assert.equal(
          result.status,
          0,
          `expected exit 0 running ${rel} from a foreign cwd (${foreignCwd}), got ${result.status}\n` +
            `--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`
        );
      } finally {
        rmSync(foreignCwd, { recursive: true, force: true });
      }
    });
  }
});
