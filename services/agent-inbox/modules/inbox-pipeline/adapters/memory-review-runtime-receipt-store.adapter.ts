// @file: Isolated deterministic memory backing for trusted receipt contract tests.
// @consumers: ReviewRuntimeReceiptStorePort contract kit, inbox-eval
// @tasks: TSK-176

import { createHash } from 'node:crypto';
import type { ReviewReceiptConsumption } from '../model/review-receipt-consumption.ts';
import type {
  ReviewReceiptStoreAppendResult,
  ReviewReceiptStoreContext,
  ReviewReceiptStoreReadResult,
  ReviewRuntimeReceiptStorePort,
} from '../ports/review-runtime-receipt-store.port.ts';
import type { ReviewRuntimeReceipt } from '../types/review-runtime-receipt.type.ts';

/** @purpose Deterministic failure injection used only by the isolated memory adapter. */
export type MemoryReviewReceiptFailureSchedule = {
  /** @purpose Receipt sequences rejected before acknowledgment. */
  receiptSequences?: readonly number[];
  /** @purpose Consumption sequences rejected before acknowledgment. */
  consumptionSequences?: readonly number[];
  /** @purpose Fail-closed corruption state for both logs. */
  corrupt?: boolean;
};

function digestRecord(record: unknown): string {
  return createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

/**
 * @purpose Run-id-isolated append-only implementation of trusted receipt storage.
 * @implements {ReviewRuntimeReceiptStorePort} in services/agent-inbox/modules/inbox-pipeline/ports/review-runtime-receipt-store.port.ts
 */
export class MemoryReviewRuntimeReceiptStoreAdapter implements ReviewRuntimeReceiptStorePort {
  /** @purpose Mandatory isolated test-run namespace. */
  protected readonly _runId: string;
  /** @purpose Deterministic failure injection schedule. */
  protected readonly _failures: MemoryReviewReceiptFailureSchedule;
  /** @purpose Independent append-only receipt sequence. */
  protected readonly _receipts: ReviewRuntimeReceipt[] = [];
  /** @purpose Independent append-only consumption sequence. */
  protected readonly _consumptions: ReviewReceiptConsumption[] = [];

  /**
   * @purpose Create one run-id-isolated deterministic store.
   * @param runId Mandatory isolated test-run namespace.
   * @param [failures] Optional deterministic failure schedule.
   */
  constructor(runId: string, failures: MemoryReviewReceiptFailureSchedule = {}) {
    if (!runId)
      throw new Error('[MemoryReviewRuntimeReceiptStoreAdapter#constructor] runId is required');
    this._runId = runId;
    this._failures = failures;
  }

  /** @see {ReviewRuntimeReceiptStorePort#appendReceipt} in services/agent-inbox/modules/inbox-pipeline/ports/review-runtime-receipt-store.port.ts */
  appendReceipt(
    context: ReviewReceiptStoreContext,
    receipt: ReviewRuntimeReceipt
  ): ReviewReceiptStoreAppendResult {
    return this._append(context, receipt, this._receipts, this._failures.receiptSequences ?? []);
  }

  /** @see {ReviewRuntimeReceiptStorePort#appendConsumption} in services/agent-inbox/modules/inbox-pipeline/ports/review-runtime-receipt-store.port.ts */
  appendConsumption(
    context: ReviewReceiptStoreContext,
    consumption: ReviewReceiptConsumption
  ): ReviewReceiptStoreAppendResult {
    return this._append(
      context,
      consumption,
      this._consumptions,
      this._failures.consumptionSequences ?? []
    );
  }

  /** @see {ReviewRuntimeReceiptStorePort#readReceipts} in services/agent-inbox/modules/inbox-pipeline/ports/review-runtime-receipt-store.port.ts */
  readReceipts(
    context: ReviewReceiptStoreContext
  ): ReviewReceiptStoreReadResult<ReviewRuntimeReceipt> {
    return this._read(context, this._receipts);
  }

  /** @see {ReviewRuntimeReceiptStorePort#readConsumptions} in services/agent-inbox/modules/inbox-pipeline/ports/review-runtime-receipt-store.port.ts */
  readConsumptions(
    context: ReviewReceiptStoreContext
  ): ReviewReceiptStoreReadResult<ReviewReceiptConsumption> {
    return this._read(context, this._consumptions);
  }

  /**
   * @purpose Append or replay one record with monotonic ordering.
   * @param context Immutable round storage context.
   * @param record Sequenced immutable record.
   * @param records Selected independent in-memory log.
   * @param failedSequences Deterministic append failure points.
   * @returns Durable simulation acknowledgment or fail-closed rejection.
   */
  protected _append<T extends { sequence: number }>(
    context: ReviewReceiptStoreContext,
    record: T,
    records: T[],
    failedSequences: readonly number[]
  ): ReviewReceiptStoreAppendResult {
    if (context.namespace !== this._runId)
      return {
        status: 'REJECTED',
        code: 'NAMESPACE_MISMATCH',
        reason: 'run-id namespace mismatch',
      };
    if (this._failures.corrupt)
      return { status: 'REJECTED', code: 'CORRUPT_LOG', reason: 'injected corruption' };
    const digest = digestRecord(record);
    const existing = records.find((item) => item.sequence === record.sequence);
    if (existing) {
      return digestRecord(existing) === digest
        ? { status: 'REPLAYED', sequence: record.sequence, durable: true, digest }
        : {
            status: 'REJECTED',
            code: 'IDENTITY_CONFLICT',
            reason: 'sequence already contains different record',
          };
    }
    if (record.sequence !== records.length + 1)
      return {
        status: 'REJECTED',
        code: 'SEQUENCE_CONFLICT',
        reason: 'sequence must be exactly next',
      };
    if (failedSequences.includes(record.sequence))
      return { status: 'REJECTED', code: 'DURABILITY_FAILURE', reason: 'injected append failure' };
    records.push(Object.freeze({ ...record }));
    return { status: 'APPENDED', sequence: record.sequence, durable: true, digest };
  }

  /**
   * @purpose Read one complete namespace-isolated in-memory log.
   * @param context Immutable round storage context.
   * @param records Selected independent in-memory log.
   * @returns Complete immutable record projection or fail-closed rejection.
   */
  protected _read<T>(
    context: ReviewReceiptStoreContext,
    records: readonly T[]
  ): ReviewReceiptStoreReadResult<T> {
    if (context.namespace !== this._runId)
      return {
        status: 'REJECTED',
        code: 'NAMESPACE_MISMATCH',
        reason: 'run-id namespace mismatch',
      };
    if (this._failures.corrupt)
      return { status: 'REJECTED', code: 'CORRUPT_LOG', reason: 'injected corruption' };
    return { status: 'READ', records: [...records] };
  }
}
