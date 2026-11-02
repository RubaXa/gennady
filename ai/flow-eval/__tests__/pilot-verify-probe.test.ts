// @file: Integration tests for pilot baseline RED; expected defects are not post-fix success.
// @spec: AI-SKILLS
// @consumers: pilot P1/P2 stage review

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { capturePilotFreshnessProbe, capturePilotRouteProbe } from '../pilot-verify-probe.ts';

test('frozen RED retains exact harness source hashes and original failed CLI outcomes', () => {
  const directory = resolve(import.meta.dirname, '../results/2026-10-30-pilot-verify-red');
  const record = JSON.parse(readFileSync(resolve(directory, 'record.json'), 'utf8'));
  const sources: Record<string, string> = JSON.parse(
    readFileSync(resolve(directory, 'runtime-source.json'), 'utf8')
  );
  for (const [path, source] of Object.entries(sources)) {
    assert.equal(
      createHash('sha256').update(source).digest('hex'),
      record.sourceHashes[path],
      path
    );
  }
  assert.equal(Object.keys(sources).length, 2);
  assert.equal(record.baselineCommit, 'f18829b030eb0616d5d27f111b5565e899615dac');
  assert.equal(record.route.bracket.exitCode, 4);
  assert.equal(record.freshness.finalWithoutWorkaround.exitCode, 1);
  assert.equal(record.freshness.finalWithWorkaround.exitCode, 0);
  assert.equal(record.route.rootRemoved && record.freshness.rootRemoved, true);
  assert.equal(record.modelCalls, 0);
});

test('GREEN P1: an exact tracked bracket route runs the real full gate like an ordinary route', () => {
  const result = capturePilotRouteProbe();
  assert.equal(result.ordinary.exitCode, 0, result.ordinary.stderr + result.ordinary.stdout);
  assert.match(result.ordinary.stdout, /PASS node:route-proof exit=0/);
  assert.equal(result.bracket.exitCode, 0, result.bracket.stderr + result.bracket.stdout);
  assert.match(result.bracket.stdout, /PASS node:route-proof exit=0/);
  assert.doesNotMatch(result.bracket.stderr + result.bracket.stdout, /VERIFY_CONFIG_INVALID_TYPE/);
  assert.equal(result.rootRemoved, true);
  assert.equal(result.modelCalls, 0);
});

test('GREEN P2: sync and group receipts keep both phase proofs current; product changes still stale', () => {
  const result = capturePilotFreshnessProbe(resolve(import.meta.dirname, '../../..'));
  const allCurrent = (rows: readonly { ok: boolean; issue?: string }[]) =>
    rows.every((row) => row.ok);
  const allStale = (rows: readonly { ok: boolean; issue?: string }[]) =>
    rows.every((row) => !row.ok && /stale after worktree changed/.test(row.issue ?? ''));
  const issues = (rows: readonly { ok: boolean; issue?: string }[]) =>
    rows.map((row) => row.issue ?? 'ok').join('; ');
  assert.equal(allCurrent(result.beforeSync), true, issues(result.beforeSync));
  assert.equal(result.indexChanged, true);
  assert.deepEqual(
    result.beforeSyncFiles,
    result.afterSyncFiles,
    'sync changed neither source/config/spec nor ticket evidence'
  );
  // Each flow bookkeeping write alone keeps the proofs current: no re-verify workaround is needed.
  assert.equal(allCurrent(result.afterSync), true, issues(result.afterSync));
  assert.equal(allCurrent(result.afterAudit), true, issues(result.afterAudit));
  assert.equal(allCurrent(result.afterReview), true, issues(result.afterReview));
  assert.equal(
    result.finalWithoutWorkaround.exitCode,
    0,
    result.finalWithoutWorkaround.stdout + result.finalWithoutWorkaround.stderr
  );
  assert.equal(JSON.parse(result.finalWithoutWorkaround.stdout).summary.errors, 0);
  assert.equal(result.controls.length, 7);
  for (const control of result.controls) {
    // The later phase owns its test output: changing it must invalidate P2, while
    // the existing downstream exclusion deliberately keeps P1 current.
    if (control.path === 'src/delay.test.ts') {
      assert.equal(control.current[0]?.ok, true, control.path);
      assert.equal(allStale(control.current.slice(1)), true, control.path);
    } else assert.equal(allStale(control.current), true, control.path);
  }
  assert.equal(allCurrent(result.restoredCurrent), true);
  assert.equal(result.rootRemoved, true);
  assert.equal(result.modelCalls, 0);
});
