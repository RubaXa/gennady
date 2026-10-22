// @file: Deterministic structural completeness and trusted provenance validator.
// @spec: AGENT-INBOX-INBOX-PIPELINE
// @consumers: ReviewOrchestrator, ReviewRepairCoordinator, inbox-eval

import { createHash } from 'node:crypto';
import type { ReviewReceiptConsumption } from '../model/review-receipt-consumption.ts';
import type { ReviewRuntimeReceiptStorePort } from '../ports/review-runtime-receipt-store.port.ts';
import type { ReviewCompletenessVerdict } from '../types/review-completeness-verdict.type.ts';
import type { ReviewCoverage } from '../types/review-coverage.type.ts';
import type { ReviewStructuralValidationInput } from '../types/review-structural-validation-input.type.ts';

export type { ReviewStructuralValidationInput } from '../types/review-structural-validation-input.type.ts';

const PLACEHOLDER =
  /(?:\bTODO\b|\bTBD\b|placeholder|coming soon|```mermaid\s*(?:graph|flowchart)?\s*```)/i;

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * @purpose Prove structural completeness using schemas and control-plane receipts without LLM judgment.
 * @invariant Every required slot is complete, missing or invalid; consumption is durable before completion.
 */
export class ReviewStructuralValidator {
  readonly validatorVersion = 'review-structural-validator-v0';
  protected readonly _store: ReviewRuntimeReceiptStorePort;

  constructor(store: ReviewRuntimeReceiptStorePort) {
    this._store = store;
  }

  /** @purpose Return exact repair gaps or PASS after all trusted consumption mappings are durable. */
  validate(input: ReviewStructuralValidationInput): ReviewCompletenessVerdict {
    const receiptRead = this._store.readReceipts(input.storeContext);
    const consumptionRead = this._store.readConsumptions(input.storeContext);
    const requiredSlotIds = input.contract.slots
      .filter((slot) => slot.obligation.startsWith('REQUIRED:'))
      .map((slot) => slot.slotId);
    const notApplicableSlotIds = input.contract.slots
      .filter((slot) => slot.obligation.startsWith('NA_'))
      .map((slot) => slot.slotId);
    const completeSlotIds: string[] = [];
    const missingSlotIds: string[] = [];
    const invalidSlotIds: string[] = [];
    const reasons: Record<string, string[]> = {};
    const receiptMappings: Record<string, string[]> = {};
    if (receiptRead.status === 'REJECTED' || consumptionRead.status === 'REJECTED') {
      invalidSlotIds.push(...requiredSlotIds);
      for (const slotId of requiredSlotIds)
        reasons[slotId] = ['trusted receipt store unavailable or corrupt'];
    } else {
      const persistedConsumptions = [...consumptionRead.records];
      const fragments = input.artifacts.flatMap((artifact) =>
        artifact.fragments.map((fragment) => ({ artifact, fragment }))
      );
      const usedReceipts = new Map<string, string>();
      for (const slot of input.contract.slots.filter((candidate) =>
        candidate.obligation.startsWith('REQUIRED:')
      )) {
        const slotFragments = fragments.filter((entry) => entry.fragment.slotId === slot.slotId);
        const slotEvidence = input.evidence.filter((entry) => entry.slotId === slot.slotId);
        if (!slotFragments.length || !slotEvidence.length) {
          missingSlotIds.push(slot.slotId);
          reasons[slot.slotId] = ['artifact fragment or evidence is missing'];
          continue;
        }
        const slotReasons: string[] = [];
        if (
          slotFragments.length < slot.minCardinality ||
          slotFragments.length > slot.maxCardinality
        )
          slotReasons.push('cardinality mismatch');
        if (
          slotFragments.some(
            ({ fragment }) => !fragment.content.trim() || PLACEHOLDER.test(fragment.content)
          )
        )
          slotReasons.push('empty or placeholder fragment');
        if (
          slotFragments.some(({ fragment }) =>
            slot.requiredFields.some((field) => !(field in fragment.fields))
          )
        )
          slotReasons.push('required schema field missing');
        if (
          slotFragments.some(
            ({ artifact }) =>
              artifact.contractId !== input.contract.contractId ||
              artifact.contractVersion !== input.contract.contractVersion ||
              artifact.manifestRef !== input.manifest.ref
          )
        )
          slotReasons.push('foreign artifact revision');
        for (const evidence of slotEvidence) {
          if (
            evidence.contractId !== input.contract.contractId ||
            evidence.contractVersion !== input.contract.contractVersion ||
            evidence.manifestRef !== input.manifest.ref
          ) {
            slotReasons.push('foreign evidence provenance');
            continue;
          }
          const matchingReceipts = receiptRead.records.filter(
            (receipt) =>
              evidence.receiptIds.includes(receipt.receiptId) &&
              receipt.contractId === input.contract.contractId &&
              receipt.contractVersion === input.contract.contractVersion &&
              receipt.manifestKeyDigest === input.contract.manifestKeyDigest &&
              receipt.sourceId === evidence.sourceId &&
              receipt.sourceVersion === evidence.sourceVersion &&
              receipt.sourceDigest === evidence.sourceDigest &&
              receipt.outcome === 'SUCCEEDED'
          );
          if (!matchingReceipts.length) {
            slotReasons.push('trusted source-use receipt missing or mismatched');
            continue;
          }
          const receipt = matchingReceipts[0];
          const previousSlot = usedReceipts.get(receipt.receiptId);
          if (previousSlot && previousSlot !== slot.slotId && slot.reusePolicy === 'DENY') {
            slotReasons.push('receipt reuse denied by contract');
            continue;
          }
          const existing = persistedConsumptions.find(
            (item) =>
              item.receiptId === receipt.receiptId &&
              item.slotId === slot.slotId &&
              item.evidenceId === evidence.evidenceId
          );
          if (!existing) {
            const consumption: ReviewReceiptConsumption = Object.freeze({
              consumptionId: `consumption:${digest({ receiptId: receipt.receiptId, slotId: slot.slotId, evidenceId: evidence.evidenceId })}`,
              receiptId: receipt.receiptId,
              contractId: input.contract.contractId,
              contractVersion: input.contract.contractVersion,
              manifestKeyDigest: input.contract.manifestKeyDigest,
              slotId: slot.slotId,
              evidenceId: evidence.evidenceId,
              reusePolicy: slot.reusePolicy,
              sequence: persistedConsumptions.length + 1,
              recordedAt: new Date().toISOString(),
              digest: digest({
                receiptId: receipt.receiptId,
                slotId: slot.slotId,
                evidenceId: evidence.evidenceId,
              }),
            });
            const appended = this._store.appendConsumption(input.storeContext, consumption);
            if (appended.status === 'REJECTED') {
              slotReasons.push('durable receipt consumption acknowledgment failed');
              continue;
            }
            persistedConsumptions.push(consumption);
          }
          usedReceipts.set(receipt.receiptId, slot.slotId);
          receiptMappings[slot.slotId] = [
            ...(receiptMappings[slot.slotId] ?? []),
            receipt.receiptId,
          ];
        }
        if (slotReasons.length) {
          invalidSlotIds.push(slot.slotId);
          reasons[slot.slotId] = [...new Set(slotReasons)];
        } else {
          completeSlotIds.push(slot.slotId);
        }
      }
    }
    const coverage: ReviewCoverage = {
      requiredSlotIds,
      completeSlotIds,
      missingSlotIds,
      invalidSlotIds,
      notApplicableSlotIds,
      sourceCoverage: {},
      lensCoverage: {},
      entityCoverage: {},
      fileCoverage: {},
      diagramCoverage: {},
      receiptMappings,
    };
    const base = {
      verdictId: `verdict:${digest({ contract: input.contract.contractId, attempt: input.attempt, coverage })}`,
      contractId: input.contract.contractId,
      contractVersion: input.contract.contractVersion,
      manifestRef: input.manifest.ref,
      coverage,
      validatorVersion: this.validatorVersion,
      evaluatedAt: new Date().toISOString(),
    };
    if (
      !missingSlotIds.length &&
      !invalidSlotIds.length &&
      completeSlotIds.length === requiredSlotIds.length
    )
      return Object.freeze({ ...base, status: 'PASS', fresh: true });
    return Object.freeze({
      ...base,
      status: 'REPAIRABLE',
      missingSlotIds,
      invalidSlotIds,
      reasons,
      attempt: input.attempt,
      maxAttempts: input.maxAttempts,
    });
  }
}
