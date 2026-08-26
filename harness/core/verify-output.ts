// @file: verify-output — the honest gate: files present AND agent-authored, tests green, app runs.
// @consumers: harness/core/harness
// @tasks: N/A (eval harness, not published)

import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { AgentTraceEntry } from '../port/agent.port.ts';

/** @purpose What a scenario expects on disk after the flow runs — the pass criteria. */
export type VerifyExpectation = {
  /** @purpose Paths (repo-relative) that MUST exist on disk after the run. */
  requiredFiles: string[];
  /** @purpose Paths that MUST appear in the agent trace as writes — proof the agent authored them. */
  writtenFiles?: string[];
  /** @purpose Test command that MUST exit 0, e.g. `['npm','test']`. */
  testCommand?: string[];
  /** @purpose App-run command that MUST exit 0, e.g. `['node','src/cli.js','X']`. */
  runCommand?: string[];
  /** @purpose Extra named gate commands that MUST exit 0 — e.g. a `gennady testcov` coverage gate. */
  gateCommands?: { name: string; cmd: string[] }[];
};

/** @purpose One pass/fail check with the evidence that decided it. */
export type VerifyCheck = {
  /** @purpose Short check name. */
  name: string;
  /** @purpose Whether it passed. */
  ok: boolean;
  /** @purpose Evidence — the missing path, the command's tail output, etc. */
  detail: string;
};

/** @purpose Aggregate verification outcome — green only if every check is green. */
export type VerifyResult = {
  /** @purpose True iff every check passed. */
  ok: boolean;
  /** @purpose Every check performed, in order. */
  checks: VerifyCheck[];
};

/**
 * @purpose Verify the flow produced working code — presence, authorship, tests, and a run — from
 *   facts on disk and in the trace, never from the agent's self-report.
 * @param dir Repo root the flow ran in.
 * @param trace The agent's accumulated tool-trace.
 * @param expect The scenario's pass criteria.
 * @returns The aggregate result with a per-check breakdown.
 */
export function verifyOutput(
  dir: string,
  trace: AgentTraceEntry[],
  expect: VerifyExpectation
): VerifyResult {
  const checks: VerifyCheck[] = [];
  const written = new Set(
    trace.filter((e) => e.tool === 'write' || e.tool === 'edit').map((e) => e.input)
  );

  for (const f of expect.requiredFiles) {
    checks.push({
      name: `exists:${f}`,
      ok: existsSync(join(dir, f)),
      detail: existsSync(join(dir, f)) ? 'present' : 'MISSING on disk',
    });
  }
  for (const f of expect.writtenFiles ?? []) {
    checks.push({
      name: `authored:${f}`,
      ok: written.has(f),
      detail: written.has(f) ? 'in trace' : 'NOT in agent write-trace',
    });
  }
  if (expect.testCommand) checks.push(runCommand(dir, 'tests', expect.testCommand));
  if (expect.runCommand) checks.push(runCommand(dir, 'app-run', expect.runCommand));
  for (const g of expect.gateCommands ?? []) checks.push(runCommand(dir, g.name, g.cmd));

  return { ok: checks.every((c) => c.ok), checks };
}

/**
 * @purpose Run a command in the repo and turn its exit status into a check.
 * @param dir Working directory.
 * @param name Check name to report under.
 * @param cmd Command and args; index 0 is the executable.
 * @returns A passing check on exit 0, else a failing check carrying the output tail.
 */
function runCommand(dir: string, name: string, cmd: string[]): VerifyCheck {
  const [exe, ...args] = cmd;
  // Scrub NODE_TEST_CONTEXT et al: when the harness itself runs under `node --test`, a spawned
  // `node --test` child inherits that flag, drops into subprocess mode, discovers 0 files, and exits
  // 0 — a false green. The verifier must run the child's tests as a clean top-level process.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('NODE_TEST'))
  );
  try {
    execFileSync(exe, args, { cwd: dir, encoding: 'utf8', stdio: 'pipe', env });
    return { name, ok: true, detail: `${cmd.join(' ')} exited 0` };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() || e.message || 'failed';
    return { name, ok: false, detail: out.slice(-800) };
  }
}
