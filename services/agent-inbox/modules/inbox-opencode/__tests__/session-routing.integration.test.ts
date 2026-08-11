// @file: Integration proof for same-session producer continuation and accumulated tool trace.
// @consumers: node:test runner
// @tasks: TSK-175

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ControlledClock } from '../../inbox-core/adapters/controlled-clock.ts';
import { InMemoryJournal } from '../../inbox-core/adapters/in-memory-journal.ts';
import { OpenCodeMock } from '../opencode.mock.ts';
import { AgentSessionLifecycle } from '../session-lifecycle.ts';
import { SessionRegistry } from '../session-registry.ts';

type SessionRoutingIntegrationContext = {
  runtime: OpenCodeMock;
  registry: SessionRegistry;
  lifecycle: AgentSessionLifecycle;
};

function createSessionRoutingIntegrationContext(): SessionRoutingIntegrationContext {
  const runtime = new OpenCodeMock();
  const registry = new SessionRegistry();
  return {
    runtime,
    registry,
    lifecycle: new AgentSessionLifecycle(registry, new InMemoryJournal(), runtime, {
      clock: new ControlledClock('2026-08-10T10:00:00.000Z'),
    }),
  };
}

describe('Agent runtime producer continuation', () => {
  it('coverage retry continues the producer session and trace', async () => {
    // contract: coverage correction appends factual trace to the producer session

    // #region START_COVERAGE_CONTINUATION_SETUP_PRODUCER
    const { runtime, registry, lifecycle } = createSessionRoutingIntegrationContext();
    runtime.seed('producer-task', { status: 'reviewed' });
    runtime.seedToolCalls('producer-task', ['src/first.ts']);
    const session = await runtime.createSession({
      title: 'producer-task',
      directory: '/workspace',
      tools: true,
    });
    registry.register({
      sessionId: session.sid,
      taskId: 'producer-task',
      mr: 'group/project!1',
      artifacts: ['artifact://review/producer-task'],
      model: 'llm/test-model',
      state: 'work',
      context: 'producer',
      sha: '89c07ef',
      runtimeNamespace: 'test',
    });
    const initial = await runtime.run({
      sessionId: session.sid,
      taskId: 'producer-task',
      model: 'llm/test-model',
      prompt: { text: 'producer-task' },
    });
    await lifecycle.park(session.sid);
    // #endregion END_COVERAGE_CONTINUATION_SETUP_PRODUCER

    const route = await lifecycle.route({
      policy: 'coverage_retry',
      taskId: 'coverage-retry-1',
      producerTaskId: 'producer-task',
      mr: 'group/project!1',
      runtimeNamespace: 'test',
    });
    assert.deepStrictEqual(route, { action: 'continue', sessionId: session.sid });
    assert.strictEqual(initial.trace.length, 1);
    if (route.action !== 'continue') return;

    const continued = await runtime.continue({
      sessionId: route.sessionId,
      taskId: 'coverage-retry-1',
      model: 'llm/test-model',
      prompt: { text: 'producer-task' },
    });
    assert.strictEqual(continued.sessionId, session.sid);
    assert.strictEqual(continued.trace.length, 2);
  });

  it('coverage retry rejects missing or non-producer semantic context', async () => {
    const { runtime, registry, lifecycle } = createSessionRoutingIntegrationContext();
    const independent = await runtime.createSession({
      title: 'independent-task',
      directory: '/workspace',
    });
    registry.register({
      sessionId: independent.sid,
      taskId: 'independent-task',
      mr: 'group/project!1',
      artifacts: [],
      state: 'work',
      context: 'independent',
      runtimeNamespace: 'test',
    });

    await assert.rejects(
      lifecycle.route({
        policy: 'coverage_retry',
        taskId: 'coverage-retry-missing',
        producerTaskId: '',
        mr: 'group/project!1',
        runtimeNamespace: 'test',
      }),
      /coverage_retry requires a non-empty producerTaskId/
    );
    assert.deepStrictEqual(
      await lifecycle.route({
        policy: 'coverage_retry',
        taskId: 'coverage-retry-wrong-context',
        producerTaskId: 'independent-task',
        mr: 'group/project!1',
        runtimeNamespace: 'test',
      }),
      { action: 'fresh', reason: 'missing_context' }
    );
  });
});
