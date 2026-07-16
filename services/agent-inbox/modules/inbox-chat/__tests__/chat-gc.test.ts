// @file: Unit tests for ChatGc — TTL sweep for chats/*.jsonl transcripts and
//   reports/<mr>/snapshots/* undo-snapshots (mirrors gcStaleWorktrees/gcStaleReports).
// @consumers: node:test runner
// @tasks: TSK-128

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  rmSync,
  utimesSync,
} from 'node:fs';
import { join } from 'node:path';
import { makeTestTmpDir, cleanupTestTmp } from '../../inbox-core/test-support/test-tmp.ts';

// ── Mock state — rmSync fails for one designated path, real otherwise ──────────

let rmSyncFailPath: string | null = null;

const mockRmSync = mock.fn((path: string, opts?: { force?: boolean; recursive?: boolean }) => {
  if (path === rmSyncFailPath) {
    throw Object.assign(new Error('simulated EACCES on delete'), { code: 'EACCES' });
  }
  return rmSync(path, opts);
});

mock.module('node:fs', {
  namedExports: { existsSync, readdirSync, statSync, rmSync: mockRmSync },
});

// ── Import SUT after mocks ──────────────────────────────────────────────────────

const { gcStaleChats, gcStaleSnapshots } = await import('../chat-gc.ts');

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 168h, per D-105
const NOW_MS = Date.parse('2026-07-15T12:00:00.000Z');
const STALE_MTIME_MS = NOW_MS - TTL_MS - 60_000; // just past TTL
const FRESH_MTIME_MS = NOW_MS - 60_000; // well within TTL

function touch(path: string, mtimeMs: number): void {
  const seconds = mtimeMs / 1000;
  utimesSync(path, seconds, seconds);
}

let dir: string;

beforeEach(() => {
  dir = makeTestTmpDir('chat-gc-');
  rmSyncFailPath = null;
  mockRmSync.mock.resetCalls();
});

afterEach(() => {
  cleanupTestTmp(dir);
});

// ── contract ──────────────────────────────────────────────────────────────────

describe('ChatGc contract', () => {
  it('gcStaleChats and gcStaleSnapshots both take (root, ttlMs, nowMs) and return string[]', () => {
    const removedChats: string[] = gcStaleChats(join(dir, 'chats'), TTL_MS, NOW_MS);
    const removedSnapshots: string[] = gcStaleSnapshots(join(dir, 'reports'), TTL_MS, NOW_MS);

    assert.ok(Array.isArray(removedChats));
    assert.ok(Array.isArray(removedSnapshots));
  });
});

// ── gcStaleChats ──────────────────────────────────────────────────────────────

describe('gcStaleChats', () => {
  it('should remove transcript files older than ttlMs and keep fresh ones', () => {
    const chatsDir = join(dir, 'chats');
    mkdirSync(chatsDir);
    const stale = join(chatsDir, 'a.jsonl');
    const fresh = join(chatsDir, 'b.jsonl');
    writeFileSync(stale, '{}\n');
    writeFileSync(fresh, '{}\n');
    touch(stale, STALE_MTIME_MS);
    touch(fresh, FRESH_MTIME_MS);

    const removed = gcStaleChats(chatsDir, TTL_MS, NOW_MS);

    assert.deepStrictEqual(removed, [stale]);
    assert.ok(!existsSync(stale), 'stale transcript should be removed');
    assert.ok(existsSync(fresh), 'fresh transcript should remain');
  });

  it('should return an empty array without throwing when the chats dir is absent', () => {
    const removed = gcStaleChats(join(dir, 'chats'), TTL_MS, NOW_MS);
    assert.deepStrictEqual(removed, []);
  });
});

// ── gcStaleSnapshots ──────────────────────────────────────────────────────────

describe('gcStaleSnapshots', () => {
  it('should remove stale snapshot files under <mr>/snapshots/ and keep fresh ones', () => {
    const snapshotsDir = join(dir, 'group%2Fproj!42', 'snapshots');
    mkdirSync(snapshotsDir, { recursive: true });
    const stale = join(snapshotsDir, 'old.json');
    const fresh = join(snapshotsDir, 'new.json');
    writeFileSync(stale, '{}\n');
    writeFileSync(fresh, '{}\n');
    touch(stale, STALE_MTIME_MS);
    touch(fresh, FRESH_MTIME_MS);

    const removed = gcStaleSnapshots(dir, TTL_MS, NOW_MS);

    assert.deepStrictEqual(removed, [stale]);
    assert.ok(!existsSync(stale), 'stale snapshot should be removed');
    assert.ok(existsSync(fresh), 'fresh snapshot should remain');
  });

  it('should return an empty array without throwing when the reports root is absent', () => {
    const removed = gcStaleSnapshots(join(dir, 'reports'), TTL_MS, NOW_MS);
    assert.deepStrictEqual(removed, []);
  });
});

// ── best-effort on a single delete error ─────────────────────────────────────

describe('best-effort delete error handling', () => {
  it('gcStaleChats should keep sweeping remaining stale files when one delete fails', () => {
    const chatsDir = join(dir, 'chats');
    mkdirSync(chatsDir);
    const broken = join(chatsDir, 'broken.jsonl');
    const other = join(chatsDir, 'other.jsonl');
    writeFileSync(broken, '{}\n');
    writeFileSync(other, '{}\n');
    touch(broken, STALE_MTIME_MS);
    touch(other, STALE_MTIME_MS);
    rmSyncFailPath = broken;

    const removed = gcStaleChats(chatsDir, TTL_MS, NOW_MS);

    assert.deepStrictEqual(removed, [other]);
    assert.ok(existsSync(broken), 'file whose delete failed must survive, not block the sweep');
  });

  it('gcStaleSnapshots should keep sweeping remaining stale files when one delete fails', () => {
    const snapshotsDir = join(dir, 'mr-1', 'snapshots');
    mkdirSync(snapshotsDir, { recursive: true });
    const broken = join(snapshotsDir, 'broken.json');
    const other = join(snapshotsDir, 'other.json');
    writeFileSync(broken, '{}\n');
    writeFileSync(other, '{}\n');
    touch(broken, STALE_MTIME_MS);
    touch(other, STALE_MTIME_MS);
    rmSyncFailPath = broken;

    const removed = gcStaleSnapshots(dir, TTL_MS, NOW_MS);

    assert.deepStrictEqual(removed, [other]);
    assert.ok(existsSync(broken), 'file whose delete failed must survive, not block the sweep');
  });
});
