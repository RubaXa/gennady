// @file: Objective, frozen grade for the `migration` eval phase — deterministic, not the judge.
// @consumers: cli (migration scenarios); see docs/journal/EXPERIMENTS-LOG.md for why the bar is baseline-diff.
// The v1→v2 migration document varies in CONTENT run to run, so the bar is NOT "sdd-check clean". It is
// deterministic and structural: the repo flipped to v2, AND the migration introduced no NEW sdd-check
// findings vs the pre-migration baseline (pre-existing v1 debt is backlog, per the migration directive's
// own STEP_8). Pre-existing findings never fail a migration; new ones always do.

import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** @purpose A code→count histogram of sdd-check findings (errors and warnings together). */
export type FindingHistogram = Record<string, number>;

/** @purpose The migration phase's objective outcome. */
export type MigrationGrade = {
  flowVersion: string;
  flowV2: boolean;
  /** @purpose Codes whose count rose vs baseline — the findings the migration itself introduced. */
  introduced: Array<{ code: string; delta: number; severity: 'error' | 'warn' }>;
  pass: boolean;
  detail: string;
};

// Structural-integrity codes a migration MUST NOT introduce: broken spec references/anchors and
// unresolvable rule evidence mean relocation/rename lost a link — the migration's own mechanical job.
// Everything else (BDD coverage, verification-table shape, language calques, long cells) is CONTENT
// debt: pre-existing or authoring-level, addressed by a later reconcile/authoring pass, not migration.
const MIGRATION_CRITICAL_CODES = new Set([
  'SDD_BROKEN_SPEC_REF',
  'SDD_BROKEN_SPEC_ANCHOR',
  'ERR_CLI_SDD_CHECK_READ_FAILED',
]);

/** @purpose Parse an sdd-check run into a code→count histogram. */
export function parseFindingHistogram(output: string): FindingHistogram {
  const hist: FindingHistogram = {};
  for (const m of output.matchAll(/\b(?:error|warn):\s+([A-Z][A-Z0-9_]+)/g)) {
    const code = m[1] as string;
    hist[code] = (hist[code] ?? 0) + 1;
  }
  return hist;
}

/** @purpose Map each finding code to its severity (error wins if a code appears as both). */
function parseSeverities(output: string): Record<string, 'error' | 'warn'> {
  const sev: Record<string, 'error' | 'warn'> = {};
  for (const m of output.matchAll(/\b(error|warn):\s+([A-Z][A-Z0-9_]+)/g)) {
    const severity = m[1] as 'error' | 'warn';
    const code = m[2] as string;
    if (severity === 'error' || sev[code] === undefined) sev[code] = severity;
  }
  return sev;
}

/** @purpose Parse `FLOW_VERSION=<v>` from an sdd-state run; '' when absent. */
function parseFlowVersion(output: string): string {
  return /^FLOW_VERSION=(\S+)/m.exec(output)?.[1] ?? '';
}

/** @purpose Codes whose count in `after` exceeds `baseline` — the migration-introduced findings. */
function diffIntroduced(
  baseline: FindingHistogram,
  after: FindingHistogram,
  severities: Record<string, 'error' | 'warn'>
): MigrationGrade['introduced'] {
  const introduced: MigrationGrade['introduced'] = [];
  for (const [code, count] of Object.entries(after)) {
    const delta = count - (baseline[code] ?? 0);
    if (delta > 0) introduced.push({ code, delta, severity: severities[code] ?? 'warn' });
  }
  return introduced.sort((a, b) => b.delta - a.delta);
}

/**
 * @purpose Compute the frozen migration grade from raw tool output — pure, so it tests both ways
 *   without running the CLI. Pass = repo is v2 AND no migration-introduced ERROR-severity findings.
 * @param baseline The pre-worker finding histogram (captured on the v1 fixture).
 * @param stateOutput Raw `sdd-state` output. @param checkOutput Raw `sdd-check --all` output.
 * @returns The deterministic grade.
 */
export function computeMigrationGrade(
  baseline: FindingHistogram,
  stateOutput: string,
  checkOutput: string
): MigrationGrade {
  const flowVersion = parseFlowVersion(stateOutput);
  const flowV2 = flowVersion === 'v2';
  const introduced = diffIntroduced(
    baseline,
    parseFindingHistogram(checkOutput),
    parseSeverities(checkOutput)
  );
  const criticalIntroduced = introduced.filter((i) => MIGRATION_CRITICAL_CODES.has(i.code));
  const pass = flowV2 && criticalIntroduced.length === 0;
  const critSummary =
    criticalIntroduced.length === 0
      ? 'none'
      : criticalIntroduced.map((i) => `${i.code}+${i.delta}`).join(', ');
  const backlog = introduced
    .filter((i) => !MIGRATION_CRITICAL_CODES.has(i.code))
    .map((i) => `${i.code}+${i.delta}`);
  return {
    flowVersion,
    flowV2,
    introduced,
    pass,
    detail:
      `FLOW_VERSION=${flowVersion || '?'} · critical-introduced: ${critSummary}` +
      (backlog.length > 0 ? ` · backlog: ${backlog.join(', ')}` : ''),
  };
}

/** @purpose Run one gennady CLI subcommand in a provisioned sandbox; returns combined stdout+stderr. */
async function runGennady(sandboxDir: string, args: string[]): Promise<string> {
  const bin = join(sandboxDir, 'node_modules', '.bin', 'gennady');
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      cwd: sandboxDir,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    return `${stdout}\n${stderr}`;
  } catch (cause) {
    const shell = cause as { stdout?: string; stderr?: string };
    return `${shell.stdout ?? ''}\n${shell.stderr ?? ''}`;
  }
}

/** @purpose Capture the pre-migration finding histogram — call on the fresh v1 fixture, before the worker. */
export async function captureBaseline(sandboxDir: string): Promise<FindingHistogram> {
  return parseFindingHistogram(await runGennady(sandboxDir, ['sdd-check', '--all', '.']));
}

/** @purpose Run sdd-state + sdd-check in a finished migration sandbox; raw outputs for the pure grade. */
export async function runMigrationChecks(
  sandboxDir: string
): Promise<{ stateOutput: string; checkOutput: string }> {
  return {
    stateOutput: await runGennady(sandboxDir, ['sdd-state', '.']),
    checkOutput: await runGennady(sandboxDir, ['sdd-check', '--all', '.']),
  };
}
