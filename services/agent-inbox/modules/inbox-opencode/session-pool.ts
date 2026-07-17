// @file: SessionPool — bounded pool of OpenCode sessions with queuing, reuse, and cleanup.
// @consumers: inbox-roles (for role-agent session management)
// @tasks: TSK-111

import { logger } from '#logger';
import type { OpenCodePort, PromptOpts, ToolGate } from './opencode.port.ts';
import type { OpenCodeCallResult } from './errors.ts';

/** @purpose Configuration for the session pool. */
export type SessionPoolConfig = {
  /** @purpose Maximum number of concurrent active sessions | @invariant > 0 */
  maxSessions: number;
  /** @purpose The OpenCode adapter (Mock or Real) to create sessions against */
  opencode: OpenCodePort;
};

/** @purpose Internal slot tracking an active session within the pool. */
type SessionSlot = {
  /** @purpose Whether this slot is currently in use */
  active: boolean;
  /** @purpose Session identifier from the adapter */
  sid: string;
};

/** @purpose Options for `SessionPool#create` — title/directory plus the tools/model gates
 *   `OpenCodePort#createSession` accepts, so pooled callers get the same per-session controls as a direct call. */
type PoolCreateOpts = {
  /** @purpose Title for the session to create */
  title: string;
  /** @purpose Working directory for the session */
  directory: string;
  /** @purpose Tool access gate forwarded to `OpenCodePort#createSession` — blanket boolean or fine-grained `ToolGate` (D-118..D-123) | @default false (unchanged pre-existing chat behavior) */
  tools?: boolean | ToolGate;
  /** @purpose Per-session default model, e.g. `llm-proxy/deepseek-v4-pro` */
  model?: string;
};

/** @purpose Queued create request — stored resolver to unblock when a slot frees up. */
type QueuedCreate = PoolCreateOpts & {
  /** @purpose Resolver to fulfill the create promise once a slot is available */
  resolve: (sid: string) => void;
  /** @purpose Rejecter to fail the create promise on cleanup or error */
  reject: (reason: Error) => void;
};

/**
 * @purpose Bounded pool of OpenCode sessions with fair FIFO queuing.
 * @invariant Queue invariant: when pool is full, new create() calls are queued FIFO
 * without deadlock — each request resolves as slots free up.
 * @invariant Per-role × number of roles may exceed maxSessions — queue guarantees forward progress.
 * @consumer inbox-roles
 */
export class SessionPool {
  /** @purpose Pool configuration. */
  protected _config: SessionPoolConfig;
  /** @purpose Fixed-size array of session slots */
  protected _slots: SessionSlot[];
  /** @purpose FIFO queue of pending create requests */
  protected _queue: QueuedCreate[];

  /**
   * @purpose Create a session pool with the given adapter and capacity.
   * @param config Pool configuration — maxSessions and OpenCode adapter.
   */
  constructor(config: SessionPoolConfig) {
    this._config = config;
    this._slots = [];
    this._queue = [];
    logger.debug(`[SessionPool] [init → ready] maxSessions=${config.maxSessions}`);
  }

  /**
   * @purpose Create a new session, queuing if at capacity.
   * Creates immediately when slots free; otherwise, promise settles on slot release (FIFO, no deadlock).
   * @param opts Title and directory for the new session.
   * @returns Session identifier (sid) from the adapter.
   */
  async create(opts: PoolCreateOpts): Promise<string> {
    // #region START_IMMEDIATE_CREATE — if a slot is free, create the session right away
    if (this._slots.length < this._config.maxSessions) {
      const handle = await this._config.opencode.createSession(opts);
      this._slots.push({ active: true, sid: handle.sid });
      logger.debug(
        `[SessionPool#create] [queued → active] ${handle.sid} (${this._slots.length}/${this._config.maxSessions})`
      );
      return handle.sid;
    }
    // #endregion END_IMMEDIATE_CREATE

    // #region START_QUEUED_CREATE — at capacity, enqueue and await slot availability
    logger.debug(
      `[SessionPool#create] [attempt → queued] pool full (${this._slots.length}/${this._config.maxSessions})`
    );

    return new Promise<string>((resolve, reject) => {
      this._queue.push({
        title: opts.title,
        directory: opts.directory,
        tools: opts.tools,
        model: opts.model,
        resolve,
        reject,
      });
    });
    // #endregion END_QUEUED_CREATE
  }

  /**
   * @purpose Send a prompt through a pooled session.
   * @param sid Session identifier — must be an active slot in the pool.
   * @param opts Prompt options forwarded to the adapter.
   * @throws {Error} When sid is not an active pool member.
   * @returns Discriminated result from the adapter.
   */
  async prompt(sid: string, opts: PromptOpts): Promise<OpenCodeCallResult> {
    const slot = this._slots.find((s) => s.active && s.sid === sid);
    if (!slot) {
      const error = new Error(`[SessionPool#prompt] Session ${sid} is not an active pool member`);
      logger.error(`[SessionPool#prompt] [active → error] ${sid}`, { error });
      throw error;
    }
    return this._config.opencode.prompt(sid, opts);
  }

  /**
   * @purpose Release a session slot back to the pool, unblocking the next queued create (if any).
   * @param sid Session identifier to release.
   * @returns Promise that resolves when the session is released.
   * @sideEffect Closes the session via the adapter, frees the slot, and potentially unblocks
   * the oldest queued create request.
   */
  async release(sid: string): Promise<void> {
    const idx = this._slots.findIndex((s) => s.active && s.sid === sid);
    if (idx === -1) {
      logger.debug(`[SessionPool#release] [active → skip] ${sid} not found in active slots`);
      return;
    }

    // #region START_CLOSE_AND_DRAIN_QUEUE — close the session, free the slot, unblock next queued request
    try {
      await this._config.opencode.close(sid);
    } catch (cause) {
      logger.error(`[SessionPool#release] [active → close_failed] ${sid}`, {
        error: new Error('[SessionPool#release] Close failed for session', { cause }),
      });
    }

    this._slots.splice(idx, 1);
    logger.debug(
      `[SessionPool#release] [active → released] ${sid} (${this._slots.length}/${this._config.maxSessions})`
    );

    // Process next queued request, if any
    const next = this._queue.shift();
    if (next) {
      // Create asynchronously — do not block the release caller
      this._config.opencode
        .createSession({
          title: next.title,
          directory: next.directory,
          tools: next.tools,
          model: next.model,
        })
        .then((handle) => {
          this._slots.push({ active: true, sid: handle.sid });
          logger.debug(
            `[SessionPool#release] [queued → active] ${handle.sid} (${this._slots.length}/${this._config.maxSessions})`
          );
          next.resolve(handle.sid);
        })
        .catch((cause: unknown) => {
          const error = new Error('[SessionPool#release] Failed to create queued session', {
            cause,
          });
          logger.error(`[SessionPool#release] [queued → failed]`, { error });
          next.reject(error);
        });
    }
    // #endregion END_CLOSE_AND_DRAIN_QUEUE
  }

  /**
   * @purpose Current number of active (in-use) session slots.
   * @returns Count of active slots.
   */
  activeCount(): number {
    return this._slots.length;
  }

  /**
   * @purpose Force-cleanup: close all active sessions, drain the queue, reset to empty.
   * @returns Promise that resolves when all sessions are cleaned up.
   * @sideEffect Closes all adapter sessions, rejects all queued requests, clears internal state.
   */
  async cleanup(): Promise<void> {
    logger.debug(
      `[SessionPool#cleanup] [active → draining] ${this._slots.length} active, ${this._queue.length} queued`
    );

    // #region START_DRAIN_QUEUE — reject all pending create requests
    for (const queued of this._queue) {
      queued.reject(
        new Error('[SessionPool#cleanup] Pool is being cleaned up — create request cancelled')
      );
    }
    this._queue = [];
    // #endregion END_DRAIN_QUEUE

    // #region START_CLOSE_ALL — close every active session (best-effort)
    const closePromises = this._slots.map(async (slot) => {
      try {
        await this._config.opencode.close(slot.sid);
      } catch (cause) {
        logger.error(`[SessionPool#cleanup] [draining → close_failed] ${slot.sid}`, {
          error: new Error('[SessionPool#cleanup] Close failed', { cause }),
        });
      }
    });
    await Promise.allSettled(closePromises);
    // #endregion END_CLOSE_ALL

    this._slots = [];
    logger.debug('[SessionPool#cleanup] [draining → idle] pool empty');
  }
}
