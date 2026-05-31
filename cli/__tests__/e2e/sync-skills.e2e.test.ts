// @file: E2E tests for the sync-skills command — 3 scenarios (install + repeat in same sub-describe).
// @consumers: E2eContext
// @tasks: TSK-60

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { getContext } from './setup.ts';

function cleanupSkillsDir(): void {
  const { cwd } = getContext();
  try {
    rmSync(join(cwd, '.claude', 'skills'), { recursive: true, force: true });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'EACCES' || e.code === 'EBUSY') {
      process.stderr.write(`sync-skills afterEach cleanup warning: ${e.message}\n`);
      return;
    }
    throw err;
  }
}

export function registerSyncSkillsTests(): void {
  describe('sync-skills', () => {
    describe('install and repeat', () => {
      it('should install skills on first run', async () => {
        const { spawn } = getContext();
        const result = await spawn(['sync-skills']);
        assert.strictEqual(result.exitCode, 0);
        assert.match(result.stdout, /added/);
      });

      it('should report unchanged on repeat run', async () => {
        const { spawn } = getContext();
        const result = await spawn(['sync-skills']);
        assert.strictEqual(result.exitCode, 0);
        assert.match(result.stdout, /unchanged/);
      });
    });

    describe('other scenarios', () => {
      // #region START_SYNC_SKILLS_CLEANUP — invariant: remove .claude/skills/ after each test; EACCES/EBUSY logged but not fatal
      afterEach(cleanupSkillsDir);
      // #endregion END_SYNC_SKILLS_CLEANUP

      it('should support --dry-run', async () => {
        const { spawn } = getContext();
        const result = await spawn(['sync-skills', '--dry-run']);
        assert.strictEqual(result.exitCode, 0);
        assert.match(result.stdout, /Dry-run: no files written/);
      });

      it('should filter by skill name', async () => {
        const { spawn } = getContext();
        const result = await spawn(['sync-skills', 'sdd-execute']);
        assert.strictEqual(result.exitCode, 0);
      });
    });
  });
}
