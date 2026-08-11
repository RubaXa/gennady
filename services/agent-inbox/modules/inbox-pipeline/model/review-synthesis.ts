// @file: Immutable semantic synthesis available only after fresh structural PASS.
// @consumers: ReviewPublicationHandoff, dashboard, operator
// @tasks: TSK-176

import { createHash } from 'node:crypto';
import type { ReviewCompletenessVerdict } from '../types/review-completeness-verdict.type.ts';
import type { ReviewEvidence } from '../types/review-evidence.type.ts';

/** @purpose Semantic facts, risks and recommendation inputs retaining conflicts and provenance. */
export type ReviewSynthesisRecord = Readonly<{
  synthesisId: string;
  manifestRef: string;
  contractRef: string;
  verdictRef: string;
  facts: readonly string[];
  risks: readonly string[];
  conflicts: readonly string[];
  recommendationInputs: readonly string[];
  provenance: readonly string[];
  digest: string;
}>;

/** @purpose Construct semantic input only from same-manifest evidence and a fresh PASS. */
export class ReviewSynthesis {
  /**
   * @purpose Construct semantic input only from same-manifest evidence and a fresh PASS.
   * @param contractRef Exact reviewed contract reference.
   * @param verdict Fresh structural completeness result.
   * @param evidence Same-manifest semantic evidence.
   * @param semantic Facts, risks, conflicts and recommendation inputs.
   * @returns Immutable synthesis or explicit rejection.
   */
  construct(
    contractRef: string,
    verdict: ReviewCompletenessVerdict,
    evidence: readonly ReviewEvidence[],
    semantic: Omit<
      ReviewSynthesisRecord,
      'synthesisId' | 'manifestRef' | 'contractRef' | 'verdictRef' | 'digest'
    >
  ): ReviewSynthesisRecord | { status: 'REJECTED'; reason: string } {
    if (verdict.status !== 'PASS' || !verdict.fresh)
      return { status: 'REJECTED', reason: 'fresh PASS required' };
    if (evidence.some((item) => item.manifestRef !== verdict.manifestRef))
      return { status: 'REJECTED', reason: 'foreign manifest evidence' };
    const payload = {
      contractRef,
      verdictRef: verdict.verdictId,
      manifestRef: verdict.manifestRef,
      ...semantic,
    };
    const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return Object.freeze({ synthesisId: `synthesis:${digest}`, ...payload, digest });
  }
}
