// @file: OpenCode evidence reader for bounded session tails, events, status, and diff.
// @spec: AI-SKILLS
// @consumers: SddEvalObserver; delegates storage reads to the existing OpenCode server/session store.

import type { OpencodeClient } from '@opencode-ai/sdk';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readlink, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { createSddEvalOpenCodeClient } from './opencode-client.ts';
import { fingerprintTail } from './observer.ts';
import { SddEvalSessionDirectoryMap } from './session-directory.ts';
import { safeVerifyText } from '../../shared/verify/reporting/report-safety.ts';
import { projectToolObservation } from './tool-observation.ts';
import { withEvalSignal } from './eval-signal.ts';
import { proveRepoFile, readProvenRepoFile } from '../../shared/common/repo-file-identity.ts';
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

/**
 * @purpose Lazily subscribe once and retain per-session events without blocking observer polls on new events.
 * @invariant Sessionless events are ignored; event types remain verbatim. Stream retry count is bounded independently of lifecycle cancellation.
 * @param client Installed SDK client owning the global SSE subscription.
 * @param [options] External cancellation for the shared subscription's lifetime.
 * @returns Nonblocking reader of already observed session events.
 */
function createSddEvalLiveEventReader(
  client: OpencodeClient,
  options: { signal?: AbortSignal } = {}
): SddEvalEventReader {
  const bySession = new Map<string, SddEvalEvent[]>();
  let subscription: Promise<void> | undefined;

  function extractSessionId(raw: unknown): string | undefined {
    const event = raw as { properties?: Record<string, unknown> };
    const props = event.properties;
    if (!props) return undefined;
    const direct = props.sessionID ?? props.sessionId;
    if (typeof direct === 'string') return direct;
    const info = props.info as { id?: unknown } | undefined;
    return typeof info?.id === 'string' ? info.id : undefined;
  }

  async function subscribe(): Promise<void> {
    const result = await client.event.subscribe({ signal: options.signal, sseMaxRetryAttempts: 3 });
    for await (const raw of result.stream) {
      const event = raw as { type?: unknown; properties?: Record<string, unknown> };
      const sessionId = extractSessionId(raw);
      if (!sessionId) continue;
      const entry: SddEvalEvent = {
        type: typeof event.type === 'string' ? event.type : 'unknown',
        sessionId,
        at: Date.now(),
        summary: event.properties ? JSON.stringify(event.properties).slice(0, 200) : undefined,
      };
      const list = bySession.get(sessionId) ?? [];
      list.push(entry);
      bySession.set(sessionId, list);
    }
  }

  return async (sessionId: string): Promise<SddEvalEvent[]> => {
    if (!subscription) {
      // Fire-and-forget: a broken/closed stream must not make readEvents reject forever — the
      // observer keeps polling on whatever was buffered before the failure.
      subscription = subscribe().catch((error) => {
        console.error(
          `[flow-eval] event stream error: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    }
    return bySession.get(sessionId) ?? [];
  };
}

/** @purpose SDK/storage options for production evidence reads and fake-backed tests. */
type SddEvalEvidenceOptions = {
  baseUrl?: string;
  directory?: string;
  client?: OpencodeClient;
  readEvents?: SddEvalEventReader;
  /** @purpose Same registry populated by the runtime on session creation. */
  registry?: SddEvalSessionDirectoryRegistry;
  /** @purpose Stop the default SSE subscription during lifecycle teardown; injected event readers retain their own lifecycle. */
  eventSignal?: AbortSignal;
};

function errorMessage(result: { error?: unknown }): string {
  return result.error ? JSON.stringify(result.error) : 'OpenCode evidence request failed';
}

const DIFF_FILE_CONTENT_LIMIT = 6_000;
const DIFF_TOTAL_LIMIT = 24_000;
const CHILD_SESSION_LIMIT = 8;
const CHILD_TAIL_LIMIT = 2;
const EXECUTION_SESSION_LIMIT = 32;
const EXECUTION_MESSAGE_LIMIT = 2_000;
const UNTRACKED_FILE_LIMIT = 24;
const execFileAsync = promisify(execFile);

/** @purpose Read Git metadata without inherited repository redirection or executable Git extensions. */
function evidenceGit(directory: string, args: string[], overrides: string[] = []) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
  });
  return execFileAsync(
    'git',
    [
      '--no-pager',
      '--no-replace-objects',
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.hooksPath=/dev/null',
      ...overrides,
      ...args,
    ],
    {
      cwd: directory,
      env,
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 256 * 1024,
    }
  );
}

/** @purpose Supplement SDK snapshots only for a proven provisioned fixture; custom directories keep their SDK contract. */
async function fixtureGitEvidence(directory: string, knownBaseline?: string) {
  let root: string;
  let baseline = knownBaseline;
  try {
    root = await realpath(directory);
    const metadata = await lstat(join(root, '.git'));
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      throw new Error('not a plain fixture repository');
    if ((await evidenceGit(root, ['rev-parse', '--show-toplevel'])).stdout.trim() !== root)
      throw new Error('repository escaped the sandbox');
    if (!baseline) {
      const roots = (await evidenceGit(root, ['rev-list', '--max-parents=0', 'HEAD'])).stdout
        .trim()
        .split('\n');
      if (roots.length !== 1 || !/^[0-9a-f]{40}$/.test(roots[0] ?? '')) return undefined;
      const candidate = roots[0]!;
      if (
        (await evidenceGit(root, ['show', '-s', '--format=%s', candidate])).stdout.trim() !==
        'chore: initialize eval fixture'
      )
        return undefined;
      baseline = candidate;
    }
  } catch (cause) {
    if (knownBaseline)
      throw new Error('Git diff evidence lost its bound fixture repository', { cause });
    return undefined;
  }
  try {
    for (const path of ['shallow', 'info/grafts']) {
      const exists = await lstat(join(root, '.git', path)).then(
        () => true,
        (cause: NodeJS.ErrnoException) => {
          if (cause.code === 'ENOENT') return false;
          throw cause;
        }
      );
      if (exists) throw new Error('fixture ancestry is shallow or grafted');
    }
    await evidenceGit(root, ['merge-base', '--is-ancestor', baseline, 'HEAD']);
    // --no-textconv/--no-ext-diff do not disable clean/process filters used when Git hashes worktree files.
    const filterKeys = await evidenceGit(root, [
      'config',
      '--local',
      '--includes',
      '--name-only',
      '-z',
      '--get-regexp',
      '^filter\\..*\\.(clean|smudge|process|required)$',
    ]).then(
      ({ stdout }) => stdout.split('\0').filter(Boolean),
      (cause: { code?: number }) => {
        if (cause.code === 1) return [];
        throw cause;
      }
    );
    const filters = new Set(filterKeys.map((key) => key.slice(7, key.lastIndexOf('.'))));
    const overrides = [...filters].flatMap((name) => [
      '-c',
      `filter.${name}.clean=`,
      '-c',
      `filter.${name}.smudge=`,
      '-c',
      `filter.${name}.process=`,
      '-c',
      `filter.${name}.required=false`,
    ]);
    const { stdout } = await evidenceGit(
      root,
      [
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        '--no-renames',
        '--no-color',
        '--patch',
        baseline,
        '--',
      ],
      overrides
    );
    return {
      baseline,
      evidence: stdout
        ? `GIT_FIXTURE_BASELINE ${baseline} → working tree (including worker commits)\n${stdout}`
        : '',
    };
  } catch (cause) {
    throw new Error('Git diff evidence failed or exceeded its bounded read', { cause });
  }
}

function boundedFileContent(value: string): string {
  if (value.length <= DIFF_FILE_CONTENT_LIMIT) return value;
  return `${value.slice(0, DIFF_FILE_CONTENT_LIMIT)}\n… <truncated>`;
}

async function boundedUntrackedEvidence(directory?: string, strict = false): Promise<string> {
  if (!directory) return '';
  try {
    const root = await realpath(directory);
    const { stdout } = await evidenceGit(root, [
      'ls-files',
      '--others',
      '--exclude-standard',
      '-z',
    ]);
    const allPaths = stdout.split('\0').filter(Boolean);
    const paths = allPaths.slice(0, UNTRACKED_FILE_LIMIT);
    const blocks: string[] = [];
    for (const path of paths) {
      if (isAbsolute(path) || path.split(/[\\/]/).includes('..')) continue;
      const absolute = resolve(root, path);
      const inside = relative(root, absolute);
      if (!inside || inside.startsWith(`..${sep}`) || isAbsolute(inside)) continue;
      const info = await lstat(absolute);
      if (strict && info.isSymbolicLink()) {
        if ((await realpath(dirname(absolute))) !== dirname(absolute))
          throw new Error('untracked parent alias is unsafe');
        blocks.push(`FILE ${path} (untracked symlink)\nAFTER\nlink → ${await readlink(absolute)}`);
        continue;
      }
      if (!info.isFile() || info.isSymbolicLink()) continue;
      let content: string;
      if (strict) {
        if (info.size > 1024 * 1024) throw new Error('untracked file exceeds bounded read');
        const proof = proveRepoFile(root, path);
        if (!proof.ok) throw new Error('untracked file path is unsafe');
        const read = readProvenRepoFile(proof.identity);
        if (!read.ok) throw new Error('untracked file changed identity while reading');
        content = read.content;
      } else content = await readFile(absolute, 'utf8');
      blocks.push(
        [
          `FILE ${path} (untracked)`,
          'BEFORE\n<empty>',
          `AFTER\n${boundedFileContent(content)}`,
        ].join('\n')
      );
    }
    if (allPaths.length > paths.length) blocks.push('… <untracked evidence truncated>');
    return blocks.join('\n\n');
  } catch (cause) {
    if (strict)
      throw new Error('Git diff evidence could not read bounded untracked files', { cause });
    return '';
  }
}

function boundedMessageEntries(
  messages: readonly unknown[],
  sourceSessionId: string,
  sourceLabel?: string,
  captureRoot?: string
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
          state?: {
            status?: unknown;
            input?: Record<string, unknown>;
            time?: { start?: number; end?: number };
            error?: unknown;
            output?: unknown;
            metadata?: { exit?: unknown };
          };
        };
        const input = tool.state?.input;
        // Capture action identity, never authored file bodies, prompts, credentials or env objects.
        const projected =
          input && captureRoot
            ? Object.fromEntries(
                ['command', 'workdir', 'cwd', 'filePath', 'path', 'pattern', 'subagent_type']
                  .filter((key) => typeof input[key] === 'string')
                  .map((key) => [key, safeVerifyText(String(input[key]), captureRoot)])
              )
            : input;
        const summary = projected ? JSON.stringify(projected) : undefined;
        const limit = captureRoot ? 16_384 : 240;
        return {
          callId: typeof tool.callID === 'string' ? tool.callID : 'unknown',
          tool: typeof tool.tool === 'string' ? tool.tool : 'unknown',
          status: typeof tool.state?.status === 'string' ? tool.state.status : 'unknown',
          inputSummary: summary?.slice(0, limit),
          ...(captureRoot && summary && summary.length > limit
            ? { inputSummaryTruncated: true }
            : {}),
          ...(captureRoot
            ? {
                command:
                  typeof projected?.command === 'string'
                    ? projected.command.slice(0, limit)
                    : undefined,
                startedAt: tool.state?.time?.start,
                finishedAt: tool.state?.time?.end,
                observation: projectToolObservation(
                  typeof tool.tool === 'string' ? tool.tool : 'unknown',
                  input,
                  tool.state?.output,
                  captureRoot
                ),
                error:
                  typeof tool.state?.error === 'string'
                    ? safeVerifyText(tool.state.error, captureRoot).slice(0, 1024)
                    : undefined,
                exitCode: Number.isSafeInteger(tool.state?.metadata?.exit)
                  ? Number(tool.state?.metadata?.exit)
                  : undefined,
                diagnostic:
                  (tool.state?.status === 'error' ||
                    (Number.isSafeInteger(tool.state?.metadata?.exit) &&
                      tool.state?.metadata?.exit !== 0)) &&
                  typeof tool.state?.output === 'string'
                    ? safeVerifyText(tool.state.output, captureRoot).slice(0, 8192)
                    : undefined,
              }
            : {}),
        };
      });
    if ((!text && toolCalls.length === 0) || typeof info?.id !== 'string') continue;
    const role = typeof info.role === 'string' ? info.role : 'unknown';
    entries.push({
      messageId: `${sourceSessionId}:${info.id}`,
      sessionId: sourceSessionId,
      role: sourceLabel ? `child:${sourceLabel}:${role}` : role,
      createdAt: typeof info.time?.created === 'number' ? info.time.created : undefined,
      text,
      toolCalls,
      fingerprint: '',
    });
  }
  return entries;
}

/** @purpose One exactly queried SDK session, retained only during the bounded evidence read. */
type ExecutionSessionCapture = {
  /** @purpose Session identity queried under the root's bound directory. */
  id: string;
  /** @purpose Discovery parent, absent for the requested root session. */
  parent?: string;
  /** @purpose Bounded SDK messages; unavailable messages remain empty with an explicit reason. */
  messages: Array<{ info?: Record<string, any>; parts?: unknown[] }>;
};

/** @purpose Partial observations and explicit incompleteness, never a claim from abort acknowledgement. */
type ExecutionSessionTree = {
  /** @purpose Root and recursively discovered sessions within the fixed total session bound. */
  sessions: ExecutionSessionCapture[];
  /** @purpose Missing, ambiguous, escaped or truncated SDK evidence. */
  reasons: string[];
};

/** @purpose Read only bounded evidence through the installed SDK; never mutates the session. */
export class SddEvalOpenCodeEvidenceSource implements SddEvalEvidenceSource {
  /** @purpose Installed SDK client; evidence operations never invoke model prompts. */
  readonly #client: OpencodeClient;
  /** @purpose Optional explicit directory for consumers without a shared session registry. */
  readonly #directory?: string;
  /** @purpose Nonblocking per-session event projection, injected or SDK-backed. */
  readonly #readEvents: SddEvalEventReader;
  /** @purpose Exact runtime-established session-to-sandbox bindings. */
  readonly #registry: SddEvalSessionDirectoryRegistry;
  /** @purpose Preserve a proven fixture baseline across worker commits and later metadata loss. */
  readonly #fixtureBaselines = new Map<string, string>();

  /**
   * @purpose Bind SDK evidence reads and existing event subscription ownership.
   * @param [options] Explicit SDK client, session bindings and lifecycle cancellation.
   */
  constructor(options: SddEvalEvidenceOptions = {}) {
    this.#directory = options.directory;
    this.#registry = options.registry ?? new SddEvalSessionDirectoryMap();
    this.#client =
      options.client ??
      createSddEvalOpenCodeClient({
        baseUrl: options.baseUrl ?? 'http://localhost:4096',
        directory: options.directory,
      });
    // GAP-E-1b: the default used to be a dead `async () => []` — the judge/observer never saw a
    // real permission/session event regardless of what the OpenCode server actually emitted. It now
    // defaults to a live reader bound to THIS instance's own client (production path); an injected
    // `options.readEvents` (fake-backed tests) still takes priority, unchanged.
    this.#readEvents =
      options.readEvents ??
      createSddEvalLiveEventReader(this.#client, { signal: options.eventSignal });
  }

  /**
   * @purpose Fail closed when evidence cannot be tied to one exact sandbox cwd.
   * @param sessionId Exact root session selected by its owning runtime.
   * @returns Absolute bound sandbox directory.
   */
  #sessionDirectory(sessionId: string): string {
    const directory = this.#registry.get(sessionId) ?? this.#directory;
    if (!directory)
      throw new Error(`OpenCode session ${sessionId} has no evidence directory binding`);
    return resolve(directory);
  }

  /**
   * @purpose Share bounded same-directory recursive discovery between usage and quiescence.
   * @param sessionId Exact root session selected by the caller.
   * @param directory Previously resolved root session binding, reused for every query.
   * @param signal Total capture deadline or lifecycle cancellation.
   * @returns Observed sessions and explicit reasons for incomplete capture.
   */
  async #readExecutionSessions(
    sessionId: string,
    directory: string,
    signal: AbortSignal
  ): Promise<ExecutionSessionTree> {
    const pending: Array<{ id: string; parent?: string }> = [{ id: sessionId }];
    const discovered = new Set([sessionId]);
    const sessions: ExecutionSessionCapture[] = [];
    const reasons: string[] = [];
    while (pending.length && !signal.aborted) {
      const next = pending.shift()!;
      const bound = this.#registry.get(next.id);
      if (bound !== undefined && resolve(bound) !== directory) {
        reasons.push(`session binding changed: ${next.id}`);
        continue;
      }
      const captured: ExecutionSessionCapture = { ...next, messages: [] };
      sessions.push(captured);
      try {
        const result = await withEvalSignal(
          () =>
            this.#client.session.messages({
              path: { id: next.id },
              query: { directory, limit: EXECUTION_MESSAGE_LIMIT },
              signal,
            }),
          signal
        );
        if (result.error || !Array.isArray(result.data)) {
          reasons.push(`messages unavailable: ${next.id}`);
        } else {
          if (result.data.length >= EXECUTION_MESSAGE_LIMIT)
            reasons.push(`message limit reached: ${next.id}`);
          const messageIds = new Set<string>();
          for (const raw of result.data.slice(0, EXECUTION_MESSAGE_LIMIT)) {
            const message = raw as ExecutionSessionCapture['messages'][number];
            if (
              !message ||
              typeof message !== 'object' ||
              !message.info ||
              typeof message.info !== 'object' ||
              Array.isArray(message.info) ||
              (message.parts !== undefined &&
                (!Array.isArray(message.parts) ||
                  message.parts.some((part) => !part || typeof part !== 'object')))
            ) {
              reasons.push(`malformed message: ${next.id}`);
              continue;
            }
            const info = message.info;
            if (
              (info.sessionID !== undefined && info.sessionID !== next.id) ||
              (typeof info.path?.cwd === 'string' && resolve(info.path.cwd) !== directory)
            ) {
              reasons.push(`message escaped session binding: ${next.id}`);
              continue;
            }
            if (typeof info.id === 'string') {
              if (messageIds.has(info.id)) {
                reasons.push(`duplicate message: ${next.id}`);
                continue;
              }
              messageIds.add(info.id);
            }
            captured.messages.push(message);
          }
        }
      } catch {
        reasons.push(`messages read failed: ${next.id}`);
      }
      if (signal.aborted) break;
      try {
        const children = await withEvalSignal(
          () =>
            this.#client.session.children({
              path: { id: next.id },
              query: { directory },
              signal,
            }),
          signal
        );
        if (children.error || !Array.isArray(children.data)) {
          reasons.push(`children unavailable: ${next.id}`);
          continue;
        }
        for (const child of children.data) {
          if (
            !child ||
            typeof child.id !== 'string' ||
            !child.id ||
            typeof child.directory !== 'string' ||
            resolve(child.directory) !== directory ||
            (child.parentID !== undefined && child.parentID !== next.id) ||
            (this.#registry.get(child.id) !== undefined &&
              resolve(this.#registry.get(child.id)!) !== directory)
          ) {
            reasons.push(`child escaped or ambiguous binding: ${next.id}`);
            continue;
          }
          if (discovered.has(child.id)) {
            reasons.push(`cycle or repeated session: ${child.id}`);
            continue;
          }
          if (discovered.size >= EXECUTION_SESSION_LIMIT) {
            reasons.push('descendant session limit reached');
            break;
          }
          discovered.add(child.id);
          pending.push({ id: child.id, parent: next.id });
        }
      } catch {
        reasons.push(`children read failed: ${next.id}`);
      }
    }
    if (signal.aborted) reasons.push('session evidence deadline or cancellation');
    return { sessions, reasons: [...new Set(reasons)] };
  }

  /**
   * @purpose Prove two stable terminal SDK session/tool snapshots, not detached process termination.
   * @param sessionId Exact root session already bound to the owned sandbox.
   * @param [options] Bounded observation timing and external cancellation; never a retry policy.
   * @returns Complete SDK quiescence evidence, or explicit reasons without a positive claim.
   */
  async readQuiescence(
    sessionId: string,
    options: {
      timeoutMs?: number;
      stableIntervalMs?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<{ complete: boolean; sessions: number; reasons: string[] }> {
    const timeoutMs = options.timeoutMs ?? 5_000;
    const intervalMs = options.stableIntervalMs ?? 25;
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 30_000 ||
      !Number.isSafeInteger(intervalMs) ||
      intervalMs < 0 ||
      intervalMs > timeoutMs
    )
      return { complete: false, sessions: 0, reasons: ['invalid quiescence bounds'] };
    let directory: string;
    try {
      directory = this.#sessionDirectory(sessionId);
    } catch {
      return { complete: false, sessions: 0, reasons: ['missing session directory binding'] };
    }
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    let previous: string | undefined;
    let sessions = 0;
    let reasons = ['two stable terminal snapshots not observed'];
    while (!signal.aborted) {
      const tree = await this.#readExecutionSessions(sessionId, directory, signal);
      sessions = tree.sessions.length;
      const issues = [...tree.reasons];
      const statuses: Record<string, { type?: string }> = {};
      try {
        const status = await withEvalSignal(
          () => this.#client.session.status({ query: { directory }, signal }),
          signal
        );
        if (
          status.error ||
          !status.data ||
          typeof status.data !== 'object' ||
          Array.isArray(status.data)
        )
          issues.push('session statuses unavailable');
        else Object.assign(statuses, status.data);
      } catch {
        issues.push('session statuses read failed');
      }
      const state = tree.sessions
        .map((captured) => {
          const bound = this.#registry.get(captured.id);
          if (bound !== undefined && resolve(bound) !== directory)
            issues.push(`session binding changed: ${captured.id}`);
          const status = statuses[captured.id]?.type;
          const latest = captured.messages.at(-1)?.info;
          const completed = latest?.role === 'assistant' && Number.isFinite(latest.time?.completed);
          if (status === 'busy' || status === 'retry')
            issues.push(`session is active: ${captured.id}`);
          else if (status !== 'idle' && !(status === undefined && completed))
            issues.push(`session terminal state unknown: ${captured.id}`);
          const metadata = captured.messages.map((message) => {
            const info = message.info;
            if (
              typeof info?.id !== 'string' ||
              !info.id ||
              !['user', 'assistant'].includes(info.role)
            )
              issues.push(`message identity unavailable: ${captured.id}`);
            if (
              info?.role === 'assistant' &&
              (!Number.isFinite(info.time?.created) ||
                !Number.isFinite(info.time?.completed) ||
                info.time.completed < info.time.created)
            )
              issues.push(`assistant message nonterminal: ${captured.id}`);
            if (!Array.isArray(message.parts))
              issues.push(`tool inventory unavailable: ${captured.id}`);
            const tools = (message.parts ?? [])
              .filter((part) => (part as { type?: unknown })?.type === 'tool')
              .map((raw) => {
                const tool = raw as {
                  callID?: string;
                  state?: { status?: string; time?: unknown };
                };
                if (!tool.callID || !['completed', 'error'].includes(tool.state?.status ?? ''))
                  issues.push(`tool nonterminal or unidentified: ${captured.id}`);
                return { id: tool.callID, status: tool.state?.status, time: tool.state?.time };
              });
            return { id: info?.id, role: info?.role, time: info?.time, tools };
          });
          return {
            id: captured.id,
            parent: captured.parent,
            status: status ?? 'completed',
            metadata,
            publicFingerprint: fingerprintTail(
              boundedMessageEntries(captured.messages, captured.id, undefined, directory)
            ),
          };
        })
        .sort((left, right) => left.id.localeCompare(right.id));
      const fingerprint = createHash('sha256').update(JSON.stringify(state)).digest('hex');
      if (!issues.length && tree.sessions.length && previous === fingerprint)
        return { complete: true, sessions, reasons: [] };
      previous = issues.length ? undefined : fingerprint;
      reasons = issues.length
        ? [...new Set(issues)]
        : ['two stable terminal snapshots not observed'];
      try {
        await delay(intervalMs, undefined, { signal });
      } catch {
        break;
      }
    }
    return {
      complete: false,
      sessions,
      reasons: [...new Set([...reasons, 'quiescence deadline or cancellation'])],
    };
  }

  /**
   * @purpose Capture bounded root AND descendant history; never claim a polling tail is complete.
   * @param sessionId Exact runtime-bound root session.
   * @returns Public action history with explicit capture coverage.
   */
  async readTrajectory(sessionId: string): Promise<{
    entries: SddEvalTailEntry[];
    coverage: { complete: boolean; sessions: number; reasons: string[] };
  }> {
    const directory = this.#sessionDirectory(sessionId);
    const pending: Array<{ id: string; parent?: string }> = [{ id: sessionId }];
    const visited = new Set<string>();
    const entries: SddEvalTailEntry[] = [];
    const reasons: string[] = [];
    const messageLimit = 2_000;
    // One total deadline for post-run capture; an unavailable local server must not hang cleanup.
    const signal = AbortSignal.timeout(30_000);
    while (pending.length && visited.size < 32) {
      const { id, parent } = pending.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const messages = await this.#client.session.messages({
        path: { id },
        query: { directory, limit: messageLimit },
        signal,
      });
      if (messages.error || !messages.data) throw new Error(errorMessage(messages));
      if (messages.data.length >= messageLimit) reasons.push(`message limit reached: ${id}`);
      const normalized = boundedMessageEntries(messages.data, id, undefined, directory).map(
        (entry) => ({ ...entry, parentSessionId: parent })
      );
      if (normalized.some((entry) => entry.toolCalls.some((call) => call.inputSummaryTruncated)))
        reasons.push(`action projection truncated: ${id}`);
      entries.push(...normalized);
      const children = await this.#client.session.children({
        path: { id },
        query: { directory },
        signal,
      });
      if (children.error || !children.data) throw new Error(errorMessage(children));
      for (const child of children.data) {
        if (resolve(child.directory) !== directory)
          throw new Error('trajectory child escaped its bound sandbox');
        if (!visited.has(child.id)) pending.push({ id: child.id, parent: id });
      }
    }
    if (pending.length) reasons.push('descendant session limit reached');
    const unique = [...new Map(entries.map((entry) => [entry.messageId, entry])).values()];
    unique.sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0));
    return {
      entries: unique,
      coverage: { complete: reasons.length === 0, sessions: visited.size, reasons },
    };
  }

  /**
   * @purpose Preserve the existing bounded root/direct-child liveness projection.
   * @param sessionId Runtime-bound root session.
   * @param limit Maximum combined tail entries returned.
   * @returns Bounded public entries with liveness fingerprints.
   */
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
        return boundedMessageEntries(messages.data, child.id, child.title ?? child.id, directory);
      })
    );
    const entries = [
      ...boundedMessageEntries(result.data, sessionId, undefined, directory),
      ...childEntries.flat(),
    ].sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0));
    return entries.slice(-Math.max(1, limit)).map((entry) => ({
      ...entry,
      fingerprint: fingerprintTail([entry]),
    }));
  }

  /**
   * @purpose Read accumulated session events without waiting for another event.
   * @param sessionId Runtime-bound root session.
   * @returns Existing per-session event projection.
   */
  async readEvents(sessionId: string): Promise<SddEvalEvent[]> {
    return this.#readEvents(sessionId, this.#sessionDirectory(sessionId));
  }

  /** @purpose Read bounded fixture Git evidence or the existing custom-directory SDK projection.
   * @param sessionId Session bound to the evaluated directory.
   * @returns Baseline-to-worktree evidence; identified fixture read failures throw, never return false-empty. */
  async readDiff(sessionId: string): Promise<string> {
    const directory = this.#sessionDirectory(sessionId);
    const fixture = await fixtureGitEvidence(directory, this.#fixtureBaselines.get(directory));
    if (fixture) this.#fixtureBaselines.set(directory, fixture.baseline);
    let trackedEvidence: string;
    if (fixture) trackedEvidence = fixture.evidence;
    else {
      const result = await this.#client.session.diff({
        path: { id: sessionId },
        query: { directory },
      });
      if (result.error || !result.data) throw new Error(errorMessage(result));
      trackedEvidence = result.data
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
    }
    const untrackedEvidence = await boundedUntrackedEvidence(directory, fixture !== undefined);
    const evidence = [trackedEvidence, untrackedEvidence].filter(Boolean).join('\n\n');
    return evidence.length <= DIFF_TOTAL_LIMIT
      ? evidence
      : `${evidence.slice(0, DIFF_TOTAL_LIMIT)}\n… <diff evidence truncated>`;
  }

  /**
   * @purpose Preserve existing root-session liveness status semantics.
   * @param sessionId Runtime-bound root session.
   * @returns Observed running, idle, completed or unknown state.
   */
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

  // Each OpenCode assistant message carries info.tokens {input,output,reasoning,cache{read,write}}
  // and info.cost; user messages carry none. The execution capture bounds are independent of tails.
  /**
   * @purpose Sum observed recursive usage without claiming missing usage is zero.
   * @param sessionId Parent worker session id.
   * @returns Partial or complete observed totals; incompleteness prevents a comparable duration claim.
   */
  async readUsage(sessionId: string): Promise<SddEvalUsage> {
    const directory = this.#sessionDirectory(sessionId);
    const models = new Set<string>();
    let complete = true;
    let earliest = Infinity;
    let latest = -Infinity;
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
          providerID?: unknown;
          modelID?: unknown;
          time?: { created?: number; completed?: number };
          cost?: unknown;
          tokens?: {
            input?: unknown;
            output?: unknown;
            reasoning?: unknown;
            cache?: { read?: unknown; write?: unknown };
          };
        };
        if (typeof info.time?.created === 'number' && Number.isFinite(info.time.created))
          earliest = Math.min(earliest, info.time.created);
        if (info.role !== 'assistant') {
          if (info.role !== 'user') complete = false;
          continue;
        }
        if (typeof info.providerID === 'string' && typeof info.modelID === 'string')
          models.add(`${info.providerID}/${info.modelID}`);
        else complete = false;
        if (typeof info.time?.completed === 'number' && Number.isFinite(info.time.completed))
          latest = Math.max(latest, info.time.completed);
        else complete = false;
        if (
          typeof info.time?.created !== 'number' ||
          !Number.isFinite(info.time.created) ||
          (typeof info.time.completed === 'number' && info.time.completed < info.time.created)
        )
          complete = false;
        if (!info.tokens) {
          complete = false;
          continue;
        }
        if (
          [
            info.tokens.input,
            info.tokens.output,
            info.tokens.reasoning,
            info.tokens.cache?.read,
            info.tokens.cache?.write,
          ].some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0)
        )
          complete = false;
        if (typeof info.cost !== 'number' || !Number.isFinite(info.cost) || info.cost < 0)
          complete = false;
        const n = (v: unknown): number =>
          typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
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
    const tree = await this.#readExecutionSessions(
      sessionId,
      directory,
      AbortSignal.timeout(30_000)
    );
    if (tree.reasons.length) complete = false;
    const usage = { ...zero };
    for (const session of tree.sessions) {
      add(
        usage,
        session.messages.map((message) => message.info)
      );
    }
    usage.models = [...models].sort();
    usage.complete = complete && models.size > 0;
    usage.sessions = tree.sessions.length;
    if (
      usage.complete &&
      Number.isFinite(earliest) &&
      Number.isFinite(latest) &&
      latest >= earliest
    )
      usage.wallClockMs = latest - earliest;
    return usage;
  }
}
