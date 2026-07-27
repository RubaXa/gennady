// @file: Regression for the live bug "assign a role → restart the server → MR is back in «БЕЗ РОЛИ»".
//   Instances live in memory only; without a persisted marker every restart dropped the operator's
//   assignment, and role activation does not help (roles boot inactive, auto-assign is gated on it).
//   Step-by-step, deterministic, no opencode and no browser: assign → assert it hit the registry →
//   build a FRESH scheduler on the same stateDir (that IS the restart) → tick → assignment restored.
// @consumers: node:test runner
// @tasks: TSK-156

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoleEngine } from '../role-engine.ts';
import { RoleScheduler } from '../role-scheduler.ts';
import { StateStore } from '../../inbox-core/state-store.ts';
import { VcsInboxMock } from '../../inbox-core/vcs-inbox.mock.ts';
import { OpenCodeMock } from '../../inbox-opencode/opencode.mock.ts';
import type { VcsActionableMr } from '../../../../vcs-client/entities/vcs-actionable-mr.type.ts';

const MR = 'https://gitlab.example.com/group/project/-/merge_requests/42';

/**
 * A minimal role that parks at an ask node — like a real review waiting for the operator, so the
 * restored instance stays alive instead of completing and being swept as terminal within the tick.
 */
const TEST_ROLE = {
  name: 'reviewer',
  description: 'test reviewer',
  graph: {
    nodes: [
      {
        kind: 'prep' as const,
        id: 'node_prepare',
        async run() {
          return { branch: 'review_needed' };
        },
      },
      {
        kind: 'ask' as const,
        id: 'node_ask',
        question() {
          return { title: 'Post?', body: 'test', choices: ['post', 'skip'] };
        },
      },
    ],
    edges: [
      { from: 'node_prepare', to: 'node_ask', on: 'review_needed' as const },
      { from: 'node_ask', to: 'done', on: 'answered' as const },
    ],
  },
};

function actionableMr(): VcsActionableMr {
  return {
    iid: '42',
    project: 'group/project',
    webUrl: MR,
    title: 'Test MR',
    description: '',
    updatedAt: '2026-07-27T10:00:00Z',
    draft: false,
    state: 'opened',
    author: 'someone',
    reviewers: ['me'],
    approvedBy: [],
    role: 'reviewer',
    events: [],
    directlyAddressed: false,
    todoIds: [],
  };
}

describe('assignment survives a restart (live bug: MR falls back to «БЕЗ РОЛИ»)', () => {
  let stateDir: string;

  /** A scheduler wired to the shared stateDir — a fresh one models a server restart. */
  function bootScheduler(): { scheduler: RoleScheduler; store: StateStore } {
    const engine = new RoleEngine();
    engine.register(TEST_ROLE);
    // Roles boot INACTIVE on purpose — this is the state a real restart lands in, and the
    // assignment must be restored anyway (SV-08: the operator's decision, not auto-assign).
    const store = new StateStore(stateDir);
    const vcs = new VcsInboxMock();
    vcs.seed([actionableMr()]);
    const scheduler = new RoleScheduler({
      engine,
      store,
      vcs,
      opencode: new OpenCodeMock(),
      fetchDiffRefs: async () => undefined,
    });
    return { scheduler, store };
  }

  function registryEntry(): Record<string, unknown> | undefined {
    const raw = JSON.parse(readFileSync(join(stateDir, 'inbox-registry.json'), 'utf8')) as {
      entries: Record<string, Record<string, unknown>>;
    };
    return raw.entries[MR];
  }

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), 'gennady-assign-persist-'));
    mkdirSync(join(stateDir, 'agent-inbox'), { recursive: true });
    // repos.json short-circuits ensureClone so no real network clone is attempted (D-212).
    writeFileSync(
      join(stateDir, 'repos.json'),
      JSON.stringify({ 'group/project': stateDir }),
      'utf8'
    );
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
  });

  it('step 1: manual assignment is written to the registry, not just held in memory', async () => {
    const { scheduler } = bootScheduler();

    await scheduler.assignManual(MR, 'reviewer');

    const entry = registryEntry();
    assert.ok(entry, 'registry must carry an entry for the assigned MR');
    assert.strictEqual(entry.assignedRole, 'reviewer', 'the operator choice must be persisted');
    assert.ok(typeof entry.assignedAt === 'string' && entry.assignedAt.length > 0);
  });

  it('step 2: a fresh scheduler on the same state (= restart) restores the assignment on tick', async () => {
    const first = bootScheduler();
    await first.scheduler.assignManual(MR, 'reviewer');
    assert.strictEqual(
      first.scheduler.listInstances().length,
      1,
      'sanity: the first scheduler holds the instance in memory'
    );

    // The restart: a brand-new scheduler, empty in-memory instance map, roles inactive.
    const second = bootScheduler();
    assert.strictEqual(
      second.scheduler.listInstances().length,
      0,
      'a fresh scheduler starts with no instances — this is why the MR used to fall back to «БЕЗ РОЛИ»'
    );

    await second.scheduler.tick();

    const restored = second.scheduler.listInstances();
    assert.strictEqual(restored.length, 1, 'the assignment must be restored after a restart');
    assert.strictEqual(restored[0].mr, MR);
    assert.strictEqual(restored[0].role, 'reviewer');
  });

  it('step 3: an assignment for a role that no longer exists is dropped, not retried forever', async () => {
    const { scheduler, store } = bootScheduler();
    store.recordAssignment(MR, 'ghost-role', { project: 'group/project', iid: '42' });

    await scheduler.tick();

    assert.strictEqual(registryEntry()?.assignedRole, undefined, 'stale marker must be cleared');
    assert.strictEqual(scheduler.listInstances().length, 0);
  });
});
