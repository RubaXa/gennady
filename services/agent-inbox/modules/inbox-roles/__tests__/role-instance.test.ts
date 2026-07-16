// @file: Unit tests for inbox-roles RoleInstance — step() per node kind (prep/session/gate),
//   recovery ladder (continue/restart/AWAITING_OPERATOR), checkpoint-based restart recovery,
//   buildTaskText contract.
// @consumers: node:test runner
// @tasks: TSK-113, TSK-124

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RoleInstance } from '../role-instance.ts';
import type { RoleGraph } from '../role-node.ts';
import { OpenCodeMock } from '../../inbox-opencode/opencode.mock.ts';
import { VcsInboxMock } from '../../inbox-core/vcs-inbox.mock.ts';
import type { AuditEntry } from '../../inbox-core/audit-log.ts';
import type { CreateSessionOpts, SessionHandle } from '../../inbox-opencode/opencode.port.ts';

/**
 * @purpose Spy on OpenCodeMock#createSession — records the `directory` each call received, so
 *   TSK-124 regression tests can assert which directory RoleInstance#_executeSession fed in
 *   (ctx.artifacts.worktreePath vs the node.dir(ctx) fallback) without reaching into private state.
 */
class OpenCodeCreateSessionSpy extends OpenCodeMock {
  public createSessionCalls: CreateSessionOpts[] = [];

  override async createSession(opts: CreateSessionOpts): Promise<SessionHandle> {
    this.createSessionCalls.push(opts);
    return super.createSession(opts);
  }
}

// Fake StateStore with in-memory audit
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
    return this.audits;
  }
}

interface StateStore {
  getStateDir(): string;
  loadRegistry(): { version: number; entries: Record<string, unknown> };
  appendAudit(entry: AuditEntry): Promise<void>;
  queryAudit(mr: string): Promise<AuditEntry[]>;
}

// ─── Graph fixtures ─────────────────────────────────────────────────────────────

function makePrepGraph(): RoleGraph {
  return {
    nodes: [
      {
        kind: 'prep',
        id: 'node_prep',
        async run(ctx) {
          const flag = ctx.artifacts['flag'] as string | undefined;
          return {
            branch: flag === 'b' ? 'go_b' : 'go_a',
            artifacts: { seenFlag: flag ?? null },
          };
        },
      },
      {
        kind: 'gate',
        id: 'gate_a',
        verify() {
          return { pass: true };
        },
      },
      {
        kind: 'gate',
        id: 'gate_b',
        verify() {
          return { pass: true };
        },
      },
    ],
    edges: [
      { from: 'node_prep', to: 'gate_a', on: 'go_a' },
      { from: 'node_prep', to: 'gate_b', on: 'go_b' },
      { from: 'gate_a', to: 'done', on: 'pass' },
      { from: 'gate_b', to: 'done', on: 'pass' },
    ],
  };
}

function makeGraphWithGate(): RoleGraph {
  return {
    nodes: [
      {
        kind: 'session',
        id: 'node_scaffold',
        buildTaskText(ctx) {
          return `Do scaffold for ${ctx.mr.webUrl}`;
        },
        dir(ctx) {
          return `${ctx.workspace}/test-gate`;
        },
        resultSchema: {
          title: 'node_scaffold',
          type: 'object',
          properties: { findings: { type: 'array' } },
        },
        policy: { promptTimeout: 10, continueMax: 2, restartMax: 2 },
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
        buildTaskText() {
          return 'May fail';
        },
        dir(ctx) {
          return `${ctx.workspace}/test-recovery`;
        },
        resultSchema: {
          title: 'node_flaky',
          type: 'object',
          properties: { result: { type: 'string' } },
        },
        policy: { promptTimeout: 10, continueMax: 2, restartMax: 1 },
      },
    ],
    edges: [{ from: 'node_flaky', to: 'done', on: 'ok' }],
  };
}

/** @purpose Two-node linear session graph — used to prove checkpoint restart does not re-run node_a. */
function makeTwoNodeGraph(): RoleGraph {
  return {
    nodes: [
      {
        kind: 'session',
        id: 'node_a',
        buildTaskText() {
          return 'node_a task';
        },
        dir(ctx) {
          return `${ctx.workspace}/node-a`;
        },
        resultSchema: { title: 'node_a', type: 'object', properties: {} },
        policy: { promptTimeout: 10, continueMax: 1, restartMax: 1 },
      },
      {
        kind: 'session',
        id: 'node_b',
        buildTaskText() {
          return 'node_b task';
        },
        dir(ctx) {
          return `${ctx.workspace}/node-b`;
        },
        resultSchema: { title: 'node_b', type: 'object', properties: {} },
        policy: { promptTimeout: 10, continueMax: 1, restartMax: 1 },
      },
    ],
    edges: [
      { from: 'node_a', to: 'node_b', on: 'ok' },
      { from: 'node_b', to: 'done', on: 'ok' },
    ],
  };
}

/** @purpose Single-session-node graph used by TSK-124 regression tests — dir() returns a fixed
 *   marker distinct from any real worktree, so a passing fallback assertion proves createSession
 *   actually received node.dir(ctx) rather than coincidentally matching a computed workspace path. */
function makeSingleSessionGraph(): RoleGraph {
  return {
    nodes: [
      {
        kind: 'session',
        id: 'node_wt',
        buildTaskText() {
          return 'TSK-124 regression task';
        },
        dir() {
          return 'FALLBACK_DIR_MARKER';
        },
        resultSchema: { title: 'node_wt', type: 'object', properties: {} },
        policy: { promptTimeout: 10, continueMax: 1, restartMax: 1 },
      },
    ],
    edges: [{ from: 'node_wt', to: 'done', on: 'ok' }],
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

describe('RoleInstance — prep node dispatch', () => {
  it('GIVEN prep без seed WHEN step THEN branch по умолчанию (go_a)', async () => {
    const instance = new RoleInstance({
      id: 'test:prep:1',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/1',
      graph: makePrepGraph(),
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    assert.strictEqual(instance.currentNode, 'node_prep');
    await instance.step();
    assert.strictEqual(instance.currentNode, 'gate_a');
  });

  it('GIVEN prep с ctx.artifacts.flag=b (seeded через checkpoint) WHEN step THEN branch go_b', async () => {
    const instance = new RoleInstance({
      id: 'test:prep:2',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/2',
      graph: makePrepGraph(),
      opencode,
      vcs,
      store: store as unknown as StateStore,
      checkpoint: {
        currentNode: 'node_prep',
        continueCount: 0,
        restartCount: 0,
        artifacts: { flag: 'b' },
      },
    });

    await instance.step();
    assert.strictEqual(instance.currentNode, 'gate_b');
    assert.strictEqual(instance.getCheckpoint().artifacts['seenFlag'], 'b');
  });
});

describe('RoleInstance — session (buildTaskText) → gate transition', () => {
  it('GIVEN session успешен WHEN step THEN buildTaskText вызван → gate check → pass', async () => {
    const graph = makeGraphWithGate();

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

    await instance.step();
    assert.strictEqual(instance.currentNode, 'gate_validate');
    assert.strictEqual(instance.state, 'idle');

    await instance.step();
    assert.strictEqual(instance.currentNode, 'done');
    assert.strictEqual(instance.state, 'done');
  });

  it('GIVEN gate fails WHEN step THEN node возвращается к предыдущей сессии', async () => {
    const graph = makeGraphWithGate();

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
  it('GIVEN continues исчерпаны WHEN recovery THEN restart, continueCount сброшен, restartCount++', async () => {
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
          policy: { promptTimeout: 10, continueMax: 0, restartMax: 2 },
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

describe('RoleInstance — checkpoint restart recovery (SV-13: заполненные узлы не переисполняются)', () => {
  it('GIVEN checkpoint с currentNode=node_b и заполненным node_a WHEN construct THEN node_a не переисполняется', async () => {
    const graph = makeTwoNodeGraph();
    // Intentionally NOT seeding 'node_a' — if the engine tried to re-execute it, the mock would
    // return NO_RESULT and the instance would stay stuck on node_a (recovery ladder), never
    // reaching node_b. Seeding only node_b proves resumption skips the already-filled node.
    opencode.seed('node_b', { done: true });

    const instance = new RoleInstance({
      id: 'test:checkpoint:1',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/6',
      graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
      checkpoint: {
        currentNode: 'node_b',
        continueCount: 0,
        restartCount: 0,
        artifacts: { node_a: { done: true } },
      },
    });

    // Resumes directly at node_b — node_a is not re-entered.
    assert.strictEqual(instance.currentNode, 'node_b');
    assert.strictEqual(instance.getCheckpoint().artifacts['node_a'] !== undefined, true);

    await instance.step();
    assert.strictEqual(instance.currentNode, 'done');
    assert.strictEqual(instance.state, 'done');
    // node_a's checkpointed artifact survives untouched across the resumed run.
    assert.deepStrictEqual(instance.getCheckpoint().artifacts['node_a'], { done: true });
  });
});

describe('RoleInstance — _executeSession directory wiring (TSK-124 regression: B2 root cause)', () => {
  it('GIVEN ctx.artifacts.worktreePath присутствует WHEN session node запускается THEN createSession получает worktreePath, не node.dir(ctx)', async () => {
    const spy = new OpenCodeCreateSessionSpy();
    const realWorktreePath = '/home/test/.gennady/worktrees/test-mr-1';
    spy.seed('node_wt', { done: true });

    const instance = new RoleInstance({
      id: 'test:tsk124:present',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/124',
      graph: makeSingleSessionGraph(),
      opencode: spy,
      vcs,
      store: store as unknown as StateStore,
      checkpoint: {
        currentNode: 'node_wt',
        continueCount: 0,
        restartCount: 0,
        artifacts: { worktreePath: realWorktreePath },
      },
    });

    await instance.step();

    assert.strictEqual(spy.createSessionCalls.length, 1);
    assert.strictEqual(spy.createSessionCalls[0]?.directory, realWorktreePath);
    assert.notStrictEqual(spy.createSessionCalls[0]?.directory, 'FALLBACK_DIR_MARKER');
  });

  it('GIVEN ctx.artifacts.worktreePath отсутствует WHEN session node запускается THEN createSession получает node.dir(ctx) (старое поведение сохранено)', async () => {
    const spy = new OpenCodeCreateSessionSpy();
    spy.seed('node_wt', { done: true });

    const instance = new RoleInstance({
      id: 'test:tsk124:absent',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/125',
      graph: makeSingleSessionGraph(),
      opencode: spy,
      vcs,
      store: store as unknown as StateStore,
    });

    await instance.step();

    assert.strictEqual(spy.createSessionCalls.length, 1);
    assert.strictEqual(spy.createSessionCalls[0]?.directory, 'FALLBACK_DIR_MARKER');
  });
});
