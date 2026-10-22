// @file: Persisted bounded review repair state.
// @spec: AGENT-INBOX-INBOX-PIPELINE
// @consumers: ReviewRepairCoordinator, PipelineRuntime

import type { ReviewRepairTask } from '../model/review-repair-task.ts';

/** @purpose Persisted monotonic repair state for one review round. */
export type ReviewRepairState = {
  /** @purpose Owning review round identity. */
  roundId: string;
  /** @purpose Monotonic number of persisted repair attempts. */
  attempt: number;
  /** @purpose Explicit repair budget retained across restarts. */
  maxAttempts: number;
  /** @purpose Previously persisted task eligible for crash recovery. */
  activeTask?: ReviewRepairTask;
  /** @purpose Append-only history of attempts and operator continuation decisions. */
  provenance: string[];
};
