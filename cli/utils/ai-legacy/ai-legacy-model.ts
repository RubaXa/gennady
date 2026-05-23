// @file: Конфигурация инициализации AI Legacy Model: имя, URL, опциональный ключ и доп. параметры.
// @consumers: ai-legacy-agent, ai-legacy-core
// @tasks: N/A

import { unguardOrThrow } from '../../../shared/common/unguard.ts';
import { removeThink } from '../../../shared/common/think.ts';

/**
 * @purpose Конфигурация инициализации AI Legacy Model: имя, URL, опциональный ключ и доп. параметры.
 * @consumer AiLegacyModel, AiLegacyCore, GennadyRc
 */
export type AiLegacyModelInit = {
  model: string;
  url: string;
  key?: string;
  extra?: Record<string, unknown>;
};

/**
 * @purpose Legacy AI Model (LLM) — единая точка запросов к API генерации (Ollama/OpenAI-совместимые).
 * @consumer AiLegacyCore, cmd/agent
 * @invariant Error Policy: ошибки сети/таймаута возвращаются как [null, Error]; не бросает.
 * @invariant Retry Policy: нет встроенных ретраев; ответственность на вызывающей стороне.
 */
export class AiLegacyModel {
  /**
   * @purpose Создать экземпляр с дефолтными настройками (Ollama local).
   * @returns Экземпляр с model=llama3.1:8b, url=localhost:11434.
   */
  static getDefault(): AiLegacyModel {
    return new AiLegacyModel({
      model: 'llama3.1:8b',
      url: 'http://127.0.0.1:11434/api/generate',
    });
  }

  protected _init: AiLegacyModelInit;
  protected _pingPromise: Promise<[boolean, null] | [null, Error]> | null = null;

  constructor(init: Partial<AiLegacyModelInit>) {
    this._init = {
      model: init.model ?? 'llama3.1:8b',
      url: init.url ?? 'http://127.0.0.1:11434/api/generate',
      ...init,
    };
  }

  /** @purpose Имя модели (для логов и заголовков). */
  get name(): string {
    return this._init.model;
  }

  /** @purpose URL эндпоинта API. */
  get url(): string {
    return this._init.url;
  }

  /** @purpose API-ключ (если требуется авторизация). */
  get key(): string | undefined {
    return this._init.key;
  }

  /**
   * @purpose Проверить доступность модели коротким запросом.
   * @param [timeout] Таймаут в мс (по умолчанию 10e3).
   * @returns Кортеж [true, null] при успехе, [null, Error] при сбое.
   * @sideEffect Network: один запрос к API; Logs: debug/error.
   */
  async ping(timeout = 10e3): Promise<[boolean, null] | [null, Error]> {
    this._pingPromise ??= (async () => {
      try {
        const startTime = performance.now();
        const answer = await unguardOrThrow(
          this.generate('/no_think Answer only one token "OK" /no_think', { timeout })
        );
        const checked = `${answer}`.toUpperCase().trim() === 'OK';

        console.debug(`[AiLegacyModel#ping] [${this.name}] validation`, {
          answer,
          checked,
          time: performance.now() - startTime,
        });

        return [checked, null];
      } catch (cause) {
        const error = new Error(`[AiLegacyModel#ping] [${this.name}] Ping failed`, { cause });
        console.error(error);
        this._pingPromise = null;
        return [null, error];
      }
    })();

    return this._pingPromise;
  }

  /**
   * @purpose Отправить промпт в LLM и получить ответ (с подстановкой __KEY__ и удалением think-блоков).
   * @param prompt Текст запроса пользователя.
   * @param [init] system, temperature, timeout, replacements для подстановки в промпт/system.
   * @returns Кортеж [текст ответа, null] при успехе, [null, Error] при ошибке сети/парсинга.
   * @sideEffect Network: POST к this.url.
   */
  async generate(
    prompt: string,
    init: {
      system?: string;
      temperature?: number;
      timeout?: number;
      replacements?: Record<string, string>;
    } = {}
  ): Promise<[string, null] | [null, Error]> {
    try {
      const substitute = (text: string): string => {
        const replacements = init.replacements;
        if (!replacements) return text;
        return text.replace(/__([A-Z_]+)__/g, (orig, key: string) => {
          const value =
            replacements[key] ??
            replacements[key.toLowerCase()] ??
            replacements[key.toUpperCase()] ??
            null;
          return value == null ? orig : value;
        });
      };

      const url = this.url;
      const params = url.includes('completions')
        ? {
            temperature: init.temperature ?? 0.2,
            messages: [
              ...(init.system
                ? [{ role: 'system' as const, content: substitute(init.system) }]
                : []),
              { role: 'user' as const, content: substitute(prompt) },
            ],
          }
        : {
            system: substitute(init.system ?? ''),
            prompt: substitute(prompt),
            temperature: init.temperature,
          };

      const data = await unguardOrThrow(this._fetchAsJson(params, init.timeout));

      if (data && typeof data === 'object' && 'response' in data) {
        return [removeThink((data as { response?: string }).response ?? ''), null];
      }

      if (
        data &&
        typeof data === 'object' &&
        'choices' in data &&
        Array.isArray((data as { choices?: unknown[] }).choices) &&
        (data as { choices: { message?: { content?: string } }[] }).choices.length > 0
      ) {
        const content = (data as { choices: { message?: { content?: string } }[] }).choices[0]
          ?.message?.content;
        return [removeThink(content ?? ''), null];
      }

      throw new TypeError(
        `[AI_LEGACY_MODEL_ERROR_GENERATE_DATA] [${this.name}] Response structure unexpected`,
        { cause: data }
      );
    } catch (cause) {
      return [
        null,
        new Error(`[AI_LEGACY_MODEL_ERROR_GENERATE] [${this.name}] ${cause}`, { cause }),
      ];
    }
  }

  /**
   * @purpose Выполнить POST-запрос к API и вернуть JSON или ошибку.
   * @param params Тело запроса (Ollama- или OpenAI-формат).
   * @param [timeout] Таймаут в мс.
   * @returns Кортеж [parsed JSON, null] или [null, Error].
   * @sideEffect Network: fetch с AbortController.
   */
  protected async _fetchAsJson(
    params: unknown,
    timeout = 120e3
  ): Promise<[unknown, null] | [null, Error]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(new Error('AI_LEGACY_MODEL_ERROR_FETCH_TIMEOUT')),
      timeout
    );

    try {
      const req = await fetch(this.url, {
        signal: controller.signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.key ? `Bearer ${this.key}` : undefined,
        } as Record<string, string>,
        body: JSON.stringify({
          ...(params as object),
          model: this.name,
          stream: false,
          ...(this._init.extra ?? {}),
        }),
      });

      if (!req.ok) {
        let errorBody = '';
        try {
          errorBody = await req.text();
        } catch {
          /* ignore */
        }
        return [
          null,
          new Error(
            `[AI_LEGACY_MODEL_ERROR_FETCH_NOT_OK] [${this.name}] Fetch failed with status "${req.status}"`,
            { cause: errorBody }
          ),
        ];
      }

      return [await req.json(), null];
    } catch (cause) {
      return [
        null,
        new Error(`[AI_LEGACY_MODEL_ERROR_FETCH] [${this.name}] Fetch failed "${cause}"`, {
          cause,
        }),
      ];
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
