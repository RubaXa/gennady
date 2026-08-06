// @file: Executor — per-MR queue loop: priority+FIFO+aging, exclusive mode (effects sequential), waiting_dep/cancelled states, crash recovery (running→queued, effects by marker), journal-backed visibility events
// @consumers: inbox-roles (role scheduler), inbox-api (inbox serve)
// @tasks: TSK-159

import { logger } from '#logger';
import type { JournalPort } from '../inbox-core/event-journal.ts';
import { TaskRegistry, type TaskInstance } from './task-registry.ts';
import type { TaskQueuePort } from './task-queue.ts';

/** @purpose Aging bonus: +1 priority per full minute waiting (capped at 100). */
const AGING_BONUS_PER_MINUTE = 1;

/** @purpose Maximum effective priority — cap to prevent overflow. */
const MAX_PRIORITY = 100;

/**
 * @purpose Per-MR executor — orchestrates task lifecycle within a single MR queue without any global mutex.
 * @invariant Each MR has its own Executor — MR-A and MR-B run in parallel with no shared state.
 * @invariant Effects execute strictly sequentially within same MR (exclusiveWith on all effects).
 * @invariant Crash recovery: journals every state transition; running→queued on restore, effects check applied-marker.
 */
export class Executor {
  /** @purpose Event journal for persistence and crash recovery. */
  protected _journal: JournalPort;
  /** @purpose Task type registry for type lookups and reference evaluation. */
  protected _registry: TaskRegistry;
  /** @purpose In-memory task queue for state management. */
  protected _queue: TaskQueuePort;
  /** @purpose MR reference this executor is bound to. */
  protected _mr: string;

  /**
   * @purpose Create an executor bound to a single MR with journal, registry, and queue.
   * @param journal JournalPort for persistence (typically EventJournal).
   * @param registry TaskRegistry for type definitions.
   * @param queue TaskQueuePort for state management.
   * @param mr MR reference string (e.g. `path!iid`).
   */
  constructor(journal: JournalPort, registry: TaskRegistry, queue: TaskQueuePort, mr: string) {
    this._journal = journal;
    this._registry = registry;
    this._queue = queue;
    this._mr = mr;
    logger.debug(`[Executor#constructor] [init → ready] mr=${mr}`);
  }

  /**
   * @purpose Enqueue a new task with dedup support and journal the creation.
   * @param type Task type name.
   * @param params Task parameters.
   * @param [dedupKey] Optional explicit dedup key.
   * @returns Assigned taskId and queue position.
   * @sideEffect Writes a task_created journal event.
   */
  async enqueue(
    type: string,
    params: Record<string, unknown>,
    dedupKey?: string
  ): Promise<{ taskId: string; position: number }> {
    const result = this._queue.enqueue(this._mr, type, params, dedupKey);
    const inst = this._queue.instance(this._mr, result.taskId);

    // #region START_JOURNAL_ENQUEUE — persist task creation for crash recovery
    if (inst && inst.status === 'queued') {
      try {
        await this._journal.append({
          ts: new Date().toISOString(),
          mr: this._mr,
          kind: 'task_created',
          actor: 'queue',
          payload: {
            taskId: inst.taskId,
            type: inst.type,
            params: inst.params,
            dedupKey: inst.dedupKey,
            priority: inst.priority,
            createdBy: inst.createdBy,
            createdAt: inst.createdAt,
          },
        });
        logger.debug(
          `[Executor#enqueue] [idle → created] mr=${this._mr} ${type} taskId=${inst.taskId}`
        );
      } catch (cause) {
        const error = new Error(
          `[Executor#enqueue] Journal write failed for taskId=${inst.taskId}`,
          { cause }
        );
        logger.error(`[Executor#enqueue] [journal → failed] mr=${this._mr}`, { error });
        throw error;
      }
    }
    // #endregion END_JOURNAL_ENQUEUE

    return result;
  }

  /**
   * @purpose Advance the queue: resolve dependencies, apply aging, pick the highest-priority ready task(s), transition to running.
   * @invariant Effects are strictly sequential — if an effect was started, no further tasks are selected in this pass.
   * @invariant ExclusiveWith blocks — only tasks with no running exclusivity conflict are selected.
   * @returns Task instances that were started in this pass (empty array when nothing is ready).
   * @sideEffect Writes task_status journal events for each state transition.
   */
  async advance(): Promise<TaskInstance[]> {
    const started: TaskInstance[] = [];
    const allTasks = this._queue.state(this._mr);

    // #region START_RESOLVE_DEPS — move tasks with satisfied dependencies from waiting_dep to queued
    const completedTypes = this._completedTypes(allTasks);
    for (const inst of allTasks) {
      if (inst.status !== 'waiting_dep') continue;
      if (this._allDepsSatisfied(inst, allTasks, completedTypes)) {
        this._queue.transition(this._mr, inst.taskId, 'queued');
        try {
          await this._journalTaskStatus(inst.taskId, 'queued');
        } catch (cause) {
          const error = new Error(
            `[Executor#advance] Journal failed during dep-resolve for ${inst.taskId}`,
            { cause }
          );
          logger.error(`[Executor#advance] [journal → failed] mr=${this._mr}`, { error });
          throw error;
        }
      }
    }
    // #endregion END_RESOLVE_DEPS

    // #region START_SELECT_READY — filter queued tasks, sort by effective priority + aging, pick candidates
    const queuedTasks = this._queue.next(this._mr);
    const running = allTasks.filter((t) => t.status === 'running');

    const ready = queuedTasks
      .filter((t) => this._allDepsSatisfied(t, allTasks, completedTypes))
      .sort((a, b) => {
        const priA = this._effectivePriority(a);
        const priB = this._effectivePriority(b);
        if (priB !== priA) return priB - priA;
        return a.createdAt.localeCompare(b.createdAt);
      });

    let effectStarted = false;
    for (const candidate of ready) {
      const isEffect = this._registry.isEffectTask(candidate.type);

      if (effectStarted && isEffect) continue;

      if (this._isBlockedByExclusive(candidate, running)) {
        logger.debug(
          `[Executor#advance] [queued → blocked_exclusive] mr=${this._mr} taskId=${candidate.taskId} type=${candidate.type}`
        );
        continue;
      }

      this._queue.transition(this._mr, candidate.taskId, 'running');
      try {
        await this._journalTaskStatus(candidate.taskId, 'running');
      } catch (cause) {
        const error = new Error(
          `[Executor#advance] Journal failed during start for ${candidate.taskId}`,
          { cause }
        );
        logger.error(`[Executor#advance] [journal → failed] mr=${this._mr}`, { error });
        throw error;
      }

      started.push(candidate);
      running.push(candidate);

      if (isEffect) effectStarted = true;

      logger.debug(
        `[Executor#advance] [queued → running] mr=${this._mr} taskId=${candidate.taskId} type=${candidate.type} priority=${this._effectivePriority(candidate)}`
      );
    }
    // #endregion END_SELECT_READY

    // #region START_ENSURE_WAITING_DEP — tasks with unsatisfied deps move to waiting_dep for visibility
    for (const t of queuedTasks) {
      if (!this._allDepsSatisfied(t, allTasks, completedTypes) && t.status === 'queued') {
        this._queue.transition(this._mr, t.taskId, 'waiting_dep');
        try {
          await this._journalTaskStatus(t.taskId, 'waiting_dep');
        } catch (cause) {
          logger.error(`[Executor#advance] [journal → failed_dep] mr=${this._mr}`, {
            error: new Error('[Executor#advance] Journal failed for waiting_dep transition', {
              cause,
            }),
          });
        }
        logger.debug(
          `[Executor#advance] [queued → waiting_dep] mr=${this._mr} taskId=${t.taskId} type=${t.type}`
        );
      }
    }
    // #endregion END_ENSURE_WAITING_DEP

    return started;
  }

  /**
   * @purpose Mark a task as completed — transition to done and journal.
   * @param taskId Task identifier.
   * @returns Promise resolving after journal write.
   * @sideEffect Writes task_status journal event.
   */
  async complete(taskId: string): Promise<void> {
    this._queue.transition(this._mr, taskId, 'done');
    try {
      await this._journalTaskStatus(taskId, 'done');
      logger.info(`[Executor#complete] [running → done] mr=${this._mr} taskId=${taskId}`);
    } catch (cause) {
      const error = new Error(`[Executor#complete] Journal write failed for taskId=${taskId}`, {
        cause,
      });
      logger.error(`[Executor#complete] [journal → failed] mr=${this._mr}`, { error });
      throw error;
    }
  }

  /**
   * @purpose Mark a task as failed — transition to failed with error context and journal.
   * @param taskId Task identifier.
   * @param [errorDetail] Human-readable error context for journal payload.
   * @returns Promise resolving after journal write.
   * @sideEffect Writes task_status journal event.
   */
  async fail(taskId: string, errorDetail?: string): Promise<void> {
    this._queue.transition(this._mr, taskId, 'failed');
    const detail = errorDetail ?? 'unknown error';
    try {
      await this._journal.append({
        ts: new Date().toISOString(),
        mr: this._mr,
        kind: 'task_status',
        actor: 'queue',
        payload: { taskId, status: 'failed', error: detail },
      });
      logger.error(`[Executor#fail] [running → failed] mr=${this._mr} taskId=${taskId}`, {
        error: new Error(`[Executor#fail] Task ${taskId} failed: ${detail}`),
      });
    } catch (cause) {
      const error = new Error(`[Executor#fail] Journal write failed for taskId=${taskId}`, {
        cause,
      });
      logger.error(`[Executor#fail] [journal → failed] mr=${this._mr}`, { error });
      throw error;
    }
  }

  /**
   * @purpose Cancel a task that is queued or waiting_dep — transition to cancelled.
   * @param taskId Task identifier.
   * @throws {Error} When the task is running (cannot cancel in-flight tasks — use fail).
   * @returns Promise resolving after journal write.
   * @sideEffect Writes task_status journal event.
   */
  async cancel(taskId: string): Promise<void> {
    const inst = this._queue.instance(this._mr, taskId);
    if (!inst) {
      const error = new Error(`[Executor#cancel] Task not found: ${this._mr}/${taskId}`);
      logger.error(`[Executor#cancel] [lookup → not_found] mr=${this._mr}`, { error });
      throw error;
    }
    if (inst.status === 'running') {
      const error = new Error(
        `[Executor#cancel] Cannot cancel running task: ${this._mr}/${taskId} — use fail()`
      );
      logger.error(`[Executor#cancel] [running → blocked] mr=${this._mr}`, { error });
      throw error;
    }
    this._queue.transition(this._mr, taskId, 'cancelled');
    try {
      await this._journalTaskStatus(taskId, 'cancelled');
      logger.debug(
        `[Executor#cancel] [${inst.status} → cancelled] mr=${this._mr} taskId=${taskId}`
      );
    } catch (cause) {
      const error = new Error(`[Executor#cancel] Journal write failed for taskId=${taskId}`, {
        cause,
      });
      logger.error(`[Executor#cancel] [journal → failed] mr=${this._mr}`, { error });
      throw error;
    }
  }

  /**
   * @purpose Recover queue state from the journal after a crash.
   * @invariant Running tasks are re-queued (status → queued) for idempotent re-run.
   * @invariant Applied effects (with marker in journal) are skipped — transitioned to done.
   * @invariant Task creation order is preserved — tasks are enqueued in journal order.
   * @sideEffect Reads entire journal, rebuilds queue state.
   */
  recover(): void {
    const entries = this._journal.read();
    logger.debug(`[Executor#recover] [init → replaying] mr=${this._mr} entries=${entries.length}`);

    const mrEntries = entries.filter((e: { mr: string }) => e.mr === this._mr);
    const appliedEffects = new Set<string>();

    // #region START_RECOVER_REPLAY — replay task_created and task_status events in order
    for (const entry of mrEntries) {
      const p = entry.payload as Record<string, unknown> | undefined;
      if (!p) continue;

      switch (entry.kind) {
        case 'task_created': {
          const taskType = p.type as string;
          const taskParams = (p.params as Record<string, unknown>) ?? {};
          const dk = (p.dedupKey as string) ?? undefined;
          this._queue.enqueue(this._mr, taskType, taskParams, dk);

          const taskId = p.taskId as string;
          const status = p.status as string | undefined;
          if (status && typeof status === 'string') {
            try {
              this._queue.transition(
                this._mr,
                taskId,
                status as import('./task-registry.ts').TaskStatus
              );
            } catch {
              logger.debug(
                `[Executor#recover] [created → skip_status] taskId=${taskId} (already processed)`
              );
            }
          }
          break;
        }

        case 'task_status': {
          const taskId = p.taskId as string;
          const status = p.status as string;
          if (status === 'done' || status === 'failed') {
            // #region START_RECOVER_EFFECT_MARKER — track applied effects for dedup
            if (status === 'done') {
              const inst = this._queue.instance(this._mr, taskId);
              if (inst && this._registry.isEffectTask(inst.type)) {
                appliedEffects.add(taskId);
              }
            }
            // #endregion END_RECOVER_EFFECT_MARKER
          }
          if (taskId && status) {
            try {
              this._queue.transition(
                this._mr,
                taskId,
                status as import('./task-registry.ts').TaskStatus
              );
            } catch {
              logger.debug(`[Executor#recover] [status → skip] taskId=${taskId} (not found)`);
            }
          }
          break;
        }
      }
    }
    // #endregion END_RECOVER_REPLAY

    // #region START_RECOVER_HARDEN — re-queue running tasks, skip applied effects
    const allTasks = this._queue.state(this._mr);
    for (const inst of allTasks) {
      if (inst.status === 'running') {
        if (this._registry.isEffectTask(inst.type) && appliedEffects.has(inst.taskId)) {
          this._queue.transition(this._mr, inst.taskId, 'done');
          logger.debug(
            `[Executor#recover] [running → done_skip] mr=${this._mr} taskId=${inst.taskId} (effect already applied)`
          );
        } else {
          this._queue.transition(this._mr, inst.taskId, 'queued');
          logger.debug(
            `[Executor#recover] [running → queued] mr=${this._mr} taskId=${inst.taskId} type=${inst.type}`
          );
        }
      }
    }
    // #endregion END_RECOVER_HARDEN

    logger.info(
      `[Executor#recover] [replaying → recovered] mr=${this._mr} tasks=${allTasks.length} appliedEffects=${appliedEffects.size}`
    );
  }

  /**
   * @purpose Get the full state of this MR's queue.
   * @returns All task instances in this MR.
   */
  state(): TaskInstance[] {
    return this._queue.state(this._mr);
  }

  /**
   * @purpose Resolve an external dependency — advance tasks from waiting_dep to queued when an external precondition is met.
   * @param taskId Task to unblock.
   * @returns Promise resolving after journal write.
   * @sideEffect Transitions task to queued and journals.
   */
  async resolveExternal(taskId: string): Promise<void> {
    const inst = this._queue.instance(this._mr, taskId);
    if (!inst) {
      const error = new Error(`[Executor#resolveExternal] Task not found: ${this._mr}/${taskId}`);
      logger.error(`[Executor#resolveExternal] [lookup → not_found] mr=${this._mr}`, { error });
      throw error;
    }
    if (inst.status !== 'waiting_dep') {
      logger.debug(
        `[Executor#resolveExternal] [skip → not_waiting] mr=${this._mr} taskId=${taskId} status=${inst.status}`
      );
      return;
    }
    this._queue.transition(this._mr, taskId, 'queued');
    try {
      await this._journalTaskStatus(taskId, 'queued');
      logger.debug(
        `[Executor#resolveExternal] [waiting_dep → queued] mr=${this._mr} taskId=${taskId}`
      );
    } catch (cause) {
      const error = new Error(
        `[Executor#resolveExternal] Journal write failed for taskId=${taskId}`,
        { cause }
      );
      logger.error(`[Executor#resolveExternal] [journal → failed] mr=${this._mr}`, { error });
      throw error;
    }
  }

  /**
   * @purpose Compute the set of type names that have at least one task in `done` status.
   * @param allTasks All task instances in the MR.
   * @returns Set of type names with at least one done instance.
   */
  protected _completedTypes(allTasks: TaskInstance[]): Set<string> {
    const completed = new Set<string>();
    for (const t of allTasks) {
      if (t.status === 'done') completed.add(t.type);
    }
    return completed;
  }

  /**
   * @purpose Check whether all dependency references for a task are satisfied.
   * @param inst Task instance to check.
   * @param allTasks All task instances in the MR.
   * @param completedTypes Set of type names with done instances.
   * @returns True when every dependsOn reference is satisfied.
   */
  protected _allDepsSatisfied(
    inst: TaskInstance,
    allTasks: TaskInstance[],
    completedTypes: Set<string>
  ): boolean {
    if (inst.dependsOn.length === 0) return true;
    return inst.dependsOn.every((ref) =>
      this._registry.evaluateReference(ref, completedTypes, allTasks)
    );
  }

  /**
   * @purpose Compute effective priority with aging bonus.
   * @invariant +1 per full minute since creation, capped at 100.
   * @param inst Task instance.
   * @returns Numeric priority capped at MAX_PRIORITY — higher is more urgent.
   */
  protected _effectivePriority(inst: TaskInstance): number {
    const ageMs = Date.now() - new Date(inst.createdAt).getTime();
    const agingBonus = Math.floor(ageMs / 60_000) * AGING_BONUS_PER_MINUTE;
    return Math.min(inst.priority + agingBonus, MAX_PRIORITY);
  }

  /**
   * @purpose Check whether a candidate task is blocked by any currently running task's exclusivity.
   * @invariant Candidate's exclusiveWith references are checked against all running tasks' types.
   * @param candidate Task instance to check.
   * @param running Currently running tasks.
   * @returns True when at least one running task blocks via exclusiveWith.
   */
  protected _isBlockedByExclusive(candidate: TaskInstance, running: TaskInstance[]): boolean {
    const candidateType = this._registry.resolveType(candidate.type);
    for (const runTask of running) {
      if (this._registry.isExclusive(runTask.type, candidateType.exclusiveWith)) {
        return true;
      }
    }
    return false;
  }

  /**
   * @purpose Write a task_status journal entry for a state transition.
   * @param taskId Task identifier.
   * @param status New status string.
   * @returns Promise resolving after write.
   * @sideEffect Appends one task_status JSON line to the journal.
   */
  protected async _journalTaskStatus(taskId: string, status: string): Promise<void> {
    await this._journal.append({
      ts: new Date().toISOString(),
      mr: this._mr,
      kind: 'task_status',
      actor: 'queue',
      payload: { taskId, status },
    });
  }
}
