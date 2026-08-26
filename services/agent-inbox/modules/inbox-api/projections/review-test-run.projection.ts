// @file: ReviewTestRunProjection — adaptive test status and observed preconditions projection result type.
// @consumers: ProjectionPort, JournalProjectionAdapter, ReviewQueryRouter
// @tasks: TSK-179

/** @purpose Observed precondition from the review pipeline — drives test adaptability. */
export type ReviewTestPrecondition = {
  /** @purpose Precondition key */
  key: string;
  /** @purpose Observed value */
  value: string | boolean | number;
  /** @purpose ISO timestamp when this precondition was recorded */
  observedAt: string;
};

/** @purpose One test run entry derived from task_created / task_status journal events. */
export type ReviewTestRun = {
  /** @purpose Task identifier of this test run */
  taskId: string;
  /** @purpose Run lifecycle status */
  status: 'running' | 'passing' | 'failing' | 'cancelled';
  /** @purpose ISO timestamp when the run transitioned to running | @invariant null before any running transition */
  startedAt: string | null;
  /** @purpose ISO timestamp when the run reached a terminal status | @invariant null while running */
  completedAt: string | null;
};

/** @purpose Adaptive test status projection — last observed status and ordered run history. */
export type ReviewTestRunProjection = {
  /** @purpose Composite MR reference */
  ref: string;
  /** @purpose Last observed test status across all runs | @invariant 'unknown' before any test task is recorded */
  status: 'passing' | 'failing' | 'running' | 'unknown';
  /** @purpose Adaptive preconditions observed during the latest run */
  preconditions: ReviewTestPrecondition[];
  /** @purpose Ordered test run history, newest first */
  runs: ReviewTestRun[];
  /** @purpose Journal cursor used for this projection build */
  cursor: number;
};
