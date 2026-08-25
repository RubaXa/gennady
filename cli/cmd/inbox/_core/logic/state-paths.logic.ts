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

/** @purpose Clones cache under the state dir. */
export const clonesRoot = (stateDir: string): string => join(stateDir, 'clones');

/** @purpose Config file path under the state dir (agent-inbox/config.json). */
export const configPath = (stateDir: string): string =>
  join(stateDir, 'agent-inbox', 'config.json');

/** @purpose repos.json path under the state dir. */
export const reposMapPath = (stateDir: string): string => join(stateDir, 'repos.json');

/** @purpose Report TTL — reports GC like worktrees: 7 days from last access (TSK-106). */
export const REPORTS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @purpose Convert supported MR references to the host-free `project!iid` identity used across storage, queues, boards, feeds, and artifacts.
 * @param ref Any MR reference form.
 * @returns Canonical `project!iid` key.
 */
export function canonicalMrRef(ref: string): string {
  const trimmed = ref.trim();
  if (!trimmed) return trimmed;

  // Full web URL — parse pathname to extract repository + iid (host is dropped).
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      const pathname = new URL(trimmed).pathname.replace(/\/+$/, '');
      const gitlab = pathname.match(/^\/(.+?)\/-\/merge_requests\/(\d+)$/);
      if (gitlab) return `${gitlab[1]}!${gitlab[2]}`;
      const github = pathname.match(/^\/(.+?)\/pull\/(\d+)$/);
      if (github) return `${github[1]}!${github[2]}`;
    } catch {
      /* not a parseable URL — fall through to composite handling */
    }
  }

  // Composite `project!iid` (optionally host-prefixed `host/project!iid`).
  const bang = trimmed.lastIndexOf('!');
  if (bang === -1) return trimmed;
  const project = trimmed.slice(0, bang);
  const iid = trimmed.slice(bang + 1);
  const segments = project.split('/');
  if (segments.length > 1 && segments[0].includes('.')) segments.shift();
  return `${segments.join('/')}!${iid}`;
}

/**
 * @purpose Stable per-MR directory-name key, flat (`/` → `__`) so it is a single path segment.
 * @invariant Does not canonicalize; callers normalize first, while disk scans retain raw refs for legacy mapping.
 * @param ref MR reference `group/project!iid`.
 * @returns `<group__proj>-<iid>`.
 */
export function mrKey(ref: string): string {
  const sep = ref.lastIndexOf('!');
  const project = sep === -1 ? ref : ref.slice(0, sep);
  const iid = sep === -1 ? '' : ref.slice(sep + 1);
  return `${project.replace(/\//g, '__')}-${iid}`;
}

/** @purpose Root of every per-MR dir — shared parent holding `worktree/`+`report/` (TSK-131). */
export const mrsRoot = (stateDir: string): string => join(stateDir, 'agent-inbox', 'mrs');

/** @purpose Per-MR shared parent directory — `<mrsRoot>/<key>`, sandbox boundary for its sessions. */
export const mrRoot = (stateDir: string, ref: string): string =>
  join(mrsRoot(stateDir), mrKey(ref));

/** @purpose Per-MR worktree directory — sibling of `mrReportsDir` under the same `mrRoot`. */
export const mrWorktreeDir = (stateDir: string, ref: string): string =>
  join(mrRoot(stateDir, ref), 'worktree');

/**
 * @purpose Per-MR report directory for the review-document pipeline.
 * @invariant One dir per MR, iterated in place across visits; sibling of `mrWorktreeDir`.
 * @param stateDir Gennady state root.
 * @param ref MR reference `group/project!iid`.
 * @returns Absolute path `<mrRoot>/report`.
 * @consumer inbox-review-plan.cmd
 */
export function mrReportsDir(stateDir: string, ref: string): string {
  return join(mrRoot(stateDir, ref), 'report');
}

/**
 * @purpose GC: remove per-MR `report/` dirs under `mrsRoot` whose mtime is older than `ttlMs`.
 * @invariant Same idea as `gcStaleWorktrees` — best-effort, mtime-based, skips non-directories;
 *   targets the `report/` child of each `<mrsRoot>/<key>/`, leaving a sibling `worktree/` untouched.
 * @param root MRs root (`mrsRoot`).
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
    const path = join(root, name, 'report');
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
