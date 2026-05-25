// @file: Compile-time gate + runtime tests for VcsClient abstract ports.
// @consumers: tsc --noEmit, node:test
// @tasks: TSK-28

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VcsClient } from '../../abstract/vcs-client.ts';
import { VcsClientMergeRequests } from '../../abstract/vcs-client-merge-requests.ts';
import { VcsClientRepositoryFiles } from '../../abstract/vcs-client-repository-files.ts';

// --- Compile-time gate tests (verified by tsc --noEmit, NOT run by node:test) ---
// @ts-expect-error: D-001 — abstract class instantiation gate (see specs/vcs/vcs-client/vcs-client.spec.md#d-001)
class _VcsClientWithoutMergeRequests extends VcsClient {}
// @ts-expect-error: D-001 — abstract class instantiation gate
class _VcsMergeRequestsWithoutGetChanges extends VcsClientMergeRequests {}
// @ts-expect-error: D-001 — abstract class instantiation gate
class _VcsRepositoryFilesWithoutGetFileContent extends VcsClientRepositoryFiles {}

// Compiles successfully — optional ports can be omitted
class _VcsClientMinimal extends VcsClient {
  readonly MergeRequests: VcsClientMergeRequests = new (class extends VcsClientMergeRequests {
    async getList() {
      return [];
    }
    async getOne() {
      return null;
    }
    async getByIid() {
      return null;
    }
    async getChanges() {
      return [];
    }
  })();
}

// Compiles successfully — optional ports may be undefined
class _VcsClientNoOptionalPorts extends VcsClient {
  readonly MergeRequests: VcsClientMergeRequests = new (class extends VcsClientMergeRequests {
    async getList() {
      return [];
    }
    async getOne() {
      return null;
    }
    async getByIid() {
      return null;
    }
    async getChanges() {
      return [];
    }
  })();
  readonly MergeDiscussions = undefined;
  readonly RepositoryFiles = undefined;
}

// --- Runtime signature tests (run by node:test) ---

describe('VcsClientRepositoryFiles — getFileContent signature', () => {
  it('returns Promise<VcsFileContent | null>', async () => {
    const stub = new (class extends VcsClientRepositoryFiles {
      async getFileContent() {
        return { path: 'test.ts', content: 'test', encoding: 'utf-8' as const };
      }
    })();
    const result = await stub.getFileContent({ repository: 'r', path: 'p', ref: 'main' });
    assert.strictEqual(result?.path, 'test.ts');
    assert.strictEqual(result?.content, 'test');
  });

  it('can return null for missing file', async () => {
    const stub = new (class extends VcsClientRepositoryFiles {
      async getFileContent() {
        return null;
      }
    })();
    const result = await stub.getFileContent({ repository: 'r', path: 'p', ref: 'main' });
    assert.strictEqual(result, null);
  });
});

describe('VcsClientMergeRequests — getChanges signature', () => {
  it('returns Promise<VcsMergeRequestChanges[]>', async () => {
    const stub = new (class extends VcsClientMergeRequests {
      async getList() {
        return [];
      }
      async getOne() {
        return null;
      }
      async getByIid() {
        return null;
      }
      async getChanges() {
        return [{ path: 'f.ts', status: 'modified', ref: 'main' }];
      }
    })();
    const result = await stub.getChanges({ repository: 'r', iid: 1 });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].path, 'f.ts');
  });
});

describe('VcsClient — optional ports', () => {
  it('allows undefined MergeDiscussions', () => {
    const client = new _VcsClientNoOptionalPorts();
    assert.strictEqual(client.MergeDiscussions, undefined);
  });

  it('allows undefined RepositoryFiles', () => {
    const client = new _VcsClientNoOptionalPorts();
    assert.strictEqual(client.RepositoryFiles, undefined);
  });

  it('MergeRequests is always present', () => {
    const client = new _VcsClientMinimal();
    assert.ok(client.MergeRequests);
  });
});
