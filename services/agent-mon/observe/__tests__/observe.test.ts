// @file: Unit tests for observe — continuous async iterable over session changes
// @consumers: observe, cli
// @tasks: TSK-38

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { observe } from '../observe.ts';
import type { AgentSession } from '../../model/agent-session.type.ts';

/**
 * @purpose Minimal valid AgentSession factory for contract-level testing.
 * Creates a session with all required fields populated; optional fields default to undefined.
 */
function makeSession(overrides?: Partial<AgentSession>): AgentSession {
  return {
    provider: 'mock',
    pid: 1,
    sessionId: 'sess-default',
    title: 'Test Session',
    cwd: '/mock',
    status: 'active',
    startedAt: 1000,
    elapsedSeconds: 0,
    ...overrides,
  };
}

/**
 * @purpose Create a mock AgentMonitor-like object with a scanAll that returns preset snapshots per call index.
 * Uses native mock.fn() for call tracking.
 * @param snapshots Array of AgentSession[][] — each element is the return value for successive scanAll() calls.
 */
function mockMonitor(snapshots: AgentSession[][]): { scanAll: ReturnType<typeof mock.fn> } {
  let callIndex = 0;
  return {
    scanAll: mock.fn(async (): Promise<AgentSession[]> => {
      const result = snapshots[callIndex];
      callIndex += 1;
      // purpose: pass through the snapshot — undefined index means the mock was called more times than snapshots provided
      if (result === undefined) {
        return [];
      }
      return result;
    }),
  };
}

/**
 * @purpose Collect the first N yields from an observe async iterable and break the loop.
 * Protects against infinite loop via a safety timeout.
 */
async function collectYields(
  iterable: AsyncIterable<unknown>,
  count: number,
  timeoutMs: number = 5000
): Promise<unknown[]> {
  const results: unknown[] = [];
  const safetyTimer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('collectYields timeout')), timeoutMs)
  );

  const consume = (async () => {
    for await (const value of iterable) {
      results.push(value);
      if (results.length >= count) break;
    }
  })();

  await Promise.race([consume, safetyTimer]);
  return results;
}

describe('observe', () => {
  it('first iteration yields after second scan', async () => {
    // purpose: verify baseline contract — first scanAll result is NOT yielded, second scanAll result is diff'ed and yielded
    // contract: first yield contains SessionChanges reflecting the diff between baseline and second scan
    // observation focus: the first yield should contain the new session as added, NOT the baseline sessions

    // #region START_FIRST_YIELD_SETUP_MONITOR
    const baselineSession = makeSession({ sessionId: 'base', startedAt: 100 });
    const newSession = makeSession({ sessionId: 'new', startedAt: 200 });
    const monitor = mockMonitor([[baselineSession], [baselineSession, newSession]]);
    // #endregion END_FIRST_YIELD_SETUP_MONITOR

    // #region START_FIRST_YIELD_TRIGGER_ITERATE
    const iterable = observe(monitor as any, { interval: 100 });
    const results = await collectYields(iterable, 1);
    // #endregion END_FIRST_YIELD_TRIGGER_ITERATE

    // #region START_FIRST_YIELD_ASSERT_CHANGES
    assert.strictEqual(results.length, 1);
    const firstYield = results[0] as any;
    assert.strictEqual(firstYield.added.length, 1);
    assert.strictEqual(firstYield.added[0].sessionId, 'new');
    assert.strictEqual(firstYield.removed.length, 0);
    assert.strictEqual(firstYield.updated.length, 0);
    // #endregion END_FIRST_YIELD_ASSERT_CHANGES

    // #region START_FIRST_YIELD_ASSERT_CALL_COUNT
    // invariant: scanAll called twice — once for baseline, once for the yielding cycle
    assert.strictEqual(monitor.scanAll.mock.callCount(), 2);
    // #endregion END_FIRST_YIELD_ASSERT_CALL_COUNT
  });

  it('interval honored between iterations', async () => {
    // purpose: verify polling interval contract — the delay between scanAll calls respects opts.interval
    // contract: setTimeout delay must be >= opts.interval ms before the next scanAll and subsequent yield
    // observation focus: measure wall-clock time from iteration start to first yield

    // #region START_INTERVAL_SETUP_MONITOR
    const session1 = makeSession({ sessionId: 's1', startedAt: 100 });
    const session2 = makeSession({ sessionId: 's2', startedAt: 200 });
    const monitor = mockMonitor([[session1], [session1, session2]]);
    // #endregion END_INTERVAL_SETUP_MONITOR

    // #region START_INTERVAL_TRIGGER_ITERATE
    const intervalMs = 200;
    const iterable = observe(monitor as any, { interval: intervalMs });
    const start = performance.now();
    const results = await collectYields(iterable, 1);
    const elapsed = performance.now() - start;
    // #endregion END_INTERVAL_TRIGGER_ITERATE

    // #region START_INTERVAL_ASSERT_TIMING
    assert.strictEqual(results.length, 1);
    // invariant: elapsed wall-clock time must be >= configured interval (allow minor clock drift threshold)
    assert.ok(
      elapsed >= intervalMs - 5,
      `expected elapsed >= ${intervalMs}ms, got ${elapsed.toFixed(1)}ms`
    );
    // #endregion END_INTERVAL_ASSERT_TIMING
  });

  it('continues on provider failure', async () => {
    // purpose: verify graceful degradation contract — scanAll failure yields empty SessionChanges and the loop continues
    // contract: error during scan cycle must NOT abort the generator; next successful cycle must yield real changes
    // failure mode: observe must not throw; must yield empty changes on failure, then real changes on recovery

    // #region START_FAILURE_SETUP_MONITOR
    const baselineSession = makeSession({ sessionId: 'base', startedAt: 100 });
    const newSession = makeSession({ sessionId: 'recovered', startedAt: 200 });

    let callIndex = 0;
    const monitor = {
      scanAll: mock.fn(async (): Promise<AgentSession[]> => {
        callIndex += 1;
        // purpose: call 1 = baseline, call 2 = throw (simulate failure), call 3 = new session (recovery)
        if (callIndex === 1) return [baselineSession];
        if (callIndex === 2) throw new Error('provider crash');
        return [baselineSession, newSession];
      }),
    };
    // #endregion END_FAILURE_SETUP_MONITOR

    // #region START_FAILURE_TRIGGER_ITERATE
    const iterable = observe(monitor as any, { interval: 100 });
    const results = await collectYields(iterable, 2);
    // #endregion END_FAILURE_TRIGGER_ITERATE

    // #region START_FAILURE_ASSERT_DEGRADED_YIELD
    assert.strictEqual(results.length, 2);
    // first yield after failure → empty SessionChanges
    const degradedYield = results[0] as any;
    assert.strictEqual(degradedYield.added.length, 0);
    assert.strictEqual(degradedYield.removed.length, 0);
    assert.strictEqual(degradedYield.updated.length, 0);
    // #endregion END_FAILURE_ASSERT_DEGRADED_YIELD

    // #region START_FAILURE_ASSERT_RECOVERY_YIELD
    // second yield after recovery → real changes
    const recoveredYield = results[1] as any;
    assert.strictEqual(recoveredYield.added.length, 1);
    assert.strictEqual(recoveredYield.added[0].sessionId, 'recovered');
    // #endregion END_FAILURE_ASSERT_RECOVERY_YIELD
  });

  it('idle threshold triggers status change', async () => {
    // purpose: verify idle detection contract — sessions with lastActivityAt beyond idleThresholdMs get status 'idle'
    // contract: applyIdleDetection runs before diff, so status change from 'active' to 'idle' appears in updated
    // failure mode: the idle detection must run on both baseline and current scan results

    // #region START_IDLE_SETUP_SESSIONS
    const now = Date.now();
    // baseline: session with recent lastActivityAt → stays 'active' after idle detection
    const activeSession = makeSession({
      sessionId: 'idle-test',
      startedAt: 100,
      status: 'active' as const,
      lastActivityAt: now - 1000,
    });
    // second scan: same session but with old lastActivityAt → idle detection sets status to 'idle'
    const idleSession = makeSession({
      sessionId: 'idle-test',
      startedAt: 100,
      status: 'active' as const,
      lastActivityAt: now - 600_000,
    });
    const monitor = mockMonitor([[activeSession], [idleSession]]);
    // #endregion END_IDLE_SETUP_SESSIONS

    // #region START_IDLE_TRIGGER_ITERATE
    const idleThresholdMs = 300_000;
    const iterable = observe(monitor as any, { interval: 100, idleThresholdMs });
    const results = await collectYields(iterable, 1);
    // #endregion END_IDLE_TRIGGER_ITERATE

    // #region START_IDLE_ASSERT_UPDATED
    assert.strictEqual(results.length, 1);
    const firstYield = results[0] as any;
    // invariant: the session must appear in updated with status changed to 'idle'
    assert.strictEqual(firstYield.updated.length, 1);
    assert.strictEqual(firstYield.updated[0].sessionId, 'idle-test');
    assert.strictEqual(firstYield.updated[0].status, 'idle');
    assert.strictEqual(firstYield.added.length, 0);
    assert.strictEqual(firstYield.removed.length, 0);
    // #endregion END_IDLE_ASSERT_UPDATED
  });

  it('throws RangeError on interval below minimum', async () => {
    // purpose: verify DbC precondition — interval < 100ms must throw RangeError per contract
    // contract: RangeError with a message mentioning the minimum and the actual value

    // #region START_RANGE_ERROR_TRIGGER_AND_ASSERT
    const monitor = mockMonitor([[]]);
    const iterable = observe(monitor as any, { interval: 50 });
    const iterator = iterable[Symbol.asyncIterator]();
    await assert.rejects(
      () => iterator.next(),
      (error: unknown) => {
        assert.ok(error instanceof RangeError);
        assert.match((error as Error).message, /interval/);
        assert.match((error as Error).message, /100/);
        return true;
      }
    );
    // #endregion END_RANGE_ERROR_TRIGGER_AND_ASSERT
  });
});
