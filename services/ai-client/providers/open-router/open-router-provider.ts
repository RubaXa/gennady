// @file: open-router-provider
// @consumers: ai-client, telegram-demo-music-helper
// @tasks: N/A

import { createOpenAI, type OpenAIProvider, type OpenAIProviderSettings } from '@ai-sdk/openai';
import { generateText } from 'ai';
import type { AIModel } from '../ai-model.type.ts';
import type { OpenRouterModel } from './open-router-model.type.ts';

/**
 * @purpose Provider adapter for Open Router API, wrapping OpenAI-compatible SDK.
 */
export class OpenRouterProvider {
  /** @purpose OpenAI provider settings */
  protected _settings: OpenAIProviderSettings;
  /** @purpose OpenAI provider instance */
  protected _provider: OpenAIProvider;

  /**
   * @purpose Initialize the provider with OpenAI-compatible settings.
   * @param settings Provider configuration settings.
   */
  constructor(settings: OpenAIProviderSettings) {
    this._settings = settings;
    this._provider = createOpenAI(settings);
  }

  /**
   * @purpose Fetch available AI models from the Open Router API.
   * @returns Array of available AI models.
   */
  async getModels(): Promise<AIModel[]> {
    const res = await fetch(`${this._settings.baseURL}/models`, {
      headers: {
        Authorization: `Bearer ${this._settings.apiKey}`,
      },
    });

    const body = (await res.json()) as { data: OpenRouterModel[] };
    return body.data;
  }

  /**
   * @purpose Generate text completion using a specified model.
   * @param model Model identifier string.
   * @param prompt Text prompt to generate from.
   * @returns Generated text output.
   */
  async generateText(model: string, prompt: string): Promise<string> {
    const { output } = await generateText({
      model: this._provider.chat(model),
      prompt,
    });

    return output;
  }
}
