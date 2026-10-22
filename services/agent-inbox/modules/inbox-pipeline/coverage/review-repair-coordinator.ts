// @file: Durable bounded repair planning and crash-resume coordination.
// @spec: AGENT-INBOX-INBOX-PIPELINE
// @consumers: ReviewOrchestrator, dashboard

import { createHash } from 'node:crypto';
import type { ReviewContract } from '../model/review-contract.ts';
import type { ReviewRepairTask } from '../model/review-repair-task.ts';
import type { ReviewCompletenessVerdict } from '../types/review-completeness-verdict.type.ts';

import type { ReviewRepairJournal } from '../types/review-repair-journal.type.ts';
import type { ReviewRepairState } from '../types/review-repair-state.type.ts';

export type { ReviewRepairJournal } from '../types/review-repair-journal.type.ts';
export type { ReviewRepairState } from '../types/review-repair-state.type.ts';

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** @purpose Plan exact current gaps and preserve a monotonic bounded attempt counter. */
export class ReviewRepairCoordinator {
  protected readonly _journal: ReviewRepairJournal;

  constructor(journal: ReviewRepairJournal) {
    this._journal = journal;
  }

  /** @purpose Persist or resume one gap-only repair task before any agent dispatch. */
  async planTargetedRepair(
    contract: ReviewContract,
    verdict: ReviewCompletenessVerdict
  ): Promise<ReviewRepairTask | ReviewCompletenessVerdict> {
    if (verdict.status !== 'REPAIRABLE') return verdict;
    const state = await this._journal.retrieve();
    if (state.activeTask?.state === 'PERSISTED' || state.activeTask?.state === 'RUNNING')
      return state.activeTask;
    const slotIds = [...new Set([...verdict.missingSlotIds, ...verdict.invalidSlotIds])].sort();
    if (state.attempt >= state.maxAttempts) {
      return Object.freeze({
        verdictId: `blocked:${digest({ roundId: state.roundId, attempt: state.attempt, slotIds })}`,
        contractId: contract.contractId,
        contractVersion: contract.contractVersion,
        manifestRef: contract.manifestRef,
        coverage: verdict.coverage,
        validatorVersion: verdict.validatorVersion,
        evaluatedAt: new Date().toISOString(),
        status: 'BLOCKED',
        remainingSlotIds: slotIds,
        reasons: ['repair budget exhausted'],
        attempt: state.attempt,
        maxAttempts: state.maxAttempts,
        provenance: [...state.provenance, `exhausted:${state.attempt}`],
      });
    }
    const nextAttempt = state.attempt + 1;
    const task: ReviewRepairTask = Object.freeze({
      repairTaskId: `repair:${digest({ contract: contract.contractId, attempt: nextAttempt, slotIds })}`,
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      manifestRef: contract.manifestRef,
      slotIds,
      expectedEvidenceTypes: Object.fromEntries(
        slotIds.map((slotId) => [
          slotId,
          contract.slots.find((slot) => slot.slotId === slotId)?.requiredFields ?? [],
        ])
      ),
      sourceAnchors: Object.fromEntries(
        slotIds.map((slotId) => [
          slotId,
          contract.slots.find((slot) => slot.slotId === slotId)?.sourceAnchors ?? [],
        ])
      ),
      attempt: nextAttempt,
      provenance: [...state.provenance, `attempt:${nextAttempt}`],
      state: 'PERSISTED',
    });
    await this._journal.persist({
      ...state,
      attempt: nextAttempt,
      activeTask: task,
      provenance: [...task.provenance],
    });
    return task;
  }

  /** @purpose Continue an exhausted round only after an explicit budget or new-round decision. */
  async continueExplicitly(
    decision:
      | { kind: 'INCREASE_BUDGET'; maxAttempts: number }
      | { kind: 'NEW_ROUND'; roundId: string; maxAttempts?: number }
  ): Promise<ReviewRepairState> {
    const state = await this._journal.retrieve();
    const next =
      decision.kind === 'INCREASE_BUDGET'
        ? {
            ...state,
            maxAttempts: Math.max(decision.maxAttempts, state.attempt),
            activeTask: undefined,
            provenance: [...state.provenance, `budget:${decision.maxAttempts}`],
          }
        : {
            roundId: decision.roundId,
            attempt: 0,
            maxAttempts: decision.maxAttempts ?? 3,
            activeTask: undefined,
            provenance: [...state.provenance, `new-round:${decision.roundId}`],
          };
    await this._journal.persist(next);
    return next;
  }
}
