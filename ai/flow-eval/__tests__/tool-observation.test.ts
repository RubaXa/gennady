// @file: Bounded tool observations and real evidence-to-trajectory propagation, without models.
// @spec: AI-SKILLS
// @consumers: public tool-result telemetry

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createHash } from 'node:crypto';
import { projectToolObservation } from '../tool-observation.ts';
import { toolEventsFrom } from '../trajectory.ts';
import { SddEvalOpenCodeEvidenceSource } from '../evidence.ts';
import type { OpencodeClient } from '@opencode-ai/sdk';

it('withholds oversized declared purpose before truncation can expose a known-secret prefix', () => {
  const previous = process.env.GENNADY_DUMMY_TRACE_SECRET;
  const secret = 'DUMMY_TRACE_PRIVATE_VALUE_'.repeat(200);
  process.env.GENNADY_DUMMY_TRACE_SECRET = secret;
  try {
    const result = projectToolObservation('bash', { description: secret }, '', '/owned');
    assert.ok(result.declaredPurpose === undefined, 'oversized public purpose must be withheld');
    assert.ok(!JSON.stringify(result).includes(secret.slice(0, 100)), 'no dummy-secret prefix');
  } finally {
    if (previous === undefined) delete process.env.GENNADY_DUMMY_TRACE_SECRET;
    else process.env.GENNADY_DUMMY_TRACE_SECRET = previous;
  }
});

it('fingerprints a redacted bounded result without exporting its text or authored input', () => {
  const output = 'TOKEN=DUMMY_SECRET_ABC123\nPRIVATE_OUTPUT_BODY';
  const result = projectToolObservation(
    'read',
    {
      description: 'read source',
      offset: 4,
      limit: 12,
      content: 'PRIVATE_INPUT_BODY',
    },
    output,
    '/owned'
  );
  assert.deepEqual(result.requestedReadWindow, { offset: 4, limit: 12 });
  assert.equal(result.declaredPurpose, 'read source');
  assert.equal(result.output.bytes, Buffer.byteLength(output));
  assert.equal(result.output.prefixComplete, true);
  assert.match(result.output.redactedPrefixSha256!, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(result), /DUMMY_SECRET|PRIVATE_OUTPUT|PRIVATE_INPUT/);
});

it('distinguishes missing, empty and truncated output; rejects invalid requested ranges', () => {
  assert.deepEqual(projectToolObservation('read', { offset: -1, limit: NaN }, null, '/owned'), {
    version: 1,
    output: { available: false },
  });
  const empty = projectToolObservation('bash', undefined, '', '/owned');
  assert.equal(empty.output.available, true);
  assert.equal(empty.output.bytes, 0);
  assert.equal(empty.output.redactedPrefixSha256, createHash('sha256').update('').digest('hex'));
  const large = projectToolObservation('read', undefined, 'a'.repeat(70000), '/owned');
  assert.equal(large.output.prefixComplete, false);
  assert.equal(large.output.redactedPrefixBytes, 65536);
  assert.equal(
    projectToolObservation('bash', { offset: 4 }, '', '/owned').requestedReadWindow,
    undefined
  );
});

it('carries public observation through the actual evidence source into durable tool events', async () => {
  const client = {
    session: {
      messages: async () => ({
        data: [
          {
            info: { id: 'message', role: 'assistant' },
            parts: [
              {
                type: 'tool',
                tool: 'read',
                callID: 'call',
                state: {
                  status: 'completed',
                  input: { filePath: '/owned/doc.md', offset: 2, limit: 5 },
                  output: 'document lines',
                  time: { start: 1, end: 3 },
                },
              },
            ],
          },
        ],
      }),
      children: async () => ({ data: [] }),
    },
  } as unknown as OpencodeClient;
  const captured = await new SddEvalOpenCodeEvidenceSource({
    directory: '/owned',
    client,
  }).readTrajectory('session');
  const event = toolEventsFrom(captured.entries)[0]!;
  assert.deepEqual(event.observation?.requestedReadWindow, { offset: 2, limit: 5 });
  assert.equal(event.observation?.output.available, true);
  assert.equal(event.observation?.output.bytes, 14);
  assert.doesNotMatch(JSON.stringify(event), /document lines/);
});
