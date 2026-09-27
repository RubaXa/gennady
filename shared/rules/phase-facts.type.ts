// @file: Immutable open-vocabulary facts describing one exact workflow phase scope.
// @consumers: RuleResolver, VerifyPlanner, SDD dispatch
// @spec: CLI-RULES

/** @purpose Freeze exact scope, per-artifact facts and independent Verify-provider projection. */
export type PhaseFacts = {
  /** @purpose Exact normalized files declared as phase targets. */
  readonly targetFiles: readonly string[];
  /** @purpose Exact normalized files planned by the workflow. */
  readonly plannedFiles: readonly string[];
  /** @purpose Exact normalized deleted-file identities retained as tombstones. */
  readonly tombstoneFiles: readonly string[];
  /** @purpose Deterministic per-file facts with open language, role and framework vocabularies. */
  readonly artifacts: readonly {
    /** @purpose Normalized repository-relative artifact identity. */
    readonly path: string;
    /** @purpose Exact scope sets in which the artifact participates. */
    readonly origins: readonly ('target' | 'planned' | 'tombstone')[];
    /** @purpose Normalized language facts inferred or supplied for this artifact. */
    readonly languages: readonly string[];
    /** @purpose Normalized workflow roles such as production or test. */
    readonly roles: readonly string[];
    /** @purpose Normalized project-aware framework identities. */
    readonly frameworks: readonly string[];
  }[];
  /** @purpose Normalized open-vocabulary operations performed by this phase. */
  readonly operations: readonly string[];
  /** @purpose Normalized open-vocabulary workflow intents. */
  readonly intents: readonly string[];
  /** @purpose Normalized target platform facts. */
  readonly platforms: readonly string[];
  /** @purpose Normalized tool facts available to rule and provider consumers. */
  readonly tools: readonly string[];
  /** @purpose Deterministically keyed open project facts. */
  readonly project: Readonly<Record<string, readonly string[]>>;
  /** @purpose Provider ids implied by artifact languages, independently from rule selection. */
  readonly providers: readonly string[];
};
