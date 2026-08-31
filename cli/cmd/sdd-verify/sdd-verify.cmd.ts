// @file: SddVerifyCommand — run the profile's verification ladder and summarize (brief on success, details on failure).
// @consumers: gennady.ts
// @tasks: N/A

import { execFile, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { logger } from '#logger';
import {
  isDeclaredArgumentForwardingRepairBrick,
  isVacuousScript,
  resolveProjectScriptName,
} from '../../../shared/sdd/readiness.ts';
import {
  gatesFor,
  verdict,
  requiredGatesFor,
  type Gate,
  type GateResult,
  type GateRunResult,
  type GateRunner,
  type GateStatus,
  type Profile,
  type VerifyOutcome,
} from './sdd-verify.types.ts';
import type { RepairMutationBoundary } from './workspace-mutation.ts';
import { describeRepairAction, planTargetRepair } from './repair-adapters.ts';

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

/**
 * @purpose Async production runner for independent read-only quality gates — same no-shell and
 *   bounded-output contract as `defaultRunner`, without serializing unrelated child processes.
 * @param command Executable to spawn.
 * @param args Exact argument vector.
 * @param maxBuffer Bounded combined-output ceiling.
 * @returns Exit code plus stdout/stderr; spawn/overflow errors are honest exit 127 diagnostics.
 */
function runAsyncWithMaxBuffer(
  command: string,
  args: string[],
  maxBuffer: number
): Promise<GateRunResult> {
  return new Promise((resolve) => {
    execFile(command, args, { encoding: 'utf-8', maxBuffer }, (error, stdout, stderr) => {
      const output = `${stdout ?? ''}${stderr ?? ''}`;
      if (!error) {
        resolve({ exitCode: 0, output });
        return;
      }
      if (typeof error.code === 'number') {
        resolve({ exitCode: error.code, output });
        return;
      }
      resolve({
        exitCode: 127,
        output: `${output}${output ? '\n' : ''}${command}: ${error.message}`,
      });
    });
  });
}

/**
 * @purpose Production async runner with the canonical gate-output ceiling.
 * @param command Executable to spawn without a shell.
 * @param args Exact argument vector.
 * @param [maxBuffer] Bounded combined-output ceiling; tests may lower it to prove overflow handling.
 * @returns Exit code plus captured stdout/stderr, or honest exit 127 on spawn/overflow failure.
 */
export function defaultAsyncRunner(
  command: string,
  args: string[],
  maxBuffer = GATE_MAX_BUFFER_BYTES
): Promise<GateRunResult> {
  return runAsyncWithMaxBuffer(command, args, maxBuffer);
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

// In a consumer project, `npx --no-install gennady <gate>` resolves gennady from that project's own
// node_modules — correct there. Inside gennady's own repo (self-hosting), `npx gennady` instead
// resolves through npm's `_npx` cache — a copy unrelated to this checkout that can be stale or
// non-executable (the "tool lies" failure mode). Self-hosting must run gennady's own source
// directly, the same way this repo always runs its own CLI (`"dev": "tsx cli/gennady.ts"` in
// package.json): `npx --no-install tsx cli/gennady.ts <gate>`. `node dist/gennady.js` was considered and
// rejected — `dist/` is a build artifact that can be stale relative to the source tree sdd-verify
// is meant to be checking, which would silently verify the wrong code.
/**
 * @purpose Resolve the command + args to run for a `via: 'gennady'` gate.
 * @param gateName Gate name (e.g. `yagni`).
 * @returns `{ command, args }` to hand to the runner.
 */
function gennadyGateCommand(gateName: string): { command: string; args: string[] } {
  if (isSelfHosting()) {
    return { command: 'npx', args: ['--no-install', 'tsx', 'cli/gennady.ts', gateName] };
  }
  return { command: 'npx', args: ['--no-install', 'gennady', gateName] };
}

/**
 * @purpose Prove the coverage report is from THIS run — clear the stale one, confirm a fresh appeared.
 */
export type CoverageProbe = {
  /** @purpose Narrow repo-local directories the producer is explicitly allowed to generate. */
  writableArtifactDirectories: readonly string[];
  /**
   * @purpose Clear existing adapter producer artifacts so stale output cannot be mistaken for current.
   * @returns Success only when prior evidence is safely absent.
   */
  clear: () => { ok: true } | { ok: false; detail: string };
  /**
   * @purpose Whether a coverage report reappeared after the producer ran.
   * @returns Success only when the selected adapter report exists as safe current evidence.
   */
  wroteFresh: () => { ok: true } | { ok: false; detail: string };
};

/**
 * @purpose Red a green `test:coverage` when the producer wrote NO fresh report — a suite exiting 0
 *   having measured nothing must not pass as coverage.
 * @param gate The gate just run. | @param status Its status. | @param results Accumulator (last entry mutated on failure).
 * @param [probe] The coverage probe; absent → no-op (tests).
 * @returns The (possibly downgraded) status.
 */
function verifyCoverageWritten(
  gate: Gate,
  status: GateStatus,
  results: GateResult[],
  probe?: CoverageProbe
): GateStatus {
  if (gate.name !== 'test:coverage' || status !== 'pass' || !probe) {
    return status;
  }
  const fresh = probe.wroteFresh();
  if (fresh.ok) return status;
  const last = results[results.length - 1];
  if (last && last.name.startsWith('test:coverage')) {
    last.status = 'fail';
    last.exitCode = last.exitCode || 1;
    last.output =
      (last.output ? last.output + '\n' : '') +
      `test:coverage завершился с кодом 0, но свежий безопасный отчёт выбранного coverage adapter не появился: ${fresh.detail}. Зелёный вердикт был бы фикцией. Исправь artifact path/producer выбранного adapter и повтори.`;
  }
  return 'fail';
}

/**
 * @purpose Run one resolvable gate and append its result.
 * @invariant The `test:coverage` rung only PRODUCES the report (exit code is the verdict); the
 *   coverage threshold is `gennady testcov`'s job, never here.
 * @param runner Command runner. | @param gate The gate. | @param scriptName Resolved npm script name (ignored for `via: 'gennady'`).
 * @param results Accumulator.
 * @returns The gate's final status.
 */
async function runGate(runner: GateRunner, gate: Gate, scriptName: string): Promise<GateResult> {
  const start = Date.now();
  const { command, args } =
    gate.via === 'gennady'
      ? gennadyGateCommand(gate.name)
      : { command: 'npm', args: ['run', scriptName] };
  const r = await runner(command, args);
  const durationMs = Date.now() - start;
  logger.debug(`[SddVerifyCommand#run] ${gate.name} → exit ${r.exitCode} (${durationMs}ms)`);
  const ranCommand = `${command} ${args.join(' ')}`;
  const status: GateStatus = r.exitCode === 0 ? 'pass' : 'fail';
  return {
    name: gate.name,
    status,
    exitCode: r.exitCode,
    output: r.output,
    durationMs,
    ranCommand,
    mutates: gate.mutates,
  };
}

/**
 * @purpose Execute the ordered formatter/project-linter/Gennady-contract adapter plan over only
 *   each capability's applicable exact phase Target Files.
 * @invariant Arguments are passed without a shell; the injected runtime boundary, not static script
 *   inspection, proves that final workspace mutations stayed inside the canonical target set.
 * @param runner Command runner. | @param scripts Project script capabilities. | @param targets Exact Target Files from phase context.
 * @param results Accumulator receiving one logical `fix` result.
 * @returns Final repair status; formatter failure prevents lint from judging an unstable post-state.
 */
async function runTargetRepair(
  runner: GateRunner,
  scripts: Record<string, string>,
  targets: readonly string[],
  results: GateResult[],
  specPath?: string,
  mutationBoundary?: RepairMutationBoundary
): Promise<GateStatus> {
  const start = Date.now();
  let mutationSnapshot;
  try {
    mutationSnapshot = mutationBoundary?.before(targets);
  } catch (cause) {
    results.push({
      name: 'fix',
      status: 'fail',
      exitCode: 1,
      output: `runtime write-zone could not snapshot the workspace before repair: ${cause instanceof Error ? cause.message : String(cause)}`,
      durationMs: Date.now() - start,
      ranCommand: '',
      mutates: true,
    });
    return 'fail';
  }
  const actions = planTargetRepair({
    scripts,
    targets,
    specPath,
    gennadyCommand: gennadyGateCommand('lint'),
  });
  const outputs: string[] = [];
  const evidence: string[] = [];
  let exitCode = 0;
  for (const action of actions) {
    evidence.push(describeRepairAction(action));
    if (action.kind === 'skip') {
      outputs.push(`⏭ ${describeRepairAction(action)}`);
      continue;
    }
    const result = await runner(action.command, action.args);
    if (result.output) outputs.push(result.output);
    if (result.exitCode !== 0) {
      exitCode = result.exitCode;
      break;
    }
  }
  if (mutationBoundary && mutationSnapshot) {
    const mutation = mutationBoundary.after(mutationSnapshot, targets);
    if (!mutation.ok) {
      exitCode = exitCode || 1;
      outputs.push(
        `${mutation.issue}${mutation.paths.length > 0 ? `:\n${mutation.paths.map((path) => `  - ${path}`).join('\n')}` : ''}`
      );
    }
  }
  results.push({
    name: 'fix',
    status: exitCode === 0 ? 'pass' : 'fail',
    exitCode,
    output: outputs.join('\n'),
    durationMs: Date.now() - start,
    ranCommand: evidence.join(' && '),
    mutates: true,
  });
  return exitCode === 0 ? 'pass' : 'fail';
}

/**
 * @purpose Execute sdd-verify — repair a phase profile first, then run its foundation exactly once;
 *   full remains read-only.
 * @invariant A repair/foundation failure (`Gate.haltsOnFailure`) breaks the loop; a missing optional
 *   setup script is never a failure.
 * @invariant A missing or echo-stub REQUIRED script (`REQUIRED_PROFILE_GATES`) is a red verdict.
 * @invariant `test:coverage` here only PRODUCES the report; its threshold is `gennady testcov`'s job in the test phase, not this gate's.
 * @param runner Command runner — real spawnSync in the CLI entry, a fake in tests.
 * @param [profile] Gate profile (default `full`) selecting which gates run.
 * @param [coverageProbe] Single-producer freshness probe; the CLI injects real fs, tests omit it.
 * @param [phaseContext] Exact phase targets, owning spec, and producer applicability; empty for global full.
 * @param [resultSink] Optional caller-owned evidence sink; receives the exact rung results once.
 * @param [mutationBoundaries] Canonical phase owner injects separate repair/foundation write-zones.
 * @returns VerifyOutcome — ✅ per gate on success, else the failed gates' details.
 */
export async function run(
  runner: GateRunner,
  profile: Profile = 'full',
  coverageProbe?: CoverageProbe,
  phaseContext: {
    targets: readonly string[];
    specPath?: string;
    producesCoverage?: boolean;
    deletionOnly?: boolean;
  } = { targets: [] },
  resultSink?: GateResult[],
  mutationBoundaries?: {
    /** @purpose Exact Target File write-zone used only by format/lint repair. */
    repair: RepairMutationBoundary;
    /** @purpose Empty write-zone except an explicitly declared coverage artifact directory. */
    foundation: RepairMutationBoundary;
  }
): Promise<VerifyOutcome> {
  const scripts = readProjectScripts();
  const results: GateResult[] = [];
  const producesCoverage = phaseContext.producesCoverage ?? profile === 'test';
  const required = new Set<string>(requiredGatesFor(profile, producesCoverage));
  const selectedGates = gatesFor(profile, producesCoverage);
  const qualityTail =
    profile === 'full'
      ? selectedGates.filter((gate) => ['lint', 'format', 'yagni'].includes(gate.name))
      : [];
  const sequentialGates =
    profile === 'full'
      ? selectedGates.filter((gate) => !['lint', 'format', 'yagni'].includes(gate.name))
      : selectedGates;
  let haltedAt: string | undefined;
  let foundationSnapshot: ReturnType<RepairMutationBoundary['before']> | undefined;
  let foundationArtifactDirectories: readonly string[] = [];
  let foundationCommands: string[] = [];
  const closeFoundationTransaction = (nextArtifactDirectories?: readonly string[]): boolean => {
    if (!mutationBoundaries?.foundation || !foundationSnapshot) return true;
    let mutation;
    try {
      if (nextArtifactDirectories) {
        const checkpoint = mutationBoundaries.foundation.checkpoint(
          foundationSnapshot,
          [],
          foundationArtifactDirectories,
          [],
          nextArtifactDirectories
        );
        mutation = checkpoint.result;
        foundationSnapshot = checkpoint.snapshot;
        foundationArtifactDirectories = [...nextArtifactDirectories];
      } else {
        mutation = mutationBoundaries.foundation.after(
          foundationSnapshot,
          [],
          foundationArtifactDirectories
        );
        foundationSnapshot = undefined;
        foundationArtifactDirectories = [];
      }
    } catch (cause) {
      mutation = {
        ok: false as const,
        issue: `cannot inspect workspace at a foundation segment boundary: ${cause instanceof Error ? cause.message : String(cause)}`,
        paths: [],
      };
      foundationSnapshot = undefined;
      foundationArtifactDirectories = [];
    }
    const commands = foundationCommands;
    foundationCommands = [];
    if (mutation.ok) return true;
    foundationSnapshot = undefined;
    foundationArtifactDirectories = [];
    results.push({
      name: 'foundation write-zone',
      status: 'fail',
      exitCode: 1,
      output: `foundation segment ${commands.join(' → ') || '(no command)'}: ${mutation.issue}${mutation.paths.length > 0 ? `:\n${mutation.paths.map((path) => `  - ${path}`).join('\n')}` : ''}`,
      durationMs: 0,
      ranCommand: commands.join(' → ') || 'foundation transaction',
      mutates: false,
    });
    return false;
  };

  for (const gate of sequentialGates) {
    if (gate.via === 'target-repair') {
      const leaves = ['format:fix', 'lint:fix'];
      const repairAvailable = leaves.every(
        (name) =>
          scripts[name] !== undefined &&
          !isVacuousScript(scripts, name) &&
          isDeclaredArgumentForwardingRepairBrick(scripts, name)
      );
      if (!repairAvailable && profile !== 'setup') {
        const absent = leaves.filter(
          (name) =>
            scripts[name] === undefined ||
            isVacuousScript(scripts, name) ||
            !isDeclaredArgumentForwardingRepairBrick(scripts, name)
        );
        results.push({
          name: gate.name,
          status: 'missing',
          exitCode: 1,
          output: `профиль «${profile}» требует declared argument-forwarding repair prefixes: ${absent.join(', ')} отсутствуют, являются no-op, используют shell hop или содержат очевидный broad root/glob. Это ранняя shape-диагностика; runtime write-zone проверяет фактические мутации. Оставь brick командным префиксом, broad roots перенеси в fix, затем повтори контекстный phase gate; foundation не запускался.`,
          durationMs: 0,
          ranCommand: '',
          mutates: true,
        });
        haltedAt = gate.name;
        break;
      }
      if (phaseContext.targets.length === 0 || (profile === 'setup' && !repairAvailable)) {
        if (profile === 'setup' || phaseContext.deletionOnly) {
          results.push({
            name: gate.name,
            status: 'skipped',
            exitCode: 0,
            output: '',
            durationMs: 0,
            ranCommand: '',
            mutates: true,
          });
          continue;
        }
        results.push({
          name: gate.name,
          status: 'missing',
          exitCode: 1,
          output: `профиль «${profile}» требует структурный контекст Target Files фазы`,
          durationMs: 0,
          ranCommand: '',
          mutates: true,
        });
        haltedAt = gate.name;
        break;
      }
      const status = await runTargetRepair(
        runner,
        scripts,
        phaseContext.targets,
        results,
        phaseContext.specPath,
        mutationBoundaries?.repair
      );
      if (status === 'fail') {
        haltedAt = gate.name;
        break;
      }
      continue;
    }

    const scriptName =
      gate.via === 'gennady' ? gate.name : resolveProjectScriptName(scripts, gate.name);

    if (gate.via !== 'gennady') {
      const isMissing = scriptName === undefined;
      const isVacuous = !isMissing && isVacuousScript(scripts, scriptName);
      if ((isMissing || isVacuous) && required.has(gate.name)) {
        const reason = isMissing
          ? `скрипта нет в package.json — verify нечем`
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

    const gateArtifactDirectories =
      gate.name === 'test:coverage' ? (coverageProbe?.writableArtifactDirectories ?? []) : [];
    const sameFoundationAllowance =
      foundationArtifactDirectories.length === gateArtifactDirectories.length &&
      foundationArtifactDirectories.every(
        (directory, index) => directory === gateArtifactDirectories[index]
      );
    if (
      foundationSnapshot &&
      !sameFoundationAllowance &&
      !closeFoundationTransaction(gateArtifactDirectories)
    )
      break;
    if (mutationBoundaries?.foundation && !foundationSnapshot) {
      try {
        foundationArtifactDirectories = [...gateArtifactDirectories];
        foundationSnapshot = mutationBoundaries.foundation.before([], gateArtifactDirectories);
      } catch (cause) {
        results.push({
          name: 'foundation write-zone',
          status: 'fail',
          exitCode: 1,
          output: `runtime foundation write-zone could not snapshot the workspace: ${cause instanceof Error ? cause.message : String(cause)}`,
          durationMs: 0,
          ranCommand: 'foundation transaction',
          mutates: false,
        });
        break;
      }
    }

    // Single-producer freshness: clear the stale report inside the explicit coverage-artifact
    // transaction so a leftover one cannot pass, while source and unrelated files remain read-only.
    if (gate.name === 'test:coverage' && coverageProbe) {
      const cleared = coverageProbe.clear();
      if (!cleared.ok) {
        results.push({
          name: gate.name,
          status: 'fail',
          exitCode: 1,
          output: `coverage producer не запущен: выбранный adapter не смог безопасно очистить прежний report: ${cleared.detail}`,
          durationMs: 0,
          ranCommand: '',
          mutates: gate.mutates,
        });
        haltedAt = gate.name;
        break;
      }
    }
    foundationCommands.push(gate.name);
    const gateResult = await runGate(runner, gate, scriptName as string);
    results.push(gateResult);
    let status = gateResult.status;
    status = verifyCoverageWritten(gate, status, results, coverageProbe);
    if (status === 'fail' && gate.haltsOnFailure) {
      haltedAt = gate.name;
      break;
    }
  }

  const fullFoundationGreen =
    profile === 'full' &&
    ['type-check', 'test:coverage'].every((name) =>
      results.some((result) => result.name === name && result.status === 'pass')
    );
  if (fullFoundationGreen && closeFoundationTransaction([])) {
    const tailResults = await Promise.all(
      qualityTail.map(async (gate): Promise<GateResult> => {
        const scriptName =
          gate.via === 'gennady' ? gate.name : resolveProjectScriptName(scripts, gate.name);
        if (gate.via !== 'gennady') {
          const isMissing = scriptName === undefined;
          const isVacuous = !isMissing && isVacuousScript(scripts, scriptName);
          if ((isMissing || isVacuous) && required.has(gate.name)) {
            const reason = isMissing
              ? `скрипта нет в package.json — verify нечем`
              : `скрипт — заглушка (no-op), он выходит с кодом 0, ничего не проверяя — зелёный вердикт был бы фикцией`;
            return {
              name: gate.name,
              status: 'missing',
              exitCode: 1,
              output: `обязательная ступень профиля «${profile}»: ${reason}. Остальные независимые quality-гейты всё равно выполнены. Прогони infra flow (npx gennady sdd-state → GATE_QUEUE) и повтори.`,
              durationMs: 0,
              ranCommand: '',
              mutates: gate.mutates,
            };
          }
          if (isMissing) {
            return {
              name: gate.name,
              status: 'skipped',
              exitCode: 0,
              output: '',
              durationMs: 0,
              ranCommand: '',
              mutates: gate.mutates,
            };
          }
        }
        return runGate(runner, gate, scriptName as string);
      })
    );
    // Promise.all preserves input order, so reports remain canonical even when completion order differs.
    results.push(...tailResults);
    foundationCommands.push(
      ...tailResults.filter((result) => result.ranCommand).map((result) => result.name)
    );
    closeFoundationTransaction();
  }

  closeFoundationTransaction();

  resultSink?.push(...results);
  return verdict(results, haltedAt, profile);
}
