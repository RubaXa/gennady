// @file: Unit tests for createProviders — verifies provider registration and filter behavior
// @consumers: test
// @tasks: TSK-47

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentSession } from '../../../../../services/agent-mon/model/agent-session.type.ts';

// ── Shared factory ──────────────────────────────────────────────────────────

/**
 * @purpose Minimal valid AgentSession factory for createProviders tests.
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

// ── Mock provider classes ───────────────────────────────────────────────────

const claudeSession = makeSession({
  provider: 'claude',
  sessionId: 'c-1',
  title: 'Claude Session',
});
const opencodeSession = makeSession({
  provider: 'opencode',
  sessionId: 'o-1',
  title: 'OpenCode Session',
});

// Mock constructors replace imported ClaudeProvider / OpenCodeProvider
const MockClaudeProvider = mock.fn(function (this: any) {
  this.key = 'claude';
  this.scan = mock.fn(async () => [claudeSession]);
});

const MockOpenCodeProvider = mock.fn(function (this: any) {
  this.key = 'opencode';
  this.scan = mock.fn(async () => [opencodeSession]);
});

// Module-level mocks — intercept imports inside create-providers.ts
mock.module('../../../../../services/agent-mon/providers/claude/index.ts', {
  namedExports: { ClaudeProvider: MockClaudeProvider },
});
mock.module('../../../../../services/agent-mon/providers/opencode/index.ts', {
  namedExports: { OpenCodeProvider: MockOpenCodeProvider },
});

// After mocks are registered, import the SUT
const { createProviders } = await import('../create-providers.ts');

describe('createProviders', () => {
  it('registers claude and opencode by default', async () => {
    // contract: no filter → both providers registered, scanAll returns sessions from both
    // invariant: stateless — each call creates a fresh monitor

    const monitor = createProviders();

    // #region START_SCAN_ALL_ASSERT — both mocks return one session each
    const sessions = await monitor.scanAll();
    assert.strictEqual(sessions.length, 2);

    const titles = sessions.map((s) => s.title).sort();
    assert.deepStrictEqual(titles, ['Claude Session', 'OpenCode Session']);
    // #endregion END_SCAN_ALL_ASSERT
  });

  it('registers only claude with filter', async () => {
    // contract: CreateProvidersOpts controls which providers are instantiated
    // failure mode: presence of opencode sessions means filter was ignored

    const monitor = createProviders({ opencode: false });

    const sessions = await monitor.scanAll();
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].title, 'Claude Session');
  });
});
