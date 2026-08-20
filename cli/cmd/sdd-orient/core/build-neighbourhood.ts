// @file: Assemble the depth-1 neighbourhood model for one spec: portal line, direct neighbours, and consumers. Pure; rendering is separate.
// @consumers: SddOrientCommand

import { dirname, join, relative, resolve } from 'node:path';
import { parseScopes, parseScopeGraphEdges, type Scope } from '../../../../shared/sdd/portal.ts';
import { hasAnySectionMarker } from '../../../../shared/sdd/legacy-headings.ts';
import { detectSpecKind, type SpecKind } from './spec-kind.ts';
import { parseModuleMap, parseModuleMapGraph, type ModuleMapEntry } from './parse-scope.ts';
import {
  parseModuleContracts,
  parseModuleEntities,
  parseModuleRequirements,
  type ModuleContract,
  type ModuleRequirement,
} from './parse-module.ts';
import { fsSpecSectionSource, type SpecSectionSource } from './spec-section-source.ts';

/** @purpose One direct (depth-1) neighbour of the target spec. */
export type NeighbourEntry = {
  /** @purpose Neighbour's name (module or scope). */
  name: string;
  /** @purpose Whether the neighbour is a sibling module or a cross-scope reference. */
  kind: 'module' | 'scope';
  /** @purpose Path relative to `root`, for display. */
  path: string;
  /** @purpose True when the neighbour's file could not be read — path resolved, content did not. */
  unreadable: boolean;
  /** @purpose True when the neighbour file carries no v2 `<!--SECTION-->` marker (legacy format). */
  legacy: boolean;
  /** @purpose Entity Inventory names, module kind only. */
  entities: string[];
  /** @purpose Port/Adapter/Service names + kind, module kind only. */
  contracts: ModuleContract[];
  /** @purpose Requirement id + short title, module kind only. */
  requirements: ModuleRequirement[];
  /** @purpose Module Map of a scope-kind neighbour, so it shows something too. */
  modules: ModuleMapEntry[];
};

/** @purpose The full depth-1 neighbourhood model `renderNeighbourhood` needs. */
export type Neighbourhood = {
  /** @purpose Target path, relative to `root`. */
  targetPath: string;
  /** @purpose Target's classification: module, scope, or unknown. */
  targetKind: SpecKind;
  /** @purpose Scope this target belongs to, by path convention. */
  scopeName: string;
  /** @purpose Scope type from the portal's Scopes table, or null when unknown. */
  scopeType: string | null;
  /** @purpose Whether specs/README.md (the portal) was found. */
  portalFound: boolean;
  /** @purpose Scope names the target's own scope depends on (portal Scope Graph, sorted). */
  dependsOnScopes: string[];
  /** @purpose Direct depth-1 neighbours. */
  neighbours: NeighbourEntry[];
  /** @purpose Names depending on the target (reverse edge), sorted. */
  consumers: string[];
};

const SPEC_STEM = /([^/\\]+)\.(?:1-spec|spec)\.md$/;

/** @purpose Filename stem of a spec path (module/scope name by file-naming convention). | @param p A `.spec.md` path. | @returns The stem, or the whole basename when the suffix doesn't match. */
function specStem(p: string): string {
  return SPEC_STEM.exec(p)?.[1] ?? p;
}

/** @purpose First path segment under `specs/` — the scope directory name, by project layout convention (`specs/<scope>/...`), independent of spec format. | @param relPath Path relative to project root, forward- or back-slashed. | @returns The scope name, or '' when the path carries no `specs/` segment. */
function deriveScopeName(relPath: string): string {
  const segs = relPath.split(/[\\/]/);
  const i = segs.indexOf('specs');
  return segs[(i === -1 ? -1 : i) + 1] ?? '';
}

/**
 * @purpose Resolve one graph-node name to an actual spec file — module, scope, or unresolved.
 * @invariant Tries Module Map, then portal, then a conventional `specs/<name>/<name>.spec.md`
 *   guess. An unresolved name returns null; the caller drops it, never fabricating a path.
 */
function resolveNode(
  root: string,
  name: string,
  moduleMap: ModuleMapEntry[],
  scopeDir: string,
  scopes: Scope[],
  source: SpecSectionSource
): { name: string; kind: 'module' | 'scope'; absPath: string } | null {
  const asModule = moduleMap.find((m) => m.name === name);
  if (asModule) return { name, kind: 'module', absPath: resolve(scopeDir, asModule.path) };

  const asScope = scopes.find((s) => s.name === name);
  if (asScope?.specPath) {
    return { name, kind: 'scope', absPath: resolve(join(root, 'specs'), asScope.specPath) };
  }

  const guess = join(root, 'specs', name, `${name}.spec.md`);
  if (source.read(guess) !== null) return { name, kind: 'scope', absPath: guess };

  return null;
}

/** @purpose Read + parse one resolved node into a full NeighbourEntry. */
function buildEntry(
  root: string,
  name: string,
  kind: 'module' | 'scope',
  absPath: string,
  source: SpecSectionSource
): NeighbourEntry {
  const path = relative(root, absPath) || absPath;
  const content = source.read(absPath);
  if (content === null) {
    return {
      name,
      kind,
      path,
      unreadable: true,
      legacy: false,
      entities: [],
      contracts: [],
      requirements: [],
      modules: [],
    };
  }
  const legacy = !hasAnySectionMarker(content);
  if (kind === 'scope') {
    return {
      name,
      kind,
      path,
      unreadable: false,
      legacy,
      entities: [],
      contracts: [],
      requirements: [],
      modules: parseModuleMap(content),
    };
  }
  return {
    name,
    kind,
    path,
    unreadable: false,
    legacy,
    entities: parseModuleEntities(content),
    contracts: parseModuleContracts(content),
    requirements: parseModuleRequirements(content),
    modules: [],
  };
}

/**
 * @purpose Build the depth-1 neighbourhood model for one target spec.
 * @invariant Depth is always 1 — neighbours come from Module Map entries or graph nodes
 *   touching the target's name; no recursion, so cycles can't loop.
 * @param root Absolute project root (the portal is read from `<root>/specs/README.md`).
 * @param targetPath Absolute path of the resolved target spec.
 * @param targetContent The target spec's own content (already read by the caller's resolver).
 * @param [source] SpecSectionSource — defaults to the real filesystem; tests inject a fixture.
 * @returns The assembled Neighbourhood, never throwing — every missing input degrades to an honest empty field.
 */
export function buildNeighbourhood(
  root: string,
  targetPath: string,
  targetContent: string,
  source: SpecSectionSource = fsSpecSectionSource
): Neighbourhood {
  const targetKind = detectSpecKind(targetContent);
  const relTarget = relative(root, targetPath) || targetPath;
  const scopeName = deriveScopeName(relTarget);

  const portalContent = source.read(join(root, 'specs', 'README.md'));
  const portalFound = portalContent !== null;
  const scopes = portalContent ? parseScopes(portalContent) : [];
  const portalEdges = portalContent ? parseScopeGraphEdges(portalContent) : [];
  const scopeType = scopes.find((s) => s.name === scopeName)?.type ?? null;
  const dependsOnScopes = [
    ...new Set(portalEdges.filter((e) => e.from === scopeName).map((e) => e.to)),
  ].sort();
  const consumerScopes = [
    ...new Set(portalEdges.filter((e) => e.to === scopeName).map((e) => e.from)),
  ].sort();

  const base: Omit<Neighbourhood, 'neighbours' | 'consumers'> = {
    targetPath: relTarget,
    targetKind,
    scopeName,
    scopeType,
    portalFound,
    dependsOnScopes,
  };

  if (targetKind === 'unknown') return { ...base, neighbours: [], consumers: [] };

  if (targetKind === 'scope') {
    const modules = parseModuleMap(targetContent);
    const neighbours = modules.map((m) =>
      buildEntry(root, m.name, 'module', resolve(dirname(targetPath), m.path), source)
    );
    return { ...base, neighbours, consumers: consumerScopes };
  }

  // module
  const moduleName = specStem(relTarget);
  const scopeSpecPath = join(root, 'specs', scopeName, `${scopeName}.spec.md`);
  const scopeContent = source.read(scopeSpecPath);
  if (scopeContent === null) return { ...base, neighbours: [], consumers: [] };

  const moduleMap = parseModuleMap(scopeContent);
  const graphEdges = parseModuleMapGraph(scopeContent);
  const dependsOnNames = new Set(graphEdges.filter((e) => e.from === moduleName).map((e) => e.to));
  const providesToNames = new Set(graphEdges.filter((e) => e.to === moduleName).map((e) => e.from));
  const neighbourNames = [...new Set([...dependsOnNames, ...providesToNames])];

  const scopeDir = dirname(scopeSpecPath);
  const neighbours: NeighbourEntry[] = [];
  for (const name of neighbourNames) {
    const resolved = resolveNode(root, name, moduleMap, scopeDir, scopes, source);
    if (resolved)
      neighbours.push(buildEntry(root, resolved.name, resolved.kind, resolved.absPath, source));
  }

  return { ...base, neighbours, consumers: [...providesToNames].sort() };
}
