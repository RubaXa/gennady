// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/edge/optional-param.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/**
 * @purpose Function with optional parameter.
 * @param [name] The user name.
 * @returns Greeting.
 */
export function optionalParam(name?: string): string {
  return `Hello ${name ?? 'world'}`;
}
