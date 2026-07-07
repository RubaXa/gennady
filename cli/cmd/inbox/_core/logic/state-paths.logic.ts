// @file: Resolve the gennady state directory and its sub-paths (single --state-dir override).
// @consumers: inbox.cmd, vcs-worktree.cmd, inbox-review-plan.cmd
// @tasks: TSK-90, TSK-103

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

/**
 * @purpose Per-MR, per-head report directory for the review-document pipeline.
 * @invariant Naming mirrors worktrees (`vcs-worktree.cmd`): `/` → `__`; also keyed by `headSha`
 *   first 7 chars so a new head gets a fresh, non-colliding tree.
 * @param stateDir Gennady state root.
 * @param ref MR reference `group/project!iid`.
 * @param headSha Resolved MR head SHA; only the first 7 chars name the directory.
 * @returns Absolute path `<reportsRoot>/<group__proj-iid>/<headSha7>`.
 * @consumer inbox-review-plan.cmd
 */
export function mrReportsDir(stateDir: string, ref: string, headSha: string): string {
  const sep = ref.lastIndexOf('!');
  const project = sep === -1 ? ref : ref.slice(0, sep);
  const iid = sep === -1 ? '' : ref.slice(sep + 1);
  return join(reportsRoot(stateDir), `${project.replace(/\//g, '__')}-${iid}`, headSha.slice(0, 7));
}
