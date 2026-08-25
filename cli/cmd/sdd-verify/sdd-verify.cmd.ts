// @file: SddVerifyCommand — run the profile's verification ladder and summarize (brief on success, details on failure).
// @consumers: gennady.ts
// @tasks: N/A

import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '#logger';
import { isVacuousScript, silencesExitCode } from '../../../shared/sdd/readiness.ts';
import {
  gatesFor,
  verdict,
  REQUIRED_PROFILE_GATES,
  type Gate,
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

/** @purpose Directories never fingerprinted — build/dep/artifact output whose churn is not a source mutation. */
const FINGERPRINT_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'coverage',
  'dist',
  'build',
  '.claude',
]);

/**
 * @purpose Cheap whole-tree fingerprint (path → mtime:size) — tells whether the repair rungs
 *   actually rewrote anything, so the foundation re-runs only then.
 * @param [root] Directory to walk (the project root).
 * @returns Map of file path → `mtimeMs:size` for every non-ignored file.
 */
function treeFingerprint(root = '.'): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!FINGERPRINT_IGNORED_DIRS.has(e.name)) walk(join(dir, e.name));
        continue;
      }
      if (!e.isFile()) continue;
      const p = join(dir, e.name);
      try {
        const st = statSync(p);
        out.set(p, `${st.mtimeMs}:${st.size}`);
      } catch {
        // raced with a concurrent delete — a missing file simply isn't part of the fingerprint
      }
    }
  };
  walk(root);
  return out;
}

/** @purpose Compare two tree fingerprints for equality. | @param a First fingerprint. | @param b Second fingerprint. | @returns True when identical. */
function fingerprintsEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    if (b.get(k) !== v) return false;
  }
  return true;
}

/** @purpose Small slack for filesystem mtime granularity when judging coverage-artifact freshness. */
const ARTIFACT_MTIME_SLACK_MS = 2000;

/**
 * @purpose Semantic check for the `test:coverage` rung — exit 0 alone does not prove coverage was
 *   measured; a fresh artifact under `coverage/` does.
 * @param startMs When the rung started — an artifact older than this is a leftover, not this run's.
 * @returns ok, or the honest reason the run cannot claim coverage was measured.
 */
function coverageArtifactFresh(startMs: number): { ok: true } | { ok: false; reason: string } {
  let entries;
  try {
    entries = readdirSync('coverage', { withFileTypes: true });
  } catch {
    return {
      ok: false,
      reason:
        'команда вышла с кодом 0, но каталога coverage/ нет — покрытие фактически не измерялось. ' +
        'test:coverage обязан писать отчёт в coverage/ (например через c8); иначе зелёный вердикт о покрытии — фикция.',
    };
  }
  let newest = 0;
  for (const e of entries) {
    if (!e.isFile()) continue;
    try {
      const st = statSync(join('coverage', e.name));
      if (st.mtimeMs > newest) newest = st.mtimeMs;
    } catch {
      // ignore racing deletes
    }
  }
  if (newest >= startMs - ARTIFACT_MTIME_SLACK_MS) return { ok: true };
  return {
    ok: false,
    reason:
      'команда вышла с кодом 0, но артефакты в coverage/ не обновились за этот прогон — ' +
      'test:coverage не измеряет покрытие (проверь его команду в package.json).',
  };
}

/**
 * @purpose Run one resolvable gate and append its result; applies the coverage-artifact semantic
 *   check to `test:coverage`.
 * @param runner Command runner. | @param gate The gate. | @param scriptName Resolved npm script name (ignored for `via: 'gennady'`).
 * @param results Accumulator. | @param [nameSuffix] Display suffix (e.g. ` (re-run)`).
 * @returns The gate's final status.
 */
function runGate(
  runner: GateRunner,
  gate: Gate,
  scriptName: string,
  results: GateResult[],
  nameSuffix = ''
): GateStatus {
  const start = Date.now();
  const { command, args } =
    gate.via === 'gennady'
      ? gennadyGateCommand(gate.name)
      : { command: 'npm', args: ['run', scriptName] };
  const r = runner(command, args);
  const durationMs = Date.now() - start;
  logger.debug(
    `[SddVerifyCommand#run] ${gate.name}${nameSuffix} → exit ${r.exitCode} (${durationMs}ms)`
  );
  const ranCommand = `${command} ${args.join(' ')}`;
  let status: GateStatus = r.exitCode === 0 ? 'pass' : 'fail';
  let output = r.output;
  if (gate.name === 'test:coverage' && status === 'pass') {
    const fresh = coverageArtifactFresh(start);
    if (!fresh.ok) {
      status = 'fail';
      output = fresh.reason;
    }
  }
  results.push({
    name: `${gate.name}${nameSuffix}`,
    status,
    exitCode: r.exitCode,
    output,
    durationMs,
    ranCommand,
    mutates: gate.mutates,
  });
  return status;
}

/**
 * @purpose Execute sdd-verify — walk the profile's ladder, halt on a broken foundation, then
 *   summarize. Repair rungs that changed the tree trigger one foundation re-run.
 * @invariant A foundation rung's failure (`Gate.haltsOnFailure`) breaks the loop; a missing optional
 *   script is never a failure.
 * @invariant A missing or echo-stub REQUIRED script (`REQUIRED_PROFILE_GATES`) is a red verdict.
 * @invariant `test:coverage` passing additionally requires a fresh `coverage/` artifact.
 * @param runner Command runner — real spawnSync in the CLI entry, a fake in tests.
 * @param [profile] Gate profile (default `full`) selecting which gates run.
 * @returns VerifyOutcome — ✅ per gate on success, else the failed gates' details.
 */
export async function run(runner: GateRunner, profile: Profile = 'full'): Promise<VerifyOutcome> {
  const scripts = readProjectScripts();
  const results: GateResult[] = [];
  const required = new Set<string>(REQUIRED_PROFILE_GATES[profile]);
  let haltedAt: string | undefined;
  let preMutationFingerprint: Map<string, string> | null = null;
  let anyMutatingRan = false;

  for (const gate of gatesFor(profile)) {
    const scriptName =
      gate.via === 'gennady' ? gate.name : resolveNpmScriptName(gate.name, scripts);

    if (gate.via !== 'gennady') {
      const isMissing = scriptName === undefined;
      const isVacuous = !isMissing && isVacuousScript(scripts, scriptName);
      if ((isMissing || isVacuous) && required.has(gate.name)) {
        const reason = isMissing
          ? `скрипта нет в package.json — verify нечем`
          : silencesExitCode(scripts, scriptName as string)
            ? `у скрипта заглушён exit code (\`|| true\` и подобное) — он не может сообщить о падении, зелёный вердикт был бы фикцией`
            : `скрипт — заглушка (no-op), он выходит с кодом 0, ничего не проверяя — зелёный вердикт был бы фикцией`;
        results.push({
          name: gate.name,
          status: 'missing',
          exitCode: 1,
          output: `обязательная ступень профиля «${profile}»: ${reason}. Лестница остановлена. Прогони infra flow (npx gennady sdd-state → GATE_QUEUE) и повтори.`,
          durationMs: 0,
          ranCommand: '',
          mutates: gate.mutates,
        });
        break;
      }
      if (isMissing) {
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
    }

    // Snapshot the tree once, right before the first mutating rung actually runs — the cheapest
    // honest way to know later whether the repair rungs rewrote anything.
    if (gate.mutates && preMutationFingerprint === null) {
      preMutationFingerprint = treeFingerprint('.');
    }

    const status = runGate(runner, gate, scriptName as string, results);
    if (gate.mutates) anyMutatingRan = true;

    if (status === 'fail' && gate.haltsOnFailure) {
      haltedAt = gate.name;
      break;
    }
  }

  // One bounded repair pass: when the mutating rungs changed the tree, the foundation verdicts above
  // describe code that no longer exists — re-run them once, read-only, over the repaired state.
  if (anyMutatingRan && preMutationFingerprint !== null && haltedAt === undefined) {
    const changed = !fingerprintsEqual(preMutationFingerprint, treeFingerprint('.'));
    if (changed) {
      for (const gate of gatesFor(profile).filter((g) => g.haltsOnFailure)) {
        const prior = results.find((r) => r.name === gate.name);
        if (!prior || prior.status !== 'pass') continue;
        const scriptName =
          gate.via === 'gennady' ? gate.name : resolveNpmScriptName(gate.name, scripts);
        if (gate.via !== 'gennady' && scriptName === undefined) continue;
        const status = runGate(
          runner,
          gate,
          scriptName as string,
          results,
          ' (re-run после мутаций)'
        );
        if (status === 'fail') {
          haltedAt = gate.name;
          break;
        }
      }
    }
  }

  return verdict(results, haltedAt, profile);
}
