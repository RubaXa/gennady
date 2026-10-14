// @file: destructured
// @spec: DBC-DBC-LINTER
// @consumers: test
/**
 * @purpose Destructured params.
 * @returns Result.
 */
export function f15({a, b}: {a: string, b: number}): string { return a + b; }
