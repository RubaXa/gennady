// @file: seed tests — integration coverage for deterministic persisted inbox fixtures.
// @consumers: node:test runner
// @tasks: TSK-162, TSK-166

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import type { SyncSnapshot } from '../../modules/inbox-vcs/sync.ts';
import { EventJournal } from '../../modules/inbox-core/event-journal.ts';
import { makeTestTmpDir, cleanupTestTmp } from '../../modules/inbox-core/test-support/test-tmp.ts';
import { HttpServer } from '../../modules/inbox-api/http-server.ts';
import { BoardProviderMock } from '../../modules/inbox-api/board-provider.mock.ts';
import { InboxRegistryAccess } from '../../modules/inbox-core/inbox-registry.ts';
import { setupMockAgent } from '#utils/test/mock-http.ts';
import { createMrCard, feedWidgetFactories } from '../dto-factories.ts';
import { loadSeededSnapshots, seedMr } from '../seed.ts';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) cleanupTestTmp(directory);
});

function createSnapshot(): SyncSnapshot {
  return {
    mr: {
      iid: '42',
      project: 'group/project',
      webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/42',
      title: 'Seeded MR',
      description: '',
      author: 'author',
      reviewers: ['reviewer'],
      approvedBy: [],
      updatedAt: '2026-08-07T00:00:00.000Z',
      draft: false,
      state: 'opened',
      role: 'author',
      events: [],
      directlyAddressed: false,
      todoIds: [],
      headSha: 'head-42',
      approvalsRequired: 1,
    },
    role: 'author',
    attention: '💬',
    stage: 'reply_needed',
    approvals: { n: 0, m: 1, approvedBy: [] },
    reviewers: ['reviewer'],
    ci: { status: 'success' },
    threads: { open: 1, total: 1, awaitingMe: 1 },
    headSha: 'head-42',
    lastReviewedHeadSha: 'head-42',
    updatedAt: '2026-08-07T00:00:00.000Z',
    estimated: false,
  };
}

describe('seedMr', () => {
  it('seed puts MR into any state without gitlab', async () => {
    const stateDir = makeTestTmpDir('tsk-166-seed-');
    directories.push(stateDir);
    const seeded = await seedMr({
      stateDir,
      ref: 'group/project!42',
      events: [
        {
          kind: 'task_created',
          actor: 'queue',
          payload: { taskId: '#42', type: 'review' },
          ts: '2026-08-07T00:00:00.000Z',
        },
        {
          kind: 'task_status',
          actor: 'queue',
          payload: { taskId: '#42', status: 'running' },
          ts: '2026-08-07T00:01:00.000Z',
        },
      ],
      sync: createSnapshot(),
    });
    assert.ok(existsSync(seeded.eventsPath));
    assert.deepStrictEqual(
      new EventJournal(seeded.eventsPath).read().map((event) => event.kind),
      ['task_created', 'task_status']
    );
    assert.deepStrictEqual(loadSeededSnapshots(stateDir), seeded.snapshots);
    const network = setupMockAgent({ allowNetConnect: /127.0.0.1/ });
    const server = new HttpServer({
      port: 0,
      boardProvider: new BoardProviderMock(),
      inboxApi: {
        queue: {} as never,
        decisionJournal: {} as never,
        journal: new EventJournal(seeded.eventsPath),
        registry: new InboxRegistryAccess(stateDir),
        snapshots: loadSeededSnapshots(stateDir),
      },
    });
    await server.start();
    try {
      const port = server.listeningPort() ?? assert.fail('Expected kernel-assigned port');
      const response = await fetch('http://127.0.0.1:' + port + '/api/board');
      const board = (await response.json()) as {
        groups: Record<
          string,
          Array<{
            ref: string;
            author: string;
            myRole: string | null;
            work: { state: string; taskId?: string; startedAt: string | null };
          }>
        >;
      };
      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(board.groups['💬'], ['group/project!42']);
      assert.deepStrictEqual((board as { cards: unknown[] }).cards[0], {
        ref: 'group/project!42',
        title: 'Seeded MR',
        description: '',
        webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/42',
        author: 'author',
        myRole: 'author',
        attention: '💬',
        counters: {
          approvals: '0/1',
          reviewers: [{ user: 'reviewer', voted: false }],
          ci: 'success',
          threads: '1/1',
          awaitingMe: 1,
          newCommits: 0,
          unread: 0,
        },
        work: {
          state: 'running',
          label: 'review',
          taskId: '#42',
          startedAt: '2026-08-07T00:01:00.000Z',
        },
      });
    } finally {
      await server.stop();
      network.cleanup();
    }
  });

  it('dto factories cover all widget types', () => {
    const widgets = Object.values(feedWidgetFactories).map((factory) => factory());
    assert.deepStrictEqual(widgets.map((widget) => widget.type).sort(), [
      'action',
      'artifact',
      'findings',
      'gitlab',
      'plan',
      'progress',
      'threads',
    ]);
    assert.deepStrictEqual(createMrCard(), {
      ref: 'group/project!42',
      title: 'feat: deterministic dashboard fixture',
      description: 'Deterministic fixture description for the MR header.',
      webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/42',
      author: 'author',
      myRole: 'reviewer',
      attention: '💬',
      counters: {
        approvals: '1/2',
        reviewers: [{ user: 'reviewer', voted: true }],
        ci: 'success',
        threads: '1/1',
        awaitingMe: 1,
        newCommits: 0,
        unread: 0,
      },
      work: { state: 'idle', label: 'Нет активной задачи', startedAt: null },
    });
  });
});
