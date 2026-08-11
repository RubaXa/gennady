// @file: Pure classification + resolution check for a file's `@consumers:` header — CONSUMERS_RESOLVABLE (SDD_CONSUMERS_UNRESOLVED). Codebase text search stays in the adapter.
// @consumers: sdd-check.cmd
// @tasks: N/A

import type { Finding } from './check.ts';

/**
 * @purpose One classified `@consumers:` entry.
 * @invariant `external` entries are never resolved and never flagged — they are free-text descriptions, not codebase identifiers.
 */
export type ConsumerEntry = {
  /** @purpose Original entry text, trimmed. */
  raw: string;
  /** @purpose The identifier to resolve — the entry with any trailing `(...)` detail stripped. Meaningless when `external`. */
  name: string;
  /** @purpose True when the entry reads as a free-text description (contains the word "external", or its head carries whitespace) rather than a single codebase identifier. */
  external: boolean;
};

/**
 * @purpose Split a header field on top-level commas — commas inside `(...)` do not split, so `cli/cmd/inbox (debug dump, D-124)` stays one entry.
 * @param field The text after `@consumers:`.
 * @returns Trimmed, non-empty entries.
 */
export function splitConsumerEntries(field: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < field.length; i++) {
    const c = field[i];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0) {
      out.push(field.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(field.slice(start).trim());
  return out.filter((s) => s.length > 0);
}

/**
 * @purpose Parse a file's `@consumers:` header comment into its top-level entry list.
 * @param content Full file source.
 * @returns Raw entries (`splitConsumerEntries`); empty when the header is absent.
 */
export function parseConsumersHeader(content: string): string[] {
  const m = /@consumers:\s*(.+)/.exec(content);
  return m?.[1] ? splitConsumerEntries(m[1]) : [];
}

/**
 * @purpose Classify one raw `@consumers:` entry: a resolvable codebase identifier, or a free-text / external description.
 * @invariant Trailing `(...)` detail is stripped to get `name`; a whitespace-bearing/empty head, or the word "external" anywhere, marks it `external`.
 * @param raw One `@consumers:` entry (already top-level-split via `splitConsumerEntries`).
 * @returns The classified ConsumerEntry.
 */
export function classifyConsumerEntry(raw: string): ConsumerEntry {
  const trimmed = raw.trim();
  const head = trimmed.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const external = head.length === 0 || /\s/.test(head) || /\bexternal\b/i.test(trimmed);
  return { raw: trimmed, name: head, external };
}

/**
 * @purpose Check that every non-external `@consumers:` entry resolves somewhere in the codebase.
 * @invariant Pure — codebase text search is the adapter's job; `resolved` is the set of `name` values the adapter found referenced elsewhere in the repo.
 * @param file File path (finding location).
 * @param entries Classified entries (`classifyConsumerEntry` over `parseConsumersHeader`).
 * @param resolved Identifier names the adapter confirmed are referenced elsewhere in the repo.
 * @returns One `SDD_CONSUMERS_UNRESOLVED` (warn — text search is crude) per unresolved identifier; empty when every entry resolves or is external.
 */
export function checkConsumersResolvable(
  file: string,
  entries: ConsumerEntry[],
  resolved: Set<string>
): Finding[] {
  const findings: Finding[] = [];
  for (const e of entries) {
    if (e.external) continue;
    if (!resolved.has(e.name)) {
      findings.push({
        severity: 'warn',
        code: 'SDD_CONSUMERS_UNRESOLVED',
        file,
        message: `@consumers: entry "${e.name}" was not found referenced elsewhere in the codebase (text search) — mark it external in the description if it lives outside this repo, or fix the name.`,
      });
    }
  }
  return findings;
}
