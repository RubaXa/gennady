/**
 * @purpose Function with rest parameter.
 * @param ...args The values to sum.
 * @returns The total.
 */
export function restParam(...args: number[]): number {
  return args.reduce((a, b) => a + b, 0);
}
