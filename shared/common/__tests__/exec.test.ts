// @file: Unit tests for execSyncSafe — real subprocess exec (no mocking needed: exit codes are deterministic shell behavior), covering the expectedExitCodes suppression added for gennady yagni / sdd-check.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSyncSafe } from '../exec.ts';
import { logger } from '../logger.ts';

describe('execSyncSafe', () => {
  it('returns stdout on success', () => {
    assert.strictEqual(execSyncSafe('echo hello').trim(), 'hello');
  });

  it('returns "" on failure and logs an error by default', () => {
    const calls: unknown[] = [];
    const original = logger.error;
    logger.error = ((...args: unknown[]) => {
      calls.push(args);
    }) as typeof logger.error;
    try {
      const out = execSyncSafe('exit 1');
      assert.strictEqual(out, '');
      assert.strictEqual(calls.length, 1);
    } finally {
      logger.error = original;
    }
  });

  it('suppresses the error log when the exit code is in expectedExitCodes', () => {
    const calls: unknown[] = [];
    const original = logger.error;
    logger.error = ((...args: unknown[]) => {
      calls.push(args);
    }) as typeof logger.error;
    try {
      const out = execSyncSafe('exit 1', { expectedExitCodes: [1] });
      assert.strictEqual(out, '');
      assert.strictEqual(calls.length, 0);
    } finally {
      logger.error = original;
    }
  });

  it('still logs when the exit code is NOT in expectedExitCodes', () => {
    const calls: unknown[] = [];
    const original = logger.error;
    logger.error = ((...args: unknown[]) => {
      calls.push(args);
    }) as typeof logger.error;
    try {
      const out = execSyncSafe('exit 2', { expectedExitCodes: [1] });
      assert.strictEqual(out, '');
      assert.strictEqual(calls.length, 1);
    } finally {
      logger.error = original;
    }
  });

  it('grep-style: exit 1 (no match) suppressed, stdout empty', () => {
    const calls: unknown[] = [];
    const original = logger.error;
    logger.error = ((...args: unknown[]) => {
      calls.push(args);
    }) as typeof logger.error;
    try {
      const out = execSyncSafe(
        "grep -F 'definitely-not-present-xyz' /dev/null 2>/dev/null",
        { expectedExitCodes: [1] }
      );
      assert.strictEqual(out, '');
      assert.strictEqual(calls.length, 0);
    } finally {
      logger.error = original;
    }
  });
});
