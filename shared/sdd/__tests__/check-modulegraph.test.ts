// @file: Unit tests for checkModuleGraph / moduleGraphEdges (module dependency cycle detection).
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkModuleGraph, moduleGraphEdges } from '../check.ts';

const section = (graph: string): string =>
  `<!--SECTION:INTER_MODULE_DEPENDENCIES-->\n## 9. Inter-Module Dependencies\n\n\`\`\`mermaid\ngraph TD\n${graph}\n\`\`\`\n<!--/SECTION:INTER_MODULE_DEPENDENCIES-->`;

describe('moduleGraphEdges', () => {
  it('parses solid arrows from ## 9', () => {
    const edges = moduleGraphEdges(section('  diff --> model\n  observe --> diff'));
    assert.deepStrictEqual(edges, [
      { from: 'diff', to: 'model' },
      { from: 'observe', to: 'diff' },
    ]);
  });

  it('ignores dotted cross-scope edges', () => {
    const edges = moduleGraphEdges(section('  diff --> model\n  diff -. Scope Reference .-> vcs'));
    assert.deepStrictEqual(edges, [{ from: 'diff', to: 'model' }]);
  });

  it('no section → no edges', () => {
    assert.deepStrictEqual(moduleGraphEdges('# Module: x\nno deps section'), []);
  });
});

describe('checkModuleGraph', () => {
  const file = 'specs/s/s.spec.md';

  it('an acyclic module graph → no findings', () => {
    const edges = [
      { from: 'diff', to: 'model' },
      { from: 'observe', to: 'diff' },
      { from: 'observe', to: 'model' },
    ];
    assert.deepStrictEqual(checkModuleGraph('s', file, edges), []);
  });

  it('a cycle → SDD_MODULE_DAG_CYCLE error', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
    ];
    const findings = checkModuleGraph('s', file, edges);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_MODULE_DAG_CYCLE');
    assert.strictEqual(findings[0]?.severity, 'error');
  });

  it('a non-module node in a cycle is still caught', () => {
    const edges = [
      { from: 'index_ts', to: 'core' },
      { from: 'core', to: 'index_ts' },
    ];
    assert.strictEqual(checkModuleGraph('s', file, edges).length, 1);
  });
});
