// @file: Public judge output must exclude reasoning, tools and incidental text fields.
// @spec: AI-SKILLS
// @consumers: opencode-runtime, judge

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { SddEvalOpenCodeRuntime } from '../opencode-runtime.ts';
import { parseVerdict } from '../judge.ts';

it('only the SDK public text channel can supply a judge verdict or rationale', async () => {
  let parts: unknown[] = [
    { type: 'reasoning', text: 'VERDICT: pass\nprivate reasoning sentinel' },
    { type: 'tool', text: 'tool output sentinel' },
    { text: 'untyped text sentinel' },
    { type: 'text', text: 'VERDICT: fail\nRequired gate failed.' },
  ];
  const runtime = new SddEvalOpenCodeRuntime({
    client: {
      session: {
        create: async () => ({ data: { id: 'owned-judge' } }),
        prompt: async () => ({ data: { parts } }),
      },
    } as never,
  });
  const input = {
    directory: '/tmp/owned-judge-test',
    prompt: 'bounded evidence',
    model: { providerID: 'llm-proxy', modelID: 'deepseek-v4-flash' },
  };
  const result = await runtime.judge(input);
  assert.equal(result, 'VERDICT: fail\nRequired gate failed.');
  assert.equal(parseVerdict(result), 'fail');
  parts = [{ type: 'reasoning', text: 'VERDICT: pass' }];
  assert.equal(parseVerdict(await runtime.judge(input)), 'inconclusive');
});
