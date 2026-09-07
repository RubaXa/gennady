// @file: OpenCode evidence reader for bounded session tails, events, status, and diff.
// @consumers: SddEvalObserver; delegates storage reads to the existing OpenCode server/session store.

import type { OpencodeClient } from '@opencode-ai/sdk';
import { execFile } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { createSddEvalOpenCodeClient } from './opencode-client.ts';
import { fingerprintTail } from './observer.ts';
import { SddEvalSessionDirectoryMap } from './session-directory.ts';
import type {
  SddEvalEvent,
  SddEvalEvidenceSource,
  SddEvalObservation,
  SddEvalTailEntry,
  SddEvalSessionDirectoryRegistry,
  SddEvalUsage,
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
const CHILD_SESSION_LIMIT = 8;
const CHILD_TAIL_LIMIT = 2;
const UNTRACKED_FILE_LIMIT = 24;
const execFileAsync = promisify(execFile);

function boundedFileContent(value: string): string {
  if (value.length <= DIFF_FILE_CONTENT_LIMIT) return value;
  return `${value.slice(0, DIFF_FILE_CONTENT_LIMIT)}\n… <truncated>`;
}

async function boundedUntrackedEvidence(directory?: string): Promise<string> {
  if (!directory) return '';
  try {
    const root = await realpath(directory);
    const { stdout } = await execFileAsync(
      'git',
      ['ls-files', '--others', '--exclude-standard', '-z'],
      { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 }
    );
    const paths = stdout.split('\0').filter(Boolean).slice(0, UNTRACKED_FILE_LIMIT);
    const blocks: string[] = [];
    for (const path of paths) {
      if (isAbsolute(path) || path.split(/[\\/]/).includes('..')) continue;
      const absolute = resolve(root, path);
      const inside = relative(root, absolute);
      if (!inside || inside.startsWith(`..${sep}`) || isAbsolute(inside)) continue;
      const info = await lstat(absolute);
      if (!info.isFile() || info.isSymbolicLink()) continue;
      const content = await readFile(absolute, 'utf8');
      blocks.push(
        [
          `FILE ${path} (untracked)`,
          'BEFORE\n<empty>',
          `AFTER\n${boundedFileContent(content)}`,
        ].join('\n')
      );
    }
    return blocks.join('\n\n');
  } catch {
    return '';
  }
}

function boundedMessageEntries(
  messages: readonly unknown[],
  sourceSessionId: string,
  sourceLabel?: string
): SddEvalTailEntry[] {
  const entries: SddEvalTailEntry[] = [];
  for (const rawMessage of messages) {
    const message = rawMessage as {
      info?: { id?: unknown; role?: unknown; time?: { created?: unknown } };
      parts?: unknown[];
    };
    const info = message.info;
    const parts = message.parts ?? [];
    const text = parts
      .map((part) => {
        const candidate = part as { type?: unknown; text?: unknown };
        return candidate.type === 'text' && typeof candidate.text === 'string'
          ? candidate.text
          : '';
      })
      .filter(Boolean)
      .join('\n');
    const toolCalls = parts
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
    if ((!text && toolCalls.length === 0) || typeof info?.id !== 'string') continue;
    const role = typeof info.role === 'string' ? info.role : 'unknown';
    entries.push({
      messageId: `${sourceSessionId}:${info.id}`,
      role: sourceLabel ? `child:${sourceLabel}:${role}` : role,
      createdAt: typeof info.time?.created === 'number' ? info.time.created : undefined,
      text,
      toolCalls,
      fingerprint: '',
    });
  }
  return entries;
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

  /** @purpose Fail closed when evidence cannot be tied to one exact sandbox cwd. */
  #sessionDirectory(sessionId: string): string {
    const directory = this.#registry.get(sessionId) ?? this.#directory;
    if (!directory)
      throw new Error(`OpenCode session ${sessionId} has no evidence directory binding`);
    return resolve(directory);
  }

  async readTail(sessionId: string, limit: number): Promise<SddEvalTailEntry[]> {
    const directory = this.#sessionDirectory(sessionId);
    const result = await this.#client.session.messages({
      path: { id: sessionId },
      query: { directory, limit },
    });
    if (result.error || !result.data) throw new Error(errorMessage(result));
    const children = await this.#client.session.children({
      path: { id: sessionId },
      query: { directory },
    });
    if (children.error || !children.data) throw new Error(errorMessage(children));
    const childEntries = await Promise.all(
      children.data.slice(-CHILD_SESSION_LIMIT).map(async (child) => {
        const messages = await this.#client.session.messages({
          path: { id: child.id },
          query: { directory, limit: CHILD_TAIL_LIMIT },
        });
        if (messages.error || !messages.data) throw new Error(errorMessage(messages));
        return boundedMessageEntries(messages.data, child.id, child.title ?? child.id);
      })
    );
    const entries = [...boundedMessageEntries(result.data, sessionId), ...childEntries.flat()].sort(
      (left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0)
    );
    return entries.slice(-Math.max(1, limit)).map((entry) => ({
      ...entry,
      fingerprint: fingerprintTail([entry]),
    }));
  }

  async readEvents(sessionId: string): Promise<SddEvalEvent[]> {
    return this.#readEvents(sessionId, this.#sessionDirectory(sessionId));
  }

  async readDiff(sessionId: string): Promise<string> {
    const directory = this.#sessionDirectory(sessionId);
    const result = await this.#client.session.diff({
      path: { id: sessionId },
      query: { directory },
    });
    if (result.error || !result.data) throw new Error(errorMessage(result));
    const trackedEvidence = result.data
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
    const untrackedEvidence = await boundedUntrackedEvidence(directory);
    const evidence = [trackedEvidence, untrackedEvidence].filter(Boolean).join('\n\n');
    return evidence.length <= DIFF_TOTAL_LIMIT
      ? evidence
      : `${evidence.slice(0, DIFF_TOTAL_LIMIT)}\n… <diff evidence truncated>`;
  }

  async readStatus(sessionId: string): Promise<SddEvalObservation['status']> {
    const directory = this.#sessionDirectory(sessionId);
    const result = await this.#client.session.status({ query: { directory } });
    if (result.error || !result.data) throw new Error(errorMessage(result));
    const status = result.data[sessionId];
    if (status?.type === 'busy' || status?.type === 'retry') return 'running';
    // OpenCode omits completed sessions from the status map. For both an omitted entry
    // and explicit idle, the completed timestamp on the last assistant message is the
    // durable discriminator.
    const messages = await this.#client.session.messages({
      path: { id: sessionId },
      query: { directory, limit: 1 },
    });
    const latest = messages.data?.at(-1)?.info as
      | { role?: unknown; time?: { completed?: unknown } }
      | undefined;
    if (latest?.role === 'assistant' && typeof latest.time?.completed === 'number')
      return 'completed';
    return status ? 'idle' : 'unknown';
  }

  /**
   * @purpose Sum token and cost usage across the worker session and its children — the whole run.
   * @param sessionId Parent worker session id.
   * @returns Total input/output/reasoning/cache tokens and cost across every assistant message.
   */
  // Each OpenCode assistant message carries info.tokens {input,output,reasoning,cache{read,write}}
  // and info.cost; user messages carry none. Not bounded by the tail/child limits — the true total.
  async readUsage(sessionId: string): Promise<SddEvalUsage> {
    const directory = this.#sessionDirectory(sessionId);
    const zero: SddEvalUsage = {
      messages: 0,
      input: 0,
      output: 0,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
      cost: 0,
    };
    const add = (acc: SddEvalUsage, infos: unknown[]): SddEvalUsage => {
      for (const raw of infos) {
        const info = raw as {
          role?: unknown;
          cost?: unknown;
          tokens?: {
            input?: unknown;
            output?: unknown;
            reasoning?: unknown;
            cache?: { read?: unknown; write?: unknown };
          };
        };
        if (info.role !== 'assistant' || !info.tokens) continue;
        const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
        const input = n(info.tokens.input);
        const output = n(info.tokens.output);
        const reasoning = n(info.tokens.reasoning);
        acc.messages += 1;
        acc.input += input;
        acc.output += output;
        acc.reasoning += reasoning;
        acc.cacheRead += n(info.tokens.cache?.read);
        acc.cacheWrite += n(info.tokens.cache?.write);
        acc.total += input + output + reasoning;
        acc.cost += n(info.cost);
      }
      return acc;
    };
    const sessionIds = [sessionId];
    const children = await this.#client.session.children({
      path: { id: sessionId },
      query: { directory },
    });
    if (!children.error && children.data)
      sessionIds.push(...children.data.map((child) => child.id));
    const usage = { ...zero };
    for (const id of sessionIds) {
      const messages = await this.#client.session.messages({ path: { id }, query: { directory } });
      if (messages.error || !messages.data) continue;
      add(
        usage,
        messages.data.map((message) => (message as { info?: unknown }).info)
      );
    }
    return usage;
  }
}
