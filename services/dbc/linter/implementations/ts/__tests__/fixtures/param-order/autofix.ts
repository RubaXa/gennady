// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/param-order/autofix.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/**
 * @purpose Order fix.
 * @param b Second.
 * @param a First.
 * @returns Result.
 */
export function autofix(a: string, b: number): string {
  return `${a}${b}`;
}
