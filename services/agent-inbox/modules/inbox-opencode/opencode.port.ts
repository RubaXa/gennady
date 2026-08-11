// @file: AgentRuntimePort with the legacy OpenCode session surface retained in one hierarchy.
// @consumers: SessionPool, inbox-roles, DI container
// @tasks: TSK-111, TSK-160, TSK-175

import type { OpenCodeCallResult } from './errors.ts';
import { validateAgentSchema } from './schema-registry.ts';

/** @purpose Lifecycle status of an AI-node session. */
export type SessionStatus = 'idle' | 'running' | 'completed' | 'error' | 'terminated';

/** @purpose Handle returned when a session is created — carries id, metadata, and current status. */
export type SessionHandle = {
  /** @purpose Unique session identifier */
  sid: string;
  /** @purpose Human-readable label for the session */
  title: string;
  /** @purpose Working directory bound to the session (cwd) */
  directory: string;
  /** @purpose Current lifecycle status */
  status: SessionStatus;
};

/**
 * @purpose Fine-grained per-tool allowlist (D-118..D-123, AI-41) — real enforcement, not declarative.
 * @invariant Keys are server tool names (`bash`/`read`/`grep`/`write`/`edit`/...). A name absent
 *   from the map is DENIED — composed fail-closed by `OpenCodeReal#_composeToolsGate`.
 */
export type ToolGate = Record<string, boolean>;

/**
 * @purpose True when a tools gate grants access to at least one tool — used to gate telemetry.
 * @param gate The gate stored from `CreateSessionOpts.tools` (possibly absent).
 * @returns Whether any tool is reachable under this gate.
 */
export function toolsGateActive(gate: boolean | ToolGate | undefined): boolean {
  if (gate === true) return true;
  if (!gate) return false;
  return Object.values(gate).some(Boolean);
}

/** @purpose Options for creating a new AI-node session. */
export type CreateSessionOpts = {
  /** @purpose Human-readable label for the session */
  title: string;
  /** @purpose Working directory — must exist, becomes the session cwd */
  directory: string;
  /**
   * @purpose Tool access gate for this session.
   * @invariant `true` → full default toolset; `false`/absent → no tools; a `ToolGate` object →
   *   fine-grained allowlist, unlisted tool names denied (D-118..D-123).
   */
  tools?: boolean | ToolGate;
  /**
   * @purpose Default model for this session's turns, e.g. `llm-proxy/deepseek-v4-pro` |
   *   @invariant Per-prompt `PromptOpts.model` overrides this default — the SDK has no
   *   session-level model field, so adapters re-apply this as a fallback on every prompt() call.
   */
  model?: string;
};

/** @purpose A single tool invocation recorded during an agent turn — telemetry fact, not agent self-report. */
export type ToolCall = {
  /** @purpose Tool that performed the call (read/grep/git) */
  tool: string;
  /** @purpose File path touched by the tool call, relative to the session directory */
  path: string;
};

/** @purpose Per-tool call-count + duration rollup for one session — localizes slowness to a tool. */
export type ToolCallStat = {
  /** @purpose Tool name as reported by the agent turn (e.g. 'bash', 'read', 'grep') */
  tool: string;
  /** @purpose Number of invocations of this tool in the session, any status */
  count: number;
  /** @purpose Summed wall-clock duration across completed invocations, in ms */
  totalMs: number;
};

/** @purpose One tool call in session order, with its input — for the deterministic-vs-agent audit. */
export type ToolTraceEntry = {
  /** @purpose 0-based position of this call in the session's tool sequence */
  seq: number;
  /** @purpose Tool name (e.g. 'bash', 'read', 'glob') */
  tool: string;
  /** @purpose Short one-line input summary (bash command / file path / pattern), truncated */
  input: string;
  /** @purpose Wall-clock duration of the call in ms, or 0 when not completed */
  ms: number;
  /** @purpose Tool state status (e.g. 'completed', 'running', 'error') */
  status: string;
  /** @purpose Byte length of the tool's raw output text, when available (detail-report sizing). */
  outputBytes?: number;
  /** @purpose Newline-delimited line count of the tool's raw output, when available. */
  outputLines?: number;
  /** @purpose Error message text when status is 'error' — why the call was denied/failed. */
  errorSummary?: string;
};

/** @purpose Structured output format descriptor — schema-driven JSON output. */
export type OpenCodeFormat = {
  /** @purpose Format kind — always json_schema */
  type: 'json_schema';
  /** @purpose JSON Schema definition for the expected output shape */
  schema: Record<string, unknown>;
};

/** @purpose Options for a prompt call — system message, user text, and optional format. */
export type PromptOpts = {
  /** @purpose System-level instruction */
  system?: string;
  /** @purpose User-level prompt text */
  text?: string;
  /** @purpose Optional structured output format (schema-driven JSON) */
  format?: OpenCodeFormat;
  /** @purpose Per-call timeout for the whole agent turn, in minutes (overrides adapter default) | @invariant Unit is minutes, not ms/s — an agent turn is multi-step and long-running */
  timeout?: number;
  /**
   * @purpose Per-phase model override for this one prompt call, e.g. `llm-proxy/deepseek-v4-pro` |
   *   `llm-proxy/deepseek-v4-flash` — format is `providerID/modelID`.
   * @invariant Absent → adapter omits the model field (falls back to `CreateSessionOpts.model`,
   *   then the server's own configured default) — never silently forces a specific model.
   */
  model?: string;
};

/** @purpose A normalized session message retained by OpenCode adapters for lifecycle telemetry. */
export type OpenCodeMessage = {
  /** @purpose Author role reported by OpenCode. */
  role: string;
  /** @purpose Raw message parts, intentionally adapter-neutral. */
  parts: Array<Record<string, unknown>>;
};

/** @purpose Attributed request for one structured agent-runtime turn. */
export type AgentRuntimeRequest = {
  /** @purpose Existing session selected by semantic routing. */
  sessionId: string;
  /** @purpose Stable task identity carried into outcome provenance. */
  taskId: string;
  /** @purpose Explicit model identity carried into outcome provenance. */
  model: string;
  /** @purpose Adapter-neutral prompt payload for this turn. */
  prompt: PromptOpts;
};

/** @purpose Provenance attached to every successful or failed runtime result. */
export type AgentRuntimeAttribution = {
  /** @purpose Session that produced or failed the turn. */
  sessionId: string;
  /** @purpose Logical task that requested the turn. */
  taskId: string;
  /** @purpose Model selected for the turn. */
  model: string;
};

/** @purpose Exhaustive attributed outcome returned by AgentRuntimePort. */
export type AgentRuntimeResult =
  | (AgentRuntimeAttribution & {
      ok: true;
      output: Record<string, unknown>;
      trace: ToolTraceEntry[];
    })
  | (AgentRuntimeAttribution & {
      ok: false;
      outcome: Exclude<import('./errors.ts').OutcomeClass, 'OK'>;
      signal: string;
      raw?: string;
      retry: import('./errors.ts').AgentRetryMetadata;
      trace: ToolTraceEntry[];
    });

/** @purpose Observable live session state and accumulated factual trace. */
export type AgentRuntimeInspection = AgentRuntimeAttribution & {
  /** @purpose Current adapter lifecycle state. */
  status: SessionStatus;
  /** @purpose Complete conversation history exposed by the adapter. */
  messages: OpenCodeMessage[];
  /** @purpose Accumulated factual tool activity; empty means coverage is unproven. */
  trace: ToolTraceEntry[];
};

/**
 * @purpose Abstraction over an OpenCode AI-node session for structured prompting.
 * @invariant Preconditions: non-empty system/text; existing directory path.
 * @invariant Postconditions: success → structured output; failure → classified error.
 * @invariant Agentic: one session = one AI-node; `tools: true` binds read/grep/git;
 * prompt() returns after turn completes; unreachable after close().
 * @consumers SessionPool, inbox-roles
 */
export abstract class AgentRuntimePort {
  /**
   * @purpose Execute one attributed turn in an existing semantically selected session.
   * @invariant A transport/schema/task failure remains a failed result and never fabricates output.
   * @param request Session, task, model and prompt identity for the turn.
   * @returns Attributed success or visible failure with retry metadata and factual trace.
   */
  async run(request: AgentRuntimeRequest): Promise<AgentRuntimeResult> {
    this._assertRuntimeRequest(request);
    const result = await this.prompt(request.sessionId, {
      ...request.prompt,
      model: request.prompt.model ?? request.model,
    });
    return this._attributeRuntimeResult(request, result);
  }

  /**
   * @purpose Continue the same producer session for correction or coverage recovery.
   * @invariant Continuation never allocates or substitutes another session.
   * @param request Existing producer-session turn identity.
   * @returns Attributed continuation outcome with accumulated trace.
   */
  async continue(request: AgentRuntimeRequest): Promise<AgentRuntimeResult> {
    this._assertRuntimeRequest(request);
    const result = await this.continueSignal(request.sessionId, {
      ...request.prompt,
      model: request.prompt.model ?? request.model,
    });
    return this._attributeRuntimeResult(request, result);
  }

  /**
   * @purpose Expose the runtime turn as an async stream while preserving one canonical run path.
   * @param request Attributed turn identity.
   * @returns Async iterable yielding the terminal attributed result.
   */
  async *stream(request: AgentRuntimeRequest): AsyncIterable<AgentRuntimeResult> {
    yield await this.run(request);
  }

  /** @purpose Cancel one in-flight session turn through the existing adapter abort surface. */
  async cancel(sessionId: string): Promise<void> {
    if (!sessionId) throw new Error('[AgentRuntimePort#cancel] sessionId must be non-empty');
    await this.abort(sessionId);
  }

  /**
   * @purpose Inspect current session outcome context without inferring coverage from absent trace.
   * @param attribution Session, task and model identity expected by the consumer.
   * @returns Current lifecycle, messages and factual trace.
   */
  async inspect(attribution: AgentRuntimeAttribution): Promise<AgentRuntimeInspection> {
    if (!attribution.sessionId || !attribution.taskId || !attribution.model) {
      throw new Error('[AgentRuntimePort#inspect] Attribution fields must be non-empty');
    }
    const [status, messages, trace] = await Promise.all([
      this.status(attribution.sessionId),
      this.messages(attribution.sessionId),
      this.toolCallTrace(attribution.sessionId),
    ]);
    return { ...attribution, status, messages, trace };
  }
  /**
   * @purpose Create a new AI-node session bound to a working directory.
   * @param opts Title and directory for the session.
   * @returns Session handle with unique id and initial 'idle' status.
   * @throws {Error} When directory does not exist or session creation fails.
   */
  abstract createSession(opts: CreateSessionOpts): Promise<SessionHandle>;

  /**
   * @purpose Send a prompt to an existing session and await structured output or error.
   * @param sid Session identifier from createSession.
   * @param opts System message, user text, and optional format schema.
   * @returns Discriminated result — ok: true with output or ok: false with classified error.
   * @throws {Error} When sid is unknown or session is in a terminal state.
   */
  abstract prompt(sid: string, opts: PromptOpts): Promise<OpenCodeCallResult>;

  /**
   * @purpose Retrieve the current lifecycle status of a session.
   * @param sid Session identifier.
   * @returns Current status — may be stale by a few ms.
   */
  abstract status(sid: string): Promise<SessionStatus>;

  /** @purpose Keep a live server session idle and eligible for same-session continuation. */
  abstract park(sid: string): Promise<void>;

  /** @purpose Resume a previously parked live server session. */
  abstract resume(sid: string): Promise<boolean>;

  /** @purpose Return the complete message history used by tool-trace and continuation checks. */
  abstract messages(sid: string): Promise<OpenCodeMessage[]>;

  /**
   * @purpose Retrieve tool-call telemetry accumulated during the session's last agent turn —
   * which files were opened/grepped, as fact rather than agent self-report.
   * @invariant Default: empty array. Adapters exposing telemetry override. Not abstract — keeps
   * pre-existing implementers compiling; telemetry is additive.
   * @param sid Session identifier.
   * @returns Ordered tool-call log for `ArtifactValidator` cross-check; empty when unavailable.
   */
  async toolCalls(_sid: string): Promise<ToolCall[]> {
    return [];
  }

  /**
   * @purpose Retrieve per-tool call-count and duration telemetry for a session — localizes
   * slowness to a specific tool (e.g. bash over-calling) rather than only per-node.
   * @invariant Default: empty array. Adapters exposing telemetry override. Not abstract — keeps
   * pre-existing implementers compiling; telemetry is additive.
   * @param sid Session identifier.
   * @returns Per-tool stats sorted by totalMs descending; empty when unavailable.
   */
  async toolCallStats(_sid: string): Promise<ToolCallStat[]> {
    return [];
  }

  /**
   * @purpose Retrieve the ordered tool-call trace (name + input) for a session — the raw sequence
   * for classifying each call as deterministic-precomputable vs needs-agent.
   * @invariant Default: empty array. Adapters exposing telemetry override. Not abstract — keeps
   * pre-existing implementers compiling; telemetry is additive.
   * @param sid Session identifier.
   * @returns Tool calls in session order; empty when unavailable.
   */
  async toolCallTrace(_sid: string): Promise<ToolTraceEntry[]> {
    return [];
  }

  /**
   * @purpose Send a continuation signal to a session that hit an error — semantically the
   * same as prompt but signals intent to recover, not start.
   * @param sid Session identifier.
   * @param opts Remediation prompt — system message, user text, and optional format.
   * @returns Discriminated result.
   */
  abstract continueSignal(sid: string, opts: PromptOpts): Promise<OpenCodeCallResult>;

  /**
   * @purpose Abort an in-flight prompt and transition the session to 'terminated'.
   * @param sid Session identifier.
   * @sideEffect Session state transition: running/idle → terminated.
   */
  abstract abort(sid: string): Promise<void>;

  /**
   * @purpose Close the session and release all resources — session is unreachable afterward.
   * @param sid Session identifier.
   * @sideEffect Session state transition to 'terminated' if not already; resource release.
   */
  abstract close(sid: string): Promise<void>;

  /** @purpose Reject incomplete provenance before any adapter side effect occurs. */
  protected _assertRuntimeRequest(request: AgentRuntimeRequest): void {
    if (!request.sessionId || !request.taskId || !request.model) {
      throw new Error('[AgentRuntimePort#run] Attribution fields must be non-empty');
    }
    if (!request.prompt.system && !request.prompt.text) {
      throw new Error('[AgentRuntimePort#run] Prompt must contain system or text');
    }
  }

  /** @purpose Attach provenance, retry policy and factual trace to one legacy adapter outcome. */
  protected async _attributeRuntimeResult(
    request: AgentRuntimeRequest,
    result: OpenCodeCallResult
  ): Promise<AgentRuntimeResult> {
    const trace = await this.toolCallTrace(request.sessionId);
    const attribution: AgentRuntimeAttribution = {
      sessionId: request.sessionId,
      taskId: request.taskId,
      model: request.model,
    };
    if (result.ok && request.prompt.format) {
      const mismatchedFields = validateAgentSchema(request.prompt.format.schema, result.output);
      if (mismatchedFields.length > 0) {
        return {
          ...attribution,
          ok: false,
          outcome: 'SCHEMA_MISMATCH',
          signal: `Output does not match expected schema: ${mismatchedFields.join('; ')}`,
          raw: JSON.stringify(result.output),
          retry: { retryable: true, action: 'continue' },
          trace,
        };
      }
    }
    if (result.ok) return { ...attribution, ok: true, output: result.output, trace };

    const outcome = result.error.class === 'OK' ? 'PARSE_ERROR' : result.error.class;
    const retry =
      outcome === 'SESSION_ERROR' || outcome === 'TIMEOUT'
        ? { retryable: true, action: 'fresh_run' as const }
        : { retryable: true, action: 'continue' as const };
    return {
      ...attribution,
      ok: false,
      outcome,
      signal: result.error.signal ?? `Agent runtime returned ${outcome}`,
      raw: result.error.raw,
      retry,
      trace,
    };
  }
}

/** @purpose Legacy name for the same AgentRuntimePort hierarchy during consumer migration. */
export { AgentRuntimePort as OpenCodePort };
