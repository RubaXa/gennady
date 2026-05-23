// @file: open-router-provider
// @consumers: ai-client, telegram-demo-music-helper
// @tasks: N/A

import { createOpenAI, type OpenAIProvider, type OpenAIProviderSettings } from '@ai-sdk/openai';
import { generateText } from 'ai';
import type { AIModel } from '../ai-model.type.ts';
import type { OpenRouterModel } from './open-router-model.type.ts';

export class OpenRouterProvider {
  protected _settings: OpenAIProviderSettings;
  protected _provider: OpenAIProvider;

  constructor(settings: OpenAIProviderSettings) {
    this._settings = settings;
    this._provider = createOpenAI(settings);
  }

  async getModels(): Promise<AIModel[]> {
    const res = await fetch(`${this._settings.baseURL}/models`, {
      headers: {
        Authorization: `Bearer ${this._settings.apiKey}`,
      },
    });

    const body = (await res.json()) as { data: OpenRouterModel[] };
    return body.data;
  }

  async generateText(model: string, prompt: string): Promise<string> {
    const { output } = await generateText({
      model: this._provider.chat(model),
      prompt,
    });

    return output;
  }
}
