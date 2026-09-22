// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/param-extra/autofix.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/**
 * @purpose Has two params.
 * @param a First.
 * @param b Second.
 * @param extra Should be removed.
 */
export function autofix(a: string, b: number): void {}
