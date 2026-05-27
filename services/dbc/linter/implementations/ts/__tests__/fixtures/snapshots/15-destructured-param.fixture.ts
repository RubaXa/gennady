// @file: destructured
// @consumers: test
/**
 * @purpose Destructured params.
 * @param props.a First.
 * @param props.b Second.
 * @returns Result.
 */
export function f15({a, b}: {a: string, b: number}): string { return a + b; }
