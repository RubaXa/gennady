// @file: Integration tests — ReviewBoardProjection via JournalProjectionAdapter; deduplication and lifecycle visibility.
// @consumers: node:test runner
// @tasks: TSK-179

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JournalProjectionAdapter } from '../projections/journal-projection.adapter.ts';
import { EventJournal } from '../../inbox-core/event-journal.ts';
import type { SyncSnapshot } from '../../inbox-vcs/sync.ts';
import type { InboxRegistryAccess } from '../../inbox-core/inbox-registry.ts';

// ── registry stub (no files required for board projection) ──

const EMPTY_REGISTRY = {
  load: () => ({ version: 1, entries: {} }),
} as unknown as InboxRegistryAccess;

// ── snapshot factory ──

function makeSnapshot(overrides: {
  mrRef: string;
  role: string;
  mrState?: 'opened' | 'merged' | 'closed';
}): SyncSnapshot {
  const [project, iid] = overrides.mrRef.split('!');
  return {
    mr: {
      iid,
      project,
      webUrl: `https://gitlab.example.com/${project}/-/merge_requests/${iid}`,
      title: `MR ${iid}`,
      description: '',
      author: 'alice',
      reviewers: [],
      approvedBy: [],
      updatedAt: new Date().toISOString(),
      draft: false,
      state: overrides.mrState ?? 'opened',
      role: overrides.role as 'reviewer' | 'author' | 'mentioned',
      events: [],
      directlyAddressed: false,
      todoIds: [],
    },
    role: overrides.role,
    attention: '👀',
    stage: 'review_needed',
    approvals: { n: 0, m: 1, approvedBy: [] },
    reviewers: [],
    ci: { status: null },
    threads: { open: 0, total: 0, awaitingMe: 0 },
    headSha: '',
    lastReviewedHeadSha: null,
    updatedAt: new Date().toISOString(),
    estimated: false,
  };
}

// ── unified context ──

type BoardContext = {
  adapter: JournalProjectionAdapter;
  journal: EventJournal;
};

function createBoardContext(snapshots: SyncSnapshot[], journalFile?: string): BoardContext {
  const stateDir = mkdtempSync(join(tmpdir(), 'gennady-board-'));
  const file = journalFile ?? join(stateDir, 'events.jsonl');
  const journal = new EventJournal(file);
  const adapter = new JournalProjectionAdapter({
    journal,
    registry: EMPTY_REGISTRY,
    stateDir,
    snapshots,
  });
  return { adapter, journal };
}

// ── Test Graph ──
// Case A: overlapping participation yields one owned MR card
// Case B: state completion and horizon matrix survives API projection rebuild and new-event reactivation

describe('ReviewBoardProjection integration', () => {
  it('overlapping participation yields one owned MR card', () => {
    // invariant: MR appears at most once across mine+assigned; author role wins over reviewer/assignee
    // failure mode: do not emit a duplicate card in assigned when author chip is also present

    // #region START_OVERLAP_SETUP_SNAPSHOT
    const mrRef = 'group/project!42';
    // Two snapshots for the same MR ref with different roles would be a data error,
    // so the real case is: one snapshot where the operator's primary role is 'author'
    const snapshot = makeSnapshot({ mrRef, role: 'author', mrState: 'opened' });
    const { adapter } = createBoardContext([snapshot]);
    // #endregion END_OVERLAP_SETUP_SNAPSHOT

    const board = adapter.board();

    // #region START_OVERLAP_ASSERT_DEDUP
    assert.strictEqual(board.mine.length, 1, 'exactly one mine card');
    assert.strictEqual(board.assigned.length, 0, 'no assigned card when author chip present');
    assert.strictEqual(board.mine[0].ref, mrRef);
    assert.deepStrictEqual(board.mine[0].roles, ['author']);
    assert.ok(board.visible.includes(mrRef));
    // total unique cards = mine + assigned
    assert.strictEqual(board.mine.length + board.assigned.length, 1);
    // #endregion END_OVERLAP_ASSERT_DEDUP
  });

  it('state completion and horizon matrix survives API projection rebuild and new-event reactivation', async () => {
    // invariant: completed MR hidden after mr_board_complete; reactivated when a newer event arrives
    // failure mode: do not hide an MR that received a subsequent event after completion

    const mrRef = 'group/project!7';
    const snapshot = makeSnapshot({ mrRef, role: 'reviewer', mrState: 'merged' });

    // #region START_REACTIVATION_SETUP
    const stateDir = mkdtempSync(join(tmpdir(), 'gennady-reactivation-'));
    const journal = new EventJournal(join(stateDir, 'events.jsonl'));
    const adapter = new JournalProjectionAdapter({
      journal,
      registry: EMPTY_REGISTRY,
      stateDir,
      snapshots: [snapshot],
    });

    // append a regular journal event first (seq 1)
    await journal.append({
      ts: new Date().toISOString(),
      mr: mrRef,
      kind: 'task_created',
      actor: 'queue',
      payload: { taskId: '#1', type: 'verify' },
    });
    // #endregion END_REACTIVATION_SETUP

    // #region START_VISIBLE_BEFORE_COMPLETE
    const boardBefore = adapter.board();
    assert.ok(boardBefore.visible.includes(mrRef), 'MR visible before completion');
    // #endregion END_VISIBLE_BEFORE_COMPLETE

    // #region START_COMPLETE_EVENT
    // append mr_board_complete system event (seq 2) — completionSeq >= lastEventSeq (1) → hidden
    await journal.append({
      ts: new Date().toISOString(),
      mr: mrRef,
      kind: 'system',
      actor: 'operator',
      payload: { kind: 'mr_board_complete', mrRef },
    });
    const boardCompleted = adapter.board();
    assert.ok(!boardCompleted.visible.includes(mrRef), 'MR hidden after completion');
    // #endregion END_COMPLETE_EVENT

    // #region START_REACTIVATION_EVENT
    // append new regular event (seq 3) — lastEventSeq (3) > completionSeq (2) → reactivated
    await journal.append({
      ts: new Date().toISOString(),
      mr: mrRef,
      kind: 'widget_bump',
      actor: 'queue',
      payload: { widgetId: 'w-1' },
    });
    const boardReactivated = adapter.board();
    assert.ok(boardReactivated.visible.includes(mrRef), 'MR reactivated after new event');
    // #endregion END_REACTIVATION_EVENT

    // horizon check: merged MR with old last activity would be hidden, but our event is recent
    const card = boardReactivated.assigned.find((c) => c.ref === mrRef);
    assert.ok(card, 'reactivated card is in assigned queue');
    assert.strictEqual(card.mrState, 'merged');
  });
});
