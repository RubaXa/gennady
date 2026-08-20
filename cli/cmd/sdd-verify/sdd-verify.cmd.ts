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
    const r =
      gate.via === 'gennady'
        ? runner('npx', ['gennady', gate.name])
        : runner('npm', ['run', resolveScriptName(gate.name)]);
    const durationMs = Date.now() - start;
    logger.debug(`[SddVerifyCommand#run] ${gate.name} → exit ${r.exitCode} (${durationMs}ms)`);
    results.push({ name: gate.name, exitCode: r.exitCode, output: r.output, durationMs });
  }
  return verdict(results);
}
