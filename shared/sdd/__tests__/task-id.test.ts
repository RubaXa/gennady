// @file: Unit tests for the v2 Task-ID grammar, project-wide collection, and conflict detection.
// @consumers: task-id
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validateTaskId,
  collectTaskIds,
  checkIdConflicts,
  findPrefixClashes,
  describeIdConflict,
  suggestTaskId,
  SLUG_MAX_LEN,
} from '../task-id.ts';

describe('validateTaskId', () => {
  it('accepts a well-formed <ACR>-<slug>', () => {
    assert.strictEqual(validateTaskId('GAT-login'), null);
    assert.strictEqual(validateTaskId('TSK-156'), null);
    assert.strictEqual(validateTaskId('CLI2-a1'), null);
  });

  it('accepts a multi-word hyphenated slug within the length cap', () => {
    assert.strictEqual(validateTaskId('GAT-a-b'), null); // 3-char slug
  });

  it('rejects a lowercase-starting ACR', () => {
    assert.match(validateTaskId('gat-login') ?? '', /grammar/);
  });

  it('rejects an ACR containing a hyphen or other punctuation', () => {
    assert.match(validateTaskId('GA_T-login') ?? '', /grammar/);
  });

  it('rejects an uppercase or empty slug', () => {
    assert.match(validateTaskId('GAT-Login') ?? '', /grammar/);
    assert.match(validateTaskId('GAT-') ?? '', /grammar/);
  });

  it('rejects a missing hyphen entirely', () => {
    assert.match(validateTaskId('GATLOGIN') ?? '', /grammar/);
  });

  it('accepts a slug at exactly the 8-char cap', () => {
    const id = `GAT-${'a'.repeat(SLUG_MAX_LEN)}`;
    assert.strictEqual(id.slice(id.indexOf('-') + 1).length, 8);
    assert.strictEqual(validateTaskId(id), null);
  });

  it('rejects a slug one character past the cap (9 chars)', () => {
    const id = `GAT-${'a'.repeat(SLUG_MAX_LEN + 1)}`;
    assert.match(validateTaskId(id) ?? '', /9-char/);
  });

  it('counts hyphens toward the slug length cap', () => {
    // "abcd-efgh" = 9 chars including the internal hyphen — over the cap.
    assert.match(validateTaskId('GAT-abcd-efgh') ?? '', /> 8/);
  });
});

describe('checkIdConflicts', () => {
  it('reports no conflicts against a disjoint existing set', () => {
    assert.deepStrictEqual(checkIdConflicts('GAT-login', ['CLI-foo', 'TSK-1']), []);
  });

  it('flags an exact duplicate', () => {
    const conflicts = checkIdConflicts('GAT-login', ['GAT-login']);
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0]?.kind, 'duplicate');
    assert.strictEqual(conflicts[0]?.with, 'GAT-login');
  });

  it('flags a prefix conflict — new id is a hyphen-prefix of an existing one (gates vs gates-v2)', () => {
    const conflicts = checkIdConflicts('GAT-gates', ['GAT-gates-v2']);
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0]?.kind, 'prefix');
  });

  it('flags a prefix conflict in the other direction — existing id is a hyphen-prefix of the new one', () => {
    const conflicts = checkIdConflicts('GAT-gates-v2', ['GAT-gates']);
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0]?.kind, 'prefix');
  });

  it('does NOT flag a bare numeric-suffix relationship without a hyphen boundary (TSK-1 vs TSK-10)', () => {
    assert.deepStrictEqual(checkIdConflicts('TSK-1', ['TSK-10']), []);
    assert.deepStrictEqual(checkIdConflicts('TSK-10', ['TSK-1']), []);
  });
});

describe('findPrefixClashes', () => {
  it('finds no clashes in a prefix-free set', () => {
    assert.deepStrictEqual(findPrefixClashes(['GAT-a', 'GAT-b', 'TSK-1', 'TSK-10']), []);
  });

  it('finds a clash once, either direction, for gates vs gates-v2', () => {
    assert.deepStrictEqual(findPrefixClashes(['GAT-gates', 'GAT-gates-v2']), [
      ['GAT-gates', 'GAT-gates-v2'],
    ]);
    assert.deepStrictEqual(findPrefixClashes(['GAT-gates-v2', 'GAT-gates']), [
      ['GAT-gates-v2', 'GAT-gates'],
    ]);
  });
});

describe('describeIdConflict', () => {
  it('names the duplicate', () => {
    assert.match(
      describeIdConflict('GAT-x', { with: 'GAT-x', kind: 'duplicate' }),
      /already exists/
    );
  });

  it('names the prefix culprit', () => {
    const msg = describeIdConflict('GAT-gates', { with: 'GAT-gates-v2', kind: 'prefix' });
    assert.match(msg, /GAT-gates-v2/);
    assert.match(msg, /prefix conflict/);
  });
});

describe('suggestTaskId', () => {
  it('recovers a grammar-legal id from a lowercase ACR + overlong slug', () => {
    const s = suggestTaskId('gat-a-very-long-slug', []);
    assert.ok(s, 'expected a suggestion');
    assert.strictEqual(validateTaskId(s as string), null);
  });

  it('finds a free variant when the cleaned-up candidate still collides', () => {
    const s = suggestTaskId('GAT-login', ['GAT-login']);
    assert.ok(s, 'expected a suggestion');
    assert.strictEqual(validateTaskId(s as string), null);
    assert.deepStrictEqual(checkIdConflicts(s as string, ['GAT-login']), []);
  });

  it('returns null when no ACR at all can be recovered', () => {
    assert.strictEqual(suggestTaskId('---', []), null);
  });
});

describe('collectTaskIds', () => {
  let root: string;

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'task-id-collect-'));

    // v2 ticket file: id lives in the filename AND (once filled) the Meta field.
    mkdirSync(join(root, 'specs', 'backend', 'auth'), { recursive: true });
    writeFileSync(
      join(root, 'specs', 'backend', 'auth', 'auth.task.GAT-login.md'),
      [
        '<!--SECTION:META-->',
        '- **Task-ID:** GAT-login',
        '<!--/SECTION:META-->',
        '<!--SECTION:EXECUTION_LOG-->',
        '- pending',
        '<!--/SECTION:EXECUTION_LOG-->',
      ].join('\n')
    );

    // legacy v1 ticket: plain headers, no SECTION anchors, filename uses "-N" not ".ID".
    mkdirSync(join(root, 'tasks', 'cli'), { recursive: true });
    writeFileSync(
      join(root, 'tasks', 'cli', 'cli.task-42.md'),
      ['## Meta', '- **Task-ID:** TSK-42', '', '## Execution Log', '- pending'].join('\n')
    );

    // an unfilled scaffold placeholder must never be counted as a real id.
    mkdirSync(join(root, 'specs', 'backend', 'other'), { recursive: true });
    writeFileSync(
      join(root, 'specs', 'backend', 'other', 'other.task.PLACEHOLDER.md'),
      [
        '<!--SECTION:META-->',
        '- **Task-ID:** <ACRONYM>-<slug>',
        '<!--/SECTION:META-->',
        '<!--SECTION:EXECUTION_LOG-->',
        '- pending',
        '<!--/SECTION:EXECUTION_LOG-->',
      ].join('\n')
    );

    // fixtures under __tests__ must never pollute the real project id space.
    mkdirSync(join(root, 'specs', '__tests__'), { recursive: true });
    writeFileSync(
      join(root, 'specs', '__tests__', 'fixture.task.SHOULD-NOT-COUNT.md'),
      '<!--SECTION:META-->\n- **Task-ID:** SHOULD-NOT-COUNT\n<!--/SECTION:META-->\n'
    );
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('collects the v2 filename id and the legacy Meta-field id, deterministically deduplicated', () => {
    const ids = collectTaskIds(root);
    assert.ok(ids.includes('GAT-login'));
    assert.ok(ids.includes('TSK-42'));
    assert.strictEqual(new Set(ids).size, ids.length, 'no duplicate entries');
  });

  it('never counts an unfilled <ACRONYM>-<slug> scaffold placeholder', () => {
    const ids = collectTaskIds(root);
    assert.ok(!ids.some((id) => id.includes('<')));
  });

  it('skips __tests__ fixture directories, same convention as sdd-check', () => {
    const ids = collectTaskIds(root);
    assert.ok(!ids.includes('SHOULD-NOT-COUNT'));
  });

  it('returns [] for an empty/nonexistent root', () => {
    assert.deepStrictEqual(collectTaskIds(join(root, 'no-such-dir')), []);
  });
});
