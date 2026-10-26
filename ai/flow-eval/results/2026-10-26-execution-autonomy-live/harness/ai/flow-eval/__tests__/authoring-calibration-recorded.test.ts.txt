// @file: Immutable live calibration of repaired authoring evidence, references and judge boundaries.
// @spec: AI-SKILLS
// @consumers: flow-eval regression suite; authoring calibration evidence

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';
import { parseVerdict } from '../judge.ts';
import type { AuthoringJudgeEvidence } from '../authoring-judge-evidence.ts';
import type { SddEvalJudgeResult, SddEvalUsage } from '../types.ts';

const root = new URL('../results/authoring-campaigns/template-calibration-oct23/', import.meta.url);
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const hashes = {
  'calibration.json': '1eda714d761bb013bce4f7942c95af202d9a0950c0fe348dd868222f3cd809d2',
  'source-snapshot.json': '726c601bda40ff5d8f2c5cbf0a53ed80db910c596829e6a0a21b9f493dd7105d',
  'collector.mjs.txt': 'ef0ac86d5be494d4c156a9299d4dd701c4c4a76e374114cfa34496a6ddff04e2',
};
type CalibrationCase = {
  id: string;
  caseId: string;
  expected: 'pass' | 'fail';
  mutation: string;
  artifactSha256: string;
  evidenceSha256: string;
  evidence: AuthoringJudgeEvidence;
  oracle: unknown;
  status: string;
  result: SddEvalJudgeResult;
  usage: SddEvalUsage;
  coverage: { complete: boolean };
  tools: unknown[];
  qualified: boolean;
  matched: boolean;
  sessionDeleted: boolean;
  fixtureRemoved: boolean;
  startedAt: string;
};

it('live grader calibration preserves six known labels, exact evidence, Flash identity and cleanup', () => {
  for (const [path, hash] of Object.entries(hashes))
    assert.equal(sha(readFileSync(new URL(path, root))), hash, path);
  const record = JSON.parse(readFileSync(new URL('calibration.json', root), 'utf8')) as {
    schema: string;
    sourceDirty: boolean;
    sourceUnchanged: boolean;
    sourceHashes: Record<string, string>;
    frozenAt: string;
    inputsDigest: string;
    complete: boolean;
    cases: CalibrationCase[];
  };
  const source = JSON.parse(readFileSync(new URL('source-snapshot.json', root), 'utf8')) as Record<
    string,
    string
  >;
  assert.equal(record.schema, 'gennady.authoring-calibration.1');
  assert.equal(record.sourceDirty, true, 'not presented as a clean-source optimization experiment');
  assert.equal(record.sourceUnchanged, true);
  assert.equal(record.complete, true);
  assert.equal(record.cases.length, 6);
  assert.equal(new Set(record.cases.map((row) => row.id)).size, 6);
  assert.equal(record.cases.filter((row) => row.expected === 'pass').length, 3);
  for (const [path, hash] of Object.entries(record.sourceHashes))
    assert.equal(sha(source[path]!), hash);
  const frozen = record.cases.map((row) => ({
    id: row.id,
    caseId: row.caseId,
    expected: row.expected,
    mutation: row.mutation,
    artifactSha256: row.artifactSha256,
    evidenceSha256: row.evidenceSha256,
    evidence: row.evidence,
    oracle: row.oracle,
    status: 'not-attempted',
  }));
  assert.equal(sha(JSON.stringify(frozen)), record.inputsDigest);
  for (const row of record.cases) {
    assert.equal(row.status, 'recorded');
    assert.ok(Date.parse(row.startedAt) >= Date.parse(record.frozenAt));
    assert.equal(row.evidence.complete, true);
    assert.equal(sha(JSON.stringify(row.evidence)), row.evidenceSha256);
    assert.equal(sha(row.evidence.content!), row.artifactSha256);
    assert.ok(row.evidence.brief && row.evidence.references?.length);
    for (const ref of row.evidence.references!) assert.equal(sha(ref.content), ref.sha256);
    assert.equal(row.result.verdict, row.expected);
    assert.equal(parseVerdict(row.result.rationale), row.expected);
    assert.doesNotMatch(row.result.rationale, /DSML|<tool_call>/i);
    assert.deepEqual(row.usage.models, ['llm-proxy/deepseek-v4-flash']);
    assert.equal(row.usage.complete, true);
    assert.equal(row.coverage.complete, true);
    assert.deepEqual(row.tools, []);
    assert.equal(row.qualified, true);
    assert.equal(row.matched, true);
    assert.equal(row.sessionDeleted, true);
    assert.equal(row.fixtureRemoved, true);
    assert.equal(Object.hasOwn(row, 'directory'), false, 'no stale temp dependency');
  }
  assert.equal(
    record.cases.reduce((total, row) => total + row.usage.total, 0),
    43055
  );
  assert.equal(
    record.cases.reduce((total, row) => total + row.usage.cacheRead, 0),
    9984
  );
});
