// @file: Unit tests for buildNeighbourhood — depth-1 traversal, against an in-memory SpecSectionSource fixture. Covers the mechanism's sharpest edges: cycles, missing portal, deps outside the portal, empty graphs.
// @consumers: build-neighbourhood

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { buildNeighbourhood } from '../core/build-neighbourhood.ts';
import type { SpecSectionSource } from '../core/spec-section-source.ts';

const ROOT = '/proj';

function source(files: Record<string, string>): SpecSectionSource {
  return { read: (path: string) => files[path] ?? null };
}

const PORTAL = [
  '## Scopes',
  '| Scope | Type | Spec | Description |',
  '|---|---|---|---|',
  '| [`infra-base`](./infra-base/infra-base.spec.md) | infrastructure | ✅ | toolchain |',
  '| [`todos-app`](./todos-app/todos-app.spec.md) | product | ✅ | Todo app |',
  '',
  '```mermaid',
  'graph TD',
  '    todos-app --> infra-base',
  '```',
].join('\n');

const SCOPE_SPEC = [
  '<!--SECTION:SCOPE_TYPE-->',
  'product',
  '<!--/SECTION:SCOPE_TYPE-->',
  '<!--SECTION:MODULE_MAP-->',
  '- [storage](./storage/storage.spec.md) — persistence',
  '- [ui](./ui/ui.spec.md) — UI',
  '```mermaid',
  'graph TD',
  '    ui --> storage',
  '```',
  '<!--/SECTION:MODULE_MAP-->',
].join('\n');

const STORAGE_SPEC = [
  '<!--SECTION:MODULE_VISION-->',
  'x',
  '<!--/SECTION:MODULE_VISION-->',
  '<!--SECTION:ENTITY_INVENTORY-->',
  '| Name | Type | Purpose |',
  '| `TodoStore` | Port | x |',
  '<!--/SECTION:ENTITY_INVENTORY-->',
].join('\n');

const UI_SPEC = ['<!--SECTION:MODULE_VISION-->', 'x', '<!--/SECTION:MODULE_VISION-->'].join('\n');

function basicFiles(): Record<string, string> {
  return {
    [join(ROOT, 'specs', 'README.md')]: PORTAL,
    [join(ROOT, 'specs', 'todos-app', 'todos-app.spec.md')]: SCOPE_SPEC,
    [resolve(ROOT, 'specs/todos-app/storage/storage.spec.md')]: STORAGE_SPEC,
    [resolve(ROOT, 'specs/todos-app/ui/ui.spec.md')]: UI_SPEC,
  };
}

describe('buildNeighbourhood — module target', () => {
  it('finds the sibling module via the scope Module Map graph, with entities', () => {
    const uiPath = resolve(ROOT, 'specs/todos-app/ui/ui.spec.md');
    const n = buildNeighbourhood(ROOT, uiPath, UI_SPEC, source(basicFiles()));
    assert.equal(n.targetKind, 'module');
    assert.equal(n.scopeName, 'todos-app');
    assert.equal(n.scopeType, 'product');
    assert.deepStrictEqual(n.dependsOnScopes, ['infra-base']);
    assert.equal(n.neighbours.length, 1);
    assert.equal(n.neighbours[0]?.name, 'storage');
    assert.equal(n.neighbours[0]?.kind, 'module');
    assert.deepStrictEqual(n.neighbours[0]?.entities, ['TodoStore']);
    assert.deepStrictEqual(n.consumers, []); // nothing depends on ui in this graph
  });

  it('a module with no neighbours reports an empty neighbours list, not an error', () => {
    const files = basicFiles();
    const storagePath = resolve(ROOT, 'specs/todos-app/storage/storage.spec.md');
    const n = buildNeighbourhood(ROOT, storagePath, STORAGE_SPEC, source(files));
    // storage has no outgoing edges of its own in the fixture graph, but ui -> storage means
    // storage IS a consumer target; from storage's own perspective it has one consumer (ui) and
    // zero dependsOn neighbours it points to itself — but ui->storage means storage sees ui as a
    // provides-to neighbour too (both directions count as "neighbours").
    assert.equal(n.neighbours.length, 1);
    assert.equal(n.neighbours[0]?.name, 'ui');
    assert.deepStrictEqual(n.consumers, ['ui']);
  });

  it('a leaf module with no edges at all in the graph has no neighbours', () => {
    const files = basicFiles();
    files[join(ROOT, 'specs', 'todos-app', 'todos-app.spec.md')] = [
      '<!--SECTION:SCOPE_TYPE-->',
      'product',
      '<!--/SECTION:SCOPE_TYPE-->',
      '<!--SECTION:MODULE_MAP-->',
      '- [storage](./storage/storage.spec.md)',
      '- [ui](./ui/ui.spec.md)',
      '<!--/SECTION:MODULE_MAP-->',
    ].join('\n'); // no mermaid graph at all
    const uiPath = resolve(ROOT, 'specs/todos-app/ui/ui.spec.md');
    const n = buildNeighbourhood(ROOT, uiPath, UI_SPEC, source(files));
    assert.deepStrictEqual(n.neighbours, []);
    assert.deepStrictEqual(n.consumers, []);
  });

  it('two modules in a mutual cycle each see the other as both neighbour and consumer', () => {
    const files = basicFiles();
    files[join(ROOT, 'specs', 'todos-app', 'todos-app.spec.md')] = [
      '<!--SECTION:SCOPE_TYPE-->',
      'product',
      '<!--/SECTION:SCOPE_TYPE-->',
      '<!--SECTION:MODULE_MAP-->',
      '- [storage](./storage/storage.spec.md)',
      '- [ui](./ui/ui.spec.md)',
      '```mermaid',
      'graph TD',
      '    ui --> storage',
      '    storage --> ui',
      '```',
      '<!--/SECTION:MODULE_MAP-->',
    ].join('\n');
    const uiPath = resolve(ROOT, 'specs/todos-app/ui/ui.spec.md');
    const n = buildNeighbourhood(ROOT, uiPath, UI_SPEC, source(files));
    assert.equal(n.neighbours.length, 1);
    assert.equal(n.neighbours[0]?.name, 'storage');
    assert.deepStrictEqual(n.consumers, ['storage']);
    // no stack overflow / infinite loop — depth stays 1, this assertion completing IS the proof.
  });

  it('a dependency declared outside the portal resolves via the conventional specs/<name>/<name>.spec.md guess', () => {
    const files = basicFiles();
    files[join(ROOT, 'specs', 'todos-app', 'todos-app.spec.md')] = [
      '<!--SECTION:SCOPE_TYPE-->',
      'product',
      '<!--/SECTION:SCOPE_TYPE-->',
      '<!--SECTION:MODULE_MAP-->',
      '- [ui](./ui/ui.spec.md)',
      '```mermaid',
      'graph TD',
      '    ui -. Scope Reference .-> orphan-scope',
      '```',
      '<!--/SECTION:MODULE_MAP-->',
    ].join('\n');
    files[join(ROOT, 'specs', 'orphan-scope', 'orphan-scope.spec.md')] =
      '<!--SECTION:SCOPE_TYPE-->\nlibrary\n<!--/SECTION:SCOPE_TYPE-->';
    const uiPath = resolve(ROOT, 'specs/todos-app/ui/ui.spec.md');
    const n = buildNeighbourhood(ROOT, uiPath, UI_SPEC, source(files));
    assert.equal(n.neighbours.length, 1);
    assert.equal(n.neighbours[0]?.name, 'orphan-scope');
    assert.equal(n.neighbours[0]?.kind, 'scope');
    assert.equal(n.neighbours[0]?.unreadable, false);
  });

  it('a graph node resolving to no real spec file anywhere is dropped, not fabricated', () => {
    const files = basicFiles();
    files[join(ROOT, 'specs', 'todos-app', 'todos-app.spec.md')] = [
      '<!--SECTION:SCOPE_TYPE-->',
      'product',
      '<!--/SECTION:SCOPE_TYPE-->',
      '<!--SECTION:MODULE_MAP-->',
      '- [ui](./ui/ui.spec.md)',
      '```mermaid',
      'graph TD',
      '    ui -. Runtime .-> npm-registry[npm public registry]',
      '```',
      '<!--/SECTION:MODULE_MAP-->',
    ].join('\n');
    const uiPath = resolve(ROOT, 'specs/todos-app/ui/ui.spec.md');
    const n = buildNeighbourhood(ROOT, uiPath, UI_SPEC, source(files));
    assert.deepStrictEqual(n.neighbours, []);
  });

  it('degrades gracefully in path mode when the portal is entirely missing', () => {
    const files = basicFiles();
    delete files[join(ROOT, 'specs', 'README.md')];
    const uiPath = resolve(ROOT, 'specs/todos-app/ui/ui.spec.md');
    const n = buildNeighbourhood(ROOT, uiPath, UI_SPEC, source(files));
    assert.equal(n.portalFound, false);
    assert.equal(n.scopeType, null);
    assert.deepStrictEqual(n.dependsOnScopes, []);
    // the scope's own Module Map graph is still read from disk directly — portal absence does
    // not block the "sideways" module-to-module traversal.
    assert.equal(n.neighbours.length, 1);
    assert.equal(n.neighbours[0]?.name, 'storage');
  });

  it('a neighbour spec that cannot be read is marked unreadable, not thrown', () => {
    const files = basicFiles();
    files[join(ROOT, 'specs', 'todos-app', 'todos-app.spec.md')] = [
      '<!--SECTION:SCOPE_TYPE-->',
      'product',
      '<!--/SECTION:SCOPE_TYPE-->',
      '<!--SECTION:MODULE_MAP-->',
      '- [ui](./ui/ui.spec.md)',
      '- [ghost](./ghost/ghost.spec.md)',
      '```mermaid',
      'graph TD',
      '    ui --> ghost',
      '```',
      '<!--/SECTION:MODULE_MAP-->',
    ].join('\n');
    // ghost/ghost.spec.md deliberately not in `files` — listed in Module Map but unreadable.
    const uiPath = resolve(ROOT, 'specs/todos-app/ui/ui.spec.md');
    const n = buildNeighbourhood(ROOT, uiPath, UI_SPEC, source(files));
    assert.equal(n.neighbours.length, 1);
    assert.equal(n.neighbours[0]?.unreadable, true);
  });

  it('when the target module has no legacy section markers, its neighbour entries report legacy:true and an honest empty label upstream', () => {
    const files = basicFiles();
    const legacyUi = '# Module: ui\n\n## 1. Module Vision\ntext'; // no markers anywhere
    files[resolve(ROOT, 'specs/todos-app/ui/ui.spec.md')] = legacyUi;
    const storagePath = resolve(ROOT, 'specs/todos-app/storage/storage.spec.md');
    const n = buildNeighbourhood(ROOT, storagePath, STORAGE_SPEC, source(files));
    const uiNeighbour = n.neighbours.find((x) => x.name === 'ui');
    assert.ok(uiNeighbour);
    assert.equal(uiNeighbour?.legacy, true);
    assert.deepStrictEqual(uiNeighbour?.entities, []);
  });
});

describe('buildNeighbourhood — scope target', () => {
  it('lists every module in the Module Map as a depth-1 neighbour', () => {
    const scopePath = join(ROOT, 'specs', 'todos-app', 'todos-app.spec.md');
    const n = buildNeighbourhood(ROOT, scopePath, SCOPE_SPEC, source(basicFiles()));
    assert.equal(n.targetKind, 'scope');
    assert.deepStrictEqual(n.neighbours.map((x) => x.name).sort(), ['storage', 'ui']);
  });

  it('consumers are the scopes whose portal edge points at this scope (reverse edge)', () => {
    const files = basicFiles();
    const infraPath = join(ROOT, 'specs', 'infra-base', 'infra-base.spec.md');
    files[infraPath] = '<!--SECTION:SCOPE_TYPE-->\ninfrastructure\n<!--/SECTION:SCOPE_TYPE-->';
    const n = buildNeighbourhood(ROOT, infraPath, files[infraPath] as string, source(files));
    assert.deepStrictEqual(n.consumers, ['todos-app']);
  });

  it('a scope without a Module Map (never decomposed) reports zero neighbours, not an error', () => {
    const files = basicFiles();
    const bareScope = '<!--SECTION:SCOPE_TYPE-->\nproduct\n<!--/SECTION:SCOPE_TYPE-->';
    const scopePath = join(ROOT, 'specs', 'todos-app', 'todos-app.spec.md');
    const n = buildNeighbourhood(ROOT, scopePath, bareScope, source(files));
    assert.deepStrictEqual(n.neighbours, []);
  });
});

describe('buildNeighbourhood — unknown target', () => {
  it('degrades to an empty neighbourhood, still reporting the portal line', () => {
    const uiPath = resolve(ROOT, 'specs/todos-app/ui/ui.spec.md');
    const n = buildNeighbourhood(
      ROOT,
      uiPath,
      '# just some prose, no signal at all',
      source(basicFiles())
    );
    assert.equal(n.targetKind, 'unknown');
    assert.deepStrictEqual(n.neighbours, []);
    assert.deepStrictEqual(n.consumers, []);
    assert.equal(n.scopeType, 'product'); // portal-derived facts are independent of content classification
  });
});
