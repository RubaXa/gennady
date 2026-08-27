// @file: Module-level pure lookups over the role graph — node resolution and edge resolution.
// @consumers: role-instance.ts
// @tasks: N/A

import type { RoleGraph, RoleNode, EdgeCondition, Edge } from '../role-node.ts';

/**
 * @purpose Find a node in the graph by id.
 * @param graph The role graph.
 * @param nodeId Node identifier.
 * @returns The node if found, undefined otherwise.
 */
export function findNode(graph: RoleGraph, nodeId: string): RoleNode | undefined {
  return graph.nodes.find((n) => n.id === nodeId);
}

/**
 * @purpose Resolve the edge to follow from a node given a condition.
 * @param graph The role graph.
 * @param fromNodeId Source node identifier.
 * @param condition Trigger condition.
 * @returns The matched edge, or undefined if no edge matches.
 */
export function resolveEdge(
  graph: RoleGraph,
  fromNodeId: string,
  condition: EdgeCondition
): Edge | undefined {
  return graph.edges.find((e) => e.from === fromNodeId && e.on === condition);
}
