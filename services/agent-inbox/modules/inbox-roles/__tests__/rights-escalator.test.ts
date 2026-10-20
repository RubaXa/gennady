// @file: Unit tests for inbox-roles RightsEscalator — evaluate (24h inactivity → notification + cooldown).
// @consumers: node:test runner
// @tasks: TSK-113

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RightsEscalator } from '../rights-escalator.ts';
import type { RoleInstance } from '../role-instance.ts';
import type { AuditEntry } from '../../inbox-core/audit-log.ts';
import { RoleInstance as RoleInstanceClass } from '../role-instance.ts';
import { OpenCodeMock } from '../../inbox-opencode/opencode.mock.ts';
import { VcsInboxMock } from '../../inbox-core/vcs-inbox.mock.ts';
import type { RoleGraph } from '../role-node.ts';

class FakeStateStore {
  public audits: AuditEntry[] = [];

  loadRegistry() {
    return { version: 1, entries: {} };
  }

  loadConfig() {
    return { configured: false, missing: ['reposBase', 'vcsHost'] };
  }

  async appendAudit(entry: AuditEntry) {
    this.audits.push(entry);
  }

  async queryAudit(_mr: string): Promise<AuditEntry[]> {
    return [...this.audits];
  }
}

interface StateStoreLike {
  loadRegistry(): unknown;
  appendAudit(entry: AuditEntry): Promise<void>;
  queryAudit(mr: string): Promise<AuditEntry[]>;
}

function makeAskGraph(): RoleGraph {
  return {
    nodes: [
      {
        kind: 'ask',
        id: 'node_ask',
        question() {
          return { title: 'Approve?', body: 'Should I post?', choices: ['yes', 'no'] };
        },
      },
    ],
    edges: [{ from: 'node_ask', to: 'done', on: 'ok' }],
  };
}

let store: FakeStateStore;
let opencode: OpenCodeMock;
let vcs: VcsInboxMock;

before(() => {
  opencode = new OpenCodeMock();
  vcs = new VcsInboxMock();
});

beforeEach(() => {
  opencode = new OpenCodeMock();
  vcs = new VcsInboxMock();
  store = new FakeStateStore();
});

describe('RightsEscalator — evaluate', () => {
  it('GIVEN инстанс НЕ awaiting_operator WHEN evaluate THEN shouldEscalate=false', async () => {
    const escalator = new RightsEscalator({
      store: store as unknown as StateStoreLike,
      threshold: 1000, // 1 second for test
      cooldown: 500,
    });

    const instance = new RoleInstanceClass({
      id: 'test:esc1',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/mr/1',
      graph: makeAskGraph(),
      opencode,
      vcs,
      store: store as unknown as StateStoreLike,
    });

    // Instance is idle, not awaiting_operator
    const result = await escalator.evaluate(instance);
    assert.strictEqual(result.shouldEscalate, false);
    assert.ok(result.reason?.includes('not in awaiting_operator'));
  });

  it('GIVEN instance awaiting AND оператор недавно действовал WHEN evaluate THEN таймер сброшен (no escalation)', async () => {
    const escalator = new RightsEscalator({
      store: store as unknown as StateStoreLike,
      threshold: 60 * 1000, // 1 minute
      cooldown: 60 * 1000,
    });

    // Simulate recent operator action
    await store.appendAudit({
      ts: new Date().toISOString(),
      mr: 'https://gitlab.example.com/mr/2',
      role: 'reviewer',
      event: 'operator_action',
      detail: 'Operator approved posting',
    });

    const instance = new RoleInstanceClass({
      id: 'test:esc2',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/mr/2',
      graph: makeAskGraph(),
      opencode,
      vcs,
      store: store as unknown as StateStoreLike,
    });

    // Manually set state to awaiting_operator
    instance.state = 'awaiting_operator';

    const result = await escalator.evaluate(instance);
    assert.strictEqual(result.shouldEscalate, false);
    assert.ok(
      result.reason?.includes('within threshold') || result.reason?.includes('Timer reset')
    );
  });

  it('GIVEN instance awaiting 24h+ без operator_action WHEN evaluate THEN shouldEscalate=true + message', async () => {
    const escalator = new RightsEscalator({
      store: store as unknown as StateStoreLike,
      threshold: 100, // very short threshold for test
      cooldown: 50,
    });

    // No operator_action in audit — simulate old classified event
    await store.appendAudit({
      ts: new Date(Date.now() - 3600 * 1000).toISOString(), // 1 hour ago
      mr: 'https://gitlab.example.com/mr/3',
      role: 'reviewer',
      event: 'classified',
      detail: 'Session completed',
    });

    const instance = new RoleInstanceClass({
      id: 'test:esc3',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/mr/3',
      graph: makeAskGraph(),
      opencode,
      vcs,
      store: store as unknown as StateStoreLike,
    });

    instance.state = 'awaiting_operator';

    const result = await escalator.evaluate(instance);
    assert.strictEqual(result.shouldEscalate, true);
    assert.ok(result.message?.includes('awaiting operator'));
  });

  it('GIVEN escalation уже была недавно WHEN evaluate THEN cooldown активен (no escalation)', async () => {
    const escalator = new RightsEscalator({
      store: store as unknown as StateStoreLike,
      threshold: 100, // very short threshold for test
      cooldown: 60 * 60 * 1000, // 1 hour cooldown
    });

    // Recent escalation
    await store.appendAudit({
      ts: new Date(Date.now() - 1000).toISOString(), // 1 second ago
      mr: 'https://gitlab.example.com/mr/4',
      role: 'reviewer',
      event: 'escalated',
      detail: 'Already escalated recently',
    });

    // Old classified event to indicate inactivity
    await store.appendAudit({
      ts: new Date(Date.now() - 3600 * 1000).toISOString(), // 1 hour ago
      mr: 'https://gitlab.example.com/mr/4',
      role: 'reviewer',
      event: 'classified',
      detail: 'Old classification',
    });

    const instance = new RoleInstanceClass({
      id: 'test:esc4',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/mr/4',
      graph: makeAskGraph(),
      opencode,
      vcs,
      store: store as unknown as StateStoreLike,
    });

    instance.state = 'awaiting_operator';

    const result = await escalator.evaluate(instance);
    assert.strictEqual(result.shouldEscalate, false);
    assert.ok(result.reason?.includes('cooldown'));
  });
});

describe('RightsEscalator — schedule', () => {
  it('schedule записывает escalated в audit', async () => {
    const escalator = new RightsEscalator({
      store: store as unknown as StateStoreLike,
    });

    const instance = new RoleInstanceClass({
      id: 'test:esc5',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/mr/5',
      graph: makeAskGraph(),
      opencode,
      vcs,
      store: store as unknown as StateStoreLike,
    });

    await escalator.schedule(instance);

    const audits = await store.queryAudit('https://gitlab.example.com/mr/5');
    const escalated = audits.filter((e) => e.event === 'escalated');
    assert.ok(escalated.length > 0);
  });
});

describe('RightsEscalator — notifyReady', () => {
  it('GIVEN инстанс НЕ awaiting_operator WHEN notifyReady THEN ничего не пишется в audit', async () => {
    const escalator = new RightsEscalator({ store: store as unknown as StateStoreLike });

    const instance = new RoleInstanceClass({
      id: 'test:notify1',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/mr/10',
      graph: makeAskGraph(),
      opencode,
      vcs,
      store: store as unknown as StateStoreLike,
    });

    await escalator.notifyReady(instance);
    const audits = await store.queryAudit('https://gitlab.example.com/mr/10');
    assert.strictEqual(audits.length, 0);
  });

  it('GIVEN оператор не реагирует (AWAITING_OPERATOR) WHEN notifyReady THEN notified_ready записан сразу, без threshold/cooldown', async () => {
    const escalator = new RightsEscalator({ store: store as unknown as StateStoreLike });

    const instance = new RoleInstanceClass({
      id: 'test:notify2',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/mr/11',
      graph: makeAskGraph(),
      opencode,
      vcs,
      store: store as unknown as StateStoreLike,
    });
    instance.state = 'awaiting_operator';

    await escalator.notifyReady(instance);

    const audits = await store.queryAudit('https://gitlab.example.com/mr/11');
    const notified = audits.filter((e) => e.event === 'notified_ready');
    assert.strictEqual(notified.length, 1);
  });

  it('GIVEN уже notifyReady в этот период WHEN notifyReady снова THEN дедуп — новой записи нет', async () => {
    const escalator = new RightsEscalator({ store: store as unknown as StateStoreLike });

    const instance = new RoleInstanceClass({
      id: 'test:notify3',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/mr/12',
      graph: makeAskGraph(),
      opencode,
      vcs,
      store: store as unknown as StateStoreLike,
    });
    instance.state = 'awaiting_operator';

    await escalator.notifyReady(instance);
    await escalator.notifyReady(instance);

    const audits = await store.queryAudit('https://gitlab.example.com/mr/12');
    const notified = audits.filter((e) => e.event === 'notified_ready');
    assert.strictEqual(notified.length, 1);
  });

  it('GIVEN оператор бездействует WHEN notifyReady + remindIdle THEN права инстанса не растут (rights никогда не устанавливаются эскалатором)', async () => {
    const escalator = new RightsEscalator({
      store: store as unknown as StateStoreLike,
      threshold: 50,
      cooldown: 50,
    });

    await store.appendAudit({
      ts: new Date(Date.now() - 3600 * 1000).toISOString(),
      mr: 'https://gitlab.example.com/mr/13',
      role: 'reviewer',
      event: 'classified',
      detail: 'Old classification',
    });

    const instance = new RoleInstanceClass({
      id: 'test:notify4',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/mr/13',
      graph: makeAskGraph(),
      opencode,
      vcs,
      store: store as unknown as StateStoreLike,
    });
    instance.state = 'awaiting_operator';

    await escalator.notifyReady(instance);
    await escalator.remindIdle(instance);

    // RightsEscalator (v1, D74) only ever notifies — it has no method that grants or widens
    // operational rights. The only audit events it can append are 'notified_ready'/'escalated'.
    const audits = await store.queryAudit('https://gitlab.example.com/mr/13');
    const eventNames = new Set(audits.map((e) => e.event));
    for (const name of eventNames) {
      assert.ok(
        name === 'notified_ready' || name === 'escalated' || name === 'classified',
        `unexpected escalator-authored event: ${name}`
      );
    }
  });
});

interface StateStore {
  loadRegistry(): { version: number; entries: Record<string, unknown> };
  appendAudit(entry: AuditEntry): Promise<void>;
  queryAudit(mr: string): Promise<AuditEntry[]>;
}
