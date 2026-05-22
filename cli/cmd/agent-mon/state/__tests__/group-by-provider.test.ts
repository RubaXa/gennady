// @file: Unit tests for groupByProvider — session grouping and sort-order contract
// @consumers: test
// @tasks: TSK-45

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { groupByProvider } from '../group-by-provider.ts';
import type { AgentSession } from '../../../../../services/agent-mon/model/agent-session.type.ts';

/**
 * @purpose Minimal valid AgentSession factory for grouping tests.
 */
function makeSession(overrides?: Partial<AgentSession>): AgentSession {
  return {
    provider: 'claude',
    pid: 42,
    sessionId: 'sess-1',
    title: 'Test Session',
    cwd: '/tmp/test',
    status: 'active',
    startedAt: 1000,
    elapsedSeconds: 10,
    ...overrides,
  };
}

describe('groupByProvider', () => {
  it('groups by provider with sort order', () => {
    // contract: sessions grouped by provider, sorted active→waiting→idle→completed
    // invariant: counts reflect exact session statuses per column
    // observation focus: provider grouping + sort order + count correctness
    const claudeActive = makeSession({ provider: 'claude', sessionId: 'c1', status: 'active' });
    const claudeIdle = makeSession({ provider: 'claude', sessionId: 'c2', status: 'idle' });
    const opencodeActive = makeSession({ provider: 'opencode', sessionId: 'o1', status: 'active' });

    // #region START_GROUP_BY_PROVIDER_SETUP_SESSIONS
    const sessions = [claudeActive, claudeIdle, opencodeActive];
    // #endregion END_GROUP_BY_PROVIDER_SETUP_SESSIONS

    const columns = groupByProvider(sessions);

    // #region START_GROUP_BY_PROVIDER_ASSERT_STRUCTURE
    assert.strictEqual(columns.length, 2);

    const claudeCol = columns.find(c => c.provider === 'claude')!;
    const opencodeCol = columns.find(c => c.provider === 'opencode')!;

    // Claude column: 2 sessions, active before idle
    assert.strictEqual(claudeCol.activeCount, 1);
    assert.strictEqual(claudeCol.idleCount, 1);
    assert.strictEqual(claudeCol.waitingCount, 0);
    assert.strictEqual(claudeCol.sessions.length, 2);
    assert.strictEqual(claudeCol.sessions[0].sessionId, 'c1');
    assert.strictEqual(claudeCol.sessions[0].status, 'active');
    assert.strictEqual(claudeCol.sessions[1].sessionId, 'c2');
    assert.strictEqual(claudeCol.sessions[1].status, 'idle');

    // OpenCode column: 1 session
    assert.strictEqual(opencodeCol.activeCount, 1);
    assert.strictEqual(opencodeCol.sessions.length, 1);
    assert.strictEqual(opencodeCol.sessions[0].sessionId, 'o1');
    assert.strictEqual(opencodeCol.sessions[0].status, 'active');
    // #endregion END_GROUP_BY_PROVIDER_ASSERT_STRUCTURE
  });

  it('returns empty array for empty input', () => {
    // boundary: empty input → empty output
    const columns = groupByProvider([]);
    assert.deepStrictEqual(columns, []);
  });
});
