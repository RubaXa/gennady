// @file: Legacy AI Agent — wrapper over AiLegacyModel for receiving structured JSON responses.
// @consumers: N/A
// @tasks: N/A

import { unguardOrThrow } from '../../../shared/common/unguard.ts';
import { AiLegacyModel } from './ai-legacy-model.ts';

/**
 * @purpose Legacy AI Agent — wrapper over AiLegacyModel for receiving structured JSON responses.
 * @invariant brain must be an instance of AiLegacyModel; otherwise the constructor throws.
 * @consumer cmd/agent, tests
 */
export class AiLegacyAgent {
  /** @purpose AI model instance for making generation requests. */
  protected _brain: AiLegacyModel;

  /**
   * @purpose Create an agent with the given model.
   * @param brain Instance of AiLegacyModel for requests.
   * @throws Error if brain is not instanceof AiLegacyModel.
   */
  constructor(brain: AiLegacyModel) {
    if (!(brain instanceof AiLegacyModel)) {
      throw new Error(
        '[AiLegacyAgent_constructor_Invalid_Brain] `brain` must be instanceof AiLegacyModel'
      );
    }
    this._brain = brain;
  }

  /**
   * @purpose Send a prompt and parse the response as JSON (with stripping of markdown code blocks).
   * @param prompt Prompt text (non-empty string).
   * @throws Error on empty or non-string prompt (before the request).
   * @returns Tuple [parsed object, null] or [null, Error] on empty prompt/parsing error.
   * @sideEffect Network: call this._brain.generate.
   */
  async getJson(prompt: string): Promise<[object, null] | [null, Error]> {
    try {
      if (typeof prompt !== 'string' || prompt.trim() === '') {
        throw new Error('[AiLegacyAgent_getJson_Invalid_Prompt] `prompt` must not be empty string');
      }

      const result = await unguardOrThrow(this._brain.generate(prompt));
      const maybeJson = result
        .trim()
        .replace(/```([a-z]+\n)?/g, '')
        .trim();
      return [JSON.parse(maybeJson) as object, null];
    } catch (cause) {
      return [null, new Error('[AiLegacyAgent_getJson_Error] Failed to get JSON', { cause })];
    }
  }
}
