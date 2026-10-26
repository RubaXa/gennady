// @file: Preserve boundary-probe answers and the observed directory-read trajectory failures.
// @spec: AI-SKILLS
// @consumers: task-quality evidence replay

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { it } from 'node:test';
import {
  gradeTaskQualityBoundary,
  gradeTaskQualityBoundaryReads,
  taskQualityBoundaryPolicy,
} from '../task-quality-boundary-probes.ts';
import { parseTaskQualityAnswer } from '../task-quality-probes.ts';

const root = resolve(import.meta.dirname, '../../..');
const dir = resolve(root, 'ai/flow-eval/results/2026-10-26-task-quality-boundaries');
const read = (name: string) => JSON.parse(readFileSync(resolve(dir, name), 'utf8'));
const hashes = {
  '0-structural-review-baseline.json':
    '6b9b125b4d2e22a28c49d58e8c467628d2379cfd4e33204036b83917a2c745e9',
  '1-structural-review-candidate.json':
    '5d55a6a5f6856c530bc1a99c00ef35da09c2b47c4ae69795eaa94f86d8fa1686',
  '2-cli-related-read-baseline.json':
    'ddf81f85aa1f07193636ac86db109684c06ff9c31dff31deb1fe049ee34217ae',
  '3-cli-related-read-candidate.json':
    'a866a955577a0b9963865d5c164f2cc48301d3e166ff04d20a8af1f1bfd58bc4',
  'cleanup.json': '60cd3cfd1fb99d193e13330d7c2da1a59b63626ef5e248fd4c403e3467ac1221',
  'protocol.json': 'a34037e5eb94a01a673507f381bcde1794b2883d06b5744d3aa748d40cc1a5c6',
  'report.json': '3322ee9609b8fb224b75d45ab0e5441da163201e1287a50d413db4a073e0626f',
};

it('hash-binds the four actual attempts, input policies and executed harness', () => {
  for (const [name, hash] of Object.entries(hashes))
    assert.equal(
      createHash('sha256')
        .update(readFileSync(resolve(dir, name)))
        .digest('hex'),
      hash,
      name
    );
  const protocol = read('protocol.json');
  assert.equal(protocol.source.baseline, 'a39f7929f79b39f8cb7f923ed1b2c1514f75255d');
  assert.equal(protocol.source.cleanBefore, false);
  for (const input of protocol.inputs.filter((i: { arm: string }) => i.arm === 'candidate'))
    assert.equal(
      taskQualityBoundaryPolicy(input.id, (path) => readFileSync(resolve(root, path), 'utf8'))
        .policy,
      input.policy
    );
  for (const file of protocol.harness)
    assert.equal(
      createHash('sha256')
        .update(
          readFileSync(
            file.path === 'ai/flow-eval/scripts/task-quality-live.ts'
              ? resolve(dir, 'executed-task-quality-live.ts.txt')
              : resolve(root, file.path)
          )
        )
        .digest('hex'),
      file.sha256,
      file.path
    );
});

it('keeps correct answers separate from red path evidence in both arms and retains cleanup facts', () => {
  const report = read('report.json');
  assert.equal(report.planned, 4);
  assert.equal(report.recorded, 4);
  for (const [index, record] of report.records.entries()) {
    const raw = read(`${index}-${record.id}-${record.arm}.json`);
    assert.deepEqual(gradeTaskQualityBoundary(record.id, parseTaskQualityAnswer(raw.response)), []);
    assert.equal(raw.trajectory.coverage.complete, true);
    assert.deepEqual(record.usage.models, ['llm-proxy/deepseek-v4-flash']);
    assert.equal(record.usage.complete, true);
    assert.equal(record.seedUnchanged && record.sessionDeleted && record.sandboxRemoved, true);
    if (record.id === 'cli-related-read') {
      const calls = raw.trajectory.entries.flatMap(
        (entry: { toolCalls: { tool: string; status: string; inputSummary?: string }[] }) =>
          entry.toolCalls
      );
      assert.deepEqual(gradeTaskQualityBoundaryReads(calls, true), ['unrelated-read']);
      assert.deepEqual(record.pathIssues, ['unrelated-read']);
      assert.equal(record.toolCalls, 4);
      assert.equal(record.unexpectedTool, false);
    }
  }
  assert.deepEqual(read('cleanup.json'), {
    ownedRootRemoved: true,
    serverStopped: true,
    dependencyCopies: 0,
    modelFallback: false,
  });
});
