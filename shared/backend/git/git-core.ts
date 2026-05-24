// @file: Describe origin remote repository data (host, project, scheme).
// @consumers: build-review-context-git.logic, commit-gen, resolve-conflicts-context-git-build.logic, resolve-conflicts-context-git.type, review-context-git.type, review.cmd, vcs-reply.cmd
// @tasks: N/A

import { parseGitDiff, type ParsedDiffFile } from './git-diff.ts';
import { execSyncSafe } from '../../common/exec.ts';
import { isTestFile } from '../../common/files.ts';
import { logger } from '../../common/logger.ts';

/**
 * @purpose Describe origin remote repository data (host, project, scheme).
 * @consumer git-core, vcs-client
 */
export type GitRemoteInfo = {
  /** @purpose Git host domain (e.g. github.com). */
  host: string;
  /** @purpose Repository path on the host (e.g. owner/repo). */
  project: string;
  /** @purpose URL scheme used for origin remote (http, https, ssh). */
  scheme: string;
};

/**
 * @purpose Aggregated diff information: raw text, parsed files, token and commit metrics.
 * @consumer commit-gen, review-gen, ai-legacy
 */
export type GitDiffInfo = {
  /** @purpose Raw git diff text output. */
  diff: string;
  /** @purpose All parsed diff files sorted by token count ascending. */
  parsedDiff: ParsedDiffFile[];
  /** @purpose Code/config files only, excluding tests, deleted and renamed. */
  parsedCodeDiff: ParsedDiffFile[];
  /** @purpose Total token count across parsed code diff files. */
  parsedCodeTokens: number;
  /** @purpose Token count of the largest code file chunk. */
  parsedCodeChunkMaxTokens: number;
  /** @purpose Unique programming languages detected across code diff files. */
  programmingLanguages: (string | undefined)[];
  /** @purpose Number of commits on top of base branch. */
  commitCount: number;
};

/**
 * @purpose Determine the base branch (main or master) for diff analysis.
 * @sideEffect Process: executes git branch.
 */
export const detectGitBaseBranch = (): string => {
  const branchesOutput = execSyncSafe('git branch --list 2>/dev/null');
  const match = branchesOutput?.match(/\s*\*?\s*(master|main)$/m);
  return match?.[1] ?? 'master';
};

/**
 * @purpose Get current Git branch name.
 * @sideEffect Process: executes git rev-parse.
 */
export const getGitCurrentBranch = (): string => {
  const branch = execSyncSafe('git rev-parse --abbrev-ref HEAD 2>/dev/null').trim();
  return branch || 'HEAD';
};

/**
 * @purpose Get origin remote repository info.
 * @sideEffect Process: executes git config / git remote.
 */
export const getGitRemote = (): GitRemoteInfo | null => {
  const remote =
    execSyncSafe('git config --get remote.origin.url 2>/dev/null').trim() ||
    execSyncSafe('git remote get-url origin 2>/dev/null').trim();

  const url = (remote || '').trim();
  if (!url) return null;

  if (/^[a-z]+:\/\//i.test(url)) {
    try {
      const u = new URL(url);
      const host = (u.hostname || '').toLowerCase();
      const scheme = (u.protocol || '').replace(/:$/, '').toLowerCase();
      const project = (u.pathname || '').replace(/^\/+/, '').replace(/\.git$/i, '');
      if (!host || !project) return null;
      return { host, project, scheme };
    } catch (cause) {
      logger.debug(`[getGitRemote] [parsing → skip] URL parse failed`, { cause });
    }
  }

  const scp = url.match(/^[\w.-]+@([^:\/]+)[:\/](.+)$/);
  if (scp) {
    const host = (scp[1] || '').toLowerCase();
    const project = (scp[2] || '').replace(/^\/+/, '').replace(/\.git$/i, '');
    const scheme = 'ssh';
    if (!host || !project) return null;
    return { host, project, scheme };
  }

  return null;
};

/**
 * @purpose Count commits on top of the base branch.
 * @sideEffect Process: executes git rev-list.
 */
export const getGitCommitCount = (): number => {
  try {
    const output = execSyncSafe(`git rev-list --count HEAD ^${detectGitBaseBranch()} 2>/dev/null`);
    return parseInt(output, 10) || 0;
  } catch (cause) {
    logger.debug(`[getGitCommitCount] [counting → fallback] Using 0`, { cause });
    return 0;
  }
};

/**
 * @purpose Get textual diff of current state against target.
 * @sideEffect Process: executes git diff.
 */
export const getGitDiff = (targetBranch?: string): string => {
  if (targetBranch) {
    return execSyncSafe(`git diff ${targetBranch}`);
  }
  return execSyncSafe('git diff HEAD');
};

/**
 * @purpose Build aggregated diff info for further analysis/ranking.
 * @sideEffect Process: calls getGitDiff and getGitCommitCount (git commands).
 */
export const getGitDiffInfo = (branch?: string): GitDiffInfo => {
  const diff = getGitDiff(branch);
  const parsedDiff = parseGitDiff(diff).sort((a, b) => a.tokens - b.tokens);
  const parsedCodeDiff = parsedDiff.filter(
    (f) =>
      !f.isDeleted &&
      !f.isRenamed &&
      !isTestFile(f.filename) &&
      (f.category === 'config' || f.programmingLanguage)
  );

  if (!parsedCodeDiff.length) {
    parsedCodeDiff.push(
      ...parsedDiff.filter(
        (f) => !f.isDeleted && !f.isRenamed && (f.category === 'doc' || isTestFile(f.filename))
      )
    );
  }

  const parsedCodeTokens = parsedCodeDiff.reduce((sum, file) => sum + file.tokens, 0);
  const parsedCodeChunkMaxTokens = parsedCodeDiff.at(-1)?.tokens ?? 0;
  const programmingLanguages = [
    ...new Set(parsedCodeDiff.map((f) => f.programmingLanguage).filter(Boolean)),
  ];

  return {
    diff,
    parsedDiff,
    parsedCodeDiff,
    parsedCodeTokens,
    parsedCodeChunkMaxTokens,
    programmingLanguages,
    commitCount: getGitCommitCount(),
  };
};
