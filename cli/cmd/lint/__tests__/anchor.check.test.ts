// @file: Unit tests for AnchorCheck — validates START/END anchor pairing and nesting.
// @consumers: LintCommand
// @tasks: TSK-17, TSK-14

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../checks/anchor.check.ts';
import {
  ERR_CLI_LINT_ANCHOR_UNPAIRED_START,
  ERR_CLI_LINT_ANCHOR_UNPAIRED_END,
  ERR_CLI_LINT_ANCHOR_NESTING,
  ERR_CLI_LINT_ANCHOR_MALFORMED,
} from '../lint.types.ts';

const S = '/' + '/';

/**
 * AnchorCheck Test Graph:
 * ├── should return no errors for correctly nested anchors
 * ├── should report ERR_CLI_LINT_ANCHOR_UNPAIRED_START for START without matching END
 * ├── should report ERR_CLI_LINT_ANCHOR_UNPAIRED_END for END without matching START
 * ├── should report ERR_CLI_LINT_ANCHOR_NESTING for parent closed before child
 * ├── should report multiple errors sorted by ascending line order
 * ├── should return no errors when content has no anchors
 * ├── should report ERR_CLI_LINT_ANCHOR_MALFORMED for bare #endregion without END_
 * ├── should auto-close and not leave unpaired START when bare #endregion matches
 * └── should report ERR_CLI_LINT_ANCHOR_MALFORMED for bare #region without START_
 */
describe('AnchorCheck', () => {
  it('should return no errors for correctly nested anchors', () => {
    // #region START_VALID_NESTING_SETUP_CONTENT
    const content = [
      S + ' #region START_OUTER_BLOCK',
      'code here',
      S + ' #region START_INNER_BLOCK',
      'inner code',
      S + ' #endregion END_INNER_BLOCK',
      S + ' #endregion END_OUTER_BLOCK',
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
    const content = [S + ' #region START_LONELY_BLOCK', 'code here'].join('\n');
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
    const content = [S + ' #endregion END_ORPHAN_BLOCK'].join('\n');
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
      S + ' #region START_OUTER',
      S + ' #region START_INNER',
      S + ' #endregion END_OUTER',
      S + ' #endregion END_INNER',
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
      S + ' #region START_A',
      S + ' #region START_B',
      S + ' #endregion END_A',
      S + ' #endregion END_B',
      '',
      S + ' #region START_C',
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

  it('should report ERR_CLI_LINT_ANCHOR_MALFORMED for bare #endregion without END_', () => {
    // contract: bare #endregion (no END_ prefix) → MALFORMED, auto-close with stack top
    // #region START_BARE_ENDREGION_SETUP
    const content = [
      S + ' #region START_VALIDATE_BOUND',
      'code here',
      S + ' #endregion',
      '',
      'more code',
    ].join('\n');
    // #endregion END_BARE_ENDREGION_SETUP

    // #region START_BARE_ENDREGION_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_BARE_ENDREGION_TRIGGER_CHECK

    // #region START_BARE_ENDREGION_ASSERT_RESULT
    assert.strictEqual(errors.length, 1, `expected 1 error, got ${errors.length}`);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_MALFORMED);
    assert.match(errors[0].message, /#endregion without END_<NAME>/);
    assert.match(errors[0].message, /expected END_VALIDATE_BOUND/);
    assert.match(errors[0].message, /auto-closed/);
    // #endregion END_BARE_ENDREGION_ASSERT_RESULT
  });

  it('should not leave unpaired START when bare #endregion auto-closes', () => {
    // contract: auto-close pops the stack, so no ERR_CLI_LINT_ANCHOR_UNPAIRED_START at EOF
    // #region START_AUTO_CLOSE_SETUP
    const content = [S + ' #region START_MY_BLOCK', 'code', '// #endregion'].join('\n');
    // #endregion END_AUTO_CLOSE_SETUP

    // #region START_AUTO_CLOSE_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_AUTO_CLOSE_TRIGGER_CHECK

    // #region START_AUTO_CLOSE_ASSERT_RESULT
    assert.strictEqual(errors.length, 1, `expected 1 error, got ${errors.length}`);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_MALFORMED);
    // No UNPAIRED_START because stack was popped
    const unpairedStarts = errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_UNPAIRED_START);
    assert.strictEqual(unpairedStarts.length, 0, 'should not have unpaired START');
    // #endregion END_AUTO_CLOSE_ASSERT_RESULT
  });

  it('should report ERR_CLI_LINT_ANCHOR_MALFORMED for bare #endregion with empty stack', () => {
    // contract: bare #endregion with no open block → MALFORMED + no open block message
    // #region START_BARE_ENDREGION_EMPTY_SETUP
    const content = ['code here', S + ' #endregion', 'more code'].join('\n');
    // #endregion END_BARE_ENDREGION_EMPTY_SETUP

    // #region START_BARE_ENDREGION_EMPTY_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_BARE_ENDREGION_EMPTY_TRIGGER_CHECK

    // #region START_BARE_ENDREGION_EMPTY_ASSERT_RESULT
    assert.strictEqual(errors.length, 1, `expected 1 error, got ${errors.length}`);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_MALFORMED);
    assert.match(errors[0].message, /no open block to close/);
    // #endregion END_BARE_ENDREGION_EMPTY_ASSERT_RESULT
  });

  it('should report ERR_CLI_LINT_ANCHOR_MALFORMED for bare #region without START_', () => {
    // contract: bare #region (no START_ prefix) → MALFORMED
    // #region START_BARE_REGION_SETUP
    const content = [S + ' #region', 'code here'].join('\n');
    // #endregion END_BARE_REGION_SETUP

    // #region START_BARE_REGION_TRIGGER_CHECK
    const errors = check(content, 'test.ts');
    // #endregion END_BARE_REGION_TRIGGER_CHECK

    // #region START_BARE_REGION_ASSERT_RESULT
    assert.strictEqual(errors.length, 1, `expected 1 error, got ${errors.length}`);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_MALFORMED);
    assert.match(errors[0].message, /#region without START_<NAME>/);
    // #endregion END_BARE_REGION_ASSERT_RESULT
  });

  it('nested bare #endregion — auto-close uses top of stack, not bottom', () => {
    // contract: START_A → START_B → bare #endregion → auto-closes B, A remains
    const content = [
      S + ' #region START_OUTER',
      S + ' #region START_INNER',
      'code',
      S + ' #endregion',
    ].join('\n');

    const errors = check(content, 'test.ts');

    assert.strictEqual(errors.length, 2, `expected 2 errors, got ${errors.length}`);
    // bare #endregion auto-closes INNER (top of stack)
    const malformed = errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_MALFORMED);
    assert.strictEqual(malformed.length, 1);
    assert.match(malformed[0].message, /expected END_INNER/);
    // OUTER remains on stack → UNPAIRED_START
    const unpaired = errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_UNPAIRED_START);
    assert.strictEqual(unpaired.length, 1);
    assert.match(unpaired[0].message, /START_OUTER/);
  });

  it('double bare #endregion — first auto-closes, second sees empty stack', () => {
    // contract: START_A → bare #endregion → bare #endregion
    const content = [S + ' #region START_ONLY', 'code', S + ' #endregion', '// #endregion'].join('\n');

    const errors = check(content, 'test.ts');

    assert.strictEqual(errors.length, 2, `expected 2 errors, got ${errors.length}`);
    // First: auto-close with START_ONLY
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_MALFORMED);
    assert.match(errors[0].message, /expected END_ONLY/);
    // Second: empty stack
    assert.strictEqual(errors[1].code, ERR_CLI_LINT_ANCHOR_MALFORMED);
    assert.match(errors[1].message, /no open block to close/);
  });

  it('bare #region does NOT push — subsequent END_X is UNPAIRED_END', () => {
    // contract: bare #region → no push → END_FOO has no matching START
    const content = [S + ' #region', 'code', S + ' #endregion END_GHOST'].join('\n');

    const errors = check(content, 'test.ts');

    assert.strictEqual(errors.length, 2, `expected 2 errors, got ${errors.length}`);
    // bare #region → MALFORMED
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_MALFORMED);
    // END_GHOST has no START → UNPAIRED_END
    assert.strictEqual(errors[1].code, ERR_CLI_LINT_ANCHOR_UNPAIRED_END);
    assert.match(errors[1].message, /END_GHOST/);
  });

  it('mix valid + bare anchors — END after auto-close is UNPAIRED', () => {
    // contract: START_A → bare #endregion (auto-closes A) → END_A → UNPAIRED_END
    const content = [S + ' #region START_A', 'code', S + ' #endregion', S + ' #endregion END_A'].join(
      '\n'
    );

    const errors = check(content, 'test.ts');

    assert.strictEqual(errors.length, 2, `expected 2 errors, got ${errors.length}`);
    // bare #endregion → MALFORMED + auto-close A
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_MALFORMED);
    assert.match(errors[0].message, /expected END_A/);
    // END_A — A was already popped → UNPAIRED_END
    assert.strictEqual(errors[1].code, ERR_CLI_LINT_ANCHOR_UNPAIRED_END);
    assert.match(errors[1].message, /END_A/);
  });

  it('3+ unpaired STARTs at EOF — each gets its own error', () => {
    const content = [S + ' #region START_A', S + ' #region START_B', S + ' #region START_C', 'code'].join(
      '\n'
    );

    const errors = check(content, 'test.ts');

    const unpaired = errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_UNPAIRED_START);
    assert.strictEqual(unpaired.length, 3, `expected 3 unpaired, got ${unpaired.length}`);
    assert.match(unpaired[0].message, /START_A/);
    assert.match(unpaired[1].message, /START_B/);
    assert.match(unpaired[2].message, /START_C/);
  });

  it('END with wrong name → UNPAIRED_END + original START stays unpaired', () => {
    const content = [S + ' #region START_X', S + ' #endregion END_Y'].join('\n');

    const errors = check(content, 'test.ts');

    assert.strictEqual(errors.length, 2, `expected 2 errors, got ${errors.length}`);
    // Sorted by line: UNPAIRED_START at line 1, UNPAIRED_END at line 2
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_UNPAIRED_START);
    assert.match(errors[0].message, /START_X/);
    assert.strictEqual(errors[1].code, ERR_CLI_LINT_ANCHOR_UNPAIRED_END);
    assert.match(errors[1].message, /END_Y/);
  });

  it('deep nesting 3+ levels — all correctly paired produces no errors', () => {
    const content = [
      S + ' #region START_A',
      S + ' #region START_B',
      S + ' #region START_C',
      'deep code',
      S + ' #endregion END_C',
      S + ' #endregion END_B',
      S + ' #endregion END_A',
    ].join('\n');

    const errors = check(content, 'test.ts');
    assert.deepStrictEqual(errors, []);
  });

  it('double END for same START — second END is UNPAIRED_END', () => {
    const content = [
      S + ' #region START_ONCE',
      'code',
      S + ' #endregion END_ONCE',
      S + ' #endregion END_ONCE',
    ].join('\n');

    const errors = check(content, 'test.ts');

    assert.strictEqual(errors.length, 1, `expected 1 error, got ${errors.length}`);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_UNPAIRED_END);
    assert.match(errors[0].message, /END_ONCE/);
  });

  it('duplicate START names — both close correctly with no errors', () => {
    const content = [
      S + ' #region START_DUP',
      'first',
      S + ' #endregion END_DUP',
      S + ' #region START_DUP',
      'second',
      S + ' #endregion END_DUP',
    ].join('\n');

    const errors = check(content, 'test.ts');
    assert.deepStrictEqual(errors, []);
  });

  it('trailing whitespace after bare #endregion — still MALFORMED', () => {
    const content = [S + ' #region START_WS', 'code', '// #endregion   '].join('\n');

    const errors = check(content, 'test.ts');

    assert.strictEqual(errors.length, 1, `expected 1 error, got ${errors.length}`);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_MALFORMED);
    assert.match(errors[0].message, /expected END_WS/);
  });

  it('valid anchor with trailing text — still matched as valid', () => {
    const content = [
      S + ' #region START_A extra text here',
      'code',
      S + ' #endregion END_A trailing',
    ].join('\n');

    const errors = check(content, 'test.ts');
    assert.deepStrictEqual(errors, []);
  });

  it('lowercase start/end — silently ignored (not an error, not a match)', () => {
    const content = ['// #region start_lower', 'code', '// #endregion end_lower'].join('\n');

    const errors = check(content, 'test.ts');
    assert.deepStrictEqual(errors, []);
  });

  it('anchor-like text inside a string literal — not matched', () => {
    const content = [
      'const msg = "// #region START_FAKE";',
      'const end = "// #endregion END_FAKE";',
    ].join('\n');

    const errors = check(content, 'test.ts');
    assert.deepStrictEqual(errors, []);
  });

  it('bare #region followed by bare #endregion — both malformed, second sees empty stack', () => {
    const content = [S + ' #region', 'code', '// #endregion'].join('\n');

    const errors = check(content, 'test.ts');

    assert.strictEqual(errors.length, 2, `expected 2 errors, got ${errors.length}`);
    assert.strictEqual(errors[0].code, ERR_CLI_LINT_ANCHOR_MALFORMED);
    assert.match(errors[0].message, /#region without START_/);
    assert.strictEqual(errors[1].code, ERR_CLI_LINT_ANCHOR_MALFORMED);
    assert.match(errors[1].message, /no open block to close/);
  });
});
