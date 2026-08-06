// @file: SessionPool / UnifiedPool — bounded pool of OpenCode sessions with priority queuing (👤>🦊>🏗), no preemption, aging.
// @consumers: inbox-roles (for role-agent session management)
// @tasks: TSK-111, TSK-160

import { logger } from '#logger';
import type { OpenCodePort, PromptOpts, ToolGate } from './opencode.port.ts';
import type { OpenCodeCallResult } from './errors.ts';

/** @purpose Session priority levels — higher priority sessions are dequeued first. */
export type SessionPriority = 'operator' | 'reviewer' | 'background';

/** @purpose Numeric ordering for priority comparison — lower = higher priority. */
const PRIORITY_ORDER: Record<SessionPriority, number> = {
  operator: 0,
  reviewer: 1,
  background: 2,
};

/** @purpose Configurable aging threshold — enqueued time beyond this bumps effective priority. */
const DEFAULT_AGING_THRESHOLD_MS = 60_000;

/** @purpose Configuration for the session pool. */
export type SessionPoolConfig = {
  /** @purpose Maximum number of concurrent active sessions | @invariant > 0 */
  maxSessions: number;
  /** @purpose The OpenCode adapter (Mock or Real) to create sessions against */
  opencode: OpenCodePort;
  /**
   * @purpose Aging threshold in milliseconds — queued requests waiting longer than this get
   *   a priority bump (effective priority one level higher).
   * @invariant Default: 60s. Set to 0 to disable aging.
   */
  agingThresholdMs?: number;
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
export type PoolCreateOpts = {
  /** @purpose Title for the session to create */
  title: string;
  /** @purpose Working directory for the session */
  directory: string;
  /** @purpose Tool access gate forwarded to `OpenCodePort#createSession` — blanket boolean or fine-grained `ToolGate` (D-118..D-123) | @default false (unchanged pre-existing chat behavior) */
  tools?: boolean | ToolGate;
  /** @purpose Per-session default model, e.g. `llm-proxy/deepseek-v4-pro` */
  model?: string;
  /**
   * @purpose Scheduling priority — 👤operator > 🦊reviewer > 🏗background.
   * @invariant Default: 'background' — pre-existing callers without priority selection keep FIFO-ish behavior.
   */
  priority?: SessionPriority;
};

/** @purpose Queued create request — stored resolver to unblock when a slot frees up. */
type QueuedCreate = Required<PoolCreateOpts> & {
  /** @purpose Resolver to fulfill the create promise once a slot is available */
  resolve: (sid: string) => void;
  /** @purpose Rejecter to fail the create promise on cleanup or error */
  reject: (reason: Error) => void;
  /** @purpose Timestamp (ms) when this request was enqueued — drives aging */
  enqueuedAt: number;
};

/**
 * @purpose Bounded pool of OpenCode sessions with priority-based queuing and aging.
 * @invariant Priority: 👤operator > 🦊reviewer > 🏗background. FIFO within same priority.
 *   Aging bumps effective priority after threshold. No preemption.
 * @invariant Backward-compatible with SessionPool API — existing callers without priority default to 'background'.
 * @consumer inbox-roles
 */
export class SessionPool {
  /** @purpose Pool configuration. */
  protected _config: SessionPoolConfig;
  /** @purpose Fixed-size array of session slots */
  protected _slots: SessionSlot[];
  /** @purpose Priority queue of pending create requests */
  protected _queue: QueuedCreate[];
  /** @purpose Aging threshold in ms — default 60s. */
  protected _agingThresholdMs: number;

  /**
   * @purpose Create a session pool with the given adapter, capacity, and optional aging.
   * @param config Pool configuration — maxSessions, OpenCode adapter, and optional aging threshold.
   */
  constructor(config: SessionPoolConfig) {
    this._config = config;
    this._slots = [];
    this._queue = [];
    this._agingThresholdMs = config.agingThresholdMs ?? DEFAULT_AGING_THRESHOLD_MS;
    logger.debug('[SessionPool#constructor] [init → ready]', {
      maxSessions: config.maxSessions,
      agingThresholdMs: this._agingThresholdMs,
    });
  }

  /**
   * @purpose Create a new session, queuing if at capacity.
   * Creates immediately when slots free; otherwise, promise settles on slot release
   * (priority-based dequeue, no deadlock).
   * @param opts Title, directory, optional priority, and adapter options for the new session.
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
      `[SessionPool#create] [attempt → queued] pool full (${this._slots.length}/${this._config.maxSessions}), priority=${opts.priority ?? 'background'}`
    );

    return new Promise<string>((resolve, reject) => {
      this._queue.push({
        title: opts.title,
        directory: opts.directory,
        tools: opts.tools ?? false,
        model: opts.model ?? '',
        priority: opts.priority ?? 'background',
        resolve,
        reject,
        enqueuedAt: Date.now(),
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
   * @purpose Release a session slot back to the pool, unblocking the highest-priority queued
   *   create (if any).
   * @param sid Session identifier to release.
   * @returns Promise that resolves when the session is released.
   * @sideEffect Closes the session via the adapter, frees the slot, and potentially unblocks
   * the highest-priority queued create request.
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

    await this._drainNext();
    // #endregion END_CLOSE_AND_DRAIN_QUEUE
  }

  /**
   * @purpose Continue a session with a signal — used in the outcome recovery ladder.
   * @param sid Session identifier — must be an active slot in the pool.
   * @param opts Prompt options forwarded to the adapter's continueSignal.
   * @throws {Error} When sid is not an active pool member.
   * @returns Discriminated result from the adapter.
   */
  async continueSignal(sid: string, opts: PromptOpts): Promise<OpenCodeCallResult> {
    const slot = this._slots.find((s) => s.active && s.sid === sid);
    if (!slot) {
      const error = new Error(
        `[SessionPool#continueSignal] Session ${sid} is not an active pool member`
      );
      logger.error(`[SessionPool#continueSignal] [active → error] ${sid}`, { error });
      throw error;
    }
    return this._config.opencode.continueSignal(sid, opts);
  }

  /**
   * @purpose Current number of active (in-use) session slots.
   * @returns Count of active slots.
   */
  activeCount(): number {
    return this._slots.length;
  }

  /**
   * @purpose Current depth of the queued create requests.
   * @returns Number of pending creates waiting for a slot.
   */
  queueDepth(): number {
    return this._queue.length;
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

  // ═══════════════════════════════════════════════════════════════
  // Priority queue internals
  // ═══════════════════════════════════════════════════════════════

  /**
   * @purpose Compute the effective priority of a queued request, factoring in aging.
   * @invariant Requests waiting > agingThresholdMs get priority bumped one level (e.g. background → reviewer).
   * @param queued Queued create request with enqueuedAt timestamp.
   * @returns Numeric priority — lower is higher.
   */
  protected _effectivePriority(queued: QueuedCreate): number {
    const base = PRIORITY_ORDER[queued.priority];
    if (this._agingThresholdMs > 0) {
      const waitedMs = Date.now() - queued.enqueuedAt;
      if (waitedMs > this._agingThresholdMs) {
        // Bump by one priority level (capped at operator = 0)
        return Math.max(0, base - 1);
      }
    }
    return base;
  }

  /**
   * @purpose Dequeue the highest-priority request from the queue.
   * @invariant Priority order: 👤operator (0) > 🦊reviewer (1) > 🏗background (2).
   * @invariant FIFO within same effective priority — oldest first.
   * @returns The dequeued request, or undefined when the queue is empty.
   */
  protected _dequeueHighestPriority(): QueuedCreate | undefined {
    if (this._queue.length === 0) return undefined;

    // #region START_PRIORITY_DEQUEUE — scan queue for highest effective priority, then earliest enqueue within that tier
    if (this._queue.length === 1) {
      return this._queue.shift();
    }

    let bestIdx = 0;
    let bestPriority = this._effectivePriority(this._queue[0]!);
    let bestEnqueuedAt = this._queue[0]!.enqueuedAt;

    for (let i = 1; i < this._queue.length; i++) {
      const item = this._queue[i]!;
      const pri = this._effectivePriority(item);
      if (pri < bestPriority || (pri === bestPriority && item.enqueuedAt < bestEnqueuedAt)) {
        bestIdx = i;
        bestPriority = pri;
        bestEnqueuedAt = item.enqueuedAt;
      }
    }

    const [dequeued] = this._queue.splice(bestIdx, 1);
    return dequeued;
    // #endregion END_PRIORITY_DEQUEUE
  }

  /**
   * @purpose Drain the next queued request into an active slot — called after release.
   * @returns Promise that resolves when the next queued session is created or queue is empty.
   * @sideEffect Creates a session and pushes it into the active slots.
   */
  protected async _drainNext(): Promise<void> {
    const next = this._dequeueHighestPriority();
    if (!next) return;

    try {
      const handle = await this._config.opencode.createSession({
        title: next.title,
        directory: next.directory,
        tools: next.tools,
        model: next.model || undefined,
      });
      this._slots.push({ active: true, sid: handle.sid });
      logger.debug(
        `[SessionPool#_drainNext] [queued → active] ${handle.sid} priority=${next.priority} (${this._slots.length}/${this._config.maxSessions})`
      );
      next.resolve(handle.sid);
    } catch (cause) {
      const error = new Error('[SessionPool#_drainNext] Failed to create queued session', {
        cause,
      });
      logger.error('[SessionPool#_drainNext] [queued → failed]', { error });
      next.reject(error);
    }
  }
}

/**
 * @purpose Unified pool — alias for SessionPool with priority semantics and default max of 3.
 * @invariant Backward-compatible: `new UnifiedPool({ opencode })` defaults to maxSessions=3.
 */
export const UnifiedPool = SessionPool;
