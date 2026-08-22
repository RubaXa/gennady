// @file: Structural lint over every artifact skeleton in templates.ts — a skeleton must not disagree
//   with itself: no two consecutive headings share text, no orphan `###` subheading duplicating its
//   `##` parent verbatim, and no two headings collide inside one SECTION span. Guards the class behind
//   a real incident: the module skeleton once carried `## Requirements` immediately followed by a lone
//   `### Requirements` — copied from the scope skeleton, where that same subheading has siblings (###
//   Out-of-Scope, ### Runtime & Deferred Scope, …) and is not an orphan there.
// @consumers: templates
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, ARTIFACT_KINDS } from '../templates.ts';
import { collectHeadings } from '../section.ts';

type Heading = ReturnType<typeof collectHeadings>[number];

/** @purpose One flat `<!--SECTION:X--> … <!--/SECTION:X-->` span, by character offset into `content`. */
type SectionSpan = { name: string; start: number; end: number };

/**
 * @purpose Every SECTION span in `content`, matched on trimmed marker lines (mirrors section.ts's own
 *   marker matching, so indentation a formatter adds never hides a span).
 * @param content Full skeleton markdown.
 * @returns One span per open/close marker pair encountered, in document order; an unmatched close is
 *   dropped (nothing to pair it with) rather than mis-pairing to the wrong open.
 */
function sectionSpans(content: string): SectionSpan[] {
  const spans: SectionSpan[] = [];
  const stack: { name: string; start: number }[] = [];
  let offset = 0;
  for (const line of content.split('\n')) {
    const t = line.trim();
    const o = /^<!--SECTION:([A-Z][A-Z0-9_]*)-->$/.exec(t);
    const c = /^<!--\/SECTION:([A-Z][A-Z0-9_]*)-->$/.exec(t);
    if (o?.[1]) {
      stack.push({ name: o[1], start: offset });
    } else if (c?.[1]) {
      const top = stack.pop();
      if (top) spans.push({ name: top.name, start: top.start, end: offset });
    }
    offset += line.length + 1;
  }
  return spans;
}

/**
 * @purpose Headings whose trimmed text is identical to the immediately preceding heading's, at any
 *   levels — a heading immediately repeating itself always signals a copy/paste seam, never a real
 *   document structure.
 * @param headings Document-order headings from `collectHeadings`.
 * @returns The repeated text, once per offending pair.
 */
function consecutiveDuplicates(headings: Heading[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < headings.length; i++) {
    const prev = (headings[i - 1] as Heading).text.trim();
    const cur = (headings[i] as Heading).text.trim();
    if (prev === cur) out.push(cur);
  }
  return out;
}

/**
 * @purpose A `###` heading that is the ONLY level-3 heading nested under its `##` parent, and whose
 *   text duplicates the parent's verbatim — the orphan-subheading shape: a `###` subheading makes
 *   sense next to siblings (it exists to distinguish itself from them); alone, and repeating the
 *   parent's own title, it carries no information the `##` heading didn't already give.
 * @param headings Document-order headings from `collectHeadings`.
 * @returns The parent/child text, once per offending `##` section.
 */
function orphanSubheadings(headings: Heading[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < headings.length; i++) {
    const parent = headings[i] as Heading;
    if (parent.level !== 2) continue;
    const parentText = parent.text.trim();
    const level3Children: Heading[] = [];
    let j = i + 1;
    while (j < headings.length && (headings[j] as Heading).level > 2) {
      if ((headings[j] as Heading).level === 3) level3Children.push(headings[j] as Heading);
      j++;
    }
    if (level3Children.length === 1 && (level3Children[0] as Heading).text.trim() === parentText) {
      out.push(parentText);
    }
  }
  return out;
}

/**
 * @purpose Heading-text collisions among headings that fall inside the same SECTION span (any
 *   levels) — a SECTION is sdd-extract's atomic unit; two same-named headings inside it are ambiguous
 *   the moment anything (a human, an anchor link, a future check) needs to name one of them.
 * @param content Full skeleton markdown (for span offsets).
 * @param headings Document-order headings from `collectHeadings`.
 * @returns `"<SECTION>: <duplicated text>"` once per offending repeat.
 */
function sectionInternalDuplicates(content: string, headings: Heading[]): string[] {
  const out: string[] = [];
  for (const span of sectionSpans(content)) {
    const inside = headings.filter((h) => h.start >= span.start && h.start < span.end);
    const seen = new Set<string>();
    for (const h of inside) {
      const key = h.text.trim();
      if (seen.has(key)) out.push(`${span.name}: "${key}"`);
      seen.add(key);
    }
  }
  return out;
}

describe('skeleton heading structure — no self-collisions', () => {
  for (const kind of ARTIFACT_KINDS) {
    const content = TEMPLATES[kind].skeleton;
    const headings = collectHeadings(content);

    it(`${kind}: no two consecutive headings share text`, () => {
      assert.deepStrictEqual(
        consecutiveDuplicates(headings),
        [],
        `${kind}: found consecutive heading(s) repeating the same text`
      );
    });

    it(`${kind}: no orphan ### subheading duplicating its ## parent`, () => {
      assert.deepStrictEqual(
        orphanSubheadings(headings),
        [],
        `${kind}: found a lone ### child copying its ## parent's text verbatim`
      );
    });

    it(`${kind}: headings inside one SECTION span are unique`, () => {
      assert.deepStrictEqual(
        sectionInternalDuplicates(content, headings),
        [],
        `${kind}: found duplicate heading text within one SECTION span`
      );
    });
  }
});
