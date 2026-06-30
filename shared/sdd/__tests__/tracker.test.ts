// @file: Unit tests for the shared tracker parser/updater.
// @consumers: tracker
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMeta, updateTrackerStatus } from '../tracker.ts';

const META = [
  '- **Task-ID:** cli-foo',
  '- **Status:** [x] DONE   <!-- [ ] TODO | ... -->',
  '- **Owner:** module',
].join('\n');

const MODULE_INDEX = [
  '# m — Tasks',
  '## 1. Tracker Index',
  '| Task-ID | Title | Dependencies | Status | Reopens |',
  '|---------|-------|--------------|--------|---------|',
  '| cli-foo | Do the foo | — | [ ] TODO | — |',
  '| cli-bar | Do the bar | cli-foo | [~] IN_PROGRESS | — |',
].join('\n');

const SCOPE_INDEX = [
  '## Tracker',
  '| Task-ID | Title | Module | Dependencies | Status | Reopens |',
  '|---------|-------|--------|--------------|--------|---------|',
  '| `cli-foo` | Do the foo | core | — | [ ] TODO | — |',
].join('\n');

describe('parseMeta', () => {
  it('extracts Task-ID and Status', () => {
    assert.deepStrictEqual(parseMeta(META), { taskId: 'cli-foo', status: '[x] DONE' });
  });

  it('returns nulls when absent', () => {
    assert.deepStrictEqual(parseMeta('- **Owner:** module'), { taskId: null, status: null });
  });
});

describe('updateTrackerStatus', () => {
  it('updates the matching row Status (module index, col 4)', () => {
    const r = updateTrackerStatus(MODULE_INDEX, 'cli-foo', '[x] DONE');
    assert.strictEqual(r.ok, true);
    if (r.ok) {
      assert.strictEqual(r.changed, true);
      assert.match(r.text, /\| cli-foo \| Do the foo \| — \| \[x\] DONE \| — \|/);
      // other row untouched
      assert.match(r.text, /\| cli-bar \| Do the bar \| cli-foo \| \[~\] IN_PROGRESS \| — \|/);
    }
  });

  it('locates Status by header even when its column index differs (scope index, col 5)', () => {
    const r = updateTrackerStatus(SCOPE_INDEX, 'cli-foo', '[x] DONE');
    assert.strictEqual(r.ok, true);
    if (r.ok) assert.match(r.text, /\| `cli-foo` \| Do the foo \| core \| — \| \[x\] DONE \| — \|/);
  });

  it('is idempotent — same status reports changed:false', () => {
    const once = updateTrackerStatus(MODULE_INDEX, 'cli-bar', '[~] IN_PROGRESS');
    assert.strictEqual(once.ok, true);
    if (once.ok) assert.strictEqual(once.changed, false);
  });

  it('task_not_found when no row matches', () => {
    const r = updateTrackerStatus(MODULE_INDEX, 'cli-zzz', '[x] DONE');
    assert.strictEqual(r.ok, false);
    if (!r.ok) assert.strictEqual(r.reason, 'task_not_found');
  });

  it('no_table when there is no tracker header', () => {
    const r = updateTrackerStatus('# m\n\nNo table here.\n', 'cli-foo', '[x] DONE');
    assert.strictEqual(r.ok, false);
    if (!r.ok) assert.strictEqual(r.reason, 'no_table');
  });
});
