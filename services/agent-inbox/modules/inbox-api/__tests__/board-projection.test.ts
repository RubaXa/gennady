// @file: BoardProjectionTests — contract tests: board consistency, attention groups, syncState, MrCard fields, empty board.
// @consumers: node:test runner
// @tasks: TSK-162

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { BoardProjection } from '../projections/board-projection.ts';
import type { SyncSnapshot } from '../../inbox-vcs/sync.ts';
import type { VcsActionableMr } from '../../../../vcs-client/entities/vcs-actionable-mr.type.ts';
import type { AttentionState } from '../../inbox-vcs/attention.ts';
import type { EventJournal } from '../../inbox-core/event-journal.ts';
import type { InboxRegistryAccess } from '../../inbox-core/inbox-registry.ts';
import type { SseHub } from '../sse-hub.ts';

const FIXED_TS = '2026-08-06T22:15:00Z';

function makeMockJournal(entries: ReturnType<typeof mockJournalSince>['entries'] = []) {
  const sinceFn = mock.fn((_cursor: number) => ({ entries, nextCursor: entries.length }));
  return { since: sinceFn, _sinceFn: sinceFn } as unknown as {
    since: typeof sinceFn;
    _sinceFn: typeof sinceFn;
  } & EventJournal;
}

function mockJournalSince(
  entries: Array<{
    ts: string;
    seq: number;
    mr: string;
    kind: string;
    payload?: Record<string, unknown>;
  }>
) {
  return {
    entries: entries as Array<import('../../inbox-core/event-journal.ts').JournalEntry>,
    nextCursor: entries.length,
  };
}

function makeMockRegistry(lastReadAtMap: Record<string, string | null> = {}) {
  const entriesMap: Record<string, unknown> = {};
  for (const [webUrl, ts] of Object.entries(lastReadAtMap)) {
    entriesMap[webUrl] = { lastReadAt: ts };
  }
  const loadFn = mock.fn(() => ({ entries: entriesMap }));
  const recordFn = mock.fn(() => {});
  const saveFn = mock.fn(() => {});
  return { load: loadFn, recordLastRead: recordFn, save: saveFn, _loadFn: loadFn } as unknown as {
    load: typeof loadFn;
    recordLastRead: typeof recordFn;
    save: typeof saveFn;
  } & InboxRegistryAccess;
}

function makeMr(overrides?: Partial<VcsActionableMr>): VcsActionableMr {
  return {
    iid: '1',
    project: 'group/project',
    webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/1',
    title: 'feat: first MR',
    description: '',
    author: 'alice',
    reviewers: ['bob'],
    approvedBy: [],
    updatedAt: FIXED_TS,
    draft: false,
    state: 'opened',
    role: 'reviewer',
    events: [],
    directlyAddressed: false,
    todoIds: [],
    ...overrides,
  };
}

function makeSnapshot(overrides?: Partial<SyncSnapshot>): SyncSnapshot {
  return {
    mr: makeMr(),
    role: 'reviewer',
    attention: '⏳' as AttentionState,
    stage: 'review_needed',
    approvals: { n: 0, m: 2, approvedBy: [] },
    reviewers: ['bob'],
    ci: { status: 'pending' },
    threads: { open: 2, total: 5, awaitingMe: 1 },
    headSha: 'abc123',
    lastReviewedHeadSha: null,
    headCommittedAt: FIXED_TS,
    updatedAt: FIXED_TS,
    estimated: false,
    ...overrides,
  };
}

describe('BoardProjection', () => {
  describe('project()', () => {
    it('board is consistent after ready', () => {
      // invariant: same snapshot set produces identical groups across consecutive project() calls — no flickering
      const snap = makeSnapshot();
      const journal = makeMockJournal();
      const registry = makeMockRegistry();
      const proj = new BoardProjection([snap], journal, registry);

      const r1 = proj.project();
      const r2 = proj.project();

      assert.deepStrictEqual(r1, r2);
    });

    it('attention groups are populated from sync snapshot', () => {
      const snap = makeSnapshot({ attention: '💬' as AttentionState });
      const journal = makeMockJournal();
      const registry = makeMockRegistry();
      const proj = new BoardProjection([snap], journal, registry);

      const result = proj.project();

      assert.strictEqual(result.groups['💬'].length, 1);
      assert.strictEqual(result.groups['💬'][0], 'group/project!1');
      assert.strictEqual(result.cards.length, 1);
    });

    it('syncState is ok when no snapshot is degraded', () => {
      const snap = makeSnapshot({ estimated: false });
      const journal = makeMockJournal();
      const registry = makeMockRegistry();
      const proj = new BoardProjection([snap], journal, registry);

      const result = proj.project();

      assert.strictEqual(result.syncState, 'ok');
    });

    it('syncState stays ok for poll-only INACTIVE snapshots (estimated is normal operation)', () => {
      const snap = makeSnapshot({ estimated: true, attention: '😴' as AttentionState });
      const journal = makeMockJournal();
      const registry = makeMockRegistry();
      const proj = new BoardProjection([snap], journal, registry);

      const result = proj.project();

      assert.strictEqual(result.syncState, 'ok');
    });

    it('syncState is degraded when an active snapshot reports a failed detail fetch', () => {
      const snap = makeSnapshot({ degraded: true, attention: '✅' as AttentionState });
      const journal = makeMockJournal();
      const registry = makeMockRegistry();
      const proj = new BoardProjection([snap], journal, registry);

      const result = proj.project();

      assert.strictEqual(result.syncState, 'degraded');
      assert.strictEqual(result.groups['✅'].length, 1);
      assert.strictEqual(result.cards.length, 1);
    });

    it('syncState is degraded when live truth refresh fails but cached cards remain visible', async () => {
      const proj = new BoardProjection(
        [makeSnapshot()],
        makeMockJournal(),
        makeMockRegistry(),
        undefined,
        async () => {
          throw new Error('live GitLab unavailable');
        }
      );

      await assert.rejects(proj.refreshFromTruth(), /VCS truth refresh failed/);

      const result = proj.project();
      assert.strictEqual(result.syncState, 'degraded');
      assert.strictEqual(result.cards.length, 1);
    });

    it('MrCard carries the canonical API contract fields', () => {
      const snap = makeSnapshot();
      const journal = makeMockJournal();
      const registry = makeMockRegistry();
      const proj = new BoardProjection([snap], journal, registry);

      const result = proj.project();
      const card = result.cards[0];

      // contract: §4 MrCard = ref, title, author, myRole, attention, counters, work
      assert.strictEqual(card.ref, 'group/project!1');
      assert.strictEqual(card.title, 'feat: first MR');
      assert.strictEqual(card.author, 'alice');
      assert.strictEqual(card.myRole, 'reviewer');
      assert.strictEqual(card.attention, '⏳');

      assert.ok(typeof card.counters === 'object' && card.counters !== null);
      assert.strictEqual(typeof card.counters.approvals, 'string');
      assert.ok(Array.isArray(card.counters.reviewers));
      assert.strictEqual(card.counters.ci, 'pending');
      assert.strictEqual(typeof card.counters.threads, 'string');
      assert.strictEqual(typeof card.counters.awaitingMe, 'number');
      assert.strictEqual(typeof card.counters.newCommits, 'number');
      assert.strictEqual(typeof card.counters.unread, 'number');

      assert.deepStrictEqual(card.work, {
        state: 'idle',
        label: 'Нет активной задачи',
        startedAt: null,
      });
    });

    it('projects a scheduled auto-review deadline from the latest commit time', () => {
      const headCommittedAt = new Date(Date.now() + 60_000).toISOString();
      const proj = new BoardProjection(
        [makeSnapshot({ headCommittedAt })],
        makeMockJournal(),
        makeMockRegistry(),
        undefined,
        undefined,
        undefined,
        { enabled: true, quietMs: 15 * 60_000 }
      );

      assert.deepStrictEqual(proj.project().cards[0]?.autoReview, {
        state: 'scheduled',
        enabled: true,
        quietMs: 15 * 60_000,
        lastCommitAt: headCommittedAt,
        dueAt: new Date(Date.parse(headCommittedAt) + 15 * 60_000).toISOString(),
      });
    });

    it('projects a frozen timer when automatic review is disabled', () => {
      const proj = new BoardProjection(
        [makeSnapshot()],
        makeMockJournal(),
        makeMockRegistry(),
        undefined,
        undefined,
        undefined,
        { enabled: false, quietMs: 15 * 60_000 }
      );

      assert.strictEqual(proj.project().cards[0]?.autoReview?.state, 'frozen');
      assert.strictEqual(proj.project().cards[0]?.autoReview?.enabled, false);
    });

    it('derives running work from the MR task journal without queue or VCS calls', () => {
      const snap = makeSnapshot();
      const journal = makeMockJournal([
        {
          seq: 1,
          ts: '2026-08-06T22:14:00Z',
          mr: 'group/project!1',
          kind: 'task_created',
          payload: { taskId: '#7', type: 'review' },
        },
        {
          seq: 2,
          ts: FIXED_TS,
          mr: 'group/project!1',
          kind: 'task_status',
          payload: { taskId: '#7', status: 'running' },
        },
      ]);
      const proj = new BoardProjection([snap], journal, makeMockRegistry());

      assert.deepStrictEqual(proj.project().cards[0]?.work, {
        state: 'running',
        label: 'review',
        taskId: '#7',
        startedAt: FIXED_TS,
      });
    });

    it('empty board produces empty groups', () => {
      const journal = makeMockJournal();
      const registry = makeMockRegistry();
      const proj = new BoardProjection([], journal, registry);

      const result = proj.project();

      for (const group of Object.values(result.groups)) {
        assert.strictEqual(group.length, 0);
      }
      assert.strictEqual(result.cards.length, 0);
      assert.strictEqual(result.syncState, 'ok');
    });

    it('board groups multiple cards into correct attention buckets', () => {
      const s1 = makeSnapshot({
        mr: makeMr({
          iid: '1',
          webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/1',
          title: 'MR1',
        }),
        attention: '⏳' as AttentionState,
      });
      const s2 = makeSnapshot({
        mr: makeMr({
          iid: '2',
          webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/2',
          title: 'MR2',
        }),
        attention: '💬' as AttentionState,
      });
      const s3 = makeSnapshot({
        mr: makeMr({
          iid: '3',
          webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/3',
          title: 'MR3',
        }),
        attention: '⏳' as AttentionState,
      });
      const journal = makeMockJournal();
      const registry = makeMockRegistry();
      const proj = new BoardProjection([s1, s2, s3], journal, registry);

      const result = proj.project();

      assert.strictEqual(result.cards.length, 3);
      assert.strictEqual(result.groups['⏳'].length, 2);
      assert.strictEqual(result.groups['💬'].length, 1);
      assert.strictEqual(result.groups['🔀'].length, 0);
      assert.strictEqual(result.groups['✅'].length, 0);
      assert.strictEqual(result.groups['😴'].length, 0);
    });

    it('degraded sync emits board_hint via SseHub to all channels', () => {
      const snap = makeSnapshot({ degraded: true, attention: '✅' as AttentionState });
      const journal = makeMockJournal();
      const registry = makeMockRegistry();

      let boardHintCalled = false;
      let boardHintTimestamp: string | undefined;
      const mockHub = {
        broadcastAll: mock.fn((frame: { type: string; timestamp: string }) => {
          if (frame.type === 'board_hint') {
            boardHintCalled = true;
            boardHintTimestamp = frame.timestamp;
          }
        }),
        subscribe: mock.fn(() => {}),
        unsubscribe: mock.fn(() => {}),
        broadcast: mock.fn(() => {}),
      } as unknown as SseHub;

      const proj = new BoardProjection([snap], journal, registry, mockHub);
      const result = proj.project();

      assert.strictEqual(result.syncState, 'degraded');
      assert.strictEqual(boardHintCalled, true);
      assert.ok(typeof boardHintTimestamp === 'string');
    });
  });
});
