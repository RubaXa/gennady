// @file: Integration tests for role-invariant six-dimension execution and publication gating.
// @consumers: TSK-176 audit
// @tasks: TSK-176

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MemoryReviewRuntimeReceiptStoreAdapter } from '../../../services/agent-inbox/modules/inbox-pipeline/adapters/memory-review-runtime-receipt-store.adapter.ts';
import { ReviewSlotSchemaCatalog } from '../../../services/agent-inbox/modules/inbox-pipeline/model/review-slot-schema-catalog.ts';
import { ReviewContractCompiler } from '../../../services/agent-inbox/modules/inbox-pipeline/planning/review-contract-compiler.ts';
import { ReviewInputManifestBuilder } from '../../../services/agent-inbox/modules/inbox-pipeline/planning/review-input-manifest-builder.ts';
import { ReviewRuntimeReceiptRecorder } from '../../../services/agent-inbox/modules/inbox-pipeline/receipts/review-runtime-receipt-recorder.ts';
import { ReviewOrchestrator } from '../../../services/agent-inbox/modules/inbox-pipeline/review/review-orchestrator.ts';
import type { ReviewCompletenessVerdict } from '../../../services/agent-inbox/modules/inbox-pipeline/types/review-completeness-verdict.type.ts';

type OrchestratorContext = { orchestrator: ReviewOrchestrator };
function createOrchestratorContext(): OrchestratorContext {
  return { orchestrator: new ReviewOrchestrator() };
}

describe('ReviewOrchestrator', () => {
  it('goal architecture specifications tests security and optimality read immutable sources through receipts', async () => {
    const { orchestrator } = createOrchestratorContext();
    const intent = {
      kind: 'full' as const,
      manifestKey: { mr: 'g/p!1', headSHA: 'h', eventCursor: 'e' },
      trigger: 'event',
      requester: 'operator',
    };
    const manifest = new ReviewInputManifestBuilder().captureAndSeal(intent, {
      inputs: [
        {
          inputId: 'file:a.ts',
          kind: 'file',
          canonicalIdentity: 'a.ts',
          version: 'h',
          digest: 'd',
        },
      ],
      classifications: [
        {
          inputId: 'file:a.ts',
          code: 'BEHAVIOR_CHANGED',
          changeShape: [
            'ARCHITECTURE_CHANGED',
            'SPECIFICATION_TOUCHED',
            'TEST_SURFACE_CHANGED',
            'SECURITY_SURFACE_CHANGED',
            'OPTIMALITY_RELEVANT',
          ],
          rationaleDigest: 'r',
          classifierVersion: 'review-classifier-v0',
        },
      ],
      provenance: [],
    });
    assert.strictEqual(manifest.status, 'SEALED');
    if (manifest.status !== 'SEALED') return;
    const contract = new ReviewContractCompiler(new ReviewSlotSchemaCatalog()).compileAtomically(
      manifest,
      intent
    );
    assert.strictEqual(contract.status, 'COMPILED');
    if (contract.status !== 'COMPILED') return;
    const store = new MemoryReviewRuntimeReceiptStoreAdapter('run');
    const recorder = new ReviewRuntimeReceiptRecorder(store);
    let sequence = 0;
    const round = await orchestrator.execute(contract, async (slotId) => {
      sequence += 1;
      const result = await recorder.recordTrustedOperation(
        {
          namespace: 'run',
          contractId: contract.contractId,
          contractVersion: contract.contractVersion,
          manifestKeyDigest: contract.manifestKeyDigest,
          sessionId: 's',
          taskId: slotId,
          sourceId: manifest.ref,
          sourceVersion: manifest.manifestVersion,
          sourceDigest: manifest.ref,
          targetId: slotId,
          operation: 'READ',
          normalizedArguments: {},
          nextSequence: sequence,
        },
        async () => ({ content: slotId, outcome: 'read', status: 'SUCCEEDED' })
      );
      return {
        status: result.status === 'ELIGIBLE' ? ('COMPLETE' as const) : ('FAILED' as const),
        provenance: result.status === 'ELIGIBLE' ? [result.receipt.receiptId] : [],
      };
    });
    assert.strictEqual(round.status, 'COMPLETED');
    const dimensions = contract.slots.filter((slot) =>
      ['goal', 'architecture', 'specification', 'tests', 'security', 'optimality'].includes(
        slot.kind
      )
    );
    assert.deepStrictEqual(
      dimensions.map((slot) => slot.obligation),
      [
        'REQUIRED:BASELINE',
        'REQUIRED:ARCHITECTURE_CHANGED',
        'REQUIRED:SPECIFICATION_TOUCHED',
        'REQUIRED:BASELINE',
        'REQUIRED:SECURITY_SURFACE_CHANGED',
        'REQUIRED:OPTIMALITY_RELEVANT',
      ]
    );
  });

  it('no incomplete blocked stale or semantically unfinished round publishes downstream', () => {
    const { orchestrator } = createOrchestratorContext();
    const coverage = {
      requiredSlotIds: [],
      completeSlotIds: [],
      missingSlotIds: [],
      invalidSlotIds: [],
      notApplicableSlotIds: [],
      sourceCoverage: {},
      lensCoverage: {},
      entityCoverage: {},
      fileCoverage: {},
      diagramCoverage: {},
      receiptMappings: {},
    };
    const base = {
      verdictId: 'v',
      contractId: 'c',
      contractVersion: '1',
      manifestRef: 'm',
      coverage,
      validatorVersion: '1',
      evaluatedAt: 'now',
    };
    const pass: ReviewCompletenessVerdict = { ...base, status: 'PASS', fresh: true };
    assert.strictEqual(orchestrator.canPublish(pass, false), false);
    assert.strictEqual(orchestrator.canPublish(pass, true), true);
  });
});
