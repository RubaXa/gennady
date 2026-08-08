// @file: MR resolver — URL parsing, metadata retrieval, worktree management, git diff operations.
// @consumers: mr-stats.cmd
// @tasks: TSK-139

import { execFileSync } from 'node:child_process';
import { parseVcsUrl } from '../vcs-client/parse-vcs-url.ts';
import {
  prepareMrWorktree,
  removeWorktreeAt,
} from '../../cli/cmd/vcs-worktree/_core/logic/worktree-ops.logic.ts';
import { ensureClone } from '../../cli/cmd/vcs-worktree/_core/logic/locate-clone.logic.ts';
import {
  resolveStateDir,
  mrsRoot,
  mrWorktreeDir,
  clonesRoot,
  reposMapPath,
} from '../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import { resolveVcsContext } from '../../cli/cmd/_shared/vcs-context-resolver.ts';
import type { VcsCliArgs } from '../../cli/cmd/_shared/vcs-context-resolver.ts';
import type { VcsGitlabClient } from '../vcs-client/gitlab/vcs-gitlab-client.ts';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { logger } from '#logger';
import type { MrMetadata } from './mr-stats.types.ts';

/**
 * @purpose Validate that a URL is a GitLab MR URL and extract the parsed VcsUrl.
 * @param url Raw URL string from CLI arguments.
 * @returns Parsed VcsUrl or null when not a valid GitLab MR URL.
 */
export function parseMrUrl(
  url: string
): import('../vcs-client/entities/vcs-url.type.ts').VcsUrl | null {
  const parsed = parseVcsUrl(url);
  if (!parsed || parsed.provider !== 'gitlab') return null;
  return parsed;
}

/**
 * @purpose Resolve VCS context from a GitLab MR URL.
 * @param url GitLab MR web URL.
 * @throws {VcsResolveError} On invalid URL or missing GitLab token.
 * @returns Resolved VCS context for API calls.
 */
export async function resolveMrContext(url: string): Promise<ReturnType<typeof resolveVcsContext>> {
  const vcsCliArgs: VcsCliArgs = { url };
  return resolveVcsContext(vcsCliArgs);
}

/**
 * @purpose Retrieve MR metadata from GitLab API and build MrMetadata.
 * @param client GitLab API client.
 * @param project Project path (group/repo).
 * @param iid MR internal ID.
 * @returns MrMetadata or null when MR is not found (404).
 */
export async function retrieveMrMetadata(
  client: VcsGitlabClient,
  project: string,
  iid: number
): Promise<MrMetadata | null> {
  const mr = (await client.MergeRequests.getByIid({ project, iid: String(iid) })) as {
    iid?: number;
    title?: string;
    source_branch?: string;
    target_branch?: string;
    merged_at?: string;
    author?: { username?: string };
    diff_refs?: { base_sha?: string; start_sha?: string; head_sha?: string };
  } | null;

  if (!mr) {
    logger.warn(`[retrieveMrMetadata] MR !${iid}: source branch deleted or MR not merged`);
    return null;
  }

  return {
    iid: `!${iid}`,
    title: mr.title ?? '',
    project,
    sourceBranch: mr.source_branch ?? '',
    targetBranch: mr.target_branch ?? '',
    mergedAt: mr.merged_at ?? '',
    author: mr.author?.username ?? '',
    diffRefsBaseSha: mr.diff_refs?.base_sha ?? '',
  };
}

/**
 * @purpose Locate or clone the target repository, then prepare a read-only worktree for the MR.
 * @param project GitLab project path (group/repo).
 * @param host GitLab host.
 * @param token GitLab personal access token.
 * @param iid MR internal ID.
 * @returns Worktree path and head SHA.
 * @sideEffect FS + network: may clone repo; creates worktree.
 */
export async function resolveWorktreePath(
  project: string,
  host: string,
  token: string,
  iid: number
): Promise<{ clonePath: string; worktreePath: string; headSha: string }> {
  const stateDir = resolveStateDir([]);
  const reposBase = join(homedir(), 'Developer');

  const clonePath = await ensureClone(project, host, token, {
    reposBase,
    reposMapPath: reposMapPath(stateDir),
    clonesRoot: clonesRoot(stateDir),
  });

  const ref = `${project}!${iid}`;
  const root = mrsRoot(stateDir);
  mkdirSync(root, { recursive: true });
  const worktreeDir = mrWorktreeDir(stateDir, ref);

  const { worktreePath: resolvedPath, headSha } = await prepareMrWorktree(
    clonePath,
    String(iid),
    worktreeDir
  );

  return { clonePath, worktreePath: resolvedPath, headSha };
}

/**
 * @purpose Clean up a worktree — remove the directory and prune git metadata.
 * @param worktreePath Absolute path to the worktree directory.
 * @returns Resolves when the worktree is cleaned up.
 * @sideEffect FS + git: removes worktree.
 */
export async function removeWorktree(worktreePath: string): Promise<void> {
  await removeWorktreeAt(worktreePath);
}

// #region START_GIT_DIFF_OPS — git diff operations on worktrees

/**
 * @purpose List files changed between base and head in the clone.
 * @param clonePath Path to the local clone.
 * @param baseSha Base commit SHA.
 * @param headSha Head commit SHA.
 * @returns Array of changed file paths (repository-relative).
 */
export function listChangedFiles(clonePath: string, baseSha: string, headSha: string): string[] {
  const output = execFileSync(
    'git',
    ['-C', clonePath, 'diff', '--name-only', `${baseSha}..${headSha}`],
    {
      encoding: 'utf8',
    }
  );
  return output
    .trim()
    .split('\n')
    .filter((f) => f.length > 0);
}

/**
 * @purpose Get per-file added/removed line counts via git diff --numstat.
 * @param clonePath Path to the local clone.
 * @param baseSha Base commit SHA.
 * @param headSha Head commit SHA.
 * @param files List of files to query (empty = all).
 * @returns Array of { file, added, removed } per changed file.
 */
export function diffNumstat(
  clonePath: string,
  baseSha: string,
  headSha: string,
  files: string[]
): Array<{ file: string; added: number; removed: number }> {
  if (files.length === 0) return [];
  const args = ['-C', clonePath, 'diff', '--numstat', `${baseSha}..${headSha}`, '--', ...files];
  const output = execFileSync('git', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  return output
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [added, removed, file] = line.split('\t');
      return {
        file,
        added: added === '-' ? 0 : parseInt(added, 10) || 0,
        removed: removed === '-' ? 0 : parseInt(removed, 10) || 0,
      };
    });
}

// #endregion END_GIT_DIFF_OPS
