// @file: Unit tests for shared sync formatter — formatSyncOutput
// @consumers: sync.cmd.ts, sync-skills.cmd.ts
// @tasks: TSK-56

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatSyncOutput, type SyncFormatEntry } from '../sync-formatter.shared.ts';

describe('formatSyncOutput', () => {
  // #region TEST_CASE_FS_1: all markers + summary with deleted
  it('formats mixed added, updated, deleted, unchanged entries with all markers', () => {
    // contract: + added, ~ updated, - deleted, = unchanged (unchanged)
    // summary includes deleted count only when > 0

    const entries: SyncFormatEntry[] = [
      { relativePath: 'new.xml', status: 'added' },
      { relativePath: 'changed.xml', status: 'updated' },
      { relativePath: 'removed.xml', status: 'deleted' },
      { relativePath: 'same.xml', status: 'unchanged' },
    ];

    const lines = formatSyncOutput(entries, { dryRun: false });

    assert.ok(lines[0].includes('+ new.xml'));
    assert.ok(lines[1].includes('~ changed.xml'));
    assert.ok(lines[2].includes('- removed.xml'));
    assert.ok(lines[3].includes('= same.xml'));
    assert.ok(lines[3].includes('(unchanged)'));
    assert.ok(lines[4].includes('Synced: 1 added, 1 updated, 1 skipped (unchanged), 1 deleted'));
  });
  // #endregion

  // #region TEST_CASE_FS_2: dry-run markers and summary
  it('uses dry-run markers and dry-run summary', () => {
    // contract: (would add), (would update), (would delete), (unchanged, skip)
    // summary line: Dry-run: no files written.

    const entries: SyncFormatEntry[] = [
      { relativePath: 'a.xml', status: 'added' },
      { relativePath: 'b.xml', status: 'updated' },
      { relativePath: 'c.xml', status: 'deleted' },
      { relativePath: 'd.xml', status: 'unchanged' },
    ];

    const lines = formatSyncOutput(entries, { dryRun: true });

    assert.ok(lines[0].includes('(would add)'));
    assert.ok(lines[1].includes('(would update)'));
    assert.ok(lines[2].includes('(would delete)'));
    assert.ok(lines[3].includes('(unchanged, skip)'));
    assert.ok(lines[4].includes('Dry-run: no files written.'));
  });
  // #endregion

  // #region TEST_CASE_FS_3: empty entries normal mode
  it('returns summary only for empty entries in normal mode', () => {
    // contract: single summary line, zero counts
    const lines = formatSyncOutput([], { dryRun: false });

    assert.strictEqual(lines.length, 1);
    assert.strictEqual(lines[0], 'Synced: 0 added, 0 updated, 0 skipped (unchanged)');
  });
  // #endregion

  // #region TEST_CASE_FS_4: empty entries dry-run mode
  it('returns dry-run summary for empty entries', () => {
    // contract: Dry-run: no files written.
    const lines = formatSyncOutput([], { dryRun: true });

    assert.strictEqual(lines.length, 1);
    assert.strictEqual(lines[0], 'Dry-run: no files written.');
  });
  // #endregion

  // #region TEST_CASE_FS_5: added only — no deleted in summary
  it('omits deleted fragment from summary when deleted count is zero', () => {
    // contract: summary does not include ", 0 deleted"
    const entries: SyncFormatEntry[] = [
      { relativePath: 'a.xml', status: 'added' },
      { relativePath: 'b.xml', status: 'updated' },
    ];

    const lines = formatSyncOutput(entries, { dryRun: false });

    assert.ok(lines[2].includes('Synced: 1 added, 1 updated, 0 skipped (unchanged)'));
    assert.ok(!lines[2].includes('deleted'));
  });
  // #endregion

  // #region TEST_CASE_FS_6: output order matches input
  it('preserves input order in output lines', () => {
    // contract: entries appear in insertion order, summary is last
    const entries: SyncFormatEntry[] = [
      { relativePath: 'z.xml', status: 'unchanged' },
      { relativePath: 'a.xml', status: 'added' },
      { relativePath: 'm.xml', status: 'updated' },
    ];

    const lines = formatSyncOutput(entries, { dryRun: false });

    assert.ok(lines[0].includes('z.xml'));
    assert.ok(lines[1].includes('a.xml'));
    assert.ok(lines[2].includes('m.xml'));
  });
  // #endregion
});
