// @file: Fixture — multi-line JSDoc with missing * prefix on middle line (already damaged).
// @consumers: DbcTsLinterTest
// @tasks: TSK-21
/**
   * @purpose Dummy function to test star prefix repair.
   * @param x A param.
 * @returns A result.
 */
export function missingStar(x: string): string {
  return x ?? 'ok';
}
