// @file: Tests for the file-level lint exemption marker across DbC, inventory and disables checks.
// @spec: CLI-LINT
// @consumers: LintCommand

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findFileLintDisable } from '../checks/utils/file-lint-disable.ts';
import { check as checkDbcContracts } from '../checks/dbc-contract.check.ts';
import { check as checkInventorySync, collectExports } from '../checks/inventory-sync.check.ts';
import { check as checkDisables } from '../checks/disables.check.ts';
import {
  ERR_CLI_LINT_DISABLE_MISSING_PURPOSE,
  ERR_CLI_LINT_INVENTORY_UNDECLARED,
  ERR_CLI_LINT_UNAUTHORIZED_DISABLE,
} from '../lint.types.ts';

const MARKER =
  '// gennady-lint-disable: AC-DL-14 исторический реестр флагов, закрыт для новых записей';

const registry = (marker: string | null) =>
  [
    '// @file: Historical feature flag registry.',
    '// @spec: APP-CORE',
    '// @consumers: app',
    ...(marker === null ? [] : [marker]),
    '',
    '// DEMO-4637 Historical sample switch',
    "export const IS_SYNTHETIC_SWITCH_DISABLED = features.has('synthetic-switch-disabled');",
    '/** @purpose Flag. @see DEMO-123 */',
    'export const IS_OTHER = true;',
    '',
  ].join('\n');

async function inFile<T>(content: string, run: (filePath: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'lint-file-disable-'));
  const filePath = join(dir, 'default-values.ts');
  writeFileSync(filePath, content, 'utf8');
  try {
    return await run(filePath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('file-level gennady-lint-disable', () => {
  it('is honoured only in the leading comment block with a Decision Log ref and a reason', () => {
    assert.deepStrictEqual(findFileLintDisable(registry(MARKER)), { line: 4, ref: 'AC-DL-14' });
    assert.strictEqual(findFileLintDisable(registry(null)), null);
    assert.strictEqual(
      findFileLintDisable(registry('// gennady-lint-disable: исторический реестр флагов')),
      null,
      'no Decision Log reference'
    );
    assert.strictEqual(findFileLintDisable(registry('// gennady-lint-disable: AC-DL-14 ok')), null);
    assert.strictEqual(
      findFileLintDisable(
        registry('// Note: gennady-lint-disablement AC-DL-14 accidental text here')
      ),
      null,
      'a longer word is not the marker'
    );
    assert.strictEqual(
      findFileLintDisable(
        registry('// We never use gennady-lint-disable here, AC-DL-14 forbids it')
      ),
      null,
      'prose that mentions the marker does not exempt'
    );
    assert.strictEqual(
      findFileLintDisable(registry('// gennady-lint-disable AC-DL-14 исторический реестр флагов')),
      null,
      'the colon is part of the directive'
    );
    const belowCode = registry(null).replace(
      'export const IS_OTHER = true;',
      `export const IS_OTHER = true;\n${MARKER}`
    );
    assert.strictEqual(findFileLintDisable(belowCode), null, 'marker below code');
  });

  it('exempts the file from DbC contracts, @see format and the forward inventory check', async () => {
    await inFile(registry(null), async (filePath) => {
      const dbc = await checkDbcContracts(registry(null), filePath, false);
      assert.ok(dbc.errors.length > 0, 'unmarked registry is still checked');
      const inventory = await checkInventorySync(registry(null), filePath, []);
      assert.ok(inventory.some((e) => e.code === ERR_CLI_LINT_INVENTORY_UNDECLARED));
      assert.deepStrictEqual((await collectExports(registry(null), filePath)).sort(), [
        'IS_OTHER',
        'IS_SYNTHETIC_SWITCH_DISABLED',
      ]);
    });
    // Component permission is host input here; real CLI resolution has separate negative controls.
    await inFile(registry(MARKER), async (filePath) => {
      assert.deepStrictEqual(await checkDbcContracts(registry(MARKER), filePath, false, true), {
        errors: [],
        autoFixed: 0,
      });
      assert.deepStrictEqual(await checkInventorySync(registry(MARKER), filePath, [], true), []);
      // The reverse sweep still sees what an exempt file exports.
      assert.deepStrictEqual((await collectExports(registry(MARKER), filePath)).sort(), [
        'IS_OTHER',
        'IS_SYNTHETIC_SWITCH_DISABLED',
      ]);
    });
  });

  it('holds the marker to the same Decision Log and purpose discipline as other disables', () => {
    assert.deepStrictEqual(checkDisables(registry(MARKER), 'default-values.ts'), []);
    const noRef = checkDisables(
      registry('// gennady-lint-disable: исторический реестр флагов'),
      'default-values.ts'
    );
    assert.deepStrictEqual(
      noRef.map((e) => e.code),
      [ERR_CLI_LINT_UNAUTHORIZED_DISABLE]
    );
    const noReason = checkDisables(
      registry('// gennady-lint-disable: AC-DL-14'),
      'default-values.ts'
    );
    assert.deepStrictEqual(
      noReason.map((e) => e.code),
      [ERR_CLI_LINT_DISABLE_MISSING_PURPOSE]
    );
  });
});
