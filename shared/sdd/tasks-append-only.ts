// @file: Pure comparison of a file's `@tasks:` header ids against its HEAD version — TASKS_APPEND_ONLY (SDD_TASKS_APPEND_ONLY_REGRESSION). Git reads stay in the adapter.
// @consumers: sdd-check.cmd
// @tasks: N/A

import type { Finding } from './check.ts';

/**
 * @purpose Parse a file's `@tasks:` header comment into its declared Task-IDs / Decision-IDs.
 * @invariant `N/A` tokens are dropped (they mean "no id yet"); everything else is kept verbatim, in header order.
 * @param content Full file source (any single-line comment style: `//`, `#`).
 * @returns Declared ids; empty when the header lists only `N/A` or is absent.
 */
export function parseTasksHeader(content: string): string[] {
  const m = /@tasks:\s*(.+)/.exec(content);
  if (!m?.[1]) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^n\/a$/i.test(s));
}

/**
 * @purpose Check that a file's current `@tasks:` header did not drop an id present in its HEAD version — the header is append-only.
 * @invariant Pure — the adapter reads HEAD content (`git show HEAD:<path>`); `headContent === null` (no HEAD version, a new file) is never an error.
 * @param file File path (finding location).
 * @param currentContent Full current file source.
 * @param headContent Full HEAD (last commit) file source, or null when the file is new.
 * @returns One `SDD_TASKS_APPEND_ONLY_REGRESSION` (error) per id present at HEAD but missing now; empty when append-only holds or the file is new.
 */
export function checkTasksAppendOnly(
  file: string,
  currentContent: string,
  headContent: string | null
): Finding[] {
  if (headContent === null) return [];
  const before = parseTasksHeader(headContent);
  const after = new Set(parseTasksHeader(currentContent));
  const dropped = before.filter((id) => !after.has(id));
  if (dropped.length === 0) return [];
  return [
    {
      severity: 'error',
      code: 'SDD_TASKS_APPEND_ONLY_REGRESSION',
      file,
      message: `@tasks: header dropped previously-declared id(s): ${dropped.join(', ')} — the header is append-only, ids are never removed.`,
    },
  ];
}
