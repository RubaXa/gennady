// @file: Type aliases owned by PipelineRuntime — role/options surface, control-plane composition, completion projections.
// @consumers: PipelineRuntime, run-mode.ts (via pipeline-runtime.ts re-export)
// @tasks: TSK-157, TSK-161, TSK-173, TSK-184

import type { JournalPort } from '../../inbox-core/event-journal.ts';
import type { ProposalRecord } from '../../inbox-core/decision-journal.ts';
import type { TaskInstance } from '../../inbox-queue/task-registry.ts';
import type { ReviewEffectCoordinator } from '../../inbox-queue/effects/review-effect-coordinator.ts';
import type { VcsPort } from '../../inbox-vcs/vcs-port.ts';
import type { ChangesetEntry } from '../plan-template.ts';
import type { ToolTrace } from '../coverage-gate.ts';
import type { ModelResult } from '../synthesize.ts';
import type { ReviewIntent, ReviewManifestKey } from '../types/review-intent.type.ts';
import type { ReviewInputManifestResult } from '../model/review-input-manifest.ts';
import type { ReviewContractCompilationResult, ReviewContract } from '../model/review-contract.ts';
import type { ReviewInputManifest } from '../model/review-input-manifest.ts';
import type {
  ReviewInputManifestBuilder,
  ReviewManifestCapture,
} from '../planning/review-input-manifest-builder.ts';
import type { ReviewContractCompiler } from '../planning/review-contract-compiler.ts';
import type { ReviewRuntimeReceiptRecorder } from '../receipts/review-runtime-receipt-recorder.ts';
import type { ReviewStructuralValidator } from '../completeness/review-structural-validator.ts';
import type { ReviewRepairCoordinator } from '../completeness/review-repair-coordinator.ts';
import type { ReviewFreshnessGate } from '../verification/review-freshness-gate.ts';
import type { ReviewOrchestrator } from '../review/review-orchestrator.ts';
import type { ReviewSynthesis } from '../model/review-synthesis.ts';

/** @purpose Role tail selected after the common review DAG finishes. */
export type PipelineRole = 'author' | 'reviewer';

/** @purpose Optional materialization details supplied by the production role scheduler. */
export type ReviewStartOptions = {
  /** @purpose Review role determining the terminal tail. */
  role?: PipelineRole;
  /** @purpose Mandatory/triggered track ids from the deterministic plan. */
  tracks?: string[];
  /** @purpose Real changed files collected by the role context; empty means pipeline cannot claim coverage. */
  changeset?: ChangesetEntry[];
  /** @purpose Tool reads performed by the review workers, consumed by CoverageGate. */
  toolTrace?: ToolTrace[];
  /** @purpose Raw worker/model results, synthesized into the canonical review rather than replaced by a placeholder. */
  modelResults?: ModelResult[];
  /** @purpose Exact immutable review input required by the production control plane. */
  controlPlaneInput?: Readonly<{ intent: ReviewIntent; capture: ReviewManifestCapture }>;
};

/** @purpose Production dependencies from which PipelineRuntime owns one control-plane composition. */
export type PipelineControlPlaneConfig = Readonly<{
  journal: JournalPort;
  receiptRoot: string;
  runtimeNamespace: string;
  model?: string;
  vcs?: VcsPort;
}>;

/** @purpose Authorized manifest and contract identity produced after control-plane execution. */
export type PipelineControlPlaneAuthorization = Readonly<{
  intent: ReviewIntent;
  manifest: ReviewInputManifest;
  contract: ReviewContract;
}>;

/** @purpose Reachable concrete control-plane instances owned by one PipelineRuntime. */
export type PipelineControlPlaneComposition = Readonly<{
  manifestBuilder: ReviewInputManifestBuilder;
  contractCompiler: ReviewContractCompiler;
  receiptRecorder: ReviewRuntimeReceiptRecorder;
  structuralValidator: ReviewStructuralValidator;
  repairCoordinator: (
    keyOrRoundId: ReviewManifestKey | string,
    roundId?: string
  ) => ReviewRepairCoordinator;
  freshnessGate: ReviewFreshnessGate;
  orchestrator: ReviewOrchestrator;
  synthesis: ReviewSynthesis;
  effectCoordinator: ReviewEffectCoordinator | null;
}>;

/** @purpose Typed identity trace proving one production owner for every mandatory boundary. */
export type PipelineControlPlaneConstructionTrace = Readonly<{
  runtimeIdentity: string;
  taskJournalIdentity: string;
  controlJournalIdentity: string;
  separateControlJournal: true;
  boundaries: Readonly<Record<keyof PipelineControlPlaneComposition, string>>;
}>;

/** @purpose Durable manifest and contract preparation result from the boot-owned runtime. */
export type PipelineControlPlanePreparation = Readonly<{
  manifest: ReviewInputManifestResult;
  contract?: ReviewContractCompilationResult;
}>;

/** @purpose Bounded terminal result observed from the runtime-owned durable task queue. */
export type PipelineCompletion = Readonly<{
  runtimeIdentity: string;
  mr: string;
  state: 'completed' | 'failed' | 'blocked';
  taskIds: readonly string[];
  tasks: readonly Readonly<Pick<TaskInstance, 'taskId' | 'type' | 'status'>>[];
  error?: string;
}>;

/** @purpose Canonical persisted artifacts read from the same runtime that drained the review. */
export type PipelineReviewReadback = Readonly<{
  runtimeIdentity: string;
  mr: string;
  artifacts: Readonly<Record<string, unknown>>;
}>;

/** @purpose Hook that executes one queue lifecycle node after Executor marks it running. */
export type PipelineTaskRunner = (task: TaskInstance) => Promise<void>;
/** @purpose Durable production seam for an operator-visible proposal emitted by a pipeline tail. */
export type PipelineProposalSink = (proposal: ProposalRecord) => Promise<void>;

/** @purpose Live worker session retained until CoverageGate has either recovered or escalated. */
export type PipelineWorkerSession = {
  /** @purpose OpenCode session that owns the worker's already-read context. */
  sid: string;
  /** @purpose Concrete fan-out node that created the session. */
  taskType: string;
};
