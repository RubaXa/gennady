// @file: Unit tests for SyncSkillsFormatter — format()
// @consumers: SyncSkillsFormatter
// @tasks: TSK-57

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { format, type SyncSkillsFormatOptions } from '../sync-skills-formatter.ts';
import type { SyncSkillsFileEntry } from '../sync-skills.types.ts';

// #region HELPERS

function entry(
  skillName: string,
  relativePath: string,
  status: SyncSkillsFileEntry['status'],
  opts?: { sourceSize?: number; targetSize?: number; errorCode?: string }
): SyncSkillsFileEntry {
  return {
    skillName,
    relativePath,
    status,
    sourceSize: opts?.sourceSize,
    targetSize: opts?.targetSize,
    errorCode: opts?.errorCode,
  };
}

function fmt(entries: SyncSkillsFileEntry[], opts?: SyncSkillsFormatOptions): string[] {
  return format(entries, opts);
}

// #endregion

// #region format — empty / summary

describe('format', () => {
  it('returns only summary for empty entries', () => {
    const lines = fmt([]);

    assert.equal(lines.length, 1);
    assert.equal(lines[0], 'Synced: 0 added, 0 updated, 0 skipped, 0 deleted');
  });

  it('returns dryRun summary for empty entries in dry-run mode', () => {
    const lines = fmt([], { dryRun: true });

    assert.equal(lines.length, 1);
    assert.equal(lines[0], 'Dry-run: no files written.');
  });
});

// #endregion

// #region format — all statuses in normal mode

describe('format all statuses normal mode', () => {
  it('formats added, updated, deleted, unchanged with correct markers', () => {
    const entries = [
      entry('sdd-audit', 'SKILL.md', 'added', { sourceSize: 100 }),
      entry('sdd-execute', 'SKILL.md', 'updated', { sourceSize: 200, targetSize: 150 }),
      entry('sdd-old', '', 'deleted'),
      entry('sdd-check', 'SKILL.md', 'unchanged', { sourceSize: 300, targetSize: 300 }),
    ];

    const lines = fmt(entries);

    // Groups sorted by dominant status rank: added(0), updated(1), deleted(2), unchanged(4)
    assert.ok(lines[0].includes('+ sdd-audit/'), 'added header');
    assert.ok(lines[1].includes('SKILL.md'), 'added file line');

    assert.ok(lines.some((l) => l.includes('~ sdd-execute/')), 'updated header');
    assert.ok(lines.some((l) => l.includes('- sdd-old/')), 'deleted header');

    const unchangedLine = lines.find((l) => l.includes('= sdd-check/'));
    assert.ok(unchangedLine, 'unchanged header exists');
    assert.ok(unchangedLine!.includes('(unchanged)'));

    const summaryLine = lines[lines.length - 1];
    assert.match(summaryLine, /Synced: 1 added, 1 updated, 1 skipped, 1 deleted/);
  });
});

// #endregion

// #region format — grouping and markers

describe('format grouping', () => {
  it('groups entries by skillName', () => {
    const entries = [
      entry('sdd-audit', 'README.md', 'added', { sourceSize: 100 }),
      entry('sdd-audit', 'SKILL.md', 'added', { sourceSize: 200 }),
    ];

    const lines = fmt(entries);

    // One group header for sdd-audit
    const headers = lines.filter((l) => l.includes('+ sdd-audit/'));
    assert.equal(headers.length, 1);

    // Two file lines
    const fileLines = lines.filter((l) => !l.startsWith('  ') || l.includes('SKILL.md') || l.includes('README.md'));
    const filesInOutput = lines.filter((l) => l.includes('SKILL.md') || l.includes('README.md'));
    assert.equal(filesInOutput.length, 2);
  });

  it('sorts files within group by relativePath', () => {
    const entries = [
      entry('sdd-audit', 'NOTES.md', 'added', { sourceSize: 100 }),
      entry('sdd-audit', 'SKILL.md', 'added', { sourceSize: 200 }),
      entry('sdd-audit', 'README.md', 'added', { sourceSize: 300 }),
    ];

    const lines = fmt(entries);

    const fileIndexes = lines
      .map((l, i) => (l.includes('NOTES.md') || l.includes('README.md') || l.includes('SKILL.md') ? i : -1))
      .filter((i) => i >= 0);

    assert.ok(fileIndexes[0] < fileIndexes[1]);
    assert.ok(fileIndexes[1] < fileIndexes[2]);
  });

  it('uses correct group markers for each status', () => {
    const addedEntries = [entry('skills-a', 'f.md', 'added', { sourceSize: 10 })];
    const updatedEntries = [entry('skills-b', 'f.md', 'updated', { sourceSize: 10, targetSize: 5 })];
    const deletedEntries = [entry('skills-c', '', 'deleted')];
    const unchangedEntries = [entry('skills-d', 'f.md', 'unchanged', { sourceSize: 10, targetSize: 10 })];

    assert.ok(fmt(addedEntries)[0].includes('+ skills-a/'));
    assert.ok(fmt(updatedEntries)[0].includes('~ skills-b/'));
    assert.ok(fmt(deletedEntries)[0].includes('- skills-c/'));
    assert.ok(fmt(unchangedEntries)[0].includes('= skills-d/'));
  });

  it('deleted skill shows files when relativePath is not empty', () => {
    const entries = [
      entry('sdd-old', '', 'deleted'),
      entry('sdd-old', 'SKILL.md', 'deleted'),
      entry('sdd-old', 'README.md', 'deleted'),
    ];

    const lines = fmt(entries);

    assert.ok(lines[0].includes('- sdd-old/'));
    const fileLines = lines.slice(1, 3);
    assert.equal(fileLines.length, 2);
    assert.ok(fileLines.some((l) => l.includes('README.md')));
    assert.ok(fileLines.some((l) => l.includes('SKILL.md')));
  });
});

// #endregion

// #region format — dry-run labels

describe('format dry-run', () => {
  it('uses (would add) label for added entries', () => {
    const entries = [entry('sdd-audit', 'SKILL.md', 'added', { sourceSize: 100 })];

    const lines = fmt(entries, { dryRun: true });

    assert.ok(lines[0].includes('+ sdd-audit/'));
    assert.ok(lines[1].includes('(would add)'));
  });

  it('uses (would update) label for updated entries', () => {
    const entries = [entry('sdd-execute', 'SKILL.md', 'updated', { sourceSize: 200, targetSize: 150 })];

    const lines = fmt(entries, { dryRun: true });

    assert.ok(lines[0].includes('~ sdd-execute/'));
    assert.ok(lines[1].includes('(would update)'));
  });

  it('uses (would delete) label for deleted entries', () => {
    const entries = [entry('sdd-old', '', 'deleted')];

    const lines = fmt(entries, { dryRun: true });

    assert.ok(lines[0].includes('- sdd-old/'));
    assert.ok(lines[0].includes('(would delete)'));
  });

  it('uses (unchanged, skip) label for unchanged entries', () => {
    const entries = [entry('sdd-check', 'SKILL.md', 'unchanged', { sourceSize: 300, targetSize: 300 })];

    const lines = fmt(entries, { dryRun: true });

    assert.ok(lines[0].includes('= sdd-check/'));
    assert.ok(lines[0].includes('(unchanged, skip)'));
  });

  it('dry-run summary line is "Dry-run: no files written."', () => {
    const entries = [
      entry('a', 'f.md', 'added', { sourceSize: 10 }),
      entry('b', 'f.md', 'updated', { sourceSize: 10, targetSize: 5 }),
      entry('c', '', 'deleted'),
    ];

    const lines = fmt(entries, { dryRun: true });
    const lastLine = lines[lines.length - 1];

    assert.equal(lastLine, 'Dry-run: no files written.');
  });

  it('dry-run with all statuses shows correct labels', () => {
    const entries = [
      entry('a-skill', 'f1.md', 'added', { sourceSize: 10 }),
      entry('b-skill', 'f2.md', 'updated', { sourceSize: 20, targetSize: 15 }),
      entry('c-skill', '', 'deleted'),
      entry('d-skill', 'f3.md', 'unchanged', { sourceSize: 30, targetSize: 30 }),
    ];

    const lines = fmt(entries, { dryRun: true });

    assert.ok(lines.some((l) => l.includes('(would add)')));
    assert.ok(lines.some((l) => l.includes('(would update)')));
    assert.ok(lines.some((l) => l.includes('(would delete)')));
    assert.ok(lines.some((l) => l.includes('(unchanged, skip)')));
    assert.ok(lines.some((l) => l.includes('Dry-run: no files written.')));
  });
});

// #endregion

// #region format — deleteFailed

describe('format deleteFailed', () => {
  it('shows delete failed with error code', () => {
    const entries = [entry('my-skill', '', 'deleteFailed', { errorCode: 'EACCES' })];

    const lines = fmt(entries);

    assert.ok(lines[0].includes('! my-skill/'));
    assert.ok(lines[0].includes('(delete failed: EACCES)'));
  });

  it('deleteFailed with UNKNOWN code when errorCode missing', () => {
    const entries = [entry('my-skill', '', 'deleteFailed')];

    const lines = fmt(entries);

    assert.ok(lines[0].includes('(delete failed: UNKNOWN)'));
  });

  it('summary includes delete failed count', () => {
    const entries = [
      entry('a', 'f.md', 'added', { sourceSize: 10 }),
      entry('b', '', 'deleteFailed', { errorCode: 'EACCES' }),
    ];

    const lines = fmt(entries);

    const lastLine = lines[lines.length - 1];
    assert.match(lastLine, /Synced: 1 added, 0 updated, 0 skipped, 0 deleted, 1 delete failed/);
  });
});

// #endregion

// #region format — dynamic padding

describe('format dynamic padding', () => {
  it('applies padding based on longest skill name', () => {
    const entries = [
      entry('s', 'f.md', 'unchanged', { sourceSize: 10, targetSize: 10 }),
      entry('very-long-skill-name', 'f.md', 'unchanged', { sourceSize: 10, targetSize: 10 }),
    ];

    const lines = fmt(entries);

    // Longest header is "  = very-long-skill-name/" (23 chars), so all unchanged
    // entries are padded to at least labelColumn = maxPrefixLen + 4 = 27
    const shortHeaderLine = lines.find((l) => l.includes('= s/'));
    const longHeaderLine = lines.find((l) => l.includes('= very-long-skill-name/'));

    assert.ok(shortHeaderLine, 'short skill header exists');
    assert.ok(longHeaderLine, 'long skill header exists');
    assert.ok(shortHeaderLine!.length >= longHeaderLine!.length);
  });
});

// #endregion

// #region format — summary line

describe('format summary line', () => {
  it('produces correct summary counts', () => {
    const entries = [
      entry('a', 'f1.md', 'added', { sourceSize: 10 }),
      entry('a', 'f2.md', 'added', { sourceSize: 20 }),
      entry('b', 'f3.md', 'updated', { sourceSize: 30, targetSize: 25 }),
      entry('c', 'f4.md', 'unchanged', { sourceSize: 40, targetSize: 40 }),
      entry('c', 'f5.md', 'unchanged', { sourceSize: 50, targetSize: 50 }),
      entry('d', '', 'deleted'),
    ];

    const lines = fmt(entries);
    const lastLine = lines[lines.length - 1];

    assert.equal(lastLine, 'Synced: 2 added, 1 updated, 2 skipped, 1 deleted');
  });

  it('skipped count reflects unchanged entries', () => {
    const entries = [
      entry('a', 'f1.md', 'unchanged', { sourceSize: 10, targetSize: 10 }),
      entry('a', 'f2.md', 'unchanged', { sourceSize: 20, targetSize: 20 }),
      entry('a', 'f3.md', 'unchanged', { sourceSize: 30, targetSize: 30 }),
    ];

    const lines = fmt(entries);
    const lastLine = lines[lines.length - 1];

    assert.equal(lastLine, 'Synced: 0 added, 0 updated, 3 skipped, 0 deleted');
  });
});

// #endregion
