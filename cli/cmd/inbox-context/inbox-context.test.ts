// @file: Unit test for inbox-context TTL constant import.
// @consumers: node:test runner
// @tasks: TSK-93

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WORKTREE_TTL_MS } from '../vcs-worktree/_core/logic/worktree-ops.logic.ts';

describe('WORKTREE_TTL_MS', () => {
  it('equals 7 days (604800000 ms)', () => {
    assert.strictEqual(WORKTREE_TTL_MS, 7 * 24 * 60 * 60 * 1000);
    assert.strictEqual(WORKTREE_TTL_MS, 604800000);
  });
});
