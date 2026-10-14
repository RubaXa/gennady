// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/param-missing/function-multiple.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/**
 * @purpose Processes three inputs.
 * @param a First parameter.
 * @returns Result.
 */
export function process(a: string, b: number, c: boolean): string {
  return `${a}-${b}-${c}`;
}
