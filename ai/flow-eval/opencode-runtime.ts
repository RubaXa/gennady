// @file: OpenCode SDK runtime for the external SDD evaluator.
// @consumers: SddEvalRunner, SddEvalJudge; no subprocess or codex binary is used.

import type { OpencodeClient } from '@opencode-ai/sdk';
import { createSddEvalOpenCodeClient } from './opencode-client.ts';
import { SddEvalSessionDirectoryMap } from './session-directory.ts';
import type { OpenCodeModel, SddEvalRuntime, SddEvalSessionDirectoryRegistry } from './types.ts';

/** @purpose Options for connecting the harness to an already running OpenCode server. */
type SddEvalOpenCodeRuntimeOptions = {
  baseUrl?: string;
  directory?: string;
  /** @purpose Inject the SDK client in tests; production defaults to createOpencodeClient. */
  client?: OpencodeClient;
  /** @purpose Shared binding consumed by evidence readers and abort calls. */
  registry?: SddEvalSessionDirectoryRegistry;
};

/** @purpose Parse the CLI-friendly `provider/model` spelling used by OpenCode. */
export function parseOpenCodeModel(value: string, defaultProvider = 'openai'): OpenCodeModel {
  const separator = value.indexOf('/');
  if (separator < 1) return { providerID: defaultProvider, modelID: value };
  return { providerID: value.slice(0, separator), modelID: value.slice(separator + 1) };
}

function splitModel(model: OpenCodeModel): { providerID: string; modelID: string } {
  if (!model.providerID.trim() || !model.modelID.trim()) {
    throw new Error('OpenCode providerID/modelID must be non-empty');
  }
  return model;
}

function responseText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const parts = (value as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const text = (part as { text?: unknown }).text;
      return typeof text === 'string' ? text : '';
    })
    .filter(Boolean)
    .join('\n');
}

/** @purpose Adapter using only @opencode-ai/sdk against an existing OpenCode HTTP server. */
export class SddEvalOpenCodeRuntime implements SddEvalRuntime {
  readonly #client: OpencodeClient;
  readonly #directory?: string;
  readonly #registry: SddEvalSessionDirectoryRegistry;

  constructor(options: SddEvalOpenCodeRuntimeOptions = {}) {
    this.#directory = options.directory;
    this.#registry = options.registry ?? new SddEvalSessionDirectoryMap();
    this.#client =
      options.client ??
      createSddEvalOpenCodeClient({
        baseUrl: options.baseUrl ?? 'http://localhost:4096',
        directory: options.directory,
      });
  }

  async createSession(input: { title: string; directory: string }): Promise<{ id: string }> {
    const result = await this.#client.session.create({
      body: { title: input.title },
      query: { directory: input.directory || this.#directory },
    });
    if (result.error || !result.data) {
      throw new Error(`OpenCode session creation failed: ${JSON.stringify(result.error)}`);
    }
    this.#registry.set(result.data.id, input.directory || this.#directory || '');
    return { id: result.data.id };
  }

  async prompt(input: {
    sessionId: string;
    text: string;
    model: OpenCodeModel;
    agent?: string;
    system?: string;
  }): Promise<void> {
    const model = splitModel(input.model);
    const result = await this.#client.session.promptAsync({
      path: { id: input.sessionId },
      body: {
        parts: [{ type: 'text', text: input.text }],
        model,
        agent: input.agent,
        system: input.system,
      },
    });
    if (result.error)
      throw new Error(`OpenCode worker prompt failed: ${JSON.stringify(result.error)}`);
  }

  async abort(sessionId: string): Promise<void> {
    const result = await this.#client.session.abort({
      path: { id: sessionId },
      query: { directory: this.#registry.get(sessionId) ?? this.#directory },
    });
    if (result.error)
      throw new Error(`OpenCode worker abort failed: ${JSON.stringify(result.error)}`);
  }

  async judge(input: { directory: string; prompt: string; model: OpenCodeModel }): Promise<string> {
    const session = await this.createSession({
      title: 'sdd-eval-judge',
      directory: input.directory,
    });
    const model = splitModel(input.model);
    const result = await this.#client.session.prompt({
      path: { id: session.id },
      body: { parts: [{ type: 'text', text: input.prompt }], model },
    });
    if (result.error)
      throw new Error(`OpenCode judge prompt failed: ${JSON.stringify(result.error)}`);
    return responseText(result.data);
  }
}
