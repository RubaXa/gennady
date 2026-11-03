// @file: Deterministic post-campaign controls for consent clocks, private raw caps and qualification privacy.
// @spec: AI-SKILLS
// @consumers: future brownfield measurement; no model calls

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessConsentOrder, type ConsentOrderInput } from '../brownfield-measurement.ts';
const approved = 1793682032155;
const reference: ConsentOrderInput = {
  approval: {
    source: 'host-user-message',
    hostOwned: true,
    messageId: 'host-approval',
    clock: 'opencode-server-epoch-ms',
    epochMs: approved,
  },
  edits: [{ callId: 'config-edit', clock: 'opencode-server-epoch-ms', epochMs: 1793682034480 }],
  editEvidenceComplete: true,
  configUnchangedBeforeApproval: true,
};
test('actual E2 numbers prove edit 2325ms after approval using one origin', () => {
  const result = assessConsentOrder(reference);
  assert.equal(result.status, 'approved-before-observed-edits');
  assert.equal(result.approvalAtEpochMs, approved);
  assert.deepEqual(result.editOffsetsFromApprovalMs, [{ callId: 'config-edit', offsetMs: 2325 }]);
});
test('a preapproval edit is a concrete violation, never cured by a later compliant edit', () => {
  const result = assessConsentOrder({
    ...reference,
    edits: [
      { callId: 'early', clock: 'opencode-server-epoch-ms', epochMs: approved - 1 },
      ...reference.edits,
    ],
    editEvidenceComplete: false,
  });
  assert.equal(result.status, 'observed-preapproval-edit');
});
test('missing or incompatible timestamps and tied millisecond resolution stay unknown', () => {
  for (const edit of [
    { callId: 'missing' },
    { callId: 'offset', clock: 'relative-to-first-tool', epochMs: 27672 },
    { callId: 'mislabeled-offset', clock: 'opencode-server-epoch-ms', epochMs: 27672 },
    { callId: 'tie', clock: 'opencode-server-epoch-ms', epochMs: approved },
    { callId: 'nan', clock: 'opencode-server-epoch-ms', epochMs: Number.NaN },
  ])
    assert.equal(assessConsentOrder({ ...reference, edits: [edit] }).status, 'unknown');
  assert.equal(assessConsentOrder({ ...reference, approval: undefined }).status, 'unknown');
});
test('incomplete edit evidence or changed preapproval bytes cannot prove compliant ordering', () => {
  assert.equal(assessConsentOrder({ ...reference, editEvidenceComplete: false }).status, 'unknown');
  assert.equal(
    assessConsentOrder({ ...reference, configUnchangedBeforeApproval: false }).status,
    'unknown'
  );
  assert.equal(assessConsentOrder({ ...reference, edits: [] }).status, 'unknown');
});
test('an explicit no-grant host ledger catches edits; absence of evidence does not fabricate a grant', () => {
  assert.equal(
    assessConsentOrder({ ...reference, approval: null }).status,
    'observed-preapproval-edit'
  );
  assert.equal(
    assessConsentOrder({ ...reference, approval: null, editEvidenceComplete: false }).status,
    'unknown'
  );
});

import {
  findHostConsentApproval,
  capturePrivateSessionMessages,
  publicQualification,
  redactPrivateMessages,
} from '../brownfield-measurement.ts';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
test('consent fact uses the exact actual host user-message identity, not assistant narration', () => {
  const messages = [
    {
      info: { role: 'assistant', id: 'fake', time: { created: approved - 100 } },
      parts: [{ type: 'text', text: 'approve' }],
    },
    {
      info: { role: 'user', id: 'actual', time: { created: approved } },
      parts: [{ type: 'text', text: 'approve' }],
    },
  ];
  assert.equal(findHostConsentApproval(messages, 'approve', true)?.messageId, 'actual');
  assert.equal(findHostConsentApproval(messages, 'approve', true)?.epochMs, approved);
  assert.equal(findHostConsentApproval(messages, 'approve', false), null);
  assert.equal(findHostConsentApproval(undefined, 'approve', true), undefined);
  assert.equal(findHostConsentApproval([...messages, messages[1]], 'approve', true), undefined);
});
test('private raw capture preserves actual tool stderr and bounds oversized bodies without claiming completeness', async () => {
  const root = mkdtempSync(join(tmpdir(), 'brownfield-private-messages-'));
  try {
    const body = JSON.stringify([
      {
        info: { role: 'assistant' },
        parts: [{ type: 'tool', state: { output: 'actual P2 tool stderr' } }],
      },
    ]);
    const complete = await capturePrivateSessionMessages({
      baseUrl: 'http://127.0.0.1:4999',
      sessionId: 'owned',
      directory: '/synthetic',
      file: join(root, 'complete.gz'),
      fetcher: (async () => new Response(body, { status: 200 })) as typeof fetch,
    });
    assert.equal(complete.capture.messagesComplete, true);
    assert.equal(gunzipSync(readFileSync(join(root, 'complete.gz'))).toString(), body);
    assert.equal(statSync(join(root, 'complete.gz')).mode & 0o777, 0o600);
    const partial = await capturePrivateSessionMessages({
      baseUrl: 'http://127.0.0.1:4999',
      sessionId: 'owned',
      directory: '/synthetic',
      file: join(root, 'partial.gz'),
      limitBytes: 20,
      fetcher: (async () => new Response(body, { status: 200 })) as typeof fetch,
    });
    assert.equal(partial.capture.capturedBytes, 20);
    assert.equal(partial.capture.bodyComplete, false);
    assert.equal(partial.capture.messagesComplete, false);
    assert.equal(partial.messages, undefined);
    assert.equal(gunzipSync(readFileSync(join(root, 'partial.gz'))).length, 20);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('qualification projection excludes raw paths and arbitrary diagnostics', () => {
  const projected = publicQualification({
    arm: 'candidate',
    caseId: 'E4',
    correct: {
      pass: false,
      records: [
        { command: 'audit', exit: 1, stdout: 'PRIVATE_SOURCE_PATH', stderr: 'PRIVATE_DIAGNOSTIC' },
      ],
    },
    reference: { commonPass: false, persistencePass: false, lintExit: 1, reason: 'PRIVATE_REASON' },
  });
  const text = JSON.stringify(projected);
  assert.doesNotMatch(text, /PRIVATE/);
  assert.equal(projected.commands[0].exit, 1);
  assert.match(projected.commands[0].outputSha256, /^[a-f0-9]{64}$/);
});

test('credential values are redacted before private hashing and gzip, including a capped credential prefix', async () => {
  const root = mkdtempSync(join(tmpdir(), 'brownfield-private-redaction-'));
  const credential = 'synthetic-proxy-credential-for-test';
  try {
    const body = JSON.stringify({
      apiKey: 'arbitrary-sensitive-value',
      authorization: 'Bearer another-sensitive-value',
      toolOutput: credential,
    });
    const result = await capturePrivateSessionMessages({
      baseUrl: 'http://127.0.0.1:4999',
      sessionId: 'owned',
      directory: '/synthetic',
      file: join(root, 'redacted.gz'),
      knownCredentials: [credential],
      fetcher: (async () => new Response(body, { status: 200 })) as typeof fetch,
    });
    const persisted = gunzipSync(readFileSync(join(root, 'redacted.gz'))).toString();
    assert.doesNotMatch(
      persisted,
      /arbitrary-sensitive-value|another-sensitive-value|synthetic-proxy-credential-for-test/
    );
    assert.equal(result.capture.redactedBeforePersistence, true);
    assert.match(persisted, /REDACTED/);
    assert.doesNotMatch(
      redactPrivateMessages('output=' + credential.slice(0, -4), [credential]),
      /synthetic-proxy/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
