// @file: Types + serialization for the inbox-eval machine/human report. `status` is derived, never
//   accepted as input, so PASS is provable only via `composeEvalReport` — status = PASS iff every
//   gate passed and every stage completed (spec §4: "все гейты пройдены = G1..G10 зелёные И
//   S0..S11 завершены без обрыва").
// @consumers: EvalHarness (TSK-119)
// @tasks: TSK-118

import type { GateResult } from './gates.ts';

/** @purpose Closed set of pipeline stage identifiers, S0..S11 per spec §3. */
export type StageId =
  | 'S0'
  | 'S1'
  | 'S2'
  | 'S3'
  | 'S4'
  | 'S5'
  | 'S6'
  | 'S7'
  | 'S8'
  | 'S9'
  | 'S10'
  | 'S11';

/** @purpose Outcome of one pipeline stage. */
export type StageResult = {
  /** @purpose Which stage produced this result */
  stage: StageId;
  /** @purpose Whether the stage's PASS-check (spec §3) held */
  done: boolean;
  /** @purpose Optional concrete detail — command output digest, file count, etc. */
  detail?: string;
};

/** @purpose Overall eval outcome — PASS only when every gate passed and every stage completed. */
export type EvalStatus = 'PASS' | 'FAIL';

/** @purpose Full eval report: per-stage + per-gate results plus the derived overall status. */
export type EvalReport = {
  /** @purpose Target MR web URL */
  mr: string;
  /** @purpose ISO timestamp when the eval run started */
  startedAt: string;
  /** @purpose ISO timestamp when the eval run finished */
  finishedAt: string;
  /** @purpose Per-stage results, S0..S11 */
  stages: StageResult[];
  /** @purpose Per-gate results, G1..G10 */
  gates: GateResult[];
  /** @purpose Derived overall outcome — see `composeEvalReport` */
  status: EvalStatus;
};

/**
 * @purpose Compose an `EvalReport` from raw stage/gate results, deriving `status` per spec §4.
 * @param input Every field of `EvalReport` except `status`.
 * @returns Full `EvalReport` with `status` computed — never accepted as caller input, so a report
 *   cannot claim PASS without every stage/gate actually holding.
 */
export function composeEvalReport(input: Omit<EvalReport, 'status'>): EvalReport {
  const allGatesPass = input.gates.every((g) => g.pass);
  const allStagesDone = input.stages.every((s) => s.done);
  return { ...input, status: allGatesPass && allStagesDone ? 'PASS' : 'FAIL' };
}

/**
 * @purpose Serialize an `EvalReport` as machine-readable `eval-report.json` content.
 * @param report Report to serialize.
 * @returns Pretty-printed JSON string.
 */
export function serializeEvalReportJson(report: EvalReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * @purpose Serialize an `EvalReport` as human-readable `eval-report.md` content.
 * @param report Report to serialize.
 * @returns Markdown document with a stage table and a gate table.
 */
export function serializeEvalReportMarkdown(report: EvalReport): string {
  const stageRows = report.stages
    .map((s) => `| ${s.stage} | ${s.done ? '✅' : '❌'} | ${s.detail ?? ''} |`)
    .join('\n');
  const gateRows = report.gates
    .map((g) => `| ${g.gate} | ${g.pass ? '✅ PASS' : '❌ FAIL'} | ${g.evidence} |`)
    .join('\n');

  return `# Eval Report — ${report.mr}

**Status:** ${report.status}
**Started:** ${report.startedAt}
**Finished:** ${report.finishedAt}

## Stages

| Stage | Done | Detail |
| --- | --- | --- |
${stageRows}

## Gates

| Gate | Result | Evidence |
| --- | --- | --- |
${gateRows}
`;
}
