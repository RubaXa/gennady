// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/edge/default-param.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/**
 * @purpose Function with default-value param.
 * @param [name] The user name.
 * @returns Greeting.
 */
export function defaultParam(name: string = 'world'): string {
  return `Hello ${name}`;
}
