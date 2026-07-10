// @file: Unit tests for inbox-roles ReviewerRole — scaffold → gate → enrich → sessions → synthesize → ask → effect.
// @consumers: node:test runner
// @tasks: TSK-113

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ReviewerRole } from '../reviewer.role.ts';
import { RoleEngine } from '../role-engine.ts';
import { RoleInstance } from '../role-instance.ts';
import { OpenCodeMock } from '../../inbox-opencode/opencode.mock.ts';
import { VcsInboxMock } from '../../inbox-core/vcs-inbox.mock.ts';
import type { AuditEntry } from '../../inbox-core/audit-log.ts';

class FakeStateStore {
  public audits: AuditEntry[] = [];

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

describe('ReviewerRole — graph structure', () => {
  it('reviewer.role.ts имеет 9 узлов', () => {
    assert.strictEqual(ReviewerRole.graph.nodes.length, 9);
  });

  it('reviewer.role.ts имеет правильное имя и описание', () => {
    assert.strictEqual(ReviewerRole.name, 'reviewer');
    assert.ok(ReviewerRole.description.includes('reviewer'));
  });

  it('reviewer.role.ts загружается через RoleEngine', () => {
    engine.register(ReviewerRole);
    const list = engine.list();
    const reviewer = list.find((r) => r.name === 'reviewer');
    assert.ok(reviewer);
    assert.strictEqual(reviewer.description, ReviewerRole.description);
  });

  it('GIVEN reviewer.role.ts загружен WHEN retrieve THEN полный граф доступен', () => {
    engine.register(ReviewerRole);
    const def = engine.retrieve('reviewer');
    assert.ok(def);
    assert.strictEqual(def.graph.nodes.length, 9);
    assert.ok(def.graph.edges.length > 0);
  });
});

describe('ReviewerRole — scaffold → gate → enrich (первые 3 узла)', () => {
  it('GIVEN reviewer loaded WHEN step() scaffold THEN session → ok → gate_scaffolded', async () => {
    engine.register(ReviewerRole);
    opencode.seed('node_scaffold', {
      findings: [{ id: 1, severity: 'high' }],
      summary: 'Found issues',
    });

    const instance = new RoleInstance({
      id: 'reviewer:test:1',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/1',
      graph: ReviewerRole.graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    assert.strictEqual(instance.currentNode, 'node_scaffold');

    // scaffold → gate_scaffolded
    await instance.step();
    assert.strictEqual(instance.currentNode, 'gate_scaffolded');

    // gate_scaffolded → node_enrich (pass)
    await instance.step();
    assert.strictEqual(instance.currentNode, 'node_enrich');
  });
});

describe('ReviewerRole — sessions fan-out → synthesize → ask → effect', () => {
  it('GIVEN все session-узлы успешны WHEN полный проход THEN ask достигнут', async () => {
    engine.register(ReviewerRole);

    // Seed all session nodes
    opencode.seed('node_scaffold', {
      findings: [{ id: 1 }],
      summary: 'Scaffold done',
    });
    opencode.seed('node_enrich', {
      enrichedFindings: [{ id: 1, detail: 'enriched' }],
      coverage: 'full',
    });
    opencode.seed('node_sessions', {
      sessions: [{ track: 'A' }],
      trackedCount: 1,
    });
    opencode.seed('node_synthesize', {
      reviewReport: { total: 5 },
      recommendations: ['fix X', 'improve Y'],
    });

    const instance = new RoleInstance({
      id: 'reviewer:test:2',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/2',
      graph: ReviewerRole.graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    // scaffold → gate_scaffolded
    await instance.step();
    assert.strictEqual(instance.currentNode, 'gate_scaffolded');

    // gate_scaffolded → node_enrich
    await instance.step();
    assert.strictEqual(instance.currentNode, 'node_enrich');

    // enrich → gate_enriched
    await instance.step();
    assert.strictEqual(instance.currentNode, 'gate_enriched');

    // gate_enriched → node_sessions
    await instance.step();
    assert.strictEqual(instance.currentNode, 'node_sessions');

    // sessions → gate_sessions
    await instance.step();
    assert.strictEqual(instance.currentNode, 'gate_sessions');

    // gate_sessions → node_synthesize
    await instance.step();
    assert.strictEqual(instance.currentNode, 'node_synthesize');

    // synthesize → node_ask
    await instance.step();
    assert.strictEqual(instance.currentNode, 'node_ask');

    // ask stops at awaiting_operator
    await instance.step();
    assert.strictEqual(instance.state, 'awaiting_operator');
  });
});
