// @file: Unit tests for VcsGitlabMergeRequests.getChanges.
// @consumers: node:test runner
// @tasks: TSK-29

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VcsGitlabMergeRequests } from '../../gitlab/vcs-gitlab-merge-requests.ts';
import type { VcsMergeRequestChanges } from '../../entities/vcs-merge-request-changes.type.ts';

describe('VcsGitlabMergeRequests — getChanges', () => {
  let requestFn: ReturnType<typeof mock.fn>;
  let mr: VcsGitlabMergeRequests;

  beforeEach(() => {
    requestFn = mock.fn(async () => ({}));
    mr = new VcsGitlabMergeRequests(requestFn);
  });

  it('returns modified files list', async () => {
    requestFn.mock.mockImplementationOnce(async () => ({
      changes: [
        {
          old_path: 'src/foo.ts',
          new_path: 'src/foo.ts',
          new_file: false,
          renamed_file: false,
          deleted_file: false,
        },
      ],
      sha: 'abc123',
    }));

    const result = await mr.getChanges({ repository: 'group/proj', iid: 1 });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].path, 'src/foo.ts');
    assert.strictEqual(result[0].status, 'modified');
    assert.strictEqual(result[0].ref, 'abc123');
  });

  it('returns added file', async () => {
    requestFn.mock.mockImplementationOnce(async () => ({
      changes: [
        {
          new_path: 'src/new.ts',
          new_file: true,
          deleted_file: false,
          renamed_file: false,
        },
      ],
      sha: 'def456',
    }));

    const result = await mr.getChanges({ repository: 'g/p', iid: 1 });
    assert.strictEqual(result[0].path, 'src/new.ts');
    assert.strictEqual(result[0].status, 'added');
  });

  it('returns deleted file', async () => {
    requestFn.mock.mockImplementationOnce(async () => ({
      changes: [
        {
          old_path: 'src/old.ts',
          new_file: false,
          deleted_file: true,
          renamed_file: false,
        },
      ],
      sha: 'ghi789',
    }));

    const result = await mr.getChanges({ repository: 'g/p', iid: 1 });
    assert.strictEqual(result[0].path, 'src/old.ts');
    assert.strictEqual(result[0].status, 'deleted');
  });

  it('returns renamed file', async () => {
    requestFn.mock.mockImplementationOnce(async () => ({
      changes: [
        {
          old_path: 'src/old.ts',
          new_path: 'src/new.ts',
          new_file: false,
          deleted_file: false,
          renamed_file: true,
        },
      ],
      sha: 'jkl012',
    }));

    const result = await mr.getChanges({ repository: 'g/p', iid: 1 });
    assert.strictEqual(result[0].path, 'src/new.ts');
    assert.strictEqual(result[0].status, 'renamed');
    assert.strictEqual(result[0].previousPath, 'src/old.ts');
  });

  it('maps additions/deletions', async () => {
    requestFn.mock.mockImplementationOnce(async () => ({
      changes: [
        {
          old_path: 'src/bar.ts',
          new_path: 'src/bar.ts',
          new_file: false,
          renamed_file: false,
          deleted_file: false,
          additions: 10,
          deletions: 3,
        },
      ],
      source_branch: 'feat',
    }));

    const result = await mr.getChanges({ repository: 'g/p', iid: 1 });
    assert.strictEqual(result[0].additions, 10);
    assert.strictEqual(result[0].deletions, 3);
  });

  it('returns empty array for empty changes', async () => {
    requestFn.mock.mockImplementationOnce(async () => ({
      changes: [],
      sha: 'pqr678',
    }));

    const result = await mr.getChanges({ repository: 'g/p', iid: 1 });
    assert.strictEqual(result.length, 0);
  });

  it('ignores extra API fields', async () => {
    requestFn.mock.mockImplementationOnce(async () => ({
      changes: [
        {
          old_path: 'src/x.ts',
          new_path: 'src/x.ts',
          new_file: false,
          deleted_file: false,
          renamed_file: false,
          diff: '--- a/src/x.ts\n+++ b/src/x.ts\n@@ ... @@\n-foo\n+bar',
          a_mode: '100644',
          b_mode: '100644',
        },
      ],
      source_branch: 'feat',
    }));

    const result = await mr.getChanges({ repository: 'g/p', iid: 1 });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].path, 'src/x.ts');
    assert.strictEqual(result[0].status, 'modified');
  });

  it('passes pagination params', async () => {
    requestFn.mock.mockImplementationOnce(async () => ({
      changes: [],
      sha: 'stu901',
    }));

    await mr.getChanges({ repository: 'g/p', iid: 1, page: 2, perPage: 50 });

    const callPath = requestFn.mock.calls[0].arguments[0] as string;
    assert.ok(callPath.includes('page=2'));
    assert.ok(callPath.includes('per_page=50'));
  });

  it('throws on 500 error', async () => {
    requestFn.mock.mockImplementationOnce(async () => {
      throw new Error('GitLab request failed: 500 Internal Server Error');
    });

    await assert.rejects(
      () => mr.getChanges({ repository: 'g/p', iid: 1 }),
      /GitLab request failed/
    );
  });

  it('throws on 403 error', async () => {
    requestFn.mock.mockImplementationOnce(async () => {
      throw new Error('GitLab request failed: 403 Forbidden');
    });

    await assert.rejects(() => mr.getChanges({ repository: 'g/p', iid: 1 }), /403/);
  });
});
