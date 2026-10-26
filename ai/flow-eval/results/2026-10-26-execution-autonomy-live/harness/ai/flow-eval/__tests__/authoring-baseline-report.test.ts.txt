// @file: Failures, incomplete measurements and identity drift stay visible in baseline accounting.
// @spec: AI-SKILLS
// @consumers: offline authoring baseline verification

import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  summarizeAuthoringBaseline,
  type AuthoringBaselineRecord,
} from '../authoring-baseline-report.ts';
import { createAuthoringMatrix } from '../scripts/authoring-experiment.ts';
import type { SddEvalUsage } from '../types.ts';
import { renderAuthoringBaselineReport } from '../scripts/authoring-baseline-report.ts';

const identity = { sourceCommit: 'a'.repeat(40), model: 'llm-proxy/deepseek-v4-flash' };
const plan = createAuthoringMatrix('test', 'baseline', 2, ['portal']);
const usage: SddEvalUsage = {
  messages: 3,
  input: 10,
  output: 2,
  reasoning: 1,
  cacheRead: 40,
  cacheWrite: 0,
  total: 13,
  cost: 0,
  models: [identity.model],
  complete: true,
};
function record(index: number): AuthoringBaselineRecord {
  const scenario = plan[index]!;
  return {
    summary: {
      scenarioId: scenario.id,
      sha: identity.sourceCommit,
      source: { dirty: false },
      verdict: 'pass',
      status: 'completed',
      usage,
      quality: { pass: true, checks: [] },
      trajectory: { pass: false, detail: 'opaque shell, path unproven' },
      authoringBenchmark: {
        ...scenario.authoringBenchmark!,
        ...identity,
        modelVerified: true,
        environmentVerified: true,
        dirty: false,
        durationMs: 50,
      },
    },
    trajectory: {
      scenario: scenario.id,
      coverage: { complete: true, sessions: 1, reasons: [] },
      events: [
        {
          type: 'tool',
          i: 0,
          tool: 'read',
          arg: '{"filePath":"specs/README.md"}',
          callId: 'call-1',
          messageId: 'message-1',
          sessionId: 'session-1',
          status: 'completed',
          startedAt: 1,
          finishedAt: 2,
        },
      ],
    },
    cleanup: {
      scenarioId: scenario.id,
      ...scenario.authoringBenchmark!,
      tempRemoved: true,
      cleanupErrors: [],
      sessions: [{ id: 'session-1', directory: '/owned/fixture', deleted: true }],
      requests: { 'measurement GET /event': 5, 'cleanup DELETE /session': 1 },
    },
  };
}

function recordedRun(report: ReturnType<typeof summarizeAuthoringBaseline>, index: number) {
  const row = report.runs[index];
  assert.ok(row && !row.missing);
  return row;
}

it('retains failed quality runs and separates model messages, tool attempts and SDK polling', () => {
  const failed = record(1);
  failed.summary.verdict = 'fail';
  failed.summary.quality = { pass: false, checks: [{ id: 'required-facts', pass: false }] };
  const report = summarizeAuthoringBaseline(plan, [record(0), failed], identity);
  assert.equal(report.complete, true);
  assert.equal(report.cases[0]!.jointQualityPass, 1);
  assert.equal(report.cases[0]!.pathPass, 0);
  assert.equal(report.cases[0]!.tools.median, 1);
  assert.equal(report.cases[0]!.workerMessages.median, 3);
  assert.equal(recordedRun(report, 0).sdkRequests, 5);
  assert.equal(recordedRun(report, 0).profile.usageByRole.judge, undefined);
  assert.deepEqual(recordedRun(report, 1).failedArtifactChecks, ['required-facts']);
  assert.match(report.limitations.join(' '), /no optimization/);
});

it('does not drop missing runs or claim complete metric distributions', () => {
  const report = summarizeAuthoringBaseline(plan, [record(0)], identity);
  assert.equal(report.complete, false);
  assert.equal(report.runs.length, 2);
  assert.equal(report.runs[1]!.missing, true);
  assert.equal(report.cases[0]!.workerMessages.samples, 1);
  assert.equal(report.cases[0]!.workerMessages.expected, 2);
  assert.equal(report.cases[0]!.workerMessages.complete, false);
});

it('rejects duplicate and foreign records, rather than replacing or silently selecting passes', () => {
  assert.throws(
    () => summarizeAuthoringBaseline(plan, [record(0), record(0)], identity),
    /duplicate/
  );
  const foreign = record(0);
  foreign.summary.scenarioId = 'other';
  assert.throws(() => summarizeAuthoringBaseline(plan, [foreign], identity), /unexpected/);
  assert.throws(() => summarizeAuthoringBaseline([plan[0]!, plan[0]!], [], identity), /distinct/);
});

it('identity drift and unproven cleanup remain blockers to a complete report', () => {
  const bad = record(0);
  bad.summary.authoringBenchmark!.model = 'not-authorized';
  bad.summary.source!.dirty = true;
  bad.cleanup.tempRemoved = false;
  bad.trajectory.scenario = 'other';
  bad.reflection = { status: 'completed', diffUnchanged: false, newToolCalls: 1 };
  const row = summarizeAuthoringBaseline(plan, [bad], identity).runs[0]!;
  assert.deepEqual(row.issues, [
    'source-model-or-scenario-binding',
    'trajectory-binding',
    'cleanup-unproven',
    'reflection-isolation-unproven',
  ]);
});

it('missing/partial usage is unknown, never zero or a complete average', () => {
  const absent = record(0);
  delete absent.summary.usage;
  const partial = record(1);
  partial.summary.usage = { ...usage, complete: false };
  const report = summarizeAuthoringBaseline(plan, [absent, partial], identity);
  assert.equal(report.cases[0]!.workerNonCacheTokens.samples, 0);
  assert.equal(report.cases[0]!.workerNonCacheTokens.median, null);
  assert.equal(report.cases[0]!.workerNonCacheTokens.complete, false);
});

it('captures roles separately without treating reflection usage as primary worker cost', () => {
  const measured = record(0);
  measured.summary.judgeUsage = { usage: { ...usage, total: 20 } };
  measured.reflection = {
    status: 'completed',
    usageDelta: { ...usage, total: 30 },
    usageComplete: true,
    models: [identity.model],
    diffUnchanged: true,
    newToolCalls: 0,
  };
  const row = recordedRun(summarizeAuthoringBaseline(plan, [measured], identity), 0);
  assert.equal(row.profile!.usageByRole.worker!.total, 13);
  assert.equal(row.profile!.usageByRole.judge!.total, 20);
  assert.equal(row.profile!.usageByRole.reflection!.total, 30);
});

it('does not infer zero SDK requests from absent measurement coverage', () => {
  const absent = record(0);
  absent.cleanup.requests = {};
  const zero = record(1);
  zero.cleanup.requests = { 'measurement GET /event': 0 };
  const report = summarizeAuthoringBaseline(plan, [absent, zero], identity);
  assert.equal(recordedRun(report, 0).sdkRequests, undefined);
  assert.equal(recordedRun(report, 1).sdkRequests, 0);
});

it('reconciles observed model provenance rather than trusting only the requested-model label', () => {
  for (const role of ['worker', 'judge', 'reflection'] as const) {
    const bad = record(0);
    const foreign = { ...usage, models: ['other-provider/other-model'] };
    if (role === 'worker') bad.summary.usage = foreign;
    else if (role === 'judge') bad.summary.judgeUsage = { usage: foreign };
    else
      bad.reflection = {
        status: 'completed',
        models: foreign.models,
        diffUnchanged: true,
        newToolCalls: 0,
      };
    const report = summarizeAuthoringBaseline(plan, [bad], identity);
    assert.equal(report.complete, false);
    assert.ok(report.runs[0]!.issues.includes('observed-model-mismatch'));
  }
});

it('renders each ordered attempt and negative verdict, with incomplete observations explicit', () => {
  const saved = record(0);
  saved.summary.verdict = 'fail';
  const report = summarizeAuthoringBaseline(plan, [saved], identity);
  const text = renderAuthoringBaselineReport(report);
  assert.equal(text, renderAuthoringBaselineReport(report));
  assert.match(text, /semantic=fail/);
  assert.match(
    text,
    /\| 0 \| read \| Read current target \(skeleton or result\) \| target \| specs\/README.md/
  );
  assert.match(text, /MISSING/);
  assert.match(text, /not private reasoning/);
});
