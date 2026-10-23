// @file: Offline replay of actual Flash trajectories, never a fabricated success trace.
// @spec: AI-SKILLS
// @consumers: authoring diagnostic corpus, measureAuthoringPath

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFileSync } from 'node:fs';
import { AUTHORING_CASE_IDS, getAuthoringCase } from '../authoring-benchmark.ts';
import { measureAuthoringPath } from '../authoring-metrics.ts';
import type { Trajectory } from '../trajectory.ts';

const corpus = new URL('../results/', import.meta.url);
const audit = JSON.parse(
  readFileSync(
    new URL('authoring-campaigns/template-authoring-wall180-oct22/sdk-usage.json', corpus),
    'utf8'
  )
) as {
  sessions: Array<{ caseId: string; role: string; directory: string; usage: { models: string[] } }>;
};
for (const id of AUTHORING_CASE_IDS) {
  it(`recorded ${id}: deterministic replay preserves counts and refuses invented whole-write proof`, () => {
    const prefix = `2026-10-22-authoring-template-authoring-wall180-oct22-${id}-baseline-r1/`;
    const trajectory = JSON.parse(
      readFileSync(new URL(prefix + 'trajectory.json', corpus), 'utf8')
    ) as Trajectory;
    const summary = JSON.parse(readFileSync(new URL(prefix + 'summary.json', corpus), 'utf8'));
    const worker = audit.sessions.find((row) => row.caseId === id && row.role === 'worker');
    assert.ok(worker);
    assert.deepEqual(worker.usage.models, ['llm-proxy/deepseek-v4-flash']);
    const item = getAuthoringCase(id);
    const replay = measureAuthoringPath(
      trajectory,
      item.target,
      worker.directory,
      item.target.endsWith('.spec.md'),
      item.createArgs
    );
    assert.equal(trajectory.coverage?.complete, true);
    assert.deepEqual(replay.metrics, summary.authoringBenchmark.metrics);
    assert.equal(replay.pass, false);
    assert.match(replay.detail, /opaque Bash/);
    assert.equal(summary.trajectory.pass, false, 'raw outcome remains unmodified');
  });
}
