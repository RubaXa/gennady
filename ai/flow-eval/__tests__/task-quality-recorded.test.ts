// @file: Hash-bound microprobe evidence, source identity and real related-read path controls.
// @spec: AI-SKILLS
// @consumers: task-quality regression verification

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { it } from 'node:test';
import { gradeTaskQualityAnswer, parseTaskQualityAnswer } from '../task-quality-probes.ts';

const root = resolve(import.meta.dirname, '../../..');
const results = resolve(root, 'ai/flow-eval/results');
const hashes = {
  '2026-10-26-task-quality/0-decomposition-baseline.json':
    'e7eef764e0531b1e7ae71d26a12347dbaf81f8c7f9261d7e9c9876285fe3e1a7',
  '2026-10-26-task-quality/1-decomposition-candidate.json':
    'e4e283caed77fc45f9f3d1b77d65b950ef13298cad17fbe2d3ea70adf3a206a8',
  '2026-10-26-task-quality/2-scenario-review-baseline.json':
    '3876fc81d594de447dfe3165309e3c10288c77aab9debe6023e71d032d1e9fac',
  '2026-10-26-task-quality/3-scenario-review-candidate.json':
    'fec3a1bce95b597f165230e1d4b8963df330911db02f66fc1019ffbad7b8fdf4',
  '2026-10-26-task-quality/4-related-read-baseline.json':
    '90b846e9c36e31340e313c4e0ab60c61002e28358d29bf1bb33f5ea1e36a7e14',
  '2026-10-26-task-quality/5-related-read-candidate.json':
    '33678e0915e7b685abe30201a3a8b369de26bf978938d5a698307a5bdaaaac28',
  '2026-10-26-task-quality/cleanup.json':
    '60cd3cfd1fb99d193e13330d7c2da1a59b63626ef5e248fd4c403e3467ac1221',
  '2026-10-26-task-quality/protocol.json':
    'e77c06b8ced97022aa9e14332e9d5c664a6bdb0feb2f1f88157c314b914aedc7',
  '2026-10-26-task-quality/report.json':
    '298ae2a03d02c148fec2b88287992b7017a9ab628caa5c1b952c9cef2a08dc53',
  '2026-10-26-task-quality-final/0-decomposition-baseline.json':
    '41ef563d7dd1f3ed53127fc30c74d3a32cd99fc53b805ca1fc29e8094a77f69f',
  '2026-10-26-task-quality-final/1-decomposition-candidate.json':
    '02c09efda4c97cc7e34f1079a63ede1b50d28d10e50b409b3b23e75f45bae118',
  '2026-10-26-task-quality-final/2-scenario-review-baseline.json':
    'd699915b161fb43f56ff51c01c368248eb8130461ce1bd97bbf8af05126289af',
  '2026-10-26-task-quality-final/3-scenario-review-candidate.json':
    '4ea3f7e01e4a72f1f630013d05aa29dff06d27a3f0c8bc7f02de6670ef85093f',
  '2026-10-26-task-quality-final/4-related-read-baseline.json':
    '919d039906776986726be17bd7ef0d359676f9a58730f2ebed0e59c3024125d4',
  '2026-10-26-task-quality-final/5-related-read-candidate.json':
    '4c98493bbf7853ad4ae7d0a8ccff8cd92fc524c02c589a79646c82a1c39f87de',
  '2026-10-26-task-quality-final/cleanup.json':
    '60cd3cfd1fb99d193e13330d7c2da1a59b63626ef5e248fd4c403e3467ac1221',
  '2026-10-26-task-quality-final/protocol.json':
    '41d14ff86c4d41ab31d501f3df34b674c4704f21e357c1b2f29867bcb78d2238',
  '2026-10-26-task-quality-final/report.json':
    '00efdbe8a78bda9a3cb0b752f362b815c56a844764a180966db482cead8de119',
};
const read = (path: string) => JSON.parse(readFileSync(resolve(results, path), 'utf8'));

it('preserves every original public record and the first-series measurement failures', () => {
  for (const [path, hash] of Object.entries(hashes)) {
    assert.equal(
      createHash('sha256')
        .update(readFileSync(resolve(results, path)))
        .digest('hex'),
      hash,
      path
    );
  }
  assert.equal(read('2026-10-26-task-quality/2-scenario-review-baseline.json').facets.length, 6);
  assert.ok(read('2026-10-26-task-quality/5-related-read-candidate.json').pathIssues.length > 0);
});

it('binds final inputs to candidate policy and the actually executed harness without claiming a clean source', () => {
  const protocol = read('2026-10-26-task-quality-final/protocol.json');
  assert.equal(protocol.source.cleanBefore, false);
  for (const input of protocol.inputs.filter(
    (input: { arm: string }) => input.arm === 'candidate'
  )) {
    assert.equal(readFileSync(resolve(root, input.policyPath), 'utf8'), input.policy);
  }
  for (const file of protocol.harness) {
    const recordedPath =
      file.path === 'ai/flow-eval/scripts/task-quality-live.ts'
        ? resolve(results, '2026-10-26-task-quality-final/executed-task-quality-live.ts.txt')
        : resolve(root, file.path);
    assert.equal(
      createHash('sha256').update(readFileSync(recordedPath)).digest('hex'),
      file.sha256,
      file.path
    );
  }
});

it('retains the baseline stop, observes candidate helper reads, and records actual model and cleanup', () => {
  const final = '2026-10-26-task-quality-final';
  const report = read(`${final}/report.json`);
  assert.equal(report.recorded, 6);
  for (const record of report.records) {
    assert.deepEqual(record.usage.models, ['llm-proxy/deepseek-v4-flash']);
    assert.equal(record.seedUnchanged && record.sessionDeleted && record.sandboxRemoved, true);
    assert.equal(record.captureIssue, undefined);
  }
  for (const [index, id] of [
    [1, 'decomposition'],
    [3, 'scenario-review'],
    [5, 'related-read'],
  ] as const) {
    const record = read(`${final}/${index}-${id}-candidate.json`);
    assert.deepEqual(gradeTaskQualityAnswer(id, parseTaskQualityAnswer(record.response)), []);
    assert.equal(record.trajectory.coverage.complete, true);
  }
  assert.ok(
    read(`${final}/4-related-read-baseline.json`).facets.includes('context-gap-unresolved')
  );
  assert.deepEqual(read(`${final}/5-related-read-candidate.json`).pathIssues, []);
  assert.equal(read(`${final}/5-related-read-candidate.json`).toolCalls, 2);
  for (const series of ['2026-10-26-task-quality', final]) {
    assert.deepEqual(read(`${series}/cleanup.json`), {
      ownedRootRemoved: true,
      serverStopped: true,
      dependencyCopies: 0,
      modelFallback: false,
    });
  }
});
