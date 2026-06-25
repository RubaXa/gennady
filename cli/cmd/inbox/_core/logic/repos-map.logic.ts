// @file: Map of GitLab project path → local clone path, for worktree-based review.
// @consumers: inbox.cmd
// @tasks: N/A

import { readFileSync, existsSync } from 'node:fs';

/** @purpose project full path (group/sub/project) → absolute local clone path. */
export type ReposMap = Record<string, string>;

/**
 * @purpose Load the project→clone map, tolerating a missing or corrupt file.
 * @param path repos.json file path.
 * @returns The map, or an empty object when absent/unreadable.
 * @sideEffect Reads the file system.
 * @consumer inbox.cmd
 */
export function loadReposMap(path: string): ReposMap {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: ReposMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * @purpose Find the local clone for a project, falling back to the longest matching
 *   parent path (so a group-level entry can cover its projects).
 * @param map Loaded repos map.
 * @param project GitLab project full path.
 * @returns Local clone path, or undefined when not configured.
 * @consumer inbox.cmd
 */
export function resolveClonePath(map: ReposMap, project: string): string | undefined {
  if (map[project]) return map[project];
  const prefixes = Object.keys(map)
    .filter((k) => project === k || project.startsWith(`${k}/`))
    .sort((a, b) => b.length - a.length);
  return prefixes.length > 0 ? map[prefixes[0]] : undefined;
}
