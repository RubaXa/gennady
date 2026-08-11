// @file: Closed review intent variants for deterministic contract compilation.
// @consumers: ReviewContractCompiler, ReviewDeltaVerifier, ReviewOrchestrator
// @tasks: TSK-176

/** @purpose Immutable identity of one observed merge request revision. */
export type ReviewManifestKey = {
  /** @purpose Canonical merge request identity. */
  mr: string;
  /** @purpose Exact reviewed head revision. */
  headSHA: string;
  /** @purpose Exact observed event boundary. */
  eventCursor: string;
};

/** @purpose Version-addressable baseline required by delta review. */
export type ReviewBaseline = {
  /** @purpose Prior sealed manifest reference. */
  manifestRef: string;
  /** @purpose Prior accepted evidence revision. */
  evidenceRef: string;
};

/** @purpose Shared context carried by every role-invariant review request. */
export type ReviewIntentBase = {
  /** @purpose Requested immutable MR revision. */
  manifestKey: ReviewManifestKey;
  /** @purpose Event or operator signal that initiated review. */
  trigger: string;
  /** @purpose Principal requesting review without changing review depth. */
  requester: string;
};

/** @purpose Closed full, delta, thread, cross-review and manual review request union. */
export type ReviewIntent =
  | (ReviewIntentBase & { kind: 'full' })
  | (ReviewIntentBase & { kind: 'delta'; baseline: ReviewBaseline })
  | (ReviewIntentBase & { kind: 'thread'; threadId: string })
  | (ReviewIntentBase & { kind: 'cross-review'; foreignReviewId: string })
  | (ReviewIntentBase & { kind: 'manual'; instruction: string });
