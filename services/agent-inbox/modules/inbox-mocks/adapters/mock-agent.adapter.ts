// @file: MockAgentAdapter — scripted deterministic agent runtime implementing AgentRuntimePort.
// @consumers: ReviewScenario, inbox-mocks test suite
// @tasks: TSK-180

import {
  AgentRuntimePort,
  type SessionHandle,
  type PromptOpts,
  type SessionStatus,
  type OpenCodeMessage,
} from '../../inbox-opencode/opencode.port.ts';
import type { OpenCodeCallResult } from '../../inbox-opencode/errors.ts';

/** @purpose One scripted prompt response popped in FIFO order per session queue. */
export type ScriptedPromptResponse = OpenCodeCallResult;

/** @purpose Per-session lifecycle and response queue. */
type MockSession = {
  sid: string;
  title: string;
  directory: string;
  status: SessionStatus;
  messages: OpenCodeMessage[];
  responses: ScriptedPromptResponse[];
};

/**
 * @purpose Scripted deterministic agent runtime for isolated scenario tests.
 * @implements {AgentRuntimePort} in ../../inbox-opencode/opencode.port.ts
 * @invariant prompt() pops from the FIFO response queue for the session — exhausted queue fails the scenario.
 * @invariant No network, process spawn, or production LLM access.
 */
export class MockAgentAdapter extends AgentRuntimePort {
  /** @purpose Active sessions keyed by session ID. */
  protected _sessions: Map<string, MockSession> = new Map();
  /** @purpose Monotonic session ID counter. */
  protected _nextSid = 0;

  /**
   * @purpose Pre-load scripted responses for one or more session IDs.
   * @param queues Map of sid → ordered response queue (FIFO pop on each prompt call).
   * @sideEffect Replaces response queues for the named sessions.
   */
  seedResponses(queues: Record<string, ScriptedPromptResponse[]>): void {
    for (const [sid, queue] of Object.entries(queues)) {
      const session = this._sessions.get(sid);
      if (session) {
        session.responses = [...queue];
      }
    }
  }

  /**
   * @see {AgentRuntimePort#createSession} in ../../inbox-opencode/opencode.port.ts
   * @param opts Session title and directory.
   * @returns Session handle with assigned sid and initial idle status.
   */
  async createSession(opts: { title: string; directory: string }): Promise<SessionHandle> {
    const sid = `mock-session-${this._nextSid++}`;
    const session: MockSession = {
      sid,
      title: opts.title,
      directory: opts.directory,
      status: 'idle',
      messages: [],
      responses: [],
    };
    this._sessions.set(sid, session);
    return { sid, title: opts.title, directory: opts.directory, status: 'idle' };
  }

  /**
   * @purpose Create a session with a pre-seeded response queue.
   * @param opts Session creation options.
   * @param responses Ordered prompt responses popped in FIFO order.
   * @returns Session handle with the pre-seeded queue active.
   */
  async createScriptedSession(
    opts: { title: string; directory: string },
    responses: ScriptedPromptResponse[]
  ): Promise<SessionHandle> {
    const handle = await this.createSession(opts);
    const session = this._sessions.get(handle.sid)!;
    session.responses = [...responses];
    return handle;
  }

  /**
   * @see {AgentRuntimePort#prompt} in ../../inbox-opencode/opencode.port.ts
   * @param sid Session identifier from createSession.
   * @param opts System message, user text, and optional format.
   * @throws {Error} When the response queue is exhausted — unspecified call.
   * @returns Scripted result popped from the FIFO response queue.
   */
  async prompt(sid: string, opts: PromptOpts): Promise<OpenCodeCallResult> {
    const session = this._resolveSession(sid);
    // #region START_POP_SCRIPTED_RESPONSE — invariant: exhausted queue is an unspecified call
    const response = session.responses.shift();
    if (!response) {
      throw new Error(
        `[MockAgentAdapter#prompt] Unspecified call — no scripted response for session ${sid}; seed before prompting`
      );
    }
    // #endregion END_POP_SCRIPTED_RESPONSE

    session.status = 'running';
    session.messages.push(
      { role: 'user', parts: [{ type: 'text', text: opts.text ?? opts.system ?? '' }] },
      {
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: response.ok ? JSON.stringify(response.output) : (response.error.signal ?? ''),
          },
        ],
      }
    );
    session.status = response.ok ? 'completed' : 'error';
    return response;
  }

  /**
   * @see {AgentRuntimePort#continueSignal} in ../../inbox-opencode/opencode.port.ts
   * @param sid Session identifier.
   * @param opts Remediation prompt.
   * @returns Scripted result from the same FIFO queue as prompt.
   */
  async continueSignal(sid: string, opts: PromptOpts): Promise<OpenCodeCallResult> {
    return this.prompt(sid, opts);
  }

  /**
   * @see {AgentRuntimePort#status} in ../../inbox-opencode/opencode.port.ts
   * @param sid Session identifier.
   * @returns Current session lifecycle status.
   */
  async status(sid: string): Promise<SessionStatus> {
    return this._resolveSession(sid).status;
  }

  /**
   * @see {AgentRuntimePort#park} in ../../inbox-opencode/opencode.port.ts
   * @param _sid Session identifier.
   * @returns Resolved immediately — park/resume are no-ops in the mock.
   */
  async park(_sid: string): Promise<void> {
    // no-op for mock — park/resume are lifecycle hints, not required for deterministic scenarios
  }

  /**
   * @see {AgentRuntimePort#resume} in ../../inbox-opencode/opencode.port.ts
   * @param _sid Session identifier.
   * @returns Always true — mock sessions are always resumable.
   */
  async resume(_sid: string): Promise<boolean> {
    return true;
  }

  /**
   * @see {AgentRuntimePort#messages} in ../../inbox-opencode/opencode.port.ts
   * @param sid Session identifier.
   * @returns All messages appended to this session in call order.
   */
  async messages(sid: string): Promise<OpenCodeMessage[]> {
    return [...this._resolveSession(sid).messages];
  }

  /**
   * @see {AgentRuntimePort#abort} in ../../inbox-opencode/opencode.port.ts
   * @param sid Session identifier.
   * @returns Resolved after session status is set to terminated.
   */
  async abort(sid: string): Promise<void> {
    this._resolveSession(sid).status = 'terminated';
  }

  /**
   * @see {AgentRuntimePort#close} in ../../inbox-opencode/opencode.port.ts
   * @param sid Session identifier.
   * @returns Resolved after session status is set to terminated.
   */
  async close(sid: string): Promise<void> {
    this._resolveSession(sid).status = 'terminated';
  }

  /**
   * @purpose Resolve a known session or fail the scenario for an unknown sid.
   * @param sid Session identifier to resolve.
   * @throws {Error} When the session was not created by this adapter instance.
   * @returns The live session record for the given sid.
   */
  protected _resolveSession(sid: string): MockSession {
    const session = this._sessions.get(sid);
    if (!session) {
      throw new Error(
        `[MockAgentAdapter#_resolveSession] Unknown session: ${sid} — createSession before use`
      );
    }
    return session;
  }
}
