// @file: Immutable pipeline identity returned by read-only exact-SHA observation.
// @spec: CLI-VERIFY
// @consumers: VcsClientPipeline, remote Verify watcher

/** @purpose Describe one provider pipeline without inventing absent metadata. */
export type VcsPipelineSummary = {
  /** @purpose Immutable provider pipeline/run identifier used for every later poll. */
  readonly id: string;
  /** @purpose Full source commit SHA reported by the provider. */
  readonly sha: string;
  /** @purpose Raw provider status retained for typed terminal classification. */
  readonly status: string;
  /** @purpose Stable provider workflow/definition identity used to reject ambiguous SHA matches. */
  readonly definitionId: string;
  /** @purpose Provider retry/run attempt used only to choose the newest run of one definition. */
  readonly attempt?: number;
  /** @purpose Provider ref when available. */
  readonly ref?: string;
  /** @purpose Provider creation timestamp when available. */
  readonly createdAt?: string;
  /** @purpose Provider update timestamp when available. */
  readonly updatedAt?: string;
  /** @purpose Provider title when available. */
  readonly title?: string;
};
