// @file: ReviewMrProjection — complete MR workspace state projection result type.
// @consumers: ProjectionPort, JournalProjectionAdapter, ReviewQueryRouter
// @tasks: TSK-179

import type { ArtifactRef } from '../types.ts';

/** @purpose Single AI finding in the review workspace. */
export type ReviewFinding = {
  /** @purpose Optional finding identity | @invariant stable across report revisions when present */
  id?: string;
  /** @purpose Severity bucket (critical | high | medium | low | info) */
  severity: string;
  /** @purpose File path relative to repo root */
  file: string;
  /** @purpose Source line number | @invariant >= 0 */
  line: number;
  /** @purpose Human-readable finding description */
  message: string;
};

/** @purpose Complete MR workspace state — report, artifacts, and journal rebuild. */
export type ReviewMrProjection = {
  /** @purpose Composite MR reference (project!iid) */
  ref: string;
  /** @purpose Current MR title from the last VCS sync */
  title: string;
  /** @purpose VCS web URL */
  webUrl: string;
  /** @purpose MR author login */
  author: string;
  /** @purpose VCS lifecycle state | @invariant terminal when merged or closed */
  mrState: 'open' | 'merged' | 'closed';
  /** @purpose AI review findings from the latest synthesized report */
  findings: ReviewFinding[];
  /** @purpose Final review verdict (request_changes | approved | commented | '') */
  verdict: string;
  /** @purpose review.json revision at read time — CAS-ready input for command staleness checks (D-99) | @invariant 0 when no persisted review.json exists yet */
  revision: number;
  /** @purpose Review artifacts available for this MR */
  artifacts: ArtifactRef[];
  /** @purpose Journal cursor used for this projection build */
  cursor: number;
};
