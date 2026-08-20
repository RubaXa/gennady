// @file: Task-ID v2 grammar, project-wide collection, and conflict detection (AX_TASK_ID_UNIQUENESS) — shared by sdd-new (refuse a bad --id) and sdd-check (SDD_TASK_ID_GRAMMAR / SDD_TASK_ID_PREFIX_CLASH).
// @consumers: sdd-new.cmd, check.ts
// @tasks: N/A

import { readdirSync, readFileSync, type Dirent } from 'node:fs';
import { join, sep } from 'node:path';
import { extractSection } from './section.ts';
import { parseMetaInfo } from './ticket.ts';
import { legacyHeaderBody } from './anchor-inject.ts';

/**
 * @purpose v2 Task-ID grammar: `<ACR>-<slug>` — ACR is upper-alnum starting with a letter; slug is one or
 * more lowercase-alnum words, hyphen-joined.
 * @invariant Matches literally `^[A-Z][A-Z0-9]*-[a-z0-9]+(-[a-z0-9]+)*$` (operator-approved v2 decision).
 */
const TASK_ID_GRAMMAR = /^[A-Z][A-Z0-9]*-[a-z0-9]+(-[a-z0-9]+)*$/;

/** @purpose Max combined slug length (everything after the first `-`, hyphens included) — keeps a Task-ID short and grep-friendly. */
export const SLUG_MAX_LEN = 8;

/**
 * @purpose True when `id` has the `<ACR>-<slug>` shape (grammar only, no slug-length cap).
 * @invariant Used by `sdd-task` to decide whether an unreadable CLI argument is Task-ID-shaped.
 * @param id Candidate string (raw CLI argument).
 * @returns Whether it matches the v2 Task-ID grammar shape.
 */
export function looksLikeTaskId(id: string): boolean {
  return TASK_ID_GRAMMAR.test(id);
}

/**
 * @purpose Validate one Task-ID against the v2 grammar + slug-length cap.
 * @invariant Pure. The slug is everything after the FIRST `-` (an ACR never contains one); its length
 * (hyphens included) must be ≤ SLUG_MAX_LEN.
 * @param id Candidate Task-ID.
 * @returns null when valid, else a human-readable reason naming the exact rule broken.
 */
export function validateTaskId(id: string): string | null {
  if (!TASK_ID_GRAMMAR.test(id)) {
    return `Task-ID "${id}" does not match the <ACR>-<slug> grammar: ^[A-Z][A-Z0-9]*-[a-z0-9]+(-[a-z0-9]+)*$ (e.g. "GAT-login").`;
  }
  const slug = id.slice(id.indexOf('-') + 1);
  if (slug.length > SLUG_MAX_LEN) {
    return `Task-ID "${id}" has an ${slug.length}-char slug "${slug}" (> ${SLUG_MAX_LEN}) — shorten it to at most ${SLUG_MAX_LEN} characters.`;
  }
  return null;
}

// Directories never descended into while walking the project for existing Task-IDs — mirrors
// sdd-check's own SKIP_DIRS so __tests__ fixtures never pollute the real project's ID space.
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '__tests__',
]);

// A v2 task-ticket filename: `<module>.task.<ID>.md` (dot before the ID — the v1 legacy convention is
// `<module>.task-<N>.md`, hyphen before a bare number, and never matches this).
const V2_TASK_FILENAME = /\.task\.([^/\\]+)\.md$/;

/** @purpose True when `full`'s path (relative to nothing in particular) carries a `specs` directory segment. | @param full A file path (absolute or relative). | @returns Whether any path segment equals "specs". */
function underSpecs(full: string): boolean {
  return full.split(sep).includes('specs');
}

/**
 * @purpose Collect every existing Task-ID in a project tree — the uniqueness set `--id`/checkIdConflicts compares against.
 * @invariant Read-only, skips node_modules/.git/dist/build/out/coverage/__tests__. Two sources,
 * deduplicated: `*.task.<ID>.md` filenames under `specs/`, and `**Task-ID:**` Meta fields (anchored or
 * legacy). An unfilled `<ACRONYM>-<slug>` placeholder is never counted.
 * @param root Absolute project root.
 * @returns Every distinct Task-ID found, in discovery order.
 */
export function collectTaskIds(root: string): string[] {
  const seen = new Set<string>();
  const add = (id: string | null | undefined): void => {
    if (id && !id.includes('<')) seen.add(id);
  };

  function walk(dir: string): void {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.md')) continue;

      const m = V2_TASK_FILENAME.exec(entry.name);
      if (m?.[1] && underSpecs(full)) add(m[1]);

      let content: string;
      try {
        content = readFileSync(full, 'utf-8');
      } catch {
        continue;
      }
      const metaSec = extractSection(content, 'META');
      if (metaSec.status === 'ok') {
        add(parseMetaInfo(metaSec.content).taskId);
        continue;
      }
      const legacyMeta = legacyHeaderBody(content, 'META');
      if (legacyMeta !== null) add(parseMetaInfo(legacyMeta).taskId);
    }
  }

  walk(root);
  return [...seen];
}

/**
 * @purpose One Task-ID conflict — a candidate id colliding with an already-known one.
 * @invariant `duplicate` = exact same string. `prefix` = a hyphen-boundary prefix, either direction.
 */
export type IdConflict = {
  /** @purpose The existing Task-ID the candidate conflicts with. */
  with: string;
  /** @purpose Conflict kind. */
  kind: 'duplicate' | 'prefix';
};

/** @purpose True when `a` is a hyphen-boundary prefix of `b` (`b` starts with `a + "-"`) — shared by checkIdConflicts and findPrefixClashes. | @param a Candidate prefix. | @param b Candidate superstring. | @returns Whether `b` extends `a` at a `-` boundary. */
function isHyphenPrefix(a: string, b: string): boolean {
  return b.startsWith(`${a}-`);
}

/**
 * @purpose Check one candidate Task-ID against the existing set — duplicate or prefix-conflict.
 * @invariant Needs the hyphen boundary either side (`GAT-gates` vs `GAT-gates-v2` conflicts; `TSK-1`
 * vs `TSK-10` does not).
 * @param newId Candidate Task-ID.
 * @param existing Every currently known Task-ID (e.g. from collectTaskIds).
 * @returns Every conflict found (possibly several), empty when `newId` is free to use.
 */
export function checkIdConflicts(newId: string, existing: string[]): IdConflict[] {
  const conflicts: IdConflict[] = [];
  for (const id of existing) {
    if (id === newId) {
      conflicts.push({ with: id, kind: 'duplicate' });
    } else if (isHyphenPrefix(newId, id) || isHyphenPrefix(id, newId)) {
      conflicts.push({ with: id, kind: 'prefix' });
    }
  }
  return conflicts;
}

/**
 * @purpose Every pairwise prefix conflict within one Task-ID set — the project-wide grep-cleanliness
 * gate (SDD_TASK_ID_PREFIX_CLASH runs this over every distinct ticket Task-ID in the tree).
 * @param ids Distinct Task-IDs to check pairwise.
 * @returns Each conflicting pair once (`[a, b]`, input order); empty when the set is prefix-free.
 */
export function findPrefixClashes(ids: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i] as string;
      const b = ids[j] as string;
      if (isHyphenPrefix(a, b) || isHyphenPrefix(b, a)) out.push([a, b]);
    }
  }
  return out;
}

/**
 * @purpose Render one conflict as an operator-facing sentence naming the culprit — shared by sdd-new's
 * refusal message and sdd-check's SDD_TASK_ID_PREFIX_CLASH finding.
 * @param newId The candidate Task-ID that was checked.
 * @param conflict The conflict found against it.
 * @returns A one-line, human-readable explanation.
 */
export function describeIdConflict(newId: string, conflict: IdConflict): string {
  if (conflict.kind === 'duplicate') {
    return `Task-ID "${newId}" already exists (used by another ticket) — Task-IDs are unique project-wide.`;
  }
  return `Task-ID "${newId}" is in a prefix conflict with existing "${conflict.with}" — neither may be a hyphen-prefix of the other (grep-cleanliness).`;
}

/**
 * @purpose Best-effort suggestion for a valid, conflict-free Task-ID — NEVER applied automatically (refuse + point at the fix, never silently substitute).
 * @invariant First cleans up the candidate's own ACR/slug; if that still conflicts, tries
 * numeric-suffixed variants, keeping the slug ≤ SLUG_MAX_LEN.
 * @param id The candidate Task-ID that failed validation or conflicted.
 * @param existing Every currently known Task-ID (for the free-variant search).
 * @returns A conflict-free suggestion, or null when no ACR could be recovered from `id` at all.
 */
export function suggestTaskId(id: string, existing: string[]): string | null {
  const dash = id.indexOf('-');
  const acrRaw = dash === -1 ? id : id.slice(0, dash);
  const slugRaw = dash === -1 ? '' : id.slice(dash + 1);

  const acr = acrRaw
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .replace(/^[0-9]+/, '');
  if (!acr) return null;

  let slug = slugRaw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) slug = 'x';
  if (slug.length > SLUG_MAX_LEN) slug = slug.slice(0, SLUG_MAX_LEN).replace(/-+$/, '') || 'x';

  const isFree = (candidate: string): boolean =>
    validateTaskId(candidate) === null && checkIdConflicts(candidate, existing).length === 0;

  const first = `${acr}-${slug}`;
  if (isFree(first)) return first;

  for (let n = 2; n < 100; n++) {
    const suffix = String(n);
    const base = slug.slice(0, Math.max(1, SLUG_MAX_LEN - suffix.length));
    const candidate = `${acr}-${base}${suffix}`;
    if (isFree(candidate)) return candidate;
  }
  return null;
}
