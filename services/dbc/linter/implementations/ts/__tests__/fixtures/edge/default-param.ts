/**
 * @purpose Function with default-value param.
 * @param [name] The user name.
 * @returns Greeting.
 */
export function defaultParam(name: string = 'world'): string {
  return `Hello ${name}`;
}
