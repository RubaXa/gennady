// @file: Unit tests — automation restores only verified prior operator intent; ownership truth table.
// @consumers: TSK-177 audit
// @tasks: TSK-177

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ReviewAutomationPolicy } from '../../../services/agent-inbox/modules/inbox-queue/automation/review-automation-policy.ts';
import type {
  AutomationPolicyConfig,
  VerifiedFixEvidence,
  PriorApprovalEvidence,
} from '../../../services/agent-inbox/modules/inbox-queue/automation/review-automation-policy.ts';
import type { ReviewGuardedIntent } from '../../../services/agent-inbox/modules/inbox-queue/types/review-guarded-intent.type.ts';

function makeGuardedIntent(deliveryStatus: 'ACCEPTED' = 'ACCEPTED'): ReviewGuardedIntent {
  return Object.freeze({
    guardId: 'g1',
    handoff: Object.freeze({
      handoffId: 'g1',
      manifestKey: Object.freeze({ mr: 'g/p!1', headSHA: 'sha1', eventCursor: 'e1' }),
      manifestRef: 'mref',
      contractRef: 'cref',
      verdictRef: 'vref',
      guardedTransitionId: 'tid',
      acceptedObservedRevision: 'sha1:e1',
      capabilitySnapshot: Object.freeze({}),
      capabilityVersion: 'v1',
      dispatchPolicy: Object.freeze({ kind: 'CONDITIONAL_SHA' as const, expectedHeadSHA: 'sha1' }),
      recommendationDigest: 'rdigest',
      provenance: Object.freeze(['s1']),
      deliveryStatus,
    }),
    acceptedAt: '2026-08-11T10:00:00Z',
  });
}

const DEFAULT_CONFIG: AutomationPolicyConfig = Object.freeze({
  operatorAllowlist: ['alice', 'bob'],
  botAllowlist: ['review-bot'],
  requireFreshCoverage: true,
});

const PRIOR_APPROVAL: PriorApprovalEvidence = Object.freeze({
  approvedAt: '2026-08-10T09:00:00Z',
  manifestRef: 'sha0:e0',
  operatorLogin: 'alice',
});

const VERIFIED_FIX: VerifiedFixEvidence = Object.freeze({
  discussionId: 'disc:1',
  threadOwner: 'alice',
  ownerAllowlisted: true,
  verificationRef: 'ver:abc',
});

type AutoContext = {
  policy: ReviewAutomationPolicy;
  gi: ReviewGuardedIntent;
};

function createAutoContext(overrides: Partial<AutomationPolicyConfig> = {}): AutoContext {
  return {
    policy: new ReviewAutomationPolicy({ ...DEFAULT_CONFIG, ...overrides }),
    gi: makeGuardedIntent(),
  };
}

describe('ReviewAutomationPolicy', () => {
  it('automation restores only verified prior operator intent', () => {
    // invariant: auto-resolve requires allowlisted thread owner + verification proof;
    //   restore-approve requires prior approval + fresh PASS + no blocking finding
    const { policy, gi } = createAutoContext();

    // Auto-resolve: operator-allowlisted owner + proof → allowed
    const resolveResult = policy.evaluateAutoResolve('resolve', VERIFIED_FIX, false);
    assert.strictEqual(resolveResult.allowed, true);

    // Auto-resolve: non-allowlisted owner → denied with proposal fallback
    const foreignOwner: VerifiedFixEvidence = { ...VERIFIED_FIX, threadOwner: 'stranger' };
    const denyForeign = policy.evaluateAutoResolve('resolve', foreignOwner, false);
    assert.strictEqual(denyForeign.allowed, false);
    if (!denyForeign.allowed) {
      assert.strictEqual(denyForeign.fallback, 'proposal');
      assert.match(denyForeign.reason, /not in allowlist/);
    }

    // Auto-resolve: bot thread on own MR → allowed
    const botFix: VerifiedFixEvidence = {
      ...VERIFIED_FIX,
      threadOwner: 'review-bot',
    };
    const botResult = policy.evaluateAutoResolve('resolve', botFix, true);
    assert.strictEqual(botResult.allowed, true);

    // Auto-resolve: bot thread on non-own MR → denied
    const botNonOwn = policy.evaluateAutoResolve('resolve', botFix, false);
    assert.strictEqual(botNonOwn.allowed, false);

    // Auto-resolve: wrong kind → denied
    const wrongKind = policy.evaluateAutoResolve('approve', VERIFIED_FIX, false);
    assert.strictEqual(wrongKind.allowed, false);

    // Restore-approve: prior approval + fresh PASS + no blocking finding → allowed
    const approveResult = policy.evaluateRestoreApprove('approve', gi, PRIOR_APPROVAL, false);
    assert.strictEqual(approveResult.allowed, true);

    // Restore-approve: blocking finding present → denied
    const blocking = policy.evaluateRestoreApprove('approve', gi, PRIOR_APPROVAL, true);
    assert.strictEqual(blocking.allowed, false);
    if (!blocking.allowed) assert.match(blocking.reason, /Blocking finding/);

    // Restore-approve: no prior approval → denied
    const noPrior = policy.evaluateRestoreApprove('approve', gi, undefined, false);
    assert.strictEqual(noPrior.allowed, false);
    if (!noPrior.allowed) assert.match(noPrior.reason, /No prior approval/);
  });

  it('automation ownership coverage blocking and prior approval truth table denies unsafe branches', () => {
    // invariant: truth table — operator thread, bot thread on own/non-own MR, foreign thread,
    //   missing coverage, blocking finding, absent prior approval → only safe paths execute
    const { policy } = createAutoContext();
    const gi = makeGuardedIntent();

    type Row = {
      label: string;
      kind: Parameters<typeof policy.evaluate>[0];
      ctx: Parameters<typeof policy.evaluate>[2];
      expectedAllowed: boolean;
      expectedFallback?: 'proposal' | 'no-action';
    };

    const rows: Row[] = [
      // Row 1: operator thread — allowed via evaluateAutoResolve
      {
        label: 'operator-thread-allowlisted',
        kind: 'resolve',
        ctx: { fixEvidence: { ...VERIFIED_FIX, threadOwner: 'alice' }, isOwnMr: false },
        expectedAllowed: true,
      },
      // Row 2: bot thread on own MR — allowed
      {
        label: 'bot-thread-own-mr',
        kind: 'resolve',
        ctx: { fixEvidence: { ...VERIFIED_FIX, threadOwner: 'review-bot' }, isOwnMr: true },
        expectedAllowed: true,
      },
      // Row 3: bot thread on non-own MR — denied
      {
        label: 'bot-thread-non-own-mr',
        kind: 'resolve',
        ctx: { fixEvidence: { ...VERIFIED_FIX, threadOwner: 'review-bot' }, isOwnMr: false },
        expectedAllowed: false,
        expectedFallback: 'proposal',
      },
      // Row 4: foreign thread — denied
      {
        label: 'foreign-thread',
        kind: 'resolve',
        ctx: { fixEvidence: { ...VERIFIED_FIX, threadOwner: 'stranger' }, isOwnMr: false },
        expectedAllowed: false,
        expectedFallback: 'proposal',
      },
      // Row 5: missing fix evidence for resolve — denied
      {
        label: 'missing-fix-evidence',
        kind: 'resolve',
        ctx: {},
        expectedAllowed: false,
        expectedFallback: 'proposal',
      },
      // Row 6: prior approval + no blocking + fresh PASS → allowed restore-approve
      {
        label: 'restore-approve-all-gates-pass',
        kind: 'approve',
        ctx: { priorApproval: PRIOR_APPROVAL, hasBlockingFinding: false },
        expectedAllowed: true,
      },
      // Row 7: prior approval + blocking finding → denied
      {
        label: 'restore-approve-blocking-finding',
        kind: 'approve',
        ctx: { priorApproval: PRIOR_APPROVAL, hasBlockingFinding: true },
        expectedAllowed: false,
        expectedFallback: 'proposal',
      },
      // Row 8: absent prior approval → denied
      {
        label: 'restore-approve-no-prior-approval',
        kind: 'approve',
        ctx: { hasBlockingFinding: false },
        expectedAllowed: false,
        expectedFallback: 'proposal',
      },
      // Row 9: action kind with no automation policy → denied with no-action fallback
      {
        label: 'no-policy-kind',
        kind: 'comment',
        ctx: {},
        expectedAllowed: false,
        expectedFallback: 'no-action',
      },
    ];

    for (const row of rows) {
      const result = policy.evaluate(row.kind, gi, row.ctx);
      assert.strictEqual(result.allowed, row.expectedAllowed, `[${row.label}] allowed mismatch`);
      if (!result.allowed && row.expectedFallback !== undefined) {
        assert.strictEqual(
          result.fallback,
          row.expectedFallback,
          `[${row.label}] fallback mismatch`
        );
      }
    }
  });
});
