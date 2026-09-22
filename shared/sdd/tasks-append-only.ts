// @file: Legacy-V1-only comparison of a file's `@tasks:` header ids against HEAD; V2 ownership uses one canonical @spec plus file-relations.
// @spec: SHARED
// @consumers: sdd-check.cmd

import type { Finding } from './check.ts';
import { parseSourceOwnershipHeader } from './source-ownership-header.ts';

/**
 * @purpose Parse a file's `@tasks:` header comment into its declared Task-IDs / Decision-IDs.
 * @invariant `N/A` tokens are dropped (they mean "no id yet"); everything else is kept verbatim, in header order.
 * @param content Full file source (any single-line comment style: `//`, `#`).
 * @returns Declared ids; empty when the header lists only `N/A` or is absent.
 */
export function parseTasksHeader(content: string): string[] {
  const values = parseSourceOwnershipHeader(content)
    .blocks.filter((block) => block.tag === 'tasks')
    .map((block) => block.value);
  return values
    .flatMap((value) => value.split(','))
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^n\/a$/i.test(s));
}

/**
 * @purpose Preserve append-only `@tasks` compatibility for untouched V1 production headers only.
 * @invariant Pure — the adapter reads HEAD content (`git show HEAD:<path>`); `headContent === null` (no HEAD version, a new file) is never an error.
 * @param file File path (finding location).
 * @param currentContent Full current file source.
 * @param headContent Full HEAD (last commit) file source, or null when the file is new.
 * @returns One `SDD_TASKS_APPEND_ONLY_REGRESSION` per dropped legacy id; V2 adapters must not call
 *   this helper and instead resolve the canonical `@spec` owner plus ticket relations.
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
