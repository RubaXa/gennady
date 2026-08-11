// @file: Integration tests for exact bounded crash-resumable review repair.
// @consumers: TSK-176 audit
// @tasks: TSK-176

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
    retrieve: () => state,
    persist: (next: ReviewRepairState) => Object.assign(state, next),
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
  it('repair contains only current missing and invalid slots', () => {
    const { coordinator, contract, verdict } = createRepairContext();
    const task = coordinator.planTargetedRepair(contract, verdict);
    assert.strictEqual('slotIds' in task, true);
    if ('slotIds' in task) assert.deepStrictEqual(task.slotIds, ['b', 'c']);
  });

  it('default three attempts survive crash and block attempt four', () => {
    const context = createRepairContext(2);
    const third = context.coordinator.planTargetedRepair(context.contract, context.verdict);
    assert.strictEqual('attempt' in third ? third.attempt : -1, 3);
    context.state.activeTask = undefined;
    const blocked = context.coordinator.planTargetedRepair(context.contract, context.verdict);
    assert.strictEqual('status' in blocked ? blocked.status : '', 'BLOCKED');
  });

  it('new round and budget increase preserve distinct counter provenance', () => {
    const context = createRepairContext(3);
    const budget = context.coordinator.continueExplicitly({
      kind: 'INCREASE_BUDGET',
      maxAttempts: 5,
    });
    assert.strictEqual(budget.attempt, 3);
    const next = context.coordinator.continueExplicitly({ kind: 'NEW_ROUND', roundId: 'round-2' });
    assert.deepStrictEqual([next.roundId, next.attempt], ['round-2', 0]);
  });
});
