// @file: Canonical V2 Spec ID parsing, path-derived migration proposal, and on-demand ID-to-path index.
// @spec: SHARED
// @consumers: orient file-relations adapter, sdd-check ownership checks, sdd-new scaffolds

import { readdirSync, readFileSync, type Dirent } from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';
import { extractSection } from './section.ts';

const SPEC_ID_GRAMMAR = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/;
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '__tests__',
]);

/** @purpose Parsed state of the one canonical SPEC_ID section in a V2 spec. */
export type ParsedSpecId =
  | { status: 'absent' }
  | { status: 'malformed'; values: readonly string[] }
  | { status: 'valid'; id: string };

/** @purpose One canonical V2 spec indexed by explicit stable ID. */
export type SpecIdEntry = {
  /** @purpose Stable explicit V2 Spec ID. */
  id: string;
  /** @purpose Repository-relative canonical spec path discovered on demand. */
  path: string;
};

/**
 * @purpose Validate the stable V2 Spec ID literal grammar.
 * @param id Candidate literal.
 * @returns Whether the literal is one or more upper-alnum path-derived segments.
 */
export function isCanonicalSpecId(id: string): boolean {
  return SPEC_ID_GRAMMAR.test(id);
}

/**
 * @purpose Parse exactly one literal from one canonical SPEC_ID section.
 * @param content Full spec markdown.
 * @returns Absent, malformed, or one valid stable ID.
 */
export function parseSpecId(content: string): ParsedSpecId {
  const section = extractSection(content, 'SPEC_ID');
  if (section.status === 'not_found') return { status: 'absent' };
  if (section.status !== 'ok') return { status: 'malformed', values: [] };
  const values = section.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('<!--'));
  if (values.length !== 1 || !isCanonicalSpecId(values[0] ?? '')) {
    return { status: 'malformed', values };
  }
  return { status: 'valid', id: values[0] as string };
}

/**
 * @purpose Propose the one-time migration ID from a canonical spec path without making it authority.
 * @invariant The repeated canonical filename stem is removed; collisions must be checked by caller.
 * @param specsRoot Absolute canonical specs directory.
 * @param specPath Absolute or specs-root-relative `.spec.md` path.
 * @returns Uppercase hyphen-joined ID, or null for a non-canonical path.
 */
export function deriveInitialSpecId(specsRoot: string, specPath: string): string | null {
  const rel = relative(resolve(specsRoot), resolve(specsRoot, specPath));
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || !rel.endsWith('.spec.md')) return null;
  const parts = rel.split(sep);
  const stem = basename(parts.pop() ?? '', '.spec.md');
  if (parts.at(-1) !== stem) parts.push(stem);
  const id = parts.join('-').toUpperCase();
  return isCanonicalSpecId(id) ? id : null;
}

/**
 * @purpose Build a deterministic explicit Spec-ID index by scanning canonical V2 specs on demand.
 * @invariant Specs without SPEC_ID are legacy inputs and are omitted; malformed sections remain
 *   visible to validation callers but never become index entries.
 * @param specsRoot Absolute canonical specs directory.
 * @returns Entries sorted by ID then repo-relative path.
 */
export function collectSpecIdEntries(specsRoot: string): SpecIdEntry[] {
  const entries: SpecIdEntry[] = [];
  const walk = (dir: string): void => {
    let children: Dirent[];
    try {
      children = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const child of children) {
      if (child.name.startsWith('.') || child.isSymbolicLink()) continue;
      const full = resolve(dir, child.name);
      if (child.isDirectory()) {
        if (!SKIP_DIRS.has(child.name)) walk(full);
        continue;
      }
      if (!child.isFile() || !child.name.endsWith('.spec.md')) continue;
      let content: string;
      try {
        content = readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      const parsed = parseSpecId(content);
      if (parsed.status === 'valid') {
        entries.push({
          id: parsed.id,
          path: relative(resolve(specsRoot, '..'), full).split(sep).join('/'),
        });
      }
    }
  };
  walk(resolve(specsRoot));
  return entries.sort((left, right) =>
    left.id < right.id
      ? -1
      : left.id > right.id
        ? 1
        : left.path < right.path
          ? -1
          : left.path > right.path
            ? 1
            : 0
  );
}
