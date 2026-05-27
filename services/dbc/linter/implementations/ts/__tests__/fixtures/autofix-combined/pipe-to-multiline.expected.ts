// @file: Fixture
// @consumers: DbcTsLinterTest
// @tasks: test

/**
 * @purpose Function 2-tag pipe.
 * @param x Input.
 * @returns Result.
 */
export function fn1(x: string): string { return x; }

/**
 * @purpose Const 4-tag pipe.
 * @see A
 * @see B
 * @see C
 * @see D
 */
export const cn1: string = 'ok';

/** @purpose Const 2-tag pipe — stays. | @see {Foo} */
export const cn2: string = 'ok';

/**
   * @purpose Damaged line without star.
   * @param x Input.
   * @returns Result.
 */
export function fn2(x: string): string { return x; }

