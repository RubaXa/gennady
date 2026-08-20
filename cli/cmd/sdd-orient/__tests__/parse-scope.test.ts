// @file: Unit tests for parseModuleMap / parseModuleMapGraph — a scope's module list and its dependency graph edges, both spec formats.
// @consumers: parse-scope

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseModuleMap, parseModuleMapGraph } from '../core/parse-scope.ts';

describe('parseModuleMap', () => {
  it('reads module links from a v2 MODULE_MAP marker', () => {
    const content = [
      '<!--SECTION:MODULE_MAP-->',
      '- [storage](./storage/storage.spec.md) — persistence',
      '- [ui](./ui/ui.spec.md) — UI',
      '<!--/SECTION:MODULE_MAP-->',
    ].join('\n');
    assert.deepStrictEqual(parseModuleMap(content), [
      { name: 'storage', path: './storage/storage.spec.md' },
      { name: 'ui', path: './ui/ui.spec.md' },
    ]);
  });

  it('reads module links from a legacy numbered "Module Map" heading', () => {
    const content = [
      '## 9. Module Map',
      '',
      '### 9.1 Modules',
      '- [lint](./lint/lint.spec.md) — lint command',
      '- vcs-context-resolver — Shared-module, no link',
      '',
      '## 10. Handoff',
      'x',
    ].join('\n');
    assert.deepStrictEqual(parseModuleMap(content), [
      { name: 'lint', path: './lint/lint.spec.md' },
    ]);
  });

  it('skips a prose-only bullet with no .spec.md link (never invents a path)', () => {
    const content =
      '<!--SECTION:MODULE_MAP-->\n- vcs-context-resolver — no link at all\n<!--/SECTION:MODULE_MAP-->';
    assert.deepStrictEqual(parseModuleMap(content), []);
  });

  it('strips backticks from the link text (found live: `[`agent-inbox`](../agent-inbox/agent-inbox.spec.md)`)', () => {
    const content =
      '<!--SECTION:MODULE_MAP-->\n- inbox — delegated to [`agent-inbox`](../agent-inbox/agent-inbox.spec.md)\n<!--/SECTION:MODULE_MAP-->';
    assert.deepStrictEqual(parseModuleMap(content), [
      { name: 'agent-inbox', path: '../agent-inbox/agent-inbox.spec.md' },
    ]);
  });

  it('dedupes a name mentioned twice', () => {
    const content =
      '<!--SECTION:MODULE_MAP-->\n- [a](./a/a.spec.md)\n- [a](./a/a.spec.md) again\n<!--/SECTION:MODULE_MAP-->';
    assert.deepStrictEqual(parseModuleMap(content), [{ name: 'a', path: './a/a.spec.md' }]);
  });

  it('returns [] for a scope with no modules yet (never decomposed)', () => {
    const content =
      '<!--SECTION:MODULE_MAP-->\nModules not yet decomposed — run module-decomposition\n<!--/SECTION:MODULE_MAP-->';
    assert.deepStrictEqual(parseModuleMap(content), []);
  });

  it('returns [] when there is no Module Map section at all', () => {
    assert.deepStrictEqual(parseModuleMap('# Scope\n\ntext'), []);
  });
});

describe('parseModuleMapGraph', () => {
  it('reads solid and dotted edges from the Module Map graph', () => {
    const content = [
      '<!--SECTION:MODULE_MAP-->',
      '```mermaid',
      'graph TD',
      '    ui --> storage',
      '    lint -. Scope Reference .-> dbc',
      '```',
      '<!--/SECTION:MODULE_MAP-->',
    ].join('\n');
    assert.deepStrictEqual(parseModuleMapGraph(content), [
      { from: 'ui', to: 'storage' },
      { from: 'lint', to: 'dbc' },
    ]);
  });

  it('ignores arrows in an unrelated diagram elsewhere in the file (scoped to Module Map body only)', () => {
    const content = [
      '<!--SECTION:OVERVIEW-->',
      '```mermaid',
      'flowchart TD',
      '  user --> product',
      '```',
      '<!--/SECTION:OVERVIEW-->',
      '<!--SECTION:MODULE_MAP-->',
      '```mermaid',
      'graph TD',
      '  ui --> storage',
      '```',
      '<!--/SECTION:MODULE_MAP-->',
    ].join('\n');
    assert.deepStrictEqual(parseModuleMapGraph(content), [{ from: 'ui', to: 'storage' }]);
  });

  it('correctly reports both sides of a two-node cycle', () => {
    const content =
      '<!--SECTION:MODULE_MAP-->\n```mermaid\ngraph TD\n  a --> b\n  b --> a\n```\n<!--/SECTION:MODULE_MAP-->';
    assert.deepStrictEqual(parseModuleMapGraph(content), [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ]);
  });

  it('returns [] when the Module Map section has no graph', () => {
    const content = '<!--SECTION:MODULE_MAP-->\n- [a](./a/a.spec.md)\n<!--/SECTION:MODULE_MAP-->';
    assert.deepStrictEqual(parseModuleMapGraph(content), []);
  });

  it('returns [] when there is no Module Map section at all', () => {
    assert.deepStrictEqual(parseModuleMapGraph('# Scope\n\ntext'), []);
  });
});
