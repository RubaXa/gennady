// @file: SessionLifecycle — park/resume/close, idle-TTL (default 45min), session state machine.
// @consumers: inbox-opencode (UnifiedPool)
// @tasks: TSK-160

import { logger } from '#logger';
import type { EventJournal } from '../inbox-core/event-journal.ts';
import type { SessionRegistry } from './session-registry.ts';
import type { OpenCodePort } from './opencode.port.ts';

/** @purpose Lifecycle states a session traverses — idle → work → park → close. */
export type SessionState = 'idle' | 'work' | 'park' | 'close';

/** @purpose Configuration for the session lifecycle — TTL and journal binding. */
export type SessionLifecycleConfig = {
  /**
   * @purpose Parked session TTL in milliseconds | @invariant Default 45 minutes — sessions parked
   *   longer are closed by reapExpired().
   */
  idleTtlMs?: number;
  /**
   * @purpose Releases the pool capacity for a session terminally closed by this lifecycle.
   * @param sessionId Terminally closed server session identifier.
   * @returns Completion once shared pool capacity is reconciled.
   */
  onClosed?: (sessionId: string) => void | Promise<void>;
};

const DEFAULT_IDLE_TTL_MS = 45 * 60 * 1000;

/**
 * @purpose Manages the lifecycle state machine for opencode sessions: park/resume/close with
 *   configurable idle TTL.
 * @invariant State transitions are logged through the EventJournal.
 * @invariant reapExpired() closes parked sessions exceeding TTL — call periodically.
 * @invariant resume() within TTL returns true; expired → false and the session is closed.
 */
export class SessionLifecycle {
  /** @purpose Session registry for state lookups and mutations. */
  protected _registry: SessionRegistry;
  /** @purpose Event journal for lifecycle event logging. */
  protected _journal: EventJournal;
  /** @purpose Idle TTL in milliseconds — parked sessions older than this are reaped. */
  protected _ttlMs: number;
  /** @purpose Live adapter bound by bootstrap; absent only in isolated legacy unit tests. */
  protected _opencode: OpenCodePort | undefined;
  /** @purpose Callback into the shared pool so TTL close cannot leave a stale occupied slot. */
  protected _onClosed: ((sessionId: string) => void | Promise<void>) | undefined;

  /**
   * @purpose Create a session lifecycle manager bound to a registry and journal.
   * @param registry Session registry for state storage.
   * @param journal Event journal for lifecycle event logging.
   * @param [opencode] Live adapter to park, resume, and close the actual server session.
   * @param [config] Optional TTL override — defaults to 45 minutes.
   */
  constructor(
    registry: SessionRegistry,
    journal: EventJournal,
    opencode?: OpenCodePort,
    config?: SessionLifecycleConfig
  ) {
    this._registry = registry;
    this._journal = journal;
    this._opencode = opencode;
    this._ttlMs = config?.idleTtlMs ?? DEFAULT_IDLE_TTL_MS;
    this._onClosed = config?.onClosed;
    logger.debug('[SessionLifecycle#constructor] [init → ready]', { ttlMs: this._ttlMs });
  }

  /**
   * @purpose Transition a session from idle to work — signals active processing.
   * @param sessionId Session identifier.
   */
  startWork(sessionId: string): void {
    const entry = this._registry.lookup(sessionId);
    if (!entry) {
      logger.debug('[SessionLifecycle#startWork] [working → not_found]', { sessionId });
      return;
    }
    entry.state = 'work';
    void this._journal.append({
      ts: new Date().toISOString(),
      mr: entry.mr,
      kind: 'task_status',
      actor: 'inbox-opencode',
      payload: { sessionId, transition: 'idle→work' },
    });
    logger.info('[SessionLifecycle#startWork] [idle → work]', { sessionId });
  }

  /**
   * @purpose Park an active session — it remains eligible for resume within TTL.
   * @param sessionId Session identifier.
   * @returns Promise that resolves when parkedAt is recorded and journal entry written.
   */
  async park(sessionId: string): Promise<void> {
    const entry = this._registry.lookup(sessionId);
    if (!entry) {
      logger.debug('[SessionLifecycle#park] [parking → not_found]', { sessionId });
      return;
    }
    await this._opencode?.park(sessionId);
    entry.state = 'park';
    entry.parkedAt = new Date().toISOString();
    const seq = await this._journal.append({
      ts: new Date().toISOString(),
      mr: entry.mr,
      kind: 'task_status',
      actor: 'inbox-opencode',
      payload: { sessionId, transition: 'work→park', parkedAt: entry.parkedAt },
    });
    logger.info('[SessionLifecycle#park] [work → park]', {
      sessionId,
      parkedAt: entry.parkedAt,
      seq,
    });
  }

  /**
   * @purpose Resume a parked session if within TTL — returns false if expired or missing.
   * @invariant Expired sessions are immediately closed — caller should create a new session.
   * @param sessionId Session identifier.
   * @returns true when the session was successfully resumed; false otherwise.
   */
  async resume(sessionId: string): Promise<boolean> {
    const entry = this._registry.lookup(sessionId);
    if (!entry) {
      logger.debug('[SessionLifecycle#resume] [resuming → not_found]', { sessionId });
      return false;
    }

    // #region START_CHECK_PARK_STATE — only parked sessions can be resumed
    if (entry.state !== 'park') {
      logger.debug('[SessionLifecycle#resume] [resuming → wrong_state]', {
        sessionId,
        state: entry.state,
      });
      return false;
    }
    // #endregion END_CHECK_PARK_STATE

    // #region START_CHECK_TTL — expired → close, not expired → resume
    if (entry.parkedAt) {
      const parkedMs = Date.now() - new Date(entry.parkedAt).getTime();
      if (parkedMs > this._ttlMs) {
        logger.info('[SessionLifecycle#resume] [park → expired]', {
          sessionId,
          parkedMs,
          ttlMs: this._ttlMs,
        });
        await this.close(sessionId);
        return false;
      }
    }
    // #endregion END_CHECK_TTL

    if (this._opencode && !(await this._opencode.resume(sessionId))) {
      logger.info('[SessionLifecycle#resume] [park → unavailable]', { sessionId });
      await this.close(sessionId);
      return false;
    }
    entry.state = 'work';
    entry.parkedAt = undefined;
    await this._journal.append({
      ts: new Date().toISOString(),
      mr: entry.mr,
      kind: 'task_status',
      actor: 'inbox-opencode',
      payload: { sessionId, transition: 'park→work' },
    });
    logger.info('[SessionLifecycle#resume] [park → work]', { sessionId });
    return true;
  }

  /**
   * @purpose Permanently close a session and clear its routing entry after durable journaling.
   * @param sessionId Session identifier.
   * @returns Promise that resolves when the close is journaled.
   */
  async close(sessionId: string): Promise<void> {
    const entry = this._registry.lookup(sessionId);
    if (!entry) {
      logger.debug('[SessionLifecycle#close] [closing → not_found]', { sessionId });
      return;
    }
    const prevState = entry.state;
    entry.state = 'close';
    await this._opencode?.close(sessionId);
    const seq = await this._journal.append({
      ts: new Date().toISOString(),
      mr: entry.mr,
      kind: 'task_status',
      actor: 'inbox-opencode',
      payload: { sessionId, transition: `${prevState}→close` },
    });
    logger.info('[SessionLifecycle#close] [close]', { sessionId, prevState, seq });
    this._registry.remove(sessionId);
    await this._onClosed?.(sessionId);
  }

  /**
   * @purpose Reap expired parked sessions — closes every parked session older than TTL.
   * @returns Array of session IDs that were closed.
   */
  async reapExpired(): Promise<string[]> {
    const parked = this._registry.listByState('park');
    const now = Date.now();
    const expired: string[] = [];

    // #region START_SCAN_EXPIRED — iterate parked sessions, close those exceeding TTL
    for (const entry of parked) {
      if (entry.parkedAt) {
        const parkedMs = now - new Date(entry.parkedAt).getTime();
        if (parkedMs > this._ttlMs) {
          await this.close(entry.sessionId);
          expired.push(entry.sessionId);
        }
      }
    }
    // #endregion END_SCAN_EXPIRED

    if (expired.length > 0) {
      logger.info('[SessionLifecycle#reapExpired] [tick → reaped]', {
        count: expired.length,
        sessionIds: expired,
      });
    }
    return expired;
  }

  /**
   * @purpose Query the current lifecycle state of a session.
   * @param sessionId Session identifier.
   * @returns Current state, or 'close' when the session is not registered.
   */
  stateOf(sessionId: string): SessionState {
    return this._registry.lookup(sessionId)?.state ?? 'close';
  }
}
