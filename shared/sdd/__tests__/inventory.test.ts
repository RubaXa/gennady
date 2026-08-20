// @file: Unit tests for parseEntityInventory — extract declared entity names from a module spec ## 3 table.
// @consumers: inventory

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseEntityInventory, parseEntityRows } from '../inventory.ts';

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

describe('parseEntityRows', () => {
  it('parses a bare table body directly (no SECTION marker needed)', () => {
    const body = '| Name | Type | Purpose |\n| --- | --- | --- |\n| `Foo` | Service | x |';
    assert.deepStrictEqual(parseEntityRows(body), ['Foo']);
  });

  it('tolerates a trailing note line below the table', () => {
    const body =
      '| Name | Type | Purpose |\n| --- | --- | --- |\n| `Foo` | Service | x |\n' +
      'Ошибки: throw → EntityFoo';
    assert.deepStrictEqual(parseEntityRows(body), ['Foo']);
  });

  it('returns [] for a body with no table at all', () => {
    assert.deepStrictEqual(parseEntityRows('just prose, no table here'), []);
  });

  it('falls back to a `- `Name` — ...` bullet list when there is no table (real-world spec shape)', () => {
    const body = [
      '- `Todo` — Entity: id (UUID), title, completed.',
      '- `TodoFilter` — Value Object: All | Active | Completed.',
      '- `TodoStore` — Port: `list(filter)` · `add(title)`.',
    ].join('\n');
    assert.deepStrictEqual(parseEntityRows(body), ['Todo', 'TodoFilter', 'TodoStore']);
  });

  it('bullet fallback tolerates a trailing "Ошибки:" note line', () => {
    const body = '- `Foo` — Service: does x.\nОшибки: нет бросаемых доменных ошибок.';
    assert.deepStrictEqual(parseEntityRows(body), ['Foo']);
  });

  it('table wins over bullets when both shapes somehow coexist in one body', () => {
    const body =
      '| Name | Type | Purpose |\n| --- | --- | --- |\n| `Foo` | Service | x |\n- `Bar` — also here';
    assert.deepStrictEqual(parseEntityRows(body), ['Foo']);
  });
});
