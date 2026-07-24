// @file: git-fixture — real temp git repo builder for tests that classify HEAD movement
//   (fast_forward / rewritten) without network access or mocked git.
// @consumers: utils/test/__tests__/git-fixture.test.ts, TSK-148, TSK-149
// @tasks: TSK-147

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

/** @purpose Flat file map for a fixture commit | @invariant Key is a path relative to the repo root; value is the full file content */
export type GitFixtureFiles = Record<string, string>;

/** @purpose Shape of the fixture's second (head) commit. */
export type GitFixtureOptions = {
  /** @purpose Files changed/added in the head commit | @invariant Merged over the base file set; omit for an unchanged head commit */
  change?: GitFixtureFiles;
  /** @purpose Build head on an orphan branch so base is not an ancestor, simulating a force-push rewrite */
  rewritten?: boolean;
};

/** @purpose Handle to a live temp git repo/worktree for a test | @invariant `worktreePath` stays valid until `cleanup()` runs */
export type GitFixture = {
  /** @purpose Absolute path to the temp repo working tree */
  worktreePath: string;
  /** @purpose SHA of the first (base) commit */
  baseSha: string;
  /** @purpose SHA of the second (head) commit */
  headSha: string;
  /** @purpose Removes the temp working tree | @invariant Idempotent — a second call is a no-op, never throws */
  cleanup: () => void;
};

/**
 * @purpose Run a git subcommand in the fixture repo and return trimmed stdout.
 * @param args Git subcommand and arguments.
 * @param cwd Repo working directory.
 * @returns Trimmed stdout.
 * @throws When the git process exits non-zero.
 * @sideEffect Spawns a git subprocess; no network (fixture repo has no remote).
 */
function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

/**
 * @purpose Write a flat file map into the working tree, creating parent directories as needed.
 * @param root Repo working directory.
 * @param files Path → content map.
 * @sideEffect Writes files to disk under `root`.
 */
function writeFixtureFiles(root: string, files: GitFixtureFiles): void {
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(root, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, 'utf8');
  }
}

/**
 * @purpose Build a real temp git repo with a base and a head commit, for genuine
 *   `fast_forward`/`rewritten` classification — no network, no mocked git.
 * @invariant Git identity (`user.email`/`user.name`) is configured locally in the fixture repo
 *   only; never touches the operator's global git config.
 * @param files Base commit file set — must be non-empty (git refuses an empty initial commit)
 * @param [opts] Head-commit shape; see `GitFixtureOptions`
 * @returns `{ worktreePath, baseSha, headSha, cleanup }`; `baseSha !== headSha`
 * @sideEffect Creates a temp directory under the OS temp root and initializes git inside it.
 */
export function createGitFixture(files: GitFixtureFiles, opts: GitFixtureOptions = {}): GitFixture {
  const worktreePath = mkdtempSync(join(tmpdir(), 'git-fixture-'));

  git(['init', '--quiet'], worktreePath);
  git(['config', 'user.email', 'fixture@example.test'], worktreePath);
  git(['config', 'user.name', 'Git Fixture'], worktreePath);
  git(['config', 'commit.gpgsign', 'false'], worktreePath);

  writeFixtureFiles(worktreePath, files);
  git(['add', '-A'], worktreePath);
  git(['commit', '--quiet', '-m', 'base'], worktreePath);
  const baseSha = git(['rev-parse', 'HEAD'], worktreePath);

  // #region START_BUILD_REWRITTEN_HISTORY — invariant: rewritten head must NOT descend from baseSha
  if (opts.rewritten) {
    git(['checkout', '--quiet', '--orphan', 'rewritten'], worktreePath);
    git(['rm', '--quiet', '-rf', '.'], worktreePath);
    writeFixtureFiles(worktreePath, opts.change ?? files);
    git(['add', '-A'], worktreePath);
    git(['commit', '--quiet', '-m', 'rewritten head'], worktreePath);
  } else {
    writeFixtureFiles(worktreePath, opts.change ?? {});
    git(['add', '-A'], worktreePath);
    git(['commit', '--quiet', '--allow-empty', '-m', 'head'], worktreePath);
  }
  // #endregion END_BUILD_REWRITTEN_HISTORY

  const headSha = git(['rev-parse', 'HEAD'], worktreePath);

  return {
    worktreePath,
    baseSha,
    headSha,
    cleanup: () => {
      rmSync(worktreePath, { recursive: true, force: true });
    },
  };
}
