// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/autofix-combined/all-fixable.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/**
 * @purpose All fixable errors in one function.
 * @returns {string} Result.
 * @param {string} b Second.
 * @param {string} a First.
 * @param extra Not in signature.
 */
export function allFixable(a: string, b: string): string {
  return `${a}${b}`;
}
