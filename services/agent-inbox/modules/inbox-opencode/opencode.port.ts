// @file: OpenCodePort — abstraction over an OpenCode AI-node session for structured prompting.
// @consumers: SessionPool, inbox-roles, DI container
// @tasks: TSK-111

import type { OpenCodeCallResult } from './errors.ts';

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

/** @purpose Options for creating a new AI-node session. */
export type CreateSessionOpts = {
  /** @purpose Human-readable label for the session */
  title: string;
  /** @purpose Working directory — must exist, becomes the session cwd */
  directory: string;
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
};

/**
 * @purpose Abstraction over an OpenCode AI-node session for structured prompting.
 * @invariant Preconditions: system/text — non-empty string; directory — existing path.
 * @invariant Postconditions: success → structured output; failure → classified error with signal.
 * @invariant One session = one AI-node. After close() the session is unreachable.
 * @consumers SessionPool, inbox-roles
 */
export abstract class OpenCodePort {
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
}
