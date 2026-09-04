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
import { SddEvalSessionDirectoryMap } from './session-directory.ts';
import type { SddEvalConfig, SddEvalScenario } from './types.ts';

/** @purpose Parsed command-line options; all model values retain provider/model configurability. */
type SddEvalCliOptions = {
  scenarioFile: string;
  directory: string;
  gennadyRoot?: string;
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
          'usage: sdd-flow-eval --scenario-file FILE --directory DIR [--model PROVIDER/MODEL]'
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
  return { scenarioFile, directory, gennadyRoot, config };
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
  const isolated = await provisionScenarioDirectories(scenarios, {
    rootDirectory: options.directory,
    gennadyRoot: options.gennadyRoot,
  });
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
    if (scenario && scenario.directory && producesSpecs) {
      const r1 = await checkR1Structure(scenario.directory);
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
    if (result.judge?.rationale && directory) {
      const target = join(directory, `.sdd-eval-judge.${result.worker.scenarioId}.md`);
      await writeFile(
        target,
        `# ${result.worker.scenarioId} — ${verdict} (${result.worker.status})\n\n${result.judge.rationale}\n`,
        'utf8'
      ).catch(() => undefined);
      console.log(`  judge rationale → ${target}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((cause) => {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  });
}
