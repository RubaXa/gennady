// @file: Causal controls for opt-in progress evidence, separate from liveness and runtime policy.
// @spec: AI-SKILLS
// @consumers: node:test; EA-3 evidence qualification

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { it } from 'node:test';
import {
  classifyMeaningfulProgress,
  type MeaningfulProgressEvidence,
  type MeaningfulProgressScope,
} from '../meaningful-progress.ts';
import { projectToolObservation } from '../tool-observation.ts';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const scope: MeaningfulProgressScope = {
  causeId: 'missing-config',
  diagnosticCommands: ['npm test'],
  artifactPaths: ['src/retry.ts', 'specs/demo/core.task.DEM-work.md'],
  journalPaths: ['specs/demo/core.task.DEM-work.md'],
};

function evidence(
  text = 'E_CONFIG missing tsconfig',
  callId = 'call-1'
): MeaningfulProgressEvidence {
  return {
    causeId: scope.causeId,
    complete: true,
    observation: {
      artifactFingerprint: 'liveness-diff-hash',
      tail: [
        {
          messageId: 'message-1',
          role: 'assistant',
          text: 'I made progress',
          fingerprint: 'tail-hash',
          toolCalls: [
            {
              callId,
              tool: 'bash',
              command: 'npm test',
              status: 'completed',
              exitCode: 1,
              diagnostic: text,
              startedAt: 1,
              finishedAt: 2,
              observation: projectToolObservation('bash', undefined, text, '/owned'),
            },
          ],
        },
      ],
    },
    diagnostics: [{ messageId: 'message-1', callId, text }],
    artifacts: [{ path: 'src/retry.ts', sha256: hash('initial source') }],
  };
}

it('ignores new call IDs, timestamps, worker prose and whole-diff fingerprints for the same error', () => {
  const before = evidence('2026-10-26T10:00:00Z callId=old E_CONFIG missing tsconfig');
  const after = evidence('2026-10-26T10:05:00Z callId=new E_CONFIG missing tsconfig', 'call-2');
  after.observation.artifactFingerprint = 'another-whole-diff-hash';
  after.observation.tail[0].text = 'Now it is fixed';
  after.observation.tail[0].toolCalls[0].startedAt = 100;
  after.observation.tail[0].toolCalls[0].finishedAt = 200;
  assert.deepEqual(classifyMeaningfulProgress(scope, before, after), {
    status: 'no-progress',
    newFacts: [],
    issues: [],
  });
});

it('does not count journal-only writes even if the journal was also included as an artifact', () => {
  const before = evidence();
  const after = evidence();
  before.artifacts = [
    ...before.artifacts,
    { path: scope.journalPaths[0], sha256: hash('pending') },
  ];
  after.artifacts = [
    ...after.artifacts,
    { path: scope.journalPaths[0], sha256: hash('accepted plus another log line') },
  ];
  after.observation.artifactFingerprint = 'changed-by-sdd-log';
  assert.equal(classifyMeaningfulProgress(scope, before, after).status, 'no-progress');
});

it('recognizes a genuinely different grounded diagnostic without exposing its text', () => {
  const result = classifyMeaningfulProgress(
    scope,
    evidence(),
    evidence('E_CONFIG unknown compiler option')
  );
  assert.equal(result.status, 'progress');
  assert.equal(result.newFacts.length, 1);
  assert.equal(result.newFacts[0].kind, 'diagnostic');
  assert.match(result.newFacts[0].key, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(result), /compiler option/);
});

it('recognizes an independently captured artifact change even when the same error remains', () => {
  const after = evidence();
  after.artifacts = [{ path: 'src/retry.ts', sha256: hash('bounded repair') }];
  assert.deepEqual(classifyMeaningfulProgress(scope, evidence(), after), {
    status: 'progress',
    newFacts: [{ kind: 'artifact', key: 'src/retry.ts' }],
    issues: [],
  });
});

it('distinguishes observed absence from missing evidence and detects creation/deletion', () => {
  const absent = evidence();
  absent.artifacts = [{ path: 'src/retry.ts', sha256: null }];
  assert.equal(classifyMeaningfulProgress(scope, absent, evidence()).status, 'progress');
  assert.equal(classifyMeaningfulProgress(scope, evidence(), absent).status, 'progress');
  const missing = evidence();
  missing.artifacts = [];
  assert.equal(classifyMeaningfulProgress(scope, missing, evidence()).status, 'unknown');
});

it('keeps missing baseline, partial capture and a changed cause unknown rather than proving a reset', () => {
  assert.equal(classifyMeaningfulProgress(scope, undefined, evidence()).status, 'unknown');
  const partial = evidence('E_CONFIG new diagnostic');
  partial.complete = false;
  assert.equal(classifyMeaningfulProgress(scope, evidence(), partial).status, 'unknown');
  const unrelated = evidence();
  unrelated.causeId = 'another-blocker';
  assert.equal(classifyMeaningfulProgress(scope, evidence(), unrelated).status, 'unknown');
});

it('requires actual unambiguous terminal output for each selected diagnostic fact', () => {
  const mutations = [
    (e: MeaningfulProgressEvidence) => {
      e.observation.tail[0].toolCalls[0].observation = undefined;
    },
    (e: MeaningfulProgressEvidence) => {
      e.observation.tail[0].toolCalls[0].observation!.output.prefixComplete = false;
    },
    (e: MeaningfulProgressEvidence) => {
      e.observation.tail[0].toolCalls[0].status = 'running';
    },
    (e: MeaningfulProgressEvidence) => {
      e.observation.tail[0].toolCalls[0].inputSummaryTruncated = true;
    },
    (e: MeaningfulProgressEvidence) => {
      e.observation.tail[0].toolCalls[0].command = 'echo fabricated result';
    },
    (e: MeaningfulProgressEvidence) => {
      e.observation.tail[0].toolCalls[0].exitCode = undefined;
    },
    (e: MeaningfulProgressEvidence) => {
      e.diagnostics = [{ ...e.diagnostics[0], text: 'invented fact' }];
    },
    (e: MeaningfulProgressEvidence) => {
      e.observation.tail[0].toolCalls.push(e.observation.tail[0].toolCalls[0]);
    },
    (e: MeaningfulProgressEvidence) => {
      e.diagnostics = [];
    },
  ];
  for (const mutate of mutations) {
    const after = evidence('E_CONFIG new diagnostic');
    mutate(after);
    assert.equal(classifyMeaningfulProgress(scope, evidence(), after).status, 'unknown');
  }
});

it('keeps disappearing diagnostics and metadata-only excerpts unknown without claiming success', () => {
  const after = evidence();
  after.diagnostics = [];
  after.observation.tail[0].toolCalls[0].exitCode = 0;
  after.observation.tail[0].toolCalls[0].diagnostic = undefined;
  assert.equal(classifyMeaningfulProgress(scope, evidence(), after).status, 'unknown');
  const metadata = evidence('2026-10-26T10:00:00Z callId=second');
  assert.equal(classifyMeaningfulProgress(scope, evidence(), metadata).status, 'unknown');
});

it('does not turn an out-of-scope change or an output hash alone into a relevant new fact', () => {
  const after = evidence();
  after.artifacts = [...after.artifacts, { path: 'docs/unrelated.md', sha256: hash('new text') }];
  after.observation.tail[0].toolCalls[0].observation!.output.redactedPrefixSha256 = hash(
    'timestamp-only output change'
  );
  assert.equal(classifyMeaningfulProgress(scope, evidence(), after).status, 'no-progress');
  const empty = evidence();
  empty.observation.tail = [];
  empty.artifacts = [];
  empty.diagnostics = [];
  assert.equal(
    classifyMeaningfulProgress({ ...scope, artifactPaths: [] }, empty, empty).status,
    'unknown'
  );
});

it('rejects malformed or duplicate host artifact snapshots without manufacturing missing data', () => {
  for (const artifacts of [
    [{ path: 'src/retry.ts', sha256: 'not-a-hash' }],
    [
      { path: 'src/retry.ts', sha256: hash('one') },
      { path: 'src/retry.ts', sha256: hash('two') },
    ],
  ]) {
    const after = evidence();
    after.artifacts = artifacts;
    assert.equal(classifyMeaningfulProgress(scope, evidence(), after).status, 'unknown');
  }
});
