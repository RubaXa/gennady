// @file: Unit tests for InventorySyncCheck's reverse sweep — deferred-implementation marker parsing and error suppression.
// @consumers: InventorySyncCheck
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeferredEntities, reverseUnimplemented } from '../inventory-sync.check.ts';

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

  it('reports a deferred-but-unimplemented entity as informational, not an error', () => {
    const deferredEntities = new Map([['Later', 'TSK-42']]);
    const result = reverseUnimplemented(['Later'], new Set(), 'spec.md', deferredEntities);
    assert.deepStrictEqual(result.errors, []);
    assert.deepStrictEqual(result.deferred, [{ name: 'Later', taskId: 'TSK-42' }]);
  });

  it('an implemented entity with a deferred marker is neither an error nor reported deferred', () => {
    const deferredEntities = new Map([['AlreadyBuilt', 'TSK-1']]);
    const result = reverseUnimplemented(
      ['AlreadyBuilt'],
      new Set(['AlreadyBuilt']),
      'spec.md',
      deferredEntities
    );
    assert.deepStrictEqual(result.errors, []);
    assert.deepStrictEqual(result.deferred, []);
  });

  it('mixes a deferred entity and a genuinely missing one correctly', () => {
    const deferredEntities = new Map([['Later', 'TSK-42']]);
    const result = reverseUnimplemented(['Later', 'Ghost'], new Set(), 'spec.md', deferredEntities);
    assert.strictEqual(result.errors.length, 1);
    assert.ok(result.errors[0]?.message.includes('Ghost'));
    assert.deepStrictEqual(result.deferred, [{ name: 'Later', taskId: 'TSK-42' }]);
  });
});
