// @file: Inclusive discovery and complete sync/cursor recovery integration tests.
// @consumers: node:test runner
// @tasks: TSK-174

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryJournal } from '../../inbox-core/adapters/in-memory-journal.ts';
import { VcsSyncCoordinator } from '../sync-coordinator.ts';
import { MemoryVcsPort, createActionableMr, createVcsSnapshot } from './vcs-test-context.ts';

type VcsSyncContext = {
  port: MemoryVcsPort;
  journal: InMemoryJournal;
  coordinator: VcsSyncCoordinator;
};

function createVcsSyncContext(): VcsSyncContext {
  const port = new MemoryVcsPort();
  const journal = new InMemoryJournal();
  const coordinator = new VcsSyncCoordinator(
    port,
    journal,
    undefined,
    () => '2026-08-10T12:00:00.000Z'
  );
  return { port, journal, coordinator };
}

const noParticipation = {
  author: false,
  reviewer: false,
  assignee: false,
  mentioned: false,
  commented: false,
  approved: false,
};

describe('VcsSyncCoordinator', () => {
  it('discovery includes every explicit participation signal once', async () => {
    const context = createVcsSyncContext();
    const signals = Object.keys(noParticipation) as Array<keyof typeof noParticipation>;
    context.port.inbox = signals.map((signal, index) =>
      createActionableMr(String(index + 1), { ...noParticipation, [signal]: true })
    );
    context.port.inbox.push(
      createActionableMr('1', { ...noParticipation, author: true, commented: true }),
      createActionableMr(
        'old',
        { ...noParticipation, reviewer: true },
        {
          updatedAt: '2026-04-01T00:00:00.000Z',
        }
      ),
      createActionableMr('closed', { ...noParticipation, reviewer: true }, { state: 'merged' }),
      createActionableMr('none', noParticipation)
    );

    const targets = await context.coordinator.discover();

    assert.deepStrictEqual(
      targets.map((target) => target.iid),
      ['1', '2', '3', '4', '5', '6']
    );
  });

  it('partial or failed sync preserves cursor and recovery appends every event in order', async () => {
    // contract: incomplete observation cannot silently advance the recovery boundary or enable effects
    const context = createVcsSyncContext();
    const target = { project: 'group/project', iid: '42' };

    // #region START_CURSOR_RECOVERY_SETUP_OBSERVATIONS
    const initial = createVcsSnapshot();
    const partial = createVcsSnapshot({
      cursor: 'cursor-partial',
      completeness: { ...initial.completeness, discussions: false },
    });
    const recovered = createVcsSnapshot({
      observedAt: '2026-08-10T12:05:00.000Z',
      cursor: 'cursor-2',
      headSha: 'sha-2',
      commits: ['sha-1a', 'sha-2'],
      description: 'Recovered description',
      discussions: [
        {
          id: 'discussion-1',
          resolved: false,
          notes: [
            {
              id: 'note-1',
              author: 'reviewer',
              body: 'Please fix',
              createdAt: '2026-08-10T12:03:00.000Z',
              system: false,
            },
          ],
        },
      ],
      approvedBy: ['approver'],
      pipelineStatus: 'success',
    });
    context.port.reads = [initial, partial, new Error('poll unavailable'), recovered];
    // #endregion END_CURSOR_RECOVERY_SETUP_OBSERVATIONS

    // #region START_CURSOR_RECOVERY_TRIGGER_ALL_STATES
    const first = await context.coordinator.synchronizeOne(target);
    const incomplete = await context.coordinator.synchronizeOne(target);
    const failed = await context.coordinator.synchronizeOne(target);
    const recovery = await context.coordinator.synchronizeOne(target);
    // #endregion END_CURSOR_RECOVERY_TRIGGER_ALL_STATES

    // #region START_CURSOR_RECOVERY_ASSERT_ORDER_AND_GATES
    assert.strictEqual(first.cursor, 'cursor-1');
    assert.deepStrictEqual(
      [incomplete.cursor, failed.cursor, incomplete.effectsPostponed, failed.effectsPostponed],
      ['cursor-1', 'cursor-1', true, true]
    );
    assert.strictEqual(recovery.cursor, 'cursor-2');
    assert.deepStrictEqual(
      context.journal.replayReviewEvents().map((event) => event.kind),
      [
        'mr_observed',
        'commit_pushed',
        'commit_pushed',
        'description_changed',
        'discussion_changed',
        'approval_changed',
        'pipeline_changed',
      ]
    );
    // #endregion END_CURSOR_RECOVERY_ASSERT_ORDER_AND_GATES
  });
});
