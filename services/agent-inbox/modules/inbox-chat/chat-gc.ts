// @file: ChatGc — TTL sweep for per-MR chat artifacts (chats/*.jsonl, reports/<mr>/snapshots/*), same 7d/168h mtime pattern as gcStaleWorktrees/gcStaleReports (D-105). One bad file never blocks the rest.
// @consumers: serve bootstrap/poll cycle, inbox --reset CLI (wiring open — see TSK-128 Handoff)
// @tasks: TSK-128

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @purpose GC: remove stale chat transcript files (`chats/<ref>.jsonl`) under `root` whose mtime
 * is older than `ttlMs`.
 * @invariant Same idea as `gcStaleWorktrees`/`gcStaleReports` — best-effort, mtime-based; skips
 * non-files; an error deleting one file never blocks the sweep of the rest.
 * @invariant Missing `root` degrades to an empty result, never an error — symmetric with
 * `gcStaleReports` on a missing reports root.
 * @param root Chats directory (`<state-dir>/agent-inbox/chats`).
 * @param ttlMs Max age in ms before a transcript file is stale.
 * @param nowMs Current time in ms (injected for testability).
 * @returns Paths that were removed.
 * @sideEffect FS: removes stale `.jsonl` files.
 */
export function gcStaleChats(root: string, ttlMs: number, nowMs: number): string[] {
  if (!existsSync(root)) return [];
  const removed: string[] = [];

  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return [];
  }

  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue;
    const path = join(root, name);
    let mtimeMs: number;
    try {
      const st = statSync(path);
      if (!st.isFile()) continue;
      mtimeMs = st.mtimeMs;
    } catch {
      continue;
    }
    if (nowMs - mtimeMs > ttlMs) {
      try {
        rmSync(path, { force: true });
        removed.push(path);
      } catch {
        // best-effort: a locked/undeletable transcript file must not block the rest of the sweep
      }
    }
  }
  return removed;
}

/**
 * @purpose GC: remove stale undo-snapshot files (`reports/<mr>/snapshots/*`) under `root` whose
 * mtime is older than `ttlMs`. Walks every `<mr>` subdirectory of `root`, then its `snapshots/`
 * subdirectory.
 * @invariant Same idea as `gcStaleReports` — best-effort, mtime-based; skips non-files; one
 * file's delete error never blocks the rest of the sweep, nor other `<mr>` dirs.
 * @invariant Missing `root`, a missing `<mr>` dir, or a missing `snapshots/` subdir all degrade to
 * an empty/skipped result, never an error.
 * @param root Reports root (e.g. `mrReportsDir`'s parent), parent of every `<mr>/snapshots/` dir.
 * @param ttlMs Max age in ms before a snapshot file is stale.
 * @param nowMs Current time in ms (injected for testability).
 * @returns Paths that were removed.
 * @sideEffect FS: removes stale snapshot files.
 */
export function gcStaleSnapshots(root: string, ttlMs: number, nowMs: number): string[] {
  if (!existsSync(root)) return [];
  const removed: string[] = [];

  let mrNames: string[];
  try {
    mrNames = readdirSync(root);
  } catch {
    return [];
  }

  for (const mrName of mrNames) {
    const snapshotsDir = join(root, mrName, 'snapshots');
    if (!existsSync(snapshotsDir)) continue;

    let fileNames: string[];
    try {
      fileNames = readdirSync(snapshotsDir);
    } catch {
      continue;
    }

    for (const name of fileNames) {
      const path = join(snapshotsDir, name);
      let mtimeMs: number;
      try {
        const st = statSync(path);
        if (!st.isFile()) continue;
        mtimeMs = st.mtimeMs;
      } catch {
        continue;
      }
      if (nowMs - mtimeMs > ttlMs) {
        try {
          rmSync(path, { force: true });
          removed.push(path);
        } catch {
          // best-effort: a locked/undeletable snapshot file must not block the rest of the sweep
        }
      }
    }
  }
  return removed;
}
