// @file: Compact pipeline summary for listings by ref or sha (no merge request required).
// @consumers: VcsClientPipeline
// @tasks: TSK-83

/**
 * @purpose Compact pipeline summary returned by getPipelines.
 * @invariant Every field is a string; missing API fields normalize to '' — never null/undefined.
 * @invariant status is upper-cased so listings read the same as MR head-pipeline output.
 */
export type VcsPipelineSummary = {
  /** @purpose Global pipeline id (numeric part of the VCS global id) */
  id: string;
  /** @purpose Project-scoped pipeline iid used in web URLs */
  iid: string;
  /** @purpose Upper-cased pipeline status (e.g. RUNNING, SUCCESS, FAILED) */
  status: string;
  /** @purpose Full commit SHA the pipeline ran against */
  sha: string;
  /** @purpose Git ref (branch or tag) the pipeline ran against */
  ref: string;
  /** @purpose Pipeline creation timestamp (ISO 8601) */
  createdAt: string;
  /** @purpose Last pipeline update timestamp (ISO 8601) */
  updatedAt: string;
  /** @purpose First line of the pipeline commit message */
  title: string;
};
