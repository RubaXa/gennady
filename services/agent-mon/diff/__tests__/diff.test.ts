// @file: Unit tests for diff — contract-driven comparison of AgentSession snapshots
// @consumers: diff, observe, cli
// @tasks: TSK-37

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diff } from '../diff.ts';
import type { AgentSession } from '../../model/agent-session.type.ts';

/**
 * @purpose Minimal valid AgentSession factory for contract-level testing.
 * Creates a session with all required fields populated; optional fields default to undefined.
 */
function makeSession(overrides?: Partial<AgentSession>): AgentSession {
  return {
    provider: 'test',
    pid: 42,
    sessionId: 'sess-default',
    title: 'Test Session',
    cwd: '/tmp/test',
    status: 'active',
    startedAt: 1000,
    elapsedSeconds: 10,
    ...overrides,
  };
}

describe('diff', () => {
  it('new session in added', () => {
    // #region START_NEW_SESSION_SETUP_INPUTS
    const prev: AgentSession[] = [];
    const curr = [makeSession({ sessionId: 'B', title: 'New' })];
    // #endregion END_NEW_SESSION_SETUP_INPUTS

    // #region START_NEW_SESSION_TRIGGER_DIFF
    const result = diff(prev, curr);
    // #endregion END_NEW_SESSION_TRIGGER_DIFF

    // #region START_NEW_SESSION_ASSERT_CHANGES
    assert.strictEqual(result.added.length, 1);
    assert.strictEqual(result.added[0].sessionId, 'B');
    assert.strictEqual(result.removed.length, 0);
    assert.strictEqual(result.updated.length, 0);
    // #endregion END_NEW_SESSION_ASSERT_CHANGES
  });

  it('gone session in removed', () => {
    // #region START_GONE_SESSION_SETUP_INPUTS
    const prev = [makeSession({ sessionId: 'A', title: 'Old' })];
    const curr: AgentSession[] = [];
    // #endregion END_GONE_SESSION_SETUP_INPUTS

    // #region START_GONE_SESSION_TRIGGER_DIFF
    const result = diff(prev, curr);
    // #endregion END_GONE_SESSION_TRIGGER_DIFF

    // #region START_GONE_SESSION_ASSERT_CHANGES
    assert.strictEqual(result.removed.length, 1);
    assert.strictEqual(result.removed[0].sessionId, 'A');
    assert.strictEqual(result.added.length, 0);
    assert.strictEqual(result.updated.length, 0);
    // #endregion END_GONE_SESSION_ASSERT_CHANGES
  });

  it('semantic change triggers updated', () => {
    // #region START_SEMANTIC_CHANGE_SETUP_INPUTS
    const prev = [makeSession({ sessionId: 'C', status: 'active' })];
    const curr = [makeSession({ sessionId: 'C', status: 'completed' })];
    // #endregion END_SEMANTIC_CHANGE_SETUP_INPUTS

    // #region START_SEMANTIC_CHANGE_TRIGGER_DIFF
    const result = diff(prev, curr);
    // #endregion END_SEMANTIC_CHANGE_TRIGGER_DIFF

    // #region START_SEMANTIC_CHANGE_ASSERT_CHANGES
    assert.strictEqual(result.updated.length, 1);
    assert.strictEqual(result.updated[0].sessionId, 'C');
    assert.strictEqual(result.updated[0].status, 'completed');
    assert.strictEqual(result.added.length, 0);
    assert.strictEqual(result.removed.length, 0);
    // #endregion END_SEMANTIC_CHANGE_ASSERT_CHANGES
  });

  it('cpu change does not trigger updated', () => {
    // purpose: verify that changes restricted to excluded fields (cpuPercent, memoryMb) do NOT produce
    // any diff entries — the contract says these fields are noisy and must be ignored
    // contract: SessionChanges with empty added/removed/updated when only excluded fields differ
    // invariant: cpuPercent and memoryMb are excluded from SEMANTIC_FIELDS per diff contract

    // #region START_CPU_CHANGE_SETUP_INPUTS
    const prev = [makeSession({ sessionId: 'D', cpuPercent: 50, memoryMb: 128 })];
    const curr = [makeSession({ sessionId: 'D', cpuPercent: 52, memoryMb: 256 })];
    // #endregion END_CPU_CHANGE_SETUP_INPUTS

    // #region START_CPU_CHANGE_TRIGGER_DIFF
    const result = diff(prev, curr);
    // #endregion END_CPU_CHANGE_TRIGGER_DIFF

    // #region START_CPU_CHANGE_ASSERT_EMPTY
    assert.strictEqual(result.added.length, 0);
    assert.strictEqual(result.removed.length, 0);
    assert.strictEqual(result.updated.length, 0);
    // #endregion END_CPU_CHANGE_ASSERT_EMPTY
  });

  it('empty snapshots produce empty result', () => {
    // #region START_EMPTY_SNAPSHOTS_SETUP_INPUTS
    const prev: AgentSession[] = [];
    const curr: AgentSession[] = [];
    // #endregion END_EMPTY_SNAPSHOTS_SETUP_INPUTS

    // #region START_EMPTY_SNAPSHOTS_TRIGGER_DIFF
    const result = diff(prev, curr);
    // #endregion END_EMPTY_SNAPSHOTS_TRIGGER_DIFF

    // #region START_EMPTY_SNAPSHOTS_ASSERT_EMPTY
    assert.strictEqual(result.added.length, 0);
    assert.strictEqual(result.removed.length, 0);
    assert.strictEqual(result.updated.length, 0);
    // #endregion END_EMPTY_SNAPSHOTS_ASSERT_EMPTY
  });
});
