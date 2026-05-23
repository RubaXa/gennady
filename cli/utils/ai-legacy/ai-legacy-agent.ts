// @file: Legacy AI Agent — обёртка над AiLegacyModel для получения структурированного JSON-ответа.
// @consumers: N/A
// @tasks: N/A

import { unguardOrThrow } from '../../../shared/common/unguard.ts';
import { AiLegacyModel } from './ai-legacy-model.ts';

/**
 * @purpose Legacy AI Agent — обёртка над AiLegacyModel для получения структурированного JSON-ответа.
 * @consumer cmd/agent, тесты
 * @invariant brain должен быть экземпляром AiLegacyModel; иначе конструктор бросает.
 */
export class AiLegacyAgent {
  protected _brain: AiLegacyModel;

  /**
   * @purpose Создать агента с заданной моделью.
   * @param brain Экземпляр AiLegacyModel для запросов.
   * @throws Error если brain не instanceof AiLegacyModel.
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
   * @purpose Отправить промпт и распарсить ответ как JSON (с обрезкой markdown-блоков кода).
   * @param prompt Текст запроса (непустая строка).
   * @returns Кортеж [parsed object, null] или [null, Error] при пустом промпте/ошибке парсинга.
   * @throws Error при пустом или не-строковом prompt (до запроса).
   * @sideEffect Network: вызов this._brain.generate.
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
