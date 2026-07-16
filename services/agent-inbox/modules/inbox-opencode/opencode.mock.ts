// @file: OpenCodeMock — deterministic adapter simulating ALL outcome classes for dev/e2e testing.
// @consumers: SessionPool (dev/e2e), inbox-opencode tests, inbox-roles tests
// @tasks: TSK-111

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { logger } from '#logger';
import {
  OpenCodePort,
  type SessionHandle,
  type CreateSessionOpts,
  type PromptOpts,
  type ToolCall,
  type ToolCallStat,
} from './opencode.port.ts';
import { composeOk, composeError, type OpenCodeCallResult, type OutcomeClass } from './errors.ts';

/**
 * @purpose Seeded side effect simulating the agent writing its JSON result to disk (TSK-127)
 *   instead of returning it as response text.
 * @invariant `file` is relative to the session's `directory` — mirrors the real file-write contract.
 */
export type WriteArtifactSeed = {
  /** @purpose Path to write, relative to the session directory */
  file: string;
  /** @purpose Raw file content (already-serialized JSON string) */
  content: string;
};

/** @purpose Fallback prompt-turn timeout (minutes) when the caller does not pass one | @invariant Kept at the historical 30s-equivalent so pre-migration callers see unchanged behavior */
const DEFAULT_PROMPT_TIMEOUT_MINUTES = 0.5;

/**
 * @purpose Deterministic in-memory OpenCode adapter that simulates every outcome class.
 * @implements {OpenCodePort} in ./opencode.port.ts
 * @invariant Pure in-memory: no network, no filesystem, no side effects outside internal state.
 * @invariant Returns exactly the seeded data or simulated error — no transformations.
 * @consumer DI container (replaces OpenCodeReal in dev/e2e)
 */
export class OpenCodeMock extends OpenCodePort {
  /** @purpose Map of nodeId → seeded OK response payload */
  protected _responses: Map<string, Record<string, unknown>>;
  /** @purpose Map of nodeId → seeded error class for forced-failure simulation */
  protected _errors: Map<string, OutcomeClass>;
  /** @purpose Map of nodeId → seeded tool-call telemetry for the simulated agent turn */
  protected _toolCalls: Map<string, ToolCall[]>;
  /** @purpose Map of nodeId → seeded per-tool call-count/duration stats for the simulated turn */
  protected _toolStats: Map<string, ToolCallStat[]>;
  /** @purpose Active sessions store — sid → SessionHandle */
  protected _sessions: Map<string, SessionHandle>;
  /** @purpose Map of sid → tools flag from createSession — gates whether toolCalls() reports telemetry */
  protected _sessionTools: Map<string, boolean>;
  /** @purpose Map of sid → last model seen (createSession default or per-prompt override), for per-phase-model tests to assert which model a node requested */
  protected _sessionModels: Map<string, string>;
  /** @purpose Map of sid → nodeId of the last prompt sent on that session, for toolCalls() correlation */
  protected _sessionLastNode: Map<string, string>;
  /** @purpose Counter for unique session id generation */
  protected _sidCounter: number;

  /**
   * @purpose Create an empty mock — call seed()/seedError() before use.
   */
  constructor() {
    super();
    this._responses = new Map();
    this._errors = new Map();
    this._toolCalls = new Map();
    this._toolStats = new Map();
    this._sessions = new Map();
    this._sessionTools = new Map();
    this._sessionModels = new Map();
    this._sessionLastNode = new Map();
    this._sidCounter = 0;
  }

  /**
   * @purpose Seed a successful response for a given AI-node identifier.
   * @param nodeId The AI-node identifier (e.g. 'node_scaffold').
   * @param response The structured output payload to return on prompt.
   * @sideEffect Overwrites any previously seeded response or error for this nodeId.
   */
  seed(nodeId: string, response: Record<string, unknown>): void {
    this._responses.set(nodeId, response);
    this._errors.delete(nodeId);
  }

  /**
   * @purpose Seed a forced error of a given class for a given AI-node identifier.
   * @param nodeId The AI-node identifier.
   * @param errorClass Outcome class to simulate.
   * @sideEffect Overwrites any previously seeded response or error for this nodeId.
   */
  seedError(nodeId: string, errorClass: OutcomeClass): void {
    this._errors.set(nodeId, errorClass);
    this._responses.delete(nodeId);
  }

  /**
   * @purpose Seed the tool-call telemetry an agent turn would report for a given AI-node.
   * @param nodeId The AI-node identifier.
   * @param files File paths the simulated agent turn opens/greps, in order.
   * @sideEffect Overwrites any previously seeded tool-call log for this nodeId.
   */
  seedToolCalls(nodeId: string, files: string[]): void {
    this._toolCalls.set(
      nodeId,
      files.map((path) => ({ tool: 'read', path }))
    );
  }

  /**
   * @purpose Seed the per-tool call-count/duration stats an agent turn would report for a node.
   * @param nodeId The AI-node identifier.
   * @param stats Per-tool stats to return from toolCallStats() for this node's session.
   * @sideEffect Overwrites any previously seeded tool-call stats for this nodeId.
   */
  seedToolStats(nodeId: string, stats: ToolCallStat[]): void {
    this._toolStats.set(nodeId, stats);
  }

  /**
   * @param opts Session title, directory, and tools flag.
   * @returns Session handle with new sid.
   * @see {OpenCodePort#createSession}
   */
  async createSession(opts: CreateSessionOpts): Promise<SessionHandle> {
    const sid = `mock-session-${++this._sidCounter}`;
    const handle: SessionHandle = {
      sid,
      title: opts.title,
      directory: opts.directory,
      status: 'idle',
    };
    this._sessions.set(sid, handle);
    this._sessionTools.set(sid, opts.tools ?? false);
    if (opts.model) {
      this._sessionModels.set(sid, opts.model);
    }
    logger.debug(`[OpenCodeMock#createSession] [idle → created] ${sid} "${opts.title}"`);
    return handle;
  }

  /**
   * @purpose Read back the model recorded for a session — createSession default, or the most
   *   recent per-prompt override (TSK-perf per-phase model selection tests).
   * @param sid Session identifier.
   * @returns The last model string seen for this session, or undefined.
   */
  getSessionModel(sid: string): string | undefined {
    return this._sessionModels.get(sid);
  }

  /**
   * @param sid Session identifier.
   * @returns Seeded tool-call log for the session's last prompt, gated by its `tools` flag.
   * @see {OpenCodePort#toolCalls}
   */
  async toolCalls(sid: string): Promise<ToolCall[]> {
    if (!this._sessionTools.get(sid)) {
      return [];
    }
    const nodeId = this._sessionLastNode.get(sid);
    return nodeId ? (this._toolCalls.get(nodeId) ?? []) : [];
  }

  /**
   * @param sid Session identifier.
   * @returns Seeded per-tool stats for the session's last prompt, gated by its `tools` flag.
   * @see {OpenCodePort#toolCallStats}
   */
  async toolCallStats(sid: string): Promise<ToolCallStat[]> {
    if (!this._sessionTools.get(sid)) {
      return [];
    }
    const nodeId = this._sessionLastNode.get(sid);
    return nodeId ? (this._toolStats.get(nodeId) ?? []) : [];
  }

  /**
   * @param sid Session identifier.
   * @returns Session status string.
   * @see {OpenCodePort#status}
   */
  async status(sid: string): Promise<'idle' | 'running' | 'completed' | 'error' | 'terminated'> {
    const session = this._sessions.get(sid);
    return session ? session.status : 'terminated';
  }

  /**
   * @param sid Session identifier.
   * @returns Promise that resolves when the session is marked terminated.
   * @see {OpenCodePort#abort}
   */
  async abort(sid: string): Promise<void> {
    const session = this._sessions.get(sid);
    if (session && session.status !== 'terminated') {
      session.status = 'terminated';
      logger.debug(`[OpenCodeMock#abort] [running → terminated] ${sid}`);
    }
  }

  /**
   * @param sid Session identifier.
   * @returns Promise that resolves when the session is closed.
   * @see {OpenCodePort#close}
   */
  async close(sid: string): Promise<void> {
    const session = this._sessions.get(sid);
    if (session && session.status !== 'terminated') {
      session.status = 'terminated';
    }
    this._sessions.delete(sid);
    logger.debug(`[OpenCodeMock#close] [any → closed] ${sid}`);
  }

  // resolve seeded response or simulated error; fall back to NO_RESULT

  /**
   * @param sid Session identifier.
   * @param opts Prompt options forwarded to seeding logic.
   * @returns Discriminated result — either OK with payload or an error class.
   * @see {OpenCodePort#prompt}
   */
  async prompt(sid: string, opts: PromptOpts): Promise<OpenCodeCallResult> {
    const session = this._sessions.get(sid);
    if (!session || session.status === 'terminated') {
      return composeError('SESSION_ERROR', `Session ${sid} not found or already terminated`);
    }

    // #region START_RESOLVE_SEEDED_DATA — check error seeding first, then response seeding, then fallback
    const nodeId = this._resolveNodeId(session, opts);
    this._sessionLastNode.set(sid, nodeId);
    if (opts.model) {
      this._sessionModels.set(sid, opts.model);
    }

    // Priority 1: forced error per seedError()
    const errorClass = this._errors.get(nodeId);
    if (errorClass) {
      const result = this._buildErrorFromClass(errorClass, nodeId, opts);
      session.status = 'error';
      logger.debug(
        `[OpenCodeMock#prompt] [running → error] ${sid} node=${nodeId} class=${errorClass}`
      );
      return result;
    }

    // Priority 2: seeded OK response
    const response = this._responses.get(nodeId);
    if (response) {
      session.status = 'completed';
      const artifactAck = this._writeSeededArtifact(session, response);
      if (artifactAck) {
        logger.debug(`[OpenCodeMock#prompt] [running → wrote_artifact] ${sid} node=${nodeId}`);
        return artifactAck;
      }
      logger.debug(`[OpenCodeMock#prompt] [running → completed] ${sid} node=${nodeId}`);
      return composeOk(response);
    }

    // Priority 3: fallback — no data seeded, return NO_RESULT
    session.status = 'completed';
    logger.debug(`[OpenCodeMock#prompt] [running → no_result] ${sid} node=${nodeId}`);
    return composeError('NO_RESULT', `No seeded data for node "${nodeId}"`);
    // #endregion END_RESOLVE_SEEDED_DATA
  }

  /**
   * @param sid Session identifier.
   * @param opts Prompt options forwarded to seeding logic.
   * @returns Discriminated result — OK if seeded recovery exists, NO_RESULT otherwise.
   * @see {OpenCodePort#continueSignal}
   */
  async continueSignal(sid: string, opts: PromptOpts): Promise<OpenCodeCallResult> {
    const session = this._sessions.get(sid);
    if (!session || session.status === 'terminated') {
      return composeError('SESSION_ERROR', `Session ${sid} not found or already terminated`);
    }

    // continueSignal follows the same seeded-data path as prompt
    const nodeId = this._resolveNodeId(session, opts);
    this._sessionLastNode.set(sid, nodeId);
    const response = this._responses.get(nodeId);

    if (response) {
      session.status = 'completed';
      const artifactAck = this._writeSeededArtifact(session, response);
      if (artifactAck) {
        logger.debug(
          `[OpenCodeMock#continueSignal] [error → wrote_artifact] ${sid} node=${nodeId}`
        );
        return artifactAck;
      }
      logger.debug(`[OpenCodeMock#continueSignal] [error → completed] ${sid} node=${nodeId}`);
      return composeOk(response);
    }

    session.status = 'error';
    logger.debug(`[OpenCodeMock#continueSignal] [error → no_recovery] ${sid} node=${nodeId}`);
    return composeError('NO_RESULT', `No seeded recovery data for node "${nodeId}"`);
  }

  /**
   * @purpose Resolve the seeded lookup key — prefers the session's own `title` (= node/spec id)
   *   when seeded, else falls back to schema-title/text-prefix extraction.
   * @invariant Artifact nodes (TSK-127) carry no `format.schema.title` — title-based resolution
   *   keeps `seed(nodeId, { writeArtifact })` working without one.
   * @param session Session handle (`title` set at `createSession` time).
   * @param opts Prompt options — used only when the title itself isn't seeded.
   * @returns Stable node identifier string for `_responses`/`_errors` lookup.
   */
  protected _resolveNodeId(session: SessionHandle, opts: PromptOpts): string {
    if (this._responses.has(session.title) || this._errors.has(session.title)) {
      return session.title;
    }
    return this._extractNodeId(opts);
  }

  /**
   * @purpose Simulate the agent writing its JSON result to disk, when the seeded response carries
   *   a `writeArtifact` side effect (TSK-127 disk-artifact protocol).
   * @param session Session handle — `directory` is the write root.
   * @param response The seeded response object; only acted on when it has a `writeArtifact` shape.
   * @returns A one-line ack `OpenCodeCallResult`, or undefined when no artifact write was seeded.
   * @sideEffect FS: writes `writeArtifact.content` to `join(session.directory, writeArtifact.file)`.
   */
  protected _writeSeededArtifact(
    session: SessionHandle,
    response: Record<string, unknown>
  ): OpenCodeCallResult | undefined {
    const spec = response['writeArtifact'] as { file?: unknown; content?: unknown } | undefined;
    if (!spec || typeof spec.file !== 'string' || typeof spec.content !== 'string') {
      return undefined;
    }
    // Best-effort like PhaseTelemetry's own mkdir — an unwritable fixture directory (e.g. a
    // FakeStateStore stub path never meant to exist on disk) degrades to a missing-file outcome
    // downstream rather than crashing the simulated turn.
    try {
      const path = join(session.directory, spec.file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, spec.content);
    } catch (cause) {
      logger.warn('[OpenCodeMock#_writeSeededArtifact] [writing → degraded]', {
        directory: session.directory,
        file: spec.file,
        error: String(cause),
      });
    }
    return composeOk({ text: `Wrote result to ${spec.file}.` });
  }

  // derive a node identifier from prompt options for seeded lookup
  /**
   * @purpose Extract a stable node identifier from prompt options.
   * Uses format.schema title if present, otherwise falls back to text prefix.
   * @invariant Same input always yields the same nodeId — deterministic seeding.
   * @param opts Prompt options to extract nodeId from.
   * @returns Stable node identifier string.
   */
  protected _extractNodeId(opts: PromptOpts): string {
    // priority: schema title, then text prefix, then fallback
    const schemaTitle = opts.format?.schema?.title;
    if (typeof schemaTitle === 'string' && schemaTitle.length > 0) {
      return schemaTitle;
    }
    if (opts.text && opts.text.length > 0) {
      // use first word as fallback nodeId
      return opts.text.split(/\s+/)[0] ?? 'unknown';
    }
    return 'unknown';
  }

  // compose a realistic error result from an outcome class
  /**
   * @purpose Build a realistic OpenCodeCallResult error from an outcome class.
   * Each class produces a distinct signal and optional details for recovery ladder testing.
   * @param errorClass Outcome class to simulate.
   * @param nodeId AI-node identifier for error context.
   * @param opts Prompt options for error context — timeout (minutes) shapes the TIMEOUT signal.
   * @returns Error call result with ok: false.
   */
  protected _buildErrorFromClass(
    errorClass: OutcomeClass,
    nodeId: string,
    opts: PromptOpts
  ): OpenCodeCallResult & { ok: false } {
    switch (errorClass) {
      case 'NO_RESULT':
        return composeError('NO_RESULT', `AI-node "${nodeId}" returned empty response`);

      case 'PARSE_ERROR':
        return composeError(
          'PARSE_ERROR',
          `Failed to parse AI output for node "${nodeId}" — malformed JSON`,
          {
            raw: '{"broken": incomplete',
            position: { line: 1, column: 22 },
          }
        );

      case 'SCHEMA_MISMATCH':
        return composeError(
          'SCHEMA_MISMATCH',
          `Output for node "${nodeId}" does not match the expected schema`,
          {
            mismatchedFields: ['required_field_missing', 'type_mismatch_on_priority'],
            expected: { type: 'object', required: ['id', 'priority'] },
            received: { id: 'abc' },
          }
        );

      case 'SESSION_ERROR':
        return composeError(
          'SESSION_ERROR',
          `Session for node "${nodeId}" was terminated unexpectedly`
        );

      case 'TIMEOUT': {
        // timeout is expressed in minutes (agent turns are multi-step); fall back to the
        // historical 30s-equivalent default when the caller does not pass one, so
        // pre-migration callers observe unchanged wording.
        const timeoutLabel =
          opts.timeout != null ? `${opts.timeout} min` : `${DEFAULT_PROMPT_TIMEOUT_MINUTES * 60}s`;
        return composeError(
          'TIMEOUT',
          `Prompt for node "${nodeId}" timed out after ${timeoutLabel}`
        );
      }

      case 'INCOMPLETE_ARTIFACT':
        return composeError(
          'INCOMPLETE_ARTIFACT',
          `Output for node "${nodeId}" is missing the completion marker`,
          { marker: '<!-- END -->', contentLength: 1500 }
        );

      default:
        // All classes handled above; unreachable by type system
        return composeError('NO_RESULT', `Unknown error class for node "${nodeId}"`);
    }
  }
}
