// @file: Unit tests for VcsGithubMergeRequests.getChanges (updated for head.ref + Promise.all).
// @consumers: node:test runner
// @tasks: TSK-30

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VcsGithubMergeRequests } from '../../github/vcs-github-merge-requests.ts';

function makeMock(filesData: unknown, prData?: Record<string, unknown>) {
  return async (path: string) => {
    if (path.includes('/files')) return filesData;
    return prData ?? { head: { ref: 'main' } };
  };
}

describe('VcsGithubMergeRequests — getChanges', () => {
  let requestFn: ReturnType<typeof mock.fn>;
  let mr: VcsGithubMergeRequests;

  beforeEach(() => {
    requestFn = mock.fn(async () => []);
    mr = new VcsGithubMergeRequests(requestFn);
  });

  it('returns modified PR files', async () => {
    requestFn.mock.mockImplementation(
      makeMock([{ filename: 'src/foo.ts', status: 'modified', additions: 3, deletions: 1 }], {
        head: { ref: 'feature/x' },
      })
    );
    const result = await mr.getChanges({ repository: 'owner/repo', iid: 99 });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].path, 'src/foo.ts');
    assert.strictEqual(result[0].status, 'modified');
    assert.strictEqual(result[0].ref, 'feature/x');
    assert.strictEqual(result[0].additions, 3);
    assert.strictEqual(result[0].deletions, 1);
  });

  it('returns added file', async () => {
    requestFn.mock.mockImplementation(makeMock([{ filename: 'src/new.ts', status: 'added' }]));
    const result = await mr.getChanges({ repository: 'o/r', iid: 1 });
    assert.strictEqual(result[0].path, 'src/new.ts');
    assert.strictEqual(result[0].status, 'added');
  });

  it('returns deleted file', async () => {
    requestFn.mock.mockImplementation(makeMock([{ filename: 'src/old.ts', status: 'removed' }]));
    const result = await mr.getChanges({ repository: 'o/r', iid: 1 });
    assert.strictEqual(result[0].path, 'src/old.ts');
    assert.strictEqual(result[0].status, 'deleted');
  });

  it('returns renamed file', async () => {
    requestFn.mock.mockImplementation(
      makeMock([{ filename: 'src/new.ts', previous_filename: 'src/old.ts', status: 'renamed' }])
    );
    const result = await mr.getChanges({ repository: 'o/r', iid: 1 });
    assert.strictEqual(result[0].path, 'src/new.ts');
    assert.strictEqual(result[0].status, 'renamed');
    assert.strictEqual(result[0].previousPath, 'src/old.ts');
  });

  it('returns empty array for empty PR', async () => {
    requestFn.mock.mockImplementation(makeMock([]));
    const result = await mr.getChanges({ repository: 'o/r', iid: 1 });
    assert.strictEqual(result.length, 0);
  });

  it('ignores extra API fields', async () => {
    requestFn.mock.mockImplementation(
      makeMock([
        { filename: 'src/x.ts', status: 'modified', patch: '@@ -1 +1 @@', blob_url: 'https://...' },
      ])
    );
    const result = await mr.getChanges({ repository: 'o/r', iid: 1 });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].path, 'src/x.ts');
  });

  it('passes pagination params', async () => {
    requestFn.mock.mockImplementation(makeMock([]));
    await mr.getChanges({ repository: 'o/r', iid: 1, page: 3, perPage: 50 });
    const calls = requestFn.mock.calls.map((c) => c.arguments[0] as string);
    const filesCall = calls.find((c) => c.includes('/files'));
    assert.ok(filesCall?.includes('page=3'));
    assert.ok(filesCall?.includes('per_page=50'));
  });

  it('throws on 500 error', async () => {
    requestFn.mock.mockImplementation(async () => {
      throw new Error('GitHub request failed: 500 Internal Server Error');
    });
    await assert.rejects(
      () => mr.getChanges({ repository: 'o/r', iid: 1 }),
      /GitHub request failed/
    );
  });

  it('throws on 403 error', async () => {
    requestFn.mock.mockImplementation(async () => {
      throw new Error('GitHub request failed: 403 Forbidden');
    });
    await assert.rejects(() => mr.getChanges({ repository: 'o/r', iid: 1 }), /403/);
  });
});
