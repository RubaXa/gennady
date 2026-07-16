// @file: Pure file:line resolution for ContextChip.origin — maps a selected quote to its real
//   1-based line range inside an artifact's raw source text, replacing the absent-DOM-marker
//   degradation with a deterministic, unit-testable computation (D-115, TSK-132 P1 fix).
// @consumers: SelectionPill (browser selection → origin)
// @tasks: TSK-132

import type { ContextChipOrigin } from './types.ts';

/**
 * @purpose 1-based line number of the character at `charIndex` inside `text`.
 * @param text Source text `charIndex` is measured against.
 * @param charIndex 0-based character offset, clamped into `[0, text.length]`.
 * @returns 1-based line number.
 */
function lineNumberAtOffset(text: string, charIndex: number): number {
  const clampedIndex = Math.max(0, Math.min(charIndex, text.length));
  let lineNumber = 1;
  for (let i = 0; i < clampedIndex; i++) {
    if (text[i] === '\n') lineNumber++;
  }
  return lineNumber;
}

/**
 * @purpose Locate `quote`'s character offsets inside `rawText`, retrying on the quote's first line
 *   alone when the exact match fails — `Selection#toString()` sometimes collapses whitespace the
 *   raw source preserves, so a direct substring match can miss an otherwise-present quote.
 * @invariant Never throws; returns `null` (not a sentinel range) when both strategies fail, so the
 *   caller — not this lookup — decides the degrade.
 * @param rawText Full artifact source.
 * @param quote Selected fragment, already trimmed by the caller.
 * @returns Start (inclusive) / end (exclusive) character offsets, or `null` when unresolvable.
 */
function locateQuote(rawText: string, quote: string): { start: number; end: number } | null {
  const directIndex = rawText.indexOf(quote);
  if (directIndex >= 0) return { start: directIndex, end: directIndex + quote.length };

  const firstLine = (quote.split('\n')[0] ?? '').trim();
  if (!firstLine) return null;
  const firstLineIndex = rawText.indexOf(firstLine);
  if (firstLineIndex < 0) return null;
  return { start: firstLineIndex, end: firstLineIndex + quote.length };
}

/**
 * @purpose Map a selected quote to its real 1-based line range inside an artifact's raw source
 *   (D-115) — the deterministic replacement for absent DOM `data-line` markers.
 * @invariant Degrades to `{ startLine: 1, endLine: 1 }` ONLY when `quote` cannot be located inside
 *   `rawText` at all (stale selection, cross-artifact copy, empty quote) — never when the quote IS
 *   present in `rawText`; that path always returns its real line span.
 * @param artifact Artifact name/identifier the fragment came from.
 * @param rawText Full raw source text of `artifact`.
 * @param quote Selected fragment (already trimmed by the caller, but re-trimmed here defensively).
 * @returns Concrete origin — real line range when `quote` resolves, `{1,1}` sentinel otherwise.
 */
export function resolveOrigin(artifact: string, rawText: string, quote: string): ContextChipOrigin {
  const trimmedQuote = quote.trim();
  if (!trimmedQuote) return { artifact, startLine: 1, endLine: 1 };

  const located = locateQuote(rawText, trimmedQuote);
  if (!located) return { artifact, startLine: 1, endLine: 1 };

  return {
    artifact,
    startLine: lineNumberAtOffset(rawText, located.start),
    endLine: lineNumberAtOffset(rawText, Math.max(located.start, located.end - 1)),
  };
}

/**
 * @purpose Whole-artifact origin for a `mention`-kind chip (D-115) — coarse by design (Risk
 *   accepted): the fragment IS the whole file, so the range spans line 1 to the last line.
 * @param artifact Artifact name/identifier.
 * @param rawText Full raw source text of `artifact`.
 * @returns Origin spanning the entire artifact.
 */
export function resolveWholeArtifactOrigin(artifact: string, rawText: string): ContextChipOrigin {
  const lineCount = rawText.length === 0 ? 1 : rawText.split('\n').length;
  return { artifact, startLine: 1, endLine: lineCount };
}
