// @file: Unit tests for the shared tracker parser/updater.
// @consumers: tracker
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRowDone,
  parseMeta,
  parseTrackerRows,
  recomputeRollupProgress,
  updateTrackerStatus,
  type TrackerRow,
} from '../tracker.ts';

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

  it('is tolerant of v1 unmarked Meta lines (no bold)', () => {
    const v1Meta = ['- Task-ID: TSK-31', '- Status: [x] DONE', '- Purpose: делать демо.'].join(
      '\n'
    );
    assert.deepStrictEqual(parseMeta(v1Meta), { taskId: 'TSK-31', status: '[x] DONE' });
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

describe('isRowDone', () => {
  it('true only for a `[x]` (any case) checkbox status', () => {
    assert.strictEqual(isRowDone('[x] DONE'), true);
    assert.strictEqual(isRowDone('[X] DONE'), true);
    assert.strictEqual(isRowDone('  [x] DONE  '), true);
    assert.strictEqual(isRowDone('[ ] TODO'), false);
    assert.strictEqual(isRowDone('[~] IN_PROGRESS'), false);
  });
});

const ROLLUP = [
  '## Scope Tracker',
  '| Scope | Type | Index | Tasks | Done |',
  '|---|---|---|---|---|',
  '| infra-base | infrastructure | [3-tasks](./infra-base/infra-base.3-tasks.md) | 6 | 0/6 |',
  '| backend | product | [3-tasks](./backend/backend.3-tasks.md) | 12 | 0/12 |',
].join('\n');

describe('recomputeRollupProgress', () => {
  it('rewrites Tasks/Done from the resolver-supplied rows', () => {
    const rowsByLink: Record<string, TrackerRow[]> = {
      './infra-base/infra-base.3-tasks.md': [
        { taskId: 'a', status: '[x] DONE' },
        { taskId: 'b', status: '[ ] TODO' },
      ],
      './backend/backend.3-tasks.md': [{ taskId: 'c', status: '[x] DONE' }],
    };
    const { text, updated } = recomputeRollupProgress(ROLLUP, (link) => rowsByLink[link] ?? null);
    assert.deepStrictEqual(updated.sort(), [
      './backend/backend.3-tasks.md',
      './infra-base/infra-base.3-tasks.md',
    ]);
    assert.match(
      text,
      /\| infra-base \| infrastructure \| \[3-tasks\]\(\.\/infra-base\/infra-base\.3-tasks\.md\) \| 2 \| 1\/2 \|/
    );
    assert.match(
      text,
      /\| backend \| product \| \[3-tasks\]\(\.\/backend\/backend\.3-tasks\.md\) \| 1 \| 1\/1 \|/
    );
  });

  it('is idempotent — unchanged rows report no updates', () => {
    const alreadyCurrent = ROLLUP.replace('| 6 | 0/6 |', '| 2 | 1/2 |').replace(
      '| 12 | 0/12 |',
      '| 1 | 1/1 |'
    );
    const rowsByLink: Record<string, TrackerRow[]> = {
      './infra-base/infra-base.3-tasks.md': [
        { taskId: 'a', status: '[x] DONE' },
        { taskId: 'b', status: '[ ] TODO' },
      ],
      './backend/backend.3-tasks.md': [{ taskId: 'c', status: '[x] DONE' }],
    };
    const { text, updated } = recomputeRollupProgress(
      alreadyCurrent,
      (link) => rowsByLink[link] ?? null
    );
    assert.deepStrictEqual(updated, []);
    assert.strictEqual(text, alreadyCurrent);
  });

  it('leaves a non-rollup table (no Index/Tasks/Done columns) byte-identical', () => {
    const { text, updated } = recomputeRollupProgress(MODULE_INDEX, () => []);
    assert.strictEqual(text, MODULE_INDEX);
    assert.deepStrictEqual(updated, []);
  });

  it('skips a row whose Index link the resolver cannot read', () => {
    const { text, updated } = recomputeRollupProgress(ROLLUP, () => null);
    assert.strictEqual(text, ROLLUP);
    assert.deepStrictEqual(updated, []);
  });

  it('recognizes a `Progress` header as the ratio column, same as `Done`', () => {
    const progressRollup = [
      '## Scope Tracker',
      '| Scope | Type | Index | Tasks | Progress |',
      '|---|---|---|---|---|',
      '| app | product | [3-tasks](./app/app.3-tasks.md) | 0 | 0/0 |',
    ].join('\n');
    const rows: TrackerRow[] = [
      { taskId: 'a', status: '[x] DONE' },
      { taskId: 'b', status: '[ ] TODO' },
    ];
    const { text, updated } = recomputeRollupProgress(progressRollup, () => rows);
    assert.deepStrictEqual(updated, ['./app/app.3-tasks.md']);
    assert.match(
      text,
      /\| app \| product \| \[3-tasks\]\(\.\/app\/app\.3-tasks\.md\) \| 2 \| 1\/2 \|/
    );
  });

  it('round-trips with parseTrackerRows as the resolver source', () => {
    const linked = [
      '| Task-ID | Title | Status |',
      '|---|---|---|',
      '| a | A | [x] DONE |',
      '| b | B | [ ] TODO |',
      '| c | C | [x] DONE |',
    ].join('\n');
    const { text } = recomputeRollupProgress(ROLLUP, (link) =>
      link.includes('infra-base') ? parseTrackerRows(linked) : []
    );
    assert.match(
      text,
      /\| infra-base \| infrastructure \| \[3-tasks\]\(\.\/infra-base\/infra-base\.3-tasks\.md\) \| 3 \| 2\/3 \|/
    );
  });
});
