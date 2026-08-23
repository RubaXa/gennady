// @file: SddVerifyCommand — run the fixed verification gate sequence and summarize (brief on success, details on failure).
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
  type Profile,
  type VerifyOutcome,
} from './sdd-verify.types.ts';

/**
 * @purpose Resolve the actual npm script to run for a gate with an accepted alternate spelling
 * — today, only `type-check` (canonical) / `typecheck` (accepted).
 * @invariant Reporting always keeps the canonical `gate.name` — this only changes what runs.
 * @param gateName The gate's canonical name (e.g. `type-check`).
 * @returns The script to invoke — canonical, unless only the alias is declared.
 */
function resolveScriptName(gateName: string): string {
  if (gateName !== 'type-check') return gateName;
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    const scripts = pkg.scripts ?? {};
    if (scripts['type-check']) return 'type-check';
    if (scripts['typecheck']) return 'typecheck';
  } catch {
    // fall through to the canonical name — npm's own "missing script" error is diagnostic enough
  }
  return gateName;
}

/**
 * @purpose Default gate runner — spawn `command args` without a shell, capturing exit code and combined output.
 * @param command Executable to spawn.
 * @param args Arguments for the executable.
 * @returns Exit code (127 when the command cannot be spawned) and combined stdout/stderr.
 */
export function defaultRunner(command: string, args: string[]): GateRunResult {
  const r = spawnSync(command, args, { encoding: 'utf-8' });
  if (r.error) return { exitCode: 127, output: `${command}: ${r.error.message}` };
  return { exitCode: r.status ?? 1, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
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
 * @purpose Execute gennady sdd-verify — run the profile's gates in canonical order (RUN-ALL), timing each, then summarize.
 * @param runner Command runner — real spawnSync in the CLI entry, a fake in tests.
 * @param [profile] Gate profile (default `full`) selecting which gates run.
 * @returns VerifyOutcome — ✅ per gate on success, else the failed gates' details.
 */
export async function run(runner: GateRunner, profile: Profile = 'full'): Promise<VerifyOutcome> {
  const results: GateResult[] = [];
  for (const gate of gatesFor(profile)) {
    const start = Date.now();
    const { command, args } =
      gate.via === 'gennady'
        ? gennadyGateCommand(gate.name)
        : { command: 'npm', args: ['run', resolveScriptName(gate.name)] };
    const r = runner(command, args);
    const durationMs = Date.now() - start;
    logger.debug(`[SddVerifyCommand#run] ${gate.name} → exit ${r.exitCode} (${durationMs}ms)`);
    const ranCommand = `${command} ${args.join(' ')}`;
    results.push({
      name: gate.name,
      exitCode: r.exitCode,
      output: r.output,
      durationMs,
      ranCommand,
    });
  }
  return verdict(results);
}
