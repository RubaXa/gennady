// @file: Canonical input for one phase-owned autonomous execution decision.
// @spec: SHARED
// @consumers: deviation, sdd-log

/** @purpose Non-obvious choice persisted before use; no field grants new authority. */
export type ExecutionDecision = {
  /** @purpose Stable canonical Decision Log ID reused across retries. */
  id: string;
  /** @purpose Concrete technical choice to apply after acknowledgement. */
  what: string;
  /** @purpose Why this choice preserves the approved goal. */
  why: string;
  /** @purpose Exact affected artifact or bounded area, not new write authority. */
  where: string;
  /** @purpose Observable fact or reference supporting the choice. */
  evidence: string;
  /** @purpose Considered alternative and why it was not selected. */
  alternative: string;
  /** @purpose How the choice will be checked without weakening acceptance. */
  verify: string;
};
