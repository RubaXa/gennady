// @file: Shippable one-shot acceptance tests through PipelineRuntime.
// @consumers: TSK-184 verification, TSK-190 live read-only capture verification
// @tasks: TSK-184, TSK-190

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { EventJournal } from '../../modules/inbox-core/event-journal.ts';
import { cleanupTestTmp, makeTestTmpDir } from '../../modules/inbox-core/test-support/test-tmp.ts';
import { StateStore } from '../../modules/inbox-core/state-store.ts';
import { VcsInboxMock } from '../../modules/inbox-core/vcs-inbox.mock.ts';
import { PipelineRuntime } from '../../modules/inbox-pipeline/pipeline-runtime.ts';
import { InMemoryTaskQueue } from '../../modules/inbox-queue/task-queue.ts';
import { TaskRegistry } from '../../modules/inbox-queue/task-registry.ts';
import { OpenCodeMock } from '../../modules/inbox-opencode/opencode.mock.ts';
import { captureWorktreeEntryBytes, runMrsOnce } from '../run-mode.ts';

const MR = 'https://gitlab.example.com/group/project/-/merge_requests/184';

function createContext(role: string | null = 'reviewer') {
  const root = makeTestTmpDir('run-mode-pipeline-');
  const registry = new TaskRegistry();
  const queue = new InMemoryTaskQueue(registry);
  const opencode = new OpenCodeMock();
  const fields = Object.fromEntries(
    [
      'objective',
      'acceptance',
      'outOfScope',
      'sourceAnchors',
      'components',
      'dependencies',
      'invariants',
      'decisions',
      'requirementIds',
      'behavior',
      'observedDrift',
      'changedBehavior',
      'positiveScenarios',
      'negativeScenarios',
      'coverageGaps',
      'trustBoundaries',
      'assets',
      'threats',
      'mitigations',
      'resources',
      'bottlenecks',
      'alternatives',
      'identity',
      'purpose',
      'observedChanges',
      'risks',
      'testImpact',
      'responsibility',
      'threadVersion',
      'claims',
      'codeContext',
      'independentAssessment',
      'recommendationInput',
      'lensId',
      'lensVersion',
      'observations',
      'evidenceRefs',
      'conclusion',
      'sectionId',
      'schema',
      'fragments',
      'anchors',
      'diagramType',
      'typedNodes',
      'dependencyEdges',
      'beforeState',
      'afterState',
      'changedRelations',
      'orderedActors',
      'orderedEvents',
      'branches',
      'terminalOutcomes',
    ].map((field) => [field, `worker:${field}`])
  );
  for (const inputId of [
    'source:goal',
    'source:architecture',
    'source:specification',
    'source:tests',
    'source:security',
    'source:optimality',
    'source:review-lens',
    'source:discussions',
    'file:runtime.ts',
    'entity:Runtime',
  ]) {
    const inputDigest = createHash('sha256').update(inputId).digest('hex');
    const operationTitle = `pipeline_control_slot_${inputDigest}`;
    opencode.seed(operationTitle, {
      sourceId: 'forged-agent-source',
      content: 'Agent-authored evidence grounded in the persisted source.',
      fields,
    });
    opencode.seedToolCalls(operationTitle, [`control-plane/sources/${inputDigest}.txt`]);
  }
  for (const task of ['pipeline_track_control', 'pipeline_lens_control']) {
    opencode.seed(task, { findings: [] });
    opencode.seedToolCalls(task, []);
  }
  const pipeline = new PipelineRuntime(
    queue,
    registry,
    new EventJournal(join(root, 'task-events.jsonl')),
    async () => undefined,
    root,
    opencode,
    undefined,
    {
      journal: new EventJournal(join(root, 'control-events.jsonl')),
      receiptRoot: join(root, 'receipts'),
      runtimeNamespace: 'mock',
    }
  );
  const vcs = new VcsInboxMock();
  vcs.seed([], {
    [MR]: {
      project: 'group/project',
      iid: '184',
      webUrl: MR,
      title: 'Pipeline cutover',
      sourceBranch: 'feature',
      targetBranch: 'main',
      createdAt: '2026-08-13T10:00:00Z',
      updatedAt: '2026-08-13T11:00:00Z',
      author: 'other',
      reviewers: ['operator'],
      approvedBy: [],
      description: 'Migrate acceptance to PipelineRuntime',
      myRole: role,
    },
  });
  return { root, queue, pipeline, vcs, store: new StateStore(root) };
}

function captureReviewInput() {
  const sources = [
    ['source:goal', 'GOAL_CHANGED'],
    ['source:architecture', 'ARCHITECTURE_CHANGED'],
    ['source:specification', 'SPECIFICATION_TOUCHED'],
    ['source:tests', 'TEST_SURFACE_CHANGED'],
    ['source:security', 'SECURITY_SURFACE_CHANGED'],
    ['source:optimality', 'OPTIMALITY_RELEVANT'],
    ['source:review-lens', 'BEHAVIOR_CHANGED'],
    ['source:discussions', 'DISCUSSION_CHANGED'],
  ] as const;
  const inventory = [
    ...sources.map(([inputId]) => ({
      inputId,
      kind: 'source' as const,
      canonicalIdentity: `${MR}#${inputId.slice('source:'.length)}`,
    })),
    { inputId: 'file:runtime.ts', kind: 'file' as const, canonicalIdentity: 'runtime.ts' },
    { inputId: 'entity:Runtime', kind: 'entity' as const, canonicalIdentity: 'runtime.ts#Runtime' },
  ];
  return {
    inputs: inventory.map((input) => {
      const capturedBytes = `Exact captured bytes for ${input.canonicalIdentity}`;
      return {
        ...input,
        version: 'head-184',
        digest: createHash('sha256').update(capturedBytes).digest('hex'),
        capturedBytes,
      };
    }),
    classifications: inventory.map((input) => {
      const sourceCode = sources.find(([inputId]) => inputId === input.inputId)?.[1];
      const code =
        sourceCode ?? (input.kind === 'entity' ? 'ENTITY_SET_CHANGED' : 'BEHAVIOR_CHANGED');
      return {
        inputId: input.inputId,
        code,
        changeShape: [code],
        rationaleDigest: `classification:${input.inputId}`,
        classifierVersion: 'review-classifier-v0',
      };
    }),
    provenance: ['test-exact-capture'],
  };
}

describe('runMrsOnce pipeline acceptance', () => {
  it('captures changed directories and files as typed read-only inventory', async () => {
    const root = makeTestTmpDir('run-mode-entry-capture-');
    try {
      await mkdir(join(root, 'vendor/submodule'), { recursive: true });
      await writeFile(join(root, 'runtime.ts'), 'export const runtime = true;\n', 'utf8');
      assert.strictEqual(
        await captureWorktreeEntryBytes(root, 'runtime.ts', 'M', 'diff'),
        'export const runtime = true;\n'
      );
      assert.strictEqual(
        await captureWorktreeEntryBytes(root, 'vendor/submodule', 'M', 'diff'),
        JSON.stringify({ kind: 'git-directory', path: 'vendor/submodule' })
      );
      assert.strictEqual(
        await captureWorktreeEntryBytes(root, 'deleted.ts', 'D', 'deleted diff'),
        'deleted diff'
      );
    } finally {
      cleanupTestTmp(root);
    }
  });

  it('submits, drains and reads through the same runtime identity', async () => {
    const context = createContext();
    try {
      const result = await runMrsOnce({
        mrs: [MR],
        deps: {
          pipeline: context.pipeline,
          store: context.store,
          vcs: context.vcs,
          fetchDiffRefs: async () => ({ headSha: 'head-184' }),
          captureReviewInput: async () => captureReviewInput(),
        },
      });
      assert.strictEqual(result.results[0]?.state, 'completed', JSON.stringify(result.results[0]));
      assert.strictEqual(result.results[0]?.runtimeIdentity, context.pipeline.identity);
      assert.ok(context.queue.state('group/project!184').length > 0);
      const controlEvents = new EventJournal(join(context.root, 'control-events.jsonl')).read();
      assert.deepStrictEqual(
        controlEvents
          .filter(
            (entry) =>
              entry.payload?.event === 'freshness_guard_transaction' &&
              entry.payload?.comparison === 'MATCH'
          )
          .map((entry) => entry.payload?.purpose),
        ['VERDICT', 'SYNTHESIS_PUBLICATION', 'QUEUE_HANDOFF']
      );
    } finally {
      cleanupTestTmp(context.root);
    }
  });

  it('cannot publish or enqueue without actual agent evidence and tool receipts', async () => {
    const context = createContext();
    try {
      const registry = new TaskRegistry();
      const runtime = new PipelineRuntime(
        new InMemoryTaskQueue(registry),
        registry,
        new EventJournal(join(context.root, 'no-agent-task-events.jsonl')),
        async () => undefined,
        context.root,
        undefined,
        undefined,
        {
          journal: new EventJournal(join(context.root, 'no-agent-control-events.jsonl')),
          receiptRoot: join(context.root, 'no-agent-receipts'),
          runtimeNamespace: 'no-agent',
        }
      );
      const result = await runMrsOnce({
        mrs: [MR],
        deps: {
          pipeline: runtime,
          vcs: context.vcs,
          fetchDiffRefs: async () => ({ headSha: 'head-184' }),
          captureReviewInput: async () => captureReviewInput(),
        },
      });
      assert.strictEqual(result.results[0]?.state, 'failed');
      assert.match(result.results[0]?.error ?? '', /Actual agent runtime evidence is required/);
    } finally {
      cleanupTestTmp(context.root);
    }
  });

  it('blocks an incomplete manifest inventory before queue materialization', async () => {
    const context = createContext();
    try {
      const result = await runMrsOnce({
        mrs: [MR],
        deps: {
          pipeline: context.pipeline,
          vcs: context.vcs,
          fetchDiffRefs: async () => ({ headSha: 'head-184' }),
          captureReviewInput: async () => ({ inputs: [], classifications: [], provenance: [] }),
        },
      });
      assert.strictEqual(result.results[0]?.state, 'failed');
      assert.match(result.results[0]?.error ?? '', /BLOCKED incomplete inventory/);
      assert.strictEqual(context.queue.state(MR).length, 0);
    } finally {
      cleanupTestTmp(context.root);
    }
  });

  it('fails closed before queue handoff when exact head SHA is unavailable', async () => {
    const context = createContext();
    try {
      const result = await runMrsOnce({
        mrs: [MR],
        deps: {
          pipeline: context.pipeline,
          vcs: context.vcs,
          fetchDiffRefs: async () => undefined,
        },
      });
      assert.strictEqual(result.results[0]?.state, 'failed');
      assert.strictEqual(context.queue.state(MR).length, 0);
    } finally {
      cleanupTestTmp(context.root);
    }
  });

  it('applies explicit role policy and rejects unknown roles without queue work', async () => {
    const context = createContext('custom-role');
    try {
      const result = await runMrsOnce({
        mrs: [MR],
        deps: {
          pipeline: context.pipeline,
          vcs: context.vcs,
          fetchDiffRefs: async () => ({ headSha: 'head-184' }),
        },
      });
      assert.strictEqual(result.results[0]?.state, 'failed');
      assert.match(result.results[0]?.error ?? '', /Unsupported MR role/);
      assert.strictEqual(context.queue.state(MR).length, 0);
    } finally {
      cleanupTestTmp(context.root);
    }
  });
});
