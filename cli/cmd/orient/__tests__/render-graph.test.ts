// @file: Unit tests for renderGraph and renderRecursiveGraph — S7 architecture graph rendering.
// @consumers: OrientCommand
// @tasks: TSK-55

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderGraph, renderRecursiveGraph } from '../render/render-graph.ts';
import type { GraphNode } from '../orient.types.ts';

describe('renderGraph', () => {
  it('flat render: shows "Project dependencies:" header', () => {
    const graph = new Map<string, GraphNode>();
    graph.set('ConsumerA', {
      consumer: 'ConsumerA',
      files: ['/project/a.ts'],
      consumedBy: [],
      unresolved: false,
    });
    const lines = renderGraph(graph);
    assert.ok(lines.includes('Project dependencies:'));
    assert.ok(lines.some((l) => l.includes('ConsumerA')));
  });

  it('flat render: shows "No consumer dependencies found" for empty graph', () => {
    const graph = new Map<string, GraphNode>();
    const lines = renderGraph(graph);
    assert.deepStrictEqual(lines, ['No consumer dependencies found']);
  });

  it('flat render: shows file paths under consumer', () => {
    const graph = new Map<string, GraphNode>();
    graph.set('ServiceA', {
      consumer: 'ServiceA',
      files: ['/project/src/service.ts', '/project/src/handler.ts'],
      consumedBy: [],
      unresolved: false,
    });
    const lines = renderGraph(graph);
    assert.ok(lines.some((l) => l.includes('service.ts')));
    assert.ok(lines.some((l) => l.includes('handler.ts')));
  });

  it('flat render: marks unresolved consumers', () => {
    const graph = new Map<string, GraphNode>();
    graph.set('ExternalTool', {
      consumer: 'ExternalTool',
      files: ['/project/src/caller.ts'],
      consumedBy: [],
      unresolved: true,
    });
    const lines = renderGraph(graph);
    assert.ok(lines.some((l) => l.includes('unresolved')));
  });
});

describe('renderRecursiveGraph', () => {
  it('recursive render: returns tree lines unchanged', () => {
    const treeLines = ['Root', '  Child1', '  Child2'];
    const result = renderRecursiveGraph(treeLines);
    assert.deepStrictEqual(result, treeLines);
  });
});
