// @file: Keep authoring decisions evidence-bound, finite and separate from product activation.
// @spec: AI-SKILLS
// @consumers: authoring research; offline eval regression suite

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { it } from 'node:test';

const docs = new URL('../docs/', import.meta.url);
const archives = new URL('../results/authoring-campaigns/', import.meta.url);
const ledger = JSON.parse(readFileSync(new URL('AUTHORING-DECISIONS.json', docs), 'utf8'));
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const read = (url: URL) => {
  const stat = lstatSync(url);
  assert.equal(stat.isSymbolicLink(), false);
  assert.equal(stat.isFile(), true);
  assert.ok(stat.size <= 16 * 1024 * 1024);
  return readFileSync(url);
};
const latest = new URL('contractcue1-oct24/', archives);
const manifest = JSON.parse(read(new URL('manifest.json', latest)).toString());
const entryByName = (name: string) => {
  const entries = manifest.files.filter((e: any) => e.path.endsWith('/' + name));
  assert.equal(entries.length, 1, name);
  const entry = entries[0];
  assert.match(entry.path, /^[a-zA-Z0-9._/-]+$/);
  assert.ok(!entry.path.split('/').includes('..'));
  const bytes = read(new URL(entry.path, latest));
  assert.equal(sha(bytes), entry.sha256);
  return JSON.parse(bytes.toString());
};

it('authoring decisions cover every archived campaign without relabelling calibration as authoring', () => {
  assert.equal(ledger.schema, 'gennady.authoring-decisions.1');
  const ids = ledger.campaigns.map((c: any) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  const archived = readdirSync(archives, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.deepEqual([...ids].sort(), archived.sort());
  assert.equal(ids.length, 12);
  const statuses = new Set(['observed', 'invalid', 'rejected-mixed']);
  for (const row of ledger.campaigns) {
    assert.match(row.id, /^[a-z0-9-]+$/);
    assert.match(row.evidenceFile, /^(REPORT\.md|calibration\.json|manifest\.json)$/);
    assert.ok(statuses.has(row.status));
    for (const field of ['scope', 'tested', 'result', 'notTested'])
      assert.ok(typeof row[field] === 'string' && row[field].length > 10);
    assert.equal(sha(read(new URL(row.id + '/' + row.evidenceFile, archives))), row.evidenceSha256);
    assert.ok(Number.isSafeInteger(row.workerAttempts) && row.workerAttempts >= 0);
  }
  assert.equal(
    ledger.campaigns.reduce((n: number, r: any) => n + r.workerAttempts, 0),
    178
  );
  for (const id of ['template-calibration-oct23', 'semantic-qualification-oct23'])
    assert.equal(ledger.campaigns.find((c: any) => c.id === id).workerAttempts, 0);
});

it('bounded acceptance pins the full tested packet without inventing a shipped opt-in or rewriting grades', () => {
  assert.equal(ledger.cycle.status, 'closed');
  for (const field of ['newLiveAuthoringAttempts', 'newLiveJudgeCalls', 'newLiveReflectionCalls'])
    assert.equal(ledger.cycle[field], 0);
  assert.equal(ledger.cycle.automaticReruns, false);
  assert.equal(ledger.cycle.productionDefault, 'unchanged');
  assert.equal(ledger.cycle.candidateDelivery, 'prototype-only-not-shipped');
  assert.equal(ledger.cycle.model, 'llm-proxy/deepseek-v4-flash');
  assert.equal(ledger.cycle.qualityGuarantee, false);
  assert.equal(ledger.cycle.minimumProductSavingsPercent, null);
  const accepted = ledger.decisions.find((d: any) => d.id === 'AUTH-20261025-BOUNDED');
  assert.equal(accepted.status, 'accepted-bounded');
  assert.equal(accepted.rawGradesChanged, false);
  assert.equal(accepted.mergeAuthorized, false);
  const preBytes = read(new URL('protocol/preregistered-protocol.json', latest));
  assert.equal(sha(preBytes), accepted.preregistrationSha256);
  const pre = JSON.parse(preBytes.toString());
  assert.equal(pre.sources.find((s: any) => s.arm === 'baseline').sourceSHA, accepted.baselineSHA);
  assert.equal(pre.sources.find((s: any) => s.arm === 'facts').sourceSHA, accepted.candidateSHA);
  const original = entryByName('net-effects.json');
  assert.equal(original.positiveBothCases, false);
  assert.equal(original.adoptionAuthorized, false);
  const defaultDecision = ledger.decisions.find((d: any) => d.id === 'AUTH-20261025-DEFAULT');
  assert.equal(defaultDecision.status, 'rejected-mixed');
  assert.ok(ledger.decisions.every((d: any) => typeof d.reopenWhen === 'string'));
});

it('decision summaries recompute total resources and semantic counts, including the nested token regression', () => {
  const raw = entryByName('raw-metrics.json').attempts;
  assert.equal(raw.length, 24);
  assert.equal(ledger.latestEffects.length, 2);
  for (const effect of ledger.latestEffects) {
    const rows = ['baseline', 'facts'].map((arm) =>
      raw.filter((r: any) => r.caseId === effect.caseId && r.variant === arm)
    );
    assert.ok(rows.every((r: any[]) => r.length === effect.attemptsPerArm));
    const totals = (fn: (row: any) => number) =>
      rows.map((arm: any[]) => arm.reduce((n, row) => n + fn(row), 0));
    assert.deepEqual(
      effect.workerNonCacheTotal,
      totals((r) => r.worker.total)
    );
    assert.deepEqual(
      effect.toolCallsTotal,
      totals((r) => r.observation.metrics.tools)
    );
    assert.deepEqual(
      effect.workerWallMsTotal,
      totals((r) => r.worker.wallClockMs)
    );
    assert.deepEqual(
      effect.semanticPasses,
      totals((r) => Number(r.verdict === 'pass'))
    );
  }
  const nested = ledger.latestEffects.find((e: any) => e.caseId === 'module-nested');
  assert.ok(nested.workerNonCacheTotal[1] > nested.workerNonCacheTotal[0]);
  assert.ok(nested.toolCallsTotal[1] < nested.toolCallsTotal[0]);
});

it('future slots have a hard ceiling and do not reopen the completed cycle automatically', () => {
  assert.equal(ledger.futureSlots.length, 2);
  assert.ok(ledger.futureSlots.every((s: any) => s.status === 'untested' && !s.automaticStart));
  const transfer = ledger.futureSlots.find((s: any) => s.id === 'CONTRACTCUE-TRANSFER');
  assert.equal(transfer.maxLiveCampaigns, 1);
  assert.equal(transfer.maxAuthoringAttempts, 12);
  assert.equal(transfer.maxJudgeExecutions, 12);
  assert.equal(transfer.maxReflectionExecutions, 2);
  assert.equal(
    transfer.maxAuthoringAttempts + transfer.maxJudgeExecutions + transfer.maxReflectionExecutions,
    transfer.maxRoleExecutions
  );
  assert.equal(
    transfer.tasks * transfer.arms * transfer.repetitionsPerTaskArm,
    transfer.maxAuthoringAttempts
  );
  assert.equal(transfer.newDomains, 2);
  assert.equal(ledger.futureSlots.find((s: any) => s.id === 'EXCERPT1').maxAuthoringAttempts, 0);
  assert.ok(ledger.reopenPolicy.insufficient.includes('wanting a green result'));
  for (const name of [
    'AUTHORING-EXPERIMENTS.md',
    'AUTHORING-HYPOTHESIS-MATRIX.md',
    'AUTHORING-TRAJECTORY-RESEARCH.md',
    'AUTHORING-RESEARCH-NOTES.md',
  ])
    assert.ok(readFileSync(new URL(name, docs), 'utf8').includes('AUTHORING-CLOSURE.md'), name);
});
