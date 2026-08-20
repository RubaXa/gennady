// @file: Parse a scope's Module Map: module list + dependency graph edges — source of truth for neighbours, since per-module prose is inconsistent.
// @consumers: buildNeighbourhood

import { parseScopeGraphEdges, type GraphEdge } from '../../../../shared/sdd/portal.ts';
import { findSpecSection } from './spec-sections.ts';

/** @purpose One module listed in a scope's Module Map. */
export type ModuleMapEntry = {
  /** @purpose Module name. */
  name: string;
  /** @purpose Declared relative path to the module's `.spec.md`. */
  path: string;
};

const MODULE_LINK = /\[([^\]]+)\]\(([^)]+\.spec\.md)\)/g;

/**
 * @purpose The modules a scope spec's Module Map lists, name + declared relative path.
 * @invariant Only linked entries count. A prose-only mention (no `.spec.md` link) is not a
 *   neighbour — skipped, never given an invented path.
 * @invariant Link text backticks are stripped (a real `[`agent-inbox`](...)` link) to match the
 *   plain node ids the Module Map graph uses.
 * @param scopeContent Full scope-spec markdown.
 * @returns Modules in document order, deduped by name; empty when no Module Map section is found.
 */
export function parseModuleMap(scopeContent: string): ModuleMapEntry[] {
  const body = findSpecSection(scopeContent, 'MODULE_MAP');
  if (body === null) return [];
  const seen = new Set<string>();
  const out: ModuleMapEntry[] = [];
  for (const m of body.matchAll(MODULE_LINK)) {
    const name = m[1]?.trim().replace(/`/g, '');
    const path = m[2]?.trim();
    if (!name || !path || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, path });
  }
  return out;
}

/**
 * @purpose The Inter-Module Dependency Map graph edges inside a scope spec's Module Map section.
 * @invariant Scoped to the Module Map body only — other mermaid diagrams in the file carry
 *   arrows that aren't module-dependency edges.
 * @param scopeContent Full scope-spec markdown.
 * @returns Edges in document order (solid + dotted); empty when no Module Map graph is found.
 */
export function parseModuleMapGraph(scopeContent: string): GraphEdge[] {
  const body = findSpecSection(scopeContent, 'MODULE_MAP');
  if (body === null) return [];
  return parseScopeGraphEdges(body);
}
