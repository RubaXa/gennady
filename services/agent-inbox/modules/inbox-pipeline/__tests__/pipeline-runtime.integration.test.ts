// @file: Integration coverage for PipelineRuntime sharing the production queue seam.
// @consumers: node:test runner
// @tasks: TSK-157, TSK-161

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PipelineRuntime } from '../pipeline-runtime.ts';
import { OpenCodeMock } from '../../inbox-opencode/opencode.mock.ts';
import type { OpenCodeCallResult } from '../../inbox-opencode/errors.ts';
import type { PromptOpts } from '../../inbox-opencode/opencode.port.ts';
import { InMemoryTaskQueue } from '../../inbox-queue/task-queue.ts';
import { TaskRegistry } from '../../inbox-queue/task-registry.ts';
import type { JournalEntry, JournalPort } from '../../inbox-core/event-journal.ts';
import { EventJournal } from '../../inbox-core/event-journal.ts';
import { DecisionJournal } from '../../inbox-core/decision-journal.ts';
import { CapabilityModes } from '../../inbox-core/capability-modes.ts';
import { InboxRegistryAccess } from '../../inbox-core/inbox-registry.ts';
import { cleanupTestTmp, makeTestTmpDir } from '../../inbox-core/test-support/test-tmp.ts';
import { mrReportsDir } from '../../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';

const reviewInput = {
  changeset: [
    { path: 'src/feature.ts', action: 'modified' as const },
    { path: 'specs/feature.md', action: 'modified' as const },
  ],
  toolTrace: [
    { tool: 'read', file: 'src/feature.ts' },
    { tool: 'read', file: 'specs/feature.md' },
  ],
  modelResults: [
    {
      track: 'logic',
      model: 'review-worker',
      runId: 'run-21',
      findings: [
        {
          file: 'src/feature.ts',
          line: 12,
          summary: 'Unhandled domain failure',
          severity: 'warning' as const,
        },
      ],
    },
  ],
};

class MemoryJournal implements JournalPort {
  entries: JournalEntry[] = [];

  async append(entry: Omit<JournalEntry, 'seq'>): Promise<number> {
    const seq = this.entries.length + 1;
    this.entries.push({ ...entry, seq });
    return seq;
  }

  read(): JournalEntry[] {
    return this.entries;
  }

  since(cursor: number) {
    const entries = this.entries.filter((entry) => entry.seq > cursor);
    return { entries, nextCursor: this.entries.at(-1)?.seq ?? cursor };
  }
}

/** @purpose Records continuation identity so coverage recovery proves it does not replace the worker session. */
class ContinuationRecordingOpenCodeMock extends OpenCodeMock {
  continuationSids: string[] = [];

  override async continueSignal(sid: string, opts: PromptOpts): Promise<OpenCodeCallResult> {
    this.continuationSids.push(sid);
    return super.continueSignal(sid, opts);
  }
}

function seedPipelineWorkers(opencode: OpenCodeMock, withToolCalls = true): void {
  for (const type of [
    'track_logic',
    'track_docs',
    'track_spec_compliance',
    'lens_tests',
    'lens_business',
    'lens_specs',
    'lens_security',
    'lens_optimization',
    'lens_codelines',
    'lens_architecture',
  ]) {
    opencode.seed(`pipeline_${type}`, {
      findings: [
        {
          file: 'src/feature.ts',
          line: 12,
          summary: `${type} evidence`,
          severity: 'warning',
        },
      ],
    });
    if (withToolCalls) {
      opencode.seedToolCalls(`pipeline_${type}`, ['src/feature.ts', 'specs/feature.md']);
    }
  }
}

describe('PipelineRuntime', () => {
  it('materializes the root and delta DAGs into the same live queue', async () => {
    const queue = new InMemoryTaskQueue(new TaskRegistry());
    const runtime = new PipelineRuntime(queue);

    const root = await runtime.startReview('group/project!17', reviewInput);
    const delta = await runtime.startDeltaReview('group/project!17', 'abc', 'def');
    const types = queue.state('group/project!17').map((task) => task.type);

    assert.strictEqual(root.length, 17);
    assert.deepStrictEqual(delta.length, 6);
    assert.deepStrictEqual(types, [
      'prepare_env',
      'plan',
      'enrich',
      'track_logic',
      'track_docs',
      'track_spec_compliance',
      'lens_tests',
      'lens_business',
      'lens_specs',
      'lens_security',
      'lens_optimization',
      'lens_codelines',
      'lens_architecture',
      'gate_coverage',
      'synthesize',
      'gate_verdict',
      'tail_reviewer',
      'delta_review',
      'delta_prepare',
      'delta_changeset',
      'delta_tracks',
      'synthesize_delta',
      'gate_verdict_delta',
    ]);
  });

  it('releases root and delta nodes only after their declared dependencies finish', async () => {
    const queue = new InMemoryTaskQueue(new TaskRegistry());
    const runtime = new PipelineRuntime(queue);

    const root = await runtime.startReview('group/project!18', reviewInput);
    assert.deepStrictEqual(
      queue.next('group/project!18').map((task) => task.type),
      ['prepare_env']
    );
    queue.transition('group/project!18', root[0], 'done');
    assert.deepStrictEqual(
      queue.next('group/project!18').map((task) => task.type),
      ['plan']
    );
    queue.transition('group/project!18', root[1], 'done');
    assert.deepStrictEqual(
      queue.next('group/project!18').map((task) => task.type),
      ['enrich']
    );
    const architecture = queue
      .state('group/project!18')
      .find((task) => task.type === 'lens_architecture');
    assert.ok(
      architecture?.dependsOn.some(
        (dependency) => dependency.kind === 'type_name' && dependency.name === 'lens_tests'
      )
    );

    const delta = await runtime.startDeltaReview('group/project!19', 'base', 'head');
    assert.deepStrictEqual(
      queue.next('group/project!19').map((task) => task.type),
      ['delta_review']
    );
    queue.transition('group/project!19', delta[0], 'done');
    assert.deepStrictEqual(
      queue.next('group/project!19').map((task) => task.type),
      ['delta_prepare']
    );
  });

  it('boots a durable Executor that drains concrete fan-out before the role tail', async () => {
    const registry = new TaskRegistry();
    const queue = new InMemoryTaskQueue(registry);
    const journal = new MemoryJournal();
    const executed: string[] = [];
    const runtime = new PipelineRuntime(queue, registry, journal, async (task) => {
      executed.push(task.type);
    });

    await runtime.startReview('group/project!20', { role: 'author', ...reviewInput });
    for (let pass = 0; pass < 12; pass++) await runtime.drain();

    const state = queue.state('group/project!20');
    assert.ok(state.every((task) => task.status === 'done'));
    assert.ok(executed.includes('track_logic'));
    assert.ok(executed.includes('lens_architecture'));
    assert.ok(executed.indexOf('lens_tests') < executed.indexOf('lens_architecture'));
    assert.strictEqual(executed.at(-1), 'tail_author');
    assert.ok(
      journal.entries.some(
        (entry) => entry.kind === 'task_status' && entry.payload?.status === 'done'
      )
    );
  });

  it('drives the production dispatcher to durable artifacts and recovers queued DAG from journal', async () => {
    const stateDir = makeTestTmpDir('pipeline-runtime-');
    try {
      const registry = new TaskRegistry();
      const journal = new MemoryJournal();
      const queue = new InMemoryTaskQueue(registry);
      const opencode = new OpenCodeMock();
      seedPipelineWorkers(opencode, false);
      const runtime = new PipelineRuntime(queue, registry, journal, undefined, stateDir, opencode);
      const mr = 'group/project!21';
      const ids = await runtime.startReview(mr, { role: 'reviewer', ...reviewInput });

      const restartedQueue = new InMemoryTaskQueue(registry);
      const restarted = new PipelineRuntime(
        restartedQueue,
        registry,
        journal,
        undefined,
        stateDir,
        opencode
      );
      // Production boot owns recovery before lifecycle draining begins.
      restarted.start(60_000);
      restarted.stop();
      assert.deepStrictEqual(
        restartedQueue.state(mr).map((task) => task.taskId),
        ids
      );

      for (let pass = 0; pass < 12; pass++) await runtime.drain();
      const report = mrReportsDir(stateDir, mr);
      assert.ok(existsSync(`${report}/PLAN.md`), 'plan stage must create PLAN.md');
      assert.ok(
        existsSync(`${report}/tasks/track_logic.result.json`),
        'fan-out must create result'
      );
      assert.match(
        readFileSync(`${report}/tasks/track_logic.md`, 'utf8'),
        /track logic/i,
        'every worker session must create a readable Markdown report'
      );
      const workerResult = JSON.parse(
        readFileSync(`${report}/tasks/track_logic.opencode-track_logic.result.json`, 'utf8')
      ) as { findings: unknown[] };
      assert.ok(workerResult.findings.length > 0, 'live OpenCode worker result must not be empty');
      const review = JSON.parse(readFileSync(`${report}/review.json`, 'utf8')) as {
        verdict: string;
        findings: Array<{ summary: string }>;
      };
      assert.equal(review.verdict, 'COMMENT');
      assert.ok(
        review.findings.length >= 10,
        'synthesis must consume the persisted worker results'
      );
      assert.ok(review.findings.some((finding) => finding.summary === 'track_logic evidence'));
      assert.match(
        readFileSync(`${report}/REVIEW.md`, 'utf8'),
        /Итог ревью[\s\S]+Результаты дорожек/u,
        'synthesis must create the primary readable review document'
      );
      assert.ok(existsSync(`${report}/tail_reviewer.json`), 'role tail must write durable result');
    } finally {
      cleanupTestTmp(stateDir);
    }
  });

  it('persists a reviewer tail proposal and capability cache under its canonical MR ref', async () => {
    const stateDir = makeTestTmpDir('pipeline-reviewer-tail-');
    try {
      const canonicalMr = 'group/project!157';
      const registryAccess = new InboxRegistryAccess(stateDir);
      registryAccess.updateDelta([
        {
          webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/157',
          project: 'group/project',
          iid: '157',
          updatedAt: '2026-08-08T00:00:00.000Z',
        },
      ]);
      registryAccess.save();

      const registry = new TaskRegistry();
      const queue = new InMemoryTaskQueue(registry);
      const opencode = new OpenCodeMock();
      seedPipelineWorkers(opencode, false);
      const events = new EventJournal(
        `${stateDir}/agent-inbox/mrs/group__project-157/events.jsonl`
      );
      const proposalJournal = new DecisionJournal(events);
      const runtime = new PipelineRuntime(
        queue,
        registry,
        new MemoryJournal(),
        undefined,
        stateDir,
        opencode,
        async (proposal) => {
          assert.equal(proposal.mr, canonicalMr);
          await proposalJournal.writeProposal(proposal);
          registryAccess.storeCapabilitiesForRef(
            proposal.mr,
            CapabilityModes.computeRegistry(proposalJournal.computeAllAcceptRates())
          );
        }
      );

      await runtime.startReview(canonicalMr, { role: 'reviewer', ...reviewInput });
      for (let pass = 0; pass < 12; pass++) await runtime.drain();

      const proposals = events.since(0).entries;
      assert.equal(proposals.length, 1);
      assert.equal(proposals[0]?.mr, canonicalMr);
      assert.equal(proposals[0]?.payload?.capability, 'post_findings');
      const entry =
        registryAccess.load().entries[
          'https://gitlab.example.com/group/project/-/merge_requests/157'
        ];
      assert.equal(entry?.capabilities?.post_findings, 'proposal');
    } finally {
      cleanupTestTmp(stateDir);
    }
  });

  it('uses real CoverageGate input and fails the durable stage when a changed file was not read', async () => {
    const stateDir = makeTestTmpDir('pipeline-coverage-fail-');
    try {
      const registry = new TaskRegistry();
      const queue = new InMemoryTaskQueue(registry);
      const opencode = new OpenCodeMock();
      seedPipelineWorkers(opencode);
      const runtime = new PipelineRuntime(
        queue,
        registry,
        new MemoryJournal(),
        undefined,
        stateDir,
        opencode
      );
      const mr = 'group/project!22';
      await runtime.startReview(mr, {
        changeset: [{ path: 'src/unread.ts', action: 'modified' }],
        toolTrace: [],
      });
      for (let pass = 0; pass < 12; pass++) await runtime.drain();

      const coverage = JSON.parse(
        readFileSync(`${mrReportsDir(stateDir, mr)}/coverage.json`, 'utf8')
      ) as { status: string; missingFiles: string[] };
      assert.equal(coverage.status, 'fail');
      assert.deepEqual(coverage.missingFiles, ['src/unread.ts']);
      assert.equal(queue.state(mr).find((task) => task.type === 'gate_coverage')?.status, 'failed');
    } finally {
      cleanupTestTmp(stateDir);
    }
  });

  it('continues one live worker session twice and records an operator escalation when coverage stays incomplete', async () => {
    const stateDir = makeTestTmpDir('pipeline-coverage-escalation-');
    try {
      const registry = new TaskRegistry();
      const queue = new InMemoryTaskQueue(registry);
      const opencode = new ContinuationRecordingOpenCodeMock();
      seedPipelineWorkers(opencode, false);
      const runtime = new PipelineRuntime(
        queue,
        registry,
        new MemoryJournal(),
        undefined,
        stateDir,
        opencode
      );
      const mr = 'group/project!coverage-escalation';
      await runtime.startReview(mr, {
        changeset: [{ path: 'src/unread.ts', action: 'modified' }],
      });

      for (let pass = 0; pass < 12; pass++) await runtime.drain();

      assert.equal(opencode.continuationSids.length, 2);
      assert.equal(new Set(opencode.continuationSids).size, 1, 'continues must retain one SID');
      const report = mrReportsDir(stateDir, mr);
      const escalation = JSON.parse(readFileSync(`${report}/operator-escalation.json`, 'utf8')) as {
        outcome: string;
        continueCount: number;
        missingFiles: string[];
      };
      assert.equal(escalation.outcome, 'operator_action_required');
      assert.equal(escalation.continueCount, 2);
      assert.deepEqual(escalation.missingFiles, ['src/unread.ts']);
      assert.equal(queue.state(mr).find((task) => task.type === 'gate_coverage')?.status, 'failed');
    } finally {
      cleanupTestTmp(stateDir);
    }
  });
});
