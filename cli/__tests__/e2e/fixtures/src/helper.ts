// @file: Fixture helper for orient command tests.
// @consumers: FixtureConsumer
// @tasks: TSK-60

/**
 * @purpose Fixture helper function for orient discovery.
 * @param value Input string to transform.
 * @returns Uppercase version of the input string.
 */
export function fixtureHelper(value: string): string {
  return value.toUpperCase();
}
