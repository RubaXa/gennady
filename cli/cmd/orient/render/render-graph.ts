// @file: Render architecture dependency graph — S7 scenario (flat and recursive).
// @consumers: OrientCommand
// @tasks: TSK-55

import type { GraphNode } from '../orient.types.ts';

/**
 * @purpose Render a flat consumer dependency graph.
 * @param graph Map of consumer name to GraphNode.
 * @returns Array of formatted output lines.
 */
export function renderGraph(graph: Map<string, GraphNode>): string[] {
  const lines: string[] = [];
  if (graph.size === 0) {
    lines.push('No consumer dependencies found');
    return lines;
  }

  lines.push('Project dependencies:');

  for (const [name, node] of [...graph.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`  ${name} consumes:`);
    const uniqueFiles = [...new Set(node.files)].sort();
    for (const f of uniqueFiles) {
      lines.push(`    ${f}`);
    }
    if (node.unresolved) {
      lines.push(`    (unresolved — text-only reference)`);
    }
  }

  return lines;
}

/**
 * @purpose Render a recursive dependency graph as indented tree.
 * @param treeLines Pre-computed recursive tree lines.
 * @returns Array of formatted output lines.
 */
export function renderRecursiveGraph(treeLines: string[]): string[] {
  return treeLines;
}
