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

  it('flags drift when the ticket is DONE but the tracker row lags at TODO', () => {
    assert.ok(
      codes([ticket('cli-a', '[x] DONE')], [row('cli-a', '[ ] TODO')]).includes(
        'SDD_TRACKER_STATUS_DRIFT'
      )
    );
  });

  it('flags drift when the tracker row says DONE but the ticket itself is still TODO — the TSK-58 gap: a tracker can drift ahead of the ticket, not just fall behind it', () => {
    assert.ok(
      codes([ticket('cli-a', '[ ] TODO')], [row('cli-a', '[x] DONE')]).includes(
        'SDD_TRACKER_STATUS_DRIFT'
      )
    );
  });

  it('does not flag a formatting-only difference — tracker cell keeps backticks (`` `[x]` DONE ``), ticket Meta never does', () => {
    assert.deepStrictEqual(
      checkTrackers([ticket('cli-a', '[x] DONE')], [row('cli-a', '`[x]` DONE')]),
      []
    );
  });

  it('flags a ticket with no tracker row', () => {
    assert.ok(codes([ticket('cli-a', '[ ] TODO')], []).includes('SDD_TRACKER_MISSING_ROW'));
  });

  it('flags a tracker row with no ticket', () => {
    assert.ok(codes([], [row('cli-ghost', '[ ] TODO')]).includes('SDD_TRACKER_ORPHAN_ROW'));
  });

  it('MISSING_ROW/ORPHAN_ROW warn on a v1 (legacy) scope, error on v2 — mirrors checkBddCoverage grading', () => {
    const v1Ticket: TicketRef = { ...ticket('cli-a', '[ ] TODO'), flowVersion: 'v1' };
    const v2Ticket: TicketRef = { ...ticket('cli-b', '[ ] TODO'), flowVersion: 'v2' };
    const v1Row: TrackerRowRef = { ...row('cli-ghost1', '[ ] TODO'), flowVersion: 'v1' };
    const v2Row: TrackerRowRef = { ...row('cli-ghost2', '[ ] TODO'), flowVersion: 'v2' };

    const missing = checkTrackers([v1Ticket, v2Ticket], []);
    assert.strictEqual(missing.find((f) => f.file === 'cli-a.md')?.severity, 'warn');
    assert.strictEqual(missing.find((f) => f.file === 'cli-b.md')?.severity, 'error');

    const orphan = checkTrackers([], [v1Row, v2Row]);
    assert.strictEqual(orphan.find((f) => f.message.includes('cli-ghost1'))?.severity, 'warn');
    assert.strictEqual(orphan.find((f) => f.message.includes('cli-ghost2'))?.severity, 'error');
  });

  it('MISSING_ROW/ORPHAN_ROW default to warn (v1) when flowVersion is omitted', () => {
    assert.strictEqual(checkTrackers([ticket('cli-a', '[ ] TODO')], [])[0]?.severity, 'warn');
    assert.strictEqual(checkTrackers([], [row('cli-ghost', '[ ] TODO')])[0]?.severity, 'warn');
  });
});
