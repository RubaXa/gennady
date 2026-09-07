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
    // The first line must be machine-parseable so the verdict never has to be inferred from prose —
    // scenarios about error handling legitimately fill the rationale with words like "error"/"ошибка",
    // which a substring heuristic would misread as a failure.
    'On the FIRST line output exactly one of `VERDICT: pass`, `VERDICT: fail`, or `VERDICT: inconclusive` — nothing else on that line. Then, from the second line on, give a concise rationale. A stuck or unfinished worker, cancelled required worker/tool, red required gate, or missing required approval-boundary artifact is a failure. A worker-authored risk acceptance never overrides a red gate. An explicit pending operator approval is valid only when that is the scenario target and the actual reviewed artifacts exist.',
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

/**
 * @purpose Read the judge's verdict from its rationale.
 * @invariant The verdict is taken only from an explicit `VERDICT: <value>` / `<value>` line (the
 *   prompt mandates one on the first line); when none exists the result is 'inconclusive', never a
 *   prose-substring guess. A rationale that merely *describes* errors ("throws on invalid input",
 *   "ошибка домена") must never be read as a failed run — the old `/ошиб|fail/` fallback did exactly
 *   that and false-failed every error-handling scenario whose judge skipped the verdict line.
 */
export function parseVerdict(text: string): SddEvalJudgeResult['verdict'] {
  const normalized = text.toLowerCase();
  const explicit = normalized.match(
    /^\s*(?:[*_`]{0,2})?(?:(?:verdict|вердикт)\s*[:：]\s*)?(pass|fail|inconclusive)\b/m
  )?.[1];
  if (explicit === 'pass' || explicit === 'fail' || explicit === 'inconclusive') return explicit;
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
