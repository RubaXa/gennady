// @file: OpenCode evidence reader for bounded session tails, events, status, and diff.
// @consumers: SddEvalObserver; delegates storage reads to the existing OpenCode server/session store.

import type { OpencodeClient } from '@opencode-ai/sdk';
import { createSddEvalOpenCodeClient } from './opencode-client.ts';
import { fingerprintTail } from './observer.ts';
import { SddEvalSessionDirectoryMap } from './session-directory.ts';
import type {
  SddEvalEvent,
  SddEvalEvidenceSource,
  SddEvalObservation,
  SddEvalTailEntry,
  SddEvalSessionDirectoryRegistry,
} from './types.ts';

/** @purpose Injectable event reader because OpenCode's global event endpoint is a long-lived SSE stream. */
export type SddEvalEventReader = (sessionId: string, directory?: string) => Promise<SddEvalEvent[]>;

/** @purpose SDK/storage options for production evidence reads and fake-backed tests. */
type SddEvalEvidenceOptions = {
  baseUrl?: string;
  directory?: string;
  client?: OpencodeClient;
  readEvents?: SddEvalEventReader;
  /** @purpose Same registry populated by the runtime on session creation. */
  registry?: SddEvalSessionDirectoryRegistry;
};

function errorMessage(result: { error?: unknown }): string {
  return result.error ? JSON.stringify(result.error) : 'OpenCode evidence request failed';
}

const DIFF_FILE_CONTENT_LIMIT = 6_000;
const DIFF_TOTAL_LIMIT = 24_000;

function boundedFileContent(value: string): string {
  if (value.length <= DIFF_FILE_CONTENT_LIMIT) return value;
  return `${value.slice(0, DIFF_FILE_CONTENT_LIMIT)}\n… <truncated>`;
}

/** @purpose Read only bounded evidence through the installed SDK; never mutates the session. */
export class SddEvalOpenCodeEvidenceSource implements SddEvalEvidenceSource {
  readonly #client: OpencodeClient;
  readonly #directory?: string;
  readonly #readEvents: SddEvalEventReader;
  readonly #registry: SddEvalSessionDirectoryRegistry;

  constructor(options: SddEvalEvidenceOptions = {}) {
    this.#directory = options.directory;
    this.#registry = options.registry ?? new SddEvalSessionDirectoryMap();
    this.#client =
      options.client ??
      createSddEvalOpenCodeClient({
        baseUrl: options.baseUrl ?? 'http://localhost:4096',
        directory: options.directory,
      });
    this.#readEvents = options.readEvents ?? (async () => []);
  }

  async readTail(sessionId: string, limit: number): Promise<SddEvalTailEntry[]> {
    const directory = this.#registry.get(sessionId) ?? this.#directory;
    const result = await this.#client.session.messages({
      path: { id: sessionId },
      query: { directory, limit },
    });
    if (result.error || !result.data) throw new Error(errorMessage(result));
    const entries: SddEvalTailEntry[] = [];
    for (const message of result.data) {
      const info = message.info as { id?: unknown; role?: unknown; time?: { created?: unknown } };
      const text = message.parts
        .map((part) => {
          const candidate = part as { type?: unknown; text?: unknown };
          return candidate.type === 'text' && typeof candidate.text === 'string'
            ? candidate.text
            : '';
        })
        .filter(Boolean)
        .join('\n');
      const toolCalls = message.parts
        .filter((part) => (part as { type?: unknown }).type === 'tool')
        .map((part) => {
          const tool = part as {
            callID?: unknown;
            tool?: unknown;
            state?: { status?: unknown; input?: Record<string, unknown> };
          };
          const input = tool.state?.input;
          return {
            callId: typeof tool.callID === 'string' ? tool.callID : 'unknown',
            tool: typeof tool.tool === 'string' ? tool.tool : 'unknown',
            status: typeof tool.state?.status === 'string' ? tool.state.status : 'unknown',
            inputSummary: input ? JSON.stringify(input).slice(0, 240) : undefined,
          };
        });
      if ((!text && toolCalls.length === 0) || typeof info.id !== 'string') continue;
      entries.push({
        messageId: info.id,
        role: typeof info.role === 'string' ? info.role : 'unknown',
        createdAt: typeof info.time?.created === 'number' ? info.time.created : undefined,
        text,
        toolCalls,
        fingerprint: '',
      });
    }
    return entries.slice(-Math.max(1, limit)).map((entry) => ({
      ...entry,
      fingerprint: fingerprintTail([entry]),
    }));
  }

  async readEvents(sessionId: string): Promise<SddEvalEvent[]> {
    return this.#readEvents(sessionId, this.#registry.get(sessionId) ?? this.#directory);
  }

  async readDiff(sessionId: string): Promise<string> {
    const directory = this.#registry.get(sessionId) ?? this.#directory;
    const result = await this.#client.session.diff({
      path: { id: sessionId },
      query: { directory },
    });
    if (result.error || !result.data) throw new Error(errorMessage(result));
    const evidence = result.data
      .map((diff) => {
        const before = boundedFileContent(diff.before);
        const after = boundedFileContent(diff.after);
        return [
          `FILE ${diff.file} (+${diff.additions}/-${diff.deletions})`,
          before ? `BEFORE\n${before}` : 'BEFORE\n<empty>',
          after ? `AFTER\n${after}` : 'AFTER\n<empty>',
        ].join('\n');
      })
      .join('\n\n');
    return evidence.length <= DIFF_TOTAL_LIMIT
      ? evidence
      : `${evidence.slice(0, DIFF_TOTAL_LIMIT)}\n… <diff evidence truncated>`;
  }

  async readStatus(sessionId: string): Promise<SddEvalObservation['status']> {
    const directory = this.#registry.get(sessionId) ?? this.#directory;
    const result = await this.#client.session.status({ query: { directory } });
    if (result.error || !result.data) throw new Error(errorMessage(result));
    const status = result.data[sessionId];
    if (!status) return 'unknown';
    if (status.type === 'busy' || status.type === 'retry') return 'running';
    // OpenCode exposes an idle status for both an idle worker and a finished turn. The
    // completed timestamp on the assistant message is the durable discriminator.
    const messages = await this.#client.session.messages({
      path: { id: sessionId },
      query: { directory, limit: 1 },
    });
    const latest = messages.data?.at(-1)?.info as
      | { role?: unknown; time?: { completed?: unknown } }
      | undefined;
    if (latest?.role === 'assistant' && typeof latest.time?.completed === 'number')
      return 'completed';
    return 'idle';
  }
}
