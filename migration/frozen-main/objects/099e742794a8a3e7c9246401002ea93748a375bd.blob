// @file: E2E tests for the sync command — 5 scenarios (first run + repeat in same sub-describe).
// @consumers: E2eContext
// @tasks: TSK-60

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getContext } from './setup.ts';

function cleanupDirectivesDir(): void {
  const { cwd } = getContext();
  try {
    rmSync(join(cwd, 'ai', 'directives'), { recursive: true, force: true });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'EACCES' || e.code === 'EBUSY') {
      process.stderr.write(`sync afterEach cleanup warning: ${e.message}\n`);
      return;
    }
    throw err;
  }
}

export function registerSyncTests(): void {
  describe('sync', () => {
    describe('first and repeat run', () => {
      it('should sync directives on first run', async () => {
        const { spawn } = getContext();
        const result = await spawn(['sync']);
        assert.strictEqual(result.exitCode, 0);
        assert.match(result.stdout, /Synced:/);
        assert.match(result.stdout, /added/);
      });

      it('should report unchanged on repeat run', async () => {
        const { spawn } = getContext();
        const result = await spawn(['sync']);
        assert.strictEqual(result.exitCode, 0);
        assert.match(result.stdout, /unchanged/);
      });
    });

    describe('other scenarios', () => {
      afterEach(cleanupDirectivesDir);

      it('should support --dry-run', async () => {
        const { spawn } = getContext();
        const result = await spawn(['sync', '--dry-run']);
        assert.strictEqual(result.exitCode, 0);
        assert.match(result.stdout, /Dry-run: no files written/);
      });

      it('should filter by subdirectory', async () => {
        const { spawn } = getContext();
        const result = await spawn(['sync', 'sdd']);
        assert.strictEqual(result.exitCode, 0);
      });

      it('should fail on nonexistent subdirectory', async () => {
        const { spawn } = getContext();
        const result = await spawn(['sync', 'nonexistent/']);
        assert.strictEqual(result.exitCode, 1);
      });

      it('should not contain dev-machine paths in synced directives', async () => {
        const { spawn, cwd } = getContext();
        await spawn(['sync']);
        const auditPath = join(cwd, 'ai', 'directives', 'sdd', 'audit.directive.xml');
        assert.ok(existsSync(auditPath), 'audit.directive.xml should exist after sync');
        const content = readFileSync(auditPath, 'utf-8');
        assert.ok(!content.includes('~/Developer/gennady'), 'should not contain dev-machine paths');
        assert.ok(content.includes('npx gennady'), 'should contain production npx gennady');
      });
    });
  });
}
