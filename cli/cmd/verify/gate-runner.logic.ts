// @file: Execute verify gates sequentially without a shell and format the report.
// @consumers: verify.cmd
// @tasks: SPIKE-yaml-verify

import { spawnSync } from 'node:child_process';
import type { VerifyGate } from './verify-config.logic.ts';

/** Head lines kept when truncating a failing gate's output. */
const HEAD_LINES = 20;
/** Tail lines kept when truncating — failure summaries usually live at the end. */
const TAIL_LINES = 40;
/** Capture cap; exceeding it kills the child, so it is a safety bound only. */
const MAX_BUFFER = 64 * 1024 * 1024;

/**
 * @purpose Outcome of one gate. `fail` implicates the code; `env-fail` the environment.
 * @consumer verify.cmd
 */
export type GateResult = {
  /** @purpose The gate that produced this result. */
  readonly gate: VerifyGate;
  /** @purpose Verdict of the execution. */
  readonly status: 'pass' | 'fail' | 'env-fail' | 'timeout' | 'skipped';
  /** @purpose Process exit code, or null when skipped, killed or never spawned. */
  readonly exitCode: number | null;
  /** @purpose Wall-clock duration in milliseconds. */
  readonly durationMs: number;
  /** @purpose Combined stdout+stderr, retained only for non-passing gates. */
  readonly output: string;
};

/**
 * @purpose Aggregate result of a verify run.
 * @consumer verify.cmd
 */
export type VerifyReport = {
  /** @purpose Per-gate results in plan order. */
  readonly results: readonly GateResult[];
  /** @purpose Executed gates that passed (skips excluded). */
  readonly passed: number;
  /** @purpose Gates actually executed (skips excluded). */
  readonly total: number;
  /** @purpose True when at least one gate executed and every executed gate passed. */
  readonly ok: boolean;
};

/**
 * @purpose Run one gate to completion.
 * @param gate Gate to execute; a gate with empty argv is reported as skipped.
 * @returns Result with classification.
 * @sideEffect Process: spawns the gate's argv synchronously, without a shell.
 */
export function runGate(gate: VerifyGate): GateResult {
  if (gate.argv.length === 0) {
    return { gate, status: 'skipped', exitCode: null, durationMs: 0, output: '' };
  }

  const start = Date.now();
  const proc = spawnSync(gate.argv[0]!, gate.argv.slice(1), {
    cwd: gate.cwd,
    encoding: 'utf-8',
    timeout: gate.timeoutMs,
    maxBuffer: MAX_BUFFER,
    env: gate.env !== undefined ? { ...process.env, ...gate.env } : process.env,
  });
  const durationMs = Date.now() - start;
  const output = `${proc.stdout ?? ''}${proc.stderr ?? ''}`;

  // #region START_CLASSIFY — spawn failure and timeout are environment verdicts, never code
  if (proc.error !== undefined && proc.status === null) {
    const timedOut = (proc.error as NodeJS.ErrnoException).code === 'ETIMEDOUT';
    return {
      gate,
      status: timedOut ? 'timeout' : 'env-fail',
      exitCode: null,
      durationMs,
      output: output.length > 0 ? output : String(proc.error),
    };
  }
  // #endregion END_CLASSIFY

  if (proc.status === 0 && gate.outputMeansFailure && proc.stdout.trim().length > 0) {
    return { gate, status: 'fail', exitCode: 0, durationMs, output };
  }
  if (proc.status === 0) {
    return { gate, status: 'pass', exitCode: 0, durationMs, output: '' };
  }
  return { gate, status: 'fail', exitCode: proc.status, durationMs, output };
}

/**
 * @purpose Run every gate (RUN-ALL: failures accumulate, nothing short-circuits).
 * @param gates Ordered plan.
 * @returns Aggregate report; `ok` is false when zero gates executed — never a silent pass.
 */
export function runVerify(gates: readonly VerifyGate[]): VerifyReport {
  const results = gates.map(runGate);
  const executed = results.filter((result) => result.status !== 'skipped');
  const passed = executed.filter((result) => result.status === 'pass').length;
  return {
    results,
    passed,
    total: executed.length,
    ok: executed.length > 0 && passed === executed.length,
  };
}

/**
 * @purpose Keep the head and the tail of long output — tools put summaries at either end.
 * @param output Raw combined output.
 * @returns Output bounded to HEAD_LINES + TAIL_LINES with an elision marker.
 */
export function truncateOutput(output: string): string {
  const lines = output.split('\n');
  if (lines.length <= HEAD_LINES + TAIL_LINES) {
    return output;
  }
  const elided = lines.length - HEAD_LINES - TAIL_LINES;
  return [
    ...lines.slice(0, HEAD_LINES),
    `… (${elided} lines elided — rerun the command above for the full output)`,
    ...lines.slice(-TAIL_LINES),
  ].join('\n');
}

/**
 * @purpose Render the human report: failures in full detail, passes as a single line.
 * @param report Aggregate report.
 * @returns Multi-line text for stdout.
 */
export function formatVerifyReport(report: VerifyReport): string {
  const lines: string[] = [];

  for (const result of report.results) {
    if (result.status === 'pass') {
      continue;
    }
    if (result.status === 'skipped') {
      lines.push(`[verify] ⏭️  SKIP gate: ${result.gate.id}`);
      continue;
    }
    const badge = result.status === 'fail' ? 'FAIL' : result.status.toUpperCase();
    lines.push(`[verify] ❌ ${badge} gate: ${result.gate.id}`);
    if (result.status !== 'fail') {
      lines.push(
        '  note:    the tool or environment failed — this is NOT a finding about the code.'
      );
    }
    lines.push(`  command: ${result.gate.argv.join(' ')}`);
    lines.push(`  cwd:     ${result.gate.cwd}`);
    lines.push(`  exit:    ${result.exitCode ?? '(none)'}`);
    lines.push('');
    lines.push('--- captured output ---');
    lines.push(truncateOutput(result.output.trimEnd()));
    lines.push('--- end ---');
    lines.push('');
  }

  lines.push(
    report.ok
      ? `[verify] ✅ ALL_GATES_PASS (${report.passed}/${report.total})`
      : report.total === 0
        ? '[verify] ⚠️  ZERO_GATES_EXECUTED — nothing was verified'
        : `[verify] ❌ GATES_FAILED (${report.passed}/${report.total} passed)`
  );
  return lines.join('\n');
}
