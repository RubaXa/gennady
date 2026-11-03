// @file: Exact JavaScript versus TypeScript grammar and exempt-file syntax regression controls.
// @spec: DBC-DBC-LINTER
// @consumers: brownfield parser qualification

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DbcTsAstAdapter } from '../dbc-ts-ast-adapter.ts';
import { check as checkDbc } from '../../../../../../cli/cmd/lint/checks/dbc-contract.check.ts';

for (const extension of ['js', 'mjs', 'cjs', 'jsx']) {
  test(`${extension} rejects TypeScript syntax in both parser entrypoints`, async () => {
    const adapter = new DbcTsAstAdapter();
    for (const source of [
      'export const value: number = 1;',
      'export interface Value { value: number; }',
      'export const value = 1 as number;',
    ]) {
      assert.equal((await adapter.parseFile(`value.${extension}`, source)).ok, false, source);
      assert.equal(
        (await adapter.parseExportNames(`value.${extension}`, source)).ok,
        false,
        source
      );
    }
  });
}

for (const extension of ['ts', 'mts', 'cts', 'tsx']) {
  test(`${extension} retains typed declarations`, async () => {
    const adapter = new DbcTsAstAdapter();
    const source = 'export const value: number = 1;';
    assert.equal((await adapter.parseFile(`value.${extension}`, source)).ok, true);
    assert.equal((await adapter.parseExportNames(`value.${extension}`, source)).ok, true);
  });
}

test('JavaScript grammar retains JSX and ordinary CommonJS without a TypeScript superset', async () => {
  const adapter = new DbcTsAstAdapter();
  for (const [file, source] of [
    ['view.jsx', 'export const View = () => <section>Ready</section>;'],
    ['value.js', 'export const value = 1;'],
    ['value.cjs', 'module.exports.value = 1;'],
  ]) {
    assert.equal((await adapter.parseFile(file!, source!)).ok, true, file);
    assert.equal((await adapter.parseExportNames(file!, source!)).ok, true, file);
  }
});

test('accepted DbC exemption still rejects TypeScript syntax in a JavaScript file', async () => {
  const content =
    '// gennady-lint-disable: REG-DL-1 unchanged historical registry only\nexport const value: number = 1;\n';
  const result = await checkDbc(content, 'value.js', false, true);
  assert.deepEqual(
    result.errors.map((error) => error.code),
    ['ERR_DBC_LINT_PARSE_FAILED']
  );
  assert.equal(result.autoFixed, 0);
});
