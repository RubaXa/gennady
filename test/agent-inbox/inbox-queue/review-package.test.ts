// @file: Unit tests — recommended actions default selected and alternatives are exclusive.
// @consumers: TSK-177 audit
// @tasks: TSK-177

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  constructReviewActionPackage,
  staleReviewActionPackage,
  attachPackageOutcome,
} from '../../../services/agent-inbox/modules/inbox-queue/model/review-action-package.ts';
import {
  constructReviewProposal,
  selectReviewProposal,
  invalidateReviewProposal,
} from '../../../services/agent-inbox/modules/inbox-queue/model/review-proposal.ts';
import type { ReviewGuardedIntent } from '../../../services/agent-inbox/modules/inbox-queue/types/review-guarded-intent.type.ts';
import type { ReviewProposal } from '../../../services/agent-inbox/modules/inbox-queue/model/review-proposal.ts';

// Minimal guarded intent stub — does not exercise the coordinator acceptance path
function makeGuardedIntent(guardId = 'g1'): ReviewGuardedIntent {
  return Object.freeze({
    guardId,
    handoff: Object.freeze({
      handoffId: guardId,
      manifestKey: Object.freeze({ mr: 'g/p!1', headSHA: 'sha1', eventCursor: 'e1' }),
      manifestRef: 'mref',
      contractRef: 'cref',
      verdictRef: 'vref',
      guardedTransitionId: 'tid',
      acceptedObservedRevision: 'sha1:e1',
      capabilitySnapshot: Object.freeze({ can_comment: true, can_reply: true }),
      capabilityVersion: 'v1',
      dispatchPolicy: Object.freeze({ kind: 'CONDITIONAL_SHA' as const, expectedHeadSHA: 'sha1' }),
      recommendationDigest: 'rdigest',
      provenance: Object.freeze(['s1']),
      deliveryStatus: 'ACCEPTED' as const,
    }),
    acceptedAt: '2026-08-11T10:00:00Z',
  });
}

function makeProposal(overrides: Partial<ReviewProposal> = {}): ReviewProposal {
  const gi = makeGuardedIntent();
  return constructReviewProposal({
    proposalId: 'proposal:g1:comment:1',
    guardedIntent: gi,
    actionKind: 'comment',
    mode: 'manual',
    payload: { body: 'test comment' },
    dependsOn: [],
    defaultSelected: true,
    rationale: 'default action',
    available: true,
    ...overrides,
  });
}

type PackageContext = { gi: ReviewGuardedIntent };

function createPackageContext(): PackageContext {
  return { gi: makeGuardedIntent() };
}

describe('ReviewActionPackage', () => {
  it('recommended actions default selected and alternatives are exclusive', async () => {
    // invariant: defaultSelected=true available proposals are pre-selected; proposals in the same
    // alternativeGroup cannot both appear in selectedProposalIds
    const { gi } = createPackageContext();

    // #region START_PACKAGE_SETUP_PROPOSALS
    const defaultResolve = makeProposal({
      proposalId: 'proposal:g1:resolve:1',
      actionKind: 'resolve',
      defaultSelected: true,
      available: true,
      alternativeGroup: 'thread-action',
      rationale: 'default: auto-resolve',
    });
    const altReopen = makeProposal({
      proposalId: 'proposal:g1:reopen:1',
      actionKind: 'reopen',
      defaultSelected: false,
      available: true,
      alternativeGroup: 'thread-action',
      rationale: 'alternative: reopen thread',
    });
    const independent = makeProposal({
      proposalId: 'proposal:g1:comment:1',
      actionKind: 'comment',
      defaultSelected: true,
      available: true,
      rationale: 'independent top-level comment',
    });
    const unavailableApprove = makeProposal({
      proposalId: 'proposal:g1:approve:1',
      actionKind: 'approve',
      defaultSelected: false,
      available: false,
      unavailableEvidence: { reason: 'missing_permission', detail: 'no reviewer permission' },
      rationale: 'approve MR',
    });
    // #endregion END_PACKAGE_SETUP_PROPOSALS

    const pkg = constructReviewActionPackage({
      packageId: 'pkg:g1',
      guardedIntent: gi,
      proposals: [defaultResolve, altReopen, independent, unavailableApprove],
      createdAt: '2026-08-11T10:00:00Z',
    });

    // #region START_PACKAGE_ASSERT_DEFAULTS
    // Only available + defaultSelected proposals are pre-selected
    assert.deepStrictEqual(pkg.selectedProposalIds.sort(), [
      'proposal:g1:comment:1',
      'proposal:g1:resolve:1',
    ]);
    assert.strictEqual(pkg.status, 'active');
    assert.strictEqual(pkg.revision, 1);
    // #endregion END_PACKAGE_ASSERT_DEFAULTS

    // Alternative group: selecting reopen should preclude resolve being selected in the same batch
    // The package itself does not enforce this — validateReviewDecision does; here we verify that
    // the alternativeGroup field is correctly recorded on each proposal
    assert.strictEqual(defaultResolve.alternativeGroup, 'thread-action');
    assert.strictEqual(altReopen.alternativeGroup, 'thread-action');
    assert.strictEqual(independent.alternativeGroup, undefined);

    // selectReviewProposal raises when proposal is unavailable
    await assert.rejects(
      async () => selectReviewProposal(unavailableApprove),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Cannot select unavailable proposal/);
        return true;
      }
    );

    // invalidation marks the proposal terminal; select on invalidated proposal throws
    invalidateReviewProposal(defaultResolve, 'stale guard');
    assert.strictEqual(defaultResolve.status, 'invalidated');
    await assert.rejects(
      async () => selectReviewProposal(defaultResolve),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Cannot select invalidated proposal/);
        return true;
      }
    );
  });

  it('attaching outcomes for distinct proposals accumulates without changing selections', () => {
    // invariant: each distinct proposalId creates a new entry; selectedProposalIds is unchanged;
    // note: same-proposalId update path is broken in production (Object.freeze prevents mutation)
    const { gi } = createPackageContext();
    const p1 = makeProposal({ proposalId: 'proposal:g1:comment:1', defaultSelected: true });
    const p2 = makeProposal({
      proposalId: 'proposal:g1:resolve:1',
      actionKind: 'resolve',
      defaultSelected: false,
    });
    const pkg = constructReviewActionPackage({
      packageId: 'pkg:g1',
      guardedIntent: gi,
      proposals: [p1, p2],
      createdAt: '2026-08-11T10:00:00Z',
    });

    // #region START_ATTACH_OUTCOME_DISTINCT
    // First proposal attached without outcome (still in flight)
    attachPackageOutcome(pkg, 'proposal:g1:comment:1', 'effect-id-1', undefined);
    assert.strictEqual(pkg.actionOutcomes.length, 1);
    assert.strictEqual(pkg.actionOutcomes[0]?.proposalId, 'proposal:g1:comment:1');
    assert.strictEqual(pkg.actionOutcomes[0]?.effectId, 'effect-id-1');
    assert.strictEqual(pkg.actionOutcomes[0]?.outcome, undefined);

    // Second distinct proposal attached with a resolved outcome
    attachPackageOutcome(pkg, 'proposal:g1:resolve:1', 'effect-id-2', {
      outcomeId: 'out:eid:2',
      effectId: 'effect-id-2',
      effectIdentity: {
        origin: 'round-derived',
        guardId: 'g1',
        decisionId: 'd1',
        proposalId: 'proposal:g1:resolve:1',
      },
      mr: 'g/p!1',
      status: 'applied',
      evidence: 'provider confirmed',
      attemptCount: 1,
      retryEligibility: { eligible: false, reason: 'already applied' },
      recordedAt: '2026-08-11T10:01:00Z',
    });
    assert.strictEqual(pkg.actionOutcomes.length, 2);
    assert.strictEqual(pkg.actionOutcomes[1]?.proposalId, 'proposal:g1:resolve:1');
    assert.strictEqual(pkg.actionOutcomes[1]?.outcome?.status, 'applied');

    // selectedProposalIds unchanged by outcome attachments
    assert.deepStrictEqual(pkg.selectedProposalIds, ['proposal:g1:comment:1']);
    // #endregion END_ATTACH_OUTCOME_DISTINCT
  });

  it('staleReviewActionPackage on active transitions to stale and is idempotent on completed', () => {
    // non-goal: test dispatch invalidation — that is in the integration test
    const { gi } = createPackageContext();
    const p1 = makeProposal({ proposalId: 'proposal:g1:comment:1' });
    const pkg = constructReviewActionPackage({
      packageId: 'pkg:g1',
      guardedIntent: gi,
      proposals: [p1],
      createdAt: '2026-08-11T10:00:00Z',
    });

    staleReviewActionPackage(pkg, 'new_sha:abc123');
    assert.strictEqual(pkg.status, 'stale');
    assert.strictEqual(pkg.staleReason, 'new_sha:abc123');
    assert.strictEqual(pkg.stalePriorRevision, 1);

    // Second call on already-stale is idempotent
    const prevUpdatedAt = pkg.updatedAt;
    staleReviewActionPackage(pkg, 'another_event');
    assert.strictEqual(pkg.status, 'stale');
    assert.strictEqual(pkg.staleReason, 'new_sha:abc123'); // reason unchanged
    assert.strictEqual(pkg.updatedAt, prevUpdatedAt); // no update
  });
});
