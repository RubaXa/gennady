// @file: TaskExecutorPort — test seam for per-MR ordering, cross-MR parallelism, recovery and acknowledged task dedup.
// @consumers: ReviewTaskRegistry, ReviewEffectCoordinator
// @tasks: TSK-177

import type { ReviewTask, ReviewTaskStatus } from '../model/review-task.ts';

/**
 * @purpose Progress snapshot for one MR lane.
 */
export type MrLaneProgress = Readonly<{
  /** @purpose MR reference */
  mr: string;
  /** @purpose Number of queued tasks (including waiting_dep) */
  queued: number;
  /** @purpose Number of running tasks */
  running: number;
  /** @purpose Number of completed tasks */
  done: number;
  /** @purpose Number of failed tasks */
  failed: number;
}>;

/**
 * @purpose Claim result — either the claimed task or a reason why nothing was claimable.
 */
export type ClaimResult =
  | { claimed: true; task: ReviewTask }
  | { claimed: false; reason: 'empty' | 'all_waiting' | 'ambiguous' };

/**
 * @purpose Contract surface for per-MR task execution — enqueue, claim, checkpoint, recover, and progress exposure.
 * @invariant Per-MR ordering: one running task per lane; supersede affects only pending work.
 * @invariant Cross-MR parallelism: different MR lanes progress independently with no shared mutex.
 * @invariant Acknowledged terminal task is not repeated on recovery — deduplicated by taskId.
 */
export interface TaskExecutorPort {
  /**
   * @purpose Durably enqueue a task with dedup and optional supersede support.
   * @param task Task to enqueue.
   * @returns Assigned taskId and queue position.
   * @sideEffect Writes to durable journal.
   */
  enqueue(task: ReviewTask): Promise<{ taskId: string; position: number }>;

  /**
   * @purpose Claim the next ready task for an MR lane — transitions to running.
   * @invariant Only one task is running per MR at any time.
   * @param mr MR reference.
   * @returns Claim result — either the claimed task or a reason.
   * @sideEffect Writes status transition to journal.
   */
  claim(mr: string): Promise<ClaimResult>;

  /**
   * @purpose Durably checkpoint a task's intermediate state.
   * @param mr MR reference.
   * @param taskId Task identifier.
   * @param checkpoint Arbitrary serializable checkpoint payload.
   * @returns Resolved after the checkpoint is durably persisted.
   * @sideEffect Appends checkpoint record to journal.
   */
  checkpoint(mr: string, taskId: string, checkpoint: Record<string, unknown>): Promise<void>;

  /**
   * @purpose Transition a task to a terminal status.
   * @param mr MR reference.
   * @param taskId Task identifier.
   * @param status Terminal status: done | failed | cancelled.
   * @returns Resolved after the terminal transition is durably persisted.
   * @sideEffect Writes terminal transition to journal.
   */
  complete(
    mr: string,
    taskId: string,
    status: Extract<ReviewTaskStatus, 'done' | 'failed' | 'cancelled'>
  ): Promise<void>;

  /**
   * @purpose Recover queue state from the durable journal — idempotent.
   * @invariant Running tasks are re-queued on recovery; acknowledged terminal tasks are not repeated.
   * @param mr MR reference to recover.
   * @returns Resolved after queue state is rebuilt from the journal.
   * @sideEffect Reads journal and rebuilds in-memory state.
   */
  recover(mr: string): Promise<void>;

  /**
   * @purpose Expose progress snapshot for one MR lane.
   * @param mr MR reference.
   * @returns Current lane progress counts.
   */
  progress(mr: string): MrLaneProgress;

  /**
   * @purpose Expose all MR lanes for monitoring.
   * @returns Map from MR reference to lane progress.
   */
  allLanes(): Map<string, MrLaneProgress>;
}
