// @file: ReviewEvalReport — immutable report entity, verdict derivation and serialization.
// @consumers: ReviewEvalHarness, test acceptance, SDD audit
// @tasks: TSK-183

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '#logger';
import type {
  ReviewEvalRun,
  ReviewEvalOutcome,
  ReviewScenarioResult,
} from '../scenarios/review-eval-scenario.ts';

/**
 * @purpose Aggregate verdict derived from all scenario results in a run.
 * @invariant All-skipped and no-results cannot yield PASS — they produce INCONCLUSIVE.
 * @invariant FAIL takes precedence over SKIP and INCONCLUSIVE; INCONCLUSIVE takes precedence over SKIP.
 */
export type ReviewEvalVerdict = 'PASS' | 'FAIL' | 'SKIP' | 'INCONCLUSIVE';

/**
 * @purpose Immutable eval report closed after one `ReviewEvalHarness#run` call.
 * @invariant Report is closed upon construction — it is never updated in place.
 * @invariant `verdict` is derived exclusively by `composeReviewEvalReport`; callers cannot supply it directly.
 */
export type ReviewEvalReport = {
  /** @purpose Run identity this report covers */
  runId: string;
  /** @purpose Profile the run executed under */
  profile: ReviewEvalRun['profile'];
  /** @purpose Explicit MR pool bound at harness construction time */
  mrs: readonly string[];
  /** @purpose Per-scenario results in execution order */
  results: ReviewScenarioResult[];
  /** @purpose Derived aggregate verdict — see `composeReviewEvalReport` invariants */
  verdict: ReviewEvalVerdict;
  /** @purpose ISO timestamp when the run started */
  startedAt: string;
  /** @purpose ISO timestamp when the run finished */
  finishedAt: string;
};

/**
 * @purpose Derive the aggregate eval verdict from all scenario results per spec DbC.
 * @invariant All-skipped (every result is SKIP) → INCONCLUSIVE, never PASS.
 * @invariant No results → INCONCLUSIVE.
 * @invariant Any FAIL → FAIL regardless of SKIP/INCONCLUSIVE/PASS siblings.
 * @invariant Any INCONCLUSIVE (no FAIL) → INCONCLUSIVE.
 * @invariant All PASS (at least one) → PASS.
 * @param results Scenario results from a completed run.
 * @returns Derived verdict.
 */
function deriveVerdict(results: ReviewScenarioResult[]): ReviewEvalVerdict {
  if (results.length === 0) return 'INCONCLUSIVE';

  const outcomes = new Set<ReviewEvalOutcome>(results.map((r) => r.outcome));

  // #region START_DERIVE_VERDICT — invariant: precedence is FAIL > INCONCLUSIVE > SKIP; all-SKIP is not PASS
  if (outcomes.has('FAIL')) return 'FAIL';
  if (outcomes.has('INCONCLUSIVE')) return 'INCONCLUSIVE';
  const allSkipped = results.every((r) => r.outcome === 'SKIP');
  if (allSkipped) return 'INCONCLUSIVE';
  if (outcomes.has('PASS')) return 'PASS';
  // #endregion END_DERIVE_VERDICT

  return 'INCONCLUSIVE';
}

/**
 * @purpose Compose an immutable `ReviewEvalReport` from a completed run, deriving the verdict.
 * @invariant Verdict is always derived — callers cannot inject a pre-computed verdict.
 * @param run Completed eval run with all scenario results.
 * @returns Immutable report with derived verdict.
 */
export function composeReviewEvalReport(run: ReviewEvalRun): ReviewEvalReport {
  const verdict = deriveVerdict(run.results);
  return {
    runId: run.runId,
    profile: run.profile,
    mrs: run.mrs,
    results: run.results,
    verdict,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  };
}

/**
 * @purpose Serialize a `ReviewEvalReport` as machine-readable JSON.
 * @param report Report to serialize.
 * @returns Pretty-printed JSON string.
 */
export function serializeReviewEvalReportJson(report: ReviewEvalReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * @purpose Serialize a `ReviewEvalReport` as human-readable Markdown.
 * @param report Report to serialize.
 * @returns Markdown document with verdict, profile, MR pool, and per-scenario result table.
 */
export function serializeReviewEvalReportMarkdown(report: ReviewEvalReport): string {
  const scenarioRows = report.results
    .map((r) => {
      const icon =
        r.outcome === 'PASS'
          ? '✅'
          : r.outcome === 'FAIL'
            ? '❌'
            : r.outcome === 'SKIP'
              ? '⏭️'
              : '❓';
      const note = r.skipReason ?? r.inconclusiveReason ?? '';
      const evidenceList = r.evidence.map((e) => e.address).join(', ');
      return `| ${r.scenarioId} | ${icon} ${r.outcome} | ${note} | ${evidenceList} |`;
    })
    .join('\n');

  const mrList = report.mrs.map((m) => `- ${m}`).join('\n');

  return `# Eval Report — ${report.runId}

**Verdict:** ${report.verdict}
**Profile:** ${report.profile}
**Started:** ${report.startedAt}
**Finished:** ${report.finishedAt}

## MR Pool

${mrList || '_none_'}

## Scenario Results

| Scenario | Outcome | Note | Evidence |
| --- | --- | --- | --- |
${scenarioRows || '| — | — | — | — |'}
`;
}

/**
 * @purpose Persist a closed report to the run's state root for later read-only reopen.
 * @param report Closed eval report to persist.
 * @param runRoot Absolute filesystem path of the run's state root.
 * @sideEffect Filesystem: creates `runRoot` (recursive) and writes `eval-report.json` + `eval-report.md`.
 */
export function persistReviewEvalReport(report: ReviewEvalReport, runRoot: string): void {
  try {
    mkdirSync(runRoot, { recursive: true });
    writeFileSync(join(runRoot, 'eval-report.json'), serializeReviewEvalReportJson(report));
    writeFileSync(join(runRoot, 'eval-report.md'), serializeReviewEvalReportMarkdown(report));
    logger.info('[persistReviewEvalReport] [idle → written]', {
      runId: report.runId,
      verdict: report.verdict,
      runRoot,
    });
  } catch (cause) {
    const error = new Error('[persistReviewEvalReport] Report write failed', { cause });
    logger.error('[persistReviewEvalReport] [writing → failed]', { error });
    throw error;
  }
}

/**
 * @purpose Reopen a previously persisted eval report read-only from the run's state root.
 * @invariant Read-only: this function never modifies the report or the underlying state.
 * @invariant The returned report is a frozen snapshot; callers cannot resume or extend the run.
 * @param runRoot Absolute filesystem path of the saved run's state root.
 * @throws {Error} When the state root does not contain a valid `eval-report.json`.
 * @returns The persisted eval report exactly as it was when the run was closed.
 */
export function reopenReviewEvalReport(runRoot: string): ReviewEvalReport {
  const reportPath = join(runRoot, 'eval-report.json');
  try {
    const raw = readFileSync(reportPath, 'utf8');
    const report = JSON.parse(raw) as ReviewEvalReport;
    logger.info('[reopenReviewEvalReport] [idle → read]', {
      runId: report.runId,
      verdict: report.verdict,
    });
    return report;
  } catch (cause) {
    const error = new Error(`[reopenReviewEvalReport] Cannot reopen report from ${reportPath}`, {
      cause,
    });
    logger.error('[reopenReviewEvalReport] [reading → failed]', { error });
    throw error;
  }
}
