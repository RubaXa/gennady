// @file: Immutable deterministic aggregate of review obligations and total input mappings.
// @consumers: ReviewPlan, ReviewOrchestrator, ReviewStructuralValidator, ReviewRepairCoordinator
// @tasks: TSK-176

import type { ReviewContractInputMapping } from '../types/review-contract-input-mapping.type.ts';
import type { ReviewContractSlot } from '../types/review-contract-slot.type.ts';
import type { ReviewIntent } from '../types/review-intent.type.ts';

/** @purpose Canonical machine-readable completeness target for one sealed manifest. */
export type ReviewContract = Readonly<{
  status: 'COMPILED';
  contractId: string;
  contractVersion: string;
  ref: string;
  manifestRef: string;
  manifestKeyDigest: string;
  intent: ReviewIntent;
  slots: readonly ReviewContractSlot[];
  inputMappings: readonly ReviewContractInputMapping[];
  catalogVersion: string;
  catalogDigest: string;
  compilerVersion: string;
  semanticDigest: string;
}>;

/** @purpose Persisted atomic compilation failure with no partial contract. */
export type ReviewContractCompilationBlocked = Readonly<{
  status: 'BLOCKED';
  manifestRef: string;
  reasons: readonly string[];
  persisted: true;
}>;

/** @purpose Exhaustive atomic contract compiler outcome. */
export type ReviewContractCompilationResult = ReviewContract | ReviewContractCompilationBlocked;
