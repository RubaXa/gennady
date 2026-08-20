// @file: Format-agnostic section lookup — v2 marker first, legacy numbered-heading fallback second. Decides which text is a section's body.
// @consumers: parseModuleEntities, parseModuleContracts, parseModuleRequirements, parseModuleMap, buildNeighbourhood

import { extractSection } from '../../../../shared/sdd/section.ts';
import { legacySpecSectionBody } from '../../../../shared/sdd/legacy-headings.ts';

/** @purpose Canonical section names sdd-orient reads — the v2 marker names it needs, plus the scope-level pair. */
export type SpecSectionName =
  | 'ENTITY_INVENTORY'
  | 'MODULE_CONTRACTS'
  | 'MODULE_REQUIREMENTS'
  | 'REQUIREMENTS_AND_CONSTRAINTS'
  | 'INTER_MODULE_DEPENDENCIES'
  | 'MODULE_MAP';

// Legacy heading text, numbering stripped, that stands in for each canonical name in a pre-marker
// spec. Anchored where a false match is plausible: `^requirements\b` deliberately does NOT match
// "Bootstrap Requirements" (that heading starts with "Bootstrap", not "Requirements").
const LEGACY_MATCHERS: Record<SpecSectionName, RegExp> = {
  ENTITY_INVENTORY: /entity inventory/i,
  MODULE_CONTRACTS: /module contracts/i,
  MODULE_REQUIREMENTS: /^requirements\b/i,
  REQUIREMENTS_AND_CONSTRAINTS: /^requirements\b/i,
  INTER_MODULE_DEPENDENCIES: /inter-module dependencies/i,
  MODULE_MAP: /module map/i,
};

/**
 * @purpose Get one canonical section's body, whichever format the spec was written in.
 * @invariant Tries the v2 marker first, then the legacy heading search — harmless, since a v2
 *   spec has no numbered headings to false-match.
 * @param content Full spec markdown.
 * @param name Canonical section name to look up.
 * @returns The trimmed section body, or null when neither format carries it.
 */
export function findSpecSection(content: string, name: SpecSectionName): string | null {
  const v2 = extractSection(content, name);
  if (v2.status === 'ok') return v2.content;
  return legacySpecSectionBody(content, LEGACY_MATCHERS[name]);
}
