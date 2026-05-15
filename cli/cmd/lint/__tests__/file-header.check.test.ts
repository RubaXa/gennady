// @file: Unit tests for FileHeaderCheck — validates @file: and @consumers: detection.
// @consumers: LintCommand
// @tasks: TSK-17

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../checks/file-header.check.ts';
import { ERR_CLI_LINT_MISSING_FILE, ERR_CLI_LINT_MISSING_CONSUMERS } from '../lint.types.ts';

/**
 * FileHeaderCheck Test Graph:
 * ├── should return no errors for a valid header with @file: and @consumers:
 * ├── should report ERR_CLI_LINT_MISSING_FILE when @file: is absent
 * ├── should report ERR_CLI_LINT_MISSING_CONSUMERS when @consumers: is absent
 * ├── should ignore tags placed after the first import statement
 * └── should report both errors for an empty file
 */
describe('FileHeaderCheck', () => {
  it('should return no errors for a valid header with @file: and @consumers:', () => {
    // #region START_VALID_HEADER_SETUP_CONTENT
    const content = [
      '// @file: Test file with valid header.',
      '// @consumers: TestRunner',
      '',
      'import { something } from "./module.ts";',
    ].join('\n');
    // #endregion END_VALID_HEADER_SETUP_CONTENT

    // #region START_VALID_HEADER_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_VALID_HEADER_TRIGGER_CHECK

    // #region START_VALID_HEADER_ASSERT_RESULT
    assert.deepStrictEqual(errors, []);
    // #endregion END_VALID_HEADER_ASSERT_RESULT
  });

  it('should report ERR_CLI_LINT_MISSING_FILE when @file: is absent', () => {
    // #region START_MISSING_FILE_SETUP_CONTENT
    const content = [
      '// @consumers: TestRunner',
      '',
      'import { something } from "./module.ts";',
    ].join('\n');
    // #endregion END_MISSING_FILE_SETUP_CONTENT

    // #region START_MISSING_FILE_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_MISSING_FILE_TRIGGER_CHECK

    // #region START_MISSING_FILE_ASSERT_RESULT
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_MISSING_FILE);
    assert.strictEqual(errors[0].file, 'test.ts');
    // #endregion END_MISSING_FILE_ASSERT_RESULT
  });

  it('should report ERR_CLI_LINT_MISSING_CONSUMERS when @consumers: is absent', () => {
    // #region START_MISSING_CONSUMERS_SETUP_CONTENT
    const content = [
      '// @file: Test file.',
      '',
      'import { something } from "./module.ts";',
    ].join('\n');
    // #endregion END_MISSING_CONSUMERS_SETUP_CONTENT

    // #region START_MISSING_CONSUMERS_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_MISSING_CONSUMERS_TRIGGER_CHECK

    // #region START_MISSING_CONSUMERS_ASSERT_RESULT
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_MISSING_CONSUMERS);
    assert.strictEqual(errors[0].file, 'test.ts');
    // #endregion END_MISSING_CONSUMERS_ASSERT_RESULT
  });

  it('should ignore tags placed after the first import statement', () => {
    // contract: tags after the first import line are invisible to the checker
    // #region START_TAGS_AFTER_IMPORT_SETUP_CONTENT
    const content = [
      'import { something } from "./module.ts";',
      '// @file: This is after import — should be ignored.',
      '// @consumers: ThisIsAlsoIgnored',
    ].join('\n');
    // #endregion END_TAGS_AFTER_IMPORT_SETUP_CONTENT

    // #region START_TAGS_AFTER_IMPORT_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_TAGS_AFTER_IMPORT_TRIGGER_CHECK

    // #region START_TAGS_AFTER_IMPORT_ASSERT_RESULT
    assert.strictEqual(errors.length, 2);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_MISSING_FILE);
    assert.strictEqual(errors[1].code, ERR_CLI_LINT_MISSING_CONSUMERS);
    // #endregion END_TAGS_AFTER_IMPORT_ASSERT_RESULT
  });

  it('should report both errors for an empty file', () => {
    // #region START_EMPTY_FILE_TRIGGER_AND_ASSERT
    const errors = check('', 'test.ts');
    assert.strictEqual(errors.length, 2);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_MISSING_FILE);
    assert.strictEqual(errors[1].code, ERR_CLI_LINT_MISSING_CONSUMERS);
    // #endregion END_EMPTY_FILE_TRIGGER_AND_ASSERT
  });
});
