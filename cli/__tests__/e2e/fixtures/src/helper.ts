// @file: Fixture helper for orient command tests.
// @spec: CLI-E2E
// @consumers: FixtureConsumer

/**
 * @purpose Fixture helper function for orient discovery.
 * @param value Input string to transform.
 * @returns Uppercase version of the input string.
 */
export function fixtureHelper(value: string): string {
  return value.toUpperCase();
}
