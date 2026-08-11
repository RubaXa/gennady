// @file: Profile-scoped durable append-only trusted receipt storage.
// @consumers: ReviewRuntimeReceiptRecorder, ReviewStructuralValidator, production composition root
// @tasks: TSK-176

import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import type { ReviewReceiptConsumption } from '../model/review-receipt-consumption.ts';
import type {
  ReviewReceiptStoreAppendResult,
  ReviewReceiptStoreContext,
  ReviewReceiptStoreReadResult,
  ReviewRuntimeReceiptStorePort,
} from '../ports/review-runtime-receipt-store.port.ts';
import type { ReviewRuntimeReceipt } from '../types/review-runtime-receipt.type.ts';

type StoredRecord<T> = { digest: string; record: T };

function digestRecord(record: unknown): string {
  return createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

/**
 * @purpose Durable profile-scoped implementation of independent receipt and consumption logs.
 * @implements {ReviewRuntimeReceiptStorePort} in services/agent-inbox/modules/inbox-pipeline/ports/review-runtime-receipt-store.port.ts
 * @invariant Append acknowledgment follows fsync and corrupt tails fail closed.
 */
export class LocalReviewRuntimeReceiptStoreAdapter implements ReviewRuntimeReceiptStorePort {
  /** @purpose Root containing isolated production profiles. */
  protected readonly _profileRoot: string;
  /** @purpose Selected production profile namespace. */
  protected readonly _profileId: string;

  /**
   * @purpose Open durable receipt storage for one production profile.
   * @param profileRoot Root containing isolated production profiles.
   * @param profileId Selected production profile namespace.
   */
  constructor(profileRoot: string, profileId: string) {
    if (!profileRoot || !profileId)
      throw new Error(
        '[LocalReviewRuntimeReceiptStoreAdapter#constructor] profile root and id are required'
      );
    this._profileRoot = profileRoot;
    this._profileId = profileId;
    mkdirSync(join(profileRoot, profileId), { recursive: true });
  }

  /** @see {ReviewRuntimeReceiptStorePort#appendReceipt} in services/agent-inbox/modules/inbox-pipeline/ports/review-runtime-receipt-store.port.ts */
  appendReceipt(
    context: ReviewReceiptStoreContext,
    receipt: ReviewRuntimeReceipt
  ): ReviewReceiptStoreAppendResult {
    return this._append(context, 'receipts.jsonl', receipt);
  }

  /** @see {ReviewRuntimeReceiptStorePort#appendConsumption} in services/agent-inbox/modules/inbox-pipeline/ports/review-runtime-receipt-store.port.ts */
  appendConsumption(
    context: ReviewReceiptStoreContext,
    consumption: ReviewReceiptConsumption
  ): ReviewReceiptStoreAppendResult {
    return this._append(context, 'consumptions.jsonl', consumption);
  }

  /** @see {ReviewRuntimeReceiptStorePort#readReceipts} in services/agent-inbox/modules/inbox-pipeline/ports/review-runtime-receipt-store.port.ts */
  readReceipts(
    context: ReviewReceiptStoreContext
  ): ReviewReceiptStoreReadResult<ReviewRuntimeReceipt> {
    return this._read(context, 'receipts.jsonl');
  }

  /** @see {ReviewRuntimeReceiptStorePort#readConsumptions} in services/agent-inbox/modules/inbox-pipeline/ports/review-runtime-receipt-store.port.ts */
  readConsumptions(
    context: ReviewReceiptStoreContext
  ): ReviewReceiptStoreReadResult<ReviewReceiptConsumption> {
    return this._read(context, 'consumptions.jsonl');
  }

  /**
   * @purpose Durably append or replay one record in an independent log.
   * @param context Immutable round storage context.
   * @param name Independent append-only log name.
   * @param record Sequenced immutable record.
   * @returns Durable acknowledgment or fail-closed rejection.
   */
  protected _append<T extends { sequence: number }>(
    context: ReviewReceiptStoreContext,
    name: string,
    record: T
  ): ReviewReceiptStoreAppendResult {
    if (context.namespace !== this._profileId)
      return {
        status: 'REJECTED',
        code: 'NAMESPACE_MISMATCH',
        reason: 'profile namespace mismatch',
      };
    const current = this._read<T>(context, name);
    if (current.status === 'REJECTED') return current;
    const digest = digestRecord(record);
    const existing = current.records.find((item) => item.sequence === record.sequence);
    if (existing) {
      return digestRecord(existing) === digest
        ? { status: 'REPLAYED', sequence: record.sequence, durable: true, digest }
        : {
            status: 'REJECTED',
            code: 'IDENTITY_CONFLICT',
            reason: 'sequence already contains different record',
          };
    }
    if (record.sequence !== current.records.length + 1)
      return {
        status: 'REJECTED',
        code: 'SEQUENCE_CONFLICT',
        reason: 'sequence must be exactly next',
      };
    const path = this._path(context, name);
    mkdirSync(
      join(this._profileRoot, this._profileId, context.contractId, context.manifestKeyDigest),
      { recursive: true }
    );
    const descriptor = openSync(path, 'a');
    try {
      writeSync(descriptor, `${JSON.stringify({ digest, record } satisfies StoredRecord<T>)}\n`);
      fsyncSync(descriptor);
      return { status: 'APPENDED', sequence: record.sequence, durable: true, digest };
    } catch (cause) {
      return {
        status: 'REJECTED',
        code: 'DURABILITY_FAILURE',
        reason: cause instanceof Error ? cause.message : String(cause),
      };
    } finally {
      closeSync(descriptor);
    }
  }

  /**
   * @purpose Read and digest-verify one complete independent log.
   * @param context Immutable round storage context.
   * @param name Independent append-only log name.
   * @returns Complete record sequence or fail-closed corruption result.
   */
  protected _read<T>(
    context: ReviewReceiptStoreContext,
    name: string
  ): ReviewReceiptStoreReadResult<T> {
    if (context.namespace !== this._profileId)
      return {
        status: 'REJECTED',
        code: 'NAMESPACE_MISMATCH',
        reason: 'profile namespace mismatch',
      };
    const path = this._path(context, name);
    if (!existsSync(path)) return { status: 'READ', records: [] };
    try {
      const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
      const records: T[] = [];
      for (const line of lines) {
        const stored = JSON.parse(line) as StoredRecord<T>;
        if (!stored.record || stored.digest !== digestRecord(stored.record))
          return { status: 'REJECTED', code: 'CORRUPT_LOG', reason: 'record digest mismatch' };
        records.push(stored.record);
      }
      return { status: 'READ', records };
    } catch (cause) {
      return {
        status: 'REJECTED',
        code: 'CORRUPT_LOG',
        reason: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }

  /**
   * @purpose Resolve a profile and round isolated log path.
   * @param context Immutable round storage context.
   * @param name Independent append-only log name.
   * @returns Isolated absolute log path.
   */
  protected _path(context: ReviewReceiptStoreContext, name: string): string {
    return join(
      this._profileRoot,
      this._profileId,
      context.contractId,
      context.manifestKeyDigest,
      name
    );
  }
}
