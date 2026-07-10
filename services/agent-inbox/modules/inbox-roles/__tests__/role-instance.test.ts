// @file: Unit tests for inbox-roles RoleInstance — step(), gate, recovery ladder (continue/restart/AWAITING).
// @consumers: node:test runner
// @tasks: TSK-113

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RoleInstance } from '../role-instance.ts';
import type { RoleGraph } from '../role-node.ts';
import { OpenCodeMock } from '../../inbox-opencode/opencode.mock.ts';
import { VcsInboxMock } from '../../inbox-core/vcs-inbox.mock.ts';
import type { AuditEntry } from '../../inbox-core/audit-log.ts';

// Fake StateStore with in-memory audit
class FakeStateStore {
  public audits: AuditEntry[] = [];

  loadRegistry() {
    return { version: 1, entries: {} };
  }

  async appendAudit(entry: AuditEntry) {
    this.audits.push(entry);
  }

  async queryAudit(_mr: string): Promise<AuditEntry[]> {
    return this.audits;
  }
}

function makeSimpleGraph(): RoleGraph {
  return {
    nodes: [
      {
        kind: 'session',
        id: 'node_test',
        prompt() {
          return { system: 'Test system', text: 'Test prompt' };
        },
        dir() {
          return '/tmp/test-graph';
        },
        resultSchema: {
          title: 'node_test',
          type: 'object',
          properties: { value: { type: 'string' } },
        },
        policy: { promptTimeout: 10000, continueMax: 3, restartMax: 2 },
      },
    ],
    edges: [{ from: 'node_test', to: 'done', on: 'ok' }],
  };
}

function makeGraphWithGate(): RoleGraph {
  return {
    nodes: [
      {
        kind: 'session',
        id: 'node_scaffold',
        prompt() {
          return { system: 'Scaffold', text: 'Do scaffold' };
        },
        dir() {
          return '/tmp/test-gate';
        },
        resultSchema: {
          title: 'node_scaffold',
          type: 'object',
          properties: { findings: { type: 'array' } },
        },
        policy: { promptTimeout: 10000, continueMax: 2, restartMax: 2 },
      },
      {
        kind: 'gate',
        id: 'gate_validate',
        verify(ctx) {
          const scaffold = ctx.artifacts['node_scaffold'] as Record<string, unknown> | undefined;
          if (!scaffold) return { pass: false, reason: 'No scaffold' };
          const findings = scaffold.findings as unknown[];
          if (!Array.isArray(findings) || findings.length === 0)
            return { pass: false, reason: 'Empty findings' };
          return { pass: true };
        },
      },
    ],
    edges: [
      { from: 'node_scaffold', to: 'gate_validate', on: 'ok' },
      { from: 'gate_validate', to: 'done', on: 'pass' },
      { from: 'gate_validate', to: 'node_scaffold', on: 'fail' },
    ],
  };
}

function makeRecoveryGraph(): RoleGraph {
  return {
    nodes: [
      {
        kind: 'session',
        id: 'node_flaky',
        prompt() {
          return { system: 'Flaky', text: 'May fail' };
        },
        dir() {
          return '/tmp/test-recovery';
        },
        resultSchema: {
          title: 'node_flaky',
          type: 'object',
          properties: { result: { type: 'string' } },
        },
        policy: { promptTimeout: 10000, continueMax: 2, restartMax: 1 },
      },
    ],
    edges: [{ from: 'node_flaky', to: 'done', on: 'ok' }],
  };
}

let opencode: OpenCodeMock;
let vcs: VcsInboxMock;
let store: FakeStateStore;

before(() => {
  opencode = new OpenCodeMock();
  vcs = new VcsInboxMock();
});

beforeEach(() => {
  opencode = new OpenCodeMock();
  vcs = new VcsInboxMock();
  store = new FakeStateStore();
});

describe('RoleInstance — session → gate transition', () => {
  it('GIVEN reviewer loaded WHEN step() on session THEN session executed → gate check → pass', async () => {
    const graph = makeGraphWithGate();

    // Seed successful scaffold response
    opencode.seed('node_scaffold', {
      findings: [{ id: 1, severity: 'high' }],
      summary: 'Test scaffold',
    });

    const instance = new RoleInstance({
      id: 'test:1',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/1',
      graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    assert.strictEqual(instance.state, 'idle');
    assert.strictEqual(instance.currentNode, 'node_scaffold');

    // Step 1: session node
    await instance.step();
    // Should have moved to gate_validate after scaffold OK
    assert.strictEqual(instance.currentNode, 'gate_validate');
    assert.strictEqual(instance.state, 'idle');

    // Step 2: gate node — should pass and go to done
    await instance.step();
    assert.strictEqual(instance.currentNode, 'done');
    assert.strictEqual(instance.state, 'done');
  });

  it('GIVEN gate fails WHEN step THEN node returns to previous session', async () => {
    const graph = makeGraphWithGate();

    // Seed a response that will fail the gate (empty findings)
    opencode.seed('node_scaffold', {
      findings: [], // empty → gate fail
      summary: 'Empty scaffold',
    });

    const instance = new RoleInstance({
      id: 'test:2',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/2',
      graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    await instance.step(); // session → ok
    assert.strictEqual(instance.currentNode, 'gate_validate');

    await instance.step(); // gate → fail → back to scaffold
    assert.strictEqual(instance.currentNode, 'node_scaffold');
  });
});

describe('RoleInstance — recovery ladder (continue)', () => {
  it('GIVEN session возвращает PARSE_ERROR WHEN step THEN continue в ту же сессию, continueCount++', async () => {
    const graph = makeRecoveryGraph();
    opencode.seedError('node_flaky', 'PARSE_ERROR');

    const instance = new RoleInstance({
      id: 'test:3',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/3',
      graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    await instance.step();
    assert.strictEqual(instance.continueCount, 1);
    assert.strictEqual(instance.currentNode, 'node_flaky');
    assert.strictEqual(instance.state, 'idle');
  });
});

describe('RoleInstance — recovery ladder (restart)', () => {
  it('GIVEN continues exhausted WHEN recovery THEN restart, continueCount сброшен, restartCount++', async () => {
    const graph = makeRecoveryGraph();
    opencode.seedError('node_flaky', 'SESSION_ERROR'); // SESSION_ERROR triggers restart directly

    const instance = new RoleInstance({
      id: 'test:4',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/4',
      graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    await instance.step();
    // SESSION_ERROR → restart
    assert.strictEqual(instance.restartCount, 1);
    assert.strictEqual(instance.continueCount, 0);
    assert.strictEqual(instance.state, 'idle');
  });
});

describe('RoleInstance — recovery ladder (AWAITING_OPERATOR)', () => {
  it('GIVEN restartMax исчерпан WHEN recovery THEN AWAITING_OPERATOR', async () => {
    const graph = {
      ...makeRecoveryGraph(),
      nodes: [
        {
          ...makeRecoveryGraph().nodes[0],
          policy: { promptTimeout: 10000, continueMax: 0, restartMax: 2 },
        },
      ],
    };

    opencode.seedError('node_flaky', 'SESSION_ERROR');

    const instance = new RoleInstance({
      id: 'test:5',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/5',
      graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    // Step 1: SESSION_ERROR → restart 1
    await instance.step();
    assert.strictEqual(instance.restartCount, 1);

    // Step 2: SESSION_ERROR → restart 2
    await instance.step();
    assert.strictEqual(instance.restartCount, 2);

    // Step 3: SESSION_ERROR → exceeds restartMax → AWAITING_OPERATOR
    await instance.step();
    assert.strictEqual(instance.state, 'awaiting_operator');
  });
});

// Minimal StateStore interface for tests
interface StateStore {
  loadRegistry(): { version: number; entries: Record<string, unknown> };
  appendAudit(entry: AuditEntry): Promise<void>;
  queryAudit(mr: string): Promise<AuditEntry[]>;
}
