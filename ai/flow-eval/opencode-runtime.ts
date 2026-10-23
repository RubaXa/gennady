// @file: OpenCode SDK runtime for the external SDD evaluator.
// @spec: AI-SKILLS
// @consumers: SddEvalRunner, SddEvalJudge; no subprocess or codex binary is used.

import type { OpencodeClient } from '@opencode-ai/sdk';
import { createSddEvalOpenCodeClient } from './opencode-client.ts';
import { SddEvalSessionDirectoryMap } from './session-directory.ts';
import type { OpenCodeModel, SddEvalRuntime, SddEvalSessionDirectoryRegistry } from './types.ts';
import { resolve } from 'node:path';
import { withEvalSignal } from './eval-signal.ts';

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
      if ((part as { type?: unknown }).type !== 'text') return '';
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
    this.#directory = options.directory ? resolve(options.directory) : undefined;
    this.#registry = options.registry ?? new SddEvalSessionDirectoryMap();
    this.#client =
      options.client ??
      createSddEvalOpenCodeClient({
        baseUrl: options.baseUrl ?? 'http://localhost:4096',
        directory: options.directory,
      });
  }

  /** @purpose Resolve one mandatory session cwd and reject cross-sandbox requests. */
  #sessionDirectory(sessionId: string, requestedDirectory?: string): string {
    const bound = this.#registry.get(sessionId) ?? this.#directory;
    if (!bound) throw new Error(`OpenCode session ${sessionId} has no working directory binding`);
    const directory = requestedDirectory ? resolve(requestedDirectory) : bound;
    if (directory !== bound) {
      throw new Error(
        `OpenCode session ${sessionId} is bound to ${bound}, not requested directory ${directory}`
      );
    }
    return directory;
  }

  async createSession(input: {
    title: string;
    directory: string;
    signal?: AbortSignal;
    onCreated?: (sessionId: string) => void;
  }): Promise<{ id: string }> {
    const requestedDirectory = input.directory || this.#directory;
    if (!requestedDirectory) {
      throw new Error('OpenCode session creation requires a working directory');
    }
    const directory = resolve(requestedDirectory);
    const result = await this.#client.session.create({
      body: { title: input.title },
      query: { directory },
      signal: input.signal,
    });
    if (result.error || !result.data) {
      throw new Error(`OpenCode session creation failed: ${JSON.stringify(result.error)}`);
    }
    this.#registry.set(result.data.id, directory);
    input.onCreated?.(result.data.id);
    return { id: result.data.id };
  }

  async prompt(input: {
    sessionId: string;
    directory: string;
    text: string;
    model: OpenCodeModel;
    agent?: string;
    system?: string;
  }): Promise<void> {
    const model = splitModel(input.model);
    const directory = this.#sessionDirectory(input.sessionId, input.directory);
    const result = await this.#client.session.promptAsync({
      path: { id: input.sessionId },
      query: { directory },
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
    const directory = this.#sessionDirectory(sessionId);
    const deadline = AbortSignal.timeout(10_000);
    const result = await withEvalSignal(
      () =>
        this.#client.session.abort({
          path: { id: sessionId },
          query: { directory },
          signal: deadline,
        }),
      deadline
    );
    if (result.error)
      throw new Error(`OpenCode worker abort failed: ${JSON.stringify(result.error)}`);
  }

  async judge(input: {
    directory: string;
    prompt: string;
    model: OpenCodeModel;
    signal?: AbortSignal;
    sessionId?: string;
    readOnly?: boolean;
    onSession?: (sessionId: string) => void;
  }): Promise<string> {
    input.signal?.throwIfAborted();
    let creationCancellation: Promise<void> | undefined;
    let session: { id: string };
    try {
      session = input.sessionId
        ? { id: input.sessionId }
        : await withEvalSignal(
            () =>
              this.createSession({
                title: 'sdd-eval-judge',
                directory: input.directory,
                signal: input.signal,
                onCreated: (id) => {
                  input.onSession?.(id);
                  if (input.signal?.aborted) creationCancellation ??= this.abort(id);
                  // Late creation after an already returned timeout still gets a cleanup attempt;
                  // its rejection is observed even when no caller can await that late promise.
                  void creationCancellation?.catch(() => undefined);
                },
              }),
            input.signal
          );
    } catch (cause) {
      // A known session created concurrently with cancellation is owned and must actually stop.
      await creationCancellation;
      throw cause;
    }
    const directory = this.#sessionDirectory(session.id, input.directory);
    if (input.sessionId) input.onSession?.(session.id);
    let tools: Record<string, boolean> | undefined;
    if (input.readOnly) {
      const ids = await withEvalSignal(
        () => this.#client.tool.ids({ query: { directory }, signal: input.signal }),
        input.signal
      );
      if (
        ids.error ||
        !Array.isArray(ids.data) ||
        !ids.data.length ||
        ids.data.some((id) => typeof id !== 'string')
      )
        throw new Error('Read-only model call requires a verified tool inventory');
      tools = Object.fromEntries(['*', ...ids.data].map((id) => [id, false]));
    }
    const model = splitModel(input.model);
    let cancellation: Promise<void> | undefined;
    let onAbort!: () => void;
    const stopped = new Promise<never>((_resolve, reject) => {
      onAbort = () => {
        cancellation ??= this.abort(session.id);
        void cancellation.then(() => reject(input.signal?.reason), reject);
      };
      input.signal?.addEventListener('abort', onAbort, { once: true });
    });
    try {
      if (input.signal?.aborted) {
        onAbort();
        await stopped;
      }
      const result = await Promise.race([
        this.#client.session.prompt({
          path: { id: session.id },
          query: { directory: this.#sessionDirectory(session.id, input.directory) },
          body: {
            parts: [{ type: 'text', text: input.prompt }],
            model,
            ...(tools
              ? {
                  tools,
                  system:
                    'You are a text-only read-only reviewer. Use only the evidence in the user message. You have no tools and must not inspect the filesystem or emit tool-call markup. Return the requested public review text, not implementation work.',
                }
              : {}),
          },
          signal: input.signal,
        }),
        stopped,
      ]);
      input.signal?.throwIfAborted();
      if (result.error)
        throw new Error(`OpenCode judge prompt failed: ${JSON.stringify(result.error)}`);
      return responseText(result.data);
    } finally {
      input.signal?.removeEventListener('abort', onAbort);
      // invariant: local prompt cancellation is not proof the owned server session stopped.
      await cancellation;
    }
  }
}
