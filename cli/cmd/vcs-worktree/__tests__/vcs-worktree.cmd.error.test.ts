// @file: Unit tests for vcs-worktree cmd — VcsResolveError handling contract.
// @consumers: N/A
// @tasks: TSK-70

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VcsResolveError } from '../../_shared/vcs-context-resolver.ts';

// ── Mock: resolveVcsContext throws VcsResolveError ───────────────────────────

const resolveVcsContextThrowing = mock.fn(async () => {
  throw new VcsResolveError('no git remote found');
});

mock.module('../../_shared/vcs-context-resolver.ts', {
  namedExports: {
    resolveVcsContext: resolveVcsContextThrowing,
    VcsResolveError,
  },
});

class MockVcsGitlabClient {
  MergeRequests = {
    getByIid: mock.fn(async () => ({})),
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
    prepareMrWorktree: () => ({}),
    resolveBaseSha: () => '',
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

// ── Capture stderr and exit ─────────────────────────────────────────────────

let exitCode: number | null = null;
let stderrLines: string[] = [];
const origExit = process.exit;
const origArgv = process.argv;
const origStderrWrite = process.stderr.write.bind(process.stderr);
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

describe('vcs-worktree cmd — VcsResolveError', () => {
  it('VcsResolveError — error message, exit 1', () => {
    // contract: resolveVcsContext throws VcsResolveError → stderr message + exit 1
    // failure mode: do not silently exit 0 or suppress error details
    assert.strictEqual(resolveVcsContextThrowing.mock.callCount(), 1);
    assert.strictEqual(exitCode, 1);
    assert.match(stderrLines.join(''), /Ошибка/);
    assert.match(stderrLines.join(''), /no git remote found/);
  });
});
