// @file: Unit tests for independent foreign review and discussion cross-review semantics.
// @consumers: TSK-176 audit
// @tasks: TSK-176

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ReviewCrossReviewer,
  type ReviewCrossReviewInput,
} from '../../../services/agent-inbox/modules/inbox-pipeline/review/review-cross-reviewer.ts';

type CrossReviewerContext = { reviewer: ReviewCrossReviewer; input: ReviewCrossReviewInput };
function createCrossReviewerContext(
  overrides: Partial<ReviewCrossReviewInput> = {}
): CrossReviewerContext {
  return {
    reviewer: new ReviewCrossReviewer(),
    input: {
      foreignReviewId: 'r1',
      foreignReviewer: 'alice',
      foreignVersion: '1',
      claim: 'safe',
      currentCodeRef: 'h:a.ts',
      independentEvidenceRefs: ['e1'],
      priorApproval: false,
      ...overrides,
    },
  };
}

describe('ReviewCrossReviewer', () => {
  it('versioned foreign review retains dual provenance without structural or approve shortcut', () => {
    const { reviewer, input } = createCrossReviewerContext();
    const result = reviewer.reviewForeignClaim(input, 'DEEPEN');
    assert.deepStrictEqual(result.foreignProvenance, ['r1@1', 'alice']);
    assert.deepStrictEqual(result.independentProvenance, ['h:a.ts', 'e1']);
    assert.deepStrictEqual([result.structuralShortcut, result.approveShortcut], [false, false]);
  });

  it('approval override and refusal retain explicit non blocking semantics', () => {
    const approved = createCrossReviewerContext({ priorApproval: true });
    assert.strictEqual(
      approved.reviewer.reviewForeignClaim(approved.input, 'OBJECT').blocking,
      false
    );
    const refused = createCrossReviewerContext({ authorRefusal: true });
    assert.deepStrictEqual(refused.reviewer.reviewForeignClaim(refused.input, 'ASK').alternatives, [
      'AGREE_AND_RESOLVE',
      'OBJECT',
      'ASK',
    ]);
  });
});
