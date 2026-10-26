// @file: Dummy-only observer-tail boundary tests; no real credentials, network or model calls.
// @spec: AI-SKILLS
// @consumers: SddEvalOpenCodeEvidenceSource.readTail; observer CLI diagnostics

import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { OpencodeClient } from '@opencode-ai/sdk';
import { SddEvalOpenCodeEvidenceSource } from '../evidence.ts';

// A lexical SDK directory identity only: no filesystem, old temp folder or server is required.
const directory = '/owned/observer-boundary-audit';
const dummySecret = 'DUMMY_OBSERVER_SECRET_ABC123';
const privateBody = 'DUMMY_WRITE_BODY_NOT_FOR_OBSERVER';
const privateReasoning = 'DUMMY_PRIVATE_CHANNEL_NOT_FOR_EXPORT';
const direct = 'npx --no-install gennady sdd-check --spec specs/sample/sample.spec.md --authoring';

function message(id: string, tool: string, input: Record<string, unknown>) {
  return {
    info: { id, role: 'assistant', time: { created: 1 } },
    parts: [
      { type: 'reasoning', text: privateReasoning },
      {
        type: 'tool',
        callID: `call_${id}`,
        tool,
        state: {
          status: 'completed',
          input,
          time: { start: 1, end: 2 },
          metadata: { exit: 0 },
          output: 'public success',
        },
      },
    ],
  };
}

function source(root: unknown[], child: unknown[] = []) {
  const client = {
    session: {
      messages: async ({ path }: { path: { id: string } }) => ({
        data: path.id === 'root' ? root : child,
      }),
      children: async ({ path }: { path: { id: string } }) => ({
        data:
          path.id === 'root' && child.length
            ? [{ id: 'child', title: 'owned-child', directory }]
            : [],
      }),
    },
  } as unknown as OpencodeClient;
  return new SddEvalOpenCodeEvidenceSource({ directory, client });
}

it('redacts a nonvacuous dummy argv secret before observer activity renders the tail', async () => {
  const raw = message('secret', 'bash', {
    command: `node example --token ${dummySecret}`,
    workdir: directory,
  });
  assert.ok(JSON.stringify(raw).includes(dummySecret), 'raw SDK fixture really carries a secret');
  const tail = await source([raw]).readTail('root', 2);
  const last = tail.at(-1)!;
  // The existing CLI consumer takes text or inputSummary without an extra redaction step.
  const activity = (last.text || last.toolCalls.at(-1)?.inputSummary || 'tool activity')
    .replace(/\s+/g, ' ')
    .slice(0, 180);
  assert.ok(!activity.includes(dummySecret));
  assert.match(activity, /\[redacted\]/);
  assert.ok(!JSON.stringify(tail).includes(dummySecret));
});

it('projects root and child arguments without Write body, env, headers or private reasoning', async () => {
  const root = message('write', 'write', {
    filePath: `${directory}/specs/sample/sample.spec.md`,
    content: privateBody,
  });
  const child = message('check', 'bash', {
    command: direct,
    workdir: directory,
    env: { TOKEN: dummySecret },
    headers: { Authorization: `Bearer ${dummySecret}` },
  });
  for (const value of [privateBody, privateReasoning, dummySecret])
    assert.ok(JSON.stringify([root, child]).includes(value), 'raw fixture has every omitted value');
  const tail = await source([root], [child]).readTail('root', 4);
  assert.equal(tail.length, 2);
  for (const omitted of [privateBody, privateReasoning, dummySecret])
    assert.ok(!JSON.stringify(tail).includes(omitted));
  assert.deepEqual(JSON.parse(tail[0].toolCalls[0].inputSummary!), {
    filePath: './specs/sample/sample.spec.md',
  });
  assert.deepEqual(JSON.parse(tail[1].toolCalls[0].inputSummary!), {
    command: direct,
    workdir: '.',
  });
  assert.equal(tail[1].toolCalls[0].command, direct);
});

it('retains the same safe public tool identities and metadata as the durable capture', async () => {
  const evidence = source(
    [message('root', 'bash', { command: direct, workdir: directory })],
    [
      message('child', 'write', {
        filePath: `${directory}/specs/sample/sample.spec.md`,
        content: privateBody,
      }),
    ]
  );
  const tail = await evidence.readTail('root', 4);
  const durable = await evidence.readTrajectory('root');
  assert.equal(durable.coverage.complete, true);
  assert.deepEqual(
    tail.flatMap((entry) => entry.toolCalls),
    durable.entries.flatMap((entry) => entry.toolCalls)
  );
  assert.deepEqual(
    tail.flatMap((entry) => entry.toolCalls.map((call) => call.callId)),
    ['call_root', 'call_child']
  );
});
