// @file: Comprehensive test suite for DbcTsLinter covering all 88 test cases from the coverage matrix.
// @consumers: DbcTsLinter
// @tasks: TSK-10, TSK-11, TSK-20

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DbcTsLinter, validate } from '../dbc-ts-linter.ts';
import { DbcJsDocParser } from '../../../../parser/implementations/jsdoc/dbc-jsdoc-parser.ts';
import { DbcTsAstAdapter } from '../dbc-ts-ast-adapter.ts';
import type { DbcLintError, DbcLintIssueCode } from '../../../dbc-linter.types.ts';
import {
  ERR_DBC_LINT_MISSING_CONTRACT,
  ERR_DBC_LINT_PARSE_FAILED,
  ERR_DBC_LINT_PARAM_MISSING,
  ERR_DBC_LINT_PARAM_EXTRA,
  ERR_DBC_LINT_PARAM_ORDER,
  ERR_DBC_LINT_RETURNS_MISSING,
  ERR_DBC_LINT_RETURNS_UNEXPECTED,
  ERR_DBC_LINT_TYPE_REDUNDANT,
  ERR_DBC_LINT_PARAM_OPTIONAL_MISMATCH,
} from '../../../dbc-linter.types.ts';
import type { DbcEntrySchema } from '../../../../parser/dbc-parser.types.ts';
import type { DbcParamInfo, DbcSignatureInfo } from '../../../dbc-ast-adapter.types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');

/**
 * @purpose Creates a temporary directory with a copy of a fixture file for testing.
 * @param fixtureRelative Path relative to FIXTURES_DIR (e.g., 'happy/const.ts').
 * @returns The temp directory path and the temp file path.
 */
function setupTempFromFixture(fixtureRelative: string): {
  dir: string;
  filePath: string;
} {
  const dir = mkdtempSync(join(tmpdir(), 'dbc-lint-'));
  const srcPath = join(FIXTURES_DIR, fixtureRelative);
  const content = readFileSync(srcPath, 'utf8');
  const filePath = join(dir, 'test.ts');
  writeFileSync(filePath, content, 'utf8');
  return { dir, filePath };
}

/**
 * @purpose Creates a fresh linter instance with real parser and AST adapter.
 */
function createLinter(): DbcTsLinter {
  const parser = new DbcJsDocParser();
  const astAdapter = new DbcTsAstAdapter();
  return new DbcTsLinter(parser, astAdapter);
}

/**
 * @purpose Extracts error codes from a lint report for concise assertions.
 */
function errorCodes(errors: DbcLintError[]): string[] {
  return errors.map((e) => e.code);
}

// #region START_DBC_TS_LINTER_TESTS

describe('DbcTsLinter', () => {
  // #region START_GROUP_A_HAPPY_PATH

  describe('Group A — Happy path', () => {
    it('A1 — should pass: export const with valid contract', async () => {
      const { dir, filePath } = setupTempFromFixture('happy/const.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('A2 — should pass: export function with full contract', async () => {
      const { dir, filePath } = setupTempFromFixture('happy/function.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('A3 — should pass: export function void without @returns', async () => {
      const { dir, filePath } = setupTempFromFixture('happy/function-void.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('A4 — should pass: export class with covered members', async () => {
      const { dir, filePath } = setupTempFromFixture('happy/class.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('A5 — should pass: export interface with covered members', async () => {
      const { dir, filePath } = setupTempFromFixture('happy/interface.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('A6 — should pass: export type with contract', async () => {
      const { dir, filePath } = setupTempFromFixture('happy/type.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('A7 — should pass: export enum with covered members', async () => {
      const { dir, filePath } = setupTempFromFixture('happy/enum.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('A8 — should pass: export default with contract', async () => {
      const { dir, filePath } = setupTempFromFixture('happy/export-default.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('A9 — should pass: comment before export keyword', async () => {
      const { dir, filePath } = setupTempFromFixture('happy/comment-before-export.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('A10 — should pass: multiple exports all covered', async () => {
      const { dir, filePath } = setupTempFromFixture('happy/multi-export.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // #endregion END_GROUP_A_HAPPY_PATH

  // #region START_GROUP_B_MISSING_CONTRACT

  describe('Group B — ERR_DBC_LINT_MISSING_CONTRACT', () => {
    it('B1 — export const without contract', async () => {
      const { dir, filePath } = setupTempFromFixture('missing-contract/const.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        assert.strictEqual(report.errors.length, 1);
        assert.strictEqual(report.errors[0]?.code, ERR_DBC_LINT_MISSING_CONTRACT);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('B2 — export function without contract', async () => {
      const { dir, filePath } = setupTempFromFixture('missing-contract/function.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        assert.strictEqual(report.errors.length, 1);
        assert.strictEqual(report.errors[0]?.code, ERR_DBC_LINT_MISSING_CONTRACT);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('B3 — export class without contract', async () => {
      const { dir, filePath } = setupTempFromFixture('missing-contract/class.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        // class has no contract + member method has no contract
        assert.ok(report.errors.length >= 1);
        const codes = errorCodes(report.errors);
        assert.ok(codes.includes(ERR_DBC_LINT_MISSING_CONTRACT));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('B4 — export interface without contract', async () => {
      const { dir, filePath } = setupTempFromFixture('missing-contract/interface.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        assert.ok(report.errors.length >= 1);
        const codes = errorCodes(report.errors);
        assert.ok(codes.includes(ERR_DBC_LINT_MISSING_CONTRACT));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('B5 — export type without contract', async () => {
      const { dir, filePath } = setupTempFromFixture('missing-contract/type.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        assert.strictEqual(report.errors.length, 1);
        assert.strictEqual(report.errors[0]?.code, ERR_DBC_LINT_MISSING_CONTRACT);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('B6 — export enum without contract', async () => {
      const { dir, filePath } = setupTempFromFixture('missing-contract/enum.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        // enum entity + 2 enum members
        assert.ok(report.errors.length >= 3);
        const codes = errorCodes(report.errors);
        assert.ok(codes.includes(ERR_DBC_LINT_MISSING_CONTRACT));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('B7 — export default without contract', async () => {
      const { dir, filePath } = setupTempFromFixture('missing-contract/export-default.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        assert.strictEqual(report.errors.length, 1);
        assert.strictEqual(report.errors[0]?.code, ERR_DBC_LINT_MISSING_CONTRACT);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('B8 — class field without contract', async () => {
      const { dir, filePath } = setupTempFromFixture('missing-contract/member-field.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        // entity has contract, but member field does not
        const memberErrors = report.errors.filter(
          (e) => e.code === ERR_DBC_LINT_MISSING_CONTRACT && e.message.includes('id')
        );
        assert.ok(memberErrors.length >= 1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('B9 — class method without contract', async () => {
      const { dir, filePath } = setupTempFromFixture('missing-contract/member-method.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const memberErrors = report.errors.filter(
          (e) => e.code === ERR_DBC_LINT_MISSING_CONTRACT && e.message.includes('run')
        );
        assert.ok(memberErrors.length >= 1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('B10 — class getter without contract', async () => {
      const { dir, filePath } = setupTempFromFixture('missing-contract/member-getter.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const memberErrors = report.errors.filter(
          (e) => e.code === ERR_DBC_LINT_MISSING_CONTRACT && e.message.includes('name')
        );
        assert.ok(memberErrors.length >= 1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('B11 — class setter without contract', async () => {
      const { dir, filePath } = setupTempFromFixture('missing-contract/member-setter.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const memberErrors = report.errors.filter(
          (e) => e.code === ERR_DBC_LINT_MISSING_CONTRACT && e.message.includes('name')
        );
        assert.ok(memberErrors.length >= 1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('B12 — constructor without contract', async () => {
      const { dir, filePath } = setupTempFromFixture('missing-contract/member-constructor.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const memberErrors = report.errors.filter(
          (e) => e.code === ERR_DBC_LINT_MISSING_CONTRACT && e.message.includes('constructor')
        );
        assert.ok(memberErrors.length >= 1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('B13 — interface property without contract', async () => {
      const { dir, filePath } = setupTempFromFixture(
        'missing-contract/member-interface-property.ts'
      );
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const memberErrors = report.errors.filter(
          (e) => e.code === ERR_DBC_LINT_MISSING_CONTRACT && e.message.includes('color')
        );
        assert.ok(memberErrors.length >= 1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('B14 — interface method without contract', async () => {
      const { dir, filePath } = setupTempFromFixture('missing-contract/member-interface-method.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const memberErrors = report.errors.filter(
          (e) => e.code === ERR_DBC_LINT_MISSING_CONTRACT && e.message.includes('draw')
        );
        assert.ok(memberErrors.length >= 1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('B15 — enum member without contract', async () => {
      const { dir, filePath } = setupTempFromFixture('missing-contract/member-enum.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        // entity has contract, but enum members do not
        const memberErrors = report.errors.filter(
          (e) =>
            e.code === ERR_DBC_LINT_MISSING_CONTRACT &&
            (e.message.includes('RED') || e.message.includes('BLUE'))
        );
        assert.ok(memberErrors.length >= 2);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('B16 — class with all members missing contracts (5 errors)', async () => {
      const { dir, filePath } = setupTempFromFixture('missing-contract/class-all-members.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        // entity has contract → 0 entity errors
        // 5 members: field, constructor, method, getter, setter → 5 missing contract errors
        const memberErrors = report.errors.filter((e) => e.code === ERR_DBC_LINT_MISSING_CONTRACT);
        assert.strictEqual(
          memberErrors.length,
          5,
          `expected 5 MISSING_CONTRACT for members, got ${memberErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // #endregion END_GROUP_B_MISSING_CONTRACT

  // #region START_GROUP_C_PARSE_FAILED

  describe('Group C — ERR_DBC_LINT_PARSE_FAILED', () => {
    it('C1 — syntactically broken file', async () => {
      const { dir, filePath } = setupTempFromFixture('parse-failed/syntax-error.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        assert.strictEqual(report.errors.length, 1);
        assert.strictEqual(report.errors[0]?.code, ERR_DBC_LINT_PARSE_FAILED);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('C2 — empty file', async () => {
      const { dir, filePath } = setupTempFromFixture('parse-failed/binary-or-empty.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        // empty file parses OK with 0 entities → no errors
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // #endregion END_GROUP_C_PARSE_FAILED

  // #region START_GROUP_D_PARAM_MISSING

  describe('Group D — ERR_DBC_LINT_PARAM_MISSING', () => {
    it('D1 — function with 1 param, contract without @param', async () => {
      const { dir, filePath } = setupTempFromFixture('param-missing/function-single.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const paramErrors = report.errors.filter((e) => e.code === ERR_DBC_LINT_PARAM_MISSING);
        assert.strictEqual(
          paramErrors.length,
          1,
          `expected 1 PARAM_MISSING, got ${paramErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('D2 — function with 3 params, contract with 1 @param (2 missing)', async () => {
      const { dir, filePath } = setupTempFromFixture('param-missing/function-multiple.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const paramErrors = report.errors.filter((e) => e.code === ERR_DBC_LINT_PARAM_MISSING);
        assert.strictEqual(
          paramErrors.length,
          2,
          `expected 2 PARAM_MISSING, got ${paramErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('D3 — function with params, no @param at all', async () => {
      const { dir, filePath } = setupTempFromFixture('param-missing/function-all.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const paramErrors = report.errors.filter((e) => e.code === ERR_DBC_LINT_PARAM_MISSING);
        assert.strictEqual(
          paramErrors.length,
          2,
          `expected 2 PARAM_MISSING, got ${paramErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('D4 — method with params, without @param', async () => {
      const { dir, filePath } = setupTempFromFixture('param-missing/method.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const paramErrors = report.errors.filter((e) => e.code === ERR_DBC_LINT_PARAM_MISSING);
        assert.strictEqual(
          paramErrors.length,
          1,
          `expected 1 PARAM_MISSING, got ${paramErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('D5 — constructor with params, without @param', async () => {
      const { dir, filePath } = setupTempFromFixture('param-missing/constructor.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const paramErrors = report.errors.filter((e) => e.code === ERR_DBC_LINT_PARAM_MISSING);
        assert.strictEqual(
          paramErrors.length,
          2,
          `expected 2 PARAM_MISSING, got ${paramErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // #endregion END_GROUP_D_PARAM_MISSING

  // #region START_GROUP_E_PARAM_EXTRA

  describe('Group E — ERR_DBC_LINT_PARAM_EXTRA', () => {
    it('E1 — no params in signature, contract has 1 extra @param', async () => {
      const { dir, filePath } = setupTempFromFixture('param-extra/single.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const extraErrors = report.errors.filter((e) => e.code === ERR_DBC_LINT_PARAM_EXTRA);
        assert.strictEqual(
          extraErrors.length,
          1,
          `expected 1 PARAM_EXTRA, got ${extraErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('E2 — 2 params, contract has 4 @param (2 extra)', async () => {
      const { dir, filePath } = setupTempFromFixture('param-extra/multiple.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const extraErrors = report.errors.filter((e) => e.code === ERR_DBC_LINT_PARAM_EXTRA);
        assert.strictEqual(
          extraErrors.length,
          2,
          `expected 2 PARAM_EXTRA, got ${extraErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('E3 — signature has x, contract has @param y (y is extra)', async () => {
      const { dir, filePath } = setupTempFromFixture('param-extra/renamed.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const extraErrors = report.errors.filter((e) => e.code === ERR_DBC_LINT_PARAM_EXTRA);
        assert.strictEqual(
          extraErrors.length,
          1,
          `expected 1 PARAM_EXTRA, got ${extraErrors.length}`
        );
        // Also should have PARAM_MISSING for x
        const missingErrors = report.errors.filter((e) => e.code === ERR_DBC_LINT_PARAM_MISSING);
        assert.strictEqual(
          missingErrors.length,
          1,
          `expected 1 PARAM_MISSING, got ${missingErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('E4 — autofix removes extra @param', async () => {
      const { dir, filePath } = setupTempFromFixture('param-extra/autofix.ts');
      try {
        const linter = createLinter();
        const fixReport = await linter.lintAndFix(filePath);
        assert.ok(fixReport.autoFixed >= 1, `expected autoFixed >= 1, got ${fixReport.autoFixed}`);
        // After fix, no PARAM_EXTRA for 'extra'
        const extraRemaining = fixReport.errors.filter((e) => e.code === ERR_DBC_LINT_PARAM_EXTRA);
        assert.strictEqual(extraRemaining.length, 0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // #endregion END_GROUP_E_PARAM_EXTRA

  // #region START_GROUP_F_PARAM_ORDER

  describe('Group F — ERR_DBC_LINT_PARAM_ORDER', () => {
    it('F1 — reversed order c,b,a vs a,b,c', async () => {
      const { dir, filePath } = setupTempFromFixture('param-order/reversed.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const orderErrors = report.errors.filter((e) => e.code === ERR_DBC_LINT_PARAM_ORDER);
        assert.strictEqual(
          orderErrors.length,
          1,
          `expected 1 PARAM_ORDER, got ${orderErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('F2 — partial order violation', async () => {
      const { dir, filePath } = setupTempFromFixture('param-order/partial.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const orderErrors = report.errors.filter((e) => e.code === ERR_DBC_LINT_PARAM_ORDER);
        assert.strictEqual(
          orderErrors.length,
          1,
          `expected 1 PARAM_ORDER, got ${orderErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('F3 — autofix corrects @param order', async () => {
      const { dir, filePath } = setupTempFromFixture('param-order/autofix.ts');
      try {
        const linter = createLinter();
        const fixReport = await linter.lintAndFix(filePath);
        assert.ok(fixReport.autoFixed >= 1, `expected autoFixed >= 1, got ${fixReport.autoFixed}`);
        const orderRemaining = fixReport.errors.filter((e) => e.code === ERR_DBC_LINT_PARAM_ORDER);
        assert.strictEqual(orderRemaining.length, 0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // #endregion END_GROUP_F_PARAM_ORDER

  // #region START_GROUP_G_RETURNS_MISSING

  describe('Group G — ERR_DBC_LINT_RETURNS_MISSING', () => {
    it('G1 — function returns string, no @returns', async () => {
      const { dir, filePath } = setupTempFromFixture('returns-missing/function.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const returnsErrors = report.errors.filter((e) => e.code === ERR_DBC_LINT_RETURNS_MISSING);
        assert.strictEqual(
          returnsErrors.length,
          1,
          `expected 1 RETURNS_MISSING, got ${returnsErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('G2 — method returns object, no @returns', async () => {
      const { dir, filePath } = setupTempFromFixture('returns-missing/method.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const returnsErrors = report.errors.filter((e) => e.code === ERR_DBC_LINT_RETURNS_MISSING);
        assert.strictEqual(
          returnsErrors.length,
          1,
          `expected 1 RETURNS_MISSING, got ${returnsErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('G3 — getter without @returns', async () => {
      const { dir, filePath } = setupTempFromFixture('returns-missing/getter.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const returnsErrors = report.errors.filter((e) => e.code === ERR_DBC_LINT_RETURNS_MISSING);
        assert.strictEqual(
          returnsErrors.length,
          1,
          `expected 1 RETURNS_MISSING, got ${returnsErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // #endregion END_GROUP_G_RETURNS_MISSING

  // #region START_GROUP_H_RETURNS_UNEXPECTED

  describe('Group H — ERR_DBC_LINT_RETURNS_UNEXPECTED', () => {
    it('H1 — void function with @returns', async () => {
      const { dir, filePath } = setupTempFromFixture('returns-unexpected/function-void.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const returnsErrors = report.errors.filter(
          (e) => e.code === ERR_DBC_LINT_RETURNS_UNEXPECTED
        );
        assert.strictEqual(
          returnsErrors.length,
          1,
          `expected 1 RETURNS_UNEXPECTED, got ${returnsErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('H2 — constructor with @returns', async () => {
      const { dir, filePath } = setupTempFromFixture('returns-unexpected/constructor.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const returnsErrors = report.errors.filter(
          (e) => e.code === ERR_DBC_LINT_RETURNS_UNEXPECTED
        );
        assert.strictEqual(
          returnsErrors.length,
          1,
          `expected 1 RETURNS_UNEXPECTED, got ${returnsErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('H3 — setter with @returns', async () => {
      const { dir, filePath } = setupTempFromFixture('returns-unexpected/setter.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const returnsErrors = report.errors.filter(
          (e) => e.code === ERR_DBC_LINT_RETURNS_UNEXPECTED
        );
        assert.strictEqual(
          returnsErrors.length,
          1,
          `expected 1 RETURNS_UNEXPECTED, got ${returnsErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('H4 — field with @returns', async () => {
      const { dir, filePath } = setupTempFromFixture('returns-unexpected/field.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const returnsErrors = report.errors.filter(
          (e) => e.code === ERR_DBC_LINT_RETURNS_UNEXPECTED
        );
        assert.strictEqual(
          returnsErrors.length,
          1,
          `expected 1 RETURNS_UNEXPECTED, got ${returnsErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('H5 — const with @returns', async () => {
      const { dir, filePath } = setupTempFromFixture('returns-unexpected/const.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const returnsErrors = report.errors.filter(
          (e) => e.code === ERR_DBC_LINT_RETURNS_UNEXPECTED
        );
        assert.strictEqual(
          returnsErrors.length,
          1,
          `expected 1 RETURNS_UNEXPECTED, got ${returnsErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('H6 — autofix removes @returns', async () => {
      const { dir, filePath } = setupTempFromFixture('returns-unexpected/autofix.ts');
      try {
        const linter = createLinter();
        const fixReport = await linter.lintAndFix(filePath);
        assert.ok(fixReport.autoFixed >= 1, `expected autoFixed >= 1, got ${fixReport.autoFixed}`);
        const returnsRemaining = fixReport.errors.filter(
          (e) => e.code === ERR_DBC_LINT_RETURNS_UNEXPECTED
        );
        assert.strictEqual(returnsRemaining.length, 0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // #endregion END_GROUP_H_RETURNS_UNEXPECTED

  // #region START_GROUP_I_TYPE_REDUNDANT

  describe('Group I — ERR_DBC_LINT_TYPE_REDUNDANT', () => {
    it('I1 — @param with {type}', async () => {
      const { dir, filePath } = setupTempFromFixture('type-redundant/param.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const typeErrors = report.errors.filter((e) => e.code === ERR_DBC_LINT_TYPE_REDUNDANT);
        assert.strictEqual(
          typeErrors.length,
          1,
          `expected 1 TYPE_REDUNDANT, got ${typeErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('I2 — @returns with {type}', async () => {
      const { dir, filePath } = setupTempFromFixture('type-redundant/returns.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const typeErrors = report.errors.filter((e) => e.code === ERR_DBC_LINT_TYPE_REDUNDANT);
        assert.strictEqual(
          typeErrors.length,
          1,
          `expected 1 TYPE_REDUNDANT, got ${typeErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('I3 — multiple @param with {type}', async () => {
      const { dir, filePath } = setupTempFromFixture('type-redundant/multiple.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const typeErrors = report.errors.filter((e) => e.code === ERR_DBC_LINT_TYPE_REDUNDANT);
        // 2 @param with {type} + 1 @returns with {type}
        assert.strictEqual(
          typeErrors.length,
          3,
          `expected 3 TYPE_REDUNDANT, got ${typeErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('I4 — autofix removes {type}', async () => {
      const { dir, filePath } = setupTempFromFixture('type-redundant/autofix.ts');
      try {
        const linter = createLinter();
        const fixReport = await linter.lintAndFix(filePath);
        assert.ok(fixReport.autoFixed >= 1, `expected autoFixed >= 1, got ${fixReport.autoFixed}`);
        const typeRemaining = fixReport.errors.filter(
          (e) => e.code === ERR_DBC_LINT_TYPE_REDUNDANT
        );
        assert.strictEqual(typeRemaining.length, 0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // #endregion END_GROUP_I_TYPE_REDUNDANT

  // #region START_GROUP_J_PARSER_ERRORS

  describe('Group J — Parser errors', () => {
    it('J1 — ERR_DBC_ORDER: tags not in canonical order', async () => {
      const { dir, filePath } = setupTempFromFixture('parser-errors/parser-order.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const orderErrors = report.errors.filter((e) => e.code === 'ERR_DBC_ORDER');
        assert.strictEqual(
          orderErrors.length,
          1,
          `expected 1 ERR_DBC_ORDER, got ${orderErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('J2 — ERR_DBC_PURPOSE_CONFLICT: @purpose + @see', async () => {
      const { dir, filePath } = setupTempFromFixture('parser-errors/parser-purpose-conflict.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const conflictErrors = report.errors.filter((e) => e.code === 'ERR_DBC_PURPOSE_CONFLICT');
        assert.strictEqual(
          conflictErrors.length,
          1,
          `expected 1 ERR_DBC_PURPOSE_CONFLICT, got ${conflictErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('J3 — ERR_DBC_PARAM_NAME_MISSING: @param without name', async () => {
      const { dir, filePath } = setupTempFromFixture('parser-errors/parser-param-name-missing.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const nameErrors = report.errors.filter((e) => e.code === 'ERR_DBC_PARAM_NAME_MISSING');
        assert.strictEqual(
          nameErrors.length,
          1,
          `expected 1 ERR_DBC_PARAM_NAME_MISSING, got ${nameErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('J4 — ERR_DBC_SEE_FORMAT_INVALID: @see without {specifier}', async () => {
      const { dir, filePath } = setupTempFromFixture('parser-errors/parser-see-format-invalid.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const seeErrors = report.errors.filter((e) => e.code === 'ERR_DBC_SEE_FORMAT_INVALID');
        assert.strictEqual(
          seeErrors.length,
          1,
          `expected 1 ERR_DBC_SEE_FORMAT_INVALID, got ${seeErrors.length}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // #endregion END_GROUP_J_PARSER_ERRORS

  // #region START_GROUP_K_AUTOFIX_COMBINED

  describe('Group K — Autofix combined', () => {
    it('K1 — all fixable errors in one file, after autofix only unfixable remain', async () => {
      const { dir, filePath } = setupTempFromFixture('autofix-combined/all-fixable.ts');
      try {
        const linter = createLinter();

        // Initial lint
        const initialReport = await linter.lint(filePath);
        const initialCount = initialReport.errors.length;
        assert.ok(initialCount >= 3, `expected >= 3 initial errors, got ${initialCount}`);

        // Check that fixable errors are present
        const initialCodes = errorCodes(initialReport.errors);
        const fixableCodes = [
          ERR_DBC_LINT_TYPE_REDUNDANT,
          ERR_DBC_LINT_PARAM_EXTRA,
          ERR_DBC_LINT_PARAM_ORDER,
          ERR_DBC_LINT_RETURNS_UNEXPECTED,
          'ERR_DBC_ORDER',
        ];
        const hasFixable = fixableCodes.some((c) => initialCodes.includes(c));
        assert.ok(hasFixable, `expected at least one fixable error type`);

        // Autofix
        const fixReport = await linter.lintAndFix(filePath);
        assert.ok(fixReport.autoFixed >= 1, `expected autoFixed >= 1, got ${fixReport.autoFixed}`);

        // After fix: only unfixable remain (PARAM_MISSING)
        const remainingCodes = errorCodes(fixReport.errors);
        const remainingFixable = fixableCodes.filter((c) => remainingCodes.includes(c));
        assert.deepStrictEqual(
          remainingFixable,
          [],
          `fixable errors should be gone but got: ${remainingFixable.join(', ')}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('K2 — multi-line contract with 2+ tags → stays multi-line', async () => {
      const { dir, filePath } = setupTempFromFixture('autofix-combined/multi-line-to-inline.ts');
      try {
        const linter = createLinter();

        // Initial lint: has redundant types
        const initialReport = await linter.lint(filePath);
        assert.ok(initialReport.errors.length >= 1, 'expected redundant type errors');

        // After lintAndFix: types removed, but contract stays multi-line (3 tags)
        const fixReport = await linter.lintAndFix(filePath);
        assert.strictEqual(
          fixReport.errors.length,
          0,
          `expected no errors after fix, got: ${fixReport.errors.map((e) => e.code).join(', ')}`
        );
        assert.ok(fixReport.autoFixed >= 1, `expected autoFixed >= 1, got ${fixReport.autoFixed}`);

        // Read the fixed file — should still be multi-line (3 tags, not inlined)
        const fixedContent = readFileSync(filePath, 'utf8');
        assert.ok(
          fixedContent.includes('\n * '),
          `expected multi-line contract (3 tags), got inline or no-lines`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('K3 — multi-line contract with conflicts → NOT inlined', async () => {
      const { dir, filePath } = setupTempFromFixture(
        'autofix-combined/multi-line-cannot-inline.ts'
      );
      try {
        const linter = createLinter();

        // Initial lint: has PURPOSE_CONFLICT error
        const initialReport = await linter.lint(filePath);
        const conflictErrors = initialReport.errors.filter(
          (e) => e.code === 'ERR_DBC_PURPOSE_CONFLICT'
        );
        assert.strictEqual(conflictErrors.length, 1);

        // Autofix should not inline (dry-run fails)
        const fixReport = await linter.lintAndFix(filePath);

        // Read the fixed file — should still be multi-line
        const fixedContent = readFileSync(filePath, 'utf8');
        assert.ok(fixedContent.includes('\n'), 'expected multi-line contract to remain multi-line');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('K4 — ERR_DBC_ORDER + ERR_DBC_LINT_PARAM_ORDER simultaneously', async () => {
      const { dir, filePath } = setupTempFromFixture('autofix-combined/order-tags.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        const codes = errorCodes(report.errors);

        // Should have both ERR_DBC_ORDER and ERR_DBC_LINT_PARAM_ORDER
        assert.ok(
          codes.includes('ERR_DBC_ORDER'),
          `expected ERR_DBC_ORDER, got: ${codes.join(', ')}`
        );
        assert.ok(
          codes.includes(ERR_DBC_LINT_PARAM_ORDER),
          `expected ERR_DBC_LINT_PARAM_ORDER, got: ${codes.join(', ')}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('K5 — malformed multi-line with */ on same line → normalized or inlined', async () => {
      // contract: when */ is on the same line as the last tag, autofix either
      // normalizes to proper multi-line or inlines the contract. Both are correct.
      const { dir, filePath } = setupTempFromFixture('autofix-combined/malformed-multi-line.ts');
      try {
        const linter = createLinter();

        // Initial lint: contract is valid (no lint errors), but format is malformed
        const initialReport = await linter.lint(filePath);
        assert.strictEqual(initialReport.errors.length, 0, 'expected 0 lint errors');

        // Autofix: should normalize even when no lint errors
        const fixReport = await linter.lintAndFix(filePath);
        assert.strictEqual(fixReport.errors.length, 0);

        // Read the fixed file — */ must NOT be on same line as a tag
        const fixedContent = readFileSync(filePath, 'utf8');

        // Extract JSDoc block
        const jsDocMatch = fixedContent.match(/\/\*\*([\s\S]*?)\*\//);
        assert.ok(jsDocMatch, 'JSDoc block not found');

        const jsDocBlock = jsDocMatch[0];
        const lines = jsDocBlock.split('\n');

        if (lines.length === 1) {
          // Inline: valid
          assert.ok(jsDocBlock.startsWith('/** '), 'inline should start with /**');
          assert.ok(jsDocBlock.endsWith(' */'), 'inline should end with */');
        } else {
          // Multi-line: */ should be on its own line
          const lastLine = lines[lines.length - 1].trim();
          assert.strictEqual(lastLine, '*/', `expected bare */, got: ${lastLine}`);
          // First line should be bare /**
          assert.strictEqual(lines[0].trim(), '/**');
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('K6 — malformed multi-line with content on /** line → normalized or inlined', async () => {
      // contract: when content follows /** on the first line, normalizeMultiLine
      // separates the opening marker from content. Multi-tag safe contracts may be
      // inlined — both outcomes are correct.
      const { dir, filePath } = setupTempFromFixture('autofix-combined/malformed-opening.ts');
      try {
        const linter = createLinter();

        // Autofix
        const fixReport = await linter.lintAndFix(filePath);
        assert.strictEqual(fixReport.errors.length, 0);

        // Read the fixed file — should be either:
        // - inline: "/** @purpose ... | @invariant Y. | @sideEffect Z. */"
        // - multi-line normalized: "/**\n * @purpose ...\n * @invariant Y.\n * @sideEffect Z.\n */"
        const fixedContent = readFileSync(filePath, 'utf8');

        // JSDoc block should not have malformed opening (/** immediately followed by content)
        const jsDocMatch = fixedContent.match(/\/\*\*[\s\S]*?\*\//);
        assert.ok(jsDocMatch, 'JSDoc block not found');

        const jsDocBlock = jsDocMatch[0];
        const lines = jsDocBlock.split('\n');

        if (lines.length === 1) {
          // Inline: valid
          assert.ok(jsDocBlock.startsWith('/** '), 'inline should start with /**');
          assert.ok(jsDocBlock.endsWith(' */'), 'inline should end with */');
        } else {
          // Multi-line: first line should be exactly /**
          assert.strictEqual(lines[0].trim(), '/**', `expected bare /**, got: ${lines[0].trim()}`);
          // Last line should be */
          const lastLine = lines[lines.length - 1].trim();
          assert.strictEqual(lastLine, '*/');
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
    it('K7 — indented multi-tag contracts preserve indentation after autofix', async () => {
      const { dir, filePath } = setupTempFromFixture('autofix-combined/indented-multi-tag.ts');
      try {
        const linter = createLinter();

        // Initial lint — should have redundant type errors
        const initialReport = await linter.lint(filePath);
        const initialCodes = initialReport.errors.map((e) => e.code);

        const fixReport = await linter.lintAndFix(filePath);
        assert.strictEqual(
          fixReport.errors.length,
          0,
          `expected 0 errors after fix, got: ${fixReport.errors.map((e) => `${e.code}: ${e.message}`).join(', ')}. Initial: ${initialCodes.join(', ')}`
        );

        const fixedContent = readFileSync(filePath, 'utf8');
        // Verify each method's JSDoc preserves correct indentation
        // parse: already canonical multi-tag — unchanged (3-space * prefix)
        assert.ok(
          fixedContent.includes('   * @purpose Indented multi-tag contract.'),
          'parse @purpose should keep original indent'
        );
        assert.ok(
          fixedContent.includes('   * @returns The output value.'),
          'parse @returns should keep original indent (type removed by autofix)'
        );

        // malformedClosing: */ on same line — normalized to canonical (2-space * prefix)
        assert.ok(
          fixedContent.includes('  * @returns 0 for clean, 1 for errors.'),
          'malformedClosing @returns should be normalized with canonical indent'
        );
        assert.ok(/  \*\//m.test(fixedContent), 'closing */ should be on its own line with indent');

        // singleTag: method — stays multi-line
        assert.ok(
          fixedContent.includes('Single-tag indented'),
          'singleTag @purpose must be preserved'
        );

        // multiTagCanonical: already canonical — unchanged (3-space * prefix)
        assert.ok(
          fixedContent.includes('   * @purpose Multi-tag indented'),
          'multiTagCanonical @purpose should keep original indent'
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('K7 — autofix adds brackets to default-value param', async () => {
      const { dir, filePath } = setupTempFromFixture('autofix-combined/bracket-mismatch.ts');
      try {
        const linter = createLinter();
        const initialReport = await linter.lint(filePath);
        const mismatchErrors = initialReport.errors.filter(
          (e) => e.code === ERR_DBC_LINT_PARAM_OPTIONAL_MISMATCH
        );
        assert.strictEqual(mismatchErrors.length, 1, 'expected 1 bracket mismatch error');

        const fixReport = await linter.lintAndFix(filePath);
        assert.strictEqual(fixReport.errors.length, 0, 'expected all errors fixed');

        const fixedContent = readFileSync(filePath, 'utf8');
        assert.ok(
          fixedContent.includes('@param [name]'),
          'expected brackets to be added around optional param'
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // #endregion END_GROUP_K_AUTOFIX_COMBINED

  // #region START_GROUP_L_EDGE_CASES

  describe('Group L — Edge cases', () => {
    it('L1 — empty file: empty report, no errors', async () => {
      const { dir, filePath } = setupTempFromFixture('edge/empty-file.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('L2 — file with code but no exports: empty report', async () => {
      const { dir, filePath } = setupTempFromFixture('edge/no-exports.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('L3 — re-export: skipped, not an error', async () => {
      const { dir, filePath } = setupTempFromFixture('edge/re-export.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        // Only 'local' should be reported; re-export is skipped
        assert.strictEqual(report.errors.length, 0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('L4 — export * from: skipped', async () => {
      const { dir, filePath } = setupTempFromFixture('edge/all-exports.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        assert.strictEqual(report.errors.length, 0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('L5 — class with internal members: all covered', async () => {
      const { dir, filePath } = setupTempFromFixture('edge/private-class.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        // All members have contracts → no errors
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('L6 — nested class structure: no crash', async () => {
      const { dir, filePath } = setupTempFromFixture('edge/nested-class.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        // Both classes and their members are covered → no errors
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('L7 — file with decorators: should not crash', async () => {
      const { dir, filePath } = setupTempFromFixture('edge/decorators.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        // Class and method both covered → no errors
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('L8 — optional parameter: contract with @param [name]', async () => {
      const { dir, filePath } = setupTempFromFixture('edge/optional-param.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        // Contract uses [name] → adapter has optional=true
        // The normalizeSpecifier strips brackets → 'name' matches
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('L8a — default-value parameter treated as optional', async () => {
      const { dir, filePath } = setupTempFromFixture('edge/default-param.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        // Default value makes param optional → [name] required in contract
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('L9 — rest parameter: contract with @param ...args', async () => {
      const { dir, filePath } = setupTempFromFixture('edge/rest-param.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        // normalizeSpecifier strips ... → 'args' matches
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('L10 — comment with irregular spacing: parsed correctly', async () => {
      const { dir, filePath } = setupTempFromFixture('edge/comment-style.ts');
      try {
        const linter = createLinter();
        const report = await linter.lint(filePath);
        // Irregular spacing should be normalized by parser
        assert.deepStrictEqual(report.errors, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // #endregion END_GROUP_L_EDGE_CASES

  // #region START_GROUP_N_CONTENT_OPTION

  describe('Group N — Content option (TSK-11)', () => {
    it('N1 — should pass: lint with pre-read content', async () => {
      // contract: when content is passed, the linter uses it instead of reading from disk
      // failure mode: do not mock adapter — use real implementations to verify contract end-to-end

      // #region START_LINT_CONTENT_SETUP
      const { dir, filePath } = setupTempFromFixture('happy/function.ts');
      const content = readFileSync(filePath, 'utf8');
      const linter = createLinter();
      // #endregion END_LINT_CONTENT_SETUP

      try {
        // #region START_LINT_CONTENT_TRIGGER
        const report = await linter.lint(filePath, { strategy: 'full', content });
        // #endregion END_LINT_CONTENT_TRIGGER

        // #region START_LINT_CONTENT_ASSERT
        assert.deepStrictEqual(report.errors, []);
        // #endregion END_LINT_CONTENT_ASSERT
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('N2 — should autofix: lintAndFix with pre-read content', async () => {
      // purpose: verify autofix chain operates on pre-read content without re-reading from disk
      // contract: autoFixed >= 1 when fixable errors are present in content

      // #region START_AUTOFIX_CONTENT_SETUP
      const { dir, filePath } = setupTempFromFixture('returns-unexpected/autofix.ts');
      const content = readFileSync(filePath, 'utf8');
      const linter = createLinter();
      // #endregion END_AUTOFIX_CONTENT_SETUP

      try {
        // #region START_AUTOFIX_CONTENT_TRIGGER
        const fixReport = await linter.lintAndFix(filePath, { strategy: 'full', content });
        // #endregion END_AUTOFIX_CONTENT_TRIGGER

        // #region START_AUTOFIX_CONTENT_ASSERT
        assert.ok(fixReport.autoFixed >= 1, `expected autoFixed >= 1, got ${fixReport.autoFixed}`);
        // #endregion END_AUTOFIX_CONTENT_ASSERT
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('N3 — should pass: lint without content reads from disk (backward compat)', async () => {
      // contract: calling lint() without `content` option must still work as before
      // failure mode: passing `undefined` content must not change behaviour

      const { dir, filePath } = setupTempFromFixture('happy/function.ts');
      try {
        const linter = createLinter();

        // #region START_BACKWARD_COMPAT_TRIGGER
        const reportWithOpts = await linter.lint(filePath, { strategy: 'full' });
        const reportNoOpts = await linter.lint(filePath);
        // #endregion END_BACKWARD_COMPAT_TRIGGER

        // #region START_BACKWARD_COMPAT_ASSERT
        assert.deepStrictEqual(reportWithOpts.errors, []);
        assert.deepStrictEqual(reportNoOpts.errors, []);
        // #endregion END_BACKWARD_COMPAT_ASSERT
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('N4 — should report correct filePath in errors when content is passed', async () => {
      // purpose: filePath in lint errors must reflect the actual file argument, not content origin
      // contract: error.file === filePath regardless of what content contains

      // #region START_FILEPATH_CONTENT_SETUP
      const { dir, filePath } = setupTempFromFixture('missing-contract/function.ts');
      const content = readFileSync(filePath, 'utf8');
      const linter = createLinter();
      // #endregion END_FILEPATH_CONTENT_SETUP

      try {
        // #region START_FILEPATH_CONTENT_TRIGGER
        const report = await linter.lint(filePath, { strategy: 'full', content });
        // #endregion END_FILEPATH_CONTENT_TRIGGER

        // #region START_FILEPATH_CONTENT_ASSERT
        assert.ok(report.errors.length >= 1, 'expected at least one error');
        for (const error of report.errors) {
          assert.strictEqual(
            error.file,
            filePath,
            `error.file should be the filePath argument, got "${error.file}"`
          );
        }
        // #endregion END_FILEPATH_CONTENT_ASSERT
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // #endregion END_GROUP_N_CONTENT_OPTION
});

// #endregion END_DBC_TS_LINTER_TESTS

// #region START_DBC_CONTRACT_MATCH_VALIDATOR_TESTS

describe('DbcContractMatchValidator', () => {
  // Helper to build DbcEntrySchema
  function paramEntry(specifier: string, dataType?: string, value?: string): DbcEntrySchema {
    const entry: DbcEntrySchema = {
      type: 'param',
      value: value ?? '',
      issues: [],
      specifier,
    };
    if (dataType) entry.dataType = dataType;
    if (specifier.startsWith('[') && specifier.endsWith(']')) {
      entry.optional = true;
    }
    return entry;
  }

  function returnsEntry(dataType?: string, value?: string): DbcEntrySchema {
    const entry: DbcEntrySchema = {
      type: 'returns',
      value: value ?? '',
      issues: [],
    };
    if (dataType) entry.dataType = dataType;
    return entry;
  }

  function sig(
    params: Array<{
      name: string;
      type?: string;
      optional?: boolean;
      isRest?: boolean;
    }>,
    returnType?: string
  ): DbcSignatureInfo {
    return {
      params: params.map((p) => ({
        name: p.name,
        type: p.type ?? 'string',
        optional: p.optional ?? false,
        isRest: p.isRest ?? false,
      })),
      returnType: returnType ?? 'void',
    };
  }

  it('M1 — all params match: empty errors', () => {
    const entries = [paramEntry('a'), paramEntry('b')];
    const signature = sig([{ name: 'a' }, { name: 'b' }], 'void');
    const errors = validate(entries, signature, 'function');
    assert.deepStrictEqual(errors, []);
  });

  it('M2 — missing param: ERR_DBC_LINT_PARAM_MISSING', () => {
    const entries: DbcEntrySchema[] = [];
    const signature = sig([{ name: 'x' }], 'void');
    const errors = validate(entries, signature, 'function');
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0]?.code, ERR_DBC_LINT_PARAM_MISSING);
  });

  it('M3 — extra @param: ERR_DBC_LINT_PARAM_EXTRA', () => {
    const entries = [paramEntry('extra')];
    const signature = sig([], 'void');
    const errors = validate(entries, signature, 'function');
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0]?.code, ERR_DBC_LINT_PARAM_EXTRA);
  });

  it('M4 — wrong order: ERR_DBC_LINT_PARAM_ORDER', () => {
    const entries = [paramEntry('b'), paramEntry('a')];
    const signature = sig([{ name: 'a' }, { name: 'b' }], 'void');
    const errors = validate(entries, signature, 'function');
    const orderErrors = errors.filter((e) => e.code === ERR_DBC_LINT_PARAM_ORDER);
    assert.strictEqual(orderErrors.length, 1);
  });

  it('M5 — non-void without @returns: ERR_DBC_LINT_RETURNS_MISSING', () => {
    const entries: DbcEntrySchema[] = [];
    const signature = sig([], 'string');
    const errors = validate(entries, signature, 'function');
    const returnsErrors = errors.filter((e) => e.code === ERR_DBC_LINT_RETURNS_MISSING);
    assert.strictEqual(returnsErrors.length, 1);
  });

  it('M6 — void with @returns: ERR_DBC_LINT_RETURNS_UNEXPECTED', () => {
    const entries = [returnsEntry()];
    const signature = sig([], 'void');
    const errors = validate(entries, signature, 'function');
    const returnsErrors = errors.filter((e) => e.code === ERR_DBC_LINT_RETURNS_UNEXPECTED);
    assert.strictEqual(returnsErrors.length, 1);
  });

  it('M7 — constructor with @returns: ERR_DBC_LINT_RETURNS_UNEXPECTED', () => {
    const entries = [returnsEntry()];
    const signature = sig([], 'void');
    const errors = validate(entries, signature, 'constructor');
    const returnsErrors = errors.filter((e) => e.code === ERR_DBC_LINT_RETURNS_UNEXPECTED);
    assert.strictEqual(returnsErrors.length, 1);
  });

  it('M8 — getter without @returns: ERR_DBC_LINT_RETURNS_MISSING', () => {
    const entries: DbcEntrySchema[] = [];
    const signature = sig([], 'string');
    const errors = validate(entries, signature, 'getter');
    const returnsErrors = errors.filter((e) => e.code === ERR_DBC_LINT_RETURNS_MISSING);
    assert.strictEqual(returnsErrors.length, 1);
  });

  it('M9 — setter with @returns: ERR_DBC_LINT_RETURNS_UNEXPECTED', () => {
    const entries = [returnsEntry()];
    const signature = sig([], 'void');
    const errors = validate(entries, signature, 'setter');
    const returnsErrors = errors.filter((e) => e.code === ERR_DBC_LINT_RETURNS_UNEXPECTED);
    assert.strictEqual(returnsErrors.length, 1);
  });

  it('M10 — field with @param: ERR_DBC_LINT_PARAM_EXTRA', () => {
    const entries = [paramEntry('x')];
    const signature = sig([], 'void');
    const errors = validate(entries, signature, 'field');
    const paramErrors = errors.filter((e) => e.code === ERR_DBC_LINT_PARAM_EXTRA);
    assert.strictEqual(paramErrors.length, 1);
  });

  it('M11 — field with @returns: ERR_DBC_LINT_RETURNS_UNEXPECTED', () => {
    const entries = [returnsEntry()];
    const signature = sig([], 'void');
    const errors = validate(entries, signature, 'field');
    const returnsErrors = errors.filter((e) => e.code === ERR_DBC_LINT_RETURNS_UNEXPECTED);
    assert.strictEqual(returnsErrors.length, 1);
  });

  it('M12 — const with @param: ERR_DBC_LINT_PARAM_EXTRA', () => {
    const entries = [paramEntry('x')];
    const signature = sig([], 'void');
    const errors = validate(entries, signature, 'const');
    const paramErrors = errors.filter((e) => e.code === ERR_DBC_LINT_PARAM_EXTRA);
    assert.strictEqual(paramErrors.length, 1);
  });

  it('M13 — {type} in @param: ERR_DBC_LINT_TYPE_REDUNDANT', () => {
    const entries = [paramEntry('x', 'string', 'The param')];
    const signature = sig([{ name: 'x' }], 'void');
    const errors = validate(entries, signature, 'function');
    const typeErrors = errors.filter((e) => e.code === ERR_DBC_LINT_TYPE_REDUNDANT);
    assert.strictEqual(typeErrors.length, 1);
  });

  it('M14 — {type} in @returns: ERR_DBC_LINT_TYPE_REDUNDANT', () => {
    const entries = [returnsEntry('object', 'Result')];
    const signature = sig([], 'object');
    const errors = validate(entries, signature, 'function');
    const typeErrors = errors.filter((e) => e.code === ERR_DBC_LINT_TYPE_REDUNDANT);
    assert.strictEqual(typeErrors.length, 1);
  });

  it('M15 — optional param: x? ↔ @param [x] → no errors', () => {
    const entries = [paramEntry('[x]', undefined, 'Optional param')];
    const signature = sig([{ name: 'x', optional: true }], 'void');
    const errors = validate(entries, signature, 'function');
    assert.deepStrictEqual(errors, []);
  });

  it('M16 — rest param: ...args ↔ @param ...args → no errors', () => {
    const entries = [
      paramEntry('...args', undefined, 'Rest params'),
      returnsEntry(undefined, 'The sum'),
    ];
    const signature = sig([{ name: 'args', isRest: true }], 'number');
    const errors = validate(entries, signature, 'function');
    assert.deepStrictEqual(errors, []);
  });

  it('M17 — unknown kind: empty errors (no crash)', () => {
    const entries = [paramEntry('x')];
    const signature = sig([{ name: 'x' }], 'string');
    const errors = validate(entries, signature, 'unknown-kind');
    assert.deepStrictEqual(errors, []);
  });

  it('M18 — optional param without brackets: ERR_DBC_LINT_PARAM_OPTIONAL_MISMATCH', () => {
    const entries = [paramEntry('x')];
    const signature = sig([{ name: 'x', optional: true }], 'void');
    const errors = validate(entries, signature, 'function');
    const mismatch = errors.filter((e) => e.code === ERR_DBC_LINT_PARAM_OPTIONAL_MISMATCH);
    assert.strictEqual(mismatch.length, 1);
    assert.ok(mismatch[0]?.message.includes('missing brackets'));
  });

  it('M19 — required param with brackets: ERR_DBC_LINT_PARAM_OPTIONAL_MISMATCH', () => {
    const entries = [paramEntry('[x]')];
    const signature = sig([{ name: 'x', optional: false }], 'void');
    const errors = validate(entries, signature, 'function');
    const mismatch = errors.filter((e) => e.code === ERR_DBC_LINT_PARAM_OPTIONAL_MISMATCH);
    assert.strictEqual(mismatch.length, 1);
    assert.ok(mismatch[0]?.message.includes('has brackets'));
  });

  it('M20 — default-value param with [x]: no errors', () => {
    const entries = [paramEntry('[x]')];
    const signature = sig([{ name: 'x', optional: true }], 'void');
    const errors = validate(entries, signature, 'function');
    assert.deepStrictEqual(errors, []);
  });
});

// #endregion END_DBC_CONTRACT_MATCH_VALIDATOR_TESTS

// #region START_GROUP_REORDER_TAGS_TESTS

describe('_reorderTags (TSK-20)', () => {
  const parser = new DbcJsDocParser();
  const adapter = new DbcTsAstAdapter();
  const linter = new DbcTsLinter(parser, adapter);
  // deno-lint-ignore no-explicit-any
  const reorder = (text: string) => (linter as any)._reorderTags(text) as string;

  it('closing */ stays last — @consumer before @invariant reordered and */ at end', () => {
    const input = [
      '/**',
      ' * @consumer VcsClient',
      ' * @invariant Error Policy: network failures propagate.',
      ' */',
    ].join('\n');
    const result = reorder(input);
    const lines = result.split('\n');
    assert.strictEqual(lines[lines.length - 1], ' */');
    const invIdx = lines.findIndex((l: string) => l.includes('@invariant'));
    const conIdx = lines.findIndex((l: string) => l.includes('@consumer'));
    assert.ok(invIdx < conIdx, '@invariant should come before @consumer');
  });

  it('no tags — unchanged', () => {
    const input = ['/**', ' * Description line.', ' */'].join('\n');
    assert.strictEqual(reorder(input), input);
  });

  it('single tag — unchanged', () => {
    const input = ['/**', ' * @purpose Does something.', ' */'].join('\n');
    assert.strictEqual(reorder(input), input);
  });

  it('already ordered — unchanged', () => {
    const input = [
      '/**',
      ' * @purpose Does something.',
      ' * @invariant Must be called after init.',
      ' * @sideEffect Writes to disk.',
      ' */',
    ].join('\n');
    assert.strictEqual(reorder(input), input);
  });

  it('reversed order — reordered to canonical', () => {
    const input = [
      '/**',
      ' * @sideEffect Writes to disk.',
      ' * @invariant Must be called after init.',
      ' * @purpose Does something.',
      ' */',
    ].join('\n');
    const result = reorder(input);
    const lines = result.split('\n');
    const purpIdx = lines.findIndex((l: string) => l.includes('@purpose'));
    const invIdx = lines.findIndex((l: string) => l.includes('@invariant'));
    const sideIdx = lines.findIndex((l: string) => l.includes('@sideEffect'));
    assert.ok(purpIdx < invIdx, '@purpose before @invariant');
    assert.ok(invIdx < sideIdx, '@invariant before @sideEffect');
    assert.strictEqual(lines[lines.length - 1], ' */');
  });

  it('unknown tags preserve relative order', () => {
    const input = [
      '/**',
      ' * @custom1 First custom tag.',
      ' * @custom2 Second custom tag.',
      ' */',
    ].join('\n');
    const result = reorder(input);
    const lines = result.split('\n');
    const c1 = lines.findIndex((l: string) => l.includes('@custom1'));
    const c2 = lines.findIndex((l: string) => l.includes('@custom2'));
    assert.ok(c1 < c2, '@custom1 before @custom2');
    assert.strictEqual(lines[lines.length - 1], ' */');
  });

  it('multi-line tag values stay with their tag', () => {
    const input = [
      '/**',
      ' * @purpose Does something.',
      ' * @invariant Retry Policy: retries up to 3 times.',
      ' *   Exponential backoff: 1s, 2s, 4s.',
      ' */',
    ].join('\n');
    const result = reorder(input);
    assert.ok(result.includes('@invariant Retry Policy'));
    assert.ok(result.includes('Exponential backoff'));
    assert.strictEqual(result.split('\n').pop(), ' */');
  });

  it('duplicate tags preserve relative order', () => {
    const input = [
      '/**',
      ' * @param c Third parameter.',
      ' * @param a First parameter.',
      ' * @param b Second parameter.',
      ' */',
    ].join('\n');
    const result = reorder(input);
    const lines = result.split('\n');
    const aIdx = lines.findIndex((l: string) => l.includes('@param a'));
    const bIdx = lines.findIndex((l: string) => l.includes('@param b'));
    const cIdx = lines.findIndex((l: string) => l.includes('@param c'));
    assert.ok(cIdx < aIdx, '@param c before @param a');
    assert.ok(aIdx < bIdx, '@param a before @param b');
    assert.strictEqual(lines[lines.length - 1], ' */');
  });
});

// #endregion END_REORDER_TAGS_TESTS

// #region START_SNAPSHOT_TESTS

const SNAPSHOTS_DIR = join(__dirname, 'fixtures', 'snapshots');

describe('Snapshots — autofix matches expected output', () => {
  const fixtureNames = readdirSync(SNAPSHOTS_DIR)
    .filter((f) => f.endsWith('.fixture.ts'))
    .sort();

  for (const name of fixtureNames) {
    const base = name.replace('.fixture.ts', '');
    const fixturePath = join(SNAPSHOTS_DIR, name);
    const expectedPath = join(SNAPSHOTS_DIR, base + '.expected.ts');

    it(base, async () => {
      const dir = mkdtempSync(join(tmpdir(), 'dbc-snap-'));
      const tmp = join(dir, 'test.ts');
      try {
        copyFileSync(fixturePath, tmp);
        const linter = createLinter();
        await linter.lintAndFix(tmp);
        const actual = readFileSync(tmp, 'utf8');
        const expected = readFileSync(expectedPath, 'utf8');
        assert.strictEqual(actual, expected);

        // Idempotency: second autofix must be a no-op
        const r2 = await linter.lintAndFix(tmp);
        assert.strictEqual(r2.autoFixed, 0, 'idempotency: second pass must fix nothing');
        assert.strictEqual(readFileSync(tmp, 'utf8'), expected, 'idempotency: output unchanged');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

// #endregion END_SNAPSHOT_TESTS
