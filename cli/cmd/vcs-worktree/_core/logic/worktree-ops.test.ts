// @file: Unit tests for worktree-ops (gcStaleWorktrees, TTL constant, removeAllWorktrees, prepareMrWorktree).
// @consumers: node:test runner
// @tasks: TSK-93, TSK-169

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { readdir, stat, utimes as realUtimes, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ── Mock state ───────────────────────────────────────────────────────────────

let utimesShouldThrow = false;
let gitResponses: Record<string, (string | Error)[]> = {};

function gitCmd(args: string[]): string {
  const s = args.join(' ');
  if (s.includes('git-common-dir')) return 'git-common-dir';
  if (s.includes('merge-requests') && s.includes('fetch')) return 'fetch-mr';
  if (s.includes('FETCH_HEAD') && s.includes('rev-parse')) return 'rev-parse-fetch';
  if (s.includes('rev-parse') && !s.includes('FETCH_HEAD')) return 'rev-parse-head';
  if (s.includes('reset')) return 'reset';
  if (s.includes('submodule') && s.includes('update')) return 'submodule-update';
  if (s.includes('worktree') && s.includes('prune')) return 'worktree-prune';
  if (s.includes('worktree') && s.includes('add')) return 'worktree-add';
  if (s.includes('worktree') && s.includes('remove')) return 'worktree-remove';
  return 'unknown';
}

const mockExecFile = mock.fn(
  (
    _cmd: string,
    args: string[],
    _opts: any,
    callback?: (err: Error | null, stdout?: string) => void
  ): void => {
    if (!callback) return;
    const key = gitCmd(args);
    if (key === 'git-common-dir' || key === 'worktree-remove') {
      callback(new Error('not a git worktree'));
      return;
    }
    const queue = gitResponses[key];
    if (queue && queue.length > 0) {
      const result = queue.shift()!;
      if (result instanceof Error) {
        callback(result);
      } else {
        callback(null, result);
      }
      return;
    }
    callback(new Error(`unexpected: ${key} — ${args.join(' ')}`));
  }
);

mock.module('node:child_process', {
  namedExports: { execFile: mockExecFile },
});

const mockUtimes = mock.fn(async (path: string, atime: Date, mtime: Date) => {
  if (utimesShouldThrow) throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
  return realUtimes(path, atime, mtime);
});

mock.module('node:fs/promises', {
  namedExports: {
    readdir,
    stat,
    utimes: mockUtimes,
    access,
  },
});

mock.module('node:fs', {
  namedExports: {
    rmSync,
  },
});

// ── Import SUT after mocks ───────────────────────────────────────────────────

const mod = await import('./worktree-ops.logic.ts');
const { gcStaleWorktrees, removeAllWorktrees, WORKTREE_TTL_MS, prepareMrWorktree } = mod;

// ── Test fixtures ────────────────────────────────────────────────────────────

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wt-ops-'));
  gitResponses = {};
  utimesShouldThrow = false;
  mockExecFile.mock.resetCalls();
  mockUtimes.mock.resetCalls();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ── WORKTREE_TTL_MS ──────────────────────────────────────────────────────────

describe('WORKTREE_TTL_MS', () => {
  it('equals 7 days in milliseconds', () => {
    assert.strictEqual(WORKTREE_TTL_MS, 7 * 24 * 60 * 60 * 1000);
  });
});

// ── gcStaleWorktrees ─────────────────────────────────────────────────────────

describe('gcStaleWorktrees', () => {
  it('removes stale worktrees when TTL is zero', async () => {
    const w1 = join(dir, 'stale-1', 'worktree');
    const w2 = join(dir, 'stale-2', 'worktree');
    mkdirSync(w1, { recursive: true });
    mkdirSync(w2, { recursive: true });

    const removed = await gcStaleWorktrees(dir, 0, Date.now() + 1000);

    assert.deepStrictEqual(removed.sort(), [w1, w2].sort());
    assert.ok(!existsSync(w1));
    assert.ok(!existsSync(w2));
  });

  it('keeps fresh worktrees when TTL is large', async () => {
    const w1 = join(dir, 'fresh-1', 'worktree');
    mkdirSync(w1, { recursive: true });

    const removed = await gcStaleWorktrees(dir, 999999999999, Date.now());

    assert.deepStrictEqual(removed, []);
    assert.ok(existsSync(w1));
  });

  it('returns empty when root does not exist', async () => {
    const removed = await gcStaleWorktrees(join(dir, 'nope'), 0, Date.now());
    assert.deepStrictEqual(removed, []);
  });

  it('skips non-directory entries', async () => {
    const f = join(dir, 'not-a-dir');
    writeFileSync(f, 'hello');

    const removed = await gcStaleWorktrees(dir, 0, Date.now());

    assert.deepStrictEqual(removed, []);
    assert.ok(existsSync(f));
  });

  it('skips entries where stat fails', async () => {
    const broken = join(dir, 'no-access');
    mkdirSync(broken);
    rmSync(broken, { recursive: true, force: true });

    const removed = await gcStaleWorktrees(dir, 0, Date.now());

    assert.deepStrictEqual(removed, []);
  });
});

// ── removeAllWorktrees ───────────────────────────────────────────────────────

describe('removeAllWorktrees', () => {
  it('removes all directories under root', async () => {
    const w1 = join(dir, 'wt-1', 'worktree');
    const w2 = join(dir, 'wt-2', 'worktree');
    mkdirSync(w1, { recursive: true });
    mkdirSync(w2, { recursive: true });

    const removed = await removeAllWorktrees(dir);

    assert.deepStrictEqual(removed.sort(), [w1, w2].sort());
    assert.ok(!existsSync(w1));
    assert.ok(!existsSync(w2));
  });

  it('skips non-directory entries', async () => {
    const f = join(dir, 'just-a-file');
    writeFileSync(f, 'data');

    const removed = await removeAllWorktrees(dir);

    assert.deepStrictEqual(removed, []);
    assert.ok(existsSync(f));
  });

  it('returns empty when root does not exist', async () => {
    const removed = await removeAllWorktrees(join(dir, 'no-such'));
    assert.deepStrictEqual(removed, []);
  });
});

// ── prepareMrWorktree ────────────────────────────────────────────────────────

describe('prepareMrWorktree', () => {
  let cloneDir: string;
  let worktreeDir: string;
  const iid = '510';

  beforeEach(() => {
    cloneDir = join(dir, 'clone');
    mkdirSync(cloneDir);
    worktreeDir = join(dir, 'mr-510');
  });

  function gitCallsMatching(pattern: string): boolean {
    return mockExecFile.mock.calls.some(
      (c) => c.arguments.length >= 2 && (c.arguments[1] as string[]).join(' ').includes(pattern)
    );
  }

  it('reuses existing worktree via fetch + reset, updates mtime', async () => {
    mkdirSync(worktreeDir);
    gitResponses = {
      'fetch-mr': [''],
      'rev-parse-fetch': ['abc123'],
      reset: [''],
      'rev-parse-head': ['abc123'],
    };

    const result = await prepareMrWorktree(cloneDir, iid, worktreeDir);

    assert.strictEqual(result.worktreePath, worktreeDir);
    assert.strictEqual(result.headSha, 'abc123');
    assert.ok(gitCallsMatching('reset'), 'expected git reset to be called');
    assert.ok(gitCallsMatching('rev-parse'), 'expected rev-parse HEAD verification');
    assert.ok(!gitCallsMatching('worktree add'), 'expected NO worktree add call');
    assert.ok(
      mockUtimes.mock.calls.some((c) => c.arguments[0] === worktreeDir),
      'expected utimes'
    );
  });

  it('fetch succeeds but reset fails → fallback to delete + recreate', async () => {
    mkdirSync(worktreeDir);
    gitResponses = {
      'fetch-mr': ['', ''],
      'rev-parse-fetch': ['abc123', 'fallbackSha'],
      reset: [new Error('reset failed')],
      'worktree-prune': [''],
      'worktree-add': [''],
    };

    const result = await prepareMrWorktree(cloneDir, iid, worktreeDir);
    assert.strictEqual(result.worktreePath, worktreeDir);
    assert.strictEqual(result.headSha, 'fallbackSha');
    assert.ok(gitCallsMatching('worktree add'), 'expected worktree add after reset failure');
  });

  it('fetch fails → fallback to delete + recreate', async () => {
    mkdirSync(worktreeDir);
    gitResponses = {
      'fetch-mr': [new Error('fetch failed'), ''],
      'rev-parse-fetch': ['fallbackSha'],
      'worktree-prune': [''],
      'worktree-add': [''],
    };

    const result = await prepareMrWorktree(cloneDir, iid, worktreeDir);
    assert.strictEqual(result.worktreePath, worktreeDir);
    assert.strictEqual(result.headSha, 'fallbackSha');
    assert.ok(gitCallsMatching('worktree add'), 'expected worktree add after fetch failure');
  });

  it('both fetch and recreate fail → WORKTREE error propagates', async () => {
    mkdirSync(worktreeDir);
    gitResponses = {
      'fetch-mr': [new Error('reuse-fetch'), new Error('recreate-fetch')],
      'worktree-prune': [''],
    };

    await assert.rejects(
      () => prepareMrWorktree(cloneDir, iid, worktreeDir),
      /recreate-fetch/,
      'expected error from failed recreate'
    );
  });

  it('utimes fails (permission) → operation continues, worktree returned', async () => {
    mkdirSync(worktreeDir);
    utimesShouldThrow = true;
    gitResponses = {
      'fetch-mr': [''],
      'rev-parse-fetch': ['ghi789'],
      reset: [''],
      'rev-parse-head': ['ghi789'],
    };

    const result = await prepareMrWorktree(cloneDir, iid, worktreeDir);
    assert.strictEqual(result.worktreePath, worktreeDir);
    assert.strictEqual(result.headSha, 'ghi789');
    assert.ok(
      mockUtimes.mock.calls.some((c) => c.arguments[0] === worktreeDir),
      'expected utimes call'
    );
  });

  it('creates new worktree when none exists, touches mtime', async () => {
    gitResponses = {
      'worktree-prune': [''],
      'fetch-mr': [''],
      'rev-parse-fetch': ['new123'],
      'worktree-add': [''],
    };

    const result = await prepareMrWorktree(cloneDir, iid, worktreeDir);
    assert.strictEqual(result.worktreePath, worktreeDir);
    assert.strictEqual(result.headSha, 'new123');
    assert.ok(gitCallsMatching('worktree add'), 'expected worktree add for new MR');
    assert.ok(!gitCallsMatching('reset'), 'expected NO reset for new MR');
    assert.ok(
      mockUtimes.mock.calls.some((c) => c.arguments[0] === worktreeDir),
      'expected utimes'
    );
  });

  it('stale worktree removed by GC, then prepareMrWorktree creates new', async () => {
    const wtsRoot = join(dir, 'wts');
    mkdirSync(wtsRoot);
    const wtDir = join(wtsRoot, 'mr-510', 'worktree');
    mkdirSync(wtDir, { recursive: true });

    const removed = await gcStaleWorktrees(wtsRoot, 0, Date.now() + 1000);
    assert.deepStrictEqual(removed, [wtDir], 'GC should remove stale worktree');
    assert.ok(!existsSync(wtDir), 'stale worktree should be deleted');

    gitResponses = {
      'worktree-prune': [''],
      'fetch-mr': [''],
      'rev-parse-fetch': ['fresh456'],
      'worktree-add': [''],
    };

    const result = await prepareMrWorktree(cloneDir, iid, wtDir);
    assert.strictEqual(result.worktreePath, wtDir);
    assert.strictEqual(result.headSha, 'fresh456');
    assert.ok(gitCallsMatching('worktree add'), 'expected worktree add after GC');
    assert.ok(!gitCallsMatching('reset'), 'expected NO reset since worktree was GCd');
  });

  it('runs submodule update --init --recursive when initSubmodules=true', async () => {
    mkdirSync(worktreeDir);
    gitResponses = {
      'fetch-mr': [''],
      'rev-parse-fetch': ['abc123'],
      reset: [''],
      'rev-parse-head': ['abc123'],
      'submodule-update': [''],
    };

    const result = await prepareMrWorktree(cloneDir, iid, worktreeDir, undefined, true);

    assert.strictEqual(result.worktreePath, worktreeDir);
    assert.strictEqual(result.headSha, 'abc123');
    const submoduleCall = mockExecFile.mock.calls.find((c) =>
      (c.arguments[1] as string[]).includes('submodule')
    );
    assert.ok(submoduleCall, 'expected submodule update call');
    assert.ok(
      (submoduleCall!.arguments[1] as string[]).join(' ').includes('core.hooksPath=/dev/null'),
      'expected hooksPath disabled for submodule call'
    );
  });

  it('does not throw when submodule update fails', async () => {
    mkdirSync(worktreeDir);
    gitResponses = {
      'fetch-mr': [''],
      'rev-parse-fetch': ['abc123'],
      reset: [''],
      'rev-parse-head': ['abc123'],
      'submodule-update': [new Error('network unreachable')],
    };

    const result = await prepareMrWorktree(cloneDir, iid, worktreeDir, undefined, true);

    assert.strictEqual(result.worktreePath, worktreeDir);
    assert.strictEqual(result.headSha, 'abc123');
  });

  it('skips submodule update when initSubmodules omitted', async () => {
    mkdirSync(worktreeDir);
    gitResponses = {
      'fetch-mr': [''],
      'rev-parse-fetch': ['abc123'],
      reset: [''],
      'rev-parse-head': ['abc123'],
    };

    await prepareMrWorktree(cloneDir, iid, worktreeDir);

    assert.ok(
      !gitCallsMatching('submodule'),
      'expected NO submodule call when initSubmodules omitted'
    );
  });
});
