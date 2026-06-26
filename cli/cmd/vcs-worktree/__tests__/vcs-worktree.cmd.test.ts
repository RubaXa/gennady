// @file: Unit tests for vcs-worktree cmd — resolveVcsContext interaction contract.
// @consumers: N/A
// @tasks: TSK-70

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { VcsResolveError } from '../../_shared/vcs-context-resolver.ts';
import type { VcsCliContext } from '../../_shared/vcs-context-resolver.ts';

// ── Mock delegates ───────────────────────────────────────────────────────────

const resolveVcsContextTracker = mock.fn(
  async (_args: any): Promise<VcsCliContext> => ({
    provider: 'gitlab',
    host: 'gitlab.example.com',
    project: 'group/repo',
    iid: 510,
    token: 'glpat-mock',
  })
);

mock.module('../../_shared/vcs-context-resolver.ts', {
  namedExports: {
    resolveVcsContext: resolveVcsContextTracker,
    VcsResolveError,
  },
});

class MockVcsGitlabClient {
  MergeRequests = {
    getByIid: mock.fn(async () => ({
      target_branch: 'main',
      diff_refs: { base_sha: 'abc', start_sha: 'def', head_sha: 'ghi' },
    })),
  };
}

mock.module('../../../../services/vcs-client/gitlab/vcs-gitlab-client.ts', {
  defaultExport: MockVcsGitlabClient,
  namedExports: {
    VcsGitlabClient: MockVcsGitlabClient,
  },
});

mock.module('../../inbox/_core/logic/state-paths.logic.ts', {
  namedExports: {
    resolveStateDir: () => '/tmp/gennady-test',
    worktreesRoot: () => '/tmp/gennady-test/worktrees',
    clonesRoot: () => '/tmp/gennady-test/clones',
    reposMapPath: () => '/tmp/gennady-test/repos.json',
  },
});

mock.module('../_core/logic/worktree-ops.logic.ts', {
  namedExports: {
    prepareMrWorktree: () => ({
      worktreePath: '/tmp/gennady-test/worktrees/test-wt',
      headSha: 'abc123',
    }),
    resolveBaseSha: () => 'base456',
    removeWorktreeAt: () => {},
    gcStaleWorktrees: () => [],
    removeAllWorktrees: () => [],
  },
});

mock.module('../_core/logic/locate-clone.logic.ts', {
  namedExports: {
    ensureClone: () => '/tmp/gennady-test/clones/test-clone',
  },
});

// ── Setup before import ──────────────────────────────────────────────────────

let exitCode: number | null = null;
let stderrLines: string[];
const origExit = process.exit;
const origArgv = process.argv;
let origStderrWrite: typeof process.stderr.write;

stderrLines = [];
origStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((chunk: unknown) => {
  stderrLines.push(String(chunk));
  return true;
}) as typeof process.stderr.write;

process.exit = ((code?: number) => {
  exitCode = code ?? 0;
  return undefined as never;
}) as typeof process.exit;

// ── Import SUT ───────────────────────────────────────────────────────────────

process.argv = ['node', 'gennady', 'vcs-worktree', '--ref', 'group/repo!510'];
await import('../vcs-worktree.cmd.ts');

// ── Restore ──────────────────────────────────────────────────────────────────

process.stderr.write = origStderrWrite;
process.exit = origExit;
process.argv = origArgv;

afterEach(() => {
  stderrLines.length = 0;
  origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: unknown) => {
    stderrLines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
});

describe('vcs-worktree cmd', () => {
  it('ref passed to resolveVcsContext', () => {
    // contract: --ref group/repo!510 → resolveVcsContext called with { ref: 'group/repo!510' }
    // failure mode: do not inspect private internals — verify only mock call args

    assert.strictEqual(resolveVcsContextTracker.mock.callCount(), 1);

    const resolveCallArgs = resolveVcsContextTracker.mock.calls[0].arguments[0];

    assert.deepStrictEqual(resolveCallArgs, {
      ref: 'group/repo!510',
      host: undefined,
    });
  });
});
