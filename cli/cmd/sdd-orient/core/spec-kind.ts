// @file: Classify a spec's content as module vs scope vs unknown — v2 marker first, legacy heading/title fallback so pre-marker specs classify too.
// @consumers: buildNeighbourhood

import { stripHeadingNumbering } from '../../../../shared/sdd/legacy-headings.ts';

/** @purpose What a spec was classified as. */
export type SpecKind = 'module' | 'scope' | 'unknown';

const MODULE_VISION_HEADING = /^module vision$/i;
const MODULE_TITLE = /^#\s*module\s*:/im;
const SCOPE_TYPE_HEADING = /^scope-type$/i;

/**
 * @purpose Classify spec content as a module spec, a scope spec, or unknown.
 * @invariant Mirrors `check.ts`'s v2 rule (MODULE_VISION ⇒ module; SCOPE_TYPE alone ⇒ scope),
 *   plus a legacy fallback: a Module Vision heading, or a `# Module:` title.
 * @param content Full spec markdown.
 * @returns 'module' | 'scope' | 'unknown'.
 */
export function detectSpecKind(content: string): SpecKind {
  const hasModuleMarker = content.includes('<!--SECTION:MODULE_VISION-->');
  const hasScopeMarker = content.includes('<!--SECTION:SCOPE_TYPE-->');

  const isModule =
    hasModuleMarker ||
    (!hasScopeMarker &&
      (MODULE_TITLE.test(content) || headingMatches(content, MODULE_VISION_HEADING)));
  if (isModule) return 'module';

  const isScope = hasScopeMarker || headingMatches(content, SCOPE_TYPE_HEADING);
  if (isScope) return 'scope';

  return 'unknown';
}

/**
 * @purpose Whether any numbering-stripped level-2 heading matches `matcher` — an existence check,
 *   not a body extraction (that's `spec-sections.ts` / `legacy-headings.ts`).
 * @param content Full spec markdown.
 * @param matcher Regexp tested against each numbering-stripped level-2 heading text.
 * @returns Whether some heading matched.
 */
function headingMatches(content: string, matcher: RegExp): boolean {
  return [...content.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)].some((m) =>
    matcher.test(stripHeadingNumbering(m[1] ?? ''))
  );
}
