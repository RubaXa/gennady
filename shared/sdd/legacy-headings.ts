// @file: Extract a v1 (pre-marker) spec section body by fuzzy heading match — numbering-stripped, case-insensitive — for specs never anchored with <!--SECTION--> markers.
// @consumers: sdd-orient.cmd

import { collectHeadings } from './section.ts';

/**
 * @purpose Strip a heading's leading numbering (`4.`, `9.2.1 `) so it matches a canonical-section
 *   regexp regardless of the document's own scheme.
 * @param text Raw heading text (without the leading `#`s).
 * @returns The heading text with any leading `<int>(.<int>)*.` prefix and its space removed.
 */
export function stripHeadingNumbering(text: string): string {
  return text.replace(/^\d+(?:\.\d+)*\.?\s*/, '').trim();
}

/**
 * @purpose Extract one legacy (unanchored) heading's body, up to the next same-or-shallower heading.
 * @invariant Matches `matcher` against the numbering-stripped heading text, so a spec's own
 *   numbering never affects whether the section is found.
 * @invariant Only headings at exactly `level` are match candidates (default 2, i.e. `##`) — where
 *   every canonical v1 section lives.
 * @param content Full markdown text of the artifact.
 * @param matcher Regexp tested against the numbering-stripped heading text.
 * @param [level] Heading level to match against (2 for `##`). Defaults to 2.
 * @returns The trimmed body text, or null when no heading at `level` matches `matcher`.
 */
export function legacySpecSectionBody(content: string, matcher: RegExp, level = 2): string | null {
  const headings = collectHeadings(content);
  const idx = headings.findIndex(
    (h) => h.level === level && matcher.test(stripHeadingNumbering(h.text))
  );
  if (idx === -1) return null;

  const h = headings[idx] as { level: number; text: string; start: number; lineEnd: number };
  let end = content.length;
  for (let i = idx + 1; i < headings.length; i++) {
    const next = headings[i] as { level: number; start: number };
    if (next.level <= level) {
      end = next.start;
      break;
    }
  }
  return content.slice(h.lineEnd, end).trim();
}

/**
 * @purpose True when `content` carries at least one `<!--SECTION:NAME-->` marker anywhere — the
 * signal that a spec is v2-anchored rather than legacy plain-heading format.
 * @param content Full markdown text of the artifact.
 * @returns Whether any v2 section marker is present.
 */
export function hasAnySectionMarker(content: string): boolean {
  return /<!--SECTION:[A-Z][A-Z0-9_]*-->/.test(content);
}
