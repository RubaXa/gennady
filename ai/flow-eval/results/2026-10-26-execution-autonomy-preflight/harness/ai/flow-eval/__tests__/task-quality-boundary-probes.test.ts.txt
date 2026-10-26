// @file: Negative controls for the two independently reviewed task-policy ambiguities.
// @spec: AI-SKILLS
// @consumers: task-quality boundary microprobes

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import {
  gradeTaskQualityBoundary,
  gradeTaskQualityBoundaryReads,
  taskQualityBoundaryPolicy,
} from '../task-quality-boundary-probes.ts';

it('rejects a missing boundary baseline before allocating private or public run directories', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'gennady-boundary-arguments-'));
  const root = resolve(import.meta.dirname, '../../..');
  const output = join(root, 'ai/flow-eval/results', basename(temporary));
  assert.equal(existsSync(output), false);
  try {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'ai/flow-eval/scripts/task-quality-live.ts', output, '--boundaries'],
      {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, TMPDIR: temporary },
        timeout: 15000,
      }
    );
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Explicit boundary baseline required/);
    // The tsx loader may create its own cache before evaluating the runner module.
    assert.ok(readdirSync(temporary).every((name) => /^tsx-\d+$/.test(name)));
    assert.equal(existsSync(output), false);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
    if (existsSync(output)) rmSync(output, { recursive: true });
  }
});

it('accepts concrete scheduling findings without invented runtime tests, rejects added tests and wrong order', () => {
  const answer = {
    findings: ['COLLISION', 'ORDER'].map((id) => ({
      id,
      evidence: ['package.json in declared Target Files and prerequisites'],
      consequence: 'Concurrent writers or missing harness prevent reliable execution.',
      fix: id === 'COLLISION' ? 'serialize' : 'add-dependency',
      testAction: 'none',
      testReason: 'The declared target/dependency rows directly establish the scheduling defect.',
    })),
  };
  assert.deepEqual(gradeTaskQualityBoundary('structural-review', answer), []);
  answer.findings[0].testAction = 'add';
  assert.ok(
    gradeTaskQualityBoundary('structural-review', answer).includes(
      'unnecessary-runtime-test:COLLISION'
    )
  );
  answer.findings[1].fix = 'serialize';
  assert.ok(
    gradeTaskQualityBoundary('structural-review', answer).includes('wrong-correction:ORDER')
  );
  assert.ok(gradeTaskQualityBoundary('structural-review', { findings: [] }).length > 0);
});

it('requires the project helper answer and actual bounded native reads, not just authored prose', () => {
  assert.deepEqual(
    gradeTaskQualityBoundary('cli-related-read', {
      answer: 7,
      status: 'answered',
      relatedReads: [
        { path: 'cli/helper.ts', reason: 'Resolve imported windowEnd implementation.' },
      ],
    }),
    []
  );
  assert.ok(
    gradeTaskQualityBoundary('cli-related-read', { answer: null, status: 'needs-orchestrator' })
      .length > 0
  );
  const calls = ['cli/main.ts', 'cli/helper.ts'].map((filePath) => ({
    tool: 'read',
    status: 'completed',
    inputSummary: JSON.stringify({ filePath }),
  }));
  assert.deepEqual(gradeTaskQualityBoundaryReads(calls, true), []);
  assert.ok(gradeTaskQualityBoundaryReads(calls.slice(0, 1), true).length > 0);
  assert.ok(
    gradeTaskQualityBoundaryReads([...calls, { ...calls[0], tool: 'bash' }], true).includes(
      'unexpected-tool'
    )
  );
  assert.ok(
    gradeTaskQualityBoundaryReads(
      [...calls, { ...calls[0], inputSummary: '{"filePath":".env"}' }],
      true
    ).includes('unrelated-read')
  );
});

it('extracts only the actual formatter prohibition and fails closed if it is absent', () => {
  const policy = taskQualityBoundaryPolicy('cli-related-read', (path) =>
    path.endsWith('.ts')
      ? "lines.push('  NEVER READ: installed tool internals');"
      : 'Related read policy'
  );
  assert.match(policy.policy, /NEVER READ: installed tool internals/);
  assert.equal(policy.policyPaths.length, 2);
  assert.throws(
    () => taskQualityBoundaryPolicy('cli-related-read', () => 'unrecognized source'),
    /prohibition missing/
  );
});
