// @file: Contract tests — queue accepts and replays exact publication handoff without translation.
// @consumers: TSK-177 audit
// @tasks: TSK-177

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  constructReviewGuardedIntent,
  guardedManifestKey,
  guardedDispatchPolicy,
} from '../../../services/agent-inbox/modules/inbox-queue/types/review-guarded-intent.type.ts';
import { ReviewEffectCoordinator } from '../../../services/agent-inbox/modules/inbox-queue/effects/review-effect-coordinator.ts';
import { ReviewActionCatalog } from '../../../services/agent-inbox/modules/inbox-queue/registry/review-action-catalog.ts';
import type { ReviewPublicationHandoff } from '../../../services/agent-inbox/modules/inbox-pipeline/types/review-publication-handoff.type.ts';
import type {
  JournalPort,
  JournalEntry,
} from '../../../services/agent-inbox/modules/inbox-core/event-journal.ts';
import {
  VcsPort,
  type VcsActionableMr,
  type MrDetail,
  type VcsDiscussion,
} from '../../../services/agent-inbox/modules/inbox-vcs/vcs-port.ts';

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

// Minimal VcsPort stub — readSnapshot throws so _readNewestManifestKey returns undefined (fresh)
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

const VALID_HANDOFF: ReviewPublicationHandoff = Object.freeze({
  handoffId: 'h-001',
  manifestKey: Object.freeze({ mr: 'g/p!1', headSHA: 'sha1', eventCursor: 'e1' }),
  manifestRef: 'mref-001',
  contractRef: 'cref-001',
  verdictRef: 'vref-001:PASS',
  guardedTransitionId: 'trans-001',
  acceptedObservedRevision: 'sha1:e1',
  capabilitySnapshot: Object.freeze({ can_comment: true, can_resolve: true }),
  capabilityVersion: 'v1.0',
  dispatchPolicy: Object.freeze({ kind: 'CONDITIONAL_SHA' as const, expectedHeadSHA: 'sha1' }),
  recommendationDigest: 'digest-abc',
  provenance: Object.freeze(['session-001']),
  deliveryStatus: 'ACCEPTED' as const,
});

type GuardedIntentContext = {
  coordinator: ReviewEffectCoordinator;
  catalog: ReviewActionCatalog;
};

function createGuardedIntentContext(): GuardedIntentContext {
  const catalog = new ReviewActionCatalog();
  const journal = createMemoryJournal();
  const vcs = new StubVcsPort() as unknown as VcsPort;
  const coordinator = new ReviewEffectCoordinator(vcs, journal, catalog);
  return { coordinator, catalog };
}

describe('ReviewGuardedIntentContract', () => {
  it('queue accepts and replays exact publication handoff without translation defaults or recomputation', async () => {
    // invariant: accepted bytes are stored byte-equivalent; guardId === handoffId;
    //   same-record replay is idempotent; digest conflict on replay fails closed
    const { coordinator } = createGuardedIntentContext();

    // #region START_ACCEPT_HANDOFF_FRESH
    const result = await coordinator.acceptGuardedHandoff(VALID_HANDOFF);
    assert.strictEqual(result.deliveryStatus, 'ACCEPTED');
    if (result.deliveryStatus !== 'ACCEPTED') return;

    const { guardedIntent } = result;
    // guardId is derived from handoffId with no translation
    assert.strictEqual(guardedIntent.guardId, VALID_HANDOFF.handoffId);
    // Handoff is stored byte-equivalent — no field renamed or defaulted
    assert.deepStrictEqual(guardedIntent.handoff, VALID_HANDOFF);
    // acceptedAt is an ISO timestamp (not the handoff's own timestamp)
    assert.ok(
      guardedIntent.acceptedAt.startsWith('2026'),
      `expected ISO timestamp, got: ${guardedIntent.acceptedAt}`
    );
    // #endregion END_ACCEPT_HANDOFF_FRESH

    // #region START_ACCEPT_HANDOFF_IDEMPOTENT
    // Same-record replay is idempotent — identical result, same guardId
    const replay = await coordinator.acceptGuardedHandoff(VALID_HANDOFF);
    assert.strictEqual(replay.deliveryStatus, 'ACCEPTED');
    if (replay.deliveryStatus !== 'ACCEPTED') return;
    assert.strictEqual(replay.guardedIntent.guardId, guardedIntent.guardId);
    // #endregion END_ACCEPT_HANDOFF_IDEMPOTENT

    // constructReviewGuardedIntent helper: validates byte-equivalence and fails on invalid input
    const directIntent = constructReviewGuardedIntent(VALID_HANDOFF, '2026-08-11T10:00:00Z');
    assert.strictEqual(directIntent.guardId, VALID_HANDOFF.handoffId);
    assert.ok(Object.isFrozen(directIntent));
    assert.deepStrictEqual(directIntent.handoff, VALID_HANDOFF);

    // guardedManifestKey and guardedDispatchPolicy extract without mutation
    const mk = guardedManifestKey(directIntent);
    assert.deepStrictEqual(mk, VALID_HANDOFF.manifestKey);
    const dp = guardedDispatchPolicy(directIntent);
    assert.deepStrictEqual(dp, VALID_HANDOFF.dispatchPolicy);
  });

  it('missing extra renamed or conflicting digest fields fail closed before proposal creation', async () => {
    // invariant: any schema violation (missing field, wrong deliveryStatus, extra field) is rejected
    const { coordinator } = createGuardedIntentContext();

    // Missing a required field (handoffId)
    const missingField = { ...VALID_HANDOFF } as Partial<ReviewPublicationHandoff>;
    delete missingField.handoffId;
    const r1 = await coordinator.acceptGuardedHandoff(missingField as ReviewPublicationHandoff);
    assert.strictEqual(r1.deliveryStatus, 'REJECTED');

    // Wrong deliveryStatus
    const wrongStatus = { ...VALID_HANDOFF, deliveryStatus: 'REJECTED' as 'ACCEPTED' };
    const r2 = await coordinator.acceptGuardedHandoff(wrongStatus);
    assert.strictEqual(r2.deliveryStatus, 'REJECTED');

    // Extra field (unknown key) — constructReviewPublicationHandoff checks exact key set
    const extraField = {
      ...VALID_HANDOFF,
      unknownField: 'extra',
    } as unknown as ReviewPublicationHandoff;
    const r3 = await coordinator.acceptGuardedHandoff(extraField);
    assert.strictEqual(r3.deliveryStatus, 'REJECTED');

    // Digest conflict on replay: same handoffId but different content → rejected
    const { coordinator: coord2 } = createGuardedIntentContext();
    await coord2.acceptGuardedHandoff(VALID_HANDOFF);
    // Second call with same handoffId but different digest content
    const conflicting = { ...VALID_HANDOFF, recommendationDigest: 'different-digest' };
    const r4 = await coord2.acceptGuardedHandoff(conflicting);
    assert.strictEqual(r4.deliveryStatus, 'REJECTED');
    if (r4.deliveryStatus === 'REJECTED') {
      assert.match(r4.reason, /[Dd]igest/);
    }
  });
});
