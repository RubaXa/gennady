// @file: Unit tests for AnchorClassBodyCheck — validates region placement at class body level.
// @consumers: AnchorClassBodyCheck
// @tasks: TSK-XX

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../anchor-class-body.check.ts';
import { ERR_CLI_LINT_ANCHOR_AT_CLASS_BODY } from '../../lint.types.ts';

function lines(...ls: string[]): string {
  return ls.join('\n');
}

function hasError(errors: ReturnType<typeof check>, expectedName: string): boolean {
  return errors.some(
    (e) => e.code === ERR_CLI_LINT_ANCHOR_AT_CLASS_BODY && e.message.includes(expectedName)
  );
}

describe('AnchorClassBodyCheck', () => {
  // ============================================================
  // Group A: Top-level (no class) — regions allowed
  // ============================================================
  it('AB-01: top-level function without regions', () => {
    assert.deepStrictEqual(check(lines('export function foo() { return 1; }'), 'f.ts'), []);
  });

  it('AB-02: region wrapping one top-level function', () => {
    const src = lines(
      '// #region START_FOO',
      'export function foo() { return 1; }',
      '// #endregion END_FOO'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-03: region wrapping several top-level functions', () => {
    const src = lines(
      '// #region START_GROUP',
      'export function f1() { return 1; }',
      'export function f2() { return 2; }',
      '// #endregion END_GROUP'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-04: START and END both inside one top-level function', () => {
    const src = lines(
      'export function foo() {',
      '  // #region START_INNER',
      '  const x = 1;',
      '  // #endregion END_INNER',
      '  return x;',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-05: START outside function, END inside the same function (cross-boundary, top-level)', () => {
    const src = lines(
      '// #region START_CROSS',
      'export function foo() {',
      '  const x = 1;',
      '  // #endregion END_CROSS',
      '  return x;',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  // ============================================================
  // Group B: Class — regions inside methods (valid)
  // ============================================================
  it('AB-06: class without regions', () => {
    const src = lines('export class Foo {', '  bar() { return 1; }', '}');
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-07: region inside method body', () => {
    const src = lines(
      'export class Foo {',
      '  bar() {',
      '    // #region START_INNER',
      '    const x = 1;',
      '    // #endregion END_INNER',
      '    return x;',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-08: region inside getter', () => {
    const src = lines(
      'export class Foo {',
      '  get name() {',
      '    // #region START_GETTER',
      '    return "foo";',
      '    // #endregion END_GETTER',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-09: region inside setter', () => {
    const src = lines(
      'export class Foo {',
      '  set name(v: string) {',
      '    // #region START_SETTER',
      '    this._name = v;',
      '    // #endregion END_SETTER',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-10: region inside constructor', () => {
    const src = lines(
      'export class Foo {',
      '  constructor() {',
      '    // #region START_CTOR',
      '    this.x = 1;',
      '    // #endregion END_CTOR',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-11: region inside static method', () => {
    const src = lines(
      'export class Foo {',
      '  static create() {',
      '    // #region START_STATIC',
      '    return new Foo();',
      '    // #endregion END_STATIC',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-12: region inside async method', () => {
    const src = lines(
      'export class Foo {',
      '  async fetch() {',
      '    // #region START_ASYNC',
      '    return 1;',
      '    // #endregion END_ASYNC',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-13: region inside method with access modifier', () => {
    const src = lines(
      'export class Foo {',
      '  private compute() {',
      '    // #region START_PRIVATE',
      '    return 1;',
      '    // #endregion END_PRIVATE',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-14: two sequential regions inside one method', () => {
    const src = lines(
      'export class Foo {',
      '  bar() {',
      '    // #region START_A',
      '    const a = 1;',
      '    // #endregion END_A',
      '    // #region START_B',
      '    const b = 2;',
      '    // #endregion END_B',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-15: nested regions inside one method', () => {
    const src = lines(
      'export class Foo {',
      '  bar() {',
      '    // #region START_OUTER',
      '    // #region START_INNER',
      '    const x = 1;',
      '    // #endregion END_INNER',
      '    // #endregion END_OUTER',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-16: region inside arrow function property', () => {
    const src = lines(
      'export class Foo {',
      '  bar = () => {',
      '    // #region START_ARROW',
      '    return 1;',
      '    // #endregion END_ARROW',
      '  };',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-17: region inside if block inside method', () => {
    const src = lines(
      'export class Foo {',
      '  bar() {',
      '    if (true) {',
      '      // #region START_IF',
      '      const x = 1;',
      '      // #endregion END_IF',
      '    }',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-18: region inside for loop inside method', () => {
    const src = lines(
      'export class Foo {',
      '  bar() {',
      '    for (const x of [1]) {',
      '      // #region START_FOR',
      '      console.log(x);',
      '      // #endregion END_FOR',
      '    }',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-19: region inside while loop inside method', () => {
    const src = lines(
      'export class Foo {',
      '  bar() {',
      '    while (true) {',
      '      // #region START_WHILE',
      '      break;',
      '      // #endregion END_WHILE',
      '    }',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-20: region inside try/catch inside method', () => {
    const src = lines(
      'export class Foo {',
      '  bar() {',
      '    try {',
      '      // #region START_TRY',
      '      risky();',
      '      // #endregion END_TRY',
      '    } catch {',
      '    }',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-21: region inside switch block inside method', () => {
    const src = lines(
      'export class Foo {',
      '  bar() {',
      '    switch (1) {',
      '      case 1:',
      '        // #region START_SWITCH',
      '        break;',
      '        // #endregion END_SWITCH',
      '    }',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-22: region inside nested function inside method', () => {
    const src = lines(
      'export class Foo {',
      '  bar() {',
      '    function inner() {',
      '      // #region START_NESTED',
      '      return 1;',
      '      // #endregion END_NESTED',
      '    }',
      '    return inner();',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-23: region inside nested arrow function inside method', () => {
    const src = lines(
      'export class Foo {',
      '  bar() {',
      '    const fn = () => {',
      '      // #region START_ARROW2',
      '      return 1;',
      '      // #endregion END_ARROW2',
      '    };',
      '    return fn();',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-24: deeply nested region: method → if → for → region', () => {
    const src = lines(
      'export class Foo {',
      '  bar() {',
      '    if (true) {',
      '      for (const x of [1]) {',
      '        // #region START_DEEP',
      '        console.log(x);',
      '        // #endregion END_DEEP',
      '      }',
      '    }',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  // ============================================================
  // Group C: Class — regions at class body level (errors)
  // ============================================================
  it('AB-25: START and END at class body level (between methods)', () => {
    const src = lines(
      'export class Foo {',
      '  // #region START_MID',
      '  // #endregion END_MID',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(errors.length >= 1);
    assert.ok(hasError(errors, 'START_MID'));
  });

  it('AB-26: region wrapping one complete method at class body level', () => {
    const src = lines(
      'export class Foo {',
      '  // #region START_WRAP',
      '  bar() { return 1; }',
      '  // #endregion END_WRAP',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_WRAP'));
    assert.ok(hasError(errors, 'END_WRAP'));
  });

  it('AB-27: region wrapping several methods at class body level', () => {
    const src = lines(
      'export class Foo {',
      '  // #region START_MULTI',
      '  bar() { return 1; }',
      '  baz() { return 2; }',
      '  // #endregion END_MULTI',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_MULTI'));
    assert.ok(hasError(errors, 'END_MULTI'));
  });

  it('AB-28: empty region at class body level', () => {
    const src = lines(
      'export class Foo {',
      '  // #region START_EMPTY',
      '  // #endregion END_EMPTY',
      '  bar() { return 1; }',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_EMPTY'));
    assert.ok(hasError(errors, 'END_EMPTY'));
  });

  it('AB-29: region wrapping a property at class body level', () => {
    const src = lines(
      'export class Foo {',
      '  // #region START_PROP',
      '  readonly name: string = "foo";',
      '  // #endregion END_PROP',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_PROP'));
    assert.ok(hasError(errors, 'END_PROP'));
  });

  it('AB-30: START between methods, END between methods below', () => {
    const src = lines(
      'export class Foo {',
      '  bar() { return 1; }',
      '  // #region START_GAP',
      '  baz() { return 2; }',
      '  // #endregion END_GAP',
      '  qux() { return 3; }',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_GAP'));
    assert.ok(hasError(errors, 'END_GAP'));
  });

  it('AB-31: only START at class body level (no END in file)', () => {
    const src = lines(
      'export class Foo {',
      '  // #region START_ORPHAN',
      '  bar() { return 1; }',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_ORPHAN'));
  });

  it('AB-32: only END at class body level (no START in file)', () => {
    const src = lines(
      'export class Foo {',
      '  bar() { return 1; }',
      '  // #endregion END_ORPHAN',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'END_ORPHAN'));
  });

  it('AB-33: three regions at class body level in one class', () => {
    const src = lines(
      'export class Foo {',
      '  // #region START_A',
      '  // #endregion END_A',
      '  // #region START_B',
      '  // #endregion END_B',
      '  // #region START_C',
      '  // #endregion END_C',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.strictEqual(
      errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_AT_CLASS_BODY).length,
      6
    );
  });

  it('AB-34: region at class body level with extends', () => {
    const src = lines(
      'export class Foo extends Base {',
      '  // #region START_EXT',
      '  // #endregion END_EXT',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_EXT'));
  });

  it('AB-35: region at class body level with implements', () => {
    const src = lines(
      'export class Foo implements IFoo {',
      '  // #region START_IMPL',
      '  // #endregion END_IMPL',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_IMPL'));
  });

  it('AB-36: region at abstract class body level', () => {
    const src = lines(
      'export abstract class Foo {',
      '  // #region START_ABS',
      '  // #endregion END_ABS',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_ABS'));
  });

  it('AB-37: region at exported default class body level', () => {
    const src = lines(
      'export default class Foo {',
      '  // #region START_DEF',
      '  // #endregion END_DEF',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_DEF'));
  });

  // ============================================================
  // Group D: Class — method split by region (cross-boundary errors)
  // ============================================================
  it('AB-38: START at class body, END inside method (splits method)', () => {
    const src = lines(
      'export class Foo {',
      '  // #region START_SPLIT',
      '  bar() {',
      '    const x = 1;',
      '  // #endregion END_SPLIT',
      '    return x;',
      '  }',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_SPLIT'));
  });

  it('AB-39: START inside method, END at class body (splits method)', () => {
    const src = lines(
      'export class Foo {',
      '  bar() {',
      '    // #region START_SPLIT2',
      '    const x = 1;',
      '  }',
      '  // #endregion END_SPLIT2',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'END_SPLIT2'));
  });

  it('AB-40: START at class body level in class A, END inside method of class B', () => {
    const src = lines(
      'export class A {',
      '  // #region START_CROSS_CLASS',
      '  bar() { return 1; }',
      '}',
      '',
      'export class B {',
      '  baz() {',
      '    const x = 1;',
      '  // #endregion END_CROSS_CLASS',
      '    return x;',
      '  }',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_CROSS_CLASS'));
  });

  it('AB-41: START at class body, method gap, END inside method body', () => {
    const src = lines(
      'export class Foo {',
      '  // #region START_GAP2',
      '',
      '  bar() {',
      '    const x = 1;',
      '  // #endregion END_GAP2',
      '    return x;',
      '  }',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_GAP2'));
  });

  // ============================================================
  // Group E: Namespace
  // ============================================================
  it('AB-42: namespace without regions', () => {
    const src = lines('export namespace N {', '  export function f() { return 1; }', '}');
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-43: region at namespace body level (between functions)', () => {
    const src = lines(
      'export namespace N {',
      '  // #region START_NS',
      '  export function f() { return 1; }',
      '  // #endregion END_NS',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_NS'));
  });

  it('AB-44: region inside function inside namespace', () => {
    const src = lines(
      'export namespace N {',
      '  export function f() {',
      '    // #region START_NS_FN',
      '    return 1;',
      '    // #endregion END_NS_FN',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-45: class inside namespace, region at class body level', () => {
    const src = lines(
      'export namespace N {',
      '  export class C {',
      '    // #region START_NS_CLASS',
      '    // #endregion END_NS_CLASS',
      '  }',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_NS_CLASS'));
  });

  it('AB-46: class inside namespace, region inside method', () => {
    const src = lines(
      'export namespace N {',
      '  export class C {',
      '    m() {',
      '      // #region START_NS_METHOD',
      '      return 1;',
      '      // #endregion END_NS_METHOD',
      '    }',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  // ============================================================
  // Group F: Multiple classes / mixed scenarios
  // ============================================================
  it('AB-47: two classes, both with regions at body level', () => {
    const src = lines(
      'export class A {',
      '  // #region START_A',
      '  // #endregion END_A',
      '}',
      'export class B {',
      '  // #region START_B',
      '  // #endregion END_B',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_A'));
    assert.ok(hasError(errors, 'START_B'));
  });

  it('AB-48: one class with region inside method (OK), another with region at body level (ERROR)', () => {
    const src = lines(
      'export class A {',
      '  m() {',
      '    // #region START_OK',
      '    return 1;',
      '    // #endregion END_OK',
      '  }',
      '}',
      'export class B {',
      '  // #region START_ERR',
      '  // #endregion END_ERR',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(!hasError(errors, 'START_OK'));
    assert.ok(hasError(errors, 'START_ERR'));
  });

  it('AB-49: three classes, all with regions at body level', () => {
    const src = lines(
      'export class A {',
      '  // #region START_A3 // #endregion END_A3',
      '}',
      'export class B {',
      '  // #region START_B3 // #endregion END_B3',
      '}',
      'export class C {',
      '  // #region START_C3 // #endregion END_C3',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(errors.filter((e) => e.code === ERR_CLI_LINT_ANCHOR_AT_CLASS_BODY).length >= 3);
  });

  it('AB-50: class with region inside method + top-level function with region (both OK)', () => {
    const src = lines(
      'export class C {',
      '  m() {',
      '    // #region START_C_OK',
      '    return 1;',
      '    // #endregion END_C_OK',
      '  }',
      '}',
      '',
      '// #region START_TOP',
      'export function f() { return 1; }',
      '// #endregion END_TOP'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-51: class with region at body level (ERROR) + top-level function with region (OK)', () => {
    const src = lines(
      'export class C {',
      '  // #region START_C_ERR',
      '  // #endregion END_C_ERR',
      '}',
      '',
      '// #region START_TOP',
      'export function f() { return 1; }',
      '// #endregion END_TOP'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_C_ERR'));
    assert.ok(!hasError(errors, 'START_TOP'));
  });

  it('AB-52: class with 2 region-inside-method (OK) + 2 region-at-body-level (ERROR)', () => {
    const src = lines(
      'export class Foo {',
      '  // #region START_BODY1',
      '  // #endregion END_BODY1',
      '  m1() {',
      '    // #region START_OK1',
      '    return 1;',
      '    // #endregion END_OK1',
      '  }',
      '  // #region START_BODY2',
      '  // #endregion END_BODY2',
      '  m2() {',
      '    // #region START_OK2',
      '    return 2;',
      '    // #endregion END_OK2',
      '  }',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_BODY1'));
    assert.ok(hasError(errors, 'START_BODY2'));
    assert.ok(!hasError(errors, 'START_OK1'));
    assert.ok(!hasError(errors, 'START_OK2'));
  });

  // ============================================================
  // Group G: Brace parsing edge cases
  // ============================================================
  it('AB-53: { in string literal inside method — does not affect depth', () => {
    const src = lines(
      'export class Foo {',
      '  bar() {',
      '    const x = "{";',
      '    // #region START_STR',
      '    console.log(x);',
      '    // #endregion END_STR',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-54: } in string literal inside method — does not affect depth', () => {
    const src = lines(
      'export class Foo {',
      '  bar() {',
      '    const x = "}";',
      '    // #region START_STR2',
      '    console.log(x);',
      '    // #endregion END_STR2',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-55: { in string literal at class body level — does not trigger false method entry', () => {
    const src = lines(
      'export class Foo {',
      '  private x = "{";',
      '  // SHOULD be at class body level — ERROR',
      '  // #region START_BODY_STR',
      '  // #endregion END_BODY_STR',
      '}'
    );
    const errors = check(src, 'f.ts');
    // The { in string should be stripped, so region IS at class body level => ERROR
    assert.ok(hasError(errors, 'START_BODY_STR'));
  });

  it('AB-56: object literal in class property — does not create "method"', () => {
    const src = lines(
      'export class Foo {',
      '  private foo = { bar: 1 };',
      '  // #region START_AFTER_OBJ',
      '  // #endregion END_AFTER_OBJ',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_AFTER_OBJ'));
  });

  it('AB-57: destructuring in method parameter — does not affect depth', () => {
    const src = lines(
      'export class Foo {',
      '  bar({ a, b }: { a: number; b: number }) {',
      '    // #region START_DESTR',
      '    return a + b;',
      '    // #endregion END_DESTR',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-58: destructuring at class body level — does not create false method body', () => {
    const src = lines(
      'export class Foo {',
      '  private { a, b } = obj;',
      '  // #region START_AFTER_DESTR',
      '  // #endregion END_AFTER_DESTR',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_AFTER_DESTR'));
  });

  it('AB-59: template literal with ${} inside method — does not affect depth', () => {
    const src = lines(
      'export class Foo {',
      '  bar() {',
      '    const msg = `${1 + 2}`;',
      '    // #region START_TMPL',
      '    console.log(msg);',
      '    // #endregion END_TMPL',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-60: { in comment at class body level — does not affect depth', () => {
    const src = lines(
      'export class Foo {',
      '  // { this is a comment',
      '  // #region START_CMT',
      '  // #endregion END_CMT',
      '}'
    );
    const errors = check(src, 'f.ts');
    // { in comment is stripped, region at class body => ERROR
    assert.ok(hasError(errors, 'START_CMT'));
  });

  it('AB-61: } in comment inside method — does not affect depth', () => {
    const src = lines(
      'export class Foo {',
      '  bar() {',
      '    // } this is a comment',
      '    // #region START_CMT2',
      '    const x = 1;',
      '    // #endregion END_CMT2',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-62: empty method — region "inside" is impossible, adjacent region at class body', () => {
    const src = lines(
      'export class Foo {',
      '  bar() {}',
      '  // #region START_NEXT',
      '  // #endregion END_NEXT',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_NEXT'));
  });

  it('AB-63: abstract method — no body, adjacent region at class body', () => {
    const src = lines(
      'export abstract class Foo {',
      '  abstract bar(): void;',
      '  // #region START_ABS_METHOD',
      '  // #endregion END_ABS_METHOD',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_ABS_METHOD'));
  });

  it('AB-64: method body on next line after signature', () => {
    const src = lines(
      'export class Foo {',
      '  bar()',
      '  {',
      '    // #region START_NEXT_LINE',
      '    return 1;',
      '    // #endregion END_NEXT_LINE',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });

  it('AB-65: class body on next line after class name', () => {
    const src = lines(
      'export class Foo',
      '{',
      '  // #region START_BODY_NEXT',
      '  // #endregion END_BODY_NEXT',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_BODY_NEXT'));
  });

  it('AB-66: generic class', () => {
    const src = lines(
      'export class Foo<T> {',
      '  // #region START_GEN',
      '  // #endregion END_GEN',
      '}'
    );
    const errors = check(src, 'f.ts');
    assert.ok(hasError(errors, 'START_GEN'));
  });

  it('AB-67: generic method', () => {
    const src = lines(
      'export class Foo {',
      '  bar<T>(x: T) {',
      '    // #region START_GEN_M',
      '    return x;',
      '    // #endregion END_GEN_M',
      '  }',
      '}'
    );
    assert.deepStrictEqual(check(src, 'f.ts'), []);
  });
});
