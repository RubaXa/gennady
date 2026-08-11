// @file: Shared AgentRuntimePort contract for deterministic and intercepted-network adapters.
// @consumers: node:test runner
// @tasks: TSK-175

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setupMockAgent } from '#utils/test/mock-http.ts';
import { AgentCoverageTrace } from '../agent-coverage-trace.ts';
import { OpenCodeMock } from '../opencode.mock.ts';
import { OpenCodeAgentAdapter } from '../opencode.real.ts';
import type { AgentRuntimePort, AgentRuntimeResult } from '../opencode.port.ts';
import type { OutcomeClass } from '../errors.ts';

const BASE_URL = 'http://agent-runtime-contract.test';

type AgentRuntimeContractContext = {
  network: ReturnType<typeof setupMockAgent>;
  deterministic: OpenCodeMock;
  intercepted: OpenCodeAgentAdapter;
};

function createAgentRuntimeContractContext(): AgentRuntimeContractContext {
  return {
    network: setupMockAgent(),
    deterministic: new OpenCodeMock(),
    intercepted: new OpenCodeAgentAdapter({ baseUrl: BASE_URL }),
  };
}

describe('AgentRuntimePort', () => {
  let context: AgentRuntimeContractContext;

  beforeEach(() => {
    context = createAgentRuntimeContractContext();
  });

  afterEach(() => {
    context.network.cleanup();
  });

  it('agent runtime contracts require exhaustive outcomes and attribution', async () => {
    // contract: both adapter modes return the same attributed terminal-result vocabulary
    // failure mode: an absent tool trace cannot be promoted to coverage evidence

    // #region START_RUNTIME_CONTRACT_SETUP_ADAPTERS
    context.deterministic.seed('contract-ok', { verdict: 'approve' });
    context.deterministic.seedToolCalls('contract-ok', ['src/review.ts']);
    const deterministicSession = await context.deterministic.createSession({
      title: 'contract-ok',
      directory: '/workspace',
      tools: true,
    });
    context.network.interceptOnce('POST', `${BASE_URL}/session`, {
      status: 200,
      body: { id: 'intercepted-session', title: 'contract-ok', directory: '/workspace' },
    });
    context.network.interceptOnce('POST', `${BASE_URL}/session/intercepted-session/message`, {
      status: 200,
      body: {
        info: { id: 'message-1', role: 'assistant' },
        parts: [{ type: 'text', text: '{"verdict":"approve"}' }],
      },
    });
    const networkTrace = {
      status: 200,
      body: [
        {
          info: { id: 'message-tool-1', role: 'assistant' },
          parts: [
            {
              type: 'tool',
              tool: 'read',
              state: {
                status: 'completed',
                input: { filePath: '/workspace/src/network.ts' },
                time: { start: 0, end: 1 },
                output: 'ok',
              },
            },
          ],
        },
      ],
    };
    context.network.interceptOnce('GET', `${BASE_URL}/session/intercepted-session/message`, {
      status: 200,
      body: [],
    });
    context.network.interceptOnce(
      'GET',
      `${BASE_URL}/session/intercepted-session/message`,
      networkTrace
    );
    const interceptedSession = await context.intercepted.createSession({
      title: 'contract-ok',
      directory: '/workspace',
    });
    // #endregion END_RUNTIME_CONTRACT_SETUP_ADAPTERS

    const requests: Array<[AgentRuntimePort, string]> = [
      [context.deterministic, deterministicSession.sid],
      [context.intercepted, interceptedSession.sid],
    ];
    const results = await Promise.all(
      requests.map(([runtime, sessionId]) =>
        runtime.run({
          sessionId,
          taskId: 'task-contract',
          model: 'llm/test-model',
          prompt: { text: 'contract-ok' },
        })
      )
    );

    // #region START_RUNTIME_CONTRACT_ASSERT_ATTRIBUTION
    for (const result of results) {
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.taskId, 'task-contract');
      assert.strictEqual(result.model, 'llm/test-model');
      assert.match(result.sessionId, /session/);
    }
    assert.strictEqual(results[0]?.trace.length, 1);
    assert.strictEqual(results[1]?.trace.length, 1);
    const failureClasses: Exclude<OutcomeClass, 'OK'>[] = [
      'NO_RESULT',
      'PARSE_ERROR',
      'SCHEMA_MISMATCH',
      'SESSION_ERROR',
      'TIMEOUT',
      'INCOMPLETE_ARTIFACT',
    ];
    for (const outcome of failureClasses) {
      const runtime = new OpenCodeMock();
      runtime.seedError(outcome, outcome);
      const session = await runtime.createSession({ title: outcome, directory: '/workspace' });
      const result = await runtime.run({
        sessionId: session.sid,
        taskId: `task-${outcome}`,
        model: 'llm/test-model',
        prompt: { text: outcome },
      });
      assert.strictEqual(result.ok, false);
      if (result.ok) assert.fail(`expected ${outcome} failure, received success`);
      assert.strictEqual(result.outcome, outcome, `expected classified outcome ${outcome}`);
    }
    const schemaRuntime = new OpenCodeMock();
    schemaRuntime.seed('schema-invalid', { verdict: 42 });
    const schemaSession = await schemaRuntime.createSession({
      title: 'schema-invalid',
      directory: '/workspace',
    });
    const schemaFailure = await schemaRuntime.run({
      sessionId: schemaSession.sid,
      taskId: 'task-schema-invalid',
      model: 'llm/test-model',
      prompt: {
        text: 'schema-invalid',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: { verdict: { type: 'string' } },
            required: ['verdict'],
          },
        },
      },
    });
    assert.strictEqual(schemaFailure.ok, false);
    if (schemaFailure.ok) assert.fail('expected schema mismatch, received success');
    assert.strictEqual(schemaFailure.outcome, 'SCHEMA_MISMATCH');
    assert.strictEqual(schemaFailure.raw, '{"verdict":42}');
    // #endregion END_RUNTIME_CONTRACT_ASSERT_ATTRIBUTION

    assert.throws(
      () =>
        AgentCoverageTrace.validate(
          { sessionId: '', taskId: 'task-contract', model: 'llm/test-model' },
          [{ seq: 0, tool: 'read', input: 'src/review.ts', ms: 0, status: 'completed' }]
        ),
      /\[AgentCoverageTrace\.validate\] Attribution/
    );
    assert.throws(
      () =>
        AgentCoverageTrace.validate(
          { sessionId: deterministicSession.sid, taskId: 'task-contract', model: 'llm/test-model' },
          []
        ),
      /\[AgentCoverageTrace\.validate\] Coverage requires observed tool trace/
    );

    // #region START_RUNTIME_CONTRACT_ASSERT_STREAM_INSPECT_CANCEL
    const inspection = await context.deterministic.inspect({
      sessionId: deterministicSession.sid,
      taskId: 'task-contract',
      model: 'llm/test-model',
    });
    assert.strictEqual(inspection.status, 'completed');
    assert.strictEqual(inspection.trace.length, 1);
    const streamed: AgentRuntimeResult[] = [];
    for await (const event of context.deterministic.stream({
      sessionId: deterministicSession.sid,
      taskId: 'task-contract-stream',
      model: 'llm/test-model',
      prompt: { text: 'contract-ok' },
    })) {
      streamed.push(event);
    }
    assert.strictEqual(streamed.length, 1);
    await context.deterministic.cancel(deterministicSession.sid);
    assert.strictEqual(await context.deterministic.status(deterministicSession.sid), 'terminated');
    // #endregion END_RUNTIME_CONTRACT_ASSERT_STREAM_INSPECT_CANCEL
  });
});
