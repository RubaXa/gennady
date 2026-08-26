// @file: Fail-closed structural completeness validator — mechanical gaps, trusted receipts, explicit reuse.
// @consumers: PipelineRuntime, ReviewRepairCoordinator, ReviewFreshnessGate
// @tasks: TSK-176

import { createHash, randomUUID } from 'node:crypto';
import type { ReviewReceiptConsumption } from '../model/review-receipt-consumption.ts';
import type {
  ReviewReceiptStoreContext,
  ReviewRuntimeReceiptStorePort,
} from '../ports/review-runtime-receipt-store.port.ts';
import type { ReviewArtifact, ReviewArtifactFragment } from '../model/review-artifact.ts';
import type { ReviewContract } from '../model/review-contract.ts';
import type { ReviewContractSlot } from '../types/review-contract-slot.type.ts';
import type { ReviewInputManifest } from '../model/review-input-manifest.ts';
import type { ReviewCompletenessVerdict } from '../types/review-completeness-verdict.type.ts';
import type { ReviewCoverage } from '../types/review-coverage.type.ts';
import type { ReviewEvidence } from '../types/review-evidence.type.ts';
import type { ReviewRuntimeReceipt } from '../types/review-runtime-receipt.type.ts';

/** @purpose Exact deterministic release identity stamped on every emitted verdict. */
const VALIDATOR_VERSION = 'review-structural-validator-v0';

/** @purpose Per-slot outcome after checking artifact fragment mechanics and trusted receipt grounding. */
type SlotOutcome =
  | { kind: 'NOT_APPLICABLE' }
  | { kind: 'MISSING' }
  | { kind: 'INVALID' }
  | { kind: 'COMPLETE'; receiptIds: readonly string[]; sourceId: string };

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** @purpose True for content that carries no real analysis — empty, whitespace-only, or a literal marker. */
function isPlaceholderContent(content: string): boolean {
  const trimmed = content.trim();
  return (
    trimmed.length === 0 || trimmed.toUpperCase() === 'TODO' || trimmed.toUpperCase() === 'TBD'
  );
}

/** @purpose True when every slot-required field is present on the fragment with a non-empty value. */
function hasRequiredFields(
  fragment: ReviewArtifactFragment,
  requiredFields: readonly string[]
): boolean {
  return requiredFields.every((field) => {
    const value = fragment.fields[field];
    return value !== undefined && value !== null && value !== '';
  });
}

/**
 * @purpose Fail-closed structural completeness check for one review contract.
 * @invariant Complete requires valid fragment content AND a trusted receipt matching the evidence
 *   exactly — an unverifiable receipt closes no slot.
 * @invariant A receipt reused across slots is legal only under `EXPLICIT_SEPARATE_CONSUMPTION`,
 *   each reuse recorded as a distinct durable consumption.
 */
export class ReviewStructuralValidator {
  /** @purpose Trusted append-only receipt and consumption storage boundary. */
  protected readonly _store: ReviewRuntimeReceiptStorePort;

  /**
   * @purpose Configure trusted receipt storage used to ground evidence.
   * @param store Append-only receipt and consumption store.
   */
  constructor(store: ReviewRuntimeReceiptStorePort) {
    this._store = store;
  }

  /**
   * @purpose Validate one contract's structural completeness against its artifacts and evidence.
   * @param input Complete deterministic manifest, contract, artifacts, evidence and receipt context.
   * @returns Exhaustive downstream gate verdict — PASS, REPAIRABLE or BLOCKED.
   */
  validate(
    input: Readonly<{
      manifest: ReviewInputManifest;
      contract: ReviewContract;
      artifacts: readonly ReviewArtifact[];
      evidence: readonly ReviewEvidence[];
      storeContext: ReviewReceiptStoreContext;
      attempt: number;
      maxAttempts: number;
    }>
  ): ReviewCompletenessVerdict {
    const { contract, artifacts, evidence, storeContext, attempt, maxAttempts } = input;

    const receiptsRead = this._store.readReceipts(storeContext);
    const receiptById = new Map<string, ReviewRuntimeReceipt>(
      (receiptsRead.status === 'READ' ? receiptsRead.records : []).map((r) => [r.receiptId, r])
    );

    const outcomes = new Map<string, SlotOutcome>();
    for (const slot of contract.slots) {
      outcomes.set(
        slot.slotId,
        this._evaluateSlot(slot, contract, artifacts, evidence, receiptById)
      );
    }

    this._resolveReuse(contract, outcomes, storeContext);

    const coverage = this._buildCoverage(contract.slots, outcomes);
    return this._buildVerdict(contract, coverage, attempt, maxAttempts);
  }

  /**
   * @purpose Check one slot's artifact fragment mechanics and trusted receipt grounding.
   * @param slot Contract slot obligation.
   * @param contract Owning contract, for receipt identity cross-checks.
   * @param artifacts Candidate artifacts carrying the slot's fragments.
   * @param evidence Complete evidence set for the whole contract.
   * @param receiptById Trusted receipts already read for this round.
   * @returns Not-applicable, missing (no evidence), invalid (mechanics/receipt fail) or complete.
   */
  protected _evaluateSlot(
    slot: ReviewContractSlot,
    contract: ReviewContract,
    artifacts: readonly ReviewArtifact[],
    evidence: readonly ReviewEvidence[],
    receiptById: Map<string, ReviewRuntimeReceipt>
  ): SlotOutcome {
    if (slot.obligation.startsWith('NA_')) return { kind: 'NOT_APPLICABLE' };

    const slotEvidence = evidence.filter((e) => e.slotId === slot.slotId);
    if (slotEvidence.length === 0) return { kind: 'MISSING' };

    const receiptIds: string[] = [];
    let sourceId = '';
    for (const item of slotEvidence) {
      const artifact = artifacts.find((a) => a.artifactId === item.artifactId);
      const fragment = artifact?.fragments.find((f) => f.fragmentId === item.fragmentId);
      if (!fragment || fragment.slotId !== slot.slotId) return { kind: 'INVALID' };
      if (isPlaceholderContent(fragment.content)) return { kind: 'INVALID' };
      if (!hasRequiredFields(fragment, slot.requiredFields)) return { kind: 'INVALID' };
      if (item.receiptIds.length === 0) return { kind: 'INVALID' };

      for (const receiptId of item.receiptIds) {
        const receipt = receiptById.get(receiptId);
        if (!receipt) return { kind: 'INVALID' };
        if (
          receipt.contractId !== contract.contractId ||
          receipt.manifestKeyDigest !== contract.manifestKeyDigest
        ) {
          return { kind: 'INVALID' };
        }
        if (
          receipt.sourceId !== item.sourceId ||
          receipt.sourceVersion !== item.sourceVersion ||
          receipt.sourceDigest !== item.sourceDigest
        ) {
          return { kind: 'INVALID' };
        }
        receiptIds.push(receiptId);
      }
      sourceId = item.sourceId;
    }
    return { kind: 'COMPLETE', receiptIds, sourceId };
  }

  /**
   * @purpose Enforce reuse policy across slots sharing one trusted receipt, recording every reuse.
   * @invariant Mutates `outcomes` in place — a DENY-policy slot caught in an unauthorized reuse
   *   downgrades from COMPLETE to INVALID.
   * @param contract Owning contract, for each COMPLETE slot's declared reuse policy and version.
   * @param outcomes Per-slot outcomes from `_evaluateSlot`, keyed by slotId.
   * @param storeContext Round storage context for durable consumption records.
   */
  protected _resolveReuse(
    contract: ReviewContract,
    outcomes: Map<string, SlotOutcome>,
    storeContext: ReviewReceiptStoreContext
  ): void {
    const slotById = new Map(contract.slots.map((s) => [s.slotId, s]));
    const usersByReceipt = new Map<string, string[]>();
    for (const [slotId, outcome] of outcomes) {
      if (outcome.kind !== 'COMPLETE') continue;
      for (const receiptId of outcome.receiptIds) {
        const users = usersByReceipt.get(receiptId) ?? [];
        users.push(slotId);
        usersByReceipt.set(receiptId, users);
      }
    }

    const existing = this._store.readConsumptions(storeContext);
    let nextSequence = (existing.status === 'READ' ? existing.records.length : 0) + 1;

    for (const [receiptId, userSlotIds] of usersByReceipt) {
      if (userSlotIds.length <= 1) continue;
      for (const slotId of userSlotIds) {
        const slot = slotById.get(slotId);
        const outcome = outcomes.get(slotId);
        if (!slot || outcome?.kind !== 'COMPLETE') continue;
        if (slot.reusePolicy !== 'EXPLICIT_SEPARATE_CONSUMPTION') {
          outcomes.set(slotId, { kind: 'INVALID' });
          continue;
        }
        const evidenceId = `reuse:${receiptId}:${slotId}`;
        const consumption: ReviewReceiptConsumption = Object.freeze({
          consumptionId: `consumption:${storeContext.contractId}:${slotId}:${receiptId}`,
          receiptId,
          contractId: storeContext.contractId,
          contractVersion: contract.contractVersion,
          manifestKeyDigest: storeContext.manifestKeyDigest,
          slotId,
          evidenceId,
          reusePolicy: slot.reusePolicy,
          sequence: nextSequence,
          recordedAt: new Date().toISOString(),
          digest: digest({ receiptId, slotId, sequence: nextSequence }),
        });
        this._store.appendConsumption(storeContext, consumption);
        nextSequence += 1;
      }
    }
  }

  /**
   * @purpose Project per-slot outcomes into the total disjoint coverage accounting.
   * @param slots Contract slots, in declared order.
   * @param outcomes Per-slot outcomes after mechanics, receipt and reuse checks.
   * @returns Total disjoint coverage across every accounting dimension.
   */
  protected _buildCoverage(
    slots: readonly ReviewContractSlot[],
    outcomes: Map<string, SlotOutcome>
  ): ReviewCoverage {
    const coverage: ReviewCoverage = {
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

    for (const slot of slots) {
      const outcome = outcomes.get(slot.slotId);
      if (!outcome) continue;
      if (outcome.kind === 'NOT_APPLICABLE') {
        coverage.notApplicableSlotIds.push(slot.slotId);
        continue;
      }
      coverage.requiredSlotIds.push(slot.slotId);
      if (outcome.kind === 'MISSING') {
        coverage.missingSlotIds.push(slot.slotId);
        continue;
      }
      if (outcome.kind === 'INVALID') {
        coverage.invalidSlotIds.push(slot.slotId);
        continue;
      }
      coverage.completeSlotIds.push(slot.slotId);
      coverage.receiptMappings[slot.slotId] = [...outcome.receiptIds];
      const bucket = coverage.sourceCoverage[outcome.sourceId] ?? [];
      bucket.push(slot.slotId);
      coverage.sourceCoverage[outcome.sourceId] = bucket;
      const dimension =
        slot.kind === 'review-lens'
          ? coverage.lensCoverage
          : slot.kind === 'entity'
            ? coverage.entityCoverage
            : slot.kind === 'file'
              ? coverage.fileCoverage
              : slot.kind === 'diagram'
                ? coverage.diagramCoverage
                : undefined;
      if (dimension) {
        const key = slot.kind === 'diagram' ? slot.diagramKind : slot.slotId;
        const items = dimension[key] ?? [];
        items.push(slot.slotId);
        dimension[key] = items;
      }
    }
    return coverage;
  }

  /**
   * @purpose Compute the final downstream gate verdict from total coverage and the attempt budget.
   * @param contract Owning contract identity and version.
   * @param coverage Total disjoint coverage accounting.
   * @param attempt Repair attempts already spent, as supplied by the caller.
   * @param maxAttempts Total attempts allowed before the caller must escalate.
   * @returns PASS when every required slot is complete; otherwise REPAIRABLE or BLOCKED.
   */
  protected _buildVerdict(
    contract: ReviewContract,
    coverage: ReviewCoverage,
    attempt: number,
    maxAttempts: number
  ): ReviewCompletenessVerdict {
    const base = {
      verdictId: randomUUID(),
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      manifestRef: contract.manifestRef,
      coverage,
      validatorVersion: VALIDATOR_VERSION,
      evaluatedAt: new Date().toISOString(),
    };
    const gaps = coverage.missingSlotIds.length > 0 || coverage.invalidSlotIds.length > 0;
    if (!gaps) return Object.freeze({ ...base, status: 'PASS', fresh: true });
    if (attempt >= maxAttempts) {
      return Object.freeze({
        ...base,
        status: 'BLOCKED',
        remainingSlotIds: [...coverage.missingSlotIds, ...coverage.invalidSlotIds],
        reasons: ['ATTEMPTS_EXHAUSTED'],
        attempt,
        maxAttempts,
        provenance: [],
      });
    }
    return Object.freeze({
      ...base,
      status: 'REPAIRABLE',
      missingSlotIds: [...coverage.missingSlotIds],
      invalidSlotIds: [...coverage.invalidSlotIds],
      reasons: {},
      attempt,
      maxAttempts,
    });
  }
}
