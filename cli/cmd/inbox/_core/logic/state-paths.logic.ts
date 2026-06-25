// @file: Resolve the gennady state directory and its sub-paths (single --state-dir override).
// @consumers: inbox.cmd, vcs-worktree.cmd
// @tasks: N/A

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

/** @purpose repos.json path under the state dir. */
export const reposMapPath = (stateDir: string): string => join(stateDir, 'repos.json');
