import { AiLegacyModel } from './ai-legacy-model.ts';
import { GennadyRc } from '../../../shared/backend/rc/rc-config.ts';
import { logger } from '../../../shared/common/logger.ts';
import { unguardOrThrow } from '../../../shared/common/unguard.ts';

type AiLegacyCoreInit = {
  logger?: typeof logger;
  timeout?: number;
  maxInputTokens?: number;
};

type ParsedDiffFile = import('../../../shared/backend/git/git-diff.ts').ParsedDiffFile;

/**
 * @purpose Ядро выбора модели и батчинга промптов по diff; объединяет GennadyRc и AiLegacyModel.
 * @consumer CommitGen, ReviewGen
 * @invariant Модели загружаются из .gennadyrc (cwd, HOME); при отсутствии — getDefault().
 * @deprecated Используй прямую работу с AiLegacyModel и GennadyRc.
 */
export class AiLegacyCore {
  protected _models: AiLegacyModel[] = [];
  protected _activeModel: AiLegacyModel | null = null;
  protected init: AiLegacyCoreInit & {
    logger: typeof logger;
    timeout: number;
    maxInputTokens: number;
  };

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

  /** @purpose Имя первой загруженной модели (для отображения в CLI). */
  get model(): string | undefined {
    return this._models[0]?.name;
  }

  /** @purpose URL первой загруженной модели. */
  get apiUrl(): string | undefined {
    return this._models[0]?.url;
  }

  /** @purpose Лимит токенов на один батч при разбиении diff. */
  get maxInputTokens(): number {
    return this.init.maxInputTokens;
  }

  /**
   * @purpose Разбить разобранный diff на батчи по maxInputTokens для последовательных запросов к LLM.
   * @param parseDiff Массив ParsedDiffFile (обычно parsedCodeDiff из getGitDiffInfo).
   * @returns Массив батчей { tokens, diff, languages }.
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
   * @purpose Вызвать первую доступную модель (ping) и сгенерировать ответ по промпту.
   * @param prompt Текст запроса.
   * @param [systemPrompt] Опциональный system-промпт.
   * @returns Текст ответа модели или пустая строка при ошибке.
   * @sideEffect Network: ping затем generate; Logs: error/warn при сбое модели.
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
   * @purpose Выбрать первую модель, успешно ответившую на ping; кэширует в _activeModel.
   * @returns Кортеж [модель, null] или [null, Error], если ни одна модель не доступна.
   * @sideEffect Network: ping по каждой модели до первого успеха.
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
