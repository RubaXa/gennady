// @file: Contract tests for exact immutable fresh publication handoff construction and replay.
// @consumers: TSK-176 audit
// @tasks: TSK-176

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  constructReviewPublicationHandoff,
  type ReviewPublicationHandoff,
} from '../../../services/agent-inbox/modules/inbox-pipeline/types/review-publication-handoff.type.ts';

type HandoffContext = { handoff: ReviewPublicationHandoff };
function createHandoffContext(): HandoffContext {
  return {
    handoff: {
      handoffId: 'h1',
      manifestKey: { mr: 'g/p!1', headSHA: 'sha', eventCursor: 'e' },
      manifestRef: 'm',
      contractRef: 'c',
      verdictRef: 'v:PASS',
      guardedTransitionId: 't',
      acceptedObservedRevision: 'sha:e',
      capabilitySnapshot: { comment: true },
      capabilityVersion: 'v1',
      dispatchPolicy: { kind: 'CONDITIONAL_SHA', expectedHeadSHA: 'sha' },
      recommendationDigest: 'r',
      provenance: ['s'],
      deliveryStatus: 'ACCEPTED',
    },
  };
}

describe('ReviewPublicationHandoff', () => {
  it('pipeline handoff type requires the exact closed publication schema', () => {
    const { handoff } = createHandoffContext();
    const result = constructReviewPublicationHandoff(handoff);
    assert.strictEqual(Object.isFrozen(result), true);
    assert.throws(
      () =>
        constructReviewPublicationHandoff({ ...handoff, deliveryStatus: 'REJECTED' as 'ACCEPTED' }),
      /Fresh PASS handoff identity/
    );
  });

  it('fresh handoff has exact immutable fields digest and replay behavior', () => {
    const { handoff } = createHandoffContext();
    const first = constructReviewPublicationHandoff(handoff);
    const replay = constructReviewPublicationHandoff(handoff);
    assert.deepStrictEqual(first, replay);
    assert.deepStrictEqual(Object.keys(first).sort(), [
      'acceptedObservedRevision',
      'capabilitySnapshot',
      'capabilityVersion',
      'contractRef',
      'deliveryStatus',
      'dispatchPolicy',
      'guardedTransitionId',
      'handoffId',
      'manifestKey',
      'manifestRef',
      'provenance',
      'recommendationDigest',
      'verdictRef',
    ]);
  });
});
