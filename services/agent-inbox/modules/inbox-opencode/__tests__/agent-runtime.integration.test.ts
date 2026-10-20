// @file: Agent runtime degradation and strict prompt/schema/TTL integration boundaries.
// @consumers: node:test runner
// @tasks: TSK-175

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ControlledClock } from '../../inbox-core/adapters/controlled-clock.ts';
import { InMemoryJournal } from '../../inbox-core/adapters/in-memory-journal.ts';
import { AgentPromptCompiler } from '../prompt-compile.ts';
import { AgentSchemaRegistry } from '../schema-registry.ts';
import { AgentSessionLifecycle } from '../session-lifecycle.ts';
import { SessionRegistry } from '../session-registry.ts';
import { OpenCodeMock } from '../opencode.mock.ts';
import { OpenCodeAgentAdapter } from '../opencode.real.ts';

type AgentRuntimeIntegrationContext = {
  clock: ControlledClock;
  journal: InMemoryJournal;
  registry: SessionRegistry;
  runtime: OpenCodeMock;
};

function createAgentRuntimeIntegrationContext(): AgentRuntimeIntegrationContext {
  return {
    clock: new ControlledClock('2026-08-10T10:00:00.000Z'),
    journal: new InMemoryJournal(),
    registry: new SessionRegistry(),
    runtime: new OpenCodeMock(),
  };
}

describe('AgentRuntimePort integration boundaries', () => {
  it('runtime failure is visible and never fabricates output', async () => {
    const runtime = new OpenCodeAgentAdapter({ baseUrl: 'http://127.0.0.1:19999' });
    const result = await runtime.run({
      sessionId: 'unavailable-session',
      taskId: 'task-unavailable',
      model: 'llm/test-model',
      prompt: { text: 'review unavailable runtime' },
    });

    assert.strictEqual(result.ok, false);
    if (result.ok) assert.fail('expected unavailable runtime failure, received success');
    assert.strictEqual(result.outcome, 'SESSION_ERROR');
    assert.strictEqual(result.retry.action, 'fresh_run');
    assert.strictEqual('output' in result, false);
  });

  it('pointer prompt schema failure and session expiry preserve strict runtime boundaries', async () => {
    // contract: prompt provenance, raw schema evidence and TTL decisions remain explicit

    // #region START_STRICT_BOUNDARIES_SETUP
    const context = createAgentRuntimeIntegrationContext();
    const compiler = new AgentPromptCompiler({ templateDir: 'nonexistent/templates' });
    const schemas = new AgentSchemaRegistry();
    schemas.register('review-result@1', {
      type: 'object',
      properties: { verdict: { type: 'string' } },
      required: ['verdict'],
      additionalProperties: false,
    });
    const prompt = compiler.compile({
      taskPointer: 'tasks/review.task.md',
      repositoryRoot: '/workspace/gennady',
      sha: '89c07ef',
      artifactAddresses: ['artifact://review/evidence-1'],
      mr: 'group/project!1',
      model: 'llm/test-model',
    });
    const raw = '{"verdict":42,"fabricated":"repository content"}';
    const schemaResult = schemas.validate('review-result@1', JSON.parse(raw), raw);
    const lifecycle = new AgentSessionLifecycle(
      context.registry,
      context.journal,
      context.runtime,
      { idleTtlMs: 45 * 60 * 1000, clock: context.clock }
    );
    const expired = await context.runtime.createSession({
      title: 'producer-expired',
      directory: '/workspace',
    });
    context.registry.register({
      sessionId: expired.sid,
      taskId: 'producer-expired',
      mr: 'group/project!1',
      artifacts: [],
      state: 'park',
      parkedAt: context.clock.now(),
      context: 'producer',
      runtimeNamespace: 'test',
    });
    await context.runtime.park(expired.sid);
    context.registry.register({
      sessionId: 'operator-mr-1',
      taskId: 'operator-1',
      mr: 'group/project!1',
      artifacts: [],
      state: 'work',
      context: 'operator',
      runtimeNamespace: 'test',
    });
    context.registry.register({
      sessionId: 'operator-mr-2',
      taskId: 'operator-2',
      mr: 'group/project!2',
      artifacts: [],
      state: 'work',
      context: 'operator',
      runtimeNamespace: 'test',
    });
    // #endregion END_STRICT_BOUNDARIES_SETUP

    // #region START_STRICT_BOUNDARIES_TRIGGER_EXPIRY
    context.clock.advanceTo('2026-08-10T10:46:00.000Z');
    const expiredRoute = await lifecycle.route({
      policy: 'coverage_retry',
      taskId: 'coverage-retry',
      producerTaskId: 'producer-expired',
      mr: 'group/project!1',
      runtimeNamespace: 'test',
    });
    const operatorOne = await lifecycle.route({
      policy: 'operator',
      taskId: 'operator-question-1',
      mr: 'group/project!1',
      runtimeNamespace: 'test',
    });
    const operatorTwo = await lifecycle.route({
      policy: 'operator',
      taskId: 'operator-question-2',
      mr: 'group/project!2',
      runtimeNamespace: 'test',
    });
    const operatorWrongProfile = await lifecycle.route({
      policy: 'operator',
      taskId: 'operator-question-cross-profile',
      mr: 'group/project!1',
      runtimeNamespace: 'mock',
    });
    // #endregion END_STRICT_BOUNDARIES_TRIGGER_EXPIRY

    // #region START_STRICT_BOUNDARIES_ASSERT_EVIDENCE
    assert.match(prompt.task, /SHA: 89c07ef/);
    assert.match(prompt.task, /artifact:\/\/review\/evidence-1/);
    assert.doesNotMatch(prompt.task, /fabricated repository content/);
    assert.strictEqual(schemaResult.ok, false);
    if (schemaResult.ok) assert.fail('expected schema validation failure, received success');
    assert.strictEqual(schemaResult.error.raw, raw);
    assert.strictEqual(schemaResult.error.retry?.action, 'continue');
    assert.deepStrictEqual(expiredRoute, { action: 'fresh', reason: 'expired_context' });
    assert.deepStrictEqual(operatorOne, { action: 'continue', sessionId: 'operator-mr-1' });
    assert.deepStrictEqual(operatorTwo, { action: 'continue', sessionId: 'operator-mr-2' });
    assert.deepStrictEqual(operatorWrongProfile, {
      action: 'fresh',
      reason: 'missing_context',
    });
    // #endregion END_STRICT_BOUNDARIES_ASSERT_EVIDENCE
  });
});
