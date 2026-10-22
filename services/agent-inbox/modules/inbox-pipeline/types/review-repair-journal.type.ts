// @file: Durable persistence boundary for review repair state.
// @spec: AGENT-INBOX-INBOX-PIPELINE
// @consumers: ReviewRepairCoordinator, PipelineRuntime

import type { ReviewRepairState } from './review-repair-state.type.ts';

/** @purpose Minimal journal seam required to persist before dispatch and recover after crash. */
export type ReviewRepairJournal = {
  /**
   * @purpose Recover the latest durable state for the owning round.
   * @returns Persisted state used to resume or budget the next repair.
   */
  retrieve(): Promise<ReviewRepairState>;
  /**
   * @purpose Acknowledge repair state durability before dispatch eligibility.
   * @param state Monotonic round state to persist.
   * @returns Completion only after the state is durable.
   */
  persist(state: ReviewRepairState): Promise<void>;
};
