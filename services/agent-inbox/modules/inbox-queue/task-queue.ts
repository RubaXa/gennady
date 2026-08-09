// @file: TaskQueuePort + InMemoryTaskQueue — per-MR isolated queues with dedup by dedupKey, supersede (queued only), FIFO ordering, state management
// @consumers: Executor
// @tasks: TSK-159, TSK-161

import { logger } from '#logger';
import { typeRef, type TaskInstance, type TaskStatus, type TaskRegistry } from './task-registry.ts';

/** @purpose Result of enqueue — the assigned taskId and its position in queue. */
export type EnqueueResult = {
  /** @purpose Per-MR monotonic task identifier (e.g. `#5`) */
  taskId: string;
  /** @purpose Zero-based position among queued tasks at enqueue time */
  position: number;
};

/**
 * @purpose Contract surface for MR task queues — enqueue with dedup, select ready tasks, manage state transitions.
 * @invariant Per-MR isolation: each MR has its own independent queue — no global mutex.
 * @invariant Dedup: same dedupKey → same taskId returned, queued version superseded.
 * @invariant Supersede: only replaces queued (not running) tasks.
 */
export interface TaskQueuePort {
  /**
   * @purpose Enqueue a task for an MR with optional explicit dedup key.
   * @param mr MR reference (e.g. `path!iid`).
   * @param type Task type name.
   * @param params Task parameters.
   * @param [dedupKey] Explicit dedup key — when absent, computed from type+canonical(params).
   * @returns Assigned taskId and queue position.
   */
  enqueue(
    mr: string,
    type: string,
    params: Record<string, unknown>,
    dedupKey?: string
  ): EnqueueResult;

  /**
   * @purpose Retrieve all queued tasks ready for execution (dependencies satisfied).
   * @param mr MR reference.
   * @returns Array of TaskInstance in priority+FIFO order.
   */
  next(mr: string): TaskInstance[];

  /**
   * @purpose Retrieve the full state (all instances) for an MR.
   * @param mr MR reference.
   * @returns All task instances in this MR's queue.
   */
  state(mr: string): TaskInstance[];

  /**
   * @purpose Supersede a queued task by dedupKey — replaces parameters and priority of the queued version.
   * @param mr MR reference.
   * @param dedupKey Deduplication key.
   * @returns The updated instance when superseded, null when no matching queued task exists.
   */
  supersede(mr: string, dedupKey: string): TaskInstance | null;

  /**
   * @purpose Transition a task to a new status in-place.
   * @param mr MR reference.
   * @param taskId Task identifier.
   * @param status New lifecycle status.
   * @throws {Error} When taskId is not found.
   */
  transition(mr: string, taskId: string, status: TaskStatus): void;

  /**
   * @purpose Retrieve the instance for a given taskId.
   * @param mr MR reference.
   * @param taskId Task identifier.
   * @returns Task instance or undefined when not found.
   */
  instance(mr: string, taskId: string): TaskInstance | undefined;

  /**
   * @purpose Expose all MR queues for crash recovery and state snapshot.
   * @returns Map from MR reference to ordered task instances.
   */
  all(): Map<string, TaskInstance[]>;
}

/**
 * @purpose In-memory implementation of TaskQueuePort with per-MR queues, dedup, supersede, and FIFO ordering.
 * @implements {TaskQueuePort} in ./task-queue.ts
 * @invariant No persistent storage — queue state is projected from journal on recovery.
 * @invariant Task ids are per-MR monotonic integers formatted as `#N`.
 */
export class InMemoryTaskQueue implements TaskQueuePort {
  /** @purpose Per-MR map: mr → ordered task instances. */
  protected _queues: Map<string, TaskInstance[]>;
  /** @purpose Per-MR counter for generating monotonic task ids. */
  protected _counters: Map<string, number>;
  /** @purpose Task registry for dedup key computation. */
  protected _registry: TaskRegistry;

  /**
   * @purpose Create an in-memory queue with task registry for dedup key resolution.
   * @param registry TaskRegistry for type lookups and dedup key computation.
   */
  constructor(registry: TaskRegistry) {
    this._queues = new Map();
    this._counters = new Map();
    this._registry = registry;
    logger.debug('[InMemoryTaskQueue#constructor] [init → ready]');
  }

  /** @see {TaskQueuePort#enqueue} in ./task-queue.ts */
  enqueue(
    mr: string,
    type: string,
    params: Record<string, unknown>,
    dedupKey?: string
  ): EnqueueResult {
    const key = dedupKey ?? this._registry.computeDedupKey(type, params);
    const resolved = this._registry.resolveType(type);

    // #region START_DEDUP_CHECK — return existing taskId when same dedupKey is already queued or running
    const existing = this._findByDedupKey(mr, key);
    if (existing) {
      if (existing.status === 'running') {
        logger.debug(
          `[InMemoryTaskQueue#enqueue] [dedup → running_unchanged] ${mr} dedupKey=${key} taskId=${existing.taskId}`
        );
        return { taskId: existing.taskId, position: this._queuedCount(mr) };
      }

      // #region START_SUPERSEDE_QUEUED — replace the queued version in-place; failed → retry
      // failed-задача обязана воскресать: иначе одна неудача навсегда блокирует downstream
      // (waiting_dep), и ни один повторный startDeltaReview цепочку не перезапустит.
      if (existing.status === 'failed') existing.status = 'queued';
      if (existing.status === 'done' || existing.status === 'cancelled') {
        return { taskId: existing.taskId, position: this._queuedCount(mr) };
      }
      existing.params = params;
      existing.priority = params.priority != null ? Number(params.priority) : resolved.priority;
      existing.createdAt = new Date().toISOString();
      logger.debug(
        `[InMemoryTaskQueue#enqueue] [dedup → superseded_queued] ${mr} dedupKey=${key} taskId=${existing.taskId}`
      );
      return { taskId: existing.taskId, position: this._queuedPosition(mr, existing.taskId) };
      // #endregion END_SUPERSEDE_QUEUED
    }
    // #endregion END_DEDUP_CHECK

    // #region START_NEW_INSTANCE — create a fresh task instance
    const taskId = this._nextId(mr);
    const priority = params.priority != null ? Number(params.priority) : resolved.priority;
    const declaredDependencies = Array.isArray(params.dependsOn)
      ? params.dependsOn.filter((value): value is string => typeof value === 'string').map(typeRef)
      : [];
    const instance: TaskInstance = {
      taskId,
      type,
      status: 'queued',
      params,
      // A concrete lens can depend on another concrete lens. Keep that edge on the instance:
      // the registry policy supplies the common `enrich` edge and the materialized DAG adds
      // the per-lens input edge without mutating the immutable registry.
      dependsOn: [...resolved.dependsOn, ...declaredDependencies],
      dedupKey: key,
      priority,
      createdBy: (params.createdBy as string) ?? 'unknown',
      createdAt: new Date().toISOString(),
    };

    this._ensureQueue(mr).push(instance);
    logger.debug(
      `[InMemoryTaskQueue#enqueue] [idle → queued] ${mr} ${type} taskId=${taskId} dedupKey=${key} priority=${priority}`
    );
    return { taskId, position: this._queuedCount(mr) - 1 };
    // #endregion END_NEW_INSTANCE
  }

  /** @see {TaskQueuePort#next} in ./task-queue.ts */
  next(mr: string): TaskInstance[] {
    const queue = this._queues.get(mr);
    if (!queue || queue.length === 0) return [];

    const completedTypes = new Set(
      queue.filter((inst) => inst.status === 'done').map((inst) => inst.type)
    );
    return queue
      .filter(
        (inst) =>
          inst.status === 'queued' &&
          inst.dependsOn.every((ref) =>
            this._registry.evaluateReference(ref, completedTypes, queue)
          )
      )
      .sort(
        (left, right) =>
          right.priority - left.priority || queue.indexOf(left) - queue.indexOf(right)
      );
  }

  /** @see {TaskQueuePort#state} in ./task-queue.ts */
  state(mr: string): TaskInstance[] {
    return this._queues.get(mr) ?? [];
  }

  /** @see {TaskQueuePort#supersede} in ./task-queue.ts */
  supersede(mr: string, dedupKey: string): TaskInstance | null {
    const inst = this._findByDedupKey(mr, dedupKey);
    if (!inst || inst.status !== 'queued') {
      logger.debug(
        `[InMemoryTaskQueue#supersede] [lookup → no_match] ${mr} dedupKey=${dedupKey} status=${inst?.status ?? 'absent'}`
      );
      return null;
    }
    inst.createdAt = new Date().toISOString();
    logger.debug(
      `[InMemoryTaskQueue#supersede] [queued → refreshed] ${mr} dedupKey=${dedupKey} taskId=${inst.taskId}`
    );
    return inst;
  }

  /** @see {TaskQueuePort#transition} in ./task-queue.ts */
  transition(mr: string, taskId: string, status: TaskStatus): void {
    const inst = this.instance(mr, taskId);
    if (!inst) {
      const error = new Error(`[InMemoryTaskQueue#transition] Task not found: ${mr}/${taskId}`);
      logger.error(`[InMemoryTaskQueue#transition] [lookup → not_found] ${mr}/${taskId}`, {
        error,
      });
      throw error;
    }
    const prev = inst.status;
    inst.status = status;
    logger.debug(`[InMemoryTaskQueue#transition] [${prev} → ${status}] ${mr} ${taskId}`);
  }

  /** @see {TaskQueuePort#instance} in ./task-queue.ts */
  instance(mr: string, taskId: string): TaskInstance | undefined {
    const queue = this._queues.get(mr);
    return queue?.find((inst) => inst.taskId === taskId);
  }

  /** @see {TaskQueuePort#all} in ./task-queue.ts */
  all(): Map<string, TaskInstance[]> {
    return this._queues;
  }

  /**
   * @purpose Find a task instance by dedup key within an MR.
   * @param mr MR reference.
   * @param key Deduplication key.
   * @returns Matching instance, or undefined when no match.
   */
  protected _findByDedupKey(mr: string, key: string): TaskInstance | undefined {
    const queue = this._queues.get(mr);
    return queue?.find((inst) => inst.dedupKey === key);
  }

  /**
   * @purpose Generate the next monotonic task id for an MR.
   * @param mr MR reference.
   * @returns Formatted task id string (e.g. `#5`).
   */
  protected _nextId(mr: string): string {
    const count = (this._counters.get(mr) ?? 0) + 1;
    this._counters.set(mr, count);
    return `#${count}`;
  }

  /**
   * @purpose Count queued tasks in an MR.
   * @param mr MR reference.
   * @returns Number of tasks with status `queued`.
   */
  protected _queuedCount(mr: string): number {
    const queue = this._queues.get(mr);
    return queue?.filter((inst) => inst.status === 'queued').length ?? 0;
  }

  /**
   * @purpose Find the zero-based position of a task among queued instances.
   * @param mr MR reference.
   * @param taskId Task identifier.
   * @returns Zero-based position among queued tasks.
   */
  protected _queuedPosition(mr: string, taskId: string): number {
    const queue = this._queues.get(mr);
    if (!queue) return 0;
    let pos = 0;
    for (const inst of queue) {
      if (inst.taskId === taskId) return pos;
      if (inst.status === 'queued') pos++;
    }
    return pos;
  }

  /**
   * @purpose Ensure a queue array exists for the given MR.
   * @param mr MR reference.
   * @returns Existing or newly created empty array.
   */
  protected _ensureQueue(mr: string): TaskInstance[] {
    const existing = this._queues.get(mr);
    if (existing) return existing;
    const queue: TaskInstance[] = [];
    this._queues.set(mr, queue);
    return queue;
  }
}
