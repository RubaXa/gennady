// @file: SDD flow-version detection — the v1/v2 layout marker, shared by sdd-state and sdd-check.
// @spec: SHARED
// @consumers: sdd-check.cmd, sdd-state.cmd, ticket-resolve

import { statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

/**
 * @purpose SDD flow generation — v1 (`tasks/` layout) or v2 (co-located specs + `*.3-tasks.md`).
 * @invariant `v1` is the pre-migration layout; strict v2-only spec rules stay dormant under `v1`.
 */
export type FlowVersion = 'v1' | 'v2';

/**
 * @purpose Detect the SDD flow version from the project layout — a `tasks/` directory marks v1.
 * @invariant The `tasks/` directory is the single v1 marker; its absence means the repo is on v2.
 * @param root Absolute project root.
 * @returns `'v1'` when `<root>/tasks/` is a directory, else `'v2'`.
 */
export function detectFlowVersion(root: string): FlowVersion {
  try {
    return statSync(join(root, 'tasks')).isDirectory() ? 'v1' : 'v2';
  } catch {
    return 'v2';
  }
}

/**
 * @purpose Detect the flow version of ONE scope — the mixed-state marker during migration.
 * @invariant v2 repo: every scope is v2. v1 repo: a scope is v2 only when `tasks/<scope>/` is
 *   gone AND `<scope>.3-tasks.md` exists; untouched scopes stay v1-lenient.
 * @param repoRoot Absolute repo root (the directory holding `specs/` and `tasks/`).
 * @param scope Scope name (the first path segment under `specs/`).
 * @returns The scope's flow version.
 */
export function detectScopeFlowVersion(repoRoot: string, scope: string): FlowVersion {
  if (detectFlowVersion(repoRoot) === 'v2') return 'v2';
  try {
    if (statSync(join(repoRoot, 'tasks', scope)).isDirectory()) return 'v1';
  } catch {
    // no tasks/<scope>/ — fall through to the positive-migration marker
  }
  try {
    return statSync(join(repoRoot, 'specs', scope, `${scope}.3-tasks.md`)).isFile() ? 'v2' : 'v1';
  } catch {
    return 'v1';
  }
}

/**
 * @purpose Detect the flow version governing one ticket from its owning scope path.
 * @invariant Both CLI checks and execution-map scans use this single mixed-migration classifier;
 *   a check may not invent its own V1/V2 boundary.
 * @param file Absolute or repo-relative ticket path.
 * @param repoRoot Repository root containing `tasks/` and `specs/`.
 * @returns The ticket's scope flow version, or the repository version when no scope segment exists.
 */
export function ticketFlowVersion(file: string, repoRoot: string): FlowVersion {
  const parts = resolve(file).split(sep);
  const ti = parts.lastIndexOf('tasks');
  if (ti >= 0 && parts.length - ti >= 2) {
    return detectScopeFlowVersion(repoRoot, parts[ti + 1] as string);
  }
  const si = parts.lastIndexOf('specs');
  if (si >= 0 && parts.length - si >= 2) {
    return detectScopeFlowVersion(repoRoot, parts[si + 1] as string);
  }
  return detectFlowVersion(repoRoot);
}
