// @file: ReviewTask entity — typed per-MR unit of orchestration work with lifecycle, supersede, and recovery semantics.
// @consumers: ReviewTaskRegistry, TaskExecutorPort
// @tasks: TSK-177

import { logger } from '#logger';

/**
 * @purpose Closed lifecycle states a ReviewTask traverses.
 * @invariant queued → running → done | failed; waiting_dep and cancelled are visible intermediate states.
 */
export type ReviewTaskStatus =
  | 'queued'
  | 'running'
  | 'waiting_dep'
  | 'done'
  | 'failed'
  | 'cancelled';

/**
 * @purpose Per-actor provenance for task creation.
 */
export type ReviewTaskProvenance = Readonly<{
  /** @purpose Actor that created this task (e.g. pipeline, operator, automation) */
  createdBy: string;
  /** @purpose ISO timestamp of task creation */
  createdAt: string;
  /** @purpose Session or model ref when task was created by an agent | @invariant absent for system tasks */
  sessionRef?: string;
}>;

/**
 * @purpose Typed per-MR unit of orchestration work — not an external effect intent.
 * @invariant Sequential within one MR; different MR tasks execute in parallel.
 * @invariant Acknowledged terminal task is not repeated on recovery.
 * @invariant dedupKey uniquely identifies logically equivalent tasks within an MR.
 */
export type ReviewTask = {
  /** @purpose Per-MR monotonic task number (e.g. #1, #42) | @invariant Unique within MR */
  taskId: string;
  /** @purpose Closed task kind — determines behavior and dependency rules */
  kind: string;
  /** @purpose MR reference this task belongs to */
  mr: string;
  /** @purpose Current lifecycle status */
  status: ReviewTaskStatus;
  /** @purpose Numeric priority | @invariant 1–100, higher = more urgent */
  priority: number;
  /** @purpose Task IDs this task depends on (must reach done before this task runs) */
  dependsOn: readonly string[];
  /** @purpose Supersede key — new task with same key supersedes queued predecessor | @invariant absent = no supersede */
  supersedeKey?: string;
  /** @purpose Deduplication key — prevents duplicate logical tasks in queue | @invariant Computed from kind+canonical(params) */
  dedupKey: string;
  /** @purpose Kind-specific parameters */
  params: Readonly<Record<string, unknown>>;
  /** @purpose Creation provenance */
  provenance: ReviewTaskProvenance;
};

/**
 * @purpose Transition a task to a new lifecycle status with trace logging.
 * @invariant Terminal transitions (done, failed, cancelled) are permanent within the current session.
 * @param task Mutable task to transition.
 * @param status New lifecycle status.
 */
export function transitionReviewTask(task: ReviewTask, status: ReviewTaskStatus): void {
  const prev = task.status;
  (task as { status: ReviewTaskStatus }).status = status;
  logger.debug(
    `[ReviewTask#transition] [${prev} → ${status}] mr=${task.mr} taskId=${task.taskId} kind=${task.kind}`
  );
}

/**
 * @purpose Construct a new ReviewTask with validated fields.
 * @param fields Task fields (all required except supersedeKey).
 * @throws {Error} When mr, kind, or taskId are empty.
 * @returns Mutable task ready for enqueue.
 */
export function constructReviewTask(
  fields: Omit<ReviewTask, 'status'> & { status?: ReviewTaskStatus }
): ReviewTask {
  if (!fields.mr || !fields.kind || !fields.taskId) {
    throw new Error('[constructReviewTask] mr, kind and taskId are required');
  }
  return {
    ...fields,
    status: fields.status ?? 'queued',
    dependsOn: fields.dependsOn ?? [],
  };
}
