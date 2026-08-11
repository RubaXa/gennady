// @file: Role-invariant contract-slot execution and fresh publication orchestration.
// @consumers: inbox-queue, inbox-chat, inbox-api
// @tasks: TSK-176

import { ReviewPlan } from '../model/review-plan.ts';
import type { ReviewContract } from '../model/review-contract.ts';
import type { ReviewCompletenessVerdict } from '../types/review-completeness-verdict.type.ts';

/** @purpose Visible outcome of executing every required contract slot. */
export type ReviewRoundExecution = Readonly<{
  status: 'COMPLETED' | 'BLOCKED';
  plan: Readonly<Record<string, 'PENDING' | 'RUNNING' | 'COMPLETE' | 'FAILED' | 'SUPERSEDED'>>;
  failedSlotIds: readonly string[];
  provenance: readonly string[];
}>;

/** @purpose Slot execution seam controlled by the pipeline rather than agent self-report. */
export type ReviewSlotExecutor = (
  slotId: string
) => Promise<{ status: 'COMPLETE' | 'FAILED'; provenance: readonly string[] }>;

/** @purpose Execute full, delta and cross-review slots without role-specific depth shortcuts. */
export class ReviewOrchestrator {
  /**
   * @purpose Execute every ready required slot while retaining visible lane failures.
   * @param contract Exact role-invariant review contract.
   * @param executor Control-plane-owned slot execution seam.
   * @returns Visible complete or blocked round execution.
   */
  async execute(
    contract: ReviewContract,
    executor: ReviewSlotExecutor
  ): Promise<ReviewRoundExecution> {
    const dependencies = Object.fromEntries(
      contract.slots
        .filter((slot) => slot.obligation.startsWith('REQUIRED:'))
        .map((slot) => [slot.slotId, slot.dependencies])
    );
    const plan = new ReviewPlan(contract.ref, dependencies);
    const provenance: string[] = [];
    const failedSlotIds: string[] = [];
    let ready = plan.scheduleReadySlots();
    while (ready.length) {
      for (const slotId of ready) {
        plan.markSlotState(slotId, 'RUNNING');
        const result = await executor(slotId);
        provenance.push(...result.provenance);
        plan.markSlotState(slotId, result.status);
        if (result.status === 'FAILED') failedSlotIds.push(slotId);
      }
      const next = plan.scheduleReadySlots();
      if (next.length === ready.length && next.every((slotId) => ready.includes(slotId))) break;
      ready = next;
    }
    return Object.freeze({
      status: failedSlotIds.length ? 'BLOCKED' : 'COMPLETED',
      plan: plan.retrieveProgress(),
      failedSlotIds,
      provenance,
    });
  }

  /**
   * @purpose Admit synthesis/publication only for an explicitly fresh structural PASS.
   * @param verdict Current immutable structural verdict.
   * @param semanticFinished Whether semantic synthesis completed explicitly.
   * @returns Whether downstream publication is eligible.
   */
  canPublish(verdict: ReviewCompletenessVerdict, semanticFinished: boolean): boolean {
    return verdict.status === 'PASS' && verdict.fresh && semanticFinished;
  }

  /**
   * @purpose Separate a zero-reference operator command from round-derived completeness gates.
   * @param roundReferences Artifact, finding or proposal references consumed by the command.
   * @returns Independent or round-dependent relationship.
   */
  classifyCommandRelationship(
    roundReferences: readonly string[]
  ): 'INDEPENDENT' | 'ROUND_DEPENDENT' {
    return roundReferences.length === 0 ? 'INDEPENDENT' : 'ROUND_DEPENDENT';
  }
}
