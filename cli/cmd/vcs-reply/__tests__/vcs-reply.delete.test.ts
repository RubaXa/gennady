// @file: Unit tests for vcs-reply delete discussion — {discussionId, delete:true} → deleteDiscussion.
// @consumers: N/A
// @tasks: TSK-87

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { VcsCliContext } from '../../_shared/vcs-context-resolver.ts';

// ── Module-level mock for resolveVcsContext (needed for top-level import) ──

const resolveVcsContextTracker = mock.fn(
  async (_args: any): Promise<VcsCliContext> => ({
    provider: 'gitlab',
    host: 'gitlab.example.com',
    project: 'g/p',
    iid: 42,
    token: 'glpat-mock',
  })
);

mock.module('../../_shared/vcs-context-resolver.ts', {
  namedExports: { resolveVcsContext: resolveVcsContextTracker },
});

// ── Suppress module-level side effects during import ─────────────────────

Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

let _exitCode: number | null = null;
const _origExit = process.exit;
process.exit = ((code?: number) => {
  _exitCode = code ?? 0;
  return undefined as never;
}) as typeof process.exit;

let _importStderr: string[] = [];
const _realStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((chunk: unknown) => {
  _importStderr.push(String(chunk));
  return true;
}) as typeof process.stderr.write;

const _origArgv = process.argv;
process.argv = ['node', 'gennady', 'vcs-reply', '--project=g/p', '--iid=42'];

const cmdModule = await import('../vcs-reply.cmd.ts');
const { main } = cmdModule;

process.stderr.write = _realStderrWrite;
process.exit = _origExit;
process.argv = _origArgv;

// ── Unified context factory ──────────────────────────────────────────────

type DeleteDiscussionTestContext = {
  deleteDiscussion: ReturnType<typeof mock.fn>;
  mockVcs: {
    MergeDiscussions: {
      deleteDiscussion: ReturnType<typeof mock.fn>;
    };
  };
  baseVcsContext: VcsCliContext;
};

function createDeleteDiscussionTestContext(overrides?: {
  deleteDiscussionImpl?: () => Promise<void>;
}): DeleteDiscussionTestContext {
  const deleteDiscussion = mock.fn(overrides?.deleteDiscussionImpl ?? (async () => {}));
  const mockVcs = {
    MergeDiscussions: { deleteDiscussion },
  };
  const baseVcsContext: VcsCliContext = {
    provider: 'gitlab',
    host: 'gitlab.example.com',
    project: 'g/r',
    iid: 42,
    token: 'glpat-test',
  };
  return { deleteDiscussion, mockVcs, baseVcsContext };
}

// ── Output capture helpers ───────────────────────────────────────────────

let stderrLines: string[];
let stdoutLines: string[];
let _origStderrWrite: typeof process.stderr.write;
let _origStdoutWrite: typeof process.stdout.write;

function captureOutput(): void {
  stderrLines = [];
  stdoutLines = [];
  _origStderrWrite = process.stderr.write.bind(process.stderr);
  _origStdoutWrite = process.stdout.write.bind(process.stdout);
  process.stderr.write = ((chunk: unknown) => {
    stderrLines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  process.stdout.write = ((chunk: unknown) => {
    stdoutLines.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
}

function restoreOutput(): void {
  process.stderr.write = _origStderrWrite;
  process.stdout.write = _origStdoutWrite;
}

// ── BDD: {discussionId, delete:true} → deleteDiscussion, success ────────

describe('vcs-reply delete discussion', () => {
  it('should call deleteDiscussion with project/iid/discussionId', async () => {
    // contract: {discussionId, delete:true} → client.MergeDiscussions.deleteDiscussion called

    const ctx = createDeleteDiscussionTestContext();

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [{ discussionId: 'DISC-1', delete: true }],
      vcs: ctx.mockVcs as any,
      vcsContext: ctx.baseVcsContext,
    });

    // #region START_DELETE_DISCUSSION_ASSERT
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.sent, 1);

    assert.strictEqual(ctx.deleteDiscussion.mock.callCount(), 1);
    assert.deepStrictEqual(ctx.deleteDiscussion.mock.calls[0].arguments[0], {
      project: 'g/r',
      iid: '42',
      discussionId: 'DISC-1',
    });
    // #endregion END_DELETE_DISCUSSION_ASSERT
  });

  // ── BDD: 404 on deleteDiscussion → Discussion not found, exit 1 ────────

  it('should report Discussion not found and exit 1 on 404', async () => {
    // contract: deleteDiscussion throws 404 → stderr "Discussion <id> not found"
    const ctx = createDeleteDiscussionTestContext({
      deleteDiscussionImpl: async () => {
        throw new Error('HTTP 404 page not found');
      },
    });

    captureOutput();

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [{ discussionId: 'DISC-404', delete: true }],
      vcs: ctx.mockVcs as any,
      vcsContext: ctx.baseVcsContext,
    });

    restoreOutput();

    // #region START_DELETE_DISC_404_ASSERT
    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failed, 1);

    const joined = stderrLines.join('');
    assert.match(joined, /Discussion DISC-404 not found/);
    // #endregion END_DELETE_DISC_404_ASSERT
  });

  // ── BDD: non-404 error on deleteDiscussion propagated ──────────────────

  it('should propagate non-404 error and exit 1', async () => {
    // contract: deleteDiscussion throws non-404 → stderr contains raw error message
    const ctx = createDeleteDiscussionTestContext({
      deleteDiscussionImpl: async () => {
        throw new Error('You are not allowed to delete this discussion');
      },
    });

    captureOutput();

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [{ discussionId: 'DISC-F', delete: true }],
      vcs: ctx.mockVcs as any,
      vcsContext: ctx.baseVcsContext,
    });

    restoreOutput();

    // #region START_DELETE_DISC_403_ASSERT
    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failed, 1);

    const joined = stderrLines.join('');
    assert.match(joined, /You are not allowed to delete this discussion/);
    // #endregion END_DELETE_DISC_403_ASSERT
  });

  // ── Dry-run: delete discussion ─────────────────────────────────────────

  it('should show delete discussion intent in dry-run mode', async () => {
    // contract: --dry-run + {discussionId, delete:true} → "Would delete discussion"
    captureOutput();

    const result = await main({
      project: 'g/r',
      iid: '42',
      dryRun: true,
      stdinJsonArray: [{ discussionId: 'DISC-DRY', delete: true }],
    });

    restoreOutput();

    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.ok, true);

    const joined = stdoutLines.join('');
    assert.match(joined, /Would delete discussion/);
    assert.match(joined, /discussionId=DISC-DRY/);
  });

  // ── Validation: delete without discussionId and without noteId ─────────

  it('should reject delete without noteId or discussionId', async () => {
    // contract: delete:true without noteId and without discussionId → validation error
    captureOutput();

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [{ delete: true }],
      vcsContext: {
        provider: 'gitlab',
        host: 'gitlab.example.com',
        project: 'g/r',
        token: 'glpat-test',
      },
    });

    restoreOutput();

    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.ok, false);

    const joined = stderrLines.join('');
    assert.match(joined, /delete требует noteId или discussionId/);
  });
});
