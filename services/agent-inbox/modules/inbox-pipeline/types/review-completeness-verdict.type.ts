// @file: Fail-closed structural completeness verdict union.
// @consumers: ReviewRepairCoordinator, ReviewFreshnessGate, ReviewSynthesis
// @tasks: TSK-176

import type { ReviewCoverage } from './review-coverage.type.ts';

/** @purpose Shared immutable identity of one structural validation attempt. */
export type ReviewVerdictBase = {
  /** @purpose Immutable validation attempt identity. */
  verdictId: string;
  /** @purpose Owning contract identity. */
  contractId: string;
  /** @purpose Exact owning contract version. */
  contractVersion: string;
  /** @purpose Exact sealed manifest reference. */
  manifestRef: string;
  /** @purpose Total disjoint slot accounting. */
  coverage: ReviewCoverage;
  /** @purpose Exact deterministic validator release. */
  validatorVersion: string;
  /** @purpose Validation completion time. */
  evaluatedAt: string;
};

/** @purpose Exhaustive downstream gate result with status-specific evidence. */
export type ReviewCompletenessVerdict =
  | (ReviewVerdictBase & { status: 'PASS'; fresh: true })
  | (ReviewVerdictBase & {
      status: 'REPAIRABLE';
      missingSlotIds: string[];
      invalidSlotIds: string[];
      reasons: Record<string, string[]>;
      attempt: number;
      maxAttempts: number;
    })
  | (ReviewVerdictBase & {
      status: 'BLOCKED';
      remainingSlotIds: string[];
      reasons: string[];
      attempt: number;
      maxAttempts: number;
      provenance: string[];
    })
  | (ReviewVerdictBase & {
      status: 'STALE';
      expectedRevision: string;
      observedRevision: string;
      reasons: string[];
    });
