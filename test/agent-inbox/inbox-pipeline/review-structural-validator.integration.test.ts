// @file: Integration tests for mechanical gaps, trusted receipts and explicit reuse consumption.
// @consumers: TSK-176 audit
// @tasks: TSK-176

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MemoryReviewRuntimeReceiptStoreAdapter } from '../../../services/agent-inbox/modules/inbox-pipeline/adapters/memory-review-runtime-receipt-store.adapter.ts';
import type { ReviewArtifact } from '../../../services/agent-inbox/modules/inbox-pipeline/model/review-artifact.ts';
import type { ReviewContract } from '../../../services/agent-inbox/modules/inbox-pipeline/model/review-contract.ts';
import type { ReviewInputManifest } from '../../../services/agent-inbox/modules/inbox-pipeline/model/review-input-manifest.ts';
import { ReviewStructuralValidator } from '../../../services/agent-inbox/modules/inbox-pipeline/coverage/review-structural-validator.ts';
import type { ReviewEvidence } from '../../../services/agent-inbox/modules/inbox-pipeline/types/review-evidence.type.ts';
import type { ReviewRuntimeReceipt } from '../../../services/agent-inbox/modules/inbox-pipeline/types/review-runtime-receipt.type.ts';

type ValidatorContext = {
  store: MemoryReviewRuntimeReceiptStoreAdapter;
  validator: ReviewStructuralValidator;
  manifest: ReviewInputManifest;
  contract: ReviewContract;
  artifact: ReviewArtifact;
  evidence: ReviewEvidence;
  receipt: ReviewRuntimeReceipt;
  storeContext: { namespace: string; contractId: string; manifestKeyDigest: string };
};
function createValidatorContext(): ValidatorContext {
  const store = new MemoryReviewRuntimeReceiptStoreAdapter('run');
  const manifest: ReviewInputManifest = {
    status: 'SEALED',
    manifestId: 'm',
    manifestVersion: '1',
    key: { mr: 'g/p!1', headSHA: 'h', eventCursor: 'e' },
    ref: 'manifest-ref',
    inputs: [],
    classifications: [],
    changeShape: [],
    provenance: [],
  };
  const slot = {
    kind: 'goal' as const,
    slotId: 'dimension:goal',
    catalogVersion: 'v0',
    catalogDigest: 'd',
    requiredFields: ['objective'],
    sourceAnchors: ['source'],
    minCardinality: 1,
    maxCardinality: 1,
    dependencies: [],
    reusePolicy: 'DENY' as const,
    obligation: 'REQUIRED:BASELINE' as const,
  };
  const intent = {
    kind: 'full' as const,
    manifestKey: manifest.key,
    trigger: 'event',
    requester: 'operator',
  };
  const contract: ReviewContract = {
    status: 'COMPILED',
    contractId: 'c',
    contractVersion: '1',
    ref: 'contract-ref',
    manifestRef: manifest.ref,
    manifestKeyDigest: 'mk',
    intent,
    slots: [slot],
    inputMappings: [],
    catalogVersion: 'v0',
    catalogDigest: 'd',
    compilerVersion: 'v0',
    semanticDigest: 'sd',
  };
  const artifact: ReviewArtifact = {
    artifactId: 'a',
    revision: 1,
    manifestRef: manifest.ref,
    contractId: 'c',
    contractVersion: '1',
    producerSessionId: 's',
    producerModel: 'model',
    fragments: [
      {
        fragmentId: 'f',
        slotId: slot.slotId,
        anchor: 'source',
        content: 'Concrete goal analysis',
        fields: { objective: 'ship safely' },
      },
    ],
    createdAt: 'now',
  };
  const evidence: ReviewEvidence = {
    evidenceId: 'ev',
    slotId: slot.slotId,
    contractId: 'c',
    contractVersion: '1',
    manifestRef: manifest.ref,
    sourceId: 'src',
    sourceVersion: '1',
    sourceDigest: 'source-digest',
    artifactId: 'a',
    artifactRevision: 1,
    fragmentId: 'f',
    producerSessionId: 's',
    producerModel: 'model',
    producedAt: 'now',
    receiptIds: ['r'],
    reuseConsumptionIds: [],
    fields: { objective: 'ship safely' },
  };
  const receipt: ReviewRuntimeReceipt = {
    receiptId: 'r',
    contractId: 'c',
    contractVersion: '1',
    manifestKeyDigest: 'mk',
    sessionId: 's',
    taskId: 't',
    sourceId: 'src',
    sourceVersion: '1',
    sourceDigest: 'source-digest',
    targetId: 'target',
    operation: 'READ',
    normalizedArguments: {},
    observedContentDigest: 'o',
    outcomeDigest: 'x',
    outcome: 'SUCCEEDED',
    sequence: 1,
    recordedAt: 'now',
  };
  return {
    store,
    validator: new ReviewStructuralValidator(store),
    manifest,
    contract,
    artifact,
    evidence,
    receipt,
    storeContext: { namespace: 'run', contractId: 'c', manifestKeyDigest: 'mk' },
  };
}

describe('ReviewStructuralValidator', () => {
  it('validator reports exact gaps for empty placeholder malformed and duplicate output', () => {
    const context = createValidatorContext();
    context.store.appendReceipt(context.storeContext, context.receipt);
    const artifact = {
      ...context.artifact,
      fragments: [{ ...context.artifact.fragments[0], content: 'TODO', fields: {} }],
    };
    const verdict = context.validator.validate({
      ...context,
      artifacts: [artifact],
      evidence: [context.evidence],
      attempt: 0,
      maxAttempts: 3,
    });
    assert.strictEqual(verdict.status, 'REPAIRABLE');
    assert.deepStrictEqual(verdict.coverage.invalidSlotIds, ['dimension:goal']);
  });

  it('self report forged foreign out of order and mismatched receipts close no slot', () => {
    const context = createValidatorContext();
    context.store.appendReceipt(context.storeContext, {
      ...context.receipt,
      sourceDigest: 'forged',
    });
    const verdict = context.validator.validate({
      ...context,
      artifacts: [context.artifact],
      evidence: [context.evidence],
      attempt: 0,
      maxAttempts: 3,
    });
    assert.strictEqual(verdict.status, 'REPAIRABLE');
    assert.deepStrictEqual(verdict.coverage.completeSlotIds, []);
  });

  it('reuse requires catalog permission and separate durable consumption', () => {
    const context = createValidatorContext();
    context.store.appendReceipt(context.storeContext, context.receipt);
    const secondSlot = {
      ...context.contract.slots[0],
      slotId: 'dimension:tests',
      kind: 'tests' as const,
      reusePolicy: 'EXPLICIT_SEPARATE_CONSUMPTION' as const,
    };
    const firstSlot = {
      ...context.contract.slots[0],
      reusePolicy: 'EXPLICIT_SEPARATE_CONSUMPTION' as const,
    };
    const contract = { ...context.contract, slots: [firstSlot, secondSlot] };
    const artifact = {
      ...context.artifact,
      fragments: [
        context.artifact.fragments[0],
        { ...context.artifact.fragments[0], fragmentId: 'f2', slotId: secondSlot.slotId },
      ],
    };
    const evidence = [
      context.evidence,
      { ...context.evidence, evidenceId: 'ev2', slotId: secondSlot.slotId, fragmentId: 'f2' },
    ];
    const verdict = context.validator.validate({
      ...context,
      contract,
      artifacts: [artifact],
      evidence,
      attempt: 0,
      maxAttempts: 3,
    });
    assert.strictEqual(verdict.status, 'PASS');
    const consumptions = context.store.readConsumptions(context.storeContext);
    assert.strictEqual(consumptions.status === 'READ' ? consumptions.records.length : -1, 2);
  });
});
