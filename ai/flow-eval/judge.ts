// @file: Isolated SDD judge; receives only bounded intent, state, diff, events, and tail evidence.
// @consumers: SddEvalRunner, CLI/future command

import type {
  OpenCodeModel,
  SddEvalJudgeInput,
  SddEvalJudgeResult,
  SddEvalRuntime,
} from './types.ts';

/** @purpose Serialize judge evidence while making the input boundary auditable and explicit. */
function composeJudgePrompt(input: SddEvalJudgeInput): string {
  return [
    'Evaluate the SDD implementation using only the evidence below.',
    'Return a concise verdict (pass, fail, or inconclusive) and rationale. A stuck or unfinished worker, cancelled required worker/tool, red required gate, or missing required approval-boundary artifact is a failure. A worker-authored risk acceptance never overrides a red gate. An explicit pending operator approval is valid only when that is the scenario target and the actual reviewed artifacts exist.',
    `INTENT\n${input.intent}`,
    input.acceptance ? `ACCEPTANCE\n${input.acceptance}` : '',
    `STATE\n${JSON.stringify(input.state)}`,
    `DIFF\n${input.diff}`,
    `EVENTS\n${JSON.stringify(input.events)}`,
    `BOUNDED_TAIL\n${JSON.stringify(input.tail)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function parseVerdict(text: string): SddEvalJudgeResult['verdict'] {
  const normalized = text.toLowerCase();
  const explicit = normalized.match(
    /^\s*(?:\*{0,2})?(?:(?:verdict|вердикт)\s*:\s*)?(pass|fail|inconclusive)\b/m
  )?.[1];
  if (explicit === 'pass' || explicit === 'fail' || explicit === 'inconclusive') return explicit;
  // Failure wins when rationale mentions both the expected success condition and the
  // actual failure. This prevents `FAIL ... cannot pass` from being parsed as success.
  if (/\bfail\b|отклон|ошиб/.test(normalized)) return 'fail';
  if (/\bpass\b|принято|успеш/.test(normalized)) return 'pass';
  return 'inconclusive';
}

/** @purpose Run a separate judge session with no access to the worker's full conversation. */
export class SddEvalJudge {
  readonly #runtime: SddEvalRuntime;
  readonly #model: OpenCodeModel;

  constructor(runtime: SddEvalRuntime, model: OpenCodeModel) {
    this.#runtime = runtime;
    this.#model = model;
  }

  async evaluate(
    scenarioId: string,
    directory: string,
    input: SddEvalJudgeInput
  ): Promise<SddEvalJudgeResult> {
    const rationale = await this.#runtime.judge({
      directory,
      model: this.#model,
      prompt: composeJudgePrompt(input),
    });
    return {
      scenarioId,
      verdict: parseVerdict(rationale),
      rationale,
      model: this.#model,
    };
  }
}
