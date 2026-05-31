// @file: E2E tests for the orient command — 6 scenarios.
// @consumers: E2eContext
// @tasks: TSK-60

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getContext } from './setup.ts';

export function registerOrientTests(): void {
  describe('orient', () => {
    it('should show project map', async () => {
      const { spawn } = getContext();
      const result = await spawn(['orient']);
      assert.strictEqual(result.exitCode, 0);
    });

    it('should search by task', async () => {
      const { spawn } = getContext();
      const result = await spawn(['orient', '--task=TSK-60']);
      assert.strictEqual(result.exitCode, 0);
      assert.match(result.stdout, /service\.ts|helper\.ts/);
    });

    it('should search by consumer', async () => {
      const { spawn } = getContext();
      const result = await spawn(['orient', '--consumer=FixtureConsumer']);
      assert.strictEqual(result.exitCode, 0);
    });

    it('should search by keyword', async () => {
      const { spawn } = getContext();
      const result = await spawn(['orient', 'fixture']);
      assert.strictEqual(result.exitCode, 0);
    });

    it('should show file detail', async () => {
      const { spawn } = getContext();
      const result = await spawn(['orient', '--file=src/service.ts']);
      assert.strictEqual(result.exitCode, 0);
      assert.match(result.stdout, /@file:/);
      assert.match(result.stdout, /@exports:/);
    });

    it('should show dependency graph', async () => {
      const { spawn } = getContext();
      const result = await spawn(['orient', '--graph']);
      assert.strictEqual(result.exitCode, 0);
    });
  });
}
