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
  GATES,
  gatesFor,
  verdict,
  requiredGatesFor,
  resolveGateSelectors,
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
import type { PhaseVerificationPlan } from '../../../shared/sdd/phase-verification-plan.ts';

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
 * @invariant Exported for the read-only `gennady verify --plan --json` facade (V-16a) — the
 *   one other place that must report this exact dispatch without running it.
 * @param gateName Gate name (e.g. `yagni`).
 * @returns `{ command, args }` to hand to the runner.
 */
export function gennadyGateCommand(gateName: string): { command: string; args: string[] } {
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
 * @purpose Run one resolvable gate and return its result.
 * @invariant `test:coverage` only PRODUCES the report; the coverage threshold is `testcov`'s job.
 * @invariant `requires`/`envFail`/`outputMeansFailure` are unused by any `GATES` entry (V-03 data
 *   shape for future preset-resolved gates); existing `GATES` behavior stays byte-identical (V-01).
 * @param runner Command runner.
 * @param gate The gate.
 * @param scriptName Resolved npm script name (ignored for `via: 'gennady'`).
 * @returns The gate's final result.
 */
export async function runGate(
  runner: GateRunner,
  gate: Gate,
  scriptName: string
): Promise<GateResult> {
  const start = Date.now();

  // Preconditions run BEFORE the gate command; the first failing one is env-fail with its hint and
  // the gate command never runs (mirrors MAIN services/stack semantics). `GateRunner` has no cwd/env
  // parameter, so a precondition's own `cwd`/`env` are not honored yet — a later task that populates
  // real `requires` entries for a non-default cwd/env needs to widen `GateRunner` first.
  if (gate.requires) {
    for (const precondition of gate.requires) {
      const [preCommand, ...preArgs] = precondition.argv;
      const preResult = await runner(preCommand ?? '', preArgs);
      if (preResult.exitCode !== 0) {
        return {
          name: gate.name,
          status: 'env-fail',
          exitCode: preResult.exitCode,
          output: precondition.hint ?? preResult.output,
          durationMs: Date.now() - start,
          ranCommand: precondition.argv.join(' '),
          mutates: gate.mutates,
        };
      }
    }
  }

  const { command, args } =
    gate.via === 'gennady'
      ? gennadyGateCommand(gate.name)
      : { command: 'npm', args: ['run', scriptName] };
  const r = await runner(command, args);
  const durationMs = Date.now() - start;
  logger.debug(`[SddVerifyCommand#run] ${gate.name} → exit ${r.exitCode} (${durationMs}ms)`);
  const ranCommand = `${command} ${args.join(' ')}`;
  let status: GateStatus = r.exitCode === 0 ? 'pass' : 'fail';
  let output = r.output;

  // `outputMeansFailure` (gofmt -l contract): exit 0 with non-empty stdout is still a failure.
  if (status === 'pass' && gate.outputMeansFailure && r.output.trim() !== '') {
    status = 'fail';
  }

  // ENV_FAIL predicates classify the outcome as environment, never code — checked last so they can
  // reclassify either a `pass` (a predicate matching successful-looking output) or a `fail`.
  // `GateRunResult` has no separate stdout/stderr, so both streams collapse to the combined `output`
  // — the same approximation the renderer already makes; a predicate keyed on one specific stream is
  // unaffected in practice since `output` is stdout followed by stderr.
  if (gate.envFail && gate.envFail.length > 0) {
    const outcome = {
      exitCode: r.exitCode,
      timedOut: false,
      stdout: r.output,
      stderr: r.output,
      output: r.output,
    };
    const matched = gate.envFail.find((predicate) => predicate(outcome));
    if (matched) {
      status = 'env-fail';
      output = matched.hint ? [r.output, matched.hint].filter(Boolean).join('\n') : r.output;
    }
  }

  return {
    name: gate.name,
    status,
    exitCode: r.exitCode,
    output,
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
    gatePlan?: PhaseVerificationPlan;
    /** @purpose V-13 (#20(iii)): `--only` gate-name/glob selectors — full profile only, ignored
     *  (never applied) whenever `gatePlan` is set, so a phase run can never be narrowed by them. */
    only?: readonly string[];
    /** @purpose V-13 (#20(iii)): `--skip` gate-name/glob selectors — same full-profile-only scope
     *  as `only`. */
    skip?: readonly string[];
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
  const producesCoverage =
    phaseContext.gatePlan?.producesCoverage ?? phaseContext.producesCoverage ?? profile === 'test';
  const required = new Set<string>(
    phaseContext.gatePlan
      ? phaseContext.gatePlan.gates.filter((gate) => gate.required).map((gate) => gate.name)
      : requiredGatesFor(profile, producesCoverage)
  );
  const fullGates = phaseContext.gatePlan
    ? GATES.filter((gate) =>
        phaseContext.gatePlan?.gates.some(
          (planned) => planned.name === gate.name && planned.state === 'CONFIGURED'
        )
      )
    : gatesFor(profile, producesCoverage);
  // V-13 (#20(iii)): `--only`/`--skip` narrow the read-only full profile only — a phase run
  // (gatePlan set) ignores both, so a phase's ladder can never drift from its canonical plan (И-2).
  let selectedGates = fullGates;
  if (!phaseContext.gatePlan && (phaseContext.only || phaseContext.skip)) {
    const names = fullGates.map((gate) => gate.name);
    if (phaseContext.only) {
      const resolved = resolveGateSelectors(names, phaseContext.only);
      if (!resolved.ok) {
        return {
          ok: false,
          code: 'ERR_CLI_SDD_VERIFY_UNKNOWN_SELECTOR',
          exitCode: 4,
          message: `[sdd-verify] ERR_CLI_SDD_VERIFY_UNKNOWN_SELECTOR: --only selector "${resolved.selector}" matches no gate — known gates: ${names.join(', ')}`,
        };
      }
      selectedGates = fullGates.filter((gate) => resolved.matched.includes(gate.name));
    }
    if (phaseContext.skip) {
      const resolved = resolveGateSelectors(names, phaseContext.skip);
      if (!resolved.ok) {
        return {
          ok: false,
          code: 'ERR_CLI_SDD_VERIFY_UNKNOWN_SELECTOR',
          exitCode: 4,
          message: `[sdd-verify] ERR_CLI_SDD_VERIFY_UNKNOWN_SELECTOR: --skip selector "${resolved.selector}" matches no gate — known gates: ${names.join(', ')}`,
        };
      }
      selectedGates = selectedGates.filter((gate) => !resolved.matched.includes(gate.name));
    }
    // Н-1 (V-BATCH-13 verdict): a combination like `--only=x --skip=x` (or `--skip=*`) resolves
    // every individual selector `ok`, yet the intersection is empty — without this check that
    // reads as a vacuous `ALL PASS (0/0)`, which a CI reader cannot tell apart from a real green
    // run. An empty post-resolution selection is always a hard error, never a silent no-op.
    if (selectedGates.length === 0) {
      return {
        ok: false,
        code: 'ERR_CLI_SDD_VERIFY_EMPTY_SELECTION',
        exitCode: 4,
        message:
          '[sdd-verify] ERR_CLI_SDD_VERIFY_EMPTY_SELECTION: --only/--skip selectors select no gate — nothing would run.',
      };
    }
  }
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

    const plannedCommand = phaseContext.gatePlan?.gates.find(
      (planned) => planned.name === gate.name
    )?.command;
    const plannedScript = /^npm run (\S+)$/.exec(plannedCommand ?? '')?.[1];
    const scriptName =
      gate.via === 'gennady'
        ? gate.name
        : (plannedScript ?? resolveProjectScriptName(scripts, gate.name));

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
    // env-fail always halts — it is an environment problem, not a reason to keep running gates
    // against a proven-bad environment — regardless of this gate's own `haltsOnFailure` (mirrors the
    // unconditional halt a `missing` required gate already gets above). fail/timeout/violation keep
    // the existing `haltsOnFailure`-gated halt — no `GATES` entry produces timeout/violation today.
    if (
      status === 'env-fail' ||
      ((status === 'fail' || status === 'timeout' || status === 'violation') && gate.haltsOnFailure)
    ) {
      haltedAt = gate.name;
      break;
    }
  }

  // V-13: only judge the foundation names actually selected this run — `--only`/`--skip` can
  // narrow the ladder to just the quality tail, and an unselected foundation gate is not a reason
  // to withhold it (vacuously green when neither foundation gate is in `sequentialGates` at all).
  const fullFoundationGreen =
    profile === 'full' &&
    sequentialGates
      .filter((gate) => ['type-check', 'test:coverage'].includes(gate.name))
      .every((gate) =>
        results.some((result) => result.name === gate.name && result.status === 'pass')
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
