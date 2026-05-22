// @file: Unit tests for isWaitingForUser — heuristic detection of operator waiting state
// @consumers: test
// @tasks: TSK-45

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isWaitingForUser } from '../is-waiting.ts';
import type { AgentSession } from '../../../../../services/agent-mon/model/agent-session.type.ts';

/**
 * @purpose Minimal valid AgentSession factory for heuristic testing.
 */
function makeSession(overrides?: Partial<AgentSession>): AgentSession {
  return {
    provider: 'test',
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

describe('isWaitingForUser', () => {
  it('detects question in last message', () => {
    // contract: question mark at end or choose/select/pick/вариант/выбери keywords trigger true
    const session = makeSession({ lastMessage: 'Choose variant?' });
    assert.strictEqual(isWaitingForUser(session), true);
  });

  it('no false positive on regular message', () => {
    // failure mode: routine status messages must not be flagged as waiting
    const session = makeSession({ lastMessage: 'Running type-check...' });
    assert.strictEqual(isWaitingForUser(session), false);
  });

  it('returns false when lastMessage is absent', () => {
    // invariant: no lastMessage → cannot be waiting
    const session = makeSession();
    assert.strictEqual(isWaitingForUser(session), false);
  });
});
