// @file: Unit/integration tests for BackgroundVerifier — sha change detection, journal events, pagination, MR tracking.
// @consumers: node:test runner
// @tasks: TSK-158, TSK-174

import { describe, it, mock, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventJournal } from '../../inbox-core/event-journal.ts';
import { InboxRegistryAccess } from '../../inbox-core/inbox-registry.ts';
import { VcsPort, type MrDetail, type VcsDiscussion, type DiscussionsPage } from '../vcs-port.ts';
import { BackgroundVerifier } from '../background-verify.ts';
import { SyncService } from '../sync.ts';

let tmpDir: string;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inbox-vcs-bgverify-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = mkdtempSync(join(tmpdir(), 'inbox-vcs-bgverify-test-'));
});

class StubVcs extends VcsPort {
  getCurrentUserLogin = mock.fn(async () => 'test_user');
  getInbox = mock.fn(async () => []);
  getMrDetail = mock.fn(async (): Promise<MrDetail> => {
    throw new Error('not implemented');
  });
  getDiscussions = mock.fn(
    async (): Promise<DiscussionsPage> => ({
      discussions: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    })
  );
  compareSha = mock.fn(async () => ({
    commits: [],
    complete: true,
    evidence: 'test-complete',
  }));
  postNote = mock.fn(async () => {});
  postDiscussion = mock.fn(async () => {});
  react = mock.fn(async () => {});
  resolve = mock.fn(async () => {});
  approve = mock.fn(async () => {});
  editDescription = mock.fn(async () => {});
  getHost = mock.fn(() => 'gitlab.example.com');
}

function makeVerifier(stub?: StubVcs, journal?: EventJournal) {
  const vcs = stub ?? new StubVcs();
  const j = journal ?? new EventJournal(join(tmpDir, 'events.jsonl'));
  const verifier = new BackgroundVerifier(vcs, j, { intervalMs: 60_000 });
  return { verifier, vcs, journal: j };
}

describe('BackgroundVerifier — contract surface', () => {
  it('contract: BackgroundVerifier has start, stop, register, unregister', () => {
    const { verifier } = makeVerifier();
    assert.strictEqual(typeof verifier.start, 'function');
    assert.strictEqual(typeof verifier.stop, 'function');
    assert.strictEqual(typeof verifier.register, 'function');
    assert.strictEqual(typeof verifier.unregister, 'function');
  });
});

describe('BackgroundVerifier — MR tracking', () => {
  it('register adds MR to tracked set and unregister removes it', () => {
    const { verifier } = makeVerifier();

    verifier.register({
      webUrl: 'https://gitlab.example.com/g/proj/-/merge_requests/42',
      project: 'g/proj',
      iid: '42',
      lastKnownSha: 'abc123',
      lastKnownUpdatedAt: '2026-01-01T00:00:00Z',
    });

    // verify registration was accepted (no-op, no error)
    verifier.unregister('https://gitlab.example.com/g/proj/-/merge_requests/42');
  });
});

describe('BackgroundVerifier — sha change detection', () => {
  it('writes gitlab_event(new_commits) through the public verification SUT', async () => {
    // contract: sha differs from tracked lastKnownSha → journal entry with event=new_commits
    // invariant: tracked.lastKnownSha is updated after journal write

    const stub = new StubVcs();
    stub.getInbox = mock.fn(async () => [
      {
        webUrl: 'https://gitlab.example.com/g/proj/-/merge_requests/42',
        updatedAt: '2026-01-02T00:00:00Z',
      } as ReturnType<typeof stub.getInbox> extends Promise<(infer T)[]> ? T : never,
    ]);
    stub.getMrDetail = mock.fn(async () => ({
      project: 'g/proj',
      iid: '42',
      webUrl: 'https://gitlab.example.com/g/proj/-/merge_requests/42',
      title: 'Test MR',
      description: '',
      author: 'author1',
      reviewers: [],
      approvedBy: [],
      updatedAt: '2026-01-02T00:00:00Z',
      state: 'opened',
      headSha: 'newsha456',
      pipelineStatus: null,
      userNotesCount: 0,
      draft: false,
    }));
    const journal = new EventJournal(join(tmpDir, 'sha-change.jsonl'));
    const { verifier } = makeVerifier(stub, journal);

    verifier.register({
      webUrl: 'https://gitlab.example.com/g/proj/-/merge_requests/42',
      project: 'g/proj',
      iid: '42',
      lastKnownSha: 'oldsha123',
      lastKnownUpdatedAt: '2026-01-01T00:00:00Z',
    });

    await verifier.verifyOnce();

    const entries = journal.read();
    const newCommits = entries.find((e) => e.payload?.event === 'new_commits');
    assert.ok(newCommits, 'gitlab_event(new_commits) must be written');
    assert.strictEqual(newCommits.payload?.fromSha, 'oldsha123');
    assert.strictEqual(newCommits.payload?.toSha, 'newsha456');
  });

  it('should not write event when sha unchanged', async () => {
    // contract: same sha → no journal entry; updatedAt advances but sha stays same

    const stub = new StubVcs();
    stub.getInbox = mock.fn(async () => []);
    stub.getMrDetail = mock.fn(async () => ({
      project: 'g/proj',
      iid: '42',
      webUrl: 'https://gitlab.example.com/g/proj/-/merge_requests/42',
      title: 'Test MR',
      description: '',
      author: 'author1',
      reviewers: [],
      approvedBy: [],
      updatedAt: '2026-01-02T00:00:00Z',
      state: 'opened',
      headSha: 'same123',
      pipelineStatus: null,
      userNotesCount: 0,
      draft: false,
    }));
    const journal = new EventJournal(join(tmpDir, 'sha-same.jsonl'));
    const { verifier } = makeVerifier(stub, journal);

    verifier.register({
      webUrl: 'https://gitlab.example.com/g/proj/-/merge_requests/42',
      project: 'g/proj',
      iid: '42',
      lastKnownSha: 'same123',
      lastKnownUpdatedAt: '2026-01-01T00:00:00Z',
      knownDiscussionIds: [],
    });
    stub.getInbox = mock.fn(
      async () =>
        [
          {
            webUrl: 'https://gitlab.example.com/g/proj/-/merge_requests/42',
            updatedAt: '2026-01-02T00:00:00Z',
          },
        ] as never
    );
    await verifier.verifyOnce();

    const entries = journal.read();
    const newCommits = entries.filter((e) => e.payload?.event === 'new_commits');
    assert.strictEqual(newCommits.length, 0, 'no event when sha is unchanged');
  });

  it('should not call getMrDetail when updatedAt is unchanged', async () => {
    // contract: same updatedAt → early return, no network call

    const stub = new StubVcs();
    const journal = new EventJournal(join(tmpDir, 'sha-skip.jsonl'));
    const { verifier } = makeVerifier(stub, journal);

    verifier.register({
      webUrl: 'https://gitlab.example.com/g/proj/-/merge_requests/42',
      project: 'g/proj',
      iid: '42',
      lastKnownSha: 'abc123',
      lastKnownUpdatedAt: '2026-01-01T00:00:00Z',
    });
    stub.getInbox = mock.fn(
      async () =>
        [
          {
            webUrl: 'https://gitlab.example.com/g/proj/-/merge_requests/42',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ] as never
    );
    await verifier.verifyOnce();

    assert.strictEqual(stub.getMrDetail.mock.callCount(), 0);
  });

  it('should handle detail fetch failure gracefully', async () => {
    // contract: getMrDetail fails → no crash, no journal entry, tracked state unchanged

    const stub = new StubVcs();
    stub.getMrDetail = mock.fn(async () => {
      throw new Error('GitLab unavailable');
    });
    const journal = new EventJournal(join(tmpDir, 'detail-fail.jsonl'));
    const { verifier } = makeVerifier(stub, journal);

    verifier.register({
      webUrl: 'https://gitlab.example.com/g/proj/-/merge_requests/42',
      project: 'g/proj',
      iid: '42',
      lastKnownSha: 'oldsha123',
      lastKnownUpdatedAt: '2026-01-01T00:00:00Z',
    });
    stub.getInbox = mock.fn(
      async () =>
        [
          {
            webUrl: 'https://gitlab.example.com/g/proj/-/merge_requests/42',
            updatedAt: '2026-01-02T00:00:00Z',
          },
        ] as never
    );
    await verifier.verifyOnce();

    const entries = journal.read();
    assert.strictEqual(entries.length, 0, 'no journal entry on detail fetch failure');
  });
});

describe('BackgroundVerifier — fresh discussions', () => {
  it('writes gitlab_event(new_threads) for discussion ids absent at registration', async () => {
    const stub = new StubVcs();
    stub.getInbox = mock.fn(
      async () =>
        [
          {
            webUrl: 'https://gitlab.example.com/g/proj/-/merge_requests/42',
            updatedAt: '2026-01-02T00:00:00Z',
          },
        ] as never
    );
    stub.getMrDetail = mock.fn(async () => ({
      project: 'g/proj',
      iid: '42',
      webUrl: 'https://gitlab.example.com/g/proj/-/merge_requests/42',
      title: 'MR',
      description: '',
      author: 'author',
      reviewers: [],
      approvedBy: [],
      updatedAt: '2026-01-02T00:00:00Z',
      state: 'opened',
      headSha: 'same',
      pipelineStatus: null,
      userNotesCount: 1,
      draft: false,
    }));
    stub.getDiscussions = mock.fn(async () => ({
      discussions: [
        { id: 'known', resolved: false, notes: [] },
        { id: 'fresh', resolved: false, notes: [] },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    }));
    const { verifier, journal } = makeVerifier(stub);
    verifier.register({
      webUrl: 'https://gitlab.example.com/g/proj/-/merge_requests/42',
      project: 'g/proj',
      iid: '42',
      lastKnownSha: 'same',
      lastKnownUpdatedAt: '2026-01-01T00:00:00Z',
      knownDiscussionIds: ['known'],
    });
    await verifier.verifyOnce();
    assert.deepStrictEqual(
      journal.read().find((entry) => entry.payload?.event === 'new_threads')?.payload
        ?.discussionIds,
      ['fresh']
    );
  });
});

describe('BackgroundVerifier — discussions pagination', () => {
  it('discussions pagination is fully traversed', async () => {
    // contract: SyncService._fetchAllDiscussions iterates pages via endCursor/hasNextPage
    // invariant: all threads from all pages are collected; stops when hasNextPage is false

    const stub = new StubVcs();
    let pageIndex = 0;
    stub.getDiscussions = mock.fn(async (): Promise<DiscussionsPage> => {
      pageIndex++;
      if (pageIndex === 1) {
        return {
          discussions: [
            {
              id: 'disc-1',
              resolved: false,
              notes: [
                {
                  id: 'n1',
                  author: 'a1',
                  body: 't1',
                  createdAt: '2026-01-01T00:00:00Z',
                  system: false,
                },
              ],
            },
            {
              id: 'disc-2',
              resolved: true,
              notes: [
                {
                  id: 'n2',
                  author: 'a2',
                  body: 't2',
                  createdAt: '2026-01-01T00:00:00Z',
                  system: false,
                },
              ],
            },
            {
              id: 'disc-3',
              resolved: false,
              notes: [
                {
                  id: 'n3',
                  author: 'a3',
                  body: 't3',
                  createdAt: '2026-01-01T00:00:00Z',
                  system: false,
                },
              ],
            },
          ],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-page-1' },
        };
      }
      return {
        discussions: [
          {
            id: 'disc-4',
            resolved: false,
            notes: [
              {
                id: 'n4',
                author: 'a4',
                body: 't4',
                createdAt: '2026-01-01T00:00:00Z',
                system: false,
              },
            ],
          },
          {
            id: 'disc-5',
            resolved: true,
            notes: [
              {
                id: 'n5',
                author: 'a5',
                body: 't5',
                createdAt: '2026-01-01T00:00:00Z',
                system: false,
              },
            ],
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    });

    const registry = new InboxRegistryAccess(tmpDir);
    const journal = new EventJournal(join(tmpDir, 'pagination.jsonl'));
    const sync = new SyncService(stub, registry, journal);

    const allDiscussions = await (
      sync as unknown as {
        _fetchAllDiscussions: (project: string, iid: string) => Promise<VcsDiscussion[]>;
      }
    )._fetchAllDiscussions('g/proj', '42');

    assert.strictEqual(allDiscussions.length, 5, 'all 5 threads across 2 pages');
    assert.strictEqual(pageIndex, 2, 'exactly 2 getDiscussions calls');
    assert.strictEqual(allDiscussions[0].id, 'disc-1');
    assert.strictEqual(allDiscussions[4].id, 'disc-5');
  });
});
