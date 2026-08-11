// @file: Append-only trusted runtime receipt and consumption storage boundary.
// @consumers: ReviewRuntimeReceiptRecorder, ReviewStructuralValidator
// @tasks: TSK-176

import type { ReviewReceiptConsumption } from '../model/review-receipt-consumption.ts';
import type { ReviewRuntimeReceipt } from '../types/review-runtime-receipt.type.ts';

/** @purpose Namespace and immutable round identity for isolated receipt operations. */
export type ReviewReceiptStoreContext = {
  /** @purpose Selected runtime profile or test-run namespace. */
  namespace: string;
  /** @purpose Exact owning contract identity. */
  contractId: string;
  /** @purpose Digest of exact immutable manifest key. */
  manifestKeyDigest: string;
};

/** @purpose Durable append acknowledgment or fail-closed ordering/replay error. */
export type ReviewReceiptStoreAppendResult =
  | { status: 'APPENDED' | 'REPLAYED'; sequence: number; durable: true; digest: string }
  | {
      status: 'REJECTED';
      code:
        | 'SEQUENCE_CONFLICT'
        | 'IDENTITY_CONFLICT'
        | 'NAMESPACE_MISMATCH'
        | 'CORRUPT_LOG'
        | 'DURABILITY_FAILURE';
      reason: string;
    };

/** @purpose Read result that never hides corruption or namespace mismatch. */
export type ReviewReceiptStoreReadResult<T> =
  | { status: 'READ'; records: readonly T[] }
  | {
      status: 'REJECTED';
      code: 'NAMESPACE_MISMATCH' | 'CORRUPT_LOG' | 'DURABILITY_FAILURE';
      reason: string;
    };

/**
 * @purpose Port separating trusted production durability from isolated deterministic tests.
 * @invariant Receipt and consumption sequences are independent, append-only and monotonic.
 */
export interface ReviewRuntimeReceiptStorePort {
  /**
   * @purpose Append or idempotently replay one immutable trusted receipt.
   * @param context Immutable round storage context.
   * @param receipt Trusted sequenced receipt.
   * @returns Durable acknowledgment or fail-closed rejection.
   */
  appendReceipt(
    context: ReviewReceiptStoreContext,
    receipt: ReviewRuntimeReceipt
  ): ReviewReceiptStoreAppendResult;
  /**
   * @purpose Append or idempotently replay one immutable receipt consumption mapping.
   * @param context Immutable round storage context.
   * @param consumption Trusted sequenced consumption.
   * @returns Durable acknowledgment or fail-closed rejection.
   */
  appendConsumption(
    context: ReviewReceiptStoreContext,
    consumption: ReviewReceiptConsumption
  ): ReviewReceiptStoreAppendResult;
  /**
   * @purpose Read the complete immutable receipt sequence for one round.
   * @param context Immutable round storage context.
   * @returns Complete receipt sequence or fail-closed rejection.
   */
  readReceipts(
    context: ReviewReceiptStoreContext
  ): ReviewReceiptStoreReadResult<ReviewRuntimeReceipt>;
  /**
   * @purpose Read the complete immutable consumption sequence for one round.
   * @param context Immutable round storage context.
   * @returns Complete consumption sequence or fail-closed rejection.
   */
  readConsumptions(
    context: ReviewReceiptStoreContext
  ): ReviewReceiptStoreReadResult<ReviewReceiptConsumption>;
}
