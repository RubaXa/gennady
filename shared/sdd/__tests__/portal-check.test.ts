// @file: Unit tests for portal Scope-Graph parsing + portal integrity checks.
// @consumers: portal, check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseGraphEdges, type Scope } from '../portal.ts';
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
