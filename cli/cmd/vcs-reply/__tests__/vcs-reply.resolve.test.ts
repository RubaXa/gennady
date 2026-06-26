// @file: Unit tests for vcs-reply resolve/reopen logic via stdin JSON.
// @consumers: N/A
// @tasks: TSK-72

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

// capture stderr during import
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

type ResolveTestContext = {
  addNote: ReturnType<typeof mock.fn>;
  resolveDiscussion: ReturnType<typeof mock.fn>;
  createDiscussion: ReturnType<typeof mock.fn>;
  mockVcs: {
    MergeDiscussions: {
      addNote: ReturnType<typeof mock.fn>;
      resolveDiscussion: ReturnType<typeof mock.fn>;
      createDiscussion: ReturnType<typeof mock.fn>;
    };
  };
  baseVcsContext: VcsCliContext;
};

function createResolveTestContext(overrides?: {
  addNoteImpl?: () => Promise<unknown>;
  resolveDiscussionImpl?: () => Promise<void>;
  createDiscussionImpl?: () => Promise<unknown>;
}): ResolveTestContext {
  const addNote = mock.fn(overrides?.addNoteImpl ?? (async () => ({})));
  const resolveDiscussion = mock.fn(overrides?.resolveDiscussionImpl ?? (async () => {}));
  const createDiscussion = mock.fn(overrides?.createDiscussionImpl ?? (async () => ({})));
  const mockVcs = {
    MergeDiscussions: { addNote, resolveDiscussion, createDiscussion },
  };
  const baseVcsContext: VcsCliContext = {
    provider: 'gitlab',
    host: 'gitlab.example.com',
    project: 'g/r',
    iid: 42,
    token: 'glpat-test',
  };
  return { addNote, resolveDiscussion, createDiscussion, mockVcs, baseVcsContext };
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

// ── BDD: resolve+reply ───────────────────────────────────────────────────

describe('vcs-reply resolve/reopen', () => {
  it('resolve+reply: project/iid passed to addNote then resolveDiscussion', async () => {
    // contract: resolve:true + discussionId + body → addNote then resolveDiscussion, exit 0
    // invariant: project and iid forwarded to both calls

    const ctx = createResolveTestContext();

    // #region START_RESOLVE_REPLY_TRIGGER
    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [{ discussionId: 'abc', body: 'fixed', resolve: true }],
      vcs: ctx.mockVcs as any,
      vcsContext: ctx.baseVcsContext,
    });
    // #endregion END_RESOLVE_REPLY_TRIGGER

    // #region START_RESOLVE_REPLY_ASSERT
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.sent, 1);

    assert.strictEqual(ctx.addNote.mock.callCount(), 1);
    assert.deepStrictEqual(ctx.addNote.mock.calls[0].arguments[0], {
      project: 'g/r',
      iid: '42',
      discussionId: 'abc',
      body: 'fixed',
    });

    assert.strictEqual(ctx.resolveDiscussion.mock.callCount(), 1);
    assert.deepStrictEqual(ctx.resolveDiscussion.mock.calls[0].arguments[0], {
      project: 'g/r',
      iid: '42',
      discussionId: 'abc',
      resolved: true,
    });

    assert.strictEqual(ctx.createDiscussion.mock.callCount(), 0);
    // #endregion END_RESOLVE_REPLY_ASSERT
  });

  // ── BDD: resolve-only (no body) ────────────────────────────────────────

  it('resolve-only: no addNote, resolveDiscussion with project/iid', async () => {
    // contract: resolve:true without body → addNote NOT called, only resolveDiscussion

    const ctx = createResolveTestContext();

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [{ discussionId: 'abc', resolve: true }],
      vcs: ctx.mockVcs as any,
      vcsContext: ctx.baseVcsContext,
    });

    // #region START_RESOLVE_ONLY_ASSERT
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.sent, 1);

    assert.strictEqual(ctx.addNote.mock.callCount(), 0);
    assert.strictEqual(ctx.createDiscussion.mock.callCount(), 0);

    assert.strictEqual(ctx.resolveDiscussion.mock.callCount(), 1);
    assert.deepStrictEqual(ctx.resolveDiscussion.mock.calls[0].arguments[0], {
      project: 'g/r',
      iid: '42',
      discussionId: 'abc',
      resolved: true,
    });
    // #endregion END_RESOLVE_ONLY_ASSERT
  });

  // ── BDD: resolve-only 403 error ────────────────────────────────────────

  it('resolve-only 403: VcsError propagated', async () => {
    // contract: resolveDiscussion throws 403 → stderr contains 403, exit 1

    const ctx = createResolveTestContext({
      resolveDiscussionImpl: async () => {
        throw new Error('403 Forbidden');
      },
    });

    captureOutput();

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [{ discussionId: 'abc', resolve: true }],
      vcs: ctx.mockVcs as any,
      vcsContext: ctx.baseVcsContext,
    });

    restoreOutput();

    // #region START_RESOLVE_403_ASSERT
    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failed, 1);

    assert.strictEqual(ctx.resolveDiscussion.mock.callCount(), 1);

    const joined = stderrLines.join('');
    assert.match(joined, /403/);
    // #endregion END_RESOLVE_403_ASSERT
  });

  // ── BDD: reopen ────────────────────────────────────────────────────────

  it('reopen: resolved=false', async () => {
    // contract: resolve:false → resolveDiscussion called with resolved:false

    const ctx = createResolveTestContext();

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [{ discussionId: 'abc', resolve: false }],
      vcs: ctx.mockVcs as any,
      vcsContext: ctx.baseVcsContext,
    });

    // #region START_REOPEN_ASSERT
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.sent, 1);

    assert.strictEqual(ctx.addNote.mock.callCount(), 0);
    assert.strictEqual(ctx.createDiscussion.mock.callCount(), 0);

    assert.strictEqual(ctx.resolveDiscussion.mock.callCount(), 1);
    assert.deepStrictEqual(ctx.resolveDiscussion.mock.calls[0].arguments[0], {
      project: 'g/r',
      iid: '42',
      discussionId: 'abc',
      resolved: false,
    });
    // #endregion END_REOPEN_ASSERT
  });

  // ── BDD: reopen with body (body ignored) ───────────────────────────────

  it('reopen with body: body ignored, only reopen', async () => {
    // contract: resolve:false + body → addNote NOT called, body ignored

    const ctx = createResolveTestContext();

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [{ discussionId: 'abc', body: 'irrelevant', resolve: false }],
      vcs: ctx.mockVcs as any,
      vcsContext: ctx.baseVcsContext,
    });

    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.sent, 1);

    assert.strictEqual(ctx.addNote.mock.callCount(), 0);
    assert.strictEqual(ctx.createDiscussion.mock.callCount(), 0);

    assert.strictEqual(ctx.resolveDiscussion.mock.callCount(), 1);
    assert.deepStrictEqual(ctx.resolveDiscussion.mock.calls[0].arguments[0], {
      project: 'g/r',
      iid: '42',
      discussionId: 'abc',
      resolved: false,
    });
  });

  // ── BDD: resolve without discussionId → validation error ───────────────

  it('resolve without discussionId: validation error', async () => {
    // contract: resolve:true without discussionId → stderr warns, exit 1

    captureOutput();

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [{ body: 'hi', resolve: true }],
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
    assert.match(joined, /resolve требует discussionId/);
  });

  // ── BDD: addNote ok, resolve fail → warning ────────────────────────────

  it('addNote succeeds, resolve fails: warning with error text', async () => {
    // contract: addNote succeeds but resolveDiscussion throws 403 → warning + exit 1

    const ctx = createResolveTestContext({
      resolveDiscussionImpl: async () => {
        throw new Error('403 Forbidden');
      },
    });

    captureOutput();

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [{ discussionId: 'abc', body: 'fixed', resolve: true }],
      vcs: ctx.mockVcs as any,
      vcsContext: ctx.baseVcsContext,
    });

    restoreOutput();

    // #region START_NOTE_OK_RESOLVE_FAIL_ASSERT
    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.sent, 0);
    assert.strictEqual(result.failed, 1);

    assert.strictEqual(ctx.addNote.mock.callCount(), 1);

    const joined = stderrLines.join('');
    assert.match(joined, /Note posted but resolve failed/);
    assert.match(joined, /403 Forbidden/);
    // #endregion END_NOTE_OK_RESOLVE_FAIL_ASSERT
  });

  // ── BDD: partial failure ───────────────────────────────────────────────

  it('partial failure: exit 1', async () => {
    // contract: array of 2 items, one fails → exit 1

    let resolveCall = 0;
    const ctx = createResolveTestContext({
      resolveDiscussionImpl: () => {
        resolveCall += 1;
        if (resolveCall === 1) return Promise.reject(new Error('403 Forbidden'));
        return Promise.resolve();
      },
    });

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [
        { discussionId: 'a', resolve: true },
        { discussionId: 'b', resolve: true },
      ],
      vcs: ctx.mockVcs as any,
      vcsContext: ctx.baseVcsContext,
    });

    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(result.sent, 1);
  });

  // ── BDD: empty array → exit 0 ─────────────────────────────────────────

  it('empty array: exit 0', async () => {
    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [],
    });

    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.sent, 0);
    assert.strictEqual(result.failed, 0);
  });

  // ── BDD: dry-run resolve ───────────────────────────────────────────────

  it('dry-run resolve: prints Would resolve', async () => {
    // contract: --dry-run + resolve:true → stdout "Would resolve", API not called

    captureOutput();

    const result = await main({
      project: 'g/r',
      iid: '42',
      dryRun: true,
      stdinJsonArray: [{ discussionId: 'abc', resolve: true }],
    });

    restoreOutput();

    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.ok, true);

    const joined = stdoutLines.join('');
    assert.match(joined, /Would resolve/);
    assert.match(joined, /discussionId=abc/);
  });

  // ── BDD: dry-run reopen ────────────────────────────────────────────────

  it('dry-run reopen: prints Would reopen', async () => {
    // contract: --dry-run + resolve:false → stdout "Would reopen"

    captureOutput();

    const result = await main({
      project: 'g/r',
      iid: '42',
      dryRun: true,
      stdinJsonArray: [{ discussionId: 'abc', resolve: false }],
    });

    restoreOutput();

    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.ok, true);

    const joined = stdoutLines.join('');
    assert.match(joined, /Would reopen/);
    assert.match(joined, /discussionId=abc/);
  });
});
