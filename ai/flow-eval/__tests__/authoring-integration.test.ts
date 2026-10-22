// @file: Authoring matrix, provenance, actual-model timing and durable portal/index artifact controls.
// @spec: AI-SKILLS
// @consumers: flow-eval authoring protocol; node:test

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadScenarios } from '../cli.ts';
import {
  createAuthoringMatrix,
  readAuthoringObservations,
} from '../scripts/authoring-experiment.ts';
import { persistDurableResult, type SddEvalDurableSummary } from '../results-archive.ts';
import { SddEvalOpenCodeEvidenceSource } from '../evidence.ts';
import { bindAuthoringScenario } from '../authoring-metrics.ts';

it('preserves actual Bash workdir for exact-target gate attribution', async () => {
  const source = new SddEvalOpenCodeEvidenceSource({
    directory: '/owned',
    client: {
      session: {
        children: async () => ({ data: [] }),
        messages: async () => ({
          data: [
            {
              info: { id: 'message', role: 'assistant', sessionID: 'worker' },
              parts: [
                {
                  type: 'tool',
                  callID: 'call',
                  tool: 'bash',
                  state: {
                    status: 'completed',
                    input: {
                      command: 'gennady sdd-check --spec specs/demo.spec.md --authoring',
                      workdir: '/another/project',
                    },
                    time: { start: 1, end: 2 },
                    metadata: { exit: 0 },
                  },
                },
              ],
            },
          ],
        }),
      },
    } as never,
  });
  const captured = await source.readTrajectory('worker');
  assert.equal(captured.coverage.complete, true);
  assert.equal(
    JSON.parse(captured.entries[0]!.toolCalls![0]!.inputSummary!).workdir,
    '/another/project'
  );
});

it('matrix is ten cases × three repetitions; labels do not rewrite task facts', async () => {
  const rows = createAuthoringMatrix('trial', 'baseline');
  assert.equal(rows.length, 30);
  assert.match(rows[0]!.acceptance!, /valid pending-decomposition state/);
  assert.equal(new Set(rows.map((row) => row.id)).size, 30);
  const next = createAuthoringMatrix('trial', 'embedded');
  assert.deepEqual(
    rows.map((row) => [row.intent, row.acceptance]),
    next.map((row) => [row.intent, row.acceptance])
  );
  assert.equal(
    bindAuthoringScenario('frozen', rows[0]!),
    bindAuthoringScenario('frozen', next[0]!)
  );
  for (const change of [{ intent: 'a different task' }, { budgetMs: 1 }, { acceptance: 'weaker' }])
    assert.notEqual(
      bindAuthoringScenario('frozen', rows[0]!),
      bindAuthoringScenario('frozen', { ...rows[0]!, ...change })
    );
  const root = mkdtempSync(join(tmpdir(), 'authoring-load-'));
  try {
    const file = join(root, 'matrix.json');
    writeFileSync(file, JSON.stringify(rows));
    assert.equal((await loadScenarios(file)).length, 30);
    for (const change of [
      { authoringBenchmark: undefined },
      { fixture: 'fibonacci-library' },
      { phase: 'spec-authoring' },
      { authoringBenchmark: { ...rows[0]!.authoringBenchmark, caseId: 'typo' } },
      { authoringBenchmark: { ...rows[0]!.authoringBenchmark, repetition: 0 } },
      { authoringBenchmark: { ...rows[0]!.authoringBenchmark, campaign: '../escape' } },
    ]) {
      writeFileSync(file, JSON.stringify([{ ...rows[0], ...change }]));
      await assert.rejects(loadScenarios(file), /AUTHORING/);
    }
    assert.throws(
      () => createAuthoringMatrix('trial', 'baseline', 3, ['portal', 'portal']),
      /matrix/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('records actual SDK models and completed-message duration, not polling interval or requested model', async () => {
  const client = {
    session: {
      children: async () => ({ data: [] }),
      messages: async () => ({
        data: [
          { info: { role: 'user', time: { created: 100 } } },
          {
            info: {
              role: 'assistant',
              providerID: 'llm-proxy',
              modelID: 'deepseek-v4-flash',
              time: { created: 110, completed: 340 },
              tokens: { input: 10, output: 3, reasoning: 4, cache: { read: 50, write: 0 } },
              cost: 0,
            },
          },
        ],
      }),
    },
  } as never;
  const source = new SddEvalOpenCodeEvidenceSource({ directory: '/owned', client });
  const usage = await source.readUsage('actual');
  assert.deepEqual(usage.models, ['llm-proxy/deepseek-v4-flash']);
  assert.equal(usage.complete, true);
  assert.equal(usage.sessions, 1);
  assert.equal(usage.wallClockMs, 240);
  assert.equal(usage.total, 17);
  assert.equal(usage.cacheRead, 50);
});

it('does not qualify truncated SDK usage as a faster completed run', async () => {
  const source = new SddEvalOpenCodeEvidenceSource({
    directory: '/owned',
    client: {
      session: {
        children: async () => ({ data: [] }),
        messages: async () => ({
          data: [
            { info: { role: 'user', time: { created: 100 } } },
            {
              info: {
                role: 'assistant',
                providerID: 'llm-proxy',
                modelID: 'deepseek-v4-flash',
                time: { created: 110, completed: 340 },
                tokens: { input: 10, output: 3 },
              },
            },
            {
              info: {
                role: 'assistant',
                providerID: 'llm-proxy',
                modelID: 'deepseek-v4-flash',
                time: { created: 1000 },
                tokens: { input: 10, output: 3 },
              },
            },
          ],
        }),
      },
    } as never,
  });
  const usage = await source.readUsage('truncated');
  assert.equal(usage.complete, false);
  assert.equal(usage.wallClockMs, undefined);
});

it('refuses incomplete or negative token counters as a comparable cheap run', async () => {
  for (const tokens of [
    { input: 10, output: 3 },
    { input: 10, output: -1, reasoning: 0, cache: { read: 0, write: 0 } },
  ]) {
    const source = new SddEvalOpenCodeEvidenceSource({
      directory: '/owned',
      client: {
        session: {
          children: async () => ({ data: [] }),
          messages: async () => ({
            data: [
              {
                info: {
                  role: 'assistant',
                  providerID: 'llm-proxy',
                  modelID: 'deepseek-v4-flash',
                  time: { created: 110, completed: 340 },
                  tokens,
                },
              },
            ],
          }),
        },
      } as never,
    });
    assert.equal((await source.readUsage('incomplete-tokens')).complete, false);
  }
});

it('persists exact portal/index markdown separately; unsafe snapshot cannot publish a summary', async () => {
  const root = mkdtempSync(join(tmpdir(), 'authoring-snapshot-'));
  const summary: SddEvalDurableSummary = {
    scenarioId: 'portal',
    date: '2026-10-22',
    timestamp: '2026-10-22T00:00:00Z',
    model: { providerID: 'llm-proxy', modelID: 'deepseek-v4-flash' },
    judgeModel: { providerID: 'llm-proxy', modelID: 'deepseek-v4-flash' },
    budget: {
      concurrency: 1,
      maxObservations: 10,
      observeEveryMs: 1,
      stuckAfter: 3,
      tailLimit: 20,
    },
    verdict: 'pass',
    status: 'completed',
    outcome: 'pass',
    actions: 4,
    hasJudge: false,
    specFiles: [],
  };
  try {
    const sandbox = join(root, 'sandbox');
    mkdirSync(join(sandbox, 'specs'), { recursive: true });
    const portal = join(sandbox, 'specs/README.md');
    writeFileSync(portal, '# Exact portal\r\n');
    const saved = await persistDurableResult(join(root, 'results'), summary, {
      artifacts: { root: sandbox, files: [portal] },
    });
    assert.equal(readFileSync(join(saved, 'specs/README.md'), 'utf8'), '# Exact portal\r\n');
    assert.deepEqual(JSON.parse(readFileSync(join(saved, 'summary.json'), 'utf8')).artifactFiles, [
      'specs/README.md',
    ]);
    symlinkSync(portal, join(sandbox, 'specs/unsafe.md'));
    await assert.rejects(
      persistDurableResult(join(root, 'results'), summary, {
        artifacts: { root: sandbox, files: [join(sandbox, 'specs/unsafe.md')] },
      }),
      /unsafe/
    );
    const incomplete = join(root, 'results/2026-10-22-authoring-trial-portal-baseline-r1');
    mkdirSync(incomplete);
    writeFileSync(join(incomplete, 'summary.json'), '{}');
    await assert.rejects(
      readAuthoringObservations(join(root, 'results'), 'trial', ['baseline']),
      /incomplete/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
