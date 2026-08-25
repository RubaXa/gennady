// @file: Unit tests for InventorySyncCheck's reverse sweep — deferred-implementation marker parsing and error suppression.
// @consumers: InventorySyncCheck
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDeferredEntities,
  reverseUnimplemented,
  checkDeferral,
  type DeferralCheck,
} from '../inventory-sync.check.ts';

/** A valid deferral to `TSK-42`, for the reverse-sweep tests that don't exercise validation. */
const validDeferral = (taskId: string): DeferralCheck => ({ taskId, valid: true });

const spec = (rows: string): string =>
  `<!--SECTION:ENTITY_INVENTORY-->\n## 3. Entity Inventory\n\n| Name | Type | Purpose |\n| --- | --- | --- |\n${rows}\n<!--/SECTION:ENTITY_INVENTORY-->`;

describe('parseDeferredEntities', () => {
  it('extracts the Task-ID from a table row carrying the Deferred Implementation marker', () => {
    const got = parseDeferredEntities(
      spec('| `LaterEntity` | Service | Deferred Implementation: TSK-42 — ships next batch |')
    );
    assert.deepStrictEqual([...got], [['LaterEntity', 'TSK-42']]);
  });

  it('extracts the Task-ID from a bullet-list row', () => {
    const body = [
      '<!--SECTION:ENTITY_INVENTORY-->',
      '## 3. Entity Inventory',
      '- `LaterEntity` — Deferred Implementation: TSK-42, ships next batch.',
      '<!--/SECTION:ENTITY_INVENTORY-->',
    ].join('\n');
    assert.deepStrictEqual([...parseDeferredEntities(body)], [['LaterEntity', 'TSK-42']]);
  });

  it('leaves unmarked rows out of the result', () => {
    const got = parseDeferredEntities(
      spec(
        '| `Now` | Service | built already |\n| `Later` | Service | Deferred Implementation: TSK-9 |'
      )
    );
    assert.deepStrictEqual([...got], [['Later', 'TSK-9']]);
  });

  it('returns an empty map when there is no ENTITY_INVENTORY section', () => {
    assert.deepStrictEqual([...parseDeferredEntities('# Module\n\nno inventory here')], []);
  });
});

describe('reverseUnimplemented', () => {
  it('flags an unimplemented entity with no deferred marker (unchanged behavior)', () => {
    const result = reverseUnimplemented(['Ghost'], new Set(), 'spec.md');
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0]?.code, 'ERR_CLI_LINT_INVENTORY_UNIMPLEMENTED');
    assert.ok(result.errors[0]?.message.includes('Ghost'));
    assert.deepStrictEqual(result.deferred, []);
  });

  it('does not flag an implemented entity', () => {
    const result = reverseUnimplemented(['Built'], new Set(['Built']), 'spec.md');
    assert.deepStrictEqual(result.errors, []);
    assert.deepStrictEqual(result.deferred, []);
  });

  it('reports a VALIDLY deferred-but-unimplemented entity as informational, not an error', () => {
    const deferredEntities = new Map([['Later', validDeferral('TSK-42')]]);
    const result = reverseUnimplemented(['Later'], new Set(), 'spec.md', deferredEntities);
    assert.deepStrictEqual(result.errors, []);
    assert.deepStrictEqual(result.deferred, [{ name: 'Later', taskId: 'TSK-42' }]);
  });

  it('an INVALID deferral is drift, not an exemption — errors with the reason, never reported deferred', () => {
    const deferredEntities = new Map([
      ['Later', { taskId: 'TSK-99', valid: false, reason: 'тикет TSK-99 не найден в дереве' }],
    ]);
    const result = reverseUnimplemented(['Later'], new Set(), 'spec.md', deferredEntities);
    assert.strictEqual(result.errors.length, 1);
    assert.match(result.errors[0]?.message ?? '', /не валиден|not valid/i);
    assert.match(result.errors[0]?.message ?? '', /TSK-99/);
    assert.deepStrictEqual(result.deferred, []);
  });

  it('an implemented entity with a deferred marker is neither an error nor reported deferred', () => {
    const deferredEntities = new Map([['AlreadyBuilt', validDeferral('TSK-1')]]);
    const result = reverseUnimplemented(
      ['AlreadyBuilt'],
      new Set(['AlreadyBuilt']),
      'spec.md',
      deferredEntities
    );
    assert.deepStrictEqual(result.errors, []);
    assert.deepStrictEqual(result.deferred, []);
  });

  it('mixes a valid deferral and a genuinely missing one correctly', () => {
    const deferredEntities = new Map([['Later', validDeferral('TSK-42')]]);
    const result = reverseUnimplemented(['Later', 'Ghost'], new Set(), 'spec.md', deferredEntities);
    assert.strictEqual(result.errors.length, 1);
    assert.ok(result.errors[0]?.message.includes('Ghost'));
    assert.deepStrictEqual(result.deferred, [{ name: 'Later', taskId: 'TSK-42' }]);
  });
});

describe('checkDeferral', () => {
  const tickets = [
    { taskId: 'TSK-10', status: '[ ] TODO', scope: 'cli' },
    { taskId: 'TSK-11', status: '[x] DONE', scope: 'cli' },
    { taskId: 'TSK-12', status: '[ ] TODO', scope: 'other' },
    { taskId: 'TSK-13', status: '[~] IN_PROGRESS', scope: 'cli' },
    { taskId: 'TSK-14', status: '[!] BLOCKED', scope: 'cli' },
    { taskId: 'TSK-15', status: '[-] CANCELLED', scope: 'cli' },
    { taskId: 'TSK-16', status: '', scope: 'cli' },
    { taskId: 'TSK-17', status: '[ ] TODO', scope: null },
  ];

  it('valid when the ticket exists, is ACTIVE (TODO), and owns the spec scope', () => {
    assert.deepStrictEqual(checkDeferral('TSK-10', tickets, 'cli'), {
      taskId: 'TSK-10',
      valid: true,
    });
  });

  it('valid for an IN_PROGRESS owner — an active ticket is building the entity', () => {
    assert.strictEqual(checkDeferral('TSK-13', tickets, 'cli').valid, true);
  });

  it('invalid for a BLOCKED owner — stalled, not actively building (strict: only TODO/IN_PROGRESS)', () => {
    const r = checkDeferral('TSK-14', tickets, 'cli');
    assert.strictEqual(r.valid, false);
    assert.match(r.reason ?? '', /не в активном статусе/);
  });

  it('invalid when the ticket does not exist', () => {
    const r = checkDeferral('TSK-99', tickets, 'cli');
    assert.strictEqual(r.valid, false);
    assert.match(r.reason ?? '', /не найден/);
  });

  it('invalid when the ticket is DONE — a completed ticket cannot build a future entity', () => {
    const r = checkDeferral('TSK-11', tickets, 'cli');
    assert.strictEqual(r.valid, false);
    assert.match(r.reason ?? '', /не в активном статусе/);
  });

  it('invalid when the ticket is CANCELLED — it will never build the entity', () => {
    const r = checkDeferral('TSK-15', tickets, 'cli');
    assert.strictEqual(r.valid, false);
    assert.match(r.reason ?? '', /не в активном статусе/);
  });

  it('invalid when the status is unrecognized/empty — cannot confirm the ticket is active', () => {
    const r = checkDeferral('TSK-16', tickets, 'cli');
    assert.strictEqual(r.valid, false);
    assert.match(r.reason ?? '', /не распознан статус/);
  });

  it('invalid when the ticket belongs to a different scope', () => {
    const r = checkDeferral('TSK-12', tickets, 'cli');
    assert.strictEqual(r.valid, false);
    assert.match(r.reason ?? '', /скоуп/);
  });

  it('invalid when the spec scope is known but the ticket declares none', () => {
    const r = checkDeferral('TSK-17', tickets, 'cli');
    assert.strictEqual(r.valid, false);
    assert.match(r.reason ?? '', /не указан скоуп/);
  });

  it('scope check is skipped when the spec scope is unknown, but status still gates', () => {
    assert.strictEqual(checkDeferral('TSK-17', tickets, '').valid, true);
    assert.strictEqual(checkDeferral('TSK-11', tickets, '').valid, false);
  });
});
