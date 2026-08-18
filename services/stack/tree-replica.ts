// @file: Ephemeral working-tree replica for sandboxed gates — worktree + uncommitted + untracked.
// @consumers: gate-runner
// @tasks: TSK-95

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * @purpose A materialized replica of the working tree, baselined so drift is content-exact.
 * @consumer gate-runner
 */
export type TreeReplica = {
  /** @purpose Absolute directory of the replica checkout. */
  readonly dir: string;
  /** @purpose Remove the replica worktree and its temp directory. */
  cleanup(): void;
};

/**
 * @purpose Run git with argv; throws on failure (callers translate into env-fail).
 * @param args Git arguments.
 * @param cwd Working directory.
 * @param input Optional stdin payload.
 * @returns Raw stdout.
 */
function git(args: readonly string[], cwd: string, input?: string): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf-8',
    input,
    stdio: [input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  });
}

/**
 * @purpose Ephemeral working-tree replica: detached worktree + uncommitted diff + untracked
 *   files, baselined by a replica-local commit — later `git status` is exactly the drift.
 * @invariant The real tree is never written; the replica's baseline commit exists only there.
 * @param repoRoot Absolute git toplevel of the repository to replicate.
 * @returns The replica, or an error message when it cannot be created (e.g. no commits yet).
 * @sideEffect IO/Process: creates a temp worktree; runs git.
 */
export function createTreeReplica(repoRoot: string): { replica?: TreeReplica; error?: string } {
  try {
    git(['rev-parse', '--verify', '--quiet', 'HEAD'], repoRoot);
  } catch {
    return { error: 'repository has no commits — a sandboxed gate needs a HEAD to replicate' };
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gennady-replica-'));
  const dir = path.join(tmp, 'tree');

  const cleanup = (): void => {
    try {
      git(['worktree', 'remove', '--force', dir], repoRoot);
    } catch {
      // The temp dir removal below still reclaims the space; prune drops the record.
    }
    try {
      git(['worktree', 'prune'], repoRoot);
    } catch {
      // Best-effort.
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  };

  try {
    git(['worktree', 'add', '--detach', '--quiet', dir, 'HEAD'], repoRoot);

    // #region START_REPLICATE_WORKING_STATE — uncommitted diff + untracked files
    const diff = git(['diff', 'HEAD', '--binary'], repoRoot);
    if (diff.length > 0) {
      git(['apply', '--whitespace=nowarn'], dir, diff);
    }

    const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'], repoRoot)
      .split('\0')
      .filter((entry) => entry.length > 0);
    for (const relative of untracked) {
      const target = path.join(dir, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(repoRoot, relative), target);
    }
    // #endregion END_REPLICATE_WORKING_STATE

    // Baseline commit: drift detection becomes content-exact even for files the
    // agent had already edited before the sandboxed command ran.
    git(['add', '-A'], dir);
    git(
      [
        '-c',
        'user.email=sandbox@gennady',
        '-c',
        'user.name=gennady-sandbox',
        'commit',
        '--quiet',
        '--no-verify',
        '--allow-empty',
        '-m',
        'baseline',
      ],
      dir
    );

    return { replica: { dir, cleanup } };
  } catch (cause) {
    cleanup();
    return { error: `cannot create tree replica: ${(cause as Error).message}` };
  }
}
