// @file: Tests for consecutive START detection in AnchorCheck.
// @consumers: AnchorCheck
// @tasks: TSK-XX

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../anchor.check.ts';
import { ERR_CLI_LINT_ANCHOR_CONSECUTIVE_START } from '../../lint.types.ts';

function lines(...ls: string[]): string {
  return ls.join('\n');
}

function hasConsecutiveError(errors: ReturnType<typeof check>, name: string): boolean {
  return errors.some(
    (e) => e.code === ERR_CLI_LINT_ANCHOR_CONSECUTIVE_START && e.message.includes(name)
  );
}

describe('AnchorCheck — consecutive START', () => {
  it('CS-01: single paired region — no errors', () => {
    const src = lines('// #region START_A', 'code();', '// #endregion END_A');
    const errors = check(src, 'f.ts');
    assert.strictEqual(
      errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_CONSECUTIVE_START).length,
      0
    );
  });

  it('CS-02: sequential non-consecutive STARTs (A closes before B)', () => {
    const src = lines(
      '// #region START_A',
      'code();',
      '// #endregion END_A',
      '// #region START_B',
      'code();',
      '// #endregion END_B'
    );
    const errors = check(src, 'f.ts');
    assert.strictEqual(
      errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_CONSECUTIVE_START).length,
      0
    );
  });

  it('CS-03: START_A → START_B on adjacent lines, same depth (top-level)', () => {
    const src = lines(
      '// #region START_A',
      '// #region START_B',
      'code();',
      '// #endregion END_B',
      '// #endregion END_A'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasConsecutiveError(errors, 'START_B'));
  });

  it('CS-04: START_A → START_B on adjacent lines, inside method (same depth)', () => {
    const src = lines(
      'function foo() {',
      '  // #region START_A',
      '  // #region START_B',
      '  code();',
      '  // #endregion END_B',
      '  // #endregion END_A',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasConsecutiveError(errors, 'START_B'));
  });

  it('CS-05: START_A → empty line → START_B (one empty line)', () => {
    const src = lines(
      '// #region START_A',
      '',
      '// #region START_B',
      'code();',
      '// #endregion END_B',
      '// #endregion END_A'
    );
    const errors = check(src, 'f.ts');
    // START_B is still at the same depth as START_A, and A is still open
    assert.ok(hasConsecutiveError(errors, 'START_B'));
  });

  it('CS-06: START_A → comment → START_B (comment between, same depth)', () => {
    const src = lines(
      '// #region START_A',
      '// some comment',
      '// #region START_B',
      'code();',
      '// #endregion END_B',
      '// #endregion END_A'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasConsecutiveError(errors, 'START_B'));
  });

  it('CS-07: START_A at top-level → START_B inside function (different depths — valid nesting)', () => {
    const src = lines(
      '// #region START_OUTER',
      'function foo() {',
      '  // #region START_INNER',
      '  code();',
      '  // #endregion END_INNER',
      '}',
      '// #endregion END_OUTER'
    );
    const errors = check(src, 'f.ts');
    assert.strictEqual(
      errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_CONSECUTIVE_START).length,
      0
    );
  });

  it('CS-08: START_A at top-level → START_B inside class method (different depths)', () => {
    const src = lines(
      '// #region START_OUTER',
      'class Foo {',
      '  bar() {',
      '    // #region START_INNER',
      '    code();',
      '    // #endregion END_INNER',
      '  }',
      '}',
      '// #endregion END_OUTER'
    );
    const errors = check(src, 'f.ts');
    assert.strictEqual(
      errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_CONSECUTIVE_START).length,
      0
    );
  });

  it('CS-09: START_A inside method → START_B deeper (inside if — valid nesting)', () => {
    const src = lines(
      'function foo() {',
      '  // #region START_A',
      '  if (true) {',
      '    // #region START_B',
      '    code();',
      '    // #endregion END_B',
      '  }',
      '  // #endregion END_A',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.strictEqual(
      errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_CONSECUTIVE_START).length,
      0
    );
  });

  it('CS-10: START_A → code → START_B (significant code between, not consecutive)', () => {
    const src = lines(
      '// #region START_A',
      'const x = computeSomething();',
      '// #region START_B',
      'code();',
      '// #endregion END_B',
      '// #endregion END_A'
    );
    const errors = check(src, 'f.ts');
    assert.strictEqual(
      errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_CONSECUTIVE_START).length,
      0
    );
  });

  it('CS-11: START_A → END_A → START_B → START_C (B and C consecutive)', () => {
    const src = lines(
      '// #region START_A',
      '// #endregion END_A',
      '// #region START_B',
      '// #region START_C',
      'code();',
      '// #endregion END_C',
      '// #endregion END_B'
    );
    const errors = check(src, 'f.ts');
    const consecErrors = errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_CONSECUTIVE_START);
    assert.strictEqual(consecErrors.length, 1);
    assert.ok(consecErrors[0].message.startsWith('START_C'));
    assert.ok(!consecErrors.some((e) => e.message.startsWith('START_B')));
  });

  it('CS-12: START_A → START_B (consecutive) → correctly nested ENDs — only consecutive error', () => {
    const src = lines(
      '// #region START_A',
      '// #region START_B',
      'code();',
      '// #endregion END_B',
      '// #endregion END_A'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasConsecutiveError(errors, 'START_B'));
  });

  it('CS-13: three consecutive STARTs at same depth', () => {
    const src = lines(
      '// #region START_A',
      '// #region START_B',
      '// #region START_C',
      'code();',
      '// #endregion END_C',
      '// #endregion END_B',
      '// #endregion END_A'
    );
    const errors = check(src, 'f.ts');
    const consec = errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_CONSECUTIVE_START);
    assert.strictEqual(consec.length, 2);
    assert.ok(hasConsecutiveError(errors, 'START_B'));
    assert.ok(hasConsecutiveError(errors, 'START_C'));
  });

  it('CS-14: triple consecutive STARTs all eventually closed', () => {
    const src = lines(
      '// #region START_A',
      '// #region START_B',
      '// #region START_C',
      'code();',
      '// #endregion END_C',
      '// #endregion END_B',
      '// #endregion END_A'
    );
    const errors = check(src, 'f.ts');
    const consec = errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_CONSECUTIVE_START);
    assert.strictEqual(consec.length, 2);
    assert.ok(hasConsecutiveError(errors, 'START_B'));
    assert.ok(hasConsecutiveError(errors, 'START_C'));
  });

  it('CS-15: START_A inside class method → START_B at class body (different depths — valid nesting)', () => {
    const src = lines(
      'class Foo {',
      '  bar() {',
      '    // #region START_INNER',
      '    code();',
      '  }',
      '  // #region START_OUTER',
      '  baz() {}',
      '  // #endregion END_OUTER',
      '  // #endregion END_INNER',
      '}'
    );
    // START_INNER is inside method (depth >= 2), START_OUTER is at class body (depth == 1)
    // They are at different depths so no consecutive error
    const errors = check(src, 'f.ts');
    assert.strictEqual(
      errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_CONSECUTIVE_START).length,
      0
    );
  });

  it('CS-16: two STARTs at class body level (same depth) — both AT_CLASS_BODY and CONSECUTIVE_START', () => {
    const src = lines(
      'class Foo {',
      '  // #region START_A',
      '  // #region START_B',
      '  // #endregion END_B',
      '  // #endregion END_A',
      '}'
    );
    const errors = check(src, 'f.ts');
    // Both are at class body level, and consecutive
    assert.ok(hasConsecutiveError(errors, 'START_B'));
  });

  it('CS-17: START_A in method → START_B in if inside same method (different depths — valid nesting)', () => {
    const src = lines(
      'function foo() {',
      '  // #region START_METHOD',
      '  if (true) {',
      '    // #region START_IF',
      '    code();',
      '    // #endregion END_IF',
      '  }',
      '  // #endregion END_METHOD',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.strictEqual(
      errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_CONSECUTIVE_START).length,
      0
    );
  });

  it('CS-18: START_A → END_X (different region) → START_B — not consecutive, END_X between', () => {
    // START_X opens and closes between A and B; A had content so X is not consecutive with A;
    // B opens after END_X closed, so A is no longer the "last start" at this depth
    const src = lines(
      '// #region START_A',
      'const a = 1;',
      '// #region START_X',
      '// #endregion END_X',
      '// #region START_B',
      'code();',
      '// #endregion END_B',
      '// #endregion END_A'
    );
    const errors = check(src, 'f.ts');
    assert.strictEqual(
      errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_CONSECUTIVE_START).length,
      0
    );
  });

  it('CS-19: START_A → lots of code → START_B — not consecutive', () => {
    const src = lines(
      '// #region START_A',
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
      '// #region START_B',
      'code();',
      '// #endregion END_B',
      '// #endregion END_A'
    );
    const errors = check(src, 'f.ts');
    assert.strictEqual(
      errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_CONSECUTIVE_START).length,
      0
    );
  });
});
