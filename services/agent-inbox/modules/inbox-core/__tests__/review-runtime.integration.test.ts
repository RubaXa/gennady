// @file: Public production-style sync proof for canonical review ingestion and SystemClock scheduling.
// @consumers: node:test runner
// @tasks: TSK-173

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryJournal } from '../adapters/in-memory-journal.ts';
import { SystemClock } from '../adapters/system-clock.ts';
import { ReviewConfig } from '../review-config.ts';
import { ReviewState } from '../state/review-state.ts';
import { SyncService } from '../../inbox-vcs/sync.ts';
import type { VcsPort } from '../../inbox-vcs/vcs-port.ts';
import type { InboxRegistryAccess } from '../inbox-registry.ts';
import type { VcsActionableMr } from '../../../../vcs-client/entities/vcs-actionable-mr.type.ts';

type ReviewRuntimeContext = {
  journal: InMemoryJournal;
  clock: SystemClock;
  sync: SyncService;
};

function createReviewRuntimeContext(): ReviewRuntimeContext {
  const journal = new InMemoryJournal();
  const clock = new SystemClock();
  const updatedAt = new Date(Date.now() - 60_000).toISOString();
  const mr: VcsActionableMr = {
    iid: '42',
    project: 'group/project',
    webUrl: 'https://gitlab.example/group/project/-/merge_requests/42',
    title: 'Canonical state',
    description: 'Runtime-backed review state',
    author: 'author',
    reviewers: ['operator'],
    approvedBy: [],
    updatedAt,
    draft: false,
    state: 'opened',
    role: null,
    events: [],
    directlyAddressed: false,
    todoIds: [],
    headSha: 'head-1',
  };
  const vcs = {
    getInbox: async () => [mr],
    getCurrentUserLogin: async () => 'operator',
  } as unknown as VcsPort;
  const registry = {
    load: () => ({ entries: {} }),
  } as unknown as InboxRegistryAccess;
  return {
    journal,
    clock,
    sync: new SyncService(vcs, registry, new InMemoryJournal() as never, {
      canonicalReview: {
        journal,
        config: new ReviewConfig({ quietMs: 1 }),
        clock,
      },
    }),
  };
}

describe('canonical review production runtime', () => {
  it('real sync ingestion uses SystemClock and durably requests timer verification', async () => {
    const context = createReviewRuntimeContext();

    await context.sync.twoTierSync();
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    await context.sync.twoTierSync();
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const events = context.journal.replayReviewEvents();
    assert.deepStrictEqual(
      events.map((event) => ({ kind: event.kind, actor: event.actor.id })),
      [
        { kind: 'mr_observed', actor: 'gitlab-sync' },
        { kind: 'verification_requested', actor: 'system-clock' },
      ]
    );
    assert.strictEqual(context.clock.identity, 'system-clock');
    assert.deepStrictEqual(context.clock.health(), { status: 'healthy' });
    assert.strictEqual(ReviewState.fold(events).changeBatch().nextVerificationAt(), null);
    assert.deepStrictEqual(ReviewState.fold(events).toSnapshot().effectSummary, {
      manualVerificationRequests: 0,
      timerVerificationRequests: 1,
      verificationStarts: 0,
      verificationApplications: 0,
      verificationFailures: 0,
      lifecycleCompletions: 0,
    });
  });
});
