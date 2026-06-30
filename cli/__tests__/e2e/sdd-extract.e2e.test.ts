// @file: E2E tests for the sdd-extract command — section slice + exit-code contract.
// @consumers: E2eContext
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getContext } from './setup.ts';

export function registerSddExtractTests(): void {
  describe('sdd-extract', () => {
    it('extracts a section body by anchor name (exit 0)', async () => {
      const { spawn } = getContext();
      const result = await spawn(['sdd-extract', 'sdd/ticket.md', 'META']);
      assert.strictEqual(result.exitCode, 0);
      assert.match(result.stdout, /Task-ID/);
      assert.doesNotMatch(result.stdout, /SECTION:META/);
    });

    it('exits 2 with an actionable message when the anchor is absent', async () => {
      const { spawn } = getContext();
      const result = await spawn(['sdd-extract', 'sdd/ticket.md', 'EXECUTION_LOG']);
      assert.strictEqual(result.exitCode, 2);
      assert.match(result.stdout, /ANCHOR_NOT_FOUND/);
    });

    it('exits 3 when markers are unbalanced', async () => {
      const { spawn } = getContext();
      const result = await spawn(['sdd-extract', 'sdd/ticket.md', 'DANGLING']);
      assert.strictEqual(result.exitCode, 3);
      assert.match(result.stdout, /ANCHOR_UNBALANCED/);
    });

    it('exits 4 on a non-canonical section name', async () => {
      const { spawn } = getContext();
      const result = await spawn(['sdd-extract', 'sdd/ticket.md', 'meta']);
      assert.strictEqual(result.exitCode, 4);
      assert.match(result.stdout, /INVALID_NAME/);
    });
  });
}
