// @file: Unit tests for inbox-core VcsInboxMock — seeded data, determinism, default context fallback.
// @consumers: node:test runner
// @tasks: TSK-110

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VcsInboxMock } from '../vcs-inbox.mock.ts';
import type { MrContext, Discussion, DiscussionNote } from '../vcs-inbox.port.ts';
import type { VcsActionableMr } from '../../../../vcs-client/entities/vcs-actionable-mr.type.ts';

// ── helpers ──

function makeMr(over?: Partial<VcsActionableMr>): VcsActionableMr {
  return {
    iid: '42',
    project: 'group/project',
    webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/42',
    title: 'Test MR',
    description: 'Test description',
    author: 'test-author',
    reviewers: ['reviewer1'],
    approvedBy: [],
    updatedAt: '2026-01-01T00:00:00Z',
    draft: false,
    state: 'opened',
    role: 'reviewer',
    events: [],
    directlyAddressed: false,
    todoIds: [],
    ...over,
  };
}

function makeContext(over?: Partial<MrContext>): MrContext {
  return {
    project: 'group/project',
    iid: '42',
    webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/42',
    title: 'Test MR',
    sourceBranch: 'feature/test',
    targetBranch: 'master',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    author: 'test-author',
    reviewers: ['reviewer1'],
    approvedBy: [],
    description: 'Test description',
    myRole: 'reviewer',
    ...over,
  };
}

function makeNote(over?: Partial<DiscussionNote>): DiscussionNote {
  return {
    id: '1',
    author: 'Test Author',
    username: 'test-author',
    body: 'Test note body',
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function makeDiscussion(over?: Partial<Discussion>): Discussion {
  return {
    id: 'disc-1',
    shortId: 'disc-1'.slice(0, 8),
    author: 'Test Author',
    body: 'Test discussion',
    resolved: null,
    notes: [makeNote()],
    ...over,
  };
}

// ── tests ──

describe('VcsInboxMock — seeded data', () => {
  it('GIVEN seed([mr1, mr2]) WHEN getActionable() THEN returns [mr1, mr2]', async () => {
    const mock = new VcsInboxMock();
    const mr1 = makeMr({ iid: '1', webUrl: 'https://gitlab.example.com/g/p/-/merge_requests/1' });
    const mr2 = makeMr({ iid: '2', webUrl: 'https://gitlab.example.com/g/p/-/merge_requests/2' });

    mock.seed([mr1, mr2]);

    const result = await mock.getActionable();
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].iid, '1');
    assert.strictEqual(result[1].iid, '2');
  });

  it('GIVEN empty seed() WHEN getActionable() THEN returns []', async () => {
    const mock = new VcsInboxMock();
    mock.seed([]);

    const result = await mock.getActionable();
    assert.strictEqual(result.length, 0);
  });

  it('GIVEN no seed WHEN getActionable() THEN returns [] (default empty)', async () => {
    const mock = new VcsInboxMock();

    const result = await mock.getActionable();
    assert.strictEqual(result.length, 0);
  });

  it('GIVEN seeded contexts WHEN getMrContext(url) THEN returns correct context', async () => {
    const mock = new VcsInboxMock();
    const url = 'https://gitlab.example.com/g/p/-/merge_requests/1';
    const ctx = makeContext({ iid: '1', webUrl: url });

    mock.seed([], { [url]: ctx });

    const result = await mock.getMrContext(url);
    assert.strictEqual(result.iid, '1');
    assert.strictEqual(result.webUrl, url);
    assert.strictEqual(result.project, 'group/project');
  });

  it('GIVEN unknown URL (not seeded) WHEN getMrContext(url) THEN returns synthetic default context', async () => {
    const mock = new VcsInboxMock();
    const url = 'https://gitlab.example.com/unknown/proj/-/merge_requests/99';

    const result = await mock.getMrContext(url);
    assert.strictEqual(result.iid, '99');
    assert.strictEqual(result.webUrl, url);
    assert.strictEqual(result.project, 'unknown/proj');
    assert.strictEqual(result.title, 'Mock MR 99');
    assert.strictEqual(result.author, 'mock-user');
    assert.strictEqual(result.myRole, 'reviewer');
  });

  it('GIVEN URL without standard MR path WHEN getMrContext THEN uses defaults (project="unknown/project", iid="0")', async () => {
    const mock = new VcsInboxMock();
    const url = 'https://example.com/not-an-mr';

    const result = await mock.getMrContext(url);
    assert.strictEqual(result.iid, '0');
    assert.strictEqual(result.project, 'unknown/project');
  });

  it('GIVEN seeded discussions WHEN getDiscussions(url) THEN returns correct discussions', async () => {
    const mock = new VcsInboxMock();
    const url = 'https://gitlab.example.com/g/p/-/merge_requests/1';
    const disc1 = makeDiscussion({ id: 'd1', body: 'First discussion' });
    const disc2 = makeDiscussion({ id: 'd2', body: 'Second discussion' });

    mock.seed([], {}, { [url]: [disc1, disc2] });

    const result = await mock.getDiscussions(url);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].id, 'd1');
    assert.strictEqual(result[1].id, 'd2');
  });

  it('GIVEN unknown URL WHEN getDiscussions THEN returns empty array', async () => {
    const mock = new VcsInboxMock();
    const url = 'https://gitlab.example.com/g/p/-/merge_requests/99';

    const result = await mock.getDiscussions(url);
    assert.strictEqual(result.length, 0);
  });
});

describe('VcsInboxMock — determinism', () => {
  it('seed() replaces previously seeded data', async () => {
    const mock = new VcsInboxMock();
    const mr1 = makeMr({ iid: '1' });
    const mr2 = makeMr({ iid: '2' });

    mock.seed([mr1]);
    mock.seed([mr2]);

    const result = await mock.getActionable();
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].iid, '2');
  });

  it('getActionable returns a copy (not reference to internal storage)', async () => {
    const mock = new VcsInboxMock();
    const mr1 = makeMr({ iid: '1' });
    mock.seed([mr1]);

    const result1 = await mock.getActionable();
    result1[0] = makeMr({ iid: 'mutated' });

    const result2 = await mock.getActionable();
    assert.strictEqual(result2[0].iid, '1');
  });
});

describe('VcsInboxMock — AI-22 error codes', () => {
  it('Mock never throws — always returns data or empty/fallback', async () => {
    const mock = new VcsInboxMock();

    // All methods should resolve without throwing
    const a = mock.getActionable();
    const b = mock.getMrContext('https://example.com/x');
    const c = mock.getDiscussions('https://example.com/x');

    await Promise.all([a, b, c]);
    // If we got here without throw → pass
    assert.ok(true);
  });

  it('getMrContext with malformed URLs does not throw', async () => {
    const mock = new VcsInboxMock();

    const urls = ['', 'not-a-url', 'http://', 'https://gitlab.example.com/project'];

    const results = await Promise.all(urls.map((u) => mock.getMrContext(u)));
    assert.strictEqual(results.length, 4);
    results.forEach((r) => {
      assert.strictEqual(typeof r.project, 'string');
      assert.strictEqual(typeof r.iid, 'string');
    });
  });
});

describe('VcsInboxMock — BDD scenarios from task ticket', () => {
  it('GIVEN VcsInboxMock.seed([mr1, mr2]) WHEN getActionable() THEN [mr1, mr2]', async () => {
    const mock = new VcsInboxMock();
    const mr1 = makeMr({ iid: '1' });
    const mr2 = makeMr({ iid: '2' });

    mock.seed([mr1, mr2]);

    const result = await mock.getActionable();
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], mr1);
    assert.deepStrictEqual(result[1], mr2);
  });
});
