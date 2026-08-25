// @file: SddVerifyCommand — run the profile's verification ladder and summarize (brief on success, details on failure).
// @consumers: gennady.ts
// @tasks: N/A

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { logger } from '#logger';
import {
  gatesFor,
  verdict,
  type GateResult,
  type GateRunResult,
  type GateRunner,
  type GateStatus,
  type Profile,
  type VerifyOutcome,
} from './sdd-verify.types.ts';

/**
 * @purpose Read the project's `package.json` `scripts` map once per run — decides which rungs skip.
 * @returns The scripts map, or `{}` when package.json is absent or unparsable.
 */
function readProjectScripts(): Record<string, string> {
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

/**
 * @purpose Resolve a gate's npm script name against `scripts`, honoring the one accepted alias
 *   (`type-check` canonical / `typecheck` accepted).
 * @invariant Reporting always keeps the canonical `gate.name`. An undeclared script resolves to
 *   `undefined` (skip), never a guess.
 * @param gateName The gate's canonical name (e.g. `type-check`).
 * @param scripts The project's `package.json` `scripts` map.
 * @returns The script name to invoke, or `undefined` when no matching script is declared.
 */
function resolveNpmScriptName(
  gateName: string,
  scripts: Record<string, string>
): string | undefined {
  if (gateName === 'type-check') {
    if (scripts['type-check']) return 'type-check';
    if (scripts['typecheck']) return 'typecheck';
    return undefined;
  }
  return scripts[gateName] ? gateName : undefined;
}

// Node's spawnSync defaults maxBuffer to 1MB — this project's own `test:coverage` TAP output
// (3505 tests, per-test diagnostics) already measures ~1.08MB, so the default clips it and
// spawnSync surfaces that as ENOBUFS, not a real test/coverage failure (observed live: DA-lazy-asm
// P4/P5, both independently). 64MB gives ~60x headroom over today's measured size — generous
// enough to absorb suite growth for a long while without raising the ceiling again, while still
// bounded (an actually runaway gate does not grow the process's memory without limit).
/** @purpose Generous stdout+stderr capture ceiling for a spawned gate — see rationale above. */
export const GATE_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

/**
 * @purpose Spawn `command args` under an explicit `maxBuffer`, capturing exit code and output —
 * the mechanism `defaultRunner` fixes, exposed for a fast small-buffer test.
 * @invariant A real overflow past `maxBuffer` is reported honestly as a spawn error (exit 127 +
 *   Node's own message) — never a silently truncated verdict.
 * @param command Executable to spawn.
 * @param args Arguments for the executable.
 * @param maxBuffer Maximum combined stdout+stderr size, in bytes.
 * @returns Exit code (127 when the command cannot be spawned, including on buffer overflow) and combined stdout/stderr.
 */
export function runWithMaxBuffer(
  command: string,
  args: string[],
  maxBuffer: number
): GateRunResult {
  const r = spawnSync(command, args, { encoding: 'utf-8', maxBuffer });
  if (r.error) return { exitCode: 127, output: `${command}: ${r.error.message}` };
  return { exitCode: r.status ?? 1, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/**
 * @purpose Default gate runner — spawn `command args` without a shell, capturing exit code and combined output.
 * @param command Executable to spawn.
 * @param args Arguments for the executable.
 * @returns Exit code (127 when the command cannot be spawned) and combined stdout/stderr.
 */
export function defaultRunner(command: string, args: string[]): GateRunResult {
  return runWithMaxBuffer(command, args, GATE_MAX_BUFFER_BYTES);
}

// Read the project's own package.json `name` honestly — never infer self-hosting from the
// directory path, since a worktree checkout can be named anything.
/**
 * @purpose Detect self-hosting — is this project's own `package.json` `name` exactly `gennady`?
 * @returns True when this project IS gennady, not merely a consumer that depends on it.
 */
export function isSelfHosting(): boolean {
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8')) as { name?: string };
    return pkg.name === 'gennady';
  } catch {
    return false;
  }
}

// In a consumer project, `npx gennady <gate>` resolves gennady from that project's own
// node_modules — correct there. Inside gennady's own repo (self-hosting), `npx gennady` instead
// resolves through npm's `_npx` cache — a copy unrelated to this checkout that can be stale or
// non-executable (the "tool lies" failure mode). Self-hosting must run gennady's own source
// directly, the same way this repo always runs its own CLI (`"dev": "tsx cli/gennady.ts"` in
// package.json): `npx tsx cli/gennady.ts <gate>`. `node dist/gennady.js` was considered and
// rejected — `dist/` is a build artifact that can be stale relative to the source tree sdd-verify
// is meant to be checking, which would silently verify the wrong code.
/**
 * @purpose Resolve the command + args to run for a `via: 'gennady'` gate.
 * @param gateName Gate name (e.g. `yagni`).
 * @returns `{ command, args }` to hand to the runner.
 */
function gennadyGateCommand(gateName: string): { command: string; args: string[] } {
  if (isSelfHosting()) return { command: 'npx', args: ['tsx', 'cli/gennady.ts', gateName] };
  return { command: 'npx', args: ['gennady', gateName] };
}

/**
 * @purpose Execute sdd-verify — walk the profile's ladder in order, timing each rung, stopping on
 *   a broken foundation, skipping undeclared scripts, then summarize.
 * @invariant A foundation rung's failure (`Gate.haltsOnFailure`) breaks the loop. A missing npm
 *   script never runs and never counts as a failure.
 * @param runner Command runner — real spawnSync in the CLI entry, a fake in tests.
 * @param [profile] Gate profile (default `full`) selecting which gates run.
 * @returns VerifyOutcome — ✅ per gate on success, else the failed gates' details.
 */
export async function run(runner: GateRunner, profile: Profile = 'full'): Promise<VerifyOutcome> {
  const scripts = readProjectScripts();
  const results: GateResult[] = [];
  let haltedAt: string | undefined;

  for (const gate of gatesFor(profile)) {
    const scriptName =
      gate.via === 'gennady' ? gate.name : resolveNpmScriptName(gate.name, scripts);
    if (gate.via !== 'gennady' && scriptName === undefined) {
      results.push({
        name: gate.name,
        status: 'skipped',
        exitCode: 0,
        output: '',
        durationMs: 0,
        ranCommand: '',
        mutates: gate.mutates,
      });
      continue;
    }

    const start = Date.now();
    const { command, args } =
      gate.via === 'gennady'
        ? gennadyGateCommand(gate.name)
        : { command: 'npm', args: ['run', scriptName as string] };
    const r = runner(command, args);
    const durationMs = Date.now() - start;
    logger.debug(`[SddVerifyCommand#run] ${gate.name} → exit ${r.exitCode} (${durationMs}ms)`);
    const ranCommand = `${command} ${args.join(' ')}`;
    const status: GateStatus = r.exitCode === 0 ? 'pass' : 'fail';
    results.push({
      name: gate.name,
      status,
      exitCode: r.exitCode,
      output: r.output,
      durationMs,
      ranCommand,
      mutates: gate.mutates,
    });

    if (r.exitCode !== 0 && gate.haltsOnFailure) {
      haltedAt = gate.name;
      break;
    }
  }

  return verdict(results, haltedAt);
}
