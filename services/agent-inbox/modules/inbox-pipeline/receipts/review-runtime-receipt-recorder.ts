// @file: Control-plane-owned operation recorder with durable acknowledgment before eligibility.
// @consumers: agent runtime integration, ReviewStructuralValidator
// @tasks: TSK-176, TSK-190

import { createHash } from 'node:crypto';
import type {
  ReviewReceiptStoreContext,
  ReviewRuntimeReceiptStorePort,
} from '../ports/review-runtime-receipt-store.port.ts';
import type {
  ReviewRuntimeOperation,
  ReviewRuntimeReceipt,
} from '../types/review-runtime-receipt.type.ts';

/** @purpose Immutable round context fixed before the trusted callback executes. */
export type ReviewRuntimeReceiptContext = ReviewReceiptStoreContext & {
  contractVersion: string;
  sessionId: string;
  taskId: string;
  nextSequence: number;
};

/** @purpose Tool callback observation captured independently of agent-authored artifact text. */
export type ReviewRuntimeObservation = {
  /** @purpose Canonical immutable source identity observed by the callback. */
  sourceId: string;
  /** @purpose Exact immutable source version observed by the callback. */
  sourceVersion: string;
  /** @purpose Digest of immutable source bytes observed by the callback. */
  sourceDigest: string;
  /** @purpose Canonical operation target observed by the callback. */
  targetId: string;
  /** @purpose Closed operation kind observed by the callback. */
  operation: ReviewRuntimeOperation;
  /** @purpose Canonical arguments derived from the callback invocation. */
  normalizedArguments: Record<string, string | number | boolean>;
  /** @purpose Exact observed byte or line interval. */
  range?: { start: number; end: number };
  /** @purpose Versioned semantic source anchor observed by the callback. */
  semanticAnchor?: string;
  /** @purpose Exact content observed by the control plane. */
  content: string;
  /** @purpose Raw operation outcome captured for digesting. */
  outcome: unknown;
  /** @purpose Terminal callback status. */
  status: 'SUCCEEDED' | 'FAILED';
  /** @purpose Trusted callback observation time retained across idempotent replay. */
  observedAt: string;
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

/** @purpose Normalize callback arguments into deterministic key order before identity hashing. */
function normalizeArguments(
  argumentsByName: Record<string, string | number | boolean>
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(argumentsByName).sort(([left], [right]) => left.localeCompare(right))
  );
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
   * @purpose Record one operation whose source, target, arguments, bytes and outcome are callback-owned.
   * @invariant Agent-authored response fields are not accepted by the recorder API and cannot affect receipt identity.
   * @param context Immutable round identity fixed before execution.
   * @param callback Control-plane-owned operation callback.
   * @returns Evidence eligibility only after durable acknowledgment.
   */
  async recordTrustedOperation(
    context: ReviewRuntimeReceiptContext,
    callback: () => Promise<ReviewRuntimeObservation>
  ): Promise<ReviewRuntimeReceiptRecordResult> {
    const observation = await callback();
    const normalizedArguments = normalizeArguments(observation.normalizedArguments);
    const observedContentDigest = digest(observation.content);
    const outcomeDigest = digest({ outcome: observation.outcome, status: observation.status });
    const receiptIdentity = {
      ...context,
      sourceId: observation.sourceId,
      sourceVersion: observation.sourceVersion,
      sourceDigest: observation.sourceDigest,
      targetId: observation.targetId,
      operation: observation.operation,
      normalizedArguments,
      range: observation.range,
      semanticAnchor: observation.semanticAnchor,
      observedContentDigest,
      outcomeDigest,
      outcome: observation.status,
    };
    const receiptId = `receipt:${digest(receiptIdentity)}`;
    const receipt: ReviewRuntimeReceipt = Object.freeze({
      receiptId,
      contractId: context.contractId,
      contractVersion: context.contractVersion,
      manifestKeyDigest: context.manifestKeyDigest,
      sessionId: context.sessionId,
      taskId: context.taskId,
      sourceId: observation.sourceId,
      sourceVersion: observation.sourceVersion,
      sourceDigest: observation.sourceDigest,
      targetId: observation.targetId,
      operation: observation.operation,
      normalizedArguments,
      range: observation.range,
      semanticAnchor: observation.semanticAnchor,
      observedContentDigest,
      outcomeDigest,
      outcome: observation.status,
      sequence: context.nextSequence,
      recordedAt: observation.observedAt,
    });
    const appended = this._store.appendReceipt(context, receipt);
    if (appended.status === 'REJECTED') return { status: 'INELIGIBLE', reason: appended.reason };
    return { status: 'ELIGIBLE', receipt, durableDigest: appended.digest };
  }
}
