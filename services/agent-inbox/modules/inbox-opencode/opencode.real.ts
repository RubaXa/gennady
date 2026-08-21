// @file: OpenCodeAgentAdapter — production AgentRuntimePort implementation via @opencode-ai/sdk.
// @consumers: SessionPool (production), DI container, inbox-roles
// @tasks: TSK-112, TSK-160, TSK-175

import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk';
import { Agent as UndiciAgent } from 'undici';
import type { TextPart } from '@opencode-ai/sdk';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { logger } from '#logger';
import {
  AgentRuntimePort,
  type SessionHandle,
  type CreateSessionOpts,
  type PromptOpts,
  type SessionStatus,
  type ToolCall,
  type ToolCallStat,
  type ToolTraceEntry,
  type ToolGate,
  type OpenCodeMessage,
} from './opencode.port.ts';
import { composeOk, composeError, type OpenCodeCallResult } from './errors.ts';
import { parseOpenCodeModel } from './model-selection.ts';

/**
 * @purpose Summarize a tool call's input to one short line — command, path, or pattern — for the
 *   trace.
 * @param tool Tool name.
 * @param input Raw tool input object, if any.
 * @returns One-line summary, truncated to 300 chars, newlines collapsed.
 */
function _summarizeToolInput(tool: string, input: Record<string, unknown> | undefined): string {
  if (!input) return '';
  const pick = (k: string): string => (typeof input[k] === 'string' ? (input[k] as string) : '');
  let raw: string;
  if (tool === 'bash') raw = pick('command') || pick('cmd');
  else if (tool === 'read' || tool === 'write' || tool === 'edit') raw = pick('filePath');
  else if (tool === 'glob' || tool === 'grep')
    raw = [pick('pattern'), pick('path')].filter(Boolean).join(' @ ');
  else raw = JSON.stringify(input);
  return raw.replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** @purpose Configuration for the OpenCodeReal adapter. */
export type OpenCodeRealOpts = {
  /** @purpose Base URL of the running opencode server (default: http://localhost:4096). */
  baseUrl?: string;
  /** @purpose Default working directory for all sessions (optional — can be set per-session). */
  directory?: string;
  /** @purpose Prompt timeout in milliseconds (default: 300_000 = 5min). */
  timeout?: number;
  /**
   * @purpose Dispatcher for the SDK's fetch calls — disable timeouts, or undici kills a long
   *   agentic turn with a bare "fetch failed" at 300s.
   * @invariant Absent → SDK's default fetch, unmodified — required so tests intercepting the
   *   network via `setGlobalDispatcher`/`MockAgent` are not silently bypassed.
   */
  dispatcher?: UndiciAgent;
};

/**
 * @purpose Production adapter that delegates all AgentRuntimePort operations to a real
 *          opencode server through @opencode-ai/sdk (HTTP client mode).
 * @implements {AgentRuntimePort} in ./opencode.port.ts
 * @invariant Connects to an existing `opencode serve` instance.
 * @invariant When format is requested: embeds JSON schema in system prompt,
 *           extracts JSON from response text as fallback (SDK v1.x lacks
 *           native json_schema support).
 * @consumer DI container (replaces OpenCodeMock in production)
 */
export class OpenCodeAgentAdapter extends AgentRuntimePort {
  /** @purpose Base URL of the opencode server. */
  protected _baseUrl: string;
  /** @purpose Default directory for session binding. */
  protected _directory: string | undefined;
  /** @purpose Prompt timeout. */
  protected _timeout: number;
  /** @purpose Lazily initialized SDK client — created on first use. */
  protected _client: OpencodeClient | null;
  /** @purpose Optional long-timeout dispatcher (see `OpenCodeRealOpts.dispatcher`) — undefined in tests. */
  protected _dispatcher: UndiciAgent | undefined;
  /** @purpose Track session directory mappings (sid → directory) for per-session binding. */
  protected _sessionDirs: Map<string, string>;
  /** @purpose Track pending schemas per session for JSON extraction validation. */
  protected _pendingSchemas: Map<string, Record<string, unknown>>;
  /** @purpose Track per-session tools gate (sid → CreateSessionOpts.tools) | @invariant SDK has no session-level tools flag — re-applied on every prompt() call */
  protected _sessionTools: Map<string, boolean | ToolGate>;
  /** @purpose Track per-session default model (sid → CreateSessionOpts.model) | @invariant SDK has no session-level model field — re-applied on every prompt() call unless PromptOpts.model overrides it */
  protected _sessionModels: Map<string, string>;
  /** @purpose Track parked sessions — sid → parkedAt ISO timestamp | @invariant Only sessions marked via park() appear here */
  protected _parkedSessions: Map<string, string>;
  /** @purpose Directory for tool-trace JSONL output | @invariant Default: 'telemetry' relative to session directory */
  protected _toolTraceDir: string;

  /**
   * @purpose Create an OpenCodeReal adapter bound to a running opencode server.
   * @param [opts] Connection options — baseUrl, default directory, timeout.
   */
  constructor(opts: OpenCodeRealOpts = {}) {
    super();
    this._baseUrl = opts.baseUrl ?? 'http://localhost:4096';
    this._directory = opts.directory;
    this._timeout = opts.timeout ?? 300_000; // 5-minute default
    this._client = null;
    this._sessionDirs = new Map();
    this._pendingSchemas = new Map();
    this._sessionTools = new Map();
    this._sessionModels = new Map();
    this._parkedSessions = new Map();
    this._toolTraceDir = 'telemetry';
    this._dispatcher = opts.dispatcher;
    logger.debug('[OpenCodeReal#ctor] [idle → created]', { baseUrl: this._baseUrl });
  }

  /**
   * @purpose Lazily initialise the SDK client on first use.
   * @returns The SDK client instance.
   * @sideEffect Creates a new OpencodeClient if not already created.
   */
  protected _ensureClient(): OpencodeClient {
    if (!this._client) {
      this._client = createOpencodeClient({
        baseUrl: this._baseUrl,
        directory: this._directory,
        // Only override fetch when a dispatcher was explicitly provided (production) — the SDK's
        // own `req.timeout = false` fallback does not reach undici's actual per-connection
        // timeout, so long agentic turns die at ~300s without this (see `dispatcher` invariant on
        // `OpenCodeRealOpts`). Absent `_dispatcher` → SDK default fetch, unmodified — tests that
        // intercept the network via `setGlobalDispatcher`/`MockAgent` depend on this.
        ...(this._dispatcher
          ? { fetch: (req: Request) => fetch(req, { dispatcher: this._dispatcher } as RequestInit) }
          : {}),
      });
      logger.debug('[OpenCodeReal#_ensureClient] [idle → created]', {
        baseUrl: this._baseUrl,
        directory: this._directory,
      });
    }
    return this._client;
  }

  // ── createSession ──────────────────────────────────────────────

  /**
   * @param opts Session title and directory.
   * @throws Wraps network errors as OpenCodeCallResult-style errors.
   * @returns Session handle with server-assigned id.
   * @see {AgentRuntimePort#createSession} in ./opencode.port.ts
   */
  async createSession(opts: CreateSessionOpts): Promise<SessionHandle> {
    const client = this._ensureClient();
    const directory = opts.directory || this._directory;
    const modelLabel = opts.model ?? 'server-default';

    // #region START_CREATE_SESSION — POST /session with title and directory
    try {
      logger.debug('[OpenCodeReal#createSession] [idle → creating]', {
        title: opts.title,
        directory,
        model: modelLabel,
      });

      const result = await client.session.create({
        body: { title: opts.title },
        query: directory ? { directory } : undefined,
      });

      if (result.error) {
        // Non-2xx without JSON body (e.g. 401 auth) carries no message — surface status + raw payload.
        const rawMessage = (result.error as unknown as { message?: unknown })?.message;
        const status = result.response?.status;
        let rawError: string;
        try {
          rawError = JSON.stringify(result.error) ?? String(result.error);
        } catch {
          rawError = String(result.error);
        }
        const errMsg = rawMessage
          ? String(rawMessage)
          : `Session creation failed${status !== undefined ? ` (HTTP ${status})` : ''}`;
        logger.warn('[OpenCodeReal#createSession] [creating → server_failed]', {
          title: opts.title,
          model: modelLabel,
          status,
          error: errMsg,
          rawError,
        });
        throw new Error(
          `[OpenCodeReal#createSession] Session creation failed for ${modelLabel}: ${errMsg}`
        );
      }

      const session = result.data!;
      this._sessionDirs.set(session.id, directory ?? session.directory);
      // SDK has no session-level tools flag — re-applied per prompt() via _sessionTools/
      // _composeToolsGate (stores the raw boolean|ToolGate; D-118..D-123 real enforcement).
      this._sessionTools.set(session.id, opts.tools ?? false);
      if (opts.model) {
        this._sessionModels.set(session.id, opts.model);
      }

      logger.debug('[OpenCodeReal#createSession] [creating → created]', {
        sid: session.id,
        title: session.title,
        model: modelLabel,
      });

      return {
        sid: session.id,
        title: session.title,
        directory: directory ?? session.directory,
        status: 'idle',
      };
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));
      const error = cause.message.startsWith('[OpenCodeReal#createSession]')
        ? cause
        : new Error(
            `[OpenCodeReal#createSession] Unable to create session for ${modelLabel}: ${cause.message}`,
            { cause }
          );
      logger.error('[OpenCodeReal#createSession] [creating → unavailable]', {
        title: opts.title,
        model: modelLabel,
        error,
      });
      throw error;
    }
    // #endregion END_CREATE_SESSION
  }

  // ── prompt ────────────────────────────────────────────────────

  /**
   * @param sid Session identifier.
   * @param opts System message, user text, and optional format schema.
   * @returns Discriminated result — ok: true with output or ok: false with error.
   * @see {AgentRuntimePort#prompt} in ./opencode.port.ts
   */
  async prompt(sid: string, opts: PromptOpts): Promise<OpenCodeCallResult> {
    return this._sendPrompt(sid, opts);
  }

  // ── status ────────────────────────────────────────────────────

  /**
   * @param sid Session identifier.
   * @returns Current lifecycle status mapped from SDK SessionStatus.
   * @see {AgentRuntimePort#status} in ./opencode.port.ts
   */
  async status(sid: string): Promise<SessionStatus> {
    const client = this._ensureClient();
    const directory = this._sessionDirs.get(sid) ?? this._directory;

    // #region START_STATUS — GET /session/status → map SDK type to port status
    try {
      logger.debug('[OpenCodeReal#status] [idle → querying]', { sid });

      const result = await client.session.status({
        query: directory ? { directory } : undefined,
      });

      if (result.error) {
        logger.warn('[OpenCodeReal#status] [querying → terminated]', {
          sid,
          error: result.error,
        });
        return 'terminated';
      }

      const statusMap = result.data;
      if (!statusMap || !(sid in statusMap)) {
        // Session not found in status map — may be completed or terminated.
        // Try session.get() to distinguish.
        try {
          await client.session.get({
            path: { id: sid },
            query: directory ? { directory } : undefined,
          });
          // Session exists but not in status → idle/completed
          return 'idle';
        } catch {
          return 'terminated';
        }
      }

      const sdkStatus = statusMap[sid]!;

      // #region START_MAP_STATUS — SDK SessionStatus type → port SessionStatus
      switch (sdkStatus.type) {
        case 'busy':
          return 'running';
        case 'retry':
          return 'error';
        case 'idle':
        default:
          return 'idle';
      }
      // #endregion END_MAP_STATUS
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));
      logger.warn('[OpenCodeReal#status] [querying → terminated]', {
        sid,
        error: cause,
      });
      return 'terminated';
    }
    // #endregion END_STATUS
  }

  // ── toolCalls ─────────────────────────────────────────────────

  /**
   * @invariant `session.prompt()` returns only the LAST assistant message of the turn —
   *           tool-call parts live on earlier messages, recoverable only via `session.messages`.
   * @param sid Session identifier.
   * @returns Tool calls that touched a file, path relative to the session directory.
   * @see {AgentRuntimePort#toolCalls} in ./opencode.port.ts
   */
  override async toolCalls(sid: string): Promise<ToolCall[]> {
    const client = this._ensureClient();
    const directory = this._sessionDirs.get(sid) ?? this._directory;

    // #region START_AGGREGATE_TOOL_CALLS — scan full message history, not the last prompt() reply
    try {
      logger.debug('[OpenCodeReal#toolCalls] [idle → querying]', { sid });

      const result = await client.session.messages({
        path: { id: sid },
        query: directory ? { directory } : undefined,
      });

      if (result.error || !result.data) {
        logger.warn('[OpenCodeReal#toolCalls] [server error → empty]', { sid });
        return [];
      }

      const calls: ToolCall[] = [];
      for (const message of result.data) {
        if (message.info.role !== 'assistant') continue;

        for (const part of message.parts) {
          if (part.type !== 'tool') continue;

          const filePath = (part.state.input as { filePath?: unknown }).filePath;
          if (typeof filePath !== 'string') continue; // non-file tool call (e.g. bash) — no ToolCall.path to report

          calls.push({
            tool: part.tool,
            path: this._relativeToSessionDirectory(filePath, directory),
          });
        }
      }

      logger.debug('[OpenCodeReal#toolCalls] [querying → aggregated]', {
        sid,
        count: calls.length,
      });
      return calls;
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));
      logger.warn('[OpenCodeReal#toolCalls] [querying → empty]', { sid, error: cause });
      return [];
    }
    // #endregion END_AGGREGATE_TOOL_CALLS
  }

  // ── toolCallStats ─────────────────────────────────────────────

  /**
   * @invariant Counts every tool part regardless of status; only 'completed' parts with numeric
   *   time.start/end contribute to totalMs — running/errored calls count with 0ms.
   * @param sid Session identifier.
   * @returns Per-tool count + totalMs, sorted by totalMs descending; empty on any error.
   * @see {AgentRuntimePort#toolCallStats} in ./opencode.port.ts
   */
  override async toolCallStats(sid: string): Promise<ToolCallStat[]> {
    const client = this._ensureClient();
    const directory = this._sessionDirs.get(sid) ?? this._directory;

    // #region START_AGGREGATE_TOOL_STATS — per-tool count + duration across full message history
    try {
      logger.debug('[OpenCodeReal#toolCallStats] [idle → querying]', { sid });

      const result = await client.session.messages({
        path: { id: sid },
        query: directory ? { directory } : undefined,
      });

      if (result.error || !result.data) {
        logger.warn('[OpenCodeReal#toolCallStats] [server error → empty]', { sid });
        return [];
      }

      const byTool = new Map<string, { count: number; totalMs: number }>();
      for (const message of result.data) {
        if (message.info.role !== 'assistant') continue;

        for (const part of message.parts) {
          if (part.type !== 'tool') continue;

          const entry = byTool.get(part.tool) ?? { count: 0, totalMs: 0 };
          entry.count++;

          const state = part.state as {
            status?: string;
            time?: { start?: unknown; end?: unknown };
          };
          if (
            state?.status === 'completed' &&
            typeof state.time?.start === 'number' &&
            typeof state.time?.end === 'number'
          ) {
            entry.totalMs += state.time.end - state.time.start;
          }

          byTool.set(part.tool, entry);
        }
      }

      const stats: ToolCallStat[] = [...byTool.entries()]
        .map(([tool, { count, totalMs }]) => ({ tool, count, totalMs }))
        .sort((a, b) => b.totalMs - a.totalMs);

      logger.debug('[OpenCodeReal#toolCallStats] [querying → aggregated]', {
        sid,
        tools: stats.length,
      });
      return stats;
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));
      logger.warn('[OpenCodeReal#toolCallStats] [querying → empty]', { sid, error: cause });
      return [];
    }
    // #endregion END_AGGREGATE_TOOL_STATS
  }

  // ── toolCallTrace ─────────────────────────────────────────────

  /**
   * @invariant Preserves message + part order; input summarized per tool and truncated to 300 chars.
   * @param sid Session identifier.
   * @returns Tool calls in session order with input summaries; empty on any error.
   * @see {AgentRuntimePort#toolCallTrace} in ./opencode.port.ts
   */
  override async toolCallTrace(sid: string): Promise<ToolTraceEntry[]> {
    const client = this._ensureClient();
    const directory = this._sessionDirs.get(sid) ?? this._directory;

    try {
      const result = await client.session.messages({
        path: { id: sid },
        query: directory ? { directory } : undefined,
      });

      if (result.error || !result.data) {
        logger.warn('[OpenCodeReal#toolCallTrace] [server error → empty]', { sid });
        return [];
      }

      const trace: ToolTraceEntry[] = [];
      let seq = 0;
      for (const message of result.data) {
        if (message.info.role !== 'assistant') continue;

        for (const part of message.parts) {
          if (part.type !== 'tool') continue;

          const state = part.state as {
            status?: string;
            input?: Record<string, unknown>;
            time?: { start?: unknown; end?: unknown };
            output?: unknown;
            error?: unknown;
          };
          const ms =
            state?.status === 'completed' &&
            typeof state.time?.start === 'number' &&
            typeof state.time?.end === 'number'
              ? state.time.end - state.time.start
              : 0;
          const output = typeof state?.output === 'string' ? state.output : undefined;

          trace.push({
            seq: seq++,
            tool: part.tool,
            input: _summarizeToolInput(part.tool, state?.input),
            ms,
            status: state?.status ?? 'unknown',
            outputBytes: output !== undefined ? Buffer.byteLength(output, 'utf8') : undefined,
            outputLines: output !== undefined ? output.split('\n').length : undefined,
            errorSummary: typeof state?.error === 'string' ? state.error.slice(0, 200) : undefined,
          });
        }
      }

      logger.debug('[OpenCodeReal#toolCallTrace] [querying → aggregated]', {
        sid,
        calls: trace.length,
      });
      return trace;
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));
      logger.warn('[OpenCodeReal#toolCallTrace] [querying → empty]', { sid, error: cause });
      return [];
    }
  }

  // ── messages ─────────────────────────────────────────────────

  /**
   * @purpose Retrieve the full message history for a session — the raw SDK response with
   *   role-annotated parts.
   * @param sid Session identifier.
   * @returns Array of messages from the session, or empty on error / not found.
   */
  async messages(sid: string): Promise<OpenCodeMessage[]> {
    const client = this._ensureClient();
    const directory = this._sessionDirs.get(sid) ?? this._directory;

    // #region START_FETCH_MESSAGES — GET /session/{id}/messages
    try {
      logger.debug('[OpenCodeReal#messages] [idle → querying]', { sid });

      const result = await client.session.messages({
        path: { id: sid },
        query: directory ? { directory } : undefined,
      });

      if (result.error || !result.data) {
        logger.warn('[OpenCodeReal#messages] [server error → empty]', { sid });
        return [];
      }

      const messages: OpenCodeMessage[] = [];
      for (const msg of result.data) {
        messages.push({
          role: msg.info.role,
          parts: msg.parts.map((p) => ({
            type: p.type,
            tool: 'tool' in p ? p.tool : undefined,
            state: 'state' in p ? p.state : undefined,
            text: 'text' in p ? (p as TextPart).text : undefined,
          })),
        });
      }

      logger.debug('[OpenCodeReal#messages] [querying → fetched]', {
        sid,
        count: messages.length,
      });
      return messages;
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));
      logger.warn('[OpenCodeReal#messages] [querying → empty]', { sid, error: cause });
      return [];
    }
    // #endregion END_FETCH_MESSAGES
  }

  // ── park ──────────────────────────────────────────────────────

  /**
   * @purpose Mark a session as parked — keeps it alive on the server but idle.
   * @invariant Parked sessions can be resumed via resume(); no HTTP call — purely local state.
   * @param sid Session identifier.
   * @returns Promise that resolves when the park state is recorded.
   */
  async park(sid: string): Promise<void> {
    this._parkedSessions.set(sid, new Date().toISOString());
    logger.info('[OpenCodeReal#park] [work → park]', { sid });
  }

  // ── resume ────────────────────────────────────────────────────

  /**
   * @purpose Resume a parked session — clears park state, keeps session alive.
   * @invariant No HTTP call — the session was kept alive on the server. Caller should verify
   *   TTL before resuming (use SessionLifecycle).
   * @param sid Session identifier.
   * @returns true when the session was parked and is now resumed; false if it wasn't parked.
   */
  async resume(sid: string): Promise<boolean> {
    if (!this._parkedSessions.has(sid)) {
      logger.debug('[OpenCodeReal#resume] [resuming → not_parked]', { sid });
      return false;
    }
    this._parkedSessions.delete(sid);
    logger.info('[OpenCodeReal#resume] [park → work]', { sid });
    return true;
  }

  /**
   * @param sid Session identifier.
   * @param opts Remediation prompt.
   * @returns Discriminated result.
   * @see {AgentRuntimePort#continueSignal} in ./opencode.port.ts
   */
  async continueSignal(sid: string, opts: PromptOpts): Promise<OpenCodeCallResult> {
    return this._sendPrompt(sid, opts);
  }

  // ── abort ─────────────────────────────────────────────────────

  /**
   * @param sid Session identifier.
   * @returns Promise that resolves when abort completes.
   * @sideEffect Calls POST /session/{id}/abort on the server.
   * @see {AgentRuntimePort#abort} in ./opencode.port.ts
   */
  async abort(sid: string): Promise<void> {
    const client = this._ensureClient();
    const directory = this._sessionDirs.get(sid) ?? this._directory;

    // #region START_ABORT — POST /session/{id}/abort
    try {
      logger.debug('[OpenCodeReal#abort] [active → aborting]', { sid });

      const result = await client.session.abort({
        path: { id: sid },
        query: directory ? { directory } : undefined,
      });

      if (result.error) {
        logger.warn('[OpenCodeReal#abort] [aborting → server_failed]', {
          sid,
          error: result.error,
        });
      } else {
        logger.debug('[OpenCodeReal#abort] [aborting → aborted]', { sid });
      }
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));
      logger.warn('[OpenCodeReal#abort] [aborting → ignored_failure]', {
        sid,
        error: cause,
      });
    }
    // #endregion END_ABORT
  }

  // ── close ─────────────────────────────────────────────────────

  /**
   * @param sid Session identifier.
   * @returns Promise that resolves when close completes.
   * @sideEffect Calls DELETE /session/{id} to release server resources.
   * @see {AgentRuntimePort#close} in ./opencode.port.ts
   */
  async close(sid: string): Promise<void> {
    const client = this._ensureClient();
    const directory = this._sessionDirs.get(sid) ?? this._directory;

    // #region START_CLOSE — DELETE /session/{id}
    try {
      logger.debug('[OpenCodeReal#close] [active → closing]', { sid });

      const result = await client.session.delete({
        path: { id: sid },
        query: directory ? { directory } : undefined,
      });

      if (result.error) {
        logger.warn('[OpenCodeReal#close] [closing → server_failed]', {
          sid,
          error: result.error,
        });
      } else {
        logger.debug('[OpenCodeReal#close] [closing → closed]', { sid });
      }
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));
      logger.warn('[OpenCodeReal#close] [closing → ignored_failure]', {
        sid,
        error: cause,
      });
    } finally {
      this._sessionDirs.delete(sid);
      this._pendingSchemas.delete(sid);
      this._sessionTools.delete(sid);
      this._sessionModels.delete(sid);
      this._parkedSessions.delete(sid);
    }
    // #endregion END_CLOSE
  }

  // ═══════════════════════════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * @purpose Core prompt logic: builds request body with system, text, optional JSON format.
   * Extracts JSON from response when format is specified.
   * @param sid Session identifier.
   * @param opts Prompt options.
   * @returns Discriminated call result.
   */
  protected async _sendPrompt(sid: string, opts: PromptOpts): Promise<OpenCodeCallResult> {
    const client = this._ensureClient();
    const directory = this._sessionDirs.get(sid) ?? this._directory;
    const hasFormat = !!opts.format;

    // #region START_BUILD_PROMPT_BODY — compose system + text parts
    let system = opts.system ?? '';
    const parts: Array<{ type: 'text'; text: string }> = [];

    // Store schema for JSON extraction — not injected into prompt (avoids model hang).
    // _extractJson uses this to validate extracted JSON against the expected schema.
    if (hasFormat && opts.format) {
      this._pendingSchemas.set(sid, opts.format.schema);
    }

    if (opts.text) {
      parts.push({ type: 'text', text: opts.text });
    }
    // #endregion END_BUILD_PROMPT_BODY

    // Port contract: opts.timeout is in MINUTES (an agent turn is multi-step/long-running);
    // the adapter's own default (this._timeout) is in ms — convert only the per-call override.
    const timeoutMs = opts.timeout != null ? opts.timeout * 60_000 : this._timeout;

    // tools gate lives only per-prompt in the SDK (no session-level flag) — re-apply every call.
    // See `_composeToolsGate` for the boolean/ToolGate → SDK-body composition (D-118..D-123).
    const toolsGate = this._composeToolsGate(this._sessionTools.get(sid) ?? false);

    // Per-phase model selection (TSK-perf): PromptOpts.model overrides the session's
    // CreateSessionOpts.model default; both absent → omit the field and let the server decide.
    // Agent Inbox production never relies on that mutable global default: bootstrap pins its
    // canonical model before creating a control-plane session.
    // Format is `providerID/modelID` (e.g. `llm-proxy/deepseek-v4-flash`) — split on the FIRST
    // slash only, since providerID itself may be a path-like namespace.
    const modelStr = opts.model ?? this._sessionModels.get(sid);
    const model = this._parseModel(modelStr);
    const modelLabel = modelStr ?? 'server-default';

    try {
      logger.debug('[OpenCodeReal#_sendPrompt] [idle → prompting]', {
        sid,
        hasFormat,
        toolsGate,
        model: modelStr,
        systemLength: system.length,
        partsCount: parts.length,
      });

      const result = await this._withTimeout(
        client.session.prompt({
          body: {
            system: system || undefined,
            parts: parts as Array<{ type: 'text'; text: string }>,
            ...(toolsGate ? { tools: toolsGate } : {}),
            ...(model ? { model } : {}),
          },
          path: { id: sid },
          query: directory ? { directory } : undefined,
        }),
        timeoutMs,
        () => {
          // Client-side timeout must not leave the agent turn running server-side unattended.
          void this.abort(sid);
        }
      );

      if (result.error) {
        const errData = result.error as { name?: string; data?: { message?: string } } | undefined;
        const errName = errData?.name ?? 'UnknownError';
        const errMsg = errData?.data?.message ?? 'Prompt failed';

        logger.error('[OpenCodeReal#_sendPrompt] [prompting → server_failed]', {
          sid,
          model: modelLabel,
          providerID: model?.providerID,
          modelID: model?.modelID,
          errorName: errName,
          message: errMsg,
        });

        // #region START_CLASSIFY_SERVER_ERROR
        if (errName === 'MessageAbortedError') {
          return composeError(
            'SESSION_ERROR',
            `[OpenCodeReal#_sendPrompt] Session ${sid} was aborted for ${modelLabel}: ${errMsg}`,
            { model: modelLabel, providerID: model?.providerID, modelID: model?.modelID }
          );
        }
        if (errName === 'APIError') {
          const statusCode = errData?.data && (errData.data as Record<string, unknown>).statusCode;
          if (statusCode === 404) {
            return composeError(
              'SESSION_ERROR',
              `[OpenCodeReal#_sendPrompt] Session ${sid} not found on OpenCode server for ${modelLabel} (HTTP 404)`,
              {
                model: modelLabel,
                providerID: model?.providerID,
                modelID: model?.modelID,
                statusCode,
              }
            );
          }
        }
        return composeError(
          'SESSION_ERROR',
          `[OpenCodeReal#_sendPrompt] OpenCode server rejected ${modelLabel}: ${errName} — ${errMsg}`,
          {
            model: modelLabel,
            providerID: model?.providerID,
            modelID: model?.modelID,
            providerError: errName,
          }
        );
        // #endregion END_CLASSIFY_SERVER_ERROR
      }

      const response = result.data!;
      const assistantInfo = response.info;
      const responseParts = response.parts;

      // Check if the assistant message itself has an error
      if (assistantInfo.error) {
        const msgErr = assistantInfo.error;
        const errorData = (msgErr.data ?? {}) as Record<string, unknown>;
        const providerMessage =
          typeof errorData.message === 'string'
            ? errorData.message
            : typeof errorData.responseBody === 'string'
              ? errorData.responseBody.slice(0, 500)
              : 'unknown';
        const statusCode = errorData.statusCode;
        const retryable = errorData.isRetryable;
        logger.error('[OpenCodeReal#_sendPrompt] [prompting → provider_failed]', {
          sid,
          model: modelLabel,
          providerID: model?.providerID,
          modelID: model?.modelID,
          errorName: msgErr.name,
          statusCode,
          retryable,
          message: providerMessage,
        });

        if (msgErr.name === 'MessageAbortedError') {
          return composeError(
            'SESSION_ERROR',
            `[OpenCodeReal#_sendPrompt] Session ${sid} was aborted for ${modelLabel}`,
            { model: modelLabel, providerID: model?.providerID, modelID: model?.modelID }
          );
        }
        if (msgErr.name === 'MessageOutputLengthError') {
          return composeError(
            'INCOMPLETE_ARTIFACT',
            `[OpenCodeReal#_sendPrompt] Output for ${modelLabel} session ${sid} exceeded the length limit`,
            {
              raw: '',
              model: modelLabel,
              providerID: model?.providerID,
              modelID: model?.modelID,
            }
          );
        }
        const httpLabel = typeof statusCode === 'number' ? `HTTP ${statusCode}` : 'HTTP unknown';
        return composeError(
          'SESSION_ERROR',
          `[OpenCodeReal#_sendPrompt] Provider request failed for ${modelLabel}: ${httpLabel} ${providerMessage}`,
          {
            model: modelLabel,
            providerID: model?.providerID,
            modelID: model?.modelID,
            statusCode,
            retryable,
            providerError: msgErr.name,
            providerMessage,
          }
        );
      }

      // #region START_EXTRACT_TEXT — collect all TextPart text from response
      const texts: string[] = [];
      for (const part of responseParts) {
        if (part.type === 'text') {
          const textPart = part as TextPart;
          if (textPart.text && !textPart.ignored) {
            texts.push(textPart.text);
          }
        }
      }
      const fullText = texts.join('\n');
      // #endregion END_EXTRACT_TEXT

      // If no format requested, return text as output
      if (!hasFormat) {
        logger.debug('[OpenCodeReal#_sendPrompt] [prompting → completed_text]', {
          sid,
          textLength: fullText.length,
        });
        void this._writeToolTrace(sid, directory);
        return composeOk({ text: fullText, raw: fullText });
      }

      // Priority 1: extract JSON from ```json ... ``` code blocks
      const jsonBlockRegex = /```(?:json)\s*\n?([\s\S]*?)```/g;
      const jsonBlocks: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = jsonBlockRegex.exec(fullText)) !== null) {
        jsonBlocks.push(match[1]!.trim());
      }

      // Priority 2: try parsing the entire text as JSON
      if (jsonBlocks.length === 0) {
        const trimmed = fullText.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          jsonBlocks.push(trimmed);
        }
      }

      if (jsonBlocks.length === 0) {
        logger.warn('[OpenCodeReal#_sendPrompt] [prompting → no_result]', {
          sid,
          textPreview: fullText.slice(0, 200),
        });
        return composeError('NO_RESULT', 'No JSON found in AI response', {
          raw: fullText.slice(0, 2000),
        });
      }

      // Try each JSON block — use the last one (most likely the structured output)
      const lastBlock = jsonBlocks[jsonBlocks.length - 1]!;
      let parsed: unknown;
      try {
        parsed = JSON.parse(lastBlock);
      } catch {
        logger.warn('[OpenCodeReal#_sendPrompt] [prompting → parse_failed]', {
          sid,
          blockPreview: lastBlock.slice(0, 200),
        });
        return composeError('PARSE_ERROR', 'Failed to parse JSON from AI response', {
          raw: lastBlock,
        });
      }

      // Validate against schema if provided
      if (opts.format?.schema) {
        const schemaErrors = this._validateSchema(
          opts.format.schema as Record<string, unknown>,
          parsed as Record<string, unknown>
        );
        if (schemaErrors.length > 0) {
          logger.warn('[OpenCodeReal#_sendPrompt] [prompting → schema_mismatch]', {
            sid,
            errors: schemaErrors,
          });
          return composeError(
            'SCHEMA_MISMATCH',
            `Output does not match expected schema: ${schemaErrors.join('; ')}`,
            {
              mismatchedFields: schemaErrors,
              expected: opts.format.schema,
              received: parsed as Record<string, unknown>,
              raw: lastBlock,
            }
          );
        }
      }

      logger.debug('[OpenCodeReal#_sendPrompt] [prompting → completed_structured]', { sid });
      void this._writeToolTrace(sid, directory);
      return composeOk(parsed as Record<string, unknown>);
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));

      // #region START_CLASSIFY_NETWORK_ERROR — connection refused, timeout, etc.
      const message = cause.message.toLowerCase();
      if (
        message.includes('econnrefused') ||
        message.includes('fetch failed') ||
        message.includes('connection refused')
      ) {
        logger.error('[OpenCodeReal#_sendPrompt] [prompting → unavailable]', {
          sid,
          model: modelLabel,
          error: cause,
        });
        return composeError(
          'SESSION_ERROR',
          `[OpenCodeReal#_sendPrompt] OpenCode server unavailable for ${modelLabel}: ${cause.message}`,
          { model: modelLabel, providerID: model?.providerID, modelID: model?.modelID }
        );
      }

      if (message.includes('timeout') || message.includes('abort')) {
        logger.error('[OpenCodeReal#_sendPrompt] [prompting → timed_out]', {
          sid,
          model: modelLabel,
          error: cause,
        });
        return composeError(
          'TIMEOUT',
          `[OpenCodeReal#_sendPrompt] Prompt timed out for ${modelLabel}: ${cause.message}`,
          { model: modelLabel, providerID: model?.providerID, modelID: model?.modelID }
        );
      }

      logger.error('[OpenCodeReal#_sendPrompt] [prompting → failed]', {
        sid,
        model: modelLabel,
        error: cause,
      });
      return composeError(
        'SESSION_ERROR',
        `[OpenCodeReal#_sendPrompt] Unexpected failure for ${modelLabel}: ${cause.message}`,
        { model: modelLabel, providerID: model?.providerID, modelID: model?.modelID }
      );
      // #endregion END_CLASSIFY_NETWORK_ERROR
    }
  }

  /**
   * @purpose Compose the stored tools gate into the SDK request body's `tools` shape (D-118..D-123).
   * @invariant `true` → undefined (full toolset). `false` → deny all. A `ToolGate` → fail-closed
   *   merge; only its explicit `true` entries are granted.
   * @param gate The stored `CreateSessionOpts.tools` value for this session.
   * @returns The SDK body's `tools` map, or undefined to omit the field.
   */
  protected _composeToolsGate(gate: boolean | ToolGate): Record<string, boolean> | undefined {
    if (gate === true) return undefined;
    if (gate === false) return { '*': false };
    return { '*': false, ...gate };
  }

  /**
   * @purpose Wrap a promise with a timeout — rejects if the promise does not settle within ms.
   * @invariant On expiry, `onTimeout` runs BEFORE reject — used to abort the server-side turn.
   * @param promise The promise to protect.
   * @param ms Timeout in milliseconds.
   * @param [onTimeout] Fire-and-forget callback invoked exactly once on expiry.
   * @returns The promise result, or throws TIMEOUT error.
   */
  protected _withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        onTimeout?.();
        reject(new Error('TIMEOUT: operation timed out'));
      }, ms);
      promise.then(
        (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  /**
   * @purpose Parse a port-level model string (`providerID/modelID`) into the SDK's
   *   `session.prompt` body shape.
   * @param modelStr e.g. `llm-proxy/deepseek-v4-pro`; undefined when no model was selected.
   * @returns `{ providerID, modelID }` or undefined when `modelStr` is absent/malformed.
   */
  protected _parseModel(
    modelStr: string | undefined
  ): { providerID: string; modelID: string } | undefined {
    const model = parseOpenCodeModel(modelStr);
    if (!modelStr) return undefined;
    if (!model) {
      logger.warn('[OpenCodeReal#_parseModel] [malformed → ignored]', { modelStr });
      return undefined;
    }
    return model;
  }

  /**
   * @purpose Strip the session directory prefix from an absolute tool-call path.
   * @param absolutePath Absolute path reported by `ToolPart.state.input.filePath`.
   * @param directory Session directory to strip; undefined → path returned unchanged.
   * @returns Path relative to the session directory (port contract for `ToolCall.path`).
   */
  protected _relativeToSessionDirectory(
    absolutePath: string,
    directory: string | undefined
  ): string {
    if (!directory) return absolutePath;
    const prefix = directory.endsWith('/') ? directory : `${directory}/`;
    return absolutePath.startsWith(prefix) ? absolutePath.slice(prefix.length) : absolutePath;
  }

  /**
   * @purpose Write the session's tool-call trace to telemetry/tool-trace.jsonl.
   * @invariant Appends one JSON line per tool call to the trace file — durable record for
   *   coverage-gate and deterministic-vs-agent audit (D-316).
   * @param sid Session identifier.
   * @param [directory] Session directory for building the telemetry path.
   * @returns Promise that resolves when the trace is written.
   * @sideEffect Appends lines to telemetry/tool-trace.jsonl in the session directory.
   */
  protected async _writeToolTrace(sid: string, directory?: string): Promise<void> {
    try {
      const trace = await this.toolCallTrace(sid);
      if (trace.length === 0) return;

      const baseDir = directory ?? this._directory ?? '.';
      const telemetryDir = `${baseDir}/${this._toolTraceDir}`;
      if (!existsSync(telemetryDir)) {
        mkdirSync(telemetryDir, { recursive: true });
      }

      const filePath = `${telemetryDir}/tool-trace.jsonl`;
      // #region START_WRITE_TRACE_LINES — one JSON line per tool call
      for (const entry of trace) {
        appendFileSync(filePath, JSON.stringify({ sid, ...entry }) + '\n');
      }
      // #endregion END_WRITE_TRACE_LINES

      logger.debug('[OpenCodeReal#_writeToolTrace] [writing → written]', {
        sid,
        lines: trace.length,
        filePath,
      });
    } catch (cause) {
      const error = new Error('[OpenCodeReal#_writeToolTrace] Trace write failed', { cause });
      logger.warn('[OpenCodeReal#_writeToolTrace] [writing → failed]', { error });
    }
  }

  /**
   * @purpose Generate a plausible example JSON from a JSON Schema for the prompt.
   * @param schema The JSON Schema to generate an example from.
   * @returns An example object matching the schema structure.
   */
  protected _generateExample(schema: Record<string, unknown>): Record<string, unknown> {
    const properties = (schema.properties as Record<string, Record<string, unknown>>) ?? {};
    const required = (schema.required as string[]) ?? [];
    const example: Record<string, unknown> = {};

    for (const [key, propSchema] of Object.entries(properties)) {
      const type = propSchema.type as string | undefined;
      switch (type) {
        case 'string':
          example[key] = key === 'id' ? 'example-id' : `example-${key}`;
          break;
        case 'number':
        case 'integer':
          example[key] = 0;
          break;
        case 'boolean':
          example[key] = false;
          break;
        case 'array':
          example[key] = [];
          break;
        case 'object':
          example[key] = {};
          break;
        default:
          // For enums: use first value
          if (Array.isArray(propSchema.enum) && propSchema.enum.length > 0) {
            example[key] = propSchema.enum[0];
          } else {
            example[key] = null;
          }
      }
    }

    // Ensure required fields are present even if not in properties
    for (const reqKey of required) {
      if (!(reqKey in example)) {
        example[reqKey] = 'required-value';
      }
    }

    return example;
  }

  /**
   * @purpose Perform basic structural validation of parsed JSON against a schema.
   * Checks required fields and primitive type matching. Not a full JSON Schema validator.
   * @param schema The expected JSON Schema.
   * @param data The parsed JSON data to validate.
   * @returns Array of human-readable error messages (empty = valid).
   */
  protected _validateSchema(
    schema: Record<string, unknown>,
    data: Record<string, unknown>
  ): string[] {
    const errors: string[] = [];
    const properties = (schema.properties as Record<string, Record<string, unknown>>) ?? {};
    const required = (schema.required as string[]) ?? [];

    // Check required fields exist
    for (const reqKey of required) {
      if (!(reqKey in data) || data[reqKey] === undefined || data[reqKey] === null) {
        errors.push(`required field "${reqKey}" is missing or null`);
      }
    }

    // Check types for present fields
    for (const [key, propSchema] of Object.entries(properties)) {
      if (!(key in data) || data[key] === undefined) continue;

      const value = data[key];
      const expectedType = propSchema.type as string | undefined;

      if (expectedType) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (expectedType === 'integer') {
          if (typeof value !== 'number' || !Number.isInteger(value)) {
            errors.push(`field "${key}" expected integer, got ${typeof value}`);
          }
        } else if (expectedType !== actualType) {
          // Allow null for non-required fields
          if (value !== null || required.includes(key)) {
            errors.push(`field "${key}" expected ${expectedType}, got ${actualType}`);
          }
        }
      }
    }

    return errors;
  }
}

export {
  classifyOutcome,
  resolveOutcomeLadder,
  type LadderAction,
} from './agent-outcome-classifier.ts';

/** @purpose Legacy name for the same production adapter during consumer migration. */
export { OpenCodeAgentAdapter as OpenCodeReal };
