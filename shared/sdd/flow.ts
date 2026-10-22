// @file: SDD flow-version detection — the v1/v2 layout marker, shared by sdd-state and sdd-check.
// @spec: SHARED
// @consumers: sdd-check.cmd, sdd-state.cmd, ticket-resolve

import { lstatSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { proveRepoFile, readProvenRepoFile } from '../common/repo-file-identity.ts';
import { isTicket, isLegacyTicket } from './check.ts';
import { legacyHeaderBody } from './anchor-inject.ts';
import { extractSection } from './section.ts';
import { parseMeta } from './tracker.ts';

/**
 * @purpose SDD flow generation — v1 (`tasks/` layout) or v2 (co-located specs + `*.3-tasks.md`).
 * @invariant `v1` is the pre-migration layout; strict v2-only spec rules stay dormant under `v1`.
 */
export type FlowVersion = 'v1' | 'v2';

/**
 * @purpose Detect actual SDD tickets under tasks without treating ordinary build tasks or documentation as V1.
 * @invariant Canonical malformed legacy names and unreadable/unsafe inventory remain migration-blocked.
 * @param root Absolute project root.
 * @returns V1 for proven legacy ticket signals or unsafe inventory, otherwise V2.
 */
export function detectFlowVersion(root: string): FlowVersion {
  try {
    const tasks = lstatSync(join(root, 'tasks'));
    if (tasks.isSymbolicLink()) return 'v1';
    if (!tasks.isDirectory()) return 'v2';
  } catch (cause) {
    return ['ENOENT', 'ENOTDIR'].includes((cause as NodeJS.ErrnoException).code ?? '')
      ? 'v2'
      : 'v1';
  }
  function containsTicket(directory: string): boolean {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) return true;
      if (entry.isDirectory()) {
        if (containsTicket(path)) return true;
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      if (/\.task-[0-9]+\.md$/u.test(entry.name)) return true;
      const proven = proveRepoFile(root, path);
      if (!proven.ok) return true;
      const read = readProvenRepoFile(proven.identity);
      if (!read.ok) return true;
      if (isTicket(read.content) || isLegacyTicket(read.content)) return true;
      const meta = extractSection(read.content, 'META');
      const body = meta.status === 'ok' ? meta.content : legacyHeaderBody(read.content, 'META');
      if (body !== null && parseMeta(body).taskId !== null) return true;
    }
    return false;
  }
  try {
    return containsTicket('tasks') ? 'v1' : 'v2';
  } catch {
    return 'v1';
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
