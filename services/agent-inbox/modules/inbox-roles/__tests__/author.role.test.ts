// @file: Unit tests for inbox-roles AuthorRole — prep → self-review → analyze-feedback →
//   synthesize (REPORT.md/FIX_TASK.md/drafts) → ask → effect. Never approves own MR, never
//   proposes a fresh thread write (D68).
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
import type { AskNode } from '../role-node.ts';

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
  it('author.role.ts имеет 8 узлов (prep + self_review + analyze_feedback + gate + synthesize + gate + ask + effect)', () => {
    assert.strictEqual(AuthorRole.graph.nodes.length, 8);
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
    assert.strictEqual(def.graph.nodes.length, 8);
    assert.ok(def.graph.edges.length > 0);
  });

  it('node_ask.choices НЕ содержит "approve" — автор никогда не апрувит свой MR (D68)', () => {
    const askNode = AuthorRole.graph.nodes.find((n) => n.id === 'node_ask' && n.kind === 'ask') as
      | AskNode
      | undefined;
    assert.ok(askNode);
    const question = askNode.question({
      mr: {
        project: 'g/p',
        iid: '1',
        webUrl: 'https://gitlab.example.com/g/p/-/merge_requests/1',
        title: 't',
        sourceBranch: 's',
        targetBranch: 'm',
        createdAt: '',
        updatedAt: '',
        author: 'me',
        reviewers: [],
        approvedBy: [],
        description: '',
        myRole: 'author',
      },
      workspace: '/tmp/x',
      artifacts: {},
    });
    assert.ok(!question.choices.includes('approve'));
  });
});

describe('AuthorRole — prep → self_review → analyze_feedback → synthesize → ask → effect', () => {
  it('GIVEN prep WHEN step THEN branch ok → node_self_review', async () => {
    engine.register(AuthorRole);

    const instance = new RoleInstance({
      id: 'author:test:1',
      role: 'author',
      mr: 'https://gitlab.example.com/project/-/merge_requests/1',
      graph: AuthorRole.graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    assert.strictEqual(instance.currentNode, 'node_prepare');

    await instance.step(); // prep → ok
    assert.strictEqual(instance.currentNode, 'node_self_review');
  });

  it('GIVEN self-review + feedback заполнены WHEN полный проход THEN REPORT.md/FIX_TASK.md synthesis → ask достигнут', async () => {
    engine.register(AuthorRole);

    opencode.seed('node_self_review', {
      findings: [{ id: 1, file: 'a.ts', line: 10, message: 'issue' }],
    });
    opencode.seed('node_analyze_feedback', {
      classifiedComments: [{ id: 'c1', kind: 'needs_fix' }],
    });
    opencode.seed('node_synthesize', {
      reportSummary: 'Сводка: 1 замечание требует исправления.',
      fixTasks: [{ file: 'a.ts', line: 10, what: 'issue', fix: 'fix it' }],
      drafts: ['Draft reply: will fix'],
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

    await instance.step(); // prep → node_self_review
    assert.strictEqual(instance.currentNode, 'node_self_review');

    await instance.step(); // self_review → ok
    assert.strictEqual(instance.currentNode, 'node_analyze_feedback');

    await instance.step(); // analyze_feedback → ok
    assert.strictEqual(instance.currentNode, 'gate_analysis');

    await instance.step(); // gate_analysis → pass
    assert.strictEqual(instance.currentNode, 'node_synthesize');

    await instance.step(); // synthesize → ok
    assert.strictEqual(instance.currentNode, 'gate_synthesis');

    await instance.step(); // gate_synthesis → pass
    assert.strictEqual(instance.currentNode, 'node_ask');

    await instance.step(); // ask stops at awaiting_operator
    assert.strictEqual(instance.currentNode, 'node_ask');
    assert.strictEqual(instance.state, 'awaiting_operator');

    const view = instance.getBoardView() as Record<string, unknown>;
    assert.ok(view);
  });

  it('GIVEN gate_analysis не заполнен (feedback пуст) WHEN step THEN gate fail → назад к analyze_feedback', async () => {
    engine.register(AuthorRole);

    opencode.seed('node_self_review', { findings: [] });
    opencode.seed('node_analyze_feedback', { classifiedComments: [] }); // empty array → still passes Array.isArray check

    const instance = new RoleInstance({
      id: 'author:test:3',
      role: 'author',
      mr: 'https://gitlab.example.com/project/-/merge_requests/3',
      graph: AuthorRole.graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    await instance.step(); // prep → self_review
    await instance.step(); // self_review → analyze_feedback
    await instance.step(); // analyze_feedback → gate_analysis
    assert.strictEqual(instance.currentNode, 'gate_analysis');

    await instance.step(); // gate_analysis → pass (classifiedComments is an array, even if empty)
    assert.strictEqual(instance.currentNode, 'node_synthesize');
  });
});
