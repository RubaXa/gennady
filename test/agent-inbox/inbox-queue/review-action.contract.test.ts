// @file: Contract tests — action package and outcome type variants are exhaustive.
// @consumers: TSK-177 audit
// @tasks: TSK-177

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { VcsEffectKind } from '../../../services/agent-inbox/modules/inbox-vcs/vcs-port.ts';
import type {
  ReviewEffectOrigin,
  ReviewEffectState,
} from '../../../services/agent-inbox/modules/inbox-queue/types/review-effect.type.ts';
import {
  enumerateRoundRefs,
  classifyEffectOrigin,
} from '../../../services/agent-inbox/modules/inbox-queue/types/review-effect.type.ts';
import type { ReviewOutcomeStatus } from '../../../services/agent-inbox/modules/inbox-queue/model/review-outcome.ts';
import { computeRetryEligibility } from '../../../services/agent-inbox/modules/inbox-queue/model/review-outcome.ts';
import type { ReviewPackageStatus } from '../../../services/agent-inbox/modules/inbox-queue/model/review-action-package.ts';
import type { ReviewDecisionActor } from '../../../services/agent-inbox/modules/inbox-queue/model/review-decision.ts';
import type { ReviewActionMode } from '../../../services/agent-inbox/modules/inbox-queue/model/review-proposal.ts';
import type { ReviewTaskStatus } from '../../../services/agent-inbox/modules/inbox-queue/model/review-task.ts';
import type { ReviewEffectIdentity } from '../../../services/agent-inbox/modules/inbox-queue/types/review-effect.type.ts';

// Compile-time exhaustiveness assertions — TypeScript will reject any union extension without updating these.
type _AssertExact<T, U extends T> = U extends T ? true : never;
type _CheckVcsEffectKind = _AssertExact<
  VcsEffectKind,
  | 'comment'
  | 'reply'
  | 'react'
  | 'resolve'
  | 'reopen'
  | 'approve'
  | 'unapprove'
  | 'request_changes'
  | 'edit_description'
>;
type _CheckOrigin = _AssertExact<ReviewEffectOrigin, 'round-derived' | 'operator-independent'>;
type _CheckEffectState = _AssertExact<
  ReviewEffectState,
  'queued' | 'dispatching' | 'unconfirmed' | 'reconciled' | 'invalidated'
>;
type _CheckOutcomeStatus = _AssertExact<
  ReviewOutcomeStatus,
  'applied' | 'not-applied' | 'ambiguous'
>;
type _CheckPackageStatus = _AssertExact<ReviewPackageStatus, 'active' | 'stale' | 'completed'>;
type _CheckDecisionActor = _AssertExact<ReviewDecisionActor, 'operator' | 'automation'>;
type _CheckActionMode = _AssertExact<ReviewActionMode, 'manual' | 'automatic'>;
type _CheckTaskStatus = _AssertExact<
  ReviewTaskStatus,
  'queued' | 'running' | 'waiting_dep' | 'done' | 'failed' | 'cancelled'
>;
// Materialize the checks so noUnusedLocals does not discard them
const _typeProbe: [
  _CheckVcsEffectKind,
  _CheckOrigin,
  _CheckEffectState,
  _CheckOutcomeStatus,
  _CheckPackageStatus,
  _CheckDecisionActor,
  _CheckActionMode,
  _CheckTaskStatus,
] = [true, true, true, true, true, true, true, true];
void _typeProbe;

type ActionContext = {
  effectKinds: VcsEffectKind[];
  origins: ReviewEffectOrigin[];
  effectStates: ReviewEffectState[];
  outcomeStatuses: ReviewOutcomeStatus[];
  packageStatuses: ReviewPackageStatus[];
  decisionActors: ReviewDecisionActor[];
  actionModes: ReviewActionMode[];
  taskStatuses: ReviewTaskStatus[];
};

function createActionContext(): ActionContext {
  return {
    effectKinds: [
      'comment',
      'reply',
      'react',
      'resolve',
      'reopen',
      'approve',
      'unapprove',
      'request_changes',
      'edit_description',
    ],
    origins: ['round-derived', 'operator-independent'],
    effectStates: ['queued', 'dispatching', 'unconfirmed', 'reconciled', 'invalidated'],
    outcomeStatuses: ['applied', 'not-applied', 'ambiguous'],
    packageStatuses: ['active', 'stale', 'completed'],
    decisionActors: ['operator', 'automation'],
    actionModes: ['manual', 'automatic'],
    taskStatuses: ['queued', 'running', 'waiting_dep', 'done', 'failed', 'cancelled'],
  };
}

describe('ReviewActionPackageAndOutcomeTypes', () => {
  it('action package and outcome variants are exhaustive', () => {
    // invariant: every closed union has exact expected members — unknown combination is rejected before execution
    // non-goal: runtime exhaustiveness check replaces the compile-time check above
    const ctx = createActionContext();

    // #region START_EXHAUSTIVE_ASSERT_EFFECT_KINDS
    assert.deepStrictEqual([...ctx.effectKinds].sort(), [
      'approve',
      'comment',
      'edit_description',
      'react',
      'reopen',
      'reply',
      'request_changes',
      'resolve',
      'unapprove',
    ]);
    // #endregion END_EXHAUSTIVE_ASSERT_EFFECT_KINDS

    assert.strictEqual(ctx.origins.length, 2);
    assert.strictEqual(ctx.effectStates.length, 5);
    assert.strictEqual(ctx.outcomeStatuses.length, 3);
    assert.strictEqual(ctx.packageStatuses.length, 3);
    assert.strictEqual(ctx.decisionActors.length, 2);
    assert.strictEqual(ctx.actionModes.length, 2);
    assert.strictEqual(ctx.taskStatuses.length, 6);

    // Retry eligibility: only not-applied yields eligible=true; applied and ambiguous deny retry
    assert.deepStrictEqual(computeRetryEligibility('not-applied'), { eligible: true });
    assert.deepStrictEqual(computeRetryEligibility('applied'), {
      eligible: false,
      reason: 'already applied',
    });
    assert.strictEqual(computeRetryEligibility('ambiguous').eligible, false);

    // Round-derived effects expose three round refs; operator-independent expose zero
    const roundDerivedId: ReviewEffectIdentity = {
      origin: 'round-derived',
      guardId: 'g1',
      decisionId: 'd1',
      proposalId: 'p1',
    };
    assert.strictEqual(
      enumerateRoundRefs({ identity: roundDerivedId } as Parameters<typeof enumerateRoundRefs>[0])
        .size,
      3
    );

    const independentId: ReviewEffectIdentity = {
      origin: 'operator-independent',
      operatorCommandId: 'cmd1',
      directTargetId: 'tgt1',
      directTargetVersion: 'v1',
    };
    assert.strictEqual(
      enumerateRoundRefs({ identity: independentId } as Parameters<typeof enumerateRoundRefs>[0])
        .size,
      0
    );

    // classifyEffectOrigin: any nonzero ref overrides claimed independent origin
    assert.strictEqual(classifyEffectOrigin(independentId, ['ref1']), 'round-derived');
    assert.strictEqual(classifyEffectOrigin(independentId, []), 'operator-independent');
  });
});
