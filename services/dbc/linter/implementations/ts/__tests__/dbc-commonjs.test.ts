// @file: Static CommonJS export extraction and anonymous callable contract controls.
// @spec: DBC-DBC-LINTER
// @consumers: mixed JavaScript repository qualification

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DbcTsAstAdapter } from '../dbc-ts-ast-adapter.ts';

for (const [source, names] of [
  ['exports.greet = function(name) { return name; };', ['greet']],
  ['module.exports.greet = value => value;', ['greet']],
  ['module.exports = { first: 1, second };', ['first', 'second']],
] as const)
  test(`lists static CommonJS exports: ${source}`, async () => {
    const report = await new DbcTsAstAdapter().parseExportNames('value.cjs', source);
    assert.ok(report.ok);
    assert.deepEqual(report.names.local.sort(), [...names].sort());
  });

test('CommonJS callable is a contract surface, with its unparenthesized argument', async () => {
  const result = await new DbcTsAstAdapter().parseFile(
    'value.cjs',
    '/** @purpose Echo. */\nexports.echo = value => value;'
  );
  assert.ok(result.ok);
  assert.equal(result.exported[0]?.name, 'echo');
  assert.deepEqual(
    result.exported[0]?.signature.params.map((p) => p.name),
    ['value']
  );
});

for (const [source, names] of [
  ['exports.live = () => 1; module.exports = {};', []],
  ['module.exports = { old: 1 }; module.exports = { current: 2 };', ['current']],
  ['module.exports = {}; exports.hidden = () => 1;', []],
  ['const exports = {}; exports.fake = 1; export const actual = 2;', ['actual']],
] as const)
  test(`does not prove obsolete or shadowed exports: ${source}`, async () => {
    const report = await new DbcTsAstAdapter().parseExportNames('value.js', source);
    assert.ok(report.ok);
    assert.deepEqual(report.names.local.sort(), [...names].sort());
  });

test('dynamic CommonJS writes make inventory explicitly incomplete', async () => {
  const report = await new DbcTsAstAdapter().parseExportNames(
    'value.cjs',
    'module.exports[key] = value;'
  );
  assert.ok(report.ok);
  assert.equal(report.names.starReexport, true);
});

test('a property named default never replaces the CommonJS export object', async () => {
  const source = 'exports.a = () => 1; exports.default = () => 2;';
  const adapter = new DbcTsAstAdapter();
  const names = await adapter.parseExportNames('value.cjs', source);
  assert.ok(names.ok);
  assert.deepEqual(names.names.local.sort(), ['a', 'default']);
  const contracts = await adapter.parseFile('value.cjs', source);
  assert.ok(contracts.ok);
  assert.deepEqual(contracts.exported.map((entity) => entity.name).sort(), ['a', 'default']);
});

for (const source of [
  'const { exports } = local; exports.fake = function() {};',
  'const { key: module } = local; module.exports.fake = function() {};',
  'const [, { nested: [exports] }] = local; exports.fake = function() {};',
])
  test(`destructured local bindings do not grant CommonJS exports: ${source}`, async () => {
    const adapter = new DbcTsAstAdapter();
    const names = await adapter.parseExportNames('value.cjs', source);
    assert.ok(names.ok);
    assert.deepEqual(names.names.local, []);
    const contracts = await adapter.parseFile('value.cjs', source);
    assert.ok(contracts.ok);
    assert.deepEqual(contracts.exported, []);
  });

test('a destructuring property key does not shadow the CommonJS binding', async () => {
  const result = await new DbcTsAstAdapter().parseExportNames(
    'value.cjs',
    'const { exports: localExports, module: localModule } = local; exports.real = 1;'
  );
  assert.ok(result.ok);
  assert.deepEqual(result.names.local, ['real']);
});
