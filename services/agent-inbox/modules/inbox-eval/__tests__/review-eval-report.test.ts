// @file: Simulation-backed unit tests for ReviewEvalReport — verdict derivation invariants,
//   outcome precedence, all-skipped non-pass guarantee and evidence aggregation.
// @consumers: node:test runner
// @tasks: TSK-183

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeReviewEvalReport,
  serializeReviewEvalReportJson,
  serializeReviewEvalReportMarkdown,
  type ReviewEvalReport,
} from '../reports/review-eval-report.ts';
import type { ReviewEvalRun, ReviewScenarioResult } from '../scenarios/review-eval-scenario.ts';

const FIXED_NOW = '2026-08-11T00:00:00.000Z';
const RUN_ID = 'test-run-report-01';

/**
 * @purpose Build a minimal ReviewEvalRun with the supplied results.
 * @param results Scenario results to embed in the run.
 * @returns Deterministic ReviewEvalRun for composition tests.
 */
function makeRun(results: ReviewScenarioResult[]): ReviewEvalRun {
  return {
    runId: RUN_ID,
    profile: 'mock',
    mrs: ['https://gitlab.example.com/group/project/-/merge_requests/1'],
    results,
    startedAt: FIXED_NOW,
    finishedAt: FIXED_NOW,
  };
}

/**
 * @purpose Build a PASS scenario result with mandatory non-empty evidence.
 * @param id Scenario identifier.
 * @returns PASS result with one address-summary evidence pair.
 */
function passResult(id: string): ReviewScenarioResult {
  return {
    scenarioId: id,
    outcome: 'PASS',
    preconditions: [],
    evidence: [{ address: `scenario:${id}:evidence`, summary: 'confirmed' }],
  };
}

/**
 * @purpose Build a FAIL scenario result with evidence of the failure.
 * @param id Scenario identifier.
 * @returns FAIL result with one failure evidence pair.
 */
function failResult(id: string): ReviewScenarioResult {
  return {
    scenarioId: id,
    outcome: 'FAIL',
    preconditions: [],
    evidence: [{ address: `scenario:${id}:failure`, summary: 'assertion failed' }],
  };
}

/**
 * @purpose Build a SKIP scenario result with a skip reason.
 * @param id Scenario identifier.
 * @returns SKIP result with skipReason and empty evidence.
 */
function skipResult(id: string): ReviewScenarioResult {
  return {
    scenarioId: id,
    outcome: 'SKIP',
    preconditions: [],
    evidence: [],
    skipReason: `Preconditions unmet for ${id}`,
  };
}

/**
 * @purpose Build an INCONCLUSIVE scenario result with cause detail.
 * @param id Scenario identifier.
 * @returns INCONCLUSIVE result with inconclusiveReason and minimal evidence.
 */
function inconclusiveResult(id: string): ReviewScenarioResult {
  return {
    scenarioId: id,
    outcome: 'INCONCLUSIVE',
    preconditions: [],
    evidence: [],
    inconclusiveReason: `Precondition unobservable for ${id}`,
  };
}

// #region START_REPORT_AGGREGATION
describe('report aggregation preserves non pass outcomes and rejects all skipped green', () => {
  it('no results yields INCONCLUSIVE verdict', () => {
    // contract: empty run → INCONCLUSIVE; never PASS or FAIL
    // failure mode: empty results produce PASS or panic
    const report = composeReviewEvalReport(makeRun([]));
    assert.strictEqual(
      report.verdict,
      'INCONCLUSIVE',
      'verdict must be INCONCLUSIVE when no results'
    );
  });

  it('all-skipped run yields INCONCLUSIVE not PASS', () => {
    // contract: every result SKIP → INCONCLUSIVE; spec invariant: all-skipped is not a pass
    // failure mode: allSkipped returns PASS or SKIP (instead of INCONCLUSIVE)
    const report = composeReviewEvalReport(makeRun([skipResult('s1'), skipResult('s2')]));
    assert.strictEqual(
      report.verdict,
      'INCONCLUSIVE',
      'verdict must be INCONCLUSIVE when all results are SKIP'
    );
    assert.notStrictEqual(report.verdict, 'PASS', 'all-skipped must never produce PASS');
  });

  it('single FAIL dominates all other outcomes', () => {
    // contract: FAIL > INCONCLUSIVE > SKIP; one FAIL forces FAIL verdict
    // failure mode: FAIL overridden by PASS sibling, verdict returned as PASS
    const report = composeReviewEvalReport(
      makeRun([passResult('s1'), failResult('s2'), skipResult('s3'), inconclusiveResult('s4')])
    );
    assert.strictEqual(report.verdict, 'FAIL', 'verdict must be FAIL when any result is FAIL');
  });

  it('INCONCLUSIVE without FAIL dominates SKIP', () => {
    // contract: FAIL > INCONCLUSIVE > SKIP; INCONCLUSIVE forces INCONCLUSIVE when no FAIL present
    // failure mode: INCONCLUSIVE downgraded to SKIP when sibling is SKIP
    const report = composeReviewEvalReport(makeRun([skipResult('s1'), inconclusiveResult('s2')]));
    assert.strictEqual(
      report.verdict,
      'INCONCLUSIVE',
      'verdict must be INCONCLUSIVE when any result is INCONCLUSIVE (no FAIL)'
    );
  });

  it('all PASS yields PASS verdict', () => {
    // contract: every result PASS with non-empty evidence → PASS
    // failure mode: PASS scenario results still produce INCONCLUSIVE or FAIL
    const report = composeReviewEvalReport(makeRun([passResult('s1'), passResult('s2')]));
    assert.strictEqual(report.verdict, 'PASS', 'verdict must be PASS when all results are PASS');
  });

  it('PASS and SKIP mix yields PASS when at least one is PASS', () => {
    // contract: mix of PASS and SKIP → PASS because PASS present and no FAIL/INCONCLUSIVE
    // failure mode: SKIP sibling downgrades PASS to INCONCLUSIVE
    const report = composeReviewEvalReport(makeRun([passResult('s1'), skipResult('s2')]));
    assert.strictEqual(
      report.verdict,
      'PASS',
      'verdict must be PASS when PASS is present alongside SKIP'
    );
  });

  it('FAIL dominates even when PASS evidence is present', () => {
    // contract: one FAIL result forces FAIL regardless of how many PASS siblings exist
    // failure mode: PASS evidence count outweighs single FAIL, verdict incorrectly becomes PASS
    const report = composeReviewEvalReport(
      makeRun([passResult('s1'), passResult('s2'), passResult('s3'), failResult('s4')])
    );
    assert.strictEqual(report.verdict, 'FAIL', 'FAIL must dominate PASS siblings');
  });

  it('composeReviewEvalReport preserves run identity fields', () => {
    // contract: report carries runId, profile, mrs, startedAt, finishedAt from the run
    // failure mode: field loss or mutation in compose path
    const run = makeRun([passResult('s1')]);
    const report = composeReviewEvalReport(run);
    assert.strictEqual(report.runId, run.runId, 'runId must be preserved');
    assert.strictEqual(report.profile, run.profile, 'profile must be preserved');
    assert.deepStrictEqual(report.mrs, run.mrs, 'mrs must be preserved');
    assert.strictEqual(report.startedAt, run.startedAt, 'startedAt must be preserved');
    assert.strictEqual(report.finishedAt, run.finishedAt, 'finishedAt must be preserved');
    assert.deepStrictEqual(report.results, run.results, 'results must be preserved');
  });

  it('serializeReviewEvalReportJson round-trips through JSON.parse', () => {
    // contract: serialize → JSON.parse must return equal object
    // failure mode: JSON contains non-serializable values or field loss on parse
    const report: ReviewEvalReport = composeReviewEvalReport(makeRun([passResult('s1')]));
    const json = serializeReviewEvalReportJson(report);
    const parsed = JSON.parse(json) as ReviewEvalReport;
    assert.deepStrictEqual(parsed, report, 'parsed JSON must equal original report');
  });

  it('serializeReviewEvalReportMarkdown contains verdict, profile and scenario id', () => {
    // contract: Markdown output includes Verdict, Profile, and each scenarioId
    // failure mode: missing verdict header or scenario rows truncated
    const report: ReviewEvalReport = composeReviewEvalReport(
      makeRun([passResult('scenario-alpha'), skipResult('scenario-beta')])
    );
    const md = serializeReviewEvalReportMarkdown(report);
    assert.match(md, /\*\*Verdict:\*\*/, 'markdown must include Verdict header');
    assert.ok(md.includes('scenario-alpha'), 'markdown must include first scenario id');
    assert.ok(md.includes('scenario-beta'), 'markdown must include second scenario id');
    assert.ok(md.includes(report.runId), 'markdown must include run id');
  });
});
// #endregion END_REPORT_AGGREGATION
