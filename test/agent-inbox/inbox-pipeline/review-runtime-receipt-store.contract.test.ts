// @file: Shared port contract tests for trusted receipt and consumption append-only storage.
// @consumers: TSK-176 audit
// @tasks: TSK-176

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LocalReviewRuntimeReceiptStoreAdapter } from '../../../services/agent-inbox/modules/inbox-pipeline/adapters/local-review-runtime-receipt-store.adapter.ts';
import { MemoryReviewRuntimeReceiptStoreAdapter } from '../../../services/agent-inbox/modules/inbox-pipeline/adapters/memory-review-runtime-receipt-store.adapter.ts';
import type { ReviewReceiptConsumption } from '../../../services/agent-inbox/modules/inbox-pipeline/model/review-receipt-consumption.ts';
import type {
  ReviewReceiptStoreContext,
  ReviewRuntimeReceiptStorePort,
} from '../../../services/agent-inbox/modules/inbox-pipeline/ports/review-runtime-receipt-store.port.ts';
import type { ReviewRuntimeReceipt } from '../../../services/agent-inbox/modules/inbox-pipeline/types/review-runtime-receipt.type.ts';

type ReceiptStoreContext = {
  store: MemoryReviewRuntimeReceiptStoreAdapter;
  context: ReviewReceiptStoreContext;
  receipt: ReviewRuntimeReceipt;
  consumption: ReviewReceiptConsumption;
};
function createReceiptStoreContext(): ReceiptStoreContext {
  const context = { namespace: 'run-1', contractId: 'c', manifestKeyDigest: 'm' };
  const receipt: ReviewRuntimeReceipt = {
    receiptId: 'r1',
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
    observedContentDigest: 'o',
    outcomeDigest: 'x',
    outcome: 'SUCCEEDED',
    sequence: 1,
    recordedAt: 'now',
  };
  const consumption: ReviewReceiptConsumption = {
    consumptionId: 'u1',
    receiptId: 'r1',
    contractId: 'c',
    contractVersion: '1',
    manifestKeyDigest: 'm',
    slotId: 'slot',
    evidenceId: 'e',
    reusePolicy: 'DENY',
    sequence: 1,
    recordedAt: 'now',
    digest: 'u',
  };
  return {
    store: new MemoryReviewRuntimeReceiptStoreAdapter('run-1'),
    context,
    receipt,
    consumption,
  };
}

describe('ReviewRuntimeReceiptStorePort', () => {
  it('receipt store port has typed append replay read and no mutation surface', () => {
    const portKeys: (keyof ReviewRuntimeReceiptStorePort)[] = [
      'appendReceipt',
      'appendConsumption',
      'readReceipts',
      'readConsumptions',
    ];
    assert.deepStrictEqual(portKeys, [
      'appendReceipt',
      'appendConsumption',
      'readReceipts',
      'readConsumptions',
    ]);
  });

  it('local receipt adapter satisfies exact port contract', () => {
    const adapter: ReviewRuntimeReceiptStorePort = Object.create(
      LocalReviewRuntimeReceiptStoreAdapter.prototype
    ) as LocalReviewRuntimeReceiptStoreAdapter;
    assert.strictEqual(typeof adapter.appendReceipt, 'function');
    assert.strictEqual(typeof adapter.readConsumptions, 'function');
  });

  it('memory receipt adapter satisfies exact isolated port contract', () => {
    const { store, context, receipt } = createReceiptStoreContext();
    assert.strictEqual(store.appendReceipt(context, receipt).status, 'APPENDED');
    assert.strictEqual(store.readReceipts({ ...context, namespace: 'other' }).status, 'REJECTED');
  });

  it('consumption replay is idempotent and conflicts preserve append only logs', () => {
    const { store, context, receipt, consumption } = createReceiptStoreContext();
    store.appendReceipt(context, receipt);
    assert.strictEqual(store.appendConsumption(context, consumption).status, 'APPENDED');
    assert.strictEqual(store.appendConsumption(context, consumption).status, 'REPLAYED');
    assert.strictEqual(
      store.appendConsumption(context, { ...consumption, evidenceId: 'other' }).status,
      'REJECTED'
    );
    const read = store.readConsumptions(context);
    assert.strictEqual(read.status === 'READ' ? read.records.length : -1, 1);
  });
});
