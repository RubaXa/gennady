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
  assert.equal(ids.length, 13);
  assert.equal(
    sha(Buffer.from(JSON.stringify(ledger.campaigns.slice(0, 12)))),
    '23e5af878dd25385899b040a6a8d2c445034862bf4225416c11cfe2f2c7d0a20'
  );
  assert.equal(
    sha(Buffer.from(JSON.stringify(ledger.decisions.slice(0, 2)))),
    'c0a6f99b4f56a334050d0f3e243e70095d6846c7dbd54613b2bc9221f589349f'
  );
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
    190
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
  assert.ok(ledger.futureSlots.every((s: any) => !s.automaticStart));
  const transfer = ledger.futureSlots.find((s: any) => s.id === 'CONTRACTCUE-TRANSFER');
  assert.equal(transfer.status, 'completed');
  assert.equal(transfer.originalStatus, 'untested');
  assert.equal(transfer.executionRef, 'transfer1-oct25');
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
  assert.equal(ledger.futureSlots.find((s: any) => s.id === 'EXCERPT1').status, 'untested');
  assert.ok(ledger.reopenPolicy.insufficient.includes('wanting a green result'));
  for (const name of [
    'AUTHORING-EXPERIMENTS.md',
    'AUTHORING-HYPOTHESIS-MATRIX.md',
    'AUTHORING-TRAJECTORY-RESEARCH.md',
    'AUTHORING-RESEARCH-NOTES.md',
  ])
    assert.ok(readFileSync(new URL(name, docs), 'utf8').includes('AUTHORING-CLOSURE.md'), name);
});

it('closed TRANSFER1 execution follows its raw archive, not only the resource improvement', () => {
  const transfer = new URL('transfer1-oct25/', archives);
  const result = JSON.parse(read(new URL('analysis.json', transfer)).toString());
  const extra = JSON.parse(read(new URL('supplemental.json', transfer)).toString());
  const execution = ledger.transferExecution;
  assert.equal(ledger.currentDecision, 'AUTH-20261025-FINAL');
  assert.equal(execution.status, 'closed');
  assert.equal(execution.recommendation, result.recommendation);
  assert.equal(execution.recommendation, 'retain-current-default');
  assert.deepEqual(execution.allPairNonCacheTotal, [
    result.totals.tokens.baseline,
    result.totals.tokens.candidate,
  ]);
  assert.deepEqual(execution.allPairToolCalls, [
    result.totals.tools.baseline,
    result.totals.tools.candidate,
  ]);
  assert.deepEqual(execution.rawQualifiedDocuments, [
    extra.qualityByArm.baseline.rawCompleteArtifactAndJudgePass,
    extra.qualityByArm.facts.rawCompleteArtifactAndJudgePass,
  ]);
  assert.equal(execution.fullyQualifiedPairCount, extra.successfulPairTaskIds.length);
  for (const [field, metric] of [
    ['fullyQualifiedPairNonCacheTotal', 'tokens'],
    ['fullyQualifiedPairToolCalls', 'tools'],
    ['fullyQualifiedPairWallMs', 'timeMs'],
  ])
    assert.deepEqual(execution[field], [
      extra.successfulPairTotals[metric].baseline,
      extra.successfulPairTotals[metric].candidate,
    ]);
  assert.equal(execution.authoringAttempts, result.roleExecutions.authoring);
  assert.equal(execution.judgeExecutions, result.roleExecutions.judge);
  assert.equal(execution.reflectionExecutions, 0);
  assert.equal(execution.replacementAttempts, 0);
  assert.equal(execution.automaticReruns, false);
  assert.equal(execution.productionDefault, 'unchanged');
});

it('final adjudication closes research without rewriting experiments or counting censored work as a logic defect', () => {
  assert.equal(
    sha(Buffer.from(JSON.stringify(ledger.campaigns))),
    'd33371950cb935842099af0f836c4c57d1d04ff4e9c39b7e676ef929309ca607'
  );
  assert.equal(
    sha(Buffer.from(JSON.stringify(ledger.decisions.slice(0, 3)))),
    '595ca090965f60fe6097c1b118a0ab8d203db8dfecf9ffb5af9714852338a486'
  );
  const final = ledger.finalAdjudication;
  assert.equal(final.newLiveExecutions, 0);
  assert.equal(final.rawGradesChanged, false);
  assert.equal(final.productionDefault, 'unchanged');
  assert.equal(final.researchCycle, 'closed');
  assert.equal(final.automaticNextCampaign, false);
  assert.equal(final.mergeAuthorized, false);
  const decision = ledger.decisions.find((d: any) => d.id === ledger.currentDecision);
  assert.equal(decision.status, 'closed-current-default');
  assert.equal(decision.supersedesDecision, 'AUTH-20261025-TRANSFER');
  assert.equal(final.delay.candidateLogicDefectEstablished, false);
  assert.equal(final.delay.completionWithoutObserverAbort, 'unknown');
  assert.equal(final.dedupe.coreBehaviorContradictionEstablished, false);
  assert.equal(final.dedupe.adjudicatedSemanticStatus, 'inconclusive-not-proven-regression');
});

it('final two-case findings cite actual completed actions, unfilled output and referenced parent guarantees', () => {
  const transfer = new URL('transfer1-oct25/', archives);
  const load = (name: string) => JSON.parse(read(new URL(name, transfer)).toString());
  const text = (name: string) => read(new URL(name, transfer)).toString();
  const prefix = (index: number) => 'permanent/' + load(`records/${index}.json`).primary.directory;
  const delay = ledger.finalAdjudication.delay;
  const trace = load(prefix(7) + '/trajectory.json');
  const action = trace.events.find((e: any) => e.callId === delay.callId);
  assert.equal(action.status, 'completed');
  assert.equal(action.exitCode, 0);
  assert.ok(action.command.includes(delay.observedAction));
  assert.equal(load(prefix(7) + '/summary.json').authoringBenchmark.metrics.wholeWrites, 0);
  assert.equal(load('records/7.json').primary.verdict, 'worker-error');
  assert.match(text('controller-output/7.txt'), /forbidden implementation archaeology/);
  assert.ok(
    text(prefix(7) + '/specs/delivery/policies/delay/delay.spec.md').includes(
      'УДАЛИ ПОСЛЕ ЗАПОЛНЕНИЯ: что принадлежит модулю'
    )
  );
  const child = text(prefix(10) + '/specs/delivery/policies/dedupe/dedupe.spec.md');
  const parent = text(prefix(10) + '/specs/delivery/delivery.spec.md');
  assert.ok(child.includes('seenAtMs <= nowMs'));
  assert.ok(child.includes('0 <= nowMs - seenAtMs < ttlMs'));
  assert.ok(child.includes('Уточняет `DEL-REQ-1`'));
  assert.ok(parent.includes('never perform network I/O, wait, read a clock or mutate state'));
  assert.equal(
    child.includes('isDuplicate(seenAtMs: number | null, nowMs: number, ttlMs: number): boolean'),
    false
  );
  assert.equal(load('records/10.json').primary.verdict, 'fail');
  assert.equal(
    load('manual-review.json').rows.find((r: any) => r.index === 10).semantic,
    'inconclusive'
  );
});
