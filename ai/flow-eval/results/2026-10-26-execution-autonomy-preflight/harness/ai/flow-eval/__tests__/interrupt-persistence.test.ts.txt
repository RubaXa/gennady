// @file: Interrupted worker/judge traces are archived before owned cleanup; result delivery is awaited.
// @spec: AI-SKILLS
// @consumers: runner, CLI orchestration, durable trajectory regression suite

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import type { OpencodeClient } from '@opencode-ai/sdk';
import { computeAggregateExitCode, runAndReportBody } from '../cli.ts';
import { SddEvalOpenCodeEvidenceSource } from '../evidence.ts';
import { SddEvalOpenCodeRuntime } from '../opencode-runtime.ts';
import { DEFAULT_SDD_EVAL_CONFIG, SddEvalRunner } from '../runner.ts';
import { readAllDurableSummaries } from '../results-archive.ts';
import { SddEvalSandboxLifecycle, type SddEvalRunArtifact } from '../sandbox-lifecycle.ts';
import type { SddEvalEvidenceSource, SddEvalRuntime, SddEvalScenario } from '../types.ts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function message(id: string) {
  return {
    info: { id, role: 'assistant', time: { created: 1 } },
    parts: [
      {
        type: 'tool',
        tool: 'bash',
        callID: `call-${id}`,
        state: { status: 'completed', input: { command: 'gennady sdd-orient .' } },
      },
    ],
  };
}

class TerminalEvidence extends SddEvalOpenCodeEvidenceSource {
  override async readTail() {
    return [];
  }
  override async readEvents() {
    return [];
  }
  override async readDiff() {
    return '';
  }
  override async readStatus() {
    return 'completed' as const;
  }
}

for (const stage of ['worker', 'judge', 'judge-error'] as const) {
  it(
    `archives root and child trajectory on ${stage === 'judge-error' ? 'non-abort judge failure' : `abort during ${stage}`} before deleting its sandbox`,
    { timeout: 10_000 },
    async () => {
      const root = mkdtempSync(join(tmpdir(), 'gennady-interrupted-result-'));
      const sandbox = mkdtempSync(join(root, 'sdd-flow-eval-owned-'));
      const resultsRoot = join(root, 'permanent');
      const sourceRoot = join(root, 'source');
      mkdirSync(join(sourceRoot, 'ai/flow-eval/docs/journal'), { recursive: true });
      writeFileSync(join(sourceRoot, 'ai/flow-eval/docs/journal/EXPERIMENTS-LOG.md'), '');
      writeFileSync(join(sourceRoot, 'scenarios.json'), '[]\n');
      execFileSync('git', ['init', '--quiet', sourceRoot]);
      execFileSync('git', ['-C', sourceRoot, 'add', '.']);
      execFileSync('git', [
        '-C',
        sourceRoot,
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '--quiet',
        '-m',
        'owned source snapshot',
      ]);
      const started = deferred();
      const controller = new AbortController();
      let judgeCalls = 0;
      const captured: string[] = [];
      const client = {
        session: {
          messages: async ({ path }: { path: { id: string } }) => {
            captured.push(path.id);
            return { data: [message(path.id)] };
          },
          children: async ({ path }: { path: { id: string } }) => ({
            data: path.id === 'worker-root' ? [{ id: 'child', directory: sandbox }] : [],
          }),
        },
      } as unknown as OpencodeClient;
      const evidence = new TerminalEvidence({ directory: sandbox, client });
      const runtime: SddEvalRuntime = {
        async createSession() {
          return { id: 'worker-root' };
        },
        async prompt() {
          if (stage === 'worker') {
            started.resolve();
            await new Promise<void>(() => undefined);
          }
        },
        async abort() {},
        async judge({ signal }) {
          judgeCalls++;
          started.resolve();
          if (stage === 'judge-error') throw new Error('judge unavailable');
          return new Promise<string>((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
          });
        },
      };
      const scenario = {
        id: `abort-${stage}`,
        directory: sandbox,
        phase: 'task' as const,
        mode: 'brief-to-artifact' as const,
        intent: 'preserve interruption evidence',
        ...(stage === 'judge-error'
          ? {}
          : {
              checkpoints: [{ id: 'must-not-run', cmd: 'touch checkpoint-was-run' }],
            }),
      };
      const artifacts: SddEvalRunArtifact[] = [];
      const lifecycle = new SddEvalSandboxLifecycle({
        sandboxRoot: root,
        artifactsRoot: join(root, 'transient'),
        protectedArtifactsRoot: resultsRoot,
        runId: `abort-${stage}`,
        keep: false,
        removeDirectory: async (directory) => {
          const records = await readAllDurableSummaries(resultsRoot);
          assert.equal(records.length, 1);
          assert.ok(existsSync(join(resultsRoot, records[0].dir, 'trajectory.json')));
          await rm(directory, { recursive: true, force: true });
        },
      });
      lifecycle.registerOwnedDirectory(scenario.id, sandbox);
      try {
        const pending = runAndReportBody(
          {
            directory: root,
            gennadyRoot: sourceRoot,
            resultsDir: resultsRoot,
            keep: false,
            scenarioFile: join(sourceRoot, 'scenarios.json'),
            config: {
              ...DEFAULT_SDD_EVAL_CONFIG,
              concurrency: 1,
              observeEveryMs: 1,
              signal: controller.signal,
            },
          },
          [scenario],
          artifacts,
          new Map(),
          runtime as unknown as SddEvalOpenCodeRuntime,
          evidence
        );
        await started.promise;
        if (stage !== 'judge-error') controller.abort(new Error('operator signal'));
        await assert.rejects(
          pending,
          stage === 'judge-error' ? /judge unavailable/ : /operator signal/
        );
        assert.equal(judgeCalls, stage === 'worker' ? 0 : 1);
        assert.deepEqual([...new Set(captured)], ['worker-root', 'child']);
        assert.equal(existsSync(join(sandbox, 'checkpoint-was-run')), false);
        assert.equal(artifacts.length, 1);
        const records = await readAllDurableSummaries(resultsRoot);
        assert.equal(
          records[0].summary.outcome,
          stage === 'judge-error' ? 'worker-error' : 'interrupted'
        );
        assert.equal(computeAggregateExitCode(artifacts), 1);
        if (stage !== 'judge-error') assert.equal(records[0].summary.trajectory?.pass, false);
        assert.equal(records[0].summary.actions, 2);
        const trajectory = JSON.parse(
          readFileSync(join(resultsRoot, records[0].dir, 'trajectory.json'), 'utf8')
        );
        assert.equal(
          trajectory.events.filter((event: { type: string }) => event.type === 'tool').length,
          2
        );
        assert.equal(
          trajectory.events.some((event: { type: string }) => event.type === 'checkpoint'),
          false
        );
        const finalized = await lifecycle.finalize(
          stage === 'judge-error' ? 'failure' : 'SIGINT',
          artifacts
        );
        assert.equal(finalized.removed, 1);
        assert.equal(existsSync(sandbox), false);
        assert.ok(existsSync(join(resultsRoot, records[0].dir, 'trajectory.json')));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  );
}

const emptyEvidence: SddEvalEvidenceSource = {
  async readTail() {
    return [];
  },
  async readEvents() {
    return [];
  },
  async readDiff() {
    return '';
  },
  async readStatus() {
    return 'completed';
  },
};

function scenario(id: string): SddEvalScenario {
  return { id, directory: `/tmp/${id}`, phase: 'task', mode: 'brief-to-artifact', intent: 'x' };
}

for (const stop of ['policy', 'no-progress'] as const) {
  it(`${stop} observer abort fails even with green quality and no trajectory rules`, async () => {
    const aborted: string[] = [];
    let judgeCalls = 0;
    const evidence: SddEvalEvidenceSource = {
      ...emptyEvidence,
      async readStatus() {
        return 'running';
      },
      async readTail() {
        return stop === 'policy'
          ? [
              {
                messageId: 'probe',
                role: 'assistant',
                text: '',
                toolCalls: [
                  {
                    callId: 'probe',
                    tool: 'bash',
                    status: 'completed',
                    inputSummary: JSON.stringify({ command: 'npx gennady sdd-check --help' }),
                  },
                ],
              },
            ]
          : [];
      },
    };
    const runtime: SddEvalRuntime = {
      async createSession() {
        return { id: 'stopped-worker' };
      },
      async prompt() {},
      async abort(id) {
        aborted.push(id);
      },
      async judge() {
        judgeCalls++;
        return 'VERDICT: pass';
      },
    };
    const result = await new SddEvalRunner(runtime, evidence, {
      observeEveryMs: 0,
      stuckAfter: 1,
      maxObservations: 4,
    }).runScenario(scenario(`stopped-${stop}`));
    assert.deepEqual(aborted, ['stopped-worker']);
    assert.equal(result.worker.status, 'error');
    assert.ok(result.worker.error);
    assert.equal(result.worker.budgetExhausted, undefined);
    assert.equal(judgeCalls, 0);
    assert.equal(
      computeAggregateExitCode([
        {
          scenarioId: result.worker.scenarioId,
          verdict: 'worker-error',
          status: result.worker.status,
          specFiles: [],
          directory: '/tmp/stopped-worker',
          quality: { rule: 'R1', pass: true, detail: 'already-valid specifications' },
        },
      ]),
      1
    );
  });
}

it(
  'cancels the exact owned server judge and awaits acknowledgment even when its prompt never settles',
  { timeout: 5_000 },
  async () => {
    const controller = new AbortController();
    const started = deferred();
    const acknowledged = deferred();
    const aborted: string[] = [];
    let settled = false;
    const client = {
      session: {
        create: async () => ({ data: { id: 'owned-judge' } }),
        prompt: async ({ signal }: { signal?: AbortSignal }) => {
          assert.equal(signal, controller.signal);
          started.resolve();
          return new Promise(() => undefined);
        },
        abort: async ({ path, signal }: { path: { id: string }; signal?: AbortSignal }) => {
          assert.ok(signal instanceof AbortSignal, 'owned abort must have an independent deadline');
          assert.notEqual(signal, controller.signal);
          assert.equal(signal.aborted, false);
          aborted.push(path.id);
          await acknowledged.promise;
          return { data: true };
        },
      },
    } as unknown as OpencodeClient;
    const pending = new SddEvalOpenCodeRuntime({ client })
      .judge({
        directory: '/tmp/owned-judge',
        prompt: 'bounded diagnostic',
        model: DEFAULT_SDD_EVAL_CONFIG.judgeModel,
        signal: controller.signal,
      })
      .finally(() => {
        settled = true;
      });
    await started.promise;
    controller.abort(new Error('cancel owned judge'));
    await new Promise<void>((done) => setImmediate(done));
    assert.equal(settled, false);
    assert.deepEqual(aborted, ['owned-judge']);
    acknowledged.resolve();
    await assert.rejects(pending, /cancel owned judge/);
  }
);

it('propagates an owned judge cancellation failure instead of accepting a verdict', async () => {
  const controller = new AbortController();
  const started = deferred();
  const client = {
    session: {
      create: async () => ({ data: { id: 'failed-abort-judge' } }),
      prompt: async () => {
        started.resolve();
        return new Promise(() => undefined);
      },
      abort: async ({ path, signal }: { path: { id: string }; signal?: AbortSignal }) => {
        assert.equal(path.id, 'failed-abort-judge');
        assert.ok(signal instanceof AbortSignal);
        return { error: 'abort deadline exceeded' };
      },
    },
  } as unknown as OpencodeClient;
  const pending = new SddEvalOpenCodeRuntime({ client }).judge({
    directory: '/tmp/owned-judge',
    prompt: 'bounded diagnostic',
    model: DEFAULT_SDD_EVAL_CONFIG.judgeModel,
    signal: controller.signal,
  });
  await started.promise;
  controller.abort(new Error('operator abort'));
  await assert.rejects(pending, /abort deadline exceeded/);
});

it('aborts a judge created during the stop race without sending its prompt', async () => {
  const controller = new AbortController();
  const created = deferred();
  const release = deferred();
  const aborted: string[] = [];
  let prompts = 0;
  const client = {
    session: {
      create: async () => {
        created.resolve();
        await release.promise;
        return { data: { id: 'racing-judge' } };
      },
      prompt: async () => {
        prompts++;
        return { data: {} };
      },
      abort: async ({ path }: { path: { id: string } }) => {
        aborted.push(path.id);
        return { data: true };
      },
    },
  } as unknown as OpencodeClient;
  const pending = new SddEvalOpenCodeRuntime({ client }).judge({
    directory: '/tmp/owned-judge',
    prompt: 'bounded diagnostic',
    model: DEFAULT_SDD_EVAL_CONFIG.judgeModel,
    signal: controller.signal,
  });
  await created.promise;
  controller.abort(new Error('stop during creation'));
  release.resolve();
  await assert.rejects(pending, /stop during creation/);
  assert.equal(prompts, 0);
  assert.deepEqual(aborted, ['racing-judge']);
});

it('awaits result persistence before launching the next batch', async () => {
  const order: string[] = [];
  const runtime: SddEvalRuntime = {
    async createSession({ title }) {
      order.push(title);
      return { id: title };
    },
    async prompt() {},
    async judge() {
      return 'VERDICT: pass';
    },
  };
  await new SddEvalRunner(runtime, emptyEvidence, { concurrency: 1 }).runAll(
    [scenario('first'), scenario('second')],
    async ({ worker }) => {
      order.push(`persist:${worker.scenarioId}`);
    }
  );
  assert.deepEqual(order, ['sdd-eval:first', 'persist:first', 'sdd-eval:second', 'persist:second']);
});

it('propagates a result persistence failure only after pending sibling finalization', async () => {
  const secondStarted = deferred();
  const releaseSecond = deferred();
  let rejected = false;
  let siblingPersisted = false;
  const runtime: SddEvalRuntime = {
    async createSession({ title }) {
      return { id: title };
    },
    async prompt({ sessionId }) {
      if (sessionId.endsWith('second')) {
        secondStarted.resolve();
        await releaseSecond.promise;
      }
    },
    async judge() {
      return 'VERDICT: pass';
    },
  };
  const pending = new SddEvalRunner(runtime, emptyEvidence, { concurrency: 2 })
    .runAll([scenario('first'), scenario('second')], async ({ worker }) => {
      if (worker.scenarioId === 'first') throw new Error('persistence failed');
      siblingPersisted = true;
    })
    .catch((cause) => {
      rejected = true;
      throw cause;
    });
  await secondStarted.promise;
  await new Promise<void>((done) => setImmediate(done));
  assert.equal(rejected, false);
  releaseSecond.resolve();
  await assert.rejects(pending, /persistence failed/);
  assert.equal(siblingPersisted, true);
});
