// @file: Objective, frozen grade for the `migration` eval phase — deterministic, not the judge.
// @spec: AI-SKILLS
// @consumers: cli (migration scenarios); see docs/journal/EXPERIMENTS-LOG.md for why the bar is baseline-diff.
//   The v1→v2 migration document varies in CONTENT run to run, so the bar is NOT "sdd-check clean". It is
//   deterministic: the repo flipped to v2, AND the migration introduced no NEW error identity versus the
//   pre-migration baseline. Identity is the frozen A1/GAP-B-1 tuple (code, file, severity); warnings are
//   reported separately and do not fail the zero-new-error predicate.

import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { zeroNewErrorVerdict, type BaselineFinding } from './scripts/sdd-check-baseline-compare.ts';

const execFileAsync = promisify(execFile);

/** @purpose A code→count histogram of sdd-check findings (errors and warnings together). */
export type FindingHistogram = Record<string, number>;

/** @purpose The exact pre-migration A1 baseline, keyed by code+file+severity rather than counts. */
export type MigrationFindingBaseline = readonly BaselineFinding[];

/** @purpose The migration phase's objective outcome. */
export type MigrationGrade = {
  flowVersion: string;
  flowV2: boolean;
  /** @purpose Error identities absent from the frozen pre-migration baseline. */
  introduced: Array<{ code: string; file: string; severity: 'error' }>;
  /** @purpose Executability codes (`MIGRATION_EXECUTABILITY_CODES`) still present in `after`, at all —
   *  regardless of baseline (V-BATCH-22 fix, B-2): empty only when the migrated ticket is truly usable. */
  executabilityRemaining: Array<{ code: string; count: number; severity: 'error' | 'warn' }>;
  pass: boolean;
  detail: string;
};

// Executability findings are stricter than the baseline predicate: they must be absent after migration
// even when the frozen V1 input already contained them. Every other ERROR is governed by the literal
// A1 identity comparator; there is no reduced "critical codes" allow-list.
//
// E-07 (batch 22, red-first per L-15): a v1 ticket's Verification table is 2-column
// (`| Command | Required by |`) — the v2 schema is 3-column with `Role`, and v1 never carried the
// `PHASE_RECEIPTS:v1`/`COVERAGE_POLICY:v1` markers at all. `sdd-check`/`sdd-task`/`sdd-verify` reject
// the 2-column shape with SDD_VERIFICATION_TABLE_INVALID (`cli/cmd/sdd-check/sdd-check.cmd.ts`) — this
// is the exact wall a real execute run hits on a migrated-but-not-table-upgraded ticket
// (`docs/journal/flow-verification-ledger.md` finding A7). This code (and its schema-aware sibling,
// which fires once a ticket claims the v1 marker but gets a required field wrong) are now migration
// bars: a migration that only injects SECTION anchors (`sdd-migrate anchors`) without upgrading the
// table produces a ticket `sdd-task`/`sdd-verify` refuse — proven RED by the test below on a frozen,
// really-captured `sdd-check` run, BEFORE the migrator gains that capability (E-06 — deliberately
// ordered after this task, so the bar is not "already green" when it lands).
//
// Two tiers, deliberately graded differently (V-BATCH-22 verdict B-2 — the fix this comment
// documents): STRUCTURAL codes stay baseline-diffed (a migration must not introduce NEW ones; a v1
// repo's own pre-existing broken spec refs are out of migration's scope — content debt, per STEP_8).
// EXECUTABILITY codes are the migration's OWN mechanical job (the table/marker upgrade) — baseline-
// diffing them let a migration that fixes NOTHING pass, as long as the count never rose (see the
// "shrank but nonzero" / "unchanged vs baseline" cases this used to wave through). Executability is
// binary: any occurrence in `after`, AT ALL, fails the bar — REMAINING, not just introduced.
const MIGRATION_EXECUTABILITY_CODES = new Set([
  'SDD_VERIFICATION_TABLE_INVALID',
  'SDD_COVERAGE_POLICY_INVALID',
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

/** @purpose Parse text output into the exact A1 identity tuples; line/message text is intentionally ignored. */
export function parseFindingBaseline(output: string): BaselineFinding[] {
  const findings: BaselineFinding[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^(.+?):\d+:\s+(error|warn):\s+([A-Z][A-Z0-9_]+)\b/.exec(line);
    if (!match) continue;
    findings.push({
      file: match[1] as string,
      severity: match[2] as 'error' | 'warn',
      code: match[3] as string,
    });
  }
  return findings;
}

/** @purpose Parse `FLOW_VERSION=<v>` from an sdd-state run; '' when absent. */
function parseFlowVersion(output: string): string {
  return /^FLOW_VERSION=(\S+)/m.exec(output)?.[1] ?? '';
}

/**
 * @purpose Compute the frozen migration grade from raw tool output — pure, so it tests both ways
 *   without running the CLI. Pass = repo is v2 AND literal A1 has no new error identity.
 * @param baseline Exact pre-worker finding identities captured on the v1 fixture.
 * @param stateOutput Raw `sdd-state` output. @param checkOutput Raw `sdd-check --all` output.
 * @returns The deterministic grade.
 */
export function computeMigrationGrade(
  baseline: MigrationFindingBaseline,
  stateOutput: string,
  checkOutput: string
): MigrationGrade {
  const flowVersion = parseFlowVersion(stateOutput);
  const flowV2 = flowVersion === 'v2';
  const afterFindings = parseFindingBaseline(checkOutput);
  const afterHist = parseFindingHistogram(checkOutput);
  const verdict = zeroNewErrorVerdict({ findings: baseline }, afterFindings);
  const introduced: MigrationGrade['introduced'] = verdict.ok
    ? []
    : verdict.newErrors.map((finding) => ({ ...finding, severity: 'error' as const }));

  // V-BATCH-22 fix (B-2): executability codes are graded on what REMAINS in `after`, not on the
  // baseline delta — a migration that fixes nothing (or only partially) must not pass just because
  // the count didn't rise. See the module-level comment on MIGRATION_EXECUTABILITY_CODES.
  const executabilityRemaining = Object.entries(afterHist)
    .filter(([code, count]) => MIGRATION_EXECUTABILITY_CODES.has(code) && count > 0)
    .map(([code, count]) => ({ code, count, severity: 'error' as const }))
    .sort((a, b) => b.count - a.count);

  const pass = flowV2 && introduced.length === 0 && executabilityRemaining.length === 0;
  const introducedSummary =
    introduced.length === 0 ? 'none' : introduced.map((i) => `${i.code}@${i.file}`).join(', ');
  const remainingSummary =
    executabilityRemaining.length === 0
      ? 'none'
      : executabilityRemaining.map((i) => `${i.code}×${i.count}`).join(', ');
  return {
    flowVersion,
    flowV2,
    introduced,
    executabilityRemaining,
    pass,
    detail:
      `FLOW_VERSION=${flowVersion || '?'} · new-error-identities: ${introducedSummary}` +
      ` · executability-remaining: ${remainingSummary}`,
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

/** @purpose Capture exact pre-migration finding identities on the fresh v1 fixture. */
export async function captureBaseline(sandboxDir: string): Promise<MigrationFindingBaseline> {
  return parseFindingBaseline(await runGennady(sandboxDir, ['sdd-check', '--all', '.']));
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
