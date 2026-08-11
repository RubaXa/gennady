// @file: Integration tests — independent effects continue after partial failure.
// @consumers: TSK-177 audit
// @tasks: TSK-177

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ReviewEffectCoordinator } from '../../../services/agent-inbox/modules/inbox-queue/effects/review-effect-coordinator.ts';
import { ReviewActionCatalog } from '../../../services/agent-inbox/modules/inbox-queue/registry/review-action-catalog.ts';
import { enqueueReviewEffect } from '../../../services/agent-inbox/modules/inbox-queue/model/review-effect-queue.ts';
import { constructReviewDecision } from '../../../services/agent-inbox/modules/inbox-queue/model/review-decision.ts';
import { constructReviewActionPackage } from '../../../services/agent-inbox/modules/inbox-queue/model/review-action-package.ts';
import type { ReviewEffect } from '../../../services/agent-inbox/modules/inbox-queue/types/review-effect.type.ts';
import type { ReviewGuardedIntent } from '../../../services/agent-inbox/modules/inbox-queue/types/review-guarded-intent.type.ts';
import type { ReviewEffectQueue } from '../../../services/agent-inbox/modules/inbox-queue/model/review-effect-queue.ts';
import type { DispatchContext } from '../../../services/agent-inbox/modules/inbox-queue/effects/review-effect-coordinator.ts';
import type {
  JournalPort,
  JournalEntry,
} from '../../../services/agent-inbox/modules/inbox-core/event-journal.ts';
import {
  VcsPort,
  type VcsEffectKind,
  type VcsEffectOutcome,
  type VcsActionableMr,
  type MrDetail,
  type VcsDiscussion,
} from '../../../services/agent-inbox/modules/inbox-vcs/vcs-port.ts';

// ── Minimal collaborator fakes ──────────────────────────────────────────────

function createMemoryJournal(): JournalPort {
  const entries: JournalEntry[] = [];
  return {
    identity: 'memory-journal',
    health: () => ({ status: 'healthy' }),
    append: async (entry) => {
      const seq = entries.length + 1;
      entries.push({ ...entry, seq });
      return seq;
    },
    read: () => [...entries],
    since: (cursor) => {
      const filtered = entries.filter((e) => e.seq > cursor);
      const nextCursor = entries.length > 0 ? (entries[entries.length - 1]?.seq ?? cursor) : cursor;
      return { entries: filtered, nextCursor };
    },
    appendReviewEvent: async () => {
      throw new Error('not implemented');
    },
    replayReviewEvents: () => [],
  };
}

// StubVcsPort: readSnapshot throws → _readNewestManifestKey returns undefined (treated as fresh)
class StubVcsPort extends VcsPort {
  getHost(): string {
    return 'https://gitlab.test';
  }
  async getCurrentUserLogin(): Promise<string> {
    throw new Error('not implemented');
  }
  async getInbox(): Promise<VcsActionableMr[]> {
    throw new Error('not implemented');
  }
  async getMrDetail(): Promise<MrDetail> {
    throw new Error('not implemented');
  }
  async getDiscussions(): Promise<{
    discussions: VcsDiscussion[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  }> {
    throw new Error('not implemented');
  }
  async compareSha(): Promise<{ commits: string[]; complete: boolean; evidence: string }> {
    throw new Error('not implemented');
  }
  async postNote(): Promise<void> {
    throw new Error('not implemented');
  }
  async postDiscussion(): Promise<void> {
    throw new Error('not implemented');
  }
  async react(): Promise<void> {
    throw new Error('not implemented');
  }
  async resolve(): Promise<void> {
    throw new Error('not implemented');
  }
  async approve(): Promise<void> {
    throw new Error('not implemented');
  }
  async editDescription(): Promise<void> {
    throw new Error('not implemented');
  }
}

// TestableCoordinator: replaces internal Effects with a controlled fake
type FakeApply = (request: unknown) => Promise<VcsEffectOutcome>;

class TestableCoordinator extends ReviewEffectCoordinator {
  constructor(
    vcs: VcsPort,
    journal: JournalPort,
    catalog: ReviewActionCatalog,
    fakeApply: FakeApply
  ) {
    super(vcs, journal, catalog);
    (this as unknown as { _effects: { apply: FakeApply } })._effects = { apply: fakeApply };
  }
}

// ── Test data factories ──────────────────────────────────────────────────────

function makeGuardedIntent(): ReviewGuardedIntent {
  return Object.freeze({
    guardId: 'g1',
    handoff: Object.freeze({
      handoffId: 'g1',
      manifestKey: Object.freeze({ mr: 'g/p!1', headSHA: 'sha-current', eventCursor: 'e1' }),
      manifestRef: 'mref',
      contractRef: 'cref',
      verdictRef: 'vref',
      guardedTransitionId: 'tid',
      acceptedObservedRevision: 'sha-current:e1',
      capabilitySnapshot: Object.freeze({}),
      capabilityVersion: 'v1',
      dispatchPolicy: Object.freeze({
        kind: 'CONDITIONAL_SHA' as const,
        expectedHeadSHA: 'sha-current',
      }),
      recommendationDigest: 'rdigest',
      provenance: Object.freeze([]),
      deliveryStatus: 'ACCEPTED' as const,
    }),
    acceptedAt: '2026-08-11T10:00:00Z',
  });
}

function makeRoundEffect(effectId: string, deps: readonly string[] = []): ReviewEffect {
  return Object.freeze({
    effectId,
    kind: 'comment' as const,
    mr: 'g/p!1',
    identity: Object.freeze({
      origin: 'round-derived' as const,
      guardId: 'g1',
      decisionId: 'd1',
      proposalId: `p-${effectId}`,
    }),
    payload: Object.freeze({ body: `body for ${effectId}` }),
    dependsOn: Object.freeze([...deps]),
    state: 'queued' as const,
    idempotencyKey: effectId,
    attemptCount: 0,
    provenance: Object.freeze({ classifierVersion: '1.0', examinedRefs: Object.freeze([]) }),
    createdAt: '2026-08-11T10:00:00Z',
  });
}

type CoordinatorContext = {
  coordinator: TestableCoordinator;
  failedEffectIds: Set<string>;
};

function createCoordinatorContext(failedEffectIds: string[]): CoordinatorContext {
  const failSet = new Set(failedEffectIds);
  const fakeApply: FakeApply = async (request) => {
    const req = request as { effectId: string; kind: string };
    if (failSet.has(req.effectId)) {
      throw new Error(`[fake] network error for effect ${req.effectId}`);
    }
    return {
      effectId: req.effectId,
      kind: req.kind as VcsEffectKind,
      status: 'applied',
      evidence: 'fake provider confirmed',
      readBeforeRetry: false,
    };
  };
  const catalog = new ReviewActionCatalog();
  const journal = createMemoryJournal();
  const vcs = new StubVcsPort() as unknown as VcsPort;
  return {
    coordinator: new TestableCoordinator(vcs, journal, catalog, fakeApply),
    failedEffectIds: failSet,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ReviewEffectCoordinatorIntegration', () => {
  it('independent effects continue after partial failure', async () => {
    // invariant: effect A (independent) succeeds; effect B (independent) throws → ambiguous;
    //   effect C (dependsOn B) is never claimed because B's outcome is not 'applied';
    //   effect D (independent) succeeds; partial failure does not halt D
    const { coordinator } = createCoordinatorContext(['eff-B']);
    const gi = makeGuardedIntent();

    // #region START_PARTIAL_FAILURE_SETUP
    const effA = makeRoundEffect('eff-A');
    const effB = makeRoundEffect('eff-B');
    const effC = makeRoundEffect('eff-C', ['eff-B']); // blocked until B is applied
    const effD = makeRoundEffect('eff-D');

    const queue: ReviewEffectQueue = {
      queueId: 'q-dispatch',
      origin: 'round-derived',
      roundRefs: Object.freeze({ packageId: 'pkg:g1', decisionId: 'd1', guardId: 'g1' }),
      entries: [],
      createdAt: '2026-08-11T10:00:00Z',
    };
    enqueueReviewEffect(queue, effA);
    enqueueReviewEffect(queue, effB);
    enqueueReviewEffect(queue, effC);
    enqueueReviewEffect(queue, effD);

    const decision = constructReviewDecision({
      decisionId: 'd1',
      packageId: 'pkg:g1',
      guardedIntent: gi,
      selectedProposalIds: ['p-eff-A', 'p-eff-B', 'p-eff-D'],
      rejectedProposalIds: [],
      actor: 'operator',
      mode: 'manual',
      reason: 'operator approved',
      decidedAt: '2026-08-11T10:01:00Z',
    });

    const pkg = constructReviewActionPackage({
      packageId: 'pkg:g1',
      guardedIntent: gi,
      proposals: [],
      createdAt: '2026-08-11T10:00:00Z',
    });

    const ctx: DispatchContext = { decision, proposals: [], queue, package: pkg };
    // #endregion END_PARTIAL_FAILURE_SETUP

    const result = await coordinator.dispatchAndReconcile(ctx);

    // #region START_PARTIAL_FAILURE_ASSERT
    // dispatched=2 (A,D ok), failed=1 (B threw→ambiguous), skipped=0; C blocked on B
    assert.strictEqual(result.dispatched, 2, 'dispatched count');
    assert.strictEqual(result.failed, 1, 'failed count');
    assert.strictEqual(result.skipped, 0, 'skipped count');
    assert.strictEqual(result.independent, 0, 'independent count');

    const entryA = queue.entries.find((e) => e.effect.effectId === 'eff-A');
    assert.ok(entryA, 'entry A must exist');
    assert.strictEqual(entryA.state, 'reconciled');
    assert.strictEqual(entryA.outcome?.status, 'applied');

    const entryB = queue.entries.find((e) => e.effect.effectId === 'eff-B');
    assert.ok(entryB, 'entry B must exist');
    assert.strictEqual(entryB.state, 'reconciled');
    assert.strictEqual(entryB.outcome?.status, 'ambiguous');

    // C: still queued — dep B is ambiguous not applied; D: independent sibling continued
    const entryC = queue.entries.find((e) => e.effect.effectId === 'eff-C');
    assert.ok(entryC, 'entry C must exist');
    assert.strictEqual(entryC.state, 'queued');
    assert.strictEqual(entryC.outcome, undefined);

    const entryD = queue.entries.find((e) => e.effect.effectId === 'eff-D');
    assert.ok(entryD, 'entry D must exist');
    assert.strictEqual(entryD.state, 'reconciled');
    assert.strictEqual(entryD.outcome?.status, 'applied');
    // #endregion END_PARTIAL_FAILURE_ASSERT
  });

  it('stale manifest check invalidates remainder and increments skipped', async () => {
    // invariant: when _readNewestManifestKey returns a headSHA different from the accepted key,
    //   the package is staled and remaining queued effects are invalidated; skipped is incremented
    // Use a VcsPort that returns a *different* headSha to trigger the stale path
    class StaleVcsPort extends VcsPort {
      getHost() {
        return 'https://gitlab.test';
      }
      async getCurrentUserLogin(): Promise<string> {
        return 'op';
      }
      async getInbox(): Promise<VcsActionableMr[]> {
        return [];
      }
      async getMrDetail(): Promise<MrDetail> {
        return {
          project: 'g/p',
          iid: '1',
          webUrl: 'u',
          title: 't',
          description: '',
          author: 'op',
          reviewers: [],
          approvedBy: [],
          updatedAt: new Date().toISOString(),
          state: 'opened',
          headSha: 'sha-NEW',
          pipelineStatus: null,
          userNotesCount: 0,
          draft: false,
        };
      }
      async getDiscussions(): Promise<{
        discussions: VcsDiscussion[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      }> {
        return { discussions: [], pageInfo: { hasNextPage: false, endCursor: null } };
      }
      async compareSha(): Promise<{ commits: string[]; complete: boolean; evidence: string }> {
        return { commits: [], complete: true, evidence: 'ok' };
      }
      async postNote(): Promise<void> {
        return;
      }
      async postDiscussion(): Promise<void> {
        return;
      }
      async react(): Promise<void> {
        return;
      }
      async resolve(): Promise<void> {
        return;
      }
      async approve(): Promise<void> {
        return;
      }
      async editDescription(): Promise<void> {
        return;
      }
    }

    const fakeApply: FakeApply = async () => ({
      effectId: 'x',
      kind: 'comment' as const,
      status: 'applied',
      evidence: 'ok',
      readBeforeRetry: false,
    });

    const catalog = new ReviewActionCatalog();
    const journal = createMemoryJournal();
    const vcs = new StaleVcsPort() as unknown as VcsPort;
    const coord = new TestableCoordinator(vcs, journal, catalog, fakeApply);

    const gi = makeGuardedIntent(); // headSHA = 'sha-current'
    const effE = makeRoundEffect('eff-E');

    const queue: ReviewEffectQueue = {
      queueId: 'q-stale',
      origin: 'round-derived',
      roundRefs: Object.freeze({ packageId: 'pkg:g1', decisionId: 'd1', guardId: 'g1' }),
      entries: [],
      createdAt: '2026-08-11T10:00:00Z',
    };
    enqueueReviewEffect(queue, effE);

    const decision = constructReviewDecision({
      decisionId: 'd1',
      packageId: 'pkg:g1',
      guardedIntent: gi,
      selectedProposalIds: [],
      rejectedProposalIds: [],
      actor: 'operator',
      mode: 'manual',
      reason: 'test',
      decidedAt: '2026-08-11T10:01:00Z',
    });

    const pkg = constructReviewActionPackage({
      packageId: 'pkg:g1',
      guardedIntent: gi,
      proposals: [],
      createdAt: '2026-08-11T10:00:00Z',
    });

    const result = await coord.dispatchAndReconcile({
      decision,
      proposals: [],
      queue,
      package: pkg,
    });

    // Effect E was claimed (dispatching) then stale fired — skipped=1; dispatched=0;
    // The already-claimed dispatching entry is NOT invalidated (spec invariant: only queued entries are
    // invalidated; dispatching/unconfirmed entries continue through reconciliation).
    assert.strictEqual(result.skipped, 1);
    assert.strictEqual(result.dispatched, 0);
    assert.strictEqual(pkg.status, 'stale');
    assert.ok(pkg.staleReason?.includes('sha-NEW'));
    // Entry is dispatching (claimed before stale was detected) — not invalidated
    assert.strictEqual(queue.entries[0]?.state, 'dispatching');
  });
});
