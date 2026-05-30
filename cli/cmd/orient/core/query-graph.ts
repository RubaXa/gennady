// @file: Build architecture dependency graph from consumer annotations — S7 scenario.
// @consumers: OrientCommand
// @tasks: TSK-55

import type { ScannedFile, GraphNode } from '../orient.types.ts';
import { basename } from 'node:path';

/**
 * @purpose Build a consumer dependency graph from scanned files.
 * @invariant Consumer names are extracted from @consumers: headers.
 * @invariant Consumer name matching a file name resolves to that file; otherwise it is a text node.
 * @param files All scanned project files.
 * @returns Map of consumer name to GraphNode.
 */
export function buildGraph(files: ScannedFile[]): Map<string, GraphNode> {
  const graph = new Map<string, GraphNode>();

  const fileNames = new Map<string, string>();
  for (const f of files) {
    const name = basename(f.absPath, '.ts');
    fileNames.set(name, f.absPath);
  }

  for (const f of files) {
    for (const c of f.header.consumers) {
      let node = graph.get(c);
      if (!node) {
        const resolved = fileNames.has(c);
        node = {
          consumer: c,
          files: resolved ? [fileNames.get(c)!] : [],
          consumedBy: [],
          unresolved: !resolved,
        };
        graph.set(c, node);
      }
      node.files.push(f.absPath);
    }
  }

  for (const f of files) {
    for (const c of f.header.consumers) {
      const node = graph.get(c);
      if (!node) continue;
      // Collect who depends on whom
      const fileName = basename(f.absPath, '.ts');
      if (node.consumer !== fileName) {
        if (!node.consumedBy.includes(fileName)) {
          node.consumedBy.push(fileName);
        }
      }
    }
  }

  return graph;
}

/**
 * @purpose Build a recursive dependency tree from the flat graph.
 * @invariant Detects and marks circular dependencies with `[circular]`.
 * @param graph Flat graph map from buildGraph.
 * @param rootConsumer Root consumer name to start from.
 * @param maxDepth Maximum recursion depth.
 * @returns Indented tree lines.
 */
export function buildRecursiveTree(
  graph: Map<string, GraphNode>,
  rootConsumer: string,
  maxDepth: number
): string[] {
  const visited = new Set<string>();
  const lines: string[] = [];

  function recurse(name: string, depth: number, indent: string): void {
    if (depth > maxDepth) {
      lines.push(`${indent}... more`);
      return;
    }
    if (visited.has(name)) {
      lines.push(`${indent}${name} [circular]`);
      return;
    }
    visited.add(name);

    const node = graph.get(name);
    if (!node) {
      lines.push(`${indent}${name} (unresolved)`);
      return;
    }

    lines.push(`${indent}${name}`);
    for (const consumer of node.consumedBy) {
      recurse(consumer, depth + 1, `${indent}  `);
    }
  }

  recurse(rootConsumer, 0, '');
  return lines;
}
