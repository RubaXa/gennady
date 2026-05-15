// @file: Unit tests for AnchorCheck — validates START/END anchor pairing and nesting.
// @consumers: LintCommand
// @tasks: TSK-17

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../checks/anchor.check.ts';
import {
  ERR_CLI_LINT_ANCHOR_UNPAIRED_START,
  ERR_CLI_LINT_ANCHOR_UNPAIRED_END,
  ERR_CLI_LINT_ANCHOR_NESTING,
} from '../lint.types.ts';

/**
 * AnchorCheck Test Graph:
 * ├── should return no errors for correctly nested anchors
 * ├── should report ERR_CLI_LINT_ANCHOR_UNPAIRED_START for START without matching END
 * ├── should report ERR_CLI_LINT_ANCHOR_UNPAIRED_END for END without matching START
 * ├── should report ERR_CLI_LINT_ANCHOR_NESTING for parent closed before child
 * ├── should report multiple errors sorted by ascending line order
 * └── should return no errors when content has no anchors
 */
describe('AnchorCheck', () => {
  it('should return no errors for correctly nested anchors', () => {
    // #region START_VALID_NESTING_SETUP_CONTENT
    const content = [
      '// #region START_OUTER_BLOCK',
      'code here',
      '// #region START_INNER_BLOCK',
      'inner code',
      '// #endregion END_INNER_BLOCK',
      '// #endregion END_OUTER_BLOCK',
    ].join('\n');
    // #endregion END_VALID_NESTING_SETUP_CONTENT

    // #region START_VALID_NESTING_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_VALID_NESTING_TRIGGER_CHECK

    // #region START_VALID_NESTING_ASSERT_RESULT
    assert.deepStrictEqual(errors, []);
    // #endregion END_VALID_NESTING_ASSERT_RESULT
  });

  it('should report ERR_CLI_LINT_ANCHOR_UNPAIRED_START for START without matching END', () => {
    // #region START_UNPAIRED_START_SETUP_CONTENT
    const content = [
      '// #region START_LONELY_BLOCK',
      'code here',
    ].join('\n');
    // #endregion END_UNPAIRED_START_SETUP_CONTENT

    // #region START_UNPAIRED_START_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_UNPAIRED_START_TRIGGER_CHECK

    // #region START_UNPAIRED_START_ASSERT_RESULT
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_UNPAIRED_START);
    assert.match(errors[0].message, /START_LONELY_BLOCK/);
    // #endregion END_UNPAIRED_START_ASSERT_RESULT
  });

  it('should report ERR_CLI_LINT_ANCHOR_UNPAIRED_END for END without matching START', () => {
    // #region START_UNPAIRED_END_SETUP_CONTENT
    const content = [
      '// #endregion END_ORPHAN_BLOCK',
    ].join('\n');
    // #endregion END_UNPAIRED_END_SETUP_CONTENT

    // #region START_UNPAIRED_END_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_UNPAIRED_END_TRIGGER_CHECK

    // #region START_UNPAIRED_END_ASSERT_RESULT
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_UNPAIRED_END);
    assert.match(errors[0].message, /END_ORPHAN_BLOCK/);
    // #endregion END_UNPAIRED_END_ASSERT_RESULT
  });

  it('should report ERR_CLI_LINT_ANCHOR_NESTING for parent closed before child', () => {
    // contract: when outer END appears while inner START is still open → nesting violation
    // #region START_NESTING_VIOLATION_SETUP_CONTENT
    const content = [
      '// #region START_OUTER',
      '// #region START_INNER',
      '// #endregion END_OUTER',
      '// #endregion END_INNER',
    ].join('\n');
    // #endregion END_NESTING_VIOLATION_SETUP_CONTENT

    // #region START_NESTING_VIOLATION_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_NESTING_VIOLATION_TRIGGER_CHECK

    // #region START_NESTING_VIOLATION_ASSERT_RESULT
    const nestingErrors = errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_NESTING);
    assert.strictEqual(nestingErrors.length, 1);
    assert.match(nestingErrors[0].message, /START_INNER/);
    // #endregion END_NESTING_VIOLATION_ASSERT_RESULT
  });

  it('should report multiple errors sorted by ascending line order', () => {
    // contract: errors are returned in ascending line order — deterministic for consumers
    // #region START_MULTIPLE_ERRORS_SETUP_CONTENT
    const content = [
      '// #region START_A',
      '// #region START_B',
      '// #endregion END_A',
      '// #endregion END_B',
      '',
      '// #region START_C',
    ].join('\n');
    // #endregion END_MULTIPLE_ERRORS_SETUP_CONTENT

    // #region START_MULTIPLE_ERRORS_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_MULTIPLE_ERRORS_TRIGGER_CHECK

    // #region START_MULTIPLE_ERRORS_ASSERT_RESULT
    // observation focus: at least nesting violation (line 3) + unpaired start (line 6)
    assert.ok(errors.length >= 2, `expected at least 2 errors, got ${errors.length}`);
    // Verify ascending line order
    for (let i = 1; i < errors.length; i++) {
      assert.ok(errors[i].line >= errors[i - 1].line, 'errors must be sorted by line');
    }
    // #endregion END_MULTIPLE_ERRORS_ASSERT_RESULT
  });

  it('should return no errors when content has no anchors', () => {
    // #region START_NO_ANCHORS_SETUP_CONTENT
    const content = [
      'import { something } from "./module.ts";',
      '',
      'export function foo() { return 42; }',
    ].join('\n');
    // #endregion END_NO_ANCHORS_SETUP_CONTENT

    // #region START_NO_ANCHORS_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_NO_ANCHORS_TRIGGER_CHECK

    // #region START_NO_ANCHORS_ASSERT_RESULT
    assert.deepStrictEqual(errors, []);
    // #endregion END_NO_ANCHORS_ASSERT_RESULT
  });
});
