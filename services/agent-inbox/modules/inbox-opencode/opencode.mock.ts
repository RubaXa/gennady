// @file: OpenCodeMock — deterministic adapter simulating ALL outcome classes for dev/e2e testing.
// @consumers: SessionPool (dev/e2e), inbox-opencode tests, inbox-roles tests
// @tasks: TSK-111

import { logger } from '#logger';
import {
  OpenCodePort,
  type SessionHandle,
  type CreateSessionOpts,
  type PromptOpts,
} from './opencode.port.ts';
import { composeOk, composeError, type OpenCodeCallResult, type OutcomeClass } from './errors.ts';

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
  /** @purpose Active sessions store — sid → SessionHandle */
  protected _sessions: Map<string, SessionHandle>;
  /** @purpose Counter for unique session id generation */
  protected _sidCounter: number;

  /**
   * @purpose Create an empty mock — call seed()/seedError() before use.
   */
  constructor() {
    super();
    this._responses = new Map();
    this._errors = new Map();
    this._sessions = new Map();
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
   * @param opts Session title and directory.
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
    logger.debug(`[OpenCodeMock#createSession] [idle → created] ${sid} "${opts.title}"`);
    return handle;
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
    const nodeId = this._extractNodeId(opts);

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
    const nodeId = this._extractNodeId(opts);
    const response = this._responses.get(nodeId);

    if (response) {
      session.status = 'completed';
      logger.debug(`[OpenCodeMock#continueSignal] [error → completed] ${sid} node=${nodeId}`);
      return composeOk(response);
    }

    session.status = 'error';
    logger.debug(`[OpenCodeMock#continueSignal] [error → no_recovery] ${sid} node=${nodeId}`);
    return composeError('NO_RESULT', `No seeded recovery data for node "${nodeId}"`);
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
   * @param _opts Prompt options for error context.
   * @returns Error call result with ok: false.
   */
  protected _buildErrorFromClass(
    errorClass: OutcomeClass,
    nodeId: string,
    _opts: PromptOpts
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

      case 'TIMEOUT':
        return composeError('TIMEOUT', `Prompt for node "${nodeId}" timed out after 30s`);

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
