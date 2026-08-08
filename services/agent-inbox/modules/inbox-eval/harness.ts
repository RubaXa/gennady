// @file: EvalHarness — orchestrates all 10 eval runs, collects metrics, writes eval-report.json + trend.jsonl
// @consumers: cli/cmd/inbox/eval.cmd.ts (TSK-165)
// @tasks: TSK-165

import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '#logger';
import type { JournalPort } from '../inbox-core/event-journal.ts';
import { DecisionJournal } from '../inbox-core/decision-journal.ts';
import { MetricsCollector, type DecisionMetrics } from './metrics.ts';
import type { EvalRun } from './runs/context.ts';
import {
  runBoot,
  runRolePickup,
  runPipeline,
  runEvents,
  runChat,
  runEffects,
  runAutonomy,
  runParallel,
  runCrashRecovery,
  runCoverageGate,
} from './runs/index.ts';

/** @purpose Clock function returning ISO timestamp string */
type ClockFn = () => string;

/** @purpose Full eval report per spec §2.2 */
export type EvalReportV2 = {
  /** @purpose Target MR web URL */
  mr: string;
  /** @purpose ISO timestamp of the eval run */
  ts: string;
  /** @purpose Per-scenario run results */
  runs: EvalRun[];
  /** @purpose Metrics snapshot from the decision journal */
  metrics: DecisionMetrics;
  /** @purpose PASS when every run passed; FAIL otherwise */
  verdict: 'pass' | 'fail';
};

/** @purpose Caller-supplied parameters for one eval harness run */
export type EvalHarnessInput = {
  /** @purpose MR web URL being evaluated */
  mr: string;
  /** @purpose Raw event journal for entry inspection */
  journal: JournalPort;
  /** @purpose Decision journal for accept-rate computation */
  decisionJournal: DecisionJournal;
  /** @purpose Artifacts produced by the run-mode pass */
  artifacts?: Record<string, unknown> | null;
  /** @purpose Reports output directory */
  reportsDir: string;
  /** @purpose Optional clock override */
  now?: ClockFn;
  /** @purpose Selective run filter — when set, only specified runs execute */
  runFilter?: string[];
};

/**
 * @purpose Compose the full EvalReportV2 from run results and metrics
 * @param mr MR web URL
 * @param ts ISO timestamp
 * @param runs Per-scenario results
 * @param metrics Computed metrics
 * @returns Full eval report with derived verdict
 */
function composeReport(
  mr: string,
  ts: string,
  runs: EvalRun[],
  metrics: DecisionMetrics
): EvalReportV2 {
  const allPassed = runs.every((r) => r.status === 'pass');
  return { mr, ts, runs, metrics, verdict: allPassed ? 'pass' : 'fail' };
}

/**
 * @purpose Serialize EvalReportV2 to pretty-printed JSON per spec §2.2
 * @param report Report to serialize
 * @returns JSON string
 */
function serializeReportJson(report: EvalReportV2): string {
  return JSON.stringify(report, null, 2);
}

/**
 * @purpose Append one line to trend.jsonl for tracking metric evolution
 * @param reportsDir Reports root directory
 * @param report Eval report whose summary is appended
 * @sideEffect Appends one JSONL line to trend.jsonl
 */
function appendTrend(reportsDir: string, report: EvalReportV2): void {
  const trendPath = join(reportsDir, 'trend.jsonl');
  const trendLine = JSON.stringify({
    mr: report.mr,
    ts: report.ts,
    verdict: report.verdict,
    totalRuns: report.runs.length,
    passedRuns: report.runs.filter((r) => r.status === 'pass').length,
    failedRuns: report.runs.filter((r) => r.status === 'fail').length,
  });
  try {
    appendFileSync(trendPath, trendLine + '\n');
    logger.debug('[EvalHarness#appendTrend] [idle → appended]', { trendPath });
  } catch (cause) {
    const error = new Error('[EvalHarness#appendTrend] Trend append failed', { cause });
    logger.error('[EvalHarness#appendTrend] [appending → trend_degraded]', { error });
  }
}

/**
 * @purpose Run the full eval harness: execute all 10 scenario runs, compute metrics, compose and write report + trend
 * @param input Harness parameters
 * @returns Composed EvalReportV2
 * @sideEffect FS: writes eval-report.json and appends trend.jsonl under reportsDir
 */
export async function runEvalHarness(input: EvalHarnessInput): Promise<EvalReportV2> {
  const now = input.now ?? (() => new Date().toISOString());
  const ts = now();
  const { mr, journal, decisionJournal, artifacts, reportsDir, runFilter } = input;

  logger.info('[EvalHarness#runEvalHarness] [idle → running]', { mr, ts });

  const ctx = { journal, artifacts: artifacts ?? null };
  const collector = new MetricsCollector(journal, decisionJournal);

  // #region START_RUN_ALL_SCENARIOS — invariant: each run returns pass/fail with evidence; runs are independent (no ordering constraint)
  const runFns: Array<{
    id: string;
    fn: (c: typeof ctx, dj: DecisionJournal) => Promise<EvalRun>;
  }> = [
    { id: 'boot', fn: (c) => runBoot(c) },
    { id: 'role_pickup', fn: (c) => runRolePickup(c) },
    { id: 'pipeline', fn: (c) => runPipeline(c) },
    { id: 'events', fn: (c) => runEvents(c) },
    { id: 'chat', fn: (c) => runChat(c) },
    { id: 'effects', fn: (c) => runEffects(c) },
    { id: 'autonomy', fn: (c, dj) => runAutonomy(c, dj) },
    { id: 'parallel', fn: (c) => runParallel(c) },
    { id: 'crash_recovery', fn: (c) => runCrashRecovery(c) },
    { id: 'coverage_gate', fn: (c) => runCoverageGate(c) },
  ];

  const filtered = runFilter ? runFns.filter((r) => runFilter.includes(r.id)) : runFns;

  const runs: EvalRun[] = [];
  for (const runner of filtered) {
    try {
      const result = await runner.fn(ctx, decisionJournal);
      runs.push(result);
      logger.info(
        `[EvalHarness#runEvalHarness] [running → checked] ${runner.id}: ${result.status}`,
        {
          evidenceCount: result.evidence.length,
        }
      );
    } catch (cause) {
      const error = new Error(
        `[EvalHarness#runEvalHarness] Run ${runner.id} failed with exception`,
        {
          cause,
        }
      );
      logger.error(`[EvalHarness#runEvalHarness] [running → run_failed] ${runner.id}`, { error });
      runs.push({
        id: runner.id,
        status: 'fail',
        evidence: [(cause as Error).message ?? String(cause)],
      });
    }
  }
  // #endregion END_RUN_ALL_SCENARIOS

  // metrics computed from journal after runs complete; acceptRate/rate may be NaN when n=0
  const metrics = collector.computeAll();

  const report = composeReport(mr, ts, runs, metrics);

  // #region START_WRITE_REPORT — best-effort: write failure must not mask the computed report
  try {
    mkdirSync(reportsDir, { recursive: true });
    const reportPath = join(reportsDir, 'eval-report.json');
    writeFileSync(reportPath, serializeReportJson(report));
    appendTrend(reportsDir, report);
    logger.info('[EvalHarness#runEvalHarness] [running → written]', {
      reportPath,
      verdict: report.verdict,
    });
  } catch (cause) {
    const error = new Error(
      '[EvalHarness#runEvalHarness] Report write failed — computed report is still returned',
      { cause }
    );
    logger.error('[EvalHarness#runEvalHarness] [writing → report_write_degraded]', { error });
  }
  // #endregion END_WRITE_REPORT

  logger.info('[EvalHarness#runEvalHarness] [running → done]', {
    verdict: report.verdict,
    runCount: runs.length,
  });
  return report;
}
