// @file: Unit tests for inbox-roles AuthorRole — fetch → gate → summary → ask → effect.
// @consumers: node:test runner
// @tasks: TSK-113

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AuthorRole } from '../author.role.ts';
import { RoleEngine } from '../role-engine.ts';
import { RoleInstance } from '../role-instance.ts';
import { OpenCodeMock } from '../../inbox-opencode/opencode.mock.ts';
import { VcsInboxMock } from '../../inbox-core/vcs-inbox.mock.ts';
import type { AuditEntry } from '../../inbox-core/audit-log.ts';

class FakeStateStore {
  public audits: AuditEntry[] = [];

  getStateDir() {
    return '/home/test/.gennady';
  }

  loadRegistry() {
    return { version: 1, entries: {} };
  }

  async appendAudit(entry: AuditEntry) {
    this.audits.push(entry);
  }

  async queryAudit(_mr: string): Promise<AuditEntry[]> {
    return [...this.audits];
  }
}

interface StateStore {
  getStateDir(): string;
  loadRegistry(): { version: 1; entries: {} };
  appendAudit(entry: AuditEntry): Promise<void>;
  queryAudit(mr: string): Promise<AuditEntry[]>;
}

let engine: RoleEngine;
let opencode: OpenCodeMock;
let vcs: VcsInboxMock;
let store: FakeStateStore;

before(() => {
  engine = new RoleEngine();
  opencode = new OpenCodeMock();
  vcs = new VcsInboxMock();
});

beforeEach(() => {
  engine = new RoleEngine();
  opencode = new OpenCodeMock();
  vcs = new VcsInboxMock();
  store = new FakeStateStore();
});

describe('AuthorRole — graph structure', () => {
  it('author.role.ts имеет 5 узлов', () => {
    assert.strictEqual(AuthorRole.graph.nodes.length, 5);
  });

  it('author.role.ts имеет правильное имя и описание', () => {
    assert.strictEqual(AuthorRole.name, 'author');
    assert.ok(AuthorRole.description.includes('author'));
  });

  it('author.role.ts загружается через RoleEngine', () => {
    engine.register(AuthorRole);
    const list = engine.list();
    const author = list.find((r) => r.name === 'author');
    assert.ok(author);
    assert.strictEqual(author.description, AuthorRole.description);
  });

  it('GIVEN author.role.ts загружен WHEN retrieve THEN полный граф доступен', () => {
    engine.register(AuthorRole);
    const def = engine.retrieve('author');
    assert.ok(def);
    assert.strictEqual(def.graph.nodes.length, 5);
    assert.ok(def.graph.edges.length > 0);
  });
});

describe('AuthorRole — fetch → classify → summary → ask → effect', () => {
  it('GIVEN author loaded WHEN step() fetch THEN session → ok → gate_classify', async () => {
    engine.register(AuthorRole);
    opencode.seed('node_fetch', {
      discussions: [{ id: '1', body: 'Please fix line 42' }],
      totalCount: 1,
    });

    const instance = new RoleInstance({
      id: 'author:test:1',
      role: 'author',
      mr: 'https://gitlab.example.com/project/-/merge_requests/1',
      graph: AuthorRole.graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    assert.strictEqual(instance.currentNode, 'node_fetch');

    // fetch → gate_classify
    await instance.step();
    assert.strictEqual(instance.currentNode, 'gate_classify');

    // gate_classify → node_summary (pass)
    await instance.step();
    assert.strictEqual(instance.currentNode, 'node_summary');
  });

  it('GIVEN все session-узлы успешны WHEN полный проход THEN ask достигнут', async () => {
    engine.register(AuthorRole);
    opencode.seed('node_fetch', {
      discussions: [{ id: '1', body: 'Fix this' }],
      totalCount: 1,
    });
    opencode.seed('node_summary', {
      summary: 'One issue: fix line 42',
      tasks: [{ action: 'fix_line_42' }],
      drafts: ['Draft comment: Will fix'],
    });

    const instance = new RoleInstance({
      id: 'author:test:2',
      role: 'author',
      mr: 'https://gitlab.example.com/project/-/merge_requests/2',
      graph: AuthorRole.graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    // fetch → gate_classify
    await instance.step();
    assert.strictEqual(instance.currentNode, 'gate_classify');

    // gate_classify → node_summary
    await instance.step();
    assert.strictEqual(instance.currentNode, 'node_summary');

    // summary → node_ask
    await instance.step();
    assert.strictEqual(instance.currentNode, 'node_ask');

    // ask → node_react (but ask stops at awaiting_operator)
    await instance.step();
    assert.strictEqual(instance.currentNode, 'node_ask');
    assert.strictEqual(instance.state, 'awaiting_operator');
  });
});
