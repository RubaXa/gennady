// @file: Runnable CLI entrypoint for the external SDD eval harness.
// @consumers: npm run sdd-flow-eval; intentionally uses SDK only, never a provider binary.

import { execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
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
  type FindingHistogram,
} from './migration-grade.ts';
import { DEFAULT_SDD_EVAL_CONFIG, SddEvalRunner } from './runner.ts';
import {
  collectSpecFiles,
  persistRunArtifacts,
  teardownSandboxDirectories,
  type SddEvalRunArtifact,
} from './sandbox-lifecycle.ts';
import { SddEvalSessionDirectoryMap } from './session-directory.ts';
import { SDD_EVAL_PHASES, SDD_EVAL_MODES } from './types.ts';
import type { SddEvalConfig, SddEvalScenario } from './types.ts';

/** @purpose Parsed command-line options; all model values retain provider/model configurability. */
type SddEvalCliOptions = {
  scenarioFile: string;
  directory: string;
  gennadyRoot?: string;
  /** Keep the sandboxes on disk after the run (debugging). Default: tear them down. */
  keep: boolean;
  /** Where to persist durable artifacts (specs/judge/summary); default under gennadyRoot/cwd. */
  artifactsDir?: string;
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
            '[--artifacts-dir DIR] [--keep]\n' +
            '  sandboxes are torn down after the run; durable artifacts are saved to --artifacts-dir; ' +
            'pass --keep to retain sandboxes for debugging'
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
  return { scenarioFile, directory, gennadyRoot, keep, artifactsDir, config };
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
 * @purpose CI-suitable aggregate exit code for one batch (E-00). A `worker-error` (the harness/runtime
 *   itself failed) or a failed DETERMINISTIC quality gate (R1/R-COMPLETE/MIGRATION `quality.pass ===
 *   false`) is a hard batch failure. The judge's verdict (`pass`/`fail`/`inconclusive`) is diagnostic
 *   only (D-28/L-14/E-21) and never appears in this computation — see `judge.ts`.
 * @param artifacts Every scenario's durable outcome from this run.
 * @returns 1 when the batch must fail CI, 0 otherwise.
 */
export function computeAggregateExitCode(artifacts: readonly SddEvalRunArtifact[]): 0 | 1 {
  const failed = artifacts.some(
    (artifact) => artifact.verdict === 'worker-error' || artifact.quality?.pass === false
  );
  return failed ? 1 : 0;
}

/** @purpose Execute the CLI; results are human-readable lines and no trace/JSON file is written. */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseSddEvalCliArgs(argv);
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
  const scenarios = await loadScenarios(options.scenarioFile);
  // Only sandboxes THIS run provisioned (scenario had no pre-set directory) are ours to tear down;
  // a caller-supplied scenario.directory is the caller's to manage.
  const generatedIds = new Set(
    scenarios.filter((scenario) => !scenario.directory).map((s) => s.id)
  );
  const isolated = await provisionScenarioDirectories(scenarios, {
    rootDirectory: options.directory,
    gennadyRoot: options.gennadyRoot,
  });
  const teardownDirs = isolated
    .filter((scenario) => generatedIds.has(scenario.id))
    .map((scenario) => scenario.directory);
  // Best-effort teardown must also run if the process is interrupted mid-run, so a Ctrl-C can never
  // leak ~500MB sandboxes. Guarded so the finally and a signal cannot both remove the same dirs.
  let toreDown = false;
  const teardown = async (): Promise<void> => {
    if (toreDown || options.keep) return;
    toreDown = true;
    await teardownSandboxDirectories(teardownDirs);
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void teardown().finally(() => process.exit(130));
    });
  }
  // Migration is graded by baseline-diff: capture each migration fixture's pre-worker sdd-check
  // histogram NOW, on the freshly provisioned v1 repo, so grading can tell migration-introduced
  // findings from pre-existing v1 debt.
  const migrationBaselines = new Map<string, FindingHistogram>();
  for (const scenario of isolated) {
    if (scenario.phase === 'migration')
      migrationBaselines.set(scenario.id, await captureBaseline(scenario.directory));
  }
  const artifacts: SddEvalRunArtifact[] = [];
  try {
    await runAndReport(options, isolated, artifacts, migrationBaselines);
    const artifactsRoot =
      options.artifactsDir ?? join(options.gennadyRoot ?? process.cwd(), 'ai/flow-eval/.results');
    const runStamp = `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const runDir = await persistRunArtifacts(artifactsRoot, runStamp, artifacts);
    console.log(`artifacts → ${runDir}`);
    // Aggregate CI-suitable exit code (E-00): any worker-error or failed deterministic quality gate
    // fails the batch. The judge's verdict never participates — see computeAggregateExitCode.
    const exitCode = computeAggregateExitCode(artifacts);
    console.log(`batch outcome: exit ${exitCode} (${artifacts.length} scenario(s) reported)`);
    process.exitCode = exitCode;
  } finally {
    await teardown();
    if (!options.keep) console.log(`sandboxes removed: ${teardownDirs.length}`);
    else console.log(`sandboxes kept (--keep): ${teardownDirs.length}`);
  }
}

/** @purpose Run every scenario, print the per-run report lines, and collect durable artifacts. */
async function runAndReport(
  options: SddEvalCliOptions,
  isolated: Array<SddEvalScenario & { directory: string }>,
  artifacts: SddEvalRunArtifact[],
  migrationBaselines: Map<string, FindingHistogram>
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
  migrationBaselines: Map<string, FindingHistogram>,
  runtime: SddEvalOpenCodeRuntime,
  evidence: SddEvalOpenCodeEvidenceSource
): Promise<void> {
  const results = await new SddEvalRunner(runtime, evidence, options.config).runAll(isolated);
  const byId = new Map(isolated.map((scenario) => [scenario.id, scenario]));
  for (const result of results) {
    const verdict = result.judge?.verdict ?? 'worker-error';
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
    // signal alongside the stochastic judge (docs/10-QUALITY-RULES.md). The pure golden-graded work carries
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
        migrationBaselines.get(scenario.id) ?? {},
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
      const artifact: SddEvalRunArtifact = {
        scenarioId: result.worker.scenarioId,
        verdict,
        status: result.worker.status,
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
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((cause) => {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  });
}
