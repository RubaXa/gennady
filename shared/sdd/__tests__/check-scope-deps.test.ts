// @file: Unit tests for checkScopeDeps (B5) — scope spec deps cross-checked against the portal Scope Graph.
// @consumers: check

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkScopeDeps } from '../check.ts';
import type { GraphEdge } from '../portal.ts';

const spec = (dependsOn: string): string =>
  [
    '<!--SECTION:SCOPE_DEPENDENCIES-->',
    '## 7. Scope Dependencies',
    `- **Depends on:** ${dependsOn}`,
    '- **Provides to:** [web]',
    '<!--/SECTION:SCOPE_DEPENDENCIES-->',
  ].join('\n');

const edge = (from: string, to: string): GraphEdge => ({ from, to });
const codes = (file: string, content: string, edges: GraphEdge[]): string[] =>
  checkScopeDeps(file, content, edges).map((f) => f.code);

const FILE = 'specs/backend/backend.spec.md';

describe('checkScopeDeps (B5)', () => {
  it('no finding when every portal edge is listed in the spec', () => {
    const edges = [edge('backend', 'infra-base'), edge('backend', 'api')];
    assert.deepStrictEqual(checkScopeDeps(FILE, spec('[infra-base, api]'), edges), []);
  });

  it('warns on a portal edge the spec does not acknowledge', () => {
    const edges = [edge('backend', 'infra-base'), edge('backend', 'api')];
    const findings = checkScopeDeps(FILE, spec('[infra-base]'), edges);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_SCOPE_DEP_UNDECLARED');
    assert.strictEqual(findings[0]?.severity, 'warn');
    assert.match(findings[0]?.message ?? '', /backend --> api/);
  });

  it('a `prefix-*` wildcard covers matching scopes', () => {
    const edges = [edge('backend', 'infra-base'), edge('backend', 'infra-db')];
    assert.deepStrictEqual(codes(FILE, spec('[infra-*]'), edges), []);
  });

  it('ignores edges originating from a different scope', () => {
    const edges = [edge('web', 'api'), edge('mobile', 'api')];
    assert.deepStrictEqual(checkScopeDeps(FILE, spec('[infra-base]'), edges), []);
  });

  it('a spec without a SCOPE_DEPENDENCIES section yields [] (module / legacy specs)', () => {
    assert.deepStrictEqual(checkScopeDeps(FILE, '# just a module\n\nno deps section', [edge('backend', 'api')]), []);
  });

  it('prose words in the deps line do not cause false positives', () => {
    const edges = [edge('backend', 'api')];
    assert.deepStrictEqual(codes(FILE, spec('[api, design-system-* scopes]'), edges), []);
  });
});
