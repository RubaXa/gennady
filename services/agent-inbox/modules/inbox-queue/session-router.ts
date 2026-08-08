// @file: SessionRouterPort + SessionRouter — table §4.2 mapping task types to session actions (reuse_producer if alive / new_fresh / operator_chat), engine tasks pass through
// @consumers: Executor
// @tasks: TSK-159

import { logger } from '#logger';
import type { TaskInstance } from './task-registry.ts';
import type { TaskRegistry } from './task-registry.ts';
import { SessionPool } from '../inbox-opencode/session-pool.ts';
import type { PoolCreateOpts } from '../inbox-opencode/session-pool.ts';

/**
 * @purpose Contract surface for routing a task to an opencode session per the routing table.
 * @invariant Engine tasks (sessionPolicy='engine') return undefined — no session needed.
 * @invariant Session actions: reuse_producer (if alive, same session + artifact), new_fresh (adversarial isolation), operator_chat (MR-level operator session).
 */
export interface SessionRouterPort {
  /**
   * @purpose Resolve the session for a task based on its type and the routing table.
   * @param task Task instance to route.
   * @param [mr] MR reference for session naming/tracking.
   * @returns Session identifier string, or undefined for engine-only tasks.
   */
  route(task: TaskInstance, mr?: string): Promise<string | undefined>;
}

/** @purpose Session action label resolved from the routing table. */
type SessionAction = 'reuse_producer' | 'new_fresh' | 'operator_chat';

/**
 * @purpose Maps a SessionPolicy and task type to a concrete session action per spec §4.2 table.
 * @invariant deepen → reuse_producer (if alive, else new)
 * @invariant fact_check/widen_search → new_fresh (adversarial)
 * @invariant mutate_artifact → reuse_producer
 * @invariant chat_question → operator_chat
 * @invariant task (generic) → reuse_producer when producer alive, else new_fresh
 * @invariant engine → no action (returns undefined)
 */
function resolveSessionAction(
  task: TaskInstance,
  registry: TaskRegistry
): SessionAction | undefined {
  const resolved = registry.resolveType(task.type);

  switch (resolved.sessionPolicy) {
    case 'engine':
      return undefined;

    case 'new_fresh':
      return 'new_fresh';

    case 'reuse_producer':
      return 'reuse_producer';

    case 'operator_chat':
      return 'operator_chat';

    case 'task':
      // Generic task: prefer producer reuse, fallback to fresh
      return 'reuse_producer';
  }
}

/**
 * @purpose Session router that consumes a SessionPool to create or reuse sessions according to the spec §4.2 routing table.
 * @implements {SessionRouterPort} in ./session-router.ts
 * @invariant Producer sessions are identified by MR+type prefix — same type tasks share sessions when policy allows.
 * @invariant Operator chat sessions are per-MR singletons.
 */
export class SessionRouter implements SessionRouterPort {
  /** @purpose Session pool for creating and managing opencode sessions. */
  protected _pool: SessionPool;
  /** @purpose Task registry for type lookups. */
  protected _registry: TaskRegistry;
  /** @purpose MR → type → sessionId cache for producer reuse. */
  protected _producerSessions: Map<string, Map<string, string>>;
  /** @purpose MR → operator chat sessionId cache. */
  protected _operatorSessions: Map<string, string>;

  /**
   * @purpose Create a session router backed by the given session pool.
   * @param pool SessionPool for creating/managing opencode sessions.
   * @param registry TaskRegistry for type lookups.
   */
  constructor(pool: SessionPool, registry: TaskRegistry) {
    this._pool = pool;
    this._registry = registry;
    this._producerSessions = new Map();
    this._operatorSessions = new Map();
    logger.debug('[SessionRouter#constructor] [init → ready]');
  }

  /** @see {SessionRouterPort#route} in ./session-router.ts */
  async route(task: TaskInstance, mr?: string): Promise<string | undefined> {
    const action = resolveSessionAction(task, this._registry);
    if (!action) {
      logger.debug(
        `[SessionRouter#route] [engine → passthrough] ${task.type} taskId=${task.taskId}`
      );
      return undefined;
    }

    const mrRef = mr ?? 'default';
    logger.debug(
      `[SessionRouter#route] [idle → routing] taskId=${task.taskId} type=${task.type} action=${action} mr=${mrRef}`
    );

    // #region START_ROUTE_BY_ACTION — three concrete actions
    switch (action) {
      case 'reuse_producer':
        return this._routeReuseProducer(task, mrRef);

      case 'new_fresh':
        return this._routeNewFresh(task, mrRef);

      case 'operator_chat':
        return this._routeOperatorChat(task, mrRef);
    }
    // #endregion END_ROUTE_BY_ACTION
  }

  /**
   * @purpose Route to reuse_producer — return existing session if alive, otherwise create new.
   * @param task Task instance to route.
   * @param mr MR reference.
   * @returns Session identifier.
   * @sideEffect May create a new session via SessionPool.
   */
  protected async _routeReuseProducer(task: TaskInstance, mr: string): Promise<string> {
    const mrMap = this._producerSessions.get(mr);
    const existing = mrMap?.get(task.type);

    // #region START_REUSE_ACTIVE_PRODUCER — cached producer is reusable only while its pool slot remains active
    if (existing && this._pool.isActive(existing)) {
      logger.debug(
        `[SessionRouter#route_reuse] [existing → reused] mr=${mr} type=${task.type} sid=${existing}`
      );
      return existing;
    }
    // #endregion END_REUSE_ACTIVE_PRODUCER

    // #region START_EVICT_INACTIVE_PRODUCER — stale cache entry must not direct new work into a released session
    if (existing) {
      mrMap?.delete(task.type);
      logger.debug(
        `[SessionRouter#route_reuse] [cached → closed] mr=${mr} type=${task.type} sid=${existing}`
      );
    }
    // #endregion END_EVICT_INACTIVE_PRODUCER

    const opts: PoolCreateOpts = {
      title: `${mr}::${task.type}`,
      directory: process.cwd(),
      model: (task.params.model as string) || undefined,
    };
    try {
      const sid = await this._pool.create(opts);
      this._cacheProducer(mr, task.type, sid);
      logger.debug(
        `[SessionRouter#route_reuse] [created → producer] mr=${mr} type=${task.type} sid=${sid}`
      );
      return sid;
    } catch (cause) {
      const error = new Error(
        `[SessionRouter#_routeReuseProducer] Failed to create session for ${task.type}`,
        { cause }
      );
      logger.error(`[SessionRouter#_routeReuseProducer] [creating → failed] mr=${mr}`, { error });
      throw error;
    }
  }

  /**
   * @purpose Route to new_fresh — always create a new session (adversarial isolation).
   * @param task Task instance to route.
   * @param mr MR reference.
   * @returns Session identifier.
   * @sideEffect Creates a new session via SessionPool.
   */
  protected async _routeNewFresh(task: TaskInstance, mr: string): Promise<string> {
    const opts: PoolCreateOpts = {
      title: `${mr}::${task.type}#${task.taskId}`,
      directory: process.cwd(),
      model: (task.params.model as string) || undefined,
    };
    try {
      const sid = await this._pool.create(opts);
      logger.debug(
        `[SessionRouter#route_new] [created → fresh] mr=${mr} taskId=${task.taskId} sid=${sid}`
      );
      return sid;
    } catch (cause) {
      const error = new Error(
        `[SessionRouter#_routeNewFresh] Failed to create session for ${task.taskId}`,
        { cause }
      );
      logger.error(`[SessionRouter#_routeNewFresh] [creating → failed] mr=${mr}`, { error });
      throw error;
    }
  }

  /**
   * @purpose Route to operator_chat — return the per-MR chat session singleton, creating if absent.
   * @param _task Task instance (unused — operator chat is MR-scoped).
   * @param mr MR reference.
   * @returns Session identifier of the operator chat.
   * @sideEffect May create a new session via SessionPool.
   */
  protected async _routeOperatorChat(_task: TaskInstance, mr: string): Promise<string> {
    const existing = this._operatorSessions.get(mr);
    if (existing) {
      logger.debug(`[SessionRouter#route_operator] [existing → reused] mr=${mr} sid=${existing}`);
      return existing;
    }

    const opts: PoolCreateOpts = {
      title: `${mr}::operator_chat`,
      directory: process.cwd(),
      priority: 'operator',
    };
    try {
      const sid = await this._pool.create(opts);
      this._operatorSessions.set(mr, sid);
      logger.debug(`[SessionRouter#route_operator] [created → operator] mr=${mr} sid=${sid}`);
      return sid;
    } catch (cause) {
      const error = new Error(
        `[SessionRouter#_routeOperatorChat] Failed to create operator session for ${mr}`,
        { cause }
      );
      logger.error(`[SessionRouter#_routeOperatorChat] [creating → failed] mr=${mr}`, { error });
      throw error;
    }
  }

  /**
   * @purpose Cache a producer session for an MR+type combination.
   * @param mr MR reference.
   * @param type Task type name.
   * @param sid Session identifier.
   */
  protected _cacheProducer(mr: string, type: string, sid: string): void {
    const mrMap = this._producerSessions.get(mr) ?? new Map();
    mrMap.set(type, sid);
    this._producerSessions.set(mr, mrMap);
  }
}
