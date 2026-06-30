// @file: Unit tests for parseEntityInventory — extract declared entity names from a module spec ## 3 table.
// @consumers: inventory

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseEntityInventory } from '../inventory.ts';

const spec = (rows: string): string =>
  `<!--SECTION:ENTITY_INVENTORY-->\n## 3. Entity Inventory\n\n| Name | Type | Purpose |\n| --- | --- | --- |\n${rows}\n<!--/SECTION:ENTITY_INVENTORY-->`;

describe('parseEntityInventory', () => {
  it('extracts names, strips backticks, drops the header row', () => {
    const got = parseEntityInventory(spec('| `Foo` | Service | x |\n| `bar` | Utility | y |'));
    assert.deepStrictEqual(got, ['Foo', 'bar']);
  });

  it('returns [] when there is no ENTITY_INVENTORY section', () => {
    assert.deepStrictEqual(parseEntityInventory('# Module\n\nno inventory here'), []);
  });

  it('ignores the separator row', () => {
    const got = parseEntityInventory(spec('| `Only` | Type | z |'));
    assert.deepStrictEqual(got, ['Only']);
  });
});
