// @file: Unit tests for registry module: resolve, list, detectAll, _resetForTest.
// @consumers: CI test suite
// @tasks: TSK-62

/**
 * Test Graph:
 *   resolve()
 *     - throws AGENT_NOT_INSTALLED for unregistered engine
 *   detectAll() / listEngines integration
 *     - caches detect across listEngines calls
 *     - degrades gracefully when detect throws
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register, resolve, detectAll, _resetForTest } from '../registry.ts';
import { listEngines } from '../run.ts';
import { AgentRunError } from '../agent-run-error.ts';
import type { AgentEngine } from '../ports/agent-engine.port.ts';
import type { RunOptions } from '../run-options.type.ts';

// purpose: single context factory — creates a fake AgentEngine with spy-tracked run/detect
function createFakeEngine(overrides?: {
  id?: string;
  detectImpl?: () => Promise<{ installed: boolean; version?: string }>;
}): AgentEngine & { detectSpy: ReturnType<typeof mock.fn> } {
  const engineId = overrides?.id ?? 'fake-engine';
  const detectImpl = overrides?.detectImpl ?? (async () => ({ installed: true, version: '1.0.0' }));

  const detectSpy = mock.fn(detectImpl);

  return {
    id: engineId,
    detect: detectSpy,
    run: mock.fn(async (_opts: RunOptions) => ({ text: 'ok', engine: engineId })),
    detectSpy,
  };
}

describe('resolve()', () => {
  beforeEach(() => {
    _resetForTest();
  });

  afterEach(() => {
    _resetForTest();
  });

  it('throws AGENT_NOT_INSTALLED for unregistered engine', async () => {
    register(createFakeEngine({ id: 'engine-a' }));

    await assert.rejects(
      async () => resolve('nonexistent-engine'),
      (error: unknown) => {
        assert.ok(error instanceof AgentRunError);
        assert.strictEqual(error.code, 'AGENT_NOT_INSTALLED');
        assert.match(error.message, /nonexistent-engine/);
        return true;
      }
    );
  });
});

describe('detectAll() / listEngines()', () => {
  beforeEach(() => {
    _resetForTest();
  });

  afterEach(() => {
    _resetForTest();
  });

  it('caches detect across listEngines calls', async () => {
    // contract: detect() called once per engine per process lifetime, even across multiple listEngines() calls
    // observation focus: callCount on detectSpy after 2 listEngines() invocations
    const engine = createFakeEngine({ id: 'cache-engine' });
    register(engine);

    await listEngines();
    await listEngines();

    assert.strictEqual(engine.detectSpy.mock.callCount(), 1);
  });

  it('degrades gracefully when detect throws', async () => {
    // contract: detect() throwing → installed:false returned, no rethrow from detectAll/listEngines
    // failure mode: do not let detect failure bubble up as an unhandled rejection
    const engine = createFakeEngine({
      id: 'broken-engine',
      detectImpl: async () => {
        throw new Error('binary not found');
      },
    });
    register(engine);

    const statuses = await detectAll();

    assert.strictEqual(statuses.length, 1);
    assert.deepStrictEqual(statuses[0], { id: 'broken-engine', installed: false });
  });
});
