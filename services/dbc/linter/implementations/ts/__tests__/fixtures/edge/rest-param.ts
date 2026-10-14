// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/edge/rest-param.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/**
 * @purpose Function with rest parameter.
 * @param ...args The values to sum.
 * @returns The total.
 */
export function restParam(...args: number[]): number {
  return args.reduce((a, b) => a + b, 0);
}
