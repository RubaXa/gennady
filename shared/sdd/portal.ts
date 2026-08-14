// @file: Parse the Scopes table and Scope-Graph edges out of the SDD project portal (specs/README.md) — pure.
// @consumers: sdd-state.cmd, sdd-check.cmd
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
 * @purpose Render the Scope Graph as aligned ASCII dependency chains — consumer scopes on top, one line per root-to-leaf path.
 * @invariant Deterministic: adjacency/roots sort by name, independent of source order; an edge-less
 *   scope gets its own single-name line; empty when there are no edges.
 * @param scopes Scopes parsed from the portal table (supplies scope names with no graph edges).
 * @param edges Scope-Graph edges parsed via parseScopeGraphEdges.
 * @returns One line per dependency chain, then one line per edge-less scope; empty when `edges` is empty.
 */
export function renderScopeGraph(scopes: Scope[], edges: GraphEdge[]): string[] {
  if (edges.length === 0) return [];

  // #region START_ADJACENCY — sorted adjacency makes traversal order independent of edge/table order
  const outMap = new Map<string, string[]>();
  const hasIncoming = new Set<string>();
  const edgeNodes = new Set<string>();
  for (const e of edges) {
    if (!outMap.has(e.from)) outMap.set(e.from, []);
    outMap.get(e.from)?.push(e.to);
    hasIncoming.add(e.to);
    edgeNodes.add(e.from);
    edgeNodes.add(e.to);
  }
  for (const list of outMap.values()) list.sort();
  // #endregion END_ADJACENCY

  // #region START_PATHS — DFS every root (no incoming edge, has an outgoing edge) to each leaf
  const roots = [...edgeNodes]
    .filter((n) => (outMap.get(n)?.length ?? 0) > 0 && !hasIncoming.has(n))
    .sort();

  const paths: string[][] = [];
  function dfs(node: string, path: string[]): void {
    const next = outMap.get(node) ?? [];
    if (next.length === 0) {
      paths.push([...path, node]);
      return;
    }
    for (const n of next) {
      // cycle guard: a repeated node closes the chain instead of looping forever
      if (path.includes(n) || node === n) {
        paths.push([...path, node, n]);
        continue;
      }
      dfs(n, [...path, node]);
    }
  }
  for (const r of roots) dfs(r, []);
  // #endregion END_PATHS

  const lines = paths.map((p) => p.join(' ──► '));

  const isolated = scopes.map((s) => s.name).filter((n) => !edgeNodes.has(n));
  lines.push(...isolated.sort());

  return lines;
}
