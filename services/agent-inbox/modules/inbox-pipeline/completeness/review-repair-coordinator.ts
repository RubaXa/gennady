// @file: Exact bounded crash-resumable review repair — one durable active task per round.
// @consumers: PipelineRuntime, ReviewFreshnessGate
// @tasks: TSK-176, TSK-184, TSK-190

import type { ReviewCompletenessVerdict } from '../types/review-completeness-verdict.type.ts';
import type { ReviewContract } from '../model/review-contract.ts';

/** @purpose Durable state for one repair round, surviving process restart via the caller's journal. */
export type ReviewRepairState = {
  /** @purpose Stable identity of the current repair round. */
  roundId: string;
  /** @purpose Count of dispatched repair attempts within this round. */
  attempt: number;
  /** @purpose Total attempts allowed before the round is BLOCKED. */
  maxAttempts: number;
  /** @purpose Immutable trail of prior rounds' terminal identity, kept across NEW_ROUND resets. */
  provenance: string[];
  /** @purpose Durable in-flight repair task — crash-resume returns this exact instance, never a new one. */
  activeTask?: ReviewRepairTask;
};

/** @purpose Journal seam owning one round's durable repair state, independent of canonical review events. */
export interface ReviewRepairJournal {
  /**
   * @purpose Read the current durable repair state.
   * @returns The persisted state, or the journal's own zero-attempt default when none exists yet.
   */
  retrieve(): Promise<ReviewRepairState>;
  /**
   * @purpose Durably persist the complete repair state.
   * @param state Complete replacement state.
   * @returns Promise resolved only after the state is durable.
   */
  persist(state: ReviewRepairState): Promise<void>;
}

/** @purpose One dispatched repair task addressing exactly the slots missing/invalid at dispatch time. */
export type ReviewRepairTask = Readonly<{
  status: 'DISPATCHED';
  taskId: string;
  roundId: string;
  contractId: string;
  slotIds: readonly string[];
  attempt: number;
  maxAttempts: number;
}>;

/**
 * @purpose Coordinate one review round's bounded repair attempts with durable crash-resume.
 * @invariant Dispatch eligibility is observable only after durable persistence — never before.
 * @invariant A round never exceeds its `maxAttempts` budget without an explicit operator continuation.
 */
export class ReviewRepairCoordinator {
  /** @purpose Durable per-round repair state boundary. */
  protected readonly _journal: ReviewRepairJournal;

  /**
   * @purpose Configure durable repair state persistence for one round.
   * @param journal Durable per-round repair state boundary.
   */
  constructor(journal: ReviewRepairJournal) {
    this._journal = journal;
  }

  /**
   * @purpose Resume the durable active task, or dispatch a new one for the verdict's exact gaps.
   * @invariant Crash-resume returns the identical persisted task instance, never a duplicate.
   * @param contract Owning contract identity carried onto the dispatched task.
   * @param verdict Structural verdict whose missing/invalid slots become the repair target.
   * @returns The durable active task, freshly dispatched or resumed, or a budget-exhausted refusal.
   */
  async planTargetedRepair(
    contract: ReviewContract,
    verdict: ReviewCompletenessVerdict
  ): Promise<
    | ReviewRepairTask
    | Readonly<{
        status: 'BLOCKED';
        roundId: string;
        contractId: string;
        attempt: number;
        maxAttempts: number;
        reasons: readonly string[];
      }>
  > {
    const state = await this._journal.retrieve();
    if (state.activeTask) return state.activeTask;

    if (state.attempt >= state.maxAttempts) {
      return Object.freeze({
        status: 'BLOCKED',
        roundId: state.roundId,
        contractId: contract.contractId,
        attempt: state.attempt,
        maxAttempts: state.maxAttempts,
        reasons: ['ATTEMPTS_EXHAUSTED'],
      });
    }

    const slotIds =
      verdict.status === 'REPAIRABLE' ? [...verdict.missingSlotIds, ...verdict.invalidSlotIds] : [];
    const attempt = state.attempt + 1;
    const task: ReviewRepairTask = Object.freeze({
      status: 'DISPATCHED',
      taskId: `repair:${contract.contractId}:${state.roundId}:${attempt}`,
      roundId: state.roundId,
      contractId: contract.contractId,
      slotIds,
      attempt,
      maxAttempts: state.maxAttempts,
    });
    const nextState: ReviewRepairState = { ...state, attempt, activeTask: task };
    await this._journal.persist(nextState);
    return task;
  }

  /**
   * @purpose Apply an explicit operator continuation outside the coordinator's own attempt accounting.
   * @invariant NEW_ROUND resets the attempt counter and clears the active task, keeping the prior
   *   round's terminal identity in `provenance`.
   * @param action Operator-selected continuation.
   * @returns The complete durable state after the continuation.
   */
  async continueExplicitly(
    action:
      | { kind: 'INCREASE_BUDGET'; maxAttempts: number }
      | { kind: 'NEW_ROUND'; roundId: string }
  ): Promise<ReviewRepairState> {
    const state = await this._journal.retrieve();
    const nextState: ReviewRepairState =
      action.kind === 'INCREASE_BUDGET'
        ? { ...state, maxAttempts: action.maxAttempts }
        : {
            roundId: action.roundId,
            attempt: 0,
            maxAttempts: state.maxAttempts,
            provenance: [...state.provenance, `${state.roundId}:${state.attempt}`],
            activeTask: undefined,
          };
    await this._journal.persist(nextState);
    return nextState;
  }
}
