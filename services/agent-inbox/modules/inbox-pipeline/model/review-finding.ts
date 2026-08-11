// @file: Verified actionable review finding with provenance and resolution history.
// @consumers: ReviewCrossReviewer, ReviewSynthesis, inbox-queue
// @tasks: TSK-176

/** @purpose Actionable semantic problem separate from structural completeness. */
export type ReviewFinding = Readonly<{
  findingId: string;
  evidenceRefs: readonly string[];
  location: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  blocking: boolean;
  provenance: readonly string[];
  status: 'OPEN' | 'CHALLENGED' | 'SUPERSEDED' | 'VERIFIED_RESOLVED';
  resolutionHistory: readonly string[];
}>;
