// @file: Exact-SHA read-only remote watcher contract tests.
// @spec: CLI-VERIFY
// @consumers: remote-watcher

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { VcsJob } from '../../../../services/vcs-client/entities/vcs-job.type.ts';
import type { VcsPipelineSummary } from '../../../../services/vcs-client/entities/vcs-pipeline-summary.type.ts';
import { watchRemotePipeline, type RemotePipelineObserver } from '../remote-watcher.ts';

const SHA = 'a'.repeat(40);

function pipeline(
  status: string,
  id = '77',
  sha = SHA,
  definitionId = 'workflow-main',
  createdAt = '2026-09-29T10:00:00.000Z',
  attempt = 1
): VcsPipelineSummary {
  return { id, sha, status, definitionId, createdAt, attempt };
}

function job(status = 'success', id = '9'): VcsJob {
  return { id, name: `test-${id}`, status, stage: 'test', ref: 'main', webUrl: '' };
}

function observer(
  input: {
    readonly searches?: readonly (readonly VcsPipelineSummary[])[];
    readonly polls?: readonly VcsPipelineSummary[];
    readonly jobs?: readonly VcsJob[];
    readonly log?: string;
    readonly hasCommit?: boolean;
    readonly hangHasCommit?: boolean;
    readonly throwSearch?: Error;
    readonly calls?: string[];
  } = {}
): RemotePipelineObserver {
  let search = 0;
  let poll = 0;
  const calls = input.calls ?? [];
  return {
    provider: 'gitlab',
    project: 'group/repo',
    pipeline: {
      async hasCommit(query) {
        calls.push(`commit:${query.sha}`);
        if (input.hangHasCommit === true) return await new Promise<boolean>(() => undefined);
        return input.hasCommit ?? true;
      },
      async findPipelinesBySha(query) {
        calls.push(`search:${query.sha}`);
        if (input.throwSearch !== undefined) throw input.throwSearch;
        return input.searches?.[search++] ?? [pipeline('success')];
      },
      async getPipeline(query) {
        calls.push(`poll:${query.pipelineId}`);
        return input.polls?.[poll++] ?? pipeline('success', query.pipelineId);
      },
      async getPipelineJobs(query) {
        calls.push(`jobs:${query.pipelineId}`);
        return input.jobs ?? [job()];
      },
      async getJobLog(query) {
        calls.push(`log:${query.jobId}`);
        return input.log ?? '';
      },
    },
  };
}

function runtime() {
  let now = 0;
  return {
    now: () => now,
    observedAt: () => '2026-09-29T11:00:00.000Z',
    sleep: async (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

describe('watchRemotePipeline', () => {
  it('proves pushed SHA, pins one exact pipeline id, and never returns to latest lookup', async () => {
    const calls: string[] = [];
    const transitions: string[] = [];
    const clock = runtime();
    const result = await watchRemotePipeline({
      observer: observer({
        calls,
        searches: [
          [],
          [
            pipeline('running', '77', SHA, 'workflow-main', '2026-09-29T10:00:00.000Z', 2),
            pipeline('success', '88', SHA, 'workflow-main', '2026-09-29T10:00:00.000Z', 1),
          ],
        ],
        polls: [pipeline('running', '77'), pipeline('success', '77')],
      }),
      sourceSha: SHA,
      timeoutMs: 10_000,
      pollIntervalMs: 1_000,
      runtime: {
        ...clock,
        onTransition: (state, candidate) => transitions.push(`${state}:${candidate?.id ?? 'none'}`),
      },
    });
    assert.equal(result.state, 'REMOTE_SUCCESS');
    assert.equal(result.proof?.pipelineId, '77');
    assert.equal(result.proof?.pipelineSha, SHA);
    assert.deepEqual(calls, [
      `commit:${SHA}`,
      `search:${SHA}`,
      `search:${SHA}`,
      'poll:77',
      'poll:77',
      'jobs:77',
    ]);
    assert.deepEqual(transitions, [
      'REMOTE_NOT_FOUND_YET:none',
      'REMOTE_PENDING:77',
      'REMOTE_SUCCESS:77',
    ]);
  });

  it('fails closed when the provider returns a non-exact SHA', async () => {
    const result = await watchRemotePipeline({
      observer: observer({ searches: [[pipeline('success', '77', 'b'.repeat(40))]] }),
      sourceSha: SHA,
      timeoutMs: 1_000,
      pollIntervalMs: 100,
      runtime: runtime(),
    });
    assert.equal(result.state, 'REMOTE_SHA_MISMATCH');
    assert.equal(result.proof, undefined);
  });

  it('maps every documented terminal conclusion without accidental unavailability', async () => {
    for (const [raw, expected] of [
      ['manual', 'REMOTE_MANUAL'],
      ['action_required', 'REMOTE_MANUAL'],
      ['skipped', 'REMOTE_SKIPPED'],
      ['canceled', 'REMOTE_CANCELED'],
      ['cancelled', 'REMOTE_CANCELED'],
      ['failed', 'REMOTE_FAILED'],
      ['failure', 'REMOTE_FAILED'],
      ['timed_out', 'REMOTE_FAILED'],
      ['startup_failure', 'REMOTE_FAILED'],
      ['stale', 'REMOTE_FAILED'],
      ['neutral', 'REMOTE_FAILED'],
    ] as const) {
      const result = await watchRemotePipeline({
        observer: observer({ searches: [[pipeline(raw)]] }),
        sourceSha: SHA,
        timeoutMs: 1_000,
        pollIntervalMs: 100,
        runtime: runtime(),
      });
      assert.equal(result.state, expected);
    }
  });

  it('keeps every documented pending status non-terminal until the deadline', async () => {
    for (const raw of [
      'created',
      'pending',
      'running',
      'preparing',
      'scheduled',
      'requested',
      'waiting',
      'waiting_for_resource',
      'canceling',
      'queued',
      'in_progress',
    ]) {
      const result = await watchRemotePipeline({
        observer: observer({ searches: [[pipeline(raw)]] }),
        sourceSha: SHA,
        timeoutMs: 1,
        pollIntervalMs: 1,
        runtime: runtime(),
      });
      assert.equal(result.state, 'REMOTE_TIMED_OUT', raw);
    }
  });

  it('fails closed when exact SHA discovery contains distinct workflow definitions', async () => {
    const result = await watchRemotePipeline({
      observer: observer({
        searches: [
          [
            pipeline('success', '77', SHA, 'workflow-a'),
            pipeline('success', '88', SHA, 'workflow-b'),
          ],
        ],
      }),
      sourceSha: SHA,
      timeoutMs: 1_000,
      pollIntervalMs: 100,
      runtime: runtime(),
    });
    assert.equal(result.state, 'REMOTE_PIPELINE_AMBIGUOUS');
    assert.equal(result.proof, undefined);
    assert.match(result.message, /workflow-a.*workflow-b/);
  });

  it('pins the newest rerun of one workflow definition deterministically', async () => {
    const calls: string[] = [];
    const result = await watchRemotePipeline({
      observer: observer({
        calls,
        searches: [
          [
            pipeline('success', '77', SHA, 'workflow-a', '2026-09-29T10:00:00.000Z', 1),
            pipeline('success', '88', SHA, 'workflow-a', '2026-09-29T10:00:00.000Z', 2),
          ],
        ],
      }),
      sourceSha: SHA,
      timeoutMs: 1_000,
      pollIntervalMs: 100,
      runtime: runtime(),
    });
    assert.equal(result.state, 'REMOTE_SUCCESS');
    assert.equal(result.proof?.pipelineId, '88');
    assert.equal(result.proof?.definitionId, 'workflow-a');
    assert.deepEqual(calls, [`commit:${SHA}`, `search:${SHA}`, 'jobs:88']);
  });

  it('times out deterministically both before discovery and after pinning', async () => {
    const absent = await watchRemotePipeline({
      observer: observer({ searches: [[], [], []] }),
      sourceSha: SHA,
      timeoutMs: 200,
      pollIntervalMs: 100,
      runtime: runtime(),
    });
    assert.equal(absent.state, 'REMOTE_TIMED_OUT');
    assert.equal(absent.pipelineId, undefined);

    const pending = await watchRemotePipeline({
      observer: observer({
        searches: [[pipeline('running')]],
        polls: [pipeline('running'), pipeline('running')],
      }),
      sourceSha: SHA,
      timeoutMs: 200,
      pollIntervalMs: 100,
      runtime: runtime(),
    });
    assert.equal(pending.state, 'REMOTE_TIMED_OUT');
    assert.equal(pending.pipelineId, '77');
  });

  it('bounds an in-flight provider request by timeout and cancellation', async () => {
    const hanging = observer({ hangHasCommit: true });
    const timeoutStartedAt = Date.now();
    const timedOut = await watchRemotePipeline({
      observer: hanging,
      sourceSha: SHA,
      timeoutMs: 20,
      pollIntervalMs: 10,
    });
    assert.equal(timedOut.state, 'REMOTE_TIMED_OUT');
    assert.ok(Date.now() - timeoutStartedAt < 500);

    const abort = new AbortController();
    setTimeout(() => abort.abort('SIGTERM'), 10);
    const cancelled = await watchRemotePipeline({
      observer: hanging,
      sourceSha: SHA,
      timeoutMs: 1_000,
      pollIntervalMs: 100,
      signal: abort.signal,
    });
    assert.equal(cancelled.state, 'REMOTE_CANCELLED');
  });

  it('classifies provider failures without implicit exit-zero success', async () => {
    for (const [error, expected] of [
      [new Error('401 Unauthorized'), 'REMOTE_UNAUTHORIZED'],
      [new Error('429 rate limit'), 'REMOTE_RATE_LIMITED'],
      [new Error('connection reset'), 'REMOTE_UNAVAILABLE'],
    ] as const) {
      const result = await watchRemotePipeline({
        observer: observer({ throwSearch: error }),
        sourceSha: SHA,
        timeoutMs: 1_000,
        pollIntervalMs: 100,
        runtime: runtime(),
      });
      assert.equal(result.state, expected);
    }
  });

  it('retains bounded redacted failed-job evidence and immutable log identity', async () => {
    const secret = 'token=super-secret';
    const result = await watchRemotePipeline({
      observer: observer({
        searches: [[pipeline('failed')]],
        jobs: [job('failed')],
        log: `${secret}\n${'x'.repeat(40_000)}`,
      }),
      sourceSha: SHA,
      timeoutMs: 1_000,
      pollIntervalMs: 100,
      runtime: runtime(),
    });
    assert.equal(result.state, 'REMOTE_FAILED');
    const log = result.evidence.find((entry) => entry.kind === 'log');
    assert.ok(log);
    assert.ok(Buffer.byteLength(log.summary) <= 16 * 1024);
    assert.doesNotMatch(log.summary, /super-secret/);
    assert.match(log.identity, /sha256:/);
    assert.equal(result.proof?.jobs[0]?.logIdentity?.startsWith('sha256:'), true);
  });

  it('bounds aggregate failed-job evidence and rejects an unbounded job projection', async () => {
    const bounded = await watchRemotePipeline({
      observer: observer({
        searches: [[pipeline('failed')]],
        jobs: Array.from({ length: 10 }, (_, index) => job('failed', `${index}`)),
        log: 'x'.repeat(40_000),
      }),
      sourceSha: SHA,
      timeoutMs: 1_000,
      pollIntervalMs: 100,
      runtime: runtime(),
    });
    assert.equal(bounded.state, 'REMOTE_FAILED');
    const logBytes = bounded.evidence
      .filter((entry) => entry.kind === 'log')
      .reduce((total, entry) => total + Buffer.byteLength(entry.summary), 0);
    assert.ok(logBytes <= 64 * 1024);
    assert.equal(bounded.proof?.jobs.length, 10);

    const excessive = await watchRemotePipeline({
      observer: observer({
        searches: [[pipeline('success')]],
        jobs: Array.from({ length: 257 }, (_, index) => job('success', `${index}`)),
      }),
      sourceSha: SHA,
      timeoutMs: 1_000,
      pollIntervalMs: 100,
      runtime: runtime(),
    });
    assert.equal(excessive.state, 'REMOTE_UNAVAILABLE');
    assert.equal(excessive.proof, undefined);
    assert.match(excessive.message, /maximum is 256/);
  });

  it('counts the truncation marker inside the exact aggregate evidence cap', async () => {
    const bounded = await watchRemotePipeline({
      observer: observer({
        searches: [[pipeline('failure')]],
        jobs: Array.from({ length: 5 }, (_, index) => job('failure', `${index}`)),
        log: 'x'.repeat(16_380),
      }),
      sourceSha: SHA,
      timeoutMs: 1_000,
      pollIntervalMs: 100,
      runtime: runtime(),
    });
    const logs = bounded.evidence.filter((entry) => entry.kind === 'log');
    const bytes = logs.reduce((total, entry) => total + Buffer.byteLength(entry.summary), 0);
    assert.equal(bounded.state, 'REMOTE_FAILED');
    assert.ok(bytes <= 64 * 1024, `${bytes} exceeds the aggregate cap`);
    assert.equal(logs.length, 4);
    assert.equal(bounded.proof?.jobs.length, 5);
    assert.equal(bounded.proof?.jobs[4]?.logIdentity?.startsWith('sha256:'), true);
  });

  it('cancels cooperatively without invoking a provider mutation', async () => {
    const abort = new AbortController();
    const result = await watchRemotePipeline({
      observer: observer({ searches: [[]] }),
      sourceSha: SHA,
      timeoutMs: 1_000,
      pollIntervalMs: 100,
      signal: abort.signal,
      runtime: {
        now: () => 0,
        sleep: async () => abort.abort('SIGTERM'),
      },
    });
    assert.equal(result.state, 'REMOTE_CANCELLED');
  });
});
