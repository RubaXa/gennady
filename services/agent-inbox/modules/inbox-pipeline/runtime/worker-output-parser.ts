// @file: Pure validation of raw worker structured output (findings, diagrams) before durable persistence.
// @consumers: PipelineRuntime
// @tasks: TSK-157

import type { ModelResult } from '../synthesize.ts';

/**
 * @purpose Validate model findings before they enter durable review artifacts.
 * @param value Raw structured output field from the worker.
 * @param taskType Concrete worker type used in failure context.
 * @returns Valid review findings only.
 */
export function parseFindings(value: unknown, taskType: string): ModelResult['findings'] {
  if (!Array.isArray(value))
    throw new Error(`[PipelineRuntime#_parseFindings] ${taskType} returned no findings array`);
  return value.map((entry) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof (entry as Record<string, unknown>).file !== 'string' ||
      typeof (entry as Record<string, unknown>).line !== 'number' ||
      typeof (entry as Record<string, unknown>).summary !== 'string' ||
      !['error', 'warning', 'info'].includes(String((entry as Record<string, unknown>).severity))
    )
      throw new Error(`[PipelineRuntime#_parseFindings] ${taskType} returned invalid finding`);
    const finding = entry as {
      file: string;
      line: number;
      summary: string;
      severity: 'error' | 'warning' | 'info';
      diff?: Array<{ type: 'context' | 'add' | 'remove'; num?: number; text: string }>;
      factcheck?: 'verified' | 'pending' | 'debunked';
    };
    const diff = Array.isArray(finding.diff)
      ? finding.diff.filter(
          (line) =>
            !!line &&
            ['context', 'add', 'remove'].includes(line.type) &&
            typeof line.text === 'string'
        )
      : undefined;
    const factcheck = ['verified', 'pending', 'debunked'].includes(String(finding.factcheck))
      ? finding.factcheck
      : undefined;
    return { ...finding, diff, factcheck };
  });
}

/**
 * @purpose Validate optional structured diagram projections before durable synthesis.
 * @param value Raw structured output field from the worker.
 * @param taskType Concrete worker type used in failure context.
 * @returns Valid diagram projections, or an empty array when absent.
 */
export function parseDiagrams(value: unknown, taskType: string): ModelResult['diagrams'] {
  if (value === undefined) return [];
  if (!Array.isArray(value))
    throw new Error(`[PipelineRuntime#_parseDiagrams] ${taskType} returned invalid diagrams`);
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== 'object')
      throw new Error(`[PipelineRuntime#_parseDiagrams] ${taskType} returned invalid diagram`);
    const diagram = candidate as NonNullable<ModelResult['diagrams']>[number];
    if (
      !['change-map', 'c4', 'behaviour', 'use-cases'].includes(diagram.kind) ||
      typeof diagram.title !== 'string' ||
      typeof diagram.caption !== 'string' ||
      !Array.isArray(diagram.nodes) ||
      !Array.isArray(diagram.edges) ||
      diagram.nodes.some(
        (node) => !node || typeof node.id !== 'string' || typeof node.label !== 'string'
      ) ||
      diagram.edges.some(
        (edge) => !edge || typeof edge.from !== 'string' || typeof edge.to !== 'string'
      )
    )
      throw new Error(`[PipelineRuntime#_parseDiagrams] ${taskType} returned invalid diagram`);
    return diagram;
  });
}
