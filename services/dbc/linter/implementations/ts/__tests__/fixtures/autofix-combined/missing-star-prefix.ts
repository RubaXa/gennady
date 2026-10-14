// @file: Fixture — multi-line JSDoc with missing * prefix on middle line (already damaged).
// @spec: DBC-DBC-LINTER
// @consumers: DbcTsLinterTest
/**
   * @purpose Dummy function to test star prefix repair.
   * @param x A param.
 * @returns A result.
 */
export function missingStar(x: string): string {
  return x ?? 'ok';
}
