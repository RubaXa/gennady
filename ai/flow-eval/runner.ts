// @file: Parallel external SDD evaluation runner.
// @consumers: sdd-flow-eval command, fake-backed tests

import { SddEvalJudge } from './judge.ts';
import { SddEvalObserver } from './observer.ts';
import { assertUniqueScenarioDirectories } from './provision.ts';
import { composeSddPhasePrompt } from './prompts.ts';
import type {
  SddEvalConfig,
  SddEvalEvidenceSource,
  SddEvalJudgeResult,
  SddEvalRuntime,
  SddEvalScenario,
  SddEvalObservation,
  SddEvalWorkerResult,
} from './types.ts';

/** @purpose One scenario result with an optional independent judge result. */
export type SddEvalResult = {
  worker: SddEvalWorkerResult;
  judge?: SddEvalJudgeResult;
};

/** @purpose Default configuration requested for OpenCode-backed SDD evals. */
export const DEFAULT_SDD_EVAL_CONFIG: SddEvalConfig = {
  baseUrl: 'http://localhost:4096',
  runnerModel: { providerID: 'openai', modelID: 'gpt-5.6-luna' },
  judgeModel: { providerID: 'openai', modelID: 'gpt-5.6-sol' },
  concurrency: 3,
  observeEveryMs: 5 * 60 * 1000,
  stuckAfter: 1,
  tailLimit: 20,
};

/** @purpose Run independent worker scenarios with bounded concurrency and external observation. */
export class SddEvalRunner {
  readonly #runtime: SddEvalRuntime;
  readonly #evidence: SddEvalEvidenceSource;
  readonly #config: SddEvalConfig;
  readonly #judge?: SddEvalJudge;

  constructor(
    runtime: SddEvalRuntime,
    evidence: SddEvalEvidenceSource,
    config?: Partial<SddEvalConfig>
  ) {
    this.#runtime = runtime;
    this.#evidence = evidence;
    this.#config = { ...DEFAULT_SDD_EVAL_CONFIG, ...config };
    if (this.#config.concurrency < 1) throw new Error('eval concurrency must be >= 1');
    if (
      this.#config.runnerModel.providerID === this.#config.judgeModel.providerID &&
      this.#config.runnerModel.modelID === this.#config.judgeModel.modelID
    ) {
      // Same model is allowed, but keeping this branch explicit prevents accidental coupling in future changes.
    }
    this.#judge = new SddEvalJudge(runtime, this.#config.judgeModel);
  }

  /** @purpose Launch one worker session, then observe only through the external evidence source. */
  async runScenario(scenario: SddEvalScenario): Promise<SddEvalResult> {
    if (!scenario.directory) throw new Error(`scenario ${scenario.id} has no isolated directory`);
    const session = await this.#runtime.createSession({
      title: `sdd-eval:${scenario.id}`,
      directory: scenario.directory,
    });
    const workerPrompt = composeSddPhasePrompt(scenario);

    let observations: SddEvalObservation[];
    let workerError: string | undefined;
    try {
      await this.#runtime.prompt({
        sessionId: session.id,
        text: workerPrompt,
        model: this.#config.runnerModel,
        agent: this.#config.agent,
      });
      observations = await new SddEvalObserver(this.#evidence, {
        everyMs: this.#config.observeEveryMs,
        stuckAfter: this.#config.stuckAfter,
        tailLimit: this.#config.tailLimit,
        abort: (sessionId) => this.#runtime.abort?.(sessionId) ?? Promise.resolve(),
        onObservation: (_sessionId, observation) =>
          this.#config.onObservation?.(scenario.id, observation),
      }).collect(session.id);
    } catch (cause) {
      workerError = cause instanceof Error ? cause.message : String(cause);
      observations = [];
    }

    const finalObservation = observations.at(-1);
    let diff = '';
    try {
      diff = await this.#evidence.readDiff(session.id);
    } catch (cause) {
      workerError ??= cause instanceof Error ? cause.message : String(cause);
    }
    const tail = finalObservation?.tail ?? [];
    const events = finalObservation?.events ?? [];
    const worker: SddEvalWorkerResult = {
      scenarioId: scenario.id,
      sessionId: session.id,
      intent: scenario.intent,
      diff,
      observations,
      events,
      tail,
      status: finalObservation?.status ?? (workerError ? 'error' : 'unknown'),
      ...(workerError ? { error: workerError } : {}),
    };
    if (workerError) return { worker };
    const judge = await this.#judge?.evaluate(scenario.id, scenario.directory, {
      intent: worker.intent,
      diff: worker.diff,
      events: worker.events,
      tail: worker.tail,
    });
    return { worker, ...(judge ? { judge } : {}) };
  }

  /** @purpose Execute scenarios in parallel batches without spawning subprocesses or writing artifacts. */
  async runAll(scenarios: SddEvalScenario[]): Promise<SddEvalResult[]> {
    if (scenarios.some((scenario) => !scenario.directory)) {
      throw new Error('every parallel SDD eval scenario must have an isolated directory');
    }
    assertUniqueScenarioDirectories(scenarios as Array<SddEvalScenario & { directory: string }>);
    const results: SddEvalResult[] = [];
    for (let index = 0; index < scenarios.length; index += this.#config.concurrency) {
      const batch = scenarios.slice(index, index + this.#config.concurrency);
      results.push(...(await Promise.all(batch.map((scenario) => this.runScenario(scenario)))));
    }
    return results;
  }
}
