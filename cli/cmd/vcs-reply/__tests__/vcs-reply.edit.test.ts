// @file: Unit tests for vcs-reply edit/delete note operations via stdin JSON.
// @consumers: N/A
// @tasks: TSK-78

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

type EditTestContext = {
  updateNote: ReturnType<typeof mock.fn>;
  deleteNote: ReturnType<typeof mock.fn>;
  mockVcs: {
    MergeDiscussions: {
      updateNote: ReturnType<typeof mock.fn>;
      deleteNote: ReturnType<typeof mock.fn>;
    };
  };
  baseVcsContext: VcsCliContext;
};

function createEditTestContext(overrides?: {
  updateNoteImpl?: () => Promise<void>;
  deleteNoteImpl?: () => Promise<void>;
}): EditTestContext {
  const updateNote = mock.fn(overrides?.updateNoteImpl ?? (async () => {}));
  const deleteNote = mock.fn(overrides?.deleteNoteImpl ?? (async () => {}));
  const mockVcs = {
    MergeDiscussions: { updateNote, deleteNote },
  };
  const baseVcsContext: VcsCliContext = {
    provider: 'gitlab',
    host: 'gitlab.example.com',
    project: 'g/r',
    iid: 42,
    token: 'glpat-test',
  };
  return { updateNote, deleteNote, mockVcs, baseVcsContext };
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

// ── BDD: {noteId, body} → updateNote, success ───────────────────────────

describe('vcs-reply edit/delete', () => {
  it('should call updateNote with project/iid/noteId/body', async () => {
    const ctx = createEditTestContext();

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [{ noteId: '12345', body: 'исправленный текст' }],
      vcs: ctx.mockVcs as any,
      vcsContext: ctx.baseVcsContext,
    });

    // #region START_UPDATE_NOTE_ASSERT
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.sent, 1);

    assert.strictEqual(ctx.updateNote.mock.callCount(), 1);
    assert.deepStrictEqual(ctx.updateNote.mock.calls[0].arguments[0], {
      project: 'g/r',
      iid: '42',
      noteId: '12345',
      body: 'исправленный текст',
    });
    assert.strictEqual(ctx.deleteNote.mock.callCount(), 0);
    // #endregion END_UPDATE_NOTE_ASSERT
  });

  // ── BDD: {noteId, delete:true} → deleteNote, success ───────────────────

  it('should call deleteNote with project/iid/noteId', async () => {
    const ctx = createEditTestContext();

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [{ noteId: '99', delete: true }],
      vcs: ctx.mockVcs as any,
      vcsContext: ctx.baseVcsContext,
    });

    // #region START_DELETE_NOTE_ASSERT
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.sent, 1);

    assert.strictEqual(ctx.deleteNote.mock.callCount(), 1);
    assert.deepStrictEqual(ctx.deleteNote.mock.calls[0].arguments[0], {
      project: 'g/r',
      iid: '42',
      noteId: '99',
      discussionId: undefined,
    });
    assert.strictEqual(ctx.updateNote.mock.callCount(), 0);
    // #endregion END_DELETE_NOTE_ASSERT
  });

  // ── BDD: delete with discussionId forwarded ─────────────────────────────

  it('should forward discussionId to deleteNote when present', async () => {
    const ctx = createEditTestContext();

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [{ noteId: '55', delete: true, discussionId: 'disc-1' }],
      vcs: ctx.mockVcs as any,
      vcsContext: ctx.baseVcsContext,
    });

    assert.strictEqual(result.code, 0);

    assert.strictEqual(ctx.deleteNote.mock.callCount(), 1);
    assert.strictEqual(ctx.deleteNote.mock.calls[0].arguments[0].discussionId, 'disc-1');
  });

  // ── BDD: 404 → ✖ Note <id> not found, exit 1 ───────────────────────────

  it('should report Note not found and exit 1 on 404', async () => {
    // contract: updateNote throws with "404" in message → stderr "Note <id> not found"
    const ctx = createEditTestContext({
      updateNoteImpl: async () => {
        throw new Error('GitLab request failed: 404 Not Found');
      },
    });

    captureOutput();

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [{ noteId: '12345', body: 'text' }],
      vcs: ctx.mockVcs as any,
      vcsContext: ctx.baseVcsContext,
    });

    restoreOutput();

    // #region START_404_ASSERT
    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failed, 1);

    const joined = stderrLines.join('');
    assert.match(joined, /Note 12345 not found/);
    // #endregion END_404_ASSERT
  });

  // ── BDD: 404 on delete ──────────────────────────────────────────────────

  it('should report Note not found and exit 1 on 404 delete', async () => {
    const ctx = createEditTestContext({
      deleteNoteImpl: async () => {
        throw new Error('HTTP 404 page not found');
      },
    });

    captureOutput();

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [{ noteId: 'abc', delete: true }],
      vcs: ctx.mockVcs as any,
      vcsContext: ctx.baseVcsContext,
    });

    restoreOutput();

    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failed, 1);

    const joined = stderrLines.join('');
    assert.match(joined, /Note abc not found/);
  });

  // ── BDD: Чужая заметка → error, exit 1 ─────────────────────────────────

  it('should propagate error and exit 1 on foreign note rejection', async () => {
    // contract: updateNote throws non-404 → stderr contains the raw error message
    const ctx = createEditTestContext({
      updateNoteImpl: async () => {
        throw new Error("Cannot modify another user's note");
      },
    });

    captureOutput();

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [{ noteId: '12345', body: 'text' }],
      vcs: ctx.mockVcs as any,
      vcsContext: ctx.baseVcsContext,
    });

    restoreOutput();

    // #region START_FOREIGN_NOTE_ASSERT
    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failed, 1);

    const joined = stderrLines.join('');
    assert.match(joined, /Cannot modify another user's note/);
    // #endregion END_FOREIGN_NOTE_ASSERT
  });

  // ── BDD: foreign note on delete ─────────────────────────────────────────

  it('should propagate error on foreign note delete rejection', async () => {
    const ctx = createEditTestContext({
      deleteNoteImpl: async () => {
        throw new Error("Cannot delete another user's note");
      },
    });

    captureOutput();

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [{ noteId: 'abc', delete: true }],
      vcs: ctx.mockVcs as any,
      vcsContext: ctx.baseVcsContext,
    });

    restoreOutput();

    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failed, 1);

    const joined = stderrLines.join('');
    assert.match(joined, /Cannot delete another user's note/);
  });

  // ── Validation: edit note without body → error ─────────────────────────

  it('should reject noteId without body and without delete', async () => {
    // contract: validation guard — noteId + !delete + !body → stderr "edit note требует body"
    captureOutput();

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [{ noteId: '12345' }],
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
    assert.match(joined, /edit note требует body/);
  });

  // ── Validation: delete without noteId → error ──────────────────────────

  it('should reject delete without noteId', async () => {
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
    assert.match(joined, /delete требует noteId/);
  });

  // ── Dry-run: edit ──────────────────────────────────────────────────────

  it('should show edit intent in dry-run mode', async () => {
    captureOutput();

    const result = await main({
      project: 'g/r',
      iid: '42',
      dryRun: true,
      stdinJsonArray: [{ noteId: '12345', body: 'исправленный текст' }],
    });

    restoreOutput();

    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.ok, true);

    const joined = stdoutLines.join('');
    assert.match(joined, /edit:12345/);
    assert.match(joined, /исправленный текст/);
  });

  // ── Dry-run: delete ────────────────────────────────────────────────────

  it('should show delete intent in dry-run mode', async () => {
    captureOutput();

    const result = await main({
      project: 'g/r',
      iid: '42',
      dryRun: true,
      stdinJsonArray: [{ noteId: '99', delete: true }],
    });

    restoreOutput();

    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.ok, true);

    const joined = stdoutLines.join('');
    assert.match(joined, /Would delete/);
    assert.match(joined, /noteId=99/);
  });

  // ── Mixed array: edit + delete in one call ─────────────────────────────

  it('should process mixed edit and delete items in one call', async () => {
    const ctx = createEditTestContext();

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [
        { noteId: 'a', body: 'edit' },
        { noteId: 'b', delete: true },
      ],
      vcs: ctx.mockVcs as any,
      vcsContext: ctx.baseVcsContext,
    });

    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.sent, 2);

    assert.strictEqual(ctx.updateNote.mock.callCount(), 1);
    assert.deepStrictEqual(ctx.updateNote.mock.calls[0].arguments[0], {
      project: 'g/r',
      iid: '42',
      noteId: 'a',
      body: 'edit',
    });

    assert.strictEqual(ctx.deleteNote.mock.callCount(), 1);
    assert.deepStrictEqual(ctx.deleteNote.mock.calls[0].arguments[0], {
      project: 'g/r',
      iid: '42',
      noteId: 'b',
      discussionId: undefined,
    });
  });

  // ── Partial failure: one edit fails, one succeeds ──────────────────────

  it('should report partial failure when one edit throws', async () => {
    let callIdx = 0;
    const ctx = createEditTestContext({
      updateNoteImpl: () => {
        callIdx++;
        if (callIdx === 1) return Promise.reject(new Error('403 Forbidden'));
        return Promise.resolve();
      },
    });

    const result = await main({
      project: 'g/r',
      iid: '42',
      stdinJsonArray: [
        { noteId: 'a', body: 'first' },
        { noteId: 'b', body: 'second' },
      ],
      vcs: ctx.mockVcs as any,
      vcsContext: ctx.baseVcsContext,
    });

    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.sent, 1);
    assert.strictEqual(result.failed, 1);
  });
});
