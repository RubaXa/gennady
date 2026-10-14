// @file: services/dbc/linter/implementations/ts/__tests__/fixtures/autofix-combined/bracket-mismatch.ts
// @spec: DBC-DBC-LINTER
// @consumers: N/A
/**
 * @purpose Function with default-value param missing brackets.
 * @param name The user name.
 * @returns Greeting.
 */
export function bracketMismatch(name: string = 'world'): string {
  return `Hello ${name}`;
}
