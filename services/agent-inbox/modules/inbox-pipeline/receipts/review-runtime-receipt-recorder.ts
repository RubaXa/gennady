// @file: Control-plane-owned operation recorder with durable acknowledgment before eligibility.
// @consumers: agent runtime integration, ReviewStructuralValidator
// @tasks: TSK-176

import { createHash } from 'node:crypto';
import type {
  ReviewReceiptStoreContext,
  ReviewRuntimeReceiptStorePort,
} from '../ports/review-runtime-receipt-store.port.ts';
import type {
  ReviewRuntimeOperation,
  ReviewRuntimeReceipt,
} from '../types/review-runtime-receipt.type.ts';

/** @purpose Canonical operation context fixed before the trusted callback executes. */
export type ReviewRuntimeReceiptContext = ReviewReceiptStoreContext & {
  contractVersion: string;
  sessionId: string;
  taskId: string;
  sourceId: string;
  sourceVersion: string;
  sourceDigest: string;
  targetId: string;
  operation: ReviewRuntimeOperation;
  normalizedArguments: Record<string, string | number | boolean>;
  range?: { start: number; end: number };
  semanticAnchor?: string;
  nextSequence: number;
};

/** @purpose Tool callback observation captured independently of agent-authored artifact text. */
export type ReviewRuntimeObservation = {
  /** @purpose Exact content observed by the control plane. */
  content: string;
  /** @purpose Raw operation outcome captured for digesting. */
  outcome: unknown;
  /** @purpose Terminal callback status. */
  status: 'SUCCEEDED' | 'FAILED';
};

/** @purpose Evidence eligibility result that exists only after durable trusted receipt acknowledgment. */
export type ReviewRuntimeReceiptRecordResult =
  | { status: 'ELIGIBLE'; receipt: ReviewRuntimeReceipt; durableDigest: string }
  | { status: 'INELIGIBLE'; reason: string };

function digest(value: unknown): string {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
}

/** @purpose Execute a trusted callback and acknowledge its full receipt before evidence eligibility. */
export class ReviewRuntimeReceiptRecorder {
  /** @purpose Trusted append-only receipt persistence boundary. */
  protected readonly _store: ReviewRuntimeReceiptStorePort;

  /**
   * @purpose Configure trusted durable receipt persistence.
   * @param store Append-only receipt store.
   */
  constructor(store: ReviewRuntimeReceiptStorePort) {
    this._store = store;
  }

  /**
   * @purpose Record one control-plane-owned operation after verifying immutable source identity.
   * @param context Canonical operation context fixed before execution.
   * @param callback Control-plane-owned operation callback.
   * @returns Evidence eligibility only after durable acknowledgment.
   */
  async recordTrustedOperation(
    context: ReviewRuntimeReceiptContext,
    callback: () => Promise<ReviewRuntimeObservation>
  ): Promise<ReviewRuntimeReceiptRecordResult> {
    const observation = await callback();
    const receiptId = `receipt:${digest({ context, observation: { content: digest(observation.content), outcome: digest(observation.outcome), status: observation.status } })}`;
    const receipt: ReviewRuntimeReceipt = Object.freeze({
      receiptId,
      contractId: context.contractId,
      contractVersion: context.contractVersion,
      manifestKeyDigest: context.manifestKeyDigest,
      sessionId: context.sessionId,
      taskId: context.taskId,
      sourceId: context.sourceId,
      sourceVersion: context.sourceVersion,
      sourceDigest: context.sourceDigest,
      targetId: context.targetId,
      operation: context.operation,
      normalizedArguments: context.normalizedArguments,
      range: context.range,
      semanticAnchor: context.semanticAnchor,
      observedContentDigest: digest(observation.content),
      outcomeDigest: digest(observation.outcome),
      outcome: observation.status,
      sequence: context.nextSequence,
      recordedAt: new Date().toISOString(),
    });
    const appended = this._store.appendReceipt(context, receipt);
    if (appended.status === 'REJECTED') return { status: 'INELIGIBLE', reason: appended.reason };
    return { status: 'ELIGIBLE', receipt, durableDigest: appended.digest };
  }
}
