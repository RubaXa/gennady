// @file: DeterministicTaskExecutor — predictable in-memory TaskExecutorPort for scenario isolation.
// @consumers: ReviewScenario, inbox-mocks test suite
// @tasks: TSK-180

import type {
  TaskExecutorPort,
  MrLaneProgress,
  ClaimResult,
} from '../../inbox-queue/ports/task-executor.port.ts';
import type { ReviewTask, ReviewTaskStatus } from '../../inbox-queue/model/review-task.ts';
import { transitionReviewTask } from '../../inbox-queue/model/review-task.ts';
import type { JournalPort } from '../../inbox-core/event-journal.ts';

/** @purpose Per-MR in-memory lane state. */
type MrLane = {
  /** @purpose Tasks in append order; mutated in-place for status transitions. */
  tasks: ReviewTask[];
  /** @purpose Dedup keys of acknowledged terminal tasks; prevents re-run on recover. */
  acknowledgedTerminals: Set<string>;
};

/**
 * @purpose Predictable in-memory task executor for deterministic scenario isolation.
 * @implements {TaskExecutorPort} in ../../inbox-queue/ports/task-executor.port.ts
 * @invariant Tasks within one MR lane execute strictly sequentially — at most one running at a time.
 * @invariant Cross-MR lanes are independent; concurrent advances on different MRs share no mutex.
 * @invariant FIFO claim order within one MR — no aging or priority jitter in deterministic mode.
 */
export class DeterministicTaskExecutor implements TaskExecutorPort {
  /** @purpose Journal for persistence and recovery; may be InMemoryJournalAdapter in tests. */
  protected _journal: JournalPort;
  /** @purpose Per-MR lane state keyed by MR ref. */
  protected _lanes: Map<string, MrLane> = new Map();

  /**
   * @purpose Bind a journal adapter for durable persistence without production filesystem.
   * @param journal JournalPort implementation (typically InMemoryJournalAdapter in tests).
   */
  constructor(journal: JournalPort) {
    this._journal = journal;
  }

  /** @see {TaskExecutorPort#enqueue} in ../../inbox-queue/ports/task-executor.port.ts */
  async enqueue(task: ReviewTask): Promise<{ taskId: string; position: number }> {
    const lane = this._resolveLane(task.mr);

    // #region START_DEDUP_ENQUEUE — invariant: dedupKey collision within one MR is silently no-op
    const existing = lane.tasks.find(
      (t) =>
        t.dedupKey === task.dedupKey &&
        t.status !== 'done' &&
        t.status !== 'failed' &&
        t.status !== 'cancelled'
    );
    if (existing) {
      return { taskId: existing.taskId, position: lane.tasks.indexOf(existing) };
    }
    // #endregion END_DEDUP_ENQUEUE

    lane.tasks.push({ ...task, status: 'queued' });
    const position = lane.tasks.length - 1;

    await this._journal.append({
      ts: new Date().toISOString(),
      mr: task.mr,
      kind: 'task_created',
      actor: 'deterministic-executor',
      payload: { taskId: task.taskId, kind: task.kind, dedupKey: task.dedupKey },
    });

    return { taskId: task.taskId, position };
  }

  /** @see {TaskExecutorPort#claim} in ../../inbox-queue/ports/task-executor.port.ts */
  async claim(mr: string): Promise<ClaimResult> {
    const lane = this._resolveLane(mr);

    // #region START_ENFORCE_SEQUENTIAL_CLAIM — invariant: one running task per lane
    const running = lane.tasks.filter((t) => t.status === 'running');
    if (running.length > 0) {
      return { claimed: false, reason: 'ambiguous' };
    }
    // #endregion END_ENFORCE_SEQUENTIAL_CLAIM

    const next = lane.tasks.find((t) => t.status === 'queued');
    if (!next) {
      const waiting = lane.tasks.some((t) => t.status === 'waiting_dep');
      return { claimed: false, reason: waiting ? 'all_waiting' : 'empty' };
    }

    transitionReviewTask(next, 'running');
    await this._journal.append({
      ts: new Date().toISOString(),
      mr,
      kind: 'task_status',
      actor: 'deterministic-executor',
      payload: { taskId: next.taskId, status: 'running' },
    });

    return { claimed: true, task: { ...next } };
  }

  /** @see {TaskExecutorPort#checkpoint} in ../../inbox-queue/ports/task-executor.port.ts */
  async checkpoint(mr: string, taskId: string, checkpoint: Record<string, unknown>): Promise<void> {
    await this._journal.append({
      ts: new Date().toISOString(),
      mr,
      kind: 'task_status',
      actor: 'deterministic-executor',
      payload: { taskId, checkpoint },
    });
  }

  /**
   * @see {TaskExecutorPort#complete} in ../../inbox-queue/ports/task-executor.port.ts
   * @throws {Error} When the task ID is not found in the lane.
   */
  async complete(
    mr: string,
    taskId: string,
    status: Extract<ReviewTaskStatus, 'done' | 'failed' | 'cancelled'>
  ): Promise<void> {
    const lane = this._resolveLane(mr);
    const task = lane.tasks.find((t) => t.taskId === taskId);
    if (!task) {
      throw new Error(`[DeterministicTaskExecutor#complete] Task not found: ${mr}/${taskId}`);
    }
    transitionReviewTask(task, status);

    // Track acknowledged terminals for idempotent recovery — prevents re-run on recover
    lane.acknowledgedTerminals.add(taskId);

    await this._journal.append({
      ts: new Date().toISOString(),
      mr,
      kind: 'task_status',
      actor: 'deterministic-executor',
      payload: { taskId, status },
    });
  }

  /** @see {TaskExecutorPort#recover} in ../../inbox-queue/ports/task-executor.port.ts */
  async recover(mr: string): Promise<void> {
    const entries = this._journal.read().filter((e) => e.mr === mr);
    const lane = this._resolveLane(mr);
    lane.tasks = [];
    lane.acknowledgedTerminals = new Set();

    // #region START_REPLAY_JOURNAL_FOR_RECOVERY
    for (const entry of entries) {
      const p = entry.payload as Record<string, unknown> | undefined;
      if (!p) continue;
      if (entry.kind === 'task_created') {
        const taskId = String(p.taskId ?? '');
        if (!lane.tasks.some((t) => t.taskId === taskId)) {
          // synthesize minimal task from journal; concrete fields set to safe defaults
          lane.tasks.push({
            taskId,
            kind: String(p.kind ?? ''),
            mr,
            status: 'queued',
            priority: 50,
            dependsOn: [],
            dedupKey: String(p.dedupKey ?? taskId),
            params: {},
            provenance: { createdBy: 'recovered', createdAt: entry.ts },
          });
        }
      } else if (entry.kind === 'task_status') {
        const taskId = String(p.taskId ?? '');
        const status = p.status as ReviewTaskStatus | undefined;
        const task = lane.tasks.find((t) => t.taskId === taskId);
        if (task && status) {
          transitionReviewTask(task, status);
          if (status === 'done' || status === 'failed' || status === 'cancelled') {
            lane.acknowledgedTerminals.add(taskId);
          }
        }
      }
    }
    // #endregion END_REPLAY_JOURNAL_FOR_RECOVERY

    // #region START_HARDEN_RUNNING_TASKS — re-queue running tasks that crashed mid-execution
    for (const task of lane.tasks) {
      if (task.status === 'running' && !lane.acknowledgedTerminals.has(task.taskId)) {
        transitionReviewTask(task, 'queued');
      }
    }
    // #endregion END_HARDEN_RUNNING_TASKS
  }

  /** @see {TaskExecutorPort#progress} in ../../inbox-queue/ports/task-executor.port.ts */
  progress(mr: string): MrLaneProgress {
    const tasks = this._resolveLane(mr).tasks;
    return {
      mr,
      queued: tasks.filter((t) => t.status === 'queued' || t.status === 'waiting_dep').length,
      running: tasks.filter((t) => t.status === 'running').length,
      done: tasks.filter((t) => t.status === 'done').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
    };
  }

  /** @see {TaskExecutorPort#allLanes} in ../../inbox-queue/ports/task-executor.port.ts */
  allLanes(): Map<string, MrLaneProgress> {
    const result = new Map<string, MrLaneProgress>();
    for (const mr of this._lanes.keys()) {
      result.set(mr, this.progress(mr));
    }
    return result;
  }

  /**
   * @purpose Retrieve or initialize the in-memory lane for one MR.
   * @param mr MR reference.
   * @returns Existing or newly created lane state.
   */
  protected _resolveLane(mr: string): MrLane {
    let lane = this._lanes.get(mr);
    if (!lane) {
      lane = { tasks: [], acknowledgedTerminals: new Set() };
      this._lanes.set(mr, lane);
    }
    return lane;
  }
}
