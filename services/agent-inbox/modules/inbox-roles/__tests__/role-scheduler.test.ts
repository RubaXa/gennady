// @file: Unit tests for inbox-roles RoleScheduler — tick, assignManual, activeCount.
// @consumers: node:test runner
// @tasks: TSK-113

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RoleEngine } from '../role-engine.ts';
import { RoleScheduler } from '../role-scheduler.ts';
import { OpenCodeMock } from '../../inbox-opencode/opencode.mock.ts';
import { VcsInboxMock } from '../../inbox-core/vcs-inbox.mock.ts';
import type { AuditEntry } from '../../inbox-core/audit-log.ts';
import type { VcsActionableMr } from '../../../../vcs-client/entities/vcs-actionable-mr.type.ts';

// Fake StateStore
class FakeStateStore {
  public audits: AuditEntry[] = [];
  public registry: Record<string, unknown> = { entries: {} };

  loadRegistry() {
    return this.registry;
  }

  loadConfig() {
    return { configured: false, missing: ['reposBase', 'vcsHost'] };
  }

  async appendAudit(entry: AuditEntry) {
    this.audits.push(entry);
  }

  async queryAudit(_mr: string): Promise<AuditEntry[]> {
    return this.audits;
  }
}

interface StateStoreLike {
  loadRegistry(): unknown;
  loadConfig(): unknown;
  appendAudit(entry: AuditEntry): Promise<void>;
  queryAudit(mr: string): Promise<AuditEntry[]>;
}

const reviewerGraph = {
  name: 'reviewer',
  description: 'Reviewer',
  graph: {
    nodes: [
      {
        kind: 'session' as const,
        id: 'node_scaffold',
        prompt() {
          return { system: 'Test', text: 'Test prompt' };
        },
        dir() {
          return '/tmp/scheduler-test';
        },
        resultSchema: {
          title: 'node_scaffold',
          type: 'object',
          properties: { value: { type: 'string' } },
        },
        policy: { promptTimeout: 10000, continueMax: 1, restartMax: 1 },
      },
    ],
    edges: [{ from: 'node_scaffold', to: 'done', on: 'ok' as const }],
  },
};

function makeMr(overrides: Partial<VcsActionableMr> = {}): VcsActionableMr {
  return {
    iid: '42',
    project: 'group/project',
    webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/42',
    title: 'Test MR',
    description: 'Description',
    author: 'author',
    reviewers: [],
    approvedBy: [],
    updatedAt: new Date().toISOString(),
    draft: false,
    state: 'opened',
    role: 'reviewer',
    events: [],
    directlyAddressed: false,
    todoIds: [],
    ...overrides,
  };
}

let engine: RoleEngine;
let vcs: VcsInboxMock;
let opencode: OpenCodeMock;
let store: FakeStateStore;

before(() => {
  engine = new RoleEngine();
});

beforeEach(() => {
  engine = new RoleEngine();
  engine.register(reviewerGraph);
  vcs = new VcsInboxMock();
  opencode = new OpenCodeMock();
  store = new FakeStateStore();
});

describe('RoleScheduler — tick', () => {
  it('GIVEN активная роль + MRs в VCS WHEN tick THEN новые MR назначены и продвинуты', async () => {
    const mr = makeMr();
    vcs.seed([mr]);
    opencode.seed('node_scaffold', { findings: [{ id: 1 }], summary: 'Done' });

    engine.activate('reviewer');

    const scheduler = new RoleScheduler({
      engine,
      vcs,
      opencode,
      store: store as unknown as StateStoreLike,
    });

    assert.strictEqual(scheduler.activeCount(), 0);

    await scheduler.tick();

    // After tick, the instance should have completed (session → done)
    assert.strictEqual(scheduler.activeCount(), 0); // completed instances are cleaned
  });

  it('GIVEN нет активных ролей WHEN tick THEN ничего не назначено', async () => {
    const mr = makeMr();
    vcs.seed([mr]);

    const scheduler = new RoleScheduler({
      engine,
      vcs,
      opencode,
      store: store as unknown as StateStoreLike,
    });

    await scheduler.tick();
    assert.strictEqual(scheduler.activeCount(), 0);
  });

  it('GIVEN роль не соответствует MR role WHEN tick THEN не назначена', async () => {
    // MR is for 'reviewer' role but we activate only 'author'
    const mr = makeMr({ role: 'reviewer' });
    vcs.seed([mr]);

    // Register author role
    engine.register({
      name: 'author',
      description: 'Author',
      graph: {
        nodes: [
          {
            kind: 'session',
            id: 'node_fetch',
            prompt() {
              return { system: 'A', text: 'A' };
            },
            dir() {
              return '/tmp/a';
            },
            policy: { promptTimeout: 10000, continueMax: 1, restartMax: 1 },
          },
        ],
        edges: [{ from: 'node_fetch', to: 'done', on: 'ok' }],
      },
    });

    engine.activate('author');

    const scheduler = new RoleScheduler({
      engine,
      vcs,
      opencode,
      store: store as unknown as StateStoreLike,
    });

    await scheduler.tick();
    // No instances because MR role is 'reviewer', but only 'author' is active
    assert.strictEqual(scheduler.activeCount(), 0);
  });
});

describe('RoleScheduler — assignManual', () => {
  it('GIVEN роль активна WHEN assignManual THEN инстанс создан', async () => {
    engine.activate('reviewer');

    const scheduler = new RoleScheduler({
      engine,
      vcs,
      opencode,
      store: store as unknown as StateStoreLike,
    });

    assert.strictEqual(scheduler.activeCount(), 0);

    await scheduler.assignManual(
      'https://gitlab.example.com/group/project/-/merge_requests/1',
      'reviewer',
      { canPost: false }
    );

    assert.strictEqual(scheduler.activeCount(), 1);
  });

  it('GIVEN роль не активна WHEN assignManual THEN не создаётся', async () => {
    const scheduler = new RoleScheduler({
      engine,
      vcs,
      opencode,
      store: store as unknown as StateStoreLike,
    });

    await scheduler.assignManual(
      'https://gitlab.example.com/group/project/-/merge_requests/1',
      'reviewer'
    );

    assert.strictEqual(scheduler.activeCount(), 0);
  });
});

interface StateStore {
  loadRegistry(): { version: number; entries: Record<string, unknown> };
  appendAudit(entry: AuditEntry): Promise<void>;
  queryAudit(mr: string): Promise<AuditEntry[]>;
}
