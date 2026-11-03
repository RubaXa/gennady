// @file: Contract forms of existing TypeScript code the linter must accept: this, destructuring, arrows.
// @spec: DBC-DBC-LINTER
// @consumers: DbcTsLinter

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DbcTsLinter } from '../dbc-ts-linter.ts';
import { DbcJsDocParser } from '../../../../parser/implementations/jsdoc/dbc-jsdoc-parser.ts';
import { DbcTsAstAdapter } from '../dbc-ts-ast-adapter.ts';
import {
  ERR_DBC_LINT_MISSING_CONTRACT,
  ERR_DBC_LINT_PARAM_EXTRA,
  ERR_DBC_LINT_PARAM_MISSING,
  ERR_DBC_LINT_PARSE_FAILED,
  ERR_DBC_LINT_RETURNS_UNEXPECTED,
} from '../../../dbc-linter.types.ts';

async function lintSource(source: string, fileName = 'value.ts') {
  const dir = mkdtempSync(join(tmpdir(), 'dbc-brownfield-'));
  const filePath = join(dir, fileName);
  writeFileSync(filePath, source, 'utf8');
  try {
    const linter = new DbcTsLinter(new DbcJsDocParser(), new DbcTsAstAdapter());
    const report = await linter.lint(filePath, { strategy: 'full' });
    const fixed = await linter.lintAndFix(filePath, { strategy: 'full' });
    return {
      codes: report.errors.map((error) => error.code),
      autofixed: readFileSync(filePath, 'utf8'),
      fixedCodes: fixed.errors.map((error) => error.code),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const lines = (...rows: string[]) => rows.join('\n') + '\n';

describe('DbcTsLinter brownfield contract forms', () => {
  it('skips the TypeScript `this` receiver and keeps @param this an error', async () => {
    const clean = lines(
      '/**',
      ' * @purpose Toggle a Feast flag on the bound component.',
      ' * @param key Flag key.',
      ' * @returns Next flag state.',
      ' */',
      'export function feastInvert(this: { state: object }, key: string): boolean {',
      '  return Boolean(this.state) && key.length > 0;',
      '}'
    );
    const result = await lintSource(clean);
    assert.deepStrictEqual(result.codes, []);
    assert.strictEqual(result.autofixed, clean);

    const withThis = await lintSource(
      clean.replace(' * @param key', ' * @param this Bound.\n * @param key')
    );
    assert.deepStrictEqual(result.fixedCodes, []);
    assert.ok(withThis.codes.includes(ERR_DBC_LINT_PARAM_EXTRA));
  });

  it('binds a required destructured parameter to the contract name, with nested entries', async () => {
    const clean = lines(
      '/**',
      ' * @purpose Report API request duration.',
      ' * @param options Request timing context.',
      ' * @param options.request Finished request.',
      ' * @param options.xray Radar sink.',
      ' * @param label Metric label.',
      ' */',
      'export function logSomeAPIDuration({ request, xray }: Options, label: string): void {',
      '  xray(request, label);',
      '}'
    );
    const result = await lintSource(clean);
    assert.deepStrictEqual(result.codes, []);
    assert.strictEqual(
      result.autofixed,
      clean,
      'autofix keeps the alias and nested entries in place'
    );

    const undocumented = await lintSource(clean.replace(/ \* @param options[^\n]*\n/g, ''));
    assert.ok(undocumented.codes.includes(ERR_DBC_LINT_PARAM_MISSING));

    const wrongName = await lintSource(
      clean
        .replace(' * @param options Request', ' * @param label2 Request')
        .replace(/ \* @param options\.[^\n]*\n/g, '')
        .replace(' * @param label Metric', ' * @param label3 Metric')
    );
    assert.ok(wrongName.codes.includes(ERR_DBC_LINT_PARAM_EXTRA));
    assert.ok(wrongName.codes.includes(ERR_DBC_LINT_PARAM_MISSING));
  });

  it('ignores @param mentioned inside description text when autofix binds destructuring', async () => {
    const clean = lines(
      '/**',
      ' * @purpose Report a duration; see @param example below for the binding rule.',
      ' * @param options Request timing context.',
      ' * @param label Metric label.',
      ' */',
      'export function logDuration({ request }: Options, label: string): void {',
      '  void request;',
      '  void label;',
      '}'
    );
    const result = await lintSource(clean);
    assert.deepStrictEqual(result.codes, []);
    assert.strictEqual(result.autofixed, clean, 'autofix keeps @param options');
  });

  it('treats @returns as optional when a callable has no return annotation', async () => {
    const documented = lines(
      '/**',
      ' * @purpose Build a greeting.',
      ' * @param name Person name.',
      ' * @returns Greeting text.',
      ' */',
      'export function greet(name: string) {',
      '  return `hi ${name}`;',
      '}'
    );
    const result = await lintSource(documented);
    assert.deepStrictEqual(result.codes, []);
    assert.strictEqual(result.autofixed, documented, 'autofix does not strip the @returns');

    const undocumented = await lintSource(documented.replace(' * @returns Greeting text.\n', ''));
    assert.deepStrictEqual(undocumented.codes, []);

    const explicitVoid = await lintSource(
      documented.replace('greet(name: string)', 'greet(name: string): void')
    );
    assert.ok(explicitVoid.codes.includes(ERR_DBC_LINT_RETURNS_UNEXPECTED));
  });

  it('accepts and validates @param/@returns on an exported arrow const', async () => {
    const documented = lines(
      '/**',
      ' * @purpose Increment a counter value.',
      ' * @param value Current value.',
      ' * @returns Next value.',
      ' */',
      'export const increment = (value: number) => value + 1;'
    );
    const result = await lintSource(documented);
    assert.deepStrictEqual(result.codes, []);
    assert.strictEqual(result.autofixed, documented);

    const purposeOnly = await lintSource(
      '/** @purpose Increment a counter value. */\nexport const increment = (value: number) => value + 1;\n'
    );
    assert.deepStrictEqual(purposeOnly.codes, []);

    const misnamed = await lintSource(documented.replace('@param value', '@param amount'));
    assert.ok(misnamed.codes.includes(ERR_DBC_LINT_PARAM_EXTRA));
    assert.ok(misnamed.codes.includes(ERR_DBC_LINT_PARAM_MISSING));

    const plainConst = await lintSource(
      '/**\n * @purpose Limit.\n * @param value Nothing.\n */\nexport const LIMIT = 3;\n'
    );
    assert.ok(plainConst.codes.includes(ERR_DBC_LINT_PARAM_EXTRA));
  });

  it('keeps a JSDoc attached across tooling directive comments only', async () => {
    const directive = lines(
      '/** @purpose Log a debug line. */',
      '// eslint-disable-next-line no-console',
      'export function debugLine(): void {}'
    );
    assert.deepStrictEqual((await lintSource(directive)).codes, []);
    assert.deepStrictEqual(
      (
        await lintSource(
          directive.replace('eslint-disable-next-line no-console', '@ts-expect-error legacy')
        )
      ).codes,
      []
    );

    const prose = await lintSource(
      directive.replace('eslint-disable-next-line no-console', 'just a note')
    );
    assert.ok(prose.codes.includes(ERR_DBC_LINT_MISSING_CONTRACT));
  });

  it('parses .ts with the TypeScript grammar and .tsx with the TSX grammar', async () => {
    const assertion = lines(
      '/** @purpose Window size. */',
      'export const SIZE = <[number, number]>[1, 2];'
    );
    assert.ok(!(await lintSource(assertion, 'size.ts')).codes.includes(ERR_DBC_LINT_PARSE_FAILED));
    assert.ok((await lintSource(assertion, 'size.tsx')).codes.includes(ERR_DBC_LINT_PARSE_FAILED));

    const jsx = lines(
      '/** @purpose Root element. */',
      'export const ROOT = <div className="x" />;'
    );
    assert.ok(!(await lintSource(jsx, 'root.tsx')).codes.includes(ERR_DBC_LINT_PARSE_FAILED));
  });
});
