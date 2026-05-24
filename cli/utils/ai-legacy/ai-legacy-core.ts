// @file: Core for model selection and prompt batching by diff; combines GennadyRc and AiLegacyModel.
// @consumers: commit-gen, review-gen
// @tasks: N/A

import { AiLegacyModel } from './ai-legacy-model.ts';
import { GennadyRc } from '../../../shared/backend/rc/rc-config.ts';
import { logger } from '#logger';
import { unguardOrThrow } from '../../../shared/common/unguard.ts';

type AiLegacyCoreInit = {
  logger?: typeof logger;
  timeout?: number;
  maxInputTokens?: number;
};

type ParsedDiffFile = import('../../../shared/backend/git/git-diff.ts').ParsedDiffFile;

/**
 * @purpose Core for model selection and prompt batching by diff; combines GennadyRc and AiLegacyModel.
 * @invariant Models loaded from .gennadyrc (cwd, HOME); if absent — getDefault().
 * @consumer CommitGen, ReviewGen
 * @deprecated Use direct work with AiLegacyModel and GennadyRc.
 */
export class AiLegacyCore {
  /** @purpose Loaded AI model list from gennadyrc. */
  protected _models: AiLegacyModel[] = [];
  /** @purpose Currently active model that passed ping check. */
  protected _activeModel: AiLegacyModel | null = null;
  /** @purpose Configuration and dependencies for the core. */
  protected init: AiLegacyCoreInit & {
    logger: typeof logger;
    timeout: number;
    maxInputTokens: number;
  };

  /**
   * @purpose Initialize AiLegacyCore with loaded models from gennadyrc.
   * @param init Configuration (logger, timeout, maxInputTokens). */
  constructor(init: AiLegacyCoreInit = {}) {
    this.init = {
      logger,
      timeout: 120,
      maxInputTokens: init.maxInputTokens ?? 4000,
      ...init,
    };

    GennadyRc.getDefaults().forEach((rc) => {
      if (rc.isValid()) {
        this._models.push(...rc.getModels().map((model) => new AiLegacyModel(model)));
      }
    });

    if (!this._models.length) {
      this._models.push(AiLegacyModel.getDefault());
    }
  }

  /** @purpose Name of the first loaded model (for CLI display).
   * @returns Model name string or undefined. */
  get model(): string | undefined {
    return this._models[0]?.name;
  }

  /** @purpose URL of the first loaded model.
   * @returns API URL string or undefined. */
  get apiUrl(): string | undefined {
    return this._models[0]?.url;
  }

  /** @purpose Token limit per batch when splitting diff.
   * @returns Max input tokens count. */
  get maxInputTokens(): number {
    return this.init.maxInputTokens;
  }

  /**
   * @purpose Split parsed diff into batches by maxInputTokens for sequential LLM requests.
   * @param parseDiff Array of ParsedDiffFile (usually parsedCodeDiff from getGitDiffInfo).
   * @returns Array of batches { tokens, diff, languages }.
   */
  createPromptsBatchesByDiff(
    parseDiff: ParsedDiffFile[]
  ): { tokens: number; diff: string; languages: string[] }[] {
    let mutableDiff = parseDiff;
    const maxChunkTokens = parseDiff.at(-1)?.tokens ?? 0;

    if (maxChunkTokens > this.maxInputTokens) {
      this.init.logger.error(`Diff is too large: ${maxChunkTokens} > ${this.maxInputTokens}`);
      mutableDiff = parseDiff.slice(0, this.maxInputTokens);
    }

    const batches = mutableDiff.reduce(
      (acc: { tokens: number; diff: string; languages: string[] }[], file) => {
        let first = acc[0];
        if (!first || first.tokens + file.tokens > this.maxInputTokens) {
          acc.unshift({ tokens: 0, diff: '', languages: [] });
          first = acc[0]!;
        }

        const fileDiff = file.diff.hunks.flatMap((h) => h.changes).join('\n');
        if (fileDiff.trim()) {
          first.tokens += file.tokens;
          first.diff += `### File **${file.filename}**:\n${fileDiff}\n\n`;
          const lang = file.programmingLanguage;
          if (lang && !first.languages.includes(lang)) {
            first.languages.push(lang);
          }
        }

        return acc;
      },
      [] as { tokens: number; diff: string; languages: string[] }[]
    );

    return batches;
  }

  /**
   * @purpose Call the first available model (ping) and generate a response from the prompt.
   * @param prompt Prompt text.
   * @param [systemPrompt] Optional system prompt.
   * @returns Model response text or empty string on error.
   * @sideEffect Network: ping then generate; Logs: error/warn on model failure.
   */
  async generate(prompt: string, systemPrompt?: { system?: string }): Promise<string> {
    try {
      const model = await unguardOrThrow(this._choiceModel());
      const result = await unguardOrThrow(model.generate(prompt, systemPrompt));
      return result;
    } catch (error) {
      this.init.logger.error(
        `[AI_LEGACY_CORE_ERROR_GENERATE] Failed to generate LLM response:`,
        error
      );
      return '';
    }
  }

  /**
   * @purpose Select the first model that successfully responded to ping; caches in _activeModel.
   * @returns Tuple [model, null] or [null, Error] if no model is available.
   * @sideEffect Network: ping each model until first success.
   */
  protected async _choiceModel(): Promise<[AiLegacyModel, null] | [null, Error]> {
    if (this._activeModel) {
      return [this._activeModel, null];
    }

    for (const model of this._models) {
      const [ok, error] = await model.ping();
      if (ok) {
        this._activeModel = model;
        return [model, null];
      } else if (error) {
        this.init.logger.warn(
          `[AI_LEGACY_CORE_ERROR_PING_MODEL_FAIL] [${model.name}] Ping failed:`,
          error
        );
      }
    }

    return [null, new Error(`[AI_LEGACY_CORE_ERROR_PING_FAIL] No available models`)];
  }
}
