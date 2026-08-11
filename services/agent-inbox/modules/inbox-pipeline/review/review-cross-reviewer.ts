// @file: Independent semantic cross-review preserving foreign and local provenance.
// @consumers: ReviewOrchestrator, ReviewSynthesis
// @tasks: TSK-176

/** @purpose Versioned foreign claim and independent current-code assessment input. */
export type ReviewCrossReviewInput = {
  /** @purpose Stable foreign review or discussion identity. */
  foreignReviewId: string;
  /** @purpose Foreign reviewer provenance. */
  foreignReviewer: string;
  /** @purpose Exact foreign review revision. */
  foreignVersion: string;
  /** @purpose Foreign semantic claim under independent review. */
  claim: string;
  /** @purpose Exact current code revision and location. */
  currentCodeRef: string;
  /** @purpose Independent evidence gathered by this review. */
  independentEvidenceRefs: readonly string[];
  /** @purpose Whether operator approval predates this cross-review. */
  priorApproval: boolean;
  /** @purpose Explicit operator override restoring blocking semantics. */
  explicitApprovalOverride?: boolean;
  /** @purpose Whether author explicitly refused the requested change. */
  authorRefusal?: boolean;
};

/** @purpose Allowed operator alternatives retaining both provenance sources. */
export type ReviewCrossReviewResult = Readonly<{
  relation: 'AGREE' | 'DEEPEN' | 'OBJECT' | 'ASK';
  alternatives: readonly ('LIKE' | 'SUPPLEMENT' | 'OBJECT' | 'ASK' | 'AGREE_AND_RESOLVE')[];
  blocking: boolean;
  foreignProvenance: readonly string[];
  independentProvenance: readonly string[];
  structuralShortcut: false;
  approveShortcut: false;
}>;

/** @purpose Produce recommendation input without trusting reviewer identity or closing structural slots. */
export class ReviewCrossReviewer {
  /**
   * @purpose Produce recommendation input without trusting reviewer identity or closing structural slots.
   * @param input Versioned foreign claim and independent evidence.
   * @param relation Independent semantic relation to the claim.
   * @returns Operator alternatives retaining dual provenance.
   */
  reviewForeignClaim(
    input: ReviewCrossReviewInput,
    relation: ReviewCrossReviewResult['relation']
  ): ReviewCrossReviewResult {
    const alternatives: ReviewCrossReviewResult['alternatives'] = input.authorRefusal
      ? ['AGREE_AND_RESOLVE', 'OBJECT', 'ASK']
      : relation === 'AGREE'
        ? ['LIKE', 'SUPPLEMENT']
        : relation === 'DEEPEN'
          ? ['SUPPLEMENT', 'ASK']
          : relation === 'OBJECT'
            ? ['OBJECT', 'ASK']
            : ['ASK'];
    return Object.freeze({
      relation,
      alternatives,
      blocking:
        input.priorApproval && !input.explicitApprovalOverride ? false : relation === 'OBJECT',
      foreignProvenance: [
        `${input.foreignReviewId}@${input.foreignVersion}`,
        input.foreignReviewer,
      ],
      independentProvenance: [input.currentCodeRef, ...input.independentEvidenceRefs],
      structuralShortcut: false,
      approveShortcut: false,
    });
  }
}
