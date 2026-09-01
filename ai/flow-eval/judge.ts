// @file: Isolated SDD judge; receives only the four approved evidence fields.
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
    'Return a concise verdict (pass, fail, or inconclusive) and rationale.',
    `INTENT\n${input.intent}`,
    `DIFF\n${input.diff}`,
    `EVENTS\n${JSON.stringify(input.events)}`,
    `BOUNDED_TAIL\n${JSON.stringify(input.tail)}`,
  ].join('\n\n');
}

function parseVerdict(text: string): SddEvalJudgeResult['verdict'] {
  const normalized = text.toLowerCase();
  if (/\bpass\b|принято|успеш/.test(normalized)) return 'pass';
  if (/\bfail\b|отклон|ошиб/.test(normalized)) return 'fail';
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
