// @file: Unit tests for buildGraph and buildRecursiveTree — S7 architecture dependency graph.
// @consumers: OrientCommand
// @tasks: TSK-55

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, buildRecursiveTree } from '../core/query-graph.ts';
import type { ScannedFile } from '../orient.types.ts';

function makeFile(absPath: string, consumers: string[]): ScannedFile {
  return {
    absPath,
    header: { file: 'test file', tasks: [], consumers },
    exports: [],
  };
}

describe('buildGraph', () => {
  it('flat graph: builds from consumer annotations', () => {
    const files = [
      makeFile('/project/src/cmpA.ts', ['CmpB']),
      makeFile('/project/src/cmpB.ts', ['CmpC']),
    ];
    const graph = buildGraph(files);

    assert.ok(graph.has('CmpB'));
    assert.ok(graph.has('CmpC'));
    const nodeB = graph.get('CmpB')!;
    assert.ok(nodeB.files.some((f) => f.includes('cmpA')));
  });

  it('empty graph: returns empty map', () => {
    const files = [makeFile('/project/src/a.ts', []), makeFile('/project/src/b.ts', [])];
    const graph = buildGraph(files);
    assert.strictEqual(graph.size, 0);
  });

  it('unresolved consumer: marks as text-only reference', () => {
    const files = [makeFile('/project/src/a.ts', ['ExternalTool'])];
    const graph = buildGraph(files);

    assert.ok(graph.has('ExternalTool'));
    const node = graph.get('ExternalTool')!;
    assert.strictEqual(node.unresolved, true);
    assert.strictEqual(node.files.length, 1);
    assert.ok(node.files[0].includes('a.ts'));
  });

  it('resolves consumer matching a file name', () => {
    const files = [
      makeFile('/project/src/consumer.ts', ['SomeService']),
      makeFile('/project/src/SomeService.ts', []),
    ];
    const graph = buildGraph(files);

    const node = graph.get('SomeService')!;
    assert.strictEqual(node.unresolved, false);
  });
});

describe('buildRecursiveTree', () => {
  it('recursive graph: builds tree from root consumer', () => {
    const files = [makeFile('/project/src/b.ts', ['A']), makeFile('/project/src/c.ts', ['B'])];
    const graph = buildGraph(files);
    const lines = buildRecursiveTree(graph, 'A', Infinity);

    assert.ok(lines.length > 0);
    assert.ok(lines.some((l) => l.includes('A')));
  });

  it('recursive graph with depth: limits recursion', () => {
    const files = [
      makeFile('/project/src/B.ts', ['A']),
      makeFile('/project/src/C.ts', ['B']),
      makeFile('/project/src/D.ts', ['C']),
    ];
    const graph = buildGraph(files);
    const lines = buildRecursiveTree(graph, 'A', 0);

    const moreLine = lines.find((l) => l.includes('more'));
    assert.ok(moreLine, `expected truncation indicator, got: ${lines.join('\n')}`);
  });

  it('circular dependencies: marks [circular] and does not loop', () => {
    const files = [makeFile('/project/src/A.ts', ['B']), makeFile('/project/src/B.ts', ['A'])];
    const graph = buildGraph(files);
    const lines = buildRecursiveTree(graph, 'A', 10);

    const circularLine = lines.find((l) => l.includes('[circular]'));
    assert.ok(circularLine);
  });
});
