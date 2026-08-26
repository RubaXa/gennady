// @file: One-shot factory constructing every deterministic control-plane boundary owned by PipelineRuntime.
// @consumers: PipelineRuntime
// @tasks: TSK-157, TSK-173

import { LocalReviewRuntimeReceiptStoreAdapter } from '../adapters/local-review-runtime-receipt-store.adapter.ts';
import { ReviewRepairCoordinator } from '../completeness/review-repair-coordinator.ts';
import { ReviewStructuralValidator } from '../completeness/review-structural-validator.ts';
import { ReviewSlotSchemaCatalog } from '../model/review-slot-schema-catalog.ts';
import { ReviewSynthesis } from '../model/review-synthesis.ts';
import { ReviewContractCompiler } from '../planning/review-contract-compiler.ts';
import { ReviewInputManifestBuilder } from '../planning/review-input-manifest-builder.ts';
import { ReviewRuntimeReceiptRecorder } from '../receipts/review-runtime-receipt-recorder.ts';
import { ReviewOrchestrator } from '../review/review-orchestrator.ts';
import { ReviewFreshnessGate } from '../verification/review-freshness-gate.ts';
import type { ReviewManifestKey } from '../types/review-intent.type.ts';
import { ReviewEffectCoordinator } from '../../inbox-queue/effects/review-effect-coordinator.ts';
import { ReviewActionCatalog } from '../../inbox-queue/registry/review-action-catalog.ts';
import { EventReviewRepairJournal, EventReviewFreshnessJournal } from './control-plane-journals.ts';
import type {
  PipelineControlPlaneConfig,
  PipelineControlPlaneComposition,
} from './pipeline-runtime.types.ts';

/**
 * @purpose Construct every deterministic control-plane boundary once under the existing runtime owner.
 * @param config Durable journal, receipt root, namespace and optional effect provider.
 * @returns One immutable reachable control-plane composition.
 */
export function composeControlPlane(
  config: PipelineControlPlaneConfig
): PipelineControlPlaneComposition {
  const receiptStore = new LocalReviewRuntimeReceiptStoreAdapter(
    config.receiptRoot,
    config.runtimeNamespace
  );
  const freshnessJournal = new EventReviewFreshnessJournal(config.journal);
  return Object.freeze({
    manifestBuilder: new ReviewInputManifestBuilder(),
    contractCompiler: new ReviewContractCompiler(new ReviewSlotSchemaCatalog()),
    receiptRecorder: new ReviewRuntimeReceiptRecorder(receiptStore),
    structuralValidator: new ReviewStructuralValidator(receiptStore),
    repairCoordinator: (keyOrRoundId: ReviewManifestKey | string, roundId?: string) => {
      const key =
        typeof keyOrRoundId === 'string'
          ? { mr: keyOrRoundId, headSHA: 'legacy', eventCursor: 'legacy' }
          : keyOrRoundId;
      return new ReviewRepairCoordinator(
        new EventReviewRepairJournal(
          config.journal,
          key,
          roundId ?? (typeof keyOrRoundId === 'string' ? keyOrRoundId : 'round')
        )
      );
    },
    freshnessGate: new ReviewFreshnessGate(freshnessJournal, (_purpose, _key) => ({
      actionCapabilities: Object.freeze({}),
      capabilityVersion: 'review-capabilities-v0',
      dispatchPolicy: { kind: 'RECONCILE_AFTER_EFFECT' },
    })),
    orchestrator: new ReviewOrchestrator(),
    synthesis: new ReviewSynthesis(),
    effectCoordinator: config.vcs
      ? new ReviewEffectCoordinator(config.vcs, config.journal, new ReviewActionCatalog())
      : null,
  });
}
