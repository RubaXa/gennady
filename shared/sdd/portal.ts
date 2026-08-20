// @file: Parse the Scopes table and Scope-Graph edges out of the SDD project portal (specs/README.md) — pure.
// @consumers: sdd-state.cmd, sdd-check.cmd, sdd-orient.cmd
// @tasks: N/A

/** @purpose Lifecycle of a scope as reported by the portal status cell. */
export type ScopeStatus = 'done' | 'wip' | 'unknown';

/**
 * @purpose One row of the portal Scopes table.
 * @invariant `name` and `type` are passthrough text from the table; `status` is normalized from the ✅ / 🚧 cell.
 */
export type Scope = {
  /** @purpose Scope identifier, taken from the backtick-wrapped link text. */
  name: string;
  /** @purpose Scope type passthrough from the table: infrastructure | contracts | product | library. */
  type: string;
  /** @purpose Lifecycle normalized from the ✅ / 🚧 status cell. */
  status: ScopeStatus;
  /** @purpose One-line scope description from the Description column (the "why", for intent routing). */
  description: string;
  /** @purpose Relative spec path from the link target, or null when the cell has no link. */
  specPath: string | null;
};

/**
 * @purpose Normalize a portal status cell (✅ / 🚧 / other) to a ScopeStatus.
 * @param cell Raw text of the status column.
 * @returns `done` for ✅, `wip` for 🚧, else `unknown`.
 */
function normalizeStatus(cell: string): ScopeStatus {
  if (cell.includes('✅')) return 'done';
  if (cell.includes('🚧')) return 'wip';
  return 'unknown';
}

/**
 * @purpose Extract the scopes listed in the portal Scopes table.
 * @invariant Reads only the table under the `## Scopes` heading; the header and separator rows are skipped.
 * @invariant Scope name is taken from the backtick-wrapped link text; a row without one is ignored as non-data.
 * @param portalContent Full markdown of specs/README.md.
 * @returns One Scope per data row, in document order; empty when the section or table is absent.
 */
export function parseScopes(portalContent: string): Scope[] {
  const lines = portalContent.split('\n');

  // #region START_LOCATE_SECTION — invariant: only rows under "## Scopes" up to the next heading count
  let inScopes = false;
  const scopes: Scope[] = [];
  for (const line of lines) {
    const trimmed = line.trim();

    if (/^#{1,6}\s/.test(trimmed)) {
      inScopes = /^#{1,6}\s+Scopes\s*$/.test(trimmed);
      continue;
    }
    if (!inScopes) continue;
    if (!trimmed.startsWith('|')) continue;
    // #endregion END_LOCATE_SECTION

    // #region START_PARSE_ROW — invariant: skip header/separator; require a `name` link cell
    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
    if (cells.length < 3) continue;

    const [scopeCell, typeCell, statusCell, descCell] = cells;
    if (scopeCell === undefined || typeCell === undefined || statusCell === undefined) continue;

    // header row ("| Scope | Type | ... |") and separator ("|---|---|") carry no backticked name
    const nameMatch = scopeCell.match(/`([^`]+)`/);
    if (!nameMatch || !nameMatch[1]) continue;

    const pathMatch = scopeCell.match(/\]\(([^)]+)\)/);

    scopes.push({
      name: nameMatch[1],
      type: typeCell,
      status: normalizeStatus(statusCell),
      description: descCell?.trim() ?? '',
      specPath: pathMatch?.[1] ?? null,
    });
    // #endregion END_PARSE_ROW
  }

  return scopes;
}

/** @purpose One directed depends-on edge from the portal Scope Graph (Mermaid). */
export type GraphEdge = {
  /** @purpose Source scope node id (the dependent). */
  from: string;
  /** @purpose Target scope node id (the dependency). */
  to: string;
};

/**
 * @purpose Extract the depends-on edges from the portal's Mermaid Scope Graph.
 * @invariant Reads `A --> B` arrows only; a node label (`A[..]`) and an edge label (`-->|..|`) are stripped to bare ids; one edge per line.
 * @param portalContent Full markdown of specs/README.md.
 * @returns One edge per `-->` arrow, in document order; empty when no graph is present.
 */
export function parseGraphEdges(portalContent: string): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const arrow = /([A-Za-z0-9_-]+)(?:\[[^\]]*\])?\s*-->(?:\s*\|[^|]*\|)?\s*([A-Za-z0-9_-]+)/;
  for (const raw of portalContent.split('\n')) {
    const line = raw.trim();
    if (!line.includes('-->')) continue;
    const m = arrow.exec(line);
    if (m?.[1] && m[2]) edges.push({ from: m[1], to: m[2] });
  }
  return edges;
}

/**
 * @purpose Extract every depends-on edge from the portal's Mermaid Scope Graph, solid or dotted.
 * @invariant Reads bare `A --> B` and dotted `A -. label .-> B` arrows; both feed [GRAPH] rendering,
 *   unlike parseGraphEdges which drops dotted refs.
 * @param portalContent Full markdown of specs/README.md.
 * @returns One edge per arrow (solid or dotted), in document order; empty when no graph is present.
 */
export function parseScopeGraphEdges(portalContent: string): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const solid = /([A-Za-z0-9_-]+)(?:\[[^\]]*\])?\s*-->(?:\s*\|[^|]*\|)?\s*([A-Za-z0-9_-]+)/;
  const dotted = /([A-Za-z0-9_-]+)(?:\[[^\]]*\])?\s*-\.[^.]*\.->\s*([A-Za-z0-9_-]+)/;
  for (const raw of portalContent.split('\n')) {
    const line = raw.trim();
    if (line.includes('-->')) {
      const m = solid.exec(line);
      if (m?.[1] && m[2]) edges.push({ from: m[1], to: m[2] });
      continue;
    }
    if (line.includes('.->')) {
      const m = dotted.exec(line);
      if (m?.[1] && m[2]) edges.push({ from: m[1], to: m[2] });
    }
  }
  return edges;
}

/**
 * @purpose Find every node on a dependency cycle (self-loop or larger), via Tarjan SCC.
 * @invariant An SCC of size > 1 is a cycle; a size-1 SCC is a cycle only with a self-loop.
 * @param nodes Every node id appearing in `outMap` (as source or target).
 * @param outMap Adjacency: node → its (deduped) dependency targets.
 * @returns Node ids that participate in some cycle; empty when the graph is a DAG.
 */
function findCyclicNodes(nodes: string[], outMap: Map<string, string[]>): Set<string> {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  function strongconnect(v: string): void {
    indices.set(v, index);
    lowlink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of outMap.get(v) ?? []) {
      const wIndex = indices.get(w);
      if (wIndex === undefined) {
        strongconnect(w);
        lowlink.set(v, Math.min(lowlink.get(v) ?? index, lowlink.get(w) ?? index));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v) ?? index, wIndex));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w === undefined) break;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      sccs.push(scc);
    }
  }

  for (const n of nodes) {
    if (!indices.has(n)) strongconnect(n);
  }

  const cyclic = new Set<string>();
  for (const scc of sccs) {
    if (scc.length > 1) {
      for (const n of scc) cyclic.add(n);
      continue;
    }
    const only = scc[0];
    if (only !== undefined && (outMap.get(only) ?? []).includes(only)) cyclic.add(only);
  }
  return cyclic;
}

/**
 * @purpose Render the Scope Graph as topological layers + edges: level lines, one edges line, isolated scopes.
 * @invariant Level 0 has every node with no outgoing edge; else level is `1 + max(dependency levels)`.
 * @invariant Nodes alphabetical within a level; edge groups ordered by source level descending, name
 *   ascending; targets alphabetical.
 * @invariant A cycle (SCC size > 1, or self-loop) gets a leading warning line, then is dropped before
 *   layering the remainder — never throws.
 * @param scopes Scopes parsed from the portal table (supplies scope names with no graph edges at all).
 * @param edges Scope-Graph edges parsed via parseScopeGraphEdges.
 * @returns Warning line?, level lines, edges line?, out-of-graph line?; empty when `edges` is empty.
 */
export function renderScopeGraph(scopes: Scope[], edges: GraphEdge[]): string[] {
  if (edges.length === 0) return [];

  // #region START_ADJACENCY — dedupe targets per source, in first-seen (document) order
  const edgeNodes = new Set<string>();
  const outMap = new Map<string, string[]>();
  for (const e of edges) {
    edgeNodes.add(e.from);
    edgeNodes.add(e.to);
    const list = outMap.get(e.from) ?? [];
    if (!list.includes(e.to)) list.push(e.to);
    outMap.set(e.from, list);
  }
  const allNodes = [...edgeNodes];
  // #endregion END_ADJACENCY

  const cyclic = findCyclicNodes(allNodes, outMap);
  const lines: string[] = [];
  if (cyclic.size > 0) {
    lines.push(`⚠ цикл: ${[...cyclic].sort().join(', ')}`);
  }

  // #region START_LAYERING — longest-path layering over the acyclic remainder (cyclic nodes dropped)
  const remainderNodes = allNodes.filter((n) => !cyclic.has(n));
  const remainderOut = new Map<string, string[]>();
  for (const n of remainderNodes) {
    remainderOut.set(
      n,
      (outMap.get(n) ?? []).filter((t) => !cyclic.has(t))
    );
  }

  const levelOf = new Map<string, number>();
  function levelOfNode(n: string): number {
    const cached = levelOf.get(n);
    if (cached !== undefined) return cached;
    const deps = remainderOut.get(n) ?? [];
    let lvl = 0;
    for (const d of deps) lvl = Math.max(lvl, 1 + levelOfNode(d));
    levelOf.set(n, lvl);
    return lvl;
  }
  for (const n of remainderNodes) levelOfNode(n);

  const byLevel = new Map<number, string[]>();
  for (const n of remainderNodes) {
    const lvl = levelOf.get(n) ?? 0;
    const arr = byLevel.get(lvl) ?? [];
    arr.push(n);
    byLevel.set(lvl, arr);
  }
  const maxLevel = byLevel.size === 0 ? -1 : Math.max(...byLevel.keys());
  // #endregion END_LAYERING

  for (let lvl = 0; lvl <= maxLevel; lvl++) {
    const names = (byLevel.get(lvl) ?? []).sort();
    if (names.length === 0) continue;
    const label = lvl === 0 ? 'уровень 0 (фундамент)' : `уровень ${lvl}`;
    lines.push(`${label}: ${names.join(', ')}`);
  }

  // #region START_EDGES_LINE — grouped by source: level descending, then source name ascending
  const sources = remainderNodes
    .filter((n) => (remainderOut.get(n)?.length ?? 0) > 0)
    .sort((a, b) => {
      const byLvl = (levelOf.get(b) ?? 0) - (levelOf.get(a) ?? 0);
      return byLvl !== 0 ? byLvl : a.localeCompare(b);
    });
  if (sources.length > 0) {
    const groups = sources.map((src) => {
      const targets = [...(remainderOut.get(src) ?? [])].sort();
      return `${src} → ${targets.join(', ')}`;
    });
    lines.push(`рёбра: ${groups.join(' · ')}`);
  }
  // #endregion END_EDGES_LINE

  // #region START_OUT_OF_GRAPH — scopes untouched by any edge (source or target), original + cyclic
  const outOfGraph = scopes
    .map((s) => s.name)
    .filter((n) => !edgeNodes.has(n))
    .sort();
  if (outOfGraph.length > 0) {
    lines.push(`вне графа: ${outOfGraph.join(', ')}`);
  }
  // #endregion END_OUT_OF_GRAPH

  return lines;
}
