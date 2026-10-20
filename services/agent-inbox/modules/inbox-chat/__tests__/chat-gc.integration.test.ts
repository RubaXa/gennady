// @file: Integration test for ChatGc — exercises gcStaleChats/gcStaleSnapshots against a real
//   filesystem tree (real fs, real mtimes via utimesSync, real OS-level immutable-flag permission
//   errors via `chflags uchg`) with no mocked collaborators.
// @consumers: node:test runner
// @tasks: TSK-128

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { makeTestTmpDir, cleanupTestTmp } from '../../inbox-core/test-support/test-tmp.ts';
import { gcStaleChats, gcStaleSnapshots } from '../chat-gc.ts';

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 168h, per D-105
const NOW_MS = Date.parse('2026-07-15T12:00:00.000Z');
const STALE_MTIME_MS = NOW_MS - TTL_MS - 60_000; // just past TTL
const FRESH_MTIME_MS = NOW_MS - 60_000; // well within TTL

function touch(path: string, mtimeMs: number): void {
  const seconds = mtimeMs / 1000;
  utimesSync(path, seconds, seconds);
}

/** Real OS-level immutable flag (macOS/BSD) — makes the file genuinely undeletable, even though
 * the containing directory stays writable. Produces a real EPERM from rmSync, not a simulated one. */
function protectFile(path: string): void {
  execFileSync('chflags', ['uchg', path]);
}

function unprotectFile(path: string): void {
  try {
    execFileSync('chflags', ['nouchg', path]);
  } catch {
    // best-effort cleanup guard — if already unprotected/removed, nothing to do
  }
}

describe('ChatGc integration (real fs, real permission errors)', () => {
  let dir: string;
  let protectedChat: string;
  let protectedSnapshot: string;

  beforeEach(() => {
    dir = makeTestTmpDir('chat-gc-integration-');
    protectedChat = '';
    protectedSnapshot = '';
  });

  afterEach(() => {
    if (protectedChat) unprotectFile(protectedChat);
    if (protectedSnapshot) unprotectFile(protectedSnapshot);
    cleanupTestTmp(dir);
  });

  it('sweeps a real chats/ tree and a real reports/<mr>/snapshots/ tree, removing only stale files, and a real undeletable file does not block the rest', () => {
    // ── real chats/ tree ──────────────────────────────────────────────────────
    const chatsDir = join(dir, 'chats');
    mkdirSync(chatsDir);
    const staleChat = join(chatsDir, 'stale-ref.jsonl');
    const freshChat = join(chatsDir, 'fresh-ref.jsonl');
    protectedChat = join(chatsDir, 'protected-ref.jsonl');
    writeFileSync(staleChat, '{"type":"user"}\n');
    writeFileSync(freshChat, '{"type":"user"}\n');
    writeFileSync(protectedChat, '{"type":"user"}\n');
    touch(staleChat, STALE_MTIME_MS);
    touch(freshChat, FRESH_MTIME_MS);
    touch(protectedChat, STALE_MTIME_MS);
    protectFile(protectedChat); // real OS-enforced delete failure

    // ── real reports/<mr>/snapshots/ tree ────────────────────────────────────
    const reportsRoot = join(dir, 'reports');
    const snapshotsDir = join(reportsRoot, 'group%2Fproj!42', 'snapshots');
    mkdirSync(snapshotsDir, { recursive: true });
    const staleSnapshot = join(snapshotsDir, 'old.json');
    const freshSnapshot = join(snapshotsDir, 'new.json');
    protectedSnapshot = join(snapshotsDir, 'locked.json');
    writeFileSync(staleSnapshot, '{}\n');
    writeFileSync(freshSnapshot, '{}\n');
    writeFileSync(protectedSnapshot, '{}\n');
    touch(staleSnapshot, STALE_MTIME_MS);
    touch(freshSnapshot, FRESH_MTIME_MS);
    touch(protectedSnapshot, STALE_MTIME_MS);
    protectFile(protectedSnapshot);

    // ── real sweep, real fs, no mocks ────────────────────────────────────────
    const removedChats = gcStaleChats(chatsDir, TTL_MS, NOW_MS);
    const removedSnapshots = gcStaleSnapshots(reportsRoot, TTL_MS, NOW_MS);

    // gcStaleChats: stale removed, fresh kept, protected survives (real EPERM swallowed)
    assert.deepStrictEqual(removedChats, [staleChat]);
    assert.ok(!existsSync(staleChat), 'stale transcript should be really deleted from disk');
    assert.ok(existsSync(freshChat), 'fresh transcript should really remain on disk');
    assert.ok(
      existsSync(protectedChat),
      'immutable transcript should survive a real delete failure without blocking the sweep'
    );

    // gcStaleSnapshots: stale removed, fresh kept, protected survives (real EPERM swallowed)
    assert.deepStrictEqual(removedSnapshots, [staleSnapshot]);
    assert.ok(!existsSync(staleSnapshot), 'stale snapshot should be really deleted from disk');
    assert.ok(existsSync(freshSnapshot), 'fresh snapshot should really remain on disk');
    assert.ok(
      existsSync(protectedSnapshot),
      'immutable snapshot should survive a real delete failure without blocking the sweep'
    );
  });
});
