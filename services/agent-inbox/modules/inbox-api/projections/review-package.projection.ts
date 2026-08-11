// @file: ReviewPackageProjection — current/stale selectable action packages projection result type.
// @consumers: ProjectionPort, JournalProjectionAdapter, ReviewQueryRouter, review-package-projection.integration.test.ts
// @tasks: TSK-179

/** @purpose Outcome recorded after an operator accepts, edits, or rejects a package. */
export type PackageOutcome = {
  /** @purpose Stable outcome event ID */
  outcomeId: string;
  /** @purpose Operator verdict recorded */
  verdict: 'accepted' | 'edited' | 'rejected';
  /** @purpose ISO timestamp when the verdict was recorded */
  appliedAt: string;
  /** @purpose Queue task created for this outcome, when applicable */
  taskId?: string;
};

/** @purpose Invalidation metadata recorded when a package becomes stale. */
export type PackageStaleness = {
  /** @purpose Human-readable invalidation reason */
  reason: string;
  /** @purpose review.json revision active when this package was invalidated | @invariant > package revision */
  atRevision: number;
  /** @purpose Replacement package ID when a newer version was produced for the same capability */
  replacement?: string;
};

/** @purpose A selectable action package — actionable (current) or invalidated (stale). */
export type ReviewPackageItem = {
  /** @purpose Stable package identity (proposalId from decision journal) */
  packageId: string;
  /** @purpose Proposal ID in the decision journal | @invariant equals packageId */
  proposalId: string;
  /** @purpose Capability this package targets (post_findings | approve | update_description | …) */
  capability: string;
  /** @purpose review.json revision the package was computed against | @invariant matches ProposalRecord.payload.revision */
  revision: number;
  /** @purpose Whether the package is stale and apply is disabled | @invariant stale === true → staleness is defined */
  stale: boolean;
  /** @purpose Invalidation metadata when stale | @invariant defined iff stale === true */
  staleness?: PackageStaleness;
  /** @purpose Outcomes recorded for this package; empty until operator acts */
  outcomes: PackageOutcome[];
};

/** @purpose Package projection — actionable and invalidated packages for one MR. */
export type ReviewPackageProjection = {
  /** @purpose Packages the operator can still apply — apply command is enabled */
  current: ReviewPackageItem[];
  /** @purpose Packages that are invalidated — visible with disabled controls, reason, and replacement reference */
  stale: ReviewPackageItem[];
  /** @purpose Journal cursor used for this projection build */
  cursor: number;
};
