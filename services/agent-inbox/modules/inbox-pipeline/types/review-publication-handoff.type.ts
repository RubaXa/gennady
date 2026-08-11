// @file: Exact immutable pipeline-to-queue publication handoff.
// @consumers: ReviewFreshnessGate, inbox-queue
// @tasks: TSK-176

import type { ReviewManifestKey } from './review-intent.type.ts';

/** @purpose Action-specific capabilities captured by the successful local guard. */
export type ReviewCapabilitySnapshot = Readonly<Record<string, boolean>>;

/** @purpose Closed dispatch policy preserving external GitLab reconciliation requirements. */
export type ReviewDispatchPolicy =
  | { kind: 'CONDITIONAL_SHA'; expectedHeadSHA: string }
  | { kind: 'RECONCILE_AFTER_EFFECT' };

/** @purpose Exact accepted record passed to queue without translation or defaults. */
export type ReviewPublicationHandoff = Readonly<{
  handoffId: string;
  manifestKey: ReviewManifestKey;
  manifestRef: string;
  contractRef: string;
  verdictRef: string;
  guardedTransitionId: string;
  acceptedObservedRevision: string;
  capabilitySnapshot: ReviewCapabilitySnapshot;
  capabilityVersion: string;
  dispatchPolicy: ReviewDispatchPolicy;
  recommendationDigest: string;
  provenance: readonly string[];
  deliveryStatus: 'ACCEPTED';
}>;

const HANDOFF_KEYS = [
  'handoffId',
  'manifestKey',
  'manifestRef',
  'contractRef',
  'verdictRef',
  'guardedTransitionId',
  'acceptedObservedRevision',
  'capabilitySnapshot',
  'capabilityVersion',
  'dispatchPolicy',
  'recommendationDigest',
  'provenance',
  'deliveryStatus',
] as const;

/**
 * @purpose Construct the exact closed accepted handoff or reject missing, extra and non-PASS-shaped input.
 * @param input Candidate exact accepted publication record.
 * @returns Deeply immutable byte-replayable publication handoff.
 */
export function constructReviewPublicationHandoff(
  input: ReviewPublicationHandoff
): ReviewPublicationHandoff {
  const keys = Object.keys(input).sort();
  const expected = [...HANDOFF_KEYS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error('[constructReviewPublicationHandoff] Handoff fields are not exact');
  }
  if (
    input.deliveryStatus !== 'ACCEPTED' ||
    !input.handoffId ||
    !input.manifestRef ||
    !input.contractRef ||
    !input.verdictRef ||
    !input.guardedTransitionId ||
    !input.acceptedObservedRevision ||
    !input.capabilityVersion ||
    !input.recommendationDigest ||
    !input.manifestKey.mr ||
    !input.manifestKey.headSHA ||
    !input.manifestKey.eventCursor
  ) {
    throw new Error(
      '[constructReviewPublicationHandoff] Fresh PASS handoff identity is incomplete'
    );
  }
  return Object.freeze({
    ...input,
    manifestKey: Object.freeze({ ...input.manifestKey }),
    capabilitySnapshot: Object.freeze({ ...input.capabilitySnapshot }),
    dispatchPolicy: Object.freeze({ ...input.dispatchPolicy }),
    provenance: Object.freeze([...input.provenance]),
  });
}
