// @file: Integration proof that the existing PipelineRuntime owns durable control-plane boundaries.
// @consumers: TSK-184 verification, TSK-190 audit traceability
// @tasks: TSK-184, TSK-190

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { join } from 'node:path';
import { EventJournal } from '../../inbox-core/event-journal.ts';
import { cleanupTestTmp, makeTestTmpDir } from '../../inbox-core/test-support/test-tmp.ts';
import { InMemoryTaskQueue } from '../../inbox-queue/task-queue.ts';
import { TaskRegistry } from '../../inbox-queue/task-registry.ts';
import { ReviewRepairCoordinator } from '../coverage/review-repair-coordinator.ts';
import { ReviewStructuralValidator } from '../coverage/review-structural-validator.ts';
import { ReviewOrchestrator } from '../review/review-orchestrator.ts';
import { ReviewFreshnessGate } from '../verification/review-freshness-gate.ts';
import { PipelineRuntime } from '../pipeline-runtime.ts';

class RejectingControlJournal extends EventJournal {
  override async append(): Promise<number> {
    throw new Error('control persistence rejected');
  }
}

type RuntimeControlPlaneContext = {
  root: string;
  taskJournalPath: string;
  controlJournalPath: string;
  createRuntime(): PipelineRuntime;
};

function createRuntimeControlPlaneContext(): RuntimeControlPlaneContext {
  const root = makeTestTmpDir('pipeline-control-plane-');
  const taskJournalPath = join(root, 'task-events.jsonl');
  const controlJournalPath = join(root, 'control-events.jsonl');
  const createRuntime = (): PipelineRuntime => {
    const registry = new TaskRegistry();
    return new PipelineRuntime(
      new InMemoryTaskQueue(registry),
      registry,
      new EventJournal(taskJournalPath),
      async () => undefined,
      root,
      undefined,
      undefined,
      {
        journal: new EventJournal(controlJournalPath),
        receiptRoot: join(root, 'receipts'),
        runtimeNamespace: 'test-run',
      }
    );
  };
  return { root, taskJournalPath, controlJournalPath, createRuntime };
}

describe('PipelineRuntime deterministic control plane', () => {
  it('rejects one journal instance shared by task execution and control records', () => {
    const root = makeTestTmpDir('pipeline-same-journal-');
    try {
      const registry = new TaskRegistry();
      const journal = new EventJournal(join(root, 'shared-events.jsonl'));
      assert.throws(
        () =>
          new PipelineRuntime(
            new InMemoryTaskQueue(registry),
            registry,
            journal,
            async () => undefined,
            root,
            undefined,
            undefined,
            {
              journal,
              receiptRoot: join(root, 'receipts'),
              runtimeNamespace: 'test-run',
            }
          ),
        /must be separate/
      );
    } finally {
      cleanupTestTmp(root);
    }
  });

  it('rejects review authorization when the control journal cannot acknowledge persistence', async () => {
    const root = makeTestTmpDir('pipeline-rejected-control-');
    try {
      const registry = new TaskRegistry();
      const queue = new InMemoryTaskQueue(registry);
      const runtime = new PipelineRuntime(
        queue,
        registry,
        new EventJournal(join(root, 'task-events.jsonl')),
        async () => undefined,
        root,
        undefined,
        undefined,
        {
          journal: new RejectingControlJournal(join(root, 'control-events.jsonl')),
          receiptRoot: join(root, 'receipts'),
          runtimeNamespace: 'test-run',
        }
      );
      await assert.rejects(
        runtime.startReview('group/project!184', {
          controlPlaneInput: {
            intent: {
              kind: 'full',
              manifestKey: {
                mr: 'group/project!184',
                headSHA: 'head-184',
                eventCursor: 'cursor-184',
              },
              trigger: 'test',
              requester: 'operator',
            },
            capture: {
              inputs: [
                {
                  inputId: 'source:mr',
                  kind: 'source',
                  canonicalIdentity: 'group/project!184',
                  version: 'head-184',
                  digest: 'digest-184',
                  capturedBytes: 'truthful source bytes',
                },
              ],
              classifications: [
                {
                  inputId: 'source:mr',
                  code: 'BEHAVIOR_CHANGED',
                  changeShape: ['BEHAVIOR_CHANGED'],
                  rationaleDigest: 'reason-184',
                  classifierVersion: 'review-classifier-v0',
                },
              ],
              provenance: ['test'],
            },
          },
        }),
        /control persistence rejected/
      );
      assert.strictEqual(queue.state('group/project!184').length, 0);
    } finally {
      cleanupTestTmp(root);
    }
  });

  it('audit proof is mechanically traceable', async () => {
    const context = createRuntimeControlPlaneContext();
    try {
      const runtime = context.createRuntime();
      const controlPlane = runtime.retrieveControlPlane();
      assert.ok(controlPlane);

      // #region START_CONTROL_PLANE_ASSERT_SINGLE_OWNER
      assert.ok(controlPlane.orchestrator instanceof ReviewOrchestrator);
      assert.ok(controlPlane.structuralValidator instanceof ReviewStructuralValidator);
      assert.ok(controlPlane.repairCoordinator('round-1') instanceof ReviewRepairCoordinator);
      assert.ok(controlPlane.freshnessGate instanceof ReviewFreshnessGate);
      assert.strictEqual(runtime.retrieveControlPlane(), controlPlane);
      assert.strictEqual(
        runtime.retrieveControlPlaneConstructionTrace()?.separateControlJournal,
        true
      );
      // #endregion END_CONTROL_PLANE_ASSERT_SINGLE_OWNER

      const key = { mr: 'group/project!184', headSHA: 'head-1', eventCursor: 'cursor-1' };
      const guarded = await controlPlane.freshnessGate.guard(
        'VERDICT',
        key,
        () => 'head-1:cursor-1',
        () => 'validated'
      );
      assert.strictEqual(guarded.status, 'FRESH');
      await controlPlane
        .repairCoordinator('round-1')
        .continueExplicitly({ kind: 'NEW_ROUND', roundId: 'round-2', maxAttempts: 4 });

      const restarted = context.createRuntime();
      const recovered = await restarted
        .retrieveControlPlane()
        ?.repairCoordinator('round-2')
        .continueExplicitly({ kind: 'INCREASE_BUDGET', maxAttempts: 5 });
      assert.deepStrictEqual(
        [recovered?.roundId, recovered?.attempt, recovered?.maxAttempts],
        ['round-2', 0, 5]
      );

      const controlEvents = new EventJournal(context.controlJournalPath).read();
      assert.deepStrictEqual(
        controlEvents.map((entry) => entry.payload?.event),
        ['freshness_guard_transaction', 'repair_state', 'repair_state']
      );
      assert.strictEqual(new EventJournal(context.taskJournalPath).read().length, 0);
    } finally {
      cleanupTestTmp(context.root);
    }
  });
});
