// @file: Resolve the gennady state directory and its sub-paths (single --state-dir override).
// @consumers: inbox.cmd, vcs-worktree.cmd, inbox-review-plan.cmd
// @tasks: TSK-90, TSK-103, TSK-106

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * @purpose Resolve the state root: `--state-dir <dir>` if given, else `~/.gennady`.
 * @param argv Raw CLI args.
 * @returns Absolute state directory.
 * @sideEffect Reads HOME for the default.
 * @consumer inbox.cmd, vcs-worktree.cmd
 */
export function resolveStateDir(argv: string[]): string {
  const inline = argv.find((a) => a.startsWith('--state-dir='));
  if (inline) return inline.slice('--state-dir='.length);
  const idx = argv.indexOf('--state-dir');
  if (idx !== -1 && argv[idx + 1]) return argv[idx + 1];
  return join(homedir(), '.gennady');
}

/** @purpose Registry file path under the state dir (inbox-registry.json). */
export const registryPath = (stateDir: string): string => join(stateDir, 'inbox-registry.json');

/** @purpose Drafts output dir under the state dir (inbox-out). */
export const outDir = (stateDir: string): string => join(stateDir, 'inbox-out');

/** @purpose Worktrees root under the state dir. */
export const worktreesRoot = (stateDir: string): string => join(stateDir, 'worktrees');

/** @purpose Clones cache under the state dir. */
export const clonesRoot = (stateDir: string): string => join(stateDir, 'clones');

/** @purpose Config file path under the state dir (agent-inbox/config.json). */
export const configPath = (stateDir: string): string =>
  join(stateDir, 'agent-inbox', 'config.json');

/** @purpose repos.json path under the state dir. */
export const reposMapPath = (stateDir: string): string => join(stateDir, 'repos.json');

/** @purpose Review-report pipeline root under the state dir (agent-inbox/reports). */
export const reportsRoot = (stateDir: string): string => join(stateDir, 'agent-inbox', 'reports');

/** @purpose Report TTL — reports GC like worktrees: 7 days from last access (TSK-106). */
export const REPORTS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @purpose Per-MR report directory (flat) for the review-document pipeline.
 * @invariant Naming mirrors worktrees: `/` → `__`. One dir per MR, iterated in place across visits.
 * @param stateDir Gennady state root.
 * @param ref MR reference `group/project!iid`.
 * @returns Absolute path `<reportsRoot>/<group__proj-iid>`.
 * @consumer inbox-review-plan.cmd
 */
export function mrReportsDir(stateDir: string, ref: string): string {
  const sep = ref.lastIndexOf('!');
  const project = sep === -1 ? ref : ref.slice(0, sep);
  const iid = sep === -1 ? '' : ref.slice(sep + 1);
  return join(reportsRoot(stateDir), `${project.replace(/\//g, '__')}-${iid}`);
}

/**
 * @purpose GC: remove per-MR report dirs under `root` whose mtime is older than `ttlMs`.
 * @invariant Same idea as `gcStaleWorktrees` — best-effort, mtime-based, skips non-directories.
 * @param root Reports root (`reportsRoot`).
 * @param ttlMs Max age in ms before a report dir is stale.
 * @param nowMs Current time in ms (injected for testability).
 * @returns Paths that were removed.
 * @sideEffect FS: removes stale report directories recursively.
 * @consumer inbox.cmd, inbox-context.cmd
 */
export function gcStaleReports(root: string, ttlMs: number, nowMs: number): string[] {
  if (!existsSync(root)) return [];
  const removed: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    let mtimeMs: number;
    try {
      const st = statSync(path);
      if (!st.isDirectory()) continue;
      mtimeMs = st.mtimeMs;
    } catch {
      continue;
    }
    if (nowMs - mtimeMs > ttlMs) {
      try {
        rmSync(path, { recursive: true, force: true });
        removed.push(path);
      } catch {
        // best-effort: a locked/undeletable report dir must not block inbox/inbox-context
      }
    }
  }
  return removed;
}
