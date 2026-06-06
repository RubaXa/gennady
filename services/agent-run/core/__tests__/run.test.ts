// @file: Unit tests for run() and listEngines() public entry points.
// @consumers: CI test suite
// @tasks: TSK-62

/**
 * Test Graph:
 *   run()
 *     - runs default engine without calling detect
 *     - defaults timeout to 120000 and passes it to engine
 *     - throws LAUNCH_FAILED on empty task without dispatching
 *     - throws AGENT_NOT_INSTALLED on empty registry
 *   listEngines()  → covered by registry.test.ts (detectAll delegation)
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../run.ts';
import { register, _resetForTest } from '../registry.ts';
import { AgentRunError } from '../agent-run-error.ts';
import type { AgentEngine } from '../ports/agent-engine.port.ts';
import type { RunOptions } from '../run-options.type.ts';

// purpose: single context factory — creates a fake AgentEngine with spy-tracked run/detect
function createFakeEngine(overrides?: {
  id?: string;
  runResult?: { text: string; engine: string };
}): AgentEngine & { runSpy: ReturnType<typeof mock.fn>; detectSpy: ReturnType<typeof mock.fn> } {
  const engineId = overrides?.id ?? 'fake-engine';
  const runResult = overrides?.runResult ?? { text: 'ok', engine: engineId };

  const detectSpy = mock.fn(async () => ({ installed: true, version: '1.0.0' }));
  const runSpy = mock.fn(async (_opts: RunOptions) => runResult);

  return {
    id: engineId,
    detect: detectSpy,
    run: runSpy,
    runSpy,
    detectSpy,
  };
}

describe('run()', () => {
  beforeEach(() => {
    _resetForTest();
  });

  afterEach(() => {
    _resetForTest();
  });

  it('runs default engine without calling detect', async () => {
    // contract: optimistic dispatch — detect() must never be called on the hot path
    // failure mode: do not assert on the result shape — only on detect call count
    const engine = createFakeEngine();
    register(engine);

    await run({ task: 'do something' });

    assert.strictEqual(engine.detectSpy.mock.callCount(), 0);
    assert.strictEqual(engine.runSpy.mock.callCount(), 1);
  });

  it('defaults timeout to 120000 and passes it to engine', async () => {
    // contract: when timeout is absent from RunOptions, engine receives timeout=120000
    const engine = createFakeEngine();
    register(engine);

    await run({ task: 'do something' });

    assert.strictEqual(engine.runSpy.mock.callCount(), 1);
    const passedOptions = engine.runSpy.mock.calls[0]?.arguments[0] as RunOptions;
    assert.strictEqual(passedOptions.timeout, 120_000);
  });

  it('throws LAUNCH_FAILED on empty task without dispatching', async () => {
    // contract: empty/whitespace task is rejected before engine is resolved — no dispatch occurs
    const engine = createFakeEngine();
    register(engine);

    await assert.rejects(
      () => run({ task: '   ' }),
      (error: unknown) => {
        assert.ok(error instanceof AgentRunError);
        assert.strictEqual(error.code, 'LAUNCH_FAILED');
        return true;
      }
    );

    assert.strictEqual(engine.runSpy.mock.callCount(), 0);
    assert.strictEqual(engine.detectSpy.mock.callCount(), 0);
  });

  it('throws AGENT_NOT_INSTALLED on empty registry', async () => {
    // contract: no registered engine → AGENT_NOT_INSTALLED before any detect call
    await assert.rejects(
      () => run({ task: 'do something' }),
      (error: unknown) => {
        assert.ok(error instanceof AgentRunError);
        assert.strictEqual(error.code, 'AGENT_NOT_INSTALLED');
        return true;
      }
    );
  });
});
