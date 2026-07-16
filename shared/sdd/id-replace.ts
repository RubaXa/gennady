// @file: Deterministic Task-ID replacement for the v1→v2 migration — an approved map of exact IDs,
//   applied on word boundaries across the code/spec zones. Replaces the manual sed recipe: never a
//   blind `TSK-[0-9]+` pattern, never a partial match (`UTF-8` stays intact).
// @consumers: sdd-migrate.cmd
// @tasks: N/A

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { extractSection } from './section.ts';
import { scanMigrationUnits, unitFilePath } from './migration-plan.ts';

/** @purpose One approved rename: exact old ID → exact new ID. */
export type IdRename = {
  /** @purpose The exact old ID to match, on word boundaries. */
  old: string;
  /** @purpose The exact replacement ID. */
  next: string;
};

/** @purpose Zones the replacement walks — the plan layer itself is deliberately excluded (it records old IDs). */
export const ID_REPLACE_ZONES = ['specs', 'tasks', 'cli', 'shared', 'services', 'ai', 'e2e'];

/** @purpose Text file extensions the replacement touches — everything else is skipped. */
const TEXT_EXTENSIONS = new Set([
  '.md',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.xml',
  '.yml',
  '.yaml',
  '.sh',
  '.hbs',
  '.txt',
]);

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage']);

/** @purpose ID grammar both sides of a rename must satisfy — word-boundary-safe replacement depends on it. */
const ID_REGEX = /^[A-Za-z][A-Za-z0-9_-]*$/;

/**
 * @purpose Parse and validate a TSV id-map (`<old>\t<new>` per line, `#` comments allowed).
 * @invariant Rejects malformed rows, out-of-grammar IDs, duplicate olds/news, old === new, and
 *   chains (a `new` that is also some row's `old` — order-dependent, forbidden).
 * @param text TSV file content.
 * @returns The validated map, or the list of problems (all found, not just the first).
 */
export function parseIdMap(
  text: string
): { ok: true; map: IdRename[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const map: IdRename[] = [];
  const olds = new Set<string>();
  const news = new Set<string>();
  text.split('\n').forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;
    const parts = line.split('\t').map((p) => p.trim());
    const [old, next] = parts;
    if (parts.length !== 2 || !old || !next) {
      errors.push(`строка ${i + 1}: ожидаю ровно две TAB-колонки \`<old>\\t<new>\``);
      return;
    }
    if (!ID_REGEX.test(old)) errors.push(`строка ${i + 1}: old «${old}» вне грамматики ID`);
    if (!ID_REGEX.test(next)) errors.push(`строка ${i + 1}: new «${next}» вне грамматики ID`);
    if (old === next) errors.push(`строка ${i + 1}: old и new совпадают («${old}»)`);
    if (olds.has(old)) errors.push(`строка ${i + 1}: old «${old}» встречается повторно`);
    if (news.has(next)) errors.push(`строка ${i + 1}: new «${next}» встречается повторно`);
    olds.add(old);
    news.add(next);
    map.push({ old, next });
  });
  for (const r of map) {
    if (olds.has(r.next))
      errors.push(
        `цепочка: new «${r.next}» одновременно чей-то old — переименования нельзя упорядочить безопасно`
      );
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, map };
}

/**
 * @purpose Derive the id-map from the migration layer's Ticket Maps — the plan is the source of truth.
 * @invariant Rows whose new ID is still `?` are skipped (plan --verify gates completeness, not this).
 * @param repoRoot Absolute repo root carrying a generated `migration/` layer.
 * @returns TSV text (`<old>\t<new>` per line, path-sorted, deduplicated).
 */
export function idMapFromPlan(repoRoot: string): string {
  const scan = scanMigrationUnits(repoRoot);
  const rows: string[] = [];
  const seen = new Set<string>();
  for (const unit of scan.units) {
    let content: string;
    try {
      content = readFileSync(join(repoRoot, unitFilePath(unit)), 'utf-8');
    } catch {
      continue;
    }
    const sec = extractSection(content, 'TICKET_MAP');
    if (sec.status !== 'ok') continue;
    for (const line of sec.content.split('\n')) {
      if (!line.trimStart().startsWith('|')) continue;
      const cells = line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.replace(/`/g, '').trim());
      const old = cells[1] ?? '';
      const next = cells[2] ?? '';
      if (!ID_REGEX.test(old) || !ID_REGEX.test(next)) continue;
      const key = `${old}\t${next}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push(key);
      }
    }
  }
  return rows.sort().join('\n') + (rows.length > 0 ? '\n' : '');
}

/** @purpose Escape a literal for use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @purpose Recursively collect text files under the zones, path-sorted. */
function collectZoneFiles(repoRoot: string, zones: string[]): string[] {
  const acc: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name) || e.isSymbolicLink()) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && TEXT_EXTENSIONS.has(extname(e.name))) acc.push(full);
    }
  };
  for (const z of zones) walk(join(repoRoot, z));
  return acc.sort();
}

/** @purpose Per-file replacement report row. */
export type ReplaceReport = {
  /** @purpose Repo-relative path of the file with ≥1 replaced occurrence. */
  file: string;
  /** @purpose Number of occurrences replaced in this file. */
  count: number;
};

/**
 * @purpose Apply (or dry-run) the id-map across the zones — exact IDs on word boundaries only.
 * @invariant Word boundary (`\b`) on both sides: partial matches (`UTF-8`, `TSK-310` for `TSK-31`)
 *   are never touched; only whole-token occurrences are replaced.
 * @invariant Deterministic: files walked in sorted order; all renames applied per file in map order.
 * @param repoRoot Absolute repo root.
 * @param map Validated renames.
 * @param write False = dry-run (counts only, no file mutated).
 * @param [zones] Zone dirs to walk (defaults to ID_REPLACE_ZONES).
 * @returns One row per file with ≥1 occurrence, path-sorted.
 */
export function replaceIds(
  repoRoot: string,
  map: IdRename[],
  write: boolean,
  zones: string[] = ID_REPLACE_ZONES
): ReplaceReport[] {
  const report: ReplaceReport[] = [];
  const regexes = map.map((r) => ({
    re: new RegExp(`\\b${escapeRegExp(r.old)}\\b`, 'g'),
    next: r.next,
  }));
  for (const file of collectZoneFiles(repoRoot, zones)) {
    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    let updated = content;
    let count = 0;
    for (const { re, next } of regexes) {
      updated = updated.replace(re, () => {
        count++;
        return next;
      });
    }
    if (count > 0) {
      if (write) writeFileSync(file, updated, 'utf-8');
      report.push({ file: relative(repoRoot, file), count });
    }
  }
  return report;
}

/**
 * @purpose Post-write gate: no old ID from the map remains anywhere in the zones.
 * @param repoRoot Absolute repo root.
 * @param map The applied renames.
 * @param [zones] Zone dirs to walk (defaults to ID_REPLACE_ZONES).
 * @returns Files still carrying an old ID (empty = the replacement is complete).
 */
export function findRemainingOldIds(
  repoRoot: string,
  map: IdRename[],
  zones: string[] = ID_REPLACE_ZONES
): { file: string; id: string }[] {
  const leftovers: { file: string; id: string }[] = [];
  const regexes = map.map((r) => ({ re: new RegExp(`\\b${escapeRegExp(r.old)}\\b`), id: r.old }));
  for (const file of collectZoneFiles(repoRoot, zones)) {
    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    for (const { re, id } of regexes) {
      if (re.test(content)) leftovers.push({ file: relative(repoRoot, file), id });
    }
  }
  return leftovers;
}
