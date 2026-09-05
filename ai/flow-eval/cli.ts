// @file: Runnable CLI entrypoint for the external SDD eval harness.
// @consumers: npm run sdd-flow-eval; intentionally uses SDK only, never a provider binary.

import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SddEvalOpenCodeEvidenceSource } from './evidence.ts';
import { parseOpenCodeModel, SddEvalOpenCodeRuntime } from './opencode-runtime.ts';
import { provisionScenarioDirectories } from './provision.ts';
import { checkR1Structure } from './quality-gate.ts';
import { DEFAULT_SDD_EVAL_CONFIG, SddEvalRunner } from './runner.ts';
import {
  collectSpecFiles,
  persistRunArtifacts,
  teardownSandboxDirectories,
  type SddEvalRunArtifact,
} from './sandbox-lifecycle.ts';
import { SddEvalSessionDirectoryMap } from './session-directory.ts';
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
  if (runnerModelValue) config.runnerModel = parseOpenCodeModel(runnerModelValue, defaultProvider);
  if (judgeModelValue) config.judgeModel = parseOpenCodeModel(judgeModelValue, defaultProvider);
  return { scenarioFile, directory, gennadyRoot, keep, artifactsDir, config };
}

async function loadScenarios(path: string): Promise<SddEvalScenario[]> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== 'object')) {
    throw new Error('scenario file must contain an array of scenario objects');
  }
  const scales = new Set(['product', 'module', 'function', 'fix']);
  for (const item of value as Array<Record<string, unknown>>) {
    if (item.scale !== undefined && !scales.has(String(item.scale))) {
      throw new Error(`scenario ${String(item.id ?? '<unknown>')} has invalid SCALE`);
    }
    if (item.phase === 'spec-authoring' && item.scale === undefined) {
      throw new Error(
        `scenario ${String(item.id ?? '<unknown>')} must provide synthetic operator-confirmed SCALE`
      );
    }
  }
  return value as SddEvalScenario[];
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
  const artifacts: SddEvalRunArtifact[] = [];
  try {
    await runAndReport(options, isolated, artifacts);
    const artifactsRoot =
      options.artifactsDir ?? join(options.gennadyRoot ?? process.cwd(), 'ai/flow-eval/.results');
    const runStamp = `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const runDir = await persistRunArtifacts(artifactsRoot, runStamp, artifacts);
    console.log(`artifacts → ${runDir}`);
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
  artifacts: SddEvalRunArtifact[]
): Promise<void> {
  const registry = new SddEvalSessionDirectoryMap();
  const runtime = new SddEvalOpenCodeRuntime({ baseUrl: options.config.baseUrl, registry });
  const evidence = new SddEvalOpenCodeEvidenceSource({
    baseUrl: options.config.baseUrl,
    registry,
  });
  const results = await new SddEvalRunner(runtime, evidence, options.config).runAll(isolated);
  const byId = new Map(isolated.map((scenario) => [scenario.id, scenario]));
  for (const result of results) {
    const verdict = result.judge?.verdict ?? 'worker-error';
    console.log(`${result.worker.scenarioId}: ${verdict} (${result.worker.status})`);
    const scenario = byId.get(result.worker.scenarioId);
    // Objective quality rule R1 (structural integrity) for phases that PRODUCE specs — the mechanical
    // signal alongside the stochastic judge (QUALITY-RULES.ru.md). The pure golden-graded work carries
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
    if (scenario && scenario.directory && producesSpecs) {
      const r1 = await checkR1Structure(scenario.directory);
      quality = { rule: r1.rule, pass: r1.pass, detail: r1.detail };
      console.log(`  quality ${r1.rule}: ${r1.pass ? 'pass' : 'FAIL'} — ${r1.detail}`);
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
    // Collect this scenario's durable outcome so it survives the sandbox teardown below.
    if (directory) {
      artifacts.push({
        scenarioId: result.worker.scenarioId,
        verdict,
        status: result.worker.status,
        usage: u,
        quality,
        specFiles: producesSpecs ? await collectSpecFiles(directory) : [],
        judgeFile,
        directory,
      });
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((cause) => {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  });
}
