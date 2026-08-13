// @file: Integration tests for exact bounded crash-resumable review repair.
// @consumers: TSK-176 audit, TSK-184 production control-plane verification
// @tasks: TSK-176, TSK-184

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ReviewRepairCoordinator,
  type ReviewRepairState,
} from '../../../services/agent-inbox/modules/inbox-pipeline/coverage/review-repair-coordinator.ts';
import type { ReviewContract } from '../../../services/agent-inbox/modules/inbox-pipeline/model/review-contract.ts';
import type { ReviewCompletenessVerdict } from '../../../services/agent-inbox/modules/inbox-pipeline/types/review-completeness-verdict.type.ts';

type RepairContext = {
  state: ReviewRepairState;
  coordinator: ReviewRepairCoordinator;
  contract: ReviewContract;
  verdict: ReviewCompletenessVerdict;
};
function createRepairContext(attempt = 0): RepairContext {
  const state: ReviewRepairState = { roundId: 'round-1', attempt, maxAttempts: 3, provenance: [] };
  const journal = {
    retrieve: async () => state,
    persist: async (next: ReviewRepairState) => {
      Object.assign(state, next);
    },
  };
  const intent = {
    kind: 'full' as const,
    manifestKey: { mr: 'g/p!1', headSHA: 'h', eventCursor: 'e' },
    trigger: 'event',
    requester: 'operator',
  };
  const slots = ['a', 'b', 'c'].map((slotId) => ({
    kind: 'goal' as const,
    slotId,
    catalogVersion: 'v',
    catalogDigest: 'd',
    requiredFields: ['objective'],
    sourceAnchors: [`source:${slotId}`],
    minCardinality: 1,
    maxCardinality: 1,
    dependencies: [],
    reusePolicy: 'DENY' as const,
    obligation: 'REQUIRED:BASELINE' as const,
  }));
  const contract: ReviewContract = {
    status: 'COMPILED',
    contractId: 'c',
    contractVersion: '1',
    ref: 'cr',
    manifestRef: 'mr',
    manifestKeyDigest: 'mk',
    intent,
    slots,
    inputMappings: [],
    catalogVersion: 'v',
    catalogDigest: 'd',
    compilerVersion: 'v',
    semanticDigest: 'sd',
  };
  const coverage = {
    requiredSlotIds: ['a', 'b', 'c'],
    completeSlotIds: ['a'],
    missingSlotIds: ['b'],
    invalidSlotIds: ['c'],
    notApplicableSlotIds: [],
    sourceCoverage: {},
    lensCoverage: {},
    entityCoverage: {},
    fileCoverage: {},
    diagramCoverage: {},
    receiptMappings: {},
  };
  const verdict: ReviewCompletenessVerdict = {
    verdictId: 'v',
    contractId: 'c',
    contractVersion: '1',
    manifestRef: 'mr',
    coverage,
    validatorVersion: 'v',
    evaluatedAt: 'now',
    status: 'REPAIRABLE',
    missingSlotIds: ['b'],
    invalidSlotIds: ['c'],
    reasons: {},
    attempt,
    maxAttempts: 3,
  };
  return { state, coordinator: new ReviewRepairCoordinator(journal), contract, verdict };
}

describe('ReviewRepairCoordinator', () => {
  it('awaits durable persist before returning dispatch eligibility and resumes once after crash', async () => {
    const context = createRepairContext();
    let releasePersist!: () => void;
    const persisted = new Promise<void>((resolve) => {
      releasePersist = resolve;
    });
    let persistCount = 0;
    const journal = {
      retrieve: async () => context.state,
      persist: async (next: ReviewRepairState) => {
        persistCount += 1;
        await persisted;
        Object.assign(context.state, next);
      },
    };
    const coordinator = new ReviewRepairCoordinator(journal);
    let returned = false;
    const pending = coordinator
      .planTargetedRepair(context.contract, context.verdict)
      .then((value) => {
        returned = true;
        return value;
      });
    await Promise.resolve();
    assert.strictEqual(returned, false, 'dispatch eligibility must await durable persistence');
    releasePersist();
    const first = await pending;
    const restarted = new ReviewRepairCoordinator(journal);
    const resumed = await restarted.planTargetedRepair(context.contract, context.verdict);
    assert.strictEqual(resumed, first);
    assert.strictEqual(
      persistCount,
      1,
      'crash resume must not persist or dispatch a duplicate task'
    );
  });

  it('repair contains only current missing and invalid slots', async () => {
    const { coordinator, contract, verdict } = createRepairContext();
    const task = await coordinator.planTargetedRepair(contract, verdict);
    assert.strictEqual('slotIds' in task, true);
    if ('slotIds' in task) assert.deepStrictEqual(task.slotIds, ['b', 'c']);
  });

  it('default three attempts survive crash and block attempt four', async () => {
    const context = createRepairContext(2);
    const third = await context.coordinator.planTargetedRepair(context.contract, context.verdict);
    assert.strictEqual('attempt' in third ? third.attempt : -1, 3);
    context.state.activeTask = undefined;
    const blocked = await context.coordinator.planTargetedRepair(context.contract, context.verdict);
    assert.strictEqual('status' in blocked ? blocked.status : '', 'BLOCKED');
  });

  it('new round and budget increase preserve distinct counter provenance', async () => {
    const context = createRepairContext(3);
    const budget = await context.coordinator.continueExplicitly({
      kind: 'INCREASE_BUDGET',
      maxAttempts: 5,
    });
    assert.strictEqual(budget.attempt, 3);
    const next = await context.coordinator.continueExplicitly({
      kind: 'NEW_ROUND',
      roundId: 'round-2',
    });
    assert.deepStrictEqual([next.roundId, next.attempt], ['round-2', 0]);
  });
});
