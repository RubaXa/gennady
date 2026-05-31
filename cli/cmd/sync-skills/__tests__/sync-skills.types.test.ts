// @file: Type validation tests for SyncSkills types — SyncSkillsResult, constants
// @consumers: SyncSkillsOptions, SyncSkillsFileEntry, SyncSkillsResult, SyncSkillsFileStatus
// @tasks: TSK-57

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SyncSkillsResult,
  ERR_SKILLS_SOURCE_NOT_FOUND,
  ERR_SKILLS_SKILL_NOT_FOUND,
} from '../sync-skills.types.ts';
import type {
  SyncSkillsFileEntry,
  SyncSkillsOptions,
  SyncSkillsFileStatus,
} from '../sync-skills.types.ts';

// #region SyncSkillsResult — getters

describe('SyncSkillsResult', () => {
  it('added getter returns only added entries', () => {
    const entries: SyncSkillsFileEntry[] = [
      { skillName: 'a', relativePath: 'f1.md', status: 'added', sourceSize: 10 },
      { skillName: 'b', relativePath: 'f2.md', status: 'updated', sourceSize: 20, targetSize: 15 },
    ];

    const result = new SyncSkillsResult(entries);

    assert.equal(result.added.length, 1);
    assert.equal(result.added[0].skillName, 'a');
  });

  it('updated getter returns only updated entries', () => {
    const entries: SyncSkillsFileEntry[] = [
      { skillName: 'a', relativePath: 'f1.md', status: 'updated', sourceSize: 10, targetSize: 5 },
      { skillName: 'b', relativePath: 'f2.md', status: 'updated', sourceSize: 20, targetSize: 10 },
      {
        skillName: 'c',
        relativePath: 'f3.md',
        status: 'unchanged',
        sourceSize: 30,
        targetSize: 30,
      },
    ];

    const result = new SyncSkillsResult(entries);

    assert.equal(result.updated.length, 2);
  });

  it('deleted getter returns only deleted entries', () => {
    const entries: SyncSkillsFileEntry[] = [
      { skillName: 'a', relativePath: 'f1.md', status: 'added', sourceSize: 10 },
      { skillName: 'b', relativePath: '', status: 'deleted' },
    ];

    const result = new SyncSkillsResult(entries);

    assert.equal(result.deleted.length, 1);
    assert.equal(result.deleted[0].skillName, 'b');
  });

  it('unchanged getter returns only unchanged entries', () => {
    const entries: SyncSkillsFileEntry[] = [
      {
        skillName: 'a',
        relativePath: 'f1.md',
        status: 'unchanged',
        sourceSize: 10,
        targetSize: 10,
      },
      {
        skillName: 'a',
        relativePath: 'f2.md',
        status: 'unchanged',
        sourceSize: 20,
        targetSize: 20,
      },
      { skillName: 'b', relativePath: 'f3.md', status: 'added', sourceSize: 30 },
    ];

    const result = new SyncSkillsResult(entries);

    assert.equal(result.unchanged.length, 2);
  });

  it('deleteFailed getter returns only deleteFailed entries', () => {
    const entries: SyncSkillsFileEntry[] = [
      { skillName: 'a', relativePath: '', status: 'deleteFailed', errorCode: 'EACCES' },
      { skillName: 'b', relativePath: '', status: 'deleted' },
    ];

    const result = new SyncSkillsResult(entries);

    assert.equal(result.deleteFailed.length, 1);
    assert.equal(result.deleteFailed[0].errorCode, 'EACCES');
  });

  it('entries are accessible as array', () => {
    const entries: SyncSkillsFileEntry[] = [
      { skillName: 'a', relativePath: 'f1.md', status: 'added', sourceSize: 10 },
    ];

    const result = new SyncSkillsResult(entries);

    assert.equal(result.entries.length, 1);
    assert.deepStrictEqual(result.entries, entries);
  });
});

// #endregion

// #region SyncSkillsResult — summary

describe('SyncSkillsResult summary', () => {
  it('produces summary with correct counts', () => {
    const entries: SyncSkillsFileEntry[] = [
      { skillName: 'a', relativePath: 'f1.md', status: 'added', sourceSize: 10 },
      { skillName: 'a', relativePath: 'f2.md', status: 'added', sourceSize: 20 },
      { skillName: 'b', relativePath: 'f3.md', status: 'updated', sourceSize: 30, targetSize: 25 },
      {
        skillName: 'c',
        relativePath: 'f4.md',
        status: 'unchanged',
        sourceSize: 40,
        targetSize: 40,
      },
      {
        skillName: 'c',
        relativePath: 'f5.md',
        status: 'unchanged',
        sourceSize: 50,
        targetSize: 50,
      },
      {
        skillName: 'c',
        relativePath: 'f6.md',
        status: 'unchanged',
        sourceSize: 60,
        targetSize: 60,
      },
      { skillName: 'd', relativePath: '', status: 'deleted' },
    ];

    const result = new SyncSkillsResult(entries);

    assert.match(result.summary, /Synced: 2 added, 1 updated, 3 skipped, 1 deleted/);
  });

  it('dryRunSummary returns constant message', () => {
    const result = new SyncSkillsResult([]);

    assert.equal(result.dryRunSummary, 'Dry-run: no files written.');
  });

  it('summary includes deleteFailed count when present', () => {
    const entries: SyncSkillsFileEntry[] = [
      { skillName: 'a', relativePath: '', status: 'deleteFailed', errorCode: 'EACCES' },
      { skillName: 'b', relativePath: '', status: 'deleteFailed', errorCode: 'EBUSY' },
    ];

    const result = new SyncSkillsResult(entries);

    assert.match(
      result.summary,
      /Synced: 0 added, 0 updated, 0 skipped, 0 deleted, 2 delete failed/
    );
  });

  it('summary omits deleteFailed when count is 0', () => {
    const entries: SyncSkillsFileEntry[] = [
      { skillName: 'a', relativePath: 'f1.md', status: 'added', sourceSize: 10 },
    ];

    const result = new SyncSkillsResult(entries);

    assert.match(result.summary, /Synced: 1 added, 0 updated, 0 skipped, 0 deleted$/);
  });
});

// #endregion

// #region Constants

describe('SyncSkills constants', () => {
  it('ERR_SKILLS_SOURCE_NOT_FOUND is defined', () => {
    assert.equal(ERR_SKILLS_SOURCE_NOT_FOUND, 'ERR_SKILLS_SOURCE_NOT_FOUND');
  });

  it('ERR_SKILLS_SKILL_NOT_FOUND is defined', () => {
    assert.equal(ERR_SKILLS_SKILL_NOT_FOUND, 'ERR_SKILLS_SKILL_NOT_FOUND');
  });
});

// #endregion

// #region Type structural checks

describe('SyncSkillsFileEntry structural check', () => {
  it('accepts entries with all optional fields', () => {
    const e: SyncSkillsFileEntry = {
      skillName: 'test',
      relativePath: 'test.md',
      status: 'added',
      sourceSize: 100,
      targetSize: undefined,
      errorCode: undefined,
    };

    assert.equal(e.skillName, 'test');
    assert.equal(e.status, 'added');
  });

  it('accepts deleteFailed entry with errorCode', () => {
    const e: SyncSkillsFileEntry = {
      skillName: 'orphan',
      relativePath: '',
      status: 'deleteFailed',
      errorCode: 'EBUSY',
    };

    assert.equal(e.status, 'deleteFailed');
    assert.equal(e.errorCode, 'EBUSY');
  });

  it('SyncSkillsFileStatus supports all variants', () => {
    const statuses: SyncSkillsFileStatus[] = [
      'added',
      'updated',
      'deleted',
      'unchanged',
      'deleteFailed',
    ];

    assert.equal(statuses.length, 5);
    assert.ok(statuses.includes('added'));
    assert.ok(statuses.includes('updated'));
    assert.ok(statuses.includes('deleted'));
    assert.ok(statuses.includes('unchanged'));
    assert.ok(statuses.includes('deleteFailed'));
  });
});

// #endregion

// #region SyncSkillsOptions structural check

describe('SyncSkillsOptions structural check', () => {
  it('requires sourceDir and targetDir', () => {
    const opts: SyncSkillsOptions = {
      sourceDir: '/path/to/source',
      targetDir: '/path/to/target',
    };

    assert.equal(opts.sourceDir, '/path/to/source');
    assert.equal(opts.targetDir, '/path/to/target');
  });

  it('accepts optional skillNames and dryRun', () => {
    const opts: SyncSkillsOptions = {
      sourceDir: '/path/to/source',
      targetDir: '/path/to/target',
      skillNames: ['sdd-audit', 'sdd-check'],
      dryRun: true,
    };

    assert.deepStrictEqual(opts.skillNames, ['sdd-audit', 'sdd-check']);
    assert.equal(opts.dryRun, true);
  });
});

// #endregion
