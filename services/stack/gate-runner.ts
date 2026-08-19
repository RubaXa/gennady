// @file: Stack-agnostic gate execution — RUN-ALL / SUPPRESS-ON-SUCCESS runner, env-fail combinators, report.
// @consumers: verify.cmd, plugins (combinators)
// @tasks: TSK-95

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { execFileTrimSafe } from '../../shared/common/exec.ts';
import { createTreeReplica, type TreeReplica } from './tree-replica.ts';
import type {
  Gate,
  GateOutcome,
  GateResult,
  StackDiagnostic,
  StackRun,
  VerifyReport,
} from './stack.types.ts';

/** Head lines kept when truncating long gate output. */
const TRUNCATE_HEAD_LINES = 20;
/** Tail lines kept when truncating — test runners put the failure summary at the end. */
const TRUNCATE_TAIL_LINES = 40;

// Combinators live in env-fail.ts so the config loader can compile rules without
// importing the runner; re-exported here for existing consumers.
export { exitCodeMatches, outputMatches, streamMatches, allOf } from './env-fail.ts';

// #region START_REPLICA_POOL — one run replica per git toplevel, shared by every gate (D-STACK-013)

/**
 * @purpose Execution slot for one gate: a shared replica, a real-tree fallback, or a failure.
 * @consumer gate-runner (internal)
 */
type ReplicaSlot =
  | {
      readonly kind: 'replica';
      readonly dir: string;
      readonly toplevel: string;
      drift(): string;
      reset(): void;
    }
  | { readonly kind: 'unsandboxed' }
  | { readonly kind: 'error'; readonly message: string };

/**
 * @purpose Lazily created run replicas, one per git toplevel, living for the whole verify run.
 * @consumer runVerify (internal)
 */
type ReplicaPool = {
  /** @purpose Resolve the execution slot for a gate cwd. */
  acquire(cwd: string): ReplicaSlot;
  /** @purpose True when at least one gate ran in the real tree (no git repo or HEAD). */
  unsandboxedSeen(): boolean;
  /** @purpose Remove every replica this run created. */
  cleanupAll(): void;
};

/**
 * @purpose Build the pool; replicas materialize on first acquire per toplevel.
 * @param links Ignored paths symlinked into each replica (plugin sandboxLinks).
 * @returns Pool for one verify run.
 */
function createReplicaPool(links: readonly string[]): ReplicaPool {
  const replicas = new Map<string, { replica?: TreeReplica; error?: string }>();
  let unsandboxed = false;

  return {
    acquire(cwd) {
      const toplevel = execFileTrimSafe('git', ['rev-parse', '--show-toplevel'], cwd);
      if (toplevel.length === 0) {
        unsandboxed = true;
        return { kind: 'unsandboxed' };
      }
      let entry = replicas.get(toplevel);
      if (entry === undefined) {
        entry = createTreeReplica(toplevel, links);
        replicas.set(toplevel, entry);
      }
      const replica = entry.replica;
      if (replica === undefined) {
        unsandboxed = true;
        return { kind: 'error', message: entry.error ?? 'replica failed' };
      }
      return {
        kind: 'replica',
        dir: replica.dir,
        toplevel,
        drift: () => replica.drift(),
        reset: () => replica.reset(),
      };
    },
    unsandboxedSeen: () => unsandboxed,
    cleanupAll() {
      for (const entry of replicas.values()) {
        entry.replica?.cleanup();
      }
      replicas.clear();
    },
  };
}

/** Diagnostic for a run whose gates had to execute in the real tree — enforcement was off. */
const UNSANDBOXED_RUN_DIAGNOSTIC: StackDiagnostic = {
  code: 'UNSANDBOXED_RUN',
  message:
    'gates ran in the real working tree (no git repository or HEAD) — the observe-only contract was not enforced',
  fix: 'initialize git and create a first commit so verify can run gates in a tree replica',
};
// #endregion END_REPLICA_POOL

/**
 * @purpose Run one gate to completion and classify the outcome.
 * @param gate Gate to execute; a gate carrying a skip reason is returned untouched.
 * @param pool Run replica pool, or null to execute in the real tree (fixers).
 * @returns Result with status, exit code and captured output.
 * @sideEffect Process: spawns the gate's external command (no shell); gate.env merged over process.env.
 */
function runGate(gate: Gate, pool: ReplicaPool | null): GateResult {
  if (gate.skipped !== null) {
    return { gate, status: 'skipped', exitCode: null, durationMs: 0, output: gate.skipped };
  }

  const slot: ReplicaSlot = pool?.acquire(gate.cwd) ?? { kind: 'unsandboxed' };
  if (slot.kind !== 'replica') {
    if (gate.driftMeansFailure === true) {
      // Drift cannot be computed without a replica — the environment is short of git/HEAD.
      return {
        gate,
        status: 'env-fail',
        exitCode: null,
        durationMs: 0,
        output:
          slot.kind === 'error'
            ? slot.message
            : 'drift gate requires a git repository (no toplevel found)',
      };
    }
    return executeGate(gate, gate.argv, gate.cwd, null);
  }

  // realpath both sides: git resolves symlinked tmp dirs (/tmp, /var on macOS),
  // a raw gate.cwd would mis-map the relative path back into the real tree.
  const realTop = fs.realpathSync(slot.toplevel);
  const cwd = path.join(slot.dir, path.relative(realTop, fs.realpathSync(gate.cwd)));

  // Real-tree absolute paths in argv (golangci -c <cfg>, script targets) must point
  // at the replica copy — tools compute relative paths against them otherwise.
  const argv = gate.argv.map((entry) => {
    if (!path.isAbsolute(entry)) {
      return entry;
    }
    try {
      const real = fs.realpathSync(entry);
      if (real === realTop) {
        return slot.dir;
      }
      if (real.startsWith(realTop + path.sep)) {
        return path.join(slot.dir, path.relative(realTop, real));
      }
    } catch {
      // Not an existing path (a plain argument that looks absolute) — leave it.
    }
    return entry;
  });
  return executeGate(gate, argv, cwd, slot);
}

/**
 * @purpose Spawn the gate command in cwd; classify via exit code, replica drift and predicates.
 * @param gate Gate to execute; results reference it with its original, real-tree argv.
 * @param argv Effective argv (replica-mapped when a slot is given).
 * @param cwd Effective working directory (replica-mapped when a slot is given).
 * @param slot Run replica the gate executed in, or null for real-tree execution (fixers, fallback).
 * @returns Result with status, exit code and captured output; replica paths rewritten to real ones.
 */
function executeGate(
  gate: Gate,
  argv: readonly string[],
  cwd: string,
  slot: Extract<ReplicaSlot, { kind: 'replica' }> | null
): GateResult {
  const startedAt = Date.now();
  const [bin, ...args] = argv;
  const proc = spawnSync(bin!, args, {
    cwd,
    encoding: 'utf-8',
    timeout: gate.timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: gate.env !== undefined ? { ...process.env, ...gate.env } : process.env,
  });
  const durationMs = Date.now() - startedAt;

  // Tool output references the replica; the reader acts on the real tree.
  const rewrite = (text: string): string =>
    slot === null
      ? text
      : text
          .split(fs.realpathSync(slot.dir))
          .join(slot.toplevel)
          .split(slot.dir)
          .join(slot.toplevel);
  const stdout = rewrite(proc.stdout ?? '');
  const output = `${stdout}${rewrite(proc.stderr ?? '')}`.trim();

  // Inspect and restore the replica exactly once, whatever the command's outcome.
  let drift = '';
  if (slot !== null) {
    drift = slot.drift();
    if (drift.length > 0) {
      slot.reset();
    }
  }

  if (proc.error !== undefined && (proc.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
    return { gate, status: 'timeout', exitCode: null, durationMs, output };
  }
  if (proc.error !== undefined && proc.status === null) {
    // Spawn itself failed — the tool never ran; universally environmental.
    return { gate, status: 'env-fail', exitCode: null, durationMs, output: String(proc.error) };
  }

  // #region START_VERDICTS — violation > drift > stdout contract > exit code (spec §8.2)
  if (drift.length > 0 && gate.driftMeansFailure !== true) {
    return {
      gate,
      status: 'violation',
      exitCode: proc.status,
      durationMs,
      output: `gate mutated the tree — files:\n${drift}\ndeclare \`driftMeansFailure: true\` if drift is this gate's verdict, or move the mutation to \`gennady fix\` fixers (D-STACK-005)${output.length > 0 ? `\n--- command output ---\n${output}` : ''}`,
    };
  }

  if (proc.status === 0 && drift.length > 0) {
    // driftMeansFailure: true — the replica was baselined, so any status output is the command's doing.
    return {
      gate,
      status: 'fail',
      exitCode: 0,
      durationMs,
      output: `generated code drifted from its sources — files:\n${drift}\nrun \`gennady fix ${gate.stack}:${gate.id}\` to materialize, then commit`,
    };
  }

  if (gate.outputMeansFailure && proc.status === 0) {
    return stdout.trim().length > 0
      ? { gate, status: 'fail', exitCode: 0, durationMs, output: stdout.trim() }
      : { gate, status: 'pass', exitCode: 0, durationMs, output: '' };
  }

  if (proc.status === 0) {
    return { gate, status: 'pass', exitCode: 0, durationMs, output: '' };
  }
  // #endregion END_VERDICTS

  const outcome: GateOutcome = {
    exitCode: proc.status,
    timedOut: false,
    stdout,
    stderr: rewrite(proc.stderr ?? ''),
    output,
  };
  const matched = (gate.envFail ?? []).find((predicate) => predicate(outcome));
  return {
    gate,
    status: matched !== undefined ? 'env-fail' : 'fail',
    exitCode: proc.status,
    durationMs,
    output: matched?.hint !== undefined ? `${output}\nhint: ${matched.hint}` : output,
  };
}

/**
 * @purpose Execute every gate of every run, never short-circuiting (RUN-ALL), inside the
 *   run replica (D-STACK-013); the pool is torn down at the end.
 * @param runs Per-stack runs whose gate plans are executed in order.
 * @param diagnostics Detection-level diagnostics carried into the report.
 * @param [options] sandboxLinks — plugin-declared ignored paths linked into the replica.
 * @returns Report whose `ok` is true only when no executed gate failed or timed out.
 * @sideEffect Process: spawns one external command per executable gate; IO: temp replicas.
 */
export function runVerify(
  runs: readonly StackRun[],
  diagnostics: readonly StackDiagnostic[],
  options?: { readonly sandboxLinks?: readonly string[] }
): VerifyReport {
  const pool = createReplicaPool(options?.sandboxLinks ?? []);
  let results: GateResult[];
  try {
    results = runs.flatMap((run) => run.gates.map((gate) => runGate(gate, pool)));
  } finally {
    pool.cleanupAll();
  }
  const executed = results.filter((result) => result.status !== 'skipped');
  const passed = executed.filter((result) => result.status === 'pass').length;

  return {
    runs,
    diagnostics: pool.unsandboxedSeen()
      ? [...diagnostics, UNSANDBOXED_RUN_DIAGNOSTIC]
      : diagnostics,
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
      result.status === 'timeout'
        ? 'TIMEOUT'
        : result.status === 'env-fail'
          ? 'ENV_FAIL'
          : result.status === 'violation'
            ? 'VIOLATION'
            : 'FAIL';

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
    if (result.status === 'violation') {
      lines.push(
        '  note:    this gate modified files — a gate observes, never mutates (D-STACK-005).'
      );
      lines.push(
        '           Declare driftMeansFailure: true if drift is its verdict, or move it to fixers.'
      );
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
 * @param fixers Fixers as Gate data; `driftMeansFailure` is ignored, mutation is expected.
 * @returns Results up to and including the first non-pass; skipped entries are reported.
 * @sideEffect Process: runs mutating commands in the working tree.
 */
export function runFix(fixers: readonly Gate[]): GateResult[] {
  const results: GateResult[] = [];
  for (const fixer of fixers) {
    const result = runGate({ ...fixer, driftMeansFailure: false }, null);
    results.push(result);
    if (result.status !== 'pass' && result.status !== 'skipped') {
      break;
    }
  }
  return results;
}
