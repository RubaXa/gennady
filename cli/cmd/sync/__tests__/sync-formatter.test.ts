// @file: Unit tests for SyncFormatter — formatSyncOutput from shared
// @consumers: sync-formatter.ts
// @tasks: TSK-54, TSK-56

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatSyncOutput } from '../../../../shared/common/sync/sync-formatter.shared.ts';
import type { SyncFormatEntry } from '../../../../shared/common/sync/sync-formatter.shared.ts';

function makeEntry(relativePath: string, status: SyncFormatEntry['status']): SyncFormatEntry {
  return { relativePath, status };
}

describe('formatSyncOutput', () => {
  // #region TEST_CASE_FMT_1: mixed statuses
  it('formats mixed added, updated, unchanged entries', () => {
    // purpose: mixed status → each file gets correct marker
    // contract: markers: + for added, ~ for updated, = for unchanged

    const entries = [
      makeEntry('new-file.xml', 'added'),
      makeEntry('changed-file.xml', 'updated'),
      makeEntry('same-file.xml', 'unchanged'),
    ];

    const lines = formatSyncOutput(entries);

    assert.ok(lines[0].includes('+ new-file.xml'));
    assert.ok(lines[1].includes('~ changed-file.xml'));
    assert.ok(lines[2].includes('= same-file.xml'));
    assert.ok(lines[2].includes('(unchanged)'));
    assert.ok(lines[3].includes('Synced: 1 added, 1 updated, 1 skipped'));
  });
  // #endregion

  // #region TEST_CASE_FMT_2: dryRun markers
  it('uses dryRun markers when dryRun is true', () => {
    // purpose: dryRun → (would add), (would update), (unchanged, skip)
    // contract: no file is actually written, just preview

    const entries = [
      makeEntry('a.xml', 'added'),
      makeEntry('b.xml', 'updated'),
      makeEntry('c.xml', 'unchanged'),
    ];

    const lines = formatSyncOutput(entries, { dryRun: true });

    assert.ok(lines[0].includes('(would add)'));
    assert.ok(lines[1].includes('(would update)'));
    assert.ok(lines[2].includes('(unchanged, skip)'));
    assert.ok(lines[3].includes('Dry-run: no files written.'));
  });
  // #endregion

  // #region TEST_CASE_FMT_3: all added
  it('formats all-added entries', () => {
    // purpose: all files new → all +
    // contract: summary counts all as added

    const entries = [makeEntry('a.xml', 'added'), makeEntry('b.xml', 'added')];

    const lines = formatSyncOutput(entries);

    assert.ok(lines[0].includes('+ a.xml'));
    assert.ok(lines[1].includes('+ b.xml'));
    assert.ok(lines[2].includes('Synced: 2 added, 0 updated, 0 skipped'));
  });
  // #endregion

  // #region TEST_CASE_FMT_4: all unchanged
  it('formats all-unchanged entries', () => {
    // purpose: all files same → all =
    // contract: summary counts all as skipped

    const entries = [
      makeEntry('a.xml', 'unchanged'),
      makeEntry('b.xml', 'unchanged'),
      makeEntry('c.xml', 'unchanged'),
    ];

    const lines = formatSyncOutput(entries);

    assert.ok(lines[0].includes('= a.xml'));
    assert.ok(lines[3].includes('Synced: 0 added, 0 updated, 3 skipped'));
  });
  // #endregion

  // #region TEST_CASE_FMT_5: empty entries
  it('formats empty entries with only summary line', () => {
    // purpose: no files → only summary
    // contract: single summary line, no file lines

    const lines = formatSyncOutput([]);

    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes('Synced: 0 added, 0 updated, 0 skipped'));
  });
  // #endregion

  // #region TEST_CASE_FMT_6: dryRun empty
  it('formats empty entries in dryRun mode', () => {
    // purpose: dryRun with no files → dryRun summary
    // contract: Dry-run: no files written.

    const lines = formatSyncOutput([], { dryRun: true });

    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes('Dry-run: no files written.'));
  });
  // #endregion

  // #region TEST_CASE_FMT_7: output order matches input
  it('preserves input order in output', () => {
    // purpose: entries order → output line order
    // contract: first entry is first line, last entry is before summary

    const entries = [
      makeEntry('z.xml', 'unchanged'),
      makeEntry('a.xml', 'unchanged'),
      makeEntry('m.xml', 'unchanged'),
    ];

    const lines = formatSyncOutput(entries);

    // lines 0,1,2 correspond to z, a, m (before summary)
    assert.ok(lines[0].includes('z.xml'));
    assert.ok(lines[1].includes('a.xml'));
    assert.ok(lines[2].includes('m.xml'));
    // line 3 is the summary
    assert.ok(lines[3].includes('Synced:'));
  });
  // #endregion
});
