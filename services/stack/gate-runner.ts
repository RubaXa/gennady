// @file: Stack-agnostic gate execution — RUN-ALL / SUPPRESS-ON-SUCCESS runner, env-fail combinators, report.
// @consumers: verify.cmd, plugins (combinators)
// @tasks: TSK-95

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { execFileTrimSafe } from '../../shared/common/exec.ts';
import { createTreeReplica } from './tree-replica.ts';
import type {
  EnvFailPredicate,
  Gate,
  GateResult,
  StackDiagnostic,
  StackRun,
  VerifyReport,
} from './stack.types.ts';

/** Head lines kept when truncating long gate output. */
const TRUNCATE_HEAD_LINES = 20;
/** Tail lines kept when truncating — test runners put the failure summary at the end. */
const TRUNCATE_TAIL_LINES = 40;

// #region START_ENV_FAIL_COMBINATORS — building blocks plugins compose into per-gate predicate sets

/**
 * @purpose Predicate: exit codes strictly above n implicate the tool (golangci-lint: >1 = broken).
 * @param n Highest exit code that still counts as a genuine finding.
 * @returns EnvFailPredicate.
 */
export function exitAbove(n: number): EnvFailPredicate {
  return (exitCode) => exitCode !== null && exitCode > n;
}

/**
 * @purpose Predicate: any match of the pattern in the combined output implicates the environment.
 * @param pattern Regular expression tested against the gate output.
 * @param [hint] Fix-the-environment instruction appended to the output when the predicate matches.
 * @returns EnvFailPredicate.
 */
export function outputMatches(pattern: RegExp, hint?: string): EnvFailPredicate {
  return Object.assign((_exitCode: number | null, output: string) => pattern.test(output), {
    hint,
  });
}

// Spawn failures (ENOENT and friends) are classified env-fail by the runner itself —
// the tool never ran, which is environmental for every stack; no combinator needed.
// #endregion END_ENV_FAIL_COMBINATORS

/**
 * @purpose Run one gate to completion, capturing combined output and classifying the outcome.
 * @param gate Gate to execute; a gate carrying a skip reason is returned untouched.
 * @returns Result with status, exit code and captured output.
 * @sideEffect Process: spawns the gate's external command (no shell); gate.env merged over process.env.
 */
function runGate(gate: Gate): GateResult {
  if (gate.skipped !== null) {
    return { gate, status: 'skipped', exitCode: null, durationMs: 0, output: gate.skipped };
  }

  // #region START_SANDBOX — sandboxed gates run in a working-tree replica; drift = FAIL
  let cwd = gate.cwd;
  let replicaCleanup: (() => void) | null = null;
  let replicaDir: string | null = null;
  if (gate.sandbox === true) {
    const toplevel = execFileTrimSafe('git', ['rev-parse', '--show-toplevel'], gate.cwd);
    if (toplevel.length === 0) {
      return {
        gate,
        status: 'env-fail',
        exitCode: null,
        durationMs: 0,
        output: 'sandboxed gate requires a git repository (no toplevel found)',
      };
    }
    const { replica, error } = createTreeReplica(toplevel);
    if (replica === undefined) {
      return {
        gate,
        status: 'env-fail',
        exitCode: null,
        durationMs: 0,
        output: error ?? 'replica failed',
      };
    }
    replicaDir = replica.dir;
    replicaCleanup = replica.cleanup;
    // realpath both sides: git resolves symlinked tmp dirs (/tmp, /var on macOS),
    // a raw gate.cwd would mis-map the relative path back into the real tree.
    cwd = path.join(replica.dir, path.relative(toplevel, fs.realpathSync(gate.cwd)));
  }
  // #endregion END_SANDBOX

  try {
    return executeGate(gate, cwd, replicaDir);
  } finally {
    replicaCleanup?.();
  }
}

/**
 * @purpose Spawn the gate command in cwd and classify the outcome; sandboxed gates add drift.
 * @param gate Gate to execute.
 * @param cwd Effective working directory (replica-mapped for sandboxed gates).
 * @param replicaDir Replica root for drift detection, or null for plain gates.
 * @returns Result with status, exit code and captured output.
 */
function executeGate(gate: Gate, cwd: string, replicaDir: string | null): GateResult {
  const startedAt = Date.now();
  const [bin, ...args] = gate.argv;
  const proc = spawnSync(bin!, args, {
    cwd,
    encoding: 'utf-8',
    timeout: gate.timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: gate.env !== undefined ? { ...process.env, ...gate.env } : process.env,
  });
  const durationMs = Date.now() - startedAt;

  const stdout = proc.stdout ?? '';
  const output = `${stdout}${proc.stderr ?? ''}`.trim();

  if (proc.error !== undefined && (proc.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
    return { gate, status: 'timeout', exitCode: null, durationMs, output };
  }
  if (proc.error !== undefined && proc.status === null) {
    // Spawn itself failed — the tool never ran; universally environmental.
    return { gate, status: 'env-fail', exitCode: null, durationMs, output: String(proc.error) };
  }

  // #region START_STDOUT_CONTRACT — invariant: outputMeansFailure turns exit-0 stdout into FAIL
  if (gate.outputMeansFailure && proc.status === 0) {
    return stdout.trim().length > 0
      ? { gate, status: 'fail', exitCode: 0, durationMs, output: stdout.trim() }
      : { gate, status: 'pass', exitCode: 0, durationMs, output: '' };
  }
  // #endregion END_STDOUT_CONTRACT

  if (proc.status === 0) {
    // Drift check: the replica was baselined, so any status output is the command's doing.
    if (replicaDir !== null) {
      const drift = execFileTrimSafe('git', ['status', '--porcelain'], replicaDir);
      if (drift.length > 0) {
        return {
          gate,
          status: 'fail',
          exitCode: 0,
          durationMs,
          output: `generated code drifted from its sources — files:\n${drift}\nrun \`gennady fix ${gate.stack}:${gate.id}\` to materialize, then commit`,
        };
      }
    }
    return { gate, status: 'pass', exitCode: 0, durationMs, output: '' };
  }

  const matched = (gate.envFail ?? []).find((predicate) => predicate(proc.status, output));
  return {
    gate,
    status: matched !== undefined ? 'env-fail' : 'fail',
    exitCode: proc.status,
    durationMs,
    output: matched?.hint !== undefined ? `${output}\nhint: ${matched.hint}` : output,
  };
}

/**
 * @purpose Execute every gate of every run, never short-circuiting on failures (RUN-ALL).
 * @param runs Per-stack runs whose gate plans are executed in order.
 * @param diagnostics Detection-level diagnostics carried into the report.
 * @returns Report whose `ok` is true only when no executed gate failed or timed out.
 * @sideEffect Process: spawns one external command per executable gate.
 */
export function runVerify(
  runs: readonly StackRun[],
  diagnostics: readonly StackDiagnostic[]
): VerifyReport {
  const results = runs.flatMap((run) => run.gates.map((gate) => runGate(gate)));
  const executed = results.filter((result) => result.status !== 'skipped');
  const passed = executed.filter((result) => result.status === 'pass').length;

  return {
    runs,
    diagnostics,
    results,
    passed,
    total: executed.length,
    ok: executed.every((result) => result.status === 'pass'),
  };
}

/**
 * @purpose Keep failure output within an agent's context budget: head + tail, middle elided —
 *   test runners print the failure summary at the end.
 * @param output Combined tool output.
 * @returns The output, truncated with an explicit marker when it exceeds the line caps.
 */
export function truncateOutput(output: string): string {
  if (output.length === 0) {
    return '(no output)';
  }

  const lines = output.split('\n');
  if (lines.length <= TRUNCATE_HEAD_LINES + TRUNCATE_TAIL_LINES + 1) {
    return output;
  }

  const elided = lines.length - TRUNCATE_HEAD_LINES - TRUNCATE_TAIL_LINES;
  return [
    ...lines.slice(0, TRUNCATE_HEAD_LINES),
    `... (${elided} middle lines truncated — rerun the command above for the full output)`,
    ...lines.slice(lines.length - TRUNCATE_TAIL_LINES),
  ].join('\n');
}

/**
 * @purpose Render the verify report — quiet on success, detailed and actionable on failure.
 * @invariant Passing gates contribute zero output lines.
 * @param report Completed run report.
 * @returns Text block; a single summary line per stack when everything passed.
 */
export function formatVerifyReport(report: VerifyReport): string {
  const lines: string[] = [];

  for (const diagnostic of report.diagnostics) {
    lines.push(`[verify] ⚠️  ${diagnostic.code}: ${diagnostic.message}`);
    lines.push(`         fix: ${diagnostic.fix}`);
  }

  for (const result of report.results) {
    if (result.status === 'skipped') {
      lines.push(
        `[verify] ⏭️  SKIP gate: ${result.gate.stack}:${result.gate.id} — ${result.output}`
      );
    }
  }

  // #region START_FAILURE_DETAIL — invariant: every non-pass gate prints command, cwd, exit, output
  for (const result of report.results) {
    if (result.status === 'pass' || result.status === 'skipped') {
      continue;
    }

    const verdict =
      result.status === 'timeout' ? 'TIMEOUT' : result.status === 'env-fail' ? 'ENV_FAIL' : 'FAIL';

    lines.push('');
    lines.push(
      `[verify] ❌ ${verdict} gate: ${result.gate.stack}:${result.gate.id} — ${result.gate.label}`
    );
    if (result.status === 'env-fail') {
      lines.push(
        '  note:    the tool itself failed to run — this is NOT a finding about the code.'
      );
      lines.push('           Fix the toolchain; do not change source in response to this output.');
    }
    lines.push(`  command: ${result.gate.argv.join(' ')}`);
    lines.push(`  cwd:     ${result.gate.cwd}`);
    lines.push(`  exit:    ${result.exitCode ?? 'killed'}`);
    lines.push('');
    lines.push('--- captured output ---');
    lines.push(truncateOutput(result.output));
    lines.push('--- end ---');
  }
  // #endregion END_FAILURE_DETAIL

  if (report.total === 0) {
    // A run that executed nothing must never read as success (review: ZERO_GATES).
    const skips = report.results.filter((result) => result.status === 'skipped').length;
    lines.push(
      `[verify] ZERO_GATES: nothing was executed (${skips} gate(s) skipped) — verified nothing`
    );
  } else if (report.ok) {
    const notes = report.runs.map((run) => `${run.detection.stack}: ${run.scope.note}`).join(' · ');
    lines.push(`[verify] ALL_GATES_PASS (${report.passed}/${report.total}) — ${notes}`);
  }

  return lines.join('\n');
}

/**
 * @purpose Execute fixers in the REAL tree: sequential, fail-fast — they mutate one tree (§4.4).
 * @param fixers Fixers as Gate data; `sandbox` is ignored, mutation is expected.
 * @returns Results up to and including the first non-pass; skipped entries are reported.
 * @sideEffect Process: runs mutating commands in the working tree.
 */
export function runFix(fixers: readonly Gate[]): GateResult[] {
  const results: GateResult[] = [];
  for (const fixer of fixers) {
    const result = runGate({ ...fixer, sandbox: false });
    results.push(result);
    if (result.status !== 'pass' && result.status !== 'skipped') {
      break;
    }
  }
  return results;
}
