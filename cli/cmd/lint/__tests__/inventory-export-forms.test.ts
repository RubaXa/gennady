// @file: Inventory sync over every ES export form: clause, re-export, default identifier, anonymous default.
// @spec: CLI-LINT
// @consumers: LintCommand

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DbcTsAstAdapter } from '../../../../services/dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts';
import {
  check as checkInventorySync,
  collectExports,
  parseDefaultExportEntities,
  reverseUnimplemented,
} from '../checks/inventory-sync.check.ts';
import {
  ERR_CLI_LINT_INVENTORY_UNDECLARED,
  ERR_CLI_LINT_INVENTORY_UNIMPLEMENTED,
} from '../lint.types.ts';

const adapter = new DbcTsAstAdapter();

async function names(file: string, source: string) {
  const result = await adapter.parseExportNames(file, source);
  assert.ok(result.ok, file);
  return result.names;
}

describe('export names for inventory sync', () => {
  it('lists every ES export form, including .js sources', async () => {
    assert.deepStrictEqual((await names('a.ts', 'export const a = 1, b = 2;')).local, ['a', 'b']);
    assert.deepStrictEqual((await names('b.ts', 'const y = 1; export {y, y as w};')).local, [
      'y',
      'w',
    ]);
    const defaultIdentifier = await names('c.ts', 'const x = 1; export default x;');
    assert.deepStrictEqual([defaultIdentifier.local, defaultIdentifier.hasDefault], [['x'], true]);
    const aliasDefault = await names('d.ts', 'const x = 1; export {x as default};');
    assert.deepStrictEqual([aliasDefault.local, aliasDefault.hasDefault], [['x'], true]);
    assert.deepStrictEqual((await names('e.ts', 'export default abstract class Abs {}')).local, [
      'Abs',
    ]);
    const anonymous = await names('f.ts', 'class A {}\nexport default new A();');
    assert.deepStrictEqual([anonymous.local, anonymous.hasDefault], [[], true]);
    const cast = await names('g.ts', 'export default originalFlags as unknown as PatchedFlags;');
    assert.deepStrictEqual(cast.local, ['originalFlags']);
    const reexports = await names('h.ts', "export {z} from './o';\nexport * as ns from './n';");
    assert.deepStrictEqual([reexports.local, reexports.reexported], [[], ['z', 'ns']]);
    assert.equal((await names('i.ts', "export * from './all';")).starReexport, true);
    const js = await names(
      'j.js',
      'const q = 1;\nexport default q;\nexport function querystringAdd() {}'
    );
    assert.deepStrictEqual([js.local, js.hasDefault], [['q', 'querystringAdd'], true]);
  });

  it('flags an undeclared export clause entry, but not a re-export', async () => {
    const errors = await checkInventorySync(
      "const helper = 1;\nexport {helper};\nexport {z} from './other';\n",
      'mod.ts',
      []
    );
    assert.deepStrictEqual(
      errors.map((e) => [e.code, e.message.includes('`helper`')]),
      [[ERR_CLI_LINT_INVENTORY_UNDECLARED, true]]
    );
  });

  it('matches an anonymous default only through a Default Export marker', async () => {
    const implemented = new Set([
      ...(await collectExports('class S {}\nexport default new S();\n', 'app/service/storage.ts')),
      ...(await collectExports(
        'const copyToClipboard = 1;\nexport default copyToClipboard;\n',
        'app/helpers/copy.ts'
      )),
    ]);
    const spec = [
      '<!--SECTION:ENTITY_INVENTORY-->',
      '| Name | Type | Purpose |',
      '|---|---|---|',
      '| `storageService` | Service | Local storage. Default Export: `app/service/storage.ts` |',
      '| `copyToClipboard` | Function | Copy text. |',
      '| `ghost` | Function | Missing. Default Export: app/service/ghost.ts |',
      '<!--/SECTION:ENTITY_INVENTORY-->',
      '',
    ].join('\n');
    const defaults = parseDefaultExportEntities(spec);
    assert.deepStrictEqual(
      [...defaults],
      [
        ['storageService', 'app/service/storage.ts'],
        ['ghost', 'app/service/ghost.ts'],
      ]
    );
    const result = reverseUnimplemented(
      ['storageService', 'copyToClipboard', 'ghost'],
      implemented,
      'spec.md',
      new Map(),
      defaults
    );
    assert.deepStrictEqual(
      result.errors.map((e) => [e.code, e.message.includes('`ghost`')]),
      [[ERR_CLI_LINT_INVENTORY_UNIMPLEMENTED, true]]
    );
    assert.match(result.errors[0]!.message, /Before removing the row/);
  });

  it('reports a missing entity as unverifiable, not drift, when a file cannot be listed', async () => {
    const implemented = new Set([
      ...(await collectExports("export * from './all';\n", 'app/core/index.ts')),
      ...(await collectExports('export const ok = 1;\n', 'app/core/ok.ts')),
    ]);
    const result = reverseUnimplemented(['ok', 'maybe'], implemented, 'spec.md');
    assert.deepStrictEqual(result.errors, []);
    assert.deepStrictEqual(result.unverifiable, [{ name: 'maybe', files: ['app/core/index.ts'] }]);
  });
});
