// @file: Contract-level structural integrity tests for AgentSession type
// @consumers: agent-mon providers, monitor, diff, observe
// @tasks: TSK-35

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentSession } from '../agent-session.type.js';

/**
 * @purpose Minimal valid AgentSession factory for contract-level testing.
 * Creates a session with all required fields populated, leaving optional fields undefined.
 */
function makeSession(overrides?: Partial<AgentSession>): AgentSession {
  return {
    provider: 'test',
    pid: 42,
    sessionId: 'sess-1',
    title: 'Test',
    cwd: '/tmp',
    status: 'active',
    startedAt: 1000,
    elapsedSeconds: 10,
    ...overrides,
  };
}

describe('AgentSession', () => {
  it('session has required fields', () => {
    // purpose: verify contract surface — all 8 required fields are present with correct types
    // contract: AgentSession must expose provider, pid, sessionId, title, cwd, status, startedAt, elapsedSeconds per spec
    // invariant: optional fields default to undefined (never null)

    // #region START_REQUIRED_FIELDS_SETUP
    const session = makeSession();
    // #endregion END_REQUIRED_FIELDS_SETUP

    // #region START_REQUIRED_FIELDS_ASSERT
    assert.strictEqual(session.provider, 'test');
    assert.strictEqual(session.pid, 42);
    assert.strictEqual(session.sessionId, 'sess-1');
    assert.strictEqual(session.title, 'Test');
    assert.strictEqual(session.cwd, '/tmp');
    assert.strictEqual(session.status, 'active');
    assert.strictEqual(session.startedAt, 1000);
    assert.strictEqual(session.elapsedSeconds, 10);
    // #endregion END_REQUIRED_FIELDS_ASSERT
  });

  it('optional fields are undefined by default', () => {
    // purpose: verify contract invariant — all optional fields MUST be undefined, not null
    // contract: parentId, slug, model, agent, completedAt, lastActivityAt, idleSeconds, cpuPercent, memoryMb, toolCallCount, errorCount, lastMessage, tokensInput, tokensOutput are all optional

    // #region START_OPTIONAL_FIELDS_SETUP
    const session = makeSession();
    // #endregion END_OPTIONAL_FIELDS_SETUP

    // #region START_OPTIONAL_FIELDS_ASSERT
    assert.strictEqual(session.parentId, undefined);
    assert.strictEqual(session.slug, undefined);
    assert.strictEqual(session.model, undefined);
    assert.strictEqual(session.agent, undefined);
    assert.strictEqual(session.completedAt, undefined);
    assert.strictEqual(session.lastActivityAt, undefined);
    assert.strictEqual(session.idleSeconds, undefined);
    assert.strictEqual(session.cpuPercent, undefined);
    assert.strictEqual(session.memoryMb, undefined);
    assert.strictEqual(session.toolCallCount, undefined);
    assert.strictEqual(session.errorCount, undefined);
    assert.strictEqual(session.lastMessage, undefined);
    assert.strictEqual(session.tokensInput, undefined);
    assert.strictEqual(session.tokensOutput, undefined);
    // #endregion END_OPTIONAL_FIELDS_ASSERT
  });
});
