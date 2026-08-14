// @file: Unit tests for portal Scope-Graph parsing + portal integrity checks.
// @consumers: portal, check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseGraphEdges, parseScopeGraphEdges, renderScopeGraph, type Scope } from '../portal.ts';
import { checkPortal } from '../check.ts';

const scope = (name: string, status: Scope['status'] = 'wip'): Scope => ({
  name,
  type: 'product',
  status,
  description: '',
  specPath: `./${name}/${name}.spec.md`,
});
const codes = (findings: { code: string }[]): string[] => findings.map((f) => f.code);

describe('parseGraphEdges', () => {
  it('parses bare and labelled arrows down to bare ids', () => {
    const md = [
      '```mermaid',
      'graph TD',
      '  web --> backend',
      '  web[Web SPA] -->|uses| auth',
      '```',
    ].join('\n');
    assert.deepStrictEqual(parseGraphEdges(md), [
      { from: 'web', to: 'backend' },
      { from: 'web', to: 'auth' },
    ]);
  });
  it('returns empty when there is no graph', () => {
    assert.deepStrictEqual(parseGraphEdges('# portal\nno arrows here'), []);
  });
});

describe('parseScopeGraphEdges', () => {
  it('parses solid arrows the same as parseGraphEdges', () => {
    const md = ['```mermaid', 'graph TD', '  web --> backend', '```'].join('\n');
    assert.deepStrictEqual(parseScopeGraphEdges(md), [{ from: 'web', to: 'backend' }]);
  });

  it('also parses dotted cross-scope arrows', () => {
    const md = [
      '```mermaid',
      'graph TD',
      '  web --> backend',
      '  web -. optional .-> auth',
      '```',
    ].join('\n');
    assert.deepStrictEqual(parseScopeGraphEdges(md), [
      { from: 'web', to: 'backend' },
      { from: 'web', to: 'auth' },
    ]);
  });

  it('returns empty when there is no graph', () => {
    assert.deepStrictEqual(parseScopeGraphEdges('# portal\nno arrows here'), []);
  });
});

describe('renderScopeGraph', () => {
  it('returns empty when there are no edges', () => {
    assert.deepStrictEqual(renderScopeGraph([scope('web')], []), []);
  });

  it('renders a single direct chain', () => {
    const lines = renderScopeGraph(
      [scope('todomvc-app'), scope('infra-base', 'done')],
      [{ from: 'todomvc-app', to: 'infra-base' }]
    );
    assert.deepStrictEqual(lines, ['todomvc-app ──► infra-base']);
  });

  it('renders a transitive chain and a direct one, roots sorted by name', () => {
    const lines = renderScopeGraph(
      [scope('todomvc-app'), scope('web'), scope('backend'), scope('infra-base', 'done')],
      [
        { from: 'web', to: 'backend' },
        { from: 'backend', to: 'infra-base' },
        { from: 'todomvc-app', to: 'infra-base' },
      ]
    );
    assert.deepStrictEqual(lines, [
      'todomvc-app ──► infra-base',
      'web ──► backend ──► infra-base',
    ]);
  });

  it('branches into one line per root-to-leaf path', () => {
    const lines = renderScopeGraph(
      [scope('cli'), scope('dbc'), scope('infra-base', 'done')],
      [
        { from: 'cli', to: 'dbc' },
        { from: 'cli', to: 'infra-base' },
        { from: 'dbc', to: 'infra-base' },
      ]
    );
    assert.deepStrictEqual(lines, ['cli ──► dbc ──► infra-base', 'cli ──► infra-base']);
  });

  it('a scope with no edges at all gets its own single-name line', () => {
    const lines = renderScopeGraph(
      [scope('web'), scope('backend'), scope('lonely')],
      [{ from: 'web', to: 'backend' }]
    );
    assert.deepStrictEqual(lines, ['web ──► backend', 'lonely']);
  });

  it('a cycle with no root (every node has an incoming edge) terminates without hanging', () => {
    const lines = renderScopeGraph(
      [],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ]
    );
    assert.deepStrictEqual(lines, []);
  });

  it('a rooted cycle (root points into a loop) terminates, closing the chain on the repeat', () => {
    const lines = renderScopeGraph(
      [],
      [
        { from: 'root', to: 'a' },
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ]
    );
    assert.deepStrictEqual(lines, ['root ──► a ──► b ──► a']);
  });
});

describe('checkPortal', () => {
  it('clean portal → no findings', () => {
    const r = checkPortal({
      scopes: [scope('web'), scope('backend', 'done')],
      edges: [{ from: 'web', to: 'backend' }],
      specDirs: ['web', 'backend'],
    });
    assert.deepStrictEqual(r, []);
  });

  it('flags a dependency cycle', () => {
    const r = checkPortal({
      scopes: [scope('a'), scope('b')],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
      specDirs: ['a', 'b'],
    });
    assert.ok(codes(r).includes('SDD_PORTAL_GRAPH_CYCLE'));
  });

  it('flags a dangling edge (renamed / removed scope)', () => {
    const r = checkPortal({
      scopes: [scope('web')],
      edges: [{ from: 'web', to: 'backend' }],
      specDirs: ['web'],
    });
    assert.ok(codes(r).includes('SDD_PORTAL_DANGLING_DEP'));
  });

  it('flags an orphan spec dir not in the table', () => {
    const r = checkPortal({ scopes: [scope('web')], edges: [], specDirs: ['web', 'ghost'] });
    assert.ok(codes(r).includes('SDD_PORTAL_ORPHAN_SPEC'));
  });

  it('flags a done scope with no spec on disk', () => {
    const r = checkPortal({ scopes: [scope('web', 'done')], edges: [], specDirs: [] });
    assert.ok(codes(r).includes('SDD_PORTAL_SPEC_MISSING'));
  });

  it('a wip scope without a spec yet is fine (not yet authored)', () => {
    const r = checkPortal({ scopes: [scope('web', 'wip')], edges: [], specDirs: [] });
    assert.deepStrictEqual(r, []);
  });
});
