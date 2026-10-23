// @file: Post-measurement reflection cannot rewrite evidence or masquerade as measured worker work.
// @spec: AI-SKILLS
// @consumers: authoring-reflection, OpenCode runtime

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { collectAuthoringReflection } from '../authoring-reflection.ts';
import { SddEvalOpenCodeRuntime } from '../opencode-runtime.ts';
import { SddEvalJudge } from '../judge.ts';
import type { SddEvalRuntime, SddEvalUsage, SddEvalJudgeInput } from '../types.ts';
const model = { providerID: 'llm-proxy', modelID: 'deepseek-v4-flash' };
const usage: SddEvalUsage = {
  messages: 2,
  input: 100,
  output: 20,
  reasoning: 10,
  total: 130,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
  complete: true,
  models: ['llm-proxy/deepseek-v4-flash'],
};
it('deadline covers passive metadata and SDK creation before the model call', async () => {
  const keepAlive = setTimeout(() => {}, 200);
  let modelCalls = 0;
  const pending = () => new Promise<never>(() => {});
  try {
    const reflection = collectAuthoringReflection(
      {
        createSession: async () => {
          throw new Error('Unexpected worker creation');
        },
        prompt: async () => {
          throw new Error('Unexpected worker prompt');
        },
        judge: async () => {
          modelCalls++;
          return '';
        },
      },
      {
        readDiff: async () => '',
        readUsage: pending,
        readTail: async () => [],
        readStatus: async () => 'completed',
        readEvents: async () => [],
        readTrajectory: pending,
      },
      {
        sessionId: 'worker',
        directory: '/owned',
        quality: {},
        semanticVerdict: 'pass',
        trajectory: { scenario: 'case', events: [] },
      },
      5
    );
    await assert.rejects(reflection, /timeout|aborted/i);
    const runtime = new SddEvalOpenCodeRuntime({
      directory: '/owned',
      client: {
        session: {
          create: pending,
          prompt: async () => {
            modelCalls++;
            return { data: {} };
          },
        },
      } as never,
    });
    await assert.rejects(
      runtime.judge({
        directory: '/owned',
        prompt: 'facts',
        model,
        signal: AbortSignal.timeout(5),
      }),
      /timeout|aborted/i
    );
    assert.equal(modelCalls, 0);
  } finally {
    clearTimeout(keepAlive);
  }
});
it('same-worker reflection uses no tools, sees factual IDs, and records only separate usage deltas', async () => {
  let count = 0;
  let requested: Parameters<SddEvalRuntime['judge']>[0] | undefined;
  const runtime = {
    judge: async (input) => {
      requested = input;
      return '{"helped":["call_known"],"friction":["call_invented"]}';
    },
  } as SddEvalRuntime;
  const result = await collectAuthoringReflection(
    runtime,
    {
      readDiff: async () => 'frozen diff',
      readTail: async () => [],
      readEvents: async () => [],
      readStatus: async () => 'completed',
      readUsage: async () =>
        count++ ? { ...usage, input: 110, output: 25, total: 145, messages: 3 } : { ...usage },
      readTrajectory: async () => ({ entries: [], coverage: { complete: true } }),
    },
    {
      sessionId: 'same-worker',
      directory: '/owned',
      quality: { pass: false },
      semanticVerdict: 'fail',
      trajectory: {
        scenario: 'case',
        events: [{ type: 'tool', i: 0, callId: 'call_known', tool: 'read', status: 'completed' }],
      },
    }
  );
  assert.equal(requested?.sessionId, 'same-worker');
  assert.equal(requested?.readOnly, true);
  assert.deepEqual(requested?.model, model);
  assert.match(requested!.prompt, /call_known/);
  assert.match(requested!.prompt, /NOT private reasoning/);
  assert.equal(result.usageDelta.total, 15);
  assert.equal(result.usageDelta.messages, 1);
  assert.deepEqual(result.unknownCallIds, ['call_invented']);
  assert.equal(usage.total, 130, 'primary usage remains immutable');
  assert.equal(result.diffUnchanged, true);
});
it('SDK denies the verified tool inventory on same-session reflection and excludes private output', async () => {
  let created = 0;
  let body: { tools?: Record<string, boolean>; system?: string } = {};
  const runtime = new SddEvalOpenCodeRuntime({
    directory: '/owned',
    client: {
      tool: { ids: async () => ({ data: ['bash', 'read', 'write', 'task', 'mcp_unexpected'] }) },
      session: {
        create: async () => {
          created++;
          return { data: { id: 'new' } };
        },
        prompt: async (input: { body: typeof body }) => {
          body = input.body;
          return {
            data: {
              parts: [
                { type: 'reasoning', text: 'PRIVATE' },
                { type: 'text', text: 'Public factual notes' },
              ],
            },
          };
        },
      },
    } as never,
  });
  const text = await runtime.judge({
    sessionId: 'worker',
    directory: '/owned',
    model,
    readOnly: true,
    prompt: 'Post-task facts only',
  });
  assert.equal(created, 0);
  assert.equal(text, 'Public factual notes');
  assert.ok(Object.values(body.tools!).every((enabled) => enabled === false));
  assert.equal(body.tools!.mcp_unexpected, false);
  assert.match(body.system!, /text-only read-only reviewer/);
  assert.match(body.system!, /no tools/);
});
it('artifact judge timeout is inconclusive and preserves its session identity', async () => {
  const runtime = {
    judge: (input: Parameters<SddEvalRuntime['judge']>[0]) =>
      new Promise<string>((_resolve, reject) => {
        input.onSession?.('judge-session');
        input.signal!.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
      }),
  } as SddEvalRuntime;
  const keepAlive = setTimeout(() => {}, 100);
  try {
    const result = await new SddEvalJudge(runtime, model, 5).evaluate('case', '/owned', {
      authoring: { version: 1, target: 'specs/x.md', complete: true, content: 'draft' },
      intent: 'artifact',
      diff: '',
      tail: [],
      events: [],
      state: { status: 'completed', stuck: false, waiting: false, errors: [] },
    } as SddEvalJudgeInput);
    assert.equal(result.verdict, 'inconclusive');
    assert.equal(result.sessionId, 'judge-session');
  } finally {
    clearTimeout(keepAlive);
  }
});
