// @file: Runnable CLI entrypoint for the external SDD eval harness.
// @spec: AI-SKILLS
// @consumers: npm run sdd-flow-eval; intentionally uses SDK only, never a provider binary.

import { execSync } from 'node:child_process';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  toolEventsFrom,
  runCheckpoints,
  buildTrajectory,
  type CheckpointSpec,
  type Exec,
  type Trajectory,
} from './trajectory.ts';
import { SddEvalOpenCodeEvidenceSource } from './evidence.ts';
import { parseOpenCodeModel, SddEvalOpenCodeRuntime } from './opencode-runtime.ts';
import { provisionScenarioDirectories } from './provision.ts';
import { resolveBasePrompt } from './prompts.ts';
import { checkR1Structure, checkCompletion } from './quality-gate.ts';
import {
  captureBaseline,
  runMigrationChecks,
  computeMigrationGrade,
  type MigrationFindingBaseline,
} from './migration-grade.ts';
import { DEFAULT_SDD_EVAL_CONFIG, SddEvalRunner } from './runner.ts';
import {
  collectSpecFiles,
  countPendingOperatorDeviations,
  formatBudgetExhausted,
  pruneRetainedSandboxes,
  SddEvalSandboxLifecycle,
  type SddEvalLifecycleReason,
  type SddEvalRunArtifact,
} from './sandbox-lifecycle.ts';
import {
  appendExperimentLogStub,
  persistDurableResult,
  relativeResultDir,
  resolveGitSha,
  type SddEvalDurableSummary,
} from './results-archive.ts';
import { SddEvalSessionDirectoryMap } from './session-directory.ts';
import { SDD_EVAL_PHASES, SDD_EVAL_MODES } from './types.ts';
import type { SddEvalConfig, SddEvalScenario } from './types.ts';

/** @purpose Parsed command-line options; all model values retain provider/model configurability. */
type SddEvalCliOptions = {
  scenarioFile: string;
  directory: string;
  gennadyRoot?: string;
  /** Keep bounded debug sandboxes (at most two for 24h). Default: retention zero. */
  keep: boolean;
  /** Where to persist durable artifacts (specs/judge/summary); default under gennadyRoot/cwd. */
  artifactsDir?: string;
  /** GAP-E-6/D-62: where each scenario's PERMANENT result record lands (summary.json + judge.md),
   *  never gitignored; default `<gennadyRoot|cwd>/ai/flow-eval/results`. Distinct from artifactsDir
   *  (the whole-batch transient .results/run-<ISO>/ tree) — this one dir per scenario per day. */
  resultsDir?: string;
  config: SddEvalConfig;
};

function requiredValue(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

/** @purpose Parse the public CLI without side effects, suitable for fake-backed tests. */
function parseSddEvalCliArgs(argv: string[]): SddEvalCliOptions {
  const config: SddEvalConfig = { ...DEFAULT_SDD_EVAL_CONFIG };
  let defaultProvider = config.runnerModel.providerID;
  let runnerModelValue: string | undefined;
  let judgeModelValue: string | undefined;
  let scenarioFile = resolve(new URL('./scenarios.json', import.meta.url).pathname);
  let directory = tmpdir();
  let gennadyRoot: string | undefined;
  let keep = false;
  let artifactsDir: string | undefined;
  let resultsDir: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    switch (arg) {
      case '--scenario-file':
        scenarioFile = resolve(requiredValue(argv, index++, arg));
        break;
      case '--directory':
        directory = resolve(requiredValue(argv, index++, arg));
        break;
      case '--gennady-root':
        gennadyRoot = resolve(requiredValue(argv, index++, arg));
        break;
      case '--keep':
        keep = true;
        break;
      case '--artifacts-dir':
        artifactsDir = resolve(requiredValue(argv, index++, arg));
        break;
      case '--results-dir':
        resultsDir = resolve(requiredValue(argv, index++, arg));
        break;
      case '--base-url':
        config.baseUrl = requiredValue(argv, index++, arg);
        break;
      case '--model':
        runnerModelValue = requiredValue(argv, index++, arg);
        break;
      case '--judge-model':
        judgeModelValue = requiredValue(argv, index++, arg);
        break;
      case '--provider':
        defaultProvider = requiredValue(argv, index++, arg);
        break;
      case '--concurrency':
        config.concurrency = Number(requiredValue(argv, index++, arg));
        break;
      case '--observe-every-ms':
        config.observeEveryMs = Number(requiredValue(argv, index++, arg));
        break;
      case '--stuck-after':
        config.stuckAfter = Number(requiredValue(argv, index++, arg));
        break;
      case '--max-observations':
        config.maxObservations = Number(requiredValue(argv, index++, arg));
        break;
      case '--max-wall-clock-ms':
        config.maxWallClockMs = Number(requiredValue(argv, index++, arg));
        break;
      case '--tail-limit':
        config.tailLimit = Number(requiredValue(argv, index++, arg));
        break;
      case '--agent':
        config.agent = requiredValue(argv, index++, arg);
        break;
      case '--help':
        throw new Error(
          'usage: sdd-flow-eval --scenario-file FILE --directory DIR [--model PROVIDER/MODEL] ' +
            '[--artifacts-dir DIR] [--results-dir DIR] [--keep]\n' +
            '  sandboxes are torn down after the run; whole-batch artifacts are saved to ' +
            '--artifacts-dir (default .results/); one permanent per-scenario record (GAP-E-6) is ' +
            'always saved to --results-dir (default ai/flow-eval/results/); pass --keep to retain ' +
            'sandboxes for debugging'
        );
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!Number.isInteger(config.concurrency) || config.concurrency < 1)
    throw new Error('concurrency must be >= 1');
  if (
    config.observeEveryMs < 0 ||
    config.stuckAfter < 1 ||
    !Number.isInteger(config.maxObservations) ||
    config.maxObservations < 1 ||
    config.tailLimit < 1
  ) {
    throw new Error(
      'observe-every-ms must be >= 0; stuck-after/max-observations/tail-limit must be >= 1'
    );
  }
  if (
    config.maxWallClockMs !== undefined &&
    (!Number.isFinite(config.maxWallClockMs) || config.maxWallClockMs < 0)
  )
    throw new Error('max-wall-clock-ms must be a finite number >= 0 (0 disables)');
  if (runnerModelValue) config.runnerModel = parseOpenCodeModel(runnerModelValue, defaultProvider);
  if (judgeModelValue) config.judgeModel = parseOpenCodeModel(judgeModelValue, defaultProvider);
  return { scenarioFile, directory, gennadyRoot, keep, artifactsDir, resultsDir, config };
}

const SDD_EVAL_PHASE_SET = new Set<string>(SDD_EVAL_PHASES);
const SDD_EVAL_MODE_SET = new Set<string>(SDD_EVAL_MODES);

/**
 * @purpose Parse and validate the scenario file, fail-fast (GAP-E-1/H-16). A typo in `phase` used to
 *   compose a silently phase-less prompt (`prompts.ts` filters out the resulting `undefined`), and a
 *   typo in `mode` used to silently fall back to a DIFFERENT valid prompt — both looked like a normal
 *   run but measured the wrong branch. Both are now a load-time error naming the field and scenario id.
 */
export async function loadScenarios(path: string): Promise<SddEvalScenario[]> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== 'object')) {
    throw new Error('scenario file must contain an array of scenario objects');
  }
  const scales = new Set(['product', 'module', 'function', 'fix']);
  for (const item of value as Array<Record<string, unknown>>) {
    const id = String(item.id ?? '<unknown>');
    if (typeof item.phase !== 'string' || !SDD_EVAL_PHASE_SET.has(item.phase)) {
      throw new Error(
        `scenario ${id} has invalid PHASE: ${JSON.stringify(item.phase)} ` +
          `(expected one of ${SDD_EVAL_PHASES.join(', ')})`
      );
    }
    if (typeof item.mode !== 'string' || !SDD_EVAL_MODE_SET.has(item.mode)) {
      throw new Error(
        `scenario ${id} has invalid MODE: ${JSON.stringify(item.mode)} ` +
          `(expected one of ${SDD_EVAL_MODES.join(', ')})`
      );
    }
    if (item.scale !== undefined && !scales.has(String(item.scale))) {
      throw new Error(`scenario ${id} has invalid SCALE`);
    }
    if (item.phase === 'spec-authoring' && item.scale === undefined) {
      throw new Error(`scenario ${id} must provide synthetic operator-confirmed SCALE`);
    }
    // `phase`/`mode` are each individually valid enum members at this point, but `brownfield` further
    // restricts which modes it accepts (prompts.ts owns that mapping) — resolve it NOW, before any
    // sandbox is provisioned or worker session started, so an unsupported combination fails the whole
    // load instead of surfacing only once the runner reaches this particular scenario.
    try {
      resolveBasePrompt(
        item.phase as SddEvalScenario['phase'],
        item.mode as SddEvalScenario['mode']
      );
    } catch (cause) {
      throw new Error(`scenario ${id} ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
  return value as SddEvalScenario[];
}

/**
 * @purpose CI-suitable aggregate exit code for one batch (E-00/E-17). `budget-exhausted` is reported
 *   separately and excluded from pass/fail. A `worker-error` (the harness/runtime
 *   itself failed) or a failed DETERMINISTIC quality gate (R1/R-COMPLETE/MIGRATION `quality.pass ===
 *   false`) is a hard batch failure. The judge's verdict (`pass`/`fail`/`inconclusive`) is diagnostic
 *   only (D-28/L-14/E-21) and never appears in this computation — see `judge.ts`.
 * @param artifacts Every scenario's durable outcome from this run.
 * @returns 1 when the batch must fail CI, 0 otherwise.
 */
export function computeAggregateExitCode(artifacts: readonly SddEvalRunArtifact[]): 0 | 1 {
  const failed = artifacts.some(
    (artifact) =>
      artifact.outcome !== 'budget-exhausted' &&
      (artifact.verdict === 'worker-error' || artifact.quality?.pass === false)
  );
  return failed ? 1 : 0;
}

/** @purpose Execute the CLI; results are human-readable lines and no trace/JSON file is written. */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseSddEvalCliArgs(argv);
  const artifactsRoot =
    options.artifactsDir ?? join(options.gennadyRoot ?? process.cwd(), 'ai/flow-eval/.results');
  const permanentResultsRoot =
    options.resultsDir ?? join(options.gennadyRoot ?? process.cwd(), 'ai/flow-eval/results');
  const runStamp = `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const sandboxRoot = await realpath(options.directory).catch(() => resolve(options.directory));
  const lifecycle = new SddEvalSandboxLifecycle({
    sandboxRoot,
    artifactsRoot,
    protectedArtifactsRoot: permanentResultsRoot,
    runId: runStamp,
    keep: options.keep,
  });
  const abortController = new AbortController();
  const signalBoundary = lifecycle.installSignalHandlers(abortController);
  options.config.signal = abortController.signal;
  options.config.onObservation = (scenarioId, observation) => {
    const last = observation.tail.at(-1);
    const activity = last
      ? `${last.role}: ${(last.text || last.toolCalls.at(-1)?.inputSummary || 'tool activity')
          .replace(/\s+/g, ' ')
          .slice(0, 180)}`
      : 'no messages';
    console.log(
      `${scenarioId}: status=${observation.status} progress=${observation.progress} ` +
        `artifact=${observation.artifactProgress ? 'changed' : observation.hasArtifactDiff ? 'same' : 'none'} ` +
        `artifact-wait=${observation.artifactRepeatCount} tools=${observation.toolCallCount} ` +
        `repeat=${observation.repeatCount} stuck=${observation.stuck} tail=${activity}`
    );
  };
  const artifacts: SddEvalRunArtifact[] = [];
  let failure: unknown;
  let reason: SddEvalLifecycleReason = 'success';
  let lifecycleFailed = false;
  let setupComplete = false;
  try {
    await pruneRetainedSandboxes(sandboxRoot);
    const scenarios = await loadScenarios(options.scenarioFile);
    const isolated = await provisionScenarioDirectories(scenarios, {
      rootDirectory: sandboxRoot,
      gennadyRoot: options.gennadyRoot,
      signal: abortController.signal,
      dependencyLeaseId: runStamp,
      lifecycleOwnsCleanup: true,
      onOwnedDirectory: (scenarioId, directory) =>
        lifecycle.registerOwnedDirectory(scenarioId, directory),
      onDependencyLease: (leaseFile) => lifecycle.registerDependencyLease(leaseFile),
    });
    setupComplete = true;
    // Migration is graded by literal A1 baseline-diff: capture each pre-worker code+file+severity
    // identity NOW, on the freshly provisioned v1 repo.
    const migrationBaselines = new Map<string, MigrationFindingBaseline>();
    for (const scenario of isolated) {
      if (scenario.phase === 'migration')
        migrationBaselines.set(scenario.id, await captureBaseline(scenario.directory));
    }
    await runAndReport(options, isolated, artifacts, migrationBaselines);
    reason = signalBoundary.received() ?? 'success';
  } catch (cause) {
    failure = cause;
    reason = signalBoundary.received() ?? (setupComplete ? 'failure' : 'setup-failure');
  } finally {
    const finalized = await lifecycle.finalize(reason, artifacts);
    signalBoundary.dispose();
    if (finalized.runDirectory) console.log(`artifacts → ${finalized.runDirectory}`);
    console.log(
      `sandboxes: removed=${finalized.removed} retained=${finalized.retained} pending=${finalized.pending.length}`
    );
    for (const error of finalized.errors) console.error(`lifecycle: ${error}`);
    lifecycleFailed = finalized.errors.length > 0 || finalized.pending.length > 0;
  }
  const receivedSignal = signalBoundary.received();
  if (receivedSignal) {
    process.exitCode = receivedSignal === 'SIGINT' ? 130 : 143;
    return;
  }
  if (failure) throw failure;
  // Aggregate CI-suitable exit code (E-00): any worker-error or failed deterministic quality gate
  // fails the batch. The judge's verdict never participates — see computeAggregateExitCode.
  const exitCode = lifecycleFailed ? 1 : computeAggregateExitCode(artifacts);
  console.log(`batch outcome: exit ${exitCode} (${artifacts.length} scenario(s) reported)`);
  process.exitCode = exitCode;
}

/** @purpose Run every scenario, print the per-run report lines, and collect durable artifacts. */
async function runAndReport(
  options: SddEvalCliOptions,
  isolated: Array<SddEvalScenario & { directory: string }>,
  artifacts: SddEvalRunArtifact[],
  migrationBaselines: Map<string, MigrationFindingBaseline>
): Promise<void> {
  const registry = new SddEvalSessionDirectoryMap();
  const runtime = new SddEvalOpenCodeRuntime({ baseUrl: options.config.baseUrl, registry });
  // GAP-E-1b: the default live event reader (evidence.ts) opens a real, long-lived SSE subscription
  // to the OpenCode server; without an explicit abort it retries with backoff even after this batch
  // is fully done, which would keep the CLI process alive indefinitely. This signal is aborted in the
  // finally below so a finished run always exits promptly, independent of the OpenCode server's state.
  const eventAbort = new AbortController();
  const evidence = new SddEvalOpenCodeEvidenceSource({
    baseUrl: options.config.baseUrl,
    registry,
    eventSignal: eventAbort.signal,
  });
  try {
    await runAndReportBody(options, isolated, artifacts, migrationBaselines, runtime, evidence);
  } finally {
    eventAbort.abort();
  }
}

/** @purpose The body of runAndReport, split out so the event-subscription abort above always runs. */
async function runAndReportBody(
  options: SddEvalCliOptions,
  isolated: Array<SddEvalScenario & { directory: string }>,
  artifacts: SddEvalRunArtifact[],
  migrationBaselines: Map<string, MigrationFindingBaseline>,
  runtime: SddEvalOpenCodeRuntime,
  evidence: SddEvalOpenCodeEvidenceSource
): Promise<void> {
  // GAP-E-6/D-62: one durable record per scenario, always — under ai/flow-eval/results/, never
  // gitignored (unlike the transient .results/ persistRunArtifacts writes below). sha/root are the
  // same for every scenario in this batch, so resolved once rather than per scenario.
  const gennadyRootForResults = options.gennadyRoot ?? process.cwd();
  const resultsRoot = options.resultsDir ?? join(gennadyRootForResults, 'ai/flow-eval/results');
  const sha = await resolveGitSha(gennadyRootForResults);
  const results = await new SddEvalRunner(runtime, evidence, options.config).runAll(isolated);
  const byId = new Map(isolated.map((scenario) => [scenario.id, scenario]));
  for (const result of results) {
    const verdict = result.worker.budgetExhausted
      ? 'budget-exhausted'
      : (result.judge?.verdict ?? 'worker-error');
    console.log(`${result.worker.scenarioId}: ${verdict} (${result.worker.status})`);
    if (result.worker.error) console.log(`  [diag] worker.error: ${result.worker.error}`);
    {
      const lastAsst = [...result.worker.tail].reverse().find((e) => e.role === 'assistant');
      if (lastAsst)
        console.log(
          `  [diag] last assistant: ${(lastAsst.text || lastAsst.toolCalls.at(-1)?.inputSummary || '').replace(/\s+/g, ' ').slice(0, 200)}`
        );
    }
    const scenario = byId.get(result.worker.scenarioId);
    // Objective quality rule R1 (structural integrity) for phases that PRODUCE specs — the mechanical
    // signal alongside the stochastic judge (docs/EVAL-SPEC.md). The pure golden-graded work carries
    // no specs and is graded by its own golden set, not sdd-check: `task`, and the brownfield delta
    // modes (modify-code-delta/fix-code-delta). The brownfield spec modes DO write specs, so R1 applies.
    const brownfieldSpecMode =
      scenario?.phase === 'brownfield' &&
      (scenario.mode === 'recover-spec' ||
        scenario.mode === 'delta-to-spec' ||
        scenario.mode === 'modify-via-spec');
    const producesSpecs =
      !!scenario &&
      scenario.phase !== 'task' &&
      (scenario.phase !== 'brownfield' || brownfieldSpecMode);
    let quality: SddEvalRunArtifact['quality'];
    if (scenario?.phase === 'migration' && scenario.directory) {
      // Frozen deterministic bar: FLOW_VERSION=v2 + zero migration-introduced findings (baseline-diff).
      const { stateOutput, checkOutput } = await runMigrationChecks(scenario.directory);
      const g = computeMigrationGrade(
        migrationBaselines.get(scenario.id) ?? [],
        stateOutput,
        checkOutput
      );
      quality = { rule: 'MIGRATION', pass: g.pass, detail: g.detail };
      console.log(`  migration: ${g.pass ? 'PASS' : 'FAIL'} — ${g.detail}`);
    } else if (scenario && scenario.directory && producesSpecs) {
      const r1 = await checkR1Structure(scenario.directory);
      quality = { rule: r1.rule, pass: r1.pass, detail: r1.detail };
      console.log(`  quality ${r1.rule}: ${r1.pass ? 'pass' : 'FAIL'} — ${r1.detail}`);
    }
    // R-COMPLETE (opt-in): when an execute scenario DECLARES its completion targets, read them from disk
    // and fail the run if the artifact was built but the ticket never reached a real DONE (closed round +
    // group receipts). Mechanical answer to the abandoned-artifact blind spot; a failing R-COMPLETE is
    // decisive over R1 (structure clean ≠ work finished). Scenarios without `completion` are unaffected.
    if (scenario?.completion && scenario.directory) {
      const rc = checkCompletion(scenario.directory, scenario.completion);
      console.log(`  quality ${rc.rule}: ${rc.pass ? 'pass' : 'FAIL'} — ${rc.detail}`);
      if (!rc.pass || !quality) quality = { rule: rc.rule, pass: rc.pass, detail: rc.detail };
    }
    // A/B currency: per-run token + cost totals (independent of machine load), so runs on different
    // servers stay comparable. `msgs` is the assistant-message count (a coarse trajectory-length proxy).
    const u = result.worker.usage;
    if (u) {
      console.log(
        `  usage: total=${u.total} (in=${u.input} out=${u.output} reason=${u.reasoning} cache r/w=${u.cacheRead}/${u.cacheWrite}) cost=${u.cost.toFixed(4)} msgs=${u.messages}`
      );
    }
    // Persist the judge's full rationale next to the scenario sandbox: the terminal line carries
    // only the verdict, so without this a 'fail'/'inconclusive' is undiagnosable after the run.
    const directory = scenario?.directory;
    let judgeFile: string | undefined;
    if (result.judge?.rationale && directory) {
      const target = join(directory, `.sdd-eval-judge.${result.worker.scenarioId}.md`);
      await writeFile(
        target,
        `# ${result.worker.scenarioId} — ${verdict} (${result.worker.status})\n\n${result.judge.rationale}\n`,
        'utf8'
      ).catch(() => undefined);
      judgeFile = target;
      console.log(`  judge rationale → ${target}`);
    }
    // Trajectory (opt-in via scenario.checkpoints): the worker session is ephemeral, so normalize it
    // into a durable, testable `trajectory.json` — tool events (from the same tail the observer reads)
    // interleaved with deterministic checkpoint exit codes — that a `*.trajectory.test.ts` asserts over
    // offline, as many times as needed, without re-running the (stochastic, slow) agent.
    if (scenario?.checkpoints && directory && result.worker.sessionId) {
      try {
        const tail = await evidence.readTail(result.worker.sessionId, 100_000);
        const tools = toolEventsFrom(tail);
        const ticket = scenario.completion?.ticket ?? '';
        const specs: CheckpointSpec[] = scenario.checkpoints.map((c) => ({
          id: c.id,
          cmd: c.cmd.replaceAll('<ticket>', ticket),
        }));
        const runCheckpointCmd: Exec = (cmd) => {
          try {
            execSync(cmd, { cwd: directory, stdio: 'ignore' });
            return { exit: 0 };
          } catch (cause) {
            const status = (cause as { status?: number }).status;
            return { exit: typeof status === 'number' ? status : 1 };
          }
        };
        const checkpoints = runCheckpoints(specs, runCheckpointCmd, Date.now());
        const traj: Trajectory = buildTrajectory(result.worker.scenarioId, tools, checkpoints);
        const target = join(directory, `.sdd-eval-trajectory.${result.worker.scenarioId}.json`);
        await writeFile(target, `${JSON.stringify(traj, null, 2)}\n`, 'utf8');
        const greens = checkpoints.filter((c) => c.green).length;
        console.log(
          `  trajectory → ${target} (${tools.length} tools · ${greens}/${checkpoints.length} checkpoints green)`
        );
      } catch (cause) {
        console.log(
          `  trajectory: skipped (${cause instanceof Error ? cause.message : String(cause)})`
        );
      }
    }
    // Collect this scenario's durable outcome so it survives the sandbox teardown below.
    if (directory) {
      const budgetExhausted = result.worker.budgetExhausted
        ? {
            ...result.worker.budgetExhausted,
            pendingOperatorCount: await countPendingOperatorDeviations(directory),
          }
        : undefined;
      if (budgetExhausted) {
        console.log(`  budget: ${formatBudgetExhausted(budgetExhausted)}`);
      }
      const artifact: SddEvalRunArtifact = {
        scenarioId: result.worker.scenarioId,
        verdict,
        status: result.worker.status,
        ...(result.worker.budgetExhausted ? { outcome: 'budget-exhausted' as const } : {}),
        ...(budgetExhausted ? { budgetExhausted } : {}),
        usage: u,
        quality,
        specFiles: producesSpecs ? await collectSpecFiles(directory) : [],
        judgeFile,
        directory,
      };
      artifacts.push(artifact);
      // Per-scenario gate preview (E-00): the same fold the final batch exit code uses, applied to
      // this one scenario, so a mechanical FAIL is visible immediately next to its line instead of
      // only in the trailing "batch outcome" summary once every scenario has finished.
      console.log(`  gate: ${computeAggregateExitCode([artifact]) === 1 ? 'FAIL' : 'pass'}`);

      // GAP-E-6/D-62: the permanent record — written even when --keep is set or the run is later
      // interrupted, unlike persistRunArtifacts below (which only runs once the whole batch finishes).
      const finishedAt = new Date();
      const lastObservation = result.worker.observations.at(-1);
      const firstObservation = result.worker.observations[0];
      const outcome: SddEvalDurableSummary['outcome'] = result.worker.budgetExhausted
        ? 'budget-exhausted'
        : verdict === 'pass' || verdict === 'fail' || verdict === 'worker-error'
          ? verdict
          : 'unknown';
      const durableSummary: SddEvalDurableSummary = {
        scenarioId: result.worker.scenarioId,
        date: finishedAt.toISOString().slice(0, 10),
        timestamp: finishedAt.toISOString(),
        sha,
        model: options.config.runnerModel,
        judgeModel: options.config.judgeModel,
        budget: {
          concurrency: options.config.concurrency,
          maxObservations: options.config.maxObservations,
          observeEveryMs: options.config.observeEveryMs,
          stuckAfter: options.config.stuckAfter,
          tailLimit: options.config.tailLimit,
        },
        verdict,
        status: result.worker.status,
        outcome,
        ...(budgetExhausted ? { budgetExhausted } : {}),
        actions: lastObservation?.toolCallCount ?? 0,
        durationMs:
          firstObservation && lastObservation && lastObservation !== firstObservation
            ? lastObservation.at - firstObservation.at
            : undefined,
        usage: u,
        quality,
        hasJudge: Boolean(judgeFile),
        specFiles: artifact.specFiles,
      };
      const resultDir = await persistDurableResult(resultsRoot, durableSummary, {
        judgeFile,
      }).catch((cause: unknown) => {
        console.error(
          `  results: could not persist durable result — ${cause instanceof Error ? cause.message : String(cause)}`
        );
        return undefined;
      });
      if (resultDir) console.log(`  results → ${resultDir}`);
      // GAP-E-6/D-62 (в): a stub entry per run, append-only — see the template documented at the
      // top of EXPERIMENTS-LOG.md. Best-effort: a missing/moved log file must never fail a real run.
      if (resultDir) {
        const logPath = join(gennadyRootForResults, 'ai/flow-eval/docs/journal/EXPERIMENTS-LOG.md');
        // SO-5: never write the absolute, machine-specific resultDir into this COMMITTED doc —
        // relativize it against gennadyRoot first (see relativeResultDir()'s own doc-comment).
        const resultDirForLog = relativeResultDir(gennadyRootForResults, resultDir);
        await appendExperimentLogStub(logPath, durableSummary, resultDirForLog).catch(
          (cause: unknown) => {
            console.error(
              `  results: could not append experiments-log stub — ${cause instanceof Error ? cause.message : String(cause)}`
            );
          }
        );
      }
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((cause) => {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  });
}
