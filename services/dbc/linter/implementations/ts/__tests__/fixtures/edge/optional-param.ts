/**
 * @purpose Function with optional parameter.
 * @param [name] The user name.
 * @returns Greeting.
 */
export function optionalParam(name?: string): string {
  return `Hello ${name ?? 'world'}`;
}
