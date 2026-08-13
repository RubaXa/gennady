// @file: Integration test for durable acknowledgment before trusted evidence eligibility.
// @consumers: TSK-176 audit, TSK-190 trusted observation audit
// @tasks: TSK-176, TSK-190

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
      nextSequence: 1,
    },
  };
}

describe('ReviewRuntimeReceiptRecorder', () => {
  it('trusted receipt derives all operation facts from callback observation', async () => {
    const { operation } = createReceiptRecorderContext();
    const store = new MemoryReviewRuntimeReceiptStoreAdapter('run');
    const recorder = new ReviewRuntimeReceiptRecorder(store);
    const agentClaims = {
      sourceId: 'forged-agent-source',
      targetId: '/forged/target',
      normalizedArguments: { path: '/forged/target' },
      content: 'forged bytes',
      outcome: 'forged success',
    };
    const observedAt = '2026-08-13T12:00:00.000Z';
    const recorded = await recorder.recordTrustedOperation(operation, async () => ({
      sourceId: 'source:actual',
      sourceVersion: 'head-190',
      sourceDigest: 'digest:actual',
      targetId: 'control-plane/sources/actual.txt',
      operation: 'READ',
      normalizedArguments: { tool: 'read', path: 'control-plane/sources/actual.txt' },
      range: { start: 0, end: 12 },
      semanticAnchor: 'actual.ts#Runtime',
      content: 'observed bytes',
      outcome: { status: 200, bytes: 14 },
      status: 'SUCCEEDED',
      observedAt,
    }));

    assert.strictEqual(recorded.status, 'ELIGIBLE');
    assert.ok(recorded.status === 'ELIGIBLE');
    assert.deepStrictEqual(
      {
        sourceId: recorded.receipt.sourceId,
        targetId: recorded.receipt.targetId,
        normalizedArguments: recorded.receipt.normalizedArguments,
        observedContentDigest: recorded.receipt.observedContentDigest,
        outcomeDigest: recorded.receipt.outcomeDigest,
        outcome: recorded.receipt.outcome,
      },
      {
        sourceId: 'source:actual',
        targetId: 'control-plane/sources/actual.txt',
        normalizedArguments: { path: 'control-plane/sources/actual.txt', tool: 'read' },
        observedContentDigest: createHash('sha256').update('observed bytes').digest('hex'),
        outcomeDigest: createHash('sha256')
          .update(JSON.stringify({ outcome: { status: 200, bytes: 14 }, status: 'SUCCEEDED' }))
          .digest('hex'),
        outcome: 'SUCCEEDED',
      }
    );
    assert.notStrictEqual(recorded.receipt.sourceId, agentClaims.sourceId);
    assert.notStrictEqual(recorded.receipt.targetId, agentClaims.targetId);
    assert.notStrictEqual(recorded.receipt.observedContentDigest, agentClaims.content);
  });

  it('callback receipt becomes eligible only after durable append', async () => {
    const { operation } = createReceiptRecorderContext();
    const observation = {
      sourceId: 'src',
      sourceVersion: '1',
      sourceDigest: 'd',
      targetId: 'target',
      operation: 'READ' as const,
      normalizedArguments: {},
      content: 'source',
      outcome: 'ok',
      status: 'SUCCEEDED' as const,
      observedAt: '2026-08-13T12:00:00.000Z',
    };
    const failing = new ReviewRuntimeReceiptRecorder(
      new MemoryReviewRuntimeReceiptStoreAdapter('run', { receiptSequences: [1] })
    );
    const rejected = await failing.recordTrustedOperation(operation, async () => observation);
    assert.strictEqual(rejected.status, 'INELIGIBLE');
    const store = new MemoryReviewRuntimeReceiptStoreAdapter('run');
    const recorder = new ReviewRuntimeReceiptRecorder(store);
    const eligible = await recorder.recordTrustedOperation(operation, async () => observation);
    assert.strictEqual(eligible.status, 'ELIGIBLE');
    const replayed = await recorder.recordTrustedOperation(operation, async () => observation);
    assert.strictEqual(replayed.status, 'ELIGIBLE');
    assert.ok(eligible.status === 'ELIGIBLE' && replayed.status === 'ELIGIBLE');
    assert.strictEqual(replayed.receipt.receiptId, eligible.receipt.receiptId);
    assert.strictEqual(replayed.durableDigest, eligible.durableDigest);
  });
});
