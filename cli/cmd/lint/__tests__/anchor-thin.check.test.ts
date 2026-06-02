// @file: Unit tests for AnchorThinCheck — validates region thinness (minimum meaningful lines).
// @consumers: LintCommand
// @tasks: TSK-XX

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../checks/anchor-thin.check.ts';
import { ERR_CLI_LINT_ANCHOR_TOO_THIN } from '../lint.types.ts';

const S = '/' + '/';

/**
 * AnchorThinCheck Test Graph:
 * ├── should return no errors for regions with >= 2 meaningful lines
 * ├── should return no errors when content has no regions
 * ├── should report error for empty region (0 meaningful lines)
 * ├── should report error for region with 1 meaningful line
 * ├── should report error for region wrapping only invariant comment
 * ├── should report error for region wrapping only body comments
 * ├── should count nested inner code toward outer total
 * ├── should report error for thin inner inside valid outer
 * ├── should report multiple thin regions
 * ├── should ignore unpaired END (delegate to anchor.check)
 * ├── should ignore unpaired START (delegate to anchor.check)
 * ├── 1 meaningful line + body comment → still too thin
 * └── 1 meaningful line + start annotation → keep annotation message
 */
describe('AnchorThinCheck', () => {
  it('should return no errors for regions with >= 2 meaningful lines', () => {
    // #region START_SETUP_CONTENT
    const content = [
      S + ' #region START_SETUP',
      'const a = 1;',
      'const b = 2;',
      S + ' #endregion END_SETUP',
      '',
      S + ' #region START_PROCESS',
      'const x = process(a);',
      'const y = process(b);',
      'return x + y;',
      S + ' #endregion END_PROCESS',
    ].join('\n');
    // #endregion END_SETUP_CONTENT

    // #region START_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_TRIGGER_CHECK

    // #region START_ASSERT_RESULT
    assert.deepStrictEqual(errors, []);
    // #endregion END_ASSERT_RESULT
  });

  it('should return no errors when content has no regions', () => {
    const content = [
      'import { something } from "./module.ts";',
      '',
      'export function foo() { return 42; }',
    ].join('\n');

    const errors = check(content, 'test.ts');

    assert.deepStrictEqual(errors, []);
  });

  it('should report error for empty region (0 meaningful lines)', () => {
    // #region START_EMPTY_SETUP
    const content = [S + ' #region START_EMPTY', S + ' #endregion END_EMPTY'].join('\n');
    // #endregion END_EMPTY_SETUP

    const errors = check(content, 'test.ts');

    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_TOO_THIN);
    assert.match(errors[0].message, /START_EMPTY/);
    assert.match(errors[0].message, /empty/);
  });

  it('should report error for region with 1 meaningful line', () => {
    const content = [S + ' #region START_THIN', 'doSomething();', S + ' #endregion END_THIN'].join(
      '\n'
    );

    const errors = check(content, 'test.ts');

    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_TOO_THIN);
    assert.match(errors[0].message, /START_THIN/);
    assert.match(errors[0].message, /1 meaningful line/);
  });

  it('should report error for region wrapping only invariant comment (AT-01)', () => {
    const content = [
      S + ' #region START_INVARIANT_ONLY — invariant: x > 0',
      S + ' #endregion END_INVARIANT_ONLY',
    ].join('\n');

    const errors = check(content, 'test.ts');

    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_TOO_THIN);
    assert.match(errors[0].message, /START_INVARIANT_ONLY/);
    assert.match(errors[0].message, /comments/);
  });

  it('should report error for region wrapping only body comments (AT-02)', () => {
    const content = [
      S + ' #region START_DESCRIPTION',
      '// Step 1: validate input',
      '// Step 2: transform data',
      S + ' #endregion END_DESCRIPTION',
    ].join('\n');

    const errors = check(content, 'test.ts');

    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_TOO_THIN);
    assert.match(errors[0].message, /START_DESCRIPTION/);
    assert.match(errors[0].message, /comments/);
  });

  it('should count nested inner code toward outer total (AT-03)', () => {
    const content = [
      S + ' #region START_OUTER',
      S + ' #region START_INNER',
      'const a = 1;',
      'const b = 2;',
      S + ' #endregion END_INNER',
      S + ' #endregion END_OUTER',
    ].join('\n');

    const errors = check(content, 'test.ts');
    // Outer has 2 meaningful lines from inner → passes
    assert.deepStrictEqual(errors, []);
  });

  it('should report error for thin inner inside valid outer (AT-04)', () => {
    const content = [
      S + ' #region START_OUTER',
      S + ' #region START_INNER_THIN',
      'onlyOneLine();',
      S + ' #endregion END_INNER_THIN',
      'const extra = 1;',
      S + ' #endregion END_OUTER',
    ].join('\n');

    const errors = check(content, 'test.ts');

    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_TOO_THIN);
    assert.match(errors[0].message, /START_INNER_THIN/);
  });

  it('should report multiple thin regions (AT-05)', () => {
    const content = [
      S + ' #region START_EMPTY_A',
      S + ' #endregion END_EMPTY_A',
      '',
      S + ' #region START_EMPTY_B',
      S + ' #endregion END_EMPTY_B',
    ].join('\n');

    const errors = check(content, 'test.ts');

    assert.strictEqual(errors.length, 2);
    assert.match(errors[0].message, /START_EMPTY_A/);
    assert.match(errors[1].message, /START_EMPTY_B/);
  });

  it('should ignore unpaired END — delegate to anchor.check (AT-06)', () => {
    const content = ['someCode();', S + ' #endregion END_ORPHAN'].join('\n');

    const errors = check(content, 'test.ts');
    assert.deepStrictEqual(errors, []);
  });

  it('should ignore unpaired START — delegate to anchor.check (AT-07)', () => {
    const content = [S + ' #region START_LONELY', 'someCode();'].join('\n');

    const errors = check(content, 'test.ts');
    assert.deepStrictEqual(errors, []);
  });

  it('1 meaningful line + body comment — still too thin (AT-08)', () => {
    const content = [
      S + ' #region START_MIXED',
      '// explanation',
      'doWork();',
      S + ' #endregion END_MIXED',
    ].join('\n');

    const errors = check(content, 'test.ts');

    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_TOO_THIN);
    assert.match(errors[0].message, /1 meaningful line/);
  });

  it('1 meaningful line + start annotation — keep annotation message (AT-09)', () => {
    const content = [
      S + ' #region START_ANNOTATED — non-blocking; spawn + unref',
      'doOneThing();',
      S + ' #endregion END_ANNOTATED',
    ].join('\n');

    const errors = check(content, 'test.ts');

    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_TOO_THIN);
    assert.match(errors[0].message, /START_ANNOTATED/);
    assert.match(errors[0].message, /annotation/);
    assert.match(errors[0].message, /keep the annotation/);
  });
});
