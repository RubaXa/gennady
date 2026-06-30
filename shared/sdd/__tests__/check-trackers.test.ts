// @file: Unit tests for parseTrackerRows + the tracker↔ticket cross-check.
// @consumers: tracker, check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrackerRows } from '../tracker.ts';
import { checkTrackers, type TicketRef, type TrackerRowRef } from '../check.ts';

const tracker = [
  '# mod — Tasks',
  '## 1. Tracker Index',
  '| Task-ID | Title | Dependencies | Status | Reopens |',
  '|---------|-------|--------------|--------|---------|',
  '| `cli-a` | A | — | [x] DONE | — |',
  '| `cli-b` | B | cli-a | [ ] TODO | — |',
].join('\n');

const ticket = (taskId: string, status: string | null): TicketRef => ({
  file: `${taskId}.md`,
  taskId,
  status,
  dependencies: [],
});
const row = (taskId: string, status: string): TrackerRowRef => ({
  file: 'mod.3-tasks.md',
  taskId,
  status,
});
const codes = (t: TicketRef[], r: TrackerRowRef[]): string[] =>
  checkTrackers(t, r).map((f) => f.code);

describe('parseTrackerRows', () => {
  it('reads Task-ID + Status from the Tracker Index, link/backtick-stripped', () => {
    assert.deepStrictEqual(parseTrackerRows(tracker), [
      { taskId: 'cli-a', status: '[x] DONE' },
      { taskId: 'cli-b', status: '[ ] TODO' },
    ]);
  });
  it('empty when no Task-ID/Status table', () => {
    assert.deepStrictEqual(parseTrackerRows('# x\nno table'), []);
  });
});

describe('checkTrackers', () => {
  it('clean: ticket status matches its tracker row → no findings', () => {
    assert.deepStrictEqual(
      checkTrackers([ticket('cli-a', '[x] DONE')], [row('cli-a', '[x] DONE')]),
      []
    );
  });

  it('flags status drift between ticket and tracker row', () => {
    assert.ok(
      codes([ticket('cli-a', '[x] DONE')], [row('cli-a', '[ ] TODO')]).includes(
        'SDD_TRACKER_STATUS_DRIFT'
      )
    );
  });

  it('flags a ticket with no tracker row', () => {
    assert.ok(codes([ticket('cli-a', '[ ] TODO')], []).includes('SDD_TRACKER_MISSING_ROW'));
  });

  it('flags a tracker row with no ticket', () => {
    assert.ok(codes([], [row('cli-ghost', '[ ] TODO')]).includes('SDD_TRACKER_ORPHAN_ROW'));
  });
});
