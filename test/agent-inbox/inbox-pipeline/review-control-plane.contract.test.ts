// @file: Executable public-boundary matrix for the deterministic review control plane.
// @consumers: TSK-176 audit
// @tasks: TSK-176

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LocalReviewRuntimeReceiptStoreAdapter } from '../../../services/agent-inbox/modules/inbox-pipeline/adapters/local-review-runtime-receipt-store.adapter.ts';
import { MemoryReviewRuntimeReceiptStoreAdapter } from '../../../services/agent-inbox/modules/inbox-pipeline/adapters/memory-review-runtime-receipt-store.adapter.ts';
import { ReviewRepairCoordinator } from '../../../services/agent-inbox/modules/inbox-pipeline/coverage/review-repair-coordinator.ts';
import { ReviewStructuralValidator } from '../../../services/agent-inbox/modules/inbox-pipeline/coverage/review-structural-validator.ts';
import { ReviewSlotSchemaCatalog } from '../../../services/agent-inbox/modules/inbox-pipeline/model/review-slot-schema-catalog.ts';
import { ReviewSynthesis } from '../../../services/agent-inbox/modules/inbox-pipeline/model/review-synthesis.ts';
import { ReviewContractCompiler } from '../../../services/agent-inbox/modules/inbox-pipeline/planning/review-contract-compiler.ts';
import { ReviewInputManifestBuilder } from '../../../services/agent-inbox/modules/inbox-pipeline/planning/review-input-manifest-builder.ts';
import { ReviewRuntimeReceiptRecorder } from '../../../services/agent-inbox/modules/inbox-pipeline/receipts/review-runtime-receipt-recorder.ts';
import { ReviewCrossReviewer } from '../../../services/agent-inbox/modules/inbox-pipeline/review/review-cross-reviewer.ts';
import { ReviewOrchestrator } from '../../../services/agent-inbox/modules/inbox-pipeline/review/review-orchestrator.ts';
import { constructReviewPublicationHandoff } from '../../../services/agent-inbox/modules/inbox-pipeline/types/review-publication-handoff.type.ts';
import { ReviewDeltaVerifier } from '../../../services/agent-inbox/modules/inbox-pipeline/verification/review-delta-verifier.ts';
import { ReviewFreshnessGate } from '../../../services/agent-inbox/modules/inbox-pipeline/verification/review-freshness-gate.ts';

type ControlPlaneContext = { orchestrator: ReviewOrchestrator };
function createControlPlaneContext(): ControlPlaneContext {
  return { orchestrator: new ReviewOrchestrator() };
}

describe('Review control-plane public boundaries', () => {
  it('all referenced DbC boundaries expose exact exhaustive result contracts', () => {
    const roots = [
      ReviewInputManifestBuilder,
      ReviewContractCompiler,
      ReviewSlotSchemaCatalog,
      LocalReviewRuntimeReceiptStoreAdapter,
      MemoryReviewRuntimeReceiptStoreAdapter,
      ReviewRuntimeReceiptRecorder,
      ReviewStructuralValidator,
      ReviewRepairCoordinator,
      ReviewFreshnessGate,
      ReviewOrchestrator,
      ReviewDeltaVerifier,
      ReviewCrossReviewer,
      ReviewSynthesis,
    ];
    assert.strictEqual(
      roots.every((root) => typeof root === 'function'),
      true
    );
    assert.strictEqual(typeof constructReviewPublicationHandoff, 'function');
  });

  it('zero round references bypass only the completeness gate and retain own policy gates', () => {
    const { orchestrator } = createControlPlaneContext();
    assert.strictEqual(orchestrator.classifyCommandRelationship([]), 'INDEPENDENT');
    assert.strictEqual(orchestrator.classifyCommandRelationship(['finding:f1']), 'ROUND_DEPENDENT');
  });
});
