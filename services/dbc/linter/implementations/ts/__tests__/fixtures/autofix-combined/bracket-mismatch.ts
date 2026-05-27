/**
 * @purpose Function with default-value param missing brackets.
 * @param name The user name.
 * @returns Greeting.
 */
export function bracketMismatch(name: string = 'world'): string {
  return `Hello ${name}`;
}
