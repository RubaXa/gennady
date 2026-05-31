// @file: E2E tests for the lint command — 8 scenarios.
// @consumers: E2eContext
// @tasks: TSK-60

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getContext } from './setup.ts';

export function registerLintTests(): void {
  describe('lint', () => {
    it('should pass a clean file', async () => {
      const { spawn } = getContext();
      const result = await spawn(['lint', 'src/clean.ts']);
      assert.strictEqual(result.exitCode, 0);
      assert.match(result.stdout, /linting → clean/);
    });

    it('should fail on missing @file:', async () => {
      const { spawn } = getContext();
      const result = await spawn(['lint', 'src/no-header.ts']);
      assert.strictEqual(result.exitCode, 1);
      assert.match(result.stdout, /ERR_CLI_LINT_MISSING_FILE/);
    });

    it('should fail on missing @consumers:', async () => {
      const { spawn } = getContext();
      const result = await spawn(['lint', 'src/no-consumers.ts']);
      assert.strictEqual(result.exitCode, 1);
      assert.match(result.stdout, /ERR_CLI_LINT_MISSING_CONSUMERS/);
    });

    it('should fail on unpaired anchor', async () => {
      const { spawn } = getContext();
      const result = await spawn(['lint', 'src/bad-anchor.ts']);
      assert.strictEqual(result.exitCode, 1);
      assert.match(result.stdout, /ERR_CLI_LINT_ANCHOR_UNPAIRED_START/);
    });

    it('should report autofix on DBC errors', async () => {
      const { spawn } = getContext();
      const result = await spawn(['lint', '--autofix', 'src/needs-autofix.ts']);
      assert.strictEqual(result.exitCode, 0);
      assert.match(result.stdout, /Auto-fixed:/);
    });

    it('should run --staged mode', async () => {
      const { spawn } = getContext();
      const result = await spawn(['lint', '--staged']);
      assert.strictEqual(result.exitCode, 0);
    });

    it('should lint a directory', async () => {
      const { spawn } = getContext();
      const result = await spawn(['lint', 'src/']);
      assert.strictEqual(result.exitCode, 1);
    });

    it('should fail on nonexistent path', async () => {
      const { spawn } = getContext();
      const result = await spawn(['lint', 'nonexistent/']);
      assert.strictEqual(result.exitCode, 1);
      assert.match(result.stdout, /ERR_CLI_LINT_RESOLVE_FAILED/);
    });
  });
}
