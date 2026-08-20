// @file: Unit tests for renderNeighbourhood — the fixed output contract, built from hand-constructed Neighbourhood models (no I/O).
// @consumers: render-neighbourhood

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderNeighbourhood } from '../render/render-neighbourhood.ts';
import type { Neighbourhood } from '../core/build-neighbourhood.ts';

function base(overrides: Partial<Neighbourhood> = {}): Neighbourhood {
  return {
    targetPath: 'specs/todos-app/ui/ui.spec.md',
    targetKind: 'module',
    scopeName: 'todos-app',
    scopeType: 'product',
    portalFound: true,
    dependsOnScopes: ['infra-base'],
    neighbours: [],
    consumers: [],
    ...overrides,
  };
}

describe('renderNeighbourhood', () => {
  it('renders the header and portal line', () => {
    const text = renderNeighbourhood(base());
    assert.match(text, /^\[sdd-orient\] neighbourhood — specs\/todos-app\/ui\/ui\.spec\.md/);
    assert.match(text, /portal: todos-app \(product\) · depends on: infra-base/);
  });

  it('renders "соседей по графу нет" when there are no neighbours', () => {
    const text = renderNeighbourhood(base());
    assert.match(text, /соседей по графу нет/);
    assert.doesNotMatch(text, /neighbours \(по рёбрам/);
  });

  it('renders a full module neighbour block: name, kind, path, entities, contracts, requirements', () => {
    const n = base({
      neighbours: [
        {
          name: 'storage',
          kind: 'module',
          path: 'specs/todos-app/storage/storage.spec.md',
          unreadable: false,
          legacy: false,
          entities: ['TodoStore', 'Todo'],
          contracts: [{ name: 'TodoStore', kind: 'port' }],
          requirements: [{ id: 'STOR-REQ-1', title: 'load saved todos' }],
          modules: [],
        },
      ],
    });
    const text = renderNeighbourhood(n);
    assert.match(text, /storage \(module\) → specs\/todos-app\/storage\/storage\.spec\.md/);
    assert.match(text, /сущности: TodoStore, Todo/);
    assert.match(text, /контракты: TodoStore \(port\)/);
    assert.match(text, /требования: STOR-REQ-1 «load saved todos»/);
  });

  it('renders "не найдены" (not "старый формат") for a v2 neighbour missing one field', () => {
    const n = base({
      neighbours: [
        {
          name: 'ui',
          kind: 'module',
          path: 'specs/todos-app/ui/ui.spec.md',
          unreadable: false,
          legacy: false,
          entities: ['TodoList'],
          contracts: [],
          requirements: [],
          modules: [],
        },
      ],
    });
    const text = renderNeighbourhood(n);
    assert.match(text, /контракты: не найдены(?! \(старый формат\))/);
  });

  it('renders "не найдены (старый формат)" for a legacy neighbour missing a field', () => {
    const n = base({
      neighbours: [
        {
          name: 'orient',
          kind: 'module',
          path: 'specs/cli/orient/orient.spec.md',
          unreadable: false,
          legacy: true,
          entities: ['orientCommand'],
          contracts: [],
          requirements: [],
          modules: [],
        },
      ],
    });
    const text = renderNeighbourhood(n);
    assert.match(text, /требования: не найдены \(старый формат\)/);
  });

  it('renders an unreadable neighbour without crashing or listing its fields', () => {
    const n = base({
      neighbours: [
        {
          name: 'ghost',
          kind: 'module',
          path: 'specs/todos-app/ghost/ghost.spec.md',
          unreadable: true,
          legacy: false,
          entities: [],
          contracts: [],
          requirements: [],
          modules: [],
        },
      ],
    });
    const text = renderNeighbourhood(n);
    assert.match(text, /ghost \(module\) → specs\/todos-app\/ghost\/ghost\.spec\.md/);
    assert.match(text, /\(спека не читается\)/);
  });

  it('renders a scope-kind neighbour by its module list, not entities/contracts', () => {
    const n = base({
      neighbours: [
        {
          name: 'dbc',
          kind: 'scope',
          path: 'specs/dbc/dbc.spec.md',
          unreadable: false,
          legacy: false,
          entities: [],
          contracts: [],
          requirements: [],
          modules: [{ name: 'parser', path: './parser/parser.spec.md' }],
        },
      ],
    });
    const text = renderNeighbourhood(n);
    assert.match(text, /dbc \(scope\) → specs\/dbc\/dbc\.spec\.md/);
    assert.match(text, /модули: parser/);
    assert.doesNotMatch(text, /сущности:/);
  });

  it('renders "портал не найден" instead of a depends-on list when the portal is missing', () => {
    const text = renderNeighbourhood(base({ portalFound: false, dependsOnScopes: [] }));
    assert.match(text, /портал не найден \(specs\/README\.md\)/);
  });

  it('renders "нет" for an empty consumers list, with the fixed suffix', () => {
    const text = renderNeighbourhood(base());
    assert.match(text, /потребители: нет ← \(кто зависит от этой спеки\)/);
  });

  it('renders consumer names, comma-joined, when present', () => {
    const text = renderNeighbourhood(base({ consumers: ['ui', 'uikit'] }));
    assert.match(text, /потребители: ui, uikit ← \(кто зависит от этой спеки\)/);
  });

  it('renders the fixed next: line verbatim, regardless of data', () => {
    const text = renderNeighbourhood(base());
    assert.match(
      text,
      /next: перед фиксацией архитектуры ответь: расширяем что-то из перечисленного или вводим новое\? «новое» требует обоснования со ссылкой на инвариант, который не подошёл\.$/
    );
  });

  it('renders an honest message for an unknown-kind target, not a crash', () => {
    const text = renderNeighbourhood(base({ targetKind: 'unknown' }));
    assert.match(text, /не удалось определить тип спеки/);
    assert.doesNotMatch(text, /соседей по графу нет/);
  });
});
