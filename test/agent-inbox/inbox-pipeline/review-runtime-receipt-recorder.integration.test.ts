// @file: Integration test for durable acknowledgment before trusted evidence eligibility.
// @consumers: TSK-176 audit
// @tasks: TSK-176

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MemoryReviewRuntimeReceiptStoreAdapter } from '../../../services/agent-inbox/modules/inbox-pipeline/adapters/memory-review-runtime-receipt-store.adapter.ts';
import {
  ReviewRuntimeReceiptRecorder,
  type ReviewRuntimeReceiptContext,
} from '../../../services/agent-inbox/modules/inbox-pipeline/receipts/review-runtime-receipt-recorder.ts';

type ReceiptRecorderContext = { operation: ReviewRuntimeReceiptContext };
function createReceiptRecorderContext(): ReceiptRecorderContext {
  return {
    operation: {
      namespace: 'run',
      contractId: 'c',
      contractVersion: '1',
      manifestKeyDigest: 'm',
      sessionId: 's',
      taskId: 't',
      sourceId: 'src',
      sourceVersion: '1',
      sourceDigest: 'd',
      targetId: 'target',
      operation: 'READ',
      normalizedArguments: {},
      nextSequence: 1,
    },
  };
}

describe('ReviewRuntimeReceiptRecorder', () => {
  it('durable receipt acknowledgment precedes evidence eligibility', async () => {
    const { operation } = createReceiptRecorderContext();
    const failing = new ReviewRuntimeReceiptRecorder(
      new MemoryReviewRuntimeReceiptStoreAdapter('run', { receiptSequences: [1] })
    );
    const rejected = await failing.recordTrustedOperation(operation, async () => ({
      content: 'source',
      outcome: 'ok',
      status: 'SUCCEEDED',
    }));
    assert.strictEqual(rejected.status, 'INELIGIBLE');
    const recorder = new ReviewRuntimeReceiptRecorder(
      new MemoryReviewRuntimeReceiptStoreAdapter('run')
    );
    const eligible = await recorder.recordTrustedOperation(operation, async () => ({
      content: 'source',
      outcome: 'ok',
      status: 'SUCCEEDED',
    }));
    assert.strictEqual(eligible.status, 'ELIGIBLE');
  });
});
