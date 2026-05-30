// @file: Unit tests for InvariantCountCheck — validates invariant counting per exported entity.
// @consumers: InvariantCountCheck
// @tasks: TSK-XX

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../invariant-count.check.ts';

function lines(...ls: string[]): string {
  return ls.join('\n');
}

describe('InvariantCountCheck', () => {
  const DEFAULT_THRESHOLD = 3;

  // --- Empty / no entities ---
  it('IC-01: empty file', () => {
    assert.deepStrictEqual(check('', 'f.ts', DEFAULT_THRESHOLD), []);
  });

  it('IC-02: file without exported entities', () => {
    assert.deepStrictEqual(check('const x = 1;', 'f.ts', DEFAULT_THRESHOLD), []);
  });

  it('IC-03: exported function without invariants', () => {
    assert.deepStrictEqual(
      check(lines('export function foo() { return 1; }'), 'f.ts', DEFAULT_THRESHOLD),
      []
    );
  });

  it('IC-04: exported class without invariants', () => {
    assert.deepStrictEqual(
      check(lines('export class Foo { bar() { return 1; } }'), 'f.ts', DEFAULT_THRESHOLD),
      []
    );
  });

  it('IC-05: exported interface without invariants', () => {
    assert.deepStrictEqual(
      check(lines('export interface Foo { bar: string }'), 'f.ts', DEFAULT_THRESHOLD),
      []
    );
  });

  // --- JSDoc @invariant only ---
  it('IC-06: 1 @invariant on function (threshold 3)', () => {
    const src = lines(
      '/**',
      ' * @invariant x is always positive',
      ' */',
      'export function foo() { return 1; }'
    );
    assert.deepStrictEqual(check(src, 'f.ts', DEFAULT_THRESHOLD), []);
  });

  it('IC-07: 2 @invariant on class (threshold 3)', () => {
    const src = lines(
      '/**',
      ' * @invariant name is not empty',
      ' * @invariant age >= 0',
      ' */',
      'export class Foo { bar() {} }'
    );
    assert.deepStrictEqual(check(src, 'f.ts', DEFAULT_THRESHOLD), []);
  });

  it('IC-08: 3 @invariant on function (at threshold)', () => {
    const src = lines(
      '/**',
      ' * @invariant a > 0',
      ' * @invariant b > 0',
      ' * @invariant c > 0',
      ' */',
      'export function foo() { return 1; }'
    );
    assert.deepStrictEqual(check(src, 'f.ts', DEFAULT_THRESHOLD), []);
  });

  it('IC-09: 4 @invariant on class (exceeds threshold)', () => {
    const src = lines(
      '/**',
      ' * @invariant a',
      ' * @invariant b',
      ' * @invariant c',
      ' * @invariant d',
      ' */',
      'export class Foo { bar() {} }'
    );
    const errors = check(src, 'f.ts', DEFAULT_THRESHOLD);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /has 4 invariants/);
    assert.match(errors[0].message, /max 3/);
    assert.match(errors[0].message, /"Foo"/);
  });

  it('IC-10: 5 @invariant on function (exceeds threshold)', () => {
    const src = lines(
      '/**',
      ' * @invariant 1',
      ' * @invariant 2',
      ' * @invariant 3',
      ' * @invariant 4',
      ' * @invariant 5',
      ' */',
      'export function bar() { return 1; }'
    );
    const errors = check(src, 'f.ts', DEFAULT_THRESHOLD);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /has 5 invariants/);
    assert.match(errors[0].message, /"bar"/);
  });

  // --- Region invariants only ---
  it('IC-11: 1 region-invariant inside function body (threshold 3)', () => {
    const src = lines(
      'export function foo() {',
      '  // #region START_VALIDATE — invariant: validate input',
      '  // #endregion END_VALIDATE',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts', DEFAULT_THRESHOLD), []);
  });

  it('IC-12: 3 region-invariants inside class body (at threshold)', () => {
    const src = lines(
      'export class Foo {',
      '  bar() {',
      '    // #region START_A — invariant: a',
      '    // #endregion END_A',
      '    // #region START_B — invariant: b',
      '    // #endregion END_B',
      '    // #region START_C — invariant: c',
      '    // #endregion END_C',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts', DEFAULT_THRESHOLD), []);
  });

  it('IC-13: 4 region-invariants inside function (exceeds threshold)', () => {
    const src = lines(
      'export function foo() {',
      '  // #region START_A — invariant: a',
      '  // #endregion END_A',
      '  // #region START_B — invariant: b',
      '  // #endregion END_B',
      '  // #region START_C — invariant: c',
      '  // #endregion END_C',
      '  // #region START_D — invariant: d',
      '  // #endregion END_D',
      '}'
    );
    const errors = check(src, 'f.ts', DEFAULT_THRESHOLD);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /has 4 invariants/);
    assert.match(errors[0].message, /"foo"/);
  });

  // --- Mixed JSDoc + region ---
  it('IC-14: 2 JSDoc + 2 region = 4 (exceeds threshold)', () => {
    const src = lines(
      '/**',
      ' * @invariant a',
      ' * @invariant b',
      ' */',
      'export class Foo {',
      '  bar() {',
      '    // #region START_X — invariant: x',
      '    // #endregion END_X',
      '    // #region START_Y — invariant: y',
      '    // #endregion END_Y',
      '  }',
      '}'
    );
    const errors = check(src, 'f.ts', DEFAULT_THRESHOLD);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /has 4 invariants/);
  });

  it('IC-15: 1 JSDoc + 1 region = 2 (within threshold)', () => {
    const src = lines(
      '/** @invariant a */',
      'export function foo() {',
      '  // #region START_X — invariant: x',
      '  // #endregion END_X',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts', DEFAULT_THRESHOLD), []);
  });

  // --- Multiple entities ---
  it('IC-16: 3 functions: counts 2, 4, 1 — only the one with 4 errors', () => {
    const src = lines(
      '/** @invariant a @invariant b */',
      'export function f1() { return 1; }',
      '',
      '/** @invariant a @invariant b @invariant c @invariant d */',
      'export function f2() { return 2; }',
      '',
      '/** @invariant a */',
      'export function f3() { return 3; }'
    );
    const errors = check(src, 'f.ts', DEFAULT_THRESHOLD);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /"f2"/);
  });

  it('IC-17: 2 classes both exceed (5 and 6 invariants)', () => {
    const src = lines(
      '/**',
      ' * @invariant a @invariant b @invariant c @invariant d @invariant e',
      ' */',
      'export class C1 { m() {} }',
      '',
      '/**',
      ' * @invariant a @invariant b @invariant c @invariant d @invariant e @invariant f',
      ' */',
      'export class C2 { m() {} }'
    );
    const errors = check(src, 'f.ts', DEFAULT_THRESHOLD);
    assert.strictEqual(errors.length, 2);
  });

  it('IC-18: class exceeds (5), function within limit (2)', () => {
    const src = lines(
      '/** @invariant a @invariant b @invariant c @invariant d @invariant e */',
      'export class Big { m() {} }',
      '',
      '/** @invariant a @invariant b */',
      'export function small() { return 1; }'
    );
    const errors = check(src, 'f.ts', DEFAULT_THRESHOLD);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /"Big"/);
  });

  // --- Threshold variations ---
  it('IC-19: threshold 1, function with 1 invariant (at threshold)', () => {
    const src = lines('/** @invariant a */', 'export function f() { return 1; }');
    assert.deepStrictEqual(check(src, 'f.ts', 1), []);
  });

  it('IC-20: threshold 1, function with 2 invariants (exceeds)', () => {
    const src = lines('/** @invariant a @invariant b */', 'export function f() { return 1; }');
    const errors = check(src, 'f.ts', 1);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /max 1/);
  });

  it('IC-21: threshold 5, function with 5 (at threshold)', () => {
    const src = lines(
      '/** @invariant a @invariant b @invariant c @invariant d @invariant e */',
      'export function f() { return 1; }'
    );
    assert.deepStrictEqual(check(src, 'f.ts', 5), []);
  });

  it('IC-22: threshold 5, function with 6 (exceeds)', () => {
    const src = lines(
      '/** @invariant a @invariant b @invariant c @invariant d @invariant e @invariant f */',
      'export function f() { return 1; }'
    );
    const errors = check(src, 'f.ts', 5);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /max 5/);
  });

  it('IC-23: threshold 10, class with 10 region invariants (at threshold)', () => {
    const src = lines(
      'export class C {',
      '  m() {',
      ...Array.from({ length: 10 }, (_, i) => [
        `    // #region START_R${i} — invariant: r${i}`,
        `    // #endregion END_R${i}`,
      ]).flat(),
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts', 10), []);
  });

  // --- Region without invariant: ---
  it('IC-24: region without "invariant:" — not counted', () => {
    const src = lines(
      '/** @invariant a */',
      'export function foo() {',
      '  // #region START_HELPER',
      '  const x = 1;',
      '  // #endregion END_HELPER',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts', DEFAULT_THRESHOLD), []);
  });

  it('IC-25: region with "invariant:" but no text — still counted', () => {
    const src = lines(
      '/** @invariant a @invariant b @invariant c */',
      'export function foo() {',
      '  // #region START_X — invariant:',
      '  // #endregion END_X',
      '}'
    );
    const errors = check(src, 'f.ts', DEFAULT_THRESHOLD);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /has 4 invariants/);
  });

  // --- Region invariant attribution to enclosing entity ---
  it('IC-26: region-invariant inside class method — attributed to class', () => {
    const src = lines(
      '/** @invariant a @invariant b @invariant c */',
      'export class Foo {',
      '  bar() {',
      '    // #region START_X — invariant: x',
      '    // #endregion END_X',
      '  }',
      '}'
    );
    const errors = check(src, 'f.ts', DEFAULT_THRESHOLD);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /"Foo"/);
    assert.match(errors[0].message, /has 4 invariants/);
  });

  it('IC-27: region-invariant outside exported entity (top-level) — ignored', () => {
    const src = lines(
      '// #region START_TOP — invariant: top-level',
      '// #endregion END_TOP',
      '',
      '/** @invariant a */',
      'export function foo() { return 1; }'
    );
    assert.deepStrictEqual(check(src, 'f.ts', DEFAULT_THRESHOLD), []);
  });

  it('IC-28: @invariant on non-exported function — not counted', () => {
    const src = lines(
      '/** @invariant a @invariant b @invariant c @invariant d */',
      'function helper() { return 1; }',
      '',
      'export function main() { return helper(); }'
    );
    assert.deepStrictEqual(check(src, 'f.ts', DEFAULT_THRESHOLD), []);
  });

  it('IC-29: region-invariant inside non-exported function — ignored', () => {
    const src = lines(
      'function helper() {',
      '  // #region START_X — invariant: a',
      '  // #region START_Y — invariant: b',
      '  // #region START_Z — invariant: c',
      '  // #region START_W — invariant: d',
      '  // #endregion END_W',
      '  // #endregion END_Z',
      '  // #endregion END_Y',
      '  // #endregion END_X',
      '}',
      '',
      'export function main() { return helper(); }'
    );
    assert.deepStrictEqual(check(src, 'f.ts', DEFAULT_THRESHOLD), []);
  });

  // --- Boundary cases ---
  it('IC-30: 3 entities all at threshold (3 each)', () => {
    const src = lines(
      '/** @invariant a @invariant b @invariant c */ export function f1() { return 1; }',
      '/** @invariant a @invariant b @invariant c */ export function f2() { return 2; }',
      '/** @invariant a @invariant b @invariant c */ export function f3() { return 3; }'
    );
    assert.deepStrictEqual(check(src, 'f.ts', DEFAULT_THRESHOLD), []);
  });

  it('IC-31: 3 entities all exceeding (4 each)', () => {
    const src = lines(
      '/** @invariant a @invariant b @invariant c @invariant d */ export function f1() { return 1; }',
      '/** @invariant a @invariant b @invariant c @invariant d */ export function f2() { return 2; }',
      '/** @invariant a @invariant b @invariant c @invariant d */ export function f3() { return 3; }'
    );
    const errors = check(src, 'f.ts', DEFAULT_THRESHOLD);
    assert.strictEqual(errors.length, 3);
  });

  it('IC-32: interface with 4 @invariant (exceeds threshold)', () => {
    const src = lines(
      '/**',
      ' * @invariant a',
      ' * @invariant b',
      ' * @invariant c',
      ' * @invariant d',
      ' */',
      'export interface Config { readonly name: string }'
    );
    const errors = check(src, 'f.ts', DEFAULT_THRESHOLD);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /"Config"/);
  });

  it('IC-33: exported const with @invariant — not counted', () => {
    const src = lines(
      '/** @invariant a @invariant b @invariant c @invariant d */',
      'export const VALUE = 42;'
    );
    assert.deepStrictEqual(check(src, 'f.ts', DEFAULT_THRESHOLD), []);
  });

  it('IC-34: region-invariant inside nested function — attributed to outer exported function', () => {
    const src = lines(
      '/** @invariant a @invariant b @invariant c */',
      'export function outer() {',
      '  function inner() {',
      '    // #region START_X — invariant: in nested',
      '    // #endregion END_X',
      '  }',
      '  return inner();',
      '}'
    );
    const errors = check(src, 'f.ts', DEFAULT_THRESHOLD);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /has 4 invariants/);
    assert.match(errors[0].message, /"outer"/);
  });

  it('IC-35: region-invariant inside arrow function inside class method — attributed to class', () => {
    const src = lines(
      '/** @invariant a @invariant b @invariant c */',
      'export class Foo {',
      '  bar() {',
      '    const fn = () => {',
      '      // #region START_X — invariant: in arrow',
      '      // #endregion END_X',
      '    };',
      '    return fn();',
      '  }',
      '}'
    );
    const errors = check(src, 'f.ts', DEFAULT_THRESHOLD);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /"Foo"/);
  });

  it('IC-36: threshold not specified — defaults to 3', () => {
    // When called with default threshold 3, entities with 3 invariants are fine
    const src = lines(
      '/** @invariant a @invariant b @invariant c */',
      'export function f() { return 1; }'
    );
    assert.deepStrictEqual(check(src, 'f.ts', DEFAULT_THRESHOLD), []);
    // Same src with threshold 2 would fail
    assert.strictEqual(check(src, 'f.ts', 2).length, 1);
  });
});
