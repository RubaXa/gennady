// @file: Integration tests for run() — CLI entry point with mock monitor
// @consumers: test
// @tasks: TSK-47

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentSession } from '../../../../../services/agent-mon/model/agent-session.type.ts';
import type { AgentMonitor } from '../../../../../services/agent-mon/monitor/agent-monitor.ts';

// ── Shared factory ──────────────────────────────────────────────────────────

/**
 * @purpose Minimal valid AgentSession factory for run() tests.
 */
function makeSession(overrides?: Partial<AgentSession>): AgentSession {
  return {
    provider: 'claude',
    pid: 123,
    sessionId: 's-1',
    title: 'Test Session',
    cwd: '/tmp/test',
    status: 'active',
    startedAt: 1000,
    elapsedSeconds: 10,
    ...overrides,
  };
}

// ── Mocks ───────────────────────────────────────────────────────────────────

// Capture stderr written by printUsageAndExit
let stderrOutput = '';
const originalStderrWrite = process.stderr.write.bind(process.stderr);
mock.method(process.stderr, 'write', (chunk: any, ...args: any[]) => {
  stderrOutput += String(chunk);
  return (originalStderrWrite as any)(chunk, ...args);
});

// Mock process.exit to throw — prevents the test process from being killed
const EXIT_SIGNAL = Symbol('process.exit');
const exitFn = mock.fn((_code?: number) => {
  throw EXIT_SIGNAL;
});
mock.method(process, 'exit', exitFn);

// Mock ink render — avoids real TTY rendering in tests
const waitUntilExitFn = mock.fn(async () => {});
const renderFn = mock.fn(() => ({ waitUntilExit: waitUntilExitFn }));

// Stub React components — never rendered (renderFn is mocked), but needed for transitive imports
const StubText = () => null;
const StubBox = () => null;
const stubUseInput = () => {};
const stubUseApp = () => ({});

mock.module('ink', {
  namedExports: {
    render: renderFn,
    Box: StubBox,
    Text: StubText,
    useInput: stubUseInput,
    useApp: stubUseApp,
  },
});

// Mock createProviders — returns a controlled monitor with a stubbed scanAll
const scanAllFn = mock.fn(
  async () => [makeSession({ title: 'Test', sessionId: 's-1' })] as AgentSession[]
);
const mockMonitor = { scanAll: scanAllFn } as unknown as AgentMonitor;
const createProvidersFn = mock.fn(() => mockMonitor);
mock.module('../create-providers.ts', {
  namedExports: { createProviders: createProvidersFn },
});

// Mock AgentMonApp (.tsx) — prevent node from loading the .tsx file
// which is unsupported without --import tsx
const StubAgentMonApp = () => null;
mock.module('../../ui/app.tsx', {
  namedExports: { AgentMonApp: StubAgentMonApp },
});

// After all mocks are registered, import the SUT
const { run } = await import('../run.ts');

// ── Tests ───────────────────────────────────────────────────────────────────

describe('run', () => {
  beforeEach(() => {
    stderrOutput = '';
    scanAllFn.mock.resetCalls();
    renderFn.mock.resetCalls();
    exitFn.mock.resetCalls();
    waitUntilExitFn.mock.resetCalls();
    createProvidersFn.mock.resetCalls();
  });

  it('prints table and exits with --once', async () => {
    // contract: --once mode performs single scan, renders snapshot, exits 0
    // failure mode: scanAll not called → monitor not wired into --once path

    // #region START_RUN_ONCE_TRIGGER — expected: process.exit(0) throws EXIT_SIGNAL
    try {
      await run(['--once']);
    } catch (e) {
      assert.strictEqual(e, EXIT_SIGNAL);
    }
    // #endregion END_RUN_ONCE_TRIGGER

    // #region START_RUN_ONCE_ASSERT — scanAll called once, render called, exit(0)
    assert.strictEqual(scanAllFn.mock.callCount(), 1);
    assert.strictEqual(renderFn.mock.callCount(), 1);

    // process.exit was called at least once
    const exitCalls = exitFn.mock.calls;
    assert.ok(exitCalls.length >= 1);

    // Last exit call should be exit(0) for --once success
    const lastExitCode = exitCalls[exitCalls.length - 1].arguments[0];
    assert.strictEqual(lastExitCode, 0);
    // #endregion END_RUN_ONCE_ASSERT
  });

  it('exits 1 on unknown flag', async () => {
    // contract: unknown flag triggers usage text on stderr and exit 1
    // failure mode: exit code not 1 → flag validation not enforced

    // #region START_RUN_UNKNOWN_FLAG_TRIGGER — expected: process.exit(1) throws EXIT_SIGNAL
    try {
      await run(['--unknown']);
      assert.fail('Expected process.exit to be called');
    } catch (e) {
      assert.strictEqual(e, EXIT_SIGNAL);
    }
    // #endregion END_RUN_UNKNOWN_FLAG_TRIGGER

    // #region START_RUN_UNKNOWN_FLAG_ASSERT — stderr contains usage text, exit(1)
    // stderr contains usage
    assert.match(stderrOutput, /Usage/);

    // process.exit called with code 1
    const exitCalls = exitFn.mock.calls;
    assert.ok(exitCalls.length >= 1);
    assert.strictEqual(exitCalls[exitCalls.length - 1].arguments[0], 1);
    // #endregion END_RUN_UNKNOWN_FLAG_ASSERT
  });
});
