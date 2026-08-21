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
  /**
   * @purpose Porcelain status vs the baseline; environment links are excluded.
   * @returns Trimmed porcelain lines; empty when clean.
   */
  drift(): string;
  /** @purpose Restore the replica to its baseline commit (after drift or a violation). */
  reset(): void;
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
 * @param [links] Ignored paths symlinked into the replica — stack execution environment,
 *   not tree state (node_modules); invisible to `git status`, so drift stays content-exact.
 * @returns The replica, or an error message when it cannot be created (e.g. no commits yet).
 * @sideEffect IO/Process: creates a temp worktree; runs git.
 */
export function createTreeReplica(
  repoRoot: string,
  links: readonly string[] = []
): { replica?: TreeReplica; error?: string } {
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

    // Environment links come after the baseline: they are ignored paths, so they
    // never enter the baseline commit and never appear in the drift status.
    materializeLinks(repoRoot, dir, links);

    // A `dir/`-style ignore pattern does not match a symlink, so the links are
    // excluded from the drift pathspec explicitly.
    const drift = (): string => {
      const exclusions = links.map((link) => `:(exclude)${link}`);
      return git(['status', '--porcelain', '--', '.', ...exclusions], dir).trim();
    };

    const reset = (): void => {
      git(['reset', '--hard', '--quiet'], dir);
      // -fd (not -fdx): untracked leftovers go, ignored paths survive; links are
      // re-created if the reset swept them away.
      git(['clean', '-fdq'], dir);
      materializeLinks(repoRoot, dir, links);
    };

    return { replica: { dir, drift, reset, cleanup } };
  } catch (cause) {
    cleanup();
    return { error: `cannot create tree replica: ${(cause as Error).message}` };
  }
}

/**
 * @purpose Symlink each declared path into the replica.
 * @invariant A nested link needs its parent created first: an ignored parent is absent from the
 *   replica, and the raw ENOENT aborted the whole replica.
 * @invariant One unusable link never aborts the replica: aborting dropped every gate into the
 *   real tree, losing observe-only for the whole run.
 * @param repoRoot Real repository root the links point at.
 * @param dir Replica directory.
 * @param links Repo-relative paths to link.
 * @sideEffect Filesystem: creates directories and symlinks inside the replica.
 */
function materializeLinks(repoRoot: string, dir: string, links: readonly string[]): void {
  for (const link of links) {
    const target = path.join(repoRoot, link);
    const dest = path.join(dir, link);
    if (!fs.existsSync(target) || fs.existsSync(dest)) {
      continue;
    }
    // Containment is checked here, not at config load: only here does the target exist, so a
    // path that is itself a symlink out of the repository can be resolved and refused.
    try {
      const realTarget = fs.realpathSync(target);
      const realRoot = fs.realpathSync(repoRoot);
      if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep)) {
        continue;
      }
    } catch {
      continue;
    }
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.symlinkSync(target, dest);
    } catch {
      // Surfaced by whichever gate misses the path, not by killing the replica for every gate.
    }
  }
}
