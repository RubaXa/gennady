// @file: Locate (or clone) the local repository for a GitLab project.
// @consumers: vcs-worktree.cmd
// @tasks: N/A

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadReposMap, resolveClonePath } from '../../../inbox/_core/logic/repos-map.logic.ts';

/**
 * @purpose Extract the project path (group/.../name) from a git remote URL.
 * @param url Remote URL (ssh `git@host:group/proj.git` or https `https://host/group/proj.git`).
 * @returns Project path without host or `.git`, or null when unrecognized.
 * @consumer findCloneByRemote
 */
export function projectFromRemoteUrl(url: string): string | null {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return null;
  let path: string;
  const ssh = trimmed.match(/^[^@]+@[^:]+:(.+)$/);
  if (ssh) {
    path = ssh[1];
  } else {
    try {
      path = new URL(trimmed).pathname;
    } catch {
      return null;
    }
  }
  const cleaned = path
    .replace(/^\/+/, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  return cleaned || null;
}

function originUrl(dir: string): string | null {
  try {
    return execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * @purpose Scan the base directory (two levels) for a clone whose origin matches the project.
 * @param baseDir Directory to scan.
 * @param project Target project path.
 * @returns Clone path, or null when not found.
 * @sideEffect FS + git: reads directories and origin remotes.
 * @consumer ensureClone
 */
export function findCloneByRemote(baseDir: string, project: string): string | null {
  if (!existsSync(baseDir)) return null;
  const candidates: string[] = [];
  for (const top of readdirSync(baseDir)) {
    const topPath = join(baseDir, top);
    try {
      if (!statSync(topPath).isDirectory()) continue;
    } catch {
      continue;
    }
    candidates.push(topPath);
    try {
      for (const sub of readdirSync(topPath)) candidates.push(join(topPath, sub));
    } catch {
      /* skip unreadable */
    }
  }
  for (const dir of candidates) {
    const url = originUrl(dir);
    if (url && projectFromRemoteUrl(url) === project) return dir;
  }
  return null;
}

/** @purpose Locations needed to find/clone a project, all resolved by the caller. */
export type CloneOptions = {
  /** @purpose Base dir to scan for existing clones (--repos-base, default ~/Developer) */
  reposBase: string;
  /** @purpose repos.json path (state dir) */
  reposMapPath: string;
  /** @purpose Cache dir for shallow clones (state dir) */
  clonesRoot: string;
};

/**
 * @purpose Resolve a local clone for the project: repos.json override → scan base
 *   dir by origin → shallow-clone into the managed cache.
 * @invariant Error Policy: throws when cloning fails.
 * @param project GitLab project path.
 * @param host GitLab host (for the clone URL).
 * @param token GitLab token (used only for the one-off clone of a missing repo).
 * @param opts Resolved locations (reposBase, reposMapPath, clonesRoot).
 * @returns Absolute path to a usable local clone.
 * @sideEffect FS + network: may clone the repository.
 * @consumer vcs-worktree.cmd
 */
export function ensureClone(
  project: string,
  host: string,
  token: string,
  opts: CloneOptions
): string {
  const mapped = resolveClonePath(loadReposMap(opts.reposMapPath), project);
  if (mapped && existsSync(mapped)) return mapped;

  const found = findCloneByRemote(opts.reposBase, project);
  if (found) return found;

  mkdirSync(opts.clonesRoot, { recursive: true });
  const dest = join(opts.clonesRoot, project.replace(/\//g, '__'));
  if (!existsSync(dest)) {
    const cloneUrl = `https://oauth2:${token}@${host}/${project}.git`;
    execFileSync('git', ['clone', '--depth', '1', '--no-single-branch', cloneUrl, dest], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  }
  return dest;
}
