// @file: Unit tests for LanguageCheck — validates Cyrillic detection in JSDoc contracts and file headers.
// @consumers: LintCommand
// @tasks: TSK-32

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../checks/language.check.ts';
import { ERR_CLI_LINT_NON_ENGLISH } from '../lint.types.ts';

/**
 * LanguageCheck Test Graph:
 * ├── should return no errors for English-only JSDoc and headers
 * ├── should report ERR_CLI_LINT_NON_ENGLISH for Cyrillic in @file: header
 * ├── should report ERR_CLI_LINT_NON_ENGLISH for Cyrillic in @consumers: header
 * ├── should report ERR_CLI_LINT_NON_ENGLISH for Cyrillic in JSDoc contract
 * ├── should not report errors for Cyrillic outside JSDoc and headers
 * ├── should report multiple errors for multiple Cyrillic chars in header
 * └── should return no errors when content has no JSDoc and no headers
 */
describe('LanguageCheck', () => {
  it('should return no errors for English-only JSDoc and headers', () => {
    // #region START_ENGLISH_ONLY_SETUP_CONTENT
    const content = [
      '// @file: English test file.',
      '// @consumers: TestRunner',
      '',
      '/**',
      ' * @purpose A test function.',
      ' * @param x Input value.',
      ' * @returns Result.',
      ' */',
      'export function fn(x: number): number { return x; }',
    ].join('\n');
    // #endregion END_ENGLISH_ONLY_SETUP_CONTENT

    // #region START_ENGLISH_ONLY_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_ENGLISH_ONLY_TRIGGER_CHECK

    // #region START_ENGLISH_ONLY_ASSERT_RESULT
    assert.deepStrictEqual(errors, []);
    // #endregion END_ENGLISH_ONLY_ASSERT_RESULT
  });

  it('should report ERR_CLI_LINT_NON_ENGLISH for Cyrillic in @file: header', () => {
    // #region START_CYRILLIC_FILE_SETUP_CONTENT
    const content = [
      '// @file: Тестовый файл.',
      '// @consumers: TestRunner',
      '',
      'export function fn(): void {}',
    ].join('\n');
    // #endregion END_CYRILLIC_FILE_SETUP_CONTENT

    // #region START_CYRILLIC_FILE_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_CYRILLIC_FILE_TRIGGER_CHECK

    // #region START_CYRILLIC_FILE_ASSERT_RESULT
    assert.ok(errors.length >= 1, 'expected at least 1 Cyrillic error');
    const fileErrors = errors.filter((e) => e.code === ERR_CLI_LINT_NON_ENGLISH);
    assert.strictEqual(fileErrors.length, errors.length);
    assert.match(fileErrors[0].message, /Cyrillic character/);
    // #endregion END_CYRILLIC_FILE_ASSERT_RESULT
  });

  it('should report ERR_CLI_LINT_NON_ENGLISH for Cyrillic in @consumers: header', () => {
    // #region START_CYRILLIC_CONSUMERS_SETUP_CONTENT
    const content = [
      '// @file: Valid file.',
      '// @consumers: Потребитель',
      '',
      'export function fn(): void {}',
    ].join('\n');
    // #endregion END_CYRILLIC_CONSUMERS_SETUP_CONTENT

    // #region START_CYRILLIC_CONSUMERS_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_CYRILLIC_CONSUMERS_TRIGGER_CHECK

    // #region START_CYRILLIC_CONSUMERS_ASSERT_RESULT
    assert.ok(errors.length >= 1, 'expected at least 1 Cyrillic error');
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_NON_ENGLISH);
    assert.match(errors[0].message, /Cyrillic character.*header/);
    // #endregion END_CYRILLIC_CONSUMERS_ASSERT_RESULT
  });

  it('should report ERR_CLI_LINT_NON_ENGLISH for Cyrillic in JSDoc contract', () => {
    // #region START_CYRILLIC_JSDOC_SETUP_CONTENT
    const content = [
      '// @file: Valid file.',
      '// @consumers: TestRunner',
      '',
      '/**',
      ' * @purpose Тестовая функция с русским текстом.',
      ' */',
      'export function fn(): void {}',
    ].join('\n');
    // #endregion END_CYRILLIC_JSDOC_SETUP_CONTENT

    // #region START_CYRILLIC_JSDOC_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_CYRILLIC_JSDOC_TRIGGER_CHECK

    // #region START_CYRILLIC_JSDOC_ASSERT_RESULT
    assert.ok(errors.length >= 1, 'expected at least 1 Cyrillic error');
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_NON_ENGLISH);
    assert.match(errors[0].message, /Cyrillic character.*JSDoc contract/);
    // #endregion END_CYRILLIC_JSDOC_ASSERT_RESULT
  });

  it('should not report errors for Cyrillic outside JSDoc and headers', () => {
    // contract: Cyrillic in regular code or comments is not flagged — only JSDoc and headers
    // #region START_CYRILLIC_OUTSIDE_SETUP_CONTENT
    const content = [
      '// @file: Valid English header.',
      '// @consumers: TestRunner',
      '',
      '// Обычный комментарий с русским текстом — не ошибка',
      'const msg = "Привет"; // тоже не ошибка',
    ].join('\n');
    // #endregion END_CYRILLIC_OUTSIDE_SETUP_CONTENT

    // #region START_CYRILLIC_OUTSIDE_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_CYRILLIC_OUTSIDE_TRIGGER_CHECK

    // #region START_CYRILLIC_OUTSIDE_ASSERT_RESULT
    assert.deepStrictEqual(errors, []);
    // #endregion END_CYRILLIC_OUTSIDE_ASSERT_RESULT
  });

  it('should report multiple errors for multiple Cyrillic chars in header', () => {
    // contract: each Cyrillic character in the header line produces a separate error
    // #region START_MULTIPLE_CYRILLIC_SETUP_CONTENT
    const content = [
      '// @file: Тест.',
      '// @consumers: Тестер',
      '',
      'export function fn(): void {}',
    ].join('\n');
    // #endregion END_MULTIPLE_CYRILLIC_SETUP_CONTENT

    // #region START_MULTIPLE_CYRILLIC_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_MULTIPLE_CYRILLIC_TRIGGER_CHECK

    // #region START_MULTIPLE_CYRILLIC_ASSERT_RESULT
    const fileErrors = errors.filter((e) => e.line === 1);
    const consumersErrors = errors.filter((e) => e.line === 2);
    assert.ok(fileErrors.length >= 3, `expected ≥3 errors on line 1, got ${fileErrors.length}`);
    assert.ok(
      consumersErrors.length >= 5,
      `expected ≥5 errors on line 2, got ${consumersErrors.length}`
    );
    // #endregion END_MULTIPLE_CYRILLIC_ASSERT_RESULT
  });

  it('should return no errors when content has no JSDoc and no headers', () => {
    // #region START_NO_JSDOC_HEADERS_SETUP_CONTENT
    const content = [
      'import { something } from "./module.ts";',
      '',
      'export function foo() { return 42; }',
    ].join('\n');
    // #endregion END_NO_JSDOC_HEADERS_SETUP_CONTENT

    // #region START_NO_JSDOC_HEADERS_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_NO_JSDOC_HEADERS_TRIGGER_CHECK

    // #region START_NO_JSDOC_HEADERS_ASSERT_RESULT
    assert.deepStrictEqual(errors, []);
    // #endregion END_NO_JSDOC_HEADERS_ASSERT_RESULT
  });
});
