// @file: Stack-agnostic gate execution — RUN-ALL / SUPPRESS-ON-SUCCESS runner, env-fail combinators, report.
// @consumers: verify.cmd, plugins (combinators)
// @tasks: TSK-95

import { spawnSync } from 'node:child_process';
import type {
  EnvFailPredicate,
  Gate,
  GateResult,
  StackDiagnostic,
  StackRun,
  VerifyReport,
} from './stack.types.ts';

/** Cap on captured output kept in the human report, in lines. */
const MAX_OUTPUT_LINES = 60;

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
 * @returns EnvFailPredicate.
 */
export function outputMatches(pattern: RegExp): EnvFailPredicate {
  return (_exitCode, output) => pattern.test(output);
}

/**
 * @purpose Predicate: the process never ran (spawn failure — ENOENT, EACCES and friends).
 * @returns EnvFailPredicate.
 */
export function spawnFailed(): EnvFailPredicate {
  return (exitCode, output) => exitCode === null && /\b(ENOENT|EACCES|spawn)\b/.test(output);
}
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

  const startedAt = Date.now();
  const [bin, ...args] = gate.argv;
  const proc = spawnSync(bin!, args, {
    cwd: gate.cwd,
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
    return { gate, status: 'pass', exitCode: 0, durationMs, output: '' };
  }

  const isEnvFailure = (gate.envFail ?? []).some((predicate) => predicate(proc.status, output));
  return {
    gate,
    status: isEnvFailure ? 'env-fail' : 'fail',
    exitCode: proc.status,
    durationMs,
    output,
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
 * @purpose Keep failure output within an agent's context budget without hiding the head.
 * @param output Combined tool output.
 * @returns The output, truncated with an explicit marker when it exceeds the line cap.
 */
function truncateOutput(output: string): string {
  if (output.length === 0) {
    return '(no output)';
  }

  const lines = output.split('\n');
  if (lines.length <= MAX_OUTPUT_LINES) {
    return output;
  }

  return [
    ...lines.slice(0, MAX_OUTPUT_LINES),
    `... (${lines.length - MAX_OUTPUT_LINES} more lines truncated — rerun the command above for the full output)`,
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

  if (report.ok) {
    const notes = report.runs.map((run) => `${run.detection.stack}: ${run.scope.note}`).join(' · ');
    lines.push(`[verify] ALL_GATES_PASS (${report.passed}/${report.total}) — ${notes}`);
  }

  return lines.join('\n');
}
