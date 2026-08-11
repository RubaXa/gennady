// @file: LocalTaskExecutor — single-process production implementation of TaskExecutorPort with per-MR lanes, journal-backed recovery and aging.
// @consumers: composition root
// @tasks: TSK-177

import { logger } from '#logger';
import type { JournalPort } from '../../inbox-core/event-journal.ts';
import type { ReviewTask, ReviewTaskStatus } from '../model/review-task.ts';
import { transitionReviewTask, constructReviewTask } from '../model/review-task.ts';
import type { TaskExecutorPort, MrLaneProgress, ClaimResult } from '../ports/task-executor.port.ts';

/** @purpose Aging bonus applied to priority — +1 per full minute, capped at 100. */
const AGING_BONUS_PER_MINUTE = 1;

/** @purpose Maximum effective priority to prevent overflow. */
const MAX_EFFECTIVE_PRIORITY = 100;

/**
 * @purpose Compute priority with aging bonus for scheduling.
 * @invariant +1 per full minute since createdAt, capped at MAX_EFFECTIVE_PRIORITY.
 * @param task Task to score.
 * @returns Numeric effective priority.
 */
function effectivePriority(task: ReviewTask): number {
  const ageMs = Date.now() - new Date(task.provenance.createdAt).getTime();
  const bonus = Math.floor(ageMs / 60_000) * AGING_BONUS_PER_MINUTE;
  return Math.min(task.priority + bonus, MAX_EFFECTIVE_PRIORITY);
}

/**
 * @purpose Single-process production executor for ReviewTask per-MR ordering and cross-MR parallelism.
 * @implements {TaskExecutorPort} in ./local-task-executor.adapter.ts
 * @invariant One active task per MR lane; different MR lanes progress independently.
 * @invariant Crash recovery: running tasks are re-queued; acknowledged terminal tasks are not repeated.
 * @invariant Priority ordering: operator tasks (priority=90) > event tasks (50) > pipeline tasks (10) + aging bonus.
 */
export class LocalTaskExecutor implements TaskExecutorPort {
  /** @purpose Per-MR lane: mr → ordered tasks. */
  protected _lanes: Map<string, ReviewTask[]>;
  /** @purpose Per-MR monotonic counter for task IDs. */
  protected _counters: Map<string, number>;
  /** @purpose Event journal for durable state. */
  protected _journal: JournalPort;

  /**
   * @purpose Create a local executor backed by the given journal.
   * @param journal JournalPort for persistence and crash recovery.
   */
  constructor(journal: JournalPort) {
    this._lanes = new Map();
    this._counters = new Map();
    this._journal = journal;
    logger.debug('[LocalTaskExecutor#constructor] [init → ready]');
  }

  /** @see {TaskExecutorPort#enqueue} in ./ports/task-executor.port.ts */
  async enqueue(task: ReviewTask): Promise<{ taskId: string; position: number }> {
    const lane = this._ensureLane(task.mr);

    // #region START_DEDUP_CHECK — return existing task when same dedupKey already present
    const existing = lane.find((t) => t.dedupKey === task.dedupKey);
    if (existing) {
      if (
        existing.status === 'running' ||
        existing.status === 'done' ||
        existing.status === 'cancelled'
      ) {
        logger.debug(
          `[LocalTaskExecutor#enqueue] [dedup → unchanged] mr=${task.mr} dedupKey=${task.dedupKey} taskId=${existing.taskId} status=${existing.status}`
        );
        return { taskId: existing.taskId, position: this._queuedCount(task.mr) };
      }
      // failed and queued/waiting_dep are superseded
      existing.params = task.params;
      existing.priority = task.priority;
      if (existing.status === 'failed') {
        transitionReviewTask(existing, 'queued');
      }
      logger.debug(
        `[LocalTaskExecutor#enqueue] [dedup → superseded] mr=${task.mr} dedupKey=${task.dedupKey} taskId=${existing.taskId}`
      );
      return { taskId: existing.taskId, position: this._queuedPosition(task.mr, existing.taskId) };
    }
    // #endregion END_DEDUP_CHECK

    // #region START_ENQUEUE_NEW — assign ID and persist
    const taskId = this._nextId(task.mr);
    const enrolled = constructReviewTask({ ...task, taskId, status: 'queued' });
    lane.push(enrolled);

    try {
      await this._journal.append({
        ts: new Date().toISOString(),
        mr: task.mr,
        kind: 'task_created',
        actor: 'executor',
        payload: {
          taskId,
          kind: enrolled.kind,
          dedupKey: enrolled.dedupKey,
          priority: enrolled.priority,
          params: enrolled.params,
          dependsOn: enrolled.dependsOn,
          createdBy: enrolled.provenance.createdBy,
          createdAt: enrolled.provenance.createdAt,
        },
      });
    } catch (cause) {
      const error = new Error(
        `[LocalTaskExecutor#enqueue] Journal write failed mr=${task.mr} taskId=${taskId}`,
        { cause }
      );
      logger.error(`[LocalTaskExecutor#enqueue] [journal → failed] mr=${task.mr}`, { error });
      throw error;
    }

    const position = this._queuedCount(task.mr) - 1;
    logger.debug(
      `[LocalTaskExecutor#enqueue] [idle → queued] mr=${task.mr} kind=${enrolled.kind} taskId=${taskId} priority=${enrolled.priority}`
    );
    return { taskId, position };
    // #endregion END_ENQUEUE_NEW
  }

  /** @see {TaskExecutorPort#claim} in ./ports/task-executor.port.ts */
  async claim(mr: string): Promise<ClaimResult> {
    const lane = this._lanes.get(mr) ?? [];
    const running = lane.filter((t) => t.status === 'running');
    if (running.length > 0) {
      return { claimed: false, reason: 'ambiguous' };
    }

    const completedKinds = new Set(lane.filter((t) => t.status === 'done').map((t) => t.kind));

    // #region START_SELECT_READY — resolve dependencies and sort by effective priority
    const ready = lane
      .filter((t) => {
        if (t.status !== 'queued' && t.status !== 'waiting_dep') return false;
        return (
          t.dependsOn.every((depId) =>
            lane.some((dep) => dep.taskId === depId && dep.status === 'done')
          ) &&
          t.dependsOn.every(
            (dep) =>
              completedKinds.has(dep) || lane.some((d) => d.taskId === dep && d.status === 'done')
          )
        );
      })
      .sort((a, b) => {
        const diff = effectivePriority(b) - effectivePriority(a);
        return diff !== 0 ? diff : a.provenance.createdAt.localeCompare(b.provenance.createdAt);
      });
    // #endregion END_SELECT_READY

    if (ready.length === 0) {
      const hasQueued = lane.some((t) => t.status === 'queued' || t.status === 'waiting_dep');
      return { claimed: false, reason: hasQueued ? 'all_waiting' : 'empty' };
    }

    const candidate = ready[0];
    transitionReviewTask(candidate, 'running');

    try {
      await this._journalStatus(mr, candidate.taskId, 'running');
    } catch (cause) {
      const error = new Error(
        `[LocalTaskExecutor#claim] Journal failed for ${mr}/${candidate.taskId}`,
        { cause }
      );
      logger.error(`[LocalTaskExecutor#claim] [journal → failed] mr=${mr}`, { error });
      throw error;
    }

    logger.debug(
      `[LocalTaskExecutor#claim] [queued → running] mr=${mr} taskId=${candidate.taskId} kind=${candidate.kind}`
    );
    return { claimed: true, task: candidate };
  }

  /** @see {TaskExecutorPort#checkpoint} in ./ports/task-executor.port.ts */
  async checkpoint(mr: string, taskId: string, checkpoint: Record<string, unknown>): Promise<void> {
    try {
      await this._journal.append({
        ts: new Date().toISOString(),
        mr,
        kind: 'task_status',
        actor: 'executor',
        payload: { taskId, status: 'checkpoint', checkpoint },
      });
      logger.debug(
        `[LocalTaskExecutor#checkpoint] [running → checkpointed] mr=${mr} taskId=${taskId}`
      );
    } catch (cause) {
      const error = new Error(
        `[LocalTaskExecutor#checkpoint] Journal write failed for ${mr}/${taskId}`,
        { cause }
      );
      logger.error(`[LocalTaskExecutor#checkpoint] [journal → failed] mr=${mr}`, { error });
      throw error;
    }
  }

  /** @see {TaskExecutorPort#complete} in ./ports/task-executor.port.ts */
  async complete(
    mr: string,
    taskId: string,
    status: Extract<ReviewTaskStatus, 'done' | 'failed' | 'cancelled'>
  ): Promise<void> {
    const lane = this._lanes.get(mr);
    const task = lane?.find((t) => t.taskId === taskId);
    if (!task) {
      const error = new Error(`[LocalTaskExecutor#complete] Task not found: ${mr}/${taskId}`);
      logger.error(`[LocalTaskExecutor#complete] [lookup → not_found] mr=${mr}`, { error });
      throw error;
    }
    transitionReviewTask(task, status);
    try {
      await this._journalStatus(mr, taskId, status);
      logger.info(`[LocalTaskExecutor#complete] [running → ${status}] mr=${mr} taskId=${taskId}`);
    } catch (cause) {
      const error = new Error(
        `[LocalTaskExecutor#complete] Journal write failed for ${mr}/${taskId}`,
        { cause }
      );
      logger.error(`[LocalTaskExecutor#complete] [journal → failed] mr=${mr}`, { error });
      throw error;
    }
  }

  /** @see {TaskExecutorPort#recover} in ./ports/task-executor.port.ts */
  async recover(mr: string): Promise<void> {
    const entries = this._journal.read();
    const mrEntries = entries.filter((e: { mr: string }) => e.mr === mr);
    logger.debug(
      `[LocalTaskExecutor#recover] [init → replaying] mr=${mr} entries=${mrEntries.length}`
    );

    // #region START_RECOVER_REPLAY — replay task_created and task_status events
    for (const entry of mrEntries) {
      const p = entry.payload as Record<string, unknown> | undefined;
      if (!p) continue;
      switch (entry.kind) {
        case 'task_created': {
          const lane = this._ensureLane(mr);
          const taskId = p.taskId as string;
          const existing = lane.find((t) => t.taskId === taskId);
          if (!existing) {
            const task = constructReviewTask({
              taskId,
              kind: p.kind as string,
              mr,
              priority: p.priority as number,
              dependsOn: (p.dependsOn as string[]) ?? [],
              dedupKey: p.dedupKey as string,
              params: (p.params as Record<string, unknown>) ?? {},
              provenance: {
                createdBy: p.createdBy as string,
                createdAt: p.createdAt as string,
              },
            });
            lane.push(task);
          }
          break;
        }
        case 'task_status': {
          const taskId = p.taskId as string;
          const status = p.status as ReviewTaskStatus;
          const lane = this._lanes.get(mr);
          const task = lane?.find((t) => t.taskId === taskId);
          if (task) {
            try {
              transitionReviewTask(task, status);
            } catch {
              logger.debug(`[LocalTaskExecutor#recover] [status → skip] taskId=${taskId}`);
            }
          }
          break;
        }
      }
    }
    // #endregion END_RECOVER_REPLAY

    // #region START_RECOVER_HARDEN — re-queue running tasks; acknowledged terminal tasks are not repeated
    const lane = this._lanes.get(mr) ?? [];
    for (const task of lane) {
      if (task.status === 'running') {
        transitionReviewTask(task, 'queued');
        logger.debug(
          `[LocalTaskExecutor#recover] [running → queued] mr=${mr} taskId=${task.taskId}`
        );
      }
    }
    // #endregion END_RECOVER_HARDEN

    logger.info(
      `[LocalTaskExecutor#recover] [replaying → recovered] mr=${mr} tasks=${lane.length}`
    );
  }

  /** @see {TaskExecutorPort#progress} in ./ports/task-executor.port.ts */
  progress(mr: string): MrLaneProgress {
    const lane = this._lanes.get(mr) ?? [];
    return Object.freeze({
      mr,
      queued: lane.filter((t) => t.status === 'queued' || t.status === 'waiting_dep').length,
      running: lane.filter((t) => t.status === 'running').length,
      done: lane.filter((t) => t.status === 'done').length,
      failed: lane.filter((t) => t.status === 'failed').length,
    });
  }

  /** @see {TaskExecutorPort#allLanes} in ./ports/task-executor.port.ts */
  allLanes(): Map<string, MrLaneProgress> {
    const result = new Map<string, MrLaneProgress>();
    for (const [mr] of this._lanes) {
      result.set(mr, this.progress(mr));
    }
    return result;
  }

  /**
   * @purpose Ensure a lane array exists for the given MR.
   * @param mr MR reference.
   * @returns Existing or newly created lane.
   */
  protected _ensureLane(mr: string): ReviewTask[] {
    const existing = this._lanes.get(mr);
    if (existing) return existing;
    const lane: ReviewTask[] = [];
    this._lanes.set(mr, lane);
    return lane;
  }

  /**
   * @purpose Generate the next monotonic task ID for an MR.
   * @param mr MR reference.
   * @returns Formatted task ID string (e.g. #5).
   */
  protected _nextId(mr: string): string {
    const count = (this._counters.get(mr) ?? 0) + 1;
    this._counters.set(mr, count);
    return `#${count}`;
  }

  /**
   * @purpose Count queued tasks in a lane.
   * @param mr MR reference.
   * @returns Number of queued/waiting tasks.
   */
  protected _queuedCount(mr: string): number {
    return (
      this._lanes.get(mr)?.filter((t) => t.status === 'queued' || t.status === 'waiting_dep')
        .length ?? 0
    );
  }

  /**
   * @purpose Find the zero-based position of a task among queued instances.
   * @param mr MR reference.
   * @param taskId Task identifier.
   * @returns Zero-based position.
   */
  protected _queuedPosition(mr: string, taskId: string): number {
    const lane = this._lanes.get(mr);
    if (!lane) return 0;
    let pos = 0;
    for (const t of lane) {
      if (t.taskId === taskId) return pos;
      if (t.status === 'queued' || t.status === 'waiting_dep') pos++;
    }
    return pos;
  }

  /**
   * @purpose Append a task_status journal entry.
   * @param mr MR reference.
   * @param taskId Task ID.
   * @param status New status.
   * @returns Resolved after the journal entry is durably written.
   * @sideEffect Appends to journal.
   */
  protected async _journalStatus(mr: string, taskId: string, status: string): Promise<void> {
    await this._journal.append({
      ts: new Date().toISOString(),
      mr,
      kind: 'task_status',
      actor: 'executor',
      payload: { taskId, status },
    });
  }
}
