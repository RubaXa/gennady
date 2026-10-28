// @file: Immutable SC4 matrix, public-data privacy, and recorded outcome honesty without private source access.
// @spec: AI-SKILLS
// @consumers: offline flow-eval qualification and clean-checkout regression tests

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

const result = resolve(
  import.meta.dirname,
  '../results/2026-10-28-sdd-coverage-sc4-live-continued'
);
const read = (path: string) => JSON.parse(readFileSync(join(result, path), 'utf8'));
const sha = (path: string) =>
  createHash('sha256')
    .update(readFileSync(join(result, path)))
    .digest('hex');

test('SC4 has eight actual dispatches, no replacements, complete captures and per-attempt cleanup', () => {
  const protocol = read('protocol.json');
  const report = read('report.json');
  assert.equal(protocol.primaryAttempts, 8);
  assert.equal(report.recorded, 8);
  assert.equal(report.replacements, 0);
  assert.equal(report.complete, true);
  for (let index = 0; index < 8; index++) {
    const record = read(`records/${index}.json`);
    assert.equal(record.index, index);
    assert.equal(read(`dispatches/${index}.json`).index, index);
    assert.equal(record.usage.complete, true);
    assert.equal(record.usage.observedModelsValid, true);
    assert.equal(record.traceComplete, true);
    assert.equal(record.cleanup.safeCleanup, true);
    assert.equal(record.cleanup.rootRemoved, true);
    assert.equal(
      record.trajectoryStatus,
      'not-proven',
      'do not promote incomplete path qualification'
    );
    assert.equal(
      record.inputSha256,
      protocol.fixtureHashes.find((entry: { caseId: string }) => entry.caseId === record.caseId)
        .sha256
    );
  }
  assert.equal(existsSync(join(result, 'dispatches/8.json')), false);
  assert.equal(read('cleanup.json').rootRemoved, true);
  assert.equal(read('cleanup.json').originalUnchanged, true);
});

test('SC4 preserves the baseline false green and the expensive candidate paths case', () => {
  const bad = read('records/3.json');
  assert.equal(bad.caseId, 'large');
  assert.equal(bad.arm, 'baseline');
  assert.equal(bad.functional, true);
  assert.equal(bad.ownerCorrect, false);
  assert.equal(bad.gatePassObserved, true);
  assert.equal(bad.validPassJournal, true);
  assert.equal(bad.judgeVerdict, 'fail');
  assert.equal(bad.hostCompletionExit, null);
  const compare = read('comparison.json');
  assert.deepEqual(compare.expectedOutcomes, { baseline: 3, candidate: 4, perArm: 4 });
  assert.equal(compare.fullTrajectoryPassClaimed, false);
  assert.equal(compare.statisticalGeneralizationClaimed, false);
  assert.deepEqual(compare.comparable.cases, ['small', 'foreign', 'paths']);
  assert.ok(compare.comparable.deltaPercent.tokens > 0);
  assert.ok(read('records/6.json').toolCalls > read('records/7.json').toolCalls);
});

test('the failed predecessor is retained as zero-dispatch infrastructure, not a replaced model result', () => {
  const old = resolve(result, '../2026-10-28-sdd-coverage-sc4-live');
  const recovery = JSON.parse(readFileSync(join(old, 'cleanup-recovery.json'), 'utf8'));
  assert.equal(recovery.modelDispatches, 0);
  assert.equal(recovery.serverConfigNeverCreated, true);
  assert.equal(recovery.serverStateNeverCreated, true);
  assert.equal(recovery.rootRemoved, true);
  assert.equal(existsSync(join(old, 'records/0.json')), false);
  assert.equal(existsSync(join(old, 'reservations/0.json')), true);
});

test('frozen SC4 source archives exactly match the executed harness hashes', () => {
  const protocol = read('protocol.json');
  const archive = read('harness-archive.json');
  assert.equal(archive.files.length, 9);
  for (const file of archive.files) {
    assert.equal(sha(file.archive), file.sha256);
    assert.equal(
      protocol.harness.find((entry: { path: string }) => entry.path === file.path).sha256,
      file.sha256
    );
  }
});

test('public primary records contain no raw commands, source, file paths or model prose', () => {
  const enums = new Set([
    'small',
    'large',
    'foreign',
    'paths',
    'baseline',
    'candidate',
    'completed-worker',
    'not-proven',
    'pass',
    'fail',
    'unknown',
    'observed',
    'violated',
    'policy-censored',
    'budget-exhausted',
    'worker-error',
    'running',
    'idle',
    'completed',
    'error',
    'bash',
    'read',
    'write',
    'edit',
    'apply_patch',
    'glob',
    'grep',
    'todowrite',
    'task',
    'other',
    'sdd-task',
    'sdd-verify',
    'sdd-log',
    'orient',
    'sdd-check',
    'directive-read',
    'project-read',
  ]);
  const walk = (value: unknown, key = '') => {
    if (typeof value === 'string') {
      if (/(?:Sha256|Identity)$/.test(key)) assert.match(value, /^[a-f0-9]{64}$/);
      else assert.ok(enums.has(value), `non-allowlisted public string at ${key}`);
    } else if (Array.isArray(value)) value.forEach((item) => walk(item, key));
    else if (value && typeof value === 'object')
      for (const [name, entry] of Object.entries(value)) walk(entry, name);
  };
  for (let index = 0; index < 8; index++) walk(read(`records/${index}.json`));
});

test('the committed evidence manifest binds every declared artifact on a clean checkout', () => {
  const manifest = read('evidence-manifest.json');
  assert.ok(manifest.files.length >= 40);
  for (const entry of manifest.files) {
    assert.ok(!entry.path.startsWith('/') && !entry.path.split('/').includes('..'));
    assert.equal(sha(entry.path), entry.sha256, entry.path);
  }
});
