// @file: SessionRegistry — sessionId ↔ {taskId, mr, artifacts[], model} in-memory store.
// @consumers: inbox-opencode (SessionLifecycle, UnifiedPool)
// @tasks: TSK-160

import { logger } from '#logger';

/** @purpose Session metadata stored in the registry — drives park/resume routing and artifact ownership. */
export type SessionEntry = {
  /** @purpose Unique session identifier from the opencode server */
  sessionId: string;
  /** @purpose Task identifier this session was created for */
  taskId: string;
  /** @purpose MR webUrl this session operates on */
  mr: string;
  /** @purpose Artifact paths produced during this session */
  artifacts: string[];
  /** @purpose Model used for this session (from CreateSessionOpts) | @invariant Absent when no model was explicitly selected */
  model?: string;
  /** @purpose Current lifecycle state — managed by SessionLifecycle */
  state: 'idle' | 'work' | 'park' | 'close';
  /** @purpose ISO timestamp when the session was parked | @invariant Only set when state='park' */
  parkedAt?: string;
};

/**
 * @purpose In-memory session registry — keyed by sessionId, with secondary lookup by taskId and mr.
 * @invariant Thread-safe within a single process — no external persistence.
 * @invariant SessionEntry.state is authoritative — external callers must NOT mutate it directly.
 */
export class SessionRegistry {
  /** @purpose Primary store: sessionId → SessionEntry */
  protected _sessions: Map<string, SessionEntry>;

  /**
   * @purpose Create an empty session registry.
   */
  constructor() {
    this._sessions = new Map();
    logger.debug('[SessionRegistry#constructor] [init → ready]');
  }

  /**
   * @purpose Register a new session entry — overwrites if sessionId already exists.
   * @param entry Full session metadata.
   * @sideEffect Mutates internal map.
   */
  register(entry: SessionEntry): void {
    this._sessions.set(entry.sessionId, entry);
    logger.debug('[SessionRegistry#register] [idle → registered]', {
      sessionId: entry.sessionId,
      taskId: entry.taskId,
    });
  }

  /**
   * @purpose Look up a session entry by its identifier.
   * @param sessionId The session identifier.
   * @returns Entry or undefined when not found.
   */
  lookup(sessionId: string): SessionEntry | undefined {
    return this._sessions.get(sessionId);
  }

  /**
   * @purpose Patch fields on an existing session entry.
   * @param sessionId The session identifier.
   * @param patch Partial entry — only provided fields are updated.
   */
  update(sessionId: string, patch: Partial<SessionEntry>): void {
    const entry = this._sessions.get(sessionId);
    if (!entry) {
      logger.debug('[SessionRegistry#update] [updating → not_found]', { sessionId });
      return;
    }
    Object.assign(entry, patch);
    logger.debug('[SessionRegistry#update] [updating → updated]', {
      sessionId,
      keys: Object.keys(patch),
    });
  }

  /**
   * @purpose Remove a session entry from the registry.
   * @param sessionId The session identifier.
   */
  remove(sessionId: string): void {
    const existed = this._sessions.delete(sessionId);
    logger.debug(`[SessionRegistry#remove] [removing → ${existed ? 'removed' : 'not_found'}]`, {
      sessionId,
    });
  }

  /**
   * @purpose Find a session entry by its task identifier.
   * @param taskId The task identifier.
   * @returns First matching entry, or undefined.
   */
  findByTaskId(taskId: string): SessionEntry | undefined {
    for (const entry of this._sessions.values()) {
      if (entry.taskId === taskId) return entry;
    }
    return undefined;
  }

  /**
   * @purpose Find all session entries for a given MR.
   * @param mr MR webUrl.
   * @returns All matching entries — may be empty.
   */
  findByMr(mr: string): SessionEntry[] {
    const result: SessionEntry[] = [];
    for (const entry of this._sessions.values()) {
      if (entry.mr === mr) result.push(entry);
    }
    return result;
  }

  /**
   * @purpose List all sessions in a given lifecycle state.
   * @param state Lifecycle state to filter by.
   * @returns Matching entries — may be empty.
   */
  listByState(state: string): SessionEntry[] {
    const result: SessionEntry[] = [];
    for (const entry of this._sessions.values()) {
      if (entry.state === state) result.push(entry);
    }
    return result;
  }

  /**
   * @purpose Return all registered session entries.
   * @returns Snapshot of all entries.
   */
  all(): SessionEntry[] {
    return [...this._sessions.values()];
  }
}
