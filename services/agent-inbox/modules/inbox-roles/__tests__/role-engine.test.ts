// @file: Unit tests for inbox-roles RoleEngine — loadAll, activate, deactivate, list.
// @consumers: node:test runner
// @tasks: TSK-113

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { RoleEngine } from '../role-engine.ts';
import type { RoleDefinition, RoleGraph } from '../role-node.ts';
import { ReviewerRole } from '../reviewer.role.ts';
import { AuthorRole } from '../author.role.ts';

const minimalGraph: RoleGraph = {
  nodes: [
    {
      kind: 'session',
      id: 'test_node',
      buildTaskText() {
        return 'Test prompt';
      },
      dir(ctx: { workspace: string }) {
        return `${ctx.workspace}/test`;
      },
      policy: { promptTimeout: 10, continueMax: 1, restartMax: 1 },
    },
  ],
  edges: [{ from: 'test_node', to: 'done', on: 'ok' }],
};

const testRole: RoleDefinition = {
  name: 'test-role',
  description: 'A test role for unit testing',
  graph: minimalGraph,
};

let engine: RoleEngine;

before(() => {
  engine = new RoleEngine();
});

describe('RoleEngine — register + list', () => {
  it('register добавляет роль в список', () => {
    engine.register(testRole);
    const list = engine.list();
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].name, 'test-role');
    assert.strictEqual(list[0].description, 'A test role for unit testing');
    assert.strictEqual(list[0].active, false);
  });

  it('GIVEN роль зарегистрирована WHEN list() THEN роль видна и неактивна', () => {
    engine.register(testRole);
    const list = engine.list();
    const role = list.find((r) => r.name === 'test-role');
    assert.ok(role);
    assert.strictEqual(role.active, false);
  });

  it('GIVEN пустой граф WHEN register() THEN RoleError', () => {
    const emptyRole: RoleDefinition = {
      name: 'empty',
      description: 'Empty graph',
      graph: { nodes: [], edges: [] },
    };
    assert.throws(
      () => engine.register(emptyRole),
      (err: unknown) => {
        return (
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: string }).code === 'GRAPH_INVALID'
        );
      }
    );
  });
});

describe('RoleEngine — activate + deactivate', () => {
  before(() => {
    engine = new RoleEngine();
  });

  it('GIVEN зарегистрирована WHEN activate THEN роль активна', () => {
    engine.register(testRole);
    engine.activate('test-role');
    const list = engine.list();
    const role = list.find((r) => r.name === 'test-role');
    assert.ok(role);
    assert.strictEqual(role.active, true);
  });

  it('двойной activate — идемпотентен', () => {
    engine.register(testRole);
    engine.activate('test-role');
    engine.activate('test-role'); // should not throw
    const list = engine.list();
    const role = list.find((r) => r.name === 'test-role');
    assert.ok(role);
    assert.strictEqual(role.active, true);
  });

  it('deactivate — переводит в неактивное', () => {
    engine.register(testRole);
    engine.activate('test-role');
    engine.deactivate('test-role');
    const list = engine.list();
    const role = list.find((r) => r.name === 'test-role');
    assert.ok(role);
    assert.strictEqual(role.active, false);
  });

  it('GIVEN роль не зарегистрирована WHEN activate THEN RoleError', () => {
    assert.throws(
      () => engine.activate('unknown-role'),
      (err: unknown) => {
        return (
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: string }).code === 'ROLE_NOT_FOUND'
        );
      }
    );
  });

  it('GIVEN роль не зарегистрирована WHEN deactivate THEN RoleError', () => {
    assert.throws(
      () => engine.deactivate('unknown-role'),
      (err: unknown) => {
        return (
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: string }).code === 'ROLE_NOT_FOUND'
        );
      }
    );
  });

  it('engine: load + activate (интеграция с реальными ролями)', async () => {
    const e = new RoleEngine();
    // Register directly (simulates loadAll which imports .role.ts modules)
    e.register(ReviewerRole);
    e.register(AuthorRole);

    const list = e.list();
    assert.strictEqual(list.length, 2);

    // Activate reviewer
    e.activate('reviewer');
    assert.ok(e.isActive('reviewer'));
    assert.ok(!e.isActive('author'));

    // Deactivate
    e.deactivate('reviewer');
    assert.ok(!e.isActive('reviewer'));
  });
});
